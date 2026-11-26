// Pooled camera-facing particles (one InstancedMesh per blend mode) + seasonal weather.
import * as THREE from 'three/webgpu';
import { attribute, float, uv, smoothstep, length, vec2 } from 'three/tsl';

export class Particles {
  constructor(parent, { count = 260, additive = false, soft = 1 } = {}) {
    this.n = count; this.p = []; this.free = [];
    const geo = new THREE.PlaneGeometry(1, 1);
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(count), 1); this.alpha.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aAlpha', this.alpha);
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: !additive });
    const d = length(uv().sub(vec2(0.5)));
    mat.opacityNode = attribute('aAlpha').mul(smoothstep(0.5, 0.5 - 0.42 * soft, d));
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = additive ? 12 : 11;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const c = new THREE.Color(1, 1, 1); for (let i = 0; i < count; i++) { this.mesh.setColorAt(i, c); this.free.push(i); this.p.push(null); }
    this.mesh.count = count; parent.add(this.mesh);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._c = new THREE.Color(); this._v = new THREE.Vector3();
    this.hideAll();
  }
  hideAll() { for (let i = 0; i < this.n; i++) { this.alpha.array[i] = 0; this.mesh.setMatrixAt(i, this._m.makeScale(0, 0, 0)); } this.alpha.needsUpdate = true; this.mesh.instanceMatrix.needsUpdate = true; }
  clear() { for (let i = 0; i < this.n; i++) if (this.p[i]) { this.p[i] = null; this.free.push(i); } this.hideAll(); }
  spawn(o) {
    if (!this.free.length) return null;
    const i = this.free.pop();
    const q = { x: o.x, y: o.y, z: o.z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, g: o.g || 0, drag: o.drag ?? 0.98, life: o.life ?? 1, t: 0, size: o.size ?? 0.1, grow: o.grow ?? 0, a: o.a ?? 1, fadeIn: o.fadeIn ?? 0.1, sway: o.sway || 0, ph: Math.random() * 6, spin: o.spin || 0, loop: o.loop || null };
    this.p[i] = q; this.mesh.setColorAt(i, this._c.set(o.color ?? '#ffffff')); this.mesh.instanceColor.needsUpdate = true;
    return q;
  }
  update(dt, cam) {
    this._q.copy(cam.quaternion);
    for (let i = 0; i < this.n; i++) {
      const q = this.p[i]; if (!q) continue;
      q.t += dt;
      if (q.t >= q.life) { if (q.loop) { q.loop(q); } else { this.p[i] = null; this.free.push(i); this.alpha.array[i] = 0; this.mesh.setMatrixAt(i, this._m.makeScale(0, 0, 0)); continue; } }
      q.vy -= q.g * dt; q.vx *= q.drag; q.vy *= q.drag; q.vz *= q.drag;
      q.x += (q.vx + Math.sin(q.t * 2 + q.ph) * q.sway) * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      const k = q.t / q.life, s = q.size * (1 + q.grow * k);
      this.alpha.array[i] = q.a * Math.min(1, q.t / Math.max(0.001, q.fadeIn)) * (1 - smooth(Math.max(0, (k - 0.6) / 0.4)));
      this._m.compose(this._v.set(q.x, q.y, q.z), this._q, this._s.set(s, s, s));
      this.mesh.setMatrixAt(i, this._m);
    }
    this.alpha.needsUpdate = true; this.mesh.instanceMatrix.needsUpdate = true;
  }
}
const smooth = (t) => t * t * (3 - 2 * t);

// seasonal weather: petals (spring), leaves (autumn), snow (winter) drifting through the frame
export function weather(P, kind, box, density = 1) {
  const cols = { petals: ['#ffd0de', '#ffe6ee', '#f7b0c8'], leaves: ['#e08a2a', '#c8502a', '#f0b040', '#a8402a'], snow: ['#ffffff', '#f0f6ff'] }[kind];
  if (!cols) return;
  const n = Math.round((kind === 'snow' ? 70 : 26) * density);
  const reset = (q, first) => {
    q.x = box[0] + Math.random() * (box[3] - box[0]); q.z = box[2] + Math.random() * (box[5] - box[2]);
    q.y = first ? box[1] + Math.random() * (box[4] - box[1]) : box[4];
    q.vy = kind === 'snow' ? -0.35 - Math.random() * 0.3 : -0.25 - Math.random() * 0.25; q.vx = 0.15 + Math.random() * 0.2; q.t = 0;
    q.life = (box[4] - box[1]) / -q.vy;
  };
  for (let i = 0; i < n; i++) {
    const q = P.spawn({ x: 0, y: 0, z: 0, size: kind === 'snow' ? 0.045 + Math.random() * 0.04 : 0.06 + Math.random() * 0.04, color: cols[i % cols.length], a: kind === 'snow' ? 0.9 : 0.95, drag: 1, sway: kind === 'snow' ? 0.25 : 0.6, fadeIn: 0.8, loop: (q2) => reset(q2, false) });
    if (q) reset(q, true);
  }
}
