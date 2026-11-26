// Instanced, procedurally-posed soldiers and drones. Every body part is one InstancedMesh shared by
// all actors (≈11 draw calls for any number of soldiers). Limbs are solved with 2-bone IK so hands stay
// on the weapon and feet stay planted while walking/crouching. Hitboxes are derived from the same pose.
// FABLE: replace procedural pose with authored animation clips (walk/run/crouch-walk/reload/throw/death)
import { THREE } from '/shared/sd-kit.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const V = () => new THREE.Vector3();
const _a = V(), _b = V(), _c = V(), _d = V(), _e = V(), _f = V(), _g = V(), _h = V(), _k = V(), _pole = V(), _side = V(), _fw = V(), _upv = V(0, 1, 0), _down = V(0, -1, 0);
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _s = V(1, 1, 1), _col = new THREE.Color();
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);

function paint(geo, c) { geo = geo.index ? geo.toNonIndexed() : geo; const n = geo.attributes.position.count; const a = new Float32Array(n * 3); const col = new THREE.Color(c); for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; } geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); if (geo.attributes.uv) geo.deleteAttribute('uv'); return geo; }
const T = (g, x, y, z, rx = 0, ry = 0, rz = 0) => { g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); return g; };
const RB = (w, h, d, r = 0.03) => new RoundedBoxGeometry(w, h, d, 2, r);
const merge = (list) => mergeGeometries(list.map((g) => g.index ? g.toNonIndexed() : g));

// --- part geometry (all built facing -Z, y up; limbs hang along -Y from their joint) ---
function soldierParts() {
  const FAB = 0xffffff, GEAR = 0x6a6a62, DARK = 0x2a2a2a, BOOT = 0x1c1a18, SKIN = 0x3a2e28;
  const pelvis = merge([paint(RB(0.32, 0.2, 0.22, 0.05), FAB), paint(T(RB(0.34, 0.06, 0.24, 0.02), 0, 0.07, 0), DARK), paint(T(RB(0.08, 0.1, 0.06), 0.12, 0.0, -0.13), GEAR), paint(T(RB(0.08, 0.1, 0.06), -0.12, 0.0, -0.13), GEAR)]);
  const torso = merge([
    paint(T(RB(0.31, 0.22, 0.21, 0.06), 0, 0.1, 0), FAB),
    paint(T(RB(0.4, 0.36, 0.25, 0.07), 0, 0.35, 0), FAB),
    paint(T(RB(0.42, 0.3, 0.3, 0.04), 0, 0.33, 0), GEAR), // plate carrier
    paint(T(RB(0.09, 0.11, 0.06, 0.015), -0.1, 0.26, -0.17), DARK), paint(T(RB(0.09, 0.11, 0.06, 0.015), 0.0, 0.26, -0.17), DARK), paint(T(RB(0.09, 0.11, 0.06, 0.015), 0.1, 0.26, -0.17), DARK),
    paint(T(RB(0.3, 0.38, 0.16, 0.05), 0, 0.34, 0.22), GEAR), // pack
    paint(T(RB(0.22, 0.12, 0.12, 0.03), 0, 0.58, 0.22), DARK), // pack roll
    paint(T(new THREE.SphereGeometry(0.09, 10, 8).scale(1.1, 0.75, 1.15), 0.23, 0.5, 0), FAB), paint(T(new THREE.SphereGeometry(0.09, 10, 8).scale(1.1, 0.75, 1.15), -0.23, 0.5, 0), FAB),
    paint(T(new THREE.CylinderGeometry(0.07, 0.08, 0.1, 10), 0, 0.56, 0), DARK),
  ]);
  const head = merge([
    paint(new THREE.SphereGeometry(0.105, 12, 10).scale(0.95, 1.05, 1.0), SKIN),
    paint(T(new THREE.SphereGeometry(0.135, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(1, 0.95, 1.08), 0, 0.02, 0.01), GEAR), // helmet
    paint(T(RB(0.27, 0.025, 0.24, 0.01), 0, 0.0, 0.01), DARK), // brim
    paint(T(RB(0.06, 0.05, 0.05, 0.01), 0, 0.1, -0.12), DARK), // mount
    paint(T(RB(0.14, 0.07, 0.06, 0.02), 0, -0.07, -0.08), DARK), // face mask
  ]);
  const visor = merge([paint(T(RB(0.18, 0.04, 0.03, 0.01), 0, 0.02, -0.1), 0xffffff), paint(T(RB(0.03, 0.03, 0.03, 0.01), 0.0, 0.14, 0.0), 0xffffff)]);
  const upperArm = merge([paint(T(new THREE.CapsuleGeometry(0.058, 0.2, 3, 8), 0, -0.14, 0), FAB), paint(T(RB(0.1, 0.07, 0.1, 0.02), 0, -0.06, 0), GEAR)]);
  const foreArm = merge([paint(T(new THREE.CapsuleGeometry(0.05, 0.19, 3, 8), 0, -0.13, 0), FAB), paint(T(new THREE.SphereGeometry(0.055, 8, 6).scale(1, 1.2, 0.9), 0, -0.28, 0), BOOT)]);
  const thigh = merge([paint(T(new THREE.CapsuleGeometry(0.085, 0.3, 3, 8), 0, -0.21, 0), FAB), paint(T(RB(0.1, 0.12, 0.06, 0.02), 0.09, -0.18, 0), GEAR), paint(T(RB(0.11, 0.1, 0.06, 0.02), 0, -0.42, -0.06), DARK)]);
  const shin = merge([paint(T(new THREE.CapsuleGeometry(0.066, 0.3, 3, 8), 0, -0.19, 0), FAB), paint(T(RB(0.12, 0.12, 0.27, 0.03), 0, -0.4, -0.05), BOOT)]);
  const gun = merge([
    paint(T(RB(0.06, 0.09, 0.42, 0.01), 0, 0, -0.18), 0x26282a), paint(T(new THREE.CylinderGeometry(0.013, 0.013, 0.32, 6), 0, 0.01, -0.53, Math.PI / 2), 0x18191a),
    paint(T(RB(0.045, 0.16, 0.07, 0.01), 0, -0.11, -0.2, 0.25), 0x1e1f20), paint(T(RB(0.05, 0.11, 0.18, 0.01), 0, -0.02, 0.12), 0x2e3032),
    paint(T(RB(0.04, 0.05, 0.1, 0.01), 0, 0.075, -0.16), 0x18191a), paint(T(RB(0.05, 0.05, 0.2, 0.01), 0, -0.02, -0.38), 0x2e3032),
  ]);
  return { pelvis, torso, head, visor, upperArm, foreArm, thigh, shin, gun };
}
function droneParts() {
  const body = merge([
    paint(RB(0.5, 0.16, 0.56, 0.06), 0x9a9ea4), paint(T(RB(0.3, 0.1, 0.3, 0.04), 0, 0.11, 0.02), 0x5a5e64),
    ...[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([x, z]) => paint(T(RB(0.42, 0.05, 0.06, 0.02), x * 0.3, 0.02, z * 0.3, 0, Math.atan2(z, x) * -1 + 0, 0), 0x4a4e54)),
    ...[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([x, z]) => paint(T(new THREE.TorusGeometry(0.17, 0.02, 4, 18), x * 0.46, 0.05, z * 0.46, Math.PI / 2), 0x2a2c30)),
    paint(T(RB(0.18, 0.14, 0.16, 0.04), 0, -0.13, -0.12), 0x2a2c30), paint(T(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 6), 0, -0.14, -0.28, Math.PI / 2), 0x18191a),
  ]);
  const rotor = paint(new THREE.CylinderGeometry(0.16, 0.16, 0.008, 14), 0x1a1a1a);
  const eye = merge([paint(T(new THREE.SphereGeometry(0.05, 10, 8), 0, -0.1, -0.205), 0xffffff), paint(T(RB(0.4, 0.02, 0.02, 0.005), 0, 0.0, -0.285), 0xffffff)]);
  return { body, rotor, eye };
}

export class ActorRenderer {
  constructor(scene, maxS = 26, maxD = 14) {
    this.maxS = maxS; this.maxD = maxD;
    const fab = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.05 });
    const glow = new THREE.MeshBasicNodeMaterial({ vertexColors: true });
    const gunMat = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.5 });
    const P = soldierParts(), D = droneParts();
    const mk = (geo, mat, n, color = true, shadow = true) => { const m = new THREE.InstancedMesh(geo, mat, n); m.frustumCulled = false; m.castShadow = shadow; m.receiveShadow = true; if (color) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3); for (let i = 0; i < n; i++) m.setMatrixAt(i, HIDE); m.count = 1; scene.add(m); return m; };
    this.m = {
      pelvis: mk(P.pelvis, fab, maxS), torso: mk(P.torso, fab, maxS), head: mk(P.head, fab, maxS), visor: mk(P.visor, glow, maxS, true, false),
      upperArm: mk(P.upperArm, fab, maxS * 2), foreArm: mk(P.foreArm, fab, maxS * 2), thigh: mk(P.thigh, fab, maxS * 2), shin: mk(P.shin, fab, maxS * 2), gun: mk(P.gun, gunMat, maxS),
      dbody: mk(D.body, gunMat, maxD), drotor: mk(D.rotor, fab, maxD * 4, false), deye: mk(D.eye, glow, maxD, true, false),
    };
    this.n = {}; this.group = Object.values(this.m);
  }
  begin() { for (const k in this.m) this.n[k] = 0; }
  _put(name, mat, color) { const i = this.n[name]++; const m = this.m[name]; if (i >= m.instanceMatrix.count) return; m.setMatrixAt(i, mat); if (color && m.instanceColor) m.setColorAt(i, color); }
  end() {
    for (const k in this.m) { const m = this.m[k]; const n = this.n[k]; for (let i = n; i < m.count; i++) m.setMatrixAt(i, HIDE); m.count = Math.max(1, n); if (n === 0) m.setMatrixAt(0, HIDE); m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }
  // limb segment from joint A (world) toward B: geometry hangs along -Y
  _limb(name, A, B, color, scale = 1) {
    _d.subVectors(B, A).normalize(); _q.setFromUnitVectors(_down, _d);
    // keep limb roll stable: no extra twist needed for capsules
    _m.compose(A, _q, _s.set(scale, scale, scale)); this._put(name, _m, color);
  }
  // 2-bone IK: shoulder S, target H, lengths a,b, pole direction -> writes elbow into E
  static ik(S, H, a, b, pole, E) {
    _e.subVectors(H, S); let d = _e.length(); const maxd = (a + b) * 0.999; if (d > maxd) { _e.multiplyScalar(maxd / d); H.copy(S).add(_e); d = maxd; }
    d = Math.max(d, 0.05);
    const cosA = Math.min(1, Math.max(-1, (a * a + d * d - b * b) / (2 * a * d)));
    const dir = _e.normalize();
    _f.copy(pole).addScaledVector(dir, -pole.dot(dir)); if (_f.lengthSq() < 1e-6) _f.set(0, -1, 0); _f.normalize();
    E.copy(S).addScaledVector(dir, a * cosA).addScaledVector(_f, a * Math.sqrt(1 - cosA * cosA));
  }
  // a: actor state. Fills a.hb (hitboxes). colors: {body, accent}
  soldier(a, body, accent) {
    sci = 0; const sc = a.scale || 1;
    const yaw = a.yaw, cy = Math.cos(yaw), sy = Math.sin(yaw);
    _fw.set(-sy, 0, -cy); _side.set(cy, 0, -sy); // forward and right
    const dead = a.deadT > 0 ? Math.min(1, a.deadT / 0.65) : 0;
    const crouch = a.crouchK || 0;
    const speed = a.moveSpeed || 0, phase = a.walkPhase || 0;
    const hipH = (0.95 - crouch * 0.36 - dead * 0.3 + Math.abs(Math.sin(phase)) * Math.min(speed, 6) * 0.008) * sc;
    const base = _a.set(a.x, a.y, a.z);
    // root frame incl. lean (peek) and death fall rotation about the feet
    const lean = a.leanK || 0;
    const root = _m2.makeRotationY(yaw);
    if (dead > 0) { const fallAng = ease(dead) * (Math.PI / 2 - 0.08) * (a.fallSign || 1); _m.makeRotationAxis(_g.set(1, 0, 0), -fallAng); root.multiply(_m); }
    if (lean) { _m.makeRotationZ(-lean * 0.32); root.multiply(_m); }
    root.setPosition(base);
    const W = (x, y, z, out) => out.set(x, y, z).applyMatrix4(root);
    // aim pitch / flinch
    const pitch = dead ? 0 : (a.aimPitch || 0) + (a.flinchP || 0);
    const tp = pitch * 0.45 + (a.sprint ? -0.18 : 0) + crouch * 0.1;
    // pelvis
    const hip = W(0, hipH, 0, S());
    _q.setFromRotationMatrix(root); _m.compose(hip, _q, _s.set(sc, sc, sc)); this._put('pelvis', _m, body);
    // torso (pivot spine base) pitched toward aim + flinch yaw
    const tq = _q2.setFromEuler(_eu.set(-tp + (a.flinchP || 0) * 0.4, (a.flinchY || 0), 0)); const torsoQ = QA[0].setFromRotationMatrix(root).multiply(tq);
    const spine = W(0, hipH + 0.06 * sc, 0, S());
    _m.compose(spine, torsoQ, _s.set(sc * (a.bulk || 1), sc, sc * (a.bulk || 1))); this._put('torso', _m, body);
    const TL = (x, y, z, out) => out.set(x * sc * (a.bulk || 1), y * sc, z * sc).applyQuaternion(torsoQ).add(spine);
    // head
    const neck = TL(0, 0.6, 0, S());
    const headQ = QA[1].setFromRotationMatrix(root).multiply(_q2.setFromEuler(_eu.set(-pitch * 0.8 - (a.flinchH || 0), (a.headYaw || 0), 0)));
    const headC = S().copy(neck).add(_h.set(0, 0.13 * sc, 0).applyQuaternion(headQ));
    _m.compose(headC, headQ, _s.set(sc, sc, sc)); this._put('head', _m, body); this._put('visor', _m, accent);
    // gun frame: aims along pitch, held at chest
    const gunQ = QA[2].setFromRotationMatrix(root).multiply(_q2.setFromEuler(_eu.set(-pitch + (a.recoilK || 0) * 0.15, 0.02, 0)));
    let gunPos = TL(0.1, 0.38, -0.3, S());
    if (a.sprint && !dead) { gunQ.multiply(_q2.setFromEuler(_eu.set(-0.55, 0.6, 0.3))); gunPos = TL(0.05, 0.3, -0.22, S()); }
    if (a.throwT > 0) { gunPos = TL(0.12, 0.22, -0.16, S()); gunQ.multiply(_q2.setFromEuler(_eu.set(-0.9, 0.3, 0))); }
    if (dead) { gunPos = TL(0.34, 0.25, -0.1, S()); gunQ.setFromRotationMatrix(root).multiply(_q2.setFromEuler(_eu.set(-Math.PI / 2, 0, Math.PI / 2))); }
    gunPos.addScaledVector(_k.set(0, 0, 1).applyQuaternion(gunQ), (a.recoilK || 0) * 0.05);
    _m.compose(gunPos, gunQ, _s.set(sc, sc, sc)); this._put('gun', _m, null);
    // arms via IK
    const shR = TL(0.22, 0.5, 0, S()), shL = TL(-0.22, 0.5, 0, S());
    const handR = S().copy(gunPos).add(_h.set(0, -0.06, 0.08).applyQuaternion(gunQ));
    const handL = a.reloadT > 0 ? TL(-0.05, 0.12 + Math.sin(a.reloadT * 9) * 0.05, -0.28, S()) : S().copy(gunPos).add(_h.set(0, -0.04, -0.34).applyQuaternion(gunQ));
    if (a.throwT > 0) { const k = a.throwT; handR.copy(TL(0.28, 0.75 + k * 0.1, 0.18 - k * 0.1, S())); }
    if (dead) { handR.copy(TL(0.5, 0.1, -0.1, S())); handL.copy(TL(-0.5, 0.2, 0.0, S())); }
    const elR = S(), elL = S();
    _pole.set(0, -1, 0).addScaledVector(_side, 0.8).addScaledVector(_fw, -0.2);
    ActorRenderer.ik(shR, handR, 0.29 * sc, 0.3 * sc, _pole, elR);
    _pole.set(0, -1, 0).addScaledVector(_side, -0.8).addScaledVector(_fw, -0.2);
    ActorRenderer.ik(shL, handL, 0.29 * sc, 0.3 * sc, _pole, elL);
    this._limb('upperArm', shR, elR, body, sc); this._limb('foreArm', elR, handR, body, sc);
    this._limb('upperArm', shL, elL, body, sc); this._limb('foreArm', elL, handL, body, sc);
    // legs: feet planted with stride
    const stride = Math.min(speed, 7.5) * 0.085 * (a.sprint ? 1.25 : 1);
    const hipR = W(0.11, hipH - 0.05, 0, S()), hipL = W(-0.11, hipH - 0.05, 0, S());
    const footR = W(0.13 + crouch * 0.05, 0.08 * sc + Math.max(0, Math.sin(phase)) * stride * 0.45, -Math.cos(phase) * stride - crouch * 0.12, S());
    const footL = W(-0.13 - crouch * 0.05, 0.08 * sc + Math.max(0, -Math.sin(phase)) * stride * 0.45, Math.cos(phase) * stride + crouch * 0.18, S());
    if (dead) { footR.copy(W(0.16, 0.1, 0.05, S())); footL.copy(W(-0.18, 0.1, -0.05, S())); }
    const knR = S(), knL = S();
    _pole.copy(_fw).multiplyScalar(1).add(_h.set(0, 0.1, 0));
    if (dead) _pole.set(0, 1, 0);
    ActorRenderer.ik(hipR, footR, 0.44 * sc, 0.44 * sc, _pole, knR); ActorRenderer.ik(hipL, footL, 0.44 * sc, 0.44 * sc, _pole, knL);
    this._limb('thigh', hipR, knR, body, sc); this._limb('shin', knR, footR, body, sc);
    this._limb('thigh', hipL, knL, body, sc); this._limb('shin', knL, footL, body, sc);
    // hitboxes (world)
    const hb = a.hb || (a.hb = { head: V(), r: 0.15, t0: V(), t1: V(), tr: 0.25, l0: V(), l1: V(), lr: 0.2, muzzle: V() });
    hb.head.copy(headC); hb.r = 0.15 * sc; hb.t0.copy(hip); hb.t1.copy(neck); hb.tr = 0.24 * sc * (a.bulk || 1);
    hb.l0.copy(hip); hb.l1.copy(footR).add(footL).multiplyScalar(0.5); hb.lr = 0.2 * sc;
    hb.muzzle.copy(gunPos).add(_h.set(0, 0.01, -0.72 * sc).applyQuaternion(gunQ));
    hb.handR = hb.handR || V(); hb.handR.copy(handR);
  }
  drone(a, accent) {
    _q.setFromEuler(_eu.set(a.tiltX || 0, a.yaw, a.tiltZ || 0, 'YXZ'));
    const sc = a.scale || 1;
    _m.compose(_a.set(a.x, a.y, a.z), _q, _s.set(sc, sc, sc)); this._put('dbody', _m, _col.setRGB(1, 1, 1)); this._put('deye', _m, accent);
    for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      _b.set(x * 0.46 * sc, 0.06 * sc, z * 0.46 * sc).applyQuaternion(_q).add(_a);
      _q2.copy(_q).multiply(_qr.setFromAxisAngle(_upv, (a.rotor || 0) * (x * z))); _m.compose(_b, _q2, _s.set(sc, sc, sc)); this._put('drotor', _m, null);
    }
    const hb = a.hb || (a.hb = { head: V(), r: 0.2, t0: V(), t1: V(), tr: 0.3, l0: V(), l1: V(), lr: 0, muzzle: V() });
    hb.head.set(a.x, a.y - 0.1 * sc, a.z); hb.r = 0.16 * sc; hb.t0.set(a.x - 0.25 * sc, a.y, a.z); hb.t1.set(a.x + 0.25 * sc, a.y, a.z); hb.tr = 0.3 * sc; hb.lr = 0;
    hb.muzzle.set(0, -0.14 * sc, -0.4 * sc).applyQuaternion(_q).add(_a);
  }
}
const _eu = new THREE.Euler(), _qr = new THREE.Quaternion();
const SC = Array.from({ length: 48 }, V); let sci = 0; const S = () => SC[sci++];
const QA = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];
const ease = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
