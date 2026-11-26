// Skyharbor TSL library: one shared uniform block (U) drives sky, fog, water, windows and every landmark glow,
// so a single time-of-day value re-lights the whole world consistently.
import * as THREE from 'three/webgpu';
import {
  Fn, uniform, vec2, vec3, vec4, float, mix, smoothstep, step, abs, max, min, pow, dot, normalize, length, fract, floor, sin, cos,
  positionGeometry, normalGeometry, positionWorld, normalWorld, positionLocal, positionView, positionWorldDirection, cameraPosition,
  attribute, time, fwidth, mx_fractal_noise_float, mx_noise_float, mx_worley_noise_float, fog, reflect, uv, clamp, exp, texture, atan, select, instanceIndex,
} from 'three/tsl';

const C = (h) => new THREE.Color(h);
export const U = {
  night: uniform(0), day: uniform(1), dusk: uniform(0),
  sunDir: uniform(new THREE.Vector3(0.3, 0.7, 0.4).normalize()),
  zenith: uniform(C(0x2f6fc4)), mid: uniform(C(0x6fa6e0)), horizon: uniform(C(0xcfe3f2)), ground: uniform(C(0x6c7a80)),
  sunColor: uniform(C(0xfff1d8)), sunGlow: uniform(1), fogDensity: uniform(0.0042), fogBlue: uniform(C(0x9fb8e0)),
  stars: uniform(0), aurora: uniform(0), auroraA: uniform(C(0x3dffb0)), auroraB: uniform(C(0xc04dff)),
  windowA: uniform(C(0xffc87a)), windowB: uniform(C(0xbfe2ff)), accent: uniform(C(0xffaa33)),
  grid: uniform(0), overlay: uniform(0), tide: uniform(0), lavaGlow: uniform(0), eclipse: uniform(0),
};
const hash3 = (p) => fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))).mul(43758.5453));
const hash2 = (p) => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453));
export const eqf = (a, k) => float(1).sub(step(0.5, abs(a.sub(k))));

// ---------------------------------------------------------------- sky (three-stop gradient + sun + stars + aurora)
export const skyColor = Fn(([d]) => {
  const y = d.y, up = max(y, 0);
  const c1 = mix(U.horizon, U.mid, smoothstep(0.0, 0.24, up));
  const c2 = mix(c1, U.zenith, smoothstep(0.16, 0.9, up));
  const below = mix(U.horizon, U.ground, smoothstep(0.0, 0.3, y.negate()));
  const col = mix(below, c2, step(0.0, y)).toVar();
  const sd = max(dot(d, U.sunDir), 0);
  const glow = pow(sd, 5).mul(0.22).add(pow(sd, 42).mul(0.55)).mul(U.sunGlow);
  col.addAssign(U.sunColor.mul(glow).mul(smoothstep(-0.25, 0.05, y)));
  return col;
});
export function skyBackground() {
  return Fn(() => {
    const d = positionWorldDirection.normalize();
    const col = skyColor(d).toVar();
    const sd = max(dot(d, U.sunDir), 0);
    col.addAssign(U.sunColor.mul(smoothstep(0.99935, 0.9997, sd)).mul(8).mul(step(-0.01, d.y)).mul(float(1).sub(U.eclipse.mul(0.85))));
    // stars: two hashed cell layers, faded by night and toward the horizon haze
    const star = (scale, thr) => {
      const p = d.mul(scale), cell = floor(p), h = hash3(cell);
      const off = vec3(hash3(cell.add(1.7)), hash3(cell.add(4.1)), hash3(cell.add(9.3)));
      const r = length(fract(p).sub(off));
      const tw = sin(time.mul(h.mul(3.0).add(0.6)).add(h.mul(40))).mul(0.3).add(0.7);
      return smoothstep(thr, 1.0, h).mul(pow(max(float(0), float(1).sub(r.mul(8))), 3)).mul(tw);
    };
    const s = star(90, 0.94).mul(2.4).add(star(200, 0.955).mul(1.4));
    col.addAssign(vec3(0.9, 0.93, 1.0).mul(s).mul(U.stars).mul(smoothstep(0.02, 0.25, d.y)));
    // milky band
    const band = pow(max(float(0), float(1).sub(abs(dot(d, normalize(vec3(0.3, 0.5, -0.8)))).mul(2.2))), 2);
    col.addAssign(vec3(0.35, 0.3, 0.5).mul(band).mul(mx_fractal_noise_float(d.mul(4), 3).add(0.4).max(0)).mul(U.stars).mul(0.35).mul(smoothstep(0.0, 0.3, d.y)));
    // aurora curtains (traits): bands of noise above the horizon, toward -z (north)
    const az = atan(d.x, d.z.negate());
    const curtain = mx_noise_float(vec2(az.mul(3.0), time.mul(0.05))).mul(0.5).add(0.5);
    const rays = pow(mx_noise_float(vec2(az.mul(26.0), time.mul(0.2))).mul(0.5).add(0.5), 2);
    const hgt = smoothstep(0.04, 0.16, d.y).mul(float(1).sub(smoothstep(0.25, 0.6 + 0.0, d.y.sub(curtain.mul(0.15)))));
    const aur = mix(U.auroraA, U.auroraB, smoothstep(0.12, 0.5, d.y)).mul(hgt).mul(rays.mul(0.8).add(0.2)).mul(curtain).mul(U.aurora).mul(smoothstep(-0.2, 0.6, d.z.negate()));
    col.addAssign(aur.mul(1.6));
    return col;
  })();
}
// Fog with blue-shift aerial perspective: mid distances drift toward a cooler, bluer haze; far distances converge on the
// exact horizon colour so silhouettes melt into the sky. Sun-side inscatter matches the sky's own sun glow.
export function fogNode() {
  const d = positionView.z.negate();
  const k = d.mul(U.fogDensity);
  const hFall = exp(positionWorld.y.max(0).mul(-0.012));
  const f = float(1).sub(exp(k.mul(k).negate())).mul(hFall).clamp(0, 1);
  const vdir = normalize(positionWorld.sub(cameraPosition));
  const ins = pow(max(dot(vdir, U.sunDir), 0), 6).mul(0.35).mul(U.sunGlow);
  const col = mix(U.fogBlue, U.horizon, smoothstep(0.35, 0.95, f)).add(U.sunColor.mul(ins));
  return fog(col, f);
}

// ---------------------------------------------------------------- planets (one program; types are uniforms)
export const PLANET_LOOK = {
  ocean: { deep: 0x0b2f66, shallow: 0x1f78b4, low: 0x4f8a3c, mid: 0x7a8f4a, high: 0x8a7a60, peak: 0xe8eef2, sea: 0.08, ice: 0.12, cloud: 0.62, cloudCol: 0xffffff, atmo: 0x5aa0ff, scale: 1.6 },
  desert: { deep: 0x7a4a24, shallow: 0xb8743c, low: 0xd8a060, mid: 0xc98848, high: 0x9a5a34, peak: 0xf0d8b0, sea: -0.3, ice: 0.03, cloud: 0.12, cloudCol: 0xf6e6cc, atmo: 0xffb070, scale: 2.2, dunes: 1 },
  ice: { deep: 0x2a4a72, shallow: 0x7ab0d8, low: 0xd8e8f4, mid: 0xb8d0e8, high: 0x90a8c8, peak: 0xffffff, sea: -0.02, ice: 0.6, cloud: 0.5, cloudCol: 0xf0f8ff, atmo: 0xa8e0ff, scale: 1.8 },
  jungle: { deep: 0x0d3a4a, shallow: 0x1e7a7a, low: 0x1f6a2a, mid: 0x2f8a34, high: 0x4a7a3a, peak: 0x9ab07a, sea: -0.08, ice: 0.04, cloud: 0.7, cloudCol: 0xf2fff4, atmo: 0x8affc8, scale: 2.0 },
  volcanic: { deep: 0x1a0c0a, shallow: 0x3a1a12, low: 0x2a2224, mid: 0x3a2e2e, high: 0x5a4640, peak: 0x8a7468, sea: -0.05, ice: 0.0, cloud: 0.3, cloudCol: 0x6a5a58, atmo: 0xff6a3a, scale: 2.4, lava: 1 },
  crystal: { deep: 0x2a1a5a, shallow: 0x6a4ac8, low: 0x8a7ad8, mid: 0xb8a8f0, high: 0xe0d0ff, peak: 0xffffff, sea: 0.0, ice: 0.08, cloud: 0.25, cloudCol: 0xf0e8ff, atmo: 0xd08aff, scale: 2.6, crystal: 1 },
  moon: { deep: 0x3a3a40, shallow: 0x55555c, low: 0x7a7a80, mid: 0x9a9aa0, high: 0xb0b0b6, peak: 0xd8d8de, sea: -0.6, ice: 0.1, cloud: 0.0, cloudCol: 0xffffff, atmo: 0x9ab0d0, scale: 3.0, craters: 1 },
  giant: { deep: 0xc89a6a, shallow: 0xe8c89a, low: 0xb86a3a, mid: 0xf0dcb8, high: 0x8a4a2a, peak: 0xfff0d8, sea: -0.9, ice: 0, cloud: 0.0, cloudCol: 0xffffff, atmo: 0xffd8a0, scale: 1.0, bands: 1 },
  giantBlue: { deep: 0x3a6ab8, shallow: 0x8ac0e8, low: 0x2a4a8a, mid: 0xc8e0f8, high: 0x1a3a6a, peak: 0xe8f4ff, sea: -0.9, ice: 0, cloud: 0.0, cloudCol: 0xffffff, atmo: 0x9ad0ff, scale: 1.0, bands: 1 },
};
export function planetMaterial(type, { seed = 1, lightDir = new THREE.Vector3(1, 0.3, 0.4), cityLights = 0, fogged = false } = {}) {
  const L = PLANET_LOOK[type] || PLANET_LOOK.ocean;
  const u = {
    deep: uniform(C(L.deep)), shallow: uniform(C(L.shallow)), low: uniform(C(L.low)), mid: uniform(C(L.mid)), high: uniform(C(L.high)), peak: uniform(C(L.peak)),
    sea: uniform(L.sea), ice: uniform(L.ice), cloud: uniform(L.cloud), cloudCol: uniform(C(L.cloudCol)), atmo: uniform(C(L.atmo)), scale: uniform(L.scale),
    lava: uniform(L.lava || 0), crystal: uniform(L.crystal || 0), bands: uniform(L.bands || 0), craters: uniform(L.craters || 0), dunes: uniform(L.dunes || 0),
    seed: uniform(new THREE.Vector3((seed * 0.731) % 17, (seed * 0.377) % 13, (seed * 0.113) % 11)),
    lightDir: uniform(lightDir.clone().normalize()), city: uniform(cityLights), ambient: uniform(0.04),
  };
  const mat = new THREE.MeshBasicNodeMaterial({ fog: fogged });
  mat.colorNode = Fn(() => {
    const p = normalize(positionLocal);
    const q = p.mul(u.scale).add(u.seed);
    const h = mx_fractal_noise_float(q, 5, 2.0, 0.5).toVar();
    const h2 = mx_fractal_noise_float(q.mul(3.7), 3, 2.0, 0.5);
    // craters (moons): worley pits
    const cr = mx_worley_noise_float(q.mul(2.2));
    h.addAssign(smoothstep(0.0, 0.35, cr).sub(1).mul(0.25).mul(u.craters));
    const land = smoothstep(u.sea.sub(0.015), u.sea.add(0.015), h);
    const water = mix(u.deep, u.shallow, smoothstep(u.sea.sub(0.3), u.sea, h));
    const t = h.sub(u.sea);
    const ground = mix(u.low, u.mid, smoothstep(0.0, 0.18, t.add(h2.mul(0.08)))).toVar();
    ground.assign(mix(ground, u.high, smoothstep(0.14, 0.34, t.add(h2.mul(0.1)))));
    ground.assign(mix(ground, u.peak, smoothstep(0.32, 0.5, t)));
    // dunes: wind-combed streaks
    ground.assign(mix(ground, ground.mul(0.78), sin(p.y.mul(90).add(h.mul(30))).mul(0.5).add(0.5).mul(u.dunes).mul(0.5)));
    const col = mix(water, ground, land).toVar();
    // gas-giant bands
    const lat = p.y.add(mx_fractal_noise_float(q.mul(vec3(1.5, 0.4, 1.5)), 3).mul(0.12));
    const b1 = sin(lat.mul(21.0)).mul(0.5).add(0.5), b2 = sin(lat.mul(47.0).add(1.3)).mul(0.5).add(0.5);
    const bandCol = mix(mix(u.low, u.mid, b1), mix(u.high, u.shallow, b2), smoothstep(0.3, 0.8, b2.mul(b1)));
    const storm = smoothstep(0.08, 0.0, length(p.sub(normalize(vec3(0.6, -0.25, 0.75)))).sub(0.06)).mul(u.bands);
    col.assign(mix(col, bandCol, u.bands));
    col.assign(mix(col, u.peak.mul(vec3(1.0, 0.7, 0.6)), storm));
    // ice caps
    const cap = smoothstep(float(1).sub(u.ice), float(1).sub(u.ice).add(0.06), abs(p.y).add(h.mul(0.25)));
    col.assign(mix(col, vec3(0.93, 0.96, 1.0), cap.mul(step(0.001, u.ice))));
    // crystal facets
    const cell = mx_worley_noise_float(q.mul(4.0));
    col.assign(mix(col, col.mul(1.35).add(vec3(0.1, 0.05, 0.2)), smoothstep(0.1, 0.0, cell).mul(u.crystal)));
    // lighting: soft terminator + ocean glint
    const N = normalize(normalWorld), V = normalize(cameraPosition.sub(positionWorld)), Ld = normalize(u.lightDir);
    const ndl = dot(N, Ld);
    const diff = smoothstep(-0.12, 0.55, ndl).toVar();
    const H = normalize(Ld.add(V));
    const spec = pow(max(dot(N, H), 0), 70).mul(float(1).sub(land)).mul(0.9).mul(step(0.0, ndl));
    // clouds
    const cq = p.mul(2.6).add(vec3(time.mul(0.012), 0, time.mul(0.006))).add(u.seed);
    const cl = smoothstep(0.02, 0.32, mx_fractal_noise_float(cq, 4, 2.0, 0.55)).mul(u.cloud);
    const surf = col.mul(diff.mul(0.95).add(u.ambient)).mul(float(1).sub(cl.mul(0.85))).add(spec.mul(float(1).sub(cl)));
    const lit = surf.add(u.cloudCol.mul(cl).mul(diff.add(u.ambient)));
    // night side: city lights (settled worlds) + lava glow
    const dark = float(1).sub(smoothstep(-0.2, 0.25, ndl));
    const cityCell = floor(p.mul(110));
    const lights = smoothstep(0.82, 0.98, hash3(cityCell)).mul(land).mul(u.city).mul(dark).mul(smoothstep(0.1, 0.25, mx_noise_float(q.mul(2.5)).add(0.2)));
    const lavaCrack = smoothstep(0.08, 0.0, abs(mx_noise_float(q.mul(3.0)))).mul(u.lava).mul(float(1).sub(cl));
    const lavaCol = vec3(1.0, 0.36, 0.08).mul(lavaCrack).mul(dark.mul(2.5).add(0.6));
    // limb (atmosphere scattering on the disc edge, lit side only)
    const fres = pow(float(1).sub(max(dot(N, V), 0)), 2.6);
    const rim = u.atmo.mul(fres).mul(smoothstep(-0.3, 0.4, ndl)).mul(0.9);
    return lit.add(vec3(1.0, 0.8, 0.45).mul(lights).mul(1.6)).add(lavaCol).add(rim);
  })();
  return { mat, u };
}
// Atmosphere halo: back-faced shell, additive, strongest at the planet limb, fades outward; only on the lit side.
export function atmosphereMaterial(color, lightDir, { strength = 1.0, fogged = false } = {}) {
  const u = { color: uniform(C(color)), lightDir: uniform(lightDir.clone().normalize()), strength: uniform(strength) };
  const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: fogged });
  mat.colorNode = Fn(() => {
    const N = normalize(normalWorld), V = normalize(cameraPosition.sub(positionWorld));
    const k = pow(smoothstep(0.0, 0.42, dot(N, V).negate()), 2.2);
    const litk = smoothstep(-0.35, 0.5, dot(N.negate(), normalize(u.lightDir)).negate());
    return u.color.mul(k).mul(litk).mul(u.strength);
  })();
  return { mat, u };
}
export function ringMaterial(inner, outer, a = 0xd8c8a8, b = 0x8a7a68, { fogged = false, opacity = 0.85 } = {}) {
  const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, transparent: true, depthWrite: false, fog: fogged });
  const ca = uniform(C(a)), cb = uniform(C(b));
  const r = length(positionLocal.xy), t = r.sub(inner).div(outer - inner);
  const bands = mx_noise_float(vec2(t.mul(38), 0.5)).mul(0.5).add(0.5);
  const fine = mx_noise_float(vec2(t.mul(160), 2.5)).mul(0.5).add(0.5);
  mat.colorNode = mix(cb, ca, bands).mul(fine.mul(0.4).add(0.75));
  mat.opacityNode = smoothstep(0.0, 0.06, t).mul(smoothstep(1.0, 0.9, t)).mul(bands.mul(0.7).add(0.3)).mul(smoothstep(0.2, 0.35, abs(t.sub(0.62))).mul(0.7).add(0.3)).mul(opacity);
  return { mat, ca, cb };
}

// ---------------------------------------------------------------- city buildings: procedural window grids, lit at night
// Attributes: color (wall albedo / neon colour), aWin = (style, floorHeight, litChance, baseY).
// style 0 plain · 1 punched windows · 2 ribbon glazing · 3 curtain-wall glass · 4 neon/emissive panel · 5 roof deck
export function buildingMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.78, metalness: 0.04 });
  const aWin = attribute('aWin', 'vec4'), wall = attribute('color', 'vec3');
  const p = positionGeometry, n = normalGeometry;
  const style = aWin.x, fh = aWin.y, litC = aWin.z, base = aWin.w;
  const side = float(1).sub(step(0.5, abs(n.y)));
  const hc = mix(p.x, p.z, step(0.5, abs(n.x)));
  const fy = p.y.sub(base).div(fh), fx = hc.div(fh.mul(0.8));
  const ux = fract(fx), uy = fract(fy);
  const cy = floor(fy), cx = floor(fx);
  const wP = step(0.22, ux).mul(step(ux, 0.78)).mul(step(0.3, uy)).mul(step(uy, 0.82));
  const wR = step(0.32, uy).mul(step(uy, 0.86)).mul(step(0.04, ux));
  const wC = step(0.05, ux).mul(step(ux, 0.95)).mul(step(0.07, uy)).mul(step(uy, 0.96));
  // distant façades: when a window cell shrinks below ~2px, fade the hard grid to its average coverage (kills moiré speckle)
  const aa = smoothstep(0.25, 0.6, max(fwidth(fx), fwidth(fy)));
  const avg = eqf(style, 1).mul(0.29).add(eqf(style, 2).mul(0.52)).add(eqf(style, 3).mul(0.8));
  const win = mix(wP.mul(eqf(style, 1)).add(wR.mul(eqf(style, 2))).add(wC.mul(eqf(style, 3))), avg, aa).mul(side).mul(step(0.0, fy)).toVar();
  const h = hash3(vec3(cx, cy, n.x.mul(3.1).add(n.z.mul(7.3)).add(base.mul(1.7))));
  const flick = fract(h.add(floor(time.mul(0.03).add(h.mul(17))).mul(0.618)));
  const lit = mix(step(float(1).sub(litC), flick), litC, aa);
  const lc = mix(U.windowA, U.windowB, step(0.82, fract(h.mul(7.13))));
  const glass = mix(vec3(0.16, 0.2, 0.26), U.horizon.mul(0.62), uy.mul(0.55).add(0.25)).mul(float(1).sub(U.night.mul(0.75)));
  const roof = float(1).sub(side);
  const grime = smoothstep(0.0, 3.0, fy).mul(0.12).add(0.88);
  const wallC = wall.mul(mix(grime, 0.62, roof)).mul(float(1).sub(eqf(style, 4).mul(0.6)));
  mat.colorNode = mix(wallC, glass, win);
  const neon = wall.mul(eqf(style, 4)).mul(U.night.mul(2.4).add(0.25));
  mat.emissiveNode = lc.mul(win).mul(lit).mul(U.night.mul(1.5).add(U.dusk.mul(0.45))).add(neon);
  mat.roughnessNode = mix(float(0.82), float(0.18), win);
  mat.metalnessNode = win.mul(0.3);
  return mat;
}

// ---------------------------------------------------------------- terrain: vertex colours + grain + grid + data overlays
export function terrainMaterial(overlayTex, half) {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.96, metalness: 0 });
  const vc = attribute('color', 'vec3');
  const wp = positionWorld;
  const grain = mx_noise_float(wp.xz.mul(0.35)).mul(0.07).add(mx_noise_float(wp.xz.mul(1.7)).mul(0.04)).add(1);
  const inZone = step(abs(wp.x), half).mul(step(abs(wp.z), half));
  const g = fract(wp.xz.div(4.0));
  const lineD = min(min(g.x, float(1).sub(g.x)), min(g.y, float(1).sub(g.y)));
  const line = float(1).sub(smoothstep(0.0, 0.035, lineD)).mul(inZone).mul(U.grid);
  const ouv = wp.xz.div(half * 2).add(0.5);
  const ov = texture(overlayTex, vec2(ouv.x, ouv.y));
  const base = vc.mul(grain);
  const withOv = mix(base, ov.rgb, ov.a.mul(U.overlay).mul(inZone).mul(0.62));
  mat.colorNode = mix(withOv, vec3(0.85, 0.95, 1.0), line.mul(0.35));
  mat.emissiveNode = vec3(0.4, 0.7, 1.0).mul(line).mul(0.12).add(ov.rgb.mul(ov.a).mul(U.overlay).mul(inZone).mul(U.night).mul(0.25));
  return mat;
}

// ---------------------------------------------------------------- liquids: sea / oasis / river / lake / ice / lava (uniform-weighted, one program)
export function waterMaterial(kind) {
  const look = {
    sea: [0x0a3a5a, 0x1d6f8a], oasis: [0x0d4a52, 0x2a9a9a], river: [0x123c34, 0x2a7a64], lake: [0x2a1a5a, 0x7a5ad0], ice: [0x9ab8d0, 0xe8f4fb], lava: [0x2a0804, 0xff5a14],
  }[kind] || [0x0a3a5a, 0x1d6f8a];
  const deep = uniform(C(look[0])), shal = uniform(C(look[1]));
  const isIce = float(kind === 'ice' ? 1 : 0), isLava = float(kind === 'lava' ? 1 : 0);
  const mat = new THREE.MeshBasicNodeMaterial();
  mat.colorNode = Fn(() => {
    const wp = positionWorld;
    const t = time.mul(0.35);
    const e = 0.6;
    const n0 = mx_noise_float(vec3(wp.x.mul(0.12), wp.z.mul(0.12), t));
    const nx = mx_noise_float(vec3(wp.x.add(e).mul(0.12), wp.z.mul(0.12), t)).sub(n0);
    const nz = mx_noise_float(vec3(wp.x.mul(0.12), wp.z.add(e).mul(0.12), t)).sub(n0);
    const fineN = mx_noise_float(vec3(wp.x.mul(0.6), wp.z.mul(0.6), t.mul(2.0))).mul(0.15);
    const N = normalize(vec3(nx.mul(-2.2).add(fineN), 1.0, nz.mul(-2.2).sub(fineN)));
    const V = normalize(cameraPosition.sub(wp));
    const R = reflect(V.negate(), N);
    const sky = skyColor(vec3(R.x, abs(R.y), R.z));
    const fres = pow(float(1).sub(max(dot(N, V), 0)), 4).mul(0.85).add(0.08);
    const body = mix(deep, shal, n0.mul(0.5).add(0.5).mul(0.6));
    const sun = pow(max(dot(R, U.sunDir), 0), 220).mul(U.sunColor).mul(3.0).mul(U.day);
    const water = mix(body.mul(U.day.mul(0.8).add(0.2)), sky, fres).add(sun);
    // ice: matte, cracked sheet with faint sky sheen
    const crack = smoothstep(0.035, 0.0, abs(mx_noise_float(wp.xz.mul(0.11)))).mul(0.18);
    const iceC = mix(deep, shal, mx_noise_float(wp.xz.mul(0.05)).mul(0.5).add(0.5)).mul(U.day.mul(0.75).add(0.25)).add(sky.mul(fres).mul(0.35)).sub(crack);
    // lava: dark crust over glowing flow, always emissive
    const flow = mx_fractal_noise_float(vec3(wp.x.mul(0.09), wp.z.mul(0.09).sub(time.mul(0.05)), time.mul(0.04)), 3);
    const hot = smoothstep(-0.05, 0.25, flow);
    const lavaC = mix(deep, shal.mul(2.2), hot).add(vec3(1.0, 0.6, 0.2).mul(pow(hot, 6)).mul(1.5));
    return mix(mix(water, iceC, isIce), lavaC, isLava);
  })();
  return mat;
}

// ---------------------------------------------------------------- glow family (landmarks, lamps, ships) — all keyed to U.night
export function glowMaterial(color, { day = 0.35, night = 2.6, additive = false, opacity = 1, side = THREE.FrontSide, pulse = 0, fogged = true } = {}) {
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: additive || opacity < 1, depthWrite: !additive, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, side, fog: fogged });
  const c = uniform(C(color));
  const pul = pulse ? sin(time.mul(pulse).add(positionWorld.y.mul(0.15))).mul(0.25).add(0.75) : float(1);
  mat.colorNode = c.mul(mix(float(day), float(night), U.night)).mul(pul);
  if (opacity < 1) mat.opacityNode = float(opacity);
  mat.userData.c = c;
  return mat;
}
// Flowing water/energy streaks along uv.y (waterfalls, jets): bright at night with colour wash.
export function flowMaterial(colA, colB, { speed = 0.8, opacity = 0.85 } = {}) {
  const a = uniform(C(colA)), b = uniform(C(colB));
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const st = uv();
  const streak = mx_noise_float(vec2(st.x.mul(22), st.y.mul(3).add(time.mul(speed)))).mul(0.5).add(0.5);
  const streak2 = mx_noise_float(vec2(st.x.mul(60), st.y.mul(9).add(time.mul(speed * 1.7)))).mul(0.5).add(0.5);
  const s = pow(streak.mul(0.6).add(streak2.mul(0.4)), 1.5);
  mat.colorNode = mix(a, b, s).mul(mix(float(0.9), float(2.4), U.night)).mul(s.mul(0.6).add(0.6));
  mat.opacityNode = s.mul(0.5).add(0.45).mul(opacity).mul(smoothstep(0.0, 0.08, st.x).mul(smoothstep(1.0, 0.92, st.x)));
  return mat;
}
// Aurora ribbons: green→magenta curtains rippling along uv.x; faint by day, blazing at night.
export function auroraRibbonMaterial() {
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const st = uv();
  const rip = mx_noise_float(vec2(st.x.mul(5).sub(time.mul(0.25)), time.mul(0.1))).mul(0.5).add(0.5);
  const rays = pow(mx_noise_float(vec2(st.x.mul(48).add(time.mul(0.6)), 0.3)).mul(0.5).add(0.5), 2.2);
  const col = mix(U.auroraA, U.auroraB, smoothstep(0.35, 1.0, st.y.add(rip.mul(0.2))));
  const fade = smoothstep(0.0, 0.25, st.y).mul(smoothstep(1.0, 0.55, st.y));
  mat.colorNode = col.mul(fade).mul(rays.mul(0.7).add(0.3)).mul(rip.add(0.3)).mul(mix(float(0.18), float(2.2), U.night));
  return mat;
}
// Iridescent crystal: thin-film hue shift by view angle + a band of light that climbs the structure at night.
export function crystalMaterial(color, { climb = 0.12, height = 50 } = {}) {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.12, metalness: 0.25, transparent: true });
  const c = uniform(C(color));
  const N = normalize(normalWorld), V = normalize(cameraPosition.sub(positionWorld));
  const fres = pow(float(1).sub(abs(dot(N, V))), 2.0);
  const film = vec3(sin(fres.mul(9).add(0.0)), sin(fres.mul(9).add(2.1)), sin(fres.mul(9).add(4.2))).mul(0.5).add(0.5);
  mat.colorNode = mix(c, film, fres.mul(0.55));
  mat.opacityNode = fres.mul(0.4).add(0.6);
  const yl = positionWorld.y.div(height);
  const band = pow(max(float(0), float(1).sub(abs(fract(yl.sub(time.mul(climb))).sub(0.5)).mul(6))), 3);
  mat.emissiveNode = c.mul(band.mul(2.6).add(0.35)).mul(U.night).add(film.mul(fres).mul(0.2));
  return mat;
}
// Stained "tidal glass": translucent sea-glass fins with coloured cells that light from within at night.
export function stainedGlassMaterial(color) {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.08, metalness: 0.1, transparent: true, side: THREE.DoubleSide, depthWrite: true });
  const c = uniform(C(color));
  const p = positionGeometry;
  const w = mx_worley_noise_float(p.mul(0.55));
  const cellId = hash3(floor(p.mul(0.55)));
  const pal = mix(mix(vec3(0.1, 0.8, 0.9), vec3(0.95, 0.5, 0.9), step(0.5, cellId)), vec3(1.0, 0.8, 0.35), step(0.8, cellId));
  const lead = smoothstep(0.05, 0.12, w);
  const N = normalize(normalWorld), V = normalize(cameraPosition.sub(positionWorld));
  const fres = pow(float(1).sub(abs(dot(N, V))), 2.0);
  mat.colorNode = mix(vec3(0.05, 0.06, 0.08), mix(c, pal, 0.35), lead);
  mat.opacityNode = fres.mul(0.45).add(0.4).mul(lead.mul(0.4).add(0.6));
  mat.emissiveNode = pal.mul(lead).mul(U.night.mul(1.9).add(0.04)).mul(sin(time.mul(0.6).add(cellId.mul(12))).mul(0.2).add(0.8));
  return mat;
}
// Light band chasing around a ring (Halo Gate): angle around local z.
export function chaseMaterial(base, accent, { speed = 0.18, bands = 3 } = {}) {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.35, metalness: 0.2 });
  const b = uniform(C(base)), a = uniform(C(accent));
  const ang = atan(positionLocal.y, positionLocal.x).div(Math.PI * 2).add(0.5);
  const band = pow(max(float(0), float(1).sub(abs(fract(ang.mul(bands).sub(time.mul(speed))).sub(0.5)).mul(2.2))), 6);
  const groove = smoothstep(0.92, 1.0, abs(sin(ang.mul(Math.PI * 2 * 48))));
  mat.colorNode = mix(b, b.mul(0.55), groove);
  mat.emissiveNode = a.mul(band.mul(2.0).add(groove.mul(0.3))).mul(U.night.mul(0.85).add(0.15));
  return mat;
}
// Bioluminescent pulse: slow breathing glow that travels down from the cap rim.
export function pulseMaterial(colA, colB, { speed = 0.9 } = {}) {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.6, metalness: 0, side: THREE.DoubleSide });
  const a = uniform(C(colA)), b = uniform(C(colB));
  const w = sin(positionWorld.y.mul(0.8).add(time.mul(speed)).add(positionWorld.x.mul(0.2))).mul(0.5).add(0.5);
  const c = mix(a, b, w);
  mat.colorNode = c.mul(0.35);
  mat.emissiveNode = c.mul(w.mul(1.6).add(0.4)).mul(U.night.mul(2.0).add(0.12));
  return mat;
}
// Blinking beacons (instanced): per-instance phase from instanceIndex.
export function beaconMaterial(color, { rate = 1.4 } = {}) {
  const mat = new THREE.MeshBasicNodeMaterial();
  const c = uniform(C(color));
  const ph = hash2(vec2(float(instanceIndex), 3.7)).mul(6.28);
  const blink = pow(sin(time.mul(rate).add(ph)).mul(0.5).add(0.5), 4);
  mat.colorNode = c.mul(blink.mul(3.5).mul(U.night.mul(0.8).add(0.2)).add(0.2));
  return mat;
}
// Laser / light beam: additive cylinder fading toward its end, only at night.
export function beamMaterial(color, { len = 300, nightOnly = true, strength = 1.4, flip = false } = {}) {
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const c = uniform(C(color));
  const t = flip ? float(0.5).sub(positionLocal.y.div(len)) : positionLocal.y.div(len).add(0.5);
  mat.colorNode = c.mul(pow(float(1).sub(t.clamp(0, 1)), 1.6)).mul(nightOnly ? U.night : float(1)).mul(strength);
  return mat;
}
// Soft additive radial pool (lamp light on the ground, mist, halos). Works on any plane with uv.
export function poolMaterial(color, { night = 0.9, day = 0.0, additive = true } = {}) {
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
  const c = uniform(C(color));
  const d = length(uv().sub(0.5)).mul(2);
  mat.colorNode = c.mul(pow(max(float(0), float(1).sub(d)), 2.2)).mul(mix(float(day), float(night), U.night));
  return mat;
}
// Vehicles: body colour from instanceColor, headlights (+z) white and tail-lights (−z) red, emissive at night.
export function vehicleMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.4, metalness: 0.2 });
  const z = positionGeometry.z;
  const head = smoothstep(0.32, 0.4, z), tail = smoothstep(-0.32, -0.4, z);
  mat.emissiveNode = vec3(1.0, 0.95, 0.85).mul(head).mul(2.5).add(vec3(1.0, 0.1, 0.05).mul(tail).mul(1.8)).mul(U.night.mul(0.9).add(0.1));
  return mat;
}
export { hash3 };
