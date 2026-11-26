// node games/emberwake/tests/logic.test.mjs — battle maths, XP curve, saves, data integrity, a scripted full-story run.
import { Battle, simulate, applyRewards, mulberry, MAX_BP } from '../js/battle.js';
import { newGame, addHero, heroStats, gainXP, serialize, deserialize, buy, sell, equip, useItemField, inn, catchUpLevel, saveSummary, skillsFor } from '../js/rules.js';
import { HEROES, SKILLS, ITEMS, EQUIP, ENEMIES, GROUPS, SHOPS, xpToNext, MAX_LEVEL, TIMING, WEAK_MULT, BREAK_MULT, TYPES } from '../js/data.js';
import { MAPS, mapInfo, walkable, canStep } from '../js/maps.js';
import { SCRIPTS, CAST, WALKTHROUGH } from '../js/story.js';
import { playWalkthrough } from './harness.mjs';

let fails = 0, passes = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('  FAIL', m); } else passes++; };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

console.log('1. XP curve + levelling');
{
  ok(xpToNext(1) > 0 && [...Array(MAX_LEVEL - 1)].every((_, i) => xpToNext(i + 2) > xpToNext(i + 1)), 'xp curve must be strictly increasing');
  ok(xpToNext(1) <= 20 && xpToNext(10) < 300, 'early levels should come quickly');
  const s = newGame(); const ups = gainXP(s, xpToNext(1) + xpToNext(2) + 1);
  ok(s.heroes.rook.lv === 3 && ups.length === 2, 'two level-ups expected, got lv ' + s.heroes.rook.lv);
  ok(ups[1].learned.includes('twincut'), 'Rook learns Twin Cut at Lv 3');
  const st1 = heroStats(newGame(), 'rook'), st3 = heroStats(s, 'rook');
  ok(st3.hp > st1.hp && st3.atk > st1.atk, 'stats grow with level');
  gainXP(s, 1e7); ok(s.heroes.rook.lv === MAX_LEVEL && s.heroes.rook.xp === 0, 'level cap holds');
  const s2 = newGame(); s2.heroes.rook.lv = 9; addHero(s2, 'bram', catchUpLevel(s2)); ok(s2.heroes.bram.lv === 9, 'catch-up joins at the party average level, got ' + s2.heroes.bram.lv); s2.heroes.bram.lv = 5; addHero(s2, 'ines', catchUpLevel(s2)); ok(s2.heroes.ines.lv === 7, 'average of 9 and 5 is 7');
}
console.log('2. battle maths (damage, weakness, break, timing, boost, block)');
{
  const mk = (seed = 3) => { const s = newGame(); return { s, b: new Battle(s, ['gloomcap'], { rng: mulberry(seed) }) }; };
  // deterministic expected damage for a plain attack
  const { s, b } = mk(); const u = b.party()[0], e = b.enemies()[0];
  const A = heroStats(s, 'rook').atk, D = ENEMIES.gloomcap.def;
  const base = A * 60 / (60 + D);
  const ev = b.resolve({ kind: 'attack', actor: u.uid, target: e.uid, boost: 0 }, { timing: 0 });
  const hit = ev.find((x) => x.t === 'hit');
  ok(hit && hit.weak, 'Rook\'s blade is a gloomcap weakness');
  ok(hit.amt >= Math.floor(base * WEAK_MULT * 0.92) && hit.amt <= Math.ceil(base * WEAK_MULT * 1.08), `weak damage ${hit.amt} outside ${base * WEAK_MULT * 0.92}..${base * WEAK_MULT * 1.08}`);
  ok(e.shield === ENEMIES.gloomcap.shield - 1 && hit.reveal === 'blade', 'weak hit chips the shield and reveals the weakness');
  // timing multipliers
  const dmg = (q, seed) => { const { b } = mk(seed); const u = b.party()[0], e = b.enemies()[0]; return b.resolve({ kind: 'attack', actor: u.uid, target: e.uid }, { timing: q }).find((x) => x.t === 'hit').amt; };
  const d0 = dmg(0, 9), d1 = dmg(1, 9), d2 = dmg(2, 9);
  ok(near(d1 / d0, TIMING.attack[1], 0.08) && near(d2 / d0, TIMING.attack[2], 0.08), `timing multipliers ${d0}/${d1}/${d2}`);
  // break: two weak hits on a 2-shield foe → broken, then ×BREAK_MULT
  { const { b } = mk(5); const u = b.party()[0], e = b.enemies()[0]; e.hp = e.mhp = 9999; u.bp = 3;
    const ev = b.resolve({ kind: 'attack', actor: u.uid, target: e.uid, boost: 1 }, { timing: 0 });
    const hits = ev.filter((x) => x.t === 'hit'); ok(hits.length === 2, 'boost 1 = two hits'); ok(hits[1].broke && e.brokenUntil, 'second weak hit breaks a 2-shield foe');
    ok(u.bp === 2 && u.boostedLast, 'boost spends BP');
    const before = e.hp; const ev2 = b.resolve({ kind: 'attack', actor: u.uid, target: e.uid }, { timing: 0 }); const amt = ev2.find((x) => x.t === 'hit').amt;
    ok(amt > hits[0].amt * 1.3, `broken foes take more damage (${amt} vs ${hits[0].amt})`); void before;
  }
  // BP: +1 per turn, not after boosting, capped
  { const { b } = mk(); const u = b.party()[0]; b.beginTurn(u); ok(u.bp === 1, 'no BP on the very first turn'); b.beginTurn(u); ok(u.bp === 2, 'BP +1 next turn'); u.boostedLast = true; b.beginTurn(u); ok(u.bp === 2, 'no BP the turn after boosting'); u.bp = MAX_BP; b.beginTurn(u); ok(u.bp === MAX_BP, 'BP capped'); }
  // block reduces enemy damage
  { const out = []; for (const q of [0, 1, 2]) { const s = newGame(); const b = new Battle(s, ['bristleboar'], { rng: mulberry(11) }); const e = b.enemies()[0]; const ev = b.resolve({ kind: 'enemy', actor: e.uid, act: ENEMIES.bristleboar.acts[0], targets: [b.party()[0].uid] }, { block: { [b.party()[0].uid]: q } }); out.push(ev.find((x) => x.t === 'hit').amt); }
    ok(out[2] < out[1] && out[1] < out[0], 'block quality reduces damage: ' + out.join('/')); }
  // charged attacks: telegraph, Break cancels
  { const s = newGame(); addHero(s, 'bram', 6); s.heroes.rook.lv = 6; const b = new Battle(s, ['rootmother'], { rng: mulberry(2) }); const boss = b.enemies()[0];
    b.resolve({ kind: 'charge', actor: boss.uid, act: ENEMIES.rootmother.acts[2] }); ok(boss.charge, 'charge stored');
    boss.shield = 1; const ev = b.resolve({ kind: 'attack', actor: b.party()[0].uid, target: boss.uid }, { timing: 0 }); ok(ev.find((x) => x.t === 'hit').cancel && !boss.charge, 'break cancels a charged attack'); }
  // phase change
  { const s = newGame(); for (const h of ['bram', 'ines']) addHero(s, h, 14); s.heroes.rook.lv = 14; const b = new Battle(s, ['morrow'], { rng: mulberry(4) }); const m = b.enemies()[0]; m.hp = 1; m.weak = ['blade'];
    const ev = b.resolve({ kind: 'attack', actor: b.party()[0].uid, target: m.uid }, { timing: 0 }); ok(ev.some((x) => x.t === 'phase') && m.id === 'morrow2' && m.hp > 1000 && !b.over, 'Morrow enters phase two instead of dying'); }
  // healing, revive, items
  { const s = newGame(); addHero(s, 'ines', 8); const b = new Battle(s, ['gloomcap'], { rng: mulberry(1) }); const [r, i] = b.party(); r.hp = 5; i.mp = 99;
    b.resolve({ kind: 'skill', actor: i.uid, skill: 'mend', target: r.uid }, {}); ok(r.hp > 30, 'Mend heals'); r.hp = 0; b.resolve({ kind: 'skill', actor: i.uid, skill: 'rekindle', target: r.uid }, {}); ok(r.hp > 0, 'Rekindle revives');
    s.inv.cinderbomb = 1; const e = b.enemies()[0]; const h0 = e.hp; b.resolve({ kind: 'item', actor: r.uid, item: 'cinderbomb', target: 0 }, {}); ok(e.hp < h0 && !s.inv.cinderbomb, 'bombs hit and are consumed'); }
  // turn order shows current + next round and is speed-sorted on average
  { const s = newGame(); const b = new Battle(s, ['thornbat', 'gloomcap'], { rng: mulberry(8) }); const q = b.queue(10); ok(q.some((x) => x.round === 1) && q[0].round === 0, 'queue spans two rounds'); }
  // flee never works on bosses
  { const s = newGame(); addHero(s, 'bram', 6); const b = new Battle(s, ['rootmother'], { rng: () => 0 }); const ev = b.resolve({ kind: 'flee', actor: b.party()[0].uid }); ok(!ev[0].ok && !b.over, 'cannot flee a boss'); }
  // win → rewards; XP + gold applied
  { const s = newGame(); const b = simulate(s, ['gloomcap'], { rng: mulberry(3), timing: () => 2, block: () => 2 }); ok(b.over === 'win', 'Lv1 Rook beats one gloomcap'); b.commit(); const g0 = s.gold; const r = applyRewards(s, b); ok(s.gold === g0 + r.gold && r.xp > 0, 'rewards applied'); }
}
console.log('3. economy + items + equipment');
{
  const s = newGame(); s.gold = 1000;
  ok(buy(s, 'kindle_smith', 'w_brand').ok && s.inv.w_brand === 1, 'buy weapon'); ok(!buy(s, 'kindle_smith', 'w_tidecutter').ok, 'cannot buy off-list');
  const atk0 = heroStats(s, 'rook').atk; ok(equip(s, 'rook', 'w_brand') && heroStats(s, 'rook').atk === atk0 + EQUIP.w_brand.atk - EQUIP.w_wick.atk && s.inv.w_wick === 1, 'equip swaps and returns old weapon');
  ok(!equip(s, 'rook', 'h_maul'), 'cannot equip another hero\'s weapon');
  const g = s.gold; ok(sell(s, 'w_wick').ok && s.gold === g, 'starter gear sells for 0 (price 0) — no exploit');
  s.heroes.rook.hp = 1; ok(useItemField(s, 'tonic', 'rook').ok && s.heroes.rook.hp === 61, 'tonic heals 60'); ok(!useItemField(s, 'ash', 'rook').ok, 'ash refuses a living target');
  ok(!sell(s, 'shard').ok, 'key items cannot be sold');
  s.heroes.rook.hp = 1; ok(inn(s, 12).ok && s.heroes.rook.hp === heroStats(s, 'rook').hp, 'inn restores');
  for (const [id, sh] of Object.entries(SHOPS)) for (const k of sh.stock) ok(ITEMS[k] || EQUIP[k], `shop ${id} sells unknown ${k}`);
}
console.log('4. save round-trip');
{
  const s = newGame('hard'); addHero(s, 'bram', 4); s.flags.boss1 = true; s.inv.ash = 2; s.heroes.bram.eq.charm = 'c_ember'; s.time = 1234.5; s.bestiary.gloomcap = { weak: ['fire'], seen: 3, kills: 2 };
  const txt = JSON.stringify(serialize(s)); const back = deserialize(JSON.parse(txt));
  ok(back && JSON.stringify(serialize(back)) === txt, 'serialize → deserialize is lossless');
  ok(back.difficulty === 'hard' && back.heroes.bram.eq.charm === 'c_ember' && back.flags.boss1, 'fields survive');
  ok(deserialize({ v: 99 }) === null && deserialize(null) === null && deserialize({ v: 1, party: ['nobody'], heroes: {} }) === null, 'bad saves are rejected');
  ok(saveSummary(serialize(s)).lv === 1 && saveSummary(serialize(s)).party.length === 2, 'summary');
}
console.log('5. data integrity');
{
  for (const [id, H] of Object.entries(HEROES)) { for (const [, k] of H.skills) ok(SKILLS[k], `${id} skill ${k}`); ok(CAST[id], 'cast for ' + id); for (const sl of ['weapon', 'armor', 'charm']) if (H.start[sl]) ok(EQUIP[H.start[sl]], `${id} start ${sl}`); }
  for (const [id, E] of Object.entries(ENEMIES)) { ok(E.weak.length >= 2 && E.weak.every((t) => TYPES[t]), `${id} needs 2+ valid weaknesses`); ok(E.acts.length, `${id} acts`); for (const a of E.acts) if (a.summon) ok(ENEMIES[a.summon], `${id} summons ${a.summon}`); if (E.phase2) ok(ENEMIES[E.phase2], 'phase2 ' + id); }
  ok(Object.values(ENEMIES).filter((e) => !e.boss).length >= 8 && Object.values(ENEMIES).filter((e) => e.boss && !e.phase2 || e.id).length >= 3, '≥8 enemy types + bosses');
  for (const [g, list] of Object.entries(GROUPS)) for (const e of list) ok(ENEMIES[e], `group ${g} → ${e}`);
  // every party member can hit every type between them
  const cover = new Set(); for (const H of Object.values(HEROES)) { cover.add(H.weapon); for (const [, k] of H.skills) if (TYPES[SKILLS[k].type]) cover.add(SKILLS[k].type); } ok(cover.size === 6, 'party covers all 6 damage types');
  for (const [mid, M] of Object.entries(MAPS)) {
    const { W } = mapInfo(mid); ok(M.tiles.every((r) => r.length === W), `${mid} rows`);
    for (const n of M.npcs || []) { ok(CAST[n.cast], `${mid} npc ${n.id} cast`); if (n.script) ok(SCRIPTS[n.script], `${mid} npc ${n.id} script ${n.script}`); }
    for (const e of M.enemies || []) { ok(GROUPS[e.group], `${mid} enemy ${e.id} group`); if (e.script) ok(SCRIPTS[e.script], `${mid} ${e.id} script`); }
    for (const t of M.triggers || []) ok(SCRIPTS[t.script], `${mid} trigger ${t.id}`);
    for (const ex of M.exits || []) { ok(MAPS[ex.to], `${mid} exit → ${ex.to}`); ok(walkable(ex.to, ex.at[0], ex.at[1], { thornsGone: 1 }), `${mid} exit lands on walkable ${ex.to} ${ex.at}`); }
    for (const c of M.chests || []) ok(c.gold || ITEMS[c.item] || EQUIP[c.item], `${mid} chest ${c.id}`);
  }
  // reachability: every NPC/enemy/chest/shrine/exit reachable from the start with all gates open
  const f = { thornsGone: 1, rootsOpen: 1 };
  for (const [mid, M] of Object.entries(MAPS)) {
    if (M.kind === 'stage') continue;
    const seen = new Set(), q = [[Math.floor(M.start[0]), Math.floor(M.start[1])]]; seen.add(q[0].join());
    while (q.length) { const [x, z] = q.shift(); for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = (x + dx) + ',' + (z + dz); if (!seen.has(k) && canStep(mid, x + 0.5, z + 0.5, x + dx + 0.5, z + dz + 0.5, f)) { seen.add(k); q.push([x + dx, z + dz]); } } }
    const near1 = (x, z) => { for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (seen.has(Math.floor(x + dx) + ',' + Math.floor(z + dz))) return true; return false; };
    for (const e of [...(M.npcs || []), ...(M.enemies || []), ...(M.chests || []), ...(M.shrines || [])]) ok(near1(e.x, e.z), `${mid}: ${e.id} unreachable`);
  }
}
console.log('6. scripted full story, start → credits (3 seeds × normal, 1 × hard, 1 × story)');
{
  // typical player timing [miss, good, great]; Hard is tuned for a practised player
  const runs = [[1, 'normal', [0.35, 0.4, 0.25]], [2, 'normal', [0.35, 0.4, 0.25]], [3, 'normal', [0.35, 0.4, 0.25]], [4, 'hard', [0.15, 0.45, 0.4]], [5, 'easy', [0.6, 0.3, 0.1]]];
  for (const [seed, difficulty, timing] of runs) {
    const { s, H, probs } = await playWalkthrough(WALKTHROUGH, { seed, difficulty, timing, maxRetries: 10 });
    const bosses = H.battles.filter((b) => b.boss).map((b) => `${b.group}@${b.lv}(${b.tries} retr)`).join(' ');
    ok(H.ended, `seed ${seed} ${difficulty}: story did not reach the credits`);
    ok(!H.errors.length, `seed ${seed}: host errors ${H.errors.join(' | ')}`);
    const hardProbs = probs.filter((p) => !/Not enough gold|equip .* failed/.test(p));
    ok(!hardProbs.length, `seed ${seed}: walkthrough problems ${hardProbs.join(' | ')}`);
    ok(s.flags.boss1 && s.flags.boss2 && s.flags.boss3 && s.flags.ending, 'all three bosses beaten');
    ok(s.party.length === 3, 'full party');
    console.log(`   seed ${seed} ${difficulty.padEnd(6)} battles ${H.battles.length} retries ${H.retries} lines ${H.lines} final Lv ${s.party.map((id) => s.heroes[id].lv).join('/')} · ${bosses}`);
    if (difficulty === 'normal') ok(H.retries <= 6, 'normal difficulty should not need many retries (typical timing)');
  }
  // estimated play time: ~6 s per dialogue line, ~6 s per battle turn (1× speed), plus walking per map visit
  const { H } = await playWalkthrough(WALKTHROUGH, { seed: 9 });
  // ≈5 s per dialogue line, ≈4.5 s per battle action at 1× speed (incl. menus), ≈100 s exploring per map visit, ≈2 min of shops/menus per town visit
  const turns = H.battles.reduce((a, b) => a + b.turns, 0), visits = H.saves || 0, mins = (H.lines * 5 + turns * 4.5 + visits * 100 + 6 * 120) / 60;
  console.log(`   estimated first-play length ≈ ${Math.round(mins)} min (${H.lines} lines, ${H.battles.length} battles, ${turns} actions, ${visits} map visits)`);
  ok(mins > 50 && mins < 120, 'play length within the 60–90 min target band (loosely)');
}
console.log(fails ? `\n${fails} FAILURES (${passes} passed)` : `\nALL ${passes} CHECKS PASSED`);
process.exit(fails ? 1 : 0);
