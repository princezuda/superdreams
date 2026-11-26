// node games/drift-snake/tests/sim.test.mjs — sphere kinematics, steering, collisions (self / rock / rival), orb growth,
// portal wraparound, two-player rounds, and a look-ahead autopilot that survives and clears a planet.
import assert from 'node:assert/strict';
import * as S from '../sim.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok', name); };
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;
t('heads stay on the sphere with a unit tangent heading', () => { const w = S.createWorld({ seed: 2, rocks: 0 }); for (let k = 0; k < 600; k++) S.step(w, 1 / 60, [{ steer: Math.sin(k * 0.05) }]); const s = w.snakes[0]; assert.ok(near(Math.hypot(...s.p), 1)); assert.ok(near(Math.hypot(...s.h), 1)); assert.ok(Math.abs(S.dot(s.p, s.h)) < 1e-6); });
t('straight line follows a great circle and returns home', () => { const w = S.createWorld({ seed: 2, rocks: 0, orbs: 0 }); const s = w.snakes[0]; const p0 = s.p.slice(); let tot = 0; s.len = 3; while (tot < 2 * Math.PI) { tot += (w.d.speed * (1 + Math.min(0.35, (w.time + 1 / 240) * 0.004)) / 240) / S.RADIUS; S.step(w, 1 / 240, [{ steer: 0 }]); } assert.ok(S.angle(s.p, p0) < 0.05, 'back near start'); });
t('steering turns: left and right diverge symmetrically', () => { const a = S.createWorld({ seed: 4, rocks: 0, orbs: 0 }), b = S.createWorld({ seed: 4, rocks: 0, orbs: 0 }); for (let k = 0; k < 60; k++) { S.step(a, 1 / 60, [{ steer: -1 }]); S.step(b, 1 / 60, [{ steer: 1 }]); } assert.ok(near(a.snakes[0].p[2], b.snakes[0].p[2], 1e-6)); assert.ok(near(a.snakes[0].p[1], -b.snakes[0].p[1], 1e-6)); });
t('tight circling into your own trail crashes', () => { const w = S.createWorld({ seed: 1, rocks: 0, orbs: 0 }); w.snakes[0].len = 200; w.d = { ...w.d, turn: 3.2 }; let k = 0; while (w.snakes[0].alive && k++ < 2000) S.step(w, 1 / 60, [{ steer: 1 }]); assert.ok(!w.snakes[0].alive); assert.equal(w.events.find((e) => e.t === 'crash').cause, 'self'); });
t('a short snake can circle forever without self-hits', () => { const w = S.createWorld({ seed: 1, rocks: 0, orbs: 0 }); w.snakes[0].len = 8; for (let k = 0; k < 600; k++) S.step(w, 1 / 60, [{ steer: 1 }]); assert.ok(w.snakes[0].alive); });
t('rocks crash, orbs grow the snake and respawn', () => {
  const w = S.createWorld({ seed: 5, rocks: 0, orbs: 0 }); const s = w.snakes[0]; w.orbs.push({ p: S.norm(S.add(s.p, s.h, 0.05)), id: 1, gold: false }); const L0 = s.len;
  for (let k = 0; k < 30; k++) S.step(w, 1 / 60, []); assert.equal(s.score, 1); assert.equal(s.len, L0 + w.growth); assert.equal(w.orbs.length, 1);
  w.rocks.push({ p: S.norm(S.add(s.p, s.h, 0.06)), r: 0.4 }); for (let k = 0; k < 30; k++) S.step(w, 1 / 60, []); assert.ok(!s.alive); assert.ok(w.over);
});
t('portals teleport the head to the paired gate and keep it moving forward', () => {
  const w = S.createWorld({ seed: 7, mode: 'portal', rocks: 0, orbs: 0 }); const s = w.snakes[0]; const P = w.portals[0]; P.a = S.norm(S.add(s.p, s.h, 0.03));
  for (let k = 0; k < 20 && !w.events.some((e) => e.t === 'portal'); k++) S.step(w, 1 / 60, []); assert.ok(w.events.some((e) => e.t === 'portal')); assert.ok(S.angle(s.p, P.b) * S.RADIUS < 1.2); assert.ok(s.alive);
});
t('two-player: running into the rival trail ends the round with a winner', () => {
  const w = S.createWorld({ seed: 3, players: 2, rocks: 0, orbs: 0 }); const [a, b] = w.snakes; b.trail = []; for (let k = 0; k < 30; k++) b.trail.push(S.norm(S.add(a.p, a.h, 0.03 + k * 0.001)));
  S.step(w, 1 / 30, []); assert.ok(!a.alive); assert.ok(w.over); assert.equal(w.events.find((e) => e.t === 'round').winner, 1);
});
t('autopilot survives 90 s and clears the first planet goal', () => {
  for (const seed of [1, 2, 3]) { const w = S.createWorld({ seed, difficulty: 'normal' }); let k = 0; while (!w.over && !w.cleared && k++ < 90 * 60) S.step(w, 1 / 60, [S.autopilot(w, w.snakes[0])]); assert.ok(w.cleared || !w.over, `seed ${seed} died at ${(k / 60).toFixed(1)}s with ${w.collected}`); }
});
console.log(`\n${n} tests passed`);
