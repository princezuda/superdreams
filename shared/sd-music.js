// ============================================================================================
// Superdreams music kit — generative score player, one-shot stings, ambience beds and blip voices.
// Everything is synthesised with Web Audio on the kit's shared graph (no audio files, no second
// AudioContext). A game describes its music as data (a "score"); see games/_template for a sample.
//
//   const music = createMusic({ tracks: { menu: {...}, play: {...} }, stings: { win: {...} } });
//   music.play('menu');  music.intensity(0.8);  music.sting('win');  music.tempo(1.1);  music.stop();
//
// Track:  { bpm, key:'D', scale:'dorian', beats:4, chords:[0,5,3,4], barsPerChord:1, swing:0, delay:0.2,
//           layers:[ { inst, pat, div, octave, vol, pan, rev, dly, at, upTo, prob, gate, bars } ] }
// Chords: scale degrees — 0 (triad), '4:7' (seventh), '0:9', '3:sus', '0:5', '0:6', or [0,2,4,6].
// Layer pat tokens (one per step; a bar holds `div` steps, default 16):
//   melodic  0 1 2 … = chord tone (wraps upward by octave, negatives go down) · sN = scale degree N
//            c = whole chord · . = rest · _ = hold previous note      e.g. '0 . 2 1 | s4 _ _ .'
//   drums    x hit · X accent · o ghost · - rest (no spaces needed)   e.g. 'x---x---x-x-x---'
//   no pat   sustained: the chord (or play:'root') re-struck at every chord change — pads, drones.
// Intensity: a layer sounds while at <= intensity <= upTo (defaults 0..1) — stack combat/tension layers.
// ============================================================================================
import { audio, settings } from './sd-kit.js';

const KEYS = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10], harmonic: [0, 2, 3, 5, 7, 8, 11], pentatonic: [0, 2, 4, 7, 9],
  minorPent: [0, 3, 5, 7, 10], whole: [0, 2, 4, 6, 8, 10], japanese: [0, 1, 5, 7, 8], blues: [0, 3, 5, 6, 7, 10],
};
const TPB = 12; // ticks per beat (48 per 4-beat bar): div may be 1,2,3,4,6,8,12,16,24,48
const mod = (a, n) => ((a % n) + n) % n;
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

// ---------------------------------------------------------------- instruments
const ar = (g, t, a, dur, r, peak, sus = 0.8, dec = 0.25) => { // attack → sustain → release; returns stop time
  const hold = Math.max(dur, a + 0.01);
  g.setValueAtTime(0.0001, t); g.linearRampToValueAtTime(peak, t + a); g.setTargetAtTime(peak * sus, t + a, dec / 3 + 0.001);
  g.setTargetAtTime(0.0001, t + hold, r / 3 + 0.001); return t + hold + r * 1.7 + 0.05;
};
const pluckEnv = (g, t, a, tc, dur, peak) => { // percussive decay with time constant tc, damped at note end
  g.setValueAtTime(0.0001, t); g.linearRampToValueAtTime(peak, t + a); g.setTargetAtTime(0.0001, t + a, tc);
  g.setTargetAtTime(0.0001, t + Math.max(dur, a + 0.02), 0.06); return t + Math.max(dur, a + 0.02) + Math.min(tc * 4, 0.5) + 0.1;
};
const osc = (c, type, f, t, end, det = 0) => { const o = c.createOscillator(); o.type = type; o.frequency.value = f; if (det) o.detune.value = det; o.start(t); o.stop(end); return o; };
const filt = (c, type, f, q = 0.7) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
const gain = (c, v = 1) => { const g = c.createGain(); g.gain.value = v; return g; };
function noiseSrc(E, t, end) { const s = E.ctx.createBufferSource(); s.buffer = E.noise; s.loop = true; s.start(t, Math.random() * 1.5); s.stop(end); return s; }
function vibrato(c, o, t, end, depth = 10, rate = 5.4, delay = 0.18) { const l = osc(c, 'sine', rate, t, end), g = gain(c, 0); g.gain.setValueAtTime(0, t + delay); g.gain.linearRampToValueAtTime(depth, t + delay + 0.25); l.connect(g); g.connect(o.detune); }

const INST = {
  pad(E, out, f, t, dur, v, o) {
    const c = E.ctx, g = gain(c, 0), cut = o.cut ?? 1500, lp = filt(c, 'lowpass', cut * 0.55, 0.5);
    const end = ar(g.gain, t, o.a ?? 0.45, dur, o.r ?? 1.1, v * 0.13, 0.9);
    lp.frequency.setValueAtTime(cut * 0.55, t); lp.frequency.linearRampToValueAtTime(cut, t + Math.max(dur * 0.5, 0.3)); lp.frequency.linearRampToValueAtTime(cut * 0.6, t + dur + 0.4);
    osc(c, 'sawtooth', f, t, end, -9).connect(lp); osc(c, 'sawtooth', f, t, end, 8).connect(lp); osc(c, 'triangle', f / 2, t, end).connect(lp); lp.connect(g); g.connect(out);
  },
  strings(E, out, f, t, dur, v, o) {
    const c = E.ctx, g = gain(c, 0), lp = filt(c, 'lowpass', o.cut ?? 2600, 0.4), end = ar(g.gain, t, o.a ?? 0.12, dur, o.r ?? 0.45, v * 0.1, 0.85);
    for (const d of [-12, 0, 11]) { const s = osc(c, 'sawtooth', f, t, end, d); if (!d) vibrato(c, s, t, end, 7, 5.2, 0.3); s.connect(lp); } lp.connect(g); g.connect(out);
  },
  choir(E, out, f, t, dur, v, o) {
    const c = E.ctx, g = gain(c, 0), end = ar(g.gain, t, o.a ?? 0.3, dur, o.r ?? 0.9, v * 0.5, 0.9), mix = gain(c, 1);
    for (const d of [-7, 7]) { const s = osc(c, 'sawtooth', f, t, end, d); vibrato(c, s, t, end, 9, 4.8 + d * 0.03, 0.1); s.connect(mix); }
    for (const [ff, q, a] of o.oo ? [[400, 5, 1], [800, 6, 0.5], [2400, 6, 0.15]] : [[650, 5, 1], [1080, 6, 0.55], [2650, 7, 0.25]]) { const b = filt(c, 'bandpass', ff, q), bg = gain(c, a); mix.connect(b); b.connect(bg); bg.connect(g); }
    g.connect(out);
  },
  piano(E, out, f, t, dur, v, o) {
    const c = E.ctx, g = gain(c, 0), lp = filt(c, 'lowpass', 900 + v * 3800, 0.3), tc = Math.min(1.1, 0.5 * (220 / f) ** 0.35) * (o.sustain ?? 1);
    const end = pluckEnv(g.gain, t, 0.004, tc, Math.max(dur, 0.25), v * 0.3); lp.frequency.setTargetAtTime(700, t, tc * 0.8);
    osc(c, 'triangle', f, t, end).connect(lp); const h = gain(c, 0.3); osc(c, 'sine', f * 2.001, t, end).connect(h); h.connect(lp); const h3 = gain(c, 0.1); osc(c, 'sine', f * 3.003, t, end).connect(h3); h3.connect(lp); lp.connect(g); g.connect(out);
  },
  keys(E, out, f, t, dur, v, o) { // soft electric piano (FM)
    const c = E.ctx, g = gain(c, 0), end = pluckEnv(g.gain, t, 0.005, 0.7, Math.max(dur, 0.2), v * 0.26), car = osc(c, 'sine', f, t, end), m = osc(c, 'sine', f, t, end), mg = gain(c, 0);
    mg.gain.setValueAtTime(f * (0.6 + v), t); mg.gain.setTargetAtTime(f * 0.1, t, 0.12); m.connect(mg); mg.connect(car.frequency);
    const tine = gain(c, 0); tine.gain.setValueAtTime(v * 0.07, t); tine.gain.setTargetAtTime(0.0001, t, 0.04); osc(c, 'sine', f * 4, t, t + 0.3).connect(tine); tine.connect(out); car.connect(g); g.connect(out);
  },
  bell(E, out, f, t, dur, v, o) {
    const c = E.ctx, g = gain(c, 0), end = pluckEnv(g.gain, t, 0.002, o.decay ?? 0.55, Math.max(dur, 1.2), v * 0.2), car = osc(c, 'sine', f, t, end), m = osc(c, 'sine', f * (o.ratio ?? 3.5), t, end), mg = gain(c, 0);
    mg.gain.setValueAtTime(f * 1.8 * v, t); mg.gain.setTargetAtTime(0.0001, t, 0.28); m.connect(mg); mg.connect(car.frequency); car.connect(g); g.connect(out);
  },
  pluck(E, out, f, t, dur, v, o) {
    const c = E.ctx, g = gain(c, 0), lp = filt(c, 'lowpass', Math.min(f * 9, 7500), 1.6), end = pluckEnv(g.gain, t, 0.003, o.decay ?? 0.16, dur, v * 0.22);
    lp.frequency.setValueAtTime(Math.min(f * 9, 7500), t); lp.frequency.setTargetAtTime(Math.max(f * 1.5, 300), t, 0.07);
    osc(c, o.wave ?? 'sawtooth', f, t, end, -4).connect(lp); osc(c, o.wave ?? 'sawtooth', f, t, end, 5).connect(lp); lp.connect(g); g.connect(out);
  },
  harp(E, out, f, t, dur, v, o) {
    const c = E.ctx, g = gain(c, 0), end = pluckEnv(g.gain, t, 0.002, o.decay ?? 0.45, Math.max(dur, 0.6), v * 0.3);
    osc(c, 'triangle', f, t, end).connect(g); const h = gain(c, 0.25); osc(c, 'sine', f * 2, t, end).connect(h); h.connect(g);
    const n = noiseSrc(E, t, t + 0.03), ng = gain(c, v * 0.05), nb = filt(c, 'bandpass', f * 3, 1.5); n.connect(nb); nb.connect(ng); ng.connect(out); g.connect(out);
  },
  lute(E, out, f, t, dur, v, o) { INST.pluck(E, out, f, t, dur, v * 1.1, { wave: 'square', decay: 0.26, ...o }); },
  marimba(E, out, f, t, dur, v) {
    const c = E.ctx, g = gain(c, 0), end = pluckEnv(g.gain, t, 0.002, 0.14, 0.3, v * 0.34); osc(c, 'sine', f, t, end).connect(g);
    const k = gain(c, 0); k.gain.setValueAtTime(v * 0.12, t); k.gain.setTargetAtTime(0.0001, t, 0.02); osc(c, 'sine', f * 4, t, t + 0.15).connect(k); k.connect(out); g.connect(out);
  },
  bass(E, out, f, t, dur, v, o) {
    const c = E.ctx, g = gain(c, 0), lp = filt(c, 'lowpass', o.cut ?? 420, 0.8), end = ar(g.gain, t, 0.012, dur, 0.1, v * 0.34, 0.75, 0.2);
    osc(c, 'sine', f, t, end).connect(g); osc(c, 'sawtooth', f, t, end).connect(lp); lp.connect(g); g.connect(out);
  },
  sub(E, out, f, t, dur, v) { const c = E.ctx, g = gain(c, 0), end = ar(g.gain, t, 0.03, dur, 0.25, v * 0.4, 0.9); osc(c, 'sine', f, t, end).connect(g); g.connect(out); },
  synbass(E, out, f, t, dur, v, o) {
    const c = E.ctx, g = gain(c, 0), lp = filt(c, 'lowpass', f * 6, o.q ?? 5), end = ar(g.gain, t, 0.005, dur, 0.07, v * 0.24, 0.7, 0.15);
    lp.frequency.setValueAtTime(Math.min(f * (o.open ?? 8), 5000), t); lp.frequency.setTargetAtTime(f * 1.3, t, 0.06);
    osc(c, 'sawtooth', f, t, end).connect(lp); osc(c, 'square', f / 2, t, end).connect(lp); lp.connect(g); g.connect(out);
  },
  lead(E, out, f, t, dur, v, o) {
    const c = E.ctx, g = gain(c, 0), lp = filt(c, 'lowpass', o.cut ?? 2800, 1), end = ar(g.gain, t, 0.02, dur, 0.16, v * 0.13, 0.8);
    const a = osc(c, o.wave ?? 'square', f, t, end), b = osc(c, 'sawtooth', f, t, end, 7); vibrato(c, a, t, end, 12); vibrato(c, b, t, end, 12);
    a.connect(lp); const bg = gain(c, 0.5); b.connect(bg); bg.connect(lp); lp.connect(g); g.connect(out);
  },
  flute(E, out, f, t, dur, v, o) {
    const c = E.ctx, g = gain(c, 0), end = ar(g.gain, t, o.a ?? 0.06, dur, 0.18, v * 0.22, 0.85), s = osc(c, 'sine', f, t, end); vibrato(c, s, t, end, 9, 5, 0.22); s.connect(g);
    const tr = gain(c, 0.12); osc(c, 'triangle', f * 2, t, end).connect(tr); tr.connect(g);
    const n = noiseSrc(E, t, end), nb = filt(c, 'bandpass', f * 2, 2), ng = gain(c, 0.05); n.connect(nb); nb.connect(ng); ng.connect(g); g.connect(out);
  },
  brass(E, out, f, t, dur, v, o) {
    const c = E.ctx, g = gain(c, 0), lp = filt(c, 'lowpass', 500, 1.2), end = ar(g.gain, t, 0.04, dur, 0.2, v * 0.15, 0.8);
    lp.frequency.setValueAtTime(450, t); lp.frequency.linearRampToValueAtTime(o.cut ?? 2600, t + 0.07); lp.frequency.setTargetAtTime(1500, t + 0.07, 0.2);
    osc(c, 'sawtooth', f, t, end, -6).connect(lp); osc(c, 'sawtooth', f, t, end, 6).connect(lp); lp.connect(g); g.connect(out);
  },
  organ(E, out, f, t, dur, v) {
    const c = E.ctx, g = gain(c, 0), end = ar(g.gain, t, 0.02, dur, 0.09, v * 0.12, 1);
    [[1, 1], [2, 0.6], [3, 0.35], [4, 0.2], [0.5, 0.5]].forEach(([m, a]) => { const og = gain(c, a); osc(c, 'sine', f * m, t, end).connect(og); og.connect(g); }); g.connect(out);
  },
  // ---- drums (pitch ignored unless o.f is given)
  kick(E, out, f, t, dur, v, o) {
    const c = E.ctx, g = gain(c, 0), s = c.createOscillator(); s.frequency.setValueAtTime(o.f ?? 150, t); s.frequency.exponentialRampToValueAtTime(o.f1 ?? 44, t + 0.11);
    g.gain.setValueAtTime(v * 0.9, t); g.gain.setTargetAtTime(0.0001, t + 0.04, o.decay ?? 0.07); s.connect(g); g.connect(out); s.start(t); s.stop(t + 0.6);
  },
  snare(E, out, f, t, dur, v, o) {
    const c = E.ctx, n = noiseSrc(E, t, t + 0.3), bp = filt(c, 'highpass', 1400, 0.6), ng = gain(c, 0); ng.gain.setValueAtTime(v * 0.42, t); ng.gain.setTargetAtTime(0.0001, t, o.decay ?? 0.05); n.connect(bp); bp.connect(ng); ng.connect(out);
    const tg = gain(c, 0); tg.gain.setValueAtTime(v * 0.3, t); tg.gain.setTargetAtTime(0.0001, t, 0.03); const s = c.createOscillator(); s.frequency.setValueAtTime(230, t); s.frequency.exponentialRampToValueAtTime(150, t + 0.08); s.connect(tg); tg.connect(out); s.start(t); s.stop(t + 0.25);
  },
  clap(E, out, f, t, dur, v) { const c = E.ctx; for (const d of [0, 0.012, 0.026]) { const n = noiseSrc(E, t + d, t + d + 0.25), bp = filt(c, 'bandpass', 1500, 1.4), g = gain(c, 0); g.gain.setValueAtTime(v * 0.3, t + d); g.gain.setTargetAtTime(0.0001, t + d, d > 0.02 ? 0.06 : 0.012); n.connect(bp); bp.connect(g); g.connect(out); } },
  hat(E, out, f, t, dur, v, o) { const c = E.ctx, n = noiseSrc(E, t, t + 0.2), hp = filt(c, 'highpass', o.f ?? 7500, 0.8), g = gain(c, 0); g.gain.setValueAtTime(v * 0.16, t); g.gain.setTargetAtTime(0.0001, t, o.decay ?? 0.018); n.connect(hp); hp.connect(g); g.connect(out); },
  ohat(E, out, f, t, dur, v) { INST.hat(E, out, f, t, dur, v, { decay: 0.11 }); },
  shaker(E, out, f, t, dur, v) { const c = E.ctx, n = noiseSrc(E, t, t + 0.2), bp = filt(c, 'bandpass', 5200, 1.2), g = gain(c, 0); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v * 0.14, t + 0.02); g.gain.setTargetAtTime(0.0001, t + 0.02, 0.025); n.connect(bp); bp.connect(g); g.connect(out); },
  rim(E, out, f, t, dur, v) { const c = E.ctx, g = gain(c, 0); g.gain.setValueAtTime(v * 0.3, t); g.gain.setTargetAtTime(0.0001, t, 0.012); const s = osc(c, 'triangle', 1700, t, t + 0.1), bp = filt(c, 'bandpass', 1700, 3); s.connect(bp); bp.connect(g); g.connect(out); },
  tom(E, out, f, t, dur, v, o) { INST.kick(E, out, f, t, dur, v * 0.7, { f: o.f ?? 210, f1: (o.f ?? 210) * 0.55, decay: 0.12 }); },
  taiko(E, out, f, t, dur, v, o) {
    INST.kick(E, out, f, t, dur, v, { f: o.f ?? 110, f1: 48, decay: 0.2 });
    const c = E.ctx, n = noiseSrc(E, t, t + 0.3), lp = filt(c, 'lowpass', 900, 0.7), g = gain(c, 0); g.gain.setValueAtTime(v * 0.3, t); g.gain.setTargetAtTime(0.0001, t, 0.05); n.connect(lp); lp.connect(g); g.connect(out);
  },
  timpani(E, out, f, t, dur, v) {
    const c = E.ctx, g = gain(c, 0), ff = Math.min(Math.max(f, 60), 180), s = c.createOscillator(); s.frequency.setValueAtTime(ff * 1.25, t); s.frequency.exponentialRampToValueAtTime(ff, t + 0.06);
    g.gain.setValueAtTime(v * 0.7, t); g.gain.setTargetAtTime(0.0001, t + 0.05, 0.35); s.connect(g); const h = gain(c, 0.3); osc(c, 'sine', ff * 1.5, t, t + 1.5).connect(h); h.connect(g); g.connect(out); s.start(t); s.stop(t + 2);
  },
  cymbal(E, out, f, t, dur, v, o) { const c = E.ctx, len = o.decay ?? 1.4, n = noiseSrc(E, t, t + len * 3), hp = filt(c, 'highpass', 5200, 0.5), g = gain(c, 0); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v * 0.2, t + (o.swell ?? 0.005)); g.gain.setTargetAtTime(0.0001, t + (o.swell ?? 0.005), len / 3); n.connect(hp); hp.connect(g); g.connect(out); },
  riser(E, out, f, t, dur, v) { const c = E.ctx, n = noiseSrc(E, t, t + dur + 0.1), bp = filt(c, 'bandpass', 300, 2.5), g = gain(c, 0); bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(6000, t + dur); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v * 0.22, t + dur); g.gain.setTargetAtTime(0.0001, t + dur, 0.02); n.connect(bp); bp.connect(g); g.connect(out); },
};
// default octave / reverb send / whether the root folds into one octave (bass instruments)
const DEF = { pad: [3, 0.5], strings: [4, 0.5], choir: [4, 0.7], piano: [4, 0.3], keys: [4, 0.3], bell: [5, 0.6], pluck: [4, 0.25], harp: [4, 0.45], lute: [4, 0.3], marimba: [4, 0.2], bass: [1, 0, 1], sub: [1, 0, 1], synbass: [1, 0, 1], lead: [5, 0.3], flute: [5, 0.5], brass: [3, 0.35], organ: [3, 0.3], kick: [0, 0], snare: [0, 0.12], clap: [0, 0.2], hat: [0, 0], ohat: [0, 0.05], shaker: [0, 0.05], rim: [0, 0.15], tom: [0, 0.2], taiko: [0, 0.35], timpani: [2, 0.4], cymbal: [0, 0.3], riser: [0, 0.2] };
const TRIM = { pad: 0.7, choir: 0.7, organ: 0.65, strings: 0.85, bass: 0.7, sub: 0.7, lute: 0.8, taiko: 0.65, timpani: 0.65, tom: 0.7, kick: 0.85, snare: 0.8, lead: 1.3, brass: 1.4, clap: 1.5, shaker: 1.3, riser: 1.6 }; // level-matching between instruments
const DRUMS = new Set(['kick', 'snare', 'clap', 'hat', 'ohat', 'shaker', 'rim', 'tom', 'taiko', 'cymbal', 'riser']);
export const INSTRUMENTS = Object.keys(INST);

// ---------------------------------------------------------------- engine
function impulse(ctx, sec = 2.6) {
  const n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); let lp = 0; for (let i = 0; i < n; i++) { const k = i / n; lp += ((Math.random() * 2 - 1) - lp) * (0.55 - 0.4 * k); d[i] = lp * (1 - k) ** 2.6 * (i < 400 ? i / 400 : 1); } }
  return b;
}
function parsePat(p) {
  if (Array.isArray(p)) return p.map(String);
  const s = String(p).replace(/\|/g, ' ').trim();
  return /\s/.test(s) ? s.split(/\s+/) : /^[xXo.\-_]+$/.test(s) ? s.split('') : [s];
}
function chordDegrees(c) {
  if (Array.isArray(c)) return c;
  const [r, q] = String(c).split(':'), root = +r;
  return ({ 7: [0, 2, 4, 6], 9: [0, 2, 4, 6, 8], sus: [0, 3, 4], 5: [0, 4], 6: [0, 2, 4, 5], add9: [0, 2, 4, 8] }[q] || [0, 2, 4]).map((d) => root + d);
}

class Engine {
  constructor(ctx, out) {
    this.ctx = ctx;
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; this.noise = nb;
    this.bus = gain(ctx, 0.5); const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -15; comp.knee.value = 12; comp.ratio.value = 3.5; comp.attack.value = 0.008; comp.release.value = 0.25;
    this.bus.connect(comp); comp.connect(out);
    this.duck = gain(ctx, 1); this.duck.connect(this.bus);           // looping tracks pass through the duck gain; stings bypass it
    this.rev = ctx.createConvolver(); this.rev.buffer = impulse(ctx); const rg = gain(ctx, 0.75); this.rev.connect(rg); rg.connect(this.bus);
  }
  midi(T, deg, oct) { const n = T.scale.length; return 12 * (oct + 1) + T.key + T.scale[mod(deg, n)] + 12 * Math.floor(deg / n); }
  start(def, when, fade = 1, dest = this.duck, intensity = 0.5) {
    const c = this.ctx, T = { def, tick: 0, time: when, tempo: 1, key: KEYS[def.key ?? 'C'] ?? 0, scale: SCALES[def.scale ?? 'minor'] || SCALES.minor, g: gain(c, 0), layers: [], nodes: [] };
    T.g.gain.setValueAtTime(0.0001, when); T.g.gain.linearRampToValueAtTime(def.vol ?? 1, when + Math.max(fade, 0.01)); T.g.connect(dest); T.nodes.push(T.g);
    if (def.delay) { const dl = c.createDelay(2), fb = gain(c, def.feedback ?? 0.36), lp = filt(c, 'lowpass', 2600), w = gain(c, 1); dl.delayTime.value = (60 / def.bpm) * (def.delayBeats ?? 0.75); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(w); w.connect(T.g); T.dly = dl; T.nodes.push(dl, fb, lp, w); }
    for (const L of def.layers || []) {
      const d = DEF[L.inst] || [4, 0.3], g = gain(c, this.layerGain(L, intensity)); let tail = g;
      if (L.pan) { const p = c.createStereoPanner(); p.pan.value = L.pan; g.connect(p); tail = p; T.nodes.push(p); }
      tail.connect(T.g);
      const rv = L.rev ?? d[1]; if (rv > 0) { const s = gain(c, rv); tail.connect(s); s.connect(this.rev); T.nodes.push(s); }
      if (T.dly && !DRUMS.has(L.inst) && (L.dly ?? def.delay) > 0) { const s = gain(c, L.dly ?? def.delay); tail.connect(s); s.connect(T.dly); T.nodes.push(s); }
      T.nodes.push(g);
      T.layers.push({ def: L, g, toks: L.pat != null ? parsePat(L.pat) : null, oct: L.octave ?? d[0], fold: L.fold ?? !!d[2], drum: DRUMS.has(L.inst), fn: INST[L.inst] || INST.pluck, trim: TRIM[L.inst] ?? 1 });
    }
    return T;
  }
  layerGain(L, x) { return x >= (L.at ?? 0) && x <= (L.upTo ?? 1) ? (L.vol ?? 1) : 0; }
  setIntensity(T, x, ramp) { const t = this.ctx.currentTime; for (const L of T.layers) L.g.gain.setTargetAtTime(this.layerGain(L.def, x), t, ramp / 3); }
  secPerTick(T) { return 60 / (T.def.bpm * T.tempo) / TPB; }
  ticksTotal(T) { const barT = TPB * (T.def.beats ?? 4); return Math.max(barT, ...T.layers.map((L) => (L.toks ? L.toks.length * (48 / (L.def.div ?? 16)) : 0))); }
  tick(T, t) {
    const d = T.def, barT = TPB * (d.beats ?? 4), prog = d.chords ?? [0], chordLen = barT * (d.barsPerChord ?? 1), spt = this.secPerTick(T);
    const chord = chordDegrees(prog[Math.floor(T.tick / chordLen) % prog.length]), n = T.scale.length;
    for (const L of T.layers) {
      const ld = L.def;
      if (ld.bars && '-.'.includes(ld.bars[Math.floor(T.tick / barT) % ld.bars.length])) continue;
      if (!L.toks) { // sustained pad / drone
        if (T.tick % chordLen) continue;
        const dur = chordLen * spt, centre = 12 * (L.oct + 1) + T.key + 5;
        for (const deg of ld.play === 'root' ? [chord[0]] : chord) {
          let m = this.midi(T, mod(deg, n), L.oct); while (m - centre > 6) m -= 12; while (centre - m > 6) m += 12;
          if (ld.play === 'root') m = this.midi(T, mod(deg, n), L.oct);
          L.fn(this, L.g, mtof(m), t, dur, (ld.vel ?? 0.8) * L.trim, ld);
        }
        continue;
      }
      const st = 48 / (ld.div ?? 16); if (T.tick % st) continue;
      const len = L.toks.length, i = (T.tick / st) % len, tok = L.toks[i];
      if (tok === '.' || tok === '-' || tok === '_') continue;
      if (ld.prob != null && Math.random() > ld.prob) continue;
      let hold = 1; while (hold < len && L.toks[(i + hold) % len] === '_') hold++;
      const sw = d.swing && (T.tick / st) % 2 === 1 && st <= 6 ? d.swing * st * spt : 0;
      const when = t + sw + (L.drum ? 0 : Math.random() * 0.006), dur = st * hold * spt * (ld.gate ?? 0.92);
      if (L.drum) { L.fn(this, L.g, 0, when, dur, (tok === 'X' ? 1.25 : tok === 'o' ? 0.45 : 1) * (0.92 + Math.random() * 0.16) * L.trim, ld); continue; }
      const acc = tok.endsWith('!') ? 1.3 : 1, tk = acc > 1 ? tok.slice(0, -1) : tok, vel = (ld.vel ?? 0.8) * acc * (0.9 + Math.random() * 0.2) * L.trim;
      const degs = tk === 'c' ? chord : tk[0] === 's' ? [+tk.slice(1)] : [chord[mod(+tk, chord.length)] + n * Math.floor(+tk / chord.length)];
      degs.forEach((deg, k) => { if (Number.isNaN(deg)) return; const dg = L.fold && /^-?\d+$/.test(tk) ? mod(deg, n) + n * Math.floor(+tk / chord.length) : deg; L.fn(this, L.g, mtof(this.midi(T, dg, L.oct) + (ld.transpose ?? 0)), when + k * (ld.strum ?? 0.012), dur, vel, ld); });
    }
  }
  /** Schedule a whole one-shot phrase now (stings). Returns its length in seconds. */
  once(def, when, intensity = 1) {
    const d = def.layers ? def : { bpm: def.bpm ?? 120, key: def.key, scale: def.scale, chords: def.chords, layers: [def] };
    const T = this.start({ beats: 4, ...d, vol: d.vol ?? 1 }, when, 0.005, this.bus, intensity), total = d.bars ? d.bars * TPB * (d.beats ?? 4) : this.ticksTotal(T);
    let t = when; for (; T.tick < total; T.tick++) { this.tick(T, t); t += this.secPerTick(T); }
    return { T, len: t - when };
  }
  kill(T, at = 0) { const fn = () => T.nodes.forEach((n) => { try { n.disconnect(); } catch { /* gone */ } }); at > 0 ? setTimeout(fn, at * 1000) : fn(); }
}

// ---------------------------------------------------------------- controller
let gesture = false; const waiters = [];
if (typeof addEventListener === 'function') for (const ev of ['pointerdown', 'keydown', 'touchend']) addEventListener(ev, () => { if (!gesture) { gesture = true; waiters.splice(0).forEach((f) => f()); } }, { passive: true });
const onGesture = (f) => (gesture ? f() : waiters.push(f));
const musicVol = () => Math.max(0, settings.music ?? 0.7);

export function createMusic(score = {}) {
  let E = null, bus = null, cur = null, name = null, level = score.intensity ?? 0.5, tempo = 1, timer = null; const fading = [];
  const boot = () => { if (E) return; const a = audio(); bus = gain(a.ctx, musicVol()); bus.connect(a.master); E = new Engine(a.ctx, bus); timer = setInterval(pump, 30); };
  function pump() {
    const c = E.ctx, now = c.currentTime; bus.gain.setTargetAtTime(document.hidden ? 0 : musicVol(), now, 0.1);
    for (const T of cur ? [cur, ...fading] : [...fading]) {
      if (T.end && now > T.end) { E.kill(T); fading.splice(fading.indexOf(T), 1); continue; }
      if (T.time < now - 0.25) T.time = now + 0.05;                    // tab was throttled: skip ahead rather than burst
      while (T.time < now + 0.2) { if (!T.end || T.time < T.end) E.tick(T, T.time); T.time += E.secPerTick(T); T.tick++; }
    }
  }
  const api = {
    /** Crossfade to a named track (no-op if it is already playing). */
    play(track, { fade = 1.4, restart = false } = {}) {
      if (!score.tracks?.[track]) return api; if (name === track && !restart) return api; name = track;
      onGesture(() => { if (name !== track) return; boot(); const now = E.ctx.currentTime; api._out(fade); cur = E.start(score.tracks[track], now + 0.08, fade, E.duck, level); cur.tempo = tempo; });
      return api;
    },
    _out(fade) { if (!cur) return; const now = E.ctx.currentTime; cur.g.gain.cancelScheduledValues(now); cur.g.gain.setTargetAtTime(0.0001, now, fade / 3); cur.end = now + fade * 1.6; fading.push(cur); cur = null; },
    stop(fade = 1.2) { name = null; if (E) api._out(fade); return api; },
    /** 0..1 — switches layers on/off by their at/upTo thresholds. */
    intensity(x, ramp = 1.2) { level = Math.min(1, Math.max(0, x)); if (cur) E.setIntensity(cur, level, ramp); return api; },
    tempo(mult = 1) { tempo = mult; if (cur) cur.tempo = mult; return api; },
    /** Briefly lower the looping music (stings do this automatically). */
    duck(depth = 0.35, ms = 900) { if (!E) return api; const t = E.ctx.currentTime; E.duck.gain.cancelScheduledValues(t); E.duck.gain.setTargetAtTime(depth, t, 0.03); E.duck.gain.setTargetAtTime(1, t + ms / 1000, 0.3); return api; },
    /** One-shot phrase by name (score.stings) or inline definition. Returns its length in seconds (0 before the first user gesture). */
    sting(s, { duck = 0.4 } = {}) {
      const def = typeof s === 'string' ? score.stings?.[s] : s; if (!def || !gesture || musicVol() <= 0) return 0; boot();
      const { T, len } = E.once(def, E.ctx.currentTime + 0.03); if (duck < 1) api.duck(duck, len * 1000 + 200); E.kill(T, len + 5); return len;
    },
    get playing() { return name; }, get level() { return level; },
  };
  return api;
}

/** Offline render for tests: resolves to an AudioBuffer of `seconds` of a track (or sting when def.layers/inst given). */
export async function renderOffline(def, seconds = 8, { intensity = 0.5, sting = false } = {}) {
  const ctx = new OfflineAudioContext(2, Math.ceil(44100 * seconds), 44100), E = new Engine(ctx, ctx.destination);
  if (sting) E.once(def, 0.05, intensity); else { const T = E.start(def, 0.05, 0.02, E.duck, intensity); while (T.time < seconds) { E.tick(T, T.time); T.time += E.secPerTick(T); T.tick++; } }
  return ctx.startRendering();
}

// ---------------------------------------------------------------- ambience beds
// const amb = createAmbience(); amb.set({ wind: 0.4, birds: 0.3 }); amb.set({ sea: 0.5 }, 3); amb.stop();
// Beds: wind sea rain river fire hum space rumble crowd · events: birds crickets drips gulls crackle
export function createAmbience() {
  let c = null, bus = null, noise = null, timer = null; const beds = {}, levels = {};
  const BED = {
    wind: (g) => { const n = loop(), bp = filt(c, 'bandpass', 520, 0.7); lfo(0.07, 260, bp.frequency); lfo(0.13, 0.35, g.gain, 0.65); n.connect(bp); bp.connect(g); },
    sea: (g) => { const n = loop(), lp = filt(c, 'lowpass', 900, 0.3); lfo(0.1, 0.45, g.gain, 0.55); lfo(0.037, 300, lp.frequency); n.connect(lp); lp.connect(g); },
    rain: (g) => { const n = loop(), hp = filt(c, 'highpass', 2400, 0.4), k = gain(c, 0.5); n.connect(hp); hp.connect(k); k.connect(g); },
    river: (g) => { const n = loop(), bp = filt(c, 'bandpass', 1300, 0.6), k = gain(c, 0.6); lfo(6.3, 0.12, k.gain, 0.6); n.connect(bp); bp.connect(k); k.connect(g); },
    fire: (g) => { const n = loop(), lp = filt(c, 'lowpass', 520, 0.5), k = gain(c, 0.7); lfo(3.1, 0.2, k.gain, 0.7); n.connect(lp); lp.connect(k); k.connect(g); },
    hum: (g) => { for (const [f, a] of [[55, 0.5], [82.6, 0.3], [110.4, 0.16]]) { const o = c.createOscillator(); o.frequency.value = f; const k = gain(c, a); o.connect(k); k.connect(g); o.start(); } },
    space: (g) => { const n = loop(), lp = filt(c, 'lowpass', 170, 0.6); lfo(0.05, 60, lp.frequency); n.connect(lp); lp.connect(g); const o = c.createOscillator(); o.frequency.value = 41; const k = gain(c, 0.35); lfo(0.09, 0.15, k.gain, 0.35); o.connect(k); k.connect(g); o.start(); },
    rumble: (g) => { const n = loop(), lp = filt(c, 'lowpass', 110, 0.8), k = gain(c, 1.6); n.connect(lp); lp.connect(k); k.connect(g); },
    crowd: (g) => { const n = loop(); for (const [f, q, a] of [[520, 1.2, 0.8], [1500, 1.5, 0.35]]) { const bp = filt(c, 'bandpass', f, q), k = gain(c, a); lfo(0.6 + f / 3000, a * 0.4, k.gain, a); n.connect(bp); bp.connect(k); k.connect(g); } },
  };
  const EVENT = {
    birds: (lv) => chance(0.14 * lv) && burst(2 + Math.floor(Math.random() * 4), 0.09, (t, i) => chirp(t, 2400 + Math.random() * 2200, 1.15 + Math.random() * 0.5, 0.07, lv * 0.05)),
    crickets: (lv) => chance(0.3 * lv) && burst(6 + Math.floor(Math.random() * 8), 0.035, (t) => chirp(t, 4300, 1, 0.02, lv * 0.018)),
    drips: (lv) => chance(0.07 * lv) && chirp(c.currentTime + 0.05, 1500 + Math.random() * 900, 0.6, 0.09, lv * 0.06),
    gulls: (lv) => chance(0.05 * lv) && burst(2 + Math.floor(Math.random() * 2), 0.32, (t) => chirp(t, 1900 + Math.random() * 300, 0.62, 0.26, lv * 0.035, 'triangle')),
    crackle: (lv) => chance(0.5 * lv) && burst(1 + Math.floor(Math.random() * 3), 0.03, (t) => { const s = c.createBufferSource(); s.buffer = noise; const hp = filt(c, 'highpass', 2500 + Math.random() * 3000), k = gain(c, lv * (0.03 + Math.random() * 0.06)); s.connect(hp); hp.connect(k); k.connect(bus); s.start(t, Math.random()); s.stop(t + 0.012 + Math.random() * 0.02); }),
  };
  const chance = (p) => Math.random() < p;
  const burst = (n, gap, fn) => { for (let i = 0; i < n; i++) fn(c.currentTime + 0.05 + i * gap * (0.8 + Math.random() * 0.4), i); };
  function chirp(t, f, bend, dur, vol, type = 'sine') { const o = c.createOscillator(), k = gain(c, 0), p = c.createStereoPanner(); o.type = type; p.pan.value = Math.random() * 1.6 - 0.8; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * bend, t + dur); k.gain.setValueAtTime(0.0001, t); k.gain.linearRampToValueAtTime(vol, t + dur * 0.2); k.gain.setTargetAtTime(0.0001, t + dur * 0.5, dur * 0.2); o.connect(k); k.connect(p); p.connect(bus); o.start(t); o.stop(t + dur * 2.5); }
  function loop() { const s = c.createBufferSource(); s.buffer = noise; s.loop = true; s.start(0, Math.random() * 3); return s; }
  function lfo(rate, depth, param, base) { if (base != null) param.value = base; const o = c.createOscillator(), k = gain(c, depth); o.frequency.value = rate * (0.85 + Math.random() * 0.3); o.connect(k); k.connect(param); o.start(); }
  function boot() {
    if (c) return; const a = audio(); c = a.ctx; bus = gain(c, 0.5); bus.connect(a.master);
    noise = c.createBuffer(1, c.sampleRate * 4, c.sampleRate); const d = noise.getChannelData(0); let b = 0; for (let i = 0; i < d.length; i++) { b = (b + 0.04 * (Math.random() * 2 - 1)) / 1.02; d[i] = b * 2.2 + (Math.random() * 2 - 1) * 0.35; } // pinkish
    timer = setInterval(() => { if (document.hidden) return; for (const k in EVENT) if (levels[k] > 0) EVENT[k](levels[k]); }, 250);
  }
  return {
    /** Set the complete mix: anything not named fades out. */
    set(mix = {}, fade = 2) {
      for (const k in levels) if (!(k in mix)) levels[k] = 0; Object.assign(levels, mix);
      onGesture(() => { boot(); const t = c.currentTime; for (const k in BED) { const lv = levels[k] || 0; if (lv > 0 && !beds[k]) { const out = gain(c, 0), g = gain(c, 1); g.connect(out); out.connect(bus); BED[k](g); beds[k] = out; } beds[k]?.gain.setTargetAtTime(lv * 0.5, t, fade / 3); } });
    },
    stop(fade = 1.5) { this.set({}, fade); },
  };
}

// ---------------------------------------------------------------- blip voices ("animalese"): characterful talk without recorded speech
// speak('Tower, this is Wren.', { pitch: 160, radio: true }) → seconds the line lasts. Same text + pitch always sounds the same.
const VOW = { a: [800, 1250], e: [520, 1900], i: [320, 2300], o: [500, 900], u: [350, 780], y: [330, 2100] };
export function speak(text, { pitch = 180, rate = 1, radio = false, vol = 0.22, wave = 'sawtooth' } = {}) {
  if (!gesture || settings.volume <= 0) return 0; const { ctx: c, master } = audio(); let out = gain(c, vol), t = c.currentTime + 0.03, seed = pitch | 0;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) | 0; return ((seed >>> 8) & 0xffff) / 0xffff; };
  if (radio) { const hp = filt(c, 'highpass', 500, 0.7), lp = filt(c, 'lowpass', 2600, 0.7), sh = c.createWaveShaper(), cv = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; cv[i] = Math.tanh(x * 3); } sh.curve = cv; out.connect(hp); hp.connect(sh); sh.connect(lp); lp.connect(master); squelch(c, master, t - 0.02, vol); t += 0.05; } else out.connect(master);
  const syl = 0.075 / rate, start = t, words = String(text).slice(0, 240).toLowerCase(); let fall = 0;
  for (let i = 0; i < words.length; i++) {
    const ch = words[i]; seed = (seed + ch.charCodeAt(0) * 31) | 0;
    if (ch === ' ') { t += syl * 0.55; continue; } if (',;:'.includes(ch)) { t += syl * 1.6; continue; } if ('.!?…'.includes(ch)) { t += syl * 3; fall = 0; continue; }
    const fm = VOW[ch]; if (!fm) { if (/[a-z]/.test(ch) && words[i + 1] && !VOW[words[i + 1]]) t += syl * 0.25; continue; }
    const ask = /^[^.!]*\?/.test(words.slice(i)) && words.indexOf('?', i) - i < 8, f = pitch * (1 + (rnd() - 0.5) * 0.14 - fall + (ask ? 0.16 : 0)); fall = Math.min(fall + 0.012, 0.16);
    const o = c.createOscillator(), g = gain(c, 0); o.type = wave; o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * (ask ? 1.06 : 0.96), t + syl);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(1, t + 0.012); g.gain.setTargetAtTime(0.0001, t + syl * 0.6, 0.02);
    for (const [ff, a] of [[fm[0], 1], [fm[1], 0.5]]) { const bp = filt(c, 'bandpass', ff, 6), k = gain(c, a); o.connect(bp); bp.connect(k); k.connect(g); }
    g.connect(out); o.start(t); o.stop(t + syl + 0.1); t += syl;
  }
  if (radio) squelch(c, master, t + 0.03, vol);
  setTimeout(() => { try { out.disconnect(); } catch { /* gone */ } }, (t - c.currentTime + 1) * 1000);
  return t - start;
}
function squelch(c, dest, t, vol) { const n = c.createBuffer(1, 2205, c.sampleRate), d = n.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = c.createBufferSource(), bp = filt(c, 'bandpass', 2200, 1), g = gain(c, vol * 0.35); s.buffer = n; s.connect(bp); bp.connect(g); g.connect(dest); s.start(Math.max(t, c.currentTime)); }
