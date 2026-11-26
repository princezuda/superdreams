// Perft proof for engine.js — run: node games/chess/perft.mjs
import { Chess, START_FEN, chess960Fen } from './engine.js';

const cases = [
  ['start', START_FEN, [20, 400, 8902, 197281]],
  ['kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq -', [48, 2039, 97862]],
  // extra well-known suites: en-passant/promotion/check edge cases (CPW positions 3-5)
  ['cpw3', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - -', [14, 191, 2812, 43238]],
  ['cpw4', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
  ['cpw5', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
  // Chess960 castling (from the standard 960 perft suite)
  ['960 #1', 'bqnb1rkr/pp3ppp/3ppn2/2p5/5P2/P2P4/NPP1P1PP/BQ1BNRKR w HFhf - 2 9', [21, 528, 12189]],
  ['960 #2', '2nnrbkr/p1qppppp/8/1ppb4/6PP/3PP3/PPP2P2/BQNNRBKR w HEhe - 1 9', [21, 807, 18002]],
];
let ok = true;
for (const [name, fen, expect] of cases) {
  const c = new Chess(fen);
  const got = [];
  const t0 = performance.now();
  for (let d = 1; d <= expect.length; d++) got.push(c.perft(d));
  const ms = (performance.now() - t0).toFixed(0);
  const pass = got.every((v, i) => v === expect[i]);
  ok &&= pass;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name.padEnd(9)} perft(1..${expect.length}) = ${got.join(', ')}${pass ? '' : '  expected ' + expect.join(', ')}  (${ms} ms)`);
}
// round-trip + misc sanity
const c = new Chess();
for (const s of ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O']) if (!c.move(s)) { ok = false; console.log('FAIL san move', s); }
console.log('FEN after Ruy Lopez + O-O:', c.fen());
ok &&= c.fen() === 'r1bqkb1r/1ppp1ppp/p1n2n2/4p3/B3P3/5N2/PPPP1PPP/RNBQ1RK1 b kq - 3 5';
const std = chess960Fen(518);
console.log('960 #518 =', std.split(' ')[0], std.startsWith('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR') ? 'PASS' : 'FAIL');
// draw rules
const rep = new Chess(); for (const s of ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']) rep.move(s);
console.log('threefold:', rep.status().reason); ok &&= rep.status().reason === 'threefold repetition';
console.log('insufficient KB v K:', new Chess('8/8/8/4k3/8/8/2B5/4K3 w - - 0 1').status().reason);
console.log('stalemate:', new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1').status().reason);
console.log('mate:', new Chess('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3').status().reason);
console.log('50-move:', new Chess('8/8/8/4k3/8/8/2R5/4K3 w - - 100 80').status().reason);
// randomized consistency: incremental Zobrist == recomputed, SAN round-trips, FEN round-trips, undo restores
let rs = 12345; const rand = (n) => { rs = (rs * 1103515245 + 12345) & 0x7fffffff; return rs % n; };
let checked = 0, bad = 0;
for (let g = 0; g < 60; g++) {
  const start = g % 3 === 0 ? chess960Fen(rand(960)) : START_FEN;
  const p = new Chess(start);
  for (let ply = 0; ply < 120; ply++) {
    const st = p.status(); if (st.over) break;
    const legal = st.legal;
    for (const m of legal) { const s = p.san(m, legal); if (p.parse(s, legal) !== m || p.parse(p.uci(m), legal) !== m) { bad++; console.log('SAN/UCI mismatch', s, p.fen()); } }
    const before = p.fen();
    p.move(legal[rand(legal.length)]);
    const lo = p.lo, hi = p.hi; p.computeHash();
    if (lo !== p.lo || hi !== p.hi) { bad++; console.log('hash mismatch', p.fen()); }
    const q = new Chess(p.fen()); if (q.fen() !== p.fen()) { bad++; console.log('FEN round-trip', p.fen(), q.fen()); }
    p.undo(); if (p.fen() !== before) { bad++; console.log('undo mismatch'); } p.move(legal[rand(legal.length)]);
    checked++;
  }
}
console.log(`random consistency: ${checked} positions, ${bad} problems`); ok &&= bad === 0;
console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
