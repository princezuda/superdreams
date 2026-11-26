// Lantern Hold — inline SVG icons (towers, foes, HUD). Original artwork drawn in code.
const svg = (body, vb = '0 0 48 48') => `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;
const eyes = (x1, x2, y, r = 2.6, c = '#ffe27a') => `<circle cx="${x1}" cy="${y}" r="${r}" fill="${c}"/><circle cx="${x2}" cy="${y}" r="${r}" fill="${c}"/>`;

export const TOWER_ICON = {
  archer: svg(`<rect x="15" y="22" width="18" height="20" rx="2" fill="#8d8aa0"/><rect x="13" y="20" width="22" height="4" fill="#5a3a26"/>
    <path d="M10 21 L24 7 L38 21 Z" fill="#3e5fa8"/><rect x="21" y="16" width="6" height="4" fill="#ffe7b0"/>
    <path d="M30 26 q8 8 0 16" stroke="#e8b552" stroke-width="2.2" fill="none"/><line x1="30" y1="26" x2="30" y2="42" stroke="#eee" stroke-width="1"/>`),
  mortar: svg(`<path d="M9 42 L11 26 Q24 18 37 26 L39 42 Z" fill="#9a5a44"/><rect x="9" y="30" width="30" height="3" fill="#555a66"/>
    <rect x="19" y="35" width="10" height="7" rx="2" fill="#ff9a3a"/><path d="M20 22 L28 8 L34 11 L27 24 Z" fill="#4a4752"/><ellipse cx="31" cy="9.5" rx="4" ry="2.5" fill="#ff8a30"/>`),
  prism: svg(`<rect x="12" y="34" width="24" height="8" fill="#6a6680"/><rect x="15" y="26" width="18" height="9" fill="#b0adbf"/>
    <path d="M24 4 L32 16 L24 26 L16 16 Z" fill="#c8a0ff"/><path d="M24 4 L28 16 L24 26 Z" fill="#e8d8ff"/><circle cx="24" cy="16" r="13" fill="none" stroke="#c8a0ff" stroke-opacity=".35" stroke-width="1.5"/>`),
  beacon: svg(`<path d="M17 43 L19 20 L29 20 L31 43 Z" fill="#b0adbf"/><path d="M18 33 L30 33 L30.6 38 L17.4 38 Z" fill="#3e5fa8"/><path d="M18.6 24 L29.4 24 L29.8 28 L18.2 28 Z" fill="#3e5fa8"/>
    <rect x="18" y="12" width="12" height="8" rx="2" fill="#ffe7b0"/><path d="M17 12 L24 5 L31 12 Z" fill="#555a66"/>
    <path d="M4 10 L17 14 M44 10 L31 14 M6 20 L17 17 M42 20 L31 17" stroke="#ffd27a" stroke-width="2" stroke-linecap="round"/>`),
  barracks: svg(`<rect x="9" y="24" width="30" height="17" fill="#d8c9a8"/><path d="M6 25 L24 11 L42 25 Z" fill="#a8443e"/><rect x="20" y="30" width="8" height="11" rx="1" fill="#ffcf7a"/>
    <line x1="40" y1="8" x2="40" y2="24" stroke="#5a3a26" stroke-width="2"/><path d="M40 8 L47 11 L40 14 Z" fill="#3e5fa8"/><circle cx="14" cy="34" r="4" fill="#3e5fa8" stroke="#e8b552" stroke-width="1.2"/>`),
};

const bg = (c = '#3a2a5e') => `<circle cx="24" cy="24" r="22" fill="${c}"/>`;
export const ENEMY_ICON = {
  gloomling: svg(`${bg()}<path d="M12 36 Q10 18 24 17 Q38 18 36 36 Z" fill="#6e58a8"/><path d="M16 20 L13 11 L20 18 Z M32 20 L35 11 L28 18 Z" fill="#2c2148"/>${eyes(19, 29, 27)}`),
  hound: svg(`${bg()}<path d="M8 30 Q12 22 24 23 L33 18 L38 21 L40 26 L33 28 Q30 34 20 33 L12 34 Z" fill="#6e58a8"/><path d="M33 18 L33 12 L36 17 Z" fill="#2c2148"/>
    <rect x="13" y="32" width="3" height="7" fill="#2c2148"/><rect x="26" y="31" width="3" height="8" fill="#2c2148"/><circle cx="36" cy="22.5" r="1.8" fill="#ff9a4a"/>`),
  brute: svg(`${bg()}<ellipse cx="24" cy="28" rx="15" ry="12" fill="#4a3878"/><path d="M8 21 L18 16 L20 24 Z M40 21 L30 16 L28 24 Z" fill="#9ba3b4"/><rect x="15" y="27" width="18" height="9" rx="2" fill="#a3abbc"/>
    ${eyes(20, 28, 22, 2, '#ff5a4a')}`),
  moth: svg(`${bg()}<path d="M24 24 Q8 6 6 22 Q8 34 24 26 Z M24 24 Q40 6 42 22 Q40 34 24 26 Z" fill="#7a5cb8"/><circle cx="13" cy="21" r="3" fill="#bfa0ff"/><circle cx="35" cy="21" r="3" fill="#bfa0ff"/>
    <ellipse cx="24" cy="27" rx="3.5" ry="9" fill="#2c2148"/>${eyes(22.5, 25.5, 20, 1.6, '#8af6ff')}`),
  blob: svg(`${bg()}<circle cx="24" cy="27" r="13" fill="#6e58a8"/><circle cx="33" cy="18" r="5" fill="#8a74c4"/><circle cx="14" cy="20" r="4" fill="#8a74c4"/>${eyes(19, 28, 26, 2.6, '#d4ff6a')}<circle cx="23.5" cy="21" r="1.8" fill="#d4ff6a"/>`),
  mite: svg(`${bg()}<circle cx="24" cy="28" r="9" fill="#6e58a8"/>${eyes(21, 27, 27, 2, '#d4ff6a')}`),
  stalker: svg(`${bg('#2a2046')}<path d="M24 8 Q33 12 33 24 L36 42 L12 42 L15 24 Q15 12 24 8 Z" fill="#3a2e5e" stroke="#7af0ff" stroke-opacity=".5" stroke-dasharray="3 3"/><rect x="18" y="19" width="12" height="2.5" rx="1" fill="#7af0ff"/>`),
  warlock: svg(`${bg()}<path d="M24 9 Q31 12 31 22 L35 42 L13 42 L17 22 Q17 12 24 9 Z" fill="#35285c"/><line x1="37" y1="12" x2="37" y2="42" stroke="#3a2a1e" stroke-width="2"/><circle cx="37" cy="11" r="4" fill="#7dffb0"/>${eyes(21.5, 26.5, 20, 1.5, '#7dffb0')}`),
  boss: svg(`${bg('#2a1430')}<path d="M10 42 Q8 22 24 20 Q40 22 38 42 Z" fill="#4a3878"/><circle cx="24" cy="17" r="8" fill="#2c2148"/><path d="M15 12 L18 4 L21 10 L24 2 L27 10 L30 4 L33 12 Z" fill="#1e1634"/>
    ${eyes(21, 27, 17, 1.8, '#ff7a3a')}<path d="M24 28 L28 33 L24 38 L20 33 Z" fill="#ff6a3a"/>`),
};

export const UI_ICON = {
  heart: svg(`<path d="M24 41 C10 31 5 24 5 16 A9 9 0 0 1 24 12 A9 9 0 0 1 43 16 C43 24 38 31 24 41 Z" fill="#ff6a7a"/>`),
  coin: svg(`<circle cx="24" cy="24" r="17" fill="#e8b552"/><circle cx="24" cy="24" r="12" fill="none" stroke="#fff3c0" stroke-width="2.5"/><path d="M24 16 L27 24 L24 32 L21 24 Z" fill="#fff3c0"/>`),
  wave: svg(`<path d="M6 30 Q12 20 18 30 T30 30 T42 30" stroke="#c8a0ff" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M6 20 Q12 10 18 20 T30 20 T42 20" stroke="#8a74c4" stroke-width="3" fill="none" stroke-linecap="round"/>`),
  pause: svg(`<rect x="14" y="11" width="7" height="26" rx="2" fill="currentColor"/><rect x="27" y="11" width="7" height="26" rx="2" fill="currentColor"/>`),
  sell: svg(`<circle cx="24" cy="24" r="14" fill="#e8b552"/><path d="M24 15 v18 M18 20 h12 M18 28 h12" stroke="#5a3a10" stroke-width="2.5"/>`),
  up: svg(`<path d="M24 8 L38 26 L29 26 L29 40 L19 40 L19 26 L10 26 Z" fill="#6aff9a"/>`),
  target: svg(`<circle cx="24" cy="24" r="15" fill="none" stroke="#ffd27a" stroke-width="3"/><circle cx="24" cy="24" r="7" fill="none" stroke="#ffd27a" stroke-width="3"/><circle cx="24" cy="24" r="2.5" fill="#ffd27a"/>`),
  flag: svg(`<line x1="14" y1="6" x2="14" y2="42" stroke="#d8c9a8" stroke-width="3"/><path d="M15 8 L38 14 L15 22 Z" fill="#3e5fa8"/>`),
  hero: svg(`<circle cx="24" cy="24" r="22" fill="#2f4f8f"/><path d="M12 44 Q12 28 24 28 Q36 28 36 44 Z" fill="#c9a46a"/><circle cx="24" cy="20" r="8" fill="#efcfa8"/><path d="M14 18 Q24 2 34 18 L31 14 Q24 8 17 14 Z" fill="#d8a43a"/>
    <line x1="38" y1="14" x2="38" y2="44" stroke="#5a3a26" stroke-width="2.5"/><rect x="34.5" y="10" width="7" height="8" rx="2" fill="#ffe7b0"/>`),
  dawn: svg(`<circle cx="24" cy="24" r="9" fill="#fff2c8"/>${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<line x1="${24 + Math.cos(a * Math.PI / 180) * 13}" y1="${24 + Math.sin(a * Math.PI / 180) * 13}" x2="${24 + Math.cos(a * Math.PI / 180) * 21}" y2="${24 + Math.sin(a * Math.PI / 180) * 21}" stroke="#ffd27a" stroke-width="3" stroke-linecap="round"/>`).join('')}`),
  star: svg(`<path d="M24 4 L29.5 17.5 L44 18.5 L33 28 L36.5 42.5 L24 34.5 L11.5 42.5 L15 28 L4 18.5 L18.5 17.5 Z" fill="currentColor"/>`),
  speed: (n) => svg(`${Array.from({ length: n }, (_, i) => `<path d="M${10 + i * 10} 12 L${24 + i * 10} 24 L${10 + i * 10} 36 Z" fill="currentColor"/>`).join('')}`),
};
