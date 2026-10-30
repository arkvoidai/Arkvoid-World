import test from 'node:test';
import assert from 'node:assert/strict';

import {
  OriginOffset,
  cellKey128,
  distance,
  isWorldPositionWithinDatabaseBounds,
  setOriginOffset,
  toLocal,
  toWorld,
} from './atlas/Coordinates.js';
import {
  BUILT_AREAS,
  BUILT_REGIONS,
  DATABASE_AREA_SEED,
  DATABASE_REGION_SEED,
  PLANNED_REGIONS,
  WORLD_ATLAS,
  areaAtAtlas,
  validateAtlas,
} from './atlas/Atlas.js';
import { DiscoveryTracker } from './atlas/DiscoveryTracker.js';
import {
  TRAVEL_EDGES,
  builtGraphIsConnected,
  builtWalkGraphIsConnected,
  shortestWalk,
  walkTime,
} from './atlas/TravelGraph.js';
import {
  CELL_SIZE,
  cellBounds,
  cellKey,
  cellKeyId,
  parseCellKeyId,
  ringForDistance,
  shouldUnloadCell,
} from './streaming/Cells.js';
import { rebaseOrigin, resetOrigin } from './streaming/Origin.js';
import { ResourceBudget } from './streaming/Budget.js';
import { UploadQueue } from './streaming/UploadQueue.js';
import { GenerationPool } from './streaming/WorkerPool.js';
import { sampleVeiledPeaksHeight } from './terrain/MountainHeight.js';
import { atmosphereSigma, mixAerialPerspective, sampleAtmosphere } from './sky/AtmosphereModel.js';
import { weatherFor, weatherVisibilityMeters } from './sky/Weather.js';
import {
  buildRiverRibbon,
  riverWidth,
  shallowWaterSpeedMultiplier,
  waterDepthWalkable,
} from './water/Rivers.js';
import {
  riverWetness,
  waterfallLod,
  waterAbsorptionColor,
} from './water/WaterSurfaceModel.js';
import { areaAt, SPOTS } from './layout.js';

test('Atlas world/local coordinate round trips preserve millimetre precision at large distances', () => {
  resetOrigin();
  const probes = [
    { x: 0, y: 0, z: 0 },
    { x: 5000, y: 220, z: -5000 },
    { x: 25000, y: 900, z: -25000 },
    { x: 60000, y: 9000, z: -60000 },
  ];
  for (const point of probes) {
    const roundTrip = toWorld(toLocal(point));
    assert.ok(distance(point, roundTrip) <= 0.001);
  }
  setOriginOffset({ x: 12800, y: 512, z: -25600 });
  const point = { x: 60000, y: 8200, z: -59000 };
  assert.ok(distance(point, toWorld(toLocal(point))) <= 0.001);
  resetOrigin();
});

test('World coordinates use the 128 metre signed cell key convention', () => {
  assert.equal(CELL_SIZE, 128);
  assert.deepEqual(cellKey(0, 0), { level: 0, ix: 0, iz: 0 });
  assert.deepEqual(cellKey(-1, -129), { level: 0, ix: -1, iz: -2 });
  assert.equal(cellKey128(60000, -60000), '468:-469');
  const key = cellKey(-60000, 60000);
  assert.equal(cellKeyId(key), '0:-469:468');
  assert.deepEqual(parseCellKeyId(cellKeyId(key)), key);
  assert.equal(parseCellKeyId('3:1:1'), null);
  assert.equal(cellBounds({ level: 2, ix: 1, iz: -1 }).minX, 2048);
});

test('World position validation matches the SQL save_position bounds', () => {
  assert.equal(isWorldPositionWithinDatabaseBounds({ x: 60000, y: 9000, z: -60000 }), true);
  assert.equal(isWorldPositionWithinDatabaseBounds({ x: 60000.01, y: 0, z: 0 }), false);
  assert.equal(isWorldPositionWithinDatabaseBounds({ x: 0, y: -4000.01, z: 0 }), false);
  assert.equal(isWorldPositionWithinDatabaseBounds({ x: 0, y: 9000.01, z: 0 }), false);
  assert.equal(isWorldPositionWithinDatabaseBounds({ x: Infinity, y: 0, z: 0 }), false);
});

test('Atlas data has unique IDs, contained area spawns, and non-overlapping region envelopes', () => {
  assert.deepEqual(validateAtlas(), []);
  assert.equal(new Set(WORLD_ATLAS.map((region) => region.id)).size, WORLD_ATLAS.length);
  const allAreas = WORLD_ATLAS.flatMap((region) => region.areas);
  assert.equal(new Set(allAreas.map((area) => area.id)).size, allAreas.length);
  for (const region of WORLD_ATLAS) {
    for (const area of region.areas) {
      assert.equal(area.regionId, region.id);
    }
  }
});

test('Planned regions never appear in database seeds or built area lookup', () => {
  assert.equal(BUILT_REGIONS.length, 1);
  assert.deepEqual(DATABASE_REGION_SEED.map((region) => region.id), ['home-reach']);
  assert.ok(PLANNED_REGIONS.length >= 5);
  assert.equal(DATABASE_AREA_SEED.some((area) => area.id === 'veiled-peaks'), false);
  assert.equal(DATABASE_AREA_SEED.some((area) => area.id === 'capital-valley'), false);
  assert.equal(areaAtAtlas(2400, 100, -3600), null);
});

test('Atlas preserves areaAt for every existing authored Home Reach spot', () => {
  const expected = new Map([
    ['dawn-terrace', 'dawn-terrace'],
    ['still-garden', 'still-garden'],
    ['falls-of-light', 'falls-of-light'],
  ]);
  for (const spot of Object.values(SPOTS)) {
    assert.equal(areaAt(spot.position.x, spot.position.z), expected.get(spot.areaId), spot.id);
    assert.equal(
      areaAtAtlas(spot.position.x, spot.position.y, spot.position.z)?.id,
      spot.areaId,
      'Atlas lookup must preserve spot ' + spot.id,
    );
  }
  assert.equal(areaAtAtlas(-10, 12, -120)?.id, 'sanctuary');
  assert.equal(areaAtAtlas(0, 500, 0), null);
});

test('Built travel graph connects the three walkable areas and Sanctuary via skyway', () => {
  assert.equal(builtWalkGraphIsConnected(['dawn-terrace', 'still-garden', 'falls-of-light']), true);
  assert.equal(builtGraphIsConnected(['dawn-terrace', 'still-garden', 'falls-of-light', 'sanctuary']), true);
  const walkingEdges = TRAVEL_EDGES.filter((edge) =>
    edge.status === 'built' && ['bridge', 'stair', 'path'].includes(edge.type),
  );
  assert.ok(walkingEdges.length >= 2);
  for (const edge of walkingEdges) assert.ok(walkTime(edge) <= 4);
  assert.ok(shortestWalk('dawn-terrace', 'falls-of-light')!.minutes <= 4);
  assert.equal(shortestWalk('dawn-terrace', 'deep-sanctuary'), null);
});

test('Discovery tracker fires once after three continuous seconds inside an area', () => {
  const tracker = new DiscoveryTracker(3);
  for (let i = 0; i < 11; i++) assert.equal(tracker.update(0.25, 'dawn-terrace'), null);
  assert.equal(tracker.update(0.25, 'dawn-terrace'), 'dawn-terrace');
  assert.equal(tracker.update(0.25, 'dawn-terrace'), null);
  assert.equal(tracker.update(0.25, null), null);
  const seeded = new DiscoveryTracker(3, ['still-garden'], false);
  assert.equal(seeded.update(1, 'still-garden'), null);
  seeded.markReady();
  assert.equal(seeded.update(3, 'still-garden'), null);
  assert.equal(seeded.hasDiscovered('still-garden'), true);
});

test('Streaming rings scale with quality and unload only outside hysteresis', () => {
  assert.equal(ringForDistance(100), 0);
  assert.equal(ringForDistance(400), 1);
  assert.equal(ringForDistance(1000), 2);
  assert.equal(ringForDistance(5000), 3);
  assert.equal(ringForDistance(10000), 4);
  assert.equal(shouldUnloadCell(192, 0), false);
  assert.equal(shouldUnloadCell(200, 0), false);
  assert.equal(shouldUnloadCell(512 * 1.14, 1), false);
  assert.equal(shouldUnloadCell(512 * 1.16, 1), true);
});

test('Floating origin rebase is snapped and camera-relative positions do not jump', () => {
  resetOrigin();
  const probe = { x: 1250, y: 4, z: -960 };
  const camera = { x: 512, y: 0, z: -256 };
  const beforeProbe = toLocal(probe);
  const beforeCamera = toLocal(camera);
  const beforeRelative = {
    x: beforeProbe.x - beforeCamera.x,
    y: beforeProbe.y - beforeCamera.y,
    z: beforeProbe.z - beforeCamera.z,
  };
  const result = rebaseOrigin(camera);
  assert.equal(result.changed, true);
  assert.equal(OriginOffset.x, 512);
  const afterProbe = toLocal(probe);
  const afterCamera = toLocal(camera);
  assert.ok(Math.abs(afterProbe.x - afterCamera.x - beforeRelative.x) < 0.001);
  assert.ok(Math.abs(afterProbe.y - afterCamera.y - beforeRelative.y) < 0.001);
  assert.ok(Math.abs(afterProbe.z - afterCamera.z - beforeRelative.z) < 0.001);
  resetOrigin();
});

test('Resource budget evicts least-recently-used distant resources but never R0', () => {
  let disposed = 0;
  const budget = new ResourceBudget(100);
  budget.register({ id: 'player', layer: 'collision', bytes: 70, ring: 0, lastUsedFrame: 99, dispose: () => disposed++ });
  budget.register({ id: 'far-old', layer: 'terrain', bytes: 40, ring: 3, lastUsedFrame: 1, dispose: () => disposed++ });
  budget.register({ id: 'mid-new', layer: 'trees', bytes: 30, ring: 2, lastUsedFrame: 90, dispose: () => disposed++ });
  const evicted = budget.enforceBudget();
  assert.deepEqual(evicted, ['far-old']);
  assert.equal(budget.usedBytes, 100);
  assert.equal(budget.resourceCount, 2);
  assert.equal(disposed, 1);
  budget.dispose();
  assert.equal(budget.usedBytes, 0);
  assert.equal(disposed, 3);
});

test('Upload queue respects its cooperative frame budget and cancellation', () => {
  const queue = new UploadQueue();
  let time = 0;
  let ran = 0;
  for (let i = 0; i < 5; i++) queue.enqueue({ id: String(i), run: () => { time += 1; ran++; } });
  const count = queue.process(3, () => time);
  assert.equal(count, 3);
  assert.equal(ran, 3);
  assert.equal(time, 3);
  assert.equal(queue.pending, 2);
  assert.equal(queue.cancel('3'), true);
  queue.process(3, () => time);
  assert.equal(ran, 4);
});

test('Generation fallback runs registered jobs and cancellation invalidates queued cell work', async () => {
  const pool = new GenerationPool();
  pool.register('TERRAIN_TILE', (message) => Number(message.payload) * 2);
  const first = pool.submit('TERRAIN_TILE', { level: 0, ix: 0, iz: 0 }, 21, 10);
  assert.equal(pool.pending, 1);
  pool.processFallback();
  assert.equal((await first).payload, 42);

  const cancelled = pool.submit('TERRAIN_TILE', { level: 0, ix: 1, iz: 1 }, 7);
  pool.cancelCell({ level: 0, ix: 1, iz: 1 });
  await assert.rejects(cancelled, /cancelled/);
  pool.dispose();
});

test('Veiled Peaks height sampling is deterministic and stays within its declared elevation', () => {
  const a = sampleVeiledPeaksHeight(7000, -3000);
  const b = sampleVeiledPeaksHeight(7000, -3000);
  assert.equal(a, b);
  assert.ok(a >= 20 && a <= 3400);
  assert.ok(sampleVeiledPeaksHeight(5000, -4200) >= 20);
});

test('Weather is deterministic, boundary-continuous and preserves a 150 metre visibility floor', () => {
  const climate = { temperature: 0.2, moisture: 0.8, snowAllowed: true };
  const first = weatherFor('veiled-peaks', 12, 2.99, climate);
  const second = weatherFor('veiled-peaks', 12, 2.99, climate);
  assert.deepEqual(first, second);
  const beforeBoundary = weatherFor('capital-valley', 5, 2.99, { temperature: 0.6, moisture: 0.8 });
  const afterBoundary = weatherFor('capital-valley', 5, 3.01, { temperature: 0.6, moisture: 0.8 });
  assert.ok(Math.abs(beforeBoundary.coverage - afterBoundary.coverage) < 0.05);
  assert.equal(weatherVisibilityMeters(1000, 2), 500);
  assert.equal(weatherVisibilityMeters(100, 3), 150);
});

test('Atmosphere reference model has bounded monotonic transmittance and mixes to the sky', () => {
  assert.equal(sampleAtmosphere(0, 0).transmittance, 1);
  const near = sampleAtmosphere(1000, 300, 2);
  const far = sampleAtmosphere(10000, 300, 2);
  assert.ok(far.transmittance < near.transmittance);
  assert.ok(near.transmittance >= 0 && near.transmittance <= 1);
  assert.ok(atmosphereSigma(9000) < atmosphereSigma(-1000));
  const mixed = mixAerialPerspective([1, 0, 0], [0, 0, 1], { transmittance: 0, inscatter: 1, sigma: 0 });
  assert.deepEqual(mixed, [0, 0, 1]);
});

test('River ribbon data is finite, bounded and provides flow/depth attributes', () => {
  const points = [
    { x: 0, y: 1, z: 0, accumulation: 100, slope: 0.1 },
    { x: 30, y: 0.5, z: 40, accumulation: 900, slope: 0.2 },
    { x: 70, y: 0, z: 90, accumulation: 5000, slope: 0.3 },
  ];
  const ribbon = buildRiverRibbon(points, 32);
  assert.equal(ribbon.positions.length, 33 * 2 * 3);
  assert.equal(ribbon.indices.length, 32 * 6);
  assert.equal(ribbon.flow.length, 33 * 2 * 2);
  assert.ok(Array.from(ribbon.positions).every(Number.isFinite));
  assert.ok(Array.from(ribbon.depth).every((depth) => depth >= 0.3 && depth <= 3));
  assert.ok(riverWidth(100000) <= 40);
});

test('Water depth, absorption, wetness and waterfall LOD rules are bounded', () => {
  assert.equal(waterDepthWalkable(0.4), true);
  assert.equal(waterDepthWalkable(0.401), false);
  assert.equal(shallowWaterSpeedMultiplier(0.2), 0.85);
  assert.equal(shallowWaterSpeedMultiplier(0.5), 1);
  const shallow = waterAbsorptionColor(0.1);
  const deep = waterAbsorptionColor(8);
  assert.ok(deep.g < shallow.g);
  assert.ok(riverWetness(0.5) > riverWetness(5));
  assert.equal(waterfallLod(80), 'near');
  assert.equal(waterfallLod(500), 'mid');
  assert.equal(waterfallLod(2000), 'far');
});
