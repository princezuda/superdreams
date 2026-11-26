// node games/pebble-peaks/tests/boss.test.mjs — Old Clinker's cycle, dazed window, rings you can jump, 3 hits to win.
import assert from 'node:assert/strict';
import * as K from '../boss.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok', name); };
const DT = 1 / 120;
const runUntil = (B, pl, pred, max = 30) => { const all = []; for (let i = 0; i < max / DT; i++) { const e = K.stepBoss(B, DT, typeof pl === 'function' ? pl(i * DT) : pl); all.push(...e); if (pred(B, e)) return all; } return null; };

t('sleeps until the player enters the arena, then roars', () => {
  const B = K.createBoss({ R: 11 }); assert.ok(!runUntil(B, { x: 0, y: 0, z: 15 }, (b) => b.state !== 'sleep', 2));
  assert.ok(runUntil(B, { x: 0, y: 0, z: 6 }, (b) => b.state === 'roar', 1));
});
t('leaps toward the player and slams, spawning an expanding ring', () => {
  const B = K.createBoss({ R: 11 }); const ev = runUntil(B, { x: 4, y: 0, z: 4 }, (b, e) => e.some((x) => x.type === 'slam'), 10);
  assert.ok(ev); assert.ok(Math.hypot(B.x - 4, B.z - 4) < 0.01); assert.equal(B.rings.length, 1);
});
t('leap target is clamped inside the arena', () => { const B = K.createBoss({ R: 11 }); runUntil(B, { x: 5, y: 0, z: 0 }, (b) => b.state === 'idle', 5); assert.ok(runUntil(B, { x: 30, y: 0, z: 0 }, (b, e) => e.some((x) => x.type === 'slam'), 10)); assert.ok(Math.hypot(B.x, B.z) <= 11 - K.BOSS.r - 1 + 1e-6); });
t('a grounded player in the ring path is hit; a jumping one is not', () => {
  const mk = () => { const B = K.createBoss({ R: 11 }); runUntil(B, { x: 0, y: 0, z: 0.1 }, (b, e) => e.some((x) => x.type === 'slam'), 10); return B; };
  const B1 = mk(); const e1 = runUntil(B1, { x: 6, y: 0, z: 0 }, (b, e) => e.some((x) => x.type === 'ringHit'), 2); assert.ok(e1, 'grounded gets hit');
  const B2 = mk(); const e2 = runUntil(B2, { x: 6, y: 1.2, z: 0 }, (b, e) => e.some((x) => x.type === 'ringHit'), 2); assert.equal(e2, null, 'airborne clears it');
});
t('after its slams it is dazed; a stomp while dazed is a hit, otherwise a bounce', () => {
  const B = K.createBoss({ R: 11 }); assert.ok(runUntil(B, { x: 3, y: 0, z: 3 }, (b) => b.state === 'dazed', 30));
  assert.equal(K.stomp(B), 'hit'); assert.equal(B.hp, 2); assert.equal(K.stomp(B), 'none');
  runUntil(B, { x: 3, y: 0, z: 3 }, (b) => b.state === 'windup', 10); assert.equal(K.stomp(B), 'bounce');
});
t('three dazed stomps defeat it; phases get faster and add embers', () => {
  const B = K.createBoss({ R: 11, difficulty: 'normal' }); let embers = 0; const pl = { x: 3, y: 5, z: 3 }; // hovering player: rings never hit
  for (let h = 0; h < 3; h++) { const ev = runUntil(B, pl, (b) => b.state === 'dazed', 60); assert.ok(ev, 'dazed #' + h); embers += ev.filter((e) => e.type === 'emberWarn').length; assert.equal(K.stomp(B), 'hit'); }
  assert.ok(runUntil(B, pl, (b, e) => e.some((x) => x.type === 'defeated'), 5)); assert.equal(B.state, 'dead'); assert.ok(embers >= 2, 'embers ' + embers);
});
t('touching its hot body hurts; standing on the dazed head does not', () => {
  const B = K.createBoss({ R: 11 }); runUntil(B, { x: 0, y: 0, z: 6 }, (b) => b.state === 'idle', 5);
  const e = K.stepBoss(B, DT, { x: B.x + 2.3, y: 0, z: B.z }); assert.ok(e.some((x) => x.type === 'bodyHit'));
  runUntil(B, { x: 5, y: 9, z: 0 }, (b) => b.state === 'dazed', 30); const e2 = K.stepBoss(B, DT, { x: B.x, y: K.top(B), z: B.z }); assert.ok(!e2.some((x) => x.type === 'bodyHit'));
});
console.log(`\n${n} boss tests passed`);
