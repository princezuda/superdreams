// Pebble Peaks SFX — synthesised on the kit's shared AudioContext (audio()), one voice per verb, ±pitch variance.
// FABLE: music — a bouncy per-world theme (meadow: whistle + ukulele, caves: marimba + reverb, sky: harp + flute,
// forge: low brass + anvil percussion, boss: fast variant), plus a hub waltz; duck under the relic/goal fanfares.
import { audio, settings } from '/shared/sd-kit.js';

let noiseBuf = null, amb = null;
const live = () => navigator.userActivation ? navigator.userActivation.hasBeenActive : true;
let pendingAmb; addEventListener('pointerdown', () => { if (pendingAmb !== undefined) { const k = pendingAmb; pendingAmb = undefined; S.ambience(k); } }, { capture: true }); addEventListener('keydown', () => { if (pendingAmb !== undefined) { const k = pendingAmb; pendingAmb = undefined; S.ambience(k); } }, { capture: true });
function ctx() { if (!live()) return null; const a = audio(); if (!a.ctx || settings.volume <= 0) return null; a.master.gain.value = settings.volume; return a; }
function tone(f0, { f1 = f0, type = 'sine', dur = 0.15, vol = 0.2, at = 0, attack = 0.004, q = 0, lp = 0, vary = 0.08 } = {}) {
  const a = ctx(); if (!a) return; const { ctx: c, master } = a; const t = c.currentTime + at, j = 1 + (Math.random() - 0.5) * vary;
  const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f0 * j, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * j), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let n = o; if (lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; f.Q.value = q; o.connect(f); n = f; }
  n.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}
function hiss({ dur = 0.2, vol = 0.12, f0 = 2000, f1 = 500, q = 1, at = 0, type = 'bandpass' } = {}) {
  const a = ctx(); if (!a) return; const { ctx: c, master } = a; const t = c.currentTime + at;
  if (!noiseBuf) { noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = noiseBuf; f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
export const S = {
  jump() { tone(330, { f1: 620, type: 'square', dur: 0.13, vol: 0.06, lp: 2400 }); tone(660, { f1: 990, dur: 0.1, vol: 0.05 }); },
  double() { tone(520, { f1: 1040, type: 'triangle', dur: 0.16, vol: 0.1 }); hiss({ dur: 0.18, vol: 0.06, f0: 1500, f1: 5000 }); },
  long() { hiss({ dur: 0.32, vol: 0.1, f0: 600, f1: 2600, q: 1.5 }); tone(260, { f1: 520, type: 'triangle', dur: 0.2, vol: 0.08 }); },
  highjump() { tone(300, { f1: 1200, type: 'triangle', dur: 0.3, vol: 0.12 }); hiss({ dur: 0.3, vol: 0.08, f0: 800, f1: 6000 }); },
  land(k = 0.5) { tone(160, { f1: 70, dur: 0.12, vol: 0.12 + k * 0.2 }); hiss({ dur: 0.08, vol: 0.04 + k * 0.08, f0: 1200, f1: 300 }); },
  step(surface = 'ground') { hiss({ dur: 0.04, vol: surface === 'metal' ? 0.05 : 0.025, f0: surface === 'metal' ? 4000 : 1800, f1: 700, q: 2 }); },
  roll() { hiss({ dur: 0.28, vol: 0.12, f0: 300, f1: 1400, q: 1 }); tone(140, { f1: 90, dur: 0.2, vol: 0.08 }); },
  poundStart() { hiss({ dur: 0.18, vol: 0.08, f0: 3000, f1: 800, q: 3 }); tone(700, { f1: 500, type: 'triangle', dur: 0.15, vol: 0.06 }); },
  pound() { tone(120, { f1: 38, dur: 0.35, vol: 0.4 }); hiss({ dur: 0.25, vol: 0.18, f0: 900, f1: 120, type: 'lowpass' }); },
  shard(combo = 0) { const s = PENTA[Math.min(PENTA.length - 1, combo)]; const f = 880 * 2 ** (s / 12); tone(f, { type: 'triangle', dur: 0.18, vol: 0.09, vary: 0.01 }); tone(f * 2, { dur: 0.12, vol: 0.035, at: 0.03, vary: 0.01 }); },
  relic() { [0, 4, 7, 12, 16, 19].forEach((s, i) => tone(523 * 2 ** (s / 12), { type: 'triangle', dur: 0.5, vol: 0.11, at: i * 0.08, vary: 0 })); hiss({ dur: 0.9, vol: 0.05, f0: 4000, f1: 9000, at: 0.1 }); },
  checkpoint() { [0, 7, 12].forEach((s, i) => tone(660 * 2 ** (s / 12), { dur: 0.6, vol: 0.09, at: i * 0.09, vary: 0 })); },
  bop() { tone(220, { f1: 520, type: 'square', dur: 0.12, vol: 0.07, lp: 1800 }); tone(140, { f1: 60, dur: 0.15, vol: 0.18 }); hiss({ dur: 0.1, vol: 0.06, f0: 2500, f1: 600 }); },
  defeat() { tone(900, { f1: 300, type: 'triangle', dur: 0.25, vol: 0.06 }); hiss({ dur: 0.3, vol: 0.07, f0: 6000, f1: 1500 }); },
  hurt() { tone(520, { f1: 220, type: 'square', dur: 0.25, vol: 0.07, lp: 1500 }); tone(300, { f1: 140, type: 'sine', dur: 0.3, vol: 0.12, at: 0.05 }); },
  splash() { hiss({ dur: 0.55, vol: 0.2, f0: 3000, f1: 300, type: 'lowpass' }); tone(400, { f1: 120, dur: 0.3, vol: 0.06 }); },
  sizzle() { hiss({ dur: 0.6, vol: 0.18, f0: 6000, f1: 2000, type: 'highpass' }); tone(200, { f1: 60, dur: 0.4, vol: 0.12 }); },
  crumble() { hiss({ dur: 0.4, vol: 0.08, f0: 1500, f1: 300, q: 0.7 }); tone(90, { f1: 50, dur: 0.3, vol: 0.08 }); },
  creak() { tone(180, { f1: 210, type: 'sawtooth', dur: 0.18, vol: 0.025, lp: 900 }); },
  break() { tone(180, { f1: 60, dur: 0.3, vol: 0.25 }); for (let i = 0; i < 4; i++) hiss({ dur: 0.12, vol: 0.12, f0: 2500 - i * 400, f1: 400, at: i * 0.035, q: 1.5 }); },
  boing(v = 1) { tone(180 * v, { f1: 640 * v, type: 'sine', dur: 0.28, vol: 0.18 }); tone(90 * v, { f1: 300 * v, type: 'triangle', dur: 0.25, vol: 0.08 }); },
  portal() { [0, 5, 9, 12, 17].forEach((s, i) => tone(392 * 2 ** (s / 12), { type: 'triangle', dur: 0.45, vol: 0.09, at: i * 0.06, vary: 0 })); hiss({ dur: 0.8, vol: 0.06, f0: 300, f1: 4000 }); },
  goal() { [0, 4, 7, 12, 7, 12, 16, 19, 24].forEach((s, i) => tone(523 * 2 ** (s / 12), { type: 'triangle', dur: 0.4, vol: 0.12, at: i * 0.11, vary: 0 })); },
  roar() { tone(90, { f1: 55, type: 'sawtooth', dur: 1.2, vol: 0.12, lp: 500 }); hiss({ dur: 1.2, vol: 0.12, f0: 400, f1: 120, q: 2 }); },
  slam() { tone(70, { f1: 30, dur: 0.6, vol: 0.5 }); hiss({ dur: 0.5, vol: 0.25, f0: 700, f1: 80, type: 'lowpass' }); },
  ember() { hiss({ dur: 0.25, vol: 0.12, f0: 3000, f1: 600 }); tone(150, { f1: 60, dur: 0.2, vol: 0.12 }); },
  bossHit() { tone(200, { f1: 90, type: 'square', dur: 0.4, vol: 0.12, lp: 1200 }); tone(600, { f1: 300, type: 'triangle', dur: 0.3, vol: 0.1, at: 0.05 }); hiss({ dur: 0.4, vol: 0.15, f0: 2000, f1: 300 }); },
  clang() { tone(1200, { f1: 1150, type: 'triangle', dur: 0.3, vol: 0.06 }); tone(1800, { f1: 1700, dur: 0.25, vol: 0.04 }); },
  jet() { hiss({ dur: 0.5, vol: 0.06, f0: 900, f1: 400, q: 0.8 }); },
  // ambient bed per world (filtered noise; not music)
  ambience(kind) {
    if (!live()) { pendingAmb = kind; return; }
    const a = ctx(); if (!a) return; const { ctx: c, master } = a;
    if (amb) { try { amb.g.gain.setTargetAtTime(0.0001, c.currentTime, 0.3); const old = amb; setTimeout(() => { try { old.s.stop(); } catch { /* */ } }, 1200); } catch { /* */ } amb = null; }
    if (!kind) return;
    if (!noiseBuf) { noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const s = c.createBufferSource(); s.buffer = noiseBuf; s.loop = true; const f = c.createBiquadFilter(); const g = c.createGain();
    const cfg = { meadow: ['lowpass', 500, 0.025], hub: ['lowpass', 450, 0.02], caves: ['bandpass', 180, 0.05], sky: ['bandpass', 900, 0.022], forge: ['lowpass', 160, 0.07] }[kind] || ['lowpass', 400, 0.02];
    f.type = cfg[0]; f.frequency.value = cfg[1]; f.Q.value = 0.6; g.gain.value = 0.0001; g.gain.setTargetAtTime(cfg[2], c.currentTime, 1.2);
    s.connect(f); f.connect(g); g.connect(master); s.start(); amb = { s, g };
  },
};
