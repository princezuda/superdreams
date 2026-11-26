// node games/skystack/tests/stack.test.mjs — slicing maths, perfect snaps/growth, miss = game over, Zen never ends.
import assert from 'node:assert/strict';
import * as K from '../stack.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok', name); };
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;
const place = (st, off) => { const c = st.cur, tp = K.top(st); c[c.axis] = tp[c.axis] + off; return K.drop(st); };

t('first slab slides along x, second along z', () => { const st = K.createStack(); assert.equal(st.cur.axis, 'x'); place(st, 0); assert.equal(st.cur.axis, 'z'); });
t('cut keeps the overlap and slices exactly the overhang', () => {
  const st = K.createStack({ size: 4 }); const r = place(st, 1);
  assert.equal(r.type, 'cut'); assert.ok(near(r.placed.w, 3)); assert.ok(near(r.placed.x, 0.5)); assert.ok(near(r.debris.w, 1)); assert.ok(near(r.debris.x, 2.5));
  assert.ok(near(r.placed.w + r.debris.w, 4)); assert.ok(near(r.placed.d, 4));
  const r2 = place(st, -0.5); assert.ok(near(r2.placed.d, 3.5)); assert.ok(near(r2.placed.z, -0.25)); assert.ok(near(r2.debris.z, -2.25)); assert.equal(K.height(st), 2);
});
t('perfect within tolerance snaps exactly and counts a streak', () => {
  const st = K.createStack({ size: 4, difficulty: 'normal' }); const r = place(st, 0.08);
  assert.equal(r.type, 'perfect'); assert.ok(near(r.placed.x, 0)); assert.equal(st.streak, 1); assert.equal(r.debris, null);
});
t('perfect streak regrows a cut slab, never past the original size', () => {
  const st = K.createStack({ size: 4 }); place(st, 1); // w=3
  for (let k = 0; k < 12; k++) place(st, 0);
  const tp = K.top(st); assert.ok(tp.w > 3 && tp.w <= 4 + 1e-9); assert.ok(tp.d <= 4 + 1e-9);
});
t('a full miss ends a Classic run', () => { const st = K.createStack({ size: 3 }); const r = place(st, 3.2); assert.equal(r.type, 'miss'); assert.ok(st.over); assert.equal(K.drop(st), null); });
t('Zen never ends and keeps a minimum slab size', () => {
  const st = K.createStack({ size: 3, mode: 'zen' }); for (let k = 0; k < 30; k++) { const r = place(st, k % 2 ? 5 : 1.4); assert.notEqual(r.type, 'miss'); }
  assert.ok(!st.over); assert.ok(K.top(st).w >= st.minSize - 1e-9 && K.top(st).d >= st.minSize - 1e-9); assert.equal(K.height(st), 30);
});
t('slab ping-pongs within range and speeds up with height', () => {
  const st = K.createStack(); const s0 = st.cur.speed; let maxOff = 0; for (let k = 0; k < 600; k++) { K.update(st, 1 / 60); maxOff = Math.max(maxOff, Math.abs(st.cur.off)); } assert.ok(maxOff <= st.cur.range + 1e-9);
  for (let k = 0; k < 40; k++) place(st, 0); assert.ok(st.cur.speed > s0);
});
t('wind mode pushes the slab off its track; classic does not', () => {
  const a = K.createStack({ mode: 'wind' }), b = K.createStack({ mode: 'classic' }); for (let k = 0; k < 90; k++) { K.update(a, 1 / 60); K.update(b, 1 / 60); }
  assert.ok(Math.abs(a.wind) > 0); assert.equal(b.wind, 0); assert.ok(!near(a.cur.x - K.top(a).x, a.cur.off));
});
t('milestones fire at their heights', () => { const st = K.createStack(); let got = []; for (let k = 0; k < 26; k++) { const r = place(st, 0); if (r.milestone) got.push(r.milestone.name); } assert.deepEqual(got, ['Treetops', 'Cloud Sea']); });
t('autoplayer reaches Orbit (100) in Classic at every difficulty', () => {
  for (const d of ['easy', 'normal', 'hard']) { const st = K.createStack({ difficulty: d, mode: 'wind' }); let guard = 0; while (!st.over && K.height(st) < 100 && guard++ < 200000) { K.update(st, 1 / 120); if (K.shouldDrop(st, st.tol * 0.6)) K.drop(st); } assert.ok(K.height(st) >= 100, d + ' ' + K.height(st)); }
});
console.log(`\n${n} tests passed`);
