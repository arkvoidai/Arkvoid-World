# Arkvoid: AAA world production roadmap

## Visual target

Build a continuous, explorable world rather than a set of disconnected beauty shots. The reference direction resolves into five visual languages:

- Veiled Peaks: immense snow-cut mountains, wind-carved ridgelines, ice-heavy pines, sunrise haze, exposed stone and a sacred peak shrine.
- Capital Valley: a lived-in river capital with layered rooflines, bridges, markets, dense residential blocks, distant citadels and readable skyline hierarchy.
- Primordial Forest: giant ancient trees, damp stone, moss, hanging vegetation, waterfalls, deep canopy shade, shafts of sunlight and clear traversable paths.
- Cloud Reach: floating islands, suspended bridges, immense cloud depth, distant waterfalls and monumental silhouettes that preserve Arkvoid's pearl-and-light identity.
- Astral Ruins: a rare late-game environment with a planetary horizon, immense structures and restrained celestial effects. This should be a separate biome, not a global post-processing filter.

The supplied images are composition and lighting references. They are not runtime backgrounds. The player must be able to walk through the authored geometry, look around it, and see it respond to light and weather.

## Production order

### 1. Asset intake and validation

- Keep source GLBs in the public arkvoid-assets Storage bucket during the prototype stage; the objects are public and downloadable by anyone with the URLs.
- Validate each model's license, axis, dimensions, pivot, triangle count, material count, texture dimensions, embedded images, and animation content before shipping.
- Produce phone, balanced desktop and hero desktop variants. Use meshopt or Draco geometry compression where appropriate and KTX2/Basis textures for GPU-friendly delivery.
- Preserve a low-cost procedural fallback for every authored landmark. A network failure must never make the region empty.
- Prefer authored hero models for the shrine, bridge, mountain silhouettes, ancient trees and distinctive rock formations. Do not replace every repeated tree or stone with a unique draw call.

### 2. Region composition

- Veiled Peaks: establish three readable depth planes (foreground pines and rocks, traversable midground shrine approach, distant mountain wall). Add snow accumulation, wind direction, blowing ground snow and icy water only where the terrain supports it.
- Capital Valley: block the river course and bridges first, then build the city in distinct districts and elevation bands. Use a limited modular architecture kit with shared materials and instanced street details. A single temple model is not a city.
- Primordial Forest: create a canopy ceiling, large root forms, layered foliage, wet rocks, waterfalls and a clear path network. Use different tree silhouettes and leaf clusters, not uniform cone crowns.
- Cloud Reach: keep the pearl islands recognizable while adding authored rock faces, believable vertical waterfalls, cloud depth and distant floating landmasses.

### 3. Rendering and atmosphere

- Establish a physically coherent exposure pipeline before adding more effects. Calibrate albedo, roughness, metalness, normal strength, ambient fill and tone mapping together.
- Use cascaded or single-cascade shadows on hardware that can sustain them. Bake contact shadows/AO into assets where possible; do not run expensive screen-space AO on phones.
- Build volumetric cloud layers and light shafts as separate, quality-scaled systems. The low tier should use layered cards and depth haze, not a lower-resolution version of the same expensive raymarch.
- Add a real snow system: wind-driven flakes, ground accumulation masks, branch loading and local particle density. Use weather regions, not a global snow overlay.
- Add water depth, shoreline foam, waterfall spray and mist with distance LODs. Water must not be a single transparent plane.
- Use biome-specific fog, sky, exposure and sound. Keep sunset warmth and dusk colour grading tied to the sun, not to a permanent purple tint.

### 4. Terrain, streaming and simulation

- Move from radial showcase islands toward streamed terrain tiles with deterministic seeds, reusable worker generation, shared height functions and matching analytic collision.
- Activate true floating-origin rebasing only after every world-space owner, shader uniform, collider, resident and streaming cell participates in the same rebase transaction.
- Stream visible regions and nearby asset cells; keep one resident region on phones and a bounded small LRU on desktops. Unload GPU resources deterministically.
- Use instancing for repeated vegetation and architecture. Add near/mid/far LODs and impostors; cull by frustum and distance before rendering.
- Keep player movement and collision allocation-free in the frame path. Do not move the world simulation into React.

### 5. Residents and life

- Import rigged characters only after their scale, skeleton, materials and animation clips pass an isolated validation scene.
- Use authored face, hair and clothing variants. Give hero residents expressive facial animation, grounded foot contact, believable turns and context-aware idle actions.
- Use lower update rates and silhouette LODs for distant residents. Persist identity, schedules and memories in Supabase; never put private model or AI secrets in public Storage.
- Make wildlife, wind, leaves, cloth, water and residents react to the same local weather and time-of-day state.

## Performance gates

- First world frame remains independent of remote GLB downloads.
- Keep the constitution's existing phone and desktop frame-time targets, draw-call ceilings and memory leak checks.
- Reject or downgrade assets when their decoded geometry exceeds the active triangle budget.
- Capture real Android phone and desktop profiles for each region at dawn, noon, dusk and night. A build pass is not a visual or performance pass.
- Run entry/exit loops repeatedly and confirm GPU textures, geometries and renderer memory return to a stable baseline.

## Current boundary

The new GLB streamer is the first authored-asset connection, not the finished AAA world. Terrain streaming, biome-scale city construction, volumetric atmosphere, weather-driven snow, water depth, character rig integration and real-device visual captures remain separate production work. Do not describe them as complete until they are implemented and measured.
