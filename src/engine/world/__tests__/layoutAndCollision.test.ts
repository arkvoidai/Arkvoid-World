import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { heightAt, MAX_STEP_UP, resolveMove } from '@/engine/world/collision';
import {
  areaAt,
  BRIDGES,
  ISLANDS,
  islandRadiusAtAngle,
  SPAWN,
  SPOTS,
  WORLD,
} from '@/engine/world/layout';

describe('World Layout & Analytic Collision', () => {
  it('defines deterministic islands A, B, C, and unreachable Sanctuary S', () => {
    assert.equal(WORLD.islands.A.id, 'dawn-terrace');
    assert.equal(WORLD.islands.A.radius, 26);
    assert.equal(WORLD.islands.B.id, 'still-garden');
    assert.equal(WORLD.islands.B.radius, 21);
    assert.equal(WORLD.islands.C.id, 'falls-of-light');
    assert.equal(WORLD.islands.C.radius, 18);
    assert.equal(WORLD.islands.S.id, 'sanctuary');
    assert.equal(WORLD.islands.S.reachable, false);

    // Superelliptic radial offset stays within ±0.8 m
    for (let i = 0; i < 64; i++) {
      const theta = (i / 64) * Math.PI * 2;
      const rA = islandRadiusAtAngle('A', 26, theta);
      assert.ok(rA >= 25.2 && rA <= 26.8);
    }
  });

  it('keeps walking slope on both arched stone bridges strictly below 17 degrees', () => {
    for (const bridge of BRIDGES) {
      assert.equal(bridge.width, 3.2);
      assert.equal(bridge.walkableHalfWidth, 1.5);
      assert.ok(
        bridge.maxSlopeDeg < 17,
        `Bridge ${bridge.id} max slope ${bridge.maxSlopeDeg} must be < 17 deg`,
      );
    }
  });

  it('maps coordinates to the right named area via areaAt(x, z)', () => {
    assert.equal(areaAt(0, 0), 'dawn-terrace');
    assert.equal(areaAt(SPAWN.position.x, SPAWN.position.z), 'dawn-terrace');
    assert.equal(areaAt(60, -8), 'still-garden');
    assert.equal(areaAt(38, -52), 'falls-of-light');
    // Unreachable Sanctuary S returns null
    assert.equal(areaAt(-10, -120), null);
    assert.equal(areaAt(500, 500), null);
  });

  it('places all named spots on walkable ground', () => {
    for (const spot of Object.values(SPOTS)) {
      const h = heightAt(spot.position.x, spot.position.z);
      assert.notEqual(h, null, `Spot ${spot.id} should be walkable`);
    }
    // Sanctuary is not walkable
    assert.equal(heightAt(ISLANDS.S.center.x, ISLANDS.S.center.z), null);
  });

  it('steps up onto the Pavilion platform (0.35 m <= 0.4 m) and blocks higher jumps', () => {
    let pos = { x: 0.5, y: heightAt(0.5, -7.5)!, z: -7.5 };
    for (let i = 0; i < 15; i++) {
      const res = resolveMove(pos, { x: -0.25, z: 0 }, 0.4);
      pos = { x: res.x, y: res.y, z: res.z };
    }
    assert.ok(pos.x < -1.0);
    assert.ok(Math.abs(pos.y - 0.35) < 1e-3);
    assert.ok(0.35 <= MAX_STEP_UP);
  });

  it('pushes out of obstacle cylinders and clamps/slides along island edges', () => {
    // Breath pool rim at (-9, 0, -4) has radius ~2.68 m
    let pos = { x: -5.2, y: heightAt(-5.2, -4)!, z: -4 };
    let hitPool = false;
    for (let i = 0; i < 20; i++) {
      const res = resolveMove(pos, { x: -0.25, z: 0 }, 0.4);
      if (res.hitObstacle) hitPool = true;
      pos = { x: res.x, y: res.y, z: res.z };
    }
    assert.ok(hitPool, 'Should collide with breath pool rim');
    const distToPool = Math.hypot(pos.x - -9, pos.z - -4);
    assert.ok(distToPool >= 2.68 + 0.4 - 1e-2);
  });
});
