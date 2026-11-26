// Atmosphere per map + time of day: TSL sky (zero draw calls), matched FogExp2, generated PMREM
// environment for metals, sun with a player-following shadow frustum, GPU rain, storm lightning.
import { THREE, settings } from '/shared/sd-kit.js';
import { Fn, uniform, vec3, vec2, float, positionWorldDirection, positionWorld, mix, smoothstep, pow, max, dot, normalize, mx_fractal_noise_float, fract, sin, floor, length, attribute, time, positionLocal, cameraPosition, mod, vertexColor } from 'three/tsl';
import { U } from './builder.js';

// Palettes: sky zenith, horizon, ground haze, sun colour/intensity, hemisphere, fog density, exposure.
const PRESETS = {
  day:   { zen: 0x3f78c4, hor: 0xbcd3e6, gnd: 0x8a8a80, sun: 0xfff0d8, sunI: 3.2, sunEl: 48, hemiS: 0xb8d4ff, hemiG: 0x6a5a48, hemiI: 1.15, fog: 0xb4c8da, dens: 0.0065, exp: 0.95, glow: 0.12, pool: 0.0, stars: 0, rim: 0x9ab8ff, rimI: 0.6, amb: 0.18, clouds: 0.55, wet: 0 },
  dusk:  { zen: 0x2a2f5e, hor: 0xf08a4a, gnd: 0x4a3328, sun: 0xff9a58, sunI: 2.4, sunEl: 9, hemiS: 0x9a86b8, hemiG: 0x3a2618, hemiI: 0.85, fog: 0xc47a52, dens: 0.0105, exp: 1.05, glow: 1.1, pool: 0.55, stars: 0.15, rim: 0x6a7cff, rimI: 0.5, amb: 0.14, clouds: 0.65, wet: 0 },
  night: { zen: 0x060b16, hor: 0x22324a, gnd: 0x0c1016, sun: 0xa8c0ee, sunI: 0.95, sunEl: 38, hemiS: 0x5a7cb0, hemiG: 0x161a22, hemiI: 0.9, fog: 0x202c40, dens: 0.0135, exp: 1.38, glow: 2.6, pool: 1.0, stars: 1, rim: 0x5c80c8, rimI: 0.35, amb: 0.1, clouds: 0.45, wet: 1 },
  storm: { zen: 0x23292f, hor: 0x5d6770, gnd: 0x262a2c, sun: 0xb8c4d0, sunI: 1.0, sunEl: 55, hemiS: 0x8a98a8, hemiG: 0x2a2a28, hemiI: 0.95, fog: 0x59636c, dens: 0.02, exp: 1.1, glow: 1.0, pool: 0.4, stars: 0, rim: 0x8aa0b8, rimI: 0.3, amb: 0.16, clouds: 0.95, wet: 1 },
};

export class Atmosphere {
  constructor(scene, renderer) {
    this.scene = scene; this.renderer = renderer;
    this.u = { zen: uniform(new THREE.Color()), hor: uniform(new THREE.Color()), gnd: uniform(new THREE.Color()), sunDir: uniform(new THREE.Vector3(0, 1, 0)), sunCol: uniform(new THREE.Color()), stars: uniform(0), clouds: uniform(0.5), flash: uniform(0) };
    const u = this.u;
    scene.backgroundNode = Fn(() => {
      const d = positionWorldDirection.normalize();
      const y = d.y;
      const up = smoothstep(-0.02, 0.45, y);
      let col = mix(u.hor, u.zen, pow(up, 0.7));
      col = mix(u.gnd, col, smoothstep(-0.12, 0.02, y));
      // sun disc + glow
      const sd = max(dot(d, u.sunDir.normalize()), 0);
      col = col.add(u.sunCol.mul(pow(sd, 900).mul(20).add(pow(sd, 12).mul(0.35))));
      // clouds: projected fractal noise, stretched horizontally
      const p = d.xz.div(max(y, 0.12)).mul(vec2(0.9, 1.6));
      const n = mx_fractal_noise_float(vec3(p.x.add(time.mul(0.004)), p.y, 0.3).mul(1.4), 4, 2.0, 0.5);
      const cl = smoothstep(0.02, 0.32, n.add(u.clouds.sub(0.5).mul(0.4))).mul(smoothstep(0.0, 0.25, y)).mul(u.clouds);
      const cloudCol = mix(u.hor.mul(0.9), u.sunCol.mul(0.5).add(u.zen.mul(0.4)), 0.35).add(u.flash.mul(0.8));
      col = mix(col, cloudCol, cl.mul(0.85));
      // stars
      const cell = floor(d.mul(220)); const h = fract(sin(dot(cell, vec3(127.1, 311.7, 74.7))).mul(43758.5453));
      const r = length(fract(d.mul(220)).sub(0.5));
      const star = smoothstep(0.985, 1.0, h).mul(smoothstep(0.35, 0.0, r)).mul(u.stars).mul(smoothstep(0.05, 0.3, y)).mul(float(1).sub(cl));
      col = col.add(vec3(star.mul(1.4)));
      return col.add(u.flash.mul(vec3(0.5, 0.55, 0.65)).mul(smoothstep(-0.1, 0.4, y)));
    })();
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.castShadow = true;
    const s = 42; Object.assign(this.sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 160 });
    const lo = settings.quality === 'low'; this.sun.shadow.mapSize.set(lo ? 1024 : 2048, lo ? 1024 : 2048); this.sun.shadow.radius = 2.5; this.sun.shadow.bias = -0.0005; this.sun.shadow.normalBias = 0.035;
    this.rim = new THREE.DirectionalLight(0xffffff, 0.5);
    this.amb = new THREE.AmbientLight(0xffffff, 0.1);
    scene.add(this.hemi, this.sun, this.sun.target, this.rim, this.amb);
    scene.fog = new THREE.FogExp2(0x888888, 0.01);
    this.sunAz = 0.6; this.flashT = 0; this.nextBolt = 8; this.preset = null;
  }
  apply(name, opts = {}) {
    const P = PRESETS[name] || PRESETS.day; this.preset = P; this.name = name;
    const u = this.u; u.zen.value.set(P.zen); u.hor.value.set(P.hor); u.gnd.value.set(P.gnd); u.sunCol.value.set(P.sun).multiplyScalar(name === 'night' ? 0.4 : 1);
    u.stars.value = P.stars; u.clouds.value = P.clouds;
    const el = (opts.sunEl ?? P.sunEl) * Math.PI / 180, az = opts.sunAz ?? this.sunAz;
    this.sunVec = new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
    u.sunDir.value.copy(this.sunVec);
    this.hemi.color.set(P.hemiS); this.hemi.groundColor.set(P.hemiG); this.hemi.intensity = P.hemiI;
    this.sun.color.set(P.sun); this.sun.intensity = P.sunI; this.rim.color.set(P.rim); this.rim.intensity = P.rimI; this.amb.intensity = P.amb;
    this.scene.fog.color.set(P.fog); this.scene.fog.density = P.dens * (opts.fogMul ?? 1);
    this.renderer.toneMappingExposure = P.exp * (opts.expMul ?? 1);
    U.glow.value = P.glow; U.pool.value = P.pool; U.wet.value = opts.wet ?? P.wet;
    this.baseHemi = P.hemiI;
    this.makeEnv(P);
  }
  makeEnv(P) {
    // equirect gradient env (sky/horizon/ground + sun hotspot) -> scene.environment; WebGPU PMREMs it automatically
    const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
    const hex = (h) => '#' + new THREE.Color(h).getHexString();
    const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, hex(P.zen)); gr.addColorStop(0.47, hex(P.hor)); gr.addColorStop(0.53, hex(P.gnd)); gr.addColorStop(1, hex(P.gnd));
    g.fillStyle = gr; g.fillRect(0, 0, 256, 128);
    const sx = ((Math.atan2(this.sunVec.z, this.sunVec.x) / (Math.PI * 2)) + 0.5) * 256, sy = (0.5 - Math.asin(this.sunVec.y) / Math.PI) * 128;
    const sg = g.createRadialGradient(sx, sy, 0, sx, sy, 40); sg.addColorStop(0, hex(P.sun)); sg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = sg; g.globalAlpha = Math.min(1, P.sunI / 3); g.fillRect(0, 0, 256, 128);
    const t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace;
    this.scene.environment?.dispose?.(); this.scene.environment = t; this.scene.environmentIntensity = this.name === 'night' ? 0.55 : 1.0;
  }
  follow(pos) {
    // shadow frustum follows the player, snapped to texels to avoid shimmering
    const s = this.sun, d = this.sunVec; const snap = 84 / 2048;
    const x = Math.round(pos.x / snap) * snap, z = Math.round(pos.z / snap) * snap;
    s.position.set(x + d.x * 70, d.y * 70, z + d.z * 70); s.target.position.set(x, 0, z);
    this.rim.position.set(-d.x * 50, 30, -d.z * 50);
  }
  update(dt, sfxThunder) {
    if (this.name === 'storm') {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) { this.nextBolt = 7 + Math.random() * 12; this.flashT = settings.flash ? 0.45 : 0; setTimeout(() => sfxThunder?.(), 300 + Math.random() * 1400); }
    }
    if (this.flashT > 0) {
      this.flashT -= dt; const k = this.flashT > 0.3 ? 1 : this.flashT > 0.2 ? 0.2 : this.flashT > 0.12 ? 0.8 : Math.max(0, this.flashT / 0.12) * 0.5;
      this.u.flash.value = k; this.hemi.intensity = this.baseHemi + k * 2.5;
    } else if (this.u.flash.value) { this.u.flash.value = 0; this.hemi.intensity = this.baseHemi; }
  }
}

// GPU rain: N streak quads whose positions wrap in a box around the camera (no per-frame CPU work).
export function makeRain(scene, count = 1400) {
  const pos = new Float32Array(count * 6 * 3), seed = new Float32Array(count * 6 * 3), corner = new Float32Array(count * 6 * 2);
  const C = [[-1, 0], [1, 0], [1, 1], [-1, 0], [1, 1], [-1, 1]];
  for (let i = 0; i < count; i++) {
    const sx = Math.random(), sy = Math.random(), sz = Math.random();
    for (let k = 0; k < 6; k++) { const o = (i * 6 + k); seed[o * 3] = sx; seed[o * 3 + 1] = sy; seed[o * 3 + 2] = sz; corner[o * 2] = C[k][0]; corner[o * 2 + 1] = C[k][1]; }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('seed', new THREE.BufferAttribute(seed, 3)); g.setAttribute('corner', new THREE.BufferAttribute(corner, 2));
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const box = vec3(36, 22, 36), uStrength = uniform(1);
  m.positionNode = Fn(() => {
    const s = attribute('seed', 'vec3'), c = attribute('corner', 'vec2');
    const fall = time.mul(float(16).add(s.y.mul(6)));
    const rel = vec3(s.x.mul(box.x), s.y.mul(box.y).sub(fall), s.z.mul(box.z));
    const cam = cameraPosition;
    const wrapped = vec3(mod(rel.x.sub(cam.x), box.x).sub(box.x.mul(0.5)), mod(rel.y.sub(cam.y), box.y).sub(box.y.mul(0.4)), mod(rel.z.sub(cam.z), box.z).sub(box.z.mul(0.5)));
    const base = cam.add(wrapped);
    return base.add(vec3(c.x.mul(0.008), c.y.mul(0.5), c.x.mul(0.008).mul(0.6))).add(vec3(c.y.mul(0.06), 0, 0));
  })();
  m.colorNode = vec3(0.5, 0.56, 0.66).mul(uStrength).mul(attribute('corner', 'vec2').y.mul(0.6).add(0.15)).mul(smoothstep(1.2, 4.5, length(positionWorld.sub(cameraPosition))));
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 5; scene.add(mesh);
  return { mesh, strength: uStrength };
}
export { PRESETS };
