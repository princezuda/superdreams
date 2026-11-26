// Checkers: Event Horizon — rules engine.
// Pure ES module (no DOM): shared by the page, the AI Web Worker and the node unit tests.
//
// American checkers / English draughts on 8x8, plus the creative-mode hazards, which are
// real rules evaluated here so the AI search sees exactly what the player sees:
//   blackholes — telegraphed holes open on empty dark squares and swallow anything on/next to them
//   graves     — every captured piece leaves a tombstone that blocks its square for N full turns
//   meteors    — telegraphed impacts destroy whatever is on the square and leave a crater (blocked)
//   portals    — two linked squares; a piece ending its move on one exits from the other (if free)
//
// Board: Int8Array(64), index = row*8 + col. Row 0 is the far (black) side, row 7 the near (red) side.
// Only dark squares ((row+col) odd) are used. Piece codes: 1 red man, 2 red king, -1 black man, -2 black king.
// Red moves "up" (toward row 0) and moves first.

export const RED = 1, BLACK = -1;
export const SIDE_NAME = { [RED]: 'red', [BLACK]: 'black' };
export const MODES = ['normal', 'blackholes', 'graves', 'meteors', 'portals'];

export const sqOf = (r, c) => r * 8 + c;
export const rowOf = (s) => s >> 3;
export const colOf = (s) => s & 7;
export const isDarkSq = (s) => ((rowOf(s) + colOf(s)) & 1) === 1;
export const DARK = Array.from({ length: 64 }, (_, s) => s).filter(isDarkSq);
export const sideOf = (p) => (p > 0 ? RED : p < 0 ? BLACK : 0);
export const isKing = (p) => p === 2 || p === -2;
export const PROMO_ROW = { [RED]: 0, [BLACK]: 7 };

// Algebraic names: files a-h left→right from red's seat, ranks 1-8 bottom→top.
export const nameOf = (s) => 'abcdefgh'[colOf(s)] + (8 - rowOf(s));
export function parseSq(x) {
  if (typeof x === 'number') return x;
  if (typeof x === 'string' && /^[a-h][1-8]$/i.test(x)) return sqOf(8 - +x[1], x.toLowerCase().charCodeAt(0) - 97);
  if (Array.isArray(x)) return sqOf(x[0], x[1]);
  return -1;
}

// Rays: RAYS[s][d] lists the squares from s outward in diagonal direction d (bounds baked in).
const DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const RAYS = Array.from({ length: 64 }, (_, s) => DIRS.map(([dr, dc]) => {
  const out = []; let r = rowOf(s) + dr, c = colOf(s) + dc;
  while (r >= 0 && r < 8 && c >= 0 && c < 8) { out.push(r * 8 + c); r += dr; c += dc; }
  return out;
}));
export const NEIGHBORS = Array.from({ length: 64 }, (_, s) => RAYS[s].filter((r) => r.length).map((r) => r[0]));
const MAN_DIRS = { [RED]: [0, 1], [BLACK]: [2, 3] };
const ALL_DIRS = [0, 1, 2, 3];
export const isDiagAdj = (a, b) => NEIGHBORS[a].includes(b);

export const DEFAULT_OPTS = {
  mode: 'normal', flyingKings: false, forceCapture: true,
  holeEvery: 3, holeLife: 3, holeWarn: 2, maxHoles: 3, // holeEvery/holeLife in full turns (rounds); holeWarn in plies
  graveTurns: 3,
  meteorEvery: 2, meteorWarn: 2, craterTurns: 2,
  quietLimit: 80, // 40 moves each side without capture or promotion
};

// ---------------------------------------------------------------- RNG (mulberry32; state lives in the game state so saves/undo replay exactly)
export function rand(s) {
  let t = (s.rng = (s.rng + 0x6D2B79F5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ---------------------------------------------------------------- state
export function newGame(opts = {}, seed = (Math.random() * 2 ** 32) >>> 0) {
  const o = { ...DEFAULT_OPTS, ...opts };
  if (!MODES.includes(o.mode)) o.mode = 'normal';
  const board = new Int8Array(64);
  for (const s of DARK) { const r = rowOf(s); if (r <= 2) board[s] = -1; else if (r >= 5) board[s] = 1; }
  const s = {
    board, turn: RED, ply: 0, quiet: 0, opts: o, rng: seed >>> 0,
    holes: [], graves: [], meteors: [], craters: [], portals: [],
    holeClock: Math.max(2, o.holeEvery * 2 - 1), meteorClock: Math.max(2, o.meteorEvery * 2),
    captured: { [RED]: 0, [BLACK]: 0 }, // pieces captured BY that side
    lost: { [RED]: 0, [BLACK]: 0 }, // pieces of that side swallowed by hazards (count for nobody)
    rep: {}, result: null, events: [], last: null,
  };
  if (o.mode === 'portals') {
    // Mirror-symmetric pair in the empty middle rows: entering your near portal throws you
    // one row forward and across the board; entering the far one pulls you back.
    const c = [0, 2, 6][Math.floor(rand(s) * 3)];
    s.portals = [sqOf(3, c), sqOf(4, 7 - c)];
  }
  s.rep[posKey(s)] = 1;
  return s;
}

export function cloneState(s, track = true) {
  return {
    ...s, board: s.board.slice(),
    holes: s.holes.map((h) => ({ ...h })), graves: s.graves.map((g) => ({ ...g })),
    meteors: s.meteors.map((m) => ({ ...m })), craters: s.craters.map((c) => ({ ...c })),
    captured: { ...s.captured }, lost: { ...s.lost }, rep: track && s.rep ? { ...s.rep } : null,
    events: [], result: null,
  };
}

export function serialize(s) { return { ...s, board: Array.from(s.board), events: [] }; }
export function deserialize(o) {
  const s = { ...o, board: Int8Array.from(o.board) };
  s.captured = { [RED]: o.captured?.[RED] ?? 0, [BLACK]: o.captured?.[BLACK] ?? 0 };
  s.lost = { [RED]: o.lost?.[RED] ?? 0, [BLACK]: o.lost?.[BLACK] ?? 0 };
  return s;
}

// Squares no piece may enter or pass: graves and craters. (Black holes are enterable — fatally.)
export function blockMask(s) {
  const m = new Uint8Array(64);
  for (const g of s.graves) m[g.sq] = 1;
  for (const c of s.craters) m[c.sq] = 1;
  return m;
}

export function posKey(s) {
  let k = s.turn === RED ? 'r' : 'b';
  for (const q of DARK) k += String.fromCharCode(67 + s.board[q]);
  for (const h of s.holes) k += 'h' + h.sq + '.' + h.warn + '.' + h.life;
  for (const g of s.graves) k += 'g' + g.sq + '.' + g.ttl;
  for (const m of s.meteors) k += 'm' + m.sq + '.' + m.warn;
  for (const c of s.craters) k += 'c' + c.sq + '.' + c.ttl;
  return k;
}

// ---------------------------------------------------------------- move generation
// A move is the whole turn: { from, to, path:[from, ...landings], caps:[captured squares in order], promote }.
function genCaptures(board, block, from, flying, out) {
  const piece = board[from], side = sideOf(piece), king = isKing(piece);
  const dirs = king ? ALL_DIRS : MAN_DIRS[side];
  const path = [from], caps = [], capMask = new Uint8Array(64);
  board[from] = 0; // lift the piece: it may pass back over its own start square
  const rec = (pos) => {
    let extended = false;
    for (const d of dirs) {
      const ray = RAYS[pos][d];
      if (king && flying) {
        let i = 0;
        while (i < ray.length && board[ray[i]] === 0 && !block[ray[i]]) i++;
        if (i >= ray.length) continue;
        const mid = ray[i];
        if (capMask[mid] || sideOf(board[mid]) !== -side) continue; // own piece / already-taken / blocked square
        for (let j = i + 1; j < ray.length; j++) {
          const land = ray[j];
          if (board[land] !== 0 || block[land]) break;
          capMask[mid] = 1; caps.push(mid); path.push(land); extended = true;
          rec(land);
          path.pop(); caps.pop(); capMask[mid] = 0;
        }
      } else {
        if (ray.length < 2) continue;
        const mid = ray[0], land = ray[1];
        if (capMask[mid] || sideOf(board[mid]) !== -side) continue;
        if (board[land] !== 0 || block[land]) continue;
        capMask[mid] = 1; caps.push(mid); path.push(land); extended = true;
        if (!king && rowOf(land) === PROMO_ROW[side]) out.push({ from, to: land, path: path.slice(), caps: caps.slice(), promote: true }); // crowning ends the turn
        else rec(land);
        path.pop(); caps.pop(); capMask[mid] = 0;
      }
    }
    if (!extended && caps.length) out.push({ from, to: pos, path: path.slice(), caps: caps.slice(), promote: false });
  };
  rec(from);
  board[from] = piece;
}

function genSimple(board, block, from, flying, out) {
  const piece = board[from], side = sideOf(piece), king = isKing(piece);
  for (const d of king ? ALL_DIRS : MAN_DIRS[side]) {
    const ray = RAYS[from][d];
    if (king && flying) {
      for (const t of ray) { if (board[t] !== 0 || block[t]) break; out.push({ from, to: t, path: [from, t], caps: [], promote: false }); }
    } else if (ray.length && board[ray[0]] === 0 && !block[ray[0]]) {
      const t = ray[0];
      out.push({ from, to: t, path: [from, t], caps: [], promote: !king && rowOf(t) === PROMO_ROW[side] });
    }
  }
}

export function capturesFor(s, side = s.turn) {
  const block = blockMask(s), out = [], b = s.board;
  for (const q of DARK) if (sideOf(b[q]) === side) genCaptures(b, block, q, s.opts.flyingKings, out);
  return out;
}

export function legalMoves(s, side = s.turn) {
  if (s.result) return [];
  const block = blockMask(s), b = s.board, caps = [], simple = [];
  for (const q of DARK) if (sideOf(b[q]) === side) genCaptures(b, block, q, s.opts.flyingKings, caps);
  if (caps.length && s.opts.forceCapture) return caps;
  for (const q of DARK) if (sideOf(b[q]) === side) genSimple(b, block, q, s.opts.flyingKings, simple);
  return caps.concat(simple);
}

export const moveKey = (m) => m.path.join('-');
export const sameMove = (a, b) => a && b && moveKey(a) === moveKey(b);

export function countPieces(s, side) {
  let men = 0, kings = 0;
  for (const q of DARK) { const p = s.board[q]; if (sideOf(p) === side) { if (isKing(p)) kings++; else men++; } }
  return { men, kings, total: men + kings };
}

// ---------------------------------------------------------------- applying a move (+ hazard tick)
// o.spawn=false: no new random hazards (AI search — the future is unknown to it, as to a human).
// o.track=false: skip repetition bookkeeping. o.check=false: skip the end-of-game test (search does its own).
export function applyMove(st, mv, o = {}) {
  const spawn = o.spawn !== false, track = o.track !== false, check = o.check !== false;
  const s = cloneState(st, track);
  const ev = s.events, b = s.board, side = s.turn, opt = s.opts;
  let piece = b[mv.from];
  b[mv.from] = 0;
  const caps = mv.caps.map((q) => ({ sq: q, p: b[q] }));
  for (const c of caps) b[c.sq] = 0;
  let at = mv.to, promoted = false, material = caps.length > 0;
  if (mv.promote && !isKing(piece)) { piece = 2 * side; promoted = true; }
  b[at] = piece;
  ev.push({ type: 'move', move: mv, side, piece, caps });
  if (caps.length) s.captured[side] += caps.length;
  if (promoted) ev.push({ type: 'promote', sq: at, side });

  // Portals: a piece that ends its move on one exits from the other, if that square is free.
  if (s.portals.length === 2) {
    const i = s.portals.indexOf(at);
    if (i >= 0) {
      const exit = s.portals[1 - i], block = blockMask(s);
      if (b[exit] === 0 && !block[exit]) {
        b[at] = 0; b[exit] = piece; ev.push({ type: 'portal', from: at, to: exit, side, piece }); at = exit;
        if (!isKing(piece) && rowOf(at) === PROMO_ROW[side]) { piece = 2 * side; b[at] = piece; promoted = true; ev.push({ type: 'promote', sq: at, side }); }
      } else ev.push({ type: 'portalBlocked', sq: at, exit });
    }
  }

  // Black holes: a piece ending its move on or diagonally next to a live hole is pulled in.
  for (const h of s.holes) {
    if (h.warn === 0 && (h.sq === at || isDiagAdj(h.sq, at))) {
      b[at] = 0; s.lost[side]++; material = true;
      ev.push({ type: 'suck', sq: at, hole: h.sq, piece, side });
      break;
    }
  }

  // ---- hazard tick (one ply passes)
  if (s.graves.length) {
    s.graves = s.graves.filter((g) => { g.ttl--; if (g.ttl <= 0) { ev.push({ type: 'graveFade', sq: g.sq }); return false; } return true; });
  }
  if (s.craters.length) {
    s.craters = s.craters.filter((c) => { c.ttl--; if (c.ttl <= 0) { ev.push({ type: 'craterCool', sq: c.sq }); return false; } return true; });
  }
  if (s.holes.length) {
    const keep = [];
    for (const h of s.holes) {
      if (h.warn > 0) {
        h.warn--;
        if (h.warn === 0) {
          ev.push({ type: 'holeOpen', sq: h.sq });
          s.graves = s.graves.filter((g) => g.sq !== h.sq);
          for (const q of [h.sq, ...NEIGHBORS[h.sq]]) {
            const p = b[q];
            if (p) { b[q] = 0; s.lost[sideOf(p)]++; material = true; ev.push({ type: 'suck', sq: q, hole: h.sq, piece: p, side: sideOf(p) }); }
          }
        }
        keep.push(h);
      } else if (--h.life <= 0) ev.push({ type: 'holeClose', sq: h.sq });
      else keep.push(h);
    }
    s.holes = keep;
  }
  if (s.meteors.length) {
    const keep = [];
    for (const m of s.meteors) {
      if (--m.warn > 0) { keep.push(m); continue; }
      const p = b[m.sq];
      ev.push({ type: 'meteorImpact', sq: m.sq, piece: p, side: sideOf(p) });
      if (p) { b[m.sq] = 0; s.lost[sideOf(p)]++; material = true; }
      s.graves = s.graves.filter((g) => g.sq !== m.sq);
      s.craters.push({ sq: m.sq, ttl: opt.craterTurns * 2, max: opt.craterTurns * 2 });
    }
    s.meteors = keep;
  }
  if (opt.mode === 'graves') {
    for (const c of caps) {
      const ttl = opt.graveTurns * 2;
      if (ttl > 0) { s.graves.push({ sq: c.sq, ttl, max: ttl, piece: c.p }); ev.push({ type: 'graveRise', sq: c.sq, piece: c.p }); }
    }
  }
  if (spawn) spawnHazards(s);

  s.turn = -side; s.ply++;
  s.quiet = material || promoted ? 0 : s.quiet + 1;
  s.last = { from: mv.from, to: at, path: mv.path, caps: mv.caps, side };
  if (track) {
    if (material || promoted || !isKing(piece)) s.rep = {}; // irreversible: earlier positions can never recur
    const k = posKey(s); s.rep[k] = (s.rep[k] || 0) + 1;
  }
  if (check) s.result = evaluateResult(s, track);
  return s;
}

function hazardAt(s, q) {
  return s.holes.some((h) => h.sq === q) || s.graves.some((g) => g.sq === q) || s.meteors.some((m) => m.sq === q)
    || s.craters.some((c) => c.sq === q) || s.portals.includes(q);
}

function spawnHazards(s) {
  const opt = s.opts, b = s.board;
  if (opt.mode === 'blackholes' && --s.holeClock <= 0) {
    s.holeClock = Math.max(1, opt.holeEvery) * 2;
    if (s.holes.length < opt.maxHoles) {
      const near = (q) => NEIGHBORS[q].reduce((n, x) => n + (b[x] ? 1 : 0), 0);
      let cand = DARK.filter((q) => b[q] === 0 && !hazardAt(s, q) && !s.holes.some((h) => h.sq === q || isDiagAdj(h.sq, q)));
      const gentle = cand.filter((q) => near(q) <= 2);
      if (gentle.length) cand = gentle;
      if (cand.length) {
        const q = cand[Math.floor(rand(s) * cand.length)];
        s.holes.push({ sq: q, warn: opt.holeWarn, life: opt.holeLife * 2 });
        s.events.push({ type: 'holeWarn', sq: q });
      }
    }
  }
  if (opt.mode === 'meteors' && --s.meteorClock <= 0) {
    s.meteorClock = Math.max(1, opt.meteorEvery) * 2;
    const cand = DARK.filter((q) => !hazardAt(s, q));
    if (cand.length) {
      const q = cand[Math.floor(rand(s) * cand.length)];
      s.meteors.push({ sq: q, warn: opt.meteorWarn });
      s.events.push({ type: 'meteorWarn', sq: q });
    }
  }
}

// Called for the side to move. winner: RED / BLACK / 0 (draw).
export function evaluateResult(s, track = true) {
  const me = countPieces(s, s.turn).total, them = countPieces(s, -s.turn).total;
  if (me === 0 && them === 0) return { winner: 0, reason: 'Both armies lost to the void' };
  if (me === 0) return { winner: -s.turn, reason: 'No pieces left' };
  if (them === 0) return { winner: s.turn, reason: 'No pieces left' };
  if (legalMoves(s).length === 0) return { winner: -s.turn, reason: 'No legal moves' };
  if (s.quiet >= s.opts.quietLimit) return { winner: 0, reason: '40-move rule' };
  if (track && s.rep && Object.values(s.rep).some((n) => n >= 3)) return { winner: 0, reason: 'Threefold repetition' };
  return null;
}

// Test/debug helper: an empty board with chosen pieces. pieces: { 'c3': 1, 'd6': -2, ... } or [[sq, piece], ...]
export function fromPosition(pieces, opts = {}, turn = RED) {
  const s = newGame(opts, 1);
  s.board.fill(0);
  const list = Array.isArray(pieces) ? pieces : Object.entries(pieces);
  for (const [q, p] of list) s.board[parseSq(q)] = p;
  s.turn = turn; s.rep = { [posKey(s)]: 1 };
  return s;
}
