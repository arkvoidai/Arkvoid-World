import test from 'node:test';
import assert from 'node:assert/strict';
import { createLogger } from './log';
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  getMissingPublicConfig,
  isPublicConfigReady,
} from '../config/public';
import { COLORS, contrastRatio } from '../config/tokens';
import { getMotionPreset } from './motion';
import { clamp01, resolveDayPhase } from '../ui/Orb';
import { resolveNextDetentOnDrag } from '../ui/Sheet';
import { computeWorldLabelTransform } from '../ui/WorldLabel';
import {
  EPOCH,
  worldMinute,
  worldHourFromMs,
  phaseOf,
  setServerOffset,
  getServerOffset,
} from './worldClock';
import { timeOfDayState, createTimeOfDayState } from '../engine/world/sky';
import { Emitter } from './emitter';
import { EngineMetrics } from '../engine/core/Metrics';
import {
  sharedEngineBridge,
  useWorldBridgeStore,
} from '../state/worldBridgeStore';

test('logger emits all levels in development and only errors in production', () => {
  const calls: string[] = [];
  const sink = {
    debug: (msg: unknown) => calls.push(String(msg)),
    info: (msg: unknown) => calls.push(String(msg)),
    warn: (msg: unknown) => calls.push(String(msg)),
    error: (msg: unknown) => calls.push(String(msg)),
  };

  const devLog = createLogger({ isProduction: false, sink });
  devLog.debug('d');
  devLog.info('i');
  devLog.warn('w');
  devLog.error('e');
  assert.equal(calls.length, 4);

  calls.length = 0;
  const prodLog = createLogger({ isProduction: true, sink });
  prodLog.debug('d');
  prodLog.info('i');
  prodLog.warn('w');
  prodLog.error('e');
  assert.deepEqual(calls, ['[error] e']);
});

test('public config exports empty strings by default and identifies missing values', () => {
  assert.equal(SUPABASE_URL, '');
  assert.equal(SUPABASE_ANON_KEY, '');
  assert.deepEqual(getMissingPublicConfig(), [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
  ]);
  assert.equal(isPublicConfigReady(), false);
  assert.deepEqual(getMissingPublicConfig('https://example.supabase.co', ''), [
    'SUPABASE_ANON_KEY',
  ]);
  assert.equal(
    isPublicConfigReady('https://example.supabase.co', 'public-anon-key'),
    true,
  );
});

test('WCAG contrast ratios meet AA thresholds for primary text pairs', () => {
  assert.equal(contrastRatio(COLORS.ink, COLORS.pearl) >= 17, true);
  assert.equal(contrastRatio(COLORS.ink, COLORS.porcelain) >= 16, true);
  assert.equal(contrastRatio(COLORS.ink2, COLORS.pearl) >= 8.5, true);
  assert.equal(contrastRatio(COLORS.ink2, COLORS.porcelain) >= 8.0, true);
  assert.equal(contrastRatio(COLORS.danger, COLORS.pearl) >= 4.1, true);
  assert.equal(contrastRatio(COLORS.ink3, COLORS.pearl) >= 3.4, true);
});

test('Orb day phase resolution and clamping behave accurately across 0..24h', () => {
  assert.equal(resolveDayPhase(0), 'night');
  assert.equal(resolveDayPhase(6), 'rising');
  assert.equal(resolveDayPhase(12), 'noon');
  assert.equal(resolveDayPhase(18), 'setting');
  assert.equal(resolveDayPhase(23), 'night');
  assert.equal(clamp01(-0.4), 0);
  assert.equal(clamp01(0.65), 0.65);
  assert.equal(clamp01(1.8), 1);
});

test('Sheet drag detent snapping resolves peek, medium, full, and close', () => {
  assert.equal(resolveNextDetentOnDrag('peek', 90, 500, 844), 'close');
  assert.equal(resolveNextDetentOnDrag('peek', -220, -400, 844), 'medium');
  assert.equal(resolveNextDetentOnDrag('medium', -280, -500, 844), 'full');
  assert.equal(resolveNextDetentOnDrag('full', 260, 300, 844), 'medium');
});

test('WorldLabel fades by distance and pushes clear of the Orb', () => {
  const far = computeWorldLabelTransform(
    { x: 100, y: 100, distance: 35, visible: true },
    4,
    28,
  );
  assert.equal(far.opacity, 0);

  const overlapping = computeWorldLabelTransform(
    { x: 205, y: 200, distance: 6, visible: true, orbX: 200, orbY: 200 },
    4,
    28,
  );
  const distFromOrb = Math.hypot(overlapping.x - 200, overlapping.y - 200);
  assert.equal(distFromOrb >= 67.9, true);
});

test('motion presets collapse to 120ms opacity fade under reduced motion', () => {
  const normal = getMotionPreset('titleCard', false);
  assert.deepEqual(normal.initial, { opacity: 0, y: 8 });

  const reduced = getMotionPreset('titleCard', true);
  assert.deepEqual(reduced.initial, { opacity: 0 });
});

test('worldClock computes EPOCH, 4-real-hour world day, and phaseOf accurately', () => {
  assert.equal(EPOCH, 1790812800);
  const epochMs = EPOCH * 1000;
  // At EPOCH, worldMinute is 360 (6:00 dawn)
  assert.equal(worldMinute(epochMs), 360);
  assert.equal(worldHourFromMs(epochMs), 6);

  // 4 real hours = 14,400 seconds = 1,440 world minutes = 1 full 24h cycle back to 6.00
  const fourRealHoursLaterMs = epochMs + 4 * 3600 * 1000;
  assert.equal(worldMinute(fourRealHoursLaterMs), 360 + 1440);
  assert.equal(worldHourFromMs(fourRealHoursLaterMs), 6);

  assert.equal(phaseOf(5.2), 'dawn');
  assert.equal(phaseOf(12), 'day');
  assert.equal(phaseOf(19), 'dusk');
  assert.equal(phaseOf(23.5), 'night');
  assert.equal(phaseOf(2), 'night');

  setServerOffset(5000);
  assert.equal(getServerOffset(), 5000);
  setServerOffset(0);
});

test('timeOfDayState matches key table at 6.5, 12, 18, 23 and transitions smoothly across sunset/sunrise', () => {
  const s = createTimeOfDayState();

  // 6.5 (DAWN)
  timeOfDayState(6.5, s);
  assert.equal(`#${s.horizon.getHexString().toUpperCase()}`, '#FF9E66');
  assert.equal(`#${s.mid.getHexString().toUpperCase()}`, '#D0826F');
  assert.equal(`#${s.zenith.getHexString().toUpperCase()}`, '#4A3A7C');
  assert.equal(Math.abs(s.stars - 0.05) < 1e-4, true);

  // 12.0 (NOON)
  timeOfDayState(12, s);
  assert.equal(`#${s.horizon.getHexString().toUpperCase()}`, '#A8C8F0');
  assert.equal(`#${s.mid.getHexString().toUpperCase()}`, '#93B3DB');
  assert.equal(`#${s.zenith.getHexString().toUpperCase()}`, '#6A8AB5');
  assert.equal(Math.abs(s.exposure - 0.85) < 1e-5, true);

  // 18.3 (DUSK)
  timeOfDayState(18.3, s);
  assert.equal(`#${s.horizon.getHexString().toUpperCase()}`, '#9A5080');
  assert.equal(`#${s.zenith.getHexString().toUpperCase()}`, '#36225E');

  // 23.0 (NIGHT)
  timeOfDayState(23, s);
  assert.equal(`#${s.horizon.getHexString().toUpperCase()}`, '#18152B');
  assert.equal(s.stars, 1);

  // Verify no sudden jump in keyLightDirection or lightIntensity across sunset (17.4 -> 18.6)
  let prevIntensity = timeOfDayState(17.4, s).lightIntensity;
  const prevDir = s.keyLightDirection.clone();
  for (let h = 17.45; h <= 18.6; h += 0.05) {
    timeOfDayState(h, s);
    const deltaI = Math.abs(s.lightIntensity - prevIntensity);
    const deltaDir = s.keyLightDirection.distanceTo(prevDir);
    assert.equal(deltaI < 0.25, true);
    assert.equal(deltaDir < 0.25, true);
    prevIntensity = s.lightIntensity;
    prevDir.copy(s.keyLightDirection);
  }
});

test('Emitter, EngineMetrics ring buffer, and EngineBridge 10Hz throttle work accurately', () => {
  const emitter = new Emitter<{ ping: number }>();
  let sum = 0;
  const off = emitter.on('ping', (v) => {
    sum += v;
  });
  emitter.emit('ping', 3);
  off();
  emitter.emit('ping', 5);
  assert.equal(sum, 3);

  const metrics = new EngineMetrics();
  for (let i = 0; i < 60; i++) {
    metrics.recordFrame(1 / 60);
  }
  assert.equal(metrics.fps >= 59 && metrics.fps <= 61, true);
  assert.equal(metrics.frameMsP50 > 16 && metrics.frameMsP50 < 17, true);

  const bridge = sharedEngineBridge;
  bridge.mutable.fps = 60;
  bridge.mutable.hour = 6.5;
  bridge.tickPublish(0.016, true);
  assert.equal(useWorldBridgeStore.getState().fps, 60);

  bridge.mutable.fps = 58;
  bridge.tickPublish(0.016, false); // Under 0.1s throttle
  assert.equal(useWorldBridgeStore.getState().fps, 60);

  bridge.tickPublish(0.1, false); // Reached 0.1s (10 Hz)
  assert.equal(useWorldBridgeStore.getState().fps, 58);
});
