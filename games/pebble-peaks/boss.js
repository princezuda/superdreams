// Old Clinker — the Cinder Forge boss. Pure state machine (node-tested in tests/boss.test.mjs).
// Loop: idle → windup (telegraph) → leap onto the player's spot → SLAM (shockwave ring you must jump) ×N → dazed (head cools, bop/pound it) → next phase.
// Three hits. Phase 2+ adds falling embers with ground telegraphs; every phase is faster.

export const BOSS = { r: 2.1, h: 3.4, hDazed: 1.9, ringH: 0.75, ringW: 0.5, emberR: 1.2 };
const DIFF = { easy: { speed: 0.8, slams: [2, 2, 3], ring: 6.2, embers: 0 }, normal: { speed: 1, slams: [2, 3, 3], ring: 7.4, embers: 2 }, hard: { speed: 1.2, slams: [3, 3, 4], ring: 8.8, embers: 3 } };

export function createBoss({ cx = 0, cy = 0, cz = 0, R = 11, difficulty = 'normal', seed = 7 } = {}) {
  let s = seed >>> 0; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  return { cx, cy, cz, R, x: cx, z: cz, y: cy, vy: 0, d: DIFF[difficulty] || DIFF.normal, hp: 3, phase: 0, state: 'sleep', t: 0, slams: 0,
    rings: [], embers: [], from: [cx, cz], to: [cx, cz], rnd, height: BOSS.h, face: 0, awake: false };
}
export const top = (B) => B.y + B.height;
const speedOf = (B) => B.d.speed * (1 + B.phase * 0.18);

/** Advance. pl = {x,y,z}. Returns events. */
export function stepBoss(B, dt, pl) {
  const ev = []; const k = speedOf(B);
  B.t += dt * (B.state === 'dazed' || B.state === 'hurt' ? 1 : k);
  B.face = Math.atan2(pl.x - B.x, pl.z - B.z);
  switch (B.state) {
    case 'sleep': if (Math.hypot(pl.x - B.cx, pl.z - B.cz) < B.R - 1.5) { B.state = 'roar'; B.t = 0; B.awake = true; ev.push({ type: 'roar' }); } break;
    case 'roar': if (B.t > 1.6) { B.state = 'idle'; B.t = 0; } break;
    case 'idle': if (B.t > 0.9) { B.state = 'windup'; B.t = 0; ev.push({ type: 'windup' }); } break;
    case 'windup': B.height = BOSS.h * (1 - 0.25 * Math.min(1, B.t / 0.6));
      if (B.t > 0.6) { // leap toward the player (kept inside the arena)
        const dx = pl.x - B.cx, dz = pl.z - B.cz, d = Math.hypot(dx, dz), lim = B.R - BOSS.r - 1;
        const kk = d > lim ? lim / d : 1; B.from = [B.x, B.z]; B.to = [B.cx + dx * kk, B.cz + dz * kk];
        B.state = 'leap'; B.t = 0; B.height = BOSS.h; ev.push({ type: 'leap', to: B.to });
      } break;
    case 'leap': {
      const u = Math.min(1, B.t / 0.85); B.x = B.from[0] + (B.to[0] - B.from[0]) * u; B.z = B.from[1] + (B.to[1] - B.from[1]) * u; B.y = B.cy + Math.sin(u * Math.PI) * 6;
      if (u >= 1) {
        B.y = B.cy; B.state = 'slam'; B.t = 0; B.slams++;
        B.rings.push({ x: B.x, z: B.z, r: BOSS.r, v: B.d.ring * (1 + B.phase * 0.12), hitDone: false });
        ev.push({ type: 'slam', x: B.x, z: B.z });
        if (B.phase >= 1) for (let i = 0; i < B.d.embers + B.phase - 1; i++) { // telegraphed embers near the player
          const a = B.rnd() * Math.PI * 2, r = 1 + B.rnd() * 3.5; let ex = pl.x + Math.cos(a) * r, ez = pl.z + Math.sin(a) * r;
          const dd = Math.hypot(ex - B.cx, ez - B.cz); if (dd > B.R - 1) { ex = B.cx + (ex - B.cx) * (B.R - 1) / dd; ez = B.cz + (ez - B.cz) * (B.R - 1) / dd; }
          B.embers.push({ x: ex, z: ez, t: -0.35 * i, fall: 1.1 }); ev.push({ type: 'emberWarn', x: ex, z: ez });
        }
      }
      break;
    }
    case 'slam': if (B.t > 0.8) {
      B.t = 0;
      if (B.slams >= B.d.slams[B.phase]) { B.state = 'dazed'; B.slams = 0; B.height = BOSS.hDazed; ev.push({ type: 'dazed' }); }
      else { B.state = 'windup'; ev.push({ type: 'windup' }); }
    } break;
    case 'dazed': B.height = BOSS.hDazed; if (B.t > 3.8 - B.phase * 0.4) { B.state = 'idle'; B.t = 0; B.height = BOSS.h; ev.push({ type: 'recover' }); } break;
    case 'hurt': if (B.t > 1.2) { B.height = BOSS.h; if (B.hp <= 0) { B.state = 'dead'; B.t = 0; ev.push({ type: 'defeated' }); } else { B.state = 'idle'; B.t = 0; ev.push({ type: 'enrage', phase: B.phase }); } } break;
    case 'dead': B.height = Math.max(0.6, B.height - dt * 1.5); break;
  }
  // shockwave rings
  for (const r of B.rings) {
    r.r += r.v * dt;
    if (!r.hitDone && Math.abs(Math.hypot(pl.x - r.x, pl.z - r.z) - r.r) < BOSS.ringW && pl.y - B.cy < BOSS.ringH) { r.hitDone = true; ev.push({ type: 'ringHit', x: r.x, z: r.z }); }
  }
  B.rings = B.rings.filter((r) => r.r < B.R + 1.5);
  // embers
  for (const e of B.embers) {
    e.t += dt; if (e.t >= e.fall && !e.done) { e.done = true; ev.push({ type: 'emberLand', x: e.x, z: e.z }); if (Math.hypot(pl.x - e.x, pl.z - e.z) < BOSS.emberR && pl.y - B.cy < 1.2) ev.push({ type: 'emberHit', x: e.x, z: e.z }); }
  }
  B.embers = B.embers.filter((e) => !e.done);
  // body contact (side) — the head is only safe to touch while dazed
  if (B.state !== 'dead' && B.state !== 'sleep' && B.state !== 'hurt') {
    const d = Math.hypot(pl.x - B.x, pl.z - B.z);
    if (d < BOSS.r + 0.42 && pl.y < top(B) - 0.35 && pl.y + 0.9 > B.y) ev.push({ type: 'bodyHit', x: B.x, z: B.z });
    if (B.state === 'leap' && B.t > 0.6 && d < BOSS.r + 0.3 && pl.y < B.y) ev.push({ type: 'bodyHit', x: B.x, z: B.z });
  }
  return ev;
}

/** The player landed on the boss's head. Returns 'hit' (dazed) or 'bounce' (hot head). */
export function stomp(B) {
  if (B.state === 'dazed') { B.hp--; B.phase = Math.min(2, B.phase + 1); B.state = 'hurt'; B.t = 0; B.rings.length = 0; B.embers.length = 0; return 'hit'; }
  return B.state === 'dead' || B.state === 'hurt' ? 'none' : 'bounce';
}
