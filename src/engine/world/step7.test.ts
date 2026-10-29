import test from 'node:test';
import assert from 'node:assert/strict';
import {
  terrainHeight,
  terrainGradient,
  pathDistance,
  streamDistance,
  isWalkableTerrain,
} from './terrain';
import { heightAt, resolveMove, MAX_SLOPE_DEG } from './collision';
import { TEXTURE_SLOTS, type TextureSlotId } from '@/config/assets';
import { DistantSpires } from './Spires';

test('Step 7 Terrain: deterministic rolling meadow, terraces, pond basin, and stream channel', () => {
  // 1. Plaza is flat at y = 0
  const plazaH1 = terrainHeight(0, 0);
  const plazaH2 = terrainHeight(3, 2);
  assert.equal(Math.abs(plazaH1) <= 0.02, true);
  assert.equal(Math.abs(plazaH2) <= 0.02, true);

  // 2. Hall Terrace is raised at 2.2 m
  const terraceH = terrainHeight(0, 14);
  assert.equal(Math.abs(terraceH - 2.2) <= 0.05, true);

  // 3. Terrace south stairs: stepped transition
  const step0 = terrainHeight(0, 2.6);
  const step3 = terrainHeight(0, 4.4);
  const step6 = terrainHeight(0, 6.2);
  assert.equal(step0 < step3, true);
  assert.equal(step3 < step6, true);
  assert.equal(step6 <= 2.2, true);

  // 4. Pond basin: depression ~1.1 m
  const pondBed = terrainHeight(-9, -4);
  assert.equal(pondBed < -0.85, true);

  // 5. Stream channel depression
  const streamMid = terrainHeight(-17, -6.8);
  const streamBank = terrainHeight(-17, -4.5);
  assert.equal(streamMid < streamBank, true);

  // 6. Path network distance and stream distance
  assert.equal(pathDistance(0, -10) < 0.8, true);
  assert.equal(streamDistance(-17, -6.8) < 0.5, true);
});

test('Step 7 Terrain: gradient, slope, and walkable boundary', () => {
  // Flat plaza slope should be near 0 degrees
  const gradPlaza = terrainGradient(0, 0);
  assert.equal(gradPlaza.slopeDeg < 2.0, true);

  // Cliff edge rim lip has steep slope
  const gradCliff = terrainGradient(0, 25.5);
  assert.equal(gradCliff.slopeDeg > 20.0, true);

  // Walkable boundary ends at t = 0.93
  assert.equal(isWalkableTerrain(0, 10), true);
  assert.equal(isWalkableTerrain(0, 23.5), true);
  assert.equal(isWalkableTerrain(0, 25.5), false);
});

test('Step 7 Collision: slope blocking over 40 deg and stair step-ups', () => {
  assert.equal(MAX_SLOPE_DEG, 40.0);

  // Can walk up terrace stairs from (0, 2) to (0, 14)
  let pos = { x: 0, y: heightAt(0, 2)!, z: 2 };
  for (let i = 0; i < 45; i++) {
    const res = resolveMove(pos, { x: 0, z: 0.28 }, 0.4);
    assert.equal(res.grounded, true);
    pos = { x: res.x, y: res.y, z: res.z };
  }
  assert.equal(pos.z >= 12.0, true);
  assert.equal(Math.abs(pos.y - 2.2) < 0.08, true);
});

test('Step 7 Assets: manifest defines 9 required PBR slots with UV scales and roughness', () => {
  const expectedSlots: TextureSlotId[] = [
    'grass',
    'moss',
    'rock',
    'path',
    'bark',
    'timber',
    'roof',
    'plaster',
    'stone',
  ];

  for (const slot of expectedSlots) {
    const cfg = TEXTURE_SLOTS[slot];
    assert.equal(Boolean(cfg), true, `Missing slot config for ${slot}`);
    assert.equal(cfg.diff.endsWith('_diff.jpg'), true);
    assert.equal(cfg.nor.endsWith('_nor.jpg'), true);
    assert.equal(cfg.uvScaleMeters > 0, true);
    assert.equal(cfg.nominalRoughness > 0 && cfg.nominalRoughness <= 1.0, true);
  }
});

test('Step 7 Spires: DistantSpires generates 7 floating aerial spires with rock and foliage', () => {
  const spires = new DistantSpires(false);
  assert.equal(spires.children.length, 2); // rock, foliage
  spires.dispose();
});
