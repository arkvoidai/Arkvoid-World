export interface RiverPoint { x: number; y: number; z: number; accumulation: number; slope: number }
export interface RiverRibbonData {
  positions: Float32Array; uvs: Float32Array; indices: Uint32Array;
  flow: Float32Array; depth: Float32Array; centerline: Float32Array;
}
function catmull(a: number, b: number, c: number, d: number, t: number): number {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
}
function sample(points: readonly RiverPoint[], t: number): RiverPoint {
  const scaled = t * (points.length - 1);
  const index = Math.min(points.length - 2, Math.floor(scaled));
  const u = scaled - index;
  const p0 = points[Math.max(0, index - 1)]!, p1 = points[index]!;
  const p2 = points[index + 1]!, p3 = points[Math.min(points.length - 1, index + 2)]!;
  return {
    x: catmull(p0.x, p1.x, p2.x, p3.x, u),
    y: catmull(p0.y, p1.y, p2.y, p3.y, u),
    z: catmull(p0.z, p1.z, p2.z, p3.z, u),
    accumulation: Math.max(0, catmull(p0.accumulation, p1.accumulation, p2.accumulation, p3.accumulation, u)),
    slope: Math.max(0, catmull(p0.slope, p1.slope, p2.slope, p3.slope, u)),
  };
}
export function riverWidth(accumulation: number, minWidth = 2, maxWidth = 40): number {
  const weight = Math.max(0, Math.min(1, Math.log1p(Math.max(0, accumulation)) / Math.log1p(10000)));
  return minWidth + (maxWidth - minWidth) * Math.pow(weight, 0.72);
}

export function buildRiverRibbon(points: readonly RiverPoint[], segments = 64, minWidth = 2, maxWidth = 40): RiverRibbonData {
  if (points.length < 2) throw new RangeError('A river requires at least two flow points');
  if (!Number.isInteger(segments) || segments < 1) throw new RangeError('segments must be a positive integer');
  const positions = new Float32Array((segments + 1) * 2 * 3);
  const uvs = new Float32Array((segments + 1) * 2 * 2);
  const flow = new Float32Array((segments + 1) * 2 * 2);
  const depth = new Float32Array((segments + 1) * 2);
  const centerline = new Float32Array((segments + 1) * 3);
  const indices = new Uint32Array(segments * 6);
  let distance = 0, previousX = 0, previousZ = 0;

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = sample(points, t);
    const next = sample(points, Math.min(1, t + 1 / segments));
    const previous = sample(points, Math.max(0, t - 1 / segments));
    const dx = next.x - previous.x, dz = next.z - previous.z;
    const len = Math.max(1e-5, Math.hypot(dx, dz));
    const dirX = dx / len, dirZ = dz / len;
    const normalX = -dirZ, normalZ = dirX;
    if (i > 0) distance += Math.hypot(p.x - previousX, p.z - previousZ);
    previousX = p.x; previousZ = p.z;
    const halfWidth = riverWidth(p.accumulation, minWidth, maxWidth) * 0.5;
    const bedDepth = Math.max(0.3, Math.min(3, 0.3 + p.accumulation / 3000));

    for (let side = 0; side < 2; side++) {
      const sign = side === 0 ? -1 : 1;
      const vertex = i * 2 + side, pos = vertex * 3;
      positions[pos] = p.x + normalX * halfWidth * sign;
      positions[pos + 1] = p.y;
      positions[pos + 2] = p.z + normalZ * halfWidth * sign;
      uvs[vertex * 2] = side;
      uvs[vertex * 2 + 1] = distance / Math.max(1, maxWidth);
      flow[vertex * 2] = dirX;
      flow[vertex * 2 + 1] = dirZ;
      depth[vertex] = bedDepth;
    }
    centerline[i * 3] = p.x;
    centerline[i * 3 + 1] = p.y;
    centerline[i * 3 + 2] = p.z;
    if (i < segments) {
      const base = i * 2, index = i * 6;
      indices[index] = base; indices[index + 1] = base + 2; indices[index + 2] = base + 1;
      indices[index + 3] = base + 1; indices[index + 4] = base + 2; indices[index + 5] = base + 3;
    }
  }
  return { positions, uvs, indices, flow, depth, centerline };
}
export function waterDepthWalkable(depthMeters: number): boolean { return depthMeters >= 0 && depthMeters <= 0.4; }
export function shallowWaterSpeedMultiplier(depthMeters: number): number {
  return waterDepthWalkable(depthMeters) && depthMeters > 0.05 ? 0.85 : 1;
}
