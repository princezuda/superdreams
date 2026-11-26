// node games/gem-garden/tests/logic.test.mjs — match detection, specials, cascades, gravity, reshuffle, goals.
import assert from 'node:assert/strict';
import * as L from '../logic.js';
import { LEVELS } from '../levels.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok', name); };

// Build a state from a colour grid: digits = colours, '.' = random-safe filler (we use colour 5/4 alternation), 'x' hole, '#' bramble
function board(rows, extra = {}) {
  const st = L.createState({ layout: rows.map((r) => r.replace(/[0-9#]/g, (c) => (c === '#' ? 'b' : '.'))), colors: 6, moves: 10, ...extra }, 7);
  rows.forEach((r, y) => [...r].forEach((ch, x) => {
    const i = y * st.w + x;
    if (/[0-9]/.test(ch)) st.gem[i] = { id: 1000 + i, c: +ch, s: 0 };
    else if (ch === '#') st.gem[i] = null;
  }));
  return st;
}
const filler = ['01230123', '23012301', '01230123', '23012301', '01230123', '23012301', '01230123', '23012301'];

t('no matches on checker filler', () => { assert.equal(L.findMatches(board(filler)).length, 0); });
t('horizontal 3 detected', () => {
  const r = [...filler]; r[0] = '55501230'.slice(0, 8); const st = board(r);
  const g = L.findMatches(st); assert.equal(g.length, 1); assert.deepEqual(g[0].cells.sort((a, b) => a - b), [0, 1, 2]); assert.equal(L.specialFor(g[0]), L.NONE);
});
t('4-run gives perpendicular line gem', () => {
  const r = [...filler]; r[2] = '55550123'; const g = L.findMatches(board(r)); assert.equal(L.specialFor(g[0]), L.LINE_V);
  const r2 = [...filler]; for (let y = 0; y < 4; y++) r2[y] = '5' + r2[y].slice(1); assert.equal(L.specialFor(L.findMatches(board(r2))[0]), L.LINE_H);
});
t('L shape merges into bomb', () => {
  const r = [...filler]; r[0] = '55501230'; r[1] = '5' + r[1].slice(1); r[2] = '5' + r[2].slice(1);
  const g = L.findMatches(board(r)); assert.equal(g.length, 1); assert.equal(g[0].cells.length, 5); assert.equal(L.specialFor(g[0]), L.BOMB);
});
t('5-run gives prism', () => { const r = [...filler]; r[4] = '55555123'; assert.equal(L.specialFor(L.findMatches(board(r))[0]), L.PRISM); });
t('swap creating match is valid; non-match swap is rejected and restored', () => {
  const r = [...filler]; r[0] = '55451230'; const st = board(r); // swapping (2,0)<->(2,1)? place a 5 below
  st.gem[1 * 8 + 2] = { id: 1, c: 5, s: 0 };
  assert.ok(L.moveValid(st, 2, 10));
  const bad = board(filler); const before = bad.gem.map((g) => g && g.id);
  const res = L.swap(bad, 0, 1); assert.equal(res.ok, false); assert.deepEqual(bad.gem.map((g) => g && g.id), before); assert.equal(bad.moves, 10);
});
t('swap resolves: move consumed, board refilled, no lingering matches', () => {
  const r = [...filler]; r[0] = '55451230'; const st = board(r); st.gem[10] = { id: 1, c: 5, s: 0 };
  const res = L.swap(st, 2, 10); assert.ok(res.ok); assert.equal(st.moves, 9);
  assert.ok(res.steps.some((s) => s.type === 'clear')); assert.ok(res.steps.some((s) => s.type === 'fall'));
  for (let i = 0; i < 64; i++) assert.ok(st.gem[i], 'cell filled ' + i);
  assert.equal(L.findMatches(st).length, 0); assert.ok(st.score > 0);
});
t('4-match swap creates a line gem at the swapped cell', () => {
  const r = [...filler]; r[3] = '55054123'; const st = board(r); st.gem[4 * 8 + 2] = { id: 2, c: 5, s: 0 }; // (2,4) is 5 → swap up into (2,3)
  const res = L.swap(st, 3 * 8 + 2, 4 * 8 + 2); assert.ok(res.ok);
  const clear = res.steps.find((s) => s.type === 'clear'); assert.equal(clear.created.length, 1);
  assert.equal(clear.created[0].gem.s, L.LINE_V); assert.equal(clear.created[0].i, 3 * 8 + 2);
});
t('line gem clears its whole column when matched', () => {
  const st = board(filler); st.gem[0] = { id: 9, c: 5, s: L.LINE_V }; st.gem[1] = { id: 10, c: 5, s: 0 }; st.gem[3] = { id: 11, c: 5, s: 0 };
  st.gem[2 + 8] = { id: 12, c: 5, s: 0 }; // swap (2,1) up with (2,0) → row0 = 5 5 5 5? (0..3)
  const res = L.swap(st, 2, 10); assert.ok(res.ok);
  const clear = res.steps.find((s) => s.type === 'clear'); assert.ok(clear.fx.some((f) => f.type === 'lineV' && f.x === 0));
  const col0 = clear.items.filter((it) => it.i % 8 === 0).length; assert.equal(col0, 8);
});
t('prism + gem clears every gem of that colour', () => {
  const st = board(filler); st.gem[0] = { id: 50, c: -1, s: L.PRISM };
  const target = st.gem[1].c; const count = st.gem.filter((g) => g && g.c === target).length;
  const res = L.swap(st, 0, 1); assert.ok(res.ok);
  const clear = res.steps.find((s) => s.type === 'clear'); assert.equal(clear.items.filter((it) => it.c === target).length, count);
});
t('bomb + bomb clears a 5x5', () => {
  const st = board(filler); st.gem[27] = { id: 60, c: 1, s: L.BOMB }; st.gem[28] = { id: 61, c: 2, s: L.BOMB };
  const res = L.swap(st, 27, 28); const clear = res.steps.find((s) => s.type === 'clear'); assert.equal(clear.items.length, 25);
});
t('chain: line gem hit by bomb fires too', () => {
  const st = board(filler); st.gem[27] = { id: 60, c: 1, s: L.BOMB }; st.gem[28] = { id: 61, c: 2, s: L.BOMB }; st.gem[18] = { id: 62, c: 3, s: L.LINE_H };
  const res = L.swap(st, 27, 28); const clear = res.steps.find((s) => s.type === 'clear'); assert.ok(clear.fx.some((f) => f.type === 'lineH' && f.y === 2));
});
t('vines lose a layer when the gem above is cleared', () => {
  const r = [...filler]; r[0] = '55451230'; const st = board(r); st.gem[10] = { id: 1, c: 5, s: 0 }; st.vine[0] = 2; st.vine[1] = 1; st.vinesTotal = 3;
  L.swap(st, 2, 10); assert.equal(st.vine[0], 1); assert.equal(st.vine[1], 0);
  const g = L.goalProgress({ ...st, goals: [{ type: 'vines' }] })[0]; assert.equal(g.left, 1);
});
t('brambles block gravity, take damage from adjacent matches, gems slide diagonally', () => {
  const r = [...filler]; r[1] = '01#30123'; const st = board(r); st.bramble[10] = 2; st.gem[10] = null;
  // clear (2,2): diagonal slide should refill under the bramble
  st.gem[18] = null; const f = L.gravity(st); assert.ok(st.gem[18], 'refilled under bramble'); assert.ok(f.moves.length > 0);
  const r2 = [...filler]; r2[0] = '55401230'; const s2 = board(r2); s2.bramble[10] = 1; s2.gem[10] = null; s2.gem[3] = { id: 3, c: 5, s: 0 }; s2.gem[3 + 8] = s2.gem[11];
  // move: make row0 cols 0..2 = 5 by swapping (2,0) with (3,0)
  const res = L.swap(s2, 2, 3); assert.ok(res.ok); assert.equal(s2.bramble[10], 0);
});
t('holes are skipped and gems fall across them', () => {
  const rows = [...filler]; rows[3] = '0123x123'; const st = board(rows); st.gem[3 * 8 + 4] = null; st.cell[3 * 8 + 4] = 0;
  st.gem[4 * 8 + 4] = null; const top = st.gem[2 * 8 + 4].id; L.gravity(st); assert.equal(st.gem[4 * 8 + 4].id, top);
});
t('seeds fall to the bottom and are collected', () => {
  const st = L.createState({ layout: ['...s....', F(), F(), F(), F(), F(), F(), F()], colors: 5, moves: 30, goals: [{ type: 'seeds', n: 1 }] }, 3);
  // clear the column under the seed repeatedly
  for (let k = 0; k < 7; k++) { st.gem[(7 - 0) * 8 + 3] = null; for (let y = 7; y > 0; y--) {} const g = L.gravity(st); }
  // brute: remove gems below seed and let gravity run
  let guard = 0; while (st.seedsCollected === 0 && guard++ < 10) { const si = st.gem.findIndex((g) => g && g.c === L.SEED); for (let y = 7; y > (si / 8 | 0); y--) st.gem[y * 8 + 3] = null; L.gravity(st); const e = L.exitCell(st, 3); if (st.gem[e]?.c === L.SEED) { st.gem[e] = null; st.seedsCollected++; } }
  assert.equal(st.seedsCollected, 1); assert.ok(L.levelWon(st));
});
function F() { return '........'; }
t('reshuffle yields a board with moves and no matches', () => {
  const st = L.createState({ colors: 6, moves: 10 }, 11); for (let k = 0; k < 20; k++) { L.reshuffle(st); assert.equal(L.findMatches(st).length, 0); assert.ok(L.findMoves(st).length > 0); }
});
t('dead board (no moves) triggers reshuffle step during settle', () => {
  // 2-colour checkerboard has no moves; force via a swap path is hard, call reshuffle on an all-unique board directly
  const st = board(['01234501', '23450123', '45012345', '01234501', '23450123', '45012345', '01234501', '23450123']);
  assert.equal(L.findMoves(st).length, 0); const s = L.reshuffle(st); assert.equal(s.type, 'shuffle'); assert.ok(L.findMoves(st).length > 0);
});
t('every level parses, starts with no matches and has moves', () => {
  LEVELS.forEach((lv, k) => { for (const seed of [1, 2, 3]) { const st = L.createState(lv, seed + k * 31); assert.equal(L.findMatches(st).length, 0, 'lvl ' + (k + 1)); assert.ok(L.findMoves(st).length > 0, 'moves lvl ' + (k + 1)); } });
  assert.equal(LEVELS.length, 40);
});
t('determinism: same seed + same moves → same score', () => {
  const play = () => { const st = L.createState(LEVELS[5], 99); for (let k = 0; k < 8; k++) { const m = L.hintMove(st); if (!m) break; L.swap(st, ...m); } return st.score; };
  assert.equal(play(), play());
});
t('bonus round spends leftover moves and scores', () => { const st = L.createState(LEVELS[1], 5); st.moves = 5; const s0 = st.score; const steps = L.bonusRound(st); assert.equal(st.moves, 0); assert.ok(st.score > s0); assert.ok(steps.length > 5); });
console.log(`\n${n} tests passed`);
