import * as THREE from 'three';

export type AnimationStateName =
  | 'idle'
  | 'walk'
  | 'run'
  | 'turn'
  | 'stop'
  | 'sit-meditate'
  | 'bow'
  | 'wave'
  | 'talk'
  | 'gather';

export type SurfaceKind = 'grass' | 'stone' | 'wood';

export interface FootstepEvent {
  foot: 'left' | 'right';
  surface: SurfaceKind;
  position: THREE.Vector3;
}

export interface WandererSkeleton {
  root: THREE.Object3D;
  pelvis: THREE.Object3D;
  spine0: THREE.Object3D;
  spine1: THREE.Object3D;
  spine2: THREE.Object3D;
  chest: THREE.Object3D;
  neck: THREE.Object3D;
  head: THREE.Object3D;
  leftShoulder: THREE.Object3D;
  rightShoulder: THREE.Object3D;
  leftUpperArm: THREE.Object3D;
  rightUpperArm: THREE.Object3D;
  leftForearm: THREE.Object3D;
  rightForearm: THREE.Object3D;
  leftHand: THREE.Object3D;
  rightHand: THREE.Object3D;
  leftThigh: THREE.Object3D;
  rightThigh: THREE.Object3D;
  leftShin: THREE.Object3D;
  rightShin: THREE.Object3D;
  leftFoot: THREE.Object3D;
  rightFoot: THREE.Object3D;
}

export interface AnimationPose {
  pelvisY: number;
  pelvisRotX: number;
  pelvisRotY: number;
  pelvisRotZ: number;

  spine0RotX: number;
  spine1RotX: number;
  spine2RotX: number;

  chestRotX: number;
  chestRotY: number;

  neckRotX: number;
  neckRotY: number;

  headRotX: number;
  headRotY: number;
  headRotZ: number;

  leftArmRotX: number;
  leftArmRotY: number;
  leftArmRotZ: number;
  rightArmRotX: number;
  rightArmRotY: number;
  rightArmRotZ: number;

  leftForearmRotX: number;
  rightForearmRotX: number;

  leftHandRotX: number;
  rightHandRotX: number;

  leftThighRotX: number;
  leftThighRotY: number;
  leftThighRotZ: number;
  rightThighRotX: number;
  rightThighRotY: number;
  rightThighRotZ: number;

  leftShinRotX: number;
  rightShinRotX: number;

  leftFootRotX: number;
  rightFootRotX: number;

  // Deformation uniforms for the robe
  robeSpeedAmplitude: number;
  robePhase: number;
  robeTrail: number;
  eyeGlowMultiplier: number;
  gatherRingScale: number;
}

export class WandererAnimator {
  private currentState: AnimationStateName = 'idle';
  private targetState: AnimationStateName = 'idle';
  private blendProgress = 1.0; // 0..1 critically damped
  private blendDuration = 0.15; // 0.15s critically damped blend

  private stateTime = 0.0;
  private walkPhase = 0.0; // 0..1
  private lastLeftStrike = false;
  private lastRightStrike = false;

  // Layered parameters
  speechLevel = 0.0; // 0..1 head & hand gestures layered
  lookAtTarget: THREE.Vector3 | null = null;
  lookAtWeight = 1.0;

  // Surface detection callback
  surfaceQuery?: (x: number, z: number) => SurfaceKind;
  onFootstep?: (event: FootstepEvent) => void;

  // Pre-allocated reusable pose buffers to avoid frame allocations
  private readonly poseCurrent: AnimationPose = this.createEmptyPose();
  private readonly poseTarget: AnimationPose = this.createEmptyPose();
  private readonly poseBlended: AnimationPose = this.createEmptyPose();

  // Scratch math vectors to avoid allocations
  private readonly scratchVec = new THREE.Vector3();
  private readonly scratchFootPos = new THREE.Vector3();

  private createEmptyPose(): AnimationPose {
    return {
      pelvisY: 0,
      pelvisRotX: 0,
      pelvisRotY: 0,
      pelvisRotZ: 0,
      spine0RotX: 0,
      spine1RotX: 0,
      spine2RotX: 0,
      chestRotX: 0,
      chestRotY: 0,
      neckRotX: 0,
      neckRotY: 0,
      headRotX: 0,
      headRotY: 0,
      headRotZ: 0,
      leftArmRotX: 0,
      leftArmRotY: 0,
      leftArmRotZ: 0,
      rightArmRotX: 0,
      rightArmRotY: 0,
      rightArmRotZ: 0,
      leftForearmRotX: 0,
      rightForearmRotX: 0,
      leftHandRotX: 0,
      rightHandRotX: 0,
      leftThighRotX: 0,
      leftThighRotY: 0,
      leftThighRotZ: 0,
      rightThighRotX: 0,
      rightThighRotY: 0,
      rightThighRotZ: 0,
      leftShinRotX: 0,
      rightShinRotX: 0,
      leftFootRotX: 0,
      rightFootRotX: 0,
      robeSpeedAmplitude: 0,
      robePhase: 0,
      robeTrail: 0,
      eyeGlowMultiplier: 1.0,
      gatherRingScale: 0.0,
    };
  }

  setState(state: AnimationStateName, duration = 0.15): void {
    if (this.targetState === state) return;
    this.currentState = this.targetState;
    this.targetState = state;
    this.blendDuration = Math.max(0.01, duration);
    this.blendProgress = 0.0;
  }

  getState(): AnimationStateName {
    return this.targetState;
  }

  /**
   * Main 60 Hz tick with 0 allocations.
   */
  update(dt: number, speed: number, skeleton: WandererSkeleton, worldPos?: THREE.Vector3): void {
    const clampedDt = Math.min(dt, 0.1);
    this.stateTime += clampedDt;

    // Advance blend transition
    if (this.blendProgress < 1.0) {
      this.blendProgress = Math.min(1.0, this.blendProgress + clampedDt / this.blendDuration);
    }

    // Advance walking stride cycle based on physical speed
    // Stride length: walk ~0.72m, run ~1.1m
    const stride = speed > 3.0 ? 1.1 : 0.72;
    if (speed > 0.05) {
      const cycleFrequency = speed / stride; // Hz
      this.walkPhase = (this.walkPhase + cycleFrequency * clampedDt) % 1.0;
    } else {
      this.walkPhase = 0;
    }

    // Footstep events on heel strikes
    const leftHeel = this.walkPhase > 0.0 && this.walkPhase < 0.25;
    const rightHeel = this.walkPhase > 0.5 && this.walkPhase < 0.75;
    if (leftHeel && !this.lastLeftStrike) {
      this.emitFootstep('left', worldPos);
    }
    if (rightHeel && !this.lastRightStrike) {
      this.emitFootstep('right', worldPos);
    }
    this.lastLeftStrike = leftHeel;
    this.lastRightStrike = rightHeel;

    // Compute base poses for current and target states
    this.computeStatePose(this.currentState, this.stateTime, speed, this.poseCurrent);
    this.computeStatePose(this.targetState, this.stateTime, speed, this.poseTarget);

    // Critically damped blend (smoothstep s-curve)
    const t = this.blendProgress * this.blendProgress * (3 - 2 * this.blendProgress);
    this.blendPoses(this.poseCurrent, this.poseTarget, t, this.poseBlended);

    // Layer speech gestures if speechLevel > 0
    if (this.speechLevel > 0.01) {
      const speechTime = this.stateTime * 3.5;
      const headGesture = Math.sin(speechTime * 1.8) * 0.08 * this.speechLevel;
      const armGesture = (Math.sin(speechTime) * 0.15 + 0.1) * this.speechLevel;
      this.poseBlended.headRotX += headGesture;
      this.poseBlended.headRotY += Math.cos(speechTime * 1.2) * 0.06 * this.speechLevel;
      this.poseBlended.rightArmRotX += armGesture;
      this.poseBlended.rightForearmRotX += armGesture * 0.5;
      this.poseBlended.eyeGlowMultiplier = 1.0 + 0.4 * this.speechLevel;
    }

    // Layer look-at heading
    if (this.lookAtTarget && skeleton.root) {
      skeleton.root.getWorldPosition(this.scratchVec);
      const dx = this.lookAtTarget.x - this.scratchVec.x;
      const dz = this.lookAtTarget.z - this.scratchVec.z;
      const angle = Math.atan2(dx, dz) - skeleton.root.rotation.y;
      // Normalise angle to [-PI, PI]
      const normAngle = Math.atan2(Math.sin(angle), Math.cos(angle));
      // Max clamp 55 deg (0.96 rad)
      const clampedAngle = THREE.MathUtils.clamp(normAngle, -0.96, 0.96);
      this.poseBlended.headRotY += clampedAngle * 0.65 * this.lookAtWeight;
      this.poseBlended.chestRotY += clampedAngle * 0.35 * this.lookAtWeight;
    }

    // Apply blended pose onto skeleton Object3D transforms
    this.applyPoseToSkeleton(this.poseBlended, skeleton);
  }

  private emitFootstep(foot: 'left' | 'right', worldPos?: THREE.Vector3): void {
    if (!this.onFootstep) return;
    const pos = worldPos || this.scratchFootPos.set(0, 0, 0);
    const surface: SurfaceKind = this.surfaceQuery ? this.surfaceQuery(pos.x, pos.z) : 'stone';
    this.onFootstep({ foot, surface, position: pos });
  }

  private computeStatePose(
    state: AnimationStateName,
    time: number,
    speed: number,
    out: AnimationPose,
  ): void {
    // Reset to neutral
    out.pelvisY = 0;
    out.pelvisRotX = 0;
    out.pelvisRotY = 0;
    out.pelvisRotZ = 0;
    out.spine0RotX = 0;
    out.spine1RotX = 0;
    out.spine2RotX = 0;
    out.chestRotX = 0;
    out.chestRotY = 0;
    out.neckRotX = 0;
    out.neckRotY = 0;
    out.headRotX = 0;
    out.headRotY = 0;
    out.headRotZ = 0;
    out.leftArmRotX = 0;
    out.leftArmRotY = 0;
    out.leftArmRotZ = 0.08;
    out.rightArmRotX = 0;
    out.rightArmRotY = 0;
    out.rightArmRotZ = -0.08;
    out.leftForearmRotX = 0.05;
    out.rightForearmRotX = 0.05;
    out.leftHandRotX = 0;
    out.rightHandRotX = 0;
    out.leftThighRotX = 0;
    out.leftThighRotY = 0;
    out.leftThighRotZ = 0;
    out.rightThighRotX = 0;
    out.rightThighRotY = 0;
    out.rightThighRotZ = 0;
    out.leftShinRotX = 0;
    out.rightShinRotX = 0;
    out.leftFootRotX = 0;
    out.rightFootRotX = 0;
    out.robeSpeedAmplitude = 0;
    out.robePhase = this.walkPhase;
    out.robeTrail = 0;
    out.eyeGlowMultiplier = 1.0;
    out.gatherRingScale = 0.0;

    switch (state) {
      case 'idle': {
        // 0.2 Hz breathing cycle, gentle sway and head drift
        const breath = Math.sin(time * 0.2 * Math.PI * 2);
        const shift = Math.sin(time * 0.1 * Math.PI * 2);

        out.pelvisY = breath * 0.008;
        out.pelvisRotZ = shift * 0.015;
        out.chestRotX = breath * 0.035;
        out.headRotX = -breath * 0.015;
        out.headRotY = shift * 0.04;
        out.leftArmRotZ = 0.08 + breath * 0.015;
        out.rightArmRotZ = -0.08 - breath * 0.015;
        break;
      }

      case 'walk': {
        // Walk: short, measured stride with restrained upper-body motion
        const p = this.walkPhase * Math.PI * 2;
        const sinP = Math.sin(p);
        const bob = Math.abs(sinP) * 0.016; // 1.6 cm bob

        out.pelvisY = -bob;
        out.pelvisRotY = -sinP * 0.07; // subtle hip counter-rotation
        out.chestRotY = sinP * 0.045;

        // Arm swing (opposite to leg)
        out.leftArmRotX = sinP * 0.18;
        out.rightArmRotX = -sinP * 0.18;
        out.leftForearmRotX = 0.10 + (sinP > 0 ? sinP * 0.10 : 0);
        out.rightForearmRotX = 0.10 + (-sinP > 0 ? -sinP * 0.10 : 0);

        // Legs
        out.leftThighRotX = -sinP * 0.34;
        out.rightThighRotX = sinP * 0.34;
        out.leftShinRotX = sinP < 0 ? -sinP * 0.42 : 0;
        out.rightShinRotX = sinP > 0 ? sinP * 0.42 : 0;

        out.robeSpeedAmplitude = 0.32;
        out.robeTrail = 0.08;
        break;
      }

      case 'run': {
        // Run: grounded athletic stride with controlled torso and arm movement
        const p = this.walkPhase * Math.PI * 2;
        const sinP = Math.sin(p);
        const bob = Math.abs(sinP) * 0.026; // 2.6 cm bob

        out.pelvisY = -bob;
        out.pelvisRotX = 0.07; // restrained forward lean
        out.spine0RotX = 0.025;
        out.spine1RotX = 0.025;
        out.pelvisRotY = -sinP * 0.14;
        out.chestRotY = sinP * 0.08;

        // Arm swing 35 deg
        out.leftArmRotX = sinP * 0.34;
        out.rightArmRotX = -sinP * 0.34;
        out.leftForearmRotX = 0.24 + (sinP > 0 ? sinP * 0.18 : 0);
        out.rightForearmRotX = 0.24 + (-sinP > 0 ? -sinP * 0.18 : 0);

        // Legs
        out.leftThighRotX = -sinP * 0.52;
        out.rightThighRotX = sinP * 0.52;
        out.leftShinRotX = sinP < 0 ? -sinP * 0.68 : 0;
        out.rightShinRotX = sinP > 0 ? sinP * 0.68 : 0;

        out.robeSpeedAmplitude = 0.62;
        out.robeTrail = 0.20;
        break;
      }

      case 'turn': {
        const turnSway = Math.sin(time * 4.0) * 0.05;
        out.pelvisRotY = turnSway;
        out.chestRotY = turnSway * 1.5;
        out.headRotY = turnSway * 2.0;
        break;
      }

      case 'stop': {
        // Settle with decaying sway
        const decay = Math.exp(-time * 3.0);
        const sway = Math.sin(time * 6.0) * 0.08 * decay;
        out.pelvisRotX = sway;
        out.chestRotX = sway * 0.8;
        out.robeTrail = sway * 0.5;
        break;
      }

      case 'sit-meditate': {
        // Cross-legged on the ground, spine upright, hands on knees, 0.12 Hz breath
        const breath = Math.sin(time * 0.12 * Math.PI * 2);
        out.pelvisY = -0.58; // Seated down
        out.pelvisRotX = 0.08;
        out.spine0RotX = -0.04;
        out.spine1RotX = -0.04;
        out.chestRotX = breath * 0.04;
        out.headRotX = 0.05;

        // Arms down towards knees
        out.leftArmRotX = 0.42;
        out.leftArmRotZ = 0.28;
        out.rightArmRotX = 0.42;
        out.rightArmRotZ = -0.28;
        out.leftForearmRotX = 0.75;
        out.rightForearmRotX = 0.75;

        // Cross legs
        out.leftThighRotX = -1.45;
        out.leftThighRotY = 0.42;
        out.leftThighRotZ = 0.55;
        out.rightThighRotX = -1.45;
        out.rightThighRotY = -0.42;
        out.rightThighRotZ = -0.55;
        out.leftShinRotX = 2.05;
        out.rightShinRotX = 2.05;

        out.eyeGlowMultiplier = 1.0 + breath * 0.35;
        break;
      }

      case 'bow': {
        // 1.6 s deep bow
        const cycle = Math.min(1.0, time / 1.6);
        const bowCurve = Math.sin(cycle * Math.PI); // 0 -> 1 -> 0
        const angle = bowCurve * 0.70; // ~40 deg

        out.pelvisRotX = angle * 0.4;
        out.spine0RotX = angle * 0.3;
        out.spine1RotX = angle * 0.3;
        out.chestRotX = angle * 0.4;
        out.headRotX = angle * 0.5;

        // Hands meet at waist
        out.leftArmRotX = 0.35 * bowCurve;
        out.leftArmRotZ = 0.25 * bowCurve;
        out.rightArmRotX = 0.35 * bowCurve;
        out.rightArmRotZ = -0.25 * bowCurve;
        out.leftForearmRotX = 0.85 * bowCurve;
        out.rightForearmRotX = 0.85 * bowCurve;
        break;
      }

      case 'wave': {
        const waveAngle = Math.sin(time * 6.0) * 0.35;
        out.rightArmRotX = 1.35; // Raised high
        out.rightArmRotZ = -0.45;
        out.rightForearmRotX = 1.25;
        out.rightHandRotX = waveAngle;
        break;
      }

      case 'talk': {
        const speech = Math.sin(time * 3.5);
        out.headRotX = Math.sin(time * 2.2) * 0.08;
        out.headRotY = speech * 0.12;
        out.rightArmRotX = 0.35 + speech * 0.15;
        out.rightForearmRotX = 0.65 + speech * 0.15;
        out.eyeGlowMultiplier = 1.25;
        break;
      }

      case 'gather': {
        // Arms rise, palms up, eye glow brightens, footfall ring expands
        const gTime = Math.min(time * 1.5, 1.0);
        const floatBreath = Math.sin(time * 2.0) * 0.03;

        out.pelvisY = 0.02 + floatBreath;
        // Arms rise outwards, palms up
        out.leftArmRotX = 0.85 * gTime;
        out.leftArmRotZ = (0.55 + floatBreath) * gTime;
        out.rightArmRotX = 0.85 * gTime;
        out.rightArmRotZ = (-0.55 - floatBreath) * gTime;
        out.leftForearmRotX = 0.45 * gTime;
        out.rightForearmRotX = 0.45 * gTime;
        out.leftHandRotX = -0.55 * gTime;
        out.rightHandRotX = -0.55 * gTime;

        out.eyeGlowMultiplier = 1.85;
        out.gatherRingScale = gTime;
        break;
      }
    }
  }

  private blendPoses(a: AnimationPose, b: AnimationPose, t: number, out: AnimationPose): void {
    const inv = 1 - t;
    out.pelvisY = a.pelvisY * inv + b.pelvisY * t;
    out.pelvisRotX = a.pelvisRotX * inv + b.pelvisRotX * t;
    out.pelvisRotY = a.pelvisRotY * inv + b.pelvisRotY * t;
    out.pelvisRotZ = a.pelvisRotZ * inv + b.pelvisRotZ * t;

    out.spine0RotX = a.spine0RotX * inv + b.spine0RotX * t;
    out.spine1RotX = a.spine1RotX * inv + b.spine1RotX * t;
    out.spine2RotX = a.spine2RotX * inv + b.spine2RotX * t;

    out.chestRotX = a.chestRotX * inv + b.chestRotX * t;
    out.chestRotY = a.chestRotY * inv + b.chestRotY * t;

    out.neckRotX = a.neckRotX * inv + b.neckRotX * t;
    out.neckRotY = a.neckRotY * inv + b.neckRotY * t;

    out.headRotX = a.headRotX * inv + b.headRotX * t;
    out.headRotY = a.headRotY * inv + b.headRotY * t;
    out.headRotZ = a.headRotZ * inv + b.headRotZ * t;

    out.leftArmRotX = a.leftArmRotX * inv + b.leftArmRotX * t;
    out.leftArmRotY = a.leftArmRotY * inv + b.leftArmRotY * t;
    out.leftArmRotZ = a.leftArmRotZ * inv + b.leftArmRotZ * t;
    out.rightArmRotX = a.rightArmRotX * inv + b.rightArmRotX * t;
    out.rightArmRotY = a.rightArmRotY * inv + b.rightArmRotY * t;
    out.rightArmRotZ = a.rightArmRotZ * inv + b.rightArmRotZ * t;

    out.leftForearmRotX = a.leftForearmRotX * inv + b.leftForearmRotX * t;
    out.rightForearmRotX = a.rightForearmRotX * inv + b.rightForearmRotX * t;

    out.leftHandRotX = a.leftHandRotX * inv + b.leftHandRotX * t;
    out.rightHandRotX = a.rightHandRotX * inv + b.rightHandRotX * t;

    out.leftThighRotX = a.leftThighRotX * inv + b.leftThighRotX * t;
    out.leftThighRotY = a.leftThighRotY * inv + b.leftThighRotY * t;
    out.leftThighRotZ = a.leftThighRotZ * inv + b.leftThighRotZ * t;
    out.rightThighRotX = a.rightThighRotX * inv + b.rightThighRotX * t;
    out.rightThighRotY = a.rightThighRotY * inv + b.rightThighRotY * t;
    out.rightThighRotZ = a.rightThighRotZ * inv + b.rightThighRotZ * t;

    out.leftShinRotX = a.leftShinRotX * inv + b.leftShinRotX * t;
    out.rightShinRotX = a.rightShinRotX * inv + b.rightShinRotX * t;

    out.leftFootRotX = a.leftFootRotX * inv + b.leftFootRotX * t;
    out.rightFootRotX = a.rightFootRotX * inv + b.rightFootRotX * t;

    out.robeSpeedAmplitude = a.robeSpeedAmplitude * inv + b.robeSpeedAmplitude * t;
    out.robePhase = b.robePhase;
    out.robeTrail = a.robeTrail * inv + b.robeTrail * t;
    out.eyeGlowMultiplier = a.eyeGlowMultiplier * inv + b.eyeGlowMultiplier * t;
    out.gatherRingScale = a.gatherRingScale * inv + b.gatherRingScale * t;
  }

  private applyPoseToSkeleton(pose: AnimationPose, s: WandererSkeleton): void {
    // Pelvis
    s.pelvis.position.y = 0.88 + pose.pelvisY;
    s.pelvis.rotation.set(pose.pelvisRotX, pose.pelvisRotY, pose.pelvisRotZ);

    // Spine
    s.spine0.rotation.x = pose.spine0RotX;
    s.spine1.rotation.x = pose.spine1RotX;
    s.spine2.rotation.x = pose.spine2RotX;

    // Chest & Neck
    s.chest.rotation.set(pose.chestRotX, pose.chestRotY, 0);
    s.neck.rotation.set(pose.neckRotX, pose.neckRotY, 0);

    // Head
    s.head.rotation.set(pose.headRotX, pose.headRotY, pose.headRotZ);

    // Arms
    s.leftUpperArm.rotation.set(pose.leftArmRotX, pose.leftArmRotY, pose.leftArmRotZ);
    s.rightUpperArm.rotation.set(pose.rightArmRotX, pose.rightArmRotY, pose.rightArmRotZ);
    s.leftForearm.rotation.x = pose.leftForearmRotX;
    s.rightForearm.rotation.x = pose.rightForearmRotX;
    s.leftHand.rotation.x = pose.leftHandRotX;
    s.rightHand.rotation.x = pose.rightHandRotX;

    // Legs
    s.leftThigh.rotation.set(pose.leftThighRotX, pose.leftThighRotY, pose.leftThighRotZ);
    s.rightThigh.rotation.set(pose.rightThighRotX, pose.rightThighRotY, pose.rightThighRotZ);
    s.leftShin.rotation.x = pose.leftShinRotX;
    s.rightShin.rotation.x = pose.rightShinRotX;
    s.leftFoot.rotation.x = pose.leftFootRotX;
    s.rightFoot.rotation.x = pose.rightFootRotX;
  }

  getBlendedPose(): Readonly<AnimationPose> {
    return this.poseBlended;
  }
}
