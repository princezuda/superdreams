// Chess: Worlds — rules engine. Pure ES module (no DOM): runs in the page, in the AI worker and in node (perft).
// 0x88 board, integer-encoded moves, make/unmake with preallocated undo stacks and incremental Zobrist hashing.
// Supports standard chess and Chess960 (X-FEN / Shredder-FEN castling), SAN in/out, FEN in/out, all draw rules.

export const WHITE = 0, BLACK = 1;
export const PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
export const F_CAP = 1, F_DBL = 2, F_EP = 4, F_CASTLE = 8;
export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
export const TYPE_CHARS = ' pnbrqk';
export const PIECE_NAMES = ['', 'pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];
export const VALUE = [0, 100, 320, 330, 500, 900, 0];

const KN = [33, 31, 18, 14, -33, -31, -18, -14];
const KG = [1, -1, 16, -16, 17, 15, -17, -15];
const BD = [17, 15, -17, -15];
const RD = [16, -16, 1, -1];

export const sqName = (s) => 'abcdefgh'[s & 7] + ((s >> 4) + 1);
export const sqFromName = (n) => (n.charCodeAt(1) - 49) * 16 + (n.charCodeAt(0) - 97);
export const fileOf = (s) => s & 7, rankOf = (s) => s >> 4;
export const mFrom = (m) => m & 127, mTo = (m) => (m >> 7) & 127, mPromo = (m) => (m >> 14) & 7, mFlags = (m) => (m >> 17) & 15;
const enc = (f, t, promo, flags) => f | (t << 7) | (promo << 14) | (flags << 17);

// ---------------------------------------------------------------- Zobrist keys (deterministic xorshift)
let seed = 0x2545F491;
const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0; };
const ZP_LO = new Int32Array(16 * 128), ZP_HI = new Int32Array(16 * 128);
for (let i = 0; i < 16 * 128; i++) { ZP_LO[i] = rnd(); ZP_HI[i] = rnd(); }
const ZC_LO = new Int32Array(4), ZC_HI = new Int32Array(4), ZE_LO = new Int32Array(8), ZE_HI = new Int32Array(8);
for (let i = 0; i < 4; i++) { ZC_LO[i] = rnd(); ZC_HI[i] = rnd(); }
for (let i = 0; i < 8; i++) { ZE_LO[i] = rnd(); ZE_HI[i] = rnd(); }
const ZS_LO = rnd(), ZS_HI = rnd();

const MAXPLY = 4096;

export class Chess {
  constructor(fen = START_FEN) {
    this.b = new Int8Array(128);
    this.castle = new Int16Array(4);          // rook squares: [W king-side, W queen-side, B king-side, B queen-side], -1 = no right
    this.kings = new Int16Array(2);
    this.turn = WHITE; this.ep = -1; this.epK = -1; this.half = 0; this.full = 1; this.ply = 0;
    this.lo = 0; this.hi = 0;
    this.uMove = new Int32Array(MAXPLY); this.uCap = new Int8Array(MAXPLY); this.uCastle = new Int16Array(MAXPLY * 4);
    this.uEp = new Int16Array(MAXPLY); this.uEpK = new Int16Array(MAXPLY); this.uHalf = new Int16Array(MAXPLY);
    this.uLo = new Int32Array(MAXPLY); this.uHi = new Int32Array(MAXPLY);
    this.chess960 = false;
    this.sanHistory = [];
    this.load(fen);
  }

  // ------------------------------------------------------------ FEN
  load(fen) {
    const parts = fen.trim().split(/\s+/);
    if (parts.length < 4) throw new Error('bad FEN: ' + fen);
    const b = this.b; b.fill(0);
    const rows = parts[0].split('/');
    if (rows.length !== 8) throw new Error('bad FEN rows');
    this.kings[0] = this.kings[1] = -1;
    for (let r = 0; r < 8; r++) {
      let f = 0;
      for (const ch of rows[r]) {
        if (ch >= '1' && ch <= '8') { f += +ch; continue; }
        const t = TYPE_CHARS.indexOf(ch.toLowerCase());
        if (t < 1 || f > 7) throw new Error('bad FEN piece ' + ch);
        const color = ch === ch.toLowerCase() ? BLACK : WHITE;
        const sq = (7 - r) * 16 + f;
        b[sq] = t | (color << 3);
        if (t === KING) this.kings[color] = sq;
        f++;
      }
    }
    if (this.kings[0] < 0 || this.kings[1] < 0) throw new Error('FEN needs both kings');
    this.turn = parts[1] === 'b' ? BLACK : WHITE;
    this.castle.fill(-1);
    let nonStd = false;
    if (parts[2] !== '-') {
      for (const ch of parts[2]) {
        const color = ch === ch.toLowerCase() ? BLACK : WHITE;
        const rank = color ? 0x70 : 0, ks = this.kings[color], R = ROOK | (color << 3);
        if ((ks >> 4) !== (rank >> 4)) continue;
        const up = ch.toUpperCase();
        let rs = -1;
        if (up === 'K') { for (let f = 7; f > (ks & 7); f--) if (b[rank + f] === R) { rs = rank + f; break; } }
        else if (up === 'Q') { for (let f = 0; f < (ks & 7); f++) if (b[rank + f] === R) { rs = rank + f; break; } }
        else if (up >= 'A' && up <= 'H') { const f = up.charCodeAt(0) - 65; if (b[rank + f] === R) rs = rank + f; nonStd = true; }
        if (rs < 0) continue;
        const side = (rs & 7) > (ks & 7) ? 0 : 1;
        this.castle[color * 2 + side] = rs;
        if ((ks & 7) !== 4 || (side === 0 && (rs & 7) !== 7) || (side === 1 && (rs & 7) !== 0)) nonStd = true;
      }
    }
    this.chess960 = nonStd;
    this.ep = parts[3] !== '-' ? sqFromName(parts[3]) : -1;
    this.half = parts[4] ? parseInt(parts[4], 10) || 0 : 0;
    this.full = parts[5] ? Math.max(1, parseInt(parts[5], 10) || 1) : 1;
    this.ply = 0; this.sanHistory = [];
    this.startFen = fen;
    this.computeHash();
    return this;
  }

  computeHash() {
    let lo = 0, hi = 0; const b = this.b;
    for (let s = 0; s < 128; s++) { if (s & 0x88) { s += 7; continue; } if (b[s]) { lo ^= ZP_LO[b[s] * 128 + s]; hi ^= ZP_HI[b[s] * 128 + s]; } }
    for (let i = 0; i < 4; i++) if (this.castle[i] >= 0) { lo ^= ZC_LO[i]; hi ^= ZC_HI[i]; }
    this.epK = -1;
    if (this.ep >= 0 && this.epCapturable(this.ep)) { this.epK = this.ep; lo ^= ZE_LO[this.ep & 7]; hi ^= ZE_HI[this.ep & 7]; }
    if (this.turn === BLACK) { lo ^= ZS_LO; hi ^= ZS_HI; }
    this.lo = lo; this.hi = hi;
  }

  // ep square counts for repetition only when a pawn of the side to move stands ready to take
  epCapturable(ep) {
    const us = this.turn, P = PAWN | (us << 3), pawnSq = ep + (us ? 16 : -16);
    const a = pawnSq - 1, c = pawnSq + 1;
    return (!(a & 0x88) && this.b[a] === P) || (!(c & 0x88) && this.b[c] === P);
  }

  fen() {
    const b = this.b; let s = '';
    for (let r = 7; r >= 0; r--) {
      let empty = 0;
      for (let f = 0; f < 8; f++) {
        const p = b[r * 16 + f];
        if (!p) { empty++; continue; }
        if (empty) { s += empty; empty = 0; }
        const ch = TYPE_CHARS[p & 7];
        s += (p >> 3) ? ch : ch.toUpperCase();
      }
      if (empty) s += empty;
      if (r) s += '/';
    }
    let c = '';
    for (let i = 0; i < 4; i++) {
      const rs = this.castle[i]; if (rs < 0) continue;
      const color = i >> 1, side = i & 1;
      let ch;
      if (!this.chess960) ch = side ? 'q' : 'k';
      else {
        // X-FEN: K/Q when the castling rook is the outermost rook on that side, else its file letter
        const rank = color ? 0x70 : 0, R = ROOK | (color << 3); let outer = true;
        if (side === 0) { for (let f = 7; f > (rs & 7); f--) if (b[rank + f] === R) outer = false; }
        else { for (let f = 0; f < (rs & 7); f++) if (b[rank + f] === R) outer = false; }
        ch = outer ? (side ? 'q' : 'k') : 'abcdefgh'[rs & 7];
      }
      c += color ? ch : ch.toUpperCase();
    }
    return `${s} ${this.turn ? 'b' : 'w'} ${c || '-'} ${this.ep >= 0 ? sqName(this.ep) : '-'} ${this.half} ${this.full}`;
  }

  // ------------------------------------------------------------ attacks
  attacked(sq, by) {
    const b = this.b; let s;
    if (by === WHITE) {
      s = sq - 15; if (!(s & 0x88) && b[s] === PAWN) return true;
      s = sq - 17; if (!(s & 0x88) && b[s] === PAWN) return true;
    } else {
      s = sq + 15; if (!(s & 0x88) && b[s] === (PAWN | 8)) return true;
      s = sq + 17; if (!(s & 0x88) && b[s] === (PAWN | 8)) return true;
    }
    const cb = by << 3, N = KNIGHT | cb, K = KING | cb, B = BISHOP | cb, R = ROOK | cb, Q = QUEEN | cb;
    for (let i = 0; i < 8; i++) { s = sq + KN[i]; if (!(s & 0x88) && b[s] === N) return true; }
    for (let i = 0; i < 8; i++) { s = sq + KG[i]; if (!(s & 0x88) && b[s] === K) return true; }
    for (let i = 0; i < 4; i++) {
      const d = BD[i]; s = sq + d;
      while (!(s & 0x88)) { const p = b[s]; if (p) { if (p === B || p === Q) return true; break; } s += d; }
    }
    for (let i = 0; i < 4; i++) {
      const d = RD[i]; s = sq + d;
      while (!(s & 0x88)) { const p = b[s]; if (p) { if (p === R || p === Q) return true; break; } s += d; }
    }
    return false;
  }
  inCheck(color = this.turn) { return this.attacked(this.kings[color], color ^ 1); }

  // ------------------------------------------------------------ pseudo-legal generation into an Int32Array
  gen(out, n, capsOnly = false) {
    const b = this.b, us = this.turn, them = us ^ 1;
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const p = b[sq]; if (!p || (p >> 3) !== us) continue;
      const t = p & 7;
      if (t === PAWN) {
        const fwd = us ? -16 : 16, promoRank = us ? 0 : 7, startRank = us ? 6 : 1;
        const to = sq + fwd;
        if (!(to & 0x88) && !b[to]) {
          if ((to >> 4) === promoRank) {
            out[n++] = enc(sq, to, QUEEN, 0);
            if (!capsOnly) { out[n++] = enc(sq, to, KNIGHT, 0); out[n++] = enc(sq, to, ROOK, 0); out[n++] = enc(sq, to, BISHOP, 0); }
          } else if (!capsOnly) {
            out[n++] = enc(sq, to, 0, 0);
            if ((sq >> 4) === startRank && !b[to + fwd]) out[n++] = enc(sq, to + fwd, 0, F_DBL);
          }
        }
        for (let k = -1; k <= 1; k += 2) {
          const c = to + k; if (c & 0x88) continue;
          const q = b[c];
          if (q && (q >> 3) === them) {
            if ((c >> 4) === promoRank) {
              out[n++] = enc(sq, c, QUEEN, F_CAP);
              if (!capsOnly) { out[n++] = enc(sq, c, KNIGHT, F_CAP); out[n++] = enc(sq, c, ROOK, F_CAP); out[n++] = enc(sq, c, BISHOP, F_CAP); }
            } else out[n++] = enc(sq, c, 0, F_CAP);
          } else if (c === this.ep && !q) out[n++] = enc(sq, c, 0, F_CAP | F_EP);
        }
      } else if (t === KNIGHT || t === KING) {
        const offs = t === KNIGHT ? KN : KG;
        for (let i = 0; i < 8; i++) {
          const to = sq + offs[i]; if (to & 0x88) continue;
          const q = b[to];
          if (!q) { if (!capsOnly) out[n++] = enc(sq, to, 0, 0); }
          else if ((q >> 3) === them) out[n++] = enc(sq, to, 0, F_CAP);
        }
      } else {
        const dirs = t === BISHOP ? BD : t === ROOK ? RD : KG;
        const nd = t === QUEEN ? 8 : 4;
        for (let i = 0; i < nd; i++) {
          const d = dirs[i]; let to = sq + d;
          while (!(to & 0x88)) {
            const q = b[to];
            if (!q) { if (!capsOnly) out[n++] = enc(sq, to, 0, 0); }
            else { if ((q >> 3) === them) out[n++] = enc(sq, to, 0, F_CAP); break; }
            to += d;
          }
        }
      }
    }
    if (!capsOnly) n = this.genCastles(out, n);
    return n;
  }

  // Chess960-aware castling: king goes to g/c file, rook to f/d. Encoded as king-takes-own-rook.
  genCastles(out, n) {
    const us = this.turn, them = us ^ 1, b = this.b, ks = this.kings[us];
    if (this.castle[us * 2] < 0 && this.castle[us * 2 + 1] < 0) return n;
    if (this.attacked(ks, them)) return n;
    const rank = us ? 0x70 : 0;
    for (let side = 0; side < 2; side++) {
      const rs = this.castle[us * 2 + side]; if (rs < 0) continue;
      const kd = rank + (side ? 2 : 6), rd = rank + (side ? 3 : 5);
      let ok = true;
      for (let s = Math.min(ks, kd); s <= Math.max(ks, kd) && ok; s++) if (s !== ks && s !== rs && b[s]) ok = false;
      for (let s = Math.min(rs, rd); s <= Math.max(rs, rd) && ok; s++) if (s !== ks && s !== rs && b[s]) ok = false;
      for (let s = Math.min(ks, kd); s <= Math.max(ks, kd) && ok; s++) if (this.attacked(s, them)) ok = false;
      if (ok) out[n++] = enc(ks, rs, 0, F_CASTLE);
    }
    return n;
  }

  castleTargets(m) { // -> [kingDest, rookDest] for a castling move
    const from = mFrom(m), to = mTo(m), rank = from & 0x70, side = (to & 7) > (from & 7) ? 0 : 1;
    return [rank + (side ? 2 : 6), rank + (side ? 3 : 5), side];
  }

  // ------------------------------------------------------------ make / unmake
  make(m) {
    const b = this.b, p = this.ply, us = this.turn;
    this.uMove[p] = m; this.uEp[p] = this.ep; this.uEpK[p] = this.epK; this.uHalf[p] = this.half; this.uLo[p] = this.lo; this.uHi[p] = this.hi;
    const c4 = p * 4, cs = this.castle;
    this.uCastle[c4] = cs[0]; this.uCastle[c4 + 1] = cs[1]; this.uCastle[c4 + 2] = cs[2]; this.uCastle[c4 + 3] = cs[3];
    let lo = this.lo, hi = this.hi;
    if (this.epK >= 0) { lo ^= ZE_LO[this.epK & 7]; hi ^= ZE_HI[this.epK & 7]; }
    for (let i = 0; i < 4; i++) if (cs[i] >= 0) { lo ^= ZC_LO[i]; hi ^= ZC_HI[i]; }
    const from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7, flags = (m >> 17) & 15;
    let cap = 0;
    if (flags & F_CASTLE) {
      const rank = from & 0x70, side = (to & 7) > (from & 7) ? 0 : 1;
      const kd = rank + (side ? 2 : 6), rd = rank + (side ? 3 : 5);
      const K = b[from], R = b[to];
      b[from] = 0; b[to] = 0;
      lo ^= ZP_LO[K * 128 + from] ^ ZP_LO[R * 128 + to] ^ ZP_LO[K * 128 + kd] ^ ZP_LO[R * 128 + rd];
      hi ^= ZP_HI[K * 128 + from] ^ ZP_HI[R * 128 + to] ^ ZP_HI[K * 128 + kd] ^ ZP_HI[R * 128 + rd];
      b[kd] = K; b[rd] = R;
      this.kings[us] = kd;
      cs[us * 2] = -1; cs[us * 2 + 1] = -1;
      this.half++; this.ep = -1;
    } else {
      const piece = b[from];
      if (flags & F_EP) {
        const cq = to + (us ? 16 : -16); cap = b[cq]; b[cq] = 0;
        lo ^= ZP_LO[cap * 128 + cq]; hi ^= ZP_HI[cap * 128 + cq];
      } else {
        cap = b[to];
        if (cap) { lo ^= ZP_LO[cap * 128 + to]; hi ^= ZP_HI[cap * 128 + to]; }
      }
      const np = promo ? (promo | (us << 3)) : piece;
      b[from] = 0; b[to] = np;
      lo ^= ZP_LO[piece * 128 + from] ^ ZP_LO[np * 128 + to];
      hi ^= ZP_HI[piece * 128 + from] ^ ZP_HI[np * 128 + to];
      if ((piece & 7) === KING) { this.kings[us] = to; cs[us * 2] = -1; cs[us * 2 + 1] = -1; }
      for (let i = 0; i < 4; i++) if (cs[i] === from || cs[i] === to) cs[i] = -1;
      this.half = ((piece & 7) === PAWN || cap) ? 0 : this.half + 1;
      this.ep = (flags & F_DBL) ? (from + to) >> 1 : -1;
    }
    this.uCap[p] = cap;
    for (let i = 0; i < 4; i++) if (cs[i] >= 0) { lo ^= ZC_LO[i]; hi ^= ZC_HI[i]; }
    this.turn = us ^ 1;
    lo ^= ZS_LO; hi ^= ZS_HI;
    this.epK = -1;
    if (this.ep >= 0 && this.epCapturable(this.ep)) { this.epK = this.ep; lo ^= ZE_LO[this.ep & 7]; hi ^= ZE_HI[this.ep & 7]; }
    if (us === BLACK) this.full++;
    this.lo = lo; this.hi = hi;
    this.ply = p + 1;
  }

  unmake() {
    const p = --this.ply, m = this.uMove[p], b = this.b;
    const us = this.turn ^ 1; this.turn = us;
    if (us === BLACK) this.full--;
    this.ep = this.uEp[p]; this.epK = this.uEpK[p]; this.half = this.uHalf[p]; this.lo = this.uLo[p]; this.hi = this.uHi[p];
    const c4 = p * 4, cs = this.castle;
    cs[0] = this.uCastle[c4]; cs[1] = this.uCastle[c4 + 1]; cs[2] = this.uCastle[c4 + 2]; cs[3] = this.uCastle[c4 + 3];
    const from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7, flags = (m >> 17) & 15;
    if (flags & F_CASTLE) {
      const rank = from & 0x70, side = (to & 7) > (from & 7) ? 0 : 1;
      const kd = rank + (side ? 2 : 6), rd = rank + (side ? 3 : 5);
      b[kd] = 0; b[rd] = 0;
      b[from] = KING | (us << 3); b[to] = ROOK | (us << 3);
      this.kings[us] = from;
    } else {
      const piece = promo ? (PAWN | (us << 3)) : b[to];
      b[from] = piece; b[to] = 0;
      const cap = this.uCap[p];
      if (flags & F_EP) b[to + (us ? 16 : -16)] = cap; else b[to] = cap;
      if ((piece & 7) === KING) this.kings[us] = from;
    }
  }

  // Null move for search (side passes). Uses the same undo slot layout with move 0.
  makeNull() {
    const p = this.ply;
    this.uMove[p] = 0; this.uEp[p] = this.ep; this.uEpK[p] = this.epK; this.uHalf[p] = this.half; this.uLo[p] = this.lo; this.uHi[p] = this.hi;
    const c4 = p * 4; for (let i = 0; i < 4; i++) this.uCastle[c4 + i] = this.castle[i];
    let lo = this.lo ^ ZS_LO, hi = this.hi ^ ZS_HI;
    if (this.epK >= 0) { lo ^= ZE_LO[this.epK & 7]; hi ^= ZE_HI[this.epK & 7]; }
    this.ep = -1; this.epK = -1; this.half++;
    this.turn ^= 1; this.lo = lo; this.hi = hi; this.ply = p + 1;
  }
  unmakeNull() {
    const p = --this.ply; this.turn ^= 1;
    this.ep = this.uEp[p]; this.epK = this.uEpK[p]; this.half = this.uHalf[p]; this.lo = this.uLo[p]; this.hi = this.uHi[p];
  }

  // ------------------------------------------------------------ legal moves
  legal() {
    const buf = new Int32Array(256), n = this.gen(buf, 0), res = [], us = this.turn;
    for (let i = 0; i < n; i++) {
      const m = buf[i];
      this.make(m);
      if (!this.attacked(this.kings[us], us ^ 1)) res.push(m);
      this.unmake();
    }
    return res;
  }

  perft(depth) {
    if (depth === 0) return 1;
    const buf = new Int32Array(256), n = this.gen(buf, 0), us = this.turn;
    let total = 0;
    for (let i = 0; i < n; i++) {
      this.make(buf[i]);
      if (!this.attacked(this.kings[us], us ^ 1)) total += depth === 1 ? 1 : this.perft(depth - 1);
      this.unmake();
    }
    return total;
  }

  // ------------------------------------------------------------ draws / status
  repetitions() {
    let count = 0;
    const stop = Math.max(0, this.ply - this.half);
    for (let i = this.ply - 2; i >= stop; i -= 2) if (this.uLo[i] === this.lo && this.uHi[i] === this.hi) count++;
    return count;
  }

  insufficient() {
    const b = this.b; let knights = 0, bishops = 0, bColors = 0;
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) { s += 7; continue; }
      const t = b[s] & 7;
      if (!t || t === KING) continue;
      if (t === PAWN || t === ROOK || t === QUEEN) return false;
      if (t === KNIGHT) knights++;
      else { bishops++; bColors |= 1 << (((s >> 4) + (s & 7)) & 1); }
    }
    if (knights === 0 && (bishops === 0 || bColors !== 3)) return true; // K v K, K+B(s) v K(+B) all on one colour
    if (knights === 1 && bishops === 0) return true;
    return false;
  }

  status() {
    const legal = this.legal();
    if (!legal.length) {
      if (this.inCheck()) return { over: true, result: this.turn ? '1-0' : '0-1', winner: this.turn ^ 1, reason: 'checkmate' };
      return { over: true, result: '1/2-1/2', winner: -1, reason: 'stalemate' };
    }
    if (this.half >= 100) return { over: true, result: '1/2-1/2', winner: -1, reason: '50-move rule' };
    if (this.repetitions() >= 2) return { over: true, result: '1/2-1/2', winner: -1, reason: 'threefold repetition' };
    if (this.insufficient()) return { over: true, result: '1/2-1/2', winner: -1, reason: 'insufficient material' };
    return { over: false, check: this.inCheck(), legal };
  }

  // ------------------------------------------------------------ SAN / UCI
  san(m, legal = this.legal()) {
    const from = mFrom(m), to = mTo(m), flags = mFlags(m), promo = mPromo(m);
    let s;
    if (flags & F_CASTLE) s = this.castleTargets(m)[2] ? 'O-O-O' : 'O-O';
    else {
      const t = this.b[from] & 7;
      if (t === PAWN) {
        s = (flags & F_CAP) ? 'abcdefgh'[from & 7] + 'x' : '';
        s += sqName(to);
        if (promo) s += '=' + 'PNBRQK'[promo - 1];
      } else {
        s = 'PNBRQK'[t - 1];
        let amb = false, sameFile = false, sameRank = false;
        for (const o of legal) {
          if (o === m || mTo(o) !== to || mFrom(o) === from || (mFlags(o) & F_CASTLE)) continue;
          if ((this.b[mFrom(o)] & 7) !== t) continue;
          amb = true;
          if ((mFrom(o) & 7) === (from & 7)) sameFile = true;
          if ((mFrom(o) >> 4) === (from >> 4)) sameRank = true;
        }
        if (amb) s += !sameFile ? 'abcdefgh'[from & 7] : !sameRank ? String((from >> 4) + 1) : sqName(from);
        if (flags & F_CAP) s += 'x';
        s += sqName(to);
      }
    }
    this.make(m);
    if (this.inCheck()) s += this.legal().length ? '+' : '#';
    this.unmake();
    return s;
  }

  uci(m) {
    if (mFlags(m) & F_CASTLE) {
      if (this.chess960) return sqName(mFrom(m)) + sqName(mTo(m));
      return sqName(mFrom(m)) + sqName(this.castleTargets(m)[0]);
    }
    return sqName(mFrom(m)) + sqName(mTo(m)) + (mPromo(m) ? TYPE_CHARS[mPromo(m)] : '');
  }

  // Accepts SAN ("Nf3", "exd8=Q+", "O-O"), UCI ("e2e4", "e7e8q", 960 "e1h1"), or {from,to,promotion}.
  parse(input, legal = this.legal()) {
    if (input == null) return 0;
    if (typeof input === 'object') {
      const promo = input.promotion ? TYPE_CHARS.indexOf(input.promotion[0].toLowerCase()) : 0;
      return this.parse(input.from + input.to + (promo ? TYPE_CHARS[promo] : ''), legal);
    }
    const str = String(input).trim().replace(/[+#!?]+$/g, '').replace(/0/g, 'O');
    if (/^[a-h][1-8][a-h][1-8][nbrqNBRQ]?$/.test(str)) {
      const f = sqFromName(str.slice(0, 2)), t = sqFromName(str.slice(2, 4)), pc = str[4] ? TYPE_CHARS.indexOf(str[4].toLowerCase()) : 0;
      for (const m of legal) {
        if (mFrom(m) !== f) continue;
        if (mFlags(m) & F_CASTLE) { if (mTo(m) === t || this.castleTargets(m)[0] === t) return m; continue; }
        if (mTo(m) === t && (mPromo(m) || 0) === (pc || (mPromo(m) ? QUEEN : 0)) && (!pc || mPromo(m) === pc)) return m;
      }
      return 0;
    }
    for (const m of legal) if (this.san(m, legal).replace(/[+#]$/, '') === str) return m;
    // lenient: missing promotion piece → queen; superfluous disambiguation
    for (const m of legal) if (this.san(m, legal).replace(/[+#]$/, '').replace('=Q', '') === str) return m;
    return 0;
  }

  // Describe a legal move for the UI layer.
  describe(m, legal) {
    const from = mFrom(m), to = mTo(m), flags = mFlags(m), piece = this.b[from];
    const d = { m, from: sqName(from), to: sqName(to), flags, piece: piece & 7, color: piece >> 3, promotion: mPromo(m), san: this.san(m, legal), uci: this.uci(m) };
    if (flags & F_CASTLE) { const [kd, rd] = this.castleTargets(m); d.kingTo = sqName(kd); d.rookFrom = sqName(to); d.rookTo = sqName(rd); d.to = sqName(kd); d.castle = true; }
    if (flags & F_CAP) { d.captured = (flags & F_EP) ? PAWN : this.b[to] & 7; d.capSq = sqName((flags & F_EP) ? to + (piece >> 3 ? 16 : -16) : to); }
    if (flags & F_EP) d.ep = true;
    return d;
  }

  // High-level move: returns the description (with san) or null. Records SAN history.
  move(input) {
    const legal = this.legal();
    const m = typeof input === 'number' ? (legal.includes(input) ? input : 0) : this.parse(input, legal);
    if (!m) return null;
    const d = this.describe(m, legal);
    this.make(m);
    this.sanHistory.push(d.san);
    return d;
  }
  undo() {
    if (this.ply === 0) return null;
    const m = this.uMove[this.ply - 1];
    this.unmake(); this.sanHistory.pop();
    return m;
  }
  movesHistory() { const r = []; for (let i = 0; i < this.ply; i++) r.push(this.uMove[i]); return r; }

  pieceAt(name) { const p = this.b[sqFromName(name)]; return p ? { type: p & 7, color: p >> 3 } : null; }
  pieces() {
    const r = [];
    for (let s = 0; s < 128; s++) { if (s & 0x88) { s += 7; continue; } const p = this.b[s]; if (p) r.push({ sq: sqName(s), type: p & 7, color: p >> 3 }); }
    return r;
  }
  material(color) { let v = 0; for (let s = 0; s < 128; s++) { if (s & 0x88) { s += 7; continue; } const p = this.b[s]; if (p && (p >> 3) === color) v += VALUE[p & 7]; } return v; }
}

// ---------------------------------------------------------------- Chess960 start positions (Scharnagl numbering; 518 = standard)
export function chess960Fen(n = Math.floor(Math.random() * 960)) {
  n = ((n % 960) + 960) % 960;
  const row = Array(8).fill(null);
  row[(n % 4) * 2 + 1] = 'b'; n = Math.floor(n / 4);
  row[(n % 4) * 2] = 'b'; n = Math.floor(n / 4);
  const empties = () => row.map((v, i) => v ? -1 : i).filter((i) => i >= 0);
  row[empties()[n % 6]] = 'q'; n = Math.floor(n / 6);
  const KNT = [[0, 1], [0, 2], [0, 3], [0, 4], [1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4]][n];
  const e = empties(); row[e[KNT[0]]] = 'n'; row[e[KNT[1]]] = 'n';
  const r = empties(); row[r[0]] = 'r'; row[r[1]] = 'k'; row[r[2]] = 'r';
  const black = row.join(''), white = black.toUpperCase();
  return `${black}/pppppppp/8/8/8/8/PPPPPPPP/${white} w KQkq - 0 1`;
}
