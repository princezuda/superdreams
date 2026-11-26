// Game-specific WebAudio SFX: layered gunshots (crack/body/thump/tail) per weapon with distance filtering,
// propagation delay and stereo pan; surface footsteps; reload foley; impacts, whizzes, explosions;
// ambience beds (rain, wind, sea, industrial hum). No music — that is the Fable pass.
import { settings } from '/shared/sd-kit.js';

const GUN = {
  pistol: { body: 1500, q: 1.1, bodyDur: 0.11, thump: 0.5, tail: 0.5, crack: 0.5, vol: 0.75 },
  smg: { body: 1200, q: 1.0, bodyDur: 0.09, thump: 0.5, tail: 0.45, crack: 0.45, vol: 0.62 },
  ar: { body: 950, q: 0.9, bodyDur: 0.12, thump: 0.8, tail: 0.75, crack: 0.6, vol: 0.8 },
  lmg: { body: 800, q: 0.9, bodyDur: 0.13, thump: 0.95, tail: 0.8, crack: 0.6, vol: 0.82 },
  dmr: { body: 700, q: 0.8, bodyDur: 0.17, thump: 1.0, tail: 1.0, crack: 0.8, vol: 0.9 },
  sniper: { body: 520, q: 0.7, bodyDur: 0.24, thump: 1.3, tail: 1.5, crack: 1.0, vol: 1.0 },
  shotgun: { body: 420, q: 0.6, bodyDur: 0.22, thump: 1.4, tail: 1.1, crack: 0.5, vol: 1.0 },
  enemy: { body: 900, q: 0.9, bodyDur: 0.11, thump: 0.6, tail: 0.7, crack: 0.5, vol: 0.7 },
  drone: { body: 2200, q: 2.5, bodyDur: 0.07, thump: 0.2, tail: 0.3, crack: 0.3, vol: 0.5 },
};

export class Audio {
  constructor() { this.ctx = null; this.listener = { x: 0, y: 0, z: 0, yaw: 0 }; this.amb = []; this.reverb = 0.8; this.lastStep = 0; }
  init() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    const ctx = this.ctx = new C();
    this.master = ctx.createGain(); this.master.gain.value = settings.volume;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.sfxBus = ctx.createGain(); this.sfxBus.connect(this.master);
    this.ambBus = ctx.createGain(); this.ambBus.gain.value = 0.55; this.ambBus.connect(this.master);
    const n = ctx.sampleRate * 2; this.white = ctx.createBuffer(1, n, ctx.sampleRate); const d = this.white.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.brown = ctx.createBuffer(1, n, ctx.sampleRate); const b = this.brown.getChannelData(0); let last = 0; for (let i = 0; i < n; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
    addEventListener('sd-settings', () => { this.master.gain.value = settings.volume; });
  }
  get ok() { return !!this.ctx && settings.volume > 0; }
  setListener(x, y, z, yaw) { const L = this.listener; L.x = x; L.y = y; L.z = z; L.yaw = yaw; }
  // spatial params for a world position
  spatial(x, y, z) {
    if (x === undefined) return { gain: 1, pan: 0, dist: 0, delay: 0, lp: 20000 };
    const L = this.listener, dx = x - L.x, dz = z - L.z, dist = Math.hypot(dx, (y ?? L.y) - L.y, dz);
    const rx = Math.cos(L.yaw), rz = -Math.sin(L.yaw); // right vector
    const pan = Math.max(-1, Math.min(1, (dx * rx + dz * rz) / Math.max(dist, 1) * 0.9));
    return { gain: 1 / (1 + dist * 0.07), pan, dist, delay: Math.min(0.5, dist / 343), lp: Math.max(600, 18000 / (1 + dist * 0.06)) };
  }
  _out(sp, vol) {
    const ctx = this.ctx, g = ctx.createGain(); g.gain.value = vol * sp.gain;
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null; if (p) p.pan.value = sp.pan;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = sp.lp;
    g.connect(f); if (p) { f.connect(p); p.connect(this.sfxBus); } else f.connect(this.sfxBus);
    return g;
  }
  _noise(dest, t, dur, { type = 'bandpass', f0 = 1000, f1 = f0, q = 1, vol = 0.5, attack = 0.002, brown = false, curve = 'exp' } = {}) {
    const ctx = this.ctx, src = ctx.createBufferSource(); src.buffer = brown ? this.brown : this.white; src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur); f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack);
    if (curve === 'exp') g.gain.exponentialRampToValueAtTime(0.0001, t + dur); else g.gain.linearRampToValueAtTime(0, t + dur);
    src.connect(f); f.connect(g); g.connect(dest); src.start(t, Math.random() * 1.2); src.stop(t + dur + 0.05);
  }
  _tone(dest, t, dur, { type = 'sine', f0 = 440, f1 = f0, vol = 0.3, attack = 0.002 } = {}) {
    const ctx = this.ctx, o = ctx.createOscillator(); o.type = type; const j = 0.96 + Math.random() * 0.08;
    o.frequency.setValueAtTime(f0 * j, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * j), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }
  // ---------------------------------------------------------------- weapons
  shot(w, x, y, own = false, z) {
    if (!this.ok) return; const key = typeof w === 'string' ? w : (own ? w.sound : 'enemy'); const G = GUN[key] || GUN.ar;
    const sp = own ? { gain: 1, pan: 0, dist: 0, delay: 0, lp: 20000 } : this.spatial(x, y, z);
    if (sp.dist > 220) return;
    const t = this.ctx.currentTime + sp.delay, out = this._out(sp, G.vol * (own ? 1 : 0.85));
    const far = Math.min(1, sp.dist / 80);
    this._noise(out, t, 0.035, { type: 'highpass', f0: 5000, f1: 2500, vol: 0.9 * G.crack * (1 - far * 0.8) });
    this._noise(out, t, G.bodyDur * (1 + far), { type: 'bandpass', f0: G.body * 1.6, f1: G.body * 0.6, q: G.q, vol: 1.0 });
    this._tone(out, t, 0.16 + G.thump * 0.08, { f0: 160, f1: 42, vol: 0.9 * G.thump * (1 - far * 0.5) });
    this._noise(out, t + 0.01, 0.4 + G.tail * this.reverb, { type: 'lowpass', f0: 1400, f1: 180, vol: 0.32 * G.tail * (0.6 + far), attack: 0.02, brown: true });
    if (own) this._tone(out, t + 0.005, 0.03, { type: 'square', f0: 2800, f1: 1800, vol: 0.05 });
  }
  dry() { if (!this.ok) return; const o = this._out({ gain: 1, pan: 0.2, lp: 20000 }, 0.5), t = this.ctx.currentTime; this._tone(o, t, 0.03, { type: 'square', f0: 2200, f1: 1600, vol: 0.2 }); this._noise(o, t, 0.04, { type: 'highpass', f0: 4000, vol: 0.3 }); }
  click(o, t, f = 3200, v = 0.3) { this._noise(o, t, 0.025, { type: 'bandpass', f0: f, q: 4, vol: v }); this._tone(o, t, 0.02, { type: 'square', f0: f * 0.7, f1: f * 0.5, vol: v * 0.25 }); }
  magOut() { if (!this.ok) return; const o = this._out({ gain: 1, pan: -0.15, lp: 20000 }, 0.55), t = this.ctx.currentTime; this.click(o, t, 2600); this._noise(o, t + 0.04, 0.12, { type: 'bandpass', f0: 1800, f1: 900, q: 2, vol: 0.25 }); }
  magIn() { if (!this.ok) return; const o = this._out({ gain: 1, pan: -0.1, lp: 20000 }, 0.6), t = this.ctx.currentTime; this._tone(o, t, 0.07, { f0: 260, f1: 120, vol: 0.4 }); this.click(o, t + 0.02, 3000, 0.45); }
  rack() { if (!this.ok) return; const o = this._out({ gain: 1, pan: 0.1, lp: 20000 }, 0.6), t = this.ctx.currentTime; this._noise(o, t, 0.08, { type: 'bandpass', f0: 2400, f1: 1200, q: 3, vol: 0.35 }); this.click(o, t + 0.1, 2000, 0.5); this._tone(o, t + 0.1, 0.06, { f0: 300, f1: 150, vol: 0.3 }); }
  reloadStart() { if (!this.ok) return; const o = this._out({ gain: 1, pan: 0, lp: 20000 }, 0.3); this._noise(o, this.ctx.currentTime, 0.18, { type: 'bandpass', f0: 600, f1: 1200, q: 0.8, vol: 0.2, attack: 0.04 }); }
  shell() { if (!this.ok) return; const o = this._out({ gain: 1, pan: 0.05, lp: 20000 }, 0.5), t = this.ctx.currentTime; this.click(o, t, 1800, 0.35); this._tone(o, t + 0.03, 0.05, { f0: 220, f1: 120, vol: 0.3 }); }
  pump() { if (!this.ok) return; const o = this._out({ gain: 1, pan: 0, lp: 20000 }, 0.65), t = this.ctx.currentTime; this._noise(o, t, 0.09, { type: 'bandpass', f0: 1500, f1: 700, q: 2, vol: 0.5 }); this._noise(o, t + 0.16, 0.08, { type: 'bandpass', f0: 1200, f1: 2200, q: 2, vol: 0.5 }); this.click(o, t + 0.24, 2400, 0.4); }
  bolt() { if (!this.ok) return; const o = this._out({ gain: 1, pan: 0.1, lp: 20000 }, 0.6), t = this.ctx.currentTime; this.click(o, t, 2000, 0.4); this._noise(o, t + 0.12, 0.14, { type: 'bandpass', f0: 1600, f1: 900, q: 2, vol: 0.3 }); this._noise(o, t + 0.36, 0.12, { type: 'bandpass', f0: 900, f1: 1800, q: 2, vol: 0.3 }); this.click(o, t + 0.5, 2600, 0.45); }
  swap() { if (!this.ok) return; const o = this._out({ gain: 1, pan: 0, lp: 20000 }, 0.4), t = this.ctx.currentTime; this._noise(o, t, 0.14, { type: 'bandpass', f0: 500, f1: 1400, q: 0.8, vol: 0.25, attack: 0.03 }); this.click(o, t + 0.12, 2400, 0.3); }
  shellBounce(x, y, z) { if (!this.ok) return; const o = this._out(this.spatial(x, y, z), 0.25), t = this.ctx.currentTime; this._tone(o, t, 0.06, { f0: 5200 + Math.random() * 1500, f1: 4800, vol: 0.12 }); this._tone(o, t, 0.04, { f0: 7600, vol: 0.06 }); }
  // ---------------------------------------------------------------- feedback
  hit(head, kill) {
    if (!this.ok) return; const o = this._out({ gain: 1, pan: 0, lp: 20000 }, 0.55), t = this.ctx.currentTime;
    if (head) { this._tone(o, t, 0.12, { type: 'triangle', f0: 3300, f1: 3100, vol: 0.32 }); this._tone(o, t, 0.08, { f0: 5000, vol: 0.12 }); }
    else this._tone(o, t, 0.035, { type: 'square', f0: 2300, f1: 1900, vol: 0.12 });
    if (kill) { this._tone(o, t + 0.03, 0.18, { f0: 140, f1: 70, vol: 0.5 }); this._tone(o, t + 0.05, 0.14, { type: 'triangle', f0: 1100, f1: 1400, vol: 0.18 }); }
  }
  impact(surf, x, y, z) {
    if (!this.ok) return; const sp = this.spatial(x, y, z); if (sp.dist > 60) return; const o = this._out(sp, 0.35), t = this.ctx.currentTime + sp.delay * 0.2;
    if (surf === 'metal' || surf === 'robot') { this._tone(o, t, 0.12, { f0: 1800 + Math.random() * 1500, f1: 900, vol: 0.18 }); this._noise(o, t, 0.05, { type: 'highpass', f0: 3000, vol: 0.3 }); }
    else if (surf === 'wood') { this._noise(o, t, 0.06, { type: 'bandpass', f0: 700, q: 1.5, vol: 0.45 }); this._tone(o, t, 0.05, { f0: 180, f1: 90, vol: 0.2 }); }
    else if (surf === 'water') { this._noise(o, t, 0.18, { type: 'bandpass', f0: 1400, f1: 500, q: 1, vol: 0.35 }); }
    else if (surf === 'flesh') { this._noise(o, t, 0.05, { type: 'lowpass', f0: 600, vol: 0.4 }); }
    else if (surf === 'glass') { this._tone(o, t, 0.1, { f0: 4200, f1: 3600, vol: 0.12 }); this._noise(o, t, 0.12, { type: 'highpass', f0: 5000, vol: 0.3 }); }
    else { this._noise(o, t, 0.05, { type: 'bandpass', f0: 1600, q: 1.2, vol: 0.4 }); this._noise(o, t, 0.12, { type: 'lowpass', f0: 800, f1: 300, vol: 0.15 }); }
  }
  whiz(x, y, z, crack) { if (!this.ok) return; const sp = this.spatial(x, y, z); sp.gain = 1; const o = this._out(sp, 0.5), t = this.ctx.currentTime; if (crack) this._noise(o, t, 0.03, { type: 'highpass', f0: 3500, vol: 0.6 }); this._noise(o, t, 0.14, { type: 'bandpass', f0: 3200, f1: 900, q: 3, vol: 0.4, attack: 0.03 }); }
  explosion(x, y, z, big = 1) {
    if (!this.ok) return; const sp = this.spatial(x, y, z); sp.gain = Math.min(1.4, sp.gain * 1.8); const o = this._out(sp, 1.0), t = this.ctx.currentTime + sp.delay;
    this._noise(o, t, 0.08, { type: 'highpass', f0: 2500, f1: 800, vol: 0.9 });
    this._tone(o, t, 0.9, { f0: 90, f1: 24, vol: 1.0 * big });
    this._noise(o, t, 2.2 * big, { type: 'lowpass', f0: 2200, f1: 90, vol: 0.9, brown: true, attack: 0.005 });
    this._noise(o, t + 0.25, 1.8, { type: 'bandpass', f0: 300, f1: 120, q: 0.6, vol: 0.25, attack: 0.2 }); // debris rumble
  }
  grenadeBounce(x, y, z) { if (!this.ok) return; const o = this._out(this.spatial(x, y, z), 0.4), t = this.ctx.currentTime; this._tone(o, t, 0.08, { f0: 1400, f1: 900, vol: 0.2 }); this._noise(o, t, 0.04, { type: 'bandpass', f0: 2200, q: 3, vol: 0.3 }); }
  pin() { if (!this.ok) return; const o = this._out({ gain: 1, pan: -0.2, lp: 20000 }, 0.5), t = this.ctx.currentTime; this._tone(o, t, 0.15, { type: 'triangle', f0: 3900, f1: 3700, vol: 0.2 }); this.click(o, t + 0.12, 2800, 0.35); }
  smoke(x, y, z) { if (!this.ok) return; const o = this._out(this.spatial(x, y, z), 0.5), t = this.ctx.currentTime; this._noise(o, t, 3.5, { type: 'highpass', f0: 3000, f1: 1500, vol: 0.25, attack: 0.1, curve: 'lin' }); }
  beep(x, y, z, f = 1800) { if (!this.ok) return; const o = this._out(this.spatial(x, y, z), 0.5), t = this.ctx.currentTime; this._tone(o, t, 0.06, { type: 'square', f0: f, vol: 0.14 }); }
  // ---------------------------------------------------------------- movement
  step(surf, loud = 0.6, x, y, z) {
    if (!this.ok) return; const own = x === undefined; const sp = own ? { gain: 1, pan: (this.lastStep ^= 1) ? 0.12 : -0.12, lp: 20000, dist: 0 } : this.spatial(x, y, z);
    if (!own && sp.dist > 30) return; const o = this._out(sp, 0.32 * loud * (own ? 1 : 1.4)), t = this.ctx.currentTime;
    switch (surf) {
      case 'metal': this._noise(o, t, 0.05, { type: 'bandpass', f0: 2600, q: 2, vol: 0.5 }); this._tone(o, t, 0.16, { f0: 520 + Math.random() * 200, f1: 480, vol: 0.12 }); break;
      case 'wood': this._noise(o, t, 0.07, { type: 'bandpass', f0: 520, q: 1.4, vol: 0.6 }); this._tone(o, t, 0.06, { f0: 140, f1: 90, vol: 0.3 }); break;
      case 'dirt': this._noise(o, t, 0.1, { type: 'lowpass', f0: 900, f1: 400, vol: 0.6, attack: 0.01 }); this._noise(o, t + 0.03, 0.06, { type: 'bandpass', f0: 2500, q: 1, vol: 0.12 }); break;
      case 'cloth': this._noise(o, t, 0.08, { type: 'lowpass', f0: 600, vol: 0.4 }); break;
      case 'water': this._noise(o, t, 0.16, { type: 'bandpass', f0: 1100, f1: 600, q: 1, vol: 0.5 }); break;
      default: this._noise(o, t, 0.045, { type: 'bandpass', f0: 1900, q: 1.5, vol: 0.55 }); this._noise(o, t, 0.05, { type: 'lowpass', f0: 500, vol: 0.4 });
    }
    if (this.wet && own) this._noise(o, t + 0.01, 0.09, { type: 'bandpass', f0: 3000, f1: 1500, q: 1.2, vol: 0.18 });
  }
  jump() { if (!this.ok) return; const o = this._out({ gain: 1, pan: 0, lp: 20000 }, 0.25); this._noise(o, this.ctx.currentTime, 0.12, { type: 'bandpass', f0: 500, f1: 900, q: 0.7, vol: 0.4, attack: 0.02 }); }
  land(surf, imp = 0.5) { if (!this.ok) return; const o = this._out({ gain: 1, pan: 0, lp: 20000 }, 0.5 * (0.5 + imp)), t = this.ctx.currentTime; this._tone(o, t, 0.14, { f0: 110, f1: 50, vol: 0.5 }); this.step(surf, 0.9); }
  slide() { if (!this.ok) return; const o = this._out({ gain: 1, pan: 0, lp: 20000 }, 0.4); this._noise(o, this.ctx.currentTime, 0.7, { type: 'bandpass', f0: 1300, f1: 500, q: 0.8, vol: 0.4, attack: 0.03, curve: 'lin' }); }
  mantle() { if (!this.ok) return; const o = this._out({ gain: 1, pan: 0, lp: 20000 }, 0.4), t = this.ctx.currentTime; this._noise(o, t, 0.06, { type: 'lowpass', f0: 700, vol: 0.5 }); this._noise(o, t + 0.12, 0.2, { type: 'bandpass', f0: 600, f1: 1200, q: 0.8, vol: 0.35, attack: 0.03 }); }
  whoosh() { if (!this.ok) return; const o = this._out({ gain: 1, pan: 0, lp: 20000 }, 0.5); this._noise(o, this.ctx.currentTime, 0.6, { type: 'bandpass', f0: 300, f1: 1800, q: 0.8, vol: 0.5, attack: 0.15 }); }
  melee(hit) { if (!this.ok) return; const o = this._out({ gain: 1, pan: 0, lp: 20000 }, 0.5), t = this.ctx.currentTime; this._noise(o, t, 0.14, { type: 'bandpass', f0: 800, f1: 2600, q: 1, vol: 0.4, attack: 0.04 }); if (hit) this._tone(o, t + 0.1, 0.1, { f0: 160, f1: 60, vol: 0.6 }); }
  hurt(amount) { if (!this.ok) return; const o = this._out({ gain: 1, pan: 0, lp: 20000 }, Math.min(0.7, 0.2 + amount / 60)), t = this.ctx.currentTime; this._tone(o, t, 0.18, { f0: 90, f1: 45, vol: 0.6 }); this._noise(o, t, 0.1, { type: 'lowpass', f0: 500, vol: 0.4 }); }
  heartbeat() { if (!this.ok) return; const o = this._out({ gain: 1, pan: 0, lp: 20000 }, 0.4), t = this.ctx.currentTime; this._tone(o, t, 0.12, { f0: 62, f1: 40, vol: 0.6 }); this._tone(o, t + 0.2, 0.1, { f0: 55, f1: 38, vol: 0.4 }); }
  // ---------------------------------------------------------------- UI / mission
  ui(kind) {
    if (!this.ok) return; const o = this._out({ gain: 1, pan: 0, lp: 20000 }, 0.45), t = this.ctx.currentTime;
    if (kind === 'objective') { [0, 5, 9].forEach((s, i) => this._tone(o, t + i * 0.09, 0.4, { type: 'triangle', f0: 523 * 2 ** (s / 12), vol: 0.22 })); }
    else if (kind === 'fail') { [7, 3, 0].forEach((s, i) => this._tone(o, t + i * 0.14, 0.4, { type: 'sine', f0: 330 * 2 ** (s / 12), vol: 0.22 })); }
    else if (kind === 'wave') { this._tone(o, t, 1.1, { type: 'sawtooth', f0: 110, f1: 104, vol: 0.12 }); this._tone(o, t, 1.1, { type: 'sawtooth', f0: 165, f1: 158, vol: 0.08 }); }
    else if (kind === 'buy') { this._tone(o, t, 0.08, { type: 'triangle', f0: 1200, vol: 0.2 }); this._tone(o, t + 0.07, 0.12, { type: 'triangle', f0: 1600, vol: 0.2 }); }
    else if (kind === 'pickup') { this._tone(o, t, 0.1, { type: 'triangle', f0: 900, f1: 1300, vol: 0.2 }); this.click(o, t + 0.05, 2600, 0.3); }
    else if (kind === 'tick') { this._tone(o, t, 0.04, { type: 'square', f0: 1500, vol: 0.08 }); }
    else if (kind === 'radio') { for (let i = 0; i < 3; i++) this._tone(o, t + i * 0.05, 0.04, { type: 'square', f0: 900 + Math.random() * 900, vol: 0.05 }); this._noise(o, t, 0.2, { type: 'bandpass', f0: 2500, q: 2, vol: 0.06 }); }
    else if (kind === 'build') { this._tone(o, t, 0.08, { f0: 240, f1: 160, vol: 0.4 }); this._noise(o, t, 0.12, { type: 'bandpass', f0: 1200, q: 1, vol: 0.3 }); }
    else if (kind === 'break') { this._noise(o, t, 0.35, { type: 'lowpass', f0: 1800, f1: 300, vol: 0.5 }); this._tone(o, t, 0.2, { f0: 140, f1: 60, vol: 0.4 }); }
    else if (kind === 'level') { [0, 4, 7, 12].forEach((s, i) => this._tone(o, t + i * 0.1, 0.5, { type: 'triangle', f0: 392 * 2 ** (s / 12), vol: 0.18 })); }
  }
  thunder() { if (!this.ok) return; const o = this._out({ gain: 1, pan: Math.random() - 0.5, lp: 20000 }, 0.8), t = this.ctx.currentTime; this._noise(o, t, 3.5, { type: 'lowpass', f0: 900, f1: 60, vol: 0.9, brown: true, attack: 0.05 }); this._tone(o, t, 1.6, { f0: 55, f1: 28, vol: 0.5 }); }
  // ---------------------------------------------------------------- ambience beds (loops)
  ambience(kind) {
    if (!this.ctx) return; this.stopAmbience(); this.wet = kind.includes('rain'); this.reverb = kind.includes('indoor') ? 1.2 : kind.includes('plant') ? 1.1 : 0.8;
    const ctx = this.ctx; const loop = (buf, type, f, q, vol, lfo = 0) => {
      const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = ctx.createGain(); g.gain.value = vol;
      s.connect(fl); fl.connect(g); g.connect(this.ambBus); s.start();
      if (lfo) { const o = ctx.createOscillator(); o.frequency.value = lfo; const og = ctx.createGain(); og.gain.value = vol * 0.6; o.connect(og); og.connect(g.gain); o.start(); this.amb.push(o); }
      this.amb.push(s); return g;
    };
    const hum = (f, vol) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 220; const g = ctx.createGain(); g.gain.value = vol; o.connect(fl); fl.connect(g); g.connect(this.ambBus); o.start(); this.amb.push(o); };
    if (kind.includes('rain')) { loop(this.white, 'bandpass', 5200, 0.4, 0.09); loop(this.white, 'lowpass', 900, 0.5, 0.06); }
    if (kind.includes('sea')) loop(this.brown, 'lowpass', 380, 0.7, 0.35, 0.09);
    if (kind.includes('wind')) loop(this.brown, 'bandpass', 520, 0.6, 0.18, 0.13);
    if (kind.includes('plant')) { hum(55, 0.035); hum(110.5, 0.02); loop(this.white, 'bandpass', 1800, 6, 0.012); }
    if (kind.includes('birds')) { this.birdTimer = setInterval(() => { if (!this.ok) return; const o = this._out({ gain: 0.5, pan: Math.random() * 2 - 1, lp: 20000 }, 0.12), t = ctx.currentTime; const f = 2600 + Math.random() * 1600; for (let i = 0; i < 2 + Math.random() * 3; i++) this._tone(o, t + i * 0.09, 0.07, { type: 'sine', f0: f, f1: f * 1.25, vol: 0.12 }); }, 2600); }
  }
  stopAmbience() { for (const s of this.amb) { try { s.stop(); } catch { /* */ } } this.amb = []; clearInterval(this.birdTimer); }
  stormLoop(on) {
    if (!this.ctx) return;
    if (on && !this.storm) { const s = this.ctx.createBufferSource(); s.buffer = this.brown; s.loop = true; const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300; const g = this.ctx.createGain(); g.gain.value = 0.5; s.connect(f); f.connect(g); g.connect(this.sfxBus); s.start(); this.storm = { s, g }; }
    else if (!on && this.storm) { try { this.storm.s.stop(); } catch { /* */ } this.storm = null; }
  }
}
