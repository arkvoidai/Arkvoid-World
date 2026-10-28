import {
  BRIDGES,
  type BridgeDef,
  ISLANDS,
  type IslandDef,
  type IslandKey,
  islandRadiusAtAngle,
  OBSTACLES,
  OBSTACLE_BOXES,
  PLATFORMS,
  type Vec3Tuple,
} from '@/engine/world/layout';
import {
  terrainGradient,
  terrainHeight,
} from '@/engine/world/terrain';

export const EDGE_INSET = 0.8;
export const MAX_STEP_UP = 0.4;
export const MAX_SLOPE_DEG = 40.0;

export interface MoveResult {
  x: number;
  y: number;
  z: number;
  grounded: boolean;
  hitObstacle: boolean;
  clampedEdge: boolean;
}

const REACHABLE_ISLANDS: readonly IslandDef[] = [
  ISLANDS.A,
  ISLANDS.B,
  ISLANDS.C,
];

function evaluateBridgeHeight(bridge: BridgeDef, x: number, z: number): number | null {
  if (!bridge.points || bridge.points.length < 2 || bridge.totalLengthXZ <= 0) return null;
  const first = bridge.points[0];
  if (!first) return null;
  const relX = x - first.x;
  const relZ = z - first.z;
  const along = relX * bridge.dirX + relZ * bridge.dirZ;
  const perp = Math.abs(relX * bridge.normalX + relZ * bridge.normalZ);

  if (
    isNaN(along) ||
    isNaN(perp) ||
    along < 0 ||
    along > bridge.totalLengthXZ ||
    perp > bridge.walkableHalfWidth
  ) {
    return null;
  }

  const pts = bridge.points;
  const count = pts.length - 1;
  const scaled = (along / bridge.totalLengthXZ) * count;
  if (isNaN(scaled)) return null;
  const idx = Math.max(0, Math.min(count - 1, Math.floor(scaled)));
  const frac = Math.max(0, Math.min(1, scaled - idx));
  const p0 = pts[idx];
  const p1 = pts[idx + 1];
  if (!p0) return null;
  if (!p1) return p0.y;
  return p0.y + (p1.y - p0.y) * frac;
}

function evaluateIslandHeight(island: IslandDef, x: number, z: number): number | null {
  if (!island.reachable) return null;
  const dx = x - island.center.x;
  const dz = z - island.center.z;
  const dist = Math.hypot(dx, dz);
  const theta = Math.atan2(dz, dx);
  const maxR = islandRadiusAtAngle(island.key, island.radius, theta);

  const t = dist / maxR;
  // Walkable area ends at t = 0.93 (edge lip is visual only)
  if (t <= 0.93) {
    return terrainHeight(x, z);
  }
  return null;
}

/**
 * Analytic walkable surface height at world coordinates (x, z).
 * Returns the surface y in meters, or null if (x, z) is outside walkable bounds.
 * When `currentY` is provided, raised platforms higher than `currentY + MAX_STEP_UP` are excluded.
 */
export function heightAt(
  x: number,
  z: number,
  currentY?: number,
): number | null {
  let candidateY: number | null = null;

  // 1. Check bridge strips (polyline with half-width 1.5 and per-vertex heights)
  for (let i = 0; i < BRIDGES.length; i++) {
    const h = evaluateBridgeHeight(BRIDGES[i]!, x, z);
    if (h !== null && (candidateY === null || h > candidateY)) {
      candidateY = h;
    }
  }

  // 2. Check raised platforms (axis-aligned boxes with their floor height)
  for (let i = 0; i < PLATFORMS.length; i++) {
    const p = PLATFORMS[i]!;
    if (x >= p.minX && x <= p.maxX && z >= p.minZ && z <= p.maxZ) {
      const baseIslandY = ISLANDS[p.island].topY;
      const platformTop = baseIslandY + p.floorY;
      if (
        currentY === undefined ||
        platformTop - currentY <= MAX_STEP_UP + 1e-4
      ) {
        if (candidateY === null || platformTop > candidateY) {
          candidateY = platformTop;
        }
      }
    }
  }

  // 3. Check continuous terrain landforms across reachable islands
  if (candidateY === null) {
    for (let i = 0; i < REACHABLE_ISLANDS.length; i++) {
      const h = evaluateIslandHeight(REACHABLE_ISLANDS[i]!, x, z);
      if (h !== null && (candidateY === null || h > candidateY)) {
        candidateY = h;
      }
    }
  }

  return candidateY;
}

function pushOutOfPlatformBox(
  x: number,
  z: number,
  radius: number,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
): { x: number; z: number; hit: boolean } {
  const closestX = Math.max(minX, Math.min(maxX, x));
  const closestZ = Math.max(minZ, Math.min(maxZ, z));
  const dx = x - closestX;
  const dz = z - closestZ;
  const distSq = dx * dx + dz * dz;

  if (distSq >= radius * radius) {
    return { x, z, hit: false };
  }

  if (distSq > 1e-8) {
    const dist = Math.sqrt(distSq);
    const push = radius - dist;
    return {
      x: x + (dx / dist) * push,
      z: z + (dz / dist) * push,
      hit: true,
    };
  }

  const dLeft = Math.abs(x - minX);
  const dRight = Math.abs(x - maxX);
  const dTop = Math.abs(z - minZ);
  const dBottom = Math.abs(z - maxZ);
  const minD = Math.min(dLeft, dRight, dTop, dBottom);

  if (minD === dLeft) return { x: minX - radius, z, hit: true };
  if (minD === dRight) return { x: maxX + radius, z, hit: true };
  if (minD === dTop) return { x, z: minZ - radius, hit: true };
  return { x, z: maxZ + radius, hit: true };
}

function resolveObstaclesAndHighPlatforms(
  targetX: number,
  targetZ: number,
  curY: number,
  radius: number,
): { x: number; z: number; hitObstacle: boolean } {
  let curX = targetX;
  let curZ = targetZ;
  let hitObstacle = false;

  // 1. High platforms
  for (let i = 0; i < PLATFORMS.length; i++) {
    const p = PLATFORMS[i]!;
    const baseIslandY = ISLANDS[p.island].topY;
    const platformTop = baseIslandY + p.floorY;
    const isStepUp = platformTop - curY <= MAX_STEP_UP + 1e-4;

    if (!isStepUp) {
      const res = pushOutOfPlatformBox(
        curX,
        curZ,
        radius,
        p.minX,
        p.maxX,
        p.minZ,
        p.maxZ,
      );
      if (res.hit) {
        curX = res.x;
        curZ = res.z;
        hitObstacle = true;
      }
    }
  }

  // 2. Obstacle cylinders
  for (let i = 0; i < OBSTACLES.length; i++) {
    const obs = OBSTACLES[i]!;
    if (curY >= obs.baseY - 0.2 && curY <= obs.baseY + obs.height + 0.2) {
      const dx = curX - obs.x;
      const dz = curZ - obs.z;
      const minSep = obs.radius + radius;
      const distSq = dx * dx + dz * dz;
      if (distSq < minSep * minSep) {
        const dist = Math.sqrt(distSq);
        if (dist > 1e-6) {
          const push = minSep - dist;
          curX += (dx / dist) * push;
          curZ += (dz / dist) * push;
        } else {
          curX += minSep;
        }
        hitObstacle = true;
      }
    }
  }

  // 3. Obstacle boxes (walls, stands, railings)
  for (let i = 0; i < OBSTACLE_BOXES.length; i++) {
    const box = OBSTACLE_BOXES[i]!;
    if (curY >= box.baseY - 0.2 && curY <= box.baseY + box.height + 0.2) {
      const res = pushOutOfPlatformBox(
        curX,
        curZ,
        radius,
        box.minX,
        box.maxX,
        box.minZ,
        box.maxZ,
      );
      if (res.hit) {
        curX = res.x;
        curZ = res.z;
        hitObstacle = true;
      }
    }
  }

  return { x: curX, z: curZ, hitObstacle };
}

function clampToWalkableArea(
  prevX: number,
  prevZ: number,
  targetX: number,
  targetZ: number,
): { x: number; z: number; clamped: boolean } {
  if (heightAt(targetX, targetZ) !== null) {
    return { x: targetX, z: targetZ, clamped: false };
  }

  // 1. Check if the player was on or entering a bridge strip -> slide along the bridge rail
  for (let i = 0; i < BRIDGES.length; i++) {
    const bridge = BRIDGES[i]!;
    const first = bridge.points[0]!;
    const prevRelX = prevX - first.x;
    const prevRelZ = prevZ - first.z;
    const prevAlong = prevRelX * bridge.dirX + prevRelZ * bridge.dirZ;
    const prevPerp = Math.abs(
      prevRelX * bridge.normalX + prevRelZ * bridge.normalZ,
    );

    const relX = targetX - first.x;
    const relZ = targetZ - first.z;
    const along = relX * bridge.dirX + relZ * bridge.dirZ;
    const perp = relX * bridge.normalX + relZ * bridge.normalZ;

    const nearBridgeAlong =
      (along >= 0 && along <= bridge.totalLengthXZ) ||
      (prevAlong >= 0 &&
        prevAlong <= bridge.totalLengthXZ &&
        prevPerp <= bridge.walkableHalfWidth + 0.2);

    if (
      nearBridgeAlong &&
      Math.abs(perp) <= bridge.walkableHalfWidth + 1.5
    ) {
      const clampedAlong = Math.max(
        0,
        Math.min(bridge.totalLengthXZ, along),
      );
      const maxPerp = bridge.walkableHalfWidth - 0.02;
      const clampedPerp = Math.max(-maxPerp, Math.min(maxPerp, perp));
      const cx =
        first.x +
        bridge.dirX * clampedAlong +
        bridge.normalX * clampedPerp;
      const cz =
        first.z +
        bridge.dirZ * clampedAlong +
        bridge.normalZ * clampedPerp;
      if (heightAt(cx, cz) !== null) {
        return { x: cx, z: cz, clamped: true };
      }
    }
  }

  // 2. Otherwise find the nearest reachable island and slide along its curved superelliptic rim at t = 0.93
  let nearestIsland: IslandDef = ISLANDS.A;
  let bestDist = Infinity;
  for (let i = 0; i < REACHABLE_ISLANDS.length; i++) {
    const isl = REACHABLE_ISLANDS[i]!;
    const d =
      Math.hypot(targetX - isl.center.x, targetZ - isl.center.z) - isl.radius;
    if (d < bestDist) {
      bestDist = d;
      nearestIsland = isl;
    }
  }

  const dx = targetX - nearestIsland.center.x;
  const dz = targetZ - nearestIsland.center.z;
  const theta = Math.atan2(dz, dx);
  const maxR =
    islandRadiusAtAngle(
      nearestIsland.key as IslandKey,
      nearestIsland.radius,
      theta,
    ) * 0.925;

  const clampedX = nearestIsland.center.x + Math.cos(theta) * maxR;
  const clampedZ = nearestIsland.center.z + Math.sin(theta) * maxR;

  if (heightAt(clampedX, clampedZ) !== null) {
    return { x: clampedX, z: clampedZ, clamped: true };
  }

  return { x: prevX, z: prevZ, clamped: true };
}

function isOnBridge(x: number, z: number): boolean {
  for (let i = 0; i < BRIDGES.length; i++) {
    if (evaluateBridgeHeight(BRIDGES[i]!, x, z) !== null) {
      return true;
    }
  }
  return false;
}

/**
 * Analytic collision resolver.
 * Pushes out of obstacle cylinders (columns, tree trunks, lantern posts, pool rim, gate veil),
 * enforces slope limit (blocks slopes > 40 degrees on terrain),
 * enforces step-up up to 0.4 m, and keeps the player inside walkable areas, sliding along edges.
 */
export function resolveMove(
  pos: Vec3Tuple,
  delta: { x: number; y?: number; z: number },
  radius = 0.4,
): MoveResult {
  const startGroundY = heightAt(pos.x, pos.z, pos.y) ?? pos.y;

  // Sub-step large deltas so fast movements never tunnel through thin obstacles
  const totalStepDist = Math.hypot(delta.x, delta.z);
  const steps = Math.max(1, Math.ceil(totalStepDist / 0.25));
  const stepDx = delta.x / steps;
  const stepDz = delta.z / steps;

  let curX = pos.x;
  let curZ = pos.z;
  let curY = startGroundY;
  let hitObstacle = false;
  let clampedEdge = false;

  for (let s = 0; s < steps; s++) {
    let candidateX = curX + stepDx;
    let candidateZ = curZ + stepDz;

    // 1. Slope check: block movement if terrain slope exceeds MAX_SLOPE_DEG (40 deg),
    // unless candidate is on a bridge or is a valid step-up (stairs <= MAX_STEP_UP)
    const candidateH = heightAt(candidateX, candidateZ, curY);
    const onBridge = isOnBridge(candidateX, candidateZ);
    const isStepUp =
      candidateH !== null &&
      candidateH - curY >= -0.05 &&
      candidateH - curY <= MAX_STEP_UP + 1e-4;

    if (!onBridge) {
      const grad = terrainGradient(candidateX, candidateZ);
      if (grad.slopeDeg > MAX_SLOPE_DEG && !isStepUp) {
        // Check if player is moving uphill against steep slope
        const dotUphill = stepDx * grad.gx + stepDz * grad.gz;
        if (dotUphill > 0) {
          // Project movement along contour perpendicular to slope (-gz, gx)
          const cLen = Math.hypot(grad.gz, grad.gx);
          if (cLen > 1e-4) {
            const cX = -grad.gz / cLen;
            const cZ = grad.gx / cLen;
            const proj = stepDx * cX + stepDz * cZ;
            candidateX = curX + cX * proj;
            candidateZ = curZ + cZ * proj;
          } else {
            candidateX = curX;
            candidateZ = curZ;
          }
          hitObstacle = true;
        }
      }
    }

    // 2. Push out of obstacle cylinders and un-steppable platforms (> 0.4 m)
    const obsRes = resolveObstaclesAndHighPlatforms(
      candidateX,
      candidateZ,
      curY,
      radius,
    );
    if (obsRes.hitObstacle) {
      hitObstacle = true;
    }

    // 3. Clamp and slide along walkable island/bridge edges
    const edgeRes = clampToWalkableArea(curX, curZ, obsRes.x, obsRes.z);
    if (edgeRes.clamped) {
      clampedEdge = true;
    }

    // 4. Re-verify obstacles after edge slide
    const finalObs = resolveObstaclesAndHighPlatforms(
      edgeRes.x,
      edgeRes.z,
      curY,
      radius,
    );
    if (finalObs.hitObstacle) {
      hitObstacle = true;
    }

    const nextHeight = heightAt(finalObs.x, finalObs.z, curY);
    if (nextHeight !== null && nextHeight - curY <= MAX_STEP_UP + 1e-4) {
      curX = finalObs.x;
      curZ = finalObs.z;
      curY = nextHeight;
    } else {
      clampedEdge = true;
    }
  }

  return {
    x: curX,
    y: curY,
    z: curZ,
    grounded: true,
    hitObstacle,
    clampedEdge,
  };
}
