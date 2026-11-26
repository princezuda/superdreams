// Apex Drift — atmosphere per theme: TSL sky (zero draw calls), matched FogExp2, generated environment map for car
// paint, sun with a player-following shadow frustum, procedural water, GPU snowfall, texture cache.
import { THREE, settings } from '/shared/sd-kit.js';
import { Fn, uniform, vec3, vec2, float, positionWorldDirection, positionWorld, mix, smoothstep, pow, max, dot, mx_fractal_noise_float, fract, sin, floor, length, time, attribute, cameraPosition, mod, texture, normalMap, uv, abs } from 'three/tsl';

export const THEMES = {
  coast: { zen: 0x24306e, hor: 0xffa767, gnd: 0x7a4a48, sun: 0xffb46a, sunI: 3.0, sunEl: 7, sunAz: 3.25, sunSize: 1.0, hemiS: 0xffc8a0, hemiG: 0x4a3040, hemiI: 1.05,
    rim: 0x7f8cff, rimI: 0.9, amb: 0.18, fog: 0xd99a7c, dens: 0.00085, exp: 1.0, stars: 0.0, clouds: 0.55, cloudTint: 0xff9a7a, glow: 1.0, tone: 'aces' },
  city: { zen: 0x03040c, hor: 0x2b1844, gnd: 0x0a0812, sun: 0x9fb4ff, sunI: 0.7, sunEl: 40, sunAz: 0.9, sunSize: 0.0, hemiS: 0x5a6aa8, hemiG: 0x26142e, hemiI: 0.75,
    rim: 0xff4fd8, rimI: 0.55, amb: 0.14, fog: 0x1c1232, dens: 0.0021, exp: 1.25, stars: 0.8, clouds: 0.35, cloudTint: 0x4a2c70, glow: 0.0, tone: 'aces' },
  alpine: { zen: 0x1f58c4, hor: 0xc6dcf2, gnd: 0x8a98ac, sun: 0xfff0dc, sunI: 2.6, sunEl: 26, sunAz: 0.65, sunSize: 0.7, hemiS: 0xbcd4ff, hemiG: 0x4a5a7a, hemiI: 0.85,
    rim: 0xa8c8ff, rimI: 0.5, amb: 0.1, fog: 0xb4cae2, dens: 0.00085, exp: 0.82, stars: 0, clouds: 0.6, cloudTint: 0xffffff, glow: 0.3, tone: 'aces' },
};

// ---------------------------------------------------------------- textures (CC0 Poly Haven, see CREDITS.txt)
const loader = new THREE.TextureLoader();
const texCache = {};
export function loadTextures(onProgress) {
  const list = [['asphalt_c', 1], ['asphalt_n', 0], ['grass_c', 1], ['grass_n', 0], ['rock_c', 1], ['rock_n', 0], ['snow_c', 1], ['snow_n', 0]];
  let done = 0;
  return Promise.all(list.map(([k, srgb]) => new Promise((res) => {
    loader.load(new URL(`./assets/tex/${k}.jpg`, import.meta.url).href, (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      texCache[k] = t; onProgress?.(++done / list.length); res(t);
    }, undefined, () => { // missing asset: fall back to a flat texture so the game still runs
      const c = document.createElement('canvas'); c.width = c.height = 4; const g = c.getContext('2d'); g.fillStyle = srgb ? '#777' : '#8080ff'; g.fillRect(0, 0, 4, 4);
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; texCache[k] = t; onProgress?.(++done / list.length); res(t);
    });
  })));
}
export const tex = (k) => texCache[k];

// ---------------------------------------------------------------- sky + lights + fog
export class Atmosphere {
  constructor(scene, renderer) {
    this.scene = scene; this.renderer = renderer;
    const u = this.u = { zen: uniform(new THREE.Color()), hor: uniform(new THREE.Color()), gnd: uniform(new THREE.Color()), sunDir: uniform(new THREE.Vector3(0, 1, 0)),
      sunCol: uniform(new THREE.Color()), sunSize: uniform(1), stars: uniform(0), clouds: uniform(0.5), cloudTint: uniform(new THREE.Color()), glow: uniform(1) };
    scene.backgroundNode = Fn(() => {
      const d = positionWorldDirection.normalize(); const y = d.y;
      let col = mix(u.hor, u.zen, pow(smoothstep(-0.02, 0.55, y), 0.65));
      col = mix(u.gnd, col, smoothstep(-0.1, 0.015, y));
      const sd = max(dot(d, u.sunDir), 0);
      // sun disc + wide warm halo (the halo also tints the horizon band toward the sun)
      col = col.add(u.sunCol.mul(pow(sd, 1400).mul(26).mul(u.sunSize)));
      col = col.add(u.sunCol.mul(pow(sd, 10).mul(0.45).add(pow(sd, 3).mul(0.18)).mul(u.glow)).mul(smoothstep(-0.15, 0.2, y)));
      // clouds: projected fractal noise, stretched along the horizon; lit by the sun on the near side
      const p = d.xz.div(max(y, 0.1)).mul(vec2(0.7, 1.4));
      const n = mx_fractal_noise_float(vec3(p.x.add(time.mul(0.003)), p.y, 0.4).mul(1.2), 4, 2.0, 0.5);
      const cl = smoothstep(0.04, 0.34, n.add(u.clouds.sub(0.5).mul(0.35))).mul(smoothstep(0.0, 0.22, y)).mul(u.clouds);
      const lit = mix(u.cloudTint, u.sunCol.mul(1.4), pow(sd, 6).mul(0.8));
      col = mix(col, lit.mul(mix(float(0.7), float(1.05), smoothstep(0.0, 0.3, y))), cl.mul(0.8));
      // stars
      const cell = floor(d.mul(240)); const h = fract(sin(dot(cell, vec3(127.1, 311.7, 74.7))).mul(43758.5453));
      const r = length(fract(d.mul(240)).sub(0.5));
      const star = smoothstep(0.986, 1.0, h).mul(smoothstep(0.35, 0.0, r)).mul(u.stars).mul(smoothstep(0.08, 0.35, y)).mul(float(1).sub(cl));
      return col.add(vec3(star.mul(1.6)));
    })();
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    this.sun = new THREE.DirectionalLight(0xffffff, 2); this.sun.castShadow = settings.quality !== 'low';
    const s = 46; Object.assign(this.sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 260 });
    this.sun.shadow.mapSize.set(2048, 2048); this.sun.shadow.radius = 2.5; this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.04;
    this.rim = new THREE.DirectionalLight(0xffffff, 0.5); this.amb = new THREE.AmbientLight(0xffffff, 0.1);
    scene.add(this.hemi, this.sun, this.sun.target, this.rim, this.amb);
    scene.fog = new THREE.FogExp2(0x888888, 0.002);
  }
  apply(name) {
    const P = THEMES[name]; this.P = P; this.name = name; const u = this.u;
    u.zen.value.set(P.zen); u.hor.value.set(P.hor); u.gnd.value.set(P.gnd); u.sunCol.value.set(P.sun); u.sunSize.value = P.sunSize; u.stars.value = P.stars;
    u.clouds.value = P.clouds; u.cloudTint.value.set(P.cloudTint); u.glow.value = P.glow;
    const el = P.sunEl * Math.PI / 180, az = P.sunAz;
    this.sunVec = new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).normalize();
    u.sunDir.value.copy(this.sunVec);
    this.hemi.color.set(P.hemiS); this.hemi.groundColor.set(P.hemiG); this.hemi.intensity = P.hemiI;
    this.sun.color.set(P.sun); this.sun.intensity = P.sunI; this.rim.color.set(P.rim); this.rim.intensity = P.rimI; this.amb.intensity = P.amb;
    this.scene.fog.color.set(P.fog); this.scene.fog.density = P.dens;
    this.renderer.toneMappingExposure = P.exp;
    this.makeEnv(P);
  }
  makeEnv(P) {
    // equirect gradient env (zenith/horizon/ground + sun hotspot + a few bright "city light" spots at night)
    const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
    const hex = (h) => '#' + new THREE.Color(h).getHexString();
    const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, hex(P.zen)); gr.addColorStop(0.46, hex(P.hor)); gr.addColorStop(0.52, hex(P.gnd)); gr.addColorStop(1, hex(P.gnd));
    g.fillStyle = gr; g.fillRect(0, 0, 512, 256);
    const sx = ((Math.atan2(this.sunVec.z, this.sunVec.x) / (Math.PI * 2)) + 0.5) * 512, sy = (0.5 - Math.asin(this.sunVec.y) / Math.PI) * 256;
    if (P.sunSize > 0) { const sg = g.createRadialGradient(sx, sy, 0, sx, sy, 70); sg.addColorStop(0, '#fff6e0'); sg.addColorStop(0.15, hex(P.sun)); sg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = sg; g.fillRect(0, 0, 512, 256); }
    if (this.name === 'city') { // neon city reflections: coloured light strips around the horizon
      const cols = ['#ff3fd0', '#29e8ff', '#ffb02e', '#7d5cff'];
      for (let i = 0; i < 40; i++) { g.fillStyle = cols[i % 4]; g.globalAlpha = 0.55; g.fillRect((i * 97) % 512, 112 + (i * 13) % 26, 6 + (i % 5) * 4, 3 + (i % 3) * 3); }
      g.globalAlpha = 1;
    }
    const t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace;
    this.scene.environment?.dispose?.(); this.scene.environment = t; this.scene.environmentIntensity = this.name === 'city' ? 0.9 : 1.0;
  }
  follow(pos) {
    // shadow frustum follows the camera target, snapped to texels to avoid shimmering
    const s = this.sun, d = this.sunVec; const snap = 92 / 2048;
    const x = Math.round(pos.x / snap) * snap, z = Math.round(pos.z / snap) * snap, y = pos.y;
    s.position.set(x + d.x * 120, y + d.y * 120 + 10, z + d.z * 120); s.target.position.set(x, y, z);
    this.rim.position.set(x - d.x * 50, y + 40, z - d.z * 50); this.rim.target = s.target;
  }
}

// ---------------------------------------------------------------- water (coast): scrolled procedural wave normals
let waveTex = null;
function waveNormals() {
  if (waveTex) return waveTex;
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'); const img = g.createImageData(N, N);
  const H = new Float32Array(N * N); const waves = [];
  for (let k = 0; k < 14; k++) { const a = Math.random() * Math.PI * 2, f = 1 + Math.floor(Math.random() * 6); waves.push([Math.round(Math.cos(a) * f), Math.round(Math.sin(a) * f) || 1, Math.random() * 6.28, 1 / f]); }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let h = 0; for (const [fx, fy, ph, am] of waves) h += Math.sin((fx * x + fy * y) / N * Math.PI * 2 + ph) * am; H[y * N + x] = h; }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = H[y * N + (x + 1) % N] - H[y * N + (x - 1 + N) % N], dy = H[((y + 1) % N) * N + x] - H[((y - 1 + N) % N) * N + x];
    const nx = -dx * 2.2, ny = -dy * 2.2, nz = 1, l = Math.hypot(nx, ny, nz); const o = (y * N + x) * 4;
    img.data[o] = (nx / l * 0.5 + 0.5) * 255; img.data[o + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[o + 2] = (nz / l * 0.5 + 0.5) * 255; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0); waveTex = new THREE.CanvasTexture(c); waveTex.wrapS = waveTex.wrapT = THREE.RepeatWrapping; return waveTex;
}
export function makeWater(size, y, { deep = 0x0d2f4a, shallow = 0x2f7f8a } = {}) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.06, metalness: 0.0 });
  const wt = waveNormals();
  const p = positionWorld.xz;
  const n1 = texture(wt, p.div(46).add(vec2(time.mul(0.011), time.mul(0.006)))).rgb, n2 = texture(wt, p.div(17).sub(vec2(time.mul(0.017), time.mul(-0.009)))).rgb;
  m.normalNode = normalMap(n1.add(n2).mul(0.5), vec2(0.55, 0.55));
  const dist = length(positionWorld.xz.sub(cameraPosition.xz));
  m.colorNode = mix(vec3(new THREE.Color(shallow)), vec3(new THREE.Color(deep)), smoothstep(40, 420, dist));
  const g = new THREE.PlaneGeometry(size, size, 1, 1); g.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(g, m); mesh.position.y = y; mesh.receiveShadow = false; return mesh;
}

// ---------------------------------------------------------------- GPU snowfall: flakes wrap in a box around the camera
export function makeSnow(count = 2600) {
  const seed = new Float32Array(count * 6 * 3), corner = new Float32Array(count * 6 * 2), pos = new Float32Array(count * 6 * 3);
  const C = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
  for (let i = 0; i < count; i++) { const sx = Math.random(), sy = Math.random(), sz = Math.random(); for (let k = 0; k < 6; k++) { const o = i * 6 + k; seed.set([sx, sy, sz], o * 3); corner.set(C[k], o * 2); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('seed', new THREE.BufferAttribute(seed, 3)); g.setAttribute('corner', new THREE.BufferAttribute(corner, 2));
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const box = vec3(70, 34, 70), uWind = uniform(new THREE.Vector3(2.5, 0, 1));
  m.positionNode = Fn(() => {
    const s = attribute('seed', 'vec3'), c = attribute('corner', 'vec2');
    const fall = time.mul(float(2.2).add(s.y.mul(1.6)));
    const sway = vec3(sin(time.mul(0.9).add(s.x.mul(40))).mul(1.2), 0, sin(time.mul(0.7).add(s.z.mul(40))).mul(1.2));
    const rel = vec3(s.x.mul(box.x), s.y.mul(box.y).sub(fall), s.z.mul(box.z)).add(uWind.mul(time)).add(sway);
    const cam = cameraPosition;
    const w = vec3(mod(rel.x.sub(cam.x), box.x).sub(box.x.mul(0.5)), mod(rel.y.sub(cam.y), box.y).sub(box.y.mul(0.45)), mod(rel.z.sub(cam.z), box.z).sub(box.z.mul(0.5)));
    // camera-facing-ish cross quad (corner x across, corner y up)
    const sz = float(0.07).add(s.x.mul(0.06));
    return cam.add(w).add(vec3(c.x.mul(sz), c.y.mul(sz), c.x.mul(sz).mul(0.5)));
  })();
  const r = length(attribute('corner', 'vec2'));
  m.colorNode = vec3(1.0, 1.0, 1.05);
  m.opacityNode = smoothstep(1.0, 0.2, r).mul(smoothstep(2.0, 7.0, length(positionWorld.sub(cameraPosition)))).mul(0.9);
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 6; return mesh;
}
