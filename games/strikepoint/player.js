// First-person movement: walk/sprint/crouch/slide/jump with coyote time + jump buffer, mantling low
// walls, lean, surface footsteps (also heard by AI), landing dips, health regen + armor.
import { THREE, settings } from '/shared/sd-kit.js';
import { clamp, damp } from './logic.js';

const R = 0.36, H_STAND = 1.8, H_CROUCH = 1.15, EYE_STAND = 1.62, EYE_CROUCH = 1.04, EYE_SLIDE = 0.86;
const _fw = new THREE.Vector3(), _rt = new THREE.Vector3(), _p = { x: 0, z: 0 }, _info = { surf: 'concrete', col: null };

export class Player {
  constructor(game) {
    this.game = game; this.team = 'A'; this.isPlayer = true; this.name = 'You';
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.yaw = 0; this.pitch = 0; this.roll = 0;
    this.reset();
  }
  reset() {
    this.health = 100; this.maxHealth = 100; this.armor = 0; this.alive = true; this.grounded = true; this.coyote = 0; this.jumpBuf = 0;
    this.crouch = false; this.crouchK = 0; this.slideT = 0; this.sprinting = false; this.sprintK = 0; this.leanK = 0; this.mantling = false; this.mantle = null;
    this.eye = EYE_STAND; this.stepAcc = 0; this.hurtT = 99; this.speedH = 0; this.landK = 0; this.bobT = 0; this.surf = 'concrete'; this.godMode = false; this.airT = 0;
    this.vel.set(0, 0, 0); this.glide = null; this.regenMul = 1;
  }
  spawn(x, y, z, yaw = 0) { this.reset(); this.pos.set(x, y ?? this.game.world.groundAt(x, z, R), z); this.yaw = yaw; this.pitch = 0; }
  get height() { return (this.crouch || this.slideT > 0) ? H_CROUCH : H_STAND; }
  stopSprint() { this.sprinting = false; this.fireHold = 0.35; }
  eyePos(out) { return out.set(this.pos.x, this.pos.y + this.eye, this.pos.z); }
  forward(out) { return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  update(dt, inp) {
    const g = this.game, W = g.world, cfg = g.cfg;
    if (!this.alive) { this.vel.multiplyScalar(0.9); return; }
    const grav = 20 * (cfg.gravity ?? 1);
    this.forward(_fw); _rt.set(-_fw.z, 0, _fw.x);
    if (this.glide) return this.updateGlide(dt, inp, grav);
    if (this.mantling) return this.updateMantle(dt);
    const ars = g.arsenal, w = ars?.w;
    // crouch toggle / slide
    if (inp.crouchPressed) {
      if (this.sprinting && this.grounded && this.speedH > 5) { this.slideT = 0.85; this.crouch = true; this.sprinting = false; const sp = Math.max(this.speedH + 1.6, 8.8); this.vel.x = _fw.x * sp; this.vel.z = _fw.z * sp; g.audio?.slide(); g.noise?.(this.pos.x, this.pos.z, 10, this); }
      else if (this.crouch) { if (this.canStand()) this.crouch = false; } else this.crouch = true;
    }
    // sprint (forward only, not while ADS/reloading-with-ads)
    const fwdIn = inp.mz > 0.3;
    if (inp.sprintPressed && this.crouch && this.slideT <= 0 && this.canStand()) this.crouch = false;
    if (inp.fire) this.fireHold = 0.35; else this.fireHold = (this.fireHold || 0) - dt;
    this.sprinting = !!inp.sprint && fwdIn && !this.crouch && this.slideT <= 0 && (!ars || ars.ads < 0.3) && this.fireHold <= 0 && !(ars && ars.reloading && ars.ads > 0.1);
    this.sprintK = damp(this.sprintK, this.sprinting ? 1 : 0, 10, dt);
    // target velocity
    let mx = inp.mx, mz = inp.mz; const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
    let speed = this.sprinting ? 7.3 : this.crouch ? 2.5 : 4.7;
    if (ars) speed *= (w?.moveMul ?? 1) * (1 - ars.ads * 0.42);
    speed *= g.speedMul ?? 1;
    const tx = (_fw.x * mz + _rt.x * mx) * speed, tz = (_fw.z * mz + _rt.z * mx) * speed;
    if (this.slideT > 0) {
      this.slideT -= dt; const f = Math.exp(-2.2 * dt); this.vel.x *= f; this.vel.z *= f;
      this.vel.x += tx * 0.6 * dt; this.vel.z += tz * 0.6 * dt;
      if (this.slideT <= 0 || Math.hypot(this.vel.x, this.vel.z) < 3.4) this.slideT = 0;
      if (this.grounded && Math.random() < dt * 10) g.fx.puff(this.pos.x, this.pos.y + 0.05, this.pos.z, -this.vel.x * 0.1, 0.3, -this.vel.z * 0.1, 0.2, 0.8, 0.5, 0.5, 0.48, 0.45, 0.35);
    } else {
      const acc = this.grounded ? 14 : 2.2;
      this.vel.x = damp(this.vel.x, tx, acc, dt); this.vel.z = damp(this.vel.z, tz, acc, dt);
    }
    // jump (coyote + buffer) / mantle
    if (inp.jumpPressed) this.jumpBuf = 0.14; else this.jumpBuf -= dt;
    this.coyote = this.grounded ? 0.12 : this.coyote - dt;
    if (this.jumpBuf > 0) {
      if (this.tryMantle()) { this.jumpBuf = 0; return; }
      if (this.coyote > 0) {
        if (this.crouch && this.canStand()) this.crouch = false;
        if (!this.crouch) { this.vel.y = 6.6 * Math.sqrt(cfg.gravity ?? 1); this.grounded = false; this.coyote = 0; this.jumpBuf = 0; this.slideT = 0; g.audio?.jump(this.surf); }
      }
    }
    if (!this.grounded && inp.mz > 0.5 && inp.jumpHeld && this.vel.y < 1.5 && this.tryMantle()) return;
    // integrate
    this.vel.y -= grav * dt;
    const ox = this.pos.x, oz = this.pos.z;
    _p.x = this.pos.x + this.vel.x * dt; _p.z = this.pos.z + this.vel.z * dt;
    W.collide(_p, R, this.pos.y, this.height, this.grounded ? 0.5 : 0.15);
    this.pos.x = _p.x; this.pos.z = _p.z;
    // keep inside the map
    const B = W.bounds; this.pos.x = clamp(this.pos.x, B.minX + 1, B.maxX - 1); this.pos.z = clamp(this.pos.z, B.minZ + 1, B.maxZ - 1);
    const wasGrounded = this.grounded;
    const floor = W.floorAt(this.pos.x, this.pos.z, R, this.pos.y, wasGrounded ? 0.5 : 0.2, _info);
    let ny = this.pos.y + this.vel.y * dt;
    if (this.vel.y <= 0 && ny <= floor + (wasGrounded ? 0.45 : 0.0)) {
      if (!wasGrounded && this.vel.y < -4) { const imp = Math.min(1, -this.vel.y / 14); this.landK = imp; g.vm?.k.land && (g.vm.k.land.v += 3 * imp); g.audio?.land(_info.surf, imp); g.noise?.(this.pos.x, this.pos.z, 8 * imp, this); if (this.vel.y < -15 && !this.godMode) this.hurt(Math.round((-this.vel.y - 15) * 9), null, null); }
      ny = floor; this.vel.y = 0; this.grounded = true; this.airT = 0;
    } else { this.grounded = false; this.airT += dt; }
    const ceil = W.ceilAt(this.pos.x, this.pos.z, R, this.pos.y + 0.3);
    if (ny + this.height > ceil && this.vel.y > 0) { this.vel.y = 0; ny = Math.min(ny, ceil - this.height); }
    this.pos.y = ny; this.surf = _info.surf;
    if (this.pos.y < W.killY) { this.hurt(999, null, null); }
    // speed + footsteps
    const dx = this.pos.x - ox, dz = this.pos.z - oz; this.speedH = Math.hypot(dx, dz) / Math.max(dt, 1e-4);
    if (this.grounded && this.slideT <= 0) {
      this.stepAcc += Math.hypot(dx, dz);
      const stride = this.sprinting ? 2.5 : this.crouch ? 1.35 : 1.95;
      if (this.stepAcc > stride) { this.stepAcc = 0; const loud = this.sprinting ? 1 : this.crouch ? 0.3 : 0.62; g.audio?.step(this.surf, loud); if (!this.crouch) g.noise?.(this.pos.x, this.pos.z, this.sprinting ? 15 : 7, this); }
    }
    // lean (blocked by walls)
    let leanT = (inp.leanR ? 1 : 0) - (inp.leanL ? 1 : 0); if (this.sprinting || this.slideT > 0) leanT = 0;
    if (leanT) { const ex = this.pos.x + _rt.x * leanT * 0.7, ez = this.pos.z + _rt.z * leanT * 0.7; const h = W.ray(this.pos.x, this.pos.y + this.eye, this.pos.z, _rt.x * leanT, 0, _rt.z * leanT, 0.75); if (h) leanT *= Math.max(0, (h.t - 0.25) / 0.5); void ex; void ez; }
    this.leanK = damp(this.leanK, leanT, 9, dt);
    // eye height
    const eyeT = this.slideT > 0 ? EYE_SLIDE : this.crouch ? EYE_CROUCH : EYE_STAND;
    this.eye = damp(this.eye, eyeT, 12, dt); this.crouchK = damp(this.crouchK, this.crouch || this.slideT > 0 ? 1 : 0, 12, dt);
    this.landK = damp(this.landK, 0, 6, dt);
    // regen
    this.hurtT += dt;
    if (this.hurtT > (g.diff?.regenDelay ?? 4) && this.health < this.maxHealth && this.regenMul > 0) this.health = Math.min(this.maxHealth, this.health + 34 * dt * this.regenMul);
  }
  canStand() { return this.game.world.ceilAt(this.pos.x, this.pos.z, R, this.pos.y + 0.3) > this.pos.y + H_STAND; }
  tryMantle() {
    const W = this.game.world; this.forward(_fw);
    for (const reach of [0.55, 0.85]) {
      const px = this.pos.x + _fw.x * reach, pz = this.pos.z + _fw.z * reach;
      const top = W.floorAt(px, pz, 0.2, this.pos.y + 1.75, 0);
      const rise = top - this.pos.y;
      if (rise < 0.5 || rise > 1.75) continue;
      // something solid in front at knee/waist height (not a ramp)
      const hit = W.ray(this.pos.x, this.pos.y + Math.min(rise - 0.15, 0.6), this.pos.z, _fw.x, 0, _fw.z, reach + 0.4);
      if (!hit || hit.col?.kind === 'ramp') continue;
      const tx = this.pos.x + _fw.x * (reach + 0.25), tz = this.pos.z + _fw.z * (reach + 0.25);
      const ceil = W.ceilAt(tx, tz, 0.3, top + 0.05);
      if (ceil - top < H_CROUCH + 0.05) continue;
      const crouchAfter = ceil - top < H_STAND;
      this.mantling = true; this.mantle = { t: 0, dur: 0.28 + rise * 0.14, sx: this.pos.x, sy: this.pos.y, sz: this.pos.z, ex: tx, ey: top, ez: tz, crouchAfter };
      this.vel.set(0, 0, 0); this.sprinting = false; this.slideT = 0; this.game.audio?.mantle(); this.game.hud?.teach?.('mantle');
      return true;
    }
    return false;
  }
  updateMantle(dt) {
    const m = this.mantle; m.t += dt / m.dur; const t = Math.min(1, m.t);
    const up = Math.min(1, t / 0.65), fw = Math.max(0, (t - 0.45) / 0.55);
    this.pos.y = m.sy + (m.ey - m.sy) * (1 - (1 - up) * (1 - up)) + Math.sin(Math.min(1, t) * Math.PI) * 0.06;
    this.pos.x = m.sx + (m.ex - m.sx) * fw; this.pos.z = m.sz + (m.ez - m.sz) * fw;
    this.eye = damp(this.eye, EYE_CROUCH + 0.2, 10, dt);
    if (m.t >= 1) { this.mantling = false; this.grounded = true; if (m.crouchAfter) this.crouch = true; }
  }
  // Dropzone glide: free-fall with steering until near the ground
  updateGlide(dt, inp, grav) {
    const gl = this.glide; this.forward(_fw); _rt.set(-_fw.z, 0, _fw.x);
    const dive = inp.mz > 0.5 ? 1 : 0; const term = gl.open ? 7 : dive ? 38 : 22;
    this.vel.y = Math.max(-term, this.vel.y - grav * dt);
    const hs = gl.open ? 9 : dive ? 22 : 14;
    this.vel.x = damp(this.vel.x, (_fw.x * inp.mz + _rt.x * inp.mx) * hs, 2, dt); this.vel.z = damp(this.vel.z, (_fw.z * inp.mz + _rt.z * inp.mx) * hs, 2, dt);
    this.pos.addScaledVector(this.vel, dt);
    const B = this.game.world.bounds; this.pos.x = clamp(this.pos.x, B.minX + 2, B.maxX - 2); this.pos.z = clamp(this.pos.z, B.minZ + 2, B.maxZ - 2);
    const floor = this.game.world.floorAt(this.pos.x, this.pos.z, R, this.pos.y, 0.1);
    if (!gl.open && this.pos.y - floor < 28) { gl.open = true; this.game.audio?.whoosh(); }
    if (this.pos.y <= floor) { this.pos.y = floor; this.glide = null; this.vel.set(0, 0, 0); this.grounded = true; this.game.audio?.land('dirt', 0.7); this.game.onLanded?.(); }
    this.eye = EYE_STAND; this.speedH = Math.hypot(this.vel.x, this.vel.z);
  }
  hurt(amount, from, attacker, info = {}) {
    if (!this.alive || this.godMode) return 0;
    let dmg = amount;
    if (this.armor > 0 && !info.storm) { const ab = Math.min(this.armor, dmg * 0.7); this.armor -= ab; dmg -= ab; }
    this.health -= dmg; this.hurtT = 0;
    this.game.onPlayerHurt?.(dmg, from, attacker, info);
    if (this.health <= 0) { this.health = 0; this.alive = false; this.game.onPlayerDeath?.(attacker, info); }
    return dmg;
  }
}
export const PLAYER_R = R;
