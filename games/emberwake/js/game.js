// Emberwake — the pure world/event layer shared by the browser and the node story test.
// World owns the save state + the current map's live entities and runs story scripts through a host API.
import { MAPS, walkable } from './maps.js';
import { SCRIPTS } from './story.js';
import { ITEMS, EQUIP } from './data.js';
import { give, addHero, catchUpLevel, restParty, inn, heroStats } from './rules.js';

const inRect = (r, x, z) => x >= r.x && x < r.x + r.w && z >= r.z && z < r.z + r.d;

export class World {
  constructor(s, host) { this.s = s; this.host = host; this.down = new Set(); this.hidden = new Set(); this.busy = 0; this.inTrig = new Set(); this.gen = 0; }
  get f() { return this.s.flags; }
  map() { return MAPS[this.s.map]; }
  visible(e, kind) {
    if (this.hidden.has(e.id)) return false;
    if (e.cond && !e.cond(this.f)) return false;
    if (kind === 'enemy' && this.down.has(e.id)) return false;
    return true;
  }
  npcs() { return (this.map().npcs || []).filter((e) => this.visible(e, 'npc')); }
  enemies() { return (this.map().enemies || []).filter((e) => this.visible(e, 'enemy')); }
  chests() { return this.map().chests || []; }
  shrines() { return this.map().shrines || []; }
  find(id) { const M = this.map(); for (const k of ['npcs', 'enemies', 'chests', 'shrines']) { const e = (M[k] || []).find((x) => x.id === id); if (e) return { e, kind: k }; } return null; }
  canWalk(x, z) { return walkable(this.s.map, x, z, this.f); }

  // ------------------------------------------------------------ travel
  async enter(mapId, at, dir = 'down') {
    const g = ++this.gen;
    this.s.map = mapId; this.s.pos = [at[0], at[1]]; this.s.dir = dir; this.down.clear(); this.hidden.clear(); this.inTrig.clear();
    await this.host.loadMap(mapId, at, dir);
    if (g !== this.gen) return;
    // triggers covering the arrival point fire on arrival (e.g. intro, saltArrive)
    for (const t of this.map().triggers || []) if (inRect(t, at[0], at[1])) this.inTrig.add(t.id);
    for (const t of this.map().triggers || []) if (inRect(t, at[0], at[1]) && this.trigOk(t)) { await this.fireTrigger(t); if (g !== this.gen) return; }
    if (!this.busy) this.host.autosave?.();
  }
  exitFor(toMap) { return (this.map().exits || []).find((e) => e.to === toMap); }
  async useExit(ex) {
    if (ex.cond && !ex.cond(this.f)) { if (ex.block) await this.say('', ex.block); this.host.push?.(); return false; }
    await this.host.transition?.(ex);
    await this.enter(ex.to, ex.at, ex.dir);
    return true;
  }
  async exitTo(toMap) { const ex = this.exitFor(toMap); if (!ex) throw new Error(`no exit ${this.s.map} → ${toMap}`); return this.useExit(ex); }

  // called by the field whenever the player moves; edge-triggered so standing still never re-fires
  async onMove(x, z) {
    if (this.busy) return;
    const M = this.map();
    for (const ex of M.exits || []) if (inRect(ex, x, z)) { const k = 'exit:' + ex.to; if (!this.inTrig.has(k)) { this.inTrig.add(k); await this.useExit(ex); return; } } else this.inTrig.delete('exit:' + ex.to);
    for (const t of M.triggers || []) {
      const inside = inRect(t, x, z);
      if (inside && !this.inTrig.has(t.id)) { this.inTrig.add(t.id); if (this.trigOk(t)) { await this.fireTrigger(t); return; } }
      else if (!inside) this.inTrig.delete(t.id);
    }
  }
  trigOk(t) { return (!t.cond || t.cond(this.f)) && !(t.once && this.f['trig_' + t.id]); }
  async fireTrigger(t) { if (t.once) this.f['trig_' + t.id] = true; await this.run(t.script); }
  async trig(id) { const t = (this.map().triggers || []).find((x) => x.id === id); if (!t) throw new Error('no trigger ' + id); if (this.trigOk(t)) await this.fireTrigger(t); }

  // ------------------------------------------------------------ interactions
  async talk(id) { const n = (this.map().npcs || []).find((x) => x.id === id); if (!n || !this.visible(n, 'npc')) throw new Error('npc not here: ' + id); if (n.script) await this.run(n.script); }
  async touchEnemy(id, { preemptive = false } = {}) {
    const e = (this.map().enemies || []).find((x) => x.id === id);
    if (!e || !this.visible(e, 'enemy')) throw new Error('enemy not here: ' + id);
    if (e.script) return this.run(e.script);
    this.busy++;
    try { const r = await this.battle(e.group, { preemptive, sprite: e.sprite }); if (r === 'win') this.down.add(e.id); return r; } finally { this.busy--; }
  }
  async openChest(id) {
    const c = this.chests().find((x) => x.id === id); if (!c) throw new Error('chest not here: ' + id);
    if (this.s.chests[id]) return false;
    this.s.chests[id] = 1;
    if (c.gold) { this.s.gold += c.gold; await this.host.got('gold', c.gold); } else { give(this.s, c.item, c.n || 1); await this.host.got(c.item, c.n || 1); }
    return true;
  }
  async useShrine() { restParty(this.s); await this.host.shrine?.(); }
  async battle(group, opts = {}) { this.s.flags.battleCount = (this.s.flags.battleCount || 0) + 1; return this.host.battle(group, opts); }

  async run(name) {
    const fn = SCRIPTS[name]; if (!fn) throw new Error('no script ' + name);
    this.busy++; const g = this.gen;
    try { await fn(this.api(g)); } finally { this.busy--; this.host.scriptDone?.(); }
  }
  say(who, text) { return this.host.say(who, text); }

  // ------------------------------------------------------------ host API for scripts
  api(gen) {
    const W = this, H = this.host, s = this.s;
    const live = () => gen === W.gen || W.warping; // a load/warp abandons stale scripts gracefully
    const pass = (fn) => async (...a) => (live() ? fn(...a) : undefined);
    const G = {
      s, f: s.flags, who: null,
      say: pass((who, text) => H.say(who, text)),
      choose: pass((p, opts) => H.choose(p, opts)),
      title: pass((k, t) => H.title?.(k, t)),
      hint: pass((t) => H.hint?.(t)),
      flag: (k, v = true) => { s.flags[k] = v; H.flagChanged?.(k, v); },
      give: pass(async (id, n = 1) => { give(s, id, n); await H.got(id, n); }),
      gold: pass(async (n) => { s.gold += n; await H.got('gold', n); }),
      join: pass(async (id) => { const lv = catchUpLevel(s); addHero(s, id, lv); const st = heroStats(s, id); s.heroes[id].hp = st.hp; s.heroes[id].mp = st.mp; await H.joined?.(id); }),
      heal: () => restParty(s),
      battle: async (group, o = {}) => { if (!live()) return 'abandoned'; return W.battle(group, o); },
      walk: pass((id, x, z) => H.walk?.(id, x, z)), face: pass((id, d) => H.face?.(id, d)), emote: pass((id, k) => H.emote?.(id, k)),
      wait: pass((t) => H.wait?.(t)), fade: pass((to, t) => H.fade?.(to, t)), cam: pass((x, z, o) => H.cam?.(x, z, o)), camReset: pass(() => H.camReset?.()),
      fx: pass((k, x, z) => H.fx?.(k, x, z)), shake: pass((a) => H.shake?.(a)), flash: pass((c) => H.flash?.(c)), light: pass((p) => H.light?.(p)),
      hide: pass((id) => { W.hidden.add(id); return H.hide?.(id); }), show: pass((id) => { W.hidden.delete(id); return H.show?.(id); }),
      push: () => H.push?.(),
      warp: pass(async (m, x, z, d) => { W.warping = true; try { await W.enter(m, [x, z], d); } finally { W.warping = false; } gen = W.gen; }),
      shop: pass((id) => H.shop(id)),
      inn: pass(async (price) => { const r = inn(s, price); await H.innRest?.(r); return r.ok; }),
      ending: pass(() => H.ending()),
    };
    return G;
  }
}
export { ITEMS, EQUIP };
