export interface TextureSlotConfig {
  diff: string;
  nor: string;
  arm?: string;
  uvScaleMeters: number;
  nominalRoughness: number;
}

export type TextureSlotId =
  | 'grass'
  | 'moss'
  | 'rock'
  | 'path'
  | 'bark'
  | 'timber'
  | 'roof'
  | 'plaster'
  | 'stone';

export const TEXTURE_SLOTS: Record<TextureSlotId, TextureSlotConfig> = {
  grass: {
    diff: 'grass_diff.jpg',
    nor: 'grass_nor.jpg',
    arm: 'grass_arm.jpg',
    uvScaleMeters: 3.0,
    nominalRoughness: 0.9,
  },
  moss: {
    diff: 'moss_diff.jpg',
    nor: 'moss_nor.jpg',
    arm: 'moss_arm.jpg',
    uvScaleMeters: 2.0,
    nominalRoughness: 0.95,
  },
  rock: {
    diff: 'rock_diff.jpg',
    nor: 'rock_nor.jpg',
    arm: 'rock_arm.jpg',
    uvScaleMeters: 4.0,
    nominalRoughness: 0.85,
  },
  path: {
    diff: 'path_diff.jpg',
    nor: 'path_nor.jpg',
    arm: 'path_arm.jpg',
    uvScaleMeters: 2.5,
    nominalRoughness: 0.8,
  },
  bark: {
    diff: 'bark_diff.jpg',
    nor: 'bark_nor.jpg',
    arm: 'bark_arm.jpg',
    uvScaleMeters: 1.2,
    nominalRoughness: 0.9,
  },
  timber: {
    diff: 'timber_diff.jpg',
    nor: 'timber_nor.jpg',
    arm: 'timber_arm.jpg',
    uvScaleMeters: 1.5,
    nominalRoughness: 0.65,
  },
  roof: {
    diff: 'roof_diff.jpg',
    nor: 'roof_nor.jpg',
    arm: 'roof_arm.jpg',
    uvScaleMeters: 2.0,
    nominalRoughness: 0.55,
  },
  plaster: {
    diff: 'plaster_diff.jpg',
    nor: 'plaster_nor.jpg',
    arm: 'plaster_arm.jpg',
    uvScaleMeters: 3.0,
    nominalRoughness: 0.9,
  },
  stone: {
    diff: 'stone_diff.jpg',
    nor: 'stone_nor.jpg',
    arm: 'stone_arm.jpg',
    uvScaleMeters: 2.0,
    nominalRoughness: 0.8,
  },
};

export const TEXTURE_SLOT_PRIORITY: TextureSlotId[] = [
  'grass',
  'rock',
  'path',
  'moss',
  'stone',
  'timber',
  'roof',
  'plaster',
  'bark',
];
