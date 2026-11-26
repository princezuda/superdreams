// Shared node harness: a mock host that resolves every script call instantly and fights battles with the
// battle autopilot (timing quality drawn from a "typical player" distribution), retrying lost battles like a player.
import { World } from '../js/game.js';
import { newGame, buy, equip, serialize, deserialize } from '../js/rules.js';
import { simulate, applyRewards, mulberry } from '../js/battle.js';
import { GROUPS } from '../js/data.js';
import { MAPS } from '../js/maps.js';

export function makeHost(opts = {}) {
  const rng = opts.rng || mulberry(opts.seed || 7);
  const pick = (dist) => { const r = rng(); return r < dist[2] ? 2 : r < dist[2] + dist[1] ? 1 : 0; };
  const tdist = opts.timing || [0.35, 0.4, 0.25]; // [miss, good, great]
  const H = {
    log: [], errors: [], battles: [], lines: 0, ended: false, shops: [], world: null, retries: 0,
    say: async (who, t) => { H.lines++; if (typeof t !== 'string' || !t.length) H.errors.push('bad line from ' + who); },
    choose: async (p, o) => { if (!Array.isArray(o) || !o.length) H.errors.push('bad choice'); return 0; },
    got: async () => {}, loadMap: async (m) => { if (!MAPS[m]) H.errors.push('bad map ' + m); }, shop: async (id) => { H.shops.push(id); },
    battle: async (group, o) => {
      const W = H.world, s = W.s; if (!GROUPS[group]) { H.errors.push('bad group ' + group); return 'win'; }
      for (let tries = 0; tries < (opts.maxRetries ?? 6); tries++) {
        const snap = serialize(s);
        const b = simulate(s, GROUPS[group], { rng, timing: () => pick(tdist), block: () => pick(tdist), preemptive: o.preemptive });
        if (b.over === 'win') {
          b.commit(); const r = applyRewards(s, b);
          H.battles.push({ group, map: s.map, turns: b.turns, rounds: b.round, tries, lv: s.party.map((id) => s.heroes[id].lv).join('/'), boss: !!o.boss, hpLeft: b.party().map((p) => p.hp / p.mhp) });
          if (opts.autoHeal !== false) for (const id of s.party) { const h = s.heroes[id]; if (h.hp <= 0) h.hp = 1; }
          return 'win';
        }
        H.retries++; Object.assign(s, deserialize(snap));
      }
      H.errors.push(`lost ${group} on ${s.map} at lv ${s.party.map((id) => s.heroes[id].lv)}`); return 'lose';
    },
    innRest: async () => {}, ending: async () => { H.ended = true; }, autosave: () => { H.saves = (H.saves || 0) + 1; },
  };
  return H;
}

export async function playWalkthrough(ops, opts = {}) {
  const s = newGame(opts.difficulty || 'normal'); const H = makeHost(opts); const W = new World(s, H); H.world = W;
  const probs = [];
  // between fights a player tops up with tonics / shrine visits; the harness uses tonics on anyone below 45%
  const topUp = () => { if (opts.noTopUp) return; for (const id of s.party) { const h = s.heroes[id]; let guard = 5; while (guard-- && h.hp > 0 && s.inv.tonic && h.hp < 0.45 * (H.maxhp?.(id) || 1e9)) { s.inv.tonic--; h.hp += 60; } } };
  for (const op of ops) {
    const [k, a, b, c] = op;
    try {
      if (k === 'enter') await W.enter(a, MAPS[a].start, 'up');
      else if (k === 'talk') await W.talk(a);
      else if (k === 'touch') await W.touchEnemy(a);
      else if (k === 'trig') await W.trig(a);
      else if (k === 'chest') { if (!(await W.openChest(a))) probs.push('chest already open ' + a); }
      else if (k === 'shrine') await W.useShrine(a);
      else if (k === 'exit') { if (!(await W.exitTo(a))) probs.push('exit blocked ' + s.map + '→' + a); }
      else if (k === 'buy') { const r = buy(s, a, b, c); if (!r.ok) probs.push(`buy ${b}: ${r.msg} (gold ${s.gold})`); }
      else if (k === 'equip') { if (!equip(s, a, b)) probs.push(`equip ${a} ${b} failed`); }
      else if (k === 'inn') { const t = Object.values(MAPS[s.map].npcs).find((n) => /^inn/.test(n.id)); await W.talk(t.id); }
    } catch (e) { probs.push(`${JSON.stringify(op)}: ${e.message}`); }
    if (opts.trace) opts.trace(op, s, H);
  }
  return { s, H, W, probs };
}
