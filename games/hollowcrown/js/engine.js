// The Hollow Crown — adventure engine. Pure logic (no DOM / three.js): state, verbs, scripts, dialog runner,
// death-rewind, hints, autosave payloads. A "host" object presents everything (main.js in the browser, a mock in tests).
import { SCENES, DIALOGS, ITEMS, COMBOS, SELF, FALLBACK, GOALS, DEEDS, CAST, FINALE, EPILOGUE, CHAPTERS } from './story.js';

export const REWIND = Symbol('rewind');
const isAsync = (f) => typeof f === 'function' && f.constructor && f.constructor.name === 'AsyncFunction';
const clone = (o) => JSON.parse(JSON.stringify(o));

export function newState(cfg = {}) {
  return { v: 1, scene: 'throne', entry: 'start', inv: ['wrench'], f: {}, deeds: {}, used: {}, visited: {}, map: false, chapter: 1, time: 0, lastProgress: 0, hints: {}, hintsUsed: 0, nudged: {}, difficulty: cfg.difficulty || 'normal', ended: false };
}

export class Engine {
  constructor(host, cfg = {}) {
    this.host = host; this.cfg = cfg; this.s = newState(cfg); this.busy = false; this.snapshot = null; this.rand = Math.random;
    this.G = this.makeG();
  }
  // ------------------------------------------------------------ text helpers
  tone(t) { if (t && typeof t === 'object' && 'c' in t) return this.cfg.narrator === 'gentle' ? t.g : t.c; return t; }
  async text(v) { // resolve look/use fields: string | T | sync (s)=>text | async (G)=>void
    if (v == null) return null;
    if (isAsync(v)) { await v(this.G); return true; }
    if (typeof v === 'function') v = v(this.s);
    if (v == null) return null;
    await this.G.n(v); return true;
  }
  itemName(id) { const it = ITEMS[id]; if (!it) return id; return typeof it.name === 'function' ? it.name(this.s) : it.name; }
  hotName(sceneId, hid) {
    const sc = SCENES[sceneId]; const h = sc?.hot[hid] || sc?.exits[hid]; if (!h) return hid;
    return typeof h.name === 'function' ? h.name(this.s) : h.name;
  }
  hotVisible(sceneId, hid) { const h = SCENES[sceneId]?.hot[hid]; return !h || !h.vis || h.vis(this.s); }
  exitOpen(sceneId, eid) { const e = SCENES[sceneId]?.exits[eid]; return !!e; }
  progress() { this.s.lastProgress = this.s.time; }

  // ------------------------------------------------------------ the scripting API used by story.js
  makeG() {
    const E = this, s = () => E.s, H = () => E.host;
    const G = {
      get s() { return E.s; }, get diff() { return E.s.difficulty; },
      f: (k) => !!E.s.f[k],
      set: (k, v = true) => { if (E.s.f[k] !== v) { E.s.f[k] = v; E.progress(); } },
      once: (k) => { if (E.s.f[k]) return false; E.s.f[k] = true; return true; },
      d: (k) => !!E.s.deeds[k],
      has: (i) => E.s.inv.includes(i),
      give: (i) => { if (!E.s.inv.includes(i)) { E.s.inv.push(i); E.progress(); H().invChanged?.(i, 'add'); } },
      take: (i) => { const k = E.s.inv.indexOf(i); if (k >= 0) { E.s.inv.splice(k, 1); E.progress(); H().invChanged?.(i, 'remove'); } },
      itemName: (i) => E.itemName(i),
      n: (t) => H().narrate(E.tone(t)),
      h: (t) => H().say('hero', E.tone(t)),
      say: (who, t) => H().say(who, E.tone(t)),
      anim: (who, name, dur) => H().anim?.(who, name, dur) ?? Promise.resolve(),
      fx: (name, arg) => H().fx?.(name, arg),
      sfx: (name) => H().sfx?.(name),
      wait: (sec) => H().wait?.(sec) ?? Promise.resolve(),
      refresh: () => H().refresh?.(),
      tutorial: (k) => H().tutorial?.(k),
      shuffle: (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(E.rand() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; },
      choose: (opts, o = {}) => H().choose(opts.map((x) => ({ ...x, t: E.tone(x.t) })), o),
      deed: async (k) => { if (E.s.deeds[k]) return; E.s.deeds[k] = true; E.progress(); H().sfx?.('chime'); await H().deed?.(k, DEEDS[k], E.score()); },
      dialog: (npc) => E.dialog(npc),
      death: async (t) => { await H().death(E.tone(t)); throw REWIND; },
      goto: (scene, entry) => E.enter(scene, entry),
      chapter: async (n) => { E.s.chapter = Math.max(E.s.chapter, n); await H().chapter?.(n, CHAPTERS[n]); },
      unlockMap: () => { if (!E.s.map) { E.s.map = true; H().unlockMap?.(); } },
      finale: () => FINALE(G),
      epilogue: async () => { await H().epilogue?.(); await EPILOGUE(G); },
      theEnd: async () => { E.s.ended = true; await H().theEnd?.(E.summary()); },
    };
    return G;
  }

  // ------------------------------------------------------------ running scripts safely
  async run(fn) {
    if (this.busy) return false;
    this.busy = true; this.snapshot = clone(this.s); this.host.busy?.(true);
    try { await fn(); }
    catch (e) {
      if (e === REWIND) { this.s = this.snapshot; this.host.rewound?.(); }
      else { this.host.error?.(e); console.error(e); }
    } finally { this.busy = false; this.host.busy?.(false); this.host.autosave?.(); }
    return true;
  }
  async enter(scene, entry) {
    const prev = this.s.scene;
    this.s.scene = scene; this.s.entry = entry || 'start'; this.s.visited[scene] = true;
    await this.host.loadScene(scene, this.s.entry, prev);
    const sc = SCENES[scene];
    if (sc.enter) await sc.enter(this.G);
    this.host.autosave?.();
  }
  // start or resume: load the current scene without consuming input
  async boot() { await this.run(() => this.enter(this.s.scene, this.s.entry)); }

  // verb on a hotspot / NPC / exit.  verb: look | use | talk | walk ; item: inventory id
  async interact(hid, verb, item = null) {
    return this.run(async () => {
      const sc = SCENES[this.s.scene];
      const ex = sc.exits[hid];
      if (ex) {
        if (verb === 'look') { await this.G.n(this.tone(ex.look) || `${this.tone(ex.name) || ex.name}.`); return; }
        await this.host.walkTo(hid);
        if (ex.can && !(await ex.can(this.G))) return;
        await this.enter(ex.to, ex.entry);
        return;
      }
      const h = sc.hot[hid];
      if (!h || (h.vis && !h.vis(this.s))) return;
      const name = this.hotName(this.s.scene, hid);
      if (verb === 'look') { this.host.face?.(hid); await this.text(h.look) ?? (await this.G.n(`It's ${name}.`)); return; }
      if (hid === 'hero') return this.useOnSelf(item);
      await this.host.walkTo(hid);
      if (item) {
        const fn = h.items?.[item];
        if (fn) { await this.text(fn); return; }
        if (h.item) { await h.item(this.G, item); return; }
        if (h.npc && ['bread', 'glowcap', 'lavender'].includes(item)) { await this.G.n(this.quip('item', item, name)); return; }
        await this.G.n(this.quip('item', item, name)); return;
      }
      if (verb === 'talk' || (verb === 'use' && h.npc && !h.use)) {
        if (h.talk) { await this.text(h.talk); return; }
        if (h.npc) { await this.dialog(h.npc); return; }
        await this.G.n(this.quip('talk', null, name)); return;
      }
      if (h.use) { await this.text(h.use); return; }
      await this.G.n(this.quip('use', null, name));
    });
  }
  async exitTo(eid) { return this.interact(eid, 'walk'); }
  async travel(scene) { // world map fast travel
    if (!this.s.map || !this.s.visited[scene] || scene === this.s.scene || scene === 'isle') return false;
    return this.run(() => this.enter(scene, 'map'));
  }
  async walkGround() { /* walking is host-side; nothing to resolve */ }
  async combine(a, b) {
    return this.run(async () => {
      if (a === b) return;
      const key = [a, b].sort().join('+');
      const fn = COMBOS[key];
      if (fn) { await this.text(fn); return; }
      await this.G.n(this.quip('combine'));
    });
  }
  async lookItem(id) { return this.run(async () => { const it = ITEMS[id]; await this.text(it.look); }); }
  async useOnSelf(item) {
    if (!item) { await this.G.n(this.tone({ c: "{name}, Royal Tinker of Wrenfold: oil on the cuffs, a wrench in the belt, and the kingdom's heart in a borrowed crown.", g: "That's you: {name}, Royal Tinker of Wrenfold." })); return; }
    const v = SELF[item];
    if (v === 'death') return this.G.death({ c: "You nibble the glowcap. You feel light. Lighter. You float gently up through the canopy, over the clouds, and are last seen waving at a very confused eagle.", g: "You nibble the glowcap and start to float away! Oops — let's not do that." });
    if (v) { await this.text(v); return; }
    await this.G.n(this.tone({ c: `You wave the ${this.itemName(item)} at yourself. Nothing happens, except mild embarrassment.`, g: `You can't think of a way to use the ${this.itemName(item)} on yourself.` }));
  }
  quip(kind, item, target) {
    const pool = FALLBACK[kind]; const t = this.tone(pool[Math.floor(this.rand() * pool.length)]);
    return t.replace('{item}', item ? this.itemName(item) : '').replace('{target}', target ? String(target).toLowerCase() : 'that');
  }
  async dialog(npc) {
    const D = DIALOGS[npc]; if (!D) return;
    const H = this.host;
    H.dialogStart?.(npc);
    try {
      if (D.greet) await D.greet(this.G);
      for (let guard = 0; guard < 60; guard++) {
        const opts = D.opts.filter((o) => (!o.if || o.if(this.s)) && !(o.once && this.s.used[npc + '.' + o.id]));
        const list = opts.map((o) => ({ id: o.id, t: this.tone(o.t) })).concat([{ id: 'bye', t: 'Goodbye.' }]);
        const pick = await H.choose(list, { npc });
        if (pick === 'bye' || !opts.find((o) => o.id === pick)) {
          await this.G.h(this.rand() < 0.5 ? 'Goodbye.' : 'Bye for now.');
          if (D.bye) await this.G.say(npc === 'oak' ? 'oak' : npc, D.bye);
          break;
        }
        const o = opts.find((x) => x.id === pick);
        if (o.once) this.s.used[npc + '.' + o.id] = true;
        if (!o.silent) await this.G.h(this.tone(o.t));
        const r = await o.run(this.G);
        if (o.end || r === 'end') break;
      }
    } finally { H.dialogEnd?.(npc); }
  }

  // ------------------------------------------------------------ hints (3 tiers) + proactive nudges
  goal() { return GOALS.find((g) => g.avail(this.s) && !g.done(this.s)) || null; }
  hintDelay(tier) { const d = this.s.difficulty; if (d === 'easy') return 0; if (d === 'hard') return tier === 1 ? 45 : 90; return tier === 1 ? 12 : 25; }
  hint() { // returns {text, tier, more, wait}
    const g = this.goal(); if (!g) return { text: this.s.ended ? 'The story is complete. Well done!' : "You're doing splendidly. Explore, look at things, and talk to everyone.", tier: 0, more: false, wait: 0 };
    const rec = this.s.hints[g.id] ||= { tier: 0, t: -1e9 };
    if (rec.tier === 0) { rec.tier = 1; rec.t = this.s.time; this.s.hintsUsed++; }
    return { id: g.id, text: g.h[rec.tier - 1], tier: rec.tier, more: rec.tier < 3, wait: Math.max(0, this.hintDelay(rec.tier) - (this.s.time - rec.t)) };
  }
  moreHint() {
    const g = this.goal(); if (!g) return this.hint();
    const rec = this.s.hints[g.id] ||= { tier: 0, t: -1e9 };
    const wait = this.hintDelay(rec.tier) - (this.s.time - rec.t);
    if (rec.tier > 0 && rec.tier < 3 && wait <= 0) { rec.tier++; rec.t = this.s.time; this.s.hintsUsed++; }
    return this.hint();
  }
  tick(dt, hintFreq) {
    this.s.time += dt;
    const idle = this.s.time - this.s.lastProgress, lim = hintFreq === 'often' ? 120 : hintFreq === 'sometimes' ? 300 : Infinity;
    if (!this.busy && idle > lim) {
      const g = this.goal();
      if (g && !this.s.nudged[g.id]) { this.s.nudged[g.id] = true; this.s.lastProgress = this.s.time; return g.h[0]; }
    }
    return null;
  }
  score() { return Object.keys(this.s.deeds).length * 10; }
  summary() { return { deeds: Object.keys(DEEDS).map((k) => ({ k, label: DEEDS[k], done: !!this.s.deeds[k] })), score: this.score(), max: Object.keys(DEEDS).length * 10, time: this.s.time, hints: this.s.hintsUsed }; }
  serialize() { return clone(this.s); }
  load(st) { this.s = Object.assign(newState(), clone(st)); }
  castName(who) { return CAST[who]?.name || who; }
}
