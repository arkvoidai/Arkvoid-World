/**
 * Arkvoid World Clock — works offline.
 * EPOCH = Date.UTC(2026, 9, 1) / 1000 = 1790812800.
 * 0.1 world minute per real second => 1 world day = 4 real hours, starting at 06:00.
 */
export const EPOCH = 1790812800;

export type WorldPhase = 'dawn' | 'day' | 'dusk' | 'night';

let serverOffsetMs = 0;

export function setServerOffset(ms: number): void {
  if (Number.isFinite(ms)) {
    serverOffsetMs = ms;
  }
}

export function getServerOffset(): number {
  return serverOffsetMs;
}

export function worldMinute(nowMs: number = Date.now() + serverOffsetMs): number {
  return 360 + Math.floor((nowMs / 1000 - EPOCH) / 10);
}

export function worldHourFromMs(
  nowMs: number = Date.now() + serverOffsetMs,
): number {
  const continuousMinute = 360 + (nowMs / 1000 - EPOCH) / 10;
  return (((continuousMinute / 60) % 24) + 24) % 24;
}

export interface ClockQueryOverrides {
  fixedHour: number | null;
  timeSpeed: number;
  bootRealMs: number;
  bootWorldHour: number;
}

let cachedOverrides: ClockQueryOverrides | null = null;

export function readClockOverridesFromSearch(
  search: string,
  nowMs: number = Date.now() + serverOffsetMs,
): ClockQueryOverrides {
  const params = new URLSearchParams(search);
  const timeParam = params.get('time');
  const speedParam = params.get('timespeed');

  let fixedHour: number | null = null;
  if (timeParam !== null && timeParam.trim() !== '') {
    const parsed = Number(timeParam);
    if (Number.isFinite(parsed)) {
      fixedHour = ((parsed % 24) + 24) % 24;
    }
  }

  let timeSpeed = 1;
  if (speedParam !== null && speedParam.trim() !== '') {
    const parsedSpeed = Number(speedParam);
    if (Number.isFinite(parsedSpeed) && parsedSpeed > 0) {
      timeSpeed = parsedSpeed;
    }
  }

  return {
    fixedHour,
    timeSpeed,
    bootRealMs: nowMs,
    bootWorldHour: fixedHour ?? worldHourFromMs(nowMs),
  };
}

function getActiveOverrides(nowMs: number): ClockQueryOverrides {
  if (cachedOverrides) {
    return cachedOverrides;
  }
  if (typeof window !== 'undefined' && window.location) {
    cachedOverrides = readClockOverridesFromSearch(
      window.location.search,
      nowMs,
    );
    return cachedOverrides;
  }
  return {
    fixedHour: null,
    timeSpeed: 1,
    bootRealMs: nowMs,
    bootWorldHour: worldHourFromMs(nowMs),
  };
}

let programmaticHourOverride: number | null = null;
let programmaticSpeedOverride: number | null = null;

export const REVIEW_HOURS = [6.5, 9.5, 12.0, 16.5, 18.3, 23.0] as const;

export function setHourOverride(hour: number | null): void {
  if (hour === null || !Number.isFinite(hour)) {
    programmaticHourOverride = null;
  } else {
    programmaticHourOverride = ((hour % 24) + 24) % 24;
  }
}

export function getHourOverride(): number | null {
  return programmaticHourOverride;
}

export function setTimeSpeedOverride(speed: number | null): void {
  if (speed === null || !Number.isFinite(speed) || speed <= 0) {
    programmaticSpeedOverride = null;
  } else {
    programmaticSpeedOverride = speed;
  }
}

export function resetClockOverridesCache(): void {
  cachedOverrides = null;
  programmaticHourOverride = null;
  programmaticSpeedOverride = null;
}

export function hourNow(nowMs: number = Date.now() + serverOffsetMs): number {
  if (programmaticHourOverride !== null) {
    return programmaticHourOverride;
  }
  const overrides = getActiveOverrides(nowMs);
  const effectiveSpeed = programmaticSpeedOverride ?? overrides.timeSpeed;
  if (overrides.fixedHour !== null && effectiveSpeed === 1) {
    return overrides.fixedHour;
  }
  if (effectiveSpeed !== 1) {
    const elapsedRealSec = Math.max(0, (nowMs - overrides.bootRealMs) / 1000);
    // Base rate: 0.1 world minute per real second = (0.1 / 60) world hours per real second
    const deltaHours = (elapsedRealSec * 0.1 * effectiveSpeed) / 60;
    return (((overrides.bootWorldHour + deltaHours) % 24) + 24) % 24;
  }
  return worldHourFromMs(nowMs);
}

export function phaseOf(hour: number): WorldPhase {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 5 && h < 8) return 'dawn';
  if (h >= 8 && h < 17) return 'day';
  if (h >= 17 && h < 20) return 'dusk';
  return 'night';
}

