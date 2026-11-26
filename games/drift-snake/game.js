// Neon Drift — three.js r187 renderer around sim.js. A glowing light-snake glides over a neon-gridded planet; chase
// cameras ride behind each head. Two-player hotseat composites two scene passes side-by-side in one TSL RenderPipeline
// (so both halves get bloom), instead of scissor renders.
import { THREE, createRenderer, createPipeline, autoResize, probe, startLoop, spaceBackground, settings, store, sfx, startMenu, settingsButton, initUI, toast, loadDream, host, Q, updateTweens, shake, applyShake, flash } from '/shared/sd-kit.js';
import { pass, uniform, vec2, vec3, float, Fn, positionLocal, normalView, positionViewDirection, abs, dot, oneMinus, fract, fwidth, min, max, smoothstep, asin, atan, screenUV, select, instancedBufferAttribute, time, sin, mix, length } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import * as S from './sim.js';
import { audio } from './audio.js';

const DEFAULTS = { theme: 'auto', colors: { p1: '#38f0ff', p2: '#ff5ad8' }, difficulty: 'normal', mode: 'classic', speed: 1, orbs: 7, growth: 3, rocks: 10, gridGlow: 1, roundsToWin: 3 };
let cfg = await loadDream(DEFAULTS, (c) => applyConfig(c));
const $ = (s) => document.querySelector(s);
initUI();
const save = Object.assign({ best: { classic: 0, portal: 0 }, planetsCleared: 0, finale: false, diff: null }, store.get('neon-drift-v1') || {});
const persist = () => store.set('neon-drift-v1', save);
const R = S.RADIUS;
const PAL = [{ a: '#2a6cff', b: '#38f0ff', bg: [0x020414, 0x0a2a6a, 0x1a0a4a] }, { a: '#ff3ad0', b: '#8a4aff', bg: [0x0c0214, 0x5a0a5a, 0x1a0a5a] }, { a: '#ff8a1a', b: '#ffd040', bg: [0x120604, 0x6a2a0a, 0x4a0a1a] }];

// ---------------------------------------------------------------- renderer + scene
const renderer = await createRenderer({ toneMapping: 'neutral', exposure: 1.0, shadows: false });
const scene = new THREE.Scene();
const camA = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 400), camB = camA.clone();
const bg = spaceBackground(scene, { density: 1.1 });
scene.add(new THREE.HemisphereLight(0x8fb0ff, 0x100818, 0.5)); const key = new THREE.DirectionalLight(0xffffff, 0.8); key.position.set(10, 20, 15); scene.add(key);
const single = createPipeline(renderer, scene, camA, { bloom: { strength: 0.9, radius: 0.5, threshold: 0.6 } });
// split-screen pipeline: two passes sampled into the left/right halves, bloom over the composite
let split = null;
function makeSplit() {
  const pl = new THREE.RenderPipeline(renderer); const pA = pass(scene, camA), pB = pass(scene, camB);
  const tA = pA.getTextureNode('output'), tB = pB.getTextureNode('output');
  const left = screenUV.x.lessThan(0.5);
  const col = select(left, tA.sample(vec2(screenUV.x.mul(2), screenUV.y)), tB.sample(vec2(screenUV.x.sub(0.5).mul(2), screenUV.y)));
  const divider = smoothstep(0.003, 0.0, abs(screenUV.x.sub(0.5)));
  const out = col.add(vec3(divider.mul(0.8)));
  pl.outputNode = settings.quality === 'low' ? out : out.add(bloom(out, 0.8, 0.5, 0.62));
  return pl;
}
const P = probe(renderer, { dataReady: false });
const uA = uniform(new THREE.Color(PAL[0].a)), uB = uniform(new THREE.Color(PAL[0].b)), uGlow = uniform(1);

// planet with an anti-aliased lat/long neon grid
const planetMat = new THREE.MeshStandardNodeMaterial({ color: 0x05060e, roughness: 0.7, metalness: 0.2 });
const gridN = Fn(() => { const n = positionLocal.normalize(); const lat = asin(n.y).mul(18 / Math.PI * 2); const lon = atan(n.z, n.x).mul(36 / Math.PI); const g = vec2(lon, lat); const f = fract(g); const w = fwidth(g).mul(1.3); const d = min(f, oneMinus(f)); const l = max(oneMinus(smoothstep(vec2(0), w, d)).x, oneMinus(smoothstep(vec2(0), w, d)).y); return l; })();
planetMat.emissiveNode = mix(uA, uB, positionLocal.y.div(R).mul(0.5).add(0.5)).mul(gridN.mul(1.6).mul(uGlow)).add(uA.mul(0.03));
const planet = new THREE.Mesh(new THREE.SphereGeometry(R, 128, 96), planetMat); scene.add(planet);
const atmoMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide });
atmoMat.colorNode = uB.mul(oneMinus(abs(dot(normalView, positionViewDirection))).pow(3).mul(0.0).add(abs(dot(normalView, positionViewDirection)).pow(4).mul(1.4)));
scene.add(new THREE.Mesh(new THREE.SphereGeometry(R * 1.08, 64, 48), atmoMat));

// snakes: instanced trail beads + head + light
const MAXT = 700;
function makeSnakeVis(colorHex) {
  const uC = uniform(new THREE.Color(colorHex)); const aF = new THREE.InstancedBufferAttribute(new Float32Array(MAXT), 1); aF.setUsage(THREE.DynamicDrawUsage);
  const m = new THREE.MeshBasicNodeMaterial(); m.colorNode = uC.mul(instancedBufferAttribute(aF).mul(2.4).add(0.25));
  const trail = new THREE.InstancedMesh(new THREE.SphereGeometry(0.15, 10, 8), m, MAXT); trail.count = 0; trail.frustumCulled = false; trail.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(trail);
  const hm = new THREE.MeshBasicNodeMaterial(); hm.colorNode = uC.mul(3.5).add(0.8); const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 14), hm); scene.add(head);
  const light = new THREE.PointLight(colorHex, 18, 8, 1.6); scene.add(light);
  return { uC, aF, trail, head, light, camPos: new THREE.Vector3(), camUp: new THREE.Vector3(0, 1, 0), camLook: new THREE.Vector3() };
}
const vis = [makeSnakeVis(cfg.colors.p1), makeSnakeVis(cfg.colors.p2)];
// orbs
const MAXO = 24; const oCol = new THREE.InstancedBufferAttribute(new Float32Array(MAXO * 3), 3); oCol.setUsage(THREE.DynamicDrawUsage);
const orbMat = new THREE.MeshBasicNodeMaterial(); orbMat.colorNode = instancedBufferAttribute(oCol).mul(sin(time.mul(6)).mul(0.3).add(2.6));
const orbMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.42, 0), orbMat, MAXO); orbMesh.count = 0; orbMesh.frustumCulled = false; scene.add(orbMesh);
// rocks: crystal pylons along the surface normal
const rockMat = new THREE.MeshStandardNodeMaterial({ color: 0x1a0a12, roughness: 0.3, metalness: 0.4 }); rockMat.emissiveNode = vec3(1.4, 0.15, 0.25).mul(oneMinus(abs(dot(normalView, positionViewDirection))).pow(2).mul(2).add(0.15));
const rockMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(0.55, 1.6, 5), rockMat, 40); rockMesh.count = 0; rockMesh.frustumCulled = false; scene.add(rockMesh);
// portals
const portalMeshes = Array.from({ length: 4 }, (_, k) => { const g = new THREE.Group(); const ringM = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(k < 2 ? 0.6 : 3, k < 2 ? 3 : 1.2, k < 2 ? 3 : 0.3) }); const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.07, 8, 40), ringM); const dm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }); dm.colorNode = Fn(() => { const p = positionLocal.xy; const r = length(p); const a = atan(p.y, p.x); return vec3(k < 2 ? 0.3 : 1.6, k < 2 ? 1.4 : 0.6, k < 2 ? 1.6 : 0.2).mul(sin(a.mul(4).add(r.mul(10)).sub(time.mul(6))).mul(0.5).add(0.5).mul(smoothstep(0.7, 0.1, r))); })(); const disc = new THREE.Mesh(new THREE.CircleGeometry(0.66, 32), dm); g.add(ring, disc); g.visible = false; scene.add(g); return g; });
// sparks
const SPN = 300; const spCol = new THREE.InstancedBufferAttribute(new Float32Array(SPN * 3), 3); spCol.setUsage(THREE.DynamicDrawUsage); const spMat = new THREE.MeshBasicNodeMaterial(); spMat.colorNode = instancedBufferAttribute(spCol).mul(3);
const spMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.08), spMat, SPN); spMesh.count = 0; spMesh.frustumCulled = false; scene.add(spMesh); const sparks = [];
const V = new THREE.Vector3(), V2 = new THREE.Vector3(), M = new THREE.Matrix4(), Qt = new THREE.Quaternion(), SC = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), C = new THREE.Color();
const v3 = (a, k = R) => V.set(a[0] * k, a[1] * k, a[2] * k);
function burst(p, col, n, k = R + 0.3) { C.set(col); const base = new THREE.Vector3(p[0] * k, p[1] * k, p[2] * k); for (let i = 0; i < n * (settings.reducedMotion ? 0.4 : 1); i++) { if (sparks.length > SPN) sparks.shift(); sparks.push({ p: base.clone(), v: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(3 + Math.random() * 5).addScaledVector(base.clone().normalize(), 2), t: 0, life: 0.5 + Math.random() * 0.5, r: C.r, g: C.g, b: C.b }); } }

// ---------------------------------------------------------------- game flow
const G = { screen: 'menu', mode: cfg.mode, diff: save.diff || cfg.difficulty, w: null, planet: 0, lives: 3, score: 0, input: [{ steer: 0 }, { steer: 0 }], keys: {}, touch: {}, auto: 0, wins: [0, 0], round: 1, roundT: 0, pausedFor: 0 };
const players = () => (G.mode === 'duel' ? 2 : 1);
function setPlanet(ix) { const p = PAL[cfg.theme === 'auto' ? ix % 3 : { cobalt: 0, magenta: 1, solar: 2 }[cfg.theme] ?? 0]; uA.value.set(p.a); uB.value.set(p.b); bg.base.value.setHex(p.bg[0]); bg.c1.value.setHex(p.bg[1]); bg.c2.value.setHex(p.bg[2]); }
function makeWorld() { return S.createWorld({ mode: G.mode === 'portal' ? 'portal' : 'classic', difficulty: G.diff, players: players(), seed: (Date.now() & 0xffff) + G.planet * 31 + G.round, planet: Math.min(2, G.planet), speedMul: cfg.speed, orbs: cfg.orbs, growth: cfg.growth, rocks: G.mode === 'duel' ? Math.round(cfg.rocks * 0.6) : Math.round(cfg.rocks * { easy: 0.6, normal: 1, hard: 1.5 }[G.diff]) }); }
function start(mode = G.mode) {
  G.mode = mode; G.planet = 0; G.score = 0; G.lives = { easy: 5, normal: 3, hard: 2 }[G.diff]; G.wins = [0, 0]; G.round = 1; closeCard();
  begin(); host('start', { mode });
}
function begin() {
  G.w = makeWorld(); setPlanet(G.planet); G.screen = 'countdown'; G.count = 2.2; G.roundT = 0; resetCams();
  $('#hud').classList.add('show'); $('#hud').classList.toggle('duel', G.mode === 'duel'); $('#pads').classList.toggle('duel', G.mode === 'duel'); $('#pads').classList.add('show');
  for (let i = 0; i < 2; i++) { vis[i].trail.visible = vis[i].head.visible = i < players(); vis[i].light.intensity = i < players() ? 18 : 0; }
  portalMeshes.forEach((g, k) => { const P = G.w.portals[k >> 1]; g.visible = !!P; if (P) placeOnSurface(g, k % 2 ? P.b : P.a, 0.05); });
  banner(G.mode === 'duel' ? `Round ${G.round}` : S.PLANETS[G.planet % 3].name, G.mode === 'duel' ? `First to ${cfg.roundsToWin}` : `Collect ${G.w.goal} light orbs`); hud(); fit();
}
function placeOnSurface(obj, p, lift) { obj.position.copy(v3(p, R + lift)); Qt.setFromUnitVectors(V2.set(0, 0, 1), V.set(p[0], p[1], p[2])); obj.quaternion.copy(Qt); }
function resetCams() { G.w.snakes.forEach((s, i) => { const vv = vis[i]; vv.camUp.set(...s.p); vv.camPos.copy(v3(s.p, R + 4.2)).addScaledVector(V2.set(...s.h), -6.2); vv.camLook.copy(v3(s.p, R + 1.2)).addScaledVector(V2.set(...s.h), 7); }); }
function onEvents() {
  const w = G.w;
  for (const e of w.events) {
    if (e.t === 'eat') { const col = e.gold ? '#ffd24a' : (e.id ? cfg.colors.p2 : cfg.colors.p1); burst(e.p, col, e.gold ? 30 : 16); audio.eat(w.snakes[e.id].score, e.gold); if (G.mode !== 'duel') G.score += e.gold ? 5 : 1; floatText(e.gold ? '+5 gold' : '+1', e.id); }
    if (e.t === 'crash') { burst(e.p, '#ff3050', 50); burst(e.p, e.id ? cfg.colors.p2 : cfg.colors.p1, 40); audio.crash(); shake(0.4); flash('#ff2050', 180); }
    if (e.t === 'portal') { audio.portal(); burst(e.to, '#a0ffff', 20); }
    if (e.t === 'cleared') planetCleared();
    if (e.t === 'over') setTimeout(lifeLost, 900);
    if (e.t === 'round') setTimeout(() => roundOver(e.winner), 900);
  }
  w.events.length = 0;
}
function planetCleared() {
  G.screen = 'between'; audio.clear(); save.planetsCleared++; persist();
  if (G.planet >= 2) { setTimeout(finale, 1200); return; }
  card(`<div class="eyebrow">Planet charged</div><h2>${S.PLANETS[G.planet].name} is glowing!</h2><p class="sub">Score ${G.score} · ${G.lives} ${G.lives === 1 ? 'life' : 'lives'} left</p><div class="sd-row"><button class="sd-btn primary" id="nx">Next planet</button></div>`, () => { $('#nx').onclick = () => { closeCard(); G.planet++; begin(); }; });
}
function lifeLost() {
  G.lives--; if (G.lives > 0) { toast(`${G.lives} ${G.lives === 1 ? 'life' : 'lives'} left`); begin(); return; }
  G.screen = 'over'; const k = G.mode === 'portal' ? 'portal' : 'classic'; const nb = G.score > save.best[k]; save.best[k] = Math.max(save.best[k], G.score); persist(); host('score', { mode: k, score: G.score }); sfx.lose();
  card(`<div class="eyebrow">${G.mode === 'portal' ? 'Portal' : 'Classic'} · ${S.PLANETS[G.planet].name}</div><h2>${nb ? 'New best!' : 'Light out'}</h2><p class="big">${G.score}</p><p class="sub">Best ${save.best[k]} · reached planet ${G.planet + 1} of 3. Tip: wide arcs beat tight turns — your tail is longer than it looks.</p>
    <div class="sd-row"><button class="sd-btn primary" id="ag">Drift again</button><button class="sd-btn" id="mn">Menu</button></div>`, () => { $('#ag').onclick = () => start(); $('#mn').onclick = () => { closeCard(); toMenu(); }; });
}
function roundOver(winner) {
  if (winner >= 0) G.wins[winner]++; G.screen = 'between'; audio.clear();
  const done = G.wins.some((x) => x >= cfg.roundsToWin);
  card(`<div class="eyebrow">Round ${G.round}</div><h2>${winner < 0 ? 'Double crash!' : `Player ${winner + 1} takes it`}</h2><p class="big"><span style="color:${cfg.colors.p1}">${G.wins[0]}</span> : <span style="color:${cfg.colors.p2}">${G.wins[1]}</span></p>${done ? `<p class="sub">Player ${G.wins[0] > G.wins[1] ? 1 : 2} wins the match!</p>` : ''}
    <div class="sd-row"><button class="sd-btn primary" id="nr">${done ? 'Rematch' : 'Next round'}</button><button class="sd-btn" id="mn">Menu</button></div>`, () => { $('#nr').onclick = () => { closeCard(); if (done) start('duel'); else { G.round++; begin(); } }; $('#mn').onclick = () => { closeCard(); toMenu(); }; });
}
// FABLE: finale flyby — camera pulls out to show all three charged planets in orbit around each other.
function finale() {
  G.screen = 'over'; save.finale = true; const k = G.mode === 'portal' ? 'portal' : 'classic'; save.best[k] = Math.max(save.best[k], G.score); persist(); sfx.win();
  card(`<div class="eyebrow">All three planets charged</div><h2>The system shines</h2><p class="big">${G.score}</p><p class="sub">Cobalt, Magenta and Solar are lit. Try Portal mode, a harder difficulty, or challenge a friend in Duel.</p>
    <div class="sd-row"><button class="sd-btn primary" id="ag">Play again</button><button class="sd-btn" id="mn">Menu</button></div>`, () => { $('#ag').onclick = () => start(); $('#mn').onclick = () => { closeCard(); toMenu(); }; });
}
function toMenu() { G.screen = 'menu'; $('#hud').classList.remove('show'); $('#pads').classList.remove('show'); menu.show(); }

// ---------------------------------------------------------------- UI
document.body.insertAdjacentHTML('beforeend', `
<div id="hud"><button class="sd-btn sd-icon" id="pauseBtn" aria-label="Pause">❚❚</button>
  <div class="solo"><small id="hPlanet">Cobalt</small><div class="prog"><i id="hProg"></i></div><b id="hScore">0</b><span id="hLives"></span></div>
  <div class="duo"><b id="d1" style="color:var(--p1)">0</b><small id="dRound">Round 1</small><b id="d2" style="color:var(--p2)">0</b></div></div>
<div id="pads"><button class="pad" data-p="0" data-d="-1" aria-label="Player 1 left">◀</button><button class="pad" data-p="0" data-d="1" aria-label="Player 1 right">▶</button><button class="pad p2" data-p="1" data-d="-1" aria-label="Player 2 left">◀</button><button class="pad p2" data-p="1" data-d="1" aria-label="Player 2 right">▶</button></div>
<div id="banner"><small></small><b></b></div><div id="count"></div><div id="floaty"></div>
<div id="card" class="sd-panel"><div class="sd-card nd-card" id="cardBody"></div></div>`);
const menu = startMenu({ title: 'Neon Drift', subtitle: 'Steer a ribbon of light around tiny planets. Eat orbs, grow longer, never touch your own glow.',
  options: [{ key: 'mode', label: 'Mode', value: ['classic', 'portal', 'duel'].includes(cfg.mode) ? cfg.mode : 'classic', choices: [{ v: 'classic', label: 'Classic' }, { v: 'portal', label: '◎ Portal' }, { v: 'duel', label: '2P Duel' }] },
    { key: 'difficulty', label: 'Difficulty', value: G.diff, choices: [{ v: 'easy', label: 'Easy' }, { v: 'normal', label: 'Normal' }, { v: 'hard', label: 'Hard' }] }],
  startLabel: 'Drift', onStart: (v) => { G.diff = v.difficulty; save.diff = v.difficulty; persist(); start(v.mode); } });
settingsButton();
let cardOpen = false;
function card(html, wire) { $('#cardBody').innerHTML = html; $('#card').classList.add('open'); cardOpen = true; wire?.(); }
function closeCard() { $('#card').classList.remove('open'); cardOpen = false; }
function banner(a, b) { const e = $('#banner'); e.querySelector('small').textContent = b; e.querySelector('b').textContent = a; e.classList.remove('show'); void e.offsetWidth; e.classList.add('show'); }
let fl = 0; function floatText(t, id) { const e = $('#floaty'); e.textContent = t; e.style.left = G.mode === 'duel' ? (id ? '75%' : '25%') : '50%'; e.classList.remove('show'); void e.offsetWidth; e.classList.add('show'); }
function pause() { if (!['play', 'countdown'].includes(G.screen) || cardOpen) return; sfx.click(); G.prev = G.screen; G.screen = 'paused';
  card(`<h2>Paused</h2><div class="sd-row col"><button class="sd-btn primary" id="pr">Resume</button><button class="sd-btn" id="ps">Settings</button><button class="sd-btn" id="pre">Restart</button><button class="sd-btn" id="pm">Main menu</button></div>`, () => { $('#pr').onclick = () => { closeCard(); G.screen = G.prev; }; $('#ps').onclick = () => $('#sd-gear').click(); $('#pre').onclick = () => start(); $('#pm').onclick = () => { closeCard(); toMenu(); }; }); }
$('#pauseBtn').onclick = () => pause();
function hud() {
  const w = G.w; if (!w) return;
  if (G.mode === 'duel') { $('#d1').textContent = `P1 · ${w.snakes[0].score}`; $('#d2').textContent = `${w.snakes[1].score} · P2`; $('#dRound').textContent = `Round ${G.round} · ${G.wins[0]}–${G.wins[1]}`; }
  else { $('#hPlanet').textContent = `${S.PLANETS[G.planet].name} · ${Math.min(w.collected, w.goal)}/${w.goal}`; $('#hProg').style.width = `${Math.min(100, (w.collected / w.goal) * 100)}%`; $('#hScore').textContent = G.score; $('#hLives').textContent = '●'.repeat(Math.max(0, G.lives)); }
}
// input: keyboard, on-screen pads, and (1P) hold left/right half of the screen
addEventListener('keydown', (e) => { if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { if (G.screen === 'paused') $('#pr')?.click(); else pause(); return; } G.keys[e.key.toLowerCase()] = 1; if (e.key.startsWith('Arrow')) e.preventDefault(); });
addEventListener('keyup', (e) => { G.keys[e.key.toLowerCase()] = 0; });
document.querySelectorAll('.pad').forEach((b) => { const on = (v) => (e) => { e.preventDefault(); e.stopPropagation(); G.touch[`${b.dataset.p}${b.dataset.d}`] = v; b.classList.toggle('on', !!v); }; b.addEventListener('pointerdown', on(1)); b.addEventListener('pointerup', on(0)); b.addEventListener('pointerleave', on(0)); b.addEventListener('pointercancel', on(0)); });
const held = new Map();
renderer.domElement.addEventListener('pointerdown', (e) => { if (G.mode === 'duel') return; held.set(e.pointerId, e.clientX < innerWidth / 2 ? -1 : 1); });
addEventListener('pointerup', (e) => held.delete(e.pointerId)); addEventListener('pointercancel', (e) => held.delete(e.pointerId));
function readInput() {
  const k = G.keys, t = G.touch;
  if (G.mode === 'duel') { G.input[0].steer = (k['d'] ? 1 : 0) - (k['a'] ? 1 : 0) + (t['01'] ? 1 : 0) - (t['0-1'] ? 1 : 0); G.input[1].steer = (k['arrowright'] ? 1 : 0) - (k['arrowleft'] ? 1 : 0) + (t['11'] ? 1 : 0) - (t['1-1'] ? 1 : 0); }
  else { let s = (k['d'] || k['arrowright'] ? 1 : 0) - (k['a'] || k['arrowleft'] ? 1 : 0) + (t['01'] ? 1 : 0) - (t['0-1'] ? 1 : 0); for (const v of held.values()) s += v; G.input[0].steer = Math.max(-1, Math.min(1, s)); }
  if (G.auto > 0) G.w.snakes.forEach((s, i) => (G.input[i] = S.autopilot(G.w, s)));
}

// ---------------------------------------------------------------- frame
function fit() { const a = innerWidth / innerHeight, duel = G.mode === 'duel' && G.screen !== 'menu'; camA.aspect = duel ? a / 2 : a; camB.aspect = a / 2; camA.fov = camB.fov = a < 0.8 ? 72 : 60; camA.updateProjectionMatrix(); camB.updateProjectionMatrix(); }
autoResize(renderer, camA, fit);
const tq = new THREE.Quaternion();
function drawSnakes(dt) {
  const w = G.w; if (!w) return;
  w.snakes.forEach((s, i) => {
    const vv = vis[i]; let n = 0; const L = s.trail.length;
    for (let k = 0; k < L && n < MAXT; k++) { const p = s.trail[k]; const f = 1 - k / Math.max(L, 1); M.compose(v3(p, R + 0.22), tq.identity(), SC.setScalar(s.alive ? 0.7 + f * 0.6 : 0.6 + f * 0.4)); vv.trail.setMatrixAt(n, M); vv.aF.setX(n, s.alive ? f : f * 0.3); n++; }
    vv.trail.count = n; vv.trail.instanceMatrix.needsUpdate = true; vv.aF.needsUpdate = true;
    vv.head.visible = s.alive; vv.head.position.copy(v3(s.p, R + 0.3)); vv.light.position.copy(v3(s.p, R + 1.2)); vv.light.intensity = s.alive ? 18 : 0;
    // chase camera: above and behind, up = surface normal (smoothed so turns feel like banking)
    const up = V2.set(...s.p); const k = G.ff > 1 ? 1 : 1 - Math.exp(-dt * 5);
    vv.camUp.lerp(up, k).normalize(); const tall = camA.aspect < 1; const want = v3(s.p, R + (tall ? 6.6 : 5.4)).clone().addScaledVector(new THREE.Vector3(...s.h), tall ? -3.6 : -5.2); vv.camPos.lerp(want, k);
    const look = v3(s.p, R + (tall ? -1.8 : -1.2)).clone().addScaledVector(new THREE.Vector3(...s.h), tall ? 4.2 : 5.5); vv.camLook.lerp(look, G.ff > 1 ? 1 : 1 - Math.exp(-dt * 8));
  });
  const cams = [camA, camB]; w.snakes.forEach((s, i) => { const c = cams[i], vv = vis[i]; c.position.copy(vv.camPos); c.up.copy(vv.camUp); c.lookAt(vv.camLook); });
  applyShake(camA, dt);
  // orbs
  let n = 0; for (const o of w.orbs) { if (n >= MAXO) break; const bob = Math.sin(G.t * 3 + o.id) * 0.12; Qt.setFromEuler(new THREE.Euler(G.t * 1.5 + o.id, G.t, 0)); M.compose(v3(o.p, R + 0.55 + bob), Qt, SC.setScalar(o.gold ? 1.4 : 1)); orbMesh.setMatrixAt(n, M); C.set(o.gold ? '#ffd24a' : '#ffffff'); if (!o.gold) C.set(PAL[G.planet % 3].b); oCol.setXYZ(n, C.r, C.g, C.b); n++; }
  orbMesh.count = n; orbMesh.instanceMatrix.needsUpdate = true; oCol.needsUpdate = true;
  n = 0; for (const r of w.rocks) { Qt.setFromUnitVectors(UP, V2.set(...r.p)); M.compose(v3(r.p, R + 0.6 * r.r / 0.5), Qt, SC.setScalar(r.r / 0.5)); rockMesh.setMatrixAt(n++, M); } rockMesh.count = n; rockMesh.instanceMatrix.needsUpdate = true;
  portalMeshes.forEach((g) => { if (g.visible) g.children[0].rotation.z = G.t * 1.5; });
  n = 0; for (let i = sparks.length - 1; i >= 0; i--) { const s = sparks[i]; s.t += dt; if (s.t > s.life) { sparks.splice(i, 1); continue; } s.p.addScaledVector(s.v, dt); s.v.multiplyScalar(1 - dt * 2.5); M.compose(s.p, tq.identity(), SC.setScalar(1 - s.t / s.life)); spMesh.setMatrixAt(n, M); spCol.setXYZ(n, s.r, s.g, s.b); n++; }
  spMesh.count = n; spMesh.instanceMatrix.needsUpdate = true; spCol.needsUpdate = true;
}
let hudT = 0;
function frame(dt, t) {
  G.t = t; updateTweens(dt);
  if (G.screen === 'menu') { const a = t * 0.12; camA.position.set(Math.cos(a) * 24, 8, Math.sin(a) * 24); camA.up.set(0, 1, 0); camA.lookAt(0, 0, 0); planet.rotation.y = 0; }
  if (G.w && G.screen === 'countdown') { G.count -= dt; $('#count').textContent = G.count > 1.4 ? '' : G.count > 0.7 ? 'Ready' : 'Drift!'; if (G.count <= 0) { G.screen = 'play'; $('#count').textContent = ''; audio.go(); } }
  if (G.w && G.screen === 'play') { readInput(); const reps = Math.max(1, G.ff | 0); for (let r = 0; r < reps && G.screen === 'play'; r++) { if (r) readInput(); S.step(G.w, dt / (reps > 1 ? 1 : 1), G.input); onEvents(); } if (G.auto > 0) G.auto -= dt; G.roundT += dt;
    if (G.mode === 'duel' && G.roundT > 90 && !G.w.over) { const [a, b] = G.w.snakes; G.w.over = true; G.screen = 'between'; setTimeout(() => roundOver(a.score === b.score ? -1 : a.score > b.score ? 0 : 1), 300); } }
  if (G.w) drawSnakes(dt);
  if ((hudT += dt) > 0.1) { hudT = 0; hud(); }
  P.counts.trail = (G.w?.snakes || []).reduce((a, s) => a + s.trail.length, 0); P.counts.orbs = G.w?.orbs.length || 0;
}
function render() { if (G.mode === 'duel' && G.w && G.screen !== 'menu') { split ||= makeSplit(); split.render(); } else single.render(); }
startLoop(renderer, frame, render);

function applyConfig(c) {
  const prev = cfg; cfg = c; vis[0].uC.value.set(c.colors?.p1 || DEFAULTS.colors.p1); vis[1].uC.value.set(c.colors?.p2 || DEFAULTS.colors.p2); vis[0].light.color.set(c.colors?.p1 || '#38f0ff'); vis[1].light.color.set(c.colors?.p2 || '#ff5ad8');
  document.documentElement.style.setProperty('--p1', c.colors?.p1 || '#38f0ff'); document.documentElement.style.setProperty('--p2', c.colors?.p2 || '#ff5ad8'); uGlow.value = c.gridGlow ?? 1;
  if (G.w) { G.w.speedMul = c.speed; G.w.growth = c.growth; while (G.w.orbs.length < c.orbs) S.spawnOrb(G.w); if (G.w.orbs.length > c.orbs) G.w.orbs.length = Math.max(1, c.orbs); }
  if (c.theme !== prev.theme) setPlanet(G.planet);
  if (c.difficulty !== prev.difficulty) { G.diff = c.difficulty; menu.values.difficulty = c.difficulty; document.querySelectorAll('#menu .sd-row[data-key="difficulty"] .sd-btn').forEach((b) => b.classList.toggle('on', b.dataset.v === c.difficulty)); }
  if (c.mode !== prev.mode) { menu.values.mode = c.mode; document.querySelectorAll('#menu .sd-row[data-key="mode"] .sd-btn').forEach((b) => b.classList.toggle('on', b.dataset.v === c.mode)); }
}
applyConfig(cfg); fit();
P.dataReady = true;
P.game = {
  state: () => ({ screen: G.screen, mode: G.mode, planet: G.planet, score: G.score, lives: G.lives, wins: G.wins, collected: G.w?.collected, goal: G.w?.goal, alive: G.w?.snakes.map((s) => s.alive), len: G.w?.snakes.map((s) => s.len) }),
  start: (mode = 'classic') => { menu.hide(); start(mode); G.count = 0.01; },
  autoplay: (seconds = 10, ff = 1) => { G.auto = seconds; G.ff = ff; return seconds; },
  ff: (n) => (G.ff = n),
  crash: () => { const s = G.w.snakes[0]; G.w.rocks.push({ p: S.norm(S.add(s.p, s.h, 0.04)), r: 0.5 }); },
  charge: () => { G.w.collected = G.w.goal - 1; },
  pause, closeCard,
};
if (Q.has('autostart')) { menu.hide(); start(Q.get('autostart') || 'classic'); }
