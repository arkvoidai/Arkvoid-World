import assert from 'node:assert/strict';
import test from 'node:test';
import { stepRenderScaleGovernor } from '@/engine/core/Engine';
import {
  computeGodRayStrength,
  computePhaseVignetteStyle,
} from '@/engine/fx/Atmosphere';
import {
  resolveShadowTier,
  shouldRegeneratePmrem,
} from '@/engine/world/LightRig';
import { WORLD_PALETTE, WorldMaterialBank } from '@/engine/world/materials';
import { REVIEW_SHOTS } from '@/engine/world/reviewShots';
import { SKY_KEYS_V2, timeOfDayState } from '@/engine/world/sky';
import {
  hourNow,
  resetClockOverridesCache,
  REVIEW_HOURS,
  setHourOverride,
} from '@/lib/worldClock';

test('Time-of-Day Table v2 defines 7 key phases with Preetham parameters, directional fill light, and fog', () => {
  const dawn = timeOfDayState(6.5);
  assert.equal(dawn.hour, 6.5);
  assert.equal(dawn.turbidity, 4.0);
  assert.equal(dawn.rayleigh, 3.0);
  assert.equal(dawn.mieCoefficient, 0.015);
  assert.equal(dawn.mieDirectionalG, 0.82);
  assert.equal(dawn.exposure, 0.95);
  assert.equal(dawn.fogNear, 40);
  assert.equal(dawn.fogFar, 380);

  const golden = timeOfDayState(16.5);
  assert.equal(golden.turbidity, 3.5);
  assert.equal(golden.rayleigh, 2.2);
  assert.equal(golden.exposure, 0.92);

  const dusk = timeOfDayState(18.3);
  assert.equal(dusk.turbidity, 5.0);
  assert.equal(dusk.rayleigh, 4.0);
  assert.equal(dusk.exposure, 0.88);

  const night = timeOfDayState(23.0);
  assert.equal(night.exposure, 1.05);
  assert.ok(night.stars > 0.8);

  // Fill light direction is opposite sun azimuth
  assert.ok(dawn.fillLightDirection.x * dawn.sunDirection.x < 0);

  assert.equal(SKY_KEYS_V2.length, 9); // 7 key phases + anchors
});

test('WorldMaterialBank enforces New World Colour Law (albedo <= 0.80) and 0.01 hour sync gate', () => {
  const desktopBank = new WorldMaterialBank({ deviceClass: 'desktop' });
  const phoneBank = new WorldMaterialBank({ deviceClass: 'phone' });

  // Fresnel rim strength: 0.35 desktop, 0.25 phone
  assert.equal(desktopBank.rimUniforms.uRimStrength.value, 0.35);
  assert.equal(phoneBank.rimUniforms.uRimStrength.value, 0.25);

  // Natural palette albedo checks (strictly <= 0.80 sRGB #E6E0D2)
  assert.equal(WORLD_PALETTE.grassLit, '#8DB04C');
  assert.equal(WORLD_PALETTE.grassMid, '#5E8C3A');
  assert.equal(WORLD_PALETTE.grassShadow, '#3C5E2A');
  assert.equal(WORLD_PALETTE.moss, '#4C6B34');
  assert.equal(WORLD_PALETTE.rockWarmGrey, '#8D857B');
  assert.equal(WORLD_PALETTE.rockShadowTint, '#6B6478');
  assert.equal(WORLD_PALETTE.timber, '#5B3F2B');
  assert.equal(WORLD_PALETTE.roofTileSlateTeal, '#3F4F55');
  assert.equal(WORLD_PALETTE.lacquerVermilion, '#B3342A');
  assert.equal(WORLD_PALETTE.pavingStone, '#BDB3A3');

  // Check 0.01 hour gate
  const sky = timeOfDayState(6.5);
  assert.equal(desktopBank.syncSkyState(sky, false), true);
  assert.equal(desktopBank.getSkySyncCount(), 1);

  // Delta < 0.01 must be skipped
  const skyTinyMove = timeOfDayState(6.505);
  assert.equal(desktopBank.syncSkyState(skyTinyMove, false), false);
  assert.equal(desktopBank.getSkySyncCount(), 1);

  // Delta >= 0.01 must update
  const skyMoved = timeOfDayState(6.52);
  assert.equal(desktopBank.syncSkyState(skyMoved, false), true);
  assert.equal(desktopBank.getSkySyncCount(), 2);

  desktopBank.dispose();
  phoneBank.dispose();
});

test('LightRig shadow tiers and PMREM 45s / 0.25h regeneration gate', () => {
  const base = {
    deviceClass: 'desktop' as const,
    gpuTier: 3 as const,
    deviceMemory: 8,
    reducedMotion: false,
    isSoftwareGl: false,
    dprCap: 2,
    cloudPuffCount: 280,
    starDensity: 1,
    skyExtraHalo: true,
  };
  assert.equal(resolveShadowTier(base), 'desktop-high');
  assert.equal(resolveShadowTier({ ...base, gpuTier: 2 }), 'desktop-mid');
  assert.equal(
    resolveShadowTier({ ...base, deviceClass: 'phone', gpuTier: 2 }),
    'phone-high',
  );
  assert.equal(
    resolveShadowTier({ ...base, deviceClass: 'phone', gpuTier: 1 }),
    'none',
  );

  // Low tier never regenerates PMREM
  assert.equal(shouldRegeneratePmrem(true, 120, 12.0, 6.5), false);
  // Under 45 seconds never regenerates
  assert.equal(shouldRegeneratePmrem(false, 44.9, 12.0, 6.5), false);
  // Hour change < 0.25 never regenerates
  assert.equal(shouldRegeneratePmrem(false, 60, 6.7, 6.5), false);
  // >= 45s and >= 0.25h regenerates
  assert.equal(shouldRegeneratePmrem(false, 45, 6.75, 6.5), true);
});

test('Atmosphere god-ray elevation curve and phase vignette', () => {
  assert.equal(computeGodRayStrength(-0.25), 0);
  const dawnRay = computeGodRayStrength(0.22);
  assert.ok(dawnRay > 0.85, `Expected strong dawn ray, got ${dawnRay}`);
  const noonRay = computeGodRayStrength(0.92);
  assert.ok(noonRay < 0.1, `Expected nearly invisible noon ray, got ${noonRay}`);

  const vDawn = computePhaseVignetteStyle(6.5);
  const vDay = computePhaseVignetteStyle(12.0);
  const vDusk = computePhaseVignetteStyle(18.5);
  const vNight = computePhaseVignetteStyle(23.0);
  assert.notEqual(vDawn, vDay);
  assert.notEqual(vDay, vDusk);
  assert.notEqual(vDusk, vNight);
});

test('Temporary render-scale governor steps down by 0.1 after 3s over budget down to 0.7 floor', () => {
  let scale = 1.0;
  let accum = 0;

  const r1 = stepRenderScaleGovernor(scale, 32, 25, accum, 2.5);
  assert.equal(r1.steppedDown, false);
  assert.equal(r1.nextScale, 1.0);
  accum = r1.nextAccumSec;

  const r2 = stepRenderScaleGovernor(scale, 32, 25, accum, 0.6);
  assert.equal(r2.steppedDown, true);
  assert.equal(r2.nextScale, 0.9);
  scale = r2.nextScale;
  accum = r2.nextAccumSec;

  const r3 = stepRenderScaleGovernor(scale, 32, 25, accum, 3.1);
  assert.equal(r3.nextScale, 0.8);
  const r4 = stepRenderScaleGovernor(r3.nextScale, 32, 25, 0, 3.1);
  assert.equal(r4.nextScale, 0.7);

  const r5 = stepRenderScaleGovernor(r4.nextScale, 45, 25, 0, 5.0);
  assert.equal(r5.nextScale, 0.7);
  assert.equal(r5.steppedDown, false);
});

test('Visual Review shots (10 curated shots) and 6 review hours', () => {
  assert.equal(REVIEW_SHOTS.length, 10);
  assert.deepEqual([...REVIEW_HOURS], [6.5, 9.5, 12.0, 16.5, 18.3, 23.0]);

  setHourOverride(16.5);
  assert.equal(hourNow(), 16.5);
  resetClockOverridesCache();
});
