import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXPANDED_REGIONS,
  HOME_REGION_GATES,
  expandedRegionAt,
  expandedRegionHeightAt,
} from './WorldRegions.js';
import { heightAt, resolveMove } from './collision.js';

test('Each new continent has a distinct biome and an analytic walkable surface', () => {
  assert.equal(EXPANDED_REGIONS.length, 3);
  assert.deepEqual(EXPANDED_REGIONS.map((region) => region.id), [
    'veiled-peaks', 'capital-valley', 'primordial-forest',
  ]);
  for (const region of EXPANDED_REGIONS) {
    const { x, z } = region.center;
    assert.equal(expandedRegionAt(x, z)?.id, region.id);
    const height = expandedRegionHeightAt(x, z);
    assert.ok(height !== null && Number.isFinite(height));
    assert.ok(height >= 0 && height <= 300);
    assert.equal(expandedRegionAt(x + region.radius + 2, z), null);
    assert.equal(expandedRegionHeightAt(x + region.radius + 2, z), null);
  }
});

test('Home Reach has one portal per built continent', () => {
  assert.equal(HOME_REGION_GATES.length, 3);
  assert.deepEqual(HOME_REGION_GATES.map((gate) => gate.regionId), [
    'veiled-peaks', 'capital-valley', 'primordial-forest',
  ]);
  for (const gate of HOME_REGION_GATES) {
    assert.ok(Math.hypot(gate.position.x, gate.position.z) < 34);
  }
});

test('Expanded region terrain participates in player collision and movement', () => {
  for (const region of EXPANDED_REGIONS) {
    const start = { x: region.center.x - 115, y: region.baseY, z: region.center.z + 125 };
    const ground = heightAt(start.x, start.z);
    assert.ok(ground !== null && Number.isFinite(ground));
    const moved = resolveMove({ ...start, y: ground }, { x: 1.2, z: 0 });
    assert.ok(moved.x > start.x, region.id + ' should allow movement across its surface');
    assert.ok(Math.abs(moved.y - (heightAt(moved.x, moved.z) ?? moved.y)) < 0.01);
  }
});
