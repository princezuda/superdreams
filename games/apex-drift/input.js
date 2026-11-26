// Apex Drift — unified input: keyboard, standard-mapping gamepad, on-screen touch pedals (analog steering pad,
// gas/brake/drift/boost) and optional tilt steering. poll() returns one input frame + edge-triggered actions.
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Input {
  constructor(prefs) {
    this.prefs = prefs; this.keys = new Set(); this.edges = new Set(); this.touch = { steer: 0, gas: false, brake: false, drift: false, boost: false, active: false };
    this.tilt = 0; this.padPrev = []; this.lastDevice = 'keyboard'; this.kSteer = 0;
    addEventListener('keydown', (e) => {
      if (e.target?.tagName === 'INPUT') return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.edges.add(e.code); this.keys.add(e.code); this.lastDevice = 'keyboard';
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  }
  edge(...codes) { let hit = false; for (const c of codes) if (this.edges.has(c)) hit = true; return hit; }
  poll(dt) {
    const k = this.keys, o = { throttle: 0, brake: 0, steer: 0, drift: false, boost: false, reset: false, pause: false, camera: false, look: false };
    const L = k.has('KeyA') || k.has('ArrowLeft'), R = k.has('KeyD') || k.has('ArrowRight');
    // keyboard steering ramps in (digital keys feel twitchy at 220 km/h otherwise)
    const ks = (R ? 1 : 0) - (L ? 1 : 0);
    this.kSteer = ks === 0 ? 0 : clamp(this.kSteer + ks * dt * (Math.sign(this.kSteer) !== ks ? 9 : 4.5), -1, 1);
    if (ks !== 0 && Math.abs(this.kSteer) < 0.35) this.kSteer = 0.35 * ks;
    o.steer = this.kSteer;
    o.throttle = k.has('KeyW') || k.has('ArrowUp') ? 1 : 0;
    o.brake = k.has('KeyS') || k.has('ArrowDown') ? 1 : 0;
    o.drift = k.has('Space') || k.has('KeyJ');
    o.boost = k.has('ShiftLeft') || k.has('ShiftRight') || k.has('KeyN') || k.has('KeyK');
    o.reset = this.edge('KeyR'); o.pause = this.edge('Escape', 'KeyP'); o.confirm = this.edge('Enter', 'NumpadEnter'); o.camera = this.edge('KeyC'); o.look = k.has('KeyB');
    // gamepad
    const pads = navigator.getGamepads?.() || [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const b = (i) => p.buttons[i]?.value ?? 0, pr = (i) => !!p.buttons[i]?.pressed, ed = (i) => pr(i) && !this.padPrev[i];
      const ax = p.axes[0] || 0, dz = 0.12; const sAx = Math.abs(ax) < dz ? 0 : Math.sign(ax) * (Math.abs(ax) - dz) / (1 - dz);
      const any = Math.abs(sAx) > 0 || b(7) > 0.05 || b(6) > 0.05 || pr(0) || pr(2);
      if (any) this.lastDevice = 'gamepad';
      if (Math.abs(sAx) > Math.abs(o.steer)) o.steer = sAx * Math.abs(sAx) * 0.35 + sAx * 0.65; // slight response curve
      o.throttle = Math.max(o.throttle, b(7)); o.brake = Math.max(o.brake, b(6));
      o.drift = o.drift || pr(0) || pr(1) || pr(5); o.boost = o.boost || pr(2) || pr(4);
      o.reset = o.reset || ed(3); o.pause = o.pause || ed(9); o.confirm = o.confirm || ed(0) || ed(9); o.camera = o.camera || ed(8); o.look = o.look || pr(10);
      if (p.buttons[12]?.pressed) o.throttle = 1; if (p.buttons[13]?.pressed) o.brake = 1;
      this.padPrev = p.buttons.map((x) => x.pressed); break;
    }
    // touch / tilt
    const t = this.touch;
    if (t.active) {
      if (Math.abs(t.steer) > Math.abs(o.steer)) o.steer = t.steer;
      if (this.prefs.tilt && Math.abs(this.tilt) > Math.abs(o.steer)) o.steer = this.tilt;
      if (t.gas || (this.prefs.autoAccel && !t.brake)) o.throttle = 1;
      if (t.brake) o.brake = 1; o.drift = o.drift || t.drift; o.boost = o.boost || t.boost;
    }
    this.edges.clear();
    return o;
  }
  /** Build on-screen controls inside `root`. Returns the element (hidden until show()). */
  buildTouch(root) {
    const el = document.createElement('div'); el.id = 'touch'; el.innerHTML = `
      <div class="tpad" id="tSteer"><i class="tl">◀</i><b class="tknob"></b><i class="tr">▶</i></div>
      <div class="tbtns">
        <button class="tb tb-boost" data-k="boost">BOOST</button>
        <button class="tb tb-drift" data-k="drift">DRIFT</button>
        <button class="tb tb-brake" data-k="brake">BRAKE</button>
        <button class="tb tb-gas" data-k="gas">GAS</button>
      </div>`;
    root.appendChild(el);
    const t = this.touch; const pad = el.querySelector('#tSteer'), knob = el.querySelector('.tknob');
    const steerFrom = (e) => { const r = pad.getBoundingClientRect(); const x = ((e.clientX - r.left) / r.width) * 2 - 1; t.steer = clamp(x * 1.35, -1, 1); knob.style.transform = `translateX(${t.steer * r.width * 0.32}px)`; };
    let sid = null;
    pad.addEventListener('pointerdown', (e) => { sid = e.pointerId; pad.setPointerCapture(e.pointerId); t.active = true; this.lastDevice = 'touch'; steerFrom(e); e.preventDefault(); });
    pad.addEventListener('pointermove', (e) => { if (e.pointerId === sid) steerFrom(e); });
    const endS = (e) => { if (e.pointerId !== sid) return; sid = null; t.steer = 0; knob.style.transform = ''; };
    pad.addEventListener('pointerup', endS); pad.addEventListener('pointercancel', endS);
    el.querySelectorAll('.tb').forEach((b) => {
      const key = b.dataset.k;
      const on = (e) => { b.setPointerCapture?.(e.pointerId); t[key] = true; t.active = true; this.lastDevice = 'touch'; b.classList.add('down'); e.preventDefault(); };
      const off = () => { t[key] = false; b.classList.remove('down'); };
      b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    });
    this.touchEl = el; return el;
  }
  showTouch(on) { if (this.touchEl) this.touchEl.classList.toggle('show', !!on); if (on) this.touch.active = true; }
  async enableTilt(on) {
    this.prefs.tilt = on; if (!on) { this.tilt = 0; return true; }
    try { if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) { const r = await DeviceOrientationEvent.requestPermission(); if (r !== 'granted') { this.prefs.tilt = false; return false; } } } catch { this.prefs.tilt = false; return false; }
    if (!this.tiltBound) { this.tiltBound = true; addEventListener('deviceorientation', (e) => {
      const land = Math.abs(window.orientation ?? (screen.orientation?.angle ?? 0)) === 90; const sgn = (window.orientation ?? screen.orientation?.angle ?? 0) < 0 || (screen.orientation?.angle === 270) ? -1 : 1;
      const a = land ? (e.beta || 0) * sgn : (e.gamma || 0); this.tilt = clamp(a / 28, -1, 1) * (Math.abs(a) < 2.5 ? 0 : 1);
    }); }
    return true;
  }
}
