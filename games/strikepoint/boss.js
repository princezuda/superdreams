// "Overseer" — heavy gunship drone (campaign finale + holdout wave 10). Armoured hull, three coolant
// vents that open on a cycle (weak points, telegraphed by glow + hiss), chin turret bursts, drone deploys.
// FABLE: bespoke rotor/armour-plate animation and a boss music sting.
import { THREE } from '/shared/sd-kit.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { raySphere, damp, wrapAngle, clamp } from './logic.js';
import { WEAPONS } from './config.js';

const _v = new THREE.Vector3(), _d = new THREE.Vector3();
export class Overseer {
  constructor(game, o = {}) {
    this.game = game; this.team = 'B'; this.kind = 'boss'; this.name = 'Overseer'; this.alive = true; this.scale = 2.2;
    this.maxHealth = o.hp ?? 2600; this.health = this.maxHealth; this.x = o.x ?? 40; this.z = o.z ?? -20; this.y = o.y ?? 22; this.yaw = 0;
    this.orbitA = 0; this.orbitR = o.r ?? 22; this.cx = o.cx ?? 0; this.cz = o.cz ?? 0; this.hover = o.hover ?? 14;
    this.ventT = 6; this.open = 0; this.fireT = 2; this.burst = 0; this.deployT = 14; this.dead = 0; this.w = WEAPONS.lmg;
    const g = this.group = new THREE.Group();
    const hull = new THREE.MeshStandardNodeMaterial({ color: 0x3a3f44, metalness: 0.6, roughness: 0.4 });
    const dark = new THREE.MeshStandardNodeMaterial({ color: 0x1a1c1e, metalness: 0.5, roughness: 0.5 });
    const accent = new THREE.MeshStandardNodeMaterial({ color: 0x8a2a1a, metalness: 0.3, roughness: 0.5 });
    this.ventMat = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(0.3, 0.6, 1.0) });
    const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; g.add(m); return m; };
    add(new RoundedBoxGeometry(3.2, 1.4, 5.2, 2, 0.4), hull, 0, 0, 0);
    add(new RoundedBoxGeometry(2.2, 0.8, 2.4, 2, 0.3), hull, 0, 0.9, 0.4);
    add(new RoundedBoxGeometry(1.4, 0.7, 1.6, 2, 0.25), dark, 0, -0.75, -1.8); // chin turret
    add(new THREE.CylinderGeometry(0.09, 0.09, 1.4, 8), dark, 0.18, -0.85, -2.8, Math.PI / 2); add(new THREE.CylinderGeometry(0.09, 0.09, 1.4, 8), dark, -0.18, -0.85, -2.8, Math.PI / 2);
    for (const s of [-1, 1]) { add(new RoundedBoxGeometry(1.2, 0.5, 3.2, 2, 0.2), accent, s * 2.4, 0.1, 0.2); add(new THREE.CylinderGeometry(1.5, 1.5, 0.12, 24), dark, s * 3.2, 0.5, -1.4); add(new THREE.CylinderGeometry(1.5, 1.5, 0.12, 24), dark, s * 3.2, 0.5, 2.0); }
    this.eye = add(new THREE.SphereGeometry(0.28, 12, 10), new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(6, 0.4, 0.15) }), 0, -0.2, -2.62);
    // vents (weak points) + their armour shutters
    this.vents = []; this.shutters = [];
    for (const [x, z] of [[-0.8, 1.6], [0.8, 1.6], [0, -0.4]]) {
      const v = add(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 16), this.ventMat, x, 0.74, z); this.vents.push(v);
      const s = add(new RoundedBoxGeometry(1.0, 0.12, 1.0, 1, 0.05), hull, x, 0.8, z); this.shutters.push(s);
    }
    g.scale.setScalar(1.0); game.scene.add(g);
    this.light = new THREE.PointLight(0x88aaff, 0, 12, 2); g.add(this.light); this.light.position.set(0, 1.5, 0.5);
  }
  dispose() { this.game.scene.remove(this.group); this.group.traverse((o) => o.geometry?.dispose()); }
  customHit(ox, oy, oz, dir, maxT) {
    if (!this.alive) return null; let best = null, bt = maxT;
    if (this.open > 0.6) for (const v of this.vents) { v.getWorldPosition(_v); const t = raySphere(ox, oy, oz, dir.x, dir.y, dir.z, _v.x, _v.y, _v.z, 0.6, bt); if (t >= 0) { bt = t; best = 'head'; } }
    const t = raySphere(ox, oy, oz, dir.x, dir.y, dir.z, this.x, this.y, this.z, 2.7, bt); if (t >= 0 && t < bt) { bt = t; best = 'body'; }
    return best ? { t: bt, zone: best } : null;
  }
  hurt(dmg, zone, from) {
    if (!this.alive) return false; const g = this.game;
    const k = zone === 'head' ? 3.2 : 0.12; this.health -= dmg * k;
    if (zone === 'head') { g.fx.impact(this.x, this.y + 0.9, this.z, 0, 1, 0, 'robot'); } else if (Math.random() < 0.3) g.audio.impact('metal', this.x, this.y, this.z);
    if (from?.isPlayer && zone !== 'head' && !this.hinted) { this.hinted = true; g.hud.tip('Armour too thick — hit the glowing coolant vents when they open', 4500); }
    if (this.health <= 0) { this.health = 0; this.alive = false; this.dead = 0.001; g.hud.banner('OVERSEER DOWN', 'Target destroyed', 3500); return true; }
    return false;
  }
  update(dt) {
    const g = this.game, P = g.player.pos;
    if (!this.alive) { // crash
      this.dead += dt; this.vy = (this.vy || 0) - 9 * dt; this.y += this.vy * dt; this.group.rotation.z += dt * 1.2; this.group.rotation.x += dt * 0.4;
      if (Math.random() < dt * 20) g.fx.puff(this.x, this.y, this.z, 0, 1, 0, 1.2, 2, 2.5, 0.12, 0.11, 0.1, 0.85, 1.5);
      if (Math.random() < dt * 6) g.fx.explosion(this.x + (Math.random() - 0.5) * 3, this.y, this.z + (Math.random() - 0.5) * 3, 0.5);
      const fl = g.world.floorAt(this.x, this.z, 1, this.y + 2, 3);
      if (this.y <= fl + 1 && !this.crashed) { this.crashed = true; g.explode(this.x, fl, this.z, { radius: 9, dmg: 60, owner: null }); for (let i = 0; i < 4; i++) setTimeout(() => g.fx.explosion(this.x + (Math.random() - 0.5) * 6, fl, this.z + (Math.random() - 0.5) * 6, 1.2), i * 220); this.group.visible = false; }
      this.sync(); return;
    }
    // orbit the arena centre, face the player
    this.orbitA += dt * 0.16; const tx = this.cx + Math.cos(this.orbitA) * this.orbitR, tz = this.cz + Math.sin(this.orbitA) * this.orbitR;
    const ty = g.world.floorAt(tx, tz, 1, 60, 60) + this.hover + Math.sin(g.time * 0.8) * 0.8;
    this.x = damp(this.x, tx, 0.8, dt); this.z = damp(this.z, tz, 0.8, dt); this.y = damp(this.y, ty, 0.8, dt);
    const want = Math.atan2(-(P.x - this.x), -(P.z - this.z)); this.yaw += wrapAngle(want - this.yaw) * Math.min(1, dt * 1.5);
    // vent cycle: telegraph → open 5s → close
    this.ventT -= dt; const opening = this.ventT < 0 && this.ventT > -5.5;
    if (this.ventT < -5.5) { this.ventT = 9 + Math.random() * 3; }
    if (this.ventT < 0.8 && this.ventT > 0 && !this.hiss) { this.hiss = true; g.audio.smoke(this.x, this.y, this.z); g.hud.prompt('Overseer venting — <b>shoot the coolant vents!</b>', null, 2); }
    if (!opening) this.hiss = false;
    this.open = damp(this.open, opening ? 1 : 0, 6, dt);
    this.shutters.forEach((s, i) => { s.position.y = 0.8 + this.open * 0.5; s.rotation.x = this.open * 1.1 * (i === 2 ? -1 : 1); });
    this.ventMat.color.setRGB(0.3 + this.open * 3, 0.6 + this.open * 4, 1 + this.open * 6); this.light.intensity = this.open * 25;
    if (opening && Math.random() < dt * 8) for (const v of this.vents) { v.getWorldPosition(_v); g.fx.puff(_v.x, _v.y + 0.3, _v.z, 0, 2.5, 0, 0.4, 1.5, 0.8, 0.8, 0.85, 0.9, 0.5, 1); }
    // chin turret bursts (with LOS) — pauses while vents are open
    this.fireT -= dt;
    if (!opening && this.fireT <= 0 && g.player.alive) {
      if (this.burst <= 0) this.burst = 8;
      const mz = _v.set(0, -0.85, -3.4).applyEuler(this.group.rotation).add(this.group.position);
      const ex = P.x, ey = P.y + g.player.eye * 0.7, ez = P.z; _d.set(ex - mz.x, ey - mz.y, ez - mz.z).normalize();
      if (g.world.los(mz.x, mz.y, mz.z, ex, ey, ez)) {
        const err = g.diff.aimErr * 1.5 * Math.PI / 180; _d.x += (Math.random() - 0.5) * err * 2; _d.y += (Math.random() - 0.5) * err * 2; _d.z += (Math.random() - 0.5) * err * 2; _d.normalize();
        g.shoot({ shooter: this, team: 'B', ox: mz.x, oy: mz.y, oz: mz.z, dir: _d, w: this.w, muzzle: mz, tracer: true, botDmgMul: g.diff.dmg * 0.55 });
        g.audio.shot('lmg', mz.x, mz.y, false, mz.z); g.fx.glow(mz.x, mz.y, mz.z, 1.0, 0.05, 3, 2, 1);
      }
      this.burst--; this.fireT = this.burst > 0 ? 0.09 : 1.6 + Math.random();
    }
    // deploy drones
    this.deployT -= dt;
    if (this.deployT <= 0 && g.bots.filter((b) => b.alive && b.kind === 'drone').length < 3) { this.deployT = 18; for (const s of [-1, 1]) { const b = g.addBot({ x: this.x + s * 3, z: this.z, y: this.y - 1, kind: 'drone', team: 'B', state: 'combat' }); b.target = g.player; b.aware = 1.2; b.enterCombat(); } g.hud.prompt('Overseer deploying drones', null, 2); }
    this.sync();
  }
  sync() { this.group.position.set(this.x, this.y, this.z); this.group.rotation.y = this.yaw; }
}
