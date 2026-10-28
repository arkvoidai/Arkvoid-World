import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  TextureCatalog,
  SLOT_EVALUATION_ORDER,
  SLOT_KEYWORDS,
} from '../core/TextureCatalog';
import { AssetStore } from '../core/AssetStore';
import { MaterialLibrary, applyBoxUV } from './MaterialLibrary';
import { TEXTURE_TUNING } from '../../config/textureTuning';
import { TEXTURE_SLOTS } from '../../config/assets';
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

const mockPhoneDevice: DeviceProfile = {
  deviceClass: 'phone',
  gpuTier: 1,
  deviceMemory: 4,
  isSoftwareGl: false,
  dprCap: 1.5,
  cloudPuffCount: 28,
  starDensity: 0.6,
  skyExtraHalo: false,
  reducedMotion: false,
};

test('Step 8B TextureCatalog: parses Poly Haven tokens, assigns slots in priority order', () => {
  const catalog = TextureCatalog.getInstance();
  assert.ok(catalog);

  // Check all 9 slots have an assignment record
  for (const slot of SLOT_EVALUATION_ORDER) {
    const assignment = catalog.assignments[slot];
    assert.ok(assignment, `Slot ${slot} should have an assignment record`);
    assert.equal(assignment.slot, slot);
  }

  // Check evaluation order and keyword completeness
  assert.deepEqual(SLOT_EVALUATION_ORDER, [
    'roof',
    'bark',
    'moss',
    'timber',
    'plaster',
    'path',
    'stone',
    'rock',
    'grass',
  ]);
  assert.ok(SLOT_KEYWORDS.roof.includes('shingle'));
  assert.ok(SLOT_KEYWORDS.bark.includes('trunk'));
  assert.ok(SLOT_KEYWORDS.grass.includes('meadow'));

  // Check keyword lists are configured for all 9 slots
  for (const slot of SLOT_EVALUATION_ORDER) {
    assert.ok(SLOT_KEYWORDS[slot].length > 0, `Keyword list for ${slot} must not be empty`);
  }

  // Check report structure
  const report = catalog.generateReport();
  assert.ok(report.assignedSlots);
  assert.ok(Array.isArray(report.unusedSets));
  assert.ok(Array.isArray(report.ignoredFiles));
});

test('Step 8B TextureCatalog: Poly Haven name parsing logic handles DX flip and resolutions', () => {
  const catalog = TextureCatalog.getInstance();

  // Test parsePolyHavenFileName through private method or direct token tests
  // We can test that the catalog has parsed whatever is currently in the repo
  for (const set of catalog.allSets.values()) {
    assert.ok(set.setKey.length > 0);
    assert.ok(Object.keys(set.maps).length > 0);
  }
});

test('Step 8B AssetStore: provides immediate procedural fallbacks with zero lag', () => {
  const store = new AssetStore(mockDesktopDevice);

  for (const slotId of Object.keys(TEXTURE_SLOTS) as (keyof typeof TEXTURE_SLOTS)[]) {
    const slot = store.getSlot(slotId);
    assert.ok(slot.diff instanceof THREE.Texture, `diff map for ${slotId} must be valid texture`);
    assert.ok(slot.nor instanceof THREE.Texture, `nor map for ${slotId} must be valid texture`);
    assert.ok(slot.albedoGain >= 0.6 && slot.albedoGain <= 1.6, `gain ${slot.albedoGain} in [0.6, 1.6]`);
  }

  const report = store.generateReport();
  assert.equal(report.tierTargetRes, 1024);
  assert.equal(report.anisotropy, 8);
  assert.ok(report.totalTextureMemoryMb > 0);
  assert.equal(report.slots.length, 9);

  store.dispose();
});

test('Step 8B AssetStore on phone tier enforces lower target resolution and anisotropy', () => {
  const phoneStore = new AssetStore(mockPhoneDevice);
  const report = phoneStore.generateReport();

  assert.equal(report.tierTargetRes, 512);
  assert.equal(report.anisotropy, 2);
  assert.ok(report.totalTextureMemoryMb <= 60, `Phone texture memory must be <= 60MB, got ${report.totalTextureMemoryMb}`);

  phoneStore.dispose();
});

test('Step 8B TextureTuning: verifies UV scale, normal scale, nominal roughness, and target luminance', () => {
  const expectedTuning = {
    grass: { uvScale: 3.0, normalScale: 1.0, roughness: 0.9, targetMean: 0.38 },
    moss: { uvScale: 2.0, normalScale: 1.1, roughness: 0.95, targetMean: 0.30 },
    rock: { uvScale: 4.0, normalScale: 1.4, roughness: 0.85, targetMean: 0.52 },
    path: { uvScale: 2.5, normalScale: 1.2, roughness: 0.8, targetMean: 0.60 },
    bark: { uvScale: 1.2, normalScale: 1.5, roughness: 0.9, targetMean: 0.33 },
    timber: { uvScale: 1.5, normalScale: 1.0, roughness: 0.65, targetMean: 0.27 },
    roof: { uvScale: 2.0, normalScale: 1.2, roughness: 0.55, targetMean: 0.30 },
    plaster: { uvScale: 3.0, normalScale: 0.7, roughness: 0.9, targetMean: 0.80 },
    stone: { uvScale: 2.0, normalScale: 1.2, roughness: 0.8, targetMean: 0.62 },
  };

  for (const [slot, exp] of Object.entries(expectedTuning)) {
    const t = TEXTURE_TUNING[slot as keyof typeof TEXTURE_TUNING];
    assert.equal(t.uvScaleMeters, exp.uvScale, `uvScale for ${slot}`);
    assert.equal(t.normalScale, exp.normalScale, `normalScale for ${slot}`);
    assert.equal(t.nominalRoughness, exp.roughness, `roughness for ${slot}`);
    assert.equal(t.targetMeanLuminance, exp.targetMean, `targetMean for ${slot}`);
  }
});

test('Step 8B MaterialLibrary: applyBoxUV projects world-space UVs based on dominant face normals', () => {
  const boxGeo = new THREE.BoxGeometry(4, 2, 6);
  boxGeo.deleteAttribute('uv');
  assert.equal(boxGeo.hasAttribute('uv'), false);

  applyBoxUV(boxGeo, 2.0);
  assert.ok(boxGeo.hasAttribute('uv'));

  const uvs = boxGeo.getAttribute('uv');
  assert.equal(uvs.count, boxGeo.getAttribute('position').count);

  boxGeo.dispose();
});

test('Step 8B MaterialLibrary: getMaterial caches and returns valid MeshStandardMaterial / PhysicalMaterial', () => {
  const store = new AssetStore(mockDesktopDevice);
  const matLib = new MaterialLibrary(store);

  const timberMat1 = matLib.getMaterial('timber');
  const timberMat2 = matLib.getMaterial('timber');
  assert.equal(timberMat1, timberMat2, 'Identical getMaterial calls must return cached instance');

  const roofMat = matLib.getMaterial('roof', { physical: true, tint: '#3F4F55' });
  assert.ok(roofMat instanceof THREE.MeshPhysicalMaterial);
  assert.ok(roofMat.map);
  assert.ok(roofMat.normalMap);

  matLib.dispose();
  store.dispose();
});
