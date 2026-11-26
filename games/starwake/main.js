// Starwake — bootstrap: renderer + composite cockpit pipeline, input (kb/mouse/gamepad/touch), cameras, game flow, saves, hooks.
import { THREE, createRenderer, autoResize, probe, startLoop, spaceBackground, initUI as kitUI, startMenu, settingsButton, toast, store, loadDream, settings,
  updateTweens, tween, ease, applyShake, shake, flash, sfx, host, deepMerge } from '/shared/sd-kit.js';
import { pass, uniform, mix, vec4, float } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { SHIPS, FACTIONS, STORY, STORY_OBJ, PEOPLE, STATION_TYPES, buildSector, route, mapDist, clamp, rng } from './data.js';
import * as S from './sim.js';
import { makeTextures, shipModel, cockpitModel, hangarScene, sunSprite, PALETTES, SHIP_LEN } from './art.js';
import { Particles, Bolts, Debris, SpeedDust, FlashLights, ShieldFX, Glows } from './fx.js';
import { Ship, spawnShip, flyShip, aiUpdate, steer, combatUpdate, fireGuns, fireMissile, buildSystem, encounterTick, distressTick, patrolTick, missionsOnEnter, missionsOnLaunch, missionsTick, hostile, leadPoint, spawnPirates, spawnTrader, explosionFX, removeNav, CRUISE_SPEED } from './world.js';
import { initHUD, drawHUD, drawMFD, hudHitMarker, hudHitFrom } from './hud.js';
import * as UI from './ui.js';
import { audio } from './audio.js';

const V3 = THREE.Vector3;
const _a = new V3(), _b = new V3(), _c = new V3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const cfg = await loadDream(S.DEFAULT_CFG, (c) => applyLive(c));
kitUI({ vignette: true, grain: true });

// ---------------------------------------------------------------- renderer + scenes
const renderer = await createRenderer({ shadows: false, exposure: 1.0, toneMapping: 'aces' });
renderer.setClearColor(0x000000, 0);
makeTextures();
const world = new THREE.Scene();
const bg = spaceBackground(world, { nebulaA: cfg.colors.nebulaA, nebulaB: cfg.colors.nebulaB, density: 1.0 });
const pmrem = new THREE.PMREMGenerator(renderer);
world.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; world.environmentIntensity = 0.32;
const sunLight = new THREE.DirectionalLight('#fff0d8', 3.0); world.add(sunLight);
const fill = new THREE.DirectionalLight('#4a5a90', 0.45); fill.position.set(-0.4, -0.6, 0.5); world.add(fill);
world.add(new THREE.AmbientLight('#20263a', 0.35));
const sun = sunSprite('#ffe2a8', 26000); world.add(sun);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 1, 260000); world.add(camera);
// cockpit: its own scene + camera, composited over the world so near/far stay precise (0.02 m .. 260 km)
const cockScene = new THREE.Scene();
const cockCam = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.02, 20); cockScene.add(cockCam);
cockScene.environment = world.environment; cockScene.environmentIntensity = 0.25;
const cockSun = new THREE.DirectionalLight('#fff0d8', 2.2); cockScene.add(cockSun);
const cockFill = new THREE.PointLight('#ffb070', 0.6, 3, 1.5); cockFill.position.set(0, -0.5, -0.4); cockScene.add(cockFill);
cockScene.add(new THREE.AmbientLight('#303848', 0.6));
const hangar = hangarScene('#ffd27a', world.backgroundNode);
hangar.environment = world.environment; hangar.environmentIntensity = 0.5;
const hangarCam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.5, 1200);
// pipelines
const cockOn = uniform(1);
function flightPipeline() {
  const pl = new THREE.RenderPipeline(renderer);
  const wp = pass(world, camera), cp = pass(cockScene, cockCam);
  const w = wp.getTextureNode('output'), c = cp.getTextureNode('output');
  const comp = mix(w.rgb, c.rgb, c.a.mul(cockOn));
  if (settings.quality !== 'low') { const b = bloom(vec4(comp, 1), 0.62, 0.42, 0.78); pl.outputNode = vec4(comp.add(b.rgb), 1); } else pl.outputNode = vec4(comp, 1);
  return pl;
}
function hangarPipeline() {
  const pl = new THREE.RenderPipeline(renderer); const hp = pass(hangar, hangarCam); const c = hp.getTextureNode('output');
  if (settings.quality !== 'low') { const b = bloom(c, 0.5, 0.4, 0.85); pl.outputNode = vec4(c.rgb.add(b.rgb), 1); } else pl.outputNode = vec4(c.rgb, 1);
  return pl;
}
const pipes = { flight: flightPipeline(), hangar: hangarPipeline() };
let fovCur = 72;
autoResize(renderer, camera, () => { for (const c of [cockCam, hangarCam]) { c.aspect = innerWidth / innerHeight; c.updateProjectionMatrix(); } fitFov(); });

// ---------------------------------------------------------------- game context
const G = {
  cfg, P: null, SYS: buildSector(cfg.seed), sys: null, scene: world, camera, ships: [], player: null, missiles: [], pods: [], muzzle: [], missilePool: [], podPool: [], geo: {},
  stations: [], gates: [], planets: [], field: null, navs: [], navSel: 0, sysObjects: [], time: 0, state: 'menu', view: 'cockpit', seq: null, hitstop: 0, diff: S.DIFF[cfg.difficulty] || S.DIFF.normal,
  sunLight, sun, fill, opts: Object.assign({ invertY: false }, store.get('starwake-opts', {})), route: null, auto: null, jumpCharge: null, host,
  input: { keys: {}, mx: 0, my: 0, hasMouse: false, mouseSteer: true, lmb: false, rmb: false, tx: 0, ty: 0, tFire: false, tBoost: false, touch: matchMedia('(pointer: coarse)').matches, pad: null, padPrev: [] },
  fx: { parts: new Particles(world, 1100), bolts: new Bolts(world, 420), debris: new Debris(world, 170), dust: new SpeedDust(world, 420, 260), lights: new FlashLights(world), shields: new ShieldFX(world, 14), glows: new Glows(world, 300) },
};
window.G = G;
G.ui = { hitMarker: () => hudHitMarker(G), hitFrom: (p) => hudHitFrom(G, p), hullHit: () => { if (settings.flash) flash('rgba(255,60,40,.22)', 120); } };
initHUD(G); UI.initUI(G); settingsButton();
G.setNebula = (s) => {
  const shiftC = (hex, k) => { const c = new THREE.Color(hex); const h = {}; c.getHSL(h); c.setHSL((h.h + k + 1) % 1, h.s, h.l); return c; };
  const k = s ? (s.hue - 0.5) * 0.22 : 0;
  if (s?.id === 'lacuna') { bg.c1.value.set('#0e5a5a'); bg.c2.value.set('#2a1a6a'); bg.density.value = 1.5; }
  else { bg.c1.value.copy(shiftC(cfg.colors.nebulaA, k)); bg.c2.value.copy(shiftC(cfg.colors.nebulaB, -k)); bg.density.value = s ? 0.75 + (s.danger / 5) * 0.4 + s.hue * 0.2 : 1; }
};
function applyLive(c) {
  deepMerge(cfg, c); G.diff = S.DIFF[G.P?.difficulty || cfg.difficulty] || G.diff;
  if (G.P && c.difficulty && S.DIFF[c.difficulty]) { G.P.difficulty = c.difficulty; G.diff = S.DIFF[c.difficulty]; }
  G.setNebula(G.sys); document.documentElement.style.setProperty('--accent', cfg.colors.accent);
}
document.documentElement.style.setProperty('--accent', cfg.colors.accent);

// cockpit model with live MFD textures
let cockpit = null;
function buildCockpit() { if (cockpit) cockScene.remove(cockpit); cockpit = cockpitModel('player', G.hud.tex); cockScene.add(cockpit); }
buildCockpit();
const EYE = { magpie: [0, 1.75, -5.6], kite: [0, 1.15, -3.2], ox: [0, 1.9, -18.2], halberd: [0, 1.45, -5.4] };

// ---------------------------------------------------------------- player ship
function makePlayer() {
  if (G.player) { world.remove(G.player.model); G.ships = G.ships.filter((s) => !s.isPlayer); }
  const st = S.shipStats(G.P);
  const p = new Ship(G, G.P.ship.cls, 'player', { player: true, team: 'player', name: 'You', stats: { ...st, regen: st.regen }, hull: G.P.ship.hull, missiles: G.P.ship.missiles });
  p.radius = st.radius; p.throttle = 0.5;
  G.player = p; G.ships.unshift(p); return p;
}
G.onShipChanged = () => { const pos = G.player?.pos.clone(), q = G.player?.quat.clone(); makePlayer(); if (pos) { G.player.pos.copy(pos); G.player.quat.copy(q); } if (G.state === 'docked') placeHangarShip(); };
function syncProfileFromPlayer() { if (!G.player || !G.P) return; G.P.ship.hull = Math.max(1, Math.round(G.player.hull)); G.P.ship.missiles = G.player.missiles; }

// ---------------------------------------------------------------- input
const I = G.input;
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && G.state !== 'menu') e.preventDefault();
  if (I.keys[e.code]) return; I.keys[e.code] = true; onKey(e.code);
});
addEventListener('keyup', (e) => { I.keys[e.code] = false; });
addEventListener('blur', () => { I.keys = {}; I.lmb = I.rmb = false; });
addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse') return; I.hasMouse = true; const s = Math.min(innerWidth, innerHeight) * 0.45; I.mx = clamp((e.clientX - innerWidth / 2) / s, -1, 1); I.my = clamp((e.clientY - innerHeight / 2) / s, -1, 1); });
renderer.domElement.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') { I.touch = true; UI.showTouch(G.state === 'flight'); return; } if (e.button === 0) I.lmb = true; if (e.button === 2) { I.rmb = true; if (G.state === 'flight') tryMissile(); } });
addEventListener('pointerup', (e) => { if (e.button === 0) I.lmb = false; if (e.button === 2) I.rmb = false; });
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
function onKey(code) {
  if (G.state === 'menu') return;
  if (code === 'Escape' || code === 'KeyP') { if (!document.getElementById('map').classList.contains('hide')) { G.closeMap(); return; } if (G.state === 'paused') G.resume(); else if (G.state === 'flight' || G.state === 'docked') G.pause(); return; }
  if (code === 'KeyM') { if (!document.getElementById('map').classList.contains('hide')) G.closeMap(); else if (G.state === 'flight' || G.state === 'docked') G.openMap(); return; }
  if (G.state !== 'flight' || G.seq) return;
  const P = G.player;
  if (code === 'KeyT') targetNearest(); if (code === 'KeyY') targetCycle();
  if (code === 'KeyN') { G.navSel = (G.navSel + 1) % Math.max(1, G.navs.length); sfx.click(); }
  if (code === 'KeyZ') toggleAuto(); if (code === 'KeyC') toggleCruise();
  if (code === 'KeyL') requestDock(); if (code === 'KeyJ') gateJump();
  if (code === 'KeyV') toggleView();
  if (code === 'ControlLeft' || code === 'ControlRight' || code === 'KeyX') tryMissile();
  if (code === 'Backspace' || code === 'Digit0') P.throttle = 0;
  if (code === 'KeyW' || code === 'KeyS') G.P.tutorial.throttle = true;
}
G.touchAction = (k) => {
  if (G.state === 'menu') return;
  if (k === 'pause') return G.state === 'paused' ? G.resume() : G.pause();
  if (k === 'map') return G.openMap();
  if (G.state !== 'flight' || G.seq) return;
  if (k === 'missile') tryMissile(); if (k === 'target') { targetNearest(); } if (k === 'nav') G.navSel = (G.navSel + 1) % Math.max(1, G.navs.length);
  if (k === 'auto') toggleAuto(); if (k === 'cam') toggleView(); if (k === 'ctx') { if (G.contextAction === 'DOCK') requestDock(); else if (G.contextAction === 'JUMP') gateJump(); }
};
function pollPad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : []; const p = [...pads].find((x) => x && x.connected); I.pad = p || null; if (!p) return;
  const b = p.buttons.map((x) => x.pressed); const was = I.padPrev; const press = (i) => b[i] && !was[i];
  if (press(9)) (G.state === 'paused' ? G.resume() : G.pause()); if (press(8)) G.openMap();
  if (G.state === 'flight' && !G.seq) { if (press(0)) tryMissile(); if (press(3)) targetNearest(); if (press(2)) toggleAuto(); if (press(1)) { if (G.contextAction === 'DOCK') requestDock(); else if (G.contextAction === 'JUMP') gateJump(); } if (press(12)) G.navSel = (G.navSel + 1) % Math.max(1, G.navs.length); if (press(13)) toggleView(); }
  I.padPrev = b;
}
const dz = (v, d = 0.12) => (Math.abs(v) < d ? 0 : Math.sign(v) * (Math.abs(v) - d) / (1 - d));
function playerInput(dt) {
  const P = G.player, K = I.keys, inp = P.in; const inv = G.opts.invertY ? -1 : 1;
  let pitch = 0, yaw = 0, roll = 0;
  if (I.mouseSteer && I.hasMouse && !I.touch) { const f = (v) => { const a = Math.abs(v); return a < 0.05 ? 0 : Math.sign(v) * Math.pow((a - 0.05) / 0.95, 1.25); }; yaw -= f(I.mx); pitch -= f(I.my) * inv; }
  if (K.ArrowLeft) yaw += 1; if (K.ArrowRight) yaw -= 1; if (K.ArrowUp) pitch += inv; if (K.ArrowDown) pitch -= inv;
  if (K.KeyQ) roll += 1; if (K.KeyE) roll -= 1;
  pitch -= I.ty * inv * 1.0; yaw -= I.tx * 1.0;
  let sx = (K.KeyD ? 1 : 0) - (K.KeyA ? 1 : 0), sy = (K.KeyR ? 1 : 0) - (K.KeyF ? 1 : 0);
  let fire = K.Space || I.lmb || I.tFire, boost = K.ShiftLeft || K.ShiftRight || K.Tab || I.tBoost;
  if (I.pad) { const a = I.pad.axes; yaw -= dz(a[0]); pitch -= dz(a[1]) * inv; roll -= dz(a[2] || 0); P.throttle = clamp(P.throttle - dz(a[3] || 0) * dt * 0.8, 0, 1); const B = I.pad.buttons; if (B[7]?.value > 0.3) fire = true; if (B[6]?.value > 0.3) boost = true; if (B[5]?.pressed) P.throttle = clamp(P.throttle + dt * 0.7, 0, 1); if (B[4]?.pressed) P.throttle = clamp(P.throttle - dt * 0.7, 0, 1); }
  if (K.KeyW) P.throttle = clamp(P.throttle + dt * 0.7, 0, 1); if (K.KeyS) { P.throttle = clamp(P.throttle - dt * 0.7, 0, 1); if (P.cruise > 0 && !G.auto) P.cruise = 0; }
  inp.pitch = clamp(pitch, -1, 1); inp.yaw = clamp(yaw, -1, 1); inp.roll = clamp(roll, -1, 1); inp.sx = sx; inp.sy = sy; inp.boost = boost; inp.fire = fire;
  if (Math.abs(pitch) + Math.abs(yaw) > 0.25) { G._steerT = (G._steerT || 0) + dt; if (G._steerT > 1.5) G.P.tutorial.steer = true; }
  if (boost || (I.pad && dz(I.pad.axes[3] || 0))) G.P.tutorial.throttle = true;
}

// ---------------------------------------------------------------- targeting, missiles, cruise, autopilot
function targetNearest() {
  const P = G.player; let best = null, bd = Infinity;
  for (const s of G.ships) { if (!s.alive || s.isPlayer || !hostile(G, P, s) || (s.parent && s.invuln)) continue; const d = s.pos.distanceTo(P.pos) * (1 + P.fwd.angleTo(_a.copy(s.pos).sub(P.pos)) * 0.6); if (d < bd) { bd = d; best = s; } }
  if (!best) for (const s of G.ships) { if (!s.alive || s.isPlayer) continue; const d = s.pos.distanceTo(P.pos); if (d < bd && d < 6000) { bd = d; best = s; } }
  P.target = best; P.lock = 0; P.locked = false; if (best) { sfx.select(); G.P.tutorial.target = true; } else { sfx.error(); toast('No contacts in range'); }
}
function targetCycle() {
  const list = G.ships.filter((s) => s.alive && !s.isPlayer && s.pos.distanceTo(G.player.pos) < 8000).sort((a, b) => a.pos.distanceTo(G.player.pos) - b.pos.distanceTo(G.player.pos));
  if (!list.length) return; const i = list.indexOf(G.player.target); G.player.target = list[(i + 1) % list.length]; G.player.lock = 0; G.player.locked = false; sfx.select();
}
function tryMissile() {
  const P = G.player; if (P.missiles <= 0) { sfx.error(); toast('Missile rails empty: restock at an outfitter'); return; }
  if (!P.target || !P.target.alive) { sfx.error(); toast('Target something first (T)'); return; }
  if (!P.locked) { toast('No lock: keep the target near your nose'); }
  fireMissile(G, P, P.target);
}
function hostilesNear(r) { const P = G.player; return G.ships.some((s) => s.alive && !s.isPlayer && hostile(G, P, s) && !s.parent && s.pos.distanceTo(P.pos) < r); }
function toggleCruise() {
  const P = G.player; if (P.cruise > 0) { P.cruise = 0; G.auto = null; return; }
  if (hostilesNear(3000)) { toast('Mass-locked: hostiles nearby'); sfx.error(); return; }
  P.cruise = 0.01; sfx.whoosh();
}
function toggleAuto() {
  const P = G.player; if (G.auto) { G.auto = null; P.cruise = 0; toast('Autopilot off'); return; }
  const nav = G.navs[G.navSel]; if (!nav) return;
  if (hostilesNear(3000)) { toast('Autopilot locked out: hostiles within 3 km'); sfx.error(); return; }
  const d = nav.pos.distanceTo(P.pos); if (d < 900) { toast('Already there'); return; }
  G.auto = { nav, start: d, rolled: false }; P.cruise = 0.01; sfx.select(); toast(`Autopilot: ${nav.name}`);
}
function autoTick(dt) {
  const P = G.player, A = G.auto;
  if (P.cruise > 0 && P.cruise < 1) P.cruise = Math.min(1, P.cruise + dt / 1.6);
  if (P.cruise > 0 && (hostilesNear(2600) || G.time - P.lastHit < 0.3)) { P.cruise = 0; if (A) { G.auto = null; toast('Autopilot disengaged: contacts'); audio.warn(); } else toast('Cruise dropped: contacts'); return; }
  if (!A) return;
  _a.copy(A.nav.pos).sub(P.pos); const d = _a.length();
  const stop = A.nav.kind === 'station' ? 1500 : A.nav.kind === 'gate' ? 650 : A.nav.kind === 'poi' ? 2200 : 700;
  const ang = steer(P, _a.normalize(), 2.2);
  if (ang > 0.3 && P.cruise >= 1) P.cruise = 0.99; // slow while turning
  if (!A.rolled && d < A.start * 0.55 && G.sys.danger > 0 && G.sys.id !== 'lacuna') { A.rolled = true; if (Math.random() < 0.12 + G.sys.danger * 0.08 * cfg.pirateDensity / 5) { P.cruise = 0; G.auto = null; P.vel.setLength(200); spawnPirates(G, P.pos.clone().addScaledVector(P.fwd, 2200).add(new V3(300, 150, 0)), 1 + Math.floor(Math.random() * Math.min(3, 1 + G.sys.danger * 0.5)), G.sys.danger); toast('Autopilot interrupted: contacts ahead'); audio.warn(); return; } }
  if (d < stop + P.vel.length() * 0.6) { P.cruise = 0; G.auto = null; P.vel.setLength(Math.min(P.vel.length(), 220)); P.throttle = 0.5; toast(`Arrived: ${A.nav.name}`); }
}

// ---------------------------------------------------------------- camera
const camChase = new V3(); let chaseInit = false;
const head = new THREE.Object3D();
function fitFov() { const portrait = innerWidth < innerHeight; camera.fov = cockCam.fov = fovCur * (portrait ? 1.28 : 1); camera.updateProjectionMatrix(); cockCam.updateProjectionMatrix(); }
function toggleView() { G.view = G.view === 'cockpit' ? 'chase' : 'cockpit'; chaseInit = false; store.set('starwake-view', G.view); sfx.click(); }
function updateCamera(dt) {
  const P = G.player; const chase = G.view === 'chase' || (G.seq && G.seq.chase);
  const target = (chase ? 64 : 72) + (P.boosting ? 9 : 0) + (P.cruise >= 1 ? 16 : P.cruise * 6) + (G.seq?.fovKick || 0);
  fovCur += (target - fovCur) * (1 - Math.exp(-4 * dt)); fitFov();
  // head sway (lags angular velocity), shake applied to head offset so cockpit + world stay locked together
  head.position.set(0, 0, 0); applyShake(head, dt);
  const sway = settings.reducedMotion ? 0 : 1;
  _e.set(-P.ang.x * 0.035 * sway, -P.ang.y * 0.035 * sway, -P.ang.z * 0.02 * sway); _q.setFromEuler(_e);
  if (!chase) {
    const eye = EYE[P.cls] || [0, 1.6, -4];
    camera.position.set(eye[0] + head.position.x * 0.15, eye[1] + head.position.y * 0.15, eye[2]).applyQuaternion(P.quat).add(P.pos);
    camera.quaternion.copy(P.quat).multiply(_q);
    cockCam.position.set(head.position.x * 0.15, head.position.y * 0.15, 0); cockCam.quaternion.copy(_q);
    cockOn.value = 1; cockScene.visible = true; P.model.visible = false; chaseInit = false;
  } else {
    const len = SHIP_LEN[P.cls] || 20;
    _a.set(0, len * 0.36, len * 1.45).applyQuaternion(P.quat).add(P.pos);
    if (!chaseInit) { camChase.copy(_a); chaseInit = true; }
    camChase.lerp(_a, 1 - Math.exp(-(G.seq ? 3 : 7) * dt));
    camera.position.copy(camChase).add(head.position);
    _b.set(0, len * 0.3, -len * 2.2).applyQuaternion(P.quat).add(P.pos);
    camera.up.set(0, 1, 0).applyQuaternion(P.quat); camera.lookAt(_b);
    cockOn.value = 0; cockScene.visible = false; P.model.visible = true;
  }
  // cockpit sun light follows the real sun direction in ship space
  _a.copy(G.sunLight.position).normalize().applyQuaternion(_q.copy(camera.quaternion).invert()); cockSun.position.copy(_a); cockSun.color.copy(G.sunLight.color);
  camera.updateMatrixWorld();
}

// ---------------------------------------------------------------- sequences: dock, launch, jump
function requestDock() {
  const P = G.player; const st = G.stations.find((s) => !s.def.nodock && s.pos.distanceTo(P.pos) < 2200);
  if (!st) { toast('No station in docking range (2 km)'); sfx.error(); return; }
  if (!S.canDock(G.P, st.def)) { G.ui.comms(PEOPLE.control, 'Your reputation precedes you. Docking denied.', 3); sfx.error(); return; }
  if (hostilesNear(2500)) { G.ui.comms(PEOPLE.control, 'Clear your hostiles first, pilot. Docking denied.', 3); sfx.error(); return; }
  G.ui.comms(PEOPLE.control, `${st.def.name} control: clearance granted. Tractor guidance locked, sit back.`, 3);
  const pts = [P.pos.clone(), st.bayOut.clone().add(new V3(0, 30, 300)), st.bayOut.clone(), st.bay.clone(), st.bay.clone().add(new V3(0, 0, -70))];
  const curve = new THREE.CatmullRomCurve3(pts); const L = curve.getLength();
  G.auto = null; P.cruise = 0;
  G.seq = { type: 'dock', t: 0, T: clamp(L / 260, 4, 11), curve, st, chase: true };
  audio.dock();
}
function seqTick(dt) {
  const Q = G.seq, P = G.player; Q.t += dt; const k = Math.min(1, Q.t / Q.T);
  if (Q.type === 'dock') {
    const u = ease.inOutCubic(k); Q.curve.getPointAt(u, _a); Q.curve.getTangentAt(Math.min(u + 0.01, 1), _b);
    P.vel.copy(_a).sub(P.pos).divideScalar(Math.max(dt, 1e-3)); P.pos.copy(_a);
    const m = new THREE.Matrix4().lookAt(P.pos, _c.copy(P.pos).add(_b), new V3(0, 1, 0)); _q.setFromRotationMatrix(m); P.quat.slerp(_q, 1 - Math.exp(-3 * dt));
    P.throttle = 0.3; P.ang.set(0, 0, 0);
    if (k >= 1 && !Q.done) { Q.done = true; UI.fade(true, 350).then(() => { dockAt(Q.st.def); }); }
  } else if (Q.type === 'launch') {
    const u = ease.inQuad(k); Q.curve.getPointAt(u, _a); P.vel.copy(_a).sub(P.pos).divideScalar(Math.max(dt, 1e-3)); P.pos.copy(_a); P.throttle = 0.6;
    if (k >= 1) { G.seq = null; P.vel.copy(P.fwd).multiplyScalar(160); G.view = store.get('starwake-view', G.input.touch && innerWidth < innerHeight ? 'chase' : 'cockpit'); chaseInit = false; Q.onDone?.(); }
  } else if (Q.type === 'jump') {
    Q.fovKick = 30 * ease.inQuad(Math.min(1, Q.t / 1.6));
    P.vel.copy(P.fwd).multiplyScalar(300 + Q.t * 2600); P.pos.addScaledVector(P.vel, dt); P.throttle = 1;
    if (Q.t > 1.5 && !Q.flashed) { Q.flashed = true; flashWhite(true); }
    if (Q.t > 1.75 && !Q.arrived) { Q.arrived = true; arriveSystem(Q.to, Q.via); }
    if (Q.t > 2.4) { flashWhite(false); G.seq = null; P.vel.copy(P.fwd).multiplyScalar(260); }
  }
}
function flashWhite(on) { const f = document.getElementById('fade'); f.style.background = on ? '#eaffff' : '#000'; f.style.transition = `opacity ${on ? 180 : 600}ms`; f.style.opacity = on ? '1' : '0'; if (!on) setTimeout(() => f.style.background = '#000', 650); }
function gateJump() {
  const P = G.player; const g = G.gates.find((x) => x.pos.distanceTo(P.pos) < 700);
  if (!g) { toast('Fly to a jump gate (within 700 m)'); sfx.error(); return; }
  startJump(g.to, G.sys.id, g);
}
function startJump(to, from, gate) {
  const P = G.player; G.auto = null; P.cruise = 0;
  if (gate) { _a.copy(gate.pos).sub(P.pos).normalize(); const m = new THREE.Matrix4().lookAt(P.pos, gate.pos, new V3(0, 1, 0)); P.quat.setFromRotationMatrix(m); }
  G.seq = { type: 'jump', t: 0, to, via: gate ? from : null };
  audio.jump(); shake(0.4);
}
G.startJumpDrive = (to) => {
  const P = G.player; const tgt = G.SYS[to]; const range = S.shipStats(G.P).jumpRange;
  if (mapDist(G.sys, tgt) > range) { toast('Out of jump range'); return; }
  if (G.P.ship.cells <= 0) { toast('No fuel cells'); return; }
  if (G.stations.some((s) => s.pos.distanceTo(P.pos) < 2500) || G.planets.some((p) => p.pos.distanceTo(P.pos) < p.radius + 3000)) { toast('Too close to a mass: move 2.5 km from stations'); sfx.error(); return; }
  G.jumpCharge = 0; G.jumpTo = to; toast(`Charging jump drive for ${tgt.name}`); sfx.magic();
};
function jumpChargeTick(dt) {
  if (G.jumpCharge == null) return; G.jumpCharge += dt / 4;
  if (G.time - G.player.lastHit < 0.2) { G.jumpCharge = null; toast('Jump aborted: taking fire'); return; }
  if (G.jumpCharge >= 1) { G.jumpCharge = null; G.P.ship.cells--; startJump(G.jumpTo, null, null); }
}
function arriveSystem(to, via) {
  const P = G.player; G.P.sys = to; if (!G.P.visited.includes(to)) G.P.visited.push(to); S.advanceDay(G.P, 1);
  buildSystem(G, to);
  if (via && G.SYS[to].gatePos[via]) { const g = G.gates.find((x) => x.to === via); P.pos.copy(g.pos).addScaledVector(g.normal, 220); const m = new THREE.Matrix4().lookAt(P.pos, _a.copy(P.pos).add(g.normal), new V3(0, 1, 0)); P.quat.setFromRotationMatrix(m); }
  else if (to === 'lacuna') { P.pos.set(1800, 300, 6200); const m = new THREE.Matrix4().lookAt(P.pos, new V3(-2600, 400, -3200), new V3(0, 1, 0)); P.quat.setFromRotationMatrix(m); }
  else { const a = Math.random() * 6.28; P.pos.set(Math.cos(a) * 5200, 300, Math.sin(a) * 5200); const m = new THREE.Matrix4().lookAt(P.pos, new V3(0, 0, 0), new V3(0, 1, 0)); P.quat.setFromRotationMatrix(m); }
  P.vel.copy(P.fwd).multiplyScalar(300); P.target = null;
  enterSystem();
  if (to === 'lacuna') setTimeout(() => G.saveCheckpoint(), 600);
}
function enterSystem() {
  const s = G.sys; G.storyObjective(); missionsOnEnter(G);
  // route: auto-select the next gate
  if (G.route) { const i = G.route.indexOf(s.id); if (i >= 0 && i < G.route.length - 1) G.selectNav('gate-' + G.route[i + 1]); else if (i === G.route.length - 1) { G.route = null; G.P.routeDest = null; const stn = G.navs.findIndex((n) => n.kind === 'station'); if (stn >= 0) G.navSel = stn; } }
  titleCard(s);
}
function titleCard(s) {
  const t = document.getElementById('titlecard'); const fac = s.faction === 'none' ? 'Unclaimed space' : s.faction === 'wake' ? 'Uncharted' : `${FACTIONS[s.faction].name} space`;
  t.innerHTML = `<h2>${s.name}</h2><p>${fac} · danger ${'▲'.repeat(s.danger) || 'none'}</p>`; t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
}
G.storyObjective = () => { const a = G.P?.story.active; G.ui.objective(a && STORY_OBJ[a] ? `★ ${STORY_OBJ[a]}` : null); };
G.selectNav = (id) => { const i = G.navs.findIndex((n) => n.id === id); if (i >= 0) G.navSel = i; };
G.setRoute = (dest) => { const r = route(G.SYS, G.P.sys, dest); G.route = r; G.P.routeDest = dest; if (G.state === 'flight' && r && r.length > 1) G.selectNav('gate-' + r[1]); if (G._mapDraw && !document.getElementById('map').classList.contains('hide')) G._mapDraw(); };
function dockAt(st) {
  const P = G.P; G.seq = null; G.state = 'docked'; P.docked = st.id; P.lastStation = st.id; G.dockedStation = st; syncProfileFromPlayer();
  G.player.shF = G.player.shB = G.player.shieldMax; G.player.energy = 100; G.player.fuel = 1; G.player.heat = 0; G.player.overheat = false;
  S.advanceDay(P, 0.25); S.ensureMarket(P, st); P.tutorial.dock = true;
  G.ui.objective(null); G.ui.clearComms(); UI.showTouch(false);
  // deliveries
  for (const m of S.deliverables(P, st.id)) { const r = S.completeMission(P, m); toast(`Delivered: +${r.toLocaleString()} cr`); audio.cash(); }
  let storyDone = null;
  if (P.story.active === 's1' && st.id === 'tallowDeep') storyDone = S.finishStory(P);
  G.pipe = pipes.hangar; placeHangarShip();
  G.autosave();
  UI.fade(false, 500);
  UI.openDock(G); audio.dock();
  if (storyDone) setTimeout(() => UI.storyDialog(G, storyDone, true), 600);
  host('event', { name: 'dock', station: st.id });
}
let hangarShip = null;
function placeHangarShip(cls = null) {
  if (hangarShip) hangar.remove(hangarShip);
  hangarShip = shipModel(cls || G.P.ship.cls, 'player'); const L = SHIP_LEN[cls || G.P.ship.cls] || 20; hangarShip.scale.setScalar(Math.min(1, 34 / L)); hangarShip.position.set(0, 3.5, 0); hangar.add(hangarShip);
  const t = STATION_TYPES[G.dockedStation?.type || 'tech']; hangar.userData.lights.p1.color.set(t.light); hangar.userData.lights.padL.color.set(t.light); hangar.userData.padGlow.color.set(t.light).multiplyScalar(1.4);
  hangarShip.position.y = 16; tween(1.2, (e) => { hangarShip.position.y = 16 - 12.5 * e; }, { ease: ease.outCubic });
}
G.previewShip = (cls) => placeHangarShip(cls);
G.launch = () => {
  if (G.state !== 'docked') return;
  const st = G.stations.find((s) => s.def.id === G.P.docked) || G.stations[0];
  UI.closeDock(); UI.closeMap(); sfx.whoosh();
  UI.fade(true, 300).then(() => {
    G.state = 'flight'; G.pipe = pipes.flight; G.P.docked = null; G.dockedStation = null;
    const P = G.player; P.pos.copy(st.bay).add(new V3(0, 0, -50)); P.quat.setFromRotationMatrix(new THREE.Matrix4().lookAt(P.pos, _a.copy(P.pos).add(new V3(0, 0, 1)), new V3(0, 1, 0)));
    P.vel.set(0, 0, 0); P.target = null; chaseInit = false;
    const curve = new THREE.CatmullRomCurve3([P.pos.clone(), st.bay.clone().add(new V3(0, 0, 40)), st.bayOut.clone(), st.bayOut.clone().add(new V3(0, 20, 420))]);
    G.seq = { type: 'launch', t: 0, T: 4.2, curve, chase: true, onDone: () => { G.storyObjective(); missionsOnLaunch(G, st.def.id); if (G.route && G.route.length > 1) G.selectNav('gate-' + G.route[G.route.indexOf(G.sys.id) + 1]); } };
    UI.showTouch(I.touch); UI.fade(false, 500);
  });
};

// ---------------------------------------------------------------- menus, pause, saves
G.pause = () => { if (G.state === 'paused') return; G.prevState = G.state; G.state = 'paused'; UI.openPause(G); I.lmb = false; };
G.resume = () => { UI.closePause(); G.state = G.prevState || 'flight'; };
G.openMap = () => { if (G.state === 'flight') { G.prevMapState = 'flight'; G.state = 'map'; } UI.openMap(G); };
G.closeMap = () => { UI.closeMap(); if (G.state === 'map') G.state = 'flight'; };
G.autosave = () => { syncProfileFromPlayer(); store.set('starwake-auto', S.serialize(G.P)); };
G.saveCheckpoint = () => { syncProfileFromPlayer(); const o = S.serialize(G.P); o.docked = null; o.pos = G.player.pos.toArray(); store.set('starwake-auto', o); toast('Checkpoint saved'); };
G.saveSlot = (i) => { syncProfileFromPlayer(); const o = S.serialize(G.P); if (G.state !== 'docked' && G.prevState !== 'docked') { o.docked = null; o.pos = G.player.pos.toArray(); } store.set(`starwake-slot-${i}`, o); };
G.loadSlot = (k) => { const d = store.get(k === 'auto' ? 'starwake-auto' : `starwake-slot-${k}`); const P = d && S.deserialize(d); if (!P) { toast('No save found'); return; } UI.closePause(); startProfile(P); };
G.quitToTitle = () => { UI.closePause(); UI.closeDock(); UI.closeMap(); document.getElementById('modal').classList.add('hide'); G.state = 'menu'; G.pipe = pipes.flight; menu.show(); refreshMenu(); UI.showTouch(false); attract(); };
G.onPlayerDeath = () => {
  G.state = 'dead'; syncProfileFromPlayer(); const who = G.player.hitBy?.name || 'debris'; G.auto = null;
  shake(1); flash('rgba(255,120,60,.6)', 500); UI.showTouch(false);
  setTimeout(() => UI.deathScreen(G, `Destroyed by ${who} in ${G.sys.name}.`), 1600);
};
G.onShipDestroyed = (s) => { if (G.player.target === s) { G.player.target = null; G.player.lock = 0; G.player.locked = false; } };

function startProfile(P) {
  G.P = P; G.SYS = buildSector(P.seed); G.diff = S.DIFF[P.difficulty] || S.DIFF.normal; G.route = P.routeDest ? route(G.SYS, P.sys, P.routeDest) : null;
  G.ui.clearComms(); G.ui.objective(null); document.getElementById('modal').classList.add('hide');
  makePlayer(); buildSystem(G, P.sys); G.seq = null; G.auto = null; G.jumpCharge = null; G.time = 0;
  if (P.docked) { const st = G.stations.find((s) => s.def.id === P.docked); if (st) { G.player.pos.copy(st.bayOut); dockAt(st.def); return; } }
  G.state = 'flight'; G.pipe = pipes.flight; UI.closeDock();
  if (P.pos) G.player.pos.fromArray(P.pos); else { const st = G.stations[0]; G.player.pos.copy(st ? st.bayOut : new V3(0, 0, 3000)).add(new V3(0, 0, 400)); }
  G.player.quat.setFromRotationMatrix(new THREE.Matrix4().lookAt(G.player.pos, new V3(0, 0, 0), new V3(0, 1, 0))).multiply(_q.setFromAxisAngle(new V3(0, 1, 0), Math.PI));
  G.player.vel.set(0, 0, 0); missionsOnEnter(G); UI.showTouch(I.touch); titleCard(G.sys);
}
function newGame(opts) {
  const P = S.newProfile({ ...cfg, difficulty: opts.difficulty || cfg.difficulty, story: opts.mode !== 'sandbox' });
  if (opts.mode !== 'sandbox') S.startStory(P, STORY[0]);
  P.docked = 'calderRing';
  G.P = P; G.SYS = buildSector(P.seed); G.diff = S.DIFF[P.difficulty]; G.route = null;
  makePlayer(); buildSystem(G, 'calder'); G.time = 0;
  G.dockedStation = G.stations[0].def; G.state = 'docked'; G.P.docked = 'calderRing';
  G.intro = opts.mode !== 'sandbox';
  if (G.intro) G.setRoute('tallow');
  G.autosave();
  G.launch();
  G._introT = 0; G._tutStage = 0;
  host('start', { mode: opts.mode });
}
let menu;
function refreshMenu() {
  const card = document.querySelector('#menu .sd-card'); card.querySelector('.cont')?.remove();
  const auto = store.get('starwake-auto');
  if (auto && S.deserialize(auto)) {
    const d = S.deserialize(auto); const b = document.createElement('div'); b.className = 'sd-row cont';
    b.innerHTML = `<button class="sd-btn primary" id="sw-continue">Continue · ${G.SYS[d.sys]?.name || d.sys}, day ${Math.floor(d.day)}</button>`;
    card.querySelector('#sd-start').parentElement.before(b);
    b.querySelector('button').onclick = () => { menu.hide(); sfx.select(); startProfile(d); };
  }
}
function buildMenu() {
  menu = startMenu({
    title: 'Starwake', subtitle: 'A beat-up ship, a few credits and the whole Calder Reach. Trade, hunt, smuggle, or follow the light your aunt went chasing.',
    options: [
      { key: 'mode', label: 'Mode', value: 'story', choices: [{ v: 'story', label: 'Story + free play' }, { v: 'sandbox', label: 'Sandbox (no story)' }] },
      { key: 'difficulty', label: 'Difficulty', value: cfg.difficulty, choices: Object.entries(S.DIFF).map(([k, v]) => ({ v: k, label: v.label })) },
    ],
    startLabel: 'New pilot', onStart: (v) => newGame(v),
  });
  const card = document.querySelector('#menu .sd-card');
  const h = document.createElement('p'); h.className = 'menuhint'; h.innerHTML = I.touch ? 'Left stick steers · right slider throttle · FIRE / MSL / BOOST buttons' : 'Mouse steers · W/S throttle · Space fires · Shift boosts · T targets · Esc pauses'; card.appendChild(h);
  refreshMenu();
}

// ---------------------------------------------------------------- attract mode (menu backdrop)
function attract() {
  if (!G.P) { G.P = S.newProfile(cfg); }
  if (!G.player) makePlayer();
  buildSystem(G, 'calder');
  G.player.pos.set(600, 120, 900); G.player.model.visible = true;
  spawnTrader(G);
}
function attractTick(dt, t) {
  const st = G.stations[0]; if (!st) return;
  const a = t * 0.03; camera.position.set(Math.sin(a) * 1500, 260 + Math.sin(t * 0.1) * 80, Math.cos(a) * 1500 + 300);
  camera.up.set(0, 1, 0); camera.lookAt(st.pos.x + 300, st.pos.y, st.pos.z + 500); camera.updateMatrixWorld();
  G.player.pos.set(Math.sin(t * 0.08) * 700 + 300, 80 + Math.sin(t * 0.2) * 20, 700 + Math.cos(t * 0.08) * 700);
  G.player.quat.setFromRotationMatrix(new THREE.Matrix4().lookAt(G.player.pos, _a.set(Math.sin(t * 0.08 + 0.05) * 700 + 300, 80, 700 + Math.cos(t * 0.08 + 0.05) * 700), new V3(0, 1, 0)));
  G.player.throttle = 0.7; cockOn.value = 0; cockScene.visible = false;
}

// ---------------------------------------------------------------- per-frame
const camQ = new THREE.Quaternion();
let menuT = 0;
function stepWorld(dt) {
  G.time += dt;
  for (const s of G.ships) { if (!s.alive) continue; if (s.ai) aiUpdate(G, s, dt); flyShip(G, s, dt); }
  const P = G.player;
  // player guns + lock
  if (P.alive && G.state === 'flight' && !G.seq) {
    if (P.in.fire && P.gunCd <= 0 && P.cruise <= 0) {
      let aim = null; const T = P.target;
      if (T && T.alive && G.diff.assist > 0) { leadPoint(_b, P, T, P.st.gun.speed); _a.copy(_b).sub(P.pos).normalize(); const ang = _a.angleTo(P.fwd); const cone = 0.06 * G.diff.assist + 0.01; if (ang < cone) aim = _a.clone(); }
      if (fireGuns(G, P, aim, 0.002)) { P.gunCd = 1 / P.st.gun.rof; G.P.tutorial.fire = G.P.tutorial.fire || !!T; }
    }
    const T = P.target;
    if (T && T.alive && P.missiles > 0 && T.pos.distanceTo(P.pos) < 2400 && P.fwd.angleTo(_a.copy(T.pos).sub(P.pos)) < 0.26) { const was = P.locked; P.lock = Math.min(1, P.lock + dt / 1.2); P.locked = P.lock >= 1; if (P.locked && !was) audio.lockTone(true); else if (!P.locked && (G.hud.lockBeep -= dt) <= 0) { G.hud.lockBeep = 0.25; audio.lockTone(false); } }
    else { P.lock = Math.max(0, P.lock - dt * 2); P.locked = false; }
  }
  combatUpdate(G, dt);
  G.ships = G.ships.filter((s) => s.alive || s.isPlayer);
  if (P.target && !P.target.alive) P.target = null;
}
function visuals(dt) {
  const P = G.player; camQ.copy(camera.quaternion);
  G.fx.glows.begin(camQ);
  for (const s of G.ships) {
    if (!s.alive || (s.isPlayer && G.view === 'cockpit' && !(G.seq && G.seq.chase) && G.state !== 'menu')) continue;
    const eng = s.model.userData.engines; if (!eng) continue; const pal = PALETTES[s.isPlayer ? 'player' : s.fac] || PALETTES.player; const c = new THREE.Color(pal.glow);
    const th = s.cruise >= 1 ? 2 : s.boosting ? 1.6 : 0.35 + s.throttle * 0.8;
    for (const e of eng) {
      _a.copy(e.p).applyQuaternion(s.quat).add(s.pos);
      const fl = 0.85 + Math.sin(G.time * 40 + s.flicker) * 0.15;
      G.fx.glows.add(_a, e.r * (1.4 + th * 1.5) * fl, c.r * 1.5 * th, c.g * 1.5 * th, c.b * 1.5 * th);
      G.fx.glows.add(_a, e.r * 0.75, 2, 2, 2);
      if ((s.boosting || s.cruise >= 1) && Math.random() < 0.6) { _b.copy(s.fwd).multiplyScalar(-40).add(s.vel); G.fx.parts.spawn(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z, 0.35, e.r * 1.6, e.r * 0.4, c.r * 1.2, c.g * 1.2, c.b * 1.2, 0); }
    }
    if (s.hullFrac() < 0.5 && !s.parent && Math.random() < dt * (s.hullFrac() < 0.25 ? 18 : 7)) { _a.set((Math.random() - 0.5) * s.radius, (Math.random() - 0.5) * s.radius * 0.5, (Math.random() - 0.5) * s.radius).applyQuaternion(s.quat).add(s.pos); const fire = s.hullFrac() < 0.25; G.fx.parts.spawn(_a.x, _a.y, _a.z, s.vel.x * 0.8, s.vel.y * 0.8 + 3, s.vel.z * 0.8, 1.2, s.radius * 0.25, s.radius * 0.9, fire ? 2.2 : 0.3, fire ? 0.9 : 0.28, fire ? 0.3 : 0.25, 0.4); }
  }
  for (let i = G.muzzle.length - 1; i >= 0; i--) { const m = G.muzzle[i]; m.t -= dt; const c = new THREE.Color(m.col); G.fx.glows.add(m.p, m.s * 2.2, c.r * 3, c.g * 3, c.b * 3); if (m.t <= 0) G.muzzle.splice(i, 1); }
  // gate + station beacons
  for (const g of G.gates) { const k = 0.6 + Math.sin(G.time * 3) * 0.4; for (let j = 0; j < 6; j++) { _a.set(Math.cos(j * 1.047) * 176, Math.sin(j * 1.047) * 176, 0).applyQuaternion(g.obj.quaternion).add(g.pos); G.fx.glows.add(_a, 40, 1.2 * k, 2.4 * k, 3 * k); } }
  for (const st of G.stations) { if (st.def.nodock) continue; const k = Math.sin(G.time * 4) > 0.4 ? 1 : 0.15; _a.set(0, 142, -10).add(st.pos); G.fx.glows.add(_a, 60, 3 * k, 0.6 * k, 0.4 * k); for (let j = 0; j < 8; j++) { const kk = ((G.time * 2 - j * 0.25) % 2 + 2) % 2 < 0.25 ? 2.5 : 0.25; G.fx.glows.add(_a.set(-34, -19, 130 + j * 22).add(st.pos), 9, kk, kk * 0.8, kk * 0.4); G.fx.glows.add(_a.set(34, -19, 130 + j * 22).add(st.pos), 9, kk, kk * 0.8, kk * 0.4); } if (st.obj.userData.ring) st.obj.userData.ring.rotation.z += dt * 0.04; }
  if (G.heart && G.sys?.id === 'lacuna') { G.heart.rotation.y += dt * 0.05; G.heart.children.forEach((c, i) => { if (c.geometry?.type === 'TorusGeometry') c.rotation.z += dt * (0.1 + i * 0.03); }); }
  for (const pl of G.planets) pl.obj.children[0].rotation.y += dt * 0.003;
  G.fx.glows.end();
  G.fx.parts.update(dt, camQ); G.fx.debris.update(dt, G.fx.parts); G.fx.lights.update(dt); G.fx.shields.update(dt);
  // speed dust follows the camera, stretched by player velocity
  const v = P ? P.vel : _a.set(0, 0, 0); G.fx.dust.update(camera.position, v, P && P.cruise >= 1 ? 0.03 : 0.05, P && P.cruise >= 1 ? 1 : 0.7);
  updateTweens(dt);
  if (hangarShip && G.state === 'docked') { const t = G.time; hangarShip.rotation.y += dt * 0.12; }
}
let hangarT = 0;
function hangarTick(dt) {
  hangarT += dt; const a = hangarT * 0.06 + 0.8; const narrow = innerWidth < 760;
  hangarCam.position.set(Math.sin(a) * (narrow ? 70 : 58) - (narrow ? 0 : 18), 22 + Math.sin(hangarT * 0.2) * 3, Math.cos(a) * (narrow ? 70 : 58) + 10);
  hangarCam.lookAt(narrow ? 0 : 14, 6, 0);
  if (hangarShip) hangarShip.rotation.y += dt * 0.1;
  updateTweens(dt);
}
function contextTick() {
  const P = G.player; let a = null, hint = null; const touch = I.touch;
  const st = G.stations.find((s) => !s.def.nodock && s.pos.distanceTo(P.pos) < 2200); const gate = G.gates.find((g) => g.pos.distanceTo(P.pos) < 700);
  const hot = hostilesNear(2500);
  if (st) { a = 'DOCK'; hint = hot ? null : touch ? `Tap DOCK to land at ${st.def.name}` : `Press L to request docking at ${st.def.name}`; }
  else if (gate) { a = 'JUMP'; hint = touch ? `Tap JUMP for ${G.SYS[gate.to].name}` : `Press J to jump to ${G.SYS[gate.to].name}`; }
  G.contextAction = a;
  const T = G.P.tutorial;
  if (!T.steer) hint = touch ? 'Drag the left stick to steer' : 'Move the mouse away from centre to steer (arrows work too)';
  else if (!T.throttle) hint = touch ? 'Slide the right bar for throttle · hold BOOST to burn' : 'W / S set throttle · hold Shift to afterburn';
  else if (hostilesNear(3500) && !T.target) hint = touch ? 'Tap TGT to lock the nearest hostile' : 'Press T to target the nearest hostile';
  else if (P.target && hostile(G, P, P.target) && !T.fire) hint = touch ? 'Put the lead pip ○ in your reticle and hold FIRE' : 'Put the lead pip ○ inside your reticle · hold Space or left-click to fire';
  else if (!hint && T.fire && !T.dock && G.P.kills > 0 && !G.auto && !hostilesNear(3000)) hint = touch ? 'NAV picks a destination · AUTO flies you there' : 'N cycles nav points · Z engages autopilot · M opens the sector map';
  G.contextHint = hint;
  G.ui.touchSync?.();
}
function introTick(dt) {
  if (!G.intro || G.state !== 'flight' || G.seq) return;
  G._introT += dt;
  if (G._tutStage === 0 && G._introT > 1.5) { G._tutStage = 1; G.ui.comms(PEOPLE.ines, '(recorded) Hey, kid. If you\'re hearing this, I\'m late. The Magpie is yours now, and so is the shard in her hold. Get it to Doc Ferro at Tallow Deep. Nobody else.', 6); G.ui.objective('★ Deliver the shard to Doc Ferro at Tallow Deep (Tallow) · route plotted'); }
  if (G._tutStage === 1 && (G._introT > 40 || (G.P.tutorial.steer && G.P.tutorial.throttle && G._introT > 16))) {
    G._tutStage = 2; const P = G.player; const pos = P.pos.clone().addScaledVector(P.fwd, 2000).add(new V3(200, 120, 0));
    const tr = spawnTrader(G, { name: 'Hauler Patient Ox' }); if (tr) { tr.pos.copy(pos).add(new V3(-200, 0, 0)); tr.ai.state = 'idle'; tr.ai.dest = null; }
    const pir = spawnPirates(G, pos.add(new V3(250, 30, -150)), 2, 1, { silent: true }); for (const p of pir) { p.target = tr || P; p.hull = p.hullMax *= 0.7; p.st.dmgMult *= 0.6; }
    G.ui.comms(PEOPLE.trader, 'Raiders on our tail! Anyone out there? Calder traffic, we need help!', 4);
    G.distress = { ship: tr, pirates: pir, paid: false }; if (tr) { G.navs.push({ id: 'distress', name: 'Distress call', kind: 'distress', pos: tr.pos }); G.selectNav('distress'); }
  }
  if (G._tutStage === 2 && G.distress?.paid) { G._tutStage = 3; setTimeout(() => G.ui.comms(PEOPLE.control, 'Calder traffic: nice shooting. Dock at Calder Ring (L when close) to trade, or follow your route to the Ironmere gate.', 6), 4500); const i = G.navs.findIndex((n) => n.kind === 'station'); if (i >= 0) G.navSel = i; G.intro = false; }
}
function step(dt, t) {
  pollPad();
  if (G.hitstop > 0) { G.hitstop -= dt; dt *= 0.06; }
  if (G.state === 'menu') { menuT += dt; stepWorld(dt); attractTick(dt, menuT); visuals(dt); return; }
  if (G.state === 'docked' || (G.state === 'paused' && G.prevState === 'docked')) { hangarTick(dt); G.hud.ctx.clearRect(0, 0, innerWidth, innerHeight); return; }
  if (G.state === 'flight' || G.state === 'dead') {
    const P = G.player;
    if (G.state === 'flight' && P.alive) {
      if (G.seq) seqTick(dt); else { playerInput(dt); autoTick(dt); jumpChargeTick(dt); }
      if (P.cruise > 0 && P.cruise < 1 && !G.auto) P.cruise = Math.min(1, P.cruise + dt / 1.6);
      if (!G.seq) { encounterTick(G, dt); distressTick(G); patrolTick(G, dt); missionsTick(G, dt); introTick(dt); contextTick(); }
      // gate fly-through
      if (!G.seq) for (const g of G.gates) { _a.copy(P.pos).sub(g.pos); if (Math.abs(_a.dot(g.normal)) < 20 && _a.length() < 125 && P.vel.length() > 30) { startJump(g.to, G.sys.id, g); break; } }
      audio.engine(P.throttle, P.boosting, P.cruise >= 1, true);
      if (G.autosaveSoon && !G.seq) { G.autosaveSoon = false; }
    } else audio.engine(0, false, false, false);
    if (G.seq?.type === 'dock' || G.seq?.type === 'launch') { G.player.in.fire = false; }
    if (G.seq?.type === 'dock' && G.seq.done) { /* waiting for fade */ } else stepWorld(dt);
    updateCamera(dt); visuals(dt);
    drawHUD(G, dt); drawMFD(G, dt);
  } else if (G.state === 'map' || G.state === 'paused') { audio.engine(0, false, false, false); }
}
function render() { (G.pipe || pipes.flight).render(); }

// ---------------------------------------------------------------- probe + hooks
const cam = probe(renderer, {
  counts: {},
  teleport: (x, y, z) => G.player?.pos.set(x, y, z),
});
startLoop(renderer, (dt, t) => {
  step(dt, t);
  cam.counts = { ships: G.ships.length, bolts: G.fx.bolts.list.length, particles: G.fx.parts.n, navs: G.navs.length, stations: G.stations.length, planets: G.planets.length, rocks: G.field?.rocks.length || 0 };
  cam.state = G.state; if (G.player) { cam.player = { yaw: 0, pitch: 0, pos: G.player.pos.toArray().map(Math.round), hull: Math.round(G.player.hull), sys: G.sys?.id }; }
}, render);
G.pipe = pipes.flight;
buildMenu(); attract();
cam.dataReady = true;
cam.game = {
  G, S,
  newGame: (o = {}) => { menu.hide(); newGame({ mode: 'story', difficulty: 'normal', ...o }); },
  state: () => ({ state: G.state, sys: G.sys?.id, docked: G.P?.docked, credits: G.P?.credits, hull: G.player?.hull, ships: G.ships.map((s) => s.cls + ':' + s.fac + (s.alive ? '' : '†')), story: G.P?.story, missions: G.P?.missions.map((m) => m.type + '@' + m.sys), seq: G.seq?.type, view: G.view, navs: G.navs.map((n) => n.name) }),
  skipSeq: () => { if (!G.seq) return; if (G.seq.type === 'launch') { G.seq.t = G.seq.T; seqTick(0.016); } else if (G.seq.type === 'dock') { const st = G.seq.st; G.seq = null; dockAt(st.def); } else if (G.seq.type === 'jump') { G.seq.t = 1.8; seqTick(0.016); G.seq.t = 2.5; seqTick(0.016); } },
  dock: (id) => { const st = G.stations.find((s) => !id || s.def.id === id) || G.stations[0]; G.seq = null; dockAt(st.def); },
  launch: () => G.launch(),
  jump: (to) => { G.seq = null; arriveSystem(to, G.SYS[to].gates.includes(G.sys.id) ? G.sys.id : null); },
  tab: (t) => UI.openDock(G, t),
  map: () => G.openMap(), closeMap: () => G.closeMap(),
  view: (v) => { G.view = v; chaseInit = false; },
  spawn: (kind = 'pirates', n = 2, d = 900) => { const P = G.player; const p = P.pos.clone().addScaledVector(P.fwd, d); if (kind === 'pirates') return spawnPirates(G, p, n, 2).length; if (kind === 'trader') return !!spawnTrader(G); return !!spawnShip(G, kind, 'veil', p, { look: P.pos, ai: { state: 'attack' } }); },
  pose: (fn) => fn(G, THREE),
  simulate: (sec, stepDt = 1 / 30) => { for (let t = 0; t < sec; t += stepDt) step(stepDt, 0); },
  target: () => targetNearest(),
  killAll: () => { for (const s of G.ships) if (!s.isPlayer && s.alive && hostile(G, G.player, s)) { s.hull = 1; s.shF = s.shB = 0; } },
  god: (on = true) => { G.player.invuln = on; },
  give: (c) => { G.P.credits += c; },
  story: (stage, branch) => { G.P.story.stage = stage; G.P.story.active = null; if (branch) G.P.story.branch = branch; },
  pause: () => G.pause(), resume: () => G.resume(),
  touch: (on = true) => { I.touch = on; UI.showTouch(on && G.state === 'flight'); },
  hideUI: (on = true) => document.body.classList.toggle('shot', on),
};
