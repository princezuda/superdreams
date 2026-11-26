// Apex Drift — pooled, instanced effects: tyre smoke / dust / snow spray, skid marks, sparks (wall hits, drift tiers),
// podium confetti. Each pool is one draw call; nothing allocates per frame.
import { THREE } from '/shared/sd-kit.js';
import { vec3, float, instancedBufferAttribute, normalView, abs, pow, smoothstep, positionGeometry, mix, positionWorld, cameraPosition, length } from 'three/tsl';

export class FX {
  constructor(scene) {
    this.scene = scene; this.group = new THREE.Group(); scene.add(this.group);
    const m4 = this.m4 = new THREE.Matrix4(); void m4; this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.v = new THREE.Vector3(); this.s = new THREE.Vector3(); this.c = new THREE.Color();
    // smoke puffs: soft spheres (fresnel-faded edges read as billows without sorting sprites)
    const SM = this.SM = 150; this.smA = new THREE.InstancedBufferAttribute(new Float32Array(SM), 1); this.smA.setUsage(THREE.DynamicDrawUsage);
    const smM = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    smM.colorNode = vec3(1, 1, 1); smM.opacityNode = pow(abs(normalView.z), 1.8).mul(instancedBufferAttribute(this.smA)).mul(smoothstep(2.0, 9.0, length(positionWorld.sub(cameraPosition)))); // never white-out the lens
    this.smoke = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), smM, SM); this.smoke.frustumCulled = false; this.smoke.count = 0; this.smoke.renderOrder = 4;
    this.smoke.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.smoke.setColorAt(0, new THREE.Color(1, 1, 1)); this.group.add(this.smoke);
    this.puffs = Array.from({ length: SM }, () => ({ on: false })); this.pHead = 0;
    // skid marks: ring buffer of dark quads laid on the road
    const SK = this.SK = 1200; this.skA = new THREE.InstancedBufferAttribute(new Float32Array(SK), 1); this.skA.setUsage(THREE.DynamicDrawUsage);
    const skM = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    skM.colorNode = vec3(0.02, 0.02, 0.025); skM.opacityNode = instancedBufferAttribute(this.skA).mul(smoothstep(0.5, 0.3, abs(positionGeometry.x)));
    const sg = new THREE.PlaneGeometry(1, 1); sg.rotateX(-Math.PI / 2);
    this.skids = new THREE.InstancedMesh(sg, skM, SK); this.skids.frustumCulled = false; this.skids.count = 0; this.skids.renderOrder = 1; this.skids.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.group.add(this.skids);
    this.skHead = 0; this.skCount = 0; this.skTint = 1;
    // sparks: stretched HDR boxes, additive
    const SPK = this.SPK = 220; this.spC = new THREE.InstancedBufferAttribute(new Float32Array(SPK * 3), 3); this.spC.setUsage(THREE.DynamicDrawUsage);
    const spM = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }); spM.colorNode = instancedBufferAttribute(this.spC);
    this.spk = new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, 0.035, 0.5), spM, SPK); this.spk.frustumCulled = false; this.spk.count = 0; this.spk.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.group.add(this.spk);
    this.sparks = Array.from({ length: SPK }, () => ({ on: false })); this.sHead = 0;
    // confetti
    const CF = this.CF = 260; const cfM = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, roughness: 0.5 }); cfM.emissiveNode = vec3(0.25);
    this.conf = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.16, 0.26), cfM, CF); this.conf.frustumCulled = false; this.conf.count = 0; this.conf.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.conf.setColorAt(0, new THREE.Color(1, 1, 1)); this.group.add(this.conf); this.confs = Array.from({ length: CF }, () => ({ on: false })); this.cHead = 0;
    this.smokeTint = new THREE.Color(0.9, 0.9, 0.92); this.lastSkid = new Map();
  }
  setTheme(theme) {
    this.smokeTint.set(theme === 'coast' ? 0xe6d2b8 : theme === 'alpine' ? 0xf4f8ff : 0xc8c8d4);
    this.clearSkids();
  }
  clearSkids() { this.skCount = 0; this.skHead = 0; this.skids.count = 0; this.lastSkid.clear(); }
  puff(x, y, z, vx, vz, size = 1, alpha = 0.5, tint = null) {
    const p = this.puffs[this.pHead]; this.pHead = (this.pHead + 1) % this.SM;
    Object.assign(p, { on: true, x, y, z, vx: vx + (Math.random() - 0.5) * 1.5, vy: 0.6 + Math.random() * 0.7, vz: vz + (Math.random() - 0.5) * 1.5, t: 0, life: 0.9 + Math.random() * 0.7, s0: 0.3 * size, s1: (1.1 + Math.random() * 0.8) * size, a: alpha });
    p.col = tint || this.smokeTint;
  }
  spark(x, y, z, vx, vy, vz, r, g, b, life = 0.5) {
    const s = this.sparks[this.sHead]; this.sHead = (this.sHead + 1) % this.SPK;
    Object.assign(s, { on: true, x, y, z, vx, vy, vz, r, g, b, t: 0, life: life * (0.6 + Math.random() * 0.8) });
  }
  burst(x, y, z, nx, nz, n = 14, col = [5, 2.6, 0.8]) {
    for (let i = 0; i < n; i++) this.spark(x, y, z, nx * (2 + Math.random() * 6) + (Math.random() - 0.5) * 6, 1 + Math.random() * 4, nz * (2 + Math.random() * 6) + (Math.random() - 0.5) * 6, col[0], col[1], col[2], 0.55);
  }
  /** Lay a skid segment for wheel `key` at (x,y,z) with heading yaw (call while sliding; gaps break the trail). */
  skid(key, x, y, z, on, strength = 0.6) {
    const last = this.lastSkid.get(key);
    if (!on) { if (last) last.on = false; return; }
    if (!last || !last.on) { this.lastSkid.set(key, { x, y, z, on: true }); return; }
    const dx = x - last.x, dz = z - last.z, d = Math.hypot(dx, dz); if (d < 0.35) return;
    if (d > 4) { last.x = x; last.y = y; last.z = z; return; }
    const i = this.skHead; this.skHead = (this.skHead + 1) % this.SK; this.skCount = Math.min(this.SK, this.skCount + 1);
    this.e.set(0, Math.atan2(dx, dz), 0); this.q.setFromEuler(this.e); this.v.set((x + last.x) / 2, (y + last.y) / 2 + 0.06, (z + last.z) / 2); this.s.set(0.3, 1, d + 0.05);
    this.m4.compose(this.v, this.q, this.s); this.skids.setMatrixAt(i, this.m4); this.skA.setX(i, strength);
    this.skids.count = this.skCount; this.skids.instanceMatrix.needsUpdate = true; this.skA.needsUpdate = true;
    last.x = x; last.y = y; last.z = z;
  }
  confetti(x, y, z, n = 120) {
    for (let i = 0; i < n; i++) {
      const c = this.confs[this.cHead]; this.cHead = (this.cHead + 1) % this.CF;
      const a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 7;
      Object.assign(c, { on: true, x, y, z, vx: Math.cos(a) * sp * 0.5, vy: 6 + Math.random() * 8, vz: Math.sin(a) * sp * 0.5, rx: Math.random() * 6, ry: Math.random() * 6, wr: (Math.random() - 0.5) * 14, t: 0, life: 5 + Math.random() * 3 });
      c.col = new THREE.Color().setHSL(Math.random(), 0.9, 0.6);
    }
  }
  update(dt) {
    let n = 0;
    for (let i = 0; i < this.SM; i++) { const p = this.puffs[i]; if (!p.on) continue; p.t += dt; if (p.t > p.life) { p.on = false; continue; }
      const k = p.t / p.life; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vx *= 1 - dt * 1.8; p.vz *= 1 - dt * 1.8; p.vy *= 1 - dt * 0.8;
      const s = p.s0 + (p.s1 - p.s0) * (1 - (1 - k) * (1 - k)); this.v.set(p.x, p.y, p.z); this.s.set(s, s * 0.8, s); this.q.identity(); this.m4.compose(this.v, this.q, this.s);
      this.smoke.setMatrixAt(n, this.m4); this.smoke.setColorAt(n, p.col); this.smA.setX(n, p.a * (1 - k) * Math.min(1, p.t * 8)); n++; }
    this.smoke.count = n; this.smoke.instanceMatrix.needsUpdate = true; this.smA.needsUpdate = true; if (this.smoke.instanceColor) this.smoke.instanceColor.needsUpdate = true;
    n = 0;
    for (let i = 0; i < this.SPK; i++) { const s = this.sparks[i]; if (!s.on) continue; s.t += dt; if (s.t > s.life) { s.on = false; continue; }
      s.vy -= 16 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt; const k = 1 - s.t / s.life;
      this.v.set(s.x, s.y, s.z); const sp = Math.hypot(s.vx, s.vy, s.vz) || 1; this.e.set(-Math.asin(s.vy / sp), Math.atan2(s.vx, s.vz), 0, 'YXZ'); this.q.setFromEuler(this.e); this.s.set(1, 1, 0.3 + Math.min(1.6, sp * 0.08));
      this.m4.compose(this.v, this.q, this.s); this.spk.setMatrixAt(n, this.m4); this.spC.setXYZ(n, s.r * k, s.g * k, s.b * k); n++; }
    this.spk.count = n; this.spk.instanceMatrix.needsUpdate = true; this.spC.needsUpdate = true;
    n = 0; let anyC = false;
    for (let i = 0; i < this.CF; i++) { const c = this.confs[i]; if (!c.on) continue; c.t += dt; if (c.t > c.life) { c.on = false; continue; } anyC = true;
      c.vy = Math.max(-1.6, c.vy - 9 * dt); c.vx *= 1 - dt * 0.9; c.vz *= 1 - dt * 0.9; c.x += (c.vx + Math.sin(c.t * 3 + i) * 0.6) * dt; c.y += c.vy * dt; c.z += c.vz * dt; c.rx += c.wr * dt; c.ry += c.wr * 0.7 * dt;
      this.v.set(c.x, c.y, c.z); this.e.set(c.rx, c.ry, 0); this.q.setFromEuler(this.e); this.s.set(1, 1, 1); this.m4.compose(this.v, this.q, this.s);
      this.conf.setMatrixAt(n, this.m4); this.conf.setColorAt(n, c.col); n++; }
    this.conf.count = n; if (anyC) { this.conf.instanceMatrix.needsUpdate = true; this.conf.instanceColor.needsUpdate = true; }
  }
  reset() { for (const p of this.puffs) p.on = false; for (const s of this.sparks) s.on = false; for (const c of this.confs) c.on = false; this.clearSkids(); }
}
export { float, mix };
