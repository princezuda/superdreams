// Game modes: Campaign (3 missions with segments, checkpoints, briefings, finale), Skirmish (TDM vs bots),
// Holdout (waves + buy stations), Dropzone (solo battle-royale-lite: drop, loot tiers, storm, quick-build).
import { THREE, toast, store, shake } from '/shared/sd-kit.js';
import { WEAPONS, PRIMARIES, TIERS, GRENADES } from './config.js';
import { stormPhases, stormAt, nextCenter, rng, rollTier, clamp, DEG, wrapAngle } from './logic.js';
import { Overseer } from './boss.js';
import { Builds } from './build.js';
import { pickBark } from './ai.js';

const fmt = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

class Mode {
  constructor(g, o) { this.g = g; this.o = o; this.t = 0; }
  get mapId() { return this.o.map || 'dockyard'; }
  setLoadout(ids, tiers) { const a = this.g.arsenal; a.setLoadout(ids, tiers); a.frags = 2; a.smokes = 1; }
  spawnPlayer(x, z, yaw = 0, y) { const p = this.g.player; p.spawn(x, y, z, yaw); this.g.deathCam = null; document.getElementById('death')?.remove(); }
  enemy(x, z, o = {}) { return this.g.addBot({ x, z, team: 'B', ...o }); }
  say(who, line, team = 'A') { this.g.hud.bark({ name: who, team, radio: true, x: this.g.player.pos.x, y: this.g.player.pos.y, z: this.g.player.pos.z, alive: false, scale: 1 }, line); }
  deathScreen(title, sub, tip) {
    document.getElementById('death')?.remove();
    document.body.insertAdjacentHTML('beforeend', `<div id="death"><div><div class="d1">${title}</div><div class="d2">${sub}</div>${tip ? `<div class="d3">${tip}</div>` : ''}</div></div>`);
  }
  objText() { return this.objective; }
  setObj(title, text, sub = '', prog = null) { this.objective = text; this.g.hud.objective(title, text, sub, prog); }
  marker(x, y, z, label = '', cls = '') { const m = { x, y, z, label, cls }; this.g.hud.markers.push(m); return m; }
  clearMarkers() { this.g.hud.markers.length = 0; this.g.hud.objWorld = null; }
  update() {}
}

// ======================================================================= CAMPAIGN
const TIPS = ['Health regenerates in cover — break line of sight and wait a beat.', 'Enemies flank when you camp one spot. Relocate between fights.', 'A scope glint means a marksman is lining up a shot — break line of sight.', 'Grenade indicator on screen? Move away from the arrow, fast.', 'Tactical reloads are faster than empty ones. Reload behind cover.', 'Smoke blocks enemy vision completely — use it to cross open ground.', 'Crouched and still, you are much harder to spot.'];

export const MISSIONS = [
  { id: 0, title: 'Low Tide', mapId: 'dockyard', mapName: 'Saltmarsh Docks', time: 'night', length: '~12 min', loadout: ['ar', 'pistol'],
    briefing: { loc: 'Saltmarsh Docks · 02:40 local · heavy rain', title: 'Mission 1 — Low Tide', objectives: ['Infiltrate via the west quay', 'Clear the container yard', 'Breach the pump house', 'Recover the guidance drive', 'Extract by boat on the east quay'],
      text: 'A smuggling cell calling itself Black Tide has moved a stolen guidance package through Saltmarsh. Intel puts the drive in the brick pump house on the north compound.\n\nCome in along the west quay under the rain, clear the container yard, breach the pump house and pull the drive. Your boat waits at the east quay.\n\nHale and Ortega are on your wing. Keep it tight.' } },
  { id: 1, title: 'Sunline', mapId: 'village', mapName: 'Calvera', time: 'day', length: '~12 min', loadout: ['ar', 'dmr'],
    briefing: { loc: 'Calvera · 14:10 local · clear skies', title: 'Mission 2 — Sunline', objectives: ['Advance up the hill road', 'Silence the bell-tower marksman', 'Plant the jammer on the relay mast', 'Hold until the jammer burns through', 'Exfil from the church plateau'],
      text: 'The drive pointed us to Calvera. Black Tide uses the relay mast in the village plaza to stitch their network across the valley, and a marksman in the bell tower owns the approach road.\n\nWork up the road using the field walls, put the tower out of action, then plant a jammer on the mast and hold the plaza while it burns through.\n\nYou are carrying a marksman rifle as your second weapon. Use it.' } },
  { id: 2, title: 'Furnace', mapId: 'plant', mapName: 'Kessler Works', time: 'dusk', length: '~15 min', loadout: ['ar', 'shotgun'],
    briefing: { loc: 'Kessler Works · 19:55 local · industrial haze', title: 'Mission 3 — Furnace', objectives: ['Breach the outer yard', 'Plant charges on three coolant pumps', 'Reach the control block roof', 'Destroy the Overseer gunship'],
      text: 'Black Tide is turning Kessler Works into a drone foundry, and their prototype heavy gunship — the Overseer — is fuelled on the pad.\n\nPlant charges on the three coolant pumps to bring the plant down, then get to the control block roof for pickup.\n\nIf the Overseer launches, its armour is too thick for small arms. Wait for it to vent and hit the coolant ports.' } },
];

class Campaign extends Mode {
  constructor(g, o) { super(g, o); this.kind = 'campaign'; this.m = MISSIONS[o.mission || 0]; this.seg = o.seg || 0; this.title = this.m.title; this.briefing = (o.seg || 0) === 0 ? this.m.briefing : null; this.segs = SEGMENTS[this.m.id]; }
  get mapId() { return this.m.mapId; }
  get time() { return this.g.cfg.time[this.m.mapId] || this.m.time; }
  start() {
    const g = this.g; g.player.team = 'A';
    this.allies = [];
    this.startSeg(this.seg, true);
    g.hud.banner(this.m.title.toUpperCase(), this.m.mapName, 3000);
    g.hud.teach('move');
  }
  startSeg(i, fresh = false) {
    const g = this.g; this.seg = i; this.segT = 0; this.segData = {}; const S = this.segs[i];
    store.set('strikepoint-campaign', { mission: this.m.id, seg: i });
    if (fresh) {
      // checkpoint restart: nearest authored checkpoint at or before this segment, full ammo
      let cp = null; for (let k = i; k >= 0 && !cp; k--) cp = this.segs[k].cp;
      const ld = this.m.loadout; const prim = g.cfg.loadout.primary === ld[1] ? 'ar' : g.cfg.loadout.primary;
      this.setLoadout([prim, ld[1]]);
      this.spawnPlayer(cp[0], cp[1], cp[2], cp[3]);
      if (this.allyCount() && this.allies.length === 0) this.spawnAllies(cp);
      else for (const a of this.allies) { a.x = cp[0] + (Math.random() - 0.5) * 3; a.z = cp[1] + 2 + Math.random() * 2; a.y = g.world.groundAt(a.x, a.z); a.health = a.maxHealth; a.alive = true; a.deadT = 0; a.state = 'roam'; a.path = null; }
    }
    this.clearMarkers(); this.segEnemies = [];
    S.enter(this, g);
    this.setObj(`${this.m.title} · ${i + 1}/${this.segs.length}`, S.obj, S.sub || '');
  }
  allyCount() { return this.m.id === 1 ? 1 : 2; }
  spawnAllies(cp) {
    const g = this.g; const names = ['Hale', 'Ortega'];
    for (let k = 0; k < this.allyCount(); k++) {
      const a = g.addBot({ x: cp[0] + (k ? 1.5 : -1.5), z: cp[1] + 2.5, team: 'A', name: names[k], weapon: k ? 'smg' : 'ar', state: 'roam', hp: 220 });
      a.ally = true; a.leash = 16; a.roam = (b) => { const P = g.player.pos; const off = b.name === 'Hale' ? [-2.2, 2.5] : [2.2, 3.0]; const d = Math.hypot(P.x - b.x, P.z - b.z); if (d < 4.5) return null; g.player.forward(_f); return [P.x + _f.x * -off[1] + -_f.z * off[0], P.z + _f.z * -off[1] + _f.x * off[0]]; };
      this.allies.push(a);
    }
  }
  spawnGroup(list, opts = {}) {
    const sq = this.g.squad('B'); const out = [];
    for (const e of list) { const b = this.enemy(e[0], e[1], { yaw: e[2] ?? 0, weapon: e[3] ?? opts.weapon, kind: e[4] ?? 'soldier', patrol: e[5], ...opts.extra, ...(e[6] || {}) }); sq.add(b); out.push(b); this.segEnemies.push(b); }
    return out;
  }
  update(dt) {
    const g = this.g; this.t += dt; this.segT += dt;
    // allies: never permanently lost — they regroup
    for (const a of this.allies) { if (!a.alive && a.deadT > 6) { a.alive = true; a.deadT = 0; a.health = a.maxHealth * 0.6; a.state = 'roam'; a.say = 1; const P = g.player.pos; a.x = P.x - 2; a.z = P.z + 2; a.y = g.world.floorAt(a.x, a.z, 0.3, P.y + 2, 3); g.hud.bark(a, 'Back in it — patched up.'); } if (a.alive && a.state === 'combat' && Math.hypot(a.x - g.player.pos.x, a.z - g.player.pos.z) > a.leash) { a.releaseCover(); a.state = 'roam'; } }
    if (!g.player.alive) { this.deadT = (this.deadT || 0) + dt; if (this.deadT > 3.2) { this.deadT = 0; this.restart(); } return; }
    const S = this.segs[this.seg];
    if (S.update(this, g, dt)) {
      S.done?.(this, g); g.stats.objectives++; g.audio.ui('objective'); g.hud.xp(250, 'OBJECTIVE');
      if (this.seg + 1 >= this.segs.length) return this.complete();
      g.hud.banner('Objective complete', this.segs[this.seg + 1].obj, 2600);
      this.startSeg(this.seg + 1);
    }
  }
  restart() {
    const g = this.g; document.getElementById('death')?.remove();
    for (const b of [...g.bots]) if (!b.ally) g.removeBot(b);
    for (const b of g.bosses || []) b.dispose(); g.bosses = [];
    g.grenades.clear(); g.interactables.length = 0; g.slowmo = false; g.player.alive = true; g.deathCam = null; g.combatants = [g.player, ...g.bots];
    this.segs[this.seg].reset?.(this, g);
    const ld = this.lastLoadout || null; void ld;
    this.startSeg(this.seg, true);
    g.hud.banner('Checkpoint', this.segs[this.seg].obj, 1800);
  }
  onPlayerDeath(k) { this.deathScreen('Killed in action', 'Restarting from checkpoint', TIPS[Math.floor(Math.random() * TIPS.length)]); }
  onKill(v, k) { if (v.team === 'B' && Math.random() < 0.35) { const a = this.allies.find((x) => x.alive); if (a && k?.isPlayer) a.bark('ally'); } }
  complete() {
    const g = this.g; const next = this.m.id + 1 < MISSIONS.length ? this.m.id + 1 : null; store.set('strikepoint-campaign', next !== null ? { mission: next, seg: 0 } : null);
    g.hud.banner('Mission complete', this.m.title, 3000); g.audio.ui('level');
    setTimeout(() => g.app.endMatch({ title: next === null ? 'Strikepoint secured' : 'Mission complete', sub: next === null ? 'The Overseer is scrap and Kessler Works is burning. Black Tide is finished — thank you for playing the campaign.' : `${this.m.title} — ${this.m.mapName}`, won: true, next, unlock: (next ?? this.m.id) , missionDone: this.m.id, extra: next === null ? '<p>Try Holdout for a ten-wave last stand, Skirmish for team fights, or Dropzone for a solo battle royale with building.</p>' : '' }), 2600);
    this.done = true;
  }
  debugComplete() { this.segData.force = true; }
}
const _f = new THREE.Vector3();
const reach = (g, x, z, r) => Math.hypot(g.player.pos.x - x, g.player.pos.z - z) < r;
const alive = (list) => list.filter((b) => b.alive).length;

// Door helper for breaches: a separate mesh + collider we can blow away.
function makeDoor(g, x, z, w, h, alongX = true) {
  const geo = new THREE.BoxGeometry(alongX ? w : 0.14, h, alongX ? 0.14 : w); const mat = new THREE.MeshStandardNodeMaterial({ color: 0x5a4632, roughness: 0.7, metalness: 0.2 });
  const m = new THREE.Mesh(geo, mat); const y = g.world.floorAt(x, z, 0.2, 5, 5); m.position.set(x, y + h / 2, z); m.castShadow = true; g.level.add(m);
  const col = g.world.add(x - (alongX ? w / 2 : 0.1), y, z - (alongX ? 0.1 : w / 2), x + (alongX ? w / 2 : 0.1), y + h, z + (alongX ? 0.1 : w / 2), 'wood');
  return { mesh: m, col, blow() { g.world.remove(col); g.level.remove(m); for (let i = 0; i < 14; i++) g.fx.chip(x + (Math.random() - 0.5) * w, y + Math.random() * h, z, (Math.random() - 0.5) * 3, 2 + Math.random() * 3, -4 - Math.random() * 4, 0.05 + Math.random() * 0.08, 0x5a4632, 3); } };
}

const SEGMENTS = [
  // ---------------------------------------------------------------- Mission 1: Low Tide (dockyard)
  [
    { obj: 'Move up the west quay', sub: 'Stay low — get under the pipe and over the wall', cp: [-65, 42, 0],
      enter(m, g) { m.marker(-65, 1.5, 18, 'Rally'); g.hud.objWorld = { x: -65, z: 18 }; setTimeout(() => m.say('Overwatch', 'Rain is covering you. Quay is quiet — move.'), 1500); },
      update(m, g) { const P = g.player.pos; if (P.z < 33.5 && !m.segData.c) { m.segData.c = 1; g.hud.teach('crouch'); } if (P.z < 27 && !m.segData.v) { m.segData.v = 1; g.hud.teach('mantle', true); } return P.z < 21.5 || m.segData.force; } },
    { obj: 'Clear the container yard', sub: 'Black Tide sentries in the lanes', cp: null,
      enter(m, g) {
        const E = m.spawnGroup([[-44, 16, 1.6, 'ar', 'soldier', [[-44, 16], [-30, 16]]], [-36, 6, 3.1, 'ar', 'soldier', [[-36, 6], [-20, 5]]], [-22, 18, 2, 'smg'], [-10, 7, 1.4, 'ar', 'soldier', [[-10, 7], [-10, 18]]], [2, 16, 1.5, 'shotgun'], [-14, 22, 1.6, 'dmr', 'soldier', null, { y: 2.6 }]]);
        E[5].y = 2.6; E[5].stationary = true; E[5].role = 'marksman';
        m.marker(-20, 2, 12, 'Yard'); g.hud.objWorld = { x: -20, z: 12 }; m.say('Hale', 'Lights in the yard. Six, maybe more.'); g.hud.teach('lean');
      },
      update(m, g) { const n = alive(m.segEnemies); g.hud.objective(`${m.m.title} · 2/5`, 'Clear the container yard', `${n} hostile${n === 1 ? '' : 's'} remaining`); if (!m.segData.ads && g.bots.some((b) => b.team === 'B' && b.state === 'combat')) { m.segData.ads = 1; g.hud.teach('ads'); } return n === 0 || m.segData.force; },
      done(m) { m.say('Overwatch', 'Yard is clear. Pump house is north of you — breach it.'); } },
    { obj: 'Breach the pump house', sub: 'Plant a charge on the south door', cp: [-20, 12, Math.PI],
      enter(m, g) {
        m.door = makeDoor(g, 10, -29, 1.8, 2.3, true);
        m.spawnGroup([[0, -24, 0, 'ar', 'soldier', [[0, -24], [20, -24]]], [24, -26, 0, 'smg'], [-4, -20, 0.5, 'ar']]);
        m.inside = m.spawnGroup([[6, -33, Math.PI, 'shotgun'], [13, -33, Math.PI, 'ar'], [8, -37, Math.PI, 'smg'], [15.6, -38, Math.PI, 'ar']]);
        for (const b of m.inside) { b.stationary = false; b.state = 'idle'; b.guardYaw = 0; }
        m.marker(10, 2.2, -28.6, 'Breach'); g.hud.objWorld = { x: 10, z: -28.6 };
        const it = g.addInteract({ x: 10, z: -28.2, y: 0, r: 2.0, hold: 1.6, label: 'to plant breach charge', onDone: () => {
          m.segData.planted = true; g.hud.prompt('Charge set — <b>stand clear</b>', null, 2.4); let n = 3; const beep = setInterval(() => { g.audio.beep(10, 1, -28.6, 1800); if (--n <= 0) clearInterval(beep); }, 600);
          setTimeout(() => { m.door.blow(); g.explode(10, 1.2, -28.6, { radius: 3.5, dmg: 80, owner: g.player, small: true }); g.slowmo = true; g.hud.banner('BREACH', '', 1400); for (const b of m.inside) { b.reactT = 1.4; b.stagger = 0.8; b.enterCombat(); b.target = g.player; b.aware = 1.2; } setTimeout(() => { g.slowmo = false; }, 1700); }, 1900);
        } });
        void it;
      },
      reset(m, g) { },
      update(m, g) { const n = alive(m.inside || []); if (m.segData.planted) g.hud.objective(`${m.m.title} · 3/5`, 'Clear the pump house', `${n} inside`); return (m.segData.planted && n === 0) || m.segData.force; },
      done(m) { m.say('Ortega', 'Room clear! Drive should be at the terminal.'); } },
    { obj: 'Recover the guidance drive', sub: 'Hold the terminal while the drive copies', cp: [10, -30.5, Math.PI],
      enter(m, g) {
        if (!m.door || !g.level.children.includes(m.door.mesh)) { /* door already gone */ } else m.door.blow();
        m.marker(12.2, 2.6, -36, 'Terminal'); g.hud.objWorld = { x: 12.2, z: -36 }; m.segData.dl = 0;
        g.addInteract({ x: 10.7, z: -36, y: 0, r: 1.9, hold: 1.2, label: 'to start the download', onDone: () => {
          m.segData.started = true; m.say('Overwatch', 'Download running. They know you are there — hold that room.');
          m.spawnGroup([[50, -30, 1.6, 'ar'], [52, -26, 1.6, 'smg'], [48, -34, 1.6, 'ar'], [56, -20, 1.6, 'shotgun']], { extra: { state: 'combat', aggro: 0.6 } }).forEach((b) => { b.target = g.player; b.lastSeen = { x: 10, y: 1.4, z: -34, t: g.time }; });
          setTimeout(() => { if (m.seg === 3) m.spawnGroup([[-30, -44, -1.6, 'ar'], [-24, -46, -1.6, 'smg'], [-34, -40, -1.6, 'ar'], [-20, -22, 0, 'ar', 'drone']], { extra: { state: 'combat', aggro: 0.5 } }).forEach((b) => { b.target = g.player; b.lastSeen = { x: 10, y: 1.4, z: -34, t: g.time }; }); }, 16000);
        } });
      },
      update(m, g, dt) { if (m.segData.started) { m.segData.dl = Math.min(1, m.segData.dl + dt / 45); g.hud.objective(`${m.m.title} · 4/5`, 'Hold the pump house — download running', `${Math.round(m.segData.dl * 100)}%`, m.segData.dl); } return (m.segData.dl >= 1) || m.segData.force; },
      done(m) { m.say('Overwatch', 'Drive is ours. Boat is waiting on the east quay — go!'); } },
    { obj: 'Extract by boat — east quay', sub: 'Push through the truck yard', cp: [10, -30.5, Math.PI],
      enter(m, g) {
        m.marker(62, 1.5, 44, 'Extract'); g.hud.objWorld = { x: 62, z: 44 };
        m.spawnGroup([[48, 12, 3.1, 'ar'], [58, 4, 3.1, 'smg'], [44, 26, 3.1, 'ar'], [60, 28, 3.1, 'shotgun'], [52, 20, 3.1, 'lmg', 'heavy']]);
        m.spawnGroup([[40, 10, 0, 'smg', 'drone'], [56, 16, 0, 'smg', 'drone']]);
        // the boat
        const boat = new THREE.Group(); const hull = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.2, 8), new THREE.MeshStandardNodeMaterial({ color: 0x2a3036, roughness: 0.5 })); hull.position.y = 0.6; boat.add(hull);
        const cab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.3, 2.2), new THREE.MeshStandardNodeMaterial({ color: 0x8a9098, roughness: 0.5 })); cab.position.set(0, 1.7, 1.2); boat.add(cab);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(0.3, 4, 0.6) })); lamp.position.set(0, 2.5, 1.2); boat.add(lamp);
        boat.position.set(62, -1.9, 51); g.level.add(boat);
      },
      update(m, g) { return reach(g, 62, 44.5, 3.5) || m.segData.force; } },
  ],
  // ---------------------------------------------------------------- Mission 2: Sunline (village)
  [
    { obj: 'Advance up the hill road', sub: 'Use the field walls — the tower overwatches the road', cp: [0, 62, 0],
      enter(m, g) {
        m.spawnGroup([[-10, 34, 3.1, 'ar', 'soldier', [[-10, 34], [-2, 34]]], [12, 38, 3.1, 'ar'], [-14, 46, 3.1, 'smg', 'soldier', [[-14, 46], [-6, 46]]], [14, 52, 3.1, 'shotgun'], [2, 28, 3.1, 'ar']]);
        m.sniper = m.enemy(-4, -50, { weapon: 'dmr', role: 'sniper', stationary: true, hp: 100, y: g.world.floorAt(-4, -50, 0.3, 30, 30) + 0.0 }); m.sniper.y = g.world.terrain(-4, -50) + 12.66; m.sniper.yaw = Math.PI; m.sniper.aware = 0.2;
        m.marker(0, 1.5, 30, 'Village'); g.hud.objWorld = { x: 0, z: 30 }; m.say('Kaya', 'Marksman in the bell tower. Watch for the glint.', 'A');
      },
      update(m, g) { const n = alive(m.segEnemies); g.hud.objective(`${m.m.title} · 1/5`, 'Advance up the hill road', `${n} on the road`); if (m.sniper.alive && m.sniper.glintT > 0) { m.sniper.glintT = Math.max(0, m.sniper.glintT - 0.05); g.fx.glow(m.sniper.x, m.sniper.y + 1.5, m.sniper.z, 0.9 + Math.random() * 0.6, 0.06, 4, 4, 3.5); } return (n === 0 && g.player.pos.z < 34) || m.segData.force; } },
    { obj: 'Silence the bell-tower marksman', sub: 'Swap to the marksman rifle', cp: [0, 32, 0],
      enter(m, g) { m.segEnemies = [m.sniper]; m.spawnGroup([[-12, 18, 3.1, 'ar'], [12, 20, 3.1, 'smg'], [-4, 14, 3.1, 'ar']]); m.marker(-4, 19, -50, 'Marksman'); g.hud.objWorld = { x: -4, z: -50 }; g.hud.teach('swap'); },
      update(m, g) { if (m.sniper.alive && m.sniper.charge > 0 && Math.random() < 0.5) g.fx.glow(m.sniper.x, m.sniper.y + 1.5, m.sniper.z, 0.8 + Math.random() * 0.8, 0.06, 5, 5, 4.5); return !m.sniper.alive || m.segData.force; },
      done(m) { m.say('Kaya', 'Tower is quiet. Get that jammer on the mast.', 'A'); } },
    { obj: 'Plant the jammer on the relay mast', sub: 'Plaza — expect resistance', cp: [0, 22, 0],
      enter(m, g) {
        m.spawnGroup([[-6, -8, 0, 'ar'], [8, -10, 0, 'smg'], [-12, 4, 1.6, 'shotgun'], [14, 2, -1.6, 'ar'], [0, -18, 0, 'ar', 'soldier', [[0, -18], [-12, -20]]]]);
        m.marker(6, 2.2, -2.5, 'Relay'); g.hud.objWorld = { x: 6, z: -2.5 };
        g.addInteract({ x: 6, z: -1.4, y: 0, r: 2.0, hold: 2.5, label: 'to plant the jammer', onDone: () => { m.segData.planted = true; } });
      },
      update(m, g) { return m.segData.planted || m.segData.force; } },
    { obj: 'Hold the plaza — jammer burning through', sub: 'Enemies converge from the gates and the stairs', cp: [6, 2, Math.PI],
      enter(m, g) { m.segData.p = 0; m.segData.wave = 0; m.segData.nextWave = 2; m.marker(6, 2.2, -2.5, 'Jammer'); g.hud.objWorld = { x: 6, z: -2.5 }; m.say('Overwatch', 'Jammer is live. Ninety seconds. They will come for it.'); },
      update(m, g, dt) {
        const d = m.segData; const near = g.bots.some((b) => b.alive && b.team === 'B' && Math.hypot(b.x - 6, b.z + 2.5) < 4);
        if (!near) d.p = Math.min(1, d.p + dt / 90);
        g.hud.objective(`${m.m.title} · 4/5`, near ? 'Hostile at the jammer — clear it!' : 'Hold the plaza — jammer burning through', `${Math.round(d.p * 100)}%`, d.p);
        d.nextWave -= dt;
        if (d.nextWave <= 0 && d.wave < 3) {
          const W = [[[-52, 0], [-50, 2], [-52, -2], [-48, 1]], [[52, 0], [50, -2], [52, 2], [50, 1], [48, -1]], [[0, -44], [-4, -42], [4, -44], [8, -42], [-8, -44]]][d.wave];
          m.spawnGroup(W.map(([x, z], i) => [x, z, 0, ['ar', 'smg', 'ar', 'shotgun', 'ar'][i % 5]]), { extra: { state: 'combat', aggro: 0.6 } }).forEach((b) => { b.target = g.player; b.lastSeen = { x: 6, y: 1.4, z: -2, t: g.time }; b.aware = 1.1; });
          g.hud.banner(['West gate!', 'East gate!', 'From the stairs!'][d.wave], 'Contact', 1800); d.wave++; d.nextWave = 26;
        }
        return d.p >= 1 || d.force;
      },
      done(m) { m.say('Overwatch', 'Network is down. Exfil from the church plateau.'); } },
    { obj: 'Exfil — church plateau', sub: 'Climb the stairs north of the village', cp: [6, 2, Math.PI],
      enter(m, g) { m.spawnGroup([[-6, -46, 0, 'ar'], [8, -46, 0, 'ar'], [0, -56, 0, 'lmg', 'heavy'], [14, -50, 0, 'smg']]); m.marker(0, 6.5, -54, 'LZ'); g.hud.objWorld = { x: 0, z: -54 }; },
      update(m, g) { return (reach(g, 0, -54, 4) && alive(m.segEnemies) <= 1) || m.segData.force; } },
  ],
  // ---------------------------------------------------------------- Mission 3: Furnace (plant)
  [
    { obj: 'Breach the outer yard', sub: 'Rail siding — Black Tide pickets', cp: [-60, 44, Math.PI * 0.75],
      enter(m, g) { m.spawnGroup([[-40, 40, 2.4, 'ar'], [-30, 36, 2.4, 'smg', 'soldier', [[-30, 36], [-14, 38]]], [-20, 22, 2.4, 'ar'], [-50, 22, 2.4, 'shotgun'], [-8, 34, 2.4, 'ar']]); m.marker(-24, 1.5, 26, 'Yard'); g.hud.objWorld = { x: -24, z: 26 }; m.say('Hale', 'Pickets on the siding. Clear them and we move on the pumps.'); g.hud.teach('nade'); },
      update(m, g) { const n = alive(m.segEnemies); g.hud.objective(`${m.m.title} · 1/4`, 'Breach the outer yard', `${n} hostile${n === 1 ? '' : 's'}`); return n === 0 || m.segData.force; } },
    { obj: 'Plant charges on the coolant pumps', sub: '0 / 3 planted', cp: [-24, 26, Math.PI],
      enter(m, g) {
        m.spawnGroup([[-44, 2, 0, 'ar'], [-50, 12, 0, 'smg'], [-40, 14, 0, 'ar']]);
        m.spawnGroup([[4, -34, 0, 'ar'], [16, -36, 0, 'ar'], [10, -44, 0, 'shotgun'], [0, -40, 0, 'smg', 'drone']]);
        m.spawnGroup([[38, 22, 0, 'ar'], [50, 26, 0, 'lmg', 'heavy'], [44, 32, 0, 'smg']]);
        m.spawnGroup([[-8, 4, 0, 'shotgun'], [8, 6, 0, 'ar'], [0, -8, 0, 'smg'], [12, -6, 0, 'ar']]);
        m.segData.n = 0; const P = [[-46, 8], [10, -38], [44, 26]];
        m.pumpMarks = P.map(([x, z], i) => m.marker(x, 2.6, z, 'Pump ' + 'ABC'[i]));
        P.forEach(([x, z], i) => g.addInteract({ x, z, y: 0, r: 2.6, hold: 2.2, label: `to plant charge on pump ${'ABC'[i]}`, onDone: () => { m.segData.n++; m.pumpMarks[i].label = 'Armed'; m.pumpMarks[i].cls = 'ally'; g.fx.glow(x, 2.2, z, 1, 0.4, 4, 0.5, 0.2); g.audio.ui('objective'); m.say('Overwatch', `Pump ${'ABC'[i]} armed. ${3 - m.segData.n} to go.`); } }));
      },
      update(m, g) { g.hud.objective(`${m.m.title} · 2/4`, 'Plant charges on the coolant pumps', `${m.segData.n} / 3 planted`); const P = g.player.pos; let best = null, bd = 1e9; [[-46, 8], [10, -38], [44, 26]].forEach(([x, z], i) => { if (m.pumpMarks[i].label === 'Armed') return; const d = Math.hypot(x - P.x, z - P.z); if (d < bd) { bd = d; best = { x, z }; } }); g.hud.objWorld = best; return m.segData.n >= 3 || m.segData.force; },
      done(m, g) { m.say('Overwatch', 'All charges armed. Get to the control block roof — the Overseer is spinning up!'); } },
    { obj: 'Reach the control block roof', sub: 'Stairs on the east side of the block', cp: [0, 18, Math.PI],
      enter(m, g) {
        m.marker(-37, 8.5, -41, 'Roof'); g.hud.objWorld = { x: -37, z: -41 }; g.atm.u.flash.value = 0;
        m.spawnGroup([[-20, -30, 0, 'ar'], [-30, -14, 0, 'smg'], [-12, -46, 0, 'ar'], [-52, -24, 0, 'shotgun'], [-26, -40, 0, 'ar', 'drone'], [-40, -20, 0, 'smg', 'drone']], { extra: { state: 'combat', aggro: 0.4 } }).forEach((b) => { b.target = g.player; b.lastSeen = { x: g.player.pos.x, y: 1.4, z: g.player.pos.z, t: g.time }; b.aware = 1.1; });
        m.alarmT = 0;
      },
      update(m, g, dt) { m.alarmT += dt; if (m.alarmT > 1.1) { m.alarmT = 0; g.audio.beep(g.player.pos.x, g.player.pos.y + 5, g.player.pos.z, 900); } const P = g.player.pos; return (P.y > 6.5 && Math.hypot(P.x + 46, P.z + 40) < 9) || m.segData.force; } },
    { obj: 'Destroy the Overseer', sub: 'Shoot the coolant vents when it vents', cp: [-44, -40, Math.PI / 2, 7.4],
      enter(m, g) {
        const S = m.segs?.[3]; void S;
        const p = g.player; if (p.pos.y < 6) { p.pos.set(-44, 7.45, -40); }
        const boss = new Overseer(g, { x: 30, z: -30, y: 30, cx: -30, cz: -20, r: 24, hover: 15, hp: 2400 * (g.diff.hp ?? 1) });
        g.bosses = [boss]; g.combatants.push(boss); m.boss = boss; m.marker(0, 0, 0, '', '');
        g.hud.banner('OVERSEER', 'Heavy gunship inbound', 2600); m.say('Overwatch', 'Overseer is airborne! Its vents open on a cycle — hit them!');
        g.hud.markers.length = 0;
      },
      update(m, g, dt) {
        const b = m.boss; if (!b) return false; b.update(dt);
        g.hud.objective(`${m.m.title} · 4/4`, 'Destroy the Overseer', b.alive ? `Hull ${Math.ceil(b.health / b.maxHealth * 100)}%` : 'Down!', b.health / b.maxHealth);
        g.hud.objWorld = b.alive ? { x: b.x, z: b.z } : null;
        if (!b.alive && !m.segData.chain) { m.segData.chain = 1; m.segData.end = 0; [[-46, 8], [10, -38], [44, 26]].forEach(([x, z], i) => setTimeout(() => { g.explode(x, 1, z, { radius: 8, dmg: 0, owner: null }); shake(0.3); }, 1800 + i * 700)); }
        if (m.segData.chain) m.segData.end += dt;
        return (m.segData.chain && m.segData.end > 4.5) || m.segData.force;
      },
      reset(m, g) { m.boss?.dispose(); m.boss = null; } },
  ],
];

// ======================================================================= SKIRMISH (TDM)
class Skirmish extends Mode {
  constructor(g, o) { super(g, o); this.kind = 'skirmish'; this.title = 'Skirmish'; this.score = { A: 0, B: 0 }; this.timeLeft = 8 * 60; }
  start() {
    const g = this.g, map = g.map, n = g.cfg.enemyCount; this.limit = Math.max(20, n * 5);
    this.setLoadout([g.cfg.loadout.primary, g.cfg.loadout.secondary]); g.player.team = 'A';
    const sA = map.spots.teamA, sB = map.spots.teamB;
    this.spawnPlayer(sA[0][0], sA[0][1], Math.atan2(-(sB[0][0] - sA[0][0]), -(sB[0][1] - sA[0][1])));
    this.sqA = g.squad('A'); this.sqB = g.squad('B');
    const W = ['ar', 'ar', 'smg', 'shotgun', 'dmr', 'ar', 'smg', 'lmg'];
    for (let i = 0; i < Math.max(1, n - 1); i++) { const s = sA[(i + 1) % sA.length]; this.sqA.add(g.addBot({ x: s[0] + Math.random() * 2, z: s[1] + Math.random() * 2, team: 'A', weapon: W[i % W.length], state: 'roam', roam: (b) => this.roamPoint(b) })); }
    for (let i = 0; i < n; i++) { const s = sB[i % sB.length]; this.sqB.add(g.addBot({ x: s[0] + Math.random() * 2, z: s[1] + Math.random() * 2, team: 'B', weapon: W[(i + 3) % W.length], state: 'roam', roam: (b) => this.roamPoint(b) })); }
    this.respawn = []; g.hud.banner('Team Deathmatch', `First to ${this.limit}`, 2600); g.hud.teach('move');
  }
  roamPoint(b) {
    const g = this.g, nav = g.world.nav; const enemySp = b.team === 'A' ? g.map.spots.teamB : g.map.spots.teamA; const B = g.world.bounds;
    // drift toward the enemy half with randomness; occasionally hunt a last-known enemy
    for (let k = 0; k < 10; k++) { const s = enemySp[Math.floor(Math.random() * enemySp.length)]; const t = Math.random() * 0.75; const x = b.x + (s[0] - b.x) * t + (Math.random() - 0.5) * 30, z = b.z + (s[1] - b.z) * t + (Math.random() - 0.5) * 30; const i = nav.idx(clamp(x, B.minX + 2, B.maxX - 2), clamp(z, B.minZ + 2, B.maxZ - 2)); if (i >= 0 && !nav.block[i]) return [nav.cx(i), nav.cz(i)]; }
    return null;
  }
  safeSpawn(team) {
    const g = this.g; const list = team === 'A' ? g.map.spots.teamA : g.map.spots.teamB; let best = list[0], bs = -1;
    for (const s of list) { let md = 1e9; for (const c of g.combatants) if (c.alive && c.team !== team) { const p = c.isPlayer ? c.pos : c; md = Math.min(md, Math.hypot(p.x - s[0], p.z - s[1])); } if (md > bs) { bs = md; best = s; } }
    return best;
  }
  onKill(v, k) {
    const team = v.isPlayer ? 'A' : v.team; const other = team === 'A' ? 'B' : 'A'; if (k && k.team !== team) this.score[other]++;
    if (!v.isPlayer) this.respawn.push({ b: v, t: 4 });
  }
  onPlayerDeath(k) { this.deadT = 0; this.deathScreen('You were killed', k ? `by ${k.name}` : '', 'Respawning…'); }
  update(dt) {
    const g = this.g; this.timeLeft -= dt;
    for (let i = this.respawn.length - 1; i >= 0; i--) { const r = this.respawn[i]; r.t -= dt; if (r.t <= 0 && r.b.deadT > 3) { const s = this.safeSpawn(r.b.team); const b = r.b; Object.assign(b, { x: s[0] + Math.random() * 2, z: s[1] + Math.random() * 2, health: b.maxHealth, alive: true, deadT: 0, state: 'roam', target: null, aware: 0, mag: b.w.mag, path: null, cover: null, suppress: 0 }); b.y = g.world.groundAt(b.x, b.z); this.respawn.splice(i, 1); } }
    if (!g.player.alive) { this.deadT += dt; if (this.deadT > 4) { const s = this.safeSpawn('A'); this.spawnPlayer(s[0], s[1], g.player.yaw); this.g.arsenal.setLoadout([g.cfg.loadout.primary, g.cfg.loadout.secondary]); this.g.arsenal.frags = 2; this.g.arsenal.smokes = 1; g.hud.weapon(g.arsenal); } }
    g.hud.modeTop(`<span class="pill tA">BLUE ${this.score.A}</span><span class="pill">${fmt(this.timeLeft)}</span><span class="pill tB">${this.score.B} RED</span>`);
    this.setObj('Team Deathmatch', `First team to ${this.limit} kills`, `${g.map.name}`);
    if (!this.ended && (this.score.A >= this.limit || this.score.B >= this.limit || this.timeLeft <= 0)) { this.ended = true; const won = this.score.A > this.score.B; g.hud.banner(won ? 'Victory' : this.score.A === this.score.B ? 'Draw' : 'Defeat', `${this.score.A} — ${this.score.B}`, 3000); setTimeout(() => g.app.endMatch({ title: won ? 'Victory' : 'Defeat', sub: `Blue ${this.score.A} — ${this.score.B} Red · ${g.map.name}`, won }), 2400); }
  }
}

// ======================================================================= HOLDOUT
const SHOP = [
  { id: 'ammo', label: 'Ammo refill', cost: 200 }, { id: 'armor', label: 'Armour plate +50', cost: 300 }, { id: 'frag', label: 'Frag grenade', cost: 150 }, { id: 'smoke', label: 'Smoke grenade', cost: 100 },
  { id: 'smg', label: WEAPONS.smg.name, cost: WEAPONS.smg.cost, w: 1 }, { id: 'ar', label: WEAPONS.ar.name, cost: WEAPONS.ar.cost, w: 1 }, { id: 'shotgun', label: WEAPONS.shotgun.name, cost: WEAPONS.shotgun.cost, w: 1 },
  { id: 'dmr', label: WEAPONS.dmr.name, cost: WEAPONS.dmr.cost, w: 1 }, { id: 'sniper', label: WEAPONS.sniper.name, cost: WEAPONS.sniper.cost, w: 1 }, { id: 'lmg', label: WEAPONS.lmg.name, cost: WEAPONS.lmg.cost, w: 1 },
  { id: 'upgrade', label: 'Weapon upgrade (tier +1)', cost: 1200 },
];
class Holdout extends Mode {
  constructor(g, o) { super(g, o); this.kind = 'holdout'; this.title = 'Holdout'; this.wave = 0; this.points = 500; this.inter = 12; this.queue = 0; this.armor = true; this.tiers = true; }
  start() {
    const g = this.g, map = g.map; const hp = map.spots.holdoutPlayer;
    this.setLoadout(['smg', 'pistol']); g.player.team = 'A'; this.spawnPlayer(hp[0], hp[1], 0);
    for (const [x, z] of map.spots.buy) { const gy = g.world.groundAt(x, z); g.addInteract({ x, z, y: gy, r: 2.2, hold: 0, label: 'Buy station', cond: () => this.inter > 0, onDone: () => this.openShop() }); this.marker(x, gy + 1.6, z, 'BUY', 'buy'); this.station(x, z); }
    g.hud.banner('Holdout', 'Survive ten waves', 2600); this.squadB = g.squad('B');
    this.say('Overwatch', 'First wave inbound. Buy stations are live between waves.');
  }
  station(x, z) { const B = this.g.builder; const y = this.g.world.groundAt(x, z); const m = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.4, 0.5), new THREE.MeshStandardNodeMaterial({ color: 0x2a3a32, roughness: 0.4, metalness: 0.5 })); m.position.set(x, y + 0.7, z); this.g.level.add(m); const s = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.4), new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(0.4, 2.6, 1.0) })); s.position.set(x, y + 1.05, z + 0.26); this.g.level.add(s); this.g.world.add(x - 0.4, y, z - 0.25, x + 0.4, y + 1.4, z + 0.25, 'metal'); void B; }
  openShop() {
    const g = this.g, a = g.arsenal; document.getElementById('buyPanel')?.remove(); g.app.input.unlock();
    const el = document.createElement('div'); el.className = 'panel'; el.id = 'buyPanel';
    const render = () => { el.innerHTML = `<div class="card"><h2>Armoury</h2><p>${this.points} points · next wave in ${Math.ceil(this.inter)}s</p><div class="buy">${SHOP.map((s) => `<button data-id="${s.id}" ${this.points < s.cost ? 'disabled' : ''}>${s.label}<small>${s.cost} pts</small></button>`).join('')}</div><div class="btns"><button class="btn pri" id="bDone">Back to the fight</button></div></div>`;
      el.querySelectorAll('[data-id]').forEach((b) => b.onclick = () => { const s = SHOP.find((x) => x.id === b.dataset.id); if (this.points < s.cost) return; this.points -= s.cost; this.buy(s); g.audio.ui('buy'); render(); });
      el.querySelector('#bDone').onclick = close; };
    const close = () => { el.remove(); g.app.state === 'playing' && !g.app.input.isTouch && g.app.input.lock(); };
    render(); document.body.appendChild(el); this.shopEl = el;
  }
  buy(s) {
    const g = this.g, a = g.arsenal;
    if (s.id === 'ammo') a.addAmmo(1); else if (s.id === 'armor') g.player.armor = Math.min(100, g.player.armor + 50); else if (s.id === 'frag') a.frags = Math.min(4, a.frags + 1); else if (s.id === 'smoke') a.smokes = Math.min(3, a.smokes + 1);
    else if (s.id === 'upgrade') { a.slot.tier = Math.min(4, (a.slot.tier || 0) + 1); toast(`${a.slot.w.name} → ${TIERS[a.slot.tier].label}`); }
    else if (s.w) { const have = a.slots.findIndex((x) => x.id === s.id); if (have >= 0) { a.slots[have].reserve += a.slots[have].w.reserve; a.equip(have); } else { a.slots[0] = a.makeSlot(s.id, a.slots[0]?.tier || 0); a.equip(0, true); } }
    g.hud.weapon(a);
  }
  startWave() {
    const g = this.g; this.wave++; this.inter = 0; document.getElementById('buyPanel')?.remove();
    const count = Math.round((4 + this.wave * 2) * (g.cfg.enemyCount / 8)); this.queue = count; this.spawnT = 0;
    g.hud.banner(`Wave ${this.wave}`, this.wave === 10 ? 'The Overseer is coming' : `${count} hostiles`, 2400); g.audio.ui('wave');
    if (this.wave === 10) { const b = new Overseer(g, { x: 60, z: -60, y: 30, cx: 0, cz: 0, r: 26, hover: 14, hp: 2000 }); g.bosses = [b]; g.combatants.push(b); this.boss = b; }
  }
  spawnOne() {
    const g = this.g, P = g.player.pos, S = g.map.spots.holdout; let best = S[0], bd = -1;
    for (let k = 0; k < 4; k++) { const s = S[Math.floor(Math.random() * S.length)]; const d = Math.hypot(s[0] - P.x, s[1] - P.z); if (d > bd && d > 25) { bd = d; best = s; } }
    const w = this.wave; const r = Math.random();
    const kind = w >= 3 && r < 0.15 + w * 0.02 ? 'drone' : w >= 5 && r > 0.88 ? 'heavy' : 'soldier';
    const weapon = kind === 'heavy' ? 'lmg' : ['ar', 'smg', 'ar', 'shotgun', 'dmr'][Math.floor(Math.random() * (w >= 4 ? 5 : 3))];
    const b = g.addBot({ x: best[0] + (Math.random() - 0.5) * 4, z: best[1] + (Math.random() - 0.5) * 4, kind, weapon, team: 'B', state: 'combat', aggro: Math.min(1, 0.35 + w * 0.08) });
    this.squadB.add(b); b.target = g.player; b.lastSeen = { x: P.x, y: P.y + 1.4, z: P.z, t: g.time }; b.aware = 1.1; b.enterCombat(); b.reactT = 1;
  }
  onKill(v, k) { if (k?.isPlayer) { this.points += v.kind === 'heavy' ? 300 : v.kind === 'drone' ? 120 : 100; if (Math.random() < 0.18) this.g.addPickup({ kind: Math.random() < 0.5 ? 'ammo' : 'med', x: v.x, z: v.z, y: v.y, label: 'Pick up supplies' }); } if (!v.isPlayer && v.kind !== 'boss') setTimeout(() => { if (this.g.bots.includes(v)) this.g.removeBot(v); }, 9000); }
  onPlayerDeath() { this.deathScreen('Overrun', `Wave ${this.wave}`, ''); setTimeout(() => this.g.app.endMatch({ title: 'Overrun', sub: `You held out until wave ${this.wave} on ${this.g.map.name}.`, won: false, wave: this.wave - 1 }), 2600); }
  update(dt) {
    const g = this.g; if (!g.player.alive) return;
    const enemies = g.bots.filter((b) => b.alive && b.team === 'B').length + (this.boss?.alive ? 1 : 0);
    if (this.inter > 0) { this.inter -= dt; if (this.inter <= 0) this.startWave(); }
    else {
      this.spawnT -= dt; if (this.queue > 0 && this.spawnT <= 0 && enemies < 10) { this.spawnOne(); this.queue--; this.spawnT = 1.2; }
      // hunters always learn the player's rough position (keeps waves flowing)
      if (Math.random() < dt * 0.5) for (const b of g.bots) if (b.alive && b.team === 'B' && !b.visible) { const P = g.player.pos; b.lastSeen = { x: P.x + (Math.random() - 0.5) * 8, y: P.y + 1.4, z: P.z + (Math.random() - 0.5) * 8, t: g.time }; b.lostT = Math.min(b.lostT, 4); }
      this.boss?.update(dt);
      if (this.queue <= 0 && enemies === 0 && !(this.boss && this.boss.alive)) {
        g.stats.objectives++; this.points += 250 + this.wave * 50; g.hud.xp(250, 'WAVE CLEAR'); g.audio.ui('objective');
        if (this.wave >= 10) { this.ended = true; g.hud.banner('Holdout complete', 'All ten waves survived', 3000); setTimeout(() => g.app.endMatch({ title: 'Holdout complete', sub: `All ten waves survived on ${g.map.name}.`, won: true, wave: 10 }), 2500); this.inter = 1e9; }
        else { this.inter = 22; g.hud.banner(`Wave ${this.wave} cleared`, 'Buy stations open', 2400); this.say('Overwatch', 'Wave cleared. Resupply at the buy stations.'); g.player.health = g.player.maxHealth; }
      }
    }
    g.hud.modeTop(`<span class="pill">WAVE ${this.wave}/10</span><span class="pill" style="color:#ffe27a">${this.points} PTS</span>${this.inter > 0 && this.inter < 1e8 ? `<span class="pill">NEXT ${Math.ceil(this.inter)}s</span>` : `<span class="pill tB">${enemies + this.queue} LEFT</span>`}`);
    this.setObj('Holdout', this.inter > 0 ? 'Resupply — buy stations are open' : 'Survive the wave', g.map.name);
  }
}

// ======================================================================= DROPZONE (battle-royale-lite)
class Dropzone extends Mode {
  constructor(g, o) { super(g, o); this.kind = 'dropzone'; this.title = 'Dropzone'; this.ffa = true; this.tiers = true; this.armor = true; }
  get mapId() { return 'island'; }
  start() {
    const g = this.g, map = g.map; const R = rng((Date.now() & 0xffff) || 7); this.R = R;
    g.player.team = 'A'; g.mats = 0; g.hud.mats(0); g.mapZoom = 1.3;
    g.builds = g.builds || new Builds(g); g.builds.game = g; g.builds.clear();
    this.setLoadout(['pistol']); g.arsenal.frags = 0; g.arsenal.smokes = 0;
    // loot
    for (const s of map.lootSpots) this.lootAt(s, s.chest);
    // storm
    this.phases = stormPhases(160, 1); this.centers = [[0, 0]]; let c = [0, 0];
    for (let i = 0; i < this.phases.length; i++) { const p = this.phases[i]; let nc; for (let k = 0; k < 20; k++) { nc = nextCenter(c[0], c[1], p.r0, p.r1, R); if (map.terrain(nc[0], nc[1]) > 0.5) break; } this.centers.push(nc); c = nc; }
    this.st = 0; g.storm = stormAt(this.phases, this.centers, 0); this.makeStormWall();
    // flight path + drop
    const a = R() * Math.PI * 2; this.fly = { x0: Math.cos(a) * 170, z0: Math.sin(a) * 170, x1: -Math.cos(a) * 170, z1: -Math.sin(a) * 170, t: 0, dur: 32 };
    const p = g.player; p.spawn(this.fly.x0, 120, this.fly.z0, Math.atan2(-(this.fly.x1 - this.fly.x0), -(this.fly.z1 - this.fly.z0))); p.glide = { open: false, onBus: true }; p.pos.y = 120;
    // bots: land at random POIs after a short delay
    const n = g.cfg.enemyCount + 4; this.total = n + 1;
    for (let i = 0; i < n; i++) {
      const poi = map.pois[Math.floor(R() * map.pois.length)];
      const b = g.addBot({ x: poi.x + (R() - 0.5) * poi.r, z: poi.z + (R() - 0.5) * poi.r, team: 'B' + i, weapon: 'pistol', state: 'roam', roam: (bb) => this.roamFor(bb) });
      b.hiddenFromAI = true; b.alive = false; b.waiting = true; b.dropAt = 6 + R() * 22; b.mats = 30; b.lootT = 0; b.colors = { body: new THREE.Color().setHSL(R(), 0.25, 0.32), accent: new THREE.Color().setHSL(R(), 0.9, 0.55).multiplyScalar(3) };
    }
    g.hud.banner('Dropzone', `Jump with ${g.hud.keyName('jump')} — last one standing wins`, 3200);
    g.hud.tip(`Press <kbd>${g.hud.keyName('jump')}</kbd> to drop · steer with <kbd>${g.hud.keyName('forward')}</kbd>${g.hud.keyName('left')}${g.hud.keyName('back')}${g.hud.keyName('right')} · hold forward to dive`, 6000);
    this.marks = map.pois.map((p) => this.marker(p.x, map.terrain(p.x, p.z) + 6, p.z, p.name, 'loot')); this.marks.forEach((m) => m.max = 400);
  }
  lootAt(s, chest) {
    const R = this.R, g = this.g; const n = chest ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const k = R(); const off = [(R() - 0.5) * 1.6, (R() - 0.5) * 1.6];
      if (k < 0.5 || chest && i === 0) { const wid = PRIMARIES[Math.floor(R() * PRIMARIES.length)]; const tier = rollTier(R, chest); g.addPickup({ kind: 'weapon', wid, tier, x: s.x + off[0], z: s.z + off[1], y: s.y, label: `Take ${TIERS[tier].label} ${WEAPONS[wid].name}` }); }
      else if (k < 0.68) g.addPickup({ kind: 'ammo', x: s.x + off[0], z: s.z + off[1], y: s.y, label: 'Take ammo' });
      else if (k < 0.8) g.addPickup({ kind: 'med', x: s.x + off[0], z: s.z + off[1], y: s.y, label: 'Take med kit (+50)' });
      else if (k < 0.9) g.addPickup({ kind: 'shield', x: s.x + off[0], z: s.z + off[1], y: s.y, label: 'Take shield cell (+50)' });
      else if (k < 0.95) g.addPickup({ kind: 'frag', x: s.x + off[0], z: s.z + off[1], y: s.y, label: 'Take frag grenade' });
      else g.addPickup({ kind: 'mats', n: 40, x: s.x + off[0], z: s.z + off[1], y: s.y, label: 'Take alloy (+40)' });
    }
  }
  makeStormWall() {
    const g = this.g; const m = new THREE.MeshBasicNodeMaterial({ transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, color: new THREE.Color(0.55, 0.2, 1.1) });
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 160, 64, 1, true), m); wall.position.y = 40; g.level.add(wall); this.wall = wall;
  }
  roamFor(b) {
    const g = this.g, s = g.storm; const R = this.R;
    // inside next circle? loot nearby pickups first, then drift inward
    const dNext = Math.hypot(b.x - s.nx, b.z - s.nz);
    if (dNext > s.nr * 0.9 && s.nr > 0) { const a = Math.atan2(b.z - s.nz, b.x - s.nx); const rr = s.nr * 0.5 * R(); return [s.nx + Math.cos(a) * rr, s.nz + Math.sin(a) * rr]; }
    let best = null, bd = 60; for (const pk of g.pickups) { if (pk.kind !== 'weapon' && pk.kind !== 'shield') continue; const d = Math.hypot(pk.x - b.x, pk.z - b.z); if (d < bd) { bd = d; best = pk; } }
    if (best) return [best.x, best.z];
    const a = R() * 6.28, r = R() * Math.max(8, s.r * 0.6); return [s.cx + Math.cos(a) * r, s.cz + Math.sin(a) * r];
  }
  onSalvage(h) {
    const g = this.g; const sc = g.map.scrap || []; const near = sc.some(([x, z]) => Math.hypot(x - h.x, z - h.z) < 3.2);
    const gain = near ? 20 : h.surf === 'wood' ? 6 : 0; if (!gain) return;
    g.mats = Math.min(999, (g.mats || 0) + gain); g.hud.mats(g.mats); g.hud.xp(gain, 'ALLOY'); g.hud.teach('build');
  }
  onKill(v, k) {
    const g = this.g; if (v.isPlayer) return;
    if (v.wid && v.wid !== 'pistol') g.addPickup({ kind: 'weapon', wid: v.wid, tier: v.tier || 0, x: v.x, z: v.z, y: v.y, label: `Take ${TIERS[v.tier || 0].label} ${WEAPONS[v.wid].name}` });
    g.addPickup({ kind: 'mats', n: 30, x: v.x + 0.8, z: v.z, y: v.y, label: 'Take alloy (+30)' }); if (Math.random() < 0.6) g.addPickup({ kind: 'ammo', x: v.x - 0.6, z: v.z + 0.5, y: v.y, label: 'Take ammo' });
    v.hiddenFromAI = true; this.checkEnd();
  }
  onPlayerDeath(k) { const place = this.aliveCount() + 1; this.deathScreen('Eliminated', `#${place} of ${this.total}`, k ? `by ${k.name}` : ''); setTimeout(() => this.g.app.endMatch({ title: `Eliminated — #${place}`, sub: `${this.total} dropped on Harrow Isle.`, won: false }), 2600); }
  aliveCount() { return this.g.bots.filter((b) => b.alive || b.waiting).length + (this.g.player.alive ? 1 : 0); }
  checkEnd() { if (!this.ended && this.g.player.alive && this.aliveCount() === 1) { this.ended = true; const g = this.g; g.hud.banner('Last one standing', 'Dropzone champion', 3500); g.audio.ui('level'); setTimeout(() => g.app.endMatch({ title: 'Dropzone champion', sub: `You outlasted ${this.total - 1} opponents on Harrow Isle.`, won: true, brWin: true }), 2600); } }
  update(dt, inp) {
    const g = this.g, p = g.player; this.t += dt;
    // flight + drop
    const F = this.fly; if (p.glide?.onBus) {
      F.t += dt / F.dur; const k = Math.min(1, F.t); p.pos.set(F.x0 + (F.x1 - F.x0) * k, 120, F.z0 + (F.z1 - F.z0) * k); p.vel.set((F.x1 - F.x0) / F.dur, 0, (F.z1 - F.z0) / F.dur);
      g.hud.prompt(`<kbd>${g.hud.keyName('jump')}</kbd> drop now`, k);
      if (inp.jumpPressed || k >= 1) { p.glide.onBus = false; p.vel.y = 0; g.audio.whoosh(); }
      else return;
    }
    // bots dropping in
    for (const b of g.bots) if (b.waiting && this.t > b.dropAt) { b.waiting = false; b.alive = true; b.deadT = 0; b.hiddenFromAI = false; b.y = g.world.groundAt(b.x, b.z); }
    // bot looting: pick up nearby weapons/shields
    for (const b of g.bots) {
      if (!b.alive) continue; b.lootT -= dt; if (b.lootT > 0) continue; b.lootT = 0.5;
      for (const pk of g.pickups) { if (Math.hypot(pk.x - b.x, pk.z - b.z) > 1.6) continue; if (pk.kind === 'weapon' && (WEAPONS[pk.wid].slot === 'primary' && (b.wid === 'pistol' || pk.tier > (b.tier || 0)))) { b.wid = pk.wid; b.w = WEAPONS[pk.wid]; b.mag = b.w.mag; b.tier = pk.tier; b.tierDmg = TIERS[pk.tier].dmg; g.pickups.splice(g.pickups.indexOf(pk), 1); break; } if (pk.kind === 'shield') { b.health = Math.min(b.maxHealth * 1.5, b.health + 50); g.pickups.splice(g.pickups.indexOf(pk), 1); break; } }
      // build a wall when under fire (if building enabled)
      if (g.cfg.building && b.state === 'combat' && b.suppress > 0.5 && b.mats >= 10 && Math.random() < 0.25 && b.target) { const tp = b.target.isPlayer ? b.target.pos : b.target; const yaw = Math.atan2(-(tp.x - b.x), -(tp.z - b.z)); const plan = g.builds.plan('wall', b.x, b.y, b.z, yaw); if (g.builds.place(plan, b)) { b.mats -= 10; b.bark('push'); } }
    }
    // storm
    this.st += dt; const s = g.storm = stormAt(this.phases, this.centers, this.st);
    this.wall.position.set(s.cx, 40, s.cz); this.wall.scale.set(Math.max(0.1, s.r), 1, Math.max(0.1, s.r));
    const out = (x, z) => Math.hypot(x - s.cx, z - s.cz) > s.r;
    this.stormTick = (this.stormTick || 0) + dt;
    if (this.stormTick > 1) { this.stormTick = 0; if (p.alive && out(p.pos.x, p.pos.z) && !p.glide) p.hurt(s.dps, null, null, { storm: true }); for (const b of g.bots) if (b.alive && out(b.x, b.z)) { if (b.hurt(s.dps * 1.2, 'body', null)) g.onKill(b, null, { storm: true }); } }
    g.inStorm = p.alive && out(p.pos.x, p.pos.z) && !p.glide; g.audio.stormLoop(g.inStorm);
    // build mode
    if (inp.buildPressed && g.cfg.building && !p.glide) { g.buildMode = !g.buildMode; g.hud.buildBar(g.buildMode, g.builds.sel); if (g.buildMode) g.hud.teach('build'); }
    if (!g.cfg.building) g.buildMode = false; if (!g.buildMode) g.hud.buildBar(false);
    const alive = this.aliveCount();
    g.hud.modeTop(`<span class="pill">${alive} ALIVE</span><span class="pill" style="color:#c79aff">${s.shrinking ? 'STORM CLOSING' : 'STORM IN'} ${fmt(s.timeLeft)}</span><span class="pill">${g.stats.kills} KILLS</span>`);
    this.setObj('Dropzone', p.glide ? 'Pick a landing spot' : g.inStorm ? 'You are in the storm — get to the circle!' : 'Loot up and survive the storm', `${alive} remaining · phase ${s.phase + 1}`);
    g.hud.objWorld = g.inStorm ? { x: s.nx, z: s.nz } : null;
    if (!p.glide && this.marks) { this.marks.forEach((m) => m.max = 0); this.marks = null; g.hud.markers.length = 0; }
    this.checkEnd();
  }
}
// ======================================================================= view-only sandbox (screenshots / range)
class Sandbox extends Mode { constructor(g, o) { super(g, o); this.kind = 'sandbox'; this.title = 'Range'; } start() { const s = this.g.map.spots.start || [0, 0, 0]; this.setLoadout([this.g.cfg.loadout.primary, 'pistol']); this.spawnPlayer(s[0], s[1], s[2]); this.g.player.team = 'A'; } }

export const MODES = { campaign: Campaign, skirmish: Skirmish, holdout: Holdout, dropzone: Dropzone, sandbox: Sandbox };
export { pickBark };
