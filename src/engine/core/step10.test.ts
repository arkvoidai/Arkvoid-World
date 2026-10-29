import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  QUALITY_PRESETS,
  getAdjustedPreset,
  getInitialQuality,
  resolveEffectiveTier,
  type QualityTier,
} from '@/engine/core/Quality';
import {
  CameraRailController,
  ARRIVAL_RAIL,
  ORBIT_RAIL,
  BRIDGE_CROSS_RAIL,
} from '@/engine/core/CameraRail';
import { BenchmarkSession, BENCHMARK_RAIL } from '@/engine/core/Benchmark';
import { QualityGovernor } from '@/engine/core/QualityGovernor';
import type { DeviceProfile } from '@/lib/deviceProfile';

test('Quality presets define all 4 tiers with explicit feature switches', () => {
  const tiers: QualityTier[] = ['ultra', 'balanced', 'performance', 'lite'];
  for (const tier of tiers) {
    const preset = QUALITY_PRESETS[tier];
    assert.ok(preset, `Preset for tier ${tier} must exist`);
    assert.equal(preset.id, tier);
  }

  // Ultra requirements
  const ultra = QUALITY_PRESETS.ultra;
  assert.equal(ultra.dprCap, 2.0);
  assert.equal(ultra.msaa, 4);
  assert.equal(ultra.csmCascades, 3);
  assert.equal(ultra.gtao, true);
  assert.equal(ultra.bloom, true);
  assert.equal(ultra.bloomResolution, 'half');
  assert.equal(ultra.bloomStrength, 0.35);
  assert.equal(ultra.bloomThreshold, 1.0);
  assert.equal(ultra.sunShafts, 'screen-space');
  assert.equal(ultra.sunShaftSamples, 24);
  assert.equal(ultra.grassCount, 120_000);
  assert.equal(ultra.leafCardRatio, 1.0);
  assert.equal(ultra.textureResolution, 1024);
  assert.equal(ultra.cloudMarchSteps, 4);
  assert.equal(ultra.particles, 1.0);

  // Balanced requirements
  const balanced = QUALITY_PRESETS.balanced;
  assert.equal(balanced.dprCap, 1.75);
  assert.equal(balanced.csmCascades, 1);
  assert.equal(balanced.gtao, false);
  assert.equal(balanced.bloomStrength, 0.20);
  assert.equal(balanced.sunShafts, 'geometry');
  assert.equal(balanced.grassCount, 70_000);
  assert.equal(balanced.leafCardRatio, 0.7);
  assert.equal(balanced.cloudMarchSteps, 2);

  // Balanced phone adjusted preset
  const balancedPhone = getAdjustedPreset('balanced', true);
  assert.equal(balancedPhone.dprCap, 1.5);
  assert.equal(balancedPhone.msaa, 2);
  assert.equal(balancedPhone.shadowMapSize, 1024);
  assert.equal(balancedPhone.bloom, false);
  assert.equal(balancedPhone.grassCount, 28_000);

  // Performance requirements
  const perf = QUALITY_PRESETS.performance;
  assert.equal(perf.dprCap, 1.25);
  assert.ok(perf.renderScale >= 0.7 && perf.renderScale <= 0.9);
  assert.equal(perf.shadowType, 'none');
  assert.equal(perf.bloom, false);
  assert.equal(perf.sunShafts, 'none');
  assert.equal(perf.grassCount, 14_000);
  assert.equal(perf.leafCardRatio, 0.4);
  assert.equal(perf.textureResolution, 512);
  assert.equal(perf.cloudMarchSteps, 0);
  assert.equal(perf.particles, 0.4);

  // Lite requirements
  const lite = QUALITY_PRESETS.lite;
  assert.equal(lite.dprCap, 1.0);
  assert.equal(lite.renderScale, 0.65);
  assert.equal(lite.grassCount, 0);
  assert.equal(lite.leafCardRatio, 0.0);
  assert.equal(lite.textureResolution, 256);
  assert.equal(lite.cloudMarchSteps, 0);
  assert.equal(lite.particles, 0.1);
});

test('Auto starting tier selection and user quality preference resolution', () => {
  const desktopHigh: DeviceProfile = {
    deviceClass: 'desktop',
    gpuTier: 3,
    deviceMemory: 8,
    reducedMotion: false,
    isSoftwareGl: false,
    dprCap: 2.0,
    cloudPuffCount: 60,
    starDensity: 1.0,
    skyExtraHalo: true,
  };
  const desktopMid: DeviceProfile = { ...desktopHigh, gpuTier: 2 };
  const phoneHigh: DeviceProfile = { ...desktopHigh, deviceClass: 'phone', gpuTier: 2 };
  const phoneMid: DeviceProfile = { ...desktopHigh, deviceClass: 'phone', gpuTier: 1 };
  const lowTierSw: DeviceProfile = { ...desktopHigh, isSoftwareGl: true, gpuTier: 0 };

  assert.equal(getInitialQuality(desktopHigh), 'ultra');
  assert.equal(getInitialQuality(desktopMid), 'balanced');
  assert.equal(getInitialQuality(phoneHigh), 'balanced');
  assert.equal(getInitialQuality(phoneMid), 'performance');
  assert.equal(getInitialQuality(lowTierSw), 'lite');

  // User preference resolution
  assert.equal(resolveEffectiveTier('auto', desktopHigh), 'ultra');
  assert.equal(resolveEffectiveTier('cinematic', desktopHigh), 'ultra');
  assert.equal(resolveEffectiveTier('cinematic', phoneHigh), 'balanced');
  assert.equal(resolveEffectiveTier('performance', desktopHigh), 'performance');
});

test('Camera rails: evaluation, progression, loop, and completion', () => {
  assert.equal(ARRIVAL_RAIL.duration, 9.0);
  assert.equal(ORBIT_RAIL.duration, 30.0);
  assert.equal(BRIDGE_CROSS_RAIL.duration, 12.0);
  assert.equal(BENCHMARK_RAIL.duration, 60.0);

  const controller = new CameraRailController();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);

  let doneFired = false;
  controller.play(ARRIVAL_RAIL, {
    loop: false,
    handheldDrift: false,
    onDone: () => {
      doneFired = true;
    },
  });

  assert.equal(controller.isPlaying(), true);

  // Evaluate at start (t = 0)
  controller.evaluateAt(0.0, camera);
  assert.ok(Math.abs(camera.position.y - 48.0) < 0.01);
  assert.equal(camera.fov, 65);

  // Progress 4.5 seconds
  controller.update(4.5, camera);
  assert.equal(controller.isPlaying(), true);
  assert.ok(camera.position.y < 48.0 && camera.position.y > 4.2);

  // Complete rail
  controller.update(5.0, camera); // 4.5 + 5.0 = 9.5s > 9.0s
  assert.equal(controller.isPlaying(), false);
  assert.equal(doneFired, true);
  assert.ok(Math.abs(camera.position.y - 2.4) < 0.1);
  assert.equal(camera.fov, 48);
});

test('Benchmark session: frame time metrics and PASS/FAIL budget verification', () => {
  const desktopDevice: DeviceProfile = {
    deviceClass: 'desktop',
    gpuTier: 3,
    deviceMemory: 8,
    reducedMotion: false,
    isSoftwareGl: false,
    dprCap: 2.0,
    cloudPuffCount: 60,
    starDensity: 1.0,
    skyExtraHalo: true,
  };

  const session = new BenchmarkSession(desktopDevice, 180, 'ultra');
  assert.equal(session.isActive(), true);

  // Record 120 frames at ~16ms (solid 60 fps)
  for (let i = 0; i < 120; i++) {
    session.recordFrame(0.5, 16.2, 'ultra');
  }

  const report = session.finish(16, 38);
  assert.equal(session.isActive(), false);
  assert.equal(report.deviceClass, 'desktop');
  assert.ok(report.p95Ms <= 25.0);
  assert.equal(report.passed, true);
  assert.equal(report.budgetP95Ms, 25.0);

  // Check phone failing when p95 > 40ms
  const phoneDevice: DeviceProfile = { ...desktopDevice, deviceClass: 'phone', gpuTier: 1 };
  const failingSession = new BenchmarkSession(phoneDevice, 250, 'performance');
  for (let i = 0; i < 120; i++) {
    failingSession.recordFrame(0.5, 48.0, 'performance');
  }
  const failReport = failingSession.finish(8, 20);
  assert.equal(failReport.passed, false);
  assert.equal(failReport.budgetP95Ms, 40.0);
});

test('QualityGovernor: initialization, state readout, and degradation steps', () => {
  let toastMsg = '';
  const governor = new QualityGovernor('balanced', (msg) => {
    toastMsg = msg;
  });

  const state = governor.getState();
  assert.equal(state.currentTier, 'balanced');
  assert.equal(state.degradeStep, 0);
  assert.equal(state.isSessionLocked, false);
  assert.equal(typeof toastMsg, 'string');

  governor.dispose();
});
