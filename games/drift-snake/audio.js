// Neon Drift — synth SFX: orb pickups climb a scale with your score, portals whoosh, crashes crunch. Respects kit volume.
// FABLE: driving synthwave bed whose tempo follows snake length; duel stinger per round.
import { settings } from '/shared/sd-kit.js';
let ctx = null, master = null, noise = null;
function ensure() { if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return false; } master = ctx.createGain(); master.connect(ctx.destination); const b = ctx.createBuffer(1, ctx.sampleRate * 0.8, ctx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; noise = b; } if (ctx.state === 'suspended') ctx.resume(); master.gain.value = settings.volume; return settings.volume > 0; }
addEventListener('pointerdown', ensure, { passive: true }); addEventListener('keydown', ensure);
function tone(f, d, v, type = 'sine', at = 0, f1 = f) { const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (f1 !== f) o.frequency.exponentialRampToValueAtTime(f1, t + d); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(g); g.connect(master); o.start(t); o.stop(t + d + 0.05); }
function hiss(d, v, f0, f1, at = 0) { const t = ctx.currentTime + at, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noise; f.type = 'bandpass'; f.Q.value = 1.5; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + d); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d); s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + d + 0.05); }
const SC = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
export const audio = {
  eat(score, gold) { if (!ensure()) return; const f = 440 * 2 ** (SC[score % SC.length] / 12); tone(f, 0.18, 0.12, 'triangle'); tone(f * 1.5, 0.12, 0.05, 'sine', 0.04); if (gold) [0, 4, 7, 12].forEach((s, k) => tone(f * 2 ** (s / 12), 0.25, 0.06, 'triangle', 0.06 * k)); },
  crash() { if (!ensure()) return; tone(220, 0.7, 0.2, 'sawtooth', 0, 40); hiss(0.6, 0.25, 2500, 120); },
  portal() { if (!ensure()) return; tone(200, 0.4, 0.1, 'sine', 0, 1200); hiss(0.4, 0.08, 300, 5000); },
  go() { if (!ensure()) return; tone(330, 0.12, 0.1, 'square'); tone(660, 0.25, 0.1, 'square', 0.12); },
  clear() { if (!ensure()) return; [0, 4, 7, 12, 16].forEach((s, k) => tone(523 * 2 ** (s / 12), 0.4, 0.08, 'triangle', k * 0.08)); },
};
