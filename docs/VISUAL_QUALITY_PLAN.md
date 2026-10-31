# Arkvoid World — Balanced Visual Upgrade Plan

## Decision

- Visual target: high-quality, believable fantasy environments across phones, tablets and desktop.
- Asset budget: free assets only, with commercial-use permission and documented provenance.
- Existing runtime: retain Vite, React 18, TypeScript and Three.js 0.186.1.
- Scope: make one flagship region feel complete before creating or expanding additional islands.
- Rendering policy: use production assets where they materially improve fidelity; retain procedural systems for terrain variation, placement, simulation, weather and effects.
- No engine rewrite, no paid dependency, no unlicensed asset, and no visual-quality claim without captured evidence.

## Repository findings

The current branch already contains:
- `src/engine/core/AssetStore.ts` and `TextureCatalog.ts` for texture discovery/loading and diagnostics.
- `src/config/assets.ts` and `textureTuning.ts` for texture slots and material tuning.
- `src/engine/world/MaterialLibrary.ts` and `TerrainMaterial.ts` for PBR materials.
- `src/engine/core/Quality.ts` for ultra, balanced, performance and lite presets.
- `src/lib/deviceProfile.ts` for device/GPU profiling.
- `scripts/check-budget.mjs` and existing build/typecheck/test scripts.

The constitution currently forbids downloaded 3D files and textures. That rule conflicts with the desired asset-driven fidelity and must be replaced with a controlled, licensed-asset policy. The existing texture pipeline is a foundation, not proof that production environment meshes, character models or streaming are already implemented.

## Target architecture

Keep the current engine and add only what a measured need requires:

- `src/engine/assets/AssetManifest.ts`: typed manifest for model/texture/audio metadata, bounds, LOD variants, licence record and bundle.
- `src/engine/assets/ModelLoader.ts`: GLB/glTF loading through Three.js GLTFLoader; optional Meshopt/Draco/KTX2 support only when validated assets need them.
- `src/engine/assets/AssetCache.ts`: shared in-memory cache, reference counting and deterministic disposal.
- `src/engine/assets/AssetStreaming.ts`: distance/visibility-based load and unload with concurrency limits, cancellation and fallback.
- `src/engine/assets/AssetValidation.ts`: manifest, file-size, texture-dimension, bounds, missing-file and licence-metadata checks.
- `src/engine/world/WorldComposition.ts`: deterministic authored placement and composition rules for landmarks, sightlines and biome density.
- Extend existing quality/device systems rather than creating a second quality controller.
- Preserve analytic collision; visual GLB meshes must not silently become collision authority.
- Keep React out of the frame loop. All created GPU resources must have disposal paths.

Do not add every loader dependency in advance. First validate a small representative GLB and texture set; then add only the decoder/transcoder packages required by those files.

## Implementation phases

### Phase 0 — Baseline and visual audit
1. Read the constitution and state before code changes.
2. Run the existing build, typecheck, lint, tests and asset-budget checks.
3. Capture fixed review views on desktop and a representative Android phone: spawn view, ground-level path, landmark approach, forest edge, distant skyline, daylight and dusk.
4. Record device, GPU tier, resolution, FPS/frame time, draw calls, triangle count, JS/network payload and memory where available.
5. Mark empty areas, repeated procedural silhouettes, visible low-detail characters and any broken navigation.

Exit gate: reproducible baseline and a list of concrete visual defects. No new region work before this.

### Phase 1 — Asset foundation
1. Create a typed asset manifest with stable IDs and licence/provenance fields.
2. Add GLB loading, progress/error handling, cache, cancellation and disposal.
3. Add KTX2 only after validating the browser/device support and actual texture pipeline.
4. Support model LODs and texture resolution variants through the existing quality preset.
5. Keep asset files out of the initial JavaScript bundle; load on demand.
6. Add automated validation for missing files, unsupported formats, oversized files, absent licence records and duplicate IDs.

Exit gate: a representative environment GLB and PBR texture set loads, renders, unloads and reloads without console errors or growing GPU resource counts.

### Phase 2 — Flagship region art pass
1. Freeze expansion of unfinished islands.
2. Select the existing reachable starting region as the flagship; do not add another island to disguise empty space.
3. Build a coherent composition: one recognisable skyline, a major sect/temple landmark, secondary structures, a traversable main route, natural terrain transitions, forest/water feature and distant silhouettes.
4. Replace primitive-looking focal assets with authored/licensed GLB models and high-quality PBR materials.
5. Use procedural placement for varied rocks, plants and debris, with exclusion zones around paths, landmarks and gameplay spaces.
6. Add distant set dressing and atmospheric depth without filling every square metre with repeated props.
7. Make every visible region boundary intentional: vista, cliff, cloud sea, forest wall or a meaningful route—not an unfinished blank.

Exit gate: the flagship region has no accidental empty placeholders in the player-visible route and has consistent composition from ground and aerial review views.

### Phase 3 — Character quality
1. Replace the procedural mannequin-like presentation for hero/resident characters with licensed, rigged models or original models created in Blender.
2. Require a consistent skeleton, correct scale, PBR skin/materials, expressive face, detailed hair and layered non-revealing clothing.
3. Provide at least idle, walk, run and interaction animation clips; verify retargeting and foot contact.
4. Keep unique resident identity through authored appearance profiles and controlled variation—not random face or costume combinations.
5. Provide near/mid/far LODs and reduced animation/update rates for distant residents.
6. If no suitable free commercial-use model exists, create a deliberate original Blender asset; do not use a questionable download.

Exit gate: close-up, mid-distance and distant character review passes; no placeholder/doll-like hero resident remains in the flagship presentation.

### Phase 4 — Mobile performance and loading
1. Profile on a real mid-range Android device and desktop; do not infer phone performance from desktop.
2. Stream by region/visibility and unload assets outside the active radius.
3. Use instancing for repeated foliage/props, merged static geometry only where it preserves culling, and LOD/HLOD for distant architecture.
4. Use compressed textures and mesh compression only after compatibility testing.
5. Apply GPU-tier quality presets: texture size, shadow map, vegetation density, draw distance, effects and render scale.
6. Avoid expensive real-time shadows on every small prop; use baked/contact shading where visually acceptable.
7. Add a graceful low-memory fallback and WebGL context recovery.

Exit gate: stable frame pacing and no progressive memory growth after ten world entry/exit cycles on the representative phone.

### Phase 5 — Visual and regression acceptance
1. Run build, typecheck, lint, unit tests, collision checks and budget checks.
2. Verify world entry, locomotion direction, bridges, collision, interactions and resident animation.
3. Compare fixed review shots against the Phase 0 baseline.
4. Record measured FPS/frame time, draw calls, triangles, texture memory, downloaded asset bytes and startup timings for each device tier.
5. Attach screenshots and a short capture/video to the PR. A build passing is not proof of visual quality.
6. Update `docs/STATE.md` with only verified changes, exact test commands/results, known issues and device details.

Exit gate: all automated checks pass; no critical visual regression; the flagship review views meet the acceptance checklist; phone performance remains stable. If a gate fails, fix it before expanding the world.

## Asset requirements and formats

### Preferred runtime formats
- Models: GLB/glTF 2.0, with PBR metallic-roughness materials, correct normals/tangents, UVs, sensible origins and real-world scale.
- Textures: KTX2/Basis Universal where validated; otherwise WebP/PNG/JPEG according to map semantics and browser support.
- Geometry compression: Meshopt or Draco only when the selected asset and loader path are tested together.
- Animation: glTF animation clips with a documented skeleton/retargeting convention.
- Audio: compressed browser-compatible formats, streamed/loaded by region.
- Source files: retain Blender source outside runtime bundles where practical; runtime consumes optimised exports.

### Asset categories — first flagship pack
1. Terrain: cliff faces, boulders, rock strata, soil, gravel, path, moss and ground-cover PBR sets.
2. Architecture: one hero temple/sect complex, 3–5 secondary building silhouettes, modular roof/wall/column/stair/bridge pieces, doors, railings, ornaments and interior props.
3. Vegetation: 3–5 distinct tree silhouettes, shrubs, grasses, ferns, flowers, roots, fallen logs and ground debris.
4. Water/atmosphere: waterfall geometry, river/pond surfaces, foam/mist elements, cloud/fog layers and wind-reactive vegetation.
5. Characters: one hero resident, a small set of distinct supporting residents, rig, face/hair/clothing assets and animation clips.
6. Wildlife: a small curated set of birds/ambient creatures only after environment and character gates pass.
7. Audio: region ambience, wind, water, foliage, footsteps and landmark-specific cues.

### Initial asset count target
This is a curated starting pack, not a requirement to fill the world with copies:
- 1 hero architecture complex plus 3–5 modular/secondary building kits.
- 8–12 rock/cliff/boulder variants.
- 3–5 tree silhouettes plus 8–12 ground-cover/plant variants.
- 6–10 PBR material sets for terrain, stone, roof, plaster, timber, bark, moss and paths.
- 1 hero resident model plus 3–5 supporting resident models or genuinely distinct authored variants.
- 4 core animation states per character: idle, walk, run, interaction.
All assets must be individually reviewed before inclusion.

## Balanced quality and performance guardrails

Use current project budgets as ceilings unless a measured baseline demonstrates they must be revised. Do not silently relax budgets to make a scene pass.

- Initial JS remains at or below the existing 200 KB gzip budget.
- World chunk remains at or below the current repository budget; asset files must not be bundled into that chunk.
- Preserve the existing 40 MB texture download budget and 60 MB phone texture-memory budget as initial hard limits; measure actual model and audio payloads separately.
- Target 30 FPS minimum stable on the representative mid-range phone, with 40 ms p95 frame time as the existing mobile ceiling; aim for 60 FPS when hardware allows.
- Keep draw calls, triangle counts, DPR and vegetation density tiered. Re-baseline actual values before changing existing documented ceilings.
- Use progressive loading: first view should show a composed, lightweight vista while nearby high-detail assets stream in.
- No blocking download of the entire world.

## Free asset sourcing and licence policy

Preferred sources:
- Poly Haven — CC0 assets; use for HDRIs, textures and models where available.
- ambientCG — CC0 materials and textures.
- Quaternius — use only packs whose individual published licence explicitly permits the intended commercial use.
- Kenney — use only assets whose published licence and attribution requirements are recorded.
- Blender — original modelling, retopology, UVs, rigging, baking and export tools; software use does not change the licence of imported source assets.

Do not treat a website being free to browse/download as permission for commercial use. Do not assume all assets from a marketplace share one licence. Avoid NC, ND, editorial-only, unclear or missing licences. No scraped assets, ripped game assets, AI-generated imitations of identifiable artists' work, or assets with unclear redistribution rights.

Every asset record must include: asset ID, filename/path, creator, source page URL, exact licence name/version, licence URL, attribution text (or explicit none), commercial-use status, modification status, date acquired, original file hash, runtime export settings, and intended use. Keep licence text or a stable copy where permitted. Re-check terms before public release.

## Asset directory convention

```
public/assets/
  environments/<region>/<asset-id>/
  architecture/<kit>/<asset-id>/
  vegetation/<biome>/<asset-id>/
  characters/<character-id>/
  creatures/<creature-id>/
  materials/<material-id>/
  audio/<region>/
src/engine/assets/
  AssetManifest.ts
  ModelLoader.ts
  AssetCache.ts
  AssetStreaming.ts
  AssetValidation.ts
docs/
  VISUAL_QUALITY_PLAN.md
  ASSET_LICENSES.md
  STATE.md
```

Do not commit large unoptimised source archives or duplicate 4K/8K maps. Keep only approved runtime exports in the app repository; store editable source files separately with their licence records.

## Definition of done

A phase is not complete because files exist or the Vercel deployment is green. It is complete only when:
- the implementation is present on the intended branch;
- automated checks have actually run and passed;
- the relevant scene has been opened and visually inspected;
- mobile and desktop behaviour has been measured;
- asset licences and payloads are documented;
- screenshots and test evidence are attached;
- `docs/STATE.md` reports verified facts and outstanding defects honestly.
