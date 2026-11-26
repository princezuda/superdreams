// Checkers: Event Horizon — AI search (pure; runs inside ai-worker.js and in node tests).
// Negamax alpha-beta + iterative deepening, transposition table, killer/history ordering,
// forced-capture quiescence. Hazards are part of the search: applyMove() ticks every hole,
// grave, meteor and crater exactly as the real game does — only *new random spawns* are
// unknown to the AI (spawn:false), just as they are to a human.
import { RED, BLACK, DARK, sideOf, isKing, rowOf, colOf, NEIGHBORS, isDiagAdj, legalMoves, capturesFor, applyMove, moveKey, blockMask } from './rules.js';

const WIN = 100000;
export const LEVELS = {
  easy: { depth: 2, time: 250, noise: 60, blunder: 0.3 },
  medium: { depth: 4, time: 500, noise: 18, blunder: 0.06 },
  hard: { depth: 9, time: 900, noise: 0, blunder: 0 },
  master: { depth: 30, time: 2200, noise: 0, blunder: 0 },
};

// Zobrist-ish hashing (two 32-bit lanes) so the TT key is a single JS number.
const Z = (() => {
  let x = 0x9E3779B9; const r = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return x >>> 0; };
  const t = []; for (let i = 0; i < 64 * 5 + 64 * 8 + 2; i++) t.push(r() % 2 ** 26); // keep sums exact in doubles
  return t;
})();
function hashState(s) {
  let h = s.turn === RED ? Z[64 * 5] : 0, h2 = 0;
  const b = s.board;
  for (const q of DARK) { const p = b[q]; if (p) { h += Z[q * 5 + p + 2] * 3; h2 ^= Z[q * 5 + p + 2]; } }
  for (const o of s.holes) { h += Z[320 + o.sq * 8 + Math.min(o.warn, 3)] + o.life * 7919; }
  for (const g of s.graves) h += Z[320 + g.sq * 8 + 4] + g.ttl * 104729;
  for (const m of s.meteors) h += Z[320 + m.sq * 8 + 5] + m.warn * 1299709;
  for (const c of s.craters) h += Z[320 + c.sq * 8 + 6] + c.ttl * 15485863;
  return (h % 2 ** 40) * 4096 + (h2 & 4095); // the 40-move counter is deliberately not hashed (standard approximation)
}

// ---------------------------------------------------------------- evaluation (from the side-to-move's view)
const CENTER = new Set([sqOf(3, 2), sqOf(3, 4), sqOf(4, 3), sqOf(4, 5), sqOf(3, 0), sqOf(4, 7), sqOf(2, 3), sqOf(5, 4)].filter((q) => ((rowOf(q) + colOf(q)) & 1) === 1));
function sqOf(r, c) { return r * 8 + c; }
const CORE = new Set([sqOf(3, 2), sqOf(3, 4), sqOf(4, 3), sqOf(4, 5)]);

export function evaluate(s) {
  const b = s.board, block = s.graves.length || s.craters.length ? blockMask(s) : null;
  let score = 0, redMat = 0, blackMat = 0, redKings = [], blackKings = [], redCount = 0, blackCount = 0;
  const danger = new Uint8Array(64); // squares about to be swallowed
  for (const h of s.holes) if (h.warn > 0) { danger[h.sq] = 2; for (const n of NEIGHBORS[h.sq]) danger[n] = 2; }
  for (const m of s.meteors) danger[m.sq] = 1;
  for (const q of DARK) {
    const p = b[q]; if (!p) continue;
    const side = sideOf(p), r = rowOf(q), c = colOf(q);
    const adv = side === RED ? 7 - r : r; // rows advanced from own back row
    let v;
    if (isKing(p)) {
      v = 150; // kings ×1.5
      if (CORE.has(q)) v += 8; else if (CENTER.has(q)) v += 4;
      if (c === 0 || c === 7) v -= 6; // edge kings are passive
      (side === RED ? redKings : blackKings).push(q);
    } else {
      v = 100 + adv * 3 + (adv >= 5 ? 8 : 0) + (adv >= 6 ? 10 : 0);
      if (adv === 0) v += 9; // back-row guard: keeps enemy men from crowning
      if (CORE.has(q)) v += 6; else if (CENTER.has(q)) v += 3;
      if (c === 0 || c === 7) v -= 2;
      // cheap mobility: empty forward diagonals
      const fr = side === RED ? r - 1 : r + 1;
      if (fr >= 0 && fr < 8) {
        if (c > 0 && !b[fr * 8 + c - 1] && !(block && block[fr * 8 + c - 1])) v += 2;
        if (c < 7 && !b[fr * 8 + c + 1] && !(block && block[fr * 8 + c + 1])) v += 2;
      }
      // a man protected from behind is harder to trade off
      const br = side === RED ? r + 1 : r - 1;
      if (br >= 0 && br < 8) { if (c > 0 && sideOf(b[br * 8 + c - 1]) === side) v += 1; if (c < 7 && sideOf(b[br * 8 + c + 1]) === side) v += 1; }
    }
    if (danger[q]) v = Math.round(v * (danger[q] === 2 ? 0.35 : 0.25)); // telegraphed doom at the horizon
    for (const h of s.holes) if (h.warn === 0 && isDiagAdj(h.sq, q)) v -= 4; // hemmed in by the event horizon
    if (side === RED) { redMat += v; redCount++; } else { blackMat += v; blackCount++; }
  }
  score = redMat - blackMat;
  // Endgame: the side ahead wants trades and to hunt with its kings.
  const total = redCount + blackCount;
  if (total <= 10 && redMat !== blackMat) {
    const ahead = redMat > blackMat ? RED : BLACK;
    const hunters = ahead === RED ? redKings : blackKings;
    let dist = 0;
    for (const k of hunters) {
      let best = 14;
      for (const q of DARK) if (sideOf(b[q]) === -ahead) best = Math.min(best, Math.max(Math.abs(rowOf(q) - rowOf(k)), Math.abs(colOf(q) - colOf(k))));
      dist += best;
    }
    const trade = (24 - total) * 3;
    score += ahead * (trade - dist * 2);
  }
  return s.turn === RED ? score : -score;
}

// ---------------------------------------------------------------- search
export function createSearch() {
  const tt = new Map();
  let killers = [], history = new Map(), nodes = 0, deadline = 0, stopped = false;

  const order = (moves, ply, ttMove) => {
    const k = killers[ply] || [];
    for (const m of moves) {
      const key = moveKey(m);
      m._o = (ttMove && key === ttMove ? 1e7 : 0) + m.caps.length * 1e5 + (m.promote ? 5e4 : 0)
        + (k[0] === key ? 4e4 : k[1] === key ? 3e4 : 0) + (history.get(key) || 0);
    }
    moves.sort((a, b) => b._o - a._o);
    return moves;
  };

  function negamax(s, depth, alpha, beta, ply, ext) {
    if ((++nodes & 1023) === 0 && performance.now() > deadline) stopped = true;
    if (stopped) return 0;
    if (s.quiet >= s.opts.quietLimit) return 0;
    const moves = legalMoves(s);
    if (moves.length === 0) return -WIN + ply;
    const mine = countSide(s, s.turn); if (mine === 0) return -WIN + ply;
    const theirs = countSide(s, -s.turn); if (theirs === 0) return WIN - ply;
    const forced = moves[0].caps.length > 0 && s.opts.forceCapture;
    if (depth <= 0) {
      // Quiescence: never stand pat while a capture is forced (the position isn't quiet yet).
      if (!forced || ext >= 10) return evaluate(s);
      depth = 1; ext++;
    }
    const a0 = alpha, h = hashState(s), e = tt.get(h);
    let ttMove = null;
    if (e) {
      ttMove = e.move;
      if (e.depth >= depth) {
        if (e.flag === 0) return e.score;
        if (e.flag === 1 && e.score >= beta) return e.score;
        if (e.flag === -1 && e.score <= alpha) return e.score;
      }
    }
    order(moves, ply, ttMove);
    let best = -Infinity, bestMove = null;
    for (const m of moves) {
      const child = applyMove(s, m, { spawn: false, track: false, check: false });
      // single forced reply: don't burn depth on it
      const nd = moves.length === 1 ? depth : depth - 1;
      const v = -negamax(child, nd, -beta, -alpha, ply + 1, moves.length === 1 ? ext + 1 : ext);
      if (stopped) return 0;
      if (v > best) { best = v; bestMove = m; }
      if (v > alpha) alpha = v;
      if (alpha >= beta) {
        if (!m.caps.length) {
          const key = moveKey(m); const k = killers[ply] || (killers[ply] = []);
          if (k[0] !== key) { k[1] = k[0]; k[0] = key; }
          history.set(key, (history.get(key) || 0) + depth * depth);
        }
        break;
      }
    }
    if (tt.size > 600000) tt.clear();
    tt.set(h, { depth, score: best, flag: best <= a0 ? -1 : best >= beta ? 1 : 0, move: bestMove && moveKey(bestMove) });
    return best;
  }

  // Root: returns { move, score, depth, nodes, scores:[{move, score}] }
  function think(state, level = 'medium', rng = Math.random) {
    const L = typeof level === 'object' ? level : LEVELS[level] || LEVELS.medium;
    const moves = legalMoves(state);
    if (!moves.length) return { move: null, score: -WIN, depth: 0, nodes: 0 };
    if (moves.length === 1) return { move: moves[0], score: 0, depth: 0, nodes: 0, forced: true };
    nodes = 0; stopped = false; killers = []; history = new Map();
    const t0 = performance.now(); deadline = t0 + L.time;
    let scored = moves.map((m) => ({ move: m, score: 0 })), bestDepth = 0;
    for (let d = 1; d <= L.depth; d++) {
      const cur = [];
      let alpha = -Infinity;
      for (const sm of scored) {
        const child = applyMove(state, sm.move, { spawn: false, track: false, check: false });
        // full window when noise is used (we want honest scores for every root move)
        const v = -negamax(child, d - 1, -WIN - 1, L.noise ? WIN + 1 : -alpha, 1, 0);
        if (stopped) break;
        cur.push({ move: sm.move, score: v });
        if (v > alpha) alpha = v;
      }
      if (stopped && cur.length === 0) break;
      // partial iteration: keep searched moves (sorted) ahead of the unsearched remainder
      const seen = new Set(cur.map((c) => c.move));
      scored = cur.sort((a, b) => b.score - a.score).concat(stopped ? scored.filter((x) => !seen.has(x.move)) : []);
      bestDepth = d;
      if (stopped || Math.abs(scored[0].score) > WIN - 100) break;
      if (performance.now() - t0 > L.time * 0.55) break; // next ply would very likely overrun
    }
    let pick = scored[0];
    if (L.noise) {
      const noisy = scored.map((x) => ({ ...x, n: x.score + (rng() * 2 - 1) * L.noise }));
      noisy.sort((a, b) => b.n - a.n); pick = noisy[0];
    }
    if (L.blunder && rng() < L.blunder) pick = scored[Math.floor(rng() * scored.length)];
    return { move: pick.move, score: pick.score, depth: bestDepth, nodes, ms: Math.round(performance.now() - t0), scores: scored.slice(0, 5).map((x) => ({ key: moveKey(x.move), score: x.score })) };
  }
  return { think, clear: () => tt.clear() };
}

function countSide(s, side) { let n = 0; for (const q of DARK) if (sideOf(s.board[q]) === side) n++; return n; }
export { capturesFor };
