// Apex Drift — boot, menus, race flow (intro → countdown → race → results → podium), Grand Prix + Time Trial,
// chase camera, effects/audio routing, pause, save, remix config, probe + headless test hooks.
import { THREE, createRenderer, createPipeline, autoResize, probe, startLoop, initUI, startMenu, settingsButton, toast, store, loadDream, settings, updateTweens, shake, applyShake, flash, host, Q, sfx } from '/shared/sd-kit.js';
import { TRACKS, TRACK_ORDER, CUPS, RIVALS, POINTS, trackKey } from './tracks.js';
import { buildTrack, poseAt, rank, catchUp, ghostRecorder, ghostPush, ghostSample, encodeGhost, decodeGhost, awardPoints, standingsOrder, fmtTime } from './logic.js';
import { createCar, placeCar, stepCar, aiDrive, makeAI, collideCars, updateDraft, BASE } from './physics.js';
import { Atmosphere, loadTextures } from './env.js';
import { buildWorld } from './world.js';
import { Fleet } from './car.js';
import { FX } from './fx.js';
import { RaceAudio, sx } from './audio.js';
import { Input } from './input.js';
import { HUD, ORD, esc } from './hud.js';

const $ = (s) => document.querySelector(s);
const bootFill = $('#bootFill'), bootMsg = $('#bootMsg');
const progress = (k, m) => { bootFill.style.width = Math.round(k * 100) + '%'; if (m) bootMsg.textContent = m; };

// ---------------------------------------------------------------- config, prefs, save
const DEFAULTS = { difficulty: 'normal', laps: 3, rivals: 5, catchup: 'subtle', colors: { car: '#ff4d2e', accent: '#ffffff', boost: '#38c8ff' }, snow: true, fov: 66, startTrack: 'coast' };
const DIFF = { easy: { skill: 0.885, lat: 0.82 }, normal: { skill: 0.955, lat: 0.9 }, hard: { skill: 1.0, lat: 0.95 } };
const CATCH = { off: 0, subtle: 0.05, strong: 0.1 };
const PAINTS = ['#ff4d2e', '#ffd21f', '#19c37d', '#1f8bff', '#8a4dff', '#ff3ea5', '#f2f4f8', '#20232c'];
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window || Q.has('touch');
const prefs = Object.assign({ camera: 'chase', autoAccel: isTouch, tilt: false, units: 'kmh', hints: true, assist: false, mode: 'gp', track: null, cup: 'sunset', mirror: false, paint: null }, store.get('apexdrift-prefs', {}));
const savePrefs = () => store.set('apexdrift-prefs', prefs);
const save = Object.assign({ best: {}, race: {}, medals: {}, cups: {}, gp: null, tutorial: false, races: 0 }, store.get('apexdrift-save', {}));
const persist = () => store.set('apexdrift-save', save);
const ghostKey = (k) => 'apexdrift-ghost-' + k;
const medalTimes = (T) => ({ apex: T.L / 47.6, gold: T.L / 45.6, silver: T.L / 42.5, bronze: T.L / 38.5 });
const MEDAL_NAMES = { apex: 'Apex', gold: 'Gold', silver: 'Silver', bronze: 'Bronze' };

let cfg;
function sanitize(c) {
  if (!DIFF[c.difficulty]) c.difficulty = 'normal'; if (!(c.catchup in CATCH)) c.catchup = 'subtle'; if (!TRACKS[c.startTrack]) c.startTrack = 'coast';
  c.laps = Math.max(1, Math.min(5, Math.round(+c.laps || 3))); c.rivals = Math.max(0, Math.min(5, Math.round(+c.rivals ?? 5))); c.fov = Math.max(55, Math.min(85, +c.fov || 66));
  for (const k of ['car', 'accent', 'boost']) if (!/^#[0-9a-f]{6}$/i.test(c.colors?.[k] || '')) c.colors[k] = DEFAULTS.colors[k];
  return c;
}

// ---------------------------------------------------------------- game state
const G = {
  phase: 'boot', paused: false, mode: 'single', trackId: 'coast', reverse: false, T: null, world: null, worldKey: '', cars: [], player: null, order: [],
  time: 0, startTime: 0, phaseT: 0, laps: 3, bestLap: Infinity, ghost: null, ghostRec: null, ghostPos: null, autopilot: false, prefs,
  cup: null, raceIdx: 0, standings: null, results: null, finishedAt: 0, countGo: false, pressT: -1, startBoost: 0, lastPos: 0, tutorial: null,
};
let renderer, scene, camera, post, atm, fleet, fx, hud, input, raceAudio;
const camS = { pos: new THREE.Vector3(), look: new THREE.Vector3(), yaw: 0, fov: 66, kick: 0, roll: 0 };
const V = new THREE.Vector3();

async function boot() {
  progress(0.05, 'Starting renderer');
  renderer = await createRenderer({ toneMapping: 'aces', exposure: 1.0 });
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(66, innerWidth / innerHeight, 0.1, 4000);
  post = createPipeline(renderer, scene, camera, { bloom: { strength: 0.5, radius: 0.5, threshold: 0.86 } });
  autoResize(renderer, camera);
  initUI({ vignette: true, grain: true });
  cfg = sanitize(await loadDream(DEFAULTS, (c) => applyLive(sanitize(c))));
  if (prefs.paint && !Q.get('dream') && !Q.get('redream')) cfg.colors.car = prefs.paint;
  atm = new Atmosphere(scene, renderer);
  progress(0.12, 'Loading textures');
  await loadTextures((k) => progress(0.12 + k * 0.3));
  fx = new FX(scene); hud = new HUD(); input = new Input(prefs); raceAudio = new RaceAudio();
  input.buildTouch(document.body);
  settingsButton();
  $('#hPause').onclick = () => togglePause(true);
  probe(renderer, { counts: {}, game: hooks() });
  progress(0.45, 'Building ' + TRACKS[prefs.track || cfg.startTrack].name);
  await setupTrack(prefs.track || cfg.startTrack, false, { menu: true });
  buildMenu();
  G.phase = 'menu';
  startLoop(renderer, step, () => post.render());
  window.__cam.dataReady = true;
  $('#boot').classList.add('hide');
  host('ready');
  addEventListener('visibilitychange', () => { if (document.hidden && G.phase === 'race' && !G.paused) togglePause(true); });
  if (Q.get('autostart')) startRace({ mode: Q.get('autostart'), trackId: Q.get('track') || 'coast', reverse: Q.has('mirror') });
}

function applyLive(c) {
  const old = cfg; cfg = c;
  fleet?.cars[0]?.paint.uPaint.value.set(c.colors.car); fleet?.cars[0]?.paint.uAccent.value.set(c.colors.accent); fleet?.uBoost.value.set(c.colors.boost);
  if (G.world?.snow) G.world.snow.visible = c.snow;
  if (old.startTrack !== c.startTrack && G.phase === 'menu') setupTrack(c.startTrack, false, { menu: true });
  updateMenuSwatches?.();
}

// ---------------------------------------------------------------- track + cars setup
async function setupTrack(trackId, reverse, { menu = false, mode = 'single', rivals = cfg.rivals, gridOrder = null } = {}) {
  const def = TRACKS[trackId]; const key = trackKey(trackId, reverse);
  showLoading(def.name);
  await new Promise((r) => setTimeout(r, 30));
  const T = buildTrack(def, { reverse });
  if (G.worldKey !== key) {
    G.world?.dispose();
    G.world = buildWorld(T, def.theme, { seed: trackId.length * 101 + (reverse ? 7 : 0) });
    scene.add(G.world.group); atm.apply(def.theme); fx.setTheme(def.theme); G.worldKey = key;
    if (G.world.snow) G.world.snow.visible = cfg.snow;
  }
  fx.reset();
  G.T = T; G.trackId = trackId; G.reverse = reverse; G.theme = def.theme;
  // cars: player + rivals
  fleet?.dispose(); fleet = new Fleet(scene); fleet.uBoost.value.set(cfg.colors.boost);
  const nR = mode === 'tt' ? 0 : rivals; const D = DIFF[cfg.difficulty]; const cupSkill = G.cup ? CUPS[G.cup].skill : 1;
  const cars = [];
  const player = createCar({ id: 'you', name: 'You', isPlayer: true }); player.color = cfg.colors.car; cars.push(player);
  for (let k = 0; k < nR; k++) {
    const r = RIVALS[k]; const c = createCar({ id: r.name.toLowerCase(), name: r.name });
    c.ai = makeAI(T, { skill: r.skill * D.skill * cupSkill, bias: r.bias, aggro: r.aggro, latMax: BASE.latMax * D.lat * (cupSkill > 1 ? 1.02 : 1) }); c.color = r.color; c.boost = 0.25; cars.push(c);
  }
  // grid: staggered two-wide behind the line. Player starts 5th (GP races 2+: reverse standings)
  let order = gridOrder ? gridOrder.map((id) => cars.find((c) => c.id === id)).filter(Boolean) : cars.slice(1);
  if (!gridOrder) { const slot = Math.min(4, order.length); order.splice(slot, 0, player); }
  for (const c of cars) if (!order.includes(c)) order.push(c);
  order.forEach((c, k) => placeCar(c, T, poseAt(T, T.L - 12 - k * 7.5, k % 2 ? 3.3 : -3.3)));
  for (const c of cars) { const v = fleet.add(c.color, c.isPlayer ? cfg.colors.accent : '#14161c'); v.car = c; }
  G.cars = cars; G.player = player; G.order = order.slice();
  if (!menu) G.world.gantry.setLights(0, false);
  hideLoading();
  return T;
}
function showLoading(name) { const l = $('#loading'); l.querySelector('b').textContent = name; l.classList.add('show'); }
function hideLoading() { $('#loading').classList.remove('show'); }

// ---------------------------------------------------------------- race flow
async function startRace({ mode = 'single', trackId = 'coast', reverse = false, gridOrder = null } = {}) {
  G.mode = mode; G.phase = 'loading'; menu.hide(); closeResults(); hud.show(false);
  try { await setupTrack(trackId, reverse, { mode, gridOrder }); } catch (e) { console.error(e); hideLoading(); toast('Could not load the track: ' + e.message, 4000); window.__cam.errors.push(String(e)); toMenu(); return; }
  G.laps = mode === 'tt' ? Math.max(3, cfg.laps) : cfg.laps;
  G.time = 0; G.startTime = 0; G.phaseT = 0; G.finishedAt = 0; G.results = null; G.countGo = false; G.pressT = -1; G.autopilot = !!G.autopilotLock; G.lastPos = 0;
  const key = trackKey(trackId, reverse);
  G.bestLap = save.best[key] ?? Infinity;
  const gh = decodeGhost(store.get(ghostKey(key))); G.ghost = gh; fleet.setGhost(mode === 'tt' && !!gh); G.ghostRec = ghostRecorder(); G.ghostPos = null;
  hud.setup(G.T, G.cars, G.laps, mode); hud.show(true);
  input.showTouch(isTouch || input.lastDevice === 'touch');
  G.phase = 'intro'; G.introT = 0;
  const def = TRACKS[trackId];
  const title = G.cup ? `${CUPS[G.cup].name} · Race ${G.raceIdx + 1}/3` : mode === 'tt' ? 'Time Trial' : 'Single Race';
  hud.banner(`<small>${esc(title)}</small><b>${esc(def.name)}${reverse ? ' <em>Mirror</em>' : ''}</b><span>${esc(def.place)} · ${G.laps} laps</span>`, 'intro', 2800);
  G.tutorial = prefs.hints && !save.tutorial ? { step: 0, drifted: false, boosted: false } : null;
  if (prefs.assist) ensureAssist();
  host('start', { mode, track: trackId });
}
function beginCountdown() {
  G.phase = 'countdown'; G.phaseT = 0; G.lightsLit = 0;
  const d = input.lastDevice;
  if (G.tutorial) hud.hint('go', d === 'touch' ? 'Hold <b>GAS</b> just before the lights go green for a rocket start' : d === 'gamepad' ? 'Squeeze <b>RT</b> just before the lights go green for a rocket start' : 'Hold <b>W / ↑</b> just before the lights go green for a rocket start');
  if (G.mode === 'tt') { const m = medalTimes(G.T); const best = G.bestLap; const next = ['bronze', 'silver', 'gold', 'apex'].find((k) => !(best <= m[k])); hud.sub(next ? `Next medal: <b>${MEDAL_NAMES[next]}</b> ${fmtTime(m[next])}${isFinite(best) ? ` · Your best ${fmtTime(best)}` : ''}` : `All medals earned · Best ${fmtTime(best)}`, 3800); }
}
function go() {
  G.phase = 'race'; G.startTime = G.time; G.countGo = true; G.world.gantry.setLights(5, true); hud.count('GO!', true); sx.beep(true);
  const p = G.player; const dt = G.pressT < 0 ? -1 : G.time - G.pressT;
  if (G.pressT >= 0 && dt <= 0.55) { p.boostT = 1.0; hud.sub('<b>ROCKET START!</b>', 1400); sx.sling(2); shake(0.08); }
  else if (G.pressT >= 0 && dt > 1.3) { G.startBog = 0.7; hud.sub('Too early — wheelspin', 1400); }
  for (const c of G.cars) if (c.ai && Math.random() < 0.45 * c.ai.skill) c.boostT = 0.5 + Math.random() * 0.4; // rivals' launches vary
  hud.hint('go', null);
  setTimeout(() => G.world?.gantry.setLights(0, false), 1500);
}

function playerInput(dt) {
  const raw = input.poll(dt);
  if (raw.pause && (G.phase === 'race' || G.phase === 'countdown' || G.phase === 'intro')) togglePause(!G.paused);
  if (raw.camera) { prefs.camera = { chase: 'far', far: 'hood', hood: 'chase' }[prefs.camera]; savePrefs(); toast('Camera: ' + prefs.camera); }
  G.lookBack = raw.look;
  if (G.phase === 'intro' && (raw.throttle || raw.drift || raw.boost || raw.brake)) G.introSkip = true;
  const p = G.player; let inp = raw;
  if (G.autopilot || p.finished) { p.apAI ??= makeAI(G.T, { skill: 1, latMax: BASE.latMax * 0.9 }); inp = aiDrive(p, G.T, G.cars, dt, G.apIn || (G.apIn = {}), p.apAI); }
  else if (prefs.assist && p.ai0) {
    const a = aiDrive(p, G.T, G.cars, dt, G.asIn || (G.asIn = {}), p.ai0);
    inp = Object.assign({}, raw, { steer: raw.steer * 0.65 + a.steer * 0.35 });
    if (p.vF > p.ai0.prof[(p.loc.i + 6) % G.T.n] * 1.08 && !raw.drift) { inp.throttle = 0; inp.brake = Math.max(raw.brake, 0.4); }
  }
  if (raw.reset && G.phase === 'race' && !p.finished) resetToTrack(p);
  return inp;
}
function resetToTrack(c) {
  const pose = poseAt(G.T, c.loc.s - 6, Math.max(-3, Math.min(3, c.loc.d * 0.4)));
  c.x = pose.x; c.z = pose.z; c.y = pose.y; c.yaw = pose.yaw; c.vx = Math.sin(pose.yaw) * 8; c.vz = Math.cos(pose.yaw) * 8; c.yawRate = 0; c.drift = 0;
  if (c.isPlayer) { flash('#ffffff', 220, 0.35); sx.lost(); }
}

const FIXED = 1 / 120;
function simulate(dt) {
  const T = G.T, cars = G.cars, racing = G.phase === 'race' || G.phase === 'finished';
  const pin = playerInput(dt); const p = G.player;
  if (G.phase === 'countdown') { if (pin.throttle > 0.5) { if (G.pressT < 0) G.pressT = G.time; } else G.pressT = -1; }
  if (!racing) return;
  // AI inputs + catch-up
  const strength = CATCH[cfg.catchup] * (G.mode === 'tt' ? 0 : 1);
  const raceFrac = Math.max(0, Math.min(1, p.dist / (T.L * G.laps)));
  for (const c of cars) {
    if (!c.ai) continue;
    c.rubber = c.finished ? 1 : catchUp(p.finished ? 0 : p.dist - c.dist, strength, raceFrac);
    c.inp = aiDrive(c, T, cars, dt, c.inp || {});
    if (c.finished) { c.inp.throttle = Math.min(c.inp.throttle, 0.4); c.inp.boost = false; }
  }
  if (G.startBog > 0) { G.startBog -= dt; pin.throttle *= 0.35; }
  p.inp = pin;
  // fixed sub-steps keep physics identical across frame rates (and in sim())
  G.acc = (G.acc || 0) + dt; let n = 0;
  while (G.acc >= FIXED && n < 12) {
    for (const c of cars) { c.braking = (c.inp?.brake || 0) > 0.1 && c.vF > 1; stepCar(c, c.inp || {}, T, FIXED, { time: G.time }); }
    collideCars(cars, G.time); G.acc -= FIXED; n++;
  }
  if (n === 12) G.acc = 0;
  updateDraft(cars, dt);
  // ghost record / replay (lap clock)
  if (p.lap.lap >= 1 && !p.finished) {
    const lt = G.time - p.lap.lapStart; ghostPush(G.ghostRec, lt, p.x, p.y, p.z, p.yaw);
    if (G.mode === 'tt' && G.ghost) { const o = G.gs || (G.gs = {}); const ok = ghostSample(G.ghost.frames, lt, o); G.ghostPos = ok ? o : null; fleet.ghostPose(G.ghostPos); }
  }
  for (const c of cars) handleEvents(c);
  G.order = rank(cars);
  const pos = G.order.indexOf(p) + 1;
  if (G.lastPos && pos !== G.lastPos && G.phase === 'race') (pos < G.lastPos ? sx.overtake : sx.lost)();
  G.lastPos = pos;
  if (G.tutorial) tutorial();
  if (p.wrongT > 1.2 && !p.finished) hud.hint('wrong', '<b class="warn">WRONG WAY</b> — turn around or press <b>R</b> / <b>Y</b> to reset'); else hud.hint('wrong', null);
  if (G.phase === 'finished') {
    G.finishedAt += dt;
    const allDone = cars.every((c) => c.finished);
    if ((allDone && G.finishedAt > 2.5) || G.finishedAt > 9) showResults();
  }
}

function handleEvents(c) {
  const isP = c.isPlayer, near = isP || Math.hypot(c.x - camera.position.x, c.z - camera.position.z) < 60;
  for (const e of c.events) {
    switch (e.type) {
      case 'wall': if (near) { fx.burst(c.x + (isP ? 0 : 0), c.y + 0.5, c.z, -c.loc.nx * e.side, -c.loc.nz * e.side, Math.min(30, 6 + e.impact * 2)); if (isP) { sx.wall(e.impact); shake(Math.min(0.5, e.impact * 0.035)); if (e.impact > 10) flash('#ff5a3a', 160, 0.25); } } break;
      case 'bump': if (near) { fx.burst((c.x), c.y + 0.6, c.z, 0, 0, 8, [4, 3, 1.5]); if (isP) { sx.bump(); shake(0.12); } } break;
      case 'tier': if (isP) { sx.tier(e.tier); } break;
      case 'sling': if (isP) { sx.sling(e.tier); camS.kick = Math.max(camS.kick, 4 + e.tier * 2); hud.sub(['', 'Mini boost', 'Super boost', '<b>ULTRA BOOST</b>'][e.tier], 900); } break;
      case 'driftEnd': if (isP && G.tutorial) G.tutorial.drifted = G.tutorial.drifted || e.t > 0.6; break;
      case 'boostOn': if (isP) { sx.boost(); shake(0.06); camS.kick = Math.max(camS.kick, 7); if (G.tutorial) G.tutorial.boosted = true; } break;
      case 'lap': onLap(c, e); break;
      case 'start': break;
    }
  }
  c.events.length = 0;
}

function onLap(c, e) {
  const finishedRace = c.lap.lap > G.laps;
  if (finishedRace && !c.finished) { c.finished = true; c.finishTime = G.time; }
  if (!c.isPlayer) return;
  const lt = e.time; const key = trackKey(G.trackId, G.reverse);
  const prevBest = G.bestLap; const isBest = lt < prevBest;
  if (isBest) {
    G.bestLap = lt; save.best[key] = lt; persist();
    store.set(ghostKey(key), encodeGhost(G.ghostRec.f, lt));
    if (G.mode === 'tt') { G.ghost = decodeGhost(store.get(ghostKey(key))); fleet.setGhost(true); }
  }
  G.ghostRec = ghostRecorder();
  const delta = isFinite(prevBest) ? lt - prevBest : null;
  const cls = delta == null ? '' : delta < 0 ? (settings.colorblind ? 'cb-good' : 'good') : (settings.colorblind ? 'cb-bad' : 'bad');
  const dtxt = delta == null ? '' : `<em class="${cls}">${delta < 0 ? '−' : '+'}${Math.abs(delta).toFixed(3)}</em>`;
  if (G.mode === 'tt') { const m = medalTimes(G.T); const got = ['apex', 'gold', 'silver', 'bronze'].find((k) => lt <= m[k]); if (got) { const ord = ['bronze', 'silver', 'gold', 'apex']; const prev = save.medals[key]; if (!prev || ord.indexOf(got) > ord.indexOf(prev)) { save.medals[key] = got; persist(); hud.sub(`<b>${MEDAL_NAMES[got]} medal!</b>`, 2400); sfx.win(); } } }
  if (finishedRace) { onPlayerFinish(); return; }
  hud.banner(`<small>LAP ${c.lap.lap - 1}</small><b>${fmtTime(lt)}</b>${dtxt}${isBest && isFinite(prevBest) ? '<span>NEW BEST LAP</span>' : ''}`, 'lap', 2200);
  (isBest && isFinite(prevBest) ? sx.best : sx.lap)();
  if (c.lap.lap === G.laps) setTimeout(() => { hud.banner('<b>FINAL LAP</b>', 'final', 1600); sx.finalLap(); }, 1200);
}

function onPlayerFinish() {
  const p = G.player; G.phase = 'finished'; G.finishedAt = 0;
  const pos = rank(G.cars).indexOf(p) + 1;
  hud.banner(`<small>FINISH</small><b>${ORD(pos).toUpperCase()}</b><span>${fmtTime(p.finishTime - G.startTime)}</span>`, 'finish', 3200);
  sx.finish(pos); if (pos === 1) flash('#ffe28a', 300, 0.35);
  if (G.tutorial) { save.tutorial = true; persist(); G.tutorial = null; hud.hint(null); }
  save.races++; persist();
}

function finalizeResults() {
  // unfinished cars get an estimated time from their remaining distance and pace
  const total = G.T.L * G.laps;
  for (const c of G.cars) if (!c.finished) { c.finished = true; c.estimated = true; c.finishTime = G.time + Math.max(0, total - c.dist) / Math.max(25, Math.abs(c.vF)); }
  const order = rank(G.cars);
  return order.map((c, i) => ({ id: c.id, name: c.name, color: c.color, isPlayer: c.isPlayer, pos: i + 1, time: c.finishTime - G.startTime, best: c.lap.best, est: !!c.estimated }));
}

function showResults() {
  if (G.phase === 'podium') return;
  const res = G.results = finalizeResults(); G.phase = 'podium'; G.phaseT = 0; hud.show(false); input.showTouch(false); raceAudio.silence();
  const key = trackKey(G.trackId, G.reverse); const me = res.find((r) => r.isPlayer);
  if (G.mode !== 'tt' && (!save.race[key] || me.time < save.race[key].time)) { save.race[key] = { time: me.time, pos: me.pos }; persist(); }
  let gpHtml = '', buttons = '';
  if (G.mode === 'gp') {
    awardPoints(G.standings, res.map((r) => r.id), POINTS);
    const ord = standingsOrder(G.standings); const last = G.raceIdx >= CUPS[G.cup].tracks.length - 1;
    gpHtml = `<div class="r-gp"><div class="sd-label">${esc(CUPS[G.cup].name)} standings ${last ? '· FINAL' : `· after race ${G.raceIdx + 1}/3`}</div>` + ord.map((id, i) => { const c = G.cars.find((x) => x.id === id); return `<div class="r-row${id === 'you' ? ' me' : ''}"><b>${i + 1}</b><i style="background:${c?.color}"></i><span>${esc(c?.name || id)}</span><em>${G.standings[id].pts} pts</em></div>`; }).join('') + '</div>';
    if (last) {
      const place = ord.indexOf('you') + 1; const prev = save.cups[G.cup];
      if (!prev || place < prev) save.cups[G.cup] = place;
      save.gp = null; persist();
      gpHtml = `<div class="r-trophy t${Math.min(4, place)}">${place <= 3 ? ['🏆', '🥈', '🥉'][place - 1] : '🏁'}<b>${place <= 3 ? ORD(place) + ' in the ' + esc(CUPS[G.cup].name) : 'Cup complete — ' + ORD(place)}</b>${G.cup === 'sunset' && place <= 3 ? '<span>Mirror Cup unlocked — every track, reversed.</span>' : ''}</div>` + gpHtml;
      buttons = `<button class="sd-btn primary" data-a="menu">Back to menu</button><button class="sd-btn" data-a="replaycup">Race the cup again</button>`;
    } else {
      save.gp = { cup: G.cup, idx: G.raceIdx + 1, standings: G.standings }; persist();
      buttons = `<button class="sd-btn primary" data-a="next">Next race ▶</button><button class="sd-btn" data-a="menu">Save &amp; quit</button>`;
    }
  } else buttons = `<button class="sd-btn primary" data-a="retry">Race again</button><button class="sd-btn" data-a="menu">Menu</button>`;
  const rows = res.map((r) => `<div class="r-row${r.isPlayer ? ' me' : ''}"><b>${r.pos}</b><i style="background:${r.color}"></i><span>${esc(r.name)}</span><em>${r.pos === 1 ? fmtTime(r.time) : (r.est ? '~' : '+') + (r.time - res[0].time).toFixed(3)}</em><small>${isFinite(r.best) ? 'best ' + fmtTime(r.best) : ''}</small>${G.mode === 'gp' ? `<u>+${POINTS[r.pos - 1] ?? 0}</u>` : ''}</div>`).join('');
  let tt = '';
  if (G.mode === 'tt') { const m = medalTimes(G.T); const md = save.medals[key]; tt = `<div class="r-medals">${['bronze', 'silver', 'gold', 'apex'].map((k) => `<span class="${G.bestLap <= m[k] ? 'on' : ''} m-${k}">${MEDAL_NAMES[k]}<br><small>${fmtTime(m[k])}</small></span>`).join('')}</div><p class="r-note">Best lap ${fmtTime(G.bestLap)}${md ? ' · ' + MEDAL_NAMES[md] + ' medal' : ''} · your fastest lap is saved as the ghost.</p>`; }
  const title = G.mode === 'tt' ? 'Time Trial' : `${ORD(me.pos)} place`;
  const el = $('#results'); el.innerHTML = `<div class="sd-card r-card"><div class="sd-label">${esc(TRACKS[G.trackId].name)}${G.reverse ? ' · Mirror' : ''}</div><h1>${title}</h1>${G.mode === 'tt' ? tt : `<div class="r-list">${rows}</div>`}${gpHtml}<div class="sd-row">${buttons}</div></div>`;
  el.classList.add('show');
  el.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => { sfx.click(); resultAction(b.dataset.a); }));
  setupPodium(G.mode === 'gp' && G.raceIdx >= CUPS[G.cup].tracks.length - 1 ? standingsOrder(G.standings) : res.map((r) => r.id));
  host('end', { mode: G.mode, pos: me.pos, time: me.time });
}
function closeResults() { $('#results').classList.remove('show'); if (G.podium) { G.podium.removeFromParent(); G.podium = null; } }
function resultAction(a) {
  closeResults();
  if (a === 'retry') startRace({ mode: G.mode, trackId: G.trackId, reverse: G.reverse });
  else if (a === 'next') { G.raceIdx++; nextCupRace(); }
  else if (a === 'replaycup') startCup(G.cup);
  else toMenu();
}

// ---------------------------------------------------------------- grand prix
function startCup(cup, resume = null) {
  G.cup = cup; G.raceIdx = resume ? resume.idx : 0; G.standings = resume ? resume.standings : {};
  nextCupRace();
}
function nextCupRace() {
  const [trackId, rev] = CUPS[G.cup].tracks[G.raceIdx];
  // grid: race 1 — you start 5th; later races — reverse standings (leader starts last)
  let gridOrder = null;
  if (G.raceIdx > 0 && G.standings) { gridOrder = standingsOrder(G.standings).reverse(); }
  startRace({ mode: 'gp', trackId, reverse: rev, gridOrder });
}

// ---------------------------------------------------------------- podium
function setupPodium(ids) {
  const T = G.T, s = 34, pose = poseAt(T, s, 0); const g = new THREE.Group(); g.position.set(pose.x, pose.y, pose.z); g.rotation.y = pose.yaw + Math.PI;
  const mat = new THREE.MeshStandardNodeMaterial({ color: 0xe9ecf4, roughness: 0.35, metalness: 0.2 });
  const top = new THREE.MeshStandardNodeMaterial({ color: 0xff3d6e, roughness: 0.4, emissive: new THREE.Color(0.25, 0.02, 0.08) });
  const H = [1.6, 1.1, 0.75], X = [0, -3.4, 3.4];
  ids.slice(0, 3).forEach((id, i) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(3.2, H[i], 5.6), mat); b.position.set(X[i], H[i] / 2, 0); b.castShadow = b.receiveShadow = true; g.add(b);
    const t = new THREE.Mesh(new THREE.BoxGeometry(3.25, 0.08, 5.65), top); t.position.set(X[i], H[i] + 0.04, 0); g.add(t);
  });
  scene.add(g); G.podium = g; g.updateMatrixWorld();
  // put the top-3 cars on the blocks facing the camera; park everyone else out of view
  G.cars.forEach((c, k) => { const V0 = fleet.cars[k]; const i = ids.slice(0, 3).indexOf(c.id); V0.hidden = i < 0; if (i < 0) return;
    const w = new THREE.Vector3(X[i], H[i] + 0.02, 0).applyMatrix4(g.matrixWorld); c.x = w.x; c.y = w.y; c.z = w.z; c.yaw = g.rotation.y + Math.PI + (i === 0 ? 0 : i === 1 ? 0.35 : -0.35); c.vx = c.vz = 0; c.vF = 0; c.yawRate = 0; c.drift = 0; c.boosting = false; c.hop = 0; c.loc.grade = 0; });
  fleet.ghostPose(null);
  const w0 = new THREE.Vector3(0, H[0] + 2, 0).applyMatrix4(g.matrixWorld);
  fx.confetti(w0.x, w0.y + 3, w0.z, 160); G.podiumCtr = w0; G.podiumYaw = g.rotation.y;
  setTimeout(() => G.podium && fx.confetti(w0.x, w0.y + 4, w0.z, 120), 1400);
}

// ---------------------------------------------------------------- tutorial (first race only, contextual)
function tutorial() {
  const t = G.tutorial, p = G.player, T = G.T, d = input.lastDevice;
  const K = d === 'touch' ? { drift: 'DRIFT', boost: 'BOOST', reset: 'pause → reset' } : d === 'gamepad' ? { drift: 'A / RB', boost: 'X / LB', reset: 'Y' } : { drift: 'SPACE', boost: 'SHIFT', reset: 'R' };
  if (t.step === 0 && G.phase === 'race') {
    let kk = 0; for (let o = 0; o < 40; o++) kk = Math.max(kk, Math.abs(T.k[(p.loc.i + o) % T.n]));
    if (kk > 1 / 70) { hud.hint('drift', `Corner ahead — hold <b>${K.drift}</b> while steering to <b>drift</b>. Drifting charges your boost.`); t.step = 1; t.t0 = G.time; }
  } else if (t.step === 1 && (t.drifted || G.time - t.t0 > 14)) { hud.hint('drift', null); t.step = 2; }
  else if (t.step === 2 && p.boost > 0.3) { hud.hint('boost', `Boost charged — press <b>${K.boost}</b> on a straight to <b>boost</b>.`); t.step = 3; t.t0 = G.time; }
  else if (t.step === 3 && (t.boosted || G.time - t.t0 > 10)) { hud.hint('boost', null); t.step = 4; t.t0 = G.time; }
  else if (t.step === 4 && G.time - t.t0 > 4) { hud.hint('draft', 'Tuck in behind a rival to <b>slipstream</b> — extra speed and boost charge.'); t.step = 5; t.t0 = G.time; }
  else if (t.step === 5 && G.time - t.t0 > 6) { hud.hint('draft', null); t.step = 6; }
}

// ---------------------------------------------------------------- camera
const lerpA = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
function updateCamera(dt) {
  const p = G.player, T = G.T; if (!p) return;
  const gAt = (x, z) => G.world.groundAt(x, z);
  let fov = cfg.fov;
  const menuView = G.phase === 'menu' || G.phase === 'loading' || G.phase === 'boot';
  if (menuView !== G.menuOffset) { G.menuOffset = menuView; if (!menuView) camera.clearViewOffset(); }
  if (menuView) { const w = innerWidth, h = innerHeight; if (w > 640) camera.setViewOffset(w, h, -w * 0.2, 0, w, h); else camera.setViewOffset(w, h, 0, h * 0.24, w, h); }
  if (menuView) {
    const t = G.time * 0.06, c = poseAt(T, T.L - 30, 0); const r = 26;
    camS.pos.set(c.x + Math.sin(t) * r, c.y + 7 + Math.sin(t * 0.7) * 2, c.z + Math.cos(t) * r); camS.look.set(c.x, c.y + 1, c.z);
  } else if (G.phase === 'intro') {
    const k = Math.min(1, G.introT / 3.0), e = k * k * (3 - 2 * k); const a = poseAt(T, (p.loc.s + 60 - 70 * e + T.L) % T.L, 0);
    const side = 1 - e; camS.pos.set(a.x + Math.cos(a.yaw) * 20 * side - Math.sin(p.yaw) * 7 * e, a.y + 14 * side + 2.6 * e + 1.5, a.z - Math.sin(a.yaw) * 20 * side - Math.cos(p.yaw) * 7 * e);
    camS.look.set(p.x * e + a.x * (1 - e), p.y + 1, p.z * e + a.z * (1 - e)); camS.yaw = p.yaw;
  } else if (G.phase === 'podium') {
    const c = G.podiumCtr, t = G.phaseT; const yaw = G.podiumYaw + Math.PI + Math.sin(t * 0.25) * 0.45;
    camS.pos.set(c.x + Math.sin(yaw) * 15, c.y + 2.6 + Math.sin(t * 0.3) * 0.6, c.z + Math.cos(yaw) * 15); camS.look.set(c.x, c.y - 0.6, c.z); fov = 50;
  } else {
    const sp = Math.hypot(p.vx, p.vz); const velYaw = sp > 4 ? Math.atan2(p.vx, p.vz) : p.yaw;
    let tgt = p.vF > 1 ? lerpA(p.yaw, velYaw, 0.6) : p.yaw; if (G.lookBack) tgt += Math.PI;
    camS.yaw = lerpA(camS.yaw, tgt, Math.min(1, dt * (G.lookBack ? 20 : 4.2)));
    const mode = G.lookBack ? 'chase' : prefs.camera;
    if (mode === 'hood') {
      const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
      camS.pos.set(p.x + fx * 0.2, p.y + 1.2, p.z + fz * 0.2); camS.look.set(p.x + fx * 30, p.y + 0.9, p.z + fz * 30); fov += 6;
    } else {
      const far = mode === 'far'; const dist = (far ? 10 : 6.7) + sp * 0.03, h = (far ? 3.7 : 2.3) + sp * 0.005;
      V.set(p.x - Math.sin(camS.yaw) * dist, p.y + h, p.z - Math.cos(camS.yaw) * dist);
      V.y = Math.max(V.y, gAt(V.x, V.z) + 1.2, p.y + 1.1);
      const k = 1 - Math.exp(-dt * 16); camS.pos.lerp(V, G.camSnap ? 1 : k); G.camSnap = false;
      camS.look.set(p.x + Math.sin(camS.yaw) * 4, p.y + 1.15, p.z + Math.cos(camS.yaw) * 4);
    }
    fov += settings.reducedMotion ? 0 : Math.min(12, sp * 0.11) + camS.kick;
    camS.roll += ((settings.reducedMotion ? 0 : -p.driftAng * 0.06) - camS.roll) * Math.min(1, dt * 4);
  }
  camS.kick = Math.max(0, camS.kick - dt * 9);
  // keep the horizontal field of view sane in portrait
  const asp = innerWidth / innerHeight; if (asp < 1.25) fov = Math.max(fov, Math.min(98, 2 * Math.atan(Math.tan((fov * 0.62) * Math.PI / 180) / asp) * 180 / Math.PI));
  camS.fov += (fov - camS.fov) * Math.min(1, dt * 6);
  camera.position.copy(camS.pos); camera.lookAt(camS.look); if (G.phase === 'race' || G.phase === 'finished') camera.rotateZ(camS.roll);
  if (Math.abs(camera.fov - camS.fov) > 0.01) { camera.fov = camS.fov; camera.updateProjectionMatrix(); }
}

// ---------------------------------------------------------------- per-frame
let fxClock = 0;
function step(dt) {
  if (G.paused) { updateTweens(dt); raceAudio.update(G.player, null, false, dt); return; }
  G.time += dt; G.phaseT += dt; updateTweens(dt);
  if (G.phase === 'intro') { G.introT += dt; if (G.introT > 3.0 || G.introSkip) { G.introSkip = false; beginCountdown(); } }
  if (G.phase === 'countdown') {
    const lit = Math.min(5, Math.floor(G.phaseT / 0.6));
    if (lit !== G.lightsLit && lit > 0) { G.lightsLit = lit; G.world.gantry.setLights(lit, false); sx.beep(false); if (lit === 1) hud.count('3'); if (lit === 3) hud.count('2'); if (lit === 5) hud.count('1'); }
    if (G.phaseT >= 3.6) go();
  }
  if (G.T && G.phase !== 'boot') {
    if (G.phase === 'menu' || G.phase === 'podium' || G.phase === 'loading') { if (G.phase !== 'podium') input.poll(dt); }
    else simulate(dt);
  }
  if (!G.T) return;
  fleet.sync(G.cars, dt, { reducedMotion: settings.reducedMotion });
  carFx(dt);
  fx.update(dt); G.world.update(dt, G.time);
  updateCamera(dt); applyShake(camera, dt);
  atm.follow(G.phase === 'podium' ? G.podiumCtr : G.player || camera.position);
  const racing = G.phase === 'race' || G.phase === 'countdown' || G.phase === 'finished';
  raceAudio.update(G.player, G.player?.inp, racing || G.phase === 'intro', dt);
  if (racing || G.phase === 'intro') { hud.update(G); hud.updateTags(G, camera, project); }
  const P = window.__cam; P.counts = { cars: G.cars.length, phase: G.phase, lap: G.player?.lap.lap ?? 0, pos: G.order.indexOf(G.player) + 1, kmh: Math.round(Math.abs(G.player?.vF || 0) * 3.6) };
  fxClock += dt;
}
const PV = new THREE.Vector3();
function project(x, y, z) { PV.set(x, y, z).project(camera); if (PV.z > 1) return null; return { x: (PV.x * 0.5 + 0.5) * innerWidth, y: (-PV.y * 0.5 + 0.5) * innerHeight, z: PV.z }; }

// tyre smoke, dust, drift sparks and skid marks, from rear-wheel contact points
const TIER_COL = [null, [0.6, 1.8, 5], [5, 2.2, 0.5], [3.6, 0.9, 5.4]];
function carFx(dt) {
  if (G.phase === 'podium' || G.phase === 'menu') return;
  for (const c of G.cars) {
    const near = c.isPlayer || Math.hypot(c.x - camera.position.x, c.z - camera.position.z) < 90; if (!near) continue;
    const fx_ = Math.sin(c.yaw), fz_ = Math.cos(c.yaw), rx = -fz_, rz = fx_;
    const sliding = c.drift || Math.abs(c.vR) > 4.5; const sp = Math.abs(c.vF);
    for (const sd of [-1, 1]) {
      const wx = c.x - fx_ * 1.38 + rx * 0.85 * sd, wz = c.z - fz_ * 1.38 + rz * 0.85 * sd;
      fx.skid(c.id + sd, wx, c.y, wz, (sliding || (c.braking && sp > 18)) && !c.offroad && sp > 6, c.drift ? 0.55 : 0.35);
      const rate = (c.isPlayer ? 16 : 7) * dt;
      if ((sliding && sp > 8) || (c.offroad && sp > 10)) if (Math.random() < rate) fx.puff(wx, c.y + 0.35, wz, c.vx * 0.3, c.vz * 0.3, c.offroad ? 1.3 : 1, c.offroad ? 0.4 : 0.32);
      if (c.drift && c.tier > 0 && Math.random() < (c.isPlayer ? 22 : 8) * dt) { const k = TIER_COL[c.tier]; fx.spark(wx, c.y + 0.15, wz, -fx_ * 3 + (Math.random() - 0.5) * 4, 1 + Math.random() * 2.5, -fz_ * 3 + (Math.random() - 0.5) * 4, k[0], k[1], k[2], 0.35); }
    }
  }
}

// ---------------------------------------------------------------- pause, menu
function togglePause(on) {
  if (on === G.paused) return; G.paused = on; $('#pause').classList.toggle('show', on); sfx.click();
  if (on) raceAudio.silence(); input.showTouch(!on && (isTouch || input.lastDevice === 'touch') && G.phase !== 'podium');
}
function toMenu() {
  G.paused = false; $('#pause').classList.remove('show'); closeResults(); hud.show(false); input.showTouch(false); G.cup = null; raceAudio.silence();
  G.phase = 'menu'; for (const v of fleet?.cars || []) v.hidden = false;
  if (G.T) { G.cars.forEach((c, k) => placeCar(c, G.T, poseAt(G.T, G.T.L - 12 - k * 7.5, k % 2 ? 3.3 : -3.3))); }
  fleet?.setGhost(false); refreshMenu(); menu.show(); hud.hint(null);
}
let menu, updateMenuSwatches, refreshMenu;
function buildMenu() {
  menu = startMenu({
    title: 'APEX DRIFT', subtitle: 'Drift to charge boost · slipstream your rivals · win the cup', startLabel: 'Race ▶',
    options: [
      { key: 'mode', label: 'Mode', value: prefs.mode, choices: [{ v: 'gp', label: 'Grand Prix' }, { v: 'single', label: 'Single Race' }, { v: 'tt', label: 'Time Trial' }] },
      { key: 'difficulty', label: 'Rivals', value: cfg.difficulty, choices: [{ v: 'easy', label: 'Easy' }, { v: 'normal', label: 'Normal' }, { v: 'hard', label: 'Hard' }] },
    ],
    onStart: (v) => {
      prefs.mode = v.mode; cfg.difficulty = v.difficulty; savePrefs();
      if (v.mode === 'gp') startCup(prefs.cup === 'mirror' && mirrorUnlocked() ? 'mirror' : 'sunset');
      else { G.cup = null; startRace({ mode: v.mode, trackId: prefs.track || cfg.startTrack, reverse: prefs.mirror && mirrorUnlocked() }); }
    },
  });
  const card = menu.el.querySelector('.sd-card'); card.classList.add('m-card');
  const startRow = menu.el.querySelector('#sd-start').parentElement;
  const extra = document.createElement('div'); extra.className = 'm-extra';
  extra.innerHTML = `
    <div class="m-sec" data-for="gp"><div class="sd-label">Cup</div><div class="sd-row" id="mCup"></div></div>
    <div class="m-sec" data-for="single tt"><div class="sd-label">Track</div><div class="m-tracks" id="mTracks"></div><label class="m-mirror"><input type="checkbox" id="mMirror"> Mirror (reverse) <small id="mMirLock"></small></label></div>
    <div class="m-sec"><div class="sd-label">Paint</div><div class="m-paint" id="mPaint"></div></div>
    <div class="m-rec" id="mRec"></div>
    <div class="m-help" id="mHelp"></div>`;
  startRow.before(extra);
  const cont = document.createElement('button'); cont.className = 'sd-btn'; cont.id = 'mCont'; startRow.prepend(cont);
  cont.onclick = () => { if (!save.gp) return; sfx.select(); menu.hide(); startCup(save.gp.cup, save.gp); };
  const modeRow = menu.el.querySelector('.sd-row[data-key="mode"]');
  modeRow.addEventListener('click', () => setTimeout(refreshMenu, 0));
  extra.querySelector('#mMirror').onchange = (e) => { prefs.mirror = e.target.checked; savePrefs(); refreshMenu(); };
  refreshMenu = () => {
    const mode = menu.values.mode; const mu = mirrorUnlocked();
    extra.querySelectorAll('.m-sec[data-for]').forEach((s) => (s.style.display = s.dataset.for.split(' ').includes(mode) ? '' : 'none'));
    const cupEl = extra.querySelector('#mCup');
    cupEl.innerHTML = Object.values(CUPS).map((c) => { const locked = c.id === 'mirror' && !mu; const b = save.cups[c.id]; return `<button class="sd-btn ${prefs.cup === c.id && !locked ? 'on' : ''}" data-cup="${c.id}" ${locked ? 'disabled' : ''}>${locked ? '🔒 ' : ''}${c.name}${b ? ` <small>${['', '🏆', '🥈', '🥉'][b] || ORD(b)}</small>` : ''}</button>`; }).join('');
    if (!mu) cupEl.insertAdjacentHTML('beforeend', '<div class="m-note">Finish the Sunset Cup on the podium to unlock the Mirror Cup.</div>');
    cupEl.querySelectorAll('[data-cup]').forEach((b) => (b.onclick = () => { sfx.click(); prefs.cup = b.dataset.cup; savePrefs(); refreshMenu(); }));
    const tr = extra.querySelector('#mTracks'); const cur = prefs.track || cfg.startTrack;
    tr.innerHTML = TRACK_ORDER.map((id) => { const t = TRACKS[id]; const k = trackKey(id, prefs.mirror && mu); const md = save.medals[k]; return `<button class="m-track t-${t.theme} ${id === cur ? 'on' : ''}" data-t="${id}"><b>${t.name}</b><small>${t.place}</small>${md ? `<i class="medal m-${md}">${MEDAL_NAMES[md]}</i>` : ''}</button>`; }).join('');
    tr.querySelectorAll('[data-t]').forEach((b) => (b.onclick = async () => { sfx.click(); prefs.track = b.dataset.t; savePrefs(); refreshMenu(); await setupTrack(prefs.track, prefs.mirror && mirrorUnlocked(), { menu: true }); }));
    extra.querySelector('#mMirror').checked = prefs.mirror && mu; extra.querySelector('#mMirror').disabled = !mu; extra.querySelector('#mMirLock').textContent = mu ? '' : '🔒 unlocks with the Mirror Cup';
    const k = trackKey(cur, prefs.mirror && mu); const b = save.best[k], r = save.race[k];
    extra.querySelector('#mRec').innerHTML = mode === 'gp' ? (save.gp ? `Cup in progress: <b>${CUPS[save.gp.cup].name}</b>, race ${save.gp.idx + 1}/3` : '3 races · points 10-7-5-3-2-1 · grid reverses by standings') : `${TRACKS[cur].name}: best lap <b>${fmtTime(b ?? Infinity)}</b>${r ? ` · best race <b>${fmtTime(r.time)}</b> (${ORD(r.pos)})` : ''}`;
    cont.style.display = save.gp && mode === 'gp' ? '' : 'none'; cont.textContent = save.gp ? `Continue ${CUPS[save.gp.cup].name} (${save.gp.idx + 1}/3)` : '';
    const d = isTouch ? 'Touch: steer pad · GAS/BRAKE · DRIFT · BOOST (auto-accelerate in Options)' : 'W/↑ gas · S/↓ brake · A/D steer · SPACE drift · SHIFT boost · R reset · C camera · Esc pause · gamepad supported';
    extra.querySelector('#mHelp').textContent = d;
    updateMenuSwatches();
  };
  updateMenuSwatches = () => {
    const pe = extra.querySelector('#mPaint');
    pe.innerHTML = PAINTS.map((c) => `<button class="sw ${c.toLowerCase() === cfg.colors.car.toLowerCase() ? 'on' : ''}" style="--c:${c}" data-c="${c}" aria-label="Paint ${c}"></button>`).join('') + `<label class="sw sw-custom" title="Custom colour"><input type="color" value="${cfg.colors.car}" aria-label="Custom paint"></label>`;
    const apply = (c) => { cfg.colors.car = c; prefs.paint = c; savePrefs(); const pv = fleet?.cars.find((v) => v.car?.isPlayer); pv?.paint.uPaint.value.set(c); if (G.player) G.player.color = c; updateMenuSwatches(); };
    pe.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => { sfx.click(); apply(b.dataset.c); }));
    pe.querySelector('input').oninput = (e) => apply(e.target.value);
  };
  refreshMenu();
  // pause panel
  const pz = document.createElement('div'); pz.id = 'pause'; pz.className = 'sd-panel';
  pz.innerHTML = `<div class="sd-card"><h1 style="font-size:30px">Paused</h1>
    <div class="sd-row col"><button class="sd-btn primary" data-p="resume">Resume</button><button class="sd-btn" data-p="restart">Restart race</button><button class="sd-btn" data-p="reset">Reset car to track</button><button class="sd-btn" data-p="menu">Quit to menu</button></div>
    <div class="sd-label">Options</div>
    <label>Camera <select data-o="camera"><option value="chase">Chase</option><option value="far">Far chase</option><option value="hood">Hood</option></select></label>
    <label>Speed units <select data-o="units"><option value="kmh">km/h</option><option value="mph">mph</option></select></label>
    <label>Auto-accelerate (touch) <input type="checkbox" data-o="autoAccel"></label>
    <label>Tilt steering (touch) <input type="checkbox" data-o="tilt"></label>
    <label>Steering &amp; braking assist <input type="checkbox" data-o="assist"></label>
    <label>Catch-up for rivals <select data-o="catchup"><option value="off">Off</option><option value="subtle">Subtle</option><option value="strong">Strong</option></select></label>
    <label>Driving hints <input type="checkbox" data-o="hints"></label>
    <p class="m-note">Accessibility (shake, flashes, colour-blind palette, reduced motion, volume) lives under ⚙.</p></div>`;
  document.body.appendChild(pz);
  pz.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => {
    const a = b.dataset.p; togglePause(false);
    if (a === 'restart') { if (G.mode === 'gp' && G.standings) startRace({ mode: 'gp', trackId: G.trackId, reverse: G.reverse, gridOrder: G.raceIdx > 0 ? standingsOrder(G.standings).reverse() : null }); else startRace({ mode: G.mode, trackId: G.trackId, reverse: G.reverse }); }
    if (a === 'reset' && G.phase === 'race') resetToTrack(G.player);
    if (a === 'menu') toMenu();
  }));
  pz.querySelectorAll('[data-o]').forEach((inp) => {
    const k = inp.dataset.o; const src = k === 'catchup' ? cfg : prefs;
    if (inp.type === 'checkbox') inp.checked = !!src[k]; else inp.value = src[k];
    inp.onchange = async () => { const v = inp.type === 'checkbox' ? inp.checked : inp.value; if (k === 'tilt') { const ok = await input.enableTilt(v); if (!ok) { inp.checked = false; toast('Tilt not available on this device'); } } else src[k] = v; if (k === 'assist') ensureAssist(); savePrefs(); };
  });
}
function ensureAssist() { if (G.player && !G.player.ai0) G.player.ai0 = makeAI(G.T, { skill: 0.92, latMax: BASE.latMax * 0.86 }); }
const mirrorUnlocked = () => !!save.cups.sunset && save.cups.sunset <= 3;

// ---------------------------------------------------------------- probe hooks (headless verification)
function hooks() {
  return {
    state: () => ({ phase: G.phase, mode: G.mode, track: G.trackId, reverse: G.reverse, time: +G.time.toFixed(2), lap: G.player?.lap.lap, laps: G.laps, pos: G.order.indexOf(G.player) + 1, kmh: Math.round(Math.abs(G.player?.vF || 0) * 3.6), boost: +(G.player?.boost || 0).toFixed(2), drift: G.player?.drift, dist: Math.round(G.player?.dist || 0), finished: G.player?.finished, best: G.bestLap, results: G.results, standings: G.standings, ghost: G.ghost ? G.ghost.frames.length / 4 : 0, drawCalls: renderer.info.render.drawCalls }),
    start: (o = {}) => { if (o.mode === 'gp') { menu.hide(); startCup(o.cup || 'sunset'); } else { G.cup = null; startRace({ mode: o.mode || 'single', trackId: o.track || 'coast', reverse: !!o.reverse }); } return true; },
    skipIntro: () => { if (G.phase === 'intro') beginCountdown(); if (G.phase === 'countdown') { G.phaseT = 3.6; } return G.phase; },
    autopilot: (on = true) => { G.autopilot = on; G.autopilotLock = on; return on; },
    /** Fast-forward the simulation by `sec` seconds at a fixed 1/60 step without rendering. */
    sim: (sec = 1) => { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) { step(1 / 60); if (G.phase === 'podium') break; } return hooks().state(); },
    view: (name) => {
      const p = G.player; if (!p) return;
      if (name === 'side') { camS.pos.set(p.x + Math.cos(p.yaw) * 6, p.y + 1.4, p.z - Math.sin(p.yaw) * 6); camS.look.set(p.x, p.y + 0.6, p.z); }
      G.camSnap = true; return name;
    },
    camera: (m) => { prefs.camera = m; return m; },
    teleport: (s, d = 0) => { const pose = poseAt(G.T, s, d); Object.assign(G.player, { x: pose.x, z: pose.z, y: pose.y, yaw: pose.yaw, vx: 0, vz: 0 }); G.camSnap = true; return pose; },
    pause: (on) => togglePause(on), menu: () => toMenu(), results: () => G.results,
    setPrefs: (o) => Object.assign(prefs, o), save: () => save, cfg: () => cfg,
    podium: () => { if (G.phase === 'race' || G.phase === 'finished') showResults(); return G.phase; },
  };
}

boot().catch((e) => { console.error(e); bootMsg.textContent = 'Could not start: ' + e.message; window.__cam && window.__cam.errors.push(String(e)); });
