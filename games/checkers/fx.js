// Checkers: Event Horizon — effects. Pooled + instanced so the whole board stays well under the draw budget.
import { THREE } from '/shared/sd-kit.js';
import {
  uniform, uv, length, vec2, vec3, float, sin, cos, atan, mix, smoothstep, step, mx_noise_float, time, pow, abs, max, min,
  fract, instancedBufferAttribute, positionGeometry, exp, clamp, TWO_PI,
} from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const ss = (a, b, x) => (a < b ? smoothstep(a, b, x) : float(1).sub(smoothstep(b, a, x)));
export const sqPos = (sq, y = 0, out = new THREE.Vector3()) => out.set((sq & 7) - 3.5, y, (sq >> 3) - 3.5);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();
const _zq = new THREE.Quaternion(), _Z = new THREE.Vector3(0, 0, 1), _Y = new THREE.Vector3(0, 1, 0);
const rnd = (a, b) => a + Math.random() * (b - a);

// ---------------------------------------------------------------- billboard particles (one draw call per pool)
export class Particles {
  constructor(scene, cap, { additive = true, smoke = false } = {}) {
    this.max = cap; this.list = [];
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1); this.alpha.setUsage(THREE.DynamicDrawUsage);
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    const d = length(uv().sub(0.5)).mul(2);
    const a = instancedBufferAttribute(this.alpha);
    if (smoke) {
      const n = mx_noise_float(vec3(uv().mul(3.5), a.mul(7))).mul(0.35).add(0.65);
      const shape = ss(1.0, 0.15, d).mul(n);
      mat.colorNode = vec3(1); mat.opacityNode = shape.mul(a);
    } else {
      const shape = pow(clamp(float(1).sub(d), 0, 1), 2.2);
      mat.colorNode = vec3(shape.mul(a)); mat.opacityNode = shape.mul(a);
    }
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, cap);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.renderOrder = smoke ? 3 : 4;
    scene.add(this.mesh);
  }
  emit(o) {
    if (this.list.length >= this.max) this.list.shift();
    const c = new THREE.Color(o.color ?? 0xffffff).multiplyScalar(o.intensity ?? 1);
    this.list.push({
      p: o.pos.clone(), v: o.vel ? o.vel.clone() : new THREE.Vector3(), life: o.life ?? 1, t: 0,
      s0: o.size ?? 0.1, s1: o.size1 ?? o.size ?? 0.1, c, c1: o.color1 != null ? new THREE.Color(o.color1).multiplyScalar(o.intensity ?? 1) : null,
      g: o.gravity ?? 0, drag: o.drag ?? 0, a0: o.alpha ?? 1, rot: Math.random() * 6.28, spin: o.spin ?? 0,
      attract: o.attract || null, swirl: o.swirl ?? 0, sway: o.sway ?? 0, seed: Math.random() * 10, kill: o.kill,
    });
  }
  burst(n, f) { for (let i = 0; i < n; i++) this.emit(f(i)); }
  update(dt, cam) {
    const L = this.list; let w = 0;
    for (let i = 0; i < L.length; i++) {
      const q = L[i]; q.t += dt; if (q.t >= q.life) continue;
      if (q.attract) { // spiral infall toward a point (black holes)
        _p.subVectors(q.attract, q.p); const d = Math.max(_p.length(), 0.05); _p.multiplyScalar(1 / d);
        q.v.addScaledVector(_p, (q.swirl ? 2.2 : 3) / (d + 0.3) * dt * 3);
        if (q.swirl) { q.v.x += -_p.z * q.swirl * dt / (d + 0.2); q.v.z += _p.x * q.swirl * dt / (d + 0.2); }
        if (d < (q.kill ?? 0.12)) { q.t = q.life; continue; }
      }
      q.v.y -= q.g * dt; if (q.drag) q.v.multiplyScalar(Math.max(0, 1 - q.drag * dt));
      q.p.addScaledVector(q.v, dt);
      if (q.sway) q.p.x += Math.sin(q.t * 3 + q.seed) * q.sway * dt;
      q.rot += q.spin * dt; L[w++] = q;
    }
    L.length = w;
    const n = Math.min(w, this.max), ca = this.mesh.instanceColor.array, aa = this.alpha.array;
    for (let i = 0; i < n; i++) {
      const q = L[i], k = q.t / q.life, s = q.s0 + (q.s1 - q.s0) * k;
      _zq.setFromAxisAngle(_Z, q.rot); _q.copy(cam.quaternion).multiply(_zq);
      _m.compose(q.p, _q, _s.set(s, s, s)); this.mesh.setMatrixAt(i, _m);
      if (q.c1) _c.copy(q.c).lerp(q.c1, k); else _c.copy(q.c);
      ca[i * 3] = _c.r; ca[i * 3 + 1] = _c.g; ca[i * 3 + 2] = _c.b;
      aa[i] = q.a0 * Math.min(1, k * 6) * (1 - k) * (1 - k * 0.2);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true; this.alpha.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- capture shards (instanced, physical bounce on the board)
export class Shards {
  constructor(scene, cap = 160) {
    this.max = cap; this.list = [];
    const geo = new THREE.TetrahedronGeometry(0.055); geo.scale(1, 0.55, 1.3);
    const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.45, metalness: 0.1, flatShading: true });
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.castShadow = true;
    scene.add(this.mesh);
  }
  burst(pos, color, n = 14, power = 1, floorY = 0) {
    for (let i = 0; i < n; i++) {
      if (this.list.length >= this.max) this.list.shift();
      const a = Math.random() * 6.28, sp = rnd(0.8, 2.4) * power;
      this.list.push({ p: pos.clone().add(new THREE.Vector3(rnd(-0.15, 0.15), rnd(0.02, 0.15), rnd(-0.15, 0.15))), v: new THREE.Vector3(Math.cos(a) * sp, rnd(1.5, 3.4) * power, Math.sin(a) * sp),
        r: new THREE.Euler(rnd(0, 6), rnd(0, 6), rnd(0, 6)), w: new THREE.Vector3(rnd(-12, 12), rnd(-12, 12), rnd(-12, 12)), t: 0, life: rnd(1.2, 2.0), s: rnd(0.6, 1.5), c: new THREE.Color(color).multiplyScalar(rnd(0.8, 1.15)), floorY });
    }
  }
  update(dt) {
    const L = this.list; let w = 0;
    for (const q of L) {
      q.t += dt; if (q.t >= q.life) continue;
      q.v.y -= 9.8 * dt; q.p.addScaledVector(q.v, dt);
      const onBoard = Math.abs(q.p.x) < 4.7 && Math.abs(q.p.z) < 4.7;
      const fy = onBoard ? q.floorY + 0.02 : -0.39;
      if (q.p.y < fy && q.v.y < 0) { q.p.y = fy; q.v.y *= -0.32; q.v.x *= 0.6; q.v.z *= 0.6; q.w.multiplyScalar(0.5); }
      q.r.x += q.w.x * dt; q.r.y += q.w.y * dt; q.r.z += q.w.z * dt;
      L[w++] = q;
    }
    L.length = w;
    const ca = this.mesh.instanceColor.array;
    for (let i = 0; i < w; i++) {
      const q = L[i], k = q.t / q.life, s = q.s * (k > 0.75 ? (1 - k) / 0.25 : 1);
      _m.compose(q.p, _q.setFromEuler(q.r), _s.set(s, s, s)); this.mesh.setMatrixAt(i, _m);
      ca[i * 3] = q.c.r; ca[i * 3 + 1] = q.c.g; ca[i * 3 + 2] = q.c.b;
    }
    this.mesh.count = w; this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- board markers (legal moves, selection, trail, cursor)
// style: 0 ring, 1 dot, 2 square frame, 3 soft disc, 4 capture ring (double), 5 chevron arrow
export class Markers {
  constructor(scene, cap = 128) {
    this.max = cap; this.n = 0;
    this.style = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1); this.style.setUsage(THREE.DynamicDrawUsage);
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const st = instancedBufferAttribute(this.style);
    const p = uv().sub(0.5).mul(2), d = length(p);
    const ring = smoothstep(0.58, 0.68, d).mul(ss(0.9, 0.8, d));
    const dot = ss(0.42, 0.26, d);
    const box = max(abs(p.x), abs(p.y));
    const frame = smoothstep(0.84, 0.9, box).mul(ss(1.0, 0.95, box));
    const soft = pow(clamp(float(1).sub(d), 0, 1), 1.6);
    const capRing = ring.add(smoothstep(0.3, 0.38, d).mul(ss(0.5, 0.42, d)).mul(0.8));
    const chev = ss(0.12, 0.06, abs(abs(p.x).mul(0.9).sub(p.y.negate()).sub(0.1))).mul(step(abs(p.x), 0.55));
    const shape = st.lessThan(0.5).select(ring, st.lessThan(1.5).select(dot, st.lessThan(2.5).select(frame, st.lessThan(3.5).select(soft, st.lessThan(4.5).select(capRing, chev)))));
    mat.colorNode = vec3(shape);
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage); this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 2; this.mesh.count = 0;
    scene.add(this.mesh);
  }
  begin() { this.n = 0; }
  add(x, z, size, color, intensity, style, y = 0.008, rot = 0) {
    if (this.n >= this.max) return;
    const i = this.n++;
    _m.compose(_p.set(x, y, z), _q.setFromAxisAngle(_Y, rot), _s.set(size, 1, size)); this.mesh.setMatrixAt(i, _m);
    _c.set(color).multiplyScalar(intensity); this.mesh.instanceColor.setXYZ(i, _c.r, _c.g, _c.b);
    this.style.array[i] = style;
  }
  end() { this.mesh.count = this.n; this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true; this.style.needsUpdate = true; }
}

// ---------------------------------------------------------------- black holes
// Visual stack per hole: event-horizon core, Keplerian accretion disk (inner faster, Doppler-bright side),
// camera-facing photon ring, soft glow, ground swirl (telegraph), point light; the board shader adds lensing.
class Hole {
  constructor(scene) {
    this.g = new THREE.Group(); this.g.visible = false; scene.add(this.g);
    this.open = uniform(0); this.warn = uniform(0); this.sq = -1; this.level = { open: 0, warn: 0 }; this.busy = false;
    const Y = 0.34;
    this.core = new THREE.Mesh(new THREE.SphereGeometry(0.205, 28, 18), new THREE.MeshBasicNodeMaterial({ color: 0x000000 }));
    this.core.position.y = Y; this.g.add(this.core);
    // shadow occluder: camera-facing black disc just in front of the core so additive glare can't grey it out
    this.shade = new THREE.Mesh(new THREE.CircleGeometry(0.2, 40), new THREE.MeshBasicNodeMaterial({ color: 0x000000, transparent: true, depthWrite: false }));
    this.shade.renderOrder = 6; this.g.add(this.shade);
    // accretion disk
    const dm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    {
      const d = uv().sub(0.5).mul(2), r = length(d), a = atan(d.y, d.x);
      const rr = clamp(r.sub(0.27).div(0.73), 0, 1);
      const sw = a.add(time.mul(1.6).div(rr.add(0.22)));
      const n = mx_noise_float(vec3(cos(sw).mul(2.6), sin(sw).mul(2.6), rr.mul(9).sub(time.mul(0.25))));
      const temp = pow(float(1).sub(rr), 1.5);
      const col = mix(mix(vec3(0.7, 0.07, 0.03), vec3(1.0, 0.42, 0.08), smoothstep(0.0, 0.55, temp)), vec3(1.0, 0.8, 0.55), smoothstep(0.75, 1.0, temp));
      const doppler = sin(a.add(0.6)).mul(0.55).add(1.0);
      const lanes = pow(n.mul(0.5).add(0.5), 1.5);
      const fade = smoothstep(0.0, 0.05, rr).mul(ss(1.0, 0.6, rr));
      dm.colorNode = col.mul(lanes.mul(1.2).add(0.25)).mul(temp.mul(2.0).add(0.18)).mul(doppler).mul(fade).mul(this.open);
    }
    this.disk = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.82, 96, 2), dm);
    this.disk.rotation.x = -Math.PI / 2 + 0.38; this.disk.position.y = Y; this.g.add(this.disk);
    // photon ring (billboard)
    const pm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    {
      const d = uv().sub(0.5).mul(2), r = length(d);
      const ring = exp(r.sub(0.8).div(0.03).pow(2).negate()).mul(1.4).add(exp(r.sub(0.9).div(0.07).pow(2).negate()).mul(0.25));
      const arc = smoothstep(-0.3, 1.0, d.y).mul(0.9).add(0.35);
      pm.colorNode = vec3(1.0, 0.66, 0.36).mul(ring).mul(arc).mul(this.open);
    }
    this.photon = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.33, 64, 1), pm);
    this.photon.position.y = Y; this.photon.renderOrder = 5; this.g.add(this.photon);
    // glow (billboard)
    const gm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    {
      const r = length(uv().sub(0.5)).mul(2);
      const f = pow(clamp(float(1).sub(r), 0, 1), 3);
      const halo = f.mul(smoothstep(0.12, 0.3, r)); // hollow centre: never paint over the shadow
      gm.colorNode = mix(vec3(0.4, 0.12, 0.85), vec3(1.0, 0.4, 0.12), f).mul(halo).mul(this.open.mul(0.22).add(this.warn.mul(0.3)));
    }
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), gm);
    this.glow.position.y = Y; this.glow.renderOrder = 1; this.g.add(this.glow);
    // ground swirl
    const sm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    {
      const d = uv().sub(0.5).mul(2), r = length(d), a = atan(d.y, d.x);
      const arms = pow(sin(a.mul(3).add(r.mul(10)).sub(time.mul(3.2))).mul(0.5).add(0.5), 3);
      const mask = ss(1.0, 0.3, r).mul(smoothstep(0.02, 0.2, r));
      const col = mix(vec3(1.0, 0.55, 0.2), vec3(0.55, 0.2, 1.0), r);
      sm.colorNode = col.mul(arms.mul(0.85).add(0.15)).mul(mask).mul(this.warn.mul(2.4).add(this.open.mul(0.7)));
    }
    this.swirl = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5).rotateX(-Math.PI / 2), sm);
    this.swirl.position.y = 0.01; this.g.add(this.swirl);
    this.light = new THREE.PointLight(0xff8a45, 0, 3.4, 1.7); this.light.position.y = 0.55; this.g.add(this.light);
  }
}

export class HolesFX {
  constructor(scene, particles, boardHoles) {
    this.pool = [0, 1, 2].map(() => new Hole(scene)); this.particles = particles; this.boardHoles = boardHoles; this.t = 0;
  }
  get(sq) { return this.pool.find((h) => h.sq === sq); }
  alloc(sq) { const h = this.get(sq) || this.pool.find((x) => x.sq < 0); if (!h) return null; h.sq = sq; sqPos(sq, 0, h.g.position); h.g.visible = true; return h; }
  // desired: [{sq, warn, life}] from game state; instant snaps (load/undo)
  sync(holes, holeWarn, instant) {
    for (const h of this.pool) if (h.sq >= 0 && !h.busy && !holes.some((x) => x.sq === h.sq)) this.release(h);
    for (const x of holes) {
      const h = this.alloc(x.sq); if (!h) continue;
      h.level.warn = x.warn > 0 ? 1 - (x.warn - 1) / Math.max(1, holeWarn) * 0.55 : 0.25;
      h.level.open = x.warn > 0 ? 0 : 1;
      if (instant) { h.open.value = h.level.open; h.warn.value = h.level.warn; }
    }
  }
  release(h) { h.sq = -1; h.g.visible = false; h.open.value = 0; h.warn.value = 0; h.light.intensity = 0; h.level.open = 0; h.level.warn = 0; }
  update(dt, cam) {
    this.t += dt;
    this.pool.forEach((h, i) => {
      const bh = this.boardHoles[i];
      if (h.sq < 0) { bh.value.z = 0; bh.value.w = 0; return; }
      if (!h.busy) {
        h.open.value += (h.level.open - h.open.value) * Math.min(1, dt * 3);
        h.warn.value += (h.level.warn - h.warn.value) * Math.min(1, dt * 2.5);
      }
      const o = h.open.value, w = h.warn.value;
      h.photon.quaternion.copy(cam.quaternion); h.glow.quaternion.copy(cam.quaternion); h.shade.quaternion.copy(cam.quaternion);
      _p.copy(cam.position).sub(h.g.position).setY(cam.position.y - h.g.position.y - 0.34).normalize().multiplyScalar(0.23);
      h.shade.position.set(_p.x, 0.34 + _p.y, _p.z); h.shade.scale.setScalar(Math.max(0.001, Math.min(1.15, o)));
      const coreS = Math.max(0.001, o); h.core.scale.setScalar(coreS); h.disk.scale.setScalar(Math.max(0.001, o));
      h.photon.scale.setScalar(Math.max(0.001, o)); h.disk.rotation.z = this.t * 0.15;
      h.swirl.scale.setScalar(0.35 + w * 0.75 + o * 0.3); h.swirl.rotation.y = -this.t * (0.8 + w * 2);
      h.light.intensity = o * 5.5 * (0.9 + 0.1 * Math.sin(this.t * 7 + i));
      bh.value.set(((h.sq & 7) + 0.5) / 8, 1 - ((h.sq >> 3) + 0.5) / 8, o, w * (1 - o));
      // ambient infall: a trickle of sparks spiralling into live holes
      if (o > 0.5 && Math.random() < dt * 14) {
        const a = Math.random() * 6.28, r = rnd(0.7, 1.3), c = h.g.position;
        this.particles.emit({ pos: new THREE.Vector3(c.x + Math.cos(a) * r, 0.34 + rnd(-0.06, 0.12), c.z + Math.sin(a) * r), vel: new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(0.9),
          attract: new THREE.Vector3(c.x, 0.34, c.z), swirl: 2.6, kill: 0.27, life: 1.6, size: 0.045, size1: 0.02, color: Math.random() < 0.5 ? 0xffa060 : 0xa070ff, intensity: 2.2 });
      } else if (w > 0.3 && o < 0.5 && Math.random() < dt * 8) {
        const a = Math.random() * 6.28, r = rnd(0.5, 0.9), c = h.g.position;
        this.particles.emit({ pos: new THREE.Vector3(c.x + Math.cos(a) * r, 0.03, c.z + Math.sin(a) * r), vel: new THREE.Vector3(-Math.sin(a), 0.05, Math.cos(a)).multiplyScalar(0.4),
          attract: new THREE.Vector3(c.x, 0.05, c.z), swirl: 1.5, life: 1.4, size: 0.04, size1: 0.015, color: 0xc090ff, intensity: 2.2 });
      }
    });
  }
}

// ---------------------------------------------------------------- graves (instanced tombstones, medallions, mounds, turn pips)
export class GravesFX {
  constructor(scene, particles, smoke) {
    this.particles = particles; this.smoke = smoke; this.list = []; const CAP = 32;
    this.age = new THREE.InstancedBufferAttribute(new Float32Array(CAP), 1); this.age.setUsage(THREE.DynamicDrawUsage);
    const w = 0.2, h = 0.3, sh = new THREE.Shape();
    sh.moveTo(-w, 0); sh.lineTo(w, 0); sh.lineTo(w, h); sh.absarc(0, h, w, 0, Math.PI, false); sh.lineTo(-w, 0);
    const sg = new THREE.ExtrudeGeometry(sh, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.014, bevelSize: 0.014, bevelSegments: 2, curveSegments: 12 });
    sg.translate(0, 0.0, -0.04);
    const stoneMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, alphaTest: 0.5 });
    {
      const pg = positionGeometry, age = instancedBufferAttribute(this.age);
      const n = mx_noise_float(pg.mul(9)).mul(0.5).add(0.5);
      const fine = mx_noise_float(pg.mul(40));
      const front = step(0.045, pg.z);
      const lines = step(abs(fract(pg.y.sub(0.07).mul(18)).sub(0.5)), 0.13).mul(step(0.09, pg.y)).mul(step(pg.y, 0.25)).mul(step(abs(pg.x), 0.1)).mul(front);
      const moss = smoothstep(0.55, 0.8, mx_noise_float(pg.mul(5).add(3))).mul(ss(0.25, 0.0, pg.y)).mul(age.add(0.3));
      const stone = vec3(0.26, 0.26, 0.27).mul(n.mul(0.45).add(0.65)).mul(fine.mul(0.06).add(1)).mul(float(1).sub(lines.mul(0.55))).mul(float(1).sub(age.mul(0.25)));
      stoneMat.colorNode = mix(stone, vec3(0.16, 0.24, 0.1), moss.clamp(0, 0.8));
      // crumble: noise dissolve keyed to per-instance age (0 fresh → 1 gone)
      const dn = mx_noise_float(pg.mul(13)).mul(0.5).add(0.5);
      stoneMat.opacityNode = step(age.mul(1.2).sub(0.15), dn);
    }
    this.stones = new THREE.InstancedMesh(sg, stoneMat, CAP);
    const mg = new THREE.CylinderGeometry(0.08, 0.08, 0.02, 28); mg.rotateX(Math.PI / 2);
    const medalMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.35, metalness: 0.3 });
    this.medals = new THREE.InstancedMesh(mg, medalMat, CAP);
    this.medals.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3);
    const dg = new THREE.SphereGeometry(0.2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2); dg.scale(1.05, 0.28, 0.72);
    const dirtMat = new THREE.MeshStandardNodeMaterial({ roughness: 1 });
    dirtMat.colorNode = vec3(0.2, 0.14, 0.09).mul(mx_noise_float(positionGeometry.mul(30)).mul(0.25).add(0.85));
    this.mounds = new THREE.InstancedMesh(dg, dirtMat, CAP);
    const candle = mergeGeometries([new THREE.CylinderGeometry(0.017, 0.019, 0.07, 10).translate(0, 0.035, 0), new THREE.SphereGeometry(0.014, 8, 6).scale(1, 1.8, 1).translate(0, 0.095, 0)]);
    const pipMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.7 });
    const flame = smoothstep(0.075, 0.085, positionGeometry.y);
    pipMat.colorNode = mix(vec3(0.85, 0.8, 0.68), vec3(0.0), flame);
    pipMat.emissiveNode = vec3(1.0, 0.62, 0.25).mul(flame.mul(5.0));
    this.pips = new THREE.InstancedMesh(candle, pipMat, CAP * 4);
    for (const m of [this.stones, this.medals, this.mounds, this.pips]) {
      m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m);
    }
    this.stones.castShadow = true; this.stones.receiveShadow = true; this.mounds.receiveShadow = true; this.medals.castShadow = true; this.pips.castShadow = true;
  }
  // colorOf(piece) → THREE.Color
  sync(graves, colorOf, instant) {
    for (const g of this.list) if (!g.dying && !graves.some((x) => x.sq === g.sq)) this.fade(g.sq, instant);
    for (const x of graves) {
      let g = this.list.find((q) => q.sq === x.sq && !q.dying);
      if (!g) { g = { sq: x.sq, piece: x.piece, rise: instant ? 1 : 0, crumble: 0, yaw: rnd(-0.18, 0.18), lean: rnd(-0.08, 0.05), dying: false }; this.list.push(g); if (!instant) this.raise(g); }
      g.ttl = x.ttl; g.max = x.max; g.color = colorOf(x.piece); g.king = Math.abs(x.piece) === 2;
    }
  }
  raise(g) {
    const c = sqPos(g.sq);
    this.smoke.burst(10, () => ({ pos: c.clone().add(new THREE.Vector3(rnd(-0.25, 0.25), 0.05, rnd(-0.2, 0.25))), vel: new THREE.Vector3(rnd(-0.3, 0.3), rnd(0.2, 0.5), rnd(-0.3, 0.3)), life: rnd(0.8, 1.3), size: 0.18, size1: 0.45, color: 0x6b5644, alpha: 0.6, drag: 1.5 }));
    g.riseT = 0;
  }
  fade(sq, instant) {
    const g = this.list.find((q) => q.sq === sq && !q.dying); if (!g) return;
    g.dying = true;
    if (instant) { this.list = this.list.filter((q) => q !== g); return; }
    g.crumbleT = 0;
    const c = sqPos(sq);
    // ghost wisp rising out of the grave
    // FABLE: a proper ghost (sheet-cloth sim / spectral face) curling out of the grave would sell this more.
    for (let i = 0; i < 16; i++) {
      this.particles.emit({ pos: c.clone().add(new THREE.Vector3(rnd(-0.08, 0.08), 0.25 + i * 0.03, rnd(-0.08, 0.08))), vel: new THREE.Vector3(rnd(-0.05, 0.05), rnd(0.55, 0.95), rnd(-0.05, 0.05)),
        life: rnd(1.4, 2.1), size: 0.12, size1: 0.42, color: 0x9fe8ff, intensity: 1.4, alpha: 0.75, sway: 0.5 });
    }
    this.smoke.burst(8, () => ({ pos: c.clone().add(new THREE.Vector3(rnd(-0.2, 0.2), 0.08, rnd(-0.2, 0.2))), vel: new THREE.Vector3(rnd(-0.4, 0.4), rnd(0.1, 0.3), rnd(-0.4, 0.4)), life: 1.0, size: 0.15, size1: 0.4, color: 0x857a6e, alpha: 0.55, drag: 2 }));
  }
  update(dt) {
    let n = 0, pn = 0;
    const ca = this.medals.instanceColor.array, aa = this.age.array;
    for (const g of this.list) {
      if (g.riseT != null && g.riseT < 1) { g.riseT = Math.min(1, g.riseT + dt / 0.7); g.rise = 1 - Math.pow(1 - g.riseT, 3); }
      if (g.dying) { g.crumbleT = Math.min(1, (g.crumbleT || 0) + dt / 1.1); }
      const c = sqPos(g.sq, 0, _p);
      const sink = g.dying ? g.crumbleT * 0.12 : (1 - g.rise) * 0.45;
      const age = g.dying ? 0.55 + g.crumbleT * 0.6 : (1 - g.ttl / Math.max(1, g.max)) * 0.5;
      _e.set(g.lean, g.yaw, 0); _q.setFromEuler(_e);
      _m.compose(_s.set(c.x, -sink, c.z - 0.12), _q, new THREE.Vector3(1, 1, 1)); this.stones.setMatrixAt(n, _m);
      aa[n] = age;
      const mp = new THREE.Vector3(0, 0.34, 0.06).applyQuaternion(_q).add(_s);
      _m.compose(mp, _q, new THREE.Vector3(1, 1, 1).multiplyScalar(g.dying ? Math.max(0.001, 1 - g.crumbleT * 1.6) : 1)); this.medals.setMatrixAt(n, _m);
      const col = g.color || _c.set(0x888888); ca[n * 3] = col.r; ca[n * 3 + 1] = col.g; ca[n * 3 + 2] = col.b;
      _m.compose(_s.set(c.x, 0.0, c.z + 0.1), _q.identity(), new THREE.Vector3(1, g.rise * (g.dying ? 1 - g.crumbleT : 1) + 0.001, 1)); this.mounds.setMatrixAt(n, _m);
      if (!g.dying) {
        const turns = Math.ceil(g.ttl / 2);
        for (let k = 0; k < turns && pn < this.pips.instanceMatrix.count; k++) {
          const a = (k - (turns - 1) / 2) * 0.55; // candles in an arc in front of the mound
          _m.makeTranslation(c.x + Math.sin(a) * 0.3, 0.004 + (g.rise - 1) * 0.2, c.z + 0.05 + Math.cos(a) * 0.3); this.pips.setMatrixAt(pn++, _m);
        }
      }
      n++;
    }
    this.list = this.list.filter((g) => !(g.dying && g.crumbleT >= 1));
    this.stones.count = this.medals.count = this.mounds.count = n; this.pips.count = pn;
    for (const m of [this.stones, this.medals, this.mounds, this.pips]) m.instanceMatrix.needsUpdate = true;
    this.medals.instanceColor.needsUpdate = true; this.age.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- meteors (reticles, falling rock, craters)
export class MeteorsFX {
  constructor(scene, sparks, smoke, shards) {
    this.sparks = sparks; this.smoke = smoke; this.shards = shards; this.t = 0;
    const rm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    {
      const d = uv().sub(0.5).mul(2), r = length(d), a = atan(d.y, d.x);
      const ring = smoothstep(0.78, 0.84, r).mul(ss(0.94, 0.88, r));
      const inner = smoothstep(0.42, 0.46, r).mul(ss(0.52, 0.48, r)).mul(step(0.5, fract(a.mul(4 / (Math.PI * 2)).add(time.mul(0.6)))));
      const ticks = step(abs(fract(a.mul(4 / (Math.PI * 2))).sub(0.5)), 0.04).mul(smoothstep(0.55, 0.6, r)).mul(ss(0.76, 0.7, r));
      const pulse = sin(time.mul(9)).mul(0.35).add(0.85);
      rm.colorNode = vec3(1.0, 0.25, 0.08).mul(ring.add(inner).add(ticks)).mul(pulse).mul(2.6);
    }
    const bm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    {
      const h = uv().y;
      const flick = sin(time.mul(14)).mul(0.2).add(0.8);
      const scroll = sin(h.mul(40).sub(time.mul(18))).mul(0.25).add(0.75);
      bm.colorNode = vec3(1.0, 0.3, 0.08).mul(pow(float(1).sub(h), 1.6)).mul(flick).mul(scroll).mul(1.4);
    }
    const beamGeo = new THREE.CylinderGeometry(0.05, 0.3, 7, 20, 1, true).translate(0, 3.5, 0);
    this.reticles = [0, 1, 2, 3].map(() => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), rm); m.position.y = 0.012; m.visible = false; m.userData.sq = -1; scene.add(m);
      const beam = new THREE.Mesh(beamGeo, bm); beam.renderOrder = 3; m.userData.beam = beam; beam.visible = false; scene.add(beam);
      return m;
    });
    const rock = new THREE.IcosahedronGeometry(0.24, 1); const p = rock.attributes.position;
    for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(p, i); v.multiplyScalar(1 + (Math.sin(v.x * 17) * Math.cos(v.y * 13) * Math.sin(v.z * 11)) * 0.18); p.setXYZ(i, v.x, v.y, v.z); }
    rock.computeVertexNormals();
    const lava = new THREE.MeshStandardNodeMaterial({ roughness: 0.9 });
    const ln = mx_noise_float(positionGeometry.mul(9));
    lava.colorNode = vec3(0.1, 0.08, 0.07);
    lava.emissiveNode = vec3(1.0, 0.35, 0.06).mul(smoothstep(0.25, 0.6, ln)).mul(4);
    this.rock = new THREE.Mesh(rock, lava); this.rock.visible = false; scene.add(this.rock);
    // craters
    this.heat = []; this.craters = [];
    const rimParts = [];
    for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2 + rnd(-0.2, 0.2), g = new THREE.IcosahedronGeometry(rnd(0.05, 0.09), 0); g.scale(1, 0.6, 1); g.translate(Math.cos(a) * rnd(0.34, 0.42), 0.02, Math.sin(a) * rnd(0.34, 0.42)); rimParts.push(g); }
    const rimGeo = mergeGeometries(rimParts);
    const rimMat = new THREE.MeshStandardNodeMaterial({ color: 0x2a2420, roughness: 0.95, flatShading: true });
    for (let i = 0; i < 6; i++) {
      const heat = uniform(1), seed = uniform(Math.random() * 10);
      const cm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const d = uv().sub(0.5).mul(2), r = length(d), a = atan(d.y, d.x);
      const cracks = pow(float(1).sub(abs(mx_noise_float(vec3(cos(a).mul(2.2), sin(a).mul(2.2), r.mul(3).add(seed))))), 14).mul(ss(0.95, 0.25, r));
      const core = ss(0.35, 0.0, r);
      const ember = cracks.add(core.mul(0.6)).mul(heat).mul(sin(time.mul(3).add(r.mul(9))).mul(0.25).add(0.85));
      cm.colorNode = mix(vec3(0.03, 0.025, 0.02), vec3(1.0, 0.32, 0.06).mul(3.2), clamp(ember, 0, 1));
      cm.opacityNode = ss(1.0, 0.55, r).mul(0.96);
      const g = new THREE.Group(); g.visible = false; g.userData.sq = -1;
      const decal = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.15).rotateX(-Math.PI / 2), cm); decal.position.y = 0.006; decal.renderOrder = 1;
      const rim = new THREE.Mesh(rimGeo, rimMat); rim.castShadow = true; rim.rotation.y = Math.random() * 6;
      g.add(decal, rim); scene.add(g); this.craters.push(g); this.heat.push(heat);
    }
  }
  sync(meteors, craters, instant) {
    for (const r of this.reticles) if (r.userData.sq >= 0 && !meteors.some((m) => m.sq === r.userData.sq)) { r.visible = false; r.userData.beam.visible = false; r.userData.sq = -1; }
    for (const m of meteors) {
      if (this.reticles.some((r) => r.userData.sq === m.sq)) continue;
      const r = this.reticles.find((x) => x.userData.sq < 0); if (!r) continue;
      r.userData.sq = m.sq; sqPos(m.sq, 0.012, r.position); r.visible = true; r.userData.born = this.t;
      sqPos(m.sq, 0, r.userData.beam.position); r.userData.beam.visible = true;
    }
    for (const c of this.craters) if (c.userData.sq >= 0 && !craters.some((x) => x.sq === c.userData.sq)) { c.visible = false; c.userData.sq = -1; }
    for (const x of craters) {
      let c = this.craters.find((q) => q.userData.sq === x.sq);
      if (!c) { c = this.craters.find((q) => q.userData.sq < 0); if (!c) continue; c.userData.sq = x.sq; sqPos(x.sq, 0, c.position); c.visible = true; }
      c.userData.target = x.ttl / Math.max(1, x.max);
      if (instant) this.heat[this.craters.indexOf(c)].value = c.userData.target;
    }
  }
  // falling rock + explosion; resolves at impact
  async impact(sq, tw, ease, onHit) {
    const end = sqPos(sq, 0.15), start = end.clone().add(new THREE.Vector3(3.2, 11, -5));
    this.rock.visible = true;
    await tw(0.6, (k) => {
      this.rock.position.lerpVectors(start, end, k); this.rock.rotation.x += 0.2; this.rock.rotation.z += 0.13;
      this.sparks.emit({ pos: this.rock.position.clone(), vel: new THREE.Vector3(rnd(-0.3, 0.3), rnd(0, 0.4), rnd(-0.3, 0.3)), life: 0.5, size: 0.32, size1: 0.05, color: 0xffa040, color1: 0xff3010, intensity: 3 });
      this.smoke.emit({ pos: this.rock.position.clone(), vel: new THREE.Vector3(0, 0.2, 0), life: 1.1, size: 0.25, size1: 0.6, color: 0x3a3330, alpha: 0.5, drag: 1 });
    }, { ease: ease.inQuad });
    this.rock.visible = false;
    onHit?.();
    const c = sqPos(sq, 0.1);
    this.sparks.burst(46, () => { const a = Math.random() * 6.28, s = rnd(1.5, 4.5); return { pos: c.clone(), vel: new THREE.Vector3(Math.cos(a) * s, rnd(1, 4), Math.sin(a) * s), gravity: 7, drag: 1.2, life: rnd(0.5, 1.1), size: 0.09, size1: 0.02, color: 0xffd080, color1: 0xff4010, intensity: 4 }; });
    this.smoke.burst(22, () => { const a = Math.random() * 6.28, s = rnd(0.3, 1.2); return { pos: c.clone(), vel: new THREE.Vector3(Math.cos(a) * s, rnd(0.4, 1.4), Math.sin(a) * s), drag: 1.4, life: rnd(1.3, 2.2), size: 0.3, size1: 0.9, color: 0x2d2724, alpha: 0.75 }; });
    this.shards.burst(c, 0x3a302a, 18, 1.2);
  }
  update(dt) {
    this.t += dt;
    for (const r of this.reticles) if (r.visible) {
      const k = Math.min(1, (this.t - r.userData.born) * 2); r.scale.setScalar(0.4 + 0.6 * k + Math.sin(this.t * 9) * 0.04); r.rotation.y = this.t * 0.8;
      r.userData.beam.scale.set(k, 1, k);
    }
    this.craters.forEach((c, i) => {
      if (!c.visible) return;
      const h = this.heat[i]; h.value += (c.userData.target - h.value) * Math.min(1, dt * 1.5);
      if (Math.random() < dt * 3.5) this.smoke.emit({ pos: c.position.clone().add(new THREE.Vector3(rnd(-0.2, 0.2), 0.05, rnd(-0.2, 0.2))), vel: new THREE.Vector3(rnd(-0.05, 0.05), rnd(0.35, 0.6), rnd(-0.05, 0.05)), life: rnd(1.6, 2.4), size: 0.16, size1: 0.6, color: 0x4a4440, alpha: 0.42, sway: 0.15 });
      if (Math.random() < dt * 2 * h.value) this.sparks.emit({ pos: c.position.clone().add(new THREE.Vector3(rnd(-0.15, 0.15), 0.04, rnd(-0.15, 0.15))), vel: new THREE.Vector3(0, rnd(0.3, 0.7), 0), life: 0.8, size: 0.035, size1: 0.01, color: 0xff7030, intensity: 3 });
    });
  }
}

// ---------------------------------------------------------------- portals
export class PortalsFX {
  constructor(scene, sparks) {
    this.sparks = sparks; this.t = 0; this.items = [];
    const cols = [new THREE.Color(0x33e6ff), new THREE.Color(0xff8a2a)];
    for (let i = 0; i < 2; i++) {
      const C = uniform(cols[i]), pulse = uniform(0);
      const g = new THREE.Group(); g.visible = false; scene.add(g);
      const vm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
      {
        const d = uv().sub(0.5).mul(2), r = length(d), a = atan(d.y, d.x);
        const dir = i === 0 ? 1 : -1;
        const sw = pow(sin(a.mul(4).add(float(2.8).div(r.add(0.18))).sub(time.mul(3.5 * dir))).mul(0.5).add(0.5), 2);
        const core = ss(0.45, 0.0, r);
        vm.colorNode = C.mul(sw.mul(0.9).add(core.mul(1.6)).add(0.1)).mul(ss(1.0, 0.82, r)).mul(pulse.mul(2).add(1.6));
      }
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.47, 48).rotateX(-Math.PI / 2), vm); disc.position.y = 0.009; g.add(disc);
      const tm = new THREE.MeshBasicNodeMaterial(); tm.colorNode = C.mul(pulse.mul(3).add(2.6));
      const torus = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.024, 10, 64).rotateX(Math.PI / 2), tm); torus.position.y = 0.03; g.add(torus);
      const cm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      {
        const h = uv().y;
        const stripes = sin(uv().x.mul(TWO_PI).mul(7).add(time.mul(2.2)).sub(h.mul(9))).mul(0.3).add(0.7);
        cm.colorNode = C.mul(pow(float(1).sub(h), 2.6)).mul(stripes).mul(pulse.mul(1.5).add(0.55));
      }
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 1.5, 40, 1, true), cm); col.position.y = 0.75; g.add(col);
      this.items.push({ g, C, pulse, sq: -1, col: cols[i] });
    }
  }
  sync(portals) {
    this.items.forEach((it, i) => {
      const sq = portals[i] ?? -1; it.sq = sq; it.g.visible = sq >= 0;
      if (sq >= 0) sqPos(sq, 0, it.g.position);
    });
  }
  flash(sq) { const it = this.items.find((x) => x.sq === sq); if (it) it.pulse.value = 1; }
  update(dt) {
    this.t += dt;
    for (const it of this.items) {
      if (!it.g.visible) continue;
      it.pulse.value = Math.max(0, it.pulse.value - dt * 1.6);
      if (Math.random() < dt * 6) {
        const a = Math.random() * 6.28, c = it.g.position;
        this.sparks.emit({ pos: new THREE.Vector3(c.x + Math.cos(a) * 0.42, 0.05, c.z + Math.sin(a) * 0.42), vel: new THREE.Vector3(-Math.sin(a) * 0.5, rnd(0.3, 0.7), Math.cos(a) * 0.5), drag: 0.8, life: 1.2, size: 0.045, size1: 0.01, color: it.col, intensity: 3 });
      }
    }
  }
}
