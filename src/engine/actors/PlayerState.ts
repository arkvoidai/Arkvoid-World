import * as THREE from 'three';
import { resolveMove, heightAt } from '@/engine/world/collision';
import { SPAWN } from '@/engine/world/layout';
import type { Wanderer } from '@/engine/actors/Wanderer';
import type { AnimationStateName, SurfaceKind } from '@/engine/actors/Animator';
import { pathDistance } from '@/engine/world/terrain';

export interface PlayerState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  facing: number; // yaw in radians
  speed01: number; // 0..1 normalized speed
  state: AnimationStateName;
  surface: SurfaceKind;
  isGrounded: boolean;
}

export class PlayerController {
  readonly state: PlayerState;
  readonly wanderer: Wanderer;

  // Input states
  private inputX = 0;
  private inputZ = 0;
  private isRunning = false;
  private isGathering = false;
  private isMeditating = false;

  private cleanupListeners?: () => void;

  constructor(wanderer: Wanderer) {
    this.wanderer = wanderer;

    const spawnY = heightAt(SPAWN.position.x, SPAWN.position.z) ?? 0;
    this.state = {
      position: new THREE.Vector3(SPAWN.position.x, spawnY, SPAWN.position.z),
      velocity: new THREE.Vector3(0, 0, 0),
      facing: SPAWN.yaw, // 0 facing -z
      speed01: 0,
      state: 'idle',
      surface: 'stone',
      isGrounded: true,
    };

    this.wanderer.position.copy(this.state.position);
    this.wanderer.rotation.y = this.state.facing;

    // Attach surface query to wanderer animator
    this.wanderer.animator.surfaceQuery = (x, z) => this.querySurface(x, z);

    this.setupInputListeners();
  }

  private querySurface(x: number, z: number): SurfaceKind {
    // Check if on bridge or wood
    const pDist = pathDistance(x, z);
    if (Math.hypot(x, z) < 10) return 'stone'; // Dawn Terrace plaza
    if (pDist < 1.2) return 'stone'; // Paved path
    return 'grass';
  }

  private setupInputListeners(): void {
    if (typeof window === 'undefined') return;

    const keysDown = new Set<string>();

    const onKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      keysDown.add(e.code);
      this.updateInputFromKeys(keysDown);

      if (e.code === 'KeyG') {
        this.isGathering = !this.isGathering;
        if (this.isGathering) this.isMeditating = false;
      } else if (e.code === 'KeyM') {
        this.isMeditating = !this.isMeditating;
        if (this.isMeditating) this.isGathering = false;
      } else if (e.code === 'KeyB') {
        this.wanderer.setAnimationState('bow', 0.2);
      } else if (e.code === 'KeyV') {
        this.wanderer.setAnimationState('wave', 0.2);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysDown.delete(e.code);
      this.updateInputFromKeys(keysDown);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    this.cleanupListeners = () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      keysDown.clear();
    };
  }

  private updateInputFromKeys(keys: Set<string>): void {
    let x = 0;
    let z = 0;

    if (keys.has('KeyW') || keys.has('ArrowUp')) z -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) z += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;

    // Normalise diagonal movement
    const len = Math.hypot(x, z);
    if (len > 0.001) {
      this.inputX = x / len;
      this.inputZ = z / len;
      // Moving breaks stationary states
      this.isGathering = false;
      this.isMeditating = false;
    } else {
      this.inputX = 0;
      this.inputZ = 0;
    }

    this.isRunning = keys.has('ShiftLeft') || keys.has('ShiftRight');
  }

  setInput(x: number, z: number, running = false): void {
    const len = Math.hypot(x, z);
    if (len > 0.001) {
      this.inputX = x / len;
      this.inputZ = z / len;
      this.isGathering = false;
      this.isMeditating = false;
    } else {
      this.inputX = 0;
      this.inputZ = 0;
    }
    this.isRunning = running;
  }

  update(dt: number, cameraFacingY = 0, windVector?: THREE.Vector2): void {
    const clampedDt = Math.min(dt, 0.1);

    // Target movement direction relative to camera facing
    const maxSpeed = this.isRunning ? 5.5 : 2.4; // m/s
    const targetSpeed = Math.hypot(this.inputX, this.inputZ) * maxSpeed;

    if (targetSpeed > 0.05) {
      // Transform input vector by camera orientation
      const sinCam = Math.sin(cameraFacingY);
      const cosCam = Math.cos(cameraFacingY);
      const moveX = this.inputX * cosCam + this.inputZ * sinCam;
      const moveZ = -this.inputX * sinCam + this.inputZ * cosCam;

      // Smooth acceleration
      this.state.velocity.x += (moveX * targetSpeed - this.state.velocity.x) * Math.min(1.0, clampedDt * 10);
      this.state.velocity.z += (moveZ * targetSpeed - this.state.velocity.z) * Math.min(1.0, clampedDt * 10);

      // Facing towards movement direction
      const targetFacing = Math.atan2(moveX, moveZ);
      const angleDiff = Math.atan2(Math.sin(targetFacing - this.state.facing), Math.cos(targetFacing - this.state.facing));
      this.state.facing += angleDiff * Math.min(1.0, clampedDt * 12);
    } else {
      // Decelerate smoothly
      this.state.velocity.x += (0 - this.state.velocity.x) * Math.min(1.0, clampedDt * 8);
      this.state.velocity.z += (0 - this.state.velocity.z) * Math.min(1.0, clampedDt * 8);
    }

    const currentSpeed = Math.hypot(this.state.velocity.x, this.state.velocity.z);
    this.state.speed01 = THREE.MathUtils.clamp(currentSpeed / 5.5, 0, 1);

    // Apply movement with analytic collision resolution
    if (currentSpeed > 0.01) {
      const delta = {
        x: this.state.velocity.x * clampedDt,
        z: this.state.velocity.z * clampedDt,
      };

      const resolved = resolveMove(
        { x: this.state.position.x, y: this.state.position.y, z: this.state.position.z },
        delta,
        0.4,
      );

      this.state.position.x = resolved.x;
      this.state.position.y = resolved.y;
      this.state.position.z = resolved.z;
      this.state.isGrounded = resolved.grounded;
    } else {
      // Ground clamp at rest
      const groundY = heightAt(this.state.position.x, this.state.position.z, this.state.position.y);
      if (groundY !== null) {
        this.state.position.y = groundY;
      }
    }

    // Determine animation state
    if (this.isGathering) {
      this.state.state = 'gather';
    } else if (this.isMeditating) {
      this.state.state = 'sit-meditate';
    } else if (currentSpeed > 3.2) {
      this.state.state = 'run';
    } else if (currentSpeed > 0.15) {
      this.state.state = 'walk';
    } else {
      this.state.state = 'idle';
    }

    this.wanderer.setAnimationState(this.state.state, 0.15);

    // Update Wanderer visual transform
    this.wanderer.position.copy(this.state.position);
    this.wanderer.rotation.y = this.state.facing;

    // Tick wanderer actor
    this.wanderer.update(
      clampedDt,
      currentSpeed,
      windVector,
      this.state.position.y,
    );
  }

  dispose(): void {
    this.cleanupListeners?.();
    this.wanderer.dispose();
  }
}
