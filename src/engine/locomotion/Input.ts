import { haptic } from '@/lib/motion';

export interface InputState {
  moveX: number; // -1 (left) .. +1 (right)
  moveY: number; // -1 (backward) .. +1 (forward)
  lookDeltaYaw: number; // radians
  lookDeltaPitch: number; // radians
  run: boolean;
  interact: boolean;
  cancel: boolean;
}

export interface InputOptions {
  assistedMovement?: boolean;
  reducedMotion?: boolean;
}

export class InputManager {
  private readonly targetElement: HTMLElement;
  private options: InputOptions;
  private locked = false;

  // Active state read each frame
  private readonly state: InputState = {
    moveX: 0,
    moveY: 0,
    lookDeltaYaw: 0,
    lookDeltaPitch: 0,
    run: false,
    interact: false,
    cancel: false,
  };

  // One-shot flags consumed on read
  private interactTriggered = false;
  private cancelTriggered = false;

  // Keyboard state
  private readonly keysDown = new Set<string>();

  // Pointer / Touch tracking
  private movePointerId: number | null = null;
  private lookPointerId: number | null = null;
  private moveTouchStart = { x: 0, y: 0 };
  private moveTouchCurrent = { x: 0, y: 0 };
  private lookTouchLast = { x: 0, y: 0 };
  private isMouseDragging = false;
  private mouseLast = { x: 0, y: 0 };

  // Joystick DOM elements
  private joystickContainer: HTMLDivElement | null = null;
  private joystickRing: HTMLDivElement | null = null;
  private joystickKnob: HTMLDivElement | null = null;
  private wasRunningHapticFired = false;

  // Clean-up callbacks
  private readonly unbindCallbacks: (() => void)[] = [];

  constructor(targetElement: HTMLElement, options: InputOptions = {}) {
    this.targetElement = targetElement;
    this.options = options;

    if (typeof window !== 'undefined') {
      this.createJoystickDOM();
      this.bindEvents();
    }
  }

  setOptions(options: Partial<InputOptions>): void {
    this.options = { ...this.options, ...options };
  }

  setLocked(locked: boolean): void {
    this.locked = locked;
    if (locked) {
      this.reset();
    }
  }

  isLocked(): boolean {
    return this.locked;
  }

  private createJoystickDOM(): void {
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '0';
    container.style.top = '0';
    container.style.width = '100vw';
    container.style.height = '100vh';
    container.style.pointerEvents = 'none';
    container.style.zIndex = '45';
    container.style.display = 'none';

    // Outer ring: 112 px
    const ring = document.createElement('div');
    ring.style.position = 'absolute';
    ring.style.width = '112px';
    ring.style.height = '112px';
    ring.style.borderRadius = '9999px';
    ring.style.border = '1px solid rgba(23, 20, 31, 0.16)';
    ring.style.background = 'rgba(255, 255, 255, 0.40)';
    ring.style.backdropFilter = 'blur(10px)';
    ring.style.setProperty('-webkit-backdrop-filter', 'blur(10px)');
    ring.style.boxShadow = '0 4px 16px rgba(45, 38, 62, 0.08)';
    ring.style.transform = 'translate3d(-50%, -50%, 0)';
    ring.style.transition = 'opacity 0.15s ease-out';
    ring.style.opacity = '0';

    // Inner knob: 48 px
    const knob = document.createElement('div');
    knob.style.position = 'absolute';
    knob.style.width = '48px';
    knob.style.height = '48px';
    knob.style.borderRadius = '9999px';
    knob.style.border = '1px solid rgba(23, 20, 31, 0.18)';
    knob.style.background = 'rgba(255, 255, 255, 0.85)';
    knob.style.boxShadow = '0 2px 8px rgba(45, 38, 62, 0.12)';
    knob.style.left = '32px';
    knob.style.top = '32px';
    knob.style.transform = 'translate3d(0, 0, 0)';
    knob.style.willChange = 'transform';

    ring.appendChild(knob);
    container.appendChild(ring);
    document.body.appendChild(container);

    this.joystickContainer = container;
    this.joystickRing = ring;
    this.joystickKnob = knob;
  }

  private bindEvents(): void {
    const el = this.targetElement;

    // Keyboard
    const onKeyDown = (e: KeyboardEvent) => {
      if (this.locked) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      this.keysDown.add(e.code);

      if (e.code === 'KeyE' || e.code === 'Enter') {
        this.interactTriggered = true;
      }
      if (e.code === 'Escape') {
        this.cancelTriggered = true;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      this.keysDown.delete(e.code);
    };

    const onBlur = () => {
      this.keysDown.clear();
      this.resetTouchState();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    // Pointer events (Touch & Mouse)
    const onPointerDown = (e: PointerEvent) => {
      if (this.locked) return;

      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const w = rect.width;
      const h = rect.height;

      // Ignore touches that begin within 20 px of screen edges (system gestures)
      if (e.pointerType === 'touch') {
        if (e.clientX < 20 || e.clientX > window.innerWidth - 20 ||
            e.clientY < 20 || e.clientY > window.innerHeight - 20) {
          return;
        }
      }

      if (e.pointerType === 'touch') {
        // Lower-left 50% for movement joystick
        if (x < w * 0.5 && y > h * 0.45 && this.movePointerId === null) {
          this.movePointerId = e.pointerId;
          this.moveTouchStart = { x: e.clientX, y: e.clientY };
          this.moveTouchCurrent = { x: e.clientX, y: e.clientY };
          this.showJoystick(e.clientX, e.clientY);
          try {
            el.setPointerCapture(e.pointerId);
          } catch {
            // Non-critical if capture fails
          }
          return;
        }

        // Right 50% for drag-to-look
        if (x >= w * 0.45 && this.lookPointerId === null) {
          this.lookPointerId = e.pointerId;
          this.lookTouchLast = { x: e.clientX, y: e.clientY };
          try {
            el.setPointerCapture(e.pointerId);
          } catch {
            // Non-critical
          }
          return;
        }
      } else if (e.pointerType === 'mouse') {
        if (e.button === 0) {
          this.isMouseDragging = true;
          this.mouseLast = { x: e.clientX, y: e.clientY };
        }
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (this.locked) return;

      if (e.pointerId === this.movePointerId) {
        this.moveTouchCurrent = { x: e.clientX, y: e.clientY };
        this.updateJoystickKnob();
      } else if (e.pointerId === this.lookPointerId) {
        const dx = e.clientX - this.lookTouchLast.x;
        const dy = e.clientY - this.lookTouchLast.y;
        this.lookTouchLast = { x: e.clientX, y: e.clientY };

        // Scale by viewport size: standard ~0.0045 rad/px
        const scale = 1.0 / Math.max(0.6, window.devicePixelRatio || 1);
        const sens = 0.0045 * scale;
        this.state.lookDeltaYaw -= dx * sens;
        this.state.lookDeltaPitch -= dy * sens;
      } else if (this.isMouseDragging && e.pointerType === 'mouse') {
        const dx = e.clientX - this.mouseLast.x;
        const dy = e.clientY - this.mouseLast.y;
        this.mouseLast = { x: e.clientX, y: e.clientY };

        const sens = 0.0022;
        this.state.lookDeltaYaw -= dx * sens;
        this.state.lookDeltaPitch -= dy * sens;
      }
    };

    const onPointerUpOrCancel = (e: PointerEvent) => {
      if (e.pointerId === this.movePointerId) {
        this.movePointerId = null;
        this.hideJoystick();
      }
      if (e.pointerId === this.lookPointerId) {
        this.lookPointerId = null;
      }
      if (e.pointerType === 'mouse' && e.button === 0) {
        this.isMouseDragging = false;
      }
    };

    // Pointer lock for desktop mouse click look
    const onCanvasClick = (e: MouseEvent) => {
      if (this.locked) return;
      if ('pointerType' in e && (e as unknown as { pointerType: string }).pointerType === 'touch') return;
      if (document.pointerLockElement !== el && !this.isMouseDragging) {
        // Optional pointer lock request on desktop
        try {
          el.requestPointerLock?.();
        } catch {
          // Ignore
        }
      }
    };

    const onPointerLockMove = (e: MouseEvent) => {
      if (this.locked) return;
      if (document.pointerLockElement === el) {
        const sens = 0.0022;
        this.state.lookDeltaYaw -= e.movementX * sens;
        this.state.lookDeltaPitch -= e.movementY * sens;
      }
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUpOrCancel);
    el.addEventListener('pointercancel', onPointerUpOrCancel);
    el.addEventListener('click', onCanvasClick);
    document.addEventListener('mousemove', onPointerLockMove);

    // Pause input on tab hidden
    const onVisibilityChange = () => {
      if (document.hidden) {
        this.reset();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    this.unbindCallbacks.push(
      () => window.removeEventListener('keydown', onKeyDown),
      () => window.removeEventListener('keyup', onKeyUp),
      () => window.removeEventListener('blur', onBlur),
      () => el.removeEventListener('pointerdown', onPointerDown),
      () => el.removeEventListener('pointermove', onPointerMove),
      () => el.removeEventListener('pointerup', onPointerUpOrCancel),
      () => el.removeEventListener('pointercancel', onPointerUpOrCancel),
      () => el.removeEventListener('click', onCanvasClick),
      () => document.removeEventListener('mousemove', onPointerLockMove),
      () => document.removeEventListener('visibilitychange', onVisibilityChange),
    );
  }

  private showJoystick(clientX: number, clientY: number): void {
    if (!this.joystickContainer || !this.joystickRing) return;
    this.joystickContainer.style.display = 'block';
    this.joystickRing.style.left = `${clientX}px`;
    this.joystickRing.style.top = `${clientY}px`;
    this.joystickRing.style.opacity = '1';
    if (this.joystickKnob) {
      this.joystickKnob.style.transform = 'translate3d(0, 0, 0)';
    }
    this.wasRunningHapticFired = false;
  }

  private hideJoystick(): void {
    if (!this.joystickRing) return;
    this.joystickRing.style.opacity = '0';
    setTimeout(() => {
      if (this.movePointerId === null && this.joystickContainer) {
        this.joystickContainer.style.display = 'none';
      }
    }, 150);
    this.state.moveX = 0;
    this.state.moveY = 0;
    this.state.run = false;
    this.wasRunningHapticFired = false;
  }

  private updateJoystickKnob(): void {
    if (!this.joystickKnob) return;
    const dx = this.moveTouchCurrent.x - this.moveTouchStart.x;
    const dy = this.moveTouchCurrent.y - this.moveTouchStart.y;
    const dist = Math.hypot(dx, dy);

    const maxTravel = 56; // px
    const deadzone = this.options.assistedMovement ? 0.24 : 0.12;

    const clampedDist = Math.min(dist, maxTravel);
    const angle = Math.atan2(dy, dx);
    const knobX = Math.cos(angle) * clampedDist;
    const knobY = Math.sin(angle) * clampedDist;

    this.joystickKnob.style.transform = `translate3d(${knobX}px, ${knobY}px, 0)`;

    // Normalised magnitude 0..1
    const norm = clampedDist / maxTravel;
    if (norm < deadzone) {
      this.state.moveX = 0;
      this.state.moveY = 0;
      this.state.run = false;
      return;
    }

    // Response curve x^1.4
    const remapped = (norm - deadzone) / (1 - deadzone);
    const curved = Math.pow(remapped, 1.4);

    this.state.moveX = Math.cos(angle) * curved;
    this.state.moveY = -Math.sin(angle) * curved; // Forward is +Y in input space

    // Run when joystick passes 85%
    const isRunning = norm >= 0.85;
    if (isRunning && !this.wasRunningHapticFired) {
      haptic('soft');
      this.wasRunningHapticFired = true;
    } else if (!isRunning) {
      this.wasRunningHapticFired = false;
    }
    this.state.run = isRunning;
  }

  triggerInteract(): void {
    this.interactTriggered = true;
  }

  triggerCancel(): void {
    this.cancelTriggered = true;
  }

  /**
   * Reads and polls the input state for the current frame.
   * Clears transient delta terms.
   */
  sample(): Readonly<InputState> {
    if (this.locked) {
      return {
        moveX: 0,
        moveY: 0,
        lookDeltaYaw: 0,
        lookDeltaPitch: 0,
        run: false,
        interact: false,
        cancel: false,
      };
    }

    // 1. Process keyboard if touch not active
    if (this.movePointerId === null) {
      let kx = 0;
      let ky = 0;
      if (this.keysDown.has('KeyA') || this.keysDown.has('ArrowLeft')) kx -= 1;
      if (this.keysDown.has('KeyD') || this.keysDown.has('ArrowRight')) kx += 1;
      if (this.keysDown.has('KeyW') || this.keysDown.has('ArrowUp')) ky += 1;
      if (this.keysDown.has('KeyS') || this.keysDown.has('ArrowDown')) ky -= 1;

      const len = Math.hypot(kx, ky);
      if (len > 0.001) {
        this.state.moveX = kx / len;
        this.state.moveY = ky / len;
      } else {
        this.state.moveX = 0;
        this.state.moveY = 0;
      }

      this.state.run = this.keysDown.has('ShiftLeft') || this.keysDown.has('ShiftRight');
    }

    // 2. Poll Gamepad
    this.pollGamepad();

    // 3. One-shot triggers
    this.state.interact = this.interactTriggered;
    this.state.cancel = this.cancelTriggered;
    this.interactTriggered = false;
    this.cancelTriggered = false;

    // Snapshot
    const outYaw = this.state.lookDeltaYaw;
    const outPitch = this.state.lookDeltaPitch;

    // Reset frame deltas
    this.state.lookDeltaYaw = 0;
    this.state.lookDeltaPitch = 0;

    return {
      moveX: this.state.moveX,
      moveY: this.state.moveY,
      lookDeltaYaw: outYaw,
      lookDeltaPitch: outPitch,
      run: this.state.run,
      interact: this.state.interact,
      cancel: this.state.cancel,
    };
  }

  private pollGamepad(): void {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    const gamepads = navigator.getGamepads();
    const gp = gamepads[0] || gamepads[1];
    if (!gp) return;

    // Axes 0, 1: Move
    const lx = gp.axes[0] ?? 0;
    const ly = gp.axes[1] ?? 0;
    const deadzone = this.options.assistedMovement ? 0.20 : 0.12;
    const dist = Math.hypot(lx, ly);

    if (dist > deadzone) {
      const remapped = (dist - deadzone) / (1 - deadzone);
      const curved = Math.pow(remapped, 1.4);
      const angle = Math.atan2(ly, lx);
      this.state.moveX = Math.cos(angle) * curved;
      this.state.moveY = -Math.sin(angle) * curved;
    }

    // Axes 2, 3: Look
    const rx = gp.axes[2] ?? 0;
    const ry = gp.axes[3] ?? 0;
    if (Math.hypot(rx, ry) > 0.12) {
      const sens = 0.045;
      this.state.lookDeltaYaw -= rx * sens;
      this.state.lookDeltaPitch -= ry * sens;
    }

    // Buttons: 0=A (interact), 1=B (cancel), 7=RT (run)
    if (gp.buttons[0]?.pressed) this.interactTriggered = true;
    if (gp.buttons[1]?.pressed) this.cancelTriggered = true;
    if (gp.buttons[6]?.pressed || gp.buttons[7]?.pressed || gp.buttons[10]?.pressed) {
      this.state.run = true;
    }
  }

  private resetTouchState(): void {
    this.movePointerId = null;
    this.lookPointerId = null;
    this.isMouseDragging = false;
    this.hideJoystick();
  }

  reset(): void {
    this.keysDown.clear();
    this.resetTouchState();
    this.state.moveX = 0;
    this.state.moveY = 0;
    this.state.lookDeltaYaw = 0;
    this.state.lookDeltaPitch = 0;
    this.state.run = false;
    this.state.interact = false;
    this.state.cancel = false;
    this.interactTriggered = false;
    this.cancelTriggered = false;
  }

  dispose(): void {
    this.reset();
    for (const unbind of this.unbindCallbacks) {
      unbind();
    }
    this.unbindCallbacks.length = 0;
    if (this.joystickContainer && this.joystickContainer.parentNode) {
      this.joystickContainer.parentNode.removeChild(this.joystickContainer);
    }
  }
}
