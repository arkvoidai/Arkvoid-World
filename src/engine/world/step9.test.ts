import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AssetStore } from '../core/AssetStore';
import { MaterialLibrary } from './MaterialLibrary';
import { createBeveledBoxGeometry, applyVertexWear } from './kit/bevel';
import {
  createEntasisColumnGeometry,
  createBracketClusterGeometry,
  createRafterGeometry,
} from './kit/columns';
import {
  createHipAndGableRoofGeometry,
  createRidgeCapGeometry,
  createEaveCapGeometry,
} from './kit/roofs';
import { getLatticeWindowTexture, createFramedWallGeometry } from './kit/walls';
import { createGrandStairGeometry, createCarvedPostGeometry } from './kit/stairs';
import { createStoneLanternGeometry, createHangingPaperLanternGeometry } from './kit/lanterns';
import { createStoneBrazierGeometry, createFlameGeometry, createSpiritFlameMaterial } from './kit/braziers';
import { createBronzeBellGeometry } from './kit/props';
import { createSectArchitecture } from './SectArchitecture';
import { createStoneArchBridgesGroup } from './kit/bridges';
import { SPOTS, OBSTACLE_BOXES } from './layout';
import { heightAt, resolveMove } from './collision';
import type { DeviceProfile } from '../../lib/deviceProfile';
import { createTimeOfDayState } from './sky';

test('Step 9 Kit: Chamfered beveled geometry and vertex wear', () => {
  const geom = createBeveledBoxGeometry(2, 1, 1, 0.02);
  assert.ok(geom.getAttribute('position'), 'Must have position attribute');
  assert.ok(geom.getAttribute('normal'), 'Must have normal attribute');
  assert.ok(geom.getAttribute('uv'), 'Must have uv attribute');
  
  applyVertexWear(geom, 0.5, 0.08);
  const colorAttr = geom.getAttribute('color');
  assert.ok(colorAttr, 'Vertex wear must attach color attribute');
  assert.ok(colorAttr.count > 0, 'Color attribute must have vertices');
});

test('Step 9 Kit: Entasis column, dougong bracket clusters, and rafters', () => {
  const col = createEntasisColumnGeometry(5.6, 0.24, 0.21);
  assert.ok(col.getAttribute('position'));
  
  const bracket = createBracketClusterGeometry();
  assert.ok(bracket.getAttribute('position'));
  assert.ok(bracket.getAttribute('normal'));

  const rafter = createRafterGeometry(1.4, 0.08);
  assert.ok(rafter.getAttribute('position'));
});

test('Step 9 Kit: Hip-and-gable roof, ridge caps, and eave caps', () => {
  const roof = createHipAndGableRoofGeometry(14, 10, 2.5, 0.8, 0.35);
  assert.ok(roof.getAttribute('position'));
  assert.ok(roof.getAttribute('normal'));
  assert.ok(roof.getAttribute('uv'));

  const ridge = createRidgeCapGeometry(14, 0.25);
  assert.ok(ridge.getAttribute('position'));

  const eaveCap = createEaveCapGeometry(14, 0.08);
  assert.ok(eaveCap.getAttribute('position'));
});

test('Step 9 Kit: Canvas lattice window texture & framed wall geometry', () => {
  const latticeTex = getLatticeWindowTexture();
  assert.ok(latticeTex, 'Lattice texture must be created');
  assert.ok(latticeTex.repeat.x > 0);
  assert.ok(latticeTex.repeat.y > 0);

  const wall = createFramedWallGeometry(4.2, 3.5, 0.14);
  assert.ok(wall.frame.getAttribute('position'));
  assert.ok(wall.plaster.getAttribute('position'));
});

test('Step 9 Kit: 14-step grand stair geometry & carved posts', () => {
  const stair = createGrandStairGeometry(6.4, 14, 2.2, 0.34);
  assert.ok(stair.steps.getAttribute('position'));
  assert.ok(stair.ramp.getAttribute('position'));
  assert.ok(stair.balustrades.getAttribute('position'));

  const post = createCarvedPostGeometry(0.2, 0.95);
  assert.ok(post.getAttribute('position'));
});

test('Step 9 Kit: Lanterns and braziers with spirit flame shaders', () => {
  const stoneLantern = createStoneLanternGeometry();
  assert.ok(stoneLantern.stone.getAttribute('position'));
  assert.ok(stoneLantern.lightCore.getAttribute('position'));

  const paperLantern = createHangingPaperLanternGeometry(0.38, 0.58);
  assert.ok(paperLantern.paper.getAttribute('position'));
  assert.ok(paperLantern.timber.getAttribute('position'));

  const brazier = createStoneBrazierGeometry(0.55, 0.75);
  assert.ok(brazier.getAttribute('position'));

  const flameGeom = createFlameGeometry(0.35, 1.05);
  assert.ok(flameGeom.getAttribute('position'));

  const flameMatOrange = createSpiritFlameMaterial('orange');
  assert.ok(flameMatOrange.uniforms.uTime);
  assert.equal(flameMatOrange.transparent, true);

  const flameMatPurple = createSpiritFlameMaterial('purple');
  assert.ok(flameMatPurple.uniforms.uCoreColor);
});

test('Step 9 Kit: Props (bronze bell, stone arch bridges)', () => {
  const bell = createBronzeBellGeometry(0.65, 0.95);
  assert.ok(bell.getAttribute('position'));

  const mockDevice: DeviceProfile = {
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
  const assetStore = new AssetStore(mockDevice);
  const materials = new MaterialLibrary(assetStore);

  const bridges = createStoneArchBridgesGroup(materials);
  assert.ok(bridges.children.length > 0, 'Stone arch bridges must contain bridge meshes');
});

test('Step 9 Sect Architecture: creates full mountain sect composition and updates with time/sky', () => {
  const mockDevice: DeviceProfile = {
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
  const assetStore = new AssetStore(mockDevice);
  const materials = new MaterialLibrary(assetStore);

  const sect = createSectArchitecture(materials, false);
  assert.ok(sect.group, 'SectArchitecture group exists');
  assert.ok(sect.colliders.platforms.length >= 5, 'Must provide visual collision platforms');
  assert.ok(sect.colliders.cylinders.length >= 10, 'Must expose column obstacles');
  assert.ok(sect.colliders.boxes.length >= 4, 'Must expose box obstacles');

  // Verify dynamic lighting update does not throw
  const mockSkyState = createTimeOfDayState();
  mockSkyState.hour = 12;
  sect.update(0.016, mockSkyState);

  // Verify total triangles for SectArchitecture is within budget
  let totalTriangles = 0;
  sect.group.traverse((obj: THREE.Object3D) => {
    if ((obj as THREE.Mesh).isMesh && (obj as THREE.Mesh).geometry) {
      const geom = (obj as THREE.Mesh).geometry;
      if (geom.index) {
        totalTriangles += geom.index.count / 3;
      } else if (geom.attributes.position) {
        totalTriangles += geom.attributes.position.count / 3;
      }
    }
  });

  // Verify reasonable triangle budget
  assert.ok(totalTriangles > 5000, 'Sect architecture must have rich detail');
  assert.ok(totalTriangles < 180000, `Sect architecture triangle count within limits (${totalTriangles})`);

  sect.dispose();
});

test('Step 9 Layout & Collision: spots, platforms, and obstacle boxes sync', () => {
  assert.ok(SPOTS['hall-door'], 'SPOTS must include hall-door');
  assert.ok(SPOTS['gate'], 'SPOTS must include gate');
  assert.ok(SPOTS['breath-pool'], 'SPOTS must include breath-pool');
  assert.ok(SPOTS['pavilion'], 'SPOTS must include pavilion');
  assert.ok(SPOTS['bell'], 'SPOTS must include bell');

  // All spots must be walkable
  for (const [id, spot] of Object.entries(SPOTS)) {
    const y = heightAt(spot.position.x, spot.position.z);
    assert.ok(y !== null, `Spot ${id} must have walkable height`);
  }

  // Hall terrace and interior floor heights
  const terraceH = heightAt(7.5, -6.0);
  assert.ok(terraceH !== null && Math.abs(terraceH - 2.2) <= 0.05, `Terrace floor must be ~2.2m, got ${terraceH}`);

  const interiorH = heightAt(12.0, -6.0);
  assert.ok(interiorH !== null && Math.abs(interiorH - 2.45) <= 0.05, `Hall interior floor must be ~2.45m, got ${interiorH}`);

  // Wall collisions in OBSTACLE_BOXES
  const southWall = OBSTACLE_BOXES.find((b) => b.id === 'hall-wall-south');
  assert.ok(southWall, 'South wall obstacle box must exist');

  // Push out against south wall
  const moveRes = resolveMove({ x: 12.0, y: 2.45, z: 5.6 }, { x: 0, z: 0.3 }, 0.4);
  assert.ok(moveRes.z <= 5.4, 'Player must be stopped by south wall');
});
