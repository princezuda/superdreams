// Starwake — pooled effects: additive billboard particles, laser bolts, tumbling debris, speed-line dust, flash lights, shield bubbles.
import { THREE } from '/shared/sd-kit.js';
import { Fn, vec3, float, pow, max, dot, normalize, abs, positionWorld, cameraPosition, normalWorld, smoothstep } from 'three/tsl';
import { TEX } from './art.js';

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _c = new THREE.Color(), _z = new THREE.Vector3(0, 0, 1), _d = new THREE.Vector3();

export class Particles {
  constructor(scene, max = 900) {
    this.max = max; this.n = 0;
    this.d = new Float32Array(max * 14); // px py pz vx vy vz life maxLife s0 s1 r g b drag
    const mat = new THREE.MeshBasicNodeMaterial({ map: TEX.glow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, max); this.mesh.frustumCulled = false;
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, _c.setRGB(0, 0, 0));
    this.mesh.count = 0; scene.add(this.mesh);
  }
  spawn(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, drag = 0) {
    if (this.n >= this.max) return;
    const o = this.n++ * 14, d = this.d;
    d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = vx; d[o + 4] = vy; d[o + 5] = vz; d[o + 6] = 0; d[o + 7] = life; d[o + 8] = s0; d[o + 9] = s1; d[o + 10] = r; d[o + 11] = g; d[o + 12] = b; d[o + 13] = drag;
  }
  burst(p, n, speed, life, s0, s1, col, base = null, drag = 1.5) {
    for (let i = 0; i < n; i++) {
      _d.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.3 + Math.random() * 0.7));
      if (base) _d.add(base);
      const l = life * (0.6 + Math.random() * 0.6);
      this.spawn(p.x, p.y, p.z, _d.x, _d.y, _d.z, l, s0 * (0.7 + Math.random() * 0.6), s1, col.r, col.g, col.b, drag);
    }
  }
  update(dt, camQuat) {
    const d = this.d; let i = 0;
    while (i < this.n) {
      const o = i * 14; d[o + 6] += dt;
      if (d[o + 6] >= d[o + 7]) { const last = (this.n - 1) * 14; for (let k = 0; k < 14; k++) d[o + k] = d[last + k]; this.n--; continue; }
      const k = Math.exp(-d[o + 13] * dt); d[o + 3] *= k; d[o + 4] *= k; d[o + 5] *= k;
      d[o] += d[o + 3] * dt; d[o + 1] += d[o + 4] * dt; d[o + 2] += d[o + 5] * dt;
      const t = d[o + 6] / d[o + 7]; const fade = (1 - t) * (1 - t); const s = d[o + 8] + (d[o + 9] - d[o + 8]) * t;
      _m.compose(_p.set(d[o], d[o + 1], d[o + 2]), camQuat, _s.set(s, s, s)); this.mesh.setMatrixAt(i, _m);
      this.mesh.setColorAt(i, _c.setRGB(d[o + 10] * fade, d[o + 11] * fade, d[o + 12] * fade));
      i++;
    }
    this.mesh.count = this.n; this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true;
  }
  clear() { this.n = 0; this.mesh.count = 0; }
}

// Bolts: stretched additive boxes aligned to velocity. Simulation (hits) happens in the combat code.
export class Bolts {
  constructor(scene, max = 400) {
    this.max = max; this.list = [];
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const geo = new THREE.OctahedronGeometry(0.5, 0); geo.scale(1, 1, 1);
    this.mesh = new THREE.InstancedMesh(geo, mat, max); this.mesh.frustumCulled = false;
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, _c.setRGB(0, 0, 0));
    this.mesh.count = 0; scene.add(this.mesh);
    this.pool = [];
  }
  spawn(o) { if (this.list.length >= this.max) return null; const b = this.pool.pop() || { p: new THREE.Vector3(), v: new THREE.Vector3(), prev: new THREE.Vector3(), col: new THREE.Color() }; Object.assign(b, o.extra || {}); b.p.copy(o.p); b.prev.copy(o.p); b.v.copy(o.v); b.life = o.life; b.dmg = o.dmg; b.owner = o.owner; b.team = o.team; b.gun = o.gun; b.len = o.len || 9; b.w = o.w || 0.5; b.col.set(o.color).multiplyScalar(o.hdr || 4); b.dead = false; this.list.push(b); return b; }
  render() {
    let n = 0;
    for (const b of this.list) {
      _d.copy(b.v).normalize(); _q.setFromUnitVectors(_z, _d);
      _m.compose(b.p, _q, _s.set(b.w, b.w, b.len)); this.mesh.setMatrixAt(n, _m); this.mesh.setColorAt(n, b.col); n++;
    }
    this.mesh.count = n; this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true;
  }
  sweep() { for (let i = this.list.length - 1; i >= 0; i--) if (this.list[i].dead) { this.pool.push(this.list[i]); this.list[i] = this.list[this.list.length - 1]; this.list.pop(); } }
  clear() { for (const b of this.list) this.pool.push(b); this.list.length = 0; this.mesh.count = 0; }
}

// Debris: lit hull fragments that tumble and fade (scaled down) — one draw call.
export class Debris {
  constructor(scene, max = 160) {
    this.max = max; this.list = [];
    const geo = new THREE.TetrahedronGeometry(1, 0); geo.scale(1.4, 0.4, 1);
    const mat = new THREE.MeshStandardNodeMaterial({ color: '#6a6660', map: TEX.panel, metalness: 0.4, roughness: 0.6 });
    this.mesh = new THREE.InstancedMesh(geo, mat, max); this.mesh.frustumCulled = false; this.mesh.count = 0;
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, _c.setRGB(1, 1, 1));
    scene.add(this.mesh);
  }
  spawn(p, v, size, life, col) {
    if (this.list.length >= this.max) this.list.shift();
    const ax = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    this.list.push({ p: p.clone(), v: v.clone(), q: new THREE.Quaternion().setFromAxisAngle(ax, Math.random() * 6), ax, w: (Math.random() - 0.5) * 8, size, t: 0, life, col: new THREE.Color(col || '#6a6660'), ember: Math.random() < 0.5 });
  }
  update(dt, parts) {
    let n = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i]; d.t += dt; if (d.t > d.life) { this.list.splice(i, 1); continue; }
      d.p.addScaledVector(d.v, dt); d.v.multiplyScalar(Math.exp(-0.25 * dt)); _q.setFromAxisAngle(d.ax, d.w * dt); d.q.premultiply(_q);
      const k = d.t > d.life - 1 ? d.life - d.t : 1;
      _m.compose(d.p, d.q, _s.setScalar(d.size * k)); this.mesh.setMatrixAt(n, _m); this.mesh.setColorAt(n, d.col); n++;
      if (d.ember && parts && Math.random() < dt * 14 && d.t < d.life * 0.6) parts.spawn(d.p.x, d.p.y, d.p.z, 0, 0, 0, 0.6, d.size * 1.2, d.size * 2.5, 1.6, 0.55, 0.15, 0);
    }
    this.mesh.count = n; this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true;
  }
  clear() { this.list.length = 0; this.mesh.count = 0; }
}

// Space dust rendered as velocity-stretched line segments around the camera (one draw call). Wraps in a cube.
export class SpeedDust {
  constructor(scene, n = 420, box = 240) {
    this.n = n; this.box = box; this.pts = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) this.pts[i] = (Math.random() - 0.5) * box;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 6); this.col = new Float32Array(n * 6);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.LineBasicNodeMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.lines = new THREE.LineSegments(g, m); this.lines.frustumCulled = false; scene.add(this.lines);
    this.tint = new THREE.Color('#bcd4ff');
  }
  update(camPos, vel, stretch = 0.06, bright = 0.6) {
    const h = this.box / 2, P = this.pts, pos = this.pos, col = this.col;
    const sp = vel.length(); const L = Math.min(sp * stretch, 140); const k = sp > 1 ? L / sp : 0;
    const a = Math.min(1, 0.25 + sp / 600) * bright;
    for (let i = 0; i < this.n; i++) {
      const o = i * 3;
      // wrap each mote into the cube centred on the camera (world space)
      for (let j = 0; j < 3; j++) { let r = P[o + j] - camPos.getComponent(j); r = ((r + h) % this.box + this.box) % this.box - h; P[o + j] = camPos.getComponent(j) + r; }
      const q = i * 6;
      pos[q] = P[o]; pos[q + 1] = P[o + 1]; pos[q + 2] = P[o + 2];
      pos[q + 3] = P[o] - vel.x * k - 0.15; pos[q + 4] = P[o + 1] - vel.y * k; pos[q + 5] = P[o + 2] - vel.z * k;
      const dx = P[o] - camPos.x, dy = P[o + 1] - camPos.y, dz = P[o + 2] - camPos.z; const near = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy + dz * dz) / h);
      const b = a * near;
      col[q] = this.tint.r * b; col[q + 1] = this.tint.g * b; col[q + 2] = this.tint.b * b; col[q + 3] = 0; col[q + 4] = 0; col[q + 5] = 0;
    }
    this.lines.geometry.attributes.position.needsUpdate = true; this.lines.geometry.attributes.color.needsUpdate = true;
  }
}

// Constant-count flash lights (changing light count recompiles every lit material, so we keep 2 and fade them).
export class FlashLights {
  constructor(scene) { this.l = [0, 1].map(() => { const p = new THREE.PointLight('#ffb070', 0, 900, 1.2); scene.add(p); return { p, t: 1, dur: 1, i0: 0 }; }); this.k = 0; }
  flash(pos, color, intensity, dur) { const s = this.l[this.k++ % this.l.length]; s.p.position.copy(pos); s.p.color.set(color); s.i0 = intensity; s.t = 0; s.dur = dur; }
  update(dt) { for (const s of this.l) { s.t += dt; s.p.intensity = s.t < s.dur ? s.i0 * (1 - s.t / s.dur) ** 2 : 0; } }
}

// Shield-hit bubbles: instanced fresnel spheres, fading quickly.
export class ShieldFX {
  constructor(scene, max = 12) {
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    mat.colorNode = Fn(() => { const V = normalize(cameraPosition.sub(positionWorld)); const f = pow(float(1).sub(abs(dot(normalWorld, V))), 2.5); return vec3(0.35, 0.75, 1.4).mul(f.add(0.05)); })();
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 24, 16), mat, max); this.mesh.frustumCulled = false; this.mesh.count = 0;
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, _c.setRGB(1, 1, 1));
    scene.add(this.mesh); this.list = []; this.max = max;
  }
  hit(ship, front) { if (this.list.length >= this.max) this.list.shift(); this.list.push({ ship, t: 0, front }); }
  update(dt) {
    let n = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const h = this.list[i]; h.t += dt; if (h.t > 0.35 || !h.ship.alive) { this.list.splice(i, 1); continue; }
      const k = 1 - h.t / 0.35; const r = h.ship.radius * 1.25;
      _s.set(r * 1.1, r * 0.75, r * 1.35);
      _m.compose(h.ship.pos, h.ship.quat, _s); this.mesh.setMatrixAt(n, _m); this.mesh.setColorAt(n, _c.setRGB(k, k, k)); n++;
    }
    this.mesh.count = n; this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true;
  }
}

// Per-frame additive glow quads (engine plumes, muzzle flashes, beacons, pods) batched into one draw call.
export class Glows {
  constructor(scene, max = 260) {
    const mat = new THREE.MeshBasicNodeMaterial({ map: TEX.glow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, max); this.mesh.frustumCulled = false; this.max = max; this.n = 0;
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, _c.setRGB(0, 0, 0));
    this.mesh.count = 0; scene.add(this.mesh); this.q = new THREE.Quaternion();
  }
  begin(camQuat) { this.n = 0; this.q.copy(camQuat); }
  add(p, size, r, g, b) { if (this.n >= this.max) return; _m.compose(p, this.q, _s.set(size, size, size)); this.mesh.setMatrixAt(this.n, _m); this.mesh.setColorAt(this.n, _c.setRGB(r, g, b)); this.n++; }
  end() { this.mesh.count = this.n; this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true; }
}
