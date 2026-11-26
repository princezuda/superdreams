// Prism Breaker — three.js r187 renderer + flow around the pure sim (sim.js). Glass/neon bricks are instanced (one draw
// per material class), shards/sparks/trails are pooled instanced meshes, bloom comes from the kit pipeline.
import { THREE, createRenderer, createPipeline, autoResize, probe, startLoop, spaceBackground, settings, store, sfx, startMenu, settingsButton, initUI, toast, loadDream, host, Q, tween, updateTweens, ease, shake, applyShake, flash } from '/shared/sd-kit.js';
import { instancedBufferAttribute, normalView, positionViewDirection, float, vec2, vec3, uniform, time, sin, cos, abs, dot, oneMinus, mix, Fn, positionLocal, uv, fract, fwidth, min, max, smoothstep, length, atan, hue, mx_noise_float, select } from 'three/tsl';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as S from './sim.js';
import { LEVELS, WORLDS, TIPS } from './levels.js';
import { audio } from './audio.js';

const DEFAULTS = { theme: 'auto', colors: { accent: '#7af0ff' }, difficulty: 'normal', mode: 'campaign', ballSpeed: 1, paddleWidth: 1, powerRate: 1, gravity: 5, shards: 2, trail: true, bloom: 1 };
let cfg = await loadDream(DEFAULTS, (c) => applyConfig(c));
const $ = (s) => document.querySelector(s);
initUI();
const SAVE_KEY = 'prism-breaker-v1';
const save = Object.assign({ unlocked: 1, stars: Array(30).fill(0), best: Array(30).fill(0), gwBest: 0, gwWave: 0, diff: null, fails: Array(30).fill(0), finale: false }, store.get(SAVE_KEY) || {});
const persist = () => store.set(SAVE_KEY, save);

// ---------------------------------------------------------------- renderer / scene
const renderer = await createRenderer({ toneMapping: 'neutral', exposure: 1.0, shadows: false });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.5, 200);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.8;
const bg = spaceBackground(scene, { nebulaA: 0x0b3a5a, nebulaB: 0x2a1a6e, base: 0x02040a, density: 1.1 });
scene.add(new THREE.HemisphereLight(0x9fc8ff, 0x201830, 0.6));
const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(-4, 8, 12); scene.add(key);
const post = createPipeline(renderer, scene, camera, { bloom: { strength: 0.8, radius: 0.5, threshold: 0.72 } });
const P = probe(renderer, { dataReady: false });

// colour uniforms
const uAccent = uniform(new THREE.Color(cfg.colors.accent)), uWorldA = uniform(new THREE.Color(WORLDS[0].a)), uWorldB = uniform(new THREE.Color(WORLDS[0].b));
const fres = Fn(() => oneMinus(abs(dot(normalView, positionViewDirection))).pow(2.0))();

// ---------------------------------------------------------------- back grid (spacetime fabric; warps around the gravity well)
const uWell = uniform(new THREE.Vector2(0, 1.5)), uWellK = uniform(0);
const gridGeo = new THREE.PlaneGeometry(13, 19.6, 65, 98);
const gridMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
gridMat.positionNode = Fn(() => { const p = positionLocal.toVar(); const d = p.xy.sub(uWell).length(); p.z.subAssign(uWellK.div(d.mul(d).add(0.5))); return p; })();
const gridLines = Fn(() => { const g = uv().mul(vec2(13, 19.6)); const f = fract(g); const w = fwidth(g).mul(1.4); const dd = min(f, oneMinus(f)); const l = max(oneMinus(smoothstep(vec2(0), w, dd)).x, oneMinus(smoothstep(vec2(0), w, dd)).y); return l; })();
const wellGlow = Fn(() => { const d = positionLocal.xy.sub(uWell).length(); return smoothstep(4.0, 0.0, d).mul(uWellK.div(6)); })();
gridMat.colorNode = mix(uWorldA, uWorldB, uv().y).mul(gridLines.mul(0.28).add(wellGlow.mul(2)));
gridMat.opacityNode = gridLines.mul(0.35).add(0.55);
const grid = new THREE.Mesh(gridGeo, gridMat); grid.position.set(0, 0, -0.7); grid.renderOrder = -1; scene.add(grid);
// dark glass behind the grid so the field reads as a framed playfield
const plate = new THREE.Mesh(new THREE.PlaneGeometry(12.6, 19), new THREE.MeshBasicNodeMaterial({ color: 0x03050c, transparent: true, opacity: 0.8, depthWrite: false })); plate.position.z = -0.75; plate.renderOrder = -2; scene.add(plate);
// neon frame
const frameMat = new THREE.MeshBasicNodeMaterial(); frameMat.colorNode = uWorldA.mul(2.6);
const frame = new THREE.Group(); scene.add(frame);
for (const [x, y, len, rot] of [[-6.15, 0, 18.6, 0], [6.15, 0, 18.6, 0], [0, 9.15, 12.3, Math.PI / 2]]) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, len, 10), frameMat); m.position.set(x, y, 0); m.rotation.z = rot; frame.add(m); }
const deathMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }); deathMat.colorNode = vec3(1, 0.15, 0.3).mul(smoothstep(0.5, 1.0, uv().y).mul(0.12));
const death = new THREE.Mesh(new THREE.PlaneGeometry(12.2, 1.2), deathMat); death.position.set(0, -9.0, -0.3); scene.add(death);

// ---------------------------------------------------------------- bricks (instanced per material class)
const MAXB = 180;
function brickClass(matFactory, geo) {
  const aCol = new THREE.InstancedBufferAttribute(new Float32Array(MAXB * 3), 3), aFx = new THREE.InstancedBufferAttribute(new Float32Array(MAXB * 2), 2);
  const col = instancedBufferAttribute(aCol), fx = instancedBufferAttribute(aFx);
  const mesh = new THREE.InstancedMesh(geo, matFactory(col, fx), MAXB); mesh.count = 0; mesh.frustumCulled = false; scene.add(mesh);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); aCol.setUsage(THREE.DynamicDrawUsage); aFx.setUsage(THREE.DynamicDrawUsage);
  return { mesh, aCol, aFx, n: 0 };
}
const brickGeo = new RoundedBoxGeometry(1, 1, 1, 3, 0.16);
const glass = brickClass((col, fx) => { const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.12, metalness: 0.05, transparent: true, envMapIntensity: 0.12 }); m.colorNode = col.mul(0.35); m.opacityNode = float(0.62).add(fres.mul(0.35)); m.emissiveNode = col.mul(fres.mul(2.0).add(0.16).mul(fx.y.mul(0.5).add(0.5))).add(vec3(fx.x.mul(2.2))); return m; }, brickGeo);
const steel = brickClass((col, fx) => { const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.38, metalness: 0.85, envMapIntensity: 0.35 }); m.colorNode = mix(vec3(0.26, 0.31, 0.4), col, 0.2); m.emissiveNode = col.mul(fres.mul(1.3)).add(vec3(fx.x.mul(2.2))); return m; }, brickGeo);
const gold = brickClass((col, fx) => { const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.25, metalness: 1.0, envMapIntensity: 0.55 }); m.colorNode = vec3(1.0, 0.76, 0.36); m.emissiveNode = vec3(1.0, 0.6, 0.2).mul(fres.mul(0.5)).add(vec3(fx.x.mul(1.5))); return m; }, brickGeo);
const cores = brickClass((col, fx) => { const m = new THREE.MeshBasicNodeMaterial(); m.colorNode = col.mul(fx.y.mul(0.9).add(0.75)).add(vec3(fx.x.mul(2.5))); return m; }, new THREE.BoxGeometry(1, 1, 1));
const BRICK_COLORS = { g: null, n: null, s: '#9fb4d0', x: '#ff4fa0', u: '#ffc860', p: '#ffffff' };
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpC = new THREE.Color();
function rowColor(b) {
  if (b.type === 'x') return tmpC.set('#ff4fa0'); if (b.type === 'p') return tmpC.set('#ffffff'); if (b.type === 's') return tmpC.set('#9fb4d0'); if (b.type === 'u') return tmpC.set('#ffc860');
  const w = world(); const t = Math.min(1, b.row / 5.5); tmpC.set(w.a).lerp(new THREE.Color(w.b), t); if (b.type === 'n') tmpC.offsetHSL(0.04, 0.1, 0.06); return tmpC;
}

// ---------------------------------------------------------------- pooled fx: shards, sparks, rings, trails
function pool(geo, mat, n) { const m = new THREE.InstancedMesh(geo, mat, n); m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); return m; }
const SH = 900; const shardCol = new THREE.InstancedBufferAttribute(new Float32Array(SH * 3), 3); shardCol.setUsage(THREE.DynamicDrawUsage);
const shardMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.15, metalness: 0.2, envMapIntensity: 0.2 }); { const c = instancedBufferAttribute(shardCol); shardMat.colorNode = c.mul(0.4); shardMat.emissiveNode = c.mul(fres.mul(2.6).add(0.35)).add(hue(c, normalView.x.mul(4).add(time)).mul(fres.mul(1.4))); }
const shardMesh = pool(new THREE.TetrahedronGeometry(0.15), shardMat, SH);
const shards = Array.from({ length: SH }, () => ({ on: false }));
const SP = 400; const sparkCol = new THREE.InstancedBufferAttribute(new Float32Array(SP * 3), 3); sparkCol.setUsage(THREE.DynamicDrawUsage);
const sparkMat = new THREE.MeshBasicNodeMaterial(); sparkMat.colorNode = instancedBufferAttribute(sparkCol).mul(4.0);
const sparkMesh = pool(new THREE.OctahedronGeometry(0.06), sparkMat, SP); const sparks = Array.from({ length: SP }, () => ({ on: false }));
const shCol = new THREE.Color();
function shardBurst(x, y, col, n, speed = 6, z = 0) {
  n = Math.round(n * juice()); shCol.set(col);
  for (let k = 0, i = 0; k < SH && i < n; k++) { const s = shards[(shardHead = (shardHead + 1) % SH)]; const a = Math.random() * Math.PI * 2, v = speed * (0.3 + Math.random());
    Object.assign(s, { on: true, x: x + (Math.random() - 0.5) * 0.6, y: y + (Math.random() - 0.5) * 0.3, z, vx: Math.cos(a) * v, vy: Math.sin(a) * v + 2, vz: (Math.random() - 0.2) * 5, rx: Math.random() * 6, ry: Math.random() * 6, wx: (Math.random() - 0.5) * 18, wy: (Math.random() - 0.5) * 18, t: 0, life: 0.9 + Math.random() * 0.8, s: 0.5 + Math.random() * 1.1, r: shCol.r, g: shCol.g, b: shCol.b }); i++; }
}
let shardHead = 0, sparkHead = 0;
function sparkBurst(x, y, col, n, speed = 7) { n = Math.round(n * juice()); shCol.set(col); for (let i = 0; i < n; i++) { const s = sparks[(sparkHead = (sparkHead + 1) % SP)]; const a = Math.random() * Math.PI * 2, v = speed * (0.3 + Math.random()); Object.assign(s, { on: true, x, y, z: 0.2, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: 0.3 + Math.random() * 0.35, r: shCol.r, g: shCol.g, b: shCol.b }); } }
const rings = Array.from({ length: 10 }, () => { const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }); const mesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 6, 48), m); mesh.visible = false; scene.add(mesh); return { mesh, m, t: 0, life: 0 }; });
function ring(x, y, r, col, life = 0.45) { const R = rings.find((q) => !q.mesh.visible) || rings[0]; R.mesh.visible = true; R.mesh.position.set(x, y, 0.1); R.t = 0; R.life = life; R.r = r; R.m.color.set(col).multiplyScalar(3); }
// balls + trail + lights
const ballMat = new THREE.MeshBasicNodeMaterial(); ballMat.colorNode = uAccent.mul(3.2).add(0.6);
const ballMeshes = Array.from({ length: 8 }, () => { const m = new THREE.Mesh(new THREE.SphereGeometry(S.BALL_R, 20, 14), ballMat); m.visible = false; scene.add(m); return m; });
const TR = 14; const trailA = new THREE.InstancedBufferAttribute(new Float32Array(8 * TR), 1); trailA.setUsage(THREE.DynamicDrawUsage);
const trailMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }); trailMat.colorNode = uAccent.mul(instancedBufferAttribute(trailA).mul(1.6));
const trailMesh = pool(new THREE.SphereGeometry(S.BALL_R, 10, 6), trailMat, 8 * TR); const hist = new Map();
const ballLights = Array.from({ length: 3 }, () => { const l = new THREE.PointLight(0xffffff, 0, 7, 1.6); scene.add(l); return l; });
// paddle
const paddle = new THREE.Group(); scene.add(paddle);
const padMat = new THREE.MeshStandardNodeMaterial({ color: 0x46587e, roughness: 0.3, metalness: 0.7, envMapIntensity: 0.6 }); padMat.emissiveNode = uAccent.mul(fres.mul(1.4).add(0.12));
const padBody = new THREE.Mesh(new RoundedBoxGeometry(1, 0.46, 0.6, 4, 0.2), padMat); paddle.add(padBody);
const stripMat = new THREE.MeshBasicNodeMaterial(); stripMat.colorNode = uAccent.mul(2.4);
const padStrip = new THREE.Mesh(new THREE.BoxGeometry(1, 0.07, 0.58), stripMat); padStrip.position.y = 0.06; paddle.add(padStrip);
const padEnds = [-1, 1].map(() => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), stripMat); paddle.add(m); return m; });
const turretMat = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(3, 0.4, 0.5) });
const turrets = [-1, 1].map(() => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.4, 8), turretMat); m.position.y = 0.3; m.visible = false; paddle.add(m); return m; });
// lasers + orbs
const laserMat = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(4, 0.5, 0.7) }); const laserMesh = pool(new THREE.BoxGeometry(0.07, 0.55, 0.07), laserMat, 40);
const orbMat = new THREE.MeshBasicNodeMaterial(); orbMat.colorNode = vec3(2.6, 0.4, 2.4).mul(sin(time.mul(12)).mul(0.25).add(1));
const orbMesh = pool(new THREE.IcosahedronGeometry(0.24, 1), orbMat, 12);
// power-ups: capsule + letter sprite
const POW = { multi: { c: '#5cff9a', l: 'M' }, laser: { c: '#ff4f6a', l: 'L' }, wide: { c: '#5ab8ff', l: 'W' }, slow: { c: '#ffd04a', l: 'S' }, life: { c: '#ff8ad8', l: '♥' } };
const powMats = {}, powLabels = {};
for (const [k, v] of Object.entries(POW)) {
  powMats[k] = new THREE.MeshStandardNodeMaterial({ color: new THREE.Color(v.c).multiplyScalar(0.4), roughness: 0.2, metalness: 0.3, emissive: new THREE.Color(v.c).multiplyScalar(1.4) });
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d'); c.fillStyle = '#fff'; c.font = '900 46px Inter,system-ui,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.shadowColor = v.c; c.shadowBlur = 8; c.fillText(v.l, 32, 35);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; powLabels[k] = new THREE.SpriteNodeMaterial({ map: t, transparent: true, depthTest: false });
}
const powPool = Array.from({ length: 8 }, () => { const g = new THREE.Group(); const cap = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.55, 6, 12), powMats.multi); cap.rotation.z = Math.PI / 2; const sp = new THREE.Sprite(powLabels.multi); sp.scale.set(0.55, 0.55, 1); sp.position.z = 0.35; sp.renderOrder = 5; g.add(cap, sp); g.visible = false; scene.add(g); return { g, cap, sp }; });
// boss
const boss = new THREE.Group(); boss.visible = false; scene.add(boss);
const bossShellMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.1, metalness: 0.1, transparent: true, envMapIntensity: 0.2 }); const uBossFlash = uniform(0), uBossHp = uniform(1);
bossShellMat.colorNode = vec3(0.1, 0.1, 0.16); bossShellMat.opacityNode = float(0.45).add(fres.mul(0.5)); bossShellMat.emissiveNode = uWorldA.mul(fres.mul(1.1)).add(vec3(uBossFlash.mul(2)));
boss.add(new THREE.Mesh(new RoundedBoxGeometry(3.3, 1.5, 1.1, 4, 0.3), bossShellMat));
const coreMat = new THREE.MeshBasicNodeMaterial(); coreMat.colorNode = hue(vec3(1.0, 0.3, 0.6), time.mul(1.5).add(positionLocal.y.mul(2))).mul(uBossHp.mul(3).add(1)).add(uBossFlash.mul(4));
const bossCore = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), coreMat); boss.add(bossCore);
const bossRings = [0, 1].map((k) => { const r = new THREE.Mesh(new THREE.TorusGeometry(0.95 + k * 0.25, 0.03, 6, 48), frameMat); boss.add(r); return r; });
// gravity well
const well = new THREE.Group(); well.visible = false; scene.add(well);
well.add(new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 16), new THREE.MeshBasicNodeMaterial({ color: 0x000000 })));
const diskMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
diskMat.colorNode = Fn(() => { const p = positionLocal.xy; const r = length(p); const a = atan(p.y, p.x); const sw = sin(a.mul(3).add(r.mul(7)).sub(time.mul(5))).mul(0.5).add(0.5); const fall = smoothstep(2.0, 0.55, r).mul(smoothstep(0.5, 0.62, r)); return mix(vec3(3.2, 1.4, 0.4), vec3(1.2, 0.5, 3.0), smoothstep(0.6, 1.8, r)).mul(fall.mul(sw.mul(0.7).add(0.35))); })();
const disk = new THREE.Mesh(new THREE.RingGeometry(0.52, 2.0, 96, 4), diskMat); disk.rotation.x = -1.05; well.add(disk);
const halo = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 64), new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(3, 2.4, 1.6), transparent: true, blending: THREE.AdditiveBlending })); well.add(halo);
// world decor (far background)
const decor = { crystal: new THREE.Group(), neon: new THREE.Group(), solar: new THREE.Group() }; Object.values(decor).forEach((g) => scene.add(g));
{ const n = 34; const aC = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3); const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.1, metalness: 0.1, transparent: true, envMapIntensity: 0.15 }); const c = instancedBufferAttribute(aC); m.colorNode = c.mul(0.2); m.opacityNode = float(0.5).add(fres.mul(0.4)); m.emissiveNode = c.mul(fres.mul(1.4).add(0.08));
  const mesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), m, n); mesh.userData.items = [];
  for (let i = 0; i < n; i++) { const it = { x: (Math.random() - 0.5) * 70, y: (Math.random() - 0.5) * 50, z: -14 - Math.random() * 30, s: 0.6 + Math.random() * 2.4, r: Math.random() * 6, w: (Math.random() - 0.5) * 0.3, sy: 1.4 + Math.random() }; if (Math.abs(it.x) < 9 && it.z > -20) it.x += Math.sign(it.x || 1) * 10; mesh.userData.items.push(it); tmpC.setHSL(0.5 + Math.random() * 0.2, 0.8, 0.6); aC.setXYZ(i, tmpC.r, tmpC.g, tmpC.b); }
  mesh.renderOrder = -10; decor.crystal.add(mesh); decor.crystal.userData.mesh = mesh; }
{ const n = 70; const m = new THREE.MeshStandardNodeMaterial({ color: 0x05030a, roughness: 1, metalness: 0, envMapIntensity: 0 }); const win = Fn(() => { const p = positionLocal; const wx = smoothstep(0.35, 0.4, fract(p.x.mul(5).add(0.5))).mul(smoothstep(0.65, 0.6, fract(p.x.mul(5).add(0.5)))); const wy = smoothstep(0.3, 0.38, fract(p.y.mul(9))).mul(smoothstep(0.7, 0.62, fract(p.y.mul(9)))); const on = smoothstep(0.2, 0.7, mx_noise_float(vec3(p.x.mul(5).floor(), p.y.mul(9).floor(), p.z.mul(3).floor()).mul(0.73))); return wx.mul(wy).mul(on); })();
  m.emissiveNode = mix(uWorldA, uWorldB, positionLocal.y.add(0.5)).mul(win.mul(2.4)); m.colorNode = vec3(0.012, 0.008, 0.02);
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), m, n);
  for (let i = 0; i < n; i++) { const w = 2 + Math.random() * 4, h = 6 + Math.random() * 22, x = (i / n - 0.5) * 120 + (Math.random() - 0.5) * 3, z = -26 - Math.random() * 18; tmpM.compose(tmpV.set(x, -16 + h / 2, z), tmpQ.identity(), tmpS.set(w, h, w)); mesh.setMatrixAt(i, tmpM); }
  mesh.renderOrder = -10; decor.neon.add(mesh); }
{ const m = new THREE.MeshBasicNodeMaterial(); m.colorNode = Fn(() => { const n = mx_noise_float(positionLocal.mul(0.55).add(vec3(0, 0, time.mul(0.15)))).mul(0.5).add(0.5); return mix(vec3(1.1, 0.3, 0.06), vec3(1.6, 0.9, 0.3), n); })();
  const sun = new THREE.Mesh(new THREE.SphereGeometry(8, 48, 32), m); sun.position.set(30, 16, -70); sun.renderOrder = -10; decor.solar.add(sun);
  const cm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }); cm.colorNode = Fn(() => { const r = length(uv().sub(0.5)).mul(2); return vec3(0.6, 0.22, 0.05).mul(smoothstep(1.0, 0.4, r)); })();
  const cor = new THREE.Mesh(new THREE.PlaneGeometry(36, 36), cm); cor.position.copy(sun.position).add(tmpV.set(0, 0, -1)); cor.renderOrder = -11; decor.solar.add(cor); }

// ---------------------------------------------------------------- state
const G = { screen: 'menu', mode: 'campaign', level: 1, sim: null, diff: save.diff || cfg.difficulty, intro: 0, slow: 1, slowT: 0, pointerX: null, keys: { l: 0, r: 0 }, launchReq: false, autopilot: 0, worldIx: 0, hitstop: 0, bricksVis: new Map(), wellMove: false, t: 0, hint: false };
const juice = () => [0, 0.45, 1, 1.6][Math.max(0, Math.min(3, cfg.shards | 0))] * (settings.reducedMotion ? 0.5 : 1);
const world = () => WORLDS[G.worldIx];
function setWorld(ix) {
  const map = { crystal: 0, neon: 1, solar: 2 }; G.worldIx = cfg.theme !== 'auto' && map[cfg.theme] != null ? map[cfg.theme] : ix;
  const w = world(); uWorldA.value.set(w.a); uWorldB.value.set(w.b); bg.base.value.setHex(w.bg[0]); bg.c1.value.setHex(w.bg[1]); bg.c2.value.setHex(w.bg[2]);
  decor.crystal.visible = G.worldIx === 0; decor.neon.visible = G.worldIx === 1; decor.solar.visible = G.worldIx === 2;
  document.documentElement.style.setProperty('--wa', w.a); document.documentElement.style.setProperty('--wb', w.b);
}
setWorld(0);

// ---------------------------------------------------------------- camera fit (portrait field; fills phone width, desktop height)
const camBase = new THREE.Vector3(); const camLook = new THREE.Vector3(0, -0.4, 0);
function fitCamera() {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  const t = Math.tan((camera.fov * Math.PI) / 360); const port = innerWidth < innerHeight; const hh = port ? 10.9 : 11.9, hw = 6.75; const dist = Math.max(hh / t, hw / (t * camera.aspect));
  const yOff = port ? 0.9 : 0.75; camLook.set(0, -0.4 + yOff, 0); camBase.set(0, camLook.y - dist * 0.16, dist);
  camera.position.copy(camBase); camera.lookAt(camLook);
}
autoResize(renderer, camera, fitCamera);
const ray = new THREE.Raycaster(), plane0 = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), ndc = new THREE.Vector2(), hitP = new THREE.Vector3();
function worldAt(cx, cy) { ndc.set((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); return ray.ray.intersectPlane(plane0, hitP) ? hitP : null; }
function toScreen(x, y, z = 0) { tmpV.set(x, y, z).project(camera); return [(tmpV.x * 0.5 + 0.5) * innerWidth, (-tmpV.y * 0.5 + 0.5) * innerHeight]; }

// ---------------------------------------------------------------- DOM UI
document.body.insertAdjacentHTML('beforeend', `
<div id="hud"><button class="sd-btn sd-icon" id="pauseBtn" aria-label="Pause">❚❚</button>
  <div class="hud-top"><div class="hl"><small id="hWorld">Crystal Caverns</small><b id="hLevel">1-1</b></div><div class="hs"><b id="hScore">0</b><small id="hCombo"></small></div><div class="lives" id="hLives"></div></div>
  <div id="bossBar"><span>PRISM CORE</span><div><i id="bossFill"></i></div></div>
  <div id="powers"></div></div>
<div id="coach"><div class="hand"></div><span>Drag to move · Tap to launch</span></div>
<div id="banner"><small id="bSmall"></small><b id="bBig"></b></div>
<div id="floaters"></div>
<button class="sd-btn" id="wellBtn">🌀 Move the well</button>
<div id="select" class="sd-panel"><div class="sd-card pb-card wide"><h2>Choose a level</h2><div id="worlds"></div><div class="sd-row"><button class="sd-btn" id="selBack">‹ Menu</button></div></div></div>
<div id="card" class="sd-panel"><div class="sd-card pb-card" id="cardBody"></div></div>`);
const floaters = Array.from({ length: 10 }, () => { const d = document.createElement('div'); d.className = 'floater'; $('#floaters').appendChild(d); return { d, t: 1, life: 1 }; });
function floatText(x, y, text, col = '#fff', big = false) { const f = floaters.find((q) => q.t >= q.life) || floaters[0]; const [sx, sy] = toScreen(x, y); f.x = sx; f.y = sy; f.t = 0; f.life = 0.9; f.d.textContent = text; f.d.style.color = col; f.d.style.fontSize = big ? '24px' : '17px'; }
const menu = startMenu({ title: 'Prism Breaker', subtitle: 'Shatter glass and neon across three worlds. Thirty levels, three Prism Cores — or bend light itself in the Gravity Well.',
  options: [{ key: 'mode', label: 'Mode', value: cfg.mode === 'gravity' ? 'gravity' : 'campaign', choices: [{ v: 'campaign', label: '◆ Campaign' }, { v: 'gravity', label: '🌀 Gravity Well' }] },
    { key: 'difficulty', label: 'Difficulty', value: G.diff, choices: [{ v: 'easy', label: 'Easy' }, { v: 'normal', label: 'Normal' }, { v: 'hard', label: 'Hard' }] }],
  startLabel: 'Play', onStart: (v) => { G.diff = v.difficulty; save.diff = v.difficulty; persist(); if (v.mode === 'gravity') startGravity(); else if (save.unlocked === 1 && !save.stars[0]) startLevel(1); else openSelect(); } });
settingsButton();
let cardOpen = false;
function card(html, wire) { $('#cardBody').innerHTML = html; $('#card').classList.add('open'); cardOpen = true; wire?.(); }
function closeCard() { $('#card').classList.remove('open'); cardOpen = false; }
function showHUD(on) { $('#hud').classList.toggle('show', on); }
function banner(small, big, ms = 1600) { $('#bSmall').textContent = small; $('#bBig').textContent = big; const b = $('#banner'); b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); clearTimeout(banner.t); banner.t = setTimeout(() => b.classList.remove('show'), ms); }
$('#pauseBtn').onclick = () => pause();
$('#selBack').onclick = () => { sfx.click(); $('#select').classList.remove('open'); menu.show(); };
$('#wellBtn').onclick = (e) => { e.stopPropagation(); G.wellMove = !G.wellMove; $('#wellBtn').classList.toggle('on', G.wellMove); toast(G.wellMove ? 'Tap anywhere above the paddle to place the well' : 'Well locked'); };
function openSelect() {
  G.screen = 'select'; showHUD(false); clearPlay(); menu.hide(); setWorld(Math.min(2, Math.floor((save.unlocked - 1) / 10)));
  $('#worlds').innerHTML = WORLDS.map((w, wi) => `<div class="world" style="--a:${w.a};--b:${w.b}"><h3>${w.name}</h3><div class="tiles">${LEVELS.slice(wi * 10, wi * 10 + 10).map((lv, j) => { const k = wi * 10 + j + 1, lock = k > save.unlocked; return `<button class="tile${lock ? ' lock' : ''}${lv.boss ? ' boss' : ''}" data-k="${k}" ${lock ? 'disabled' : ''} title="${lv.name}"><b>${lock ? '🔒' : lv.boss ? '◆' : j + 1}</b><i>${'★'.repeat(save.stars[k - 1])}${'☆'.repeat(3 - save.stars[k - 1])}</i></button>`; }).join('')}</div></div>`).join('');
  $('#worlds').querySelectorAll('.tile:not(.lock)').forEach((b) => (b.onclick = () => { sfx.select(); $('#select').classList.remove('open'); startLevel(+b.dataset.k); }));
  $('#select').classList.add('open');
}
function pause() {
  if (G.screen !== 'play' || cardOpen) return; sfx.click(); G.screen = 'paused';
  card(`<h2>Paused</h2><div class="sd-row col"><button class="sd-btn primary" id="pRes">Resume</button><button class="sd-btn" id="pSet">Settings</button>${G.mode === 'gravity' ? '<button class="sd-btn" id="pEnd">End run</button>' : '<button class="sd-btn" id="pRestart">Restart level</button><button class="sd-btn" id="pSel">Level select</button>'}<button class="sd-btn" id="pMenu">Main menu</button></div>`, () => {
    $('#pRes').onclick = () => { closeCard(); G.screen = 'play'; };
    $('#pSet').onclick = () => $('#sd-gear').click();
    if ($('#pRestart')) $('#pRestart').onclick = () => { closeCard(); startLevel(G.level); };
    if ($('#pSel')) $('#pSel').onclick = () => { closeCard(); openSelect(); };
    if ($('#pEnd')) $('#pEnd').onclick = () => { closeCard(); gravityOver(); };
    $('#pMenu').onclick = () => { closeCard(); toMenu(); };
  });
}
function toMenu() { G.screen = 'menu'; showHUD(false); clearPlay(); $('#wellBtn').classList.remove('show'); menu.show(); }

// ---------------------------------------------------------------- flow
function simOpts(extra = {}) { return { difficulty: G.diff, speedMul: cfg.ballSpeed, paddleMul: cfg.paddleWidth, powerRate: cfg.powerRate, seed: (Date.now() & 0xffffff) + 1, ...extra }; }
function clearPlay() { G.sim = null; for (const s of shards) s.on = false; for (const s of sparks) s.on = false; hist.clear(); boss.visible = false; well.visible = false; uWellK.value = 0; $('#bossBar').classList.remove('show'); $('#coach').classList.remove('show'); $('#wellBtn').classList.remove('show'); }
function startLevel(k) {
  closeCard(); clearPlay(); G.mode = 'campaign'; G.level = k; const def = LEVELS[k - 1];
  G.sim = S.createSim(def, simOpts()); setWorld(Math.floor((k - 1) / 10));
  G.intro = 0; G.screen = 'play'; G.slow = 1; showHUD(true); menu.hide();
  const wi = Math.floor((k - 1) / 10) + 1, li = ((k - 1) % 10) + 1;
  $('#hWorld').textContent = world().name; $('#hLevel').textContent = `${wi}-${li} · ${def.name}`;
  banner(`${world().name} · ${wi}-${li}`, def.name); audio.launch();
  if (def.boss) { boss.visible = true; $('#bossBar').classList.add('show'); }
  if (def.tip && TIPS[def.tip]) setTimeout(() => toast(TIPS[def.tip], 4200), 900);
  if (k === 1) { $('#coach').classList.add('show'); G.hint = true; }
  hud(); host('level', { level: k });
}
function startGravity() {
  closeCard(); clearPlay(); G.mode = 'gravity'; G.level = 0; menu.hide();
  G.sim = S.createSim({ layout: [], autoLaunch: 2.5 }, simOpts({ mode: 'gravity', gravity: cfg.gravity, lives: G.diff === 'easy' ? 5 : 3 }));
  setWorld(1); well.visible = true; G.intro = 0; G.screen = 'play'; showHUD(true); $('#wellBtn').classList.add('show');
  $('#hWorld').textContent = 'Gravity Well'; $('#hLevel').textContent = 'Wave 1'; banner('Creative mode', 'Gravity Well');
  setTimeout(() => toast('The black hole bends your ball. Fly through it for a slingshot! Move it with the 🌀 button.', 5000), 800); hud();
}
function levelWon() {
  const sim = G.sim, k = G.level; G.screen = 'won';
  const stars = 3 - Math.min(2, sim.livesLost); const first = save.stars[k - 1] === 0;
  save.stars[k - 1] = Math.max(save.stars[k - 1], stars); save.best[k - 1] = Math.max(save.best[k - 1], sim.score); save.unlocked = Math.max(save.unlocked, Math.min(30, k + 1)); save.fails[k - 1] = 0; persist();
  host('score', { level: k, score: sim.score, stars });
  if (k === 30 && first) { setTimeout(finale, 2200); return; }
  setTimeout(() => {
    const boss = !!LEVELS[k - 1].boss;
    card(`<div class="eyebrow">${world().name} · ${Math.floor((k - 1) / 10) + 1}-${((k - 1) % 10) + 1}</div><h2>${boss ? 'World complete!' : ['', 'Cleared', 'Brilliant', 'Flawless'][stars]}</h2>
      <div class="stars">${[1, 2, 3].map((s) => `<span class="star" data-s="${s}">★</span>`).join('')}</div><p class="score"><b>${sim.score.toLocaleString()}</b><small>Best ${save.best[k - 1].toLocaleString()} · best combo ×${sim.bestCombo}</small></p>
      ${boss && k < 30 ? `<p class="sub">Next: <b>${WORLDS[k / 10].name}</b></p>` : ''}
      <div class="sd-row"><button class="sd-btn primary" id="cNext">${k < 30 ? 'Next level' : 'Finish'}</button><button class="sd-btn" id="cRe">Replay</button><button class="sd-btn" id="cSel">Levels</button></div>`, () => {
      [1, 2, 3].forEach((s) => setTimeout(() => { if (s <= stars) { $(`.star[data-s="${s}"]`)?.classList.add('on'); audio.star(s); } }, 250 + s * 300));
      $('#cNext').onclick = () => { closeCard(); k < 30 ? startLevel(k + 1) : openSelect(); }; $('#cRe').onclick = () => startLevel(k); $('#cSel').onclick = () => { closeCard(); openSelect(); };
    });
  }, 1500);
}
function levelLost() {
  const k = G.level; G.screen = 'lost'; save.fails[k - 1]++; persist(); sfx.lose(); const offer = save.fails[k - 1] >= 2 && G.diff !== 'easy';
  setTimeout(() => card(`<div class="eyebrow">${LEVELS[k - 1].name}</div><h2>Out of light</h2><p class="sub">${S.breakable(G.sim)} bricks left${G.sim.boss ? ` · core at ${Math.round((G.sim.boss.hp / G.sim.boss.maxHp) * 100)}%` : ''}. Hit the ball with the paddle's edge for sharper angles.</p>
    <div class="sd-row"><button class="sd-btn primary" id="cRetry">Retry</button>${offer ? '<button class="sd-btn" id="cEasy">Retry on Easy</button>' : ''}<button class="sd-btn" id="cSel">Levels</button></div>`, () => {
    $('#cRetry').onclick = () => startLevel(k); $('#cSel').onclick = () => { closeCard(); openSelect(); };
    if (offer) $('#cEasy').onclick = () => { G.diff = 'easy'; save.diff = 'easy'; persist(); toast('Easy: slower ball, wider paddle, 5 lives'); startLevel(k); };
  }), 900);
}
function gravityOver() {
  const sim = G.sim; G.screen = 'lost'; const best = Math.max(save.gwBest, sim.score); const nb = sim.score > save.gwBest; save.gwBest = best; save.gwWave = Math.max(save.gwWave, sim.wave); persist();
  card(`<div class="eyebrow">Gravity Well</div><h2>${nb ? 'New best!' : 'Run complete'}</h2><p class="score"><b>${sim.score.toLocaleString()}</b><small>Best ${best.toLocaleString()} · ${sim.brokeCount} bricks · wave ${sim.wave}</small></p>
    <div class="sd-row"><button class="sd-btn primary" id="gAgain">Again</button><button class="sd-btn" id="gMenu">Menu</button></div>`, () => { $('#gAgain').onclick = () => startGravity(); $('#gMenu').onclick = () => { closeCard(); toMenu(); }; });
}
// FABLE: finale cinematic — the three Prism Cores reassemble into a rotating crystal while the camera pulls back.
function finale() {
  save.finale = true; persist(); G.screen = 'finale'; const tot = save.stars.reduce((a, b) => a + b, 0);
  for (let k = 0; k < 6; k++) setTimeout(() => { shardBurst((Math.random() - 0.5) * 8, Math.random() * 10 - 3, ['#38e8ff', '#ff4fd8', '#ffb02e'][k % 3], 60, 9); sfx.win(); }, k * 350);
  setTimeout(() => card(`<div class="eyebrow">All three cores restored</div><h2>The Prism shines again</h2><p class="sub">Thirty levels, three worlds. ★ ${tot} / 90.</p><p class="sub">Try for Flawless stars, or bend light freely in the Gravity Well.</p>
    <div class="sd-row"><button class="sd-btn primary" id="fGW">Gravity Well</button><button class="sd-btn" id="fSel">Levels</button></div>`, () => { $('#fGW').onclick = () => startGravity(); $('#fSel').onclick = () => { closeCard(); openSelect(); }; }), 2600);
}
function hud() {
  const sim = G.sim; if (!sim) return;
  $('#hScore').textContent = sim.score.toLocaleString(); $('#hCombo').textContent = sim.combo >= 3 ? `combo ×${sim.combo}` : '';
  const lv = Math.max(0, sim.lives); const h = $('#hLives'); if (h._n !== lv) { h._n = lv; h.innerHTML = Array.from({ length: Math.min(lv, 7) }, () => '<i></i>').join('') + (lv > 7 ? `<em>+${lv - 7}</em>` : ''); }
  if (G.mode === 'gravity') $('#hLevel').textContent = `Wave ${sim.wave - 4 > 0 ? sim.wave - 4 : 1}`;
  if (sim.boss) $('#bossFill').style.width = `${(sim.boss.hp / sim.boss.maxHp) * 100}%`;
  const pw = $('#powers'); let html = ''; for (const k of ['laser', 'wide', 'slow']) if (sim.fx[k] > 0) html += `<span class="pw" style="--c:${POW[k].c}">${POW[k].l}<i style="width:${(sim.fx[k] / { laser: 10, wide: 15, slow: 12 }[k]) * 100}%"></i></span>`;
  if (sim.fx.shrink > 0) html += `<span class="pw bad">−</span>`; if (pw._h !== html) { pw.innerHTML = html; pw._h = html; }
}

// ---------------------------------------------------------------- input
const dom = renderer.domElement;
addEventListener('pointerdown', (e) => {
  if (G.screen !== 'play' || e.target.closest?.('button, .sd-panel, #menu')) return;
  const p = worldAt(e.clientX, e.clientY);
  if (G.wellMove && G.sim?.well && p && p.y > -5.5) { G.sim.well.x = Math.max(-5, Math.min(5, p.x)); G.sim.well.y = Math.max(-4, Math.min(7, p.y)); G.wellMove = false; $('#wellBtn').classList.remove('on'); audio.sling(); ring(G.sim.well.x, G.sim.well.y, 2.2, '#c08aff'); return; }
  if (p) G.pointerX = p.x; G.launchReq = true; G.drag = true; if (G.hint) { G.hint = false; $('#coach').classList.remove('show'); }
});
addEventListener('pointermove', (e) => { if (G.screen !== 'play' || (e.pointerType !== 'mouse' && !G.drag)) return; const p = worldAt(e.clientX, e.clientY); if (p) G.pointerX = p.x; });
addEventListener('pointerup', () => { G.drag = false; });
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { if (G.screen === 'paused') { $('#pRes')?.click(); } else pause(); return; }
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { G.keys.l = 1; G.pointerX = null; }
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { G.keys.r = 1; G.pointerX = null; }
  if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'Enter') { e.preventDefault(); G.launchReq = true; if (G.hint) { G.hint = false; $('#coach').classList.remove('show'); } }
});
addEventListener('keyup', (e) => { if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') G.keys.l = 0; if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') G.keys.r = 0; });

// ---------------------------------------------------------------- event → juice
function handleEvents(sim) {
  for (const e of sim.events) {
    switch (e.t) {
      case 'break': { const c = rowColor(sim.bricks.find((b) => b.id === e.id) || { type: e.type, row: e.row }).getStyle(); shardBurst(e.x, e.y, c, e.type === 's' ? 16 : 12); sparkBurst(e.x, e.y, c, 6); audio.break(e.combo, e.type); shake(0.04 + Math.min(0.12, e.combo * 0.008)); if (e.combo >= 5) G.hitstop = 0.03; if (e.combo >= 3 && e.combo % 2 === 1) floatText(e.x, e.y, `+${e.pts}`, '#ffffff', e.combo >= 9); break; }
      case 'crack': sparkBurst(e.x, e.y, '#ffffff', 5, 5); audio.crack(); break;
      case 'clank': sparkBurst(e.x, e.y, '#ffd27a', 4, 4); audio.clank(); break;
      case 'paddle': audio.paddle(e.off); G.padSquash = 1; ring(e.x, S.PADDLE_Y + 0.1, 0.9, cfg.colors.accent, 0.3); sparkBurst(e.x, e.y - 0.2, cfg.colors.accent, 4, 4); break;
      case 'wall': audio.wall(); sparkBurst(e.x, e.y, world().a, 2, 3); break;
      case 'explode': ring(e.x, e.y, 2.2, '#ff6fb0', 0.5); audio.explode(); shake(0.3); G.hitstop = 0.05; sparkBurst(e.x, e.y, '#ffd0f0', 14, 9); break;
      case 'powerSpawn': sparkBurst(e.x, e.y, POW[e.kind].c, 8, 5); break;
      case 'power': audio.power(e.kind); ring(e.x, S.PADDLE_Y, 1.8, POW[e.kind].c, 0.5); banner('', { multi: 'Multi-ball!', laser: 'Lasers!', wide: 'Wide paddle!', slow: 'Slow-mo ball', life: '+1 life' }[e.kind], 900); break;
      case 'laser': audio.laser(); break;
      case 'laserHit': sparkBurst(e.x, e.y, '#ff6080', 3, 4); break;
      case 'lost': sparkBurst(e.x, S.FIELD.bottom, '#ff4060', 16, 6); break;
      case 'lifeLost': audio.lost(); shake(0.35); flash('#ff2050', 200); if (e.lives > 0) toast(e.lives === 1 ? 'Last ball!' : `${e.lives} balls left`); break;
      case 'gameOver': G.mode === 'gravity' ? setTimeout(gravityOver, 700) : levelLost(); break;
      case 'launch': audio.launch(); break;
      case 'win': G.slow = 0.22; G.slowT = 0.9; audio.clear(); flash('#ffffff', 160); banner('', 'Clear!', 1300); for (const b of sim.balls) sparkBurst(b.x, b.y, cfg.colors.accent, 20, 8); levelWon(); break;
      case 'bossHit': audio.boss(); shake(0.12); sparkBurst(e.x, e.y - 0.6, world().a, 10, 7); shardBurst(e.x, e.y, world().a, 4, 5); if (e.hp <= e.maxHp * 0.25 && !G.bossLow) { G.bossLow = 1; toast('The core is cracking!'); } break;
      case 'bossDown': audio.bossDown(); shake(0.6); G.slow = 0.15; G.slowT = 1.4; flash('#ffffff', 300); for (const c of ['#ff4f6a', '#ffb02e', '#ffe94a', '#5cff9a', '#5ab8ff', '#b46aff']) shardBurst(e.x, e.y, c, 30, 11); ring(e.x, e.y, 6, '#ffffff', 0.8); boss.visible = false; break;
      case 'orbFire': audio.orb(); break;
      case 'orbHit': audio.zap(); shake(0.2); toast('Paddle shrunk — dodge the orbs!'); break;
      case 'orbPop': sparkBurst(e.x, e.y, '#ff80ff', 8, 5); break;
      case 'shield': toast('Core shields up!'); audio.boss(); break;
      case 'slingshot': audio.sling(); ring(e.x, e.y, 2.6, '#c08aff', 0.6); floatText(e.x, e.y + 1, 'Slingshot! +250', '#e0c0ff', true); shake(0.15); break;
      case 'wave': banner('Gravity Well', `Wave ${Math.max(1, e.n - 4)}`, 1100); break;
      case 'sink': shardBurst(e.x, e.y, '#8080ff', 6, 3); break;
    }
  }
  sim.events.length = 0;
}

// ---------------------------------------------------------------- per-frame visuals
const introDelay = (b) => b.row * 0.055 + Math.abs(b.col - 5) * 0.03;
function writeBricks(dt) {
  const sim = G.sim; for (const c of [glass, steel, gold, cores]) c.n = 0;
  if (sim) for (const b of sim.bricks) {
    b.flash = Math.max(0, (b.flash || 0) - dt * 5);
    if (!b.alive) continue;
    const cls = b.type === 's' ? steel : b.type === 'u' ? gold : glass;
    let y = b.y, sc = 1; if (G.intro < 2 && G.mode === 'campaign') { const k = Math.max(0, Math.min(1, (G.intro - introDelay(b)) / 0.5)); y += (1 - ease.outBack(k)) * 9; sc = k > 0 ? 1 : 0; }
    if (b.spawnT != null && b.spawnT < 1) { b.spawnT += dt * 2.5; sc *= ease.outBack(Math.min(1, b.spawnT)); }
    const pulse = 1 + b.flash * 0.12;
    tmpM.compose(tmpV.set(b.x, y, 0), tmpQ.identity(), tmpS.set(b.w * pulse * sc, b.h * pulse * sc, 0.5 * sc)); cls.mesh.setMatrixAt(cls.n, tmpM);
    const col = rowColor(b); cls.aCol.setXYZ(cls.n, col.r, col.g, col.b); const hpF = Number.isFinite(b.maxHp) ? b.hp / b.maxHp : 1; cls.aFx.setXY(cls.n, b.flash, hpF); cls.n++;
    if (cls === glass) { tmpM.compose(tmpV.set(b.x, y, 0), tmpQ.identity(), tmpS.set(b.w * 0.62 * sc, b.h * (b.type === 'n' ? 0.26 : 0.16) * sc, 0.2 * sc)); cores.mesh.setMatrixAt(cores.n, tmpM); cores.aCol.setXYZ(cores.n, col.r, col.g, col.b); cores.aFx.setXY(cores.n, b.flash, hpF * (b.type === 'x' ? 1.5 : 1)); cores.n++; }
  }
  for (const c of [glass, steel, gold, cores]) { c.mesh.count = c.n; c.mesh.instanceMatrix.needsUpdate = true; c.aCol.needsUpdate = true; c.aFx.needsUpdate = true; }
}
function writeFx(dt) {
  let n = 0;
  for (const s of shards) { if (!s.on) continue; s.t += dt; if (s.t >= s.life) { s.on = false; continue; } s.vy -= 14 * dt; s.vx *= 1 - dt * 0.6; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt; s.rx += s.wx * dt; s.ry += s.wy * dt;
    const k = 1 - Math.pow(s.t / s.life, 3); tmpQ.setFromEuler(tmpE.set(s.rx, s.ry, 0)); tmpM.compose(tmpV.set(s.x, s.y, s.z), tmpQ, tmpS.setScalar(s.s * k)); shardMesh.setMatrixAt(n, tmpM); shardCol.setXYZ(n, s.r, s.g, s.b); n++; }
  shardMesh.count = n; shardMesh.instanceMatrix.needsUpdate = true; shardCol.needsUpdate = true;
  n = 0; for (const s of sparks) { if (!s.on) continue; s.t += dt; if (s.t >= s.life) { s.on = false; continue; } s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= 1 - dt * 3; s.vy *= 1 - dt * 3; const k = 1 - s.t / s.life; tmpM.compose(tmpV.set(s.x, s.y, s.z), tmpQ.identity(), tmpS.setScalar(k * 1.4)); sparkMesh.setMatrixAt(n, tmpM); sparkCol.setXYZ(n, s.r, s.g, s.b); n++; }
  sparkMesh.count = n; sparkMesh.instanceMatrix.needsUpdate = true; sparkCol.needsUpdate = true;
  for (const R of rings) { if (!R.mesh.visible) continue; R.t += dt; const q = R.t / R.life; if (q >= 1) { R.mesh.visible = false; continue; } R.mesh.scale.setScalar(0.2 + R.r * ease.outCubic(q)); R.m.opacity = 1 - q; }
  for (const f of floaters) { if (f.t >= f.life) { f.d.style.opacity = 0; continue; } f.t += dt; const q = f.t / f.life; f.d.style.opacity = q > 0.6 ? (1 - q) / 0.4 : 1; f.d.style.transform = `translate(${f.x}px, ${f.y - q * 50}px) translate(-50%,-50%) scale(${q < 0.15 ? 0.6 + q * 2.6 : 1})`; }
}
function writeActors(dt, t) {
  const sim = G.sim;
  // paddle
  const pw = sim ? sim.paddle.w : 2.4; G.padSquash = Math.max(0, (G.padSquash || 0) - dt * 6);
  paddle.visible = !!sim; if (sim) paddle.position.set(sim.paddle.x, sim.paddle.y, 0);
  padBody.scale.set(pw, 1 - G.padSquash * 0.25, 1); padStrip.scale.set(pw * 0.86, 1, 1); padEnds[0].position.set(-pw / 2 + 0.05, 0.02, 0.18); padEnds[1].position.set(pw / 2 - 0.05, 0.02, 0.18);
  turrets.forEach((m, i) => { m.visible = !!(sim && sim.fx.laser > 0); m.position.x = (i ? 1 : -1) * (pw / 2 - 0.2); });
  // balls, trails, lights
  let tn = 0; const alive = new Set();
  ballMeshes.forEach((m, i) => { const b = sim?.balls[i]; m.visible = !!b; if (!b) return; m.position.set(b.x, b.y, 0); alive.add(b.id);
    if (cfg.trail && !b.stuck) { let h = hist.get(b.id); if (!h) hist.set(b.id, (h = [])); h.unshift(b.x, b.y); if (h.length > TR * 2) h.length = TR * 2; for (let k = 1; k < h.length / 2; k++) { const f = 1 - k / TR; tmpM.compose(tmpV.set(h[k * 2], h[k * 2 + 1], -0.02), tmpQ.identity(), tmpS.setScalar(0.25 + f * 0.75)); trailMesh.setMatrixAt(tn, tmpM); trailA.setX(tn, f * f * 0.7); tn++; } } });
  for (const id of hist.keys()) if (!alive.has(id)) hist.delete(id);
  trailMesh.count = tn; trailMesh.instanceMatrix.needsUpdate = true; trailA.needsUpdate = true;
  ballLights.forEach((l, i) => { const b = sim?.balls[i]; l.intensity = b ? 14 : 0; if (b) { l.position.set(b.x, b.y, 1.2); l.color.set(cfg.colors.accent); } });
  // lasers / orbs / powerups
  let n = 0; if (sim) for (const L of sim.lasers) { tmpM.compose(tmpV.set(L.x, L.y, 0), tmpQ.identity(), tmpS.setScalar(1)); laserMesh.setMatrixAt(n++, tmpM); } laserMesh.count = n; laserMesh.instanceMatrix.needsUpdate = true;
  n = 0; if (sim) for (const o of sim.orbs) { tmpM.compose(tmpV.set(o.x, o.y, 0), tmpQ.setFromEuler(tmpE.set(t * 3, t * 2, 0)), tmpS.setScalar(1)); orbMesh.setMatrixAt(n++, tmpM); } orbMesh.count = n; orbMesh.instanceMatrix.needsUpdate = true;
  powPool.forEach((q, i) => { const p = sim?.powerups[i]; q.g.visible = !!p; if (!p) return; q.g.position.set(p.x, p.y, 0.2); q.cap.rotation.x = p.spin; if (q.kind !== p.kind) { q.kind = p.kind; q.cap.material = powMats[p.kind]; q.sp.material = powLabels[p.kind]; } });
  // boss
  if (sim?.boss && sim.boss.hp > 0) { const B = sim.boss; boss.visible = true; let y = B.y; if (G.intro < 1.2) y += (1 - ease.outCubic(Math.min(1, G.intro / 1.2))) * 8; boss.position.set(B.x, y, 0); uBossFlash.value = B.flash; uBossHp.value = B.hp / B.maxHp; bossCore.rotation.set(t * 0.8, t * 1.1, 0); bossCore.scale.setScalar(0.8 + 0.2 * Math.sin(t * 4) + B.flash * 0.2); bossRings[0].rotation.set(t * 1.2, 0.4, 0); bossRings[1].rotation.set(0.6, t * -0.9, 0); }
  // well
  if (sim?.well) { well.position.set(sim.well.x, sim.well.y, 0); disk.rotation.z = t * 0.4; uWell.value.set(sim.well.x, sim.well.y); uWellK.value += (sim.well.strength * 0.5 - uWellK.value) * Math.min(1, dt * 3); halo.scale.setScalar(1 + Math.sin(t * 5) * 0.05); }
  // decor drift
  if (decor.crystal.visible) { const m = decor.crystal.userData.mesh; m.userData.items.forEach((it, i) => { tmpQ.setFromEuler(tmpE.set(it.r + t * it.w, it.r * 0.5 + t * it.w * 0.7, 0)); tmpM.compose(tmpV.set(it.x, it.y + Math.sin(t * 0.2 + i) * 0.4, it.z), tmpQ, tmpS.set(it.s, it.s * it.sy, it.s)); m.setMatrixAt(i, tmpM); }); m.instanceMatrix.needsUpdate = true; }
}

// ---------------------------------------------------------------- loop
let hudT = 0;
function stepGame(dt, t) {
  G.t = t; updateTweens(dt);
  const sim = G.sim;
  if (G.slowT > 0) { G.slowT -= dt; if (G.slowT <= 0) G.slow = 1; }
  let sdt = dt * G.slow; if (G.hitstop > 0) { G.hitstop -= dt; sdt *= 0.1; }
  if (sim && G.screen === 'play') {
    G.intro += dt;
    if (G.intro > (G.mode === 'campaign' ? 1.3 : 0.2)) {
      const input = {};
      if (G.autopilot > 0) { G.autopilot -= dt; Object.assign(input, S.autopilot(sim)); }
      else { if (G.pointerX != null) input.targetX = G.pointerX; const ax = G.keys.r - G.keys.l; if (ax) input.axis = ax; if (G.launchReq) input.launch = true; }
      G.launchReq = false;
      const reps = Math.max(1, G.ff | 0); for (let r = 0; r < reps && G.sim === sim && !sim.won && !sim.over; r++) { if (r && G.autopilot > 0) Object.assign(input, S.autopilot(sim)); S.step(sim, reps > 1 ? 1 / 60 : sdt, input); handleEvents(sim); }
    }
  } else if (sim && (G.screen === 'won' || G.screen === 'finale')) { for (const b of sim.balls) { b.x += b.vx * sdt * 0.3; b.y += b.vy * sdt * 0.3; } }
  writeBricks(dt); writeFx(sdt); writeActors(dt, t);
  // camera: gentle parallax toward the paddle + shake
  camera.position.copy(camBase); if (sim && !settings.reducedMotion) camera.position.x += sim.paddle.x * 0.05; camera.lookAt(camLook); applyShake(camera, dt);
  if ((hudT += dt) > 0.1) { hudT = 0; hud(); }
  P.counts.bricks = sim ? sim.bricks.filter((b) => b.alive).length : 0; P.counts.shards = shardMesh.count; P.counts.sparks = sparkMesh.count; P.counts.balls = sim ? sim.balls.length : 0;
}
startLoop(renderer, stepGame, post.render);

// ---------------------------------------------------------------- remix (live)
function applyConfig(c) {
  const prev = cfg; cfg = c; uAccent.value.set(c.colors?.accent || DEFAULTS.colors.accent);
  if (post.bloomNode) post.bloomNode.strength.value = 0.85 * (c.bloom ?? 1);
  const sim = G.sim; if (sim) {
    const d = { easy: 7.6, normal: 9, hard: 10.6 }[G.diff] || 9; sim.baseSpeed = d * c.ballSpeed;
    const pw = { easy: 1.2, normal: 1, hard: 0.88 }[G.diff] || 1; sim.paddle.baseW = 2.4 * pw * c.paddleWidth; sim.powerRate = c.powerRate; if (sim.well) sim.well.strength = c.gravity;
  }
  if (c.theme !== prev.theme) setWorld(G.mode === 'gravity' ? 1 : Math.floor((Math.max(1, G.level) - 1) / 10));
  if (c.difficulty !== prev.difficulty) { G.diff = c.difficulty; menu.values.difficulty = c.difficulty; document.querySelectorAll('#menu .sd-row[data-key="difficulty"] .sd-btn').forEach((b) => b.classList.toggle('on', b.dataset.v === c.difficulty)); }
  if (c.mode !== prev.mode) { menu.values.mode = c.mode; document.querySelectorAll('#menu .sd-row[data-key="mode"] .sd-btn').forEach((b) => b.classList.toggle('on', b.dataset.v === c.mode)); }
}
applyConfig(cfg);

// ---------------------------------------------------------------- hooks
P.dataReady = true; P.dbg = { renderer, glass, steel, gold, cores, scene, post, grid, THREE };
P.game = {
  state: () => { const s = G.sim; return { screen: G.screen, mode: G.mode, level: G.level, score: s?.score, lives: s?.lives, bricks: s ? S.breakable(s) : 0, balls: s?.balls.length, boss: s?.boss ? s.boss.hp : null, won: s?.won, over: s?.over, unlocked: save.unlocked, stars: save.stars.reduce((a, b) => a + b, 0) }; },
  start: (k = 1, skip = false) => { menu.hide(); $('#select').classList.remove('open'); startLevel(k); if (skip) G.intro = 5; },
  gravity: () => { menu.hide(); startGravity(); },
  select: () => { menu.hide(); openSelect(); },
  autoplay: (seconds = 10, ff = 1) => { G.autopilot = seconds; G.ff = ff; return seconds; },
  ff: (n) => (G.ff = n),
  win: () => { const s = G.sim; for (const b of s.bricks) if (!S.TYPES[b.type].solid) { b.alive = false; s.events.push({ t: 'break', id: b.id, x: b.x, y: b.y, type: b.type, combo: 1, row: b.row, pts: 0 }); } if (s.boss && s.boss.hp > 0) { s.boss.hp = 0; s.events.push({ t: 'bossDown', x: s.boss.x, y: s.boss.y }); } },
  lose: () => { const s = G.sim; s.lives = 1; s.balls.forEach((b) => { b.stuck = false; b.y = -20; }); },
  power: (kind) => { const s = G.sim; s.powerups.push({ id: 9999, kind, x: s.paddle.x, y: s.paddle.y + 0.2, vy: -1, spin: 0 }); },
  burst: () => { for (let k = 0; k < 6; k++) shardBurst((Math.random() - 0.5) * 8, 4 + Math.random() * 3, world().a, 30, 8); },
  pause, closeCard, unlockAll: () => { save.unlocked = 30; persist(); },
};
if (Q.has('autostart')) { menu.hide(); startLevel(+Q.get('autostart') || 1); }
