// Pebble Peaks — pure platformer physics (no THREE, node-tested in tests/physics.test.mjs).
// World = boxes / vertical cylinders / ramps (axis-aligned). Player = vertical cylinder (feet position).
// Resolution order per fixed step: carry by mover → state machine → gravity → horizontal push-out (+ledge mantle) → vertical floor/ceiling.

export const TUNE = {
  R: 0.36, H: 0.95, STEP: 0.34, FOOT: 0.27,     // body radius / height, auto step-up, ground footprint radius (generous edges)
  g: 38, fallMul: 1.6, cutMul: 3.4, apexMul: 0.55, apexBand: 2.2, vTerm: 30,
  run: 8.6, accel: 58, decel: 52, skid: 120, airAccel: 32, airDrag: 3,
  jumpV: 14, speedJump: 0.09, dblV: 12.4, coyote: 0.10, buffer: 0.12,
  rollV: 14.5, rollT: 0.34, rollCd: 0.22, longV: 11, longH: 15,
  poundHang: 0.17, poundV: 34, poundLandT: 0.2, poundJumpV: 17.5,
  bopV: 12.5, bopHoldV: 16, mantle: 0.62, hurtT: 0.45, inv: 1.3,
};

// ------------------------------------------------------------------ world
export function createWorld(killY = -20) { return { solids: [], killY, t: 0 }; }

// box: x,z centre, w,d size, top, h thickness. cyl: x,z, r, top, h. ramp: like box with top0 (at min edge) → top1 (at max edge) along axis.
export function addSolid(w, o) {
  const s = Object.assign({ active: true, dx: 0, dy: 0, dz: 0, semi: false, camBlock: true }, o);
  if (s.kind === 'cyl') { s.hx = s.hz = s.r; }
  else { s.hx = s.w / 2; s.hz = s.d / 2; }
  if (s.kind === 'ramp') s.top = Math.max(s.top0, s.top1);
  s.bottom = (s.kind === 'ramp' ? Math.min(s.top0, s.top1) : s.top) - s.h;
  s.home = [s.x, s.top, s.z];
  w.solids.push(s); return s;
}
export function moveSolidTo(s, x, top, z) {
  s.dx = x - s.x; s.dy = top - s.top; s.dz = z - s.z;
  s.x = x; s.z = z; s.top = top; s.bottom += s.dy;
  if (s.kind === 'ramp') { s.top0 += s.dy; s.top1 += s.dy; }
}
// Ramp top at a point (clamped inside its footprint).
export function topAt(s, x, z) {
  if (s.kind !== 'ramp') return s.top;
  const u = s.axis === 'x' ? (clamp(x, s.x - s.hx, s.x + s.hx) - (s.x - s.hx)) / s.w : (clamp(z, s.z - s.hz, s.z + s.hz) - (s.z - s.hz)) / s.d;
  return s.top0 + (s.top1 - s.top0) * u;
}
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

// distance² from point to the solid's XZ footprint (0 inside); also nearest point
function footDist(s, x, z, out) {
  if (s.kind === 'cyl') {
    const dx = x - s.x, dz = z - s.z, d = Math.hypot(dx, dz);
    if (out) { const k = d > 1e-9 ? Math.min(1, s.r / d) : 0; out.x = s.x + dx * k; out.z = s.z + dz * k; out.inside = d < s.r; out.d = d; }
    return Math.max(0, d - s.r);
  }
  const nx = clamp(x, s.x - s.hx, s.x + s.hx), nz = clamp(z, s.z - s.hz, s.z + s.hz);
  if (out) { out.x = nx; out.z = nz; out.inside = nx === x && nz === z; }
  return Math.hypot(x - nx, z - nz);
}

/** Highest walkable top under a footprint circle that is ≤ maxY. */
export function floorBelow(w, x, z, rf, maxY, ignore = null) {
  let best = -Infinity, bs = null;
  for (const s of w.solids) {
    if (!s.active || s === ignore || s.noFloor) continue;
    if (footDist(s, x, z) > rf) continue;
    const t = topAt(s, x, z);
    if (t <= maxY && t > best) { best = t; bs = s; }
  }
  return bs ? { y: best, s: bs } : null;
}
/** Lowest solid bottom above minY overlapping a footprint (semi-solid platforms are ignored: jump through from below). */
export function ceilAbove(w, x, z, rf, minY) {
  let best = Infinity, bs = null;
  for (const s of w.solids) {
    if (!s.active || s.semi) continue;
    if (footDist(s, x, z) > rf) continue;
    if (s.bottom >= minY && s.bottom < best) { best = s.bottom; bs = s; }
  }
  return bs ? { y: best, s: bs } : null;
}

const tmpN = { x: 0, z: 0, inside: false, d: 0 };
/** Push a cylinder (feet y0, head y1) out of solids horizontally. Returns the solid most opposed to motion (wall) or null. */
export function pushOut(w, p, R, y0, y1, step) {
  let wall = null, wallPen = 0;
  for (let it = 0; it < 2; it++) {
    for (const s of w.solids) {
      if (!s.active || s.semi) continue;
      if (s.bottom >= y1 - 0.02) continue;
      const d = footDist(s, p.x, p.z, tmpN);
      if (d >= R) continue;
      if (topAt(s, tmpN.x, tmpN.z) <= y0 + step) continue; // walk-over-able (handled by floor)
      let nx, nz, pen;
      if (s.kind === 'cyl') {
        const dd = tmpN.d; nx = dd > 1e-9 ? (p.x - s.x) / dd : 1; nz = dd > 1e-9 ? (p.z - s.z) / dd : 0; pen = s.r + R - dd;
      } else if (!tmpN.inside) {
        nx = (p.x - tmpN.x) / d; nz = (p.z - tmpN.z) / d; pen = R - d;
      } else { // centre inside the rect: leave along the shallowest axis
        const ex = [s.x + s.hx - p.x, p.x - (s.x - s.hx)], ez = [s.z + s.hz - p.z, p.z - (s.z - s.hz)];
        const m = Math.min(ex[0], ex[1], ez[0], ez[1]);
        if (m === ex[0]) { nx = 1; nz = 0; } else if (m === ex[1]) { nx = -1; nz = 0; } else if (m === ez[0]) { nx = 0; nz = 1; } else { nx = 0; nz = -1; }
        pen = m + R;
      }
      p.x += nx * pen; p.z += nz * pen;
      const opp = -(p.vx * nx + p.vz * nz);
      if (opp > 0) { p.vx += nx * opp; p.vz += nz * opp; }
      if (pen > wallPen) { wallPen = pen; wall = s; p.wallNx = nx; p.wallNz = nz; }
    }
  }
  return wall;
}

/** Ray vs solids (camera collision). Returns nearest t in [0,maxT] or maxT. */
export function raycast(w, ox, oy, oz, dx, dy, dz, maxT, skip) {
  let best = maxT;
  for (const s of w.solids) {
    if (!s.active || !s.camBlock || s === skip) continue;
    let t;
    if (s.kind === 'cyl') t = rayCyl(s, ox, oy, oz, dx, dy, dz);
    else t = rayBox(s.x - s.hx, s.bottom, s.z - s.hz, s.x + s.hx, s.top, s.z + s.hz, ox, oy, oz, dx, dy, dz);
    if (t >= 0 && t < best) best = t;
  }
  return best;
}
function rayBox(x0, y0, z0, x1, y1, z1, ox, oy, oz, dx, dy, dz) {
  let tmin = -Infinity, tmax = Infinity;
  const ax = [[x0, x1, ox, dx], [y0, y1, oy, dy], [z0, z1, oz, dz]];
  for (const [a, b, o, d] of ax) {
    if (Math.abs(d) < 1e-9) { if (o < a || o > b) return -1; continue; }
    let t1 = (a - o) / d, t2 = (b - o) / d; if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); if (tmin > tmax) return -1;
  }
  if (tmax < 0) return -1; return tmin < 0 ? 0 : tmin;
}
function rayCyl(s, ox, oy, oz, dx, dy, dz) {
  // side
  const px = ox - s.x, pz = oz - s.z, a = dx * dx + dz * dz, b = 2 * (px * dx + pz * dz), c = px * px + pz * pz - s.r * s.r;
  let best = -1;
  if (c <= 0 && oy >= s.bottom && oy <= s.top) return 0;
  if (a > 1e-9) {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) { const t = (-b - Math.sqrt(disc)) / (2 * a); if (t >= 0) { const y = oy + dy * t; if (y >= s.bottom && y <= s.top) best = t; } }
  }
  for (const yy of [s.top, s.bottom]) { // caps
    if (Math.abs(dy) < 1e-9) continue; const t = (yy - oy) / dy; if (t < 0) continue;
    const x = px + dx * t, z = pz + dz * t; if (x * x + z * z <= s.r * s.r && (best < 0 || t < best)) best = t;
  }
  return best;
}

// ------------------------------------------------------------------ movers (pure path functions)
// path: {a:[x,top,z], b:[x,top,z], T, ph} ping-pong with smooth ends, or {orbit:[cx,top,cz,r], T, ph}, or {bob: amp, T}
export function pathPos(path, t, out = [0, 0, 0]) {
  const T = path.T || 6, ph = path.ph || 0;
  if (path.orbit) { const [cx, y, cz, r] = path.orbit; const a = (t / T + ph) * Math.PI * 2 * (path.dir || 1); out[0] = cx + Math.cos(a) * r; out[1] = y; out[2] = cz + Math.sin(a) * r; return out; }
  const u = ((t / T + ph) % 1 + 1) % 1; const k = 0.5 - 0.5 * Math.cos(u * Math.PI * 2); // 0→1→0, eased at the ends (dwell)
  for (let i = 0; i < 3; i++) out[i] = path.a[i] + (path.b[i] - path.a[i]) * k;
  return out;
}
const P3 = [0, 0, 0];
export function updateMovers(w, t) {
  for (const s of w.solids) {
    if (!s.path) { s.dx = s.dy = s.dz = 0; continue; }
    pathPos(s.path, t, P3); moveSolidTo(s, P3[0], P3[1], P3[2]);
  }
}

// ------------------------------------------------------------------ player controller
export function createPlayer(x = 0, y = 0, z = 0, yaw = Math.PI) {
  return { x, y, z, vx: 0, vy: 0, vz: 0, yaw, grounded: true, ground: null, coyote: 0, buffer: 0, jumping: false, canDbl: true, dbl: false,
    state: 'normal', st: 0, rollCd: 0, airT: 0, inv: 0, wallNx: 0, wallNz: 0, lastGround: null, hasDouble: true, long: false, fallY: y };
}
const approach = (v, t, a) => v < t ? Math.min(t, v + a) : Math.max(t, v - a);

/**
 * One fixed step. inp: {mx, mz} world-space wish (|m|≤1), jumpPressed (edge), jumpHeld, actionPressed (edge).
 * Returns an array of events: {type:'jump'|'double'|'land'|'roll'|'long'|'poundStart'|'pound'|'highjump'|'bonk'|'mantle'|'leave'|'fall', ...}
 */
export function stepPlayer(p, inp, w, dt, T = TUNE) {
  const ev = [];
  p.buffer = inp.jumpPressed ? T.buffer : Math.max(0, p.buffer - dt);
  p.coyote = p.grounded ? T.coyote : Math.max(0, p.coyote - dt);
  p.rollCd = Math.max(0, p.rollCd - dt); p.inv = Math.max(0, p.inv - dt); p.st += dt;
  if (!p.grounded) p.airT += dt;

  // carried by a moving platform
  const g0 = p.ground;
  if (p.grounded && g0 && g0.path) { p.x += g0.dx; p.y += g0.dy; p.z += g0.dz; }

  const mlen = Math.min(1, Math.hypot(inp.mx || 0, inp.mz || 0));
  const wx = mlen > 0.01 ? (inp.mx / Math.max(mlen, 1e-6)) * mlen : 0, wz = mlen > 0.01 ? (inp.mz / Math.max(mlen, 1e-6)) * mlen : 0;
  const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
  let gravity = true;

  switch (p.state) {
    case 'normal': {
      const tx = wx * T.run, tz = wz * T.run;
      if (p.grounded) {
        const dot = p.vx * tx + p.vz * tz;
        const a = mlen < 0.05 ? T.decel : dot < 0 ? T.skid : T.accel;
        p.vx = approach(p.vx, tx, a * dt); p.vz = approach(p.vz, tz, a * dt);
        if (inp.actionPressed && p.rollCd <= 0) {
          const dx = mlen > 0.1 ? wx / mlen : fx, dz = mlen > 0.1 ? wz / mlen : fz;
          p.state = 'roll'; p.st = 0; p.vx = dx * T.rollV; p.vz = dz * T.rollV; p.yaw = Math.atan2(dx, dz); ev.push({ type: 'roll' });
        }
      } else {
        const ax = T.airAccel * dt * (p.long ? 0.35 : 1);
        if (mlen > 0.05) { p.vx = approach(p.vx, tx * (p.long ? 1.6 : 1), ax * Math.abs(wx) + 0.001); p.vz = approach(p.vz, tz * (p.long ? 1.6 : 1), ax * Math.abs(wz) + 0.001); }
        else if (!p.long) { p.vx = approach(p.vx, 0, T.airDrag * dt); p.vz = approach(p.vz, 0, T.airDrag * dt); }
        if (inp.actionPressed && p.airT > 0.04) { p.state = 'pound'; p.st = 0; p.vx = p.vz = 0; p.vy = 0; p.jumping = false; ev.push({ type: 'poundStart' }); }
      }
      break;
    }
    case 'roll': {
      const sp = Math.hypot(p.vx, p.vz), k = p.st / T.rollT;
      const want = T.rollV * (1 - 0.45 * k);
      if (mlen > 0.1) { const ty = Math.atan2(wx, wz); let dy = ((ty - p.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI; p.yaw += clamp(dy, -4 * dt, 4 * dt); }
      p.vx = Math.sin(p.yaw) * want; p.vz = Math.cos(p.yaw) * want; void sp;
      if (p.st >= T.rollT) { p.state = 'normal'; p.rollCd = T.rollCd; p.vx *= 0.62; p.vz *= 0.62; }
      if (p.buffer > 0 && (p.grounded || p.coyote > 0)) { // long jump
        p.vy = T.longV; p.vx = Math.sin(p.yaw) * T.longH; p.vz = Math.cos(p.yaw) * T.longH;
        p.state = 'normal'; p.long = true; p.grounded = false; p.coyote = 0; p.buffer = 0; p.jumping = true; p.canDbl = true; p.airT = 0; ev.push({ type: 'long' });
      } else if (!p.grounded) { p.state = 'normal'; p.rollCd = T.rollCd; }
      break;
    }
    case 'pound': {
      p.vx = p.vz = 0;
      if (p.st < T.poundHang) { p.vy = 0; gravity = false; }
      else { if (p.vy > -T.poundV) ev.push({ type: 'poundDive' }); p.vy = -T.poundV; gravity = false; }
      break;
    }
    case 'poundLand': {
      p.vx = approach(p.vx, 0, 80 * dt); p.vz = approach(p.vz, 0, 80 * dt);
      if (p.buffer > 0 && p.grounded) { p.vy = T.poundJumpV; p.state = 'normal'; p.grounded = false; p.buffer = 0; p.jumping = true; p.canDbl = true; p.coyote = 0; p.airT = 0; ev.push({ type: 'highjump' }); }
      else if (p.st >= T.poundLandT) p.state = 'normal';
      break;
    }
    case 'hurt': {
      if (p.grounded) { p.vx = approach(p.vx, 0, 30 * dt); p.vz = approach(p.vz, 0, 30 * dt); }
      if (p.st >= T.hurtT) p.state = 'normal';
      break;
    }
    case 'frozen': { p.vx = p.vz = 0; p.vy = 0; gravity = false; break; }
  }

  // jumps (normal state)
  if (p.state === 'normal' && p.buffer > 0) {
    if (p.grounded || p.coyote > 0) {
      const gm = p.ground || p.lastGround; if (gm && gm.path) { p.vx += gm.dx / dt; p.vz += gm.dz / dt; } // inherit platform momentum
      const sp = Math.hypot(p.vx, p.vz);
      p.vy = T.jumpV + sp * T.speedJump; p.grounded = false; p.coyote = 0; p.buffer = 0; p.jumping = true; p.canDbl = true; p.airT = 0; p.long = false; p.lastGround = p.ground;
      ev.push({ type: 'jump' });
    } else if (p.canDbl && p.hasDouble && p.airT > 0.05) {
      p.vy = T.dblV; p.canDbl = false; p.jumping = true; p.buffer = 0;
      if (mlen > 0.1) { const sp = Math.max(Math.hypot(p.vx, p.vz), T.run * 0.8 * mlen); p.vx = wx / mlen * sp; p.vz = wz / mlen * sp; } // redirect like a fresh hop
      ev.push({ type: 'double' });
    }
  }

  // gravity
  if (gravity) {
    let g = T.g;
    if (p.vy < 0) g *= T.fallMul;
    else if (p.jumping && !inp.jumpHeld) g *= T.cutMul;
    if (p.jumping && inp.jumpHeld && Math.abs(p.vy) < T.apexBand) g *= T.apexMul; // floaty apex while held
    p.vy = Math.max(p.vy - g * dt, -T.vTerm);
  }
  if (p.vy <= 0) p.jumping = false;

  // horizontal
  const wasGrounded = p.grounded;
  p.x += p.vx * dt; p.z += p.vz * dt;
  const wall = pushOut(w, p, T.R, p.y, p.y + T.H, wasGrounded ? T.STEP : 0.05);
  if (wall && !p.grounded && p.state !== 'pound' && p.vy < 6) { // ledge forgiveness: mantle onto a lip just above the feet
    const lip = topAt(wall, p.x - p.wallNx * T.R, p.z - p.wallNz * T.R);
    if (lip - p.y > 0 && lip - p.y <= T.mantle) {
      const ce = ceilAbove(w, p.x, p.z, T.FOOT, lip + 0.01);
      if (!ce || ce.y > lip + T.H) { p.y = lip; p.x -= p.wallNx * 0.2; p.z -= p.wallNz * 0.2; p.vy = 0; p.grounded = true; p.ground = wall; p.jumping = false; p.canDbl = true; p.long = false; ev.push({ type: 'mantle', s: wall }); }
    }
  }
  p.hitWall = wall;

  // vertical
  const prevY = p.y; p.y += p.vy * dt;
  if (p.vy <= 0) {
    const fl = floorBelow(w, p.x, p.z, T.FOOT, prevY + (wasGrounded ? T.STEP : 0.06));
    const snap = wasGrounded && p.state !== 'pound' ? 0.32 : 0;
    if (fl && p.y <= fl.y + snap) {
      const impact = -p.vy;
      p.y = fl.y; p.vy = 0;
      if (!wasGrounded) {
        const fell = p.fallY - fl.y;
        p.grounded = true; p.ground = fl.s; p.canDbl = true; p.long = false; p.airT = 0;
        if (p.state === 'pound') { p.state = 'poundLand'; p.st = 0; ev.push({ type: 'pound', s: fl.s, impact }); }
        else ev.push({ type: 'land', s: fl.s, impact, fell });
      } else p.ground = fl.s;
      p.grounded = true;
    } else {
      if (wasGrounded) { p.grounded = false; p.lastGround = p.ground; p.ground = null; p.airT = 0; p.fallY = p.y; ev.push({ type: 'leave' }); }
      p.grounded = false;
    }
  } else {
    if (p.grounded) { p.grounded = false; p.lastGround = p.ground; p.ground = null; }
    const ce = ceilAbove(w, p.x, p.z, T.FOOT, prevY + T.H - 0.05);
    if (ce && p.y + T.H > ce.y) { p.y = ce.y - T.H; p.vy = 0; p.jumping = false; ev.push({ type: 'bonk', s: ce.s }); }
  }
  if (!p.grounded) p.fallY = Math.max(p.fallY ?? p.y, p.y);
  else p.fallY = p.y;

  // facing
  const hs = Math.hypot(p.vx, p.vz);
  if (hs > 0.6 && p.state !== 'roll' && p.state !== 'hurt') {
    const ty = Math.atan2(p.vx, p.vz); let d = ((ty - p.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    p.yaw += clamp(d, -18 * dt, 18 * dt);
  }
  if (p.y < w.killY) ev.push({ type: 'fall' });
  return ev;
}

/** Bounce off something (enemy bop, mushroom). */
export function bounce(p, v, held = false, T = TUNE) {
  p.vy = held ? Math.max(v, T.bopHoldV) : v; p.grounded = false; p.ground = null; p.jumping = held; p.canDbl = true; p.state = 'normal'; p.airT = 0.1; p.long = false; p.coyote = 0;
}
/** Knockback + invulnerability. */
export function hurt(p, fromX, fromZ, T = TUNE) {
  const dx = p.x - fromX, dz = p.z - fromZ, d = Math.hypot(dx, dz) || 1;
  p.vx = dx / d * 7; p.vz = dz / d * 7; p.vy = 8; p.grounded = false; p.ground = null; p.state = 'hurt'; p.st = 0; p.inv = T.inv; p.jumping = false; p.long = false;
}

/** Camera-relative stick → world wish vector. Camera sits at focus + (sin yaw, ·, cos yaw)·dist. */
export function stickToWorld(sx, sy, camYaw) {
  const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
  return { mx: rx * sx + fx * sy, mz: rz * sx + fz * sy };
}

/** Build a collision world from level data (level objects stay pristine; each solid keeps a .src back-reference). */
export function worldFromLevel(L) {
  const w = createWorld(L.killY ?? -20);
  L.solids.forEach((o, i) => { const s = addSolid(w, { ...o }); s.src = o; s.idx = i; });
  return w;
}
