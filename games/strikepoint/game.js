// Match session: level load (textures → merged geometry → nav bake), combat resolution (hitscan vs
// hitboxes + world, near-miss suppression, explosions), interactables/pickups, camera, per-frame update.
import { THREE, settings, shake, applyShake, toast } from '/shared/sd-kit.js';
import { bumpMap, mx_noise_float, positionWorld, time, vec3, float } from 'three/tsl';
import { WEAPONS, DIFFICULTY, TIERS, GRENADES } from './config.js';
import { falloff, zoneMul, rayCapsule, raySphere, pointSegDist, clamp, damp, DEG, wrapAngle } from './logic.js';
import { World } from './world.js';
import { Builder, loadMaterials, makeMaterials, SURF, U } from './builder.js';
import { Atmosphere, makeRain } from './env.js';
import { FX } from './fx.js';
import { ActorRenderer } from './actors.js';
import { Viewmodel, Arsenal, VMFILL } from './weapons.js';
import { Player } from './player.js';
import { Grenades } from './grenades.js';
import { Bot, Squad } from './ai.js';
import { MAPS } from './maps/index.js';
import { treeProtos } from './props.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _end = new THREE.Vector3(), _hit = {}, _dir = new THREE.Vector3();
const PICK_COL = TIERS.map((t) => new THREE.Color(t.color));

export class Game {
  constructor(app) {
    Object.assign(this, { renderer: app.renderer, scene: app.scene, camera: app.camera, audio: app.audio, hud: app.hud, input: app.input, prefs: app.prefs, app });
    this.cfg = app.cfg; this.atm = new Atmosphere(this.scene, this.renderer); this.shake = shake;
    this.vm = new Viewmodel(this.camera); this.vm.root.visible = false;
    this.player = new Player(this); this.arsenal = new Arsenal(this);
    this.actors = new ActorRenderer(this.scene);
    // one shared dynamic flash light (explosion > own muzzle > enemy muzzle) keeps the light count constant and cheap
    this.fLight = new THREE.PointLight(0xffb060, 0, 18, 1.8); this.fLT = 0; this.fPri = 0; this.scene.add(this.fLight);
    this.bots = []; this.squads = []; this.combatants = [this.player]; this.time = 0; this.paused = true; this.level = null; this.stats = null;
    this.interactables = []; this.pickups = []; this.speedMul = 1; this.suppress = 0; this.pathBudget = 4;
    this.hud.game = this; this.hud.keyName = (a) => keyLabel(this.prefs.keys[a]);
    // pickups: one instanced mesh (crates with tier colour)
    const pg = new THREE.BoxGeometry(0.7, 0.32, 0.4); this.pickMesh = new THREE.InstancedMesh(pg, new THREE.MeshStandardNodeMaterial({ roughness: 0.5, metalness: 0.3 }), 96);
    this.pickMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(96 * 3).fill(1), 3); this.pickMesh.frustumCulled = false; this.pickMesh.castShadow = true; this.scene.add(this.pickMesh);
    const ringG = new THREE.RingGeometry(0.42, 0.6, 24).rotateX(-Math.PI / 2); this.pickRing = new THREE.InstancedMesh(ringG, new THREE.MeshBasicNodeMaterial({ transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }), 96);
    this.pickRing.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(96 * 3).fill(1), 3); this.pickRing.frustumCulled = false; this.scene.add(this.pickRing);
  }
  get diff() { return DIFFICULTY[this.cfg.difficulty] || DIFFICULTY.regular; }
  tierInfo(t) { return TIERS[t] || TIERS[0]; }
  // ---------------------------------------------------------------- level
  async load(mapId, timeName, onProgress) {
    this.unload();
    const map = MAPS[mapId]; this.map = map;
    const keys = [...new Set([...map.textures, ...(map.ground || [])])];
    const tex = await loadMaterials(keys, (k) => onProgress?.(k * 0.7, 'Streaming textures'));
    onProgress?.(0.72, 'Building ' + map.name);
    const world = this.world = new World(map.bounds, map.terrain || null, map.terrainSurf || (() => SURF[map.ground?.[0]] || 'concrete'));
    if (map.waterZ !== undefined || map.water) { const tsf = map.terrainSurf; world.terrainSurf = (x, z) => (map.isWater ? map.isWater(x, z) : z > map.waterZ) ? 'water' : tsf ? tsf(x, z) : SURF[map.ground[0]]; }
    const mats = makeMaterials(tex, { ground: map.ground, groundRough: map.groundRough });
    const B = new Builder(world, mats, this.scene, map.seed || 7); B.groundA = map.ground?.[0]; B.maxLights = settings.quality === 'low' ? 3 : (map.maxLights ?? 6);
    this.builder = B; map.build(B, world, this);
    await new Promise((r) => setTimeout(r, 0));
    onProgress?.(0.82, 'Merging geometry');
    const ext = map.vista ?? 60, bb = map.bounds;
    const terr = B.terrainMesh(bb.minX - ext, bb.minZ - ext, bb.maxX + ext, bb.maxZ + ext, map.seg ?? 110, map.splat, map.tint);
    const level = B.finalize({ protos: treeProtos(mats) }); level.add(terr);
    if (map.waterY !== undefined) level.add(this.makeWater(map));
    this.level = level; this.lights = B.lights;
    onProgress?.(0.9, 'Baking navigation');
    await new Promise((r) => setTimeout(r, 0));
    world.bakeNav(map.navCell ?? 1);
    this.fx ? (this.fx.world = world, this.fx.clear()) : (this.fx = new FX(this.scene, this.camera, world));
    this.grenades ? (this.grenades.game = this, this.grenades.smokes = world.smokes, this.grenades.clear()) : (this.grenades = new Grenades(this));
    this.setTime(timeName);
    this.hud.setMap(world, map);
    this.counts = { boxes: B.counts.boxes, cover: world.cover.length, colliders: world.cols.length, levelDraws: B.draws, navCells: world.nav.w * world.nav.h };
    onProgress?.(1, 'Ready');
  }
  setTime(name) {
    this.timeName = name; const map = this.map; this.atm.sunAz = map.sunAz ?? 0.6;
    this.atm.apply(name, { sunEl: map.sunEl?.[name], fogMul: map.fogMul ?? 1, expMul: map.expMul ?? 1 });
    this.night = name === 'night'; VMFILL.value = { night: 0.55, storm: 0.25, dusk: 0.18, day: 0.04 }[name] ?? 0.1; this.visMul = name === 'night' ? 0.8 : name === 'storm' ? 0.75 : 1;
    const rainy = (name === 'storm' || (name === 'night' && map.rainAtNight)) && this.cfg.rain !== false;
    if (rainy && !this.rain) this.rain = makeRain(this.scene); if (this.rain) this.rain.mesh.visible = rainy;
    U.wet.value = rainy ? 1 : (name === 'night' && map.wetAtNight ? 0.6 : 0);
    for (const L of this.lights || []) L.intensity = L.userData.base * (name === 'day' ? 0.0 : name === 'dusk' ? 0.55 : 1);
    this.fx && (this.fx.light.value = name === 'night' ? 0.35 : name === 'dusk' ? 0.7 : name === 'storm' ? 0.6 : 1);
    this.audio.ambience((map.ambience || 'wind') + (rainy ? ' rain' : ''));
  }
  makeWater(map) {
    const m = new THREE.MeshStandardNodeMaterial({ color: 0x0b1a20, roughness: 0.06, metalness: 0.15 });
    const h = mx_noise_float(vec3(positionWorld.x.mul(0.35), positionWorld.z.mul(0.55), time.mul(0.35))).mul(0.6).add(mx_noise_float(vec3(positionWorld.x.mul(1.6), positionWorld.z.mul(1.2), time.mul(0.8))).mul(0.25));
    m.normalNode = bumpMap(h, float(0.35));
    const w = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400).rotateX(-Math.PI / 2), m); w.position.y = map.waterY; w.receiveShadow = true; w.name = 'water';
    return w;
  }
  unload() {
    if (this.level) { this.level.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); } }); this.scene.remove(this.level); this.level = null; }
    for (const L of this.lights || []) { this.scene.remove(L); if (L.target) this.scene.remove(L.target); L.dispose?.(); } this.lights = [];
    this.bots = []; this.squads = []; this.combatants = [this.player]; this.interactables = []; this.pickups = [];
    for (const b of this.bosses || []) b.dispose(); this.bosses = []; this.emitters = []; this.gameOverT = 0;
    this.fx?.clear(); this.grenades?.clear(); this.mode = null; this.storm = null; this.inStorm = false; this.buildMode = false;
    this.builds?.clear?.();
  }
  // ---------------------------------------------------------------- spawning
  addBot(o) { const b = new Bot(this, o); this.bots.push(b); this.combatants.push(b); return b; }
  removeBot(b) { this.bots.splice(this.bots.indexOf(b), 1); this.combatants.splice(this.combatants.indexOf(b), 1); b.releaseCover(); }
  squad(team) { const s = new Squad(this, team); this.squads.push(s); return s; }
  startMatch(mode) {
    this.mode = mode; this.time = 0; this.paused = false; this.over = false;
    this.stats = { shots: 0, hits: 0, kills: 0, deaths: 0, heads: 0, objectives: 0, xp: 0, start: performance.now(), damage: 0 };
    this.arsenal.shots = 0; this.hud.clearTransient(); this.hud.show(true); this.vm.root.visible = true; this.hud.showTiers = !!mode.tiers; this.hud.showArmor = !!mode.armor;
    this.applyColors(); this.hud.mats(null); this.mapZoom = 2.6; this.slowmo = false; this.deathCam = null; mode.start();
    this.hud.weapon(this.arsenal);
  }
  applyColors() {
    const c = this.cfg.colors || {}; const r = document.documentElement.style;
    if (c.hud) r.setProperty('--hud', c.hud); if (c.friendly) r.setProperty('--fr', c.friendly); if (c.enemy) r.setProperty('--en', c.enemy);
    this.hud.colFr = c.friendly; this.hud.colEn = c.enemy;
    const acc = (hex, k) => new THREE.Color(hex).multiplyScalar(k);
    this.teamCol = { A: { body: new THREE.Color(0x938b74), accent: acc(c.friendly || '#3cc8ff', 3.2) }, B: { body: new THREE.Color(0x3c4238), accent: acc(c.enemy || '#ff5a2e', 3.6) } };
    document.body.classList.toggle('cb', settings.colorblind);
  }
  // ---------------------------------------------------------------- combat
  // Hitscan: world vs every hostile hitbox, nearest wins. Near misses suppress bots / whiz past the player.
  shoot(o) {
    const { ox, oy, oz, dir, w } = o; const maxD = 320; const W = this.world;
    const wh = W.ray(ox, oy, oz, dir.x, dir.y, dir.z, maxD, 1); let tW = maxD; if (wh) { Object.assign(_hit, wh); tW = wh.t; }
    let best = null, bt = tW, zone = 'body';
    for (const c of this.combatants) {
      if (!c.alive || c === o.shooter) continue; if (c.team === o.team && !this.mode?.ffa) continue;
      const r = this.hitTest(c, ox, oy, oz, dir, bt); if (r && r.t < bt) { bt = r.t; best = c; zone = r.zone; }
    }
    const ex = ox + dir.x * bt, ey = oy + dir.y * bt, ez = oz + dir.z * bt;
    // near-miss (suppression / whiz)
    for (const c of this.combatants) {
      if (!c.alive || c === best || c === o.shooter || (c.team === o.team && !this.mode?.ffa)) continue;
      const hp = c.isPlayer ? _w.set(c.pos.x, c.pos.y + c.eye, c.pos.z) : _w.set(c.x, c.y + 1.4, c.z);
      const d = pointSegDist(hp.x, hp.y, hp.z, ox, oy, oz, ex, ey, ez);
      if (d < 2.2) { if (c.isPlayer) { this.audio.whiz(ex, ey, ez, d < 1); this.suppress = Math.min(0.85, this.suppress + 0.16); this.hud.ping(ox, oz, o.team); if (d < 0.9) shake(0.02); } else c.nearMiss?.(o.shooter, d); }
    }
    if (o.shooter?.isPlayer) this.stats && this.stats.shots++;
    if (best) {
      let dmg = falloff(w, bt, o.tierMul ?? 1) * zoneMul(w, zone) * (o.botDmgMul ?? 1);
      if (best.kind === 'heavy' && zone !== 'head') dmg *= 0.75;
      const surf = best.kind === 'drone' ? 'robot' : zone === 'head' && best.kind === 'heavy' ? 'armor' : 'flesh';
      this.fx.impact(ex, ey, ez, -dir.x, -dir.y, -dir.z, surf); if (zone === 'head' && surf === 'flesh') this.fx.impact(ex, ey, ez, -dir.x, -dir.y, -dir.z, 'armor');
      this.damage(best, dmg, zone, o.shooter, w, dir);
    } else if (wh) {
      const h = _hit;
      if (h.surf === 'water' && this.map.waterY !== undefined) { this.fx.impact(h.x, this.map.waterY, h.z, 0, 1, 0, 'water'); }
      else { this.fx.impact(h.x, h.y, h.z, h.nx, h.ny, h.nz, h.surf, o.pellet ? 0.5 : 1); if (Math.random() < (o.pellet ? 0.2 : 0.6)) this.audio.impact(h.surf, h.x, h.y, h.z); }
      if (h.col?.piece) this.builds?.damage(h.col.piece, falloff(w, bt) * 1.2);
      if (h.col?.onHit) h.col.onHit(h);
    }
    if (o.tracer && o.muzzle) { const m = o.muzzle; const pl = o.shooter?.isPlayer; this.fx.tracer(m.x, m.y, m.z, ex, ey, ez, pl ? 2.6 : 3.2, pl ? 1.9 : 1.1, pl ? 1.0 : 0.45, pl ? 380 : 260, pl ? 3.2 : 4.2, pl ? 0.016 : 0.028); }
    return best;
  }
  hitTest(c, ox, oy, oz, dir, maxT) {
    let t, zone = null, bt = maxT;
    if (c.customHit) return c.customHit(ox, oy, oz, dir, maxT);
    if (c.isPlayer) {
      const p = c.pos, e = c.eye; t = raySphere(ox, oy, oz, dir.x, dir.y, dir.z, p.x, p.y + e - 0.02, p.z, 0.16, bt); if (t >= 0) { bt = t; zone = 'head'; }
      t = rayCapsule(ox, oy, oz, dir.x, dir.y, dir.z, p.x, p.y + 0.15, p.z, p.x, p.y + e - 0.25, p.z, 0.3, bt); if (t >= 0 && t < bt) { bt = t; zone = 'body'; }
      return zone ? { t: bt, zone } : null;
    }
    const hb = c.hb; if (!hb) return null;
    t = raySphere(ox, oy, oz, dir.x, dir.y, dir.z, hb.head.x, hb.head.y, hb.head.z, hb.r, bt); if (t >= 0) { bt = t; zone = 'head'; }
    t = rayCapsule(ox, oy, oz, dir.x, dir.y, dir.z, hb.t0.x, hb.t0.y, hb.t0.z, hb.t1.x, hb.t1.y, hb.t1.z, hb.tr, bt); if (t >= 0 && t < bt) { bt = t; zone = 'body'; }
    if (hb.lr > 0) { t = rayCapsule(ox, oy, oz, dir.x, dir.y, dir.z, hb.l0.x, hb.l0.y, hb.l0.z, hb.l1.x, hb.l1.y, hb.l1.z, hb.lr, bt); if (t >= 0 && t < bt) { bt = t; zone = 'limb'; } }
    return zone ? { t: bt, zone } : null;
  }
  damage(victim, dmg, zone, attacker, w, dir, info = {}) {
    if (!victim.alive) return;
    if (victim.isPlayer) {
      const from = attacker ? (attacker.isPlayer ? attacker.pos : attacker) : null;
      victim.hurt(dmg, from, attacker, { w, zone, ...info });
      return;
    }
    const killed = victim.hurt(dmg, zone, attacker, dir);
    if (attacker?.isPlayer) {
      this.stats.hits++; this.stats.damage += dmg; if (zone === 'head') this.stats.heads++;
      this.hud.hit(zone === 'head', killed); this.audio.hit(zone === 'head', killed);
    }
    if (killed) this.onKill(victim, attacker, { w, head: zone === 'head', ...info });
  }
  onKill(victim, killer, info) {
    const wname = info.explosive ? 'Frag' : info.melee ? 'Melee' : info.storm ? 'Storm' : info.w?.name ?? '—';
    this.hud.killfeed(killer, victim, wname, info.head, killer?.isPlayer || victim.isPlayer);
    if (killer && killer !== victim) { killer.kills = (killer.kills || 0) + 1; killer.score = (killer.score || 0) + 100; }
    if (killer?.isPlayer) {
      this.stats.kills++; let xp = victim.kind === 'heavy' ? 250 : 100; this.hud.xp(xp, victim.kind === 'drone' ? 'DRONE' : 'KILL');
      if (info.head) { this.hud.xp(50, 'HEADSHOT'); xp += 50; } if (info.melee) { this.hud.xp(50, 'TAKEDOWN'); xp += 50; }
      this.stats.xp += xp; this.player.streak = (this.player.streak || 0) + 1;
    }
    if (victim.isPlayer) this.stats && this.stats.deaths++;
    this.mode?.onKill?.(victim, killer, info);
  }
  explode(x, y, z, o) {
    this.fx.explosion(x, y, z, o.small ? 0.6 : 1); this.audio.explosion(x, y, z, o.small ? 0.6 : 1);
    this.flash(x, y + 1, z, o.small ? 30 : 90, 0.35, 3, 30);
    const P = this.player.pos; const d = Math.hypot(P.x - x, P.y + 1 - y, P.z - z); shake(clamp(0.5 - d * 0.025, 0, 0.45));
    for (const c of this.combatants) {
      if (!c.alive) continue; const cx = c.isPlayer ? c.pos.x : c.x, cy = (c.isPlayer ? c.pos.y : c.y) + 0.9, cz = c.isPlayer ? c.pos.z : c.z;
      const dd = Math.hypot(cx - x, cy - y, cz - z); if (dd > o.radius) continue;
      if (c.team === o.owner?.team && c !== o.owner && !this.mode?.ffa) continue;
      let dmg = o.dmg * Math.pow(1 - dd / o.radius, 1.4); if (!this.world.los(x, y + 0.3, z, cx, cy, cz)) dmg *= 0.2;
      if (c.isPlayer && c === o.owner) dmg *= 0.6;
      if (dmg < 1) continue;
      _dir.set(cx - x, 0, cz - z).normalize();
      this.damage(c, dmg, 'body', o.owner, null, _dir, { explosive: true });
      if (c.isPlayer) this.suppress = 0.8;
    }
    for (const b of this.bots) if (b.alive && Math.hypot(b.x - x, b.z - z) < o.radius * 2) b.nearMiss(o.owner, 1);
    this.builds?.blast(x, y, z, o.radius, o.dmg);
    this.noise(x, z, 70, o.owner);
  }
  noise(x, z, r, src) { for (const b of this.bots) if (b.alive) b.hear(x, z, r, src); if (src?.isPlayer && r > 30) this.player.firedT = 0; }
  surfAt(x, z) { const info = { surf: 'concrete' }; this.world.floorAt(x, z, 0.2, 60, 60, info); return info.surf; }
  flash(x, y, z, I, dur, pri, dist = 16) { if (this.fLT > 0 && pri < this.fPri) return; const L = this.fLight; L.position.set(x, y, z); L.intensity = I; L.distance = dist; this.fLT = dur; this.fLD = dur; this.fI = I; this.fPri = pri; }
  muzzleLight(p) { this.flash(p.x, p.y, p.z, 9, 0.045, 2, 14); }
  enemyFlash(p) { const P = this.player.pos; this.hud.ping(p.x, p.z, 'B'); if (Math.hypot(p.x - P.x, p.z - P.z) > 45) return; this.flash(p.x, p.y, p.z, 5, 0.05, 1, 16); }
  // ---------------------------------------------------------------- player events
  onPlayerHurt(dmg, from, attacker, info) {
    if (from) { const P = this.player.pos; const a = Math.atan2(from.x - P.x, -(from.z - P.z)) + this.player.yaw; this.hud.damage(a); }
    this.audio.hurt(dmg); shake(Math.min(0.12, dmg * 0.004)); if (dmg > 8) this.hud.teach('regen');
    this.vm.k.roll.v += (Math.random() - 0.5) * 20; this.punch = Math.min(0.06, (this.punch || 0) + dmg * 0.0015);
  }
  onPlayerDeath(attacker, info) {
    this.deathCam = { t: 0, killer: attacker && !attacker.isPlayer ? attacker : null };
    if (this.stats) this.stats.deaths++;
    this.hud.killfeed(attacker || { name: 'World', team: 'B' }, this.player, info?.explosive ? 'Frag' : info?.storm ? 'Storm' : info?.w?.name ?? '', info?.zone === 'head', true);
    this.audio.ui('fail'); this.mode?.onPlayerDeath?.(attacker, info);
  }
  // ---------------------------------------------------------------- interactables + pickups
  addInteract(o) { const it = { r: 2.2, hold: 0, prog: 0, active: true, ...o }; this.interactables.push(it); return it; }
  addPickup(p) { const y = p.y !== undefined ? this.world.floorAt(p.x, p.z, 0.25, p.y + 0.2, 0.4) : this.world.groundAt(p.x, p.z); this.pickups.push({ spin: Math.random() * 6, ...p, y }); }
  updateInteract(dt, inp) {
    const P = this.player.pos; let best = null, bd = 1e9; this.player.forward(_v);
    for (const it of this.interactables) {
      if (!it.active || (it.cond && !it.cond())) continue; const dx = it.x - P.x, dz = it.z - P.z, d = Math.hypot(dx, dz);
      if (d > it.r || Math.abs((it.y ?? P.y) - P.y) > 2.5) continue; const facing = (dx * _v.x + dz * _v.z) / Math.max(d, 0.01); if (d > 1 && facing < 0.2) continue;
      if (d < bd) { bd = d; best = it; }
    }
    for (const pk of this.pickups) { const d = Math.hypot(pk.x - P.x, pk.z - P.z); if (d < 1.8 && d < bd && Math.abs(pk.y - P.y) < 1.8) { bd = d; best = { pickup: pk, label: pk.label, hold: 0 }; } }
    if (!best) { this.curInteract = null; return; }
    const K = keyLabel(this.prefs.keys.interact);
    if (best.pickup) { this.hud.prompt(`<kbd>${K}</kbd> ${best.label}`); if (inp.interactPressed) this.takePickup(best.pickup); return; }
    if (best.hold > 0) {
      if (inp.interact) { best.prog += dt / best.hold; best.onTick?.(best.prog); } else best.prog = Math.max(0, best.prog - dt * 2);
      this.hud.prompt(`Hold <kbd>${K}</kbd> ${best.label}`, best.prog);
      if (best.prog >= 1) { best.active = false; best.prog = 0; best.onDone?.(); }
    } else { this.hud.prompt(`<kbd>${K}</kbd> ${best.label}`); if (inp.interactPressed) best.onDone?.(); }
    this.curInteract = best;
  }
  takePickup(pk) {
    const a = this.arsenal; this.audio.ui('pickup');
    if (pk.kind === 'weapon') {
      const have = a.slots.findIndex((s) => s.id === pk.wid);
      if (have >= 0) { const s = a.slots[have]; s.reserve += s.w.mag * 2; if (pk.tier > s.tier) s.tier = pk.tier; }
      else if (a.slots.length < 2) { a.slots.push(a.makeSlot(pk.wid, pk.tier)); a.equip(a.slots.length - 1); }
      else { const old = a.slot; a.slots[a.idx] = a.makeSlot(pk.wid, pk.tier); a.equip(a.idx, true); this.addPickup({ kind: 'weapon', wid: old.id, tier: old.tier, x: this.player.pos.x + 0.6, z: this.player.pos.z + 0.4, y: this.player.pos.y, label: `Take ${WEAPONS[old.id].name}` }); }
      toast(`${TIERS[pk.tier].label} ${WEAPONS[pk.wid].name}`);
    } else if (pk.kind === 'ammo') a.addAmmo(0.6);
    else if (pk.kind === 'med') { this.player.health = Math.min(this.player.maxHealth, this.player.health + 50); }
    else if (pk.kind === 'shield') { this.player.armor = Math.min(100, this.player.armor + 50); }
    else if (pk.kind === 'mats') { this.mats = (this.mats || 0) + pk.n; this.hud.mats(this.mats); }
    else if (pk.kind === 'frag') { a.frags = Math.min(4, a.frags + 1); } else if (pk.kind === 'smoke') { a.smokes = Math.min(3, a.smokes + 1); }
    this.pickups.splice(this.pickups.indexOf(pk), 1); this.hud.weapon(a); pk.onTake?.();
  }
  drawPickups(dt) {
    let n = 0;
    for (const pk of this.pickups) {
      if (n >= 96) break; pk.spin += dt;
      const col = pk.kind === 'weapon' ? PICK_COL[pk.tier || 0] : pk.kind === 'med' ? _cMed : pk.kind === 'shield' ? _cSh : pk.kind === 'mats' ? _cMat : _cAmmo;
      _m.compose(_v.set(pk.x, pk.y + 0.35 + Math.sin(pk.spin * 2) * 0.05, pk.z), _q.setFromAxisAngle(_up, pk.spin), _s.set(1, 1, 1)); this.pickMesh.setMatrixAt(n, _m); this.pickMesh.setColorAt(n, col);
      _m.compose(_v.set(pk.x, pk.y + 0.04, pk.z), _q.identity(), _s.set(1, 1, 1)); this.pickRing.setMatrixAt(n, _m); this.pickRing.setColorAt(n, _tmpC.copy(col).multiplyScalar(2.5)); n++;
    }
    for (let i = n; i < 96 && i < (this.lastPick || 1); i++) { this.pickMesh.setMatrixAt(i, HIDE); this.pickRing.setMatrixAt(i, HIDE); }
    if (n === 0) { this.pickMesh.setMatrixAt(0, HIDE); this.pickRing.setMatrixAt(0, HIDE); }
    this.lastPick = n; this.pickMesh.count = this.pickRing.count = Math.max(1, n);
    for (const m of [this.pickMesh, this.pickRing]) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
  }
  // ---------------------------------------------------------------- frame
  update(rdt, inp) {
    const dt = rdt * (this.cfg.gameSpeed ?? 1) * (this.slowmo ? 0.4 : 1); this.time += dt; this.pathBudget = 4;
    const p = this.player, a = this.arsenal, pr = this.prefs;
    // look
    const fovK = this.camera.fov / pr.fov; const adsK = 1 + (pr.adsSens - 1) * a.ads;
    let lx = inp.lookDX * 0.0021 * pr.sens * fovK * adsK, ly = inp.lookDY * 0.0021 * pr.sens * fovK * adsK;
    if (inp.padLook) { let assist = 1; if (pr.aimAssist && this.assistTarget()) assist = 0.55; lx += (inp.padX || 0) * 3.4 * rdt * pr.sens * fovK * adsK * assist; ly += (inp.padY || 0) * 2.6 * rdt * pr.sens * fovK * adsK * assist; }
    if (p.alive && !this.deathCam) { p.yaw -= lx; p.pitch -= ly * (pr.invertY ? -1 : 1); p.pitch = clamp(p.pitch, -1.5, 1.5); }
    // player + weapons
    p.update(dt, inp);
    if (p.alive && !this.deathCam && !p.glide) this.weaponInput(dt, inp);
    p.firedT = (p.firedT ?? 9) + dt; p.firedRecently = p.firedT < 1.5;
    // camping detector (AI grenades)
    if (!this.campRef || Math.hypot(p.pos.x - this.campRef.x, p.pos.z - this.campRef.z) > 3) { this.campRef = { x: p.pos.x, z: p.pos.z }; p.campT = 0; } else p.campT = (p.campT || 0) + dt;
    this.suppress = Math.max(0, this.suppress - dt * 0.9);
    if (p.alive) this.updateInteract(dt, inp);
    this.mode?.update(dt, inp);
    for (const s of this.squads) s.update(dt);
    for (const b of this.bots) b.update(dt);
    this.grenades.update(dt);
    this.builds?.update(dt, inp);
    for (const e of this.emitters || []) { e.acc = (e.acc || 0) + dt; if (e.acc > e.rate) { e.acc = 0; this.fx.puff(e.x + (Math.random() - 0.5), e.y, e.z + (Math.random() - 0.5), 1.2 + Math.random(), 2.2, 0.4, 2.2, 1.6, 7, 0.32, 0.3, 0.29, 0.7, 0.25); } }
    this.fx.update(dt);
    // draw actors
    const R = this.actors; R.begin();
    for (const b of this.bots) {
      if (b.waiting || b.deadT > 9) continue; const col = b.colors || this.teamCol[b.team] || this.teamCol.B;
      if (b.kind === 'drone') { if (b.y > -40) R.drone(b, col.accent); } else R.soldier(b, col.body, b.alive ? col.accent : _dim);
    }
    R.end();
    this.drawPickups(dt);
    this.updateCamera(dt, rdt);
    // light decays
    if (this.fLT > 0) { this.fLT -= rdt; this.fLight.intensity = this.fLT > 0 ? this.fI * (this.fLD > 0.2 ? this.fLT / this.fLD : 1) : 0; if (this.fLT <= 0) this.fPri = 0; }
    this.atm.follow(p.pos); this.atm.update(dt, () => this.audio.thunder());
    this.audio.setListener(this.camera.position.x, this.camera.position.y, this.camera.position.z, p.yaw);
    this.hud.update(rdt, this);
    if (this.gameCam) this.gameCam.counts = { bots: this.bots.filter((b) => b.alive).length, ...this.counts };
  }
  assistTarget() {
    const cam = this.camera; _v.set(0, 0, -1).transformDirection(cam.matrixWorld);
    for (const b of this.bots) { if (!b.alive || b.team === this.player.team) continue; _w.set(b.x - cam.position.x, b.y + 1.2 - cam.position.y, b.z - cam.position.z); const d = _w.length(); if (d > 60) continue; if (_w.normalize().dot(_v) > Math.cos(3.5 * DEG)) return b; }
    return null;
  }
  weaponInput(dt, inp) {
    const a = this.arsenal, p = this.player;
    if (this.buildMode) { a.ads = Math.max(0, a.ads - dt * 6); return; }
    if (inp.reloadPressed) a.startReload();
    if (inp.primary) a.equip(0); if (inp.secondary) a.equip(1); if (inp.swapPressed || inp.wheel) a.swapNext();
    // melee
    if (inp.meleePressed && a.meleeT <= 0) this.melee();
    // grenades: hold to cook frag, release to throw
    if (inp.frag && a.frags > 0 && a.cook < 0 && a.nadeT <= 0) { a.cook = 0; a.nadeT = 1; this.audio.pin(); a.cancelReload(); }
    if (a.cook >= 0) {
      a.cook += dt; a.nadeT = 1;
      if (a.cook > GRENADES.frag.fuse - 0.05) { a.cook = -1; a.frags--; a.nadeT = 0; this.explode(p.pos.x, p.pos.y + 1, p.pos.z, { radius: GRENADES.frag.radius, dmg: GRENADES.frag.dmg, owner: p }); this.hud.ammo(a); }
      else if (!inp.frag) { this.throwPlayerNade('frag', GRENADES.frag.fuse - a.cook); a.cook = -1; a.frags--; a.nadeT = 0.35; this.hud.ammo(a); }
      else this.hud.prompt(`Cooking — ${(GRENADES.frag.fuse - a.cook).toFixed(1)}s`, 1 - a.cook / GRENADES.frag.fuse, 0.1);
    } else if (a.nadeT > 0) a.nadeT -= dt;
    if (inp.smokePressed && a.smokes > 0 && a.nadeT <= 0) { a.smokes--; a.nadeT = 0.35; this.throwPlayerNade('smoke'); this.hud.ammo(a); }
    const fired = a.update(dt, inp, p);
    if (fired) { p.firedT = 0; this.hud.teach('fire'); if (a.ads < 0.2 && this.stats.shots > 25) this.hud.teach('ads'); }
  }
  throwPlayerNade(kind, fuse) {
    const cam = this.camera; _v.set(0, 0, -1).transformDirection(cam.matrixWorld); const G = GRENADES[kind]; const p = this.player;
    const o = cam.position; const sp = G.throwSpeed;
    this.grenades.throw(kind, o.x + _v.x * 0.5, o.y + _v.y * 0.5 - 0.1, o.z + _v.z * 0.5, _v.x * sp + p.vel.x, _v.y * sp + 3.5, _v.z * sp + p.vel.z, p, fuse);
  }
  melee() {
    const a = this.arsenal, p = this.player; a.meleeT = 0.45; const cam = this.camera; _v.set(0, 0, -1).transformDirection(cam.matrixWorld);
    let hit = false;
    for (const b of this.bots) {
      if (!b.alive || b.team === p.team) continue; const dx = b.x - p.pos.x, dz = b.z - p.pos.z, d = Math.hypot(dx, dz);
      if (d < 2.2 && (dx * _v.x + dz * _v.z) / d > 0.5 && Math.abs(b.y - p.pos.y) < 1.6) { _dir.set(dx, 0, dz).normalize(); this.damage(b, 140, 'body', p, null, _dir, { melee: true }); this.fx.impact(b.x, b.y + 1.2, b.z, -_v.x, 0, -_v.z, b.kind === 'drone' ? 'robot' : 'flesh'); hit = true; break; }
    }
    if (!hit) { const h = this.world.ray(cam.position.x, cam.position.y, cam.position.z, _v.x, _v.y, _v.z, 2.0); if (h) { this.fx.impact(h.x, h.y, h.z, h.nx, h.ny, h.nz, h.surf, 0.6); this.mode?.onSalvage?.(h); hit = true; } }
    this.audio.melee(hit); if (hit) shake(0.04);
  }
  updateCamera(dt, rdt) {
    const cam = this.camera, p = this.player, a = this.arsenal, pr = this.prefs;
    const rm = settings.reducedMotion;
    // FOV: ADS zoom per weapon, sprint widen
    const w = a.w; const adsE = a.ads * a.ads * (3 - 2 * a.ads);
    const adsFov = w ? w.adsFov * (pr.fov / 70) : pr.fov;
    let fov = pr.fov + (adsFov - pr.fov) * adsE + p.sprintK * (rm ? 0 : 4);
    if (a.holdBreath) fov *= 0.94;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    // position: eye + lean + head bob
    p.bobT += p.grounded ? p.speedH * dt * 1.35 : 0;
    const bob = rm ? 0 : Math.sin(p.bobT * 2) * 0.03 * Math.min(1, p.speedH / 5) * (1 - a.ads * 0.85);
    p.forward(_v); const rx = -_v.z, rz = _v.x;
    const lean = p.leanK * 0.42;
    cam.position.set(p.pos.x + rx * lean, p.pos.y + p.eye + bob - p.landK * (rm ? 0.02 : 0.12), p.pos.z + rz * lean);
    // death cam: drop to the floor, look at the killer
    let yaw = p.yaw, pitch = p.pitch, roll = -p.leanK * 0.13 + (p.slideT > 0 && !rm ? 0.06 : 0);
    if (this.deathCam) {
      const dc = this.deathCam; dc.t += rdt; const k = Math.min(1, dc.t / 0.9);
      cam.position.y = p.pos.y + p.eye + (0.3 - p.eye) * k * k; roll += k * 0.6;
      if (dc.killer) { const ky = Math.atan2(-(dc.killer.x - p.pos.x), -(dc.killer.z - p.pos.z)); dc.yaw = dc.yaw ?? yaw; dc.yaw += wrapAngle(ky - dc.yaw) * Math.min(1, rdt * 3); yaw = dc.yaw; pitch = pitch * (1 - k) + 0.1 * k; }
    }
    // scope sway (sniper) when not holding breath
    if (a.ads > 0.85 && w?.optic === 'sniper' && !a.holdBreath && !rm) { pitch += Math.sin(this.time * 1.1) * 0.0035; yaw += Math.sin(this.time * 0.7) * 0.004; }
    this.punch = damp(this.punch || 0, 0, 10, rdt);
    cam.rotation.set(pitch + this.punch, yaw, roll, 'YXZ');
    applyShake(cam, rdt);
    const vs = a.vmState(p, this.input.state);
    this.vm.update(rdt, vs);
    this.vm.root.visible = !this.deathCam && !vs.scoped && !this.buildMode && !p.glide;
  }
}
export function keyLabel(code) { if (!code) return '?'; return code.replace(/^Key/, '').replace(/^Digit/, '').replace('ShiftLeft', 'Shift').replace('ControlLeft', 'Ctrl').replace('Space', 'Space').replace('Arrow', ''); }
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _tmpC = new THREE.Color();
const _cMed = new THREE.Color(0xff5a5a), _cSh = new THREE.Color(0x4aa8ff), _cMat = new THREE.Color(0x8fd6ff), _cAmmo = new THREE.Color(0xc8b070), _dim = new THREE.Color(0.05, 0.05, 0.05);
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);
