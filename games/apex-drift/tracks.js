// Apex Drift — track + cup definitions (pure data, node-importable).
// points: [x, z, y, halfWidth?] control points of a closed centripetal Catmull-Rom loop, driven in listed order.
// Coordinates are multiplied by `scale` (xz) — y (elevation, metres) is not scaled.

export const TRACKS = {
  coast: {
    id: 'coast', name: 'Amber Coast', place: 'Cliff road at sunset', laps: 3, scale: 1.45, width: 7.5,
    blurb: 'Sweeping cliff-top bends above a golden sea, a hairpin into the hills and a fast plunge back to the shore.',
    points: [
      [-262, -150, 30, 8.5], [-276, -30, 31], [-298, 95, 33], [-292, 215, 37], [-248, 308, 41], [-172, 338, 45],
      [-118, 296, 48], [-150, 222, 52], [-128, 150, 56], [-66, 124, 58], [-30, 46, 55], [-78, -28, 50],
      [-58, -118, 45], [-92, -214, 39], [-160, -276, 34], [-226, -258, 31],
    ],
    theme: 'coast',
  },
  city: {
    id: 'city', name: 'Lumen City', place: 'Neon downtown at night', laps: 3, scale: 1.5, width: 7.5,
    blurb: 'Right-angle drift corners under neon, a soaring elevated sweeper and a tight harbour chicane.',
    points: [
      [0, -190, 0, 8.5], [0, -20, 0], [0, 150, 0], [12, 214, 0], [70, 228, 0], [176, 228, 0], [228, 200, 1],
      [240, 128, 5], [220, 44, 10], [248, -38, 12], [298, -98, 10], [288, -178, 5], [232, -228, 1.5],
      [152, -230, 0], [112, -188, 0], [66, -246, 0], [26, -280, 0], [2, -250, 0],
    ],
    theme: 'city',
  },
  alpine: {
    id: 'alpine', name: 'Frostpeak Pass', place: 'Alpine switchbacks in the snow', laps: 3, scale: 1.3, width: 7.2,
    blurb: 'Climb snowbound switchbacks to the crest, then descend through pine forest and a frozen valley.',
    points: [
      [0, -250, 6, 8.5], [8, -130, 9], [-18, -18, 15], [16, 74, 22], [92, 118, 30], [196, 128, 39], [238, 96, 45],
      [184, 56, 52], [96, 48, 58], [58, 14, 63], [104, -34, 70], [222, -44, 78], [296, -92, 75], [288, -186, 62],
      [222, -248, 48], [142, -222, 36], [92, -286, 24], [32, -330, 13], [-10, -312, 7],
    ],
    theme: 'alpine',
  },
};

export const TRACK_ORDER = ['coast', 'city', 'alpine'];

// Cups: the Mirror Cup drives every track in reverse with sharper rivals; it unlocks after any Sunset Cup podium.
export const CUPS = {
  sunset: { id: 'sunset', name: 'Sunset Cup', tracks: [['coast', false], ['city', false], ['alpine', false]], skill: 1.0 },
  mirror: { id: 'mirror', name: 'Mirror Cup', tracks: [['alpine', true], ['city', true], ['coast', true]], skill: 1.03 },
};

// Rivals: original drivers, each with a line preference and a personality used by the AI.
export const RIVALS = [
  { name: 'Vex', color: '#2f7bff', bias: -0.25, skill: 1.0, aggro: 0.8 },
  { name: 'Juno', color: '#ffc21a', bias: 0.3, skill: 0.985, aggro: 0.5 },
  { name: 'Kade', color: '#22c38e', bias: -0.4, skill: 0.97, aggro: 0.6 },
  { name: 'Rio', color: '#b04dff', bias: 0.45, skill: 0.955, aggro: 0.9 },
  { name: 'Sable', color: '#eef0f6', bias: 0.0, skill: 0.94, aggro: 0.4 },
];

export const POINTS = [10, 7, 5, 3, 2, 1];
export const trackKey = (id, rev) => id + (rev ? '-rev' : '');
