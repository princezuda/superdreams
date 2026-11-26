// Pebble Peaks — 3D collectathon platformer. Fixed 120 Hz simulation (physics.js, node-tested) + follow camera with
// wall avoidance, procedural mascot (mascot.js), merged/instanced worlds (build.js), boss state machine (boss.js).
import { THREE, createRenderer, createPipeline, autoResize, probe, startLoop, settings, store, sfx, startMenu, settingsButton, initUI, toast, loadDream, host, Q, tween, updateTweens, ease, shake, applyShake, flash } from '/shared/sd-kit.js';
import * as PH from './physics.js';
import { LEVELS, ORDER, NAMES, totalShards } from './levels.js';
import * as BS from './boss.js';
import { buildMascot, animateMascot, squashTo, tintMascot } from './mascot.js';
import { buildLevel, makeSky, THEMES, shardGeometry, makeRelic, makeCheckpoint, makeGoal, makePortal, signTexture, makeEnemy, makeBoss, makeJet, textures } from './build.js';
import { createFX } from './fx.js';
import { S } from './sfx.js';
import { createInput } from './input.js';

const $ = (s) => document.querySelector(s);
const DEFAULTS = { difficulty: 'normal', colors: { body: '#b3a9c9', moss: '#6fcf4f', shard: '#ffcf4a' }, jump: 1, speed: 1, gravity: 1, camDist: 9.5, doubleJump: true, timer: true, shadows: true, assist: false };
let cfg = await loadDream(DEFAULTS, (c) => { cfg = c; applyConfig(); });
initUI({ grain: false });
const bar = (k) => { const b = $('#loadBar'); if (b) b.style.width = Math.round(k * 100) + '%'; };
bar(0.15);

// ---------------------------------------------------------------- save
const SKEY = 'pebble-peaks-v1';
const blankLv = () => ({ done: false, best: null, relics: [0, 0, 0], shardsBest: 0 });
const save = Object.assign({ levels: Object.fromEntries(ORDER.map((id) => [id, blankLv()])), run: null, diff: null, golden: false, seen: {} }, store.get(SKEY) || {});
for (const id of ORDER) save.levels[id] = Object.assign(blankLv(), save.levels[id] || {});
const persist = () => store.set(SKEY, save);
const relicTotal = () => ORDER.reduce((n, id) => n + save.levels[id].relics.reduce((a, b) => a + b, 0), 0);
const unlocked = (id) => { const i = ORDER.indexOf(id); return i <= 0 || save.levels[ORDER[i - 1]].done; };

// ---------------------------------------------------------------- renderer + scene
const renderer = await createRenderer({ toneMapping: 'neutral', exposure: 1.0, shadows: true });
bar(0.35);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 600);
const post = createPipeline(renderer, scene, camera, { bloom: { strength: 0.42, radius: 0.5, threshold: 0.86 } });
autoResize(renderer, camera, () => { camera.fov = innerWidth < innerHeight ? 64 : 52; camera.updateProjectionMatrix(); });
const P = probe(renderer, { dataReady: false });
const skyU = makeSky(scene);
const hemi = new THREE.HemisphereLight(0xffffff, 0x445522, 1); const key = new THREE.DirectionalLight(0xffffff, 2.5); const rim = new THREE.DirectionalLight(0xaaccff, 0.9); const amb = new THREE.AmbientLight(0xffffff, 0.15);
key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.radius = 3; key.shadow.bias = -0.0005; key.shadow.normalBias = 0.03;
Object.assign(key.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 90 });
scene.add(hemi, key, key.target, rim, amb);
scene.fog = new THREE.Fog(0xcfe8ff, 45, 175);

const input = createInput();
const fx = createFX(scene);
const R = buildMascot({ body: cfg.colors.body, moss: cfg.colors.moss, golden: save.golden && save.useGolden !== false });
scene.add(R.root);
const blob = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), new THREE.MeshBasicNodeMaterial({ map: textures().blob, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
blob.rotation.x = -Math.PI / 2; blob.renderOrder = 2; scene.add(blob);
bar(0.5);

// ---------------------------------------------------------------- tuning (remix applies here)
let T = { ...PH.TUNE };
function applyConfig() {
  const g = cfg.gravity || 1, j = cfg.jump || 1, sp = cfg.speed || 1;
  T = { ...PH.TUNE, g: PH.TUNE.g * g, jumpV: PH.TUNE.jumpV * Math.sqrt(g) * j, dblV: PH.TUNE.dblV * Math.sqrt(g) * j, longV: PH.TUNE.longV * Math.sqrt(g) * j, poundJumpV: PH.TUNE.poundJumpV * Math.sqrt(g) * j, bopV: PH.TUNE.bopV * Math.sqrt(g), bopHoldV: PH.TUNE.bopHoldV * Math.sqrt(g),
    run: PH.TUNE.run * sp, accel: PH.TUNE.accel * sp, longH: PH.TUNE.longH * sp, rollV: PH.TUNE.rollV * sp, mantle: cfg.assist ? 0.95 : PH.TUNE.mantle, coyote: cfg.assist ? 0.16 : PH.TUNE.coyote, buffer: cfg.assist ? 0.18 : PH.TUNE.buffer };
  if (G.p) G.p.hasDouble = cfg.doubleJump !== false;
  tintMascot(R, { body: cfg.colors.body, moss: cfg.colors.moss, golden: save.golden && save.useGolden !== false });
  document.documentElement.style.setProperty('--accent', cfg.colors.shard);
  if (G.shardMesh) G.shardMat.color.set(cfg.colors.shard); if (G.shardMat) G.shardMat.emissive.set(cfg.colors.shard);
  key.castShadow = cfg.shadows !== false && settings.quality !== 'low';
  $('#hTime').style.display = cfg.timer === false ? 'none' : '';
}
const DIFF = { easy: { hp: 5, fallCost: 0, enemy: 0.75 }, normal: { hp: 3, fallCost: 1, enemy: 1 }, hard: { hp: 2, fallCost: 1, enemy: 1.3 } };

// ---------------------------------------------------------------- game state
const G = { screen: 'menu', id: null, L: null, W: null, V: null, p: null, t: 0, acc: 0, time: 0, hp: 3, diff: save.diff || cfg.difficulty, got: new Set(), lootGot: 0, relics: [0, 0, 0], cp: -1, broken: new Set(),
  shards: [], relicsE: [], cps: [], enemies: [], crumbles: [], shrooms: [], jets: [], portals: [], goal: null, boss: null, bossV: null, bossSolid: null, rings: [], emberV: [],
  combo: 0, comboT: 0, hitstop: 0, dying: 0, flip: 0, stepT: 0, hintT: 0, hintsShown: new Set(), clearT: 0, banner: null, portalCd: 0, lastSafe: null, entities: [] };
const cam = { yaw: 0, pitch: 0.36, dist: 9.5, cur: 9.5, fx: 0, fy: 0, fz: 0, groundY: 0, manualT: 9, intro: 0, free: null, lookY: 1.1 };
applyConfig();

// ---------------------------------------------------------------- level load / unload
function disposeTree(o) { o.traverse((m) => { if (m.geometry) m.geometry.dispose(); if (m.material) { const mats = Array.isArray(m.material) ? m.material : [m.material]; mats.forEach((x) => { if (x.map && x.map !== textures().blob && x.map !== textures().glow && x.map !== textures().crack) x.map.dispose?.(); x.dispose(); }); } }); }
function unload() {
  if (G.V) { scene.remove(G.V.group); disposeTree(G.V.group); }
  for (const e of G.entities) { scene.remove(e); disposeTree(e); }
  G.entities = []; G.V = null; fx.clear(); $('#bossBar').classList.remove('show');
}
function addE(o) { scene.add(o); G.entities.push(o); return o; }

function loadLevel(id, { resume = null } = {}) {
  unload();
  const L = LEVELS[id]; G.id = id; G.L = L; const pal = THEMES[L.theme];
  G.W = PH.worldFromLevel(L); G.V = buildLevel(L, scene);
  // trees are solid trunks (no camera block)
  for (const d of L.decor) if (d.type === 'tree') PH.addSolid(G.W, { kind: 'cyl', x: d.x, z: d.z, r: 0.3 * d.s, top: d.y + 1.6 * d.s, h: 1.6 * d.s, camBlock: false, decor: true });
  // look
  skyU.top.value.set(pal.sky[0]); skyU.hor.value.set(pal.sky[1]); skyU.sun.value.set(pal.sky[2]); skyU.sunDir.value.set(...pal.sunDir).normalize(); skyU.clouds.value = pal.cloudsAmt; skyU.stars.value = pal.stars;
  scene.fog.color.set(pal.fog[0]); scene.fog.near = pal.fog[1]; scene.fog.far = pal.fog[2];
  hemi.color.set(pal.hemi[0]); hemi.groundColor.set(pal.hemi[1]); hemi.intensity = pal.hemi[2]; key.color.set(pal.key[0]); key.intensity = pal.key[1]; rim.color.set(pal.rim[0]); rim.intensity = pal.rim[1]; amb.intensity = pal.amb;
  renderer.toneMappingExposure = pal.exposure; document.body.style.background = pal.fog[0];
  // shards (one instanced mesh, room for loot)
  const lootN = L.solids.reduce((n, s) => n + (s.loot?.shards || 0), 0);
  G.shardMat = new THREE.MeshStandardNodeMaterial({ color: cfg.colors.shard, emissive: new THREE.Color(cfg.colors.shard), emissiveIntensity: 0.9, roughness: 0.2, metalness: 0.1, flatShading: true });
  if (id === 'caves') { G.shardMat.color.set('#7ff6ff'); G.shardMat.emissive.set('#3fe8ff'); }
  G.shardMesh = addE(new THREE.InstancedMesh(shardGeometry(), G.shardMat, Math.max(1, L.shards.length + lootN))); G.shardMesh.frustumCulled = false; G.shardMesh.castShadow = true;
  G.shards = L.shards.map(([x, y, z], i) => ({ x, y, z, i, got: false, loose: false, ph: i * 0.7 }));
  for (let k = 0; k < lootN; k++) G.shards.push({ x: 0, y: -999, z: 0, i: -1, got: true, loose: true, ph: k });
  // relics
  G.relicsE = L.relics.map(([x, y, z], i) => { const m = addE(makeRelic()); m.position.set(x, y, z); const hidden = L.solids.some((s) => s.loot?.relic === i); const had = save.levels[id]?.relics[i]; m.visible = !hidden; if (had) m.children.forEach((c) => c.material && (c.material.opacity = 0.35, c.material.transparent = true)); return { x, y, z, i, m, got: false, hidden, had: !!had }; });
  // checkpoints
  G.cps = L.checkpoints.map(([x, y, z], i) => { const c = makeCheckpoint(pal); c.g.position.set(x, y, z); addE(c.g); PH.addSolid(G.W, { kind: 'cyl', x, z, r: 0.45, top: y + 1.3, h: 1.3, camBlock: false, decor: true }); return { x, y, z, i, ...c, on: false }; });
  // goal
  G.goal = null; if (L.goal) { const g = makeGoal(); g.g.position.set(...L.goal); addE(g.g); G.goal = { ...g, x: L.goal[0], y: L.goal[1], z: L.goal[2], hidden: !!L.goalHidden }; g.g.visible = !L.goalHidden; }
  // enemies
  G.enemies = L.enemies.map((d, i) => { const v = makeEnemy(d.type, pal); addE(v.g); const home = d.a ? [...d.a] : [d.x, d.y, d.z];
    return { d, v, type: d.type, i, x: home[0], y: home[1], z: home[2], home, alive: true, t: Math.random() * 3, dir: 1, u: Math.random(), state: 'walk', st: 0, yaw: 0, respawn: 0, dead: 0, hopY: 0, vy: 0 }; });
  // crumbles / shrooms / breakables
  G.crumbles = G.W.solids.filter((s) => s.crumble).map((s) => ({ s, mesh: G.V.solidMeshes.get(s.idx), st: 'idle', t: 0, vy: 0 }));
  G.shrooms = G.W.solids.filter((s) => s.bounce).map((s) => ({ s, mesh: G.V.solidMeshes.get(s.idx) }));
  G.jets = L.hazards.filter((h) => h.t === 'jet').map((h) => { const j = makeJet(); j.g.position.set(h.x, h.y, h.z); addE(j.g); return { h, ...j, on: false, was: false }; });
  // hub portals
  G.portals = (L.portals || []).map((pd, i) => { const lv = save.levels[pd.id]; const locked = !unlocked(pd.id); const col = ['#7fe36a', '#7a6aff', '#ff9ec7', '#ff7a2a'][i];
    const pt = makePortal(col, locked); pt.g.position.set(pd.x, pd.y + 0.3, pd.z); pt.g.rotation.y = pd.yaw; addE(pt.g);
    const best = lv.best ? fmtTime(lv.best) : '—';
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), new THREE.MeshBasicNodeMaterial({ map: signTexture([NAMES[pd.id], locked ? '🔒 locked' : `Fossils ${lv.relics.reduce((a, b) => a + b, 0)}/3`, locked ? `finish ${NAMES[ORDER[i - 1]] || ''}` : `Best ${best}`], col), transparent: true, depthWrite: false }));
    sign.position.set(0, 4.55, 0); pt.g.add(sign); PH.addSolid(G.W, { kind: 'cyl', x: pd.x + Math.sin(pd.yaw + Math.PI / 2) * 1.25, z: pd.z + Math.cos(pd.yaw + Math.PI / 2) * 1.25, r: 0.32, top: 3.4, h: 3.4, camBlock: false, decor: true }); PH.addSolid(G.W, { kind: 'cyl', x: pd.x - Math.sin(pd.yaw + Math.PI / 2) * 1.25, z: pd.z - Math.cos(pd.yaw + Math.PI / 2) * 1.25, r: 0.32, top: 3.4, h: 3.4, camBlock: false, decor: true });
    return { ...pd, ...pt, locked, sign }; });
  // boss
  G.boss = null; G.bossV = null; G.bossSolid = null; G.rings = []; G.emberV = [];
  if (L.boss) {
    G.boss = BS.createBoss({ cx: L.boss.x, cy: L.boss.y, cz: L.boss.z, R: L.boss.r, difficulty: G.diff });
    G.bossV = makeBoss(); G.bossV.g.position.set(L.boss.x, L.boss.y, L.boss.z); addE(G.bossV.g);
    G.bossSolid = PH.addSolid(G.W, { kind: 'cyl', x: L.boss.x, z: L.boss.z, r: BS.BOSS.r, top: L.boss.y + BS.BOSS.h, h: BS.BOSS.h, camBlock: false, boss: true });
    const rm = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(3, 1.1, 0.2), transparent: true, opacity: 0.9, depthWrite: false });
    for (let i = 0; i < 5; i++) { const r = addE(new THREE.Mesh(new THREE.TorusGeometry(1, 0.16, 6, 48), rm)); r.rotation.x = Math.PI / 2; r.visible = false; G.rings.push(r); }
    const em = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(3.2, 1.2, 0.2) }), wm = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(2.2, 0.3, 0.1), transparent: true, opacity: 0.5, depthWrite: false });
    for (let i = 0; i < 6; i++) { const b = addE(new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), em)); const w = addE(new THREE.Mesh(new THREE.RingGeometry(0.85, 1.2, 28), wm)); w.rotation.x = -Math.PI / 2; b.visible = w.visible = false; G.emberV.push({ b, w }); }
  }
  // state
  G.got = new Set(); G.lootGot = 0; G.relics = [0, 0, 0]; G.cp = -1; G.broken = new Set(); G.time = 0; G.hp = DIFF[G.diff].hp; G.dying = 0; G.clearT = 0; G.combo = 0; G.hintsShown = new Set(); G.t = 0; G.acc = 0;
  let sp = L.spawn, yaw = L.yaw;
  if (resume) {
    for (const i of resume.shards || []) G.got.add(i); G.lootGot = resume.loot || 0; G.time = resume.time || 0; G.cp = resume.cp ?? -1; G.relics = [...(resume.relics || [0, 0, 0])];
    for (const bi of resume.broken || []) breakSolid(G.W.solids[bi], true);
    for (let k = 0; k <= G.cp; k++) activateCp(k, true);
    G.relics.forEach((v, i) => { if (v) { G.relicsE[i].got = true; G.relicsE[i].m.visible = false; } });
    if (G.cp >= 0) { const c = L.checkpoints[G.cp]; sp = [c[0], c[1], c[2] + 1.2]; }
  }
  G.shards.forEach((s) => { if (G.got.has(s.i)) s.got = true; });
  G.p = PH.createPlayer(sp[0], sp[1], sp[2], yaw); G.p.hasDouble = cfg.doubleJump !== false; G.lastSafe = [...sp];
  cam.yaw = yaw + Math.PI; cam.fx = sp[0]; cam.fy = sp[1]; cam.fz = sp[2]; cam.groundY = sp[1]; cam.cur = cam.dist; cam.manualT = 9; cam.intro = id === 'hub' ? 0.6 : 1.4; cam.free = null;
  renderHUD(); S.ambience(L.theme);
  P.counts = { level: id, shards: L.shards.length, relics: 3, enemies: G.enemies.length, solids: G.W.solids.length };
}
function respawnAt() {
  const c = G.cp >= 0 ? G.L.checkpoints[G.cp] : G.L.spawn; const p = G.p;
  Object.assign(p, PH.createPlayer(c[0], c[1] + 0.02, c[2] + (G.cp >= 0 ? 1.2 : 0), G.L.yaw)); p.hasDouble = cfg.doubleJump !== false; p.inv = 1.0;
  cam.yaw = G.L.yaw + Math.PI; cam.fx = p.x; cam.fy = p.y; cam.fz = p.z; cam.groundY = p.y; cam.cur = cam.dist;
  for (const cr of G.crumbles) resetCrumble(cr);
  if (G.boss && G.boss.state !== 'dead') { const B = G.boss; B.rings.length = 0; B.embers.length = 0; if (B.state !== 'sleep') { B.state = 'idle'; B.t = 0; B.x = B.cx; B.z = B.cz; B.y = B.cy; B.height = BS.BOSS.h; } }
  squashTo(R, 1.4); fx.sparkle(p.x, p.y + 0.6, p.z, { n: 16, color: '#ffffff', speed: 3 });
}

// ---------------------------------------------------------------- entities
function fmtTime(s) { const m = Math.floor(s / 60), r = s - m * 60; return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`; }
function shardCount() { return G.got.size + G.lootGot; }
function collectShard(s) {
  s.got = true; if (s.i >= 0) G.got.add(s.i); else G.lootGot++;
  G.combo = G.comboT > 0 ? G.combo + 1 : 0; G.comboT = 0.7; S.shard(G.combo);
  fx.sparkle(s.x, s.y, s.z, { n: 8, color: cfg.colors.shard, speed: 3 }); bump('#hShards'); renderHUD();
  if (shardCount() === totalShards(G.id)) { toast('Every shard in ' + NAMES[G.id] + '! ✦'); sfx.chime(); }
}
function collectRelic(r) {
  r.got = true; G.relics[r.i] = 1; r.m.visible = false; G.hitstop = 0.18; S.relic(); flash('#ffe6a0', 260, 0.6); shake(0.15);
  fx.sparkle(r.x, r.y, r.z, { n: 40, color: '#ffc54a', speed: 6, life: 1.1 }); fx.ring(r.x, r.y - 0.4, r.z, { r1: 4, color: '#ffd27a', life: 0.6 });
  const lv = save.levels[G.id]; if (!lv.relics[r.i]) { lv.relics[r.i] = 1; persist(); }
  const n = G.relics.reduce((a, b) => a + b, 0); toast(`Star Fossil ${n}/3 found!`, 2600); bump('#hRelics'); R.joy = 1.2; renderHUD();
  if (relicTotal() === 12 && !save.golden) { save.golden = true; persist(); setTimeout(() => { toast('All 12 Star Fossils! Golden Cobble unlocked ✨', 4200); tintMascot(R, { ...cfg.colors, golden: true }); }, 1800); }
}
function activateCp(i, silent = false) {
  const c = G.cps[i]; if (!c || c.on) return; c.on = true; c.flagM.color.set('#ff6f91'); c.gem.material.color.setRGB(3, 2.2, 0.8);
  G.cp = Math.max(G.cp, i);
  if (silent) return;
  S.checkpoint(); fx.sparkle(c.x, c.y + 2.6, c.z, { n: 24, color: '#ffe27a', speed: 4 }); fx.ring(c.x, c.y + 0.05, c.z, { r1: 2.4, color: '#ffe27a' });
  G.hp = Math.min(DIFF[G.diff].hp, G.hp + 1); toast('Checkpoint!'); renderHUD(); saveRun();
}
function saveRun() { if (G.id === 'hub' || !G.L) return; save.run = { level: G.id, cp: G.cp, shards: [...G.got], loot: G.lootGot, relics: G.relics, broken: [...G.broken], time: G.time }; persist(); }
function breakSolid(s, silent = false) {
  if (!s || !s.active) return; s.active = false; G.broken.add(s.idx); const m = G.V.solidMeshes.get(s.idx); if (m) m.visible = false;
  const cx = s.x, cy = s.top - s.h / 2, cz = s.z;
  if (s.loot?.relic !== undefined) { const r = G.relicsE[s.loot.relic]; if (r) { r.hidden = false; r.m.visible = !r.got; if (!silent) { r.m.scale.setScalar(0.01); tween(0.6, (k) => r.m.scale.setScalar(k), { ease: ease.outBack }); } } }
  if (silent) { if (s.loot?.shards) { /* loot already counted in save */ } return; }
  S.break(); shake(0.12); fx.puff(cx, cy, cz, { n: 12, spread: 1.2, color: '#b8a898', size: 0.3, out: 3.5 }); fx.sparkle(cx, cy, cz, { n: 10, color: '#ffffff', speed: 4 });
  for (let k = 0; k < (s.loot?.shards || 0); k++) { const sh = G.shards.find((q) => q.loose && q.got && q.y === -999); if (!sh) break; const a = k / s.loot.shards * 6.28 + Math.random();
    Object.assign(sh, { got: false, x: cx, y: cy + 0.4, z: cz, vx: Math.cos(a) * 2.6, vy: 7 + Math.random() * 2, vz: Math.sin(a) * 2.6, born: 0.35, floorY: s.bottom }); }
}
function resetCrumble(cr) { cr.st = 'idle'; cr.t = 0; cr.s.active = true; if (cr.mesh) { cr.mesh.position.set(cr.s.x, cr.s.top, cr.s.z); cr.mesh.rotation.set(0, 0, 0); cr.mesh.visible = true; cr.mesh.scale.setScalar(1); } }
function defeatEnemy(e, how) {
  e.alive = false; e.dead = 0.001; e.respawn = e.d.respawn ? 3.2 : 0; S.bop(); setTimeout(() => S.defeat(), 90);
  fx.puff(e.x, e.y + 0.4, e.z, { n: 10, color: e.type === 'blob' ? '#ffb070' : e.type === 'puff' ? '#ffffff' : '#e8e0d0', size: 0.28, out: 3 }); fx.sparkle(e.x, e.y + 0.6, e.z, { n: 12, color: '#ffffff', speed: 4 });
  if (how === 'kick') { e.kick = [G.p.vx * 0.8, 9, G.p.vz * 0.8]; }
}
function hurtPlayer(fx_, fz_, cause = 'hit') {
  const p = G.p; if (p.inv > 0 || G.dying || G.screen !== 'play') return;
  PH.hurt(p, fx_, fz_, T); G.hp--; S.hurt(); shake(0.25); flash('#ff5a5a', 180, 0.35); G.hitstop = 0.08; renderHUD(); bump('#hHp');
  fx.sparkle(p.x, p.y + 0.6, p.z, { n: 10, color: '#ff9a9a', speed: 3.5 });
  if (G.hp <= 0) die('ko'); void cause;
}
function die(kind) {
  if (G.dying) return; G.dying = 1.0; const p = G.p;
  if (kind === 'fall') { const sea = THEMES[G.L.theme].sea; if (sea === 'lava') { S.sizzle(); fx.puff(p.x, G.L.seaY + 0.2, p.z, { n: 14, color: '#ff8a3a', size: 0.4, up: 3 }); } else if (sea === 'water') { S.splash(); fx.puff(p.x, G.L.seaY + 0.1, p.z, { n: 16, color: '#bfe8ff', size: 0.35, up: 4 }); fx.ring(p.x, G.L.seaY + 0.05, p.z, { r1: 3, color: '#ffffff' }); } else S.splash(); if (DIFF[G.diff].fallCost) G.hp = Math.max(0, G.hp - DIFF[G.diff].fallCost); }
  else { S.lose?.(); sfx.lose(); toast('Oof! Back to the checkpoint.'); }
  p.state = 'frozen'; R.root.visible = kind !== 'fall';
  setTimeout(() => { $('#fade').classList.add('on'); }, 450);
  setTimeout(() => { if (G.hp <= 0) G.hp = DIFF[G.diff].hp; respawnAt(); renderHUD(); G.dying = 0; $('#fade').classList.remove('on'); }, 900);
}

// ---------------------------------------------------------------- simulation step (fixed 120 Hz)
const DT = 1 / 120;
const tmpO = [0, 0, 0];
function simStep(edges) {
  const p = G.p, W = G.W; G.t += DT;
  PH.updateMovers(W, G.t);
  // crumbles
  for (const cr of G.crumbles) {
    if (cr.st === 'shake') { cr.t += DT; if (cr.mesh) { cr.mesh.position.x = cr.s.x + (Math.random() - 0.5) * 0.08; cr.mesh.position.z = cr.s.z + (Math.random() - 0.5) * 0.08; } if (cr.t > 0.55) { cr.st = 'fall'; cr.t = 0; cr.s.active = false; cr.vy = 0; S.crumble(); fx.puff(cr.s.x, cr.s.top - 0.3, cr.s.z, { n: 8, color: cr.s.m === 'crumblecloud' ? '#ffffff' : '#e8cf90', size: 0.3 }); } }
    else if (cr.st === 'fall') { cr.t += DT; cr.vy -= 30 * DT; if (cr.mesh) { cr.mesh.position.y += cr.vy * DT; cr.mesh.rotation.x += DT * 1.5; cr.mesh.rotation.z += DT; if (cr.s.m === 'crumblecloud') cr.mesh.scale.setScalar(Math.max(0.01, 1 - cr.t * 2)); } if (cr.t > 3) { const d = Math.hypot(p.x - cr.s.x, p.z - cr.s.z); if (d > 2) { resetCrumble(cr); if (cr.mesh) { cr.mesh.scale.setScalar(0.01); tween(0.35, (k) => cr.mesh.scale.setScalar(Math.max(0.01, k)), { ease: ease.outBack }); } } } }
  }
  if (G.boss) stepBoss();
  // player
  const w = PH.stickToWorld(input.sx, input.sy, cam.yaw);
  const ev = PH.stepPlayer(p, { mx: w.mx, mz: w.mz, jumpPressed: edges.jump, jumpHeld: input.jumpHeld, actionPressed: edges.action }, W, DT, T);
  edges.jump = edges.action = false;
  for (const e of ev) onEvent(e);
  if (p.grounded && p.ground && !p.ground.path && !p.ground.crumble && !p.ground.boss && !p.ground.bounce) G.lastSafe = [p.x, p.y, p.z];
  // crumble trigger
  if (p.grounded && p.ground?.crumble) { const cr = G.crumbles.find((c) => c.s === p.ground); if (cr && cr.st === 'idle') { cr.st = 'shake'; cr.t = 0; S.creak(); } }
  // enemies
  stepEnemies();
  // hazards
  for (const j of G.jets) { const h = j.h; const u = ((G.t / h.T + h.ph) % 1 + 1) % 1; j.on = u < h.on; j.warn = !j.on && u > 1 - 0.22;
    if (j.on && !j.was && Math.hypot(p.x - h.x, p.z - h.z) < 14) S.jet(); j.was = j.on;
    if (j.on && Math.hypot(p.x - h.x, p.z - h.z) < h.r + T.R * 0.6 && p.y < h.y + h.h && p.y + T.H > h.y) { hurtPlayer(h.x + 0.01, h.z + 0.01, 'fire'); p.vy = Math.max(p.vy, 11); } }
  // pickups
  const cy = p.y + 0.5;
  for (const s of G.shards) {
    if (s.got) continue;
    if (s.vx !== undefined && s.born !== undefined) { // loose loot shard: physics hop then magnet
      s.born -= DT; s.vy -= 26 * DT; s.x += s.vx * DT; s.y += s.vy * DT; s.z += s.vz * DT; const fl = PH.floorBelow(W, s.x, s.z, 0.1, s.y + 0.5); const fy = (fl ? fl.y : s.floorY) + 0.6;
      if (s.y < fy) { s.y = fy; s.vy = Math.abs(s.vy) > 3 ? -s.vy * 0.35 : 0; s.vx *= 0.6; s.vz *= 0.6; }
      const d = Math.hypot(p.x - s.x, cy - s.y, p.z - s.z); if (s.born <= 0 && d < 3) { const k = Math.min(1, DT * 9); s.x += (p.x - s.x) * k; s.y += (cy - s.y) * k; s.z += (p.z - s.z) * k; }
      if (s.born <= 0 && d < 0.8) collectShard(s); continue;
    }
    const dx = p.x - s.x, dy = cy - s.y, dz = p.z - s.z; if (dx * dx + dy * dy + dz * dz < 0.85 * 0.85) collectShard(s);
  }
  for (const r of G.relicsE) if (!r.got && !r.hidden && Math.hypot(p.x - r.x, cy - r.y, p.z - r.z) < 1.05) collectRelic(r);
  for (const c of G.cps) if (!c.on && Math.hypot(p.x - c.x, p.z - c.z) < 1.5 && Math.abs(p.y - c.y) < 2) activateCp(c.i);
  if (G.goal && !G.goal.hidden && G.screen === 'play' && Math.hypot(p.x - G.goal.x, p.z - G.goal.z) < 1.5 && Math.abs(p.y - G.goal.y) < 3) levelClear();
  // portals (hub)
  G.portalCd = Math.max(0, G.portalCd - DT);
  for (const pt of G.portals) if (Math.hypot(p.x - pt.x, p.z - pt.z) < 1.15 && G.portalCd <= 0) {
    G.portalCd = 1.5;
    if (pt.locked) { toast(`Finish ${NAMES[ORDER[ORDER.indexOf(pt.id) - 1]]} to open this portal`); sfx.error(); p.vx = -p.vx; p.vz = -p.vz; }
    else enterLevel(pt.id);
  }
  // hints
  for (const h of G.L.hints) if (!G.hintsShown.has(h.key) && Math.hypot(p.x - h.x, p.z - h.z) < h.r && (h.y === null || Math.abs(p.y - h.y) < 3)) { G.hintsShown.add(h.key); showHint(h.key); }
  if (G.comboT > 0) G.comboT -= DT;
  if (G.screen === 'play' && !G.dying && G.id !== 'hub') G.time += DT;
}
function onEvent(e) {
  const p = G.p;
  switch (e.type) {
    case 'jump': S.jump(); squashTo(R, 1.32); fx.puff(p.x, p.y + 0.05, p.z, { n: 6, size: 0.13, out: 1.8, up: 0.6, color: dustColor() }); break;
    case 'double': S.double(); squashTo(R, 1.28); G.flip = 1; fx.sparkle(p.x, p.y + 0.2, p.z, { n: 8, color: '#ffffff', speed: 2.2, life: 0.4 }); fx.ring(p.x, p.y + 0.1, p.z, { r1: 1.3, life: 0.3 }); break;
    case 'long': S.long(); squashTo(R, 0.85); fx.puff(p.x, p.y + 0.1, p.z, { n: 8, size: 0.2, color: dustColor() }); break;
    case 'highjump': S.highjump(); squashTo(R, 1.45); fx.ringPuff(p.x, p.y + 0.1, p.z, 12, 3.6, dustColor(), 0.24); fx.sparkle(p.x, p.y, p.z, { n: 12, color: '#ffffff', speed: 3 }); break;
    case 'roll': S.roll(); fx.puff(p.x, p.y + 0.1, p.z, { n: 6, size: 0.2, color: dustColor() }); break;
    case 'poundStart': S.poundStart(); squashTo(R, 0.8); break;
    case 'mantle': S.step(); squashTo(R, 0.85); break;
    case 'land': {
      const k = Math.min(1, e.impact / 28); squashTo(R, 1 - 0.38 * k - 0.06); if (e.impact > 4) { S.land(k); fx.puff(p.x, p.y + 0.05, p.z, { n: 4 + Math.round(k * 8), size: 0.11 + k * 0.08, out: 1.5 + k * 2, up: 0.5, color: dustColor() }); }
      if (k > 0.85) shake(0.08);
      landOn(e.s, false); break;
    }
    case 'pound': {
      squashTo(R, 0.55); S.pound(); shake(0.22); G.hitstop = 0.05;
      fx.ringPuff(p.x, p.y + 0.1, p.z, 16, 5, dustColor(), 0.2); fx.ring(p.x, p.y + 0.06, p.z, { r1: 3.4, life: 0.35, color: '#ffffff' });
      for (const en of G.enemies) if (en.alive && Math.hypot(en.x - p.x, en.z - p.z) < 2.6 && Math.abs(en.y - p.y) < 1.2) defeatEnemy(en, 'pound');
      landOn(e.s, true); break;
    }
    case 'bonk': if (e.s?.breakable) breakSolid(e.s); else S.land(0.2); break;
    case 'fall': die('fall'); break;
  }
}
function landOn(s, pound) {
  if (!s) return; const p = G.p;
  if (s.breakable && pound) { breakSolid(s); PH.bounce(p, 9, false, T); return; }
  if (s.bounce) { const v = s.bounce * (pound ? 1.18 : 1); PH.bounce(p, v, input.jumpHeld, T); p.vy = v * (input.jumpHeld ? 1.06 : 1); S.boing(pound ? 0.8 : 1); squashTo(R, 1.45);
    const sh = G.shrooms.find((q) => q.s === s); const cap = sh?.mesh?.userData.cap; if (cap) { const y0 = cap.scale.y; tween(0.4, (k, raw) => { cap.scale.y = y0 * (1 - 0.45 * Math.sin(raw * Math.PI) * (1 - raw)); }); }
    fx.ringPuff(p.x, p.y, p.z, 10, 3, '#ffffff', 0.2); return; }
  if (s.boss && G.boss) { const r = BS.stomp(G.boss);
    if (r === 'hit') { S.bossHit(); G.hitstop = 0.2; shake(0.35); flash('#ffffff', 160, 0.5); PH.bounce(p, 15, true, T); const a = Math.atan2(p.x - G.boss.x, p.z - G.boss.z); p.vx = Math.sin(a) * 7; p.vz = Math.cos(a) * 7; fx.sparkle(p.x, p.y, p.z, { n: 30, color: '#ffd27a', speed: 6 }); renderHUD(); if (G.boss.hp > 0) toast(G.boss.hp === 1 ? 'One more!' : 'Ouch — it\'s getting angry!'); }
    else if (r === 'bounce') { S.clang(); PH.bounce(p, 12, false, T); const a = Math.atan2(p.x - G.boss.x, p.z - G.boss.z); p.vx = Math.sin(a) * 8; p.vz = Math.cos(a) * 8; showHint('bossHot'); }
  }
}
function dustColor() { return { meadow: '#efe6d2', hub: '#efe6d2', caves: '#b8a8ff', sky: '#ffffff', forge: '#9a8a86' }[G.L?.theme] || '#ffffff'; }

function stepEnemies() {
  const p = G.p, k = DIFF[G.diff].enemy;
  for (const e of G.enemies) {
    if (!e.alive) { if (e.respawn > 0) { e.respawn -= DT; if (e.respawn <= 0) { e.alive = true; e.dead = 0; e.kick = null; e.v.g.scale.setScalar(0.01); tween(0.4, (q) => e.v.g.scale.setScalar(Math.max(0.01, q)), { ease: ease.outBack }); } } continue; }
    e.t += DT; const d = e.d;
    if (e.type === 'bug') {
      const L = Math.hypot(d.b[0] - d.a[0], d.b[2] - d.a[2]) || 1; const near = Math.hypot(p.x - e.x, p.z - e.z) < 4 && Math.abs(p.y - e.y) < 1.5;
      e.u += e.dir * DT * d.speed * k * (near ? 1.6 : 1) / L; if (e.u > 1) { e.u = 1; e.dir = -1; } if (e.u < 0) { e.u = 0; e.dir = 1; }
      e.x = d.a[0] + (d.b[0] - d.a[0]) * e.u; e.z = d.a[2] + (d.b[2] - d.a[2]) * e.u; e.y = d.a[1] + (d.b[1] - d.a[1]) * e.u; e.yaw = Math.atan2((d.b[0] - d.a[0]) * e.dir, (d.b[2] - d.a[2]) * e.dir);
    } else if (e.type === 'mite') {
      const dx = p.x - e.x, dz = p.z - e.z, dist = Math.hypot(dx, dz); const sees = dist < d.charge && Math.abs(p.y - e.y) < 1.4;
      if (e.state === 'walk') { e.yaw += Math.sin(e.t * 0.9) * DT; const tx = e.home[0] + Math.sin(e.t * 0.7) * d.range, tz = e.home[2] + Math.cos(e.t * 0.5) * d.range * 0.6; e.x += (tx - e.x) * DT * 1.5; e.z += (tz - e.z) * DT * 1.5; e.yaw = Math.atan2(tx - e.x, tz - e.z); if (sees) { e.state = 'wind'; e.st = 0; fx.sparkle(e.x, e.y + 1.3, e.z, { n: 4, color: '#ffffff', speed: 1.5, life: 0.3 }); } }
      else if (e.state === 'wind') { e.st += DT; e.yaw = Math.atan2(dx, dz); e.hopY = Math.sin(Math.min(1, e.st / 0.4) * Math.PI) * 0.3; if (e.st > 0.4) { e.state = 'charge'; e.st = 0; e.cd = [dx / (dist || 1), dz / (dist || 1)]; } }
      else if (e.state === 'charge') { e.st += DT; const nx = e.x + e.cd[0] * d.speed * 2.6 * k * DT, nz = e.z + e.cd[1] * d.speed * 2.6 * k * DT; const fl = PH.floorBelow(G.W, nx + e.cd[0] * 0.5, nz + e.cd[1] * 0.5, 0.1, e.y + 0.3); if (fl && Math.abs(fl.y - e.y) < 0.3 && Math.hypot(nx - e.home[0], nz - e.home[2]) < d.range + 3) { e.x = nx; e.z = nz; } else e.st = 9; if (e.st > 1.1) { e.state = 'rest'; e.st = 0; } }
      else if (e.state === 'rest') { e.st += DT; if (e.st > 1.2) e.state = 'walk'; }
    } else if (e.type === 'puff') {
      const bob = Math.sin(e.t * 2.2) * (d.bob || 0.3); e.x = d.x + (d.hover ? Math.cos(e.t * 0.8) * d.hover : 0); e.z = d.z + (d.hover ? Math.sin(e.t * 0.8) * d.hover : 0); e.y = d.y + bob; e.yaw = Math.atan2(p.x - e.x, p.z - e.z);
    } else if (e.type === 'blob') {
      e.st += DT * k; const per = 1.3; const ph = e.st % per; if (ph < DT * k && e.st > DT) { e.vy = 7.5; const dx = p.x - e.x, dz = p.z - e.z, dist = Math.hypot(dx, dz); e.hd = dist < 7 && Math.abs(p.y - e.y) < 2 ? [dx / dist, dz / dist] : [Math.sin(e.t * 3), Math.cos(e.t * 2.3)]; }
      e.vy -= 26 * DT; e.hopY = Math.max(0, e.hopY + e.vy * DT); if (e.hopY > 0 && e.hd) { const nx = e.x + e.hd[0] * d.hop * DT * 1.6, nz = e.z + e.hd[1] * d.hop * DT * 1.6; if (Math.hypot(nx - d.x, nz - d.z) < d.range) { e.x = nx; e.z = nz; } e.yaw = Math.atan2(e.hd[0], e.hd[1]); } if (e.hopY <= 0) { if (e.vy < -3) fx.puff(e.x, e.y + 0.05, e.z, { n: 3, color: '#ff9a4a', size: 0.14 }); e.vy = 0; }
    }
    // contact
    const ey = e.y + e.hopY; const dh = Math.hypot(p.x - e.x, p.z - e.z);
    if (dh < e.v.r + T.R && p.y < ey + e.v.h && p.y + T.H > ey) {
      const fromAbove = p.y > ey + e.v.h * 0.45 && (p.vy <= 0.5 || p.state === 'pound');
      if (fromAbove) {
        const pound = p.state === 'pound'; PH.bounce(p, e.type === 'puff' ? 15 : T.bopV, input.jumpHeld, T); if (e.type === 'puff') p.vy = input.jumpHeld ? 17.5 : 14;
        squashTo(R, 1.35); G.hitstop = 0.05; fx.ring(e.x, ey + e.v.h, e.z, { r1: 1.6, life: 0.25 }); defeatEnemy(e, pound ? 'pound' : 'bop');
      } else if (p.state === 'roll' || p.long) { defeatEnemy(e, 'kick'); }
      else hurtPlayer(e.x, e.z);
    }
  }
}
function stepBoss() {
  const B = G.boss, p = G.p, ev = BS.stepBoss(B, DT, p);
  PH.moveSolidTo(G.bossSolid, B.x, B.y + B.height, B.z); G.bossSolid.dx = G.bossSolid.dy = G.bossSolid.dz = 0; G.bossSolid.bottom = B.y - 0.5; G.bossSolid.active = B.state !== 'dead' && B.state !== 'leap';
  for (const e of ev) switch (e.type) {
    case 'roar': S.roar(); shake(0.3); $('#bossBar').classList.add('show'); showHint('boss'); renderHUD(); break;
    case 'windup': S.creak(); break;
    case 'leap': sfx.whoosh(); break;
    case 'slam': S.slam(); shake(0.35); fx.ringPuff(e.x, B.cy + 0.2, e.z, 20, 7, '#9a8a86', 0.4); if (p.grounded && Math.hypot(p.x - e.x, p.z - e.z) < BS.BOSS.r + 0.6) hurtPlayer(e.x, e.z); break;
    case 'ringHit': case 'bodyHit': case 'emberHit': hurtPlayer(e.x + 0.001, e.z); break;
    case 'emberLand': S.ember(); fx.puff(e.x, B.cy + 0.2, e.z, { n: 6, color: '#ff9a4a', size: 0.3, up: 2 }); fx.sparkle(e.x, B.cy + 0.3, e.z, { n: 8, color: '#ffb040', speed: 4 }); break;
    case 'dazed': fx.sparkle(B.x, B.y + 3, B.z, { n: 16, color: '#9ad8ff', speed: 2.5 }); if (!save.seen.daze) { showHint('bossDaze'); save.seen.daze = 1; persist(); } break;
    case 'enrage': S.roar(); shake(0.2); break;
    case 'defeated': S.roar(); shake(0.5); flash('#ffffff', 400, 0.7); setTimeout(() => { sfx.win(); fx.sparkle(B.cx, B.cy + 2, B.cz, { n: 60, color: '#ffd27a', speed: 8, life: 1.3 }); if (G.goal) { G.goal.hidden = false; G.goal.g.visible = true; G.goal.g.position.set(B.x + (Math.abs(B.x - B.cx) < 3 ? 0 : 0), B.cy, B.z); G.goal.x = B.x; G.goal.z = B.z; G.goal.g.scale.setScalar(0.01); tween(0.9, (k) => G.goal.g.scale.setScalar(k), { ease: ease.outBack }); } $('#bossBar').classList.remove('show'); toast('Old Clinker cools down… the Great Heartstone!', 3200); }, 1300); break;
  }
}

// ---------------------------------------------------------------- flow
function enterLevel(id, resume = null) {
  if (G.transition) return; G.transition = true; S.portal(); $('#fade').classList.add('on');
  setTimeout(() => { loadLevel(id, { resume }); G.screen = 'play'; G.transition = false; $('#fade').classList.remove('on'); $('#hud').classList.add('show'); $('#touch').classList.add('live');
    if (id !== 'hub') { banner(`World ${ORDER.indexOf(id) + 1}`, NAMES[id]); host('start', { level: id }); } else banner('Welcome to', 'Pebble Plateau'); }, 380);
}
function toHub() { save.run = save.run && save.run.level === G.id ? save.run : save.run; enterLevel('hub'); }
function levelClear() {
  if (G.screen !== 'play') return; G.screen = 'clear'; G.clearT = 0; const p = G.p; p.state = 'frozen'; p.vx = p.vz = 0;
  S.goal(); flash('#ffe6f2', 300, 0.6); R.joy = 3; squashTo(R, 1.5); fx.sparkle(G.goal.x, G.goal.y + 2, G.goal.z, { n: 50, color: '#ff8fc8', speed: 7, life: 1.2 });
  const lv = save.levels[G.id]; const first = !lv.done; const newBest = !lv.best || G.time < lv.best;
  lv.done = true; if (newBest) lv.best = Math.round(G.time * 10) / 10; lv.shardsBest = Math.max(lv.shardsBest, shardCount()); G.relics.forEach((v, i) => { if (v) lv.relics[i] = 1; });
  save.run = null; persist(); host('score', { level: G.id, time: G.time, shards: shardCount() });
  setTimeout(() => showResults(first, newBest), 2600);
}
function showResults(first, newBest) {
  const lv = save.levels[G.id]; const idx = ORDER.indexOf(G.id); const next = ORDER[idx + 1]; const final = G.id === 'forge';
  const fossils = [0, 1, 2].map((i) => `<i class="${lv.relics[i] ? 'on' : ''}"></i>`).join('');
  card(`<div class="eyebrow">${final ? 'The Peaks shine again' : `World ${idx + 1} clear`}</div><h2>${final ? 'You did it, Cobble!' : NAMES[G.id]}</h2>
    ${final ? `<p style="margin:4px 0 8px;opacity:.95">Old Clinker is cooled, the four Heartstones glow, and the mountain hums. ${relicTotal() < 12 ? `There are still <b>${12 - relicTotal()}</b> Star Fossils hiding out there…` : 'Every Star Fossil found — Golden Cobble is yours!'}</p>` : ''}
    <div class="stats"><div class="stat"><small>Time</small><b>${fmtTime(G.time)}${newBest ? '<span class="badge">BEST</span>' : ''}</b></div><div class="stat"><small>Shards</small><b>${shardCount()}/${totalShards(G.id)}</b></div></div>
    <div class="eyebrow">Star Fossils</div><div class="fossils">${fossils}</div>
    <div class="sd-row col">${next && !final ? `<button class="sd-btn primary" id="rNext">Next: ${NAMES[next]}</button>` : ''}<button class="sd-btn ${final ? 'primary' : ''}" id="rHub">Back to Pebble Plateau</button><button class="sd-btn" id="rAgain">Replay ${NAMES[G.id]}</button></div>`, () => {
    $('#rNext')?.addEventListener('click', () => { closeCard(); enterLevel(next); });
    $('#rHub').onclick = () => { closeCard(); enterLevel('hub'); }; $('#rAgain').onclick = () => { closeCard(); enterLevel(G.id); };
  });
  if (first && final) { setTimeout(() => sfx.win(), 200); }
}
let cardOpen = false;
function card(html, wire) { $('#cardBody').innerHTML = html; $('#card').classList.add('open'); cardOpen = true; wire?.(); $('#card').querySelector('.sd-btn')?.focus?.(); }
function closeCard() { $('#card').classList.remove('open'); cardOpen = false; }
function pause() {
  if (G.screen !== 'play' || cardOpen) return; sfx.click(); G.screen = 'paused';
  const inLevel = G.id !== 'hub';
  card(`<h2>Paused</h2><div class="eyebrow">${inLevel ? NAMES[G.id] + ' · ' + fmtTime(G.time) : 'Pebble Plateau'}</div>
    <div class="sd-row col" style="margin-top:12px"><button class="sd-btn primary" id="pRes">Resume</button>${inLevel ? '<button class="sd-btn" id="pCp">Restart from checkpoint</button><button class="sd-btn" id="pHub">Back to Pebble Plateau</button>' : '<button class="sd-btn" id="pWorlds">Warp to a world</button>'}
    <button class="sd-btn" id="pKeys">Controls</button><button class="sd-btn" id="pSet">Settings</button><button class="sd-btn" id="pMenu">Title screen</button></div>`, () => {
    $('#pRes').onclick = resume; $('#pSet').onclick = () => $('#sd-gear').click(); $('#pKeys').onclick = showControls;
    $('#pCp')?.addEventListener('click', () => { closeCard(); G.screen = 'play'; respawnAt(); });
    $('#pHub')?.addEventListener('click', () => { closeCard(); saveRun(); enterLevel('hub'); });
    $('#pWorlds')?.addEventListener('click', showWorlds);
    $('#pMenu').onclick = () => { closeCard(); saveRun(); G.screen = 'menu'; $('#hud').classList.remove('show'); $('#touch').classList.remove('live'); menu.show(); };
  });
}
function resume() { closeCard(); G.screen = 'play'; sfx.click(); }
function showWorlds() {
  card(`<h2>Warp</h2><div class="worlds">${ORDER.map((id, i) => { const lv = save.levels[id]; const ok = unlocked(id); return `<button class="sd-btn" data-w="${id}" ${ok ? '' : 'disabled style="opacity:.45"'}>${i + 1}. ${NAMES[id]}<small>${ok ? `${lv.relics.reduce((a, b) => a + b, 0)}/3 fossils · ${lv.best ? fmtTime(lv.best) : 'not cleared'}` : 'locked'}</small></button>`; }).join('')}</div><div class="sd-row"><button class="sd-btn" id="wBack">Back</button></div>`, () => {
    document.querySelectorAll('[data-w]').forEach((b) => b.addEventListener('click', () => { if (b.disabled) return; closeCard(); enterLevel(b.dataset.w); }));
    $('#wBack').onclick = () => { closeCard(); G.screen = 'play'; pause(); };
  });
}
function showControls() {
  const k = (s) => s.split(' ').map((x) => `<kbd>${x}</kbd>`).join(' ');
  card(`<h2>Controls</h2><div class="keys">
    <b>Keyboard</b> — ${k('W A S D')} / arrows run · ${k('Space')} jump (hold = higher, again in air = double hop) · ${k('Shift')} roll on the ground, ground-pound in the air · roll→jump = long jump · pound→jump on landing = high jump · mouse drag or ${k('Q')}${k('E')} camera · ${k('R')} recenter · ${k('Esc')} pause<br>
    <b>Gamepad</b> — left stick run · <kbd>A</kbd> jump · <kbd>X</kbd>/<kbd>B</kbd> roll / pound · right stick camera · <kbd>Y</kbd> recenter · <kbd>Start</kbd> pause<br>
    <b>Touch</b> — left thumb run · JUMP · ROLL/POUND · drag the right side to look</div>
    <div class="sd-row"><button class="sd-btn primary" id="kBack">Back</button></div>`, () => { $('#kBack').onclick = () => { closeCard(); if (G.screen === 'paused') { G.screen = 'play'; pause(); } }; });
}

// ---------------------------------------------------------------- HUD
function renderHUD() {
  if (!G.L) return; const inLevel = G.id !== 'hub';
  $('#hShards').style.display = inLevel ? '' : 'none'; $('#hRelics').style.display = inLevel ? '' : 'none'; $('#hTime').style.display = inLevel && cfg.timer !== false ? '' : 'none';
  $('#shN').textContent = shardCount(); $('#shT').textContent = totalShards(G.id);
  $('#hRelics').querySelectorAll('i').forEach((el, i) => el.classList.toggle('on', !!G.relics[i]));
  const max = DIFF[G.diff].hp; $('#hHp').innerHTML = inLevel ? Array.from({ length: max }, (_, i) => `<i class="${i < G.hp ? '' : 'off'}"></i>`).join('') : '';
  if (G.boss) $('#bossHp').style.width = (G.boss.hp / 3 * 100) + '%';
}
function bump(sel) { const el = $(sel); if (!el) return; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
function banner(small, big) { const b = $('#banner'); b.querySelector('small').textContent = small; b.querySelector('b').textContent = big; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); }
const HINTS = {
  move: { keys: 'Run with <kbd>W A S D</kbd> · drag the mouse (or <kbd>Q</kbd><kbd>E</kbd>) to look', pad: 'Run with the left stick · look with the right stick', touch: 'Left thumb runs · drag the right side to look' },
  jump: { keys: '<kbd>Space</kbd> to jump — hold it to jump higher', pad: '<kbd>A</kbd> to jump — hold it to jump higher', touch: 'Tap JUMP — hold it to jump higher' },
  bop: { all: 'Mossbugs bite from the side — jump on their shells to bop them!' },
  double: { keys: 'Too high? Press <kbd>Space</kbd> again in mid-air for a Double Hop', pad: 'Too high? Press <kbd>A</kbd> again in mid-air for a Double Hop', touch: 'Too high? Tap JUMP again in mid-air for a Double Hop' },
  crumble: { all: 'Sandy planks crumble under you — keep moving!' },
  shroom: { all: 'Mushrooms bounce you sky-high — hold jump for extra height. Something glints on that pillar…' },
  roll: { keys: '<kbd>Shift</kbd> on the ground to Roll — it bowls over bugs', pad: '<kbd>X</kbd> on the ground to Roll — it bowls over bugs', touch: 'Tap ROLL on the ground to Roll — it bowls over bugs' },
  long: { keys: 'Roll, then <kbd>Space</kbd> = Long Jump. Add a Double Hop to fly really far…', pad: 'Roll, then <kbd>A</kbd> = Long Jump. Add a Double Hop to fly really far…', touch: 'Roll, then JUMP = Long Jump. Add a Double Hop to fly really far…' },
  pound: { keys: 'In mid-air press <kbd>Shift</kbd> to Ground Pound — it smashes cracked rocks', pad: 'In mid-air press <kbd>X</kbd> to Ground Pound — it smashes cracked rocks', touch: 'In mid-air tap POUND to Ground Pound — it smashes cracked rocks' },
  mite: { all: 'Gloomites charge when they spot you — hop aside, then bop them!' },
  orbit: { all: 'Ride the circling platforms. The bouncy one launches you up the pillar…' },
  lowroof: { all: 'Low ceiling over that gap — only a Long Jump stays low enough.' },
  cloud: { all: 'Clouds are soft: jump up through them from below.' },
  puff: { all: 'Bop the Pufflings to bounce across — hold jump for big bounces!' },
  stairs: { all: 'The staircase turns with the tower — Double Hop up step by step.' },
  sink: { all: 'These basalt stones sink into the lava — keep hopping!' },
  jet: { all: 'Fire jets pulse — cross while the flame is down.' },
  highjump: { keys: 'Ground Pound, then press <kbd>Space</kbd> right as you land for a High Jump!', pad: 'Ground Pound, then press <kbd>A</kbd> right as you land for a High Jump!', touch: 'Ground Pound, then tap JUMP right as you land for a High Jump!' },
  hub: { all: 'Walk into a portal to enter a world. Each hides 3 Star Fossils!' },
  boss: { all: 'Old Clinker! Jump over its shockwaves — wait until it\'s dazed…' },
  bossDaze: { all: 'It\'s dazed and cooling — bop or Ground Pound its head!' },
  bossHot: { all: 'Too hot! Wait until it slumps, dazed, before you bop it.' },
};
let hintTimer = 0;
function showHint(k) { const h = HINTS[k]; if (!h) return; const mode = input.mode === 'touch' || input.touch ? 'touch' : input.mode === 'pad' ? 'pad' : 'keys'; const el = $('#hint'); el.innerHTML = h.all || h[mode] || h.keys; el.classList.add('show'); clearTimeout(hintTimer); hintTimer = setTimeout(() => el.classList.remove('show'), 5200); }

// ---------------------------------------------------------------- camera
const V1 = new THREE.Vector3(), V2 = new THREE.Vector3();
const lerpA = (a, b, k) => { const d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI; return a + d * k; };
function updateCamera(dt) {
  const p = G.p; if (!p) return;
  if (cam.free) { camera.position.set(...cam.free.pos); camera.lookAt(...cam.free.look); return; }
  const manual = Math.abs(input.cx) + Math.abs(input.cy) > 0.05 || Math.abs(input.dragX) + Math.abs(input.dragY) > 0.5;
  cam.yaw -= input.cx * 2.6 * dt + input.dragX * 0.0055; cam.pitch = Math.max(0.08, Math.min(1.05, cam.pitch + input.cy * 1.6 * dt + input.dragY * 0.004)); input.dragX = input.dragY = 0;
  if (manual) cam.manualT = 0; else cam.manualT += dt;
  if (input.recenterEdge) { input.recenterEdge = false; cam.target = p.yaw + Math.PI; }
  if (cam.target !== undefined) { cam.yaw = lerpA(cam.yaw, cam.target, 1 - Math.exp(-dt * 10)); if (Math.abs(((cam.target - cam.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.02) cam.target = undefined; }
  // focus with velocity lead; lazy vertical follow (only re-centres on landing or when leaving a band)
  const lead = 0.22; const tx = p.x + p.vx * lead, tz = p.z + p.vz * lead;
  const kf = 1 - Math.exp(-dt * 7); cam.fx += (tx - cam.fx) * kf; cam.fz += (tz - cam.fz) * kf;
  if (p.grounded || p.state === 'frozen') cam.groundY = p.y; else if (p.y < cam.groundY - 1.2) cam.groundY = p.y + 1.2; else if (p.y > cam.groundY + 3.2) cam.groundY = p.y - 3.2;
  cam.fy += (cam.groundY - cam.fy) * (1 - Math.exp(-dt * (p.grounded ? 5 : 3)));
  // string follow: the camera trails lateral motion (rate-limited), never spins when running toward it
  if (cam.manualT > 0.8 && G.screen === 'play') {
    const hs = Math.hypot(p.vx, p.vz);
    if (hs > 2) { const want = Math.atan2(camera.position.x - p.x, camera.position.z - p.z); const behind = p.yaw + Math.PI; const toward = Math.cos(behind - want) < -0.3; if (!toward) cam.yaw = lerpA(cam.yaw, want, Math.min(1, dt * 1.6)); void behind; }
  }
  if (G.screen === 'clear') cam.yaw += dt * 0.5;
  cam.intro = Math.max(0, cam.intro - dt);
  const dist = cam.dist * (1 + ease.inOutCubic(Math.min(1, cam.intro / 1.4)) * 0.9) * (innerWidth < innerHeight ? 1.12 : 1) * (G.boss?.awake && G.boss.state !== 'dead' ? 1.35 : 1);
  const look = V1.set(cam.fx, cam.fy + cam.lookY, cam.fz);
  const cp = Math.cos(cam.pitch), dir = V2.set(Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), Math.cos(cam.yaw) * cp);
  // wall avoidance: ray from the look point to the wanted spot; pull in fast, ease back out slowly
  const hit = PH.raycast(G.W, look.x, look.y, look.z, dir.x, dir.y, dir.z, dist + 0.5, G.bossSolid);
  const want = Math.max(1.6, Math.min(dist, hit - 0.45));
  cam.cur += (want - cam.cur) * (1 - Math.exp(-dt * (want < cam.cur ? 22 : 2.5)));
  camera.position.copy(look).addScaledVector(dir, cam.cur);
  camera.position.y = Math.max(camera.position.y, G.L.seaY + 0.8);
  camera.lookAt(look.x, look.y, look.z);
}

// ---------------------------------------------------------------- render-side updates
const M4 = new THREE.Matrix4(), Qt = new THREE.Quaternion(), Vp = new THREE.Vector3(), Sc = new THREE.Vector3(), Eu = new THREE.Euler();
function updateVisuals(dt, t) {
  const p = G.p; if (!p || !G.V) return;
  // movers
  for (const s of G.W.solids) if (s.path) { const m = G.V.solidMeshes.get(s.idx); if (m) m.position.set(s.x, s.top, s.z); }
  // mascot
  R.root.position.set(p.x, p.y, p.z);
  G.flip = Math.max(0, G.flip - dt / 0.42);
  animateMascot(R, dt, { speed: Math.hypot(p.vx, p.vz), grounded: p.grounded, vy: p.vy, state: p.state, st: p.st, yaw: p.yaw, t, flip: G.flip, inv: p.inv, hurt: p.state === 'hurt' });
  if (G.dying) R.root.visible = false; else if (p.inv <= 0) R.root.visible = true;
  // footsteps
  if (p.grounded && p.state === 'normal' && Math.hypot(p.vx, p.vz) > 2.5) { G.stepT -= dt * Math.hypot(p.vx, p.vz); if (G.stepT <= 0) { G.stepT = 2.1; S.step(p.ground?.m === 'metal' ? 'metal' : 'ground'); if (Math.random() < 0.5) fx.puff(p.x, p.y + 0.04, p.z, { n: 1, size: 0.12, out: 0.6, up: 0.3, life: 0.4, color: dustColor() }); } }
  if (p.state === 'roll' && Math.random() < 0.5) fx.puff(p.x, p.y + 0.05, p.z, { n: 1, size: 0.16, out: 0.5, up: 0.4, life: 0.4, color: dustColor() });
  if (p.state === 'pound' && p.st > 0.17) fx.sparkle(p.x, p.y + 0.6, p.z, { n: 1, color: '#ffffff', speed: 0.5, life: 0.25, grav: -2 });
  // blob shadow
  const fl = PH.floorBelow(G.W, p.x, p.z, 0.05, p.y + 0.1);
  if (fl && !G.dying) { const h = p.y - fl.y; blob.visible = true; blob.position.set(p.x, fl.y + 0.03, p.z); const k = Math.max(0.35, 1 - h / 9); blob.scale.setScalar(k * 1.05); blob.material.opacity = k; } else blob.visible = false;
  // shards
  const sm = G.shardMesh; let n = 0;
  for (const s of G.shards) { if (s.got) { M4.makeScale(0, 0, 0); } else { Qt.setFromEuler(Eu.set(0, t * 2.4 + s.ph, 0)); M4.compose(Vp.set(s.x, s.y + Math.sin(t * 3 + s.ph) * 0.1, s.z), Qt, Sc.setScalar(1)); } sm.setMatrixAt(n++, M4); }
  sm.instanceMatrix.needsUpdate = true;
  for (const r of G.relicsE) { r.m.rotation.y = t * 1.6; r.m.position.y = r.y + Math.sin(t * 2) * 0.15; }
  for (const c of G.cps) { c.flag.rotation.y = Math.sin(t * 3 + c.i) * 0.2; if (c.on) c.gem.rotation.y = t * 2; }
  if (G.goal && G.goal.g.visible) { G.goal.gem.rotation.y = t * 1.2; G.goal.gem.position.y = 2.2 + Math.sin(t * 2) * 0.15; G.goal.beam.material.opacity = 0.14 + Math.sin(t * 3) * 0.04; }
  for (const pt of G.portals) pt.sign.lookAt(camera.position.x, pt.sign.getWorldPosition(Vp).y, camera.position.z);
  // enemies
  for (const e of G.enemies) {
    const g = e.v.g;
    if (!e.alive) { if (e.dead > 0) { e.dead += dt; if (e.kick) { g.position.x += e.kick[0] * dt; g.position.z += e.kick[2] * dt; e.kick[1] -= 30 * dt; g.position.y += e.kick[1] * dt; g.rotation.x += dt * 12; } else g.scale.set(1 + e.dead * 2, Math.max(0.05, 1 - e.dead * 6), 1 + e.dead * 2); if (e.dead > 0.45) g.visible = false; } continue; }
    g.visible = true; g.position.set(e.x, e.y + e.hopY, e.z); g.rotation.set(0, e.yaw, 0); if (!e.kick) g.scale.setScalar(Math.max(g.scale.x, 0.01));
    const w = e.type === 'puff' ? Math.sin(t * 14 + e.i) : Math.sin(t * 12 + e.i);
    e.v.legs.forEach((l, i) => { if (e.type === 'puff') l.rotation.z = (i ? 1 : -1) * (0.3 + w * 0.5); else l.rotation.x = w * 0.6 * (i % 2 ? 1 : -1); });
    e.v.body.position.y = e.type === 'bug' || e.type === 'mite' ? Math.abs(w) * 0.04 : 0;
    if (e.type === 'blob') { const sq = e.hopY > 0 ? 1.15 : 0.85 + Math.abs(Math.sin(t * 4)) * 0.1; e.v.body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq)); }
    if (e.type === 'mite' && e.state === 'wind') e.v.body.position.y = 0.05 + Math.random() * 0.04;
  }
  // jets
  for (const j of G.jets) { const target = j.on ? j.h.h : 0.01; j.flame.scale.y += (target - j.flame.scale.y) * Math.min(1, dt * 18); j.flame.position.y = 0.4 + j.flame.scale.y / 2; j.flame.visible = j.flame.scale.y > 0.05; j.warn.material.opacity = j.warn_ = j.on ? 0.8 : j.warn ? 0.4 + Math.sin(t * 30) * 0.3 : 0.15;
    if (j.on && Math.random() < 0.3) fx.sparkle(j.h.x, j.h.y + j.h.h * 0.8, j.h.z, { n: 1, color: '#ffa040', speed: 1.5, life: 0.5, grav: -3 }); }
  // boss
  if (G.boss) {
    const B = G.boss, bv = G.bossV; bv.g.position.set(B.x, B.y, B.z); bv.g.rotation.y = lerpA(bv.g.rotation.y, B.face, Math.min(1, dt * 4));
    const sq = B.height / BS.BOSS.h; bv.body.scale.set(1 + (1 - sq) * 0.5, sq, 1 + (1 - sq) * 0.5);
    const heat = B.state === 'dazed' || B.state === 'hurt' || B.state === 'dead' || B.state === 'sleep' ? 0 : 1; bv.uHeat.value += (heat - bv.uHeat.value) * Math.min(1, dt * 3);
    bv.arms.forEach((a, i) => { a.position.y = 1.3 + (B.state === 'windup' ? 0.8 : 0) + Math.sin(t * 3 + i) * 0.1; });
    bv.crown.rotation.y = t * (B.state === 'dazed' ? 4 : 0.6); bv.crownM.emissiveIntensity = heat ? 1.2 : 0.2;
    bv.eyes.forEach((e) => { e.scale.y = B.state === 'dazed' ? 0.15 : B.state === 'sleep' ? 0.1 : 0.7; });
    if (B.state === 'hurt') bv.g.position.x += Math.sin(t * 60) * 0.08;
    G.rings.forEach((m, i) => { const r = B.rings[i]; m.visible = !!r; if (r) { m.position.set(r.x, B.cy + 0.35, r.z); m.scale.set(r.r, r.r, 1 + 0.3); } });
    G.emberV.forEach((v, i) => { const e = B.embers[i]; v.b.visible = v.w.visible = !!e && e.t > -0.01; if (e && e.t >= 0) { const k = Math.min(1, e.t / e.fall); v.b.position.set(e.x, B.cy + (1 - k) * 14, e.z); v.w.position.set(e.x, B.cy + 0.05, e.z); v.w.scale.setScalar(0.6 + k * 0.5); v.w.material.opacity = 0.3 + 0.4 * Math.abs(Math.sin(t * 16)); } });
  }
  // light follows the player (tight shadow frustum)
  const sd = skyU.sunDir.value; key.position.set(p.x + sd.x * 40, p.y + sd.y * 40, p.z + sd.z * 40); key.target.position.set(p.x, p.y, p.z);
  rim.position.set(p.x - sd.x * 30, p.y + 12, p.z - sd.z * 30);
  // timer HUD
  if (G.id !== 'hub') $('#hTime').textContent = fmtTime(G.time);
}

// ---------------------------------------------------------------- frame loop
const edges = { jump: false, action: false };
let menuT = 0;
function frame(dt, t) {
  input.poll();
  const e = input.consume(); if (e.jump) edges.jump = true; if (e.action) edges.action = true;
  if (input.pauseEdge) { input.pauseEdge = false; if (G.screen === 'play') pause(); else if (G.screen === 'paused' && cardOpen) resume(); }
  if (G.screen === 'play' || G.screen === 'clear') {
    if (G.hitstop > 0) G.hitstop -= dt;
    else { G.acc += dt; let n = 0; while (G.acc >= DT && n < 8) { simStep(edges); G.acc -= DT; n++; } }
  } else { edges.jump = edges.action = false; }
  if (G.screen === 'clear') { G.clearT += dt; }
  updateTweens(dt); fx.update(dt);
  if (G.screen === 'menu') { menuT += dt; if (G.p) { cam.yaw += dt * 0.12; } }
  updateVisuals(dt, t); updateCamera(dt); applyShake(camera, dt);
  P.counts.drawCalls = renderer.info.render.drawCalls;
}

// ---------------------------------------------------------------- UI
settingsButton();
addEventListener('sd-settings', () => applyConfig());
const hasRun = () => !!save.run && LEVELS[save.run.level];
const menu = startMenu({ title: 'Pebble Peaks', subtitle: 'Help Cobble the little river stone climb four worlds, gather shards, find the hidden Star Fossils and cool the grumpy forge golem at the top.',
  options: [{ key: 'difficulty', label: 'Difficulty', value: G.diff, choices: [{ v: 'easy', label: 'Relaxed' }, { v: 'normal', label: 'Normal' }, { v: 'hard', label: 'Tough' }] }],
  startLabel: hasRun() ? 'Continue' : 'Play', onStart: (v) => {
    G.diff = v.difficulty; save.diff = v.difficulty; persist();
    if (hasRun()) card(`<h2>Welcome back!</h2><p>You were in <b>${NAMES[save.run.level]}</b>${save.run.cp >= 0 ? ' at a checkpoint' : ''}.</p><div class="sd-row col"><button class="sd-btn primary" id="cRes">Resume ${NAMES[save.run.level]}</button><button class="sd-btn" id="cHub">Go to Pebble Plateau</button></div>`, () => {
      $('#cRes').onclick = () => { closeCard(); enterLevel(save.run.level, save.run); }; $('#cHub').onclick = () => { closeCard(); enterLevel('hub'); }; });
    else enterLevel(save.levels.meadow.done ? 'hub' : 'meadow');
  } });
{ const h1 = menu.el.querySelector('h1'); h1.insertAdjacentHTML('beforebegin', '<div class="menu-art">A Super Dreams platformer</div>'); const r = relicTotal(); if (r) menu.el.querySelector('p').insertAdjacentHTML('beforeend', `<br><b>${r}/12</b> Star Fossils found · ${ORDER.filter((id) => save.levels[id].done).length}/4 worlds cleared`);
  menu.el.querySelector('#sd-start').insertAdjacentHTML('afterend', '<button class="sd-btn" id="mKeys">Controls</button>'); menu.el.querySelector('#mKeys').onclick = (e) => { e.stopPropagation(); showControls(); }; }
$('#pauseBtn').onclick = (e) => { e.stopPropagation(); pause(); };

// menu backdrop: the hub, slowly orbiting
loadLevel('hub'); cam.dist = cfg.camDist; cam.pitch = 0.3; G.screen = 'menu';
bar(0.9);
startLoop(renderer, frame, post.render);
$('#loading').classList.add('hide'); setTimeout(() => $('#loading')?.remove(), 600);

// ---------------------------------------------------------------- probe + test hooks
P.dataReady = true;
P.game = {
  state: () => { const p = G.p; return { screen: G.screen, level: G.id, x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), vy: +p.vy.toFixed(2), grounded: p.grounded, st: p.state, hp: G.hp, shards: shardCount(), total: totalShards(G.id), relics: [...G.relics], cp: G.cp, time: +G.time.toFixed(2), boss: G.boss ? { state: G.boss.state, hp: G.boss.hp } : null, camYaw: +cam.yaw.toFixed(2), camDist: +cam.cur.toFixed(2), enemies: G.enemies.filter((e) => e.alive).length, save: { levels: save.levels, golden: save.golden } }; },
  start: (id = 'meadow') => { menu.hide(); closeCard(); loadLevel(id); G.screen = 'play'; $('#hud').classList.add('show'); $('#touch').classList.add('live'); cam.intro = 0; return P.game.state(); },
  sim: (sec = 1) => { const steps = Math.round(sec / DT); for (let i = 0; i < steps; i++) { input.poll(); const e = input.consume(); if (e.jump) edges.jump = true; if (e.action) edges.action = true; if (G.screen === 'play' || G.screen === 'clear') simStep(edges); updateCamera(DT); } updateTweens(sec); return P.game.state(); },
  hold: (o = {}) => { input.scripted = { sx: 0, sy: 0, jump: false, ...o }; },
  release: () => { input.scripted = null; },
  press: (b = 'jump') => { if (b === 'jump') input.jumpEdge = true; else input.actionEdge = true; },
  teleport: (x, y, z, yaw) => { const p = G.p; Object.assign(p, PH.createPlayer(x, y, z, yaw ?? p.yaw)); p.grounded = false; p.hasDouble = cfg.doubleJump !== false; cam.fx = x; cam.fy = y; cam.fz = z; cam.groundY = y; if (yaw !== undefined) cam.yaw = yaw + Math.PI; },
  toCheckpoint: (i) => { const c = G.L.checkpoints[i]; P.game.teleport(c[0], c[1] + 0.1, c[2] + 1.2); },
  collectAll: () => { G.shards.forEach((s) => { if (!s.got && !s.loose) collectShard(s); }); G.W.solids.filter((s) => s.breakable && s.active).forEach((s) => breakSolid(s)); G.shards.forEach((s) => { if (!s.got) collectShard(s); }); G.relicsE.forEach((r) => { if (!r.got) { r.hidden = false; collectRelic(r); } }); return P.game.state(); },
  finish: () => { if (G.goal) { G.goal.hidden = false; P.game.teleport(G.goal.x, G.goal.y + 0.1, G.goal.z + 1); } return P.game.sim(0.2); },
  bossDaze: () => { if (G.boss) { G.boss.state = 'dazed'; G.boss.t = 0; G.boss.awake = true; G.boss.height = BS.BOSS.hDazed; $('#bossBar').classList.add('show'); } },
  bossStomp: () => { if (G.boss) { P.game.bossDaze(); landOn(G.bossSolid, true); } return G.boss?.hp; },
  cam: (yaw, pitch, dist) => { cam.yaw = yaw; if (pitch !== undefined) cam.pitch = pitch; if (dist !== undefined) cam.dist = dist; cam.manualT = -999; cam.intro = 0; },
  free: (pos, look) => { cam.free = pos ? { pos, look } : null; },
  hurt: () => hurtPlayer(G.p.x + 1, G.p.z),
  findNaN: () => { const out = []; scene.traverse((o) => { const a = o.geometry?.attributes?.position; if (!a) return; for (let i = 0; i < a.array.length; i++) if (!Number.isFinite(a.array[i])) { out.push((o.type || '') + ':' + (o.geometry.type || '') + ':' + a.count + ':' + (o.parent?.type || '')); break; } }); return out; },
  pause, resume, enterLevel, toHub, showResults: () => showResults(false, true),
  hideUI: (on = true) => { document.body.classList.toggle('shot', on); $('#hud').style.visibility = on ? 'hidden' : ''; $('#hint').style.visibility = on ? 'hidden' : ''; document.querySelector('.sd-corner').style.visibility = on ? 'hidden' : ''; $('#banner').style.visibility = on ? 'hidden' : ''; },
};
if (Q.get('autostart')) { const id = Q.get('autostart'); menu.hide(); enterLevel(LEVELS[id] ? id : 'meadow'); }
