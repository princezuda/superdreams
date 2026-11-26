// The Hollow Crown — boot, scene manager, input (smart cursor / touch), engine host, menus, saves, map, test hooks.
import { THREE, createRenderer, probe, startLoop, loadDream, initUI, settingsButton, sfx, store, settings, updateTweens, tween, ease, shake, flash, host as hostMsg, startMenu, Q } from '/shared/sd-kit.js';
import { makeMaterials, createPaintPipeline, skyNode, setSky, U, M, setGroundTexture } from './paint.js';
import { setSeason, S, Batch, groundMesh } from './props.js';
import { setCharMaterial, makeHuman, makeAnimal } from './actors.js';
import { SCENE_DEFS, paintGround, setBannerForNPCs } from './scenes.js';
import { Engine, newState } from './engine.js';
import { runOps } from './walk.js';
import { SCENES, ITEMS, CAST, DEEDS, WALKTHROUGH, CHAPTERS } from './story.js';
import { paintMap, MAP_SPOTS } from './icons.js';
import { NavArea } from './nav.js';
import { Particles, weather } from './fx.js';
import { UI } from './ui.js';

const DEFAULTS = { season: 'spring', heroName: 'Tamsin', narrator: 'cheeky', hintFreq: 'sometimes', difficulty: 'normal', colors: { banner: '#c8324a' } };
const OPTS_KEY = 'hollowcrown-opts', AUTO_KEY = 'hollowcrown-auto', SLOT_KEY = (i) => 'hollowcrown-slot-' + i;
const opts = Object.assign({ textSpeed: 'normal', fontSize: 'm', autoAdvance: true }, store.get(OPTS_KEY, {}));
const saveOpts = () => store.set(OPTS_KEY, opts);
const $ = (s) => document.querySelector(s);
const lmsg = (t, k) => { $('#lmsg').textContent = t; $('#lbarFill').style.width = Math.round(k * 100) + '%'; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let cfg, renderer, scene, camera, pipe, E, ui, hero, cur = null, curId = null, nav = null, lights, PN, PA, cam;
let fast = false; // solveAll / tests: skip waits and walking
const world = new THREE.Group();
const proxies = new THREE.Group(); // raycast-only hotspot boxes (never rendered)
const tmpV = new THREE.Vector3(), ray = new THREE.Raycaster(), ndc = new THREE.Vector2();

// ------------------------------------------------------------------ boot
async function boot() {
  lmsg('Mixing the paints…', 0.1);
  initUI({ vignette: false, grain: false });
  document.body.classList.add('fs-' + opts.fontSize);
  cfg = await loadDream(DEFAULTS, onLive);
  sanitize(cfg);
  if (Q.get('q') === 'low') settings.quality = 'low';
  renderer = await createRenderer({ toneMapping: 'aces', exposure: 1.05, shadows: !Q.has('noshadow') });
  lmsg('Stretching the canvas…', 0.3);
  makeMaterials(); setCharMaterial(() => M.char);
  scene = new THREE.Scene(); scene.add(world);
  scene.backgroundNode = skyNode();
  scene.fog = new THREE.Fog(0xf0dcc0, 25, 90);
  camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 600);
  lights = makeLights(scene);
  pipe = createPaintPipeline(renderer, scene, camera);
  PN = new Particles(scene, { count: 280 }); PA = new Particles(scene, { count: 200, additive: true });
  cam = probe(renderer, { counts: {}, game: hooks() });
  addEventListener('resize', fitCamera);
  E = new Engine(makeHost(), { narrator: cfg.narrator, difficulty: cfg.difficulty }); H = E.host;
  ui = new UI({
    anchorOf, fmt, opts: () => opts, state: () => E.s, itemName: (id) => E.itemName(id), sfx: (n) => sfx[n]?.(),
    onItem: itemClicked, onItemLook: (id) => { if (!E.busy) { ui.select(null); E.lookItem(id); } }, onItemHover: (id) => { hoverItem = id; },
    onSpeak: (who, on, dur) => { const a = actorOf(who); if (a) a.talkT = on ? Math.min(6, dur) : 0; if (cur) cur.ctx.speaking = on ? who : null; },
  });
  hero = makeHuman({ name: 'hero', skin: '#f2c8a6', hair: '#a8481e', hairStyle: 'fringe', hat: 'tinker', top: '#3e8a7a', sleeve: '#3e8a7a', bottom: '#5a4434', boots: '#4a2e1e', cape: cfg.colors.banner, capeLen: 0.62, tools: true, belt: '#6a4428', buckle: true, rig: {} });
  hero.speed = 2.5;
  settingsButton(`<button class="sd-btn sd-icon" id="hintBtn" aria-label="Hint" title="Hint (H)">?</button><button class="sd-btn sd-icon" id="mapBtn" aria-label="Map" title="Map (M)" style="display:none">🗺</button><button class="sd-btn sd-icon" id="menuBtn" aria-label="Menu" title="Menu (Esc)">☰</button>`);
  $('#hintBtn').onclick = (e) => { e.stopPropagation(); openHint(); };
  $('#mapBtn').onclick = (e) => { e.stopPropagation(); openMap(); };
  $('#menuBtn').onclick = (e) => { e.stopPropagation(); openPause(); };
  $('#mapClose').onclick = () => closeMap();
  bindInput();
  lmsg('Painting the kingdom…', 0.55);
  // title backdrop: the square, drifting
  await buildScene('square', 'start', { quiet: true });
  await renderer.compileAsync(scene, camera).catch(() => {});
  lmsg('Ready', 1);
  startLoop(renderer, step, () => pipe.render());
  $('#loading').classList.add('done');
  cam.dataReady = true;
  showTitle();
}

function sanitize(c) {
  if (!['spring', 'autumn', 'winter'].includes(c.season)) c.season = 'spring';
  if (!['cheeky', 'gentle'].includes(c.narrator)) c.narrator = 'cheeky';
  if (!['off', 'sometimes', 'often'].includes(c.hintFreq)) c.hintFreq = 'sometimes';
  if (!['easy', 'normal', 'hard'].includes(c.difficulty)) c.difficulty = 'normal';
  c.heroName = String(c.heroName || 'Tamsin').replace(/[<>{}]/g, '').trim().slice(0, 18) || 'Tamsin';
  if (!/^#[0-9a-f]{6}$/i.test(c.colors?.banner || '')) c.colors = { banner: '#c8324a' };
  setSeason(c.season); setBannerForNPCs(c.colors.banner);
}
async function onLive(c) {
  sanitize(c);
  const reb = c.season !== cfg.season || c.colors.banner !== cfg.colors.banner;
  cfg = c; E.cfg.narrator = c.narrator;
  if (reb && curId) { rebuildHero(); await buildScene(curId, null, { quiet: true, keepHero: true }); }
}
function rebuildHero() {
  const p = hero.root.position.clone(), f = hero.face;
  hero.root.parent?.remove(hero.root);
  hero = makeHuman({ name: 'hero', skin: '#f2c8a6', hair: '#a8481e', hairStyle: 'fringe', hat: 'tinker', top: '#3e8a7a', sleeve: '#3e8a7a', bottom: '#5a4434', boots: '#4a2e1e', cape: cfg.colors.banner, capeLen: 0.62, tools: true, belt: '#6a4428', buckle: true, rig: {} });
  hero.speed = 2.5; hero.root.position.copy(p); hero.face = hero.faceTarget = f;
}
const fmt = (t) => String(t ?? '').replaceAll('{name}', cfg.heroName);

// ------------------------------------------------------------------ lights (fixed count so materials never recompile between scenes)
function makeLights(sc) {
  const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x6b7a3a, 0.85);
  const key = new THREE.DirectionalLight(0xfff0d6, 2.4); key.castShadow = true;
  Object.assign(key.shadow.camera, { left: -15, right: 15, top: 12, bottom: -12, near: 1, far: 60 });
  key.shadow.mapSize.set(2048, 2048); key.shadow.radius = 3; key.shadow.bias = -0.0006; key.shadow.normalBias = 0.03;
  const rim = new THREE.DirectionalLight(0x9fc0ff, 1.0), amb = new THREE.AmbientLight(0xffffff, 0.14);
  const pts = [new THREE.PointLight(0xffaa55, 0, 6, 1.6), new THREE.PointLight(0xffaa55, 0, 6, 1.6)];
  sc.add(hemi, key, key.target, rim, amb, ...pts);
  return { hemi, key, rim, amb, pts };
}

// ------------------------------------------------------------------ scene manager
async function buildScene(id, entry, o = {}) {
  const def = SCENE_DEFS[id];
  // dispose the previous diorama
  world.remove(hero.root);
  const keep = new Set(Object.values(M));
  world.traverse((m) => { if (m.isMesh) { m.geometry?.dispose(); if (m.material && !keep.has(m.material)) { m.material.map?.dispose?.(); m.material.dispose(); } } });
  prevGroundTex?.dispose(); 
  world.clear(); proxies.clear(); PN.clear(); PA.clear();
  const epilogue = entry === 'epilogue';
  const env = def.env();
  setSky({ ...env.sky });
  scene.fog.color.set(env.fog[0]); scene.fog.near = env.fog[1]; scene.fog.far = env.fog[2];
  lights.hemi.color.set(env.hemi[0]); lights.hemi.groundColor.set(env.hemi[1]); lights.hemi.intensity = env.hemi[2] * (epilogue ? 1.1 : 1);
  lights.key.position.set(...env.key.pos); lights.key.color.set(env.key.col); lights.key.intensity = env.key.I; lights.key.target.position.set(0, 0, -2);
  lights.rim.position.set(...env.rim.pos); lights.rim.color.set(env.rim.col); lights.rim.intensity = env.rim.I; lights.amb.intensity = env.amb;
  lights.pts.forEach((p) => { p.intensity = 0; });
  // ground
  const gs = def.ground, gspec = gs.paint(); Object.assign(gspec, { W: gs.W, D: gs.D, cx: gs.cx, cz: gs.cz });
  const gt = paintGround(gspec); setGroundTexture(gt); prevGroundTex = gt;
  const g = groundMesh(gs.W, gs.D, gs.cx, gs.cz, gs.hf); g.material = M.ground; world.add(g);
  // context for the builder
  const B = new Batch(id.length * 7 + 3);
  const ctx = {
    B, world, S, banner: cfg.colors.banner, obj: {}, seed: 100, P: PN, PA, actors: {}, lightI: [0, 0], speaking: null, epilogue, walkKey: 'walk', anims: [],
    light(i, pos, col, I, dist) { const p = lights.pts[i]; p.position.set(...pos); p.color.set(col); p.intensity = I; p.distance = dist; ctx.lightI[i] = I; },
    flicker(i, base, t) { lights.pts[i].intensity = base * (0.86 + Math.sin(t * 13.1 + i) * 0.06 + Math.sin(t * 7.3) * 0.05 + Math.sin(t * 23.7) * 0.03); },
    setWalk(k) { if (ctx.walkKey !== k) { ctx.walkKey = k; nav = new NavArea(def[k] || def.walk, def.holes || []); } },
    animal(hid, kind, [x, z], ao = {}) {
      const a = makeAnimal(kind, { col: ao.col }); a.root.position.set(x, ao.y ?? 0, z); a.face = a.faceTarget = ao.face ?? 0; world.add(a.root);
      a.home = [x, z]; a.swim = ao.swim; a.wander = ao.wander; ctx.actors[hid] = a; ctx.anims.push(a); return a;
    },
    chickens(list) { list.forEach(([x, z], i) => { const a = makeAnimal('chicken', { col: i % 2 ? '#c87a3a' : '#f4ece0' }); a.root.position.set(x, 0, z); world.add(a.root); a.wander = [x, z, 1.2]; a.peck = true; ctx.anims.push(a); }); },
    extraDucks(list) { list.forEach(([x, z], i) => { const a = makeAnimal('duck', { head: i ? '#7a5a3a' : '#3a7a4a', col: i ? '#a8866a' : '#f4f0e6' }); a.root.position.set(x, 0.02, z); a.swim = [4.6, 2.2, 1.0 + i * 0.35]; a.phase = i * 2.5; world.add(a.root); ctx.anims.push(a); }); },
    smoke(list) { for (const [x, y, z] of list) for (let i = 0; i < 10; i++) PN.spawn({ x, y, z, vy: 0.45, vx: 0.16, size: 0.22, grow: 2.4, life: 3.2 + Math.random(), color: '#cfcac6', a: 0.18, fadeIn: 0.8, sway: 0.12, loop: (q) => { q.t = 0; q.x = x; q.y = y; q.z = z; q.vy = 0.5; q.vx = 0.18; } }).t = Math.random() * 3; },
    weather(box, d = 1) { if (!settings.reducedMotion) weather(PN, S.particles, box, d); },
    fireflies(box, n) { for (let i = 0; i < n; i++) { const q = PA.spawn({ x: box[0] + Math.random() * (box[3] - box[0]), y: box[1] + Math.random() * (box[4] - box[1]), z: box[2] + Math.random() * (box[5] - box[2]), size: 0.07, life: 2 + Math.random() * 3, color: '#f8ffa0', a: 0.9, sway: 0.4, fadeIn: 0.8, loop: (q2) => { q2.t = 0; q2.vx = (Math.random() - 0.5) * 0.3; q2.vy = (Math.random() - 0.5) * 0.2; } }); if (q) q.t = Math.random() * 2; } },
    gulls(n, box) { for (let i = 0; i < n; i++) { const a = makeAnimal('gull'); a.fly = { cx: box[0] + Math.random() * (box[3] - box[0]), cy: box[1] + Math.random() * (box[4] - box[1]), cz: box[2] + Math.random() * (box[5] - box[2]), r: 2 + Math.random() * 4, sp: 0.2 + Math.random() * 0.3, ph: Math.random() * 6 }; world.add(a.root); ctx.anims.push(a); } },
  };
  const built = def.build(ctx) || {};
  B.finish(world);
  nav = new NavArea(def.walk, def.holes || []);
  // NPCs
  const npcActors = {};
  for (const [nid, n] of Object.entries(def.npcs || {})) {
    const a = n.make(); a.root.position.set(n.at[0], n.y ?? 0, n.at[1]); a.face = a.faceTarget = n.face ?? 0; world.add(a.root);
    a.def = n; npcActors[nid] = a; ctx.actors[nid] = a;
  }
  if (epilogue) epilogueCrowd(ctx, npcActors);
  // hotspot proxies
  const pmat = new THREE.MeshBasicMaterial();
  const addProxy = (hid, h, kind) => { const m = new THREE.Mesh(new THREE.BoxGeometry(...h.s), pmat); m.position.set(...h.p); m.userData = { hid, kind, h, pri: h.pri ?? 1 }; proxies.add(m); return m; };
  for (const [hid, h] of Object.entries(def.hot)) if (SCENES[id].hot[hid]) addProxy(hid, h, 'hot');
  for (const [eid, h] of Object.entries(def.exits)) addProxy(eid, h, 'exit');
  for (const [nid, a] of Object.entries(npcActors)) { if (epilogue) continue; const hid = Object.keys(SCENES[id].hot).find((k) => SCENES[id].hot[k].npc === (nid === 'oak' ? 'oak' : nid)) || nid; const n = a.def; const m = addProxy(hid, { p: n.hot?.p ?? [n.at[0], 1.0, n.at[1]], s: n.hot?.s ?? [1.0, 2.1, 1.0], walk: n.walk, pri: 2 }, 'hot'); m.userData.actor = a; m.userData.yOff = n.hot ? n.hot.p[1] - (n.y ?? 0) : 1.0; }
  for (const [aid, a] of Object.entries(ctx.actors)) { if (npcActors[aid] || !def.hot[aid]) continue; const m = proxies.children.find((p) => p.userData.hid === aid); if (m) { m.userData.actor = a; m.userData.yOff = def.hot[aid].p[1] - a.root.position.y; } }
  // the hero is clickable too (use item on yourself)
  const hp = addProxy('hero', { p: [0, 0.9, 0], s: [0.8, 1.8, 0.8], pri: 0 }, 'hero'); hp.userData.actor = hero;
  proxies.updateMatrixWorld(true);
  // hero placement
  if (!o.keepHero) {
    const sp = def.spawn[entry] || def.spawn.start;
    hero.root.position.set(sp[0], 0, sp[1]); hero.face = hero.faceTarget = sp[2] ?? 0; hero.path = []; hero.state = 'idle';
  }
  if (!epilogue || true) world.add(hero.root);
  // camera
  camDef = def.cam; fitCamera();
  cur = { id, def, ctx, built, npcActors };
  curId = id;
  built.apply?.(E.s);
  cam.counts = { scene: id, hotspots: proxies.children.length, npcs: Object.keys(npcActors).length, items: E.s.inv.length, particles: PN.n + PA.n };
  if (!o.quiet) { ui.place2(SCENES[id].name, CHAPTERS[SCENES[id].chapter] ? CHAPTERS[SCENES[id].chapter].title : ''); hostMsg('scene', { scene: id }); }
}
function epilogueCrowd(ctx, npcActors) {
  const A = (fn, x, z, f) => { const a = fn(); a.root.position.set(x, 0, z); a.face = a.faceTarget = f; world.add(a.root); return a; };
  const D = SCENE_DEFS;
  const list = { mabel: [D.square.npcs.mabel.make, -4.2, -1.2, 0.6], brannoch: [D.square.npcs.brannoch.make, 3.6, -1.6, -0.5], hobb: [D.mill.npcs.hobb.make, -6.0, 0.4, 0.8], fennick: [D.woods.npcs.fennick.make, 5.6, 0.2, -0.7], granny: [D.glade.npcs.granny.make, -2.4, 0.8, 0.4], marlow: [D.cliffs.npcs.marlow.make, 2.0, 0.6, -0.4], corvin: [D.isle.npcs.corvin.make, 6.4, -2.6, -0.6] };
  for (const [k, [fn, x, z, f]] of Object.entries(list)) { const a = A(fn, x, z, f); ctx.actors[k] = a; npcActors[k] = a; a.def = { at: [x, z] }; }
  const q = npcActors.queen; if (q) { q.root.position.set(0, 0.6, -3.5); q.face = q.faceTarget = 0; }
}
let camDef = null, prevGroundTex = null;
function fitCamera() {
  if (!camDef) return;
  renderer.setSize(innerWidth, innerHeight);
  const asp = innerWidth / innerHeight; camera.aspect = asp;
  const [px, py, pz] = camDef.pos, [lx, ly, lz] = camDef.look;
  const dist = Math.hypot(px - lx, py - ly, pz - lz);
  let fov = camDef.fov;
  const needV = 2 * Math.atan(camDef.halfW / (dist * asp)) * 180 / Math.PI; // keep the stage's width in frame on narrow screens
  if (needV > fov) fov = Math.min(needV, 78);
  camera.fov = fov; camera.updateProjectionMatrix();
  camBase = { pos: new THREE.Vector3(px, py, pz), look: new THREE.Vector3(lx, ly - (fov - camDef.fov) * 0.035, lz) };
}
let camBase = null, par = { x: 0, y: 0, tx: 0, ty: 0 };

// ------------------------------------------------------------------ frame loop
let hoverDirty = true, hoverHit = null, hoverItem = null, pointer = { x: -999, y: -999, inside: false }, lastNudge = 0;
let lastNow = performance.now();
function step(dt, t) {
  const now = performance.now(); if (cam) cam.ft = Math.round(now - lastNow); lastNow = now;
  updateTweens(dt);
  if (camBase) {
    const rm = settings.reducedMotion; par.x += (par.tx - par.x) * (1 - Math.exp(-dt * 2)); par.y += (par.ty - par.y) * (1 - Math.exp(-dt * 2));
    const d = rm ? 0 : camDef.drift;
    camera.position.copy(camBase.pos).add(tmpV.set(Math.sin(t * 0.11) * d * 2 + par.x * 0.25, Math.sin(t * 0.083) * d * 0.6 - par.y * 0.12, 0));
    camera.lookAt(camBase.look.x + par.x * 0.08, camBase.look.y, camBase.look.z);
  }
  // hero movement along path
  moveHero(dt);
  hero.update(dt, t);
  if (cur) {
    for (const a of Object.values(cur.npcActors)) a.update(dt, t);
    for (const a of cur.ctx.anims) { animalIdle(a, dt, t); a.update(dt, t); }
    cur.built.update?.(dt, t);
    // proxies follow their actors
    for (const p of proxies.children) { const a = p.userData.actor; if (a) { p.position.set(a.root.position.x, a.root.position.y + (p.userData.yOff ?? 0.9), a.root.position.z); p.updateMatrixWorld(); } }
  }
  PN.update(dt, camera); PA.update(dt, camera);
  if (ui) {
    ui.place();
    if (hoverDirty && pointer.inside) { hoverDirty = false; updateHover(); }
  }
  // proactive hints (remix: hintFreq)
  if (E && playing && !ui.panelOpen) {
    const nudge = E.tick(dt, cfg.hintFreq);
    if (nudge) ui.toast(`<b>Narrator:</b> ${fmt(E.tone({ c: 'Psst. ', g: 'A gentle thought: ' }))}${fmt(nudge)}`, 6500);
  }
}
function animalIdle(a, dt, t) {
  if (a.swim) { const [cx, cz, r] = a.swim; const ang = t * 0.25 + a.phase; a.root.position.set(cx + Math.cos(ang) * r * 1.2, 0.02 + Math.sin(t * 3 + a.phase) * 0.01, cz + Math.sin(ang) * r * 0.85); a.faceTarget = -ang; if (a.animal === 'duck' && cur?.ctx.duckKey && a === cur.ctx.actors.duck) a.keyMesh ||= addDuckKey(a); if (a.keyMesh) a.keyMesh.visible = !!cur?.ctx.duckKey; return; }
  if (a.fly) { const f = a.fly, ang = t * f.sp + f.ph; a.root.position.set(f.cx + Math.cos(ang) * f.r, f.cy + Math.sin(t * 0.7 + f.ph) * 0.4, f.cz + Math.sin(ang) * f.r * 0.5); a.face = a.faceTarget = -ang + Math.PI; a.root.rotation.z = Math.sin(t * 8 + f.ph) * 0.1; return; }
  if (a.wander) {
    a.wt = (a.wt ?? Math.random() * 3) - dt;
    if (a.wt < 0) { a.wt = 2 + Math.random() * 4; const [hx, hz, r] = a.wander; a.goal = [hx + (Math.random() - 0.5) * r * 2, hz + (Math.random() - 0.5) * r]; }
    if (a.goal) { const dx = a.goal[0] - a.root.position.x, dz = a.goal[1] - a.root.position.z, d = Math.hypot(dx, dz); if (d > 0.05) { const s = Math.min(d, dt * 0.6); a.root.position.x += dx / d * s; a.root.position.z += dz / d * s; a.faceTarget = Math.atan2(dx, dz); } }
    if (a.peck) a.body.rotation.x = Math.max(0, Math.sin(t * 2.5 + a.phase)) ** 8 * 0.7;
  }
  if (a.animal === 'goat' && cur?.ctx.goatGlow) { a.glow ||= addGlow(a); }
}
function addDuckKey(a) { const B = new Batch(3); B.add(new THREE.BoxGeometry(0.16, 0.03, 0.04), '#ffd060', { y: 0.32, z: 0.4, mat: 'glow' }); const g = new THREE.Group(); B.finish(g); a.root.add(g); return g; }
function addGlow(a) { const B = new Batch(4); B.add(new THREE.SphereGeometry(0.06, 6, 4), '#9affd8', { y: 1.08, z: 0.3, mat: 'glow' }); const g = new THREE.Group(); B.finish(g); a.root.add(g); return g; }

function moveHero(dt) {
  if (!hero.path?.length) { if (hero.state === 'walk') { hero.state = 'idle'; const cb = hero.onArrive; hero.onArrive = null; cb?.(); } return; }
  const [tx, tz] = hero.path[0], p = hero.root.position, dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
  hero.state = 'walk';
  // a touch slower deeper in the scene so perspective doesn't make far walking look like sliding
  const sp = hero.speed * (0.8 + 0.2 * Math.min(1, Math.max(0, (p.z + 6) / 10))) * dt;
  if (d <= sp) { p.x = tx; p.z = tz; hero.path.shift(); }
  else { p.x += dx / d * sp; p.z += dz / d * sp; hero.faceTarget = Math.atan2(dx, dz); }
  hero.stepT = (hero.stepT ?? 0) + dt; if (hero.stepT > 0.34) { hero.stepT = 0; stepSound(); }
}
let stepAlt = false;
function stepSound() { if (fast) return; stepAlt = !stepAlt; sfx.click?.(); }
function walkHeroTo(x, z) {
  return new Promise((res) => {
    const target = nav.clamp([x, z]);
    if (fast) { hero.root.position.set(target[0], 0, target[1]); hero.path = []; res(); return; }
    const path = nav.path([hero.root.position.x, hero.root.position.z], target);
    if (Math.hypot(target[0] - hero.root.position.x, target[1] - hero.root.position.z) < 0.08) { res(); return; }
    hero.path = path; hero.onArrive = res;
  });
}

// ------------------------------------------------------------------ engine host
let playing = false;
function makeHost() {
  return {
    queue: [],
    narrate: (t) => ui.line('narrator', t),
    say: (who, t) => ui.line(who, t),
    choose: async (opts2, o) => {
      if (fast) { const want = H.queue.shift(); const hit = opts2.find((x) => x.id === want); return hit ? hit.id : (opts2.find((x) => x.id === 'bye') || opts2[0]).id; }
      return ui.choose(opts2);
    },
    walkTo: async (hid) => {
      const d = proxyDef(hid); if (!d) return;
      const w = d.walk ?? [d.p[0], d.p[2] + 1.2];
      await walkHeroTo(w[0], w[1]);
      faceHotspot(hid);
    },
    face: (hid) => faceHotspot(hid),
    anim: async (who, name, dur) => { if (fast) return; const a = actorOf(who); if (a) await a.play(name, dur ?? (name === 'pickup' ? 0.8 : 0.7)); },
    fx: (name, arg) => doFx(name, arg),
    sfx: (name) => { if (!fast) sfx[name]?.(); },
    wait: (sec) => (fast ? Promise.resolve() : sleep(sec * 1000)),
    refresh: () => { cur?.built.apply?.(E.s); ui.renderInv(); },
    loadScene: async (id, entry) => {
      if (!fast) { $('#fade').classList.add('on'); await sleep(460); }
      await buildScene(id, entry);
      if (!fast) { await renderer.compileAsync(scene, camera).catch(() => {}); $('#fade').classList.remove('on'); await sleep(200); }
      if (playing) autosave();
    },
    chapter: (n, c) => (fast ? null : ui.chapterCard(c)),
    death: (t) => { cam.deaths = (cam.deaths || 0) + 1; return ui.death(t); },
    deed: async (k, label) => { ui.toast(`✦ <b>Good deed</b> — ${label} <b>+10</b>`, 3600); if (!fast) { sfx.win?.(); flash('#fff4c8', 220); } },
    invChanged: (item, how) => { ui.renderInv(how === 'add' ? item : null); if (how === 'add' && !fast) { ui.toast(`You got: <b>${E.itemName(item)}</b>`, 2200); sfx.check?.(); } },
    unlockMap: () => { $('#mapBtn').style.display = ''; ui.toast('🗺 <b>The kingdom map</b> is unlocked — press <b>M</b> to travel quickly between places you have visited.', 5200); },
    tutorial: (k) => tutorial(k),
    epilogue: async () => { E.s.f.epilogueGo = true; if (!fast) { $('#fade').classList.add('on'); await sleep(900); } await buildScene('throne', 'epilogue'); if (!fast) $('#fade').classList.remove('on'); },
    theEnd: (sum) => endCard(sum),
    busy: (b) => { document.body.classList.toggle('busy', b); hoverDirty = true; },
    rewound: () => { cur?.built.apply?.(E.s); ui.renderInv(); ui.toast('↺ Rewound to just before. No harm done!', 2400); },
    autosave: () => autosave(),
    error: (e) => { cam.errors.push(String(e?.message || e)); },
  };
}
let H; // set in boot after creation
function proxyDef(hid) {
  const p = proxies.children.find((m) => m.userData.hid === hid); if (!p) return null; const h = p.userData.h; const a = p.userData.actor;
  if (a && a !== hero) {
    const fixed = a.def ? Math.hypot(a.root.position.x - a.def.at[0], a.root.position.z - a.def.at[1]) < 0.5 : !(a.wander || a.swim);
    const w = fixed && h.walk ? h.walk : [a.root.position.x + Math.sin(a.face) * 1.3, a.root.position.z + Math.cos(a.face) * 1.3];
    return { p: [a.root.position.x, a.root.position.y + 1, a.root.position.z], walk: w, face: h.face };
  }
  return h;
}
function faceHotspot(hid) { const d = proxyDef(hid); if (!d) return; const f = d.face ?? [d.p[0], d.p[2]]; hero.faceTarget = Math.atan2(f[0] - hero.root.position.x, f[1] - hero.root.position.z); }
function actorOf(who) { if (who === 'hero') return hero; if (!cur) return null; const map = { oak: null }; if (who in map) return map[who]; return cur.npcActors[who] || cur.ctx.actors[who] || null; }
function anchorOf(who) {
  let p = null;
  if (who === 'oak' && cur?.id === 'oak') p = tmpV.set(-1.5, 4.0, -2.0);
  else { const a = actorOf(who); if (a) { a.root.updateMatrixWorld(); p = a.headTop(); } }
  if (!p) return null;
  p.project(camera);
  if (p.z > 1) return null;
  return { x: (p.x * 0.5 + 0.5) * innerWidth, y: (-p.y * 0.5 + 0.5) * innerHeight - 6 };
}

// ------------------------------------------------------------------ effects
function doFx(name, arg) {
  if (fast || !cur) return;
  const at = (hid) => { const d = proxyDef(hid); return d ? d.p : [hero.root.position.x, 1.2, hero.root.position.z]; };
  const burst = (p, col, n = 24, o = {}) => { for (let i = 0; i < n; i++) PA.spawn({ x: p[0], y: p[1], z: p[2], vx: (Math.random() - 0.5) * (o.sp ?? 2.4), vy: Math.random() * (o.up ?? 2.4), vz: (Math.random() - 0.5) * (o.sp ?? 2.4), g: o.g ?? 2, size: o.size ?? 0.09, life: 0.6 + Math.random() * 0.6, color: Array.isArray(col) ? col[i % col.length] : col, a: 1 }); };
  if (name === 'sparkle') { burst(at(arg), ['#fff4b0', '#ffd27a', '#ffffff']); sfx.select?.(); }
  else if (name === 'crown') { const p = hero.root.position; burst([p.x, 1.9, p.z], ['#ff6a4a', '#6aff7a', '#6ac8ff', '#fff4b0'], 40, { up: 3 }); flash('#fff0d0', 200); shake(0.06); }
  else if (name === 'steam') { const p = at(arg); for (let i = 0; i < 40; i++) PN.spawn({ x: p[0] + (Math.random() - 0.5), y: p[1], z: p[2] + 0.6, vx: (Math.random() - 0.5) * 0.6, vy: 1 + Math.random() * 1.5, vz: 0.3, size: 0.4, grow: 2.5, life: 1.6 + Math.random(), color: '#f4f4f4', a: 0.55 }); shake(0.08); }
  else if (name === 'splash') { const p = at(arg); burst([p[0], 0.9, p[2]], ['#bfe8ff', '#ffffff'], 26, { up: 2, g: 6 }); }
  else if (name === 'keyfly') { const p = at('wheel'); burst([p[0], 1.2, p[2]], ['#ffd060', '#ffffff'], 18); setTimeout(() => burst([4.0, 0.4, 2.0], ['#bfe8ff', '#ffffff'], 22, { g: 6 }), 500); shake(0.1); }
  else if (name === 'crumbs') burst(at(arg), ['#e8c088', '#c89858'], 14, { up: 1, g: 5, size: 0.05 });
  else if (name === 'music') { const p = at(arg); for (let i = 0; i < 16; i++) setTimeout(() => PA.spawn({ x: p[0] + (Math.random() - 0.5), y: 0.6, z: p[2] + 0.8, vx: (Math.random() - 0.5) * 0.4, vy: 0.8, size: 0.16, life: 2.2, color: '#fff0c0', a: 0.9, sway: 0.5 }), i * 160); }
  else if (name === 'climb') { $('#fade').classList.add('on'); setTimeout(() => $('#fade').classList.remove('on'), 520); }
  else if (name === 'brambles') { shake(0.12); burst([6.2, 1, -1.4], S.leaf, 40, { sp: 3, up: 2 }); }
  else if (name === 'beam') { flash('#fff6d0', 380); shake(0.12); }
  else if (name === 'gate') { shake(0.05); sfx.thud?.(); }
  else if (name === 'row') { $('#fade').classList.add('on'); }
  else if (name === 'corvinDown') { burst([-3.2, 4.4, -4.1], ['#1a1c26', '#f4f4f0', '#20264a'], 26, { sp: 3, up: 1 }); }
  else if (name === 'finale') { const p = hero.root.position; burst([p.x, 2, p.z], ['#ff6a4a', '#6aff7a', '#6ac8ff', '#fff4b0', '#ffffff'], 120, { sp: 5, up: 5, g: 1 }); flash('#ffffff', 600); shake(0.2); tween(3.0, (k) => { U.sat.value = 0.96 + Math.sin(k * Math.PI) * 0.45; U.warmth.value = 0.05 + Math.sin(k * Math.PI) * 0.1; }); }
}

// ------------------------------------------------------------------ input: smart cursor, right-click look, touch long-press
function bindInput() {
  const cv = renderer.domElement;
  let downT = 0, lpTimer = null, longPressed = false, downPos = null;
  addEventListener('pointermove', (e) => { pointer.x = e.clientX; pointer.y = e.clientY; pointer.inside = true; ui.moveCursor(e.clientX, e.clientY); par.tx = (e.clientX / innerWidth - 0.5) * 2; par.ty = (e.clientY / innerHeight - 0.5) * 2; hoverDirty = true; if (e.pointerType !== 'mouse') document.body.classList.add('touch'); else document.body.classList.remove('touch'); });
  cv.addEventListener('pointerdown', (e) => {
    pointer.x = e.clientX; pointer.y = e.clientY; downT = performance.now(); downPos = [e.clientX, e.clientY]; longPressed = false;
    if (e.pointerType !== 'mouse') { clearTimeout(lpTimer); lpTimer = setTimeout(() => { longPressed = true; act(e.clientX, e.clientY, 'look'); }, 480); }
  });
  cv.addEventListener('pointerup', (e) => {
    clearTimeout(lpTimer);
    if (longPressed) return;
    if (e.button === 2) return;
    if (downPos && Math.hypot(e.clientX - downPos[0], e.clientY - downPos[1]) > 24) return;
    act(e.clientX, e.clientY, 'smart');
  });
  cv.addEventListener('contextmenu', (e) => { e.preventDefault(); act(e.clientX, e.clientY, 'look'); });
  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if ((k === ' ' || k === 'enter' || k === '.') && ui.showing()) { e.preventDefault(); ui.advance(); return; }
    if (k === 'escape' || k === 'p') { if (!$('#mapPanel').classList.contains('hidden')) closeMap(); else if (ui.panelOpen) closePanel(); else if (playing) openPause(); return; }
    if (!playing) return;
    if (k === 'h') openHint(); else if (k === 'm' && E.s.map) openMap(); else if (k === 'tab') { e.preventDefault(); revealHotspots(); }
    else if (k === 'f5') { e.preventDefault(); quickSave(); }
  });
}
function pickAt(x, y) {
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(proxies.children, false).filter((h) => h.object.userData.kind !== 'hot' || E.hotVisible(curId, h.object.userData.hid));
  if (!hits.length) return null;
  hits.sort((a, b) => (b.object.userData.pri - a.object.userData.pri) || (a.distance - b.distance));
  // the hero only wins if nothing else is under the cursor (or an item is selected)
  const best = hits.find((h) => h.object.userData.kind !== 'hero') ;
  if (ui.selected && hits.some((h) => h.object.userData.kind === 'hero') && (!best || best.object.userData.pri < 2)) return hits.find((h) => h.object.userData.kind === 'hero').object.userData;
  return (best || hits[0]).object.userData;
}
function groundAt(x, y) {
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  const t = -ray.ray.origin.y / ray.ray.direction.y; if (!(t > 0)) return null;
  return [ray.ray.origin.x + ray.ray.direction.x * t, ray.ray.origin.z + ray.ray.direction.z * t];
}
function verbFor(u) {
  if (u.kind === 'exit') return 'exit';
  if (u.kind === 'hero') return 'look';
  const h = SCENES[curId].hot[u.hid]; if (!h) return 'look';
  if (h.npc || (h.talk && !h.use)) return 'talk';
  if (h.use) return 'use';
  return 'look';
}
function updateHover() {
  if (!playing || ui.panelOpen) { ui.setCursor('walk', ''); return; }
  if (E.busy && !ui.showing()) { ui.setCursor('wait', ''); return; }
  if (ui.showing()) { ui.setCursor('walk', ''); return; }
  const u = pickAt(pointer.x, pointer.y);
  if (ui.selected) {
    const nm = E.itemName(ui.selected);
    if (u) { const tn = u.kind === 'hero' ? 'yourself' : E.hotName(curId, u.hid); ui.setCursor('item', `Use ${nm} on ${tn}`); }
    else ui.setCursor('item', `Use ${nm} on…`);
    return;
  }
  if (!u) { ui.setCursor('walk', ''); return; }
  const v = verbFor(u), name = u.kind === 'hero' ? fmt(cfg.heroName) : E.hotName(curId, u.hid);
  const label = v === 'exit' ? name : v === 'talk' ? `Talk to ${name}` : v === 'use' ? name : `Look at ${name}`;
  ui.setCursor(v === 'exit' ? 'exit' : v, label, u.h?.dir);
}
async function act(x, y, mode) {
  if (!playing || ui.panelOpen) return;
  if (ui.showing()) { ui.advance(); return; }
  if (E.busy) return;
  const u = pickAt(x, y);
  if (mode === 'look') {
    if (ui.selected) { ui.select(null); hoverDirty = true; return; }
    if (u) { sfx.click?.(); if (u.kind === 'hero') await E.interact('hero', 'look'); else await E.interact(u.hid, 'look'); }
    return;
  }
  if (ui.selected) {
    const item = ui.selected; ui.select(null);
    if (u) { sfx.select?.(); await E.interact(u.kind === 'hero' ? 'hero' : u.hid, 'use', item); }
    else { const g = groundAt(x, y); if (g) walkClick(g); }
    hoverDirty = true; return;
  }
  if (!u) { const g = groundAt(x, y); if (g) walkClick(g); return; }
  const v = verbFor(u); sfx.click?.();
  if (v === 'exit') await E.interact(u.hid, 'walk');
  else if (u.kind === 'hero') await E.interact('hero', 'look');
  else await E.interact(u.hid, v);
  hoverDirty = true;
}
function walkClick(g) { ripple(g); walkHeroTo(g[0], g[1]); }
function ripple(g) { for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; PA.spawn({ x: g[0] + Math.cos(a) * 0.15, y: 0.05, z: g[1] + Math.sin(a) * 0.15, vx: Math.cos(a) * 0.8, vz: Math.sin(a) * 0.8, size: 0.06, life: 0.4, color: '#fff4c8', a: 0.8 }); } }
function itemClicked(id) {
  if (!playing || E.busy || ui.showing()) return;
  if (ui.selected && ui.selected !== id) { const a = ui.selected; ui.select(null); E.combine(a, id); return; }
  if (ui.selected === id) { ui.select(null); hoverDirty = true; return; }
  sfx.select?.(); ui.select(id); hoverDirty = true;
  tutorial('selected');
}
function revealHotspots() {
  const W = innerWidth, Hh = innerHeight;
  for (const p of proxies.children) {
    const u = p.userData; if (u.kind === 'hero' || (u.kind === 'hot' && !E.hotVisible(curId, u.hid))) continue;
    const v = p.position.clone().project(camera); if (v.z > 1) continue;
    const d = document.createElement('div'); d.className = 'htoast'; d.style.cssText = `position:fixed;left:${(v.x * 0.5 + 0.5) * W}px;top:${(-v.y * 0.5 + 0.5) * Hh}px;transform:translate(-50%,-50%);z-index:12;pointer-events:none;padding:5px 10px;font-size:13px`;
    d.textContent = u.kind === 'exit' ? '➜ ' + E.hotName(curId, u.hid) : E.hotName(curId, u.hid); document.body.appendChild(d);
    setTimeout(() => { d.style.transition = 'opacity .5s'; d.style.opacity = '0'; setTimeout(() => d.remove(), 520); }, 1800);
  }
}
const TUT = {
  talk: '<b>Click</b> people and things to talk to them or use them. <b>Right-click</b> (or <b>long-press</b>) to look. Click the ground to walk. <b>Tab</b> shows what you can interact with.',
  inventory: 'Your items live in the bar below. <b>Click an item</b>, then click something in the world to use it there — or on another item to combine them.',
  selected: 'Now click something to use it on — or another item to combine. Right-click to put it away.',
  combine: 'Tip: stones belong in the Crown. Select one item, then click another in the bar to combine them.',
};
const tutSeen = store.get('hollowcrown-tut', {});
function tutorial(k) { if (fast || tutSeen[k] || !TUT[k]) return; tutSeen[k] = true; store.set('hollowcrown-tut', tutSeen); ui.tutorial(TUT[k], 8000); }

// ------------------------------------------------------------------ title, pause, saves, options, hints, map, end
function showTitle() {
  document.body.classList.remove('playing');
  const hasAuto = !!store.get(AUTO_KEY);
  const m = startMenu({
    title: 'The Hollow Crown',
    subtitle: 'A fairy-tale adventure. Wrenfold\'s crown woke up hollow — its three heart-stones stolen in the night. Only the royal tinker can bring them home.',
    options: [{ key: 'difficulty', label: 'Story difficulty', value: cfg.difficulty, choices: [{ v: 'easy', label: 'Bedtime Story' }, { v: 'normal', label: 'Fairy Tale' }, { v: 'hard', label: 'Grim & Riddly' }] }],
    startLabel: 'New Game',
    onStart: (vals) => { newGame(vals.difficulty); },
  });
  const row = m.el.querySelector('#sd-start').parentElement;
  if (hasAuto) { const b = document.createElement('button'); b.className = 'sd-btn'; b.id = 'continueBtn'; b.textContent = 'Continue'; b.onclick = () => { m.hide(); sfx.select(); loadState(store.get(AUTO_KEY).state); }; row.prepend(b); }
  const lb = document.createElement('button'); lb.className = 'sd-btn'; lb.textContent = 'Load'; lb.onclick = () => openSaves('load', () => {}); row.appendChild(lb);
  const note = document.createElement('p'); note.style.cssText = 'font-size:13px;margin:14px 0 0'; note.innerHTML = 'Click to walk &amp; act · Right-click / long-press to look · Tab reveals hotspots · H hint · M map · Esc menu'; m.el.querySelector('.sd-card').appendChild(note);
  titleMenu = m;
}
let titleMenu = null;
async function newGame(diff) {
  E.s = newState({ difficulty: diff });
  E.s.difficulty = diff; cfg.difficulty = diff;
  playing = true; document.body.classList.add('playing'); ui.renderInv();
  hostMsg('start', { mode: diff });
  await E.boot();
}
async function loadState(st) {
  E.load(st); playing = true; document.body.classList.add('playing'); ui.renderInv();
  $('#mapBtn').style.display = E.s.map ? '' : 'none';
  if (E.s.ended) E.s.ended = false;
  await E.boot();
}
function autosave() { if (!playing || fast) return; store.set(AUTO_KEY, { state: E.serialize(), meta: meta() }); }
function meta() { return { scene: SCENES[E.s.scene].name, chapter: E.s.chapter, time: Math.round(E.s.time), date: Date.now(), score: E.score() }; }
function quickSave() { store.set(SLOT_KEY(1), { state: E.serialize(), meta: meta() }); ui.toast('Saved to slot 1'); }
const fmtTime = (s) => `${Math.floor(s / 60)}m ${String(Math.floor(s % 60)).padStart(2, '0')}s`;
function openPause() {
  if (!playing) return;
  ui.panel(`<h2>Paused</h2><div class="prow" style="flex-direction:column;align-items:stretch">
    <button class="hbtn primary" data-a="resume">Resume</button><button class="hbtn" data-a="save">Save game</button><button class="hbtn" data-a="load">Load game</button>
    <button class="hbtn" data-a="opts">Text &amp; options</button><button class="hbtn" data-a="settings">Settings (sound, motion, graphics)</button><button class="hbtn" data-a="deeds">Good deeds</button><button class="hbtn" data-a="quit">Quit to title</button></div>
    <p style="text-align:center;font-size:.85em;opacity:.75">${SCENES[E.s.scene].name} · ${CHAPTERS[E.s.chapter]?.sub ?? ''} · ${fmtTime(E.s.time)}</p>`, (p) => {
    p.querySelectorAll('[data-a]').forEach((b) => b.onclick = () => {
      sfx.click(); const a = b.dataset.a;
      if (a === 'resume') closePanel(); else if (a === 'save') openSaves('save'); else if (a === 'load') openSaves('load'); else if (a === 'opts') openOptions();
      else if (a === 'settings') { closePanel(); document.getElementById('sd-gear').click(); }
      else if (a === 'deeds') openDeeds(); else if (a === 'quit') { closePanel(); autosave(); location.reload(); }
    });
  });
}
function closePanel() { ui.closePanel(); hoverDirty = true; }
function openSaves(mode) {
  const rows = [0, 1, 2, 3].map((i) => {
    const k = i === 0 ? AUTO_KEY : SLOT_KEY(i), d = store.get(k);
    const info = d ? `<b>${d.meta.scene}</b><br>${CHAPTERS[d.meta.chapter]?.sub ?? ''} · ${fmtTime(d.meta.time)} · kindness ${d.meta.score}<br><span style="opacity:.7">${new Date(d.meta.date).toLocaleString()}</span>` : '<i>Empty</i>';
    const btn = mode === 'save' ? (i === 0 ? '' : `<button class="hbtn" data-s="${i}">Save here</button>`) : (d ? `<button class="hbtn primary" data-l="${i}">Load</button>` : '');
    return `<div class="slotrow"><div class="sinfo">${i === 0 ? '<span class="tier">Autosave</span><br>' : `<span class="tier">Slot ${i}</span><br>`}${info}</div>${btn}</div>`;
  }).join('');
  ui.panel(`<h2>${mode === 'save' ? 'Save game' : 'Load game'}</h2>${rows}<div class="prow"><button class="hbtn" data-a="back">Back</button></div>`, (p) => {
    p.querySelectorAll('[data-s]').forEach((b) => b.onclick = () => { store.set(SLOT_KEY(+b.dataset.s), { state: E.serialize(), meta: meta() }); sfx.check(); ui.toast('Game saved'); openSaves('save'); });
    p.querySelectorAll('[data-l]').forEach((b) => b.onclick = () => { const i = +b.dataset.l; const d = store.get(i === 0 ? AUTO_KEY : SLOT_KEY(i)); closePanel(); titleMenu?.hide(); sfx.select(); loadState(d.state); });
    p.querySelector('[data-a=back]').onclick = () => (playing ? openPause() : closePanel());
  });
}
function openOptions() {
  const seg = (key, vals) => `<div class="seg" data-k="${key}">${vals.map(([v, l]) => `<button data-v="${v}" class="${String(opts[key]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  ui.panel(`<h2>Text &amp; options</h2>
    <div class="optrow"><span>Text speed</span>${seg('textSpeed', [['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast'], ['instant', 'Instant']])}</div>
    <div class="optrow"><span>Font size</span>${seg('fontSize', [['s', 'S'], ['m', 'M'], ['l', 'L'], ['xl', 'XL']])}</div>
    <div class="optrow"><span>Auto-advance text</span>${seg('autoAdvance', [['true', 'On'], ['false', 'Off (click)']])}</div>
    <p style="font-size:.85em;opacity:.75">Subtitles are always on — every word in Wrenfold is written down.</p>
    <div class="prow"><button class="hbtn primary" data-a="back">Done</button></div>`, (p) => {
    p.querySelectorAll('.seg').forEach((sg) => sg.querySelectorAll('button').forEach((b) => b.onclick = () => {
      const k = sg.dataset.k; let v = b.dataset.v; if (k === 'autoAdvance') v = v === 'true'; opts[k] = v; saveOpts(); sfx.click();
      sg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      if (k === 'fontSize') { document.body.classList.remove('fs-s', 'fs-m', 'fs-l', 'fs-xl'); document.body.classList.add('fs-' + v); }
    }));
    p.querySelector('[data-a=back]').onclick = () => openPause();
  });
}
function openDeeds() {
  const sm = E.summary();
  ui.panel(`<h2>Good deeds</h2><p style="text-align:center">Kindness: <b>${sm.score}</b> of ${sm.max}. Entirely optional — Wrenfold just likes to keep count.</p><ul class="deeds">${sm.deeds.map((d) => `<li class="${d.done ? '' : 'no'}">${d.done ? '✦ ' + d.label : '✧ ???'}</li>`).join('')}</ul><div class="prow"><button class="hbtn primary" data-a="back">Back</button></div>`, (p) => { p.querySelector('[data-a=back]').onclick = () => openPause(); });
}
function openHint() {
  if (!playing || E.busy) return;
  const render = (h) => {
    const tiers = ['', 'A nudge', 'A clue', 'The answer'];
    ui.panel(`<h2>The Narrator Leans In</h2><div class="tier">${tiers[h.tier] || ''}</div><div class="hinttext">${fmt(h.text)}</div>
      <div class="prow">${h.more ? `<button class="hbtn" data-a="more" ${h.wait > 0 ? 'disabled' : ''}>${h.wait > 0 ? `More help in ${Math.ceil(h.wait)}s…` : (h.tier === 2 ? 'Just tell me the answer' : 'A bigger hint, please')}</button>` : ''}<button class="hbtn primary" data-a="close">Thanks!</button></div>`, (p) => {
      p.querySelector('[data-a=close]').onclick = () => closePanel();
      const m = p.querySelector('[data-a=more]'); if (m) m.onclick = () => { sfx.click(); render(E.moreHint()); };
      if (h.wait > 0) setTimeout(() => { if (ui.panelOpen && p.querySelector('[data-a=more]')) render(E.hint()); }, Math.min(1000, h.wait * 1000));
    });
  };
  sfx.select(); render(E.hint());
}
let mapSpots = [];
function openMap() {
  if (!playing || !E.s.map || E.busy) return;
  const c = $('#mapCanvas'); mapSpots = paintMap(c, E.s, curId, cfg.season);
  $('#mapPanel').classList.remove('hidden'); ui.panelOpen = true; sfx.whoosh?.();
  c.onclick = (e) => {
    const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * c.width, y = (e.clientY - r.top) / r.height * c.height;
    const hit = mapSpots.find((s) => Math.hypot(s.x - x, s.y - y) < 48);
    if (!hit) return;
    if (!hit.known) { ui.toast('You haven\'t been there yet.'); return; }
    if (hit.id === curId) { closeMap(); return; }
    if (hit.id === 'isle') { ui.toast('Only a boat can reach Magpie Isle.'); return; }
    if (['woods', 'glade', 'oak', 'cliffs', 'cove'].includes(hit.id) && !E.s.f.gateOpen) { ui.toast('The East Gate is still shut.'); return; }
    closeMap(); E.travel(hit.id);
  };
}
function closeMap() { $('#mapPanel').classList.add('hidden'); ui.panelOpen = false; hoverDirty = true; }
async function endCard(sum) {
  hostMsg('end', { win: true, score: sum.score });
  const title = sum.score >= 100 ? 'Heart of the Crown' : sum.score >= 70 ? "The Kingdom's Darling" : sum.score >= 40 ? 'A Friend of Wrenfold' : 'A Tinker of Few Words';
  if (fast) { cam.ended = sum; return; }
  await sleep(600);
  ui.panel(`<h2>The End</h2><p style="text-align:center;font-style:italic">…and they all lived happily ever after, give or take a spoon.</p>
    <p style="text-align:center">Kindness: <b>${sum.score}</b> of ${sum.max} — <b>${title}</b><br>Time: ${fmtTime(sum.time)} · Hints used: ${sum.hints}</p>
    <ul class="deeds">${sum.deeds.map((d) => `<li class="${d.done ? '' : 'no'}">${d.done ? '✦ ' + d.label : '✧ (a kindness left undone)'}</li>`).join('')}</ul>
    <div class="prow"><button class="hbtn primary" data-a="new">Play again</button><button class="hbtn" data-a="stay">Stay a while</button></div>`, (p) => {
    p.querySelector('[data-a=new]').onclick = () => { store.set(AUTO_KEY, null); location.reload(); };
    p.querySelector('[data-a=stay]').onclick = () => closePanel();
  });
  sfx.win();
}

// ------------------------------------------------------------------ test hooks (window.__cam.game)
function hooks() {
  return {
    goto: async (id, entry = 'map') => { if (!SCENE_DEFS[id]) return false; playing = true; document.body.classList.add('playing'); titleMenu?.hide(); E.s.visited[id] = true; await E.run(() => E.enter(id, entry)); return true; },
    give: (item) => { if (!ITEMS[item]) return false; E.G.give(item); ui.renderInv(); return true; },
    set: (flag, v = true) => { E.s.f[flag] = v; cur?.built.apply?.(E.s); },
    state: () => JSON.parse(JSON.stringify(E.s)),
    scene: () => curId,
    hint: () => E.hint(),
    fast: (v = true) => { fast = v; ui.auto = v; },
    start: (diff = 'normal') => { titleMenu?.hide(); return newGame(diff); },
    solveAll: async () => {
      fast = true; ui.auto = true; titleMenu?.hide();
      E.s = newState({ difficulty: cfg.difficulty }); playing = true; document.body.classList.add('playing');
      await E.boot();
      const probs = await runOps(E, WALKTHROUGH, H);
      fast = false; ui.auto = false;
      return { problems: probs, ended: E.s.ended, score: E.score(), scene: curId, errors: cam.errors.slice() };
    },
    walkthrough: () => WALKTHROUGH,
    runOps: async (ops) => { fast = true; ui.auto = true; const p = await runOps(E, ops, H); fast = false; ui.auto = false; return p; },
    view: async (id, flags = {}) => { Object.assign(E.s.f, flags); playing = false; titleMenu?.hide(); await buildScene(id, 'start', { quiet: true }); await renderer.compileAsync(scene, camera).catch(() => {}); return true; },
    hero: (x, z, f) => { hero.root.position.set(x, 0, z); if (f != null) hero.face = hero.faceTarget = f; },
    say: (who, text) => { ui.line(who, text); },
  };
}

boot().catch((e) => { console.error(e); window.__bootError = String(e.stack || e); window.__cam && window.__cam.errors.push(String(e.stack || e)); $('#lmsg').textContent = 'Something went wrong: ' + e.message; });
