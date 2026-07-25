# Architecture

XIV is a browser game with no server, no build-time asset pipeline and no binary content beyond
three web fonts. Everything you see is generated at runtime: the geometry is boxes, the sound is
synthesised, and the ink line is computed in a post-process rather than drawn.

This document explains the parts that are easy to break by accident.

---

## The frame

```text
                        ┌──────────────────────────────────────────┐
   requestAnimationFrame│                 Game                     │
   ────────────────────►│  clamped dt, then in strict order:       │
                        │                                          │
                        │   1. Player.update      movement, weapon │
                        │   2. Enemy.update  ×N   perception, fire │
                        │   3. triggers / pickups / story beats    │
                        │   4. Effects.update     pooled particles │
                        │   5. HUD / panels / lettering            │
                        │   6. Stage.render       ← 3 GPU passes   │
                        │   7. Input.endFrame     clear edge flags │
                        └──────────────────────────────────────────┘
```

Two rules the order encodes:

- **Guards see the player _after_ the player has moved this frame.** Reversing 1 and 2 makes
  enemies shoot at where you were, which reads as lag rather than as difficulty.
- **`Input.endFrame()` is last.** Edge-triggered actions (`pressed`, `released`) are latches
  cleared here. Anything that reads input after this point silently sees nothing.

The step is _variable_ and clamped to 1/20 s. Mouse look on a fixed step feels wrong, and the
clamp turns a stall into slow-motion instead of letting anyone tunnel through a wall.

---

## The render pipeline

The comic look is three passes, in `src/render/Stage.ts`:

```text
   scene ──► [1] colour target      MeshToonMaterial + quantised gradient map
                 + depth texture    ─────────────────────────────┐
                                                                 │
   scene ──► [2] normal target      overrideMaterial =            │
                 (view-space)       MeshNormalMaterial            │
                                    ────────────────┐             │
                                                    ▼             ▼
                                    [3] ComicPass — one full-screen triangle
                                        · Sobel over depth  → silhouettes
                                        · Sobel over normals→ interior creases
                                        · sample offsets jittered on an 11 fps
                                          clock                → the line "boils"
                                        · rotated 25° halftone → shadow tone
                                        · paper grain, vignette
                                                    │
                                                    ▼
                                                  canvas
```

Why both buffers: a depth Sobel finds silhouettes but is blind to a crease between two coplanar-ish
faces; a normal Sobel finds the crease but shimmers at distance. So the depth threshold is scaled by
distance, and the normal term is faded out past ~50 m. Get either wrong and snow turns into static.

The "boil" is the detail that sells the look. Sample offsets are perturbed by a hash that only
changes 11 times a second, so the outline wobbles the way hand-inked animation does. It is exposed
as a setting because some players find it distracting.

### Panels are real renders

`ComicPanels.show()` does not draw an icon. It places a second camera, runs the _entire_ pipeline
above into small off-screen targets, and reads the pixels back into a `<canvas>`. That frozen frame
is the panel.

`readRenderTargetPixels` is synchronous and stalls the GPU (~2 ms at 288×180). Consequences that are
not optional:

- Panels fire on **discrete events only** — a kill, an alert, a memory. Never per bullet.
- `Game` rate-limits them to one per 1.1 s, and `ComicPanels` caps concurrency at 2.
- Flashbacks temporarily push the pass into a desaturated, heavy-grain configuration and **must**
  restore it (`stage.resetComic()`) or the whole game stays grey.

---

## Collision

`src/world/Collision.ts`. Levels are axis-aligned boxes ("brushes") in a uniform XZ grid.

Movement is Quake-style move-and-slide: each axis is displaced and resolved **independently**, which
produces clean wall-sliding without the jitter a naive push-out gives in corners.

Two details that are load-bearing:

- **Step-up.** When a horizontal sweep is blocked, the body is raised by `stepHeight` (0.42 m) and
  retried. This is what makes a staircase built from boxes walkable, which is why levels never need
  a triangle collider.
- **Ground probe.** After the vertical sweep, an ungrounded body probes 12 cm down. Without it,
  walking down a stepped slope enters a one-frame fall on every step and the camera shakes.

Everything else is slab tests: bullets, line-of-sight, enemy body parts.

---

## Layout

| Directory          | Role                                                                      |
| ------------------ | ------------------------------------------------------------------------- |
| `src/render/`      | Stage (context + lighting), ComicPass (the look), toon materials, palette |
| `src/core/`        | Input, loop, procedural audio, save/settings, maths, tiny signal bus      |
| `src/player/`      | Character controller, weapon table, procedural view model                 |
| `src/ai/`          | Guard: perception, five-state machine, per-part hitboxes                  |
| `src/world/`       | Brush world, level builder, `levels/level01.ts`                           |
| `src/fx/`          | Pooled tracers, impacts, sparks, blood, shell casings                     |
| `src/ui/`          | HUD, comic panels, onomatopoeia, menus                                    |
| `src/story/`       | **All player-facing prose.** Memories, documents, beats, objectives       |
| `tests/`           | Vitest unit tests (collision, maths, data-table consistency)              |
| `tools/dashboard/` | The local project cockpit — not part of the game bundle                   |

---

## Invariants

These are the things a reviewer should push back on:

1. **Nothing allocates in the frame loop.** Sparks, casings and tracers are pooled; vectors are
   module-level scratch objects reused across calls. A firefight that allocates causes a GC pause
   at exactly the wrong moment.
2. **All prose lives in `src/story/`.** Gameplay code contains no French sentence, so the script can
   be rewritten or translated without touching logic.
3. **Levels are built from `LevelBuilder`, never from raw Three.js.** The builder keeps mesh and
   collision brush in sync; hand-adding a `Mesh` gives you geometry you can walk through.
4. **The palette is closed.** Materials pull from `src/render/palette.ts`. A one-off colour breaks
   the "printed on one press" illusion faster than anything else.
5. **`skipNormals` must list anything that should not be outlined** (the sky). Forgetting it draws
   an ink border around the horizon.

---

## Audio

`src/core/Audio.ts` contains no audio files. Every sound is a filtered noise burst plus a pitched
body, enveloped and spatialised through a `PannerNode` (HRTF). Each shot picks a random offset into
a shared 2-second noise buffer and detunes slightly — without that, two consecutive shots are
bit-identical and the ear notices immediately.

The context can only start from a user gesture, so `audio.unlock()` is wired to the first
click/keypress and to every menu button.

---

## What is deliberately missing

- **No physics engine.** A kinematic box controller is more predictable for an FPS, and Rapier's
  wasm payload would dwarf the rest of the game.
- **No lint tooling.** `tsconfig.json` runs `strict` plus `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes`; `tsc --noEmit` is the gate. See
  [`DECISIONS.md`](DECISIONS.md#adr-005--pas-deslint).
- **No MRT.** The scene is drawn twice (colour, then normals). A single multi-render-target pass
  would be faster but requires patching every material's shader. Revisit if draw calls become the
  bottleneck — they are not yet.
