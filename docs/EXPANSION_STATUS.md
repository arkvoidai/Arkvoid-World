# Expansion E1–E5 implementation status

This document distinguishes implemented code from the larger engineering specifications.

## E1: Atlas and coordinates

Implemented:
- Float64 metre coordinate types, origin conversion helpers and 128 m cell-key helper.
- Typed six-region atlas with one built Home Reach region and five planned data-only regions.
- Region/area validation, non-allocating 3D area lookup, built-only data seeds and built-only UI data.
- Travel graph preserving the existing two authored bridges and Sanctuary skyway.
- Three-second discovery tracker, API methods and existing authenticated RPC integration.
- Development atlas inspector.
- Migration adding the Sanctuary area row, without inserting planned-region data.

Not yet implemented:
- Full validation that every gate endpoint is connected to a real built waypoint.
- The four-minute walk rule for every future authored settlement route; only current built Home Reach walk edges are meaningful now.
- The planned regions' authored settlement/area geometry and unlock flow.

## E2: Large-world foundations

Implemented:
- 128 m / 512 m / 2048 m cell math, five distance rings and unload hysteresis.
- Provider interfaces and registry.
- Generation job contract with priority, generation counters, cancellation and a 3 ms main-thread fallback.
- Upload queue and byte-accounting LRU budget with an R0 eviction guarantee.
- Float64 origin offset, 128 m snap rebase helper and round-trip tests.
- Development streaming readout.

Not yet implemented:
- Actual Web Worker transport and transferable-buffer worker modules.
- Migration of existing island, tree, grass, rock, building and water builders into cell providers.
- Upload warm-render queue integration with the live renderer.
- Full scene-wide coordinated rebase of camera, actors, shaders, lights, grass push points and shadow cameras.
- IndexedDB worker-result cache and 10-minute/200-cell leak benchmarks.

## E3: Terrain and mountain ranges

Implemented:
- Deterministic six-octave ridged height sampling for the Veiled Peaks recipe.
- Four non-walkable procedural silhouette distance bands visible around Home Reach.
- Four distant waterfall ribbons using a shared animated shader material.
- Mobile and desktop geometry density variants.

Not yet implemented:
- Worker-generated quadtree terrain tiles, clipmap LOD, edge stitching and geomorphing.
- GPU/CPU terrain collision parity and integration with `heightAt`/ `resolveMove`.
- PBR grass/moss/rock/snow/scree terrain layers, river carving and authored walkable mountain terrain.
- Full visual capture and triangle/draw-call profiling on desktop and phone.

## E4: Atmosphere, clouds and weather

Implemented:
- Deterministic regional weather selection with smooth transitions and a 150 m visibility floor helper.
- CPU reference atmosphere transmittance/inscatter functions.
- Cloud Sea heightfield shader responds to coverage and density from the weather controller.
- Distant mountain material colours are synchronized with the live sky colours.

Not yet implemented:
- GPU transmittance, multiple-scattering and sky-view LUT renderer.
- LUT-driven aerial perspective applied to every world material.
- Volumetric cloud raymarching, temporal accumulation, projected cloud-shadow texture and god-ray/cloud coupling.
- Rain/snow particle systems, wet-material propagation, weather audio events, Milky Way and moon-phase model.
- GPU timing against the requested per-tier budgets.

## E5: Water

Implemented:
- Deterministic Catmull–Rom river-ribbon data builder with flow vectors and depth attributes.
- Water absorption, shoreline wetness, shallow-water walkability and waterfall LOD helper models.
- Distant waterfall visual layer; existing Home Reach pond, stream and waterfalls are preserved.

Not yet implemented:
- Flow-tile generation and terrain-carved streamed rivers.
- River/lake rendering with depth, Fresnel reflection, refraction, caustics and shoreline foam.
- Lake discovery, wading collision/speed modifier and deep-water blocking.
- Near/mid/far waterfall LOD crossfades, spray/mist pooling, rainbows and audio proximity events.
- End-to-end rendering and performance verification.

No external third-party art or texture assets were added in this expansion. The distant geometry and shader code are procedural and generated within this repository.
