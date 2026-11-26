---
name: amazing-game-development-haiku
description: Haiku-tier browser-game recipe for Superdreams — copy the working template, fill six labelled sections, one task per message, no custom shaders. Uses three.js r187 through the shared kit so the model never touches renderer, post-processing or shadow APIs directly. Trigger on any small playable browser game, "make it nicer", "add juice", "fix the game", or remix/redream work on a Haiku-class model.
---

# Amazing Game Development — Haiku edition

**Rule 1: never start from a blank file.** Copy the template:
```bash
cp -r games/_template games/<id>
```
The template already works (menu, settings, save, shadows, bloom, vignette, lights, space sky, remix config, test probe). You only fill sections **A–F** in `games/<id>/index.html` and edit `meta.json`.

**Rule 2: one task per message.** Do one section, verify, then the next.

**Rule 3: do not write shaders** (no GLSL, no TSL `Fn`). Use colours, kit helpers and `canvasTexture` for detail.

**Rule 4: do not change** the import map, `createRenderer`, `createPipeline`, or the kit. Never use `outputEncoding`, `PCFSoftShadowMap`, `THREE.Clock` or `EffectComposer`; the kit already handles all of this.

## The six sections
**A. DEFAULTS** — every number/colour/mode a player might change. Same keys go in `meta.json` `remix` (types: `choice`, `color`, `range`, `bool`).
```js
const DEFAULTS = { difficulty: 'normal', colors: { accent: '#ffb347', ground: '#2a3566' }, goal: 10 };
```
**B. RENDER STACK** — leave as is. Swap `spaceBackground(scene)` for `scene.background = new THREE.Color('#87b5e8'); scene.fog = new THREE.FogExp2('#87b5e8', 0.02)` for daytime games.

**C. WORLD** — build objects from simple shapes. Allowed materials:
```js
new THREE.MeshStandardNodeMaterial({ color: '#...', roughness: 0.6, metalness: 0.1 })  // keep metalness ≤ 0.3
new THREE.MeshBasicNodeMaterial({ color: new THREE.Color('#ffaa33').multiplyScalar(3) }) // glows with bloom
```
If a light-coloured object looks pure white, set `mat.envMapIntensity = 0.2`. Never add or remove lights while playing.
Set `mesh.castShadow = true` on objects and `receiveShadow = true` on the ground. Many copies of one shape → `new THREE.InstancedMesh(geo, mat, count)`.
Detail texture:
```js
const tex = canvasTexture(256, 256, (ctx, w, h) => { ctx.fillStyle = '#6b4a2b'; ctx.fillRect(0, 0, w, h); /* draw stripes, dots */ }, { repeat: [4, 4] });
```
**D. STATE + RULES** — one `state` object, small functions (`collect()`, `win()`, `lose()`). Every action calls a sound: `sfx.click / select / move / thud / capture / chime / magic / zap / error / win / lose`. Big moments add `shake(0.1)` and `flash('#fff')`. Save bests with `store.set('<id>-best', value)`.

**E. UI** — `startMenu({ title, subtitle, options, onStart })` and `settingsButton()` are already there. Messages: `toast('text')`. Keep the HUD to one line in `#hud`.

**F. LOOP + PROBE** — put per-frame logic inside `startLoop((dt, t) => { ... })`. Multiply all movement by `dt`. Add your test hooks to `probe(renderer, { game: { ... } })`.

## Juice checklist (do all)
- Every input makes a sound **and** a visible change.
- Use `tween(0.25, (k) => ...)` for scale pops and slides, never instant jumps.
- Particles on pickups/hits (small spheres in an InstancedMesh that fly out and shrink).
- Idle motion: things bob or rotate slowly (`Math.sin(t)`).

## Verify (every section)
```bash
php -S 127.0.0.1:8100 router.php &
node tools/shot.mjs "http://127.0.0.1:8100/games/<id>/?webgl" shot.png 4
```
1. The output must say `errors: []`. If not, fix the first error only, then rerun.
2. Open `shot.png` and look **twice**: is anything black, floating, missing or too dark? Fix one thing, rerun.
3. Always use `?webgl` in screenshot URLs.

## Done means
Menu works · game can be won and lost · sounds on every action · settings work · touch works · `meta.json` filled · `thumb.jpg` saved from an in-game screenshot · no errors · it's fun for 5 minutes.

Leave a `// FABLE:` comment wherever animation or music would help; a stronger model adds those later.
