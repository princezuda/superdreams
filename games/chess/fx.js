// Chess: Worlds — capture effects. Two pooled InstancedMeshes (lit chunks, additive sparks) + one shock ring,
// one flash sphere and one vortex disc are shared by every effect, so particles never cost more than 5 draw calls.
import * as THREE from 'three/webgpu';
import { uv, length, smoothstep, vec3, sin, atan, time, uniform, float, mix } from 'three/tsl';
import { tween, ease, sfx, shake, settings, flash } from '/shared/sd-kit.js';

const MAXC = 260, MAXS = 520;
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpS = new THREE.Vector3(), tmpC = new THREE.Color();

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.chunkMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.75, metalness: 0.05 });
    this.chunks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.chunkMat, MAXC);
    this.sparkMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.sparks = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), this.sparkMat, MAXS);
    for (const [mesh, n] of [[this.chunks, MAXC], [this.sparks, MAXS]]) {
      tmpM.makeScale(0, 0, 0);
      for (let i = 0; i < n; i++) { mesh.setMatrixAt(i, tmpM); mesh.setColorAt(i, tmpC.set(0, 0, 0)); }
      mesh.frustumCulled = false; mesh.count = 0; scene.add(mesh);
    }
    this.chunks.castShadow = true;
    this.c = []; this.s = [];
    // shock ring / flash sphere / wormhole vortex (reused)
    this.ringCol = uniform(new THREE.Color(1, 1, 1));
    const rm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const r = length(uv().sub(0.5)).mul(2);
    rm.colorNode = this.ringCol.mul(smoothstep(0.62, 0.86, r).mul(smoothstep(1.0, 0.88, r)));
    this.ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), rm); this.ring.rotation.x = -Math.PI / 2; this.ring.visible = false; scene.add(this.ring);
    this.flashCol = uniform(new THREE.Color(1, 1, 1));
    const fm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    fm.colorNode = this.flashCol;
    this.flashMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), fm); this.flashMesh.visible = false; scene.add(this.flashMesh);
    this.vortexCol = uniform(new THREE.Color(0.4, 0.8, 1.6));
    const vm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const q = uv().sub(0.5), vr = length(q).mul(2), va = atan(q.y, q.x);
    const swirl = sin(va.mul(3).add(vr.mul(14)).sub(time.mul(9))).mul(0.5).add(0.5);
    vm.colorNode = mix(vec3(0, 0, 0), this.vortexCol.mul(swirl.mul(1.5).add(0.3)), smoothstep(0.15, 0.85, vr));
    vm.opacityNode = smoothstep(1.0, 0.8, vr).mul(float(0.95));
    this.vortex = new THREE.Mesh(new THREE.CircleGeometry(0.5, 48), vm); this.vortex.rotation.x = -Math.PI / 2; this.vortex.visible = false; scene.add(this.vortex);
  }
  chunk(o) { if (this.c.length >= MAXC) this.c.shift(); this.c.push({ p: o.p.clone(), v: o.v.clone(), s: o.s, col: new THREE.Color(o.col), life: o.life ?? 1.6, t: 0, grav: o.grav ?? 9, spin: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6), rot: new THREE.Vector3(Math.random() * 3, Math.random() * 3, 0), floor: o.floor ?? 0, drag: o.drag ?? 0.2, sx: o.sx ?? 1, sy: o.sy ?? 1 }); }
  spark(o) { if (this.s.length >= MAXS) this.s.shift(); this.s.push({ p: o.p.clone(), v: o.v.clone(), s: o.s, col: new THREE.Color(o.col), life: o.life ?? 0.9, t: 0, grav: o.grav ?? 0, drag: o.drag ?? 1.5, swirl: o.swirl || null, grow: o.grow ?? 0 }); }
  update(dt) {
    let n = 0;
    for (let i = this.c.length - 1; i >= 0; i--) {
      const q = this.c[i]; q.t += dt;
      if (q.t >= q.life) { this.c.splice(i, 1); continue; }
      q.v.y -= q.grav * dt; q.v.multiplyScalar(Math.exp(-q.drag * dt)); q.p.addScaledVector(q.v, dt);
      if (q.p.y < q.floor + q.s * 0.5) { q.p.y = q.floor + q.s * 0.5; if (q.v.y < 0) q.v.y *= -0.35; q.v.x *= 0.7; q.v.z *= 0.7; q.spin.multiplyScalar(0.7); }
      q.rot.addScaledVector(q.spin, dt);
    }
    for (const q of this.c) { const k = Math.min(1, (q.life - q.t) / 0.35); tmpM.compose(q.p, tmpQ.setFromEuler(tmpE.set(q.rot.x, q.rot.y, q.rot.z)), tmpS.set(q.s * q.sx * k, q.s * q.sy * k, q.s * k)); this.chunks.setMatrixAt(n, tmpM); this.chunks.setColorAt(n, q.col); n++; }
    this.chunks.count = n; this.chunks.instanceMatrix.needsUpdate = true; if (this.chunks.instanceColor) this.chunks.instanceColor.needsUpdate = true;
    n = 0;
    for (let i = this.s.length - 1; i >= 0; i--) {
      const q = this.s[i]; q.t += dt;
      if (q.t >= q.life) { this.s.splice(i, 1); continue; }
      if (q.swirl) { // spiral toward a centre (wormhole / magic)
        const c = q.swirl.c, dx = q.p.x - c.x, dz = q.p.z - c.z, rr = Math.hypot(dx, dz) || 1e-3;
        q.v.x += (-dz / rr * q.swirl.spin - dx / rr * q.swirl.pull) * dt; q.v.z += (dx / rr * q.swirl.spin - dz / rr * q.swirl.pull) * dt; q.v.y += (q.swirl.lift ?? 0) * dt;
      }
      q.v.y -= q.grav * dt; q.v.multiplyScalar(Math.exp(-q.drag * dt)); q.p.addScaledVector(q.v, dt);
    }
    for (const q of this.s) { const life = 1 - q.t / q.life, k = Math.min(1, life * 2.5) * Math.min(1, q.t * 20); const sc = q.s * (1 + q.grow * (q.t / q.life)); tmpM.compose(q.p, tmpQ.setFromEuler(tmpE.set(q.t * 3, q.t * 4, 0)), tmpS.set(sc, sc, sc)); this.sparks.setMatrixAt(n, tmpM); this.sparks.setColorAt(n, tmpC.copy(q.col).multiplyScalar(k)); n++; }
    this.sparks.count = n; this.sparks.instanceMatrix.needsUpdate = true; if (this.sparks.instanceColor) this.sparks.instanceColor.needsUpdate = true;
  }
  busy() { return this.c.length + this.s.length; }
}

// random point on a piece's surface in world space (for voxel/rubble spawning)
function surfacePoint(mesh, out) {
  const pos = mesh.geometry.attributes.position, i = (Math.random() * pos.count) | 0;
  return out.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
}
const rnd = (a = 1) => (Math.random() - 0.5) * 2 * a;

// Plays the capture effect on `mesh` (the captured piece). Resolves once the piece is gone; caller re-homes it.
// FABLE: richer per-theme capture choreography (anticipation pose, the capturer "striking", hit-stop, camera punch-in).
export async function playCapture(kind, fx, mesh, { body = '#ffffff', glow = '#ffffff', accent = '#ffcc66' } = {}) {
  mesh.updateMatrixWorld(true);
  const p0 = mesh.position.clone(), v = new THREE.Vector3(), lite = settings.reducedMotion;
  const bodyC = new THREE.Color(body), glowC = new THREE.Color(glow);
  if (kind === 'dust') { // Classic: the piece is knocked over, wood splinters and a puff of chalk dust
    sfx.capture(); shake(0.05);
    for (let i = 0; i < (lite ? 6 : 14); i++) fx.chunk({ p: surfacePoint(mesh, v), v: new THREE.Vector3(rnd(1.6), 1 + Math.random() * 2, rnd(1.6)), s: 0.035 + Math.random() * 0.04, sx: 0.4, sy: 2.4, col: bodyC.clone().multiplyScalar(0.8 + Math.random() * 0.3), life: 1.2 + Math.random() * 0.5 });
    for (let i = 0; i < (lite ? 8 : 22); i++) fx.spark({ p: p0.clone().add(new THREE.Vector3(rnd(0.25), 0.05 + Math.random() * 0.4, rnd(0.25))), v: new THREE.Vector3(rnd(0.9), 0.3 + Math.random() * 0.6, rnd(0.9)), s: 0.05 + Math.random() * 0.05, grow: 2, col: new THREE.Color(0.32, 0.27, 0.2), life: 0.9 + Math.random() * 0.4, drag: 2.5 });
    const dir = Math.random() < 0.5 ? -1 : 1;
    await tween(0.42, (k) => { mesh.rotation.z = dir * k * 1.45; mesh.position.y = p0.y + Math.sin(k * Math.PI) * 0.2; mesh.position.x = p0.x + dir * -k * 0.35; }, { ease: ease.inQuad });
    sfx.thud();
    await tween(0.22, (k) => mesh.scale.setScalar(1 - k), { ease: ease.inQuad });
  } else if (kind === 'wormhole') { // Space: a wormhole opens under the ship and swallows it
    sfx.suck(); fx.vortexCol.value.set(glowC.r * 1.2, glowC.g * 1.2, glowC.b * 1.2);
    fx.vortex.visible = true; fx.vortex.position.set(p0.x, 0.02, p0.z); fx.vortex.scale.setScalar(0.01);
    await tween(0.3, (k) => fx.vortex.scale.setScalar(k * 1.5), { ease: ease.outBack });
    for (let i = 0; i < (lite ? 10 : 40); i++) { const a = Math.random() * 6.28, r = 0.6 + Math.random() * 0.4; fx.spark({ p: new THREE.Vector3(p0.x + Math.cos(a) * r, 0.05 + Math.random() * 0.9, p0.z + Math.sin(a) * r), v: new THREE.Vector3(0, -0.4, 0), s: 0.025 + Math.random() * 0.02, col: glowC.clone().multiplyScalar(2.5), life: 0.9, drag: 0.5, swirl: { c: p0, spin: 6, pull: 4, lift: -0.6 } }); }
    const r0 = mesh.rotation.y;
    await tween(0.75, (k) => { mesh.rotation.y = r0 + k * k * 14; mesh.scale.set(1 - k * 0.9, 1 - k, 1 - k * 0.9); mesh.position.y = p0.y - k * k * 0.5; }, { ease: ease.inQuad });
    mesh.scale.setScalar(0.001); shake(0.06);
    fx.flashCol.value.copy(glowC).multiplyScalar(3); fx.flashMesh.visible = true; fx.flashMesh.position.set(p0.x, 0.15, p0.z);
    await tween(0.3, (k) => { fx.vortex.scale.setScalar(1.5 * (1 - k)); fx.flashMesh.scale.setScalar(0.05 + k * 0.4); fx.flashCol.value.copy(glowC).multiplyScalar(3 * (1 - k)); });
    fx.vortex.visible = false; fx.flashMesh.visible = false;
  } else if (kind === 'supernova') { // Galaxy: the body swells, then detonates in a supernova
    await tween(0.22, (k) => mesh.scale.setScalar(1 + k * 0.3), { ease: ease.outCubic });
    sfx.zap(); sfx.thud(); shake(0.14); flash('rgba(255,230,200,.35)', 180);
    mesh.scale.setScalar(0.001);
    const c = p0.clone().setY(0.7);
    for (let i = 0; i < (lite ? 20 : 70); i++) { const d = new THREE.Vector3(rnd(), rnd() * 0.7, rnd()).normalize().multiplyScalar(2 + Math.random() * 4); fx.spark({ p: c.clone(), v: d, s: 0.02 + Math.random() * 0.035, col: (Math.random() < 0.5 ? glowC : new THREE.Color(1, 0.9, 0.7)).clone().multiplyScalar(3), life: 0.7 + Math.random() * 0.6, drag: 2.4 }); }
    fx.flashMesh.visible = true; fx.flashMesh.position.copy(c); fx.ring.visible = true; fx.ring.position.set(c.x, 0.05, c.z);
    await tween(0.65, (k) => { fx.flashMesh.scale.setScalar(0.1 + k * 1.1); fx.flashCol.value.set(4, 3.2, 2.4).multiplyScalar(Math.pow(1 - k, 2)); fx.ring.scale.setScalar(0.3 + k * 4.5); fx.ringCol.value.copy(glowC).multiplyScalar(3 * (1 - k)); }, { ease: ease.outCubic });
    fx.flashMesh.visible = false; fx.ring.visible = false;
  } else if (kind === 'derez') { // Sci-Fi: glitch, then de-resolve into voxels that drift up
    sfx.zap();
    const s0 = mesh.scale.clone();
    await tween(0.3, (k) => { const j = Math.random() < 0.5 ? 1 : 0.85 + Math.random() * 0.3; mesh.scale.set(s0.x * (1 + rnd(0.05)), s0.y * j, s0.z * (1 + rnd(0.05))); mesh.position.x = p0.x + rnd(0.03) * (1 - k); });
    sfx.capture(); shake(0.05);
    for (let i = 0; i < (lite ? 20 : 70); i++) { const sp = surfacePoint(mesh, v).clone(); sp.x = Math.round(sp.x * 14) / 14; sp.y = Math.round(sp.y * 14) / 14; sp.z = Math.round(sp.z * 14) / 14; fx.chunk({ p: sp, v: new THREE.Vector3(rnd(0.3), 0.4 + Math.random() * 1.2, rnd(0.3)), s: 0.055, col: Math.random() < 0.3 ? glowC.clone().multiplyScalar(2) : bodyC, grav: -0.5, drag: 0.6, life: 0.9 + Math.random() * 0.9 }); }
    await tween(0.25, (k) => mesh.scale.set(s0.x * (1 - k), s0.y * (1 - k) + 0.001, s0.z * (1 - k)), { ease: ease.inQuad });
    fx.ring.visible = true; fx.ring.position.set(p0.x, 0.03, p0.z); fx.ringCol.value.copy(glowC).multiplyScalar(2);
    await tween(0.35, (k) => { fx.ring.scale.setScalar(0.6 + k * 0.8); fx.ringCol.value.copy(glowC).multiplyScalar(2 * (1 - k)); });
    fx.ring.visible = false;
  } else if (kind === 'crumble') { // Fantasy: the stone figure cracks and collapses into rubble
    const s0 = mesh.scale.clone();
    await tween(0.28, (k) => { mesh.position.x = p0.x + rnd(0.04) * k; mesh.position.z = p0.z + rnd(0.04) * k; });
    sfx.thud(); sfx.capture(); shake(0.12);
    for (let i = 0; i < (lite ? 8 : 22); i++) fx.chunk({ p: surfacePoint(mesh, v), v: new THREE.Vector3(rnd(1.4), Math.random() * 1.6, rnd(1.4)), s: 0.05 + Math.random() * 0.08, col: (Math.random() < 0.15 ? new THREE.Color(accent) : bodyC.clone().multiplyScalar(0.75 + Math.random() * 0.3)), life: 1.6 + Math.random() * 0.8, grav: 11 });
    for (let i = 0; i < (lite ? 6 : 16); i++) fx.spark({ p: p0.clone().add(new THREE.Vector3(rnd(0.3), 0.1, rnd(0.3))), v: new THREE.Vector3(rnd(0.6), 0.25 + Math.random() * 0.3, rnd(0.6)), s: 0.08, grow: 2.5, col: new THREE.Color(0.22, 0.2, 0.18), life: 1.1, drag: 2 });
    await tween(0.3, (k) => { mesh.scale.set(s0.x * (1 + k * 0.1), s0.y * (1 - k), s0.z * (1 + k * 0.1)); }, { ease: ease.inQuad });
    mesh.scale.setScalar(0.001);
  } else { // 'sparkle' — Magic: dissolve upward into a spiral of sparkles
    sfx.magic();
    for (let i = 0; i < (lite ? 15 : 55); i++) { const sp = surfacePoint(mesh, v).clone(); fx.spark({ p: sp, v: new THREE.Vector3(rnd(0.2), 0.6 + Math.random() * 0.8, rnd(0.2)), s: 0.018 + Math.random() * 0.025, col: (Math.random() < 0.5 ? glowC : new THREE.Color(accent)).clone().multiplyScalar(3), life: 1.0 + Math.random() * 0.8, drag: 0.8, swirl: { c: p0, spin: 3, pull: -0.4, lift: 0.4 } }); }
    const s0 = mesh.scale.clone();
    await tween(0.7, (k) => { mesh.position.y = p0.y + k * 0.45; mesh.scale.set(s0.x * (1 - k), s0.y * (1 - k * 0.6), s0.z * (1 - k)); mesh.rotation.y += 0.05; }, { ease: ease.inQuad });
    mesh.scale.setScalar(0.001); sfx.chime();
  }
}
