# Arkvoid World Atlas

## Coordinate convention

World positions are JavaScript float64 metres. X increases east, Y increases upward, and Z increases south, matching the existing engine convention. The Cloud Ocean surface at Y = -22 m is the sea-level visual reference.

A region's `origin` is the centre/anchor of its XZ footprint; `extent` is its full width and depth. `elevation.min/max` are absolute world-Y limits. This convention keeps the existing Home Reach coordinates unchanged. The one intentionally tuned anchor is Capital Valley (X = -5000 m rather than the initial approximate -3200 m) so its horizontal envelope does not overlap Veiled Peaks. The three distant regions below are now built as procedural, walkable environments. The remaining planned regions are intentionally excluded from rendering and player-facing travel until their terrain, collision, assets and performance budgets are ready.

The current `OriginOffset` is zero. `toLocal` and `toWorld` are defined for the floating-origin implementation; a future coordinated rebase must move all local scene holders in the same synchronous operation before changing the offset in a live session.

| Region | Status | Anchor (X, Y, Z) m | Extent X × Z | Elevation Y m | Terrain recipe |
|---|---|---:|---:|---:|---|
| Home Reach | Built | 0, 0, 0 | 640 × 640 | -30 to 15 | floating-island-chain |
| Veiled Peaks | Built · procedural/walkable | 2400, 0, -3600 | 1800 × 1800 | 0 to 300 | snow-cut-ridge-valley |
| Capital Valley | Built · procedural/walkable | -5000, 0, -2400 | 1900 × 1900 | 0 to 100 | braided-river-valley |
| Primordial Forest | Built · procedural/walkable | -1800, 0, 4200 | 1900 × 1900 | 0 to 120 | ancient-karst-forest |
| Astral Reach | Planned | 0, 6000, -9000 | 8000 × 8000 | 4000 to 7000 | celestial-fracture |
| Deep Sanctuary | Planned | 4000, -900, 3000 | 3000 × 3000 | -1500 to -300 | karst-cavern-network |

Veiled Peaks, Capital Valley and Primordial Forest are present in `BUILT_REGIONS`, built area/region seed arrays, spatial queries, player Atlas and the renderer. Their current terrain and setpieces are procedural and walkable; they are not yet a fully streamed, high-fidelity open world. Astral Reach and Deep Sanctuary remain planned and are excluded from built seeds, spatial queries and rendering. The distant Home Reach mountain silhouettes remain a separate non-walkable backdrop.

## Built Home Reach areas

| Area ID | Region | Geometry | Discoverable |
|---|---|---|---|
| dawn-terrace | home-reach | circle around (0, 0), radius 35 m | yes |
| still-garden | home-reach | circle around (60, -8), radius 29 m | yes |
| falls-of-light | home-reach | circle around (38, -52), radius 26 m | yes |
| sanctuary | home-reach | circle around (-10, -120), radius 34 m | no |

The current production database has one `home-reach` region and the three reachable area rows. The accompanying migration adds the Sanctuary area row so the Atlas's built-area set agrees with the database foreign key. Planned area rows are not created.

To add a new built area, first add a validated entry under a built region in `src/engine/world/atlas/Atlas.ts`, then add its row to the database migration:

```sql
insert into public.areas (id, region_id, name)
values ('new-area-id', 'home-reach', 'New Area')
on conflict (id) do nothing;
```

An area must fit inside its parent region, have a valid spawn within its declared shape, and use an existing region ID. Only discoverable built areas may be sent to `discover_area(p_area)`.

## Travel graph

The graph preserves the existing authored bridges AB and BC as walkable edges. The Sanctuary's existing conceptual connection is represented as a skyway transfer; it is not a walking edge. Built distant regions are selected directly from the Atlas and do not require a physical portal, gate or in-world waypoint. Planned regions will use the Atlas when their environments are ready.

The design rule is that intended same-trip walking destinations should be no more than four walking minutes apart. At 2.3 m/s this is approximately 552 m. Long-distance travel uses direct Atlas selection or an authored skyway rather than a fabricated long walk. `shortestWalk` intentionally excludes transfers.

## Discovery

The Atlas query is non-allocating in the engine update path and retains the old two-coordinate `layout.areaAt(x, z)` API for existing callers. The three-dimensional `areaAtAtlas(x, y, z)` handles region elevation and the declared area geometry.

A discoverable area becomes eligible after three continuous seconds inside its shape. The engine emits a `discover` event once per local tracker session and calls the existing authenticated, idempotent Supabase `discover_area(p_area text)` RPC. Existing discovery IDs are fetched before the tracker is enabled to avoid firing on a returning player.

## Streaming primitives

Cell keys use 128 m cells, 512 m supercells and 2048 m megacells. The modules in `src/engine/world/streaming` define keys, rings, hysteresis, provider contracts, resource accounting, upload scheduling and a deterministic main-thread fallback job scheduler. They are foundations for provider migration; Home Reach remains hand-authored, and the three distant continents are currently built as one procedural regional terrain group each rather than cell-streamed chunks.

## Visual range

The current horizon addition creates four non-walkable procedural silhouette bands around Home Reach and four shared-material distant waterfall ribbons. It gives the current scene a stronger depth frame inspired by the supplied cultivation landscape references. It is not a streamed, walkable mountain range.

## Dev inspection

Use `?atlas=1` to show the top-down region/area/travel graph. `?stream=1`, `?terrain=1`, `?sky=1`, and `?water=1` expose development-only readouts for the corresponding data models. These inspectors are absent from production builds.

## Known scope boundaries

The current world still does not implement worker-thread transport, full cell-streaming integration for the regional terrain/asset providers, chunked mountain terrain, GPU atmosphere LUTs, volumetric cloud raymarching or projected cloud-shadow maps, weather precipitation, terrain-carved river networks, dynamic lakes, underwater collision or planar water reflections. The three new regions are real walkable procedural environments, but their landforms, settlements and residents remain early visual foundations. Those advanced systems must not be described as shipped until they are wired into the renderer, collision and streaming providers and measured on target devices.


## First-visit presentation and island scale (2026-10-31)

- Dawn Terrace (Island A) now has a 38 m source radius, with its discoverable area boundary extended to 35 m. Its tree placement budget is increased while neighbouring islands and authored bridges retain their existing coordinates.
- The first-visit camera plays a 32-second world survey across Home Reach, Veiled Peaks, Capital Valley and Primordial Forest. The survey uses region-local camera moves and editorial cuts for distant continents, and the currently framed region is made visible during each shot.
- The Atlas is the direct long-distance travel interface. Region terrain no longer includes home/return portal arches, and the old sealed-gate interaction has been removed. The local bridge network and Sanctuary skyway remain.
- Distant terrain now uses the existing rock, grass and moss PBR texture slots; background-loaded maps are refreshed without rebuilding the scene. Regional tree crowns are less conical and forest density is tuned per biome/device tier.
- The three named residents of the distant regions have additional curved hair strands. The current Wanderer is still a procedural character rig; production-grade photoreal humans require professionally authored rigged character assets, facial/hair deformation and tested animation/LOD packages.
