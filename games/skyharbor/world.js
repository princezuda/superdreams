// Planet-surface scene: terrain, liquid, sky & time of day, procedural merged city, roads/bridges, lamps, traffic,
// visitor ships, crowds, landmarks and data overlays. One World per visited planet; rebuilt on planet switch.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { attribute, vec3, float, uniform, positionGeometry } from 'three/tsl';
import * as S from './shaders.js';
import { genTerrain, GRID, CELL, HALF, SEG, axisCoord, cellCenter } from './terrain.js';
import { mulberry32, makeNoise2D, smooth, clamp, lerp } from './noise.js';
import { LANDMARK_BY_ID } from './landmarks.js';
import { makeKit, bake } from './lmkit.js';

const C = (h) => new THREE.Color(h);
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- per-type looks
export const BIOME = {
  ocean: { seabed: 0x1f4a52, sand: 0xdacb9c, low: 0x5c8c3c, mid: 0x76904a, high: 0x80786a, peak: 0xeef2f4, tree: 'broad', leaf: [0x3f7a2c, 0x2f6a34, 0x5a8a3a, 0x4a7a2a], walls: [0xeae6dc, 0xd8e0e6, 0x9fc4c8, 0xf2e8d2, 0xd99a72, 0x7c9aa8, 0xe8d0a0], roof: 0x4a5a62, sky: 'giant' },
  desert: { seabed: 0x2f5a54, sand: 0xe6c080, low: 0xdca666, mid: 0xcc8e54, high: 0xa86c44, peak: 0xe8c8a0, tree: 'palm', leaf: [0x6a8a3a, 0x5a7a30, 0x7a9a4a], walls: [0xdcb48c, 0xcaa27c, 0xe4c8a4, 0xbc8e6a, 0xeed8b8, 0x9a6a54, 0x7a9aa0], roof: 0x8a5a3a, sky: 'ocean' },
  ice: { seabed: 0x8aa8c0, sand: 0xdce8f0, low: 0xeaf2f8, mid: 0xccdcea, high: 0x9aaac2, peak: 0xffffff, tree: 'conifer', leaf: [0x2a4a3a, 0x34584a, 0x24403a], walls: [0xe6eef6, 0xcad6e2, 0xa4b6ca, 0xf4f8fc, 0x8aa0b8, 0xc86a5a, 0x5a6a8a], roof: 0x3a4a5e, sky: 'giantBlue' },
  jungle: { seabed: 0x1a3a30, sand: 0x8c7c4c, low: 0x2f6a2c, mid: 0x3c7c32, high: 0x4c6c3c, peak: 0x7c8c6c, tree: 'jungle', leaf: [0x2a6a2a, 0x1f5a2a, 0x3a7a2a, 0x2a5a3a], walls: [0xb8b49c, 0x9aa88a, 0xd0c8ae, 0x7a8a72, 0xe0d8c0, 0xb07a5a, 0x5a7a6a], roof: 0x3a5a3a, sky: 'crystal' },
  volcanic: { seabed: 0x1a0a06, sand: 0x3a302e, low: 0x2c2828, mid: 0x3c3634, high: 0x4c4240, peak: 0x6c5c52, tree: 'rock', leaf: [0x3a3434, 0x2a2626, 0x4a3a34], walls: [0x5a5458, 0x4a4446, 0x6a6260, 0x7a6a60, 0x3e3a3c], roof: 0x2a2224, sky: 'giant' },
  crystal: { seabed: 0x2a1a5a, sand: 0xbcaedc, low: 0x8c7cbc, mid: 0x9c8ccc, high: 0xccbcec, peak: 0xf4ecff, tree: 'shard', leaf: [0xb89aff, 0x8ad8ff, 0xe0a8ff], walls: [0xdcd4f2, 0xbcaee4, 0xece6fa, 0x9e90cc, 0xf6f2ff, 0x6a5aa0, 0xd8b0d8], roof: 0x4a3a7a, sky: 'ice' },
  moon: { seabed: 0x55555c, sand: 0x8c8c92, low: 0x7c7c82, mid: 0x929298, high: 0xaaaab2, peak: 0xcacad2, tree: 'none', leaf: [0x6a6a70], walls: [0xccd0d8, 0xacb4c0, 0xe2e6ec, 0x8e96a2, 0xf0f2f6, 0xc8a070, 0x6a7a90], roof: 0x3a404a, sky: 'giant' },
};
// three-stop skies per type: [zenith, mid, horizon, ground, sun, sunI, hemiI, fogDensity, fogBlue]
const K = (z, m, h, g, sun, sunI, hemiI, fd, fb) => ({ z: C(z), m: C(m), h: C(h), g: C(g), sun: C(sun), sunI, hemiI, fd, fb: C(fb) });
export const SKIES = {
  ocean: { day: K(0x2e6cc0, 0x6ea6e2, 0xcfe4f2, 0x5a7a80, 0xfff3dc, 3.0, 1.0, 0.0034, 0x9cb8e2), dusk: K(0x2a2c62, 0x8e5c92, 0xf4a46a, 0x3a3040, 0xffa860, 1.6, 0.55, 0.0042, 0x7a6a9a), night: K(0x03050e, 0x0a1430, 0x1a2848, 0x060810, 0x7a90d0, 0.18, 0.22, 0.0040, 0x16223e) },
  desert: { day: K(0x3a68a8, 0x9cb4c8, 0xeed4a8, 0x8a6a4a, 0xfff0d0, 3.2, 1.0, 0.0040, 0xc0bcc0), dusk: K(0x382452, 0xb4566c, 0xffb46a, 0x4a2a2a, 0xff9a50, 1.7, 0.5, 0.0048, 0x9a6a7a), night: K(0x04040c, 0x10122a, 0x2a2238, 0x0a0808, 0x8a8ad0, 0.2, 0.22, 0.0040, 0x1e1a30) },
  ice: { day: K(0x4a84c0, 0x9cc4e6, 0xe8f4fa, 0x8aa0b0, 0xf4f8ff, 2.8, 1.1, 0.0036, 0xa8c8ec), dusk: K(0x30365e, 0xa07ab2, 0xf8c4ca, 0x4a4a5a, 0xffb0a0, 1.4, 0.55, 0.0044, 0x8a86b8), night: K(0x02060e, 0x081a2c, 0x14304a, 0x060a10, 0x80a0e0, 0.22, 0.25, 0.0036, 0x10283e) },
  jungle: { day: K(0x3c7ca2, 0x88b8b2, 0xd8e8cc, 0x4a6a4a, 0xfff6d8, 2.8, 1.0, 0.0052, 0x9cc0c4), dusk: K(0x2a3452, 0xa66a6c, 0xf2b272, 0x2a3028, 0xffa058, 1.5, 0.5, 0.0058, 0x7a7a8a), night: K(0x02060a, 0x081c22, 0x12302e, 0x040806, 0x70a0b0, 0.18, 0.22, 0.0050, 0x0e2a2a) },
  volcanic: { day: K(0x5a4a54, 0x9a6a5a, 0xdaa274, 0x3a2a26, 0xffd8b0, 2.4, 0.8, 0.0058, 0x8a7a80), dusk: K(0x2a1a22, 0x8a3a30, 0xf08a4a, 0x2a1210, 0xff7a3a, 1.4, 0.45, 0.0062, 0x6a4a50), night: K(0x0a0608, 0x2a1210, 0x6a2a14, 0x1a0806, 0xff6a3a, 0.18, 0.25, 0.0056, 0x3a1a1a) },
  crystal: { day: K(0x4a3c9c, 0x9a88d8, 0xeadcf8, 0x7a6aa0, 0xfff0ff, 2.8, 1.0, 0.0038, 0xb0a8e8), dusk: K(0x2a1a4c, 0xb05a9c, 0xffb2a2, 0x3a2040, 0xffa0b0, 1.5, 0.55, 0.0044, 0x8a6aaa), night: K(0x05030e, 0x140c34, 0x2a1a4a, 0x080610, 0xa090ff, 0.2, 0.25, 0.0040, 0x1e1640) },
  moon: { day: K(0x070a16, 0x1a2640, 0x56627c, 0x2a2a30, 0xffffff, 3.4, 0.45, 0.0018, 0x3a4660), dusk: K(0x05060e, 0x141a30, 0x4a4660, 0x1a1a20, 0xffe0c0, 2.0, 0.35, 0.0020, 0x2a2a44), night: K(0x020308, 0x060a18, 0x141c30, 0x08080c, 0xc0c8ff, 0.3, 0.2, 0.0018, 0x0c1020) },
};

// ---------------------------------------------------------------- building generator → parts with (color, aWin)
const FH = 1.3; // floor height
function partGeo(geo, color, style, litC, baseY, fh = FH) {
  if (geo.index === null) geo = geo; // all generators below produce indexed geometry
  geo.deleteAttribute('uv');
  const n = geo.attributes.position.count, col = new Float32Array(n * 3), win = new Float32Array(n * 4), c = C(color);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; win[i * 4] = style; win[i * 4 + 1] = fh; win[i * 4 + 2] = litC; win[i * 4 + 3] = baseY; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('aWin', new THREE.BufferAttribute(win, 4));
  return geo;
}
const boxP = (w, h, d, x, y, z, color, style = 0, lit = 0, base = 0, ry = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (ry) g.rotateY(ry); g.translate(x, y + h / 2, z); return partGeo(g, color, style, lit, base); };
const cylP = (rt, rb, h, x, y, z, color, style = 0, lit = 0, base = 0, seg = 16) => { const g = new THREE.CylinderGeometry(rt, rb, h, seg); g.translate(x, y + h / 2, z); return partGeo(g, color, style, lit, base); };
const sphP = (r, x, y, z, color, style = 0, half = true, sy = 1) => { const g = new THREE.SphereGeometry(r, 20, 10, 0, TAU, 0, half ? Math.PI / 2 : Math.PI); g.scale(1, sy, 1); g.translate(x, y, z); return partGeo(g, color, style, 0, y); };
const torP = (R, t, x, y, z, color, style = 4) => { const g = new THREE.TorusGeometry(R, t, 6, 32); g.rotateX(Math.PI / 2); g.translate(x, y, z); return partGeo(g, color, style, 0, 0); };

export function buildingParts(b, type, heightAt, neon, lowG) {
  const rng = mulberry32(b.seed), L = BIOME[type], parts = [];
  const pick = (a) => a[(rng() * a.length) | 0];
  const s = b.s * CELL, x0 = cellCenter(b.x) - CELL / 2, z0 = cellCenter(b.z) - CELL / 2, cx = x0 + s / 2, cz = z0 + s / 2;
  let gmin = 1e9, gmax = -1e9;
  for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0.5]]) { const h = heightAt(x0 + u * s, z0 + v * s); gmin = Math.min(gmin, h); gmax = Math.max(gmax, h); }
  const base = gmax + 0.12, wall = pick(L.walls), roof = L.roof, hmul = lowG ? 1.3 : 1;
  const airless = type === 'moon';
  // foundation plinth buried into the slope (kills FLOAT on uneven ground)
  parts.push(boxP(s - 0.5, base - gmin + 1.2, s - 0.5, cx, gmin - 1.2, cz, 0x55575c, 0));
  const F = (n) => Math.max(1, Math.round(n)) * FH;
  switch (b.kind) {
    case 'housing': {
      if (airless && b.level === 1) { parts.push(sphP(1.5, cx, base, cz, wall, 0), torP(1.52, 0.06, cx, base + 0.5, cz, neon[1])); parts.push(boxP(0.8, 1.0, 0.6, cx, base, cz + 1.4, wall, 1, 0.6, base)); break; }
      const fl = [2 + (rng() * 2 | 0), 4 + (rng() * 3 | 0), 7 + (rng() * 4 | 0)][b.level - 1] * hmul;
      const w = b.level === 3 ? 2.4 : 2.8 + rng() * 0.4, d = b.level === 3 ? 2.4 : 2.6 + rng() * 0.5;
      const ox = (rng() - 0.5) * 0.3, oz = (rng() - 0.5) * 0.3;
      if (b.level >= 2) { parts.push(boxP(3.4, F(1), 3.2, cx, base, cz, pick(L.walls), 2, 0.7, base)); }
      const y0 = base + (b.level >= 2 ? F(1) : 0), h = F(fl);
      parts.push(boxP(w, h, d, cx + ox, y0, cz + oz, wall, 1, 0.22 + rng() * 0.16, base));
      if (b.level === 3) { const h2 = F(fl * 0.3); parts.push(boxP(w * 0.7, h2, d * 0.7, cx + ox, y0 + h, cz + oz, wall, 1, 0.3, base)); parts.push(boxP(w * 0.72, 0.3, d * 0.72, cx + ox, y0 + h + h2, cz + oz, roof)); parts.push(cylP(0.05, 0.05, 2.4, cx + ox, y0 + h + h2 + 0.3, cz + oz, 0x999999)); }
      else { parts.push(boxP(w + 0.15, 0.25, d + 0.15, cx + ox, y0 + h, cz + oz, roof)); parts.push(boxP(0.8, 0.6, 0.7, cx + ox + (rng() - 0.5), y0 + h + 0.25, cz + oz + (rng() - 0.5), 0x8a8e94)); }
      if (b.level === 1 && rng() < 0.6) parts.push(boxP(1.2, F(1), 1.4, cx - 1.2, base, cz + 1.0, pick(L.walls), 1, 0.5, base));
      break;
    }
    case 'shop': {
      const h = F(1 + (rng() < 0.5 ? 1 : 0));
      parts.push(boxP(3.4, h, 3.4, cx, base, cz, wall, 2, 0.85, base));
      parts.push(boxP(3.5, 0.28, 3.5, cx, base + h, cz, roof));
      parts.push(boxP(3.0, 0.35, 0.08, cx, base + h - 0.9, cz + 1.75, pick(neon), 4)); // neon sign band (front)
      parts.push(boxP(0.08, 0.35, 3.0, cx + 1.75, base + h - 0.9, cz, pick(neon), 4));
      parts.push(boxP(3.6, 0.08, 0.8, cx, base + F(1) - 0.2, cz + 2.0, pick(L.walls))); // awning
      break;
    }
    case 'hotel': {
      const fl = (7 + (rng() * 5 | 0)) * hmul, h = F(fl);
      parts.push(boxP(3.6, F(2), 3.6, cx, base, cz, pick(L.walls), 2, 0.8, base));
      parts.push(boxP(2.6, h, 2.4, cx, base + F(2), cz, rng() < 0.5 ? 0x8aa0b4 : wall, 3, 0.32, base));
      const top = base + F(2) + h;
      parts.push(boxP(2.0, 1.4, 1.8, cx, top, cz, wall, 0));
      parts.push(boxP(2.7, 0.22, 2.5, cx, top - 0.4, cz, pick(neon), 4));             // crown light band
      parts.push(cylP(0.06, 0.06, 3, cx, top + 1.4, cz, 0xb0b0b0));
      break;
    }
    case 'power': {
      parts.push(boxP(7.2, 0.4, 7.2, cx, base, cz, 0x6a6e74));
      parts.push(cylP(1.4, 2.1, 6.5, cx - 1.6, base + 0.4, cz - 1.4, 0xd8d8d0, 0, 0, 0, 20));
      parts.push(cylP(1.7, 1.4, 1.2, cx - 1.6, base + 6.9, cz - 1.4, 0xd8d8d0, 0, 0, 0, 20));
      parts.push(boxP(3.2, 2.6, 2.6, cx + 1.4, base + 0.4, cz + 1.4, wall, 2, 0.5, base));
      parts.push(sphP(1.5, cx + 1.6, base + 0.4, cz - 1.8, 0x9aa4ae, 0));
      parts.push(torP(1.55, 0.09, cx + 1.6, base + 0.9, cz - 1.8, neon[0]));
      parts.push(torP(2.1, 0.1, cx - 1.6, base + 1.2, cz - 1.4, neon[0]));
      for (let i = 0; i < 3; i++) parts.push(cylP(0.12, 0.12, 4, cx + 2.8 - i * 0.6, base + 0.4, cz + 3, 0x888888, 0, 0, 0, 6));
      break;
    }
    case 'water': {
      parts.push(cylP(1.2, 1.2, 2.4, cx - 0.7, base, cz - 0.6, 0xc8d4dc, 0, 0, 0, 16));
      parts.push(sphP(1.2, cx - 0.7, base + 2.4, cz - 0.6, 0xc8d4dc, 0, true, 0.4));
      parts.push(boxP(1.6, F(1), 1.4, cx + 0.8, base, cz + 0.8, wall, 1, 0.5, base));
      parts.push(torP(1.25, 0.06, cx - 0.7, base + 1.6, cz - 0.6, 0x4ad8ff));
      break;
    }
    case 'spaceport': {
      parts.push(cylP(5.2, 5.4, 0.5, cx - 0.4, base, cz - 0.4, 0x4a4e56, 0, 0, 0, 32));
      parts.push(torP(4.6, 0.12, cx - 0.4, base + 0.52, cz - 0.4, neon[2] ?? 0x4ad8ff));
      parts.push(torP(2.2, 0.1, cx - 0.4, base + 0.52, cz - 0.4, 0xffd27a));
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; parts.push(boxP(0.25, 0.08, 1.2, cx - 0.4 + Math.cos(a) * 3.4, base + 0.5, cz - 0.4 + Math.sin(a) * 3.4, 0xffd27a, 4, 0, 0, -a + Math.PI / 2)); }
      parts.push(cylP(0.7, 0.9, F(7), cx + 4.6, base, cz + 4.6, wall, 0, 0, 0, 12));
      parts.push(cylP(1.6, 1.1, 1.5, cx + 4.6, base + F(7), cz + 4.6, 0x8aa0b4, 3, 0.9, base + F(7), 12));
      parts.push(cylP(0.05, 0.05, 2.5, cx + 4.6, base + F(7) + 1.5, cz + 4.6, 0xcccccc));
      parts.push(boxP(3.6, 2.4, 2.4, cx + 3.8, base, cz - 3.6, wall, 2, 0.6, base));
      break;
    }
    case 'transit': {
      for (const [dx, dz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) parts.push(cylP(0.15, 0.15, 3.2, cx + dx, base, cz + dz, 0x9a9ea6, 0, 0, 0, 8));
      parts.push(boxP(3.4, 0.4, 3.4, cx, base + 3.2, cz, 0xd8dce2));
      parts.push(boxP(3.6, 0.12, 3.6, cx, base + 5.0, cz, 0x6a7a8a));
      parts.push(torP(1.4, 0.12, cx, base + 3.7, cz, neon[1] ?? 0x8affd8));
      parts.push(boxP(0.9, 1.4, 0.9, cx, base + 3.6, cz, 0xa8c8e8, 3, 0.9, base + 3.6));
      break;
    }
    case 'park': {
      parts.push(boxP(3.8, 0.25, 3.8, cx, base - 0.1, cz, type === 'moon' ? 0x5a6a5a : type === 'volcanic' ? 0x3a4a2a : 0x4c8a3a));
      parts.push(boxP(3.8, 0.06, 0.6, cx, base + 0.15, cz, 0xd8ccb0));
      parts.push(cylP(0.6, 0.7, 0.35, cx + 0.9, base + 0.15, cz - 0.9, 0xc8c0b0, 0, 0, 0, 14));
      if (type === 'moon') parts.push(sphP(1.8, cx, base + 0.15, cz, 0xb8e0ff, 3)); // biodome
      break;
    }
  }
  return parts;
}

// ---------------------------------------------------------------- World
export class World {
  constructor(renderer, planet, { palette }) {
    this.renderer = renderer; this.planet = planet; this.type = planet.type;
    this.palette = palette;
    const scene = this.scene = new THREE.Scene();
    this.terrain = genTerrain(planet.type, planet.seed);
    this.heightAt = this.terrain.heightAt;
    this.lowG = planet.traits.gravityClass === 'low';
    this.sky = SKIES[planet.type];
    this.time = 0; this.anims = []; this.landmarkObjs = new Map(); this.buildingDirty = true; this.growing = [];
    scene.backgroundNode = S.skyBackground();
    scene.fogNode = S.fogNode();
    // lights: hemisphere + sun (shadows) + cool fill, pooled point lights (fixed count: no shader recompiles)
    this.hemi = new THREE.HemisphereLight(0xbcd4ff, 0x3a3428, 1.0);
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048); this.sun.shadow.radius = 3; this.sun.shadow.bias = -0.0005; this.sun.shadow.normalBias = 0.04;
    Object.assign(this.sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 1, far: 500 });
    this.fill = new THREE.DirectionalLight(0x8fb4ff, 0.4);
    scene.add(this.hemi, this.sun, this.sun.target, this.fill);
    this.pool = []; for (let i = 0; i < 3; i++) { const l = new THREE.PointLight(0xffffff, 0, 60, 1.6); scene.add(l); this.pool.push(l); }
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.35;
    this.buildTerrain();
    this.buildLiquid();
    this.buildSkyBodies();
    this.buildVegetation();
    this.bMat = S.buildingMaterial();
    this.city = new THREE.Mesh(new THREE.BufferGeometry(), this.bMat); this.city.castShadow = this.city.receiveShadow = true; this.city.frustumCulled = false; scene.add(this.city);
    this.roadMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.92 }); this.roadMat.colorNode = attribute('color', 'vec3');
    this.roads = new THREE.Mesh(new THREE.BufferGeometry(), this.roadMat); this.roads.receiveShadow = true; this.roads.frustumCulled = false; scene.add(this.roads);
    this.bridges = new THREE.Mesh(new THREE.BufferGeometry(), this.bMat); this.bridges.castShadow = this.bridges.receiveShadow = true; this.bridges.frustumCulled = false; scene.add(this.bridges);
    this.buildLamps(); this.buildTraffic(); this.buildShips(); this.buildCrowd(); this.buildFx(); this.buildGhost(); this.buildSites();
    this.rebuildCity(true);
  }
  // ---------------------------------------------------------------- terrain
  buildTerrain() {
    const T = this.terrain, N = T.N, L = BIOME[this.type], pos = new Float32Array(N * N * 3), col = new Float32Array(N * N * 3);
    const nz = makeNoise2D(this.planet.seed + 3), c = new THREE.Color();
    const cs = { seabed: C(L.seabed), sand: C(L.sand), low: C(L.low), mid: C(L.mid), high: C(L.high), peak: C(L.peak) };
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i, x = T.xs[i], z = T.xs[j], h = T.heights[k];
      pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
      const n = nz(x * 0.02, z * 0.02) * 0.5 + 0.5;
      const hx = T.heights[j * N + Math.min(N - 1, i + 1)] - T.heights[j * N + Math.max(0, i - 1)], hz = T.heights[Math.min(N - 1, j + 1) * N + i] - T.heights[Math.max(0, j - 1) * N + i];
      const slope = Math.hypot(hx, hz) / ((T.xs[Math.min(N - 1, i + 1)] - T.xs[Math.max(0, i - 1)]) || 1);
      if (h < T.waterLevel - 0.2) c.copy(cs.seabed).lerp(cs.sand, smooth(-6, -0.2, h) * 0.4);
      else if (h < T.waterLevel + 0.9) c.copy(cs.sand);
      else { c.copy(cs.low).lerp(cs.mid, n); c.lerp(cs.high, smooth(8, 22, h + n * 6)); c.lerp(cs.high, smooth(0.35, 0.9, slope) * 0.8); c.lerp(cs.peak, smooth(34, 52, h + n * 8)); }
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    }
    const idx = [];
    for (let j = 0; j < SEG; j++) for (let i = 0; i < SEG; i++) { const a = j * N + i, b = a + 1, d = a + N, e = d + 1; idx.push(a, d, b, b, d, e); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    this.overlayData = new Uint8Array(GRID * GRID * 4);
    this.overlayTex = new THREE.DataTexture(this.overlayData, GRID, GRID, THREE.RGBAFormat); this.overlayTex.magFilter = THREE.NearestFilter; this.overlayTex.needsUpdate = true;
    this.terrainMesh = new THREE.Mesh(g, S.terrainMaterial(this.overlayTex, HALF)); this.terrainMesh.receiveShadow = true;
    this.scene.add(this.terrainMesh);
  }
  buildLiquid() {
    const T = this.terrain; if (!T.liquid) return;
    const kind = { sea: 'sea', oasis: 'oasis', ice: 'ice', river: 'river', lava: 'lava', lake: 'lake' }[T.liquid];
    const g = new THREE.PlaneGeometry(700, 700, 1, 1); g.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(g, S.waterMaterial(kind)); this.water.position.y = T.waterLevel; this.water.receiveShadow = false;
    this.scene.add(this.water);
    if (kind === 'lava') S.U.lavaGlow.value = 1;
  }
  buildSkyBodies() {
    const L = BIOME[this.type], traits = this.planet.traits;
    this.bodies = [];
    const add = (type, R, dist, az, el, seed, rings) => {
      const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
      const { mat, u } = S.planetMaterial(type, { seed, lightDir: new THREE.Vector3(1, 0.3, 0.2) });
      mat.fog = false; mat.depthWrite = false;
      const m = new THREE.Mesh(new THREE.SphereGeometry(R, 64, 40), mat); m.position.copy(dir.multiplyScalar(dist)); m.renderOrder = -2; m.frustumCulled = false;
      m.rotation.set(0.35, 0.4, 0.2);
      this.scene.add(m);
      const atmo = S.atmosphereMaterial(S.PLANET_LOOK[type].atmo, new THREE.Vector3(1, 0, 0), { strength: 0.9 });
      const a = new THREE.Mesh(new THREE.SphereGeometry(R * 1.06, 48, 32), atmo.mat); a.position.copy(m.position); a.renderOrder = -2; this.scene.add(a);
      let ring = null;
      if (rings) {
        const rg = new THREE.RingGeometry(R * 1.35, R * 2.3, 128, 1);
        const rm = S.ringMaterial(R * 1.35, R * 2.3, 0xe8d8b8, 0x8a7a68, { opacity: 0.8 });
        ring = new THREE.Mesh(rg, rm.mat); ring.position.copy(m.position); ring.rotation.set(-Math.PI / 2 + 0.38, 0.2, 0.3); ring.renderOrder = -1; this.scene.add(ring);
      }
      this.bodies.push({ m, u, a, atmo, ring });
    };
    const feats = new Set(traits.features);
    if (this.type === 'moon') add(L.sky, 560, 2700, 0.25, 0.27, 7, true);
    else add(L.sky, feats.has('ringshine') ? 240 : 190, 2700, 0.35, 0.2, 5, feats.has('ringshine') || L.sky === 'giant');
    if (feats.has('twinMoons')) { add('moon', 38, 2400, -0.55, 0.42, 11, false); add('ice', 24, 2400, -0.4, 0.55, 13, false); }
  }
  buildVegetation() {
    const L = BIOME[this.type], T = this.terrain, rng = mulberry32(this.planet.seed + 17);
    let trunk, crown, crownMat;
    switch (L.tree) {
      case 'palm': trunk = new THREE.CylinderGeometry(0.12, 0.2, 3.4, 6); trunk.translate(0, 1.7, 0); crown = new THREE.ConeGeometry(1.4, 0.8, 7); crown.translate(0, 3.5, 0); break;
      case 'conifer': trunk = new THREE.CylinderGeometry(0.12, 0.18, 1.2, 6); trunk.translate(0, 0.6, 0); crown = new THREE.ConeGeometry(1.0, 3.6, 8); crown.translate(0, 2.8, 0); break;
      case 'jungle': trunk = new THREE.CylinderGeometry(0.18, 0.3, 3.2, 6); trunk.translate(0, 1.6, 0); crown = new THREE.IcosahedronGeometry(1.7, 1); crown.scale(1, 0.7, 1); crown.translate(0, 3.6, 0); break;
      case 'shard': trunk = null; crown = new THREE.OctahedronGeometry(1, 0); crown.scale(0.5, 2.4, 0.5); crown.translate(0, 1.8, 0); break;
      case 'rock': case 'none': trunk = null; crown = new THREE.IcosahedronGeometry(1, 1); crown.scale(1.3, 0.7, 1.1); crown.translate(0, 0.3, 0); break;
      default: trunk = new THREE.CylinderGeometry(0.14, 0.22, 2.2, 6); trunk.translate(0, 1.1, 0); crown = new THREE.IcosahedronGeometry(1.4, 1); crown.translate(0, 3.0, 0);
    }
    const glowFlora = this.planet.traits.features.includes('glowFlora');
    crownMat = L.tree === 'shard' ? S.crystalMaterial(0xb89aff, { height: 8, climb: 0.05 }) : new THREE.MeshStandardNodeMaterial({ roughness: 0.85, flatShading: true });
    if (glowFlora) crownMat.emissiveNode = vec3(0.2, 1.0, 0.75).mul(S.U.night.mul(0.6));
    const pts = [];
    for (let i = 0; i < 1400 && pts.length < 520; i++) {
      const x = (rng() - 0.5) * 300, z = (rng() - 0.5) * 300, h = T.heightAt(x, z);
      if (h < T.waterLevel + 0.8 || h > 30) continue;
      const inZone = Math.abs(x) < HALF && Math.abs(z) < HALF;
      if (inZone && rng() < 0.55) continue;
      pts.push({ x, z, h, s: 0.7 + rng() * 0.8, r: rng() * TAU, c: L.leaf[(rng() * L.leaf.length) | 0], zone: inZone });
    }
    this.trees = pts;
    const mk = (geo, mat) => { const im = new THREE.InstancedMesh(geo, mat, pts.length); im.castShadow = true; im.receiveShadow = true; this.scene.add(im); return im; };
    this.treeTrunk = trunk ? mk(trunk, new THREE.MeshStandardNodeMaterial({ color: this.type === 'desert' ? 0x8a6a4a : 0x4a3a2a, roughness: 0.9 })) : null;
    this.treeCrown = mk(crown, crownMat);
    pts.forEach((p, i) => this.treeCrown.setColorAt(i, C(p.c)));
    this.placeTrees();
  }
  placeTrees() {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const grid = this.planet.grid;
    this.trees.forEach((p, i) => {
      let hide = false;
      if (p.zone) { const cx = Math.floor(p.x / CELL + GRID / 2), cz = Math.floor(p.z / CELL + GRID / 2); hide = cx >= 0 && cz >= 0 && cx < GRID && cz < GRID && grid[cz * GRID + cx] !== 0; }
      q.setFromAxisAngle(up, p.r); sc.setScalar(hide ? 0.0001 : p.s); v.set(p.x, p.h - 0.2, p.z);
      m.compose(v, q, sc); this.treeCrown.setMatrixAt(i, m); this.treeTrunk?.setMatrixAt(i, m);
    });
    this.treeCrown.instanceMatrix.needsUpdate = true; if (this.treeTrunk) this.treeTrunk.instanceMatrix.needsUpdate = true;
    this.treeCrown.computeBoundingSphere(); this.treeTrunk?.computeBoundingSphere();
  }
  // ---------------------------------------------------------------- city mesh (merged; rebuilt on change)
  rebuildCity(force = false) {
    const p = this.planet;
    const parts = [];
    for (const b of p.buildings) { if (b.built < 1 && !force && !b._shown) continue; b._parts ??= null; const key = b.kind + b.level; if (!b._parts || b._key !== key) { b._parts = buildingParts(b, this.type, this.heightAt, this.palette.neon, this.lowG); b._key = key; } parts.push(...b._parts); }
    const old = this.city.geometry; this.city.geometry = parts.length ? mergeGeometries(parts) : new THREE.BufferGeometry(); old.dispose(); this.city.visible = parts.length > 0;
    this.buildRoads();
    this.placeTrees();
    this.syncLandmarks();
    this.updateLamps();
    this.trafficGraph();
    this.updateSites();
  }
  buildRoads() {
    const p = this.planet, H = this.heightAt, pos = [], col = [], idx = [], bparts = [];
    const asphalt = C(0x34363c), line = C(0xd8cc8a), curb = C(0x9a9ca0);
    const road = (x, z) => x >= 0 && z >= 0 && x < GRID && z < GRID && p.grid[z * GRID + x] === -1;
    const quad = (x0, z0, x1, z1, c, lift, n = 2, flatY = null) => {
      const b = pos.length / 3;
      for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) { const x = lerp(x0, x1, i / n), z = lerp(z0, z1, j / n); pos.push(x, (flatY ?? H(x, z)) + lift, z); col.push(c.r, c.g, c.b); }
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = b + j * (n + 1) + i; idx.push(a, a + n + 1, a + 1, a + 1, a + n + 1, a + n + 2); }
    };
    for (let z = 0; z < GRID; z++) for (let x = 0; x < GRID; x++) {
      if (!road(x, z)) continue;
      const cx = cellCenter(x), cz = cellCenter(z), h = CELL / 2;
      const bridge = p.land[z * GRID + x] === 1;
      const deck = bridge ? Math.max(this.terrain.waterLevel + 1.3, 1.6) : null;
      if (bridge) { bparts.push(boxP(CELL, 0.5, CELL, cx, deck - 0.45, cz, 0x6a6e76), boxP(0.7, deck + 3, 0.7, cx, -3, cz, 0x7a7e86)); }
      quad(cx - h, cz - h, cx + h, cz + h, asphalt, 0.07, 2, deck);
      const n = road(x, z - 1), s = road(x, z + 1), w = road(x - 1, z), e = road(x + 1, z);
      if (n || s) { for (const [a, b2] of [[-1.6, -0.8], [0.4, 1.2]]) quad(cx - 0.07, cz + a, cx + 0.07, cz + b2, line, 0.1, 1, deck); }
      if (w || e) { for (const [a, b2] of [[-1.6, -0.8], [0.4, 1.2]]) quad(cx + a, cz - 0.07, cx + b2, cz + 0.07, line, 0.1, 1, deck); }
      if (!n) quad(cx - h, cz - h, cx + h, cz - h + 0.45, curb, 0.16, 2, deck);
      if (!s) quad(cx - h, cz + h - 0.45, cx + h, cz + h, curb, 0.16, 2, deck);
      if (!w) quad(cx - h, cz - h, cx - h + 0.45, cz + h, curb, 0.16, 2, deck);
      if (!e) quad(cx + h - 0.45, cz - h, cx + h, cz + h, curb, 0.16, 2, deck);
    }
    const g = new THREE.BufferGeometry();
    if (pos.length) { g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals(); }
    const old = this.roads.geometry; this.roads.geometry = g; old.dispose(); this.roads.visible = pos.length > 0;
    const ob = this.bridges.geometry; this.bridges.geometry = bparts.length ? mergeGeometries(bparts) : new THREE.BufferGeometry(); ob.dispose(); this.bridges.visible = bparts.length > 0;
  }
  // ---------------------------------------------------------------- lamps
  buildLamps() {
    const pole = new THREE.CylinderGeometry(0.05, 0.07, 2.8, 5); pole.translate(0, 1.4, 0);
    const arm = new THREE.BoxGeometry(0.7, 0.06, 0.06); arm.translate(0.32, 2.78, 0);
    const lampGeo = mergeGeometries([pole, arm]);
    this.lampMax = 420;
    this.lamps = new THREE.InstancedMesh(lampGeo, new THREE.MeshStandardNodeMaterial({ color: 0x3a3e46, roughness: 0.5, metalness: 0.4 }), this.lampMax);
    this.bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 8, 6), S.glowMaterial(0xffd9a0, { day: 0.25, night: 5 }), this.lampMax);
    const pg = new THREE.PlaneGeometry(6, 6); pg.rotateX(-Math.PI / 2);
    this.pools = new THREE.InstancedMesh(pg, S.poolMaterial(0xffb870, { night: 0.55 }), this.lampMax);
    this.bulbMat = this.bulbs.material;
    for (const m of [this.lamps, this.bulbs, this.pools]) { m.count = 0; m.frustumCulled = false; this.scene.add(m); }
    this.lamps.castShadow = true;
  }
  updateLamps() {
    const p = this.planet, m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
    let n = 0;
    for (let z = 0; z < GRID && n < this.lampMax; z++) for (let x = 0; x < GRID && n < this.lampMax; x++) {
      if (p.grid[z * GRID + x] !== -1 || (x + z) % 2) continue;
      const cx = cellCenter(x) + 1.75, cz = cellCenter(z) + 1.75, bridge = p.land[z * GRID + x] === 1;
      const y = bridge ? Math.max(this.terrain.waterLevel + 1.3, 1.6) + 0.1 : this.heightAt(cx, cz) + 0.1;
      q.setFromAxisAngle(up, ((x * 7 + z * 3) % 4) * Math.PI / 2 + Math.PI * 0.75);
      m.compose(v.set(cx, y, cz), q, one); this.lamps.setMatrixAt(n, m);
      const ax = cx + Math.cos(-(((x * 7 + z * 3) % 4) * Math.PI / 2 + Math.PI * 0.75)) * 0.62, az = cz + Math.sin(-(((x * 7 + z * 3) % 4) * Math.PI / 2 + Math.PI * 0.75)) * 0.62;
      m.makeTranslation(ax, y + 2.7, az); this.bulbs.setMatrixAt(n, m);
      m.makeTranslation(ax, (bridge ? y : this.heightAt(ax, az)) + 0.22, az); this.pools.setMatrixAt(n, m);
      n++;
    }
    for (const im of [this.lamps, this.bulbs, this.pools]) { im.count = n; im.instanceMatrix.needsUpdate = true; }
  }
  // ---------------------------------------------------------------- traffic (hover cars on the road graph)
  buildTraffic() {
    const g = new THREE.BoxGeometry(0.62, 0.32, 0.9);
    this.carMax = 80; this.cars = [];
    this.carMesh = new THREE.InstancedMesh(g, S.vehicleMaterial(), this.carMax); this.carMesh.count = 0; this.carMesh.frustumCulled = false; this.scene.add(this.carMesh);
    const cols = [0xe8e8ec, 0x2a2e36, 0xc83a3a, 0x3a6ac8, 0xe8c84a, 0x6ac8a8];
    for (let i = 0; i < this.carMax; i++) this.carMesh.setColorAt(i, C(cols[i % cols.length]));
  }
  trafficGraph() {
    const p = this.planet; this.roadCells = [];
    for (let k = 0; k < p.grid.length; k++) if (p.grid[k] === -1) this.roadCells.push(k);
    const want = Math.min(this.carMax, Math.floor(this.roadCells.length * 0.35) + Math.floor((p.stats.pop || 0) / 120));
    while (this.cars.length > want) this.cars.pop();
    const rng = mulberry32(this.cars.length + 99);
    while (this.cars.length < want && this.roadCells.length > 1) { const k = this.roadCells[(rng() * this.roadCells.length) | 0]; this.cars.push({ k, next: k, t: 1, speed: 2.2 + rng() * 1.6, dir: 0 }); }
    for (const c of this.cars) if (p.grid[c.k] !== -1) { c.k = this.roadCells[0]; c.next = c.k; c.t = 1; }
    this.carMesh.count = this.cars.length;
  }
  stepTraffic(dt) {
    const p = this.planet, m = this._m ??= new THREE.Matrix4(), q = this._q ??= new THREE.Quaternion(), v = this._v ??= new THREE.Vector3(), one = this._one ??= new THREE.Vector3(1, 1, 1), up = this._up ??= new THREE.Vector3(0, 1, 0);
    this.cars.forEach((c, i) => {
      c.t += dt * c.speed / CELL;
      if (c.t >= 1) {
        c.k = c.next; c.t = 0;
        const x = c.k % GRID, z = (c.k / GRID) | 0, opts = [];
        for (const [dx, dz, d] of [[1, 0, 0], [0, 1, 1], [-1, 0, 2], [0, -1, 3]]) { const nx = x + dx, nz = z + dz; if (nx >= 0 && nz >= 0 && nx < GRID && nz < GRID && p.grid[nz * GRID + nx] === -1 && d !== (c.dir + 2) % 4) opts.push([nz * GRID + nx, d]); }
        if (!opts.length) { for (const [dx, dz, d] of [[1, 0, 0], [0, 1, 1], [-1, 0, 2], [0, -1, 3]]) { const nx = x + dx, nz = z + dz; if (nx >= 0 && nz >= 0 && nx < GRID && nz < GRID && p.grid[nz * GRID + nx] === -1) opts.push([nz * GRID + nx, d]); } }
        if (opts.length) { const o = opts[(Math.random() * opts.length) | 0]; c.next = o[0]; c.dir = o[1]; } else c.next = c.k;
      }
      const ax = cellCenter(c.k % GRID), az = cellCenter((c.k / GRID) | 0), bx = cellCenter(c.next % GRID), bz = cellCenter((c.next / GRID) | 0);
      const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 1, ox = -dz / len * 0.8, oz = dx / len * 0.8;
      const x = lerp(ax, bx, c.t) + ox, z = lerp(az, bz, c.t) + oz;
      const br = p.land[c.k] === 1 || p.land[c.next] === 1;
      const y = (br ? Math.max(this.terrain.waterLevel + 1.3, 1.6) : this.heightAt(x, z)) + 0.55 + Math.sin(this.time * 3 + i) * 0.04;
      q.setFromAxisAngle(up, Math.atan2(dx, dz));
      m.compose(v.set(x, y, z), q, one); this.carMesh.setMatrixAt(i, m);
    });
    this.carMesh.instanceMatrix.needsUpdate = true;
  }
  // ---------------------------------------------------------------- visitor ships (arrive along arcs from the sky, land on pads)
  // FABLE: landing legs, thruster flare + dust ring on touchdown, passengers walking off the pad.
  buildShips() {
    const hull = new THREE.CylinderGeometry(0.35, 0.6, 2.6, 8); hull.rotateX(Math.PI / 2);
    const nose = new THREE.ConeGeometry(0.35, 0.9, 8); nose.rotateX(Math.PI / 2); nose.translate(0, 0, 1.75);
    const wing = new THREE.BoxGeometry(2.6, 0.08, 0.9); wing.translate(0, -0.1, -0.5);
    const fin = new THREE.BoxGeometry(0.08, 0.7, 0.7); fin.translate(0, 0.35, -1.0);
    [hull, nose, wing, fin].forEach((g) => g.deleteAttribute('uv'));
    const geo = mergeGeometries([hull.toNonIndexed(), nose.toNonIndexed(), wing.toNonIndexed(), fin.toNonIndexed()]);
    const mat = new THREE.MeshStandardNodeMaterial({ color: 0xe8ecf2, roughness: 0.35, metalness: 0.5 });
    mat.emissiveNode = vec3(0.4, 0.8, 1.0).mul(float(1).sub(positionGeometry.z.add(1.3).clamp(0, 0.5).mul(2))).mul(2.5);
    this.shipMax = 24; this.ships = [];
    this.shipMesh = new THREE.InstancedMesh(geo, mat, this.shipMax); this.shipMesh.count = 0; this.shipMesh.frustumCulled = false; this.shipMesh.castShadow = true; this.scene.add(this.shipMesh);
    const tg = new THREE.ConeGeometry(0.5, 6, 8, 1, true); tg.rotateX(-Math.PI / 2); tg.translate(0, 0, -4.3);
    this.trailMesh = new THREE.InstancedMesh(tg, S.beamMaterial(0x8ad8ff, { len: 6, nightOnly: false, strength: 0.6 }), this.shipMax); this.trailMesh.count = 0; this.trailMesh.frustumCulled = false; this.scene.add(this.trailMesh);
  }
  spawnShip() {
    const ports = this.planet.buildings.filter((b) => b.kind === 'spaceport' && b.built >= 1);
    if (!ports.length || this.ships.length >= this.shipMax) return;
    const b = ports[(Math.random() * ports.length) | 0], s = b.s * CELL;
    const px = cellCenter(b.x) - CELL / 2 + s / 2 - 0.4, pz = cellCenter(b.z) - CELL / 2 + s / 2 - 0.4;
    const py = this.heightAt(px, pz) + 1.4;
    const a = Math.random() * TAU, from = new THREE.Vector3(px + Math.cos(a) * 420, 160 + Math.random() * 80, pz + Math.sin(a) * 420);
    const mid = new THREE.Vector3(px + Math.cos(a) * 60, 50, pz + Math.sin(a) * 60);
    this.ships.push({ curve: new THREE.QuadraticBezierCurve3(from, mid, new THREE.Vector3(px, py, pz)), t: 0, phase: 'in', wait: 0, pad: new THREE.Vector3(px, py, pz), a });
  }
  stepShips(dt) {
    const m = this._sm ??= new THREE.Matrix4(), q = this._sq ??= new THREE.Quaternion(), pos = this._sv ??= new THREE.Vector3(), dir = this._sd ??= new THREE.Vector3();
    const one = this._one ??= new THREE.Vector3(1, 1, 1), tiny = this._tiny ??= new THREE.Vector3(0.001, 0.001, 0.001), fwd = this._fwd ??= new THREE.Vector3(0, 0, 1);
    for (let i = this.ships.length - 1; i >= 0; i--) {
      const s = this.ships[i];
      if (s.phase === 'in') { s.t += dt * 0.09; if (s.t >= 1) { s.t = 1; s.phase = 'land'; s.wait = 3 + Math.random() * 3; this.onLand?.(s.pad); } }
      else if (s.phase === 'land') { s.wait -= dt; if (s.wait <= 0) { s.phase = 'out'; s.t = 0; } }
      else { s.t += dt * 0.12; if (s.t >= 1) this.ships.splice(i, 1); }
    }
    this.ships.forEach((s, i) => {
      if (s.phase === 'out') { const k = s.t * s.t, ca = Math.cos(s.a + 2), sa = Math.sin(s.a + 2); pos.set(s.pad.x - ca * k * 300, s.pad.y + k * 260, s.pad.z - sa * k * 300); dir.set(-ca, s.t * 2 + 0.3, -sa); }
      else if (s.phase === 'land') { pos.copy(s.pad); dir.set(-Math.cos(s.a), 0, -Math.sin(s.a)); }
      else { const t = ease(s.t); s.curve.getPoint(t, pos); s.curve.getTangent(Math.min(0.999, t), dir); }
      q.setFromUnitVectors(fwd, dir.normalize()); m.compose(pos, q, one);
      this.shipMesh.setMatrixAt(i, m);
      if (s.phase === 'land') m.compose(pos, q, tiny);
      this.trailMesh.setMatrixAt(i, m);
    });
    this.shipMesh.count = this.trailMesh.count = this.ships.length;
    this.shipMesh.instanceMatrix.needsUpdate = this.trailMesh.instanceMatrix.needsUpdate = true;
  }
  // ---------------------------------------------------------------- crowds around landmarks
  // FABLE: proper walk cycles, photo-taking idles and festival dancing instead of bobbing capsules.
  buildCrowd() {
    const g = new THREE.CapsuleGeometry(0.16, 0.42, 2, 6); g.translate(0, 0.37, 0);
    this.crowdMax = 320; this.people = [];
    this.crowdMesh = new THREE.InstancedMesh(g, new THREE.MeshStandardNodeMaterial({ roughness: 0.8 }), this.crowdMax); this.crowdMesh.count = 0; this.crowdMesh.frustumCulled = false; this.scene.add(this.crowdMesh);
    const cols = [0xffd27a, 0x7ac8ff, 0xff7ad9, 0xff8a4a, 0xb9a0ff, 0xf0f0f0, 0x6ad88a];
    for (let i = 0; i < this.crowdMax; i++) this.crowdMesh.setColorAt(i, C(cols[i % cols.length]));
  }
  setCrowd() {
    const lms = this.planet.landmarks.filter((l) => l.built >= 1 && l.access >= 0);
    const tot = lms.reduce((a, l) => a + (l.visits || 0) + (l.lastVisits || 0) * 0.3, 0);
    const want = Math.min(this.crowdMax, Math.round(tot * 0.45) + lms.length * 6);
    this.people.length = Math.min(this.people.length, want);
    while (this.people.length < want && lms.length) {
      const l = lms[this.people.length % lms.length], s = l.s * CELL, cx = cellCenter(l.x) - CELL / 2 + s / 2, cz = cellCenter(l.z) - CELL / 2 + s / 2;
      const a = Math.random() * TAU, r = s / 2 + 0.6 + Math.random() * 1.8;
      this.people.push({ cx, cz, a, r, sp: (Math.random() - 0.5) * 0.12, ph: Math.random() * 6 });
    }
    this.crowdMesh.count = this.people.length;
  }
  stepCrowd(dt) {
    const m = this._cm ??= new THREE.Matrix4();
    this.people.forEach((p, i) => {
      p.a += p.sp * dt; const x = p.cx + Math.cos(p.a) * p.r, z = p.cz + Math.sin(p.a) * p.r;
      m.makeTranslation(x, this.heightAt(x, z) + 0.05 + Math.abs(Math.sin(this.time * 4 + p.ph)) * 0.04, z); this.crowdMesh.setMatrixAt(i, m);
    });
    this.crowdMesh.instanceMatrix.needsUpdate = true;
  }
  // ---------------------------------------------------------------- juice: pooled puffs + fireworks
  buildFx() {
    this.fxMax = 160; this.fx = [];
    this.fxMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 0), S.glowMaterial(0xffffff, { day: 1.4, night: 3.5, additive: true }), this.fxMax);
    this.fxMesh.count = 0; this.fxMesh.frustumCulled = false; this.scene.add(this.fxMesh);
    this.dustMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 1), new THREE.MeshStandardNodeMaterial({ color: BIOME[this.type].sand, roughness: 1, transparent: true, opacity: 0.55, depthWrite: false }), 60);
    this.dustMesh.count = 0; this.dustMesh.frustumCulled = false; this.scene.add(this.dustMesh); this.dust = [];
  }
  puff(x, z, size = 1, n = 14) {
    const y = this.heightAt(x, z);
    for (let i = 0; i < n && this.dust.length < 60; i++) { const a = Math.random() * TAU, sp = 2 + Math.random() * 3; this.dust.push({ p: new THREE.Vector3(x, y + 0.3, z), v: new THREE.Vector3(Math.cos(a) * sp * size, 1 + Math.random() * 2, Math.sin(a) * sp * size), life: 1, s: (0.6 + Math.random()) * size }); }
  }
  firework(x, y, z, color) {
    const c = C(color);
    for (let i = 0; i < 26 && this.fx.length < this.fxMax; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * TAU, r = Math.sqrt(1 - u * u), sp = 9 + Math.random() * 4;
      const idx = this.fx.length; this.fxMesh.setColorAt(idx, c);
      this.fx.push({ p: new THREE.Vector3(x, y, z), v: new THREE.Vector3(r * Math.cos(a) * sp, u * sp, r * Math.sin(a) * sp), life: 1.4 + Math.random() * 0.6 });
    }
    if (this.fxMesh.instanceColor) this.fxMesh.instanceColor.needsUpdate = true;
  }
  stepFx(dt) {
    const m = this._fm ??= new THREE.Matrix4(), q = this._fq ??= new THREE.Quaternion(), s = this._fs ??= new THREE.Vector3();
    for (let i = this.fx.length - 1; i >= 0; i--) { const f = this.fx[i]; f.life -= dt; f.v.y -= 6 * dt; f.v.multiplyScalar(1 - dt * 1.2); f.p.addScaledVector(f.v, dt); if (f.life <= 0) this.fx.splice(i, 1); }
    this.fx.forEach((f, i) => { m.compose(f.p, q, s.setScalar(Math.min(1, f.life) * 0.7)); this.fxMesh.setMatrixAt(i, m); });
    this.fxMesh.count = this.fx.length; this.fxMesh.instanceMatrix.needsUpdate = true;
    for (let i = this.dust.length - 1; i >= 0; i--) { const d = this.dust[i]; d.life -= dt * 1.1; d.v.multiplyScalar(1 - dt * 2.5); d.p.addScaledVector(d.v, dt); if (d.life <= 0) this.dust.splice(i, 1); }
    this.dust.forEach((d, i) => { m.compose(d.p, q, s.setScalar(d.s * (1.6 - d.life))); this.dustMesh.setMatrixAt(i, m); });
    this.dustMesh.count = this.dust.length; this.dustMesh.instanceMatrix.needsUpdate = true;
  }
  // ---------------------------------------------------------------- construction sites (holographic scaffolds while building)
  buildSites() {
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const y = positionGeometry.y;
    mat.colorNode = vec3(0.35, 0.8, 1.0).mul(float(0.25).add(y.mul(14).fract().step(0.12).mul(0.6))).mul(S.U.night.mul(0.6).add(0.5));
    this.sites = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1, 1, 1, 1).translate(0, 0.5, 0), mat, 64); this.sites.count = 0; this.sites.frustumCulled = false; this.scene.add(this.sites);
  }
  updateSites() {
    const p = this.planet, m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(); let n = 0;
    for (const b of [...p.buildings, ...p.landmarks]) {
      if (b.built >= 1 || n >= 64) continue;
      const s = b.s * CELL, cx = cellCenter(b.x) - CELL / 2 + s / 2, cz = cellCenter(b.z) - CELL / 2 + s / 2;
      const h = (b.lm ? (LANDMARK_BY_ID[b.kind].height || 30) * 0.6 : 3 + b.s * 2) * (0.15 + b.built * 0.85);
      m.compose(v.set(cx, this.heightAt(cx, cz), cz), q, sc.set(s - 0.6, h, s - 0.6)); this.sites.setMatrixAt(n++, m);
    }
    this.sites.count = n; this.sites.instanceMatrix.needsUpdate = true;
  }
  // ---------------------------------------------------------------- placement ghost + selection ring
  buildGhost() {
    this.ghostMat = new THREE.MeshBasicNodeMaterial({ transparent: true, opacity: 0.35, depthWrite: false, color: 0x6aff9a });
    this.ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.ghostMat); this.ghost.visible = false; this.ghost.renderOrder = 5; this.scene.add(this.ghost);
    this.ghostEdge = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 4, 4), new THREE.MeshBasicNodeMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
    this.ghostEdge.rotation.set(Math.PI / 2, 0, Math.PI / 4); this.ghostEdge.visible = false; this.scene.add(this.ghostEdge);
    this.roadGhost = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL * 0.92, 0.25, CELL * 0.92), new THREE.MeshBasicNodeMaterial({ transparent: true, opacity: 0.45, depthWrite: false, color: 0x8ad8ff }), 64);
    this.roadGhost.count = 0; this.roadGhost.frustumCulled = false; this.scene.add(this.roadGhost);
    this.selRing = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 4, 4), S.glowMaterial(0xffd27a, { day: 2, night: 3 })); this.selRing.rotation.set(Math.PI / 2, 0, Math.PI / 4); this.selRing.visible = false; this.scene.add(this.selRing);
  }
  showGhost(x, z, size, ok, h = 2) {
    const s = size * CELL, cx = cellCenter(x) - CELL / 2 + s / 2, cz = cellCenter(z) - CELL / 2 + s / 2, y = this.heightAt(cx, cz);
    this.ghost.visible = this.ghostEdge.visible = true;
    this.ghost.scale.set(s - 0.3, h, s - 0.3); this.ghost.position.set(cx, y + h / 2, cz);
    this.ghostMat.color.set(ok ? 0x6aff9a : 0xff5a5a);
    this.ghostEdge.scale.setScalar(s * 0.72); this.ghostEdge.position.set(cx, y + 0.3, cz);
  }
  hideGhost() { this.ghost.visible = this.ghostEdge.visible = false; this.roadGhost.count = 0; }
  showRoadGhost(cells, okFn) {
    const m = new THREE.Matrix4(); let n = 0;
    for (const [x, z] of cells.slice(0, 64)) { const cx = cellCenter(x), cz = cellCenter(z); m.makeTranslation(cx, Math.max(this.heightAt(cx, cz), this.terrain.waterLevel + 0.4) + 0.2, cz); this.roadGhost.setMatrixAt(n++, m); }
    this.roadGhost.count = n; this.roadGhost.instanceMatrix.needsUpdate = true;
    this.roadGhost.material.color.set(cells.every(okFn) ? 0x8ad8ff : 0xffaa5a);
  }
  select(b) {
    if (!b) { this.selRing.visible = false; return; }
    const s = b.s * CELL, cx = cellCenter(b.x) - CELL / 2 + s / 2, cz = cellCenter(b.z) - CELL / 2 + s / 2;
    this.selRing.visible = true; this.selRing.scale.setScalar(s * 0.74); this.selRing.position.set(cx, this.heightAt(cx, cz) + 0.35, cz);
  }
  // ---------------------------------------------------------------- overlays: 'access' (road distance) · 'transit' (coverage)
  setOverlay(mode, net) {
    const d = this.overlayData; d.fill(0);
    const p = this.planet;
    if (mode === 'access' && net) {
      for (let k = 0; k < GRID * GRID; k++) {
        const v = p.grid[k]; let c = null;
        if (v === -1) c = net[k] < 0 ? [255, 70, 70] : net[k] < 8 ? [90, 255, 140] : net[k] < 16 ? [255, 220, 90] : [255, 150, 60];
        else if (v > 0) { const b = [...p.buildings, ...p.landmarks].find((q) => q.uid === v); c = b && b.access >= 0 ? [90, 200, 255] : [255, 70, 70]; }
        if (c) { d.set([...c, 255], k * 4); }
      }
    } else if (mode === 'transit') {
      const ts = p.buildings.filter((b) => b.kind === 'transit' && b.built >= 1);
      for (let k = 0; k < GRID * GRID; k++) { const x = k % GRID, z = (k / GRID) | 0; const cov = ts.some((t) => Math.max(Math.abs(t.x - x), Math.abs(t.z - z)) <= 6); if (cov) d.set([140, 255, 200, 200], k * 4); else if (p.land[k] === 0) d.set([255, 120, 90, 110], k * 4); }
    }
    this.overlayTex.needsUpdate = true;
    S.U.overlay.value = mode ? 1 : 0;
  }
  // ---------------------------------------------------------------- landmarks
  landmarkCenter(l) { const s = l.s * CELL; const cx = cellCenter(l.x) - CELL / 2 + s / 2, cz = cellCenter(l.z) - CELL / 2 + s / 2; return new THREE.Vector3(cx, this.heightAt(cx, cz), cz); }
  syncLandmarks() {
    const p = this.planet, keep = new Set();
    for (const l of p.landmarks) {
      keep.add(l.uid);
      if (this.landmarkObjs.has(l.uid)) continue;
      const def = LANDMARK_BY_ID[l.kind];
      const K = makeKit({ seed: l.seed });
      const g = bake(def.build(K));
      const c = this.landmarkCenter(l);
      // sink onto the highest footprint corner + a plinth skirt so nothing floats on slopes
      const s = l.s * CELL; let gmin = 1e9, gmax = -1e9;
      for (const [u, v] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5], [0, 0]]) { const h = this.heightAt(c.x + u * s, c.z + v * s); gmin = Math.min(gmin, h); gmax = Math.max(gmax, h); }
      const skirt = new THREE.Mesh(new THREE.BoxGeometry(s - 0.3, gmax - gmin + 1.4, s - 0.3), new THREE.MeshStandardNodeMaterial({ color: 0x6a6660, roughness: 0.95 }));
      skirt.position.set(c.x, (gmax + gmin) / 2 - 0.7 + 0.05, c.z); skirt.receiveShadow = true; this.scene.add(skirt);
      const holder = new THREE.Group(); holder.position.set(c.x, gmax + 0.05, c.z); holder.rotation.y = (l.rot || 0) * Math.PI / 2; holder.add(g);
      this.scene.add(holder);
      this.landmarkObjs.set(l.uid, { holder, g, skirt, def, rise: l.built >= 1 ? 1 : 0, l });
    }
    for (const [uid, o] of this.landmarkObjs) if (!keep.has(uid)) { this.scene.remove(o.holder, o.skirt); this.landmarkObjs.delete(uid); }
  }
  // ---------------------------------------------------------------- time of day: one value drives sky, fog, lights, windows
  setTime(tod, dayLen = 'standard', eclipse = 0) {
    const nightFrac = dayLen === 'long' ? 0.62 : dayLen === 'short' ? 0.36 : 0.46;
    const dayFrac = 1 - nightFrac, rise = 0.5 - dayFrac / 2;
    const ph = (tod - rise) / dayFrac; // 0 sunrise … 1 sunset
    const el = Math.sin(clamp(ph, -0.25, 1.25) * Math.PI) * (ph >= 0 && ph <= 1 ? 1 : 1);
    const elev = ph < 0 || ph > 1 ? -Math.min(0.6, Math.min(Math.abs(ph), Math.abs(ph - 1)) * 2.2) : el;
    const az = Math.PI * (0.2 + clamp(ph, -0.3, 1.3) * 0.9);
    const sd = S.U.sunDir.value.set(Math.cos(az) * Math.cos(Math.max(elev, -0.4)), elev, Math.sin(az) * Math.cos(Math.max(elev, -0.4)) * 0.6 - 0.35).normalize();
    const SK = this.sky;
    const tDay = smooth(0.05, 0.42, elev), tNight = smooth(0.02, -0.2, elev);
    const mixK = (k) => { const a = SK.dusk[k].clone ? SK.dusk[k].clone().lerp(SK.day[k], tDay) : lerp(SK.dusk[k], SK.day[k], tDay); return a.clone ? a.lerp(SK.night[k], tNight) : lerp(a, SK.night[k], tNight); };
    S.U.zenith.value.copy(mixK('z')); S.U.mid.value.copy(mixK('m')); S.U.horizon.value.copy(mixK('h')); S.U.ground.value.copy(mixK('g'));
    S.U.sunColor.value.copy(mixK('sun')); S.U.fogBlue.value.copy(mixK('fb')); S.U.fogDensity.value = mixK('fd');
    const ecl = eclipse;
    if (ecl > 0) { S.U.zenith.value.multiplyScalar(1 - ecl * 0.7); S.U.mid.value.multiplyScalar(1 - ecl * 0.6); S.U.horizon.value.lerp(C(0xff8a5a), ecl * 0.3); }
    const night = clamp(tNight * 1.1 + ecl * 0.6, 0, 1);
    S.U.night.value = night; S.U.day.value = 1 - night; S.U.dusk.value = clamp(1 - tDay - tNight, 0, 1);
    S.U.stars.value = smooth(0.15, 0.9, night) * (this.planet.traits.features.includes('clearSkies') ? 1.3 : 1) + (this.type === 'moon' ? 0.35 : 0);
    S.U.aurora.value = this.planet.traits.features.includes('auroras') ? night * (this.auroraBoost ?? 1) : 0;
    S.U.sunGlow.value = smooth(-0.25, 0.1, elev) * (1 - ecl * 0.8);
    this.sun.position.copy(sd).multiplyScalar(220).add(this.sun.target.position);
    this.sun.intensity = mixK('sunI') * smooth(-0.08, 0.12, elev) * (1 - ecl * 0.85);
    this.sun.color.copy(S.U.sunColor.value);
    this.hemi.intensity = mixK('hemiI'); this.hemi.color.copy(S.U.mid.value).lerp(S.U.horizon.value, 0.4); this.hemi.groundColor.copy(S.U.ground.value);
    this.fill.intensity = 0.25 + night * 0.25; this.fill.color.copy(S.U.zenith.value).lerp(C(0x8fb4ff), 0.5);
    this.fill.position.set(-sd.x, 0.6, -sd.z);
    this.scene.environmentIntensity = 0.12 + (1 - night) * 0.28;
    for (const b of this.bodies) { b.u.lightDir.value.copy(sd); b.atmo.u.lightDir.value.copy(sd); }
    this.elev = elev;
    return { night, elev };
  }
  todFor(phase) { // staging helper: golden hour / dusk / night for this planet's day length
    const d = this.planet.traits.day, nightFrac = d === 'long' ? 0.62 : d === 'short' ? 0.36 : 0.46, set = 0.5 + (1 - nightFrac) / 2;
    return { day: 0.5, golden: set - 0.035, dusk: set + 0.004, night: set + 0.09, midnight: 0.0 }[phase] ?? 0.5;
  }
  // ---------------------------------------------------------------- per-frame
  update(dt, t, camera) {
    this.time = t;
    // shadow frustum follows the camera target
    if (camera.userData.target) { const tg = camera.userData.target; this.sun.target.position.set(tg.x, 0, tg.z); const r = clamp((camera.userData.dist || 80) * 0.9, 40, 110); Object.assign(this.sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r }); this.sun.shadow.camera.updateProjectionMatrix(); }
    for (const [, o] of this.landmarkObjs) {
      const built = o.l.built >= 1;
      if (o.rise < 1) {
        if (built) { o.rise = Math.min(1, o.rise + dt / 3.2); }
        const k = built ? easeOut(o.rise) : 0;
        const h = o.def.height || 30;
        o.g.position.y = -h * (1 - k) - 0.5 * (1 - k);
        o.g.visible = built || o.rise > 0;
      }
      if (o.g.visible) for (const fn of o.g.userData.anims) fn(t, dt, S.U.night.value, o.g);
    }
    // pooled point lights: nearest landmark light anchors to the camera, only after dusk
    const cands = [];
    for (const [, o] of this.landmarkObjs) if (o.rise >= 1) for (const L of o.g.userData.lights) { const wp = (L._w ??= new THREE.Vector3()).copy(L.pos).applyMatrix4(o.g.matrixWorld); cands.push({ wp, L, d: wp.distanceToSquared(camera.position) }); }
    cands.sort((a, b) => a.d - b.d);
    this.pool.forEach((pl, i) => { const c = cands[i]; if (c) { pl.position.copy(c.wp); pl.color.copy(c.L.color); pl.intensity = (S.U.night.value * 70 + 6) * c.L.intensity; pl.distance = 60; } else pl.intensity = 0; });
    this.stepTraffic(dt); this.stepShips(dt); this.stepCrowd(dt); this.stepFx(dt);
    if (this.water && this.terrain.liquid === 'sea' && this.planet.traits.features.includes('tides')) this.water.position.y = Math.sin(t * 0.05) * 0.35;
    // construction: animate buildings that just finished
    for (let i = this.growing.length - 1; i >= 0; i--) { const g = this.growing[i]; g.k = Math.min(1, g.k + dt / 0.7); g.mesh.scale.y = Math.max(0.001, easeOutBack(g.k)); if (g.k >= 1) { this.scene.remove(g.mesh); this.growing.splice(i, 1); g.done(); } }
  }
  // building finished: show a separate mesh popping up, then merge it into the city
  // FABLE: crane + scaffold animation during construction and a little 'ribbon cutting' sparkle.
  growBuilding(b) {
    b._parts = buildingParts(b, this.type, this.heightAt, this.palette.neon, this.lowG); b._key = b.kind + b.level;
    const geo = mergeGeometries(b._parts);
    const s = b.s * CELL, cx = cellCenter(b.x) - CELL / 2 + s / 2, cz = cellCenter(b.z) - CELL / 2 + s / 2, y = this.heightAt(cx, cz);
    geo.translate(-cx, -y, -cz);
    const mesh = new THREE.Mesh(geo, this.bMat); mesh.position.set(cx, y, cz); mesh.scale.y = 0.001; mesh.castShadow = true; this.scene.add(mesh);
    this.growing.push({ mesh, k: 0, done: () => { b._shown = true; this.rebuildCity(); } });
    this.puff(cx, cz, b.s * 0.6, 10 + b.s * 4);
  }
  dispose() {
    this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    S.U.lavaGlow.value = 0;
  }
}
export const ease = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
