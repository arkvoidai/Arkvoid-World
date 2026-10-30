import type { WorldPos } from './Coordinates';

export type RegionStatus = 'built' | 'planned';
export type RegionKind = 'floating-islands' | 'mountain-range' | 'river-valley' | 'primordial-forest' | 'astral' | 'underground';
export type AreaShape =
  | { type: 'circle'; center: { x: number; z: number }; radius: number }
  | { type: 'aabb'; minX: number; maxX: number; minZ: number; maxZ: number }
  | { type: 'polygon'; points: readonly { x: number; z: number }[] };

export interface Area {
  id: string;
  regionId: string;
  name: string;
  shape: AreaShape;
  spawn: WorldPos;
  discoverable: boolean;
}

export interface Region {
  id: string;
  name: string;
  kind: RegionKind;
  status: RegionStatus;
  origin: WorldPos;
  extent: { x: number; z: number };
  elevation: { min: number; max: number };
  biome: { temperature: number; moisture: number; roughness: number; treeDensity: number };
  terrainRecipe: string;
  settlementRecipes: readonly string[];
  landmarks: readonly string[];
  areas: readonly Area[];
  connections: readonly string[];
  unlock?: { realm?: number; quest?: string };
  ambience: string;
}

const homeAreas: readonly Area[] = [
  { id: 'dawn-terrace', regionId: 'home-reach', name: 'Dawn Terrace', shape: { type: 'circle', center: { x: 0, z: 0 }, radius: 34 }, spawn: { x: 0, y: 0, z: 0 }, discoverable: true },
  { id: 'still-garden', regionId: 'home-reach', name: 'Still Garden', shape: { type: 'circle', center: { x: 60, z: -8 }, radius: 29 }, spawn: { x: 60, y: -2, z: -8 }, discoverable: true },
  { id: 'falls-of-light', regionId: 'home-reach', name: 'Falls of Light', shape: { type: 'circle', center: { x: 38, z: -52 }, radius: 26 }, spawn: { x: 38, y: 1, z: -52 }, discoverable: true },
  { id: 'sanctuary', regionId: 'home-reach', name: 'Sanctuary', shape: { type: 'circle', center: { x: -10, z: -120 }, radius: 34 }, spawn: { x: -10, y: 12, z: -120 }, discoverable: false },
];

function makeRegion(
  id: string, name: string, kind: RegionKind, status: RegionStatus,
  origin: WorldPos, extent: { x: number; z: number }, elevation: { min: number; max: number },
  biome: Region['biome'], terrainRecipe: string, settlementRecipes: readonly string[],
  landmarks: readonly string[], areas: readonly Area[], connections: readonly string[],
  ambience: string, unlock?: Region['unlock'],
): Region {
  return { id, name, kind, status, origin, extent, elevation, biome, terrainRecipe, settlementRecipes, landmarks, areas, connections, ambience, unlock };
}

/**
 * origin is the centre/anchor of the XZ footprint; extent is its full width/depth.
 * Elevation is an absolute Y range. The small coordinate adjustments keep the
 * current region envelopes disjoint while retaining the requested placements.
 */
export const WORLD_ATLAS: readonly Region[] = [
  makeRegion('home-reach', 'Home Reach', 'floating-islands', 'built',
    { x: 0, y: 0, z: 0 }, { x: 640, z: 640 }, { min: -30, max: 15 },
    { temperature: 0.55, moisture: 0.64, roughness: 0.25, treeDensity: 0.42 },
    'floating-island-chain', ['main-sect', 'archive-pavilion', 'falls-shrine'],
    ['main-hall', 'spirit-pond', 'bell-tower', 'falls-edge'], homeAreas,
    ['bridge-ab', 'bridge-bc', 'sanctuary-skyway', 'gate-veiled-peaks', 'gate-capital-valley', 'gate-primordial-forest', 'gate-astral-reach', 'gate-deep-sanctuary'],
    'home-reach-wind-water-birds'),
  makeRegion('veiled-peaks', 'Veiled Peaks', 'mountain-range', 'planned',
    { x: 2400, y: 0, z: -3600 }, { x: 7000, z: 7000 }, { min: 20, max: 3400 },
    { temperature: 0.18, moisture: 0.72, roughness: 0.92, treeDensity: 0.18 },
    'eroded-ridged-massifs', ['cloud-ring-monastery', 'high-mountain-sect'],
    ['three-crowned-massif', 'silver-falls'], [], ['gate-veiled-peaks'], 'high-altitude-wind-bells', { realm: 2 }),
  makeRegion('capital-valley', 'Capital Valley', 'river-valley', 'planned',
    { x: -5000, y: 0, z: -2400 }, { x: 5000, z: 5000 }, { min: 40, max: 450 },
    { temperature: 0.62, moisture: 0.82, roughness: 0.22, treeDensity: 0.32 },
    'braided-river-valley', ['celestial-capital', 'riverfront-quarter', 'outer-villages'],
    ['imperial-palace', 'grand-harbour', 'nine-arch-bridge'], [], ['gate-capital-valley'], 'river-market-bells', { realm: 2 }),
  makeRegion('primordial-forest', 'Primordial Forest', 'primordial-forest', 'planned',
    { x: -1800, y: 0, z: 4200 }, { x: 6000, z: 6000 }, { min: 30, max: 800 },
    { temperature: 0.48, moisture: 0.96, roughness: 0.58, treeDensity: 0.98 },
    'ancient-karst-forest', ['root-sanctuary', 'forest-outpost'], ['world-tree', 'moonfall-cascade'], [], ['gate-primordial-forest'], 'forest-insects-deep-water', { realm: 2 }),
  makeRegion('astral-reach', 'Astral Reach', 'astral', 'planned',
    { x: 0, y: 6000, z: -9000 }, { x: 8000, z: 8000 }, { min: 4000, max: 7000 },
    { temperature: -0.42, moisture: 0.12, roughness: 0.72, treeDensity: 0.02 },
    'celestial-fracture', ['astral-observatory'], ['starfall-archive', 'ringed-world'], [], ['gate-astral-reach'], 'aurora-cosmic-resonance', { realm: 4 }),
  makeRegion('deep-sanctuary', 'Deep Sanctuary', 'underground', 'planned',
    { x: 4000, y: -900, z: 3000 }, { x: 3000, z: 3000 }, { min: -1500, max: -300 },
    { temperature: 0.72, moisture: 0.94, roughness: 0.86, treeDensity: 0 },
    'karst-cavern-network', ['subterranean-sanctum'], ['dragon-vault', 'underground-sea'], [], ['gate-deep-sanctuary'], 'cavern-drips-stone-resonance', { realm: 3 }),
];

export const BUILT_REGIONS = WORLD_ATLAS.filter((region) => region.status === 'built');
export const PLANNED_REGIONS = WORLD_ATLAS.filter((region) => region.status === 'planned');
export const BUILT_AREAS = BUILT_REGIONS.flatMap((region) => region.areas);
export const DATABASE_REGION_SEED = BUILT_REGIONS.map(({ id, name, kind }) => ({ id, name, kind }));
export const DATABASE_AREA_SEED = BUILT_AREAS.map(({ id, regionId, name }) => ({ id, region_id: regionId, name }));

export function regionBounds(region: Region) {
  return {
    minX: region.origin.x - region.extent.x * 0.5,
    maxX: region.origin.x + region.extent.x * 0.5,
    minZ: region.origin.z - region.extent.z * 0.5,
    maxZ: region.origin.z + region.extent.z * 0.5,
  };
}

export function regionContains(region: Region, pos: WorldPos): boolean {
  const b = regionBounds(region);
  return pos.x >= b.minX && pos.x <= b.maxX &&
    pos.z >= b.minZ && pos.z <= b.maxZ &&
    pos.y >= region.elevation.min && pos.y <= region.elevation.max;
}

function pointInPolygon(x: number, z: number, points: readonly { x: number; z: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!;
    const b = points[j]!;
    const intersects = (a.z > z) !== (b.z > z) &&
      x < ((b.x - a.x) * (z - a.z)) / ((b.z - a.z) || Number.EPSILON) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function areaContains(area: Area, pos: WorldPos): boolean {
  const shape = area.shape;
  if (shape.type === 'circle') return Math.hypot(pos.x - shape.center.x, pos.z - shape.center.z) <= shape.radius;
  if (shape.type === 'aabb') return pos.x >= shape.minX && pos.x <= shape.maxX && pos.z >= shape.minZ && pos.z <= shape.maxZ;
  return pointInPolygon(pos.x, pos.z, shape.points);
}

function regionContainsXYZ(region: Region, x: number, y: number, z: number): boolean {
  const halfX = region.extent.x * 0.5;
  const halfZ = region.extent.z * 0.5;
  return x >= region.origin.x - halfX && x <= region.origin.x + halfX &&
    z >= region.origin.z - halfZ && z <= region.origin.z + halfZ &&
    y >= region.elevation.min && y <= region.elevation.max;
}

/** Non-allocating spatial query for the world update loop. */
export function areaAtAtlas(x: number, y: number, z: number): Area | null {
  for (const region of BUILT_REGIONS) {
    if (!regionContainsXYZ(region, x, y, z)) continue;
    for (const area of region.areas) {
      const shape = area.shape;
      if (shape.type === 'circle') {
        const dx = x - shape.center.x;
        const dz = z - shape.center.z;
        if (dx * dx + dz * dz <= shape.radius * shape.radius) return area;
      } else if (shape.type === 'aabb') {
        if (x >= shape.minX && x <= shape.maxX && z >= shape.minZ && z <= shape.maxZ) return area;
      } else if (pointInPolygon(x, z, shape.points)) {
        return area;
      }
    }
  }
  return null;
}

export function discoverableAreaAt(x: number, y: number, z: number): Area | null {
  const area = areaAtAtlas(x, y, z);
  return area?.discoverable ? area : null;
}

export interface AtlasValidationIssue {
  code: 'duplicate-region' | 'duplicate-area' | 'region-overlap' | 'area-outside-region' | 'invalid-region';
  detail: string;
}

export function validateAtlas(regions: readonly Region[] = WORLD_ATLAS): AtlasValidationIssue[] {
  const issues: AtlasValidationIssue[] = [];
  const regionIds = new Set<string>();
  const areaIds = new Set<string>();

  for (const region of regions) {
    if (regionIds.has(region.id)) issues.push({ code: 'duplicate-region', detail: region.id });
    regionIds.add(region.id);
    if (region.extent.x <= 0 || region.extent.z <= 0 || region.elevation.min > region.elevation.max ||
      ![region.origin.x, region.origin.y, region.origin.z, region.extent.x, region.extent.z].every(Number.isFinite)) {
      issues.push({ code: 'invalid-region', detail: region.id });
    }
    for (const area of region.areas) {
      if (areaIds.has(area.id)) issues.push({ code: 'duplicate-area', detail: area.id });
      areaIds.add(area.id);
      if (area.regionId !== region.id || !regionContains(region, area.spawn) || !areaContains(area, area.spawn)) {
        issues.push({ code: 'area-outside-region', detail: area.id });
      }
    }
  }

  for (let i = 0; i < regions.length; i++) {
    const a = regions[i]!;
    const ab = regionBounds(a);
    for (let j = i + 1; j < regions.length; j++) {
      const b = regions[j]!;
      const bb = regionBounds(b);
      const overlapX = ab.minX < bb.maxX && ab.maxX > bb.minX;
      const overlapZ = ab.minZ < bb.maxZ && ab.maxZ > bb.minZ;
      const overlapY = a.elevation.min < b.elevation.max && a.elevation.max > b.elevation.min;
      if (overlapX && overlapZ && overlapY) issues.push({ code: 'region-overlap', detail: a.id + ':' + b.id });
    }
  }
  return issues;
}
