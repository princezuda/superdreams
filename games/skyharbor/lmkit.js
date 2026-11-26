// Landmark kit: the helper vocabulary every landmark builder receives (K), plus bake() which merges static meshes
// per material so a 100-primitive monument costs ~6 draw calls. Builders stay import-free (data-driven catalogue).
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as S from './shaders.js';
import { mulberry32 } from './noise.js';
import { uniform } from 'three/tsl';

const matCache = new Map();
const glowCache = new Map();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

export function stdMat(color, o = {}) {
  const key = [color, o.r ?? 0.8, o.m ?? 0, o.f ? 1 : 0, o.e ?? '', o.ei ?? '', o.ed ?? ''].join('|');
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardNodeMaterial({ color, roughness: o.r ?? 0.8, metalness: o.m ?? 0, flatShading: !!o.f });
  if (o.e != null) m.emissiveNode = uniform(new THREE.Color(o.e)).mul(S.U.night.mul(o.ei ?? 2).add(o.ed ?? 0.05));
  matCache.set(key, m); return m;
}

function place(p, mesh, x = 0, y = 0, z = 0, o = {}) {
  mesh.position.set(x, y, z);
  if (o.rot) mesh.rotation.set(o.rot.x || 0, o.rot.y || 0, o.rot.z || 0);
  if (o.scale) Array.isArray(o.scale) ? mesh.scale.set(...o.scale) : mesh.scale.setScalar(o.scale);
  mesh.castShadow = o.shadow !== false && !mesh.material.transparent;
  mesh.receiveShadow = true;
  p.add(mesh); return mesh;
}
export function jitter(geo, amp, seed = 1) {
  const P = geo.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 53.7) * 43758.5453;
    const r = (a) => ((((Math.sin(h + a) * 1e4) % 1) + 1) % 1) - 0.5;
    P.setXYZ(i, x + r(1) * amp, y + r(2) * amp * 0.6, z + r(3) * amp);
  }
  geo.computeVertexNormals(); return geo;
}

export function makeKit({ seed = 1, planetMaterial = null } = {}) {
  const rng = mulberry32(seed);
  const K = {
    THREE, U: S.U, rng,
    root() { const g = new THREE.Group(); g.userData.anims = []; g.userData.lights = []; K._root = g; return g; },
    mat: stdMat,
    glow(color, o = {}) { const k = color + JSON.stringify(o); if (!glowCache.has(k)) glowCache.set(k, S.glowMaterial(color, o)); return glowCache.get(k); },
    flow: (a, b, o) => S.flowMaterial(a, b, o), aurora: () => S.auroraRibbonMaterial(), crystal: (c, o) => S.crystalMaterial(c, o),
    stained: (c) => S.stainedGlassMaterial(c), chase: (b, a, o) => S.chaseMaterial(b, a, o), pulse: (a, b, o) => S.pulseMaterial(a, b, o),
    beacon: (c, o) => S.beaconMaterial(c, o), beam: (c, o) => S.beamMaterial(c, o), pool: (c, o) => S.poolMaterial(c, o),
    water: (kind = 'oasis') => S.waterMaterial(kind),
    planet: (type, s = 1) => { const r = S.planetMaterial(type, { seed: s, fogged: true }); r.u.ambient.value = 0.12; return r; },
    mesh: (p, geo, m, x, y, z, o) => place(p, new THREE.Mesh(geo, m), x, y, z, o),
    box: (p, w, h, d, m, x, y, z, o = {}) => place(p, new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m), x, y, z, o),
    cyl: (p, rt, rb, h, m, x, y, z, o = {}) => place(p, new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, o.seg ?? 16, 1, !!o.open, o.ts ?? 0, o.tl ?? Math.PI * 2), m), x, y, z, o),
    cone: (p, r, h, m, x, y, z, o = {}) => place(p, new THREE.Mesh(new THREE.ConeGeometry(r, h, o.seg ?? 16), m), x, y, z, o),
    sph: (p, r, m, x, y, z, o = {}) => place(p, new THREE.Mesh(new THREE.SphereGeometry(r, o.w ?? 24, o.h ?? 16, o.ps ?? 0, o.pl ?? Math.PI * 2, o.ts ?? 0, o.tl ?? Math.PI), m), x, y, z, o),
    tor: (p, R, t, m, x, y, z, o = {}) => place(p, new THREE.Mesh(new THREE.TorusGeometry(R, t, o.rs ?? 10, o.ts ?? 48, o.arc ?? Math.PI * 2), m), x, y, z, o),
    lathe: (p, pts, m, x, y, z, o = {}) => place(p, new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), o.seg ?? 32, o.ps ?? 0, o.pl ?? Math.PI * 2), m), x, y, z, o),
    tube(p, pts, r, m, o = {}) {
      const curve = new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(...q)), !!o.closed);
      return place(p, new THREE.Mesh(new THREE.TubeGeometry(curve, o.seg ?? 32, r, o.rseg ?? 8, !!o.closed), m), 0, 0, 0, o);
    },
    extrude(p, pts, depth, m, x, y, z, o = {}) {
      const sh = new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b)));
      const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 8 }); g.translate(0, 0, -depth / 2);
      return place(p, new THREE.Mesh(g, m), x, y, z, o);
    },
    strut(p, a, b, r, m, o = {}) {
      const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(o.rt ?? r, r, A.distanceTo(B), o.seg ?? 8), m);
      mesh.position.copy(A).add(B).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(UP, B.clone().sub(A).normalize());
      mesh.castShadow = !m.transparent; mesh.receiveShadow = true; p.add(mesh); return mesh;
    },
    // instanced repetition: list of {x,y,z, rx,ry,rz, s | sx,sy,sz, color}
    inst(p, geo, m, list, o = {}) {
      const im = new THREE.InstancedMesh(geo, m, list.length);
      list.forEach((it, i) => {
        _e.set(it.rx || 0, it.ry || 0, it.rz || 0); _q.setFromEuler(_e);
        const s = it.s ?? 1; _s.set(it.sx ?? s, it.sy ?? s, it.sz ?? s);
        _m.compose(_v.set(it.x || 0, it.y || 0, it.z || 0), _q, _s); im.setMatrixAt(i, _m);
        if (it.color != null) im.setColorAt(i, new THREE.Color(it.color));
      });
      im.castShadow = o.shadow ?? !m.transparent; im.receiveShadow = true;
      im.computeBoundingSphere(); p.add(im); return im;
    },
    dyn(p, x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.position.set(x, y, z); g.userData.dyn = true; p.add(g); return g; },
    anim(fn) { K._root.userData.anims.push(fn); },
    light(x, y, z, color, intensity = 1) { K._root.userData.lights.push({ pos: new THREE.Vector3(x, y, z), color: new THREE.Color(color), intensity }); },
    jitter,
    planetMaterial,
  };
  return K;
}

// Merge every static mesh under `root` (not crossing dyn groups) into one mesh per material.
function normalizeGeo(g) {
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  g.morphAttributes = {}; return g;
}
export function bake(root) {
  root.updateMatrixWorld(true);
  const proc = (node) => {
    const meshes = [], dyns = [];
    const walk = (o) => { for (const c of o.children) { if (c.userData.dyn) { dyns.push(c); continue; } if (c.isMesh && !c.isInstancedMesh && !c.userData.keep) meshes.push(c); walk(c); } };
    walk(node);
    const inv = new THREE.Matrix4().copy(node.matrixWorld).invert();
    const groups = new Map();
    for (const m of meshes) { if (!groups.has(m.material)) groups.set(m.material, []); groups.get(m.material).push(m); }
    for (const [mat, list] of groups) {
      if (list.length < 2) continue;
      let geos = list.map((m) => { const g = normalizeGeo(m.geometry.clone()); g.applyMatrix4(_m.multiplyMatrices(inv, m.matrixWorld)); return g; });
      if (geos.some((g) => !g.index)) geos = geos.map((g) => (g.index ? g.toNonIndexed() : g));
      const merged = mergeGeometries(geos);
      if (!merged) continue;
      const cast = list.some((m) => m.castShadow);
      list.forEach((m) => { m.parent.remove(m); m.geometry.dispose(); });
      const mm = new THREE.Mesh(merged, mat); mm.castShadow = cast; mm.receiveShadow = true; node.add(mm);
    }
    dyns.forEach(proc);
  };
  proc(root);
  return root;
}
