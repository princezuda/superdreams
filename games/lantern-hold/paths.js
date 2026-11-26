// Lantern Hold — road geometry: centripetal Catmull-Rom → uniform arc-length samples, lookups, build-spot generation.
// Pure maths (no three.js) so node tests can prove pathing.

export const STEP = 0.2; // arc-length spacing of samples

function cr(p0, p1, p2, p3, t) { // centripetal Catmull-Rom (alpha 0.5) between p1 and p2
  const d = (a, b) => Math.max(1e-4, Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]), 0.5));
  const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
  const tt = t1 + (t2 - t1) * t;
  const L = (a, b, ta, tb) => [((tb - tt) * a[0] + (tt - ta) * b[0]) / (tb - ta), ((tb - tt) * a[1] + (tt - ta) * b[1]) / (tb - ta)];
  const A1 = L(p0, p1, t0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
  const B1 = L(A1, A2, t0, t2), B2 = L(A2, A3, t1, t3);
  return L(B1, B2, t1, t2);
}

export function buildPath(ctrl) {
  const pts = ctrl.map((p) => [p[0], p[1]]);
  const ext = [[2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]], ...pts, [2 * pts.at(-1)[0] - pts.at(-2)[0], 2 * pts.at(-1)[1] - pts.at(-2)[1]]];
  const dense = [];
  for (let i = 1; i < ext.length - 2; i++) for (let k = 0; k < 40; k++) dense.push(cr(ext[i - 1], ext[i], ext[i + 1], ext[i + 2], k / 40));
  dense.push(pts.at(-1));
  // uniform resample by arc length
  const xs = [dense[0][0]], zs = [dense[0][1]];
  let acc = 0, need = STEP;
  for (let i = 1; i < dense.length; i++) {
    let [ax, az] = dense[i - 1]; const [bx, bz] = dense[i];
    let seg = Math.hypot(bx - ax, bz - az);
    while (acc + seg >= need) {
      const f = (need - acc) / seg; ax += (bx - ax) * f; az += (bz - az) * f;
      xs.push(ax); zs.push(az); seg = Math.hypot(bx - ax, bz - az); acc = need; need += STEP;
    }
    acc += seg;
  }
  const n = xs.length;
  const len = (n - 1) * STEP + Math.hypot(pts.at(-1)[0] - xs[n - 1], pts.at(-1)[1] - zs[n - 1]);
  xs.push(pts.at(-1)[0]); zs.push(pts.at(-1)[1]);
  return { xs: Float32Array.from(xs), zs: Float32Array.from(zs), n: xs.length, len, ctrl: pts };
}

// position + tangent at arc length s (clamped); out = {x, z, tx, tz}
export function posAt(P, s, out = {}) {
  const f = Math.max(0, Math.min(s, P.len)) / STEP;
  let i = Math.floor(f); if (i >= P.n - 1) i = P.n - 2;
  const k = Math.min(1, f - i);
  const x0 = P.xs[i], z0 = P.zs[i], x1 = P.xs[i + 1], z1 = P.zs[i + 1];
  out.x = x0 + (x1 - x0) * k; out.z = z0 + (z1 - z0) * k;
  const dl = Math.hypot(x1 - x0, z1 - z0) || 1; out.tx = (x1 - x0) / dl; out.tz = (z1 - z0) / dl;
  return out;
}

export function nearestOnPath(P, x, z) {
  let best = 1e9, bi = 0;
  for (let i = 0; i < P.n; i++) { const d = (P.xs[i] - x) ** 2 + (P.zs[i] - z) ** 2; if (d < best) { best = d; bi = i; } }
  return { d: Math.sqrt(best), s: Math.min(bi * STEP, P.len), x: P.xs[bi], z: P.zs[bi] };
}
export function distToPaths(paths, x, z) { let m = 1e9; for (const P of paths) m = Math.min(m, nearestOnPath(P, x, z).d); return m; }

// Deterministic build-spot generation: candidates either side of the road, scored by how much road they cover.
export const BOUNDS = { x: 13.0, z: 8.8 };
export function genPads(paths, count, { lakes = [], lavas = [], hold = null, reach = 3.9 } = {}) {
  const cands = [];
  const starts = paths.map((P) => [P.xs[0], P.zs[0]]);
  for (const P of paths) {
    for (let s = 1.5; s < P.len - 1; s += 0.8) {
      const p = posAt(P, s);
      for (const side of [-1, 1]) for (const off of [1.85, 2.3, 2.8]) {
        const x = p.x - p.tz * off * side, z = p.z + p.tx * off * side;
        if (Math.abs(x) > BOUNDS.x || Math.abs(z) > BOUNDS.z) continue;
        if (distToPaths(paths, x, z) < 1.65) continue;
        if (starts.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 3.2)) continue;
        if (hold && Math.hypot(hold[0] - x, hold[1] - z) < 3.0) continue;
        if ([...lakes, ...lavas].some((l) => Math.hypot(l.x - x, l.z - z) < l.r + 0.9)) continue;
        cands.push({ x, z });
      }
    }
  }
  // coverage score: road samples within reach (all paths), weighted so later road counts a bit more (last line of defence)
  for (const c of cands) {
    let sc = 0;
    for (const P of paths) for (let i = 0; i < P.n; i += 2) { const d = Math.hypot(P.xs[i] - c.x, P.zs[i] - c.z); if (d < reach) sc += 1 + 0.3 * (i / P.n); }
    c.score = sc;
  }
  cands.sort((a, b) => b.score - a.score || a.x - b.x || a.z - b.z);
  const out = [];
  for (const c of cands) {
    if (out.length >= count) break;
    if (out.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < 2.55)) continue;
    out.push({ x: +c.x.toFixed(2), z: +c.z.toFixed(2), score: +c.score.toFixed(1) });
  }
  return out;
}

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
