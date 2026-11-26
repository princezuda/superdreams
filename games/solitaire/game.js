// Solitaire Suite — Klondike, Spider, FreeCell on a Canvas 2D table. Rules/solver in rules.js (node-tested), card art in
// cards.js. Cards are sprites that ease toward layout targets every frame; drag, tap-to-move, undo, hints, auto-finish,
// bouncing win cascade, per-variant statistics, seeded shareable deals and save/resume.
import { settings, store, sfx, startMenu, settingsButton, initUI, toast, loadDream, probe, host, Q, updateTweens } from '/shared/sd-kit.js';
import * as R from './rules.js';
import { buildCards, rrect, suitPath } from './cards.js';
import { audio } from './audio.js';

const DEFAULTS = { theme: 'green', colors: { accent: '#ffd36e', back: '#2a5fd0' }, difficulty: 'easy', mode: 'klondike', deal: 0, fourColor: false, autoComplete: true, animSpeed: 1, leftHanded: false };
let cfg = await loadDream(DEFAULTS, (c) => applyConfig(c));
const $ = (s) => document.querySelector(s);
initUI({ grain: false });
const VARIANTS = {
  klondike: { easy: { label: 'Draw 1', opts: { draw: 1 } }, medium: { label: 'Draw 3', opts: { draw: 3 } }, hard: { label: 'Draw 3 · 3 passes', opts: { draw: 3, passes: 3 } } },
  spider: { easy: { label: '1 suit', opts: { suits: 1 } }, medium: { label: '2 suits', opts: { suits: 2 } }, hard: { label: '4 suits', opts: { suits: 4 } } },
  freecell: { easy: { label: '4 cells · auto-play', opts: { cells: 4 } }, medium: { label: '4 cells', opts: { cells: 4 } }, hard: { label: '3 cells', opts: { cells: 3 } } },
};
const NAMES = { klondike: 'Klondike', spider: 'Spider', freecell: 'FreeCell' };
const FELT = { green: ['#2f7a4a', '#174a2c'], blue: ['#2a5a8a', '#12304e'], wine: ['#7a2a3e', '#3e1220'], night: ['#2a2f48', '#11131f'], wood: ['#8a5a32', '#4a2c16'] };
const statKey = () => `${G.game}-${G.diff}`;
const stats = store.get('solitaire-stats-v1', {});
const saveStats = () => store.set('solitaire-stats-v1', stats);
const S0 = () => ({ played: 0, won: 0, bestTime: null, bestMoves: null, streak: 0, bestStreak: 0 });

// ---------------------------------------------------------------- canvas + layout
const cv = document.createElement('canvas'); cv.className = 'sd-canvas'; document.body.prepend(cv); const ctx = cv.getContext('2d');
const bg = document.createElement('canvas'), trail = document.createElement('canvas'); const tctx = trail.getContext('2d');
let W = 0, H = 0, DPR = 1, cw = 60, ch = 85, gap = 6, ox = 0, rowY = 60, tabY = 160, ART = null, fu = 20, fd = 8;
const G = { game: cfg.mode, diff: cfg.difficulty, st: null, hist: [], sprites: new Map(), drag: null, time: 0, timing: false, screen: 'menu', hintFx: null, auto: false, cascade: null, won: false, shake: null, t: 0, busy: false };
const ncols = () => (G.game === 'spider' ? 10 : G.game === 'freecell' ? 8 : 7);
function layout() {
  W = innerWidth; H = innerHeight; DPR = Math.min(devicePixelRatio || 1, settings.quality === 'low' ? 1 : 2);
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); trail.width = cv.width; trail.height = cv.height;
  const n = ncols(), top = 58, bottom = 76; gap = Math.max(3, Math.min(12, W * 0.012));
  cw = Math.min((W - gap * (n + 1)) / n, 108); ch = cw * 1.42;
  const maxCh = (H - top - bottom - gap * 3) / 4.2; if (ch > maxCh) { ch = maxCh; cw = ch / 1.42; }
  ox = (W - (n * cw + (n - 1) * gap)) / 2; rowY = top + gap; tabY = rowY + ch + gap * 2.2;
  fu = ch * (W < 500 ? 0.3 : 0.26); fd = ch * 0.12;
  ART = buildCards(cw, ch, DPR, { four: settings.colorblind || cfg.fourColor, backA: cfg.colors?.back || '#2a5fd0', backB: shade(cfg.colors?.back || '#2a5fd0', -0.45) });
  paintTable();
}
const colX = (i) => ox + i * (cw + gap);
function slotX(kind, i) {
  const n = ncols(), L = !!cfg.leftHanded, mir = (k) => (L ? n - 1 - k : k);
  if (G.game === 'klondike') return colX(mir(kind === 'stock' ? 0 : kind === 'waste' ? 1 : 3 + i));
  if (G.game === 'freecell') return colX(mir(kind === 'cell' ? i : 4 + i));
  return colX(mir(kind === 'stock' ? 9 : i)); // spider: completed runs 0..7, stock at 9
}
function shade(hex, t) { const n = parseInt(hex.slice(1), 16); let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; const f = (v) => Math.round(t >= 0 ? v + (255 - v) * t : v * (1 + t)); return `rgb(${f(r)},${f(g)},${f(b)})`; }
function paintTable() {
  bg.width = cv.width; bg.height = cv.height; const c = bg.getContext('2d'); c.setTransform(DPR, 0, 0, DPR, 0, 0);
  const f = FELT[cfg.theme] || FELT.green; const g = c.createRadialGradient(W / 2, H * 0.4, 10, W / 2, H * 0.5, Math.max(W, H) * 0.75); g.addColorStop(0, f[0]); g.addColorStop(1, f[1]); c.fillStyle = g; c.fillRect(0, 0, W, H);
  // felt fibre noise
  const nc = document.createElement('canvas'); nc.width = nc.height = 128; const nx = nc.getContext('2d'); const id = nx.createImageData(128, 128); for (let i = 0; i < id.data.length; i += 4) { const v = Math.random() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 14; } nx.putImageData(id, 0, 0);
  c.fillStyle = c.createPattern(nc, 'repeat'); c.fillRect(0, 0, W, H);
  if (cfg.theme === 'wood') { c.strokeStyle = 'rgba(0,0,0,.08)'; for (let y = 0; y < H; y += 7) { c.beginPath(); c.moveTo(0, y); for (let x = 0; x < W; x += 40) c.lineTo(x, y + Math.sin(x * 0.01 + y) * 3); c.stroke(); } }
  // slot outlines
  const slot = (x, y, label, s) => { c.strokeStyle = 'rgba(255,255,255,.22)'; c.lineWidth = 1.5; rrect(c, x + 1, y + 1, cw - 2, ch - 2, cw * 0.085); c.stroke(); c.fillStyle = 'rgba(0,0,0,.12)'; c.fill(); if (s != null) { c.fillStyle = 'rgba(255,255,255,.14)'; suitPath(c, s, x + cw / 2, y + ch / 2, cw * 0.42); c.fill(); } if (label) { c.fillStyle = 'rgba(255,255,255,.3)'; c.font = `700 ${cw * 0.26}px Inter,system-ui,sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(label, x + cw / 2, y + ch / 2); } };
  if (G.game === 'klondike') { slot(slotX('stock'), rowY, '↻'); for (let i = 0; i < 4; i++) slot(slotX('found', i), rowY, null, i); }
  else if (G.game === 'freecell') { for (let i = 0; i < (G.st?.cellsN || 4); i++) slot(slotX('cell', i), rowY, ''); for (let i = 0; i < 4; i++) slot(slotX('found', i), rowY, null, i); }
  else { for (let i = 0; i < 8; i++) slot(slotX('found', i), rowY, ''); slot(slotX('stock'), rowY, ''); }
  for (let i = 0; i < ncols(); i++) slot(colX(i), tabY, G.game === 'klondike' ? 'K' : '');
}

// ---------------------------------------------------------------- targets from state
function colOffsets(p) { let tot = 0; for (let k = 0; k < p.length - 1; k++) tot += p[k].up ? fu : fd; const avail = H - 80 - tabY - ch; const s = tot > avail && tot > 0 ? Math.max(0.35, avail / tot) : 1; return s; }
function targets() {
  const st = G.st, T = new Map(); let z = 0;
  const put = (card, x, y, up = card.up) => T.set(card.id, { x, y, up, z: z++, c: card.c });
  if (G.game === 'klondike') {
    st.stock.forEach((c, k) => put(c, slotX('stock') - Math.min(k, 6) * 0.4, rowY - Math.min(k, 6) * 0.4, false));
    const fan = st.draw === 3 ? 3 : 1, wn = st.waste.length, dir = cfg.leftHanded ? -1 : 1;
    st.waste.forEach((c, k) => { const vis = k - (wn - fan); put(c, slotX('waste') + dir * Math.max(0, vis) * cw * 0.3, rowY); });
  }
  if (G.game === 'spider') { st.stock.forEach((c, k) => put(c, slotX('stock') - Math.floor(k / 10) * cw * 0.12 * (cfg.leftHanded ? -1 : 1), rowY, false)); st.found.forEach((run, i) => run.slice().reverse().forEach((c) => put(c, slotX('found', i), rowY, true))); }
  else st.found.forEach((f, i) => f.forEach((c) => put(c, slotX('found', i), rowY)));
  if (G.game === 'freecell') st.cells.forEach((c, i) => c && put(c, slotX('cell', i), rowY));
  st.tab.forEach((p, i) => { const s = colOffsets(p); let y = tabY; p.forEach((c) => { put(c, colX(i), y); y += (c.up ? fu : fd) * s; }); });
  return T;
}
function sync(stagger = 0) {
  const T = targets(), sp = speed();
  let k = 0;
  for (const [id, t] of T) {
    let s = G.sprites.get(id);
    if (!s) { s = { id, c: t.c, x: t.x, y: t.y, fx: t.x, fy: t.y, tx: t.x, ty: t.y, t: 1, dur: 0.2, delay: 0, up: t.up, flip: 1, z: t.z }; G.sprites.set(id, s); }
    if (Math.abs(s.tx - t.x) > 0.5 || Math.abs(s.ty - t.y) > 0.5) { s.fx = s.x; s.fy = s.y; s.tx = t.x; s.ty = t.y; s.t = 0; s.dur = (0.16 + Math.min(0.25, Math.hypot(t.x - s.x, t.y - s.y) / 3000)) / sp; s.delay = stagger * k++ / sp; }
    if (s.up !== t.up) { s.up = t.up; s.flip = 0; }
    s.z = t.z; s.c = t.c;
  }
}
const speed = () => Math.max(0.3, cfg.animSpeed || 1) * (settings.reducedMotion ? 2 : 1);

// ---------------------------------------------------------------- game lifecycle
function newGame(game = G.game, diff = G.diff, seed = null) {
  G.game = game; G.diff = diff; G.won = false; G.cascade = null; G.hist = []; G.time = 0; G.timing = false; G.sprites.clear(); G.auto = false;
  const v = VARIANTS[game][diff]; seed = seed || (cfg.deal | 0) || 1 + Math.floor(Math.random() * 99999);
  G.st = game === 'klondike' ? R.dealKlondike(seed, v.opts) : game === 'spider' ? R.dealSpider(seed, v.opts) : R.dealFreeCell(seed, v.opts);
  G.counted = false; layout();
  // deal animation: everything flies from the stock corner
  const T = targets(); let k = 0; for (const [id, t] of T) { G.sprites.set(id, { id, c: t.c, x: W / 2 - cw / 2, y: H + 20, fx: W / 2 - cw / 2, fy: H + 20, tx: t.x, ty: t.y, t: 0, dur: 0.35 / speed(), delay: (k++ * 0.012) / speed(), up: t.up, flip: 1, z: t.z }); }
  audio.shuffle(); G.screen = 'play'; hud(); persist(); $('#hud').classList.add('show'); $('#bar').classList.add('show');
  host('start', { game, diff, seed });
}
function persist() { if (G.st && !G.won) store.set('solitaire-save-v1', { game: G.game, diff: G.diff, st: G.st, time: G.time, counted: G.counted }); else store.set('solitaire-save-v1', null); }
function resume(sv) { G.game = sv.game; G.diff = sv.diff; G.st = sv.st; G.time = sv.time || 0; G.counted = sv.counted; G.hist = []; G.won = false; G.cascade = null; G.sprites.clear(); layout(); sync(); G.screen = 'play'; hud(); $('#hud').classList.add('show'); $('#bar').classList.add('show'); toast('Welcome back — your game is where you left it'); }
function doMove(m, { quiet = false, record = true } = {}) {
  const st = G.st; if (!st || G.won || !R.legal(st, m)) return false;
  if (record) G.hist.push(R.clone(st)); if (G.hist.length > 400) G.hist.shift();
  const ev = R.apply(st, m); G.timing = true;
  if (!G.counted) { G.counted = true; const s = (stats[statKey()] ||= S0()); s.played++; saveStats(); }
  if (!quiet) { if (m.to?.p === 'found') audio.found(R.rank(R.pile(st, m.to).at(-1).c)); else if (m.type === 'draw' || m.type === 'deal') audio.slide(); else audio.place(); }
  if (ev.flipped.length) setTimeout(() => audio.flip(), 120);
  if (ev.completed.length) { audio.run(); ev.completed.forEach((q) => sparkle(colX(q.i) + cw / 2, tabY + ch, 30)); toast('Run complete!', 1200); }
  if (m.to?.p === 'found') { const x = slotX('found', m.to.i) + cw / 2, y = rowY + ch / 2; sparkle(x, y, 10); }
  G.hintFx = null; sync(m.n > 1 || m.type ? 0.03 : 0); hud();
  if (R.won(st)) { win(); return true; }
  if (G.diff === 'easy' && !G.auto) autoSafe();
  persist(); return true;
}
function autoSafe() { const st = G.st; for (let guard = 0; guard < 52; guard++) { const m = R.nextFoundationMove(st); if (!m) break; const c = R.pile(st, m.from).at(-1).c; if (!R.safeFoundation(st, c)) break; setTimeout(() => doMove(m), 140 * (guard + 1) / speed()); break; } }
function undo() { if (!G.hist.length || G.won || G.busy) { audio.bad(); return; } G.st = G.hist.pop(); G.st.moves++; audio.slide(); sync(); hud(); persist(); }
function showHint() {
  if (G.won) return; const h = R.hint(G.st);
  if (!h) { audio.bad(); toast(G.game === 'klondike' && !G.st.stock.length && !G.st.waste.length ? 'No moves left — undo or start a new deal' : 'No useful moves — try Undo or a New deal'); return; }
  if (h.type) { G.hintFx = { pile: h.type === 'recycle' || h.type === 'draw' || h.type === 'deal' ? 'stock' : null, t: 0 }; toast(h.type === 'deal' ? 'Deal a new row from the stock' : h.type === 'draw' ? 'Draw from the stock' : 'Turn the waste back over'); return; }
  const src = R.pile(G.st, h.from); const ids = src.slice(src.length - h.n).map((c) => c.id); G.hintFx = { ids, to: h.to, t: 0 }; audio.flip();
}
function autoFinish() { if (G.auto) return; G.auto = true; const step = () => { if (!G.auto || G.won) return; const m = R.nextFoundationMove(G.st); if (!m) { G.auto = false; return; } doMove(m, { quiet: false }); setTimeout(step, 90 / speed()); }; step(); }
function win() {
  G.won = true; G.timing = false; const s = (stats[statKey()] ||= S0()); s.won++; s.streak++; s.bestStreak = Math.max(s.bestStreak, s.streak); const t = Math.round(G.time);
  const bestT = s.bestTime == null || t < s.bestTime, bestM = s.bestMoves == null || G.st.moves < s.bestMoves; if (bestT) s.bestTime = t; if (bestM) s.bestMoves = G.st.moves; saveStats(); persist();
  host('score', { game: G.game, diff: G.diff, time: t, moves: G.st.moves }); sfx.win();
  setTimeout(() => startCascade(() => card(`<div class="eyebrow">${NAMES[G.game]} · ${VARIANTS[G.game][G.diff].label}</div><h2>You won!</h2>
    <div class="wstats"><div><b>${fmt(t)}</b><small>${bestT ? 'new best time' : 'time'}</small></div><div><b>${G.st.moves}</b><small>${bestM ? 'fewest moves!' : 'moves'}</small></div><div><b>${Math.round((s.won / Math.max(1, s.played)) * 100)}%</b><small>win rate</small></div></div>
    <p class="sub">Deal #${G.st.seed} — share the number and race a friend on the same cards.</p>
    <div class="sd-row"><button class="sd-btn primary" id="wNew">New deal</button><button class="sd-btn" id="wSame">Replay deal</button><button class="sd-btn" id="wMenu">Change game</button></div>`, () => {
    $('#wNew').onclick = () => { closeCard(); newGame(); }; $('#wSame').onclick = () => { closeCard(); newGame(G.game, G.diff, G.st.seed); }; $('#wMenu').onclick = () => { closeCard(); toMenu(); };
  })), 350);
}
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
// classic bouncing cascade: cards leap off the foundations and leave a trail on an unclearing canvas
function startCascade(done) {
  tctx.setTransform(1, 0, 0, 1, 0, 0); tctx.clearRect(0, 0, trail.width, trail.height);
  const queue = []; const st = G.st; const piles = G.game === 'spider' ? st.found : st.found;
  for (let r = 0; r < 13; r++) piles.forEach((p, i) => { const c = p[p.length - 1 - r] || (G.game === 'spider' ? p[r] : null); if (c) queue.push({ c: c.c, id: c.id, x: G.game === 'spider' ? slotX('found', i) : slotX('found', i), y: rowY }); });
  G.cascade = { queue: queue.slice(0, 52), live: [], t: 0, next: 0, done, fade: 0 }; G.sprites.clear();
}
function stepCascade(dt) {
  const C = G.cascade; C.t += dt;
  if (C.queue.length && C.t >= C.next) { const q = C.queue.shift(); C.next = C.t + (settings.reducedMotion ? 0.04 : 0.11); C.live.push({ ...q, vx: (Math.random() < 0.5 ? -1 : 1) * (120 + Math.random() * 220), vy: -Math.random() * 380 }); }
  tctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  for (let i = C.live.length - 1; i >= 0; i--) { const s = C.live[i]; const sub = 3; for (let k = 0; k < sub; k++) { s.vy += 1500 * dt / sub; s.x += s.vx * dt / sub; s.y += s.vy * dt / sub; if (s.y > H - ch) { s.y = H - ch; s.vy *= -0.74; if (Math.abs(s.vy) > 120) audio.bounce(); } if (!settings.reducedMotion) tctx.drawImage(ART.faces.get(s.c % 52), s.x, s.y, cw, ch); } if (s.x < -cw - 10 || s.x > W + 10) C.live.splice(i, 1); }
  if ((!C.queue.length && !C.live.length) || C.skip) { const d = C.done; C.done = null; if (d) d(); }
}

// ---------------------------------------------------------------- input
function hitCard(x, y) {
  const st = G.st; if (!st) return null;
  // tableau (top-most first)
  for (let i = 0; i < st.tab.length; i++) { const p = st.tab[i]; for (let k = p.length - 1; k >= 0; k--) { const s = G.sprites.get(p[k].id); if (!s) continue; const h = k === p.length - 1 ? ch : Math.max(fd * 0.5, (G.sprites.get(p[k + 1].id)?.ty ?? s.ty + ch) - s.ty); if (x >= s.tx && x <= s.tx + cw && y >= s.ty && y <= s.ty + h) return { ref: { p: 'tab', i }, k, n: p.length - k }; } }
  if (G.game === 'klondike' && st.waste.length) { const c = st.waste.at(-1), s = G.sprites.get(c.id); if (s && x >= s.tx && x <= s.tx + cw && y >= s.ty && y <= s.ty + ch) return { ref: { p: 'waste', i: 0 }, n: 1 }; }
  if (G.game === 'freecell') for (let i = 0; i < st.cells.length; i++) if (st.cells[i] && inSlot(x, y, slotX('cell', i), rowY)) return { ref: { p: 'cell', i }, n: 1 };
  if (G.game === 'klondike') for (let i = 0; i < 4; i++) if (st.found[i].length && inSlot(x, y, slotX('found', i), rowY)) return { ref: { p: 'found', i }, n: 1 };
  return null;
}
const inSlot = (x, y, sx, sy) => x >= sx && x <= sx + cw && y >= sy && y <= sy + ch;
function stockHit(x, y) { if (G.game === 'freecell') return false; return x >= slotX('stock') - cw * 0.8 && x <= slotX('stock') + cw && y >= rowY && y <= rowY + ch; }
function dropTargets() {
  const st = G.st, out = [];
  st.tab.forEach((p, i) => { const last = p.length ? G.sprites.get(p.at(-1).id) : null; out.push({ ref: { p: 'tab', i }, x: colX(i), y: last ? last.ty : tabY, h: ch + (last ? 0 : 0) }); });
  if (G.game !== 'spider') for (let i = 0; i < 4; i++) out.push({ ref: { p: 'found', i }, x: slotX('found', i), y: rowY, h: ch });
  if (G.game === 'freecell') st.cells.forEach((_, i) => out.push({ ref: { p: 'cell', i }, x: slotX('cell', i), y: rowY, h: ch }));
  return out;
}
let down = null;
cv.addEventListener('pointerdown', (e) => {
  if (G.screen !== 'play' || G.won || G.auto) { if (G.cascade) G.cascade.skip = true; return; }
  const x = e.clientX, y = e.clientY; down = { x, y, t: performance.now() };
  const h = hitCard(x, y);
  if (h && (h.ref.p !== 'tab' || R.movableRun(G.st, R.pile(G.st, h.ref), h.ref.p === 'tab' ? h.k : 0))) {
    const p = R.pile(G.st, h.ref); const cards = h.ref.p === 'cell' ? p : p.slice(p.length - h.n); const s0 = G.sprites.get(cards[0].id);
    G.drag = { ...h, ids: cards.map((c) => c.id), dx: x - s0.x, dy: y - s0.y, moved: false }; cv.setPointerCapture?.(e.pointerId);
  } else down.stock = stockHit(x, y);
});
cv.addEventListener('pointermove', (e) => {
  const d = G.drag; if (!d) return; const x = e.clientX, y = e.clientY;
  if (!d.moved && Math.hypot(x - down.x, y - down.y) > 7) { d.moved = true; audio.flip(); }
  if (d.moved) d.ids.forEach((id, k) => { const s = G.sprites.get(id); s.x = x - d.dx; s.y = y - d.dy + k * fu; s.t = 1; s.drag = true; });
});
addEventListener('pointerup', (e) => {
  const d = G.drag; G.drag = null; if (!down) return; const dn = down; down = null;
  if (G.screen !== 'play' || G.won) return;
  if (d) { d.ids.forEach((id) => { const s = G.sprites.get(id); if (s) s.drag = false; }); }
  if (d && d.moved) {
    const s0 = G.sprites.get(d.ids[0]); let best = null, bo = 0;
    for (const t of dropTargets()) { const ox_ = Math.max(0, Math.min(s0.x + cw, t.x + cw) - Math.max(s0.x, t.x)), oy = Math.max(0, Math.min(s0.y + ch, t.y + t.h) - Math.max(s0.y, t.y)); const o = ox_ * oy; const m = { from: d.ref, n: d.n, to: t.ref }; if (o > bo && R.legal(G.st, m)) { bo = o; best = m; } }
    if (best) doMove(best); else { audio.bad(); for (const id of d.ids) { const s = G.sprites.get(id); s.fx = s.x; s.fy = s.y; s.t = 0; s.dur = 0.22; s.delay = 0; } }
    return;
  }
  if (d) { // tap: best destination
    const m = R.bestMoveFrom(G.st, d.ref, d.n);
    if (m && R.scoreMove(G.st, m) > -50) doMove(m); else { audio.bad(); G.shake = { ids: d.ids, t: 0 }; }
    return;
  }
  if (dn.stock) { const st = G.st; if (G.game === 'klondike') { if (st.stock.length) doMove({ type: 'draw' }); else if (R.legal(st, { type: 'recycle' })) doMove({ type: 'recycle' }); else { audio.bad(); toast('No more passes through the stock'); } } else if (G.game === 'spider') { if (R.legal(st, { type: 'deal' })) doMove({ type: 'deal' }); else { audio.bad(); toast(st.stock.length ? 'Fill every column before dealing' : 'The stock is empty'); } } }
});
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { if (G.screen === 'paused') $('#pRes')?.click(); else pause(); return; }
  if (G.screen !== 'play') return;
  if ((e.key === 'z' && (e.ctrlKey || e.metaKey)) || e.key === 'u' || e.key === 'U' || e.key === 'Backspace') { e.preventDefault(); undo(); }
  else if (e.key === 'h' || e.key === 'H') showHint();
  else if (e.key === ' ' || e.key === 'd' || e.key === 'D') { e.preventDefault(); const st = G.st; if (G.game === 'klondike') doMove(st.stock.length ? { type: 'draw' } : { type: 'recycle' }); else if (G.game === 'spider') doMove({ type: 'deal' }); }
  else if (e.key === 'Enter') { const h = R.hint(G.st); if (h) doMove(h); }
});

// ---------------------------------------------------------------- UI (DOM)
document.body.insertAdjacentHTML('beforeend', `
<div id="hud"><button class="sd-btn sd-icon" id="pauseBtn" aria-label="Pause">❚❚</button><div class="ht"><b id="hGame">Klondike</b><small id="hInfo">Deal #1</small></div><div class="hs"><span id="hTime">0:00</span><span id="hMoves">0 moves</span><span id="hScore"></span></div></div>
<div id="bar"><button class="sd-btn" id="bUndo">↶<small>Undo</small></button><button class="sd-btn" id="bHint">💡<small>Hint</small></button><button class="sd-btn" id="bAuto">✨<small>Finish</small></button><button class="sd-btn" id="bNew">🂠<small>New</small></button></div>
<div id="card" class="sd-panel"><div class="sd-card so-card" id="cardBody"></div></div>`);
const menu = startMenu({ title: 'Solitaire Suite', subtitle: '<span id="menuDesc"></span>',
  options: [{ key: 'game', label: 'Game', value: ['klondike', 'spider', 'freecell'].includes(cfg.mode) ? cfg.mode : 'klondike', choices: [{ v: 'klondike', label: 'Klondike' }, { v: 'spider', label: 'Spider' }, { v: 'freecell', label: 'FreeCell' }] },
    { key: 'diff', label: 'Difficulty', value: ['easy', 'medium', 'hard'].includes(cfg.difficulty) ? cfg.difficulty : 'easy', choices: [{ v: 'easy', label: 'Easy' }, { v: 'medium', label: 'Medium' }, { v: 'hard', label: 'Hard' }] }],
  startLabel: 'Deal', onStart: (v) => { const sv = store.get('solitaire-save-v1'); if (sv && sv.game === v.game && sv.diff === v.diff && sv.st) resume(sv); else newGame(v.game, v.diff); } });
const DESC = { klondike: 'Build four suit piles from Ace to King. Stack down in alternating colours; only Kings fill empty columns.', spider: 'Build King-to-Ace runs of one suit to clear them. Any card can sit on one rank higher.', freecell: 'Every deal is verified winnable. Use the free cells wisely; build down in alternating colours.' };
function menuDesc() { const v = menu.values; $('#menuDesc').innerHTML = `${DESC[v.game]}<br><b>${VARIANTS[v.game][v.diff].label}</b>${store.get('solitaire-save-v1')?.game === v.game && store.get('solitaire-save-v1')?.diff === v.diff ? ' · saved game will resume' : ''}`; }
document.querySelectorAll('#menu .sd-row[data-key]').forEach((r) => r.addEventListener('click', () => setTimeout(menuDesc, 0))); menuDesc();
settingsButton();
let cardOpen = false;
function card(html, wire) { $('#cardBody').innerHTML = html; $('#card').classList.add('open'); cardOpen = true; wire?.(); }
function closeCard() { $('#card').classList.remove('open'); cardOpen = false; }
$('#pauseBtn').onclick = () => pause(); $('#bUndo').onclick = () => undo(); $('#bHint').onclick = () => showHint(); $('#bAuto').onclick = () => autoFinish();
$('#bNew').onclick = () => { sfx.click(); if (G.st && G.st.moves > 0 && !G.won) { const s = (stats[statKey()] ||= S0()); s.streak = 0; saveStats(); } newGame(); };
function toMenu() { G.screen = 'menu'; $('#hud').classList.remove('show'); $('#bar').classList.remove('show'); menuDesc(); menu.show(); }
function statsHtml() {
  return `<table class="stats"><tr><th></th><th>Played</th><th>Won</th><th>Win %</th><th>Best time</th><th>Fewest</th></tr>${Object.keys(VARIANTS).flatMap((g) => Object.keys(VARIANTS[g]).map((d) => { const s = stats[`${g}-${d}`] || S0(); return `<tr><td>${NAMES[g]} <small>${VARIANTS[g][d].label}</small></td><td>${s.played}</td><td>${s.won}</td><td>${s.played ? Math.round((s.won / s.played) * 100) : 0}</td><td>${s.bestTime != null ? fmt(s.bestTime) : '–'}</td><td>${s.bestMoves ?? '–'}</td></tr>`; })).join('')}</table>`;
}
function pause() {
  if (G.screen !== 'play' || cardOpen) return; sfx.click(); G.screen = 'paused';
  card(`<h2>Paused</h2><p class="sub">${NAMES[G.game]} · ${VARIANTS[G.game][G.diff].label} · Deal #${G.st.seed}</p>
    <div class="sd-row col"><button class="sd-btn primary" id="pRes">Resume</button><button class="sd-btn" id="pStats">Statistics</button><button class="sd-btn" id="pSet">Settings</button><button class="sd-btn" id="pRe">Restart this deal</button>
    <div class="dealrow"><input id="pDeal" type="number" min="1" max="99999" placeholder="Deal #" aria-label="Deal number"><button class="sd-btn" id="pGo">Play deal</button></div><button class="sd-btn" id="pMenu">Change game</button></div>`, () => {
    $('#pRes').onclick = () => { closeCard(); G.screen = 'play'; }; $('#pSet').onclick = () => $('#sd-gear').click();
    $('#pRe').onclick = () => { closeCard(); newGame(G.game, G.diff, G.st.seed); }; $('#pMenu').onclick = () => { closeCard(); toMenu(); };
    $('#pGo').onclick = () => { const n = Math.max(1, Math.min(99999, +$('#pDeal').value | 0)); if (!$('#pDeal').value) return; closeCard(); newGame(G.game, G.diff, n); };
    $('#pStats').onclick = () => card(`<h2>Statistics</h2>${statsHtml()}<div class="sd-row"><button class="sd-btn primary" id="sBack">Back</button></div>`, () => { $('#sBack').onclick = () => { closeCard(); G.screen = 'play'; pause(); }; });
  });
}
function hud() {
  const st = G.st; if (!st) return; $('#hGame').textContent = `${NAMES[G.game]} · ${VARIANTS[G.game][G.diff].label}`; $('#hInfo').textContent = `Deal #${st.seed}`;
  $('#hMoves').textContent = `${st.moves} moves`; $('#hScore').textContent = G.game === 'freecell' ? '' : `${st.score} pts`;
  $('#bAuto').classList.toggle('show', !!cfg.autoComplete && R.canAutoComplete(st) && !G.won); $('#bUndo').disabled = !G.hist.length;
}

// ---------------------------------------------------------------- render
const sparks = []; function sparkle(x, y, n) { for (let k = 0; k < n * (settings.reducedMotion ? 0.4 : 1); k++) { const a = Math.random() * 6.28, v = 60 + Math.random() * 160; sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, t: 0, life: 0.5 + Math.random() * 0.4 }); } }
function drawCard(s, lift = 0, noShadow = false) {
  const x = s.x, y = s.y - lift; const sx = s.flip < 1 ? Math.abs(Math.cos(s.flip * Math.PI)) : 1; const showUp = s.flip < 0.5 ? !s.up : s.up;
  const P = ART.pad; if (!noShadow) { ctx.globalAlpha = 0.75; ctx.drawImage(ART.shadow, x - P + (lift ? 3 : 0), y - P + (lift ? lift * 0.6 : 0), cw + P * 2, ch + P * 2); ctx.globalAlpha = 1; }
  const img = showUp ? ART.faces.get(s.c % 52) : ART.back;
  if (sx < 1) { ctx.save(); ctx.translate(x + cw / 2, y); ctx.scale(Math.max(0.02, sx), 1); ctx.drawImage(img, -cw / 2, 0, cw, ch); ctx.restore(); } else ctx.drawImage(img, x, y, cw, ch);
}
function frame(dt) {
  G.t += dt; updateTweens(dt);
  if (G.timing && G.screen === 'play' && !document.hidden) { G.time += dt; $('#hTime').textContent = fmt(G.time); }
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.drawImage(bg, 0, 0, W, H);
  if (G.cascade) { stepCascade(dt); ctx.drawImage(trail, 0, 0, W, H); }
  // spider stock count
  if (G.st && G.game === 'spider' && G.st.stock.length && !G.cascade) { ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = `700 ${Math.max(11, cw * 0.22)}px Inter,system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.fillText(`${G.st.stock.length / 10} deals`, slotX('stock') + cw / 2 - cw * 0.3, rowY + ch + 14); }
  const list = [...G.sprites.values()];
  for (const s of list) {
    if (s.drag) continue;
    if (s.t < 1) { if (s.delay > 0) s.delay -= dt; else { s.t = Math.min(1, s.t + dt / s.dur); const e = 1 - Math.pow(1 - s.t, 3); s.x = s.fx + (s.tx - s.fx) * e; s.y = s.fy + (s.ty - s.fy) * e; } }
    else { s.x = s.tx; s.y = s.ty; }
    if (s.flip < 1) s.flip = Math.min(1, s.flip + dt * 5 * speed());
  }
  list.sort((a, b) => (a.drag ? 1e6 : 0) + (a.t < 1 ? 1e4 : 0) + a.z - ((b.drag ? 1e6 : 0) + (b.t < 1 ? 1e4 : 0) + b.z));
  let shakeIds = null; if (G.shake) { G.shake.t += dt; if (G.shake.t > 0.3) G.shake = null; else shakeIds = G.shake.ids; }
  let lx = -1e9, ly = -1e9; for (const s of list) { const sh = shakeIds && shakeIds.includes(s.id) ? Math.sin(G.shake.t * 60) * 5 * (1 - G.shake.t / 0.3) : 0; s.x += sh; const stacked = Math.abs(s.x - lx) < 3 && Math.abs(s.y - ly) < 3; drawCard(s, s.drag ? 6 : 0, stacked); lx = s.x; ly = s.y; s.x -= sh; }
  // hint glow
  if (G.hintFx) { const h = G.hintFx; h.t += dt; const a = 0.5 + 0.5 * Math.sin(h.t * 8); ctx.lineWidth = 3; ctx.strokeStyle = cfg.colors?.accent || '#ffd36e'; ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 12; ctx.globalAlpha = a;
    if (h.ids) for (const id of h.ids) { const s = G.sprites.get(id); if (s) { rrect(ctx, s.x, s.y, cw, ch, cw * 0.085); ctx.stroke(); } }
    if (h.to) { const t = dropTargets().find((q) => q.ref.p === h.to.p && q.ref.i === h.to.i); if (t) { rrect(ctx, t.x - 3, t.y - 3, cw + 6, t.h + 6, cw * 0.1); ctx.stroke(); } }
    if (h.pile === 'stock') { rrect(ctx, slotX('stock') - 3, rowY - 3, cw + 6, ch + 6, cw * 0.1); ctx.stroke(); }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0; if (h.t > 2.4) G.hintFx = null; }
  for (let i = sparks.length - 1; i >= 0; i--) { const p = sparks[i]; p.t += dt; if (p.t > p.life) { sparks.splice(i, 1); continue; } p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 300 * dt; ctx.globalAlpha = 1 - p.t / p.life; ctx.fillStyle = cfg.colors?.accent || '#ffd36e'; ctx.beginPath(); ctx.arc(p.x, p.y, 2.2, 0, 6.28); ctx.fill(); }
  ctx.globalAlpha = 1;
  P.frames++; P.counts.cards = G.sprites.size; P.counts.moving = list.filter((s) => s.t < 1).length;
}

// ---------------------------------------------------------------- remix / settings
function applyConfig(c) {
  const prev = cfg; cfg = c; document.documentElement.style.setProperty('--accent', c.colors?.accent || '#ffd36e');
  if (G.st && (c.leftHanded !== prev.leftHanded)) { layout(); sync(); } else layout();
  if (c.mode !== prev.mode) { menu.values.game = c.mode; document.querySelectorAll('#menu .sd-row[data-key="game"] .sd-btn').forEach((b) => b.classList.toggle('on', b.dataset.v === c.mode)); menuDesc(); }
  if (c.difficulty !== prev.difficulty) { menu.values.diff = c.difficulty; document.querySelectorAll('#menu .sd-row[data-key="diff"] .sd-btn').forEach((b) => b.classList.toggle('on', b.dataset.v === c.difficulty)); menuDesc(); }
  hud();
}
addEventListener('resize', () => { layout(); if (G.st) sync(); });
addEventListener('sd-settings', () => { layout(); if (G.st) sync(); });
const P = probe({ backend: {} }, { dataReady: false }); P.backend = 'canvas2d';
layout();
let last = performance.now(); const loop = (now) => { const dt = Math.min(0.05, (now - last) / 1000); last = now; frame(dt); requestAnimationFrame(loop); }; requestAnimationFrame(loop);
P.dataReady = true;
P.game = {
  state: () => ({ screen: G.screen, game: G.game, diff: G.diff, seed: G.st?.seed, moves: G.st?.moves, won: G.won, found: G.st ? (G.game === 'spider' ? G.st.found.length : G.st.found.reduce((a, f) => a + f.length, 0)) : 0, canAuto: G.st ? R.canAutoComplete(G.st) : false, verified: G.st?.verified }),
  start: (game = 'klondike', diff = 'easy', seed) => { menu.hide(); closeCard(); newGame(game, diff, seed); },
  hint: () => showHint(), undo: () => undo(),
  // FreeCell: play the solver's solution with animation (proves the deal is winnable end-to-end in the real UI)
  solve: async (ms = 60) => { const sol = R.solveFreeCell(G.st, 60000); if (!sol) return false; for (const m of sol) { doMove(m, { quiet: true }); await new Promise((r) => setTimeout(r, ms)); } return G.won; },
  play: (n = 10) => { let k = 0; for (; k < n; k++) { const h = R.hint(G.st); if (!h || !doMove(h)) break; } return k; },
  win: () => { const st = G.st; const all = []; for (const p of st.tab) all.push(...p.splice(0)); if (st.stock) all.push(...st.stock.splice(0)); if (st.waste) all.push(...st.waste.splice(0)); if (st.cells) st.cells.forEach((c, i) => { if (c) all.push(c); st.cells[i] = null; }); if (G.game === 'spider') { for (const f of st.found) all.push(...f); st.found = []; for (let k = 0; k < 8; k++) st.found.push(all.slice(k * 13, k * 13 + 13).sort((a, b) => R.rank(b.c) - R.rank(a.c)).map((c) => ({ ...c, up: true }))); } else { for (const f of st.found) all.push(...f.splice(0)); all.forEach((c) => (c.up = true)); for (let s = 0; s < 4; s++) st.found[s] = all.filter((c) => R.suit(c.c) === s).sort((a, b) => R.rank(a.c) - R.rank(b.c)); } sync(); win(); },
  pause, closeCard, stats: () => stats,
};
if (Q.has('autostart')) { menu.hide(); newGame(Q.get('autostart') || 'klondike', 'easy'); }
