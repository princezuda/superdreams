// Emberwake — pooled particles (one instanced draw per blend mode), flame cards, floating ambient embers.
import * as THREE from 'three/webgpu';
import { Fn, uv, vec4, vec3, float, attribute, instanceIndex, smoothstep } from 'three/tsl';
import { settings } from '/shared/sd-kit.js';
import { M } from './render.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();

class Pool {
  constructor(scene, n, additive) {
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    mat.colorNode = Fn(() => { const d = uv().sub(0.5).length().mul(2); const a = smoothstep(1.0, additive ? 0.0 : 0.35, d); return vec4(vec3(additive ? 1.6 : 1.0).mul(a), a); })();
    mat.fog = false;
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, n);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 10;
    for (let i = 0; i < n; i++) { this.mesh.setColorAt(i, _c.set(0, 0, 0)); _m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, _m); }
    scene.add(this.mesh);
    this.ps = Array.from({ length: n }, () => ({ life: 0 })); this.i = 0; this.n = n;
  }
  spawn(o) { const p = this.ps[this.i]; this.i = (this.i + 1) % this.n; Object.assign(p, { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, g: 0, drag: 0, size: 0.15, size1: null, life: 1, max: 1, col: '#ffffff', spin: 0 }, o); p.max = p.life; p.c = new THREE.Color(p.col); return p; }
  update(dt, camQuat) {
    for (let i = 0; i < this.n; i++) {
      const p = this.ps[i];
      if (p.life <= 0) { if (p.dead !== true) { _m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, _m); p.dead = true; } continue; }
      p.dead = false; p.life -= dt;
      p.vy -= p.g * dt; const dr = Math.exp(-p.drag * dt); p.vx *= dr; p.vy *= dr; p.vz *= dr;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const k = Math.max(0, p.life / p.max), s = (p.size1 != null ? p.size1 + (p.size - p.size1) * k : p.size) * (k < 0.2 ? k / 0.2 : 1);
      _m.compose(_p.set(p.x, p.y, p.z), camQuat, _s.set(s, s, s)); this.mesh.setMatrixAt(i, _m);
      _c.copy(p.c).multiplyScalar(Math.min(1, k * 1.5)); this.mesh.setColorAt(i, _c);
    }
    this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

export class FX {
  constructor(scene) {
    this.scene = scene; this.add = new Pool(scene, 420, true); this.dark = new Pool(scene, 160, false);
    this.flameMesh = null; this.ambient = []; this.ambientKind = null; this.t = 0;
  }
  // flames: [[x,y,z,scale,tag]] → one merged card mesh (each card gets a seed attribute for its own flicker)
  setFlames(list) {
    if (this.flameMesh) { this.scene.remove(this.flameMesh); this.flameMesh.geometry.dispose(); this.flameMesh = null; }
    if (!list.length) return;
    const pos = [], uvs = [], seeds = [], cols = [];
    for (const [x, y, z, s] of list) { const w = 0.42 * s, h = 0.7 * s, sd = Math.random() * 10; const v = [[x - w / 2, y, z], [x + w / 2, y, z], [x + w / 2, y + h, z], [x - w / 2, y + h, z]]; for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(...v[i]); uvs.push(i === 1 || i === 2 ? 1 : 0, i >= 2 ? 1 : 0); seeds.push(sd); cols.push(1, 1, 1); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setAttribute('seed', new THREE.Float32BufferAttribute(seeds, 1)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    this.flameMesh = new THREE.Mesh(g, M.flame); this.flameMesh.renderOrder = 6; this.flameMesh.frustumCulled = false; this.scene.add(this.flameMesh);
  }
  setFlameScale(k) { if (this.flameMesh) this.flameMesh.scale.setScalar(1); this.flameGain = k; }
  // ambient motes: embers (towns), fireflies (caves), sparkles (grotto), ash (spire)
  setAmbient(kind, area) { this.ambientKind = kind; this.area = area; this.amb = 0; }
  burst(kind, x, y, z, n = 16, o = {}) {
    if (settings.reducedMotion) n = Math.ceil(n / 3);
    const R = Math.random;
    const C = { fire: ['#ffb040', '#ff6a20', '#ffe080'], frost: ['#9fe8ff', '#e0fbff', '#6ac0ff'], bolt: ['#fff060', '#ffffff', '#ffd040'], blade: ['#ffffff', '#e8eef8', '#c8d8ff'], blunt: ['#e8c898', '#c8a070', '#ffffff'], pierce: ['#c8ffe0', '#ffffff', '#8ff0c0'],
      heal: ['#8affb0', '#e0ffe8', '#5ae0a0'], gold: ['#ffe080', '#ffc040', '#fff0c0'], shard: ['#ffd27a', '#ff9a3a', '#fff0c0'], break: ['#ffffff', '#ffd27a', '#ff7a3a'], shadow: ['#2a2040', '#3a2a5a', '#14101e'], dust: ['#c8b8a0', '#a89880'], crystal: ['#7fe8ff', '#b08cff', '#ffffff'] }[kind] || ['#ffffff'];
    const dark = kind === 'shadow' || kind === 'dust';
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, sp = (o.speed ?? 2.5) * (0.4 + R() * 0.8), up = o.up ?? 1.5;
      (dark ? this.dark : this.add).spawn({ x: x + (R() - 0.5) * (o.spread ?? 0.3), y: y + (R() - 0.5) * (o.spread ?? 0.3), z: z + (R() - 0.5) * 0.3, vx: Math.cos(a) * sp, vy: up * (0.5 + R()) + (o.vy ?? 0), vz: Math.sin(a) * sp * 0.5, g: o.g ?? 3, drag: o.drag ?? 2.2, size: (o.size ?? 0.14) * (0.6 + R() * 0.8), life: (o.life ?? 0.7) * (0.6 + R() * 0.7), col: C[(R() * C.length) | 0] });
    }
  }
  ring(kind, x, y, z, r = 1, n = 24) { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; this.add.spawn({ x: x + Math.cos(a) * r * 0.3, y, z: z + Math.sin(a) * r * 0.3, vx: Math.cos(a) * r * 3, vy: 0.4, vz: Math.sin(a) * r * 1.4, drag: 3.5, size: 0.16, life: 0.6, col: kind === 'heal' ? '#8affb0' : '#ffd27a' }); } }
  update(dt, camera, center) {
    this.t += dt;
    if (this.ambientKind && center && !settings.reducedMotion) {
      this.amb += dt * { embers: 9, fireflies: 5, sparkles: 6, ash: 8, dawn: 6 }[this.ambientKind];
      while (this.amb > 1) {
        this.amb--; const R = Math.random, x = center.x + (R() - 0.5) * 22, z = center.z + (R() - 0.5) * 16 - 2;
        const k = this.ambientKind;
        if (k === 'embers') this.add.spawn({ x, y: R() * 1.5, z, vx: (R() - 0.5) * 0.3, vy: 0.35 + R() * 0.4, vz: 0, size: 0.06, life: 4 + R() * 3, col: R() < 0.5 ? '#ffb040' : '#ff7a2a' });
        else if (k === 'fireflies') this.add.spawn({ x, y: 0.3 + R() * 1.8, z, vx: (R() - 0.5) * 0.4, vy: (R() - 0.5) * 0.2, vz: (R() - 0.5) * 0.3, size: 0.07, life: 3 + R() * 3, col: R() < 0.6 ? '#9affc0' : '#ffe08a' });
        else if (k === 'sparkles') this.add.spawn({ x, y: 0.2 + R() * 2.5, z, vx: 0, vy: 0.08, vz: 0, size: 0.05, life: 1.5 + R() * 2, col: R() < 0.5 ? '#8ff0ff' : '#c8a0ff' });
        else if (k === 'ash') this.dark.spawn({ x, y: 2 + R() * 4, z, vx: 0.4 + R() * 0.3, vy: -0.2 - R() * 0.2, vz: 0, size: 0.05, life: 5, col: '#3a3448' });
        else if (k === 'dawn') this.add.spawn({ x, y: R() * 3, z, vx: (R() - 0.5) * 0.2, vy: 0.15, vz: 0, size: 0.05, life: 4, col: '#fff0c0' });
      }
    }
    this.add.update(dt, camera.quaternion); this.dark.update(dt, camera.quaternion);
  }
}
