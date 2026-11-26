// Gem Garden — pure, deterministic match-3 rules (no DOM). Node-testable; the renderer only plays back `steps`.
// Board cells: cell[i]=1 playable, 0 hole. gem[i] = null | {id, c, s}. c: 0..5 colour, -1 prism, SEED.
// Blockers: vine[i] layers under a gem (cleared by clearing that gem), bramble[i] layers (solid; hit by adjacent matches/effects).
export const NONE = 0, LINE_H = 1, LINE_V = 2, BOMB = 3, PRISM = 4;
export const SEED = 9;

// ---------------------------------------------------------------- seeded RNG (cloneable state)
export const makeRng = (seed) => ({ s: (seed >>> 0) || 1 });
export function rnd(r) { // mulberry32
  let t = (r.s = (r.s + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const ri = (r, n) => Math.floor(rnd(r) * n);

// ---------------------------------------------------------------- level parsing / board creation
// layout rows: '.' cell, 'x' hole, 'v' vine, 'V' double vine, 'b' bramble, 'B' double bramble, 's' seed start
export function createState(def, seed = 1) {
  const rows = def.layout || Array(8).fill('........');
  const h = rows.length, w = rows[0].length;
  const st = {
    w, h, cell: new Uint8Array(w * h), vine: new Int8Array(w * h), bramble: new Int8Array(w * h),
    gem: new Array(w * h).fill(null), colors: def.colors || 5, rng: makeRng(seed), nextId: 1,
    score: 0, moves: def.moves ?? Infinity, movesUsed: 0,
    seedsTotal: 0, seedsSpawned: 0, seedsCollected: 0, seedMax: def.seedMax || 3,
    collected: [0, 0, 0, 0, 0, 0], goals: def.goals || [{ type: 'score', target: 1000 }],
    vinesTotal: 0, bramblesTotal: 0, bestCascade: 0, specialsMade: 0,
  };
  const seedCells = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = rows[y][x], i = y * w + x;
    st.cell[i] = ch === 'x' ? 0 : 1;
    if (ch === 'v') st.vine[i] = 1; if (ch === 'V') st.vine[i] = 2;
    if (ch === 'b') st.bramble[i] = 1; if (ch === 'B') st.bramble[i] = 2;
    if (ch === 's') seedCells.push(i);
  }
  for (const g of st.goals) if (g.type === 'seeds') st.seedsTotal = g.n;
  st.vinesTotal = st.vine.reduce((a, b) => a + b, 0);
  st.bramblesTotal = st.bramble.reduce((a, b) => a + b, 0);
  fillInitial(st, seedCells);
  return st;
}

const newGem = (st, c, s = NONE) => ({ id: st.nextId++, c, s });
export const solid = (st, i) => st.bramble[i] > 0;
export const open = (st, i) => st.cell[i] === 1 && st.bramble[i] === 0;
const isColor = (g) => g && g.c >= 0 && g.c < SEED;

function fillInitial(st, seedCells) {
  for (let tries = 0; tries < 200; tries++) {
    for (let i = 0; i < st.w * st.h; i++) st.gem[i] = null;
    for (let y = 0; y < st.h; y++) for (let x = 0; x < st.w; x++) {
      const i = y * st.w + x; if (!open(st, i)) continue;
      let c, guard = 0;
      do { c = ri(st.rng, st.colors); guard++; } while (guard < 30 && makesRun(st, x, y, c));
      st.gem[i] = newGem(st, c);
    }
    for (const i of seedCells.slice(0, st.seedsTotal)) { st.gem[i] = newGem(st, SEED); st.seedsSpawned++; }
    if (findMatches(st).length === 0 && findMoves(st).length >= 3) return;
    st.seedsSpawned = 0;
  }
}
function makesRun(st, x, y, c) {
  const g = (xx, yy) => (xx >= 0 && yy >= 0 && st.cell[yy * st.w + xx] ? st.gem[yy * st.w + xx] : null);
  const a = g(x - 1, y), b = g(x - 2, y), d = g(x, y - 1), e = g(x, y - 2);
  return (a && b && a.c === c && b.c === c) || (d && e && d.c === c && e.c === c);
}

// ---------------------------------------------------------------- match detection
// Returns groups [{c, cells:[i], runs:[{cells, dir}], hasH, hasV, maxRun}] — runs sharing a cell are merged (L/T shapes).
export function findMatches(st) {
  const { w, h, gem } = st, runs = [];
  const scan = (dir) => {
    const outer = dir === 'h' ? h : w, inner = dir === 'h' ? w : h;
    for (let o = 0; o < outer; o++) {
      let run = [], col = -2;
      const flush = () => { if (run.length >= 3) runs.push({ cells: run, dir }); };
      for (let k = 0; k < inner; k++) {
        const i = dir === 'h' ? o * w + k : k * w + o, g = st.cell[i] ? gem[i] : null;
        const c = isColor(g) ? g.c : -2;
        if (c >= 0 && c === col) run.push(i);
        else { flush(); run = c >= 0 ? [i] : []; col = c; }
      }
      flush();
    }
  };
  scan('h'); scan('v');
  // union runs sharing cells
  const owner = new Map(), parent = runs.map((_, k) => k);
  const find = (k) => (parent[k] === k ? k : (parent[k] = find(parent[k])));
  runs.forEach((r, k) => r.cells.forEach((i) => { if (owner.has(i)) parent[find(k)] = find(owner.get(i)); else owner.set(i, k); }));
  const groups = new Map();
  runs.forEach((r, k) => {
    const root = find(k);
    if (!groups.has(root)) groups.set(root, { c: gem[r.cells[0]].c, cells: new Set(), runs: [], hasH: false, hasV: false, maxRun: 0 });
    const g = groups.get(root); r.cells.forEach((i) => g.cells.add(i)); g.runs.push(r);
    if (r.dir === 'h') g.hasH = true; else g.hasV = true; g.maxRun = Math.max(g.maxRun, r.cells.length);
  });
  return [...groups.values()].map((g) => ({ ...g, cells: [...g.cells] }));
}

// What special does a group earn? (5-run → prism, L/T → bomb, 4-run → line perpendicular to the run)
export function specialFor(group) {
  if (group.maxRun >= 5) return PRISM;
  if (group.hasH && group.hasV) return BOMB;
  if (group.maxRun === 4) return group.runs.find((r) => r.cells.length === 4).dir === 'h' ? LINE_V : LINE_H;
  return NONE;
}
function specialCell(group, prefer) {
  for (const p of prefer) if (p != null && group.cells.includes(p)) return p;
  if (group.hasH && group.hasV) { // intersection
    const h = new Set(group.runs.filter((r) => r.dir === 'h').flatMap((r) => r.cells));
    const x = group.runs.filter((r) => r.dir === 'v').flatMap((r) => r.cells).find((i) => h.has(i));
    if (x != null) return x;
  }
  const r = group.runs.reduce((a, b) => (b.cells.length > a.cells.length ? b : a));
  return r.cells[Math.floor((r.cells.length - 1) / 2)];
}

// ---------------------------------------------------------------- moves
export const adjacent = (st, a, b) => {
  const ax = a % st.w, ay = (a / st.w) | 0, bx = b % st.w, by = (b / st.w) | 0;
  return Math.abs(ax - bx) + Math.abs(ay - by) === 1;
};
const swappable = (st, i) => st.cell[i] && !solid(st, i) && st.gem[i];
function lineHasMatchAt(st, i) {
  const g = st.gem[i]; if (!isColor(g)) return false;
  const x = i % st.w, y = (i / st.w) | 0, c = g.c;
  const same = (xx, yy) => xx >= 0 && yy >= 0 && xx < st.w && yy < st.h && st.cell[yy * st.w + xx] && isColor(st.gem[yy * st.w + xx]) && st.gem[yy * st.w + xx].c === c;
  let n = 1; for (let k = 1; same(x - k, y); k++) n++; for (let k = 1; same(x + k, y); k++) n++;
  if (n >= 3) return true;
  n = 1; for (let k = 1; same(x, y - k); k++) n++; for (let k = 1; same(x, y + k); k++) n++;
  return n >= 3;
}
export function isComboSwap(ga, gb) {
  if (!ga || !gb || ga.c === SEED || gb.c === SEED) return false;
  if (ga.s === PRISM || gb.s === PRISM) return true;
  return ga.s !== NONE && gb.s !== NONE;
}
export function moveValid(st, a, b) {
  if (!adjacent(st, a, b) || !swappable(st, a) || !swappable(st, b)) return false;
  if (isComboSwap(st.gem[a], st.gem[b])) return true;
  const t = st.gem[a]; st.gem[a] = st.gem[b]; st.gem[b] = t;
  const ok = lineHasMatchAt(st, a) || lineHasMatchAt(st, b);
  st.gem[b] = st.gem[a]; st.gem[a] = t;
  return ok;
}
export function findMoves(st) {
  const out = [];
  for (let i = 0; i < st.w * st.h; i++) {
    const x = i % st.w;
    if (x < st.w - 1 && moveValid(st, i, i + 1)) out.push([i, i + 1]);
    if (i + st.w < st.w * st.h && moveValid(st, i, i + st.w)) out.push([i, i + st.w]);
  }
  return out;
}

// ---------------------------------------------------------------- resolution
const SCORE = { match3: 60, match4: 120, matchL: 180, match5: 250, fx: 30, vine: 50, bramble: 40, seed: 500 };

// Clears a set of cells, chaining specials. Returns a 'clear' step (mutates st).
function explode(st, seeds, opts) {
  const { w, h } = st;
  const step = { type: 'clear', cascade: opts.cascade, items: [], fx: [], created: [], vines: [], brambles: [], score: 0, collected: {} };
  const depth = new Map(), queue = [], consumed = opts.consumed || new Set();
  const hitBramble = new Set(), hitVine = new Set();
  const add = (i, d, by) => { if (i < 0 || i >= w * h || !st.cell[i]) return; if (st.bramble[i] > 0) { hitBramble.add(i); return; } if (depth.has(i)) return; depth.set(i, d); queue.push([i, d, by]); };
  for (const [i, by] of seeds) add(i, 0, by);
  const mult = Math.min(opts.cascade, 8);
  while (queue.length) {
    const [i, d, by] = queue.shift(); const g = st.gem[i];
    if (!g || g.c === SEED) continue;
    step.items.push({ i, id: g.id, c: g.c, s: g.s, depth: d, by });
    if (g.c >= 0 && g.c < 6) step.collected[g.c] = (step.collected[g.c] || 0) + 1;
    if (by !== 'match') step.score += SCORE.fx * mult;
    if (st.vine[i] > 0) hitVine.add(i);
    if (consumed.has(g.id)) continue;
    const x = i % w, y = (i / w) | 0;
    if (g.s === LINE_H) { step.fx.push({ type: 'lineH', i, y }); for (let xx = 0; xx < w; xx++) if (xx !== x) add(y * w + xx, d + Math.abs(xx - x), 'fx'); }
    else if (g.s === LINE_V) { step.fx.push({ type: 'lineV', i, x }); for (let yy = 0; yy < h; yy++) if (yy !== y) add(yy * w + x, d + Math.abs(yy - y), 'fx'); }
    else if (g.s === BOMB) { step.fx.push({ type: 'bomb', i, r: 1 }); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h) add(yy * w + xx, d + 1, 'fx'); } }
    else if (g.s === PRISM) {
      const c = mostCommonColor(st, depth); const targets = [];
      for (let j = 0; j < w * h; j++) if (st.cell[j] && isColor(st.gem[j]) && st.gem[j].c === c && !depth.has(j)) { targets.push(j); add(j, d + 1, 'fx'); }
      step.fx.push({ type: 'prism', i, targets, c });
    }
  }
  // matched gems damage adjacent brambles
  for (const it of step.items) if (it.by === 'match') {
    const x = it.i % w, y = (it.i / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h && st.bramble[yy * w + xx] > 0) hitBramble.add(yy * w + xx); }
  }
  for (const it of step.items) st.gem[it.i] = null;
  for (const i of hitVine) { st.vine[i]--; step.vines.push({ i, left: st.vine[i] }); step.score += SCORE.vine * mult; }
  for (const i of hitBramble) { st.bramble[i]--; step.brambles.push({ i, left: st.bramble[i] }); step.score += SCORE.bramble * mult; }
  for (const c in step.collected) st.collected[c] += step.collected[c];
  return step;
}
function mostCommonColor(st, exclude) {
  const n = [0, 0, 0, 0, 0, 0];
  for (let j = 0; j < st.w * st.h; j++) if (st.cell[j] && isColor(st.gem[j]) && !exclude.has(j)) n[st.gem[j].c]++;
  let best = 0; for (let c = 1; c < 6; c++) if (n[c] > n[best]) best = c; return best;
}

function clearMatches(st, groups, prefer, cascade) {
  const seeds = []; const creations = [];
  let base = 0;
  for (const g of groups) {
    const sp = specialFor(g);
    base += sp === PRISM ? SCORE.match5 : sp === BOMB ? SCORE.matchL : sp ? SCORE.match4 : SCORE.match3 + Math.max(0, g.cells.length - 3) * 20;
    for (const i of g.cells) seeds.push([i, 'match']);
    if (sp) creations.push({ i: specialCell(g, prefer), c: sp === PRISM ? -1 : g.c, s: sp, from: g.cells });
  }
  const step = explode(st, seeds, { cascade });
  step.score += base * Math.min(cascade, 8);
  for (const cr of creations) {
    if (st.gem[cr.i] || !st.cell[cr.i]) continue;
    const gem = newGem(st, cr.c, cr.s); st.gem[cr.i] = gem; st.specialsMade++;
    step.created.push({ i: cr.i, gem: { ...gem }, from: cr.from });
  }
  return step;
}

// Gravity + refill: vertical falls (passing holes, stopped by brambles), diagonal slides under blockers, spawns at open column tops.
export function gravity(st) {
  const { w, h } = st; const moved = new Map(); const spawns = []; const spawnCount = new Array(w).fill(0);
  const topOpen = (x, y) => { for (let yy = y - 1; yy >= 0; yy--) { const j = yy * w + x; if (st.cell[j] && solid(st, j)) return false; } return true; };
  const firstCell = (x) => { for (let y = 0; y < h; y++) if (st.cell[y * w + x]) return y; return 0; };
  const mv = (from, to) => { const g = st.gem[from]; st.gem[to] = g; st.gem[from] = null; const m = moved.get(g.id); if (m) m.to = to; else if (!g._spawn) moved.set(g.id, { id: g.id, from, to }); else g._spawn.to = to; };
  let changed = true, guard = 0;
  while (changed && guard++ < 64) {
    changed = false;
    for (let x = 0; x < w; x++) for (let y = h - 1; y >= 0; y--) {
      const i = y * w + x; if (!open(st, i) || st.gem[i]) continue;
      let filled = false;
      for (let yy = y - 1; yy >= 0; yy--) { const j = yy * w + x; if (!st.cell[j]) continue; if (solid(st, j)) break; if (st.gem[j]) { mv(j, i); filled = changed = true; break; } }
      if (!filled && topOpen(x, y)) {
        let c = ri(st.rng, st.colors);
        const onBoard = st.gem.filter((g) => g && g.c === SEED).length;
        if (st.seedsSpawned < st.seedsTotal && onBoard < st.seedMax && (onBoard === 0 || rnd(st.rng) < 0.12)) { c = SEED; st.seedsSpawned++; }
        const g = newGem(st, c); spawnCount[x]++;
        g._spawn = { id: g.id, c: g.c, s: g.s, to: i, fromY: firstCell(x) - spawnCount[x] };
        st.gem[i] = g; spawns.push(g._spawn); changed = true;
      }
    }
    if (changed) continue;
    // diagonal slide into empties that are blocked from above
    for (let y = h - 1; y >= 1 && !changed; y--) for (let x = 0; x < w && !changed; x++) {
      const i = y * w + x; if (!open(st, i) || st.gem[i]) continue;
      for (const dx of [-1, 1]) {
        const xx = x + dx; if (xx < 0 || xx >= w) continue; const j = (y - 1) * w + xx;
        if (open(st, j) && st.gem[j]) { const below = y * w + xx; if (!open(st, below) || st.gem[below]) { mv(j, i); changed = true; break; } }
      }
    }
  }
  for (let i = 0; i < w * h; i++) if (st.gem[i]) delete st.gem[i]._spawn;
  return { type: 'fall', moves: [...moved.values()].filter((m) => m.from !== m.to), spawns };
}

export function exitCell(st, x) { for (let y = st.h - 1; y >= 0; y--) if (st.cell[y * st.w + x]) return y * st.w + x; return -1; }
function collectSeeds(st) {
  const items = [];
  for (let x = 0; x < st.w; x++) { const e = exitCell(st, x); if (e >= 0 && st.gem[e] && st.gem[e].c === SEED) { items.push({ i: e, id: st.gem[e].id }); st.gem[e] = null; st.seedsCollected++; } }
  return items.length ? { type: 'seed', items, score: items.length * SCORE.seed } : null;
}

// After any clear: gravity → seeds → matches → … until stable. Pushes steps; handles no-move reshuffle.
function settle(st, steps, cascade0) {
  let cascade = cascade0;
  for (let guard = 0; guard < 60; guard++) {
    steps.push(gravity(st));
    const sd = collectSeeds(st); if (sd) { st.score += sd.score; steps.push(sd); continue; }
    const groups = findMatches(st);
    if (!groups.length) break;
    cascade++;
    const step = clearMatches(st, groups, [], cascade); st.score += step.score; steps.push(step);
    st.bestCascade = Math.max(st.bestCascade, cascade);
  }
  if (findMoves(st).length === 0) steps.push(reshuffle(st));
}

export function reshuffle(st) {
  const cells = []; for (let i = 0; i < st.w * st.h; i++) if (open(st, i) && st.gem[i] && st.gem[i].c !== SEED) cells.push(i);
  const gems = cells.map((i) => st.gem[i]);
  for (let tries = 0; tries < 300; tries++) {
    for (let k = gems.length - 1; k > 0; k--) { const j = ri(st.rng, k + 1); [gems[k], gems[j]] = [gems[j], gems[k]]; }
    if (tries > 150) for (const g of gems) if (g.s === NONE) g.c = ri(st.rng, st.colors); // board too starved: recolour
    cells.forEach((i, k) => (st.gem[i] = gems[k]));
    if (findMatches(st).length === 0 && findMoves(st).length > 0) break;
  }
  const pos = new Map(); cells.forEach((i) => pos.set(st.gem[i].id, i));
  return { type: 'shuffle', moves: gems.map((g, k) => ({ id: g.id, to: pos.get(g.id) })) };
}

// Player swap. Returns {ok, steps}. Consumes a move when ok.
export function swap(st, a, b) {
  if (!adjacent(st, a, b) || !swappable(st, a) || !swappable(st, b)) return { ok: false, steps: [] };
  const ga = st.gem[a], gb = st.gem[b];
  st.gem[a] = gb; st.gem[b] = ga;
  const steps = [{ type: 'swap', a, b, ok: true }];
  let first = null;
  if (isComboSwap(ga, gb)) first = comboStep(st, ga, gb, b, a);
  else {
    const groups = findMatches(st);
    if (!groups.length) { st.gem[a] = ga; st.gem[b] = gb; return { ok: false, steps: [{ type: 'swap', a, b, ok: false }] }; }
    first = clearMatches(st, groups, [b, a], 1);
  }
  st.moves--; st.movesUsed++;
  st.score += first.score; steps.push(first);
  settle(st, steps, 1);
  return { ok: true, steps };
}

// Two specials (or prism + anything) swapped together.
function comboStep(st, ga, gb, at, other) {
  const { w, h } = st; const x = at % w, y = (at / w) | 0;
  const consumed = new Set([ga.id, gb.id]);
  const seeds = [[at, 'combo'], [other, 'combo']];
  const fx = [];
  const isLine = (s) => s === LINE_H || s === LINE_V;
  const rows = (ys) => ys.forEach((yy) => { if (yy >= 0 && yy < h) { for (let xx = 0; xx < w; xx++) seeds.push([yy * w + xx, 'fx']); fx.push({ type: 'lineH', i: yy * w + x, y: yy }); } });
  const cols = (xs) => xs.forEach((xx) => { if (xx >= 0 && xx < w) { for (let yy = 0; yy < h; yy++) seeds.push([yy * w + xx, 'fx']); fx.push({ type: 'lineV', i: y * w + xx, x: xx }); } });
  const conv = [];
  if (ga.s === PRISM && gb.s === PRISM) {
    for (let i = 0; i < w * h; i++) seeds.push([i, 'fx']); fx.push({ type: 'nova', i: at });
  } else if (ga.s === PRISM || gb.s === PRISM) {
    const p = ga.s === PRISM ? ga : gb, o = p === ga ? gb : ga; const targets = [];
    for (let i = 0; i < w * h; i++) {
      const g = st.gem[i]; if (!st.cell[i] || !isColor(g) || g.c !== o.c || g === o) continue;
      if (o.s !== NONE && g.s === NONE) { g.s = o.s === BOMB ? BOMB : (rnd(st.rng) < 0.5 ? LINE_H : LINE_V); conv.push({ i, id: g.id, s: g.s }); }
      targets.push(i); seeds.push([i, 'fx']);
    }
    if (o.s !== NONE) consumed.delete(o.id);
    fx.push({ type: 'prism', i: st.gem[at] === p ? at : other, targets, c: o.c });
  } else if (isLine(ga.s) && isLine(gb.s)) { rows([y]); cols([x]); }
  else if (ga.s === BOMB && gb.s === BOMB) {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h) seeds.push([yy * w + xx, 'fx']); }
    fx.push({ type: 'bomb', i: at, r: 2 });
  } else { rows([y - 1, y, y + 1]); cols([x - 1, x, x + 1]); } // line + bomb
  const step = explode(st, seeds, { cascade: 1, consumed });
  step.fx.unshift(...fx); step.convert = conv; step.score += 300;
  return step;
}

// ---------------------------------------------------------------- goals
export function goalProgress(st) {
  return st.goals.map((g) => {
    if (g.type === 'score') return { ...g, have: st.score, need: g.target, done: st.score >= g.target };
    if (g.type === 'vines') { const left = st.vine.reduce((a, b) => a + b, 0); return { ...g, have: st.vinesTotal - left, need: st.vinesTotal, left, done: left === 0 }; }
    if (g.type === 'brambles') { const left = st.bramble.reduce((a, b) => a + b, 0); return { ...g, have: st.bramblesTotal - left, need: st.bramblesTotal, left, done: left === 0 }; }
    if (g.type === 'seeds') return { ...g, have: st.seedsCollected, need: g.n, left: g.n - st.seedsCollected, done: st.seedsCollected >= g.n };
    if (g.type === 'collect') return { ...g, have: Math.min(g.n, st.collected[g.c]), need: g.n, left: Math.max(0, g.n - st.collected[g.c]), done: st.collected[g.c] >= g.n };
    return { ...g, done: true };
  });
}
export const levelWon = (st) => goalProgress(st).every((g) => g.done);
export const levelLost = (st) => !levelWon(st) && st.moves <= 0;

// Garden Bonus: each leftover move becomes a line gem that fires, then all specials on the board detonate.
export function bonusRound(st) {
  const steps = [];
  let left = Math.max(0, Math.min(st.moves, 30));
  while (left-- > 0) {
    const cand = []; for (let i = 0; i < st.w * st.h; i++) if (open(st, i) && isColor(st.gem[i]) && st.gem[i].s === NONE) cand.push(i);
    if (!cand.length) break;
    const i = cand[ri(st.rng, cand.length)]; const g = st.gem[i]; g.s = rnd(st.rng) < 0.5 ? LINE_H : LINE_V;
    steps.push({ type: 'convert', items: [{ i, id: g.id, s: g.s }], bonus: true });
    st.moves--;
    const step = explode(st, [[i, 'bonus']], { cascade: 2 }); st.score += step.score; steps.push(step);
    settle(st, steps, 2);
  }
  for (let guard = 0; guard < 6; guard++) {
    const sp = []; for (let i = 0; i < st.w * st.h; i++) if (open(st, i) && st.gem[i] && st.gem[i].s !== NONE && st.gem[i].c !== SEED) sp.push([i, 'bonus']);
    if (!sp.length) break;
    const step = explode(st, sp, { cascade: 2 }); st.score += step.score; steps.push(step); settle(st, steps, 2);
  }
  st.moves = Math.max(0, st.moves);
  return steps;
}

// ---------------------------------------------------------------- AI (hints + autoplay + tuning)
export function cloneState(st) {
  return { ...st, cell: st.cell, vine: Int8Array.from(st.vine), bramble: Int8Array.from(st.bramble), gem: st.gem.map((g) => (g ? { ...g } : null)), rng: { ...st.rng }, collected: [...st.collected], goals: st.goals };
}
// Greedy evaluation: goal progress first, then specials, then score.
export function evalMove(st, a, b) {
  const s2 = cloneState(st); const before = goalProgress(s2);
  const r = swap(s2, a, b); if (!r.ok) return -1;
  const after = goalProgress(s2); let v = 0;
  after.forEach((g, k) => { if (g.type !== 'score') v += (g.have - before[k].have) * (g.type === 'seeds' ? 900 : 260); });
  // nudge seeds downward (sum of seed depth before vs after)
  if (st.seedsTotal) { const depth = (s) => { let d = 0; for (let i = 0; i < s.w * s.h; i++) if (s.gem[i]?.c === SEED) d += (i / s.w) | 0; return d; }; v += (depth(s2) - depth(st)) * 650; }
  v += (s2.score - st.score) + s2.specialsMade * 0 + (levelWon(s2) ? 1e6 : 0);
  return v;
}
export function bestMove(st, sample = 0) {
  const moves = findMoves(st); if (!moves.length) return null;
  let best = null, bv = -Infinity;
  for (const [a, b] of moves) { const v = evalMove(st, a, b) + (sample ? Math.random() * sample : 0); if (v > bv) { bv = v; best = [a, b]; } }
  return best;
}
// Cheap hint: prefer moves that make specials, else the first valid move.
export function hintMove(st) {
  const moves = findMoves(st); if (!moves.length) return null;
  let best = moves[0], bv = -1;
  for (const [a, b] of moves) {
    const s2 = cloneState(st); const t = s2.gem[a]; s2.gem[a] = s2.gem[b]; s2.gem[b] = t;
    const combo = isComboSwap(st.gem[a], st.gem[b]);
    const v = combo ? 50 : findMatches(s2).reduce((m, g) => Math.max(m, g.cells.length + (specialFor(g) ? 3 : 0)), 0);
    if (v > bv) { bv = v; best = [a, b]; }
  }
  return best;
}
