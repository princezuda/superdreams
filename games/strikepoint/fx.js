// Pooled visual effects — every pool is ONE InstancedMesh (one draw call), no per-frame allocation.
// sparks (additive streaks), chips (lit debris), puffs (smoke/dust billboards), glows (flash billboards),
// tracers, bullet-hole decals, scorch decals, brass shells.
import { THREE, settings } from '/shared/sd-kit.js';
import { texture, instancedDynamicBufferAttribute, vec3, float, uniform } from 'three/tsl';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _d = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _z = new THREE.Vector3(0, 0, 1);
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);

function canvasTex(size, paint) { const c = document.createElement('canvas'); c.width = c.height = size; paint(c.getContext('2d'), size); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
const softTex = () => canvasTex(64, (g, s) => { const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); });
const smokeTex = () => canvasTex(128, (g, s) => {
  for (let i = 0; i < 26; i++) { const a = Math.random() * 6.28, d = Math.random() * s * 0.22, x = s / 2 + Math.cos(a) * d, y = s / 2 + Math.sin(a) * d, r = s * (0.12 + Math.random() * 0.18); const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); }
});
const flashTex = () => canvasTex(128, (g, s) => {
  g.translate(s / 2, s / 2);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, s / 2); gr.addColorStop(0, 'rgba(255,255,240,1)'); gr.addColorStop(0.18, 'rgba(255,220,140,0.9)'); gr.addColorStop(0.5, 'rgba(255,140,40,0.25)'); gr.addColorStop(1, 'rgba(255,100,20,0)'); g.fillStyle = gr; g.fillRect(-s / 2, -s / 2, s, s);
  g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(255,200,120,0.55)';
  for (let i = 0; i < 6; i++) { g.rotate(Math.PI / 3 + (Math.random() - 0.5) * 0.3); g.beginPath(); g.moveTo(0, -3); g.lineTo(s * (0.32 + Math.random() * 0.16), 0); g.lineTo(0, 3); g.fill(); }
});
const holeTex = () => canvasTex(64, (g, s) => {
  g.clearRect(0, 0, s, s); const c = s / 2;
  let gr = g.createRadialGradient(c, c, 0, c, c, c); gr.addColorStop(0, 'rgba(10,8,6,1)'); gr.addColorStop(0.16, 'rgba(15,12,10,1)'); gr.addColorStop(0.3, 'rgba(40,35,30,0.85)'); gr.addColorStop(0.55, 'rgba(70,64,58,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s);
  g.strokeStyle = 'rgba(20,16,12,0.7)'; g.lineWidth = 1; for (let i = 0; i < 7; i++) { const a = Math.random() * 6.28; g.beginPath(); g.moveTo(c + Math.cos(a) * 5, c + Math.sin(a) * 5); g.lineTo(c + Math.cos(a + 0.2) * (12 + Math.random() * 14), c + Math.sin(a + 0.2) * (12 + Math.random() * 14)); g.stroke(); }
});
const scorchTex = () => canvasTex(128, (g, s) => { const c = s / 2; for (let i = 0; i < 18; i++) { const a = Math.random() * 6.28, d = Math.random() * 18, r = 30 + Math.random() * 30; const gr = g.createRadialGradient(c + Math.cos(a) * d, c + Math.sin(a) * d, 0, c + Math.cos(a) * d, c + Math.sin(a) * d, r); gr.addColorStop(0, 'rgba(8,6,5,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); } });

class Pool {
  constructor(scene, geo, mat, n, rgba = false) {
    this.mesh = new THREE.InstancedMesh(geo, mat, n); this.mesh.frustumCulled = false; this.n = n; this.items = []; this.next = 0;
    for (let i = 0; i < n; i++) { this.mesh.setMatrixAt(i, HIDE); this.items.push({ alive: false, i }); }
    if (rgba) { this.col = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4); this.col.setUsage(THREE.DynamicDrawUsage); }
    scene.add(this.mesh);
  }
  take() { const it = this.items[this.next]; this.next = (this.next + 1) % this.n; it.alive = true; return it; }
  setCol(i, r, g, b, a) { const c = this.col.array; c[i * 4] = r; c[i * 4 + 1] = g; c[i * 4 + 2] = b; c[i * 4 + 3] = a; }
}

export class FX {
  constructor(scene, camera, world) {
    this.scene = scene; this.camera = camera; this.world = world;
    this.light = uniform(1); // ambient brightness for lit-ish smoke
    // sparks: additive stretched boxes
    const sparkMat = new THREE.MeshBasicNodeMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.sparks = new Pool(scene, new THREE.BoxGeometry(1, 1, 1), sparkMat, 220, true);
    sparkMat.colorNode = instancedDynamicBufferAttribute(this.sparks.col).xyz;
    // chips: lit debris
    const chipMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.9 });
    this.chips = new Pool(scene, new THREE.BoxGeometry(1, 1, 1), chipMat, 160);
    this.chips.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(160 * 3).fill(0.5), 3);
    // puffs: billboards, normal blend
    const st = smokeTex();
    const puffMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.puffs = new Pool(scene, new THREE.PlaneGeometry(1, 1), puffMat, 260, true);
    const pc = instancedDynamicBufferAttribute(this.puffs.col);
    puffMat.colorNode = pc.xyz.mul(this.light); puffMat.opacityNode = texture(st).a.mul(pc.w);
    this.puffs.mesh.renderOrder = 3;
    // glows: additive billboards (muzzle flash, explosion flash, flares)
    const ft = flashTex(), sft = softTex();
    const glowMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.glows = new Pool(scene, new THREE.PlaneGeometry(1, 1), glowMat, 80, true);
    const gc = instancedDynamicBufferAttribute(this.glows.col);
    glowMat.colorNode = texture(ft).rgb.mul(gc.xyz).mul(gc.w); this.glows.mesh.renderOrder = 4;
    // tracers
    const trMat = new THREE.MeshBasicNodeMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.tracers = new Pool(scene, new THREE.BoxGeometry(1, 1, 1).translate(0, 0, -0.5), trMat, 90, true);
    trMat.colorNode = instancedDynamicBufferAttribute(this.tracers.col).xyz;
    // decals
    const decalMat = new THREE.MeshStandardNodeMaterial({ map: holeTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, roughness: 0.9 });
    this.decals = new Pool(scene, new THREE.PlaneGeometry(1, 1), decalMat, 320);
    this.decals.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(320 * 3).fill(1), 3); this.decals.mesh.renderOrder = 1; this.decals.mesh.receiveShadow = true;
    const scMat = new THREE.MeshStandardNodeMaterial({ map: scorchTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, roughness: 1 });
    this.scorch = new Pool(scene, new THREE.PlaneGeometry(1, 1), scMat, 24);
    // brass
    const brass = new THREE.MeshStandardNodeMaterial({ color: 0xc8a050, metalness: 0.85, roughness: 0.3 });
    this.shells = new Pool(scene, new THREE.CylinderGeometry(0.006, 0.006, 0.028, 6).rotateX(Math.PI / 2), brass, 48);
    this.dirty = new Set();
  }
  _hide(pool, it) { it.alive = false; pool.mesh.setMatrixAt(it.i, HIDE); this.dirty.add(pool); }

  spark(x, y, z, vx, vy, vz, life, r, g, b, w = 0.015, len = 0.18, grav = 9) {
    const it = this.sparks.take(); Object.assign(it, { x, y, z, vx, vy, vz, life, max: life, r, g, b, w, len, grav }); this.dirty.add(this.sparks);
  }
  chip(x, y, z, vx, vy, vz, size, color, life = 1.6) {
    const it = this.chips.take(); Object.assign(it, { x, y, z, vx, vy, vz, size, life, rx: Math.random() * 6, ry: Math.random() * 6, sp: (Math.random() - 0.5) * 30, rest: false });
    const c = new THREE.Color(color); this.chips.mesh.setColorAt(it.i, c); this.chips.mesh.instanceColor.needsUpdate = true; this.dirty.add(this.chips);
  }
  puff(x, y, z, vx, vy, vz, size, grow, life, r, g, b, a, drag = 2.5) {
    const it = this.puffs.take(); Object.assign(it, { x, y, z, vx, vy, vz, size, grow, life, max: life, r, g, b, a, drag, rot: Math.random() * 6.28 }); this.dirty.add(this.puffs);
  }
  glow(x, y, z, size, life, r, g, b, a = 1) { const it = this.glows.take(); Object.assign(it, { x, y, z, size, life, max: life, r, g, b, a, rot: Math.random() * 6.28 }); this.dirty.add(this.glows); }
  tracer(sx, sy, sz, ex, ey, ez, r, g, b, speed = 320, len = 3.4, w = 0.022) {
    const dx = ex - sx, dy = ey - sy, dz = ez - sz, L = Math.hypot(dx, dy, dz); if (L < 1) return;
    const it = this.tracers.take(); Object.assign(it, { sx, sy, sz, dx: dx / L, dy: dy / L, dz: dz / L, L, d: Math.min(L * 0.15, 6), speed, len, w, r, g, b }); this.dirty.add(this.tracers);
  }
  decal(x, y, z, nx, ny, nz, size, color = 0xffffff) {
    const it = this.decals.take(); _p.set(x + nx * 0.012, y + ny * 0.012, z + nz * 0.012); _d.set(nx, ny, nz);
    _q.setFromUnitVectors(_z, _d); _q2.setFromAxisAngle(_z, Math.random() * 6.28); _q.multiply(_q2);
    _m.compose(_p, _q, _s.set(size, size, size)); this.decals.mesh.setMatrixAt(it.i, _m); this.decals.mesh.setColorAt(it.i, _c.set(color)); this.decals.mesh.instanceColor.needsUpdate = true; this.dirty.add(this.decals);
  }
  scorchMark(x, y, z, size) { const it = this.scorch.take(); _q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2); _q2.setFromAxisAngle(_z, Math.random() * 6.28); _q.multiply(_q2); _m.compose(_p.set(x, y + 0.02, z), _q, _s.set(size, size, size)); this.scorch.mesh.setMatrixAt(it.i, _m); this.dirty.add(this.scorch); }
  shell(x, y, z, vx, vy, vz, onBounce) { const it = this.shells.take(); Object.assign(it, { x, y, z, vx, vy, vz, life: 1.6, rx: 0, ry: Math.random() * 6, sp: 25 + Math.random() * 20, b: 0, onBounce }); this.dirty.add(this.shells); }

  // Surface-specific bullet impact: decal + debris + dust + sparks.
  impact(x, y, z, nx, ny, nz, surf, big = 1) {
    const R = Math.random, n = big;
    const spray = (k, sp, up) => [nx * sp + (R() - 0.5) * sp * k, ny * sp + (R() - 0.2) * sp * k + up, nz * sp + (R() - 0.5) * sp * k];
    switch (surf) {
      case 'metal':
        for (let i = 0; i < 7 * n; i++) { const v = spray(1.4, 6 + R() * 6, 1); this.spark(x, y, z, v[0], v[1], v[2], 0.25 + R() * 0.3, 4, 2.6, 1.2); }
        this.puff(x, y, z, nx * 0.6, 0.3, nz * 0.6, 0.18, 0.6, 0.5, 0.5, 0.5, 0.5, 0.35);
        this.glow(x + nx * 0.05, y + ny * 0.05, z + nz * 0.05, 0.35, 0.06, 1.6, 1.2, 0.8);
        this.decal(x, y, z, nx, ny, nz, 0.09, 0xb0b0b0); break;
      case 'wood':
        for (let i = 0; i < 6 * n; i++) { const v = spray(1.2, 2.5 + R() * 2, 1.5); this.chip(x, y, z, v[0], v[1], v[2], 0.02 + R() * 0.03, 0x7a5a38); }
        this.puff(x, y, z, nx * 0.8, 0.2, nz * 0.8, 0.22, 0.9, 0.7, 0.55, 0.45, 0.32, 0.5);
        this.decal(x, y, z, nx, ny, nz, 0.1, 0xd8c0a0); break;
      case 'dirt':
        for (let i = 0; i < 5 * n; i++) { const v = spray(1.0, 2 + R() * 2.5, 2); this.chip(x, y, z, v[0], v[1], v[2], 0.025 + R() * 0.03, 0x3a3024); }
        this.puff(x, y, z, nx * 0.5, 1.0, nz * 0.5, 0.3, 1.4, 1.0, 0.36, 0.3, 0.24, 0.65);
        this.puff(x, y, z, nx * 0.2, 0.5, nz * 0.2, 0.2, 0.8, 0.6, 0.3, 0.26, 0.2, 0.5); break;
      case 'water':
        for (let i = 0; i < 10; i++) this.chip(x, y, z, (R() - 0.5) * 1.6, 3 + R() * 3, (R() - 0.5) * 1.6, 0.02, 0xc8d8e8, 0.8);
        this.puff(x, y, z, 0, 1.6, 0, 0.25, 1.0, 0.6, 0.7, 0.75, 0.8, 0.5); break;
      case 'glass':
        for (let i = 0; i < 8; i++) { const v = spray(1.6, 3 + R() * 2, 0.5); this.chip(x, y, z, v[0], v[1], v[2], 0.015 + R() * 0.02, 0xb8d8e8, 1.0); }
        this.decal(x, y, z, nx, ny, nz, 0.12, 0xffffff); break;
      case 'cloth':
        this.puff(x, y, z, nx * 0.8, 0.4, nz * 0.8, 0.25, 1.1, 0.8, 0.6, 0.54, 0.4, 0.6);
        for (let i = 0; i < 4; i++) { const v = spray(1, 2, 1); this.chip(x, y, z, v[0], v[1], v[2], 0.015, 0xb8a070, 0.8); } break;
      case 'flesh':
        if (settings.hitPuffs !== false) { this.puff(x, y, z, nx * 0.6, 0.2, nz * 0.6, 0.16, 0.7, 0.32, 0.38, 0.05, 0.04, 0.55, 3); this.puff(x, y, z, -nx * 0.5, 0.1, -nz * 0.5, 0.12, 0.5, 0.28, 0.3, 0.04, 0.03, 0.45, 3); }
        break;
      case 'armor':
        for (let i = 0; i < 6; i++) { const v = spray(1.6, 4 + R() * 4, 1); this.spark(x, y, z, v[0], v[1], v[2], 0.18 + R() * 0.2, 4, 3, 2); }
        this.glow(x, y, z, 0.4, 0.07, 2, 1.8, 1.4); break;
      case 'robot':
        for (let i = 0; i < 9; i++) { const v = spray(1.8, 5 + R() * 5, 1); this.spark(x, y, z, v[0], v[1], v[2], 0.3 + R() * 0.3, 4, 2.2, 0.8); }
        this.puff(x, y, z, nx * 0.4, 0.5, nz * 0.4, 0.22, 0.8, 0.8, 0.12, 0.12, 0.12, 0.6); break;
      default: // concrete / brick / plaster / asphalt
        for (let i = 0; i < 5 * n; i++) { const v = spray(1.3, 2.5 + R() * 3, 1.5); this.chip(x, y, z, v[0], v[1], v[2], 0.015 + R() * 0.03, 0x8a8680); }
        for (let i = 0; i < 2; i++) { const v = spray(1.2, 7, 0.5); this.spark(x, y, z, v[0], v[1], v[2], 0.08 + R() * 0.08, 2.4, 1.6, 0.9, 0.01, 0.1); }
        this.puff(x, y, z, nx * 0.9, 0.35, nz * 0.9, 0.22, 1.1, 0.8, 0.62, 0.6, 0.56, 0.6);
        this.puff(x, y, z, nx * 0.3, 0.6, nz * 0.3, 0.14, 0.8, 1.2, 0.55, 0.54, 0.5, 0.35);
        this.decal(x, y, z, nx, ny, nz, 0.1, 0xffffff);
    }
  }
  explosion(x, y, z, scale = 1) {
    const R = Math.random;
    this.glow(x, y + 0.5, z, 7 * scale, 0.22, 3, 2.2, 1.2);
    this.glow(x, y + 0.8, z, 4 * scale, 0.4, 2.2, 1.2, 0.4);
    for (let i = 0; i < 14; i++) { const a = R() * 6.28, sp = 2 + R() * 5; this.puff(x, y + 0.4, z, Math.cos(a) * sp, 1.5 + R() * 4, Math.sin(a) * sp, 0.9 * scale, 2.6 * scale, 1.6 + R() * 1.5, 0.22, 0.2, 0.18, 0.75, 2.2); }
    for (let i = 0; i < 6; i++) { this.puff(x, y + 0.5, z, (R() - 0.5) * 3, 2 + R() * 2, (R() - 0.5) * 3, 0.8 * scale, 1.6, 0.45, 1.0, 0.55, 0.2, 0.9, 3); }
    for (let i = 0; i < 26; i++) { const a = R() * 6.28, e = R() * 1.2, sp = 8 + R() * 14; this.spark(x, y + 0.3, z, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp + 3, Math.sin(a) * Math.cos(e) * sp, 0.5 + R() * 0.6, 4, 2.2, 0.8, 0.03, 0.4, 12); }
    for (let i = 0; i < 14; i++) { const a = R() * 6.28, sp = 4 + R() * 6; this.chip(x, y + 0.3, z, Math.cos(a) * sp, 4 + R() * 6, Math.sin(a) * sp, 0.04 + R() * 0.05, 0x2a2622, 2.5); }
    this.scorchMark(x, y, z, 3.6 * scale);
  }
  smokeBurst(x, y, z, r = 1) { for (let i = 0; i < 3; i++) this.puff(x + (Math.random() - 0.5) * r, y + Math.random() * r * 0.6, z + (Math.random() - 0.5) * r, (Math.random() - 0.5) * 0.6, 0.25 + Math.random() * 0.3, (Math.random() - 0.5) * 0.6, 1.6 + Math.random(), 1.6, 5 + Math.random() * 3, 0.82, 0.84, 0.86, 0.85, 0.6); }

  update(dt) {
    const cam = this.camera; const cq = cam.quaternion; const world = this.world;
    // sparks
    for (const it of this.sparks.items) {
      if (!it.alive) continue; it.life -= dt; if (it.life <= 0) { this._hide(this.sparks, it); this.sparks.setCol(it.i, 0, 0, 0, 0); continue; }
      it.vy -= it.grav * dt; it.x += it.vx * dt; it.y += it.vy * dt; it.z += it.vz * dt;
      const sp = Math.hypot(it.vx, it.vy, it.vz) + 1e-4; _d.set(it.vx / sp, it.vy / sp, it.vz / sp);
      _q.setFromUnitVectors(_z, _d); const k = it.life / it.max;
      _m.compose(_p.set(it.x, it.y, it.z), _q, _s.set(it.w, it.w, it.len * (0.4 + Math.min(1, sp / 10)))); this.sparks.mesh.setMatrixAt(it.i, _m);
      this.sparks.setCol(it.i, it.r * k, it.g * k * k, it.b * k * k * k, 1);
    }
    // chips (bounce on floor)
    for (const it of this.chips.items) {
      if (!it.alive) continue; it.life -= dt; if (it.life <= 0) { this._hide(this.chips, it); continue; }
      if (!it.rest) {
        it.vy -= 16 * dt; it.x += it.vx * dt; it.y += it.vy * dt; it.z += it.vz * dt; it.rx += it.sp * dt; it.ry += it.sp * 0.7 * dt;
        const fy = world.floorAt(it.x, it.z, 0.05, it.y + 0.2, 0.3);
        if (it.y < fy) { it.y = fy; if (Math.abs(it.vy) < 1.2) it.rest = true; it.vy *= -0.3; it.vx *= 0.5; it.vz *= 0.5; it.sp *= 0.5; }
      }
      const s = it.size * Math.min(1, it.life * 2);
      _q.setFromEuler(_e.set(it.rx, it.ry, 0)); _m.compose(_p.set(it.x, it.y + s * 0.5, it.z), _q, _s.set(s, s * 0.7, s)); this.chips.mesh.setMatrixAt(it.i, _m);
    }
    // puffs
    for (const it of this.puffs.items) {
      if (!it.alive) continue; it.life -= dt; if (it.life <= 0) { this._hide(this.puffs, it); this.puffs.setCol(it.i, 0, 0, 0, 0); continue; }
      const dr = Math.exp(-it.drag * dt); it.vx *= dr; it.vy = it.vy * dr + 0.12 * dt; it.vz *= dr; it.x += it.vx * dt; it.y += it.vy * dt; it.z += it.vz * dt;
      it.size += it.grow * dt * (it.life / it.max + 0.2); it.rot += dt * 0.3;
      _q2.setFromAxisAngle(_z, it.rot); _q.copy(cq).multiply(_q2);
      _m.compose(_p.set(it.x, it.y, it.z), _q, _s.set(it.size, it.size, it.size)); this.puffs.mesh.setMatrixAt(it.i, _m);
      const t = 1 - it.life / it.max; const fade = Math.min(1, t * 8) * (1 - t) * (1 - t);
      this.puffs.setCol(it.i, it.r, it.g, it.b, it.a * fade);
    }
    // glows
    for (const it of this.glows.items) {
      if (!it.alive) continue; it.life -= dt; if (it.life <= 0) { this._hide(this.glows, it); this.glows.setCol(it.i, 0, 0, 0, 0); continue; }
      const k = it.life / it.max; _q2.setFromAxisAngle(_z, it.rot); _q.copy(cq).multiply(_q2);
      const s = it.size * (0.7 + 0.3 * k); _m.compose(_p.set(it.x, it.y, it.z), _q, _s.set(s, s, s)); this.glows.mesh.setMatrixAt(it.i, _m);
      this.glows.setCol(it.i, it.r, it.g, it.b, it.a * k);
    }
    // tracers
    for (const it of this.tracers.items) {
      if (!it.alive) continue; it.d += it.speed * dt;
      if (it.d - it.len > it.L) { this._hide(this.tracers, it); this.tracers.setCol(it.i, 0, 0, 0, 0); continue; }
      const head = Math.min(it.d, it.L), tail = Math.max(0, it.d - it.len), len = head - tail; if (len <= 0.01) continue;
      _d.set(it.dx, it.dy, it.dz); _q.setFromUnitVectors(_z, _d.negate());
      _m.compose(_p.set(it.sx + it.dx * tail, it.sy + it.dy * tail, it.sz + it.dz * tail), _q, _s.set(it.w, it.w, len)); this.tracers.mesh.setMatrixAt(it.i, _m);
      this.tracers.setCol(it.i, it.r, it.g, it.b, 1);
    }
    // shells
    for (const it of this.shells.items) {
      if (!it.alive) continue; it.life -= dt; if (it.life <= 0) { this._hide(this.shells, it); continue; }
      it.vy -= 14 * dt; it.x += it.vx * dt; it.y += it.vy * dt; it.z += it.vz * dt; it.rx += it.sp * dt;
      const fy = world.floorAt(it.x, it.z, 0.03, it.y + 0.2, 0.3);
      if (it.y < fy + 0.006) { it.y = fy + 0.006; if (it.vy < -0.6) { it.b++; if (it.b <= 2) it.onBounce?.(it.x, it.y, it.z); } it.vy = Math.abs(it.vy) * 0.35; it.vx *= 0.6; it.vz *= 0.6; it.sp *= 0.6; }
      _q.setFromEuler(_e.set(it.rx, it.ry, 0)); _m.compose(_p.set(it.x, it.y, it.z), _q, _s.set(1, 1, 1)); this.shells.mesh.setMatrixAt(it.i, _m);
    }
    this.dirty.add(this.sparks).add(this.puffs).add(this.glows).add(this.tracers).add(this.chips).add(this.shells);
    for (const p of this.dirty) { p.mesh.instanceMatrix.needsUpdate = true; if (p.col) p.col.needsUpdate = true; }
    this.dirty.clear();
  }
  clear() { for (const p of [this.sparks, this.chips, this.puffs, this.glows, this.tracers, this.decals, this.scorch, this.shells]) { for (const it of p.items) { it.alive = false; p.mesh.setMatrixAt(it.i, HIDE); if (p.col) p.setCol(it.i, 0, 0, 0, 0); } p.mesh.instanceMatrix.needsUpdate = true; if (p.col) p.col.needsUpdate = true; } }
}
const _e = new THREE.Euler(), _c = new THREE.Color();
