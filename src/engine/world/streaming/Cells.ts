import type { WorldPos } from '@/engine/world/atlas/Coordinates';

export const CELL_SIZE = 128;
export const SUPERCELL_SIZE = 512;
export const MEGACELL_SIZE = 2048;
export type CellLevel = 0 | 1 | 2;
export type CellRing = 0 | 1 | 2 | 3 | 4;
export interface CellKey { level: CellLevel; ix: number; iz: number }
export interface CellBounds { minX: number; maxX: number; minZ: number; maxZ: number }

const SIZES: Record<CellLevel, number> = { 0: CELL_SIZE, 1: SUPERCELL_SIZE, 2: MEGACELL_SIZE };

export function cellKey(x: number, z: number, level: CellLevel = 0): CellKey {
  if (!Number.isFinite(x) || !Number.isFinite(z)) throw new RangeError('Cell coordinates must be finite');
  const size = SIZES[level];
  return { level, ix: Math.floor(x / size), iz: Math.floor(z / size) };
}

export function cellKeyId(key: CellKey): string {
  return key.level + ':' + key.ix + ':' + key.iz;
}

export function parseCellKeyId(id: string): CellKey | null {
  const parts = id.split(':');
  if (parts.length !== 3) return null;
  const level = Number(parts[0]);
  const ix = Number(parts[1]);
  const iz = Number(parts[2]);
  if ((level !== 0 && level !== 1 && level !== 2) || !Number.isInteger(ix) || !Number.isInteger(iz)) return null;
  return { level, ix, iz };
}

export function cellBounds(key: CellKey): CellBounds {
  const size = SIZES[key.level];
  const minX = key.ix * size;
  const minZ = key.iz * size;
  return { minX, maxX: minX + size, minZ, maxZ: minZ + size };
}

export function cellCenter(key: CellKey): WorldPos {
  const b = cellBounds(key);
  return { x: (b.minX + b.maxX) * 0.5, y: 0, z: (b.minZ + b.maxZ) * 0.5 };
}

export function distanceToCell(position: WorldPos, key: CellKey): number {
  const b = cellBounds(key);
  const dx = Math.max(b.minX - position.x, 0, position.x - b.maxX);
  const dz = Math.max(b.minZ - position.z, 0, position.z - b.maxZ);
  return Math.hypot(dx, dz);
}

export function ringRadius(ring: CellRing, qualityScale = 1): number {
  const scale = Math.max(0.6, Math.min(1, qualityScale));
  const radii = [192, 512, 1600, 8000, 40000] as const;
  return radii[ring] * scale;
}

export function ringForDistance(distanceMeters: number, qualityScale = 1): CellRing {
  if (distanceMeters <= ringRadius(0, qualityScale)) return 0;
  if (distanceMeters <= ringRadius(1, qualityScale)) return 1;
  if (distanceMeters <= ringRadius(2, qualityScale)) return 2;
  if (distanceMeters <= ringRadius(3, qualityScale)) return 3;
  return 4;
}

export function shouldUnloadCell(distanceMeters: number, currentRing: CellRing, qualityScale = 1): boolean {
  if (currentRing === 0) return false;
  return distanceMeters > ringRadius(currentRing, qualityScale) * 1.15;
}
