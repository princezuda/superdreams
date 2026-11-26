// Apex Drift — runtime SFX on the kit's shared AudioContext: player engine (two detuned oscillators through a
// throttle-opened low-pass, simulated gears), tyre screech (band-passed noise), boost roar, wind, one-shots.
// FABLE: music — per-track loops + final-lap layer + podium sting go on the same bus (do not open a second AudioContext).
// FABLE: audio — crowd bed near the start/finish, spatialised rival engines.
import { audio, voice, settings, sfx } from '/shared/sd-kit.js';

export class RaceAudio {
  constructor() { this.on = false; this.gear = 1; this.rpm = 0.2; }
  ensure() {
    if (this.on) return true;
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return false; // no context before a gesture
    const { ctx, master } = audio(); if (!ctx) return false;
    this.ctx = ctx; const bus = this.bus = ctx.createGain(); bus.gain.value = 0; bus.connect(master);
    const mk = (type, f) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.start(); return o; };
    this.o1 = mk('sawtooth', 60); this.o2 = mk('square', 30); this.o3 = mk('sawtooth', 121);
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 600; this.lp.Q.value = 3;
    this.eg = ctx.createGain(); this.eg.gain.value = 0.0;
    const g2 = ctx.createGain(); g2.gain.value = 0.45; const g3 = ctx.createGain(); g3.gain.value = 0.25;
    this.o1.connect(this.lp); this.o2.connect(g2).connect(this.lp); this.o3.connect(g3).connect(this.lp); this.lp.connect(this.eg).connect(bus);
    const nbuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = nbuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const noise = () => { const s = ctx.createBufferSource(); s.buffer = nbuf; s.loop = true; s.start(); return s; };
    this.sq = ctx.createBiquadFilter(); this.sq.type = 'bandpass'; this.sq.frequency.value = 1900; this.sq.Q.value = 6; this.sg = ctx.createGain(); this.sg.gain.value = 0; noise().connect(this.sq).connect(this.sg).connect(bus);
    this.wf = ctx.createBiquadFilter(); this.wf.type = 'lowpass'; this.wf.frequency.value = 500; this.wg = ctx.createGain(); this.wg.gain.value = 0; noise().connect(this.wf).connect(this.wg).connect(bus);
    this.bf = ctx.createBiquadFilter(); this.bf.type = 'bandpass'; this.bf.frequency.value = 300; this.bf.Q.value = 0.8; this.bg = ctx.createGain(); this.bg.gain.value = 0; noise().connect(this.bf).connect(this.bg).connect(bus);
    this.on = true; return true;
  }
  /** Per-frame: car = player physics car, inp = its input, active = racing (not paused/menu). */
  update(car, inp, active, dt) {
    if (!this.ensure()) return; const t = this.ctx.currentTime, k = 0.06;
    this.bus.gain.setTargetAtTime(active ? 1 : 0, t, active ? 0.08 : 0.25);
    if (!active || !car) return;
    const v = Math.max(0, car.vF), top = car.stats.vmax * 1.25;
    // gears: 6 bands, rpm climbs inside each band
    const bands = [0, 0.13, 0.27, 0.42, 0.58, 0.76, 1.01]; const fr = Math.min(1, v / top); let g = 1; while (g < 6 && fr > bands[g]) g++;
    const lo = bands[g - 1], hi = bands[g]; const target = 0.22 + 0.78 * (fr - lo) / (hi - lo);
    if (g !== this.gear) { this.gear = g; this.rpm = Math.max(0.2, this.rpm - 0.3); }
    const thr = inp?.throttle || 0;
    this.rpm += ((car.drift ? Math.min(1, target + 0.18) : target) + (thr && v < 3 ? 0.3 : 0) - this.rpm) * Math.min(1, dt * 7);
    const f = 38 + this.rpm * 150;
    this.o1.frequency.setTargetAtTime(f, t, k); this.o2.frequency.setTargetAtTime(f * 0.5, t, k); this.o3.frequency.setTargetAtTime(f * 2.01, t, k);
    this.lp.frequency.setTargetAtTime(380 + thr * 1500 + this.rpm * 900 + (car.boosting ? 900 : 0), t, k);
    this.eg.gain.setTargetAtTime(0.07 + thr * 0.06 + this.rpm * 0.04, t, k);
    const slip = car.drift ? Math.min(1, Math.abs(car.driftAng) * 2.2 + 0.25) : car.offroad ? 0 : Math.min(1, Math.max(0, Math.abs(car.vR) - 3) / 6);
    this.sg.gain.setTargetAtTime(slip * 0.16 * Math.min(1, v / 12), t, 0.05); this.sq.frequency.setTargetAtTime(1500 + Math.abs(car.driftAng) * 1600, t, 0.1);
    this.wg.gain.setTargetAtTime(Math.min(0.12, v * v / 40000) + (car.offroad ? 0.08 : 0), t, 0.2); this.wf.frequency.setTargetAtTime(car.offroad ? 900 : 300 + v * 16, t, 0.2);
    this.bg.gain.setTargetAtTime(car.boosting ? 0.2 : 0, t, 0.08); this.bf.frequency.setTargetAtTime(car.boosting ? 180 + v * 6 : 200, t, 0.1);
  }
  silence() { if (this.on) this.bus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1); }
}

// one-shots
export const sx = {
  beep: (hi) => voice({ type: 'square', f0: hi ? 880 : 440, f1: hi ? 880 : 440, dur: hi ? 0.6 : 0.22, vol: 0.13, filter: { f0: 3000 } }),
  wall: (imp) => { const v = Math.min(1, imp / 14); voice({ type: 'sine', f0: 120, f1: 45, dur: 0.25, vol: 0.25 + v * 0.3 }); voice({ noise: true, dur: 0.18 + v * 0.2, vol: 0.12 + v * 0.2, filter: { type: 'bandpass', f0: 2600, f1: 600, q: 1.2 } }); },
  bump: () => { voice({ type: 'triangle', f0: 180, f1: 70, dur: 0.16, vol: 0.2 }); voice({ noise: true, dur: 0.1, vol: 0.1, filter: { f0: 1500, f1: 300 } }); },
  tier: (t) => voice({ type: 'triangle', f0: 600 + t * 220, f1: 900 + t * 300, dur: 0.14, vol: 0.12 }),
  sling: (t) => { voice({ noise: true, dur: 0.35 + t * 0.1, vol: 0.18, filter: { type: 'bandpass', f0: 500, f1: 3000, q: 1.4 }, attack: 0.02 }); voice({ type: 'sawtooth', f0: 220, f1: 520, dur: 0.3, vol: 0.06, filter: { f0: 1800 } }); },
  boost: () => { voice({ noise: true, dur: 0.6, vol: 0.2, filter: { type: 'bandpass', f0: 300, f1: 2400, q: 1.1 }, attack: 0.04 }); },
  lap: () => sfx.check(), best: () => sfx.magic(), finalLap: () => { [0, 4, 7].forEach((s, i) => setTimeout(() => voice({ type: 'square', f0: 523 * 2 ** (s / 12), dur: 0.18, vol: 0.09, filter: { f0: 2500 } }), i * 110)); },
  overtake: () => voice({ type: 'sine', f0: 700, f1: 1050, dur: 0.12, vol: 0.12 }),
  lost: () => voice({ type: 'sine', f0: 500, f1: 380, dur: 0.14, vol: 0.09 }),
  finish: (pos) => (pos <= 3 ? sfx.win() : sfx.chime()),
  ui: () => sfx.click(),
};
export { settings };
