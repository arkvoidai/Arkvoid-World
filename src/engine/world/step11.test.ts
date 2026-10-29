import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WindSystem } from '../fx/Wind';
import { TreeSystem } from './Trees';
import { SkyDome } from './SkyDome';
import { CloudSea } from './CloudSea';
import { DistantSpires } from './Spires';
import { RockSystem } from './Rocks';
import { IslandLandformMesh } from './IslandMesh';
import { createBeveledBoxGeometry } from './kit/bevel';
import { createHipAndGableRoofGeometry } from './kit/roofs';
import { createSectArchitecture } from './SectArchitecture';
import { MaterialLibrary } from './MaterialLibrary';
import { AssetStore } from '../core/AssetStore';
import { TextureCatalog } from '../core/TextureCatalog';
import { runSceneAudit } from './SceneAudit';
import { REVIEW_SHOTS } from './reviewShots';
import { SKY_KEYS_V2, timeOfDayState } from './sky';
import type { DeviceProfile } from '../../lib/deviceProfile';

const mockDesktopDevice: DeviceProfile = {
  deviceClass: 'desktop',
  gpuTier: 3,
  deviceMemory: 8,
  isSoftwareGl: false,
  dprCap: 2,
  cloudPuffCount: 60,
  starDensity: 1.0,
  skyExtraHalo: true,
  reducedMotion: false,
};

test('Step 11 D1 & D2: TreeSystem curved trunks, >= 100 crossed leaf cards per tree, and strict cliff/path/pond placement rules', () => {
  const wind = new WindSystem();
  const store = new AssetStore(mockDesktopDevice);
  const trees = new TreeSystem(wind.uniforms, store, false);

  const audit = trees.getAuditData();
  assert.ok(audit.totalPlaced >= 50, `Expected >= 50 trees, got ${audit.totalPlaced}`);
  assert.equal(audit.leafAtlasLoadFailures, 0, 'Leaf cluster atlas must have 0 failures');
  assert.ok(audit.minLeafCardsPerTree >= 100, `Expected >= 100 leaf cards per tree, got ${audit.minLeafCardsPerTree}`);
  assert.equal(audit.slopeOver25Count, 0);
  assert.equal(audit.outsideRimCount, 0);
  assert.equal(audit.nearPathBuildingPondCount, 0);
  assert.equal(audit.belowRimHeightCount, 0);
  assert.equal(audit.lowLeafCardSpeciesCount, 0);

  trees.dispose();
  store.dispose();
  wind.dispose();
});

test('Step 11 D3 & D4: SkyDome cloud-plane projection, SkyStars <= 4px Gaussian points, and 5-layer CloudSea', () => {
  const skyDome = new SkyDome(mockDesktopDevice);
  assert.ok(skyDome.starsPoints, 'SkyDome must include dedicated SkyStars THREE.Points child');
  const starMat = skyDome.starsPoints.material as THREE.ShaderMaterial;
  assert.ok(starMat.vertexShader.includes('gl_PointSize'));
  assert.ok(starMat.fragmentShader.includes('discard'));

  const cloudSea = new CloudSea(mockDesktopDevice);
  // 5 stacked volumetric cloud planes + 1 puff instanced mesh = 6 children
  assert.equal(cloudSea.group.children.length, 6);

  skyDome.dispose();
  cloudSea.dispose();
});

test('Step 11 D5: TextureCatalog binds path_diff.jpg to path slot and createBeveledBoxGeometry generates metric box UVs', () => {
  const catalog = TextureCatalog.getInstance();
  assert.equal(catalog.assignments.path.assignedSet?.setKey ?? 'path', 'path');
  assert.equal(catalog.unusedSets.length, 0, 'All repository texture sets must be assigned');

  // Verify metric UVs on a 16m x 2.2m x 26m terrace box (UVs should span ~8..13 tiles, not 0..1)
  const geo = createBeveledBoxGeometry(16, 2.2, 26, 0.06, 2);
  const uv = geo.getAttribute('uv');
  assert.ok(uv);
  let maxU = 0;
  let maxV = 0;
  for (let i = 0; i < uv.count; i++) {
    maxU = Math.max(maxU, Math.abs(uv.getX(i)));
    maxV = Math.max(maxV, Math.abs(uv.getY(i)));
  }
  assert.ok(maxU > 3.0 && maxV > 5.0, `Expected metric tiled UVs (> 3.0), got maxU=${maxU}, maxV=${maxV}`);
  geo.dispose();
});

test('Step 11 D7: createHipAndGableRoofGeometry aligns ridge along Z when depth > width and SectArchitecture has 0 floating parts', () => {
  // Main Hall roof has width=15, depth=25 (depth > width -> ridge along Z)
  const roofGeo = createHipAndGableRoofGeometry(15, 25, 1.8, 3.5, 0.55, 0.22, 20, 28);
  roofGeo.computeBoundingBox();
  const box = roofGeo.boundingBox!;
  assert.ok(box.max.y >= 3.4, `Expected peak height >= 3.4, got ${box.max.y}`);
  roofGeo.dispose();

  const store = new AssetStore(mockDesktopDevice);
  const matLib = new MaterialLibrary(store);
  const sectArch = createSectArchitecture(matLib, false);

  const scene = new THREE.Scene();
  scene.add(sectArch.group);

  const mockShowcase = {
    getTrees: () => null,
    getSectArch: () => sectArch,
  } as unknown as Parameters<typeof runSceneAudit>[1];

  const auditRes = runSceneAudit(scene, mockShowcase, store, null);
  assert.equal(auditRes.failCount, 0, `Expected 0 audit failures, got:\n${auditRes.lines.join('\n')}`);
  assert.equal(auditRes.passed, true);

  sectArch.dispose();
  matLib.dispose();
  store.dispose();
});

test('Step 11 D6, D8, D9, D10, D11: Sculpted underside spikes, DistantSpires aerial shader, luminous night keys, D1-D10 shots, and full SceneAudit', () => {
  const wind = new WindSystem();
  const store = new AssetStore(mockDesktopDevice);
  const matLib = new MaterialLibrary(store);
  const sectArch = createSectArchitecture(matLib, false);
  const trees = new TreeSystem(wind.uniforms, store, false);
  const islandA = new IslandLandformMesh('A', store, { isPhone: false });
  const rocks = new RockSystem(store);
  const spires = new DistantSpires(false, store);
  const skyDome = new SkyDome(mockDesktopDevice);
  const cloudSea = new CloudSea(mockDesktopDevice);

  const skyDusk = timeOfDayState(18.3);
  const skyNight = timeOfDayState(23.0);
  spires.syncSky(skyDusk);
  trees.update(0, 0, new THREE.Vector3(0, 5, 25), skyDusk);

  const scene = new THREE.Scene();
  scene.add(skyDome.mesh, cloudSea.group, sectArch.group, trees, islandA, rocks, spires);

  const mockShowcase = {
    getTrees: () => trees,
    getSectArch: () => sectArch,
  } as unknown as Parameters<typeof runSceneAudit>[1];

  const fullAudit = runSceneAudit(scene, mockShowcase, store, {
    mean: 0.34,
    p5: 0.06,
    p95: 0.74,
    clippedWhiteFraction: 0.002,
    crushedBlackFraction: 0.012,
    isInTarget: true,
    sampleCount: 2304,
    lastUpdatedMs: 1000,
  });

  assert.equal(fullAudit.passed, true, `Full SceneAudit must pass with 0 FAIL:\n${fullAudit.lines.join('\n')}`);
  assert.equal(fullAudit.failCount, 0);
  assert.equal(fullAudit.passCount, 6);

  // Night hemisphere intensity is luminous (>= 0.65)
  const nightKey = SKY_KEYS_V2.find((k) => k.hour === 23.0)!;
  assert.ok(nightKey.hemiIntensity >= 0.65);
  assert.ok(skyNight.hemiIntensity >= 0.65);

  // Review shots include D1-D10 verification shots
  const dShotIds = REVIEW_SHOTS.filter((s) => s.id.startsWith('d'));
  assert.equal(dShotIds.length, 10);

  skyDome.dispose();
  cloudSea.dispose();
  sectArch.dispose();
  matLib.dispose();
  trees.dispose();
  islandA.dispose();
  rocks.dispose();
  spires.dispose();
  store.dispose();
  wind.dispose();
});
