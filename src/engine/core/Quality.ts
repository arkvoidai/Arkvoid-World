import type { DeviceProfile } from '@/lib/deviceProfile';

export type QualityTier = 'ultra' | 'balanced' | 'performance' | 'lite';
export type UserQualityPreference = 'auto' | 'cinematic' | 'performance';

export interface QualityPreset {
  readonly id: QualityTier;
  readonly label: string;
  readonly dprCap: number;
  readonly renderScale: number;
  readonly msaa: number;
  readonly shadowType: 'csm' | 'single' | 'none';
  readonly shadowMapSize: number;
  readonly csmCascades: number;
  readonly gtao: boolean;
  readonly bloom: boolean;
  readonly bloomResolution: 'half' | 'quarter';
  readonly bloomStrength: number;
  readonly bloomThreshold: number;
  readonly sunShafts: 'screen-space' | 'geometry' | 'none';
  readonly sunShaftSamples: number;
  readonly dof: boolean;
  readonly filmGrain: number;
  readonly grassCount: number;
  readonly leafCardRatio: number;
  readonly textureResolution: 256 | 512 | 1024 | 2048;
  readonly cloudMarchSteps: number;
  readonly pmremRefreshSec: number;
  readonly particleRatio: number;
  readonly particles: number;
}

export const QUALITY_PRESETS: Record<QualityTier, QualityPreset> = {
  ultra: {
    id: 'ultra',
    label: 'Ultra',
    dprCap: 2.0,
    renderScale: 1.0,
    msaa: 4,
    shadowType: 'csm',
    shadowMapSize: 2048,
    csmCascades: 3,
    gtao: true,
    bloom: true,
    bloomResolution: 'half',
    bloomStrength: 0.35,
    bloomThreshold: 1.0,
    sunShafts: 'screen-space',
    sunShaftSamples: 24,
    dof: false, // only in dialogue / photo mode
    filmGrain: 0.012,
    grassCount: 120_000,
    leafCardRatio: 1.0,
    textureResolution: 1024, // 2048 if _2k files exist
    cloudMarchSteps: 4,
    pmremRefreshSec: 45,
    particles: 1.0,
    particleRatio: 1.0,
  },
  balanced: {
    id: 'balanced',
    label: 'Balanced',
    dprCap: 1.75, // reduced to 1.5 on mobile devices in runtime
    renderScale: 1.0,
    msaa: 4,      // reduced to 2 on mobile devices in runtime
    shadowType: 'single',
    shadowMapSize: 2048, // 1024 on phones
    csmCascades: 1,
    gtao: false,
    bloom: true,  // quarter res on desktop only
    bloomResolution: 'quarter',
    bloomStrength: 0.20,
    bloomThreshold: 1.0,
    sunShafts: 'geometry',
    sunShaftSamples: 16,
    dof: false,
    filmGrain: 0.008,
    grassCount: 70_000, // 28_000 on phones
    leafCardRatio: 0.7,
    textureResolution: 1024,
    cloudMarchSteps: 2,
    pmremRefreshSec: 60,
    particles: 0.7,
    particleRatio: 0.7,
  },
  performance: {
    id: 'performance',
    label: 'Performance',
    dprCap: 1.25,
    renderScale: 0.80, // scale 0.7 to 0.9
    msaa: 2,
    shadowType: 'none', // AO decals & blob shadows only
    shadowMapSize: 512,
    csmCascades: 0,
    gtao: false,
    bloom: false, // glow sprites only
    bloomResolution: 'quarter',
    bloomStrength: 0.0,
    bloomThreshold: 1.0,
    sunShafts: 'none',
    sunShaftSamples: 0,
    dof: false,
    filmGrain: 0.0,
    grassCount: 14_000,
    leafCardRatio: 0.4,
    textureResolution: 512,
    cloudMarchSteps: 0,
    pmremRefreshSec: 0,
    particles: 0.4,
    particleRatio: 0.4,
  },
  lite: {
    id: 'lite',
    label: 'Lite',
    dprCap: 1.0,
    renderScale: 0.65,
    msaa: 0,
    shadowType: 'none',
    shadowMapSize: 256,
    csmCascades: 0,
    gtao: false,
    bloom: false,
    bloomResolution: 'quarter',
    bloomStrength: 0.0,
    bloomThreshold: 1.0,
    sunShafts: 'none',
    sunShaftSamples: 0,
    dof: false,
    filmGrain: 0.0,
    grassCount: 0, // no grass
    leafCardRatio: 0.0, // crown proxies only
    textureResolution: 256,
    cloudMarchSteps: 0,
    pmremRefreshSec: 0,
    particles: 0.1,
    particleRatio: 0.1,
  },
};

/**
 * Returns preset tailored for phone vs desktop if balanced tier is chosen.
 */
export function getAdjustedPreset(tier: QualityTier, isPhone: boolean): QualityPreset {
  const base = QUALITY_PRESETS[tier];
  if (tier !== 'balanced') {
    return base;
  }
  if (!isPhone) {
    return base;
  }
  return {
    ...base,
    dprCap: 1.5,
    msaa: 2,
    shadowMapSize: 1024,
    bloom: false, // light bloom on desktop only in balanced
    grassCount: 28_000,
    filmGrain: 0.0,
  };
}

/**
 * Automatically picks the starting quality tier from deviceProfile.
 */
export function getInitialQuality(device: DeviceProfile): QualityTier {
  if (device.isSoftwareGl || device.gpuTier === 0) {
    return 'lite';
  }
  if (device.deviceClass === 'phone') {
    if (device.gpuTier >= 2) {
      return 'balanced';
    }
    return 'performance';
  }
  // Desktop
  if (device.gpuTier >= 3) {
    return 'ultra';
  }
  if (device.gpuTier === 2) {
    return 'balanced';
  }
  return 'performance';
}

const QUALITY_STORAGE_KEY = 'arkvoid.quality';

/**
 * Loads user quality preference from localStorage.
 */
export function loadUserQualityPreference(): UserQualityPreference {
  if (typeof window === 'undefined' || !window.localStorage) {
    return 'auto';
  }
  try {
    const raw = window.localStorage.getItem(QUALITY_STORAGE_KEY);
    if (raw === 'cinematic' || raw === 'performance' || raw === 'auto') {
      return raw;
    }
  } catch {
    // Ignore storage access errors
  }
  return 'auto';
}

/**
 * Saves user quality preference to localStorage.
 */
export function saveUserQualityPreference(preference: UserQualityPreference): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(QUALITY_STORAGE_KEY, preference);
  } catch {
    // Ignore storage write errors
  }
}

/**
 * Resolves active quality tier from user setting and device profile.
 * - 'auto': picks starting tier from deviceProfile
 * - 'cinematic': forces Ultra on desktop, Balanced on mobile
 * - 'performance': forces Performance
 */
export function resolveEffectiveTier(
  preference: UserQualityPreference,
  device: DeviceProfile,
): QualityTier {
  if (preference === 'cinematic') {
    return device.deviceClass === 'phone' ? 'balanced' : 'ultra';
  }
  if (preference === 'performance') {
    return 'performance';
  }
  return getInitialQuality(device);
}
