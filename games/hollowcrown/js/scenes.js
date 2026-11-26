// The Hollow Crown — the ten painted dioramas (+ the epilogue dressing of the throne room).
// Each scene: fixed storybook camera, painted ground, sky/haze/light recipe, static batched props, dynamic parts,
// walk polygon, hotspot proxies (with walk-to points) and NPC placements.
import * as THREE from 'three/webgpu';
import { M, paintCanvas, RNG, dab, waterMaterial, U, jitterColor } from './paint.js';
import { Batch, box, cyl, cone, sph, ico, tor, jit, tree, pine, bush, rock, grass, flowers, mushroom, cottage, tower, wall, fence, barrel, crate, lampPost, banner, bunting, well, fountain, stall, signpost, cliffMass, card, S, roof, houseGeo } from './props.js';
import { makeHuman, makeFox, makeMagpie, makeAnimal } from './actors.js';

const PI = Math.PI;
const oct = (cx, cz, r, n = 10, sx = 1) => Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * PI * 2) * r * sx, cz + Math.sin((i / n) * PI * 2) * r]);
const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

// ------------------------------------------------------------------ painters
export function paintGround(spec) {
  const N = spec.size ?? 1024, { W, D, cx, cz } = spec;
  const X = (x) => ((x - (cx - W / 2)) / W) * N, Y = (z) => ((z - (cz - D / 2)) / D) * N;
  const ux = N / W, uz = N / D;
  return paintCanvas(N, N, (g) => {
    const r = RNG(spec.seed ?? 3);
    const P = spec.pal;
    g.fillStyle = P.base; g.fillRect(0, 0, N, N);
    // broad colour blotches
    for (let i = 0; i < 70; i++) {
      const x = r() * N, y = r() * N, rad = 40 + r() * 160; const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      const c = [P.base2, P.dark, P.light][i % 3]; gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = 0.35; g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    g.globalAlpha = 1;
    // grass/earth strokes
    const cols = [P.base, P.base2, P.dark, P.light];
    for (let i = 0; i < (spec.strokes ?? 14000); i++) { const x = r() * N, y = r() * N; dab(g, x, y, 1.5 + r() * 3.2, 0.8 + r() * 1.2, (r() - 0.5) * 0.8, jitterColor(cols[i % 4], 0.12, r), 0.55); }
    // patches (mud, moss, sand…)
    for (const p of spec.patches || []) { for (let i = 0; i < (p.n ?? 300); i++) { const a = r() * PI * 2, d = Math.sqrt(r()) * p.r; dab(g, X(p.x + Math.cos(a) * d), Y(p.z + Math.sin(a) * d * (p.sz ?? 1)), (1.5 + r() * 4) * ux * 0.05, (1 + r() * 2) * uz * 0.05, r(), jitterColor(p.col, 0.15, r), p.a ?? 0.6); } }
    // cobbles
    for (const c of spec.cobbles || []) {
      g.save(); g.beginPath(); c.poly.forEach(([x, z], i) => (i ? g.lineTo(X(x), Y(z)) : g.moveTo(X(x), Y(z)))); g.closePath(); g.clip();
      g.fillStyle = c.mortar; g.fillRect(0, 0, N, N);
      const sw = (c.stone ?? 0.42) * ux, sh = (c.stone ?? 0.42) * uz * 0.8;
      for (let y = -sh; y < N + sh; y += sh) for (let x = -sw + ((y / sh) % 2) * sw * 0.5; x < N + sw; x += sw) {
        dab(g, x + (r() - 0.5) * sw * 0.2, y + (r() - 0.5) * sh * 0.2, sw * 0.44, sh * 0.4, (r() - 0.5) * 0.3, jitterColor(c.cols[Math.floor(r() * c.cols.length)], 0.16, r), 1);
      }
      g.restore();
    }
    // paths: soft-edged dirt ribbons, then grass dabs nibbling the edges
    for (const p of spec.paths || []) {
      g.lineCap = g.lineJoin = 'round';
      const pts = p.pts.map(([x, z]) => [X(x), Y(z)]);
      for (const [wk, col, a] of [[1.25, p.edge ?? P.dark, 0.35], [1, p.col, 1], [0.6, p.col2 ?? p.col, 0.6]]) {
        g.globalAlpha = a; g.strokeStyle = col; g.lineWidth = p.w * ux * wk; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
      }
      g.globalAlpha = 1;
      for (let k = 0; k < pts.length - 1; k++) {
        const [x1, y1] = pts[k], [x2, y2] = pts[k + 1], L = Math.hypot(x2 - x1, y2 - y1);
        for (let i = 0; i < L * 1.4; i++) { const t = r(), off = (r() - 0.5) * p.w * ux; dab(g, x1 + (x2 - x1) * t + off * 0.3, y1 + (y2 - y1) * t + off, 1.5 + r() * 3, 1 + r() * 1.5, r() - 0.5, jitterColor(r() < 0.5 ? p.col : (p.col2 ?? p.col), 0.15, r), 0.8); }
      }
    }
    // flowers & sparkle dots
    const fl = spec.flowers ?? 0;
    for (let i = 0; i < fl; i++) { const x = r() * N, y = r() * N; if (spec.noFlower && spec.noFlower(x / ux + cx - W / 2, y / uz + cz - D / 2)) continue; g.fillStyle = P.flowers[i % P.flowers.length]; g.globalAlpha = 0.9; g.beginPath(); g.arc(x, y, 1.6 + r() * 1.6, 0, PI * 2); g.fill(); }
    g.globalAlpha = 1;
    spec.extra?.(g, X, Y, ux, uz, r);
  });
}

// painted backdrop card: layered ridges with brushy tree crowns, transparent above
export function ridgeCard(o) {
  const w = 2048, h = 512;
  return paintCanvas(w, h, (g) => {
    const r = RNG(o.seed ?? 5);
    for (const L of o.layers) {
      const pts = []; for (let x = -20; x <= w + 20; x += 16) { const y = h * L.y - (Math.sin(x * L.f + L.ph) * 0.5 + Math.sin(x * L.f * 2.7 + L.ph * 3) * 0.25 + (r() - 0.5) * 0.05) * h * L.amp; pts.push([x, y]); }
      const gr = g.createLinearGradient(0, h * (L.y - L.amp), 0, h); gr.addColorStop(0, L.c1); gr.addColorStop(1, L.c2);
      g.fillStyle = gr; g.beginPath(); g.moveTo(-20, h); pts.forEach(([x, y]) => g.lineTo(x, y)); g.lineTo(w + 20, h); g.closePath(); g.fill();
      if (L.trees) for (const [x, y] of pts) for (let k = 0; k < L.trees; k++) { const tx = x + (r() - 0.5) * 16, ty = y + r() * 10; const rad = (L.tr ?? 10) * (0.6 + r() * 0.8); dab(g, tx, ty - rad * 0.6, rad, rad * (L.tall ?? 1.2), 0, jitterColor(L.tc ?? L.c1, 0.1, r), 0.95); }
      if (L.snow) for (const [x, y] of pts) if (r() < 0.5) dab(g, x, y + 3, 10, 3, 0, '#f4f8ff', 0.7);
    }
  }, { srgb: true });
}
export function softCard(col, w = 256, h = 256, fall = 'radial') {
  return paintCanvas(w, h, (g) => {
    const c = new THREE.Color(col); const rgb = `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`;
    let gr;
    if (fall === 'radial') { gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(1, `rgba(${rgb},0)`); }
    else if (fall === 'ray') { gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, `rgba(${rgb},0.9)`); gr.addColorStop(1, `rgba(${rgb},0)`); g.fillStyle = gr; g.beginPath(); g.moveTo(w * 0.35, 0); g.lineTo(w * 0.65, 0); g.lineTo(w, h); g.lineTo(0, h); g.fill(); return; }
    else { gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, `rgba(${rgb},0)`); gr.addColorStop(0.5, `rgba(${rgb},1)`); gr.addColorStop(1, `rgba(${rgb},0)`); }
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, { srgb: true });
}
// fog bank / cloud card with brushy lumps
export function fogCard(col = '#f4f0ea', seed = 9) {
  return paintCanvas(1024, 256, (g) => {
    const r = RNG(seed);
    for (let i = 0; i < 260; i++) { const x = r() * 1024, y = 128 + (r() - 0.5) * 120, rad = 30 + r() * 70; const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.globalAlpha = 0.35; g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  });
}

// ------------------------------------------------------------------ shared builders
function part(ctx, fn, mat) { const B = new Batch(ctx.seed++); if (mat) B.forceMat = mat; fn(B); const g = new THREE.Group(); B.finish(g); ctx.world.add(g); return g; }
function waterPlane(ctx, w, d, x, y, z, o = {}) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d, 1, 1), waterMaterial({ deep: o.deep ?? S.water[0], shallow: o.shallow ?? S.water[1], flow: o.flow, scale: o.scale, speed: o.speed }));
  m.rotation.x = -PI / 2; m.position.set(x, y, z); m.receiveShadow = false; ctx.world.add(m); return m;
}
function waterDisc(ctx, r, x, y, z, o = {}) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 28), waterMaterial({ deep: o.deep ?? S.water[0], shallow: o.shallow ?? S.water[1], flow: o.flow ?? [0.05, 0.02], scale: o.scale ?? 1.5, speed: 0.2 }));
  m.rotation.x = -PI / 2; m.position.set(x, y, z); m.scale.set(o.sx ?? 1, o.sz ?? 1, 1); ctx.world.add(m); return m;
}
function glowCard(ctx, col, size, x, y, z, a = 0.6) { const c = card(softCard(col), size, size, x, y, z, { add: true, fog: false, opacity: a, order: 5 }); ctx.world.add(c); return c; }
// painter's repoussoir: leafy masses hanging into the top corners close to the camera + low foreground shrubs
function overhang(ctx, o = {}) {
  const B = ctx.B, cols = o.cols ?? [S.dark, S.leaf[2] ?? S.dark, S.leaf[0]];
  for (const side of o.sides ?? [-1, 1]) {
    const bx = side * (o.x ?? 4.3), by = o.y ?? 6.0, bz = o.z ?? 6.0;
    cyl(B, 0.1, 0.22, 3.6, '#4a3426', bx + side * 1.9, by + 0.35, bz - 0.3, { rz: side * 1.25, seg: 6, ao: false });
    for (let i = 0; i < (o.n ?? 9); i++) {
      const lx = bx + side * (B.r() * 2.2 - 0.3), ly = by + (B.r() - 0.3) * 0.9, lz = bz + (B.r() - 0.5) * 1.0, r = 0.45 + B.r() * 0.45;
      B.add(jit(new THREE.IcosahedronGeometry(r, 2), r * 0.18, i + side), cols[i % cols.length], { x: lx, y: ly, z: lz, blob: true, ao: false, jit: 0.08 });
    }
  }
  for (const [x, z, s] of o.shrubs ?? [[-4.9, 6.4, 0.55], [-3.9, 6.9, 0.4], [5.0, 6.5, 0.6], [4.1, 7.0, 0.38]]) bush(B, x, z, { s, flowers: o.flowers, n: 5 });
}
// far countryside: a huge fogged meadow plane + two painted ridge cards so the diorama never shows its edge
function farland(ctx, o = {}) {
  const B = ctx.B;
  B.add(new THREE.PlaneGeometry(420, 260, 1, 1), o.col ?? S.grassDark, { x: 0, y: o.y ?? -0.06, z: -128, rx: -PI / 2, ao: false, jit: 0 });
  const hz = new THREE.Color(S.sky.horizon);
  const near = ridgeCard({ seed: o.seed ?? 6, layers: [{ y: 0.7, amp: 0.25, f: 0.009, ph: 1.3, c1: new THREE.Color(S.grass).lerp(hz, 0.35).getStyle(), c2: new THREE.Color(S.grassDark).lerp(hz, 0.25).getStyle(), trees: 2, tr: 14, tc: new THREE.Color(S.dark).lerp(hz, 0.3).getStyle() }] });
  const far = ridgeCard({ seed: (o.seed ?? 6) + 5, layers: [{ y: 0.55, amp: 0.45, f: 0.004, ph: 0.2, c1: new THREE.Color(S.dark).lerp(hz, 0.7).getStyle(), c2: new THREE.Color(S.grassDark).lerp(hz, 0.55).getStyle(), snow: S.roofSnow }] });
  ctx.world.add(card(far, 220, 40, 0, 6, -95, { order: -2 }), card(near, 150, 18, 0, 4.4, -40, { order: -1 }));
}
function rays(ctx, col, list) { const t = softCard(col, 128, 256, 'ray'); const out = []; for (const [x, y, z, w, h, rz, a] of list) { const c = card(t, w, h, x, y, z, { add: true, fog: false, opacity: a, rz, order: 6 }); ctx.world.add(c); out.push(c); } return out; }
function pal(o = {}) { return { base: o.base ?? S.grass, base2: o.base2 ?? S.grass2, dark: o.dark ?? S.grassDark, light: o.light ?? S.grass2, flowers: S.flowers }; }
const isWinter = () => S.roofSnow;

// ================================================================== scene definitions
export const SCENE_DEFS = {};

// ------------------------------------------------------------------ 1. THRONE ROOM (interior)
SCENE_DEFS.throne = {
  cam: { pos: [0, 4.3, 13.6], look: [0, 2.0, -0.5], fov: 38, drift: 0.08, halfW: 8.5 },
  env: () => ({ sky: { zenith: '#2a1e2e', mid: '#3a2a34', horizon: '#4a3438', cloudAmt: 0 }, fog: ['#3a2a30', 20, 48], hemi: ['#ffe0c0', '#4a2a20', 0.8], key: { pos: [-6, 12, 9], col: '#ffe8c8', I: 1.6 }, rim: { pos: [6, 6, -8], col: '#a0c0ff', I: 1.1 }, amb: 0.22 }),
  ground: { W: 22, D: 16, cx: 0, cz: -0.5, paint: (S) => ({
    pal: { base: '#8a7a6a', base2: '#a08e7a', dark: '#5a4a3e', light: '#b8a690', flowers: ['#000'] }, strokes: 6000, seed: 21,
    extra: (g, X, Y, ux, uz, r) => {
      // checker flagstones
      for (let x = -11; x < 11; x += 1.4) for (let z = -8.5; z < 7.5; z += 1.4) { const k = (Math.round(x / 1.4) + Math.round(z / 1.4)) & 1; g.fillStyle = jitterColor(k ? '#b8a890' : '#7a6a5c', 0.1, r); g.globalAlpha = 0.7; g.fillRect(X(x) + 2, Y(z) + 2, 1.4 * ux - 4, 1.4 * uz - 4); }
      g.globalAlpha = 1;
      // red carpet with gold border
      g.fillStyle = '#7a1a22'; g.fillRect(X(-1.5), Y(-4.5), 3 * ux, 12 * uz); g.fillStyle = '#d8a83a'; g.fillRect(X(-1.5), Y(-4.5), 0.16 * ux, 12 * uz); g.fillRect(X(1.34), Y(-4.5), 0.16 * ux, 12 * uz);
      for (let i = 0; i < 900; i++) dab(g, X(-1.4 + r() * 2.8), Y(-4.5 + r() * 12), 2 + r() * 3, 1, r(), jitterColor('#8a2028', 0.15, r), 0.5);
    },
  }) },
  walk: [[-7.6, -2.0], [7.8, -2.0], [8.4, 1.3], [8.2, 4.8], [-8.2, 4.8], [-8.2, 0.6]],
  holes: [oct(-8.0, 3.6, 0.85, 8), oct(8.0, 3.6, 0.85, 8)],
  spawn: { start: [0, 3.2, PI], courtyard: [7.4, 1.0, -PI / 2], map: [7.4, 1.0, -PI / 2], epilogue: [0, 1.4, PI] },
  build(ctx) {
    const B = ctx.B, stone = '#b8aa96', dark = '#5a4a40', bcol = ctx.banner;
    // back wall + side walls + ceiling beams
    box(B, 20, 10, 0.8, stone, 0, 5, -5.4, { jit: 0.05, aoH: 3 });
    box(B, 0.8, 10, 14, '#a89a86', -9.6, 5, 1.6, { jit: 0.05 }); box(B, 0.8, 10, 14, '#a89a86', 9.6, 5, 1.6, { jit: 0.05 });
    for (let i = 0; i < 4; i++) box(B, 20, 0.5, 0.5, '#4a3226', 0, 9.2, -4 + i * 3.2);
    // wainscot
    box(B, 19, 1.3, 0.2, '#6a4630', 0, 0.65, -4.95); box(B, 0.2, 1.3, 13, '#6a4630', -9.1, 0.65, 1.6); box(B, 0.2, 1.3, 13, '#6a4630', 9.1, 0.65, 1.6);
    // pillars (two pairs) — front pair frames the view
    for (const [x, z, s] of [[-5.4, -3.3, 1], [5.4, -3.3, 1], [-8.0, 3.6, 1.25], [8.0, 3.6, 1.25]]) {
      cyl(B, 0.42 * s, 0.5 * s, 8.8, '#c8bca8', x, 4.4, z, { seg: 14, jit: 0.04 }); box(B, 1.3 * s, 0.4, 1.3 * s, '#a89a86', x, 0.2, z); box(B, 1.3 * s, 0.5, 1.3 * s, '#a89a86', x, 8.9, z);
    }
    // dais + throne
    box(B, 6, 0.3, 2.6, '#8a7a68', 0, 0.15, -4.0); box(B, 4.4, 0.3, 2.0, '#9a8a76', 0, 0.45, -4.2);
    B.push(0, 0.6, -4.6, 0);
    box(B, 1.6, 0.6, 1.1, '#7a4a26', 0, 0.3, 0); box(B, 1.6, 2.6, 0.25, '#7a4a26', 0, 1.6, -0.45); box(B, 1.3, 0.25, 0.9, '#a8242e', 0, 0.66, 0.05); box(B, 1.2, 2.0, 0.12, '#a8242e', 0, 1.7, -0.3);
    for (const sx of [-1, 1]) { box(B, 0.2, 1.0, 1.1, '#7a4a26', sx * 0.8, 0.9, 0); sph(B, 0.15, '#e0b040', sx * 0.8, 3.0, -0.45); }
    cone(B, 0.25, 0.5, '#e0b040', 0, 3.2, -0.45, { seg: 6 });
    B.pop();
    // crown pedestal (cushion is dynamic)
    cyl(B, 0.25, 0.32, 1.0, '#c8bca8', 1.9, 0.6 + 0.5, -3.6, { seg: 10 });
    // stained glass: rose window + two lancets (glow, emissive >1 so bloom catches it)
    const glass = (x, y, w, h, cols, z = -4.98) => {
      box(B, w + 0.3, h + 0.3, 0.2, '#4a3a34', x, y, z + 0.02);
      const nx = 3, ny = 6;
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) box(B, w / nx - 0.06, h / ny - 0.06, 0.06, cols[(i + j * 2) % cols.length], x - w / 2 + (i + 0.5) * (w / nx), y - h / 2 + (j + 0.5) * (h / ny), z + 0.14, { mat: 'glow', jit: 0.15, ao: false });
      cone(B, w / 2 + 0.15, 0.9, '#4a3a34', x, y + h / 2 + 0.45, z + 0.05, { seg: 3, rx: 0 });
    };
    glass(-4.6, 4.2, 1.4, 3.6, ['#ff9a6a', '#ffd27a', '#c84a3a', '#ffe8b0']); glass(4.6, 4.2, 1.4, 3.6, ['#7ab8ff', '#a8e0ff', '#4a7ad0', '#d8f0ff']);
    // rose window: red/green/blue stones in hearth/oak/sea motif
    B.push(0, 6.8, -4.9, 0);
    cyl(B, 1.75, 1.75, 0.2, '#4a3a34', 0, 0, 0, { rx: PI / 2, seg: 24 });
    for (let i = 0; i < 12; i++) { const a = (i / 12) * PI * 2; box(B, 0.62, 0.5, 0.05, ['#ffd27a', '#f6e6c0', '#e8c890'][i % 3], Math.cos(a) * 1.15, Math.sin(a) * 1.15, 0.12, { rz: a, mat: 'glow', ao: false }); }
    for (const [a, c] of [[PI / 2 + 0.0, '#ff5a3a'], [PI / 2 + 2.09, '#5ad86a'], [PI / 2 + 4.19, '#4aa8ff']]) sph(B, 0.28, c, Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0.12, { mat: 'glow', ao: false });
    B.pop();
    // hearth on the left wall
    B.push(-9.0, 0, -0.4, PI / 2);
    box(B, 3.0, 2.6, 0.9, '#9a8a7a', 0, 1.3, 0.2, { jit: 0.1 }); box(B, 3.4, 0.35, 1.1, '#7a6a5a', 0, 2.7, 0.3); box(B, 1.9, 1.5, 0.3, '#1e1410', 0, 0.85, 0.56, { mat: 'glow', ao: false });
    box(B, 1.2, 4, 0.8, '#9a8a7a', 0, 4.9, -0.1);
    for (let i = 0; i < 3; i++) cyl(B, 0.09, 0.09, 1.1, '#5a3a22', -0.3 + i * 0.3, 0.25, 0.7, { rz: PI / 2, ry: 0.3 * i, seg: 6 });
    B.pop();
    // side table + music box spot
    box(B, 1.2, 0.08, 0.7, '#6a4228', 6.4, 0.95, -2.4); for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(B, 0.07, 0.95, 0.07, '#5a3820', 6.4 + sx * 0.5, 0.47, -2.4 + sz * 0.28);
    // suit of armour
    B.push(-6.9, 0, -3.6, 0.25);
    box(B, 0.6, 0.2, 0.5, '#6a6a70', 0, 0.1, 0); cyl(B, 0.1, 0.1, 0.8, '#9aa2ac', -0.12, 0.6, 0); cyl(B, 0.1, 0.1, 0.8, '#9aa2ac', 0.12, 0.6, 0);
    cyl(B, 0.28, 0.22, 0.7, '#b8c0c8', 0, 1.35, 0, { seg: 10 }); sph(B, 0.2, '#b8c0c8', 0, 1.95, 0); box(B, 0.04, 0.2, 0.05, '#2a2a30', 0, 1.95, 0.19);
    for (const sx of [-1, 1]) cyl(B, 0.07, 0.07, 0.7, '#9aa2ac', sx * 0.36, 1.35, 0, { rz: sx * 0.15 }); cyl(B, 0.025, 0.025, 2.4, '#6a5a4a', 0.45, 1.2, 0.1, { seg: 5 }); cone(B, 0.08, 0.3, '#c8ccd4', 0.45, 2.55, 0.1, { seg: 4 });
    B.pop();
    // portrait (back wall left)
    box(B, 1.5, 1.9, 0.12, '#c89a3a', -7.4, 4.6, -4.94); box(B, 1.25, 1.65, 0.06, '#5a4a6a', -7.4, 4.6, -4.86); sph(B, 0.32, '#e8c0a0', -7.4, 4.9, -4.8, { sz: 0.3 }); cone(B, 0.45, 0.9, '#7a2a4a', -7.4, 4.1, -4.8, { sz: 0.3 });
    // banners
    for (const x of [-2.6, 2.6, -7.4, 7.4]) banner(B, x, 7.6, -4.9, bcol, { w: 0.9, h: 2.6 });
    // great doors (right wall, exit)
    B.push(9.15, 0, 0.8, -PI / 2);
    box(B, 2.6, 3.8, 0.3, '#5a3a22', 0, 1.9, 0); box(B, 3.0, 0.35, 0.4, '#7a6a5a', 0, 3.95, 0); for (const sx of [-1, 1]) { box(B, 0.06, 3.6, 0.1, '#2a1a10', sx * 0.02, 1.85, 0.16); sph(B, 0.08, '#d8b048', sx * 0.25, 1.6, 0.2); }
    B.pop();
    // rugs, candles
    for (const [x, z] of [[-7.6, 2], [7.6, -1.4]]) { cyl(B, 0.08, 0.1, 1.4, '#c8a050', x, 0.7, z, { seg: 6 }); cyl(B, 0.05, 0.05, 0.25, '#f6ead0', x, 1.52, z, { seg: 6 }); }
    // dynamic: crown on cushion, feather, tongs, music box
    ctx.obj.cushion = part(ctx, (P) => { box(P, 0.8, 0.22, 0.8, '#a8242e', 1.9, 1.72, -3.6); });
    ctx.obj.crownOnCushion = part(ctx, (P) => { cyl(P, 0.3, 0.28, 0.24, '#e8c050', 1.9, 1.98, -3.6, { seg: 14, open: true, mat: 'paintDS' }); for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2; cone(P, 0.06, 0.18, '#e8c050', 1.9 + Math.sin(a) * 0.29, 2.19, -3.6 + Math.cos(a) * 0.29, { seg: 4 }); } });
    ctx.obj.feather = part(ctx, (P) => { box(P, 0.62, 0.02, 0.1, '#1a1c2e', -4.6, 2.32, -4.6, { ry: 0.4, rz: 0.05 }); box(P, 0.3, 0.021, 0.08, '#f4f4f0', -4.8, 2.33, -4.66, { ry: 0.4 }); });
    box(B, 1.8, 0.16, 0.5, '#9a8a76', -4.6, 2.2, -4.75); // sill
    ctx.obj.tongs = part(ctx, (P) => { for (const s of [-1, 1]) cyl(P, 0.025, 0.025, 1.3, '#3a3a40', -7.95, 0.68, 0.9 + s * 0.05, { rz: 0.25, seg: 5 }); });
    ctx.obj.musicbox = part(ctx, (P) => { box(P, 0.4, 0.24, 0.3, '#c8ccd8', 6.4, 1.11, -2.4); box(P, 0.44, 0.06, 0.34, '#e0e4ec', 6.4, 1.25, -2.4); });
    // light: hearth glow + window shafts
    ctx.light(0, [-8.1, 1.0, -0.4], '#ff9a4a', 5, 9);
    ctx.light(1, [0, 6.5, -3.8], '#ffd8a8', 2.2, 14);
    ctx.fire = { x: -8.25, y: 0.6, z: -0.4 };
    rays(ctx, '#ffe2b0', [[-4.0, 2.6, -2.2, 2.2, 6.5, -0.32, 0.22], [4.0, 2.6, -2.2, 2.2, 6.5, 0.32, 0.2], [0, 3.3, -3.4, 2.4, 6.5, 0.0, 0.16]]);
    glowCard(ctx, '#ff8a3a', 3.2, -8.3, 1.0, -0.4, 0.55);
    ctx.obj.hfire = part(ctx, (P) => { for (let i = 0; i < 7; i++) P.add(new THREE.ConeGeometry(0.16 + P.r() * 0.1, 0.5 + P.r() * 0.5, 6), ['#ff7a2a', '#ffb040', '#ffd870'][i % 3], { x: -8.3, y: 0.55, z: -0.9 + i * 0.16, mat: 'glow' }); });
    if (ctx.epilogue) {
      bunting(B, -8.8, 6.4, -1, 8.8, 6.4, -1, { n: 28, sag: 0.9 }); bunting(B, -8.8, 6.0, 2.4, 8.8, 6.0, 2.4, { n: 28, sag: 0.9 });
    }
    return {
      apply(s) {
        ctx.obj.crownOnCushion.visible = !s.f.gotCrown || !!s.f.epilogueGo; ctx.obj.feather.visible = !s.f.featherTaken;
        ctx.obj.tongs.visible = !s.f.tongsTaken; ctx.obj.musicbox.visible = !s.f.boxTaken;
      },
      update(dt, t) { ctx.flicker(0, 5, t); ctx.obj.hfire.scale.y = 1 + Math.sin(t * 9) * 0.08 + Math.sin(t * 23) * 0.05; },
    };
  },
  hot: {
    throne: { p: [0, 2.0, -4.5], s: [1.8, 3.2, 1.4], walk: [0, -1.6] },
    cushion: { p: [1.9, 1.8, -3.6], s: [0.9, 0.6, 0.9], walk: [1.6, -1.9], pri: 2 },
    window: { p: [0, 5.5, -4.9], s: [11, 5, 0.4], walk: [0, -1.8] },
    feather: { p: [-4.6, 2.35, -4.6], s: [1.0, 0.5, 0.6], walk: [-4.4, -1.9], pri: 3 },
    hearth: { p: [-8.7, 1.4, -0.4], s: [1.2, 2.6, 3.2], walk: [-7.2, -0.3] },
    tongs: { p: [-7.95, 0.7, 0.95], s: [0.5, 1.5, 0.5], walk: [-7.3, 1.2], pri: 3 },
    musicbox: { p: [6.4, 1.15, -2.4], s: [0.6, 0.5, 0.5], walk: [6.0, -1.7], pri: 3 },
    portrait: { p: [-7.4, 4.6, -4.9], s: [1.6, 2.0, 0.4], walk: [-6.4, -1.9] },
    armor: { p: [-6.9, 1.2, -3.6], s: [1.0, 2.6, 0.9], walk: [-6.4, -1.9] },
    banners: { p: [2.6, 6.4, -4.9], s: [1.2, 2.8, 0.3], walk: [2.6, -1.9] },
  },
  exits: { courtyard: { p: [9.0, 1.9, 0.8], s: [0.8, 3.8, 2.8], walk: [7.7, 0.8], dir: 'right' } },
  npcs: { queen: { at: [-1.6, -2.7], face: 0.25, walk: [-0.2, -1.5], make: () => makeHuman({ name: 'queen', skin: '#f3d0b4', hair: '#c8c0b8', hairStyle: 'bun', hat: 'crown', robe: true, robeC: '#7a3a8a', top: '#7a3a8a', robeHem: '#e8c050', cape: '#a8242e', capeLen: 1.0, glasses: '#c8a040', collar: '#f4ecdc', boots: '#4a2a3a', scale: 1.04, rig: {} }) } },
};

// ------------------------------------------------------------------ 2. COURTYARD
SCENE_DEFS.courtyard = {
  cam: { pos: [0, 4.6, 14.2], look: [0, 1.9, -1], fov: 38, drift: 0.12, halfW: 8.5 },
  env: () => ({ sky: { ...S.sky, cloudAmt: 0.55, sunDir: [-0.5, 0.45, -0.75] }, fog: [S.sky.horizon, 24, 70], hemi: [S.hemiSky, S.hemiGround, 0.85], key: { pos: [-8, 12, 7], col: S.key, I: 2.4 }, rim: { pos: [8, 6, -10], col: '#9fc0ff', I: 1.0 }, amb: 0.14 }),
  ground: { W: 30, D: 22, cx: 0, cz: -2, paint: () => ({
    pal: pal(), seed: 5, flowers: 160,
    cobbles: [{ poly: [[-9, -8], [9, -8], [9, 2.6], [5.6, 3.0], [3.0, 1.6], [-3, 2.2], [-9, 2.6]], mortar: '#8a8276', cols: ['#aaa094', '#9a9084', '#b8ad9e', '#8e857a', '#a49884'], stone: 0.34 }],
    patches: [{ x: 5.6, z: 2.6, r: 1.6, col: '#5a4030', n: 400 }],
  }) },
  walk: [[-8.0, -2.4], [-4.4, -2.4], [-4.0, -4.8], [3.6, -5.0], [4.6, -5.6], [6.4, -5.6], [6.8, -3.0], [7.6, -1.2], [7.6, 1.2], [3.8, 1.0], [3.6, 4.8], [-8.2, 4.8]],
  holes: [oct(-1.6, 0.4, 1.25, 10), rect(-4.1, -3.9, -1.7, -2.2), oct(2.4, -4.4, 0.45, 6)],
  spawn: { start: [-5.0, -1.6, 0.4], keep: [-5.4, -1.8, 0.4], gate: [5.4, -4.4, PI * 0.9], map: [0, 3, PI] },
  build(ctx) {
    const B = ctx.B, stone = '#d2c8b6', bcol = ctx.banner;
    // keep (left) with grand door
    B.push(-7.4, 0, -4.8, 0.25);
    box(B, 6.5, 9, 4.5, stone, 0, 4.5, -1.2, { jit: 0.05, aoH: 2.5 });
    box(B, 2.4, 3.4, 0.4, '#8a7a68', 1.6, 1.7, 1.1); box(B, 1.8, 2.8, 0.2, '#5a3a22', 1.6, 1.4, 1.32); sph(B, 0.07, '#d8b048', 2.1, 1.4, 1.45);
    for (let i = 0; i < 7; i++) box(B, 0.6, 0.6, 0.6, stone, -3 + i, 9.3, 1.0);
    for (const [x, y] of [[-1.6, 5.5], [1.0, 5.5], [-1.6, 7.6], [1.0, 7.6]]) { box(B, 0.5, 0.9, 0.1, '#ffcc70', x, y, 1.06, { mat: 'glow' }); box(B, 0.7, 0.12, 0.2, '#9a8a78', x, y - 0.5, 1.1); }
    B.pop();
    tower(B, -9.6, -8.0, { r: 1.6, h: 11, roofC: '#4e5c9a', windows: [[0, 6], [0.6, 8.5]] });
    banner(B, -5.4, 6.8, -2.9, bcol, { w: 1.0, h: 2.4 });
    // curtain wall + gatehouse (right back)
    wall(B, -6, -9.6, 3.6, -9.6, { h: 4.2, t: 1.2, stone: '#c8bea9' });
    wall(B, 8.6, -9.6, 14, -6, { h: 4.2, t: 1.2, stone: '#c8bea9' });
    tower(B, 3.8, -8.6, { r: 1.4, h: 7.2, roofC: '#4e5c9a' }); tower(B, 8.4, -8.6, { r: 1.4, h: 7.2, roofC: '#4e5c9a' });
    box(B, 3.4, 1.6, 1.6, '#c8bea9', 6.1, 5.0, -8.6); for (let i = 0; i < 4; i++) box(B, 0.5, 0.5, 1.6, '#c8bea9', 4.8 + i * 0.85, 6.0, -8.6);
    for (let i = 0; i < 6; i++) box(B, 0.08, 1.2, 0.08, '#3a3430', 4.9 + i * 0.48, 3.9, -8.0); // raised portcullis teeth
    banner(B, 3.8, 6.0, -7.1, bcol, { w: 0.8, h: 2.0 }); banner(B, 8.4, 6.0, -7.1, bcol, { w: 0.8, h: 2.0 });
    farland(ctx, { seed: 9 });
    // view through the gate: village rooftops beyond
    for (const [x, z, ry] of [[5.0, -16, 0.2], [8.6, -17, -0.3], [2.2, -18, 0.4]]) cottage(B, x, z, ry, { w: 2.6, d: 2.2 });
    // well
    well(B, -1.6, 0.4, { ry: 0.3 });
    // herb garden bed (right front) with lavender
    B.push(5.9, 0, 2.8, -0.15);
    box(B, 3.4, 0.4, 1.8, '#7a5030', 0, 0.2, 0); box(B, 3.2, 0.1, 1.6, '#5a4030', 0, 0.42, 0);
    for (let i = 0; i < 7; i++) { const lx = -1.3 + i * 0.42; for (let k = 0; k < 6; k++) cyl(B, 0.012, 0.012, 0.5, '#5a7a3a', lx + (B.r() - 0.5) * 0.3, 0.7, -0.4 + B.r() * 0.8, { seg: 3, ao: false }); }
    for (let i = 0; i < 40; i++) sph(B, 0.07, isWinter() ? '#c8c0d8' : ['#9a6ad8', '#b88af0', '#8a5ac8'][i % 3], -1.4 + B.r() * 2.8, 0.85 + B.r() * 0.25, -0.5 + B.r() * 1.0, { sy: 1.6, ws: 5, hs: 4, ao: false });
    bush(B, 1.4, 0.2, { s: 0.35, y: 0.4, col: '#5a7a4a' });
    B.pop();
    // stable lean-to (right) with Turnip
    B.push(8.6, 0, -2.6, -PI / 2 + 0.25);
    box(B, 3.4, 2.2, 0.2, '#8a5a36', 0, 1.1, -0.9); for (const sx of [-1, 1]) box(B, 0.2, 2.2, 1.8, '#7a4a2c', sx * 1.6, 1.1, 0);
    box(B, 3.4, 0.9, 0.12, '#9a6a40', 0, 0.45, 0.9);
    box(B, 3.8, 0.14, 2.6, S.roofSnow ? '#f0f4fa' : '#a8874a', 0, 2.3, 0.1, { rx: 0.2 });
    B.pop();
    // dummy + weapons rack + barrels + crates (Biscuit sits on the crates)
    B.push(2.4, 0, -4.4, 0); cyl(B, 0.06, 0.06, 1.6, '#6a4a2c', 0, 0.8, 0, { seg: 6 }); cyl(B, 0.28, 0.22, 0.8, '#d8b878', 0, 1.4, 0, { seg: 8 }); sph(B, 0.2, '#d8b878', 0, 2.0, 0); cyl(B, 0.05, 0.05, 1.0, '#6a4a2c', 0, 1.6, 0, { rz: PI / 2, seg: 5 }); B.pop();
    crate(B, -3.6, -2.6, { s: 0.8, ry: 0.2 }); crate(B, -3.0, -3.2, { s: 0.7, ry: -0.3 }); crate(B, -3.5, -2.7, { s: 0.6, y: 0.8, ry: 0.5 }); barrel(B, -2.2, -3.6); barrel(B, 0.8, -6.6);
    // trees + planters to frame
    tree(B, -9.8, 3.8, { s: 1.6, h: 2.6 }); tree(B, 10.2, 4.6, { s: 1.5 }); tree(B, 11.5, -5, { s: 1.3 });
    bush(B, -6.6, 2.4, { s: 0.6, flowers: true }); bush(B, 2.0, 3.6, { s: 0.45 });
    for (const [x, z] of [[-4, 4.6], [-6.8, 0.4], [3.2, -2], [1.2, 3.1]]) grass(B, x, z, { n: 7 });
    flowers(B, -7.6, 3.5, { n: 12, r: 0.8 });
    // chickens (dynamic, wander)
    ctx.chickens([[0.8, 2.5], [1.6, 2.0], [-6.2, 3.4]]);
    ctx.light(0, [-1.6, 2.5, 0.4], '#ffd8a0', 0, 6);
    ctx.light(1, [-5.3, 3.0, -2.6], '#ffcc80', 1.2, 6);
    ctx.weather([-10, 0, -10, 10, 8, 6]);
    // animals
    ctx.animal('biscuit', 'cat', [-3.5, -2.7], { y: 1.4, face: 0.6, col: '#e8923a' });
    ctx.animal('turnip', 'horse', [7.8, -2.4], { y: 0.95, face: -1.1, col: '#9a643a' });
    return {};
  },
  hot: {
    well: { p: [-1.6, 1.2, 0.4], s: [2.0, 2.6, 2.0], walk: [-1.4, 2.0] },
    lavender: { p: [5.9, 0.8, 2.8], s: [3.4, 1.0, 1.8], walk: [3.2, 1.6] },
    biscuit: { p: [-3.5, 1.6, -2.7], s: [0.8, 0.7, 0.9], walk: [-3.6, -1.6], pri: 3 },
    turnip: { p: [7.8, 1.3, -2.4], s: [1.2, 1.4, 1.4], walk: [6.8, -2.0], pri: 2 },
    dummy: { p: [2.4, 1.2, -4.4], s: [0.9, 2.4, 0.9], walk: [2.4, -3.6] },
    banners: { p: [-5.4, 5.6, -2.9], s: [1.2, 2.6, 0.4], walk: [-4.6, -1.8] },
  },
  exits: {
    keep: { p: [-5.4, 1.5, -3.4], s: [2.0, 3.0, 0.6], walk: [-5.0, -2.0], dir: 'up' },
    gate: { p: [6.1, 1.9, -8.2], s: [3.2, 3.8, 1.0], walk: [5.6, -5.0], dir: 'up' },
  },
  npcs: {},
};

// ------------------------------------------------------------------ 3. WRENFOLD SQUARE
SCENE_DEFS.square = {
  cam: { pos: [0, 4.3, 13.4], look: [0, 1.5, -1.8], fov: 38, drift: 0.12, halfW: 8.6 },
  env: () => ({ sky: { ...S.sky, cloudAmt: 0.6, sunDir: [-0.45, 0.42, -0.8] }, fog: [S.sky.horizon, 26, 90], hemi: [S.hemiSky, S.hemiGround, 0.85], key: { pos: [-7, 12, 8], col: S.key, I: 2.5 }, rim: { pos: [9, 6, -10], col: '#a0c4ff', I: 1.0 }, amb: 0.14 }),
  ground: { W: 34, D: 26, cx: 0, cz: -3, paint: () => ({
    pal: pal(), seed: 9, flowers: 260,
    cobbles: [{ poly: [[-7.5, -7.8], [7.5, -7.8], [8.6, -2], [7.4, 3.6], [3, 4.6], [-3, 4.4], [-7.6, 3.2], [-8.6, -2]], mortar: '#857a6c', cols: ['#b0a596', '#a0968a', '#beb2a2', '#948a7e', '#c4a890', '#aa9a88', '#9c9284'], stone: 0.3 }],
    paths: [{ pts: [[-7.6, 1.0], [-11, 1.6], [-17, 2.2]], w: 2.4, col: S.dirt, col2: S.dirt2 }, { pts: [[7.6, 0.8], [12, 1.4], [17, 2]], w: 2.4, col: S.dirt, col2: S.dirt2 }, { pts: [[0, -7.6], [0, -12]], w: 2.6, col: S.dirt, col2: S.dirt2 }],
  }) },
  walk: [[-8.6, -0.4], [-5.6, -1.2], [-3.0, -4.6], [-2.8, -6.2], [-1.6, -7.2], [1.6, -7.2], [2.8, -6.0], [3.6, -3.8], [7.0, -1.8], [8.4, -0.4], [8.4, 2.0], [7.0, 2.0], [6.6, 4.8], [-8.6, 4.8]],
  holes: [oct(0.6, -1.2, 1.85, 10), [[4.6, 1.6], [7.2, 1.4], [7.2, 3.6], [4.6, 3.8]], oct(-4.3, -3.6, 1.25, 8), rect(2.7, -3.0, 3.9, -2.4), oct(2.1, -6.9, 0.45, 6), oct(-2.9, -2.6, 0.42, 6)],
  spawn: { start: [-7.8, 1.0, PI / 2], castle: [-7.8, 1.0, PI / 2], mill: [7.6, 0.9, -PI / 2], east: [0, -6.4, 0], map: [-7.8, 1.0, PI / 2] },
  build(ctx) {
    const B = ctx.B, bcol = ctx.banner;
    // bakery (left) + domed brick oven
    cottage(B, -7.2, -3.4, 0.45, { w: 3.2, d: 2.8, h: 2.1, rh: 1.6, plaster: '#f2e2c6', roof: '#a8553a', windows: [[-0.8, 1.45], [0.8, 1.45]], doorX: 0 });
    B.push(-7.2, 0, -3.4, 0.45); box(B, 1.2, 0.5, 0.06, '#7a4a2a', 0, 2.55, 1.46); sph(B, 0.22, '#e8b060', 0, 2.55, 1.5, { sx: 1.6, sy: 0.7, sz: 0.4 }); B.pop();
    B.push(-4.3, 0, -3.6, 0.3);
    cyl(B, 1.05, 1.1, 0.6, '#9a6a52', 0, 0.3, 0, { seg: 16, jit: 0.1 });
    B.add(jit(new THREE.SphereGeometry(1.02, 16, 10, 0, PI * 2, 0, PI / 2), 0.04, 3), '#b8704e', { y: 0.6, sy: 0.9, jit: 0.14 });
    box(B, 0.9, 0.8, 0.24, '#8a5a44', 0, 0.85, 0.95); box(B, 0.62, 0.52, 0.1, '#1a0c08', 0, 0.82, 1.08, { mat: 'glow', ao: false });
    cyl(B, 0.16, 0.2, 1.2, '#8a5a44', 0, 1.8, -0.4, { seg: 8 });
    B.pop();
    ctx.obj.fire = part(ctx, (P) => { P.push(-4.3, 0, -3.6, 0.3); sph(P, 0.24, '#ff7a2a', 0, 0.72, 1.06, { sy: 0.8, mat: 'glow' }); sph(P, 0.16, '#ffd060', 0, 0.68, 1.12, { mat: 'glow' }); P.pop(); });
    ctx.obj.gem = part(ctx, (P) => { P.push(-4.3, 0, -3.6, 0.3); sph(P, 0.08, '#ff2a1a', 0.05, 0.62, 1.14, { mat: 'glow', ws: 6, hs: 4 }); P.pop(); });
    // tavern (right back)
    cottage(B, 5.8, -5.2, -0.55, { w: 3.6, d: 3.0, h: 2.4, rh: 1.8, plaster: '#efe0c0', roof: '#6e5a4a', windows: [[-1.0, 1.6], [1.0, 1.6]], glow: true });
    B.push(5.8, 0, -5.2, -0.55); cyl(B, 0.04, 0.04, 1.0, '#3a2a1a', 1.6, 2.3, 1.7, { rz: PI / 2, seg: 4 }); box(B, 0.7, 0.55, 0.06, '#7a4a2a', 1.95, 1.9, 1.7); B.add(new THREE.CircleGeometry(0.2, 12), '#e8d8b0', { x: 1.95, y: 1.9, z: 1.74, ao: false }); B.pop();
    // back houses inside the walls
    cottage(B, -4.6, -7.4, 0.12, { w: 2.8, d: 2.4, h: 2.0, rh: 1.4 }); cottage(B, -9.6, -7.8, 0.5, { w: 2.6, d: 2.4 }); cottage(B, 10.0, -2.8, -1.1, { w: 2.8, d: 2.4 });
    // town wall + East Gate
    wall(B, -14, -9.4, -1.9, -9.4, { h: 3.4, t: 1.0 }); wall(B, 1.9, -9.4, 14, -9.4, { h: 3.4, t: 1.0 });
    tower(B, -2.5, -9.4, { r: 1.1, h: 5.0, roofC: '#4e5c9a', merlons: 8 }); tower(B, 2.5, -9.4, { r: 1.1, h: 5.0, roofC: '#4e5c9a', merlons: 8 });
    box(B, 3.0, 1.2, 1.2, '#c8bea9', 0, 4.0, -9.4); banner(B, 0, 4.4, -8.75, bcol, { w: 0.9, h: 1.4 });
    ctx.obj.doors = [];
    for (const sx of [-1, 1]) { const d = part(ctx, (P) => { box(P, 1.45, 3.3, 0.18, '#6a4428', -sx * 0.72, 1.65, 0); box(P, 1.4, 0.12, 0.06, '#3a2a1a', -sx * 0.72, 2.6, 0.1); box(P, 1.4, 0.12, 0.06, '#3a2a1a', -sx * 0.72, 0.8, 0.1); }); d.position.set(sx * 1.45, 0, -9.0); ctx.obj.doors.push(d); }
    // castle on its hill (far)
    cliffMass(B, -20, -7, -62, 30, 10, 12, { top: S.grass, side: S.grassDark, low: S.grassDark, grassLine: 0.3 });
    tower(B, -20, -54, { y: 2.2, r: 1.7, h: 7, roofC: '#4e5c9a', roofH: 3.8 }); tower(B, -15.6, -54.5, { y: 1.6, r: 1.3, h: 5.4, roofC: '#4e5c9a', roofH: 3 }); tower(B, -24, -55, { y: 1.4, r: 1.2, h: 4.6, roofC: '#4e5c9a', roofH: 3 });
    box(B, 7, 3.6, 3, '#d6ccb8', -19.6, 3.4, -54.2);
    const hills = ridgeCard({ seed: 2, layers: [{ y: 0.62, amp: 0.3, f: 0.006, ph: 0.5, c1: new THREE.Color(S.grass).lerp(new THREE.Color(S.sky.horizon), 0.55).getStyle(), c2: new THREE.Color(S.grassDark).lerp(new THREE.Color(S.sky.horizon), 0.45).getStyle(), trees: 1, tr: 12, tc: new THREE.Color(S.dark).lerp(new THREE.Color(S.sky.horizon), 0.5).getStyle() }] });
    ctx.world.add(card(hills, 160, 26, 10, 3, -70, { order: -1 }));
    // fountain, stall, notice board, lamps, bunting
    fountain(B, 0.6, -1.2);
    ctx.obj.fwater = waterDisc(ctx, 1.4, 0.6, 0.45, -1.2, { scale: 2.2 });
    stall(B, 5.9, 2.6, -0.35, { cols: ['#3a6ab0', '#f3ead6'] });
    B.push(3.3, 0, -2.7, -0.4); for (const sx of [-1, 1]) box(B, 0.1, 1.9, 0.1, '#6a4a2c', sx * 0.6, 0.95, 0); box(B, 1.4, 1.0, 0.08, '#8a6238', 0, 1.45, 0.02); for (let i = 0; i < 3; i++) box(B, 0.34, 0.42, 0.02, '#f4ecd8', -0.42 + i * 0.42, 1.45, 0.07, { rz: (B.r() - 0.5) * 0.2, ao: false }); box(B, 1.6, 0.1, 0.3, '#6a4a2c', 0, 2.0, 0.05); B.pop();
    lampPost(B, -6.4, 2.4); lampPost(B, 3.6, -5.6);
    bunting(B, -6.0, 3.6, -2.0, 4.6, 3.9, -3.6, { n: 20, sag: 0.7 }); bunting(B, -4.4, 3.6, -6.6, 4.0, 3.8, -5.0, { n: 16, sag: 0.6 });
    barrel(B, -5.6, -1.2); crate(B, -6.3, -0.8, { s: 0.6 }); crate(B, 7.6, -1.2, { s: 0.5 });
    // framing trees + greenery
    tree(B, -10.4, 3.4, { s: 1.7, h: 2.6, blossom: S.blossom }); tree(B, 10.6, 4.2, { s: 1.5 }); tree(B, 12.6, -6, { s: 1.4 }); tree(B, -13, -2, { s: 1.6 });
    bush(B, -8.4, 1.6, { s: 0.6, flowers: true }); bush(B, 8.6, 3.2, { s: 0.5, flowers: true }); bush(B, -2.0, -8.4, { s: 0.5 });
    flowers(B, -9.0, 4.4, { n: 14 }); for (const [x, z] of [[-8.6, 3.4], [8.2, 4.4], [-1.4, 4.6]]) grass(B, x, z, { n: 6 });
    ctx.chickens([[-2.6, 3.2], [-1.6, 3.8], [2.2, 3.4]]);
    overhang(ctx, { flowers: true });
    ctx.light(0, [-4.3, 0.9, -2.4], '#ff8a3a', 4, 6);
    ctx.light(1, [5.2, 2.0, -3.6], '#ffcc80', 0.6, 6);
    ctx.smoke([[-7.6, 4.8, -4.3], [-4.45, 2.6, -3.95], [10.2, 4.5, -3.4]]);
    ctx.weather([-10, 0, -9, 10, 8, 3]);
    return {
      apply(s) {
        const lit = !s.f.emberTaken; const roaring = lit && !s.f.ovenDoused;
        ctx.obj.fire.scale.setScalar(roaring ? 1.35 : 0.85); ctx.obj.gem.visible = !s.f.emberTaken;
        ctx.lightI[0] = roaring ? 9 : 3.2;
        const open = s.f.gateOpen ? 1 : 0; ctx.obj.doors[0].rotation.y = open * 1.25; ctx.obj.doors[1].rotation.y = -open * 1.25;
        ctx.roaring = roaring;
      },
      update(dt, t) {
        ctx.flicker(0, ctx.lightI[0], t);
        if (ctx.roaring && Math.random() < dt * 14) ctx.PA.spawn({ x: -4.3 + 0.35 * Math.sin(0.3) + (Math.random() - 0.5) * 0.4, y: 0.95, z: -2.5, vx: (Math.random() - 0.5) * 0.3, vy: 1.2 + Math.random(), vz: 0.4, size: 0.12, grow: -0.6, life: 0.7, color: Math.random() < 0.5 ? '#ffb040' : '#ff6020', a: 0.9 });
      },
    };
  },
  hot: {
    oven: { p: [-4.3, 0.9, -3.4], s: [2.2, 1.9, 2.2], walk: [-3.6, -1.8], pri: 2 },
    fountain: { p: [0.6, 0.9, -1.2], s: [3.4, 2.4, 3.4], walk: [0.8, 1.2] },
    tavern: { p: [5.8, 2.2, -5.2], s: [3.8, 4.4, 3.0], walk: [3.6, -3.4] },
    notices: { p: [3.3, 1.5, -2.7], s: [1.5, 1.2, 0.4], walk: [2.9, -1.8], pri: 2 },
    stall: { p: [5.9, 1.1, 2.6], s: [2.4, 2.2, 1.4], walk: [4.2, 1.2] },
    chickens: { p: [-1.0, 0.3, 3.4], s: [5.0, 0.7, 1.4], walk: [-1.0, 2.4] },
  },
  exits: {
    castle: { p: [-9.3, 1.4, 1.0], s: [1.4, 2.8, 2.6], walk: [-8.3, 1.0], dir: 'left' },
    mill: { p: [8.9, 1.2, 0.8], s: [1.4, 2.6, 2.6], walk: [8.1, 0.9], dir: 'right' },
    east: { p: [0, 1.7, -9.1], s: [3.0, 3.4, 0.8], walk: [0, -6.8], dir: 'up' },
  },
  npcs: {
    mabel: { at: [-2.9, -2.6], face: 0.7, walk: [-2.0, -1.6], make: () => makeHuman({ name: 'mabel', skin: '#f4c8a8', hair: '#8a4a2a', hairStyle: 'bun', hat: 'chef', top: '#c86a4a', robe: true, robeC: '#b8604a', apron: '#f8f2e6', girth: 1.25, belt: false, boots: '#5a3a2a', rig: {} }) },
    brannoch: { at: [2.1, -6.9], face: -0.15, walk: [1.2, -6.0], make: () => makeHuman({ name: 'brannoch', skin: '#eab896', hair: '#d8d0c0', hat: 'helmet', moustache: '#e8e0d0', top: ctx0.banner, sleeve: '#9aa2ac', bottom: '#4a4a52', boots: '#3a3a40', girth: 1.15, scale: 1.1, belt: '#3a2a1a', buckle: true, cape: '#3a4a7a', rig: {} }) },
  },
};
const ctx0 = { banner: '#c8324a' };
export const setBannerForNPCs = (c) => { ctx0.banner = c; };

// ------------------------------------------------------------------ 4. HOBB'S MILL
SCENE_DEFS.mill = {
  cam: { pos: [0, 4.6, 14.2], look: [0, 1.6, -1], fov: 38, drift: 0.12, halfW: 8.5 },
  env: () => ({ sky: { ...S.sky, cloudAmt: 0.5, sunDir: [0.5, 0.4, -0.75] }, fog: [S.sky.horizon, 24, 80], hemi: [S.hemiSky, S.hemiGround, 0.9], key: { pos: [8, 11, 7], col: S.key, I: 2.4 }, rim: { pos: [-8, 6, -10], col: '#a0c4ff', I: 1.0 }, amb: 0.14 }),
  ground: { W: 34, D: 26, cx: 0, cz: -3, hf: (x, z) => (z < -4.2 ? -0.5 - Math.min(1, (-4.2 - z) * 0.5) * 0.3 : z < -3.6 ? (z + 3.6) * 0.8 : 0) + (z < -8.6 ? Math.min(0.9, (-8.6 - z) * 0.35) : 0), paint: () => ({
    pal: pal(), seed: 13, flowers: 380,
    paths: [{ pts: [[-12, 2.6], [-5, 1.6], [-2.2, -1.6], [-2.0, -3.0]], w: 1.8, col: S.dirt, col2: S.dirt2 }, { pts: [[2.8, -3.8], [2.8, -9.6]], w: 1.4, col: '#8a6a4a', col2: S.dirt2 }],
    patches: [{ x: 0, z: -4.4, r: 12, sz: 0.06, col: '#6a5a40', n: 900, a: 0.5 }, { x: 4.6, z: 2.2, r: 2.4, sz: 0.7, col: S.grassDark, n: 300 }],
  }) },
  walk: [[-8.6, 0.2], [-8.4, 4.8], [7.8, 4.8], [7.8, -3.0], [1.0, -3.2], [-0.8, -2.8], [-3.2, -1.2], [-5.4, -0.8], [-6.8, 0.0]],
  holes: [oct(4.6, 2.2, 1.95, 12, 1.3), oct(-0.6, -2.2, 0.42, 6)],
  spawn: { start: [-7.6, 2.4, PI / 2], square: [-7.6, 2.4, PI / 2], map: [-7.6, 2.4, PI / 2] },
  build(ctx) {
    const B = ctx.B;
    // river across the back + far bank
    farland(ctx, { seed: 4, y: 0.06 });
    ctx.obj.river = waterPlane(ctx, 60, 4.6, 0, -0.62, -6.4, { flow: [0.9, 0.0], scale: 1, speed: 0.4 });
    for (let x = -14; x < 14; x += 0.9) { rock(B, x + B.r() * 0.5, -4.15 - B.r() * 0.3, { s: 0.22 + B.r() * 0.2, y: -0.4, col: '#8a8074' }); if (B.r() < 0.6) grass(B, x, -3.9, { n: 4, y: -0.05 }); }
    for (let x = -14; x < 14; x += 1.4) grass(B, x, -8.9, { n: 5, y: -0.4 });
    // mill house (left) on the bank
    B.push(-5.0, 0, -3.6, 0.15);
    B.add(houseGeo(4.2, 3.4, 3.6, 2.0), '#e8dcc4', { y: -0.4, jit: 0.04, aoH: 1.4 });
    box(B, 4.3, 0.8, 3.5, '#a89c8c', 0, -0.1, 0, { jit: 0.12 });
    roof(B, 4.2, 3.4, 3.2, 2.0, S.roofSnow ? '#e8eef6' : '#8a6a42', { t: 0.32, snow: S.roofSnow });
    box(B, 0.9, 1.6, 0.08, '#5a3a22', -0.6, 0.6, 1.73); box(B, 1.1, 1.8, 0.05, '#3a2a1a', -0.6, 0.7, 1.7);
    for (const wx of [0.9, -1.4]) { box(B, 0.6, 0.6, 0.05, '#ffd890', wx, 2.2, 1.72, { mat: 'glow' }); box(B, 0.7, 0.08, 0.1, '#5a3a22', wx, 1.86, 1.76); }
    box(B, 0.5, 1.6, 0.5, '#9a8a7a', 1.2, 4.4, -0.6);
    B.pop();
    // sacks
    for (const [x, z, s] of [[-2.6, -1.8, 1], [-2.2, -2.3, 0.9], [-2.9, -2.4, 0.85], [-2.55, -2.0, 0.7]]) B.add(jit(new THREE.SphereGeometry(0.34 * s, 10, 8), 0.03, x), '#e6dcc8', { x, y: 0.32 * s + (s === 0.7 ? 0.45 : 0), z, sy: 1.1, jit: 0.05 });
    // water wheel (dynamic) on the mill's right flank, dipping into the river
    ctx.obj.wheel = part(ctx, (P) => {
      tor(P, 1.7, 0.08, '#6a4a2c', 0, 0, 0, { ts: 24, rs: 5 }); tor(P, 1.2, 0.06, '#6a4a2c', 0, 0, 0, { ts: 20, rs: 5 });
      for (let i = 0; i < 12; i++) { const a = (i / 12) * PI * 2; box(P, 0.12, 0.75, 0.62, '#8a6238', Math.cos(a) * 1.55, Math.sin(a) * 1.55, 0, { rz: a + PI / 2 }); box(P, 0.06, 1.4, 0.08, '#6a4a2c', Math.cos(a) * 0.85, Math.sin(a) * 0.85, 0, { rz: a + PI / 2 }); }
      cyl(P, 0.18, 0.18, 0.8, '#4a3a2a', 0, 0, 0, { rx: PI / 2, seg: 8 });
    });
    ctx.obj.wheel.position.set(-2.45, 0.9, -4.7); ctx.obj.wheel.rotation.y = 0.15 + 0.95;
    box(B, 0.3, 2.0, 0.3, '#5a4030', -2.0, 0.5, -4.4); box(B, 0.3, 2.0, 0.3, '#5a4030', -3.0, 0.5, -5.6);
    ctx.obj.brass = part(ctx, (P) => sph(P, 0.08, '#ffd060', 0, 0, 0, { mat: 'glow', ws: 6, hs: 4 }));
    ctx.obj.brass.position.set(-2.3, 0.95, -4.7);
    // footbridge (right back)
    B.push(2.8, 0, -6.4, 0);
    for (let i = 0; i < 9; i++) box(B, 1.4, 0.1, 0.5, '#8a6238', 0, 0.02 + Math.sin((i / 8) * PI) * 0.4, -2.0 + i * 0.5);
    for (const sx of [-1, 1]) { for (let i = 0; i < 5; i++) box(B, 0.08, 0.8, 0.08, '#6a4a2c', sx * 0.65, 0.4 + Math.sin((i / 4) * PI) * 0.4, -2 + i); }
    B.pop();
    // willow (right back) + other trees + reeds
    B.push(6.6, 0, -4.8, 0); cyl(B, 0.3, 0.42, 3.2, '#6a5038', 0, 1.6, 0, { seg: 8 });
    for (let i = 0; i < 26; i++) { const a = (i / 26) * PI * 2, rr = 1.3 + B.r() * 0.6; B.add(jit(new THREE.CylinderGeometry(0.22, 0.04, 2.6, 5), 0.05, i), S.leaf[i % S.leaf.length], { x: Math.cos(a) * rr, y: 2.6, z: Math.sin(a) * rr * 0.8, rz: Math.cos(a) * 0.25, rx: -Math.sin(a) * 0.25, ao: false }); }
    ico(B, 1.6, S.leaf[1], 0, 3.8, 0, { detail: 2, blob: true, ao: false }); B.pop();
    tree(B, -10.6, 3.8, { s: 1.7 }); tree(B, 10.4, 3.6, { s: 1.5 }); tree(B, -8.6, -10, { s: 1.6 }); tree(B, 2, -11, { s: 1.4 }); tree(B, 9, -10.5, { s: 1.6 }); tree(B, -2.5, -12, { s: 1.5 });
    for (let i = 0; i < 18; i++) { const a = (i / 18) * PI * 2; const rx = 4.6 + Math.cos(a) * 2.45, rz = 2.2 + Math.sin(a) * 1.9; if (Math.sin(a) > 0.2 && Math.abs(Math.cos(a)) < 0.6) continue; for (let k = 0; k < 3; k++) cyl(B, 0.02, 0.03, 0.9 + B.r() * 0.5, '#6a7a3a', rx + (B.r() - 0.5) * 0.3, 0.5, rz + (B.r() - 0.5) * 0.3, { seg: 3, rz: (B.r() - 0.5) * 0.3, ao: false }); }
    ctx.obj.pond = waterDisc(ctx, 1.95, 4.6, 0.04, 2.2, { sx: 1.3, scale: 1.8 });
    bush(B, -6.4, 4.4, { s: 0.5, flowers: true }); flowers(B, 1.6, 4.4, { n: 12 }); flowers(B, -4.4, 0.8, { n: 8 });
    fence(B, [[-8.4, -1.4], [-6.6, -1.0]]);
    for (const [x, z] of [[-1.4, 4.2], [7.4, 4.4], [0.6, 1.4]]) grass(B, x, z, { n: 6 });
    // ducks on the pond (one has the key)
    ctx.animal('duck', 'duck', [4.0, 2.0], { y: 0.02, face: 0.4, swim: [4.6, 2.2, 1.2] });
    ctx.extraDucks([[5.4, 2.6], [5.0, 1.6]]);
    ctx.light(0, [-2.6, 1.6, -2.6], '#ffd8a0', 0, 6); ctx.light(1, [-4.4, 2.2, -1.6], '#ffcc80', 0.8, 5);
    ctx.weather([-10, 0, -9, 10, 8, 6]);
    return {
      apply(s) { ctx.wheelOn = !!s.f.wheelFixed; ctx.obj.brass.visible = !s.f.wheelFixed; ctx.duckKey = s.f.keyInDuck && !s.f.keyTaken; },
      update(dt, t) { if (ctx.wheelOn) ctx.obj.wheel.rotateZ(-dt * 0.9); else ctx.obj.wheel.rotation.z = Math.sin(t * 3) * 0.006; if (ctx.wheelOn && Math.random() < dt * 10) ctx.P.spawn({ x: -2.6 + (Math.random() - 0.5) * 0.6, y: -0.3, z: -4.0, vx: (Math.random() - 0.5), vy: 1.2, vz: 0.6, g: 4, size: 0.08, life: 0.6, color: '#e8f6ff', a: 0.8 }); },
    };
  },
  hot: {
    wheel: { p: [-2.55, 1.0, -5.0], s: [1.2, 3.6, 3.6], walk: [-1.6, -2.9] },
    duck: { p: [4.0, 0.3, 2.0], s: [0.8, 0.8, 0.8], walk: [3.0, 0.2], follow: 'duck', pri: 3 },
    pond: { p: [4.6, 0.1, 2.2], s: [4.8, 0.3, 3.6], walk: [3.0, 0.2] },
    door: { p: [-5.6, 0.9, -1.85], s: [1.2, 2.0, 0.5], walk: [-5.4, -0.7], pri: 2 },
    sacks: { p: [-2.6, 0.5, -2.1], s: [1.4, 1.0, 1.2], walk: [-2.2, -1.2], pri: 2 },
    willow: { p: [6.6, 2.6, -4.8], s: [3.6, 5.2, 3.0], walk: [6.0, -2.8] },
  },
  exits: { square: { p: [-9.2, 1.2, 2.4], s: [1.4, 2.6, 3.0], walk: [-8.2, 2.4], dir: 'left' } },
  npcs: { hobb: { at: [-0.6, -2.2], face: 0.3, walk: [0.2, -1.2], make: () => makeHuman({ name: 'hobb', skin: '#e4b896', hair: '#7a6a5a', hairStyle: 'short', hat: 'flatcap', hatC: '#6a6a54', beard: '#8a7a6a', top: '#c8b890', bottom: '#5a5a48', apron: '#e8e0d0', girth: 1.0, scale: 1.16, belt: '#5a4030', rig: {} }) } },
};

// ------------------------------------------------------------------ 5. THE CROSSROADS (woods)
function forestBack(ctx, z, n, spread) {
  const B = ctx.B;
  for (let i = 0; i < n; i++) { const x = (B.r() - 0.5) * spread, zz = z - B.r() * 6; if (B.r() < 0.4) pine(B, x, zz, { s: 1.2 + B.r() * 0.8 }); else tree(B, x, zz, { s: 1.5 + B.r() * 0.9, h: 3.2, r: 1.3 }); }
}
SCENE_DEFS.woods = {
  cam: { pos: [0, 4.4, 14.0], look: [0, 1.8, -1], fov: 38, drift: 0.12, halfW: 8.5 },
  env: () => ({ sky: { ...S.sky, cloudAmt: 0.35, sunDir: [0.3, 0.5, -0.8] }, fog: [new THREE.Color(S.sky.horizon).lerp(new THREE.Color(S.leaf[0]), 0.35).getStyle(), 14, 52], hemi: [S.hemiSky, S.leaf[2] ?? S.hemiGround, 0.75], key: { pos: [6, 12, -2], col: S.key, I: 2.2 }, rim: { pos: [-8, 5, -10], col: '#c0e0a0', I: 0.9 }, amb: 0.16 }),
  ground: { W: 34, D: 26, cx: 0, cz: -3, paint: () => ({
    pal: pal({ base: S === undefined ? null : S.grassDark, base2: S.grass, dark: '#3a4a2a', light: S.grass2 }), seed: 17, flowers: 220,
    paths: [{ pts: [[-13, 1.6], [-4, 1.0], [0, 0.2], [4, -1.6], [12, -2.4]], w: 2.2, col: S.dirt, col2: S.dirt2 }, { pts: [[-0.6, 0.4], [-2.2, -4], [-3.2, -9]], w: 1.8, col: S.dirt, col2: S.dirt2 }],
    patches: [{ x: -4, z: 2.2, r: 1.4, col: '#4a5a2a', n: 300 }],
  }) },
  walk: [[-8.6, -0.4], [-4.0, -0.9], [-3.2, -4.8], [-1.6, -4.8], [-0.6, -1.4], [2.2, -2.6], [7.8, -3.4], [7.8, 0.6], [5.8, 0.2], [5.4, 1.6], [7.0, 4.8], [-8.6, 4.8]],
  holes: [oct(-4.1, 2.3, 0.95, 8), oct(0, -1.0, 0.35, 6), rect(3.4, -2.1, 5.8, -0.4), oct(2.9, -0.4, 0.42, 6)],
  spawn: { start: [-7.6, 1.4, PI / 2], west: [-7.6, 1.4, PI / 2], north: [-2.4, -4.0, PI * 0.95], east: [7.2, -2.0, -PI / 2], map: [-7.6, 1.4, PI / 2] },
  build(ctx) {
    const B = ctx.B;
    // framing giants (foreground, dark), midground trunks, background forest + painted forest card
    tree(B, -9.8, 4.0, { s: 2.2, h: 3.0, girth: 1.5, r: 1.3 }); tree(B, 10.0, 3.6, { s: 2.1, h: 3.0, girth: 1.4 }); pine(B, -12.5, -1, { s: 1.8 }); pine(B, 12.6, -0.5, { s: 1.9 });
    tree(B, -6.4, -5.6, { s: 1.7, h: 3.2 }); tree(B, 1.6, -6.8, { s: 1.8, h: 3.4 }); pine(B, 5.6, -6.2, { s: 1.6 }); tree(B, 9.4, -5.6, { s: 1.6 }); pine(B, -9.6, -6, { s: 1.5 });
    forestBack(ctx, -11, 22, 34);
    const fc = ridgeCard({ seed: 4, layers: [{ y: 0.55, amp: 0.25, f: 0.012, ph: 1, c1: new THREE.Color(S.leaf[2]).lerp(new THREE.Color(S.sky.horizon), 0.55).getStyle(), c2: new THREE.Color(S.dark).lerp(new THREE.Color(S.sky.horizon), 0.4).getStyle(), trees: 2, tr: 16, tall: 1.6 }] });
    ctx.world.add(card(fc, 90, 22, 0, 6, -26, { order: -1 }));
    // signpost, cart, mushrooms, stream, logs
    signpost(B, 0, -1.0, [[-0.1, 2.05], [PI + 0.25, 1.75], [-1.4, 1.45]]);
    B.push(4.6, 0, -1.2, -0.3);
    box(B, 2.2, 0.8, 1.2, '#8a5a34', 0, 0.9, 0); for (const sx of [-1, 1]) { tor(B, 0.45, 0.06, '#5a3a22', sx * 0.7, 0.45, 0.65, { ts: 14, rs: 4 }); tor(B, 0.45, 0.06, '#5a3a22', sx * 0.7, 0.45, -0.65, { ts: 14, rs: 4 }); }
    box(B, 2.0, 0.08, 1.4, '#c8402a', 0, 2.25, 0, { rx: 0.08 }); for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(B, 0.04, 0.04, 1.0, '#5a3a22', sx * 0.95, 1.8, sz * 0.55, { seg: 4 });
    for (let i = 0; i < 7; i++) sph(B, 0.1 + B.r() * 0.08, ['#7ac8e8', '#e8c050', '#c86ac8', '#f4f0e8', '#8ad86a'][i % 5], -0.8 + i * 0.26, 1.42, -0.2 + (i % 2) * 0.3, { ws: 6, hs: 5 });
    box(B, 0.3, 0.42, 0.06, '#e8d070', 0.7, 1.55, 0.45, { rz: -0.2 }); box(B, 0.24, 0.32, 0.03, '#a8d4f0', 0.7, 1.55, 0.49, { rz: -0.2, mat: 'glow' });
    cyl(B, 0.04, 0.04, 2.5, '#5a3a22', -1.1, 1.3, 0.6, { rz: 0.5, seg: 4 });
    B.pop();
    ctx.obj.lantern = part(ctx, (P) => { box(P, 0.22, 0.3, 0.22, '#ffd27a', 0, 0, 0, { mat: 'glow' }); });
    ctx.obj.lantern.position.set(3.95, 2.0, -0.85);
    for (let i = 0; i < 9; i++) { const a = (i / 9) * PI * 2; mushroom(B, -4.1 + Math.cos(a) * 0.85, 2.3 + Math.sin(a) * 0.65, { s: 0.28 + B.r() * 0.12, cap: '#7ae8c8', mat: 'glow', spots: false }); }
    log(B, -6.0, -2.2, 0.4); log(B, 6.8, 2.2, -0.6);
    ctx.obj.stream = waterPlane(ctx, 3.0, 18, 9.6, 0.02, -4, { flow: [0.0, -0.8], scale: 1.2 });
    ctx.obj.stream.rotation.z = -0.35;
    for (let i = 0; i < 12; i++) rock(B, 8.2 + (B.r() - 0.5) * 1, -9 + i * 1.3, { s: 0.3, col: '#8a8274' });
    for (let i = 0; i < 40; i++) { const x = (B.r() - 0.5) * 19, z = -5 + B.r() * 10; if (Math.abs(x) < 7.5 && z > -4 && z < 4.6) continue; B.r() < 0.5 ? grass(B, x, z, { n: 6 }) : bush(B, x, z, { s: 0.45 + B.r() * 0.3 }); }
    for (let i = 0; i < 8; i++) fern(B, (B.r() - 0.5) * 16, 3.5 + B.r() * 1.5);
    ctx.obj.thimble = part(ctx, (P) => { cyl(P, 0.05, 0.06, 0.1, '#e8eef4', 0, 0.05, 0, { seg: 8 }); });
    ctx.obj.thimble.position.set(1.6, 0, 2.8);
    ctx.light(0, [-4.1, 0.8, 2.3], '#7af0d0', 1.8, 4.5); ctx.light(1, [3.95, 2.0, -0.5], '#ffcc70', 1.6, 6);
    rays(ctx, '#fff2c8', [[-2.5, 4.2, -3, 2.0, 9, 0.35, 0.18], [1.8, 4.2, -2.2, 1.6, 9, 0.35, 0.14], [5.4, 4.2, -4.5, 2.4, 9, 0.35, 0.12]]);
    ctx.fireflies([-8, 0.4, -6, 8, 3, 4], 22);
    ctx.weather([-10, 0, -9, 10, 8, 6], 0.6);
    return { apply(s) { ctx.obj.thimble.visible = !s.f.thimbleTaken; }, update(dt, t) { ctx.obj.thimble.rotation.y = t; } };
  },
  hot: {
    signpost: { p: [0, 1.6, -1.0], s: [1.6, 2.8, 0.8], walk: [0.4, 0.4] },
    cart: { p: [4.6, 1.3, -1.2], s: [2.6, 2.6, 1.6], walk: [4.0, 0.6] },
    mushrooms: { p: [-4.1, 0.3, 2.3], s: [2.0, 0.7, 1.6], walk: [-4.0, 0.9], pri: 2 },
    thimble: { p: [1.6, 0.15, 2.8], s: [0.6, 0.5, 0.6], walk: [1.0, 2.6], pri: 4 },
    stream: { p: [9.6, 0.2, -5], s: [3, 0.6, 10], walk: [7.2, -2.6] },
    trees: { p: [1.6, 4.0, -6.8], s: [3, 6, 2], walk: [1.6, -2.4] },
  },
  exits: {
    west: { p: [-9.4, 1.2, 1.4], s: [1.4, 2.6, 3.0], walk: [-8.3, 1.4], dir: 'left' },
    north: { p: [-2.6, 1.4, -6.2], s: [2.2, 3, 1.6], walk: [-2.5, -4.6], dir: 'up' },
    east: { p: [8.9, 1.2, -2.2], s: [1.4, 2.6, 3.0], walk: [7.6, -2.2], dir: 'right' },
  },
  npcs: { fennick: { at: [2.9, -0.4], face: 0.5, walk: [2.2, 0.8], make: () => makeFox({ name: 'fennick', top: '#3e6a4e', rig: {} }) } },
};
function log(B, x, z, ry) { B.push(x, 0, z, ry); cyl(B, 0.32, 0.36, 2.6, '#6a4a32', 0, 0.3, 0, { rz: PI / 2, seg: 10 }); cyl(B, 0.3, 0.3, 0.02, '#c8a070', 1.31, 0.3, 0, { rz: PI / 2, seg: 10 }); if (!S.roofSnow) for (let i = 0; i < 4; i++) sph(B, 0.12, '#5a8a3a', -0.8 + i * 0.5, 0.6, 0, { sy: 0.4, ao: false }); else box(B, 2.4, 0.08, 0.5, '#f4f8ff', 0, 0.64, 0); B.pop(); }
function fern(B, x, z) { for (let i = 0; i < 7; i++) { const a = (i / 7) * PI * 2; B.add(new THREE.ConeGeometry(0.12, 0.9, 4), S.leaf[i % S.leaf.length], { x: x + Math.cos(a) * 0.28, y: 0.32, z: z + Math.sin(a) * 0.28, sz: 0.25, ry: -a + PI / 2, rz: Math.cos(a) * 1.0, rx: -Math.sin(a) * 1.0, ao: false }); } }

// ------------------------------------------------------------------ 6. THISTLE'S HOLLOW (glade)
SCENE_DEFS.glade = {
  cam: { pos: [0, 4.3, 14.0], look: [0, 1.9, -1.5], fov: 38, drift: 0.12, halfW: 8.5 },
  env: () => ({ sky: { ...S.sky, zenith: '#5a74c4', cloudAmt: 0.5, sunDir: [-0.2, 0.55, -0.8] }, fog: [new THREE.Color(S.sky.horizon).lerp(new THREE.Color('#b8a8d8'), 0.3).getStyle(), 16, 55], hemi: [S.hemiSky, '#5a4a6a', 0.8], key: { pos: [-5, 12, 4], col: S.key, I: 2.1 }, rim: { pos: [8, 5, -9], col: '#d0b0ff', I: 1.1 }, amb: 0.18 }),
  ground: { W: 32, D: 24, cx: 0, cz: -3, paint: () => ({
    pal: pal(), seed: 19, flowers: 420,
    paths: [{ pts: [[0, 9], [0.2, 3], [-0.8, -1], [-2.8, -3.0]], w: 1.8, col: S.dirt, col2: S.dirt2 }],
    patches: [{ x: -5, z: 1.6, r: 1.6, sz: 0.6, col: '#5a4030', n: 400 }, { x: 0.8, z: -1.2, r: 1.2, col: '#4a3a30', n: 200 }],
  }) },
  walk: [[-7.8, -1.0], [-4.6, -1.6], [-1.6, -2.8], [2.4, -2.8], [4.2, -1.4], [7.6, -1.0], [7.6, 4.8], [-7.8, 4.8]],
  holes: [oct(0.8, -1.2, 0.9, 8), [[-6.6, 0.6], [-3.6, 0.6], [-3.6, 2.6], [-6.6, 2.6]], oct(-0.7, -1.9, 0.42, 6)],
  spawn: { start: [0, 4.2, PI], south: [0, 4.2, PI], map: [0, 4.2, PI] },
  build(ctx) {
    const B = ctx.B;
    // crooked cottage
    B.push(-3.2, 0, -4.8, 0.55);
    B.add(houseGeo(3.6, 3.0, 2.3, 1.55), '#e8dcc0', { rz: 0.04, jit: 0.06, aoH: 1.2 });
    B.push(0, 0, 0, 0, 1, 0, 0.04); roof(B, 3.6, 3.0, 2.3, 1.6, S.roofSnow ? '#eef2f8' : '#7a5a30', { t: 0.42, over: 0.4, ex: 0.4, snow: S.roofSnow }); B.pop();
    box(B, 3.7, 0.4, 3.1, '#8a7a6a', 0, 0.2, 0, { jit: 0.14 });
    B.add(new THREE.CircleGeometry(0.55, 16, 0, PI), '#5a3a22', { y: 1.0, z: 1.52, ao: false }); box(B, 1.1, 1.0, 0.06, '#5a3a22', 0, 0.5, 1.52); box(B, 1.26, 1.2, 0.04, '#3a2a1a', 0, 0.62, 1.5);
    for (const wx of [-1.1, 1.1]) { B.add(new THREE.CircleGeometry(0.3, 12), '#ffd27a', { x: wx, y: 1.6, z: 1.53, mat: 'glow', ao: false }); tor(B, 0.3, 0.05, '#5a3a22', wx, 1.6, 1.55, { ts: 12, rs: 4 }); }
    B.push(1.0, 3.6, -0.4, 0, 1, 0, -0.2); cyl(B, 0.25, 0.32, 1.8, '#9a8a7a', 0, 0, 0, { seg: 7, jit: 0.15 }); B.pop();
    B.pop();
    // cauldron on a fire
    B.push(0.8, 0, -1.2, 0);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * PI * 2; cyl(B, 0.06, 0.08, 0.7, '#5a3a22', Math.cos(a) * 0.3, 0.12, Math.sin(a) * 0.3, { rz: Math.cos(a) * 1.2, rx: -Math.sin(a) * 1.2, seg: 5 }); }
    for (let i = 0; i < 8; i++) rock(B, Math.cos((i / 8) * PI * 2) * 0.75, Math.sin((i / 8) * PI * 2) * 0.75, { s: 0.16, col: '#7a7268', snow: false });
    B.add(new THREE.SphereGeometry(0.62, 16, 10, 0, PI * 2, PI * 0.35, PI * 0.65), '#2a2a30', { y: 0.72, mat: 'paintDS' }); tor(B, 0.5, 0.05, '#3a3a40', 0, 1.0, 0, { rx: PI / 2, ts: 16 });
    B.pop();
    ctx.obj.brew = part(ctx, (P) => { cyl(P, 0.5, 0.5, 0.04, '#7aff9a', 0.8, 0.98, -1.2, { seg: 16, mat: 'glow' }); sph(P, 0.2, '#ff8a2a', 0.8, 0.12, -1.2, { mat: 'glow', sy: 0.5 }); });
    glowCard(ctx, '#7aff9a', 2.2, 0.8, 1.3, -1.0, 0.35);
    // giant mushrooms (right) — the watch hangs from the big one
    B.push(5.2, 0, -3.0, 0);
    cyl(B, 0.45, 0.6, 2.6, '#f4ecd8', 0, 1.3, 0, { seg: 12 });
    B.add(new THREE.SphereGeometry(2.0, 20, 10, 0, PI * 2, 0, PI / 2), '#c8403a', { y: 2.5, sy: 0.55, ao: false });
    B.add(new THREE.CircleGeometry(1.95, 20), '#e8d8b8', { y: 2.5, rx: PI / 2, ao: false });
    for (let i = 0; i < 9; i++) { const a = (i / 9) * PI * 2 + 0.3; sph(B, 0.18, '#fff6e6', Math.cos(a) * 1.3, 3.15, Math.sin(a) * 1.3, { sy: 0.5, ao: false }); }
    if (S.roofSnow) B.add(new THREE.SphereGeometry(1.7, 20, 8, 0, PI * 2, 0, PI / 2.4), '#f4f8ff', { y: 2.82, sy: 0.4, ao: false });
    B.pop();
    mushroom(B, 6.8, -1.4, { s: 0.9, cap: '#d8603a' }); mushroom(B, 3.9, -4.4, { s: 1.2, cap: '#a8402a' }); mushroom(B, 7.4, -4.0, { s: 1.4, cap: '#c8503a' });
    ctx.obj.watch = part(ctx, (P) => { cyl(P, 0.005, 0.005, 0.5, '#c8ccd4', 0, 0.25, 0, { seg: 3 }); cyl(P, 0.11, 0.11, 0.04, '#e8eef4', 0, -0.02, 0, { rx: PI / 2, seg: 12 }); });
    ctx.obj.watch.position.set(4.2, 1.95, -1.6);
    // herb garden with an empty lavender patch
    B.push(-5.1, 0, 1.6, 0.1);
    box(B, 3.0, 0.3, 2.0, '#6a4a2c', 0, 0.15, 0); box(B, 2.8, 0.08, 1.8, '#4a3428', 0, 0.32, 0);
    for (let i = 0; i < 4; i++) bush(B, -1.0 + i * 0.66, -0.4 + (i % 2) * 0.6, { s: 0.32, y: 0.3, col: ['#5a8a3a', '#7aa04a', '#4a7a4a', '#8a9a4a'][i] });
    box(B, 0.06, 0.5, 0.06, '#6a4a2c', 0.9, 0.55, 0.6); box(B, 0.5, 0.25, 0.04, '#e8dcc0', 0.9, 0.82, 0.62, { ao: false });
    B.pop();
    ctx.obj.lavPatch = part(ctx, (P) => { for (let i = 0; i < 18; i++) sph(P, 0.06, '#9a6ad8', -4.6 + P.r() * 0.6, 0.6 + P.r() * 0.2, 2.0 + P.r() * 0.4, { sy: 1.5, ws: 5, hs: 4, ao: false }); });
    // forest ring
    tree(B, -9.8, 3.6, { s: 2.0, h: 2.8 }); tree(B, 10.2, 4.2, { s: 1.9 }); pine(B, -10.6, -3.0, { s: 1.8 }); pine(B, 11, -2, { s: 1.6 });
    tree(B, -7.6, -7.6, { s: 1.8, h: 3.2 }); tree(B, 1.2, -8.4, { s: 1.9, h: 3.2 }); pine(B, 8.6, -7.4, { s: 1.7 }); forestBack(ctx, -12, 18, 34);
    const fc = ridgeCard({ seed: 8, layers: [{ y: 0.55, amp: 0.25, f: 0.01, ph: 2, c1: new THREE.Color(S.leaf[2]).lerp(new THREE.Color('#b8a8d8'), 0.5).getStyle(), c2: new THREE.Color(S.dark).lerp(new THREE.Color('#8a7aa8'), 0.4).getStyle(), trees: 2, tr: 16, tall: 1.6 }] });
    ctx.world.add(card(fc, 90, 22, 0, 6, -26, { order: -1 }));
    for (let i = 0; i < 30; i++) { const x = (B.r() - 0.5) * 18, z = -5 + B.r() * 10; if (Math.abs(x) < 7.4 && z > -3.2) continue; B.r() < 0.5 ? grass(B, x, z) : bush(B, x, z, { s: 0.4 + B.r() * 0.3, flowers: B.r() < 0.4 }); }
    flowers(B, 2.8, 3.8, { n: 12 }); flowers(B, -2.8, 4.2, { n: 10 }); for (let i = 0; i < 6; i++) fern(B, (B.r() - 0.5) * 16, 4 + B.r());
    ctx.light(0, [0.8, 1.3, -1.0], '#7aff9a', 2.6, 6); ctx.light(1, [-3.2, 1.6, -3.2], '#ffcc70', 1.2, 5);
    ctx.fireflies([-8, 0.4, -5, 8, 3, 4], 28);
    ctx.animal('goat', 'goat', [3.4, 1.2], { face: -0.7, wander: [3.4, 1.4, 1.6] });
    return {
      apply(s) { ctx.obj.watch.visible = !s.f.watchTaken; ctx.obj.lavPatch.visible = !!s.f.grannyHappy; ctx.goatGlow = !!s.f.goatGlow; },
      update(dt, t) { ctx.obj.watch.rotation.z = Math.sin(t * 1.6) * 0.15; if (Math.random() < dt * 6) ctx.PA.spawn({ x: 0.8 + (Math.random() - 0.5) * 0.6, y: 1.05, z: -1.2, vy: 0.5 + Math.random() * 0.4, size: 0.1, grow: 0.8, life: 1.2, color: '#9affb0', a: 0.5 }); ctx.flicker(0, 2.6, t); },
    };
  },
  hot: {
    cauldron: { p: [0.8, 0.8, -1.2], s: [1.6, 1.4, 1.6], walk: [1.6, 0.2] },
    cottage: { p: [-3.2, 2.2, -4.8], s: [4.2, 4.6, 3.2], walk: [-2.4, -2.4] },
    garden: { p: [-5.1, 0.5, 1.6], s: [3.0, 0.9, 2.0], walk: [-3.0, 1.8] },
    watch: { p: [4.2, 1.9, -1.6], s: [0.5, 0.7, 0.5], walk: [3.6, -0.6], pri: 4 },
    mushroom: { p: [5.2, 2.4, -3.0], s: [4.0, 4.6, 4.0], walk: [3.6, -0.8] },
    goat: { p: [3.4, 0.7, 1.2], s: [1.2, 1.5, 1.5], walk: [2.4, 1.6], pri: 3 },
  },
  exits: { south: { p: [0, 0.8, 5.4], s: [3.4, 1.6, 1.2], walk: [0, 4.6], dir: 'down' } },
  npcs: { granny: { at: [-0.7, -1.9], face: 0.4, walk: [-0.6, -0.6], make: () => makeHuman({ name: 'granny', skin: '#ecc8b0', hair: '#e8e4e0', hairStyle: 'long', hat: 'witch', hatC: '#4a3a5a', robe: true, robeC: '#6a5a8a', top: '#6a5a8a', scarf: '#c86a4a', glasses: '#8a6a3a', girth: 1.05, scale: 0.92, boots: '#3a2a3a', rig: {} }) } },
};

// ------------------------------------------------------------------ 7. THE OLD OAK (Grumbleroot)
SCENE_DEFS.oak = {
  cam: { pos: [0, 4.4, 14.0], look: [0, 2.4, -1.5], fov: 40, drift: 0.1, halfW: 8.5 },
  env: () => ({ sky: { ...S.sky, cloudAmt: 0.45, sunDir: [0.5, 0.45, -0.7] }, fog: [new THREE.Color(S.sky.horizon).lerp(new THREE.Color(S.leaf[0]), 0.4).getStyle(), 15, 50], hemi: [S.hemiSky, S.leaf[2], 0.75], key: { pos: [8, 12, 5], col: S.key, I: 2.3 }, rim: { pos: [-8, 6, -10], col: '#d0f0a0', I: 1.0 }, amb: 0.16 }),
  ground: { W: 32, D: 24, cx: 0, cz: -3, paint: () => ({
    pal: pal({ base: S.grassDark, base2: S.grass, dark: '#3a4a2a', light: S.grass2 }), seed: 23, flowers: 200,
    paths: [{ pts: [[-13, 1.2], [-4, 0.6], [2, -0.6], [6, -1.2], [13, -1.8]], w: 2.0, col: S.dirt, col2: S.dirt2 }],
    patches: [{ x: -1.5, z: -3.4, r: 3.4, sz: 0.6, col: '#4a3a2a', n: 600 }],
  }) },
  walk: [[-8.6, -0.6], [-5.6, -1.6], [-4.2, -1.0], [-1.6, -0.9], [1.8, -1.8], [4.6, -2.4], [5.2, -1.8], [5.0, 0.6], [4.4, 1.6], [6.6, 4.8], [-8.6, 4.8]],
  walkOpen: [[-8.6, -0.6], [-5.6, -1.6], [-4.2, -1.0], [-1.6, -0.9], [1.8, -1.8], [4.6, -2.4], [7.8, -2.6], [7.8, 0.6], [6.4, 1.0], [6.6, 4.8], [-8.6, 4.8]],
  holes: [],
  spawn: { start: [-7.6, 1.0, PI / 2], west: [-7.6, 1.0, PI / 2], east: [6.8, -1.6, -PI / 2], map: [-7.6, 1.0, PI / 2] },
  build(ctx) {
    const B = ctx.B, bark = '#6a5038';
    // Grumbleroot: huge trunk, roots, canopy; face parts are dynamic
    B.push(-1.5, 0, -3.6, 0);
    B.add(jit(new THREE.CylinderGeometry(1.35, 1.9, 6.2, 16, 4), 0.12, 2), bark, { y: 3.1, jit: 0.1, aoH: 2 });
    for (let i = 0; i < 7; i++) { const a = (i / 7) * PI * 2 + 0.2; B.add(jit(new THREE.CylinderGeometry(0.22, 0.55, 3.2, 7), 0.08, i), bark, { x: Math.cos(a) * 1.9, y: 0.35, z: Math.sin(a) * 1.6, rz: Math.cos(a) * 1.25, rx: -Math.sin(a) * 1.25, jit: 0.1 }); }
    for (const [x, y, z, rz, ry, l] of [[-2.6, 5.4, 0, 0.9, 0, 3.4], [0.2, 6.2, -1.2, -0.3, 0.6, 3.0], [-1, 6.0, 1.0, 0.4, -0.9, 2.6]]) cyl(B, 0.26, 0.45, l, bark, x, y, z, { rz, ry, seg: 8 });
    // bark furrows + moss beard
    for (let i = 0; i < 18; i++) { const a = -0.9 + (i / 18) * 1.8; box(B, 0.06, 2 + B.r() * 2.5, 0.08, '#4a3626', Math.sin(a) * 1.55, 2.4 + B.r(), Math.cos(a) * 1.55, { ry: a, jit: 0.1 }); }
    for (let i = 0; i < 12; i++) sph(B, 0.17, S.roofSnow ? '#d8e4ec' : '#6a8a3a', (B.r() - 0.5) * 0.9, 1.75 - B.r() * 0.5, 1.56, { sy: 1.7, ao: false });
    B.pop();
    // canopy masses (fill top of frame)
    const leaves = S.leaf;
    for (let i = 0; i < 16; i++) { const a = (i / 16) * PI * 2, rr = 2.2 + B.r() * 3.2; const cr = 1.6 + B.r() * 1.1; B.add(jit(new THREE.IcosahedronGeometry(cr, 2), cr * 0.15, i * 3), leaves[i % leaves.length], { x: -1.5 + Math.cos(a) * rr * 1.5, y: 7.4 + Math.sin(a * 2) * 0.8 + B.r(), z: -3.8 + Math.sin(a) * rr * 0.5, blob: new THREE.Vector3(-Math.cos(a) * rr, -1, -Math.sin(a) * rr * 0.5), blobK: 0.8, ao: false, jit: 0.08 }); }
    // lowest branch (dynamic: droops when asleep)
    ctx.obj.branch = part(ctx, (P) => { cyl(P, 0.2, 0.36, 4.0, bark, 0, 2.0, 0, { seg: 8 }); for (let i = 0; i < 4; i++) P.add(jit(new THREE.IcosahedronGeometry(0.7, 1), 0.1, i), leaves[i % leaves.length], { x: (P.r() - 0.5) * 0.8, y: 3.6 + P.r() * 0.6, z: (P.r() - 0.5) * 0.8, blob: true, ao: false }); });
    ctx.obj.branch.position.set(-0.2, 3.0, -2.8); ctx.obj.branch.rotation.z = -1.2;
    // face
    ctx.obj.face = new THREE.Group(); ctx.obj.face.position.set(-1.5, 0, -3.6 + 1.52); ctx.world.add(ctx.obj.face);
    const F = (fn) => { const g = part(ctx, fn); ctx.world.remove(g); ctx.obj.face.add(g); return g; };
    ctx.obj.eyes = []; for (const sx of [-1, 1]) { const e = F((P) => { sph(P, 0.24, '#f0e6c8', 0, 0, 0, { sz: 0.4, ao: false }); sph(P, 0.11, '#2a1a10', 0, 0, 0.09, { sz: 0.4, ao: false }); }); e.position.set(sx * 0.55, 3.0, 0.12); ctx.obj.eyes.push(e); }
    ctx.obj.lids = []; for (const sx of [-1, 1]) { const l = F((P) => { P.add(new THREE.SphereGeometry(0.27, 12, 8, 0, PI * 2, 0, PI / 2), bark, { sz: 0.5, ao: false }); }); l.position.set(sx * 0.55, 3.0, 0.13); ctx.obj.lids.push(l); }
    for (const sx of [-1, 1]) { const b = F((P) => box(P, 0.62, 0.16, 0.2, '#4a3626', 0, 0, 0, { rz: sx * -0.25 })); b.position.set(sx * 0.58, 3.38, 0.16); }
    F((P) => sph(P, 0.22, '#5a4030', 0, 0, 0, { sz: 0.7, sy: 1.3 })).position.set(0, 2.62, 0.25);
    ctx.obj.mouth = F((P) => { box(P, 1.1, 0.24, 0.14, '#1a100a', 0, 0, 0, { ao: false }); }); ctx.obj.mouth.position.set(0, 2.2, 0.14);
    // knothole + Bloom Stone
    B.push(-1.5, 0, -3.6, 0); B.add(new THREE.CircleGeometry(0.32, 14), '#1a120a', { x: 0.9, y: 4.6, z: 1.28, ry: 0.45, ao: false, mat: 'glow' }); B.pop();
    ctx.obj.bloom = part(ctx, (P) => sph(P, 0.16, '#5aff6a', 0, 0, 0, { mat: 'glow', ws: 8, hs: 6 }));
    ctx.obj.bloom.position.set(-0.62, 4.6, -2.36);
    ctx.obj.bloomGlow = glowCard(ctx, '#5aff7a', 1.6, -0.6, 4.6, -2.2, 0.55);
    // brambles (dynamic) blocking east
    ctx.obj.brambles = part(ctx, (P) => {
      for (let i = 0; i < 40; i++) { const x = 6.4 + (P.r() - 0.5) * 3.4, z = -1.5 + (P.r() - 0.5) * 4.6, r = 0.4 + P.r() * 0.6; tor(P, r, 0.05, '#4a3a22', x, r * 0.9, z, { rx: P.r() * 3, ry: P.r() * 3, ts: 12, rs: 4 }); }
      for (let i = 0; i < 26; i++) ico(P, 0.35 + P.r() * 0.3, S.leaf[i % S.leaf.length] === undefined ? '#3a5a2a' : new THREE.Color(S.dark).getStyle(), 6.2 + (P.r() - 0.5) * 3.2, 0.4 + P.r() * 1.4, -1.5 + (P.r() - 0.5) * 4.4, { ao: false, detail: 0 });
      for (let i = 0; i < 30; i++) cone(P, 0.03, 0.14, '#c8b890', 6.2 + (P.r() - 0.5) * 3.2, 0.4 + P.r() * 1.8, -1.5 + (P.r() - 0.5) * 4.4, { rx: P.r() * 3, rz: P.r() * 3, seg: 3 });
      for (let i = 0; i < 10; i++) sph(P, 0.06, '#3a1a3a', 6.2 + (P.r() - 0.5) * 3.2, 0.6 + P.r() * 1.2, 0.4 + (P.r() - 0.5) * 1.2, { ws: 5, hs: 4 });
    });
    ctx.obj.bell = part(ctx, (P) => { P.add(new THREE.ConeGeometry(0.1, 0.16, 10, 1, true), '#e8c050', { mat: 'paintDS' }); sph(P, 0.03, '#a8741a', 0, -0.08, 0); });
    ctx.obj.bell.position.set(5.0, 0.7, 0.4);
    // surroundings
    tree(B, -10.4, 3.6, { s: 2.0, h: 2.8 }); tree(B, 10.6, 4.4, { s: 1.8 }); pine(B, 9.6, -6, { s: 1.7 }); pine(B, -9.6, -5.4, { s: 1.7 }); tree(B, 4.6, -7.4, { s: 1.7, h: 3.2 }); tree(B, -6.6, -8, { s: 1.8 });
    forestBack(ctx, -12, 16, 34);
    const fc = ridgeCard({ seed: 12, layers: [{ y: 0.55, amp: 0.25, f: 0.012, ph: 3, c1: new THREE.Color(S.leaf[2]).lerp(new THREE.Color(S.sky.horizon), 0.55).getStyle(), c2: new THREE.Color(S.dark).lerp(new THREE.Color(S.sky.horizon), 0.4).getStyle(), trees: 2, tr: 16, tall: 1.6 }] });
    ctx.world.add(card(fc, 90, 22, 0, 6, -26, { order: -1 }));
    for (let i = 0; i < 26; i++) { const x = (B.r() - 0.5) * 18, z = -5 + B.r() * 10; if (Math.abs(x) < 7.4 && z > -2.4) continue; if (x > 4 && z > -4) continue; B.r() < 0.5 ? grass(B, x, z) : bush(B, x, z, { s: 0.4 + B.r() * 0.3 }); }
    for (let i = 0; i < 8; i++) { mushroom(B, -4 + B.r() * 5, -1.6 - B.r() * 1.6, { s: 0.2, cap: '#c89a3a' }); }
    for (let i = 0; i < 6; i++) fern(B, (B.r() - 0.5) * 14, 4 + B.r());
    rays(ctx, '#fff2c8', [[2.6, 4.4, -2.0, 2.4, 9.5, -0.3, 0.16], [-4.2, 4.4, -2.5, 1.8, 9, -0.3, 0.12]]);
    ctx.light(0, [-0.6, 4.6, -1.6], '#6aff7a', 2.2, 5); ctx.light(1, [0, 0, 0], '#ffffff', 0, 1);
    ctx.fireflies([-8, 0.4, -5, 8, 3, 4], 14); ctx.weather([-10, 0, -9, 10, 9, 6], 0.7);
    return {
      apply(s) {
        const asleep = s.f.oakAsleep; ctx.asleep = asleep;
        ctx.obj.branchT = asleep ? -0.35 : -1.2;
        ctx.obj.bloom.visible = ctx.obj.bloomGlow.visible = !s.f.bloomTaken; ctx.lightI[0] = s.f.bloomTaken ? 0 : 2.2;
        ctx.obj.bramblesT = s.f.bramblesGone ? 0.001 : 1; ctx.obj.bell.visible = !s.f.bellTaken;
        ctx.setWalk(s.f.bramblesGone ? 'walkOpen' : 'walk');
      },
      update(dt, t) {
        const br = ctx.obj.branch; br.rotation.z += ((ctx.obj.branchT ?? -1.2) - br.rotation.z) * (1 - Math.exp(-dt * 1.5));
        const bs = ctx.obj.brambles; const tgt = ctx.obj.bramblesT ?? 1; const sc = bs.scale.y + (tgt - bs.scale.y) * (1 - Math.exp(-dt * 1.2)); bs.scale.set(1, sc, 1); bs.visible = sc > 0.02;
        const lid = ctx.asleep ? 1 : (Math.sin(t * 0.7) > 0.985 ? 1 : 0.02);
        for (const l of ctx.obj.lids) { l.scale.y += (lid - l.scale.y) * 0.3; l.rotation.x = -0.2; }
        const talking = ctx.speaking === 'oak';
        ctx.obj.mouth.scale.y = talking ? 1 + Math.abs(Math.sin(t * 12)) * 2.2 : ctx.asleep ? 0.6 + Math.sin(t * 1.2) * 0.4 : 1;
        ctx.obj.face.rotation.z = Math.sin(t * 0.5) * 0.01;
        if (ctx.asleep && Math.random() < dt * 0.8) ctx.PA.spawn({ x: -1.2, y: 2.6, z: -1.8, vx: 0.3, vy: 0.4, size: 0.25, life: 2.2, color: '#f4f0ff', a: 0.6, sway: 0.2 });
        ctx.obj.bloom.position.y = 4.6 + Math.sin(t * 2) * 0.03;
      },
    };
  },
  hot: {
    grumbleroot: { p: [-1.5, 2.6, -2.4], s: [2.8, 2.6, 1.2], walk: [-1.0, -0.4], face: [-1.5, -2.0] },
    knothole: { p: [-0.6, 4.6, -2.3], s: [0.8, 0.8, 0.6], walk: [0.2, -0.9], pri: 4 },
    brambles: { p: [6.4, 1.0, -1.5], s: [3.4, 2.2, 4.6], walk: [4.4, -0.8] },
    bell: { p: [5.0, 0.7, 0.4], s: [0.6, 0.6, 0.6], walk: [4.4, 0.8], pri: 4 },
    roots: { p: [-1.5, 0.4, -1.8], s: [4.6, 0.8, 1.4], walk: [-2.4, -0.4] },
  },
  exits: {
    west: { p: [-9.4, 1.2, 1.0], s: [1.4, 2.6, 3.0], walk: [-8.3, 1.0], dir: 'left' },
    east: { p: [8.6, 1.2, -1.4], s: [1.4, 2.6, 3.0], walk: [7.4, -1.4], dir: 'right' },
  },
  npcs: {},
};

// ------------------------------------------------------------------ 8. LIGHTHOUSE POINT (sea cliffs)
function seaAndHorizon(ctx, y = -6, o = {}) {
  ctx.obj.sea = waterPlane(ctx, 400, 300, 0, y, -140, { deep: o.deep ?? '#2a5a7a', shallow: o.shallow ?? '#5a98b0', flow: [0.25, 0.15], scale: 0.35, speed: 0.3 });
}
SCENE_DEFS.cliffs = {
  cam: { pos: [0, 4.4, 14.2], look: [0, 2.2, -1.5], fov: 38, drift: 0.12, halfW: 8.5 },
  env: () => ({ sky: { ...S.sky, cloudAmt: 0.65, sunDir: [0.75, 0.3, -0.6] }, fog: [S.sky.horizon, 45, 260], hemi: [S.hemiSky, S.hemiGround, 0.85], key: { pos: [9, 10, 4], col: S.key, I: 2.4 }, rim: { pos: [-8, 6, -10], col: '#a0d0ff', I: 1.1 }, amb: 0.15 }),
  ground: { W: 34, D: 26, cx: 0, cz: -3, hf: (x, z) => { const edge = 5.6 + z * 0.35; return x > edge ? -Math.min(9, (x - edge) * 2.2 + (x - edge) ** 2 * 0.6) : Math.sin(x * 0.3) * 0.12 + (z < -7 ? (-7 - z) * 0.25 : 0); }, paint: () => ({
    pal: pal(), seed: 29, flowers: 520,
    paths: [{ pts: [[-13, 2.0], [-6, 1.4], [-2.0, -0.4], [-3.4, -2.6]], w: 1.6, col: S.dirt, col2: S.dirt2 }, { pts: [[-2.0, -0.4], [2, 1.4], [5.4, 3.0], [7.4, 4.4]], w: 1.4, col: S.dirt, col2: S.dirt2 }],
    patches: [{ x: 8, z: 0, r: 4, sz: 2, col: '#8a8070', n: 500 }],
  }) },
  walk: [[-8.6, 0.6], [-6.2, -1.6], [-3.0, -2.6], [0.6, -3.4], [3.6, -3.0], [4.6, -1.0], [5.2, 1.0], [5.6, 2.4], [6.6, 3.4], [7.0, 4.8], [-8.6, 4.8]],
  holes: [oct(-4.8, -5.6, 1.2, 10), rect(2.8, -2.2, 3.6, -1.4), oct(0.9, -2.4, 0.42, 6)],
  spawn: { start: [-7.6, 2.0, PI / 2], west: [-7.6, 2.0, PI / 2], cove: [6.8, 4.0, -PI * 0.8], map: [-7.6, 2.0, PI / 2] },
  build(ctx) {
    const B = ctx.B;
    seaAndHorizon(ctx, -9);
    // cliff faces falling away (right) + far headlands
    cliffMass(B, 12, -6, -2, 6, 6, 9, { top: S.grass, side: '#a89a86', low: '#7a6e62' });
    cliffMass(B, 10, -8, 8, 6, 5, 6, { top: S.grass, side: '#a89a86', low: '#7a6e62' });
    cliffMass(B, -30, -10, -60, 30, 14, 12, { top: S.grass, side: '#9a8e80', low: '#6e6458' });
    cliffMass(B, 40, -12, -90, 18, 10, 10, { top: S.grass, side: '#9a8e80', low: '#6e6458' });
    for (let i = 0; i < 10; i++) rock(B, 8 + B.r() * 6, -6 + B.r() * 10, { s: 0.6 + B.r(), y: -9, col: '#7a6e62' });
    // lighthouse
    B.push(-4.8, 0, -5.6, 0, 0.74);
    box(B, 3.0, 0.6, 3.0, '#a89e90', 0, 0.3, 0, { jit: 0.1 });
    const prof = [[1.25, 0], [1.05, 7.0], [1.1, 7.0]];
    B.add(new THREE.CylinderGeometry(1.0, 1.3, 7.6, 20, 6), '#ffffff', { y: 4.2, jit: 0.03, aoH: 2.5, colors: (P, col) => { for (let i = 0; i < P.count; i++) { const yy = P.getY(i); if (Math.floor((yy - 0.4) / 1.5) % 2 === 1) { col[i * 3] *= 0.85; col[i * 3 + 1] *= 0.22; col[i * 3 + 2] *= 0.2; } } } });
    cyl(B, 1.45, 1.45, 0.25, '#3a3a40', 0, 8.1, 0, { seg: 20 }); for (let i = 0; i < 16; i++) { const a = (i / 16) * PI * 2; cyl(B, 0.025, 0.025, 0.6, '#3a3a40', Math.cos(a) * 1.4, 8.5, Math.sin(a) * 1.4, { seg: 3 }); }
    cyl(B, 0.82, 0.82, 1.3, '#bfe0ff', 0, 8.9, 0, { seg: 16, mat: 'glow', open: true }); cone(B, 1.05, 1.0, '#c8302e', 0, 10.05, 0, { seg: 16 }); sph(B, 0.15, '#3a3a40', 0, 10.6, 0);
    box(B, 0.8, 1.5, 0.1, '#5a3a22', 0, 1.35, 1.28, { ry: 0 });
    for (const y of [3.2, 5.6]) box(B, 0.35, 0.55, 0.1, '#ffd890', 0.2, y, 1.12, { mat: 'glow' });
    B.pop();
    ctx.obj.lamp = part(ctx, (P) => sph(P, 0.42, '#ffe8a0', 0, 0, 0, { mat: 'glow' }));
    ctx.obj.lamp.position.set(-4.8, 6.59, -5.6); ctx.obj.lamp.scale.setScalar(0.74);
    ctx.obj.beam = new THREE.Group(); ctx.obj.beam.position.set(-4.8, 6.59, -5.6); ctx.world.add(ctx.obj.beam);
    const bt = softCard('#fff2c0', 128, 256, 'ray');
    for (const a of [0, PI]) { const c = card(bt, 4, 40, 0, 0, 0, { add: true, fog: false, opacity: 0.35, order: 7 }); c.rotation.set(PI / 2, 0, a + PI / 2); c.position.set(Math.cos(a) * 20, 0, Math.sin(a) * 20); ctx.obj.beam.add(c); }
    ctx.obj.lampHalo = glowCard(ctx, '#ffe8a0', 4, -4.8, 6.59, -5.2, 0.7);
    // keeper's cottage (behind, left)
    cottage(B, -9.2, -5.4, 0.5, { w: 2.8, d: 2.4, roof: '#3a5a8a', plaster: '#f4f0e8' });
    // telescope
    B.push(3.2, 0, -1.8, -0.6); for (let i = 0; i < 3; i++) { const a = (i / 3) * PI * 2; cyl(B, 0.03, 0.03, 1.5, '#5a3a22', Math.cos(a) * 0.3, 0.7, Math.sin(a) * 0.3, { rz: Math.cos(a) * 0.35, rx: -Math.sin(a) * 0.35, seg: 4 }); } cyl(B, 0.08, 0.12, 1.2, '#c8a050', 0, 1.6, 0.2, { rx: -1.2, seg: 10 }); B.pop();
    // fence along the cliff, flowers (sea pinks), rocks
    fence(B, [[3.9, -4.4], [5.0, -1.2], [5.9, 1.4], [6.4, 3.0]], { col: '#9a8a70' });
    for (let z = -12; z < 6; z += 0.55) { const ex = 5.6 + z * 0.35; rock(B, ex + 0.25 + B.r() * 0.4, z, { s: 0.35 + B.r() * 0.35, y: -0.45, col: '#9a8e80' }); if (B.r() < 0.7) grass(B, ex - 0.1, z + 0.2, { n: 5 }); }
    for (let i = 0; i < 16; i++) flowers(B, -8 + B.r() * 12, -3 + B.r() * 7.6, { n: 4, r: 0.4, cols: S.roofSnow ? S.flowers : ['#f4a8c8', '#ffffff', '#f8d0e0'] });
    for (let i = 0; i < 14; i++) grass(B, -8 + B.r() * 13, -4 + B.r() * 8.6, { n: 5 });
    rock(B, -1.2, -4.4, { s: 0.6 }); rock(B, 1.6, 4.2, { s: 0.4 }); rock(B, -6.4, 3.8, { s: 0.5 });
    bush(B, -8.6, -1.6, { s: 0.6, flowers: true }); tree(B, -10.8, 3.4, { s: 1.6, h: 2.4 }); pine(B, -12, -2, { s: 1.6 });
    // fog bank hiding the isle + the isle itself
    ctx.obj.isle = part(ctx, (P) => { cliffMass(P, 0, 0, 0, 7, 3, 4, { top: '#7a8a6a', side: '#8a8078', low: '#5a5450', grassLine: 0.7 }); cyl(P, 1.0, 1.3, 9, '#a89e90', 0.6, 6, 0, { seg: 10 }); P.add(new THREE.SphereGeometry(2.0, 12, 6, 0, PI * 2, 0, PI / 2), '#5a3a22', { x: 0.6, y: 10.5, sy: 0.6 }); for (let i = 0; i < 6; i++) sph(P, 0.3, '#ffe080', 0.6 + Math.cos(i) * 1.4, 11.1, Math.sin(i) * 1.0, { mat: 'glow' }); });
    ctx.obj.isle.position.set(26, -9, -120);
    const fogT = fogCard('#f2ede6');
    ctx.obj.fog = []; for (const [x, y, z, w, h] of [[20, -2, -100, 120, 26], [-10, -3, -90, 110, 22], [40, 0, -130, 140, 34]]) { const c = card(fogT, w, h, x, y, z, { opacity: 0.95, fog: false, order: 2 }); ctx.world.add(c); ctx.obj.fog.push(c); }
    ctx.gulls(6, [-8, 4, -12, 12, 10, -2]);
    ctx.light(0, [-4.8, 6.6, -4.6], '#ffe8a0', 0, 22); ctx.light(1, [-4.8, 1.6, -4.0], '#ffcc80', 0.8, 5);
    ctx.weather([-10, 0, -9, 10, 9, 6], 0.6);
    return {
      apply(s) {
        const lit = !!s.f.lampLit; ctx.lit = lit; ctx.obj.beam.visible = lit; ctx.obj.lampHalo.visible = lit;
        ctx.obj.lamp.scale.setScalar(lit ? 0.74 : 0.45); ctx.lightI[0] = lit ? 6 : 0;
        ctx.fogT = lit ? 0 : 1; ctx.obj.isle.visible = lit || ctx.obj.fog[0].material.opacity < 0.9;
        ctx.lampFixed = !!s.f.lampFixed;
      },
      update(dt, t) {
        if (ctx.lit || ctx.lampFixed) ctx.obj.beam.rotation.y += dt * 0.6;
        for (const c of ctx.obj.fog) { c.material.opacity += ((ctx.fogT ?? 1) * 0.95 - c.material.opacity) * (1 - Math.exp(-dt * 0.8)); c.visible = c.material.opacity > 0.01; c.position.x += Math.sin(t * 0.05) * dt * 0.5; }
        ctx.obj.isle.visible = ctx.obj.fog[0].material.opacity < 0.85;
        ctx.flicker(0, ctx.lightI[0], t);
      },
    };
  },
  hot: {
    lighthouse: { p: [-4.8, 3.5, -5.6], s: [2.6, 7.4, 2.6], walk: [-3.8, -2.5] },
    telescope: { p: [3.2, 1.3, -1.8], s: [1.0, 2.2, 1.0], walk: [2.4, -1.2] },
    fog: { p: [10, 1, -60], s: [120, 30, 4], walk: [4.2, -2.4] },
    cottage: { p: [-9.2, 2.2, -5.4], s: [3.2, 4.4, 3.0], walk: [-6.8, -1.4] },
    edge: { p: [7.0, 0.0, -0.2], s: [2.4, 1.0, 6.0], walk: [5.2, 0.2] },
    gulls: { p: [2, 7.5, -7], s: [16, 5, 4], walk: [2, -2] },
  },
  exits: {
    west: { p: [-9.4, 1.2, 2.0], s: [1.4, 2.6, 3.0], walk: [-8.3, 2.0], dir: 'left' },
    cove: { p: [7.6, 0.8, 4.8], s: [2.6, 2.0, 1.6], walk: [7.0, 4.4], dir: 'down' },
  },
  npcs: { marlow: { at: [0.9, -2.4], face: -0.2, walk: [0.9, -1.2], make: () => makeHuman({ name: 'marlow', skin: '#e6b090', hair: '#e8e8e8', hat: 'souwester', beard: '#f4f4f0', top: '#2e4a7a', bottom: '#3a3a44', boots: '#1e1e24', scarf: '#c8a040', scale: 1.02, girth: 1.1, rig: {} }) } },
};

// ------------------------------------------------------------------ 9. SMUGGLER'S COVE
SCENE_DEFS.cove = {
  cam: { pos: [0, 4.2, 14.0], look: [0, 1.6, -1.5], fov: 38, drift: 0.12, halfW: 8.5 },
  env: () => ({ sky: { ...S.sky, cloudAmt: 0.55, sunDir: [0.6, 0.28, -0.75] }, fog: [S.sky.horizon, 30, 170], hemi: [S.hemiSky, '#c8b090', 0.9], key: { pos: [9, 9, 6], col: S.key, I: 2.5 }, rim: { pos: [-6, 6, -10], col: '#a0d4ff', I: 1.1 }, amb: 0.15 }),
  ground: { W: 34, D: 26, cx: 0, cz: -3, hf: (x, z) => (z < -3.6 ? Math.max(-0.6, (z + 3.6) * 0.22) : 0) + (x < -7.8 ? (-7.8 - x) * 0.3 : 0), paint: () => ({
    pal: { base: S.roofSnow ? '#e8e4de' : '#e2cc9a', base2: S.roofSnow ? '#f4f2ee' : '#ecd8aa', dark: '#c8ae7a', light: '#f4e4c0', flowers: ['#ffffff'] }, seed: 31, flowers: 30,
    patches: [{ x: 0, z: -4.6, r: 16, sz: 0.08, col: '#b89a6a', n: 900, a: 0.55 }, { x: -1.5, z: 1.5, r: 1.2, sz: 0.6, col: '#8a8070', n: 200 }],
    extra: (g, X, Y, ux, uz, r) => { for (let i = 0; i < 40; i++) dab(g, X(-10 + r() * 20), Y(-4.2 + r() * 0.6), 6 + r() * 14, 1.5, 0, 'rgba(255,255,255,0.7)', 0.6); for (let i = 0; i < 120; i++) dab(g, X(-10 + r() * 20), Y(-3 + r() * 8), 1.5, 1.5, 0, r() < 0.5 ? '#f4ece0' : '#c8b8a0', 0.8); },
  }) },
  walk: [[-7.6, 1.6], [-5.6, -1.6], [-3.2, -3.0], [5.4, -3.2], [7.6, -2.0], [7.6, 4.8], [-7.2, 4.8]],
  holes: [rect(1.4, -3.2, 3.9, 1.0), oct(-1.5, 1.5, 0.75, 8), oct(-3.4, 2.4, 0.7, 7)],
  spawn: { start: [-6.8, 3.0, PI / 2], path: [-6.8, 3.0, PI / 2], boat: [0.6, -1.6, PI], map: [-6.8, 3.0, PI / 2] },
  build(ctx) {
    const B = ctx.B;
    seaAndHorizon(ctx, -0.55, { deep: '#2a6a8a', shallow: '#6ab4c4' });
    ctx.obj.sea.position.z = -150; ctx.obj.sea.scale.set(1, 1, 1);
    // breaking foam line (animated card)
    const foam = paintCanvas(1024, 64, (g) => { const r = RNG(3); for (let i = 0; i < 300; i++) dab(g, r() * 1024, 32 + (r() - 0.5) * 30, 6 + r() * 20, 2 + r() * 4, 0, '#ffffff', 0.5); });
    ctx.obj.foam = card(foam, 40, 1.2, 0, -0.5, -6.0, { opacity: 0.85, rx: -PI / 2, order: 3 }); ctx.world.add(ctx.obj.foam);
    // cliffs (left) + sea cave + right headland
    cliffMass(B, -11, 2, -3, 5, 7, 8, { top: S.grass, side: '#a89a88', low: '#7a6e62', grassLine: 0.88 });
    cliffMass(B, -8.6, 1, -8.6, 6, 7, 5, { top: S.grass, side: '#b0a290', low: '#7a6e62', grassLine: 0.86 });
    B.add(new THREE.SphereGeometry(1.4, 14, 10, 0, PI, 0, PI / 2), '#140e0c', { x: -6.2, y: 0, z: -5.6, ry: 0.4, mat: 'glow', ao: false, sz: 0.6 });
    cliffMass(B, 13, 0, -4, 5, 6, 5, { top: S.grass, side: '#a89a88', low: '#7a6e62' });
    cliffMass(B, 20, -2, -30, 8, 6, 6, { top: S.grass, side: '#9a8e80', low: '#6e6458' });
    for (let i = 0; i < 14; i++) rock(B, -7 + B.r() * 4, -2 + B.r() * 6, { s: 0.3 + B.r() * 0.5, col: '#9a8e80' });
    for (let i = 0; i < 6; i++) rock(B, 5 + B.r() * 4, -4.4 + B.r() * 2, { s: 0.4 + B.r() * 0.4, col: '#8a8074', y: -0.3 });
    // boat (dynamic patch)
    B.push(2.6, 0.32, -1.1, 0.25);
    B.push(0, 0, 0, 0, 1, 0, 0.18);
    B.add(new THREE.SphereGeometry(1.0, 20, 12), '#8a5a34', { y: -0.3, sx: 0.95, sy: 0.62, sz: 2.0, jit: 0.06, aoBase: -0.6 });
    B.add(new THREE.CircleGeometry(0.9, 20), '#4a2e1c', { y: 0.2, rx: -PI / 2, sz: 1, sy: 2.0, ao: false });
    tor(B, 0.93, 0.07, '#6a4228', 0, 0.24, 0, { rx: PI / 2, ts: 24, sy: 2.0 });
    for (let i = 0; i < 5; i++) tor(B, 0.95, 0.015, '#6a4228', 0, -0.05 - i * 0.09, 0, { rx: PI / 2, ts: 24, sy: 2.0, sx: 1 - i * 0.03 });
    for (const z of [-0.7, 0.4]) box(B, 1.6, 0.08, 0.3, '#a8784a', 0, 0.3, z);
    B.add(new THREE.CircleGeometry(0.16, 12), '#140c08', { x: 0.92, y: 0.0, z: 0.5, ry: PI / 2, mat: 'glow', ao: false });
    B.pop(); B.pop();
    box(B, 0.14, 0.06, 2.6, '#a8784a', 4.6, 0.04, -0.4, { ry: 0.6 }); box(B, 0.14, 0.06, 2.4, '#a8784a', 4.9, 0.04, -0.2, { ry: 0.7 });
    ctx.obj.patch = part(ctx, (P) => sph(P, 0.18, '#e8a83a', 0, 0, 0, { sz: 0.4, mat: 'glow' }));
    ctx.obj.patch.position.set(3.55, 0.35, -0.75); ctx.obj.patch.rotation.y = 0.25 + PI / 2;
    // crab rock + tidepool + driftwood
    rock(B, -3.4, 2.4, { s: 0.6, col: '#8a8074' });
    ctx.obj.tide = waterDisc(ctx, 0.75, -1.5, 0.04, 1.5, { scale: 3 });
    for (let i = 0; i < 8; i++) rock(B, -1.5 + Math.cos(i) * 0.85, 1.5 + Math.sin(i) * 0.7, { s: 0.16, col: '#8a8074' });
    sph(B, 0.07, '#e86a3a', -1.3, 0.06, 1.6, { sy: 0.3 }); sph(B, 0.09, '#d84aa8', -1.8, 0.06, 1.3, { sy: 0.5 });
    B.push(-4.6, 0, -0.4, 0.4); cyl(B, 0.12, 0.18, 2.8, '#c8c0b0', 0, 0.12, 0, { rz: PI / 2, seg: 7, jit: 0.1 }); cyl(B, 0.06, 0.09, 1.0, '#c8c0b0', 0.6, 0.3, 0.3, { rz: 0.9, seg: 5 }); B.pop();
    for (let i = 0; i < 10; i++) sph(B, 0.06, ['#f4ece0', '#e8c8b0', '#c8d8e8'][i % 3], -6 + B.r() * 12, 0.03, -2 + B.r() * 6, { sy: 0.4, ws: 6, hs: 4 });
    // isle on the horizon (visible when the light is lit)
    ctx.obj.isle = part(ctx, (P) => { cliffMass(P, 0, 0, 0, 7, 3, 4, { top: '#7a8a6a', side: '#8a8078', low: '#5a5450', grassLine: 0.7 }); cyl(P, 1.0, 1.3, 9, '#a89e90', 0.6, 6, 0, { seg: 10 }); P.add(new THREE.SphereGeometry(2.0, 12, 6, 0, PI * 2, 0, PI / 2), '#5a3a22', { x: 0.6, y: 10.5, sy: 0.6 }); });
    ctx.obj.isle.position.set(-22, -1, -120);
    const fogT = fogCard('#f2ede6'); ctx.obj.fog = [card(fogT, 140, 26, -10, 4, -110, { opacity: 0.95, fog: false, order: 2 })]; ctx.world.add(ctx.obj.fog[0]);
    ctx.animal('crab', 'crab', [-3.4, 2.6], { y: 0.72, face: 0.3 });
    ctx.obj.pin = part(ctx, (P) => { sph(P, 0.06, '#ffffff', 0, 0, 0, { mat: 'glow' }); }); ctx.obj.pin.position.set(-3.1, 0.95, 2.85);
    ctx.gulls(5, [-8, 3, -10, 10, 8, -2]);
    ctx.light(0, [0, 0, 0], '#ffffff', 0, 1); ctx.light(1, [0, 0, 0], '#ffffff', 0, 1);
    ctx.weather([-10, 0, -9, 10, 8, 6], 0.5);
    return {
      apply(s) { ctx.obj.patch.visible = !!s.f.boatPatched; ctx.obj.pin.visible = !s.f.hairpinTaken; ctx.fogT = s.f.lampLit ? 0 : 1; },
      update(dt, t) {
        ctx.obj.foam.position.z = -6.0 + Math.sin(t * 0.8) * 0.3; ctx.obj.foam.material.opacity = 0.6 + Math.sin(t * 0.8) * 0.3;
        const f = ctx.obj.fog[0]; f.material.opacity += ((ctx.fogT ?? 1) * 0.95 - f.material.opacity) * (1 - Math.exp(-dt)); ctx.obj.isle.visible = f.material.opacity < 0.85;
      },
    };
  },
  hot: {
    boat: { p: [2.6, 0.5, -1.1], s: [2.4, 1.2, 4.2], walk: [0.9, 0.4] },
    crab: { p: [-3.4, 0.95, 2.6], s: [1.0, 0.8, 1.0], walk: [-2.6, 3.6], pri: 3 },
    tidepool: { p: [-1.5, 0.1, 1.5], s: [1.8, 0.4, 1.6], walk: [-1.2, 2.8] },
    cave: { p: [-6.2, 0.8, -5.6], s: [2.6, 1.8, 1.2], walk: [-4.8, -2.4] },
    driftwood: { p: [-4.6, 0.3, -0.4], s: [3.0, 0.8, 1.2], walk: [-4.2, 0.6] },
    sea: { p: [0, -0.2, -30], s: [60, 1.4, 50], walk: [0.6, -2.6] },
  },
  exits: { path: { p: [-8.2, 1.6, 3.2], s: [1.6, 3.0, 2.4], walk: [-7.2, 3.2], dir: 'left' } },
  npcs: {},
};

// ------------------------------------------------------------------ 10. MAGPIE ISLE (the nest)
SCENE_DEFS.isle = {
  cam: { pos: [0, 5.0, 14.0], look: [0, 2.4, -1.5], fov: 40, drift: 0.14, halfW: 8.5 },
  env: () => ({ sky: { zenith: '#3a3a7a', mid: '#c87a8a', horizon: '#ffc080', cloudLit: '#ffd8a8', cloudShade: '#8a6a9a', sunCol: '#ffb070', rimCol: '#ffb880', cloudAmt: 0.7, sunDir: [0.6, 0.12, -0.8] }, fog: ['#f0a888', 30, 170], hemi: ['#ffc8b0', '#5a3a4a', 0.85], key: { pos: [10, 6, -4], col: '#ffc890', I: 2.6 }, rim: { pos: [-8, 5, -10], col: '#b0a0ff', I: 1.3 }, amb: 0.17 }),
  ground: { W: 30, D: 22, cx: 0, cz: -2, hf: (x, z) => { const d = Math.hypot(x / 1.2, z + 1.2); return d > 8.2 ? -12 : d > 7.4 ? -(d - 7.4) * 6 : 0; }, paint: () => ({
    pal: { base: '#7a5a3a', base2: '#9a7448', dark: '#4a3422', light: '#b89060', flowers: ['#ffe080', '#e8eef4'] }, seed: 37, flowers: 220, strokes: 22000,
    extra: (g, X, Y, ux, uz, r) => { g.lineCap = 'round'; for (let i = 0; i < 2600; i++) { const x = r() * 1024, y = r() * 1024, a = r() * PI, l = 6 + r() * 22; g.strokeStyle = jitterColor(['#8a6a42', '#5a4028', '#a8845a', '#6a4a2a'][i % 4], 0.1, r); g.lineWidth = 1.5 + r() * 2.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); } },
  }) },
  walk: oct(0, -1.2, 6.6, 18, 1.15).filter(([x, z]) => z < 5.2),
  holes: [oct(3.2, -2.8, 1.6, 10, 1.2), oct(-3.2, -4.2, 1.0, 8)],
  spawn: { start: [5.6, 1.6, -PI * 0.7], boat: [5.6, 1.6, -PI * 0.7], map: [5.6, 1.6, -PI * 0.7] },
  build(ctx) {
    const B = ctx.B;
    seaAndHorizon(ctx, -12, { deep: '#3a4a7a', shallow: '#c88a8a' });
    // nest rim of sticks
    for (let i = 0; i < 140; i++) { const a = (i / 140) * PI * 2 + B.r() * 0.1, rr = 7.6 + B.r() * 1.0; const x = Math.cos(a) * rr * 1.15, z = -1.2 + Math.sin(a) * rr; if (z > 5.5 && Math.abs(x) < 6) continue; cyl(B, 0.06, 0.08, 2.4 + B.r() * 1.6, ['#6a4a2a', '#8a6438', '#5a3a22'][i % 3], x, 0.2 + B.r() * 0.5, z, { rz: PI / 2 + (B.r() - 0.5) * 0.6, ry: -a + PI / 2 + (B.r() - 0.5) * 0.8, seg: 4 }); }
    // tower body below the nest (seen at the edges) and the island rock far below
    B.add(jit(new THREE.CylinderGeometry(7.2, 5.5, 12, 18, 4, true), 0.2, 5), '#a89e90', { y: -6.2, z: -1.2, sx: 1.15, mat: 'paintDS', jit: 0.1 });
    cliffMass(B, 0, -16, -1, 16, 6, 12, { top: '#7a8a6a', side: '#8a8078', low: '#5a5450', grassLine: 0.75 });
    // spire (Corvin's perch)
    B.push(-3.2, 0, -4.2, 0.3);
    B.add(jit(new THREE.CylinderGeometry(0.5, 0.95, 4.2, 9, 3), 0.08, 1), '#b8ae9e', { y: 2.1, jit: 0.1 });
    for (let i = 0; i < 5; i++) box(B, 0.5, 0.35, 0.3, '#a89e90', Math.cos(i * 1.3) * 0.5, 4.3 + (i % 2) * 0.2, Math.sin(i * 1.3) * 0.5, { ry: i });
    B.pop();
    // hoard: glittering pile (dynamic sparkles)
    B.push(3.2, 0, -2.8, 0);
    B.add(jit(new THREE.SphereGeometry(1.5, 16, 10, 0, PI * 2, 0, PI / 2), 0.12, 4), '#c89a3a', { sx: 1.2, sy: 0.55, jit: 0.2 });
    for (let i = 0; i < 70; i++) { const a = B.r() * PI * 2, rr = Math.sqrt(B.r()) * 1.5; const h = Math.sqrt(Math.max(0, 1 - (rr / 1.5) ** 2)) * 0.82; const kind = i % 5; const x = Math.cos(a) * rr * 1.2, z = Math.sin(a) * rr;
      if (kind === 0) box(B, 0.35, 0.03, 0.08, '#e8eef4', x, h + 0.04, z, { ry: B.r() * 3, mat: 'glow' }); else if (kind === 1) cyl(B, 0.09, 0.09, 0.02, '#ffd060', x, h + 0.03, z, { rx: B.r(), seg: 8, mat: 'glow' }); else if (kind === 2) sph(B, 0.08, ['#ff6a8a', '#8ad8ff', '#a8ff8a'][i % 3], x, h + 0.05, z, { mat: 'glow', ws: 6, hs: 4 }); else if (kind === 3) B.add(new THREE.ConeGeometry(0.08, 0.12, 8, 1, true), '#e8c050', { x, y: h + 0.06, z, mat: 'paintDS' }); else box(B, 0.12, 0.12, 0.12, '#c8ccd4', x, h + 0.06, z, { ry: B.r() }); }
    box(B, 0.5, 0.06, 0.08, '#d8a83a', 0.4, 0.82, 0.3, { ry: 0.6 }); cyl(B, 0.04, 0.04, 0.3, '#d8a83a', 0.62, 0.92, 0.44, { seg: 5 }); // the well's crank handle
    B.pop();
    ctx.obj.tideStone = part(ctx, (P) => sph(P, 0.14, '#4ac0ff', 0, 0, 0, { mat: 'glow', ws: 8, hs: 6 }));
    ctx.obj.tideGlow = glowCard(ctx, '#5ac8ff', 1.4, 0, 0, 0, 0.6);
    ctx.obj.mirror = part(ctx, (P) => { box(P, 0.06, 0.7, 0.05, '#c89a3a', 0, 0.35, 0); B; P.add(new THREE.CircleGeometry(0.28, 16), '#bfe0f4', { y: 0.95, mat: 'glow' }); tor(P, 0.28, 0.04, '#d8a83a', 0, 0.95, 0, { ts: 16, rs: 4 }); });
    ctx.obj.mirror.position.set(1.0, 0, -0.4); ctx.obj.mirror.rotation.y = -0.6;
    // boat moored below (seen past the rim) + ladder
    B.push(7.6, -1, 2.6, -0.5); for (let i = 0; i < 6; i++) box(B, 0.7, 0.06, 0.08, '#8a6238', 0, 0.3 + i * 0.35, 0); for (const sx of [-1, 1]) cyl(B, 0.02, 0.02, 2.4, '#c8b48a', sx * 0.33, 1.2, 0, { seg: 3 }); B.pop();
    ctx.gulls(5, [-10, 2, -14, 12, 9, -2]);
    ctx.light(0, [3.2, 1.6, -2.0], '#ffd080', 1.6, 6); ctx.light(1, [-3.2, 4.6, -3.6], '#7ad0ff', 0, 6);
    for (let i = 0; i < 18; i++) ctx.PA.spawn({ x: 3.2 + (Math.random() - 0.5) * 3, y: 0.4 + Math.random() * 0.6, z: -2.8 + (Math.random() - 0.5) * 2.4, size: 0.08, life: 0.6 + Math.random(), color: '#fff2b0', a: 1, loop: (q) => { q.t = 0; q.life = 0.5 + Math.random(); q.x = 3.2 + (Math.random() - 0.5) * 3; q.y = 0.4 + Math.random() * 0.6; q.z = -2.8 + (Math.random() - 0.5) * 2.4; } });
    return {
      apply(s) {
        const down = !!s.f.corvinDistracted; ctx.down = down; ctx.obj.mirror.visible = down;
        const st = ctx.obj.tideStone, gl = ctx.obj.tideGlow;
        st.visible = gl.visible = !s.f.tideTaken;
        if (down) { st.position.set(3.0, 1.0, -2.4); } else { st.position.set(-3.2, 4.6, -3.6); }
        gl.position.copy(st.position); gl.position.z += 0.2;
        ctx.lightI[1] = s.f.tideTaken ? 0 : 1.8; ctx.light(1, [st.position.x, st.position.y, st.position.z + 0.6], '#7ad0ff', ctx.lightI[1], 6);
        const c = ctx.actors.corvin; if (c) { if (down) { c.root.position.set(1.9, 0, -0.9); c.faceTarget = c.face = 0.9; } else { c.root.position.set(-3.2, 4.25, -4.1); c.faceTarget = c.face = 0.15; } }
      },
      update(dt, t) { if (!ctx.down) { const c = ctx.actors.corvin; if (c) c.root.position.y = 4.25 + Math.max(0, Math.sin(t * 1.3)) * 0.04; } ctx.obj.tideStone.rotation.y = t; },
    };
  },
  hot: {
    hoard: { p: [3.2, 0.5, -2.8], s: [3.8, 1.2, 3.2], walk: [2.6, -0.6] },
    spire: { p: [-3.2, 2.2, -4.2], s: [1.6, 4.4, 1.6], walk: [-2.2, -2.4] },
    edge: { p: [-3.0, 0.2, 5.2], s: [6, 0.8, 1.4], walk: [-2.6, 3.8] },
  },
  exits: { boat: { p: [7.6, 0.8, 2.6], s: [1.6, 2.4, 1.6], walk: [6.0, 1.6], dir: 'right' } },
  npcs: { corvin: { at: [-3.2, -4.1], y: 4.25, face: 0.15, walk: [-1.8, -1.8], hot: { p: [-3.2, 5.2, -4.1], s: [1.8, 2.2, 1.6] }, make: () => makeMagpie({ name: 'corvin', rig: {} }) } },
};
