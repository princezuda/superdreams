// Solitaire Suite — pure rules for Klondike, Spider and FreeCell + a FreeCell solver that guarantees every seeded
// deal is winnable. No DOM. Cards are ints: suit = (c % 52) / 13 | 0 (0♠ 1♥ 2♦ 3♣), rank = c % 13 + 1. Spider uses 0..103.
export const SUITS = ['♠', '♥', '♦', '♣'];
export const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const suit = (c) => ((c % 52) / 13) | 0;
export const rank = (c) => (c % 13) + 1;
export const red = (c) => { const s = suit(c); return s === 1 || s === 2; };
export const name = (c) => RANKS[rank(c)] + SUITS[suit(c)];

export const makeRng = (seed) => ({ s: (seed >>> 0) || 7 });
export function rnd(r) { let t = (r.s = (r.s + 0x6d2b79f5) | 0); t = Math.imul(t ^ (t >>> 15), 1 | t); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
export function shuffled(cards, seed) { const a = cards.slice(), r = makeRng(seed); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd(r) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const C = (c, up = true, id = 0) => ({ c, up, id }); // id: stable identity for animation (Spider has duplicate faces)
export const clone = (s) => JSON.parse(JSON.stringify(s));

// ---------------------------------------------------------------- deals
export function dealKlondike(seed, { draw = 1, passes = Infinity } = {}) {
  const deck = shuffled([...Array(52).keys()], seed); const tab = [];
  let k = 0; for (let i = 0; i < 7; i++) { tab.push([]); for (let j = 0; j <= i; j++) { tab[i].push(C(deck[k], j === i, k)); k++; } }
  return { game: 'klondike', seed, draw, passes: Number.isFinite(passes) ? passes : null, passUsed: 0, stock: deck.slice(k).map((c, j) => C(c, false, k + j)), waste: [], found: [[], [], [], []], tab, moves: 0, score: 0 };
}
export function dealSpider(seed, { suits = 1 } = {}) {
  const map = (i) => { const r = i % 13; const s = suits === 1 ? 0 : suits === 2 ? ((i / 13) | 0) % 2 : ((i / 13) | 0) % 4; return s * 13 + r; };
  const deck = shuffled([...Array(104).keys()].map(map), seed); const tab = Array.from({ length: 10 }, () => []);
  let k = 0; for (let i = 0; i < 54; i++) { tab[i % 10].push(C(deck[k], false, k)); k++; } for (const p of tab) p[p.length - 1].up = true;
  return { game: 'spider', seed, suits, stock: deck.slice(k).map((c, j) => C(c, false, k + j)), found: [], tab, moves: 0, score: 500 };
}
// FreeCell: the visible "deal number" maps to the first sub-seed whose shuffle the solver can finish, so every deal is winnable.
export function dealFreeCell(seed, { cells = 4, budget = 12000 } = {}) {
  for (let sub = 0; sub < 50; sub++) {
    const st = freecellFromSeed(seed * 101 + sub, cells); st.seed = seed;
    const sol = solveFreeCell(st, budget); if (sol) { st.verified = true; st.solutionLength = sol.length; return st; }
  }
  const st = freecellFromSeed(seed * 101, cells); st.seed = seed; return st;
}
function freecellFromSeed(s, cells) { const deck = shuffled([...Array(52).keys()], s); const tab = Array.from({ length: 8 }, () => []); deck.forEach((c, i) => tab[i % 8].push(C(c, true, i))); return { game: 'freecell', seed: s, cellsN: cells, cells: Array(cells).fill(null), found: [[], [], [], []], tab, moves: 0 }; }

// ---------------------------------------------------------------- shared helpers
const topOf = (p) => p[p.length - 1];
export function foundationIndex(st, c) { if (rank(c) === 1) return st.found.findIndex((f) => !f.length); return st.found.findIndex((f) => f.length && suit(topOf(f).c) === suit(c) && rank(topOf(f).c) === rank(c) - 1); }
export function canFoundation(st, c) { return foundationIndex(st, c) >= 0; }
const altDesc = (a, b) => red(a) !== red(b) && rank(a) === rank(b) + 1; // b goes onto a
const sameSuitDesc = (a, b) => suit(a) === suit(b) && rank(a) === rank(b) + 1;

// ---------------------------------------------------------------- legality: a move is {from:{p,i}, n, to:{p,i}} or {type:'draw'|'recycle'|'deal'}
export function pile(st, ref) { if (ref.p === 'tab') return st.tab[ref.i]; if (ref.p === 'found') return st.found[ref.i]; if (ref.p === 'waste') return st.waste; if (ref.p === 'stock') return st.stock; if (ref.p === 'cell') return st.cells[ref.i] ? [st.cells[ref.i]] : []; return []; }
// Is the run starting at index k of a tableau pile movable as a unit?
export function movableRun(st, p, k) {
  if (k < 0 || k >= p.length || !p[k].up) return false;
  for (let j = k; j < p.length - 1; j++) { const a = p[j].c, b = p[j + 1].c; if (st.game === 'spider' ? !sameSuitDesc(a, b) : !altDesc(a, b)) return false; }
  return true;
}
export function freecellCapacity(st, toEmpty) { const free = st.cells.filter((x) => !x).length; const empty = st.tab.filter((p) => !p.length).length - (toEmpty ? 1 : 0); return (free + 1) * 2 ** Math.max(0, empty); }
export function legal(st, m) {
  if (m.type === 'draw') return st.game === 'klondike' && st.stock.length > 0;
  if (m.type === 'recycle') return st.game === 'klondike' && !st.stock.length && st.waste.length > 0 && (st.passes == null || st.passUsed < st.passes - 1);
  if (m.type === 'deal') return st.game === 'spider' && st.stock.length > 0 && st.tab.every((p) => p.length > 0);
  const src = pile(st, m.from), dst = pile(st, m.to); if (!src.length || m.n < 1 || m.n > src.length) return false;
  if (m.from.p === m.to.p && m.from.i === m.to.i) return false;
  const k = src.length - m.n, first = src[k];
  if (!first.up) return false;
  if (m.from.p !== 'tab' && m.n !== 1) return false;
  if (m.from.p === 'tab' && m.n > 1 && !movableRun(st, src, k)) return false;
  if (m.to.p === 'found') {
    if (m.n !== 1 || st.game === 'spider') return false; const t = topOf(dst);
    return t ? suit(t.c) === suit(first.c) && rank(t.c) === rank(first.c) - 1 : rank(first.c) === 1;
  }
  if (m.to.p === 'cell') return st.game === 'freecell' && m.n === 1 && !st.cells[m.to.i];
  if (m.to.p !== 'tab') return false;
  if (st.game === 'freecell' && m.n > 1 && m.n > freecellCapacity(st, dst.length === 0)) return false;
  const t = topOf(dst);
  if (!t) return st.game === 'klondike' ? rank(first.c) === 13 : true;
  if (!t.up) return false;
  return st.game === 'spider' ? rank(t.c) === rank(first.c) + 1 : altDesc(t.c, first.c);
}
// Applies a legal move in place; returns an events object for the renderer ({flipped, completed:[{tab,i}], recycled}).
export function apply(st, m) {
  const ev = { flipped: [], completed: [] };
  if (m.type === 'draw') { const n = Math.min(st.draw, st.stock.length); for (let k = 0; k < n; k++) { const c = st.stock.pop(); c.up = true; st.waste.push(c); } st.moves++; return ev; }
  if (m.type === 'recycle') { while (st.waste.length) { const c = st.waste.pop(); c.up = false; st.stock.push(c); } st.passUsed++; st.score = Math.max(0, st.score - (st.draw === 1 ? 100 : 0)); st.moves++; ev.recycled = true; return ev; }
  if (m.type === 'deal') { for (const p of st.tab) { const c = st.stock.pop(); c.up = true; p.push(c); } st.moves++; checkSpiderRuns(st, ev); return ev; }
  const src = pile(st, m.from); let cards;
  if (m.from.p === 'cell') { cards = [st.cells[m.from.i]]; st.cells[m.from.i] = null; } else cards = src.splice(src.length - m.n, m.n);
  if (m.to.p === 'cell') st.cells[m.to.i] = cards[0]; else pile(st, m.to).push(...cards);
  if (m.from.p === 'tab') { const t = topOf(src); if (t && !t.up) { t.up = true; ev.flipped.push({ i: m.from.i, c: t.c }); if (st.game === 'klondike') st.score += 5; } }
  if (st.game === 'klondike') { if (m.to.p === 'found') st.score += 10; if (m.from.p === 'waste' && m.to.p === 'tab') st.score += 5; if (m.from.p === 'found') st.score = Math.max(0, st.score - 15); }
  st.moves++; if (st.game === 'spider') { st.score = Math.max(0, st.score - 1); checkSpiderRuns(st, ev); }
  return ev;
}
function checkSpiderRuns(st, ev) {
  st.tab.forEach((p, i) => {
    if (p.length < 13) return; const k = p.length - 13;
    if (rank(p[k].c) === 13 && movableRun(st, p, k) && rank(p[p.length - 1].c) === 1) {
      const run = p.splice(k, 13); st.found.push(run); st.score += 100; ev.completed.push({ i, suit: suit(run[0].c) });
      const t = topOf(p); if (t && !t.up) { t.up = true; ev.flipped.push({ i, c: t.c }); }
    }
  });
}
export function won(st) { if (st.game === 'spider') return st.found.length === 8; return st.found.every((f) => f.length === 13); }

// ---------------------------------------------------------------- move generation (hints, tap-to-move, auto-complete)
export function allMoves(st) {
  const out = [];
  const T = st.tab.length;
  const sources = [];
  if (st.game === 'klondike' && st.waste.length) sources.push({ ref: { p: 'waste', i: 0 }, n: 1 });
  if (st.game === 'freecell') st.cells.forEach((x, i) => x && sources.push({ ref: { p: 'cell', i }, n: 1 }));
  st.tab.forEach((p, i) => { for (let k = p.length - 1; k >= 0 && p[k].up; k--) { if (!movableRun(st, p, k)) break; sources.push({ ref: { p: 'tab', i }, n: p.length - k }); } });
  if (st.game !== 'spider') st.found.forEach((f, i) => f.length && st.game === 'klondike' && sources.push({ ref: { p: 'found', i }, n: 1 }));
  for (const s of sources) {
    if (s.n === 1 && s.ref.p !== 'found' && st.game !== 'spider') for (let i = 0; i < 4; i++) { const m = { from: s.ref, n: 1, to: { p: 'found', i } }; if (legal(st, m)) { out.push(m); break; } }
    for (let i = 0; i < T; i++) { const m = { from: s.ref, n: s.n, to: { p: 'tab', i } }; if (legal(st, m)) out.push(m); }
    if (st.game === 'freecell' && s.n === 1 && s.ref.p === 'tab') { const ci = st.cells.findIndex((x) => !x); if (ci >= 0) out.push({ from: s.ref, n: 1, to: { p: 'cell', i: ci } }); }
  }
  for (const t of ['draw', 'recycle', 'deal']) if (legal(st, { type: t })) out.push({ type: t });
  return out;
}
// Rank moves for hints / tap-to-move. Higher is better; moves that achieve nothing score low.
export function scoreMove(st, m) {
  if (m.type === 'draw') return 2; if (m.type === 'recycle') return 1; if (m.type === 'deal') return 1.5;
  const src = pile(st, m.from), k = src.length - m.n, under = src[k - 1], first = src[k];
  let s = 0;
  if (m.to.p === 'found') s += 50;
  if (m.from.p === 'tab' && under && !under.up) s += 40; // reveals a card
  if (m.from.p === 'tab' && !under && m.to.p === 'tab' && !pile(st, m.to).length) s -= 60; // pointless empty→empty
  if (m.from.p === 'tab' && !under && m.to.p !== 'found') s += st.game === 'klondike' && rank(first.c) === 13 ? -30 : 5;
  if (m.from.p === 'waste') s += 20;
  if (m.from.p === 'cell') s += 25;
  if (m.to.p === 'cell') s -= 15;
  if (m.from.p === 'found') s -= 40;
  if (st.game === 'spider' && m.to.p === 'tab') { const t = topOf(pile(st, m.to)); if (t && suit(t.c) === suit(first.c)) s += 30; if (under && under.up && suit(under.c) === suit(first.c) && rank(under.c) === rank(first.c) + 1) s -= 45; }
  if (st.game !== 'spider' && m.to.p === 'tab' && m.from.p === 'tab' && under && under.up && altDesc(under.c, first.c)) s -= 35; // just shuffling a built run
  if (m.to.p === 'tab' && !pile(st, m.to).length && st.game !== 'klondike') s -= 10;
  return s;
}
export function bestMoveFrom(st, ref, n) {
  let best = null, bs = -Infinity;
  for (const m of allMoves(st)) { if (m.type || m.from.p !== ref.p || m.from.i !== ref.i || m.n !== n) continue; const s = scoreMove(st, m); if (s > bs) { bs = s; best = m; } }
  return best;
}
export function hint(st) {
  if (st.game === 'freecell') { const sol = solveFreeCell(st, 20000); if (sol && sol.length) return sol[0]; }
  let best = null, bs = 0; for (const m of allMoves(st)) { const s = scoreMove(st, m); if (s > bs) { bs = s; best = m; } } return best;
}
// Auto-complete is offered when nothing is hidden and no stock/waste remain (Klondike) or the tableau is ordered (FreeCell).
export function canAutoComplete(st) {
  if (st.game === 'klondike') return !st.stock.length && !st.waste.length && st.tab.every((p) => p.every((x) => x.up)) && !won(st);
  if (st.game === 'freecell') return !won(st) && st.tab.every((p) => p.every((x, k) => k === 0 || rank(p[k - 1].c) > rank(x.c)));
  return false;
}
export function nextFoundationMove(st) {
  let best = null, br = 99;
  const srcs = []; st.tab.forEach((p, i) => p.length && srcs.push({ p: 'tab', i })); if (st.game === 'klondike' && st.waste.length) srcs.push({ p: 'waste', i: 0 }); if (st.game === 'freecell') st.cells.forEach((x, i) => x && srcs.push({ p: 'cell', i }));
  for (const s of srcs) { const c = topOf(pile(st, s)).c; for (let i = 0; i < 4; i++) { const m = { from: s, n: 1, to: { p: 'found', i } }; if (legal(st, m) && rank(c) < br) { br = rank(c); best = m; } } }
  return best;
}
// Horne's safe-to-foundation rule: a card can go up when the opposite colours one rank lower are already up.
export function safeFoundation(st, c) {
  const r = rank(c); if (r <= 2) return true; const opp = red(c) ? [0, 3] : [1, 2];
  return opp.every((s) => st.found.some((f) => f.length && suit(f[0].c) === s && f.length >= r - 1));
}

// ---------------------------------------------------------------- FreeCell solver
// Compact integer state, best-first search with a transposition table and Horne-safe auto-moves. Returns UI moves.
const sS = (c) => (c / 13) | 0, rR = (c) => (c % 13) + 1, isRed = (c) => { const q = sS(c); return q === 1 || q === 2; };
function compact(st) { return { cols: st.tab.map((p) => p.map((x) => x.c)), cells: st.cells.map((x) => (x ? x.c : -1)), fnd: [0, 1, 2, 3].map((q) => { const f = st.found.find((p) => p.length && sS(p[0].c) === q); return f ? f.length : 0; }) }; }
const cKey = (s) => s.cols.map((p) => p.join(',')).sort().join('|') + '#' + s.cells.filter((c) => c >= 0).sort((a, b) => a - b).join(',') + '#' + s.fnd.join(',');
const cClone = (s) => ({ cols: s.cols.map((p) => p.slice()), cells: s.cells.slice(), fnd: s.fnd.slice() });
const cSafe = (s, c) => { const r = rR(c); if (r <= 2) return true; return isRed(c) ? s.fnd[0] >= r - 1 && s.fnd[3] >= r - 1 : s.fnd[1] >= r - 1 && s.fnd[2] >= r - 1; };
function cAuto(s, out) {
  for (let moved = true; moved;) {
    moved = false;
    for (let i = 0; i < s.cols.length && !moved; i++) { const p = s.cols[i]; if (!p.length) continue; const c = p[p.length - 1]; if (s.fnd[sS(c)] === rR(c) - 1 && cSafe(s, c)) { p.pop(); s.fnd[sS(c)]++; out.push({ k: 'tf', i, c }); moved = true; } }
    for (let i = 0; i < s.cells.length && !moved; i++) { const c = s.cells[i]; if (c >= 0 && s.fnd[sS(c)] === rR(c) - 1 && cSafe(s, c)) { s.cells[i] = -1; s.fnd[sS(c)]++; out.push({ k: 'cf', i, c }); moved = true; } }
  }
}
function cHeur(s) {
  let h = (52 - s.fnd.reduce((a, b) => a + b, 0)) * 10;
  for (const p of s.cols) { let min = 99; for (let k = 0; k < p.length; k++) { const r = rR(p[k]); if (r > min) h += 3 + (p.length - k); if (r < min) min = r; } }
  for (const c of s.cells) if (c >= 0) h += 4; for (const p of s.cols) if (!p.length) h -= 6;
  return h;
}
function cMoves(s) {
  const out = []; const free = s.cells.filter((c) => c < 0).length, empty = s.cols.filter((p) => !p.length).length;
  const fits = (a, b) => isRed(a) !== isRed(b) && rR(a) === rR(b) + 1; // b onto a
  for (let i = 0; i < s.cols.length; i++) { const p = s.cols[i]; if (p.length) { const c = p[p.length - 1]; if (s.fnd[sS(c)] === rR(c) - 1) out.push({ k: 'tf', i, c }); } }
  for (let i = 0; i < s.cells.length; i++) { const c = s.cells[i]; if (c < 0) continue; if (s.fnd[sS(c)] === rR(c) - 1) out.push({ k: 'cf', i, c }); for (let j = 0; j < s.cols.length; j++) { const q = s.cols[j]; if (!q.length || fits(q[q.length - 1], c)) out.push({ k: 'ct', i, j }); } }
  for (let i = 0; i < s.cols.length; i++) {
    const p = s.cols[i]; if (!p.length) continue; let L = 1; while (L < p.length && fits(p[p.length - L - 1], p[p.length - L])) L++;
    for (let j = 0; j < s.cols.length; j++) {
      if (j === i) continue; const q = s.cols[j];
      if (!q.length) { const cap = (free + 1) * 2 ** Math.max(0, empty - 1); const maxN = Math.min(L, cap); if (maxN === p.length) { if (maxN > 1) out.push({ k: 'tt', i, j, n: maxN - 1 }); continue; } for (let n = maxN; n >= 1 && n >= maxN - 2; n--) out.push({ k: 'tt', i, j, n }); continue; }
      const t = q[q.length - 1]; const need = rR(t) - 1; const n = need - rR(p[p.length - 1]) + 1; if (n < 1 || n > L) continue;
      if (!fits(t, p[p.length - n])) continue; const cap = (free + 1) * 2 ** empty; if (n <= cap) out.push({ k: 'tt', i, j, n });
    }
    if (free) out.push({ k: 'tc', i });
  }
  return out;
}
function cApply(s, m) {
  if (m.k === 'tf') { s.cols[m.i].pop(); s.fnd[sS(m.c)]++; } else if (m.k === 'cf') { s.cells[m.i] = -1; s.fnd[sS(m.c)]++; }
  else if (m.k === 'ct') { s.cols[m.j].push(s.cells[m.i]); s.cells[m.i] = -1; }
  else if (m.k === 'tt') { const p = s.cols[m.i]; s.cols[m.j].push(...p.splice(p.length - m.n, m.n)); }
  else if (m.k === 'tc') { const ci = s.cells.indexOf(-1); m.ci = ci; s.cells[ci] = s.cols[m.i].pop(); }
}
// Convert solver moves to UI moves by replaying against the real state (resolves foundation / cell slot indices).
function toUi(st, cm) {
  const ui = []; const s = clone(st);
  for (const m of cm) {
    let mv;
    if (m.k === 'tf' || m.k === 'cf') { const from = m.k === 'tf' ? { p: 'tab', i: m.i } : { p: 'cell', i: m.i }; const c = m.c; const fi = foundationIndex(s, c); mv = { from, n: 1, to: { p: 'found', i: fi } }; }
    else if (m.k === 'ct') mv = { from: { p: 'cell', i: m.i }, n: 1, to: { p: 'tab', i: m.j } };
    else if (m.k === 'tt') mv = { from: { p: 'tab', i: m.i }, n: m.n, to: { p: 'tab', i: m.j } };
    else mv = { from: { p: 'tab', i: m.i }, n: 1, to: { p: 'cell', i: s.cells.findIndex((x) => !x) } };
    if (!legal(s, mv)) return null; apply(s, mv); ui.push(mv);
  }
  return ui;
}
export function solveFreeCell(start, budget = 60000) {
  const s0 = compact(start); const pre = []; cAuto(s0, pre);
  const done = (s) => s.fnd.every((v) => v === 13);
  if (done(s0)) return toUi(start, pre);
  const seen = new Set([cKey(s0)]); const nodes = [{ s: s0, parent: -1, mv: pre }]; const open = [{ id: 0, h: cHeur(s0) }]; let expanded = 0;
  const push = (n) => { let lo = 0, hi = open.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (open[mid].h > n.h) lo = mid + 1; else hi = mid; } open.splice(lo, 0, n); };
  while (open.length && expanded < budget) {
    const { id } = open.pop(); const cur = nodes[id]; expanded++;
    for (const m of cMoves(cur.s)) {
      const s = cClone(cur.s); cApply(s, m); const seq = [m]; cAuto(s, seq);
      const k = cKey(s); if (seen.has(k)) continue; seen.add(k);
      nodes.push({ s, parent: id, mv: seq }); const nid = nodes.length - 1;
      if (done(s)) { const chain = []; for (let q = nid; q >= 0; q = nodes[q].parent) chain.unshift(...nodes[q].mv); return toUi(start, chain); }
      push({ id: nid, h: cHeur(s) + depth(nodes, nid) * 0.6 });
    }
  }
  return null;
}
function depth(nodes, id) { let d = 0; for (let q = id; q >= 0; q = nodes[q].parent) d++; return d; }
