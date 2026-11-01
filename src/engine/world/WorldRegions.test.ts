import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXPANDED_REGIONS,
  WorldRegions,
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

test('Home Reach has no inter-region portal gates and exposes an authored asset anchor', () => {
  const world = new WorldRegions(true);
  try {
    const homeAssets = world.getRegionGroup('home-reach');
    assert.equal(homeAssets?.name, 'HomeReachAuthoredAssets');
    assert.equal(homeAssets?.visible, true);
    const portalNames: string[] = [];
    world.traverse((object) => {
      if (object.name.includes('HomeGate_') || object.name.includes('ReturnGate_')) portalNames.push(object.name);
    });
    assert.deepEqual(portalNames, []);
    world.setActiveRegion('veiled-peaks');
    assert.equal(homeAssets?.visible, false);
    world.setActiveRegion('home-reach');
    assert.equal(homeAssets?.visible, true);
  } finally {
    world.dispose();
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


test('Distant continents are built on demand and only the active one is visible', () => {
  const world = new WorldRegions(true);
  try {
    for (const region of EXPANDED_REGIONS) {
      assert.equal(world.getObjectByName('Region_' + region.id), undefined);
    }
    assert.equal(world.getObjectByName('HomeGate_gate-veiled-peaks'), undefined);
    assert.equal(world.getObjectByName('HomeGate_gate-capital-valley'), undefined);
    assert.equal(world.getObjectByName('HomeGate_gate-primordial-forest'), undefined);
    world.setActiveRegion('veiled-peaks');
    assert.equal(world.getObjectByName('Region_veiled-peaks')?.visible, true);
    assert.equal(world.getObjectByName('Region_capital-valley'), undefined);
    assert.equal(world.getObjectByName('Region_primordial-forest'), undefined);
    world.setActiveRegion('primordial-forest');
    assert.equal(world.getObjectByName('Region_primordial-forest')?.visible, true);
    assert.equal(world.getObjectByName('Region_veiled-peaks')?.visible, false);
    world.setActiveRegion('home-reach');
    assert.equal(world.getObjectByName('Region_veiled-peaks')?.visible, false);
    assert.equal(world.getObjectByName('Region_primordial-forest')?.visible, false);
    assert.ok(world.getObjectByName('HomeGate_gate-veiled-peaks'));
    assert.ok(world.getObjectByName('HomeGate_gate-capital-valley'));
    assert.ok(world.getObjectByName('HomeGate_gate-primordial-forest'));
  } finally {
    world.dispose();
  }
});
