// Tactical bot AI: vision cone + hearing + near-miss suppression → awareness; authored cover points scored
// by protection/peekability; peek-and-shoot cycles; squad flanking; telegraphed grenades; text barks;
// difficulty-scaled reaction and accuracy. Navigation via the baked grid (A*), drones fly direct.
import { THREE } from '/shared/sd-kit.js';
import { WEAPONS } from './config.js';
import { clamp, damp, wrapAngle, coverScore, lobVelocity, DEG } from './logic.js';

const BARKS = {
  spot: ['Contact!', 'Eyes on hostile!', 'Target spotted!', 'Contact front!'],
  reload: ['Reloading!', 'Changing mag!', 'Cover me — reloading!'],
  flankL: ['Swinging wide left!', 'Flanking left!'], flankR: ['Moving right — flanking!', 'Going around the right!'],
  suppress: ['Keep their heads down!', 'Suppressing!', 'Pin them!'],
  pinned: ['Taking fire!', "I'm pinned!", 'Too hot — falling back!'],
  frag: ['Frag out!', 'Grenade out!'], nadeWarn: ['Grenade! Move!', 'Grenade — scatter!'],
  down: ['Man down!', 'We lost one!', 'Hostile got Rook!'], lost: ['Lost visual.', "Where'd they go?", 'Anyone have eyes?'],
  hurt: ["I'm hit!", 'Hit — still up!'], heard: ['Heard something.', 'Checking that noise.', 'Movement — over there.'],
  push: ['Push! Push!', 'Rushing in!', 'Close the distance!'],
  ally: ['On your six.', 'Enemy down!', 'Moving up with you.', 'Contact — engaging!'],
};
export const pickBark = (k) => { const a = BARKS[k]; return a[Math.floor(Math.random() * a.length)]; };
const CALLSIGNS_A = ['Hale', 'Ortega', 'Brandt', 'Kaya', 'Moss', 'Reyes', 'Ivers', 'Tamsin', 'Pryce', 'Okafor', 'Lund'];
const CALLSIGNS_B = ['Viper-1', 'Viper-2', 'Jackal', 'Rook', 'Kestrel', 'Mako', 'Vulture', 'Ghoul', 'Cobra', 'Talon', 'Scythe', 'Drift', 'Hound', 'Briar', 'Fang', 'Ash'];
let uid = 1;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _p = { x: 0, z: 0 };

export class Bot {
  constructor(game, o) {
    this.game = game; this.id = uid++; this.team = o.team ?? 'B'; this.kind = o.kind ?? 'soldier';
    const names = this.team === 'A' ? CALLSIGNS_A : CALLSIGNS_B; this.name = o.name ?? names[this.id % names.length];
    this.x = o.x; this.z = o.z; this.y = o.y ?? game.world.groundAt(o.x, o.z); this.vx = 0; this.vz = 0; this.vy = 0;
    this.yaw = o.yaw ?? 0; this.aimYaw = this.yaw; this.aimPitch = 0; this.headYaw = 0;
    const d = game.diff; const hpMul = this.team === 'B' ? (d?.hp ?? 1) : 1;
    this.maxHealth = (o.hp ?? (this.kind === 'heavy' ? 320 : this.kind === 'drone' ? 80 : 100)) * hpMul; this.health = this.maxHealth;
    this.alive = true; this.deadT = 0; this.wid = o.weapon ?? (this.kind === 'heavy' ? 'lmg' : this.kind === 'drone' ? 'smg' : 'ar'); this.w = WEAPONS[this.wid];
    this.mag = this.w.mag; this.reloadT = 0; this.cool = 0; this.burstLeft = 0; this.burstGap = 0;
    this.state = o.state ?? (o.patrol ? 'patrol' : 'idle'); this.patrol = o.patrol || null; this.patrolIdx = 0; this.guardYaw = this.yaw; this.idleT = Math.random() * 3;
    this.target = null; this.aware = 0; this.lastSeen = null; this.seeT = 0; this.visible = false; this.reactT = 0; this.lostT = 0;
    this.cover = null; this.coverPhase = 'move'; this.coverT = 0; this.path = null; this.pathIdx = 0; this.dest = null; this.repathT = 0; this.stuckT = 0;
    this.suppress = 0; this.flanking = false; this.nadeCd = 6 + Math.random() * 6; this.throwT = 0; this.barkCd = 1 + Math.random() * 2;
    this.crouchK = 0; this.crouch = false; this.leanK = 0; this.lean = 0; this.sprint = false; this.moveSpeed = 0; this.walkPhase = Math.random() * 6; this.flinchP = 0; this.flinchY = 0; this.flinchH = 0; this.recoilK = 0;
    this.scale = o.scale ?? (this.kind === 'heavy' ? 1.1 : 1); this.bulk = this.kind === 'heavy' ? 1.3 : 1; this.squad = o.squad ?? null; this.aggro = o.aggro ?? 0; this.role = o.role ?? 'rifle';
    this.thinkT = Math.random() * 0.25; this.percT = Math.random() * 0.12; this.hb = null; this.peekSide = 0; this.peekT = 0; this.hiding = false;
    this.altitude = this.kind === 'drone' ? 4 + Math.random() * 3 : 0; this.rotor = 0; this.orbit = Math.random() < 0.5 ? 1 : -1;
    this.stationary = !!o.stationary; this.glintT = 0; this.charge = 0; this.kills = 0; this.deaths = 0; this.score = 0;
    this.roam = o.roam || null; this.lootT = 0; this.tier = 0; this.armor = 0; this.inv = o.inv || null; this.ammoMul = 1;
    if (this.kind === 'drone') this.y = this.y + this.altitude;
  }
  get isPlayer() { return false; }
  pos(out) { return out.set(this.x, this.y, this.z); }
  eye(out) { return this.kind === 'drone' ? out.set(this.x, this.y - 0.1, this.z) : out.set(this.x, this.y + (1.55 - this.crouchK * 0.55) * this.scale, this.z); }
  bark(k, force = false) {
    if (!this.alive) return; if (!force && this.barkCd > 0) return; const sq = this.squad; if (!force && sq && sq.barkCd > 0) return;
    this.barkCd = 4 + Math.random() * 3; if (sq) sq.barkCd = 1.6; this.game.hud?.bark(this, pickBark(k));
  }
  hostiles() { return this.game.combatants.filter((c) => c.alive && c.team !== this.team && !c.hiddenFromAI); }
  // ---------------------------------------------------------------- perception (≈8 Hz)
  perceive(dt) {
    const g = this.game, W = g.world; const eye = this.eye(_v); const night = g.night ? 0.7 : 1; const range = (this.kind === 'drone' ? 60 : 70) * night * (g.visMul ?? 1);
    const fov = (this.state === 'combat' || this.aware > 0.4 ? 110 : 70) * DEG;
    let best = null, bd = 1e9;
    for (const h of this.hostiles()) {
      const hp = h.isPlayer ? h.pos : null; const hx = hp ? hp.x : h.x, hz = hp ? hp.z : h.z;
      const dx = hx - this.x, dz = hz - this.z, dist = Math.hypot(dx, dz); if (dist > range) continue;
      const ang = Math.abs(wrapAngle(Math.atan2(-dx, -dz) - this.yaw));
      const close = dist < 4; if (ang > fov && !close) continue;
      const hy = hp ? hp.y + h.eye * 0.85 : h.y + 1.3 * h.scale;
      const chest = hp ? hp.y + h.eye * 0.6 : h.y + 1.0;
      if (!W.los(eye.x, eye.y, eye.z, hx, hy, hz) && !W.los(eye.x, eye.y, eye.z, hx, chest, hz)) continue;
      const score = dist * (h === this.target ? 0.6 : 1) * (h.isPlayer ? 0.85 : 1);
      if (score < bd) { bd = score; best = { h, dist, x: hx, y: hy, z: hz }; }
    }
    const was = this.visible;
    if (best) {
      const h = best.h; const crouched = h.isPlayer ? h.crouchK > 0.5 : h.crouch; const moving = h.isPlayer ? h.speedH > 2 : h.moveSpeed > 2;
      const gain = (this.state === 'combat' ? 3.5 : 1.0) * (crouched ? 0.55 : 1) * (moving ? 1.4 : 1) * clamp(28 / (best.dist + 4), 0.25, 3) * (h.isPlayer && h.firedRecently ? 2.5 : 1);
      this.aware = Math.min(1.5, this.aware + gain * dt);
      if (this.aware >= 1) {
        if (!this.target || this.target !== h || !was) { this.reactT = g.diff.reaction * (0.75 + Math.random() * 0.5) * (this.kind === 'drone' ? 0.8 : 1); if (this.state !== 'combat') { this.bark(h.isPlayer || this.team === 'B' ? 'spot' : 'spot'); this.squad?.alert(this, best); } }
        this.target = h; this.visible = true; this.seeT += dt; this.lostT = 0;
        this.lastSeen = { x: best.x, y: best.y, z: best.z, t: g.time };
        if (this.state !== 'combat') this.enterCombat();
      } else if (this.state === 'idle' || this.state === 'patrol') { this.lookAt = { x: best.x, z: best.z }; }
    } else {
      this.visible = false; this.seeT = 0; this.lostT += dt;
      if (this.state !== 'combat') this.aware = Math.max(0, this.aware - dt * 0.15);
      if (this.target && !this.target.alive) { this.target = null; }
      if (was && this.state === 'combat' && Math.random() < 0.3) this.bark('lost');
    }
  }
  enterCombat() { this.state = 'combat'; this.aware = Math.max(this.aware, 1); this.cover = null; this.coverPhase = 'move'; this.thinkT = 0; }
  hear(x, z, loud, src) {
    if (!this.alive || src?.team === this.team) return;
    const d = Math.hypot(x - this.x, z - this.z); if (d > loud) return;
    if (this.leash) { this.aware = Math.max(this.aware, 0.5); this.lookAt = { x, z }; return; }
    if (this.state === 'combat') { if (!this.visible && src) this.lastSeen = { x: x + (Math.random() - 0.5) * 4, y: (src.pos?.y ?? src.y ?? 0) + 1.2, z: z + (Math.random() - 0.5) * 4, t: this.game.time }; return; }
    this.aware = Math.max(this.aware, d < loud * 0.5 ? 0.95 : 0.6);
    this.lastSeen = { x: x + (Math.random() - 0.5) * 6, y: 1.2, z: z + (Math.random() - 0.5) * 6, t: this.game.time };
    if (this.state !== 'investigate') { this.state = 'investigate'; this.setDest(this.lastSeen.x, this.lastSeen.z); this.bark('heard'); }
    if (loud > 40 && d < 30) this.enterCombat();
  }
  nearMiss(from, dist) {
    if (!this.alive) return;
    this.suppress = Math.min(1, this.suppress + (dist < 1 ? 0.4 : 0.22));
    if (from) { const fp = from.isPlayer ? from.pos : from; this.lastSeen = { x: fp.x, y: (fp.y ?? 0) + 1.3, z: fp.z, t: this.game.time }; if (!this.target) this.target = from; }
    if (this.state !== 'combat') { this.enterCombat(); this.reactT = Math.max(this.reactT, 0.4); }
    if (this.suppress > 0.6) { this.bark('pinned'); if (this.cover && this.coverPhase === 'peek') { this.coverPhase = 'hide'; this.coverT = 1.2 + this.suppress * 2; } }
  }
  // ---------------------------------------------------------------- damage
  hurt(dmg, zone, from, dir) {
    if (!this.alive) return false;
    this.health -= dmg; this.flinchP += (zone === 'head' ? 0.25 : 0.14) * (this.kind === 'heavy' ? 0.4 : 1); this.flinchY += (Math.random() - 0.5) * 0.5; if (zone === 'head') this.flinchH = 0.35;
    this.stagger = 0.12;
    if (from && this.state !== 'combat') { this.enterCombat(); }
    if (from) { this.target = from; const fp = from.isPlayer ? from.pos : from; this.lastSeen = { x: fp.x, y: (fp.y ?? 0) + 1.3, z: fp.z, t: this.game.time }; this.aware = 1.2; }
    this.suppress = Math.min(1, this.suppress + 0.3);
    if (this.health <= 0) { this.die(from, dir); return true; }
    if (Math.random() < 0.3) this.bark('hurt');
    if (this.cover && this.coverPhase === 'peek' && Math.random() < 0.6) { this.coverPhase = 'hide'; this.coverT = 1 + Math.random(); }
    return false;
  }
  die(from, dir) {
    this.alive = false; this.deadT = 0.001; this.health = 0; this.state = 'dead'; this.releaseCover(); this.deaths++;
    if (dir) { const fwdx = -Math.sin(this.yaw), fwdz = -Math.cos(this.yaw); this.fallSign = (dir.x * fwdx + dir.z * fwdz) > 0 ? -1 : 1; } else this.fallSign = 1;
    this.squad?.onDeath(this);
  }
  releaseCover() { if (this.cover) { this.cover.occ = null; this.cover = null; } }
  // ---------------------------------------------------------------- navigation
  setDest(x, z, force = false) {
    if (!force && this.dest && Math.hypot(this.dest.x - x, this.dest.z - z) < 1.0 && this.path) return;
    this.dest = { x, z }; const nav = this.game.world.nav;
    if (this.kind === 'drone' || !nav) { this.path = [[x, z]]; this.pathIdx = 0; return; }
    if (nav.clearBetween(this.x, this.z, x, z)) { this.path = [[x, z]]; this.pathIdx = 0; return; }
    if (this.game.pathBudget <= 0) { this.path = null; this.repathT = 0.1; return; }
    this.game.pathBudget--;
    this.path = nav.find(this.x, this.z, x, z) || [[x, z]]; this.pathIdx = 0;
  }
  arrived(r = 0.6) { return !this.dest || Math.hypot(this.dest.x - this.x, this.dest.z - this.z) < r; }
  // ---------------------------------------------------------------- decisions (≈4 Hz)
  think() {
    const g = this.game;
    if (this.kind === 'drone') return this.thinkDrone();
    if (this.stationary) { this.state = this.aware >= 1 ? 'combat' : 'idle'; return; }
    switch (this.state) {
      case 'idle':
        if (this.roam) { const d = this.roam(this); if (d) { this.setDest(d[0], d[1]); this.state = 'roam'; } }
        break;
      case 'roam': if (this.arrived(1.2) || !this.path) { const d = this.roam?.(this); if (d) this.setDest(d[0], d[1], true); else this.state = 'idle'; } break;
      case 'patrol': if (this.patrol && this.arrived(0.8)) { this.idleT -= 0.25; if (this.idleT <= 0) { this.patrolIdx = (this.patrolIdx + 1) % this.patrol.length; const p = this.patrol[this.patrolIdx]; this.setDest(p[0], p[1]); this.idleT = 1 + Math.random() * 3; } } else if (this.patrol && !this.path) { const p = this.patrol[this.patrolIdx]; this.setDest(p[0], p[1]); } break;
      case 'investigate':
        if (this.arrived(1.5)) { this.idleT -= 0.25; if (this.idleT < -6) { this.state = this.patrol ? 'patrol' : this.roam ? 'roam' : 'idle'; this.aware = 0.3; this.idleT = 2; } }
        break;
      case 'combat': this.thinkCombat(); break;
    }
  }
  threatPos() { if (this.visible && this.target) { const t = this.target; return t.isPlayer ? { x: t.pos.x, y: t.pos.y + 1.4, z: t.pos.z } : { x: t.x, y: t.y + 1.4, z: t.z }; } return this.lastSeen; }
  thinkCombat() {
    const g = this.game, W = g.world, T = this.threatPos(); if (!T) { this.state = 'idle'; return; }
    const dist = Math.hypot(T.x - this.x, T.z - this.z);
    // lost the target for long: investigate last known
    if (!this.visible && this.lostT > 9 + this.aggro * -5) { this.state = 'investigate'; this.releaseCover(); this.setDest(T.x, T.z, true); this.idleT = 0; return; }
    // grenades: target camping behind cover
    this.nadeCd -= 0.25;
    if (this.nadeCd <= 0 && this.lastSeen && dist > 7 && dist < 30 && this.throwT <= 0 && (this.squad?.nadeCd ?? 0) <= 0 && this.kind === 'soldier') {
      const camp = this.target && this.target.isPlayer ? this.target.campT : 0;
      if ((camp > 4.5 || (!this.visible && this.lostT > 2.5)) && Math.random() < 0.6) { this.startThrow(T); return; }
    }
    const pref = this.w.id === 'shotgun' || this.w.id === 'smg' ? [4, 14] : this.w.id === 'dmr' ? [22, 50] : [10, 30];
    // aggressive bots push when the target is weak or close
    const push = this.aggro > 0.5 || (this.w.id === 'shotgun' && dist < 18) || (this.target?.isPlayer && this.target.health < 35 && Math.random() < 0.25);
    if (this.cover) {
      const cp = this.cover; const nd = cp.nx * (T.x - cp.x) + cp.nz * (T.z - cp.z);
      const compromised = nd < 0 || (this.visible && this.coverPhase === 'hide' && W.los(T.x, T.y, T.z, cp.x, cp.y + (cp.low ? 0.95 : 1.5), cp.z));
      this.coverAge = (this.coverAge || 0) + 0.25;
      if (compromised || (this.coverAge > 10 + Math.random() * 6 && !this.suppress) || (push && this.coverAge > 4)) { this.releaseCover(); }
    }
    if (!this.cover) {
      const cp = this.findCover(T, pref, push ? 'advance' : this.flanking ? 'flank' : 'normal');
      if (cp) { this.takeCover(cp); }
      else if (this.visible) { // no cover: strafe at preferred range
        const ang = Math.atan2(this.x - T.x, this.z - T.z) + (Math.random() - 0.5) * 1.2; const r = clamp(dist, pref[0], pref[1]);
        this.setDest(T.x + Math.sin(ang) * r, T.z + Math.cos(ang) * r, true);
      } else this.setDest(T.x, T.z, true);
    }
    // squad flank assignment
    if (this.squad) this.squad.maybeFlank(this, T);
  }
  findCover(T, pref, mode) {
    const g = this.game, W = g.world; let best = null, bs = -1e9; const cands = [];
    for (const cp of W.cover) {
      if (cp.occ && cp.occ !== this) continue;
      const ds = Math.hypot(cp.x - this.x, cp.z - this.z); if (ds > 30) continue;
      const tx = T.x - cp.x, tz = T.z - cp.z, dt = Math.hypot(tx, tz); if (dt < 3) continue;
      const facing = (cp.nx * tx + cp.nz * tz) / dt; if (facing < 0.35) continue;
      let flankBonus = 0;
      if (mode === 'flank' && this.squad) { const c = this.squad.center(); const a0 = Math.atan2(c.x - T.x, c.z - T.z), a1 = Math.atan2(cp.x - T.x, cp.z - T.z); flankBonus = Math.abs(wrapAngle(a1 - a0)) * 22; }
      if (mode === 'advance') flankBonus += (Math.hypot(this.x - T.x, this.z - T.z) - dt) * 2.5;
      let crowd = 0; for (const o of g.bots) if (o !== this && o.alive && o.team === this.team && Math.hypot(o.x - cp.x, o.z - cp.z) < 3) crowd++;
      const s = coverScore({ distSelf: ds, distThreat: dt, protects: true, canPeek: false, occupied: false, prefMin: pref[0], prefMax: pref[1], flankBonus, crowd });
      cands.push([s, cp]);
    }
    cands.sort((a, b) => b[0] - a[0]);
    for (let i = 0; i < Math.min(6, cands.length); i++) {
      const [s0, cp] = cands[i]; const hy = cp.y + (cp.low ? 0.95 : 1.5);
      if (W.los(T.x, T.y, T.z, cp.x, hy, cp.z)) continue; // not actually protected
      let s = s0; const ey = cp.y + 1.5;
      // can we shoot from the peek pose?
      if (cp.low ? W.los(cp.x, ey, cp.z, T.x, T.y, T.z) : (W.los(cp.x - cp.nz * 0.9, ey, cp.z + cp.nx * 0.9, T.x, T.y, T.z) || W.los(cp.x + cp.nz * 0.9, ey, cp.z - cp.nx * 0.9, T.x, T.y, T.z))) s += 22;
      if (s > bs) { bs = s; best = cp; }
    }
    return best;
  }
  takeCover(cp) { this.releaseCover(); this.cover = cp; cp.occ = this; this.coverPhase = 'move'; this.coverAge = 0; this.setDest(cp.x, cp.z, true); this.sprint = true; }
  startThrow(T) {
    this.throwT = 0.75; this.nadeTarget = { x: T.x + (Math.random() - 0.5) * 2.5, z: T.z + (Math.random() - 0.5) * 2.5 }; this.nadeCd = this.game.diff.nade * (0.8 + Math.random() * 0.5);
    if (this.squad) this.squad.nadeCd = this.game.diff.nade * 0.5; this.bark('frag', true);
  }
  thinkDrone() {
    const T = this.threatPos();
    if (this.state !== 'combat' || !T) { if (this.roam) { const d = this.roam(this); if (d) this.setDest(d[0], d[1]); } return; }
    // orbit the target at 10-16m, swap direction sometimes
    if (Math.random() < 0.08) this.orbit *= -1;
    const ang = Math.atan2(this.x - T.x, this.z - T.z) + this.orbit * 0.6; const r = 11 + Math.random() * 5;
    this.setDest(T.x + Math.sin(ang) * r, T.z + Math.cos(ang) * r, true);
  }
  // ---------------------------------------------------------------- per-frame
  update(dt) {
    const g = this.game, W = g.world;
    if (this.waiting) return;
    if (!this.alive) { this.deadT += dt; this.updateDeadDrone(dt); return; }
    this.barkCd -= dt; this.flinchP = damp(this.flinchP, 0, 9, dt); this.flinchY = damp(this.flinchY, 0, 9, dt); this.flinchH = damp(this.flinchH, 0, 8, dt); this.recoilK = damp(this.recoilK, 0, 14, dt);
    this.suppress = Math.max(0, this.suppress - dt * 0.22); this.stagger = Math.max(0, (this.stagger || 0) - dt);
    this.percT -= dt; if (this.percT <= 0) { this.percT = 0.12; this.perceive(0.12); }
    this.thinkT -= dt; if (this.thinkT <= 0) { this.thinkT = 0.25; this.think(); }
    if (this.reactT > 0) this.reactT -= dt;
    // cover cycle (hide ↔ peek)
    let wantCrouch = false, wantLean = 0, peeking = false;
    if (this.state === 'combat' && this.cover) {
      const cp = this.cover;
      if (this.coverPhase === 'move' && this.arrived(0.7)) { this.coverPhase = 'hide'; this.coverT = 0.6 + Math.random() * 0.8; this.sprint = false; }
      if (this.coverPhase === 'hide') { this.coverT -= dt; wantCrouch = cp.low; if (this.coverT <= 0 && this.suppress < 0.75) { this.coverPhase = 'peek'; this.coverT = 1.4 + Math.random() * 1.6; this.peekSide = this.pickPeekSide(cp); } }
      else if (this.coverPhase === 'peek') {
        this.coverT -= dt; peeking = true;
        if (!cp.low) { const px = cp.x - cp.nz * 0.85 * this.peekSide, pz = cp.z + cp.nx * 0.85 * this.peekSide; this.dest = { x: px, z: pz }; this.path = [[px, pz]]; this.pathIdx = 0; wantLean = this.peekSide * 0.6; }
        if (this.coverT <= 0 || this.reloadT > 0) { this.coverPhase = 'hide'; this.coverT = (1.0 + Math.random() * 1.6) * (1 + this.suppress * 1.5); if (!cp.low) { this.dest = { x: cp.x, z: cp.z }; this.path = [[cp.x, cp.z]]; this.pathIdx = 0; } }
      }
    }
    if (this.reloadT > 0) { wantCrouch = wantCrouch || (this.cover?.low ?? false); }
    this.crouch = wantCrouch; this.crouchK = damp(this.crouchK, wantCrouch ? 1 : 0, 8, dt); this.leanK = damp(this.leanK, wantLean, 7, dt);
    // grenade throw windup
    if (this.throwT > 0) { this.throwT -= dt; if (this.throwT <= 0.25 && !this.thrown) { this.thrown = true; this.throwNade(); } if (this.throwT <= 0) { this.thrown = false; this.throwT = 0; } }
    // movement
    if (this.kind === 'drone') this.moveDrone(dt); else this.move(dt);
    // aiming + firing
    this.aimAndFire(dt, peeking);
    // reload
    if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) this.mag = this.w.mag; }
  }
  pickPeekSide(cp) {
    if (cp.low) return 0; const T = this.threatPos(); if (!T) return 1; const W = this.game.world, ey = cp.y + 1.5;
    const l = W.los(cp.x - cp.nz * 0.9, ey, cp.z + cp.nx * 0.9, T.x, T.y, T.z), r = W.los(cp.x + cp.nz * 0.9, ey, cp.z - cp.nx * 0.9, T.x, T.y, T.z);
    return l && !r ? 1 : r && !l ? -1 : Math.random() < 0.5 ? 1 : -1;
  }
  move(dt) {
    const g = this.game, W = g.world; let tx = 0, tz = 0, spd = 0;
    if (this.stagger > 0 || this.throwT > 0 || this.stationary) { spd = 0; }
    else if (this.path && this.pathIdx < this.path.length) {
      const wp = this.path[this.pathIdx]; const dx = wp[0] - this.x, dz = wp[1] - this.z, d = Math.hypot(dx, dz);
      if (d < 0.45) { this.pathIdx++; } else {
        tx = dx / d; tz = dz / d;
        spd = this.state === 'combat' ? (this.coverPhase === 'move' || !this.cover ? (this.sprint ? 5.6 : 4.2) : 2.2) : this.state === 'investigate' ? 2.6 : this.state === 'roam' ? 4.0 : 1.7;
        if (this.crouch) spd *= 0.5; if (this.kind === 'heavy') spd *= 0.65; spd *= (g.speedMul ?? 1);
        if (this.pathIdx === this.path.length - 1 && d < 1.5) spd *= Math.max(0.3, d / 1.5);
      }
    } else if (this.repathT > 0) { this.repathT -= dt; if (this.repathT <= 0 && this.dest) { const d = this.dest; this.dest = null; this.setDest(d.x, d.z); } }
    // separation
    for (const o of g.bots) { if (o === this || !o.alive || o.kind === 'drone') continue; const dx = this.x - o.x, dz = this.z - o.z, d2 = dx * dx + dz * dz; if (d2 < 0.8 && d2 > 1e-4) { const d = Math.sqrt(d2); tx += dx / d * 0.6; tz += dz / d * 0.6; spd = Math.max(spd, 1); } }
    const tl = Math.hypot(tx, tz); if (tl > 1) { tx /= tl; tz /= tl; }
    this.vx = damp(this.vx, tx * spd, 8, dt); this.vz = damp(this.vz, tz * spd, 8, dt);
    const ox = this.x, oz = this.z;
    _p.x = this.x + this.vx * dt; _p.z = this.z + this.vz * dt;
    W.collide(_p, 0.34, this.y, 1.7, 0.5); this.x = _p.x; this.z = _p.z;
    const fl = W.floorAt(this.x, this.z, 0.3, this.y, 0.55);
    if (this.y > fl + 0.05) { this.vy -= 20 * dt; this.y = Math.max(fl, this.y + this.vy * dt); } else { this.y = fl; this.vy = 0; }
    const moved = Math.hypot(this.x - ox, this.z - oz); this.moveSpeed = moved / Math.max(dt, 1e-4);
    this.walkPhase += moved * (this.sprint ? 2.3 : 2.9);
    // stuck detection → repath
    if (spd > 1 && this.moveSpeed < 0.3) { this.stuckT += dt; if (this.stuckT > 1.2 && this.dest) { this.stuckT = 0; const d = this.dest; this.dest = null; this.path = null; this.setDest(d.x + (Math.random() - 0.5) * 2, d.z + (Math.random() - 0.5) * 2); } } else this.stuckT = 0;
    // footsteps audible to the player
    if (this.moveSpeed > 1.5) { this.stepAcc = (this.stepAcc || 0) + moved; if (this.stepAcc > 2.1) { this.stepAcc = 0; g.audio?.step(g.surfAt(this.x, this.z), this.sprint ? 1 : 0.6, this.x, this.y, this.z); } }
    // body yaw: face movement when not engaging, else face aim
    const engaging = this.state === 'combat' && (this.visible || this.coverPhase === 'peek');
    let face = this.yaw;
    if (engaging || this.throwT > 0) face = this.aimYaw;
    else if (this.moveSpeed > 0.5) face = Math.atan2(-this.vx, -this.vz);
    else if (this.state === 'combat' && this.lastSeen) face = Math.atan2(-(this.lastSeen.x - this.x), -(this.lastSeen.z - this.z));
    else if (this.lookAt) face = Math.atan2(-(this.lookAt.x - this.x), -(this.lookAt.z - this.z));
    else if (this.state === 'idle' || (this.state === 'patrol' && this.moveSpeed < 0.3)) { this.idleLook = (this.idleLook || 0) + dt; face = this.guardYaw + Math.sin(this.idleLook * 0.4 + this.id) * 0.9; }
    this.yaw += wrapAngle(face - this.yaw) * Math.min(1, dt * 7);
    if (!engaging) this.aimYaw = this.yaw;
  }
  moveDrone(dt) {
    const g = this.game, W = g.world; this.rotor += dt * 60;
    let tx = 0, tz = 0, spd = 0;
    if (this.path && this.pathIdx < this.path.length) { const wp = this.path[this.pathIdx]; const dx = wp[0] - this.x, dz = wp[1] - this.z, d = Math.hypot(dx, dz); if (d < 1) this.pathIdx++; else { tx = dx / d; tz = dz / d; spd = 6.5; } }
    this.vx = damp(this.vx, tx * spd, 2.5, dt); this.vz = damp(this.vz, tz * spd, 2.5, dt);
    const nx = this.x + this.vx * dt, nz = this.z + this.vz * dt;
    // altitude: hold above the highest thing below + obstacle check ahead
    const ground = W.floorAt(nx, nz, 0.5, this.y + 30, 30);
    const ahead = W.ray(this.x, this.y, this.z, this.vx, 0, this.vz, 3);
    if (ahead) this.altitude += dt * 4; else this.altitude = damp(this.altitude, 4.5, 0.3, dt);
    const ty = ground + this.altitude + Math.sin(g.time * 1.3 + this.id) * 0.3;
    this.y = damp(this.y, ty, 2.5, dt); this.x = nx; this.z = nz;
    this.tiltX = damp(this.tiltX || 0, -(this.vx * Math.sin(this.yaw) + this.vz * Math.cos(this.yaw)) * 0.04, 5, dt);
    this.tiltZ = damp(this.tiltZ || 0, (this.vx * Math.cos(this.yaw) - this.vz * Math.sin(this.yaw)) * 0.04, 5, dt);
    const face = this.state === 'combat' && this.lastSeen ? Math.atan2(-(this.lastSeen.x - this.x), -(this.lastSeen.z - this.z)) : Math.atan2(-this.vx, -this.vz);
    this.yaw += wrapAngle(face - this.yaw) * Math.min(1, dt * 3); this.aimYaw = this.yaw; this.moveSpeed = spd;
    if (this.humT === undefined || (this.humT -= dt) <= 0) { this.humT = 0.5; }
  }
  updateDeadDrone(dt) {
    if (this.kind !== 'drone' || this.y <= -50) return; const W = this.game.world;
    this.vy -= 14 * dt; this.y += this.vy * dt; this.rotor += dt * 10; this.tiltX = (this.tiltX || 0) + dt * 2;
    const fl = W.floorAt(this.x, this.z, 0.4, this.y + 1, 2);
    if (this.y <= fl + 0.15 && !this.crashed) { this.crashed = true; this.y = fl + 0.15; this.game.explode(this.x, this.y, this.z, { radius: 3.2, dmg: 40, owner: null, small: true }); }
    if (this.crashed) this.y = fl + 0.15;
  }
  aimAndFire(dt, peeking) {
    const g = this.game; const T = this.threatPos(); this.cool -= dt; this.burstGap -= dt;
    if (this.state !== 'combat' || !T || this.throwT > 0) return;
    const eye = this.eye(_v);
    const tgt = this.visible && this.target ? this.aimPoint(this.target) : T;
    const dx = tgt.x - eye.x, dy = tgt.y - eye.y, dz = tgt.z - eye.z, h = Math.hypot(dx, dz);
    const wantYaw = Math.atan2(-dx, -dz), wantPitch = Math.atan2(dy, h);
    const turn = (this.kind === 'drone' ? 3 : 6) * (1 - this.suppress * 0.4);
    this.aimYaw += wrapAngle(wantYaw - this.aimYaw) * Math.min(1, dt * turn); this.aimPitch += (wantPitch - this.aimPitch) * Math.min(1, dt * turn);
    this.headYaw = clamp(wrapAngle(this.aimYaw - this.yaw), -0.8, 0.8);
    // can shoot? needs LOS (visible), reaction elapsed, not hiding behind cover
    const hiding = this.cover && this.coverPhase !== 'peek' && this.coverPhase !== 'move';
    const canShoot = this.visible && this.reactT <= 0 && !hiding && Math.abs(wrapAngle(wantYaw - this.aimYaw)) < 0.25 && this.stagger <= 0;
    // suppressive fire at last known position while peeking (keeps pressure on the player)
    const suppressive = !this.visible && peeking && this.lastSeen && g.time - this.lastSeen.t < 3 && Math.random() < 0.5;
    if (this.reloadT > 0) return;
    if (this.mag <= 0) { this.reloadT = this.w.reload * 1.3; this.bark('reload'); return; }
    if (!(canShoot || suppressive) || this.cool > 0) return;
    if (this.burstLeft <= 0) { if (this.burstGap > 0) return; this.burstLeft = this.w.auto ? 3 + Math.floor(Math.random() * 4) : 1; }
    // sniper/marksman telegraph: glint + charge
    if (this.role === 'sniper') { this.charge += dt; this.glintT = 1; if (this.charge < 1.6) return; this.charge = 0; }
    this.fireShot(tgt, eye, suppressive);
    this.burstLeft--; this.cool = 60 / this.w.rpm * (this.w.auto ? 1.15 : 1.6 + Math.random());
    if (this.burstLeft <= 0) this.burstGap = 0.35 + Math.random() * 0.6 + (this.role === 'sniper' ? 2 : 0);
  }
  aimPoint(t) {
    if (t.isPlayer) { const p = t.pos; return { x: p.x, y: p.y + t.eye * (Math.random() < 0.15 ? 0.95 : 0.72), z: p.z }; }
    return { x: t.x, y: t.y + (t.kind === 'drone' ? 0 : 1.2 * t.scale), z: t.z };
  }
  fireShot(tgt, eye, suppressive) {
    const g = this.game, d = g.diff; this.mag--; this.recoilK = 1;
    const dist = Math.hypot(tgt.x - eye.x, tgt.z - eye.z);
    // aim error: difficulty base, worse when suppressed / target moving / just acquired; first shots "warn"
    const tm = this.target?.isPlayer ? Math.min(1.6, this.target.speedH / 4.5) : 0.4;
    const settle = clamp(1.6 - this.seeT * 0.6, 0.55, 1.6);
    let err = d.aimErr * (1 + this.suppress * 1.5) * (1 + tm * 0.6) * settle * (suppressive ? 3 : 1) * (this.kind === 'drone' ? 1.3 : 1) * (this.role === 'sniper' ? 0.25 : 1);
    if (this.target?.isPlayer && this.target.crouchK > 0.5) err *= 1.15;
    if (this.team === 'A') err *= 0.85;
    err *= DEG;
    const dx = tgt.x - eye.x, dy = tgt.y - eye.y, dz = tgt.z - eye.z, L = Math.hypot(dx, dy, dz);
    _w.set(dx / L, dy / L, dz / L);
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * Math.tan(err);
    const right = _v2.set(-_w.z, 0, _w.x).normalize(), up = _v3.crossVectors(right, _w);
    _w.addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
    const mz = this.hb?.muzzle || eye;
    g.shoot({ shooter: this, team: this.team, ox: eye.x, oy: eye.y, oz: eye.z, dir: _w, w: this.w, tierMul: (this.team === 'B' ? 1 : 1) * (this.tierDmg || 1), muzzle: mz, tracer: true, botDmgMul: this.team === 'B' || g.mode?.ffa ? d.dmg : 1 });
    g.audio?.shot(this.kind === 'drone' ? 'drone' : this.wid === 'shotgun' ? 'shotgun' : this.role === 'sniper' ? 'sniper' : 'enemy', mz.x, mz.y, false, mz.z);
    g.fx.glow(mz.x, mz.y, mz.z, this.kind === 'drone' ? 0.35 : 0.55, 0.05, 2.6, 1.7, 0.8);
    g.enemyFlash?.(mz);
    g.noise(eye.x, eye.z, 50, this);
  }
  throwNade() {
    const g = this.game, t = this.nadeTarget; if (!t) return; const e = this.eye(_v);
    const ty = g.world.floorAt(t.x, t.z, 0.2, 50, 50);
    const hd = Math.hypot(t.x - e.x, t.z - e.z), sp = clamp(Math.sqrt(20 * hd * 1.2), 11, 24);
    const v = lobVelocity(t.x - e.x, ty - e.y, t.z - e.z, sp, 20 * (g.cfg.gravity ?? 1)) || [(t.x - e.x) / hd * 15, 9, (t.z - e.z) / hd * 15];
    g.grenades.throw('frag', e.x, e.y + 0.2, e.z, v[0], v[1], v[2], this, 3.0);
  }
}

// Squad: shared knowledge, flank assignment, grenade cooldown, bark throttle.
export class Squad {
  constructor(game, team) { this.game = game; this.team = team; this.members = []; this.barkCd = 0; this.nadeCd = 4; this.flankCd = 8 + Math.random() * 6; this.flanker = null; }
  add(b) { this.members.push(b); b.squad = this; return b; }
  update(dt) { this.barkCd -= dt; this.nadeCd -= dt; this.flankCd -= dt; }
  center() { let x = 0, z = 0, n = 0; for (const m of this.members) if (m.alive) { x += m.x; z += m.z; n++; } return n ? { x: x / n, z: z / n } : { x: 0, z: 0 }; }
  alert(src, info) {
    for (const m of this.members) {
      if (m === src || !m.alive || m.state === 'combat') continue;
      if (Math.hypot(m.x - src.x, m.z - src.z) > 45) continue;
      m.lastSeen = { x: info.x, y: info.y, z: info.z, t: this.game.time }; m.target = info.h; m.aware = 1; m.enterCombat(); m.reactT = this.game.diff.reaction + 0.3 + Math.random() * 0.5;
    }
  }
  maybeFlank(b, T) {
    if (this.flankCd > 0 || this.flanker?.alive) return;
    const alive = this.members.filter((m) => m.alive && m.state === 'combat');
    if (alive.length < 2 || Math.random() > this.game.diff.flank) { this.flankCd = 6; return; }
    const pick = alive.reduce((a, m) => (m.w.id === 'smg' || m.w.id === 'shotgun' ? m : a), alive[Math.floor(Math.random() * alive.length)]);
    pick.flanking = true; pick.releaseCover(); this.flanker = pick; this.flankCd = 14 + Math.random() * 8;
    const c = this.center(); const side = ((pick.x - c.x) * (T.z - c.z) - (pick.z - c.z) * (T.x - c.x)) > 0 ? 'flankL' : 'flankR';
    pick.bark(side, true);
    const other = alive.find((m) => m !== pick); if (other) setTimeout(() => other.bark('suppress'), 900);
    setTimeout(() => { pick.flanking = false; if (this.flanker === pick) this.flanker = null; }, 12000);
  }
  onDeath(b) { const alive = this.members.find((m) => m.alive && m !== b && Math.hypot(m.x - b.x, m.z - b.z) < 30); if (alive && Math.random() < 0.7) setTimeout(() => alive.bark('down'), 500); }
}
const _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
