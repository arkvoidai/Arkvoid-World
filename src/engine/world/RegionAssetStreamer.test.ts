import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import type { DeviceProfile } from '@/lib/deviceProfile';
import {
  REGION_MODEL_MANIFEST,
  buildPublicRegionAssetUrl,
  fitRegionModel,
  selectRegionModels,
} from './RegionAssetStreamer.js';

function profile(deviceClass: 'phone' | 'desktop', gpuTier: 0 | 1 | 2 | 3, isSoftwareGl = false): DeviceProfile {
  return {
    deviceClass,
    gpuTier,
    deviceMemory: deviceClass === 'phone' ? 4 : 8,
    reducedMotion: false,
    isSoftwareGl,
    dprCap: deviceClass === 'phone' ? 1.5 : 2,
    cloudPuffCount: deviceClass === 'phone' ? 28 : 60,
    starDensity: deviceClass === 'phone' ? 0.65 : 1,
    skyExtraHalo: deviceClass === 'desktop' && gpuTier >= 2,
  };
}

test('public Supabase model URLs encode object names and never require a secret key', () => {
  assert.equal(
    buildPublicRegionAssetUrl('https://example.supabase.co/', 'pine_tree (1).glb'),
    'https://example.supabase.co/storage/v1/object/public/arkvoid-assets/pine_tree%20(1).glb',
  );
  assert.equal(buildPublicRegionAssetUrl('', 'great_mountain.glb'), null);
});

test('model selection fits device download budgets and region identity', () => {
  const phone = selectRegionModels('veiled-peaks', profile('phone', 1));
  assert.deepEqual(phone.map((asset) => asset.fileName), ['great_mountain.glb']);

  const midDesktop = selectRegionModels('veiled-peaks', profile('desktop', 2));
  assert.deepEqual(midDesktop.map((asset) => asset.fileName), [
    'great_mountain.glb', 'pine_tree.glb', 'cliff_rock_boulder_field.glb',
  ]);

  const ultraDesktop = selectRegionModels('veiled-peaks', profile('desktop', 3));
  assert.deepEqual(ultraDesktop.map((asset) => asset.fileName), [
    'great_mountain.glb', 'pine_tree.glb', 'chinese_temple__sacred_peak_shrine.glb',
  ]);
  assert.ok(ultraDesktop.reduce((sum, asset) => sum + asset.estimatedBytes, 0) <= 48 * 1024 * 1024);

  assert.deepEqual(
    selectRegionModels('capital-valley', profile('phone', 1)).map((asset) => asset.fileName),
    ['delal_bridge_zakho.glb'],
  );
  assert.deepEqual(
    selectRegionModels('primordial-forest', profile('desktop', 2)).map((asset) => asset.fileName),
    ['rock.glb', 'pine_tree (1).glb'],
  );
  assert.deepEqual(selectRegionModels('primordial-forest', profile('phone', 1)), []);
  assert.deepEqual(selectRegionModels('veiled-peaks', profile('desktop', 0, true)), []);
});

test('all seven uploaded GLBs are represented in the regional manifest', () => {
  assert.equal(REGION_MODEL_MANIFEST.length, 7);
  assert.deepEqual(
    REGION_MODEL_MANIFEST.map((asset) => asset.fileName).sort(),
    [
      'chinese_temple__sacred_peak_shrine.glb',
      'cliff_rock_boulder_field.glb',
      'delal_bridge_zakho.glb',
      'great_mountain.glb',
      'pine_tree (1).glb',
      'pine_tree.glb',
      'rock.glb',
    ].sort(),
  );
});

test('GLB normalization grounds the model and applies a deterministic target height', () => {
  const scene = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(2, 4, 2),
    new THREE.MeshBasicMaterial(),
  );
  mesh.position.set(5, 2, -3);
  scene.add(mesh);

  const fitted = fitRegionModel(scene, { x: 100, y: 48, z: -220 }, 20, Math.PI / 2);
  assert.ok(fitted);
  fitted!.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(fitted!);
  const size = bounds.getSize(new THREE.Vector3());
  const centre = bounds.getCenter(new THREE.Vector3());
  assert.ok(Math.abs(size.y - 20) < 1e-5);
  assert.ok(Math.abs(bounds.min.y - 48) < 1e-5);
  assert.ok(Math.abs(centre.x - 100) < 1e-5);
  assert.ok(Math.abs(centre.z + 220) < 1e-5);
  fitted!.traverse((object) => {
    const child = object as THREE.Mesh;
    if (child.isMesh) {
      child.geometry.dispose();
      child.material.dispose();
    }
  });
});
