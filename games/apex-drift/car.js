// Apex Drift — procedural car models (original design: wedge GT with arches, glass canopy, wing, LED light bar),
// shared instanced wheels / contact shadows / boost flames, and the ghost car. Pose comes from physics state.
import { THREE } from '/shared/sd-kit.js';
import { uniform, vec3, vec2, float, mix, smoothstep, step, abs, positionGeometry, normalGeometry, attribute, instancedBufferAttribute, atan, fract, length, uv, normalView, pow, time, sin, max } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const WHEEL_R = 0.36, AXLE = 1.38, TRACKW = 0.84;

const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function taper(g, f) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setX(i, f(p.getX(i), p.getY(i), p.getZ(i))); p.needsUpdate = true; }
function profile(points) { const s = new THREE.Shape(); points.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y))); s.closePath(); return s; }
function arch(cx, cy, r, steps = 9) { const o = []; for (let k = 0; k <= steps; k++) { const a = Math.PI - (k / steps) * Math.PI; o.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } return o; }
function extrude(shape, width, bevel = 0.06) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 3, curveSegments: 4 });
  g.translate(0, 0, -(width - bevel * 2) / 2); g.rotateY(-Math.PI / 2); // shape +x (length) → car +z (forward); extrusion → car x (width)
  return g;
}
let GEO = null;
function geos() {
  if (GEO) return GEO;
  const pts = [[-2.2, 0.3], [-1.92, 0.22], ...arch(-AXLE, 0.3, 0.46), [0.92, 0.22], ...arch(AXLE, 0.3, 0.46), [1.98, 0.22], [2.24, 0.3], [2.32, 0.44], [2.22, 0.58], [1.92, 0.68], [1.0, 0.86], [0.72, 0.9],
    [-1.05, 0.93], [-1.75, 0.93], [-2.16, 0.9], [-2.3, 0.72], [-2.27, 0.46]];
  const body = extrude(profile(pts), 1.88, 0.07);
  const wing = new THREE.BoxGeometry(1.84, 0.05, 0.42).toNonIndexed(); wing.translate(0, 1.16, -1.98);
  const strutA = new THREE.BoxGeometry(0.05, 0.26, 0.12).toNonIndexed(); strutA.translate(0.62, 1.02, -1.95);
  const strutB = strutA.clone(); strutB.translate(-1.24, 0, 0);
  const splitter = new THREE.BoxGeometry(1.8, 0.04, 0.3).toNonIndexed(); splitter.translate(0, 0.22, 2.12);
  const diff = new THREE.BoxGeometry(1.5, 0.12, 0.34).toNonIndexed(); diff.translate(0, 0.26, -2.12);
  const exA = new THREE.CylinderGeometry(0.06, 0.07, 0.2, 10).toNonIndexed(); exA.rotateX(Math.PI / 2); exA.translate(0.36, 0.33, -2.3); const exB = exA.clone(); exB.translate(-0.72, 0, 0);
  const bodyG = mergeGeometries([body, wing, strutA, strutB, splitter, diff, exA, exB].map((g) => { g.deleteAttribute('uv'); return g; }));
  // sculpt: tumblehome toward the shoulder line and a narrower nose/tail in plan view
  taper(bodyG, (x, y, z) => x * (1 - 0.13 * ss(0.5, 0.97, y)) * (1 - 0.13 * ss(1.45, 2.35, Math.abs(z))));
  const cabin = extrude(profile([[-1.62, 0.88], [0.86, 0.88], [0.06, 1.25], [-0.78, 1.27]]), 1.5, 0.09);
  taper(cabin, (x, y, z) => x * (1 - 0.3 * ss(0.9, 1.28, y)) * (1 - 0.08 * ss(0.2, 0.9, Math.abs(z + 0.3))));
  // lights: two headlight strips + full-width LED tail bar (attribute tl: 0 = head, 1 = tail)
  const parts = [];
  for (const sx of [-0.62, 0.62]) { const h = new THREE.BoxGeometry(0.46, 0.08, 0.16).toNonIndexed(); h.rotateY(sx > 0 ? 0.32 : -0.32); h.translate(sx, 0.6, 2.18); parts.push([h, 0]); }
  const tail = new THREE.BoxGeometry(1.4, 0.06, 0.06).toNonIndexed(); tail.translate(0, 0.74, -2.27); parts.push([tail, 1]);
  for (const sx of [-0.7, 0.7]) { const c = new THREE.BoxGeometry(0.16, 0.2, 0.07).toNonIndexed(); c.translate(sx, 0.68, -2.25); parts.push([c, 1]); }
  const lg = mergeGeometries(parts.map(([g, t]) => { g.deleteAttribute('uv'); g.setAttribute('tl', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(t), 1)); return g; }));
  GEO = { body: bodyG, cabin, lights: lg };
  return GEO;
}

export function makePaint(color, accent) {
  const uPaint = uniform(new THREE.Color(color)), uAccent = uniform(new THREE.Color(accent));
  const m = new THREE.MeshPhysicalNodeMaterial({ metalness: 0.5, roughness: 0.32, clearcoat: 1.0, clearcoatRoughness: 0.07 });
  const p = positionGeometry, top = smoothstep(0.3, 0.6, normalGeometry.y);
  const stripe = step(abs(abs(p.x).sub(0.2)), 0.075).mul(top).mul(step(p.y, 1.1));
  const trim = smoothstep(0.36, 0.33, p.y);
  m.colorNode = mix(mix(uPaint, uAccent, stripe), vec3(0.03, 0.03, 0.035), trim);
  m.roughnessNode = mix(float(0.3), float(0.6), trim);
  return { m, uPaint, uAccent };
}

/** Per-race car fleet: N cars + shared instanced wheels, shadow blobs and flames. */
export class Fleet {
  constructor(scene) {
    this.scene = scene; this.cars = []; this.group = new THREE.Group(); scene.add(this.group);
    const G = geos();
    this.glass = new THREE.MeshPhysicalNodeMaterial({ color: 0x0b1018, metalness: 0.1, roughness: 0.04, clearcoat: 1 });
    this.glass.colorNode = mix(vec3(0.03, 0.045, 0.07), vec3(0.012), step(1.2, positionGeometry.y));
    const MAXW = 8 * 4;
    const tire = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.3, 22); tire.rotateZ(Math.PI / 2);
    const rim = new THREE.CylinderGeometry(0.25, 0.25, 0.31, 20); rim.rotateZ(Math.PI / 2);
    const tireM = new THREE.MeshStandardNodeMaterial({ color: 0x121214, roughness: 0.85 });
    const rimM = new THREE.MeshStandardNodeMaterial({ metalness: 0.85, roughness: 0.3 });
    { const a = atan(positionGeometry.z, positionGeometry.y); const sp = smoothstep(0.32, 0.22, abs(fract(a.mul(5 / (2 * Math.PI))).sub(0.5))); const r = length(positionGeometry.yz);
      rimM.colorNode = mix(vec3(0.05), vec3(0.75, 0.76, 0.8), max(sp, smoothstep(0.2, 0.22, r)).mul(step(0.07, r))); }
    this.tires = new THREE.InstancedMesh(tire, tireM, MAXW); this.rims = new THREE.InstancedMesh(rim, rimM, MAXW);
    for (const w of [this.tires, this.rims]) { w.count = 0; w.castShadow = true; w.frustumCulled = false; w.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.group.add(w); }
    // contact shadows (soft radial blob — grounds the car even where the shadow map is coarse)
    const bt = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62); gr.addColorStop(0, 'rgba(0,0,0,0.85)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); return t; })();
    const bm = new THREE.MeshBasicNodeMaterial({ map: bt, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    const bg = new THREE.PlaneGeometry(2.7, 5.6); bg.rotateX(-Math.PI / 2);
    this.blobs = new THREE.InstancedMesh(bg, bm, 8); this.blobs.count = 0; this.blobs.frustumCulled = false; this.blobs.renderOrder = 1; this.group.add(this.blobs);
    // boost flames: additive cones out of twin exhausts
    this.uBoost = uniform(new THREE.Color('#38c8ff'));
    const fg = new THREE.ConeGeometry(0.13, 1, 10, 1, true); fg.translate(0, 0.5, 0); fg.rotateX(-Math.PI / 2); // base at the exhaust, tip toward -z
    const fm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const fz = positionGeometry.z.negate();
    fm.colorNode = mix(vec3(3.0, 2.8, 2.6), this.uBoost.mul(3.2), smoothstep(0.0, 0.5, fz)).mul(float(0.85).add(sin(time.mul(60).add(fz.mul(9))).mul(0.15)));
    fm.opacityNode = smoothstep(1.0, 0.1, fz);
    this.flames = new THREE.InstancedMesh(fg, fm, 16); this.flames.count = 0; this.flames.frustumCulled = false; this.group.add(this.flames);
    this.G = G; this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(0, 0, 0, 'YXZ'); this.v = new THREE.Vector3(); this.s = new THREE.Vector3(1, 1, 1);
    this.ghost = null;
  }
  add(color, accent) {
    const g = new THREE.Group(); const paint = makePaint(color, accent);
    const body = new THREE.Mesh(this.G.body, paint.m); body.castShadow = true; body.receiveShadow = true;
    const cabin = new THREE.Mesh(this.G.cabin, this.glass); cabin.castShadow = true;
    const uBrake = uniform(0.35), uHead = uniform(1);
    const lm = new THREE.MeshBasicNodeMaterial(); const tl = attribute('tl', 'float');
    lm.colorNode = mix(vec3(3.2, 3.3, 3.6).mul(uHead), vec3(6, 0.2, 0.15).mul(uBrake), tl);
    const lights = new THREE.Mesh(this.G.lights, lm);
    const tilt = new THREE.Group(); tilt.add(body, cabin, lights); g.add(tilt); this.group.add(g);
    const v = { g, tilt, paint, uBrake, uHead, lm, roll: 0, pitch: 0, spin: 0, steerVis: 0, lastVF: 0, hidden: false };
    this.cars.push(v); return v;
  }
  setGhost(on) {
    if (on && !this.ghost) {
      const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const f = pow(float(1).sub(abs(normalView.z)), 1.6);
      m.colorNode = vec3(0.25, 0.9, 1.6).mul(f.mul(1.2).add(0.15)); m.opacityNode = f.mul(0.7).add(0.12);
      const g = new THREE.Group(); g.add(new THREE.Mesh(this.G.body, m), new THREE.Mesh(this.G.cabin, m)); g.visible = false; this.scene.add(g); this.ghost = g;
    }
    if (this.ghost && !on) this.ghost.visible = false;
  }
  /** Copy physics state into meshes. cars = physics cars (same order as add()). */
  sync(cars, dt, { reducedMotion = false } = {}) {
    let w = 0, b = 0, f = 0; const m4 = this.m4, q = this.q, e = this.e, v = this.v, s = this.s;
    for (let k = 0; k < cars.length; k++) {
      const c = cars[k], V = this.cars[k]; if (!V) continue;
      V.g.visible = !V.hidden; if (V.hidden) continue;
      const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
      const gradeAlong = (c.loc.grade ?? 0) * (fx * (c.loc.tx ?? 0) + fz * (c.loc.tz ?? 1));
      const acc = (c.vF - V.lastVF) / Math.max(dt, 1e-3); V.lastVF = c.vF;
      const latA = c.yawRate * c.vF;
      const k1 = Math.min(1, dt * 6);
      V.roll += (Math.max(-0.075, Math.min(0.075, -latA * 0.0032)) - V.roll) * k1;
      V.pitch += (Math.max(-0.04, Math.min(0.04, -acc * 0.0016)) - V.pitch) * k1;
      const hop = c.hop > 0 ? Math.sin(c.hop * Math.PI) * 0.16 : 0;
      V.g.position.set(c.x, c.y + hop, c.z); V.g.rotation.set(-Math.atan(gradeAlong), c.yaw, 0, 'YXZ');
      V.tilt.rotation.set(reducedMotion ? 0 : V.pitch, 0, reducedMotion ? 0 : V.roll);
      V.uBrake.value = c.braking ? 1.6 : 0.4;
      V.spin += c.vF * dt / WHEEL_R; V.steerVis += ((c.drift ? -c.drift * 0.25 : c.steer * 0.42) - V.steerVis) * Math.min(1, dt * 10);
      V.g.updateMatrixWorld();
      for (const [sx, sz, front] of [[TRACKW, AXLE, 1], [-TRACKW, AXLE, 1], [TRACKW, -AXLE, 0], [-TRACKW, -AXLE, 0]]) {
        e.set(V.spin, front ? -V.steerVis : 0, 0, 'YXZ'); q.setFromEuler(e); v.set(sx, WHEEL_R, sz); s.set(1, 1, 1);
        m4.compose(v, q, s); m4.premultiply(V.g.matrixWorld); this.tires.setMatrixAt(w, m4); this.rims.setMatrixAt(w, m4); w++;
      }
      e.set(0, c.yaw, 0, 'YXZ'); q.setFromEuler(e); v.set(c.x, c.y + 0.05, c.z); s.set(1, 1, 1); m4.compose(v, q, s); this.blobs.setMatrixAt(b++, m4);
      if (c.boosting) for (const sx of [-0.36, 0.36]) {
        v.set(sx, 0.36, -2.28).applyMatrix4(V.g.matrixWorld); e.set(V.g.rotation.x, c.yaw, 0, 'YXZ'); q.setFromEuler(e);
        const L = 0.9 + Math.random() * 0.8 + (c.boostT > 0 ? 0.3 : 0); s.set(1.1, 1.1, L); m4.compose(v, q, s); this.flames.setMatrixAt(f++, m4);
      }
    }
    this.tires.count = this.rims.count = w; this.blobs.count = b; this.flames.count = f;
    this.tires.instanceMatrix.needsUpdate = this.rims.instanceMatrix.needsUpdate = this.blobs.instanceMatrix.needsUpdate = this.flames.instanceMatrix.needsUpdate = true;
  }
  ghostPose(p) { if (!this.ghost) return; if (!p) { this.ghost.visible = false; return; } this.ghost.visible = true; this.ghost.position.set(p.x, p.y, p.z); this.ghost.rotation.set(0, p.yaw, 0); }
  dispose() {
    this.group.removeFromParent(); this.ghost?.removeFromParent();
    for (const V of this.cars) { V.paint.m.dispose(); V.lm.dispose(); }
    this.cars = [];
  }
}

/** Static car mesh for menus/podium thumbnails (shares geometry). */
export function showroomCar(color, accent) {
  const G = geos(); const paint = makePaint(color, accent); const g = new THREE.Group();
  const glass = new THREE.MeshPhysicalNodeMaterial({ color: 0x0b1018, metalness: 0.1, roughness: 0.04 });
  g.add(new THREE.Mesh(G.body, paint.m), new THREE.Mesh(G.cabin, glass)); return { g, paint };
}
export { vec2, uv, instancedBufferAttribute };
