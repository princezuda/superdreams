// Strikepoint — static data: remix defaults, weapons, difficulty, key bindings, loot tiers.
// Everything tunable lives here so remix ("redream") configs and tests read one source of truth.

export const DEFAULTS = {
  time: { dockyard: 'night', village: 'day', plant: 'dusk', island: 'day' },
  enemyCount: 8,
  difficulty: 'regular',
  loadout: { primary: 'ar', secondary: 'pistol' },
  gravity: 1,
  gameSpeed: 1,
  colors: { friendly: '#3cc8ff', enemy: '#ff5a2e', hud: '#ffb02e' },
  building: true,
  rain: true,
};

export const TIMES = ['day', 'dusk', 'night', 'storm'];

// Difficulty: reaction (s before first shot), aim error (deg), damage multiplier to player,
// grenade cooldown (squad, s), flank chance, player regen delay.
export const DIFFICULTY = {
  recruit:  { label: 'Recruit',  reaction: 1.05, aimErr: 4.6, dmg: 0.42, nade: 26, flank: 0.25, regenDelay: 3.0, hp: 0.85, xp: 0.8 },
  regular:  { label: 'Regular',  reaction: 0.72, aimErr: 3.3, dmg: 0.68, nade: 17, flank: 0.5,  regenDelay: 4.0, hp: 1.0,  xp: 1.0 },
  hardened: { label: 'Hardened', reaction: 0.5,  aimErr: 2.4, dmg: 1.0,  nade: 12, flank: 0.7,  regenDelay: 4.6, hp: 1.1,  xp: 1.3 },
  veteran:  { label: 'Veteran',  reaction: 0.34, aimErr: 1.7, dmg: 1.35, nade: 9,  flank: 0.9,  regenDelay: 5.2, hp: 1.2,  xp: 1.7 },
};

// Recoil pattern: deterministic per weapon so players can learn to pull against it.
// Returns [pitchDeg, yawDeg] for shot index i.
export function recoilStep(w, i) {
  const r = w.recoil;
  if (!r.pattern) return [r.v, (((i * 7919) % 13) / 13 - 0.5) * r.h * 2];
  const ramp = Math.min(1, 0.55 + i * 0.09);
  const v = r.v * ramp * (i > 18 ? 0.8 : 1);
  // learnable S-curve: right drift first, then left, small noise
  const yaw = r.h * (Math.sin(i * 0.42 + r.phase) * 0.9 + (((i * 2654435761) >>> 0) % 100 / 100 - 0.5) * 0.35);
  return [v, yaw];
}

export const WEAPONS = {
  ar: {
    id: 'ar', name: 'VK-30 Kestrel', cls: 'Assault Rifle', slot: 'primary', auto: true, rpm: 690,
    dmg: [30, 21], range: [28, 60], head: 1.6, limb: 0.8, pellets: 1, mag: 30, reserve: 150,
    reload: 2.0, reloadEmpty: 2.55, ads: 0.22, adsFov: 52, swap: 0.45,
    spread: { hip: 2.3, ads: 0.08, move: 1.4, air: 3.5, bloom: 0.32, bloomMax: 3.2, decay: 7 },
    recoil: { v: 0.62, h: 0.42, phase: 0.2, pattern: true, recover: 7.5, kick: 1 },
    optic: 'reddot', sound: 'ar', tracerEvery: 2, moveMul: 0.95, xp: 100, cost: 900,
  },
  smg: {
    id: 'smg', name: 'M9 Hornet', cls: 'SMG', slot: 'primary', auto: true, rpm: 920,
    dmg: [25, 15], range: [12, 30], head: 1.4, limb: 0.85, pellets: 1, mag: 32, reserve: 192,
    reload: 1.7, reloadEmpty: 2.15, ads: 0.16, adsFov: 58, swap: 0.35,
    spread: { hip: 1.7, ads: 0.22, move: 0.6, air: 2.0, bloom: 0.22, bloomMax: 2.6, decay: 8 },
    recoil: { v: 0.42, h: 0.5, phase: 1.3, pattern: true, recover: 9, kick: 0.8 },
    optic: 'holo', sound: 'smg', tracerEvery: 3, moveMul: 1.05, xp: 100, cost: 700,
  },
  shotgun: {
    id: 'shotgun', name: 'BR-12 Breaker', cls: 'Shotgun', slot: 'primary', auto: false, pump: true, rpm: 72,
    dmg: [17, 5], range: [7, 20], head: 1.25, limb: 0.9, pellets: 9, mag: 6, reserve: 36,
    reload: 0.48, reloadEmpty: 0.48, perShell: true, ads: 0.2, adsFov: 60, swap: 0.45,
    spread: { hip: 4.2, ads: 3.0, move: 0.5, air: 1.0, bloom: 0, bloomMax: 0, decay: 5, pelletCone: 4.6 },
    recoil: { v: 4.2, h: 1.2, recover: 9, kick: 2.2 },
    optic: 'iron', sound: 'shotgun', tracerEvery: 1, moveMul: 0.97, xp: 100, cost: 800,
  },
  dmr: {
    id: 'dmr', name: 'SR-14 Sentry', cls: 'Marksman Rifle', slot: 'primary', auto: false, rpm: 300,
    dmg: [52, 44], range: [45, 90], head: 2.0, limb: 0.85, pellets: 1, mag: 15, reserve: 75,
    reload: 2.3, reloadEmpty: 2.8, ads: 0.28, adsFov: 26, swap: 0.5,
    spread: { hip: 3.0, ads: 0.03, move: 1.8, air: 4, bloom: 0.6, bloomMax: 2.4, decay: 5 },
    recoil: { v: 1.9, h: 0.6, recover: 8, kick: 1.5 },
    optic: 'scope4', sound: 'dmr', tracerEvery: 1, moveMul: 0.92, xp: 100, cost: 1100,
  },
  sniper: {
    id: 'sniper', name: 'LX-50 Longshot', cls: 'Sniper Rifle', slot: 'primary', auto: false, bolt: true, rpm: 46,
    dmg: [115, 100], range: [80, 160], head: 2.6, limb: 0.9, pellets: 1, mag: 5, reserve: 25,
    reload: 2.8, reloadEmpty: 3.4, ads: 0.34, adsFov: 13, swap: 0.6, scoped: true,
    spread: { hip: 5.0, ads: 0.0, move: 2.5, air: 6, bloom: 0, bloomMax: 0, decay: 4 },
    recoil: { v: 5.2, h: 0.9, recover: 6, kick: 2.4 },
    optic: 'sniper', sound: 'sniper', tracerEvery: 1, moveMul: 0.88, xp: 150, cost: 1400,
  },
  lmg: {
    id: 'lmg', name: 'HX-90 Bulwark', cls: 'Light Machine Gun', slot: 'primary', auto: true, rpm: 640,
    dmg: [32, 24], range: [30, 65], head: 1.5, limb: 0.8, pellets: 1, mag: 90, reserve: 270,
    reload: 4.4, reloadEmpty: 5.0, ads: 0.36, adsFov: 50, swap: 0.65,
    spread: { hip: 3.0, ads: 0.12, move: 2.0, air: 4, bloom: 0.25, bloomMax: 3.0, decay: 6 },
    recoil: { v: 0.5, h: 0.55, phase: 2.2, pattern: true, recover: 6, kick: 1.1 },
    optic: 'reddot', sound: 'lmg', tracerEvery: 2, moveMul: 0.86, xp: 100, cost: 1600,
  },
  pistol: {
    id: 'pistol', name: 'P-21 Wren', cls: 'Pistol', slot: 'secondary', auto: false, rpm: 420,
    dmg: [30, 17], range: [12, 32], head: 1.6, limb: 0.85, pellets: 1, mag: 15, reserve: 60,
    reload: 1.45, reloadEmpty: 1.75, ads: 0.14, adsFov: 60, swap: 0.25,
    spread: { hip: 1.4, ads: 0.12, move: 0.5, air: 1.5, bloom: 0.5, bloomMax: 2.0, decay: 9 },
    recoil: { v: 1.45, h: 0.5, recover: 10, kick: 1.2 },
    optic: 'iron', sound: 'pistol', tracerEvery: 2, moveMul: 1.08, xp: 100, cost: 0,
  },
};
export const PRIMARIES = ['ar', 'smg', 'shotgun', 'dmr', 'sniper', 'lmg'];

export const GRENADES = {
  frag: { fuse: 3.2, radius: 7.5, dmg: 160, throwSpeed: 19 },
  smoke: { fuse: 1.4, radius: 6, duration: 17, throwSpeed: 17 },
};

// Loot tiers (Dropzone): damage multiplier, recoil multiplier, colour.
export const TIERS = [
  { id: 'common', label: 'Common', color: '#b9c0c8', dmg: 1.0, recoil: 1.15 },
  { id: 'uncommon', label: 'Uncommon', color: '#4fd16b', dmg: 1.06, recoil: 1.05 },
  { id: 'rare', label: 'Rare', color: '#3c9bff', dmg: 1.12, recoil: 0.95 },
  { id: 'epic', label: 'Epic', color: '#b357ff', dmg: 1.2, recoil: 0.85 },
  { id: 'legendary', label: 'Legendary', color: '#ffb02e', dmg: 1.3, recoil: 0.75 },
];

export const DEFAULT_KEYS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', sprint: 'ShiftLeft',
  crouch: 'KeyC', reload: 'KeyR', interact: 'KeyF', melee: 'KeyV', frag: 'KeyG', smoke: 'KeyT',
  leanL: 'KeyQ', leanR: 'KeyE', primary: 'Digit1', secondary: 'Digit2', swap: 'KeyX', build: 'KeyB',
  wall: 'KeyZ', floor: 'Digit3', ramp: 'Digit4', scores: 'Tab', pause: 'KeyP',
};
export const KEY_LABELS = {
  forward: 'Move forward', back: 'Move back', left: 'Strafe left', right: 'Strafe right', jump: 'Jump / mantle',
  sprint: 'Sprint (hold breath when scoped)', crouch: 'Crouch / slide', reload: 'Reload', interact: 'Interact / plant / buy',
  melee: 'Melee / salvage', frag: 'Frag grenade (hold to cook)', smoke: 'Smoke grenade', leanL: 'Lean left', leanR: 'Lean right',
  primary: 'Primary weapon', secondary: 'Sidearm', swap: 'Swap weapon', build: 'Build mode (Dropzone)',
  wall: 'Build: wall', floor: 'Build: floor', ramp: 'Build: ramp', scores: 'Scoreboard', pause: 'Pause',
};

export const PREFS_DEFAULT = { sens: 1.0, adsSens: 0.85, fov: 70, invertY: false, toggleAds: false, crosshair: '#ffffff', keys: { ...DEFAULT_KEYS }, aimAssist: true, hitPuffs: true };

export const XP_LEVEL = (xp) => Math.floor(Math.sqrt(xp / 250)) + 1; // level curve: gentle, never gates content
export const RANKS = ['Recruit', 'Private', 'Specialist', 'Corporal', 'Sergeant', 'Staff Sgt', 'Lieutenant', 'Captain', 'Major', 'Colonel', 'Commander'];
