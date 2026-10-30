import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createOutwardGridIndices } from '@/engine/world/meshIndices';

describe('outward terrain index winding', () => {
  it('keeps non-degenerate top-surface triangles facing +Y', () => {
    const segments = 12;
    const indices = createOutwardGridIndices(3, segments);
    const stride = segments + 1;

    const vertex = (index: number): [number, number, number] => {
      const ring = Math.floor(index / stride) + 1;
      const segment = index % stride;
      const angle = (segment / segments) * Math.PI * 2;
      return [Math.cos(angle) * ring, 0, Math.sin(angle) * ring];
    };

    const crossY = (a: number, b: number, c: number): number => {
      const va = vertex(a);
      const vb = vertex(b);
      const vc = vertex(c);
      const abx = vb[0] - va[0];
      const abz = vb[2] - va[2];
      const acx = vc[0] - va[0];
      const acz = vc[2] - va[2];
      return abz * acx - abx * acz;
    };

    // Skip the centre ring, whose coincident vertices are intentionally degenerate.
    const firstNonDegenerateRow = segments * 6;
    for (let offset = firstNonDegenerateRow; offset < segments * 12; offset += 3) {
      assert.ok(
        crossY(indices[offset]!, indices[offset + 1]!, indices[offset + 2]!) > 0,
        `triangle at index offset ${offset} must face upward`,
      );
    }
  });

  it('rejects invalid grid dimensions', () => {
    assert.throws(() => createOutwardGridIndices(0, 12), RangeError);
    assert.throws(() => createOutwardGridIndices(2, 2), RangeError);
  });
});
