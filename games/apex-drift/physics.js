// Apex Drift — arcade car physics + AI driver (pure, node-tested). Every car — player, rival, autopilot — runs the
// same model with the same inputs {throttle, brake, steer, drift, boost}; AI only differs in how it chooses inputs.
import { locate, updateLap, createLap, raceDistance } from './logic.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const SHOULDER = 3.2; // run-off between road edge and barrier (m)
export const CAR_HALF_W = 0.95, CAR_HALF_L = 2.15;

export const BASE = { vmax: 61, accel: 21, brake: 34, latMax: 27, grip: 11, driftGrip: 1.9, boostAccel: 15, boostTop: 1.24, boostUse: 0.34 };
export const TIERS = [0, 0.75, 1.55, 2.5]; // drift seconds to reach spark tier 1/2/3
const SLING = [0, 0.28, 0.5, 0.8];        // slingshot boost seconds when a drift of that tier is released

export function createCar(opts = {}) {
  return {
    id: opts.id ?? 'car', name: opts.name ?? 'Car', isPlayer: !!opts.isPlayer,
    x: 0, y: 0, z: 0, yaw: 0, vx: 0, vz: 0, yawRate: 0, steer: 0, vF: 0, vR: 0,
    drift: 0, driftT: 0, driftAng: 0, tier: 0, boost: opts.boost ?? 0.3, boostT: 0, boosting: false,
    offroad: false, wall: 0, hop: 0, draft: 0, rubber: 1, stats: Object.assign({}, BASE, opts.stats || {}),
    loc: { i: -1 }, lap: createLap(opts.sectors ?? 12), dist: 0, finished: false, finishTime: 0, stuckT: 0, revT: 0,
    ai: opts.ai || null, events: [], wrongT: 0, lastHitT: -9,
  };
}

export function placeCar(c, T, pose) {
  c.x = pose.x; c.z = pose.z; c.y = pose.y; c.yaw = pose.yaw; c.vx = c.vz = 0; c.yawRate = 0; c.steer = 0; c.drift = 0; c.driftT = 0; c.boostT = 0;
  locate(T, c.x, c.z, -1, c.loc);
}

export const driftTier = (t) => (t >= TIERS[3] ? 3 : t >= TIERS[2] ? 2 : t >= TIERS[1] ? 1 : 0);

/** Advance one car by dt. env: {T, rubber, time}. Pushes events ({type,...}) onto c.events. */
export function stepCar(c, inp, T, dt, env = {}) {
  const st = c.stats;
  let fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), rx = -fz, rz = fx;
  let vF = c.vx * fx + c.vz * fz;
  const spd = Math.abs(vF);
  // steering: quick to centre, a touch slower to wind on
  const sIn = clamp(inp.steer || 0, -1, 1);
  c.steer += (sIn - c.steer) * Math.min(1, dt * (Math.abs(sIn) < Math.abs(c.steer) ? 12 : 8));
  // drift: hold drift + steer at speed. Release pays a slingshot boost by tier.
  if (inp.drift && !c.drift && Math.abs(c.steer) > 0.22 && vF > 13) { c.drift = Math.sign(c.steer); c.driftT = 0; c.hop = 1; c.tier = 0; c.events.push({ type: 'driftStart' }); }
  if (c.drift && (!inp.drift || vF < 8)) endDrift(c, vF >= 8);
  if (c.drift) {
    c.driftT += dt; const tr = driftTier(c.driftT);
    if (tr !== c.tier) { c.tier = tr; c.events.push({ type: 'tier', tier: tr }); }
  }
  // yaw
  const boosting = (inp.boost && c.boost > 0.005) || c.boostT > 0;
  let target;
  if (c.drift) {
    const tight = clamp(0.6 + 0.4 * c.drift * c.steer, 0.2, 1); // steer into the drift = tighter
    target = c.drift * tight * Math.min(2.2, (st.latMax * 1.5) / Math.max(spd, 6));
  } else target = c.steer * Math.min(1, spd / 5) * Math.min(1.9, st.latMax / Math.max(spd, 4)) * (vF < -0.5 ? -1 : 1);
  c.yawRate += (target - c.yawRate) * Math.min(1, dt * (c.drift ? 6 : 9));
  c.yaw -= c.yawRate * dt; // positive steer = right = clockwise from above
  fx = Math.sin(c.yaw); fz = Math.cos(c.yaw); rx = -fz; rz = fx;
  vF = c.vx * fx + c.vz * fz; let vR = c.vx * rx + c.vz * rz;
  // lateral grip
  const grip = c.drift ? st.driftGrip : c.offroad ? st.grip * 0.45 : st.grip;
  vR *= Math.exp(-grip * dt);
  // longitudinal
  const rub = c.rubber * (1 + c.draft * 0.035);
  const vmax = st.vmax * rub * (c.offroad ? 0.6 : 1) * (boosting ? st.boostTop : 1);
  const thr = clamp(inp.throttle || 0, 0, 1), brk = clamp(inp.brake || 0, 0, 1);
  let a = 0;
  if (thr > 0 && vF < vmax) { const r = Math.max(0, vF) / vmax; a += st.accel * rub * thr * (1 - r * r * 0.92) * (vF < 0 ? 1.6 : 1); }
  if (boosting && vF < vmax) a += st.boostAccel;
  if (brk > 0) { if (vF > 0.5) a -= st.brake * brk; else if (vF > -14) a -= 11 * brk; }
  if (thr === 0 && brk === 0) a -= Math.sign(vF) * Math.min(Math.abs(vF) / Math.max(dt, 1e-3), 3.2);
  a -= vF * Math.abs(vF) * 0.0011;               // aero drag
  if (c.offroad) a -= vF * 0.9;                  // grass / sand / snow drag
  if (c.drift) a -= Math.abs(vR) * 0.32;         // drift scrubs a little speed
  vF += a * dt;
  if (vF > vmax) vF += (vmax - vF) * Math.min(1, dt * 1.6);
  // boost meter
  if (boosting) { if (c.boostT > 0) c.boostT = Math.max(0, c.boostT - dt); else c.boost = Math.max(0, c.boost - st.boostUse * dt); }
  if (boosting !== c.boosting) { c.boosting = boosting; c.events.push({ type: boosting ? 'boostOn' : 'boostOff' }); }
  if (c.drift && spd > 18) c.boost = Math.min(1, c.boost + dt * 0.11 * (0.6 + Math.min(1, Math.abs(c.driftAng) / 0.35)) * (1 + c.tier * 0.25));
  if (c.draft > 0.3) c.boost = Math.min(1, c.boost + dt * 0.035 * c.draft);
  c.vx = fx * vF + rx * vR; c.vz = fz * vF + rz * vR; c.vF = vF; c.vR = vR;
  c.driftAng = Math.atan2(vR, Math.max(Math.abs(vF), 1));
  c.x += c.vx * dt; c.z += c.vz * dt;
  c.hop = Math.max(0, c.hop - dt * 5);
  // track projection, barriers, run-off
  const L = locate(T, c.x, c.z, c.loc.i, c.loc);
  const lim = L.w + SHOULDER - CAR_HALF_W;
  c.wall = Math.max(0, c.wall - dt * 3);
  if (Math.abs(L.d) > lim) {
    const sg = Math.sign(L.d), push = Math.abs(L.d) - lim;
    c.x -= L.nx * push * sg; c.z -= L.nz * push * sg; L.d = sg * lim;
    const vn = (c.vx * L.nx + c.vz * L.nz) * sg;
    if (vn > 0) {
      c.vx -= L.nx * sg * vn * 1.3; c.vz -= L.nz * sg * vn * 1.3;
      const keep = 1 - Math.min(0.3, vn * 0.018); c.vx *= keep; c.vz *= keep;
      // align with the barrier (whichever tangent direction is closer to the current heading)
      let ty = Math.atan2(L.tx, L.tz); let dyaw = Math.atan2(Math.sin(ty - c.yaw), Math.cos(ty - c.yaw));
      if (Math.abs(dyaw) > Math.PI / 2) { ty += Math.PI; dyaw = Math.atan2(Math.sin(ty - c.yaw), Math.cos(ty - c.yaw)); }
      c.yaw += dyaw * Math.min(0.5, vn * 0.05); c.yawRate *= 0.4;
      if (c.drift && vn > 4) endDrift(c, false);
      if (vn > 1.5 && (env.time ?? 0) - c.lastHitT > 0.25) { c.lastHitT = env.time ?? 0; c.events.push({ type: 'wall', impact: vn, side: sg }); }
      c.wall = Math.min(1, c.wall + vn * 0.08);
    }
  }
  c.offroad = Math.abs(L.d) > L.w + 0.35;
  c.y = L.y;
  // wrong way
  const along = (c.vx * L.tx + c.vz * L.tz), headAlong = fx * L.tx + fz * L.tz;
  c.wrongT = headAlong < -0.35 && along < -3 ? c.wrongT + dt : Math.max(0, c.wrongT - dt * 2);
  // laps
  const ev = updateLap(c.lap, L.s, T.L, env.time ?? 0);
  if (ev) c.events.push({ type: ev, lap: c.lap.lap, time: c.lap.times.at(-1) });
  c.dist = raceDistance(c.lap, L.s, T.L);
  return c;
}

function endDrift(c, reward) {
  const tier = c.tier;
  if (reward && tier > 0) { c.boostT = Math.max(c.boostT, SLING[tier]); c.events.push({ type: 'sling', tier }); }
  c.events.push({ type: 'driftEnd', tier, t: c.driftT });
  c.drift = 0; c.driftT = 0; c.tier = 0;
}

/** Car-vs-car: each car is two circles (front/back). Pushes apart, trades a bit of momentum. */
export function collideCars(cars, time = 0) {
  const R = 1.05, O = 1.15;
  for (let a = 0; a < cars.length; a++) for (let b = a + 1; b < cars.length; b++) {
    const A = cars[a], B = cars[b];
    const dx0 = B.x - A.x, dz0 = B.z - A.z; if (dx0 * dx0 + dz0 * dz0 > 36) continue;
    if (Math.abs(A.y - B.y) > 3) continue;
    let hit = false;
    for (const sa of [-O, O]) for (const sb of [-O, O]) {
      const ax = A.x + Math.sin(A.yaw) * sa, az = A.z + Math.cos(A.yaw) * sa, bx = B.x + Math.sin(B.yaw) * sb, bz = B.z + Math.cos(B.yaw) * sb;
      const dx = bx - ax, dz = bz - az, d2 = dx * dx + dz * dz;
      if (d2 < 4 * R * R && d2 > 1e-6) {
        const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, pen = (2 * R - d) * 0.5;
        A.x -= nx * pen; A.z -= nz * pen; B.x += nx * pen; B.z += nz * pen;
        const rv = (B.vx - A.vx) * nx + (B.vz - A.vz) * nz;
        if (rv < 0) { const j = -rv * 0.75; A.vx -= nx * j * 0.5; A.vz -= nz * j * 0.5; B.vx += nx * j * 0.5; B.vz += nz * j * 0.5; hit = Math.max(hit || 0, -rv); }
      }
    }
    if (hit && hit > 2 && time - (A.lastBump ?? -9) > 0.3) { A.lastBump = B.lastBump = time; A.events.push({ type: 'bump', impact: hit, other: B.id }); B.events.push({ type: 'bump', impact: hit, other: A.id }); }
  }
}

/** Slipstream: tucked in 4–28 m behind another car, roughly aligned → draft ∈ [0,1]. */
export function updateDraft(cars, dt) {
  for (const c of cars) {
    let best = 0; const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
    if (c.vF > 25) for (const o of cars) {
      if (o === c) continue; const dx = o.x - c.x, dz = o.z - c.z; const fwd = dx * fx + dz * fz; if (fwd < 4 || fwd > 28) continue;
      const lat = Math.abs(dx * fz - dz * fx); if (lat > 2.2) continue; best = Math.max(best, 1 - (fwd - 4) / 24);
    }
    c.draft += (best - c.draft) * Math.min(1, dt * 3);
  }
}

// ---------------------------------------------------------------- AI
/** Per-track speed profile: corner speed from curvature, then a backward braking pass around the loop. */
export function speedProfile(T, { latMax = BASE.latMax * 0.9, vmax = BASE.vmax, decel = 21 } = {}) {
  const n = T.n, P = new Float32Array(n);
  for (let i = 0; i < n; i++) { let km = 0; for (let o = -2; o <= 4; o++) km = Math.max(km, Math.abs(T.k[(i + o + n) % n])); P[i] = Math.min(vmax * 1.3, Math.sqrt(latMax / Math.max(km, 1e-5))); }
  for (let pass = 0; pass < 2; pass++) for (let j = n - 1; j >= 0; j--) { const q = (j + 1) % n; P[j] = Math.min(P[j], Math.sqrt(P[q] * P[q] + 2 * decel * T.ds)); }
  return P;
}

/** Choose inputs for an AI-driven car. ai = {skill, bias, aggro, prof}; others = all cars (for avoidance). */
export function aiDrive(c, T, others, dt, out = {}, ai = c.ai) {
  const n = T.n, i = c.loc.i < 0 ? 0 : c.loc.i, vF = c.vF;
  // avoidance: steer around a slower car just ahead
  let avoid = 0;
  for (const o of others) {
    if (o === c) continue; const ds = ((o.loc.s - c.loc.s + T.L * 1.5) % T.L) - T.L * 0.5; if (ds < 2 || ds > 18) continue;
    const dd = o.loc.d - c.loc.d; if (Math.abs(dd) > 3.2) continue; if (o.vF > vF + 1.5) continue;
    avoid += (dd >= 0 ? -1 : 1) * (3.4 - Math.abs(dd)) * (1 - ds / 22);
  }
  ai.avoid = (ai.avoid ?? 0) + (avoid - (ai.avoid ?? 0)) * Math.min(1, dt * 3);
  const look = Math.round((7 + Math.max(0, vF) * 0.42) / T.ds), j = (i + look) % n;
  const w = T.w[j];
  const off = clamp(T.line[j] * ai.lineSkill + ai.bias * w * 0.35 + ai.avoid, -w + 1.4, w - 1.4);
  const tx = T.x[j] + T.nx[j] * off, tz = T.z[j] + T.nz[j] * off;
  const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), dx = tx - c.x, dz = tz - c.z;
  const lr = dx * -fz + dz * fx, lf = dx * fx + dz * fz;
  const ang = Math.atan2(lr, Math.max(lf, 0.5));
  out.steer = clamp(ang * 2.4, -1, 1);
  // speed target (profile already includes braking zones)
  const pj = (i + Math.round(4 / T.ds)) % n;
  const tgt = ai.prof[pj] * ai.skill * c.rubber;
  out.throttle = vF < tgt ? 1 : vF < tgt + 2 ? 0.25 : 0;
  out.brake = vF > tgt + 3 ? clamp((vF - tgt) / 10, 0.2, 1) : 0;
  // drift through sustained, sharp corners; boost on straights
  let kk = 0; for (let o = 0; o < 14; o++) kk += T.k[(i + Math.round((6 + o * 2) / T.ds)) % n]; kk /= 14;
  if (!c.drift) out.drift = Math.abs(kk) > 1 / 60 && vF > 24 && Math.sign(kk) === Math.sign(out.steer) && ai.driftSkill > 0;
  else out.drift = Math.abs(kk) > 1 / 140 && c.driftT < 3.4;
  let straight = true; for (let o = 0; o < 10; o++) if (ai.prof[(i + Math.round((10 + o * 8) / T.ds)) % n] < c.stats.vmax * 0.97) { straight = false; break; }
  out.boost = c.boost > 0.4 && straight && !c.drift ? true : c.boosting && c.boost > 0.02 && straight;
  // stuck recovery: reverse out, then go
  if (Math.abs(vF) < 2 && out.throttle > 0 && !c.finished) c.stuckT += dt; else c.stuckT = Math.max(0, c.stuckT - dt);
  if (c.stuckT > 1.4) { c.revT = 1.1; c.stuckT = 0; }
  if (c.revT > 0) { c.revT -= dt; out.throttle = 0; out.brake = 1; out.steer = -out.steer; out.drift = false; out.boost = false; }
  return out;
}

export function makeAI(T, { skill = 1, bias = 0, aggro = 0.5, latMax } = {}) {
  return { skill, bias, aggro, lineSkill: 0.7 + 0.3 * skill, driftSkill: 1, prof: speedProfile(T, { latMax: (latMax ?? BASE.latMax * 0.9) }), avoid: 0 };
}
