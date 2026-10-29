import * as THREE from 'three';
import { SPOTS } from '@/engine/world/layout';
import type { PlayerController } from '@/engine/locomotion/PlayerController';
import type { CameraRig } from '@/engine/locomotion/CameraRig';
import { sharedEngineBridge } from '@/state/worldBridgeStore';

export interface Interactable {
  id: string;
  kind: 'bell' | 'sit' | 'gate' | 'custom';
  position: THREE.Vector3;
  radius: number;
  label: string;
  verb: string;
  enabled: () => boolean;
  onInteract: () => void;
}

export interface InteractablesOptions {
  onToast?: (message: string) => void;
  onBellRung?: () => void;
}

export class InteractablesSystem {
  private readonly registry = new Map<string, Interactable>();
  private bestCandidate: Interactable | null = null;
  private lastEvaluationTime = 0;
  private readonly evalInterval = 0.10; // 10 Hz

  // Bell swing state
  bellSwingMesh?: THREE.Object3D;
  private bellSwingAngle = 0;
  private bellSwingVelocity = 0;

  private readonly playerController: PlayerController;
  private readonly cameraRig?: CameraRig;
  private readonly options: InteractablesOptions;

  // Active seated state
  private isSeated = false;

  constructor(
    playerController: PlayerController,
    cameraRig?: CameraRig,
    options: InteractablesOptions = {},
  ) {
    this.playerController = playerController;
    this.cameraRig = cameraRig;
    this.options = options;

    this.registerBuiltinInteractables();
  }

  register(interactable: Interactable): void {
    this.registry.set(interactable.id, interactable);
  }

  unregister(id: string): void {
    this.registry.delete(id);
    if (this.bestCandidate?.id === id) {
      this.bestCandidate = null;
      sharedEngineBridge.mutable.prompt = null;
    }
  }

  private registerBuiltinInteractables(): void {
    // 1. "Ring the bell" at the bell spot
    const bellSpot = SPOTS.bell.position;
    this.register({
      id: 'spot-bell',
      kind: 'bell',
      position: new THREE.Vector3(bellSpot.x, bellSpot.y, bellSpot.z),
      radius: 2.4,
      label: 'the bell',
      verb: 'Ring',
      enabled: () => !this.isSeated && !this.playerController.isLocked(),
      onInteract: () => {
        // Face bell
        const toBellX = bellSpot.x - this.playerController.position.x;
        const toBellZ = bellSpot.z - this.playerController.position.z;
        this.playerController.targetFacing = Math.atan2(-toBellX, -toBellZ);

        // Perform arm gesture
        if (this.playerController.wanderer) {
          this.playerController.wanderer.setAnimationState('wave', 0.2);
          setTimeout(() => {
            if (!this.isSeated) {
              this.playerController.wanderer?.setAnimationState('idle', 0.2);
            }
          }, 1200);
        }

        // Trigger bell swing (damped pendulum)
        this.bellSwingVelocity = 0.45;

        // Camera gentle nudge
        if (this.cameraRig) {
          this.cameraRig.pitch += 0.04;
        }

        this.options.onBellRung?.();
      },
    });

    // 2. "Sit and watch" at Spirit Pond edge
    const pondEdgePos = new THREE.Vector3(-9.0, 0.05, -2.6);
    this.register({
      id: 'spot-pond-sit',
      kind: 'sit',
      position: pondEdgePos,
      radius: 2.5,
      label: 'the water',
      verb: 'Sit and watch',
      enabled: () => !this.isSeated && !this.playerController.isLocked(),
      onInteract: () => {
        this.sitAt(pondEdgePos, Math.PI); // Face water
      },
    });

    // Bench spot in Pavilion
    const pavilionBenchPos = new THREE.Vector3(12.0, 0.45, -6.0);
    this.register({
      id: 'spot-pavilion-bench',
      kind: 'sit',
      position: pavilionBenchPos,
      radius: 2.6,
      label: 'the valley',
      verb: 'Sit and watch',
      enabled: () => !this.isSeated && !this.playerController.isLocked(),
      onInteract: () => {
        this.sitAt(pavilionBenchPos, -Math.PI / 4);
      },
    });

    // 3. "Pass through the gate" at the sealed gate
    const gateSpot = SPOTS.gate.position;
    this.register({
      id: 'spot-gate',
      kind: 'gate',
      position: new THREE.Vector3(gateSpot.x, gateSpot.y, gateSpot.z),
      radius: 3.2,
      label: 'the gate',
      verb: 'Pass through',
      enabled: () => !this.isSeated,
      onInteract: () => {
        if (this.cameraRig) {
          this.cameraRig.pitch -= 0.05;
        }
        this.options.onToast?.('The path ahead is sealed.');
      },
    });
  }

  private sitAt(pos: THREE.Vector3, facing: number): void {
    this.isSeated = true;
    this.playerController.lock('seated');
    this.playerController.teleport(pos.x, pos.y, pos.z, facing);
    this.playerController.setState('sit');

    // Camera eases to low calm shot
    this.cameraRig?.pushShot({
      name: 'sit-shot',
      armDistance: 2.4,
      pitch: 0.08,
      duration: 1.2,
    });
  }

  standUp(): void {
    if (!this.isSeated) return;
    this.isSeated = false;
    this.playerController.unlock('seated');
    this.playerController.setState('idle');
    this.cameraRig?.popShot('sit-shot');
  }

  triggerInteraction(): boolean {
    if (this.isSeated) {
      this.standUp();
      return true;
    }
    if (this.bestCandidate && this.bestCandidate.enabled()) {
      this.bestCandidate.onInteract();
      return true;
    }
    return false;
  }

  /**
   * Main tick: update bell swing physics and 10 Hz candidate scoring.
   */
  update(dt: number, nowSeconds: number, hasMoveInput: boolean, cancelPressed: boolean): void {
    // If player is seated and starts moving or presses cancel, stand up
    if (this.isSeated && (hasMoveInput || cancelPressed)) {
      this.standUp();
    }

    // Bell pendulum physics (damped harmonic oscillator)
    if (this.bellSwingMesh) {
      this.bellSwingMesh.userData.drivenByInteractables = true;
    }

    if (Math.abs(this.bellSwingVelocity) > 0.001 || Math.abs(this.bellSwingAngle) > 0.001) {
      const stiffness = 22.0;
      const damping = 3.2;
      const force = -stiffness * this.bellSwingAngle - damping * this.bellSwingVelocity;
      this.bellSwingVelocity += force * dt;
      this.bellSwingAngle += this.bellSwingVelocity * dt;

      if (this.bellSwingMesh) {
        this.bellSwingMesh.rotation.z = this.bellSwingAngle;
      }
    } else if (this.bellSwingMesh) {
      this.bellSwingMesh.rotation.z = Math.sin(nowSeconds * 1.8) * 0.035;
    }

    // 10 Hz candidate evaluation
    if (nowSeconds - this.lastEvaluationTime >= this.evalInterval) {
      this.lastEvaluationTime = nowSeconds;
      this.evaluateCandidates();
    }
  }

  private evaluateCandidates(): void {
    const pPos = this.playerController.position;
    const pFacing = this.playerController.facing;

    // Player forward direction (facing 0 is -z)
    const pDirX = -Math.sin(pFacing);
    const pDirZ = -Math.cos(pFacing);

    let highestScore = -Infinity;
    let chosen: Interactable | null = null;

    for (const item of this.registry.values()) {
      if (!item.enabled()) continue;

      const dx = item.position.x - pPos.x;
      const dz = item.position.z - pPos.z;
      const dist = Math.hypot(dx, dz);

      if (dist <= item.radius) {
        // Normalised direction to interactable
        const toX = dx / Math.max(0.001, dist);
        const toZ = dz / Math.max(0.001, dist);
        const dot = pDirX * toX + pDirZ * toZ;

        // Candidate valid if dot > 0.2 or very close (within 1.2 m)
        if (dot > 0.2 || dist < 1.2) {
          // Score prioritises distance and facing, with hysteresis bonus if already selected
          let score = (1.0 - dist / item.radius) * 0.7 + Math.max(0, dot) * 0.3;
          if (this.bestCandidate?.id === item.id) {
            score += 0.25; // Hysteresis bonus
          }

          if (score > highestScore) {
            highestScore = score;
            chosen = item;
          }
        }
      }
    }

    this.bestCandidate = chosen;

    // Publish to Engine Bridge
    if (this.bestCandidate) {
      sharedEngineBridge.mutable.prompt = {
        id: this.bestCandidate.id,
        label: `${this.bestCandidate.verb} ${this.bestCandidate.label}`,
        keycap: 'E',
      };
    } else {
      sharedEngineBridge.mutable.prompt = null;
    }
  }

  getBestCandidate(): Interactable | null {
    return this.bestCandidate;
  }

  dispose(): void {
    this.registry.clear();
    this.bestCandidate = null;
    sharedEngineBridge.mutable.prompt = null;
  }
}
