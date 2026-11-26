// Pooled particle FX — 3 draw calls total: soft dust puffs, HDR sparks (bloom), flat shock rings. No per-frame allocation.
import { THREE, settings } from '/shared/sd-kit.js';
import { instancedBufferAttribute, uv, length, smoothstep, vec3, float, normalView, dot, abs } from 'three/tsl';

const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3(), E = new THREE.Euler(), FLAT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
export function createFX(scene) {
  const PN = 90, SN = 220, RN = 10;
  const pCol = new THREE.InstancedBufferAttribute(new Float32Array(PN * 3), 3); pCol.setUsage(THREE.DynamicDrawUsage);
  const pA = new THREE.InstancedBufferAttribute(new Float32Array(PN), 1); pA.setUsage(THREE.DynamicDrawUsage);
  const pMat = new THREE.MeshStandardNodeMaterial({ roughness: 1, transparent: true, depthWrite: false });
  pMat.colorNode = instancedBufferAttribute(pCol); pMat.emissiveNode = instancedBufferAttribute(pCol).mul(0.45);
  pMat.opacityNode = instancedBufferAttribute(pA).mul(smoothstep(0.0, 0.7, abs(dot(normalView, vec3(0, 0, 1))))); // soft silhouette edge
  const puffs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), pMat, PN); puffs.frustumCulled = false; puffs.count = 0; scene.add(puffs);
  const sCol = new THREE.InstancedBufferAttribute(new Float32Array(SN * 3), 3); sCol.setUsage(THREE.DynamicDrawUsage);
  const sMat = new THREE.MeshBasicNodeMaterial(); sMat.colorNode = instancedBufferAttribute(sCol);
  const sparks = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.08, 0), sMat, SN); sparks.frustumCulled = false; sparks.count = 0; scene.add(sparks);
  const rCol = new THREE.InstancedBufferAttribute(new Float32Array(RN * 3), 3); rCol.setUsage(THREE.DynamicDrawUsage);
  const rMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  { const d = length(uv().sub(0.5)).mul(2); rMat.colorNode = instancedBufferAttribute(rCol); rMat.opacityNode = smoothstep(0.72, 0.9, d).mul(smoothstep(1.0, 0.92, d)); }
  const rings = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2), rMat, RN); rings.frustumCulled = false; rings.count = 0; scene.add(rings);
  const P = Array.from({ length: PN }, () => ({ on: false })), Sp = Array.from({ length: SN }, () => ({ on: false })), Rg = Array.from({ length: RN }, () => ({ on: false }));
  let ph = 0, sh = 0, rh = 0; const tc = new THREE.Color();
  const fx = {
    meshes: [puffs, sparks, rings],
    puff(x, y, z, { n = 6, spread = 1, up = 1.2, size = 0.16, color = '#ffffff', life = 0.55, out = 2.2 } = {}) {
      if (settings.reducedMotion) n = Math.ceil(n / 2); tc.set(color);
      for (let i = 0; i < n; i++) { const p = P[ph = (ph + 1) % PN]; const a = Math.random() * 6.283, r = Math.random() * spread;
        Object.assign(p, { on: true, x: x + Math.cos(a) * r * 0.3, y, z: z + Math.sin(a) * r * 0.3, vx: Math.cos(a) * out * (0.5 + Math.random()), vy: up * (0.4 + Math.random()), vz: Math.sin(a) * out * (0.5 + Math.random()), t: 0, life: life * (0.7 + Math.random() * 0.6), s: size * (0.7 + Math.random() * 0.6), r: tc.r, g: tc.g, b: tc.b }); }
    },
    ringPuff(x, y, z, n = 12, sp = 4, color = '#ffffff', size = 0.26) { tc.set(color); for (let i = 0; i < n; i++) { const p = P[ph = (ph + 1) % PN]; const a = i / n * 6.283; Object.assign(p, { on: true, x, y, z, vx: Math.cos(a) * sp, vy: 0.6, vz: Math.sin(a) * sp, t: 0, life: 0.5, s: size, r: tc.r, g: tc.g, b: tc.b }); } },
    sparkle(x, y, z, { n = 10, color = '#ffd84a', speed = 3.5, life = 0.6, gain = 3, grav = 3 } = {}) {
      tc.set(color); for (let i = 0; i < n; i++) { const p = Sp[sh = (sh + 1) % SN]; const a = Math.random() * 6.283, e = Math.random() * Math.PI;
        Object.assign(p, { on: true, x, y, z, vx: Math.cos(a) * Math.sin(e) * speed, vy: Math.cos(e) * speed * 0.8 + speed * 0.4, vz: Math.sin(a) * Math.sin(e) * speed, t: 0, life: life * (0.6 + Math.random() * 0.6), r: tc.r * gain, g: tc.g * gain, b: tc.b * gain, grav, rot: Math.random() * 6 }); }
    },
    ring(x, y, z, { r0 = 0.4, r1 = 3, life = 0.4, color = '#ffffff', gain = 1.5 } = {}) { tc.set(color); const p = Rg[rh = (rh + 1) % RN]; Object.assign(p, { on: true, x, y, z, r0, r1, t: 0, life, r: tc.r * gain, g: tc.g * gain, b: tc.b * gain }); },
    update(dt) {
      let n = 0;
      for (const p of P) { if (!p.on) continue; p.t += dt; if (p.t >= p.life) { p.on = false; continue; } p.vx *= Math.pow(0.04, dt); p.vz *= Math.pow(0.04, dt); p.vy = p.vy * Math.pow(0.2, dt) + 0.4 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        const k = p.t / p.life, s = p.s * (0.55 + k * 0.9); M4.compose(V.set(p.x, p.y, p.z), Q.identity(), S.setScalar(Math.max(0.001, s))); puffs.setMatrixAt(n, M4); pCol.setXYZ(n, p.r, p.g, p.b); pA.setX(n, 0.75 * (1 - k) * Math.min(1, k * 8)); n++; }
      puffs.count = n; puffs.instanceMatrix.needsUpdate = true; pCol.needsUpdate = true; pA.needsUpdate = true;
      n = 0;
      for (const p of Sp) { if (!p.on) continue; p.t += dt; if (p.t >= p.life) { p.on = false; continue; } p.vy -= p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.rot += dt * 8;
        const k = 1 - p.t / p.life; M4.compose(V.set(p.x, p.y, p.z), Q.setFromEuler(E.set(p.rot, p.rot * 0.7, 0)), S.setScalar(k * 1.1 + 0.05)); sparks.setMatrixAt(n, M4); sCol.setXYZ(n, p.r, p.g, p.b); n++; }
      sparks.count = n; sparks.instanceMatrix.needsUpdate = true; sCol.needsUpdate = true;
      n = 0;
      for (const p of Rg) { if (!p.on) continue; p.t += dt; if (p.t >= p.life) { p.on = false; continue; } const k = p.t / p.life, r = p.r0 + (p.r1 - p.r0) * (1 - Math.pow(1 - k, 2.2)), f = 1 - k;
        M4.compose(V.set(p.x, p.y, p.z), FLAT, S.set(r, r, 1)); rings.setMatrixAt(n, M4); rCol.setXYZ(n, p.r * f, p.g * f, p.b * f); n++; }
      rings.count = n; rings.instanceMatrix.needsUpdate = true; rCol.needsUpdate = true;
    },
    clear() { for (const a of [P, Sp, Rg]) for (const p of a) p.on = false; },
  };
  void vec3; void float;
  return fx;
}
