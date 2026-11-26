// Emberwake — DOM UI: dialogue with pixel portraits, choices, chapter cards, objective hints, prompts/emotes,
// the party menu (items / skills / equip / status / bestiary / save / options), shops, title, credits, game over.
// Every list is keyboard/gamepad navigable (a focus stack) and directly tappable.
import { CAST } from './story.js';
import { HEROES, SKILLS, ITEMS, EQUIP, SHOPS, TYPES, ENEMIES, DIFFICULTY } from './data.js';
import { heroStats, skillsFor, itemName, priceOf, count, equip, unequip, canEquip, equipDelta, useItemField, buy, sell, isEquip, fmtTime, saveSummary } from './rules.js';
import { xpToNext } from './data.js';
import { paintPortrait } from './pixel.js';
import { I } from './input.js';
import { MAPS } from './maps.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
export const ICON = {
  blade: '<svg viewBox="0 0 16 16"><path d="M13 1l2 2-8 8-2-2zM4 10l2 2-2 1-2 2-1-1 2-2z" fill="currentColor"/></svg>',
  blunt: '<svg viewBox="0 0 16 16"><path d="M3 2h7v4H3zM6 6h2v9H6z" fill="currentColor"/></svg>',
  pierce: '<svg viewBox="0 0 16 16"><path d="M14 1l-1 5-2-2zM12 3l1 1-10 10-1-1z" fill="currentColor"/></svg>',
  fire: '<svg viewBox="0 0 16 16"><path d="M8 1c1 3 5 5 5 9a5 5 0 01-10 0c0-2 1-3 2-4 0 2 1 3 2 3-1-3 0-6 1-8z" fill="currentColor"/></svg>',
  frost: '<svg viewBox="0 0 16 16"><path d="M7 0h2v16H7zM0 7h16v2H0zM2 3l1-1 11 11-1 1zM13 2l1 1L3 14l-1-1z" fill="currentColor"/></svg>',
  bolt: '<svg viewBox="0 0 16 16"><path d="M9 0L3 9h4l-1 7 7-10H9z" fill="currentColor"/></svg>',
  unknown: '<svg viewBox="0 0 16 16"><text x="8" y="13" text-anchor="middle" font-size="13" font-weight="700" fill="currentColor">?</text></svg>',
};
export const typeIcon = (t) => `<i class="ty ty-${t}" title="${TYPES[t]?.name || '?'}">${ICON[t] || ICON.unknown}</i>`;
const portraitCache = {};
export function portrait(who) { if (!CAST[who]) return ''; if (!portraitCache[who]) portraitCache[who] = paintPortrait(CAST[who].look).toDataURL(); return portraitCache[who]; }

export class UI {
  constructor(app) {
    this.app = app; this.stack = []; this.dlgOpen = false; this.speedMs = { slow: 34, normal: 18, fast: 7, instant: 0 };
    document.body.insertAdjacentHTML('beforeend', `
      <div id="hud" class="ew"><div id="area"><span class="k"></span><span class="n"></span></div><div id="objective"></div></div>
      <div id="prompt" class="ew"><b class="key"></b><span></span></div>
      <div id="emotes"></div>
      <div id="dlg" class="ew panel hidden"><div class="pt"><img alt=""></div><div class="body"><div class="name"></div><div class="text"></div></div><div class="next">▼</div></div>
      <div id="choices" class="ew panel hidden"></div>
      <div id="chapter" class="ew hidden"><div class="k"></div><div class="t"></div><div class="rule"></div></div>
      <div id="got" class="ew"></div>
      <div id="overlay" class="ew hidden"></div>
      <div id="wipe"></div>`);
    this.dlg = $('#dlg'); this.choicesEl = $('#choices'); this.overlay = $('#overlay');
    this.dlg.addEventListener('pointerdown', (e) => { e.preventDefault(); this.advance(); });
    this.emotes = [];
  }
  blocking() { return this.dlgOpen || this.stack.length > 0 || this.cardOpen; }
  keyGlyph() { return I.lastDevice === 'pad' ? 'Ⓐ' : I.touch ? 'A' : 'Enter'; }

  // ------------------------------------------------------------------ per-frame
  update(dt) {
    const F = this.app.field;
    for (const em of this.emotes) { em.t -= dt; const e = em.ent; if (!e || em.t <= 0) { em.el.remove(); continue; } const p = F.screenOf(e.x, (e.y || 0) + (e.actor?.h || 1.6) + 0.3, e.z); em.el.style.transform = `translate(${p.x}px,${p.y - (1 - Math.min(1, (1.4 - em.t) * 6)) * 10}px)`; }
    this.emotes = this.emotes.filter((em) => em.t > 0);
    if (this.typing) { this.typeAcc += dt * 1000; const ms = this.speedMs[this.app.opts.textSpeed] ?? 18; const n = ms ? Math.floor(this.typeAcc / ms) : 1e9; if (n > this.shown) { this.shown = Math.min(this.full.length, n); this.textEl.textContent = this.full.slice(0, this.shown); if (this.shown % 3 === 0) this.app.sfx.blip?.(this.who); if (this.shown >= this.full.length) this.typing = false; } }
    this.dlg.classList.toggle('done', !this.typing);
  }
  // nav for the active panel / dialog (called by main once per frame)
  input() {
    if (this.dlgOpen && !this.stack.length) { if (I.take('confirm') || I.take('cancel')) this.advance(); return true; }
    const P = this.stack[this.stack.length - 1]; if (!P) return false;
    if (I.take('up')) this.move(P, -1, 0); if (I.take('down')) this.move(P, 1, 0);
    if (I.take('left')) this.move(P, 0, -1); if (I.take('right')) this.move(P, 0, 1);
    if (I.take('confirm')) { const it = this.items(P)[P.idx]; if (it && !it.disabled) { this.app.sfx.confirm?.(); it.click(); } else this.app.sfx.error?.(); }
    if (I.take('cancel') || I.take('pause') || (P.menuKey && I.take('menu'))) { if (P.onCancel !== false) { this.app.sfx.cancel?.(); (P.onCancel || (() => this.pop()))(); } }
    if (P.onBoost) { if (I.take('boostUp')) P.onBoost(1); if (I.take('boostDown')) P.onBoost(-1); }
    I.take('menu');
    return true;
  }
  items(P) { return [...P.el.querySelectorAll(P.sel || '.mi')].filter((x) => x.offsetParent !== null); }
  move(P, dy, dx) {
    const L = this.items(P); if (!L.length) return;
    if (dx && P.onLR) { P.onLR(dx); return; }
    if (dx && !P.grid) return;
    const step = P.grid && dx ? dx : dy * (P.grid || 1);
    P.idx = Math.max(0, Math.min(L.length - 1, P.idx + step)); this.focus(P); this.app.sfx.cursor?.();
  }
  focus(P) { const L = this.items(P); L.forEach((x, i) => x.classList.toggle('sel', i === P.idx)); const it = L[P.idx]; if (it) { it.scrollIntoView?.({ block: 'nearest' }); P.onFocus?.(it, P.idx); } }
  push(P) { P.idx = P.idx ?? 0; this.stack.push(P); this.bind(P); this.focus(P); return P; }
  bind(P) { this.items(P).forEach((x, i) => { x.addEventListener('pointerenter', () => { if (P.idx !== i && !I.touch) { P.idx = i; this.focus(P); } }); }); }
  refresh(P) { this.bind(P); P.idx = Math.min(P.idx, Math.max(0, this.items(P).length - 1)); this.focus(P); }
  pop() { const P = this.stack.pop(); P?.onClose?.(); return P; }

  // ------------------------------------------------------------------ dialogue
  say(who, text) {
    return new Promise((res) => {
      const c = CAST[who]; const name = who === '???' ? '???' : c ? (who === 'morrow' ? '???' : c.name) : '';
      this.dlg.classList.remove('hidden'); this.dlg.classList.toggle('narr', !name); this.dlgOpen = true;
      $('.name', this.dlg).textContent = name;
      const img = $('.pt img', this.dlg); const pu = name && c ? portrait(who) : ''; img.src = pu || ''; this.dlg.classList.toggle('noport', !pu);
      this.textEl = $('.text', this.dlg); this.full = this.app.fmt(text); this.shown = 0; this.typeAcc = 0; this.typing = true; this.textEl.textContent = ''; this.who = who;
      this.resolveDlg = res;
      this.app.host_log?.(who, text);
    });
  }
  advance() {
    if (!this.dlgOpen) return;
    if (this.typing) { this.typing = false; this.shown = this.full.length; this.textEl.textContent = this.full; return; }
    this.app.sfx.cursor?.();
    const r = this.resolveDlg; this.resolveDlg = null; this.dlgOpen = false;
    setTimeout(() => { if (!this.dlgOpen) this.dlg.classList.add('hidden'); }, 60);
    r?.();
  }
  closeDialog() { this.dlgOpen = false; this.dlg.classList.add('hidden'); const r = this.resolveDlg; this.resolveDlg = null; r?.(); }
  choose(prompt, opts) {
    return new Promise((res) => {
      const el = this.choicesEl; el.innerHTML = (prompt ? `<div class="q">${esc(prompt)}</div>` : '') + opts.map((o, i) => `<button class="mi" data-i="${i}">${esc(o)}</button>`).join('');
      el.classList.remove('hidden');
      const done = (i) => { el.classList.add('hidden'); this.pop(); res(i); };
      el.querySelectorAll('.mi').forEach((b) => (b.onclick = () => done(+b.dataset.i)));
      this.push({ el, onCancel: () => done(opts.length - 1) });
    });
  }
  title(k, t) {
    return new Promise((res) => {
      const el = $('#chapter'); $('.k', el).textContent = k; $('.t', el).textContent = t; el.classList.remove('hidden', 'out'); this.cardOpen = true; this.app.sfx.chapter?.();
      let done = false; const fin = () => { if (done) return; done = true; el.classList.add('out'); setTimeout(() => { el.classList.add('hidden'); this.cardOpen = false; res(); }, 600); };
      setTimeout(fin, this.app.fast ? 10 : 2800); el.onclick = fin;
    });
  }
  hint(t) { const o = $('#objective'); o.innerHTML = `<b>◆</b> ${esc(t)}`; o.classList.remove('show'); void o.offsetWidth; o.classList.add('show'); this.app.s.flags.hint = t; clearTimeout(this._ht); this._ht = setTimeout(() => o.classList.remove('show'), 9000); }
  area(map) { const M = MAPS[map]; if (!M || M.kind === 'stage') return; const a = $('#area'); $('.k', a).textContent = { town: 'Town', field: 'The Hearthmere', dungeon: 'Dungeon' }[M.kind] || ''; $('.n', a).textContent = M.name; a.classList.remove('show'); void a.offsetWidth; a.classList.add('show'); }
  got(id, n) {
    const el = document.createElement('div'); el.className = 'gotrow'; const name = id === 'gold' ? `${n} gold` : `${itemName(id)}${n > 1 ? ' ×' + n : ''}`;
    el.innerHTML = `<span class="gi ${id === 'gold' ? 'g' : isEquip(id) ? 'e' : ITEMS[id]?.kind === 'key' ? 'k' : 'i'}"></span>Obtained <b>${esc(name)}</b>`; $('#got').appendChild(el);
    setTimeout(() => el.classList.add('out'), 2200); setTimeout(() => el.remove(), 2700);
  }
  prompt(pos, label) {
    const el = $('#prompt'); if (!pos || !pos.on) { el.classList.remove('show'); return; }
    el.classList.add('show'); el.style.transform = `translate(${Math.round(pos.x)}px,${Math.round(pos.y)}px)`; $('span', el).textContent = label; $('.key', el).textContent = this.keyGlyph();
    if (I.touch) el.onclick = () => I.press('confirm');
  }
  emote(ent, kind) { const el = document.createElement('div'); el.className = 'emote'; el.textContent = kind; $('#emotes').appendChild(el); this.emotes.push({ el, ent, t: 1.4 }); }

  // ------------------------------------------------------------------ overlay panels
  openOverlay(html, cls = '') { const o = this.overlay; o.className = 'ew ' + cls; o.innerHTML = html; return o; }
  closeOverlay() { this.overlay.className = 'ew hidden'; this.overlay.innerHTML = ''; }

  // ------------------------------------------------------------------ party menu
  openMenu() {
    const A = this.app, s = A.s;
    return new Promise((res) => {
      const tabs = [['items', 'Items'], ['skills', 'Skills'], ['equip', 'Equip'], ['status', 'Status'], ['bestiary', 'Bestiary'], ['save', 'Save'], ['load', 'Load'], ['options', 'Options'], ['title', 'Quit to Title']];
      const o = this.openOverlay(`<div class="menu panel"><div class="tabs">${tabs.map(([k, l]) => `<button class="mi tab" data-k="${k}">${l}</button>`).join('')}</div><div class="content"></div>
        <div class="mfoot"><span>◈ ${s.gold} gold</span><span>⧗ ${fmtTime(s.time)}</span><span>${esc(MAPS[s.map].name)}</span><span class="obj">${esc(s.flags.hint || '')}</span></div></div>`, 'menuwrap');
      const content = $('.content', o);
      const P = this.push({ el: $('.tabs', o), onCancel: () => { this.pop(); this.closeOverlay(); res(); }, menuKey: true, onLR: (d) => { if (d > 0) $('.tabs .sel', o)?.click(); } });
      const partyStrip = () => `<div class="party">${s.party.map((id) => this.heroCard(id)).join('')}</div>`;
      const show = (k) => {
        if (k === 'title') { this.choose('Return to the title screen? Unsaved progress since the last autosave will be lost.', ['Quit to title', 'Cancel']).then((i) => { if (i === 0) { this.pop(); this.closeOverlay(); res('title'); A.toTitle(); } }); return; }
        content.innerHTML = '';
        if (k === 'items') this.itemsTab(content, partyStrip);
        else if (k === 'skills') this.skillsTab(content);
        else if (k === 'equip') this.equipTab(content);
        else if (k === 'status') content.innerHTML = partyStrip() + this.statusTable();
        else if (k === 'bestiary') content.innerHTML = this.bestiary();
        else if (k === 'save' || k === 'load') this.slotsTab(content, k);
        else if (k === 'options') this.optionsTab(content);
      };
      $('.tabs', o).querySelectorAll('.tab').forEach((b) => { b.onclick = () => { $('.tabs', o).querySelectorAll('.tab').forEach((x) => x.classList.toggle('on', x === b)); show(b.dataset.k); if (!['status', 'bestiary', 'title'].includes(b.dataset.k)) this.enterContent(content); }; });
      P.onFocus = (it) => { if (!['title'].includes(it.dataset.k)) { $('.tabs', o).querySelectorAll('.tab').forEach((x) => x.classList.toggle('on', x === it)); show(it.dataset.k); } };
      this.focus(P);
    });
  }
  enterContent(content) { const items = content.querySelectorAll('.mi'); if (!items.length) return; this.push({ el: content, onCancel: () => this.pop(), onLR: (d) => { if (d < 0) this.pop(); } }); }
  heroCard(id) {
    const s = this.app.s, h = s.heroes[id], st = heroStats(s, id), H = HEROES[id];
    return `<div class="hc"><img src="${portrait(id)}" alt=""><div><div class="hn">${H.name} <small>Lv ${h.lv} · ${H.role}</small></div>
      <div class="bar hp"><i style="width:${(h.hp / st.hp) * 100}%"></i><span>HP ${h.hp}/${st.hp}</span></div><div class="bar mp"><i style="width:${(h.mp / st.mp) * 100}%"></i><span>MP ${h.mp}/${st.mp}</span></div>
      <div class="bar xp"><i style="width:${(h.xp / xpToNext(h.lv)) * 100}%"></i><span>Next ${xpToNext(h.lv) - h.xp}</span></div></div></div>`;
  }
  itemsTab(content, partyStrip) {
    const s = this.app.s;
    const render = () => {
      const list = Object.keys(s.inv).filter((k) => ITEMS[k]).sort((a, b) => (ITEMS[a].kind === 'key') - (ITEMS[b].kind === 'key'));
      content.innerHTML = partyStrip() + `<div class="list">${list.map((k) => `<button class="mi row" data-k="${k}"><span>${esc(ITEMS[k].name)}</span><span class="n">×${s.inv[k]}</span></button>`).join('') || '<div class="empty">Your pack is empty.</div>'}</div><div class="desc"></div>`;
      content.querySelectorAll('.mi').forEach((b) => (b.onclick = async () => {
        const it = ITEMS[b.dataset.k]; if (it.kind === 'key' || it.kind === 'bomb') { this.app.sfx.error?.(); return; }
        let tgt = s.party[0];
        if (it.kind !== 'healall') { const i = await this.choose(`Use ${it.name} on…`, [...s.party.map((id) => HEROES[id].name), 'Cancel']); if (i >= s.party.length) return; tgt = s.party[i]; }
        const r = useItemField(s, b.dataset.k, tgt); this.app.toast(r.msg); if (r.ok) this.app.sfx.heal?.(); else this.app.sfx.error?.();
        const P = this.stack[this.stack.length - 1]; render(); if (P?.el === content) this.refresh(P);
      }));
    };
    render();
    content.addEventListener('focusin', () => {});
    this._descHook(content, (k) => ITEMS[k]?.desc || '');
  }
  _descHook(content, fn) { const obs = () => { const sel = content.querySelector('.mi.sel'); const d = content.querySelector('.desc'); if (d) d.textContent = sel ? fn(sel.dataset.k) : ''; }; content._obs?.disconnect(); const mo = new MutationObserver(obs); mo.observe(content, { attributes: true, subtree: true, attributeFilter: ['class'] }); content._obs = mo; }
  skillsTab(content) {
    const s = this.app.s;
    content.innerHTML = `<div class="skillcols">${s.party.map((id) => `<div class="sc"><div class="hn"><img src="${portrait(id)}" alt="">${HEROES[id].name}</div>${HEROES[id].skills.map(([lv, k]) => { const sk = SKILLS[k], have = s.heroes[id].lv >= lv; return `<button class="mi row ${have ? '' : 'locked'}" data-k="${k}"><span>${sk.type in TYPES ? typeIcon(sk.type) : '<i class="ty ty-sup">✦</i>'} ${have ? esc(sk.name) : `Lv ${lv} — ???`}</span><span class="n">${have ? sk.mp + ' MP' : ''}</span></button>`; }).join('')}</div>`).join('')}</div><div class="desc"></div>`;
    this._descHook(content, (k) => { const sk = SKILLS[k]; return sk ? sk.desc : ''; });
    content.querySelectorAll('.mi').forEach((b) => (b.onclick = () => this.app.sfx.cursor?.()));
  }
  equipTab(content) {
    const s = this.app.s;
    const render = () => {
      content.innerHTML = `<div class="eqcols">${s.party.map((id) => { const h = s.heroes[id]; return `<div class="sc"><div class="hn"><img src="${portrait(id)}" alt="">${HEROES[id].name}</div>${['weapon', 'armor', 'charm'].map((sl) => `<button class="mi row" data-h="${id}" data-s="${sl}"><span><small>${sl}</small> ${h.eq[sl] ? esc(EQUIP[h.eq[sl]].name) : '—'}</span></button>`).join('')}<div class="stats">${this.statLine(heroStats(s, id))}</div></div>`; }).join('')}</div><div class="desc">Choose a slot to change gear. ◆ = better.</div>`;
      content.querySelectorAll('.mi').forEach((b) => (b.onclick = async () => {
        const hid = b.dataset.h, sl = b.dataset.s;
        const opts = Object.keys(s.inv).filter((k) => EQUIP[k] && EQUIP[k].slot === sl && canEquip(hid, k));
        const labels = opts.map((k) => { const d = equipDelta(s, hid, k); return `${EQUIP[k].name}  ${Object.entries(d).map(([st, v]) => `${st.toUpperCase()}${v > 0 ? '+' : ''}${v}`).join(' ')}`; });
        if (sl !== 'weapon' && s.heroes[hid].eq[sl]) labels.push('Remove');
        labels.push('Cancel');
        if (labels.length === 1) { this.app.toast('Nothing to equip there.'); return; }
        const i = await this.choose(`${HEROES[hid].name}: ${sl}`, labels);
        if (i < opts.length) { equip(s, hid, opts[i]); this.app.sfx.equip?.(); } else if (labels[i] === 'Remove') unequip(s, hid, sl);
        const P = this.stack[this.stack.length - 1]; render(); if (P?.el === content) this.refresh(P);
      }));
    };
    render();
  }
  statLine(st) { return ['atk', 'mag', 'def', 'res', 'spd'].map((k) => `<span><small>${k.toUpperCase()}</small>${st[k]}</span>`).join(''); }
  statusTable() {
    const s = this.app.s;
    return `<div class="status">${s.party.map((id) => { const st = heroStats(s, id), H = HEROES[id]; return `<div class="sc"><div class="hn">${H.full}</div><div class="role">${H.title} · ${H.role}</div><p>${H.blurb}</p><div class="stats">${this.statLine(st)}</div><div class="types">Weapon ${typeIcon(H.weapon)}  Skills ${[...new Set(H.skills.map(([, k]) => SKILLS[k].type).filter((t) => TYPES[t]))].map(typeIcon).join('')}</div></div>`; }).join('')}</div>`;
  }
  bestiary() {
    const s = this.app.s; const ids = Object.keys(ENEMIES).filter((k) => s.bestiary[k]?.seen);
    return `<div class="best">${ids.map((k) => { const E = ENEMIES[k], b = s.bestiary[k]; return `<div class="be"><b>${E.name}</b><span>${E.weak.map((t) => (b.weak.includes(t) ? typeIcon(t) : typeIcon('unknown'))).join('')}</span><small>Shield ${E.shield} · defeated ${b.kills}</small></div>`; }).join('') || '<div class="empty">No creatures met yet.</div>'}</div><div class="desc">Weaknesses you discover stay recorded here — and show in battle.</div>`;
  }
  slotsTab(content, mode) {
    const A = this.app;
    const render = () => {
      const rows = ['auto', 1, 2, 3].map((k) => { const sum = saveSummary(A.readSlot(k)); return `<button class="mi row slot" data-k="${k}" ${mode === 'save' && k === 'auto' ? 'disabled' : ''}><span><b>${k === 'auto' ? 'Autosave' : 'Slot ' + k}</b> ${sum ? `${esc(MAPS[sum.map]?.name || '')} · Lv ${sum.lv} · ${sum.party.map((p) => HEROES[p].name).join(', ')}` : '<i>empty</i>'}</span><span class="n">${sum ? fmtTime(sum.time) : ''}</span></button>`; }).join('');
      content.innerHTML = `<div class="list">${rows}</div><div class="desc">${mode === 'save' ? 'Save your journey to a slot. The game also autosaves on every map change.' : 'Load a saved journey.'}</div>`;
      content.querySelectorAll('.mi').forEach((b) => (b.onclick = async () => {
        const k = b.dataset.k;
        if (mode === 'save') { if (k === 'auto') return; A.writeSlot(+k); A.toast(`Saved to slot ${k}.`); A.sfx.save?.(); const P = this.stack[this.stack.length - 1]; render(); if (P?.el === content) this.refresh(P); }
        else { if (!A.readSlot(k)) { A.sfx.error?.(); return; } while (this.stack.length) this.pop(); this.closeOverlay(); A.loadSlot(k); }
      }));
    };
    render();
  }
  optionsTab(content) {
    const A = this.app, o = A.opts;
    const rows = [['battleSpeed', 'Battle speed', [['1', '1×'], ['1.5', '1.5×'], ['2', '2×']]], ['timing', 'Timed presses', [['normal', 'Normal'], ['wide', 'Wide window'], ['auto', 'Automatic']]], ['textSpeed', 'Text speed', [['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast'], ['instant', 'Instant']]], ['autoRun', 'Always run', [['false', 'Off'], ['true', 'On']]], ['difficulty', 'Difficulty', [['easy', 'Story'], ['normal', 'Normal'], ['hard', 'Hard']]]];
    const render = () => {
      content.innerHTML = `<div class="list opts">${rows.map(([k, l, ch]) => `<div class="optrow"><span>${l}</span><span class="ch">${ch.map(([v, t]) => `<button class="mi chip ${String(k === 'difficulty' ? A.s.difficulty : o[k]) === v ? 'on' : ''}" data-k="${k}" data-v="${v}">${t}</button>`).join('')}</span></div>`).join('')}<button class="mi row" data-k="kit"><span>Audio, shake, flashes, colourblind… ⚙</span></button></div><div class="desc">Difficulty can be changed any time. Story mode widens timed-press windows and softens enemies.</div>`;
      content.querySelectorAll('.mi').forEach((b) => (b.onclick = () => {
        if (b.dataset.k === 'kit') { document.getElementById('sd-gear')?.click(); return; }
        const k = b.dataset.k, v = b.dataset.v;
        if (k === 'difficulty') A.s.difficulty = v; else o[k] = v === 'true' ? true : v === 'false' ? false : k === 'battleSpeed' ? +v : v;
        A.saveOpts(); const P = this.stack[this.stack.length - 1]; const idx = P?.idx; render(); if (P?.el === content) { P.idx = idx; this.refresh(P); }
      }));
    };
    render();
  }

  // ------------------------------------------------------------------ shop
  openShop(id) {
    const A = this.app, s = A.s, shop = SHOPS[id];
    return new Promise((res) => {
      const o = this.openOverlay(`<div class="shop panel"><div class="sh"><b>${esc(shop.name)}</b><span class="gold"></span></div><div class="modes"><button class="mi mode on" data-m="buy">Buy</button><button class="mi mode" data-m="sell">Sell</button><button class="mi mode" data-m="leave">Leave</button></div><div class="list"></div><div class="desc"></div></div>`, 'shopwrap');
      const list = $('.list', o), desc = $('.desc', o), gold = $('.gold', o);
      let mode = 'buy';
      const info = (k) => { if (EQUIP[k]) { const E = EQUIP[k]; const who = E.who ? [E.who] : s.party; return `${['atk', 'mag', 'def', 'res', 'hp', 'mp', 'spd'].filter((x) => E[x]).map((x) => `${x.toUpperCase()} +${E[x]}`).join('  ')}  ·  ${who.filter((h) => s.party.includes(h)).map((h) => { const d = equipDelta(s, h, k); const sum = Object.values(d).reduce((a, b) => a + b, 0); return `${HEROES[h].name} ${sum > 0 ? '◆' : sum < 0 ? '▽' : '='}`; }).join('  ') || 'for ' + HEROES[E.who].name}${count(s, k) ? `  ·  owned ${count(s, k)}` : ''}`; } return `${ITEMS[k].desc}  ·  owned ${count(s, k)}`; };
      const render = () => {
        gold.textContent = `${s.gold} gold`;
        const keys = mode === 'buy' ? shop.stock : Object.keys(s.inv).filter((k) => (ITEMS[k] && ITEMS[k].kind !== 'key' && ITEMS[k].price) || (EQUIP[k] && EQUIP[k].price));
        list.innerHTML = keys.map((k) => `<button class="mi row ${mode === 'buy' && priceOf(k) > s.gold ? 'dim' : ''}" data-k="${k}"><span>${EQUIP[k] ? '<i class="eqi">⚔</i>' : ''}${esc(itemName(k))}</span><span class="n">${mode === 'buy' ? priceOf(k) : Math.floor(priceOf(k) / 2) + ' ×' + count(s, k)}</span></button>`).join('') || '<div class="empty">Nothing to sell.</div>';
        list.querySelectorAll('.mi').forEach((b) => (b.onclick = () => { const r = mode === 'buy' ? buy(s, id, b.dataset.k, 1) : sell(s, b.dataset.k, 1); A.toast(r.msg); if (r.ok) A.sfx.coin?.(); else A.sfx.error?.(); const P = this.stack[this.stack.length - 1]; render(); if (P?.el === list) this.refresh(P); }));
      };
      this._descHook(list, () => ''); new MutationObserver(() => { const sel = list.querySelector('.mi.sel'); desc.textContent = sel ? info(sel.dataset.k) : ''; }).observe(list, { attributes: true, subtree: true, attributeFilter: ['class'] });
      const close = () => { while (this.stack.length && this.stack[this.stack.length - 1] !== M) this.pop(); this.pop(); this.closeOverlay(); A.autosave(); res(); };
      const M = this.push({ el: $('.modes', o), grid: 1, onCancel: close, onLR: (d) => { const L = this.items(M); M.idx = Math.max(0, Math.min(L.length - 1, M.idx + d)); this.focus(M); } });
      $('.modes', o).querySelectorAll('.mode').forEach((b) => (b.onclick = () => { if (b.dataset.m === 'leave') return close(); mode = b.dataset.m; $('.modes', o).querySelectorAll('.mode').forEach((x) => x.classList.toggle('on', x === b)); render(); if (list.querySelector('.mi')) this.push({ el: list, onCancel: () => this.pop() }); }));
      render();
    });
  }

  // ------------------------------------------------------------------ battle end / game over / credits
  gameOver() {
    return new Promise((res) => {
      const o = this.openOverlay(`<div class="go panel"><h2>The light gutters…</h2><p>Your party has fallen. Nothing is lost — try the battle again with what you've learned, or pick up from a save.</p><div class="col"><button class="mi row" data-a="retry">Retry the battle</button><button class="mi row" data-a="easy">Retry on Story difficulty</button><button class="mi row" data-a="load">Load last autosave</button><button class="mi row" data-a="title">Quit to title</button></div></div>`, 'gowrap');
      const P = this.push({ el: o, onCancel: false });
      o.querySelectorAll('.mi').forEach((b) => (b.onclick = () => { this.pop(); this.closeOverlay(); res(b.dataset.a); }));
      this.focus(P);
    });
  }
  credits(stats) {
    return new Promise((res) => {
      const o = this.openOverlay(`<div class="credits"><div class="roll"><h1>Emberwake</h1><p class="sub">A fire's meant to be shared.</p>
        <h3>Rook · Bram · Ines</h3><p>and Odile, Morrow, Teodor, Captain Hask, Marta, Pell, Harrow, Lark, Tobin, Whiskerwick the cat, and every hearth in the Hearthmere.</p>
        <h3>Your Wake</h3><p>Time ${fmtTime(stats.time)} · Battles won ${stats.wins} · Shields broken ${stats.breaks} · Great presses ${stats.greats}</p><p>Party level ${stats.lv} · Difficulty ${DIFFICULTY[stats.difficulty].label}</p>
        <h3>Made for Super Dreams</h3><p>An original story and world. All art, sprites and sound are generated in code at runtime.</p><p class="fin">— Fin —</p></div><button class="mi primary" id="credDone">Return to title</button></div>`, 'credwrap');
      const P = this.push({ el: o, onCancel: false }); this.focus(P);
      $('#credDone').onclick = () => { this.pop(); this.closeOverlay(); res(); };
    });
  }
  wipe(on, ms = 450) { const w = $('#wipe'); w.style.transition = `opacity ${ms}ms`; w.classList.toggle('on', on); return new Promise((r) => setTimeout(r, this.app.fast ? 0 : ms)); }
  battleWipe() { const w = $('#wipe'); w.classList.add('battle'); w.classList.add('on'); return new Promise((r) => setTimeout(() => r(), this.app.fast ? 0 : 520)); }
  clearBattleWipe() { const w = $('#wipe'); w.classList.remove('on'); setTimeout(() => w.classList.remove('battle'), 500); }
}
