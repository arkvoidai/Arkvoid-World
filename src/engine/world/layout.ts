export type ReachableAreaId =
  | 'dawn-terrace'
  | 'still-garden'
  | 'falls-of-light';

export type IslandKey = 'A' | 'B' | 'C' | 'S';

export type SpotId =
  | 'gate'
  | 'breath-pool'
  | 'pavilion'
  | 'bell'
  | 'hall-door'
  | 'archive'
  | 'reflecting-pool'
  | 'garden-bridge'
  | 'shrine'
  | 'falls-edge';

export interface Vec3Tuple {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface IslandDef {
  readonly key: IslandKey;
  readonly id: ReachableAreaId | 'sanctuary';
  readonly name: string;
  readonly center: Vec3Tuple;
  readonly radius: number;
  readonly topY: number;
  readonly reachable: boolean;
  readonly seed: number;
}

export interface BridgePoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly s: number; // arc distance from start in XZ
}

export interface BridgeDef {
  readonly id: 'bridge-ab' | 'bridge-bc';
  readonly fromIsland: IslandKey;
  readonly toIsland: IslandKey;
  readonly width: number;
  readonly walkableHalfWidth: number;
  readonly points: readonly BridgePoint[];
  readonly dirX: number;
  readonly dirZ: number;
  readonly normalX: number;
  readonly normalZ: number;
  readonly totalLengthXZ: number;
  readonly maxSlopeDeg: number;
}

export interface SpotDef {
  readonly id: SpotId;
  readonly island: IslandKey;
  readonly areaId: ReachableAreaId;
  readonly position: Vec3Tuple;
}

export interface PlatformBox {
  readonly id: string;
  readonly island: IslandKey;
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly floorY: number;
}

export interface ObstacleCylinder {
  readonly id: string;
  readonly kind: 'column' | 'tree' | 'lantern' | 'pool' | 'gate-veil';
  readonly x: number;
  readonly z: number;
  readonly baseY: number;
  readonly height: number;
  readonly radius: number;
}

export interface ObstacleBox {
  readonly id: string;
  readonly kind: 'wall' | 'dais' | 'rail' | 'stand';
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly baseY: number;
  readonly height: number;
}

export interface TreePlacement {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly variant: 0 | 1 | 2;
  readonly yaw: number;
  readonly scale: number;
}

export interface LanternPlacement {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
}

/**
 * Deterministic seeded PRNG (Mulberry32).
 */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ISLAND_HARMONICS: Record<
  IslandKey,
  readonly { freq: number; amp: number; phase: number }[]
> = {
  A: [
    { freq: 2, amp: 0.34, phase: 0.45 },
    { freq: 3, amp: 0.26, phase: 1.85 },
    { freq: 5, amp: 0.14, phase: 3.1 },
    { freq: 7, amp: 0.06, phase: 0.9 },
  ],
  B: [
    { freq: 2, amp: 0.36, phase: 1.15 },
    { freq: 3, amp: 0.24, phase: 2.6 },
    { freq: 4, amp: 0.13, phase: 0.5 },
    { freq: 6, amp: 0.07, phase: 4.2 },
  ],
  C: [
    { freq: 2, amp: 0.32, phase: 2.2 },
    { freq: 3, amp: 0.28, phase: 0.7 },
    { freq: 5, amp: 0.12, phase: 1.9 },
    { freq: 7, amp: 0.08, phase: 3.7 },
  ],
  S: [
    { freq: 2, amp: 0.42, phase: 0.2 },
    { freq: 3, amp: 0.22, phase: 1.4 },
    { freq: 5, amp: 0.11, phase: 2.8 },
    { freq: 6, amp: 0.05, phase: 5.1 },
  ],
};

/**
 * Deterministic radial offset in [-0.8, +0.8] meters for an island's superelliptic organic outline.
 * Shared between IslandMesh visual geometry and analytic collision heightAt().
 */
export function islandRadialOffset(islandKey: IslandKey, theta: number): number {
  const harmonics = ISLAND_HARMONICS[islandKey];
  let sum = 0;
  for (let i = 0; i < harmonics.length; i++) {
    const h = harmonics[i]!;
    sum += Math.sin(theta * h.freq + h.phase) * h.amp;
  }
  return Math.max(-0.8, Math.min(0.8, sum));
}

export function islandRadiusAtAngle(
  islandKey: IslandKey,
  baseRadius: number,
  theta: number,
): number {
  return baseRadius + islandRadialOffset(islandKey, theta);
}

/**
 * Subtle surface undulation (±0.03 m) shared between IslandMesh top plate and collision heightAt().
 */
export function islandSurfaceUndulation(x: number, z: number): number {
  return (
    Math.sin(x * 0.17 + z * 0.11) * 0.018 +
    Math.cos(x * 0.09 - z * 0.19) * 0.012
  );
}

export const ISLANDS: Record<IslandKey, IslandDef> = {
  A: {
    key: 'A',
    id: 'dawn-terrace',
    name: 'Dawn Terrace',
    center: { x: 0, y: 0, z: 0 },
    radius: 26,
    topY: 0,
    reachable: true,
    seed: 104729,
  },
  B: {
    key: 'B',
    id: 'still-garden',
    name: 'Still Garden',
    center: { x: 60, y: -2, z: -8 },
    radius: 21,
    topY: -2,
    reachable: true,
    seed: 224737,
  },
  C: {
    key: 'C',
    id: 'falls-of-light',
    name: 'Falls of Light',
    center: { x: 38, y: 1, z: -52 },
    radius: 18,
    topY: 1,
    reachable: true,
    seed: 350377,
  },
  S: {
    key: 'S',
    id: 'sanctuary',
    name: 'Sanctuary',
    center: { x: -10, y: 12, z: -120 },
    radius: 34,
    topY: 12,
    reachable: false,
    seed: 479909,
  },
};

function buildArchedBridge(
  id: 'bridge-ab' | 'bridge-bc',
  fromIsland: IslandKey,
  toIsland: IslandKey,
  insetFromRadius: number,
  insetToRadius: number,
  archHeight: number,
  segments = 24,
): BridgeDef {
  const a = ISLANDS[fromIsland];
  const b = ISLANDS[toIsland];
  const dx = b.center.x - a.center.x;
  const dz = b.center.z - a.center.z;
  const centerDist = Math.hypot(dx, dz);
  const dirX = dx / centerDist;
  const dirZ = dz / centerDist;
  const normalX = -dirZ;
  const normalZ = dirX;

  const thetaA = Math.atan2(dz, dx);
  const thetaB = Math.atan2(-dz, -dx);

  const rA = islandRadiusAtAngle(fromIsland, a.radius, thetaA) - insetFromRadius;
  const rB = islandRadiusAtAngle(toIsland, b.radius, thetaB) - insetToRadius;

  const startX = a.center.x + dirX * rA;
  const startZ = a.center.z + dirZ * rA;
  const endX = b.center.x - dirX * rB;
  const endZ = b.center.z - dirZ * rB;

  const totalLengthXZ = Math.hypot(endX - startX, endZ - startZ);
  const startY = a.topY + islandSurfaceUndulation(startX, startZ);
  const endY = b.topY + islandSurfaceUndulation(endX, endZ);

  const points: BridgePoint[] = [];
  let maxSlopeRad = 0;

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const x = startX + (endX - startX) * t;
    const z = startZ + (endZ - startZ) * t;
    const s = totalLengthXZ * t;
    const baseLinearY = startY + (endY - startY) * t;
    const archOffset = Math.sin(Math.PI * t) * archHeight;
    const y = baseLinearY + archOffset;

    if (i > 0) {
      const prev = points[i - 1]!;
      const ds = s - prev.s;
      const dy = Math.abs(y - prev.y);
      const slopeRad = Math.atan2(dy, ds);
      if (slopeRad > maxSlopeRad) {
        maxSlopeRad = slopeRad;
      }
    }

    points.push({ x, y, z, s });
  }

  const maxSlopeDeg = (maxSlopeRad * 180) / Math.PI;

  return {
    id,
    fromIsland,
    toIsland,
    width: 3.2,
    walkableHalfWidth: 1.5,
    points,
    dirX,
    dirZ,
    normalX,
    normalZ,
    totalLengthXZ,
    maxSlopeDeg,
  };
}

export const BRIDGES: readonly BridgeDef[] = [
  // Bridge A -> B: span ~17.5 m, elevation drop 2 m, gentle arch 0.78 m -> max slope ~14.4 deg (< 17 deg)
  buildArchedBridge('bridge-ab', 'A', 'B', 2.0, 2.0, 0.78, 24),
  // Bridge B -> C: span ~16.5 m, elevation rise 3 m, gentle arch 0.48 m -> max slope ~15.4 deg (< 17 deg)
  buildArchedBridge('bridge-bc', 'B', 'C', 2.6, 2.4, 0.48, 24),
];

export const SPAWN = {
  position: { x: 0, y: 0, z: 14 } as Vec3Tuple,
  yaw: 0, // facing -z
} as const;

export const SPOTS: Record<SpotId, SpotDef> = {
  gate: {
    id: 'gate',
    island: 'A',
    areaId: 'dawn-terrace',
    position: { x: 0, y: 0, z: -21 },
  },
  'breath-pool': {
    id: 'breath-pool',
    island: 'A',
    areaId: 'dawn-terrace',
    position: { x: -9, y: 0, z: -4 },
  },
  pavilion: {
    id: 'pavilion',
    island: 'A',
    areaId: 'dawn-terrace',
    position: { x: -4.5, y: 0.35, z: -7.5 },
  },
  bell: {
    id: 'bell',
    island: 'A',
    areaId: 'dawn-terrace',
    position: { x: 5.5, y: 0.22, z: -16.0 },
  },
  'hall-door': {
    id: 'hall-door',
    island: 'A',
    areaId: 'dawn-terrace',
    position: { x: 8.0, y: 2.2, z: -6.0 },
  },
  archive: {
    id: 'archive',
    island: 'B',
    areaId: 'still-garden',
    position: { x: 64, y: -1.65, z: -10 },
  },
  'reflecting-pool': {
    id: 'reflecting-pool',
    island: 'B',
    areaId: 'still-garden',
    position: { x: 56, y: -2, z: -2 },
  },
  'garden-bridge': {
    id: 'garden-bridge',
    island: 'B',
    areaId: 'still-garden',
    position: { x: 51, y: -2, z: -21 },
  },
  shrine: {
    id: 'shrine',
    island: 'C',
    areaId: 'falls-of-light',
    position: { x: 38, y: 1.35, z: -52 },
  },
  'falls-edge': {
    id: 'falls-edge',
    island: 'C',
    areaId: 'falls-of-light',
    position: { x: 33, y: 1.14, z: -64 },
  },
};

/**
 * Raised platforms and walkable stairs across Island A, B, and C.
 */
export const PLATFORMS: readonly PlatformBox[] = [
  // 1. Hall Terrace main platform (raised 2.2 m at x ~ 15.8, z ~ -6.0)
  {
    id: 'hall-terrace-main',
    island: 'A',
    minX: 6.84,
    maxX: 24.8,
    minZ: -19.5,
    maxZ: 7.5,
    floorY: 2.2,
  },
  // 2. Hall interior floor (raised 0.25 m above terrace at y = 2.45 m)
  {
    id: 'hall-interior-floor',
    island: 'A',
    minX: 8.5,
    maxX: 22.5,
    minZ: -18.0,
    maxZ: 6.0,
    floorY: 2.45,
  },
  // 3. Hall altar dais at the back
  {
    id: 'hall-altar-dais',
    island: 'A',
    minX: 18.6,
    maxX: 21.4,
    minZ: -8.4,
    maxZ: -3.6,
    floorY: 2.85,
  },
  // 4. 14 Grand stair steps (rise 0.157 m each, run 0.34 m from x=2.08 to x=6.84, z in [-9.2, -2.8])
  ...Array.from({ length: 14 }, (_, i) => {
    const sMinX = 2.08 + i * 0.34;
    const sMaxX = sMinX + 0.38;
    return {
      id: `stair-step-${i + 1}`,
      island: 'A' as IslandKey,
      minX: sMinX,
      maxX: sMaxX,
      minZ: -9.2,
      maxZ: -2.8,
      floorY: (i + 1) * (2.2 / 14),
    };
  }),
  // 5. Pavilion near pond base (floor height 0.35 m at (-4.5, -7.5))
  {
    id: 'pavilion-main',
    island: 'A',
    minX: -8.8,
    maxX: -0.2,
    minZ: -10.9,
    maxZ: -4.1,
    floorY: 0.35,
  },
  // 6. Covered corridor walkway linking Pavilion and Hall
  {
    id: 'corridor-walkway',
    island: 'A',
    minX: -0.2,
    maxX: 2.1,
    minZ: -7.4,
    maxZ: -5.0,
    floorY: 0.22,
  },
  // 7. Bell tower platform (at (5.5, -16.0), height 0.22m)
  {
    id: 'bell-platform',
    island: 'A',
    minX: 3.7,
    maxX: 7.3,
    minZ: -17.8,
    maxZ: -14.2,
    floorY: 0.22,
  },
  // 8. Pond zigzag bridge slabs
  {
    id: 'pond-zigzag-1',
    island: 'A',
    minX: -7.6,
    maxX: -5.0,
    minZ: -5.4,
    maxZ: -3.4,
    floorY: 0.18,
  },
  {
    id: 'pond-zigzag-2',
    island: 'A',
    minX: -9.0,
    maxX: -6.4,
    minZ: -5.4,
    maxZ: -3.4,
    floorY: 0.16,
  },
  // 9. Stream stepping stones
  {
    id: 'stream-step-1',
    island: 'A',
    minX: -14.5,
    maxX: -13.7,
    minZ: -4.8,
    maxZ: -4.0,
    floorY: -0.05,
  },
  {
    id: 'stream-step-2',
    island: 'A',
    minX: -14.8,
    maxX: -14.0,
    minZ: -5.4,
    maxZ: -4.6,
    floorY: -0.02,
  },
  {
    id: 'stream-step-3',
    island: 'A',
    minX: -15.1,
    maxX: -14.3,
    minZ: -6.0,
    maxZ: -5.2,
    floorY: 0.0,
  },
  {
    id: 'stream-step-4',
    island: 'A',
    minX: -15.3,
    maxX: -14.5,
    minZ: -6.6,
    maxZ: -5.8,
    floorY: -0.02,
  },
  {
    id: 'stream-step-5',
    island: 'A',
    minX: -15.5,
    maxX: -14.7,
    minZ: -7.2,
    maxZ: -6.4,
    floorY: -0.05,
  },
  // 10. Island B Archive platform
  {
    id: 'archive-base',
    island: 'B',
    minX: 58.0,
    maxX: 70.0,
    minZ: -14.5,
    maxZ: -5.5,
    floorY: 0.35,
  },
  // 11. Island C Shrine platform & lookout platform
  {
    id: 'shrine-base',
    island: 'C',
    minX: 34.0,
    maxX: 42.0,
    minZ: -55.0,
    maxZ: -49.0,
    floorY: 0.35,
  },
  {
    id: 'lookout-deck',
    island: 'C',
    minX: 30.6,
    maxX: 35.4,
    minZ: -66.4,
    maxZ: -61.6,
    floorY: 0.14,
  },
];

/**
 * 12 lantern posts around the plaza path at radius 14 on Island A.
 * Angles are slightly offset from cardinal axes so the North (-Z) gate path and South (+Z) spawn path stay wide open.
 */
export const LANTERN_PLACEMENTS: readonly LanternPlacement[] = Array.from(
  { length: 12 },
  (_, i) => {
    const theta = ((i + 0.5) / 12) * Math.PI * 2;
    const r = 14;
    const x = Math.cos(theta) * r;
    const z = Math.sin(theta) * r;
    const y = islandSurfaceUndulation(x, z);
    return {
      id: `lantern-${i + 1}`,
      x,
      y,
      z,
      yaw: -theta + Math.PI,
    };
  },
);

/**
 * 9 Blossom trees on Island A:
 * - A cluster of 3 near (-16, 0, 6)
 * - 6 singles along the perimeter edge
 */
export const TREE_PLACEMENTS: readonly TreePlacement[] = [
  // Cluster of 3 near (-16, 0, 6)
  {
    id: 'tree-cluster-1',
    x: -16.2,
    y: islandSurfaceUndulation(-16.2, 5.8),
    z: 5.8,
    variant: 0,
    yaw: 0.4,
    scale: 1.08,
  },
  {
    id: 'tree-cluster-2',
    x: -13.6,
    y: islandSurfaceUndulation(-13.6, 8.2),
    z: 8.2,
    variant: 2, // soft lavender blossom
    yaw: 2.1,
    scale: 0.94,
  },
  {
    id: 'tree-cluster-3',
    x: -18.4,
    y: islandSurfaceUndulation(-18.4, 8.6),
    z: 8.6,
    variant: 1,
    yaw: 4.2,
    scale: 0.88,
  },
  // 6 singles along the edge
  {
    id: 'tree-edge-1',
    x: -18.5,
    y: islandSurfaceUndulation(-18.5, -10.5),
    z: -10.5,
    variant: 1,
    yaw: 1.1,
    scale: 1.04,
  },
  {
    id: 'tree-edge-2',
    x: -9.8,
    y: islandSurfaceUndulation(-9.8, -19.2),
    z: -19.2,
    variant: 0,
    yaw: 3.4,
    scale: 0.96,
  },
  {
    id: 'tree-edge-3',
    x: 13.8,
    y: islandSurfaceUndulation(13.8, -17.5),
    z: -17.5,
    variant: 2, // soft lavender blossom
    yaw: 0.85,
    scale: 1.02,
  },
  {
    id: 'tree-edge-4',
    x: 20.2,
    y: islandSurfaceUndulation(20.2, 4.2),
    z: 4.2,
    variant: 0,
    yaw: 2.7,
    scale: 1.1,
  },
  {
    id: 'tree-edge-5',
    x: 13.2,
    y: islandSurfaceUndulation(13.2, 16.4),
    z: 16.4,
    variant: 1,
    yaw: 5.0,
    scale: 0.92,
  },
  {
    id: 'tree-edge-6',
    x: -8.4,
    y: islandSurfaceUndulation(-8.4, 19.6),
    z: 19.6,
    variant: 2,
    yaw: 1.65,
    scale: 0.98,
  },
];

/**
 * Pavilion 6 column positions on the stone base near the pond at (-4.5, -7.5).
 */
export const PAVILION_COLUMNS: readonly { x: number; z: number }[] = [
  { x: -7.6, z: -9.8 },
  { x: -4.5, z: -9.8 },
  { x: -1.4, z: -9.8 },
  { x: -7.6, z: -5.2 },
  { x: -4.5, z: -5.2 },
  { x: -1.4, z: -5.2 },
];

/**
 * Main Hall perimeter columns on the elevated terrace at y = 2.2 m.
 */
export const HALL_COLUMNS: readonly { x: number; z: number }[] = [
  // North line (z = -18.0)
  { x: 8.5, z: -18.0 },
  { x: 13.17, z: -18.0 },
  { x: 17.83, z: -18.0 },
  { x: 22.5, z: -18.0 },
  // South line (z = 6.0)
  { x: 8.5, z: 6.0 },
  { x: 13.17, z: 6.0 },
  { x: 17.83, z: 6.0 },
  { x: 22.5, z: 6.0 },
  // Back colonnade (x = 22.5)
  { x: 22.5, z: -14.0 },
  { x: 22.5, z: -10.0 },
  { x: 22.5, z: -6.0 },
  { x: 22.5, z: -2.0 },
  { x: 22.5, z: 2.0 },
  // Front colonnade (x = 8.5) flanking the central doorway
  { x: 8.5, z: -14.0 },
  { x: 8.5, z: -10.0 },
  { x: 8.5, z: -2.0 },
  { x: 8.5, z: 2.0 },
];

/**
 * Bell tower 4 columns around (5.5, 0, -16.0).
 */
export const BELL_COLUMNS: readonly { x: number; z: number }[] = [
  { x: 4.3, z: -17.2 },
  { x: 6.7, z: -17.2 },
  { x: 4.3, z: -14.8 },
  { x: 6.7, z: -14.8 },
];

function buildObstacles(): readonly ObstacleCylinder[] {
  const list: ObstacleCylinder[] = [];

  // 1. Main Hall columns
  for (let i = 0; i < HALL_COLUMNS.length; i++) {
    const col = HALL_COLUMNS[i]!;
    list.push({
      id: `hall-col-${i + 1}`,
      kind: 'column',
      x: col.x,
      z: col.z,
      baseY: 2.2,
      height: 5.6,
      radius: 0.26,
    });
  }

  // 2. Pavilion 6 columns
  for (let i = 0; i < PAVILION_COLUMNS.length; i++) {
    const col = PAVILION_COLUMNS[i]!;
    list.push({
      id: `pavilion-col-${i + 1}`,
      kind: 'column',
      x: col.x,
      z: col.z,
      baseY: 0.35,
      height: 3.6,
      radius: 0.22,
    });
  }

  // 3. Bell tower 4 columns
  for (let i = 0; i < BELL_COLUMNS.length; i++) {
    const col = BELL_COLUMNS[i]!;
    list.push({
      id: `bell-col-${i + 1}`,
      kind: 'column',
      x: col.x,
      z: col.z,
      baseY: 0.22,
      height: 3.6,
      radius: 0.18,
    });
  }

  // 4. Sealed Gate columns and veil barrier cylinders
  list.push(
    {
      id: 'gate-col-left',
      kind: 'column',
      x: -2.1,
      z: -21,
      baseY: 0,
      height: 5.6,
      radius: 0.36,
    },
    {
      id: 'gate-col-right',
      kind: 'column',
      x: 2.1,
      z: -21,
      baseY: 0,
      height: 5.6,
      radius: 0.36,
    },
    {
      id: 'gate-veil-left',
      kind: 'gate-veil',
      x: -1.05,
      z: -21,
      baseY: 0,
      height: 5.2,
      radius: 0.55,
    },
    {
      id: 'gate-veil-center',
      kind: 'gate-veil',
      x: 0,
      z: -21,
      baseY: 0,
      height: 5.2,
      radius: 0.55,
    },
    {
      id: 'gate-veil-right',
      kind: 'gate-veil',
      x: 1.05,
      z: -21,
      baseY: 0,
      height: 5.2,
      radius: 0.55,
    },
  );

  // 5. Spirit pond ring wall at (-9, 0, -4)
  list.push({
    id: 'pond-ring-wall',
    kind: 'pool',
    x: -9,
    z: -4,
    baseY: -1.4,
    height: 2.2,
    radius: 3.8,
  });

  // 6. Braziers at stair foot and in courtyard
  list.push(
    {
      id: 'brazier-stair-north',
      kind: 'column',
      x: 1.68,
      z: -9.25,
      baseY: 0,
      height: 1.6,
      radius: 0.52,
    },
    {
      id: 'brazier-stair-south',
      kind: 'column',
      x: 1.68,
      z: -2.75,
      baseY: 0,
      height: 1.6,
      radius: 0.52,
    },
  );

  // 7. 12 Lantern posts around the plaza
  for (const lantern of LANTERN_PLACEMENTS) {
    list.push({
      id: lantern.id,
      kind: 'lantern',
      x: lantern.x,
      z: lantern.z,
      baseY: lantern.y,
      height: 2.2,
      radius: 0.16,
    });
  }

  // 8. 9 Blossom tree trunks
  for (const tree of TREE_PLACEMENTS) {
    list.push({
      id: tree.id,
      kind: 'tree',
      x: tree.x,
      z: tree.z,
      baseY: tree.y,
      height: 3.6 * tree.scale,
      radius: 0.36 * tree.scale,
    });
  }

  return list;
}

export const OBSTACLES: readonly ObstacleCylinder[] = buildObstacles();

export const OBSTACLE_BOXES: readonly ObstacleBox[] = [
  // Main Hall back wall (east at x = 22.5)
  {
    id: 'hall-wall-back',
    kind: 'wall',
    minX: 22.25,
    maxX: 22.75,
    minZ: -18.0,
    maxZ: 6.0,
    baseY: 2.2,
    height: 5.6,
  },
  // Main Hall north wall (z = -18.0)
  {
    id: 'hall-wall-north',
    kind: 'wall',
    minX: 8.5,
    maxX: 22.5,
    minZ: -18.25,
    maxZ: -17.75,
    baseY: 2.2,
    height: 5.6,
  },
  // Main Hall south wall (z = 6.0)
  {
    id: 'hall-wall-south',
    kind: 'wall',
    minX: 8.5,
    maxX: 22.5,
    minZ: 5.75,
    maxZ: 6.25,
    baseY: 2.2,
    height: 5.6,
  },
  // Main Hall front wings (x = 8.5, leaving doorway gap z in [-8.5, -3.5] open)
  {
    id: 'hall-front-wall-north',
    kind: 'wall',
    minX: 8.25,
    maxX: 8.75,
    minZ: -18.0,
    maxZ: -8.5,
    baseY: 2.2,
    height: 5.6,
  },
  {
    id: 'hall-front-wall-south',
    kind: 'wall',
    minX: 8.25,
    maxX: 8.75,
    minZ: -3.5,
    maxZ: 6.0,
    baseY: 2.2,
    height: 5.6,
  },
  // Ceremonial drum stand
  {
    id: 'ceremonial-drum-box',
    kind: 'stand',
    minX: 0.6,
    maxX: 2.4,
    minZ: 2.6,
    maxZ: 4.4,
    baseY: 0,
    height: 2.4,
  },
  // Notice board
  {
    id: 'notice-board-box',
    kind: 'stand',
    minX: 1.5,
    maxX: 3.5,
    minZ: 8.2,
    maxZ: 8.8,
    baseY: 0,
    height: 2.6,
  },
];

export const WORLD = {
  islands: ISLANDS,
  bridges: BRIDGES,
  spawn: SPAWN,
  spots: SPOTS,
  platforms: PLATFORMS,
  obstacles: OBSTACLES,
  obstacleBoxes: OBSTACLE_BOXES,
  lanterns: LANTERN_PLACEMENTS,
  trees: TREE_PLACEMENTS,
} as const;

export type WorldLayout = typeof WORLD;

/**
 * Returns the named reachable area at world coordinates (x, z), or null if outside reachable bounds.
 * Nearest reachable island within (radius + 8); bridges belong to their nearer island.
 */
export function areaAt(x: number, z: number): ReachableAreaId | null {
  // Check if on or immediately beside a bridge first; assign to the nearer endpoint island
  for (let i = 0; i < BRIDGES.length; i++) {
    const bridge = BRIDGES[i]!;
    const first = bridge.points[0]!;
    const relX = x - first.x;
    const relZ = z - first.z;
    const along = relX * bridge.dirX + relZ * bridge.dirZ;
    const perp = Math.abs(relX * bridge.normalX + relZ * bridge.normalZ);
    if (
      along >= -1.0 &&
      along <= bridge.totalLengthXZ + 1.0 &&
      perp <= bridge.width
    ) {
      const fromIsland = ISLANDS[bridge.fromIsland];
      const toIsland = ISLANDS[bridge.toIsland];
      const distFrom =
        Math.hypot(x - fromIsland.center.x, z - fromIsland.center.z) -
        fromIsland.radius;
      const distTo =
        Math.hypot(x - toIsland.center.x, z - toIsland.center.z) -
        toIsland.radius;
      const winner = distFrom <= distTo ? fromIsland : toIsland;
      return winner.reachable ? (winner.id as ReachableAreaId) : null;
    }
  }

  let bestArea: ReachableAreaId | null = null;
  let bestSignedMargin = Infinity;

  const reachableKeys: readonly IslandKey[] = ['A', 'B', 'C'];
  for (let i = 0; i < reachableKeys.length; i++) {
    const island = ISLANDS[reachableKeys[i]!];
    const dist = Math.hypot(x - island.center.x, z - island.center.z);
    if (dist <= island.radius + 8) {
      const signedDist = dist - island.radius;
      if (signedDist < bestSignedMargin) {
        bestSignedMargin = signedDist;
        bestArea = island.id as ReachableAreaId;
      }
    }
  }

  return bestArea;
}
