// Starwake — world simulation: ships + flight model, AI, combat, system building, encounters, missions + story in flight.
import { THREE, shake, flash } from '/shared/sd-kit.js';
import { SHIPS, GUNS, FACTIONS, FACTION_HOSTILE, STAR_TYPES, COMM, STORY, PEOPLE, rng, hashStr, clamp } from './data.js';
import * as S from './sim.js';
import { shipModel, stationModel, gateModel, planetModel, sunSprite, sunDirU, asteroidField, turretModel, generatorModel, mats, SHIP_LEN } from './art.js';
import { audio } from './audio.js';
import { Fn, uniform, vec3, float, mix, smoothstep, sin, time, uv, mx_fractal_noise_float, positionLocal, positionWorld, normalWorld, cameraPosition, normalize, dot, abs, pow, max } from 'three/tsl';

const V3 = THREE.Vector3;
const _a = new V3(), _b = new V3(), _c = new V3(), _d = new V3(), _e = new V3(), _f = new V3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _eul = new THREE.Euler();
const FWD = new V3(0, 0, -1), UP = new V3(0, 1, 0), RIGHT = new V3(1, 0, 0);
export const CRUISE_SPEED = 2400;

// ---------------------------------------------------------------- ship entity
let NEXT_ID = 1;
export class Ship {
  constructor(G, cls, fac, opts = {}) {
    const d = SHIPS[cls] || SHIPS.jackal;
    this.id = NEXT_ID++; this.cls = cls; this.def = d; this.fac = fac; this.isPlayer = !!opts.player; this.team = opts.team || fac;
    this.name = opts.name || (FACTIONS[fac] ? `${FACTIONS[fac].short} ${d.name}` : d.name);
    this.model = opts.model || shipModel(cls, opts.palette || (this.isPlayer ? 'player' : fac));
    G.scene.add(this.model);
    this.pos = this.model.position; this.quat = this.model.quaternion; this.vel = new V3(); this.ang = new V3();
    const lvl = opts.lvl || 1, dm = 1 + (lvl - 1) * 0.16;
    const st = opts.stats || { hull: d.hull * dm, shield: d.shield * dm, regen: 10 * dm, speed: d.speed * (1 + (lvl - 1) * 0.03), boost: d.boost, turn: d.turn, accel: d.accel, guns: d.guns, gun: GUNS[opts.gun || (fac === 'concord' ? 'driver' : fac === 'wake' ? 'ion' : 'pulse')], dmgMult: G.diff.enemyDmg * (1 + (lvl - 1) * 0.12), missilesMax: d.missiles, radius: d.radius };
    this.st = st; this.hullMax = st.hull; this.hull = opts.hull ?? st.hull; this.shieldMax = st.shield; this.shF = st.shield; this.shB = st.shield;
    this.radius = opts.radius || d.radius; this.alive = true; this.throttle = opts.throttle ?? 0.6; this.in = { pitch: 0, yaw: 0, roll: 0, sx: 0, sy: 0, boost: false, fire: false };
    this.fuel = 1; this.heat = 0; this.overheat = false; this.energy = 100; this.gunCd = Math.random() * 0.5; this.missiles = opts.missiles ?? st.missilesMax; this.missileCd = 3 + Math.random() * 4;
    this.lastHit = -99; this.hitBy = null; this.target = null; this.lock = 0; this.locked = false; this.boosting = false; this.cruise = 0;
    this.ai = opts.ai ? Object.assign({ state: 'attack', t: 0, think: 0, skill: clamp(0.35 + lvl * 0.12, 0, 1) }, opts.ai) : null;
    this.tag = opts.tag || null; this.bounty = opts.bounty || 0; this.loot = opts.loot ?? (fac === 'veil' ? 0.55 : 0.3); this.aggro = false; this.invuln = !!opts.invuln;
    this.parent = opts.parent || null; this.offset = opts.offset || null; this.sub = opts.sub || null; this.colliders = opts.colliders || null;
    this.flicker = Math.random() * 10; this.smokeT = 0; this.label = opts.label || null; this.ally = !!opts.ally;
  }
  get fwd() { return _f.copy(FWD).applyQuaternion(this.quat); }
  hullFrac() { return this.hull / this.hullMax; }
  remove(G) { this.alive = false; G.scene.remove(this.model); }
}
export function spawnShip(G, cls, fac, pos, opts = {}) {
  const s = new Ship(G, cls, fac, opts); s.pos.copy(pos);
  if (opts.look) { _m.lookAt(pos, opts.look, UP); s.quat.setFromRotationMatrix(_m); }
  if (opts.vel) s.vel.copy(opts.vel); else s.vel.copy(FWD).applyQuaternion(s.quat).multiplyScalar(s.st.speed * s.throttle);
  G.ships.push(s); return s;
}

// ---------------------------------------------------------------- relations
export function hostile(G, a, b) {
  if (!a || !b || a === b || a.team === b.team) return false;
  const pa = a.isPlayer || a.team === 'player', pb = b.isPlayer || b.team === 'player';
  if (pa && pb) return false;
  if (pa) return b.aggro || S.hostileToPlayer(G.P, b.fac);
  if (pb) return a.aggro || S.hostileToPlayer(G.P, a.fac);
  return (FACTION_HOSTILE[a.fac] || []).includes(b.fac);
}
export function relation(G, s) { // for HUD colours: hostile / friendly / neutral
  if (s.ally || s.team === 'player') return 'ally';
  if (hostile(G, G.player, s)) return 'hostile';
  return s.tag === 'escort' ? 'ally' : 'neutral';
}
function findTarget(G, s, range) {
  let best = null, bd = range * range;
  for (const o of G.ships) { if (!o.alive || o === s || o.sub === 'gen' && o.invuln || !hostile(G, s, o)) continue; const d = o.pos.distanceToSquared(s.pos) * (o.isPlayer ? 0.7 : 1); if (d < bd) { bd = d; best = o; } }
  return best;
}

// ---------------------------------------------------------------- flight model (shared by player + NPCs)
export function flyShip(G, s, dt) {
  s.gunCd -= dt; s.missileCd -= dt;
  if (s.parent) { // subsystem riding a capital ship
    if (!s.parent.alive) { s.alive = false; return; }
    s.pos.copy(s.offset).applyQuaternion(s.parent.quat).add(s.parent.pos); s.quat.copy(s.parent.quat); s.vel.copy(s.parent.vel); return;
  }
  const st = s.st, I = s.in;
  const cruising = s.cruise >= 1;
  const canBoost = I.boost && s.fuel > 0.02 && !s.overheat && !cruising;
  s.boosting = canBoost;
  const tr = st.turn * (canBoost ? 0.8 : 1) * (cruising ? 0.35 : 1);
  _a.set(clamp(I.pitch, -1, 1) * tr, clamp(I.yaw, -1, 1) * tr, clamp(I.roll, -1, 1) * tr * 1.5);
  const k = 1 - Math.exp(-7 * dt); s.ang.lerp(_a, k);
  _q.setFromEuler(_eul.set(s.ang.x * dt, s.ang.y * dt, s.ang.z * dt)); s.quat.multiply(_q).normalize();
  const f = _b.copy(FWD).applyQuaternion(s.quat), r = _c.copy(RIGHT).applyQuaternion(s.quat), u = _d.copy(UP).applyQuaternion(s.quat);
  let speed = cruising ? CRUISE_SPEED : canBoost ? st.boost : st.speed * clamp(s.throttle, 0, 1);
  const strafe = st.speed * 0.35;
  _e.copy(f).multiplyScalar(speed).addScaledVector(r, I.sx * strafe).addScaledVector(u, I.sy * strafe);
  const resp = cruising ? 1.2 : canBoost ? 2.4 : (st.accel / st.speed) * 1.6;
  s.vel.lerp(_e, 1 - Math.exp(-resp * dt));
  s.pos.addScaledVector(s.vel, dt);
  if (canBoost) { s.fuel = Math.max(0, s.fuel - dt * 0.2); s.heat = Math.min(1, s.heat + dt * 0.22); if (s.heat >= 1) { s.overheat = true; if (s.isPlayer) { G.ui.warn('ENGINES OVERHEATED'); audio.warn(); } } }
  else { s.fuel = Math.min(1, s.fuel + dt * 0.08); s.heat = Math.max(0, s.heat - dt * 0.18); if (s.overheat && s.heat < 0.35) s.overheat = false; }
  s.energy = Math.min(100, s.energy + dt * 32);
  // shields regenerate after 3 s without hits
  if (G.time - s.lastHit > 3 && s.shieldMax > 0) { const g = st.regen * (s.isPlayer ? G.diff.regen : 1) * dt; s.shF = Math.min(s.shieldMax, s.shF + g); s.shB = Math.min(s.shieldMax, s.shB + g); }
  if (s.model.userData.spin) s.model.userData.spin.rotation.z += dt * 2;
}
// steering helper: returns inputs to point the nose at world direction dir
export function steer(s, dir, gain = 2.4) {
  _a.copy(dir).applyQuaternion(_q2.copy(s.quat).invert());
  const yaw = -Math.atan2(_a.x, -_a.z), pitch = Math.atan2(_a.y, Math.hypot(_a.x, _a.z));
  s.in.yaw = clamp(yaw * gain, -1, 1); s.in.pitch = clamp(pitch * gain, -1, 1);
  s.in.roll = clamp(s.in.yaw * 0.55, -1, 1);
  return Math.acos(clamp(-_a.z / (_a.length() || 1), -1, 1));
}
export function leadPoint(out, shooter, target, speed) {
  _a.copy(target.pos).sub(shooter.pos); _b.copy(target.vel).sub(shooter.vel);
  const a = _b.dot(_b) - speed * speed, b = 2 * _a.dot(_b), c = _a.dot(_a);
  let t = 0; const disc = b * b - 4 * a * c;
  if (Math.abs(a) < 1e-6) t = -c / (b || 1); else if (disc >= 0) { const s1 = (-b - Math.sqrt(disc)) / (2 * a), s2 = (-b + Math.sqrt(disc)) / (2 * a); t = Math.min(s1, s2) > 0 ? Math.min(s1, s2) : Math.max(s1, s2); }
  t = clamp(t, 0, 4);
  return out.copy(target.pos).addScaledVector(_b, t);
}

// ---------------------------------------------------------------- AI
const _lead = new V3(), _to = new V3(), _av = new V3();
function avoid(G, s, desired) {
  // look ahead along velocity; steer away from stations, rocks, planets, capital hulls
  const ahead = _av.copy(s.vel).multiplyScalar(2.2).add(s.pos); let push = null, worst = 0;
  const test = (c, r) => { const d = ahead.distanceTo(c); const m = r + s.radius + 40 - d; if (m > worst) { worst = m; push = _e.copy(ahead).sub(c).normalize(); } };
  for (const st of G.stations) if (st.pos.distanceToSquared(s.pos) < 1200 * 1200) for (const c of st.colliders) test(c.w, c.r);
  if (G.field && G.field.center.distanceToSquared(s.pos) < (G.field.radius + 400) ** 2) for (const r of G.field.rocks) if (r.alive && r.p.distanceToSquared(s.pos) < 90000) test(r.wp, r.r);
  for (const o of G.ships) if (o !== s && o.alive && o.radius > 25 && !o.parent && o.pos.distanceToSquared(s.pos) < (o.radius * 3) ** 2) test(o.pos, o.radius);
  if (push) return desired.lerp(push, clamp(worst / 80, 0.3, 0.95)).normalize();
  return desired;
}
export function aiUpdate(G, s, dt) {
  const ai = s.ai; ai.t += dt; ai.think -= dt;
  const I = s.in; I.fire = false; I.boost = false; I.sx = I.sy = 0;
  if (s.parent) { // turret / generator: fire at hostiles in range, no orientation
    if (s.sub !== 'turret') return;
    if (ai.think <= 0) { ai.think = 0.6; s.target = findTarget(G, s, 1700); }
    const T = s.target; if (!T || !T.alive) return;
    if (s.gunCd <= 0 && T.pos.distanceTo(s.pos) < 1600) { leadPoint(_lead, s, T, s.st.gun.speed); fireGuns(G, s, _to.copy(_lead).sub(s.pos).normalize(), 0.03 * (1.2 - G.diff.enemyAcc)); s.gunCd = 0.9 + Math.random() * 0.6; }
    return;
  }
  if (ai.think <= 0) {
    ai.think = 0.7 + Math.random() * 0.6;
    if (!s.target || !s.target.alive || s.target.pos.distanceToSquared(s.pos) > 5000 * 5000 || !hostile(G, s, s.target)) s.target = ai.role === 'trader' ? null : findTarget(G, s, ai.state === 'travel' ? 1400 : 3200);
    if (ai.role === 'trader' && s.hitBy && s.hitBy.alive && G.time - s.lastHit < 6) ai.fleeFrom = s.hitBy;
  }
  const T = s.target;
  let desired = null; let thr = 0.7;
  if (ai.role === 'trader' || ai.role === 'escort') { // never dogfights; turrets cover it
    if (ai.dest) {
      _to.copy(ai.dest).sub(s.pos); const d = _to.length(); desired = _to.normalize(); thr = ai.role === 'escort' ? 0.85 : 0.75;
      if (d < (ai.arrive || 300)) { ai.onArrive?.(s); ai.dest = null; }
    } else thr = 0.2;
    const tgt = findTarget(G, s, 1300);
    if (tgt && s.gunCd <= 0 && s.st.guns > 0) { leadPoint(_lead, s, tgt, s.st.gun.speed); fireGuns(G, s, _to.copy(_lead).sub(s.pos).normalize(), 0.05); s.gunCd = 1.4; }
    if (ai.fleeFrom && ai.role === 'trader' && G.time - s.lastHit < 6) { I.boost = s.fuel > 0.3; }
  } else if (ai.state === 'formation' && ai.leader && ai.leader.alive) {
    const L = ai.leader; _to.copy(ai.offset).applyQuaternion(L.quat).add(L.pos).addScaledVector(L.vel, 0.6).sub(s.pos);
    const d = _to.length(); desired = d > 30 ? _to.normalize() : _b.copy(FWD).applyQuaternion(L.quat);
    thr = clamp(L.vel.length() / s.st.speed + d / 400, 0.2, 1); I.boost = d > 600;
    if (T && (L.ai?.state === 'attack' || G.time - s.lastHit < 2 || T.pos.distanceTo(s.pos) < 900)) ai.state = 'attack';
  } else if (ai.state === 'patrol' || (ai.state === 'formation')) {
    if (!ai.dest || s.pos.distanceTo(ai.dest) < 300) ai.dest = new V3((Math.random() - 0.5) * 9000, (Math.random() - 0.5) * 1500, (Math.random() - 0.5) * 9000);
    desired = _to.copy(ai.dest).sub(s.pos).normalize(); thr = 0.55;
    if (T) ai.state = 'attack';
    if (ai.leader && !ai.leader.alive) ai.leader = null;
  } else if (ai.state === 'attack') {
    if (!T) { ai.state = ai.leader && ai.leader.alive ? 'formation' : 'patrol'; }
    else {
      leadPoint(_lead, s, T, s.st.gun.speed);
      _to.copy(_lead).sub(s.pos); const dist = T.pos.distanceTo(s.pos);
      desired = _to.normalize();
      // weave a little on approach so attack runs aren't laser-straight
      if (dist > 500) desired.addScaledVector(_b.copy(RIGHT).applyQuaternion(s.quat), Math.sin(ai.t * 1.3 + s.id) * 0.12).normalize();
      thr = dist > 1300 ? 1 : dist < 380 ? 0.4 : 0.85; I.boost = dist > 2400 && s.fuel > 0.4;
      const ang = s.fwd.angleTo(_to.copy(_lead).sub(s.pos));
      const cone = 0.05 + (1 - ai.skill) * 0.08 + T.radius / Math.max(dist, 1);
      if (ang < cone && dist < s.st.gun.range) I.fire = true;
      if (dist < 140 + T.radius * 2.5 || (G.time - s.lastHit < 0.4 && Math.random() < dt * 3 * ai.skill)) { ai.state = 'break'; ai.t = 0; ai.breakT = 1.4 + Math.random() * 1.6; ai.breakDir = new V3().copy(s.pos).sub(T.pos).normalize().add(new V3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(1.6)).normalize(); }
      if (s.missiles > 0 && s.missileCd <= 0 && dist < 1800 && ang < 0.25) { fireMissile(G, s, T); s.missileCd = 10 + Math.random() * 8; }
      if (s.hullFrac() < 0.22 && ai.canFlee !== false && Math.random() < dt * 0.6) { ai.state = 'flee'; ai.t = 0; if (s.fac === 'veil' && Math.random() < 0.5) G.ui.comms(PEOPLE.pirate, pick(['I\'m out! I\'m out!', 'Not worth it. Breaking off!', 'You\'ll keep, freelancer.']), 2.5, s); }
    }
  } else if (ai.state === 'break') {
    desired = ai.breakDir.clone().addScaledVector(_b.set(Math.sin(ai.t * 4), Math.cos(ai.t * 3.3), 0).applyQuaternion(s.quat), 0.35).normalize();
    thr = 1; I.boost = s.fuel > 0.25; if (ai.t > ai.breakT) { ai.state = 'attack'; ai.t = 0; }
  } else if (ai.state === 'flee') {
    const from = T || G.player; desired = _to.copy(s.pos).sub(from.pos).normalize(); thr = 1; I.boost = s.fuel > 0.05;
    if (from.pos.distanceTo(s.pos) > 4200) { s.escaped = true; s.alive = false; G.scene.remove(s.model); }
  } else if (ai.state === 'idle') { thr = 0; }
  if (desired) { desired = avoid(G, s, desired.clone()); steer(s, desired, 1.6 + ai.skill * 1.2); }
  else { I.pitch = I.yaw = I.roll = 0; }
  s.throttle = thr;
  if (I.fire && s.gunCd <= 0) { fireGuns(G, s, null, (1 - G.diff.enemyAcc * (0.6 + ai.skill * 0.4)) * 0.05 + 0.004); s.gunCd = 1 / (s.st.gun.rof * 0.45); }
}
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// ---------------------------------------------------------------- weapons
const _mz = new V3(), _dir = new V3(), _conv = new V3(), _bv = new V3();
export function fireGuns(G, s, aimDir = null, spread = 0) {
  const gun = s.st.gun; const cost = gun.energy * s.st.guns * (s.isPlayer ? 1 : 0);
  if (s.isPlayer && s.energy < cost) return false;
  s.energy -= cost;
  const guns = s.model.userData.guns?.length ? s.model.userData.guns : [new V3(0, 0, -s.radius)];
  const f = _f.copy(FWD).applyQuaternion(s.quat);
  // convergence at target distance (or 700 m)
  const conv = s.target && s.target.alive ? clamp(s.target.pos.distanceTo(s.pos), 120, 1500) : 700;
  _conv.copy(s.pos).addScaledVector(aimDir || f, conv);
  const n = s.parent ? 1 : guns.length;
  for (let i = 0; i < n; i++) {
    const hp = s.parent ? _mz.set(0, 0, 0) : guns[i];
    _mz.copy(hp).applyQuaternion(s.quat).add(s.pos);
    _dir.copy(_conv).sub(_mz).normalize();
    if (spread) _dir.add(_bv.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(spread * 2)).normalize();
    _bv.copy(_dir).multiplyScalar(gun.speed).add(s.vel);
    G.fx.bolts.spawn({ p: _mz, v: _bv, life: gun.range / gun.speed, dmg: gun.dmg * s.st.dmgMult, owner: s, team: s.team, gun, color: s.isPlayer || s.team === 'player' ? gun.color : s.fac === 'veil' ? '#ff4a3a' : s.fac === 'wake' ? '#6ff7e8' : s.fac === 'concord' ? '#7ab8ff' : '#ffd070', len: gun.id === 'driver' ? 7 : 16, w: gun.id === 'driver' ? 1.6 : 1.0, hdr: s.isPlayer ? 5 : 4 });
    G.muzzle.push({ p: _mz.clone(), t: 0.05, col: gun.color, s: s.isPlayer ? 2.2 : 3.5 });
  }
  if (s.isPlayer) audio.laser(gun.id); else if (s.pos.distanceToSquared(G.player.pos) < 1500 * 1500) audio.laser(gun.id, 0, 0.35);
  return true;
}
export function fireMissile(G, s, target) {
  if (s.missiles <= 0) return false;
  s.missiles--;
  const m = G.missilePool.pop() || makeMissileMesh(G);
  m.visible = true; G.scene.add(m);
  const p = _mz.set(0, -1.2, -s.radius * 0.6).applyQuaternion(s.quat).add(s.pos);
  m.position.copy(p); m.quaternion.copy(s.quat);
  G.missiles.push({ mesh: m, p: m.position, v: s.vel.clone().addScaledVector(s.fwd, 60), target: s.locked || !s.isPlayer ? target : null, owner: s, team: s.team, life: 9, speed: 250 });
  audio.missile();
  if (target?.isPlayer) { G.ui.warn('MISSILE INBOUND — BREAK HARD'); audio.warn(); }
  return true;
}
function makeMissileMesh(G) {
  const g = new THREE.Group(); const M = mats('station');
  const body = new THREE.Mesh(G.geo.missile ||= new THREE.CylinderGeometry(0.35, 0.35, 3.2, 8).rotateX(Math.PI / 2), M.hull); g.add(body);
  return g;
}

// ---------------------------------------------------------------- damage, death, loot
const _hl = new V3(), _hp = new V3();
export function damage(G, s, dmg, hitPoint, gun, attacker) {
  hitPoint = _hp.copy(hitPoint);
  if (!s.alive || s.invuln) { if (s.invuln && attacker?.isPlayer && G.time - (s._invMsg || -9) > 4) { s._invMsg = G.time; G.ui.toast(s.sub === 'core' ? 'Core shielded: destroy the generators first' : 'Hull shielded: target the subsystems'); } return; }
  const vsS = gun?.vsShield ?? 1, vsH = gun?.vsHull ?? 1;
  const front = _hl.copy(hitPoint).sub(s.pos).applyQuaternion(_q.copy(s.quat).invert()).z < 0;
  const key = front ? 'shF' : 'shB';
  let shieldDmg = dmg * vsS;
  if (s[key] > 0) {
    const absorbed = Math.min(s[key], shieldDmg); s[key] -= absorbed; shieldDmg -= absorbed;
    G.fx.shields.hit(s, front);
    if (s.isPlayer) audio.hitShield();
  }
  const hullDmg = (shieldDmg / vsS) * vsH;
  if (hullDmg > 0) {
    s.hull -= hullDmg;
    G.fx.parts.burst(hitPoint, 6, 60, 0.4, 1.2, 0.2, { r: 2.5, g: 1.4, b: 0.5 }, s.vel, 2);
    if (s.isPlayer) { audio.hitHull(); shake(0.35); G.ui.hullHit(); }
  }
  s.lastHit = G.time; s.hitBy = attacker;
  if (s.isPlayer && attacker) G.ui.hitFrom(attacker.pos);
  if (attacker?.isPlayer && !s.isPlayer) {
    G.ui.hitMarker(); audio.hitConfirm();
    if (!hostile(G, G.player, s) && !s.aggro) { // attacking neutrals is piracy
      s.aggro = true; for (const o of G.ships) if (o.alive && o.fac === s.fac && o.pos.distanceTo(s.pos) < 3000) o.aggro = true;
      S.addRep(G.P, { [s.fac]: -6, ...(s.fac !== 'veil' ? { veil: 2 } : {}) });
      G.ui.toast(`${FACTIONS[s.fac]?.short || 'They'} won't forget that (rep -6)`);
      if (s.ai) { s.ai.state = s.ai.role === 'trader' ? s.ai.state : 'attack'; s.target = G.player; }
    }
    if (s.ai && s.ai.role !== 'trader' && s.ai.role !== 'escort' && (!s.target || !s.target.isPlayer) && Math.random() < 0.5) s.target = G.player;
  }
  if (s.hull <= 0) destroy(G, s, attacker);
}
export function explosionFX(G, p, size, vel = null, big = false) {
  const P = G.fx.parts; const k = size;
  P.burst(p, big ? 60 : 26, 40 * k, 0.9, 6 * k, 14 * k, { r: 3.2, g: 1.5, b: 0.45 }, vel, 2.5);
  P.burst(p, big ? 40 : 18, 120 * k, 0.6, 1.2 * k, 0.3, { r: 3, g: 2.4, b: 1.4 }, vel, 1.2);
  P.burst(p, 10, 15 * k, 1.8, 8 * k, 20 * k, { r: 0.35, g: 0.22, b: 0.16 }, vel, 1.5);
  P.spawn(p.x, p.y, p.z, 0, 0, 0, 0.35, 4 * k, 40 * k, 2.5, 2.2, 2.0, 0);
  G.fx.lights.flash(p, '#ffb070', big ? 3e6 : 6e5 * k, big ? 1.4 : 0.6);
  const dist = p.distanceTo(G.camera.position);
  audio.boom(dist, big);
  if (dist < 900) shake(Math.min(0.9, (big ? 2 : 0.6) * (1 - dist / 900)));
  for (let i = 0; i < (big ? 26 : 8 + k * 3); i++) G.fx.debris.spawn(p, _b.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(90 * k).add(vel || _c.set(0, 0, 0)), (0.5 + Math.random() * 1.2) * k, 3 + Math.random() * 4);
}
export function destroy(G, s, attacker) {
  if (!s.alive) return; s.alive = false; s.hull = 0;
  const sz = clamp(s.radius / 8, 0.8, 6);
  explosionFX(G, s.pos, sz, s.vel, s.cls === 'capital');
  G.scene.remove(s.model);
  if (s.isPlayer) { G.onPlayerDeath(); return; }
  if (attacker?.isPlayer || attacker?.team === 'player') {
    G.P.kills++;
    if (attacker.isPlayer) { G.hitstop = 0.07; flash('rgba(255,200,120,.35)', 140); }
    if (s.bounty) { G.P.credits += s.bounty; G.P.earned += s.bounty; G.ui.toast(`Bounty paid: +${s.bounty.toLocaleString()} cr`); audio.cash(); }
    if (s.fac === 'veil') S.addRep(G.P, { concord: 1, hollows: 1, veil: -1 });
    else if (s.fac === 'concord') S.addRep(G.P, { concord: -4, veil: 3 });
    else if (s.fac === 'hollows') S.addRep(G.P, { hollows: -4, veil: 2 });
  }
  if (Math.random() < s.loot && !s.parent && s.cls !== 'capital') {
    const choices = s.fac === 'veil' ? ['spirits', 'electronics', 'luxury', 'medical'] : s.cls === 'barge' || s.cls === 'ox' ? ['machinery', 'food', 'alloys', 'electronics', 'medical'] : s.fac === 'wake' ? ['relics'] : ['alloys', 'electronics'];
    spawnPod(G, s.pos, s.vel, pick(choices), s.fac === 'wake' ? 1 : 2 + Math.floor(Math.random() * 4));
  }
  G.onShipDestroyed?.(s, attacker);
}
export function spawnPod(G, p, v, cid, n, special = null) {
  let m = G.podPool.pop();
  if (!m) { const M = mats('hollows'); m = new THREE.Group(); m.add(new THREE.Mesh(G.geo.pod ||= new THREE.BoxGeometry(2.4, 2.4, 3.2), M.trim)); m.add(new THREE.Mesh(G.geo.podBand ||= new THREE.BoxGeometry(2.6, 0.4, 3.4), M.glow)); }
  G.scene.add(m); m.position.copy(p);
  G.pods.push({ mesh: m, p: m.position, v: (v ? v.clone().multiplyScalar(0.3) : new V3()).add(new V3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(20)), cid, n, special, life: 140, spin: new V3(Math.random(), Math.random(), Math.random()) });
}

// ---------------------------------------------------------------- per-frame combat: bolts, missiles, pods, collisions
const _seg = new V3(), _rel = new V3();
function segSphere(p0, p1, c, r) { // does segment p0->p1 pass within r of c? returns t or -1
  _seg.copy(p1).sub(p0); _rel.copy(c).sub(p0); const L2 = _seg.lengthSq(); const t = L2 > 0 ? clamp(_rel.dot(_seg) / L2, 0, 1) : 0;
  _a.copy(p0).addScaledVector(_seg, t); return _a.distanceToSquared(c) < r * r ? t : -1;
}
export function combatUpdate(G, dt) {
  const B = G.fx.bolts;
  for (const b of B.list) {
    b.prev.copy(b.p); b.p.addScaledVector(b.v, dt); b.life -= dt;
    if (b.life <= 0) { b.dead = true; continue; }
    for (const s of G.ships) {
      if (!s.alive || s.colliders || s === b.owner || s.team === b.team || (s.parent && s.parent === b.owner)) continue;
      if (b.owner && !b.owner.isPlayer && b.owner.team !== 'player' && !s.isPlayer && s.team !== 'player' && !hostile(G, b.owner, s)) continue; // NPC friendly fire off
      const r = s.radius * (s.isPlayer ? 0.8 : 1.15);
      if (Math.abs(s.pos.x - b.p.x) > r + 60 || Math.abs(s.pos.z - b.p.z) > r + 60) continue;
      if (segSphere(b.prev, b.p, s.pos, r) >= 0) {
        b.dead = true; damage(G, s, b.dmg, _a, b.gun, b.owner);
        G.fx.parts.burst(b.p, 5, 50, 0.25, 1.4, 0.2, { r: b.col.r * 0.5, g: b.col.g * 0.5, b: b.col.b * 0.5 }, s.vel, 3); break;
      }
    }
    if (!b.dead) for (const s of G.ships) { // capital hulls: absorb bolts on collider spheres
      if (!s.alive || !s.colliders || s.team === b.team || s.pos.distanceToSquared(b.p) > 250 * 250) continue;
      for (const c of s.colliders) { _b.copy(c.p).applyQuaternion(s.quat).add(s.pos); if (segSphere(b.prev, b.p, _b, c.r) >= 0) { b.dead = true; G.fx.parts.burst(b.p, 4, 40, 0.25, 1.6, 0.2, { r: 1.5, g: 1.2, b: 0.8 }, null, 3); if (!s.invuln) damage(G, s, b.dmg, _a, b.gun, b.owner); else if (b.owner?.isPlayer) damage(G, s, 0, _a, b.gun, b.owner); break; } }
      if (b.dead) break;
    }
    if (!b.dead && G.field && b.p.distanceToSquared(G.field.center) < (G.field.radius + 150) ** 2) {
      for (const rk of G.field.rocks) if (rk.alive && Math.abs(rk.wp.x - b.p.x) < rk.r + 30 && segSphere(b.prev, b.p, rk.wp, rk.r) >= 0) {
        b.dead = true; G.fx.parts.burst(b.p, 5, 40, 0.4, 2, 0.4, { r: 1.0, g: 0.8, b: 0.6 }, null, 2);
        if (b.owner?.isPlayer) { rk.hp -= b.dmg; if (rk.hp <= 0) breakRock(G, rk); }
        break;
      }
    }
    if (!b.dead) for (const st of G.stations) { if (st.pos.distanceToSquared(b.p) > 800 * 800) continue; for (const c of st.colliders) if (c.w.distanceToSquared(b.p) < c.r * c.r) { b.dead = true; G.fx.parts.burst(b.p, 3, 30, 0.3, 1.5, 0.3, { r: 1, g: 0.9, b: 0.7 }, null, 2); break; } if (b.dead) break; }
  }
  B.sweep(); B.render();
  // missiles
  for (let i = G.missiles.length - 1; i >= 0; i--) {
    const m = G.missiles[i]; m.life -= dt; m.speed = Math.min(560, m.speed + dt * 260);
    const T = m.target;
    if (T && T.alive) {
      leadPoint(_lead, { pos: m.p, vel: _c.set(0, 0, 0) }, T, m.speed);
      _to.copy(_lead).sub(m.p).normalize(); _b.copy(m.v).normalize();
      const ang = _b.angleTo(_to); const maxT = 1.55 * dt;
      if (ang > 1e-4) { _d.crossVectors(_b, _to).normalize(); _b.applyAxisAngle(_d, Math.min(ang, maxT)); }
      m.v.copy(_b).multiplyScalar(m.speed);
    } else m.v.setLength(m.speed);
    m.p.addScaledVector(m.v, dt); m.mesh.quaternion.setFromUnitVectors(FWD, _b.copy(m.v).normalize());
    if (Math.random() < 0.9) G.fx.parts.spawn(m.p.x, m.p.y, m.p.z, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, 0.9, 1.2, 4.5, 0.5, 0.45, 0.42, 0.5);
    G.muzzle.push({ p: m.p.clone(), t: 0.02, col: '#ffcf8a', s: 3.5 });
    let hit = null;
    for (const s of G.ships) if (s.alive && s.team !== m.team && s !== m.owner && s.pos.distanceTo(m.p) < s.radius + 10) { hit = s; break; }
    if (hit || m.life <= 0) {
      explosionFX(G, m.p, 1.1, null);
      if (hit) damage(G, hit, 125 * (m.owner.isPlayer ? 1 : G.diff.enemyDmg), m.p.clone(), { vsShield: 1, vsHull: 1.2 }, m.owner);
      G.scene.remove(m.mesh); G.missilePool.push(m.mesh); G.missiles.splice(i, 1);
    }
  }
  // cargo pods
  const P = G.player;
  for (let i = G.pods.length - 1; i >= 0; i--) {
    const pod = G.pods[i]; pod.life -= dt; pod.v.multiplyScalar(Math.exp(-0.3 * dt));
    const d = P.alive ? pod.p.distanceTo(P.pos) : 1e9;
    if (d < 160 && G.state === 'flight') pod.v.lerp(_a.copy(P.pos).sub(pod.p).normalize().multiplyScalar(120), 1 - Math.exp(-3 * dt));
    pod.p.addScaledVector(pod.v, dt); pod.mesh.rotation.x += pod.spin.x * dt; pod.mesh.rotation.y += pod.spin.y * dt;
    G.fx.glows.add(pod.p, 5 + Math.sin(G.time * 6) * 2, 2.4, 1.6, 0.6);
    if (d < P.radius + 12 && G.state === 'flight') {
      if (pod.special) { G.onSpecialPod?.(pod); G.ui.toast(`Recovered: ${pod.special}`); audio.scoop(); G.scene.remove(pod.mesh); G.podPool.push(pod.mesh); G.pods.splice(i, 1); continue; }
      const free = S.cargoFree(G.P);
      if (free <= 0) { if (G.time - (G._fullMsg || -9) > 4) { G._fullMsg = G.time; G.ui.toast('Cargo hold full'); } continue; }
      const k = Math.min(free, pod.n); G.P.cargo[pod.cid] = (G.P.cargo[pod.cid] || 0) + k; pod.n -= k;
      G.ui.toast(`Scooped ${k} × ${COMM[pod.cid].name}`); audio.scoop();
      if (pod.n <= 0) { G.scene.remove(pod.mesh); G.podPool.push(pod.mesh); G.pods.splice(i, 1); }
    } else if (pod.life <= 0) { G.scene.remove(pod.mesh); G.podPool.push(pod.mesh); G.pods.splice(i, 1); }
  }
  // ship collisions (player vs world; NPC push-out)
  for (const s of G.ships) {
    if (!s.alive || s.parent || (s.colliders && !s.isPlayer) || (s.isPlayer && (G.seq || G.state !== 'flight'))) continue;
    for (const st of G.stations) {
      if (st.pos.distanceToSquared(s.pos) > 900 * 900) continue;
      for (const c of st.colliders) bump(G, s, c.w, c.r, null);
    }
    if (G.field && G.field.center.distanceToSquared(s.pos) < (G.field.radius + 200) ** 2) for (const rk of G.field.rocks) if (rk.alive && Math.abs(rk.wp.x - s.pos.x) < rk.r + 40) bump(G, s, rk.wp, rk.r, null);
    for (const pl of G.planets) { const d = s.pos.distanceTo(pl.pos); if (d < pl.radius + 300) { s.pos.copy(pl.pos).add(_a.copy(s.pos).sub(pl.pos).setLength(pl.radius + 300)); s.vel.multiplyScalar(0.5); if (s.isPlayer && G.time - (G._atmo || -9) > 3) { G._atmo = G.time; G.ui.warn('ATMOSPHERE: PULL UP'); } } }
    for (const o of G.ships) {
      if (o === s || !o.alive || o.id < s.id || o.parent) continue;
      if (o.colliders || s.colliders) { if (o.colliders && s.colliders) continue; const cap = o.colliders ? o : s, sh = o.colliders ? s : o; if (cap.pos.distanceToSquared(sh.pos) > 300 * 300) continue; for (const c of cap.colliders) { _b.copy(c.p).applyQuaternion(cap.quat).add(cap.pos); bump(G, sh, _b, c.r, cap); } continue; }
      const rr = s.radius + o.radius; if (s.pos.distanceToSquared(o.pos) < rr * rr) bump(G, s, o.pos, o.radius, o);
    }
  }
}
function bump(G, s, c, r, other) {
  const rr = r + s.radius * 0.8; const d2 = s.pos.distanceToSquared(c); if (d2 > rr * rr) return;
  const n = _e.copy(s.pos).sub(c); const d = n.length() || 1; n.divideScalar(d);
  s.pos.addScaledVector(n, rr - d);
  const vn = s.vel.dot(n);
  if (vn < 0) {
    s.vel.addScaledVector(n, -vn * 1.6);
    const impact = -vn;
    if (impact > 25 && (s.isPlayer || other?.isPlayer)) {
      const target = s.isPlayer ? s : other;
      if (G.time - (target._bumpT || -9) > 0.4) { target._bumpT = G.time; damage(G, target, impact * 0.35, _a.copy(c).addScaledVector(n, r), { vsShield: 0.5, vsHull: 1 }, null); audio.hitHull(); shake(Math.min(0.8, impact / 120)); }
    }
  }
}
function breakRock(G, rk) {
  rk.alive = false; _m.makeScale(0, 0, 0); rk.mesh.setMatrixAt(rk.idx, _m); rk.mesh.instanceMatrix.needsUpdate = true;
  explosionFX(G, rk.wp, clamp(rk.r / 14, 0.6, 3));
  G.ui.toast('Asteroid cracked — ore exposed');
  spawnPod(G, rk.wp, null, Math.random() < 0.15 && G.sys.id === 'ninefold' ? 'relics' : 'ore', 2 + Math.floor(rk.r / 12));
  if (Math.random() < 0.4) spawnPod(G, rk.wp, null, 'water', 2 + Math.floor(Math.random() * 3));
}

// ---------------------------------------------------------------- system building
export function clearSystem(G) {
  for (const s of G.ships) if (!s.isPlayer) G.scene.remove(s.model);
  G.ships = G.ships.filter((s) => s.isPlayer);
  for (const o of G.sysObjects) { G.scene.remove(o); o.traverse?.((c) => { if (c.geometry && !c.geometry.userData?.shared) c.geometry.dispose?.(); }); }
  G.sysObjects.length = 0; G.stations = []; G.gates = []; G.planets = []; G.field = null; G.navs = []; G.navSel = 0;
  for (const m of G.missiles) { G.scene.remove(m.mesh); G.missilePool.push(m.mesh); } G.missiles.length = 0;
  for (const p of G.pods) { G.scene.remove(p.mesh); G.podPool.push(p.mesh); } G.pods.length = 0;
  G.fx.bolts.clear(); G.fx.parts.clear(); G.fx.debris.clear();
  G.encounter = { t: 18 + Math.random() * 10, traffic: 6 };
  G.mrt = {}; // mission runtime objects per mission id
}
const addObj = (G, o) => { G.scene.add(o); G.sysObjects.push(o); return o; };
export function buildSystem(G, id) {
  clearSystem(G);
  const s = G.SYS[id]; G.sys = s;
  const star = STAR_TYPES[s.star] || STAR_TYPES.gold;
  // background tint: remix palette shifted per system
  G.setNebula(s);
  // sun direction + light
  // sun placed 110-140 degrees from the primary planet as seen from the station, so the planet reads gibbous, not as a dark disc
  const p0 = s.planets[0]; const az0 = p0 ? 0.42 + (p0.az % 0.5) : 0;
  const sAz = az0 + (s.sunAz < Math.PI ? 1 : -1) * (1.9 + (s.sunAz % 1) * 0.5);
  const sd = new V3(Math.sin(sAz) * Math.cos(s.sunEl), Math.sin(s.sunEl), Math.cos(sAz) * Math.cos(s.sunEl)).normalize();
  sunDirU.value.copy(sd); G.sunLight.position.copy(sd).multiplyScalar(1000); G.sunLight.color.set(star.light); G.sunLight.intensity = s.star === 'red' ? 2.4 : 3.0;
  G.sun.position.copy(sd).multiplyScalar(150000); G.sun.scale.setScalar(26000 * star.size); G.sun.userData.col.value.set(star.color).multiplyScalar(1.0);
  G.fill.color.set(s.star === 'wake' ? '#3ac8c0' : '#4a5a90');
  // planets
  s.planets.forEach((pl, i) => {
    const obj = planetModel(pl, (s.hue - 0.5) * 0.15);
    const az = i === 0 ? 0.42 + (pl.az % 0.5) : pl.az, el = i === 0 ? 0.08 + pl.el * 0.3 : pl.el;
    const dist = i === 0 ? pl.dist + pl.radius : pl.dist + pl.radius * 2;
    obj.position.set(Math.sin(az) * Math.cos(el) * dist, Math.sin(el) * dist, Math.cos(az) * Math.cos(el) * dist);
    obj.userData.center.value.copy(obj.position); obj.rotation.y = pl.seed % 6; obj.rotation.z = 0.2;
    addObj(G, obj); G.planets.push({ pos: obj.position, radius: pl.radius, obj, type: pl.type });
    if (pl.moon) { const mo = planetModel({ type: 'barren', seed: pl.seed + 7, radius: pl.radius * 0.22 }, 0); mo.position.copy(obj.position).add(new V3(pl.radius * 2.1, pl.radius * 0.4, -pl.radius * 1.2)); mo.userData.center.value.copy(mo.position); addObj(G, mo); G.planets.push({ pos: mo.position, radius: pl.radius * 0.22, obj: mo, type: 'barren' }); }
  });
  // stations
  s.stations.forEach((d, i) => {
    const obj = stationModel(d.type, d.faction, hashStr(d.id));
    obj.position.set(i * 4000, 0, 0); addObj(G, obj);
    const colliders = obj.userData.colliders.map((c) => ({ p: c.p, r: c.r, w: c.p.clone().applyQuaternion(obj.quaternion).add(obj.position) }));
    G.stations.push({ def: d, obj, pos: obj.position, colliders, bay: obj.userData.bay.clone().add(obj.position), bayOut: obj.userData.bayOut.clone().add(obj.position) });
    G.navs.push({ id: d.id, name: d.name, kind: 'station', pos: obj.position, sub: S.repTier ? `${FACTIONS[d.faction].short} · ${d.type}` : '' });
  });
  // gates
  for (const to of s.gates) {
    const obj = gateModel(G.SYS[to].faction === 'veil' ? '#ff7a6a' : G.SYS[to].faction === 'hollows' ? '#ffc27a' : '#7ad8ff');
    obj.position.fromArray(s.gatePos[to]); obj.lookAt(0, 0, 0); addObj(G, obj);
    G.gates.push({ to, obj, pos: obj.position, normal: new V3(0, 0, 1).applyQuaternion(obj.quaternion) });
    G.navs.push({ id: 'gate-' + to, name: `${G.SYS[to].name} Gate`, kind: 'gate', pos: obj.position, to });
  }
  // asteroid field
  if (s.asteroids) {
    const f = asteroidField(hashStr(s.id), s.id === 'ninefold' ? 320 : 230, s.id === 'ninefold' ? 2000 : 1500);
    f.position.set(Math.cos(s.fieldAz) * s.fieldDist, 200, Math.sin(s.fieldAz) * s.fieldDist); addObj(G, f);
    const rocks = f.userData.rocks; for (const r of rocks) r.wp = r.p.clone().add(f.position);
    G.field = { obj: f, center: f.position, radius: s.id === 'ninefold' ? 2000 : 1500, rocks };
    G.navs.push({ id: 'field', name: 'Asteroid field', kind: 'field', pos: f.position });
  }
  if (s.id === 'lacuna') buildLacuna(G);
  else if (s.id === 'ninefold' || s.id === 'vesk') addObj(G, wakeRibbon(G, 0.3, hashStr(s.id)));
  return s;
}
function wakeRibbon(G, bright, seed) {
  const r = rng(seed); const pts = [];
  for (let i = 0; i < 7; i++) pts.push(new V3((i - 3) * 18000, (r() - 0.5) * 9000 + 6000, -30000 + (r() - 0.5) * 16000));
  const curve = new THREE.CatmullRomCurve3(pts);
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const b = float(bright);
  m.colorNode = Fn(() => {
    const u = uv(); const V = normalize(cameraPosition.sub(positionWorld));
    const core = pow(abs(dot(normalWorld, V)), 2.5); // brighter where the line of sight crosses more of the tube
    const flow = mx_fractal_noise_float(vec3(u.x.mul(60).sub(time.mul(0.35)), u.y.mul(6.28), 1.7), 4, 2.0, 0.55);
    const wisps = smoothstep(-0.15, 0.45, flow);
    const ends = smoothstep(0.0, 0.12, u.x).mul(float(1).sub(smoothstep(0.88, 1.0, u.x)));
    return vec3(0.3, 1.0, 0.88).mul(core.mul(wisps).mul(ends)).mul(b);
  })();
  return new THREE.Mesh(new THREE.TubeGeometry(curve, 240, 1100, 16, false), m);
}
function buildLacuna(G) {
  addObj(G, wakeRibbon(G, 0.9, 99));
  const M = mats('wake'); const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.OctahedronGeometry(260, 0), M.glow));
  for (let i = 0; i < 3; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(420 + i * 170, 10 + i * 4, 6, 80), i === 1 ? M.glow : M.hull); t.rotation.set(i * 0.9, i * 0.5, 0); g.add(t); }
  const r = rng(5);
  for (let i = 0; i < 26; i++) { const c = new THREE.Mesh(new THREE.OctahedronGeometry(30 + r() * 90, 0), r() < 0.3 ? M.glow : M.dark); const a = r() * 6.28, b = (r() - 0.5) * 1.5, d = 700 + r() * 900; c.position.set(Math.cos(a) * Math.cos(b) * d, Math.sin(b) * d, Math.sin(a) * Math.cos(b) * d); c.scale.set(0.5, 1.8, 0.5); c.lookAt(0, 0, 0); g.add(c); }
  g.userData.spin = true; addObj(G, g); G.heart = g;
  G.navs.push({ id: 'heart', name: 'The Heart', kind: 'poi', pos: g.position });
  G.stations.push({ def: { id: 'heart', name: 'The Heart', type: 'none', faction: 'wake', nodock: true }, obj: g, pos: g.position, colliders: [{ p: new V3(), r: 300, w: new V3() }], bay: new V3(), bayOut: new V3() });
}

// ---------------------------------------------------------------- encounters (per system danger + remix pirate density)
export function encounterTick(G, dt) {
  const E = G.encounter; if (!E || G.sys.id === 'lacuna') return;
  E.t -= dt;
  const npcs = G.ships.filter((s) => s.alive && !s.isPlayer && !s.parent).length;
  if (E.t > 0 || npcs > 10) return;
  const s = G.sys, dens = clamp(G.cfg.pirateDensity, 0, 10) / 5, danger = s.danger;
  E.t = (55 + Math.random() * 45) / (G.diff.spawn * (0.6 + danger * 0.12 * Math.max(dens, 0.4)));
  const P = G.player.pos;
  const pW = danger * 0.9 * dens * G.diff.spawn, tW = s.stations.length ? 1.6 : 0.3, cW = s.faction === 'concord' ? 1.4 : s.faction === 'hollows' ? 0.5 : 0.15, dW = danger >= 1 ? 0.45 * dens : 0;
  const tot = pW + tW + cW + dW; let roll = Math.random() * tot;
  const around = (d) => { _a.set(Math.random() - 0.5, (Math.random() - 0.5) * 0.4, Math.random() - 0.5).normalize(); _b.copy(G.player.fwd).multiplyScalar(0.8); return _a.add(_b).normalize().multiplyScalar(d).add(P).clone(); };
  if ((roll -= pW) < 0) spawnPirates(G, around(2200 + Math.random() * 800), Math.min(1 + Math.floor(Math.random() * (1 + danger * 0.6)), 4), danger);
  else if ((roll -= tW) < 0) spawnTrader(G);
  else if ((roll -= cW) < 0) spawnPatrol(G, around(2600));
  else spawnDistress(G, around(2400));
}
export function spawnPirates(G, pos, n, lvl = 2, opts = {}) {
  const ships = [];
  const lead = spawnShip(G, lvl >= 3 && Math.random() < 0.6 ? 'marauder' : 'jackal', 'veil', pos, { lvl, look: G.player.pos, ai: { state: 'attack' }, bounty: 120 + lvl * 60, ...opts });
  ships.push(lead);
  for (let i = 1; i < n; i++) ships.push(spawnShip(G, i === 2 && lvl >= 4 ? 'marauder' : 'jackal', 'veil', _a.copy(pos).add(new V3((i % 2 ? 1 : -1) * 60 * i, 10 * i, 50 * i)), { lvl, look: G.player.pos, ai: { state: 'formation', leader: lead, offset: new V3((i % 2 ? 1 : -1) * 45 * Math.ceil(i / 2), 0, 40 * Math.ceil(i / 2)) }, bounty: 80 + lvl * 50, ...opts }));
  if (hostile(G, G.player, lead) && !opts.silent) G.ui.comms(PEOPLE.pirate, pick(['Cargo or coffin, freelancer. Your call.', 'Cut your engines and dump your hold.', 'Fresh meat on the scope. Light \'em up.', 'The Veil collects. Pay up or burn.']), 3.5, lead);
  return ships;
}
export function spawnTrader(G, opts = {}) {
  if (!G.stations.length || !G.gates.length) return null;
  const st = G.stations[0]; const gate = pick(G.gates); const inbound = Math.random() < 0.5;
  const from = inbound ? gate.pos.clone().addScaledVector(gate.normal, 300) : st.bayOut.clone();
  const to = inbound ? st.bayOut.clone() : gate.pos.clone();
  const fac = G.sys.faction === 'veil' ? 'veil' : G.sys.faction === 'concord' && Math.random() < 0.5 ? 'concord' : 'hollows';
  const cls = Math.random() < 0.4 ? 'barge' : 'ox';
  const s = spawnShip(G, cls, fac, from, { look: to, ai: { role: 'trader', state: 'travel', dest: to, arrive: 400, onArrive: (sh) => { sh.alive = false; G.scene.remove(sh.model); } }, throttle: 0.7, name: `${FACTIONS[fac].short} ${cls === 'barge' ? 'freighter' : 'hauler'}`, ...opts });
  return s;
}
function spawnPatrol(G, pos) {
  const lead = spawnShip(G, 'kite', 'concord', pos, { lvl: 2, look: G.player.pos, ai: { state: 'patrol' }, palette: 'concord', name: 'Concord Lancer' });
  spawnShip(G, 'kite', 'concord', _a.copy(pos).add(new V3(50, 0, 40)), { lvl: 2, ai: { state: 'formation', leader: lead, offset: new V3(45, 0, 40) }, palette: 'concord', name: 'Concord Lancer' });
  lead.scan = 0; G.patrolLead = lead;
  if (!hostile(G, G.player, lead)) G.ui.comms(PEOPLE.patrol, pick(['Concord patrol. Keep your lanes clean, pilot.', 'Patrol on station. Report any Veil activity.', 'Fly safe, freelancer. We\'ve got the sector.']), 3);
}
function spawnDistress(G, pos) {
  const v = spawnTrader(G, { name: 'Freighter Wren\'s Rest' }); if (!v) return;
  v.pos.copy(pos); v.ai.dest = null; v.ai.state = 'idle'; v.tag = 'distress';
  const pir = spawnPirates(G, _a.copy(pos).add(new V3(300, 40, 200)), 2, Math.max(1, G.sys.danger), { silent: true });
  for (const p of pir) p.target = v;
  G.navs.push({ id: 'distress', name: 'Distress beacon', kind: 'distress', pos: v.pos }); G.selectNav('distress');
  G.ui.comms(PEOPLE.trader, 'Mayday, mayday! Raiders on us, hull failing — anyone on this channel!', 4);
  G.distress = { ship: v, pirates: pir, paid: false };
}
export function distressTick(G) {
  const D = G.distress; if (!D || D.paid) return;
  if (!D.ship.alive) { D.paid = true; G.ui.toast('The freighter is gone.'); removeNav(G, 'distress'); return; }
  if (D.pirates.every((p) => !p.alive)) {
    D.paid = true; const r = 500 + G.sys.danger * 180; G.P.credits += r; G.P.earned += r; S.addRep(G.P, { hollows: 4, concord: 2 }); audio.cash();
    G.ui.comms(PEOPLE.trader, `You saved our necks. Sending ${r} cr, it's all we can spare.`, 4); removeNav(G, 'distress');
    D.ship.ai.state = 'travel'; D.ship.ai.dest = G.gates[0]?.pos.clone(); D.ship.ai.onArrive = (sh) => { sh.alive = false; G.scene.remove(sh.model); };
  }
}
export function removeNav(G, id) { const i = G.navs.findIndex((n) => n.id === id); if (i >= 0) { G.navs.splice(i, 1); if (G.navSel >= G.navs.length) G.navSel = 0; } }

// ---------------------------------------------------------------- patrol scans (contraband)
export function patrolTick(G, dt) {
  const L = G.patrolLead; if (!L || !L.alive || hostile(G, G.player, L)) return;
  if (!(G.P.cargo.spirits > 0 || G.P.missions.some((m) => m.type === 'smuggle'))) return;
  const d = L.pos.distanceTo(G.player.pos);
  if (d < 1100) {
    if (!L.scan) G.ui.comms(PEOPLE.patrol, 'Freelancer, hold course for a cargo scan.', 3);
    L.scan += dt; L.ai.state = 'formation'; L.ai.leader = G.player; L.ai.offset = new V3(60, 10, 80);
    G.ui.objective(`Concord scan ${Math.min(100, Math.round(L.scan / 5 * 100))}% — boost away to break it`);
    if (L.scan >= 5) {
      const n = (G.P.cargo.spirits || 0); delete G.P.cargo.spirits;
      const sm = G.P.missions.filter((m) => m.type === 'smuggle'); for (const m of sm) S.failMission(G.P, m, 'confiscated');
      const fine = Math.min(G.P.credits, 40 * n + 300 * sm.length); G.P.credits -= fine; S.addRep(G.P, { concord: -5 });
      G.ui.comms(PEOPLE.patrol, `Contraband confiscated. Fine: ${fine} cr. Don't let us catch you twice.`, 4);
      L.scan = 0; L.ai.state = 'patrol'; L.ai.leader = null; G.patrolLead = null; G.storyObjective();
    }
  } else if (L.scan > 0) { L.scan = Math.max(0, L.scan - dt * 2); if (d > 1800) { L.scan = 0; L.ai.state = 'attack'; L.target = G.player; L.aggro = true; G.ui.comms(PEOPLE.patrol, 'Running a scan is admitting guilt. Weapons free!', 3); G.patrolLead = null; G.ui.objective(null); } }
}

// ---------------------------------------------------------------- missions + story in flight
export function missionsOnEnter(G) {
  const P = G.P;
  for (const m of P.missions) if (m.sys === G.sys.id) materialize(G, m);
  storyOnEnter(G);
}
function navFor(G, id, name, pos, kind = 'mission') { removeNav(G, id); G.navs.push({ id, name, kind, pos: pos instanceof V3 ? pos : new V3(...pos) }); }
export function materialize(G, m) {
  const R = G.mrt[m.id] ||= {};
  if (m.type === 'bounty' || m.type === 'raid') navFor(G, m.id, m.type === 'raid' ? 'Convoy' : `Bounty: ${m.target}`, m.nav);
  if (m.type === 'patrol') m.navs.forEach((p, i) => { if (!m.visited[i]) navFor(G, `${m.id}-${i}`, `Patrol point ${'ABC'[i]}`, p); });
}
export function missionsOnLaunch(G, stationId) {
  for (const m of G.P.missions) {
    if (m.sys !== G.sys.id) continue;
    if (m.type === 'escort') { if (m.from === stationId && !(G.mrt[m.id] && G.mrt[m.id].ship)) startEscort(G, m); }
    else if (!G.mrt[m.id]?.spawned) materialize(G, m); // contracts accepted while docked in this system
  }
}
export function startEscort(G, m) {
  const R = G.mrt[m.id] ||= {}; const st = G.stations.find((s) => s.def.id === m.from); const gate = G.gates.find((g) => g.to === m.gate); if (!st || !gate) return;
  const ship = spawnShip(G, 'barge', m.giver === 'veil' ? 'veil' : 'hollows', st.bayOut.clone().add(new V3(80, -30, 120)), { look: gate.pos, name: m.ship, tag: 'escort', ally: true, team: 'player', ai: { role: 'escort', state: 'travel', dest: gate.pos.clone(), arrive: 260, onArrive: () => { R.arrived = true; } }, throttle: 0.85, loot: 0 });
  ship.st.speed = 70; ship.hullMax = ship.hull = 900 * (1.25 - G.diff.enemyDmg * 0.25); R.ship = ship; R.start = ship.pos.clone(); R.waves = 0;
  navFor(G, m.id, `Escort: ${m.ship}`, ship.pos); G.selectNav(m.id);
  G.ui.comms(PEOPLE.trader, `${m.ship} undocking. Stay close, we're slow and fat.`, 3.5);
}
export function missionsTick(G, dt) {
  const P = G.P;
  for (const m of [...P.missions]) {
    if (m.sys !== G.sys.id) continue;
    const R = G.mrt[m.id] ||= {};
    if (m.type === 'bounty' || m.type === 'raid') {
      const nav = new V3(...m.nav);
      if (!R.spawned && G.player.pos.distanceTo(nav) < 3200) {
        R.spawned = true; R.ships = [];
        const fac = m.targetFac; const lvl = m.lvl;
        m.ships.forEach((cls, i) => { const sh = spawnShip(G, cls, fac, nav.clone().add(new V3(i * 70 - 70, (i % 2) * 30, i * 40)), { lvl, look: G.player.pos, palette: fac, name: i === 0 && m.type === 'bounty' ? m.target : undefined, ai: fac === 'hollows' ? { role: 'trader', state: 'travel', dest: G.gates[0]?.pos.clone() || new V3() } : { state: i === 0 ? 'attack' : 'formation', leader: null, offset: new V3(i * 50, 0, 40) }, tag: m.id, loot: fac === 'hollows' ? 1 : 0.6 }); if (fac !== 'hollows') sh.aggro = true; if (i > 0 && sh.ai.state === 'formation') sh.ai.leader = R.ships[0]; R.ships.push(sh); });
        if (fac === 'veil') G.ui.comms(PEOPLE.pirate, `${m.target} doesn't run from anyone. Come get me.`, 3.5, R.ships[0]);
        if (fac === 'concord') G.ui.comms(PEOPLE.patrol, 'You\'re a long way from friendly space, pilot. Turn around.', 3.5, R.ships[0]);
      }
      if (R.spawned && R.ships.every((s) => !s.alive && !s.escaped) ) { finishContract(G, m); }
      else if (R.spawned && R.ships.every((s) => !s.alive) && R.ships.some((s) => s.escaped)) { G.ui.toast('Target escaped — contract failed'); S.failMission(P, m, 'escaped'); removeNav(G, m.id); }
    } else if (m.type === 'patrol') {
      m.navs.forEach((p, i) => {
        if (m.visited[i]) return; const v = new V3(...p);
        if (G.player.pos.distanceTo(v) < 650) {
          m.visited[i] = true; removeNav(G, `${m.id}-${i}`); G.ui.toast(`Patrol point ${'ABC'[i]} clear`);
          if (Math.random() < 0.55 + G.sys.danger * 0.08) spawnPirates(G, v.clone().add(new V3(900, 100, 600)), 1 + Math.floor(Math.random() * 2), m.lvl);
          const next = m.navs.findIndex((_, k) => !m.visited[k]); if (next >= 0) G.selectNav(`${m.id}-${next}`);
        }
      });
      if (m.visited.every(Boolean) && !G.ships.some((s) => s.alive && hostile(G, G.player, s) && s.pos.distanceTo(G.player.pos) < 3000)) finishContract(G, m);
    } else if (m.type === 'escort') {
      if (!R.ship) continue;
      const sh = R.ship; const gate = G.gates.find((g) => g.to === m.gate);
      const nav = G.navs.find((n) => n.id === m.id); if (nav) nav.pos = sh.pos;
      const prog = 1 - sh.pos.distanceTo(gate.pos) / R.start.distanceTo(gate.pos);
      if (R.waves === 0 && prog > 0.3) { R.waves = 1; for (const p of spawnPirates(G, sh.pos.clone().addScaledVector(sh.fwd, 1500).add(new V3(400, 200, 0)), 2 + (m.lvl > 2 ? 1 : 0), m.lvl)) p.target = sh; }
      if (R.waves === 1 && prog > 0.65) { R.waves = 2; for (const p of spawnPirates(G, sh.pos.clone().add(new V3(-1500, -200, 600)), 2, m.lvl)) p.target = sh; }
      if (!sh.alive) { G.ui.comms(PEOPLE.trader, '...', 1); G.ui.toast(`${m.ship} destroyed — contract failed`); S.failMission(P, m); removeNav(G, m.id); R.ship = null; }
      else if (R.arrived) { sh.alive = false; G.scene.remove(sh.model); G.fx.lights.flash(sh.pos, '#7ad8ff', 2e6, 0.8); G.ui.comms(PEOPLE.trader, 'Gate locked. You earned every credit, friend.', 3.5); finishContract(G, m); }
    }
  }
  storyTick(G, dt);
}
function finishContract(G, m) { const r = S.completeMission(G.P, m); removeNav(G, m.id); G.ui.toast(`Contract complete: +${r.toLocaleString()} cr`); audio.cash(); G.storyObjective(); G.autosaveSoon = true; }

// Story runtime: scripted spawns keyed by story.active + system
export function storyOnEnter(G) {
  const P = G.P; const a = P.story.active; const R = G.mrt.story = {};
  if (a === 's1' && G.sys.id === 'tallow') { R.ambushT = 7; }
  if (a === 's2' && G.sys.id === 'vesk') {
    R.buoys = P.story.buoys ||= [[2400, 300, -3400], [-3800, -500, -1200], [1200, 700, 4300]].map((p) => ({ p, done: false, t: 0 }));
    R.buoys.forEach((b, i) => { if (!b.done) navFor(G, `buoy${i}`, `Wake buoy ${i + 1}`, b.p, 'story'); });
    const first = R.buoys.findIndex((b) => !b.done); if (first >= 0) G.selectNav(`buoy${first}`);
    R.buoyMesh = R.buoys.map((b) => { const m = buoyModel(); m.position.fromArray(b.p); addObj(G, m); return m; });
  }
  if ((a === 's3c' || a === 's3v') && G.sys.id === 'ironmere') {
    R.lumenPending = true;
  }
  if (a === 's4' && G.sys.id === 'lacuna') {
    R.wreck = new V3(-2600, 400, -3200); navFor(G, 'wreck', 'Larkspur beacon', R.wreck, 'story'); G.selectNav('wreck');
    const w = shipModel('magpie', 'hollows'); w.position.copy(R.wreck); w.rotation.set(0.6, 1.2, 2.2); w.scale.setScalar(1.2); addObj(G, w); R.wreckObj = w;
    G.ui.comms(PEOPLE.ferro, 'You\'re in. Gods, look at it. Follow Ines\' beacon, and mind the Shepherds.', 5);
    R.wave = 0;
  }
  if (a === 's5' && G.sys.id === 'lacuna') { R.wreck = new V3(-2600, 400, -3200); startFinale(G, R); }
}
function buoyModel() { const M = mats('wake'); const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.OctahedronGeometry(18, 0), M.dark)); const r = new THREE.Mesh(new THREE.TorusGeometry(30, 1.6, 6, 32), M.glow); g.add(r); g.userData.ring = r; return g; }
function storyTick(G, dt) {
  const P = G.P; const a = P.story.active; const R = G.mrt.story; if (!R) return;
  if (a === 's1' && R.ambushT != null) {
    R.ambushT -= dt;
    if (R.ambushT <= 0) { R.ambushT = null; spawnPirates(G, G.player.pos.clone().addScaledVector(G.player.fwd, 1800).add(new V3(500, 200, 0)), 3, 2, { silent: true }); G.ui.comms(PEOPLE.pirate, 'That\'s Calloway\'s ship. The shard, now, or we pull it from the wreck!', 4.5); G.ui.objective('Survive the ambush, then dock at Tallow Deep'); }
  }
  if (a === 's2' && R.buoys) {
    R.buoyMesh?.forEach((m, i) => { m.userData.ring.rotation.x += dt; m.userData.ring.rotation.y += dt * 0.7; if (R.buoys[i].done) m.userData.ring.scale.setScalar(1.6); });
    let active = null;
    R.buoys.forEach((b, i) => { if (b.done) return; const d = G.player.pos.distanceTo(_a.fromArray(b.p)); if (d < 450) { active = b; b.t += dt; G.ui.objective(`Syncing wake buoy ${i + 1}: ${Math.min(100, Math.round(b.t / 4 * 100))}% — stay within 450 m`);
      if (b.t >= 4) { b.done = true; removeNav(G, `buoy${i}`); audio.cash(); G.fx.lights.flash(_a.fromArray(b.p).clone(), '#6ff7e8', 2e6, 1.2); const n = R.buoys.filter((x) => x.done).length; G.ui.toast(`Buoy ${i + 1} synced (${n}/3)`); G.storyObjective();
        if (n === 1) spawnPirates(G, G.player.pos.clone().add(new V3(1600, 300, -900)), 2, 2);
        if (n === 2) { spawnPirates(G, G.player.pos.clone().add(new V3(-1500, 200, 1200)), 2, 3); }
        if (n === 3) { spawnShip(G, 'shepherd', 'wake', G.player.pos.clone().add(new V3(1200, 600, 1400)), { lvl: 2, look: G.player.pos, ai: { state: 'attack', canFlee: false }, name: 'Shepherd' }); G.ui.comms(PEOPLE.ferro, 'That signal... something answered the buoys. Something old. Get clear of it and come home!', 5); R.allDone = true; }
        const nx = R.buoys.findIndex((x) => !x.done); if (nx >= 0) G.selectNav(`buoy${nx}`);
      } } });
    if (R.allDone && !G.ships.some((s) => s.alive && s.fac === 'wake')) { R.allDone = false; completeStory(G); }
  }
  if ((a === 's3c' || a === 's3v') && R.lumenPending && G.sys.id === 'ironmere' && G.state === 'flight' && G.stations[0] && G.player.pos.distanceTo(G.stations[0].pos) < 3200 && (R.wait = (R.wait || 0) - dt) <= 0) {
    R.lumenPending = false; const st = G.stations[0]; const gate = G.gates.find((g) => g.to === 'vesk') || G.gates[0];
    const start = st.bayOut.clone().add(new V3(200, 0, 600));
    R.lumen = spawnShip(G, 'barge', 'concord', start, { look: gate.pos, palette: 'concord', name: 'CNS Lumen', tag: a === 's3c' ? 'escort' : 'lumen', ally: a === 's3c', team: a === 's3c' ? 'player' : 'concord', loot: 0, ai: { role: 'escort', state: 'travel', dest: gate.pos.clone(), arrive: 260, onArrive: () => { R.lumenArrived = true; } } });
    R.lumen.st.speed = 62; R.lumen.hullMax = R.lumen.hull = a === 's3c' ? 1100 * (1.3 - G.diff.enemyDmg * 0.3) : 900; R.start = start.clone(); R.gate = gate; R.waves = 0;
    R.escorts = [0, 1].map((i) => spawnShip(G, 'kite', 'concord', start.clone().add(new V3(i ? 90 : -90, 30, -60)), { lvl: 2, palette: 'concord', name: 'Concord Lancer', ally: a === 's3c', team: a === 's3c' ? 'player' : 'concord', ai: { state: 'formation', leader: R.lumen, offset: new V3(i ? 120 : -120, 40, -80) } }));
    navFor(G, 'lumen', 'CNS Lumen', R.lumen.pos, 'story'); G.selectNav('lumen');
    if (a === 's3c') { G.ui.comms(PEOPLE.venn, 'Lumen is underway. Veil raiders will hit us before the Vesk gate. Keep them off her.', 5); G.ui.objective('Escort the CNS Lumen to the Vesk gate'); }
    else { G.ui.comms(PEOPLE.quill, 'There she is. Two Lancers riding herd. Knock out the escort, crack the barge, scoop the core.', 5); G.ui.objective('Destroy the Lumen and recover the survey core'); for (const s of [R.lumen, ...R.escorts]) s.aggro = true; }
  }
  if ((a === 's3c' || a === 's3v') && R.lumen) {
    const nav = G.navs.find((n) => n.id === 'lumen'); if (nav) nav.pos = R.lumen.pos;
    const prog = 1 - R.lumen.pos.distanceTo(R.gate.pos) / R.start.distanceTo(R.gate.pos);
    if (a === 's3c') {
      if (R.waves === 0 && prog > 0.2) { R.waves = 1; for (const p of spawnPirates(G, R.lumen.pos.clone().addScaledVector(R.lumen.fwd, 1700).add(new V3(500, 300, 0)), 3, 3, { silent: true })) p.target = R.lumen; G.ui.comms(PEOPLE.pirate, 'Veil wolves, on the barge! Ignore the fighters!', 3.5); }
      if (R.waves === 1 && prog > 0.6) { R.waves = 2; for (const p of spawnPirates(G, R.lumen.pos.clone().add(new V3(-1700, -300, 900)), 3, 3, { silent: true })) p.target = R.lumen; G.ui.comms(PEOPLE.venn, 'Second wing inbound, port side. Hold the line.', 3.5); }
      if (!R.lumen.alive) { G.ui.comms(PEOPLE.venn, 'Lumen is lost. Dock at the Foundry, we\'ll prep another barge.', 5); G.ui.objective('Lumen lost — a new barge launches from the Foundry shortly'); R.lumen = null; R.lumenPending = true; R.wait = 25; removeNav(G, 'lumen'); }
      else if (R.lumenArrived) { R.lumen.alive = false; G.scene.remove(R.lumen.model); G.fx.lights.flash(R.lumen.pos, '#7ad8ff', 3e6, 1); removeNav(G, 'lumen'); R.lumen = null; completeStory(G); }
    } else {
      if (!R.lumen.alive && !R.coreDropped) { R.coreDropped = true; spawnPod(G, R.lumen.pos, null, 'relics', 0, 'Survey core'); removeNav(G, 'lumen'); G.ui.objective('Scoop the survey core'); G.onSpecialPod = (pod) => { if (pod.special === 'Survey core') { completeStory(G); G.onSpecialPod = null; } }; }
      else if (R.lumen.alive && R.lumenArrived) { R.lumen.alive = false; G.scene.remove(R.lumen.model); removeNav(G, 'lumen'); R.lumen = null; G.ui.comms(PEOPLE.quill, 'She jumped! There\'s a second barge prepping at the Foundry. Don\'t miss again.', 5); G.ui.objective('The Lumen escaped — another barge launches from the Foundry shortly'); R.lumenPending = true; R.wait = 25; }
    }
  }
  if (a === 's4' && R.wreck) {
    const d = G.player.pos.distanceTo(R.wreck);
    if (R.wave === 0 && d < 4500) { R.wave = 1; shepherds(G, 2); }
    if (R.wave === 1 && d < 2400) { R.wave = 2; shepherds(G, 3); }
    if (d < 350 && !G.ships.some((s) => s.alive && s.fac === 'wake' && s.pos.distanceTo(G.player.pos) < 1500)) { G.ui.comms(PEOPLE.ines, 'If you\'re hearing this, the Larkspur found the Heart. It isn\'t a road. It\'s a seed. Whoever holds it decides what grows. Don\'t let them cage it.', 7); completeStory(G); R.finaleT = 7; }
    else if (d < 350) G.ui.objective('Clear the Shepherds to read the beacon');
  }
  if (a === 's5' && R.finaleT != null) { R.finaleT -= dt; if (R.finaleT <= 0) { R.finaleT = null; startFinale(G, R); } }
  if (a === 's5' && R.capital) finaleTick(G, R, dt);
}
function shepherds(G, n) { for (let i = 0; i < n; i++) spawnShip(G, 'shepherd', 'wake', G.player.pos.clone().add(new V3(Math.cos(i * 2.1) * 1600, 300 + i * 80, Math.sin(i * 2.1) * 1600)), { lvl: 2 + i % 2, look: G.player.pos, ai: { state: 'attack', canFlee: false }, name: 'Shepherd', loot: 0.5 }); }
function completeStory(G) {
  const m = S.finishStory(G.P); if (!m) return;
  G.storyObjective ? G.storyObjective() : G.ui.objective(null); audio.cash(); G.ui.story(m); G.autosaveSoon = true;
}
function startFinale(G, R) {
  if (R.capital) return;
  const P = G.P; const enemyFac = P.story.branch === 'veil' ? 'concord' : 'veil';
  const pos = new V3(3800, 600, 3800);
  const cap = spawnShip(G, 'capital', enemyFac, pos, { look: new V3(0, 0, 0), palette: enemyFac, name: enemyFac === 'veil' ? 'VSS Gallows' : 'CNS Steadfast', invuln: true, ai: { role: 'escort', state: 'travel', dest: new V3(0, 0, 0), arrive: 1100, canFlee: false }, throttle: 0.4, loot: 0,
    colliders: [{ p: new V3(0, 0, -60), r: 28 }, { p: new V3(0, 0, 0), r: 30 }, { p: new V3(0, 0, 60), r: 30 }, { p: new V3(0, 0, 105), r: 32 }, { p: new V3(30, 0, 40), r: 18 }, { p: new V3(-30, 0, 40), r: 18 }, { p: new V3(0, 25, 50), r: 18 }] });
  cap.radius = 120; cap.aggro = true; cap.st.speed = 22; R.capital = cap;
  const gens = [[0, 46, 60], [26, 14, 100], [-26, 14, 100]].map((o, i) => { const g = spawnShip(G, 'jackal', enemyFac, pos, { model: generatorModel(enemyFac), parent: cap, offset: new V3(...o), sub: 'gen', stats: { hull: 340 * (0.7 + G.diff.enemyDmg * 0.3), shield: 0, regen: 0, speed: 0, boost: 0, turn: 0, accel: 1, guns: 0, gun: GUNS.pulse, dmgMult: 1, missilesMax: 0, radius: 10 }, radius: 11, name: `Shield generator ${i + 1}`, ai: { state: 'idle' }, loot: 0 }); g.aggro = true; return g; });
  const turrets = [[0, 17, -40], [24, 6, 10], [-24, 6, 10], [0, -16, 20]].map((o, i) => { const t = spawnShip(G, 'jackal', enemyFac, pos, { model: turretModel(enemyFac), parent: cap, offset: new V3(...o), sub: 'turret', stats: { hull: 170, shield: 0, regen: 0, speed: 0, boost: 0, turn: 0, accel: 1, guns: 1, gun: GUNS.driver, dmgMult: G.diff.enemyDmg * 1.2, missilesMax: 0, radius: 7 }, radius: 8, name: `Turret ${i + 1}`, ai: { state: 'idle' }, loot: 0 }); t.aggro = true; return t; });
  const core = spawnShip(G, 'jackal', enemyFac, pos, { model: coreModel(), parent: cap, offset: new V3(0, 0, 128), sub: 'core', invuln: true, stats: { hull: 900 * (0.6 + G.diff.enemyDmg * 0.4), shield: 0, regen: 0, speed: 0, boost: 0, turn: 0, accel: 1, guns: 0, gun: GUNS.pulse, dmgMult: 1, missilesMax: 0, radius: 14 }, radius: 16, name: 'Reactor core', ai: { state: 'idle' }, loot: 0 });
  core.aggro = true;
  Object.assign(R, { gens, turrets, core, waveT: 10, phase: 1 });
  G.fx.lights.flash(pos, '#ffffff', 5e6, 1.5); explosionFX(G, pos.clone().add(new V3(0, 0, -150)), 3);
  const allyFac = P.story.branch === 'veil' ? 'veil' : 'concord';
  for (let i = 0; i < 2; i++) spawnShip(G, allyFac === 'veil' ? 'marauder' : 'kite', allyFac, G.player.pos.clone().add(new V3(i ? 120 : -120, 30, 150)), { lvl: 3, palette: allyFac, ally: true, team: 'player', name: allyFac === 'veil' ? `Veil wing ${i + 1}` : `Concord wing ${i + 1}`, ai: { state: 'formation', leader: G.player, offset: new V3(i ? 70 : -70, 10, 60) } });
  spawnPirateWave(G, R, enemyFac, 3);
  navFor(G, 'capital', cap.name, cap.pos, 'story'); G.selectNav('capital');
  G.ui.comms(allyFac === 'veil' ? PEOPLE.quill : PEOPLE.venn, allyFac === 'veil' ? `The Concord sent the ${cap.name}. Two of my best are with you. Pop the generators, then gut her.` : `The ${cap.name} just jumped in. My wing is yours. Generators first, then the core. Go!`, 6);
  G.ui.objective('Destroy the 3 shield generators'); G.saveCheckpoint?.();
}
function coreModel() { const M = mats('wake'); const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.SphereGeometry(9, 16, 12), M.glow)); g.add(new THREE.Mesh(new THREE.TorusGeometry(14, 1.5, 6, 24), M.dark)); return g; }
function spawnPirateWave(G, R, fac, n) {
  const from = R.capital.pos.clone().add(new V3(0, -20, -160)).applyAxisAngle(UP, 0);
  for (let i = 0; i < n; i++) spawnShip(G, fac === 'veil' ? (i === 2 ? 'marauder' : 'jackal') : 'kite', fac, from.clone().add(new V3(i * 40 - 40, -i * 15, -i * 30)), { lvl: 3, palette: fac, look: G.player.pos, name: fac === 'veil' ? 'Veil raider' : 'Concord Lancer', ai: { state: 'attack', canFlee: false }, loot: 0.3 }).aggro = true;
}
// FABLE: finale music track; turret slew animation toward targets
function finaleTick(G, R, dt) {
  const cap = R.capital; if (!cap.alive) return;
  const nav = G.navs.find((n) => n.id === 'capital'); if (nav) nav.pos = R.phase === 1 ? (R.gens.find((g) => g.alive)?.pos || cap.pos) : R.core.pos;
  R.waveT -= dt;
  const fighters = G.ships.filter((s) => s.alive && s.fac === cap.fac && !s.parent && s !== cap).length;
  if (R.waveT <= 0 && fighters < 4) { R.waveT = 26 / G.diff.spawn; spawnPirateWave(G, R, cap.fac, 2 + (R.phase === 2 ? 1 : 0)); }
  const alive = R.gens.filter((g) => g.alive).length;
  if (R.phase === 1) {
    G.ui.objective(`Destroy the shield generators (${3 - alive}/3)`);
    if (alive === 0) { R.phase = 2; R.core.invuln = false; G.ui.comms(G.P.story.branch === 'veil' ? PEOPLE.quill : PEOPLE.venn, 'Shields are down! The reactor core is exposed at her stern. Hit it with everything!', 5); G.selectNav('capital'); explosionFX(G, cap.pos, 3); }
  } else if (R.phase === 2) {
    G.ui.objective(`Destroy the reactor core (${Math.max(0, Math.round(R.core.hullFrac() * 100))}%)`);
    if (!R.core.alive) {
      R.phase = 3; R.boomT = 0; G.ui.objective(null); removeNav(G, 'capital');
      for (const s of G.ships) if (s.alive && s.fac === cap.fac && s !== cap) { s.ai && (s.ai.state = 'flee'); }
    }
  } else if (R.phase === 3) { // FABLE: hand-authored capital-ship break-up (hull sections shearing, turret slew) + finale music swell
    R.boomT += dt;
    if (Math.random() < dt * 6) explosionFX(G, _a.set((Math.random() - 0.5) * 60, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 220).applyQuaternion(cap.quat).add(cap.pos).clone(), 2 + Math.random() * 2);
    cap.ang.set(0.03, 0.02, 0.08);
    if (R.boomT > 4.5) { cap.invuln = false; destroy(G, cap, G.player); explosionFX(G, cap.pos, 6, null, true); flash('rgba(220,255,250,.8)', 600); G.hitstop = 0.15; R.capital = null; G.ui.objective(null); completeStory(G); setTimeout(() => G.ui.ending(), 3500); }
  }
}
