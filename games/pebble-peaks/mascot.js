// Cobble — the Pebble Peaks mascot: a small round river-stone creature with a moss cap and a two-leaf sprout.
// Procedural rig: root (feet, yaw) → squash (volume-preserving spring) → body (lean/bob/flip) → parts.
// FABLE: replace the procedural motion here with authored clips (idle fidget, run cycle with arm pumps, double-jump
// somersault, ground-pound windup spin, roll curl, hurt flinch, celebrate dance, sleepy idle after 10 s).
import { THREE, canvasTexture } from '/shared/sd-kit.js';
import { mx_noise_float, positionLocal, mix, smoothstep, uniform } from 'three/tsl';

const M = (o) => new THREE.MeshStandardNodeMaterial(o);

export function buildMascot({ body = '#b3a9c9', moss = '#6fcf4f', golden = false } = {}) {
  const root = new THREE.Group(), squash = new THREE.Group(), bodyG = new THREE.Group();
  root.add(squash); squash.add(bodyG);
  const speckle = canvasTexture(256, 128, (x, w, h) => {
    x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) { const g = 170 + Math.random() * 70; x.fillStyle = `rgba(${g - 40},${g - 50},${g - 20},${0.18 + Math.random() * 0.25})`; x.beginPath(); x.arc(Math.random() * w, Math.random() * h, 0.6 + Math.random() * 2.2, 0, 7); x.fill(); }
    for (let i = 0; i < 6; i++) { x.strokeStyle = 'rgba(255,255,255,.55)'; x.lineWidth = 2 + Math.random() * 3; x.beginPath(); const y0 = Math.random() * h; x.moveTo(0, y0); for (let k = 0; k <= 8; k++) x.lineTo(k * w / 8, y0 + Math.sin(k + i) * 6); x.stroke(); }
  });
  const bodyMat = M({ color: body, map: speckle, roughness: golden ? 0.25 : 0.55, metalness: golden ? 0.55 : 0 });
  const bodyGeo = new THREE.SphereGeometry(0.42, 36, 26);
  { const p = bodyGeo.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); const k = 1 + 0.04 * Math.sin(p.getX(i) * 9 + p.getZ(i) * 7) * (1 - Math.abs(y) / 0.42); p.setXYZ(i, p.getX(i) * k * 1.04, y * 0.94, p.getZ(i) * k); } bodyGeo.computeVertexNormals(); }
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat); bodyMesh.position.y = 0.46; bodyMesh.castShadow = true; bodyG.add(bodyMesh);
  // moss cap with a lumpy rim
  const mossMat = M({ color: moss, roughness: 0.95 });
  const uMoss = uniform(new THREE.Color(moss)); mossMat.colorNode = mix(uMoss.mul(0.72), uMoss.mul(1.12), smoothstep(-0.3, 0.4, mx_noise_float(positionLocal.mul(14)))); // tufty moss variation
  const capGeo = new THREE.SphereGeometry(0.445, 30, 12, 0, Math.PI * 2, 0, 1.05);
  { const p = capGeo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), y = p.getY(i); const a = Math.atan2(z, x); const rim = y < 0.25 ? 0.03 * Math.sin(a * 7) + 0.02 * Math.sin(a * 13) : 0; p.setXYZ(i, x * 1.04, y * 0.94 + rim - 0.01, z); } capGeo.computeVertexNormals(); }
  const cap = new THREE.Mesh(capGeo, mossMat); cap.position.y = 0.47; cap.rotation.x = -0.18; cap.castShadow = true; bodyG.add(cap);
  // sprout (secondary motion)
  const sprout = new THREE.Group(); sprout.position.set(0, 0.88, -0.02); bodyG.add(sprout);
  const leafMat = M({ color: new THREE.Color(moss).offsetHSL(0.02, 0.1, 0.08), roughness: 0.7, side: THREE.DoubleSide });
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.16, 6), leafMat); stem.position.y = 0.07; sprout.add(stem);
  const leafGeo = new THREE.SphereGeometry(0.1, 12, 8); leafGeo.scale(1, 0.22, 0.55);
  for (const s of [-1, 1]) { const l = new THREE.Mesh(leafGeo, leafMat); l.position.set(s * 0.085, 0.16, 0); l.rotation.z = s * 0.45; sprout.add(l); }
  // face
  const eyeW = M({ color: '#ffffff', roughness: 0.3 }), eyeB = M({ color: '#1d1b2a', roughness: 0.2 }), shine = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(2, 2, 2) });
  const face = new THREE.Group(); face.position.set(0, 0.5, 0.36); bodyG.add(face);
  const eyes = [];
  for (const s of [-1, 1]) {
    const e = new THREE.Group(); e.position.set(s * 0.13, 0.04, 0); e.rotation.y = s * 0.28; face.add(e);
    const w = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 12), eyeW); w.scale.set(0.95, 1.3, 0.55); e.add(w);
    const pu = new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 10), eyeB); pu.scale.set(0.95, 1.25, 0.5); pu.position.set(0, -0.01, 0.034); e.add(pu);
    const sh = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), shine); sh.position.set(0.018, 0.035, 0.06); e.add(sh);
    eyes.push(e);
  }
  const cheekMat = new THREE.MeshBasicNodeMaterial({ color: '#ff8fa8', transparent: true, opacity: 0.55 });
  for (const s of [-1, 1]) { const c = new THREE.Mesh(new THREE.CircleGeometry(0.045, 14), cheekMat); c.position.set(s * 0.23, -0.07, 0.035); c.rotation.y = s * 0.55; face.add(c); }
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.011, 6, 14, Math.PI), eyeB); mouth.position.set(0, -0.1, 0.045); mouth.rotation.z = Math.PI; face.add(mouth);
  // feet + hands
  const footMat = M({ color: new THREE.Color(body).multiplyScalar(0.62), roughness: 0.85 });
  const footGeo = new THREE.SphereGeometry(0.1, 14, 10); footGeo.scale(1, 0.62, 1.35);
  const feet = [-1, 1].map((s) => { const f = new THREE.Mesh(footGeo, footMat); f.position.set(s * 0.17, 0.055, 0.04); f.castShadow = true; squash.add(f); return f; });
  const handGeo = new THREE.SphereGeometry(0.075, 12, 10);
  const hands = [-1, 1].map((s) => { const h = new THREE.Mesh(handGeo, footMat); h.position.set(s * 0.43, 0.38, 0.02); h.castShadow = true; bodyG.add(h); return h; });

  const R = { root, squash, bodyG, bodyMesh, sprout, eyes, feet, hands, mouth, face, uMoss, mats: { bodyMat, mossMat, leafMat, footMat },
    sy: 1, svy: 0, lean: 0, spin: 0, roll: 0, phase: 0, blink: 0, nextBlink: 2, sprV: [0, 0], spr: [0, 0], tuck: 0, joy: 0 };
  return R;
}

/** Set body/moss colours live (remix). */
export function tintMascot(R, { body, moss, golden }) {
  R.mats.bodyMat.color.set(golden ? '#ffd35a' : body); R.mats.bodyMat.metalness = golden ? 0.6 : 0; R.mats.bodyMat.roughness = golden ? 0.28 : 0.55;
  R.mats.mossMat.color.set(moss); R.uMoss.value.set(moss); R.mats.leafMat.color.set(new THREE.Color(moss).offsetHSL(0.02, 0.1, 0.08)); R.mats.footMat.color.set(new THREE.Color(golden ? '#c9962a' : body).multiplyScalar(0.62));
}
/** Kick the squash spring: >1 stretch, <1 squash. */
export function squashTo(R, sy, v = 0) { R.sy = sy; R.svy = v; }

/** Per-frame procedural animation. st = {speed, grounded, vy, state, yaw, t, hurtBlink, dbl} */
export function animateMascot(R, dt, st) {
  // squash spring (underdamped → a little wobble)
  const k = 420, c = 15; R.svy += ((1 - R.sy) * k - R.svy * c) * dt; R.sy += R.svy * dt;
  let sy = R.sy;
  if (st.state === 'pound' && st.st < 0.17) sy = 0.82; // balled-up windup
  if (!st.grounded && st.state === 'normal') sy *= 1 + Math.min(0.18, Math.abs(st.vy) * 0.012); // stretch along velocity
  const sxz = 1 / Math.sqrt(Math.max(0.35, sy));
  R.squash.scale.set(sxz, sy, sxz);
  R.root.rotation.y = st.yaw;
  // run cycle
  const sp = st.speed; R.phase += dt * (4 + sp * 1.55);
  const runAmt = st.grounded ? Math.min(1, sp / 6) : 0;
  const s1 = Math.sin(R.phase * 2), c1 = Math.cos(R.phase * 2);
  R.feet[0].position.z = 0.04 + s1 * 0.16 * runAmt; R.feet[1].position.z = 0.04 - s1 * 0.16 * runAmt;
  R.feet[0].position.y = 0.055 + Math.max(0, c1) * 0.09 * runAmt; R.feet[1].position.y = 0.055 + Math.max(0, -c1) * 0.09 * runAmt;
  const bob = st.grounded ? Math.abs(Math.sin(R.phase * 2)) * 0.05 * runAmt + Math.sin(st.t * 2.2) * 0.012 * (1 - runAmt) : 0;
  R.bodyG.position.y = bob;
  // lean into motion
  const leanT = st.state === 'roll' ? 0 : Math.min(0.32, sp * 0.028) * (st.grounded ? 1 : 0.6);
  R.lean += (leanT - R.lean) * Math.min(1, dt * 10);
  // flips / roll / pound spin
  if (st.state === 'roll') R.roll += dt * 22; else R.roll = 0;
  if (st.flip > 0) R.spin = (1 - st.flip) * Math.PI * 2; else R.spin = 0;
  R.bodyG.rotation.x = R.lean + R.roll + R.spin; R.bodyG.position.z = 0;
  if (st.state === 'roll') { R.bodyG.position.y = 0.02; }
  R.bodyG.rotation.y = st.state === 'pound' && st.st < 0.17 ? st.st / 0.17 * Math.PI * 2 : 0;
  // tuck limbs when rolling / pounding
  const tuckT = st.state === 'roll' || (st.state === 'pound') ? 1 : 0; R.tuck += (tuckT - R.tuck) * Math.min(1, dt * 18);
  const ls = 1 - R.tuck * 0.9; R.feet.forEach((f) => f.scale.setScalar(ls));
  // hands: swing opposite feet, flail up in the air, wave when celebrating
  const air = st.grounded ? 0 : 1;
  R.hands.forEach((h, i) => { const s = i ? 1 : -1; h.scale.setScalar(ls);
    h.position.y = 0.38 + air * 0.16 + (R.joy > 0 ? 0.25 + Math.sin(st.t * 18 + i * 3) * 0.06 : 0);
    h.position.z = 0.02 - (i ? -1 : 1) * s1 * 0.12 * runAmt; h.position.x = s * (0.43 + air * 0.04); });
  R.joy = Math.max(0, R.joy - dt);
  // blink
  R.nextBlink -= dt; if (R.nextBlink < 0) { R.blink = 0.12; R.nextBlink = 1.8 + Math.random() * 3; }
  R.blink = Math.max(0, R.blink - dt);
  const ey = R.blink > 0 || st.hurt ? 0.15 : 1; R.eyes.forEach((e) => { e.scale.y += (ey - e.scale.y) * Math.min(1, dt * 30); });
  // sprout secondary motion (spring driven by vertical accel + speed)
  const tx = -st.vy * 0.02 - sp * 0.03, kz = 0; R.sprV[0] += ((tx - R.spr[0]) * 160 - R.sprV[0] * 6) * dt; R.spr[0] += R.sprV[0] * dt;
  R.sprout.rotation.x = Math.max(-0.9, Math.min(0.9, R.spr[0])); R.sprout.rotation.z = Math.sin(st.t * 1.7) * 0.08 + kz;
  // hurt blink (invulnerability)
  R.root.visible = !(st.inv > 0 && Math.floor(st.inv * 14) % 2 === 0);
}
