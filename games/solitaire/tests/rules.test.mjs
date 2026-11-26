// node games/solitaire/tests/rules.test.mjs — move legality for all three games, Spider run completion, undo-safety
// (pure apply on clones), and FreeCell: every seeded deal 1..N is verified solvable and the solution replays legally.
import assert from 'node:assert/strict';
import * as R from '../rules.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok', name); };
const c = (r, s) => s * 13 + (r - 1); // rank 1..13, suit 0♠ 1♥ 2♦ 3♣
const U = (x) => ({ c: x, up: true }), D = (x) => ({ c: x, up: false });

t('deals have the right shape', () => {
  const k = R.dealKlondike(42); assert.equal(k.tab.map((p) => p.length).join(), '1,2,3,4,5,6,7'); assert.equal(k.stock.length, 24); assert.ok(k.tab.every((p) => p[p.length - 1].up && p.slice(0, -1).every((x) => !x.up)));
  const all = [...k.stock, ...k.tab.flat()].map((x) => x.c).sort((a, b) => a - b); assert.deepEqual(all, [...Array(52).keys()]);
  const s = R.dealSpider(42, { suits: 2 }); assert.equal(s.tab.map((p) => p.length).join(), '6,6,6,6,5,5,5,5,5,5'); assert.equal(s.stock.length, 50); assert.ok([...s.stock, ...s.tab.flat()].every((x) => R.suit(x.c) <= 1));
  const f = R.dealFreeCell(42); assert.equal(f.tab.map((p) => p.length).join(), '7,7,7,7,6,6,6,6'); assert.ok(f.verified);
  assert.deepEqual(R.dealKlondike(7).tab, R.dealKlondike(7).tab, 'seeded deals are deterministic');
});
t('Klondike: alternating colours descending; kings only to empty; aces start foundations', () => {
  const st = R.dealKlondike(1); st.tab = [[U(c(8, 0))], [U(c(7, 1))], [U(c(7, 0))], [], [U(c(13, 2))], [U(c(1, 3))], [U(c(2, 3))]]; st.stock = []; st.waste = [];
  assert.ok(R.legal(st, { from: { p: 'tab', i: 1 }, n: 1, to: { p: 'tab', i: 0 } })); // red 7 on black 8
  assert.ok(!R.legal(st, { from: { p: 'tab', i: 2 }, n: 1, to: { p: 'tab', i: 0 } })); // black 7 on black 8
  assert.ok(!R.legal(st, { from: { p: 'tab', i: 1 }, n: 1, to: { p: 'tab', i: 3 } })); // 7 to empty
  assert.ok(R.legal(st, { from: { p: 'tab', i: 4 }, n: 1, to: { p: 'tab', i: 3 } })); // K to empty
  assert.ok(R.legal(st, { from: { p: 'tab', i: 5 }, n: 1, to: { p: 'found', i: 0 } })); assert.ok(!R.legal(st, { from: { p: 'tab', i: 6 }, n: 1, to: { p: 'found', i: 0 } }));
  R.apply(st, { from: { p: 'tab', i: 5 }, n: 1, to: { p: 'found', i: 0 } }); assert.ok(R.legal(st, { from: { p: 'tab', i: 6 }, n: 1, to: { p: 'found', i: 0 } }));
});
t('Klondike: moving a run flips the card beneath; draw-3 and recycle', () => {
  const st = R.dealKlondike(3, { draw: 3 }); st.tab[1] = [D(c(5, 0)), U(c(9, 1)), U(c(8, 0))]; st.tab[0] = [U(c(10, 3))];
  const ev = R.apply(st, { from: { p: 'tab', i: 1 }, n: 2, to: { p: 'tab', i: 0 } }); assert.equal(st.tab[0].length, 3); assert.ok(st.tab[1][0].up); assert.equal(ev.flipped.length, 1);
  const s0 = st.stock.length; R.apply(st, { type: 'draw' }); assert.equal(st.waste.length, 3); assert.equal(st.stock.length, s0 - 3);
  while (st.stock.length) R.apply(st, { type: 'draw' }); assert.ok(R.legal(st, { type: 'recycle' })); R.apply(st, { type: 'recycle' }); assert.equal(st.waste.length, 0); assert.equal(st.stock.length, s0);
});
t('Klondike: limited passes stop recycling', () => { const st = R.dealKlondike(3, { draw: 3, passes: 2 }); while (st.stock.length) R.apply(st, { type: 'draw' }); R.apply(st, { type: 'recycle' }); while (st.stock.length) R.apply(st, { type: 'draw' }); assert.ok(!R.legal(st, { type: 'recycle' })); });
t('Spider: any-suit builds, same-suit runs move, deal needs no empty columns, K→A run completes', () => {
  const st = R.dealSpider(5, { suits: 2 }); st.tab = Array.from({ length: 10 }, () => [U(c(2, 1))]);
  st.tab[0] = [U(c(9, 0))]; st.tab[1] = [U(c(8, 1)), U(c(7, 1))]; st.tab[2] = [U(c(8, 0)), U(c(7, 1))];
  assert.ok(R.legal(st, { from: { p: 'tab', i: 1 }, n: 2, to: { p: 'tab', i: 0 } })); // 8♥7♥ onto 9♠
  assert.ok(!R.legal(st, { from: { p: 'tab', i: 2 }, n: 2, to: { p: 'tab', i: 0 } })); // mixed-suit run can't move together
  assert.ok(R.legal(st, { type: 'deal' })); st.tab[9] = []; assert.ok(!R.legal(st, { type: 'deal' }));
  st.tab[3] = []; for (let r = 13; r >= 1; r--) st.tab[3].push(U(c(r, 0))); st.tab[3].unshift(D(c(5, 1)));
  const top = st.tab[3].pop(); st.tab[4] = [top]; const ev = R.apply(st, { from: { p: 'tab', i: 4 }, n: 1, to: { p: 'tab', i: 3 } });
  assert.equal(st.found.length, 1); assert.equal(ev.completed.length, 1); assert.equal(st.tab[3].length, 1); assert.ok(st.tab[3][0].up);
});
t('FreeCell: supermove capacity = (free cells + 1) × 2^empty columns', () => {
  const st = R.dealFreeCell(9); st.cells = [null, null, U(c(1, 0)), U(c(1, 1))];
  st.tab = [[U(c(9, 0))], [U(c(8, 1)), U(c(7, 0)), U(c(6, 1)), U(c(5, 0))], [U(c(2, 2))], [U(c(3, 2))], [U(c(4, 2))], [U(c(5, 2))], [U(c(6, 2))], [U(c(7, 2))]];
  assert.equal(R.freecellCapacity(st, false), 3); assert.ok(!R.legal(st, { from: { p: 'tab', i: 1 }, n: 4, to: { p: 'tab', i: 0 } }));
  st.tab[7] = []; assert.equal(R.freecellCapacity(st, false), 6); assert.ok(R.legal(st, { from: { p: 'tab', i: 1 }, n: 4, to: { p: 'tab', i: 0 } }));
  assert.ok(R.legal(st, { from: { p: 'tab', i: 2 }, n: 1, to: { p: 'cell', i: 0 } })); assert.ok(!R.legal(st, { from: { p: 'tab', i: 2 }, n: 1, to: { p: 'cell', i: 2 } }));
});
t('hints and tap-to-move prefer foundations and reveals', () => {
  const st = R.dealKlondike(11); st.tab[0] = [U(c(1, 2))]; const h = R.hint(st); assert.equal(h.to.p, 'found');
  const m = R.bestMoveFrom(st, { p: 'tab', i: 0 }, 1); assert.equal(m.to.p, 'found');
});
t('auto-complete drains a fully revealed Klondike to a win', () => {
  const st = R.dealKlondike(1); st.stock = []; st.waste = []; st.found = [[], [], [], []]; st.tab = Array.from({ length: 7 }, () => []);
  let k = 0; for (let r = 13; r >= 1; r--) for (let s = 0; s < 4; s++) st.tab[k++ % 7].push(U(c(r, s)));
  assert.ok(R.canAutoComplete(st)); let g = 0; while (!R.won(st) && g++ < 100) { const m = R.nextFoundationMove(st); assert.ok(m, 'stuck'); R.apply(st, m); } assert.ok(R.won(st));
});
const N = +(process.env.FC_DEALS || 120);
t(`FreeCell deals 1..${N} are all verified solvable and their solutions replay legally`, () => {
  for (let seed = 1; seed <= N; seed++) {
    const st = R.dealFreeCell(seed); assert.ok(st.verified, 'deal ' + seed);
    const sol = R.solveFreeCell(st, 60000); assert.ok(sol, 'solve ' + seed);
    const s = R.clone(st); for (const m of sol) { assert.ok(R.legal(s, m), `illegal step in deal ${seed}`); R.apply(s, m); } assert.ok(R.won(s), 'replay wins ' + seed);
  }
});
t('3-cell FreeCell variant still deals solvable games', () => { for (let seed = 1; seed <= 15; seed++) assert.ok(R.dealFreeCell(seed, { cells: 3 }).verified); });
console.log(`\n${n} tests passed`);
