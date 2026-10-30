import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  InputManager,
  PlayerController,
  normalizeTouchStick,
  CameraRig,
  InteractablesSystem,
  type InputState,
} from '@/engine/locomotion';
import type { DeviceProfile } from '@/lib/deviceProfile';
import { sharedEngineBridge } from '@/state/worldBridgeStore';

const mockDesktopDevice: DeviceProfile = {
  gpuTier: 2,
  deviceClass: 'desktop',
  deviceMemory: 8,
  isSoftwareGl: false,
  dprCap: 2,
  cloudPuffCount: 60,
  starDensity: 1.0,
  skyExtraHalo: true,
  reducedMotion: false,
};

const mockPhoneDevice: DeviceProfile = {
  gpuTier: 1,
  deviceClass: 'phone',
  deviceMemory: 4,
  isSoftwareGl: false,
  dprCap: 1.5,
  cloudPuffCount: 28,
  starDensity: 0.6,
  skyExtraHalo: false,
  reducedMotion: false,
};

test('Step 13: InputManager normalized state and trigger consumption', () => {
  // Create mock DOM element if in Node test environment
  const mockEl = {
    addEventListener: () => {},
    removeEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    setPointerCapture: () => {},
    releasePointerCapture: () => {},
  } as unknown as HTMLElement;

  const inputManager = new InputManager(mockEl);

  // Initial sample should be neutral
  const initial = inputManager.sample();
  assert.equal(initial.moveX, 0);
  assert.equal(initial.moveY, 0);
  assert.equal(initial.run, false);
  assert.equal(initial.interact, false);
  assert.equal(initial.cancel, false);

  // Test one-shot trigger consumption
  inputManager.triggerInteract();
  const sample1 = inputManager.sample();
  assert.equal(sample1.interact, true);

  // Subsequent sample should automatically reset interact to false
  const sample2 = inputManager.sample();
  assert.equal(sample2.interact, false);

  // Test cancel trigger
  inputManager.triggerCancel();
  const sampleCancel = inputManager.sample();
  assert.equal(sampleCancel.cancel, true);
  assert.equal(inputManager.sample().cancel, false);

  inputManager.dispose();
});

test('Step 13: PlayerController kinematic properties, speeds, and state machine', () => {
  const controller = new PlayerController(undefined, { assistedMovement: false });

  // 1. Physical constants
  assert.equal(controller.radius, 0.3);
  assert.equal(controller.height, 1.7);
  assert.equal(controller.walkSpeed, 2.0);
  assert.equal(controller.runSpeed, 3.6);
  assert.equal(controller.acceleration, 7.0);
  assert.equal(controller.deceleration, 12.0);

  // 2. Initial state
  assert.equal(controller.getState(), 'idle');
  const snap = controller.getSnapshot();
  assert.equal(snap.state, 'idle');
  assert.equal(snap.speed01, 0);

  // 3. Movement update under walk input
  const walkInput: InputState = {
    moveX: 0,
    moveY: 1.0, // Forward
    lookDeltaYaw: 0,
    lookDeltaPitch: 0,
    run: false,
    interact: false,
    cancel: false,
  };

  // Step 10 frames at 60 fps (dt = 0.016 s)
  for (let i = 0; i < 10; i++) {
    controller.update(0.016, walkInput, 0);
  }

  assert.ok(controller.speed01 > 0, 'Speed must accelerate');
  assert.ok(controller.position.z !== 14, 'Player position must advance');
  assert.equal(controller.getState(), 'walk');

  // 4. Movement update under run input
  const runInput: InputState = { ...walkInput, run: true };
  for (let i = 0; i < 25; i++) {
    controller.update(0.016, runInput, 0);
  }
  assert.equal(controller.getState(), 'run');
  assert.ok(controller.speed01 > 0.5, 'Run speed should exceed 50% max speed');

  // 5. Deceleration to rest
  const idleInput: InputState = { ...walkInput, moveY: 0 };
  for (let i = 0; i < 30; i++) {
    controller.update(0.016, idleInput, 0);
  }
  assert.equal(controller.getState(), 'idle');
  assert.equal(controller.speed01, 0);

  // 6. Lock and unlock
  controller.lock('seated');
  assert.equal(controller.isLocked(), true);
  controller.update(0.016, runInput, 0);
  assert.equal(controller.speed01, 0, 'Locked controller must not accelerate');
  controller.unlock('seated');
  assert.equal(controller.isLocked(), false);

  controller.dispose();
});

test('Touch stick has a deadzone and fixed, bounded travel', () => {
  const idle = normalizeTouchStick(3, 2);
  assert.equal(idle.moveX, 0);
  assert.equal(idle.moveY, 0);

  const full = normalizeTouchStick(300, 0);
  assert.ok(Math.abs(full.moveX - 1) < 1e-6);
  assert.equal(full.moveY, 0);
  assert.equal(full.knobX, 36);
  assert.equal(full.knobY, 0);
  assert.equal(full.magnitude, 1);

  const diagonal = normalizeTouchStick(300, -300);
  assert.ok(Math.hypot(diagonal.moveX, diagonal.moveY) <= 1.001);
  assert.ok(Math.hypot(diagonal.knobX, diagonal.knobY) <= 36.001);
});

test('PlayerController coasts naturally after the movement stick is released', () => {
  const controller = new PlayerController();
  const forward: InputState = {
    moveX: 0, moveY: 1, lookDeltaYaw: 0, lookDeltaPitch: 0,
    run: false, interact: false, cancel: false,
  };
  for (let i = 0; i < 18; i++) controller.update(0.016, forward, 0);
  const releasePosition = controller.position.z;
  const releaseSpeed = controller.speed01;

  const idle: InputState = { ...forward, moveY: 0 };
  for (let i = 0; i < 4; i++) controller.update(0.016, idle, 0);

  assert.ok(controller.position.z < releasePosition, 'Character should coast forward while slowing down');
  assert.ok(controller.speed01 < releaseSpeed, 'Speed should decrease smoothly');
  controller.dispose();
});

test('Step 13: PlayerController edge damping and warning toast', () => {
  let toastReceived = '';
  const controller = new PlayerController(undefined, {
    onEdgeToast: (msg) => {
      toastReceived = msg;
    },
  });

  // Teleport near Island A edge (radius 26m at angle 0 -> t > 0.93 at x = 24.8m)
  controller.teleport(24.8, 0, 0);

  const edgeInput: InputState = {
    moveX: 1.0,
    moveY: 0,
    lookDeltaYaw: 0,
    lookDeltaPitch: 0,
    run: true,
    interact: false,
    cancel: false,
  };

  // Update controller at the edge
  controller.update(0.016, edgeInput, 0, undefined, 100.0);

  assert.equal(toastReceived, 'The mist is too thick to go further.');

  controller.dispose();
});

test('Step 13: CameraRig third-person spring arm, pitch clamps, and hall closer arm', () => {
  const camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.1, 1000);
  const rigDesktop = new CameraRig(camera, mockDesktopDevice);

  // 1. Initial pitch and limits
  assert.ok(rigDesktop.pitch >= -0.52 && rigDesktop.pitch <= 0.96);

  // Pitch clamp test
  rigDesktop.update(0.016, new THREE.Vector3(0, 0, 0), 0, 0, 0, 5.0, false);
  assert.ok(rigDesktop.pitch <= 0.96 + 1e-4, 'Pitch must clamp at upper limit (+55 deg)');

  rigDesktop.update(0.016, new THREE.Vector3(0, 0, 0), 0, 0, 0, -10.0, false);
  assert.ok(rigDesktop.pitch >= -0.52 - 1e-4, 'Pitch must clamp at lower limit (-30 deg)');

  // 2. Keep FOV stable during movement for a calmer camera.
  const initialFov = camera.fov;
  for (let i = 0; i < 30; i++) {
    rigDesktop.update(0.016, new THREE.Vector3(0, 0, 0), 0, 1.0, 0, 0, true);
  }
  assert.ok(Math.abs(camera.fov - initialFov) < 0.05, 'Camera FOV should remain steady while running');

  // 3. Phone device configuration test
  const rigPhone = new CameraRig(camera, mockPhoneDevice);
  // Phone starts with shoulder offset 0 and longer arm distance 3.8m
  rigPhone.update(0.016, new THREE.Vector3(0, 0, 0), 0, 0, 0, 0, false);
  assert.ok(camera.position.length() > 3.0, 'Phone arm distance must be maintained');

  // 4. Push/pop shot override
  rigDesktop.pushShot({
    name: 'test-shot',
    armDistance: 2.0,
    pitch: 0.1,
  });

  for (let i = 0; i < 20; i++) {
    rigDesktop.update(0.016, new THREE.Vector3(0, 0, 0), 0, 0, 0, 0, false);
  }
  assert.ok(Math.abs(rigDesktop.pitch - 0.1) < 0.05, 'Shot pitch should blend');

  rigDesktop.popShot('test-shot');
  rigDesktop.dispose();
  rigPhone.dispose();
});

test('Step 13: InteractablesSystem candidate scoring, bell ringing, and seated state', () => {
  const controller = new PlayerController();
  const camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.1, 1000);
  const rig = new CameraRig(camera, mockDesktopDevice);

  let bellRung = false;
  let toastMsg = '';

  const interactables = new InteractablesSystem(controller, rig, {
    onBellRung: () => {
      bellRung = true;
    },
    onToast: (msg) => {
      toastMsg = msg;
    },
  });

  // Attach a mock bell mesh
  const mockBellMesh = new THREE.Object3D();
  interactables.bellSwingMesh = mockBellMesh;

  // 1. Move player near the bell spot (5.5, 0.22, -16.0)
  controller.teleport(5.5, 0.22, -15.2, 0);

  // Update candidate scoring (10 Hz)
  interactables.update(0.016, 1.0, false, false);

  const best = interactables.getBestCandidate();
  assert.ok(best !== null, 'Should detect bell as candidate');
  assert.equal(best.kind, 'bell');
  assert.ok(sharedEngineBridge.mutable.prompt !== null, 'Bridge prompt should be published');
  assert.equal(sharedEngineBridge.mutable.prompt?.id, 'spot-bell');

  // 2. Trigger bell interaction
  const triggered = interactables.triggerInteraction();
  assert.equal(triggered, true);
  assert.equal(bellRung, true);

  // Update bell swing physics
  for (let i = 0; i < 5; i++) {
    interactables.update(0.016, 1.0 + i * 0.016, false, false);
  }
  assert.ok(mockBellMesh.rotation.z !== 0, 'Bell mesh should swing via pendulum physics');

  // 3. Move player near sealed gate (0, 0, -21)
  controller.teleport(0, 0, -19.5, 0);
  interactables.update(0.016, 2.0, false, false);

  const gateCandidate = interactables.getBestCandidate();
  assert.ok(gateCandidate !== null && gateCandidate.kind === 'gate');
  interactables.triggerInteraction();
  assert.equal(toastMsg, 'The path ahead is sealed.');

  // 4. Move player near Spirit Pond sit spot (-9.0, 0.05, -2.6)
  controller.teleport(-9.0, 0.05, -2.4, 0);
  interactables.update(0.016, 3.0, false, false);

  const sitCandidate = interactables.getBestCandidate();
  assert.ok(sitCandidate !== null && sitCandidate.kind === 'sit');
  interactables.triggerInteraction();
  assert.equal(controller.isLocked(), true, 'Player should be locked while seated');
  assert.equal(controller.getState(), 'sit');

  // Stand up when moving input is pressed
  interactables.update(0.016, 4.0, true, false);
  assert.equal(controller.isLocked(), false, 'Player should unlock upon standing up');
  assert.equal(controller.getState(), 'idle');

  interactables.dispose();
  controller.dispose();
  rig.dispose();
});
