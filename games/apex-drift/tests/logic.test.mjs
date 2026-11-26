// node games/apex-drift/tests/logic.test.mjs — track sampling/projection, checkpoint order + lap counting,
// race distance + ranking, catch-up bounds, ghost record/replay/encoding, grand-prix standings.
import assert from 'node:assert/strict';
import { TRACKS, CUPS, POINTS } from '../tracks.js';
import { buildTrack, locate, poseAt, minSeparation, createLap, updateLap, raceDistance, rank, catchUp, ghostRecorder, ghostPush, ghostSample, encodeGhost, decodeGhost, GHOST_DT, awardPoints, standingsOrder, fmtTime } from '../logic.js';
import { SHOULDER } from '../physics.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok', name); };
const near = (a, b, e) => Math.abs(a - b) <= e;

for (const id of Object.keys(TRACKS)) for (const rev of [false, true]) {
  const T = buildTrack(TRACKS[id], { reverse: rev }); const tag = id + (rev ? ' (mirror)' : '');
  t(`${tag}: closed, uniformly sampled loop`, () => {
    assert.ok(T.L > 1500 && T.L < 3200, 'length ' + T.L);
    for (let i = 0; i < T.n; i++) { const j = (i + 1) % T.n; const d = Math.hypot(T.x[j] - T.x[i], T.z[j] - T.z[i]); assert.ok(near(d, T.ds, 0.35), `gap ${d} at ${i}`); assert.ok(near(Math.hypot(T.tx[i], T.tz[i]), 1, 1e-4)); assert.ok(Math.abs(T.tx[i] * T.nx[i] + T.tz[i] * T.nz[i]) < 1e-5); }
  });
  t(`${tag}: no overlapping road (barriers never touch another section)`, () => {
    const sep = minSeparation(T, 120); let wmax = 0; for (let i = 0; i < T.n; i++) wmax = Math.max(wmax, T.w[i]);
    assert.ok(sep.min > 2 * (wmax + SHOULDER) + 20, `min separation ${sep.min.toFixed(1)} m`);
  });
  t(`${tag}: corners are drivable (radius > half-width + run-off)`, () => { for (let i = 0; i < T.n; i++) assert.ok(1 / Math.max(1e-6, Math.abs(T.k[i])) > T.w[i] + 2, `radius at ${i}`); });
  t(`${tag}: projection round-trips (s, d)`, () => {
    for (const s of [0.5, 100, T.L * 0.37, T.L * 0.81, T.L - 1]) for (const d of [-5, 0, 4.2]) {
      const p = poseAt(T, s, d); const L = locate(T, p.x, p.z, -1); assert.ok(near(L.s, s, 0.25), `s ${L.s} vs ${s}`); assert.ok(near(L.d, d, 0.15), `d ${L.d} vs ${d}`);
      const L2 = locate(T, p.x, p.z, (L.i + 10) % T.n); assert.ok(near(L2.s, L.s, 1e-3), 'windowed search agrees');
    }
  });
}
t('mirror keeps the start line in place and reverses direction', () => {
  const A = buildTrack(TRACKS.coast), B = buildTrack(TRACKS.coast, { reverse: true });
  assert.ok(Math.hypot(A.x[0] - B.x[0], A.z[0] - B.z[0]) < 0.5); assert.ok(A.tx[0] * B.tx[0] + A.tz[0] * B.tz[0] < -0.9);
});

// ---------------------------------------------------------------- laps / checkpoints
const L = 1200, N = 12;
const drive = (st, from, to, t0 = 0, step = 3) => { let tt = t0; const evs = []; for (let d = from; d <= to; d += step) { const s = ((d % L) + L) % L; const e = updateLap(st, s, L, (tt += 0.05)); if (e && e !== 'sector') evs.push(e); } return evs; };
t('first crossing starts lap 1; each full loop counts one lap', () => {
  const st = createLap(N); const ev = drive(st, -30, L * 3 + 10);
  assert.deepEqual(ev, ['start', 'lap', 'lap', 'lap']); assert.equal(st.lap, 4); assert.equal(st.times.length, 3); assert.ok(st.best > 0);
});
t('race distance is continuous and monotonic when driving forward', () => {
  const st = createLap(N); let last = -Infinity;
  for (let d = -40; d < L * 2.5; d += 1.7) { const s = ((d % L) + L) % L; updateLap(st, s, L, d); const rd = raceDistance(st, s, L); assert.ok(rd >= last - 1e-6, `drop at ${d}: ${rd} < ${last}`); assert.ok(near(rd, d, 2), `rd ${rd} vs ${d}`); last = rd; }
});
t('skipping checkpoints (shortcut) does not count a lap', () => {
  const st = createLap(N); drive(st, -10, 50); assert.equal(st.lap, 1);
  // teleport from sector 1 straight to the end of the lap, then cross the line
  for (const s of [L * 0.95, L * 0.99, 5, 20]) updateLap(st, s, L, 10);
  assert.equal(st.lap, 1, 'no lap for a cut'); assert.ok(raceDistance(st, 20, L) < L * 0.2, 'distance capped at the next unentered checkpoint');
});
t('reversing back over the line undoes the lap and its time', () => {
  const st = createLap(N); drive(st, -10, L + 30); assert.equal(st.lap, 2); assert.equal(st.times.length, 1);
  for (const s of [10, 2, L - 3, L - 15]) updateLap(st, s, L, 99); assert.equal(st.lap, 1); assert.equal(st.times.length, 0);
  for (const s of [L - 5, 4, 30]) updateLap(st, s, L, 100); assert.equal(st.lap, 2); assert.equal(st.times.length, 1, 're-crossing counts once');
});
t('backing up through a sector re-arms that checkpoint', () => {
  const st = createLap(N); drive(st, -10, 260); const nx = st.next; updateLap(st, 150, L, 50); assert.equal(st.next, nx - 1); updateLap(st, 205, L, 51); assert.equal(st.next, nx);
});
t('ranking: finishers by time, then race distance', () => {
  const r = rank([{ id: 'a', dist: 900 }, { id: 'b', finished: true, finishTime: 120 }, { id: 'c', dist: 1500 }, { id: 'd', finished: true, finishTime: 118 }]);
  assert.deepEqual(r.map((x) => x.id), ['d', 'b', 'c', 'a']);
});

// ---------------------------------------------------------------- catch-up
t('catch-up is bounded, subtle, symmetric-ish and off when disabled', () => {
  assert.equal(catchUp(500, 0, 0.3), 1);
  for (let g = -1000; g <= 1000; g += 37) for (const f of [0, 0.5, 0.9, 1]) { const m = catchUp(g, 0.05, f); assert.ok(m >= 1 - 0.06 - 1e-9 && m <= 1.05 + 1e-9, `m ${m}`); }
  assert.ok(catchUp(140, 0.05, 0.2) > catchUp(10, 0.05, 0.2)); assert.ok(catchUp(-140, 0.05, 0.2) < 1);
});
t('trailing-AI boost fades to zero over the final 35% of the race', () => {
  assert.ok(catchUp(200, 0.1, 0.5) > 1.09); assert.ok(catchUp(200, 0.1, 0.83) < 1.06); assert.equal(catchUp(200, 0.1, 1), 1);
  assert.ok(catchUp(-200, 0.1, 1) < 1, 'leaders still ease off at the end (never a surge against the player)');
});

// ---------------------------------------------------------------- ghosts
t('ghost records at a fixed rate and replays interpolated poses', () => {
  const g = ghostRecorder(); for (let k = 0; k <= 300; k++) { const tt = k / 60; ghostPush(g, tt, tt * 10, 1, -tt * 5, tt * 0.5); }
  assert.equal(g.f.length / 4, Math.floor(5 / GHOST_DT) + 1);
  const o = {}; assert.ok(ghostSample(g.f, 2.25, o)); assert.ok(near(o.x, 22.5, 0.02) && near(o.z, -11.25, 0.02) && near(o.yaw, 1.125, 0.01));
  assert.equal(ghostSample(g.f, 99, o), false); assert.ok(near(o.x, 50, 1e-6), 'holds the last pose past the end');
});
t('ghost yaw interpolates across ±π the short way', () => {
  const f = [0, 0, 0, Math.PI - 0.05, 1, 0, 0, -Math.PI + 0.05]; const o = {}; ghostSample(f, GHOST_DT / 2, o); assert.ok(Math.abs(Math.abs(o.yaw) - Math.PI) < 0.01, 'yaw ' + o.yaw);
});
t('ghost encoding round-trips within 1 cm / 1 mrad and is compact', () => {
  const g = ghostRecorder(); for (let k = 0; k < 3000; k++) ghostPush(g, k / 60, Math.sin(k / 50) * 400, 30 + k / 100, Math.cos(k / 70) * 300, (k / 40) % 6.28);
  const enc = encodeGhost(g.f, 49.876); const json = JSON.stringify(enc); const dec = decodeGhost(JSON.parse(json));
  assert.equal(dec.lap, 49.876); assert.equal(dec.frames.length, g.f.length);
  for (let i = 0; i < g.f.length; i++) assert.ok(Math.abs(dec.frames[i] - g.f[i]) <= (i % 4 === 3 ? 0.0011 : 0.011));
  assert.ok(json.length < 16000, 'size ' + json.length); assert.equal(decodeGhost({ v: 9 }), null);
});

// ---------------------------------------------------------------- grand prix
t('points table and standings with tie-breaks', () => {
  const st = {}; awardPoints(st, ['a', 'b', 'c', 'd', 'e', 'f'], POINTS); awardPoints(st, ['b', 'a', 'c', 'd', 'e', 'f'], POINTS);
  assert.equal(st.a.pts, 17); assert.equal(st.b.pts, 17); assert.deepEqual(standingsOrder(st).slice(0, 3), ['b', 'a', 'c'], 'tie broken by best finish then latest result');
  awardPoints(st, ['c', 'f', 'e', 'd', 'b', 'a'], POINTS); assert.equal(st.c.pts, 20); assert.deepEqual(standingsOrder(st).slice(0, 3), ['c', 'b', 'a']);
});
t('every cup has 3 races over the 3 distinct tracks', () => { for (const c of Object.values(CUPS)) { assert.equal(c.tracks.length, 3); assert.equal(new Set(c.tracks.map((x) => x[0])).size, 3); } });
t('time format', () => { assert.equal(fmtTime(62.5), '1:02.500'); assert.equal(fmtTime(Infinity), '--:--.---'); });
console.log(`\n${n} logic tests passed`);
