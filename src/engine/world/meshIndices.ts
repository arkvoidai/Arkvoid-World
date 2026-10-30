/**
 * Creates a grid of triangles with outward-facing winding for a surface
 * whose radius increases with each ring and whose angle advances in +Z.
 */
export function createOutwardGridIndices(ringCount: number, segmentCount: number): number[] {
  if (!Number.isInteger(ringCount) || ringCount < 1) {
    throw new RangeError('ringCount must be a positive integer');
  }
  if (!Number.isInteger(segmentCount) || segmentCount < 3) {
    throw new RangeError('segmentCount must be an integer of at least 3');
  }

  const indices: number[] = [];
  const stride = segmentCount + 1;
  for (let ring = 0; ring < ringCount; ring++) {
    for (let segment = 0; segment < segmentCount; segment++) {
      const innerStart = ring * stride + segment;
      const innerNext = innerStart + 1;
      const outerStart = (ring + 1) * stride + segment;
      const outerNext = outerStart + 1;

      indices.push(innerStart, innerNext, outerStart);
      indices.push(innerNext, outerNext, outerStart);
    }
  }
  return indices;
}
