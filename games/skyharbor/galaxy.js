// Galaxy view: the Lantern Cluster star map. Spiral-arm starfield (instanced sprites), systems with TSL planets
// (atmosphere limb, rings, city lights), scan pulses, scanner range rings and visitor traffic arcs.
import * as THREE from 'three/webgpu';
import { Fn, uniform, vec3, vec4, float, uv, length, smoothstep, pow, max, mix, instancedBufferAttribute, time, sin, fract, positionLocal, abs } from 'three/tsl';
import * as S from './shaders.js';
import { spaceBackground } from '/shared/sd-kit.js';
import { SOURCE_WORLDS, scanRange, inScanRange, START_POS } from './sim.js';
import { mulberry32 } from './noise.js';

const C = (h) => new THREE.Color(h);
function glowSprite(color, size, { opacity = 1 } = {}) {
  const mat = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const c = uniform(C(color)), op = uniform(opacity);
  const d = length(uv().sub(0.5)).mul(2);
  mat.colorNode = c.mul(pow(max(float(0), float(1).sub(d)), 2.4).add(pow(max(float(0), float(1).sub(d.mul(3.5))), 3).mul(2.0))).mul(op);
  const s = new THREE.Sprite(mat); s.scale.setScalar(size); s.userData.c = c; s.userData.op = op; return s;
}

export class Galaxy {
  constructor(renderer, st) {
    this.st = st;
    const scene = this.scene = new THREE.Scene();
    spaceBackground(scene, { nebulaA: 0x3a1a6e, nebulaB: 0x0d4a7a, density: 1.1 });
    scene.add(new THREE.AmbientLight(0xffffff, 0.2));
    this.buildStarfield();
    this.systems = new Map();
    this.pick = [];
    const rng = mulberry32(st.seed + 5);
    for (const w of SOURCE_WORLDS) this.addSystem({ id: w.id, name: w.name, pos: w.pos, type: w.look, star: '#ffe8c8', seed: w.id.length * 97, scanned: true }, true, w.color);
    for (const sys of st.systems) this.addSystem(sys, false);
    // scanner range rings (one per settled world; pooled)
    this.rangeRings = [];
    const rmat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    rmat.colorNode = vec3(0.35, 0.7, 1.0).mul(smoothstep(0.96, 1.0, length(positionLocal.xy)).mul(0.5).add(sin(length(positionLocal.xy).mul(60).sub(time.mul(2))).mul(0.5).add(0.5).mul(0.06)));
    for (let i = 0; i < 8; i++) { const r = new THREE.Mesh(new THREE.CircleGeometry(1, 96), rmat); r.rotation.x = -Math.PI / 2; r.visible = false; scene.add(r); this.rangeRings.push(r); }
    // traffic arcs + ships along them
    this.arcMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const st2 = uv();
    this.arcMat.colorNode = vec3(0.55, 0.85, 1.0).mul(pow(fract(st2.x.mul(14).sub(time.mul(0.9))), 6).mul(1.6).add(0.12));
    this.arcs = []; this.arcShips = [];
    this.shipSprites = new THREE.InstancedMesh(new THREE.SphereGeometry(0.45, 8, 6), S.glowMaterial(0xcff6ff, { day: 3, night: 3 }), 120); this.shipSprites.count = 0; this.shipSprites.frustumCulled = false; scene.add(this.shipSprites);
    // scan pulses
    this.pulses = [];
    this.pulseMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.pulseOp = uniform(1);
    this.pulseMat.colorNode = vec3(0.4, 0.9, 1.0).mul(this.pulseOp);
    this.beams = new Map();
    this.selRing = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.12, 6, 64), S.glowMaterial(0xffd27a, { day: 3, night: 3 })); this.selRing.visible = false; scene.add(this.selRing);
    this.hoverRing = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.07, 6, 64), S.glowMaterial(0x9ad8ff, { day: 2, night: 2 })); this.hoverRing.visible = false; scene.add(this.hoverRing);
    this.sync();
  }
  buildStarfield() {
    const N = 5200, rng = mulberry32(77), pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N);
    const c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const arm = i % 3, t = Math.pow(rng(), 0.6), r = 8 + t * 230;
      const a = arm / 3 * Math.PI * 2 + t * 4.2 + (rng() - 0.5) * (0.5 + (1 - t) * 0.6);
      const spread = (rng() - 0.5) * 18 * (1 - t * 0.5);
      pos[i * 3] = Math.cos(a) * r + spread; pos[i * 3 + 1] = (rng() - 0.5) * (10 + (1 - t) * 26) * (rng() < 0.85 ? 0.5 : 1.5); pos[i * 3 + 2] = Math.sin(a) * r + spread;
      c.setHSL(0.55 + rng() * 0.2 - (rng() < 0.2 ? 0.5 : 0), 0.5, 0.65 + rng() * 0.3); col.set([c.r, c.g, c.b], i * 3);
      size[i] = 1.2 + Math.pow(rng(), 6) * 6;
    }
    const mat = new THREE.PointsNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: false });
    const pA = new THREE.InstancedBufferAttribute(pos, 3), cA = new THREE.InstancedBufferAttribute(col, 3), sA = new THREE.InstancedBufferAttribute(size, 1);
    mat.positionNode = instancedBufferAttribute(pA);
    mat.sizeNode = instancedBufferAttribute(sA).mul(1.6);
    const d = length(uv().sub(0.5)).mul(2);
    mat.colorNode = vec4(instancedBufferAttribute(cA).mul(pow(max(float(0), float(1).sub(d)), 2.5)).mul(1.6), 1);
    const sp = new THREE.Sprite(mat); sp.count = N; sp.frustumCulled = false; this.scene.add(sp);
    // galactic core glow
    const core = glowSprite(0xffd8a0, 120, { opacity: 0.35 }); this.scene.add(core);
    const core2 = glowSprite(0x9a7aff, 300, { opacity: 0.12 }); this.scene.add(core2);
  }
  addSystem(sys, isSource, cityColor) {
    const g = new THREE.Group(); g.position.set(...sys.pos); this.scene.add(g);
    const star = glowSprite(sys.star || '#ffe8c8', isSource ? 15 : 11); g.add(star);
    const R = isSource ? 2.4 : 2.0;
    const offset = new THREE.Vector3(5.2, 0.6, 2.4);
    const light = offset.clone().negate().normalize();
    const type = sys.type === 'moon' ? 'giant' : sys.type;
    const pm = S.planetMaterial(type, { seed: sys.seed % 97, lightDir: light, cityLights: isSource ? 1 : 0 });
    pm.u.ambient.value = 0.06;
    const planet = new THREE.Mesh(new THREE.SphereGeometry(sys.type === 'moon' ? R * 1.5 : R, 48, 32), pm.mat); planet.position.copy(offset); g.add(planet);
    const atmo = S.atmosphereMaterial(S.PLANET_LOOK[type].atmo, light, { strength: 1.0 });
    const halo = new THREE.Mesh(new THREE.SphereGeometry((sys.type === 'moon' ? R * 1.5 : R) * 1.12, 32, 24), atmo.mat); halo.position.copy(offset); g.add(halo);
    let moon = null, moonPm = null;
    if (sys.type === 'moon') {
      const rm = S.ringMaterial(R * 2.0, R * 3.2, 0xe8d8b8, 0x8a7a68);
      const ring = new THREE.Mesh(new THREE.RingGeometry(R * 2.0, R * 3.2, 96, 1), rm.mat); ring.position.copy(offset); ring.rotation.set(-Math.PI / 2 + 0.4, 0, 0.2); g.add(ring);
      moonPm = S.planetMaterial('moon', { seed: sys.seed % 97, lightDir: light });
      moon = new THREE.Mesh(new THREE.SphereGeometry(0.7, 32, 20), moonPm.mat); g.add(moon);
    }
    // unknown veil: a dim grey sphere shown until scanned
    const veil = new THREE.Mesh(new THREE.SphereGeometry(R * 1.02, 24, 16), new THREE.MeshBasicNodeMaterial({ color: 0x3a4458 }));
    veil.position.copy(offset); g.add(veil);
    const q = glowSprite(0x7ab8ff, 6, { opacity: 0.7 }); q.position.copy(offset); g.add(q);
    const hit = new THREE.Mesh(new THREE.SphereGeometry(6, 8, 6), new THREE.MeshBasicNodeMaterial({ visible: false })); hit.userData.sys = sys.id; g.add(hit); this.pick.push(hit);
    this.systems.set(sys.id, { g, star, planet, halo, veil, q, pm, moon, moonPm, offset, sys, isSource, cityColor });
  }
  sync() {
    const st = this.st;
    for (const [id, o] of this.systems) {
      if (o.isSource) { o.veil.visible = o.q.visible = false; continue; }
      const sys = st.systems.find((s) => s.id === id);
      o.sys = sys;
      const known = sys.scanned;
      o.veil.visible = !known; o.planet.visible = o.halo.visible = known; if (o.moon) o.moon.visible = known;
      o.q.visible = !known; o.q.userData.op.value = inScanRange(st, sys) ? 0.9 : 0.25;
      o.pm.u.city.value = st.planets[id] ? 1 : 0;
      o.star.userData.op.value = known || inScanRange(st, sys) ? 1 : 0.45;
    }
    st.settled.forEach((id, i) => { const r = this.rangeRings[i]; if (!r) return; const s = st.systems.find((q) => q.id === id); r.visible = true; r.position.set(s.pos[0], s.pos[1] - 2, s.pos[2]); r.scale.setScalar(scanRange(st)); });
    for (let i = st.settled.length; i < this.rangeRings.length; i++) this.rangeRings[i].visible = false;
    if (!st.settled.length) { const r = this.rangeRings[0]; r.visible = true; r.position.set(START_POS[0], -2, START_POS[2]); r.scale.setScalar(46); }
    // traffic arcs: every source world → every settled world
    for (const a of this.arcs) { this.scene.remove(a.mesh); a.mesh.geometry.dispose(); }
    this.arcs = [];
    for (const id of st.settled) {
      const dst = this.systems.get(id); const to = dst.g.position.clone().add(dst.offset);
      for (const w of SOURCE_WORLDS) {
        const src = this.systems.get(w.id); const from = src.g.position.clone().add(src.offset);
        const mid = from.clone().lerp(to, 0.5); mid.y += from.distanceTo(to) * 0.22;
        const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
        const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.16, 5, false), this.arcMat);
        this.scene.add(mesh); this.arcs.push({ mesh, curve, w: w.id, id });
      }
    }
  }
  scanPulse(fromId, toId) {
    const st = this.st;
    const from = fromId ? this.systems.get(fromId).g.position.clone() : new THREE.Vector3(...START_POS);
    const to = this.systems.get(toId).g.position.clone();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 6, 64), this.pulseMat); ring.position.copy(from); ring.rotation.x = Math.PI / 2; this.scene.add(ring);
    this.pulses.push({ ring, t: 0 });
    const len = from.distanceTo(to);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, len, 6, 1, true), S.beamMaterial(0x7ad8ff, { len, nightOnly: false, strength: 1.4 }));
    beam.position.copy(from).lerp(to, 0.5); beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), to.clone().sub(from).normalize());
    this.scene.add(beam); this.beams.set(toId, beam);
  }
  endScan(id) { const b = this.beams.get(id); if (b) { this.scene.remove(b); this.beams.delete(id); } const o = this.systems.get(id); if (o) { const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.15, 6, 64), this.pulseMat); ring.position.copy(o.g.position).add(o.offset); ring.rotation.x = Math.PI / 2; this.scene.add(ring); this.pulses.push({ ring, t: 0, small: true }); } this.sync(); }
  select(id) { const o = id && this.systems.get(id); this.selRing.visible = !!o; if (o) this.selRing.position.copy(o.g.position).add(o.offset); this.selected = id; }
  hover(id) { const o = id && this.systems.get(id); this.hoverRing.visible = !!o && id !== this.selected; if (o) this.hoverRing.position.copy(o.g.position).add(o.offset); }
  update(dt, t, camera) {
    for (const [, o] of this.systems) {
      o.planet.rotation.y += dt * 0.05;
      if (o.moon) { const a = t * 0.4; o.moon.position.set(o.offset.x + Math.cos(a) * 5.4, o.offset.y + Math.sin(a) * 0.8, o.offset.z + Math.sin(a) * 5.4); o.moonPm.u.lightDir.value.copy(o.moon.position).negate().normalize(); }
    }
    this.selRing.quaternion.copy(camera.quaternion); this.hoverRing.quaternion.copy(camera.quaternion);
    for (let i = this.pulses.length - 1; i >= 0; i--) { const p = this.pulses[i]; p.t += dt * (p.small ? 1.2 : 0.5); p.ring.scale.setScalar(p.small ? 2 + p.t * 16 : 2 + p.t * 60); this.pulseOp.value = 1 - p.t; if (p.t >= 1) { this.scene.remove(p.ring); p.ring.geometry.dispose(); this.pulses.splice(i, 1); } }
    // ships along arcs (density from visitor flow)
    const m = this._m ??= new THREE.Matrix4(), v = this._v ??= new THREE.Vector3();
    let n = 0;
    for (const a of this.arcs) {
      const p = this.st.planets[a.id]; const flow = Math.min(5, Math.ceil(((p?.stats.visitors) || 0) / 160));
      for (let k = 0; k < flow && n < 120; k++) { const u = (t * 0.03 + k / flow + a.w.length * 0.13) % 1; a.curve.getPoint(u, v); m.makeTranslation(v.x, v.y, v.z); this.shipSprites.setMatrixAt(n++, m); }
    }
    this.shipSprites.count = n; this.shipSprites.instanceMatrix.needsUpdate = true;
  }
}
