// node --test games/checkers/tests/   (pure rules + AI; no browser needed)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RED, BLACK, MODES, sqOf, nameOf, parseSq, legalMoves, applyMove, fromPosition, newGame, countPieces,
  blockMask, serialize, deserialize, DARK, sideOf, moveKey,
} from '../rules.js';
import { createSearch, LEVELS } from '../ai.js';

const S = (r, c) => sqOf(r, c);
const names = (moves) => moves.map((m) => m.path.map(nameOf).join(m.caps.length ? 'x' : '-')).sort();
const play = (s, from, to) => {
  const m = legalMoves(s).find((x) => x.from === parseSq(from) && x.to === parseSq(to));
  assert.ok(m, `move ${from}-${to} should be legal; legal: ${names(legalMoves(s))}`);
  return applyMove(s, m);
};

test('notation round-trips', () => {
  for (const q of DARK) assert.equal(parseSq(nameOf(q)), q);
  assert.equal(nameOf(S(7, 0)), 'a1');
  assert.equal(nameOf(S(0, 7)), 'h8');
});

test('opening position: 12 v 12, red has the 7 standard opening moves', () => {
  const s = newGame({}, 7);
  assert.deepEqual(countPieces(s, RED), { men: 12, kings: 0, total: 12 });
  assert.deepEqual(countPieces(s, BLACK), { men: 12, kings: 0, total: 12 });
  assert.equal(s.turn, RED);
  assert.equal(legalMoves(s).length, 7);
});

test('forced capture: only captures are legal when one exists', () => {
  const s = fromPosition({ c3: 1, g3: 1, d4: -1, h8: -1 });
  assert.deepEqual(names(legalMoves(s)), ['c3xe5']);
  const free = fromPosition({ c3: 1, g3: 1, d4: -1, h8: -1 }, { forceCapture: false });
  const n = names(legalMoves(free));
  assert.ok(n.includes('c3xe5') && n.includes('g3-f4') && n.includes('g3-h4') && n.includes('c3-b4'), n.join(' '));
});

test('men never capture backwards; kings do', () => {
  const man = fromPosition({ d4: 1, c3: -1, h8: -1 });
  assert.ok(legalMoves(man).every((m) => m.caps.length === 0));
  const king = fromPosition({ d4: 2, c3: -1, h8: -1 });
  assert.deepEqual(names(legalMoves(king)), ['d4xb2']);
});

test('multi-jump: branches enumerated, chain must be completed', () => {
  // b2 jumps c3 → d4, then may take c5 (→ b6) or e5 (→ f6); stopping on d4 is not allowed.
  const s = fromPosition({ b2: 1, c3: -1, c5: -1, e5: -1, a7: -1 });
  const moves = legalMoves(s);
  assert.deepEqual(names(moves), ['b2xd4xb6', 'b2xd4xf6']);
  assert.ok(moves.every((m) => m.caps.length === 2));
  const after = applyMove(s, moves.find((m) => m.to === parseSq('f6')));
  assert.equal(countPieces(after, BLACK).total, 2);
  assert.equal(after.captured[RED], 2);
});

test('multi-jump: triple chain + a piece cannot be jumped twice', () => {
  const s = fromPosition({ a1: 1, b2: -1, d4: -1, f6: -1, h8: -1 });
  assert.deepEqual(names(legalMoves(s)), ['a1xc3xe5xg7']);
  // king circling: may not re-jump the same piece
  const k = fromPosition({ c3: 2, d4: -1, f4: -1, d6: -1, b6: -1, a1: -1 });
  for (const m of legalMoves(k)) assert.equal(new Set(m.caps).size, m.caps.length);
});

test('promotion ends the chain (even if the new king could keep jumping)', () => {
  const s = fromPosition({ b6: 1, c7: -1, e7: -1, a1: -1 });
  const moves = legalMoves(s);
  assert.deepEqual(names(moves), ['b6xd8']);
  assert.equal(moves[0].promote, true);
  const after = applyMove(s, moves[0]);
  assert.equal(after.board[parseSq('d8')], 2);
  assert.equal(after.board[parseSq('e7')], -1, 'e7 survives: turn ended at crowning');
  assert.equal(after.quiet, 0);
});

test('simple move onto far row crowns', () => {
  const s = fromPosition({ c7: 1, a1: -1 });
  const m = legalMoves(s).find((x) => x.to === parseSq('d8'));
  assert.ok(m.promote);
  assert.equal(applyMove(s, m).board[parseSq('d8')], 2);
});

test('no-move loss: side to move with pieces but no legal moves loses', () => {
  const s = fromPosition({ a1: 1, c1: 1, a3: 1, c3: 1, b2: -1 });
  assert.equal(legalMoves(s, BLACK).length, 0);
  const after = play(s, 'c3', 'd4');
  assert.deepEqual(after.result, { winner: RED, reason: 'No legal moves' });
});

test('no-pieces loss', () => {
  const s = fromPosition({ c3: 1, d4: -1 });
  const after = play(s, 'c3', 'e5');
  assert.equal(after.result.winner, RED);
  assert.equal(after.result.reason, 'No pieces left');
});

test('40-move rule: draw after 40 moves each without capture or promotion', () => {
  let s = fromPosition({ a1: 2, h8: -2 });
  for (let i = 0; i < 80; i++) {
    assert.equal(s.result, null, `ply ${i}`);
    // walk kings around without repeating a position 3 times: alternate targets
    const moves = legalMoves(s);
    s = applyMove(s, moves[(i * 7) % moves.length], { track: false }); // repetition tracking off: isolate the counter
  }
  assert.equal(s.quiet, 80);
  assert.deepEqual(s.result, { winner: 0, reason: '40-move rule' });
});

test('draw counter resets on capture and on promotion', () => {
  let s = fromPosition({ c3: 1, d4: -1, h8: -2, a1: 2 });
  s.quiet = 50;
  s = play(s, 'c3', 'e5');
  assert.equal(s.quiet, 0);
  let p = fromPosition({ c7: 1, a1: -2 }); p.quiet = 60;
  p = play(p, 'c7', 'd8');
  assert.equal(p.quiet, 0);
  let q = fromPosition({ c3: 1, a7: -1 }); q.quiet = 10;
  q = play(q, 'c3', 'd4');
  assert.equal(q.quiet, 11, 'a man move is still a quiet move');
});

test('threefold repetition is a draw', () => {
  let s = fromPosition({ a1: 2, h8: -2 });
  const seq = [['a1', 'b2'], ['h8', 'g7'], ['b2', 'a1'], ['g7', 'h8']];
  let i = 0;
  while (!s.result && i < 12) { const [f, t] = seq[i % 4]; s = play(s, f, t); i++; }
  assert.equal(i, 8);
  assert.deepEqual(s.result, { winner: 0, reason: 'Threefold repetition' });
});

test('flying kings: long slides and long-range captures', () => {
  const s = fromPosition({ a1: 2, h2: -1 }, { flyingKings: true });
  assert.equal(legalMoves(s).length, 7);
  const c = fromPosition({ a1: 2, e5: -1, h2: -1 }, { flyingKings: true });
  assert.deepEqual(names(legalMoves(c)), ['a1xf6', 'a1xg7', 'a1xh8']);
  const n = fromPosition({ a1: 2, e5: -1, h2: -1 });
  assert.ok(legalMoves(n).every((m) => m.caps.length === 0), 'short kings cannot capture at range');
});

test('black hole: mover ending next to a live hole is swallowed (counts for nobody)', () => {
  let s = fromPosition({ b2: 1, h8: -1, a7: -1 }, { mode: 'blackholes' });
  s.holes = [{ sq: parseSq('d4'), warn: 0, life: 6 }];
  s = play(s, 'b2', 'c3');
  assert.equal(s.board[parseSq('c3')], 0);
  assert.equal(s.lost[RED], 1);
  assert.equal(s.captured[BLACK], 0);
  assert.ok(s.events.some((e) => e.type === 'suck'));
  assert.equal(s.result.winner, BLACK);
});

test('black hole: telegraphed hole opens and pulls in neighbours; then evaporates', () => {
  let s = fromPosition({ c3: 1, e3: -1, a1: 1, h8: -1 }, { mode: 'blackholes', holeEvery: 99 });
  s.holes = [{ sq: parseSq('d4'), warn: 1, life: 2 }];
  s = play(s, 'a1', 'b2');
  assert.equal(s.board[parseSq('c3')], 0);
  assert.equal(s.board[parseSq('e3')], 0);
  assert.equal(s.lost[RED] + s.lost[BLACK], 2);
  assert.equal(s.holes[0].warn, 0);
  s = play(s, 'h8', 'g7'); s = play(s, 'b2', 'a3');
  assert.equal(s.holes.length, 0, 'hole evaporated');
  assert.ok(s.events.some((e) => e.type === 'holeClose'));
});

test('black holes spawn telegraphed on empty dark squares every holeEvery rounds', () => {
  let s = newGame({ mode: 'blackholes', holeEvery: 2 }, 42);
  let warned = 0;
  for (let i = 0; i < 40 && !s.result; i++) {
    s = applyMove(s, legalMoves(s)[0]);
    for (const e of s.events) if (e.type === 'holeWarn') { warned++; assert.equal(s.board[e.sq], 0); assert.ok(DARK.includes(e.sq)); }
  }
  assert.ok(warned >= 3, `holes spawned: ${warned}`);
});

test('graves: captured piece leaves a grave that blocks its square for graveTurns full turns', () => {
  let s = fromPosition({ c3: 1, d4: -1, a7: -1, g1: 1, h8: -1 }, { mode: 'graves', graveTurns: 3 });
  s = play(s, 'c3', 'e5');
  assert.equal(s.graves.length, 1);
  const g = parseSq('d4');
  assert.equal(s.graves[0].sq, g);
  assert.equal(blockMask(s)[g], 1);
  let plies = 0;
  while (s.graves.length && !s.result) {
    assert.ok(legalMoves(s).every((m) => !m.path.includes(g)), 'nothing may land on a grave');
    s = applyMove(s, legalMoves(s)[0]); plies++;
  }
  assert.equal(plies, 6, 'grave lasts exactly 3 full turns');
});

test('graves: cannot jump onto a grave square', () => {
  const s = fromPosition({ c3: 1, d4: -1, h8: -1 }, { mode: 'graves' });
  s.graves = [{ sq: parseSq('e5'), ttl: 4, max: 6, piece: -1 }];
  assert.ok(legalMoves(s).every((m) => m.caps.length === 0));
});

test('meteors: impact destroys the occupant and craters the square', () => {
  let s = fromPosition({ c3: 1, a1: 1, h8: -1, f6: -1 }, { mode: 'meteors', meteorEvery: 99 });
  s.meteors = [{ sq: parseSq('f6'), warn: 1 }];
  s = play(s, 'a1', 'b2');
  assert.equal(s.board[parseSq('f6')], 0);
  assert.equal(s.lost[BLACK], 1);
  assert.equal(s.craters.length, 1);
  assert.equal(blockMask(s)[parseSq('f6')], 1);
  let n = 0; while (s.craters.length) { s = applyMove(s, legalMoves(s)[0]); n++; }
  assert.equal(n, 4, 'crater lasts 2 full turns');
});

test('portals: landing on one exits the other; blocked exit keeps you in place', () => {
  let s = fromPosition({ g3: 1, a7: -1 }, { mode: 'portals' });
  s.portals = [parseSq('a5'), parseSq('h4')];
  s = play(s, 'g3', 'h4');
  assert.equal(s.board[parseSq('a5')], 1);
  assert.equal(s.board[parseSq('h4')], 0);
  assert.ok(s.events.some((e) => e.type === 'portal'));
  let b = fromPosition({ g3: 1, a5: -1, a7: -1 }, { mode: 'portals' });
  b.portals = [parseSq('a5'), parseSq('h4')];
  b = play(b, 'g3', 'h4');
  assert.equal(b.board[parseSq('h4')], 1);
});

test('portal placement is mirror-symmetric and starts empty', () => {
  for (let seed = 1; seed < 30; seed++) {
    const s = newGame({ mode: 'portals' }, seed);
    const [a, b] = s.portals;
    assert.equal(a + b, 63, 'mirror pair');
    assert.equal(s.board[a], 0); assert.equal(s.board[b], 0);
  }
});

test('save/load round-trip', () => {
  let s = newGame({ mode: 'graves' }, 3);
  for (let i = 0; i < 10; i++) s = applyMove(s, legalMoves(s)[0]);
  const back = deserialize(JSON.parse(JSON.stringify(serialize(s))));
  assert.deepEqual(names(legalMoves(back)), names(legalMoves(s)));
  assert.equal(back.board instanceof Int8Array, true);
});

test('fuzz: 150 random games per mode keep every invariant and terminate', () => {
  let seed = 1;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const mode of MODES) for (const flyingKings of [false, true]) {
    for (let g = 0; g < 75; g++) {
      let s = newGame({ mode, flyingKings, forceCapture: g % 5 !== 0 }, g * 977 + 13);
      let plies = 0;
      while (!s.result) {
        const moves = legalMoves(s);
        assert.ok(moves.length > 0);
        const block = blockMask(s);
        for (const m of moves) for (const q of m.path.slice(1)) assert.equal(block[q], 0, 'moved through a blocked square');
        s = applyMove(s, moves[Math.floor(rng() * moves.length)]);
        for (const q of DARK) if (s.board[q]) assert.equal(block[q] && !s.events.length, 0);
        for (let q = 0; q < 64; q++) if (!DARK.includes(q)) assert.equal(s.board[q], 0, 'piece on a light square');
        const r = countPieces(s, RED).total, b = countPieces(s, BLACK).total;
        assert.equal(r + s.captured[BLACK] + s.lost[RED], 12, `${mode}: red accounting`);
        assert.equal(b + s.captured[RED] + s.lost[BLACK], 12, `${mode}: black accounting`);
        assert.ok(++plies < 2000, 'game must terminate');
      }
    }
  }
});

test('AI: returns a legal move from the opening at every level', () => {
  const ai = createSearch();
  const s = newGame({}, 5);
  const legal = new Set(legalMoves(s).map(moveKey));
  for (const lvl of Object.keys(LEVELS)) {
    const r = ai.think(s, { ...LEVELS[lvl], time: Math.min(LEVELS[lvl].time, 300) });
    assert.ok(legal.has(moveKey(r.move)), lvl);
  }
});

test('AI: finds a sacrifice shot (one man for three + a crown)', () => {
  // c3-b4! forces a5xc3, then b2xd4xb6xd8 takes three and crowns (a winning shot).
  const s = fromPosition({ a1: 1, b2: 1, a3: 1, c3: 1, h2: 1, a5: -1, c5: -1, c7: -1, h8: -1 });
  const r = createSearch().think(s, { depth: 6, time: 3000, noise: 0, blunder: 0 });
  assert.equal(nameOf(r.move.from) + '-' + nameOf(r.move.to), 'c3-b4');
  assert.ok(r.score > 150, `score ${r.score}`);
});

test('AI: evacuates a piece from a telegraphed black hole', () => {
  // hole at d4 opens after this ply: c3 must step out (to b4), not stay adjacent
  const s = fromPosition({ c3: 1, h2: 1, a7: -1, h8: -1 }, { mode: 'blackholes', holeEvery: 99 });
  s.holes = [{ sq: parseSq('d4'), warn: 1, life: 6 }];
  const r = createSearch().think(s, { depth: 4, time: 1000, noise: 0, blunder: 0 });
  assert.equal(nameOf(r.move.from), 'c3');
  assert.equal(nameOf(r.move.to), 'b4');
});

test('AI vs AI: complete games in every mode (medium vs hard, short clocks)', () => {
  for (const mode of MODES) {
    let s = newGame({ mode, holeEvery: 2 }, 1234);
    const a = createSearch(), b = createSearch();
    let plies = 0;
    while (!s.result && plies < 300) {
      const lvl = s.turn === RED ? { ...LEVELS.medium, time: 40 } : { ...LEVELS.hard, time: 40, depth: 5 };
      const r = (s.turn === RED ? a : b).think(s, lvl);
      assert.ok(r.move, `${mode}: AI produced no move`);
      s = applyMove(s, r.move); plies++;
    }
    console.log(`  ${mode}: ${plies} plies → ${s.result ? (s.result.winner === RED ? 'red' : s.result.winner === BLACK ? 'black' : 'draw') + ' (' + s.result.reason + ')' : 'unfinished (cap)'}`);
    assert.ok(plies > 10);
  }
});
