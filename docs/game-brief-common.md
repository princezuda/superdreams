# Superdreams — common brief for every launch game

Superdreams serves only **finished AA/AAA-quality browser games** that people play, remix ("redream") and share. The bar is
"far better than something someone could just prompt": a complete game with onboarding, difficulty, saving, accessibility,
an ending/goal worth reaching, and a session length that fits the genre (casual 5–15 min, board 10–30, action/RPG/adventure 30–60+).
Fun and enjoyment first — **never build addictive/compulsion loops** (no streak punishments, loot boxes, manipulative timers). PG-13.

## Hard constraints
- Work ONLY inside your own `games/<id>/` folder(s). Never edit `shared/`, `vendor/`, `router.php`, `lib/`, other games. Do NOT git commit/push (the lead does). Do not spawn sub-agents.
- three.js **r187** is vendored at `/vendor/three/` (network is restricted: no CDN/npm). Import map, verbatim, in `<head>`:
  `<script type="importmap">{"imports":{"three":"/vendor/three/build/three.webgpu.js","three/webgpu":"/vendor/three/build/three.webgpu.js","three/tsl":"/vendor/three/build/three.tsl.js","three/addons/":"/vendor/three/examples/jsm/"}}</script>`
  Addons available: `ls vendor/three/examples/jsm/` (OrbitControls, PointerLockControls, GLTFLoader, DRACOLoader, RoundedBoxGeometry, BufferGeometryUtils, SimplexNoise, Sky/SkyMesh, Water/WaterMesh, tsl/display/* BloomNode, GTAONode, FXAANode, SMAANode, DepthOfFieldNode, etc.). If you need another addon file, tell the lead in your report rather than fetching it.
- 2D games may use plain Canvas 2D (sprites drawn in code) when that genuinely looks better than 3D; otherwise three.js.
- Use the shared kit **`/shared/sd-kit.js`** — read it fully first. It provides: `createRenderer` (WebGPU, auto WebGL2 fallback, `?webgl` forces it), `createPipeline` (RenderPipeline + bloom), `autoResize`, `probe` (window.__cam), `startLoop` (THREE.Timer, clamped dt), `stageLights`, `spaceBackground` (TSL starfield+nebula backgroundNode), `dust`, `canvasTexture`, `tween/ease/updateTweens`, `shake/applyShake/flash`, `sfx.*`, `loadDream/encodeDream`, `initUI`, `startMenu` (#menu, #sd-start), `settingsButton`, `toast`, `store`, `host`. Local helpers go in your folder.
- **r187 API facts** (older skill files get these wrong): `THREE.RenderPipeline` (not PostProcessing/EffectComposer for WebGPU), `THREE.Timer` (Clock deprecated), `PCFShadowMap` + `light.shadow.radius` (PCFSoftShadowMap REMOVED), sRGB output default (no outputEncoding), node materials (`MeshStandardNodeMaterial`, `MeshPhysicalNodeMaterial`, `MeshBasicNodeMaterial`, `SpriteNodeMaterial`, `PointsNodeMaterial`), TSL renames: `setName()` not `label()`, `isolate()` not `cache()`, `TWO_PI` not `PI2`, `negateOnBackSide()`; `Source`→`TextureSource`. **Metallic materials with no environment map render black** — give the scene an environment (PMREMGenerator from a RoomEnvironment or a small generated env scene) or keep metalness low.
- Assets: procedural geometry + canvas-painted textures by default. CC0/CC-BY art is allowed from ambientcg.com, polyhaven.com / dl.polyhaven.org, kenney.nl, opengameart.org (verify licence per asset; never No-Derivatives; CC-BY-NC only for unimportant replaceable bits). Keep downloads small (≤1K JPG/KTX2, compressed GLB), store under `games/<id>/assets/`, and record every asset in meta.json `credits` [{asset, author, license, url, use}] — plus `games/<id>/CREDITS.txt` listing rejected assets and why. **Verify the subject, not the filename.**
- No other studio's IP (names, characters, maps, logos, UI look). Inspired-by is fine; recognisable clones are not.

## Every game must have
- `#menu` start screen (kit `startMenu`) with modes/difficulty; pause menu (Esc/P) with resume/settings/quit; kit `settingsButton` (shake, flash, colorblind, reduced motion, volume, quality).
- Onboarding inside play (first-minute teaching, not a wall of text), readable HUD, fail states that teach, a win/finale.
- Save/resume via kit `store` when a session can exceed ~3 minutes.
- Remix config via kit `loadDream(defaults, onLive)` — live postMessage updates apply without reload where feasible.
- Mobile/touch support (on-screen controls where needed) and keyboard; responsive; DPR capped by kit.
- Juice: <100 ms two-channel feedback (visual + kit `sfx`), eased tweens, particles on actions, small shake/hitstop (respect settings).
- `probe(renderer, {...})`, `__cam.dataReady = true` once built, meaningful `__cam.counts`, and `__cam.game = {...}` test hooks for scripted verification.
- Performance: ≤ ~300 draw calls (`__cam.drawCalls`), instancing/merging, pooled particles, no per-frame allocation in hot loops. First playable frame fast (< ~3 s on desktop for most games; a heavy 3D world may take longer if it's worth it — show a real progress bar).
- **Animation & music are deferred** to a later "Fable" pass. Use kit sfx now (add game-specific WebAudio SFX if needed) and simple procedural motion; mark spots needing richer animation/music with `// FABLE:` comments. Do NOT write music.

## meta.json (catalog entry) — `games/<id>/meta.json`
`{"id","title","genre","subgenre","tier":"AA","tagline","description","playTime","controls","modes":[...],"themes":[...],"levels":true|false,
"remix":[{"key":"theme","label":"Theme","type":"choice","choices":[{"v":"classic","label":"Classic"}],"default":"classic"},
 {"key":"colors.accent","label":"Accent","type":"color","default":"#ffaa33"},{"key":"difficulty","type":"choice",...},
 {"key":"x","type":"range","min":1,"max":10,"step":1,"default":3},{"key":"y","type":"bool","default":true}],
"credits":[],"fablePass":["..."],"thumb":"thumb.jpg"}`
Every remix key must be honoured by the game (defaults shape = config shape). Produce `thumb.jpg` (1280×720 hero shot, in-game, not the menu) and `shots/*.png`.

## Verify loop (non-negotiable): write → verify → fix
- Serve from repo root: `php -S 127.0.0.1:<your port> router.php` (background).
- Harness: `node tools/shot.mjs "<url>?webgl" out.png [minFrames]` (Playwright + SwiftShader; waits for `__cam.frames`). Always `?webgl` — headless WebGPU canvases don't composite into screenshots. Write your own Playwright scripts (import `/opt/node22/lib/node_modules/playwright/index.mjs`; launch args `--use-angle=swiftshader --no-sandbox --disable-dev-shm-usage`) to click `#sd-start` (dispatch a MouseEvent if it animates), drive input, and use your `__cam.game` hooks. Software rendering is ~1–5 fps: wait on frames, not milliseconds.
- Render-and-look at every hero view/level/theme; **review each screenshot twice** (did it render? is it right?): black surfaces (metalness w/o env), floating/buried/intersecting geometry, z-fighting, unreadable silhouettes, too dark/washed out, UI overlap at phone width (390×844). "Delete a layer and re-render" when unsure. Screenshots understate final quality (CPU raster) — judge composition/correctness.
- Automated play-through via hooks with **zero page errors**; unit-test pure logic with node where it exists.
- **Gauntlet check before reporting:** write down the real bar (a named commercial game in the genre), then critique your own screenshots as a harsh outside reviewer would score them /10 against that bar; fix the top issues; repeat until remaining issues are minor or need the Fable animation/music pass. Report the final honest score.

## Skill audit (owner request)
Skill files at /root/.claude/skills/synced/*/ (amazing-game-development and relevant sub-skills) predate r187. Note (a) outdated/worse advice vs what you actually did, (b) new techniques you used that they lack. Don't edit skill files — report.

## Report back (concise, ≤ 400 words)
Files; tests run + results; what screenshots showed wrong and how you fixed it; honest Gauntlet score + remaining known issues; kit changes you'd want; skill-audit findings; `FABLE:` spots.
