// node games/pebble-peaks/tests/physics.test.mjs — jump arc, variable jump, coyote, buffer, double/long/pound, collision, movers, camera ray.
import assert from 'node:assert/strict';
import * as P from '../physics.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok', name); };
const DT = 1 / 120;
const I = (o = {}) => ({ mx: 0, mz: 0, jumpPressed: false, jumpHeld: false, actionPressed: false, ...o });
const flat = () => { const w = P.createWorld(-20); P.addSolid(w, { kind: 'box', x: 0, z: 0, w: 40, d: 40, top: 0, h: 2 }); return w; };
const settle = (p, w, s = 0.3) => { for (let i = 0; i < s / DT; i++) P.stepPlayer(p, I(), w, DT); };
function run(p, w, secs, inpFn) { const evs = []; for (let i = 0, N = Math.round(secs / DT); i < N; i++) { const e = P.stepPlayer(p, inpFn(i * DT, p), w, DT); for (const x of e) evs.push({ ...x, t: i * DT }); } return evs; }

t('standing player rests on the floor', () => { const w = flat(), p = P.createPlayer(0, 0.5, 0); settle(p, w); assert.ok(p.grounded); assert.ok(Math.abs(p.y) < 1e-9); });
t('full jump reaches ~2.6–3.0 u, tap jump ≤ 45% of it (variable height)', () => {
  const w = flat(); let p = P.createPlayer(0, 0, 0); settle(p, w); let top = 0; run(p, w, 1.2, (tt, pp) => { top = Math.max(top, pp.y); return I({ jumpPressed: tt === 0, jumpHeld: true }); });
  assert.ok(top > 2.5 && top < 3.4, 'full ' + top);
  p = P.createPlayer(0, 0, 0); settle(p, w); let top2 = 0; run(p, w, 1.2, (tt, pp) => { top2 = Math.max(top2, pp.y); return I({ jumpPressed: tt === 0, jumpHeld: tt < 0.04 }); });
  assert.ok(top2 < top * 0.45 && top2 > 0.5, `tap ${top2} full ${top}`);
});
t('falling is faster than rising (snappy arc)', () => {
  const w = flat(), p = P.createPlayer(0, 0, 0); settle(p, w); let apexT = 0, landT = 0, top = 0;
  run(p, w, 1.5, (tt, pp) => { if (pp.y > top) { top = pp.y; apexT = tt; } if (!landT && tt > 0.1 && pp.grounded) landT = tt; return I({ jumpPressed: tt === 0, jumpHeld: true }); });
  assert.ok(landT - apexT < apexT, `rise ${apexT} fall ${landT - apexT}`);
});
t('coyote time: jump still works 90 ms after walking off a ledge, not 140 ms', () => {
  const tryAt = (delay) => {
    const w = P.createWorld(-20); P.addSolid(w, { kind: 'box', x: 0, z: 0, w: 4, d: 4, top: 0, h: 2 });
    const p = P.createPlayer(0, 0, 1.6); settle(p, w); let leftAt = null, jumped = false;
    run(p, w, 0.8, (tt, pp) => { if (leftAt === null && !pp.grounded) leftAt = tt; const go = leftAt !== null && tt >= leftAt + delay && tt < leftAt + delay + DT * 0.5; return I({ mz: 1, jumpPressed: go, jumpHeld: true }); }).forEach((e) => { if (e.type === 'jump') jumped = true; });
    return jumped;
  };
  assert.ok(tryAt(0.09), 'coyote 90ms'); assert.ok(!tryAt(0.14), 'no jump at 140ms');
});
t('input buffer: jump pressed 110 ms before landing fires on touchdown; 160 ms is dropped', () => {
  const tryAt = (before) => {
    const w = flat(), p = P.createPlayer(0, 3, 0); p.grounded = false; p.canDbl = false; p.hasDouble = false;
    // find landing time first
    const probeP = P.createPlayer(0, 3, 0); probeP.grounded = false; let landT = 0; run(probeP, flat(), 1.5, (tt, pp) => { if (!landT && pp.grounded) landT = tt; return I(); });
    let jumped = false; run(p, w, 1.5, (tt) => I({ jumpPressed: Math.abs(tt - (landT - before)) < DT * 0.5, jumpHeld: true })).forEach((e) => { if (e.type === 'jump') jumped = true; });
    return jumped;
  };
  assert.ok(tryAt(0.11), 'buffered'); assert.ok(!tryAt(0.16), 'stale buffer ignored');
});
t('double jump: once per airtime, refreshed on landing', () => {
  const w = flat(), p = P.createPlayer(0, 0, 0); settle(p, w); let d = 0;
  run(p, w, 2, (tt) => I({ jumpPressed: [0, 0.3, 0.5, 0.6].some((k) => Math.abs(tt - k) < DT / 2), jumpHeld: true })).forEach((e) => { if (e.type === 'double') d++; });
  assert.equal(d, 1);
});
t('roll → jump = long jump that travels further than a running jump', () => {
  const dist = (long) => { const w = P.createWorld(-50); P.addSolid(w, { kind: 'box', x: 0, z: 0, w: 4, d: 4, top: 10, h: 2 }); P.addSolid(w, { kind: 'box', x: 0, z: 31.25, w: 4, d: 57.5, top: 9, h: 2 });
    const p = P.createPlayer(0, 10, -1.5); settle(p, w); let air = false, landZ = null;
    run(p, w, 3, (tt, pp) => { if (!pp.grounded) air = true; if (landZ === null && air && pp.grounded) landZ = pp.z; return I({ mz: 1, actionPressed: long && Math.abs(tt - 0.25) < DT / 2, jumpPressed: Math.abs(tt - (long ? 0.27 : 0.25)) < DT / 2, jumpHeld: true }); });
    return landZ; };
  assert.ok(dist(true) > dist(false) + 0.5, `long ${dist(true)} vs ${dist(false)}`);
});
t('ground pound: hang, dive, land event, then jump within window = high jump', () => {
  const w = flat(), p = P.createPlayer(0, 0, 0); settle(p, w); const evs = run(p, w, 2, (tt) => I({ jumpPressed: Math.abs(tt) < DT / 2 || Math.abs(tt - 0.95) < DT / 2, jumpHeld: tt < 0.4 || tt > 0.9, actionPressed: Math.abs(tt - 0.3) < DT / 2 }));
  const types = evs.map((e) => e.type); assert.ok(types.includes('poundStart')); assert.ok(types.includes('pound'));
  const pi = types.indexOf('pound'); const pt = evs[pi].t; const hj = evs.find((e) => e.type === 'highjump');
  // press jump 50 ms after the pound lands
  const w2 = flat(), p2 = P.createPlayer(0, 0, 0); settle(p2, w2); let landAt = null, high = false;
  for (let i = 0; i < 300; i++) { const tt = i * DT; const e = P.stepPlayer(p2, I({ jumpPressed: i === 0 || (landAt !== null && Math.abs(tt - landAt - 0.05) < DT / 2), jumpHeld: true, actionPressed: Math.abs(tt - 0.3) < DT / 2 }), w2, DT);
    for (const x of e) { if (x.type === 'pound') landAt = tt; if (x.type === 'highjump') high = true; } }
  assert.ok(high, 'high jump fired'); assert.ok(pt > 0.3); hj;
});
t('walls block, step-ups climb automatically, tall ledges need a jump', () => {
  const w = flat(); P.addSolid(w, { kind: 'box', x: 0, z: 3, w: 4, d: 1, top: 0.3, h: 0.3 }); P.addSolid(w, { kind: 'box', x: 4, z: 3, w: 2, d: 1, top: 3, h: 3 });
  const p = P.createPlayer(0, 0, 0); settle(p, w); let my = 0; run(p, w, 1, (tt, pp) => { my = Math.max(my, pp.y); return I({ mz: 1 }); }); assert.ok(p.z > 4 && my >= 0.29, 'stepped up 0.3');
  const q = P.createPlayer(4, 0, 0); settle(q, w); run(q, w, 1, () => I({ mz: 1 })); assert.ok(q.z < 2.5 + 1e-6 && q.y < 0.01, 'blocked by 3u wall ' + q.z);
});
t('ledge forgiveness: a jump that ends 0.5 u below a lip mantles onto it', () => {
  const w = flat(); P.addSolid(w, { kind: 'box', x: 0, z: 4, w: 6, d: 4, top: 3.1, h: 3.1 });
  const p = P.createPlayer(0, 0, 0.9); settle(p, w); let mantled = false;
  run(p, w, 0.6, (tt) => I({ mz: 1, jumpPressed: tt < DT / 2, jumpHeld: true })).forEach((e) => { if (e.type === 'mantle') mantled = true; });
  assert.ok(mantled && Math.abs(p.y - 3.1) < 1e-6, 'mantled ' + p.y);
});
t('ceiling bonk stops the rise', () => {
  const w = flat(); P.addSolid(w, { kind: 'box', x: 0, z: 0, w: 4, d: 4, top: 3, h: 1 }); const p = P.createPlayer(0, 0, 0); settle(p, w); let top = 0, bonk = false;
  run(p, w, 1, (tt, pp) => { top = Math.max(top, pp.y); return I({ jumpPressed: tt < DT / 2, jumpHeld: true }); }).forEach((e) => { if (e.type === 'bonk') bonk = true; });
  assert.ok(bonk && top <= 2 - P.TUNE.H + 1e-6 + 0.01, 'top ' + top);
});
t('semi-solid clouds: jump up through, land on top', () => {
  const w = flat(); P.addSolid(w, { kind: 'box', x: 0, z: 0, w: 4, d: 4, top: 1.8, h: 0.6, semi: true }); const p = P.createPlayer(0, 0, 0); settle(p, w);
  run(p, w, 1.5, (tt) => I({ jumpPressed: tt < DT / 2, jumpHeld: true })); assert.ok(p.grounded && Math.abs(p.y - 1.8) < 1e-6, 'on cloud ' + p.y);
});
t('moving platforms carry the player', () => {
  const w = P.createWorld(-20); const s = P.addSolid(w, { kind: 'box', x: 0, z: 0, w: 3, d: 3, top: 0, h: 0.7, path: { a: [0, 0, 0], b: [6, 0, 0], T: 4 } });
  const p = P.createPlayer(0, 0, 0); let tt = 0; for (let i = 0; i < 240; i++) { tt += DT; P.updateMovers(w, tt); P.stepPlayer(p, I(), w, DT); }
  assert.ok(Math.abs(p.x - s.x) < 0.01 && p.grounded, `p ${p.x} s ${s.x}`);
});
t('cylinder push-out keeps the player outside the radius', () => {
  const w = flat(); P.addSolid(w, { kind: 'cyl', x: 0, z: 3, r: 1, top: 4, h: 4 }); const p = P.createPlayer(0, 0, 0); settle(p, w); run(p, w, 1, () => I({ mz: 1 }));
  assert.ok(Math.hypot(p.x, p.z - 3) >= 1 + P.TUNE.R - 1e-6);
});
t('camera ray hits the nearest wall', () => {
  const w = flat(); P.addSolid(w, { kind: 'box', x: 0, z: 5, w: 4, d: 1, top: 5, h: 5 }); P.addSolid(w, { kind: 'cyl', x: 0, z: 8, r: 1, top: 5, h: 5 });
  const tHit = P.raycast(w, 0, 1, 0, 0, 0, 1, 20); assert.ok(Math.abs(tHit - 4.5) < 1e-6, tHit);
  assert.equal(P.raycast(w, 0, 10, 0, 0, 0, 1, 20), 20);
});
t('stick → world is camera relative', () => { const a = P.stickToWorld(0, 1, 0); assert.ok(Math.abs(a.mz + 1) < 1e-9); const b = P.stickToWorld(1, 0, Math.PI / 2); assert.ok(Math.abs(b.mz + 1) < 1e-9, JSON.stringify(b)); });
t('step-size robustness: 120 Hz (game fixed step) vs 240 Hz jump peaks within 2%', () => {
  const peak = (dt) => { const w = flat(), p = P.createPlayer(0, 0, 0); for (let i = 0; i < 30; i++) P.stepPlayer(p, I(), w, dt); let top = 0; for (let i = 0; i < 1.2 / dt; i++) { P.stepPlayer(p, I({ jumpPressed: i === 0, jumpHeld: true }), w, dt); top = Math.max(top, p.y); } return top; };
  const a = peak(1 / 120), b = peak(1 / 240); assert.ok(Math.abs(a - b) / b < 0.02, `${a} ${b}`);
});
console.log(`\n${n} physics tests passed`);
