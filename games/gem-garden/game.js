// Gem Garden — main: flow (menu → garden map → level → bonus → growth), Canvas 2D board renderer, step playback, HUD, input, hooks.
import { settings, store, sfx, startMenu, settingsButton, initUI, toast, loadDream, probe, host, Q, tween, updateTweens, ease } from '/shared/sd-kit.js';
import * as L from './logic.js';
import { LEVELS, ZONES, tipText } from './levels.js';
import { PALETTES, GEM_NAMES, buildSprites, paintVine, paintBramble, roundRect, tintedGlow, star as starShape, paintGem, paintSeed } from './gems.js';
import { drawPlant, THEMES, zoneOf, isNight, paintBackdrop, mapLayout, mapDecor, drawMapDecor, shade, STEP } from './garden.js';
import { audio } from './audio.js';

const DEFAULTS = { theme: 'spring', colors: { accent: '#ff6fa8' }, difficulty: 'normal', mode: 'garden', gemColors: 6, juice: 2, hintDelay: 5, extraMoves: 0, gemStyle: 'faceted' };
let cfg = await loadDream(DEFAULTS, (c) => applyConfig(c, true));
const TAU = Math.PI * 2, $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
initUI({ grain: false });

// ---------------------------------------------------------------- save
const SAVE_KEY = 'gem-garden-v1';
const save = Object.assign({ stars: Array(40).fill(0), best: Array(40).fill(0), unlocked: 1, grown: Array(40).fill(false), zenBest: 0, zen: null, finale: false, diff: null, tips: {}, plays: 0, fails: Array(40).fill(0) }, store.get(SAVE_KEY) || {});
const persist = () => store.set(SAVE_KEY, save);

// ---------------------------------------------------------------- canvas
const cv = document.createElement('canvas'); cv.id = 'cv'; cv.className = 'sd-canvas'; document.body.prepend(cv);
const ctx = cv.getContext('2d');
const backdrop = document.createElement('canvas'), tiles = document.createElement('canvas');
let W = 0, H = 0, DPR = 1, cell = 48, bx = 0, by = 0, bw = 0, bh = 0, SPR = null;

const G = {
  screen: 'menu', mode: 'garden', diff: save.diff || cfg.difficulty, level: 1, st: null, vis: null, sprites: new Map(), busy: false,
  sel: -1, drag: null, cursor: 27, idle: 0, hint: null, hintShown: false, t: 0, speed: 1, shake: 0, hitstop: 0,
  mapY: 0, mapV: 0, mapDrag: null, mapLayout: null, decor: null, growing: -1, growT: 0, tip: null, def: null, attempt: 0,
  zenFlowers: [], finaleT: -1, lastResult: null,
};
const juiceK = () => [0, 0.45, 1, 1.6][clamp(cfg.juice | 0, 0, 3)] * (settings.reducedMotion ? 0.5 : 1);
const palette = () => (settings.colorblind ? PALETTES.colorblind : PALETTES.normal);
const zone = () => (G.mode === 'zen' ? (cfg.theme === 'moonlight' ? 3 : 0) : zoneOf(G.level));
const pal = (z = zone()) => (THEMES[cfg.theme] || THEMES.spring)(z);
const night = (z = zone()) => isNight(cfg.theme, z);

function layout() {
  W = innerWidth; H = innerHeight; DPR = Math.min(devicePixelRatio || 1, settings.quality === 'low' ? 1 : 2);
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  const w = G.st?.w || 8, h = G.st?.h || 8, top = W < 560 ? 132 : 122, bottom = G.mode === 'zen' ? 70 : 28;
  cell = Math.floor(Math.min((W - 16) / w, (H - top - bottom) / h, 78));
  bw = cell * w; bh = cell * h; bx = Math.round((W - bw) / 2); by = Math.round(top + Math.max(0, (H - top - bottom - bh) * 0.38));
  SPR = buildSprites(Math.round(cell * DPR), palette(), cfg.gemStyle);
  rebuildBackdrop(); rebuildTiles();
  G.mapLayout = mapLayout(W, LEVELS.length); G.decor = mapDecor(W, G.mapLayout.H); G.side = sideTrees();
  document.documentElement.style.setProperty('--accent', cfg.colors?.accent || DEFAULTS.colors.accent);
}
function grownList() { const out = []; for (let k = 0; k < 40; k++) if (save.grown[k]) out.push(LEVELS[k].plant); return out.slice(-14); }
function rebuildBackdrop() { const z = zone(); paintBackdrop(backdrop, W, H, DPR, pal(z), night(z), G.screen === 'menu' ? ['tulip', 'daisy', 'sunflower', 'rose', 'lavender', 'cherry', 'tulip2'] : grownList()); }
function rebuildTiles() {
  tiles.width = Math.round(W * DPR); tiles.height = Math.round(H * DPR); const c = tiles.getContext('2d'); c.setTransform(DPR, 0, 0, DPR, 0, 0);
  const st = G.st; if (!st) return;
  const plate = document.createElement('canvas'); plate.width = tiles.width; plate.height = tiles.height; const p = plate.getContext('2d'); p.setTransform(DPR, 0, 0, DPR, 0, 0);
  const nt = night();
  p.fillStyle = nt ? 'rgba(18,16,48,.78)' : 'rgba(255,250,236,.92)';
  for (let i = 0; i < st.w * st.h; i++) if (st.cell[i]) { const x = bx + (i % st.w) * cell, y = by + ((i / st.w) | 0) * cell; roundRect(p, x - 6, y - 6, cell + 12, cell + 12, 14); p.fill(); }
  c.save(); c.shadowColor = 'rgba(30,40,20,.35)'; c.shadowBlur = 22; c.shadowOffsetY = 8; c.drawImage(plate, 0, 0, W, H); c.restore();
  for (let i = 0; i < st.w * st.h; i++) {
    if (!st.cell[i]) continue; const x = bx + (i % st.w) * cell, y = by + ((i / st.w) | 0) * cell, odd = ((i % st.w) + ((i / st.w) | 0)) % 2;
    c.fillStyle = nt ? (odd ? '#3d3680' : '#342e70') : (odd ? '#2f5068' : '#29475e');
    roundRect(c, x + 1.5, y + 1.5, cell - 3, cell - 3, cell * 0.16); c.fill();
    c.fillStyle = 'rgba(255,255,255,.06)'; roundRect(c, x + 3, y + 3, cell - 6, cell * 0.3, cell * 0.12); c.fill();
  }
  // seed exits: little baskets under the exit cells
  if (st.seedsTotal) for (let x = 0; x < st.w; x++) { const e = L.exitCell(st, x); if (e < 0) continue; const ex = bx + x * cell + cell / 2, ey = by + ((e / st.w) | 0) * cell + cell + 8; c.fillStyle = '#b07a42'; c.beginPath(); c.moveTo(ex - cell * 0.22, ey - 4); c.lineTo(ex + cell * 0.22, ey - 4); c.lineTo(ex + cell * 0.15, ey + 6); c.lineTo(ex - cell * 0.15, ey + 6); c.fill(); c.fillStyle = '#7fd35f'; c.beginPath(); c.moveTo(ex, ey - 3); c.lineTo(ex - 4, ey - 8); c.lineTo(ex + 4, ey - 8); c.fill(); }
}
// cached blocker sprites
let vineSpr = [], brambleSpr = [];
function blockerSprites() {
  const S = Math.round(cell * DPR); vineSpr = []; brambleSpr = [];
  for (let l = 1; l <= 2; l++) for (let v = 0; v < 3; v++) { const c = document.createElement('canvas'); c.width = c.height = S; paintVine(c.getContext('2d'), l, S, 0, 0, v + l * 7); vineSpr.push(c); }
  for (let l = 1; l <= 2; l++) { const c = document.createElement('canvas'); c.width = c.height = S; paintBramble(c.getContext('2d'), l, S, 0, 0); brambleSpr.push(c); }
}

// ---------------------------------------------------------------- particles / fx (pooled)
const PMAX = 700; const parts = Array.from({ length: PMAX }, () => ({ on: false }));
let pHead = 0;
function emit(o) { const p = parts[pHead]; pHead = (pHead + 1) % PMAX; Object.assign(p, { on: true, x: 0, y: 0, vx: 0, vy: 0, g: 0, life: 0.6, t: 0, size: 4, col: '#fff', kind: 'spark', rot: 0, vr: 0, drag: 1.5 }, o); return p; }
function burst(x, y, col, n, kind = 'shard', speed = 220) {
  n = Math.round(n * juiceK()); for (let k = 0; k < n; k++) { const a = Math.random() * TAU, v = speed * (0.35 + Math.random()); emit({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, g: kind === 'petal' ? 40 : 520, life: 0.45 + Math.random() * 0.45, size: (kind === 'spark' ? 2 : 3.5) + Math.random() * cell * 0.08, col, kind, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 14 }); }
}
const fx = []; // beams, rings, arcs
const texts = []; let banner = null;
function floatText(x, y, text, col = '#fff', size = 22, life = 0.9) { texts.push({ x, y, text, col, size, t: 0, life }); }
function showBanner(text, col, size = 40, life = 1.1) { banner = { text, col, size, t: 0, life }; }
const cx = (i) => bx + ((i % G.st.w) + 0.5) * cell, cy = (i) => by + (((i / G.st.w) | 0) + 0.5) * cell;
function addShake(a) { if (settings.shake && !settings.reducedMotion) G.shake = Math.max(G.shake, a * juiceK()); }

// ---------------------------------------------------------------- sprites from logic state
function makeSprite(g, i, yOff = 0) { const s = { id: g.id, c: g.c, s: g.s, x: i % G.st.w, y: ((i / G.st.w) | 0) + yOff, sc: 1, a: 1, sq: 0, rot: 0, wob: Math.random() * TAU, glow: 0 }; G.sprites.set(g.id, s); return s; }
function syncSprites() { G.sprites.clear(); G.st.gem.forEach((g, i) => g && makeSprite(g, i)); }
function makeVis(st) { return { score: st.score, vine: Int8Array.from(st.vine), bramble: Int8Array.from(st.bramble), seeds: st.seedsCollected, collected: [...st.collected], moves: st.moves }; }

// ---------------------------------------------------------------- step playback
const wait = (s) => tween(s / G.speed, () => {});
const T = (d, fn, o) => tween(d / G.speed, fn, o);
const COMBO = ['', '', 'Sweet!', 'Lovely!', 'Blooming!', 'Gorgeous!', 'Magnificent!', 'Legendary!'];
async function play(steps, { bonus = false } = {}) {
  for (const step of steps) {
    if (step.type === 'swap') continue;
    if (step.type === 'clear') await animClear(step, bonus);
    else if (step.type === 'fall') await animFall(step);
    else if (step.type === 'seed') await animSeed(step);
    else if (step.type === 'shuffle') await animShuffle(step);
    else if (step.type === 'convert') await animConvert(step, bonus);
    hud();
  }
}
async function animClear(step, bonus) {
  const v = G.vis, pals = palette(), K = juiceK();
  // created specials pull their group together first
  if (step.created.length) {
    const merges = [];
    for (const cr of step.created) for (const i of cr.from) {
      const it = step.items.find((q) => q.i === i); const sp = it && G.sprites.get(it.id); if (!sp || i === cr.i) continue;
      const x0 = sp.x, y0 = sp.y, x1 = cr.i % G.st.w, y1 = (cr.i / G.st.w) | 0;
      merges.push(T(0.11, (k) => { sp.x = x0 + (x1 - x0) * k; sp.y = y0 + (y1 - y0) * k; sp.sc = 1 - k * 0.3; }, { ease: ease.inQuad }));
    }
    await Promise.all(merges);
  }
  // effects
  for (const f of step.fx) {
    if (f.type === 'lineH') { fx.push({ k: 'beamH', y: by + (f.y + 0.5) * cell, t: 0, life: 0.42, col: '#fff' }); audio.line(); addShake(5); }
    else if (f.type === 'lineV') { fx.push({ k: 'beamV', x: bx + ((f.i % G.st.w) + 0.5) * cell, t: 0, life: 0.42, col: '#fff' }); audio.line(); addShake(5); }
    else if (f.type === 'bomb') { fx.push({ k: 'ring', x: cx(f.i), y: cy(f.i), r: cell * (f.r + 0.6) * 1.6, t: 0, life: 0.45, col: '#fff3b0' }); audio.bomb(); addShake(9 + f.r * 4); G.hitstop = 0.05; burst(cx(f.i), cy(f.i), '#ffe9a0', 18, 'spark', 380); }
    else if (f.type === 'prism') { for (const j of f.targets) fx.push({ k: 'arc', x0: cx(f.i), y0: cy(f.i), x1: cx(j), y1: cy(j), t: 0, life: 0.5, col: pals[f.c] || '#fff' }); audio.prism(); addShake(7); G.hitstop = 0.06; }
    else if (f.type === 'nova') { fx.push({ k: 'ring', x: cx(f.i), y: cy(f.i), r: Math.max(bw, bh), t: 0, life: 0.7, col: '#ffffff' }); audio.nova(); addShake(16); G.hitstop = 0.1; if (settings.flash) fx.push({ k: 'flash', t: 0, life: 0.35 }); }
  }
  // pops (staggered by chain depth)
  let maxDelay = 0; let sx = 0, sy = 0, n = 0, popped = 0;
  const pops = step.items.map((it) => {
    const sp = G.sprites.get(it.id); const d = Math.min(0.5, it.depth * 0.035); maxDelay = Math.max(maxDelay, d);
    if (!sp) return null; sx += cx(it.i); sy += cy(it.i); n++;
    return T(0.2, (k, raw) => {
      if (raw < 0.3) sp.sc = 1 + raw * 0.9; else sp.sc = Math.max(0, 1.27 * (1 - (raw - 0.3) / 0.7)); sp.a = raw < 0.6 ? 1 : 1 - (raw - 0.6) / 0.4;
      if (!sp._p && raw > 0.25) {
        sp._p = 1; const col = sp.c >= 0 && sp.c < 6 ? pals[sp.c] : '#ffffff';
        burst(cx(it.i), cy(it.i), col, 7 + (step.cascade > 2 ? 3 : 0), 'shard'); burst(cx(it.i), cy(it.i), '#ffffff', 3, 'spark', 160);
        if (popped++ < 6) audio.pop(step.cascade, popped);
        if (v.vine[it.i] > 0) { const left = step.vines.find((q) => q.i === it.i); if (left) { v.vine[it.i] = left.left; burst(cx(it.i), cy(it.i), '#5cc24a', 8, 'leaf', 200); audio.vine(); flyIcon(cx(it.i), cy(it.i), 'vines'); } }
        if (sp.c >= 0 && sp.c < 6) { v.collected[sp.c]++; if (goalFor('collect', sp.c)) flyIcon(cx(it.i), cy(it.i), 'collect', sp.c); }
      }
    }, { delay: d / G.speed, ease: (x) => x }).then(() => G.sprites.delete(it.id));
  });
  for (const b of step.brambles) { setTimeout(() => { v.bramble[b.i] = b.left; burst(cx(b.i), cy(b.i), '#8a5a30', 10, 'shard', 260); burst(cx(b.i), cy(b.i), '#5c8a3a', 6, 'leaf'); audio.bramble(); addShake(3); if (b.left === 0) flyIcon(cx(b.i), cy(b.i), 'brambles'); }, 60 / G.speed); }
  // score text + combo banner
  v.score += step.score;
  if (n) floatText(sx / n, sy / n, '+' + step.score.toLocaleString(), step.cascade > 1 ? '#fff3a0' : '#ffffff', Math.min(34, 18 + step.cascade * 2.5));
  if (!bonus && step.cascade >= 2) { showBanner(COMBO[Math.min(7, step.cascade)], ['#fff', '#fff', '#ffe066', '#ff9fd0', '#9dffb0', '#9ad8ff', '#d7b4ff', '#ffd27a'][Math.min(7, step.cascade)], 30 + Math.min(7, step.cascade) * 4); addShake(2 + step.cascade); }
  await Promise.all(pops.filter(Boolean));
  for (const q of step.vines) v.vine[q.i] = q.left;
  if (step.convert?.length) for (const cvn of step.convert) { const sp = G.sprites.get(cvn.id); if (sp) sp.s = cvn.s; }
  for (const cr of step.created) {
    const sp = makeSprite(cr.gem, cr.i); sp.sc = 0.2; sp.glow = 1; audio.make();
    fx.push({ k: 'ring', x: cx(cr.i), y: cy(cr.i), r: cell * 1.1, t: 0, life: 0.35, col: cr.gem.s === L.PRISM ? '#ffffff' : palette()[cr.gem.c] });
    T(0.35, (k) => { sp.sc = 0.2 + 0.8 * k; sp.glow = 1 - k; }, { ease: ease.outBack });
  }
  if (step.created.length) await wait(0.12);
  hud();
}
async function animFall(step) {
  const all = []; let landed = 0;
  const fall = (sp, x1, y1, delay) => {
    const x0 = sp.x, y0 = sp.y, d = Math.max(0.3, Math.hypot(x1 - x0, y1 - y0)), dur = 0.1 + 0.075 * Math.pow(d, 0.7);
    all.push(T(dur, (k) => { sp.x = x0 + (x1 - x0) * k; sp.y = y0 + (y1 - y0) * k; }, { ease: ease.inQuad, delay: delay / G.speed }).then(() => {
      if (landed++ < 5) audio.land();
      if (!settings.reducedMotion) T(0.22, (k) => { sp.sq = 0.16 * (1 - k) * Math.cos(k * 9); });
    }));
  };
  for (const m of step.moves) { const sp = G.sprites.get(m.id); if (sp) fall(sp, m.to % G.st.w, (m.to / G.st.w) | 0, (m.to % G.st.w) * 0.012); }
  for (const s of step.spawns) { const sp = makeSprite({ id: s.id, c: s.c, s: s.s }, s.to); sp.y = s.fromY; fall(sp, s.to % G.st.w, (s.to / G.st.w) | 0, (s.to % G.st.w) * 0.012 + 0.02); }
  await Promise.all(all);
}
async function animSeed(step) {
  audio.seed(); G.vis.score += step.score;
  await Promise.all(step.items.map((it) => { const sp = G.sprites.get(it.id); if (!sp) return null; const y0 = sp.y; burst(cx(it.i), cy(it.i), '#ffe08a', 16, 'spark', 260); floatText(cx(it.i), cy(it.i) - cell * 0.6, 'Planted!', '#ffe08a', 22); flyIcon(cx(it.i), cy(it.i), 'seeds');
    return T(0.45, (k) => { sp.y = y0 + k * 0.9; sp.a = 1 - k; sp.sc = 1 - k * 0.4; }, { ease: ease.inQuad }).then(() => { G.sprites.delete(it.id); G.vis.seeds++; hud(); }); }).filter(Boolean));
}
async function animShuffle(step) {
  toast('No moves left — reshuffling the garden'); sfx.whoosh();
  await Promise.all(step.moves.map((m) => { const sp = G.sprites.get(m.id); if (!sp) return null; const x0 = sp.x, y0 = sp.y, x1 = m.to % G.st.w, y1 = (m.to / G.st.w) | 0, mx = (G.st.w - 1) / 2, my = (G.st.h - 1) / 2;
    return T(0.7, (k) => { const r = Math.sin(k * Math.PI) * 0.45; sp.x = x0 + (x1 - x0) * k + (mx - (x0 + x1) / 2) * r; sp.y = y0 + (y1 - y0) * k + (my - (y0 + y1) / 2) * r; sp.rot = Math.sin(k * Math.PI) * 1.2; }, { ease: ease.inOutCubic }).then(() => (sp.rot = 0)); }).filter(Boolean));
}
async function animConvert(step, bonus) {
  for (const it of step.items) { const sp = G.sprites.get(it.id); if (!sp) continue; sp.s = it.s; sp.glow = 1; T(0.3, (k) => (sp.glow = 1 - k)); fx.push({ k: 'ring', x: cx(it.i), y: cy(it.i), r: cell, t: 0, life: 0.3, col: '#fff' }); if (bonus) { G.vis.moves = Math.max(0, G.vis.moves - 1); audio.bonus(G.bonusK = (G.bonusK || 0) + 1); } }
  hud(); await wait(bonus ? 0.08 : 0.15);
}
function goalFor(type, c) { return G.st?.goals.find((g) => g.type === type && (c == null || g.c === c)); }
// little icon flying from the board to its HUD goal chip
const flyers = [];
function flyIcon(x, y, type, c) {
  if (!G.st) return; const k = G.st.goals.findIndex((g) => g.type === type && (c == null || g.c === c)); if (k < 0) return;
  const el = document.querySelector(`.goal[data-k="${k}"]`); if (!el) return; const r = el.getBoundingClientRect();
  if (flyers.length > 40) return; flyers.push({ x, y, x1: r.left + 18, y1: r.top + r.height / 2, t: 0, life: 0.55, type, c, k });
}

// ---------------------------------------------------------------- moves
async function trySwap(a, b) {
  if (G.busy || !G.st || G.screen !== 'play') return;
  const st = G.st; if (!L.adjacent(st, a, b) || !st.gem[a] || !st.gem[b] || L.solid(st, a) || L.solid(st, b)) return;
  G.busy = true; G.sel = -1; G.hint = null; G.idle = 0; G.hintShown = true; hideCoachHand();
  const sa = G.sprites.get(st.gem[a].id), sb = G.sprites.get(st.gem[b].id);
  const ax = a % st.w, ay = (a / st.w) | 0, bxx = b % st.w, byy = (b / st.w) | 0;
  audio.swap();
  const res = L.swap(st, a, b);
  await T(0.15, (k) => { sa.x = ax + (bxx - ax) * k; sa.y = ay + (byy - ay) * k; sb.x = bxx + (ax - bxx) * k; sb.y = byy + (ay - byy) * k; }, { ease: ease.inOutCubic });
  if (!res.ok) {
    audio.bad(); addShake(2);
    await T(0.16, (k) => { sa.x = bxx + (ax - bxx) * k; sa.y = byy + (ay - byy) * k; sb.x = ax + (bxx - ax) * k; sb.y = ay + (byy - ay) * k; }, { ease: ease.outBack });
    G.busy = false; return;
  }
  G.vis.moves = st.moves; hud();
  await play(res.steps);
  G.vis = Object.assign(G.vis, { score: st.score, seeds: st.seedsCollected, moves: st.moves, vine: Int8Array.from(st.vine), bramble: Int8Array.from(st.bramble), collected: [...st.collected] });
  hud(); G.busy = false; G.idle = 0;
  if (G.mode === 'zen') { zenAfterMove(); return; }
  if (L.levelWon(st)) await levelComplete();
  else if (L.levelLost(st)) levelFailed();
}

// ---------------------------------------------------------------- levels
const DIFF = { relaxed: { moves: 5, label: 'Relaxed' }, normal: { moves: 0, label: 'Normal' }, hard: { moves: -2, label: 'Challenging' } };
function levelDef(k) { const d = LEVELS[k - 1]; return { ...d, colors: clamp(Math.min(d.colors, cfg.gemColors | 0 || 6), 4, 6), moves: Math.max(5, d.moves + DIFF[G.diff].moves + (cfg.extraMoves | 0)) }; }
function clearFx() { fx.length = 0; texts.length = 0; flyers.length = 0; banner = null; for (const p of parts) p.on = false; }
function startLevel(k) {
  document.body.classList.remove('zen'); clearFx(); G.mode = 'garden'; G.level = k; G.def = levelDef(k); G.attempt++;
  G.st = L.createState(G.def, (Date.now() ^ (k * 7919) ^ (G.attempt * 104729)) >>> 0);
  G.vis = makeVis(G.st); G.bonusK = 0; syncSprites(); layout(); blockerSprites();
  G.screen = 'intro'; G.sel = -1; G.hint = null; G.idle = 0; G.hintShown = false;
  showHUD(true); hud(); showIntro();
  host('level', { level: k });
}
function goalLabel(g) {
  if (g.type === 'score') return `Score ${g.target.toLocaleString()}`;
  if (g.type === 'vines') return `Clear ${G.st.vinesTotal} vines`;
  if (g.type === 'brambles') return `Break ${G.st.bramblesTotal} brambles`;
  if (g.type === 'seeds') return `Plant ${g.n} seed${g.n > 1 ? 's' : ''}`;
  if (g.type === 'collect') return `Collect ${g.n} ${GEM_NAMES[g.c]}`;
  return '';
}
function showIntro() {
  const d = G.def, z = ZONES[zoneOf(G.level)];
  card(`<div class="eyebrow">${z.name} · Level ${G.level}</div><h2>${['Sprout', 'Bud', 'Bloom'][Math.min(2, Math.floor(((G.level - 1) % 10) / 4))]} ${G.level}</h2>
    <div class="goal-list">${G.st.goals.map((g, k) => `<div class="goal-big">${goalIcon(g, 46)}<span>${goalLabel(g)}</span></div>`).join('')}</div>
    <p class="sub">in <b>${d.moves}</b> moves${G.diff !== 'normal' ? ` · ${DIFF[G.diff].label}` : ''}</p>
    ${d.tip && tipText[d.tip] ? `<p class="tip">🌱 ${tipText[d.tip]}</p>` : ''}
    <div class="sd-row"><button class="sd-btn primary" id="goPlay">Let's grow!</button></div>`, () => { $('#goPlay').onclick = () => { sfx.select(); closeCard(); beginPlay(); }; });
}
function beginPlay() {
  G.screen = 'play'; G.idle = 0;
  const tip = G.def?.tip; if (tip === 'swap') { G.idle = 99; showCoach(tipText.swap); }
  else if (tip && !save.tips[tip]) { showCoach(tipText[tip]); }
  if (tip) { save.tips[tip] = 1; persist(); }
}
async function levelComplete() {
  G.busy = true; G.screen = 'bonus'; hideCoach();
  audio.grow(); showBanner('Level Complete!', '#fff3a0', 42, 1.4); burstBoard();
  await wait(1.0);
  if (G.st.moves > 0) { showBanner('Garden Bonus!', '#ffd0f0', 38, 1.2); await wait(0.6); }
  const steps = L.bonusRound(G.st); const sp = G.speed; G.speed = sp * 1.5; await play(steps, { bonus: true }); G.speed = sp;
  G.vis.score = G.st.score; hud(); await wait(0.4);
  const k = G.level, d = LEVELS[k - 1]; const sc = G.st.score;
  const stars = 1 + (sc >= d.stars[1] ? 1 : 0) + (sc >= d.stars[2] ? 1 : 0);
  const firstClear = !save.grown[k - 1]; const prevStars = save.stars[k - 1];
  save.stars[k - 1] = Math.max(save.stars[k - 1], stars); save.best[k - 1] = Math.max(save.best[k - 1], sc); save.unlocked = Math.max(save.unlocked, Math.min(40, k + 1)); save.plays++; save.fails[k - 1] = 0;
  persist(); host('score', { level: k, score: sc, stars });
  G.lastResult = { won: true, stars, score: sc, firstClear, prevStars };
  G.busy = false; G.screen = 'result'; resultCard();
}
function levelFailed() {
  G.screen = 'result'; hideCoach(); audio.bad(); sfx.lose(); save.fails[G.level - 1]++; persist();
  const left = L.goalProgress(G.st).filter((g) => !g.done).map((g) => g.type === 'score' ? `${(g.need - g.have).toLocaleString()} points` : g.type === 'collect' ? `${g.left} ${GEM_NAMES[g.c]}` : `${g.left} ${g.type === 'seeds' ? 'seed' + (g.left > 1 ? 's' : '') : g.type}`);
  const offer = save.fails[G.level - 1] >= 2 && G.diff !== 'relaxed';
  G.lastResult = { won: false };
  card(`<div class="eyebrow">Level ${G.level}</div><h2>Out of moves</h2><p class="sub">So close — just <b>${left.join(' and ')}</b> to go.</p>
    <p class="tip">${tipFor(G.st)}</p>
    <div class="sd-row"><button class="sd-btn primary" id="again">Try again</button>${offer ? '<button class="sd-btn" id="relax">Try with +5 moves</button>' : ''}<button class="sd-btn" id="toMap">Garden</button></div>`, () => {
    $('#again').onclick = () => { closeCard(); startLevel(G.level); };
    if (offer) $('#relax').onclick = () => { G.diff = 'relaxed'; save.diff = 'relaxed'; persist(); toast('Relaxed difficulty: +5 moves on every level'); closeCard(); startLevel(G.level); };
    $('#toMap').onclick = () => { closeCard(); openMap(); };
  });
}
function tipFor(st) {
  const g = L.goalProgress(st).find((q) => !q.done) || {};
  if (g.type === 'seeds') return 'Tip: matches directly under a seed drop it fastest — vertical Line Gems send it all the way down.';
  if (g.type === 'vines') return 'Tip: Line Gems and Bloom Bombs clear vines in corners that are hard to match.';
  if (g.type === 'brambles') return 'Tip: matches beside a bramble break it; double brambles need two hits.';
  if (g.type === 'collect') return 'Tip: a Prism swapped with a gem collects every gem of that colour at once.';
  return 'Tip: matches near the bottom cause more cascades — and cascades multiply your score.';
}
function resultCard() {
  const r = G.lastResult, k = G.level;
  card(`<div class="eyebrow">${ZONES[zoneOf(k)].name} · Level ${k}</div><h2>${['', 'Nicely grown!', 'Beautiful!', 'Perfect bloom!'][r.stars]}</h2>
    <div class="stars">${[1, 2, 3].map((s) => `<span class="star" data-s="${s}">★</span>`).join('')}</div>
    <p class="score"><b id="countUp">0</b><small>Best ${save.best[k - 1].toLocaleString()}</small></p>
    ${r.firstClear ? `<p class="tip">🌷 A new <b>${plantName(LEVELS[k - 1].plant)}</b> is ready to grow in your garden.</p>` : ''}
    <div class="sd-row"><button class="sd-btn primary" id="next">${r.firstClear ? 'Plant it' : k < 40 ? 'Continue' : 'Garden'}</button><button class="sd-btn" id="replay">Replay</button></div>`, () => {
    [1, 2, 3].forEach((s) => setTimeout(() => { if (s <= r.stars) { document.querySelector(`.star[data-s="${s}"]`)?.classList.add('on'); audio.star(s); } }, 350 + s * 380 / G.speed));
    T(1.0, (q) => { const e = $('#countUp'); if (e) e.textContent = Math.round(r.score * q).toLocaleString(); }, { ease: ease.outCubic });
    $('#next').onclick = () => { closeCard(); if (k === 40 && r.firstClear) finale(); else openMap(r.firstClear ? k : -1); };
    $('#replay').onclick = () => { closeCard(); startLevel(k); };
  });
}
const plantName = (p) => ({ tulip: 'tulip patch', tulip2: 'golden tulip', daisy: 'daisy cluster', daisy2: 'pink daisy', sunflower: 'sunflower', sunflower2: 'sunflower', bush: 'berry bush', lavender: 'lavender', rose: 'rose bush', birdbath: 'birdbath', oak: 'oak tree', apple: 'apple tree', strawberry: 'strawberry patch', pear: 'pear tree', pumpkin: 'pumpkin patch', cherry: 'cherry blossom', beehive: 'beehive', scarecrow: 'scarecrow', plum: 'plum tree', windmill: 'windmill', lily: 'water lily', reeds: 'reed bed', frog: 'frog friend', lily2: 'white lily', bridge: 'little bridge', heron: 'heron', fountain: 'fountain', lotus: 'lotus', dragonfly: 'dragonfly', pavilion: 'pavilion', moonflower: 'moonflower', lantern: 'lantern', willow: 'willow', owl: 'owl', crystal: 'moon crystal', stargazer: 'telescope', arch: 'rose arch', peacock: 'peacock', heart: 'heart topiary', moontree: 'Moon Tree' }[p] || p);
function burstBoard() { for (let k = 0; k < 14; k++) setTimeout(() => burst(bx + Math.random() * bw, by + Math.random() * bh, ['#ffd0e8', '#fff3a0', '#c8ffb0', '#b8e0ff'][k % 4], 10, 'petal', 160), k * 50); }

// ---------------------------------------------------------------- garden map
// FABLE: staged sprout→bud→bloom growth animation (currently an eased scale pop + petal burst).
function openMap(grow = -1) {
  G.screen = 'map'; G.mode = 'garden'; showHUD(false); menu.hide(); hideCoach(); rebuildBackdrop();
  $('#mapbar').classList.add('show'); updateMapBar();
  const target = grow > 0 ? grow : save.unlocked; const n = G.mapLayout.nodes[target - 1];
  G.mapY = clamp(n.y - H * 0.55, 0, G.mapLayout.H - H); G.mapV = 0;
  if (grow > 0) { save.grown[grow - 1] = true; persist(); G.growing = grow; G.growT = 0; setTimeout(() => { audio.grow(); }, 250); const p = G.mapLayout.nodes[grow - 1]; setTimeout(() => { burst(p.px, p.py - G.mapY - 20, '#ffd0e8', 22, 'petal', 200); burst(p.px, p.py - G.mapY - 20, '#ffffff', 10, 'spark', 220); }, 450); }
}
function updateMapBar() { const tot = save.stars.reduce((a, b) => a + b, 0); $('#mapStars').textContent = `★ ${tot} / 120`; $('#mapTitle').textContent = ZONES[zoneOf(Math.min(save.unlocked, 40))].name; }
function mapHit(x, y) { for (const n of G.mapLayout.nodes) if (Math.hypot(x - n.x, y + G.mapY - n.y) < 34) return n.k; return 0; }
function drawMap(dt) {
  const ml = G.mapLayout, Y = G.mapY;
  // zone bands
  for (let z = 0; z < 4; z++) {
    const p = pal(z), nt = night(z); const yTop = ml.H - 190 - (z * 10 + 9.5) * STEP - Y, yBot = z === 0 ? ml.H - Y + 10 : ml.H - 190 - (z * 10 - 0.5) * STEP - Y + 2;
    const top = z === 3 ? -Y - 10 : yTop; if (yBot < -10 || top > H + 10) continue;
    const g = ctx.createLinearGradient(0, top, 0, yBot); g.addColorStop(0, shade(p.ground, nt ? -0.45 : 0.1)); g.addColorStop(1, shade(p.ground, nt ? -0.25 : -0.05));
    ctx.fillStyle = g; ctx.fillRect(0, top, W, yBot - top);
    if (z === 2) { ctx.fillStyle = 'rgba(90,200,240,.45)'; ctx.beginPath(); ctx.ellipse(W * 0.5, (top + yBot) / 2, W * 0.55, (yBot - top) * 0.28, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2; for (let r = 0; r < 3; r++) { const ph = (G.t * 0.3 + r / 3) % 1; ctx.globalAlpha = 1 - ph; ctx.beginPath(); ctx.ellipse(W * 0.3 + r * W * 0.2, (top + yBot) / 2 + r * 30, 20 + ph * 50, 6 + ph * 14, 0, 0, TAU); ctx.stroke(); } ctx.globalAlpha = 1; }
    if (nt) for (let k = 0; k < 30; k++) { const fx_ = (Math.sin(k * 91.7) * 0.5 + 0.5) * W + Math.sin(G.t * 0.6 + k) * 20, fy = top + ((Math.sin(k * 33.1) * 0.5 + 0.5)) * (yBot - top) + Math.cos(G.t * 0.5 + k) * 16; ctx.fillStyle = `rgba(255,250,190,${0.4 + 0.4 * Math.sin(G.t * 3 + k)})`; ctx.beginPath(); ctx.arc(fx_, fy, 2, 0, TAU); ctx.fill(); }
  }
  const sky = ctx.createLinearGradient(0, -Y - 400, 0, -Y + 200); sky.addColorStop(0, '#120f30'); sky.addColorStop(1, 'rgba(18,15,48,0)'); ctx.fillStyle = sky; ctx.fillRect(0, -Y - 400, W, 600);
  for (const it of G.decor) { const y = it.y - Y; if (y < -20 || y > H + 20) continue; const z = clamp(3 - Math.floor((it.y - 0) / (10 * STEP) - 0.3), 0, 3); drawMapDecor(ctx, { ...it, y }, night(z), G.t); }
  for (const it of G.side) { const y = it.y - Y; if (y < -40 || y > H + 160) continue; drawPlant(ctx, it.kind[it.z], it.x, y, it.s, 1, G.t * 0.5 + it.x, night(it.z)); }
  // path
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(80,60,40,.25)'; ctx.lineWidth = 30; pathLine(ml.nodes, Y, 4); ctx.stroke();
  ctx.strokeStyle = '#efe2c2'; ctx.lineWidth = 22; pathLine(ml.nodes, Y, 0); ctx.stroke();
  ctx.strokeStyle = 'rgba(190,160,110,.6)'; ctx.lineWidth = 3; ctx.setLineDash([10, 16]); pathLine(ml.nodes, Y, 0); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
  // plants + nodes
  for (const n of ml.nodes) {
    const y = n.y - Y; if (y < -140 || y > H + 80) continue; const k = n.k, z = zoneOf(k);
    let g = save.grown[k - 1] ? 1 : 0; if (G.growing === k) { G.growT += dt * G.speed / 1.6; g = Math.min(1, G.growT); if (G.growT >= 1.2) G.growing = -1; if (g < 0.02) g = 0.02; }
    drawPlant(ctx, LEVELS[k - 1].plant, n.px, n.py - Y, W > 700 ? 1.45 : 1.15, g, G.t + k, night(z));
  }
  for (const n of ml.nodes) {
    const y = n.y - Y; if (y < -50 || y > H + 50) continue; const k = n.k, done = save.stars[k - 1] > 0, cur = k === save.unlocked && !done, locked = k > save.unlocked;
    const pulse = cur ? 1 + Math.sin(G.t * 4) * 0.06 : 1, r = 25 * pulse;
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(n.x, y + 20, 22, 7, 0, 0, TAU); ctx.fill();
    const grd = ctx.createRadialGradient(n.x - 8, y - 10, 2, n.x, y, r); const acc = cfg.colors?.accent || '#ff6fa8';
    if (locked) { grd.addColorStop(0, '#e8e4dc'); grd.addColorStop(1, '#a8a296'); } else if (done) { grd.addColorStop(0, '#fff6c8'); grd.addColorStop(1, '#f0a830'); } else { grd.addColorStop(0, shade(acc, 0.5)); grd.addColorStop(1, acc); }
    ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(n.x, y, r, 0, TAU); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.stroke();
    ctx.fillStyle = locked ? '#7a7468' : '#5a3410'; ctx.font = `800 ${k >= 10 ? 18 : 20}px Inter,system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(locked ? '🔒' : String(k), n.x, y + 1);
    if (done) for (let s = 0; s < 3; s++) { ctx.fillStyle = s < save.stars[k - 1] ? '#ffd23a' : 'rgba(255,255,255,.45)'; starPath(n.x + (s - 1) * 16, y + 33 + (s === 1 ? 3 : 0), 7); ctx.fill(); ctx.strokeStyle = 'rgba(120,70,0,.5)'; ctx.lineWidth = 1; ctx.stroke(); }
    if (cur) { ctx.fillStyle = '#ffffff'; roundRect(ctx, n.x - 30, y - 62, 60, 26, 13); ctx.fill(); ctx.fillStyle = '#3a6a2a'; ctx.font = '800 14px Inter,system-ui,sans-serif'; ctx.fillText('Play', n.x, y - 49); ctx.beginPath(); ctx.moveTo(n.x - 6, y - 37); ctx.lineTo(n.x + 6, y - 37); ctx.lineTo(n.x, y - 30); ctx.fillStyle = '#fff'; ctx.fill(); }
  }
  // zone signs
  for (let z = 0; z < 4; z++) { const n = ml.nodes[z * 10]; const y = n.y - Y + 70; if (y < -40 || y > H + 40) continue; ctx.fillStyle = 'rgba(90,60,30,.85)'; roundRect(ctx, W / 2 - 70, y, 140, 28, 8); ctx.fill(); ctx.fillStyle = '#fff3d6'; ctx.font = '700 14px Inter,system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.fillText(ZONES[z].name, W / 2, y + 15); }
  // moon gate at the top
  const top = ml.nodes[39], gy = top.y - Y - 120; if (gy > -200) { ctx.strokeStyle = save.finale ? '#fff2b0' : 'rgba(255,255,255,.4)'; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(W / 2, gy, 60, Math.PI, 0); ctx.stroke(); if (save.finale) { ctx.fillStyle = 'rgba(255,240,180,.25)'; ctx.beginPath(); ctx.arc(W / 2, gy, 56, Math.PI, 0); ctx.fill(); } }
}
function sideTrees() {
  const out = [], MW = 640; if (W < 760) return out; const side = (W - MW) / 2; const H_ = G.mapLayout.H;
  const kinds = [['oak', 'bush', 'daisy', 'tulip'], ['apple', 'pear', 'pumpkin', 'cherry'], ['willow', 'reeds', 'lily', 'lotus'], ['moontree', 'lantern', 'moonflower', 'crystal']];
  for (let y = 120, k = 0; y < H_; y += 70, k++) for (const sgn of [-1, 1]) { const h = Math.sin(k * 91.3 + sgn * 7) * 0.5 + 0.5; const z = clamp(3 - Math.floor((y - 60) / (10 * STEP)), 0, 3); const kind = kinds[z][(k + (sgn > 0 ? 1 : 0)) % 4];
    out.push({ x: sgn < 0 ? 30 + h * (side - 60) : W - 30 - h * (side - 60), y: y + h * 40, s: 1.1 + h * 0.8, z, kind: { [z]: kind } }); }
  return out.sort((a, b) => a.y - b.y);
}
function starPath(x, y, r) { ctx.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.closePath(); }
function pathLine(nodes, Y, dy) { ctx.beginPath(); ctx.moveTo(nodes[0].x, nodes[0].y - Y + 60 + dy); nodes.forEach((n, k) => { const p = nodes[k - 1] || { x: n.x, y: n.y + 60 }; const mx = (p.x + n.x) / 2, my = (p.y + n.y) / 2; ctx.quadraticCurveTo(p.x, p.y - Y + dy, mx, my - Y + dy); }); ctx.lineTo(nodes[39].x, nodes[39].y - Y + dy); }

// ---------------------------------------------------------------- zen
function startZen(fresh = false) {
  clearFx(); G.mode = 'zen'; G.level = 0; const colors = clamp(cfg.gemColors | 0 || 6, 4, 6);
  const def = { colors, moves: Infinity, goals: [{ type: 'score', target: Infinity }] };
  G.st = L.createState(def, (Date.now() & 0xffffff) + 5);
  if (!fresh && save.zen?.gems?.length === 64) { save.zen.gems.forEach((q, i) => { if (q) G.st.gem[i] = { id: G.st.nextId++, c: q[0], s: q[1] }; }); G.st.score = save.zen.score || 0; if (L.findMatches(G.st).length || !L.findMoves(G.st).length) L.reshuffle(G.st); }
  G.zenFlowers = Array.from({ length: Math.floor(G.st.score / 2500) }, (_, k) => ({ k, g: 1 }));
  G.vis = makeVis(G.st); syncSprites(); layout(); blockerSprites();
  G.screen = 'play'; G.idle = 0; G.hint = null; showHUD(true); hud(); $('#zenEnd').classList.add('show'); document.body.classList.add('zen');
  if (!save.tips.zen) { showCoach('Zen garden: no moves to count, no goals. Every 2,500 points grows a flower.'); save.tips.zen = 1; persist(); }
}
function zenAfterMove() {
  const st = G.st; save.zenBest = Math.max(save.zenBest, st.score);
  save.zen = { score: st.score, gems: st.gem.map((g) => (g ? [g.c, g.s] : null)) }; persist();
  const want = Math.floor(st.score / 2500); while (G.zenFlowers.length < want) { const f = { k: G.zenFlowers.length, g: 0 }; G.zenFlowers.push(f); audio.grow(); T(1.2, (q) => (f.g = q)); floatText(W / 2, by + bh + 20, 'A flower bloomed', '#ffffff', 18, 1.4); }
}
function endZen() {
  const st = G.st; save.zenBest = Math.max(save.zenBest, st.score); save.zen = null; persist(); $('#zenEnd').classList.remove('show'); G.screen = 'result';
  card(`<div class="eyebrow">Zen garden</div><h2>A peaceful session</h2><p class="score"><b>${st.score.toLocaleString()}</b><small>Best ${save.zenBest.toLocaleString()}</small></p>
    <p class="sub">${G.zenFlowers.length} flowers bloomed · biggest cascade ×${st.bestCascade} · ${st.specialsMade} special gems</p>
    <div class="sd-row"><button class="sd-btn primary" id="zAgain">New Zen garden</button><button class="sd-btn" id="zMenu">Menu</button></div>`, () => {
    $('#zAgain').onclick = () => { closeCard(); startZen(true); }; $('#zMenu').onclick = () => { closeCard(); toMenu(); };
  });
}

// ---------------------------------------------------------------- finale
// FABLE: choreographed Moon Gate opening + firefly swarm; today the camera sweeps the whole garden with sparkles.
function finale() {
  save.grown[39] = true; save.finale = true; persist(); G.screen = 'finale'; showHUD(false); G.finaleT = 0; G.mapY = G.mapLayout.H - H; audio.grow(); sfx.win();
}
function finaleCard() {
  const tot = save.stars.reduce((a, b) => a + b, 0);
  card(`<div class="eyebrow">The Moon Gate opens</div><h2>Your garden is in full bloom</h2><p class="sub">Forty wonders grown from forty gardens of gems. ★ ${tot} / 120 stars.</p>
    <p class="tip">Replay any level for more stars, or unwind in the Zen garden — it has no limits at all.</p>
    <div class="sd-row"><button class="sd-btn primary" id="fZen">Zen garden</button><button class="sd-btn" id="fMap">Walk the garden</button></div>`, () => {
    $('#fZen').onclick = () => { closeCard(); startZen(true); }; $('#fMap').onclick = () => { closeCard(); openMap(); };
  });
}

// ---------------------------------------------------------------- UI (DOM)
document.body.insertAdjacentHTML('beforeend', `
<div id="hud"><button class="sd-btn sd-icon" id="pauseBtn" aria-label="Pause">❚❚</button>
  <div class="hud-card"><div class="hud-lv"><small id="hLvLabel">Level</small><b id="hLevel">1</b></div><div class="hud-goals" id="hGoals"></div><div class="hud-moves"><small>Moves</small><b id="hMoves">0</b></div></div>
  <div class="hud-score"><div class="bar"><i id="hBar"></i><em class="m1"></em><em class="m2"></em><em class="m3"></em></div><b id="hScore">0</b></div></div>
<div id="coach"><span id="coachText"></span><button class="sd-btn" id="coachOk">Got it</button></div>
<div id="mapbar"><button class="sd-btn" id="mapMenu">‹ Menu</button><div class="mt"><b id="mapTitle">Meadow</b><span id="mapStars">★ 0</span></div></div>
<button class="sd-btn" id="zenEnd">Finish session</button>
<div id="card" class="sd-panel"><div class="sd-card gg-card" id="cardBody"></div></div>`);
const menu = startMenu({ title: 'Gem Garden', subtitle: 'Match gems, grow a garden. Forty little gardens bloom into a moonlit wonder.',
  options: [{ key: 'mode', label: 'Mode', value: cfg.mode === 'zen' ? 'zen' : 'garden', choices: [{ v: 'garden', label: '🌷 Garden' }, { v: 'zen', label: '🍃 Zen' }] },
    { key: 'difficulty', label: 'Difficulty', value: G.diff, choices: [{ v: 'relaxed', label: 'Relaxed' }, { v: 'normal', label: 'Normal' }, { v: 'hard', label: 'Challenging' }] }],
  startLabel: 'Play', onStart: (v) => { G.diff = v.difficulty; save.diff = v.difficulty; persist(); if (v.mode === 'zen') startZen(false); else if (save.unlocked === 1 && !save.stars[0]) startLevel(1); else openMap(); } });
settingsButton();
$('#pauseBtn').onclick = () => pause();
$('#coachOk').onclick = () => hideCoach();
$('#mapMenu').onclick = () => { sfx.click(); toMenu(); };
$('#zenEnd').onclick = () => { sfx.click(); if (!G.busy) endZen(); };
function toMenu() { document.body.classList.remove('zen'); G.screen = 'menu'; showHUD(false); $('#mapbar').classList.remove('show'); $('#zenEnd').classList.remove('show'); hideCoach(); rebuildBackdrop(); menu.show(); }
function showHUD(on) { $('#hud').classList.toggle('show', on); if (!on) $('#zenEnd').classList.remove('show'); $('#mapbar').classList.remove('show'); }
let cardOpen = false;
function card(html, wire) { $('#cardBody').innerHTML = html; $('#card').classList.add('open'); cardOpen = true; wire?.(); }
function closeCard() { $('#card').classList.remove('open'); cardOpen = false; }
let coachTimer = 0;
function showCoach(t, ms = 8000) { $('#coachText').textContent = t; $('#coach').classList.add('show'); clearTimeout(coachTimer); coachTimer = setTimeout(hideCoach, ms); }
function hideCoach() { $('#coach').classList.remove('show'); }
function hideCoachHand() { if (G.def?.tip === 'swap') hideCoach(); }
function pause() {
  if (!['play', 'intro'].includes(G.screen) || cardOpen) return; sfx.click(); const prev = G.screen; G.screen = 'paused';
  card(`<h2>Paused</h2><div class="sd-row col"><button class="sd-btn primary" id="pRes">Resume</button><button class="sd-btn" id="pSet">Settings</button>
    ${G.mode === 'zen' ? '<button class="sd-btn" id="pZen">Finish Zen session</button>' : '<button class="sd-btn" id="pRestart">Restart level</button><button class="sd-btn" id="pMap">Garden map</button>'}<button class="sd-btn" id="pMenu">Main menu</button></div>`, () => {
    $('#pRes').onclick = () => { closeCard(); G.screen = prev; if (prev === 'intro') showIntro(); };
    $('#pSet').onclick = () => { $('#sd-gear').click(); };
    if ($('#pRestart')) $('#pRestart').onclick = () => { closeCard(); startLevel(G.level); };
    if ($('#pMap')) $('#pMap').onclick = () => { closeCard(); openMap(); };
    if ($('#pZen')) $('#pZen').onclick = () => { closeCard(); endZen(); };
    $('#pMenu').onclick = () => { closeCard(); toMenu(); };
  });
}
// goal icons (rendered once per type to data URLs)
const iconCache = new Map();
function goalIcon(g, px = 30) {
  const key = g.type + (g.c ?? '') + px + (settings.colorblind ? 'cb' : '') + cfg.gemStyle; if (iconCache.has(key)) return iconCache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = px * 2; const x = c.getContext('2d');
  if (g.type === 'collect') paintGem(x, g.c, palette()[g.c], px * 0.8, px, px * 0.95, cfg.gemStyle);
  else if (g.type === 'seeds') paintSeed(x, px * 0.8, px, px);
  else if (g.type === 'vines') paintVine(x, 2, px * 1.8, px * 0.1, px * 0.1, 3);
  else if (g.type === 'brambles') paintBramble(x, 1, px * 1.9, px * 0.05, px * 0.05);
  else { x.fillStyle = '#ffd23a'; x.translate(px, px); x.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 5, r = k % 2 ? px * 0.4 : px * 0.85; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); } x.fill(); x.strokeStyle = '#b07010'; x.lineWidth = 3; x.stroke(); }
  const html = `<img src="${c.toDataURL()}" width="${px}" height="${px}" alt="">`; iconCache.set(key, html); return html;
}
function hud() {
  if (!G.st) return; const v = G.vis, st = G.st, zen = G.mode === 'zen';
  $('#hLvLabel').textContent = zen ? 'Zen' : 'Level'; $('#hLevel').textContent = zen ? '∞' : G.level;
  $('#hMoves').textContent = zen ? '∞' : v.moves; $('#hMoves').parentElement.classList.toggle('low', !zen && v.moves <= 3);
  $('#hScore').textContent = v.score.toLocaleString();
  let html = '';
  if (zen) html = `<div class="goal" data-k="0">${goalIcon({ type: 'score' })}<b>${G.zenFlowers.length}</b><small>🌸</small></div>`;
  else st.goals.forEach((g, k) => {
    let left;
    if (g.type === 'score') left = Math.max(0, g.target - v.score).toLocaleString();
    else if (g.type === 'vines') left = v.vine.reduce((a, b) => a + b, 0);
    else if (g.type === 'brambles') left = v.bramble.reduce((a, b) => a + b, 0);
    else if (g.type === 'seeds') left = Math.max(0, g.n - v.seeds);
    else left = Math.max(0, g.n - v.collected[g.c]);
    const done = left === 0 || left === '0';
    html += `<div class="goal${done ? ' done' : ''}" data-k="${k}">${goalIcon(g)}<b>${done ? '✓' : left}</b></div>`;
  });
  const hg = $('#hGoals'); if (hg._h !== html) { hg.innerHTML = html; hg._h = html; }
  const d = zen ? { stars: [0, 10000, 25000] } : LEVELS[G.level - 1]; const max = d.stars[2] * 1.08;
  $('#hBar').style.width = `${Math.min(100, (v.score / max) * 100)}%`;
  ['m1', 'm2', 'm3'].forEach((m, k) => { const e = document.querySelector('.hud-score .' + m); const thr = k === 0 ? (d.stars[0] || d.stars[1] * 0.5) : d.stars[k]; e.style.left = `${(thr / max) * 100}%`; e.classList.toggle('on', v.score >= thr); e.style.display = (zen || !d.stars[0]) && k === 0 ? 'none' : ''; });
}

// ---------------------------------------------------------------- input
const cellAt = (x, y) => { if (!G.st) return -1; const gx = Math.floor((x - bx) / cell), gy = Math.floor((y - by) / cell); if (gx < 0 || gy < 0 || gx >= G.st.w || gy >= G.st.h) return -1; const i = gy * G.st.w + gx; return G.st.cell[i] ? i : -1; };
cv.addEventListener('pointerdown', (e) => {
  const x = e.clientX, y = e.clientY;
  if (G.screen === 'map') { G.mapDrag = { y, y0: G.mapY, t: performance.now(), moved: 0, last: y }; return; }
  if (G.screen === 'finale' && G.finaleT > 1) { G.finaleT = 99; return; }
  if (G.screen !== 'play' || G.busy) return;
  const i = cellAt(x, y); if (i < 0 || !G.st.gem[i]) { G.sel = -1; return; }
  G.idle = 0; G.hint = null;
  if (G.sel >= 0 && G.sel !== i && L.adjacent(G.st, G.sel, i)) { trySwap(G.sel, i); return; }
  if (G.sel === i) { G.sel = -1; return; }
  G.sel = i; audio.select(); G.drag = { i, x, y }; cv.setPointerCapture?.(e.pointerId);
});
cv.addEventListener('pointermove', (e) => {
  if (G.mapDrag) { const dy = e.clientY - G.mapDrag.last; G.mapDrag.last = e.clientY; G.mapDrag.moved += Math.abs(dy); G.mapY = clamp(G.mapY - dy, 0, G.mapLayout.H - H); G.mapV = -dy * 60; return; }
  if (!G.drag || G.busy) return; const dx = e.clientX - G.drag.x, dy = e.clientY - G.drag.y;
  if (Math.hypot(dx, dy) > cell * 0.32) {
    const i = G.drag.i, st = G.st, x = i % st.w, y = (i / st.w) | 0; let j = -1;
    if (Math.abs(dx) > Math.abs(dy)) { if (dx > 0 && x < st.w - 1) j = i + 1; else if (dx < 0 && x > 0) j = i - 1; } else { if (dy > 0 && y < st.h - 1) j = i + st.w; else if (dy < 0 && y > 0) j = i - st.w; }
    G.drag = null; if (j >= 0 && st.cell[j] && st.gem[j]) trySwap(i, j);
  }
});
addEventListener('pointerup', (e) => {
  if (G.mapDrag) { const d = G.mapDrag; G.mapDrag = null; if (d.moved < 8) { const k = mapHit(e.clientX, e.clientY); if (k && k <= save.unlocked) { sfx.select(); $('#mapbar').classList.remove('show'); startLevel(k); } else if (k) { audio.bad(); toast('Grow the earlier plants first'); } } }
  G.drag = null;
});
addEventListener('wheel', (e) => { if (G.screen === 'map') G.mapY = clamp(G.mapY + e.deltaY, 0, G.mapLayout.H - H); }, { passive: true });
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { if (cardOpen && G.screen === 'paused') { $('#pRes')?.click(); } else pause(); return; }
  if (G.screen === 'map' && (e.key === 'Enter' || e.key === ' ')) { $('#mapbar').classList.remove('show'); startLevel(save.unlocked); return; }
  if (G.screen !== 'play' || G.busy || !G.st) return;
  const st = G.st, dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }, d = dirs[e.key];
  if (d) { e.preventDefault(); const x = G.cursor % st.w, y = (G.cursor / st.w) | 0, nx = clamp(x + d[0], 0, st.w - 1), ny = clamp(y + d[1], 0, st.h - 1), j = ny * st.w + nx;
    if (G.sel >= 0) { const s = G.sel; G.sel = -1; if (j !== s && st.cell[j]) trySwap(s, j); } else G.cursor = j; G.kbd = true; }
  else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); G.kbd = true; G.sel = G.sel === G.cursor ? -1 : G.cursor; audio.select(); }
  else if (e.key === 'h' || e.key === 'H') { G.idle = 99; }
});
addEventListener('resize', () => layout());
addEventListener('sd-settings', () => { iconCache.clear(); layout(); blockerSprites(); hud(); });

// ---------------------------------------------------------------- render
// FABLE: idle glint sweeps across random gems; richer special-gem creation flourish.
function drawGem(sp, t) {
  const S = cell, x = bx + (sp.x + 0.5) * S, y = by + (sp.y + 0.5) * S, k = sp.sc, sq = sp.sq, img = sp.c === L.SEED ? SPR.seed : sp.s === L.PRISM ? null : SPR.gems[sp.c];
  if (sp.a <= 0 || k <= 0.01) return;
  ctx.save(); ctx.globalAlpha = sp.a; ctx.translate(x, y);
  if (sp.rot) ctx.rotate(sp.rot);
  ctx.scale(k * (1 + sq), k * (1 - sq));
  const D = S * 1.0;
  if (sp.s === L.BOMB) { ctx.save(); ctx.rotate(t * 1.4); const col = palette()[sp.c]; ctx.fillStyle = shade(col, 0.55, 0.9); for (let q = 0; q < 6; q++) { ctx.rotate(TAU / 6); ctx.beginPath(); ctx.ellipse(S * 0.36, 0, S * 0.17, S * 0.1, 0, 0, TAU); ctx.fill(); } ctx.restore(); const pul = 0.5 + 0.5 * Math.sin(t * 6); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = sp.a * (0.35 + pul * 0.25); ctx.drawImage(tintedGlow(SPR.glow, col), -S * 0.75, -S * 0.75, S * 1.5, S * 1.5); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = sp.a; }
  if (img) ctx.drawImage(img, -D / 2, -D / 2, D, D);
  else { // prism orb
    ctx.save(); ctx.rotate(t * 1.5); const g = ctx.createConicGradient ? ctx.createConicGradient(0, 0, 0) : null; const R = S * 0.38;
    if (g) { ['#ff5a7a', '#ffb03a', '#ffe94a', '#5ae07a', '#4ab0ff', '#b46aff', '#ff5a7a'].forEach((c, q) => g.addColorStop(q / 6, c)); ctx.fillStyle = g; } else ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill(); ctx.restore();
    const hl = ctx.createRadialGradient(-S * 0.12, -S * 0.14, 1, 0, 0, S * 0.4); hl.addColorStop(0, 'rgba(255,255,255,.95)'); hl.addColorStop(0.35, 'rgba(255,255,255,.25)'); hl.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = hl; ctx.beginPath(); ctx.arc(0, 0, S * 0.38, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#fff'; for (let q = 0; q < 3; q++) { const a = t * 2.2 + (q * TAU) / 3; starShape(ctx, Math.cos(a) * S * 0.46, Math.sin(a) * S * 0.46, S * 0.08); }
  }
  if (sp.s === L.LINE_H || sp.s === L.LINE_V) {
    ctx.save(); if (sp.s === L.LINE_V) ctx.rotate(Math.PI / 2);
    ctx.globalCompositeOperation = 'lighter'; const sh = (t * 1.6) % 1;
    ctx.fillStyle = 'rgba(255,255,255,.55)'; for (const o of [-0.14, 0, 0.14]) { roundRect(ctx, -S * 0.36, S * o - S * 0.028, S * 0.72, S * 0.056, S * 0.028); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,.9)'; for (const sgn of [-1, 1]) { const ax = sgn * S * (0.4 + sh * 0.08); ctx.beginPath(); ctx.moveTo(ax + sgn * S * 0.1, 0); ctx.lineTo(ax, -S * 0.09); ctx.lineTo(ax, S * 0.09); ctx.fill(); }
    ctx.restore();
  }
  if (sp.tw > 0) { const q = sp.tw; ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.sin(q * Math.PI) * 0.95; ctx.fillStyle = '#fff'; ctx.rotate(q * 1.5); starShape(ctx, 0, 0, S * 0.26 * Math.sin(q * Math.PI)); ctx.rotate(-q * 1.5); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = sp.a; }
  if (sp.glow > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = sp.glow * 0.9; ctx.drawImage(SPR.glow, -S * 0.8, -S * 0.8, S * 1.6, S * 1.6); }
  ctx.restore();
}
function drawBoard(dt) {
  const st = G.st, v = G.vis, t = G.t;
  ctx.drawImage(tiles, 0, 0, W, H);
  // blockers under/over gems
  for (let i = 0; i < st.w * st.h; i++) {
    if (!st.cell[i]) continue; const x = bx + (i % st.w) * cell, y = by + ((i / st.w) | 0) * cell;
    if (v.vine[i] > 0) ctx.drawImage(vineSpr[(v.vine[i] - 1) * 3 + (i % 3)], x, y, cell, cell);
  }
  // selection + cursor
  if (G.sel >= 0) { const x = bx + (G.sel % st.w) * cell, y = by + ((G.sel / st.w) | 0) * cell; ctx.fillStyle = 'rgba(255,255,255,.45)'; roundRect(ctx, x + 2, y + 2, cell - 4, cell - 4, cell * 0.18); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke(); }
  if (G.kbd) { const x = bx + (G.cursor % st.w) * cell, y = by + ((G.cursor / st.w) | 0) * cell; ctx.strokeStyle = cfg.colors?.accent || '#ff6fa8'; ctx.lineWidth = 3; ctx.setLineDash([6, 4]); roundRect(ctx, x + 3, y + 3, cell - 6, cell - 6, cell * 0.18); ctx.stroke(); ctx.setLineDash([]); }
  // hint
  let hintIds = null;
  if (G.screen === 'play' && !G.busy && G.idle > (G.def?.tip === 'swap' && !G.hintShown ? 0.6 : cfg.hintDelay * (G.diff === 'relaxed' ? 0.7 : 1))) {
    if (!G.hint) G.hint = L.hintMove(st);
    if (G.hint) hintIds = G.hint.map((i) => st.gem[i]?.id);
  }
  if (hintIds && G.hint) { const pul = 0.3 + 0.25 * Math.sin(t * 6); ctx.fillStyle = `rgba(255,246,170,${pul})`; for (const i of G.hint) { roundRect(ctx, cx(i) - cell * 0.48, cy(i) - cell * 0.48, cell * 0.96, cell * 0.96, cell * 0.2); ctx.fill(); } }
  ctx.save(); ctx.beginPath(); ctx.rect(bx - 4, by - 2, bw + 8, bh + cell); ctx.clip();
  for (const sp of G.sprites.values()) {
    let wob = 0; if (hintIds && hintIds.includes(sp.id)) { wob = Math.sin(t * 9) * 0.08; sp.sq = wob; }
    if (sp.y < -0.6) continue; drawGem(sp, t + sp.wob);
    if (wob) sp.sq = 0;
  }
  ctx.restore();
  for (let i = 0; i < st.w * st.h; i++) if (st.cell[i] && v.bramble[i] > 0) ctx.drawImage(brambleSpr[v.bramble[i] - 1], bx + (i % st.w) * cell, by + ((i / st.w) | 0) * cell, cell, cell);
  if (hintIds && G.hint) { // swipe ghost
    const [a, b] = G.hint, k = (t * 0.9) % 1, x0 = cx(a), y0 = cy(a), x1 = cx(b), y1 = cy(b), e = ease.inOutCubic(Math.min(1, k * 1.4));
    // glowing outline on both gems + chevron arrow + a fingertip that swipes from A to B
    ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 3; ctx.shadowColor = '#fff6a0'; ctx.shadowBlur = 12;
    for (const i of [a, b]) { roundRect(ctx, cx(i) - cell * 0.47, cy(i) - cell * 0.47, cell * 0.94, cell * 0.94, cell * 0.2); ctx.stroke(); }
    const ang = Math.atan2(y1 - y0, x1 - x0); ctx.translate((x0 + x1) / 2, (y0 + y1) / 2); ctx.rotate(ang); ctx.fillStyle = '#fff';
    for (let q = 0; q < 2; q++) { const o = (q - 0.5) * cell * 0.16 + Math.sin(t * 6) * 2; ctx.beginPath(); ctx.moveTo(o + cell * 0.1, 0); ctx.lineTo(o - cell * 0.03, -cell * 0.12); ctx.lineTo(o - cell * 0.03, cell * 0.12); ctx.fill(); }
    ctx.restore();
    ctx.globalAlpha = k < 0.85 ? 0.95 : (1 - k) / 0.15 * 0.95; const fx_ = x0 + (x1 - x0) * e + cell * 0.12, fy = y0 + (y1 - y0) * e + cell * 0.22;
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(fx_ + 3, fy + 5, cell * 0.17, cell * 0.21, -0.4, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff4ea'; ctx.strokeStyle = '#8a6a50'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(fx_, fy, cell * 0.16, cell * 0.21, -0.4, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,190,190,.8)'; ctx.beginPath(); ctx.ellipse(fx_ - cell * 0.03, fy - cell * 0.08, cell * 0.07, cell * 0.06, -0.4, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
  }
}
function drawFx(dt) {
  const ink = night() ? '#ffffff' : '#ffffff';
  for (let k = fx.length - 1; k >= 0; k--) {
    const f = fx[k]; f.t += dt * G.speed; const q = f.t / f.life; if (q >= 1) { fx.splice(k, 1); continue; }
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    if (f.k === 'beamH' || f.k === 'beamV') { const w = cell * (0.2 + 0.36 * Math.sin(q * Math.PI)); ctx.globalAlpha = (1 - q) * 0.8; const g = f.k === 'beamH' ? ctx.createLinearGradient(0, f.y - w, 0, f.y + w) : ctx.createLinearGradient(f.x - w, 0, f.x + w, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, ink); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; if (f.k === 'beamH') ctx.fillRect(bx - 20, f.y - w, bw + 40, w * 2); else ctx.fillRect(f.x - w, by - 20, w * 2, bh + 40); }
    else if (f.k === 'ring') { ctx.globalAlpha = (1 - q) * 0.9; ctx.strokeStyle = f.col; ctx.lineWidth = cell * 0.18 * (1 - q) + 1; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * ease.outCubic(q), 0, TAU); ctx.stroke(); }
    else if (f.k === 'arc') { ctx.globalAlpha = 1 - q; ctx.strokeStyle = f.col; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(f.x0, f.y0); const n = 6; for (let s = 1; s <= n; s++) { const u = s / n; ctx.lineTo(f.x0 + (f.x1 - f.x0) * u + (s < n ? (Math.random() - 0.5) * cell * 0.4 : 0), f.y0 + (f.y1 - f.y0) * u + (s < n ? (Math.random() - 0.5) * cell * 0.4 : 0)); } ctx.stroke(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke(); }
    else if (f.k === 'flash') { ctx.globalAlpha = (1 - q) * 0.6; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
  }
  for (const p of parts) {
    if (!p.on) continue; p.t += dt; if (p.t >= p.life) { p.on = false; continue; }
    p.vx *= Math.exp(-p.drag * dt); p.vy = p.vy * Math.exp(-p.drag * dt) + p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    const q = p.t / p.life, a = 1 - q * q; ctx.globalAlpha = a;
    if (p.kind === 'spark') { ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(tintedGlow(SPR.glow, p.col), p.x - p.size * 3, p.y - p.size * 3, p.size * 6, p.size * 6); ctx.globalCompositeOperation = 'source-over'; }
    else { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.col;
      if (p.kind === 'shard') { ctx.beginPath(); ctx.moveTo(0, -p.size); ctx.lineTo(p.size * 0.6, 0); ctx.lineTo(0, p.size); ctx.lineTo(-p.size * 0.6, 0); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.moveTo(0, -p.size); ctx.lineTo(p.size * 0.6, 0); ctx.lineTo(0, 0); ctx.fill(); }
      else { ctx.beginPath(); ctx.ellipse(0, 0, p.size * 1.2, p.size * 0.55, 0, 0, TAU); ctx.fill(); }
      ctx.restore(); }
  }
  ctx.globalAlpha = 1;
  for (let k = flyers.length - 1; k >= 0; k--) { const f = flyers[k]; f.t += dt * G.speed; const q = Math.min(1, f.t / f.life), e = ease.inOutCubic(q); const x = f.x + (f.x1 - f.x) * e, y = f.y + (f.y1 - f.y) * e - Math.sin(q * Math.PI) * 60; ctx.globalAlpha = 0.95; ctx.drawImage(f.type === 'collect' ? SPR.gems[f.c] : tintedGlow(SPR.glow, f.type === 'seeds' ? '#ffe08a' : f.type === 'vines' ? '#7bd65c' : '#c8a070'), x - cell * 0.3, y - cell * 0.3, cell * 0.6, cell * 0.6); if (q >= 1) { flyers.splice(k, 1); const el = document.querySelector(`.goal[data-k="${f.k}"]`); if (el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); } } }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let k = texts.length - 1; k >= 0; k--) { const tx = texts[k]; tx.t += dt; const q = tx.t / tx.life; if (q >= 1) { texts.splice(k, 1); continue; } const s = q < 0.15 ? ease.outBack(q / 0.15) : 1; ctx.globalAlpha = q > 0.7 ? (1 - q) / 0.3 : 1; ctx.font = `900 ${tx.size * s}px Inter,system-ui,sans-serif`; ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(40,30,60,.55)'; ctx.strokeText(tx.text, tx.x, tx.y - q * 40); ctx.fillStyle = tx.col; ctx.fillText(tx.text, tx.x, tx.y - q * 40); }
  if (banner) { banner.t += dt; const q = banner.t / banner.life; if (q >= 1) banner = null; else { const s = q < 0.2 ? ease.outBack(q / 0.2) : 1, a = q > 0.75 ? (1 - q) / 0.25 : 1; ctx.save(); ctx.globalAlpha = a; ctx.translate(bx + bw / 2, by + bh * 0.42); ctx.rotate(-0.06); ctx.scale(s, s); ctx.font = `900 ${Math.min(banner.size, W / 9)}px Inter,system-ui,sans-serif`; ctx.lineWidth = 9; ctx.strokeStyle = 'rgba(80,30,90,.7)'; ctx.strokeText(banner.text, 0, 0); ctx.fillStyle = banner.col; ctx.fillText(banner.text, 0, 0); ctx.restore(); } }
  ctx.globalAlpha = 1;
}
function drawZenGarden() {
  const n = G.zenFlowers.length; if (!n) return; const y = by + bh + 44; const names = ['tulip', 'daisy', 'daisy2', 'tulip2', 'lavender', 'moonflower', 'sunflower'];
  G.zenFlowers.slice(-12).forEach((f, k) => drawPlant(ctx, names[f.k % names.length], W / 2 + (k - Math.min(11, n - 1) / 2) * 30, Math.min(H - 6, y), 0.55, f.g, G.t + k, night()));
}
const menuGems = Array.from({ length: 9 }, (_, k) => ({ c: k % 6, a: (k / 9) * TAU, r: 0.9 + (k % 3) * 0.12 }));
function drawMenuScene() { const R = Math.min(W, H) * 0.42; menuGems.forEach((m, k) => { const a = m.a + G.t * 0.12; const x = W / 2 + Math.cos(a) * R * m.r, y = H * 0.48 + Math.sin(a) * R * m.r * 0.62 + Math.sin(G.t * 1.4 + k) * 6; const s = cell * 1.5; ctx.drawImage(SPR.gems[m.c], x - s / 2, y - s / 2, s, s); }); }
let ambient = 0;
function frame(dt) {
  G.t += dt;
  if (G.hitstop > 0) { G.hitstop -= dt; dt *= 0.08; }
  updateTweens(dt * (G.screen === 'paused' ? 0 : 1));
  if (G.screen === 'play' && !G.busy && !cardOpen) G.idle += dt;
  // idle twinkles: a glint wanders across the board so it never looks frozen
  if (G.st && !settings.reducedMotion && (G.twk = (G.twk || 0) + dt) > 0.28) { G.twk = 0; const arr = [...G.sprites.values()]; const sp = arr[(Math.random() * arr.length) | 0]; if (sp && !sp.tw) { sp.tw = 0.001; tween(0.6, (k) => (sp.tw = k >= 1 ? 0 : k)); } }
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  let sx = 0, sy = 0; if (G.shake > 0.2) { sx = (Math.random() - 0.5) * G.shake; sy = (Math.random() - 0.5) * G.shake; G.shake *= Math.exp(-dt * 12); } else G.shake = 0;
  ctx.drawImage(backdrop, 0, 0, W, H);
  // ambient petals / fireflies
  if ((ambient += dt) > (settings.reducedMotion ? 1.2 : 0.35)) { ambient = 0; const nt = night(); emit({ x: Math.random() * W, y: nt ? H * (0.3 + Math.random() * 0.6) : -10, vx: 20 + Math.random() * 20, vy: nt ? -6 : 26, g: 0, drag: 0, life: nt ? 4 : 9, size: nt ? 1.6 : 3.4, col: nt ? '#fff6b0' : ['#ffd0e8', '#ffffff', '#ffe6f2'][Math.floor(Math.random() * 3)], kind: nt ? 'spark' : 'petal', vr: 1.5 }); }
  ctx.save(); ctx.translate(sx, sy);
  if (G.screen === 'map' || (G.screen === 'finale')) {
    if (G.screen === 'finale') { G.finaleT += dt; G.mapY = Math.max(0, (G.mapLayout.H - H) * (1 - ease.inOutCubic(Math.min(1, G.finaleT / 9)))); if (Math.random() < dt * 8) burst(Math.random() * W, Math.random() * H * 0.6, ['#ffd0e8', '#fff3a0', '#d7b4ff', '#b8f0ff'][Math.floor(Math.random() * 4)], 14, 'spark', 240); if (G.finaleT > 9.5 && G.finaleT < 50) { G.finaleT = 60; finaleCard(); } }
    else if (!G.mapDrag && Math.abs(G.mapV) > 1) { G.mapY = clamp(G.mapY + G.mapV * dt, 0, G.mapLayout.H - H); G.mapV *= Math.exp(-dt * 4); }
    drawMap(dt);
  } else if (G.st && ['play', 'intro', 'bonus', 'result', 'paused'].includes(G.screen)) { drawBoard(dt); if (G.mode === 'zen') drawZenGarden(); }
  else if (G.screen === 'menu') drawMenuScene();
  drawFx(dt);
  ctx.restore();
  P.frames++; P.counts.sprites = G.sprites.size; P.counts.particles = parts.reduce((a, p) => a + (p.on ? 1 : 0), 0); P.counts.fx = fx.length;
}

// ---------------------------------------------------------------- remix (live)
function menuPick(key, v) { menu.values[key] = v; document.querySelectorAll(`#menu .sd-row[data-key="${key}"] .sd-btn`).forEach((b) => b.classList.toggle('on', b.dataset.v === v)); }
function applyConfig(c, live) {
  const prev = cfg; cfg = c;
  if (live) {
    if (G.mode === 'garden' && G.st && G.def && c.extraMoves !== prev.extraMoves && ['play', 'intro'].includes(G.screen)) { G.st.moves = Math.max(1, G.st.moves + ((c.extraMoves | 0) - (prev.extraMoves | 0))); G.vis.moves = G.st.moves; }
    if (G.mode === 'zen' && G.st) G.st.colors = clamp(c.gemColors | 0 || 6, 4, 6);
    if (c.difficulty !== prev.difficulty) { G.diff = c.difficulty; menuPick('difficulty', c.difficulty); }
    if (c.mode !== prev.mode) menuPick('mode', c.mode === 'zen' ? 'zen' : 'garden');
    iconCache.clear(); layout(); blockerSprites(); hud();
  }
}

// ---------------------------------------------------------------- boot
const P = probe({ backend: {} }, { dataReady: false });
P.backend = 'canvas2d';
layout(); blockerSprites();
let last = performance.now();
function loop(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; frame(dt); requestAnimationFrame(loop); }
requestAnimationFrame(loop);
P.dataReady = true;
P.game = {
  state: () => ({ screen: G.screen, mode: G.mode, level: G.level, moves: G.st?.moves, score: G.st?.score, vis: G.vis && { score: G.vis.score, moves: G.vis.moves }, busy: G.busy, won: G.st ? L.levelWon(G.st) : false, lost: G.st ? L.levelLost(G.st) : false, goals: G.st ? L.goalProgress(G.st) : [], unlocked: save.unlocked, stars: save.stars.reduce((a, b) => a + b, 0) }),
  start: (k = 1) => { menu.hide(); closeCard(); startLevel(k); closeCard(); beginPlay(); hideCoach(); },
  zen: () => { menu.hide(); closeCard(); startZen(true); },
  map: (grow = -1) => { menu.hide(); closeCard(); openMap(grow); },
  speed: (s) => (G.speed = s),
  // play n moves with the greedy bot (waits for animations); returns final state
  autoplay: async (n = 5) => { for (let k = 0; k < n; k++) { while (G.busy) await new Promise((r) => setTimeout(r, 30)); if (G.screen !== 'play') break; const m = L.bestMove(G.st); if (!m) break; await trySwap(m[0], m[1]); } while (G.busy) await new Promise((r) => setTimeout(r, 30)); return P.game.state(); },
  hint: () => { G.idle = 99; },
  showcase: () => { const st = G.st; const pick = () => { for (;;) { const i = (Math.random() * st.w * st.h) | 0; const g = st.gem[i]; if (g && g.c >= 0 && g.c < 6 && g.s === 0) return g; } }; const a = pick(); a.s = L.PRISM; a.c = -1; [L.BOMB, L.LINE_H, L.LINE_V, L.BOMB].forEach((sp) => (pick().s = sp)); syncSprites(); },
  move: () => { const m = L.bestMove(G.st); if (m) trySwap(m[0], m[1]); return m; },
  win: async () => { G.st.goals.forEach((g) => { if (g.type === 'score') G.st.score = Math.max(G.st.score, g.target); }); G.st.vine.fill(0); G.st.bramble.fill(0); G.st.seedsCollected = G.st.seedsTotal; G.st.collected = G.st.collected.map(() => 999); G.vis = makeVis(G.st); await levelComplete(); },
  lose: () => { G.st.moves = 0; G.vis.moves = 0; hud(); levelFailed(); },
  finale: () => { menu.hide(); closeCard(); save.stars = save.stars.map((s) => s || 3); save.unlocked = 40; save.grown = save.grown.map(() => true); G.level = 40; finale(); },
  pause, closeCard, unlockAll: () => { save.unlocked = 40; save.grown = save.grown.map((_, k) => k < 39); save.stars = save.stars.map((s, k) => (k < 39 ? Math.max(s, 1 + (k % 3)) : s)); persist(); },
  reset: () => { store.set(SAVE_KEY, null); location.reload(); },
};
if (Q.has('autostart')) { menu.hide(); startLevel(+Q.get('autostart') || 1); }
