// Pure game logic (no three.js, no DOM) — unit-tested in tests/logic.test.mjs.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export const DEG = Math.PI / 180;
export const wrapAngle = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
// exponential approach that is frame-rate independent
export const damp = (a, b, rate, dt) => b + (a - b) * Math.exp(-rate * dt);

// Damage with linear falloff between near and far range.
export function falloff(w, dist, tierMul = 1) {
  const [d0, d1] = w.dmg, [r0, r1] = w.range;
  const t = clamp((dist - r0) / Math.max(1e-3, r1 - r0), 0, 1);
  return lerp(d0, d1, t) * tierMul;
}
export function zoneMul(w, zone) { return zone === 'head' ? w.head : zone === 'limb' ? w.limb : 1; }

// Current spread cone (degrees, half-angle) from weapon state.
export function spreadDeg(w, s) {
  const sp = w.spread;
  let base = lerp(sp.hip, sp.ads, s.ads);
  if (s.moving) base += sp.move * (1 - s.ads * 0.7);
  if (!s.grounded) base += sp.air;
  if (s.crouch) base *= 0.78;
  if (s.sliding) base += sp.move * 0.6;
  return base + s.bloom * (1 - s.ads * 0.55);
}

// Ray vs AABB (slab). Returns entry t or -1. Sets out normal [nx,ny,nz].
export function rayAABB(ox, oy, oz, dx, dy, dz, mn, mx, maxT, nOut) {
  let tmin = 0, tmax = maxT, axis = -1, sgn = 0;
  const o = [ox, oy, oz], d = [dx, dy, dz];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) { if (o[a] < mn[a] || o[a] > mx[a]) return -1; continue; }
    const inv = 1 / d[a];
    let t1 = (mn[a] - o[a]) * inv, t2 = (mx[a] - o[a]) * inv, s = -1;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
    if (t1 > tmin) { tmin = t1; axis = a; sgn = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  if (axis < 0) return -1; // origin inside box: ignore (lets rays start in contact)
  if (nOut) { nOut[0] = 0; nOut[1] = 0; nOut[2] = 0; nOut[axis] = sgn; }
  return tmin;
}

// Ray vs capsule segment (a→b, radius r). Returns t or -1. Direction must be normalized.
export function rayCapsule(ox, oy, oz, dx, dy, dz, ax, ay, az, bx, by, bz, r, maxT) {
  // closest approach between ray and segment, then sphere test at that point (good enough for hitboxes)
  const ux = bx - ax, uy = by - ay, uz = bz - az;
  const wx = ox - ax, wy = oy - ay, wz = oz - az;
  const a = dx * dx + dy * dy + dz * dz, b = dx * ux + dy * uy + dz * uz, c = ux * ux + uy * uy + uz * uz;
  const d = dx * wx + dy * wy + dz * wz, e = ux * wx + uy * wy + uz * wz;
  const den = a * c - b * b;
  let sc, tc;
  if (den < 1e-8) { sc = 0; tc = c > 0 ? e / c : 0; } else { sc = (b * e - c * d) / den; tc = (a * e - b * d) / den; }
  tc = clamp(tc, 0, 1);
  // recompute ray param for the clamped segment point
  const px = ax + ux * tc, py = ay + uy * tc, pz = az + uz * tc;
  return raySphere(ox, oy, oz, dx, dy, dz, px, py, pz, r, maxT);
}
export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r, maxT) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  if (d2 > r * r) return -1;
  const thc = Math.sqrt(r * r - d2);
  let t = tca - thc; if (t < 0) t = tca + thc;
  return t >= 0 && t <= maxT ? t : -1;
}
// Distance from point to segment (for near-miss / suppression)
export function pointSegDist(px, py, pz, ax, ay, az, bx, by, bz) {
  const ux = bx - ax, uy = by - ay, uz = bz - az;
  const l2 = ux * ux + uy * uy + uz * uz;
  const t = l2 > 0 ? clamp(((px - ax) * ux + (py - ay) * uy + (pz - az) * uz) / l2, 0, 1) : 0;
  const x = ax + ux * t - px, y = ay + uy * t - py, z = az + uz * t - pz;
  return Math.sqrt(x * x + y * y + z * z);
}
// Segment passes through sphere (smoke blocks vision)
export function segHitsSphere(ax, ay, az, bx, by, bz, cx, cy, cz, r) { return pointSegDist(cx, cy, cz, ax, ay, az, bx, by, bz) < r; }

// Storm ring schedule for Dropzone. Returns phases [{wait, shrink, r, dps}] from a start radius.
export function stormPhases(r0, speed = 1) {
  const rs = [r0, r0 * 0.62, r0 * 0.38, r0 * 0.2, r0 * 0.09, 0];
  const waits = [55, 45, 38, 30, 25];
  const shrinks = [40, 34, 28, 22, 26];
  const dps = [1, 2, 4, 7, 10];
  return waits.map((w, i) => ({ wait: w / speed, shrink: shrinks[i] / speed, r0: rs[i], r1: rs[i + 1], dps: dps[i] }));
}
// Next circle centre: random point such that the new circle stays inside the old one.
export function nextCenter(cx, cz, r0, r1, rnd) {
  const a = rnd() * Math.PI * 2, d = rnd() * Math.max(0, r0 - r1);
  return [cx + Math.cos(a) * d, cz + Math.sin(a) * d];
}
// Storm state at time t: {r, cx, cz, phase, timeLeft, shrinking, dps}
export function stormAt(phases, centers, t) {
  let acc = 0;
  for (let i = 0; i < phases.length; i++) {
    const p = phases[i], [ax, az] = centers[i], [bx, bz] = centers[i + 1] || centers[i];
    if (t < acc + p.wait) return { r: p.r0, cx: ax, cz: az, nx: bx, nz: bz, nr: p.r1, phase: i, timeLeft: acc + p.wait - t, shrinking: false, dps: p.dps };
    acc += p.wait;
    if (t < acc + p.shrink) {
      const k = (t - acc) / p.shrink;
      return { r: lerp(p.r0, p.r1, k), cx: lerp(ax, bx, k), cz: lerp(az, bz, k), nx: bx, nz: bz, nr: p.r1, phase: i, timeLeft: acc + p.shrink - t, shrinking: true, dps: p.dps };
    }
    acc += p.shrink;
  }
  const last = centers[centers.length - 1];
  return { r: 0, cx: last[0], cz: last[1], nx: last[0], nz: last[1], nr: 0, phase: phases.length, timeLeft: 0, shrinking: false, dps: 12 };
}

// Cover point score for an AI (higher is better). Inputs are plain numbers so it is testable.
// protects: threat is on the obstacle side; exposedToPeek: can shoot from the peek pose.
export function coverScore({ distSelf, distThreat, protects, canPeek, occupied, prefMin = 10, prefMax = 30, flankBonus = 0, crowd = 0 }) {
  if (occupied || !protects) return -1e9;
  let s = 50;
  s -= distSelf * 1.6;
  if (distThreat < prefMin) s -= (prefMin - distThreat) * 4;
  else if (distThreat > prefMax) s -= (distThreat - prefMax) * 1.5;
  if (canPeek) s += 22;
  s += flankBonus - crowd * 18;
  return s;
}

// XP for a match summary (no loot, no streak punishment — just a record of play).
export function matchXP({ kills = 0, heads = 0, objectives = 0, accuracy = 0, won = false, mult = 1 }) {
  return Math.round((kills * 100 + heads * 50 + objectives * 250 + Math.round(accuracy * 300) + (won ? 500 : 150)) * mult);
}

// Ballistic launch: velocity to hit (dx,dy,dz) with speed v under gravity g, low arc. null if out of range.
export function lobVelocity(dx, dy, dz, v, g) {
  const h = Math.hypot(dx, dz); if (h < 0.01) return [0, v, 0];
  const v2 = v * v, disc = v2 * v2 - g * (g * h * h + 2 * dy * v2);
  if (disc < 0) return null;
  const ang = Math.atan((v2 - Math.sqrt(disc)) / (g * h));
  const c = Math.cos(ang) * v;
  return [dx / h * c, Math.sin(ang) * v, dz / h * c];
}

// Seeded RNG (mulberry32) for deterministic layouts / loot.
export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Loot tier roll weighted by source (floor < chest).
export function rollTier(r, chest = false) {
  const w = chest ? [0, 0.35, 0.35, 0.2, 0.1] : [0.42, 0.32, 0.16, 0.07, 0.03];
  let x = r(), i = 0; for (; i < w.length - 1; i++) { if ((x -= w[i]) < 0) break; } return i;
}
