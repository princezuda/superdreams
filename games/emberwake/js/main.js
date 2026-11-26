// Emberwake — boot, game flow, the World host (dialogue, battles, shops, cutscenes), saves, title, test hooks.
import { THREE, createRenderer, probe, startLoop, loadDream, initUI, settingsButton, store, settings, updateTweens, tween, applyShake, flash, shake, toast, startMenu, host as hostMsg, Q } from '/shared/sd-kit.js';
import { makeMaterials, createPost, skyNode, Lighting, U } from './render.js';
import { Field } from './field.js';
import { setSeason } from './world.js';
import { BattleView } from './battleview.js';
import { FX } from './fx.js';
import { UI } from './ui.js';
import { I, pollPad, initTouch } from './input.js';
import { SFX } from './audio.js';
import { World } from './game.js';
import { MAPS } from './maps.js';
import { CAST, WALKTHROUGH } from './story.js';
import { HEROES, ITEMS, GROUPS, DIFFICULTY } from './data.js';
import { newGame, serialize, deserialize, restParty, buy, equip, saveSummary } from './rules.js';
import { simulate, applyRewards } from './battle.js';

const DEFAULTS = { difficulty: 'normal', heroName: 'Rook', battleSpeed: 1, timing: 'normal', xpRate: 1, startGold: 40, colors: { accent: '#ffb45a' }, autumn: true };
const $ = (s) => document.querySelector(s);
const lmsg = (t, k) => { const m = $('#lmsg'); if (m) m.textContent = t; const b = $('#lbarFill'); if (b) b.style.width = Math.round(k * 100) + '%'; };
const KEY = { auto: 'emberwake-auto', slot: (k) => 'emberwake-slot-' + k, opts: 'emberwake-opts' };

const A = window.EW = {
  s: null, cfg: null, mode: 'boot', fast: false, auto: false, autoTiming: 1, aspect: innerWidth / innerHeight, sfx: SFX,
  opts: Object.assign({ battleSpeed: 1, timing: 'normal', textSpeed: 'normal', autoRun: false }, store.get(KEY.opts, {})),
  saveOpts() { store.set(KEY.opts, A.opts); },
  toast: (m) => toast(m),
  fmt: (t) => (A.cfg?.heroName && A.cfg.heroName !== 'Rook' ? t.replace(/\bRook\b/g, A.cfg.heroName) : t),
};

async function boot() {
  try {
    lmsg('Trimming the wick…', 0.05);
    A.cfg = await loadDream(DEFAULTS, (live) => { A.cfg = live; applyCfg(); });
    applyCfg();
    initUI({ vignette: false, grain: true });
    const renderer = A.renderer = await createRenderer({ toneMapping: 'aces', exposure: 1.05, shadows: !Q.has('noshadow') });
    lmsg('Painting the pixels…', 0.25);
    makeMaterials();
    const scene = A.scene = new THREE.Scene(); scene.backgroundNode = skyNode();
    const camera = A.camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.3, 220);
    A.lighting = new Lighting(scene); A.lighting.apply('dusk');
    A.post = createPost(renderer, scene, camera);
    A.fx = new FX(scene);
    A.ui = new UI(A); A.field = new Field(A); A.battle = new BattleView(A);
    initTouch(document.body);
    settingsButton(`<button class="sd-btn sd-icon" id="ewMenu" aria-label="Menu" title="Menu (Esc)">☰</button>`);
    $('#ewMenu').onclick = (e) => { e.stopPropagation(); openMenu(); };
    addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); A.aspect = innerWidth / innerHeight; });
    probe(renderer, { counts: {}, game: hooks() });
    lmsg('Building Kindlewick…', 0.5);
    // title backdrop: Kindlewick at dusk, slow drift
    A.s = newGame('normal'); A.world = makeWorld(A.s);
    A.field.load('kindlewick', [16.5, 13], 'up'); A.field.setCam(16.5, 9, { zoom: 1.05 });
    lmsg('Kindling the lamps…', 0.8);
    await renderer.compileAsync?.(scene, camera).catch(() => {});
    startLoop(renderer, step, () => A.post.render());
    $('#loading')?.classList.add('done'); setTimeout(() => $('#loading')?.remove(), 700);
    showTitle();
  } catch (e) { console.error(e); window.__bootError = String(e?.stack || e); lmsg('Something went wrong: ' + e.message, 1); }
}
function applyCfg() {
  const c = A.cfg; if (!c) return;
  if (c.heroName && typeof c.heroName === 'string') { const n = c.heroName.slice(0, 14).replace(/[<>]/g, '') || 'Rook'; HEROES.rook.name = n; CAST.rook.name = n; HEROES.rook.full = n + ' Callow'; }
  document.documentElement.style.setProperty('--accent', c.colors?.accent || '#ffb45a');
  setSeason(c.autumn !== false);
  if (c.battleSpeed && !store.get(KEY.opts)) A.opts.battleSpeed = +c.battleSpeed;
  if (c.timing && !store.get(KEY.opts)) A.opts.timing = c.timing;
}

// ------------------------------------------------------------------ the World host
function makeWorld(s) {
  const H = {};
  const W = new World(s, H);
  const live = () => A.world === W;
  const hang = () => new Promise(() => {});
  Object.assign(H, {
    say: (who, t) => (live() ? (A.fast ? Promise.resolve() : A.ui.say(who, t)) : hang()),
    choose: (p, o) => (live() ? (A.fast ? Promise.resolve(A.fastChoice ?? 0) : A.ui.choose(p, o)) : hang()),
    title: (k, t) => (live() ? (A.fast ? Promise.resolve() : A.ui.title(k, t)) : hang()),
    hint: (t) => { if (live()) A.ui.hint(t); },
    got: async (id, n) => { if (!live()) return; A.ui.got(id, n); SFX.chest(); },
    loadMap: async (m, at, dir) => { if (!live()) return; A.field.load(m, at, dir); A.ui.area(m); if (A.mode !== 'title') A.mode = 'field'; await A.ui.wipe(false, 380); },
    transition: async () => { SFX.door(); await A.ui.wipe(true, 300); },
    shop: (id) => (live() ? (A.fast ? Promise.resolve() : A.ui.openShop(id)) : hang()),
    battle: (g, o) => (live() ? startBattle(g, o) : hang()),
    innRest: async (r) => { if (!r.ok) { toast(r.msg); SFX.error(); return; } SFX.inn(); await A.ui.wipe(true, 500); A.field.refreshDynamic(); await new Promise((res) => setTimeout(res, A.fast ? 0 : 700)); await A.ui.wipe(false, 600); toast(r.msg); autosave(); },
    shrine: async () => { SFX.heal(); toast('The shrine\'s warmth restores the party.'); if (A.fast) return; const i = await A.ui.choose('Save your journey?', ['Slot 1', 'Slot 2', 'Slot 3', 'Not now']); if (i < 3) { writeSlot(i + 1); toast(`Saved to slot ${i + 1}.`); SFX.save(); } autosave(); },
    ending: () => (live() ? ending() : hang()),
    autosave: () => autosave(),
    push: () => A.field.push(),
    joined: async (id) => { const P = A.field.player; const fo = A.field.spawnActor('follow:' + id, CAST[id].look, id, P.x + 0.6, P.z + 0.4, P.dir); A.field.followers.push(fo); A.fx.burst('heal', P.x, P.y + 1, P.z, 20); SFX.levelup(); toast(`${HEROES[id].name} joined the party!`); },
    walk: (id, x, z) => (A.fast ? (A.field.entity(id) && Object.assign(A.field.entity(id), { x, z }), Promise.resolve()) : A.field.walkTo(id, x, z)),
    face: (id, d) => A.field.face(id, d), emote: (id, k) => { const e = A.field.entity(id); if (e) A.ui.emote(e, k); },
    wait: (t) => (A.fast ? Promise.resolve() : new Promise((r) => setTimeout(r, t * 1000))),
    fade: async (to, t) => { await A.ui.wipe(!!to, (t || 0.6) * 1000); },
    cam: async (x, z, o) => { A.field.setCam(x, z, o); if (!A.fast) await new Promise((r) => setTimeout(r, 700)); },
    camReset: () => A.field.resetCam(),
    fx: (k, x, z) => storyFX(k, x, z), shake: (a) => shake(a || 0.15), flash: (c) => flash(c || '#fff', 300, 0.6),
    light: (p) => { A.lighting.apply(p); A.field.refreshDynamic(); },
    hide: (id) => A.field.hide(id), show: (id) => A.field.show(id),
    flagChanged: () => { A.field.syncVisibility(); A.field.refreshDynamic(); },
    scriptDone: () => { A.field.syncVisibility(); A.field.refreshDynamic(); },
  });
  return W;
}
async function storyFX(k, x, z) {
  const F = A.field, fx = A.fx, y = F.player?.y || 0, wait = (ms) => new Promise((r) => setTimeout(r, A.fast ? 0 : ms));
  // FABLE: scripted VFX choreography for these story beats (gutter, snatch, roots withering, the beam, the Ember splitting)
  if (A.fast) { if (k === 'crack') { F.f.rootsOpen = true; } if (k === 'emberSplit') F.f.boss3 = true; F.refreshDynamic(); return; }
  if (k === 'gutter') { fx.burst('shadow', x, 1.2, z, 40, { speed: 1, up: 1.5 }); const L = F.built.lights.find((l) => l.id === 'shrine'); if (L) { const i0 = L.i; await tween(0.6, (t) => (L.i = i0 * (1 - 0.85 * Math.sin(t * Math.PI)))); } }
  else if (k === 'snatch') { fx.burst('shadow', x, 1.2, z, 50, { speed: 3, up: 2 }); SFX.dash(); await wait(400); }
  else if (k === 'crack') { fx.burst('dust', x, 1, z, 40, { speed: 3 }); fx.burst('fire', x, 1, z, 20); SFX.break(); F.f.rootsOpen = true; F.refreshDynamic(); await wait(500); }
  else if (k === 'rootsWither') { fx.burst('shadow', x, 1.5, z, 80, { speed: 2.5, up: 3 }); SFX.phase(); F.refreshDynamic(); await wait(700); }
  else if (k === 'shardflare') { fx.burst('shard', x, 1.5, z, 60, { speed: 2, up: 3, g: 0.5 }); flash('#ffd890', 500, 0.6); SFX.chapter(); await wait(900); }
  else if (k === 'beam') { F.refreshDynamic(); fx.burst('gold', x, 1.5, z, 90, { speed: 1.5, up: 6, g: -1, life: 1.6 }); SFX.chapter(); await wait(900); }
  else if (k === 'emberSplit') { F.f.boss3 = true; F.refreshDynamic(); for (let i = 0; i < 6; i++) { fx.burst('shard', x, 3.2, z, 40, { speed: 6, up: 5, g: 1, life: 2 }); await wait(160); } SFX.victory(); await wait(600); }
}

// ------------------------------------------------------------------ battles
async function startBattle(group, opts = {}) {
  const snap = serialize(A.s);
  const prevMode = A.mode === 'menu' ? 'field' : A.mode; A.mode = 'battle';
  A.ui.prompt(null); A.ui.closeDialog(); while (A.ui.stack.length) A.ui.pop(); A.ui.closeOverlay();
  if (A.fast && A.auto) {
    // headless fast path: sim only
    for (let tries = 0; tries < 8; tries++) {
      const b = simulate(A.s, GROUPS[group], { timing: () => A.autoTiming, block: () => A.autoTiming, preemptive: opts.preemptive });
      if (b.over === 'win') { b.commit(); const r = applyRewards(A.s, { rewards: { ...b.rewards, xp: Math.round(b.rewards.xp * (A.cfg.xpRate || 1)) } }); A.lastRewards = r; for (const id of A.s.party) if (A.s.heroes[id].hp <= 0) A.s.heroes[id].hp = 1; A.mode = 'field'; A.field.syncVisibility(); return 'win'; }
      Object.assign(A.s, deserialize(snap));
    }
    A.mode = 'field'; return 'lose';
  }
  SFX.encounter(); await A.ui.battleWipe();
  // FABLE: encounter transition (screen shatter / ember swirl) and battle intro camera sweep
  let r;
  try { r = await A.battle.run(group, opts); }
  catch (e) { console.error(e); r = 'win'; }
  if (r === 'win') { await A.battle.victory(); }
  else if (r === 'lose') {
    A.battle.end(); SFX.gameover();
    const c = await A.ui.gameOver();
    Object.assign(A.s, deserialize(snap));
    if (c === 'retry' || c === 'easy') { if (c === 'easy') A.s.difficulty = 'easy'; A.ui.clearBattleWipe(); return startBattle(group, opts); }
    if (c === 'load') { loadSlot('auto'); return new Promise(() => {}); }
    toTitle(); return new Promise(() => {});
  } else { A.battle.b.commit(); }
  A.battle.end();
  // restore the field's look
  A.field.resume();
  A.field.encounterCooldown = r === 'fled' ? 3 : 1.2;
  A.ui.clearBattleWipe(); A.mode = prevMode === 'battle' ? 'field' : prevMode;
  if (r === 'win') autosave();
  return r;
}
async function ending() {
  if (A.fast) { A.ended = true; return; }
  A.mode = 'cutscene';
  const lv = Math.max(...A.s.party.map((id) => A.s.heroes[id].lv));
  A.s.flags.cleared = true; writeSlot('clear');
  // FABLE: ending song + credits animation
  await A.ui.credits({ ...A.s.stats, time: A.s.time, lv, difficulty: A.s.difficulty });
  A.ended = true; toTitle();
}

// ------------------------------------------------------------------ encounters from the field
A.encounter = async (e, preemptive) => {
  if (A.mode !== 'field' || A.world.busy) return;
  if (preemptive) SFX.swing();
  const r = await A.world.touchEnemy(e.id, { preemptive });
  if (r === 'fled') e.stun = 3;
  A.field.syncVisibility();
};

// ------------------------------------------------------------------ saves
const autosave = A.autosave = () => { if (!A.s || A.mode === 'title' || A.s.flags.cleared) return; store.set(KEY.auto, { ...serialize(A.s), when: Date.now(), pos: A.field.player ? [A.field.player.x, A.field.player.z] : A.s.pos }); };
const writeSlot = A.writeSlot = (k) => { A.s.pos = [A.field.player.x, A.field.player.z]; A.s.dir = A.field.player.dir; store.set(k === 'clear' ? 'emberwake-clear' : KEY.slot(k), { ...serialize(A.s), when: Date.now() }); };
A.readSlot = (k) => store.get(k === 'auto' ? KEY.auto : KEY.slot(k));
const loadSlot = A.loadSlot = (k) => {
  const d = A.readSlot(k); const s = deserialize(d); if (!s) { toast('That save could not be read.'); return false; }
  A.ui.closeDialog(); while (A.ui.stack.length) A.ui.pop(); A.ui.closeOverlay(); A.battle.end();
  startGame(s, true); return true;
};
async function startGame(s, fromSave) {
  A.s = s; A.world = makeWorld(s); A.mode = 'field';
  $('#menu')?.classList.add('hide');
  document.body.classList.add('playing');
  await A.world.enter(s.map, s.pos, s.dir);
  if (fromSave) toast('Journey resumed.');
}
A.toTitle = toTitle;
function toTitle() { A.ui.closeDialog(); while (A.ui.stack.length) A.ui.pop(); A.ui.closeOverlay(); A.battle.end(); A.s = newGame('normal'); A.world = makeWorld(A.s); A.field.load('kindlewick', [16.5, 13], 'up'); A.field.setCam(16.5, 9, { zoom: 1.05 }); A.mode = 'title'; document.body.classList.remove('playing'); showTitle(); }

let menuEl = null;
function showTitle() {
  A.mode = 'title';
  const auto = A.readSlot('auto'); const sum = saveSummary(auto);
  if (!menuEl) {
    const m = startMenu({ title: 'Emberwake', subtitle: 'The Great Ember is going out. Keep the Wake — and find out who is snuffing the light.',
      options: [{ key: 'difficulty', label: 'Difficulty (new game)', value: A.cfg.difficulty in DIFFICULTY ? A.cfg.difficulty : 'normal', choices: [{ v: 'easy', label: 'Story' }, { v: 'normal', label: 'Normal' }, { v: 'hard', label: 'Hard' }] }],
      startLabel: sum ? 'Continue' : 'New Game',
      onStart: (v) => { if (A.readSlot('auto')) { loadSlot('auto'); } else newGameFlow(v.difficulty); } });
    menuEl = m;
    const card = m.el.querySelector('.sd-card');
    card.insertAdjacentHTML('beforeend', `<div class="sd-row ewrow"><button class="sd-btn" id="ewNew">New Game</button><button class="sd-btn" id="ewLoad">Load Game</button></div><div class="ewsave"></div><div class="ewhelp">Move <b>WASD / arrows / stick / touch pad</b> · Act <b>Enter / Space / Ⓐ</b> · Back <b>X / Ⓑ</b> · Menu <b>Esc / Start</b> · Boost <b>Q R / LB RB</b></div>`);
    card.querySelector('#ewNew').onclick = () => { SFX.confirm(); m.hide(); newGameFlow(m.values.difficulty); };
    card.querySelector('#ewLoad').onclick = () => { SFX.confirm(); loadPicker(); };
  } else menuEl.show();
  const sv = menuEl.el.querySelector('.ewsave');
  sv.innerHTML = sum ? `Autosave — ${MAPS[sum.map]?.name || ''} · Lv ${sum.lv} · ${Math.floor(sum.time / 60)} min` : '';
  menuEl.el.querySelector('#sd-start').textContent = sum ? 'Continue' : 'New Game';
  menuEl.el.querySelector('#ewNew').style.display = sum ? '' : 'none';
  A.ui.stack.length = 0;
}
function loadPicker() {
  const rows = ['auto', 1, 2, 3].map((k) => [k, saveSummary(A.readSlot(k))]).filter(([, s]) => s);
  if (!rows.length) { toast('No saved journeys yet.'); return; }
  A.ui.choose('Load which journey?', [...rows.map(([k, s]) => `${k === 'auto' ? 'Autosave' : 'Slot ' + k} — ${MAPS[s.map]?.name} · Lv ${s.lv}`), 'Cancel']).then((i) => { if (i < rows.length) { menuEl.hide(); loadSlot(rows[i][0]); } });
}
function newGameFlow(diff) {
  const s = newGame(diff in DIFFICULTY ? diff : 'normal'); s.gold = +A.cfg.startGold || 40;
  menuEl?.hide(); hostMsg('start');
  return startGame(s, false);
}
function openMenu() { if (A.mode !== 'field' || A.world.busy || A.field.busy || A.ui.blocking()) return; SFX.confirm(); A.mode = 'menu'; A.ui.openMenu().then(() => { if (A.mode === 'menu') A.mode = 'field'; }); }

// ------------------------------------------------------------------ frame
let simClock = 0;
function step(dt, t) {
  pollPad(dt);
  const uiHad = A.ui.input();
  if (A.mode === 'title' && !uiHad && I.take('confirm') && !document.querySelector('#menu.hide')) document.getElementById('sd-start')?.click();
  if (!uiHad && A.mode === 'field' && !A.world.busy && !A.field.busy && (I.take('pause') || I.take('menu'))) openMenu();
  if (A.mode !== 'title' && A.mode !== 'boot' && A.s && !(A.ui.stack.length && A.mode === 'menu')) A.s.time += dt;
  updateTweens(dt);
  if (A.mode === 'battle') A.battle.update(dt, t);
  else { A.field.update(dt, t); if (A.mode === 'title') A.field.cam.over = { x: 16.5 + Math.sin(t * 0.07) * 3, z: 8.5 }; }
  A.ui.update(dt);
  A.fx.update(dt, A.camera, A.mode === 'battle' ? null : A.field.cam);
  applyShake(A.camera, dt);
  const c = window.__cam; if (c) { c.counts = { mode: A.mode, map: A.s?.map, actors: A.field.ents.size }; c.player = { x: A.field.player?.x, z: A.field.player?.z }; c.dataReady = true; }
  I.clear();
}

// ------------------------------------------------------------------ test hooks (__cam.game)
function hooks() {
  const sim = (sec) => { const n = Math.ceil(sec * 30); for (let i = 0; i < n; i++) step(1 / 30, (simClock += 1 / 30)); };
  return {
    state: () => ({ mode: A.mode, map: A.s?.map, pos: A.field.player ? [+A.field.player.x.toFixed(2), +A.field.player.z.toFixed(2)] : null, flags: { ...A.s?.flags }, gold: A.s?.gold, party: A.s?.party.map((id) => `${id}:${A.s.heroes[id].lv}`), inv: { ...A.s?.inv }, ended: !!A.ended, busy: A.world?.busy, ui: A.ui.stack.length, dlg: A.ui.dlgOpen }),
    newGame: (d = 'normal') => newGameFlow(d),
    warp: async (m, x, z, d = 'down') => { if (A.mode === 'battle') return 'in battle'; await A.world.enter(m, [x ?? MAPS[m].start[0], z ?? MAPS[m].start[1]], d); A.field.encounterCooldown = 6; },
    fast: (on = true) => { A.fast = on; },
    autoBattle: (on = true, q = 1) => { A.auto = on; A.autoTiming = q; },
    battle: (g, o) => startBattle(g, o || {}),
    sim, press: (a) => I.press(a), hold: (a, on = true) => (on ? I.down.add(a) : I.down.delete(a)),
    advance: () => A.ui.advance(), talk: (id) => A.world.talk(id), touch: (id) => A.world.touchEnemy(id), interact: () => A.field.interact(),
    menu: () => openMenu(), shop: (id) => A.ui.openShop(id), cam: (x, z, zoom) => A.field.setCam(x, z, { zoom }), camReset: () => A.field.resetCam(),
    setFlags: (o) => { Object.assign(A.s.flags, o); A.field.syncVisibility(); A.field.refreshDynamic(); },
    party: (ids, lv) => { for (const id of ids) { if (!A.s.party.includes(id)) A.s.party.push(id); if (!A.s.heroes[id]) A.s.heroes[id] = { lv: 1, xp: 0, hp: 1, mp: 1, eq: { ...HEROES[id].start } }; if (lv) A.s.heroes[id].lv = lv; } restParty(A.s); },
    // story jump: replay the reference walkthrough (fast + auto battles) up to op index n
    story: async (n = WALKTHROUGH.length) => {
      A.fast = true; A.auto = true; A.autoTiming = 1;
      if (A.mode === 'title' || !A.s.flags.introStarted) await newGameFlow('normal');
      const W = () => A.world, s = () => A.s, probs = [];
      for (const op of WALKTHROUGH.slice(0, n)) {
        const [k, a, b, c] = op;
        try {
          if (k === 'enter') { if (s().map !== a) await W().enter(a, MAPS[a].start, 'up'); }
          else if (k === 'talk') await W().talk(a); else if (k === 'touch') await W().touchEnemy(a); else if (k === 'trig') await W().trig(a);
          else if (k === 'chest') await W().openChest(a); else if (k === 'shrine') await W().useShrine(a); else if (k === 'exit') await W().exitTo(a);
          else if (k === 'buy') buy(s(), a, b, c); else if (k === 'equip') equip(s(), a, b);
          else if (k === 'inn') { const t = MAPS[s().map].npcs.find((x) => /^inn/.test(x.id)); await W().talk(t.id); }
        } catch (e) { probs.push(op.join(' ') + ': ' + e.message); }
      }
      A.fast = false; A.auto = false; A.field.syncVisibility(); A.field.refreshDynamic();
      return { probs, state: hooks().state() };
    },
  };
}
boot();
