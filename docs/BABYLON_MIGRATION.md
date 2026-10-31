# Babylon.js migration

## Decision

Arkvoid will move to Babylon.js as its only 3D runtime. React remains the application/UI layer; Supabase remains the persistence and authentication layer; Vite and Vercel remain the build/deployment path.

The migration is staged because the current runtime has approximately 100 engine TypeScript files coupled to Three.js APIs. The current production world must remain available until equivalent Babylon implementations pass the same functional and performance gates.

## Stage 1 — Babylon foundation (this change)

- Pin `@babylonjs/core` and `@babylonjs/loaders` to 9.33.1.
- Register the official glTF/GLB loader.
- Add an isolated Babylon world preview at `/?babylon=1`.
- Use WebGL as the initial compatibility baseline, with capped hardware scaling (1.5 mobile / 2 desktop).
- Keep the normal `/` application on the existing world while parity work is underway.

## Stage 2 — Engine contract and lifecycle

Port the engine lifecycle, rendering presenter, metrics, adaptive quality governor, resize/visibility/context lifecycle and disposal rules to Babylon. Keep frame-loop systems outside React and preserve the 10 Hz UI bridge contract.

## Stage 3 — World and effects

Port the scene in dependency order: lighting/materials, terrain and collision, islands/architecture, sky and clouds, water, vegetation, wind, particles and region streaming. Preserve the existing world geometry and spatial coordinate contracts until each equivalent passes comparison tests.

## Stage 4 — Characters and controls

Port the player controller, camera rig, input, interaction system, resident pool and animation state. Validate touch controls and keyboard/mouse controls on real phones and desktop browsers.

## Stage 5 — Application cutover

Switch `WorldHost` to the Babylon runtime, port scene audits/benchmark/leak tests, update the architecture constitution and remove Three.js plus `@types/three`. Regenerate the package-manager lockfile and run the complete test/build workflow before merging.

## Non-negotiable migration gates

- TypeScript strict check, existing unit tests and production build pass.
- No Three.js imports remain in the active runtime at final cutover.
- No duplicate WebGL canvases or simultaneous renderer contexts in production.
- All runtime systems have deterministic teardown; repeated enter/leave does not grow GPU memory.
- Mobile adaptive quality is enabled; DPR is capped and GPU-heavy effects have low-tier fallbacks.
- The existing auth, character creation, arrival, map, travel, progression, saves and NPC interaction flows continue to work.
- A real Android device test verifies stable controls and at least 30 FPS in the target Home Reach scene. Desktop emulation alone is not acceptance.
- GLB loads are same-origin by default. Every asset has an explicit licence record and failed optional assets have graceful fallbacks.

## Why the legacy renderer remains temporarily

A renderer replacement cannot safely preserve the application by changing only the `Engine` constructor. The current world systems directly construct and mutate Three.js scenes, meshes, materials, textures, skeletons, cameras, post-processing targets and renderer diagnostics. The Babylon preview isolates the new renderer without making the existing application unbootable. The production route changes only after all required systems have Babylon implementations and the acceptance gates above pass.
