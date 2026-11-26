// Prism Breaker — pure deterministic simulation (no DOM / three.js). The renderer reads state and consumes `events`.
// Playfield: x ∈ [-6, 6], y ∈ [-9, 9]; bricks hang from the top on an 11-column grid; paddle near the bottom.
export const FIELD = { left: -6, right: 6, top: 9, bottom: -9 };
export const COLS = 11, BW = 12 / COLS, BH = 0.56, BRICK_TOP = 8.1, PADDLE_Y = -7.4, BALL_R = 0.2;
export const TYPES = {
  g: { hp: 1, score: 50 }, n: { hp: 2, score: 90 }, s: { hp: 3, score: 140 }, x: { hp: 1, score: 80, explode: true },
  u: { hp: Infinity, score: 0, solid: true }, p: { hp: 1, score: 60, drop: true },
};
export const POWERS = ['multi', 'laser', 'wide', 'slow'];
const DIFF = { easy: { speed: 7.6, lives: 5, paddle: 1.2 }, normal: { speed: 9, lives: 3, paddle: 1 }, hard: { speed: 10.6, lives: 2, paddle: 0.88 } };

export const makeRng = (seed) => ({ s: (seed >>> 0) || 1 });
export function rnd(r) { let t = (r.s = (r.s + 0x6d2b79f5) | 0); t = Math.imul(t ^ (t >>> 15), 1 | t); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }

export const brickX = (col) => FIELD.left + BW * (col + 0.5);
export const brickY = (row) => BRICK_TOP - BH * (row + 0.5);

export function parseLayout(rows) {
  const bricks = []; let id = 1;
  rows.forEach((line, row) => [...line].forEach((ch, col) => {
    const t = TYPES[ch]; if (!t || col >= COLS) return;
    bricks.push({ id: id++, col, row, x: brickX(col), y: brickY(row), w: BW * 0.92, h: BH * 0.84, type: ch, hp: t.hp, maxHp: t.hp, alive: true, flash: 0 });
  }));
  return bricks;
}

export function createSim(def, o = {}) {
  const d = DIFF[o.difficulty || 'normal'];
  const sim = {
    mode: o.mode || 'campaign', def, rng: makeRng(o.seed ?? 1), time: 0, events: [], score: 0, combo: 0, bestCombo: 0,
    bricks: parseLayout(def.layout || []), balls: [], powerups: [], lasers: [], orbs: [], nextId: 1000,
    paddle: { x: 0, y: PADDLE_Y, w: 2.4 * d.paddle * (o.paddleMul || 1), baseW: 2.4 * d.paddle * (o.paddleMul || 1), vx: 0 },
    baseSpeed: d.speed * (o.speedMul || 1), speedUp: 0, lives: o.lives ?? d.lives, livesLost: 0,
    fx: { wide: 0, slow: 0, laser: 0, shrink: 0 }, laserT: 0, powerRate: o.powerRate ?? 1, noPaddleT: 0,
    boss: null, well: null, won: false, over: false, brokeCount: 0, wave: 0, waveT: 0,
  };
  if (def.boss) sim.boss = { x: 0, y: def.boss.y ?? 6.6, w: 3.3, h: 1.5, hp: def.boss.hp, maxHp: def.boss.hp, t: 0, shotT: 3, shieldDone: false, flash: 0, speed: def.boss.speed ?? 0.5, amp: def.boss.amp ?? 3.2 };
  if (o.mode === 'gravity') { sim.well = { x: 0, y: 1.5, strength: o.gravity ?? 5, horizon: 0.55 }; addWaveRows(sim, 5); }
  serve(sim);
  return sim;
}

export function serve(sim) { sim.balls.push({ id: sim.nextId++, x: sim.paddle.x, y: PADDLE_Y + 0.42, vx: 0, vy: 0, r: BALL_R, stuck: true, stuckT: 0 }); }
export const speedOf = (sim) => (sim.baseSpeed + sim.speedUp) * (sim.fx.slow > 0 ? 0.65 : 1);
export function launch(sim, ball, angle = 0.25) { const s = speedOf(sim); ball.stuck = false; ball.vx = Math.sin(angle) * s; ball.vy = Math.cos(angle) * s; sim.events.push({ t: 'launch', x: ball.x, y: ball.y }); }
export const breakable = (sim) => sim.bricks.filter((b) => b.alive && !TYPES[b.type].solid).length;

// circle vs axis-aligned box: returns {nx, ny, depth} or null
export function circleBox(cx, cy, r, bx, by, hw, hh) {
  const px = Math.max(bx - hw, Math.min(cx, bx + hw)), py = Math.max(by - hh, Math.min(cy, by + hh));
  let dx = cx - px, dy = cy - py; const d2 = dx * dx + dy * dy;
  if (d2 > r * r) return null;
  if (d2 > 1e-10) { const d = Math.sqrt(d2); return { nx: dx / d, ny: dy / d, depth: r - d }; }
  // centre inside the box: push out along the smallest axis
  const ox = hw - Math.abs(cx - bx), oy = hh - Math.abs(cy - by);
  return ox < oy ? { nx: Math.sign(cx - bx) || 1, ny: 0, depth: ox + r } : { nx: 0, ny: Math.sign(cy - by) || 1, depth: oy + r };
}
// Paddle bounce: hit offset (-1..1) maps to up to ±62° from vertical. Pure so it is unit-testable.
export function paddleBounce(offset, speed) { const a = Math.max(-1, Math.min(1, offset)) * (62 * Math.PI / 180); return { vx: Math.sin(a) * speed, vy: Math.cos(a) * speed }; }

function damageBrick(sim, b, by) {
  if (!b.alive || TYPES[b.type].solid) { b.flash = 1; sim.events.push({ t: 'clank', x: b.x, y: b.y }); return; }
  b.hp--; b.flash = 1;
  if (b.hp > 0) { sim.events.push({ t: 'crack', id: b.id, x: b.x, y: b.y, type: b.type, hp: b.hp }); sim.score += 10; return; }
  b.alive = false; sim.brokeCount++; sim.combo++; sim.bestCombo = Math.max(sim.bestCombo, sim.combo);
  const pts = TYPES[b.type].score * (1 + Math.min(sim.combo - 1, 15) * 0.25); sim.score += Math.round(pts);
  sim.speedUp = Math.min(sim.baseSpeed * 0.32, sim.speedUp + 0.05);
  sim.events.push({ t: 'break', id: b.id, x: b.x, y: b.y, type: b.type, combo: sim.combo, row: b.row, by, pts: Math.round(pts) });
  if (TYPES[b.type].drop || rnd(sim.rng) < 0.11 * sim.powerRate) spawnPower(sim, b.x, b.y);
  if (TYPES[b.type].explode) {
    sim.events.push({ t: 'explode', x: b.x, y: b.y });
    for (const o of sim.bricks) if (o.alive && o !== b && Math.abs(o.col - b.col) <= 1 && Math.abs(o.row - b.row) <= 1) damageBrick(sim, o, 'explode');
  }
}
function spawnPower(sim, x, y) {
  let kind = POWERS[Math.floor(rnd(sim.rng) * POWERS.length)];
  if (rnd(sim.rng) < 0.05) kind = 'life';
  if (kind === 'multi' && sim.balls.length >= 6) kind = 'laser';
  sim.powerups.push({ id: sim.nextId++, kind, x, y, vy: -3.2, spin: 0 });
  sim.events.push({ t: 'powerSpawn', kind, x, y });
}
function applyPower(sim, p) {
  sim.events.push({ t: 'power', kind: p.kind, x: p.x, y: p.y }); sim.score += 100;
  if (p.kind === 'multi') {
    const live = sim.balls.filter((b) => !b.stuck); if (!live.length && sim.balls[0]) launch(sim, sim.balls[0]);
    for (const b of sim.balls.slice(0, 3)) for (const da of [-0.38, 0.38]) {
      if (sim.balls.length >= 8) break; const c = Math.cos(da), s = Math.sin(da);
      sim.balls.push({ id: sim.nextId++, x: b.x, y: b.y, vx: b.vx * c - b.vy * s, vy: b.vx * s + b.vy * c, r: BALL_R, stuck: false });
    }
  } else if (p.kind === 'laser') sim.fx.laser = 10;
  else if (p.kind === 'wide') sim.fx.wide = 15;
  else if (p.kind === 'slow') sim.fx.slow = 12;
  else if (p.kind === 'life') sim.lives++;
}

// Gravity Well: endless descending rows. Generated deterministically from the sim rng.
export function addWaveRows(sim, n) {
  for (const b of sim.bricks) { b.row += n; b.y = brickY(b.row); }
  for (let r = 0; r < n; r++) for (let c = 0; c < COLS; c++) {
    const v = rnd(sim.rng); if (v < 0.28) continue;
    const type = v < 0.36 ? 'x' : v < 0.5 ? 'n' : v < 0.56 ? 's' : v < 0.6 ? 'p' : 'g';
    sim.bricks.push({ id: sim.nextId++, col: c, row: r, x: brickX(c), y: brickY(r), w: BW * 0.92, h: BH * 0.84, type, hp: TYPES[type].hp, maxHp: TYPES[type].hp, alive: true, flash: 0, wave: sim.wave });
  }
  sim.wave++;
}

// ---------------------------------------------------------------- step
// input: {targetX?: number (absolute paddle x), axis?: -1..1 (keyboard), launch?: bool}
export function step(sim, dt, input = {}) {
  if (sim.won || sim.over) return;
  sim.time += dt;
  const P = sim.paddle;
  for (const k in sim.fx) sim.fx[k] = Math.max(0, sim.fx[k] - dt);
  const wantW = P.baseW * (sim.fx.wide > 0 ? 1.5 : 1) * (sim.fx.shrink > 0 ? 0.65 : 1);
  P.w += (wantW - P.w) * Math.min(1, dt * 10);
  const half = P.w / 2, x0 = P.x;
  if (input.targetX != null) P.x += (input.targetX - P.x) * Math.min(1, dt * 22);
  if (input.axis) P.x += input.axis * 15 * dt;
  P.x = Math.max(FIELD.left + half, Math.min(FIELD.right - half, P.x)); P.vx = (P.x - x0) / Math.max(dt, 1e-4);
  // lasers
  if (sim.fx.laser > 0 && (sim.laserT -= dt) <= 0) { sim.laserT = 0.38; for (const s of [-1, 1]) sim.lasers.push({ x: P.x + s * (half - 0.2), y: P.y + 0.3 }); sim.events.push({ t: 'laser' }); }
  for (let i = sim.lasers.length - 1; i >= 0; i--) {
    const L = sim.lasers[i]; L.y += 20 * dt; let hit = L.y > FIELD.top;
    if (!hit) for (const b of sim.bricks) if (b.alive && Math.abs(L.x - b.x) < b.w / 2 && Math.abs(L.y - b.y) < b.h / 2 + 0.2) { damageBrick(sim, b, 'laser'); hit = true; break; }
    if (!hit && sim.boss && sim.boss.hp > 0 && Math.abs(L.x - sim.boss.x) < sim.boss.w / 2 && Math.abs(L.y - sim.boss.y) < sim.boss.h / 2) { hitBoss(sim, 0.5); hit = true; }
    if (!hit) for (let k = sim.orbs.length - 1; k >= 0; k--) { const o = sim.orbs[k]; if (Math.hypot(o.x - L.x, o.y - L.y) < 0.45) { sim.orbs.splice(k, 1); sim.events.push({ t: 'orbPop', x: o.x, y: o.y }); hit = true; break; } }
    if (hit) { sim.events.push({ t: 'laserHit', x: L.x, y: L.y }); sim.lasers.splice(i, 1); }
  }
  // boss
  const B = sim.boss;
  if (B && B.hp > 0) {
    B.t += dt; B.x = Math.sin(B.t * B.speed) * B.amp; B.flash = Math.max(0, B.flash - dt * 4);
    if ((B.shotT -= dt) <= 0) { B.shotT = 2.6 + rnd(sim.rng) * 1.6; sim.orbs.push({ x: B.x, y: B.y - B.h / 2, vy: -3.6 }); sim.events.push({ t: 'orbFire', x: B.x, y: B.y }); }
    if (!B.shieldDone && B.hp <= B.maxHp / 2) {
      B.shieldDone = true; sim.events.push({ t: 'shield' });
      for (let c = 1; c < COLS - 1; c++) if (!sim.bricks.some((b) => b.alive && b.col === c && b.row === 6)) sim.bricks.push({ id: sim.nextId++, col: c, row: 6, x: brickX(c), y: brickY(6), w: BW * 0.92, h: BH * 0.84, type: c % 3 === 0 ? 'x' : 'n', hp: c % 3 === 0 ? 1 : 2, maxHp: 2, alive: true, flash: 1, spawnT: 0 });
    }
  }
  for (let i = sim.orbs.length - 1; i >= 0; i--) {
    const o = sim.orbs[i]; o.y += o.vy * dt;
    if (Math.abs(o.y - P.y) < 0.4 && Math.abs(o.x - P.x) < P.w / 2 + 0.2) { sim.orbs.splice(i, 1); sim.fx.shrink = 4; sim.events.push({ t: 'orbHit', x: o.x, y: o.y }); continue; }
    if (o.y < FIELD.bottom - 1) sim.orbs.splice(i, 1);
  }
  // powerups
  for (let i = sim.powerups.length - 1; i >= 0; i--) {
    const p = sim.powerups[i]; p.y += p.vy * dt; p.spin += dt * 3;
    if (Math.abs(p.y - P.y) < 0.45 && Math.abs(p.x - P.x) < P.w / 2 + 0.45) { sim.powerups.splice(i, 1); applyPower(sim, p); continue; }
    if (p.y < FIELD.bottom - 1) sim.powerups.splice(i, 1);
  }
  // balls (sub-stepped so a fast ball never tunnels a brick)
  const spd = speedOf(sim);
  for (let bi = sim.balls.length - 1; bi >= 0; bi--) {
    const ball = sim.balls[bi];
    if (ball.stuck) { ball.x = P.x + (ball.offset || 0); ball.y = P.y + 0.42; ball.stuckT += dt; if (input.launch || ball.stuckT > (sim.def.autoLaunch ?? 3.2)) launch(sim, ball, 0.22 * (ball.offset ? Math.sign(ball.offset) : sim.rng.s % 2 ? 1 : -1)); continue; }
    const n = Math.max(1, Math.ceil((spd * dt) / 0.08));
    const h = dt / n;
    for (let s = 0; s < n; s++) {
      if (sim.well) {
        const W = sim.well, dx = W.x - ball.x, dy = W.y - ball.y, r2 = Math.max(dx * dx + dy * dy, 0.7), r = Math.sqrt(r2), a = W.strength * 6 / r2;
        ball.vx += (dx / r) * a * h; ball.vy += (dy / r) * a * h;
        if (r < W.horizon) { // slingshot through the wormhole: re-emerge at the top, flung downward
          ball.x = Math.max(-5, Math.min(5, -ball.x * 0.6)); ball.y = 7.5; ball.vx = (rnd(sim.rng) - 0.5) * spd; ball.vy = -spd;
          sim.score += 250; sim.events.push({ t: 'slingshot', x: W.x, y: W.y });
        }
      }
      // keep speed constant (gravity bends, doesn't pump energy) and avoid near-horizontal stalls
      const m = Math.hypot(ball.vx, ball.vy) || 1; ball.vx = (ball.vx / m) * spd; ball.vy = (ball.vy / m) * spd;
      if (Math.abs(ball.vy) < spd * 0.22) { ball.vy = Math.sign(ball.vy || 1) * spd * 0.22; ball.vx = Math.sign(ball.vx) * Math.sqrt(spd * spd - ball.vy * ball.vy); }
      ball.x += ball.vx * h; ball.y += ball.vy * h;
      // walls
      if (ball.x < FIELD.left + ball.r) { ball.x = FIELD.left + ball.r; ball.vx = Math.abs(ball.vx); sim.events.push({ t: 'wall', x: ball.x, y: ball.y }); }
      if (ball.x > FIELD.right - ball.r) { ball.x = FIELD.right - ball.r; ball.vx = -Math.abs(ball.vx); sim.events.push({ t: 'wall', x: ball.x, y: ball.y }); }
      if (ball.y > FIELD.top - ball.r) { ball.y = FIELD.top - ball.r; ball.vy = -Math.abs(ball.vy); sim.events.push({ t: 'wall', x: ball.x, y: ball.y }); }
      // paddle (only while descending; capsule-ish: generous width)
      if (ball.vy < 0 && ball.y - ball.r < P.y + 0.2 && ball.y > P.y - 0.3 && Math.abs(ball.x - P.x) < P.w / 2 + ball.r) {
        const off = (ball.x - P.x) / (P.w / 2 + ball.r * 0.5) + P.vx * 0.012;
        const v = paddleBounce(off, spd); ball.vx = v.vx; ball.vy = v.vy; ball.y = P.y + 0.2 + ball.r;
        sim.combo = 0; sim.noPaddleT = 0; sim.events.push({ t: 'paddle', x: ball.x, y: ball.y, off });
      }
      // bricks: resolve the deepest overlap only
      let best = null, bb = null;
      for (const b of sim.bricks) {
        if (!b.alive || Math.abs(b.x - ball.x) > 1.2 || Math.abs(b.y - ball.y) > 0.9) continue;
        const c = circleBox(ball.x, ball.y, ball.r, b.x, b.y, b.w / 2, b.h / 2); if (c && (!best || c.depth > best.depth)) { best = c; bb = b; }
      }
      if (B && B.hp > 0) { const c = circleBox(ball.x, ball.y, ball.r, B.x, B.y, B.w / 2, B.h / 2); if (c && (!best || c.depth > best.depth)) { best = c; bb = B; } }
      if (best) {
        const dot = ball.vx * best.nx + ball.vy * best.ny;
        if (dot < 0) { ball.vx -= 2 * dot * best.nx; ball.vy -= 2 * dot * best.ny; }
        ball.x += best.nx * best.depth; ball.y += best.ny * best.depth;
        if (bb === B) hitBoss(sim, 1); else damageBrick(sim, bb, 'ball');
      }
    }
    if (ball.y < FIELD.bottom - 0.6) { sim.balls.splice(bi, 1); sim.events.push({ t: 'lost', x: ball.x }); }
  }
  // stall breaker: if the ball hasn't touched the paddle in a long time, nudge its angle
  sim.noPaddleT += dt; if (sim.noPaddleT > 18) { sim.noPaddleT = 0; for (const b of sim.balls) if (!b.stuck) { b.vx += (rnd(sim.rng) - 0.5) * 3; b.vy -= 1.5; } }
  if (!sim.balls.length) {
    sim.lives--; sim.livesLost++; sim.combo = 0; sim.fx.laser = sim.fx.wide = sim.fx.slow = 0; sim.powerups.length = 0; sim.orbs.length = 0;
    sim.events.push({ t: 'lifeLost', lives: sim.lives });
    if (sim.lives <= 0) { sim.over = true; sim.events.push({ t: 'gameOver' }); return; }
    sim.speedUp *= 0.5; serve(sim);
  }
  // waves for Gravity Well
  if (sim.mode === 'gravity') {
    sim.waveT += dt; const left = breakable(sim);
    if (left < 14 || sim.waveT > 32) { sim.waveT = 0; addWaveRows(sim, left < 6 ? 3 : 1); sim.events.push({ t: 'wave', n: sim.wave }); }
    for (const b of sim.bricks) if (b.alive && b.y < -3.6) { b.alive = false; sim.events.push({ t: 'sink', id: b.id, x: b.x, y: b.y }); }
    if (sim.bricks.length > 160) sim.bricks = sim.bricks.filter((b) => b.alive);
  } else if (!sim.won && breakable(sim) === 0 && (!B || B.hp <= 0)) { sim.won = true; sim.events.push({ t: 'win' }); }
}
function hitBoss(sim, dmg) {
  const B = sim.boss; B.hp = Math.max(0, B.hp - dmg); B.flash = 1; sim.score += 60; sim.combo++;
  sim.events.push({ t: B.hp <= 0 ? 'bossDown' : 'bossHit', x: B.x, y: B.y, hp: B.hp, maxHp: B.maxHp });
  if (B.hp <= 0) sim.score += 5000;
}

// ---------------------------------------------------------------- autopilot (tests + __cam.game.autoplay)
// Predicts where the lowest descending ball meets the paddle line (with wall reflections) and aims it at the bricks.
export function autopilot(sim) {
  let target = null, bestT = Infinity;
  for (const b of sim.balls) {
    if (b.stuck) continue;
    if (b.vy >= 0) { if (!target) target = b; continue; }
    const t = (b.y - (PADDLE_Y + 0.4)) / -b.vy; if (t < bestT) { bestT = t; target = b; }
  }
  // dodge-free: also go for powerups if no ball is close
  const live = sim.bricks.filter((b) => b.alive && !TYPES[b.type].solid);
  const cx = live.length ? live.reduce((a, b) => a + b.x, 0) / live.length : 0;
  if (!target) { const p = sim.powerups[0]; return { targetX: p ? p.x : 0, launch: true }; }
  let x = target.x;
  if (target.vy < 0) { const L = FIELD.left + target.r, R = FIELD.right - target.r, W = R - L; let px = target.x + target.vx * bestT - L; px = ((px % (2 * W)) + 2 * W) % (2 * W); x = L + (px > W ? 2 * W - px : px); }
  else if (sim.powerups.length && bestT > 1.2) return { targetX: sim.powerups[0].x, launch: true };
  const aim = Math.max(-0.55, Math.min(0.55, (x - cx) / 6));
  return { targetX: x + aim * sim.paddle.w * 0.5, launch: true };
}
