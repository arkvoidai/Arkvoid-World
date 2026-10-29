import * as THREE from 'three';
import { Wanderer, type WandererConfig } from '@/engine/actors/Wanderer';
import type { DeviceProfile } from '@/lib/deviceProfile';

export interface PoolWandererEntry {
  id: string;
  wanderer: Wanderer;
  active: boolean;
  distanceToCamera: number;
  lod: 'near' | 'mid' | 'far';
  targetPos: THREE.Vector3;
  targetSpeed: number;
}

export class WandererPool {
  private readonly maxNear: number;
  private readonly pool: PoolWandererEntry[] = [];
  readonly group = new THREE.Group();

  constructor(device: DeviceProfile) {
    this.group.name = 'WandererPoolGroup';
    // Max 8 near on desktop, 4 on phone
    this.maxNear = device.deviceClass === 'phone' ? 4 : 8;
  }

  /**
   * Acquire an existing or new Wanderer instance.
   */
  spawn(id: string, config: WandererConfig = {}): Wanderer {
    let entry = this.pool.find((e) => e.id === id);
    if (!entry) {
      const wanderer = new Wanderer(config);
      entry = {
        id,
        wanderer,
        active: true,
        distanceToCamera: 0,
        lod: 'near',
        targetPos: new THREE.Vector3(),
        targetSpeed: 0,
      };
      this.pool.push(entry);
      this.group.add(wanderer);
    } else {
      entry.active = true;
      entry.wanderer.visible = true;
    }
    return entry.wanderer;
  }

  get(id: string): Wanderer | undefined {
    return this.pool.find((e) => e.id === id)?.wanderer;
  }

  release(id: string): void {
    const entry = this.pool.find((e) => e.id === id);
    if (entry) {
      entry.active = false;
      entry.wanderer.visible = false;
    }
  }

  getActiveCount(): number {
    return this.pool.filter((e) => e.active).length;
  }

  getNearCount(): number {
    return this.pool.filter((e) => e.active && e.lod === 'near').length;
  }

  /**
   * Update distances, assign LODs according to proximity & budgets, and tick active instances.
   */
  update(
    dt: number,
    cameraPos: THREE.Vector3,
    windVector?: THREE.Vector2,
    getTerrainY?: (x: number, z: number) => number,
  ): void {
    const activeEntries = this.pool.filter((e) => e.active);

    // 1. Calculate distance to camera
    for (const e of activeEntries) {
      e.distanceToCamera = e.wanderer.position.distanceTo(cameraPos);
    }

    // 2. Sort by distance ascending to allocate Near budget to closest actors
    activeEntries.sort((a, b) => a.distanceToCamera - b.distanceToCamera);

    let nearCount = 0;
    for (const e of activeEntries) {
      const dist = e.distanceToCamera;
      if (dist < 14 && nearCount < this.maxNear) {
        e.lod = 'near';
        nearCount++;
      } else if (dist < 40) {
        e.lod = 'mid';
      } else {
        e.lod = 'far';
      }

      // Hide if beyond 90m
      if (dist > 90) {
        e.wanderer.visible = false;
        continue;
      }
      e.wanderer.visible = true;

      // Ground height
      const gy = getTerrainY ? getTerrainY(e.wanderer.position.x, e.wanderer.position.z) : 0;

      // Update wanderer
      e.wanderer.update(dt, e.targetSpeed, windVector, gy);
    }
  }

  dispose(): void {
    for (const e of this.pool) {
      e.wanderer.dispose();
      this.group.remove(e.wanderer);
    }
    this.pool.length = 0;
  }
}
