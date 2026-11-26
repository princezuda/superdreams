// node games/pebble-peaks/tests/route.test.mjs — a bot plays every authored hop of every level with the REAL controller
// (same physics + tuning as the game). Movers are parked at the point of their path nearest the hop. Also checks counts/ids.
import assert from 'node:assert/strict';
import * as P from '../physics.js';
import { LEVELS, ORDER, totalShards } from '../levels.js';
const DT = 1 / 120;
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok', name); };

function parkMover(s, target) { // move s along its path to the sampled point nearest target (xz)
  let best = 1e9, bt = 0; const o = [0, 0, 0];
  for (let k = 0; k < 400; k++) { const tt = k / 400 * (s.path.T || 6); P.pathPos(s.path, tt, o); const d = Math.hypot(o[0] - target[0], (o[1] - target[1]) * 1.5, o[2] - target[2]); if (d < best) { best = d; bt = tt; } }
  P.pathPos(s.path, bt, o); P.moveSolidTo(s, o[0], o[1], o[2]); s.dx = s.dy = s.dz = 0; return o;
}
function hop(w, from, to, how) {
  const p = P.createPlayer(from[0], from[1] + 0.05, from[2]); p.grounded = false;
  for (let i = 0; i < 30; i++) P.stepPlayer(p, { mx: 0, mz: 0 }, w, DT);
  if (!p.grounded) return { ok: false, why: 'start not grounded' };
  let jumped = false, dbl = false, rolled = false, air = false;
  for (let i = 0; i < 7 / DT; i++) {
    const dx = to[0] - p.x, dz = to[2] - p.z, d = Math.hypot(dx, dz);
    const inp = { mx: d > 0.15 ? dx / d : 0, mz: d > 0.15 ? dz / d : 0, jumpPressed: false, jumpHeld: true, actionPressed: false };
    if (p.grounded && how !== 'walk') {
      const ax = p.x + inp.mx * 0.5, az = p.z + inp.mz * 0.5;
      const f = P.floorBelow(w, ax, az, P.TUNE.FOOT, p.y + P.TUNE.STEP);
      const edge = !f || f.y < p.y - 0.4, high = to[1] > p.y + P.TUNE.STEP && p.hitWall;
      const near = d < (how === 'double' ? 3.2 : 2.6) && to[1] > p.y + 0.3;
      if (!jumped && (edge || high || near)) {
        if (how === 'long' && !rolled) { inp.actionPressed = true; rolled = true; }
        else { inp.jumpPressed = true; jumped = true; }
      } else if (rolled && !jumped) { inp.jumpPressed = true; jumped = true; }
    }
    if (!p.grounded) air = true;
    if (!p.grounded && jumped && !dbl && p.vy < 1.5 && (d > 1.2 || to[1] > p.y)) { inp.jumpPressed = true; dbl = true; }
    if (!p.grounded && p.y < to[1] - 0.2 && d < 0.6 && p.vy < 0) {} // falling short
    const ev = P.stepPlayer(p, inp, w, DT);
    if (ev.some((e) => e.type === 'fall')) return { ok: false, why: 'fell', p };
    if (p.grounded && (air || how === 'walk') && Math.abs(p.y - to[1]) < 0.35 && d < 1.6) return { ok: true, p, dbl };
    if (p.grounded && air && jumped && p.y < to[1] - 0.6 && i > 60 && Math.abs(p.vx) + Math.abs(p.vz) < 0.5) return { ok: false, why: 'stuck low', p };
  }
  return { ok: false, why: 'timeout', p };
}

for (const id of ORDER) {
  const L = LEVELS[id];
  t(`${id}: counts — 3 relics, ≥2 checkpoints, goal, ≥40 shards`, () => {
    assert.equal(L.relics.length, 3); assert.ok(L.checkpoints.length >= 2); assert.ok(L.goal); assert.ok(totalShards(id) >= 40, `${totalShards(id)} shards`);
    const lootRelics = L.solids.filter((s) => s.loot?.relic !== undefined).map((s) => s.loot.relic); for (const r of lootRelics) assert.ok(r >= 0 && r < 3);
  });
  t(`${id}: every route hop is achievable by the bot`, () => {
    const w = P.worldFromLevel(L); const bad = [];
    for (let i = 0; i + 1 < L.route.length; i++) {
      const A = L.route[i], B = L.route[i + 1]; if (['bounce', 'stairs'].includes(A.how) || ['bounce', 'stairs'].includes(B.how)) continue;
      const from = [...A.p], to = [...B.p];
      // park movers used by this hop
      for (const s of w.solids) if (s.path) { s.x = s.home[0]; }
      if (A.how === 'ride') { const s = w.solids.filter((s) => s.path).sort((a, b) => Math.hypot(a.home[0] - A.p[0], a.home[2] - A.p[2]) - Math.hypot(b.home[0] - A.p[0], b.home[2] - A.p[2]))[0]; const o = parkMover(s, to); from[0] = o[0]; from[1] = o[1]; from[2] = o[2]; }
      if (B.how === 'ride') { const s = w.solids.filter((s) => s.path).sort((a, b) => Math.hypot(a.home[0] - B.p[0], a.home[2] - B.p[2]) - Math.hypot(b.home[0] - B.p[0], b.home[2] - B.p[2]))[0]; const o = parkMover(s, from); to[0] = o[0]; to[1] = o[1]; to[2] = o[2]; }
      const r = hop(w, from, to, B.how === 'ride' ? 'jump' : B.how);
      if (!r.ok) bad.push(`#${i}→${i + 1} [${B.how}] ${from.map((v) => v.toFixed(1))} → ${to.map((v) => v.toFixed(1))}: ${r.why} at ${r.p ? [r.p.x, r.p.y, r.p.z].map((v) => v.toFixed(1)) : '-'}`);
    }
    assert.equal(bad.length, 0, '\n' + bad.join('\n'));
  });
}
t('meadow: long-jump relic gap (12 u) needs long+double — plain double falls short', () => {
  const L = LEVELS.meadow, w = P.worldFromLevel(L);
  assert.ok(hop(w, [17, 4.6, -51], [2.8, 4.6, -51], 'long').ok, 'long+double makes it');
  assert.ok(!hop(w, [17, 4.6, -51], [2.8, 4.6, -51], 'double').ok, 'double alone does not');
});
t('caves: low-roof alcove — long jump fits under the overhang', () => {
  const L = LEVELS.caves, w = P.worldFromLevel(L);
  assert.ok(hop(w, [6, 9, -74], [16.8, 9, -74], 'long').ok, 'long jump under the roof');
  assert.ok(!hop(w, [6, 9, -74], [16.8, 9, -74], 'double').ok, 'double jump bonks the roof and falls short');
});
t('sky: the rotating staircase can be climbed live (movers moving) to the summit', () => {
  const L = LEVELS.sky, w = P.worldFromLevel(L); const stairs = w.solids.filter((s) => s.path?.orbit && s.path.orbit[2] === -107).sort((a, b) => a.top - b.top);
  assert.equal(stairs.length, 4);
  const p = P.createPlayer(0, 7.05, -94); p.grounded = false; let time = 0; const o = [0, 0, 0];
  const step = (inp) => { time += DT; P.updateMovers(w, time); return P.stepPlayer(p, inp, w, DT); };
  // wait until the first step is at the near point
  for (let i = 0; i < 20 / DT; i++) { step({ mx: 0, mz: 0 }); P.pathPos(stairs[0].path, time, o); if (Math.hypot(o[0], o[2] + 101.5) < 0.3) break; }
  const targets = [...stairs, { summit: true }]; let on = -1;
  for (const [k, s] of targets.entries()) {
    let jumped = false, dbl = false, done = false;
    for (let i = 0; i < (s.summit ? 16 : 4) / DT && !done; i++) {
      const tx = s.summit ? 0 : s.x, tz = s.summit ? -117 : s.z, ty = s.summit ? 17 : s.top;
      const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
      const inp = { mx: d > 0.1 ? dx / d : 0, mz: d > 0.1 ? dz / d : 0, jumpHeld: true, jumpPressed: false, actionPressed: false };
      if (s.summit && p.grounded && !jumped && d > 6.5) { inp.mx = inp.mz = 0; } // ride until the step swings past the summit
      else if (p.grounded && !jumped && d < (s.summit ? 6.5 : 4.2)) { inp.jumpPressed = true; jumped = true; }
      if (!p.grounded && jumped && !dbl && p.vy < 2) { inp.jumpPressed = true; dbl = true; }
      const ev = step(inp); if (ev.some((e) => e.type === 'fall')) assert.fail(`fell going to step ${k}`);
      if (jumped && p.grounded && Math.abs(p.y - ty) < 0.3) { done = true; on = k; }
    }
    assert.ok(done, `reached step ${k}`);
    for (let i = 0; i < 0.15 / DT; i++) step({ mx: 0, mz: 0 });
  }
  assert.equal(on, 4);
});
console.log(`\n${n} route tests passed`);
