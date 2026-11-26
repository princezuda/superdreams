// Skystack — one-tap 3D stacker. Isometric orthographic camera, instanced slabs, TSL sky that climbs from morning
// through sunset and aurora into space as the tower rises. Rules live in stack.js (node-tested).
import { THREE, createRenderer, createPipeline, autoResize, probe, startLoop, settings, store, sfx, startMenu, settingsButton, initUI, toast, loadDream, host, Q, tween, updateTweens, ease, flash } from '/shared/sd-kit.js';
import { Fn, uniform, vec3, vec2, float, positionWorldDirection, positionGeometry, screenUV, texture, positionLocal, normalWorld, instancedBufferAttribute, mix, smoothstep, dot, max, pow, sin, fract, floor, hash, length, time, mx_noise_float, abs, uv, oneMinus } from 'three/tsl';
import * as K from './stack.js';
import { audio } from './audio.js';

const DEFAULTS = { theme: 'pastel', colors: { accent: '#ffd36e' }, difficulty: 'normal', mode: 'classic', speed: 1, slabSize: 3.4, tolerance: 1, wind: 1, hueStep: 0.022, shadows: true, clouds: true };
let cfg = await loadDream(DEFAULTS, (c) => applyConfig(c));
const $ = (s) => document.querySelector(s);
initUI({ grain: false });
const SAVE_KEY = 'skystack-v1';
const save = Object.assign({ best: { classic: 0, wind: 0, zen: 0 }, orbit: { classic: false, wind: false, zen: false }, perfects: 0, runs: 0, milestones: {}, diff: null }, store.get(SAVE_KEY) || {});
const persist = () => store.set(SAVE_KEY, save);

// ---------------------------------------------------------------- renderer + scene
const renderer = await createRenderer({ toneMapping: 'neutral', exposure: 1.0, shadows: true });
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-5, 5, 8, -8, 0.1, 400);
const ISO = new THREE.Vector3(1, 1.05, 1).normalize();
const post = createPipeline(renderer, scene, camera, { bloom: { strength: 0.45, radius: 0.6, threshold: 0.85 } });
const P = probe(renderer, { dataReady: false });

// sky (background node driven by altitude uniforms)
const U = { top: uniform(new THREE.Color('#5aa8ff')), hor: uniform(new THREE.Color('#d8f0ff')), sunDir: uniform(new THREE.Vector3(0.4, 0.6, 0.7).normalize()), sunCol: uniform(new THREE.Color('#fff3c8')), stars: uniform(0), aurora: uniform(0), haze: uniform(1) };
// The iso camera looks down at the sky, so the gradient, sun and aurora are composed in screen space; stars use direction.
const uAspect = uniform(1);
scene.backgroundNode = Fn(() => {
  const d = positionWorldDirection.normalize();
  const up = oneMinus(screenUV.y);
  let col = mix(U.hor, U.top, smoothstep(0.0, 1.0, up).pow(0.8));
  const sp = vec2(screenUV.x.sub(0.8).mul(uAspect), screenUV.y.sub(0.13)); const sd = length(sp);
  col = col.add(U.sunCol.mul(smoothstep(0.065, 0.05, sd).mul(1.6).add(smoothstep(0.5, 0.0, sd).pow(2).mul(0.45))).mul(U.haze));
  const p = d.mul(160); const cell = floor(p); const h = hash(cell.x.add(cell.y.mul(57)).add(cell.z.mul(113)));
  const off = vec3(hash(cell.x.add(7.1)), hash(cell.y.add(3.7)), hash(cell.z.add(9.3)));
  const r = length(fract(p).sub(off)); const tw = sin(time.mul(h.mul(4).add(1)).add(h.mul(30))).mul(0.3).add(0.7);
  col = col.add(vec3(smoothstep(0.9, 1.0, h).mul(max(float(0), oneMinus(r.mul(5))).pow(2)).mul(tw).mul(U.stars).mul(2.4)));
  const n = mx_noise_float(vec3(screenUV.x.mul(3.0), up.mul(1.2), time.mul(0.06))); const band = smoothstep(0.0, 0.3, n).mul(smoothstep(0.7, 0.2, n));
  const curtain = band.mul(smoothstep(0.35, 0.7, up)).mul(sin(screenUV.x.mul(70).add(time.mul(0.8))).mul(0.25).add(0.75));
  col = col.add(mix(vec3(0.1, 1.0, 0.55), vec3(0.75, 0.25, 1.0), smoothstep(0.55, 0.95, up)).mul(curtain.mul(U.aurora).mul(0.9)));
  return col;
})();
const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x6a5a7a, 1.1); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.radius = 4; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 0.5, far: 60 }); scene.add(sun, sun.target);
const amb = new THREE.AmbientLight(0xffffff, 0.25); scene.add(amb);

// ---------------------------------------------------------------- floating island base
const island = new THREE.Group(); scene.add(island);
{ const grass = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.3, 0.7, 9), new THREE.MeshStandardNodeMaterial({ color: 0x7cc56a, roughness: 0.9, flatShading: true })); grass.position.y = -0.56; grass.receiveShadow = true; island.add(grass);
  const rock = new THREE.Mesh(new THREE.ConeGeometry(3.3, 5.2, 9, 3), new THREE.MeshStandardNodeMaterial({ color: 0x9a7a6a, roughness: 1, flatShading: true })); rock.rotation.x = Math.PI; rock.position.y = -3.5; island.add(rock);
  const trunkM = new THREE.MeshStandardNodeMaterial({ color: 0x8a5a3a, roughness: 1 }), leafM = new THREE.MeshStandardNodeMaterial({ color: 0x4fae5a, roughness: 0.8, flatShading: true });
  for (const [x, z, s] of [[2.25, 2.2, 1], [-2.3, 2.1, 0.8], [2.3, -2.2, 0.7], [-2.2, -2.3, 0.9], [2.75, 1.85, 0.55]]) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * s, 0.12 * s, 0.6 * s), trunkM); t.position.set(x, -0.0 + 0.3 * s - 0.2, z); const l = new THREE.Mesh(new THREE.ConeGeometry(0.5 * s, 1.3 * s, 7), leafM); l.position.set(x, 0.75 * s, z); l.castShadow = true; island.add(t, l); }
  const pad = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.18, 4.2), new THREE.MeshStandardNodeMaterial({ color: 0xe8dcc8, roughness: 0.8 })); pad.position.y = -0.25; pad.receiveShadow = true; island.add(pad); }

// ---------------------------------------------------------------- slabs (instanced) + debris
const MAXS = 600;
const sCol = new THREE.InstancedBufferAttribute(new Float32Array(MAXS * 3), 3); sCol.setUsage(THREE.DynamicDrawUsage);
const sFx = new THREE.InstancedBufferAttribute(new Float32Array(MAXS), 1); sFx.setUsage(THREE.DynamicDrawUsage);
const slabMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.55, metalness: 0.0 });
{ const c = instancedBufferAttribute(sCol), f = instancedBufferAttribute(sFx); const topFace = smoothstep(0.5, 0.9, normalWorld.y);
  const edge = smoothstep(0.46, 0.5, max(abs(positionGeometry.x), abs(positionGeometry.z))).mul(topFace); // geometry space: positionLocal is post-instance
  slabMat.colorNode = c.mul(float(0.86).add(topFace.mul(0.18))).add(edge.mul(0.22));
  slabMat.emissiveNode = c.mul(0.2).add(vec3(f.mul(1.6))); }
const slabs = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), slabMat, MAXS); slabs.count = 0; slabs.castShadow = true; slabs.receiveShadow = true; slabs.frustumCulled = false; scene.add(slabs);
slabs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
const DEB = 40; const dCol = new THREE.InstancedBufferAttribute(new Float32Array(DEB * 3), 3); dCol.setUsage(THREE.DynamicDrawUsage);
const debMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.6 }); debMat.colorNode = instancedBufferAttribute(dCol);
const debMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), debMat, DEB); debMesh.count = 0; debMesh.castShadow = true; debMesh.frustumCulled = false; scene.add(debMesh);
const debris = [];
// perfect ripples: flat square outlines that expand + fade
const rippleTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); x.strokeStyle = '#fff'; x.lineWidth = 7; x.shadowColor = '#fff'; x.shadowBlur = 10; x.strokeRect(10, 10, 108, 108); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
const ripples = Array.from({ length: 5 }, () => { const m = new THREE.MeshBasicNodeMaterial({ map: rippleTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }); const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m); mesh.rotation.x = -Math.PI / 2; mesh.visible = false; scene.add(mesh); return { mesh, m, t: 0 }; });
// sparkles (instanced HDR octahedra)
const SPK = 200; const spCol = new THREE.InstancedBufferAttribute(new Float32Array(SPK * 3), 3); spCol.setUsage(THREE.DynamicDrawUsage);
const spMat = new THREE.MeshBasicNodeMaterial(); spMat.colorNode = instancedBufferAttribute(spCol).mul(3);
const spMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.07), spMat, SPK); spMesh.count = 0; spMesh.frustumCulled = false; scene.add(spMesh);
const sparks = Array.from({ length: SPK }, () => ({ on: false })); let spHead = 0;
// clouds: billboards from a painted puff texture
const cloudTex = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d'); for (let k = 0; k < 14; k++) { const px = 40 + Math.random() * 176, py = 50 + Math.random() * 40, r = 20 + Math.random() * 34; const g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, 7); x.fill(); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
const NC = 46; const cA = new THREE.InstancedBufferAttribute(new Float32Array(NC), 1); const uCloudTint = uniform(new THREE.Color('#ffffff'));
const cloudMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false }); { const tx = texture(cloudTex, uv()); cloudMat.colorNode = tx.rgb.mul(uCloudTint); cloudMat.opacityNode = tx.a.mul(instancedBufferAttribute(cA)); }
const clouds = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 0.5), cloudMat, NC); clouds.frustumCulled = false; scene.add(clouds);
// clouds live on screen-aligned layers: most behind the tower (−ISO depth), a few faint ones drifting in front
const RIGHT = new THREE.Vector3(1, 0, -1).normalize();
const cloudItems = Array.from({ length: NC }, (_, k) => { const band = k < 12 ? [-7, 1] : k < 36 ? [6, 15] : [17, 40]; const front = k % 6 === 0 && k >= 12 && k < 36;
  return { u: (Math.random() - 0.5) * 40, y: band[0] + Math.random() * (band[1] - band[0]), depth: front ? -14 : 12 + Math.random() * 26, s: 4 + Math.random() * 7, v: 0.15 + Math.random() * 0.35, a: front ? 0.14 : k < 36 ? 0.8 : 0.45 }; });
// wind streaks
const WN = 40; const windMat = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(1.6, 1.6, 1.8), transparent: true, opacity: 0.5, depthWrite: false });
const windMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 0.02, 0.02), windMat, WN); windMesh.frustumCulled = false; windMesh.count = 0; scene.add(windMesh);
const windItems = Array.from({ length: WN }, () => ({ x: (Math.random() - 0.5) * 24, y: Math.random() * 14, z: (Math.random() - 0.5) * 24, v: 6 + Math.random() * 6 }));

// ---------------------------------------------------------------- palettes / sky keyframes
const THEMES = { pastel: { s: 0.72, l: 0.68, h0: 0.55 }, sunset: { s: 0.8, l: 0.6, h0: 0.02 }, neon: { s: 1.0, l: 0.56, h0: 0.8 }, mono: { s: 0.08, l: 0.72, h0: 0.6 } };
const SKY = [ // h: altitude in slabs
  { h: 0, top: '#5aa8ff', hor: '#dff3ff', sun: '#fff3c8', el: 0.75, stars: 0, aurora: 0, li: 2.3, hemi: 1.1, cloud: '#ffffff' },
  { h: 22, top: '#4a8ef0', hor: '#ffe6c0', sun: '#ffe0a0', el: 0.45, stars: 0, aurora: 0, li: 2.1, hemi: 1.0, cloud: '#fff6ea' },
  { h: 38, top: '#3a4ea8', hor: '#ff9a6a', sun: '#ff8a4a', el: 0.12, stars: 0.15, aurora: 0, li: 1.6, hemi: 0.8, cloud: '#ffc8a8' },
  { h: 52, top: '#101a44', hor: '#2a3a7a', sun: '#a8c0ff', el: 0.5, stars: 0.8, aurora: 1, li: 0.9, hemi: 0.55, cloud: '#8090c0' },
  { h: 78, top: '#04061a', hor: '#1a2a6a', sun: '#c8d8ff', el: 0.4, stars: 1, aurora: 0.5, li: 1.0, hemi: 0.5, cloud: '#6070a0' },
  { h: 100, top: '#000004', hor: '#0a1a4a', sun: '#ffffff', el: 0.3, stars: 1.2, aurora: 0, li: 1.5, hemi: 0.45, cloud: '#5060a0' },
];
const cA1 = new THREE.Color(), cA2 = new THREE.Color();
function skyAt(h) {
  let i = 0; while (i < SKY.length - 2 && h > SKY[i + 1].h) i++; const a = SKY[i], b = SKY[i + 1]; const k = Math.max(0, Math.min(1, (h - a.h) / (b.h - a.h))); const e = k * k * (3 - 2 * k);
  U.top.value.copy(cA1.set(a.top).lerp(cA2.set(b.top), e)); U.hor.value.copy(cA1.set(a.hor).lerp(cA2.set(b.hor), e)); U.sunCol.value.copy(cA1.set(a.sun).lerp(cA2.set(b.sun), e));
  U.stars.value = a.stars + (b.stars - a.stars) * e; U.aurora.value = a.aurora + (b.aurora - a.aurora) * e;
  const el = a.el + (b.el - a.el) * e; U.sunDir.value.set(Math.cos(el) * 0.75, Math.sin(el), Math.cos(el) * 0.66).normalize();
  sun.intensity = a.li + (b.li - a.li) * e; sun.color.copy(U.sunCol.value); hemi.intensity = a.hemi + (b.hemi - a.hemi) * e; hemi.color.copy(cA1.set(a.hor).lerp(cA2.set(b.hor), e));
  uCloudTint.value.copy(cA1.set(a.cloud).lerp(cA2.set(b.cloud), e));
}
function slabColor(hue, out) { const th = THEMES[cfg.theme] || THEMES.pastel; return out.setHSL(((th.h0 + hue) % 1 + 1) % 1, th.s, th.l); }

// ---------------------------------------------------------------- state + flow
const G = { screen: 'menu', st: null, mode: cfg.mode, diff: save.diff || cfg.difficulty, camY: 2, camZoom: 1, targetZoom: 1, auto: 0, ff: 1, overT: 0, flashIx: -1, sway: 0, orbitDone: false, hint: true, lastMilestone: null, t: 0 };
let viewH = 16;
function fit() { const a = innerWidth / innerHeight; viewH = Math.max(14.5, 9.6 / a); setFrustum(); }
function setFrustum() { uAspect.value = innerWidth / innerHeight; const a = innerWidth / innerHeight, h = viewH * G.camZoom; camera.left = -h * a / 2; camera.right = h * a / 2; camera.top = h / 2; camera.bottom = -h / 2; camera.updateProjectionMatrix(); }
autoResize(renderer, camera, fit);
function newRun(mode = G.mode) {
  G.mode = mode; const zen = mode === 'zen';
  G.st = K.createStack({ mode, difficulty: G.diff, speedMul: cfg.speed * (zen ? 0.85 : 1), size: cfg.slabSize, tolMul: cfg.tolerance, wind: cfg.wind, hueStep: cfg.hueStep, hue0: Math.random() });
  debris.length = 0; G.camY = 2; G.camZoom = 1; G.targetZoom = 1; setFrustum(); G.screen = 'play'; G.overT = 0; G.orbitDone = false; G.lastMilestone = null;
  $('#hud').classList.add('show'); $('#zenEnd').classList.toggle('show', zen); $('#modeTag').textContent = { classic: 'Classic', wind: 'Wind', zen: 'Zen' }[mode]; hud();
  if (G.hint) $('#tapHint').classList.add('show');
  if (mode === 'wind') toast('Wind gusts push the sliding slab — watch the streaks and time your tap.', 3800);
  if (mode === 'zen') toast('Zen: no falling — a miss just lands a smaller slab. Build as high as you like.', 3800);
  host('start', { mode });
}
function tap() {
  if (G.screen !== 'play' || !G.st || G.st.over) return;
  if (G.hint) { G.hint = false; $('#tapHint').classList.remove('show'); }
  const r = K.drop(G.st); if (!r) return; onDrop(r);
}
const tmpC = new THREE.Color();
function onDrop(r) {
  const st = G.st;
  if (r.debris) spawnDebris(r.debris, r.type === 'miss' || r.type === 'zenmiss');
  if (r.type === 'perfect') {
    audio.perfect(r.streak); rippleAt(r.placed, r.streak); sparkleAt(r.placed, 6 + Math.min(10, r.streak * 2)); G.flashIx = K.height(st); G.flashT = 1;
    if (r.streak >= 2) streakText(r.streak, r.grew);
  } else if (r.type === 'cut') { audio.cut(r.cutFrac); G.wob = 0.6; }
  else if (r.type === 'zenmiss') { audio.cut(0.6); toast('Almost! Zen saves the slab.', 1200); }
  if (r.type === 'miss') { audio.fall(); gameOver(); }
  if (r.milestone) milestone(r.milestone);
  hud();
}
function milestone(m) {
  save.milestones[m.name] = true; persist(); audio.milestone(); $('#mile b').textContent = m.name; $('#mile small').textContent = `${m.h} slabs high`; const e = $('#mile'); e.classList.remove('show'); void e.offsetWidth; e.classList.add('show');
  if (m.h === 100 && !G.orbitDone) { G.orbitDone = true; save.orbit[G.mode] = true; persist(); fireworks(); setTimeout(orbitCard, 1600); }
}
function gameOver() {
  const st = G.st, h = K.height(st); G.screen = 'over'; G.overT = 0; save.runs++; save.perfects += st.perfects; const nb = h > save.best[G.mode]; save.best[G.mode] = Math.max(save.best[G.mode], h); persist();
  host('score', { mode: G.mode, score: h });
  G.targetZoom = Math.max(1, (h * K.SLAB_H + 10) / viewH); flash('#ffffff', 120);
  setTimeout(() => card(`<div class="eyebrow">${{ classic: 'Classic', wind: 'Wind' }[G.mode] || ''}</div><h2>${nb ? 'New best!' : 'Tower complete'}</h2>
    <p class="big">${h}<small>slabs</small></p><p class="sub">Best ${save.best[G.mode]} · ${st.perfects} perfect drops · best streak ×${st.bestStreak}</p>
    <div class="miles">${K.MILESTONES.map((m) => `<span class="${h >= m.h ? 'on' : ''}">${m.name}</span>`).join('')}</div>
    <div class="sd-row"><button class="sd-btn primary" id="again">Stack again</button><button class="sd-btn" id="toMenu">Menu</button></div>`, () => { $('#again').onclick = () => { closeCard(); newRun(); }; $('#toMenu').onclick = () => { closeCard(); toMenu(); }; }, true), 1500);
}
function orbitCard() {
  const st = G.st; G.screen = 'paused';
  card(`<div class="eyebrow">100 slabs</div><h2>Orbit reached!</h2><p class="sub">Your tower pierced the sky — from meadow to the stars. ${st.perfects} perfect drops on the way.</p>
    <div class="sd-row"><button class="sd-btn primary" id="cont">Keep building</button><button class="sd-btn" id="fin">Finish here</button></div>`, () => {
    $('#cont').onclick = () => { closeCard(); G.screen = 'play'; }; $('#fin').onclick = () => { closeCard(); endRun(); };
  });
}
function endRun() { const st = G.st; if (!st) return; st.over = true; G.screen = 'over'; const h = K.height(st); save.best[G.mode] = Math.max(save.best[G.mode], h); persist(); G.targetZoom = Math.max(1, (h * K.SLAB_H + 10) / viewH);
  setTimeout(() => card(`<div class="eyebrow">${G.mode === 'zen' ? 'Zen' : 'Finished'}</div><h2>${h >= 100 ? 'A tower to the stars' : 'Lovely tower'}</h2><p class="big">${h}<small>slabs</small></p><p class="sub">Best ${save.best[G.mode]} · ${st.perfects} perfect drops</p>
    <div class="sd-row"><button class="sd-btn primary" id="again">Build again</button><button class="sd-btn" id="toMenu">Menu</button></div>`, () => { $('#again').onclick = () => { closeCard(); newRun(); }; $('#toMenu').onclick = () => { closeCard(); toMenu(); }; }, true), 900); }
function toMenu() { G.screen = 'menu'; $('#hud').classList.remove('show'); $('#zenEnd').classList.remove('show'); menu.show(); }

// ---------------------------------------------------------------- fx helpers
function spawnDebris(d, whole) {
  if (debris.length >= DEB) debris.shift(); const ax = Math.abs(d.x - K.top(G.st).x) > Math.abs(d.z - K.top(G.st).z) ? 'x' : 'z';
  debris.push({ ...d, vy: whole ? 0 : 0.5, vx: ax === 'x' ? Math.sign(d.x - K.top(G.st).x) * 1.2 : 0, vz: ax === 'z' ? Math.sign(d.z - K.top(G.st).z) * 1.2 : 0, rx: 0, rz: 0, wx: ax === 'z' ? (Math.random() * 2 + 1) * Math.sign(d.z) : 0.3, wz: ax === 'x' ? -(Math.random() * 2 + 1) * Math.sign(d.x) : 0.3, t: 0, col: slabColor(d.hue, new THREE.Color()) });
}
function rippleAt(p, streak) { const r = ripples.find((q) => !q.mesh.visible) || ripples[0]; r.mesh.visible = true; r.t = 0; r.p = p; r.k = 1 + Math.min(streak, 8) * 0.06; r.m.color.set(cfg.colors.accent).multiplyScalar(2); }
function sparkleAt(p, n) { if (settings.reducedMotion) n = Math.ceil(n / 2); for (let i = 0; i < n; i++) { const s = sparks[(spHead = (spHead + 1) % SPK)]; const side = Math.random() < 0.5; const sx = side ? (Math.random() < 0.5 ? -1 : 1) * p.w / 2 : (Math.random() - 0.5) * p.w; const sz = side ? (Math.random() - 0.5) * p.d : (Math.random() < 0.5 ? -1 : 1) * p.d / 2; tmpC.set(cfg.colors.accent); Object.assign(s, { on: true, x: p.x + sx, y: p.y + K.SLAB_H / 2, z: p.z + sz, vx: sx * 0.8, vy: 1.5 + Math.random() * 2, vz: sz * 0.8, t: 0, life: 0.6 + Math.random() * 0.5, r: tmpC.r, g: tmpC.g, b: tmpC.b }); } }
function fireworks() { for (let b = 0; b < 8; b++) setTimeout(() => { const st = G.st; if (!st) return; const p = K.top(st); const cx = p.x + (Math.random() - 0.5) * 8, cy = p.y + 3 + Math.random() * 4, cz = p.z + (Math.random() - 0.5) * 8; const col = new THREE.Color().setHSL(Math.random(), 0.9, 0.6); for (let i = 0; i < 22; i++) { const s = sparks[(spHead = (spHead + 1) % SPK)]; const a = Math.random() * 6.28, e = Math.random() * 3.14; Object.assign(s, { on: true, x: cx, y: cy, z: cz, vx: Math.cos(a) * Math.sin(e) * 5, vy: Math.cos(e) * 5, vz: Math.sin(a) * Math.sin(e) * 5, t: 0, life: 1.1, r: col.r, g: col.g, b: col.b }); } audio.pop(); }, b * 220); }
let streakTimer = 0;
function streakText(n, grew) { const e = $('#streak'); e.textContent = `Perfect ×${n}${grew ? ' · grow!' : ''}`; e.classList.remove('show'); void e.offsetWidth; e.classList.add('show'); clearTimeout(streakTimer); streakTimer = setTimeout(() => e.classList.remove('show'), 1100); }

// ---------------------------------------------------------------- UI
document.body.insertAdjacentHTML('beforeend', `
<div id="hud"><button class="sd-btn sd-icon" id="pauseBtn" aria-label="Pause">❚❚</button><div class="hh"><small id="modeTag">Classic</small><b id="hHeight">0</b><small id="hBest">Best 0</small></div><div id="streak"></div><div id="windBadge"></div></div>
<div id="tapHint"><i></i>Tap anywhere to drop</div>
<div id="mile"><small></small><b></b></div>
<button class="sd-btn" id="zenEnd">Finish</button>
<div id="card" class="sd-panel"><div class="sd-card ss-card" id="cardBody"></div></div>`);
const menu = startMenu({ title: 'Skystack', subtitle: 'Tap to drop. Stack slabs from a meadow island through the clouds, the aurora and into orbit.',
  options: [{ key: 'mode', label: 'Mode', value: ['classic', 'wind', 'zen'].includes(cfg.mode) ? cfg.mode : 'classic', choices: [{ v: 'classic', label: 'Classic' }, { v: 'wind', label: '🌬 Wind' }, { v: 'zen', label: '☁ Zen' }] },
    { key: 'difficulty', label: 'Difficulty', value: G.diff, choices: [{ v: 'easy', label: 'Easy' }, { v: 'normal', label: 'Normal' }, { v: 'hard', label: 'Hard' }] }],
  startLabel: 'Stack', onStart: (v) => { G.diff = v.difficulty; save.diff = v.difficulty; persist(); newRun(v.mode); } });
settingsButton();
let cardOpen = false;
function card(html, wire, low = false) { $('#cardBody').innerHTML = html; $('#card').classList.add('open'); $('#card').classList.toggle('low', low); cardOpen = true; wire?.(); }
function closeCard() { $('#card').classList.remove('open', 'low'); cardOpen = false; }
function pause() {
  if (G.screen !== 'play' || cardOpen) return; sfx.click(); G.screen = 'paused';
  card(`<h2>Paused</h2><div class="sd-row col"><button class="sd-btn primary" id="pRes">Resume</button><button class="sd-btn" id="pSet">Settings</button><button class="sd-btn" id="pNew">Restart</button><button class="sd-btn" id="pMenu">Main menu</button></div>`, () => {
    $('#pRes').onclick = () => { closeCard(); G.screen = 'play'; }; $('#pSet').onclick = () => $('#sd-gear').click(); $('#pNew').onclick = () => { closeCard(); newRun(); }; $('#pMenu').onclick = () => { closeCard(); toMenu(); };
  });
}
$('#pauseBtn').onclick = (e) => { e.stopPropagation(); pause(); };
$('#zenEnd').onclick = (e) => { e.stopPropagation(); sfx.click(); endRun(); $('#zenEnd').classList.remove('show'); };
function hud() { const st = G.st; if (!st) return; $('#hHeight').textContent = K.height(st); $('#hBest').textContent = `Best ${save.best[G.mode]}`; }
addEventListener('pointerdown', (e) => { if (e.target.closest?.('button, .sd-panel, #menu, .sd-corner')) return; tap(); });
addEventListener('keydown', (e) => { if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { if (G.screen === 'paused' && cardOpen) $('#pRes')?.click(); else pause(); return; } if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); if (!e.repeat) tap(); } });

// ---------------------------------------------------------------- frame
const M = new THREE.Matrix4(), Q4 = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), S3 = new THREE.Vector3(), C = new THREE.Color();
function writeSlabs(dt) {
  const st = G.st; let n = 0; if (!st) { slabs.count = 0; return; }
  const H = K.height(st); const from = G.screen === 'over' ? 0 : Math.max(0, H - 70);
  G.flashT = Math.max(0, (G.flashT || 0) - dt * 3);
  const sway = G.mode === 'wind' && !settings.reducedMotion ? st.wind * 0.02 : 0;
  for (let i = from; i < st.layers.length; i++) {
    const L = st.layers[i]; const sx = sway * L.y; // lean grows with height
    M.compose(V.set(L.x + sx, L.y - K.SLAB_H / 2 + (i === 0 ? -0.05 : 0), L.z), Q4.identity(), S3.set(L.w, i === 0 ? K.SLAB_H + 0.1 : K.SLAB_H, L.d)); slabs.setMatrixAt(n, M);
    slabColor(L.hue, C); if (i === 0) C.set('#e8dcc8'); sCol.setXYZ(n, C.r, C.g, C.b); sFx.setX(n, i === G.flashIx ? G.flashT : 0); n++;
  }
  if (st.cur && G.screen === 'play') { const c = st.cur; const sx = sway * c.y; M.compose(V.set(c.x + sx, c.y - K.SLAB_H / 2, c.z), Q4.identity(), S3.set(c.w, K.SLAB_H, c.d)); slabs.setMatrixAt(n, M); slabColor(c.hue, C); sCol.setXYZ(n, C.r, C.g, C.b); sFx.setX(n, 0.05 + 0.05 * Math.sin(G.t * 6)); n++; }
  slabs.count = n; slabs.instanceMatrix.needsUpdate = true; sCol.needsUpdate = true; sFx.needsUpdate = true;
  // debris
  let m = 0; for (let i = debris.length - 1; i >= 0; i--) { const d = debris[i]; d.t += dt; d.vy -= 16 * dt; d.x += d.vx * dt; d.z += d.vz * dt; d.y += d.vy * dt; d.rx += d.wx * dt; d.rz += d.wz * dt; if (d.t > 3.5) { debris.splice(i, 1); continue; } }
  for (const d of debris) { M.compose(V.set(d.x, d.y - K.SLAB_H / 2, d.z), Q4.setFromEuler(E.set(d.rx, 0, d.rz)), S3.set(d.w, K.SLAB_H, d.d)); debMesh.setMatrixAt(m, M); dCol.setXYZ(m, d.col.r, d.col.g, d.col.b); m++; }
  debMesh.count = m; debMesh.instanceMatrix.needsUpdate = true; dCol.needsUpdate = true;
}
function writeFx(dt) {
  for (const r of ripples) { if (!r.mesh.visible) continue; r.t += dt; const q = r.t / 0.6; if (q >= 1) { r.mesh.visible = false; continue; } const s = 1 + ease.outCubic(q) * 0.55 * r.k; r.mesh.position.set(r.p.x, r.p.y + 0.02, r.p.z); r.mesh.scale.set(r.p.w * s, r.p.d * s, 1); r.m.opacity = 1 - q; }
  let n = 0; for (const s of sparks) { if (!s.on) continue; s.t += dt; if (s.t >= s.life) { s.on = false; continue; } s.vy -= 4 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt; M.compose(V.set(s.x, s.y, s.z), Q4.identity(), S3.setScalar(1 - s.t / s.life)); spMesh.setMatrixAt(n, M); spCol.setXYZ(n, s.r, s.g, s.b); n++; }
  spMesh.count = n; spMesh.instanceMatrix.needsUpdate = true; spCol.needsUpdate = true;
  // clouds face the camera
  clouds.visible = !!cfg.clouds; if (clouds.visible) { const q = camera.quaternion; cloudItems.forEach((c, i) => { c.u += c.v * dt; if (c.u > 22) c.u = -22; V.copy(RIGHT).multiplyScalar(c.u).addScaledVector(ISO, -c.depth); V.y += c.y; M.compose(V, q, S3.set(c.s, c.s, 1)); clouds.setMatrixAt(i, M); cA.setX(i, c.a); }); clouds.instanceMatrix.needsUpdate = true; cA.needsUpdate = true; }
  // wind streaks
  const st = G.st; if (G.mode === 'wind' && st && !settings.reducedMotion) { const base = K.top(st).y; windMesh.count = WN; windItems.forEach((w, i) => { w.x += w.v * dt * Math.sign(st.wind || 1) * (0.4 + Math.abs(st.wind)); if (w.x > 12) w.x = -12; if (w.x < -12) w.x = 12; M.compose(V.set(w.x, base - 6 + w.y, w.z), Q4.identity(), S3.set(0.6 + Math.abs(st.wind) * 1.5, 1, 1)); windMesh.setMatrixAt(i, M); }); windMesh.instanceMatrix.needsUpdate = true; $('#windBadge').textContent = `${st.wind > 0 ? '→' : '←'} wind ${Math.round(Math.abs(st.wind) * 10)}`; } else { windMesh.count = 0; $('#windBadge').textContent = ''; }
}
function frame(dt, t) {
  G.t = t; updateTweens(dt);
  const st = G.st;
  if (st && G.screen === 'play') {
    for (let r = 0; r < Math.max(1, G.ff | 0); r++) {
      K.update(st, dt / Math.max(1, G.ff | 0) * (G.ff > 1 ? G.ff : 1));
      if (G.auto > 0 && K.shouldDrop(st, st.tol * 0.5)) { G.auto--; tap(); if (G.screen !== 'play') break; }
    }
  }
  const H = st ? K.height(st) : 0; skyAt(H + (G.screen === 'menu' ? 0 : 0));
  // camera follows the top; zooms out at game over to show the whole tower
  const topY = st ? K.top(st).y : 0; const want = G.screen === 'over' ? (topY / 2) : topY + 1.2;
  G.camY += (want - G.camY) * Math.min(1, dt * 3);
  G.camZoom += (G.targetZoom - G.camZoom) * Math.min(1, dt * 2.5); setFrustum();
  const look = V.set(0, G.camY, 0); camera.position.copy(look).addScaledVector(ISO, 60); camera.lookAt(look);
  if (G.wob > 0) { G.wob = Math.max(0, G.wob - dt * 3); if (settings.shake && !settings.reducedMotion) camera.position.x += Math.sin(t * 60) * 0.04 * G.wob; }
  sun.position.set(look.x + U.sunDir.value.x * 25, look.y + U.sunDir.value.y * 25, look.z + U.sunDir.value.z * 25); sun.target.position.copy(look); sun.castShadow = !!cfg.shadows && settings.quality !== 'low';
  writeSlabs(dt); writeFx(dt);
  P.counts.slabs = slabs.count; P.counts.debris = debMesh.count; P.counts.height = H;
}
startLoop(renderer, frame, post.render);

function applyConfig(c) {
  const prev = cfg; cfg = c; document.documentElement.style.setProperty('--accent', c.colors?.accent || DEFAULTS.colors.accent);
  const st = G.st; if (st) { st.tol = K.DIFF[G.diff].tol * c.tolerance; st.windK = (G.mode === 'wind' ? 1 : 0) * c.wind; st.hueStep = c.hueStep; if (st.cur) st.cur.speed = K.DIFF[G.diff].speed * c.speed * (1 + Math.min(1.1, K.height(st) * st.accel)); st.speed0 = K.DIFF[G.diff].speed * c.speed; }
  if (c.difficulty !== prev.difficulty) { G.diff = c.difficulty; menu.values.difficulty = c.difficulty; document.querySelectorAll('#menu .sd-row[data-key="difficulty"] .sd-btn').forEach((b) => b.classList.toggle('on', b.dataset.v === c.difficulty)); }
  if (c.mode !== prev.mode) { menu.values.mode = c.mode; document.querySelectorAll('#menu .sd-row[data-key="mode"] .sd-btn').forEach((b) => b.classList.toggle('on', b.dataset.v === c.mode)); }
}
applyConfig(cfg);

P.dataReady = true;
P.game = {
  state: () => ({ screen: G.screen, mode: G.mode, height: G.st ? K.height(G.st) : 0, over: G.st?.over, streak: G.st?.streak, perfects: G.st?.perfects, best: save.best }),
  start: (mode = 'classic') => { menu.hide(); closeCard(); newRun(mode); },
  drop: () => tap(),
  perfect: () => { const st = G.st; st.cur[st.cur.axis] = K.top(st)[st.cur.axis]; tap(); },
  autoplay: (n = 10, ff = 4) => { G.auto = n; G.ff = ff; return n; },
  ff: (n) => (G.ff = n),
  miss: () => { const st = G.st; if (!st?.cur) return; st.cur[st.cur.axis] = K.top(st)[st.cur.axis] + st.cur[st.cur.axis === 'x' ? 'w' : 'd'] * 1.5; tap(); },
  build: (n) => { const st = G.st; for (let k = 0; k < n; k++) { st.cur[st.cur.axis] = K.top(st)[st.cur.axis] + (k % 5 === 0 ? 0.3 : 0); const r = K.drop(st); if (r.milestone) save.milestones[r.milestone.name] = true; } hud(); },
  pause, closeCard,
};
if (Q.has('autostart')) { menu.hide(); newRun(Q.get('autostart') || 'classic'); }
