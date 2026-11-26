// node games/apex-drift/tests/physics.test.mjs — car model + AI: drifting fills boost and pays a slingshot,
// barriers contain every car, and full 3-lap races finish on all six layouts with no stuck cars.
import assert from 'node:assert/strict';
import { TRACKS, RIVALS } from '../tracks.js';
import { buildTrack, poseAt, rank, catchUp } from '../logic.js';
import { createCar, placeCar, stepCar, aiDrive, makeAI, collideCars, updateDraft, SHOULDER, CAR_HALF_W, BASE } from '../physics.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok', name); };
const DT = 1 / 120;
const T = buildTrack(TRACKS.coast);

t('throttle accelerates to a sane top speed; brakes stop the car', () => {
  const c = createCar(); placeCar(c, T, poseAt(T, 100, 0));
  // drive straight down the start straight with steering held at zero by aligning each step (pure longitudinal test)
  let top = 0; for (let k = 0; k < 120 * 12; k++) { stepCar(c, { throttle: 1, steer: 0 }, T, DT); c.x = poseAt(T, c.loc.s, 0).x; c.z = poseAt(T, c.loc.s, 0).z; c.yaw = poseAt(T, c.loc.s, 0).yaw; top = Math.max(top, c.vF); }
  assert.ok(top > BASE.vmax * 0.92 && top < BASE.vmax * 1.05, 'top ' + top);
  let k = 0; while (c.vF > 0.5 && k++ < 120 * 6) stepCar(c, { brake: 1 }, T, DT); assert.ok(k / 120 < 3.2, 'braking time ' + k / 120);
});
t('drift: hold drift + steer at speed → slide angle, boost charges, tiers, slingshot on release', () => {
  const c = createCar({ boost: 0 }); placeCar(c, T, poseAt(T, 300, 0)); c.vx = Math.sin(c.yaw) * 35; c.vz = Math.cos(c.yaw) * 35;
  const ev = []; let maxAng = 0;
  for (let k = 0; k < 120 * 2.0; k++) { stepCar(c, { throttle: 1, steer: k < 30 ? 0.8 : 0.4, drift: true }, T, DT); ev.push(...c.events.map((e) => e.type)); c.events.length = 0; maxAng = Math.max(maxAng, Math.abs(c.driftAng)); const q = poseAt(T, c.loc.s, 0); c.x = q.x; c.z = q.z; /* open-space skid pad */ }
  assert.ok(ev.includes('driftStart'), 'drift started'); assert.ok(maxAng > 0.2, 'slide angle ' + maxAng.toFixed(2));
  assert.ok(c.boost > 0.12, 'boost charged ' + c.boost); assert.ok(ev.includes('tier'), 'reached a spark tier');
  stepCar(c, { throttle: 1, steer: 0, drift: false }, T, DT); const e2 = c.events.map((e) => e.type); assert.ok(e2.includes('sling') && c.boostT > 0, 'slingshot boost on release');
});
t('no drift below drift speed or without steering', () => {
  const c = createCar(); placeCar(c, T, poseAt(T, 300, 0)); c.vx = Math.sin(c.yaw) * 8; c.vz = Math.cos(c.yaw) * 8;
  stepCar(c, { throttle: 1, steer: 1, drift: true }, T, DT); assert.equal(c.drift, 0);
  c.vx = Math.sin(c.yaw) * 30; c.vz = Math.cos(c.yaw) * 30; stepCar(c, { throttle: 1, steer: 0, drift: true }, T, DT); assert.equal(c.drift, 0);
});
t('boost spends the meter and raises top speed', () => {
  const c = createCar({ boost: 1 }); placeCar(c, T, poseAt(T, 100, 0)); let top = 0;
  for (let k = 0; k < 120 * 2.5; k++) { stepCar(c, { throttle: 1, boost: true }, T, DT); const p = poseAt(T, c.loc.s, 0); c.x = p.x; c.z = p.z; c.yaw = p.yaw; top = Math.max(top, c.vF); }
  assert.ok(c.boost < 0.25, 'meter drained ' + c.boost); assert.ok(top > BASE.vmax * 0.9, 'fast ' + top);
});
t('barriers contain a car driven flat-out straight at them', () => {
  const c = createCar(); placeCar(c, T, poseAt(T, 500, 0)); c.yaw += 1.0; let worst = 0, hits = 0;
  for (let k = 0; k < 120 * 6; k++) { stepCar(c, { throttle: 1, steer: 0 }, T, DT); for (const e of c.events) if (e.type === 'wall') hits++; c.events.length = 0; worst = Math.max(worst, Math.abs(c.loc.d) - (c.loc.w + SHOULDER - CAR_HALF_W)); }
  assert.ok(hits > 0, 'hit the wall'); assert.ok(worst < 0.05, 'penetration ' + worst);
});
t('car-to-car contact separates overlapping cars', () => {
  const a = createCar({ id: 'a' }), b = createCar({ id: 'b' }); placeCar(a, T, poseAt(T, 200, 0)); placeCar(b, T, poseAt(T, 200.5, 0.6));
  for (let k = 0; k < 10; k++) collideCars([a, b]); assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 1.5);
});

// ---------------------------------------------------------------- full races
function race(id, rev, { strength = 0.05, laps = 3 } = {}) {
  const T = buildTrack(TRACKS[id], { reverse: rev }); const cars = [];
  for (let k = 0; k < 6; k++) { const r = RIVALS[k % 5]; const c = createCar({ id: 'c' + k }); c.ai = makeAI(T, { skill: k === 5 ? 1 : r.skill * 0.955, bias: r.bias, latMax: BASE.latMax * 0.9 }); placeCar(c, T, poseAt(T, T.L - 12 - k * 7.5, k % 2 ? 3.3 : -3.3)); cars.push(c); }
  const player = cars[5]; let time = 0, maxStuck = 0, contained = 0; const inp = cars.map(() => ({}));
  while (time < 420 && !cars.every((c) => c.finished)) {
    const frac = Math.min(1, player.dist / (T.L * laps));
    for (let k = 0; k < 6; k++) { const c = cars[k]; if (k < 5) c.rubber = catchUp(player.dist - c.dist, strength, frac); aiDrive(c, T, cars, 1 / 60, inp[k]); if (c.finished) inp[k].throttle = 0.3; }
    for (let s = 0; s < 2; s++) { for (let k = 0; k < 6; k++) stepCar(cars[k], inp[k], T, DT, { time }); collideCars(cars, time); }
    updateDraft(cars, 1 / 60);
    for (const c of cars) { for (const e of c.events) if (e.type === 'lap' && c.lap.lap > laps && !c.finished) { c.finished = true; c.finishTime = time; } c.events.length = 0;
      maxStuck = Math.max(maxStuck, c.stuckT); contained = Math.max(contained, Math.abs(c.loc.d) - (c.loc.w + SHOULDER)); }
    time += 1 / 60;
  }
  return { T, cars, time, maxStuck, contained, order: rank(cars) };
}
for (const id of Object.keys(TRACKS)) for (const rev of [false, true]) {
  t(`${id}${rev ? ' mirror' : ''}: 6-car race finishes, nobody stuck, everybody inside the barriers`, () => {
    const r = race(id, rev);
    assert.ok(r.cars.every((c) => c.finished), 'all finished by ' + r.time.toFixed(0) + 's');
    assert.ok(r.maxStuck < 2.5, 'stuck ' + r.maxStuck); assert.ok(r.contained < 0.1, 'outside barrier ' + r.contained);
    const best = Math.min(...r.cars.map((c) => c.lap.best)); const avg = r.T.L / best;
    assert.ok(avg > 36 && avg < 52, `best-lap average speed ${avg.toFixed(1)} m/s`);
    const spread = r.order.at(-1).finishTime - r.order[0].finishTime; assert.ok(spread < 25, 'field spread ' + spread.toFixed(1) + 's');
  });
}
console.log(`\n${n} physics tests passed`);
