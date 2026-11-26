// Strikepoint — boot, menus, pause/options, summaries, remix config, probe + test hooks.
import { THREE, createRenderer, createPipeline, autoResize, probe, startLoop, initUI, settingsButton, startMenu, loadDream, store, settings, saveSettings, toast, host, updateTweens, sfx, Q } from '/shared/sd-kit.js';
import { DEFAULTS, DIFFICULTY, WEAPONS, PRIMARIES, PREFS_DEFAULT, KEY_LABELS, DEFAULT_KEYS, XP_LEVEL, RANKS } from './config.js';
import { Input, TouchControls } from './input.js';
import { Audio } from './audio.js';
import { HUD, esc } from './hud.js';
import { Game, keyLabel } from './game.js';
import { MODES, MISSIONS } from './modes.js';
import { matchXP } from './logic.js';

const bootFill = document.getElementById('bootFill'), bootMsg = document.getElementById('bootMsg');
const progress = (k, msg) => { bootFill.style.width = Math.round(k * 100) + '%'; if (msg) bootMsg.textContent = msg; };
const $ = (s) => document.querySelector(s);

const app = { prefs: Object.assign(structuredClone(PREFS_DEFAULT), store.get('strikepoint-prefs', {})) };
app.prefs.keys = Object.assign({ ...DEFAULT_KEYS }, app.prefs.keys || {});
app.profile = Object.assign({ xp: 0, unlocked: 1, bestWave: 0, wins: 0, played: 0, missionsDone: [] }, store.get('strikepoint-profile', {}));
const savePrefs = () => store.set('strikepoint-prefs', app.prefs), saveProfile = () => store.set('strikepoint-profile', app.profile);

async function boot() {
  progress(0.05, 'Initialising renderer');
  const renderer = await createRenderer({ toneMapping: 'aces', exposure: 1.0 });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(app.prefs.fov, innerWidth / innerHeight, 0.02, 900); camera.rotation.order = 'YXZ'; scene.add(camera);
  const post = createPipeline(renderer, scene, camera, { bloom: { strength: 0.42, radius: 0.35, threshold: 0.86 } });
  autoResize(renderer, camera);
  initUI({ vignette: true, grain: true });
  app.cfg = await loadDream(DEFAULTS, (c) => applyLive(c));
  sanitizeCfg(app.cfg);
  Object.assign(app, { renderer, scene, camera, post });
  app.audio = new Audio(); const unlock = () => app.audio.init(); addEventListener('pointerdown', unlock); addEventListener('keydown', unlock);
  app.input = new Input(renderer.domElement, app.prefs);
  app.hud = new HUD();
  if (app.input.isTouch || Q.has('touch')) { document.body.classList.add('touch'); app.touch = new TouchControls(app.input, document.body); app.input.touch = app.touch; app.touch.show(false); }
  const game = app.game = new Game(app);
  if (Q.has('debug')) window.__sp = app;
  const cam = probe(renderer, { counts: {}, game: hooks() });
  app.input.onPause = () => { if (app.state === 'playing') pause(); else if (app.state === 'paused' && !$('#keysPanel')) resume(); };
  app.input.onLockLost = () => { if (app.state === 'playing' && !app.input.isTouch) pause(true); };
  settingsButton('<button class="sd-btn sd-icon" id="helpBtn" aria-label="Controls">?</button>');
  $('#helpBtn').onclick = () => showControls();
  addEventListener('sd-settings', () => { game.applyColors(); });
  // menu backdrop: dockyard at night, slow drift along the quay
  progress(0.12, 'Loading Saltmarsh Docks');
  await game.load(Q.get('map') || 'dockyard', Q.get('time') || app.cfg.time.dockyard, (k, m) => progress(0.12 + k * 0.85, m));
  buildMenu();
  app.state = 'menu';
  startLoop(renderer, (dt, t) => step(dt, t), () => post.render());
  cam.dataReady = true;
  $('#boot').classList.add('hide');
  host('ready');
  if (Q.get('view')) startView(); // screenshot helper: ?view=1&map=..&time=..&pos=x,y,z,yaw,pitch
  if (Q.get('autostart')) quickStart(Q.get('autostart'));
}

function sanitizeCfg(c) {
  if (!DIFFICULTY[c.difficulty]) c.difficulty = 'regular';
  if (!WEAPONS[c.loadout?.primary] || WEAPONS[c.loadout.primary].slot !== 'primary') c.loadout.primary = 'ar';
  if (!WEAPONS[c.loadout?.secondary]) c.loadout.secondary = 'pistol';
  c.enemyCount = Math.max(2, Math.min(16, +c.enemyCount || 8)); c.gravity = Math.max(0.3, Math.min(2, +c.gravity || 1)); c.gameSpeed = Math.max(0.5, Math.min(1.5, +c.gameSpeed || 1));
}
function applyLive(c) {
  const old = app.cfg; sanitizeCfg(c); app.cfg = c; app.game.cfg = c;
  app.game.applyColors();
  const map = app.game.map; if (map && old.time?.[map.id] !== c.time?.[map.id]) app.game.setTime(c.time[map.id]);
  if (old.rain !== c.rain && map) app.game.setTime(app.game.timeName);
  if (c.building !== old.building) toast(c.building ? 'Building enabled' : 'Building disabled');
}

// ---------------------------------------------------------------- frame
let menuT = 0;
function step(dt, t) {
  const g = app.game; updateTweens(dt);
  if (app.state === 'playing') { const inp = app.input.poll(); if (app.scripted) Object.assign(inp, app.scripted); g.update(dt, inp); checkTab(inp); }
  else if (app.state === 'menu' || app.state === 'view' || app.state === 'loading' || app.state === 'briefing') {
    menuT += dt; g.fx?.update(dt); g.atm.update(dt);
    if (app.state !== 'view') { const m = g.map; const path = m.menuCam || [[-58, 3.2, 40], [-20, 4.5, 30]]; const k = (Math.sin(menuT * 0.05) + 1) / 2; const a = path[0], b = path[1];
      g.camera.position.set(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k); g.camera.rotation.set(-0.06, -1.2 + Math.sin(menuT * 0.07) * 0.25, 0, 'YXZ');
      g.atm.follow(g.camera.position); }
  }
  const cam = window.__cam; if (cam && g.player) { cam.player = { x: g.player.pos.x, y: g.player.pos.y, z: g.player.pos.z, yaw: g.player.yaw, pitch: g.player.pitch }; cam.counts = { ...g.counts, bots: g.bots.filter((b) => b.alive).length, lights: g.lights?.length ?? 0 }; }
}
function checkTab(inp) { const sb = $('#scoreboard'); if (inp.scores && app.game.mode) { if (!sb) document.body.insertAdjacentHTML('beforeend', `<div id="scoreboard">${scoreboardHTML()}</div>`); else if ((app.sbT = (app.sbT || 0) + 1) % 20 === 0) sb.innerHTML = scoreboardHTML(); } else if (sb) sb.remove(); }
function scoreboardHTML() {
  const g = app.game, m = g.mode; const rows = [{ name: 'You', team: g.player.team, kills: g.stats.kills, deaths: g.stats.deaths, score: g.stats.kills * 100 + g.stats.objectives * 250, me: true, alive: g.player.alive }, ...g.bots.filter((b) => b.kind !== 'drone').map((b) => ({ name: b.name, team: b.team, kills: b.kills || 0, deaths: b.deaths || 0, score: b.score || 0, alive: b.alive }))];
  rows.sort((a, b) => (a.team === b.team ? b.score - a.score : a.team < b.team ? -1 : 1));
  return `<table class="sb"><tr><th>${esc(m?.title || 'Match')}</th><th>K</th><th>D</th><th>SCORE</th></tr>${rows.slice(0, 26).map((r) => `<tr class="${r.team} ${r.me ? 'me' : ''} ${r.alive ? '' : 'dead'}"><td>${esc(r.name)}</td><td>${r.kills}</td><td>${r.deaths}</td><td>${r.score}</td></tr>`).join('')}</table>`;
}

// ---------------------------------------------------------------- menu
let menu;
function buildMenu() {
  const save = store.get('strikepoint-campaign', null);
  menu = startMenu({
    title: 'STRIKE<b>POINT</b>', subtitle: 'A tactical first-person shooter. Fight through a three-mission campaign, hold the line in Holdout, trade fire in Skirmish, or drop into a closing storm in Dropzone.',
    options: [
      { key: 'mode', label: 'Mode', value: 'campaign', choices: [{ v: 'campaign', label: 'Campaign' }, { v: 'skirmish', label: 'Skirmish' }, { v: 'holdout', label: 'Holdout' }, { v: 'dropzone', label: 'Dropzone' }] },
      { key: 'map', label: 'Map', value: 'dockyard', choices: [{ v: 'dockyard', label: 'Saltmarsh Docks' }, { v: 'village', label: 'Calvera' }, { v: 'plant', label: 'Kessler Works' }] },
      { key: 'difficulty', label: 'Difficulty', value: app.cfg.difficulty, choices: Object.entries(DIFFICULTY).map(([v, d]) => ({ v, label: d.label })) },
      { key: 'primary', label: 'Primary weapon', value: app.cfg.loadout.primary, choices: PRIMARIES.map((v) => ({ v, label: WEAPONS[v].cls.replace('Light Machine Gun', 'LMG').replace('Marksman Rifle', 'Marksman') })) },
    ],
    startLabel: 'Deploy', onStart: (v) => startFromMenu(v),
  });
  const card = menu.el.querySelector('.sd-card');
  const lvl = XP_LEVEL(app.profile.xp); const rank = RANKS[Math.min(RANKS.length - 1, lvl - 1)];
  card.querySelector('h1').innerHTML = 'STRIKE<b>POINT</b>';
  const extra = document.createElement('div'); extra.className = 'menu-extra';
  extra.innerHTML = `<div class="sd-label" id="mLbl">Missions</div><div class="missions" id="missions"></div>
    <div style="margin-top:14px"><span class="rank">${rank.toUpperCase()} · LVL ${lvl}</span> · ${app.profile.xp} XP · Best holdout wave ${app.profile.bestWave} · Dropzone wins ${app.profile.wins}</div>
    <div style="margin-top:6px;opacity:.75">${app.input.isTouch ? 'Touch: left thumb moves, right thumb looks.' : 'Mouse + keyboard or gamepad. Esc pauses. Press ? for controls.'}</div>`;
  card.insertBefore(extra, card.querySelector('.sd-row:last-child'));
  if (save && save.mission !== undefined) { const b = document.createElement('button'); b.className = 'sd-btn'; b.textContent = `Continue · Mission ${save.mission + 1} — checkpoint ${save.seg + 1}`; b.onclick = () => { sfx.select(); menu.hide(); launch({ mode: 'campaign', mission: save.mission, seg: save.seg, difficulty: menu.values.difficulty }); }; card.querySelector('.sd-row:last-child').appendChild(b); }
  app.selMission = Math.min(app.profile.unlocked - 1, MISSIONS.length - 1);
  const renderMissions = () => { $('#missions').innerHTML = MISSIONS.map((m, i) => `<div class="mission ${i === app.selMission ? 'on' : ''} ${i >= app.profile.unlocked && !Q.has('unlock') ? 'locked' : ''}" data-i="${i}"><i>0${i + 1}</i>${m.title}<small>${m.mapName} · ${app.profile.missionsDone.includes(i) ? 'COMPLETE' : i >= app.profile.unlocked ? 'LOCKED' : m.length}</small></div>`).join(''); };
  renderMissions();
  $('#missions').addEventListener('click', (e) => { const el = e.target.closest('.mission'); if (!el || el.classList.contains('locked')) return; app.selMission = +el.dataset.i; sfx.click(); renderMissions(); });
  const sync = () => { const mode = menu.values.mode; const mapRow = menu.el.querySelector('.sd-row[data-key="map"]'); mapRow.style.display = mapRow.previousElementSibling.style.display = (mode === 'skirmish' || mode === 'holdout') ? '' : 'none'; $('#missions').style.display = $('#mLbl').style.display = mode === 'campaign' ? '' : 'none'; };
  menu.el.addEventListener('click', sync); sync();
}
function startFromMenu(v) {
  app.cfg.difficulty = v.difficulty; app.cfg.loadout.primary = v.primary;
  launch({ mode: v.mode, map: v.map, mission: app.selMission, seg: 0, difficulty: v.difficulty });
}
function quickStart(mode) { menu?.hide(); launch({ mode, map: Q.get('map') || 'dockyard', mission: +(Q.get('mission') || 0), seg: +(Q.get('seg') || 0), difficulty: Q.get('diff') || app.cfg.difficulty, skipBrief: true }); }

async function launch(o) {
  app.state = 'loading'; app.last = o; const g = app.game; g.cfg.difficulty = o.difficulty || g.cfg.difficulty;
  $('#boot').classList.remove('hide'); progress(0, 'Preparing');
  const Mode = MODES[o.mode]; const mode = new Mode(g, o);
  const mapId = mode.mapId; const time = mode.time ?? g.cfg.time[mapId] ?? 'day';
  if (g.map?.id !== mapId || g.timeName !== time || true) await g.load(mapId, time, (k, m) => progress(k, m)); // fresh level every match (clean colliders/builds)
  $('#boot').classList.add('hide');
  if (mode.briefing && !o.skipBrief) { app.state = 'briefing'; await briefing(mode); }
  app.touch?.show(true); hideCorner(true);
  g.startMatch(mode); app.state = 'playing'; app.profile.played++; saveProfile();
  host('start', { mode: o.mode });
  if (!app.input.isTouch && !Q.has('nolock')) app.input.lock();
  app.input.enabled = true;
  showLockHint();
}
function hideCorner(h) { const c = document.querySelector('.sd-corner'); if (c) c.style.display = h ? 'none' : ''; }
function showLockHint() { if (app.input.isTouch || Q.has('nolock')) return; setTimeout(() => { if (app.state === 'playing' && !app.input.locked && !$('#lockHint')) { document.body.insertAdjacentHTML('beforeend', '<div id="lockHint">CLICK TO AIM</div>'); const rm = () => { $('#lockHint')?.remove(); removeEventListener('mousedown', rm); }; addEventListener('mousedown', rm); } }, 600); }

function briefing(mode) {
  return new Promise((res) => {
    const b = mode.briefing; const el = document.createElement('div'); el.className = 'panel'; el.id = 'briefing';
    el.innerHTML = `<div class="card"><div class="loc">${esc(b.loc)}</div><h2>${esc(b.title)}</h2><div class="txt"></div><h3>Objectives</h3><ul>${b.objectives.map((o) => `<li>${esc(o)}</li>`).join('')}</ul><div class="btns"><button class="btn pri" id="deploy">Deploy</button></div></div>`;
    document.body.appendChild(el); const txt = el.querySelector('.txt'); let i = 0; const full = b.text;
    const typer = setInterval(() => { i += 3; txt.textContent = full.slice(0, i); if (i >= full.length) clearInterval(typer); if (i % 9 === 0) app.audio.ui('tick'); }, 18);
    el.querySelector('#deploy').onclick = () => { clearInterval(typer); el.remove(); sfx.select(); res(); };
  });
}
// ---------------------------------------------------------------- pause / options
function pause(fromLock = false) {
  if (app.state !== 'playing') return; app.state = 'paused'; app.game.paused = true; app.input.unlock(); app.touch?.show(false); hideCorner(false);
  const el = document.createElement('div'); el.className = 'panel'; el.id = 'pausePanel';
  const camp = app.game.mode?.kind === 'campaign';
  el.innerHTML = `<div class="card"><h2>Paused</h2><p>${esc(app.game.mode?.title || '')} · ${esc(DIFFICULTY[app.game.cfg.difficulty].label)}</p>
    <div class="btns"><button class="btn pri" id="pResume">Resume</button><button class="btn" id="pOpts">Options</button><button class="btn" id="pKeys">Controls</button>
    <button class="btn" id="pRestart">${camp ? 'Restart checkpoint' : 'Restart'}</button><button class="btn" id="pQuit">Quit to menu</button></div>
    ${fromLock ? '<p style="margin-top:12px">Mouse released — click Resume to keep playing.</p>' : ''}</div>`;
  document.body.appendChild(el);
  $('#pResume').onclick = resume; $('#pOpts').onclick = () => showOptions(); $('#pKeys').onclick = () => showControls(true);
  $('#pRestart').onclick = () => { el.remove(); app.game.mode?.restart ? (app.game.mode.restart(), resume()) : launch(app.last); };
  $('#pQuit').onclick = () => { el.remove(); toMenu(); };
}
function resume() { $('#pausePanel')?.remove(); $('#optPanel')?.remove(); $('#keysPanel')?.remove(); if (app.state !== 'paused') return; app.state = 'playing'; app.game.paused = false; hideCorner(true); app.touch?.show(true); if (!app.input.isTouch) app.input.lock(); }
function toMenu() {
  app.state = 'menu'; app.input.enabled = false; app.input.unlock(); app.game.hud.show(false); app.game.vm.root.visible = false; app.touch?.show(false); hideCorner(false);
  document.querySelectorAll('#summary,#death,#scoreboard,#buyPanel,#pausePanel,#lockHint').forEach((e) => e.remove());
  app.game.bots.length = 0; app.game.combatants.length = 1; app.game.mode = null; app.game.actors.begin(); app.game.actors.end(); app.game.pickups.length = 0; app.game.builds?.clear?.();
  menu.el.remove(); buildMenu(); menu.show(); host('menu');
}
function showOptions() {
  const p = app.prefs; const el = document.createElement('div'); el.className = 'panel'; el.id = 'optPanel';
  el.innerHTML = `<div class="card"><h2>Options</h2><div class="opts">
    <label>Mouse / stick sensitivity <input type="range" min="0.2" max="3" step="0.05" data-p="sens"></label>
    <label>ADS sensitivity multiplier <input type="range" min="0.3" max="1.5" step="0.05" data-p="adsSens"></label>
    <label>Field of view <input type="range" min="60" max="95" step="1" data-p="fov"></label>
    <label>Invert Y <input type="checkbox" data-p="invertY"></label><label>Toggle ADS (instead of hold) <input type="checkbox" data-p="toggleAds"></label>
    <label>Aim assist (gamepad) <input type="checkbox" data-p="aimAssist"></label><label>Hit puffs <input type="checkbox" data-p="hitPuffs"></label>
    <label>Crosshair colour <input type="color" data-p="crosshair"></label></div>
    <p>Shake, flashes, colourblind palette, reduced motion, volume and graphics quality live under the ⚙ button.</p>
    <div class="btns"><button class="btn pri" id="oDone">Done</button></div></div>`;
  document.body.appendChild(el);
  el.querySelectorAll('[data-p]').forEach((inp) => { const k = inp.dataset.p; if (inp.type === 'checkbox') inp.checked = !!p[k]; else inp.value = p[k];
    inp.oninput = () => { p[k] = inp.type === 'checkbox' ? inp.checked : inp.type === 'range' ? +inp.value : inp.value; savePrefs(); applyPrefs(); }; });
  $('#oDone').onclick = () => el.remove();
}
function applyPrefs() { document.documentElement.style.setProperty("--xh", app.prefs.crosshair); settings.hitPuffs = app.prefs.hitPuffs; }
function showControls(fromPause = false) {
  const p = app.prefs; const el = document.createElement('div'); el.className = 'panel'; el.id = 'keysPanel';
  const rows = Object.keys(DEFAULT_KEYS).map((k) => `<span>${KEY_LABELS[k] || k}</span><button data-k="${k}">${keyLabel(p.keys[k])}</button>`).join('');
  el.innerHTML = `<div class="card"><h2>Controls</h2><p>Click a binding, then press the new key. Mouse: LMB fire · RMB aim · wheel swap.<br>Gamepad: LS move · RS look · RT fire · LT aim · A jump · B crouch/slide · X reload/use · Y swap · LB frag · RB smoke · L3 sprint · R3 melee · D-pad build.</p>
    <div class="keys">${rows}</div><div class="btns"><button class="btn" id="kReset">Reset defaults</button><button class="btn pri" id="kDone">Done</button></div></div>`;
  document.body.appendChild(el);
  el.querySelectorAll('.keys button').forEach((b) => b.onclick = () => { b.classList.add('wait'); b.textContent = 'press a key…'; app.input.capture = (code) => { if (code !== 'Escape') p.keys[b.dataset.k] = code; b.classList.remove('wait'); b.textContent = keyLabel(p.keys[b.dataset.k]); savePrefs(); }; });
  $('#kReset').onclick = () => { p.keys = { ...DEFAULT_KEYS }; savePrefs(); el.remove(); showControls(fromPause); };
  $('#kDone').onclick = () => el.remove();
}
// ---------------------------------------------------------------- end of match
export function endMatch(r) {
  const g = app.game; if (g.over) return; g.over = true; app.state = 'summary'; app.input.enabled = false; app.input.unlock(); app.touch?.show(false); g.hud.show(false); hideCorner(false);
  document.querySelectorAll('#death,#scoreboard,#buyPanel,#lockHint').forEach((e) => e.remove());
  const s = g.stats; const acc = s.shots ? s.hits / s.shots : 0;
  const xp = matchXP({ kills: s.kills, heads: s.heads, objectives: s.objectives, accuracy: acc, won: r.won, mult: DIFFICULTY[g.cfg.difficulty].xp });
  const lv0 = XP_LEVEL(app.profile.xp); app.profile.xp += xp; const lv1 = XP_LEVEL(app.profile.xp);
  if (r.unlock !== undefined) app.profile.unlocked = Math.max(app.profile.unlocked, r.unlock + 1);
  if (r.missionDone !== undefined && !app.profile.missionsDone.includes(r.missionDone)) app.profile.missionsDone.push(r.missionDone);
  if (r.wave) app.profile.bestWave = Math.max(app.profile.bestWave, r.wave); if (r.brWin) app.profile.wins++;
  saveProfile(); host('end', { won: !!r.won, mode: g.mode?.kind });
  const mins = Math.floor((performance.now() - s.start) / 60000), secs = Math.floor((performance.now() - s.start) / 1000) % 60;
  const need = (n) => 250 * (n - 1) ** 2; const pct = ((app.profile.xp - need(lv1)) / Math.max(1, need(lv1 + 1) - need(lv1))) * 100;
  const el = document.createElement('div'); el.className = 'panel'; el.id = 'summary';
  el.innerHTML = `<div class="card"><h2>${esc(r.title)}</h2><p>${esc(r.sub || '')}</p>
    <div class="stats"><div><b>${s.kills}</b><span>Kills</span></div><div><b>${s.deaths}</b><span>Deaths</span></div><div><b>${(s.kills / Math.max(1, s.deaths)).toFixed(2)}</b><span>K/D</span></div>
    <div><b>${Math.round(acc * 100)}%</b><span>Accuracy</span></div><div><b>${s.heads}</b><span>Headshots</span></div><div><b>${mins}:${String(secs).padStart(2, '0')}</b><span>Time</span></div></div>
    <h3>+${xp} XP ${lv1 > lv0 ? '· PROMOTED to ' + RANKS[Math.min(RANKS.length - 1, lv1 - 1)].toUpperCase() : ''}</h3>
    <div class="xpbar"><i style="width:${Math.max(2, Math.min(100, pct))}%"></i></div><p style="font-size:13px">Level ${lv1} · ${app.profile.xp} XP total. XP is a record of play — nothing to buy, nothing to unlock with money.</p>
    ${r.extra || ''}<div class="btns">${r.next ? '<button class="btn pri" id="sNext">Next mission</button>' : ''}<button class="btn ${r.next ? '' : 'pri'}" id="sRetry">${r.won ? 'Play again' : 'Retry'}</button><button class="btn" id="sMenu">Main menu</button></div></div>`;
  document.body.appendChild(el); if (r.won) app.audio.ui('level'); if (lv1 > lv0) setTimeout(() => toast('Promoted: ' + RANKS[Math.min(RANKS.length - 1, lv1 - 1)]), 600);
  $('#sRetry').onclick = () => { el.remove(); launch({ ...app.last, seg: r.retrySeg ?? 0, skipBrief: true }); };
  $('#sMenu').onclick = () => { el.remove(); toMenu(); };
  if (r.next) $('#sNext').onclick = () => { el.remove(); launch({ ...app.last, mission: r.next, seg: 0, skipBrief: false }); };
}
app.endMatch = endMatch;

// ---------------------------------------------------------------- screenshot/view helper
function startView() {
  menu?.hide(); app.state = 'view'; hideCorner(true);
  const p = (Q.get('pos') || '').split(',').map(Number); const g = app.game;
  if (p.length >= 3) { g.camera.position.set(p[0], p[1], p[2]); g.camera.rotation.set(p[4] || 0, p[3] || 0, 0, 'YXZ'); g.atm.follow(g.camera.position); }
}
// ---------------------------------------------------------------- probe hooks for scripted verification
function hooks() {
  return {
    state: () => ({ state: app.state, mode: app.game.mode?.kind, map: app.game.map?.id, hp: app.game.player.health, alive: app.game.player.alive, pos: app.game.player.pos.toArray(), bots: app.game.bots.filter((b) => b.alive).length, stats: app.game.stats, obj: app.game.mode?.objText?.(), ammo: app.game.arsenal.slot ? [app.game.arsenal.slot.mag, app.game.arsenal.slot.reserve] : null, weapon: app.game.arsenal.slot?.id, drawCalls: window.__cam.drawCalls }),
    start: (mode, o = {}) => { menu?.hide(); return launch({ mode, map: o.map || 'dockyard', mission: o.mission || 0, seg: o.seg || 0, difficulty: o.difficulty || 'regular', skipBrief: true }); },
    teleport: (x, y, z, yaw = 0, pitch = 0) => { const p = app.game.player; p.pos.set(x, y ?? app.game.world.floorAt(x, z, 0.3, 80, 80), z); p.yaw = yaw; p.pitch = pitch; p.vel.set(0, 0, 0); },
    look: (yaw, pitch) => { app.game.player.yaw = yaw; app.game.player.pitch = pitch; },
    input: (o) => { app.scripted = o; },
    sim: (sec, o = null) => { const g = app.game; if (o) app.scripted = o; const n = Math.round(sec * 60); for (let i = 0; i < n; i++) { const inp = app.input.poll(); if (app.scripted) Object.assign(inp, app.scripted); g.update(1 / 60, inp); if (app.state !== 'playing') break; } return hooks().state(); },
    god: (v = true) => { app.game.player.godMode = v; },
    give: (id) => { const a = app.game.arsenal; a.slots[0] = a.makeSlot(id); a.equip(0, true); },
    spawn: (x, z, o = {}) => app.game.addBot({ x, z, team: 'B', ...o }).id,
    killAll: () => { for (const b of app.game.bots) if (b.alive && b.team !== 'A') app.game.damage(b, 9999, 'body', app.game.player, app.game.arsenal.w, new THREE.Vector3(0, 0, 1)); },
    objective: () => app.game.mode?.debugComplete?.(),
    setTime: (t) => app.game.setTime(t),
    pause, resume, endMatch: (r) => endMatch(r || { title: 'Test', won: true }),
    bots: () => app.game.bots.map((b) => ({ id: b.id, team: b.team, kind: b.kind, state: b.state, alive: b.alive, x: +b.x.toFixed(1), z: +b.z.toFixed(1), hp: Math.round(b.health), cover: !!b.cover, phase: b.coverPhase, aware: +b.aware.toFixed(2) })),
  };
}

boot().catch((e) => { console.error(e); bootMsg.textContent = 'Failed to start: ' + e.message; (window.__cam ||= { errors: [] }).errors?.push(String(e)); });
applyPrefs();
