// Input: remappable keyboard + pointer-lock mouse, Gamepad API, and touch (twin sticks + buttons).
// Movement is never gated on pointer lock; losing lock while playing raises the pause overlay.
import { DEFAULT_KEYS } from './config.js';

export class Input {
  constructor(canvas, prefs) {
    this.canvas = canvas; this.prefs = prefs; this.keys = new Set(); this.pressed = new Set(); this.mouse = { l: false, r: false, dx: 0, dy: 0, wheel: 0 };
    this.locked = false; this.enabled = false; this.onLockLost = null; this.onPause = null; this.touch = null; this.lastDevice = 'kbm';
    this.state = { mx: 0, mz: 0, lookDX: 0, lookDY: 0, fire: false, ads: false, jumpPressed: false, jumpHeld: false, sprint: false, sprintPressed: false, crouchPressed: false, reloadPressed: false, interact: false, interactPressed: false, meleePressed: false, frag: false, smokePressed: false, leanL: false, leanR: false, primary: false, secondary: false, swapPressed: false, buildPressed: false, wall: false, floor: false, ramp: false, scores: false, wheel: 0, padLook: false };
    this.adsToggled = false; this.padSprint = false; this.prevPad = {};
    addEventListener('keydown', (e) => {
      if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'SELECT') return;
      if (this.capture) { e.preventDefault(); this.capture(e.code); this.capture = null; return; }
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code); this.lastDevice = 'kbm';
      if (this.enabled && ['Tab', 'Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
      if (this.enabled && (e.code === 'Escape' || e.code === this.prefs.keys.pause)) this.onPause?.();
    });
    addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    addEventListener('blur', () => { this.keys.clear(); this.mouse.l = this.mouse.r = false; });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return; this.lastDevice = 'kbm';
      if (!this.locked && !this.isTouch) { this.lock(); }
      if (e.button === 0) this.mouse.l = true; if (e.button === 2) { this.mouse.r = true; if (this.prefs.toggleAds) this.adsToggled = !this.adsToggled; }
    });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.mouse.l = false; if (e.button === 2) this.mouse.r = false; });
    addEventListener('contextmenu', (e) => { if (this.enabled) e.preventDefault(); });
    addEventListener('mousemove', (e) => { if (this.locked) { this.mouse.dx += e.movementX; this.mouse.dy += e.movementY; } });
    addEventListener('wheel', (e) => { if (this.enabled) this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked; this.locked = document.pointerLockElement === canvas;
      if (was && !this.locked && this.enabled) this.onLockLost?.();
    });
    this.isTouch = matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
  }
  lock() { try { const p = this.canvas.requestPointerLock?.({ unadjustedMovement: true }); p?.catch?.(() => { try { this.canvas.requestPointerLock(); } catch { /* not allowed */ } }); } catch { /* ignore */ } }
  unlock() { try { document.exitPointerLock?.(); } catch { /* ignore */ } }
  k(action) { const c = this.prefs.keys[action] || DEFAULT_KEYS[action]; return this.keys.has(c) || (action === 'crouch' && this.keys.has('ControlLeft')) || (action === 'forward' && this.keys.has('ArrowUp')) || (action === 'back' && this.keys.has('ArrowDown')) || (action === 'left' && this.keys.has('ArrowLeft')) || (action === 'right' && this.keys.has('ArrowRight')); }
  p(action) { const c = this.prefs.keys[action] || DEFAULT_KEYS[action]; return this.pressed.has(c) || (action === 'crouch' && this.pressed.has('ControlLeft')); }
  // Build the per-frame input state (call once per frame).
  poll() {
    const s = this.state, t = this.touch;
    s.mx = (this.k('right') ? 1 : 0) - (this.k('left') ? 1 : 0); s.mz = (this.k('forward') ? 1 : 0) - (this.k('back') ? 1 : 0);
    s.lookDX = this.mouse.dx; s.lookDY = this.mouse.dy; this.mouse.dx = 0; this.mouse.dy = 0; s.padLook = false;
    s.fire = this.mouse.l; s.ads = this.prefs.toggleAds ? this.adsToggled : this.mouse.r;
    s.jumpPressed = this.p('jump'); s.jumpHeld = this.k('jump'); s.sprint = this.k('sprint'); s.sprintPressed = this.p('sprint');
    s.crouchPressed = this.p('crouch'); s.reloadPressed = this.p('reload'); s.interact = this.k('interact'); s.interactPressed = this.p('interact');
    s.meleePressed = this.p('melee'); s.frag = this.k('frag'); s.smokePressed = this.p('smoke'); s.leanL = this.k('leanL'); s.leanR = this.k('leanR');
    s.primary = this.p('primary'); s.secondary = this.p('secondary'); s.swapPressed = this.p('swap'); s.buildPressed = this.p('build');
    s.wall = this.p('wall'); s.floor = this.p('floor'); s.ramp = this.p('ramp'); s.scores = this.k('scores');
    s.wheel = this.mouse.wheel; this.mouse.wheel = 0;
    this.pressed.clear();
    this.pollPad(s);
    if (t) t.apply(s);
    return s;
  }
  pollPad(s) {
    const pads = navigator.getGamepads?.() || []; const gp = [...pads].find((p) => p && p.connected); if (!gp) return;
    const b = (i) => !!gp.buttons[i]?.pressed, v = (i) => gp.buttons[i]?.value ?? 0, ax = (i) => { const a = gp.axes[i] || 0; return Math.abs(a) < 0.14 ? 0 : (a - Math.sign(a) * 0.14) / 0.86; };
    const P = this.prevPad, edge = (i) => b(i) && !P[i];
    const lx = ax(0), ly = ax(1), rx = ax(2), ry = ax(3);
    if (lx || ly || rx || ry || gp.buttons.some((x) => x.pressed)) this.lastDevice = 'pad';
    if (this.lastDevice !== 'pad') { for (let i = 0; i < 17; i++) P[i] = b(i); return; }
    s.mx = Math.abs(lx) > Math.abs(s.mx) ? lx : s.mx; s.mz = Math.abs(ly) > Math.abs(s.mz) ? -ly : s.mz;
    // response curve: precise near centre, fast at the rim
    const curve = (a) => Math.sign(a) * Math.pow(Math.abs(a), 1.8);
    s.padX = curve(rx); s.padY = curve(ry); s.padLook = true;
    s.fire = s.fire || v(7) > 0.3; s.ads = s.ads || v(6) > 0.3;
    if (edge(10)) this.padSprint = !this.padSprint; if (ly > -0.4) this.padSprint = false; s.sprint = s.sprint || this.padSprint;
    s.jumpPressed ||= edge(0); s.jumpHeld ||= b(0); s.crouchPressed ||= edge(1);
    s.reloadPressed ||= edge(2); s.interact ||= b(2); s.interactPressed ||= edge(2);
    s.swapPressed ||= edge(3); s.frag ||= b(4); s.smokePressed ||= edge(5); s.meleePressed ||= edge(11);
    s.scores ||= b(8); s.buildPressed ||= edge(12); s.wall ||= edge(14); s.floor ||= edge(13); s.ramp ||= edge(15);
    if (edge(9)) this.onPause?.();
    for (let i = 0; i < 17; i++) P[i] = b(i);
  }
}

// On-screen twin-stick touch controls.
export class TouchControls {
  constructor(input, root) {
    this.input = input; this.move = { id: null, ox: 0, oy: 0, x: 0, y: 0 }; this.look = { id: null, lx: 0, ly: 0, dx: 0, dy: 0 }; this.btn = {}; this.edge = {};
    const el = document.createElement('div'); el.id = 'touch'; el.innerHTML = `
      <div class="tz tz-move"></div><div class="tz tz-look"></div>
      <div class="stick" id="tStick"><i></i></div>
      <button class="tb tb-fire" data-b="fire">FIRE</button><button class="tb tb-fire2" data-b="fire">●</button>
      <button class="tb tb-ads" data-b="ads">ADS</button><button class="tb tb-jump" data-b="jump">⤒</button>
      <button class="tb tb-crouch" data-b="crouch">⤓</button><button class="tb tb-reload" data-b="reload">R</button>
      <button class="tb tb-nade" data-b="frag">G</button><button class="tb tb-swap" data-b="swap">⇄</button>
      <button class="tb tb-use" data-b="interact">USE</button><button class="tb tb-sprint" data-b="sprint">»</button>
      <button class="tb tb-build" data-b="build">⌂</button><button class="tb tb-melee" data-b="melee">✦</button>`;
    root.appendChild(el); this.el = el; this.stick = el.querySelector('#tStick');
    const opt = { passive: false };
    el.querySelector('.tz-move').addEventListener('touchstart', (e) => { e.preventDefault(); const t = e.changedTouches[0]; Object.assign(this.move, { id: t.identifier, ox: t.clientX, oy: t.clientY, x: 0, y: 0 }); this.stick.style.cssText = `display:block;left:${t.clientX - 60}px;top:${t.clientY - 60}px`; }, opt);
    el.querySelector('.tz-look').addEventListener('touchstart', (e) => { e.preventDefault(); const t = e.changedTouches[0]; Object.assign(this.look, { id: t.identifier, lx: t.clientX, ly: t.clientY }); }, opt);
    addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.move.id) { let dx = t.clientX - this.move.ox, dy = t.clientY - this.move.oy; const l = Math.hypot(dx, dy), R = 55; if (l > R) { dx *= R / l; dy *= R / l; } this.move.x = dx / R; this.move.y = dy / R; this.stick.firstElementChild.style.transform = `translate(${dx}px,${dy}px)`; }
        else if (t.identifier === this.look.id) { this.look.dx += (t.clientX - this.look.lx) * 2.2; this.look.dy += (t.clientY - this.look.ly) * 2.2; this.look.lx = t.clientX; this.look.ly = t.clientY; }
      }
      if (this.input.enabled) e.preventDefault();
    }, opt);
    const end = (e) => { for (const t of e.changedTouches) { if (t.identifier === this.move.id) { this.move.id = null; this.move.x = this.move.y = 0; this.stick.style.display = 'none'; } if (t.identifier === this.look.id) this.look.id = null; } };
    addEventListener('touchend', end); addEventListener('touchcancel', end);
    el.querySelectorAll('.tb').forEach((b) => {
      const k = b.dataset.b;
      b.addEventListener('touchstart', (e) => { e.preventDefault(); this.btn[k] = true; this.edge[k] = true; b.classList.add('on'); if (k === 'fire' || k === 'ads') { const t = e.changedTouches[0]; if (this.look.id === null) Object.assign(this.look, { id: t.identifier, lx: t.clientX, ly: t.clientY }); } if (k === 'ads') this.adsT = !this.adsT; if (k === 'sprint') this.sprintT = !this.sprintT; }, opt);
      b.addEventListener('touchend', (e) => { e.preventDefault(); this.btn[k] = false; b.classList.remove('on'); }, opt);
    });
  }
  apply(s) {
    if (this.move.x || this.move.y) { s.mx = this.move.x; s.mz = -this.move.y; if (this.move.y > -0.5) this.sprintT = false; }
    s.lookDX += this.look.dx; s.lookDY += this.look.dy; this.look.dx = this.look.dy = 0;
    const e = this.edge, b = this.btn;
    s.fire = s.fire || !!b.fire; s.ads = s.ads || !!this.adsT; s.sprint = s.sprint || !!this.sprintT;
    s.jumpPressed ||= !!e.jump; s.jumpHeld ||= !!b.jump; s.crouchPressed ||= !!e.crouch; s.reloadPressed ||= !!e.reload; s.frag ||= !!b.frag;
    s.swapPressed ||= !!e.swap; s.interact ||= !!b.interact; s.interactPressed ||= !!e.interact; s.buildPressed ||= !!e.build; s.meleePressed ||= !!e.melee;
    this.edge = {};
  }
  show(v) { this.el.style.display = v ? 'block' : 'none'; }
}
