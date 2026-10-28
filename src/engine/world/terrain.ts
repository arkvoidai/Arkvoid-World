import {
  BRIDGES,
  ISLANDS,
  islandRadiusAtAngle,
} from '@/engine/world/layout';

// Deterministic 2D Value Noise & FBM
function hash2D(x: number, z: number): number {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function smoothNoise2D(x: number, z: number): number {
  const i = Math.floor(x);
  const j = Math.floor(z);
  const fx = x - i;
  const fz = z - j;
  // Quintic Hermite interpolant for C1 continuity
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const v = fz * fz * fz * (fz * (fz * 6 - 15) + 10);

  const a = hash2D(i, j);
  const b = hash2D(i + 1, j);
  const c = hash2D(i, j + 1);
  const d = hash2D(i + 1, j + 1);

  return a + u * (b - a) + v * (c - a) + u * v * (a - b - c + d);
}

export function fbm2D(x: number, z: number, octaves = 4): number {
  let value = 0;
  let amplitude = 0.55;
  let frequency = 1.0;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * (smoothNoise2D(x * frequency, z * frequency) * 2 - 1);
    frequency *= 2.05;
    amplitude *= 0.5;
  }
  return value;
}

export interface SplinePoint {
  x: number;
  z: number;
}

export interface PathSpline {
  id: string;
  points: SplinePoint[];
  width: number;
}

// Island A path splines linking Gate, Plaza, Hall Stair, Pond, Bell, and Bridge AB
export const ISLAND_A_PATHS: PathSpline[] = [
  {
    id: 'gate-to-plaza',
    width: 2.4,
    points: [
      { x: 0, z: -21 },
      { x: 0, z: -16 },
      { x: 0, z: -10 },
      { x: 0, z: -6 },
    ],
  },
  {
    id: 'plaza-to-bridge',
    width: 2.4,
    points: [
      { x: 7, z: -1 },
      { x: 13, z: -1.8 },
      { x: 19, z: -2.6 },
      { x: 23.8, z: -3.2 },
    ],
  },
  {
    id: 'plaza-to-pond',
    width: 2.4,
    points: [
      { x: -5, z: -1 },
      { x: -7, z: -2.5 },
      { x: -9, z: -4 },
    ],
  },
  {
    id: 'plaza-to-bell',
    width: 2.4,
    points: [
      { x: 3, z: -6 },
      { x: 5, z: -11 },
      { x: 6, z: -17 },
    ],
  },
  {
    id: 'plaza-to-hall',
    width: 2.4,
    points: [
      { x: 0, z: 6 },
      { x: 0, z: 10 },
      { x: 0, z: 14 },
    ],
  },
  {
    id: 'pond-to-stream-walk',
    width: 2.0,
    points: [
      { x: -9, z: -4 },
      { x: -14, z: -6 },
      { x: -18, z: -8 },
    ],
  },
];

// Stream spline on Island A from pond to island rim
export const STREAM_SPLINE: SplinePoint[] = [
  { x: -9, z: -4 },
  { x: -13, z: -5.2 },
  { x: -17, z: -6.8 },
  { x: -21, z: -8.0 },
  { x: -24.5, z: -8.8 },
];

function distToSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const abx = bx - ax;
  const abz = bz - az;
  const apx = px - ax;
  const apz = pz - az;
  const lenSq = abx * abx + abz * abz;
  if (lenSq < 1e-6) return Math.hypot(apx, apz);
  const t = Math.max(0, Math.min(1, (apx * abx + apz * abz) / lenSq));
  const cx = ax + t * abx;
  const cz = az + t * abz;
  return Math.hypot(px - cx, pz - cz);
}

function distToSpline(px: number, pz: number, pts: SplinePoint[]): number {
  let minDist = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = distToSegment(
      px,
      pz,
      pts[i]!.x,
      pts[i]!.z,
      pts[i + 1]!.x,
      pts[i + 1]!.z,
    );
    if (d < minDist) minDist = d;
  }
  return minDist;
}

export function pathDistance(x: number, z: number): number {
  let minD = Infinity;
  for (let i = 0; i < ISLAND_A_PATHS.length; i++) {
    const d = distToSpline(x, z, ISLAND_A_PATHS[i]!.points);
    if (d < minD) minD = d;
  }
  return minD;
}

export function streamDistance(x: number, z: number): number {
  return distToSpline(x, z, STREAM_SPLINE);
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Smoothly flattens terrain towards a target elevation within a circular area.
 */
export function flattenCircle(
  currentH: number,
  x: number,
  z: number,
  cx: number,
  cz: number,
  radius: number,
  targetY: number,
  blendDistance = 2.5,
): number {
  const dist = Math.hypot(x - cx, z - cz);
  if (dist <= radius) {
    return targetY;
  } else if (dist < radius + blendDistance) {
    const factor = smoothstep(radius, radius + blendDistance, dist);
    return targetY + (currentH - targetY) * factor;
  }
  return currentH;
}

/**
 * Hall Terrace on Island A:
 * A rounded rectangle 30 x 18 m centered at (0, 14), raised 2.2 m,
 * with stepped transitions on its entryway.
 */
function evaluateHallTerrace(currentH: number, x: number, z: number): number {
  // South entrance stairs: between z = 2.5 and z = 6.5, width 10 m (|x| <= 5)
  if (z >= 2.5 && z <= 6.5 && Math.abs(x) <= 5.0) {
    const stairT = (z - 2.5) / 4.0;
    const numSteps = 7;
    const stepIdx = Math.max(0, Math.min(numSteps, Math.floor(stairT * numSteps)));
    return (stepIdx / numSteps) * 2.2;
  }

  // Rounded rect: width 30 m (X: -15..15), depth 18 m (Z: 5..23)
  const cx = 0;
  const cz = 14;
  const halfW = 15;
  const halfD = 9;
  const cornerRadius = 3.5;

  const dx = Math.abs(x - cx);
  const dz = Math.abs(z - cz);

  const qx = Math.max(0, dx - (halfW - cornerRadius));
  const qz = Math.max(0, dz - (halfD - cornerRadius));
  const distOutside = Math.hypot(qx, qz) - cornerRadius;

  // Inside the main elevated terrace top
  const targetY = 2.2;
  const blend = 3.0;

  if (distOutside <= 0) {
    return targetY;
  } else if (distOutside < blend) {
    const factor = smoothstep(0, blend, distOutside);
    return targetY + (currentH - targetY) * factor;
  }

  return currentH;
}

/**
 * Pond basin:
 * Smooth depression centered at (-9, -4), radius 6.5, depth 1.1 m
 */
function evaluatePondBasin(currentH: number, x: number, z: number): number {
  const dist = Math.hypot(x - (-9), z - (-4));
  const r = 6.5;
  if (dist < r) {
    const t = dist / r;
    // Parabolic depression with flat bed
    const depression = 1.1 * Math.pow(1 - t * t, 2.0);
    return currentH - depression;
  }
  return currentH;
}

/**
 * Stream channel:
 * Runs from the pond to the island rim (width 2.2 m, depth 0.45 m)
 */
function evaluateStreamChannel(currentH: number, x: number, z: number): number {
  const d = streamDistance(x, z);
  const halfW = 1.1; // width 2.2
  if (d < halfW) {
    const t = d / halfW;
    const dip = 0.45 * (1 - t * t);
    return currentH - dip;
  }
  return currentH;
}

/**
 * Bed down path network slightly (0.04 m) for tactile foot feel
 */
function evaluatePathBeds(currentH: number, x: number, z: number): number {
  const d = pathDistance(x, z);
  if (d < 1.2) {
    const factor = 1 - d / 1.2;
    return currentH - factor * 0.04;
  }
  return currentH;
}

/**
 * Master deterministic terrain height at any world coordinate (x, z)
 * across all islands and architectural landforms.
 */
export function terrainHeight(x: number, z: number): number {
  // Find which island this point is nearest to
  const islands = [ISLANDS.A, ISLANDS.B, ISLANDS.C];
  let nearestIsland = islands[0]!;
  let minNormDist = Infinity;
  let targetT = 0;

  for (let i = 0; i < islands.length; i++) {
    const isl = islands[i]!;
    const dx = x - isl.center.x;
    const dz = z - isl.center.z;
    const dist = Math.hypot(dx, dz);
    const theta = Math.atan2(dz, dx);
    const rTheta = islandRadiusAtAngle(isl.key, isl.radius, theta);
    const normDist = dist / rTheta;
    if (normDist < minNormDist) {
      minNormDist = normDist;
      nearestIsland = isl;
      targetT = normDist;
    }
  }

  const isl = nearestIsland;
  const t = targetT;
  const y0 = isl.topY;

  // 1. Meadow: gentle rolling hills, amplitude up to 1.1 m, flatter near features and rim
  const meadowNoise = fbm2D(x * 0.045, z * 0.045, 4);
  const rimFade = smoothstep(0.0, 0.7, Math.max(0, 1 - t));
  let h = y0 + meadowNoise * 1.1 * rimFade;

  // 2. Island-specific landform features
  if (isl.key === 'A') {
    // Plaza: radius 9 flat at y0
    h = flattenCircle(h, x, z, 0, 0, 9.0, y0, 3.2);

    // Courtyard transition between plaza and terrace
    h = flattenCircle(h, x, z, 0, 5.0, 3.5, y0, 2.0);

    // Hall terrace: rounded rectangle 30 x 18 m raised 2.2 m
    h = evaluateHallTerrace(h, x, z);

    // Pond basin: smooth depression, radius 6.5, depth 1.1 m
    h = evaluatePondBasin(h, x, z);

    // Stream channel: width 2.2, depth 0.45
    h = evaluateStreamChannel(h, x, z);

    // Path network subtle bedding
    h = evaluatePathBeds(h, x, z);
  } else if (isl.key === 'B') {
    // Still Garden: reflecting pool basin at (56, -2), radius 5.5, depth 0.9 m
    const poolDist = Math.hypot(x - 56, z - (-2));
    if (poolDist < 5.5) {
      const pt = poolDist / 5.5;
      h -= 0.9 * Math.pow(1 - pt * pt, 2.0);
    }
    // Archive terrace at (64, -10), raised 1.2 m
    h = flattenCircle(h, x, z, 64, -10, 5.0, y0 + 1.2, 3.0);
  } else if (isl.key === 'C') {
    // Falls of Light: shrine terrace at (38, -52), raised 1.6 m
    h = flattenCircle(h, x, z, 38, -52, 6.0, y0 + 1.6, 3.5);
    // Stream channel to falls edge (33, -64)
    const dFalls = distToSegment(x, z, 38, -52, 33, -64);
    if (dFalls < 1.4) {
      h -= 0.5 * (1 - (dFalls / 1.4) * (dFalls / 1.4));
    }
  }

  // 3. Rim: for t between 0.86 and 1.0 the surface rolls down over a lip then drops into cliff face,
  // EXCEPT at bridge abutments where the stone bridge joins the island plate flush!
  if (t > 0.86) {
    let bridgeProximity = 1.0;
    const bridgePoints = [
      BRIDGES[0]!.points[0]!,
      BRIDGES[0]!.points[BRIDGES[0]!.points.length - 1]!,
      BRIDGES[1]!.points[0]!,
      BRIDGES[1]!.points[BRIDGES[1]!.points.length - 1]!,
    ];
    for (let i = 0; i < bridgePoints.length; i++) {
      const bp = bridgePoints[i]!;
      const d = Math.hypot(x - bp.x, z - bp.z);
      if (d < 4.5) {
        bridgeProximity = Math.min(bridgeProximity, Math.max(0, (d - 1.2) / 3.3));
      }
    }
    const lipT = Math.min(1.0, (t - 0.86) / 0.14);
    const lipDrop = -2.8 * Math.pow(lipT, 1.7) * bridgeProximity;
    h += lipDrop;
  }

  return h;
}

export interface TerrainGradient {
  gx: number;
  gz: number;
  slopeRad: number;
  slopeDeg: number;
  normalX: number;
  normalY: number;
  normalZ: number;
}

/**
 * Computes analytic terrain gradient and surface normal using central differences.
 */
export function terrainGradient(x: number, z: number): TerrainGradient {
  const d = 0.08;
  const hL = terrainHeight(x - d, z);
  const hR = terrainHeight(x + d, z);
  const hD = terrainHeight(x, z - d);
  const hU = terrainHeight(x, z + d);

  const gx = (hR - hL) / (2 * d);
  const gz = (hU - hD) / (2 * d);

  const len = Math.hypot(gx, gz);
  const slopeRad = Math.atan(len);
  const slopeDeg = (slopeRad * 180) / Math.PI;

  // Unnormalized surface normal: (-gx, 1, -gz)
  const normLen = Math.hypot(gx, 1.0, gz);
  return {
    gx,
    gz,
    slopeRad,
    slopeDeg,
    normalX: -gx / normLen,
    normalY: 1.0 / normLen,
    normalZ: -gz / normLen,
  };
}

/**
 * Checks if coordinate (x, z) is inside the walkable region of an island.
 * Walkable area ends at t = 0.93 (the edge lip beyond 0.86 is visual roll-off; slope > 40° blocks).
 */
export function isWalkableTerrain(x: number, z: number): boolean {
  const islands = [ISLANDS.A, ISLANDS.B, ISLANDS.C];
  for (let i = 0; i < islands.length; i++) {
    const isl = islands[i]!;
    const dx = x - isl.center.x;
    const dz = z - isl.center.z;
    const dist = Math.hypot(dx, dz);
    const theta = Math.atan2(dz, dx);
    const rTheta = islandRadiusAtAngle(isl.key, isl.radius, theta);
    const t = dist / rTheta;
    if (t <= 0.93) {
      return true;
    }
  }
  return false;
}
