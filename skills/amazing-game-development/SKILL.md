---
name: amazing-game-development
description: Hub for AAA browser-game development (three.js r187 WebGPU/TSL with WebGL2 fallback, Canvas 2D, Web Audio) — the global render stack, game-feel rules, delivery format, verification loop, failure modes and the audit checklist that apply to EVERY game, plus a routing map to focused sub-skills. Use whenever building, polishing, upgrading or reviewing ANY game, interactive scene or game asset — "AAA", "polished", "juice", "game feel", "make it look amazing", Superdreams, World Forge, redreams/remixes, or "what is this game missing". Load first; it points to the sub-skill the task needs. Sonnet- and Haiku-tier variants exist (amazing-game-development-sonnet / -haiku).
---

# Amazing Game Development (r187 edition)

Three jobs: **apply the quality bar** by default, **speak the language** (`glossary-for-triple-a-games`), **build it to run** — and prove it with the verify loop. Everything domain-specific lives in sub-skills (map at the bottom).

## 0. Version facts that older skills get wrong (three.js r187, Nov 2026)

| Old advice | r187 reality |
|---|---|
| `renderer.outputEncoding = sRGBEncoding` | Removed. `outputColorSpace` is sRGB by default; set `texture.colorSpace = SRGBColorSpace` on colour textures only. |
| `shadowMap.type = PCFSoftShadowMap` | **Removed in r187** (falls back with a warning). Use `PCFShadowMap` + `light.shadow.radius` (2–4), or `VSMShadowMap`. |
| `new THREE.Clock()` | Deprecated r183 → `new THREE.Timer()`; call `timer.update(t)` each frame, `timer.connect(document)` to pause when hidden. |
| `EffectComposer` + `UnrealBloomPass` | Still fine for `WebGLRenderer`. For `WebGPURenderer`: `new THREE.RenderPipeline(renderer)` (PostProcessing renamed r183) with TSL `pass(scene, cam)` + `bloom()` from `three/addons/tsl/display/BloomNode.js`. |
| ShaderMaterial/GLSL for everything | Prefer **node materials + TSL** (`MeshStandardNodeMaterial`, `colorNode`, `positionNode`, `emissiveNode`) — compiles to WGSL and GLSL. TSL renames: `setName()` (not `label()`), `isolate()` (not `cache()`), `TWO_PI` (not `PI2`), `negateOnBackSide()`; `Source` → `TextureSource`. |
| Load three from a CDN | CDNs/npm may be blocked in agent sandboxes and add a runtime dependency. **Vendor** the exact version (`/vendor/three/`) and use an import map: `"three"` and `"three/webgpu"` → `build/three.webgpu.js`, `"three/tsl"` → `build/three.tsl.js`, `"three/addons/"` → `examples/jsm/`. |
| Tone mapping = ACES only | ACES for filmic contrast (washes out neon); **AgX** keeps saturated emissives (magic, nebulae) from hue-shifting; **Neutral** for neon arcade and UI-accurate colours (board/card games). |
| `positionLocal` = mesh-space vertex | In r187 it is **post-instance**. For per-instance patterns use `positionGeometry`; per-instance colour via `instancedBufferAttribute`. |
| Lamp posts = real `PointLight`s | Changing the light count recompiles every shader. Keep a **fixed pool** of lights and reassign them to the nearest points of interest each frame. |

`WebGPURenderer({ forceWebGL })` runs the same node materials on WebGL2. Always `await renderer.init()` before the first render. Ship WebGPU by default with `?webgl` as a forced fallback.

## 1. The global AAA stack (every 3D scene)

1. **Shadows** — one shadow-casting key light, `PCFShadowMap`, `shadow.radius≈3`, 2048 map, tight ortho frustum around the play area, `bias≈-0.0004`, `normalBias≈0.02`. Skip sprites/transparents.
2. **Tone mapping + colour** — ACES/AgX, exposure ≈1.0; sRGB output is automatic.
3. **Vignette + film grain** — CSS overlays, zero GPU (radial gradient ~38% at corners; SVG `feTurbulence` tile at ~5% opacity, `mix-blend-mode: overlay`). Disable grain animation under `prefers-reduced-motion`.
4. **Micro-motion** — pointer parallax (±0.6 units) or slow camera breathing; stillness reads as dead.
5. **Depth haze** — `scene.fog` (FogExp2) matched to the sky's *horizon* band; aerial perspective is a blue shift, distant mass stays darker than the sky above it.
6. **Ambient dust motes** — ~30–40 instanced particles (one draw call).
7. **Three-point rig** — hemisphere + key (shadows) + opposed rim + low ambient. Never one light.
8. **Bloom** — threshold ~0.8 so only emissives/HDR colours (`new Color(4,2,8)`) glow.
9. **Environment for metals** — a metallic material with no environment renders black. PMREM a `RoomEnvironment` (or a small generated env scene) or keep metalness ≤0.3.

2D/Canvas equivalents: layered parallax, a vignette div, palette-locked gradients (three stops — two complementary stops pass through grey), idle micro-animation, contact shadows, particles on every action.

## 2. Game-feel rules (every playable game)
- **<100 ms, two channels** (visual + audio) for every input. **Juice every state change**: particles, squash-and-stretch, small shake, hitstop, tweened UI.
- **Forgive the player**: coyote ~100 ms, input buffer ~120 ms, generous player hitboxes, stingy hazard ones.
- **Frame-rate independence**: dt-scaled, dt clamped (≤1/20 s).
- **Audio is half the feel**: a synth SFX per verb with ±10% pitch variance; ambient bed; ducked music layer.
- **Accessibility is AAA**: difficulty, colorblind-safe palette, shake/flash toggles, reduced motion, volume, remappable/simple input, scalable text, touch controls.
- **Fun, not compulsion**: no streak punishment, energy timers, loot boxes or FOMO. Session length should fit the genre (casual 5–15 min · board 10–30 · action/RPG 30–60+).

## 3. Delivery format
- **Single page per game**, ES modules, import map, no build step; may split into modules in the game's folder. Procedural geometry + canvas-painted textures by default; CC0/CC-BY assets allowed when they look better (credit page required; verify the *subject*, not the filename; never No-Derivatives).
- **A shared kit beats re-deriving the stack per game.** Superdreams uses `/shared/sd-kit.js`: `createRenderer`, `createPipeline` (RenderPipeline + bloom), `probe`, `startLoop` (Timer), `stageLights`, `spaceBackground`, `dust`, `canvasTexture`, `tween/ease`, `shake/flash`, `sfx`, `audio()` (shared ctx + master gain; never open a second AudioContext), `voice`, `loadDream` (remix config), `startMenu` (`#menu`), `settingsButton`, `store`.
- **Remix-ready ("redreams")**: every tunable lives in one `defaults` object; a `meta.json` remix schema (`choice | color | range | bool | text`, dotted keys) declares what players may change; the game merges `?dream=<base64url json>` / saved redreams / live `postMessage` over the defaults and re-applies live where feasible. The server sanitizes configs against the schema.
- **Animation & music**: if your tier can't do them well, build everything else, leave `// FABLE:` markers, and batch them into one later pass.

## 4. The verify loop (non-negotiable): write → verify → fix
- **Render and look** at landmarks, hero views, each theme/level. **Review each screenshot twice** (did it render? is it right?). Code-review everything else, especially geometry near other geometry.
- Headless harness: Playwright + Chromium with `--use-angle=swiftshader --no-sandbox --disable-dev-shm-usage`. **WebGPU canvases do not composite into headless screenshots** (frames run, image is blank): screenshot with `?webgl`. Wait on frame counts, not milliseconds (CPU raster ≈1–5 fps). Distinguish `page.on('crash')` from `browser.on('disconnected')`.
- **Every page exposes `window.__cam`** `{frames, dataReady, backend, drawCalls, triangles, counts, errors, game:{test hooks}}` — no probe, no verification.
- **Delete a layer and re-render** instead of theorising. **A/B against the previous build** before claiming a regression.
- Prove logic with tests: perft for chess move generators, solvability for seeded deals, unit tests for rules.
- **Gauntlet loop** (from the "Claude of Duty" experiment, where a one-shot FPS scored 3.6–5/10 in blind tests against the real thing): name a real commercial bar, have a *fresh* critic (another agent or a deliberately harsh self-review written before looking at the code) score screenshots /10 against it, fix the top three issues, repeat. The builder never grades its own work by its own intentions.

## 5. Graphics laws that cost a day each
- Noise gates must match the noise's **real distribution** (summed octaves ≈ gaussian, σ≈0.12–0.2), not [-1,1]. Straddle the mean.
- Projected noise needs a sane domain (`dir.xz/dir.y`, scale ~1.5, clamp `dir.y`≥0.13).
- Streaks (water, rain, hair) need **anisotropic** noise stretched along the flow.
- Complementary two-stop gradients go grey — use three stops around the desaturated centre.
- At low sun the **fill lights are the lighting**; add lamps and lit windows (per-vertex lit flag in the merged buffer = near-free).
- Sprites are quads: radial `uv()` falloff + noise for soft billows.
- Scale detail with size; never gate it on absolute height.
- Doorways are recesses with warm emissive interiors, never flat dark quads.
- A PMREM environment turns pale materials white — set `envMapIntensity` per material (0–0.3 for bricks/UI-coloured parts).
- City windows: procedural TSL grid on merged geometry driven by a vertex attribute, anti-aliased with derivatives (`fwidth`) — no per-building canvas textures (they can't merge). One time-of-day uniform drives sky, fog, windows and lights.
- Merge static parts per material across a hierarchy (a landmark ≈ 6 draw calls). Picking on terrain: ray-march the heightfield instead of raycasting the mesh.
- Split-screen: two `pass()` nodes composited by `screenUV.x` so one bloom covers both halves. Orthographic/iso cameras: draw the sky gradient in screen space, not as a dome.
- Distance haze with a blue shift: `scene.fogNode`.
- Space (overrides the older space skill): planet surface, clouds, city lights and atmosphere in **one TSL shader** (no CPU-baked textures, no separate cloud shell — it z-fights at range); atmosphere glow peaks at the limb, not the outer edge; ships need a rim light + emissive trim (near-zero ambient makes them unreadable); cockpit as a separate pass blended over the world fixes depth precision; speed dust as stretched lines wrapped around the camera; merge kitbash struts per material.
- FPS viewmodel: scale the gun ~0.3 and keep it inside the player's collision radius (no wall clipping); align sights to the camera ray for ADS; one shared muzzle-flash light keeps the light count constant.
- Crowds of humanoids: instanced body parts posed by 2-bone IK; ray hits via a spatial grid, not scene-wide raycasts. Add a `sim(seconds)` hook so headless tests can fast-forward play.
- Procedural space backdrops: a TSL `scene.backgroundNode` from `positionWorldDirection` (hashed star cells + fractal-noise nebula) costs zero draw calls and never tiles.

## 6. Known failure modes
| Symptom | Cause | Fix |
|---|---|---|
| Blank page, no errors | import map wrong / CDN blocked | vendored three + check every import path resolves |
| Black objects | metalness with no env map; missing light | PMREM env or lower metalness; 3-point rig |
| Blank headless screenshot but frames counting | WebGPU canvas | `?webgl` for screenshots |
| Start button does nothing / movement dead | pointer-lock throws or gates input | decouple input from lock state; handle lock loss with pause |
| WASD leaks into chat | no `stopPropagation` | stop it on text inputs |
| Black screen after edit | TSL/GLSL compile error | read console; verify every uniform; simplify node graph |
| Frame rate tanks | draw calls / DPR / shadows | instance/merge (≤300 calls), DPR ≤2, tight shadow frustum |
| `PCFSoftShadowMap has been removed` warning | r187 | PCFShadowMap + radius |

## 7. AAA audit checklist
```
RENDER  shadows(PCF+radius) · tone mapping · vignette/grain · micro-motion · matched haze · 3-point rig · env for metals · bloom on emissives only
MOTION  ambient animation · eased tweens · idle states · dt clamp · day/night palette lerp
FEEL    <100ms two-channel feedback · juice · forgiveness · no dead input · payoff = multi-system change
ART     silhouette readability · ≤5 hues + accents · cluster variance · focal hierarchy · painted detail not flat fills
AUDIO   SFX per verb · ambient bed · pitch variance · (music/animation: FABLE pass)
UX      onboarding in play · readable HUD · teaching fail states · accessibility · save if >3 min · touch
PERF    60fps budget · pooled particles · ≤300 draws · DPR≤2 · dispose on swap · fast first frame + progress bar
SHIP    seeded determinism · remix schema + live dream config · __cam probe + test hooks · credits recorded · PG-13
VERIFY  screenshots reviewed twice · automated playthrough 0 errors · logic tests · Gauntlet score reported honestly
```

## Skill map — load what the task needs
| Need | Load |
|---|---|
| Sonnet-tier build (templates, more prescriptive) | `amazing-game-development-sonnet` |
| Haiku-tier build (fill-in templates, one task per message) | `amazing-game-development-haiku` |
| Quick AAA without the full library | `minimal-aaa-game-dev` |
| First-person controller, loop, state, save, mobile | `first-person-controls` |
| Collision without physics engine | `game-collision` |
| NPCs, dialogue, quests, inventory | `npc-and-quests` |
| Terrain, props, particles, sky, day/night | `procedural-3d-world`, `procedural-buildings` |
| Landmarks / monuments / geometry QA | `landmark-kitbashing`, `blind-geometry-qa` |
| Many meshes / draw calls | `batched-instanced-rendering` |
| TSL materials, post, compute particles | `tsl-node-materials`, `tsl-post-processing`, `tsl-gpu-compute-particles`, `webgpu-tsl-setup` |
| Lighting & shadows (WebGPU) | `webgpu-lighting-shadows` |
| Runtime audio | `game-audio` |
| 2D top-down / pixel art | `canvas-2d-game-engine`, `pixel-art-games` |
| Water/ocean | `amazing-game-development-ocean` |
| Space / sci-fi hard surface | `amazing-game-development-space` |
| Environment archetypes | `env-archetypes-router` |
| Genre loops (core/session/meta, levels?) | Superdreams `docs/genre-flows.md` |
| Terminology | `glossary-for-triple-a-games` |
