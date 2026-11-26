// Skystack — pure stacking rules (no DOM / three.js). Slabs slide along X then Z alternately over the tower top;
// dropping keeps the overlap and slices off the overhang. Perfect drops (within tolerance) snap and, after a streak,
// grow the slab back. Node-testable; the renderer animates `result` objects.
export const SLAB_H = 0.42;
export const MODES = { classic: { fail: true, wind: 0 }, wind: { fail: true, wind: 1 }, zen: { fail: false, wind: 0 } };
export const DIFF = { easy: { speed: 2.3, tol: 0.14, accel: 0.006 }, normal: { speed: 2.9, tol: 0.1, accel: 0.009 }, hard: { speed: 3.6, tol: 0.075, accel: 0.012 } };
export const MILESTONES = [{ h: 10, name: 'Treetops' }, { h: 25, name: 'Cloud Sea' }, { h: 50, name: 'Aurora' }, { h: 75, name: 'Stratosphere' }, { h: 100, name: 'Orbit' }];

export function createStack(o = {}) {
  const size = o.size ?? 3.4, d = DIFF[o.difficulty || 'normal'], mode = MODES[o.mode || 'classic'];
  const st = {
    mode: o.mode || 'classic', fail: mode.fail, windK: mode.wind * (o.wind ?? 1), speed0: d.speed * (o.speedMul ?? 1), accel: d.accel, tol: d.tol * (o.tolMul ?? 1),
    layers: [{ x: 0, z: 0, w: size, d: size, y: 0, hue: o.hue0 ?? 0 }], size, streak: 0, bestStreak: 0, perfects: 0, over: false, t: 0, cur: null,
    hueStep: o.hueStep ?? 0.022, wind: 0, minSize: size * 0.28,
  };
  spawn(st); return st;
}
export const top = (st) => st.layers[st.layers.length - 1];
export const height = (st) => st.layers.length - 1;
export function spawn(st) {
  const t = top(st), axis = st.layers.length % 2 ? 'x' : 'z', range = st.size * 1.35 + 0.6;
  st.cur = { axis, x: t.x, z: t.z, w: t.w, d: t.d, y: t.y + SLAB_H, hue: t.hue + st.hueStep, phase: 0, range, dir: 1, off: -range };
  if (axis === 'x') st.cur.x = t.x - range; else st.cur.z = t.z - range;
  st.cur.speed = st.speed0 * (1 + Math.min(1.1, height(st) * st.accel));
}
// Advance the sliding slab (ping-pong between ±range around the top), plus wind push in Wind mode.
export function update(st, dt) {
  if (st.over || !st.cur) return;
  st.t += dt; const c = st.cur, t = top(st);
  c.off += c.dir * c.speed * dt; if (c.off > c.range) { c.off = c.range; c.dir = -1; } if (c.off < -c.range) { c.off = -c.range; c.dir = 1; }
  st.wind = st.windK ? Math.sin(st.t * 0.63) * 0.55 + Math.sin(st.t * 1.71 + 1.3) * 0.3 : 0;
  const push = st.wind * st.windK * 0.9;
  if (c.axis === 'x') { c.x = t.x + c.off + push; c.z = t.z; } else { c.z = t.z + c.off + push; c.x = t.x; }
}
// Drop the current slab. Returns {type:'perfect'|'cut'|'miss'|'zenmiss', placed, debris, streak, grew}
export function drop(st) {
  if (st.over || !st.cur) return null;
  const c = st.cur, t = top(st), ax = c.axis, len = ax === 'x' ? 'w' : 'd';
  const delta = c[ax] - t[ax], size = c[len];
  const overlap = size - Math.abs(delta);
  let res;
  if (Math.abs(delta) <= st.tol) {
    st.streak++; st.perfects++; st.bestStreak = Math.max(st.bestStreak, st.streak);
    const placed = { x: t.x, z: t.z, w: c.w, d: c.d, y: c.y, hue: c.hue }; let grew = false;
    if (st.streak >= 3) { const g = Math.min(st.size, placed[len] + st.size * 0.06); if (g > placed[len] + 1e-6) { grew = true; placed[len] = g; } const other = len === 'w' ? 'd' : 'w'; if (st.streak >= 6) { const g2 = Math.min(st.size, placed[other] + st.size * 0.04); if (g2 > placed[other] + 1e-6) { grew = true; placed[other] = g2; } } }
    st.layers.push(placed); res = { type: 'perfect', placed, debris: null, streak: st.streak, grew };
  } else if (overlap > 0) {
    st.streak = 0;
    const placed = { ...c }; placed[len] = overlap; placed[ax] = t[ax] + delta / 2; delete placed.phase; delete placed.range; delete placed.dir; delete placed.off; delete placed.speed; delete placed.axis;
    const cut = Math.abs(delta), sgn = Math.sign(delta);
    const debris = { x: c.x, z: c.z, w: c.w, d: c.d, y: c.y, hue: c.hue }; debris[len] = cut; debris[ax] = placed[ax] + sgn * (overlap / 2 + cut / 2);
    st.layers.push(placed); res = { type: 'cut', placed, debris, streak: 0, cutFrac: cut / size };
  } else if (!st.fail) {
    // Zen: a miss never ends the run — the slab lands centred at a forgiving minimum size
    st.streak = 0; const placed = { x: t.x, z: t.z, w: Math.max(st.minSize, Math.min(c.w, t.w)), d: Math.max(st.minSize, Math.min(c.d, t.d)), y: c.y, hue: c.hue };
    st.layers.push(placed); res = { type: 'zenmiss', placed, debris: { x: c.x, z: c.z, w: c.w, d: c.d, y: c.y, hue: c.hue }, streak: 0 };
  } else {
    st.over = true; st.streak = 0; res = { type: 'miss', placed: null, debris: { x: c.x, z: c.z, w: c.w, d: c.d, y: c.y, hue: c.hue }, streak: 0 };
  }
  // Zen also restores a sliver of size so a session never dead-ends
  if (!st.fail && res.type !== 'perfect') { const p = res.placed; p.w = Math.max(p.w, st.minSize); p.d = Math.max(p.d, st.minSize); }
  if (!st.over) spawn(st); else st.cur = null;
  res.height = height(st); res.milestone = MILESTONES.find((m) => m.h === res.height) || null;
  return res;
}
// Autoplayer for tests/hooks: drops when the slab is within `err` of perfect alignment.
export function shouldDrop(st, err = 0.05) { if (!st.cur) return false; const t = top(st); return Math.abs(st.cur[st.cur.axis] - t[st.cur.axis]) <= err; }
