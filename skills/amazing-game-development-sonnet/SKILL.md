---
name: amazing-game-development-sonnet
description: Sonnet-tier version of amazing-game-development for three.js r187 browser games — prescriptive build order, the Superdreams kit and template, exact r187 APIs, TSL recipes that are known to work, the verify loop and a release checklist. Use on Sonnet-class models when building, polishing or reviewing any browser game or Superdreams redream. Load amazing-game-development for the full hub and sub-skill map.
---

# Amazing Game Development — Sonnet edition (three.js r187)

Work in this order. Do not skip the verify step at the end of each stage.

## Stage 1 — Start from the template, not a blank file
1. Copy `games/_template/` to `games/<id>/`. It already has: vendored import map, `/shared/sd-kit.js` render stack (WebGPU + `?webgl` fallback, RenderPipeline bloom, PCF shadows, vignette/grain, three-point lights, dust), `#menu` start screen, settings, `store`, remix `DEFAULTS` + `loadDream`, `__cam` probe, Timer loop.
2. Write `meta.json` (id, title, genre, subgenre, tier, tagline, description, playTime, controls, modes, levels, remix schema, credits, fablePass, thumb). Every remix `key` must exist in `DEFAULTS` with the same shape.
3. Decide from `docs/genre-flows.md`: core/session/meta loop, **levels or not**, target session length.

## Stage 2 — Exact r187 APIs (copy these, don't recall older ones)
```js
import * as THREE from 'three/webgpu';
import { pass, uniform, color, time, sin, mix, uv, positionLocal, positionWorld, normalWorld, Fn, vec3, float, mx_fractal_noise_float } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
const renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL: location.search.includes('webgl') });
await renderer.init();                                   // before first render
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoft is REMOVED
light.shadow.radius = 3;                                 // softening
renderer.toneMapping = THREE.ACESFilmicToneMapping;      // AgX for neon/magic, Neutral for exact UI colours
const pipeline = new THREE.RenderPipeline(renderer);     // not PostProcessing / EffectComposer
const sp = pass(scene, camera); const c = sp.getTextureNode('output');
pipeline.outputNode = c.add(bloom(c, 0.55, 0.45, 0.82));
renderer.setAnimationLoop((t) => { timer.update(t); pipeline.render(); }); // const timer = new THREE.Timer()
```
Node materials: `new THREE.MeshStandardNodeMaterial({ color, roughness, metalness })`, then `mat.colorNode = ...`, `mat.emissiveNode = ...`, `mat.positionNode = positionLocal.add(...)`. HDR glow: `new THREE.Color(4, 2, 8)` on a `MeshBasicNodeMaterial`. Metals need an environment: `scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture` (import RoomEnvironment from `three/addons/environments/RoomEnvironment.js`).

Recipes that work:
- **Procedural sky/space**: kit `spaceBackground(scene, {nebulaA, nebulaB})` (TSL `backgroundNode`, zero draw calls).
- **Painted textures**: kit `canvasTexture(w, h, (ctx) => {...}, { repeat: [4,4] })` — wood grain, marble veins, brushed metal, brush-stroke foliage.
- **Many objects**: `InstancedMesh` for copies, `BatchedMesh` for varied geometry, `BufferGeometryUtils.mergeGeometries` for static scenery. Budget ≤300 draw calls.
- **Particles**: pooled `InstancedMesh` of small quads/spheres, or `Sprite` + `SpriteNodeMaterial` with radial `uv()` falloff.
- **Readable silhouettes**: height hierarchy, a unique top motif per type, dark base + light rim; test at thumbnail size.

## Stage 3 — Game feel (check every verb)
For each verb (move, select, shoot, jump, capture, buy…): visual response + `sfx.*` within 100 ms, an eased `tween`, particles, and for impacts `shake(0.05–0.2)` + 40–80 ms hitstop. Forgiveness: coyote 100 ms, input buffer 120 ms. Accessibility via kit settings (shake, flash, colorblind, reduced motion, volume, quality) plus difficulty in the menu. Touch controls for anything playable. Fun, not compulsion.

## Stage 3b — Music and animation (kits do the heavy lifting)
```js
import { createMusic, createAmbience, speak } from '/shared/sd-music.js';
import { squash, hop, cine, spring, keys, gait, ik2, cloth } from '/shared/sd-anim.js';
import { score } from './music.js';                      // copy games/_template/music.js and rewrite it
const music = createMusic(score).play('menu');           // starts after the first click/key automatically
music.play('play'); music.intensity(danger); music.sting('win');
hitstop(60); await squash(piece, 0.3); slowmo(0.35, 0.8); await cine(camera, [{ pos: [0, 3, 5], look: target, dur: 0.9 }], { bars: true });
```
Score rules: one motif reused in every track; bass + chords + hook + light rhythm; 4–8 chords; calm games stay sparse. Run `node tools/music-check.mjs http://127.0.0.1:8100 /games/<id>/music.js` — fix any SILENT/HOT line. Animation rules: anticipation → action → settle; input never waits more than 150 ms; skip camera moves when `settings.reducedMotion`.

## Stage 4 — Verify (non-negotiable)
```bash
php -S 127.0.0.1:8100 router.php &                        # from repo root
node tools/shot.mjs "http://127.0.0.1:8100/games/<id>/?webgl" out.png 4
```
- Always `?webgl` for screenshots (headless WebGPU canvases come out blank). Wait on `__cam.frames`.
- Write a Playwright script that clicks `#sd-start`, drives input through `__cam.game` hooks, and asserts zero page errors.
- Read every screenshot **twice**: (1) did it render, (2) is it right — black surfaces, floating/intersecting geometry, z-fighting, unreadable silhouettes, too dark, UI overlap at 390×844.
- Unit-test pure logic with node (rules, scoring, solvability).
- **Gauntlet**: name the commercial bar, score your screenshots /10 as a harsh outside critic, fix the top three issues, repeat. Report the honest score.

## Stage 5 — Release checklist
```
[ ] menu + pause + settings + difficulty      [ ] onboarding in play, win/finale, teaching fail states
[ ] save/resume if session > 3 min            [ ] remix keys honoured (and live via postMessage)
[ ] touch + keyboard (+ gamepad for action)   [ ] ≤300 draw calls, DPR≤2, no per-frame allocations
[ ] __cam probe + game hooks                  [ ] 0 page errors in automated play
[ ] thumb.jpg in-game hero shot, shots/*.png  [ ] credits for every third-party asset; PG-13
[ ] // FABLE: markers for animation/music     [ ] Gauntlet score reported honestly
```

## Pitfalls seen in practice
- Forgetting `await renderer.init()` → first frame errors.
- `MeshStandardMaterial` (classic) works under WebGPURenderer, but TSL nodes need the `*NodeMaterial` classes.
- Two complementary gradient stops render grey; use three.
- Fog colour must match the horizon, not the zenith.
- Noise gates set on [-1,1] fire almost never — real summed-octave noise has σ≈0.12–0.2.
- Pointer lock throws outside a user gesture; never gate movement on it.
- `ExtrudeGeometry`/`LatheGeometry` with flat normals: `mergeVertices()` before `computeVertexNormals()`.
- A side panel over the board: `camera.setViewOffset` so the play area stays centred in the visible part.
- Per-object highlight on one shared material: a per-vertex/instance attribute or `userData` uniform, not a cloned material.
- `positionLocal` is post-instance in r187 — use `positionGeometry` for per-instance patterns.
- Pale materials go white under a PMREM env — lower `envMapIntensity` per material.
- ACES washes out neon; use `THREE.NeutralToneMapping` for neon/arcade and card/board games.
- Never add/remove lights at runtime (shader recompiles); reuse a fixed pool.
- One canvas texture per building can't be merged — use a TSL window grid driven by a vertex attribute.
- Canvas-2D games are fine for cards/match-3 (crisp text at phone size); still expose `window.__cam` with `frames`/`dataReady`.
