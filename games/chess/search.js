// Chess: Worlds — AI search. Iterative-deepening negamax alpha-beta (PVS + null move + LMR), quiescence search,
// transposition table, MVV-LVA + killer + history move ordering, tapered piece-square-table evaluation.
// Pure module: used by ai-worker.js in the browser and directly by node tests.
import { Chess, WHITE, BLACK, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING, F_CAP, F_CASTLE, mFrom, mTo, mPromo, mFlags } from './engine.js';

export const INF = 32000, MATE = 30000;
const MAXP = 96;

// ---------------------------------------------------------------- evaluation tables (Simplified Evaluation Function, rank 8 first)
const T = {
  [PAWN]: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  [KNIGHT]: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
  [BISHOP]: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
  [ROOK]: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
  [QUEEN]: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
  [KING]: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
};
const KING_EG = [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50];
const PAWN_EG_RANK = [0, 0, 5, 12, 22, 38, 60, 0];
const MAT_MG = [0, 100, 320, 330, 500, 900, 0], MAT_EG = [0, 120, 300, 320, 530, 940, 0];
const PHASE = [0, 0, 1, 1, 2, 4, 0];
const PASSED_MG = [0, 0, 5, 10, 18, 30, 50, 0], PASSED_EG = [0, 0, 12, 22, 40, 70, 115, 0];

// PST[color][type] -> Int16Array(128) for mg and eg, indexed by 0x88 square
const PMG = [[], []], PEG = [[], []];
for (let color = 0; color < 2; color++) for (let t = 1; t <= 6; t++) {
  const mg = new Int16Array(128), eg = new Int16Array(128);
  for (let i = 0; i < 64; i++) {
    const rank = 7 - (i >> 3), file = i & 7;
    const sq = (color === WHITE ? rank : 7 - rank) * 16 + file;
    const relRank = rank; // rank from the owner's point of view
    mg[sq] = MAT_MG[t] + T[t][i];
    eg[sq] = MAT_EG[t] + (t === KING ? KING_EG[i] : t === PAWN ? PAWN_EG_RANK[relRank] + (T[t][i] >> 1) : T[t][i]);
  }
  PMG[color][t] = mg; PEG[color][t] = eg;
}

const pawnFiles = [new Int8Array(8), new Int8Array(8)];
const pawnMinRank = [new Int8Array(8), new Int8Array(8)], pawnMaxRank = [new Int8Array(8), new Int8Array(8)];

export function evaluate(c) {
  const b = c.b;
  let mgW = 0, mgB = 0, egW = 0, egB = 0, phase = 0, bW = 0, bB = 0;
  const pfW = pawnFiles[0], pfB = pawnFiles[1];
  pfW.fill(0); pfB.fill(0);
  const minW = pawnMinRank[0], maxB = pawnMaxRank[1], maxW = pawnMaxRank[0], minB = pawnMinRank[1];
  minW.fill(9); minB.fill(9); maxW.fill(-1); maxB.fill(-1);
  for (let s = 0; s < 128; s++) {
    if (s & 0x88) { s += 7; continue; }
    const p = b[s]; if (!p) continue;
    const t = p & 7, col = p >> 3;
    phase += PHASE[t];
    if (col === WHITE) {
      mgW += PMG[0][t][s]; egW += PEG[0][t][s];
      if (t === PAWN) { const f = s & 7, r = s >> 4; pfW[f]++; if (r < minW[f]) minW[f] = r; if (r > maxW[f]) maxW[f] = r; }
      else if (t === BISHOP) bW++;
    } else {
      mgB += PMG[1][t][s]; egB += PEG[1][t][s];
      if (t === PAWN) { const f = s & 7, r = s >> 4; pfB[f]++; if (r < minB[f]) minB[f] = r; if (r > maxB[f]) maxB[f] = r; }
      else if (t === BISHOP) bB++;
    }
  }
  if (bW >= 2) { mgW += 30; egW += 45; }
  if (bB >= 2) { mgB += 30; egB += 45; }
  // pawn structure: doubled, isolated, passed
  for (let f = 0; f < 8; f++) {
    const l = f > 0 ? f - 1 : f, r = f < 7 ? f + 1 : f;
    if (pfW[f]) {
      if (pfW[f] > 1) { mgW -= 12 * (pfW[f] - 1); egW -= 20 * (pfW[f] - 1); }
      if (!(f > 0 && pfW[f - 1]) && !(f < 7 && pfW[f + 1])) { mgW -= 10; egW -= 14; }
      // passed: no black pawn ahead on this or adjacent files (ahead = higher rank for white)
      const front = maxW[f];
      let passed = true;
      for (let g = l; g <= r; g++) if (pfB[g] && maxB[g] > front) passed = false;
      if (passed) { mgW += PASSED_MG[front]; egW += PASSED_EG[front]; }
    }
    if (pfB[f]) {
      if (pfB[f] > 1) { mgB -= 12 * (pfB[f] - 1); egB -= 20 * (pfB[f] - 1); }
      if (!(f > 0 && pfB[f - 1]) && !(f < 7 && pfB[f + 1])) { mgB -= 10; egB -= 14; }
      const front = minB[f];
      let passed = true;
      for (let g = l; g <= r; g++) if (pfW[g] && minW[g] < front) passed = false;
      if (passed) { mgB += PASSED_MG[7 - front]; egB += PASSED_EG[7 - front]; }
    }
  }
  // rooks on open / semi-open files
  for (let s = 0; s < 128; s++) {
    if (s & 0x88) { s += 7; continue; }
    const p = b[s]; if ((p & 7) !== ROOK) continue;
    const f = s & 7;
    if (p >> 3) { if (!pfB[f]) { mgB += pfW[f] ? 8 : 18; egB += pfW[f] ? 4 : 10; } }
    else if (!pfW[f]) { mgW += pfB[f] ? 8 : 18; egW += pfB[f] ? 4 : 10; }
  }
  if (phase > 24) phase = 24;
  const score = (((mgW - mgB) * phase + (egW - egB) * (24 - phase)) / 24) | 0;
  return (c.turn === WHITE ? score : -score) + 10; // +tempo
}

// ---------------------------------------------------------------- search state
const TT_BITS = 20, TT_SIZE = 1 << TT_BITS, TT_MASK = TT_SIZE - 1;
const ttKey = new Int32Array(TT_SIZE), ttMove = new Int32Array(TT_SIZE), ttScore = new Int16Array(TT_SIZE), ttDepth = new Int8Array(TT_SIZE), ttFlag = new Uint8Array(TT_SIZE);
const EXACT = 1, LOWER = 2, UPPER = 3;
const moveBuf = new Int32Array(MAXP * 256), scoreBuf = new Int32Array(MAXP * 256);
const killers = new Int32Array(MAXP * 2);
const history = new Int32Array(16 * 128);
let nodes = 0, deadline = 0, stop = false, rootBest = 0, rootBestScore = 0;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function hasNonPawn(c, color) {
  const b = c.b;
  for (let s = 0; s < 128; s++) { if (s & 0x88) { s += 7; continue; } const p = b[s]; if (p && (p >> 3) === color) { const t = p & 7; if (t !== PAWN && t !== KING) return true; } }
  return false;
}

function scoreMoves(c, base, n, ttm, ply) {
  const b = c.b, k1 = killers[ply * 2], k2 = killers[ply * 2 + 1];
  for (let i = base; i < n; i++) {
    const m = moveBuf[i];
    let s;
    if (m === ttm) s = 2000000;
    else {
      const fl = mFlags(m), pr = mPromo(m);
      if (fl & F_CAP) { const victim = (fl & 4) ? PAWN : b[mTo(m)] & 7; s = 1000000 + victim * 100 - (b[mFrom(m)] & 7); }
      else if (pr === QUEEN) s = 950000;
      else if (m === k1) s = 900000;
      else if (m === k2) s = 890000;
      else s = history[(b[mFrom(m)] & 15) * 128 + mTo(m)];
      if (pr && pr !== QUEEN) s -= 500000; // under-promotions last
    }
    scoreBuf[i] = s;
  }
}
function pick(i, n) {
  let best = i;
  for (let j = i + 1; j < n; j++) if (scoreBuf[j] > scoreBuf[best]) best = j;
  if (best !== i) {
    const tm = moveBuf[i]; moveBuf[i] = moveBuf[best]; moveBuf[best] = tm;
    const ts = scoreBuf[i]; scoreBuf[i] = scoreBuf[best]; scoreBuf[best] = ts;
  }
  return moveBuf[i];
}

function quiesce(c, alpha, beta, ply) {
  if ((++nodes & 2047) === 0 && now() > deadline) stop = true;
  if (stop) return 0;
  const stand = evaluate(c);
  if (stand >= beta) return stand;
  if (stand > alpha) alpha = stand;
  if (ply >= MAXP - 1) return stand;
  const base = ply * 256, n = c.gen(moveBuf, base, true), us = c.turn;
  scoreMoves(c, base, n, 0, ply);
  let best = stand;
  for (let i = base; i < n; i++) {
    const m = pick(i, n);
    const fl = mFlags(m);
    if ((fl & F_CAP) && !mPromo(m)) {
      const victim = (fl & 4) ? PAWN : c.b[mTo(m)] & 7;
      if (stand + MAT_MG[victim] + 200 < alpha) continue; // delta pruning
    }
    c.make(m);
    if (c.attacked(c.kings[us], us ^ 1)) { c.unmake(); continue; }
    const s = -quiesce(c, -beta, -alpha, ply + 1);
    c.unmake();
    if (stop) return 0;
    if (s > best) { best = s; if (s > alpha) { alpha = s; if (s >= beta) return s; } }
  }
  return best;
}

function negamax(c, depth, alpha, beta, ply, doNull) {
  if ((++nodes & 2047) === 0 && now() > deadline) stop = true;
  if (stop) return 0;
  const us = c.turn;
  if (ply > 0) {
    if (c.half >= 100 || c.repetitions() > 0) return 0;
    const a = Math.max(alpha, -MATE + ply), bb = Math.min(beta, MATE - ply - 1);
    if (a >= bb) return a;
    alpha = a; beta = bb;
  }
  const inCheck = c.attacked(c.kings[us], us ^ 1);
  if (inCheck && ply < MAXP - 8) depth++;
  if (depth <= 0 || ply >= MAXP - 2) return quiesce(c, alpha, beta, ply);
  const pv = beta - alpha > 1;
  const idx = c.lo & TT_MASK;
  let ttm = 0;
  if (ttKey[idx] === c.hi && ttFlag[idx]) {
    ttm = ttMove[idx];
    if (ply > 0 && ttDepth[idx] >= depth) {
      let s = ttScore[idx];
      if (s > MATE - 500) s -= ply; else if (s < -MATE + 500) s += ply;
      const f = ttFlag[idx];
      if (f === EXACT && !pv) return s;
      if (f === LOWER && s >= beta) return s;
      if (f === UPPER && s <= alpha) return s;
    }
  }
  // null-move pruning
  if (doNull && !inCheck && !pv && depth >= 3 && hasNonPawn(c, us) && evaluate(c) >= beta) {
    c.makeNull();
    const s = -negamax(c, depth - 1 - (depth > 6 ? 3 : 2), -beta, -beta + 1, ply + 1, false);
    c.unmakeNull();
    if (stop) return 0;
    if (s >= beta) return s > MATE - 500 ? beta : s;
  }
  // futility (frontier) pruning flag
  let futile = false;
  if (!pv && !inCheck && depth <= 2 && Math.abs(alpha) < MATE - 500) {
    const margin = depth === 1 ? 180 : 400;
    if (evaluate(c) + margin <= alpha) futile = true;
  }
  const base = ply * 256, n = c.gen(moveBuf, base);
  scoreMoves(c, base, n, ttm, ply);
  let best = -INF, bestMove = 0, legal = 0;
  const origAlpha = alpha;
  for (let i = base; i < n; i++) {
    const m = pick(i, n);
    const fl = mFlags(m), quiet = !(fl & F_CAP) && !mPromo(m);
    c.make(m);
    if (c.attacked(c.kings[us], us ^ 1)) { c.unmake(); continue; }
    legal++;
    const givesCheck = c.attacked(c.kings[c.turn], us);
    if (futile && quiet && !givesCheck && legal > 1) { c.unmake(); continue; }
    let s;
    if (legal === 1) s = -negamax(c, depth - 1, -beta, -alpha, ply + 1, true);
    else {
      let r = 0;
      if (depth >= 3 && quiet && legal > 3 && !inCheck && !givesCheck && m !== killers[ply * 2] && m !== killers[ply * 2 + 1]) r = legal > 10 && depth > 4 ? 2 : 1;
      s = -negamax(c, depth - 1 - r, -alpha - 1, -alpha, ply + 1, true);
      if (s > alpha && r) s = -negamax(c, depth - 1, -alpha - 1, -alpha, ply + 1, true);
      if (s > alpha && s < beta) s = -negamax(c, depth - 1, -beta, -alpha, ply + 1, true);
    }
    c.unmake();
    if (stop) return 0;
    if (s > best) {
      best = s; bestMove = m;
      if (ply === 0) { rootBest = m; rootBestScore = s; }
      if (s > alpha) {
        alpha = s;
        if (s >= beta) {
          if (quiet) {
            if (killers[ply * 2] !== m) { killers[ply * 2 + 1] = killers[ply * 2]; killers[ply * 2] = m; }
            const h = (c.b[mFrom(m)] & 15) * 128 + mTo(m);
            history[h] = Math.min(history[h] + depth * depth, 800000);
          }
          break;
        }
      }
    }
  }
  if (!legal) return inCheck ? -MATE + ply : 0;
  let ss = best;
  if (ss > MATE - 500) ss += ply; else if (ss < -MATE + 500) ss -= ply;
  ttKey[idx] = c.hi; ttMove[idx] = bestMove; ttScore[idx] = ss; ttDepth[idx] = depth;
  ttFlag[idx] = best <= origAlpha ? UPPER : best >= beta ? LOWER : EXACT;
  return best;
}

function pvLine(c, first, maxLen = 8) {
  const line = [], played = [];
  let m = first;
  while (m && line.length < maxLen) {
    const legal = c.legal(); if (!legal.includes(m)) break;
    line.push(c.san(m, legal)); c.make(m); played.push(m);
    const idx = c.lo & TT_MASK; m = ttKey[idx] === c.hi ? ttMove[idx] : 0;
    if (c.repetitions() > 0) break;
  }
  for (let i = 0; i < played.length; i++) c.unmake();
  return line;
}

// ---------------------------------------------------------------- levels
export const LEVELS = {
  easy: { multiDepth: 2, noise: 120, blunder: 0.18, blunderMargin: 450, missMate: 0.4, timeMs: 400 },
  medium: { multiDepth: 3, noise: 35, blunder: 0.05, blunderMargin: 160, missMate: 0.05, timeMs: 900 },
  hard: { maxDepth: 6, timeMs: 1000 },
  master: { maxDepth: 40, timeMs: 1500 },
  hint: { maxDepth: 8, timeMs: 900 },
};

let rng = Math.random;
export function setRandom(fn) { rng = fn; }
const gauss = () => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

function resetHeuristics() { killers.fill(0); for (let i = 0; i < history.length; i++) history[i] >>= 2; }

// Full search: returns { move, score, depth, nodes, ms, pv }
export function searchBest(c, { maxDepth = 6, timeMs = 1000 } = {}) {
  const t0 = now(); nodes = 0; stop = false; deadline = t0 + timeMs; resetHeuristics();
  const legal = c.legal();
  if (!legal.length) return null;
  let bestMove = legal[0], bestScore = 0, depthDone = 0;
  if (legal.length === 1) return { move: bestMove, score: evaluate(c), depth: 0, nodes: 0, ms: 0, pv: [c.san(bestMove, legal)] };
  for (let d = 1; d <= maxDepth; d++) {
    rootBest = 0;
    const s = negamax(c, d, -INF, INF, 0, false);
    if (stop) { if (rootBest && d > 1 && rootBestScore > bestScore - 30) { bestMove = rootBest; bestScore = rootBestScore; } break; }
    if (rootBest) { bestMove = rootBest; bestScore = s; }
    depthDone = d;
    if (Math.abs(s) > MATE - 200 && d >= 2) break;
    if (now() - t0 > timeMs * 0.55) break; // next iteration would not finish
  }
  return { move: bestMove, score: bestScore, depth: depthDone, nodes, ms: Math.round(now() - t0), pv: pvLine(c, bestMove) };
}

// Score every root move with a full window (used for human-like levels).
export function scoreRoot(c, depth, timeMs = 2000) {
  const t0 = now(); nodes = 0; stop = false; deadline = t0 + timeMs; resetHeuristics();
  const legal = c.legal(), out = [];
  for (const m of legal) {
    c.make(m);
    const s = -negamax(c, depth - 1, -INF, INF, 1, true);
    c.unmake();
    if (stop) break;
    out.push({ m, s });
  }
  // moves not reached before the deadline get a static estimate so they are still candidates
  if (out.length < legal.length) for (const m of legal) if (!out.find((o) => o.m === m)) { c.make(m); out.push({ m, s: -evaluate(c) }); c.unmake(); }
  out.sort((a, b) => b.s - a.s);
  return { list: out, nodes, ms: Math.round(now() - t0) };
}

export function think(c, level = 'medium') {
  const L = LEVELS[level] || LEVELS.medium;
  if (L.multiDepth) {
    const { list, nodes: nn, ms } = scoreRoot(c, L.multiDepth, L.timeMs);
    if (!list.length) return null;
    const top = list[0];
    let choice = top;
    if (top.s > MATE - 200 && rng() > L.missMate) choice = top;
    else if (rng() < L.blunder) {
      const pool = list.filter((o) => o.s >= top.s - L.blunderMargin && o.s > -MATE + 200);
      choice = pool[Math.floor(rng() * pool.length)] || top;
    } else {
      let bestNoisy = -Infinity;
      for (const o of list) { const v = o.s + gauss() * L.noise; if (v > bestNoisy) { bestNoisy = v; choice = o; } }
    }
    return { move: choice.m, score: choice.s, depth: L.multiDepth, nodes: nn, ms, pv: [c.san(choice.m)] };
  }
  return searchBest(c, L);
}

// Build a position from a start FEN plus UCI history (keeps repetition history intact).
export function position(startFen, moves = []) {
  const c = new Chess(startFen);
  for (const u of moves) if (!c.move(u)) throw new Error('illegal history move ' + u);
  return c;
}

export function formatScore(score, turn) {
  // score is from side-to-move POV; return white POV text
  const s = turn === WHITE ? score : -score;
  if (Math.abs(s) > MATE - 200) { const n = Math.ceil((MATE - Math.abs(s)) / 2); return (s > 0 ? '+M' : '-M') + n; }
  return (s >= 0 ? '+' : '') + (s / 100).toFixed(2);
}
export { BLACK, KING, F_CASTLE };
