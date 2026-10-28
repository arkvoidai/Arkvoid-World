import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WindSystem } from '../fx/Wind';
import { RockSystem } from './Rocks';
import { WaterSystem } from './Water';
import { TreeSystem } from './Trees';
import { FlowerSystem } from '../fx/Flowers';
import { GrassSystem } from '../fx/Grass';
import { LifeSystem } from '../fx/Life';
import { heightAt, resolveMove } from './collision';
import { PLATFORMS } from './layout';

test('Step 8 WindSystem: creates global uniforms and updates drift/gusts/push points', () => {
  const wind = new WindSystem();
  assert.ok(wind.uniforms.uWindDir);
  assert.ok(wind.uniforms.uWindStrength);
  assert.ok(wind.uniforms.uGust);
  assert.ok(wind.uniforms.uTime);
  assert.ok(wind.uniforms.uPushPoints);

  // Update
  wind.update(1.5, 0.016, 17.5);
  const strength = wind.uniforms.uWindStrength.value;
  assert.ok(strength >= 0.2 && strength <= 0.7, `Wind strength out of range: ${strength}`);

  // Push point
  wind.setPushPoint(0, 5, 2, 8, 1.2);
  const pushArray = wind.uniforms.uPushPoints.value as THREE.Vector4[];
  assert.equal(pushArray[0]!.x, 5);
  assert.equal(pushArray[0]!.y, 2);
  assert.equal(pushArray[0]!.z, 8);
  assert.equal(pushArray[0]!.w, 1.2);

  wind.dispose();
});

test('Step 8 RockSystem: creates instanced boulders and 5 walkable stepping stones', () => {
  const rocks = new RockSystem();
  assert.equal(rocks.count, 60);
  assert.ok(rocks.mesh);
  assert.ok(rocks.mesh.geometry.attributes.position);

  // Check 5 stepping stone platforms registered in PLATFORMS
  const steppingStones = PLATFORMS.filter((p) => p.id.startsWith('stream-step-'));
  assert.equal(steppingStones.length, 5);

  // Test heightAt on each stepping stone platform
  for (const stone of steppingStones) {
    const cx = (stone.minX + stone.maxX) * 0.5;
    const cz = (stone.minZ + stone.maxZ) * 0.5;
    const h = heightAt(cx, cz);
    assert.ok(h !== null && Math.abs(h - stone.floorY) < 0.05, `Height at ${stone.id} should match floorY`);

    // Test walking across it
    const res = resolveMove({ x: cx - 0.1, y: stone.floorY, z: cz }, { x: 0.1, z: 0 });
    assert.equal(res.hitObstacle, false);
    assert.ok(Math.abs(res.y - stone.floorY) < 0.15);
  }

  rocks.dispose();
});

test('Step 8 WaterSystem: initializes Spirit Pond, 14 lotus pads, stream ribbon, and waterfalls', () => {
  const water = new WaterSystem(false);
  assert.ok(water.pondMesh);
  assert.ok(water.pondMesh.geometry.attributes.aShoreDist);
  assert.equal(water.lotusCount, 14);
  assert.ok(water.lotusMesh);
  assert.ok(water.streamMesh);
  assert.ok(water.heroFallMesh);
  assert.ok(water.rimFallMesh);
  assert.ok(water.sprayPoints);

  // Frame update
  water.update(0.016, 2.0, 17.5);
  assert.equal(water.pondMat!.uniforms.uTime!.value, 2.0);

  water.dispose();
});

test('Step 8 TreeSystem: procedural generation of 5 species, canopy LODs, and falling leaves', () => {
  const wind = new WindSystem();
  const trees = new TreeSystem(wind.uniforms, undefined, false);
  
  assert.ok(trees.totalTrees > 50, `Expected > 50 trees, got ${trees.totalTrees}`);
  assert.ok(trees.fallingLeaves);

  // Update
  const dummyCam = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  dummyCam.position.set(0, 10, 30);
  dummyCam.lookAt(0, 0, 0);
  trees.update(0.016, 1.0, dummyCam.position);

  trees.dispose();
  wind.dispose();
});

test('Step 8 FlowerSystem: procedural canvas atlas and instanced ground drifts', () => {
  const wind = new WindSystem();
  const flowers = new FlowerSystem(wind.uniforms, false);
  
  assert.ok(flowers.flowersMesh);
  assert.ok(flowers.pebbles);
  assert.ok(flowers.mushrooms);
  assert.ok(flowers.count > 5000, `Expected > 5000 flowers, got ${flowers.count}`);

  flowers.update(1.0);
  flowers.dispose();
  wind.dispose();
});

test('Step 8 GrassSystem: 5-vertex tapered blades, 3 rings, and budget tiers', () => {
  const wind = new WindSystem();
  const grass = new GrassSystem(wind.uniforms, 'desktop-high');
  
  assert.equal(grass.bladeBudget, 120000);
  assert.ok(grass.bladeGeometry);
  assert.equal(grass.bladeGeometry.getAttribute('position').count, 5);

  const dummyCam = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  dummyCam.position.set(0, 3, 5);
  dummyCam.lookAt(0, 0, 0);
  dummyCam.updateMatrixWorld();
  dummyCam.updateProjectionMatrix();

  // Run update to build chunks
  grass.update(0.016, 1.0, dummyCam, new THREE.Vector3(0, 0, 0));
  assert.ok(grass.chunks.size > 0);

  grass.dispose();
  wind.dispose();
});

test('Step 8 LifeSystem: day butterflies, night fireflies, cranes, swifts, koi, and wisps', () => {
  const life = new LifeSystem(false);
  assert.ok(life.butterfliesMesh);
  assert.ok(life.firefliesMesh);
  assert.ok(life.cranesMesh);
  assert.ok(life.swiftsMesh);
  assert.ok(life.koiMesh);
  assert.ok(life.wispsMesh);

  // Update day hour
  life.update(10.0, 0.016, 14.0);
  assert.equal(life.craneCount, 12);
  assert.equal(life.swiftCount, 8);
  assert.equal(life.koiCount, 6);

  // Update dusk hour
  life.update(12.0, 0.016, 19.5);

  life.dispose();
});
