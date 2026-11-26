// Chess: Worlds — procedural piece sets. Every piece is ONE merged BufferGeometry (one draw call) carrying a per-vertex
// `part` attribute (x = accent/trim, y = glow/emissive, z = shade/dark detail) that the theme material reads in TSL.
// Readability rules for every set: height hierarchy K(~1.48) > Q(~1.28) > B(~1.1) ≥ R(~0.96) > N(~0.92) > P(~0.66),
// and a role motif on top: K cross · Q coronet · B point/mitre · R battlements · N asymmetric head · P round head.
// Geometry faces +z ("forward"); the board layer rotates white pieces to face black and turns knights to show profile.
import * as THREE from 'three/webgpu';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const D2R = Math.PI / 180;
const KEEP = ['position', 'normal', 'uv', 'part'];

class Kit {
  constructor() { this.geos = []; this.stack = [new THREE.Matrix4()]; }
  get top() { return this.stack[this.stack.length - 1]; }
  // nested local frame: kit.at({p, r, s}, () => { ...parts in that frame... })
  at(o, fn) { this.stack.push(this.top.clone().multiply(mat(o))); fn(); this.stack.pop(); return this; }
  add(g, o = {}) {
    let geo = g.index ? g.toNonIndexed() : g.clone();
    if (o.flat) geo.computeVertexNormals(); // non-indexed → faceted normals (crystals, low-poly armour)
    geo.applyMatrix4(this.top.clone().multiply(mat(o)));
    const n = geo.attributes.position.count, part = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { part[i * 3] = o.a || 0; part[i * 3 + 1] = o.g || 0; part[i * 3 + 2] = o.d || 0; }
    geo.setAttribute('part', new THREE.BufferAttribute(part, 3));
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    for (const k of Object.keys(geo.attributes)) if (!KEEP.includes(k)) geo.deleteAttribute(k);
    this.geos.push(geo); g.dispose?.();
    return this;
  }
  lathe(pts, o = {}) { return this.add(new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), o.seg || 40), o); }
  box(w, h, d, o) { return this.add(new THREE.BoxGeometry(w, h, d), o); }
  sphere(r, o = {}) { return this.add(new THREE.SphereGeometry(r, o.ws || 24, o.hs || 16), o); }
  cyl(rt, rb, h, o = {}) { return this.add(new THREE.CylinderGeometry(rt, rb, h, o.seg || 24, 1, false), o); }
  cone(r, h, o = {}) { const g = new THREE.CylinderGeometry(0, r, h, o.seg || 16, 1, false); g.translate(0, h / 2, 0); return this.add(g, o); } // base at origin, apex +y
  torus(R, r, o = {}) { const g = new THREE.TorusGeometry(R, r, o.rs || 10, o.ts || 40, o.arc || Math.PI * 2); g.rotateX(-Math.PI / 2); return this.add(g, o); } // flat (xz) ring
  octa(r, o) { return this.add(new THREE.OctahedronGeometry(r, 0), { flat: true, ...o }); }
  ico(r, detail, o) { return this.add(new THREE.IcosahedronGeometry(r, detail), { flat: true, ...o }); }
  // ring of n copies around the y axis; fn(kit, i) adds parts in a frame whose +z points radially outward
  ring(n, R, y, fn, phase = 0) {
    for (let i = 0; i < n; i++) { const a = phase + (i / n) * Math.PI * 2; this.at({ p: [Math.sin(a) * R, y, Math.cos(a) * R], r: [0, a, 0] }, () => fn(this, i)); }
    return this;
  }
  build() { const g = mergeGeometries(this.geos, false); this.geos.forEach((x) => x.dispose()); g.computeBoundingBox(); g.computeBoundingSphere(); return g; }
}
function mat(o = {}) {
  const s = o.s == null ? [1, 1, 1] : Array.isArray(o.s) ? o.s : [o.s, o.s, o.s];
  return new THREE.Matrix4().compose(new THREE.Vector3(...(o.p || [0, 0, 0])), new THREE.Quaternion().setFromEuler(new THREE.Euler(...(o.r || [0, 0, 0]), o.order || 'XYZ')), new THREE.Vector3(...s));
}
const arc = (cx, cy, r, a0, a1, n = 10) => Array.from({ length: n + 1 }, (_, i) => { const a = (a0 + (a1 - a0) * (i / n)) * D2R; return [Math.max(0, cx + r * Math.cos(a)), cy + r * Math.sin(a)]; });

// Extruded side profile (shape drawn facing +x), centred in thickness, sculpted by taper(x,y) and turned to face +z.
function profileHead(kit, drawShape, { depth = 0.16, bevel = 0.035, taper = () => 1, flat = false, p = [0, 0, 0], o = {} } = {}) {
  const s = new THREE.Shape(); drawShape(s);
  let g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: flat ? 1 : 3, curveSegments: flat ? 4 : 10 });
  g.translate(0, 0, -depth / 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, pos.getZ(i) * taper(pos.getX(i), pos.getY(i)));
  // Extrude output is non-indexed (flat normals). Weld it so sculpted heads shade smoothly; crystal sets stay faceted.
  if (!flat) { g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g, 1e-4); }
  g.computeVertexNormals();
  kit.at({ p, r: [0, -Math.PI / 2, 0] }, () => kit.add(g, { flat, ...o }));
}

// ======================================================================= CLASSIC — Staunton
const footStaunton = (R) => [[0, 0], [R, 0], [R + 0.012, 0.012], [R + 0.012, 0.046], [R - 0.004, 0.06], [R - 0.03, 0.066], ...arc(R - 0.04, 0.082, 0.016, -90, 90, 5), [R - 0.07, 0.104], [R - 0.1, 0.12], [R - 0.13, 0.145]];
function classic(type) {
  const k = new Kit();
  if (type === 1) { // pawn
    k.lathe([...footStaunton(0.30), [0.15, 0.18], [0.13, 0.24], [0.115, 0.30], [0.105, 0.37], [0.125, 0.385], [0.175, 0.395], [0.186, 0.41], [0.175, 0.425], [0.12, 0.432], [0.092, 0.448], ...arc(0, 0.555, 0.125, -52, 90, 14)]);
  } else if (type === 2) { // knight: turned base + sculpted horse head
    k.lathe([...footStaunton(0.33), [0.215, 0.165], [0.235, 0.175], [0.205, 0.19], [0, 0.19]]);
    profileHead(k, (s) => {
      s.moveTo(-0.20, 0); s.lineTo(0.17, 0);
      s.quadraticCurveTo(0.21, 0.14, 0.11, 0.25);
      s.quadraticCurveTo(0.14, 0.30, 0.24, 0.31);
      s.quadraticCurveTo(0.32, 0.31, 0.33, 0.355);
      s.lineTo(0.295, 0.372); s.lineTo(0.335, 0.39);
      s.quadraticCurveTo(0.345, 0.44, 0.30, 0.47);
      s.quadraticCurveTo(0.20, 0.53, 0.125, 0.615);
      s.lineTo(0.095, 0.715); s.lineTo(0.035, 0.635);
      s.quadraticCurveTo(-0.06, 0.64, -0.13, 0.55);
      s.quadraticCurveTo(-0.22, 0.42, -0.24, 0.22);
      s.quadraticCurveTo(-0.25, 0.08, -0.20, 0);
    }, { p: [0, 0.17, 0], taper: (x, y) => (x > 0.14 ? 1 - (x - 0.14) * 1.5 : 1) * (y > 0.6 ? 0.72 : 1) * (y < 0.12 ? 1.12 : 1) });
    k.at({ p: [0, 0.17, 0], r: [0, -Math.PI / 2, 0] }, () => {
      for (const z of [-1, 1]) { k.sphere(0.026, { p: [0.125, 0.535, z * 0.108], d: 1, ws: 10, hs: 8 }); k.sphere(0.016, { p: [0.315, 0.425, z * 0.075], d: 1, ws: 8, hs: 6 }); }
      // mane ridge
      for (let i = 0; i < 6; i++) { const t = i / 5, x = -0.11 - t * 0.14, y = 0.57 - t * 0.36; k.sphere(0.05, { p: [x - 0.012, y, 0], s: [1, 1.2, 0.55], ws: 12, hs: 8 }); }
    });
  } else if (type === 3) { // bishop
    k.lathe([...footStaunton(0.32), [0.17, 0.19], [0.145, 0.26], [0.125, 0.35], [0.11, 0.45], [0.105, 0.53], [0.12, 0.55], [0.18, 0.565], [0.195, 0.585], [0.18, 0.605], [0.12, 0.615], [0.09, 0.63], [0.10, 0.645], [0.13, 0.67], [0.155, 0.71], [0.165, 0.76], [0.16, 0.81], [0.145, 0.86], [0.12, 0.91], [0.09, 0.955], [0.055, 0.995], [0.03, 1.015], [0.024, 1.03], ...arc(0, 1.065, 0.042, -55, 90, 8)]);
    const slit = new THREE.TorusGeometry(0.152, 0.015, 6, 24, Math.PI * 0.75); slit.rotateX(-Math.PI / 2); slit.rotateY(Math.PI * 0.125 + Math.PI / 2); slit.rotateZ(0.4);
    k.add(slit, { p: [0, 0.81, 0], d: 1 });
  } else if (type === 4) { // rook
    k.lathe([...footStaunton(0.33), [0.215, 0.17], [0.205, 0.25], [0.198, 0.40], [0.20, 0.55], [0.21, 0.62], [0.235, 0.645], [0.25, 0.66], [0.245, 0.675], [0.255, 0.69], [0.27, 0.71], [0.285, 0.73], [0.29, 0.75], [0.29, 0.82], [0.2, 0.82], [0.2, 0.80], [0, 0.80]]);
    k.ring(6, 0.245, 0.885, () => k.box(0.15, 0.13, 0.085, { p: [0, 0, 0] }));
  } else if (type === 5) { // queen
    k.lathe([...footStaunton(0.35), [0.2, 0.19], [0.17, 0.26], [0.145, 0.36], [0.125, 0.48], [0.115, 0.6], [0.112, 0.66], [0.135, 0.68], [0.205, 0.695], [0.22, 0.715], [0.205, 0.735], [0.14, 0.745], [0.125, 0.76], [0.14, 0.80], [0.165, 0.88], [0.19, 0.96], [0.215, 1.02], [0.235, 1.055], [0.245, 1.07], [0.232, 1.085], [0.19, 1.085], [0.17, 1.1], [0.14, 1.13], [0.1, 1.16], [0.06, 1.175], [0.042, 1.182], ...arc(0, 1.225, 0.05, -55, 90, 8)]);
    k.ring(10, 0.228, 1.1, () => k.sphere(0.034, { ws: 10, hs: 8 }));
  } else if (type === 6) { // king
    k.lathe([...footStaunton(0.36), [0.21, 0.19], [0.18, 0.27], [0.155, 0.38], [0.135, 0.52], [0.125, 0.66], [0.122, 0.73], [0.145, 0.75], [0.215, 0.765], [0.23, 0.785], [0.215, 0.805], [0.15, 0.815], [0.135, 0.83], [0.15, 0.87], [0.17, 0.95], [0.195, 1.03], [0.215, 1.09], [0.228, 1.12], [0.212, 1.135], [0.18, 1.15], [0.15, 1.19], [0.105, 1.222], [0.06, 1.24], [0.045, 1.25], [0.05, 1.27], [0.04, 1.29], [0, 1.29]]);
    k.box(0.055, 0.2, 0.055, { p: [0, 1.38, 0] });
    k.box(0.15, 0.055, 0.055, { p: [0, 1.40, 0] });
  }
  return k.build();
}

// ======================================================================= SPACE — fleet
const spacePad = (k) => { k.lathe([[0, 0], [0.31, 0], [0.322, 0.015], [0.322, 0.04], [0.3, 0.062], [0.25, 0.074], [0.12, 0.078], [0, 0.078]], { seg: 32 }); k.torus(0.318, 0.012, { p: [0, 0.028, 0], g: 1, rs: 6, ts: 40 }); };
function space(type) {
  const k = new Kit(); spacePad(k);
  if (type === 1) { // probe drone
    k.cyl(0.05, 0.075, 0.2, { p: [0, 0.17, 0], seg: 12 });
    k.sphere(0.14, { p: [0, 0.4, 0] });
    k.torus(0.175, 0.022, { p: [0, 0.4, 0], a: 1, rs: 8 });
    k.sphere(0.045, { p: [0, 0.41, 0.125], g: 1, ws: 12, hs: 8 });
    k.ring(3, 0.05, 0.5, () => k.cyl(0.008, 0.008, 0.16, { p: [0, 0.07, 0], r: [0.5, 0, 0], seg: 5 }));
    k.ring(3, 0.11, 0.6, () => k.sphere(0.012, { g: 1, ws: 6, hs: 4 }));
  } else if (type === 2) { // shuttle / lander pitched up like a horse head
    k.cyl(0.05, 0.06, 0.24, { p: [0, 0.19, -0.04], r: [0.25, 0, 0], seg: 10 });
    k.at({ p: [0, 0.3, -0.13], r: [40 * D2R, 0, 0] }, () => {
      k.lathe([[0, 0], [0.1, 0], [0.12, 0.06], [0.125, 0.25], [0.11, 0.38], [0.075, 0.48], [0.03, 0.55], [0, 0.57]], { seg: 24 });
      k.cyl(0.085, 0.085, 0.02, { p: [0, -0.005, 0], g: 1, seg: 20 }); // engine
      k.add(new THREE.CylinderGeometry(0.2, 0.2, 0.018, 3), { p: [0, 0.14, 0], s: [1.5, 1, 1.15], r: [-Math.PI / 2, 0, 0], a: 1 }); // delta wing, apex to the nose
      k.add(new THREE.CylinderGeometry(0.12, 0.12, 0.016, 3), { p: [0, 0.12, -0.12], s: [1, 1, 1.4], r: [0, 0, Math.PI / 2], a: 1 }); // tail fin (mane)
      k.sphere(0.06, { p: [0, 0.36, -0.085], s: [0.9, 1.4, 0.6], g: 1, ws: 14, hs: 10 }); // cockpit on the dorsal side
    });
  } else if (type === 3) { // satellite with dish and pointed antenna
    k.cyl(0.05, 0.07, 0.44, { p: [0, 0.3, 0], seg: 12 });
    k.box(0.17, 0.2, 0.17, { p: [0, 0.53, 0] });
    k.box(0.172, 0.03, 0.172, { p: [0, 0.5, 0], g: 1 });
    for (const sx of [-1, 1]) k.at({ p: [sx * 0.085, 0.53, 0], r: [0, 0, sx * 0.35] }, () => { k.box(0.24, 0.012, 0.13, { p: [sx * 0.13, 0, 0], a: 1, d: 0.35 }); k.box(0.24, 0.016, 0.01, { p: [sx * 0.13, 0.002, 0], g: 0.8 }); });
    k.lathe([[0, 0], [0.05, 0.006], [0.1, 0.024], [0.145, 0.055], [0.14, 0.062], [0.095, 0.034], [0.05, 0.016], [0, 0.012]], { p: [0, 0.64, 0], seg: 28, a: 1 });
    k.cone(0.032, 0.42, { p: [0, 0.66, 0], seg: 10 });
    k.sphere(0.024, { p: [0, 1.085, 0], g: 1, ws: 10, hs: 8 });
  } else if (type === 4) { // orbital tower with docking-pylon battlements
    k.lathe([[0, 0.07], [0.25, 0.07], [0.25, 0.1], [0.215, 0.14], [0.2, 0.3], [0.2, 0.6], [0.225, 0.66], [0.27, 0.7], [0.27, 0.8], [0.2, 0.8], [0, 0.8]], { seg: 32 });
    for (const y of [0.3, 0.46]) k.torus(0.204, 0.012, { p: [0, y, 0], g: 1, rs: 6 });
    k.ring(6, 0.235, 0.87, () => { k.box(0.11, 0.15, 0.08, { a: 1 }); k.box(0.07, 0.02, 0.085, { p: [0, 0.06, 0], g: 1 }); });
  } else if (type === 5) { // star cruiser spire with antenna coronet
    k.lathe([[0, 0.07], [0.2, 0.07], [0.2, 0.1], [0.14, 0.16], [0.105, 0.35], [0.09, 0.6], [0.1, 0.8], [0.13, 0.95], [0.155, 1.03], [0.12, 1.07], [0, 1.07]], { seg: 32 });
    k.ring(3, 0.1, 0.36, () => k.add(new THREE.CylinderGeometry(0.2, 0.2, 0.014, 3), { s: [0.9, 1, 1.1], r: [0, 0, Math.PI / 2], a: 1 }), Math.PI / 6);
    k.ring(3, 0.115, 0.36, () => k.box(0.016, 0.3, 0.016, { p: [0, 0, 0.03], g: 0.9 }), Math.PI / 6); // glow seam along each fin root
    k.ring(8, 0.13, 1.06, () => k.cone(0.022, 0.16, { r: [0.42, 0, 0], seg: 6, a: 1 }));
    k.ring(8, 0.175, 1.2, () => k.sphere(0.013, { g: 1, ws: 6, hs: 4 }));
    k.sphere(0.055, { p: [0, 1.13, 0], g: 1 });
    k.cyl(0.11, 0.11, 0.02, { p: [0, 0.9, 0], g: 1, seg: 24 });
  } else if (type === 6) { // flagship station with comm-array cross
    k.lathe([[0, 0.07], [0.19, 0.07], [0.19, 0.1], [0.13, 0.16], [0.09, 0.4], [0.1, 0.6], [0.12, 0.8], [0.13, 1.0], [0.11, 1.1], [0.07, 1.16], [0, 1.18]], { seg: 32 });
    k.torus(0.26, 0.032, { p: [0, 0.56, 0], a: 1, rs: 10, ts: 48 });
    k.torus(0.26, 0.012, { p: [0, 0.56, 0], s: [1.0, 3.2, 1.0], g: 1, rs: 6, ts: 48 });
    k.ring(4, 0.17, 0.56, () => k.box(0.03, 0.03, 0.18), Math.PI / 4);
    k.torus(0.2, 0.025, { p: [0, 0.9, 0], a: 1, rs: 8, ts: 40 });
    k.ring(4, 0.15, 0.9, () => k.box(0.025, 0.025, 0.1));
    k.box(0.045, 0.28, 0.045, { p: [0, 1.31, 0] });
    k.box(0.22, 0.045, 0.045, { p: [0, 1.34, 0] });
    for (const [x, y] of [[0, 1.46], [-0.115, 1.34], [0.115, 1.34]]) k.sphere(0.022, { p: [x, y, 0], g: 1, ws: 8, hs: 6 });
  }
  return k.build();
}

// ======================================================================= GALAXY — celestial bodies on glass stands
const galaxyStand = (k, h) => k.lathe([[0, 0], [0.28, 0], [0.292, 0.012], [0.288, 0.032], [0.22, 0.048], [0.09, 0.062], [0.045, 0.085], [0.034, h - 0.02], [0.05, h], [0, h]], { seg: 32, a: 0.45, d: 0.45 });
function galaxy(type) {
  const k = new Kit();
  if (type === 1) { // moon
    galaxyStand(k, 0.31); k.sphere(0.145, { p: [0, 0.445, 0], g: 0.25, ws: 28, hs: 20 });
    k.torus(0.3, 0.008, { p: [0, 0.03, 0], g: 1, rs: 4 });
  } else if (type === 2) { // crescent moon (asymmetric, faces forward)
    galaxyStand(k, 0.3);
    const cres = new THREE.TorusGeometry(0.2, 0.078, 16, 40, Math.PI * 1.32);
    cres.rotateZ(Math.PI * 0.45); // gap (238°..360°) re-centred to face forward and slightly up
    cres.rotateY(-Math.PI / 2);
    k.add(cres, { p: [0, 0.57, -0.02], g: 0.35 });
    k.octa(0.06, { p: [0, 0.64, 0.12], s: [0.6, 1.3, 0.6], g: 1 });
  } else if (type === 3) { // pulsar with a pointed beam
    galaxyStand(k, 0.5); k.sphere(0.12, { p: [0, 0.62, 0], g: 0.4 });
    k.cone(0.05, 0.42, { p: [0, 0.68, 0], g: 1, seg: 16 });
    k.cone(0.035, 0.12, { p: [0, 0.56, 0], r: [Math.PI, 0, 0], g: 1, seg: 12 });
    k.torus(0.19, 0.012, { p: [0, 0.62, 0], r: [0.42, 0, 0.2], a: 1, rs: 6, ts: 40 });
  } else if (type === 4) { // ringed gas giant
    galaxyStand(k, 0.44); k.sphere(0.2, { p: [0, 0.64, 0], g: 0.2, ws: 32, hs: 24 });
    k.lathe([[0.25, -0.006], [0.37, -0.004], [0.37, 0.004], [0.25, 0.006], [0.25, -0.006]], { p: [0, 0.64, 0], r: [0.2, 0, 0.12], a: 1, g: 0.35, seg: 48 });
    k.ring(4, 0.31, 0.64, () => k.sphere(0.028, { g: 0.6, ws: 8, hs: 6 }), Math.PI / 4);
  } else if (type === 5) { // bright star wearing a crown of moons
    galaxyStand(k, 0.66); k.sphere(0.17, { p: [0, 0.83, 0], g: 0.55 });
    k.torus(0.25, 0.008, { p: [0, 1.04, 0], g: 1, rs: 4, ts: 48 });
    k.ring(9, 0.25, 1.04, () => k.sphere(0.034, { a: 1, g: 0.5, ws: 10, hs: 8 }));
    k.octa(0.07, { p: [0, 1.17, 0], s: [0.55, 1.6, 0.55], g: 1 });
  } else if (type === 6) { // sun with corona and a cross flare
    galaxyStand(k, 0.72); k.sphere(0.22, { p: [0, 0.96, 0], g: 0.8, ws: 32, hs: 24 });
    k.at({ p: [0, 0.96, 0] }, () => { for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; k.cone(0.035, 0.1, { p: [Math.cos(a) * 0.21, Math.sin(a) * 0.21, 0], r: [0, 0, a - Math.PI / 2], g: 1, seg: 6 }); } });
    k.octa(0.1, { p: [0, 1.33, 0], s: [0.32, 1.5, 0.32], g: 1 });
    k.octa(0.1, { p: [0, 1.33, 0], s: [1.15, 0.3, 0.3], g: 1 });
  }
  return k.build();
}

// ======================================================================= SCI-FI — mechs & drones (hard surface, faceted)
const hexPad = (k) => { k.cyl(0.3, 0.33, 0.07, { p: [0, 0.035, 0], seg: 6, flat: true }); k.torus(0.322, 0.011, { p: [0, 0.05, 0], g: 1, rs: 4, ts: 6, r: [0, Math.PI / 6, 0] }); };
function scifi(type) {
  const k = new Kit(); hexPad(k);
  const F = { flat: true };
  if (type === 1) { // drone pod
    k.cyl(0.05, 0.085, 0.17, { p: [0, 0.15, 0], seg: 6, ...F });
    k.sphere(0.15, { p: [0, 0.4, 0], s: [1, 0.92, 1], ws: 8, hs: 6, ...F });
    k.box(0.2, 0.034, 0.06, { p: [0, 0.41, 0.115], g: 1 });
    k.box(0.32, 0.03, 0.05, { p: [0, 0.33, 0], a: 1 });
    k.cyl(0.01, 0.01, 0.12, { p: [0.06, 0.58, 0], seg: 4 }); k.sphere(0.016, { p: [0.06, 0.645, 0], g: 1, ws: 6, hs: 4 });
  } else if (type === 2) { // mech horse head
    k.box(0.19, 0.44, 0.24, { p: [0, 0.32, -0.06], r: [0.28, 0, 0] });
    k.box(0.2, 0.06, 0.26, { p: [0, 0.16, -0.05], a: 1 });
    k.box(0.17, 0.18, 0.38, { p: [0, 0.6, 0.08], r: [0.55, 0, 0] });
    k.box(0.14, 0.11, 0.16, { p: [0, 0.495, 0.25], r: [0.55, 0, 0] });
    k.box(0.2, 0.034, 0.06, { p: [0, 0.645, 0.12], r: [0.55, 0, 0], g: 1 });
    for (const x of [-0.055, 0.055]) k.box(0.035, 0.14, 0.06, { p: [x, 0.77, -0.04], r: [-0.25, 0, x > 0 ? -0.15 : 0.15], a: 1 });
    for (let i = 0; i < 3; i++) k.box(0.05, 0.08, 0.07, { p: [0, 0.6 - i * 0.13, -0.2 + i * 0.03], r: [0.3, 0, 0], a: 1 });
  } else if (type === 3) { // sentinel with pointed hood
    k.cyl(0.13, 0.18, 0.55, { p: [0, 0.34, 0], seg: 6, ...F });
    k.cyl(0.19, 0.17, 0.06, { p: [0, 0.62, 0], seg: 6, a: 1, ...F });
    k.cone(0.15, 0.42, { p: [0, 0.65, 0], seg: 6, ...F });
    k.box(0.024, 0.2, 0.05, { p: [0, 0.79, 0.075], r: [0.34, 0, 0.6], g: 1 });
    k.octa(0.03, { p: [0, 1.09, 0], s: [1, 1.6, 1], g: 1 });
    k.box(0.27, 0.025, 0.04, { p: [0, 0.4, 0.115], g: 0.9 });
  } else if (type === 4) { // turret tower with corner battlements
    k.box(0.36, 0.6, 0.36, { p: [0, 0.37, 0] });
    k.box(0.37, 0.03, 0.37, { p: [0, 0.42, 0], g: 1 });
    k.box(0.44, 0.08, 0.44, { p: [0, 0.71, 0], a: 1 });
    for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { k.box(0.13, 0.17, 0.13, { p: [x * 0.155, 0.835, z * 0.155] }); k.box(0.135, 0.025, 0.135, { p: [x * 0.155, 0.93, z * 0.155], g: 1 }); }
    k.box(0.06, 0.16, 0.02, { p: [0, 0.2, 0.185], g: 0.7 });
  } else if (type === 5) { // tall mech with a crown of blades
    k.cyl(0.12, 0.2, 0.62, { p: [0, 0.38, 0], seg: 6, ...F });
    k.box(0.32, 0.2, 0.2, { p: [0, 0.76, 0], a: 1 });
    k.box(0.34, 0.03, 0.21, { p: [0, 0.72, 0], g: 1 });
    k.sphere(0.095, { p: [0, 0.93, 0], ws: 6, hs: 4, ...F });
    k.box(0.12, 0.025, 0.04, { p: [0, 0.94, 0.075], g: 1 });
    k.ring(7, 0.09, 1.04, () => k.box(0.03, 0.2, 0.055, { p: [0, 0.09, 0], r: [0.32, 0, 0], a: 1 }));
    k.ring(7, 0.135, 1.22, () => k.sphere(0.014, { g: 1, ws: 6, hs: 4 }));
  } else if (type === 6) { // command mech with antenna cross
    k.cyl(0.13, 0.22, 0.66, { p: [0, 0.4, 0], seg: 6, ...F });
    k.box(0.36, 0.26, 0.24, { p: [0, 0.84, 0] });
    for (const x of [-1, 1]) k.box(0.15, 0.1, 0.2, { p: [x * 0.23, 0.95, 0], r: [0, 0, x * -0.2], a: 1 });
    k.box(0.3, 0.035, 0.25, { p: [0, 0.78, 0], g: 1 });
    k.box(0.15, 0.14, 0.15, { p: [0, 1.04, 0] });
    k.box(0.16, 0.03, 0.04, { p: [0, 1.05, 0.065], g: 1 });
    k.cyl(0.1, 0.085, 0.06, { p: [0, 1.14, 0], seg: 6, a: 1, ...F });
    k.box(0.04, 0.26, 0.04, { p: [0, 1.3, 0], g: 0.6 });
    k.box(0.17, 0.04, 0.04, { p: [0, 1.35, 0], g: 0.6 });
    k.octa(0.025, { p: [0, 1.45, 0], g: 1 });
  }
  return k.build();
}

// ======================================================================= FANTASY — stone & gold
const plinth = (k) => { k.lathe([[0, 0], [0.33, 0], [0.33, 0.07], [0.3, 0.095], [0.24, 0.1], [0, 0.1]], { seg: 8, flat: true }); k.torus(0.31, 0.012, { p: [0, 0.075, 0], a: 1, rs: 4, ts: 8, r: [0, Math.PI / 8, 0] }); };
function fantasy(type) {
  const k = new Kit(); plinth(k);
  if (type === 1) { // footsoldier: helm + round shield
    k.lathe([[0.2, 0.09], [0.18, 0.18], [0.14, 0.32], [0.11, 0.42], [0.06, 0.45], [0, 0.45]], { seg: 20 });
    k.sphere(0.1, { p: [0, 0.53, 0] });
    k.torus(0.1, 0.016, { p: [0, 0.515, 0], a: 1, rs: 6 });
    k.box(0.02, 0.07, 0.03, { p: [0, 0.5, 0.1], a: 1 });
    k.cyl(0.115, 0.115, 0.03, { p: [0, 0.27, 0.15], r: [Math.PI / 2, 0, 0], seg: 20 });
    k.cyl(0.04, 0.04, 0.035, { p: [0, 0.27, 0.165], r: [Math.PI / 2, 0, 0], a: 1, seg: 12 });
    k.torus(0.115, 0.012, { p: [0, 0.27, 0.15], r: [Math.PI / 2, 0, 0], a: 1, rs: 5, ts: 24 });
  } else if (type === 2) { // dragon head
    profileHead(k, (s) => {
      s.moveTo(-0.17, 0); s.lineTo(0.15, 0);
      s.quadraticCurveTo(0.16, 0.15, 0.08, 0.26);
      s.quadraticCurveTo(0.18, 0.30, 0.34, 0.33);
      s.lineTo(0.40, 0.36); s.lineTo(0.26, 0.392); s.lineTo(0.42, 0.43);
      s.quadraticCurveTo(0.41, 0.49, 0.30, 0.51);
      s.quadraticCurveTo(0.20, 0.53, 0.12, 0.60);
      s.lineTo(0.05, 0.64);
      s.quadraticCurveTo(-0.06, 0.66, -0.12, 0.56);
      s.quadraticCurveTo(-0.22, 0.40, -0.21, 0.20);
      s.quadraticCurveTo(-0.20, 0.06, -0.17, 0);
    }, { p: [0, 0.09, 0], depth: 0.15, bevel: 0.03, taper: (x, y) => (x > 0.12 ? 1 - (x - 0.12) * 1.2 : 1) * (y < 0.1 ? 1.12 : 1) });
    k.at({ p: [0, 0.09, 0], r: [0, -Math.PI / 2, 0] }, () => {
      for (const z of [-1, 1]) {
        k.cone(0.034, 0.27, { p: [0.0, 0.6, z * 0.055], r: [z * 0.18, 0, 0.95], a: 1, seg: 10 });
        k.sphere(0.024, { p: [0.17, 0.54, z * 0.098], a: 1, g: 0.8, ws: 10, hs: 8 });
      }
      for (const [x, y] of [[-0.15, 0.48], [-0.2, 0.36], [-0.215, 0.24]]) k.cone(0.03, 0.09, { p: [x, y, 0], r: [0, 0, Math.PI / 2 + 0.25], a: 1, seg: 6 });
    });
  } else if (type === 3) { // wizard in a pointed hat
    k.lathe([[0.22, 0.09], [0.2, 0.16], [0.155, 0.34], [0.12, 0.5], [0.135, 0.55], [0.06, 0.585], [0, 0.59]], { seg: 20 });
    k.sphere(0.078, { p: [0, 0.635, 0] });
    k.cone(0.06, 0.16, { p: [0, 0.6, 0.05], r: [Math.PI - 0.25, 0, 0], d: 0.0, seg: 10, s: [1, 1, 0.7] });
    k.cyl(0.15, 0.15, 0.025, { p: [0, 0.69, 0], a: 1, seg: 24 });
    k.cone(0.12, 0.36, { p: [0, 0.7, 0], r: [-0.08, 0, 0], seg: 20 });
    k.sphere(0.028, { p: [0, 1.075, -0.03], a: 1, g: 0.6, ws: 10, hs: 8 });
    k.torus(0.155, 0.014, { p: [0, 0.3, 0], s: [1, 1, 1], a: 1, rs: 5, ts: 24 });
  } else if (type === 4) { // castle tower
    k.lathe([[0.25, 0.09], [0.23, 0.13], [0.21, 0.66], [0.26, 0.71], [0.26, 0.79], [0.18, 0.79], [0.18, 0.76], [0, 0.76]], { seg: 8, flat: true });
    k.ring(4, 0.215, 0.86, () => k.box(0.14, 0.15, 0.09), Math.PI / 8);
    k.ring(4, 0.215, 0.86, () => k.box(0.05, 0.1, 0.092, { p: [0, -0.02, 0.0] }), Math.PI / 8 + Math.PI / 4);
    k.torus(0.218, 0.014, { p: [0, 0.45, 0], a: 1, rs: 4, ts: 8, r: [0, Math.PI / 8, 0] });
    k.box(0.09, 0.15, 0.03, { p: [0, 0.165, 0.222], d: 0.9 }); k.cyl(0.045, 0.045, 0.03, { p: [0, 0.24, 0.222], r: [Math.PI / 2, 0, 0], d: 0.9, seg: 12 });
    k.box(0.02, 0.07, 0.02, { p: [0, 0.58, 0.215], d: 0.9 });
  } else if (type === 5) { // queen with a spiked crown
    k.lathe([[0.25, 0.09], [0.23, 0.14], [0.17, 0.4], [0.12, 0.66], [0.11, 0.74], [0.15, 0.8], [0.12, 0.85], [0.05, 0.88], [0, 0.885]], { seg: 24 });
    k.sphere(0.085, { p: [0, 0.95, 0] });
    k.lathe([[0.075, 1.0], [0.1, 1.01], [0.105, 1.06], [0.085, 1.06], [0.07, 1.02]], { a: 1, seg: 20 });
    k.ring(7, 0.095, 1.06, () => k.cone(0.022, 0.16, { r: [0.2, 0, 0], a: 1, seg: 6 }));
    k.ring(7, 0.115, 1.215, () => k.sphere(0.014, { a: 1, g: 0.5, ws: 6, hs: 4 }));
    k.sphere(0.03, { p: [0, 1.12, 0], a: 1, g: 0.7, ws: 10, hs: 8 });
    k.torus(0.15, 0.014, { p: [0, 0.79, 0], a: 1, rs: 5 });
  } else if (type === 6) { // king with crown and cross
    k.lathe([[0.26, 0.09], [0.24, 0.14], [0.18, 0.42], [0.13, 0.72], [0.12, 0.82], [0.17, 0.88], [0.13, 0.93], [0.05, 0.96], [0, 0.965]], { seg: 24 });
    k.torus(0.2, 0.014, { p: [0, 0.5, 0], r: [0.35, 0, 0], a: 1, rs: 5, ts: 28 });
    k.sphere(0.09, { p: [0, 1.04, 0] });
    k.lathe([[0.08, 1.09], [0.11, 1.1], [0.115, 1.17], [0.095, 1.17], [0.075, 1.11]], { a: 1, seg: 20 });
    k.ring(5, 0.105, 1.17, () => k.cone(0.024, 0.08, { a: 1, seg: 6 }));
    k.box(0.05, 0.2, 0.05, { p: [0, 1.32, 0], a: 1 });
    k.box(0.15, 0.05, 0.05, { p: [0, 1.35, 0], a: 1 });
    k.torus(0.17, 0.016, { p: [0, 0.875, 0], a: 1, rs: 5 });
  }
  return k.build();
}

// ======================================================================= MAGIC — crystals, robes and runes (faceted)
const runeBase = (k) => { k.lathe([[0, 0], [0.31, 0], [0.31, 0.05], [0.26, 0.08], [0.2, 0.1], [0, 0.1]], { seg: 6, flat: true, r: [0, Math.PI / 6, 0] }); k.torus(0.3, 0.01, { p: [0, 0.052, 0], g: 1, rs: 4, ts: 6 }); };
function magic(type) {
  const k = new Kit(); runeBase(k);
  if (type === 1) { // floating orb on a crystal stem
    k.cyl(0.05, 0.085, 0.16, { p: [0, 0.18, 0], seg: 6, flat: true, a: 1 });
    k.ico(0.13, 1, { p: [0, 0.43, 0], g: 0.55 });
    k.ring(3, 0.17, 0.43, () => k.octa(0.025, { s: [0.7, 1.5, 0.7], g: 1 }));
  } else if (type === 2) { // crystal unicorn
    profileHead(k, (s) => {
      s.moveTo(-0.19, 0); s.lineTo(0.16, 0);
      s.lineTo(0.12, 0.24); s.lineTo(0.25, 0.3); s.lineTo(0.33, 0.37); s.lineTo(0.31, 0.46);
      s.lineTo(0.12, 0.6); s.lineTo(0.08, 0.69); s.lineTo(0.03, 0.62);
      s.lineTo(-0.12, 0.55); s.lineTo(-0.23, 0.3); s.lineTo(-0.19, 0);
    }, { p: [0, 0.1, 0], depth: 0.15, bevel: 0.03, flat: true, taper: (x, y) => (x > 0.13 ? 1 - (x - 0.13) * 1.4 : 1) * (y < 0.1 ? 1.1 : 1) });
    k.at({ p: [0, 0.1, 0], r: [0, -Math.PI / 2, 0] }, () => {
      k.cone(0.03, 0.3, { p: [0.15, 0.58, 0], r: [0, 0, -0.62], a: 1, g: 0.8, seg: 6 });
      for (const z of [-1, 1]) k.octa(0.022, { p: [0.14, 0.5, z * 0.1], g: 1 });
      for (let i = 0; i < 4; i++) k.octa(0.06, { p: [-0.13 - i * 0.03, 0.52 - i * 0.12, 0], s: [0.5, 1.2, 0.6], r: [0, 0, 0.5], g: 0.6 });
    });
  } else if (type === 3) { // crystal obelisk
    k.cyl(0.1, 0.135, 0.6, { p: [0, 0.4, 0], seg: 6, flat: true });
    k.cone(0.1, 0.36, { p: [0, 0.7, 0], seg: 6, flat: true });
    k.cyl(0.115, 0.115, 0.02, { p: [0, 0.69, 0], seg: 6, g: 1 });
    k.ring(3, 0.14, 0.3, () => k.octa(0.06, { s: [0.5, 1.6, 0.5], r: [0.35, 0, 0], g: 0.5 }), 0.4);
    k.octa(0.035, { p: [0, 1.1, 0], s: [1, 1.4, 1], g: 1 });
  } else if (type === 4) { // arcane tower
    k.cyl(0.2, 0.24, 0.64, { p: [0, 0.42, 0], seg: 6, flat: true });
    k.cyl(0.27, 0.22, 0.07, { p: [0, 0.77, 0], seg: 6, flat: true, a: 1 });
    k.ring(6, 0.215, 0.865, () => k.box(0.1, 0.12, 0.07), 0);
    k.ring(3, 0.215, 0.44, () => k.box(0.04, 0.12, 0.02, { g: 1 }), Math.PI / 6);
    k.cyl(0.205, 0.205, 0.02, { p: [0, 0.2, 0], seg: 6, g: 0.8 });
  } else if (type === 5) { // sorceress with a floating crystal crown
    k.lathe([[0.25, 0.09], [0.2, 0.2], [0.135, 0.55], [0.1, 0.76], [0.145, 0.82], [0.05, 0.865], [0, 0.87]], { seg: 10, flat: true });
    k.ico(0.08, 0, { p: [0, 0.94, 0] });
    k.torus(0.12, 0.008, { p: [0, 1.06, 0], g: 1, rs: 4, ts: 30 });
    k.ring(6, 0.12, 1.06, () => k.octa(0.04, { s: [0.55, 1.5, 0.55], g: 0.9 }));
    k.octa(0.06, { p: [0, 1.17, 0], s: [0.6, 1.7, 0.6], g: 1 });
    k.torus(0.15, 0.012, { p: [0, 0.8, 0], a: 1, rs: 4, ts: 10 });
  } else if (type === 6) { // archmage with a floating star-cross
    k.lathe([[0.27, 0.09], [0.22, 0.22], [0.15, 0.6], [0.11, 0.86], [0.16, 0.93], [0.05, 0.975], [0, 0.98]], { seg: 10, flat: true });
    k.ico(0.085, 0, { p: [0, 1.06, 0] });
    k.lathe([[0.075, 1.11], [0.1, 1.12], [0.105, 1.17], [0.085, 1.17], [0.07, 1.13]], { a: 1, seg: 10, flat: true });
    k.octa(0.11, { p: [0, 1.34, 0], s: [0.35, 1.25, 0.35], g: 1 });
    k.octa(0.11, { p: [0, 1.36, 0], s: [0.95, 0.3, 0.3], g: 1 });
    k.torus(0.17, 0.014, { p: [0, 0.92, 0], a: 1, rs: 4, ts: 10 });
    k.ring(4, 0.2, 0.5, () => k.octa(0.03, { s: [0.6, 1.4, 0.6], g: 0.8 }), Math.PI / 4);
  }
  return k.build();
}

export const SETS = { classic, space, galaxy, scifi, fantasy, magic };
const cache = new Map();
export function pieceGeometry(set, type) {
  const key = set + type;
  if (!cache.has(key)) cache.set(key, (SETS[set] || classic)(type));
  return cache.get(key);
}
