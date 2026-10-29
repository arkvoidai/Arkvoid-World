import * as THREE from 'three';

export type RailEase = 'linear' | 'easeInOut' | 'easeIn' | 'easeOut';

export interface CameraRailKeyframe {
  readonly position: readonly [number, number, number];
  readonly lookAt: readonly [number, number, number];
  readonly fov: number;
  readonly time: number; // seconds from rail start
  readonly ease?: RailEase;
}

export interface CameraRailDef {
  readonly id: string;
  readonly name: string;
  readonly duration: number; // total duration in seconds
  readonly keyframes: readonly CameraRailKeyframe[];
}

export interface PlayRailOptions {
  readonly loop?: boolean;
  readonly onDone?: () => void;
  readonly handheldDrift?: boolean;
}

function applyEase(t: number, ease?: RailEase): number {
  const clamped = Math.max(0, Math.min(1, t));
  switch (ease) {
    case 'linear':
      return clamped;
    case 'easeIn':
      return clamped * clamped;
    case 'easeOut':
      return 1 - (1 - clamped) * (1 - clamped);
    case 'easeInOut':
    default:
      return clamped * clamped * (3 - 2 * clamped);
  }
}

// 1. Arrival: 9-second descent from above the clouds through mist to the spawn, ending in hero view of the hall
export const ARRIVAL_RAIL: CameraRailDef = {
  id: 'arrival',
  name: 'Arrival Descent',
  duration: 9.0,
  keyframes: [
    {
      time: 0.0,
      position: [0.0, 48.0, 65.0],
      lookAt: [0.0, 10.0, -10.0],
      fov: 65,
      ease: 'easeInOut',
    },
    {
      time: 3.5,
      position: [0.0, 18.0, 38.0],
      lookAt: [0.0, 5.0, -12.0],
      fov: 58,
      ease: 'easeInOut',
    },
    {
      time: 6.5,
      position: [0.0, 4.2, 22.0],
      lookAt: [0.0, 3.2, -14.0],
      fov: 52,
      ease: 'easeInOut',
    },
    {
      time: 9.0,
      position: [0.0, 2.4, 15.0],
      lookAt: [0.0, 2.8, -16.0],
      fov: 48,
      ease: 'easeOut',
    },
  ],
};

// 2. Orbit: 30-second slow loop for idle attract
export const ORBIT_RAIL: CameraRailDef = {
  id: 'orbit',
  name: 'Plaza & Hall Orbit',
  duration: 30.0,
  keyframes: [
    {
      time: 0.0,
      position: [0.0, 14.0, 38.0],
      lookAt: [0.0, 3.0, -4.0],
      fov: 50,
      ease: 'easeInOut',
    },
    {
      time: 7.5,
      position: [34.0, 12.0, 10.0],
      lookAt: [2.0, 3.0, -4.0],
      fov: 50,
      ease: 'easeInOut',
    },
    {
      time: 15.0,
      position: [0.0, 16.0, -34.0],
      lookAt: [0.0, 3.0, -6.0],
      fov: 50,
      ease: 'easeInOut',
    },
    {
      time: 22.5,
      position: [-34.0, 12.0, 10.0],
      lookAt: [0.0, 3.0, -4.0],
      fov: 50,
      ease: 'easeInOut',
    },
    {
      time: 30.0,
      position: [0.0, 14.0, 38.0],
      lookAt: [0.0, 3.0, -4.0],
      fov: 50,
      ease: 'easeInOut',
    },
  ],
};

// 3. Bridge-cross: 12-second glide along the bridge to island B
export const BRIDGE_CROSS_RAIL: CameraRailDef = {
  id: 'bridge-cross',
  name: 'Bridge Crossing Glide',
  duration: 12.0,
  keyframes: [
    {
      time: 0.0,
      position: [14.0, 3.2, -4.0],
      lookAt: [35.0, 3.0, -18.0],
      fov: 50,
      ease: 'easeInOut',
    },
    {
      time: 4.0,
      position: [24.0, 4.2, -10.0],
      lookAt: [48.0, 2.8, -24.0],
      fov: 48,
      ease: 'easeInOut',
    },
    {
      time: 8.0,
      position: [38.0, 3.8, -18.0],
      lookAt: [58.0, 2.5, -28.0],
      fov: 48,
      ease: 'easeInOut',
    },
    {
      time: 12.0,
      position: [52.0, 2.4, -26.0],
      lookAt: [70.0, 2.0, -32.0],
      fov: 52,
      ease: 'easeOut',
    },
  ],
};

export const BUILT_IN_RAILS: Record<string, CameraRailDef> = {
  arrival: ARRIVAL_RAIL,
  orbit: ORBIT_RAIL,
  'bridge-cross': BRIDGE_CROSS_RAIL,
};

export class CameraRailController {
  private currentRail: CameraRailDef | null = null;
  private currentTime = 0;
  private isLooping = false;
  private handheld = true;
  private onCompleteCallback: (() => void) | null = null;
  private playing = false;

  // Working vectors
  private readonly posStart = new THREE.Vector3();
  private readonly posEnd = new THREE.Vector3();
  private readonly lookStart = new THREE.Vector3();
  private readonly lookEnd = new THREE.Vector3();
  private readonly currentPos = new THREE.Vector3();
  private readonly currentLook = new THREE.Vector3();

  play(rail: CameraRailDef, options?: PlayRailOptions): void {
    this.currentRail = rail;
    this.currentTime = 0;
    this.isLooping = options?.loop ?? false;
    this.handheld = options?.handheldDrift ?? true;
    this.onCompleteCallback = options?.onDone ?? null;
    this.playing = true;
  }

  stop(): void {
    this.playing = false;
    this.currentRail = null;
    this.currentTime = 0;
    this.onCompleteCallback = null;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  getCurrentTime(): number {
    return this.currentTime;
  }

  getDuration(): number {
    return this.currentRail?.duration ?? 0;
  }

  /**
   * Updates camera position, lookAt, and FOV according to current rail keyframes.
   * Returns true if rail is still playing.
   */
  update(dt: number, camera: THREE.PerspectiveCamera): boolean {
    if (!this.playing || !this.currentRail) {
      return false;
    }

    this.currentTime += dt;
    const duration = this.currentRail.duration;

    if (this.currentTime >= duration) {
      if (this.isLooping) {
        this.currentTime = this.currentTime % duration;
      } else {
        this.currentTime = duration;
        this.evaluateAt(this.currentTime, camera);
        const cb = this.onCompleteCallback;
        this.stop();
        cb?.();
        return false;
      }
    }

    this.evaluateAt(this.currentTime, camera);
    return true;
  }

  /**
   * Evaluates camera position and orientation at an arbitrary time along the rail.
   */
  evaluateAt(time: number, camera: THREE.PerspectiveCamera): void {
    if (!this.currentRail) return;
    const kfs = this.currentRail.keyframes;
    if (kfs.length === 0) return;

    if (kfs.length === 1 || time <= kfs[0]!.time) {
      const kf = kfs[0]!;
      camera.position.set(kf.position[0], kf.position[1], kf.position[2]);
      camera.lookAt(kf.lookAt[0], kf.lookAt[1], kf.lookAt[2]);
      camera.fov = kf.fov;
      camera.updateProjectionMatrix();
      return;
    }

    const lastKf = kfs[kfs.length - 1]!;
    if (time >= lastKf.time) {
      camera.position.set(lastKf.position[0], lastKf.position[1], lastKf.position[2]);
      camera.lookAt(lastKf.lookAt[0], lastKf.lookAt[1], lastKf.lookAt[2]);
      camera.fov = lastKf.fov;
      camera.updateProjectionMatrix();
      return;
    }

    // Find keyframe interval [i, i+1]
    let idx = 0;
    for (let i = 0; i < kfs.length - 1; i++) {
      if (time >= kfs[i]!.time && time <= kfs[i + 1]!.time) {
        idx = i;
        break;
      }
    }

    const kfA = kfs[idx]!;
    const kfB = kfs[idx + 1]!;
    const segDuration = Math.max(0.0001, kfB.time - kfA.time);
    const rawT = (time - kfA.time) / segDuration;
    const easedT = applyEase(rawT, kfA.ease);

    this.posStart.set(kfA.position[0], kfA.position[1], kfA.position[2]);
    this.posEnd.set(kfB.position[0], kfB.position[1], kfB.position[2]);
    this.lookStart.set(kfA.lookAt[0], kfA.lookAt[1], kfA.lookAt[2]);
    this.lookEnd.set(kfB.lookAt[0], kfB.lookAt[1], kfB.lookAt[2]);

    // Interpolate positions
    this.currentPos.lerpVectors(this.posStart, this.posEnd, easedT);
    this.currentLook.lerpVectors(this.lookStart, this.lookEnd, easedT);
    const fov = kfA.fov + (kfB.fov - kfA.fov) * easedT;

    // Optional gentle handheld drift (0.3%)
    if (this.handheld) {
      const driftScale = 0.003;
      const t = this.currentTime;
      const driftX = Math.sin(t * 0.73) * driftScale * 2.0;
      const driftY = Math.cos(t * 0.91) * driftScale * 2.0;
      const driftZ = Math.sin(t * 0.62) * driftScale * 2.0;
      this.currentPos.x += driftX;
      this.currentPos.y += driftY;
      this.currentPos.z += driftZ;
    }

    camera.position.copy(this.currentPos);
    camera.lookAt(this.currentLook);
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
}
