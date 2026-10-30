import { OriginOffset, setOriginOffset, type WorldPos } from '@/engine/world/atlas/Coordinates';

export const ORIGIN_REBASE_DISTANCE = 400;
export const ORIGIN_GRID_SIZE = 128;

export interface RebaseResult {
  changed: boolean;
  previous: WorldPos;
  current: WorldPos;
  delta: WorldPos;
}

export function rebaseOrigin(cameraWorld: WorldPos): RebaseResult {
  const previous = { x: OriginOffset.x, y: OriginOffset.y, z: OriginOffset.z };
  const distance = Math.hypot(cameraWorld.x - previous.x, cameraWorld.y - previous.y, cameraWorld.z - previous.z);
  if (distance <= ORIGIN_REBASE_DISTANCE) {
    return { changed: false, previous, current: previous, delta: { x: 0, y: 0, z: 0 } };
  }
  const snap = (value: number) => Math.round(value / ORIGIN_GRID_SIZE) * ORIGIN_GRID_SIZE;
  const current = { x: snap(cameraWorld.x), y: snap(cameraWorld.y), z: snap(cameraWorld.z) };
  setOriginOffset(current);
  return {
    changed: true,
    previous,
    current,
    delta: { x: current.x - previous.x, y: current.y - previous.y, z: current.z - previous.z },
  };
}

export function resetOrigin(): void {
  setOriginOffset({ x: 0, y: 0, z: 0 });
}
