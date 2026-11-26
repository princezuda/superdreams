/* =====================================================================================================================
 SKYHARBOR — owner's world-building checklist (answered before any code)

 WHICH LANDMARKS AM I BUILDING?  Twelve original wonders, all data-driven in landmarks.js (builder + metadata):
   Halo Gate (a ceramic ring held aloft over a pool by field-lines), The Hanging Terraces (five spiral garden decks on a
   living trunk with waterfalls), Starwatch Observatory (white drum, copper dome, a sodium-gold guide laser at night),
   Comet Fountain (a captive comet head over a basin, eight jets reaching for it), The Helix of Vael (60 grown crystals in
   a double helix around a core of light), Lumen Grove Pavilion (giant fungal trees whose gills breathe light),
   Tidal-Glass Cathedral (eight sea-glass fins frozen mid-curl; the forecourt floods with the tide), Cascade
   Amphitheatre (seven tiers facing a waterfall that turns to light), Aurora Needle (three braided legs bleeding a private
   aurora around the crown), Monument of Moons (an obelisk carrying a captive sun with four orbiting sculpted moons),
   Lantern Ziggurat (six tiers ringed with two hundred lanterns; pilgrims release sky-lanterns) and The Skyhook (a carbon
   thread from the ground to orbit with climber cars). Each has an appeal profile per visitor type and trait boosts.

 WHERE IS THIS, WHAT WILL PLAYERS EXPECT?  The Lantern Cluster: a young star cluster where six old civilisations (Orrin
   Prime, Tessaly, Kethra Reach, Nimbus Academy, Varo Deep, Holloway) already trade and travel. You arrive with a colony
   ark and a licence to build a harbour for travellers. Players expect a star map to explore, worlds that each feel
   different under foot, a city that lights up at night, and the 4X "wonder" moment when something enormous is finished.

 FICTIONAL OR REAL?  Fully fictional — names, worlds, peoples and architecture are invented; no real places or IP.

 PRESENT DAY OR NOT?  Far future, but cosy rather than militaristic: a peaceful age of leisure travel. The tech is soft
   sci-fi (field-lines, hover cars, orbital elevators) so the fantasy is "what would you build for people to visit?".

 DOES IT LOOP THROUGH TIME?  Yes, three nested loops. (1) Day/night: every in-game day (~96 s at 1×) the sky runs dawn →
   day → dusk → night with three-stop gradients and matched haze; windows, lamps, beams and landmark glows switch on and
   each landmark has its own after-dark moment. Planets with a "long nights" trait have nights that genuinely last longer.
   (2) Events: festivals you host (fireworks), meteor showers, aurora storms, eclipses on worlds with a gas giant or twin
   moons, plus gentle disasters (dust storms, solar flares) whose frequency is a remix knob. (3) Eras of your harbour:
   colony → town → tourist city → cluster capital, visible as homes grow taller and spaceports multiply.

 WHAT MAKES THIS WORLD UNIQUE?  The pairing of place and wonder. Every planet is generated with traits (gravity, climate,
   day length, resources, scenic features such as auroras, twin moons, a gas-giant rise, singing dunes, glowing flora,
   great tides) and those traits multiply specific landmarks: an Aurora Needle on a long-night ice world, a Tidal-Glass
   Cathedral on a tidal ocean coast, a Monument of Moons under a ringed gas giant. Visually: every world has its own sky
   palette and a celestial body hanging over the city; experientially, visitors you can actually see — ships arcing in
   from named worlds, crowds around wonders, reviews floating up — make the tourism loop legible within two minutes.
===================================================================================================================== */
import * as THREE from 'three/webgpu';
import {
  createRenderer, createPipeline, autoResize, probe, startLoop, initUI, startMenu, settingsButton, toast, store, sfx, shake, applyShake,
  flash, tween, ease, updateTweens, loadDream, settings, Q, host,
} from '/shared/sd-kit.js';
import * as SIM from './sim.js';
import { GRID, CELL, HALF, cellCenter } from './terrain.js';
import { LANDMARKS, LANDMARK_BY_ID, VISITOR_TYPES } from './landmarks.js';
import { World, SKIES, BIOME } from './world.js';
import { Galaxy } from './galaxy.js';
import * as SH from './shaders.js';
import { makeKit, bake } from './lmkit.js';
import { demoCity, layRoads, blocks, placeLandmarkInBlock } from './autoplan.js';

// ---------------------------------------------------------------- remix config (defaults shape = meta.json remix keys)
const DEFAULTS = { planetType: 'ocean', startMoney: 60000, palette: 'amber', timeSpeed: 1, eventFreq: 1, disasters: 'gentle', unlock: 'progress', difficulty: 'standard', seed: 0, colors: { accent: '#ffaa33' } };
const PALETTES = {
  amber: { windowA: 0xffc87a, windowB: 0xbfe2ff, neon: [0xffb04a, 0x8affd8, 0x4ad8ff] },
  neon: { windowA: 0xff9ae8, windowB: 0x8af0ff, neon: [0xff4ad8, 0x4affe8, 0x7a5aff] },
  jade: { windowA: 0xd8ffb0, windowB: 0x9affe0, neon: [0x5aff9a, 0xffe07a, 0x4ad8c8] },
  rose: { windowA: 0xffb8a0, windowB: 0xffe0f0, neon: [0xff6a8a, 0xffc0d8, 0xffa05a] },
};
let cfg = await loadDream(DEFAULTS, (c) => applyConfig(c, true));
function applyConfig(c, live = false) {
  cfg = c;
  const P = PALETTES[cfg.palette] || PALETTES.amber;
  SH.U.windowA.value.set(P.windowA); SH.U.windowB.value.set(P.windowB);
  document.documentElement.style.setProperty('--acc', cfg.colors?.accent || '#ffaa33');
  SH.U.accent.value.set(cfg.colors?.accent || '#ffaa33');
  if (st) { st.eventFreq = +cfg.eventFreq; st.disasters = cfg.disasters; st.unlockMode = cfg.unlock === 'all' ? 'all' : 'progress'; st.unlocked = SIM.unlockedFor(st); }
  if (live && world) { world.palette = P; for (const b of world.planet.buildings) b._parts = null; world.rebuildCity(); }
  if (live) refreshPanels();
}
const palette = () => PALETTES[cfg.palette] || PALETTES.amber;

// ---------------------------------------------------------------- renderer + probe
initUI();
const renderer = await createRenderer({ toneMapping: 'aces', exposure: 1.0 });
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.5, 7000);
const P = probe(renderer, { counts: {} });
const loading = document.getElementById('loading'), loadBar = document.getElementById('loadBar'), loadT = document.getElementById('loadT');
const setLoad = (t, k) => { loading.classList.add('show'); loadT.textContent = t; loadBar.style.width = Math.round(k * 100) + '%'; };
const endLoad = () => loading.classList.remove('show');

let st = null, mode = 'menu', world = null, galaxy = null, gallery = null, pipes = {}, selected = null, tool = 'inspect', overlay = null;
let speed = 1, simAcc = 0, lastHour = -1, paused = false;
let ui = { tutorial: 0, tutorialDone: false, tourismOpened: false };
const HOUR_SEC = () => 4 / Math.max(0.1, +cfg.timeSpeed || 1);
applyConfig(cfg);

// ---------------------------------------------------------------- icons (inline SVG, stroke = currentColor)
const I = {
  inspect: '<path d="M5 3l14 8-6 1.5L10 19z"/>', road: '<path d="M7 3L4 21M17 3l3 18M12 4v3M12 10v3M12 16v3"/>', bulldoze: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
  housing: '<path d="M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6"/>', shop: '<path d="M4 9h16l-1-5H5zM5 9v11h14V9M9 20v-5h6v5M4 9c0 2 4 2 4 0 0 2 4 2 4 0 0 2 4 2 4 0 0 2 4 2 4 0"/>',
  hotel: '<path d="M3 19V8M21 19v-6H3M7 12a2 2 0 100-4 2 2 0 000 4zM11 13V9h7a3 3 0 013 3v1"/>', power: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  water: '<path d="M12 3c4 5 6 8 6 11a6 6 0 01-12 0c0-3 2-6 6-11z"/>', spaceport: '<path d="M12 2c3 3 4 7 4 11l-4 3-4-3c0-4 1-8 4-11zM8 13l-3 4 3 1M16 13l3 4-3 1M10 19l2 3 2-3"/><circle cx="12" cy="9" r="1.5"/>',
  transit: '<rect x="6" y="3" width="12" height="13" rx="3"/><path d="M6 11h12M9 20l-2 2M15 20l2 2M9 16v2M15 16v2"/>', park: '<path d="M12 21v-6M12 15c-5 0-6-4-4-7 0-3 3-5 4-5s4 2 4 5c2 3 1 7-4 7z"/>',
  landmark: '<path d="M12 2l2.6 6.3L21 9l-5 4.4L17.5 20 12 16.6 6.5 20 8 13.4 3 9l6.4-.7z"/>', overlay: '<path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', galaxy: '<ellipse cx="12" cy="12" rx="10" ry="4"/><circle cx="12" cy="12" r="2.5"/><path d="M5 6l1 1M18 17l1 1"/>',
  goals: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>', tourism: '<path d="M3 17c4-8 14-8 18 0M7 13l-2-4M17 13l2-4M12 11V5"/><circle cx="12" cy="17" r="2"/>', gallery: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 16l5-5 4 4 3-3 6 6"/><circle cx="15.5" cy="8.5" r="1.5"/>',
  pause: '<path d="M8 5v14M16 5v14"/>', play: '<path d="M7 4l12 8-12 8z"/>', ff: '<path d="M4 5l8 7-8 7zM12 5l8 7-8 7z"/>', fff: '<path d="M2 6l6 6-6 6zM9 6l6 6-6 6zM16 6l6 6-6 6z"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>', menu: '<path d="M4 7h16M4 12h16M4 17h16"/>', fest: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l3 3M15 15l3 3M6 18l3-3M15 9l3-3"/>', rot: '<path d="M20 12a8 8 0 11-3-6.3M20 4v5h-5"/>',
};
const svg = (k) => `<svg viewBox="0 0 24 24">${I[k] || ''}</svg>`;
const stars = (r) => { const f = Math.floor(r), h = r - f >= 0.5; return '★'.repeat(f) + (h ? '⯪' : '') + '☆'.repeat(5 - f - (h ? 1 : 0)); };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------------------------------------------------------------- HUD DOM
document.body.insertAdjacentHTML('beforeend', `
<div class="hud" id="topbar">
  <div class="panel" id="planetChip"><b id="pName">Lantern Cluster</b><span id="pType">Galaxy</span></div>
  <div class="panel" id="stats">
    <div class="stat" id="sMoney" title="Credits"><small>Credits</small><b>—</b></div>
    <div class="stat" id="sPop" title="Residents / jobs"><small>Residents</small><b>—</b></div>
    <div class="stat" id="sVis" title="Visitors yesterday"><small>Visitors/day</small><b>—</b></div>
    <div class="stat" id="sRate" title="Average landmark rating"><small>Rating</small><b>—</b></div>
    <div class="stat" id="sHappy" title="Happiness"><small>Happy</small><b>—</b></div>
  </div>
  <div class="panel" id="clock"><button class="ib" data-sp="0" aria-label="Pause">${svg('pause')}</button><button class="ib on" data-sp="1" aria-label="Normal speed">${svg('play')}</button><button class="ib" data-sp="2" aria-label="Fast">${svg('ff')}</button><button class="ib" data-sp="4" aria-label="Fastest">${svg('fff')}</button><span class="t" id="clockT">Day 1 07:00</span></div>
</div>
<div id="navbtns"><button class="ib" id="bGalaxy" title="Galaxy map (M)" aria-label="Galaxy map">${svg('galaxy')}</button><button class="ib" id="bTour" title="Tourism (T)" aria-label="Tourism">${svg('tourism')}</button><button class="ib" id="bGoals" title="Goals (G)" aria-label="Goals">${svg('goals')}</button><button class="ib" id="bMenu" title="Menu (Esc)" aria-label="Menu">${svg('menu')}</button></div>
<div class="hud panel" id="toolbar"></div>
<div class="hud panel" id="side"><button class="ib x" id="sideX" aria-label="Close">${svg('close')}</button><div id="sideBody"></div></div>
<div class="hud panel" id="sysCard"><button class="ib x" id="sysX" style="position:absolute;top:8px;right:8px" aria-label="Close">${svg('close')}</button><div id="sysBody"></div></div>
<div class="hud panel" id="hint"></div>
<div class="panel" id="coach"><div class="step" id="coachN">1</div><div id="coachT"></div><button class="skip" id="coachSkip">skip tutorial</button></div>
<div id="wonder"><div class="card"><div class="eyebrow" id="wE">Wonder complete</div><h1 id="wT"></h1><p id="wP"></p></div></div>
<div id="gallery"><div class="gtitle">Landmark gallery</div><div class="panel gcard" id="gCard"></div><div class="gnav"><button class="btn" id="gPrev">◀</button><button class="btn" id="gTod">Night</button><button class="btn" id="gNext">▶</button><button class="btn primary" id="gBack">Back</button></div></div>
<div class="hud panel" id="eyebar"><button class="btn" id="eyeBack">◀ Back</button><button class="btn" id="eyeStroll">Stroll: on</button><button class="btn" id="eyeFly">Fly up</button></div>
<div class="modal" id="pauseM"><div class="sd-card"><h1 style="font-size:30px">Paused</h1><div class="sd-row" style="flex-direction:column;align-items:stretch"><button class="btn primary" id="pResume">Resume</button><button class="btn" id="pSettings">Settings</button><button class="btn" id="pGallery">Landmark gallery</button><button class="btn" id="pSave">Save</button><button class="btn" id="pQuit">Save &amp; quit to menu</button></div><p style="font-size:12px;opacity:.6;margin-top:12px;text-align:center">Mouse: left-drag pan · right-drag rotate · wheel zoom · Keys: WASD pan · Q/E rotate · R/F tilt · 1–9 tools · L landmarks · Space pause</p></div></div>
<div class="modal" id="goalsM"><div class="sd-card" style="max-width:min(560px,94vw)"><h1 style="font-size:28px">Goals</h1><div id="goalsBody"></div><div class="sd-row"><button class="btn primary" id="goalsX">Close</button></div></div></div>
<div class="modal" id="lmM"><div class="sd-card" style="max-width:min(640px,96vw)"><h1 style="font-size:28px">Landmarks</h1><p style="text-align:center;font-size:13px">Pick a wonder, then click a spot beside a road. <b>R</b> rotates. Trait boosts for this world are shown in green.</p><div class="lmgrid" id="lmGrid"></div><div class="sd-row"><button class="btn" id="lmX">Close</button></div></div></div>
`);
settingsButton();
const $ = (id) => document.getElementById(id);
const labels = $('labels');

// toolbar
const TOOLS = [['inspect', 'Select', 'inspect', 'Esc'], ['road', 'Road', 'road', '1'], ['bulldoze', 'Remove', 'bulldoze', 'X'], ['sep'], ['housing', 'Homes', 'housing', '2'], ['shop', 'Shops', 'shop', '3'], ['hotel', 'Hotel', 'hotel', '4'], ['power', 'Power', 'power', '5'], ['water', 'Water', 'water', '6'], ['spaceport', 'Port', 'spaceport', '7'], ['transit', 'Transit', 'transit', '8'], ['park', 'Park', 'park', '9'], ['sep'], ['landmarks', 'Wonders', 'landmark', 'L'], ['overlay', 'Overlay', 'overlay', 'O'], ['eye', 'Visit', 'eye', 'V']];
$('toolbar').innerHTML = TOOLS.map(([id, label, icon, key]) => id === 'sep' ? '<div class="tool sep"></div>' : `<button class="tool" data-tool="${id}" title="${label} (${key})">${svg(icon)}<span>${label}</span>${SIM.BUILDINGS[id] ? `<span class="c" data-cost="${id}"></span>` : ''}<span class="k">${key}</span></button>`).join('');
$('toolbar').addEventListener('click', (e) => { const b = e.target.closest('[data-tool]'); if (!b) return; sfx.click(); pickTool(b.dataset.tool); });
$('clock').addEventListener('click', (e) => { const b = e.target.closest('[data-sp]'); if (!b) return; sfx.click(); setSpeed(+b.dataset.sp); });
$('bGalaxy').onclick = () => { sfx.whoosh(); mode === 'galaxy' ? (st.active && visit(st.active)) : goGalaxy(); };
$('bTour').onclick = () => { sfx.click(); showTourism(); };
$('bGoals').onclick = () => { sfx.click(); showGoals(); };
$('bMenu').onclick = () => { sfx.click(); openPause(); };
$('sideX').onclick = () => { closeSide(); };
$('sysX').onclick = () => { $('sysCard').classList.remove('open'); galaxy?.select(null); };
$('coachSkip').onclick = () => { ui.tutorialDone = true; ui.coachKey = -1; $('coach').classList.remove('show'); clearPulse(); };
$('goalsX').onclick = () => $('goalsM').classList.remove('open');
$('lmX').onclick = () => $('lmM').classList.remove('open');
$('pResume').onclick = () => closePause();
$('pSettings').onclick = () => { document.getElementById('sd-gear').click(); };
$('pGallery').onclick = () => { closePause(); openGallery(0); };
$('pSave').onclick = () => { save(); toast('Saved'); };
$('pQuit').onclick = () => { save(); location.reload(); };
for (const id of ['pauseM', 'goalsM', 'lmM']) $(id).addEventListener('click', (e) => { if (e.target.id === id) $(id).classList.remove('open'); });

function setSpeed(s) { speed = s; paused = s === 0; document.querySelectorAll('#clock [data-sp]').forEach((b) => b.classList.toggle('on', +b.dataset.sp === s)); }
function openPause() { if (mode === 'menu') return; $('pauseM').classList.add('open'); ui.prevSpeed = speed; setSpeed(0); }
function closePause() { $('pauseM').classList.remove('open'); setSpeed(ui.prevSpeed || 1); }
function closeSide() { $('side').classList.remove('open'); selected = null; world?.select(null); ui.sideKind = null; }
function showHud(on) { for (const id of ['topbar', 'navbtns', 'toolbar']) $(id).style.display = on ? '' : 'none'; }
function setToolbarVisible(on) { $('toolbar').style.display = on ? '' : 'none'; }
function pulseEl(sel) { clearPulse(); const el = typeof sel === 'string' ? document.querySelector(sel) : sel; el?.classList.add('pulse'); }
function clearPulse() { document.querySelectorAll('.pulse').forEach((e) => e.classList.remove('pulse')); }

// ---------------------------------------------------------------- start menu
const saved = store.get('skyharbor-save');
const menu = startMenu({
  title: 'Skyharbor', subtitle: 'Discover worlds. Build harbour cities. Raise wonders the whole cluster travels to see.',
  options: [
    { key: 'mode', label: 'Mode', value: 'scenario', choices: [{ v: 'scenario', label: 'Brightest Harbour' }, { v: 'sandbox', label: 'Sandbox' }] },
    { key: 'difficulty', label: 'Pace', value: cfg.difficulty, choices: [{ v: 'relaxed', label: 'Relaxed' }, { v: 'standard', label: 'Standard' }, { v: 'tycoon', label: 'Tycoon' }] },
    { key: 'planet', label: 'First world', value: cfg.planetType, choices: SIM.TYPE_IDS.map((t) => ({ v: t, label: SIM.PLANET_TYPES[t].name.replace(' world', '').replace('Gas-giant moon', 'Moon') })) },
  ],
  startLabel: 'New harbour',
  onStart: (v) => newGame({ mode: v.mode, difficulty: v.difficulty, planetType: v.planet }),
});
{
  const row = menu.el.querySelector('#sd-start').parentElement;
  if (saved?.st) row.insertAdjacentHTML('afterbegin', `<button class="sd-btn primary" id="sd-continue">Continue (day ${saved.st.day})</button>`);
  row.insertAdjacentHTML('beforeend', '<button class="sd-btn" id="sd-gallery">Landmark gallery</button>');
  menu.el.querySelector('.sd-card').insertAdjacentHTML('beforeend', '<p style="font-size:12px;margin:14px 0 0;opacity:.6">Scenario: make your first world, Skyharbor, the most-visited in the Lantern Cluster. Saves automatically.</p>');
  $('sd-continue')?.addEventListener('click', () => { menu.hide(); sfx.select(); loadGame(saved); });
  $('sd-gallery').addEventListener('click', () => { menu.hide(); sfx.select(); openGallery(0, true); });
}
showHud(false);

// ---------------------------------------------------------------- game lifecycle
function newGame({ mode: m = 'scenario', difficulty = cfg.difficulty, planetType = cfg.planetType } = {}) {
  const seed = +cfg.seed || ((Date.now() % 100000) + 1);
  st = SIM.newGame({ seed, planetType, money: +cfg.startMoney || 60000, mode: m, difficulty, unlock: cfg.unlock === 'all' ? 'all' : 'progress' });
  st.eventFreq = +cfg.eventFreq; st.disasters = cfg.disasters;
  if (m === 'sandbox') { st.unlockMode = 'all'; st.unlocked = SIM.unlockedFor(st); ui.tutorialDone = true; }
  ui = { tutorial: 0, tutorialDone: m === 'sandbox', tourismOpened: false };
  host('start', { mode: m });
  goGalaxy(true);
}
function loadGame(s) {
  st = s.st; ui = Object.assign({ tutorial: 0, tutorialDone: true }, s.ui || {});
  st.unlocked = SIM.unlockedFor(st);
  for (const id of st.settled) SIM.computeCity(st, st.planets[id]);
  if (st.active) visit(st.active, true); else goGalaxy();
}
function save() {
  if (!st) return;
  try { store.set('skyharbor-save', JSON.parse(JSON.stringify({ st, ui }, (k, v) => (k[0] === '_' ? undefined : v)))); } catch (e) { console.warn('save failed', e); }
}
addEventListener('visibilitychange', () => { if (document.hidden) save(); });
addEventListener('pagehide', save);

// ---------------------------------------------------------------- camera controllers
class OrbitCam {
  constructor({ bounds = 90, minD = 14, maxD = 260, minP = 0.22, maxP = 1.45 } = {}) {
    Object.assign(this, { bounds, minD, maxD, minP, maxP });
    this.c = { x: 0, y: 0, z: 0, yaw: 0.7, pitch: 0.95, dist: 120, yo: 0 }; this.g = { ...this.c };
    this.target = new THREE.Vector3(); this.ground = () => 0;
  }
  set(o, snap = false) { Object.assign(this.g, o); if (snap) { Object.assign(this.c, this.g); this.c.y = this.ground(this.c.x, this.c.z) + (this.c.yo || 0); } }
  clamp() { const g = this.g; g.x = Math.max(-this.bounds, Math.min(this.bounds, g.x)); g.z = Math.max(-this.bounds, Math.min(this.bounds, g.z)); g.dist = Math.max(this.minD, Math.min(this.maxD, g.dist)); g.pitch = Math.max(this.minP, Math.min(this.maxP, g.pitch)); }
  pan(dx, dy) { const s = this.c.dist * 0.0019, cy = Math.cos(this.c.yaw), sy = Math.sin(this.c.yaw); this.g.x -= (cy * dx - sy * dy) * s; this.g.z -= (-sy * dx - cy * dy) * s; this.clamp(); }
  panWorld(fx, fz) { const cy = Math.cos(this.c.yaw), sy = Math.sin(this.c.yaw); this.g.x += cy * fx - sy * fz; this.g.z += -sy * fx - cy * fz; this.clamp(); }
  update(dt, cam) {
    const k = 1 - Math.exp(-dt * 7), c = this.c, g = this.g;
    for (const key of ['x', 'y', 'z', 'yaw', 'pitch', 'dist', 'yo']) c[key] += (g[key] - c[key]) * k;
    const gy = this.ground(c.x, c.z) + c.yo; c.y += (gy - c.y) * k;
    this.target.set(c.x, c.y, c.z);
    cam.position.set(c.x + Math.sin(c.yaw) * Math.cos(c.pitch) * c.dist, c.y + Math.sin(c.pitch) * c.dist, c.z + Math.cos(c.yaw) * Math.cos(c.pitch) * c.dist);
    const floor = this.ground(cam.position.x, cam.position.z) + 2.5; if (cam.position.y < floor) cam.position.y = floor;
    cam.lookAt(this.target);
    cam.userData.target = this.target; cam.userData.dist = c.dist;
  }
}
const pcam = new OrbitCam({ bounds: 100 });
const gcam = new OrbitCam({ bounds: 160, minD: 18, maxD: 420, minP: -0.6, maxP: 1.45 });
gcam.set({ x: 0, y: 0, z: 0, yaw: 0.4, pitch: 0.75, dist: 240 }, true);
const lcam = new OrbitCam({ bounds: 10, minD: 20, maxD: 220, minP: 0.02, maxP: 1.3 });
let cine = null; // wonder cinematic
// live galaxy behind the menu (a throwaway cluster; replaced when a real game starts)
galaxy = new Galaxy(renderer, SIM.newGame({ seed: 4242 }));
gcam.set({ x: 0, y: 0, z: 0, yaw: 0.2, pitch: 0.55, dist: 300 }, true);
ensurePipe('galaxy', galaxy.scene);

// ---------------------------------------------------------------- galaxy mode
function ensurePipe(key, scene) { if (!pipes[key] || pipes[key].scene !== scene) { pipes[key] = Object.assign(createPipeline(renderer, scene, camera, key === 'galaxy' ? undefined : { bloom: { strength: 0.42, radius: 0.38, threshold: 0.9 } }), { scene }); } return pipes[key]; }
function goGalaxy(intro = false) {
  closeSide(); $('eyebar').classList.remove('show');
  if (!galaxy || galaxy.st !== st) { setLoad('Charting the Lantern Cluster', 0.4); galaxy = new Galaxy(renderer, st); }
  galaxy.st = st; galaxy.sync();
  mode = 'galaxy'; showHud(true); setToolbarVisible(false);
  $('pName').textContent = 'Lantern Cluster'; $('pType').textContent = `${st.settled.length} world${st.settled.length === 1 ? '' : 's'} settled`;
  ensurePipe('galaxy', galaxy.scene);
  if (intro) { gcam.set({ x: 0, y: 0, z: 0, yaw: 0.9, pitch: 1.2, dist: 400 }, true); gcam.set({ x: 10, y: 0, z: 8, yaw: 0.5, pitch: 0.62, dist: 150 }); sfx.whoosh(); }
  else if (st.active) { const s = st.systems.find((q) => q.id === st.active); gcam.set({ x: s.pos[0], y: s.pos[1], z: s.pos[2], dist: 120, pitch: 0.7 }); }
  setTimeout(endLoad, 50);
  $('hint').innerHTML = 'Click a world to inspect it · drag to look around · wheel/pinch to zoom'; $('hint').classList.add('show');
  host('level', { name: 'galaxy' });
}
function sysTraitsHTML(sys) {
  const T = sys.traits, keys = SIM.traitKeys(T);
  const chips = [...keys].map((k) => `<span class="chip">${esc(SIM.TRAIT_NAMES[k] || k)}</span>`).join('');
  const lms = LANDMARKS.map((l) => ({ l, b: SIM.landmarkBoost(l, keys) })).filter((x) => x.b > 1.01).sort((a, b) => b.b - a.b).slice(0, 4);
  const bad = LANDMARKS.map((l) => ({ l, b: SIM.landmarkBoost(l, keys) })).filter((x) => x.b < 0.99).slice(0, 2);
  return `<div class="row"><span>Gravity</span><b>${T.gravity} g ${T.gravityClass !== 'standard' ? '(' + T.gravityClass + ')' : ''}</b></div>
    <div class="row"><span>Climate</span><b>${esc(SIM.TRAIT_NAMES[T.climate])}</b></div><div class="row"><span>Nights</span><b>${T.day === 'long' ? 'Long' : T.day === 'short' ? 'Short' : 'Standard'}</b></div>
    <h3>Traits</h3><div>${chips}</div>
    <h3>Tourists will love here</h3>${lms.map((x) => `<span class="chip boost">${esc(x.l.name)} +${Math.round((x.b - 1) * 100)}%</span>`).join('') || '<p>No special boosts — a blank canvas.</p>'}${bad.map((x) => `<span class="chip nerf">${esc(x.l.name)} −${Math.round((1 - x.b) * 100)}%</span>`).join('')}`;
}
function showSystem(id) {
  sfx.select();
  galaxy.select(id);
  const src = SIM.SOURCE_WORLDS.find((w) => w.id === id);
  let h = '';
  if (src) {
    h = `<h2>${esc(src.name)}</h2><p style="color:#ffd27a;font-size:12px;letter-spacing:.12em;text-transform:uppercase">Established civilisation · visitor source</p>
      <p>Sends about <b>${SIM.fmtN(src.demand * 1.25 * (1 + (st.day - 1) * 0.028))}</b> travellers a day across the cluster.</p><h3>Who travels from here</h3>
      ${VISITOR_TYPES.map((v) => `<div class="vt"><span style="color:${v.color}">${v.name}</span><div class="bar"><i style="width:${(src.mix[v.id] || 0) * 100}%;background:${v.color}"></i></div><span>${Math.round((src.mix[v.id] || 0) * 100)}%</span></div>`).join('')}
      ${src.dest ? `<h3>Rival destination</h3><p>${esc(src.dest.name)} — <b>${SIM.fmtN(st.rivals.find((r) => r.id === src.id)?.visitors || 0)}</b> visitors/day.</p>` : ''}
      <p style="font-size:12px;color:var(--dim)">Distance matters: closer harbours win more of this world's travellers.</p>`;
  } else {
    const sys = st.systems.find((s) => s.id === id), T = SIM.PLANET_TYPES[sys.type];
    const scanning = st.scans.find((s) => s.sys === id);
    const inRange = SIM.inScanRange(st, sys), settledP = st.planets[id];
    h = `<h2>${esc(settledP ? settledP.name : sys.scanned ? sys.name : 'Unknown world')}</h2><p style="color:#9ad8ff;font-size:12px;letter-spacing:.12em;text-transform:uppercase">${sys.scanned ? esc(T.name) : 'Unscanned signal'}</p>`;
    if (sys.scanned) h += `<p>${esc(T.blurb)}</p>` + sysTraitsHTML(sys);
    else h += `<p>${inRange ? 'Within scanner range. A scan reveals the planet type and the traits tourists care about.' : 'Out of scanner range — settle closer worlds to reach it.'}</p>`;
    h += '<div class="btns">';
    if (settledP) h += `<button class="btn primary" id="cVisit">Descend to ${esc(settledP.name)}</button>`;
    else if (sys.scanned) h += `<button class="btn primary" id="cSettle" ${st.money < SIM.settleCost(st) ? 'disabled' : ''}>Settle — ${SIM.settleCost(st) ? SIM.fmt(SIM.settleCost(st)) : 'free'}</button>`;
    else if (scanning) h += `<button class="btn" disabled>Scanning… ${Math.ceil(scanning.hours)} h</button>`;
    else h += `<button class="btn primary" id="cScan" ${!inRange ? 'disabled' : ''}>Scan — ${st.settled.length ? SIM.fmt(SIM.SCAN_COST) + ' · 6 h' : 'free'}</button>`;
    h += '</div>';
    if (sys.scanned && !settledP && st.settled.length) h += `<p style="font-size:12px;color:var(--dim)">Each settled world brings its own city, traits and visitors — and widens your scanner range.</p>`;
  }
  $('sysBody').innerHTML = h; $('sysCard').classList.add('open');
  $('cScan')?.addEventListener('click', () => scan(id));
  $('cSettle')?.addEventListener('click', () => settleSys(id));
  $('cVisit')?.addEventListener('click', () => visit(id));
}
function scan(id) {
  const from = st.settled[0] || null; const r = SIM.startScan(st, id);
  if (!r.ok) { sfx.error(); toast(r.reason); return; }
  sfx.zap(); galaxy.scanPulse(from, id); showSystem(id); tut('scanStarted');
  if (!st.settled.length) setSpeed(Math.max(speed, 1));
}
function settleSys(id) {
  const first = !st.settled.length;
  const name = first ? 'Skyharbor' : null;
  const r = SIM.settle(st, id, name); if (!r.ok) { sfx.error(); toast(r.reason); return; }
  sfx.win(); flash('#ffe8b0', 260); toast(first ? 'Skyharbor is founded!' : `${r.planet.name} settled`, 2600);
  SIM.checkMilestones(st); processLog(); galaxy.sync(); tut('settled');
  setTimeout(() => visit(id), 600);
}
function visit(id, snap = false) {
  const p = st.planets[id]; if (!p) return;
  st.active = id; closeSide(); $('sysCard').classList.remove('open'); $('hint').classList.remove('show');
  setLoad(`Descending to ${p.name}`, 0.25);
  requestAnimationFrame(() => setTimeout(() => {
    if (world && world.planet !== p) { world.dispose(); world = null; delete pipes.world; }
    if (!world) world = new World(renderer, p, { palette: palette() });
    world.onLand = (pad) => { if (Math.random() < 0.5) floatText(pad, '+' + SIM.fmt(6 + Math.random() * 30), '#9dffb8'); sfx.move(); };
    setLoad(`Descending to ${p.name}`, 0.8);
    ensurePipe('world', world.scene);
    pcam.ground = (x, z) => Math.max(world.heightAt(x, z), world.terrain.waterLevel);
    const sp = p.buildings.find((b) => b.kind === 'spaceport');
    const cx = sp ? cellCenter(sp.x) + 2 : 0, cz = sp ? cellCenter(sp.z) + 2 : 0;
    pcam.set({ x: cx, z: cz, yaw: 0.65, pitch: 0.82, dist: 95, yo: 0 }, snap);
    if (!snap) { pcam.set({ x: cx, z: cz, yaw: 0.65 + 0.8, pitch: 1.25, dist: 240 }, true); pcam.set({ x: cx, z: cz, yaw: 0.65, pitch: 0.82, dist: 95 }); }
    mode = 'planet'; showHud(true); setToolbarVisible(true);
    $('pName').textContent = p.name; $('pType').textContent = SIM.PLANET_TYPES[p.type].name;
    SIM.computeCity(st, p); refreshCosts(); pickTool('inspect');
    setTimeout(endLoad, 80); sfx.whoosh();
    tut('visit');
    host('level', { name: p.type });
  }, 30));
}

// ---------------------------------------------------------------- tools + placement
function pickTool(t) {
  if (t === 'landmarks') { openLandmarks(); return; }
  if (t === 'overlay') { overlay = overlay === null ? 'access' : overlay === 'access' ? 'transit' : null; applyOverlay(); toast(overlay ? (overlay === 'access' ? 'Overlay: road access from spaceports (red = unreachable)' : 'Overlay: transit coverage') : 'Overlay off'); return; }
  if (t === 'eye') { const l = selected?.lm ? selected : st.planets[st.active]?.landmarks.find((q) => q.built >= 1); if (l) enterEye(l); else { sfx.error(); toast('Build a landmark first — then visit it at eye level'); } return; }
  tool = t; ui.rot = ui.rot || 0;
  document.querySelectorAll('#toolbar [data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === t || (t.startsWith('lm:') && b.dataset.tool === 'landmarks')));
  SH.U.grid.value = t !== 'inspect' ? 1 : 0;
  world?.hideGhost();
  const B = SIM.BUILDINGS[t];
  $('hint').innerHTML = t === 'inspect' ? 'Click anything to inspect it · drag to pan · right-drag to rotate' : t === 'road' ? 'Drag to lay road · roads can bridge water (6× cost)' : t === 'bulldoze' ? 'Click or drag to remove' : t.startsWith('lm:') ? `Place ${esc(LANDMARK_BY_ID[t.slice(3)].name)} beside a road · R rotates · Esc cancels` : `${esc(B?.blurb || '')}`;
  $('hint').classList.add('show');
}
function applyOverlay() { if (!world) return; const p = st.planets[st.active]; world.setOverlay(overlay, overlay === 'access' ? SIM.roadNetwork(p) : null); }
function refreshCosts() { const p = st?.planets[st.active]; document.querySelectorAll('[data-cost]').forEach((e) => { e.textContent = '¤' + SIM.fmtN(SIM.costOf(st, e.dataset.cost, p)); }); }
function openLandmarks() {
  const p = st.planets[st.active], keys = SIM.traitKeys(p.traits);
  $('lmGrid').innerHTML = LANDMARKS.map((l) => {
    const unlocked = st.unlocked.includes(l.id), b = SIM.landmarkBoost(l, keys), cost = SIM.costOf(st, l.id, p);
    const lock = l.unlock.renown != null ? `Unlocks at ${SIM.fmtN(l.unlock.renown)} renown` : l.unlock.milestone ? 'Unlocks: settle three worlds' : '';
    const top = Object.entries(l.appeal).sort((a, c) => c[1] - a[1]).slice(0, 2).map(([k]) => VISITOR_TYPES.find((v) => v.id === k));
    return `<button class="lmc ${unlocked ? '' : 'locked'}" data-lm="${l.id}"><b>${esc(l.name)}</b>${esc(l.kind)} · ${l.footprint}×${l.footprint}<br><span class="p">${SIM.fmt(cost)}</span> · ${l.tier.toFixed(1)}★ base${b > 1.01 ? ` <span class="chip boost">+${Math.round((b - 1) * 100)}% here</span>` : b < 0.99 ? ` <span class="chip nerf">−${Math.round((1 - b) * 100)}% here</span>` : ''}<br><span style="color:var(--dim)">Loved by ${top.map((v) => `<span style="color:${v.color}">${v.name}</span>`).join(', ')}</span>${unlocked ? '' : `<br><span style="color:#ffb46a">${lock}</span>`}</button>`;
  }).join('');
  $('lmM').classList.add('open'); sfx.select();
  $('lmGrid').onclick = (e) => { const b = e.target.closest('[data-lm]'); if (!b) return; if (!st.unlocked.includes(b.dataset.lm)) { sfx.error(); return; } $('lmM').classList.remove('open'); pickTool('lm:' + b.dataset.lm); sfx.select(); tut('pickedLandmark'); };
}
function kindOf(t) { return t.startsWith('lm:') ? t.slice(3) : t; }
function anchorFor(kind, cx, cz) { const s = SIM.sizeOf(kind); return [cx - Math.floor((s - 1) / 2), cz - Math.floor((s - 1) / 2)]; }
function tryPlace(kind, x, z, { quiet = false } = {}) {
  const p = st.planets[st.active];
  if (kind !== 'road') {
    const ok = SIM.canPlace(p, kind, x, z);
    if (ok.ok && !SIM.roadAdjacent(p, x, z, SIM.sizeOf(kind)) && !quiet) toast('Tip: it needs to touch a road to work');
  }
  const r = SIM.placeBuilding(st, p, kind, x, z, { rot: LANDMARK_BY_ID[kind] ? ui.rot || 0 : 0 });
  if (!r.ok) { if (!quiet) { sfx.error(); toast(r.reason); } return r; }
  if (!quiet) {
    const s = SIM.sizeOf(kind), wx = cellCenter(x) + (s - 1) * CELL / 2, wz = cellCenter(z) + (s - 1) * CELL / 2;
    if (kind === 'road') sfx.move(); else { sfx.thud(); shake(LANDMARK_BY_ID[kind] ? 0.35 : 0.12); world.puff(wx, wz, s * 0.5, 8 + s * 4); floatText(new THREE.Vector3(wx, world.heightAt(wx, wz) + 4, wz), '−' + SIM.fmt(r.cost), '#ffb4a0'); }
    flashStat('sMoney');
  }
  world.rebuildCity(); if (overlay) applyOverlay();
  if (LANDMARK_BY_ID[kind]) { tut('placedLandmark'); pickTool('inspect'); toast(`${LANDMARK_BY_ID[kind].name}: construction started (10 h)`); }
  tut('placed');
  return r;
}
function linePath(a, b) {
  const out = []; const [x0, z0] = a, [x1, z1] = b;
  const horizFirst = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
  const sx = Math.sign(x1 - x0), sz = Math.sign(z1 - z0);
  if (horizFirst) { for (let x = x0; x !== x1 + sx || (sx === 0 && x === x0); x += sx || 1) { out.push([x, z0]); if (sx === 0) break; } for (let z = z0 + sz; sz !== 0 && z !== z1 + sz; z += sz) out.push([x1, z]); }
  else { for (let z = z0; z !== z1 + sz || (sz === 0 && z === z0); z += sz || 1) { out.push([x0, z]); if (sz === 0) break; } for (let x = x0 + sx; sx !== 0 && x !== x1 + sx; x += sx) out.push([x, z1]); }
  return out;
}

// ---------------------------------------------------------------- picking (ray-march the heightfield; cheap and exact enough)
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function pickGround(cx, cy) {
  ndc.set(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  const o = ray.ray.origin, d = ray.ray.direction, H = (x, z) => Math.max(world.heightAt(x, z), world.terrain.waterLevel);
  let t0 = 0, t = 0, step = 2;
  for (let i = 0; i < 600; i++) { t += step; const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t; if (y <= H(x, z)) { let a = t0, b = t; for (let k = 0; k < 10; k++) { const m = (a + b) / 2; const yy = o.y + d.y * m; if (yy <= H(o.x + d.x * m, o.z + d.z * m)) b = m; else a = m; } t = b; return new THREE.Vector3(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t); } t0 = t; step = Math.min(8, step * 1.03); }
  return null;
}
const toCell = (v) => [Math.floor(v.x / CELL + GRID / 2), Math.floor(v.z / CELL + GRID / 2)];
function pickSystem(cx, cy) { ndc.set(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); const hit = ray.intersectObjects(galaxy.pick, false)[0]; return hit?.object.userData.sys || null; }

// ---------------------------------------------------------------- input
const cv = renderer.domElement;
const ptrs = new Map(); let drag = null, pinch = null, hoverCell = null;
cv.addEventListener('contextmenu', (e) => e.preventDefault());
cv.addEventListener('pointerdown', (e) => {
  cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; drag = null; world?.hideGhost(); return; }
  const rot = e.button === 2 || (e.button === 0 && (e.altKey || e.ctrlKey));
  drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, rot, pan: e.button === 1, moved: 0, start: null, t: performance.now() };
  if (mode === 'planet' && !rot && e.button === 0 && (tool === 'road' || tool === 'bulldoze')) { const g = pickGround(e.clientX, e.clientY); if (g) drag.start = toCell(g); }
  if (cine) skipCine();
});
cv.addEventListener('pointermove', (e) => {
  if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const cam = mode === 'galaxy' ? gcam : mode === 'gallery' ? lcam : pcam;
  if (pinch && ptrs.size === 2) {
    const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    if (mode === 'eye') { eye.yaw -= (mx - pinch.mx) * 0.004; }
    else { cam.g.dist *= pinch.d / Math.max(10, d); cam.g.yaw -= ang - pinch.ang; cam.pan(mx - pinch.mx, my - pinch.my); cam.clamp(); }
    Object.assign(pinch, { d, ang, mx, my }); return;
  }
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
    if (mode === 'eye') { eye.yaw -= dx * 0.004; eye.pitch = Math.max(-0.6, Math.min(0.9, eye.pitch - dy * 0.003)); eye.idle = 0; return; }
    if (drag.rot) { cam.g.yaw -= dx * 0.006; cam.g.pitch += dy * 0.004; cam.clamp(); }
    else if (drag.start && mode === 'planet') { const g = pickGround(e.clientX, e.clientY); if (g) { const c = toCell(g); drag.end = c; const cells = linePath(drag.start, c).filter(([x, z]) => x >= 0 && z >= 0 && x < GRID && z < GRID); const p = st.planets[st.active]; world.showRoadGhost(cells, ([x, z]) => tool === 'bulldoze' ? p.grid[z * GRID + x] !== 0 : SIM.canPlace(p, 'road', x, z).ok); drag.cells = cells; } }
    else if (drag.moved > 4 || drag.pan || mode !== 'planet' || tool === 'inspect' || e.pointerType !== 'touch') { if (mode === 'galaxy') { gcam.g.yaw -= dx * 0.005; gcam.g.pitch += dy * 0.004; gcam.clamp(); } else cam.pan(dx, dy); }
    return;
  }
  // hover
  if (mode === 'planet' && world) {
    const g = pickGround(e.clientX, e.clientY); if (!g) { world.hideGhost(); return; }
    const [cx, cz] = toCell(g); hoverCell = [cx, cz];
    const k = kindOf(tool);
    if (tool !== 'inspect' && tool !== 'bulldoze' && tool !== 'road') { const [ax, az] = anchorFor(k, cx, cz); const p = st.planets[st.active]; const ok = SIM.canPlace(p, k, ax, az).ok && SIM.roadAdjacent(p, ax, az, SIM.sizeOf(k)); world.showGhost(ax, az, SIM.sizeOf(k), ok, LANDMARK_BY_ID[k] ? 6 : 2); }
    else if (tool === 'road' || tool === 'bulldoze') world.showGhost(cx, cz, 1, true, 0.4); else world.hideGhost();
  } else if (mode === 'galaxy' && galaxy) galaxy.hover(pickSystem(e.clientX, e.clientY));
});
const endPtr = (e) => {
  ptrs.delete(e.pointerId);
  if (ptrs.size < 2) pinch = null;
  if (!drag) return; const d = drag; drag = null;
  if (mode === 'planet' && d.start) { const cells = d.cells || [d.start]; let n = 0, cost = 0; for (const [x, z] of cells) { if (x < 0 || z < 0 || x >= GRID || z >= GRID) continue; if (tool === 'road') { const r = SIM.placeBuilding(st, st.planets[st.active], 'road', x, z); if (r.ok) { n++; cost += r.cost; } else if (r.reason === 'Not enough credits') { toast('Not enough credits'); break; } } else { const r = SIM.bulldoze(st, st.planets[st.active], x, z); if (r.ok) { n++; if (r.b) toast(`Removed ${SIM.BUILDINGS[r.kind]?.name || LANDMARK_BY_ID[r.kind]?.name}`); } } } world.hideGhost(); if (n) { (tool === 'road' ? sfx.move : sfx.capture)(); world.rebuildCity(); if (overlay) applyOverlay(); flashStat('sMoney'); if (tool === 'road') { tut('road'); const c = cells.at(-1); floatText(new THREE.Vector3(cellCenter(c[0]), world.heightAt(cellCenter(c[0]), cellCenter(c[1])) + 2, cellCenter(c[1])), '−' + SIM.fmt(cost), '#ffb4a0'); } } return; }
  if (d.moved > 8 || d.rot) return;
  click(e.clientX, e.clientY);
};
cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr);
cv.addEventListener('wheel', (e) => { e.preventDefault(); const cam = mode === 'galaxy' ? gcam : mode === 'gallery' ? lcam : pcam; if (mode === 'eye') { eye.fov = Math.max(30, Math.min(75, eye.fov + e.deltaY * 0.03)); return; } cam.g.dist *= Math.pow(1.0012, e.deltaY); cam.clamp(); }, { passive: false });
function click(x, y) {
  if (mode === 'galaxy') { const id = pickSystem(x, y); if (id) showSystem(id); else { $('sysCard').classList.remove('open'); galaxy.select(null); } return; }
  if (mode !== 'planet') return;
  const g = pickGround(x, y); if (!g) return;
  const [cx, cz] = toCell(g); if (cx < 0 || cz < 0 || cx >= GRID || cz >= GRID) { closeSide(); return; }
  const p = st.planets[st.active];
  if (tool === 'inspect') { const v = p.grid[cz * GRID + cx]; if (v > 0) { const b = [...p.buildings, ...p.landmarks].find((q) => q.uid === v); selectB(b); } else if (v === -1) { closeSide(); toast('Road'); } else closeSide(); return; }
  if (tool === 'bulldoze') return;
  const k = kindOf(tool); const [ax, az] = anchorFor(k, cx, cz); tryPlace(k, ax, az);
}
const keys = new Set();
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  keys.add(e.key.toLowerCase());
  if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
    if (mode === 'eye') { exitEye(); return; } if (mode === 'gallery') { closeGallery(); return; }
    if (e.key === 'Escape' && tool !== 'inspect' && mode === 'planet') { pickTool('inspect'); return; }
    if ($('pauseM').classList.contains('open')) closePause(); else openPause(); return;
  }
  if (mode === 'menu' || $('pauseM').classList.contains('open')) return;
  if (e.key === ' ') { e.preventDefault(); setSpeed(speed === 0 ? (ui.prevSpeed || 1) : (ui.prevSpeed = speed, 0)); return; }
  if (e.key === 'm' || e.key === 'M') { $('bGalaxy').click(); return; }
  if (e.key === 't' || e.key === 'T') { showTourism(); return; }
  if (e.key === 'g' || e.key === 'G') { showGoals(); return; }
  if (mode !== 'planet') return;
  const map = { 1: 'road', 2: 'housing', 3: 'shop', 4: 'hotel', 5: 'power', 6: 'water', 7: 'spaceport', 8: 'transit', 9: 'park', x: 'bulldoze', l: 'landmarks', o: 'overlay', v: 'eye' };
  const k = e.key.toLowerCase();
  if (k === 'r' && tool.startsWith('lm:')) { ui.rot = ((ui.rot || 0) + 1) % 4; toast('Rotated'); sfx.click(); return; }
  if (map[k]) { sfx.click(); pickTool(map[k]); }
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
function keyCam(dt) {
  if (mode === 'eye') { const f = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0), s = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0); if (f || s) { eye.idle = 0; eye.pos.x += (-Math.sin(eye.yaw) * f + Math.cos(eye.yaw) * s) * dt * 6; eye.pos.z += (-Math.cos(eye.yaw) * f - Math.sin(eye.yaw) * s) * dt * 6; } return; }
  const cam = mode === 'galaxy' ? gcam : mode === 'gallery' ? lcam : pcam;
  const sp = cam.c.dist * dt * 0.9;
  const fx = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
  const fz = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
  if ((fx || fz) && mode !== 'gallery') cam.panWorld(fx * sp, fz * sp);
  if (keys.has('q')) cam.g.yaw += dt * 1.4; if (keys.has('e')) cam.g.yaw -= dt * 1.4;
  if (keys.has('f')) cam.g.pitch -= dt * 0.8; if (keys.has('r') && !tool.startsWith('lm:')) cam.g.pitch += dt * 0.8;
  if (keys.has('=') || keys.has('+') || keys.has('z')) cam.g.dist *= 1 - dt * 1.2; if (keys.has('-') || keys.has('c')) cam.g.dist *= 1 + dt * 1.2;
  cam.clamp();
}

// ---------------------------------------------------------------- side panels
function flashStat(id) { const el = $(id); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
function selectB(b) { selected = b; world.select(b); sfx.select(); ui.sideKind = 'b'; renderSide(); $('side').classList.add('open'); }
function renderSide() {
  const p = st?.planets[st.active]; if (!p) return;
  if (ui.sideKind === 'tour') return renderTourism();
  const b = selected; if (!b) return;
  if (b.lm) return renderLandmark(b);
  const D = SIM.BUILDINGS[b.kind];
  let h = `<h2>${esc(D.name)}${b.kind === 'housing' ? ` <span style="font-size:13px;color:var(--dim)">level ${b.level}</span>` : ''}</h2><p>${esc(D.blurb)}</p>`;
  h += `<div class="row"><span>Status</span><b style="color:${b.built < 1 ? '#9ad8ff' : !b.road ? 'var(--bad)' : 'var(--good)'}">${b.built < 1 ? 'Under construction ' + Math.round(b.built * 100) + '%' : !b.road ? 'No road access!' : 'Working'}</b></div>`;
  if (D.residents) h += `<div class="row"><span>Residents</span><b>${D.residents[b.level - 1]}</b></div>`;
  if (D.jobs) h += `<div class="row"><span>Jobs</span><b>${D.jobs}</b></div>`;
  if (D.beds) h += `<div class="row"><span>Beds</span><b>${D.beds} (≈${D.beds / 2} overnight visitors/day)</b></div>`;
  if (D.docks) h += `<div class="row"><span>Landing slots</span><b>${D.docks} visitors/day</b></div><div class="row"><span>Road-connected</span><b>${b.access >= 0 ? 'yes' : 'no'}</b></div>`;
  if (D.out) h += `<div class="row"><span>Power output</span><b>${D.out}</b></div>`;
  if (D.wout) h += `<div class="row"><span>Water output</span><b>${D.wout}</b></div>`;
  if (D.radius) h += `<div class="row"><span>Covers</span><b>${D.radius} cells around</b></div>`;
  if (D.upkeep) h += `<div class="row"><span>Upkeep</span><b>${SIM.fmt(D.upkeep * 1.5 * (b.kind === 'housing' ? b.level : 1))}/day</b></div>`;
  h += `<div class="btns"><button class="btn" id="bDemolish">${svg('bulldoze').replace('<svg', '<svg width="16" height="16" style="vertical-align:-3px;stroke:currentColor;fill:none"')} Remove</button></div>`;
  $('sideBody').innerHTML = h;
  $('bDemolish').onclick = () => { const r = SIM.bulldoze(st, p, b.x, b.z); if (r.ok) { sfx.capture(); world.rebuildCity(); closeSide(); } else { sfx.error(); toast(r.reason); } };
}
function renderLandmark(l) {
  const p = st.planets[st.active], D = LANDMARK_BY_ID[l.kind], keys = SIM.traitKeys(p.traits), boost = SIM.landmarkBoost(D, keys);
  const cap = D.capacity * (l.transit ? 1.25 : 1), crowd = (l.lastVisits || 0) / cap;
  const boosts = Object.entries(D.boosts).filter(([k]) => keys.has(k)).map(([k, m]) => `<span class="chip ${m > 1 ? 'boost' : 'nerf'}">${esc(SIM.TRAIT_NAMES[k])} ${m > 1 ? '+' : '−'}${Math.round(Math.abs(m - 1) * 100)}%</span>`).join('');
  const reviews = p.reviews.filter((r) => r.lm === l.uid).slice(0, 3);
  const fcost = Math.round(SIM.FESTIVAL_COST * (1 + st.festivalsHeld * 0.25));
  let h = `<h2>${esc(D.name)}</h2><p style="color:var(--dim);font-size:12px;letter-spacing:.1em;text-transform:uppercase">${esc(D.kind)}</p>`;
  if (l.built < 1) h += `<div class="row"><span>Construction</span><b>${Math.round(l.built * 100)}%</b></div><div class="bar"><i style="width:${l.built * 100}%"></i></div>`;
  else h += `<div class="row"><span>Rating</span><b><span class="stars">${stars(l.rating)}</span> ${l.rating.toFixed(2)}</b></div>
    <div class="row"><span>Visits yesterday</span><b>${SIM.fmtN(l.lastVisits || 0)} / ${SIM.fmtN(cap)}</b></div><div class="bar"><i style="width:${Math.min(100, crowd * 100)}%;${crowd > 1 ? 'background:linear-gradient(90deg,#ff8a4a,#ff4a6a)' : ''}"></i></div>
    <div class="row"><span>Road from spaceport</span><b style="color:${l.access >= 0 ? 'var(--good)' : 'var(--bad)'}">${l.access >= 0 ? l.access + ' blocks' : 'NOT CONNECTED'}</b></div>
    <div class="row"><span>Transit stop nearby</span><b style="color:${l.transit ? 'var(--good)' : '#ffb46a'}">${l.transit ? 'yes (+reviews, +capacity)' : 'no'}</b></div>`;
  h += `<h3>Who loves it</h3>${VISITOR_TYPES.map((v) => `<div class="vt"><span style="color:${v.color}">${v.name}</span><div class="bar"><i style="width:${D.appeal[v.id] * 20}%;background:${v.color}"></i></div><span>${D.appeal[v.id]}</span></div>`).join('')}`;
  h += `<h3>On this world</h3>${boosts || '<p>No trait boosts here.</p>'}<p style="font-size:12px">Overall: <b style="color:${boost >= 1 ? 'var(--good)' : 'var(--bad)'}">×${boost.toFixed(2)}</b> appeal</p>`;
  h += `<h3>Story</h3><p>${esc(D.lore)}</p><p><b style="color:#ffd27a">After dark:</b> ${esc(D.night)}</p>`;
  if (reviews.length) h += `<h3>Latest reviews</h3>${reviews.map((r) => `<div class="review"><span class="stars">${stars(r.stars)}</span> ${esc(r.text)}<small>${esc(r.who)} from ${esc(r.from)} · day ${r.d}</small></div>`).join('')}`;
  h += `<div class="btns">${l.built >= 1 ? `<button class="btn primary" id="bFest" ${l.festival > 0 ? 'disabled' : ''}>${l.festival > 0 ? 'Festival on!' : 'Host festival ' + SIM.fmt(fcost)}</button><button class="btn" id="bEye">Visit at eye level</button>` : ''}<button class="btn" id="bDemolish">Remove</button></div>`;
  $('sideBody').innerHTML = h;
  $('bFest')?.addEventListener('click', () => { const r = SIM.holdFestival(st, p, l); if (r.ok) { sfx.magic(); toast('Festival announced — visitors +50% for 2 days'); renderSide(); const c = world.landmarkCenter(l); for (let i = 0; i < 3; i++) setTimeout(() => world.firework(c.x + (Math.random() - 0.5) * 20, c.y + 30 + Math.random() * 15, c.z + (Math.random() - 0.5) * 20, [0xffd27a, 0xff7ad9, 0x7ac8ff][i]), i * 350); SIM.checkMilestones(st); processLog(); } else { sfx.error(); toast(r.reason); } });
  $('bEye')?.addEventListener('click', () => enterEye(l));
  $('bDemolish').onclick = () => { if (!confirm(`Remove ${D.name}? You get 25% back.`)) return; const r = SIM.bulldoze(st, p, l.x, l.z); if (r.ok) { sfx.capture(); world.rebuildCity(); closeSide(); } };
}
function advice(p) {
  const S = p.stats, out = [];
  const lms = p.landmarks.filter((l) => l.built >= 1);
  if (!p.landmarks.length) out.push(['No landmark yet — nobody has a reason to visit.', 'Open Wonders (L) and place one beside a road.']);
  for (const l of p.landmarks) if (l.access < 0) out.push([`${LANDMARK_BY_ID[l.kind].name} isn't reachable by road from a spaceport.`, 'Connect it with roads (use the Overlay to see).']);
  if (S.turnedAway > Math.max(15, S.visitors * 0.15)) out.push([`${SIM.fmtN(S.turnedAway)} visitors were turned away — no landing slots.`, 'Build another Spaceport.']);
  if (S.visitors > 20 && (S.overnight || 0) < S.visitors * 0.4) out.push([`Only ${Math.round((S.overnight || 0) / Math.max(1, S.visitors) * 100)}% of visitors found a bed.`, 'Hotels: overnight guests spend 5× more and review better.']);
  for (const l of lms) if ((l.crowd || 0) > 1.05) out.push([`${LANDMARK_BY_ID[l.kind].name} is crowded (${Math.round(l.crowd * 100)}%).`, 'Add a Transit stop nearby or another landmark.']);
  for (const l of lms) if (!l.transit) { out.push([`${LANDMARK_BY_ID[l.kind].name} has no transit stop within 6 cells.`, 'Transit adds +0.35★ and capacity.']); break; }
  if (S.powerOk < 1) out.push(['Power shortage!', 'Build a Power plant.']); if (S.waterOk < 1) out.push(['Water shortage!', 'Build Water works.']);
  if (S.pop > 0 && S.jobs < S.pop * 0.5) out.push(['Many residents have no work.', 'Shops, hotels and landmarks create jobs.']);
  if (S.happiness < 50) out.push([`Happiness is ${S.happiness}%.`, 'Parks, jobs, power and water make residents happier — happy cities get better reviews.']);
  if (S.unconnected) out.push([`${S.unconnected} building(s) don't touch a road.`, 'Everything must touch a road to work.']);
  return out.slice(0, 5);
}
function showTourism() { if (!st) return; ui.sideKind = 'tour'; selected = null; world?.select(null); renderTourism(); $('side').classList.add('open'); sfx.select(); ui.tourismOpened = true; tut('tourism'); }
function renderTourism() {
  const p = st.planets[st.active] || st.planets[st.settled[0]];
  if (!p) { $('sideBody').innerHTML = '<h2>Tourism</h2><p>Settle a world first. Visitors come from the six old worlds of the cluster to see your landmarks.</p>' + leaderboardHTML(); return; }
  const S = p.stats, dem = SIM.demandFor(st).out.get(p.sys);
  const want = Math.round(dem?.total || 0), cap = Math.round(S.docks), beds = Math.round(S.beds / 2);
  let h = `<h2>Tourism · ${esc(p.name)}</h2><p style="font-size:12px;color:var(--dim)">How visitors flow, per day. Bottlenecks are in orange.</p>
    <div class="flow"><div class="n">Want to come<b>${SIM.fmtN(want)}</b></div><div class="a">→</div><div class="n" style="${want > cap ? 'outline:1px solid #ffb46a' : ''}">Landing slots<b>${SIM.fmtN(cap)}</b></div></div>
    <div class="flow"><div class="n">Arrived<b>${SIM.fmtN(S.visitors || 0)}</b></div><div class="a">→</div><div class="n" style="${(S.visitors || 0) > beds ? 'outline:1px solid #ffb46a' : ''}">Hotel beds<b>${SIM.fmtN(beds)}</b></div></div>
    <div class="flow"><div class="n">Turned away<b style="color:${S.turnedAway > 10 ? '#ffb46a' : 'inherit'}">${SIM.fmtN(S.turnedAway || 0)}</b></div><div class="a">→</div><div class="n">Net income<b style="color:${S.income >= 0 ? 'var(--good)' : 'var(--bad)'}">${SIM.fmt(S.income || 0)}</b></div></div>`;
  const ad = advice(p);
  if (ad.length) h += `<h3>What would help</h3>${ad.map(([a, b]) => `<div class="review" style="border-left:3px solid #ffb46a"><b>${esc(a)}</b><small>${esc(b)}</small></div>`).join('')}`;
  if (dem && dem.total > 0) { h += '<h3>Who wants to come</h3>' + VISITOR_TYPES.map((v) => `<div class="vt"><span style="color:${v.color}">${v.name}</span><div class="bar"><i style="width:${Math.min(100, dem.byType[v.id] / dem.total * 100)}%;background:${v.color}"></i></div><span>${Math.round(dem.byType[v.id])}</span></div>`).join(''); }
  h += leaderboardHTML();
  h += `<h3>Recent reviews</h3>${p.reviews.slice(0, 4).map((r) => `<div class="review"><span class="stars">${stars(r.stars)}</span> ${esc(r.text)}<small>${esc(r.who)} from ${esc(r.from)} · day ${r.d}</small></div>`).join('') || '<p>No reviews yet — they arrive each morning.</p>'}`;
  h += `<h3>Events</h3>${st.events.filter((e) => e.planet === p.sys).map((e) => `<span class="chip ${e.mult >= 1 ? 'boost' : 'nerf'}">${esc(e.name)} ×${e.mult}</span>`).join('') || '<p style="font-size:12px">None right now. Host a festival from a landmark’s panel.</p>'}`;
  $('sideBody').innerHTML = h;
}
function leaderboardHTML() { const lb = SIM.leaderboard(st); return `<h3>Most-visited in the cluster</h3>${lb.map((r, i) => `<div class="lb ${r.you ? 'you' : ''}"><span>${i + 1}. ${esc(r.name)}${r.you ? '' : ` <small style="color:var(--dim)">(${esc(r.world)})</small>`}</span><b>${SIM.fmtN(r.visitors)}/day</b></div>`).join('')}`; }
function showGoals() {
  if (!st) return;
  const lb = SIM.leaderboard(st), home = lb.find((r) => r.home), top = lb.find((r) => !r.you);
  const nu = SIM.nextUnlock(st);
  let h = st.mode === 'scenario' ? `<p style="text-align:center"><b>Brightest Harbour</b>: make Skyharbor the most-visited world in the Lantern Cluster.</p><div class="row"><span>Skyharbor</span><b>${SIM.fmtN(home?.visitors || 0)}/day</b></div><div class="row"><span>${esc(top?.name || '')}</span><b>${SIM.fmtN(top?.visitors || 0)}/day</b></div><div class="bar"><i style="width:${Math.min(100, (home?.visitors || 0) / Math.max(1, top?.visitors || 1) * 100)}%"></i></div>` : '<p style="text-align:center"><b>Sandbox</b>: everything unlocked, ten times the credits. Build what you like.</p>';
  h += SIM.MILESTONES.map((m) => `<div class="mile ${st.milestones[m.id] ? 'done' : ''}"><div class="dot">${st.milestones[m.id] ? '✓' : ''}</div><div>${esc(m.name)}<small>${esc(m.desc)}${st.milestones[m.id] ? ` — day ${st.milestones[m.id]}` : ''}</small></div></div>`).join('');
  if (nu) h += `<h3 style="margin-top:14px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;opacity:.7">Next wonder unlock</h3><div class="row"><span>${esc(nu.name)}</span><b>${SIM.fmtN(st.renown)} / ${SIM.fmtN(nu.unlock.renown)} renown</b></div><div class="bar"><i style="width:${Math.min(100, st.renown / nu.unlock.renown * 100)}%"></i></div>`;
  $('goalsBody').innerHTML = h; $('goalsM').classList.add('open');
}
function refreshPanels() { if ($('side').classList.contains('open')) renderSide(); }

// ---------------------------------------------------------------- floating labels
const floats = [];
function project(v) { const p = v.clone().project(camera); return p.z < 1 ? [(p.x + 1) / 2 * innerWidth, (1 - p.y) / 2 * innerHeight] : null; }
function floatText(v, text, color) { const s = project(v); if (!s) return; const d = document.createElement('div'); d.className = 'float'; d.textContent = text; d.style.color = color; d.style.left = s[0] + 'px'; d.style.top = s[1] + 'px'; labels.appendChild(d); setTimeout(() => d.remove(), 1700); }
const bubbles = [];
function bubble(l, r) { if (!world) return; const d = document.createElement('div'); d.className = 'bubble'; d.innerHTML = `<span class="stars">${stars(r.stars)}</span> ${esc(r.text)}<br><small style="opacity:.6">${esc(r.who)} from ${esc(r.from)}</small>`; labels.appendChild(d); bubbles.push({ d, v: world.landmarkCenter(l).add(new THREE.Vector3(0, (LANDMARK_BY_ID[l.kind].height || 20) * 0.75 + 4, 0)), t: 6.5 }); }
const sysLabels = new Map();
function updateLabels(dt) {
  for (let i = bubbles.length - 1; i >= 0; i--) { const b = bubbles[i]; b.t -= dt; const s = mode === 'planet' && project(b.v); if (b.t <= 0 || !s) { if (b.t <= 0) { b.d.remove(); bubbles.splice(i, 1); } else b.d.style.display = 'none'; continue; } b.d.style.display = ''; b.d.style.left = s[0] + 'px'; b.d.style.top = s[1] + 'px'; b.d.style.opacity = Math.min(1, b.t); }
  const show = mode === 'galaxy' && galaxy;
  if (show) for (const [id, o] of galaxy.systems) {
    let el = sysLabels.get(id); if (!el) { el = document.createElement('div'); el.className = 'lab sys'; labels.appendChild(el); sysLabels.set(id, el); }
    const s = project(o.g.position.clone().add(o.offset).add(new THREE.Vector3(0, 4.2, 0)));
    if (!s) { el.style.display = 'none'; continue; }
    const p = st.planets[id], sys = o.sys;
    el.style.display = ''; el.style.left = s[0] + 'px'; el.style.top = s[1] + 'px';
    el.classList.toggle('src', o.isSource);
    const html = o.isSource ? `${esc(o.sys.name)}<small>visitor source</small>` : p ? `${esc(p.name)}<small>${SIM.fmtN(p.stats.visitors || 0)} visitors/day</small>` : sys.scanned ? `${esc(sys.name)}<small>${esc(SIM.PLANET_TYPES[sys.type].name)}</small>` : `?<small>${st.scans.some((q) => q.sys === id) ? 'scanning…' : 'unscanned'}</small>`;
    if (el._h !== html) { el.innerHTML = html; el._h = html; }
  } else for (const [, el] of sysLabels) el.style.display = 'none';
}

// ---------------------------------------------------------------- tutorial coach (first-minute teaching, in play)
const TUT = [
  { on: 'galaxy', text: 'Your colony ark has reached the <b>Lantern Cluster</b>. Click the pulsing <b>?</b> world near the centre and <b>Scan</b> it.', done: 'scanStarted' },
  { on: 'galaxy', text: 'Scanning… a scan reveals the planet’s <b>traits</b> — they decide which wonders tourists will love there.', done: 'scanned' },
  { on: 'galaxy', text: 'Found a world! Read its traits, then press <b>Settle</b> — it becomes <b>Skyharbor</b>.', done: 'settled' },
  { on: 'planet', text: 'This is Skyharbor. Every visitor lands at your <b>spaceport</b>. Pick <b>Road (1)</b> and drag a line out from the short road beside it.', done: 'road', pulse: '[data-tool="road"]' },
  { on: 'planet', text: 'People need a reason to come. Open <b>Wonders (L)</b> and place <b>Halo Gate</b> touching your road.', done: 'placedLandmark', pulse: '[data-tool="landmarks"]' },
  { on: 'planet', text: 'Now earn from them: place a few <b>Homes</b>, a <b>Shop</b> and a <b>Hotel</b> along the road (homes give workers; hotels and shops earn from visitors).', done: 'cityBasics', pulse: '[data-tool="hotel"]' },
  { on: 'planet', text: 'Your wonder takes 10 hours to raise. Speed time up with <b>▶▶</b> and watch it rise.', done: 'landmarkBuilt', pulse: '#clock [data-sp="4"]' },
  { on: 'planet', text: 'Ships are arcing in! Open <b>Tourism (T)</b> to see the flow: demand → landing slots → beds → income, and what would help.', done: 'tourism', pulse: '#bTour' },
  { on: 'planet', text: 'Goal: make Skyharbor the <b>most-visited world</b> in the cluster. More wonders unlock with renown; traits multiply them. Check <b>Goals (G)</b> any time.', done: 'ack', ack: true, pulse: '#bGoals' },
];
function tut(ev) {
  if (!st || ui.tutorialDone) return;
  const s = TUT[ui.tutorial]; if (!s) return;
  const p = st.planets[st.active];
  if (s.done === 'cityBasics' && p && p.buildings.filter((b) => b.kind === 'housing').length >= 2 && p.buildings.some((b) => b.kind === 'shop') && p.buildings.some((b) => b.kind === 'hotel')) ev = 'cityBasics';
  if (s.done === 'scanned' && st.systems.some((q) => q.scanned)) ev = 'scanned';
  if (s.done === 'landmarkBuilt' && p?.landmarks.some((l) => l.built >= 1)) ev = 'landmarkBuilt';
  if (ev === s.done) { ui.tutorial++; sfx.check(); if (!TUT[ui.tutorial]) { ui.tutorialDone = true; $('coach').classList.remove('show'); clearPulse(); return; } }
  renderCoach();
}
function renderCoach() {
  const s = TUT[ui.tutorial];
  const key = s && !ui.tutorialDone && mode === s.on ? ui.tutorial : -1;
  if (key === ui.coachKey) return; ui.coachKey = key;
  if (key < 0) { $('coach').classList.remove('show'); clearPulse(); return; }
  $('coachN').textContent = ui.tutorial + 1; $('coachT').innerHTML = s.text + (s.ack ? ' <button class="btn" id="coachOk" style="margin-left:6px;min-height:30px;padding:6px 12px">Got it</button>' : '');
  $('coach').classList.add('show');
  if (s.pulse) pulseEl(s.pulse); else clearPulse();
  $('coachOk')?.addEventListener('click', () => tut('ack'));
}

// ---------------------------------------------------------------- sim clock + event processing
function stepSim(dt) {
  if (!st || mode === 'menu' || mode === 'gallery' || paused) return;
  simAcc += dt * speed;
  const hs = HOUR_SEC();
  let guard = 0;
  while (simAcc >= hs && guard++ < 8) {
    simAcc -= hs;
    const p = st.planets[st.active], before = p ? p.today.visitors : 0, day = st.day;
    SIM.simHour(st);
    if (p && world && mode !== 'galaxy') { const arrived = (st.day !== day ? (p.stats.visitors - before) : p.today.visitors - before); const ships = Math.min(5, Math.round(Math.max(0, arrived) / 10 + Math.random() * 0.6)); for (let i = 0; i < ships; i++) setTimeout(() => world?.spawnShip(), Math.random() * hs * 1000 / Math.max(1, speed)); }
    processLog();
    if (st.day !== day) onNewDay();
  }
}
function onNewDay() {
  save();
  const p = st.planets[st.active];
  if (p && world) {
    world.setCrowd();
    const fresh = p.reviews.filter((r) => r.d === st.day - 1).slice(0, 2);
    fresh.forEach((r, i) => { const l = p.landmarks.find((q) => q.uid === r.lm); if (l) setTimeout(() => bubble(l, r), i * 1800); });
  }
  if (st.won && !ui.wonShown) { ui.wonShown = true; setTimeout(finale, 800); }
  refreshPanels(); refreshCosts();
}
function processLog() {
  const log = st.log.splice(0);
  for (const e of log) {
    if (e.t === 'scan') { const sys = st.systems.find((q) => q.id === e.sys); galaxy?.endScan(e.sys); sfx.chime(); toast(`Scan complete: ${SIM.PLANET_TYPES[sys.type].name}`); if (mode === 'galaxy') showSystem(e.sys); tut('scanned'); }
    else if (e.t === 'built' && e.planet === st.active && world) { const b = st.planets[e.planet].buildings.find((q) => q.uid === e.uid); if (b) { world.growBuilding(b); sfx.move(); } }
    else if (e.t === 'grow' && e.planet === st.active && world) { const b = st.planets[e.planet].buildings.find((q) => q.uid === e.uid); if (b) world.growBuilding(b); }
    else if (e.t === 'landmarkDone') { const p = st.planets[e.planet]; const l = p.landmarks.find((q) => q.uid === e.uid); if (l && e.planet === st.active && world && mode === 'planet') wonder(l); else toast(`${LANDMARK_BY_ID[e.kind].name} completed on ${p.name}`); tut('landmarkBuilt'); }
    else if (e.t === 'milestone') { const m = SIM.MILESTONES.find((q) => q.id === e.id); sfx.win(); toast(`Milestone: ${m.name}`, 3200); host('progress', { milestone: m.id }); const nl = SIM.LANDMARKS.find((l) => l.unlock.milestone === m.id); if (nl) setTimeout(() => toast(`New wonder unlocked: ${nl.name}`, 3200), 1200); }
    else if (e.t === 'event') { const E = SIM.EVENT_TYPES[e.type]; const p = st.planets[e.planet]; toast(`${E.name} on ${p.name}! ${E.blurb}`, 4200); (E.disaster ? sfx.error : sfx.magic)(); }
    else if (e.t === 'grant') { toast('Cluster Authority grant: ¤20,000. Tip: landmarks + hotels are your income.', 5000); sfx.chime(); }
  }
  const before = ui.unlockedN ?? st.unlocked.length; ui.unlockedN = st.unlocked.length;
  if (st.unlocked.length > before) { const nl = LANDMARK_BY_ID[st.unlocked.at(-1)]; sfx.magic(); toast(`New wonder unlocked: ${nl.name}`, 3600); }
}

// ---------------------------------------------------------------- wonder moment (4X-style completion cinematic)
// FABLE: choreograph this — scaffold collapse, crane lift-off, rising fanfare stinger synced to the reveal, crowd cheer.
function wonder(l) {
  const D = LANDMARK_BY_ID[l.kind], c = world.landmarkCenter(l), h = D.height || 30;
  cine = { prev: { ...pcam.g }, t: 0, dur: 7, l, c, h };
  pcam.set({ x: c.x, z: c.z, dist: Math.max(40, h * 2.1), pitch: 0.28, yaw: pcam.g.yaw - 0.4, yo: Math.min(h * 0.35, 30) });
  $('wE').textContent = 'Wonder complete'; $('wT').textContent = D.name; $('wP').textContent = D.lore;
  $('wonder').classList.add('show'); showHud(false); closeSide();
  sfx.magic(); setTimeout(() => sfx.win(), 900); flash('#fff4d8', 300); shake(0.25);
  for (let i = 0; i < 6; i++) setTimeout(() => world?.firework(c.x + (Math.random() - 0.5) * 24, c.y + h * 0.8 + Math.random() * 18, c.z + (Math.random() - 0.5) * 24, [0xffd27a, 0xff7ad9, 0x7ac8ff, 0x9affc8][i % 4]), 600 + i * 420);
  world.puff(c.x, c.z, 3, 40);
}
function skipCine() { if (!cine) return; cine.t = cine.dur; }
function stepCine(dt) {
  if (!cine) return;
  cine.t += dt; pcam.g.yaw += dt * 0.09;
  if (cine.t >= cine.dur) { $('wonder').classList.remove('show'); showHud(true); pcam.set({ ...cine.prev, x: cine.c.x, z: cine.c.z, yo: 0 }); const l = cine.l; cine = null; selectB(l); }
}
// FABLE: finale needs a composed victory theme and a slow aerial fly-through of every wonder.
function finale() {
  $('wE').textContent = 'The Lantern Cluster agrees'; $('wT').textContent = 'Skyharbor is the Brightest Harbour';
  $('wP').textContent = `Day ${st.day}: more travellers now choose Skyharbor than anywhere else in the cluster. Keep building — sandbox play continues.`;
  $('wonder').classList.add('show'); showHud(false); sfx.win(); setTimeout(() => sfx.magic(), 700); flash('#fff4d8', 400);
  const p = st.planets[st.active];
  if (world && p) for (let i = 0; i < 14; i++) setTimeout(() => { const l = p.landmarks[i % Math.max(1, p.landmarks.length)]; const c = l ? world.landmarkCenter(l) : new THREE.Vector3(); world.firework(c.x + (Math.random() - 0.5) * 30, c.y + 40 + Math.random() * 20, c.z + (Math.random() - 0.5) * 30, [0xffd27a, 0xff7ad9, 0x7ac8ff][i % 3]); }, i * 300);
  host('win', { day: st.day });
  setTimeout(() => { $('wonder').classList.remove('show'); showHud(true); }, 9000);
}

// ---------------------------------------------------------------- visitor's eye
// FABLE: footstep/ambient layers per planet type and landmark-specific soundscapes when strolling.
const eye = { pos: new THREE.Vector3(), yaw: 0, pitch: 0.1, fov: 60, stroll: true, fly: false, idle: 0, l: null, ang: 0 };
function enterEye(l) {
  const c = world.landmarkCenter(l), D = LANDMARK_BY_ID[l.kind];
  eye.l = l; eye.c = c; eye.r = l.s * CELL * 0.5 + 9; eye.ang = pcam.c.yaw; eye.fly = false; eye.stroll = true; eye.h = D.height || 30;
  eye.pos.set(c.x + Math.sin(eye.ang) * eye.r, 0, c.z + Math.cos(eye.ang) * eye.r);
  mode = 'eye'; closeSide(); showHud(false); $('eyebar').classList.add('show'); $('hint').classList.remove('show'); world.hideGhost();
  $('eyeStroll').textContent = 'Stroll: on'; $('eyeFly').textContent = 'Fly up'; sfx.whoosh();
}
function exitEye() { mode = 'planet'; camera.fov = 45; camera.updateProjectionMatrix(); $('eyebar').classList.remove('show'); showHud(true); sfx.click(); }
$('eyeBack').onclick = exitEye;
$('eyeStroll').onclick = () => { eye.stroll = !eye.stroll; $('eyeStroll').textContent = 'Stroll: ' + (eye.stroll ? 'on' : 'off'); sfx.click(); };
$('eyeFly').onclick = () => { eye.fly = !eye.fly; $('eyeFly').textContent = eye.fly ? 'Land' : 'Fly up'; sfx.whoosh(); };
function stepEye(dt) {
  eye.idle += dt;
  if (eye.stroll && eye.idle > 1.5) { eye.ang += dt * 0.07; eye.pos.x += (eye.c.x + Math.sin(eye.ang) * eye.r - eye.pos.x) * dt * 0.8; eye.pos.z += (eye.c.z + Math.cos(eye.ang) * eye.r - eye.pos.z) * dt * 0.8; const want = Math.atan2(eye.pos.x - eye.c.x, eye.pos.z - eye.c.z); let d = want - eye.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); eye.yaw += d * dt * 0.9; eye.pitch += ((eye.fly ? -0.05 : 0.22) - eye.pitch) * dt * 0.5; }
  const g = Math.max(world.heightAt(eye.pos.x, eye.pos.z), world.terrain.waterLevel + 0.5);
  const targetY = g + (eye.fly ? Math.max(14, eye.h * 0.7) : 1.7) + Math.sin(performance.now() / 300) * (eye.fly ? 0 : 0.03);
  camera.position.set(eye.pos.x, camera.position.y + (targetY - camera.position.y) * Math.min(1, dt * 3), eye.pos.z);
  if (Math.abs(camera.position.y - targetY) > 40) camera.position.y = targetY;
  const look = new THREE.Vector3(eye.pos.x - Math.sin(eye.yaw) * Math.cos(eye.pitch), camera.position.y + Math.sin(eye.pitch), eye.pos.z - Math.cos(eye.yaw) * Math.cos(eye.pitch));
  camera.lookAt(look); camera.fov += (eye.fov - camera.fov) * dt * 4; camera.updateProjectionMatrix();
  camera.userData.target = eye.c; camera.userData.dist = 40;
}

// ---------------------------------------------------------------- landmark gallery (renders each landmark alone)
let galleryIdx = 0, galleryTod = 0.735, galleryFromMenu = false;
function makeGallery() {
  const scene = new THREE.Scene();
  scene.backgroundNode = SH.skyBackground(); scene.fogNode = SH.fogNode();
  const hemi = new THREE.HemisphereLight(0xbcd4ff, 0x2a2420, 0.7), key = new THREE.DirectionalLight(0xffe0c0, 2.4), rim = new THREE.DirectionalLight(0x8fb4ff, 0.8);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.radius = 3; key.shadow.bias = -0.0005; key.shadow.normalBias = 0.04; Object.assign(key.shadow.camera, { left: -40, right: 40, top: 70, bottom: -10, near: 1, far: 300 });
  scene.add(hemi, key, key.target, rim);
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new (RoomEnv)(), 0.04).texture; scene.environmentIntensity = 0.3;
  const groundMat = new THREE.MeshStandardNodeMaterial({ color: 0x3a3a44, roughness: 0.9 });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(400, 64), groundMat); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.62; ground.receiveShadow = true; scene.add(ground);
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(15, 16, 0.6, 64), new THREE.MeshStandardNodeMaterial({ color: 0x5a5a64, roughness: 0.7 })); ped.position.y = -0.3 + 0.001; ped.receiveShadow = true; scene.add(ped);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(15.6, 0.12, 6, 96), SH.glowMaterial(0xffd27a, { day: 0.6, night: 3 })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.02; scene.add(ring);
  const lights = []; for (let i = 0; i < 3; i++) { const l = new THREE.PointLight(0xffffff, 0, 70, 1.6); scene.add(l); lights.push(l); }
  const bodies = []; { const { mat, u } = SH.planetMaterial('giant', { seed: 3 }); mat.fog = false; const m = new THREE.Mesh(new THREE.SphereGeometry(260, 64, 40), mat); m.position.set(-900, 700, -1900); m.rotation.set(0.3, 0.5, 0.2); scene.add(m); const rm = SH.ringMaterial(260 * 1.35, 260 * 2.3); const r = new THREE.Mesh(new THREE.RingGeometry(260 * 1.35, 260 * 2.3, 128), rm.mat); r.position.copy(m.position); r.rotation.set(-Math.PI / 2 + 0.38, 0.2, 0.3); scene.add(r); bodies.push(u); }
  return { scene, hemi, key, rim, lights, bodies, obj: null };
}
let RoomEnv = null;
async function openGallery(i = 0, fromMenu = false) {
  if (!RoomEnv) RoomEnv = (await import('three/addons/environments/RoomEnvironment.js')).RoomEnvironment;
  if (!gallery) gallery = makeGallery();
  galleryFromMenu = fromMenu; ui.galleryPrevMode = mode === 'gallery' ? ui.galleryPrevMode : mode;
  mode = 'gallery'; showHud(false); $('gallery').classList.add('show'); $('coach').classList.remove('show'); $('hint').classList.remove('show'); closeSide();
  ensurePipe('gallery', gallery.scene);
  showGalleryItem(i);
}
function showGalleryItem(i) {
  galleryIdx = (i + LANDMARKS.length) % LANDMARKS.length;
  const D = LANDMARKS[galleryIdx];
  if (gallery.obj) gallery.scene.remove(gallery.obj);
  const g = bake(D.build(makeKit({ seed: 7 + galleryIdx })));
  gallery.obj = g; gallery.scene.add(g);
  const h = D.id === 'elevator' ? 60 : D.height;
  const w = D.footprint * 4;
  lcam.ground = () => h * 0.45;
  lcam.set({ x: 0, y: 0, z: 0, yaw: 0.6, pitch: 0.24, dist: Math.max(30, h * 1.45, w * 2.6) }, true);
  const unlocked = !st || st.unlocked.includes(D.id);
  $('gCard').innerHTML = `<div style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#ffd27a">${galleryIdx + 1} / ${LANDMARKS.length} · ${esc(D.kind)}</div><h2 style="margin:4px 0 6px;font-size:22px">${esc(D.name)}</h2><p style="font-size:13px;line-height:1.45;margin:0 0 6px">${esc(D.lore)}</p><p style="font-size:13px;margin:0 0 8px"><b style="color:#ffd27a">After dark:</b> ${esc(D.night)}</p>${VISITOR_TYPES.map((v) => `<div class="vt"><span style="color:${v.color}">${v.name}</span><div class="bar"><i style="width:${D.appeal[v.id] * 20}%;background:${v.color}"></i></div><span>${D.appeal[v.id]}</span></div>`).join('')}<p style="font-size:12px;margin:8px 0 0;color:var(--dim)">Boosted by: ${Object.entries(D.boosts).filter(([, m]) => m > 1).map(([k]) => esc(SIM.TRAIT_NAMES[k])).join(', ')} · ${SIM.fmt(D.cost)} · ${D.tier.toFixed(1)}★ base${unlocked ? '' : ' · <span style="color:#ffb46a">locked</span>'}</p>`;
}
function closeGallery() { camera.clearViewOffset(); $('gallery').classList.remove('show'); if (galleryFromMenu || !st) { mode = 'menu'; menu.show(); } else { mode = ui.galleryPrevMode === 'galaxy' ? 'galaxy' : 'planet'; showHud(true); setToolbarVisible(mode === 'planet'); renderCoach(); } sfx.click(); }
$('gPrev').onclick = () => { sfx.click(); showGalleryItem(galleryIdx - 1); };
$('gNext').onclick = () => { sfx.click(); showGalleryItem(galleryIdx + 1); };
const GT = [[0.735, 'Night'], [0.02, 'Day'], [0.5, 'Dusk']];
$('gTod').onclick = () => { sfx.click(); const i = (GT.findIndex((g) => g[0] === galleryTod) + 1) % GT.length; galleryTod = GT[i][0]; $('gTod').textContent = GT[i][1]; };
$('gBack').onclick = closeGallery;
function stepGallery(dt, t) {
  const G = gallery; if (!G) return;
  // reuse the ocean sky palette for the studio; one time value drives sky, lights and glows (same as worlds)
  const fakeWorld = { sky: SKIES.ocean, planet: { traits: { features: ['clearSkies'] } }, type: 'ocean', sun: G.key, hemi: G.hemi, fill: G.rim, scene: G.scene, bodies: [], terrain: {} };
  fakeWorld.sun.target = G.key.target; G.key.target.position.set(0, 0, 0);
  World.prototype.setTime.call(fakeWorld, galleryTod);
  G.bodies.forEach((u) => u.lightDir.value.copy(SH.U.sunDir.value));
  for (const fn of G.obj.userData.anims) fn(t, dt, SH.U.night.value, G.obj);
  const L = G.obj.userData.lights; G.lights.forEach((pl, i) => { const a = L[i]; if (a) { pl.position.copy(a.pos); pl.color.copy(a.color); pl.intensity = (SH.U.night.value * 70 + 6) * a.intensity; } else pl.intensity = 0; });
  if (!drag) lcam.g.yaw += dt * 0.08;
  const W = innerWidth, H = innerHeight, clean = document.body.classList.contains('gclean');
  if (clean) camera.clearViewOffset(); else if (W > 720) camera.setViewOffset(W, H, -Math.min(230, W * 0.17), 0, W, H); else camera.setViewOffset(W, H, 0, H * 0.2, W, H);
}

// ---------------------------------------------------------------- HUD refresh
let hudT = 0;
function updateHud(dt) {
  hudT -= dt; if (hudT > 0 || !st) return; hudT = 0.25;
  const p = st.planets[st.active];
  const set = (id, v, cls) => { const el = $(id); const b = el.querySelector('b'); if (b.textContent !== v) b.textContent = v; el.classList.toggle('warn', cls === 'warn'); el.classList.toggle('bad', cls === 'bad'); };
  set('sMoney', SIM.fmt(st.money), st.money < 0 ? 'bad' : st.money < 2000 ? 'warn' : '');
  if (p && mode !== 'galaxy') {
    const S = p.stats;
    set('sPop', `${SIM.fmtN(S.pop)} / ${SIM.fmtN(S.jobs)}`, S.jobs < S.pop * 0.5 ? 'warn' : '');
    set('sVis', SIM.fmtN(S.visitors || 0), (S.turnedAway || 0) > (S.visitors || 0) * 0.3 && S.turnedAway > 10 ? 'warn' : '');
    set('sRate', p.landmarks.some((l) => l.built >= 1) ? S.rating.toFixed(2) + '★' : '—');
    set('sHappy', S.happiness + '%', S.happiness < 40 ? 'bad' : S.happiness < 55 ? 'warn' : '');
  } else {
    const tot = st.settled.reduce((a, id) => a + (st.planets[id].stats.visitors || 0), 0);
    set('sPop', SIM.fmtN(st.settled.reduce((a, id) => a + st.planets[id].stats.pop, 0)) + ' total'); set('sVis', SIM.fmtN(tot)); set('sRate', SIM.fmtN(st.renown) + ' ren.'); set('sHappy', st.settled.length + ' worlds');
  }
  const hh = Math.floor(st.hour), mm = Math.floor((simAcc / HOUR_SEC()) * 60);
  $('clockT').textContent = `Day ${st.day} ${String(hh).padStart(2, '0')}:${String(Math.min(59, mm)).padStart(2, '0')}`;
  if ($('side').classList.contains('open') && (ui.sideT = (ui.sideT || 0) + 1) % 8 === 0) renderSide();
  renderCoach();
  P.counts = { mode, planets: st.settled.length, buildings: p?.buildings.length || 0, landmarks: p?.landmarks.length || 0, roads: p ? p.grid.filter((v) => v === -1).length : 0, cars: world?.cars.length || 0, ships: world?.ships.length || 0, people: world?.people.length || 0, visitors: Math.round(p?.stats.visitors || 0), money: Math.round(st.money), day: st.day };
}

// ---------------------------------------------------------------- frame loop
const tmpV = new THREE.Vector3();
let fireT = 0;
autoResize(renderer, camera);
startLoop(renderer, (dt, t) => {
  updateTweens(dt);
  keyCam(dt);
  stepSim(dt);
  if ((mode === 'galaxy' || mode === 'menu') && galaxy) { if (mode === 'menu') gcam.g.yaw += dt * 0.03; gcam.update(dt, camera); galaxy.update(dt, t, camera); camera.far = 3000; }
  else if ((mode === 'planet' || mode === 'eye') && world) {
    camera.far = 7000;
    if (mode === 'eye') stepEye(dt); else { stepCine(dt); pcam.update(dt, camera); }
    const p = world.planet, tod = (st.hour + simAcc / HOUR_SEC()) / 24;
    const ev = st.events.filter((e) => e.planet === p.sys);
    const ecl = ev.some((e) => e.type === 'eclipse') ? Math.max(0, Math.sin(((tod - 0.42) / 0.16) * Math.PI)) * (tod > 0.42 && tod < 0.58 ? 1 : 0) : 0;
    world.auroraBoost = ev.some((e) => e.type === 'auroraStorm') ? 2.6 : 1;
    if (ev.some((e) => e.type === 'auroraStorm') && !p.traits.features.includes('auroras')) p.traits._aur = true;
    world.setTime(tod, p.traits.day, ecl);
    if (ev.some((e) => e.type === 'dustStorm')) SH.U.fogDensity.value *= 3.2;
    world.update(dt, t, camera);
    fireT -= dt;
    if (fireT <= 0 && SH.U.night.value > 0.5) { fireT = 1.4 + Math.random() * 1.6; const fest = p.landmarks.filter((l) => l.festival > 0); if (fest.length) { const l = fest[(Math.random() * fest.length) | 0], c = world.landmarkCenter(l); world.firework(c.x + (Math.random() - 0.5) * 26, c.y + (LANDMARK_BY_ID[l.kind].height || 30) + 8 + Math.random() * 16, c.z + (Math.random() - 0.5) * 26, [0xffd27a, 0xff7ad9, 0x7ac8ff, 0x9affc8][(Math.random() * 4) | 0]); sfx.zap(); } if (ev.some((e) => e.type === 'meteors')) for (let i = 0; i < 3; i++) world.firework(camera.position.x + (Math.random() - 0.5) * 300, 140 + Math.random() * 60, camera.position.z - 200 + (Math.random() - 0.5) * 200, 0xdff6ff); }
  } else if (mode === 'gallery' && gallery) { lcam.update(dt, camera); stepGallery(dt, t); camera.far = 7000; }
  applyShake(camera, dt);
  updateLabels(dt);
  updateHud(dt);
}, () => {
  const key = mode === 'galaxy' || mode === 'menu' ? 'galaxy' : mode === 'gallery' ? 'gallery' : (mode === 'planet' || mode === 'eye') ? 'world' : null;
  if (key && pipes[key]) pipes[key].render(); else if (galaxy) ensurePipe('galaxy', galaxy.scene).render(); else renderer.clear();
});

// ---------------------------------------------------------------- test hooks (__cam.game) + scripted staging
P.dataReady = true;
P.game = {
  get state() { return st; }, get mode() { return mode; }, get world() { return world; }, LANDMARKS: LANDMARKS.map((l) => l.id),
  newGame: (o = {}) => { menu.hide(); newGame(o); return st.seed; },
  scan: (id = 's0') => scan(id), settle: (id = 's0') => settleSys(id), visit: (id = st.active) => visit(id, true), goGalaxy: () => goGalaxy(),
  quickStart(type = 'ocean', o = {}) { menu.hide(); newGame({ planetType: type, ...o }); ui.tutorialDone = !!o.noTutorial; SIM.startScan(st, 's0'); for (let i = 0; i < 2; i++) SIM.simHour(st); processLog(); SIM.settle(st, 's0', 'Skyharbor'); st.log.length = 0; galaxy?.sync(); visit('s0', true); return st.planets.s0; },
  place: (kind, x, z) => tryPlace(kind, x, z, { quiet: true }),
  placeLandmark(id, x, z, { instant = true, force = true } = {}) { const p = st.planets[st.active]; if (force) { if (!st.unlocked.includes(id)) st.unlocked.push(id); st.money += SIM.costOf(st, id, p); } const r = SIM.placeBuilding(st, p, id, x, z, { instant }); if (r.ok) world.rebuildCity(); return r.ok ? r.b.uid : r.reason; },
  demoCity(landmarks = ['halo', 'garden', 'observatory'], o = {}) { const p = st.planets[st.active]; st.money += 2e6; for (const id of landmarks) if (!st.unlocked.includes(id)) st.unlocked.push(id); demoCity(st, p, { landmarks, radius: o.radius ?? 9, instant: true }); for (const b of p.buildings) { if (b.kind === 'housing') b.level = (b.uid * 7) % 9 === 0 ? 3 : 1 + (b.uid % 2); b.built = 1; } for (const l of p.landmarks) { l.built = 1; l.rating = 4 + (l.uid % 10) / 10; l.lastVisits = 300; } SIM.computeCity(st, p); world.rebuildCity(true); for (const [, o2] of world.landmarkObjs) o2.rise = 1, o2.g.position.y = 0, o2.g.visible = true; world.setCrowd(); return p.landmarks.map((l) => [l.kind, l.x, l.z]); },
  setTime(tod) { if (typeof tod === 'string') tod = world.todFor(tod); st.hour = Math.floor(tod * 24) % 24; simAcc = (tod * 24 % 1) * HOUR_SEC(); return tod; },
  setSpeed, skipHours(n) { for (let i = 0; i < n; i++) { SIM.simHour(st); processLog(); } },
  frame(o) { const cam = mode === 'galaxy' ? gcam : mode === 'gallery' ? lcam : pcam; cam.set(o, true); },
  frameLandmark(uid, o = {}) { const l = st.planets[st.active].landmarks.find((q) => q.uid === uid) || st.planets[st.active].landmarks[0]; const c = world.landmarkCenter(l); const h = LANDMARK_BY_ID[l.kind].height; pcam.set({ x: c.x, z: c.z, dist: h * 2.2, pitch: 0.4, yaw: 0.6, yo: h * 0.3, ...o }, true); return l.uid; },
  openGallery: (i) => menu.hide() || openGallery(typeof i === 'string' ? LANDMARKS.findIndex((l) => l.id === i) : i || 0, !st), galleryTod: (v) => { galleryTod = v; },
  eye: (uid) => { const l = st.planets[st.active].landmarks.find((q) => q.uid === uid) || st.planets[st.active].landmarks[0]; enterEye(l); },
  select: (uid) => { const p = st.planets[st.active]; const b = [...p.buildings, ...p.landmarks].find((q) => q.uid === uid); if (b) selectB(b); },
  tourism: () => showTourism(), goals: () => showGoals(), landmarksMenu: () => openLandmarks(), overlay: (m) => { overlay = m; applyOverlay(); }, tool: (t) => pickTool(t),
  hideUI(on = true) { document.body.classList.toggle('shot', on); for (const id of ['topbar', 'navbtns', 'toolbar', 'side', 'sysCard', 'hint', 'coach', 'labels', 'eyebar']) $(id).style.visibility = on ? 'hidden' : ''; document.querySelector('.sd-corner').style.visibility = on ? 'hidden' : ''; },
  wonder: (uid) => { const l = st.planets[st.active].landmarks.find((q) => q.uid === uid) || st.planets[st.active].landmarks[0]; wonder(l); },
  save, ui: () => ui, tut: (e) => tut(e), U: SH.U,
};
// URL staging for screenshots: ?gallery=<id>&tod=night · ?stage=<type>
if (Q.has('clean')) document.body.classList.add('gclean');
if (Q.get('gallery')) { menu.hide(); const id = Q.get('gallery'); galleryTod = Q.get('tod') === 'day' ? 0.5 : Q.get('tod') === 'dusk' ? 0.735 : 0.02; openGallery(Math.max(0, LANDMARKS.findIndex((l) => l.id === id)), true); }
