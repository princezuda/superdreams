// Emberwake — field mode: hero + party trail, NPCs that wander and turn to talk, visible enemies that notice,
// chase and can be struck first, chests/shrines/signs, exits, the diorama camera, and cutscene puppeteering.
import * as THREE from 'three/webgpu';
import { MAPS, canStep, groundY, walkable, heightAt } from './maps.js';
import { CAST } from './story.js';
import { Actor, spriteLight } from './actors.js';
import { buildWorld } from './world.js';
import { GB, V } from './geo.js';
import { T } from './atlas.js';
import { I, moveVector } from './input.js';
import { U, M } from './render.js';
import { ENEMIES, GROUPS } from './data.js';
import { tween, ease, settings } from '/shared/sd-kit.js';

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const dirOf = (dx, dz) => (Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'right' : 'left') : dz > 0 ? 'down' : 'up');
const AMBIENT = { kindlewick: 'embers', overworld: 'embers', mossbarrow: 'fireflies', saltmere: 'embers', saltglass: 'sparkles', lanternspire: 'ash' };

export class Field {
  constructor(app) {
    this.app = app; this.root = new THREE.Group(); app.scene.add(this.root);
    this.ents = new Map(); this.player = null; this.followers = []; this.trail = []; this.map = null; this.built = null;
    this.cam = { x: 0, z: 0, y: 0, over: null, zoom: 1, pitch: 0.72, dist: 18 };
    this.busy = false; this.stepAcc = 0; this.encounterCooldown = 0; this.nearest = null; this.t = 0;
  }
  get s() { return this.app.s; }
  get f() { return this.app.s.flags; }

  // ------------------------------------------------------------------ build / teardown
  load(mapId, at, dir = 'down') {
    for (const c of [...this.root.children]) { this.root.remove(c); c.traverse?.((o) => { if (o.geometry) o.geometry.dispose(); }); }
    this.ents.clear(); this.followers = []; this.trail = [];
    const Mp = MAPS[mapId]; this.map = mapId; this.Mp = Mp;
    const preset = this.preset = mapId === 'kindlewick' && this.f.ending ? 'dawn' : mapId === 'saltglass' && this.f.boss2 ? 'crystalLit' : Mp.light;
    this.cam.pitch = Mp.kind === 'dungeon' ? 0.86 : 0.7; this.cam.dist = Mp.kind === 'dungeon' ? 21 : 23;
    this.app.lighting.camDist = this.cam.dist; this.app.lighting.apply(preset);
    spriteLight.value = { cave: 0.55, crystal: 0.55, crystalLit: 0.5, night: 0.5 }[preset] ?? 0.32;
    const B = this.built = buildWorld(mapId, this.f); this.root.add(B.group);
    this.app.fx.setFlames(B.flames); this.app.fx.setAmbient(this.f.ending && mapId === 'kindlewick' ? 'dawn' : AMBIENT[mapId], null);
    this.cam.pitch = Mp.kind === 'dungeon' ? 0.86 : 0.7; this.cam.dist = Mp.kind === 'dungeon' ? 21 : 23;
    // dynamic toggles that depend on flags
    this.refreshDynamic();
    // player + party trail
    const lead = this.s.party[0];
    this.player = this.spawnActor('player', CAST[lead].look, lead, at[0], at[1], dir);
    this.player.speed = 3.4;
    // lay the party out in a line behind the leader (and seed the trail along it)
    const [bx, bz] = DIRS[dir] || [0, 1];
    for (let i = 0; i < 60; i++) { let x = at[0] - bx * i * 0.12, z = at[1] - bz * i * 0.12; if (!walkable(mapId, x, z, this.f)) { x = this.trail[i - 1]?.x ?? at[0]; z = this.trail[i - 1]?.z ?? at[1]; } this.trail.push({ x, z, dir }); }
    this.s.party.slice(1).forEach((id, i) => { const tp = this.trail[Math.min(59, (i + 1) * 7)]; const fo = this.spawnActor('follow:' + id, CAST[id].look, id, tp.x, tp.z, dir); this.followers.push(fo); });
    // NPCs / enemies / chests / shrines
    for (const n of Mp.npcs || []) { const e = this.spawnActor(n.id, CAST[n.cast].look, n.cast, n.x, n.z, n.face || 'down'); e.ent = n; e.kind = 'npc'; e.home = [n.x, n.z]; e.wanderT = Math.random() * 3; }
    for (const en of Mp.enemies || []) { const big = en.boss; const a = new Actor({ monster: en.sprite, scale: big ? 1 : 0.7 }); const e = this.wrap(en.id, a, en.x, en.z, 'right'); e.ent = en; e.kind = 'enemy'; e.home = [en.x, en.z]; e.state = 'idle'; e.wanderT = Math.random() * 2; e.stun = 0; }
    for (const c of Mp.chests || []) this.spawnChest(c);
    for (const sh of Mp.shrines || []) this.spawnShrine(sh);
    this.syncVisibility();
    this.cam.x = at[0]; this.cam.z = at[1]; this.cam.over = null; this.cam.zoom = 1;
    this.app.lighting.follow(at[0], at[1]);
    this.updateCamera(0, true);
  }
  // back from a battle: restore this map's look without rebuilding it
  resume() {
    this.app.lighting.camDist = this.cam.dist; this.app.lighting.apply(this.preset);
    spriteLight.value = { cave: 0.55, crystal: 0.55, crystalLit: 0.5, night: 0.5 }[this.preset] ?? 0.32;
    this.app.fx.setFlames(this.built.flames); this.app.fx.setAmbient(this.f.ending && this.map === 'kindlewick' ? 'dawn' : AMBIENT[this.map], null);
    for (const e of this.ents.values()) if (e.kind === 'enemy') { e.state = 'idle'; e.goal = null; }
    this.syncVisibility(); this.refreshDynamic(); this.updateCamera(0, true);
  }
  wrap(id, actor, x, z, dir) { const e = { id, actor, x, z, y: groundY(this.map, x, z), dir, visible: true }; actor.face(dir); actor.tilt(this.cam.pitch); this.root.add(actor.group); this.ents.set(id, e); this.place(e); return e; }
  spawnActor(id, look, key, x, z, dir) { const a = new Actor({ look, key }); return this.wrap(id, a, x, z, dir); }
  place(e) { e.actor.group.position.set(e.x, e.y, e.z); }
  spawnChest(c) {
    const g = new THREE.Group(), base = new GB(), lid = new GB();
    base.box(-0.32, 0, -0.22, 0.32, 0.32, 0.22, T.chest); lid.box(-0.33, 0, -0.44, 0.33, 0.16, 0.0, { side: T.chest, top: T.wood });
    const bm = new THREE.Mesh(base.build(), M.world), lm = new THREE.Mesh(lid.build(), M.world); bm.castShadow = lm.castShadow = true;
    const pivot = new THREE.Group(); pivot.position.set(0, 0.32, 0.22); pivot.add(lm); g.add(bm, pivot);
    const y = groundY(this.map, c.x, c.z); g.position.set(c.x, y, c.z); this.root.add(g);
    const open = !!this.s.chests[c.id]; pivot.rotation.x = open ? -1.9 : 0;
    this.ents.set(c.id, { id: c.id, kind: 'chest', ent: c, x: c.x, z: c.z, y, obj: g, lid: pivot, open });
  }
  spawnShrine(sh) {
    const g = new THREE.Group(), gb = new GB(), gl = new GB(); const y = groundY(this.map, sh.x, sh.z);
    gb.box(-0.42, 0, -0.42, 0.42, 0.25, 0.42, { side: T.statue, top: T.stone }); gb.box(-0.22, 0.25, -0.22, 0.22, 0.95, 0.22, T.statue); gb.box(-0.32, 0.95, -0.32, 0.32, 1.05, 0.32, T.iron);
    gl.geom(new THREE.OctahedronGeometry(0.2, 0), T.cloth, [2.6, 1.6, 0.6], new THREE.Matrix4().makeTranslation(0, 1.45, 0));
    const m1 = new THREE.Mesh(gb.build(), M.world); m1.castShadow = true; const m2 = new THREE.Mesh(gl.build(), M.glow); g.add(m1, m2); g.position.set(sh.x, y, sh.z); this.root.add(g);
    this.ents.set(sh.id, { id: sh.id, kind: 'shrine', ent: sh, x: sh.x, z: sh.z, y, obj: g, gem: m2 });
    this.built.lights.push({ x: sh.x, y: y + 1.5, z: sh.z + 0.3, c: '#ffb860', i: 3.5, r: 6, flicker: true });
  }
  refreshDynamic() {
    const D = this.built.dyn, f = this.f;
    if (D.thorns) D.thorns.visible = !f.thornsGone;
    if (D.gateRoots) D.gateRoots.visible = !f.rootsOpen; if (D.glowRoots) D.glowRoots.visible = !f.rootsOpen;
    if (D.glowHeart) D.glowHeart.visible = !f.boss1;
    if (D.glowlighthouseLamp) D.glowlighthouseLamp.visible = !!f.boss2;
    for (const l of this.built.lights) { if (l.id === 'lighthouseLamp') l.i = f.boss2 ? 8 : 0; if (l.id === 'focus') l.i = f.boss2 ? 6 : 0.6; if (l.id === 'ember') l.i = f.boss3 ? 16 : 7; }
    if (D.glowFocus) D.glowFocus.visible = true;
    if (D.ember) D.ember.material.userData.heat.value = f.boss3 ? 1.0 : 0.35;
    if (D.beam) D.beam.visible = this.map === 'mossbarrow' || !!f.boss2;
  }
  syncVisibility() {
    const W = this.app.world;
    for (const e of this.ents.values()) {
      if (e.kind === 'npc') e.visible = W.visible(e.ent, 'npc');
      else if (e.kind === 'enemy') e.visible = W.visible(e.ent, 'enemy');
      else continue;
      e.actor.group.visible = e.visible;
    }
  }

  // ------------------------------------------------------------------ per-frame
  update(dt, t) {
    this.t = t; this.encounterCooldown -= dt;
    const W = this.app.world, P = this.player; if (!P) return;
    const canControl = this.app.mode === 'field' && !this.busy && !W.busy && !this.app.ui.blocking();
    // ---- hero movement
    let mv = canControl ? moveVector() : { x: 0, z: 0 };
    const run = I.held('run') || I.held('cancel') || Math.hypot(mv.x, mv.z) > 0.95 && I.lastDevice !== 'kb' ? 1 : 0;
    const spd = (run || this.app.opts.autoRun ? 4.9 : 3.3);
    P.actor.moving = false;
    if (!P.scripted && (mv.x || mv.z)) {
      const len = Math.hypot(mv.x, mv.z), vx = mv.x * spd, vz = mv.z * spd;
      P.dir = dirOf(mv.x, mv.z); P.actor.face(P.dir);
      this.moveEnt(P, vx * dt, vz * dt, 0.27);
      P.actor.moving = len > 0.1;
      this.stepAcc += dt * len * spd; if (this.stepAcc > 0.9) { this.stepAcc = 0; this.app.sfx.step?.(this.map); }
    }
    if (P.scripted) P.actor.moving = P.walking;
    P.y += (groundY(this.map, P.x, P.z) - P.y) * Math.min(1, dt * 14);
    this.place(P); P.actor.animate(dt);
    // ---- trail + followers
    const last = this.trail[0];
    if (Math.hypot(P.x - last.x, P.z - last.z) > 0.12) { this.trail.unshift({ x: P.x, z: P.z, dir: P.dir }); this.trail.length = 60; }
    this.followers.forEach((fo, i) => {
      const k = Math.min(this.trail.length - 1, (i + 1) * 7), tp = this.trail[k];
      const dx = tp.x - fo.x, dz = tp.z - fo.z, d = Math.hypot(dx, dz);
      fo.actor.moving = d > 0.05; if (d > 0.01) { const s = Math.min(d, spd * 1.2 * dt + d * 0.1); fo.x += dx / d * s; fo.z += dz / d * s; fo.dir = d > 0.05 ? dirOf(dx, dz) : fo.dir; }
      if (!fo.actor.moving) fo.dir = tp.dir; fo.actor.face(fo.dir);
      fo.y += (groundY(this.map, fo.x, fo.z) - fo.y) * Math.min(1, dt * 14); this.place(fo); fo.actor.animate(dt);
    });
    // ---- NPCs + enemies
    for (const e of this.ents.values()) {
      if (e.kind === 'npc' && e.visible) this.updateNPC(e, dt);
      else if (e.kind === 'enemy' && e.visible) this.updateEnemy(e, dt, canControl);
      else if (e.kind === 'shrine') { e.gem.position.y = Math.sin(t * 2) * 0.06; e.gem.rotation.y = t; }
    }
    if (this.app.mode !== 'field' && this.app.mode !== 'title') { this.app.ui.prompt(null); this.updateCamera(dt); return; }
    // ---- interaction target + prompt
    this.nearest = canControl ? this.findInteract() : null;
    this.app.ui.prompt(this.nearest ? this.screenOf(this.nearest.x, (this.nearest.y || 0) + (this.nearest.kind === 'npc' ? 2.0 : 1.2), this.nearest.z) : null, this.nearest?.label);
    if (canControl && I.take('confirm')) this.interact();
    // ---- exits & triggers (edge-triggered inside World)
    if (canControl) W.onMove(P.x, P.z);
    // ---- lights, camera
    this.app.lighting.assign(this.built.lights, this.cam.x, this.cam.z, { x: P.x + 0.4, y: P.y + 2.6, z: P.z + 0.3 });
    for (const fn of this.built.anim) fn(t);
    this.updateCamera(dt);
  }
  moveEnt(e, dx, dz, r) {
    const ok = (x, z) => this.free(e, x, z, r);
    if (ok(e.x + dx, e.z)) e.x += dx; else if (dx) { /* slide around corners */ for (const s of [0.5, -0.5]) if (ok(e.x + dx, e.z + s * Math.abs(dx))) { e.z += s * Math.abs(dx) * 0.6; break; } }
    if (ok(e.x, e.z + dz)) e.z += dz; else if (dz) { for (const s of [0.5, -0.5]) if (ok(e.x + s * Math.abs(dz), e.z + dz)) { e.x += s * Math.abs(dz) * 0.6; break; } }
  }
  free(e, x, z, r) {
    for (const [ox, oz] of [[0, 0], [r, 0], [-r, 0], [0, r * 0.6], [0, -r * 0.6], [r * 0.7, r * 0.45], [-r * 0.7, r * 0.45], [r * 0.7, -r * 0.4], [-r * 0.7, -r * 0.4]]) if (!canStep(this.map, e.x, e.z, x + ox, z + oz, this.f)) return false;
    for (const c of this.built.colliders) { const d = Math.hypot(x - c.x, z - c.z); if (d < c.r + r && d < Math.hypot(e.x - c.x, e.z - c.z) + 1e-3) return false; }
    for (const o of this.ents.values()) {
      if (o === e || o.id === 'player' || o.id?.startsWith('follow:') || o.kind === 'enemy' || (o.kind === 'npc' && !o.visible)) continue;
      const rr = o.kind === 'npc' ? 0.32 : o.kind === 'chest' ? 0.4 : o.kind === 'shrine' ? 0.5 : 0; if (!rr) continue;
      const d = Math.hypot(x - o.x, z - o.z); if (d < rr + r && d < Math.hypot(e.x - o.x, e.z - o.z)) return false;
    }
    return true;
  }
  updateNPC(e, dt) {
    if (e.scripted) { e.actor.moving = e.walking; e.actor.animate(dt); e.y = groundY(this.map, e.x, e.z); this.place(e); return; }
    const n = e.ent;
    if (n.wander && !this.app.world.busy) {
      e.wanderT -= dt;
      if (e.wanderT <= 0) { e.wanderT = 2 + Math.random() * 3; const a = Math.random() * Math.PI * 2, r = Math.random() * n.wander; e.goal = Math.random() < 0.35 ? null : [e.home[0] + Math.cos(a) * r, e.home[1] + Math.sin(a) * r]; }
      if (e.goal) { const dx = e.goal[0] - e.x, dz = e.goal[1] - e.z, d = Math.hypot(dx, dz); if (d < 0.1) e.goal = null; else { const s = Math.min(d, 1.1 * dt); const ox = e.x, oz = e.z; this.moveEnt(e, dx / d * s, dz / d * s, 0.25); if (Math.hypot(e.x - ox, e.z - oz) < s * 0.3) e.goal = null; e.dir = dirOf(dx, dz); e.actor.face(e.dir); } }
      e.actor.moving = !!e.goal;
    }
    e.actor.animate(dt); e.y = groundY(this.map, e.x, e.z); this.place(e);
  }
  updateEnemy(e, dt, canControl) {
    const P = this.player, en = e.ent, dx = P.x - e.x, dz = P.z - e.z, d = Math.hypot(dx, dz);
    e.stun -= dt; e.actor.mesh.visible = !(e.stun > 0 && Math.floor(this.t * 10) % 2);
    const lvl = Math.min(...this.s.party.map((id) => this.s.heroes[id].lv));
    const grpLv = { tut: 1, g1: 2, g2: 3, g3: 3, g4: 3, g5: 4, g6: 4, g7: 5, c1: 7, c2: 7, c3: 7, c4: 8, c5: 9, c6: 9, o2: 6, s1: 11, s2: 11, s3: 12, s4: 12, s5: 13 }[en.group] ?? 99;
    const skittish = lvl >= grpLv + 6;
    if (!en.still && canControl && e.stun <= 0 && !this.app.world.busy) {
      if (e.state === 'idle' && d < 4.2 && !skittish && this.encounterCooldown <= 0) { e.state = 'chase'; e.chaseT = 4; this.app.ui.emote(e, '!'); this.app.sfx.notice?.(); }
      if (e.state === 'chase') {
        e.chaseT -= dt; if (e.chaseT <= 0 || d > 8) { e.state = 'idle'; e.goal = null; }
        else { const s = 2.6 * dt; this.moveEnt(e, dx / d * s, dz / d * s, 0.3); e.dir = dx > 0 ? 'right' : 'left'; }
      } else {
        e.wanderT -= dt;
        if (e.wanderT <= 0) { e.wanderT = 1.5 + Math.random() * 2.5; const a = Math.random() * 6.28; e.goal = [e.home[0] + Math.cos(a) * 1.8, e.home[1] + Math.sin(a) * 1.4]; }
        if (skittish && d < 3.5) e.goal = [e.x - dx / d * 2, e.z - dz / d * 2];
        if (e.goal) { const gx = e.goal[0] - e.x, gz = e.goal[1] - e.z, gd = Math.hypot(gx, gz); if (gd < 0.1) e.goal = null; else { const s = Math.min(gd, (skittish ? 2.4 : 0.9) * dt); this.moveEnt(e, gx / gd * s, gz / gd * s, 0.3); e.dir = gx > 0 ? 'right' : 'left'; } }
      }
      e.actor.moving = e.state === 'chase' || !!e.goal;
    }
    e.actor.face(e.dir); e.actor.animate(dt);
    e.y += (groundY(this.map, e.x, e.z) + (en.sprite === 'thornbat' || en.sprite === 'moth' || en.sprite === 'shade' || en.sprite === 'lamp' ? 0.35 + Math.sin(this.t * 3 + e.x) * 0.1 : 0) - e.y) * Math.min(1, dt * 10);
    this.place(e);
    if (canControl && e.stun <= 0 && this.encounterCooldown <= 0 && d < (en.boss ? 1.7 : 0.75) && (!en.still || en.script)) this.app.encounter(e, false);
  }
  findInteract() {
    const P = this.player, [fx, fz] = DIRS[P.dir]; let best = null, bd = 1e9;
    const consider = (o, x, z, label, reach = 1.35) => { const dx = x - P.x, dz = z - P.z, d = Math.hypot(dx, dz); if (d > reach) return; const facing = (dx * fx + dz * fz) / (d || 1); if (facing < 0.2 && d > 0.6) return; const sc = d - facing * 0.5; if (sc < bd) { bd = sc; best = { ...o, x, z, label }; } };
    for (const e of this.ents.values()) {
      if (e.kind === 'npc' && e.visible && e.ent.script) consider({ kind: 'npc', e }, e.x, e.z, 'Talk', 1.45);
      else if (e.kind === 'chest' && !e.open) consider({ kind: 'chest', e }, e.x, e.z, 'Open');
      else if (e.kind === 'shrine') consider({ kind: 'shrine', e }, e.x, e.z, 'Rest & Save', 1.4);
      else if (e.kind === 'enemy' && e.visible) consider({ kind: 'enemy', e }, e.x, e.z, e.ent.still ? (e.ent.boss ? 'Confront' : 'Approach') : 'Strike first!', e.ent.boss ? 2.4 : e.ent.still ? 1.6 : 1.7);
    }
    for (const sg of this.built.signs) consider({ kind: 'sign', sg }, sg.x, sg.z, 'Read', 1.3);
    if (best) best.y = (best.e?.y ?? groundY(this.map, best.x, best.z));
    return best;
  }
  async interact() {
    const n = this.nearest; if (!n) return; const W = this.app.world, P = this.player;
    this.busy = true;
    try {
      if (n.kind === 'npc') { const e = n.e; const d = dirOf(P.x - e.x, P.z - e.z); const prev = e.dir; e.dir = d; e.actor.face(d); e.goal = null; this.app.sfx.talk?.(); await W.talk(e.id); if (e.ent.face && !e.ent.wander) { e.dir = e.ent.face; e.actor.face(e.dir); } else e.dir = prev; }
      else if (n.kind === 'chest') { const e = n.e; this.app.sfx.chest?.(); e.open = true; await tween(0.35, (k) => (e.lid.rotation.x = -1.9 * k), { ease: ease.outBack }); this.app.fx.burst('gold', e.x, e.y + 0.5, e.z, 18, { up: 2.4 }); await W.openChest(e.id); this.app.autosave(); }
      else if (n.kind === 'shrine') { this.app.fx.ring('heal', n.e.x, n.e.y + 0.2, n.e.z, 1.2); this.app.sfx.heal?.(); await W.useShrine(n.e.id); }
      else if (n.kind === 'sign') { await this.app.ui.say('', n.sg.text); }
      else if (n.kind === 'enemy') {
        const e = n.e;
        if (e.ent.still) { await W.touchEnemy(e.id); }
        else { P.actor.pose = 'attack'; P.actor.poseFlip = e.x > P.x; this.app.sfx.swing?.(); this.app.fx.burst('blade', e.x, e.y + 0.6, e.z, 10); setTimeout(() => (P.actor.pose = null), 220); await this.app.encounter(e, true); }
      }
    } finally { this.busy = false; this.syncVisibility(); this.refreshDynamic(); }
  }

  // ------------------------------------------------------------------ camera
  updateCamera(dt, snap = false) {
    const C = this.cam, P = this.player, cam = this.app.camera;
    let tx, tz, ty;
    if (C.over) { tx = C.over.x; tz = C.over.z; ty = C.over.y ?? groundY(this.map, tx, tz); }
    else { tx = P.x + I.move.x * 0.8; tz = P.z + I.move.z * 0.5; ty = P.y; }
    // keep the frame on the diorama
    const { W, H } = this.builtWH(); const asp = this.app.aspect, mx = Math.min(W / 2, 6.5 * Math.min(1.7, asp)), mz = Math.min(H / 2, 4);
    if (this.Mp.kind !== 'field') { tx = Math.max(mx - 0.5, Math.min(W - mx + 0.5, tx)); tz = Math.max(mz - 1.5, Math.min(H - mz + 0.5, tz)); }
    const k = snap ? 1 : 1 - Math.exp(-dt * (C.over ? 2.5 : 5));
    C.x += (tx - C.x) * k; C.z += (tz - C.z) * k; C.y += (ty - C.y) * k;
    const portrait = asp < 1; const zoom = C.zoom * (portrait ? 1.08 : 1);
    cam.fov = portrait ? 46 : 30; cam.aspect = asp; cam.updateProjectionMatrix();
    const dist = C.dist * zoom, br = settings.reducedMotion ? 0 : Math.sin(this.t * 0.35) * 0.08;
    cam.position.set(C.x + br, C.y + Math.sin(C.pitch) * dist, C.z + Math.cos(C.pitch) * dist);
    cam.lookAt(C.x, C.y + 0.6, C.z);
    this.app.lighting.follow(C.x, C.z);
    // occlusion-dither uniforms
    const sp = this.screenOf(P.x, P.y + 0.8, P.z, true);
    U.playerScreen.value.set(sp.u, sp.v); U.playerY.value = P.y; U.aspect.value = asp;
    const vp = new THREE.Vector3(P.x, P.y + 0.8, P.z).applyMatrix4(cam.matrixWorldInverse); U.playerViewZ.value = vp.z;
    U.focusY.value = 1 - sp.v; U.focusBand.value = 0.2;
  }
  builtWH() { return { W: this.built.W, H: this.built.H }; }
  screenOf(x, y, z, uvOnly = false) {
    const v = new THREE.Vector3(x, y, z); this.app.camera.updateMatrixWorld(); v.project(this.app.camera);
    const u = (v.x + 1) / 2, w = (1 - v.y) / 2; if (uvOnly) return { u, v: 1 - w };
    return { x: u * innerWidth, y: w * innerHeight, on: v.z < 1 };
  }

  // ------------------------------------------------------------------ cutscene puppeteering (host API)
  entity(id) { if (id === 'player') return this.player; return this.ents.get(id); }
  async walkTo(id, x, z, speed = 2.6) {
    const e = this.entity(id); if (!e) return; e.scripted = true; e.walking = true;
    const sx = e.x, sz = e.z, d = Math.hypot(x - sx, z - sz); if (d < 0.01) { e.walking = false; e.scripted = id === 'player' ? false : e.scripted; return; }
    e.dir = dirOf(x - sx, z - sz); e.actor.face(e.dir);
    await tween(d / speed, (k) => { e.x = sx + (x - sx) * k; e.z = sz + (z - sz) * k; }, { ease: (t) => t });
    e.walking = false; if (id === 'player') e.scripted = false; else e.scripted = false;
  }
  face(id, dir) { const e = this.entity(id); if (e) { e.dir = dir; e.actor.face(dir); } }
  setCam(x, z, o = {}) { this.cam.over = { x, z }; this.cam.zoom = o.zoom ?? 1; }
  resetCam() { this.cam.over = null; this.cam.zoom = 1; }
  hide(id) { const e = this.entity(id); if (e) { e.visible = false; e.actor.group.visible = false; } }
  show(id) { const e = this.entity(id); if (e) { e.visible = true; e.actor.group.visible = true; } }
  push() { const P = this.player, [fx, fz] = DIRS[P.dir]; for (let i = 0; i < 6; i++) { const nx = P.x - fx * 0.15, nz = P.z - fz * 0.15; if (walkable(this.map, nx, nz, this.f)) { P.x = nx; P.z = nz; } } }
}
