import * as THREE from 'three';
import { heightAt } from '@/engine/world/collision';
import { OBSTACLES, OBSTACLE_BOXES } from '@/engine/world/layout';
import type { DeviceProfile } from '@/lib/deviceProfile';

export interface CameraShot {
  name: string;
  position?: THREE.Vector3 | ((playerPos: THREE.Vector3) => THREE.Vector3);
  lookAt?: THREE.Vector3 | ((playerPos: THREE.Vector3) => THREE.Vector3);
  fov?: number;
  armDistance?: number;
  pitch?: number;
  yaw?: number;
  duration?: number; // seconds
}

export interface CameraRigOptions {
  assistedMovement?: boolean;
  reducedMotion?: boolean;
}

export class CameraRig {
  private readonly camera: THREE.PerspectiveCamera;
  private readonly device: DeviceProfile;
  private options: CameraRigOptions;

  // Orbit angles (radians)
  yaw = 0; // 0 = looking -z
  pitch = 0.18; // ~10 degrees down

  // Target smoothing
  private readonly targetPos = new THREE.Vector3();
  private readonly smoothTarget = new THREE.Vector3();
  private readonly desiredCamPos = new THREE.Vector3();
  private readonly currentCamPos = new THREE.Vector3();
  private readonly lookTarget = new THREE.Vector3();

  // Spring arm parameters
  private nominalDistance = 3.4;
  private currentArmDistance = 3.4;
  private shoulderOffset = 0.35;
  private baseFov = 58;

  // Running FOV expansion
  private currentFov = 58;

  // Auto-recentre timer
  private timeSinceLastLookInput = 0;

  // Showcase orbit handoff
  private isOrbitHandoff = false;
  private orbitHandoffProgress = 1.0;
  private readonly orbitHandoffStartPos = new THREE.Vector3();
  private readonly orbitHandoffStartLook = new THREE.Vector3();

  // Shot override stack
  private readonly shotStack: CameraShot[] = [];
  private shotBlendProgress = 1.0;
  private activeShot: CameraShot | null = null;

  // Scratch vectors for collision & math (0 allocations per frame)
  private readonly scratchArmVec = new THREE.Vector3();
  private readonly scratchSample = new THREE.Vector3();
  private readonly scratchLook = new THREE.Vector3();

  constructor(
    camera: THREE.PerspectiveCamera,
    device: DeviceProfile,
    options: CameraRigOptions = {},
  ) {
    this.camera = camera;
    this.device = device;
    this.options = options;

    const isPhone = device.deviceClass === 'phone';
    this.nominalDistance = isPhone ? 3.8 : 3.4;
    this.currentArmDistance = this.nominalDistance;
    this.shoulderOffset = isPhone ? 0.0 : 0.35;
    this.baseFov = isPhone ? 64 : 58;
    this.currentFov = this.baseFov;

    this.currentCamPos.copy(camera.position);
    this.smoothTarget.set(0, 1.35, 14);
  }

  setOptions(options: Partial<CameraRigOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Initiates a 1.2s smooth handoff transition from the showcase camera into player follow camera.
   */
  startHandoffFromShowcase(initialCamPos: THREE.Vector3, initialLookAt: THREE.Vector3): void {
    this.isOrbitHandoff = true;
    this.orbitHandoffProgress = 0.0;
    this.orbitHandoffStartPos.copy(initialCamPos);
    this.orbitHandoffStartLook.copy(initialLookAt);
  }

  pushShot(shot: CameraShot): void {
    this.shotStack.push(shot);
    this.activeShot = shot;
    this.shotBlendProgress = 0.0;
  }

  popShot(name?: string): void {
    if (name) {
      const idx = this.shotStack.findIndex((s) => s.name === name);
      if (idx !== -1) {
        this.shotStack.splice(idx, 1);
      }
    } else {
      this.shotStack.pop();
    }
    this.activeShot = this.shotStack.length > 0 ? this.shotStack[this.shotStack.length - 1]! : null;
    this.shotBlendProgress = 0.0;
  }

  /**
   * Main per-frame update loop.
   */
  update(
    dt: number,
    playerPos: THREE.Vector3,
    playerFacing: number,
    speed01: number,
    lookDeltaYaw: number,
    lookDeltaPitch: number,
    isPlayerMoving: boolean,
  ): void {
    const clampedDt = Math.min(dt, 0.05);

    // 1. Process Look Input & Auto-recentre
    if (Math.abs(lookDeltaYaw) > 0.0001 || Math.abs(lookDeltaPitch) > 0.0001) {
      this.yaw += lookDeltaYaw;
      this.pitch += lookDeltaPitch;
      this.timeSinceLastLookInput = 0;
    } else {
      this.timeSinceLastLookInput += clampedDt;
      // Re-centre only after the player releases movement. Re-centering while a
      // direction is held rotates the camera-relative input basis underneath the
      // thumb, turning a straight drag into a circular path.
      if (!isPlayerMoving && this.timeSinceLastLookInput > 2.4 && !this.activeShot && !this.isOrbitHandoff) {
        const targetYaw = playerFacing;
        const diff = Math.atan2(Math.sin(targetYaw - this.yaw), Math.cos(targetYaw - this.yaw));
        this.yaw += diff * (1.0 - Math.exp(-clampedDt * 1.35));
      }
    }

    // Pitch limit: -30 deg (-0.52 rad) to +55 deg (+0.96 rad)
    this.pitch = THREE.MathUtils.clamp(this.pitch, -0.52, 0.96);

    // 2. Chest target position (+1.35 m above ground/player feet)
    const isInsideHall =
      playerPos.x >= 8 && playerPos.x <= 32 &&
      playerPos.z >= -13 && playerPos.z <= 1 &&
      playerPos.y > 2.0;

    const chestHeight = isInsideHall ? 1.15 : 1.35;
    this.targetPos.set(playerPos.x, playerPos.y + chestHeight, playerPos.z);

    // Smooth target follow (position damping 0.10 s)
    const followDamping = 0.10;
    this.smoothTarget.lerp(this.targetPos, Math.min(1.0, clampedDt / followDamping));

    // 3. Hall Interior Closer Arm Check
    const targetDistance = isInsideHall ? 2.2 : this.nominalDistance;

    // 4. Compute Ideal Camera Arm Vector
    // Free yaw, pitch limited
    const cosPitch = Math.cos(this.pitch);
    const sinPitch = Math.sin(this.pitch);
    const sinYaw = Math.sin(this.yaw);
    const cosYaw = Math.cos(this.yaw);

    // Direction from target towards camera
    this.scratchArmVec.set(
      -sinYaw * cosPitch,
      sinPitch,
      -cosYaw * cosPitch,
    ).normalize();

    // Shoulder right offset perpendicular to arm
    const normalX = -cosYaw;
    const normalZ = sinYaw;
    const sOffset = isInsideHall ? 0.0 : this.shoulderOffset;

    const desiredX = this.smoothTarget.x + this.scratchArmVec.x * targetDistance + normalX * sOffset;
    const desiredY = this.smoothTarget.y + this.scratchArmVec.y * targetDistance;
    const desiredZ = this.smoothTarget.z + this.scratchArmVec.z * targetDistance + normalZ * sOffset;
    this.desiredCamPos.set(desiredX, desiredY, desiredZ);

    // 5. 8-Point Analytic Collision Check along Spring Arm
    const safeDistance = this.resolveArmCollision(
      this.smoothTarget,
      this.scratchArmVec,
      targetDistance,
      sOffset,
      normalX,
      normalZ,
    );

    // Pull in quickly, relax out smoothly
    if (safeDistance < this.currentArmDistance) {
      this.currentArmDistance = safeDistance; // Instant push-in
    } else {
      this.currentArmDistance += (safeDistance - this.currentArmDistance) * Math.min(1.0, clampedDt * 4.0);
    }

    // Actual positioned camera
    const finalX = this.smoothTarget.x + this.scratchArmVec.x * this.currentArmDistance + normalX * sOffset;
    const finalY = this.smoothTarget.y + this.scratchArmVec.y * this.currentArmDistance;
    const finalZ = this.smoothTarget.z + this.scratchArmVec.z * this.currentArmDistance + normalZ * sOffset;

    // Gentle 0.4 cm breathing drift at idle if motion not reduced
    const driftY = (speed01 < 0.05 && !this.options.reducedMotion)
      ? Math.sin(performance.now() * 0.0012) * 0.004
      : 0;

    // 6. Smooth Camera Position Update (0.06 s rotation damping)
    this.currentCamPos.set(finalX, finalY + driftY, finalZ);

    // Look target with shoulder offset
    this.lookTarget.copy(this.smoothTarget);
    this.lookTarget.x += normalX * (sOffset * 0.5);
    this.lookTarget.z += normalZ * (sOffset * 0.5);

    // 7. Shot Override Stack Handling
    if (this.activeShot) {
      this.applyShotOverride(this.activeShot, playerPos, clampedDt);
    }

    // 8. Showcase Orbit Handoff (1.2 s eased blend)
    if (this.isOrbitHandoff) {
      this.orbitHandoffProgress += clampedDt / 1.2;
      if (this.orbitHandoffProgress >= 1.0) {
        this.isOrbitHandoff = false;
        this.orbitHandoffProgress = 1.0;
      }
      // Smoothstep 0..1
      const t = this.orbitHandoffProgress * this.orbitHandoffProgress * (3 - 2 * this.orbitHandoffProgress);
      this.camera.position.lerpVectors(this.orbitHandoffStartPos, this.currentCamPos, t);
      this.scratchLook.lerpVectors(this.orbitHandoffStartLook, this.lookTarget, t);
      this.camera.lookAt(this.scratchLook);
    } else {
      this.camera.position.copy(this.currentCamPos);
      this.camera.lookAt(this.lookTarget);
    }

    // 9. Keep the field of view stable. Preserve intentional shot overrides.
    const targetFov = this.activeShot?.fov ?? this.baseFov;
    this.currentFov += (targetFov - this.currentFov) * Math.min(1.0, clampedDt * 4.0);
    if (Math.abs(this.camera.fov - this.currentFov) > 0.05) {
      this.camera.fov = this.currentFov;
      this.camera.updateProjectionMatrix();
    }
  }

  private applyShotOverride(shot: CameraShot, playerPos: THREE.Vector3, dt: number): void {
    if (this.shotBlendProgress < 1.0) {
      const dur = shot.duration ?? 0.8;
      this.shotBlendProgress = Math.min(1.0, this.shotBlendProgress + dt / dur);
    }
    const t = this.shotBlendProgress * this.shotBlendProgress * (3 - 2 * this.shotBlendProgress);

    if (shot.armDistance !== undefined) {
      this.currentArmDistance = THREE.MathUtils.lerp(this.currentArmDistance, shot.armDistance, t);
    }
    if (shot.pitch !== undefined) {
      this.pitch = THREE.MathUtils.lerp(this.pitch, shot.pitch, t);
    }
    if (shot.yaw !== undefined) {
      this.yaw = THREE.MathUtils.lerp(this.yaw, shot.yaw, t);
    }
    if (shot.fov !== undefined) {
      this.currentFov = THREE.MathUtils.lerp(this.currentFov, shot.fov, t);
    }
  }

  /**
   * Samples 8 points along the arm from target to desired camera position
   * and clamps the arm distance so camera never penetrates terrain, walls, or columns.
   */
  private resolveArmCollision(
    target: THREE.Vector3,
    armDir: THREE.Vector3,
    maxDist: number,
    sOffset: number,
    normX: number,
    normZ: number,
  ): number {
    const numSamples = 8;
    let closestClearDist = maxDist;

    for (let i = 1; i <= numSamples; i++) {
      const d = (i / numSamples) * maxDist;
      this.scratchSample.set(
        target.x + armDir.x * d + normX * sOffset,
        target.y + armDir.y * d,
        target.z + armDir.z * d + normZ * sOffset,
      );

      // 1. Terrain Height clearance (+0.35 m)
      const gH = heightAt(this.scratchSample.x, this.scratchSample.z, this.scratchSample.y);
      if (gH !== null && this.scratchSample.y <= gH + 0.35) {
        closestClearDist = Math.min(closestClearDist, Math.max(0.6, d - 0.35));
        break;
      }

      // 2. Obstacle cylinders (columns, trees, lanterns with 0.25 m padding)
      let hitCylinder = false;
      for (const obs of OBSTACLES) {
        const dx = this.scratchSample.x - obs.x;
        const dz = this.scratchSample.z - obs.z;
        const distSq = dx * dx + dz * dz;
        const totalR = obs.radius + 0.25;
        if (distSq < totalR * totalR) {
          if (this.scratchSample.y >= obs.baseY - 0.2 && this.scratchSample.y <= obs.baseY + obs.height + 0.2) {
            closestClearDist = Math.min(closestClearDist, Math.max(0.6, d - 0.35));
            hitCylinder = true;
            break;
          }
        }
      }
      if (hitCylinder) break;

      // 3. Obstacle boxes (building walls with 0.25 m padding)
      let hitBox = false;
      for (const box of OBSTACLE_BOXES) {
        if (
          this.scratchSample.x >= box.minX - 0.25 &&
          this.scratchSample.x <= box.maxX + 0.25 &&
          this.scratchSample.z >= box.minZ - 0.25 &&
          this.scratchSample.z <= box.maxZ + 0.25 &&
          this.scratchSample.y >= box.baseY - 0.25 &&
          this.scratchSample.y <= box.baseY + box.height + 0.25
        ) {
          closestClearDist = Math.min(closestClearDist, Math.max(0.6, d - 0.35));
          hitBox = true;
          break;
        }
      }
      if (hitBox) break;
    }

    return closestClearDist;
  }

  dispose(): void {
    this.shotStack.length = 0;
  }
}
