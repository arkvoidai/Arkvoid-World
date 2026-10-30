import * as THREE from 'three';
import { resolveMove, heightAt, isOnBridge } from '@/engine/world/collision';
import {
  SPAWN,
  ISLANDS,
  type IslandKey,
  islandRadiusAtAngle,
} from '@/engine/world/layout';
import { terrainGradient, pathDistance } from '@/engine/world/terrain';
import type { Wanderer } from '@/engine/actors/Wanderer';
import type { SurfaceKind, AnimationStateName } from '@/engine/actors/Animator';
import type { InputState } from '@/engine/locomotion/Input';

export type LocomotionState =
  | 'idle'
  | 'walk'
  | 'run'
  | 'talk'
  | 'sit'
  | 'gather'
  | 'transition';

export interface PlayerSnapshot {
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  facing: number;
  speed01: number;
  grounded: boolean;
  surface: SurfaceKind;
  state: LocomotionState;
}

export interface PlayerControllerOptions {
  assistedMovement?: boolean;
  onEdgeToast?: (message: string) => void;
  onFootstep?: (surface: SurfaceKind, position: THREE.Vector3) => void;
}

export class PlayerController {
  // Physical constants
  readonly radius = 0.3; // m
  readonly height = 1.7; // m
  readonly walkSpeed = 2.0; // m/s
  readonly runSpeed = 3.6; // m/s
  readonly acceleration = 7.0; // m/s2
  readonly deceleration = 12.0; // m/s2

  // Transform and kinematics
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  facing = 0; // radians (0 = facing -z)
  targetFacing = 0;
  grounded = true;
  surface: SurfaceKind = 'stone';
  speed01 = 0;

  // Smoothing state
  private smoothGroundY = 0;
  private currentSpeed = 0;
  private lastMoveDirX = 0;
  private lastMoveDirZ = -1;

  // State machine
  private state: LocomotionState = 'idle';
  private readonly lockReasons = new Set<string>();

  // Edge warning rate limit (1 per minute)
  private lastEdgeToastTime = -999;

  // Controlled Wanderer visual actor
  wanderer?: Wanderer;
  options: PlayerControllerOptions;

  // Reused snapshot object to avoid allocations
  private readonly snapshot: PlayerSnapshot = {
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    facing: 0,
    speed01: 0,
    grounded: true,
    surface: 'stone',
    state: 'idle',
  };

  // Scratch vectors
  private readonly scratchDelta = { x: 0, z: 0 };

  constructor(wanderer?: Wanderer, options: PlayerControllerOptions = {}) {
    this.wanderer = wanderer;
    this.options = options;

    const spawnY = heightAt(SPAWN.position.x, SPAWN.position.z) ?? 0;
    this.position.set(SPAWN.position.x, spawnY, SPAWN.position.z);
    this.facing = SPAWN.yaw;
    this.targetFacing = SPAWN.yaw;
    this.lastMoveDirX = -Math.sin(SPAWN.yaw);
    this.lastMoveDirZ = -Math.cos(SPAWN.yaw);
    this.smoothGroundY = spawnY;

    if (this.wanderer) {
      this.wanderer.position.copy(this.position);
      this.wanderer.rotation.y = this.facing;
      this.wanderer.animator.surfaceQuery = (x, z) => this.querySurface(x, z);
      this.wanderer.animator.onFootstep = (evt) => {
        this.options.onFootstep?.(evt.surface, evt.position);
      };
    }
  }

  teleport(x: number, y: number, z: number, facing?: number): void {
    this.position.set(x, y, z);
    this.smoothGroundY = y;
    this.velocity.set(0, 0, 0);
    this.currentSpeed = 0;
    this.speed01 = 0;
    if (facing !== undefined) {
      this.facing = facing;
      this.targetFacing = facing;
    }
    this.lastMoveDirX = -Math.sin(this.facing);
    this.lastMoveDirZ = -Math.cos(this.facing);
    if (this.wanderer) {
      this.wanderer.position.copy(this.position);
      this.wanderer.rotation.y = this.facing;
    }
  }

  lock(reason: string): void {
    this.lockReasons.add(reason);
    this.velocity.set(0, 0, 0);
    this.currentSpeed = 0;
    this.speed01 = 0;
  }

  unlock(reason: string): void {
    this.lockReasons.delete(reason);
  }

  isLocked(): boolean {
    return this.lockReasons.size > 0;
  }

  setState(newState: LocomotionState): void {
    if (this.state === newState) return;
    this.state = newState;
    if (this.wanderer) {
      // Map to wanderer animation state
      let animState: AnimationStateName = 'idle';
      if (newState === 'walk') animState = 'walk';
      else if (newState === 'run') animState = 'run';
      else if (newState === 'talk') animState = 'talk';
      else if (newState === 'sit') animState = 'sit-meditate';
      else if (newState === 'gather') animState = 'gather';
      this.wanderer.setAnimationState(animState, 0.15);
    }
  }

  getState(): LocomotionState {
    return this.state;
  }

  /**
   * Surface query for footstep sound and visuals.
   */
  querySurface(x: number, z: number): SurfaceKind {
    if (isOnBridge(x, z)) return 'wood';
    if (Math.hypot(x, z) < 10) return 'stone'; // Plaza
    if (pathDistance(x, z) < 1.25) return 'stone';
    // Hall interior platform
    if (x >= 8 && x <= 32 && z >= -13 && z <= 1) return 'stone';
    return 'grass';
  }

  /**
   * Main per-frame update loop.
   */
  update(
    dt: number,
    input: InputState,
    cameraYaw: number,
    windVector?: THREE.Vector2,
    nowSeconds = performance.now() * 0.001,
  ): void {
    const clampedDt = Math.min(dt, 0.05);

    // If locked by dialogue/sit/gather, hold position
    if (this.isLocked()) {
      this.velocity.set(0, 0, 0);
      this.currentSpeed = 0;
      this.speed01 = 0;
      if (this.wanderer) {
        this.wanderer.update(clampedDt, 0, windVector, this.position.y);
      }
      return;
    }

    // 1. Calculate desired movement direction relative to camera yaw
    const hasMoveInput = Math.hypot(input.moveX, input.moveY) > 0.05;
    let targetSpeed = 0;
    let moveDirX = 0;
    let moveDirZ = 0;

    if (hasMoveInput) {
      const maxSpeed = input.run ? this.runSpeed : this.walkSpeed;
      const inputMag = Math.min(1.0, Math.hypot(input.moveX, input.moveY));
      targetSpeed = inputMag * maxSpeed;

      // Transform input vector by camera yaw
      // Camera looking forward is in direction -sin(cameraYaw), -cos(cameraYaw)
      const sinYaw = Math.sin(cameraYaw);
      const cosYaw = Math.cos(cameraYaw);

      // moveX: +1 right, -1 left
      // moveY: +1 forward, -1 backward
      moveDirX = input.moveX * cosYaw - input.moveY * sinYaw;
      moveDirZ = -input.moveX * sinYaw - input.moveY * cosYaw;

      const len = Math.hypot(moveDirX, moveDirZ);
      if (len > 0.001) {
        moveDirX /= len;
        moveDirZ /= len;
        this.lastMoveDirX = moveDirX;
        this.lastMoveDirZ = moveDirZ;
        this.targetFacing = Math.atan2(-moveDirX, -moveDirZ);
      }
    } else {
      // Keep the last travel direction while decelerating. Zeroing the direction
      // here made the avatar stop in one frame while its run animation continued.
      moveDirX = this.lastMoveDirX;
      moveDirZ = this.lastMoveDirZ;
    }

    // 2. Island edge proximity (t = 0.93)
    const edgeT = this.evaluateIslandEdgeT(this.position.x, this.position.z);
    if (edgeT > 0.93 && !isOnBridge(this.position.x, this.position.z)) {
      // Soft slowdown near mist rim
      const slowdown = Math.max(0.0, 1.0 - (edgeT - 0.93) / 0.07);
      targetSpeed *= slowdown;

      if (nowSeconds - this.lastEdgeToastTime > 60.0) {
        this.lastEdgeToastTime = nowSeconds;
        this.options.onEdgeToast?.('The mist is too thick to go further.');
      }
    }

    // 3. Slope check for speed reduction on steep terrain
    const onBridge = isOnBridge(this.position.x, this.position.z);
    if (!onBridge) {
      const grad = terrainGradient(this.position.x, this.position.z);
      if (grad.slopeDeg > 30.0) {
        const slopeFactor = Math.max(0.3, 1.0 - (grad.slopeDeg - 30.0) / 10.0);
        targetSpeed *= slopeFactor;
      }
    }

    // 4. Smooth Acceleration / Deceleration
    const accelRate = targetSpeed > this.currentSpeed ? this.acceleration : this.deceleration;
    const response = 1.0 - Math.exp(-clampedDt * accelRate);
    this.currentSpeed += (targetSpeed - this.currentSpeed) * response;
    if (this.currentSpeed < 0.015) this.currentSpeed = 0;

    this.velocity.x = moveDirX * this.currentSpeed;
    this.velocity.z = moveDirZ * this.currentSpeed;
    this.speed01 = THREE.MathUtils.clamp(this.currentSpeed / this.runSpeed, 0, 1);

    // 5. Critically damped turn towards target facing
    // 0.12 s damping time (slower and smoother if assistedMovement is true)
    const turnDamping = this.options.assistedMovement ? 0.34 : 0.28;
    const angleDiff = Math.atan2(
      Math.sin(this.targetFacing - this.facing),
      Math.cos(this.targetFacing - this.facing),
    );
    this.facing += angleDiff * Math.min(1.0, clampedDt / turnDamping);

    // 6. Collision Resolution & Position Integration
    if (this.currentSpeed > 0.005) {
      this.scratchDelta.x = this.velocity.x * clampedDt;
      this.scratchDelta.z = this.velocity.z * clampedDt;

      const res = resolveMove(
        { x: this.position.x, y: this.position.y, z: this.position.z },
        this.scratchDelta,
        this.radius,
      );

      this.position.x = res.x;
      this.position.z = res.z;
      this.grounded = res.grounded;

      // Smooth step-up / step-down transitions
      const targetGroundY = res.y;
      this.smoothGroundY += (targetGroundY - this.smoothGroundY) * Math.min(1.0, clampedDt * 24.0);
      this.position.y = this.smoothGroundY;
    } else {
      // At rest, stay glued to ground
      const gY = heightAt(this.position.x, this.position.z, this.position.y);
      if (gY !== null) {
        this.smoothGroundY += (gY - this.smoothGroundY) * Math.min(1.0, clampedDt * 20.0);
        this.position.y = this.smoothGroundY;
      }
    }

    // 7. Surface detection
    this.surface = this.querySurface(this.position.x, this.position.z);

    // 8. State update
    if (this.currentSpeed > 2.65) {
      this.setState('run');
    } else if (this.currentSpeed > 0.1) {
      this.setState('walk');
    } else {
      this.setState('idle');
    }

    // 9. Sync visual Wanderer actor
    if (this.wanderer) {
      this.wanderer.position.copy(this.position);
      this.wanderer.rotation.y = this.facing;
      this.wanderer.update(clampedDt, this.currentSpeed, windVector, this.position.y);
    }
  }

  private evaluateIslandEdgeT(x: number, z: number): number {
    // Find closest reachable island
    const keys: IslandKey[] = ['A', 'B', 'C'];
    let minT = 0;
    let matched = false;

    for (const k of keys) {
      const isl = ISLANDS[k];
      const dx = x - isl.center.x;
      const dz = z - isl.center.z;
      const dist = Math.hypot(dx, dz);
      const angle = Math.atan2(dz, dx);
      const rimR = islandRadiusAtAngle(k, isl.radius, angle);
      const t = dist / rimR;

      if (dist < rimR * 1.2) {
        minT = t;
        matched = true;
        break;
      }
    }

    return matched ? minT : 0;
  }

  getSnapshot(): Readonly<PlayerSnapshot> {
    this.snapshot.position.x = this.position.x;
    this.snapshot.position.y = this.position.y;
    this.snapshot.position.z = this.position.z;
    this.snapshot.velocity.x = this.velocity.x;
    this.snapshot.velocity.y = this.velocity.y;
    this.snapshot.velocity.z = this.velocity.z;
    this.snapshot.facing = this.facing;
    this.snapshot.speed01 = this.speed01;
    this.snapshot.grounded = this.grounded;
    this.snapshot.surface = this.surface;
    this.snapshot.state = this.state;
    return this.snapshot;
  }

  dispose(): void {
    this.lockReasons.clear();
  }
}
