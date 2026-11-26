// Emberwake — merged-geometry builder. Every static surface is appended here with atlas UVs + vertex colour
// (tint × baked AO), then flushed to ONE BufferGeometry per material → a whole town is a handful of draw calls.
import * as THREE from 'three/webgpu';
import { uvOf } from './atlas.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _c = new THREE.Color();
const toRGB = (c) => (c == null ? [1, 1, 1] : Array.isArray(c) ? c : (_c.set(c), [_c.r, _c.g, _c.b]));

export class GB {
  constructor(extra = []) { this.p = []; this.n = []; this.u = []; this.c = []; this.extra = Object.fromEntries(extra.map((k) => [k, []])); }
  get count() { return this.p.length / 3; }
  vert(v, nrm, uv, col, ex) { this.p.push(v.x, v.y, v.z); this.n.push(nrm.x, nrm.y, nrm.z); this.u.push(uv[0], uv[1]); this.c.push(col[0], col[1], col[2]); for (const k in this.extra) this.extra[k].push(ex?.[k] ?? 0); }
  tri(a, b, c, tex, ua, ub, uc, col, ex, cols) {
    const nrm = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    const r = uvOf(tex), m = (t) => [r[0] + (r[2] - r[0]) * t[0], r[1] + (r[3] - r[1]) * t[1]];
    const C = toRGB(col);
    this.vert(a, nrm, m(ua), cols ? cols[0] : C, ex); this.vert(b, nrm, m(ub), cols ? cols[1] : C, ex); this.vert(c, nrm, m(uc), cols ? cols[2] : C, ex);
  }
  // a b c d counter-clockwise seen from the front; uv sub-rect [u0,v0,u1,v1] inside the tile; cols: per-corner RGB arrays
  quad(a, b, c, d, tex, col = [1, 1, 1], sub = [0, 0, 1, 1], cols = null, ex = null) {
    const [u0, v0, u1, v1] = sub; const C = cols || [toRGB(col), toRGB(col), toRGB(col), toRGB(col)];
    this.tri(a, b, c, tex, [u0, v0], [u1, v0], [u1, v1], null, ex, [C[0], C[1], C[2]]);
    this.tri(a, c, d, tex, [u0, v0], [u1, v1], [u0, v1], null, ex, [C[0], C[2], C[3]]);
  }
  // rectangle spanned by U and V from origin, tiled in ≤1-unit cells so texel density stays constant.
  // shade(v01) → colour multiplier along V (bottom → top) for baked AO gradients.
  face(o, U, Vv, tex, col = [1, 1, 1], { shade = null, scale = 1, ex = null } = {}) {
    const lu = U.length() * scale, lv = Vv.length() * scale; const nu = Math.max(1, Math.ceil(lu - 1e-4)), nv = Math.max(1, Math.ceil(lv - 1e-4));
    const C = toRGB(col);
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const a0 = i / lu, a1 = Math.min(1, (i + 1) / lu), b0 = j / lv, b1 = Math.min(1, (j + 1) / lv);
      const P = (a, b) => o.clone().addScaledVector(U, a).addScaledVector(Vv, b);
      const sub = [0, 0, (a1 - a0) * lu, (b1 - b0) * lv];
      const k = (b) => { const s = shade ? shade(b) : 1; return [C[0] * s, C[1] * s, C[2] * s]; };
      this.quad(P(a0, b0), P(a1, b0), P(a1, b1), P(a0, b1), tex, null, sub, [k(b0), k(b0), k(b1), k(b1)], ex);
    }
  }
  // axis-aligned box; tex = {side, top, bottom} or one id. sides: which faces to emit.
  box(x0, y0, z0, x1, y1, z1, tex, col = [1, 1, 1], { top = true, bottom = false, sides = 'nsew', shade = null, scale = 1 } = {}) {
    const ts = typeof tex === 'object' ? tex : { side: tex, top: tex, bottom: tex };
    const h = y1 - y0;
    const sh = shade || ((b) => 0.72 + 0.28 * b);
    if (sides.includes('s')) this.face(V(x0, y0, z1), V(x1 - x0, 0, 0), V(0, h, 0), ts.side, col, { shade: sh, scale });
    if (sides.includes('n')) this.face(V(x1, y0, z0), V(x0 - x1, 0, 0), V(0, h, 0), ts.side, col, { shade: sh, scale });
    if (sides.includes('e')) this.face(V(x1, y0, z1), V(0, 0, z0 - z1), V(0, h, 0), ts.side, col, { shade: sh, scale });
    if (sides.includes('w')) this.face(V(x0, y0, z0), V(0, 0, z1 - z0), V(0, h, 0), ts.side, col, { shade: sh, scale });
    if (top) this.face(V(x0, y1, z1), V(x1 - x0, 0, 0), V(0, 0, z0 - z1), ts.top, col, { scale });
    if (bottom) this.face(V(x0, y0, z0), V(x1 - x0, 0, 0), V(0, 0, z1 - z0), ts.bottom ?? ts.side, col, { scale });
  }
  // append a three.js geometry (uv 0..1 remapped into the tile), transformed by matrix
  geom(g, tex, col, matrix, { uvScale = [1, 1], ex = null, jitter = 0, seed = 1, colFn = null } = {}) {
    const G = g.index ? g.toNonIndexed() : g; if (matrix) G.applyMatrix4(matrix);
    if (jitter) { const P = G.attributes.position; for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i); const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 53.7) * 43758.5453; const r = (a) => ((((Math.sin(h + a) * 1e4) % 1) + 1) % 1) - 0.5; P.setXYZ(i, x + r(1) * jitter, y + r(2) * jitter * 0.6, z + r(3) * jitter); } }
    G.computeVertexNormals();
    const P = G.attributes.position, N = G.attributes.normal, U = G.attributes.uv, r = uvOf(tex), C = toRGB(col);
    for (let i = 0; i < P.count; i++) {
      let u = U ? U.getX(i) * uvScale[0] : 0, v = U ? U.getY(i) * uvScale[1] : 0; u = u - Math.floor(u); v = v - Math.floor(v);
      if (u > 0.999) u = 0.999; if (v > 0.999) v = 0.999;
      const pos = V(P.getX(i), P.getY(i), P.getZ(i));
      const cc = colFn ? colFn(pos, C) : C;
      this.p.push(pos.x, pos.y, pos.z); this.n.push(N.getX(i), N.getY(i), N.getZ(i)); this.u.push(r[0] + (r[2] - r[0]) * u, r[1] + (r[3] - r[1]) * v); this.c.push(cc[0], cc[1], cc[2]);
      for (const k in this.extra) this.extra[k].push(ex?.[k] ?? 0);
    }
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    for (const k in this.extra) g.setAttribute(k, new THREE.Float32BufferAttribute(this.extra[k], 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}
export { V };
