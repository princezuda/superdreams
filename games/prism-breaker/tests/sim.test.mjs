// node games/prism-breaker/tests/sim.test.mjs — collision maths, paddle angles, tunnelling, power-ups, and that the
// autopilot can clear all 30 levels (proves no level traps the ball or is unwinnable).
import assert from 'node:assert/strict';
import * as S from '../sim.js';
import { LEVELS } from '../levels.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok', name); };
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

t('circleBox: miss, face hit, corner hit, inside', () => {
  assert.equal(S.circleBox(0, 2, 0.2, 0, 0, 1, 0.5), null);
  const top = S.circleBox(0, 0.6, 0.2, 0, 0, 1, 0.5); assert.ok(near(top.nx, 0) && near(top.ny, 1) && near(top.depth, 0.1));
  const corner = S.circleBox(1.1, 0.6, 0.2, 0, 0, 1, 0.5); assert.ok(corner.nx > 0 && corner.ny > 0 && near(Math.hypot(corner.nx, corner.ny), 1));
  const inside = S.circleBox(0.9, 0, 0.2, 0, 0, 1, 0.5); assert.ok(inside.nx === 1 && inside.depth > 0);
});
t('paddleBounce: centre goes straight up, edges angle out symmetrically, speed preserved', () => {
  const c = S.paddleBounce(0, 10); assert.ok(near(c.vx, 0) && near(c.vy, 10));
  const r = S.paddleBounce(1, 10), l = S.paddleBounce(-1, 10); assert.ok(r.vx > 8 && near(r.vx, -l.vx) && near(Math.hypot(r.vx, r.vy), 10));
  const clamp = S.paddleBounce(5, 10); assert.ok(near(clamp.vx, r.vx));
});
t('layout parse: positions on grid, types/hp', () => {
  const b = S.parseLayout(['g.n', '..s']); assert.equal(b.length, 3); assert.equal(b[1].hp, 2); assert.equal(b[2].row, 1);
  assert.ok(near(b[0].x, S.FIELD.left + S.BW / 2));
});
t('fast ball never tunnels through a brick (sub-stepping)', () => {
  for (let k = 0; k < 40; k++) {
    const sim = S.createSim({ layout: ['', '', '', '', '', '', '', '', '', 'ggggggggggg'] }, { seed: k + 1, speedMul: 2.6 });
    const ball = sim.balls[0]; ball.stuck = false; ball.x = -5 + k * 0.25; ball.y = 0; ball.vx = 0.3; ball.vy = 20;
    let crossed = false;
    for (let f = 0; f < 120 && !crossed; f++) { S.step(sim, 1 / 30, { targetX: ball.x }); if (sim.balls[0] && sim.balls[0].y > S.brickY(9) + 0.5 && sim.brokeCount === 0) crossed = true; if (sim.brokeCount) break; }
    assert.ok(!crossed && sim.brokeCount > 0, 'tunnelled at ' + k);
  }
});
t('neon takes two hits, charge explodes neighbours', () => {
  const sim = S.createSim({ layout: ['ggg', 'gxg', 'ggg', '', '', '', '', '', '', '...n'] }, { seed: 3 });
  const nb = sim.bricks.find((b) => b.type === 'n'); sim.balls[0].stuck = false;
  const hit = (b) => { const ball = sim.balls[0]; ball.x = b.x; ball.y = b.y - 0.6; ball.vx = 0; ball.vy = 9; for (let f = 0; f < 10; f++) S.step(sim, 1 / 60, {}); };
  hit(nb); assert.equal(nb.hp, 1); assert.ok(nb.alive); hit(nb); assert.ok(!nb.alive);
  const x = sim.bricks.find((b) => b.type === 'x'); x.hp = 1; sim.events.length = 0;
  // break the charge directly via a laser
  sim.fx.laser = 5; sim.lasers.push({ x: x.x, y: x.y - 0.5 }); S.step(sim, 1 / 60, {});
  assert.ok(sim.bricks.filter((b) => b.row <= 2).every((b) => !b.alive), 'all 3x3 destroyed');
});
t('power-ups: multi-ball adds balls, wide grows paddle, slow slows ball', () => {
  const sim = S.createSim({ layout: ['g'] }, { seed: 5 }); const w0 = sim.paddle.w;
  sim.balls[0].stuck = false; sim.balls[0].vy = 5; sim.balls[0].y = 0;
  for (const kind of ['multi', 'wide', 'slow']) sim.powerups.push({ kind, x: sim.paddle.x, y: sim.paddle.y + 0.1, vy: -1, spin: 0 });
  const sp = S.speedOf(sim); S.step(sim, 1 / 60, {});
  assert.ok(sim.balls.length >= 3); assert.ok(S.speedOf(sim) < sp);
  for (let f = 0; f < 60; f++) S.step(sim, 1 / 60, {}); assert.ok(sim.paddle.w > w0 * 1.3);
});
t('losing every ball costs a life and re-serves; game over at zero', () => {
  const sim = S.createSim({ layout: ['g'] }, { seed: 2, lives: 2 }); sim.balls[0].stuck = false; sim.balls[0].y = -9.8; sim.balls[0].vy = -5;
  S.step(sim, 1 / 60, {}); assert.equal(sim.lives, 1); assert.ok(sim.balls[0].stuck);
  sim.balls[0].stuck = false; sim.balls[0].y = -9.8; sim.balls[0].vy = -5; S.step(sim, 1 / 60, {}); assert.ok(sim.over);
});
t('gravity well bends the ball but keeps its speed', () => {
  const sim = S.createSim({ layout: [] }, { mode: 'gravity', seed: 9, gravity: 6 }); const b = sim.balls[0]; b.stuck = false; b.x = -3; b.y = -2; b.vx = 0; b.vy = 9;
  const s0 = S.speedOf(sim); S.step(sim, 0.1, {}); assert.ok(b.vx > 0, 'pulled toward the well'); assert.ok(near(Math.hypot(b.vx, b.vy), S.speedOf(sim), 1e-3)); assert.ok(near(s0, S.speedOf(sim), 1));
});
t('every level has breakable bricks; bosses where expected', () => {
  assert.equal(LEVELS.length, 30);
  LEVELS.forEach((lv, k) => { const sim = S.createSim(lv, { seed: 1 }); assert.ok(S.breakable(sim) > 0, 'level ' + (k + 1)); assert.equal(!!lv.boss, (k + 1) % 10 === 0); });
});
// autopilot clears all 30 levels (normal difficulty) within a time budget, deterministic per seed
const results = [];
for (let k = 0; k < LEVELS.length; k++) {
  let won = 0, times = [], lost = 0; const SEEDS = 3;
  for (let s = 0; s < SEEDS; s++) {
    const sim = S.createSim(LEVELS[k], { seed: 100 + s * 7 + k, lives: 99 });
    let tt = 0; while (!sim.won && tt < 400) { S.step(sim, 1 / 60, S.autopilot(sim)); sim.events.length = 0; tt += 1 / 60; }
    if (sim.won) { won++; times.push(tt); } lost += sim.livesLost;
  }
  results.push({ k: k + 1, won, avg: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : '-', lost });
}
console.log(results.map((r) => `L${r.k}:${r.won}/3 ${r.avg}s lost${r.lost}`).join('  '));
t('autopilot clears every level', () => { for (const r of results) assert.equal(r.won, 3, 'level ' + r.k + ' not cleared'); });
console.log(`\n${n} tests passed`);
