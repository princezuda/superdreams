// node games/strikepoint/tests/logic.test.mjs — pure-logic unit tests (no browser)
import assert from 'node:assert/strict';
import { falloff, spreadDeg, rayAABB, rayCapsule, raySphere, pointSegDist, stormPhases, stormAt, nextCenter, coverScore, matchXP, lobVelocity, rng, rollTier, wrapAngle, damp } from '../logic.js';
import { NavGrid } from '../nav.js';
import { WEAPONS, recoilStep, DIFFICULTY } from '../config.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok', name); };
t('falloff: full damage up close, min at range, linear between', () => {
  const w = WEAPONS.ar; assert.equal(falloff(w, 5), 30); assert.equal(falloff(w, 100), 21); const mid = falloff(w, (w.range[0] + w.range[1]) / 2); assert.ok(Math.abs(mid - 25.5) < 1e-9);
});
t('every weapon: kill in a sane number of body shots at close range', () => {
  for (const w of Object.values(WEAPONS)) { const per = falloff(w, 3) * w.pellets; const stk = Math.ceil(100 / per); assert.ok(stk >= 1 && stk <= 6, `${w.id} stk ${stk}`); }
});
t('spread: ADS tighter than hip, moving/air looser', () => {
  const w = WEAPONS.ar, base = { ads: 0, moving: false, grounded: true, crouch: false, sliding: false, bloom: 0 };
  const hip = spreadDeg(w, base), ads = spreadDeg(w, { ...base, ads: 1 }), mov = spreadDeg(w, { ...base, moving: true }), air = spreadDeg(w, { ...base, grounded: false });
  assert.ok(ads < hip && mov > hip && air > mov);
});
t('recoil pattern deterministic and climbing', () => {
  const w = WEAPONS.ar; const a = recoilStep(w, 5), b = recoilStep(w, 5); assert.deepEqual(a, b); assert.ok(recoilStep(w, 8)[0] > recoilStep(w, 0)[0]);
});
t('rayAABB hits front face with correct normal, misses beside', () => {
  const nrm = [0, 0, 0]; const tt = rayAABB(0, 1, -5, 0, 0, 1, [-1, 0, -1], [1, 2, 1], 100, nrm); assert.equal(tt, 4); assert.deepEqual(nrm, [0, 0, -1]);
  assert.equal(rayAABB(3, 1, -5, 0, 0, 1, [-1, 0, -1], [1, 2, 1], 100, nrm), -1);
});
t('ray vs capsule / sphere hitboxes', () => {
  assert.ok(Math.abs(raySphere(0, 1.6, -10, 0, 0, 1, 0, 1.6, 0, 0.15, 100) - 9.85) < 1e-6);
  assert.ok(rayCapsule(0, 1, -10, 0, 0, 1, 0, 0.9, 0, 0, 1.5, 0, 0.25, 100) > 9);
  assert.equal(rayCapsule(2, 1, -10, 0, 0, 1, 0, 0.9, 0, 0, 1.5, 0, 0.25, 100), -1);
  assert.ok(Math.abs(pointSegDist(0, 1, 0, -5, 0, 0, 5, 0, 0) - 1) < 1e-9);
});
t('storm: radii shrink monotonically and end at zero', () => {
  const P = stormPhases(160); const C = [[0, 0]]; const r = rng(3); for (const p of P) C.push(nextCenter(C.at(-1)[0], C.at(-1)[1], p.r0, p.r1, r));
  let last = 1e9, T = 0; for (const p of P) T += p.wait + p.shrink;
  for (let tt = 0; tt <= T + 5; tt += 2) { const s = stormAt(P, C, tt); assert.ok(s.r <= last + 1e-9); last = s.r; }
  assert.equal(stormAt(P, C, T + 10).r, 0);
  for (let i = 1; i < C.length; i++) assert.ok(Math.hypot(C[i][0] - C[i - 1][0], C[i][1] - C[i - 1][1]) <= P[i - 1].r0 - P[i - 1].r1 + 1e-6, 'next circle inside previous');
});
t('cover score prefers close protected cover at preferred range', () => {
  const near = coverScore({ distSelf: 4, distThreat: 18, protects: true, canPeek: true }); const far = coverScore({ distSelf: 20, distThreat: 18, protects: true, canPeek: true });
  assert.ok(near > far); assert.equal(coverScore({ distSelf: 1, distThreat: 18, protects: false }), -1e9); assert.equal(coverScore({ distSelf: 1, distThreat: 18, protects: true, occupied: true }), -1e9);
});
t('lob velocity lands on target (sim)', () => {
  const g = 20, v = lobVelocity(12, 0, 5, 18, g); assert.ok(v); let x = 0, y = 0, z = 0, vx = v[0], vy = v[1], vz = v[2];
  for (let i = 0; i < 2000; i++) { const dt = 0.001; vy -= g * dt; x += vx * dt; y += vy * dt; z += vz * dt; if (y < 0 && vy < 0) break; }
  assert.ok(Math.hypot(x - 12, z - 5) < 0.3, `landed at ${x},${z}`); assert.equal(lobVelocity(400, 0, 0, 15, 20), null);
});
t('XP + tiers + misc', () => {
  assert.ok(matchXP({ kills: 10, won: true }) > matchXP({ kills: 10, won: false }));
  const r = rng(1); const counts = [0, 0, 0, 0, 0]; for (let i = 0; i < 5000; i++) counts[rollTier(r)]++; assert.ok(counts[0] > counts[4] * 5);
  const rc = rng(2); for (let i = 0; i < 500; i++) assert.ok(rollTier(rc, true) >= 1);
  assert.ok(Math.abs(wrapAngle(7) - (7 - 2 * Math.PI)) < 1e-9); assert.ok(Math.abs(damp(0, 10, 5, 1 / 60) - 10 * (1 - Math.exp(-5 / 60))) < 1e-9);
  for (const d of Object.values(DIFFICULTY)) assert.ok(d.reaction > 0 && d.aimErr > 0);
});
t('nav A*: routes around a wall, string-pulled, respects ledges', () => {
  const g = new NavGrid(0, 0, 30, 30, 1);
  for (let j = 0; j < 25; j++) g.block[j * g.w + 15] = 1; // wall x=15 from z=0..25 (gap at top)
  const path = g.find(2.5, 2.5, 28.5, 2.5); assert.ok(path && path.length >= 2);
  for (let i = 0; i < path.length; i++) { const p = path[i]; const k = g.idx(p[0], p[1]); assert.ok(!g.block[k]); }
  assert.ok(path.some((p) => p[1] > 24), 'goes around the top of the wall');
  const straight = g.find(2.5, 2.5, 10.5, 8.5); assert.equal(straight.length, 1, 'open ground = single waypoint');
  for (let i = 0; i < g.w * g.h; i++) if ((i % g.w) > 20) g.height[i] = 3; // 3 m cliff
  const blocked = g.find(17.5, 27.5, 25.5, 27.5); assert.equal(blocked, null, 'no path up a cliff');
});
console.log(`\n${n} tests passed`);
