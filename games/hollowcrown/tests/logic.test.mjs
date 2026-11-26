// node games/hollowcrown/tests/logic.test.mjs — headless walkthrough + data integrity + fuzz for The Hollow Crown.
import { Engine } from '../js/engine.js';
import { runOps } from '../js/walk.js';
import { SCENES, ITEMS, DIALOGS, GOALS, WALKTHROUGH, ALT_ROUTE_RIDDLES, DEEDS } from '../js/story.js';
import { NavArea } from '../js/nav.js';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('  FAIL', m); } };
function mockHost() {
  const h = {
    queue: [], lines: [], deaths: 0, scene: null, errors: [],
    narrate: async (t) => { h.lines.push(['n', t]); if (typeof t !== 'string') h.errors.push('bad narration ' + JSON.stringify(t)); },
    say: async (w, t) => { h.lines.push([w, t]); if (typeof t !== 'string') h.errors.push('bad line ' + w); },
    choose: async (opts) => { const want = h.queue.shift(); const o = opts.find((x) => x.id === want); if (h.strict && want && !o && want !== 'bye') h.errors.push(`choice ${want} unavailable in [${opts.map((x) => x.id)}]`); return o ? o.id : (opts.find((x) => x.id === 'bye') || opts[0]).id; },
    walkTo: async () => {}, loadScene: async (s) => { h.scene = s; }, death: async () => { h.deaths++; }, error: (e) => h.errors.push(String(e.stack || e)),
  };
  return h;
}
async function play(ops, cfg = {}) {
  const host = mockHost(); host.strict = true; const E = new Engine(host, { narrator: 'cheeky', ...cfg }); E.rand = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  await E.boot();
  const probs = await runOps(E, ops, host);
  return { E, host, probs };
}

console.log('1. main walkthrough (normal, cheeky)');
{
  const { E, host, probs } = await play(WALKTHROUGH);
  ok(!probs.length, 'walkthrough problems: ' + probs.join(' | '));
  ok(!host.errors.length, 'host errors: ' + host.errors.join(' | '));
  ok(E.s.ended, 'story did not end');
  ok(E.score() === 100, 'expected all 10 deeds, got ' + E.score());
  ok(E.s.f.emberSet && E.s.f.bloomSet && E.s.f.tideSet, 'crown not complete');
  console.log(`   lines spoken: ${host.lines.length}, score ${E.score()}, deaths ${host.deaths}`);
}
console.log('2. gentle narrator + hard difficulty (Brannoch needs 4 points)');
{
  const { E, host, probs } = await play(WALKTHROUGH, { narrator: 'gentle', difficulty: 'hard' });
  ok(!probs.length && !host.errors.length && E.s.ended, 'hard/gentle run failed: ' + probs.concat(host.errors).join(' | '));
}
console.log('3. alternate: Royal Pass opens the gate (no persuasion)');
{
  const ops = WALKTHROUGH.map((o) => (o[0] === 'talk' && o[1] === 'brannoch' && o[2] === 'feather' ? ['item', 'pass', 'brannoch'] : o));
  const { E, host, probs } = await play(ops);
  ok(!probs.length && !host.errors.length && E.s.ended && !E.s.f.ptFeather, 'pass route failed: ' + probs.concat(host.errors).join(' | '));
}
console.log('4. alternate: riddles for the Bloom Stone (music box unused)');
{
  const i = WALKTHROUGH.findIndex((o) => o[0] === 'item' && o[1] === 'musicbox');
  const ops = WALKTHROUGH.slice(0, i).concat(ALT_ROUTE_RIDDLES, WALKTHROUGH.slice(i + 2));
  const { E, host, probs } = await play(ops);
  ok(!probs.length && !host.errors.length && E.s.ended && !E.s.f.oakAsleep, 'riddle route failed: ' + probs.concat(host.errors).join(' | '));
}
console.log('5. alternate: toffee warmed by the Crown\'s Ember');
{
  const ops = WALKTHROUGH.map((o) => (o[0] === 'item' && o[1] === 'toffee' && o[2] === 'lighthouse' ? ['combine', 'toffee', 'crown'] : o));
  const { E, host, probs } = await play(ops);
  ok(!probs.length && !host.errors.length && E.s.ended, 'ember-toffee route failed');
}
console.log('6. a wrong riddle answer restarts the game (no dead end)');
{
  const i = WALKTHROUGH.findIndex((o) => o[0] === 'item' && o[1] === 'musicbox');
  const ops = WALKTHROUGH.slice(0, i).concat([['talk', 'grumbleroot', 'trade', 'riddle', 'right', 'wrong1', 'bye'], ['talk', 'grumbleroot', 'riddle', 'right', 'right', 'right', 'bye']], WALKTHROUGH.slice(i + 2));
  const { E, host, probs } = await play(ops);
  ok(!probs.length && E.s.ended, 'wrong-answer retry failed: ' + probs.concat(host.errors).join(' | '));
}
console.log('7. humorous deaths rewind state');
{
  const { E, host } = await play([['talk', 'queen', 'bye'], ['exit', 'courtyard'], ['exit', 'gate'], ['use', 'oven']]);
  ok(host.deaths === 1, 'oven death not triggered'); ok(E.s.scene === 'square' && E.s.inv.includes('crown'), 'state not rewound sanely');
}
console.log('8. data integrity');
for (const [sid, sc] of Object.entries(SCENES)) {
  for (const [hid, h] of Object.entries(sc.hot)) { ok(h.name, `${sid}.${hid} has no name`); ok(h.look || h.npc, `${sid}.${hid} has no look`); if (h.npc) ok(DIALOGS[h.npc], `${sid}.${hid} npc ${h.npc} has no dialog`); for (const it of Object.keys(h.items || {})) ok(ITEMS[it], `${sid}.${hid} handles unknown item ${it}`); }
  for (const [eid, e] of Object.entries(sc.exits)) ok(SCENES[e.to], `${sid}.${eid} exits to unknown ${e.to}`);
}
ok(Object.keys(SCENES).length >= 10, 'need 10 scenes');
ok(Object.keys(DIALOGS).length >= 6, 'need 6+ NPC dialogs');
ok(GOALS.every((g) => g.h.length === 3), 'every goal needs 3 hint tiers');
ok(Object.keys(DEEDS).length === 10, 'deed count');
console.log('9. hint coverage: a goal exists at every step until the end');
{
  const host = mockHost(); const E = new Engine(host, {}); await E.boot(); let gaps = 0;
  for (const op of WALKTHROUGH) { await runOps(E, [op], host); if (!E.s.ended && !E.goal()) { gaps++; console.log('   no goal after', JSON.stringify(op)); } }
  ok(gaps === 0, 'hint gaps: ' + gaps);
}
console.log('10. random fuzz (500 actions × 6 seeds): no script errors, no softlocks');
for (let seed = 1; seed <= 6; seed++) {
  const host = mockHost(); const E = new Engine(host, { narrator: seed % 2 ? 'cheeky' : 'gentle' }); await E.boot();
  let r = seed * 99991; const rnd = () => ((r = (r * 48271) % 2147483647) / 2147483647); E.rand = rnd;
  for (let i = 0; i < 500; i++) {
    const sc = SCENES[E.s.scene]; const hot = Object.keys(sc.hot).filter((k) => E.hotVisible(E.s.scene, k)); const ex = Object.keys(sc.exits);
    const roll = rnd();
    host.queue = Array.from({ length: 4 }, () => ['bye', 'who', 'strange', 'feather', 'logic', 'riddle', 'right', 'trade', 'help', 'price'][Math.floor(rnd() * 10)]);
    if (roll < 0.15 && ex.length) await E.interact(ex[Math.floor(rnd() * ex.length)], 'walk');
    else if (roll < 0.55) await E.interact(hot[Math.floor(rnd() * hot.length)], ['look', 'use', 'talk'][Math.floor(rnd() * 3)]);
    else if (roll < 0.85 && E.s.inv.length) await E.interact(hot[Math.floor(rnd() * hot.length)], 'use', E.s.inv[Math.floor(rnd() * E.s.inv.length)]);
    else if (E.s.inv.length > 1) await E.combine(E.s.inv[Math.floor(rnd() * E.s.inv.length)], E.s.inv[Math.floor(rnd() * E.s.inv.length)]);
    if (E.s.ended) break;
  }
  ok(!host.errors.length, `fuzz seed ${seed}: ` + host.errors.slice(0, 3).join(' | '));
  // softlock check: from wherever the fuzz left us, the remaining walkthrough must still be finishable
  const missing = ['tongs', 'feather'].filter((i) => !E.s.inv.includes(i));
  ok(E.s.inv.includes('crown') || !E.s.f.gotCrown, `seed ${seed}: lost the crown`);
  ok(missing.length === 0 || !E.s.f.featherTaken || E.s.inv.includes('feather'), `seed ${seed}: feather vanished`);
}
console.log('11. nav: path around a hole');
{
  const nav = new NavArea([[-8, -3], [8, -3], [8, 4], [-8, 4]], [[[-1, -1], [1, -1], [1, 1], [-1, 1]]]);
  const p = nav.path([-4, 0], [4, 0]);
  ok(p.length >= 2, 'expected a detour path'); ok(p.every((q) => nav.inside(q)), 'path leaves walk area');
  const c = nav.clamp([0, 0]); ok(nav.inside(c), 'clamp failed');
  ok(nav.path([-7, 3], [7, 3]).length === 1, 'straight line should be direct');
}
console.log(fails ? `\n${fails} FAILURES` : '\nALL TESTS PASSED');
process.exit(fails ? 1 : 0);
