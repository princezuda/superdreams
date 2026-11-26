// Emberwake — pure progression rules: party, stats, XP/levels, equipment, inventory, shops, inns, saves.
// No DOM / three imports: node tests drive this directly.
import { HEROES, SKILLS, ITEMS, EQUIP, SHOPS, MAX_LEVEL, xpToNext, DIFFICULTY } from './data.js';

export const SAVE_VERSION = 1;
const STATS = ['hp', 'mp', 'atk', 'mag', 'def', 'res', 'spd'];

export function newGame(difficulty = 'normal') {
  const s = {
    v: SAVE_VERSION, difficulty, map: 'kindlewick', pos: [14.5, 12.5], dir: 'down',
    party: ['rook'], heroes: {}, gold: 40, inv: { tonic: 3 }, flags: {}, chests: {}, bestiary: {},
    time: 0, stats: { battles: 0, wins: 0, breaks: 0, greats: 0, flees: 0 }, cleared: {},
  };
  addHero(s, 'rook', 1);
  return s;
}

export function addHero(s, id, lv = 1) {
  if (!s.heroes[id]) {
    const H = HEROES[id];
    s.heroes[id] = { lv, xp: 0, hp: 1, mp: 1, eq: { ...H.start } };
    const st = heroStats(s, id); s.heroes[id].hp = st.hp; s.heroes[id].mp = st.mp;
  }
  if (!s.party.includes(id)) s.party.push(id);
  return s.heroes[id];
}

export function baseStats(id, lv) {
  const H = HEROES[id], o = {};
  for (const k of STATS) o[k] = Math.floor(H.base[k] + H.grow[k] * (lv - 1));
  return o;
}
export function heroStats(s, id) {
  const h = s.heroes[id], o = baseStats(id, h.lv);
  for (const slot of ['weapon', 'armor', 'charm']) { const e = EQUIP[h.eq[slot]]; if (e) for (const k of STATS) o[k] += e[k] || 0; }
  return o;
}
export const skillsFor = (id, lv) => HEROES[id].skills.filter(([l]) => l <= lv).map(([, k]) => k);

// Shared XP: every party member (KO'd included — no punishment) gets the full amount.
export function gainXP(s, amount) {
  const ups = [];
  for (const id of s.party) {
    const h = s.heroes[id]; h.xp += amount;
    while (h.lv < MAX_LEVEL && h.xp >= xpToNext(h.lv)) {
      const before = heroStats(s, id), oldSkills = skillsFor(id, h.lv);
      h.xp -= xpToNext(h.lv); h.lv++;
      const after = heroStats(s, id);
      h.hp += after.hp - before.hp; h.mp += after.mp - before.mp; // level-up grants the new headroom
      ups.push({ id, lv: h.lv, gains: Object.fromEntries(STATS.map((k) => [k, after[k] - before[k]])), learned: skillsFor(id, h.lv).filter((k) => !oldSkills.includes(k)) });
    }
    if (h.lv >= MAX_LEVEL) h.xp = 0;
  }
  return ups;
}
// newcomers catch up to the party so nobody is left behind (genre must-have: no forced grind)
export function catchUpLevel(s) {
  const lv = s.party.map((id) => s.heroes[id].lv);
  return Math.max(1, Math.round(lv.reduce((a, b) => a + b, 0) / lv.length));
}

export function restParty(s) {
  for (const id of s.party) { const st = heroStats(s, id); s.heroes[id].hp = st.hp; s.heroes[id].mp = st.mp; }
}
export function clampParty(s) {
  for (const id of s.party) { const st = heroStats(s, id), h = s.heroes[id]; h.hp = Math.max(0, Math.min(h.hp, st.hp)); h.mp = Math.max(0, Math.min(h.mp, st.mp)); }
}

// ---------------------------------------------------------------- inventory
export const count = (s, id) => s.inv[id] || 0;
export function give(s, id, n = 1) { s.inv[id] = (s.inv[id] || 0) + n; if (s.inv[id] <= 0) delete s.inv[id]; }
export function take(s, id, n = 1) { if (count(s, id) < n) return false; give(s, id, -n); return true; }
export const isEquip = (id) => !!EQUIP[id];
export const itemName = (id) => (ITEMS[id] || EQUIP[id] || { name: id }).name;
export const priceOf = (id) => (ITEMS[id] || EQUIP[id] || {}).price || 0;

// Field use of a consumable. Returns {ok, msg}.
export function useItemField(s, item, target) {
  const it = ITEMS[item]; if (!it || !count(s, item)) return { ok: false, msg: 'You have none.' };
  const all = it.kind === 'healall';
  const targets = all ? s.party : [target];
  if (!all && !s.heroes[target]) return { ok: false, msg: 'No target.' };
  const h = s.heroes[target], st = h && heroStats(s, target);
  if (it.kind === 'heal') { if (h.hp <= 0) return { ok: false, msg: `${HEROES[target].name} is down — use Rekindle Ash.` }; if (h.hp >= st.hp) return { ok: false, msg: 'Already at full health.' }; h.hp = Math.min(st.hp, h.hp + it.amt); }
  else if (it.kind === 'mp') { if (h.mp >= st.mp) return { ok: false, msg: 'MP is already full.' }; h.mp = Math.min(st.mp, h.mp + it.amt); }
  else if (it.kind === 'revive') { if (h.hp > 0) return { ok: false, msg: 'Only for fallen allies.' }; h.hp = Math.max(1, Math.round(st.hp * it.pct)); }
  else if (it.kind === 'healall') { for (const id of targets) { const hh = s.heroes[id], ss = heroStats(s, id); if (hh.hp > 0) hh.hp = Math.min(ss.hp, hh.hp + it.amt); } }
  else return { ok: false, msg: 'That can only be used in battle.' };
  take(s, item); return { ok: true, msg: `Used ${it.name}.` };
}

// ---------------------------------------------------------------- equipment
export function canEquip(heroId, eqId) { const e = EQUIP[eqId]; return !!e && (!e.who || e.who === heroId); }
export function equip(s, heroId, eqId) {
  const e = EQUIP[eqId]; if (!canEquip(heroId, eqId) || !count(s, eqId)) return false;
  const h = s.heroes[heroId], old = h.eq[e.slot];
  take(s, eqId); if (old) give(s, old); h.eq[e.slot] = eqId; clampParty(s); return true;
}
export function unequip(s, heroId, slot) {
  const h = s.heroes[heroId]; if (slot === 'weapon' || !h.eq[slot]) return false;
  give(s, h.eq[slot]); h.eq[slot] = null; clampParty(s); return true;
}
// stat preview for shop / equip screens
export function equipDelta(s, heroId, eqId) {
  const e = EQUIP[eqId], h = s.heroes[heroId]; const cur = EQUIP[h.eq[e.slot]] || {};
  const o = {}; for (const k of STATS) { const d = (e[k] || 0) - (cur[k] || 0); if (d) o[k] = d; } return o;
}

// ---------------------------------------------------------------- shops + inns
export function buy(s, shopId, id, n = 1) {
  const shop = SHOPS[shopId]; if (!shop || !shop.stock.includes(id)) return { ok: false, msg: 'Not sold here.' };
  const cost = priceOf(id) * n; if (s.gold < cost) return { ok: false, msg: 'Not enough gold.' };
  s.gold -= cost; give(s, id, n); return { ok: true, msg: `Bought ${itemName(id)}${n > 1 ? ' ×' + n : ''}.` };
}
export function sell(s, id, n = 1) {
  if (count(s, id) < n || (ITEMS[id] && ITEMS[id].kind === 'key')) return { ok: false, msg: 'Cannot sell that.' };
  const v = Math.floor(priceOf(id) / 2) * n; take(s, id, n); s.gold += v; return { ok: true, msg: `Sold for ${v}g.` };
}
export function inn(s, price) {
  if (s.gold < price) return { ok: false, msg: 'Not enough gold.' };
  s.gold -= price; restParty(s); return { ok: true, msg: 'The party rests. HP and MP fully restored.' };
}

// ---------------------------------------------------------------- bestiary (weaknesses stay known once found)
export function learnWeak(s, enemyId, type) { const b = s.bestiary[enemyId] ||= { weak: [], seen: 0, kills: 0 }; if (!b.weak.includes(type)) b.weak.push(type); }

// ---------------------------------------------------------------- saves
export function serialize(s) { return JSON.parse(JSON.stringify(s)); }
export function deserialize(o) {
  if (!o || typeof o !== 'object' || o.v !== SAVE_VERSION || !Array.isArray(o.party) || !o.heroes) return null;
  for (const id of o.party) if (!HEROES[id] || !o.heroes[id]) return null;
  const s = Object.assign(newGame(o.difficulty), o);
  if (!DIFFICULTY[s.difficulty]) s.difficulty = 'normal';
  for (const id of s.party) { const h = s.heroes[id]; h.eq = Object.assign({ weapon: HEROES[id].start.weapon, armor: null, charm: null }, h.eq); }
  clampParty(s);
  return s;
}
export function saveSummary(o) {
  if (!o) return null;
  const lead = o.party?.[0];
  return { map: o.map, lv: lead ? o.heroes[lead].lv : 1, party: o.party, time: o.time | 0, gold: o.gold, chapter: o.flags?.chapter || 1, when: o.when || 0 };
}
export const fmtTime = (sec) => { sec |= 0; const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60; return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(sec % 60).padStart(2, '0')}s`; };
export { SKILLS };
