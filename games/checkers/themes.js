// Checkers: Event Horizon — themes. Everything procedural: canvas-painted boards/frames, lathe-turned
// pieces with TSL surface detail (positionGeometry, because r187 InstanceNode rewrites positionLocal),
// per-theme backgrounds (scene.backgroundNode) and set dressing.
import { THREE, canvasTexture, spaceBackground } from '/shared/sd-kit.js';
import {
  Fn, uniform, positionGeometry, positionWorld, positionWorldDirection, length, vec2, vec3, vec4, float, sin, cos, atan,
  mix, smoothstep, step, mx_noise_float, mx_fractal_noise_float, time, color, normalView, positionViewDirection, dot, abs,
  pow, max, min, clamp, fract, floor, uv, texture, instancedBufferAttribute, bumpMap, TWO_PI, exp, normalWorld,
} from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const ss = (a, b, x) => (a < b ? smoothstep(a, b, x) : float(1).sub(smoothstep(b, a, x))); // reversed edges are UB in WGSL

// ---------------------------------------------------------------- palettes
export const THEMES = {
  classic: {
    label: 'Classic', blurb: 'Hand-turned walnut & lacquer on a parlour table',
    colors: { light: '#e2c08f', dark: '#5e3720', red: '#b0242c', black: '#2b201b', accent: '#ffcf6a' },
    sideNames: ['Crimson', 'Ebony'], exposure: 0.9, env: 0.28,
    bloom: { strength: 0.25, radius: 0.4, threshold: 0.95 },
    lights: { sky: 0xffe6c4, ground: 0x1a1008, hemi: 0.28, key: 0xffdcaa, keyI: 2.5, rim: 0x9ab8ff, rimI: 0.7, amb: 0.04 },
    dust: { color: 0xffd9a0, opacity: 0.35 }, piece: 'turned', boardMetal: 0.0, boardRough: 0.42, emissive: 0,
  },
  space: {
    label: 'Space', blurb: 'A hull-plate board adrift in a nebula; saucers for men',
    colors: { light: '#33405e', dark: '#0d1324', red: '#ff7a3d', black: '#3fc2ff', accent: '#b48cff' },
    sideNames: ['Solar', 'Nebula'], exposure: 1.0, env: 0.35,
    bloom: { strength: 0.6, radius: 0.5, threshold: 0.78 },
    lights: { sky: 0x9fb4ff, ground: 0x0a0614, hemi: 0.35, key: 0xf2f4ff, keyI: 2.5, rim: 0xb48cff, rimI: 1.1, amb: 0.06 },
    dust: { color: 0xc8d8ff, opacity: 0.4 }, piece: 'saucer', boardMetal: 0.55, boardRough: 0.34, emissive: 1.6,
  },
  fantasy: {
    label: 'Fantasy', blurb: 'A rune-carved altar stone; round war-shields',
    colors: { light: '#8f8878', dark: '#3d3a34', red: '#a9302a', black: '#2c5c8c', accent: '#6dffc8' },
    sideNames: ['Ember', 'Frost'], exposure: 1.0, env: 0.3,
    bloom: { strength: 0.55, radius: 0.45, threshold: 0.8 },
    lights: { sky: 0x9ab8ff, ground: 0x140e0a, hemi: 0.22, key: 0xc8d8ff, keyI: 1.7, rim: 0x7affd0, rimI: 0.7, amb: 0.04 },
    dust: { color: 0xffa050, opacity: 0.55 }, piece: 'shield', boardMetal: 0.0, boardRough: 0.8, emissive: 1.2,
  },
  neon: {
    label: 'Neon', blurb: 'Synthwave grid, holographic pucks',
    colors: { light: '#1d1238', dark: '#07050f', red: '#ff2fd2', black: '#1ee8ff', accent: '#ffe14a' },
    sideNames: ['Magenta', 'Cyan'], exposure: 1.0, env: 0.2,
    bloom: { strength: 0.6, radius: 0.5, threshold: 0.78 },
    lights: { sky: 0xd090ff, ground: 0x10021a, hemi: 0.45, key: 0xffe0f6, keyI: 1.9, rim: 0x30e8ff, rimI: 2.2, amb: 0.08 },
    dust: { color: 0x7ff6ff, opacity: 0.5 }, piece: 'puck', boardMetal: 0.2, boardRough: 0.25, emissive: 1.6,
  },
};
export const COLORBLIND = { red: '#e69f00', black: '#1f6fd1' }; // Okabe-Ito orange / blue

// ---------------------------------------------------------------- tiny JS noise for canvas painting
const hash2 = (x, y, s = 0) => { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 2147483647); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function vnoise(x, y, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, y, o = 4, s = 0) => { let t = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { t += a * vnoise(x * f, y * f, s + i * 17); f *= 2.03; a *= 0.5; } return t; };
const srgb = (c) => { const k = new THREE.Color(); k.setStyle(c, THREE.SRGBColorSpace); return [k.r, k.g, k.b]; };

function pixels(ctx, w, h, fn) {
  const img = ctx.createImageData(w, h), d = img.data, out = [0, 0, 0];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    fn(x, y, out); const i = (y * w + x) * 4;
    d[i] = out[0] * 255; d[i + 1] = out[1] * 255; d[i + 2] = out[2] * 255; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

// ---------------------------------------------------------------- board surface painters (1024², 128 px per square)
// Each returns { map (sRGB), aux (linear: R=height, G=roughness, B=emissive mask) }.
const BW = 1024, SQ = 128;
const lerp = (a, b, t) => a + (b - a) * t;

function paintBoard(theme, colors, map, aux) {
  const L = srgb(colors.light), D = srgb(colors.dark), A = srgb(colors.accent);
  const R = srgb(colors.red), B = srgb(colors.black);
  const mctx = map.getContext('2d'), actx = aux.getContext('2d');
  const auxImg = actx.createImageData(BW, BW), ad = auxImg.data;
  const setAux = (x, y, h, r, e) => { const i = (y * BW + x) * 4; ad[i] = h * 255; ad[i + 1] = r * 255; ad[i + 2] = e * 255; ad[i + 3] = 255; };

  pixels(mctx, BW, BW, (x, y, o) => {
    const c = (x / SQ) | 0, r = (y / SQ) | 0, dark = ((r + c) & 1) === 1;
    const lx = x - c * SQ, ly = y - r * SQ, edge = Math.min(lx, ly, SQ - 1 - lx, SQ - 1 - ly);
    const base = dark ? D : L, seed = r * 8 + c;
    let lum = 1, h = 0.5, rough = 0.5, em = 0, tint = null;
    if (theme === 'classic') {
      // marquetry: grain direction alternates per square, each square cut from a different board
      const along = dark ? y : x, across = dark ? x : y;
      const warp = fbm(along * 0.004 + seed, across * 0.02, 3, seed) * 30;
      const g = Math.sin((across + warp) * 0.33 + seed * 1.7) * 0.5 + 0.5;
      const fig = fbm(along * 0.01, across * 0.09, 3, seed + 5);
      lum = 0.8 + 0.13 * g * g + 0.16 * (fig - 0.5) + (hash2(x, y) - 0.5) * 0.04;
      h = 0.5 + 0.18 * g;
      rough = dark ? 0.32 : 0.42;
      if (edge < 2) { lum *= 0.45; h = 0.2; } // routed seam
    } else if (theme === 'space') {
      const n = fbm(x * 0.5, y * 0.012, 2, seed) - 0.5; // brushed metal
      lum = 1 + n * 0.25;
      rough = dark ? 0.28 : 0.42;
      h = 0.55;
      if (edge < 10 && edge >= 4) { lum *= dark ? 1.35 : 1.18; h = 0.75 - (10 - edge) * 0.03; } // raised bevel
      if (edge < 4) { lum *= 0.25; h = 0.1; em = edge >= 1 && edge <= 2 ? 1 : 0; } // seam with light strip
      for (const [cx, cy] of [[16, 16], [SQ - 17, 16], [16, SQ - 17], [SQ - 17, SQ - 17]]) { // rivets
        const dd = Math.hypot(lx - cx, ly - cy); if (dd < 4.5) { lum *= 1.5 - dd * 0.08; h = 0.85 - dd * 0.06; }
      }
      if (!dark) { // hex mesh on light panels
        const hx = lx / 14, hy = ly / 12.1, row = Math.floor(hy), off = (row & 1) * 0.5;
        const fx = (hx + off) % 1, fy = hy % 1;
        if (fx < 0.08 || fy < 0.1) { lum *= 0.82; h -= 0.08; }
      }
    } else if (theme === 'fantasy') {
      const wob = (fbm(x * 0.05, y * 0.05, 3, 3) - 0.5) * 9;
      const e = edge + wob;
      const n = fbm(x * 0.03 + seed, y * 0.03, 5, seed);
      const speck = hash2(x, y, 7) > 0.985 ? 0.75 : 1;
      const crack = Math.abs(fbm(x * 0.02, y * 0.02, 4, seed + 11) - 0.5) < 0.012 ? 0.55 : 1;
      lum = (0.72 + 0.5 * n) * speck * crack;
      h = 0.35 + 0.5 * n - (crack < 1 ? 0.25 : 0);
      rough = 0.85;
      if (e < 6) { const m = Math.max(0, e) / 6; lum *= 0.35 + 0.4 * m; h = 0.08 + m * 0.3; tint = [0.18, 0.24, 0.14]; } // mossy mortar
    } else { // neon
      const g8 = (lx % 16 === 0 || ly % 16 === 0) ? 1 : 0;
      lum = 1 + g8 * (dark ? 0.9 : 0.25) + (((y >> 1) & 1) ? 0.04 : 0);
      rough = 0.2; h = 0.5;
      if (edge < 2) { lum = 0.6; em = 0.8; tint = [0.42, 0.22, 1.0]; h = 0.6; }
      const corner = (lx < 22 || lx > SQ - 23) && (ly < 22 || ly > SQ - 23) && (edge >= 5 && edge <= 7);
      if (corner && dark) { em = 0.9; tint = (r < 4 ? B : R); }
    }
    let rr = base[0] * lum, gg = base[1] * lum, bb = base[2] * lum;
    if (tint && !em) { rr = lerp(rr, tint[0], 0.6); gg = lerp(gg, tint[1], 0.6); bb = lerp(bb, tint[2], 0.6); }
    o[0] = Math.min(1, Math.pow(rr, 1 / 2.2)); o[1] = Math.min(1, Math.pow(gg, 1 / 2.2)); o[2] = Math.min(1, Math.pow(bb, 1 / 2.2));
    setAux(x, y, Math.max(0, Math.min(1, h)), rough, em);
    if (em && tint) { o[0] = Math.pow(tint[0], 1 / 2.2); o[1] = Math.pow(tint[1], 1 / 2.2); o[2] = Math.pow(tint[2], 1 / 2.2); }
    else if (em) { o[0] = Math.pow(A[0], 1 / 2.2); o[1] = Math.pow(A[1], 1 / 2.2); o[2] = Math.pow(A[2], 1 / 2.2); }
  });
  actx.putImageData(auxImg, 0, 0);

  if (theme === 'fantasy') { // carved runes on some dark squares: dark in the map, low in height, lit in emissive
    const glyphs = ['M 0 -14 L 0 14 M 0 -14 L 10 -4', 'M -9 -14 L -9 14 M -9 -2 L 9 -14 M -9 -2 L 9 14', 'M 0 -14 L 0 14 M -10 -6 L 10 6 M -10 6 L 10 -6', 'M -10 14 L 0 -14 L 10 14 M -6 4 L 6 4', 'M -8 -14 L 8 -14 L -8 14 L 8 14', 'M 0 -14 L 0 14 M 0 -14 L 10 -6 L 0 2'];
    let k = 0;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      if (((r + c) & 1) === 0 || hash2(r, c, 91) < 0.55) continue;
      const g = new Path2D(glyphs[k++ % glyphs.length]);
      for (const [ctx, style, wdt] of [[mctx, 'rgba(10,14,12,0.75)', 4], [actx, 'rgb(40,180,255)', 4]]) {
        ctx.save(); ctx.translate(c * SQ + SQ / 2, r * SQ + SQ / 2); ctx.scale(1.6, 1.6);
        ctx.strokeStyle = style; ctx.lineWidth = wdt; ctx.lineCap = 'round'; ctx.stroke(g); ctx.restore();
      }
    }
  }
  if (theme === 'classic') { // thin brass stringing around the playing field
    mctx.strokeStyle = 'rgba(230,190,110,0.8)'; mctx.lineWidth = 3; mctx.strokeRect(2, 2, BW - 4, BW - 4);
  }
}

// Frame: one canvas laid over the whole 9.4×9.4 frame top (shape space), with a–h / 1–8 notation.
export const FRAME = 9.4;
function paintFrame(theme, colors, canvas) {
  const W = 1024, PU = W / FRAME, off = (FRAME - 8) / 2 * PU;
  const A = colors.accent;
  const ctx = canvas.getContext('2d');
  {
    const D = srgb(theme === 'classic' ? '#4a1f12' : theme === 'space' ? '#1a2133' : theme === 'fantasy' ? '#57524a' : '#0b0716');
    pixels(ctx, W, W, (x, y, o) => {
      let lum = 1;
      if (theme === 'classic') { const g = Math.sin((y + fbm(x * 0.004, y * 0.03, 3) * 40) * 0.25) * 0.5 + 0.5; lum = 0.75 + 0.3 * g * g + (fbm(x * 0.01, y * 0.1, 3) - 0.5) * 0.3; }
      else if (theme === 'space') { lum = 0.85 + (fbm(x * 0.6, y * 0.01, 2) - 0.5) * 0.3; if ((x + y) % 64 < 32 && (x < 70 || x > W - 70) && (y < 70 || y > W - 70)) lum = 2.6; }
      else if (theme === 'fantasy') { lum = 0.6 + fbm(x * 0.03, y * 0.03, 5) * 0.7; const bx = x % 128, by = y % 96; if (bx < 4 || by < 4) lum *= 0.4; }
      else { lum = 0.8 + (((y >> 2) & 1) ? 0.1 : 0); }
      o[0] = Math.min(1, Math.pow(D[0] * lum, 1 / 2.2)); o[1] = Math.min(1, Math.pow(D[1] * lum, 1 / 2.2)); o[2] = Math.min(1, Math.pow(D[2] * lum, 1 / 2.2));
    });
    const ink = theme === 'classic' ? '#f0d9a0' : theme === 'fantasy' ? '#bfffe8' : A;
    ctx.fillStyle = ink; ctx.strokeStyle = ink;
    ctx.globalAlpha = theme === 'fantasy' ? 0.85 : 0.9;
    ctx.lineWidth = 3; ctx.strokeRect(off - 9, off - 9, 8 * PU + 18, 8 * PU + 18); // stringing line
    ctx.font = `600 ${Math.round(PU * 0.32)}px ${theme === 'fantasy' || theme === 'classic' ? 'Georgia, serif' : 'monospace'}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < 8; i++) {
      const p = off + (i + 0.5) * PU;
      ctx.fillText('abcdefgh'[i], p, W - off / 2); ctx.fillText(String(8 - i), off / 2, p);
      ctx.save(); ctx.translate(p, off / 2); ctx.rotate(Math.PI); ctx.fillText('abcdefgh'[i], 0, 0); ctx.restore();
      ctx.save(); ctx.translate(W - off / 2, p); ctx.rotate(Math.PI); ctx.fillText(String(8 - i), 0, 0); ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------- board meshes (base, lensing surface, frame)
// Lensing: up to 3 hole uniforms (xy = uv centre, z = live strength 0..1, w = telegraph swirl 0..1).
export function createBoard(scene, U) {
  const group = new THREE.Group(); scene.add(group);
  const holes = [0, 1, 2].map(() => uniform(new THREE.Vector4(0.5, 0.5, 0, 0)));
  const mk = (srgbTex) => { const c = document.createElement('canvas'); c.width = c.height = BW; const t = new THREE.CanvasTexture(c); t.anisotropy = 8; if (srgbTex) t.colorSpace = THREE.SRGBColorSpace; return t; };
  const mapTex = mk(true), auxTex = mk(false), frameTexture = mk(true);
  const mapNode = texture(mapTex), auxNode = texture(auxTex);

  // r: distance in uv; returns vec4(uv', darkness, ring)
  const lens = Fn(() => {
    const p = uv().toVar(), dark = float(1).toVar(), ring = float(0).toVar();
    for (const h of holes) {
      const d = p.sub(h.xy).toVar();
      const r = max(length(d), float(0.0004)).toVar();
      const s = h.z, w = h.w;
      const Re = s.mul(0.052);
      const defl = min(Re.mul(Re).div(r), float(0.09)).mul(ss(0.32, 0.0, r));
      const ang = s.mul(2.4).mul(ss(0.2, 0.0, r)).add(w.mul(1.4).mul(ss(0.11, 0.0, r)));
      const cs = cos(ang), sn = sin(ang);
      const rd = vec2(d.x.mul(cs).sub(d.y.mul(sn)), d.x.mul(sn).add(d.y.mul(cs)));
      p.assign(h.xy.add(rd).add(rd.div(r).mul(defl)));
      dark.mulAssign(mix(float(1), smoothstep(0.026, 0.075, r).mul(0.92).add(0.08), s));
      dark.mulAssign(mix(float(1), smoothstep(0.0, 0.055, r).mul(0.6).add(0.4), w));
      ring.addAssign(s.mul(exp(r.sub(0.05).div(0.006).pow(2).negate())));
    }
    return vec4(p, dark, ring);
  })();
  const luv = lens.xy;
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.5, metalness: 0 });
  const aux = auxNode.sample(luv);
  mat.colorNode = mapNode.sample(luv).rgb.mul(lens.z);
  mat.roughnessNode = aux.g.mul(U.boardRough.div(0.5)).clamp(0.05, 1);
  mat.metalnessNode = U.boardMetal;
  mat.normalNode = bumpMap(aux.r, U.bump);
  mat.emissiveNode = mapNode.sample(luv).rgb.mul(aux.b).mul(U.boardEmissive).mul(lens.z)
    .add(vec3(1.0, 0.5, 0.2).mul(lens.w).mul(1.1));
  const surf = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), mat);
  surf.rotation.x = -Math.PI / 2; surf.receiveShadow = true; group.add(surf);

  const baseMat = new THREE.MeshStandardNodeMaterial({ color: 0x1a120c, roughness: 0.7 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(8.04, 0.38, 8.04), baseMat);
  base.position.y = -0.2; group.add(base);

  // frame: rounded square ring extruded and laid flat; planar UVs in shape space
  const o = FRAME / 2, hi = 4.03, rad = 0.35;
  const sh = new THREE.Shape();
  sh.moveTo(-o + rad, -o); sh.lineTo(o - rad, -o); sh.quadraticCurveTo(o, -o, o, -o + rad); sh.lineTo(o, o - rad);
  sh.quadraticCurveTo(o, o, o - rad, o); sh.lineTo(-o + rad, o); sh.quadraticCurveTo(-o, o, -o, o - rad); sh.lineTo(-o, -o + rad); sh.quadraticCurveTo(-o, -o, -o + rad, -o);
  const hole = new THREE.Path(); hole.moveTo(-hi, -hi); hole.lineTo(-hi, hi); hole.lineTo(hi, hi); hole.lineTo(hi, -hi); hole.lineTo(-hi, -hi);
  sh.holes.push(hole);
  const fg = new THREE.ExtrudeGeometry(sh, { depth: 0.42, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 3, curveSegments: 6 });
  const pos = fg.attributes.position, uvs = fg.attributes.uv;
  for (let i = 0; i < pos.count; i++) uvs.setXY(i, (pos.getX(i) + o) / FRAME, (pos.getY(i) + o) / FRAME);
  fg.rotateX(-Math.PI / 2); fg.translate(0, -0.37, 0); fg.computeVertexNormals();
  const frameTex = texture(frameTexture);
  const fmat = new THREE.MeshStandardNodeMaterial({ roughness: 0.45, metalness: 0 });
  fmat.colorNode = frameTex.rgb;
  fmat.roughnessNode = U.frameRough; fmat.metalnessNode = U.frameMetal;
  // notation glows in the sci-fi themes (ink colour ≈ accent)
  fmat.emissiveNode = frameTex.rgb.mul(smoothstep(0.55, 0.9, frameTex.rgb.dot(vec3(0.33)))).mul(U.frameGlow);
  const frame = new THREE.Mesh(fg, fmat); frame.castShadow = true; frame.receiveShadow = true; group.add(frame);

  return {
    group, surf, frame, holes, mat,
    paint(theme, colors) {
      paintBoard(theme, colors, mapTex.image, auxTex.image); mapTex.needsUpdate = true; auxTex.needsUpdate = true;
      paintFrame(theme, colors, frameTexture.image); frameTexture.needsUpdate = true;
    },
  };
}

// ---------------------------------------------------------------- piece geometry (lathes) + TSL materials
function lathe(profile, segs, knurl = null) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segs);
  if (knurl) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), r = Math.hypot(x, z);
      if (y >= knurl.y0 && y <= knurl.y1 && r > knurl.r) {
        const a = Math.atan2(x, z), nr = r + knurl.amp * Math.cos(a * knurl.n);
        p.setXYZ(i, x / r * nr, y, z / r * nr);
      }
    }
    g.computeVertexNormals();
  }
  return g;
}

function crownGeometry() {
  const band = new THREE.CylinderGeometry(0.17, 0.15, 0.1, 80, 1, true);
  const p = band.attributes.position;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) > 0) { const a = Math.atan2(p.getX(i), p.getZ(i)); p.setY(i, 0.05 + 0.075 * Math.pow(Math.abs(Math.cos(a * 2.5)), 6)); }
  }
  band.computeVertexNormals(); band.translate(0, 0.05, 0);
  const parts = [band];
  const ring = new THREE.TorusGeometry(0.158, 0.02, 8, 48); ring.rotateX(Math.PI / 2); ring.translate(0, 0.012, 0); parts.push(ring);
  for (let k = 0; k < 5; k++) { const a = k * TWO_PI_JS / 5; const s = new THREE.SphereGeometry(0.022, 10, 8); s.translate(Math.sin(a) * 0.168, 0.18, Math.cos(a) * 0.168); parts.push(s); }
  const orb = new THREE.SphereGeometry(0.05, 14, 10); orb.translate(0, 0.07, 0); parts.push(orb);
  const cap = new THREE.CircleGeometry(0.15, 32); cap.rotateX(-Math.PI / 2); cap.translate(0, 0.004, 0); parts.push(cap);
  return mergeGeometries(parts.map((g) => g.toNonIndexed()));
}
const TWO_PI_JS = Math.PI * 2;

// Per-theme piece kit: body geometry, topper (king marker) geometry, dimensions.
export function pieceKit(kind) {
  if (kind === 'turned') {
    const prof = [[0, 0], [0.3, 0], [0.37, 0.004], [0.392, 0.014], [0.4, 0.03], [0.4, 0.04], [0.4, 0.11], [0.4, 0.12], [0.394, 0.136], [0.38, 0.146], [0.36, 0.15],
      [0.342, 0.15], [0.338, 0.144], [0.334, 0.141], [0.33, 0.141], [0.305, 0.141], [0.3, 0.144], [0.296, 0.15], [0.15, 0.152], [0.07, 0.149], [0, 0.147]];
    return { body: lathe(prof, 120, { y0: 0.039, y1: 0.111, r: 0.395, n: 40, amp: 0.011 }), topper: crownGeometry(), H: 0.15, stack: 0.15, topperY: 0.302, topperSpin: 0 };
  }
  if (kind === 'saucer') {
    const prof = [[0, 0], [0.16, 0.004], [0.26, 0.022], [0.35, 0.05], [0.415, 0.074], [0.425, 0.085], [0.418, 0.097], [0.36, 0.116], [0.26, 0.13], [0.19, 0.136],
      [0.18, 0.142], [0.172, 0.165], [0.145, 0.192], [0.09, 0.212], [0, 0.222]];
    const halo = new THREE.TorusGeometry(0.3, 0.022, 10, 64); halo.rotateX(Math.PI / 2);
    return { body: lathe(prof, 64), topper: halo, H: 0.2, stack: 0.17, topperY: 0.5, topperSpin: 1.3, topperBob: 0.03 };
  }
  if (kind === 'shield') {
    const prof = [[0, 0], [0.38, 0], [0.41, 0.01], [0.42, 0.028], [0.42, 0.058], [0.41, 0.074], [0.395, 0.08], [0.377, 0.075], [0.37, 0.064], [0.3, 0.06], [0.2, 0.058],
      [0.128, 0.058], [0.121, 0.066], [0.11, 0.09], [0.08, 0.114], [0.04, 0.127], [0, 0.131]];
    return { body: lathe(prof, 72), topper: crownGeometry(), H: 0.08, stack: 0.085, topperY: 0.22, topperSpin: 0 };
  }
  // neon puck
  const prof = [[0, 0], [0.37, 0], [0.4, 0.025], [0.4, 0.115], [0.37, 0.14], [0.3, 0.14], [0.0, 0.14]];
  const r1 = new THREE.TorusGeometry(0.3, 0.012, 8, 64); r1.rotateX(Math.PI / 2);
  const r2 = new THREE.TorusGeometry(0.22, 0.012, 8, 64); r2.rotateX(Math.PI / 2); r2.translate(0, 0.08, 0);
  return { body: lathe(prof, 64), topper: mergeGeometries([r1, r2]), H: 0.14, stack: 0.145, topperY: 0.36, topperSpin: -1.6, topperBob: 0.025 };
}

// sideColor / accent / trim: color uniforms. glow: per-instance float node.
export function pieceMaterial(kind, sideColor, U, glow) {
  const pg = positionGeometry, r = length(pg.xz), y = pg.y;
  const fres = pow(float(1).sub(abs(dot(normalView, positionViewDirection))), 3);
  // selection / forced-capture pulse: mostly a fresnel rim so the piece keeps its own colour
  const hi = U.accent.mul(glow).mul(fres.mul(1.6).add(0.12));
  if (kind === 'turned') {
    const m = new THREE.MeshPhysicalNodeMaterial({ roughness: 0.45, clearcoat: 0.45, clearcoatRoughness: 0.22 });
    const top = smoothstep(0.125, 0.138, y);
    const inlay = top.mul(step(0.299, r)).mul(step(r, 0.337)).mul(step(y, 0.1446));
    const gn = mx_noise_float(pg.mul(7.0));
    const rings = sin(r.mul(105).add(gn.mul(4))).mul(0.5).add(0.5);
    const fiber = mx_noise_float(pg.mul(vec3(38, 5, 38)));
    const lum = rings.mul(0.09).add(0.88).add(fiber.mul(0.06));
    const body = sideColor.mul(lum).mul(mix(float(0.78), float(1), top));
    m.colorNode = mix(body, U.trim.mul(float(0.92).add(fiber.mul(0.08))), inlay);
    m.roughnessNode = mix(float(0.36), float(0.55), inlay);
    m.emissiveNode = hi;
    return m;
  }
  if (kind === 'saucer') {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.3, metalness: 0.7 });
    const rim = step(0.4, r).mul(step(0.07, y)).mul(step(y, 0.101));
    const dome = step(0.139, y).mul(step(r, 0.184));
    const under = step(y, 0.012).mul(step(0.1, r)).mul(step(r, 0.15));
    const ang = atan(pg.z, pg.x);
    const chase = pow(sin(ang.mul(10).sub(time.mul(5))).mul(0.5).add(0.5), 3);
    const seam = smoothstep(0.035, 0.0, abs(fract(ang.mul(8 / (Math.PI * 2))).sub(0.5)).sub(0.46).max(0)).mul(step(0.19, r));
    const hull = mix(sideColor.mul(0.85), vec3(0.6, 0.63, 0.7), 0.18).mul(float(1).sub(seam.mul(0.5)));
    m.colorNode = mix(mix(hull, vec3(0.03), rim), vec3(0.02, 0.03, 0.06), dome);
    m.roughnessNode = mix(float(0.32), float(0.06), dome);
    m.metalnessNode = mix(float(0.45), float(0.0), max(dome, rim));
    m.emissiveNode = sideColor.mul(rim.mul(chase.mul(3.0).add(0.7))).add(sideColor.mul(under.mul(3.5)))
      .add(U.accent.mul(dome.mul(fres.mul(1.5).add(0.25)))).add(hi.mul(1.2));
    return m;
  }
  if (kind === 'shield') {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.6, metalness: 0 });
    const rim = step(0.366, r), boss = step(r, 0.126);
    const metal = max(rim, boss);
    const plank = floor(pg.x.add(0.5).mul(7));
    const pl = fract(sin(plank.mul(12.9898)).mul(43758.5453));
    const grain = mx_noise_float(vec3(pg.x.mul(50), pg.z.mul(5), plank));
    const seamL = smoothstep(0.02, 0.0, abs(fract(pg.x.add(0.5).mul(7)).sub(0.5)).sub(0.47).max(0));
    const wood = vec3(0.32, 0.2, 0.11).mul(pl.mul(0.3).add(0.75).add(grain.mul(0.12))).mul(float(1).sub(seamL.mul(0.6)));
    const ang = atan(pg.z, pg.x);
    const quarter = step(0, sin(ang.mul(2)));
    const paint = sideColor.mul(float(0.85).add(grain.mul(0.08)));
    const face = mix(wood, paint, quarter.mul(0.92));
    const rivet = step(0.93, cos(ang.mul(12))).mul(step(abs(r.sub(0.392)), 0.012));
    const iron = mix(vec3(0.42, 0.37, 0.3), vec3(0.75, 0.68, 0.5), rivet);
    m.colorNode = mix(face, iron, metal);
    m.metalnessNode = metal.mul(0.85);
    m.roughnessNode = mix(float(0.72), float(0.34), metal);
    const rune = smoothstep(0.008, 0.0, abs(r.sub(0.33))).mul(step(0.5, fract(ang.mul(24 / (Math.PI * 2)))));
    m.emissiveNode = U.accent.mul(rune.mul(0.55)).add(hi.mul(1.1));
    return m;
  }
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.14, metalness: 0.25 });
  const topEdge = step(0.365, r).mul(step(0.112, y));
  const botEdge = step(y, 0.028).mul(step(0.365, r));
  const topFace = step(0.139, y);
  const holo = pow(sin(r.mul(70).sub(time.mul(3.5))).mul(0.5).add(0.5), 8);
  const scan = pow(sin(y.mul(260).add(time.mul(6))).mul(0.5).add(0.5), 10).mul(step(0.03, y)).mul(step(y, 0.11));
  m.colorNode = sideColor.mul(0.12);
  m.emissiveNode = sideColor.mul(topEdge.add(botEdge).mul(3.2))
    .add(sideColor.mul(topFace.mul(holo.mul(0.7).add(0.1))))
    .add(sideColor.mul(scan.mul(0.6))).add(sideColor.mul(fres.mul(0.55))).add(hi.mul(1.3));
  return m;
}

export function topperMaterial(kind, U) {
  const pg = positionGeometry;
  if (kind === 'turned' || kind === 'shield') {
    const m = new THREE.MeshStandardNodeMaterial({ metalness: 1, roughness: 0.26, side: THREE.DoubleSide });
    const gem = step(0.155, pg.y).add(step(length(pg.sub(vec3(0, 0.07, 0))), 0.052)).min(1);
    const gold = kind === 'turned' ? vec3(1.0, 0.76, 0.33) : vec3(0.78, 0.6, 0.42);
    const gemCol = kind === 'turned' ? vec3(0.8, 0.05, 0.12) : U.accent;
    m.colorNode = mix(gold, gemCol, gem);
    m.metalnessNode = mix(float(1), float(0.2), gem);
    m.roughnessNode = mix(float(0.25), float(0.08), gem);
    m.emissiveNode = gemCol.mul(gem.mul(kind === 'turned' ? 0.6 : 1.6));
    return m;
  }
  const m = new THREE.MeshBasicNodeMaterial();
  m.colorNode = U.accent.mul(kind === 'saucer' ? 3.2 : 3.6);
  return m;
}

// ---------------------------------------------------------------- backgrounds + set dressing
export function createBackdrops(scene, U) {
  const props = {};
  // Classic: walnut parlour table that dissolves into a warm dark room.
  {
    const g = new THREE.Group();
    const tableTex = canvasTexture(512, 512, (ctx, w, h) => pixels(ctx, w, h, (x, y, o) => {
      const gg = Math.sin((y + fbm(x * 0.006, y * 0.04, 3) * 50) * 0.18) * 0.5 + 0.5;
      const l = 0.7 + 0.3 * gg * gg + (fbm(x * 0.02, y * 0.2, 2) - 0.5) * 0.3;
      o[0] = 0.24 * l; o[1] = 0.13 * l; o[2] = 0.075 * l;
    }), { repeat: [6, 6] });
    const tm = new THREE.MeshStandardNodeMaterial({ roughness: 0.55 });
    const fade = smoothstep(6.0, 15.0, length(positionWorld.xz));
    tm.colorNode = mix(texture(tableTex, uv().mul(6)).rgb, vec3(0.012, 0.008, 0.005), fade);
    tm.roughnessNode = float(0.5);
    const table = new THREE.Mesh(new THREE.CircleGeometry(40, 48), tm);
    table.rotation.x = -Math.PI / 2; table.position.y = -0.405; table.receiveShadow = true; g.add(table);
    props.classic = { group: g, bg: Fn(() => {
      const d = positionWorldDirection.normalize();
      const n = mx_noise_float(d.mul(4)).mul(0.012);
      const glow = pow(max(float(0), d.y.mul(-0.4).add(0.55)), 3).mul(0.11);
      return vec3(0.022, 0.013, 0.008).add(vec3(0.42, 0.24, 0.12).mul(glow)).add(n);
    })() };
  }
  // Space: kit nebula + a ringed gas giant far off.
  {
    const g = new THREE.Group();
    const pm = new THREE.MeshBasicNodeMaterial();
    const pg = positionGeometry.normalize();
    const bands = mx_fractal_noise_float(vec3(pg.y.mul(9), pg.x.mul(0.6), pg.z.mul(0.6)), 4, 2.0, 0.5);
    const albedo = mix(vec3(0.42, 0.22, 0.5), vec3(0.85, 0.5, 0.32), sin(pg.y.mul(24).add(bands.mul(6))).mul(0.5).add(0.5));
    const sunDir = vec3(-0.8, 0.35, 0.45).normalize();
    const lit = smoothstep(-0.12, 0.6, dot(normalWorld, sunDir));
    const limb = pow(float(1).sub(abs(dot(normalView, positionViewDirection))), 3);
    pm.colorNode = albedo.mul(lit.mul(0.55).add(0.012)).add(vec3(0.45, 0.3, 1.0).mul(limb).mul(lit.mul(0.8).add(0.08)));
    const planet = new THREE.Mesh(new THREE.SphereGeometry(9, 48, 32), pm);
    planet.position.set(19, -34, -26); planet.rotation.z = 0.35; g.add(planet);
    const rm = new THREE.MeshBasicNodeMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false });
    const rr = length(uv().sub(0.5)).mul(2);
    rm.colorNode = vec3(0.7, 0.56, 0.45).mul(0.35);
    rm.opacityNode = smoothstep(0.62, 0.66, rr).mul(ss(1.0, 0.96, rr)).mul(sin(rr.mul(90)).mul(0.25).add(0.55));
    const ring = new THREE.Mesh(new THREE.RingGeometry(11.6, 18, 96, 1), rm);
    // RingGeometry uv spans ±outer, so re-map: rr<0.64 is inside the inner radius (cut away)
    ring.position.copy(planet.position); ring.rotation.set(-1.25, 0.2, 0.35); g.add(ring);
    props.space = { group: g, bg: null };
  }
  // Fantasy: octagonal altar dais in a misty cavern, two braziers.
  {
    const g = new THREE.Group();
    const sm = new THREE.MeshStandardNodeMaterial({ roughness: 0.92 });
    const n = mx_fractal_noise_float(positionWorld.mul(1.3), 4, 2.0, 0.5);
    sm.colorNode = vec3(0.13, 0.125, 0.12).mul(n.mul(0.5).add(0.7)).mul(ss(13.0, 6.5, length(positionWorld.xz)).mul(0.9).add(0.1));
    const dais = new THREE.Mesh(new THREE.CylinderGeometry(8.2, 9.0, 1.0, 8), sm);
    dais.position.y = -0.905; dais.rotation.y = Math.PI / 8; dais.receiveShadow = true; g.add(dais);
    const step2 = new THREE.Mesh(new THREE.CylinderGeometry(10.5, 11.5, 1.0, 8), sm);
    step2.position.y = -1.9; step2.rotation.y = Math.PI / 8; step2.receiveShadow = true; g.add(step2);
    const bowlGeo = lathe([[0, 0], [0.18, 0], [0.22, 0.55], [0.12, 0.62], [0.16, 0.66], [0.42, 0.8], [0.46, 0.92], [0.4, 0.94], [0.32, 0.86], [0, 0.84]], 24);
    const bm = new THREE.MeshStandardNodeMaterial({ color: 0x2b2622, roughness: 0.6, metalness: 0.5 });
    props.braziers = [];
    for (const [x, z] of [[-6.4, -3.6], [6.4, -3.6]]) {
      const b = new THREE.Mesh(bowlGeo, bm); b.position.set(x, -0.405, z); b.castShadow = true; g.add(b);
      props.braziers.push(new THREE.Vector3(x, 0.55, z));
    }
    props.fantasy = { group: g, bg: Fn(() => {
      const d = positionWorldDirection.normalize();
      const mist = mx_fractal_noise_float(d.mul(2.2).add(vec3(0, time.mul(0.02), 0)), 4, 2.0, 0.5);
      const base = mix(vec3(0.006, 0.012, 0.014), vec3(0.03, 0.06, 0.065), smoothstep(-0.35, 0.25, d.y));
      return base.add(vec3(0.05, 0.12, 0.11).mul(smoothstep(-0.05, 0.45, mist)).mul(0.35));
    })() };
  }
  // Neon: synthwave sky with a striped sun, scrolling grid floor far below.
  {
    const g = new THREE.Group();
    const gm = new THREE.MeshBasicNodeMaterial();
    const wp = positionWorld.xz.add(vec2(0, time.mul(0.6)));
    const cell = abs(fract(wp.mul(0.5)).sub(0.5));
    const line = smoothstep(0.47, 0.5, max(cell.x, cell.y));
    const dist = length(positionWorld.xz);
    gm.colorNode = mix(vec3(0.012, 0.0, 0.03), mix(U.black, U.red, smoothstep(-30.0, 10.0, positionWorld.z)).mul(1.8), line).mul(ss(60.0, 8.0, dist).mul(0.9).add(0.1));
    const floorM = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), gm);
    floorM.rotation.x = -Math.PI / 2; floorM.position.y = -3.2; g.add(floorM);
    props.neon = { group: g, bg: Fn(() => {
      const d = positionWorldDirection.normalize();
      const sky = mix(vec3(0.18, 0.02, 0.2), vec3(0.01, 0.0, 0.03), smoothstep(-0.05, 0.5, d.y));
      const sunDir = vec3(0, 0.16, -1).normalize();
      const sd = length(d.sub(sunDir));
      const stripes = step(0.5, fract(d.y.mul(70)).add(smoothstep(0.17, 0.02, d.y).mul(-0.6)).add(0.35));
      const sun = smoothstep(0.31, 0.3, sd).mul(mix(stripes, float(1), smoothstep(0.2, 0.3, d.y)));
      const sunCol = mix(vec3(1.4, 0.25, 0.6), vec3(1.6, 1.1, 0.3), smoothstep(0.0, 0.3, d.y));
      const haze = exp(abs(d.y.sub(0.0)).mul(-9)).mul(0.25);
      return sky.add(sunCol.mul(sun)).add(vec3(0.6, 0.1, 0.5).mul(haze));
    })() };
  }
  for (const k of ['classic', 'space', 'fantasy', 'neon']) { props[k].group.visible = false; scene.add(props[k].group); }
  props.spaceBg = null;
  return props;
}

export function applyBackdrop(scene, props, theme) {
  for (const k of ['classic', 'space', 'fantasy', 'neon']) props[k].group.visible = k === theme;
  if (theme === 'space') { if (!props.spaceBg) { spaceBackground(scene, { density: 1.15 }); props.spaceBg = scene.backgroundNode; } else scene.backgroundNode = props.spaceBg; }
  else scene.backgroundNode = props[theme].bg;
}
