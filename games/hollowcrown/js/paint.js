// The Hollow Crown — painterly render stack.
// Every scene is a 3D diorama seen through a fixed storybook camera. What makes it read as a painting:
//  * toon ramp (shadow / half-tone / light) on vertex-coloured props, modulated by world-space "brush" noise
//  * three-stop gradient sky with painted cumulus, matched linear haze, painted backdrop cards
//  * post: Kuwahara (oil/gouache flattening, skipped on characters via an MRT mask), wobbly ink edges
//    from depth, pigment pooling, warm grade, paper fibre grain, vignette.
import * as THREE from 'three/webgpu';
import {
  Fn, vec2, vec3, vec4, float, uniform, positionWorld, positionWorldDirection, mx_noise_float, mx_fractal_noise_float,
  mix, smoothstep, clamp, screenUV, screenSize, pass, mrt, output, uv, sin, time, max, min, abs, dot, length, pow,
  normalView, positionViewDirection, perspectiveDepthToViewZ, select, texture, luminance, exp, cos,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { settings } from '/shared/sd-kit.js';

// ------------------------------------------------------------------ global uniforms (scene + remix driven)
export const U = {
  zenith: uniform(new THREE.Color(0x5d8fd6)), mid: uniform(new THREE.Color(0x9cc3ea)), horizon: uniform(new THREE.Color(0xf6dcb4)),
  sunDir: uniform(new THREE.Vector3(0.4, 0.35, -0.8).normalize()), sunCol: uniform(new THREE.Color(0xfff0c8)),
  cloudLit: uniform(new THREE.Color(0xfff6ea)), cloudShade: uniform(new THREE.Color(0xa7a6c8)), cloudAmt: uniform(0.55),
  rimCol: uniform(new THREE.Color(0xffd9a0)), rimAmt: uniform(0.22),
  sat: uniform(0.96), warmth: uniform(0.07), inkAmt: uniform(0.5), paperAmt: uniform(1.0), vignette: uniform(0.42),
  kuwa: uniform(1.0), night: uniform(0.0), fade: uniform(0.0),
};

// ------------------------------------------------------------------ painted ramp for toon shading
function rampTexture() {
  const N = 256, d = new Uint8Array(N * 4);
  for (let i = 0; i < N; i++) {
    const x = i / (N - 1); // 0 = facing away, 0.5 = terminator, 1 = facing light
    const s = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
    const v = 0.16 + 0.34 * s(0.43, 0.52, x) + 0.5 * s(0.6, 0.7, x);
    const b = Math.round(v * 255); d.set([b, b, b, 255], i * 4);
  }
  const t = new THREE.DataTexture(d, N, 1, THREE.RGBAFormat);
  t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true; return t;
}

// world-space brush variation: warm/cool patches + streaky strokes (the painter never mixes a flat colour)
const brushNode = (strength = 1) => Fn(() => {
  const p = positionWorld;
  const patch = mx_noise_float(p.mul(vec3(0.55, 0.9, 0.55)));
  const stroke = mx_noise_float(p.mul(vec3(5.5, 1.6, 5.5)).add(vec3(3.1, 1.7, 0.4)));
  const fine = mx_noise_float(p.mul(vec3(17.0, 5.0, 17.0)));
  const cool = vec3(0.9, 0.96, 1.08), warm = vec3(1.08, 1.0, 0.88);
  const tint = mix(cool, warm, smoothstep(-0.35, 0.35, patch));
  return mix(vec3(1), tint.mul(stroke.mul(0.09).add(fine.mul(0.04)).add(1.0)), float(strength));
})();

const rimNode = (k = 1) => Fn(() => {
  const f = float(1).sub(max(dot(normalView, positionViewDirection), 0.0));
  return U.rimCol.mul(pow(f, 3.0)).mul(U.rimAmt).mul(k);
})();

export const M = {};
export function makeMaterials() {
  const ramp = rampTexture();
  const toon = (o = {}) => {
    const m = new THREE.MeshToonNodeMaterial({ vertexColors: true, gradientMap: ramp, side: o.side ?? THREE.FrontSide });
    m.colorNode = brushNode(o.brush ?? 1);
    m.emissiveNode = rimNode(o.rim ?? 1);
    return m;
  };
  M.paint = toon();
  M.paintDS = toon({ side: THREE.DoubleSide });
  M.char = toon({ brush: 0.35, rim: 1.4 });
  M.char.mrtNode = mrt({ mask: vec4(1, 0, 0, 1) });
  M.glow = new THREE.MeshBasicNodeMaterial({ vertexColors: true });
  M.glow.mrtNode = mrt({ mask: vec4(0.3, 0, 0, 1) });
  M.glowAdd = new THREE.MeshBasicNodeMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  M.ramp = ramp;
  makeGroundMaterial();
  return M;
}

// Ground material with a per-scene texture (one shared shader; we swap the map through a texture node)
const groundTexNode = texture(new THREE.DataTexture(new Uint8Array([140, 160, 90, 255]), 1, 1));
export function makeGroundMaterial() {
  const m = new THREE.MeshToonNodeMaterial({ gradientMap: M.ramp });
  m.colorNode = Fn(() => groundTexNode.rgb.mul(brushNode(0.7)))();
  m.emissiveNode = rimNode(0.2);
  M.ground = m; return m;
}
export function setGroundTexture(t) { groundTexNode.value = t; }

// ------------------------------------------------------------------ painted sky (backgroundNode, zero draw calls)
export function skyNode() {
  return Fn(() => {
    const d = positionWorldDirection.normalize();
    const y = d.y;
    let c = mix(U.horizon, U.mid, smoothstep(-0.01, 0.12, y));
    c = mix(c, U.zenith, smoothstep(0.1, 0.55, y));
    // sun glow
    const sd = max(dot(d, U.sunDir), 0.0);
    c = c.add(U.sunCol.mul(pow(sd, 18.0).mul(0.55).add(pow(sd, 400.0).mul(2.5))));
    // painted cumulus: projected fbm, lit tops, lavender bellies, soft brushed edges
    const py = max(y, 0.04);
    const q = vec2(d.x, d.z).div(py.add(0.25)).mul(1.1);
    const n = mx_fractal_noise_float(vec3(q.x.mul(0.6), q.y.mul(1.4), 2.0), 5, 2.1, 0.5);
    const n2 = mx_fractal_noise_float(vec3(q.x.mul(0.6), q.y.mul(1.4).add(0.12), 2.0), 4, 2.1, 0.5);
    const dens = smoothstep(float(0.18).sub(U.cloudAmt.mul(0.3)), float(0.38).sub(U.cloudAmt.mul(0.2)), n).mul(smoothstep(0.0, 0.12, y));
    const shade = smoothstep(-0.12, 0.12, n.sub(n2));
    const cloud = mix(U.cloudShade, U.cloudLit, shade);
    c = mix(c, cloud, dens.mul(0.92));
    // haze band hugging the horizon
    c = mix(c, U.horizon, smoothstep(0.06, 0.0, y).mul(0.6));
    return c;
  })();
}

export function setSky(o) {
  for (const k of ['zenith', 'mid', 'horizon', 'sunCol', 'cloudLit', 'cloudShade', 'rimCol']) if (o[k] != null) U[k].value.set(o[k]);
  if (o.cloudAmt != null) U.cloudAmt.value = o.cloudAmt;
  if (o.sunDir) U.sunDir.value.set(...o.sunDir).normalize();
  if (o.rimAmt != null) U.rimAmt.value = o.rimAmt;
}

// ------------------------------------------------------------------ paper texture (fibres + tooth), generated once
function paperTexture() {
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, S, S);
  const id = g.getImageData(0, 0, S, S), d = id.data;
  for (let i = 0; i < d.length; i += 4) { const v = 128 + (Math.random() - 0.5) * 34; d[i] = d[i + 1] = d[i + 2] = v; }
  g.putImageData(id, 0, 0);
  g.globalAlpha = 0.09; g.lineWidth = 1;
  for (let i = 0; i < 1600; i++) {
    const x = Math.random() * S, y = Math.random() * S, a = Math.random() * Math.PI, l = 6 + Math.random() * 26;
    g.strokeStyle = Math.random() < 0.5 ? '#fff' : '#000';
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + 3, y + Math.sin(a) * l * 0.5 - 3, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  // tile seams: draw again offset so it wraps
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace;
  return t;
}

// ------------------------------------------------------------------ the painterly post pipeline
export function createPaintPipeline(renderer, scene, camera) {
  const pipeline = new THREE.RenderPipeline(renderer);
  const sp = pass(scene, camera);
  sp.setMRT(mrt({ output, mask: vec4(0, 0, 0, 1) }));
  const col = sp.getTextureNode('output');
  const maskT = sp.getTextureNode('mask');
  const depT = sp.getTextureNode('depth');
  const near = sp._cameraNear, far = sp._cameraFar;
  const paper = texture(paperTexture());
  const low = settings.quality === 'low';
  const R = low ? 0 : 2; // Kuwahara radius in pixels (at DPR-scaled resolution we scale step)

  const painted = Fn(() => {
    const px = vec2(1.0).div(screenSize);
    const uv0 = screenUV;
    // hand-made wobble: low-frequency displacement so edges are never ruler-straight
    const wob = vec2(mx_noise_float(vec3(uv0.mul(vec2(9.0, 6.0)), 1.3)), mx_noise_float(vec3(uv0.mul(vec2(9.0, 6.0)), 7.9))).mul(px).mul(1.6);
    const uvw = uv0.add(wob);
    const base = col.sample(uvw).rgb.toVar();
    let res = base;
    if (R > 0) {
      const step = max(float(1.0), screenSize.y.div(720.0)).mul(1.7); // sparse taps: a broader brush for the same 25 samples
      const m = [vec3(0).toVar(), vec3(0).toVar(), vec3(0).toVar(), vec3(0).toVar()];
      const s = [vec3(0).toVar(), vec3(0).toVar(), vec3(0).toVar(), vec3(0).toVar()];
      for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) {
        const c = col.sample(uvw.add(vec2(i, j).mul(px).mul(step))).rgb.toVar();
        const c2 = c.mul(c);
        const qs = [];
        if (i <= 0 && j <= 0) qs.push(0); if (i >= 0 && j <= 0) qs.push(1); if (i <= 0 && j >= 0) qs.push(2); if (i >= 0 && j >= 0) qs.push(3);
        for (const q of qs) { m[q].addAssign(c); s[q].addAssign(c2); }
      }
      const n = float((R + 1) * (R + 1));
      const best = vec3(0).toVar(), bestV = float(1e9).toVar();
      for (let q = 0; q < 4; q++) {
        const mean = m[q].div(n);
        const v = s[q].div(n).sub(mean.mul(mean));
        const vs = v.x.add(v.y).add(v.z);
        const better = vs.lessThan(bestV);
        best.assign(select(better, mean, best));
        bestV.assign(select(better, vs, bestV));
      }
      const mk = maskT.sample(uv0).r;
      // characters (mask 1) stay crisp; glows (0.5) half; everything else gets the brush
      res = mix(base, best, U.kuwa.mul(float(1).sub(mk)));
    }
    // ---- ink + pigment pooling from depth discontinuities
    const istep = max(float(1.0), screenSize.y.div(720.0)).mul(1.6);
    const vz = (o) => perspectiveDepthToViewZ(depT.sample(uvw.add(o.mul(px).mul(istep))).x, near, far).negate();
    const zc = vz(vec2(0, 0));
    const e = abs(vz(vec2(1, 0)).sub(zc)).add(abs(vz(vec2(-1, 0)).sub(zc))).add(abs(vz(vec2(0, 1)).sub(zc))).add(abs(vz(vec2(0, -1)).sub(zc))).div(zc.add(0.5));
    const ink = smoothstep(0.035, 0.16, e).mul(U.inkAmt);
    const inkCol = vec3(0.16, 0.1, 0.09);
    res = mix(res, res.mul(inkCol.mul(2.2)), ink);
    // ---- directional brush streaks (a slowly turning stroke field, like a painter changing hand direction)
    const pp = uv0.mul(screenSize).div(max(float(1.0), screenSize.y.div(720.0)));
    const ang = mx_noise_float(vec3(uv0.mul(vec2(2.6, 2.0)), 2.0)).mul(1.6).add(0.4);
    const ca = cos(ang), sa = sin(ang);
    const rp = vec2(pp.x.mul(ca).sub(pp.y.mul(sa)), pp.x.mul(sa).add(pp.y.mul(ca)));
    const stroke = mx_noise_float(vec3(rp.x.mul(0.03), rp.y.mul(0.32), 1.7)).add(mx_noise_float(vec3(rp.x.mul(0.07), rp.y.mul(0.7), 5.1)).mul(0.5));
    res = res.mul(float(1).add(stroke.mul(0.055).mul(U.paperAmt)));
    // ---- grade: saturation, split tone (violet shadows, warm lights)
    const lum = luminance(res);
    res = mix(vec3(lum), res, U.sat);
    const shadowTint = mix(vec3(0.86, 0.88, 1.12), vec3(1.0), smoothstep(0.02, 0.32, lum));
    const lightTint = mix(vec3(1.0), vec3(float(1).add(U.warmth), float(1).add(U.warmth.mul(0.35)), float(1).sub(U.warmth.mul(0.8))), smoothstep(0.35, 0.9, lum));
    res = res.mul(shadowTint).mul(lightTint);
    // ---- paper: fibre tooth + broad wash variation
    const pt = paper.sample(uv0.mul(screenSize).div(512.0)).r.sub(0.5);
    const wash = mx_noise_float(vec3(uv0.mul(vec2(3.0, 2.0)), 4.2));
    res = res.mul(float(1).add(pt.mul(0.16).mul(U.paperAmt))).mul(float(1).add(wash.mul(0.05)));
    // ---- vignette + edge darkening (storybook frame)
    const dv = uv0.sub(0.5).mul(vec2(1.0, 1.15));
    const vig = smoothstep(0.32, 0.85, length(dv)).mul(U.vignette);
    res = res.mul(float(1).sub(vig));
    // ---- night + fade
    res = mix(res, res.mul(vec3(0.35, 0.42, 0.7)), U.night);
    res = mix(res, vec3(0.03, 0.02, 0.04), U.fade);
    return vec4(max(res, vec3(0)), 1.0);
  })();

  let out = painted;
  let bloomNode = null;
  if (!low) { bloomNode = bloom(col, 0.42, 0.5, 0.88); out = painted.add(vec4(bloomNode.rgb.mul(float(1).sub(U.fade)), 0)); }
  pipeline.outputNode = out;
  return { pipeline, sp, bloomNode, render: () => pipeline.render() };
}

// ------------------------------------------------------------------ helpers for painted canvas textures
export function paintCanvas(w, h, fn, { srgb = true, repeat = null, alpha = false } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); fn(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  t.premultiplyAlpha = false;
  return t;
}

// seeded RNG for reproducible brushwork
export const RNG = (s) => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

// a dab of paint: an irregular elliptical stroke with soft edge
export function dab(g, x, y, rx, ry, rot, color, alpha = 1) {
  g.save(); g.translate(x, y); g.rotate(rot); g.globalAlpha = alpha; g.fillStyle = color;
  g.beginPath();
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2, w = 1 + Math.sin(a * 3 + x) * 0.12;
    const px = Math.cos(a) * rx * w, py = Math.sin(a) * ry * w;
    i ? g.lineTo(px, py) : g.moveTo(px, py);
  }
  g.fill(); g.restore();
}
export const hex = (c) => '#' + new THREE.Color(c).getHexString();
export function jitterColor(c, amt, r) { const col = new THREE.Color(c); const hsl = {}; col.getHSL(hsl); col.setHSL(hsl.h + (r() - 0.5) * amt * 0.15, Math.min(1, Math.max(0, hsl.s + (r() - 0.5) * amt)), Math.min(1, Math.max(0, hsl.l + (r() - 0.5) * amt))); return '#' + col.getHexString(); }

// ------------------------------------------------------------------ stylised painted water (rivers, ponds, sea)
export function waterMaterial(o = {}) {
  const deep = uniform(new THREE.Color(o.deep ?? '#2f6f8f')), shallow = uniform(new THREE.Color(o.shallow ?? '#6fb4c8')), hi = uniform(new THREE.Color(o.hi ?? '#f4fbff'));
  const fx = o.flow?.[0] ?? 0.2, fz = o.flow?.[1] ?? 0.0, sc = o.scale ?? 1;
  const m = new THREE.MeshBasicNodeMaterial({ transparent: (o.opacity ?? 1) < 1, opacity: o.opacity ?? 1, depthWrite: true });
  m.colorNode = Fn(() => {
    const p = positionWorld.xz.mul(sc); const t = time.mul(o.speed ?? 0.25);
    const n1 = mx_noise_float(vec3(p.x.mul(0.3).sub(t.mul(fx)), p.y.mul(0.9).sub(t.mul(fz)), t.mul(0.15)));
    const n2 = mx_noise_float(vec3(p.x.mul(1.3).sub(t.mul(fx * 3.0)), p.y.mul(4.2).sub(t.mul(fz * 3.0)), t.mul(0.3).add(5.0)));
    const n3 = mx_noise_float(vec3(p.x.mul(3.1), p.y.mul(9.0), t.mul(0.6).add(9.0)));
    let c = mix(deep, shallow, smoothstep(-0.45, 0.55, n1));
    c = c.add(hi.mul(smoothstep(0.42, 0.62, n2).mul(0.35))).add(hi.mul(smoothstep(0.55, 0.7, n3).mul(0.25)));
    return c;
  })();
  m.U = { deep, shallow, hi };
  return m;
}
