// Lantern Hold — game controller: boot, camera, input, menus, HUD, onboarding, saves, remix, probe hooks, loop.
import {
  THREE, Q, settings, createRenderer, createPipeline, autoResize, probe, startLoop, stageLights, updateTweens, tween, ease,
  shake, applyShake, flash, sfx, loadDream, initUI, startMenu, settingsButton, toast, store, host,
} from '/shared/sd-kit.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { LEVELS, TOWERS, TOWER_IDS, ENEMIES, HERO, BIOMES, DIFFICULTY, TARGET_MODES, starsFor } from './data.js';
import * as S from './sim.js';
import { makeBot } from './bot.js';
import { waveSummary } from './waves.js';
import { buildWorld, BIOME, materials, EXTENT } from './world.js';
import { View, SFX } from './view.js';
import { TOWER_ICON, ENEMY_ICON, UI_ICON } from './icons.js';

const $ = (id) => document.getElementById(id);
const bootBar = (f) => { const b = $('bootBar'); if (b) b.style.width = Math.round(f * 100) + '%'; };
bootBar(0.15);

// ---------------------------------------------------------------- config (remix)
const DEFAULTS = {
  difficulty: 'normal', lives: 20, goldMul: 1, enemyHp: 1, enemySpeed: 1, waveGap: 25, sky: 'dusk',
  lanternColor: '#ffd49a', colors: { accent: '#ffd27a' }, heroName: 'Captain Wren', unlockAll: false,
};
const num = (v, d, lo, hi) => { const n = +v; return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
function sanitize(c) {
  if (!DIFFICULTY[c.difficulty]) c.difficulty = 'normal';
  c.lives = Math.round(num(c.lives, 20, 1, 99)); c.goldMul = num(c.goldMul, 1, 0.25, 4); c.enemyHp = num(c.enemyHp, 1, 0.25, 4);
  c.enemySpeed = num(c.enemySpeed, 1, 0.5, 2); c.waveGap = num(c.waveGap, 25, 5, 90);
  if (!['dusk', 'midnight', 'aurora'].includes(c.sky)) c.sky = 'dusk';
  if (!/^#[0-9a-f]{6}$/i.test(c.lanternColor || '')) c.lanternColor = DEFAULTS.lanternColor;
  c.colors = Object.assign({ accent: '#ffd27a' }, c.colors || {}); if (!/^#[0-9a-f]{6}$/i.test(c.colors.accent)) c.colors.accent = '#ffd27a';
  c.heroName = String(c.heroName || 'Captain Wren').replace(/[<>]/g, '').slice(0, 24) || 'Captain Wren';
  c.unlockAll = c.unlockAll === true || c.unlockAll === 'true';
  return c;
}
let cfg = sanitize(await loadDream(DEFAULTS, (live) => applyLive(sanitize(live))));
const PKEY = 'lantern-hold-progress-v1', RKEY = 'lantern-hold-run-v1';
const progress = Object.assign({ stars: {}, endless: {}, seen: [], tutDone: false, diff: cfg.difficulty }, store.get(PKEY, {}) || {});
const saveProgress = () => store.set(PKEY, progress);

// ---------------------------------------------------------------- renderer + scene
initUI();
const renderer = await createRenderer({ toneMapping: 'aces', exposure: 1.0 });
bootBar(0.35);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 1, 260);
const lights = stageLights(scene, { shadowSize: 17.5, keyPos: [-12, 18, 9] });
Object.assign(lights.key.shadow.camera, { near: 1, far: 70 }); lights.key.shadow.camera.updateProjectionMatrix();
lights.key.shadow.radius = 3; lights.key.shadow.bias = -0.0006; lights.key.shadow.normalBias = 0.03;
{ const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.3; }
const post = createPipeline(renderer, scene, camera, { bloom: { strength: 0.62, radius: 0.5, threshold: 0.86 } });
const view = new View(scene, camera, $('labels'));
bootBar(0.6);

// ---------------------------------------------------------------- app state
const app = {
  mode: 'title', idx: 0, G: null, world: null, worldKey: '', bot: null, demo: true, endless: false, speed: 1, paused: false, acc: 0,
  lastSave: -1, leaks: {}, endShown: false, t0: 0, autoplay: false,
};
const sel = { pad: -1, tower: 0, pick: null, heroSel: false, marker: null, rally: 0 };
const camS = { az: 0, polar: 0.74, fit: 40, zoom: 1, tx: 0, tz: 0.4, portrait: false, sway: 0 };

function gameOpts(endless) {
  return { difficulty: progress.diff || cfg.difficulty, endless, lives: cfg.lives !== 20 ? cfg.lives : null, goldMul: cfg.goldMul, hpMul: cfg.enemyHp, speedMul: cfg.enemySpeed, waveGap: cfg.waveGap };
}
function applyBiome(L) {
  const B = BIOME[L.biome];
  lights.key.color.set(B.key); lights.key.intensity = B.keyI; lights.key.position.set(...B.keyPos);
  lights.hemi.color.set(B.hemi[0]); lights.hemi.groundColor.set(B.hemi[1]); lights.hemi.intensity = B.hemi[2];
  lights.rim.color.set(B.rim); lights.rim.intensity = B.rimI; lights.amb.intensity = 0.1;
  renderer.toneMappingExposure = B.exposure;
}
function loadLevel(idx, { endless = false, demo = false, snap = null } = {}) {
  closeMenus();
  const L = LEVELS[idx];
  const key = L.id + ':' + cfg.sky;
  if (app.worldKey !== key) { app.world?.dispose(); app.G = null; app.world = buildWorld(scene, L, S.prepMap(L), cfg); app.worldKey = key; }
  applyBiome(L);
  app.idx = idx; app.endless = endless; app.demo = demo;
  app.G = snap ? S.restore(snap) : S.createGame(idx, demo ? { difficulty: 'casual' } : gameOpts(endless));
  app.bot = demo || app.autoplay ? makeBot(app.G, 'smart') : null;
  app.acc = 0; app.speed = demo ? 1 : app.speed; app.paused = false; app.lastSave = snap ? app.G.wave : -1; app.leaks = {}; app.endShown = false; app.t0 = performance.now();
  view.attach(app.G);
  camS.zoom = 1; camS.tx = 0; camS.tz = 0.4; fitCamera();
  buildRifts();
  $('hud').classList.toggle('hidden', demo);
  $('intro').classList.remove('show');
  materials().lampTint.value.set(cfg.lanternColor);
  if (!demo) { app.mode = 'play'; host('levelStart', { level: L.id, endless }); startCoach(); banner(endless ? 'Endless' : BIOMES[L.biome].name, L.name); }
  updateHUD(true);
}

// ---------------------------------------------------------------- camera: fit the diorama to any aspect (portrait turns the valley to run top→bottom)
const _v = new THREE.Vector3();
function placeCamera(dist) {
  const tgt = _v.set(camS.tx, 0, camS.tz);
  const az = camS.az + camS.sway, p = camS.polar;
  camera.position.set(tgt.x + Math.sin(p) * Math.sin(az) * dist, Math.cos(p) * dist, tgt.z + Math.sin(p) * Math.cos(az) * dist);
  camera.lookAt(tgt.x, 0, tgt.z);
  camera.updateMatrixWorld();
}
function fitCamera() {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  camS.portrait = innerHeight > innerWidth * 1.05;
  camS.az = camS.portrait ? Math.PI / 2 : 0;
  camS.polar = camS.portrait ? 0.62 : 0.74;
  const topM = 70 / innerHeight * 2, botM = (camS.portrait ? 84 : 70) / innerHeight * 2;
  const pts = [[-EXTENT.x, 0, -EXTENT.z], [EXTENT.x, 0, -EXTENT.z], [-EXTENT.x, -1.2, EXTENT.z], [EXTENT.x, -1.2, EXTENT.z], [-EXTENT.x, 1.5, -EXTENT.z], [EXTENT.x, 1.5, -EXTENT.z]];
  const tx = camS.tx, tz = camS.tz; camS.tx = 0; camS.tz = camS.portrait ? 0 : 0.4;
  let lo = 10, hi = 160;
  for (let it = 0; it < 26; it++) {
    const d = (lo + hi) / 2; placeCamera(d);
    let ok = true;
    for (const p of pts) { _v.set(...p).project(camera); if (Math.abs(_v.x) > (camS.portrait ? 1.06 : 0.97) || _v.y > 1 - topM || _v.y < -1 + botM) { ok = false; break; } }
    if (ok) hi = d; else lo = d;
  }
  camS.fit = hi; camS.tx = tx; camS.tz = tz; clampPan();
}
function clampPan() {
  camS.zoom = Math.max(0.42, Math.min(1, camS.zoom));
  const f = 1 - camS.zoom;
  camS.tx = Math.max(-EXTENT.x * f - 0.5, Math.min(EXTENT.x * f + 0.5, camS.tx));
  camS.tz = Math.max(-EXTENT.z * f - 0.5, Math.min(EXTENT.z * f + 0.9, camS.tz));
}
autoResize(renderer, camera, () => fitCamera());

// ---------------------------------------------------------------- picking
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function groundPoint(px, py, y = 0) {
  ndc.set(px / innerWidth * 2 - 1, -(py / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  plane.constant = -y; const p = new THREE.Vector3(); return ray.ray.intersectPlane(plane, p) ? p : null;
}
function toScreen(x, y, z) { _v.set(x, y, z).project(camera); return { x: (_v.x * 0.5 + 0.5) * innerWidth, y: (-_v.y * 0.5 + 0.5) * innerHeight, behind: _v.z > 1 }; }
function pickPad(px, py) {
  const G = app.G; let best = -1, bd = 40 * 40;
  G.map.pads.forEach((p, i) => { const s = toScreen(p.x, 0.5, p.z); const d = (s.x - px) ** 2 + (s.y - py) ** 2; if (d < bd) { bd = d; best = i; } });
  return best;
}

// ---------------------------------------------------------------- input
const cvs = renderer.domElement;
const ptrs = new Map(); let drag = null, pinch = null;
cvs.addEventListener('pointerdown', (e) => {
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 1) drag = { x0: e.clientX, y0: e.clientY, lx: e.clientX, ly: e.clientY, moved: false };
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y), z0: camS.zoom }; drag = null; }
});
addEventListener('pointermove', (e) => {
  const p = ptrs.get(e.pointerId); if (!p) return;
  p.x = e.clientX; p.y = e.clientY;
  if (pinch && ptrs.size >= 2) { const [a, b] = [...ptrs.values()]; camS.zoom = pinch.z0 * pinch.d0 / Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)); clampPan(); return; }
  if (!drag) return;
  const dx = e.clientX - drag.lx, dy = e.clientY - drag.ly; drag.lx = e.clientX; drag.ly = e.clientY;
  if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 9) drag.moved = true;
  if (drag.moved && app.mode === 'play') panBy(dx, dy);
});
const endPtr = (e) => {
  const was = ptrs.size; ptrs.delete(e.pointerId);
  if (ptrs.size < 2) pinch = null;
  if (drag && was === 1 && e.type === 'pointerup' && !drag.moved && e.target === cvs) tap(e.clientX, e.clientY);
  if (ptrs.size === 0) drag = null;
};
addEventListener('pointerup', endPtr); addEventListener('pointercancel', endPtr);
cvs.addEventListener('wheel', (e) => { if (app.mode !== 'play') return; e.preventDefault(); camS.zoom *= 1 + Math.sign(e.deltaY) * 0.08; clampPan(); }, { passive: false });
function panBy(dx, dy) {
  const s = 2 * camS.fit * camS.zoom * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / innerHeight;
  const az = camS.az, rx = Math.cos(az), rz = -Math.sin(az), fx = -Math.sin(az), fz = -Math.cos(az);
  camS.tx -= (dx * rx - dy * fx / Math.cos(camS.polar) * 0.8) * s; camS.tz -= (dx * rz - dy * fz / Math.cos(camS.polar) * 0.8) * s;
  clampPan();
}
const keysDown = new Set();
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  keysDown.add(e.code);
  if (app.mode !== 'play') return;
  const k = e.key.toLowerCase();
  if (k === 'escape' || k === 'p') { if (sel.pad >= 0 || sel.heroSel || sel.rally) closeMenus(); else togglePause(); e.preventDefault(); return; }
  if (app.paused) return;
  if (k === ' ' || k === 'n') { doCall(); e.preventDefault(); }
  else if (k === 'f') cycleSpeed();
  else if (k === 'q') doAbility();
  else if (k === 'h') toggleHero();
  else if (k >= '1' && k <= '5' && sel.pad >= 0 && !app.G.padTower[sel.pad]) clickPick(TOWER_IDS[+k - 1]);
  else if (k === 'u' && sel.tower) { const t = S.towerById(app.G, sel.tower); if (t && t.tier < 2) clickPick('up'); }
  else if (k === 's' && sel.tower) clickPick('sell');
  else if (k === 't' && sel.tower) clickPick('mode');
  else if (k === '=' || k === '+') { camS.zoom *= 0.9; clampPan(); }
  else if (k === '-') { camS.zoom *= 1.1; clampPan(); }
});
addEventListener('keyup', (e) => keysDown.delete(e.code));

function tap(px, py) {
  if (app.mode !== 'play' || app.paused || !app.G) return;
  const G = app.G, p = groundPoint(px, py); if (!p) return;
  if (sel.rally) {
    if (S.setRally(G, sel.rally, p.x, p.z)) { sfx.select(); sel.marker = { x: p.x, z: p.z, t: 0 }; closeMenus(); }
    else { sfx.error(); toast('Rally point: on the road, inside the ring'); }
    return;
  }
  const pi = pickPad(px, py);
  const h = G.hero, hs = toScreen(h.x, 0.6, h.z), hd = Math.hypot(hs.x - px, hs.y - py);
  const pd = pi >= 0 ? (() => { const s = toScreen(G.map.pads[pi].x, 0.5, G.map.pads[pi].z); return Math.hypot(s.x - px, s.y - py); })() : 1e9;
  if (!h.dead && hd < 34 && hd < pd && !sel.heroSel) { selectHero(true); return; }
  if (pi >= 0 && pd < 40) { openPad(pi); return; }
  if (sel.heroSel) {
    if (S.moveHero(G, p.x, p.z)) { sel.marker = { x: p.x, z: p.z, t: 0 }; sfx.move(); coachDone('heroMove'); }
    selectHero(false); return;
  }
  closeMenus();
}

// ---------------------------------------------------------------- radial menus
const radial = $('radial'), info = $('info');
let rbtns = [];
function closeMenus(keepHero = false) {
  radial.innerHTML = ''; rbtns = []; info.classList.remove('show');
  sel.pad = -1; sel.tower = 0; sel.pick = null; sel.rally = 0; view.hideRange();
  if (!keepHero) selectHero(false);
}
function selectHero(on) {
  const G = app.G; if (on && (!G || G.hero.dead)) return;
  if (on) { closeMenus(true); sfx.select(); coachDone('heroSel'); }
  sel.heroSel = on; $('heroBtn').classList.toggle('sel', on);
  if (on) view.showRange(G.hero.x, G.hero.z, HERO.range); else if (sel.pad < 0) view.hideRange();
}
function toggleHero() { selectHero(!sel.heroSel); }
const ROMAN = ['I', 'II', 'III'];
function openPad(i) {
  const G = app.G; closeMenus(); sel.pad = i; sfx.click();
  const tid = G.padTower[i];
  if (!tid) {
    TOWER_IDS.forEach((type, k) => addBtn(type, -90 + k * 72, TOWER_ICON[type], TOWERS[type].tiers[0].cost, TOWERS[type].short));
    coachDone('openPad');
  } else {
    const t = S.towerById(G, tid); sel.tower = tid;
    const opts = S.upgradeOptions(t);
    if (t.tier < 2) addBtn('up', -90, UI_ICON.up, opts[0].cost, ROMAN[t.tier + 1]);
    else if (!t.branch) { addBtn('A', -132, branchIcon(t.type, 'A'), opts[0].cost, opts[0].name.split(' ')[0]); addBtn('B', -48, branchIcon(t.type, 'B'), opts[1].cost, opts[1].name.split(' ')[0]); }
    addBtn('sell', 90, UI_ICON.sell, '+' + S.sellValue(t), 'Sell', true);
    if (TOWERS[t.type].kind === 'shooter') addBtn('mode', 180, UI_ICON.target, null, t.mode[0].toUpperCase() + t.mode.slice(1));
    if (TOWERS[t.type].kind === 'barracks') addBtn('rally', 0, UI_ICON.flag, null, 'Rally');
    showTowerInfo(t, null);
    view.showRange(t.x, t.z, S.towerStats(t).range);
  }
  positionMenus();
}
function branchIcon(type, b) { return `<div style="position:relative;width:100%;height:100%">${TOWER_ICON[type]}<span style="position:absolute;right:-2px;bottom:-2px;font:900 11px/1 system-ui;background:${b === 'A' ? '#3cc7b8' : '#c8384a'};color:#fff;border-radius:6px;padding:2px 4px">${b}</span></div>`; }
function addBtn(key, ang, icon, cost, label, isSell = false) {
  const b = document.createElement('button'); b.className = 'rb'; b.dataset.key = key; b.dataset.ang = ang;
  b.innerHTML = `${icon}${cost != null ? `<span class="cost">${isSell ? cost : '◉ ' + cost}</span>` : ''}${label ? `<span class="lbl">${label}</span>` : ''}`;
  b.style.animationDelay = (rbtns.length * 0.03) + 's';
  b.addEventListener('click', (e) => { e.stopPropagation(); clickPick(key); });
  b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') previewPick(key); });
  radial.appendChild(b); rbtns.push({ el: b, key, ang, cost: typeof cost === 'number' ? cost : null });
}
function previewPick(key) {
  const G = app.G; if (sel.pad < 0) return;
  const p = G.map.pads[sel.pad];
  if (TOWERS[key]) { showBuildInfo(key); view.showRange(p.x, p.z, TOWERS[key].tiers[0].range); }
  else if (sel.tower) {
    const t = S.towerById(G, sel.tower); if (!t) return;
    if (key === 'up' || key === 'A' || key === 'B') { const nx = key === 'up' ? TOWERS[t.type].tiers[t.tier + 1] : TOWERS[t.type].branches[key]; showTowerInfo(t, nx, key); view.showRange(t.x, t.z, nx.range); }
    else showTowerInfo(t, null, key);
  }
}
function clickPick(key) {
  const G = app.G; if (!G || sel.pad < 0) return;
  if (key === 'mode') { const t = S.towerById(G, sel.tower); const m = TARGET_MODES[(TARGET_MODES.indexOf(t.mode) + 1) % 3]; S.setMode(G, t.id, m); sfx.click(); const b = rbtns.find((r) => r.key === 'mode'); if (b) b.el.querySelector('.lbl').textContent = m[0].toUpperCase() + m.slice(1); showTowerInfo(t, null, 'mode'); return; }
  if (key === 'rally') { sel.rally = sel.tower; const t = S.towerById(G, sel.tower); radial.innerHTML = ''; rbtns = []; info.classList.remove('show'); view.showRange(t.x, t.z, S.towerStats(t).range); toast('Tap the road inside the ring to set the rally point'); sfx.click(); return; }
  if (sel.pick !== key) { // first tap selects + previews
    sel.pick = key; previewPick(key); sfx.select();
    rbtns.forEach((r) => r.el.classList.toggle('sel', r.key === key));
    coachDone('pick:' + key);
    return;
  }
  // second tap confirms
  if (TOWERS[key]) {
    const pad = sel.pad, r = S.build(G, pad, key);
    if (r.ok) { sfx.thud(); setTimeout(() => sfx.chime(), 90); closeMenus(); coachDone('build'); bumpStat('stGold'); }
    else { sfx.error(); if (r.reason === 'gold') { toast('Not enough gold'); $('stGold').classList.remove('hurt'); void $('stGold').offsetWidth; $('stGold').classList.add('hurt'); } }
  } else if (key === 'sell') {
    const r = S.sell(G, sel.tower); if (r.ok) { SFX.coin(); closeMenus(); }
  } else {
    const t = S.towerById(G, sel.tower), r = S.upgrade(G, sel.tower, key === 'up' ? null : key);
    if (r.ok) { sfx.magic(); coachDone('upgrade'); const pad = sel.pad; closeMenus(); openPad(pad); }
    else { sfx.error(); if (r.reason === 'gold') toast('Not enough gold'); }
    void t;
  }
}
const fmt = (n) => (Math.round(n * 10) / 10).toString();
function statRows(type, st) {
  const D = TOWERS[type], rows = [];
  if (D.kind === 'barracks') rows.push(['Wardens', '3'], ['Health', st.hp], ['Damage', st.dmg], ['Armour', Math.round(st.armor * 100) + '%'], ['Range', fmt(st.range)]);
  else if (D.kind === 'aura') { rows.push(['Slow', Math.round(st.slow * 100) + '%'], ['Pulse dmg', st.dmg + '/s'], ['Radius', fmt(st.range)]); if (st.flare) rows.push(['Flare', `${st.flareDmg} + stun ${st.stun}s / ${st.flare}s`]); if (st.mark) rows.push(['Mark', `+${st.mark * 100}% damage taken`]); }
  else { rows.push(['Damage', st.beam ? `${st.dmg}→${st.dpsMax}/s` : st.multi ? `${st.dmg} ×${st.multi}` : st.dmg], ['Range', fmt(st.range)]); if (!st.beam) rows.push(['Speed', fmt(1 / st.rate) + '/s']); if (st.splash) rows.push(['Splash', fmt(st.splash)]); if (st.chain) rows.push(['Chain', `${st.chain + 1} foes`]); if (st.pierce) rows.push(['Pierce', Math.round(st.pierce * 100) + '% armour']); if (st.crit) rows.push(['Crit', `${st.crit * 100}% ×${st.critMul}`]); if (st.burn) rows.push(['Burn', `${st.burn}/s`]); if (st.cluster) rows.push(['Bomblets', `${st.cluster} × ${st.clusterDmg}`]); }
  rows.push(['DPS', Math.round(S.dpsOf(type, st))]);
  return rows;
}
function subline(type) { const D = TOWERS[type]; return `${D.dmgType === 'magic' ? 'Magic' : 'Physical'} · ${D.air ? 'hits flying' : 'ground only'}${D.kind === 'aura' ? ' · reveals stealth' : ''}${D.kind === 'barracks' ? ' · blocks the road' : ''}`; }
function showBuildInfo(type) {
  const D = TOWERS[type], st = D.tiers[0], G = app.G;
  info.innerHTML = `<h3>${D.name}</h3><div class="sub">${subline(type)}</div>${statRows(type, st).map(([a, b]) => `<div class="row"><span>${a}</span><b>${b}</b></div>`).join('')}<p>${D.blurb}</p><p style="color:${G.gold >= st.cost ? '#bfffd2' : '#ff9aa8'}">${G.gold >= st.cost ? 'Tap again to build · ◉ ' + st.cost : 'Need ◉ ' + st.cost}</p>`;
  info.classList.add('show'); positionMenus();
}
function showTowerInfo(t, next, key = null) {
  const D = TOWERS[t.type], st = S.towerStats(t);
  const nm = t.branch ? D.branches[t.branch].name : `${D.name} ${ROMAN[t.tier]}`;
  let rows = statRows(t.type, st);
  if (next) { const nr = statRows(t.type, next); rows = nr.map(([a, b]) => { const cur = rows.find((r) => r[0] === a); return [a, cur && String(cur[1]) !== String(b) ? `${cur[1]} <span class="up">→ ${b}</span>` : `<span class="up">${b}</span>`]; }); }
  let foot = '';
  if (key === 'sell') foot = `<p>Tap again to sell for ◉ ${S.sellValue(t)}</p>`;
  else if (key === 'mode') foot = `<p>Targets the <b>${t.mode}</b> foe in range${t.mode === 'first' ? ' (closest to the Hold)' : t.mode === 'strong' ? ' (most health)' : ' (nearest the tower)'}. Tap to change.</p>`;
  else if (next) foot = `<p>${next.blurb || ''}</p><p style="color:${app.G.gold >= next.cost ? '#bfffd2' : '#ff9aa8'}">${app.G.gold >= next.cost ? 'Tap again to upgrade · ◉ ' + next.cost : 'Need ◉ ' + next.cost}</p>`;
  else foot = `<p style="color:var(--dim)">${t.branch ? D.branches[t.branch].blurb : D.blurb}${TOWERS[t.type].kind === 'shooter' ? ` · Targeting: ${t.mode}` : ''}</p>`;
  info.innerHTML = `<h3>${next ? (key === 'up' ? `${D.name} ${ROMAN[t.tier + 1]}` : next.name) : nm}</h3><div class="sub">${subline(t.type)}</div>${rows.map(([a, b]) => `<div class="row"><span>${a}</span><b>${b}</b></div>`).join('')}${foot}`;
  info.classList.add('show'); positionMenus();
}
function positionMenus() {
  const G = app.G; if (!G || sel.pad < 0) return;
  const p = G.map.pads[sel.pad], s = toScreen(p.x, 0.6, p.z);
  const R = innerWidth < 720 ? 66 : 76;
  const cx = Math.max(R + 34, Math.min(innerWidth - R - 34, s.x)), cy = Math.max(R + 70, Math.min(innerHeight - R - 90, s.y));
  for (const b of rbtns) {
    const a = +b.ang * Math.PI / 180;
    b.el.style.left = (cx + Math.cos(a) * R) + 'px'; b.el.style.top = (cy + Math.sin(a) * R) + 'px';
    if (b.cost != null) b.el.classList.toggle('no', G.gold < b.cost);
  }
  if (info.classList.contains('show') && innerWidth >= 720) {
    const w = 250, left = cx + R + 50 + w < innerWidth ? cx + R + 46 : cx - R - 46 - w;
    info.style.left = left + 'px'; info.style.top = Math.max(60, Math.min(innerHeight - info.offsetHeight - 10, cy - 90)) + 'px';
  }
}

// ---------------------------------------------------------------- HUD
$('icHeart').innerHTML = UI_ICON.heart; $('icCoin').innerHTML = UI_ICON.coin; $('icWave').innerHTML = UI_ICON.wave;
$('heroIc').innerHTML = UI_ICON.hero; $('abIc').innerHTML = UI_ICON.dawn; $('icStarT').innerHTML = UI_ICON.star;
settingsButton(`<button class="sd-btn sd-icon cornerbtn" id="speedBtn" aria-label="Game speed (F)"></button><button class="sd-btn sd-icon cornerbtn" id="pauseBtn" aria-label="Pause (Esc)">${UI_ICON.pause}</button>`);
const corner = document.querySelector('.sd-corner'); corner.style.display = 'none';
$('speedBtn').onclick = () => cycleSpeed();
$('pauseBtn').onclick = () => togglePause();
$('heroBtn').onclick = () => { toggleHero(); };
$('abilityBtn').onclick = () => doAbility();
$('callBtn').onclick = () => doCall();
function cycleSpeed() { app.speed = app.speed >= 3 ? 1 : app.speed + 1; sfx.click(); updateHUD(true); coachDone('speed'); }
function doAbility() {
  const G = app.G; if (!G || app.paused) return;
  if (S.heroAbility(G)) { coachDone('ability'); } else sfx.error();
}
function doCall() {
  const G = app.G; if (!G || app.paused || app.mode !== 'play') return;
  const b = S.callWave(G);
  if (b < 0) { sfx.error(); return; }
  if (b > 0) { toast(`Called early · +${b} gold`); SFX.coin(); bumpStat('stGold'); }
  sfx.whoosh(); app.world.riftPulse.value = 1; coachDone('call');
}
function bumpStat(id) { const el = $(id); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
const hudCache = {};
const setTxt = (id, v) => { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } };
const setHTML = (id, v) => { if (hudCache[id] !== v) { hudCache[id] = v; $(id).innerHTML = v; } };
const TAGS = (types) => {
  const t = [];
  if (types.some((x) => ENEMIES[x].flying)) t.push('<span class="tag air">FLYING</span>');
  if (types.some((x) => ENEMIES[x].armor >= 0.5)) t.push('<span class="tag armor">ARMOUR</span>');
  if (types.some((x) => ENEMIES[x].stealth)) t.push('<span class="tag stealth">STEALTH</span>');
  if (types.some((x) => ENEMIES[x].mres >= 0.5)) t.push('<span class="tag mres">MAGIC-PROOF</span>');
  if (types.some((x) => ENEMIES[x].boss)) t.push('<span class="tag boss">BOSS</span>');
  return t.join(' ');
};
function updateHUD(force = false) {
  const G = app.G; if (!G || app.demo) return;
  setTxt('hLives', String(G.lives)); setTxt('hGold', String(G.gold));
  setTxt('hWave', app.endless ? String(Math.max(1, G.wave)) : `${Math.max(1, Math.min(G.wave, G.total))}/${G.total}`);
  setHTML('speedBtn', `<i>${UI_ICON.speed(app.speed)}</i>×${app.speed}`);
  const h = G.hero;
  $('heroBtn').classList.toggle('dead', h.dead > 0);
  setTxt('heroLv', String(h.lvl)); setTxt('heroName', cfg.heroName);
  setTxt('heroSub', h.dead > 0 ? `Relighting… ${Math.ceil(h.dead)}s` : `Lv ${h.lvl} · ${HERO.title}`);
  $('heroHp').style.width = (h.dead > 0 ? 0 : h.hp / h.maxhp * 100) + '%';
  const cdp = h.abilityCd > 0 ? h.abilityCd / HERO.ability.cd * 100 : 0;
  $('abCd').style.setProperty('--p', cdp + '%'); $('abilityBtn').classList.toggle('ready', cdp <= 0 && !h.dead);
  // wave box
  const next = S.nextWaveInfo(G), can = S.canCall(G);
  const nb = $('callBtn');
  if (next) {
    const sm = waveSummary(next), types = Object.keys(sm);
    const key = G.wave + ':' + types.join(',');
    if (hudCache.chipsKey !== key || force) {
      hudCache.chipsKey = key;
      $('wbChips').innerHTML = types.map((t) => `<span class="chip" title="${ENEMIES[t].name}"><i>${ENEMY_ICON[t]}</i>${sm[t]}</span>`).join('');
      $('wbTags').innerHTML = TAGS(types);
    }
    setTxt('wbLab', `Next · wave ${G.wave + 1}${app.endless ? '' : ' of ' + G.total}`);
    nb.disabled = !can;
    if (G.state === 'prep') { setTxt('callTxt', G.wave === 0 ? 'Start wave 1' : 'Call wave'); setTxt('callBonus', ''); $('callFill').style.width = '0'; }
    else if (can) { setTxt('callTxt', `Next in ${Math.ceil(G.countdown)}s`); setTxt('callBonus', `+${S.callBonus(G)}`); $('callFill').style.width = (G.countdown / G.o.waveGap * 100) + '%'; }
    else { setTxt('callTxt', 'Wave incoming…'); setTxt('callBonus', ''); $('callFill').style.width = '0'; }
    nb.classList.toggle('pulse', G.state === 'prep');
  } else {
    setTxt('wbLab', 'Final wave'); $('wbChips').innerHTML = ''; $('wbTags').innerHTML = ''; hudCache.chipsKey = '';
    nb.disabled = true; setTxt('callTxt', G.enemies.length ? `${G.enemies.length} shades left` : 'Hold!'); setTxt('callBonus', ''); $('callFill').style.width = '0';
  }
}
// world-anchored rift badges: show which road(s) the next wave uses; tap to call
let riftEls = [];
function buildRifts() {
  riftEls.forEach((r) => r.el.remove()); riftEls = [];
  if (app.demo) return;
  for (const [i, rf] of app.world.rifts.entries()) {
    const el = document.createElement('div'); el.className = 'rift';
    el.innerHTML = `<div class="mini"></div><div class="ring"><div>CALL</div></div>`;
    el.addEventListener('click', (e) => { e.stopPropagation(); doCall(); });
    $('labels').appendChild(el); riftEls.push({ el, rf, path: i, key: '' });
  }
}
function updateRifts() {
  const G = app.G; if (!G) return;
  const next = S.nextWaveInfo(G), can = S.canCall(G) && !app.paused;
  for (const r of riftEls) {
    const groups = next ? next.groups.filter((g) => g.path === r.path) : [];
    const show = can && groups.length > 0;
    r.el.style.display = show ? '' : 'none';
    if (!show) continue;
    const s = toScreen(r.rf.x, 2.8, r.rf.z);
    const x = Math.max(30, Math.min(innerWidth - 30, s.x)), y = Math.max(80, Math.min(innerHeight - 90, s.y));
    r.el.style.transform = `translate(${x}px,${y}px) translate(-50%,-100%)`;
    const key = G.wave + groups.map((g) => g.type + g.count).join();
    if (r.key !== key) {
      r.key = key; const m = {}; for (const g of groups) m[g.type] = (m[g.type] || 0) + g.count;
      r.el.querySelector('.mini').innerHTML = Object.entries(m).map(([t, n]) => `<span><i>${ENEMY_ICON[t]}</i>${n}</span>`).join('');
    }
    const p = G.state === 'prep' ? 100 : (1 - G.countdown / G.o.waveGap) * 100;
    r.el.querySelector('.ring').style.setProperty('--p', p + '%');
    r.el.querySelector('.ring>div').textContent = G.state === 'prep' ? 'START' : `+${S.callBonus(G)}`;
  }
}

// ---------------------------------------------------------------- banners, intro cards, onboarding
function banner(eyebrow, title) {
  const b = $('banner'); $('banE').textContent = eyebrow; $('banT').textContent = title;
  b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
}
let introT = 0;
function checkIntro(dt) {
  const G = app.G; if (!G || app.demo) return;
  if ($('intro').classList.contains('show')) { introT -= dt; if (introT <= 0) $('intro').classList.remove('show'); return; }
  const w = S.nextWaveInfo(G) || (G.wave > 0 ? G.waves[G.wave - 1] : null); if (!w) return;
  for (const g of w.groups) {
    const t = g.type; if (t === 'mite' || progress.seen.includes(t)) continue;
    if (t === 'gloomling' && app.idx === 0 && !progress.tutDone) { progress.seen.push(t); continue; }
    progress.seen.push(t); saveProgress();
    const d = ENEMIES[t];
    $('introIc').innerHTML = ENEMY_ICON[t]; $('introN').textContent = d.name; $('introL').textContent = d.lore; $('introT').textContent = d.tip;
    $('intro').classList.add('show'); introT = 11; sfx.check();
    return;
  }
}
$('introOk').onclick = () => { $('intro').classList.remove('show'); sfx.click(); };
const COACH = [
  { id: 'openPad', text: 'Shades gather at the rift. Tap a glowing <b>build spot</b> beside the road.', at: () => padAnchor(0) },
  { id: 'build', text: 'Tap <b>Lantern Archers</b> once to see it, then tap again to build.', at: () => btnAnchor('archer') },
  { id: 'call', text: 'Build one more tower if you like, then press <b>Start wave 1</b> — or tap the rift.', at: () => elAnchor('callBtn') },
  { id: 'heroMove', text: `${'Captain Wren'} fights too. Tap her portrait, then tap the road to send her.`, at: () => elAnchor('heroBtn'), when: (G) => G.wave >= 1 && G.t > 12 },
  { id: 'upgrade', text: 'Tap one of your towers and <b>upgrade</b> it. Upgrades beat spam.', at: () => towerAnchor(), when: (G) => G.towers.length > 0 && G.gold >= 100 },
  { id: 'ability', text: 'Wren\'s <b>Dawnburst</b> (Q) stuns and scorches a crowd. Try it when shades bunch up.', at: () => elAnchor('abilityBtn'), when: (G) => G.hero.abilityCd <= 0 && G.enemies.length >= 4 },
  { id: 'end', text: 'Call waves early for <b>bonus gold</b>, and use <b>×2 / ×3</b> when you are comfortable. Hold the valley, Keeper!', at: () => elAnchor('speedBtn'), auto: 8 },
];
let coach = null;
function startCoach() { coach = (app.idx === 0 && !progress.tutDone && !app.endless) ? { i: 0, t: 0 } : null; renderCoach(); }
function renderCoach() {
  const c = $('coach');
  if (!coach || app.mode !== 'play') { c.classList.remove('show'); $('pointer').style.display = 'none'; return; }
  const st = COACH[coach.i];
  if (st.when && !st.when(app.G)) { c.classList.remove('show'); $('pointer').style.display = 'none'; return; }
  $('coachN').textContent = String(coach.i + 1); $('coachT').innerHTML = st.text.replace('Captain Wren', cfg.heroName); c.classList.add('show');
}
function coachDone(id) {
  if (!coach) return;
  const st = COACH[coach.i];
  if (st.id === id || (st.id === 'build' && id === 'build')) { coach.i++; coach.t = 0; if (coach.i >= COACH.length) { coach = null; progress.tutDone = true; saveProgress(); } renderCoach(); }
}
$('coachSkip').onclick = () => { coach = null; progress.tutDone = true; saveProgress(); renderCoach(); sfx.click(); };
function padAnchor(i) { const G = app.G; const p = G.map.pads[i]; return toScreen(p.x, 0.3, p.z); }
function btnAnchor(key) { const b = rbtns.find((r) => r.key === key); if (!b) return null; const r = b.el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
function elAnchor(id) { const r = $(id).getBoundingClientRect(); if (!r.width) return null; return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
function towerAnchor() { const t = app.G.towers[0]; return t ? toScreen(t.x, 0.8, t.z) : null; }
function updateCoach(dt) {
  const ptr = $('pointer');
  if (!coach || app.mode !== 'play' || app.paused) { ptr.style.display = 'none'; return; }
  const st = COACH[coach.i];
  if (st.when && !st.when(app.G)) { $('coach').classList.remove('show'); ptr.style.display = 'none'; return; }
  if (!$('coach').classList.contains('show')) renderCoach();
  if (st.id === 'build' && sel.pad < 0) { coach.i = 0; renderCoach(); }
  if (st.auto) { coach.t += dt; if (coach.t > st.auto) coachDone(st.id); }
  const a = st.at(); if (!a) { ptr.style.display = 'none'; return; }
  ptr.style.display = 'block'; ptr.style.left = a.x + 'px'; ptr.style.top = a.y + 'px';
}

// ---------------------------------------------------------------- sim events → UI
function handleEvents(evs) {
  const G = app.G;
  for (const e of evs) {
    if (e.t === 'wave' && !app.demo) {
      const w = G.waves[e.i];
      if (e.boss) banner('The night itself walks', ENEMIES.boss.name); else banner(app.endless ? 'Endless' : `Wave ${e.i + 1} of ${G.total}`, waveTitle(w));
      coachDone('call');
    } else if (e.t === 'leak' && !app.demo) { app.leaks[e.type] = (app.leaks[e.type] || 0) + e.lives; const el = $('stLives'); el.classList.remove('hurt'); void el.offsetWidth; el.classList.add('hurt'); }
    else if (e.t === 'heroLevel' && !app.demo) toast(`${cfg.heroName} reached level ${e.lvl}`);
    else if (e.t === 'heroDown' && !app.demo) toast(`${cfg.heroName}'s lantern went out — relighting at the Hold`);
    else if ((e.t === 'won' || e.t === 'lost') && !app.demo) setTimeout(() => endLevel(e.t === 'won'), 1300);
  }
  if (app.demo && (G.state === 'won' || G.state === 'lost')) loadLevel(app.idx, { demo: true });
}
function waveTitle(w) {
  const sm = waveSummary(w); const top = Object.entries(sm).sort((a, b) => b[1] * ENEMIES[b[0]].threat - a[1] * ENEMIES[a[0]].threat)[0];
  return top ? `${ENEMIES[top[0]].name}${top[1] > 1 ? 's' : ''} approach` : 'Shades approach';
}

// ---------------------------------------------------------------- end of level
function endLevel(won) {
  const G = app.G; if (app.endShown || !G) return; app.endShown = true;
  const L = LEVELS[app.idx];
  store.set(RKEY, null);
  const mins = Math.max(1, Math.round(G.t / 60));
  const stats = `<div><b>${G.lives}/${G.maxLives}</b>lives</div><div><b>${G.stats.kills}</b>shades</div><div><b>${mins} min</b>time</div><div><b>+${G.stats.bonus}</b>early bonus</div>`;
  $('endStats').innerHTML = stats; $('endTip').classList.add('hidden');
  const acts = $('endActs'); acts.innerHTML = '';
  const btn = (label, fn, primary = false) => { const b = document.createElement('button'); b.className = 'btn' + (primary ? ' primary' : ''); b.textContent = label; b.onclick = () => { sfx.click(); $('endM').classList.remove('open'); fn(); }; acts.appendChild(b); };
  const starsEl = $('endStars'); starsEl.innerHTML = '';
  if (app.endless) {
    const waves = Math.max(0, G.wave - 1), best = progress.endless[L.id] || 0;
    if (waves > best) { progress.endless[L.id] = waves; saveProgress(); }
    $('endE').textContent = 'Endless · ' + L.name; $('endT').textContent = `Held for ${waves} waves`;
    $('endTip').innerHTML = waves > best ? 'A new best for this valley.' : `Best: ${best} waves.`; $('endTip').classList.remove('hidden');
    sfx.lose(); btn('Try again', () => loadLevel(app.idx, { endless: true }), true); btn('Valley map', showMap);
    host('levelEnd', { level: L.id, endless: true, waves });
  } else if (won) {
    const st = G.stars; const prev = progress.stars[L.id] || 0;
    if (st > prev) { progress.stars[L.id] = st; saveProgress(); }
    $('endE').textContent = L.name; $('endT').textContent = st === 3 ? 'Flawless watch!' : 'The valley holds!';
    for (let i = 0; i < 3; i++) { const s = document.createElement('i'); s.innerHTML = UI_ICON.star; starsEl.appendChild(s); if (i < st) setTimeout(() => { s.classList.add('on'); sfx.chime(); }, 450 + i * 380); }
    sfx.win(); flash('#ffd27a', 400, 0.3);
    if (st < 3) { $('endTip').innerHTML = `3 stars needs ${Math.ceil(G.maxLives * 0.9)}+ lives left. ${leakTip()}`; $('endTip').classList.remove('hidden'); }
    if (app.idx < LEVELS.length - 1) btn('Next map', () => loadLevel(app.idx + 1), true);
    else { $('endTip').innerHTML = 'Every lantern in the valley burns again. Try Endless or Veteran for a real test.'; $('endTip').classList.remove('hidden'); }
    btn('Replay', () => loadLevel(app.idx)); btn('Valley map', showMap);
    host('levelEnd', { level: L.id, won: true, stars: st });
  } else {
    $('endE').textContent = L.name; $('endT').textContent = 'The lanterns went out';
    $('endTip').innerHTML = leakTip() || 'Mix tower types and upgrade before you spread out.'; $('endTip').classList.remove('hidden');
    sfx.lose(); btn('Retry', () => loadLevel(app.idx), true); btn('Valley map', showMap);
    host('levelEnd', { level: L.id, won: false, wave: G.wave });
  }
  $('endM').classList.add('open'); app.mode = 'end';
}
function leakTip() {
  const top = Object.entries(app.leaks).sort((a, b) => b[1] - a[1])[0];
  if (!top) return '';
  const d = ENEMIES[top[0]];
  return `<b>${d.name}s</b> cost you ${top[1]} lives. ${d.tip}`;
}

// ---------------------------------------------------------------- pause
function togglePause(force) {
  if (app.mode !== 'play') return;
  app.paused = force ?? !app.paused;
  $('pauseM').classList.toggle('open', app.paused);
  if (app.paused) { const G = app.G; $('pauseInfo').textContent = `${LEVELS[app.idx].name} · wave ${Math.max(1, G.wave)}${app.endless ? '' : '/' + G.total} · ${DIFFICULTY[G.o.difficulty].label}`; closeMenus(); }
  sfx.click();
}
$('pResume').onclick = () => togglePause(false);
$('pRestart').onclick = () => { togglePause(false); store.set(RKEY, null); loadLevel(app.idx, { endless: app.endless }); };
$('pSettings').onclick = () => document.getElementById('sd-gear').click();
$('pQuit').onclick = () => { togglePause(false); showMap(); };

// ---------------------------------------------------------------- title + valley map
const NODE = [[9, 66], [21, 40], [31, 70], [45, 34], [55, 64], [62, 26], [76, 58], [89, 36]];
function unlocked(i) { return cfg.unlockAll || i === 0 || (progress.stars[LEVELS[i - 1].id] || 0) > 0; }
let mapSel = 0;
function buildValley() {
  const v = $('valley');
  const pts = NODE.map(([x, y]) => `${x * 10},${y * 5}`).join(' ');
  const deco = [];
  for (let i = 0; i < 26; i++) { const x = (i * 37) % 340 + 10, y = 40 + ((i * 53) % 420); deco.push(`<path d="M${x} ${y} l12 -30 l12 30 z" fill="#16302a" opacity=".7"/>`); }
  for (let i = 0; i < 12; i++) { const x = 380 + (i * 41) % 260, y = 40 + ((i * 71) % 420); deco.push(`<path d="M${x} ${y} l8 -26 l8 26 z" fill="#cfe0ff" opacity=".35"/>`); }
  for (let i = 0; i < 12; i++) { const x = 700 + (i * 47) % 280, y = 50 + ((i * 61) % 400); deco.push(`<rect x="${x}" y="${y - 22}" width="10" height="22" fill="#3a1a1a" opacity=".7"/>`); }
  v.innerHTML = `<svg class="bgsvg" viewBox="0 0 1000 500" preserveAspectRatio="none">${deco.join('')}
    <ellipse cx="500" cy="270" rx="90" ry="60" fill="#a8c8f0" opacity=".25"/><circle cx="880" cy="250" r="70" fill="#ff6a2a" opacity=".12"/>
    <polyline points="${pts}" fill="none" stroke="#ffe7b0" stroke-opacity=".55" stroke-width="5" stroke-dasharray="2 14" stroke-linecap="round"/></svg>
    <div class="biomeLab" style="left:3%">Twilight Forest</div><div class="biomeLab" style="left:40%">Frozen Lake</div><div class="biomeLab" style="right:3%">Ember Ruins</div>`;
  LEVELS.forEach((L, i) => {
    const n = document.createElement('div'); const ok = unlocked(i), st = progress.stars[L.id] || 0;
    n.className = 'node' + (ok ? '' : ' locked') + (i === mapSel ? ' sel' : '');
    n.style.left = NODE[i][0] + '%'; n.style.top = NODE[i][1] + '%';
    n.innerHTML = `${ok ? i + 1 : '🔒'}<div class="nm">${L.name}</div><div class="stars">${[0, 1, 2].map((k) => `<i class="${k < st ? 'on' : ''}">${UI_ICON.star}</i>`).join('')}</div>`;
    n.onclick = () => { if (!ok) { sfx.error(); toast('Earn a star on the previous map first'); return; } mapSel = i; sfx.select(); buildValley(); levelCard(); };
    v.appendChild(n);
  });
  const tot = LEVELS.reduce((a, L) => a + (progress.stars[L.id] || 0), 0);
  $('starTotal').textContent = `${tot}/${LEVELS.length * 3}`;
}
function levelCard() {
  const L = LEVELS[mapSel], st = progress.stars[L.id] || 0;
  $('lcBio').textContent = `${BIOMES[L.biome].name} · map ${mapSel + 1}`; $('lcName').textContent = L.name; $('lcDesc').textContent = L.desc;
  const foes = Object.keys(L.roster).map((t) => ENEMIES[t].name).join(', ');
  $('lcMeta').textContent = `${L.waves} waves · ${L.paths.length} road${L.paths.length > 1 ? 's' : ''} · ${L.pads} build spots · ${st}★${progress.endless[L.id] ? ` · endless best ${progress.endless[L.id]}` : ''} · Foes: ${foes}${L.boss ? ', Eclipse Colossus' : ''}`;
  const endOk = st > 0 || cfg.unlockAll;
  $('lcEndless').disabled = !endOk; $('lcEndless').title = endOk ? '' : 'Win this map to unlock Endless';
  $('diffSeg').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === progress.diff));
}
$('diffSeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; progress.diff = b.dataset.v; saveProgress(); sfx.click(); levelCard(); });
$('lcPlay').onclick = () => { sfx.select(); store.set(RKEY, null); hideMap(); loadLevel(mapSel); };
$('lcEndless').onclick = () => { sfx.select(); store.set(RKEY, null); hideMap(); loadLevel(mapSel, { endless: true }); };
$('mapBack').onclick = () => { sfx.click(); hideMap(); showTitle(); };
function showMap() {
  closeMenus(); $('endM').classList.remove('open'); $('pauseM').classList.remove('open');
  if (!app.demo) loadLevel(Math.min(mapSel, LEVELS.length - 1), { demo: true });
  app.mode = 'map'; mapSel = Math.min(LEVELS.length - 1, Math.max(0, LEVELS.findIndex((L, i) => unlocked(i) && !(progress.stars[L.id] > 0)))); if (mapSel < 0) mapSel = 0;
  buildValley(); levelCard(); $('mapScreen').classList.add('show'); $('hud').classList.add('hidden'); corner.style.display = 'none'; renderCoach();
}
function hideMap() { $('mapScreen').classList.remove('show'); corner.style.display = ''; }
function showTitle() { app.mode = 'title'; menu.show(); refreshContinue(); corner.style.display = 'none'; }
const menu = startMenu({
  title: 'Lantern Hold', subtitle: 'The lanterns are all that keep the twilight valley from the shadows. Build, upgrade and command — and keep them burning.',
  options: [], startLabel: 'Play', onStart: () => showMap(),
});
{
  const card = menu.el.querySelector('.sd-card');
  const row = card.querySelector('#sd-start').parentElement;
  const cont = document.createElement('button'); cont.className = 'sd-btn'; cont.id = 'sd-continue'; cont.textContent = 'Continue';
  row.prepend(cont);
  cont.onclick = () => { const r = store.get(RKEY); if (!r) return; sfx.select(); menu.hide(); corner.style.display = ''; try { loadLevel(LEVELS.findIndex((L) => L.id === r.snap.level), { snap: r.snap, endless: r.endless }); } catch (err) { console.warn(err); store.set(RKEY, null); showMap(); } };
  const foot = document.createElement('div'); foot.className = 'credits'; foot.textContent = '8 maps · 3 biomes · 5 towers with branching upgrades · endless mode. Mouse, touch or keyboard.';
  card.appendChild(foot);
}
function refreshContinue() { const r = store.get(RKEY); const b = $('sd-continue'); b.style.display = r ? '' : 'none'; if (r) b.textContent = `Continue · ${LEVELS.find((L) => L.id === r.snap.level)?.name} w${r.snap.wave + 1}`; }

// ---------------------------------------------------------------- live remix
function applyLive(next) {
  const skyChanged = next.sky !== cfg.sky;
  cfg = next;
  document.documentElement.style.setProperty('--acc', cfg.colors.accent);
  materials().lampTint.value.set(cfg.lanternColor);
  if (app.world) { app.world.flowCol.value.set(cfg.colors.accent); if (skyChanged) { app.world.setSky(cfg.sky); app.worldKey = LEVELS[app.idx].id + ':' + cfg.sky; } }
  updateHUD(true);
}
applyLive(cfg);
addEventListener('sd-settings', () => view.setColorblind(settings.colorblind));
view.setColorblind(settings.colorblind);

// ---------------------------------------------------------------- probe + test hooks
const P = probe(renderer, { dataReady: false, counts: {} });
P.game = {
  state: () => { const G = app.G; return G && { mode: app.mode, level: G.L.id, idx: app.idx, endless: app.endless, state: G.state, wave: G.wave, total: G.total, gold: G.gold, lives: G.lives, enemies: G.enemies.length, towers: G.towers.map((t) => ({ id: t.id, pad: t.pad, type: t.type, tier: t.tier, branch: t.branch })), hero: { x: G.hero.x, z: G.hero.z, lvl: G.hero.lvl, dead: G.hero.dead }, countdown: G.countdown, speed: app.speed, t: G.t, stars: G.stars, paused: app.paused }; },
  start: (idx = 0, o = {}) => { menu.hide(); hideMap(); corner.style.display = ''; if (o.tutorial === false) { progress.tutDone = true; } loadLevel(idx, o); return true; },
  sim: (sec) => { const G = app.G; const n = Math.round(sec / S.DT); for (let i = 0; i < n && G.state !== 'won' && G.state !== 'lost'; i++) { app.bot?.tick(S.DT); S.step(G); if (G.events.length > 400) { handleEvents(G.events.filter((e) => e.t === 'won' || e.t === 'lost' || e.t === 'leak')); G.events.length = 0; } } handleEvents(G.events.filter((e) => e.t !== 'wave')); G.events.length = 0; view.attach(G); return G.state; },
  build: (pad, type) => S.build(app.G, pad, type).ok,
  upgrade: (id, b) => S.upgrade(app.G, id, b).ok,
  sell: (id) => S.sell(app.G, id).ok,
  callWave: () => S.callWave(app.G),
  moveHero: (x, z) => S.moveHero(app.G, x, z),
  ability: () => S.heroAbility(app.G),
  gold: (n) => { app.G.gold = n; return n; },
  autoplay: (on = true) => { app.autoplay = on; app.bot = on ? makeBot(app.G, 'smart') : null; return on; },
  speed: (n) => { app.speed = n; return n; },
  openPad: (i) => { openPad(i); return true; }, pick: (k) => { clickPick(k); return sel.pick; }, closeMenus: () => closeMenus(),
  selectHero: () => selectHero(true),
  pads: () => app.G.map.pads.map((p, i) => ({ i, ...toScreen(p.x, 0.5, p.z), tower: app.G.padTower[i] })),
  view: (zoom = 1, tx = 0, tz = 0.4) => { camS.zoom = zoom; camS.tx = tx; camS.tz = tz; clampPan(); return true; },
  showMap: () => { menu.hide(); showMap(); return true; }, showTitle: () => { hideMap(); showTitle(); return true; },
  pause: (on = true) => togglePause(on),
  end: (won = true, stars = 3) => { const G = app.G; G.state = won ? 'won' : 'lost'; G.stars = stars; if (won) G.lives = Math.ceil(G.maxLives * [0, 0.3, 0.6, 1][stars]); else app.leaks = { brute: 6, moth: 4 }; endLevel(won); return true; },
  progress: (p) => { if (p) { Object.assign(progress, p); saveProgress(); } return progress; },
  banner: (a, b) => banner(a, b),
};

// ---------------------------------------------------------------- loop
bootBar(0.85);
loadLevel(0, { demo: true });
refreshContinue();
if (Q.has('autostart')) { menu.hide(); corner.style.display = ''; progress.tutDone = progress.tutDone || Q.has('notut'); loadLevel(+(Q.get('level') || 0)); }
startLoop(renderer, (dt, t) => {
  updateTweens(dt);
  const G = app.G;
  if (G) {
    const run = app.demo ? (app.mode === 'title' || app.mode === 'map') : (app.mode === 'play' && !app.paused);
    if (run) {
      app.acc += dt * (app.demo ? 1 : app.speed);
      let n = 0; while (app.acc >= S.DT && n < 12) { app.bot?.tick(S.DT); S.step(G); app.acc -= S.DT; n++; }
      if (n >= 12) app.acc = 0;
    }
    view.consume(G.events); handleEvents(G.events); G.events.length = 0;
    view.syncTowers(dt, t); view.sync(Math.min(1, app.acc / S.DT), dt, t, sel);
    app.world.update(t, dt, camera);
    if (!app.demo) {
      updateHUD(); updateRifts(); positionMenus(); updateCoach(dt); checkIntro(dt);
      for (let i = 0; i < G.map.pads.length; i++) { const v = G.padTower[i] ? 0 : (G.gold >= 70 ? 1 : 0.35) * (sel.pad === i ? 1.6 : 1); if (app.world.pads.state.array[i] !== v) app.world.setPad(i, v); }
      if (sel.heroSel) view.showRange(G.hero.x, G.hero.z, HERO.range);
      if ((G.state === 'play' || G.state === 'prep') && S.canSnapshot(G) && G.wave !== app.lastSave && G.wave > 0) { app.lastSave = G.wave; store.set(RKEY, { snap: S.snapshot(G), endless: app.endless, t: Date.now() }); }
      // keyboard pan
      const kx = (keysDown.has('KeyD') || keysDown.has('ArrowRight') ? 1 : 0) - (keysDown.has('KeyA') || keysDown.has('ArrowLeft') ? 1 : 0);
      const ky = (keysDown.has('KeyS') || keysDown.has('ArrowDown') ? 1 : 0) - (keysDown.has('KeyW') || keysDown.has('ArrowUp') ? 1 : 0);
      if ((kx || ky) && camS.zoom < 1) panBy(-kx * dt * 500, -ky * dt * 500);
    } else for (let i = 0; i < G.map.pads.length; i++) if (app.world.pads.state.array[i] !== 0) app.world.setPad(i, 0);
  }
  camS.sway = app.demo && !settings.reducedMotion ? Math.sin(t * 0.07) * 0.22 : 0;
  const breathe = settings.reducedMotion ? 0 : Math.sin(t * 0.23) * 0.006;
  camS.polar += breathe; placeCamera(camS.fit * camS.zoom); camS.polar -= breathe;
  applyShake(camera, dt);
  P.counts = { enemies: G?.enemies.length || 0, towers: G?.towers.length || 0, projectiles: G?.projectiles.length || 0, particles: view.glowP.n + view.smokeP.n, wave: G?.wave || 0 };
}, post.render);
P.dataReady = true;
bootBar(1);
setTimeout(() => { const b = $('boot'); if (b) { b.style.opacity = '0'; setTimeout(() => b.remove(), 500); } }, 150);
