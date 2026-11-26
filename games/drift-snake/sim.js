// Neon Drift — pure simulation of light-snakes gliding on a sphere (no three.js). Positions are unit vectors (scaled by
// RADIUS when rendered); heading is a unit tangent. Steering rotates the heading about the surface normal.
export const RADIUS = 10;
export const DIFF = { easy: { speed: 4.2, turn: 2.5, rocks: 6 }, normal: { speed: 5.2, turn: 2.7, rocks: 10 }, hard: { speed: 6.3, turn: 2.9, rocks: 15 } };
export const PLANETS = [{ name: 'Cobalt', goal: 18 }, { name: 'Magenta', goal: 22 }, { name: 'Solar', goal: 26 }];
const SEG = 0.34 / RADIUS; // angular spacing of trail samples

export const makeRng = (seed) => ({ s: (seed >>> 0) || 3 });
export function rnd(r) { let t = (r.s = (r.s + 0x6d2b79f5) | 0); t = Math.imul(t ^ (t >>> 15), 1 | t); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
// vector helpers on plain arrays
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
export const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(a, b)))); // great-circle angle
export const surfDist = (a, b) => angle(a, b) * RADIUS;
export function randUnit(r) { const z = rnd(r) * 2 - 1, t = rnd(r) * Math.PI * 2, s = Math.sqrt(1 - z * z); return [s * Math.cos(t), s * Math.sin(t), z]; }
export function rotateAbout(v, axis, a) { // Rodrigues
  const c = Math.cos(a), s = Math.sin(a), k = axis, d = dot(k, v), x = cross(k, v);
  return [v[0] * c + x[0] * s + k[0] * d * (1 - c), v[1] * c + x[1] * s + k[1] * d * (1 - c), v[2] * c + x[2] * s + k[2] * d * (1 - c)];
}
export function tangentize(h, p) { return norm(add(h, p, -dot(h, p))); }

export function createWorld(o = {}) {
  const d = DIFF[o.difficulty || 'normal'], rng = makeRng(o.seed ?? 1), players = o.players || 1;
  const w = { mode: o.mode || 'classic', rng, d, speedMul: o.speedMul ?? 1, time: 0, snakes: [], orbs: [], rocks: [], portals: [], events: [], planet: o.planet ?? 0, collected: 0, goal: PLANETS[o.planet ?? 0].goal, over: false, cleared: false, orbCount: o.orbs ?? 7, growth: o.growth ?? 3 };
  const starts = players === 1 ? [[[0, 0, 1], [1, 0, 0]]] : [[[0, 0, 1], [1, 0, 0]], [[0, 0, -1], [-1, 0, 0]]];
  for (let i = 0; i < players; i++) { const [p, h] = starts[i]; const s = { id: i, p: norm(p), h: tangentize(h, p), trail: [], len: 10, alive: true, score: 0, steer: 0, boost: 0, dist: 0 }; for (let k = 0; k < s.len; k++) s.trail.push(norm(add(s.p, s.h, -SEG * (k + 1)))); w.snakes.push(s); }
  const clearOf = (q, min) => w.snakes.every((s) => angle(q, s.p) > min) && w.rocks.every((r) => angle(q, r.p) > 0.18);
  const rocks = o.rocks ?? d.rocks; for (let k = 0, g = 0; k < rocks && g < 500; g++) { const q = randUnit(rng); if (clearOf(q, 0.6)) w.rocks.push({ p: q, r: 0.42 + rnd(rng) * 0.25 }); else continue; k++; }
  if (w.mode === 'portal') for (let k = 0; k < 2; k++) { let a, b; do { a = randUnit(rng); } while (!clearOf(a, 0.5)); do { b = randUnit(rng); } while (!clearOf(b, 0.5) || angle(a, b) < 1.6); w.portals.push({ a, b, hue: k }); }
  for (let k = 0; k < w.orbCount; k++) spawnOrb(w);
  return w;
}
export function spawnOrb(w) {
  for (let g = 0; g < 200; g++) {
    const q = randUnit(w.rng);
    if (w.rocks.some((r) => angle(q, r.p) < 0.12) || w.snakes.some((s) => angle(q, s.p) < 0.25) || w.orbs.some((o) => angle(q, o.p) < 0.2) || w.portals.some((P) => angle(q, P.a) < 0.12 || angle(q, P.b) < 0.12)) continue;
    w.orbs.push({ p: q, id: Math.floor(rnd(w.rng) * 1e9), gold: rnd(w.rng) < 0.12 }); return;
  }
}
const HIT_SELF = 0.36, HIT_ROCK = 0.25, EAT = 0.75;
// input: [{steer:-1..1}] per player
export function step(w, dt, input = []) {
  if (w.over) return; w.time += dt;
  const ramp = 1 + Math.min(0.35, w.time * 0.004);
  for (const s of w.snakes) {
    if (!s.alive) continue;
    const inp = input[s.id] || {}; s.steer += ((inp.steer || 0) - s.steer) * Math.min(1, dt * 12);
    s.h = rotateAbout(s.h, s.p, -s.steer * w.d.turn * dt);
    const ang = (w.d.speed * w.speedMul * ramp * dt) / RADIUS;
    // advance along the great circle defined by heading
    const axis = norm(cross(s.p, s.h)); s.p = norm(rotateAbout(s.p, axis, ang)); s.h = tangentize(rotateAbout(s.h, axis, ang), s.p);
    s.dist += ang;
    while (s.dist >= SEG) { s.dist -= SEG; s.trail.unshift(s.p.slice()); if (s.trail.length > s.len) s.trail.length = s.len; }
    // portals
    for (const P of w.portals) for (const [from, to] of [[P.a, P.b], [P.b, P.a]]) if (!s.cool && angle(s.p, from) * RADIUS < 0.55) {
      // carry heading across: map tangent frame at `from` onto `to`
      const ax = norm(cross(from, to)), a = angle(from, to); s.p = norm(rotateAbout(s.p, ax, a)); s.h = tangentize(rotateAbout(s.h, ax, a), s.p); s.cool = 0.6; s.trail.unshift(s.p.slice()); w.events.push({ t: 'portal', id: s.id, from, to });
    }
    if (s.cool) s.cool = Math.max(0, s.cool - dt);
  }
  // collisions
  for (const s of w.snakes) {
    if (!s.alive) continue; let hit = null;
    for (const r of w.rocks) if (surfDist(s.p, r.p) < HIT_ROCK + r.r) hit = 'rock';
    for (const o of w.snakes) { const start = o === s ? 6 : 0; for (let k = start; k < o.trail.length && !hit; k++) if (surfDist(s.p, o.trail[k]) < HIT_SELF) { // ignore samples right after a portal jump
        if (o === s && s.cool) continue; hit = o === s ? 'self' : 'other'; } if (o !== s && o.alive && surfDist(s.p, o.p) < HIT_SELF * 1.5) hit = 'head'; }
    if (hit) { s.alive = false; w.events.push({ t: 'crash', id: s.id, cause: hit, p: s.p }); }
  }
  // orbs
  for (const s of w.snakes) {
    if (!s.alive) continue;
    for (let i = w.orbs.length - 1; i >= 0; i--) if (surfDist(s.p, w.orbs[i].p) < EAT) {
      const o = w.orbs.splice(i, 1)[0]; const pts = o.gold ? 5 : 1; s.score += pts; s.len += w.growth * (o.gold ? 2 : 1); w.collected += 1;
      w.events.push({ t: 'eat', id: s.id, p: o.p, gold: o.gold, score: s.score }); spawnOrb(w);
    }
  }
  const alive = w.snakes.filter((s) => s.alive);
  if (w.snakes.length === 1) { if (!alive.length) { w.over = true; w.events.push({ t: 'over' }); } else if (w.mode !== 'zen' && w.collected >= w.goal && !w.cleared) { w.cleared = true; w.events.push({ t: 'cleared' }); } }
  else if (alive.length <= 1) { w.over = true; w.events.push({ t: 'round', winner: alive[0]?.id ?? -1 }); }
}
// Look-ahead autopilot: tries left/straight/right, rejects paths that hit anything within ~1.3 s, prefers the nearest orb.
export function autopilot(w, s) {
  if (!s.alive) return { steer: 0 };
  let target = null, bd = 1e9; for (const o of w.orbs) { const d = angle(s.p, o.p); if (d < bd) { bd = d; target = o; } }
  const cand = [-1, -0.5, 0, 0.5, 1]; let best = 0, bs = -1e9;
  for (const st of cand) {
    let p = s.p.slice(), h = s.h.slice(), hitK = 99; const dt = 0.05; let tgt = 9;
    for (let k = 0; k < 28 && hitK === 99; k++) {
      h = rotateAbout(h, p, -st * w.d.turn * dt); const axis = norm(cross(p, h)), a = (w.d.speed * w.speedMul * dt) / RADIUS; p = norm(rotateAbout(p, axis, a)); h = tangentize(rotateAbout(h, axis, a), p);
      for (const r of w.rocks) if (surfDist(p, r.p) < HIT_ROCK + r.r + 0.25) hitK = k;
      for (const o of w.snakes) for (let j = o === s ? 4 : 0; j < o.trail.length && hitK === 99; j += 2) if (surfDist(p, o.trail[j]) < HIT_SELF + 0.25) hitK = k;
      if (target) tgt = Math.min(tgt, angle(p, target.p));
    }
    const score = (hitK === 99 ? 1000 : hitK * 20) - tgt * 60 - Math.abs(st) * 2;
    if (score > bs) { bs = score; best = st; }
  }
  return { steer: best };
}
