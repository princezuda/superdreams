// Chess: Worlds — game layer: scene, theming, input, animation, AI orchestration, HUD, save/resume, remix, probe.
import { THREE, Q, createRenderer, createPipeline, autoResize, probe, startLoop, stageLights, dust, tween, ease, updateTweens, shake, applyShake, flash, sfx, loadDream, initUI, startMenu, settingsButton, toast, store, host, settings } from '/shared/sd-kit.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { uv, length, smoothstep, max, abs, float, vec3, sin, time, uniform, mix } from 'three/tsl';
import { Chess, START_FEN, chess960Fen, WHITE, BLACK, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING, VALUE } from './engine.js';
import { THEMES, THEME_IDS, FX_IDS, pieceMaterial, paintBoard, boardMaterial, envScene, BOARD, pieceUniforms } from './themes.js';
import { pieceGeometry } from './pieces.js';
import { buildEnvironment, ENV_IDS } from './world.js';
import { FX, playCapture } from './fx.js';
import { PUZZLES } from './puzzles.js';

const D2R = Math.PI / 180, $ = (s) => document.querySelector(s);
const ENV_OF_THEME = { classic: 'study', space: 'space', galaxy: 'galaxy', scifi: 'grid', fantasy: 'courtyard', magic: 'arcane' };
const GLYPH = { w: ['', '♙', '♘', '♗', '♖', '♕', '♔'], b: ['', '♟', '♞', '♝', '♜', '♛', '♚'] };
const LEVEL_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard', master: 'Master' };

// ------------------------------------------------------------------ remix (dream) config
export const DEFAULTS = {
  theme: 'classic', pieceSet: 'auto', environment: 'auto', captureFx: 'auto',
  variant: 'standard', mode: 'ai', aiLevel: 'medium', playerColor: 'white',
  colors: { ...THEMES.classic.colors },
  showLegal: true, showCoords: true, autoQueen: false,
};
let cfg = await loadDream(DEFAULTS, (live) => { const prev = cfg; cfg = sanitize(live); applyLook(); onLiveConfig(prev); });
const hasDream = Q.has('dream') || Q.has('redream');
if (!hasDream) { const prefs = store.get('chess-prefs'); if (prefs) cfg = sanitize({ ...cfg, ...prefs, colors: { ...cfg.colors } }); }
if (Q.get('theme') && THEMES[Q.get('theme')]) cfg.theme = Q.get('theme');
cfg = sanitize(cfg);
function sanitize(c) {
  const o = { ...DEFAULTS, ...c, colors: { ...DEFAULTS.colors, ...(c.colors || {}) } };
  if (!THEMES[o.theme]) o.theme = 'classic';
  if (o.pieceSet !== 'auto' && !THEMES[o.pieceSet]) o.pieceSet = 'auto';
  if (o.environment !== 'auto' && !THEMES[o.environment] && !ENV_IDS.includes(o.environment)) o.environment = 'auto';
  if (o.captureFx !== 'auto' && !FX_IDS.includes(o.captureFx)) o.captureFx = 'auto';
  if (!['standard', 'chess960'].includes(o.variant)) o.variant = 'standard';
  if (!['ai', 'local', 'puzzle'].includes(o.mode)) o.mode = 'ai';
  if (!LEVEL_LABEL[o.aiLevel]) o.aiLevel = 'medium';
  if (!['white', 'black', 'random'].includes(o.playerColor)) o.playerColor = 'white';
  for (const k of Object.keys(DEFAULTS.colors)) if (!/^#[0-9a-f]{6}$/i.test(o.colors[k] || '')) o.colors[k] = DEFAULTS.colors[k];
  return o;
}
// A colour equal to the schema default means "use the theme's own palette"; anything else is a remix override.
function resolvedColors() { const T = THEMES[cfg.theme], out = {}; for (const k of Object.keys(DEFAULTS.colors)) out[k] = cfg.colors[k] && cfg.colors[k].toLowerCase() !== DEFAULTS.colors[k].toLowerCase() ? cfg.colors[k] : T.colors[k]; return out; }

// ------------------------------------------------------------------ renderer / scene
initUI();
const renderer = await createRenderer({ toneMapping: 'aces', exposure: 1.0 });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 400);
camera.position.set(0, 10, 10);
const controls = new OrbitControls(camera, renderer.domElement);
Object.assign(controls, { enableDamping: true, dampingFactor: 0.08, enablePan: false, minDistance: 6, maxDistance: 42, minPolarAngle: 0.08, maxPolarAngle: 1.32, rotateSpeed: 0.7, zoomSpeed: 0.8 });
controls.target.set(0, -0.2, 0);
controls.addEventListener('start', () => { camTok = null; }); // a user drag cancels any camera tween
const post = createPipeline(renderer, scene, camera, { bloom: { strength: 0.4, radius: 0.45, threshold: 0.85 } });
const rig = stageLights(scene, { shadowSize: 7.5 });
rig.key.shadow.mapSize.set(2048, 2048); rig.key.shadow.camera.far = 50; rig.key.target.position.set(0, 0, 0); scene.add(rig.key.target);
const motes = dust(scene, { count: 40, area: 16, height: 6, size: 0.02, opacity: 0.3 });
const pmrem = new THREE.PMREMGenerator(renderer);
const envCache = new Map();
const fx = new FX(scene);
const P = probe(renderer, { counts: {} });

// board: painted top + rounded base + two capture trays
const boardGroup = new THREE.Group(); scene.add(boardGroup);
const boardTop = new THREE.Mesh(new THREE.PlaneGeometry(BOARD.size, BOARD.size), new THREE.MeshStandardNodeMaterial());
boardTop.rotation.x = -Math.PI / 2; boardTop.receiveShadow = true; boardGroup.add(boardTop);
const boardBase = new THREE.Mesh(new RoundedBoxGeometry(BOARD.size, 0.34, BOARD.size, 3, 0.06), new THREE.MeshStandardNodeMaterial());
boardBase.position.y = -0.172; boardBase.receiveShadow = true; boardBase.castShadow = true; boardGroup.add(boardBase);
const trayGeo = new RoundedBoxGeometry(1.0, 0.24, 8.4, 2, 0.05);
const trays = [new THREE.Mesh(trayGeo, boardBase.material), new THREE.Mesh(trayGeo, boardBase.material)];
trays[0].position.set(5.55, -0.2, 0); trays[1].position.set(-5.55, -0.2, 0);
trays.forEach((t) => { t.receiveShadow = true; boardGroup.add(t); });
const TRAY_Y = -0.08;
const pieceGroup = new THREE.Group(); scene.add(pieceGroup);

// markers & highlights
const markerCol = uniform(new THREE.Color('#ffe2a0')), captureCol = uniform(new THREE.Color('#ff8a5a')), lastCol = uniform(new THREE.Color('#ffd060'));
function markerMat(colNode, shape) {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const q = uv().sub(0.5), r = length(q).mul(2), e = max(abs(q.x), abs(q.y)).mul(2);
  m.colorNode = colNode;
  if (shape === 'dot') m.opacityNode = smoothstep(1.0, 0.75, r).mul(0.85).add(smoothstep(1.0, 0.6, r).mul(0.1));
  else if (shape === 'ring') m.opacityNode = smoothstep(0.78, 0.86, r).mul(smoothstep(1.0, 0.94, r)).mul(0.9);
  else if (shape === 'fill') m.opacityNode = smoothstep(0.55, 1.0, e).mul(0.35).add(0.28);
  else if (shape === 'check') m.opacityNode = smoothstep(1.05, 0.1, r).mul(0.85).mul(sin(time.mul(6)).mul(0.15).add(0.85));
  else if (shape === 'outline') m.opacityNode = smoothstep(0.86, 0.9, e).mul(0.9);
  return m;
}
const flatQuad = (s = 1) => { const g = new THREE.PlaneGeometry(s, s); g.rotateX(-Math.PI / 2); return g; };
const dots = new THREE.InstancedMesh(flatQuad(0.36), markerMat(markerCol.mul(1.25), 'dot'), 64);
const rings = new THREE.InstancedMesh(flatQuad(0.98), markerMat(captureCol.mul(1.3), 'ring'), 32);
const fills = new THREE.InstancedMesh(flatQuad(1), markerMat(lastCol, 'fill'), 6);
const checkHL = new THREE.Mesh(flatQuad(1.25), markerMat(vec3(1.6, 0.12, 0.05), 'check'));
const cursorHL = new THREE.Mesh(flatQuad(1), markerMat(markerCol.mul(1.4), 'outline'));
const hoverHL = new THREE.Mesh(flatQuad(1), markerMat(markerCol.mul(0.9), 'outline'));
for (const m of [dots, rings, fills, checkHL, cursorHL, hoverHL]) { m.position.y = 0.006; m.renderOrder = 2; m.frustumCulled = false; scene.add(m); }
dots.count = rings.count = fills.count = 0; checkHL.visible = cursorHL.visible = hoverHL.visible = false;
let arrow = null;

// ------------------------------------------------------------------ helpers: squares ↔ world
const sqPos = (sq, y = 0) => new THREE.Vector3(sq.charCodeAt(0) - 97 - 3.5, y, 3.5 - (sq.charCodeAt(1) - 49));
const worldSq = (x, z) => { const f = Math.floor(x + 4), r = Math.floor(4 - z); return f >= 0 && f < 8 && r >= 0 && r < 8 ? 'abcdefgh'[f] + (r + 1) : null; };
const facing = (type, color) => (color === WHITE ? Math.PI : 0) + (type === KNIGHT ? 65 * D2R : 0);
const M4 = new THREE.Matrix4();

// ------------------------------------------------------------------ look (theme application, live re-theme)
const look = { theme: null, set: null, env: null, board: null, colorsKey: '', fx: 'dust', mats: [null, null], envObj: null, T: THEMES.classic };
function applyLook() {
  const T = THEMES[cfg.theme], colors = resolvedColors(), ck = JSON.stringify(colors);
  const setTheme = cfg.pieceSet !== 'auto' ? THEMES[cfg.pieceSet] : T;
  const envId = cfg.environment === 'auto' ? T.env : (ENV_IDS.includes(cfg.environment) ? cfg.environment : ENV_OF_THEME[cfg.environment]);
  look.fx = cfg.captureFx === 'auto' ? T.fx : cfg.captureFx;
  look.T = T; look.colors = colors;
  // FABLE: per-world ambient music bed (study piano, space drone, galactic pad, synthwave, lute & wind, arcane chimes), crossfaded here.
  // environment (background, fog, props)
  if (look.env !== envId) {
    look.envObj?.dispose(); scene.backgroundNode = null; scene.fog = null;
    look.envObj = buildEnvironment(envId, scene, THEMES[Object.keys(ENV_OF_THEME).find((k) => ENV_OF_THEME[k] === envId)] || T);
    look.env = envId;
  }
  // board (painted texture + material)
  if (look.board !== T.board || look.colorsKey !== ck || look.coords !== cfg.showCoords) {
    const old = boardTop.material; const tex = paintBoard(T.board, colors, colors.accent, { coords: cfg.showCoords });
    boardTop.material = boardMaterial(T.board, tex); boardTop.material.userData.tex = tex; old.userData.tex?.map.dispose(); old.userData.tex?.emap.dispose(); old.dispose();
    boardBase.material.dispose(); boardBase.material = baseMaterial(T.board, colors); trays.forEach((t) => (t.material = boardBase.material));
    look.board = T.board; look.coords = cfg.showCoords;
  }
  // pieces (geometry set + materials)
  const setChanged = look.set !== setTheme.set, matChanged = setChanged || look.colorsKey !== ck || look.matTheme !== setTheme;
  if (matChanged) {
    const old = look.mats; look.mats = [pieceMaterial(setTheme, 0, colors), pieceMaterial(setTheme, 1, colors)]; look.matTheme = setTheme;
    look.set = setTheme.set;
    for (const m of allPieceMeshes()) { m.material = look.mats[m.userData.color]; if (setChanged) m.geometry = pieceGeometry(look.set, m.userData.type); }
    old.forEach((m) => m?.dispose());
  }
  look.colorsKey = ck;
  // lights, environment map, tone, bloom, marker colours
  const L = T.lights;
  rig.hemi.color.set(L.sky); rig.hemi.groundColor.set(L.ground); rig.hemi.intensity = L.hemi;
  rig.key.color.set(L.key); rig.key.intensity = L.keyI; rig.key.position.set(...L.keyPos);
  rig.rim.color.set(L.rim); rig.rim.intensity = L.rimI; rig.rim.position.set(...(L.rimPos || [-7, 5, -8])); rig.amb.intensity = L.amb;
  if (!envCache.has(cfg.theme)) envCache.set(cfg.theme, pmrem.fromScene(envScene(T.envMap), 0.04).texture);
  scene.environment = envCache.get(cfg.theme); scene.environmentIntensity = T.envI;
  renderer.toneMapping = T.tone === 'agx' ? THREE.AgXToneMapping : THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = T.exposure;
  if (post.bloomNode) { post.bloomNode.strength.value = T.bloom.strength; post.bloomNode.radius.value = T.bloom.radius; post.bloomNode.threshold.value = T.bloom.threshold; }
  markerCol.value.set(T.marker); captureCol.value.set(T.capture); lastCol.value.set(T.last); pieceUniforms.mark.value.set(T.marker);
  motes.mesh.material.color.set(cfg.theme === 'classic' || cfg.theme === 'fantasy' ? '#ffd9a8' : T.glow[0]);
  document.documentElement.style.setProperty('--accent', T.marker);
  document.body.dataset.theme = cfg.theme;
  $('#theme-name') && ($('#theme-name').textContent = T.label);
  P.counts = { pieces: meshes.size, theme: cfg.theme, set: look.set, env: look.env };
}
function baseMaterial(style, colors) {
  const c = { wood: '#2e170c', deck: '#232a38', nebula: '#0b0818', grid: '#06080e', stone: '#5a524a', arcane: '#140b26' }[style];
  const m = new THREE.MeshPhysicalNodeMaterial({ color: c, roughness: style === 'stone' ? 0.9 : 0.35, metalness: style === 'deck' || style === 'grid' ? 0.7 : 0.1, clearcoat: style === 'wood' || style === 'nebula' || style === 'arcane' ? 0.8 : 0 });
  if (style !== 'wood' && style !== 'stone') m.emissiveNode = vec3(...new THREE.Color(colors.accent).toArray()).mul(abs(uv().y.sub(0.5)).greaterThan(0.47).select(float(0.9), float(0)));
  return m;
}

// ------------------------------------------------------------------ pieces
const meshes = new Map(); // square → mesh
const trayMeshes = [];
function allPieceMeshes() { return [...meshes.values(), ...trayMeshes]; }
function makePiece(type, color) {
  const m = new THREE.Mesh(pieceGeometry(look.set, type), look.mats[color]);
  m.castShadow = true; m.receiveShadow = true;
  m.userData = { type, color, sel: 0, hov: 0, chk: 0 };
  m.rotation.y = facing(type, color);
  pieceGroup.add(m); return m;
}
function clearPieces() { for (const m of allPieceMeshes()) pieceGroup.remove(m); meshes.clear(); trayMeshes.length = 0; }
function traySlot(capturedColor, i) { // pieces captured BY white sit on white's right; BY black on the left
  const byWhite = capturedColor === BLACK, col = Math.floor(i / 15), row = i % 15, sx = byWhite ? 1 : -1;
  return new THREE.Vector3(sx * (5.42 + col * 0.32), TRAY_Y, byWhite ? 3.75 - row * 0.535 : -3.75 + row * 0.535);
}
function syncPieces() {
  clearPieces();
  for (const p of G.chess.pieces()) { const m = makePiece(p.type, p.color); m.position.copy(sqPos(p.sq)); meshes.set(p.sq, m); }
  const counts = [0, 0];
  for (const c of G.captured) { const m = makePiece(c.type, c.color); m.position.copy(traySlot(c.color, counts[c.color]++)); m.scale.setScalar(0.6); trayMeshes.push(m); }
  P.counts = { ...P.counts, pieces: meshes.size, captured: trayMeshes.length };
}

// ------------------------------------------------------------------ game state
const G = { chess: new Chess(), startFen: START_FEN, ucis: [], captured: [], human: [true, false], started: false, over: null, busy: false, thinking: false, paused: false, selected: null, targets: new Map(), lastMove: null, puzzle: null, replaying: false, aiToken: 0, cursor: null, kb: false, flipped: false, pendingAI: null, hintShown: false };
function newGame(o = {}, resume = null) {
  cancelAI(); hideModal('#end'); hideModal('#promo'); hideHint(); clearSelection();
  const mode = o.mode || cfg.mode;
  G.puzzle = null;
  let fen = START_FEN;
  if (resume) fen = resume.startFen;
  else if (mode === 'puzzle') { const idx = o.puzzleIndex ?? store.get('chess-puzzle', 0) % PUZZLES.length; G.puzzle = { idx, stage: 0, solved: false }; fen = PUZZLES[idx].fen; }
  else if ((o.variant || cfg.variant) === 'chess960') fen = chess960Fen(o.n960 ?? Math.floor(Math.random() * 960));
  if (resume && resume.puzzle != null) G.puzzle = { idx: resume.puzzle, stage: resume.ucis.length ? 1 : 0, solved: false };
  G.gid = (G.gid || 0) + 1; G.t0 = Date.now(); G.busy = false; moveChain = Promise.resolve();
  G.chess = new Chess(fen); G.startFen = fen; G.ucis = []; G.captured = []; G.over = null; G.lastMove = null; G.replaying = false;
  G.mode = mode;
  let pc = o.playerColor || cfg.playerColor; if (pc === 'random') pc = Math.random() < 0.5 ? 'white' : 'black';
  G.playerColor = mode === 'puzzle' ? G.chess.turn : (pc === 'black' ? BLACK : WHITE);
  G.human = mode === 'local' ? [true, true] : [G.playerColor === WHITE, G.playerColor === BLACK];
  G.level = o.aiLevel || cfg.aiLevel;
  if (o.aiVsAi) G.human = [false, false];
  if (resume) { for (const u of resume.ucis) { const d = G.chess.move(u); if (!d) break; G.ucis.push(u); if (d.captured) G.captured.push({ type: d.captured, color: d.color ^ 1 }); G.lastMove = d; } }
  syncPieces(); G.started = true; G.status = G.chess.status();
  G.cursor = G.playerColor === WHITE ? 'e2' : 'e7';
  updateHighlights(); updateHUD(); renderMoves(); updatePuzzlePanel();
  document.body.classList.add('playing'); applyViewOffset(); homeCamera(true);
  if (G.status.over) endGame(G.status, true);
  else { saveGame(); maybeAI(); }
  if (!resume && fen !== START_FEN && !G.puzzle) toast(`Chess960 · position ${chess960Index(fen)}`, 2600);
  if (G.puzzle) toast(`Puzzle ${G.puzzle.idx + 1}/${PUZZLES.length} · ${PUZZLES[G.puzzle.idx].name} — White mates in 2`, 3200);
  coach('start');
  host('start', { mode, variant: cfg.variant, theme: cfg.theme });
}
function chess960Index(fen) { for (let i = 0; i < 960; i++) if (chess960Fen(i).split(' ')[0] === fen.split(' ')[0]) return '#' + i; return ''; }

// ------------------------------------------------------------------ AI worker
let worker = null, reqId = 0; const pending = new Map();
function ai(level) {
  if (!worker) {
    worker = new Worker(new URL('./ai-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => { const r = pending.get(e.data.id); if (r) { pending.delete(e.data.id); e.data.error ? r.rej(new Error(e.data.error)) : r.res(e.data); } };
    worker.onerror = (e) => { P.errors.push('worker: ' + e.message); pending.forEach((r) => r.rej(new Error('worker error'))); pending.clear(); };
  }
  const id = ++reqId;
  return new Promise((res, rej) => { pending.set(id, { res, rej }); worker.postMessage({ id, startFen: G.startFen, moves: G.ucis, level }); });
}
function cancelAI() { G.aiToken++; G.thinking = false; }
async function maybeAI() {
  if (!G.started || G.over || G.replaying || G.busy || G.thinking || G.loading) return;
  if (G.human[G.chess.turn]) return;
  const token = ++G.aiToken, t0 = performance.now();
  G.thinking = true; updateHUD();
  let r;
  try { r = await ai(G.puzzle ? 'hard' : G.level); } catch (e) { G.thinking = false; updateHUD(); P.errors.push(String(e)); return; }
  const wait = 520 - (performance.now() - t0); if (wait > 0) await new Promise((ok) => setTimeout(ok, wait));
  if (token !== G.aiToken) return;
  G.thinking = false;
  if (G.paused) { G.pendingAI = r.uci; updateHUD(); return; }
  if (r.uci) await playMove(r.uci);
}

// ------------------------------------------------------------------ moves + animation
let moveChain = Promise.resolve();
function queueMove(input) { moveChain = moveChain.then(() => playMove(input)).catch((e) => P.errors.push(String(e))); return moveChain; }
async function playMove(input, { animate = true, replay = false } = {}) {
  if (G.over && !replay) return null;
  const d = G.chess.move(input); if (!d) return null;
  G.ucis.push(d.uci);
  if (d.captured) G.captured.push({ type: d.captured, color: d.color ^ 1 });
  clearSelection(); hideHint(); coach('moved');
  G.busy = true; updateHUD();
  const gid = G.gid;
  try { await animateMove(d, !animate ? 0 : settings.reducedMotion ? 2.5 : 1); } finally { if (gid === G.gid) G.busy = false; }
  if (gid !== G.gid) return null; // a new game started while this move was animating
  G.lastMove = d; G.status = G.chess.status();
  updateHighlights(); renderMoves(); updateHUD();
  if (replay) return d;
  if (G.status.over) { endGame(G.status); return d; }
  if (G.status.check) { sfx.check(); } // FABLE: world-specific check sting + pulse across the board
  saveGame();
  if (G.puzzle && !puzzleProgress(d)) return d;
  maybeAI();
  return d;
}

// FABLE: per-piece move personality (knight rears before the hop, ships bank, dragons flap, wizards glide on a rune trail).
function slide(mesh, to, { dur = 0.4, hop = 0.1, delay = 0, tilt = 0 } = {}) {
  const from = mesh.position.clone(), r0 = mesh.rotation.x;
  return tween(dur, (k) => {
    mesh.position.lerpVectors(from, to, k);
    mesh.position.y = from.y + (to.y - from.y) * k + hop * 4 * k * (1 - k);
    if (tilt) mesh.rotation.x = r0 + Math.sin(k * Math.PI) * tilt;
  }, { ease: ease.inOutCubic, delay });
}
function squash(mesh, amt = 0.16) {
  const sx = mesh.scale.x;
  return tween(0.28, (k, raw) => { const s = 1 - amt * (1 - k); mesh.scale.set(sx * (1 + (1 - s) * 0.6), sx * s, sx * (1 + (1 - s) * 0.6)); }, { ease: ease.outBack });
}
async function animateMove(d, speed) {
  const mover = meshes.get(d.from), victim = d.captured ? meshes.get(d.capSq) : null;
  const rook = d.castle ? meshes.get(d.rookFrom) : null;
  meshes.delete(d.from); if (victim) meshes.delete(d.capSq); if (rook) meshes.delete(d.rookFrom);
  const dest = d.castle ? d.kingTo : d.to;
  meshes.set(dest, mover); if (rook) meshes.set(d.rookTo, rook);
  if (!mover) return;
  mover.userData.sel = 0; mover.userData.hov = 0;
  const toPos = sqPos(dest);
  if (!speed) {
    mover.position.copy(toPos); mover.scale.setScalar(1); if (rook) rook.position.copy(sqPos(d.rookTo));
    if (victim) sendToTray(victim, false);
    if (d.promotion) promoteMesh(mover, d.promotion, false);
    return;
  }
  const dist = mover.position.distanceTo(toPos), knight = mover.userData.type === KNIGHT;
  const dur = Math.min(0.75, 0.3 + dist * 0.06) / speed;
  const hop = knight ? 0.85 : dist > 1.6 ? 0.18 : 0.1;
  if (knight || dist > 2.8) sfx.whoosh();
  if (d.castle) {
    await Promise.all([slide(mover, toPos, { dur: dur * 1.1, hop: 0.35 }), slide(rook, sqPos(d.rookTo), { dur: dur * 1.1, hop: 0.75, delay: 0.08 / speed })]);
    sfx.move(); squash(mover); squash(rook);
    return;
  }
  if (victim) {
    // approach, strike, then finish the move once the victim's effect has played
    const approach = mover.position.clone().lerp(toPos, dist > 1.2 ? 0.6 : 0.35);
    await slide(mover, approach, { dur: dur * 0.6, hop: hop * 0.6, tilt: knight ? -0.25 : 0 });
    const { body, glow } = { body: look.colors[victim.userData.color ? 'blackPieces' : 'whitePieces'], glow: look.matTheme.glow[victim.userData.color] };
    const fxDone = speed >= 1 ? playCapture(look.fx, fx, victim, { body, glow, accent: look.colors.accent }) : Promise.resolve();
    await new Promise((ok) => setTimeout(ok, 180 / speed));
    await slide(mover, toPos, { dur: dur * 0.5, hop: hop * 0.5 });
    sfx.thud(); squash(mover, 0.2);
    await fxDone;
    sendToTray(victim, true);
  } else {
    await slide(mover, toPos, { dur, hop, tilt: knight ? -0.22 : 0 });
    sfx.move(); squash(mover);
  }
  if (d.promotion) await promoteMesh(mover, d.promotion, true);
}
function sendToTray(m, animate) {
  const color = m.userData.color, i = trayMeshes.filter((t) => t.userData.color === color).length;
  trayMeshes.push(m);
  m.rotation.set(0, facing(m.userData.type, color), 0); m.position.copy(traySlot(color, i)); m.userData.sel = m.userData.hov = m.userData.chk = 0;
  if (!animate) { m.scale.setScalar(0.6); return; }
  m.scale.setScalar(0.001);
  tween(0.35, (k) => m.scale.setScalar(0.001 + k * 0.6), { ease: ease.outBack });
}
async function promoteMesh(mesh, type, animate) {
  // FABLE: promotion transformation (pawn ascends, light column, new piece materialises with theme flourish)
  if (animate) { // pawn rises into a column of light, then the new piece morphs out of it
    const col = new THREE.Color(look.T.marker); fx.flashCol.value.copy(col).multiplyScalar(2.5); fx.flashMesh.visible = true; fx.flashMesh.position.set(mesh.position.x, 1.0, mesh.position.z);
    sfx.magic(); flash('rgba(255,240,200,.25)', 220);
    await tween(0.3, (k) => { mesh.scale.set(1 - k * 0.6, 1 + k * 0.4, 1 - k * 0.6); mesh.position.y = k * 0.35; fx.flashMesh.scale.set(0.12 + k * 0.1, 0.2 + k * 1.2, 0.12 + k * 0.1); }, { ease: ease.inQuad });
    await tween(0.12, (k) => mesh.scale.setScalar(Math.max(0.02, 0.6 * (1 - k))));
  }
  mesh.geometry = pieceGeometry(look.set, type); mesh.userData.type = type; mesh.rotation.y = facing(type, mesh.userData.color);
  if (!animate) { mesh.scale.setScalar(1); return; }
  sfx.chime(); fx.ring.visible = true; fx.ring.position.set(mesh.position.x, 0.03, mesh.position.z); fx.ringCol.value.set(look.T.marker).multiplyScalar(2.5);
  await tween(0.45, (k) => { mesh.scale.setScalar(0.05 + k * 0.95); mesh.position.y = 0.35 * (1 - k); fx.ring.scale.setScalar(0.4 + k * 1.4); fx.ringCol.value.set(look.T.marker).multiplyScalar(2.5 * (1 - k)); fx.flashMesh.scale.set(0.22 * (1 - k) + 0.01, 1.4 * (1 - k) + 0.01, 0.22 * (1 - k) + 0.01); fx.flashCol.value.set(look.T.marker).multiplyScalar(2.5 * (1 - k)); }, { ease: ease.outBack });
  fx.ring.visible = false; fx.flashMesh.visible = false; squash(mesh, 0.2);
}

// ------------------------------------------------------------------ selection, markers, highlights
function legalFrom(sq) {
  const legal = G.chess.legal(), out = new Map();
  const ds = legal.map((m) => G.chess.describe(m, legal)).filter((d) => d.from === sq);
  for (const d of ds) if (!d.castle) { if (!out.has(d.to)) out.set(d.to, []); out.get(d.to).push(d); }
  for (const d of ds) if (d.castle) { if (!out.has(d.kingTo)) out.set(d.kingTo, [d]); out.set(d.rookFrom, [d]); }
  return out;
}
function select(sq) {
  clearSelection(false);
  const m = meshes.get(sq); if (!m) return;
  G.targets = legalFrom(sq);
  if (!G.targets.size) { sfx.error(); tween(0.3, (k) => (m.rotation.z = Math.sin(k * Math.PI * 4) * 0.08 * (1 - k))); toast("That piece can't move right now", 1400); return; }
  G.selected = sq; m.userData.sel = 1; sfx.select(); coach('selected');
  tween(0.2, (k) => (m.position.y = k * 0.22), { ease: ease.outCubic });
  updateHighlights();
}
function clearSelection(update = true) {
  if (G.selected) { const m = meshes.get(G.selected); if (m) { m.userData.sel = 0; const y0 = m.position.y; tween(0.15, (k) => (m.position.y = y0 * (1 - k))); } }
  G.selected = null; G.targets = new Map(); if (update) updateHighlights();
}
function updateHighlights() {
  let nd = 0, nr = 0, nf = 0;
  if (G.selected && cfg.showLegal) for (const [sq, ds] of G.targets) {
    const p = sqPos(sq); const cap = ds.some((d) => d.captured) && !ds[0].castle;
    if (cap) { M4.makeTranslation(p.x, 0, p.z); rings.setMatrixAt(nr++, M4); } else { M4.makeTranslation(p.x, 0, p.z); dots.setMatrixAt(nd++, M4); }
  }
  const fillSq = [];
  if (G.lastMove) fillSq.push(G.lastMove.from, G.lastMove.castle ? G.lastMove.kingTo : G.lastMove.to);
  if (G.selected) fillSq.push(G.selected);
  for (const sq of fillSq) { const p = sqPos(sq); M4.makeTranslation(p.x, 0, p.z); fills.setMatrixAt(nf++, M4); }
  dots.count = nd; rings.count = nr; fills.count = nf;
  dots.instanceMatrix.needsUpdate = rings.instanceMatrix.needsUpdate = fills.instanceMatrix.needsUpdate = true;
  // check glow on the king in check
  for (const m of meshes.values()) m.userData.chk = 0;
  checkHL.visible = false;
  if (G.started && G.chess.inCheck()) {
    const k = [...meshes.entries()].find(([, m]) => m.userData.type === KING && m.userData.color === G.chess.turn);
    if (k) { k[1].userData.chk = 1; checkHL.visible = true; checkHL.position.copy(sqPos(k[0], 0.007)); }
  }
  cursorHL.visible = G.kb && !!G.cursor && G.started && !G.over; if (G.cursor) cursorHL.position.copy(sqPos(G.cursor, 0.008));
}
function onSquare(sq) {
  if (!sq || !G.started || G.replaying || G.paused) return;
  if (G.over) { showModal('#end'); return; }
  if (G.busy || G.thinking || !G.human[G.chess.turn]) { sfx.error(); if (G.thinking) toast('The AI is thinking…', 900); return; }
  if (G.selected) {
    const ds = G.targets.get(sq);
    if (ds) return commit(ds);
    if (sq === G.selected) { sfx.click(); clearSelection(); return; }
  }
  const p = G.chess.pieceAt(sq);
  if (p && p.color === G.chess.turn) { select(sq); return; }
  if (G.selected) { sfx.click(); clearSelection(); }
}
function commit(ds) {
  if (ds.length > 1 && ds[0].promotion) {
    if (cfg.autoQueen) return queueMove(ds.find((d) => d.promotion === QUEEN).uci);
    return askPromotion(ds);
  }
  queueMove(ds[0].uci);
}
function askPromotion(ds) {
  const color = ds[0].color ? 'b' : 'w', box = $('#promo-choices'); box.innerHTML = '';
  for (const t of [QUEEN, ROOK, BISHOP, KNIGHT]) {
    const d = ds.find((x) => x.promotion === t); if (!d) continue;
    const b = document.createElement('button'); b.className = 'sd-btn promo-btn'; b.innerHTML = `<span>${GLYPH[color][t]}</span><small>${['', '', 'Knight', 'Bishop', 'Rook', 'Queen'][t]}</small>`;
    b.onclick = () => { hideModal('#promo'); sfx.select(); queueMove(d.uci); };
    box.appendChild(b);
  }
  showModal('#promo'); box.querySelector('button')?.focus();
}

// ------------------------------------------------------------------ hint arrow
function showHint(from, to) {
  hideHint();
  const a = sqPos(from), b = sqPos(to), len = a.distanceTo(b);
  const s = new THREE.Shape(); const w = 0.09, hw = 0.26, hl = 0.36, L = Math.max(0.2, len - 0.25);
  s.moveTo(-w, 0.12); s.lineTo(w, 0.12); s.lineTo(w, L - hl); s.lineTo(hw, L - hl); s.lineTo(0, L); s.lineTo(-hw, L - hl); s.lineTo(-w, L - hl); s.closePath();
  const g = new THREE.ShapeGeometry(s); g.rotateX(Math.PI / 2);
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, color: new THREE.Color(look.T.marker).multiplyScalar(1.6) });
  m.opacityNode = sin(time.mul(4)).mul(0.15).add(0.75);
  arrow = new THREE.Mesh(g, m); arrow.position.set(a.x, 0.05, a.z); arrow.rotation.y = Math.atan2(b.x - a.x, b.z - a.z); arrow.renderOrder = 3; scene.add(arrow);
  G.hintShown = true;
}
function hideHint() { if (arrow) { scene.remove(arrow); arrow.geometry.dispose(); arrow.material.dispose(); arrow = null; } G.hintShown = false; }
async function hint() {
  if (!G.started || G.over || G.busy || G.thinking || !G.human[G.chess.turn]) { sfx.error(); return; }
  if (G.puzzle && G.puzzle.stage === 0) { const pz = PUZZLES[G.puzzle.idx]; toast(pz.hint, 3500); }
  sfx.magic(); $('#btn-hint').classList.add('busy');
  try {
    const r = await ai('hint');
    if (r.uci && G.human[G.chess.turn]) { const d = G.chess.move(r.uci); G.chess.undo(); if (d) { showHint(d.from, d.castle ? d.kingTo : d.to); toast(`Hint: ${r.san}  (${r.scoreText})`, 2600); } }
  } finally { $('#btn-hint').classList.remove('busy'); }
}

// ------------------------------------------------------------------ undo / flip / end / replay
function undo() {
  if (!G.started || G.replaying || G.busy) { sfx.error(); return; }
  cancelAI();
  let n = G.mode === 'local' ? 1 : (G.human[G.chess.turn] ? 2 : 1);
  if (G.puzzle) n = G.chess.ply;
  n = Math.min(n, G.chess.ply);
  if (!n) { sfx.error(); toast('Nothing to undo', 1200); return; }
  for (let i = 0; i < n; i++) { const m = G.chess.undo(); G.ucis.pop(); recountCaptured(); }
  G.over = null; hideModal('#end'); hideHint(); clearSelection(false);
  if (G.puzzle) G.puzzle.stage = 0;
  G.lastMove = null;
  if (G.chess.ply) { const replayer = new Chess(G.startFen); let last = null; for (const u of G.ucis) last = replayer.move(u); G.lastMove = last; }
  syncPieces(); G.status = G.chess.status(); updateHighlights(); updateHUD(); renderMoves(); saveGame();
  sfx.whoosh(); maybeAI();
}
function recountCaptured() { const c = new Chess(G.startFen); G.captured = []; for (const u of G.ucis) { const d = c.move(u); if (d?.captured) G.captured.push({ type: d.captured, color: d.color ^ 1 }); } }
function flip() { G.flipped = !G.flipped; homeCamera(true); sfx.whoosh(); updateHUD(); }
function endGame(st, silent = false) {
  G.over = st; cancelAI(); clearSelection(); saveGame();
  const youWin = G.mode === 'ai' && st.winner === G.playerColor, youLose = G.mode === 'ai' && st.winner === (G.playerColor ^ 1);
  let title = st.reason === 'checkmate' ? 'Checkmate!' : st.reason === 'stalemate' ? 'Stalemate' : 'Draw';
  let sub = st.winner === WHITE ? 'White wins' : st.winner === BLACK ? 'Black wins' : 'Honours even';
  if (G.mode === 'ai') sub = youWin ? 'You win!' : youLose ? `The AI (${LEVEL_LABEL[G.level]}) wins` : 'A hard-fought draw';
  if (G.puzzle) { title = st.reason === 'checkmate' && st.winner === WHITE ? 'Puzzle solved!' : 'Not quite'; sub = PUZZLES[G.puzzle.idx].name; }
  $('#end-title').textContent = title;
  $('#end-sub').textContent = sub;
  $('#end-reason').textContent = st.reason === 'checkmate' ? `by checkmate in ${Math.ceil(G.chess.ply / 2)} moves` : `by ${st.reason}`;
  $('#end-crest').textContent = st.winner === WHITE ? '♔' : st.winner === BLACK ? '♚' : '½';
  $('#end-score').textContent = st.result === '1/2-1/2' ? '½–½' : st.result.replace('-', '–');
  $('#st-moves').textContent = Math.ceil(G.chess.ply / 2); $('#st-caps').textContent = G.captured.length;
  const secs = Math.round((Date.now() - (G.t0 || Date.now())) / 1000); $('#st-time').textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  $('#end-next').hidden = !G.puzzle; $('#end-rematch').hidden = !!G.puzzle;
  if (!silent) {
    if (st.reason === 'checkmate') {
      const k = [...meshes.values()].find((m) => m.userData.type === KING && m.userData.color === (st.winner ^ 1));
      // FABLE: victory/defeat sequence — the mated king topples in slow motion, camera orbit, theme fanfare.
      if (k) tween(0.9, (t) => { k.rotation.z = t * 1.35; k.position.y = Math.sin(t * Math.PI) * 0.15; }, { ease: ease.inQuad, delay: 0.25 });
      shake(0.12);
    }
    if (G.puzzle && st.winner === WHITE) { store.set('chess-puzzle', (G.puzzle.idx + 1) % PUZZLES.length); store.set('chess-puzzles-solved', [...new Set([...(store.get('chess-puzzles-solved', [])), G.puzzle.idx])]); }
    (youLose ? sfx.lose : st.winner >= 0 || G.puzzle ? sfx.win : sfx.chime)();
    host('end', { result: st.result, reason: st.reason, mode: G.mode });
  }
  updateHUD(); setTimeout(() => { if (G.over === st && !G.replaying) showModal('#end'); }, silent ? 0 : 1500);
}
async function replay() {
  hideModal('#end'); const ucis = [...G.ucis], st = G.over;
  G.replaying = true; G.chess = new Chess(G.startFen); G.ucis = []; G.captured = []; G.lastMove = null; G.over = null;
  syncPieces(); updateHighlights(); renderMoves(); updateHUD(); $('#replay-bar').hidden = false;
  for (const u of ucis) {
    if (!G.replaying) { await playMove(u, { animate: false, replay: true }); continue; }
    await playMove(u, { replay: true });
    await new Promise((ok) => setTimeout(ok, 350));
  }
  syncPieces();
  G.replaying = false; $('#replay-bar').hidden = true; G.status = G.chess.status(); G.over = st || (G.status.over ? G.status : null);
  updateHighlights(); updateHUD(); if (G.over) showModal('#end'); else maybeAI();
}

// ------------------------------------------------------------------ puzzles
function puzzleProgress(d) {
  const pz = PUZZLES[G.puzzle.idx];
  if (G.chess.turn === BLACK) { // the player just moved
    if (G.puzzle.stage === 0) {
      if (d.san.replace(/[+#]/, '') !== pz.key.replace(/[+#]/, '')) {
        sfx.error(); toast('Not the key move — it lets Black escape. Try again!', 2400);
        cancelAI(); setTimeout(() => { if (G.puzzle && !G.over) undo(); }, 900); updatePuzzlePanel(); return false;
      }
      G.puzzle.stage = 1; toast('Strong! Now finish it.', 1600);
    } else if (!G.over) { sfx.error(); toast('That is not mate — try the second move again.', 2400); cancelAI(); setTimeout(() => { if (G.puzzle && !G.over) { G.chess.undo(); G.ucis.pop(); recountCaptured(); syncPieces(); G.status = G.chess.status(); const rp = new Chess(G.startFen); let last = null; for (const u of G.ucis) last = rp.move(u); G.lastMove = last; updateHighlights(); renderMoves(); updateHUD(); } }, 900); updatePuzzlePanel(); return false; }
  }
  updatePuzzlePanel(); return true;
}
function updatePuzzlePanel() {
  const el = $('#puzzle'); if (!el) return;
  el.hidden = !G.puzzle;
  if (!G.puzzle) return;
  const pz = PUZZLES[G.puzzle.idx], solved = store.get('chess-puzzles-solved', []);
  el.innerHTML = `<div class="pz-k">Puzzle ${G.puzzle.idx + 1} / ${PUZZLES.length}${solved.includes(G.puzzle.idx) ? ' · solved ✓' : ''}</div><div class="pz-t">${pz.name}</div><div class="pz-s">White to move — mate in 2</div>`;
}

// ------------------------------------------------------------------ save / resume
function saveGame() {
  if (G.replaying) return;
  if (!G.started || G.over || G.mode === 'aivsai') { store.set('chess-save', null); return; }
  store.set('chess-save', { v: 1, startFen: G.startFen, ucis: G.ucis, mode: G.mode, aiLevel: G.level, playerColor: G.playerColor === BLACK ? 'black' : 'white', variant: G.startFen === START_FEN ? 'standard' : 'chess960', puzzle: G.puzzle?.idx ?? null, ts: Date.now() });
}

// ------------------------------------------------------------------ camera
let camTok = null; // current camera tween; replaced/cancelled by newer camera moves
function camHomeSpec() {
  const side = (G.playerColor === BLACK) !== G.flipped ? -1 : 1, a = (innerWidth - panelShift() * 2) / innerHeight;
  const portrait = a < 0.9, polar = portrait ? 0.5 : 0.86;
  const vfov = camera.fov * D2R, hfov = 2 * Math.atan(Math.tan(vfov / 2) * a);
  const halfW = portrait ? 4.95 : 6.9, halfH = 5.4;
  const d = Math.max(halfW / Math.tan(hfov / 2), halfH / Math.tan(vfov / 2) * (portrait ? 1.0 : 0.9)) * 1.02;
  return { pos: new THREE.Vector3(0, Math.cos(polar) * d, side * Math.sin(polar) * d), target: new THREE.Vector3(0, -0.25, portrait ? side * 0.25 : side * 0.45) };
}
function homeCamera(animate) {
  const s = camHomeSpec();
  if (!animate || settings.reducedMotion) { camTok = null; camera.position.copy(s.pos); controls.target.copy(s.target); controls.update(); return; }
  const p0 = camera.position.clone(), t0 = controls.target.clone();
  // swing around the board rather than through it
  const sph0 = new THREE.Spherical().setFromVector3(p0.clone().sub(t0)), sph1 = new THREE.Spherical().setFromVector3(s.pos.clone().sub(s.target));
  let dTheta = sph1.theta - sph0.theta; if (dTheta > Math.PI) dTheta -= Math.PI * 2; if (dTheta < -Math.PI) dTheta += Math.PI * 2;
  const tok = camTok = {};
  tween(1.1, (k) => {
    if (tok !== camTok) return;
    const sp = new THREE.Spherical(sph0.radius + (sph1.radius - sph0.radius) * k, sph0.phi + (sph1.phi - sph0.phi) * k, sph0.theta + dTheta * k);
    controls.target.lerpVectors(t0, s.target, k); camera.position.setFromSpherical(sp).add(controls.target);
  }, { ease: ease.inOutCubic });
}
// On desktop the side panel covers the right of the screen: shift the projection so the board centres in the free area.
function panelShift() { return document.body.classList.contains('playing') && innerWidth > 860 ? 140 : 0; }
function applyViewOffset() { const s = panelShift(); if (s) camera.setViewOffset(innerWidth, innerHeight, s, 0, innerWidth, innerHeight); else camera.clearViewOffset(); }
function fitCamera() { applyViewOffset(); if (G.started && !G.replaying) homeCamera(false); else { const s = camHomeSpec(); camera.position.copy(s.pos); controls.target.copy(s.target); } }

// ------------------------------------------------------------------ input
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
function pickSquare(ev) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects([...meshes.values()], false);
  if (hits.length) for (const [sq, m] of meshes) if (m === hits[0].object) return sq;
  return ray.ray.intersectPlane(plane, hit) ? worldSq(hit.x, hit.z) : null;
}
let down = null;
renderer.domElement.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!down) return; const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t; down = null;
  if (moved < 9 && dt < 700) { G.kb = false; onSquare(pickSquare(e)); }
});
let hoverSq = null;
renderer.domElement.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse' || !G.started || down) return;
  const sq = pickSquare(e); if (sq === hoverSq) return;
  if (hoverSq && meshes.get(hoverSq)) meshes.get(hoverSq).userData.hov = 0;
  hoverSq = sq; const m = sq && meshes.get(sq);
  const mine = m && G.human[G.chess.turn] && m.userData.color === G.chess.turn && !G.over;
  if (mine) m.userData.hov = 1;
  const target = sq && G.targets.has(sq);
  hoverHL.visible = !!(mine || target); if (hoverHL.visible) hoverHL.position.copy(sqPos(sq, 0.009));
  renderer.domElement.style.cursor = mine || target ? 'pointer' : 'grab';
});
addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input,select,textarea')) return;
  const k = e.key;
  if ((k === 'Escape' || k === 'p' || k === 'P') && G.started) { if ($('#promo').classList.contains('open')) { if (k === 'Escape') $('#promo-cancel').click(); return; } if (G.selected && k === 'Escape') { clearSelection(); return; } togglePause(); return; }
  if (!G.started || G.paused || !$('#menu').classList.contains('hide')) return;
  if ($('#promo').classList.contains('open')) { const i = 'qrbn'.indexOf(k.toLowerCase()); if (i >= 0) $('#promo-choices').children[i]?.click(); return; }
  const dirs = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
  if (dirs[k]) {
    e.preventDefault(); G.kb = true; const flipK = (G.playerColor === BLACK) !== G.flipped ? -1 : 1;
    let f = G.cursor.charCodeAt(0) - 97 + dirs[k][0] * flipK, r = G.cursor.charCodeAt(1) - 49 + dirs[k][1] * flipK;
    f = Math.max(0, Math.min(7, f)); r = Math.max(0, Math.min(7, r)); G.cursor = 'abcdefgh'[f] + (r + 1); sfx.click(); updateHighlights(); return;
  }
  if (k === 'Enter' || k === ' ') { e.preventDefault(); G.kb = true; onSquare(G.cursor); updateHighlights(); return; }
  if (k === 'u' || k === 'U' || (k === 'z' && (e.ctrlKey || e.metaKey))) undo();
  else if (k === 'h' || k === 'H') hint();
  else if (k === 'f' || k === 'F') flip();
  else if (k === 't' || k === 'T') openThemes();
});

// ------------------------------------------------------------------ HUD
function updateHUD() {
  if (!G.started) return;
  const turn = G.chess.turn, st = G.status || {};
  const name = (c) => G.mode === 'local' ? (c ? 'Black' : 'White') : G.puzzle ? (c ? 'Defender' : 'You') : (G.human[c] ? 'You' : `AI · ${LEVEL_LABEL[G.level]}`);
  let txt;
  if (G.over) txt = G.over.reason === 'checkmate' ? `Checkmate — ${G.over.winner ? 'Black' : 'White'} wins` : `Draw — ${G.over.reason}`;
  else if (G.replaying) txt = 'Replay';
  else if (G.thinking) txt = `${turn ? 'Black' : 'White'} is thinking`;
  else if (G.mode === 'ai' && G.human[turn]) txt = 'Your move';
  else txt = `${turn ? 'Black' : 'White'} to move`;
  $('#turn-text').textContent = txt;
  $('#turn').dataset.side = turn ? 'b' : 'w';
  $('#turn').classList.toggle('thinking', G.thinking);
  $('#turn').classList.toggle('check', !!st.check && !G.over);
  const capBy = [[], []]; for (const c of G.captured) capBy[c.color ^ 1].push(c.type);
  const mat = [G.chess.material(WHITE), G.chess.material(BLACK)];
  for (const c of [WHITE, BLACK]) {
    const el = $(c ? '#p-black' : '#p-white');
    el.querySelector('.p-name').textContent = name(c);
    el.querySelector('.p-cap').textContent = capBy[c].sort((a, b) => VALUE[b] - VALUE[a]).map((t) => GLYPH[c ? 'w' : 'b'][t]).join('');
    const adv = Math.round((mat[c] - mat[c ^ 1]) / 100); el.querySelector('.p-adv').textContent = adv > 0 ? `+${adv}` : '';
    el.classList.toggle('active', turn === c && !G.over);
  }
  $('#btn-undo').disabled = !G.chess.ply || G.replaying;
  $('#panel').classList.toggle('as-black', (G.playerColor === BLACK) !== G.flipped);
  $('#btn-hint').disabled = !!(G.over || !G.human[turn] || G.replaying);
  P.counts = { ...P.counts, pieces: meshes.size, theme: cfg.theme, ply: G.chess.ply };
}
function renderMoves() {
  const list = $('#moves'), h = G.chess.sanHistory, startBlack = G.startFen.split(' ')[1] === 'b';
  const fm0 = parseInt(G.startFen.split(' ')[5] || '1', 10);
  let html = '', i = 0;
  if (startBlack && h.length) { html += `<li><b>${fm0}.</b><span>…</span><span class="${h.length === 1 ? 'cur' : ''}">${h[0]}</span></li>`; i = 1; }
  for (; i < h.length; i += 2) { const n = fm0 + Math.floor((i + (startBlack ? 1 : 0)) / 2); html += `<li><b>${n}.</b><span class="${i === h.length - 1 ? 'cur' : ''}">${h[i]}</span><span class="${i + 1 === h.length - 1 ? 'cur' : ''}">${h[i + 1] || ''}</span></li>`; }
  list.innerHTML = html || '<li class="empty">No moves yet</li>';
  list.scrollTop = list.scrollHeight;
  $('#last-move').textContent = h.length ? `${Math.ceil(h.length / 2)}. ${h.length % 2 ? '' : '… '}${h[h.length - 1]}` : '';
}
function showModal(id) { $(id).classList.add('open'); }
function hideModal(id) { $(id)?.classList.remove('open'); }
function togglePause(force) {
  const open = force ?? !$('#pause').classList.contains('open');
  G.paused = open; $('#pause').classList.toggle('open', open); sfx.click();
  if (!open && G.pendingAI) { const u = G.pendingAI; G.pendingAI = null; queueMove(u); }
  if (open) $('#pause button')?.focus();
}

// coach (first-session onboarding inside play)
const coachSteps = { start: 'Tap one of your pieces to see where it can move.', selected: 'Glowing dots are legal moves — rings are captures. Tap one to move.', moved: 'Drag to orbit, pinch or scroll to zoom. Stuck? Hint (H) · Undo (U).' };
let coachStage = store.get('chess-coach', 0);
function coach(ev) {
  const el = $('#coach'); if (coachStage >= 3 || G.puzzle || G.mode === 'aivsai') { el.hidden = true; return; }
  const order = ['start', 'selected', 'moved'], idx = order.indexOf(ev);
  if (idx < coachStage) return;
  if (ev === 'start' && coachStage === 0) { el.textContent = coachSteps.start; el.hidden = false; }
  else if (ev === 'selected' && coachStage <= 1) { coachStage = 1; el.textContent = coachSteps.selected; el.hidden = false; }
  else if (ev === 'moved' && coachStage <= 2 && coachStage >= 1) { coachStage = 3; el.textContent = coachSteps.moved; el.hidden = false; store.set('chess-coach', 3); setTimeout(() => (el.hidden = true), 6500); }
}

// theme picker
function openThemes() {
  const box = $('#theme-grid'); box.innerHTML = '';
  for (const id of THEME_IDS) {
    const T = THEMES[id], b = document.createElement('button');
    b.className = 'theme-card' + (id === cfg.theme ? ' on' : ''); b.dataset.theme = id;
    b.innerHTML = `<div class="sw">${['light', 'dark', 'whitePieces', 'blackPieces', 'accent'].map((k) => `<i style="background:${T.colors[k]}"></i>`).join('')}</div><b>${T.label}</b><small>${T.blurb}</small>`;
    b.onclick = () => { setTheme(id); box.querySelectorAll('.theme-card').forEach((x) => x.classList.toggle('on', x === b)); };
    box.appendChild(b);
  }
  showModal('#themes'); sfx.click();
}
function setTheme(id) {
  if (!THEMES[id]) return false;
  cfg.theme = id; applyLook(); sfx.select(); savePrefs();
  return true;
}
function savePrefs() { if (!hasDream) store.set('chess-prefs', { theme: cfg.theme, aiLevel: cfg.aiLevel, variant: cfg.variant, mode: cfg.mode, playerColor: cfg.playerColor }); }
function onLiveConfig(prev) {
  if (!G.started) { syncMenu(); return; }
  if (prev.aiLevel !== cfg.aiLevel && G.mode === 'ai') { G.level = cfg.aiLevel; updateHUD(); toast(`AI level: ${LEVEL_LABEL[G.level]}`, 1400); }
  if (prev.variant !== cfg.variant || prev.mode !== cfg.mode || prev.playerColor !== cfg.playerColor) toast('Mode changes apply to your next game', 1800);
  if (prev.showLegal !== cfg.showLegal) updateHighlights();
}

// ------------------------------------------------------------------ menu
const menu = startMenu({
  title: 'Chess: Worlds', subtitle: 'Six worlds, one timeless game. Play the AI, a friend, Chess960 or mate-in-two puzzles.', startLabel: 'New game',
  options: [
    { key: 'mode', label: 'Mode', value: cfg.mode, choices: [{ v: 'ai', label: 'vs AI' }, { v: 'local', label: '2 players' }, { v: 'puzzle', label: 'Puzzles' }] },
    { key: 'theme', label: 'World', value: cfg.theme, choices: THEME_IDS.map((id) => ({ v: id, label: THEMES[id].label })) },
    { key: 'aiLevel', label: 'AI level', value: cfg.aiLevel, choices: Object.entries(LEVEL_LABEL).map(([v, label]) => ({ v, label })) },
    { key: 'playerColor', label: 'Play as', value: cfg.playerColor, choices: [{ v: 'white', label: 'White' }, { v: 'black', label: 'Black' }, { v: 'random', label: 'Random' }] },
    { key: 'variant', label: 'Variant', value: cfg.variant, choices: [{ v: 'standard', label: 'Standard' }, { v: 'chess960', label: 'Chess960' }] },
  ],
  onStart: (v) => { Object.assign(cfg, v); cfg = sanitize(cfg); savePrefs(); applyLook(); controls.autoRotate = false; newGame({}); },
});
const card = menu.el.querySelector('.sd-card');
card.querySelector('p').insertAdjacentHTML('afterend', '<p class="menu-blurb" id="menu-blurb"></p>');
const startRow = menu.el.querySelector('#sd-start').parentElement;
startRow.insertAdjacentHTML('afterbegin', '<button class="sd-btn" id="sd-continue" hidden>Continue</button>');
startRow.insertAdjacentHTML('afterend', '<div class="menu-foot">Tap to select · tap to move · drag to orbit · H hint · U undo · F flip · Esc pause</div>');
menu.el.querySelector('.sd-row[data-key="theme"]').addEventListener('click', (e) => { const b = e.target.closest('.sd-btn'); if (!b) return; cfg.theme = b.dataset.v; applyLook(); syncMenu(); });
menu.el.querySelector('.sd-row[data-key="mode"]').addEventListener('click', () => setTimeout(syncMenu));
function syncMenu() {
  $('#menu-blurb').textContent = THEMES[cfg.theme].blurb;
  menu.el.querySelectorAll('.sd-row[data-key]').forEach((row) => { const key = row.dataset.key; if (cfg[key] == null) return; row.querySelectorAll('.sd-btn').forEach((b) => b.classList.toggle('on', b.dataset.v === String(key === 'mode' ? menu.values.mode : cfg[key]))); });
  const mode = menu.values.mode;
  for (const key of ['aiLevel', 'playerColor']) { const row = menu.el.querySelector(`.sd-row[data-key="${key}"]`); row.style.display = row.previousElementSibling.style.display = mode === 'ai' ? '' : 'none'; }
  const vr = menu.el.querySelector('.sd-row[data-key="variant"]'); vr.style.display = vr.previousElementSibling.style.display = mode === 'puzzle' ? 'none' : '';
  const save = store.get('chess-save'); const cont = $('#sd-continue');
  cont.hidden = !save || !save.ucis; if (save) cont.textContent = `Continue (${save.mode === 'puzzle' ? 'puzzle' : save.mode === 'local' ? '2 players' : 'vs AI'} · move ${Math.ceil((save.ucis.length + 1) / 2)})`;
}
$('#sd-continue').onclick = () => { const s = store.get('chess-save'); if (!s) return; sfx.select(); menu.hide(); controls.autoRotate = false; newGame({ mode: s.mode, aiLevel: s.aiLevel, playerColor: s.playerColor }, s); };
function openMenu() { cancelAI(); togglePause(false); hideModal('#end'); G.started = false; document.body.classList.remove('playing'); applyViewOffset(); clearSelection(); syncMenu(); menu.show(); controls.autoRotate = !settings.reducedMotion; }

// ------------------------------------------------------------------ buttons
settingsButton('<button class="sd-btn sd-icon" id="btn-theme" aria-label="Change world" title="Change world (T)">◐</button><button class="sd-btn sd-icon" id="btn-pause" aria-label="Pause" title="Pause (Esc)">❚❚</button>');
$('#btn-theme').onclick = openThemes;
$('#btn-pause').onclick = () => G.started ? togglePause(true) : null;
$('#btn-undo').onclick = undo; $('#btn-hint').onclick = hint; $('#btn-flip').onclick = flip;
$('#btn-moves').onclick = () => { document.body.classList.toggle('show-moves'); sfx.click(); };
$('#themes-close').onclick = () => { hideModal('#themes'); sfx.click(); };
$('#pause-resume').onclick = () => togglePause(false);
$('#pause-restart').onclick = () => { togglePause(false); newGame({}); };
$('#pause-settings').onclick = () => $('#sd-gear').click();
$('#pause-menu').onclick = () => openMenu();
$('#end-rematch').onclick = () => { sfx.select(); if (G.mode === 'ai' && cfg.playerColor !== 'random') cfg.playerColor = G.playerColor === WHITE ? 'black' : 'white'; newGame({}); };
$('#end-next').onclick = () => { sfx.select(); newGame({ mode: 'puzzle', puzzleIndex: (G.puzzle.idx + 1) % PUZZLES.length }); };
$('#end-replay').onclick = () => replay();
$('#end-menu').onclick = () => openMenu();
$('#end-close').onclick = () => hideModal('#end');
$('#replay-skip').onclick = () => { G.replaying = false; };
$('#promo-cancel').onclick = () => { hideModal('#promo'); clearSelection(); };
addEventListener('sd-settings', () => { motes.mesh.visible = !settings.reducedMotion; });

// ------------------------------------------------------------------ boot
applyLook();
G.chess = new Chess(); syncPieces(); autoResize(renderer, camera, () => fitCamera()); fitCamera(); controls.autoRotate = !settings.reducedMotion; controls.autoRotateSpeed = 0.5;
syncMenu();
startLoop(renderer, (dt, t) => {
  updateTweens(dt); fx.update(dt); look.envObj?.update(t, dt); motes.update(t);
  if (G.selected && !G.busy) { const m = meshes.get(G.selected); if (m && !settings.reducedMotion) m.position.y = 0.22 + Math.sin(t * 3.2) * 0.025; }
  controls.update(); applyShake(camera, dt);
}, post.render);

// ------------------------------------------------------------------ probe + test hooks
P.dataReady = true;
P.game = {
  fen: () => G.chess.fen(),
  move: (san) => { const ok = !!G.chess.parse(san); if (ok) queueMove(san); return ok; },
  setTheme: (name) => setTheme(name),
  legalMoves: () => { const l = G.chess.legal(); return l.map((m) => G.chess.san(m, l)); },
  newGame: (o = {}) => { menu.hide(); controls.autoRotate = false; if (o.theme) setTheme(o.theme); Object.assign(cfg, o); cfg = sanitize(cfg); newGame(o); return true; },
  loadMoves: async (list, animate = false) => { cancelAI(); G.loading = true; try { for (const u of list) await playMove(u, { animate }); } finally { G.loading = false; } maybeAI(); return G.chess.fen(); },
  think: async (level = 'medium') => (await ai(level)).san,
  busy: () => G.busy || G.thinking || fx.busy() > 0,
  state: () => ({ turn: G.chess.turn ? 'b' : 'w', ply: G.chess.ply, over: G.over, history: [...G.chess.sanHistory], captured: G.captured.length, theme: cfg.theme, set: look.set, env: look.env, fx: look.fx, mode: G.mode, puzzle: G.puzzle }),
  select: (sq) => onSquare(sq),
  config: (o) => { const prev = cfg; cfg = sanitize({ ...cfg, ...o, colors: { ...cfg.colors, ...(o.colors || {}) } }); applyLook(); onLiveConfig(prev); return cfg; },
  camera: (az = 0, polar = 0.8, dist = 14, sq = null, y = 0.4) => { camTok = null; controls.autoRotate = false; const s = camHomeSpec(); controls.target.copy(sq ? sqPos(sq, y) : s.target); const sp = new THREE.Spherical(dist, polar, az + (s.pos.z < 0 ? Math.PI : 0)); camera.position.setFromSpherical(sp).add(controls.target); controls.update(); },
  hint: () => hint(), undo: () => undo(), flip: () => flip(), replay: () => replay(), openThemes, togglePause,
  fx: () => fx.busy(),
};
host('ready', { game: 'chess' });
