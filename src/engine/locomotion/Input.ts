export interface InputState {
  moveX: number;
  moveY: number;
  lookDeltaYaw: number;
  lookDeltaPitch: number;
  run: boolean;
  interact: boolean;
  cancel: boolean;
}

export interface InputOptions {
  assistedMovement?: boolean;
  reducedMotion?: boolean;
}

export const TOUCH_STICK_RADIUS = 36;
export const TOUCH_STICK_DEADZONE = 0.18;

export interface NormalizedStick {
  moveX: number;
  moveY: number;
  knobX: number;
  knobY: number;
  magnitude: number;
}

/** Converts a thumb displacement into a stable, bounded movement vector. */
export function normalizeTouchStick(
  dx: number,
  dy: number,
  maxTravel = TOUCH_STICK_RADIUS,
  deadzone = TOUCH_STICK_DEADZONE,
): NormalizedStick {
  const distance = Math.hypot(dx, dy);
  if (distance <= 0.0001 || maxTravel <= 0) {
    return { moveX: 0, moveY: 0, knobX: 0, knobY: 0, magnitude: 0 };
  }

  const clampedDistance = Math.min(distance, maxTravel);
  const magnitude = clampedDistance / maxTravel;
  const knobScale = clampedDistance / distance;
  const knobX = dx * knobScale;
  const knobY = dy * knobScale;

  if (magnitude <= deadzone) {
    return { moveX: 0, moveY: 0, knobX, knobY, magnitude };
  }

  const remapped = (magnitude - deadzone) / (1 - deadzone);
  const strength = Math.pow(remapped, 1.15);
  return {
    // Canonicalize zero so axis-aligned vectors never leak -0 into state/tests.
    moveX: dx === 0 ? 0 : (dx / distance) * strength,
    moveY: dy === 0 ? 0 : -(dy / distance) * strength,
    knobX,
    knobY,
    magnitude,
  };
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  ) {
    return true;
  }
  return target.getAttribute('role') === 'textbox';
}

export class InputManager {
  private readonly targetElement: HTMLElement;
  private options: InputOptions;
  private locked = false;

  private readonly state: InputState = {
    moveX: 0,
    moveY: 0,
    lookDeltaYaw: 0,
    lookDeltaPitch: 0,
    run: false,
    interact: false,
    cancel: false,
  };

  private interactTriggered = false;
  private cancelTriggered = false;
  private readonly keysDown = new Set<string>();

  private movePointerId: number | null = null;
  private lookPointerId: number | null = null;
  private moveTouchStart = { x: 0, y: 0 };
  private moveTouchCurrent = { x: 0, y: 0 };
  private lookTouchLast = { x: 0, y: 0 };
  private isMouseDragging = false;
  private mouseLast = { x: 0, y: 0 };
  private touchRunHeld = false;
  private runPointerId: number | null = null;

  private controlsContainer: HTMLDivElement | null = null;
  private joystickRing: HTMLDivElement | null = null;
  private joystickKnob: HTMLDivElement | null = null;
  private runButton: HTMLButtonElement | null = null;
  private originalTouchAction = '';

  private readonly unbindCallbacks: (() => void)[] = [];

  constructor(targetElement: HTMLElement, options: InputOptions = {}) {
    this.targetElement = targetElement;
    this.options = options;

    if (typeof window !== 'undefined') {
      this.originalTouchAction = targetElement.style.touchAction;
      targetElement.style.touchAction = 'none';
      this.createControlsDOM();
      this.bindEvents();
    }
  }

  setOptions(options: Partial<InputOptions>): void {
    this.options = { ...this.options, ...options };
  }

  setLocked(locked: boolean): void {
    this.locked = locked;
    if (this.controlsContainer) {
      this.controlsContainer.style.display = locked ? 'none' : 'block';
    }
    if (locked) this.reset();
  }

  isLocked(): boolean {
    return this.locked;
  }

  private createControlsDOM(): void {
    const isTouchDevice =
      (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) ||
      window.matchMedia('(pointer: coarse)').matches;
    if (!isTouchDevice) return;

    const container = document.createElement('div');
    container.setAttribute('aria-label', 'World movement controls');
    Object.assign(container.style, {
      position: 'fixed',
      inset: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: '45',
      display: 'none',
      fontFamily: "'Geist Variable', -apple-system, BlinkMacSystemFont, sans-serif",
      userSelect: 'none',
      WebkitUserSelect: 'none',
    });

    const moveLabel = document.createElement('div');
    moveLabel.textContent = 'MOVE  ·  HOLD & DRAG';
    Object.assign(moveLabel.style, {
      position: 'fixed',
      left: 'calc(env(safe-area-inset-left, 0px) + 28px)',
      bottom: 'calc(env(safe-area-inset-bottom, 0px) + 132px)',
      color: 'rgba(28, 27, 25, 0.68)',
      fontSize: '9px',
      fontWeight: '600',
      letterSpacing: '0.13em',
      whiteSpace: 'nowrap',
      textShadow: '0 1px 8px rgba(255,255,255,0.75)',
    });

    const lookLabel = document.createElement('div');
    lookLabel.textContent = 'DRAG TO LOOK';
    Object.assign(lookLabel.style, {
      position: 'fixed',
      right: 'calc(env(safe-area-inset-right, 0px) + 22px)',
      bottom: 'calc(env(safe-area-inset-bottom, 0px) + 132px)',
      color: 'rgba(28, 27, 25, 0.68)',
      fontSize: '9px',
      fontWeight: '600',
      letterSpacing: '0.13em',
      whiteSpace: 'nowrap',
      textShadow: '0 1px 8px rgba(255,255,255,0.75)',
    });

    const ring = document.createElement('div');
    ring.setAttribute('aria-hidden', 'true');
    Object.assign(ring.style, {
      position: 'fixed',
      left: 'calc(env(safe-area-inset-left, 0px) + 18px)',
      bottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)',
      width: '104px',
      height: '104px',
      borderRadius: '50%',
      border: '1px solid rgba(36, 34, 31, 0.18)',
      background: 'rgba(250, 249, 246, 0.42)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      boxShadow: '0 8px 28px rgba(28, 25, 22, 0.10), inset 0 1px 0 rgba(255,255,255,0.65)',
      opacity: '0.72',
      transition: 'opacity 140ms ease',
      pointerEvents: 'none',
      boxSizing: 'border-box',
    });

    const knob = document.createElement('div');
    Object.assign(knob.style, {
      position: 'absolute',
      width: '42px',
      height: '42px',
      left: '30px',
      top: '30px',
      borderRadius: '50%',
      border: '1px solid rgba(36, 34, 31, 0.20)',
      background: 'rgba(255, 255, 255, 0.88)',
      boxShadow: '0 2px 10px rgba(28, 25, 22, 0.14), inset 0 1px 0 rgba(255,255,255,0.95)',
      transform: 'translate3d(0, 0, 0)',
      willChange: 'transform',
      pointerEvents: 'none',
    });
    ring.appendChild(knob);

    const runButton = document.createElement('button');
    runButton.type = 'button';
    runButton.textContent = 'RUN';
    runButton.setAttribute('aria-label', 'Hold to run');
    runButton.setAttribute('aria-pressed', 'false');
    Object.assign(runButton.style, {
      position: 'fixed',
      right: 'calc(env(safe-area-inset-right, 0px) + 22px)',
      bottom: 'calc(env(safe-area-inset-bottom, 0px) + 48px)',
      width: '68px',
      height: '40px',
      borderRadius: '999px',
      border: '1px solid rgba(36, 34, 31, 0.18)',
      background: 'rgba(250, 249, 246, 0.90)',
      color: 'rgba(28, 27, 25, 0.82)',
      boxShadow: '0 6px 20px rgba(28, 25, 22, 0.10), inset 0 1px 0 rgba(255,255,255,0.85)',
      fontSize: '10px',
      fontWeight: '650',
      letterSpacing: '0.16em',
      pointerEvents: 'auto',
      touchAction: 'none',
      WebkitTapHighlightColor: 'transparent',
      cursor: 'pointer',
    });

    container.append(moveLabel, lookLabel, ring, runButton);
    document.body.appendChild(container);

    this.controlsContainer = container;
    this.joystickRing = ring;
    this.joystickKnob = knob;
    this.runButton = runButton;
  }

  private bindEvents(): void {
    const el = this.targetElement;

    const onKeyDown = (event: KeyboardEvent) => {
      if (this.locked || isEditableTarget(event.target)) return;
      this.keysDown.add(event.code);

      if (event.code === 'KeyE' || event.code === 'Enter') {
        this.interactTriggered = true;
      }
      if (event.code === 'Escape') {
        this.cancelTriggered = true;
      }
      if (event.code === 'Space' || event.code.startsWith('Arrow')) {
        event.preventDefault();
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      this.keysDown.delete(event.code);
    };

    const onBlur = () => {
      this.keysDown.clear();
      this.resetTouchState();
      this.touchRunHeld = false;
      this.updateRunButton();
    };

    const onPointerDown = (event: PointerEvent) => {
      if (this.locked) return;

      const rect = el.getBoundingClientRect();
      if (event.pointerType === 'touch') {
        const padRect = this.joystickRing?.getBoundingClientRect();
        const inMovePad = Boolean(
          padRect &&
            event.clientX >= padRect.left - 18 &&
            event.clientX <= padRect.right + 18 &&
            event.clientY >= padRect.top - 18 &&
            event.clientY <= padRect.bottom + 18,
        );

        if (inMovePad && this.movePointerId === null && padRect) {
          if (event.cancelable) event.preventDefault();
          this.movePointerId = event.pointerId;
          this.moveTouchStart = {
            x: padRect.left + padRect.width / 2,
            y: padRect.top + padRect.height / 2,
          };
          this.moveTouchCurrent = { x: event.clientX, y: event.clientY };
          this.showJoystick();
          try {
            el.setPointerCapture(event.pointerId);
          } catch {
            // Pointer capture is not required on every browser.
          }
          this.updateJoystickKnob();
          return;
        }

        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        if (
          x >= rect.width * 0.48 &&
          y < rect.height - 112 &&
          this.lookPointerId === null
        ) {
          if (event.cancelable) event.preventDefault();
          this.lookPointerId = event.pointerId;
          this.lookTouchLast = { x: event.clientX, y: event.clientY };
          try {
            el.setPointerCapture(event.pointerId);
          } catch {
            // Pointer capture is not required on every browser.
          }
        }
        return;
      }

      if (event.pointerType === 'mouse' && event.button === 0) {
        this.isMouseDragging = true;
        this.mouseLast = { x: event.clientX, y: event.clientY };
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (this.locked) return;

      if (event.pointerId === this.movePointerId) {
        if (event.cancelable) event.preventDefault();
        this.moveTouchCurrent = { x: event.clientX, y: event.clientY };
        this.updateJoystickKnob();
      } else if (event.pointerId === this.lookPointerId) {
        if (event.cancelable) event.preventDefault();
        const dx = event.clientX - this.lookTouchLast.x;
        const dy = event.clientY - this.lookTouchLast.y;
        this.lookTouchLast = { x: event.clientX, y: event.clientY };
        this.state.lookDeltaYaw -= THREEClamp(dx, 90) * 0.0032;
        this.state.lookDeltaPitch -= THREEClamp(dy, 90) * 0.0030;
      } else if (this.isMouseDragging && event.pointerType === 'mouse') {
        const dx = event.clientX - this.mouseLast.x;
        const dy = event.clientY - this.mouseLast.y;
        this.mouseLast = { x: event.clientX, y: event.clientY };
        this.state.lookDeltaYaw -= THREEClamp(dx, 120) * 0.0022;
        this.state.lookDeltaPitch -= THREEClamp(dy, 120) * 0.0022;
      }
    };

    const onPointerUpOrCancel = (event: PointerEvent) => {
      if (event.pointerId === this.movePointerId) {
        const pointerId = this.movePointerId;
        this.movePointerId = null;
        this.hideJoystick();
        try {
          if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
        } catch {
          // The browser may already have released the pointer.
        }
      }
      if (event.pointerId === this.lookPointerId) {
        const pointerId = this.lookPointerId;
        this.lookPointerId = null;
        try {
          if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
        } catch {
          // The browser may already have released the pointer.
        }
      }
      if (event.pointerType === 'mouse' && event.button === 0) {
        this.isMouseDragging = false;
      }
    };

    const onRunPointerDown = (event: PointerEvent) => {
      if (this.locked || event.button !== 0 && event.pointerType === 'mouse') return;
      if (event.cancelable) event.preventDefault();
      this.runPointerId = event.pointerId;
      this.touchRunHeld = true;
      this.updateRunButton();
      try {
        this.runButton?.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture is optional.
      }
    };

    const onRunPointerUp = (event: PointerEvent) => {
      if (this.runPointerId !== null && event.pointerId === this.runPointerId) {
        this.runPointerId = null;
        this.touchRunHeld = false;
        this.updateRunButton();
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) this.reset();
    };

    el.addEventListener('pointerdown', onPointerDown, { passive: false });
    el.addEventListener('pointermove', onPointerMove, { passive: false });
    el.addEventListener('pointerup', onPointerUpOrCancel);
    el.addEventListener('pointercancel', onPointerUpOrCancel);
    el.addEventListener('lostpointercapture', onPointerUpOrCancel);
    window.addEventListener('pointerup', onRunPointerUp);
    window.addEventListener('pointercancel', onRunPointerUp);
    this.runButton?.addEventListener('pointerdown', onRunPointerDown, { passive: false });
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    this.unbindCallbacks.push(
      () => el.removeEventListener('pointerdown', onPointerDown),
      () => el.removeEventListener('pointermove', onPointerMove),
      () => el.removeEventListener('pointerup', onPointerUpOrCancel),
      () => el.removeEventListener('pointercancel', onPointerUpOrCancel),
      () => el.removeEventListener('lostpointercapture', onPointerUpOrCancel),
      () => window.removeEventListener('pointerup', onRunPointerUp),
      () => window.removeEventListener('pointercancel', onRunPointerUp),
      () => this.runButton?.removeEventListener('pointerdown', onRunPointerDown),
      () => document.removeEventListener('visibilitychange', onVisibilityChange),
      () => window.removeEventListener('keydown', onKeyDown),
      () => window.removeEventListener('keyup', onKeyUp),
      () => window.removeEventListener('blur', onBlur),
    );
  }

  private showJoystick(): void {
    if (this.joystickRing) this.joystickRing.style.opacity = '0.98';
  }

  private hideJoystick(): void {
    if (this.joystickRing) this.joystickRing.style.opacity = '0.72';
    if (this.joystickKnob) {
      this.joystickKnob.style.transform = 'translate3d(0, 0, 0)';
    }
    this.state.moveX = 0;
    this.state.moveY = 0;
  }

  private updateJoystickKnob(): void {
    const dx = this.moveTouchCurrent.x - this.moveTouchStart.x;
    const dy = this.moveTouchCurrent.y - this.moveTouchStart.y;
    const stick = normalizeTouchStick(
      dx,
      dy,
      TOUCH_STICK_RADIUS,
      this.options.assistedMovement ? 0.22 : TOUCH_STICK_DEADZONE,
    );

    if (this.joystickKnob) {
      this.joystickKnob.style.transform = `translate3d(${stick.knobX}px, ${stick.knobY}px, 0)`;
    }
    this.state.moveX = stick.moveX;
    this.state.moveY = stick.moveY;
  }

  private updateRunButton(): void {
    if (!this.runButton) return;
    this.runButton.setAttribute('aria-pressed', String(this.touchRunHeld));
    this.runButton.style.background = this.touchRunHeld
      ? 'rgba(237, 231, 220, 0.98)'
      : 'rgba(250, 249, 246, 0.90)';
    this.runButton.style.borderColor = this.touchRunHeld
      ? 'rgba(36, 34, 31, 0.40)'
      : 'rgba(36, 34, 31, 0.18)';
    this.runButton.style.transform = this.touchRunHeld ? 'scale(0.97)' : 'scale(1)';
  }

  triggerInteract(): void {
    this.interactTriggered = true;
  }

  triggerCancel(): void {
    this.cancelTriggered = true;
  }

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

    if (this.movePointerId === null) {
      let kx = 0;
      let ky = 0;
      if (this.keysDown.has('KeyA') || this.keysDown.has('ArrowLeft')) kx -= 1;
      if (this.keysDown.has('KeyD') || this.keysDown.has('ArrowRight')) kx += 1;
      if (this.keysDown.has('KeyW') || this.keysDown.has('ArrowUp')) ky += 1;
      if (this.keysDown.has('KeyS') || this.keysDown.has('ArrowDown')) ky -= 1;

      const length = Math.hypot(kx, ky);
      this.state.moveX = length > 0.001 ? kx / length : 0;
      this.state.moveY = length > 0.001 ? ky / length : 0;
    }

    const gamepadRun = this.pollGamepad();
    this.state.run =
      this.keysDown.has('ShiftLeft') ||
      this.keysDown.has('ShiftRight') ||
      this.touchRunHeld ||
      gamepadRun;

    this.state.interact = this.interactTriggered;
    this.state.cancel = this.cancelTriggered;
    this.interactTriggered = false;
    this.cancelTriggered = false;

    const outYaw = this.state.lookDeltaYaw;
    const outPitch = this.state.lookDeltaPitch;
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

  private pollGamepad(): boolean {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return false;
    const pads = navigator.getGamepads();
    const gamepad = pads[0] || pads[1];
    if (!gamepad) return false;

    const x = gamepad.axes[0] ?? 0;
    const y = gamepad.axes[1] ?? 0;
    const deadzone = this.options.assistedMovement ? 0.20 : 0.12;
    const distance = Math.hypot(x, y);

    if (distance > deadzone) {
      const remapped = (distance - deadzone) / (1 - deadzone);
      const strength = Math.pow(remapped, 1.15);
      this.state.moveX = (x / distance) * strength;
      this.state.moveY = -(y / distance) * strength;
    }

    const rx = gamepad.axes[2] ?? 0;
    const ry = gamepad.axes[3] ?? 0;
    if (Math.hypot(rx, ry) > 0.12) {
      this.state.lookDeltaYaw -= rx * 0.035;
      this.state.lookDeltaPitch -= ry * 0.035;
    }

    if (gamepad.buttons[0]?.pressed) this.interactTriggered = true;
    if (gamepad.buttons[1]?.pressed) this.cancelTriggered = true;
    return Boolean(
      gamepad.buttons[6]?.pressed ||
      gamepad.buttons[7]?.pressed ||
      gamepad.buttons[10]?.pressed
    );
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
    this.touchRunHeld = false;
    this.runPointerId = null;
    this.updateRunButton();
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
    for (const unbind of this.unbindCallbacks) unbind();
    this.unbindCallbacks.length = 0;
    if (this.controlsContainer?.parentNode) {
      this.controlsContainer.parentNode.removeChild(this.controlsContainer);
    }
    if (this.targetElement.style) {
      this.targetElement.style.touchAction = this.originalTouchAction;
    }
  }
}

function THREEClamp(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}
