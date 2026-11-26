// Checkers: Event Horizon — game controller: scene, views, animation, input, AI, HUD, menu, save, remix, probe.
import {
  THREE, Q, settings, createRenderer, createPipeline, autoResize, probe, startLoop, stageLights, dust, tween, ease, updateTweens,
  shake, applyShake, flash, sfx, loadDream, initUI, startMenu, settingsButton, toast, store, host,
} from '/shared/sd-kit.js';
import { uniform, instancedBufferAttribute } from 'three/tsl';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as R from './rules.js';
import { THEMES, COLORBLIND, createBoard, pieceKit, pieceMaterial, topperMaterial, createBackdrops, applyBackdrop } from './themes.js';
import { Particles, Shards, Markers, HolesFX, GravesFX, MeteorsFX, PortalsFX, sqPos } from './fx.js';

const { RED, BLACK } = R;
const MODE_INFO = {
  normal: { label: 'Normal', desc: 'Classic American checkers: captures are compulsory, multi-jumps must be finished, reach the far row to crown a king.' },
  blackholes: { label: 'Black Holes', desc: 'Every few turns a black hole forms (one turn of warning). Any piece that ends a move on or diagonally next to it is swallowed — for nobody.' },
  graves: { label: 'Graves', desc: 'Every captured piece leaves a tombstone that blocks its square for a few full turns, closing lanes until it crumbles.' },
  meteors: { label: 'Meteor Shower', desc: 'Meteors are called a turn ahead. Impact destroys whatever is on the square and leaves a smoking crater that blocks it for 2 turns.' },
  portals: { label: 'Portals', desc: 'Two linked portals: end a move on one and your piece steps out of the other — if the exit is free.' },
};
const LEVEL_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard', master: 'Master' };
const DEFAULTS = {
  mode: 'normal', theme: 'classic', opponent: 'ai', aiLevel: 'medium', flyingKings: false, forceCapture: true,
  colors: { light: '', dark: '', red: '', black: '', accent: '' }, holeEvery: 3, graveTurns: 3,
};
const SAVE_KEY = 'checkers-save-v1';

// ---------------------------------------------------------------- config (remix / dream)
let cfg = await loadDream(DEFAULTS, (live) => onLiveDream(live));
sanitize(cfg);
function sanitize(c) {
  if (!MODE_INFO[c.mode]) c.mode = 'normal';
  if (!THEMES[c.theme]) c.theme = 'classic';
  if (!['ai', 'local'].includes(c.opponent)) c.opponent = 'ai';
  if (!LEVEL_LABEL[c.aiLevel]) c.aiLevel = 'medium';
  c.flyingKings = c.flyingKings === true || c.flyingKings === 'true' || c.flyingKings === 'on';
  c.forceCapture = !(c.forceCapture === false || c.forceCapture === 'false' || c.forceCapture === 'off');
  c.holeEvery = Math.max(1, Math.min(8, Math.round(+c.holeEvery || 3)));
  c.graveTurns = Math.max(1, Math.min(8, Math.round(+c.graveTurns || 3)));
  c.colors = Object.assign({ light: '', dark: '', red: '', black: '', accent: '' }, c.colors || {});
  return c;
}
const rulesOpts = (c) => ({ mode: c.mode, flyingKings: c.flyingKings, forceCapture: c.forceCapture, holeEvery: c.holeEvery, graveTurns: c.graveTurns });

// ---------------------------------------------------------------- renderer / scene
initUI();
const renderer = await createRenderer({ toneMapping: 'aces', exposure: 1.0 });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 400);
camera.position.set(0, 10.5, 9);
const lights = stageLights(scene, { shadowSize: 7.5, keyPos: [5, 13, 7] });
lights.key.shadow.radius = 4;
lights.key.shadow.bias = -0.0002;
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
}
const post = createPipeline(renderer, scene, camera, { bloom: { strength: 0.4, radius: 0.45, threshold: 0.85 } });
const controls = new OrbitControls(camera, renderer.domElement);
Object.assign(controls, { enableDamping: true, dampingFactor: 0.08, enablePan: false, minDistance: 7, maxDistance: 30, minPolarAngle: 0.08, maxPolarAngle: 1.22, rotateSpeed: 0.55, zoomSpeed: 0.8 });
controls.target.set(0, 0, 0.2);
// fire-lit braziers etc. need point lights that always exist (light count changes recompile every material)
const fireLights = [0, 1].map(() => { const l = new THREE.PointLight(0xff8a3a, 0, 9, 1.6); scene.add(l); return l; });
const flashLight = new THREE.PointLight(0xffa060, 0, 7, 1.5); flashLight.position.y = 1.2; scene.add(flashLight);

const U = {
  red: uniform(new THREE.Color()), black: uniform(new THREE.Color()), accent: uniform(new THREE.Color()), trim: uniform(new THREE.Color('#efe3c4')),
  boardRough: uniform(0.5), boardMetal: uniform(0), boardEmissive: uniform(0), bump: uniform(0.6),
  frameRough: uniform(0.5), frameMetal: uniform(0), frameGlow: uniform(0),
};
const board = createBoard(scene, U);
const backdrops = createBackdrops(scene, U);
const sparks = new Particles(scene, 700, { additive: true });
const smoke = new Particles(scene, 260, { additive: false, smoke: true });
const shards = new Shards(scene, 180);
const markers = new Markers(scene, 140);
const holes = new HolesFX(scene, sparks, board.holes);
const graves = new GravesFX(scene, sparks, smoke);
const meteors = new MeteorsFX(scene, sparks, smoke, shards);
const portals = new PortalsFX(scene, sparks);
const motes = dust(scene, { count: 46, area: 14, height: 5, size: 0.022 });

// ---------------------------------------------------------------- pieces: 2 instanced bodies (one per side) + 1 instanced topper
const CAP = 40;
const glowAttr = { [RED]: new THREE.InstancedBufferAttribute(new Float32Array(CAP), 1), [BLACK]: new THREE.InstancedBufferAttribute(new Float32Array(CAP), 1) };
glowAttr[RED].setUsage(THREE.DynamicDrawUsage); glowAttr[BLACK].setUsage(THREE.DynamicDrawUsage);
const glowNode = { [RED]: instancedBufferAttribute(glowAttr[RED]), [BLACK]: instancedBufferAttribute(glowAttr[BLACK]) };
const kitCache = {}, matCache = {};
let kit = null;
const bodies = {}, toppers = new THREE.InstancedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicNodeMaterial(), 24);
for (const side of [RED, BLACK]) {
  const m = new THREE.InstancedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicNodeMaterial(), CAP);
  m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; m.count = 0; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  bodies[side] = m; scene.add(m);
}
toppers.castShadow = true; toppers.frustumCulled = false; toppers.count = 0; toppers.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(toppers);
function useKit(kind) {
  kit = kitCache[kind] ??= pieceKit(kind);
  const mats = matCache[kind] ??= { [RED]: pieceMaterial(kind, U.red, U, glowNode[RED]), [BLACK]: pieceMaterial(kind, U.black, U, glowNode[BLACK]), topper: topperMaterial(kind, U) };
  for (const s of [RED, BLACK]) { bodies[s].geometry = kit.body; bodies[s].material = mats[s]; }
  toppers.geometry = kit.topper; toppers.material = mats.topper;
}

// ---------------------------------------------------------------- theme application (live, no reload)
let theme = null, palette = null;
function resolvePalette(t, colors) {
  const p = { ...THEMES[t].colors };
  for (const k of Object.keys(p)) if (colors?.[k] && /^#?[0-9a-f]{3,8}$/i.test(colors[k])) p[k] = colors[k].startsWith('#') ? colors[k] : '#' + colors[k];
  if (settings.colorblind) { p.red = COLORBLIND.red; p.black = COLORBLIND.black; }
  return p;
}
function applyTheme(t, colors = cfg.colors) {
  if (!THEMES[t]) t = 'classic';
  const T = THEMES[t];
  const key = t + JSON.stringify(colors) + settings.colorblind;
  if (theme === key) return;
  theme = key; cfg.theme = t;
  palette = resolvePalette(t, colors);
  U.red.value.set(palette.red); U.black.value.set(palette.black); U.accent.value.set(palette.accent);
  U.trim.value.set(t === 'classic' ? '#efe3c4' : '#d8d2c0');
  U.boardRough.value = T.boardRough; U.boardMetal.value = T.boardMetal; U.boardEmissive.value = T.emissive;
  U.bump.value = { classic: 0.9, space: 1.2, fantasy: 2.4, neon: 0.4 }[t];
  U.frameRough.value = { classic: 0.4, space: 0.35, fantasy: 0.9, neon: 0.35 }[t];
  U.frameMetal.value = { classic: 0, space: 0.6, fantasy: 0, neon: 0.1 }[t];
  U.frameGlow.value = { classic: 0, space: 2.2, fantasy: 1.4, neon: 3.0 }[t];
  board.paint(t, palette);
  useKit(T.piece);
  applyBackdrop(scene, backdrops, t);
  const L = T.lights;
  lights.hemi.color.set(L.sky); lights.hemi.groundColor.set(L.ground); lights.hemi.intensity = L.hemi;
  lights.key.color.set(L.key); lights.key.intensity = L.keyI; lights.rim.color.set(L.rim); lights.rim.intensity = L.rimI; lights.amb.intensity = L.amb;
  renderer.toneMappingExposure = T.exposure;
  scene.environmentIntensity = T.env;
  if (post.bloomNode) { post.bloomNode.strength.value = T.bloom.strength; post.bloomNode.radius.value = T.bloom.radius; post.bloomNode.threshold.value = T.bloom.threshold; }
  motes.mesh.material.color.set(T.dust.color); motes.mesh.material.opacity = T.dust.opacity;
  document.documentElement.style.setProperty('--accent', palette.accent);
  for (const v of views) if (v.captured) stackPos(v.stackSide, v.stackIdx, v.p);
  updateHUD();
}
const sideColor = (side) => (side === RED ? palette.red : palette.black);
const colorOfPiece = (p) => new THREE.Color(sideColor(Math.sign(p) || RED));
const sideName = (side) => THEMES[cfg.theme].sideNames[side === RED ? 0 : 1];

// ---------------------------------------------------------------- piece views (what is drawn; the rules state is the truth)
let views = [], VID = 0;
const STACK_Y = { classic: -0.405, fantasy: -0.405, space: -0.25, neon: -0.25 };
function makeView(sq, piece) {
  const king = Math.abs(piece) === 2;
  return { id: VID++, side: Math.sign(piece), king, sq, p: sq >= 0 ? sqPos(sq) : new THREE.Vector3(), lift: 0, liftT: 0, yaw: Math.random() * 6.28, spin: 0,
    tilt: new THREE.Vector3(), scale: new THREE.Vector3(1, 1, 1), glow: 0, kingT: king ? 1 : 0, crownT: king ? 1 : 0, captured: false, gone: false, mat: null, stackSide: 0, stackIdx: -1 };
}
function stackPos(capturer, idx, out = new THREE.Vector3()) {
  const col = Math.floor(idx / 6), h = idx % 6, H = kit?.H ?? 0.15, y = STACK_Y[cfg.theme] ?? -0.4;
  return capturer === RED ? out.set(5.35, y + h * H, 3.1 - col * 0.98) : out.set(-5.35, y + h * H, -3.1 + col * 0.98);
}
const viewAt = (sq) => views.find((v) => !v.gone && !v.captured && v.sq === sq);

function reconcile(state, instant) {
  const onBoard = views.filter((v) => !v.gone && !v.captured), used = new Set();
  for (const q of R.DARK) {
    const p = state.board[q]; if (!p) continue;
    const v = onBoard.find((x) => x.sq === q && !used.has(x));
    if (v && v.side === Math.sign(p)) {
      used.add(v);
      const k = Math.abs(p) === 2; if (v.king !== k) { v.king = k; v.kingT = v.crownT = k ? 1 : 0; }
      if (instant || !v.mat) { sqPos(q, 0, v.p); v.mat = null; v.scale.set(1, 1, 1); v.tilt.set(0, 0, 0); }
    } else {
      if (v) v.gone = true;
      const nv = makeView(q, p); views.push(nv); used.add(nv);
      if (!instant) { nv.scale.setScalar(0.001); tw(0.35, (e) => nv.scale.setScalar(Math.max(0.001, e)), { ease: ease.outBack }); }
    }
  }
  for (const v of onBoard) if (!used.has(v)) v.gone = true;
  for (const side of [RED, BLACK]) {
    const cap = views.filter((v) => !v.gone && v.captured && v.stackSide === side).sort((a, b) => a.stackIdx - b.stackIdx);
    const need = state.captured[side];
    while (cap.length > need) cap.pop().gone = true;
    for (let i = cap.length; i < need; i++) { const nv = makeView(-1, -side); nv.captured = true; nv.stackSide = side; nv.stackIdx = i; stackPos(side, i, nv.p); views.push(nv); cap.push(nv); }
    if (instant) cap.forEach((v, i) => { v.stackIdx = i; stackPos(side, i, v.p); v.tilt.set(0, 0, 0); v.king = false; });
  }
  views = views.filter((v) => !v.gone);
  updateCounts(state);
}
function updateCounts(state) {
  P.counts = { pieces: R.countPieces(state, RED).total + R.countPieces(state, BLACK).total, holes: state.holes.length, graves: state.graves.length, meteors: state.meteors.length, craters: state.craters.length, portals: state.portals.length, views: views.filter((v) => !v.captured).length };
}
function syncHazards(state, instant) {
  holes.sync(state.holes, state.opts.holeWarn, instant);
  graves.sync(state.graves, colorOfPiece, instant);
  meteors.sync(state.meteors, state.craters, instant);
  portals.sync(state.portals);
}
function fullRebuild(state) {
  views = [];
  for (const h of holes.pool) { h.busy = false; holes.release(h); }
  graves.list.length = 0;
  reconcile(state, true); syncHazards(state, true);
}

// per-frame instance write
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
function writeInstances(t) {
  const n = { [RED]: 0, [BLACK]: 0 }; let tn = 0;
  const push = (side, m, glow) => { if (n[side] >= CAP) return; bodies[side].setMatrixAt(n[side], m); glowAttr[side].array[n[side]] = glow; n[side]++; };
  for (const v of views) {
    if (v.gone) continue;
    if (v.mat) {
      push(v.side, v.mat, v.glow);
      if (v.king) push(v.side, _m2.makeTranslation(0, kit.stack, 0).premultiply(v.mat), v.glow);
      continue;
    }
    _q.setFromEuler(_e.set(v.tilt.x, v.yaw + v.spin, v.tilt.z));
    _p.copy(v.p); _p.y += v.lift;
    _m.compose(_p, _q, v.scale); push(v.side, _m, v.glow);
    if (v.king && v.kingT > 0.001) {
      const drop = (1 - v.kingT) * 1.4;
      _s.set(0, kit.stack * v.scale.y + drop, 0).applyQuaternion(_q).add(_p);
      _m.compose(_s, _q, v.scale); push(v.side, _m, v.glow);
      if (v.crownT > 0.001 && tn < 24) {
        const bob = kit.topperBob ? Math.sin(t * 2.2 + v.id) * kit.topperBob : 0;
        _s.set(0, kit.topperY * v.scale.y + (1 - v.crownT) * 1.8 + bob, 0).applyQuaternion(_q).add(_p);
        const cq = new THREE.Quaternion().setFromEuler(_e.set(v.tilt.x, v.yaw + t * (kit.topperSpin || 0), v.tilt.z));
        const cs = Math.min(1, v.crownT * 1.2);
        _m.compose(_s, cq, _p.set(cs, cs, cs).multiply(v.scale)); toppers.setMatrixAt(tn++, _m);
        _p.copy(v.p); _p.y += v.lift;
      }
    }
  }
  for (const s of [RED, BLACK]) { bodies[s].count = n[s]; bodies[s].instanceMatrix.needsUpdate = true; glowAttr[s].needsUpdate = true; }
  toppers.count = tn; toppers.instanceMatrix.needsUpdate = true;
}

// ---------------------------------------------------------------- animation helpers (speed-scalable for tests)
const G = {
  state: null, cfg, history: [], phase: 'boot', busy: false, paused: false, sel: -1, prefix: [], legal: [], speed: 1, autoplay: false, seq: 0,
  trail: null, hint: null, cursor: R.sqOf(5, 0), cursorOn: false, hover: -1, stats: null, demoLevel: { depth: 3, time: 120, noise: 40, blunder: 0.15 },
};
const tw = (d, fn, o) => { if (G.speed >= 50) { fn(1, 1); return Promise.resolve(); } return tween(d / G.speed, fn, o); };
const wait = (s) => tw(s, () => {});
const rnd = (a, b) => a + Math.random() * (b - a);

async function animateHop(v, a, b, capSq, side) {
  if (!v) return;
  const pa = sqPos(a), pb = sqPos(b), jump = capSq >= 0, dist = pa.distanceTo(pb);
  const cv = jump ? viewAt(capSq) : null;
  let took = false;
  if (jump) sfx.whoosh();
  const dur = jump ? 0.34 + dist * 0.035 : 0.22 + dist * 0.03, h = jump ? 0.55 + dist * 0.05 : 0.1;
  const dx = pb.x - pa.x, dz = pb.z - pa.z;
  await tw(dur, (k) => {
    v.p.lerpVectors(pa, pb, k); v.p.y = Math.sin(Math.PI * k) * h;
    const lean = Math.sin(Math.PI * k) * (jump ? 0.35 : 0.12);
    v.tilt.set(dz / dist * lean, 0, -dx / dist * lean);
    if (jump && !took && k > 0.5) { took = true; capture(cv, side); }
  }, { ease: ease.inOutCubic });
  if (jump && !took) capture(cv, side);
  v.tilt.set(0, 0, 0); v.p.y = 0; v.sq = b;
  sfx.move();
  smoke.burst(5, () => { const a2 = Math.random() * 6.28; return { pos: new THREE.Vector3(pb.x + Math.cos(a2) * 0.35, 0.03, pb.z + Math.sin(a2) * 0.35), vel: new THREE.Vector3(Math.cos(a2) * 0.4, 0.12, Math.sin(a2) * 0.4), drag: 3, life: 0.6, size: 0.12, size1: 0.3, color: cfg.theme === 'neon' || cfg.theme === 'space' ? 0x8090c0 : 0xb8a080, alpha: 0.35 }; });
  tw(0.16, (k) => v.scale.set(1 + 0.12 * (1 - k), 1 - 0.22 * (1 - k), 1 + 0.12 * (1 - k)));
}

function capture(cv, capturer) {
  if (!cv) return;
  sfx.capture(); shake(0.07);
  const pos = cv.p.clone().setY(0.08);
  shards.burst(pos, new THREE.Color(sideColor(cv.side)), 16, 1);
  sparks.burst(18, () => { const a = Math.random() * 6.28, s = rnd(1, 3); return { pos: pos.clone(), vel: new THREE.Vector3(Math.cos(a) * s, rnd(0.5, 2.5), Math.sin(a) * s), gravity: 5, drag: 1.5, life: rnd(0.35, 0.7), size: 0.07, size1: 0.01, color: palette.accent, intensity: 3.5 }; });
  flashLight.position.set(pos.x, 0.8, pos.z); flashLight.color.set(palette.accent); flashLight.intensity = 6;
  cv.king = false; cv.kingT = 0; cv.crownT = 0; cv.captured = true; cv.stackSide = capturer;
  cv.stackIdx = views.filter((v) => !v.gone && v.captured && v.stackSide === capturer && v !== cv).length;
  const start = cv.p.clone(), target = stackPos(capturer, cv.stackIdx), spin0 = cv.spin;
  // FABLE: captured pieces should tumble with real rigid-body physics and clack onto the stack.
  tw(0.8, (k) => {
    cv.p.lerpVectors(start, target, k); cv.p.y = start.y + (target.y - start.y) * k + Math.sin(Math.PI * k) * 2.0;
    cv.spin = spin0 + k * 10; cv.tilt.x = Math.sin(Math.PI * k) * 1.4;
  }, { ease: ease.inOutCubic }).then(() => { cv.tilt.set(0, 0, 0); if (cv.captured) stackPos(capturer, cv.stackIdx, cv.p); sfx.click(); });
}

async function promoteAnim(v) {
  if (!v) return;
  v.king = true; v.kingT = 0; v.crownT = 0;
  await tw(0.34, (k) => { v.kingT = k; }, { ease: ease.outBack });
  sfx.thud();
  sfx.chime(); flash(hexA(palette.accent, 0.35), 260);
  // FABLE: coronation moment — light shaft, choir sting, slow-mo crown spin.
  const c = v.p.clone().setY(0.4);
  sparks.burst(28, (i) => { const a = i / 28 * 6.28; return { pos: c.clone(), vel: new THREE.Vector3(Math.cos(a) * 1.6, rnd(0.3, 1.2), Math.sin(a) * 1.6), drag: 2.2, life: 0.9, size: 0.08, size1: 0.01, color: palette.accent, intensity: 4 }; });
  await tw(0.55, (k) => { v.crownT = k; }, { ease: ease.outBack });
}

async function portalAnim(v, from, to) {
  if (!v) return;
  sfx.whoosh(); portals.flash(from);
  const spin0 = v.spin;
  await tw(0.32, (k) => { v.p.y = -0.22 * k; v.scale.set(1 - 0.75 * k, 1 - 0.9 * k, 1 - 0.75 * k); v.spin = spin0 + k * 8; }, { ease: ease.inQuad });
  sqPos(to, -0.22, v.p); v.sq = to; portals.flash(to); sfx.magic();
  const c = sqPos(to, 0.1), col = portals.items[(portals.items.findIndex((it) => it.sq === to))]?.col ?? new THREE.Color(0x33e6ff);
  sparks.burst(24, () => { const a = Math.random() * 6.28, s = rnd(0.6, 1.8); return { pos: c.clone(), vel: new THREE.Vector3(Math.cos(a) * s, rnd(0.6, 2), Math.sin(a) * s), drag: 2, life: 0.8, size: 0.07, size1: 0.01, color: col, intensity: 3.5 }; });
  await tw(0.42, (k) => { v.p.y = -0.22 * (1 - k) + Math.sin(Math.PI * k) * 0.35; const s = 0.25 + 0.75 * k; v.scale.set(s, Math.max(0.1, k), s); v.spin = spin0 + 8 + k * 5; }, { ease: ease.outCubic });
  v.scale.set(1, 1, 1); v.p.y = 0;
}

async function suckAnim(v, holeSq) {
  if (!v) return;
  sfx.suck(); shake(0.12);
  const c = sqPos(holeSq, 0.34), s = v.p.clone();
  let r0 = Math.hypot(s.x - c.x, s.z - c.z), a0 = Math.atan2(s.z - c.z, s.x - c.x);
  if (r0 < 0.05) { r0 = 0.35; a0 = Math.random() * 6.28; }
  v.mat = new THREE.Matrix4();
  const col = new THREE.Color(sideColor(v.side));
  const q = new THREE.Quaternion(), e = new THREE.Euler(), pos = new THREE.Vector3(), sc = new THREE.Vector3();
  // FABLE: true vertex-level spaghettification (tidal stretch along the geodesic) + crunchy "event horizon" audio.
  await tw(1.2, (k) => {
    const kk = k * k, r = r0 * (1 - kk), ang = a0 + kk * 7;
    pos.set(c.x + Math.cos(ang) * r, s.y + (c.y - s.y) * k + Math.sin(Math.PI * k) * 0.18, c.z + Math.sin(ang) * r);
    const stretch = 1 + 4.2 * kk, thin = Math.max(0.05, 1 - 0.85 * kk), shrink = k > 0.8 ? Math.max(0.001, (1 - k) / 0.2) : 1;
    const dx = c.x - pos.x, dz = c.z - pos.z;
    q.setFromEuler(e.set(0, Math.atan2(-dz, dx), -0.5 * kk));
    v.mat.compose(pos, q, sc.set(stretch * shrink, thin * shrink, thin * shrink));
    if (Math.random() < 0.6) sparks.emit({ pos: pos.clone(), vel: new THREE.Vector3(-Math.sin(ang), 0, Math.cos(ang)).multiplyScalar(0.6), attract: c, swirl: 2.5, life: 0.9, size: 0.06, size1: 0.01, color: col, intensity: 2.5 });
  }, { ease: (t) => t });
  v.gone = true; v.mat = null;
  const h = holes.get(holeSq); if (h) h.open.value = 1.35;
  sparks.burst(14, () => { const a = Math.random() * 6.28; return { pos: c.clone(), vel: new THREE.Vector3(Math.cos(a) * 2, rnd(-0.2, 0.4), Math.sin(a) * 2), drag: 3, life: 0.5, size: 0.06, size1: 0.01, color: 0xffc080, intensity: 4 }; });
}

async function holeOpenAnim(sq) {
  const h = holes.get(sq) || holes.alloc(sq); if (!h) return;
  h.busy = true; h.level.open = 1; h.level.warn = 0.25;
  sfx.zap(); sfx.whoosh(); shake(0.22); flash('rgba(150,90,255,0.32)', 300);
  const c = sqPos(sq, 0.2);
  sparks.burst(40, (i) => { const a = i / 40 * 6.28; return { pos: c.clone(), vel: new THREE.Vector3(Math.cos(a) * 3.2, 0.1, Math.sin(a) * 3.2), drag: 2.5, life: 0.7, size: 0.09, size1: 0.02, color: i % 2 ? 0xb080ff : 0xffa060, intensity: 3 }; });
  const w0 = h.warn.value;
  // FABLE: opening needs a gravitational-wave ripple across the board + deep sub-bass hit.
  await tw(0.9, (k, raw) => { h.open.value = k; h.warn.value = w0 * (1 - raw) + 0.25 * raw; }, { ease: ease.outElastic });
  h.busy = false;
}
async function holeCloseAnim(sq) {
  const h = holes.get(sq); if (!h) return;
  h.busy = true; sfx.magic();
  const o0 = h.open.value;
  await tw(0.8, (k) => { h.open.value = o0 * (1 - k); h.warn.value = 0; }, { ease: ease.inQuad });
  const c = sqPos(sq, 0.34);
  sparks.burst(36, () => { const v = new THREE.Vector3(rnd(-1, 1), rnd(-0.3, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(1.5, 3.5)); return { pos: c.clone(), vel: v, drag: 2, life: rnd(0.6, 1.1), size: 0.07, size1: 0.01, color: 0xcfe6ff, intensity: 3.5 }; });
  holes.release(h);
}

const hexA = (hex, a) => { const c = new THREE.Color(hex); return `rgba(${Math.round(Math.pow(c.r, 1 / 2.2) * 255)},${Math.round(Math.pow(c.g, 1 / 2.2) * 255)},${Math.round(Math.pow(c.b, 1 / 2.2) * 255)},${a})`; };

async function playEvents(after, seq) {
  const ev = after.events;
  for (let i = 0; i < ev.length; i++) {
    if (seq !== G.seq) return;
    const e = ev[i];
    switch (e.type) {
      case 'promote': await promoteAnim(viewAt(e.sq)); G.stats.kings[e.side]++; break;
      case 'portal': await portalAnim(viewAt(e.from), e.from, e.to); break;
      case 'portalBlocked': portals.flash(e.exit); if (isHumanSide(after.turn * -1)) toast('Exit portal blocked — no jump'); break;
      case 'suck': {
        const group = [e]; while (ev[i + 1]?.type === 'suck') group.push(ev[++i]);
        await Promise.all(group.map((s) => suckAnim(viewAt(s.sq), s.hole)));
        for (const s of group) G.stats.void[s.side]++;
        break;
      }
      case 'holeOpen': await holeOpenAnim(e.sq); break;
      case 'holeClose': holeCloseAnim(e.sq); break;
      case 'graveFade': graves.fade(e.sq); sfx.whoosh(); break;
      case 'graveRise': graves.sync(after.graves.filter((g) => g.sq === e.sq).concat(graves.list.filter((g) => !g.dying).map((g) => ({ sq: g.sq, piece: g.piece, ttl: g.ttl, max: g.max }))), colorOfPiece, false); sfx.thud(); await wait(0.25); break;
      case 'holeWarn': holes.sync(after.holes, after.opts.holeWarn, false); sfx.magic(); toast(`A black hole is forming on ${R.nameOf(e.sq)}…`, 2600); await wait(0.4); break;
      case 'meteorWarn': meteors.sync(after.meteors, after.craters, false); sfx.check(); toast(`Meteor incoming: ${R.nameOf(e.sq)}!`, 2400); await wait(0.3); break;
      case 'meteorImpact':
        await meteors.impact(e.sq, tw, ease, () => {
          sfx.thud(); sfx.capture(); shake(0.32); flash('rgba(255,140,60,0.3)', 260);
          flashLight.position.set(...sqPos(e.sq, 1).toArray()); flashLight.color.set(0xff7a30); flashLight.intensity = 14;
          const v = viewAt(e.sq); if (v) { shards.burst(v.p.clone().setY(0.1), new THREE.Color(sideColor(v.side)), 22, 1.4); v.gone = true; G.stats.void[v.side]++; }
          meteors.sync(after.meteors, after.craters, false);
        });
        break;
      default: break;
    }
  }
}

// ---------------------------------------------------------------- AI (Web Worker; main-thread fallback)
let worker = null, aiId = 0; const aiWait = new Map();
try {
  worker = new Worker(new URL('./ai-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => { const r = aiWait.get(e.data.id); aiWait.delete(e.data.id); r?.(e.data); };
  worker.onerror = (e) => { console.warn('AI worker failed, using main thread', e.message); worker = null; for (const [, r] of aiWait) r({ error: 'worker' }); aiWait.clear(); };
} catch { worker = null; }
let localSearch = null;
async function askAI(state, level) {
  if (worker) {
    const r = await new Promise((res) => { const id = ++aiId; aiWait.set(id, res); worker.postMessage({ id, state: R.serialize(state), level }); });
    if (!r.error) return r;
  }
  localSearch ??= (await import('./ai.js')).createSearch();
  const lv = typeof level === 'string' ? { ...(await import('./ai.js')).LEVELS[level] } : { ...level };
  lv.time = Math.min(lv.time, 400);
  return localSearch.think(state, lv);
}

// ---------------------------------------------------------------- game flow
const isHumanSide = (side) => G.phase === 'play' && !G.autoplay && (cfg.opponent === 'local' || side === RED);
const isAITurn = () => !G.state.result && (G.phase === 'demo' || G.autoplay || (G.phase === 'play' && cfg.opponent === 'ai' && G.state.turn === BLACK));

function newStats() { return { kings: { [RED]: 0, [BLACK]: 0 }, void: { [RED]: 0, [BLACK]: 0 }, longest: 0, start: performance.now() }; }

function newGame(c = cfg, { phase = 'play', state = null, history = [] } = {}) {
  G.seq++;
  cfg = G.cfg = sanitize(c);
  applyTheme(cfg.theme, cfg.colors);
  G.state = state || R.newGame(rulesOpts(cfg));
  G.history = history; G.phase = phase; G.busy = false; G.paused = false; G.sel = -1; G.prefix = []; G.trail = null; G.hint = null;
  G.stats = newStats();
  fullRebuild(G.state);
  document.getElementById('end').classList.add('hidden');
  document.getElementById('hud').classList.toggle('hidden', phase !== 'play');
  if (phase === 'play') { camHome(cfg.opponent === 'local' ? G.state.turn : RED); host('start', { mode: cfg.mode, theme: cfg.theme }); }
  beginTurn();
}

async function beginTurn() {
  const seq = G.seq, s = G.state;
  G.legal = s.result ? [] : R.legalMoves(s);
  updateHUD();
  if (s.result) return endGame();
  if (G.paused) return;
  if (isAITurn()) {
    G.busy = true; updateHUD();
    const t0 = performance.now();
    const level = G.phase === 'demo' ? G.demoLevel : G.autoplay ? G.autoLevel || { depth: 4, time: 80, noise: 10, blunder: 0 } : cfg.aiLevel;
    const r = await askAI(s, level);
    if (seq !== G.seq) return;
    const minThink = G.phase === 'demo' ? 0.5 : 0.45;
    const el = (performance.now() - t0) / 1000; if (el < minThink) await wait(minThink - el);
    if (seq !== G.seq || G.paused && G.phase !== 'demo') { G.busy = false; return; }
    const mv = G.legal.find((m) => R.moveKey(m) === R.moveKey(r.move)) || G.legal[0];
    await performMove(mv);
  } else {
    G.busy = false;
    if (cfg.opponent === 'local' && G.phase === 'play') camHome(s.turn);
    if (G.phase === 'play' && cfg.forceCapture && G.legal[0]?.caps.length && G.history.length < 30 && !G.taughtForce) { G.taughtForce = true; toast('Capture available — taking is compulsory!', 2600); }
  }
}

async function performMove(mv, hopsDone = 0) {
  const seq = G.seq;
  G.busy = true; G.sel = -1; G.prefix = []; G.hint = null;
  const before = G.state, after = R.applyMove(before, mv);
  G.history.push(before); if (G.history.length > 300) G.history.shift();
  G.trail = { path: mv.path.slice(), side: before.turn, t: 0 };
  G.stats.longest = Math.max(G.stats.longest, mv.caps.length);
  const v = viewAt(mv.path[hopsDone]);
  for (let i = hopsDone; i < mv.path.length - 1; i++) {
    await animateHop(v, mv.path[i], mv.path[i + 1], mv.caps.length ? mv.caps[i] : -1, before.turn);
    if (seq !== G.seq) return;
  }
  if (mv.caps.length >= 3) toast(`${mv.caps.length}-piece chain!`, 1600);
  await playEvents(after, seq);
  if (seq !== G.seq) return;
  G.state = after;
  reconcile(after, false); syncHazards(after, false);
  save();
  G.busy = false;
  beginTurn();
}

// human input: hop-by-hop through the legal move tree
const startsWith = (path, pre) => pre.every((q, i) => path[i] === q);
function nextTargets() {
  if (G.sel < 0) return [];
  const pre = G.prefix.length ? G.prefix : [G.sel];
  const out = new Map();
  for (const m of G.legal) if (startsWith(m.path, pre) && m.path.length > pre.length) out.set(m.path[pre.length], m);
  return [...out.entries()].map(([sq, m]) => ({ sq, cap: m.caps.length > 0, m }));
}
function canInput() { return G.phase === 'play' && !G.busy && !G.paused && !G.state.result && isHumanSide(G.state.turn); }
function piecesWithMoves() { return new Set(G.legal.map((m) => m.from)); }

function onSquare(sq) {
  if (!canInput()) return;
  const s = G.state, mid = G.prefix.length > 1;
  const targets = nextTargets(), hit = targets.find((t) => t.sq === sq);
  if (hit) return humanHop(sq);
  if (mid) { sfx.error(); toast('Keep jumping — the chain must be finished!'); return; }
  const p = sq >= 0 ? s.board[sq] : 0;
  if (p && R.sideOf(p) === s.turn) {
    if (piecesWithMoves().has(sq)) { G.sel = sq; G.prefix = [sq]; sfx.select(); return; }
    sfx.error();
    if (G.legal[0]?.caps.length && cfg.forceCapture) { toast('You must capture! Glowing pieces can jump.'); G.forcePulse = 1.5; }
    else toast('That piece has no moves');
    return;
  }
  if (G.sel >= 0) { G.sel = -1; G.prefix = []; sfx.click(); }
}

async function humanHop(target) {
  const pre = [...(G.prefix.length ? G.prefix : [G.sel]), target];
  const cands = G.legal.filter((m) => startsWith(m.path, pre));
  if (!cands.length) return;
  const done = cands.find((m) => m.path.length === pre.length);
  if (done) return performMove(done, pre.length - 2);
  // mid-chain: animate this hop now, keep the piece selected for the next one
  const seq = G.seq, i = pre.length - 2;
  G.busy = true;
  await animateHop(viewAt(pre[i]), pre[i], target, cands[0].caps[i], G.state.turn);
  if (seq !== G.seq) return;
  G.prefix = pre; G.sel = target; G.busy = false; sfx.select();
  // multi-hop human captures: the view now sits on `target` but the rules state hasn't moved yet
}

function undo() {
  if (G.phase !== 'play' || G.busy || !G.history.length) { sfx.error(); return; }
  let s = G.history.pop();
  if (cfg.opponent === 'ai') while (s.turn !== RED && G.history.length) s = G.history.pop();
  G.seq++;
  G.state = s; G.sel = -1; G.prefix = []; G.trail = null; G.hint = null;
  fullRebuild(s); sfx.whoosh(); toast('Move undone', 1200);
  save(); beginTurn();
}
async function hint() {
  if (!canInput()) { sfx.error(); return; }
  const seq = G.seq; sfx.click(); toast('Thinking…', 900);
  const r = await askAI(G.state, 'hard');
  if (seq !== G.seq || !r.move) return;
  G.hint = { path: r.move.path, t: 0 };
}

function save() {
  if (G.phase !== 'play') return;
  if (G.state.result) { store.set(SAVE_KEY, null); return; }
  store.set(SAVE_KEY, { cfg, state: R.serialize(G.state), history: G.history.slice(-40).map(R.serialize), t: Date.now() });
}
function loadSave() {
  const sv = store.get(SAVE_KEY);
  if (!sv?.state || sv.state.result) return null;
  try { return { cfg: sanitize({ ...DEFAULTS, ...sv.cfg }), state: R.deserialize(sv.state), history: (sv.history || []).map(R.deserialize) }; } catch { return null; }
}

function endGame() {
  if (G.phase === 'demo') { setTimeout(() => { if (G.phase === 'demo') newGame({ ...cfg }, { phase: 'demo' }); }, 2500 / G.speed); return; }
  if (G.phase !== 'play') return;
  G.phase = 'over'; G.sel = -1;
  store.set(SAVE_KEY, null);
  const r = G.state.result, w = r.winner;
  let title;
  if (w === 0) { title = 'Draw'; sfx.chime(); }
  else if (cfg.opponent === 'ai' && !G.autoplay) { title = w === RED ? 'Victory!' : 'Defeat'; (w === RED ? sfx.win : sfx.lose)(); }
  else { title = `${sideName(w)} wins!`; sfx.win(); }
  if (w !== 0) celebrate(w);
  host('end', { mode: cfg.mode, winner: w === RED ? 'red' : w === BLACK ? 'black' : 'draw', plies: G.state.ply });
  document.getElementById('end-title').textContent = title;
  document.getElementById('end-reason').textContent = r.reason + (w ? ` — ${sideName(w)} takes the board.` : '.');
  const st = G.stats, s = G.state;
  const mins = Math.max(1, Math.round((performance.now() - st.start) / 60000));
  document.getElementById('end-stats').innerHTML = [
    [Math.ceil(s.ply / 2), 'moves'], [`${s.captured[RED]}–${s.captured[BLACK]}`, 'captures'], [st.longest, 'best chain'],
    [`${st.kings[RED]}–${st.kings[BLACK]}`, 'kings'], [s.lost[RED] + s.lost[BLACK], cfg.mode === 'blackholes' ? 'lost to the void' : 'lost to hazards'], [`${mins}m`, 'played'],
  ].map(([v, l]) => `<div><b>${v}</b>${l}</div>`).join('');
  setTimeout(() => { if (G.phase === 'over') document.getElementById('end').classList.remove('hidden'); }, 1100 / Math.min(G.speed, 4));
  updateHUD();
}
function celebrate(w) {
  // FABLE: victory needs a bespoke sequence (pieces leap and spin, fireworks over the board, music sting).
  const col = new THREE.Color(sideColor(w));
  let n = 0; const iv = setInterval(() => {
    if (++n > 8 || G.phase !== 'over') return clearInterval(iv);
    const c = new THREE.Vector3(rnd(-3, 3), rnd(2, 4), rnd(-3, 3));
    sparks.burst(40, () => { const v = new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(1.5, 3)); return { pos: c.clone(), vel: v, gravity: 2, drag: 1.2, life: rnd(0.8, 1.4), size: 0.08, size1: 0.02, color: Math.random() < 0.5 ? col : palette.accent, intensity: 4 }; });
    sfx.zap();
  }, 280);
}

// ---------------------------------------------------------------- camera
let camAnim = null;
function fitDistance() {
  const a = innerWidth / innerHeight, vf = THREE.MathUtils.degToRad(camera.fov) / 2;
  const needW = 6.4 / (Math.tan(vf) * a), needH = 6.6 / Math.tan(vf);
  return Math.max(12.5, needW * 0.92, needH * 0.82);
}
function camHome(side = RED, instant = false) {
  const az = side === RED ? 0 : Math.PI, polar = innerWidth / innerHeight < 0.8 ? 0.5 : 0.74, dist = fitDistance();
  const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
  let daz = az - sph.theta; while (daz > Math.PI) daz -= 2 * Math.PI; while (daz < -Math.PI) daz += 2 * Math.PI;
  if (Math.abs(daz) < 0.02 && Math.abs(sph.phi - polar) < 0.02 && Math.abs(sph.radius - dist) < 0.2) return;
  const from = { t: sph.theta, p: sph.phi, r: sph.radius }, id = {};
  camAnim = id;
  const set = (k) => { const s = new THREE.Spherical(from.r + (dist - from.r) * k, from.p + (polar - from.p) * k, from.t + daz * k); camera.position.setFromSpherical(s).add(controls.target); camera.lookAt(controls.target); };
  if (instant || settings.reducedMotion) { set(1); return; }
  tween(1.1, (k) => { if (camAnim === id) set(k); }, { ease: ease.inOutCubic });
}

// ---------------------------------------------------------------- input
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.1), hitP = new THREE.Vector3();
function squareAt(cx, cy) {
  ndc.set(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  if (!ray.ray.intersectPlane(plane, hitP)) return -1;
  const c = Math.floor(hitP.x + 4), r = Math.floor(hitP.z + 4);
  if (c < 0 || c > 7 || r < 0 || r > 7) return -1;
  return R.sqOf(r, c);
}
let down = null;
renderer.domElement.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!down) return; const d = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t; down = null;
  if (d < 10 && dt < 600) { G.cursorOn = false; onSquare(squareAt(e.clientX, e.clientY)); }
});
renderer.domElement.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') G.hover = squareAt(e.clientX, e.clientY); });
addEventListener('keydown', (e) => {
  if (document.getElementById('menu') && !document.getElementById('menu').classList.contains('hide')) return;
  const k = e.key;
  if (k === 'u' || k === 'U') return undo();
  if (k === 'h' || k === 'H') return hint();
  if (k === 'Escape') { if (G.sel >= 0 && G.prefix.length < 2) { G.sel = -1; G.prefix = []; sfx.click(); } else openMenu(); return; }
  const flip = cfg.opponent === 'local' && G.state?.turn === BLACK ? -1 : 1;
  const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[k];
  if (d) {
    e.preventDefault(); G.cursorOn = true;
    const r = Math.max(0, Math.min(7, R.rowOf(G.cursor) + d[0] * flip)), c = Math.max(0, Math.min(7, R.colOf(G.cursor) + d[1] * flip));
    G.cursor = R.sqOf(r, c); sfx.click(); return;
  }
  if (k === 'Enter' || k === ' ') { e.preventDefault(); G.cursorOn = true; onSquare(G.cursor); }
});

// ---------------------------------------------------------------- HUD
const $ = (id) => document.getElementById(id);
function updateHUD() {
  if (!G.state || !palette) return;
  const s = G.state;
  for (const [side, id] of [[RED, 'card-r'], [BLACK, 'card-b']]) {
    const el = $(id), c = R.countPieces(s, side);
    el.style.setProperty('--c', sideColor(side));
    el.querySelector('.nm').textContent = sideName(side);
    el.querySelector('.who').textContent = cfg.opponent === 'ai' ? (side === RED ? 'You' : `AI · ${LEVEL_LABEL[cfg.aiLevel]}`) : (side === RED ? 'Player 1' : 'Player 2');
    el.querySelector('.m').textContent = c.men; el.querySelector('.k').textContent = c.kings; el.querySelector('.x').textContent = s.captured[side];
    el.classList.toggle('active', !s.result && s.turn === side);
  }
  const pill = $('turn'), txt = pill.querySelector('.txt');
  pill.style.setProperty('--c', sideColor(s.turn));
  const ai = isAITurn() && G.phase === 'play';
  pill.classList.toggle('think', ai);
  if (s.result) txt.textContent = s.result.winner === 0 ? 'Draw' : `${sideName(s.result.winner)} wins`;
  else if (ai) txt.textContent = 'AI is thinking';
  else if (cfg.opponent === 'ai') txt.textContent = G.legal[0]?.caps.length && cfg.forceCapture ? 'Your move — capture!' : 'Your move';
  else txt.textContent = `${sideName(s.turn)} to move${G.legal[0]?.caps.length && cfg.forceCapture ? ' — capture!' : ''}`;
  const hz = $('hazard'); let msg = '', warn = false;
  if (cfg.mode === 'blackholes') {
    const tele = s.holes.filter((h) => h.warn > 0), live = s.holes.filter((h) => h.warn === 0);
    if (tele.length) { msg = `⚠ Black hole opening on ${tele.map((h) => R.nameOf(h.sq)).join(', ')} — clear the area!`; warn = true; }
    else msg = `${live.length ? `${live.length} black hole${live.length > 1 ? 's' : ''} active · ` : ''}next forms in ~${Math.max(1, Math.ceil(s.holeClock / 2))} turn${s.holeClock > 2 ? 's' : ''}`;
  } else if (cfg.mode === 'graves') msg = s.graves.length ? `${s.graves.length} grave${s.graves.length > 1 ? 's' : ''} blocking squares` : 'Captured pieces leave graves that block squares';
  else if (cfg.mode === 'meteors') { if (s.meteors.length) { msg = `☄ Meteor incoming: ${s.meteors.map((m) => R.nameOf(m.sq)).join(', ')}`; warn = true; } else msg = s.craters.length ? `${s.craters.length} crater${s.craters.length > 1 ? 's' : ''} smouldering` : `Next meteor in ~${Math.max(1, Math.ceil(s.meteorClock / 2))} turns`; }
  else if (cfg.mode === 'portals') msg = `Portals ${s.portals.map(R.nameOf).join(' ⇄ ')} — end a move on one to exit the other`;
  if (!s.result && s.quiet >= 50) msg += `${msg ? ' · ' : ''}Draw in ${Math.ceil((s.opts.quietLimit - s.quiet) / 2)} moves without a capture`;
  hz.textContent = G.phase === 'play' ? msg : ''; hz.classList.toggle('warn', warn);
  $('btn-undo').disabled = !G.history.length || G.phase !== 'play';
  $('btn-hint').disabled = !canInput();
}

// ---------------------------------------------------------------- menu + end screen
function menuOptions() {
  return [
    { key: 'mode', label: 'Mode', value: cfg.mode, choices: Object.entries(MODE_INFO).map(([v, m]) => ({ v, label: m.label })) },
    { key: 'theme', label: 'Theme', value: cfg.theme, choices: Object.entries(THEMES).map(([v, t]) => ({ v, label: t.label })) },
    { key: 'opponent', label: 'Opponent', value: cfg.opponent, choices: [{ v: 'ai', label: 'vs AI' }, { v: 'local', label: 'Local 2-player' }] },
    { key: 'aiLevel', label: 'AI level', value: cfg.aiLevel, choices: Object.entries(LEVEL_LABEL).map(([v, label]) => ({ v, label })) },
    { key: 'flyingKings', label: 'Kings', value: cfg.flyingKings ? 'on' : 'off', choices: [{ v: 'off', label: 'Standard' }, { v: 'on', label: 'Flying (long-range)' }] },
    { key: 'forceCapture', label: 'Captures', value: cfg.forceCapture ? 'on' : 'off', choices: [{ v: 'on', label: 'Compulsory' }, { v: 'off', label: 'Optional' }] },
  ];
}
const menu = startMenu({
  title: 'Checkers: Event Horizon',
  subtitle: 'Classic checkers — until the board starts fighting back.',
  options: menuOptions(), startLabel: 'New game',
  onStart: (vals) => { menuValuesToCfg(vals); store.set(SAVE_KEY, null); G.autoplay = false; newGame(cfg, { phase: 'play' }); },
});
function menuValuesToCfg(vals) {
  Object.assign(cfg, { mode: vals.mode, theme: vals.theme, opponent: vals.opponent, aiLevel: vals.aiLevel, flyingKings: vals.flyingKings === 'on', forceCapture: vals.forceCapture !== 'off' });
  sanitize(cfg);
}
{
  const card = menu.el.querySelector('.sd-card');
  const modeRow = card.querySelector('.sd-row[data-key="mode"]');
  const desc = document.createElement('p'); desc.className = 'mode-desc'; desc.textContent = MODE_INFO[cfg.mode].desc;
  modeRow.after(desc);
  const aiRow = card.querySelector('.sd-row[data-key="aiLevel"]');
  const syncAiRow = () => { const on = menu.values.opponent === 'ai'; aiRow.style.opacity = on ? 1 : 0.35; aiRow.style.pointerEvents = on ? '' : 'none'; };
  syncAiRow();
  card.addEventListener('click', (e) => {
    const row = e.target.closest('.sd-row[data-key]'); if (!row || !e.target.closest('.sd-btn')) return;
    const k = row.dataset.key, v = menu.values[k];
    if (k === 'mode') { desc.textContent = MODE_INFO[v].desc; if (G.phase === 'demo') newGame({ ...cfg, mode: v }, { phase: 'demo' }); }
    if (k === 'theme') applyTheme(v);
    if (k === 'opponent') syncAiRow();
  });
  const startRow = card.querySelector('#sd-start').parentElement;
  const cont = document.createElement('button'); cont.className = 'sd-btn'; cont.id = 'sd-continue'; cont.textContent = 'Continue';
  startRow.prepend(cont);
  cont.addEventListener('click', () => {
    sfx.select(); menu.hide();
    if (G.phase === 'play' && G.paused) { G.paused = false; $('hud').classList.remove('hidden'); camHome(cfg.opponent === 'local' ? G.state.turn : RED); beginTurn(); return; }
    const sv = loadSave(); if (!sv) return newGame(cfg, { phase: 'play' });
    newGame(sv.cfg, { phase: 'play', state: sv.state, history: sv.history });
  });
  const foot = document.createElement('div'); foot.className = 'menu-foot';
  foot.textContent = 'Red moves first · 40 moves each without a capture or crowning is a draw · threefold repetition draws';
  card.appendChild(foot);
  menu.refresh = () => {
    const resumable = (G.phase === 'play' && G.paused) || !!loadSave();
    cont.style.display = resumable ? '' : 'none';
    cont.textContent = G.phase === 'play' && G.paused ? 'Resume' : 'Continue';
  };
}
function openMenu() {
  if (G.phase === 'play') { G.paused = true; $('hud').classList.add('hidden'); }
  // reflect live config into the menu buttons
  for (const o of menuOptions()) {
    menu.values[o.key] = o.value;
    menu.el.querySelectorAll(`.sd-row[data-key="${o.key}"] .sd-btn`).forEach((b) => b.classList.toggle('on', b.dataset.v === o.value));
  }
  menu.el.querySelector('.mode-desc').textContent = MODE_INFO[cfg.mode].desc;
  menu.refresh(); menu.show();
  if (G.phase === 'over') { $('end').classList.add('hidden'); newGame({ ...cfg }, { phase: 'demo' }); }
}
$('btn-menu').onclick = () => { sfx.click(); openMenu(); };
$('btn-undo').onclick = () => undo();
$('btn-hint').onclick = () => hint();
$('btn-rematch').onclick = () => { sfx.select(); newGame({ ...cfg }, { phase: 'play' }); };
$('btn-end-menu').onclick = () => { sfx.click(); openMenu(); };
settingsButton();
addEventListener('sd-settings', () => { theme = null; applyTheme(cfg.theme, cfg.colors); });

// live remix preview (postMessage from the Superdreams editor): re-theme instantly, restart only if rules changed
function onLiveDream(live) {
  const next = sanitize(live);
  const rulesChanged = ['mode', 'flyingKings', 'forceCapture', 'holeEvery', 'graveTurns', 'opponent'].some((k) => next[k] !== cfg[k]);
  const lvl = next.aiLevel;
  Object.assign(cfg, next); theme = null;
  applyTheme(cfg.theme, cfg.colors);
  cfg.aiLevel = lvl;
  if (rulesChanged && G.phase !== 'boot') newGame({ ...cfg }, { phase: G.phase === 'over' ? 'play' : G.phase });
  updateHUD();
}

// ---------------------------------------------------------------- per-frame visuals
const RED_HINT = new THREE.Color(0xff5a4a);
function updateVisuals(dt, t) {
  const s = G.state; if (!s) return;
  const human = canInput();
  const forced = human && cfg.forceCapture && G.legal[0]?.caps.length > 0;
  const capFrom = forced ? new Set(G.legal.map((m) => m.from)) : null;
  G.forcePulse = Math.max(0, (G.forcePulse || 0) - dt);
  for (const v of views) {
    if (v.captured || v.gone) { v.glow = 0; v.lift += (0 - v.lift) * Math.min(1, dt * 10); continue; }
    let glow = 0, lift = 0;
    if (human && v.sq === G.sel) { glow = 0.85 + Math.sin(t * 5) * 0.15; lift = 0.24 + Math.sin(t * 3) * 0.03; }
    else if (capFrom && capFrom.has(v.sq) && G.sel < 0) glow = 0.35 + 0.3 * Math.sin(t * 6) + (G.forcePulse > 0 ? 0.4 : 0);
    else if (human && G.hover === v.sq && G.sel < 0 && R.sideOf(s.board[v.sq]) === s.turn && piecesWithMoves().has(v.sq)) { glow = 0.25; lift = 0.06; }
    v.glow += (glow - v.glow) * Math.min(1, dt * 12);
    v.lift += (lift - v.lift) * Math.min(1, dt * 10);
  }
  markers.begin();
  const acc = palette.accent;
  if (G.trail) {
    G.trail.t += dt;
    // additive markers: lift the side colour toward white so a near-black side (Ebony) still shows
    const fade = Math.max(0.45, 1 - G.trail.t * 0.35), path = G.trail.path;
    const col = new THREE.Color(sideColor(G.trail.side)).lerp(new THREE.Color(palette.accent), 0.35).lerp(new THREE.Color(0xffffff), 0.25);
    for (let i = 0; i < path.length; i++) {
      const p = sqPos(path[i]);
      markers.add(p.x, p.z, i === path.length - 1 ? 0.98 : 0.9, col, (i === path.length - 1 ? 0.75 : 0.45) * fade, 2);
      if (i < path.length - 1) { const q = sqPos(path[i + 1]); const steps = Math.round(p.distanceTo(q) / 0.26); for (let k = 1; k < steps; k++) { const m = p.clone().lerp(q, k / steps); markers.add(m.x, m.z, 0.11, col, 1.1 * fade, 1); } }
    }
  }
  if (human) {
    const targets = nextTargets();
    if (G.sel >= 0) { const p = sqPos(G.sel); markers.add(p.x, p.z, 1.15, acc, 1.2, 3); }
    for (const tg of targets) {
      const p = sqPos(tg.sq), pulse = 1 + Math.sin(t * 5) * 0.06;
      markers.add(p.x, p.z, 0.82 * pulse, tg.cap ? RED_HINT : acc, tg.cap ? 2.4 : 1.8, tg.cap ? 4 : 0);
      if (s.portals.includes(tg.sq)) { const ex = sqPos(s.portals[1 - s.portals.indexOf(tg.sq)]); markers.add(ex.x, ex.z, 0.4 * pulse, acc, 1.6, 1); }
      if (tg.cap && G.prefix.length <= 1) { const mv = tg.m, ci = (G.prefix.length || 1) - 1; const cp = sqPos(mv.caps[ci]); markers.add(cp.x, cp.z, 0.7, RED_HINT, 1.2 + Math.sin(t * 8) * 0.4, 2); }
    }
    if (capFrom && G.sel < 0) for (const q of capFrom) { const p = sqPos(q); markers.add(p.x, p.z, 0.95 + Math.sin(t * 6) * 0.05, RED_HINT, 1.1 + Math.sin(t * 6) * 0.5, 0); }
    if (G.hover >= 0 && G.sel < 0 && R.isDarkSq(G.hover)) { const p = sqPos(G.hover); markers.add(p.x, p.z, 0.98, acc, 0.35, 2); }
    if (G.cursorOn) { const p = sqPos(G.cursor); markers.add(p.x, p.z, 1.0, 0xffffff, 1.6, 2); }
    if (G.hint) {
      G.hint.t += dt; if (G.hint.t > 4) G.hint = null;
      else { const path = G.hint.path; path.forEach((q, i) => { const p = sqPos(q); markers.add(p.x, p.z, i ? 0.6 : 1.05, 0x7fffd0, 1.8 + Math.sin(t * 7) * 0.6, i ? 5 : 3, 0.01, i ? Math.atan2(-(p.z - sqPos(path[i - 1]).z), p.x - sqPos(path[i - 1]).x) - Math.PI / 2 : 0); }); }
    }
  }
  markers.end();
  flashLight.intensity *= Math.pow(0.004, dt);
  // fantasy braziers
  if (cfg.theme === 'fantasy' && backdrops.braziers) {
    backdrops.braziers.forEach((b, i) => {
      fireLights[i].position.copy(b).setY(b.y + 0.4); fireLights[i].intensity = 7 + Math.sin(t * 13 + i * 3) * 1.4 + Math.sin(t * 7.3 + i) * 1.2;
      for (let k = 0; k < 2; k++) if (Math.random() < dt * 45) sparks.emit({ pos: b.clone().add(new THREE.Vector3(rnd(-0.22, 0.22), 0.05, rnd(-0.22, 0.22))), vel: new THREE.Vector3(rnd(-0.12, 0.12), rnd(0.9, 1.6), rnd(-0.12, 0.12)), life: rnd(0.45, 0.85), size: 0.55, size1: 0.08, color: 0xffb050, color1: 0xff2a08, intensity: 2.2 });
      if (Math.random() < dt * 6) sparks.emit({ pos: b.clone().setY(b.y + 0.3), vel: new THREE.Vector3(rnd(-0.3, 0.3), rnd(1, 1.8), rnd(-0.3, 0.3)), life: 1.6, size: 0.03, size1: 0.01, color: 0xffc060, intensity: 4, sway: 0.4 });
    });
  } else fireLights.forEach((l) => { l.intensity = 0; });
}

// ---------------------------------------------------------------- probe + test hooks
const P = probe(renderer, { dataReady: false, counts: {} });
P.game = {
  state: () => ({ ...R.serialize(G.state), phase: G.phase, busy: G.busy, legal: G.legal.length, theme: cfg.theme, mode: cfg.mode, views: views.length }),
  legalMoves: () => R.legalMoves(G.state).map((m) => ({ from: m.from, to: m.to, path: m.path, caps: m.caps, name: m.path.map(R.nameOf).join(m.caps.length ? 'x' : '-') })),
  move: (from, to) => {
    const f = R.parseSq(from), t = R.parseSq(to);
    const m = G.legal.find((x) => x.from === f && x.to === t) || G.legal.find((x) => x.from === f && x.path[1] === t);
    if (!m || G.busy) return false;
    performMove(m); return true;
  },
  setMode: (m) => { newGame({ ...cfg, mode: m }, { phase: G.phase === 'demo' || G.phase === 'boot' ? 'play' : G.phase === 'over' ? 'play' : G.phase }); return cfg.mode; },
  setTheme: (t) => { applyTheme(t); return cfg.theme; },
  newGame: (c = {}) => { menu.hide(); newGame({ ...cfg, ...c }, { phase: 'play' }); return true; },
  autoplay: (on = true, level = null) => { G.autoplay = on; G.autoLevel = level; if (on && G.phase !== 'play') { menu.hide(); newGame({ ...cfg }, { phase: 'play' }); } else if (on && !G.busy) beginTurn(); return true; },
  speed: (x) => { G.speed = x; return x; },
  busy: () => G.busy,
  view: (az = 0, polar = 0.74, dist = 13, ty = 0) => { camAnim = null; controls.target.set(0, ty, 0.2); camera.position.setFromSpherical(new THREE.Spherical(dist, polar, az)).add(controls.target); camera.lookAt(controls.target); controls.update(); },
  select: (sq) => { onSquare(R.parseSq(sq)); return G.sel; },
  // drop a hazard in for screenshots / tests: hole | holeWarn | grave | meteor | crater
  forceHazard: (type, at, extra = {}) => {
    const sq = R.parseSq(at), s = G.state;
    if (type === 'hole') { s.holes.push({ sq, warn: 0, life: 6 }); holes.sync(s.holes, s.opts.holeWarn, false); holeOpenAnim(sq); }
    else if (type === 'holeWarn') { s.holes.push({ sq, warn: 2, life: 6 }); holes.sync(s.holes, s.opts.holeWarn, false); }
    else if (type === 'grave') { s.graves.push({ sq, ttl: extra.ttl ?? 6, max: 6, piece: extra.piece ?? -1 }); graves.sync(s.graves, colorOfPiece, false); }
    else if (type === 'meteor') { s.meteors.push({ sq, warn: 2 }); meteors.sync(s.meteors, s.craters, false); }
    else if (type === 'crater') { s.craters.push({ sq, ttl: 4, max: 4 }); meteors.sync(s.meteors, s.craters, false); }
    else if (type === 'suck') { const v = viewAt(sq); const h = s.holes[0]; if (v && h) { s.board[sq] = 0; suckAnim(v, h.sq); } }
    G.legal = R.legalMoves(s); updateCounts(s); updateHUD();
    return true;
  },
  menu: () => openMenu(),
  // stage a position: { c3: 1, d4: -1, e5: 2, ... } (1/-1 men, 2/-2 kings), side to move
  setup: (pieces, turn = RED) => {
    G.seq++; G.state = R.fromPosition(pieces, rulesOpts(cfg), turn); G.history = []; G.busy = false; G.sel = -1; G.prefix = []; G.trail = null;
    fullRebuild(G.state); beginTurn(); return R.legalMoves(G.state).length;
  },
  // fast-forward n plies of AI-vs-AI straight through the rules (no animation), then rebuild the scene
  advance: async (n = 10, level = { depth: 3, time: 30, noise: 30, blunder: 0.05 }) => {
    const seq = ++G.seq;
    for (let i = 0; i < n && !G.state.result; i++) {
      const r = await askAI(G.state, level);
      if (seq !== G.seq) return -1;
      const mv = R.legalMoves(G.state).find((m) => R.moveKey(m) === R.moveKey(r.move)) || R.legalMoves(G.state)[0];
      G.history.push(G.state); G.state = R.applyMove(G.state, mv);
      G.trail = { path: mv.path.slice(), side: -G.state.turn, t: 0 };
    }
    G.seq++; G.busy = false; G.sel = -1; G.prefix = [];
    fullRebuild(G.state); beginTurn();
    return G.state.ply;
  },
};

// ---------------------------------------------------------------- boot
autoResize(renderer, camera, () => { controls.maxDistance = Math.max(30, fitDistance() * 1.6); });
const boot = loadSave();
applyTheme(cfg.theme, cfg.colors);
newGame({ ...cfg }, { phase: 'demo' });
camHome(RED, true);
controls.autoRotateSpeed = 0.35;
menu.refresh();
if (Q.has('autostart')) { menu.hide(); newGame({ ...cfg }, { phase: 'play' }); }
if (boot && Q.has('continue')) { menu.hide(); newGame(boot.cfg, { phase: 'play', state: boot.state, history: boot.history }); }
document.getElementById('boot')?.remove();

startLoop(renderer, (dt, t) => {
  updateTweens(dt * (G.speed >= 50 ? 1 : G.speed));
  controls.autoRotate = G.phase === 'demo' && !settings.reducedMotion;
  controls.update(dt);
  updateVisuals(dt, t);
  writeInstances(t);
  holes.update(dt, camera); graves.update(dt); meteors.update(dt); portals.update(dt);
  sparks.update(dt, camera); smoke.update(dt, camera); shards.update(dt);
  motes.update(t);
}, () => {
  const saved = camera.position.clone();
  applyShake(camera, 1 / 60);
  post.render();
  camera.position.copy(saved);
});
P.dataReady = true;
