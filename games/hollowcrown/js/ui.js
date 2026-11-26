// The Hollow Crown — DOM UI: speech & narration (typewriter, click/auto advance), dialog choices, inventory bar,
// smart cursor, toasts, chapter/death/end cards, panels. Subtitles are always on: every line is shown as text.
import { itemIcon, cursorIcon } from './icons.js';
import { CAST } from './story.js';

const $ = (s) => document.querySelector(s);
const SPEEDS = { slow: 22, normal: 48, fast: 110, instant: 1e9 };

export class UI {
  constructor(o) {
    this.o = o; // { anchorOf(who), fmt(t), opts, onItem(id), onItemLook(id), itemName(id), state() }
    this.speech = $('#speech'); this.narrEl = $('#narr'); this.choicesEl = $('#choices'); this.inv = $('#invscroll');
    this.cursor = $('#cursor'); this.cIcon = this.cursor.querySelector('.cicon'); this.cLabel = this.cursor.querySelector('.clabel');
    this.adv = null; this.active = null; this.selected = null; this.auto = false;
    this.cursorCache = {};
    this.narrEl.addEventListener('pointerup', (e) => { e.stopPropagation(); this.advance(); });
    $('#rewindBtn').addEventListener('click', () => this._deathDone?.());
  }
  get opts() { return this.o.opts(); }
  // ------------------------------------------------------------ text
  showing() { return !!this.active; }
  advance() {
    const a = this.active; if (!a) return false;
    if (a.typing) { a.typing = false; a.el.querySelector('.tx').textContent = a.full; a.armAuto(); return true; }
    a.done(); return true;
  }
  async line(who, text) {
    text = this.o.fmt(text);
    if (this.auto) { this.o.log?.(who, text); return; }
    const narr = who === 'narrator';
    let el;
    if (narr) { el = this.narrEl; el.classList.remove('hidden'); el.querySelector('.ntext').innerHTML = '<span class="tx"></span>'; }
    else {
      el = document.createElement('div'); el.className = 'bubble';
      const c = CAST[who] || {}; el.style.color = c.color || '#fff';
      el.innerHTML = `<span class="who">${this.o.fmt(c.name || who)}</span><span class="tx"></span>`;
      this.speech.appendChild(el);
    }
    const tx = el.querySelector('.tx');
    const speed = SPEEDS[this.opts.textSpeed] || 48;
    const a = { el, full: text, typing: speed < 1e8, who };
    this.active = a; this.o.onSpeak?.(who, true, text.length / speed + 0.6);
    await new Promise((resolve) => {
      let timer = null;
      a.done = () => { clearTimeout(timer); resolve(); };
      a.armAuto = () => { clearTimeout(timer); if (this.opts.autoAdvance) timer = setTimeout(a.done, (1400 + text.length * 48) * ({ slow: 1.4, normal: 1, fast: 0.75, instant: 0.75 }[this.opts.textSpeed] || 1)); };
      if (!a.typing) { tx.textContent = text; a.armAuto(); return; }
      let i = 0, last = performance.now();
      const step = () => { // timer-driven so text never stalls on a slow frame
        if (!a.typing) return;
        const now = performance.now(); i += ((now - last) / 1000) * speed; last = now;
        const n = Math.min(text.length, Math.floor(i));
        tx.textContent = text.slice(0, n);
        if (n >= text.length) { a.typing = false; a.armAuto(); return; }
        setTimeout(step, 30);
      };
      setTimeout(step, 30);
      this.place();
    });
    this.o.onSpeak?.(who, false, 0);
    if (narr) el.classList.add('hidden'); else el.remove();
    this.active = null;
  }
  place() { // keep bubbles over heads, clamped to the viewport
    const a = this.active; if (!a || a.who === 'narrator') return;
    const p = this.o.anchorOf(a.who);
    const W = innerWidth, el = a.el, w = el.offsetWidth || 200, h = el.offsetHeight || 40;
    let x = p ? p.x : W / 2, y = p ? p.y : 90 + h;
    x = Math.max(w / 2 + 8, Math.min(W - w / 2 - 8, x)); y = Math.max(h + 60, Math.min(innerHeight - 120, y));
    el.style.left = x + 'px'; el.style.top = y + 'px';
  }
  // ------------------------------------------------------------ dialog choices
  choose(opts) {
    if (this.auto) return Promise.resolve(opts[0].id);
    return new Promise((resolve) => {
      const el = this.choicesEl; el.innerHTML = '';
      opts.forEach((o, i) => {
        const b = document.createElement('button'); b.className = 'choice' + (o.id === 'bye' ? ' bye' : '');
        b.innerHTML = `<b>${i + 1}</b>${this.o.fmt(o.t)}`;
        b.addEventListener('pointerup', (e) => { e.stopPropagation(); finish(o.id); });
        el.appendChild(b);
      });
      el.classList.remove('hidden'); $('#invbar').classList.add('dim');
      const key = (e) => { const n = parseInt(e.key, 10); if (n >= 1 && n <= opts.length) { e.preventDefault(); finish(opts[n - 1].id); } };
      addEventListener('keydown', key);
      const finish = (id) => { removeEventListener('keydown', key); el.classList.add('hidden'); $('#invbar').classList.remove('dim'); this.o.sfx?.('click'); resolve(id); };
      this._choiceKey = key;
      setTimeout(() => el.querySelector('.choice')?.focus({ preventScroll: true }), 30);
    });
  }
  // ------------------------------------------------------------ inventory
  renderInv(newId) {
    const s = this.o.state(); this.inv.innerHTML = '';
    if (this.selected && !s.inv.includes(this.selected)) this.selected = null;
    for (const id of s.inv) {
      const d = document.createElement('div'); d.className = 'slot' + (this.selected === id ? ' sel' : '') + (newId === id ? ' new' : '');
      d.dataset.id = id; d.title = this.o.itemName(id); d.setAttribute('role', 'button'); d.setAttribute('aria-label', this.o.itemName(id));
      d.appendChild(itemIcon(id, s));
      let lp = null, longp = false;
      d.addEventListener('pointerdown', (e) => { e.stopPropagation(); longp = false; if (e.pointerType !== 'mouse') lp = setTimeout(() => { longp = true; this.o.onItemLook(id); }, 480); });
      d.addEventListener('pointerup', (e) => { e.stopPropagation(); clearTimeout(lp); if (longp) return; if (e.button === 2) return; this.o.onItem(id); });
      d.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); this.o.onItemLook(id); });
      d.addEventListener('pointerenter', () => this.o.onItemHover?.(id));
      d.addEventListener('pointerleave', () => this.o.onItemHover?.(null));
      this.inv.appendChild(d);
    }
    if (!s.inv.length) { const d = document.createElement('div'); d.className = 'slot empty'; this.inv.appendChild(d); }
  }
  select(id) { this.selected = id; this.renderInv(); }
  // ------------------------------------------------------------ cursor
  setCursor(kind, label, dir) {
    const key = kind === 'item' ? 'item:' + this.selected : kind + (dir || '');
    if (this._ck !== key) {
      this._ck = key; this.cIcon.innerHTML = '';
      const c = kind === 'item' && this.selected ? itemIcon(this.selected, this.o.state()) : (this.cursorCache[key] ||= cursorIcon(kind, dir));
      this.cIcon.appendChild(c.cloneNode ? cloneCanvas(c) : c);
    }
    this.cLabel.textContent = label || '';
  }
  moveCursor(x, y) { this.cursor.style.transform = `translate(${x}px,${y}px)`; }
  // ------------------------------------------------------------ cards + toasts
  toast(html, ms = 2600) {
    const box = $('#toastArea'); const d = document.createElement('div'); d.className = 'htoast'; d.innerHTML = html; box.appendChild(d);
    setTimeout(() => { d.style.transition = 'opacity .4s'; d.style.opacity = '0'; setTimeout(() => d.remove(), 420); }, ms);
  }
  tutorial(text, ms = 6500) { if (this.auto) return; const t = $('#tut'); t.innerHTML = text; t.classList.remove('hidden'); clearTimeout(this._tt); this._tt = setTimeout(() => t.classList.add('hidden'), ms); }
  async chapterCard(c) {
    if (this.auto) return;
    const el = $('#chapterCard'); el.querySelector('.ck').textContent = c.title; el.querySelector('.ct').textContent = c.sub;
    el.classList.remove('hidden'); this.o.sfx?.('chime');
    await new Promise((r) => setTimeout(r, 2600)); el.classList.add('hidden'); await new Promise((r) => setTimeout(r, 500));
  }
  death(text) {
    if (this.auto) return Promise.resolve();
    const el = $('#deathCard'); el.querySelector('.dt').textContent = this.o.fmt(text); el.classList.remove('hidden');
    this.o.sfx?.('lose');
    return new Promise((r) => { this._deathDone = () => { el.classList.add('hidden'); this._deathDone = null; this.o.sfx?.('whoosh'); r(); }; setTimeout(() => $('#rewindBtn').focus(), 50); });
  }
  place2(name, chapter) { const p = $('#place'); $('#placeName').textContent = name; $('#placeChapter').textContent = chapter; p.classList.add('show'); clearTimeout(this._pt); this._pt = setTimeout(() => p.classList.remove('show'), 4200); }
  panel(html, onBind) { const p = $('#panel'); p.querySelector('.pbody').innerHTML = html; p.classList.remove('hidden'); onBind?.(p); this.panelOpen = true; }
  closePanel() { $('#panel').classList.add('hidden'); this.panelOpen = false; }
}
function cloneCanvas(c) { const d = document.createElement('canvas'); d.width = c.width; d.height = c.height; d.getContext('2d').drawImage(c, 0, 0); return d; }
