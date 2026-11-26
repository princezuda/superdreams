// ============================================================================================
// Superdreams animation kit — small, engine-agnostic helpers for hand-authored motion.
// Pair with the kit's tween()/wait()/hitstop()/slowmo(): choreography is plain async code, e.g.
//   async function coronation(piece) { hitstop(70); await squash(piece, 0.35, 0.2); slowmo(0.35, 0.9);
//     await cine(camera, [{ pos: [0, 3, 4], look: piece.position, dur: 0.8 }], { bars: true }); music.sting('crown'); }
// Springs, keyframes, gait and cloth are pure functions of state you own, so they also run in node tests.
// ============================================================================================
import { THREE, tween, ease, settings } from './sd-kit.js';

// ---------------------------------------------------------------- springs (critically-damped feel without tuning tweens)
/** s = { x, v }. Returns the new x. k = stiffness, c = damping (c ≈ 2·√k is critical). */
export function spring(s, target, dt, k = 170, c = 26) { const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n; for (let i = 0; i < n; i++) { s.v += ((target - s.x) * k - s.v * c) * h; s.x += s.v * h; } return s.x; }
/** Spring a Vector3 `pos` toward `target`, keeping velocity in `vel` (both THREE.Vector3). */
export function spring3(pos, vel, target, dt, k = 170, c = 26) { const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n; for (let i = 0; i < n; i++) { vel.x += ((target.x - pos.x) * k - vel.x * c) * h; vel.y += ((target.y - pos.y) * k - vel.y * c) * h; vel.z += ((target.z - pos.z) * k - vel.z * c) * h; pos.addScaledVector(vel, h); } return pos; }

// ---------------------------------------------------------------- keyframes
/** Sample keyframes [[time, value, easeFn?], …] at t. Values are numbers or equal-length arrays. Clamps at the ends; pass loop length to wrap. */
export function keys(frames, t, loop = 0) {
  if (loop) t = ((t % loop) + loop) % loop;
  if (t <= frames[0][0]) return frames[0][1]; const last = frames[frames.length - 1]; if (t >= last[0]) return last[1];
  let i = 1; while (frames[i][0] < t) i++;
  const [t0, a] = frames[i - 1], [t1, b, e = ease.inOutCubic ?? ((k) => k)] = frames[i], k = e((t - t0) / (t1 - t0));
  return Array.isArray(a) ? a.map((v, j) => v + (b[j] - v) * k) : a + (b - a) * k;
}

// ---------------------------------------------------------------- squash & stretch (volume preserving)
/** Squash an Object3D along Y (amt > 0 squashes, < 0 stretches) and spring back. Resolves when settled. */
export function squash(obj, amt = 0.3, dur = 0.28) {
  const base = obj.userData._sq ?? (obj.userData._sq = obj.scale.clone());
  return tween(dur, (k) => { const w = Math.sin(k * Math.PI) * (1 - k * 0.3), y = 1 - amt * w, xz = 1 / Math.sqrt(Math.max(y, 0.2)); obj.scale.set(base.x * xz, base.y * y, base.z * xz); }, { ease: (k) => k }).then(() => obj.scale.copy(base));
}
/** Anticipate → leap → land: hop an object to `to` (Vector3) along an arc with squash at both ends. */
export async function hop(obj, to, { height = 0.6, dur = 0.38, squashAmt = 0.22, spin = 0 } = {}) {
  const from = obj.position.clone(), r0 = obj.rotation.y; await squash(obj, squashAmt, dur * 0.3);
  await tween(dur, (k) => { obj.position.lerpVectors(from, to, k); obj.position.y += Math.sin(k * Math.PI) * height; obj.rotation.y = r0 + spin * k; const s = 1 + Math.sin(k * Math.PI) * 0.12; obj.scale.y = (obj.userData._sq?.y ?? 1) * s; }, { ease: ease.inOutQuad ?? ((k) => k) });
  obj.position.copy(to); return squash(obj, squashAmt * 1.2, dur * 0.45);
}

// ---------------------------------------------------------------- cinematic camera
let barsEl = null;
function letterbox(on) {
  if (!barsEl) { barsEl = document.createElement('div'); barsEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:40;box-shadow:inset 0 0 0 0 #000;transition:box-shadow .45s ease'; document.body.appendChild(barsEl); }
  barsEl.style.boxShadow = on ? 'inset 0 9vh 0 0 #000, inset 0 -9vh 0 0 #000' : 'inset 0 0 0 0 #000';
}
/**
 * Fly a camera through shots: [{ pos, look, fov, dur = 1, ease, hold = 0 }] (pos/look are Vector3 or [x,y,z]; look may be a live
 * Vector3 that is tracked). opts: { bars: true (letterbox), skippable: true, restore: false (return to the starting pose) }.
 * Returns a promise with .skip(). Reduced motion cuts instead of flying.
 */
export function cine(camera, shots, { bars = false, skippable = true, restore = false } = {}) {
  const v = (a) => (a?.isVector3 ? a : new THREE.Vector3(...(a || [0, 0, 0]))), start = { pos: camera.position.clone(), quat: camera.quaternion.clone(), fov: camera.fov };
  let skipped = false, active = null; const look = new THREE.Vector3(), m = new THREE.Matrix4(), q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion();
  const skip = () => { skipped = true; active?.cancel?.(); };
  const onKey = (e) => { if (e.type === 'pointerdown' || e.code === 'Escape' || e.code === 'Space' || e.code === 'Enter') skip(); };
  const run = (async () => {
    if (bars) letterbox(true); if (skippable) setTimeout(() => { if (!skipped) { addEventListener('pointerdown', onKey); addEventListener('keydown', onKey); } }, 350);
    for (const s of shots) {
      if (skipped) break; const p0 = camera.position.clone(), p1 = s.pos ? v(s.pos) : p0, f0 = camera.fov, f1 = s.fov ?? f0, tgt = s.look ? v(s.look) : null; q0.copy(camera.quaternion);
      const dur = settings.reducedMotion ? 0.001 : (s.dur ?? 1);
      active = tween(dur, (k) => {
        camera.position.lerpVectors(p0, p1, k);
        if (tgt) { look.copy(tgt); m.lookAt(camera.position, look, camera.up); q1.setFromRotationMatrix(m); camera.quaternion.slerpQuaternions(q0, q1, Math.min(1, k * 1.4)); }
        if (f1 !== f0) { camera.fov = f0 + (f1 - f0) * k; camera.updateProjectionMatrix(); }
      }, { ease: s.ease ?? ease.inOutCubic ?? ((k) => k) });
      await active; if (s.hold && !skipped) { active = tween(s.hold, () => { if (tgt) camera.lookAt(tgt); }); await active; }
    }
    removeEventListener('pointerdown', onKey); removeEventListener('keydown', onKey); if (bars) letterbox(false);
    if (restore) { camera.position.copy(start.pos); camera.quaternion.copy(start.quat); camera.fov = start.fov; camera.updateProjectionMatrix(); }
    return !skipped;
  })();
  run.skip = skip; return run;
}

// ---------------------------------------------------------------- two-bone IK + gait (procedural characters)
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
/** Joint (knee/elbow) position for a two-bone limb from `root` to `target` with segment lengths l1, l2, bending toward `pole` (a direction). Writes into `out`. */
export function ik2(root, target, l1, l2, pole, out = new THREE.Vector3()) {
  _a.subVectors(target, root); const d = Math.min(Math.max(_a.length(), Math.abs(l1 - l2) + 1e-4), l1 + l2 - 1e-4); _a.normalize();
  const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(l1 * l1 - x * x, 0));
  _b.copy(pole).addScaledVector(_a, -pole.dot(_a)); if (_b.lengthSq() < 1e-6) _b.set(0, 0, 1); _b.normalize();
  return out.copy(root).addScaledVector(_a, x).addScaledVector(_b, h);
}
/** Place a unit-length limb mesh (its geometry spans y 0→1 or is centred with `centred`) between two points. */
export function boneBetween(mesh, from, to, thickness = 1, centred = false) {
  _c.subVectors(to, from); const len = _c.length(); mesh.position.copy(centred ? _a.copy(from).addScaledVector(_c, 0.5) : from);
  mesh.quaternion.setFromUnitVectors(_up, _c.normalize()); mesh.scale.set(thickness, len, thickness); return mesh;
}
/**
 * Gait curves for a biped at `phase` (cycles; advance by speed·dt / strideLength). Returns offsets in the character's local frame:
 * { footL:{y,z}, footR:{y,z}, hipY, hipSway, lean, armL, armR, headBob }. `run` 0..1 blends walk → run; all lengths scale by `stride`.
 */
export function gait(phase, { stride = 0.5, run = 0, lift = 0.14 } = {}) {
  const TAU = Math.PI * 2, foot = (p) => { const c = ((p % 1) + 1) % 1, stance = 0.6 - 0.22 * run; // stance: foot planted, sliding back; swing: lifted, moving forward
    if (c < stance) return { z: stride * (0.5 - c / stance), y: 0 }; const k = (c - stance) / (1 - stance); return { z: stride * (-0.5 + (0.5 - 0.5 * Math.cos(k * Math.PI))), y: Math.sin(k * Math.PI) * lift * (1 + run * 0.9) }; };
  const s = Math.sin(phase * TAU);
  return { footL: foot(phase), footR: foot(phase + 0.5), hipY: -Math.abs(Math.cos(phase * TAU)) * 0.035 * (1 + run * 1.6) * (stride / 0.5), hipSway: s * 0.03 * (1 - run * 0.5), lean: 0.04 + run * 0.22,
    armL: -s * (0.5 + run * 0.6), armR: s * (0.5 + run * 0.6), headBob: Math.cos(phase * TAU * 2) * 0.012 * (1 + run) };
}

// ---------------------------------------------------------------- verlet rope & cloth (capes, banners, tails, hanging lamps)
/** Rope of n points; call update(anchor Vector3, dt, { gravity, wind: Vector3, damping }). points[0] follows the anchor. */
export function rope(n = 8, segment = 0.15) {
  const pts = Array.from({ length: n }, (_, i) => new THREE.Vector3(0, -i * segment, 0)), prev = pts.map((p) => p.clone());
  return { points: pts, update(anchor, dt, { gravity = 9, wind = null, damping = 0.985 } = {}) {
    const h = Math.min(dt, 1 / 30); pts[0].copy(anchor); prev[0].copy(anchor);
    for (let i = 1; i < n; i++) { const p = pts[i], q = prev[i]; _a.subVectors(p, q).multiplyScalar(damping); q.copy(p); p.add(_a); p.y -= gravity * h * h; if (wind) p.addScaledVector(wind, h * h); }
    for (let it = 0; it < 4; it++) for (let i = 1; i < n; i++) { _a.subVectors(pts[i], pts[i - 1]); const d = _a.length() || 1e-6; pts[i].addScaledVector(_a, (segment - d) / d * (i === 1 ? 1 : 0.5)); if (i > 1) pts[i - 1].addScaledVector(_a, -(segment - d) / d * 0.5); }
    return pts;
  } };
}
/**
 * Cloth sheet bound to a PlaneGeometry(w, h, cols, rows) mesh: pins the top row (or pass `pin(ix, iy) → bool`), then call
 * update(dt, { wind: Vector3, gravity }) each frame — it writes positions and recomputes normals. Keep it small (≤ 12×12).
 */
export function cloth(mesh, { pin = (ix, iy) => iy === 0, stiffness = 3 } = {}) {
  const g = mesh.geometry, pos = g.attributes.position, { widthSegments: cols, heightSegments: rows } = g.parameters, w = cols + 1, n = pos.count;
  const p = new Float32Array(pos.array), q = new Float32Array(pos.array), rest = new Float32Array(pos.array), pinned = new Uint8Array(n), links = [];
  const dist = (i, j) => Math.hypot(rest[i * 3] - rest[j * 3], rest[i * 3 + 1] - rest[j * 3 + 1], rest[i * 3 + 2] - rest[j * 3 + 2]);
  for (let y = 0; y <= rows; y++) for (let x = 0; x <= cols; x++) { const i = y * w + x; pinned[i] = pin(x, y) ? 1 : 0; if (x < cols) links.push([i, i + 1, dist(i, i + 1)]); if (y < rows) links.push([i, i + w, dist(i, i + w)]); if (x < cols && y < rows) links.push([i, i + w + 1, dist(i, i + w + 1)]); }
  let time = 0;
  return { update(dt, { wind = null, gravity = 6, damping = 0.97, gust = 0.5 } = {}) {
    const h = Math.min(dt, 1 / 30), hh = h * h; time += h;
    for (let i = 0; i < n; i++) { if (pinned[i]) { p[i * 3] = rest[i * 3]; p[i * 3 + 1] = rest[i * 3 + 1]; p[i * 3 + 2] = rest[i * 3 + 2]; continue; }
      const flutter = wind ? 1 + gust * Math.sin(time * 3.1 + rest[i * 3] * 4 + rest[i * 3 + 1] * 2.3) : 0;
      for (let k = 0; k < 3; k++) { const j = i * 3 + k, v = (p[j] - q[j]) * damping; q[j] = p[j]; p[j] += v + (k === 1 ? -gravity * hh : 0) + (wind ? wind.getComponent(k) * flutter * hh : 0); } }
    for (let it = 0; it < stiffness; it++) for (const [a, b, d0] of links) { const ax = a * 3, bx = b * 3, dx = p[bx] - p[ax], dy = p[bx + 1] - p[ax + 1], dz = p[bx + 2] - p[ax + 2], d = Math.hypot(dx, dy, dz) || 1e-6, f = (d - d0) / d * 0.5, wa = pinned[a] ? 0 : pinned[b] ? 2 : 1, wb = pinned[b] ? 0 : pinned[a] ? 2 : 1;
      p[ax] += dx * f * wa; p[ax + 1] += dy * f * wa; p[ax + 2] += dz * f * wa; p[bx] -= dx * f * wb; p[bx + 1] -= dy * f * wb; p[bx + 2] -= dz * f * wb; }
    pos.array.set(p); pos.needsUpdate = true; g.computeVertexNormals();
  } };
}

// ---------------------------------------------------------------- small motion utilities
/** Smoothly eased 0→1→0 pulse value for idle "breathing" (period seconds, offset to desync neighbours). */
export const breathe = (t, period = 3.2, offset = 0) => 0.5 - 0.5 * Math.cos(((t + offset) / period) * Math.PI * 2);
/** Damped follow: move `cur` toward `target` so that it covers `1 - 1/e` of the gap every `tc` seconds (frame-rate independent). */
export const damp = (cur, target, tc, dt) => cur + (target - cur) * (1 - Math.exp(-dt / Math.max(tc, 1e-4)));
/** Stagger an async animation over a list: await stagger(items, 0.05, (item, i) => hop(item, …)). */
export const stagger = (items, gap, fn) => Promise.all(items.map((it, i) => tween(i * gap, () => {}).then(() => fn(it, i))));
