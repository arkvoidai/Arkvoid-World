# Arkvoid World Atlas

## Coordinate convention

World positions are JavaScript float64 metres. X increases east, Y increases upward, and Z increases south, matching the existing engine convention. The Cloud Ocean surface at Y = -22 m is the sea-level visual reference.

A region's `origin` is the centre/anchor of its XZ footprint; `extent` is its full width and depth. `elevation.min/max` are absolute world-Y limits. This convention keeps the existing Home Reach coordinates unchanged. The one intentionally tuned anchor is Capital Valley (X = -5000 m rather than the initial approximate -3200 m) so its horizontal envelope does not overlap Veiled Peaks. The region values are data and may be tuned before those regions become built.

The current `OriginOffset` is zero. `toLocal` and `toWorld` are defined for the floating-origin implementation; a future coordinated rebase must move all local scene holders in the same synchronous operation before changing the offset in a live session.

| Region | Status | Anchor (X, Y, Z) m | Extent X × Z | Elevation Y m | Terrain recipe |
|---|---|---:|---:|---:|---|
| Home Reach | Built | 0, 0, 0 | 640 × 640 | -30 to 15 | floating-island-chain |
| Veiled Peaks | Planned | 2400, 0, -3600 | 7000 × 7000 | 20 to 3400 | eroded-ridged-massifs |
| Capital Valley | Planned | -5000, 0, -2400 | 5000 × 5000 | 40 to 450 | braided-river-valley |
| Primordial Forest | Planned | -1800, 0, 4200 | 6000 × 6000 | 30 to 800 | ancient-karst-forest |
| Astral Reach | Planned | 0, 6000, -9000 | 8000 × 8000 | 4000 to 7000 | celestial-fracture |
| Deep Sanctuary | Planned | 4000, -900, 3000 | 3000 × 3000 | -1500 to -300 | karst-cavern-network |

Planned regions are source data only. They are excluded from `BUILT_REGIONS`, database seed arrays, area queries, player UI and rendered content. The current far mountain silhouettes are a non-walkable environmental backdrop, not an activation of Veiled Peaks.

## Built Home Reach areas

| Area ID | Region | Geometry | Discoverable |
|---|---|---|---|
| dawn-terrace | home-reach | circle around (0, 0), radius 34 m | yes |
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

The graph preserves the existing authored bridges AB and BC as walkable edges. The Sanctuary's existing conceptual connection is represented as a skyway transfer; it is not a walking edge. Future long-distance regions use gated waypoints and remain planned until implemented.

The design rule is that intended same-trip walking destinations should be no more than four walking minutes apart. At 2.3 m/s this is approximately 552 m. Long-distance travel uses unlocked gates or skyways rather than a fabricated long walk. `shortestWalk` intentionally excludes transfers.

## Discovery

The Atlas query is non-allocating in the engine update path and retains the old two-coordinate `layout.areaAt(x, z)` API for existing callers. The three-dimensional `areaAtAtlas(x, y, z)` handles region elevation and the declared area geometry.

A discoverable area becomes eligible after three continuous seconds inside its shape. The engine emits a `discover` event once per local tracker session and calls the existing authenticated, idempotent Supabase `discover_area(p_area text)` RPC. Existing discovery IDs are fetched before the tracker is enabled to avoid firing on a returning player.

## Streaming primitives

Cell keys use 128 m cells, 512 m supercells and 2048 m megacells. The modules in `src/engine/world/streaming` define keys, rings, hysteresis, provider contracts, resource accounting, upload scheduling and a deterministic main-thread fallback job scheduler. They are foundations for provider migration; the current Home Reach builders are still authored as they were.

## Visual range

The current horizon addition creates four non-walkable procedural silhouette bands around Home Reach and four shared-material distant waterfall ribbons. It gives the current scene a stronger depth frame inspired by the supplied cultivation landscape references. It is not a streamed, walkable mountain range.

## Dev inspection

Use `?atlas=1` to show the top-down region/area/travel graph. `?stream=1`, `?terrain=1`, `?sky=1`, and `?water=1` expose development-only readouts for the corresponding data models. These inspectors are absent from production builds.

## Known scope boundaries

The current expansion branch does not yet implement worker-thread transport, the full cell streaming integration for existing content providers, a chunked walkable mountain terrain/collision system, GPU atmosphere LUTs, volumetric cloud raymarching or projected cloud-shadow maps, weather particle precipitation, terrain-carved river networks, dynamic lakes, underwater collision or planar water reflections. The helper modules and interfaces are deliberate foundations; those systems must not be described as shipped until they are wired into the renderer, collision and streaming providers and measured on devices.
