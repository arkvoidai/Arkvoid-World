import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mapError } from './errors';
import { computeBreathCap, calculateGatherMultiplier, getRealmName } from '../state/game';
import { parseServerTimestamp } from './clockSync';
import { positionSaver } from './positionSaver';

describe('Arkvoid Step 14 - Data Layer & Net Logic Tests', () => {
  describe('Error Mapping', () => {
    it('maps known Postgres exceptions correctly to calm copy', () => {
      const err = mapError({ message: 'bad_name' });
      assert.equal(err.code, 'VALIDATION');
      assert.equal(err.message, 'Choose a name between 2 and 24 characters.');

      const errArea = mapError({ message: 'bad_area' });
      assert.equal(errArea.code, 'VALIDATION');
      assert.equal(errArea.message, 'This area lies beyond reachable ground.');

      const errAuth = mapError({ message: 'not_authenticated' });
      assert.equal(errAuth.code, 'AUTH_EXPIRED');
      assert.equal(errAuth.message, 'Please sign in to continue.');

      const errRate = mapError({ message: 'rate_limited' });
      assert.equal(errRate.code, 'RATE_LIMITED');
      assert.equal(errRate.message, 'Breathe and wait a moment.');
    });

    it('maps standard network fetch failures to NETWORK code', () => {
      const err = mapError(new TypeError('Failed to fetch'));
      assert.equal(err.code, 'NETWORK');
      assert.equal(err.message, 'The connection wavered. Reconnecting.');
    });

    it('handles generic unknown errors calmly', () => {
      const err = mapError(new Error('Internal unexpected socket drop'));
      assert.equal(err.code, 'UNKNOWN');
      assert.equal(err.message, 'Something went quiet. Try again.');
    });
  });

  describe('Mechanics & Calculations', () => {
    it('calculates Breath Cap correctly across realms and stages', () => {
      // Formula: 40 + 30 * stage + 80 * (realm - 1)
      // Realm 1, Stage 1: 40 + 30*1 + 0 = 70
      assert.equal(computeBreathCap(1, 1), 70);
      // Realm 1, Stage 2: 40 + 30*2 + 0 = 100
      assert.equal(computeBreathCap(1, 2), 100);
      // Realm 1, Stage 3: 40 + 30*3 + 0 = 130
      assert.equal(computeBreathCap(1, 3), 130);
      // Realm 2, Stage 1: 40 + 30*1 + 80 = 150
      assert.equal(computeBreathCap(2, 1), 150);
      // Realm 3, Stage 3: 40 + 30*3 + 160 = 290
      assert.equal(computeBreathCap(3, 3), 290);
    });

    it('maps Realm numbers to their canonical names', () => {
      assert.equal(getRealmName(1), 'Stillness');
      assert.equal(getRealmName(2), 'Gathering');
      assert.equal(getRealmName(3), 'Forging');
    });

    it('calculates gather multiplier correctly for dawn/dusk windows and leanings', () => {
      // 1. Dawn window (hour 6.0), dawn Breath, matching leaning ('dawn')
      // 1.0 * 3.0 (window) * 1.25 (leaning) = 3.75
      const multDawnMatch = calculateGatherMultiplier('dawn', 'dawn', 6.0);
      assert.equal(multDawnMatch, 3.75);

      // 2. Dawn window (hour 6.0), dawn Breath, different leaning ('still')
      // 1.0 * 3.0 (window) = 3.0
      const multDawnDiff = calculateGatherMultiplier('dawn', 'still', 6.0);
      assert.equal(multDawnDiff, 3.0);

      // 3. Normal day window (hour 12.0), dawn Breath, matching leaning ('dawn')
      // 1.0 * 1.25 = 1.25
      const multDayMatch = calculateGatherMultiplier('dawn', 'dawn', 12.0);
      assert.equal(multDayMatch, 1.25);

      // 4. Dusk window (hour 18.0), dusk Breath, matching leaning ('dusk')
      // 1.0 * 3.0 * 1.25 = 3.75
      const multDuskMatch = calculateGatherMultiplier('dusk', 'dusk', 18.0);
      assert.equal(multDuskMatch, 3.75);

      // 5. Dusk window (hour 18.0), dawn Breath (wrong kind for window)
      // No window bonus, +25% leaning if dawn
      const multDuskWrongKind = calculateGatherMultiplier('dawn', 'dawn', 18.0);
      assert.equal(multDuskWrongKind, 1.25);
    });
  });

  describe('Clock Sync & Timestamp Parsing', () => {
    it('parses server timestamps in various formats (ISO, numeric sec, numeric ms)', () => {
      const nowIso = '2026-10-30T12:00:00.000Z';
      const expectedMs = Date.parse(nowIso);
      assert.equal(parseServerTimestamp(nowIso), expectedMs);

      // In seconds (~1.79e9)
      const sec = 1790812800;
      assert.equal(parseServerTimestamp(sec), sec * 1000);

      // In milliseconds
      const ms = 1790812800000;
      assert.equal(parseServerTimestamp(ms), ms);
    });
  });

  describe('Position Saver & Area Derivation', () => {
    it('maps Island A coordinates to dawn-terrace', () => {
      const area = positionSaver.resolveArea({ x: 0, y: 0, z: 14, ry: 0 });
      assert.equal(area, 'dawn-terrace');
    });

    it('maps Island B coordinates to still-garden', () => {
      const area = positionSaver.resolveArea({ x: 60, y: -2, z: -8, ry: 0 });
      assert.equal(area, 'still-garden');
    });

    it('maps Island C coordinates to falls-of-light', () => {
      const area = positionSaver.resolveArea({ x: 38, y: 1, z: -52, ry: 0 });
      assert.equal(area, 'falls-of-light');
    });

    it('guards against saving position before away_report has completed', () => {
      positionSaver.reset();
      assert.equal(positionSaver.hasAwayReportRun(), false);

      // Saving should be a no-op when awayReportRun is false
      positionSaver.save({ x: 0, y: 0, z: 14, ry: 0 });
      assert.equal(positionSaver.hasAwayReportRun(), false);

      positionSaver.setAwayReportRun(true);
      assert.equal(positionSaver.hasAwayReportRun(), true);
    });
  });
});
