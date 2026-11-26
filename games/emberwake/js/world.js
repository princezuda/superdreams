// Emberwake — builds a map's diorama: stepped pixel terrain with baked AO, shore-aware water, kitbashed houses,
// trees, swaying grass cards, props, glowing windows/lamps, and the dynamic bits (chests, shrines, gates).
// Everything static is merged per material (≈8 draw calls for a whole map).
import * as THREE from 'three/webgpu';
import { GB, V } from './geo.js';
import { T } from './atlas.js';
import { M, setWaterMask } from './render.js';
import { MAPS, mapInfo, heightAt, tileAt, stairDir, H_STEP, WALK } from './maps.js';

const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const hash2 = (x, z, s = 0) => { const h = Math.sin(x * 127.1 + z * 311.7 + s * 74.7) * 43758.5453; return h - Math.floor(h); };
const col = (h) => new THREE.Color(h);
const rgb = (h, k = 1) => { const c = col(h); return [c.r * k, c.g * k, c.b * k]; };
const mat4 = (x, y, z, ry = 0, sx = 1, sy = sx, sz = sx, rx = 0, rz = 0) => new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), V(sx, sy, sz));

const GROUND_TEX = { '.': ['grass1', 'grass2', 'grass3'], f: ['flowers'], ',': ['dirt'], ':': ['cobble'], _: ['planks'], s: ['sand'], r: ['cave'], m: ['moss'], '=': ['stone', 'stone', 'mossstone'], S: ['stairs'],
  '~': ['riverbed'], '#': ['rocktop'], R: ['cavetop'], W: ['stonetop'], T: ['grass1', 'grass2'], P: ['grass3', 'grass2'], b: ['grass1'], F: ['grass2'], x: ['dirt'], c: ['cave'], o: ['cave'] };
const SIDE_TEX = { '#': 'cliff', R: 'cavewall', W: 'brick', '=': 'brick', S: 'brick', s: 'sandside', r: 'cavewall', m: 'cavewall', c: 'cavewall', o: 'cavewall', _: 'wood', ':': 'housestone' };

export function buildWorld(mapId, flags = {}) {
  const Mp = MAPS[mapId], { W, H } = mapInfo(mapId), R = rng(mapId.length * 977 + W * 13 + H);
  const kind = Mp.kind, dark = Mp.light === 'cave' || Mp.light === 'crystal', spire = mapId === 'lanternspire' || mapId === 'stage_spire';
  const gW = new GB(), gDS = new GB(), gL = new GB(['sway']), gC = new GB(['sway']), gG = new GB();
  const out = { group: new THREE.Group(), colliders: [], lights: [], flames: [], dyn: {}, signs: [], W, H, tops: null, waterY: null, anim: [] };
  const floorOverride = Mp.floor || {};
  const voidY = spire ? -12 : -2.5;

  // ---------------------------------------------------------------- terrain heights
  const top = new Float32Array(W * H);
  const tl = (x, z) => (x < 0 || z < 0 || x >= W || z >= H ? null : Mp.tiles[z][x]);
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    const c = Mp.tiles[z][x], b = heightAt(mapId, x + 0.5, z + 0.5);
    let h = b;
    if (c === '#') h = b + 1.2 + Math.round(hash2(x >> 2, z >> 2, 3) * 2) * 0.75 + (hash2(x, z, 4) < 0.15 ? 0.75 : 0) + (kind === 'field' && z < 3 ? 1.5 : 0);
    else if (c === 'R') h = b + 1.6 + hash2(x, z, 5) * 0.5;
    else if (c === 'W') h = b + 1.4;
    else if (c === '~') h = -0.7;
    else if (c === ' ') h = NaN;
    else if (c === '_') h = b + 0.08;
    top[z * W + x] = h;
  }
  const outsideH = spire ? voidY : kind === 'dungeon' ? 2.2 : kind === 'stage' ? (Mp.tiles[0][0] === 'R' ? 2.2 : 0) : 0;
  const hT = (x, z) => { if (x < 0 || z < 0 || x >= W || z >= H) return outsideH; const v = top[z * W + x]; return Number.isNaN(v) ? voidY : v; };
  out.tops = top;

  // ---------------------------------------------------------------- terrain faces
  const texFor = (c, x, z) => { const o = floorOverride[c]; if (o) return T[o]; if (c === '#' && kind !== 'dungeon' && top[z * W + x] < 2.4) return T[hash2(x, z, 3) < 0.5 ? 'grass2' : 'grass3']; const l = GROUND_TEX[c] || ['grass1']; return T[l[Math.floor(hash2(x, z, 9) * l.length)]]; };
  const sideFor = (c) => T[SIDE_TEX[c] || 'dirtside'];
  const groundTint = (c, x, z) => {
    const n = hash2(x, z, 1) * 0.08 - 0.04, lo = hash2(x >> 2, z >> 2, 11) * 0.16 - 0.08;
    if ('.fTPbF'.includes(c)) return [1 + n + lo * 0.6, 1 + n + lo, 1 + n + lo * 0.3];
    if (c === '#') return [1.05 + n, 1.0 + n, 0.95 + n];
    return [1 + n * 0.5, 1 + n * 0.5, 1 + n * 0.5];
  };
  const isWaterT = (x, z, strict) => { const c = tl(x, z); if (c === null) return !strict ? false : kind === 'town' || kind === 'field' ? isEdgeSea(x, z) : false; return c === '~'; };
  const isEdgeSea = (x, z) => { const cx = Math.max(0, Math.min(W - 1, x)), cz = Math.max(0, Math.min(H - 1, z)); return Mp.tiles[cz][cx] === '~'; };
  let anyWater = false;
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    const c = Mp.tiles[z][x], h = top[z * W + x]; if (Number.isNaN(h)) continue;
    if (c === '~') anyWater = true;
    const tint = groundTint(c, x, z);
    if (c === 'S') { stairs(gW, mapId, x, z, h, hT); continue; }
    // top with corner AO
    const ao = (cx, cz) => { let k = 0; for (const [dx, dz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) if (hT(cx + dx, cz + dz) > h + 0.3) k++; return k ? (k >= 2 ? 0.52 : 0.66) : 1; };
    const cc = (cx, cz) => { const a = ao(cx, cz); return [tint[0] * a, tint[1] * a, tint[2] * a]; };
    gW.quad(V(x, h, z + 1), V(x + 1, h, z + 1), V(x + 1, h, z), V(x, h, z), texFor(c, x, z), null, [0, 0, 1, 1], [cc(x, z + 1), cc(x + 1, z + 1), cc(x + 1, z), cc(x, z)]);
    // sides down to each lower neighbour
    const st = sideFor(c);
    for (const [dx, dz, o, U] of [[0, 1, V(x, 0, z + 1), V(1, 0, 0)], [0, -1, V(x + 1, 0, z), V(-1, 0, 0)], [1, 0, V(x + 1, 0, z + 1), V(0, 0, -1)], [-1, 0, V(x, 0, z), V(0, 0, 1)]]) {
      let nh = hT(x + dx, z + dz); if (tl(x + dx, z + dz) === 'S') nh = Math.max(nh - H_STEP, voidY);
      if (nh >= h - 0.01) continue;
      const bottom = Math.max(nh, h - 14); const hh = h - bottom;
      const tall = hh > 1.2;
      gW.face(V(o.x, bottom, o.z), U, V(0, hh, 0), st, tint, { shade: (b) => (tall ? 0.5 + 0.5 * b : 0.62 + 0.38 * b) });
    }
  }
  // ---------------------------------------------------------------- water + skirt
  if (anyWater || kind === 'town' || kind === 'field' || spire) {
    const pad = 40, wy = spire ? voidY + 0.4 : -0.22; out.waterY = wy;
    const wg = new THREE.PlaneGeometry(W + pad * 2, H + pad * 2); wg.rotateX(-Math.PI / 2); wg.translate(W / 2, wy, H / 2);
    const wm = new THREE.Mesh(wg, M.water); wm.renderOrder = 2; out.group.add(wm);
    setWaterMask(W, H, (x, z, strict) => (spire ? true : isWaterT(x, z, strict)));
  }
  if (kind === 'town' || kind === 'field' || kind === 'stage') {
    // skirt of ground beyond the map so the diorama never ends in a hard edge (sea-side edges stay open water)
    const skirt = new GB();
    const sk = (x0, z0, x1, z1) => skirt.face(V(x0, -0.02, z1), V(x1 - x0, 0, 0), V(0, 0, z0 - z1), T.grass2, [0.55, 0.62, 0.5], { scale: 0.25 });
    const pad = 30;
    const seaEast = Mp.tiles.every((r) => r[W - 1] === '~' || r[W - 1] === 's') || mapId === 'saltmere', seaSouth = Mp.tiles[H - 1].split('').filter((c) => c === '~').length > W / 2;
    sk(-pad, -pad, W + (seaEast ? 0 : pad), 0); sk(-pad, 0, 0, H + (seaSouth ? 0 : pad));
    if (!seaEast) sk(W, 0, W + pad, H + (seaSouth ? 0 : pad));
    if (!seaSouth) sk(0, H, W, H + pad);
    const m = new THREE.Mesh(skirt.build(), M.world); m.receiveShadow = true; out.group.add(m);
    // forest wall beyond the border so the camera never sees bare skirt
    for (let i = 0; i < (kind === 'stage' ? (Mp.light === 'dusk' ? 50 : 0) : 160); i++) {
      const side = kind === 'stage' ? 2 : i % 4; let x, z;
      if (side === 0) { x = -2 - R() * 10; z = R() * H; } else if (side === 1 && !seaEast) { x = W + 1 + R() * 10; z = R() * H; } else if (side === 2) { x = R() * W; z = -2 - R() * 8; } else if (!seaSouth) { x = R() * W; z = H + 1 + R() * 6; } else continue;
      if (R() < 0.5) pine(gL, gW, x, 0, z, 0.9 + R() * 0.6, R); else tree(gL, gW, x, 0, z, 0.9 + R() * 0.5, R, mapId);
    }
  }

  // ---------------------------------------------------------------- tile dressing: trees, bushes, cards, crystals, roots, thorns
  const thorns = new GB();
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    const c = Mp.tiles[z][x], h = top[z * W + x], cx = x + 0.5, cz = z + 0.5, r1 = hash2(x, z, 2), r2 = hash2(x, z, 7);
    const underBuilding = (Mp.buildings || []).some((b) => x >= b.x && x < b.x + b.w && z >= b.z && z < b.z + b.d);
    if (underBuilding) continue;
    if (c === 'T') tree(gL, gW, cx + (r1 - 0.5) * 0.4, h, cz + (r2 - 0.5) * 0.3, 0.85 + r1 * 0.45, R, mapId);
    else if (c === 'P') pine(gL, gW, cx + (r1 - 0.5) * 0.3, h, cz + (r2 - 0.5) * 0.3, 0.85 + r2 * 0.5, R);
    else if (c === 'b') bush(gL, cx, h, cz, R);
    else if (c === 'x') thornCluster(thorns, cx, h, cz, R);
    else if (c === 'c') { crystal(gG, gW, cx, h, cz, Mp.light === 'crystal' ? (r1 < 0.5 ? '#7fe8ff' : '#b08cff') : '#ffb070', 0.9, R); out.lights.push({ x: cx, y: h + 1, z: cz, c: r1 < 0.5 ? '#6ad8ff' : '#a080ff', i: 2.5, r: 5 }); }
    else if (c === 'o') rootTangle(gW, cx, h, cz, R);
    if ('.f'.includes(c)) {
      const nearWater = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => tl(x + dx, z + dz) === '~');
      const n = c === 'f' ? 3 : r1 < (kind === 'town' ? 0.25 : 0.5) ? 1 + (r2 < 0.4 ? 1 : 0) : 0;
      for (let i = 0; i < n; i++) card(gC, cx + (R() - 0.5) * 0.8, h, cz + (R() - 0.5) * 0.8, c === 'f' ? [T.cardRed, T.cardYellow, T.cardBlue][(R() * 3) | 0] : nearWater && R() < 0.6 ? T.cardReed : T.cardGrass, 0.5 + R() * 0.25, R);
    }
    if (c === 'm') { for (let i = 0; i < 2; i++) card(gC, cx + (R() - 0.5) * 0.7, h, cz + (R() - 0.5) * 0.7, T.cardMush, 0.4, R); if (r1 < 0.6) { glowDot(gG, cx, h + 0.15, cz, '#5affd0', 0.08); } }
    if (c === 's' && r1 < 0.07) gW.quad(V(cx - 0.3, h + 0.01, cz + 0.3), V(cx + 0.3, h + 0.01, cz + 0.3), V(cx + 0.3, h + 0.01, cz - 0.3), V(cx - 0.3, h + 0.01, cz - 0.3), T.shells);
    if ((c === 'r' || c === '=') && r1 < 0.05 && kind !== 'stage') rock(gW, cx + (r2 - 0.5) * 0.6, h, cz, 0.18 + r2 * 0.15, R, c === '=' ? T.statue : T.cavewall);
  }
  if (thorns.count) { const tm = new THREE.Mesh(thorns.build(), M.world); tm.castShadow = true; out.group.add(tm); out.dyn.thorns = tm; tm.visible = !flags.thornsGone; }

  // ---------------------------------------------------------------- buildings
  for (const b of Mp.buildings || []) {
    if (b.k === 'house') house(gW, gG, b, out);
    else if (b.k === 'shrine') shrineHouse(gW, gG, b, out, flags);
  }
  // ---------------------------------------------------------------- props
  const dynGroups = {};
  const P = { gW, gDS, gL, gC, gG, out, R, flags, mapId, hT, dyn: dynGroups };
  for (const p of Mp.props || []) { const fn = PROPS[p.k]; if (fn) fn(P, p); }
  for (const [k, gb] of Object.entries(dynGroups)) { if (!gb.count) continue; const m = new THREE.Mesh(gb.build(), k.startsWith('glow') ? M.glow : M.world); m.castShadow = !k.startsWith('glow'); out.group.add(m); out.dyn[k] = m; }

  // ---------------------------------------------------------------- flush static meshes
  const add = (gb, mat, { shadow = true, recv = true } = {}) => { if (!gb.count) return null; const m = new THREE.Mesh(gb.build(), mat); m.castShadow = shadow; m.receiveShadow = recv; out.group.add(m); return m; };
  out.meshWorld = add(gW, M.world); add(gDS, M.worldDS); add(gL, M.leaves); add(gC, M.cards, { shadow: false }); add(gG, M.glow, { shadow: false, recv: false });
  return out;
}

// ================================================================ terrain pieces
function stairs(g, id, x, z, h, hT) {
  const d = stairDir(id, x, z) || { dx: 0, dz: 1 }, lo = h - H_STEP;
  const y = (cx, cz) => { const t = d.dz === 1 ? cz - z : d.dz === -1 ? 1 - (cz - z) : d.dx === 1 ? cx - x : 1 - (cx - x); return h - H_STEP * t; };
  // steps: 4 treads
  const n = 4;
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n, yy = h - H_STEP * (t0 + 0.5 / n) + 0.09;
    let x0, x1, z0, z1;
    if (d.dz) { x0 = x; x1 = x + 1; const a = d.dz === 1 ? z + t0 : z + 1 - t1, b2 = d.dz === 1 ? z + t1 : z + 1 - t0; z0 = a; z1 = b2; } else { z0 = z; z1 = z + 1; const a = d.dx === 1 ? x + t0 : x + 1 - t1, b2 = d.dx === 1 ? x + t1 : x + 1 - t0; x0 = a; x1 = b2; }
    g.box(x0, yy - 0.2, z0, x1, yy, z1, { side: T.brick, top: T.stairs }, [1, 1, 1], { sides: d.dz === 1 ? 's' : d.dz === -1 ? 'n' : d.dx === 1 ? 'e' : 'w' });
  }
  // solid body under the ramp + lateral sides
  for (const [dx, dz, o, Uv] of [[0, 1, V(x, 0, z + 1), V(1, 0, 0)], [0, -1, V(x + 1, 0, z), V(-1, 0, 0)], [1, 0, V(x + 1, 0, z + 1), V(0, 0, -1)], [-1, 0, V(x, 0, z), V(0, 0, 1)]]) {
    const nh = hT(x + dx, z + dz); const ex = (dx === d.dx && dz === d.dz) ? lo : h;
    const bottom = Math.min(nh, lo); if (ex - 0.01 <= bottom || nh >= ex - 0.01) continue;
    g.face(V(o.x, bottom, o.z), Uv, V(0, ex - bottom, 0), T.brick, [0.85, 0.85, 0.9], { shade: (b) => 0.55 + 0.45 * b });
  }
}

let AUTUMN = true;
export function setSeason(autumn) { AUTUMN = !!autumn; }
const LEAF_PALETTES = { kindlewick: ['#5aa04a', '#d8902a', '#c85a2a', '#7ab04a', '#e8b040'], overworld: ['#4e9a40', '#5aa84a', '#6ab04a', '#d89a3a', '#3e8a3a', '#c86a2a'], saltmere: ['#4a9050', '#3e8048', '#5aa058'], default: ['#4e9a40', '#5aa84a'] };
function tree(gL, gW, x, y, z, s, R, mapId) {
  gW.geom(new THREE.CylinderGeometry(0.1 * s, 0.17 * s, 1.1 * s, 6), T.bark, [0.9, 0.9, 0.9], mat4(x, y + 0.55 * s, z));
  const pal = (AUTUMN && LEAF_PALETTES[mapId]) || LEAF_PALETTES.default; const base = pal[Math.floor(R() * pal.length)];
  const blobs = [[0, 1.45, 0, 0.64], [-0.34, 1.2, 0.12, 0.47], [0.3, 1.78, -0.05, 0.44]];
  for (const [bx, by, bz, br] of blobs) {
    const k = 0.9 + R() * 0.2;
    gL.geom(new THREE.IcosahedronGeometry(br * s, 1), T.leaves, rgb(base, k), mat4(x + bx * s, y + by * s, z + bz * s, R() * 6, 1, 0.92, 1), { jitter: 0.1 * s, seed: x * 7 + z, ex: { sway: 1 }, uvScale: [2, 2], colFn: (p, C) => { const t = Math.max(0.6, Math.min(1.15, 0.75 + (p.y - y) / (2.2 * s) * 0.4 + (p.z - z) * 0.15)); return [C[0] * t, C[1] * t, C[2] * t]; } });
  }
}
function pine(gL, gW, x, y, z, s, R) {
  gW.geom(new THREE.CylinderGeometry(0.08 * s, 0.13 * s, 0.7 * s, 5), T.bark, [0.8, 0.8, 0.8], mat4(x, y + 0.35 * s, z));
  const k = 0.85 + R() * 0.25;
  for (let i = 0; i < 3; i++) gL.geom(new THREE.ConeGeometry((0.72 - i * 0.18) * s, (0.95 - i * 0.12) * s, 7), T.pine, [k * (0.78 + i * 0.1), k * (0.9 + i * 0.08), k * (0.82 + i * 0.06)], mat4(x, y + (0.85 + i * 0.5) * s, z, R() * 3), { jitter: 0.05 * s, ex: { sway: 0.6 + i * 0.2 }, uvScale: [2, 1] });
}
function bush(gL, x, y, z, R) { for (let i = 0; i < 2; i++) gL.geom(new THREE.IcosahedronGeometry(0.34 + R() * 0.1, 1), T.leaves, rgb('#4e8a3a', 0.9 + R() * 0.2), mat4(x + (i - 0.5) * 0.35, y + 0.28, z + (R() - 0.5) * 0.2, 0, 1, 0.8, 1), { jitter: 0.06, seed: x + i, ex: { sway: 0.4 } }); }
function card(g, x, y, z, tex, s, R) {
  const a = R() * 0.6 - 0.3;
  for (const ang of [a + Math.PI / 4, a - Math.PI / 4]) {
    const dx = Math.cos(ang) * s / 2, dz = Math.sin(ang) * s / 2;
    g.tri(V(x - dx, y, z - dz), V(x + dx, y, z + dz), V(x + dx, y + s, z + dz), tex, [0, 0], [1, 0], [1, 1], [1, 1, 1], null, [[0.75, 0.75, 0.75], [0.75, 0.75, 0.75], [1.05, 1.05, 1.05]]);
    g.extra.sway.splice(-3, 3, 0, 0, 1);
    g.tri(V(x - dx, y, z - dz), V(x + dx, y + s, z + dz), V(x - dx, y + s, z - dz), tex, [0, 0], [1, 1], [0, 1], [1, 1, 1], null, [[0.75, 0.75, 0.75], [1.05, 1.05, 1.05], [1.05, 1.05, 1.05]]);
    g.extra.sway.splice(-3, 3, 0, 1, 1);
  }
}
function glowDot(g, x, y, z, c, r) { g.geom(new THREE.OctahedronGeometry(r, 0), T.cloth, rgb(c, 2.2), mat4(x, y, z)); }
function rock(g, x, y, z, s, R, tex = T.cliff) { g.geom(new THREE.IcosahedronGeometry(s, 0), tex, [0.85, 0.85, 0.85], mat4(x, y + s * 0.4, z, R() * 6, 1, 0.7, 1), { jitter: s * 0.3, seed: x * 3 + z }); }
function thornCluster(g, x, y, z, R) {
  for (let i = 0; i < 5; i++) { const a = R() * 6.28, l = 1.2 + R() * 1.2; g.geom(new THREE.ConeGeometry(0.1, l, 5), T.thorn, [0.9, 0.7, 0.8], mat4(x + Math.cos(a) * 0.3, y + l * 0.4, z + Math.sin(a) * 0.3, a, 1, 1, 1, (R() - 0.5) * 1.4, (R() - 0.5) * 1.4)); }
  g.geom(new THREE.IcosahedronGeometry(0.55, 1), T.thorn, [0.7, 0.55, 0.65], mat4(x, y + 0.5, z, 0, 1, 0.9, 1), { jitter: 0.25, seed: x + z });
}
function rootTangle(g, x, y, z, R) { for (let i = 0; i < 3; i++) g.geom(new THREE.CylinderGeometry(0.12, 0.2, 1.8, 6), T.roots, [0.9, 0.9, 0.9], mat4(x + (R() - 0.5) * 0.5, y + 0.6, z + (R() - 0.5) * 0.4, R() * 3, 1, 1, 1, (R() - 0.5) * 1.2, (R() - 0.5) * 1.6), { jitter: 0.05 }); }
function crystal(gG, gW, x, y, z, c, s, R) {
  rock(gW, x, y, z, 0.3 * s, R, T.cavewall);
  for (let i = 0; i < 4; i++) { const h = (0.6 + R() * 0.8) * s; gG.geom(new THREE.OctahedronGeometry(0.18 * s, 0), T.cloth, rgb(c, 0.75 + R() * 0.35), mat4(x + (R() - 0.5) * 0.4 * s, y + h * 0.45, z + (R() - 0.5) * 0.4 * s, R() * 3, 1, h * 3.2, 1, (R() - 0.5) * 0.6, (R() - 0.5) * 0.6)); }
}

// ================================================================ buildings
function house(g, gG, b, out) {
  const { x, z, w, d } = b, x0 = x + 0.15, x1 = x + w - 0.15, z0 = z + 0.15, z1 = z + d - 0.1;
  const wallTex = { plaster: T.plaster, timber: T.timber, stone: T.housestone }[b.wall] || T.plaster;
  const fh = 0.35, wh = (b.floors === 2 ? 3.0 : 2.0), y1 = fh + wh;
  if (b.stilts) for (const [px, pz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) g.box(px - 0.08, -0.8, pz - 0.08, px + 0.08, 0.1, pz + 0.08, T.darkwood);
  g.box(x0 - 0.08, 0, z0 - 0.08, x1 + 0.08, fh, z1 + 0.08, T.foundation, [0.9, 0.9, 0.9]);
  g.box(x0, fh, z0, x1, y1, z1, { side: wallTex, top: wallTex }, [1, 1, 1], { top: false, shade: (k) => 0.78 + 0.22 * k });
  if (b.floors === 2) g.box(x0 - 0.05, fh + 1.45, z0 - 0.05, x1 + 0.05, fh + 1.6, z1 + 0.05, T.darkwood, [0.9, 0.9, 0.9]);
  // roof: ridge along the longer axis, generous overhang (Octopath-style chunky eaves)
  const roofC = rgb(b.roof || '#8a4a3a', 1.25), ov = 0.38, alongX = w >= d;
  const rh = Math.min(w, d) * 0.55 + 0.3;
  if (alongX) {
    const zm = (z0 + z1) / 2, yr = y1 + rh;
    const a = V(x0 - ov, y1 - 0.2, z1 + ov), bb = V(x1 + ov, y1 - 0.2, z1 + ov), c = V(x1 + ov, yr, zm), dd = V(x0 - ov, yr, zm);
    g.face(a, V(bb.x - a.x, 0, 0), V(0, yr - a.y, zm - a.z), T.roof, roofC, { shade: (k) => 0.82 + 0.25 * k });
    const a2 = V(x1 + ov, y1 - 0.2, z0 - ov);
    g.face(a2, V(-(x1 - x0 + 2 * ov), 0, 0), V(0, yr - a2.y, zm - a2.z), T.roof, roofC.map((v) => v * 0.72));
    // fascia (roof thickness) along the eaves
    g.box(x0 - ov, y1 - 0.32, z1 + ov - 0.06, x1 + ov, y1 - 0.18, z1 + ov + 0.02, T.darkwood, [0.8, 0.8, 0.8]);
    g.tri(V(x1, y1, z1), V(x1, y1, z0), V(x1, yr - 0.1, zm), wallTex, [0, 0], [1, 0], [0.5, 1], [0.8, 0.8, 0.8]);
    g.tri(V(x0, y1, z0), V(x0, y1, z1), V(x0, yr - 0.1, zm), wallTex, [0, 0], [1, 0], [0.5, 1], [0.95, 0.95, 0.95]);
    g.box(x0 - ov - 0.05, yr - 0.08, zm - 0.1, x1 + ov + 0.05, yr + 0.1, zm + 0.1, T.darkwood, [0.8, 0.8, 0.8]);
    // chimney
    const cx = x0 + (x1 - x0) * 0.72; g.box(cx - 0.22, y1 + rh * 0.4, zm - 0.6, cx + 0.22, yr + 0.6, zm - 0.18, T.housestone, [0.85, 0.85, 0.85]);
    out.chimneys = out.chimneys || []; out.chimneys.push([cx, yr + 0.7, zm - 0.4]);
  } else {
    const xm = (x0 + x1) / 2, yr = y1 + rh;
    g.face(V(x1 + ov, y1 - 0.2, z1 + ov), V(0, 0, -(z1 - z0 + 2 * ov)), V(xm - x1 - ov, yr - y1 + 0.2, 0), T.roof, roofC.map((v) => v * 0.85));
    g.face(V(x0 - ov, y1 - 0.2, z0 - ov), V(0, 0, z1 - z0 + 2 * ov), V(xm - x0 + ov, yr - y1 + 0.2, 0), T.roof, roofC);
    g.tri(V(x0, y1, z1), V(x1, y1, z1), V(xm, yr - 0.1, z1), wallTex, [0, 0], [1, 0], [0.5, 1], [1, 1, 1]);
    g.tri(V(x1, y1, z0), V(x0, y1, z0), V(xm, yr - 0.1, z0), wallTex, [0, 0], [1, 0], [0.5, 1], [0.8, 0.8, 0.8]);
    g.box(xm - 0.1, yr - 0.08, z0 - ov - 0.05, xm + 0.1, yr + 0.1, z1 + ov + 0.05, T.darkwood, [0.8, 0.8, 0.8]);
  }
  // door (proud of the wall), frame, step, lamp
  const dx = b.door ?? x + w / 2, zf = z1 + 0.02;
  g.quad(V(dx - 0.42, fh, zf), V(dx + 0.42, fh, zf), V(dx + 0.42, fh + 1.35, zf), V(dx - 0.42, fh + 1.35, zf), T.door, [0.95, 0.95, 0.95]);
  g.box(dx - 0.52, fh, zf - 0.02, dx - 0.42, fh + 1.45, zf + 0.06, T.darkwood); g.box(dx + 0.42, fh, zf - 0.02, dx + 0.52, fh + 1.45, zf + 0.06, T.darkwood); g.box(dx - 0.52, fh + 1.35, zf - 0.02, dx + 0.52, fh + 1.47, zf + 0.06, T.darkwood);
  g.box(dx - 0.55, 0, zf, dx + 0.55, 0.2, zf + 0.35, T.housestone, [0.9, 0.9, 0.9]);
  gG.box(dx + 0.6, fh + 1.35, zf + 0.08, dx + 0.78, fh + 1.6, zf + 0.26, T.cloth, rgb('#ffb460', 2.2));
  g.box(dx + 0.58, fh + 1.6, zf + 0.06, dx + 0.8, fh + 1.66, zf + 0.28, T.iron);
  out.lights.push({ x: dx + 0.7, y: fh + 1.5, z: zf + 0.5, c: '#ffb060', i: 3, r: 5.5, flicker: true });
  // windows (front + sides), warm glow quads
  const win = (cx, cy, face) => {
    const s = 0.32;
    if (face === 's') { g.quad(V(cx - s, cy - s, zf), V(cx + s, cy - s, zf), V(cx + s, cy + s, zf), V(cx - s, cy + s, zf), T.window); gG.quad(V(cx - s + 0.08, cy - s + 0.12, zf + 0.01), V(cx + s - 0.08, cy - s + 0.12, zf + 0.01), V(cx + s - 0.08, cy + s - 0.08, zf + 0.01), V(cx - s + 0.08, cy + s - 0.08, zf + 0.01), T.cloth, rgb('#ffc070', 1.6)); g.box(cx - s - 0.05, cy - s - 0.12, zf, cx + s + 0.05, cy - s - 0.04, zf + 0.12, T.darkwood); }
    else { const xx = face === 'e' ? x1 + 0.02 : x0 - 0.02, sg = face === 'e' ? 1 : -1; g.quad(V(xx, cy - s, cx + s * sg), V(xx, cy - s, cx - s * sg), V(xx, cy + s, cx - s * sg), V(xx, cy + s, cx + s * sg), T.window); gG.quad(V(xx + 0.01 * sg, cy - s + 0.12, cx + (s - 0.08) * sg), V(xx + 0.01 * sg, cy - s + 0.12, cx - (s - 0.08) * sg), V(xx + 0.01 * sg, cy + s - 0.08, cx - (s - 0.08) * sg), V(xx + 0.01 * sg, cy + s - 0.08, cx + (s - 0.08) * sg), T.cloth, rgb('#ffc070', 1.4)); }
  };
  const rows = b.floors === 2 ? [fh + 0.95, fh + 2.3] : [fh + 1.0];
  for (const cy of rows) {
    for (let wx = x0 + 0.7; wx < x1 - 0.5; wx += 1.3) if (Math.abs(wx - dx) > 0.9 || cy > 2) win(wx, cy, 's');
    if (d >= 3) { win((z0 + z1) / 2, cy, 'e'); win((z0 + z1) / 2, cy, 'w'); }
  }
  // sign on a bracket
  if (b.sign) { const sx = dx - 0.95, sy = fh + 1.55; g.box(sx - 0.02, sy + 0.4, zf, sx + 0.04, sy + 0.46, zf + 0.5, T.iron); g.quad(V(sx - 0.28, sy - 0.12, zf + 0.46), V(sx + 0.28, sy - 0.12, zf + 0.46), V(sx + 0.28, sy + 0.4, zf + 0.46), V(sx - 0.28, sy + 0.4, zf + 0.46), { items: T.signItems, smith: T.signSmith, inn: T.signInn }[b.sign]); g.quad(V(sx + 0.28, sy - 0.12, zf + 0.44), V(sx - 0.28, sy - 0.12, zf + 0.44), V(sx - 0.28, sy + 0.4, zf + 0.44), V(sx + 0.28, sy + 0.4, zf + 0.44), T.wood); }
  if (b.forge) { const fx = x1 - 0.7; g.box(fx - 0.5, 0, zf, fx + 0.5, 0.9, zf + 0.7, T.housestone, [0.8, 0.8, 0.8]); gG.box(fx - 0.3, 0.3, zf + 0.69, fx + 0.3, 0.7, zf + 0.72, T.cloth, rgb('#ff7a2a', 2.6)); out.lights.push({ x: fx, y: 0.6, z: zf + 1.1, c: '#ff7a30', i: 5, r: 6, flicker: true }); out.flames.push([fx, 0.95, zf + 0.35, 0.5]); out.colliders.push({ x: fx, z: zf + 0.35, r: 0.55 }); }
}
function shrineHouse(g, gG, b, out, flags) {
  const { x, z, w, d } = b, cx = x + w / 2, cz = z + d / 2;
  g.box(x + 0.2, 0, z + 0.3, x + w - 0.2, 0.45, z + d - 0.1, { side: T.housestone, top: T.stone }, [1, 1, 1]);
  g.box(cx - 1.2, 0, z + d - 0.1, cx + 1.2, 0.22, z + d + 0.35, { side: T.housestone, top: T.stone });
  for (const [px, pz] of [[x + 0.7, z + 0.8], [x + w - 0.7, z + 0.8], [x + 0.7, z + d - 0.6], [x + w - 0.7, z + d - 0.6]]) { g.box(px - 0.16, 0.45, pz - 0.16, px + 0.16, 2.9, pz + 0.16, T.darkwood); g.box(px - 0.22, 0.45, pz - 0.22, px + 0.22, 0.65, pz + 0.22, T.housestone); }
  // two-tier pagoda roof
  for (const [y0, s, hh] of [[2.9, 0.78, 0.75], [3.5, 0.42, 0.95]]) {
    const hw = (w / 2 + 0.25) * s, hd = (d / 2 + 0.25) * s, apex = V(cx, y0 + hh, cz);
    const c4 = [V(cx - hw, y0, cz + hd), V(cx + hw, y0, cz + hd), V(cx + hw, y0, cz - hd), V(cx - hw, y0, cz - hd)];
    for (let i = 0; i < 4; i++) g.tri(c4[i], c4[(i + 1) % 4], apex, T.roof, [0, 0], [1, 0], [0.5, 1], rgb('#7a3428', i === 0 ? 1.25 : 0.95));
    g.box(cx - hw, y0 - 0.12, cz - hd, cx + hw, y0, cz + hd, T.darkwood, [0.8, 0.8, 0.8], { top: false });
  }
  gG.geom(new THREE.OctahedronGeometry(0.16, 0), T.cloth, rgb('#ffd060', 2.5), mat4(cx, 5.2, cz));
  // the Wickwarden flame bowl
  g.geom(new THREE.CylinderGeometry(0.55, 0.3, 0.45, 10), T.iron, [1, 1, 1], mat4(cx, 0.9, cz));
  g.geom(new THREE.CylinderGeometry(0.12, 0.18, 0.5, 8), T.housestone, [1, 1, 1], mat4(cx, 0.6, cz));
  out.dyn.shrineFlame = [cx, 1.15, cz]; out.flames.push([cx, 1.15, cz, 1.0, 'shrine']);
  out.lights.push({ x: cx, y: 1.8, z: cz + 0.4, c: '#ffa040', i: 7, r: 9, flicker: true, id: 'shrine' });
}

// ================================================================ props
const PROPS = {
  lamp(P, p) { const { gW, gG, out } = P, y = P.hT(Math.floor(p.x), Math.floor(p.z)); gW.box(p.x - 0.06, y, p.z - 0.06, p.x + 0.06, y + 1.9, p.z + 0.06, T.darkwood); gW.box(p.x - 0.14, y, p.z - 0.14, p.x + 0.14, y + 0.25, p.z + 0.14, T.housestone); gW.box(p.x - 0.15, y + 1.9, p.z - 0.15, p.x + 0.15, y + 1.96, p.z + 0.15, T.iron); gG.box(p.x - 0.1, y + 1.96, p.z - 0.1, p.x + 0.1, y + 2.2, p.z + 0.1, T.cloth, rgb('#ffc070', 2.4)); gW.box(p.x - 0.14, y + 2.2, p.z - 0.14, p.x + 0.14, y + 2.27, p.z + 0.14, T.iron); out.lights.push({ x: p.x, y: y + 2.05, z: p.z + 0.15, c: '#ffb468', i: 4, r: 6.5, flicker: true }); out.colliders.push({ x: p.x, z: p.z, r: 0.2 }); },
  lantern_post(P, p) { const { gW, gG, out } = P; gW.box(p.x - 0.07, 0, p.z - 0.07, p.x + 0.07, 2.4, p.z + 0.07, T.darkwood); gW.box(p.x - 0.07, 2.3, p.z - 0.07, p.x + 0.5, 2.38, p.z + 0.07, T.darkwood); gG.box(p.x + 0.33, 1.85, p.z - 0.1, p.x + 0.53, 2.1, p.z + 0.1, T.cloth, rgb('#ff9a40', 2.6)); out.lights.push({ x: p.x + 0.43, y: 1.95, z: p.z + 0.2, c: '#ff9a40', i: 3, r: 5, flicker: true }); out.colliders.push({ x: p.x, z: p.z, r: 0.18 }); },
  bunting(P, p) {
    const { gDS } = P, n = Math.max(4, Math.round(Math.hypot(p.x1 - p.x0, p.z1 - p.z0) * 2.2)), cols = ['#e84a4a', '#f0c040', '#4a8ae8', '#f0f0e8', '#5ac85a', '#e87ad0'];
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, x = p.x0 + (p.x1 - p.x0) * t, z = p.z0 + (p.z1 - p.z0) * t, y = 2.55 - Math.sin(t * Math.PI) * 0.45;
      const dx = (p.x1 - p.x0) / n * 0.4, dz = (p.z1 - p.z0) / n * 0.4;
      gDS.tri(V(x - dx, y, z - dz), V(x + dx, y, z + dz), V(x, y - 0.32, z), T.cloth, [0, 1], [1, 1], [0.5, 0], rgb(cols[i % cols.length], 1.1));
    }
  },
  stall(P, p) { const { gW, gDS, out, R } = P; for (const [dx, dz] of [[-0.8, -0.4], [0.8, -0.4], [-0.8, 0.4], [0.8, 0.4]]) gW.box(p.x + dx - 0.05, 0, p.z + dz - 0.05, p.x + dx + 0.05, 1.7, p.z + dz + 0.05, T.darkwood); gW.box(p.x - 0.85, 0, p.z - 0.1, p.x + 0.85, 0.75, p.z + 0.45, T.wood); gDS.face(V(p.x - 1.0, 1.55, p.z + 0.75), V(2.0, 0, 0), V(0, 0.4, -1.3), T.awning, rgb(p.c, 0.5).map((v) => v + 0.55)); for (let i = 0; i < 6; i++) gW.geom(new THREE.SphereGeometry(0.1, 6, 4), T.cloth, rgb(['#e84a3a', '#f0c040', '#7ac04a', '#e8903a'][i % 4]), mat4(p.x - 0.6 + i * 0.24, 0.84, p.z + 0.15 + (R() - 0.5) * 0.2)); out.colliders.push({ x: p.x - 0.5, z: p.z, r: 0.55 }, { x: p.x + 0.5, z: p.z, r: 0.55 }); },
  well(P, p) { const { gW, out } = P; gW.geom(new THREE.CylinderGeometry(0.62, 0.66, 0.7, 12, 1, true), T.housestone, [1, 1, 1], mat4(p.x, 0.35, p.z), { uvScale: [3, 1] }); gW.geom(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 12), T.riverbed, [0.4, 0.5, 0.6], mat4(p.x, 0.45, p.z)); gW.geom(new THREE.TorusGeometry(0.62, 0.07, 4, 14), T.housestone, [1, 1, 1], mat4(p.x, 0.7, p.z, 0, 1, 1, 1, Math.PI / 2)); for (const s of [-1, 1]) gW.box(p.x + s * 0.55 - 0.05, 0.6, p.z - 0.05, p.x + s * 0.55 + 0.05, 1.9, p.z + 0.05, T.darkwood); gW.face(V(p.x - 0.8, 1.75, p.z + 0.55), V(1.6, 0, 0), V(0, 0.45, -0.55), T.roof, rgb('#7a4a3a', 1.2)); gW.face(V(p.x + 0.8, 1.75, p.z - 0.55), V(-1.6, 0, 0), V(0, 0.45, 0.55), T.roof, rgb('#7a4a3a', 0.9)); out.colliders.push({ x: p.x, z: p.z, r: 0.75 }); },
  barrel(P, p) { const { gW, out } = P; gW.geom(new THREE.CylinderGeometry(0.26, 0.24, 0.62, 10), T.wood, [1, 1, 1], mat4(p.x, 0.31, p.z), { uvScale: [2, 1] }); for (const y of [0.12, 0.5]) gW.geom(new THREE.TorusGeometry(0.265, 0.02, 3, 12), T.iron, [1, 1, 1], mat4(p.x, y, p.z, 0, 1, 1, 1, Math.PI / 2)); out.colliders.push({ x: p.x, z: p.z, r: 0.3 }); },
  crate(P, p) { const { gW, out } = P; gW.box(p.x - 0.28, 0, p.z - 0.28, p.x + 0.28, 0.55, p.z + 0.28, T.wood); out.colliders.push({ x: p.x, z: p.z, r: 0.32 }); },
  anvil(P, p) { const { gW, out } = P; gW.geom(new THREE.CylinderGeometry(0.22, 0.26, 0.45, 8), T.bark, [1, 1, 1], mat4(p.x, 0.22, p.z)); gW.box(p.x - 0.3, 0.45, p.z - 0.12, p.x + 0.3, 0.62, p.z + 0.12, T.iron); out.colliders.push({ x: p.x, z: p.z, r: 0.3 }); },
  board(P, p) { const { gW, out, R } = P; for (const s of [-1, 1]) gW.box(p.x + s * 0.6 - 0.05, 0, p.z - 0.05, p.x + s * 0.6 + 0.05, 1.7, p.z + 0.05, T.darkwood); gW.box(p.x - 0.7, 0.75, p.z - 0.04, p.x + 0.7, 1.55, p.z + 0.04, T.wood); for (let i = 0; i < 4; i++) { const x = p.x - 0.5 + i * 0.32, y = 0.95 + (i % 2) * 0.25; gW.quad(V(x - 0.12, y - 0.12, p.z + 0.05), V(x + 0.12, y - 0.12, p.z + 0.05), V(x + 0.12, y + 0.14, p.z + 0.05), V(x - 0.12, y + 0.14, p.z + 0.05), T.cloth, [1, 0.97, 0.9]); } gW.face(V(p.x - 0.85, 1.65, p.z + 0.3), V(1.7, 0, 0), V(0, 0.2, -0.3), T.roof, rgb('#6a4a3a', 1.2)); out.colliders.push({ x: p.x, z: p.z, r: 0.5 }); out.signs.push({ x: p.x, z: p.z, text: 'EMBERWAKE TONIGHT — no sleeping till the shrine greets the dawn! Lantern strings by Lark. Stew by Marta. Complaints to Odile (do not).' }); },
  fence(P, p) { const { gW, out } = P; const n = Math.round(Math.hypot(p.x1 - p.x0, p.z1 - p.z0)); for (let i = 0; i <= n; i++) { const x = p.x0 + (p.x1 - p.x0) * i / n, z = p.z0 + (p.z1 - p.z0) * i / n; gW.box(x - 0.05, 0, z - 0.05, x + 0.05, 0.75, z + 0.05, T.wood); out.colliders.push({ x, z, r: 0.25 }); } for (const y of [0.35, 0.6]) gW.box(Math.min(p.x0, p.x1), y, Math.min(p.z0, p.z1) - 0.03, Math.max(p.x0, p.x1) + 0.01, y + 0.07, Math.max(p.z0, p.z1) + 0.03, T.wood); },
  flowerbox(P, p) { const { gW, gC, R } = P; gW.box(p.x - 0.5, 0, p.z - 0.15, p.x + 0.5, 0.3, p.z + 0.15, T.wood); for (let i = 0; i < 4; i++) card(gC, p.x - 0.36 + i * 0.24, 0.3, p.z, [T.cardRed, T.cardYellow, T.cardBlue][i % 3], 0.35, R); },
  cart(P, p) { const { gW, out } = P; gW.box(p.x - 0.7, 0.45, p.z - 0.45, p.x + 0.7, 0.85, p.z + 0.45, T.wood); for (const s of [-1, 1]) gW.geom(new THREE.CylinderGeometry(0.36, 0.36, 0.08, 10), T.darkwood, [1, 1, 1], mat4(p.x - 0.1, 0.36, p.z + s * 0.5, 0, 1, 1, 1, Math.PI / 2)); gW.box(p.x + 0.7, 0.5, p.z - 0.3, p.x + 1.6, 0.56, p.z - 0.24, T.wood); gW.box(p.x + 0.7, 0.5, p.z + 0.24, p.x + 1.6, 0.56, p.z + 0.3, T.wood); gW.geom(new THREE.IcosahedronGeometry(0.4, 1), T.hay, [1, 1, 1], mat4(p.x - 0.2, 0.95, p.z, 0, 1.2, 0.5, 1), { jitter: 0.08 }); out.colliders.push({ x: p.x, z: p.z, r: 0.8 }); },
  haystack(P, p) { const { gW, out } = P; gW.geom(new THREE.SphereGeometry(0.7, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), T.hay, [1, 1, 1], mat4(p.x, 0, p.z, 0, 1, 1.1, 1), { jitter: 0.08, uvScale: [3, 1] }); out.colliders.push({ x: p.x, z: p.z, r: 0.7 }); },
  fountain(P, p) { const { gW, gG, out } = P; gW.geom(new THREE.CylinderGeometry(1.3, 1.35, 0.5, 16, 1, true), T.housestone, [1, 1, 1], mat4(p.x, 0.25, p.z), { uvScale: [6, 1] }); gW.geom(new THREE.TorusGeometry(1.3, 0.1, 4, 20), T.housestone, [1, 1, 1], mat4(p.x, 0.5, p.z, 0, 1, 1, 1, Math.PI / 2)); gW.geom(new THREE.CylinderGeometry(1.25, 1.25, 0.04, 16), T.riverbed, [0.55, 0.8, 1.0], mat4(p.x, 0.38, p.z)); gW.geom(new THREE.CylinderGeometry(0.15, 0.22, 1.3, 8), T.housestone, [1, 1, 1], mat4(p.x, 0.9, p.z)); gW.geom(new THREE.CylinderGeometry(0.5, 0.2, 0.2, 10), T.housestone, [1, 1, 1], mat4(p.x, 1.55, p.z)); gG.geom(new THREE.SphereGeometry(0.12, 6, 4), T.cloth, rgb('#bff0ff', 1.3), mat4(p.x, 1.75, p.z)); out.colliders.push({ x: p.x, z: p.z, r: 1.45 }); },
  boat(P, p) { const { gW, gDS } = P, s = p.big ? 1.5 : 1, y = -0.3; gW.geom(new THREE.CylinderGeometry(0.55 * s, 0.35 * s, 2.4 * s, 8, 1, false, 0, Math.PI), T.wood, [0.9, 0.85, 0.8], mat4(p.x, y + 0.35, p.z, 0, 1, 1, 0.55, 0, Math.PI / 2), { uvScale: [3, 2] }); gW.box(p.x - 1.1 * s, y + 0.25, p.z - 0.28 * s, p.x + 1.1 * s, y + 0.32, p.z + 0.28 * s, T.planks); if (p.big) { gW.box(p.x - 0.06, y, p.z - 0.06, p.x + 0.06, y + 3.6, p.z + 0.06, T.darkwood); gDS.face(V(p.x + 0.08, y + 1.0, p.z), V(1.4, 0, 0), V(-0.2, 2.4, 0), T.cloth, [0.95, 0.9, 0.82]); P.out.colliders.push({ x: p.x, z: p.z, r: 1.4 }); } },
  nets(P, p) { const { gW, gDS } = P; for (const s of [-1, 1]) gW.box(p.x + s - 0.05, 0, p.z - 0.05, p.x + s + 0.05, 1.5, p.z + 0.05, T.darkwood); gDS.face(V(p.x - 1, 0.5, p.z), V(2, 0, 0), V(0, 0.95, 0), T.thorn, [0.6, 0.75, 0.7]); P.out.colliders.push({ x: p.x, z: p.z, r: 1.0 }); },
  post(P, p) { P.gW.geom(new THREE.CylinderGeometry(0.1, 0.12, 1.2, 6), T.darkwood, [1, 1, 1], mat4(p.x, 0.0, p.z)); },
  sign(P, p) { const { gW, out } = P; gW.box(p.x - 0.05, 0, p.z - 0.05, p.x + 0.05, 1.2, p.z + 0.05, T.darkwood); gW.box(p.x - 0.45, 0.8, p.z - 0.03, p.x + 0.45, 1.15, p.z + 0.04, T.wood); out.colliders.push({ x: p.x, z: p.z, r: 0.25 }); out.signs.push({ x: p.x, z: p.z, text: p.text }); },
  village(P, p) { for (const [dx, dz, r] of [[-3.4, -1.6, '#8a4a3a'], [3.2, -1.8, '#3a5a7a'], [-3.8, 1.6, '#5a7a3a'], [3.6, 1.4, '#7a3a5a']]) mini(P, p.x + dx, p.z + dz, r); P.out.lights.push({ x: p.x, y: 1.4, z: p.z - 1, c: '#ffa040', i: 4, r: 6 }); },
  town(P, p) { for (const [dx, dz, r] of [[-2.5, -2.4, '#3d6a8a'], [0.5, -2.6, '#a3523a'], [3, -2.2, '#4a5a6a'], [-2.6, 2.4, '#6a8a9a']]) mini(P, p.x + dx, p.z + dz, r); },
  cave(P, p) { const { gW, out } = P; const z = 5.02; gW.quad(V(p.x - 1.0, 0, z), V(p.x + 1.0, 0, z), V(p.x + 0.85, 1.5, z), V(p.x - 0.85, 1.5, z), T.void, [0.05, 0.05, 0.05]); for (const s of [-1, 1]) gW.box(p.x + s * 1.0 - 0.12, 0, z - 0.1, p.x + s * 1.0 + 0.12, 1.6, z + 0.12, T.darkwood); gW.box(p.x - 1.2, 1.55, z - 0.1, p.x + 1.2, 1.75, z + 0.14, T.darkwood); P.gG.box(p.x + 1.25, 1.1, z + 0.1, p.x + 1.42, 1.32, z + 0.27, T.cloth, rgb('#ffb460', 2.2)); out.lights.push({ x: p.x + 1.3, y: 1.2, z: z + 0.6, c: '#ffa050', i: 3, r: 5, flicker: true }); },
  grotto(P, p) { const { gW, gG, out } = P; const z = 5.98, y = 0; gW.quad(V(p.x - 0.9, y, z), V(p.x + 0.9, y, z), V(p.x + 0.7, y + 1.3, z), V(p.x - 0.7, y + 1.3, z), T.void, [0.03, 0.05, 0.08]); crystal(gG, gW, p.x - 1.3, 0, z + 0.3, '#7fe8ff', 0.7, P.R); crystal(gG, gW, p.x + 1.3, 0, z + 0.4, '#b08cff', 0.6, P.R); out.lights.push({ x: p.x, y: 0.8, z: z + 0.8, c: '#6ad8ff', i: 2.5, r: 4 }); },
  lighthouse(P, p) { lighthouse(P, p.x, P.hT(Math.floor(p.x), Math.floor(p.z)), p.z, 1, 'lighthouseLamp'); },
  lighthouse_far(P, p) { const { gW } = P; gW.geom(new THREE.IcosahedronGeometry(4, 1), T.cliff, [0.7, 0.7, 0.75], mat4(p.x, -1, p.z, 0, 1.4, 0.8, 1), { jitter: 0.8 }); lighthouse(P, p.x, 2.0, p.z, 1.2, 'lighthouseLamp'); },
  windmill(P, p) { const { gW, out } = P; gW.geom(new THREE.CylinderGeometry(0.7, 1.0, 3.2, 8), T.plaster, [1, 1, 1], mat4(p.x, 1.6, p.z), { uvScale: [3, 3] }); gW.geom(new THREE.ConeGeometry(0.95, 1.0, 8), T.roof, rgb('#8a4a3a', 1.2), mat4(p.x, 3.7, p.z)); const blades = new GB(); for (let i = 0; i < 4; i++) blades.geom(new THREE.BoxGeometry(0.28, 2.2, 0.04), T.cloth, [0.95, 0.9, 0.8], mat4(Math.cos(i * Math.PI / 2) * 1.1, Math.sin(i * Math.PI / 2) * 1.1, 0, 0, 1, 1, 1, 0, i * Math.PI / 2 + Math.PI / 2)); const m = new THREE.Mesh(blades.build(), M.worldDS); m.position.set(p.x, 3.1, p.z + 1.0); m.castShadow = true; out.group.add(m); out.anim.push((t) => (m.rotation.z = t * 0.4)); out.colliders.push({ x: p.x, z: p.z, r: 1.1 }); },
  ruin(P, p) { const { gW, R, out } = P; for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2, x = p.x + Math.cos(a) * 1.6, z = p.z + Math.sin(a) * 1.2, h = 0.6 + R() * 1.8; gW.box(x - 0.22, 0, z - 0.22, x + 0.22, h, z + 0.22, { side: T.statue, top: T.mossstone }); out.colliders.push({ x, z, r: 0.32 }); } gW.box(p.x - 0.5, 0, p.z - 0.2, p.x + 0.8, 0.35, p.z + 0.25, T.mossstone); },
  stones(P, p) { const { gW, out } = P; for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, x = p.x + Math.cos(a) * 1.3, z = p.z + Math.sin(a) * 1.0; gW.geom(new THREE.BoxGeometry(0.35, 1.2, 0.25), T.statue, [0.9, 0.9, 0.95], mat4(x, 0.55, z, a, 1, 1, 1, 0, 0.08), { jitter: 0.04 }); out.colliders.push({ x, z, r: 0.25 }); } },
  spire(P, p) { const { gW, gG } = P; gW.geom(new THREE.IcosahedronGeometry(6, 1), T.cliff, [0.45, 0.45, 0.55], mat4(p.x, -2, p.z, 0, 1.5, 0.6, 1), { jitter: 1 }); gW.geom(new THREE.CylinderGeometry(0.8, 2.6, 18, 8), T.brick, [0.5, 0.5, 0.6], mat4(p.x, 9, p.z), { uvScale: [4, 10] }); gG.geom(new THREE.SphereGeometry(1.2, 10, 8), T.cloth, rgb('#ff5a2a', 1.8), mat4(p.x, 19.2, p.z)); P.out.lights.push({ x: p.x, y: 19, z: p.z, c: '#ff5a2a', i: 0.1, r: 1 }); },
  roots(P, p) { P.dyn.gateRoots ||= new GB(); const g = P.dyn.gateRoots; for (let i = 0; i < 9; i++) g.geom(new THREE.CylinderGeometry(0.16, 0.26, 2.4, 6), T.roots, [0.9, 0.85, 0.8], mat4(p.x - 1.8 + i * 0.45, 1.0, p.z + 0.4 + (i % 2) * 0.2, i, 1, 1, 1, (P.R() - 0.5) * 0.5, (i % 2 ? 1 : -1) * (0.3 + P.R() * 0.4)), { jitter: 0.05 }); P.dyn.glowRoots ||= new GB(); for (let i = 0; i < 6; i++) glowDot(P.dyn.glowRoots, p.x - 1.5 + i * 0.6, 0.6 + (i % 3) * 0.5, p.z + 0.6, '#ff9a3a', 0.06); },
  mushrooms(P, p) { const { gW, gG, out, R } = P; for (let i = 0; i < 5; i++) { const x = p.x + (R() - 0.5) * 1.2, z = p.z + (R() - 0.5) * 0.9, h = 0.2 + R() * 0.45, r = 0.12 + R() * 0.15; gW.geom(new THREE.CylinderGeometry(r * 0.3, r * 0.4, h, 6), T.cloth, [0.85, 0.82, 0.75], mat4(x, h / 2, z)); gG.geom(new THREE.SphereGeometry(r, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), T.cloth, rgb(i % 2 ? '#5affd0' : '#7ad8ff', 1.0), mat4(x, h, z, 0, 1, 0.7, 1)); } out.lights.push({ x: p.x, y: 0.8, z: p.z, c: '#4affc8', i: 2.6, r: 5 }); },
  crystal(P, p) { crystal(P.gG, P.gW, p.x, 0, p.z, p.c || '#7fe8ff', p.big ? 1.6 : 1, P.R); P.out.lights.push({ x: p.x, y: 1.2, z: p.z + 0.4, c: p.c || '#7fe8ff', i: p.big ? 4 : 2.8, r: p.big ? 7 : 5 }); P.out.colliders.push({ x: p.x, z: p.z, r: p.big ? 0.8 : 0.5 }); },
  beam(P, p) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.8, 9, 16, 1, true), beamMat()); m.position.set(p.x, 4.5, p.z); m.renderOrder = 5; P.out.group.add(m); P.out.dyn.beam = m; },
  heart(P, p) { if (P.flags.boss1) return; P.dyn.glowHeart ||= new GB(); P.dyn.glowHeart.geom(new THREE.IcosahedronGeometry(0.6, 1), T.cloth, rgb('#ff7a2a', 1.6), mat4(p.x, 1.4, p.z - 0.6, 0, 1.6, 1.2, 1), { jitter: 0.1 }); },
  cartwreck(P, p) { const { gW, out } = P; gW.box(p.x - 0.6, 0, p.z - 0.4, p.x + 0.6, 0.35, p.z + 0.4, T.wood); gW.geom(new THREE.CylinderGeometry(0.36, 0.36, 0.08, 10), T.darkwood, [1, 1, 1], mat4(p.x + 0.8, 0.1, p.z + 0.2, 0.4, 1, 1, 1, 0.1, 0)); gW.geom(new THREE.IcosahedronGeometry(0.35, 0), T.cliff, [0.8, 0.8, 0.8], mat4(p.x - 0.6, 0.25, p.z - 0.5), { jitter: 0.1 }); out.colliders.push({ x: p.x, z: p.z, r: 0.75 }); },
  focus(P, p) { const { gW, out } = P; gW.geom(new THREE.CylinderGeometry(0.5, 0.7, 0.8, 8), T.statue, [0.8, 0.85, 0.95], mat4(p.x, 0.4, p.z)); P.dyn.glowFocus ||= new GB(); P.dyn.glowFocus.geom(new THREE.OctahedronGeometry(0.45, 0), T.cloth, rgb('#ffe0a0', 1.0), mat4(p.x, 1.4, p.z, 0.4, 1, 1.6, 1)); out.colliders.push({ x: p.x, z: p.z, r: 0.7 }); out.lights.push({ x: p.x, y: 1.6, z: p.z + 0.6, c: '#ffd890', i: P.flags.boss2 ? 6 : 0.5, r: 8, id: 'focus' }); },
  shells(P, p) { const { gW } = P; for (let i = 0; i < 4; i++) { const x = p.x + (P.R() - 0.5) * 1.5, z = p.z + (P.R() - 0.5) * 1.2; gW.quad(V(x - 0.25, 0.02, z + 0.25), V(x + 0.25, 0.02, z + 0.25), V(x + 0.25, 0.02, z - 0.25), V(x - 0.25, 0.02, z - 0.25), T.shells); } },
  ember(P, p) { const { gW, out } = P, y = P.hT(Math.floor(p.x), Math.floor(p.z)); gW.geom(new THREE.CylinderGeometry(0.9, 1.4, 0.7, 10), T.iron, [1, 1, 1], mat4(p.x, y + 0.35, p.z)); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; gW.geom(new THREE.CylinderGeometry(0.07, 0.1, 3.4, 5), T.iron, [1, 1, 1], mat4(p.x + Math.cos(a) * 1.2, y + 1.9, p.z + Math.sin(a) * 1.2, 0, 1, 1, 1, Math.sin(a) * 0.3, -Math.cos(a) * 0.3)); } gW.geom(new THREE.TorusGeometry(1.5, 0.08, 4, 20), T.iron, [1, 1, 1], mat4(p.x, y + 3.3, p.z, 0, 1, 1, 1, Math.PI / 2)); const s = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0, 2), emberMat()); s.position.set(p.x, y + 2.2, p.z); out.group.add(s); out.dyn.ember = s; out.flames.push([p.x, y + 2.9, p.z, 2.0, 'ember']); out.lights.push({ x: p.x, y: y + 2.4, z: p.z + 1.2, c: '#ff6a2a', i: 10, r: 14, flicker: true, id: 'ember' }); out.colliders.push({ x: p.x, z: p.z, r: 1.3 }); },
  emberFar(P, p) { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(2.0, 2), emberMat()); s.position.set(p.x, 7, p.z); P.out.group.add(s); },
  brazier(P, p) { const { gW, out } = P, y = P.hT(Math.floor(p.x), Math.floor(p.z)); for (let i = 0; i < 3; i++) { const a = i * 2.1; gW.box(p.x + Math.cos(a) * 0.2 - 0.03, y, p.z + Math.sin(a) * 0.2 - 0.03, p.x + Math.cos(a) * 0.2 + 0.03, y + 0.9, p.z + Math.sin(a) * 0.2 + 0.03, T.iron); } gW.geom(new THREE.CylinderGeometry(0.38, 0.2, 0.3, 8), T.iron, [1, 1, 1], mat4(p.x, y + 0.95, p.z)); out.flames.push([p.x, y + 1.15, p.z, 0.75]); out.lights.push({ x: p.x, y: y + 1.5, z: p.z + 0.3, c: '#ff8a3a', i: 4.5, r: 7, flicker: true }); out.colliders.push({ x: p.x, z: p.z, r: 0.35 }); },
  pillar(P, p) { const { gW, out } = P, y = P.hT(Math.floor(p.x), Math.floor(p.z)); gW.box(p.x - 0.35, y, p.z - 0.35, p.x + 0.35, y + 0.3, p.z + 0.35, T.statue); gW.geom(new THREE.CylinderGeometry(0.25, 0.28, 3.2, 8), T.statue, [0.95, 0.95, 1], mat4(p.x, y + 1.9, p.z), { uvScale: [2, 3] }); gW.box(p.x - 0.38, y + 3.5, p.z - 0.38, p.x + 0.38, y + 3.75, p.z + 0.38, T.statue); out.colliders.push({ x: p.x, z: p.z, r: 0.4 }); },
  statue(P, p) { const { gW, out } = P, y = P.hT(Math.floor(p.x), Math.floor(p.z)); gW.box(p.x - 0.45, y, p.z - 0.45, p.x + 0.45, y + 0.6, p.z + 0.45, T.statue); gW.geom(new THREE.CylinderGeometry(0.22, 0.42, 1.5, 8), T.statue, [0.9, 0.9, 0.95], mat4(p.x, y + 1.35, p.z)); gW.geom(new THREE.SphereGeometry(0.2, 8, 6), T.statue, [0.9, 0.9, 0.95], mat4(p.x, y + 2.25, p.z)); gW.box(p.x - 0.04, y + 1.6, p.z + 0.2, p.x + 0.04, y + 2.5, p.z + 0.3, T.statue); P.gG.geom(new THREE.SphereGeometry(0.1, 6, 4), T.cloth, rgb('#ffa040', 2), mat4(p.x, y + 2.55, p.z + 0.25)); out.colliders.push({ x: p.x, z: p.z, r: 0.5 }); },
  wagon(P, p) { const { gW, gDS, out } = P; gW.box(p.x - 0.8, 0.4, p.z - 0.5, p.x + 0.8, 0.75, p.z + 0.5, T.wood); for (const s of [-1, 1]) for (const dx of [-0.5, 0.5]) gW.geom(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 10), T.darkwood, [1, 1, 1], mat4(p.x + dx, 0.32, p.z + s * 0.55, 0, 1, 1, 1, Math.PI / 2)); gDS.geom(new THREE.CylinderGeometry(0.55, 0.55, 1.6, 10, 1, true, -Math.PI / 2, Math.PI), T.stripes, [0.9, 0.7, 1.0], mat4(p.x, 0.75, p.z, 0, 1, 1, 1, 0, Math.PI / 2)); out.colliders.push({ x: p.x, z: p.z, r: 0.9 }); },
};
function mini(P, x, z, roof) { const { gW, gG, out } = P; gW.box(x - 0.55, 0, z - 0.4, x + 0.55, 0.75, z + 0.4, T.plaster); gW.face(V(x - 0.7, 0.7, z + 0.55), V(1.4, 0, 0), V(0, 0.5, -0.55), T.roof, rgb(roof, 1.2)); gW.face(V(x + 0.7, 0.7, z - 0.55), V(-1.4, 0, 0), V(0, 0.5, 0.55), T.roof, rgb(roof, 0.85)); gW.tri(V(x - 0.55, 0.75, z - 0.4), V(x - 0.55, 0.75, z + 0.4), V(x - 0.55, 1.18, z), T.plaster, [0, 0], [1, 0], [0.5, 1]); gW.tri(V(x + 0.55, 0.75, z + 0.4), V(x + 0.55, 0.75, z - 0.4), V(x + 0.55, 1.18, z), T.plaster, [0, 0], [1, 0], [0.5, 1]); gG.quad(V(x - 0.15, 0.25, z + 0.41), V(x + 0.15, 0.25, z + 0.41), V(x + 0.15, 0.5, z + 0.41), V(x - 0.15, 0.5, z + 0.41), T.cloth, rgb('#ffc070', 1.6)); out.colliders.push({ x, z, r: 0.65 }); }
function lighthouse(P, x, y, z, s, key) {
  const { gW, out } = P;
  gW.geom(new THREE.CylinderGeometry(0.6 * s, 0.95 * s, 4.6 * s, 10), T.stripes, [1, 1, 1], mat4(x, y + 2.3 * s, z), { uvScale: [2, 3] });
  gW.geom(new THREE.CylinderGeometry(0.85 * s, 0.85 * s, 0.12 * s, 12), T.iron, [1, 1, 1], mat4(x, y + 4.65 * s, z));
  P.dyn['glow' + key] ||= new GB();
  P.dyn['glow' + key].geom(new THREE.CylinderGeometry(0.45 * s, 0.45 * s, 0.7 * s, 10), T.cloth, rgb('#fff0b0', 1.0), mat4(x, y + 5.05 * s, z));
  gW.geom(new THREE.ConeGeometry(0.62 * s, 0.7 * s, 10), T.roof, rgb('#b83a2a', 1.2), mat4(x, y + 5.75 * s, z));
  out.lights.push({ x, y: y + 5 * s, z: z + 1, c: '#fff0c0', i: P.flags.boss2 ? 8 : 0, r: 12, id: key });
  out.colliders.push({ x, z, r: 1.0 * s });
}
let _beam = null, _ember = null;
function beamMat() {
  if (_beam) return _beam;
  _beam = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  _beam.colorNode = (() => { const { Fn, uv, vec4, vec3, sin, time, smoothstep } = TSL; return Fn(() => { const v = uv().y; const a = smoothstep(0.0, 0.6, v).mul(smoothstep(1.0, 0.75, v)).mul(0.22).mul(sin(time.mul(0.7).add(uv().x.mul(18))).mul(0.25).add(0.75)); return vec4(vec3(1.0, 0.85, 0.55).mul(a), a); })(); })();
  _beam.fog = false; return _beam;
}
function emberMat() {
  if (_ember) return _ember;
  const { Fn, vec4, vec3, sin, time, positionLocal, mx_noise_float, mix, uniform } = TSL;
  _ember = new THREE.MeshBasicNodeMaterial();
  _ember.userData.heat = uniform(0.35);
  _ember.colorNode = Fn(() => { const n = mx_noise_float(positionLocal.mul(2.5).add(vec3(0, time.mul(0.8), 0))); const h = _ember.userData.heat; const c = mix(vec3(0.9, 0.12, 0.04), vec3(3.2, 2.2, 1.1), n.mul(0.5).add(0.5).mul(h).add(h.mul(0.3))); return vec4(c.mul(sin(time.mul(2.0)).mul(0.08).add(1)), 1); })();
  _ember.fog = false; return _ember;
}
import * as TSL from 'three/tsl';
export { emberMat };
