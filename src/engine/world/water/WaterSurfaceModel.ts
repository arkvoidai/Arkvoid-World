export type WaterPreset = 'river' | 'lake' | 'cavern';
export interface WaterColor { r: number; g: number; b: number }
function mix(a: number, b: number, t: number): number { return a + (b - a) * t; }

export function waterAbsorptionColor(depthMeters: number, preset: WaterPreset = 'river'): WaterColor {
  const depth = Math.max(0, depthMeters);
  const shallow = preset === 'cavern' ? { r: 0.12, g: 0.28, b: 0.34 } : { r: 0.31, g: 0.70, b: 0.75 };
  const deep = preset === 'cavern' ? { r: 0.025, g: 0.055, b: 0.09 } : { r: 0.12, g: 0.37, b: 0.48 };
  const absorption = 1 - Math.exp(-depth * (preset === 'cavern' ? 0.72 : 0.38));
  return {
    r: mix(shallow.r, deep.r, absorption),
    g: mix(shallow.g, deep.g, absorption),
    b: mix(shallow.b, deep.b, absorption),
  };
}

export function riverWetness(distanceToShoreMeters: number): number {
  const t = Math.max(0, Math.min(1, (2.8 - distanceToShoreMeters) / 2.4));
  return t * t * (3 - 2 * t);
}
export type WaterfallLod = 'near' | 'mid' | 'far';
export function waterfallLod(distanceMeters: number): WaterfallLod {
  if (distanceMeters < 120) return 'near';
  if (distanceMeters < 1500) return 'mid';
  return 'far';
}
export function waterfallLodBlend(distanceMeters: number, width = 18): { current: WaterfallLod; blend: number } {
  const current = waterfallLod(distanceMeters);
  const boundary = current === 'near' ? 120 : current === 'mid' ? 1500 : Infinity;
  if (!Number.isFinite(boundary)) return { current, blend: 1 };
  const t = Math.max(0, Math.min(1, (distanceMeters - (boundary - width)) / width));
  return { current, blend: t * t * (3 - 2 * t) };
}
