export interface MountainSpine {
  points: readonly { x: number; z: number }[];
  radius: number;
  height: number;
  seed: number;
}

export const VEILED_PEAK_SPINES: readonly MountainSpine[] = [
  { points: [{ x: 2900, z: -1800 }, { x: 4300, z: -2400 }, { x: 6100, z: -3100 }, { x: 8400, z: -3800 }], radius: 1250, height: 3300, seed: 101 },
  { points: [{ x: 3100, z: -4700 }, { x: 4700, z: -4300 }, { x: 6400, z: -5100 }, { x: 9000, z: -5600 }], radius: 1050, height: 2850, seed: 211 },
  { points: [{ x: 5200, z: -900 }, { x: 6800, z: -1700 }, { x: 8200, z: -2700 }], radius: 900, height: 2400, seed: 307 },
];

function hash2(x: number, z: number, seed: number): number {
  const n = Math.sin(x * 127.1 + z * 311.7 + seed * 74.7) * 43758.5453123;
  return n - Math.floor(n);
}

function valueNoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const v = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}

export function ridgedFbm(x: number, z: number, seed = 1, octaves = 6): number {
  let sum = 0, amplitude = 0.55, frequency = 1, total = 0;
  for (let i = 0; i < octaves; i++) {
    const noise = valueNoise(x * frequency, z * frequency, seed + i * 17);
    const ridge = 1 - Math.abs(noise * 2 - 1);
    sum += ridge * ridge * amplitude;
    total += amplitude;
    frequency *= 2.05;
    amplitude *= 0.5;
  }
  return total > 0 ? sum / total : 0;
}

function distanceToSpine(x: number, z: number, spine: MountainSpine): number {
  let best = Infinity;
  for (let i = 0; i < spine.points.length - 1; i++) {
    const a = spine.points[i]!, b = spine.points[i + 1]!;
    const dx = b.x - a.x, dz = b.z - a.z;
    const lenSq = dx * dx + dz * dz;
    const t = lenSq > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / lenSq)) : 0;
    best = Math.min(best, Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)));
  }
  return best;
}

/** Stable sample used for far-range and planned-region preview generation. */
export function sampleVeiledPeaksHeight(x: number, z: number): number {
  let height = 26 + (valueNoise(x * 0.00022, z * 0.00022, 919) - 0.5) * 120;
  for (const spine of VEILED_PEAK_SPINES) {
    const d = distanceToSpine(x, z, spine);
    const mask = Math.exp(-Math.pow(d / spine.radius, 1.7));
    const ridges = 0.42 + ridgedFbm(x * 0.0015, z * 0.0015, spine.seed) * 0.88;
    height = Math.max(height, 26 + spine.height * mask * ridges);
  }
  const valley = valueNoise(x * 0.0007, z * 0.0007, 613) * 0.12;
  return Math.max(20, Math.min(3400, height * (1 - valley)));
}
