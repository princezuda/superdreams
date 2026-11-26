// Emberwake — game SFX on the kit's shared audio graph (kit `voice` + `sfx`). One synth voice per verb, ±10% pitch.
// FABLE: music — town themes (Kindlewick hearth waltz, Saltmere sea shanty), dungeon beds, three boss themes,
// battle theme with a "Break!" stinger layer, overworld travel theme, the Emberwake finale + credits song.
import { sfx, voice } from '/shared/sd-kit.js';

const V = (o) => voice(o);
const TYPE_F = { fire: 300, frost: 900, bolt: 1300, blade: 700, blunt: 160, pierce: 1000 };
export const SFX = {
  cursor: () => V({ type: 'triangle', f0: 1200, f1: 1100, dur: 0.035, vol: 0.06 }),
  confirm: () => V({ type: 'triangle', f0: 700, f1: 1050, dur: 0.08, vol: 0.12 }),
  cancel: () => V({ type: 'triangle', f0: 600, f1: 380, dur: 0.08, vol: 0.1 }),
  error: () => sfx.error(),
  blip: (who) => V({ type: 'square', f0: who === 'bram' ? 180 : who === 'ines' ? 560 : who === 'rook' ? 380 : who === '' ? 300 : 440, dur: 0.03, vol: 0.025, filter: { f0: 1800 } }),
  step: (map) => V({ noise: true, dur: 0.05, vol: map === 'lanternspire' ? 0.05 : 0.035, filter: { type: 'bandpass', f0: map === 'saltmere' || map === 'lanternspire' ? 1800 : 700, q: 1.2 } }),
  talk: () => V({ type: 'sine', f0: 660, f1: 880, dur: 0.07, vol: 0.06 }),
  chest: () => { V({ type: 'triangle', f0: 220, f1: 330, dur: 0.15, vol: 0.15 }); setTimeout(() => sfx.chime(), 140); },
  coin: () => { V({ type: 'square', f0: 1320, dur: 0.05, vol: 0.06 }); setTimeout(() => V({ type: 'square', f0: 1760, dur: 0.12, vol: 0.06 }), 50); },
  equip: () => { V({ noise: true, dur: 0.1, vol: 0.1, filter: { type: 'bandpass', f0: 3500, q: 4 } }); V({ type: 'triangle', f0: 900, f1: 1200, dur: 0.1, vol: 0.08 }); },
  save: () => sfx.check(), heal: () => sfx.magic(), chapter: () => { [0, 7, 12].forEach((s, i) => setTimeout(() => V({ type: 'sine', f0: 330 * 2 ** (s / 12), dur: 1.2, vol: 0.08 }), i * 180)); },
  notice: () => V({ type: 'square', f0: 900, f1: 1400, dur: 0.1, vol: 0.06, filter: { f0: 2500 } }),
  swing: () => sfx.whoosh(), dash: () => V({ noise: true, dur: 0.18, vol: 0.12, filter: { type: 'bandpass', f0: 600, f1: 2400, q: 1.2 }, attack: 0.04 }),
  encounter: () => { V({ type: 'sawtooth', f0: 200, f1: 900, dur: 0.35, vol: 0.1, filter: { f0: 3000 } }); V({ noise: true, dur: 0.4, vol: 0.12, filter: { type: 'bandpass', f0: 4000, f1: 500, q: 1 } }); },
  hit: (weak, type) => { const f = TYPE_F[type] || 500; V({ type: 'square', f0: f, f1: f * 0.4, dur: 0.12, vol: weak ? 0.14 : 0.1, filter: { f0: 3000, f1: 400 } }); V({ noise: true, dur: weak ? 0.2 : 0.12, vol: weak ? 0.2 : 0.14, filter: { type: 'lowpass', f0: 2600, f1: 300 } }); if (weak) setTimeout(() => V({ type: 'triangle', f0: 1600, f1: 2000, dur: 0.08, vol: 0.06 }), 60); },
  great: () => { V({ type: 'triangle', f0: 1568, dur: 0.12, vol: 0.12 }); setTimeout(() => V({ type: 'triangle', f0: 2093, dur: 0.18, vol: 0.1 }), 60); },
  good: () => V({ type: 'triangle', f0: 1175, dur: 0.12, vol: 0.1 }),
  whiff: () => V({ type: 'sine', f0: 260, f1: 200, dur: 0.1, vol: 0.05 }),
  break: () => { V({ noise: true, dur: 0.5, vol: 0.25, filter: { type: 'highpass', f0: 2500, f1: 800 } }); V({ type: 'square', f0: 220, f1: 55, dur: 0.4, vol: 0.14, filter: { f0: 1200 } }); [0, 3, 7].forEach((s, i) => setTimeout(() => V({ type: 'triangle', f0: 880 * 2 ** (s / 12), dur: 0.25, vol: 0.07 }), 120 + i * 50)); },
  boost: (n) => V({ type: 'triangle', f0: 400 + n * 200, f1: 500 + n * 220, dur: 0.1, vol: 0.1 }),
  boostGo: () => { V({ type: 'sawtooth', f0: 300, f1: 1200, dur: 0.3, vol: 0.08, filter: { f0: 2000 } }); },
  cast: (type) => { const f = TYPE_F[type] || 700; V({ type: 'sine', f0: f * 0.5, f1: f * 1.5, dur: 0.4, vol: 0.08 }); V({ noise: true, dur: 0.3, vol: 0.06, filter: { type: 'bandpass', f0: f * 2, q: 3 }, attack: 0.1 }); },
  charge: () => { V({ type: 'sawtooth', f0: 80, f1: 160, dur: 1.0, vol: 0.12, filter: { f0: 400, f1: 900 }, attack: 0.3 }); },
  guard: () => V({ type: 'triangle', f0: 500, f1: 520, dur: 0.15, vol: 0.1 }),
  buff: () => sfx.select(), ko: (side) => (side === 'enemy' ? V({ type: 'sawtooth', f0: 300, f1: 40, dur: 0.5, vol: 0.08, filter: { f0: 1500, f1: 100 } }) : sfx.lose()),
  phase: () => { V({ type: 'sawtooth', f0: 60, f1: 30, dur: 1.4, vol: 0.18, filter: { f0: 600 } }); sfx.suck(); },
  victory: () => sfx.win(), gameover: () => sfx.lose(), inn: () => { [0, 4, 7, 12].forEach((s, i) => setTimeout(() => V({ type: 'sine', f0: 392 * 2 ** (s / 12), dur: 0.6, vol: 0.08 }), i * 260)); },
  door: () => V({ noise: true, dur: 0.25, vol: 0.08, filter: { type: 'lowpass', f0: 600 } }),
  levelup: () => sfx.win(),
};
