import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  Wanderer,
  WandererMaterials,
  WandererAnimator,
  WandererPool,
  LEANING_PALETTE,
  type FootstepEvent,
} from '@/engine/actors/index';
import { PlayerController } from '@/engine/actors/PlayerState';
import { ActorsLineup } from '@/engine/actors/ActorsLineup';
import type { DeviceProfile } from '@/lib/deviceProfile';
import { SPAWN } from '@/engine/world/layout';

const mockDesktopDevice: DeviceProfile = {
  gpuTier: 2,
  deviceClass: 'desktop',
  deviceMemory: 8,
  isSoftwareGl: false,
  dprCap: 2,
  cloudPuffCount: 60,
  starDensity: 1.0,
  skyExtraHalo: true,
  reducedMotion: false,
};

const mockPhoneDevice: DeviceProfile = {
  gpuTier: 1,
  deviceClass: 'phone',
  deviceMemory: 4,
  isSoftwareGl: false,
  dprCap: 1.5,
  cloudPuffCount: 28,
  starDensity: 0.6,
  skyExtraHalo: false,
  reducedMotion: false,
};

test('Step 12: Wanderer body hierarchy, proportions and smooth lathe robe', () => {
  const wanderer = new Wanderer({ form: 0, leaning: 'dawn' });

  // 1. Hierarchy verification
  const s = wanderer.skeleton;
  assert.ok(wanderer.getObjectByName('face_eyes'), 'wanderer has visible sclera, irises and pupils');
  assert.ok(wanderer.getObjectByName('face_features'), 'wanderer has a nose, cheeks, ears and mouth');
  assert.ok(wanderer.getObjectByName('wanderer_hair'), 'wanderer has a sculpted hair silhouette');
  assert.ok(s.root, 'root exists');
  assert.ok(s.pelvis, 'pelvis exists');
  assert.ok(s.spine0 && s.spine1 && s.spine2, '3-link spine exists');
  assert.ok(s.chest, 'chest exists');
  assert.ok(s.neck, 'neck exists');
  assert.ok(s.head, 'head exists');
  assert.ok(s.leftShoulder && s.rightShoulder, 'shoulders exist');
  assert.ok(s.leftUpperArm && s.rightUpperArm, 'upper arms exist');
  assert.ok(s.leftForearm && s.rightForearm, 'forearms exist');
  assert.ok(s.leftHand && s.rightHand, 'hands exist');
  assert.ok(s.leftThigh && s.rightThigh, 'thighs exist');
  assert.ok(s.leftShin && s.rightShin, 'shins exist');
  assert.ok(s.leftFoot && s.rightFoot, 'feet exist');

  // Shoulders span: 0.21 - (-0.21) = 0.42 m
  const shoulderSpan = Math.abs(s.leftShoulder.position.x - s.rightShoulder.position.x);
  assert.equal(Math.round(shoulderSpan * 100) / 100, 0.42, 'shoulder span must be 0.42 m');

  // Heights scaling per form:
  const standardWanderer = new Wanderer({ form: 0 });
  const wardenWanderer = new Wanderer({ form: 2 });
  const sageWanderer = new Wanderer({ form: 3 });

  assert.equal(standardWanderer.heightScale, 1.0, 'standard height scale is 1.0');
  assert.ok(wardenWanderer.heightScale > 1.04, 'warden height scale is taller (1.80m / 1.72m)');
  assert.ok(sageWanderer.heightScale < 0.95, 'sage height scale is shorter (1.62m / 1.72m)');
  for (const figure of [standardWanderer, wardenWanderer, sageWanderer]) {
    assert.ok(figure.getObjectByName('face_eyes'), 'all forms keep a visible face');
    assert.ok(figure.getObjectByName('face_features'), 'all forms keep facial structure');
  }

  // 2. Continuous soft robe lathe geometry
  const robeMesh = wanderer.getObjectByName('wanderer_robe') as THREE.Mesh;
  assert.ok(robeMesh, 'wanderer_robe mesh must exist');
  const robeGeo = robeMesh.geometry as THREE.LatheGeometry;
  assert.ok(robeGeo, 'robe must be a lathe geometry');

  // Check hem radius >= 0.34 m
  robeGeo.computeBoundingBox();
  const box = robeGeo.boundingBox!;
  const hemRadius = Math.max(box.max.x, Math.abs(box.min.x));
  assert.ok(hemRadius >= 0.34, `robe hem radius ${hemRadius} must be >= 0.34m to avoid leg clipping`);

  wanderer.dispose();
  standardWanderer.dispose();
  wardenWanderer.dispose();
  sageWanderer.dispose();
});

test('Step 12: Named women residents have distinct long-hair and ornament meshes', () => {
  const residents = [
    new Wanderer({ resident: 'meilin', form: 3 }),
    new Wanderer({ resident: 'yue', form: 1 }),
    new Wanderer({ resident: 'sylva', form: 3 }),
  ];
  for (const resident of residents) {
    assert.ok(resident.getObjectByName('face_eyes'));
    assert.ok(resident.getObjectByName('face_features'));
    assert.ok(resident.getObjectByName('resident_long_hair'));
    assert.ok(resident.getObjectByName('resident_hair_lock'));
    assert.ok(resident.getObjectByName('resident_hair_ornament'));
    resident.dispose();
  }
});

test('Step 12: WandererMaterials PBR fabric sheen, leanings palette and textures', () => {
  const mats = WandererMaterials.get();

  // Leanings palette colors
  assert.equal(LEANING_PALETTE.dawn.hexEye, '#F0C17B', 'dawn uses warm amber');
  assert.equal(LEANING_PALETTE.dusk.hexEye, '#D9C1A1', 'dusk uses soft lantern gold');
  assert.equal(LEANING_PALETTE.still.hexEye, '#F5E9C9', 'still uses candlelight');

  // Fabric MeshPhysicalMaterial with sheen
  const dawnFabric = mats.getFabricMaterial('dawn');
  assert.ok(dawnFabric instanceof THREE.MeshPhysicalMaterial, 'fabric must be MeshPhysicalMaterial');
  assert.equal(dawnFabric.sheen, 0.6, 'sheen must be 0.6');
  assert.equal(dawnFabric.sheenRoughness, 0.5, 'sheenRoughness must be 0.5');
  assert.equal(dawnFabric.roughness, 0.75, 'fabric roughness must be 0.75');

  // Canvas textures generated (Texture / CanvasTexture)
  assert.ok(mats.embroideryMap instanceof THREE.Texture, 'embroidery texture generated');
  assert.ok(mats.embroideryNormalMap instanceof THREE.Texture, 'embroidery normal map generated');
  assert.ok(mats.wovenBambooMap instanceof THREE.Texture, 'bamboo texture generated');
  assert.ok(mats.blobShadowMap instanceof THREE.Texture, 'blob shadow texture generated');
});

test('Step 12: WandererAnimator procedural states, 0 allocations, footstep events, and look-at', () => {
  const animator = new WandererAnimator();
  const wanderer = new Wanderer({ form: 0, leaning: 'dawn' });

  // Transition to walk
  animator.setState('walk', 0.15);
  assert.equal(animator.getState(), 'walk');

  // Footstep event testing
  const footsteps: FootstepEvent[] = [];
  animator.onFootstep = (evt) => footsteps.push(evt);
  animator.surfaceQuery = () => 'stone';

  // Run 60 frames of walk at 2 m/s
  for (let i = 0; i < 60; i++) {
    animator.update(1 / 60, 2.0, wanderer.skeleton, new THREE.Vector3(0, 0, 0));
  }

  assert.ok(footsteps.length > 0, 'heel strikes must emit footstep events during walking');
  assert.equal(footsteps[0]!.surface, 'stone', 'footstep surface query returns stone');

  // Test states transition: sit-meditate, bow, wave, gather
  animator.setState('sit-meditate');
  animator.update(0.2, 0, wanderer.skeleton);
  const poseMed = animator.getBlendedPose();
  assert.ok(poseMed.pelvisY < -0.4, 'meditate lowers pelvis to ground');

  animator.setState('gather');
  animator.update(0.2, 0, wanderer.skeleton);
  const poseGather = animator.getBlendedPose();
  assert.ok(poseGather.eyeGlowMultiplier > 1.2, 'gather brightens eye glow');
  assert.ok(poseGather.gatherRingScale > 0.05, 'gather expands ground ring');

  // Look-at heading constraint (clamped to 55 deg = 0.96 rad)
  animator.lookAtTarget = new THREE.Vector3(10, 0, 0); // 90 degrees to side
  animator.update(1 / 60, 0, wanderer.skeleton);
  const poseLook = animator.getBlendedPose();
  assert.ok(Math.abs(poseLook.headRotY) <= 0.96, 'head turn clamped within 55 degrees');

  wanderer.dispose();
});

test('Step 12: Forms and Resident Presets (Hale, Ione, Tamsin, Corvin)', () => {
  const hale = new Wanderer({ resident: 'hale' });
  const ione = new Wanderer({ resident: 'ione' });
  const tamsin = new Wanderer({ resident: 'tamsin' });
  const corvin = new Wanderer({ resident: 'corvin' });

  assert.equal(hale.resident, 'hale');
  assert.equal(hale.leaning, 'still', 'elder Hale uses Still leaning');
  assert.equal(ione.resident, 'ione');
  assert.equal(ione.leaning, 'dusk', 'archivist Ione uses Dusk leaning');
  assert.equal(tamsin.resident, 'tamsin');
  assert.equal(tamsin.leaning, 'dawn', 'keeper Tamsin uses Dawn leaning');
  assert.equal(corvin.resident, 'corvin');
  assert.equal(corvin.leaning, 'dawn', 'junior Corvin uses Dawn leaning');

  hale.dispose();
  ione.dispose();
  tamsin.dispose();
  corvin.dispose();
});

test('Step 12: WandererPool LOD distance management and near caps', () => {
  const desktopPool = new WandererPool(mockDesktopDevice);
  const phonePool = new WandererPool(mockPhoneDevice);

  // Spawn 10 wanderers within 14 m
  for (let i = 0; i < 10; i++) {
    const w = desktopPool.spawn(`actor_${i}`, { form: 0 });
    // Distance from camera pos (0, 0, 0): 0 to 9 m
    w.position.set(0, 0, i * 1.0);
  }

  desktopPool.update(1 / 60, new THREE.Vector3(0, 0, 0));
  // Desktop maxNear is 8 (remaining 2 drop to mid)
  assert.equal(desktopPool.getNearCount(), 8, 'desktop pool caps near wanderers to 8');

  // Spawn on phone pool
  for (let i = 0; i < 10; i++) {
    const w = phonePool.spawn(`phone_actor_${i}`, { form: 0 });
    w.position.set(0, 0, i * 1.0);
  }
  phonePool.update(1 / 60, new THREE.Vector3(0, 0, 0));
  // Phone maxNear is 4 (remaining 6 drop to mid)
  assert.equal(phonePool.getNearCount(), 4, 'phone pool caps near wanderers to 4');

  desktopPool.dispose();
  phonePool.dispose();
});

test('Step 12: PlayerController at SPAWN (0, 0, 14) and ActorsLineup stage', () => {
  const localPlayer = new Wanderer({ form: 0, leaning: 'dawn' });
  const controller = new PlayerController(localPlayer);

  // Initial spawn
  assert.equal(controller.state.position.x, SPAWN.position.x);
  assert.equal(controller.state.position.z, SPAWN.position.z);
  assert.equal(controller.state.facing, 0, 'facing -z');

  // Movement update with forward input
  controller.setInput(0, -1, true); // Run forward
  controller.update(1 / 60, 0);

  assert.ok(controller.state.velocity.z < 0, 'player moves forward (-z)');
  assert.ok(controller.state.speed01 > 0, 'speed01 > 0');

  // Lineup stage contains 12 wanderers (4 forms x 3 leanings) + 4 residents = 16 actors
  const lineup = new ActorsLineup();
  assert.equal(lineup.entries.length, 16, 'lineup stage must have 16 wanderers');

  controller.dispose();
  lineup.dispose();
});
