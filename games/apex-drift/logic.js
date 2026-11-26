// Apex Drift — pure race logic (no three.js; node-tested): spline track sampling + projection, checkpoint/lap
// tracking, race distance + ranking, ghost record/replay, catch-up (rubber band), grand-prix standings.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ---------------------------------------------------------------- track
// Centripetal Catmull-Rom (Barry–Goldman) on [x,z,y,w] — no overshoot/cusps with uneven control spacing.
function crPoint(p0, p1, p2, p3, u, out) {
  const d = (a, b) => Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-3, 0.5);
  const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
  const t = t1 + (t2 - t1) * u;
  for (let k = 0; k < 4; k++) {
    const A1 = ((t1 - t) * p0[k] + (t - t0) * p1[k]) / (t1 - t0);
    const A2 = ((t2 - t) * p1[k] + (t - t1) * p2[k]) / (t2 - t1);
    const A3 = ((t3 - t) * p2[k] + (t - t2) * p3[k]) / (t3 - t2);
    const B1 = ((t2 - t) * A1 + (t - t0) * A2) / (t2 - t0);
    const B2 = ((t3 - t) * A2 + (t - t1) * A3) / (t3 - t1);
    out[k] = ((t2 - t) * B1 + (t - t1) * B2) / (t2 - t1);
  }
  return out;
}

/** Build a uniformly sampled closed track. Returns typed arrays indexed by sample i (spacing ds ≈ step metres). */
export function buildTrack(def, { reverse = false, step = 2 } = {}) {
  const S = def.scale ?? 1;
  let pts = def.points.map((p) => [p[0] * S, p[1] * S, p[2], p[3] ?? def.width]);
  if (reverse) {
    // drive the loop backwards but keep the start/finish straight where it is (start = old point 0)
    pts = [pts[0], ...pts.slice(1).reverse()];
  }
  const m = pts.length, SUB = 48, dense = [];
  for (let i = 0; i < m; i++) {
    const p0 = pts[(i - 1 + m) % m], p1 = pts[i], p2 = pts[(i + 1) % m], p3 = pts[(i + 2) % m];
    for (let k = 0; k < SUB; k++) dense.push(crPoint(p0, p1, p2, p3, k / SUB, [0, 0, 0, 0]));
  }
  const cum = [0];
  for (let i = 1; i <= dense.length; i++) { const a = dense[i - 1], b = dense[i % dense.length]; cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const L0 = cum[dense.length], n = Math.round(L0 / step), ds = L0 / n;
  const T = { n, L: L0, ds, x: new Float32Array(n), z: new Float32Array(n), y: new Float32Array(n), w: new Float32Array(n),
    tx: new Float32Array(n), tz: new Float32Array(n), nx: new Float32Array(n), nz: new Float32Array(n), k: new Float32Array(n),
    grade: new Float32Array(n), line: new Float32Array(n), id: def.id, reverse };
  let j = 0;
  for (let i = 0; i < n; i++) {
    const s = i * ds; while (cum[j + 1] < s) j++;
    const a = dense[j], b = dense[(j + 1) % dense.length], f = (s - cum[j]) / Math.max(1e-6, cum[j + 1] - cum[j]);
    T.x[i] = a[0] + (b[0] - a[0]) * f; T.z[i] = a[1] + (b[1] - a[1]) * f; T.y[i] = a[2] + (b[2] - a[2]) * f; T.w[i] = a[3] + (b[3] - a[3]) * f;
  }
  for (let i = 0; i < n; i++) {
    const p = (i - 1 + n) % n, q = (i + 1) % n;
    let tx = T.x[q] - T.x[p], tz = T.z[q] - T.z[p]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    T.tx[i] = tx; T.tz[i] = tz; T.nx[i] = -tz; T.nz[i] = tx; // right-hand normal (d > 0 = right of the driving line)
    T.grade[i] = (T.y[q] - T.y[p]) / (2 * ds);
  }
  // signed curvature (+ = right-hander), lightly smoothed
  const kr = new Float32Array(n);
  for (let i = 0; i < n; i++) { const p = (i - 2 + n) % n, q = (i + 2) % n; kr[i] = ((T.tx[q] - T.tx[p]) * T.nx[i] + (T.tz[q] - T.tz[p]) * T.nz[i]) / (4 * ds); }
  smoothInto(kr, T.k, 3);
  // racing line: towards the inside of corners, from a wide curvature average (lateral metres, + = right)
  const kw = new Float32Array(n); smoothInto(T.k, kw, Math.round(26 / ds));
  for (let i = 0; i < n; i++) T.line[i] = T.w[i] * 0.62 * Math.tanh(kw[i] * 60);
  return T;
}
function smoothInto(src, dst, r) {
  const n = src.length; let acc = 0;
  for (let k = -r; k <= r; k++) acc += src[(k + n) % n];
  for (let i = 0; i < n; i++) { dst[i] = acc / (2 * r + 1); acc += src[(i + r + 1) % n] - src[(i - r + n) % n]; }
}

/** Project (x,z) onto the track. hint = last sample index (local search, safe near parallel sections); -1 = full scan. */
export function locate(T, x, z, hint, out = {}) {
  const n = T.n; let best = -1, bd = Infinity;
  if (hint < 0) { for (let i = 0; i < n; i++) { const dx = x - T.x[i], dz = z - T.z[i], d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } } }
  else {
    const W = 24;
    for (let o = -W; o <= W; o++) { const i = (hint + o + n) % n; const dx = x - T.x[i], dz = z - T.z[i], d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } }
    if (bd > 60 * 60) return locate(T, x, z, -1, out); // teleported / lost: rescan
  }
  let i0 = best, along = (x - T.x[i0]) * T.tx[i0] + (z - T.z[i0]) * T.tz[i0];
  if (along < 0) { i0 = (best - 1 + n) % n; along = (x - T.x[i0]) * T.tx[i0] + (z - T.z[i0]) * T.tz[i0]; }
  const i1 = (i0 + 1) % n, f = clamp(along / T.ds, 0, 1);
  const px = T.x[i0] + (T.x[i1] - T.x[i0]) * f, pz = T.z[i0] + (T.z[i1] - T.z[i0]) * f;
  let tx = T.tx[i0] + (T.tx[i1] - T.tx[i0]) * f, tz = T.tz[i0] + (T.tz[i1] - T.tz[i0]) * f; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
  out.i = i0; out.f = f; out.s = (i0 + f) * T.ds; out.tx = tx; out.tz = tz; out.nx = -tz; out.nz = tx;
  out.d = (x - px) * out.nx + (z - pz) * out.nz;
  out.y = T.y[i0] + (T.y[i1] - T.y[i0]) * f; out.w = T.w[i0] + (T.w[i1] - T.w[i0]) * f; out.grade = T.grade[i0];
  return out;
}

/** World pose at track distance s with lateral offset d. */
export function poseAt(T, s, d = 0) {
  const n = T.n; s = ((s % T.L) + T.L) % T.L; const fi = s / T.ds, i0 = Math.floor(fi) % n, i1 = (i0 + 1) % n, f = fi - Math.floor(fi);
  const x = T.x[i0] + (T.x[i1] - T.x[i0]) * f, z = T.z[i0] + (T.z[i1] - T.z[i0]) * f, y = T.y[i0] + (T.y[i1] - T.y[i0]) * f;
  const tx = T.tx[i0], tz = T.tz[i0];
  return { x: x - tz * d, z: z + tx * d, y, yaw: Math.atan2(tx, tz), i: i0, s };
}

/** Minimum distance between non-neighbouring parts of the loop (self-intersection / overlap guard). */
export function minSeparation(T, skipMetres = 120) {
  const skip = Math.round(skipMetres / T.ds); let m = Infinity, at = null;
  for (let i = 0; i < T.n; i += 2) for (let j = i + skip; j < T.n; j += 2) {
    if (T.n - (j - i) < skip) continue;
    const d = Math.hypot(T.x[i] - T.x[j], T.z[i] - T.z[j]); if (d < m) { m = d; at = [i, j]; }
  }
  return { min: m, at };
}

// ---------------------------------------------------------------- checkpoints + laps
// The loop is split into N sectors; sector 0 starts at the start/finish line. A lap only counts once every sector
// was entered in order, so cutting across the infield or reversing over the line never gains a lap.
export function createLap(N = 12) { return { N, lap: 0, next: 0, sec: N - 1, lapStart: 0, prevStart: 0, times: [], best: Infinity, finished: false, finishTime: 0 }; }

/** Feed the car's track distance each tick. Returns 'start' | 'lap' | 'back' | 'sector' | null. */
export function updateLap(st, s, L, t) {
  const sec = Math.min(st.N - 1, Math.max(0, Math.floor((s / L) * st.N)));
  if (sec === st.sec) return null;
  const prev = st.sec; st.sec = sec;
  if (prev === st.N - 1 && sec === 0) { // forwards over the line
    if (st.next === 0 || st.next === st.N) {
      let ev = 'start';
      if (st.lap > 0) { const lt = t - st.lapStart; st.times.push(lt); if (lt < st.best) st.best = lt; ev = 'lap'; }
      st.lap++; st.prevStart = st.lapStart; st.lapStart = t; st.next = 1; return ev;
    }
    return null;
  }
  if (prev === 0 && sec === st.N - 1) { // backwards over the line: undo
    if (st.next === 1) {
      st.lap--; st.lapStart = st.prevStart;
      if (st.lap >= 1) { const lt = st.times.pop(); st.next = st.N; st.best = st.times.length ? Math.min(...st.times) : Infinity; void lt; } else st.next = 0;
      return 'back';
    }
    return null;
  }
  if (sec === st.next && st.next > 0 && st.next < st.N) { st.next++; return 'sector'; }
  if (sec === st.next - 2 && st.next > 1) st.next--; // reversing through a sector
  return null;
}

/** Total race distance in metres (negative before the first crossing). Capped at the next unentered sector. */
export function raceDistance(st, s, L) {
  if (st.lap === 0) return s > L * 0.5 ? s - L : Math.min(s, 0);
  const cap = st.next >= st.N ? L : (st.next * L) / st.N;
  return (st.lap - 1) * L + Math.min(s, cap);
}

/** Order racers: finishers by finish time, then everyone else by race distance. Returns a new array. */
export function rank(racers) {
  return racers.slice().sort((a, b) => {
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    if (a.finished) return -1; if (b.finished) return 1;
    return b.dist - a.dist;
  });
}

// ---------------------------------------------------------------- catch-up (rubber band), kept subtle and fair
/**
 * Speed multiplier for an AI car. gap = playerDist − aiDist (m): > 0 the AI is behind the player.
 * Trailing AI may gain up to +strength; leading AI eases off by up to −1.2·strength. The catch-up boost fades out
 * over the last 35% of the race, so nobody gets a magic surge at the finish; it never changes cornering grip.
 */
export function catchUp(gap, strength, raceFrac) {
  if (!strength) return 1;
  const g = clamp(gap / 140, -1, 1);
  if (g >= 0) { const fade = raceFrac > 0.65 ? clamp(1 - (raceFrac - 0.65) / 0.35, 0, 1) : 1; return 1 + g * strength * fade; }
  return 1 + g * strength * 1.2;
}

// ---------------------------------------------------------------- ghosts
export const GHOST_DT = 0.1;
export function ghostRecorder() { return { t: -1, k: 0, f: [], p: null }; }
/** Record a pose every GHOST_DT seconds of lap time (call every tick with the lap clock). Each slot is interpolated
 *  between the two ticks that straddle it, so replay matches the real line even at 60 m/s. */
export function ghostPush(g, t, x, y, z, yaw) {
  while (t >= g.k * GHOST_DT - 1e-9) {
    const ts = g.k * GHOST_DT, p = g.p;
    if (!p || t <= g.t) g.f.push(x, y, z, yaw);
    else { const f = Math.min(1, Math.max(0, (ts - g.t) / (t - g.t))); let dy = yaw - p[3]; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); g.f.push(p[0] + (x - p[0]) * f, p[1] + (y - p[1]) * f, p[2] + (z - p[2]) * f, p[3] + dy * f); }
    g.k++;
  }
  g.t = t; const q = g.p || (g.p = [0, 0, 0, 0]); q[0] = x; q[1] = y; q[2] = z; q[3] = yaw;
}
/** Sample a recorded lap at time t (interpolated, shortest-arc yaw). Returns false past the end. */
export function ghostSample(frames, t, out) {
  const N = frames.length / 4; if (N < 2) return false;
  const fi = t / GHOST_DT; let i = Math.floor(fi); if (i < 0) i = 0;
  if (i >= N - 1) { const k = (N - 1) * 4; out.x = frames[k]; out.y = frames[k + 1]; out.z = frames[k + 2]; out.yaw = frames[k + 3]; return false; }
  const f = fi - i, a = i * 4, b = a + 4;
  out.x = frames[a] + (frames[b] - frames[a]) * f; out.y = frames[a + 1] + (frames[b + 1] - frames[a + 1]) * f; out.z = frames[a + 2] + (frames[b + 2] - frames[a + 2]) * f;
  let dy = frames[b + 3] - frames[a + 3]; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); out.yaw = frames[a + 3] + dy * f;
  return true;
}
/** Compact, delta-encoded integer form for localStorage (cm, milliradians). */
export function encodeGhost(frames, lapTime) {
  const q = [], last = [0, 0, 0, 0];
  for (let i = 0; i < frames.length; i++) { const k = i % 4, v = Math.round(frames[i] * (k === 3 ? 1000 : 100)); q.push(v - last[k]); last[k] = v; }
  return { v: 1, dt: GHOST_DT, lap: lapTime, q };
}
export function decodeGhost(o) {
  if (!o || o.v !== 1 || !Array.isArray(o.q)) return null;
  const f = new Float32Array(o.q.length), acc = [0, 0, 0, 0];
  for (let i = 0; i < o.q.length; i++) { const k = i % 4; acc[k] += o.q[i]; f[i] = acc[k] / (k === 3 ? 1000 : 100); }
  return { frames: f, lap: o.lap };
}

// ---------------------------------------------------------------- grand prix
export function awardPoints(standings, order, table) {
  order.forEach((id, i) => { const s = standings[id] || (standings[id] = { pts: 0, best: 99, results: [] }); s.pts += table[i] ?? 0; s.best = Math.min(s.best, i + 1); s.results.push(i + 1); });
  return standings;
}
/** Sort ids by points, then best single finish, then most recent result. */
export function standingsOrder(standings) {
  return Object.keys(standings).sort((a, b) => {
    const A = standings[a], B = standings[b];
    return B.pts - A.pts || A.best - B.best || (A.results.at(-1) ?? 9) - (B.results.at(-1) ?? 9);
  });
}

export const fmtTime = (t) => {
  if (!isFinite(t)) return '--:--.---';
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(3)}`;
};
