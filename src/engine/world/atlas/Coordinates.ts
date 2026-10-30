export interface WorldPos { x: number; y: number; z: number }
export interface LocalPos { x: number; y: number; z: number }

/** Float64 world-space offset. Zero until a coordinated runtime rebase is applied. */
export const OriginOffset: WorldPos = { x: 0, y: 0, z: 0 };

export function setOriginOffset(next: WorldPos): void {
  if (![next.x, next.y, next.z].every(Number.isFinite)) throw new RangeError('Origin offset must be finite');
  OriginOffset.x = next.x;
  OriginOffset.y = next.y;
  OriginOffset.z = next.z;
}

export function toLocal(world: WorldPos): LocalPos {
  return { x: world.x - OriginOffset.x, y: world.y - OriginOffset.y, z: world.z - OriginOffset.z };
}

export function toWorld(local: LocalPos): WorldPos {
  return { x: local.x + OriginOffset.x, y: local.y + OriginOffset.y, z: local.z + OriginOffset.z };
}

export function distance(a: WorldPos, b: WorldPos): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function distanceXZ(a: WorldPos, b: WorldPos): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function lerpWorld(a: WorldPos, b: WorldPos, t: number): WorldPos {
  const u = Math.max(0, Math.min(1, t));
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u };
}

export function cellKey128(x: number, z: number): string {
  if (!Number.isFinite(x) || !Number.isFinite(z)) throw new RangeError('World coordinates must be finite');
  return Math.floor(x / 128) + ':' + Math.floor(z / 128);
}

/** Matches the bounds already enforced by public.save_position in Supabase. */
export function isWorldPositionWithinDatabaseBounds(pos: WorldPos): boolean {
  return Number.isFinite(pos.x) && Number.isFinite(pos.y) && Number.isFinite(pos.z) &&
    Math.abs(pos.x) <= 60000 && Math.abs(pos.z) <= 60000 &&
    pos.y >= -4000 && pos.y <= 9000;
}
