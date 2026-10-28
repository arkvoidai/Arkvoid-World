import type { TextureSlotId } from '@/config/assets';

export interface TextureSlotTuning {
  uvScaleMeters: number;
  normalScale: number;
  nominalRoughness: number;
  targetMeanLuminance: number;
  tintMultiplier: string;
}

export const TEXTURE_TUNING: Record<TextureSlotId, TextureSlotTuning> = {
  grass: {
    uvScaleMeters: 3.0,
    normalScale: 1.0,
    nominalRoughness: 0.9,
    targetMeanLuminance: 0.38,
    tintMultiplier: '#FFFFFF',
  },
  moss: {
    uvScaleMeters: 2.0,
    normalScale: 1.1,
    nominalRoughness: 0.95,
    targetMeanLuminance: 0.30,
    tintMultiplier: '#FFFFFF',
  },
  rock: {
    uvScaleMeters: 4.0,
    normalScale: 1.4,
    nominalRoughness: 0.85,
    targetMeanLuminance: 0.52,
    tintMultiplier: '#FFFFFF',
  },
  path: {
    uvScaleMeters: 2.5,
    normalScale: 1.2,
    nominalRoughness: 0.8,
    targetMeanLuminance: 0.60,
    tintMultiplier: '#FFFFFF',
  },
  bark: {
    uvScaleMeters: 1.2,
    normalScale: 1.5,
    nominalRoughness: 0.9,
    targetMeanLuminance: 0.33,
    tintMultiplier: '#FFFFFF',
  },
  timber: {
    uvScaleMeters: 1.5,
    normalScale: 1.0,
    nominalRoughness: 0.65,
    targetMeanLuminance: 0.27,
    tintMultiplier: '#FFFFFF',
  },
  roof: {
    uvScaleMeters: 2.0,
    normalScale: 1.2,
    nominalRoughness: 0.55,
    targetMeanLuminance: 0.30,
    tintMultiplier: '#FFFFFF',
  },
  plaster: {
    uvScaleMeters: 3.0,
    normalScale: 0.7,
    nominalRoughness: 0.9,
    targetMeanLuminance: 0.80,
    tintMultiplier: '#FFFFFF',
  },
  stone: {
    uvScaleMeters: 2.0,
    normalScale: 1.2,
    nominalRoughness: 0.8,
    targetMeanLuminance: 0.62,
    tintMultiplier: '#FFFFFF',
  },
};
