import { heightAt, resolveMove } from '../src/engine/world/collision';
import {
  areaAt,
  BRIDGES,
  SPOTS,
  SPAWN,
} from '../src/engine/world/layout';
import {
  terrainHeight,
} from '../src/engine/world/terrain';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

function runChecks(): void {
  // 1. Verify bridge slope limits (< 17 deg)
  for (const bridge of BRIDGES) {
    assert(
      bridge.maxSlopeDeg <= 17.0,
      `${bridge.id} max slope ${bridge.maxSlopeDeg.toFixed(2)} deg exceeds 17 deg`,
    );
  }

  // 2. Rolling Meadow hills check:
  const h1 = terrainHeight(16, 8);
  const h2 = terrainHeight(-16, 8);
  const h3 = terrainHeight(0, -14);
  assert(!isNaN(h1) && !isNaN(h2) && !isNaN(h3), 'Meadow heights must be valid numbers');

  // 3. WALK: Spawn to the Hall Stair
  // Spawn is at (0, 0, 14); walk north towards plaza center (0, 0, 0) and then towards grand stair foot at (2.0, 0, -6.0)
  let pos = { x: SPAWN.position.x, y: heightAt(SPAWN.position.x, SPAWN.position.z)!, z: SPAWN.position.z };
  assert(pos.y !== null, 'Spawn point must be on walkable ground');

  // Walk north from z = 14 to z = -6
  for (let i = 0; i < 70; i++) {
    const res = resolveMove(pos, { x: 0, z: -0.30 }, 0.4);
    assert(res.grounded, `Lost ground walking from spawn to courtyard at step ${i}`);
    pos = { x: res.x, y: res.y, z: res.z };
  }
  assert(pos.z <= -5.5, `Expected player at z <= -5.5, got z=${pos.z.toFixed(2)}`);

  // Walk east towards the foot of the grand stone stair at x ≈ 2.08
  for (let i = 0; i < 15; i++) {
    const res = resolveMove(pos, { x: 0.20, z: 0 }, 0.4);
    assert(res.grounded, `Lost ground approaching stair foot at step ${i}`);
    pos = { x: res.x, y: res.y, z: res.z };
  }
  assert(pos.x >= 2.0, `Expected player near stair foot at x >= 2.0, got x=${pos.x.toFixed(2)}`);

  // 4. WALK: Up the Grand Stone Stair (14 steps rising 2.2 m to the terrace)
  // Foot of stair is at x = 2.08; terrace starts at x = 6.84.
  // Each step rises ~0.157 m (well within 0.4 m MAX_STEP_UP)
  while (pos.x < 7.2) {
    const res = resolveMove(pos, { x: 0.20, z: 0 }, 0.4);
    assert(res.grounded, `Lost ground climbing grand stair at x=${pos.x.toFixed(2)}`);
    pos = { x: res.x, y: res.y, z: res.z };
  }
  assert(
    pos.x >= 6.84 && pos.x <= 8.5 && Math.abs(pos.y - 2.2) <= 0.05,
    `Expected player on Hall Terrace at y ≈ 2.2 m, got x=${pos.x.toFixed(2)}, y=${pos.y.toFixed(3)}`,
  );

  // 5. WALK: Into the Hall Through the Door
  // Walk east (+X) from terrace (x ≈ 7.2, y = 2.2, z = -6.0) through the door gap (z in [-8.5, -3.5]) into hall interior (y = 2.45 m)
  while (pos.x < 12.0) {
    const res = resolveMove(pos, { x: 0.20, z: 0 }, 0.4);
    assert(res.grounded, `Lost ground entering hall interior at x=${pos.x.toFixed(2)}`);
    pos = { x: res.x, y: res.y, z: res.z };
  }
  assert(
    pos.x >= 12.0 && Math.abs(pos.y - 2.45) <= 0.05,
    `Expected player inside Main Hall at y ≈ 2.45 m, got x=${pos.x.toFixed(2)}, y=${pos.y.toFixed(3)}`,
  );

  // 6. WALK: Against a Wall (verify push-out and smooth sliding)
  // Walk from inside hall towards the south wall at z = 6.0 (obstacle box minZ = 5.75)
  pos = { x: 12.0, y: 2.45, z: 2.0 };
  let hitWall = false;
  for (let i = 0; i < 25; i++) {
    const res = resolveMove(pos, { x: 0, z: 0.25 }, 0.4);
    if (res.hitObstacle) hitWall = true;
    // South wall minZ is 5.75, player radius 0.4 -> player z must stay <= 5.75 - 0.4 + 0.01 = 5.36
    assert(res.z <= 5.4, `Player penetrated south wall: z=${res.z.toFixed(3)}`);
    pos = { x: res.x, y: res.y, z: res.z };
  }
  assert(hitWall, 'Expected collision against the Main Hall south wall');

  // 7. WALK: Around the Spirit Pond
  // Walk from courtyard towards and around the pond ring wall at (-9, 0, -4)
  pos = { x: -3.0, y: heightAt(-3.0, -4.0)!, z: -4.0 };
  let pondSteps = 0;
  // Walk north around the pond perimeter
  for (let i = 0; i < 40; i++) {
    const angle = (i / 40) * Math.PI * 2;
    const targetX = -9.0 + Math.cos(angle) * 5.2;
    const targetZ = -4.0 + Math.sin(angle) * 5.2;
    const dx = targetX - pos.x;
    const dz = targetZ - pos.z;
    const dist = Math.hypot(dx, dz);
    const stepSize = Math.min(0.35, dist);
    const res = resolveMove(pos, { x: (dx / dist) * stepSize, z: (dz / dist) * stepSize }, 0.4);
    assert(res.grounded, `Lost ground circling pond at step ${i}`);
    pos = { x: res.x, y: res.y, z: res.z };
    pondSteps++;
  }
  assert(pondSteps === 40, 'Successfully walked around spirit pond');

  // 8. WALK: Across the Bridge to Island B
  const bridgeAB = BRIDGES[0]!;
  const startAB = bridgeAB.points[0]!;
  pos = {
    x: startAB.x - bridgeAB.dirX * 0.8,
    y: heightAt(startAB.x - bridgeAB.dirX * 0.8, startAB.z - bridgeAB.dirZ * 0.8)!,
    z: startAB.z - bridgeAB.dirZ * 0.8,
  };
  const stepCountAB = 80;
  const stepDistAB = (bridgeAB.totalLengthXZ + 2.5) / stepCountAB;
  for (let i = 0; i < stepCountAB; i++) {
    const res = resolveMove(
      pos,
      {
        x: bridgeAB.dirX * stepDistAB,
        z: bridgeAB.dirZ * stepDistAB,
      },
      0.4,
    );
    assert(res.grounded, `Lost ground on Bridge A->B at step ${i}`);
    pos = { x: res.x, y: res.y, z: res.z };
  }
  assert(
    areaAt(pos.x, pos.z) === 'still-garden',
    `Expected player to arrive at 'still-garden', got ${areaAt(pos.x, pos.z)}`,
  );

  // 9. WALK: Off an edge (cliff edge clamp) — must stay on walkable ground and slide
  pos = { x: 0, y: heightAt(0, 20)!, z: 20 };
  let clamped = false;
  for (let i = 0; i < 30; i++) {
    const res = resolveMove(pos, { x: 0.2, z: 0.35 }, 0.4);
    if (res.clampedEdge) clamped = true;
    assert(
      heightAt(res.x, res.z) !== null,
      `Player fell off island edge at (${res.x.toFixed(2)}, ${res.z.toFixed(2)})`,
    );
    pos = { x: res.x, y: res.y, z: res.z };
  }
  assert(clamped, 'Expected edge clamping when walking off Island A rim');

  // 10. Verify all named spots are inside walkable bounds
  for (const spot of Object.values(SPOTS)) {
    const h = heightAt(spot.position.x, spot.position.z);
    assert(
      h !== null,
      `Spot '${spot.id}' at (${spot.position.x}, ${spot.position.z}) is not on walkable ground`,
    );
  }

  console.log('PASS');
}

runChecks();
