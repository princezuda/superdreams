// Lantern Hold — renders the simulation state. Crowds are one InstancedMesh per enemy type (+eyes), every effect is pooled
// and instanced, towers are cached merged models. Lights are a FIXED pool (count never changes → no shader recompiles).
import { THREE, settings, sfx, voice, shake, flash, tween, ease } from '/shared/sd-kit.js';
import { uv, vec3, float, length, smoothstep, mix, clamp, pow, instancedBufferAttribute, sin, time, select, abs, step as tstep } from 'three/tsl';
import { ENEMIES, ENEMY_IDS, TOWERS } from './data.js';
import { towerStats } from './sim.js';
import { towerModel, enemyModel, heroModel, wardenModel } from './models.js';
import { materials, meshesFor } from './world.js';

const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _mT = new THREE.Matrix4(), _mR = new THREE.Matrix4(), _mS = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const _Y = new THREE.Vector3(0, 1, 0), _Z = new THREE.Vector3(0, 0, 1), _X = new THREE.Vector3(1, 0, 0);
const lerpAng = (a, b, k) => { let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI; if (d < -Math.PI) d += Math.PI * 2; return a + d * k; };
const rnd = (a, b) => a + Math.random() * (b - a);

// ---------------------------------------------------------------- sound helpers (rate-limited so ×3 speed never turns into noise)
const last = new Map();
function play(key, fn, gap = 0.07) { const t = performance.now() / 1000; if (t - (last.get(key) || 0) < gap) return; last.set(key, t); fn(); }
export const SFX = {
  twang: () => play('tw', () => voice({ type: 'triangle', f0: 1300, f1: 420, dur: 0.07, vol: 0.05 }), 0.09),
  thump: () => play('th', () => { voice({ type: 'sine', f0: 120, f1: 60, dur: 0.18, vol: 0.22 }); voice({ noise: true, dur: 0.1, vol: 0.06, filter: { f0: 700, f1: 200 } }); }, 0.12),
  boom: () => play('bm', () => { voice({ type: 'sine', f0: 90, f1: 35, dur: 0.35, vol: 0.3 }); voice({ noise: true, dur: 0.3, vol: 0.14, filter: { f0: 1400, f1: 150 } }); }, 0.1),
  zap: () => play('zp', () => voice({ type: 'sawtooth', f0: 1500, f1: 300, dur: 0.12, vol: 0.06, filter: { f0: 4000, f1: 800 } }), 0.08),
  hum: () => play('hm', () => voice({ type: 'sine', f0: 330, f1: 300, dur: 0.25, vol: 0.04 }), 0.4),
  clang: () => play('cl', () => voice({ type: 'square', f0: 900, f1: 700, dur: 0.05, vol: 0.03, filter: { f0: 3000 } }), 0.1),
  pop: () => play('pp', () => { voice({ type: 'sine', f0: 700, f1: 1300, dur: 0.09, vol: 0.07 }); }, 0.05),
  coin: () => play('cn', () => { voice({ type: 'triangle', f0: 1800, dur: 0.06, vol: 0.05 }); setTimeout(() => voice({ type: 'triangle', f0: 2400, dur: 0.08, vol: 0.04 }), 50); }, 0.12),
  leak: () => play('lk', () => { voice({ type: 'sine', f0: 220, f1: 200, dur: 0.6, vol: 0.2 }); voice({ type: 'sine', f0: 330, f1: 300, dur: 0.6, vol: 0.08 }); }, 0.3),
  horn: () => play('hr', () => { voice({ type: 'sawtooth', f0: 110, f1: 130, dur: 0.9, vol: 0.09, filter: { f0: 600, f1: 900 }, attack: 0.15 }); voice({ type: 'sawtooth', f0: 165, f1: 196, dur: 0.9, vol: 0.06, filter: { f0: 600, f1: 900 }, attack: 0.2 }); }, 1),
  flare: () => play('fl', () => { voice({ noise: true, dur: 0.5, vol: 0.12, filter: { type: 'bandpass', f0: 600, f1: 3000, q: 1.2 }, attack: 0.04 }); voice({ type: 'triangle', f0: 520, f1: 1040, dur: 0.4, vol: 0.06 }); }, 0.2),
  heal: () => play('he', () => voice({ type: 'sine', f0: 500, f1: 760, dur: 0.3, vol: 0.04 }), 0.5),
};

// ---------------------------------------------------------------- pooled billboard particles (one draw call per pool)
class Particles {
  constructor(parent, cap, { additive = true, soft = false } = {}) {
    this.cap = cap; this.n = 0;
    this.d = new Float32Array(cap * 16); // x y z vx vy vz life t s0 s1 r g b grav drag a0
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1); this.alpha.setUsage(THREE.DynamicDrawUsage);
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    const dd = length(uv().sub(0.5)).mul(2), a = instancedBufferAttribute(this.alpha);
    const shape = soft ? smoothstep(1.0, 0.2, dd) : pow(clamp(float(1).sub(dd), 0, 1), 2.0);
    mat.colorNode = additive ? vec3(shape.mul(a)) : vec3(1); mat.opacityNode = shape.mul(a);
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, cap);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3); this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.renderOrder = additive ? 6 : 4;
    parent.add(this.mesh);
  }
  emit(x, y, z, vx, vy, vz, life, s0, s1, col, { grav = 0, drag = 0, a0 = 1 } = {}) {
    if (this.n >= this.cap) return;
    const o = this.n++ * 16, d = this.d;
    d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = vx; d[o + 4] = vy; d[o + 5] = vz; d[o + 6] = life; d[o + 7] = 0; d[o + 8] = s0; d[o + 9] = s1;
    d[o + 10] = col.r; d[o + 11] = col.g; d[o + 12] = col.b; d[o + 13] = grav; d[o + 14] = drag; d[o + 15] = a0;
  }
  burst(n, x, y, z, speed, up, life, s0, s1, col, o) {
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, sp = speed * (0.4 + Math.random() * 0.6); this.emit(x, y, z, Math.cos(a) * sp, up * (0.4 + Math.random()), Math.sin(a) * sp, life * (0.6 + Math.random() * 0.6), s0, s1, col, o); }
  }
  clear() { this.n = 0; this.mesh.count = 0; }
  update(dt, cam) {
    const d = this.d; let w = 0;
    for (let i = 0; i < this.n; i++) {
      const o = i * 16; d[o + 7] += dt; if (d[o + 7] >= d[o + 6]) continue;
      d[o + 4] -= d[o + 13] * dt; const k = Math.max(0, 1 - d[o + 14] * dt); d[o + 3] *= k; d[o + 4] *= k; d[o + 5] *= k;
      d[o] += d[o + 3] * dt; d[o + 1] += d[o + 4] * dt; d[o + 2] += d[o + 5] * dt;
      if (w !== i) d.copyWithin(w * 16, o, o + 16);
      w++;
    }
    this.n = w;
    const ca = this.mesh.instanceColor.array, aa = this.alpha.array;
    for (let i = 0; i < w; i++) {
      const o = i * 16, k = d[o + 7] / d[o + 6], s = d[o + 8] + (d[o + 9] - d[o + 8]) * k;
      _m.compose(_v.set(d[o], d[o + 1], d[o + 2]), cam.quaternion, _s.set(s, s, s)); this.mesh.setMatrixAt(i, _m);
      ca[i * 3] = d[o + 10]; ca[i * 3 + 1] = d[o + 11]; ca[i * 3 + 2] = d[o + 12];
      aa[i] = d[o + 15] * Math.min(1, k * 8) * (1 - k);
    }
    this.mesh.count = w; this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true; this.alpha.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- simple instanced pool with per-instance colour
function pool(parent, geo, mat, cap, { order = 0, shadow = false } = {}) {
  const m = new THREE.InstancedMesh(geo, mat, cap);
  m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3); m.instanceColor.setUsage(THREE.DynamicDrawUsage);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.count = 0; m.renderOrder = order; m.castShadow = shadow;
  parent.add(m); return m;
}

const COL = {
  arrow: new THREE.Color(1.6, 1.5, 1.2), bolt: new THREE.Color(4, 3.4, 1.6), shell: new THREE.Color(4, 1.6, 0.4), bomblet: new THREE.Color(3.4, 1.4, 0.4),
  orb: new THREE.Color(2.2, 1.2, 4), wisp: new THREE.Color(4, 3, 1.4),
  spark: new THREE.Color(3, 1.6, 0.6), violet: new THREE.Color(1.4, 0.7, 2.6), mote: new THREE.Color(3.4, 2.8, 1.6), smoke: new THREE.Color(0.3, 0.27, 0.32),
  heal: new THREE.Color(0.8, 3, 1.4), gold: new THREE.Color(3.4, 2.6, 0.8), white: new THREE.Color(3, 3, 3), ice: new THREE.Color(1.6, 2.6, 3.4),
  beam: new THREE.Color(4, 3.2, 1.2), chain: new THREE.Color(1.8, 2.8, 4), flare: new THREE.Color(3, 2.4, 1.0), burn: new THREE.Color(2.2, 0.8, 0.2),
  aura: new THREE.Color(0.55, 0.42, 0.2), hearth: new THREE.Color(0.7, 0.3, 0.2), dawn: new THREE.Color(3, 2.6, 1.4), scorch: new THREE.Color(1.6, 0.6, 0.15),
};

export class View {
  constructor(scene, camera, floaterBox) {
    this.scene = scene; this.camera = camera; this.root = new THREE.Group(); this.root.name = 'view'; scene.add(this.root);
    this.floaterBox = floaterBox;
    this.glowP = new Particles(this.root, 1100, { additive: true });
    this.smokeP = new Particles(this.root, 260, { additive: false, soft: true });
    this.cb = settings.colorblind;
    // ---- enemies
    this.E = {};
    for (const type of ENEMY_IDS) {
      const md = enemyModel(type), cap = type === 'boss' ? 4 : 200;
      const emis = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3); emis.setUsage(THREE.DynamicDrawUsage);
      const mat = new THREE.MeshStandardNodeMaterial({ vertexColors: true, flatShading: true, roughness: 0.55 });
      mat.emissiveNode = instancedBufferAttribute(emis);
      let alpha = null;
      if (ENEMIES[type].stealth) {
        alpha = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1); alpha.setUsage(THREE.DynamicDrawUsage);
        mat.transparent = true; mat.opacityNode = instancedBufferAttribute(alpha);
      }
      const body = new THREE.InstancedMesh(md.solid, mat, cap); body.castShadow = true; body.count = 0; body.frustumCulled = false; body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      const eyes = md.glow ? new THREE.InstancedMesh(md.glow, materials().glow, cap) : null;
      if (eyes) { eyes.count = 0; eyes.frustumCulled = false; eyes.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.root.add(eyes); }
      this.root.add(body);
      let wings = null;
      if (md.wing) {
        const wm = new THREE.MeshStandardNodeMaterial({ vertexColors: true, flatShading: true, roughness: 0.6, side: THREE.DoubleSide });
        wm.emissiveNode = vec3(0.08, 0.04, 0.16);
        wings = [0, 1].map(() => { const w = new THREE.InstancedMesh(md.wing.solid, wm, cap); w.count = 0; w.frustumCulled = false; w.castShadow = true; w.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.root.add(w); return w; });
      }
      this.E[type] = { body, eyes, wings, emis, alpha, cap };
    }
    this.yaw = new Map(); this.ghosts = [];
    // ---- blob shadows + hp bars
    const blobMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, color: 0x000000 });
    blobMat.opacityNode = smoothstep(1.0, 0.25, length(uv().sub(0.5)).mul(2)).mul(0.42);
    const bg = new THREE.PlaneGeometry(1, 1); bg.rotateX(-Math.PI / 2);
    this.blobs = new THREE.InstancedMesh(bg, blobMat, 420); this.blobs.frustumCulled = false; this.blobs.count = 0; this.blobs.renderOrder = 1; this.root.add(this.blobs);
    this.hpFill = new THREE.InstancedBufferAttribute(new Float32Array(400), 1); this.hpFill.setUsage(THREE.DynamicDrawUsage);
    const hpMat = new THREE.MeshBasicNodeMaterial({ depthTest: false, transparent: true });
    {
      const f = instancedBufferAttribute(this.hpFill), x = uv().x, y = uv().y;
      const border = tstep(0.08, x).mul(tstep(x, 0.92 + 0.0)).mul(tstep(0.18, y)).mul(tstep(y, 0.82));
      hpMat.colorNode = mix(vec3(0.06, 0.05, 0.1), mix(vec3(0.18, 0.12, 0.22), vec3(1), tstep(x.sub(0.08).div(0.84), f)), border);
      hpMat.opacityNode = float(0.92);
    }
    this.hp = pool(this.root, new THREE.PlaneGeometry(1, 0.13), hpMat, 400, { order: 10 });
    // ---- projectiles + beams + ground glows
    const streakGeo = new THREE.BoxGeometry(0.05, 0.05, 0.5);
    this.streaks = pool(this.root, streakGeo, new THREE.MeshBasicNodeMaterial(), 220, { order: 2 });
    this.orbs = pool(this.root, new THREE.IcosahedronGeometry(0.11, 1), new THREE.MeshBasicNodeMaterial(), 160, { order: 2 });
    const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true); beamGeo.translate(0, 0.5, 0);
    this.beams = pool(this.root, beamGeo, new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), 120, { order: 7 });
    const gMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    {
      const d = length(uv().sub(0.5)).mul(2);
      const disc = smoothstep(1.0, 0.0, d).mul(0.55).add(smoothstep(0.82, 0.95, d).mul(smoothstep(1.0, 0.96, d)).mul(0.9));
      gMat.colorNode = vec3(disc); gMat.opacityNode = disc;
    }
    const gg = new THREE.PlaneGeometry(2, 2); gg.rotateX(-Math.PI / 2);
    this.glows = pool(this.root, gg, gMat, 96, { order: 3 });
    this.transientGlows = []; this.arcs = [];
    // ---- selection / range ring, move marker
    const ringMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    this.ringCol = new THREE.Color('#ffd27a');
    {
      const d = length(uv().sub(0.5)).mul(2);
      const edge = smoothstep(0.93, 0.975, d).mul(smoothstep(1.0, 0.985, d));
      const dash = sin(uv().x.sub(0.5).atan(uv().y.sub(0.5)).mul(36).add(time.mul(1.5))).mul(0.5).add(0.5).mul(0.6).add(0.4);
      const fill = smoothstep(1.0, 0.0, d).mul(0.1).mul(tstep(d, 1.0));
      this.ringU = { col: new THREE.Color() };
      ringMat.colorNode = vec3(1.0, 0.86, 0.5); ringMat.opacityNode = edge.mul(dash).add(fill);
    }
    this.ringMat = ringMat;
    this.ring = new THREE.Mesh(gg.clone(), ringMat); this.ring.renderOrder = 8; this.ring.visible = false; this.root.add(this.ring);
    this.ring2 = new THREE.Mesh(gg.clone(), ringMat); this.ring2.renderOrder = 8; this.ring2.visible = false; this.root.add(this.ring2);
    // ---- wardens, hero
    this.wardens = new THREE.InstancedMesh(wardenModel().solid, materials().solid, 72); this.wardens.castShadow = true; this.wardens.count = 0; this.wardens.frustumCulled = false; this.root.add(this.wardens);
    this.lunge = new Map();
    this.hero = new THREE.Group(); meshesFor(heroModel()).forEach((m) => this.hero.add(m)); this.root.add(this.hero);
    this.heroYaw = 0;
    // ---- towers
    this.towers = new Map(); this.modelCache = new Map();
    // ---- fixed light pool: [0] hero lantern, [1..3] effects
    this.lights = [0, 1, 2, 3].map((i) => { const l = new THREE.PointLight(i ? 0xffa050 : 0xffd49a, 0, i ? 7 : 6, 1.6); scene.add(l); return { l, life: 0, max: 1, i0: 0 }; });
    this.floaters = []; this.flPool = [];
  }

  attach(G) {
    this.G = G;
    for (const [, tv] of this.towers) this.root.remove(tv.g);
    this.towers.clear(); this.yaw.clear(); this.ghosts.length = 0; this.arcs.length = 0; this.transientGlows.length = 0;
    this.glowP.clear(); this.smokeP.clear();
    for (const f of this.floaters) f.el.remove(); this.floaters.length = 0;
    this.hideRange();
  }
  setColorblind(on) { this.cb = on; }

  // ---------------------------------------------------------------- towers
  towerParts(type, tier, branch) {
    const key = `${type}:${tier}:${branch || ''}`;
    if (!this.modelCache.has(key)) this.modelCache.set(key, towerModel(type, tier, branch));
    return this.modelCache.get(key);
  }
  makeTowerGroup(t) {
    const md = this.towerParts(t.type, t.tier, t.branch);
    const g = new THREE.Group(); meshesFor(md.body).forEach((m) => g.add(m));
    let head = null;
    if (md.head) { head = new THREE.Group(); meshesFor(md.head).forEach((m) => head.add(m)); head.position.y = md.headY; g.add(head); }
    g.position.set(t.x, 0, t.z);
    return { g, head, md, key: `${t.type}:${t.tier}:${t.branch || ''}`, yaw: 0, recoil: 0, pulse: 0, t };
  }
  syncTowers(dt, time) {
    const G = this.G, seen = new Set();
    for (const t of G.towers) {
      seen.add(t.id);
      let tv = this.towers.get(t.id);
      const key = `${t.type}:${t.tier}:${t.branch || ''}`;
      if (!tv) {
        tv = this.makeTowerGroup(t); this.towers.set(t.id, tv); this.root.add(tv.g);
        tv.g.scale.setScalar(0.01); tween(0.5, (k) => tv.g.scale.set(1, k, 1).multiplyScalar(Math.max(0.01, k)), { ease: ease.outBack });
        this.glowP.burst(18, t.x, 0.3, t.z, 2.2, 1.2, 0.7, 0.25, 0.05, COL.mote, { drag: 2 });
        this.smokeP.burst(10, t.x, 0.2, t.z, 1.6, 0.4, 1.0, 0.5, 1.2, COL.smoke, { drag: 2, a0: 0.5 });
      } else if (tv.key !== key) {
        const yaw = tv.yaw; this.root.remove(tv.g);
        tv = this.makeTowerGroup(t); tv.yaw = yaw; this.towers.set(t.id, tv); this.root.add(tv.g);
        tween(0.45, (k) => tv.g.scale.set(1 + 0.18 * Math.sin(k * Math.PI), 1 + 0.25 * Math.sin(k * Math.PI), 1 + 0.18 * Math.sin(k * Math.PI)), { ease: ease.outCubic });
        for (let i = 0; i < 26; i++) this.glowP.emit(t.x + rnd(-0.5, 0.5), rnd(0.2, 0.6), t.z + rnd(-0.5, 0.5), 0, rnd(1.5, 3.2), 0, rnd(0.6, 1.1), 0.18, 0.04, COL.gold, { drag: 1.2 });
        this.flashLight(t.x, 1.5, t.z, 0xffd27a, 8, 0.6);
      }
      tv.t = t;
      const D = TOWERS[t.type];
      if (tv.head) {
        if (tv.md.spin) tv.head.rotation.y += dt * (t.type === 'beacon' ? 1.2 : 0.9);
        else { tv.yaw = lerpAng(tv.yaw, t.aimYaw, Math.min(1, dt * 12)); tv.head.rotation.y = tv.yaw; }
        if (t.type === 'prism') tv.head.position.y = tv.md.headY + Math.sin(time * 2 + t.id) * 0.06;
        tv.recoil = Math.max(0, tv.recoil - dt * 4);
        if (t.type === 'mortar') tv.head.scale.set(1 + tv.recoil * 0.12, 1 - tv.recoil * 0.18, 1 + tv.recoil * 0.12);
      }
      void D;
    }
    for (const [id, tv] of this.towers) if (!seen.has(id)) {
      this.towers.delete(id);
      const g = tv.g;
      tween(0.35, (k) => { g.scale.setScalar(Math.max(0.01, 1 - k)); g.position.y = -k * 0.4; }, { ease: ease.inQuad }).then(() => this.root.remove(g));
      this.smokeP.burst(14, g.position.x, 0.3, g.position.z, 2, 0.5, 1.0, 0.5, 1.3, COL.smoke, { drag: 2, a0: 0.55 });
      this.glowP.burst(14, g.position.x, 0.5, g.position.z, 1.5, 2.5, 0.8, 0.14, 0.04, COL.gold, { grav: 3 });
    }
  }

  // ---------------------------------------------------------------- events → FX
  consume(events) {
    const G = this.G;
    for (const e of events) {
      switch (e.t) {
        case 'fire': {
          const tv = this.towers.get(e.id); if (!tv) break;
          if (e.type === 'archer') SFX.twang();
          else if (e.type === 'mortar') { SFX.thump(); tv.recoil = 1; const m = tv.md.muzzle; this.smokeP.burst(5, tv.t.x + m[0], m[1], tv.t.z + m[2], 0.6, 0.8, 0.8, 0.25, 0.6, COL.smoke, { drag: 2, a0: 0.5 }); }
          else if (e.type === 'prism') SFX.zap();
          break;
        }
        case 'pulse': { const tv = this.towers.get(e.id); if (tv) tv.pulse = 1; break; }
        case 'hit': {
          const c = e.kind === 'orb' ? COL.violet : e.kind === 'wisp' ? COL.wisp : e.kind === 'bolt' ? COL.bolt : COL.arrow;
          this.glowP.burst(e.kind === 'bolt' ? 10 : 5, e.x, e.y, e.z, e.kind === 'orb' ? 1.8 : 1.2, 1, 0.3, 0.14, 0.02, c, { drag: 3 });
          break;
        }
        case 'impact': {
          const big = e.kind === 'shell';
          this.glowP.burst(big ? 26 : 10, e.x, 0.15, e.z, big ? 3.2 : 2, big ? 3 : 2, 0.55, 0.22, 0.03, COL.spark, { grav: 6, drag: 1 });
          this.smokeP.burst(big ? 9 : 4, e.x, 0.25, e.z, 1.4 * e.r, 0.6, 1.2, 0.5 * e.r, 1.1 * e.r, COL.smoke, { drag: 2.5, a0: 0.6 });
          this.addGlow(e.x, e.z, e.r * 0.9, e.burn ? COL.burn : COL.scorch, 0.5);
          if (big) { SFX.boom(); this.flashLight(e.x, 0.8, e.z, 0xff9a4a, 9, 0.35); if (settings.shake) shake(0.035); }
          break;
        }
        case 'death': {
          const d = ENEMIES[e.type], s = d.size;
          this.glowP.burst(Math.round(8 + s * 14), e.x, e.y + s * 0.7, e.z, 1.3 + s, 1.8, 0.8, 0.22 * (0.6 + s), 0.03, COL.violet, { drag: 2.2 });
          this.smokeP.burst(Math.round(3 + s * 6), e.x, e.y + s * 0.5, e.z, 0.9, 0.8, 1.1, 0.3 + s * 0.5, 0.8 + s, new THREE.Color(0.12, 0.08, 0.2), { drag: 2, a0: 0.55 });
          this.glowP.emit(e.x, e.y + s, e.z, rnd(-0.2, 0.2), 1.3, rnd(-0.2, 0.2), 1.6, 0.34, 0.06, COL.mote, { drag: 0.6 }); // the freed light
          const yaw = this.yaw.get(e.id) ?? 0;
          this.ghosts.push({ type: e.type, x: e.x, y: e.y, z: e.z, yaw, t: 0 });
          this.yaw.delete(e.id);
          if (e.gold) this.floater(e.x, e.y + s + 0.6, e.z, `+${e.gold}`, 'gold');
          SFX.pop(); if (e.gold) SFX.coin();
          if (e.boss) { shake(0.4); flash('#ffd27a', 500, 0.45); this.flashLight(e.x, 2, e.z, 0xffe0a0, 22, 1.4); for (let i = 0; i < 80; i++) this.glowP.emit(e.x, 1.5, e.z, rnd(-4, 4), rnd(1, 6), rnd(-4, 4), rnd(1, 2), 0.3, 0.05, COL.mote, { drag: 1, grav: 1 }); }
          break;
        }
        case 'split': this.glowP.burst(10, e.x, 0.4, e.z, 2, 1.5, 0.5, 0.18, 0.03, new THREE.Color(1.6, 2.6, 0.6), { grav: 4 }); break;
        case 'leak': {
          SFX.leak(); shake(0.18 + 0.05 * e.lives); flash('#ff3a4a', 260, 0.35);
          const h = this.G.map.hold; this.glowP.burst(20, h[0] - 1.2, 1.2, h[1], 2.5, 2, 0.7, 0.24, 0.04, new THREE.Color(3, 0.5, 0.6), { drag: 2 });
          break;
        }
        case 'chain': {
          SFX.zap(); const p = e.pts;
          for (let i = 0; i < p.length - 1; i++) {
            let a = p[i];
            for (let k = 1; k <= 3; k++) { const f = k / 3, b = k === 3 ? p[i + 1] : [p[i][0] + (p[i + 1][0] - p[i][0]) * f + rnd(-0.25, 0.25), p[i][1] + (p[i + 1][1] - p[i][1]) * f + rnd(-0.2, 0.3), p[i][2] + (p[i + 1][2] - p[i][2]) * f + rnd(-0.25, 0.25)]; this.arcs.push({ a, b, t: 0, life: 0.22, w: 0.045, c: COL.chain }); a = b; }
            this.glowP.burst(6, p[i + 1][0], p[i + 1][1], p[i + 1][2], 1.5, 1, 0.3, 0.16, 0.02, COL.chain, { drag: 3 });
          }
          break;
        }
        case 'flare': {
          SFX.flare(); this.addGlow(e.x, e.z, e.r, COL.flare, 0.6, true); this.flashLight(e.x, 2.2, e.z, 0xffe0a0, 14, 0.5);
          for (let i = 0; i < 30; i++) { const a = i / 30 * 6.28; this.glowP.emit(e.x, 0.3, e.z, Math.cos(a) * e.r * 2, 0.4, Math.sin(a) * e.r * 2, 0.45, 0.25, 0.05, COL.flare, { drag: 3 }); }
          break;
        }
        case 'dawn': {
          sfx.magic(); SFX.flare(); shake(0.12); flash('#fff2c8', 300, 0.35);
          this.addGlow(e.x, e.z, e.r, COL.dawn, 0.9, true); this.flashLight(e.x, 1.5, e.z, 0xfff0c0, 20, 0.8);
          for (let i = 0; i < 48; i++) { const a = i / 48 * 6.28; this.glowP.emit(e.x, 0.4, e.z, Math.cos(a) * e.r * 2.4, rnd(0.2, 1.2), Math.sin(a) * e.r * 2.4, 0.6, 0.3, 0.05, COL.dawn, { drag: 2.5 }); }
          break;
        }
        case 'heal': { SFX.heal(); for (let i = 0; i < 12; i++) { const a = Math.random() * 6.28, r = Math.random() * e.r; this.glowP.emit(e.x + Math.cos(a) * r, 0.2, e.z + Math.sin(a) * r, 0, rnd(0.8, 1.6), 0, 0.8, 0.14, 0.03, COL.heal, { drag: 0.5 }); } break; }
        case 'summon': this.smokeP.burst(14, e.x, 0.6, e.z, 2.2, 0.8, 1.2, 0.6, 1.4, new THREE.Color(0.1, 0.05, 0.16), { drag: 2, a0: 0.7 }); shake(0.08); break;
        case 'swing': this.lunge.set(e.id, 1); SFX.clang(); break;
        case 'heroSwing': this.heroLunge = 1; SFX.clang(); break;
        case 'heroLevel': for (let i = 0; i < 30; i++) this.glowP.emit(G.hero.x + rnd(-0.4, 0.4), rnd(0, 0.4), G.hero.z + rnd(-0.4, 0.4), 0, rnd(1.5, 3), 0, rnd(0.6, 1.2), 0.16, 0.03, COL.gold, { drag: 1 }); sfx.chime(); break;
        case 'heroDown': case 'wardenDown': this.glowP.burst(12, e.x, 0.5, e.z, 1.2, 2, 0.8, 0.2, 0.04, COL.mote, { drag: 2 }); break;
        case 'wave': SFX.horn(); break;
        case 'boss': shake(0.25); break;
      }
    }
  }
  addGlow(x, z, r, c, life, ring = false) { if (this.transientGlows.length < 40) this.transientGlows.push({ x, z, r, c, life, t: 0, ring }); }
  flashLight(x, y, z, color, intensity, life) {
    let best = this.lights[1]; for (let i = 2; i < 4; i++) if (this.lights[i].life < best.life) best = this.lights[i];
    best.l.position.set(x, y, z); best.l.color.set(color); best.i0 = intensity; best.life = life; best.max = life;
  }
  floater(x, y, z, text, cls) {
    if (!this.floaterBox || this.floaters.length > 30) return;
    const el = this.flPool.pop() || document.createElement('div');
    el.className = 'floater ' + cls; el.textContent = text; this.floaterBox.appendChild(el);
    this.floaters.push({ el, x, y, z, t: 0 });
  }
  showRange(x, z, r, kind = 'gold') {
    this.ring.visible = true; this.ring.position.set(x, 0.08, z); this.ring.scale.setScalar(r / 1);
    void kind;
  }
  showRange2(x, z, r) { this.ring2.visible = true; this.ring2.position.set(x, 0.09, z); this.ring2.scale.setScalar(r); }
  hideRange() { this.ring.visible = false; this.ring2.visible = false; }

  // ---------------------------------------------------------------- per-frame
  sync(alpha, dt, t, sel) {
    const G = this.G, cam = this.camera; if (!G) return;
    const L = (a, b) => a + (b - a) * alpha;
    // ---- enemies
    const counts = {};
    for (const k of ENEMY_IDS) counts[k] = 0;
    let nb = 0, nh = 0;
    const blobs = this.blobs, hp = this.hp, hpC = hp.instanceColor.array, hpF = this.hpFill.array;
    const camQ = cam.quaternion;
    const writeEnemy = (type, x, y, z, yaw, sx, sy, emR, emG, emB, alphaV, flap, tilt) => {
      const E = this.E[type], i = counts[type]; if (i >= E.cap) return -1; counts[type]++;
      _q.setFromAxisAngle(_Y, yaw); if (tilt) { _q2.setFromAxisAngle(_Z, tilt); _q.multiply(_q2); }
      _m.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sx)); E.body.setMatrixAt(i, _m); if (E.eyes) E.eyes.setMatrixAt(i, _m);
      E.emis.array[i * 3] = emR; E.emis.array[i * 3 + 1] = emG; E.emis.array[i * 3 + 2] = emB;
      if (E.alpha) E.alpha.array[i] = alphaV;
      if (E.wings) for (let w = 0; w < 2; w++) { const sgn = w ? -1 : 1; _m2.copy(_m).multiply(_mT.makeTranslation(sgn * 0.08, 0.04, 0)).multiply(_mR.makeRotationZ(sgn * flap)).multiply(_mS.makeScale(sgn, 1, 1)); E.wings[w].setMatrixAt(i, _m2); }
      return i;
    };
    for (const e of G.enemies) {
      if (!e.alive) continue;
      const d = e.d, x = L(e.px, e.x), z = L(e.pz, e.z);
      let yaw = this.yaw.get(e.id); yaw = yaw == null ? e.yaw : lerpAng(yaw, e.yaw, Math.min(1, dt * 8)); this.yaw.set(e.id, yaw);
      const ph = e.age * (4 + d.speed * 5) + e.id;
      const appear = Math.min(1, e.age / 0.45);
      let y = e.y, sx = 1, sy = 1, tilt = 0;
      if (d.flying) y += Math.sin(ph * 0.5) * 0.12;
      else if (type_bouncy(e.type)) { const b = Math.abs(Math.sin(ph)); y += b * 0.08 * (e.heldBy ? 0.3 : 1); sy = 1 + (b - 0.5) * 0.12; sx = 1 - (b - 0.5) * 0.06; }
      else if (!e.heldBy) y += Math.abs(Math.sin(ph)) * 0.04;
      if (e.stunT > 0) tilt = Math.sin(t * 18 + e.id) * 0.18;
      if (e.heldBy) tilt += Math.sin(t * 9 + e.id) * 0.08;
      sx *= appear; sy *= appear;
      const fl = Math.max(0, e.flashT) / 0.12;
      const sl = e.slow > 0 ? 1 : 0, bn = e.burnT > 0 ? 0.6 + 0.4 * Math.sin(t * 20) : 0, mk = e.mark > 0 ? 1 : 0;
      const emR = 0.07 + fl * 1.3 + sl * 0.32 + bn * 0.6 + mk * 0.25, emG = 0.035 + fl * 1.2 + sl * 0.22 + bn * 0.22 + mk * 0.05, emB = 0.13 + fl * 1.2 + sl * 0.06 + mk * 0.1;
      const av = d.stealth ? (e.revealed ? 1 : 0.18 + 0.06 * Math.sin(t * 6 + e.id)) : 1;
      writeEnemy(e.type, x, y, z, yaw, sx, sy, emR, emG, emB, av, Math.sin(e.age * 16) * 0.7, tilt);
      if (nb < 420) { _m.compose(_v.set(x, 0.04, z), _q.identity(), _s.setScalar(d.size * 2.0 * (d.flying ? 0.8 : 1) * appear)); blobs.setMatrixAt(nb++, _m); }
      if ((e.hp < e.maxhp || d.boss) && nh < 400 && (e.revealed || !d.stealth)) {
        const w = d.boss ? 2.4 : 0.55 + d.size * 0.5;
        const top = y + (d.boss ? 3.4 : d.size * 1.6 + (d.flying ? 0.35 : 0.45));
        _m.compose(_v.set(x, top, z), camQ, _s.set(w, d.boss ? 1.6 : 1, 1)); hp.setMatrixAt(nh, _m);
        const f = Math.max(0, e.hp / e.maxhp); hpF[nh] = f;
        if (this.cb) _c.setRGB(f > 0.5 ? 0.2 : 1, f > 0.5 ? 0.6 : 0.6, f > 0.5 ? 1 : 0.1); else _c.setRGB(f > 0.5 ? 0.45 + (1 - f) : 1, f > 0.5 ? 0.95 : 0.35 + f, 0.25);
        hpC[nh * 3] = _c.r; hpC[nh * 3 + 1] = _c.g; hpC[nh * 3 + 2] = _c.b; nh++;
      }
    }
    // dying ghosts: shrink + sink + flash
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i]; g.t += dt; if (g.t > 0.35) { this.ghosts.splice(i, 1); continue; }
      const k = g.t / 0.35;
      writeEnemy(g.type, g.x, g.y - k * 0.3, g.z, g.yaw + k * 2, 1 - k * 0.9, (1 - k) * (1 + k * 0.4), 1.4 * (1 - k), 1.2 * (1 - k), 2 * (1 - k), 1 - k, 0, 0);
    }
    for (const k of ENEMY_IDS) {
      const E = this.E[k], n = counts[k];
      E.body.count = n; E.body.instanceMatrix.needsUpdate = true; E.emis.needsUpdate = true; if (E.alpha) E.alpha.needsUpdate = true;
      if (E.eyes) { E.eyes.count = n; E.eyes.instanceMatrix.needsUpdate = true; }
      if (E.wings) for (const w of E.wings) { w.count = n; w.instanceMatrix.needsUpdate = true; }
    }
    // ---- wardens + their hp bars
    let nw = 0;
    for (const s of G.soldiers) {
      if (s.dead > 0) continue;
      const x = L(s.px, s.x), z = L(s.pz, s.z);
      const lg = this.lunge.get(s.id) || 0; if (lg > 0) this.lunge.set(s.id, Math.max(0, lg - dt * 5));
      const fw = Math.sin(lg * Math.PI) * 0.18;
      _q.setFromAxisAngle(_Y, s.yaw);
      _m.compose(_v.set(x + Math.sin(s.yaw) * fw, Math.abs(Math.sin(t * 9 + s.id)) * (s.engaged ? 0.03 : 0), z + Math.cos(s.yaw) * fw), _q, _s.set(1, 1, 1));
      this.wardens.setMatrixAt(nw++, _m);
      if (s.hp < s.maxhp && nh < 400) {
        _m.compose(_v.set(x, 1.05, z), camQ, _s.set(0.5, 0.8, 1)); hp.setMatrixAt(nh, _m); hpF[nh] = s.hp / s.maxhp;
        hpC[nh * 3] = 0.45; hpC[nh * 3 + 1] = 0.75; hpC[nh * 3 + 2] = 1.0; nh++;
      }
    }
    this.wardens.count = nw; this.wardens.instanceMatrix.needsUpdate = true;
    // ---- hero
    const h = G.hero, hv = this.hero;
    hv.visible = !(h.dead > 0);
    if (hv.visible) {
      const x = L(h.px, h.x), z = L(h.pz, h.z);
      this.heroYaw = lerpAng(this.heroYaw, h.yaw, Math.min(1, dt * 10));
      const mv = h.moving ? Math.abs(Math.sin(t * 12)) * 0.07 : 0;
      this.heroLunge = Math.max(0, (this.heroLunge || 0) - dt * 5);
      const fw = Math.sin((this.heroLunge || 0) * Math.PI) * 0.2;
      hv.position.set(x + Math.sin(this.heroYaw) * fw, mv, z + Math.cos(this.heroYaw) * fw); hv.rotation.y = this.heroYaw;
      const s = 1.05 + 0.05 * (h.lvl - 1); hv.scale.setScalar(s);
      if (h.hp < h.maxhp && nh < 400) { _m.compose(_v.set(x, 1.75, z), camQ, _s.set(0.8, 1, 1)); hp.setMatrixAt(nh, _m); hpF[nh] = h.hp / h.maxhp; hpC[nh * 3] = 1; hpC[nh * 3 + 1] = 0.8; hpC[nh * 3 + 2] = 0.3; nh++; }
      const hl = this.lights[0]; hl.l.position.set(x + Math.sin(this.heroYaw + 1.2) * 0.3, 1.35, z + Math.cos(this.heroYaw + 1.2) * 0.3); hl.l.intensity = 5 + Math.sin(t * 7) * 0.4;
    } else this.lights[0].l.intensity = 0;
    hp.count = nh; hp.instanceMatrix.needsUpdate = true; hp.instanceColor.needsUpdate = true; this.hpFill.needsUpdate = true;
    // hero ground shadow
    if (hv.visible && nb < 420) { _m.compose(_v.set(hv.position.x, 0.04, hv.position.z), _q.identity(), _s.setScalar(0.8)); blobs.setMatrixAt(nb++, _m); }
    blobs.count = nb; blobs.instanceMatrix.needsUpdate = true;
    // ---- projectiles
    let ns = 0, no = 0;
    const sc = this.streaks.instanceColor.array, oc = this.orbs.instanceColor.array;
    for (const p of G.projectiles) {
      const x = L(p.px, p.x), y = L(p.py, p.y), z = L(p.pz, p.z);
      if (p.kind === 'arrow' || p.kind === 'bolt') {
        if (ns >= 220) continue;
        _v2.set(p.x - p.px, p.y - p.py, p.z - p.pz); if (_v2.lengthSq() < 1e-8) _v2.set(0, 0, 1);
        _q.setFromUnitVectors(_Z, _v2.normalize());
        _m.compose(_v.set(x, y, z), _q, _s.set(1, 1, p.kind === 'bolt' ? 1.8 : 1)); this.streaks.setMatrixAt(ns, _m);
        const c = COL[p.kind]; sc[ns * 3] = c.r; sc[ns * 3 + 1] = c.g; sc[ns * 3 + 2] = c.b; ns++;
        if (p.kind === 'bolt' && Math.random() < 0.6) this.glowP.emit(x, y, z, 0, 0, 0, 0.25, 0.12, 0.02, COL.bolt);
      } else {
        if (no >= 160) continue;
        const s = p.kind === 'shell' ? 1.5 : p.kind === 'bomblet' ? 0.8 : p.kind === 'wisp' ? 0.85 : 1.1;
        _m.compose(_v.set(x, y, z), _q.identity(), _s.setScalar(s)); this.orbs.setMatrixAt(no, _m);
        const c = COL[p.kind] || COL.orb; oc[no * 3] = c.r; oc[no * 3 + 1] = c.g; oc[no * 3 + 2] = c.b; no++;
        if (Math.random() < (p.kind === 'shell' ? 0.9 : 0.5)) {
          if (p.kind === 'shell') { this.glowP.emit(x, y, z, 0, 0, 0, 0.35, 0.22, 0.04, COL.spark); if (Math.random() < 0.4) this.smokeP.emit(x, y, z, 0, 0.2, 0, 0.8, 0.12, 0.35, COL.smoke, { a0: 0.35 }); }
          else this.glowP.emit(x, y, z, 0, 0, 0, 0.3, 0.12, 0.02, c);
        }
      }
    }
    this.streaks.count = ns; this.streaks.instanceMatrix.needsUpdate = true; this.streaks.instanceColor.needsUpdate = true;
    this.orbs.count = no; this.orbs.instanceMatrix.needsUpdate = true; this.orbs.instanceColor.needsUpdate = true;
    // ---- beams (Sun Lens) + chain arcs
    let nbm = 0; const bc = this.beams.instanceColor.array;
    const beam = (ax, ay, az, bx, by, bz, w, c, k = 1) => {
      if (nbm >= 120) return;
      _v2.set(bx - ax, by - ay, bz - az); const len = _v2.length(); if (len < 1e-3) return;
      _q.setFromUnitVectors(_Y, _v2.multiplyScalar(1 / len));
      _m.compose(_v.set(ax, ay, az), _q, _s.set(w, len, w)); this.beams.setMatrixAt(nbm, _m);
      bc[nbm * 3] = c.r * k; bc[nbm * 3 + 1] = c.g * k; bc[nbm * 3 + 2] = c.b * k; nbm++;
    };
    for (const tw of G.towers) {
      if (!(tw.branch === 'B' && tw.type === 'prism') || !tw.beamTgt) continue;
      const e = G.emap.get(tw.beamTgt); if (!e) continue;
      const tv = this.towers.get(tw.id); const my = tv ? tv.md.muzzle[1] : 2.2;
      const ex = L(e.px, e.x), ez = L(e.pz, e.z), ey = e.y + 0.3 + e.d.size * 0.4;
      const heat = Math.min(1, tw.lock / 3);
      beam(tw.x, my, tw.z, ex, ey, ez, 0.03 + heat * 0.05, COL.beam, 0.6 + heat * 0.8 + Math.sin(t * 40) * 0.1);
      beam(tw.x, my, tw.z, ex, ey, ez, 0.1 + heat * 0.08, COL.beam, 0.18);
      if (Math.random() < 0.5) this.glowP.emit(ex, ey, ez, rnd(-1, 1), rnd(0.5, 1.5), rnd(-1, 1), 0.3, 0.14, 0.02, COL.beam, { drag: 2 });
    }
    for (let i = this.arcs.length - 1; i >= 0; i--) {
      const a = this.arcs[i]; a.t += dt; if (a.t > a.life) { this.arcs.splice(i, 1); continue; }
      const k = 1 - a.t / a.life; beam(a.a[0], a.a[1], a.a[2], a.b[0], a.b[1], a.b[2], a.w * (0.6 + k * 0.6), a.c, 0.6 + k);
    }
    this.beams.count = nbm; this.beams.instanceMatrix.needsUpdate = true; this.beams.instanceColor.needsUpdate = true;
    // ---- ground glows: beacon light pools, burning ground, transient flashes
    let ng = 0; const gc = this.glows.instanceColor.array;
    const glow = (x, z, r, c, k) => { if (ng >= 96) return; _m.compose(_v.set(x, 0.06 + ng * 0.0008, z), _q.identity(), _s.set(r, 1, r)); this.glows.setMatrixAt(ng, _m); gc[ng * 3] = c.r * k; gc[ng * 3 + 1] = c.g * k; gc[ng * 3 + 2] = c.b * k; ng++; };
    for (const tw of G.towers) {
      if (TOWERS[tw.type].kind !== 'aura') continue;
      const st = towerStats(tw), tv = this.towers.get(tw.id);
      if (tv) tv.pulse = Math.max(0, tv.pulse - dt * 2.5);
      glow(tw.x, tw.z, st.range, st.mark ? COL.hearth : COL.aura, 0.55 + (tv ? tv.pulse * 0.6 : 0) + (tw.active ? 0.15 : 0));
    }
    for (const zn of G.zones) glow(zn.x, zn.z, zn.r, COL.burn, Math.min(1, zn.t) * (0.8 + Math.sin(t * 14 + zn.x) * 0.2));
    for (let i = this.transientGlows.length - 1; i >= 0; i--) {
      const g = this.transientGlows[i]; g.t += dt; if (g.t > g.life) { this.transientGlows.splice(i, 1); continue; }
      const k = g.t / g.life; glow(g.x, g.z, g.r * (g.ring ? 0.3 + k * 0.8 : 1), g.c, (1 - k) * (g.ring ? 1.4 : 1));
    }
    if (sel?.heroSel && hv.visible) glow(hv.position.x, hv.position.z, 0.75, COL.gold, 0.8 + Math.sin(t * 6) * 0.2);
    if (sel?.marker) { const mk = sel.marker; mk.t += dt; if (mk.t < 0.8) glow(mk.x, mk.z, 0.6 * (1 - mk.t * 0.5), COL.gold, 1.2 * (1 - mk.t / 0.8)); }
    this.glows.count = ng; this.glows.instanceMatrix.needsUpdate = true; this.glows.instanceColor.needsUpdate = true;
    // ---- particles, lights, floaters
    this.glowP.update(dt, cam); this.smokeP.update(dt, cam);
    for (let i = 1; i < 4; i++) { const p = this.lights[i]; if (p.life > 0) { p.life -= dt; p.l.intensity = p.i0 * Math.max(0, p.life / p.max); } else p.l.intensity = 0; }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i]; f.t += dt;
      if (f.t > 1.1) { f.el.remove(); this.flPool.push(f.el); this.floaters.splice(i, 1); continue; }
      _v.set(f.x, f.y + f.t * 0.9, f.z).project(cam);
      f.el.style.transform = `translate(${(_v.x * 0.5 + 0.5) * innerWidth}px,${(-_v.y * 0.5 + 0.5) * innerHeight}px) translate(-50%,-50%)`;
      f.el.style.opacity = String(Math.min(1, (1.1 - f.t) * 3));
    }
  }
  drawInfo() { let n = 0; this.root.traverse((o) => { if (o.isMesh) n++; }); return n; }
}
function type_bouncy(type) { return type === 'gloomling' || type === 'blob' || type === 'mite'; }
export { COL };
