import type { Camera, Scene, WebGLRenderer } from 'three';
import { Composer, type ExposureProbeStats } from '@/engine/core/Composer';
import type { TimeOfDayState } from '@/engine/world/sky';
import type { DeviceProfile } from '@/lib/deviceProfile';
import type { QualityPreset } from '@/engine/core/Quality';

export interface Disposable {
  dispose(): void;
}

export interface Presenter extends Disposable {
  readonly kind: 'screen';
  attach(host: HTMLElement, renderer: WebGLRenderer): void;
  setSize(width: number, height: number, dpr: number): void;
  render(scene: Scene, camera: Camera): void;
  updateSky?(skyState: TimeOfDayState, elapsed: number, camera?: Camera): void;
  applyQuality?(preset: QualityPreset): void;
  getComposer?(): Composer | null;
  setPostProcessingEnabled?(enabled: boolean): void;
  isPostProcessingEnabled?(): boolean;
  setProbeEnabled?(enabled: boolean): void;
  getProbeStats?(): ExposureProbeStats | null;
  dispose(): void;
}

export class ScreenPresenter implements Presenter {
  readonly kind = 'screen' as const;
  private host: HTMLElement | null = null;
  private renderer: WebGLRenderer | null = null;
  private device: DeviceProfile | null = null;

  private postEnabled = true;
  private probeEnabled = false;
  private width = 1;
  private height = 1;
  private dpr = 1;

  private composer: Composer | null = null;

  constructor(device?: DeviceProfile, enableProbe = false) {
    this.device = device ?? null;
    this.probeEnabled = enableProbe;
  }

  attach(host: HTMLElement, renderer: WebGLRenderer): void {
    this.host = host;
    this.renderer = renderer;
    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.touchAction = 'none';
    canvas.style.userSelect = 'none';
    if (canvas.parentElement !== host) {
      host.appendChild(canvas);
    }

    if (!this.composer && this.device) {
      this.initComposer();
    }
  }

  private initComposer(): void {
    if (!this.renderer || !this.device || this.composer) return;
    this.composer = new Composer(this.renderer, this.device, this.probeEnabled);
    this.composer.setSize(this.width, this.height, this.dpr);
  }

  setDeviceProfile(device: DeviceProfile): void {
    this.device = device;
    if (this.renderer && !this.composer) {
      this.initComposer();
    }
  }

  getComposer(): Composer | null {
    return this.composer;
  }

  applyQuality(preset: QualityPreset): void {
    this.composer?.applyQuality(preset);
  }

  setProbeEnabled(enabled: boolean): void {
    this.probeEnabled = enabled;
    this.composer?.setProbeEnabled(enabled);
  }

  getProbeStats(): ExposureProbeStats | null {
    return this.composer?.getProbeStats() ?? null;
  }

  setPostProcessingEnabled(enabled: boolean): void {
    this.postEnabled = enabled;
  }

  isPostProcessingEnabled(): boolean {
    return this.postEnabled;
  }

  setSize(width: number, height: number, dpr: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.dpr = Math.max(0.5, dpr);

    if (!this.renderer) return;
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(this.width, this.height, false);

    if (this.composer) {
      this.composer.setSize(this.width, this.height, this.dpr);
    }
  }

  updateSky(skyState: TimeOfDayState, elapsed: number, camera?: Camera): void {
    this.composer?.update(skyState, elapsed, camera);
  }

  render(scene: Scene, camera: Camera): void {
    if (!this.renderer) return;
    if (this.postEnabled) {
      if (!this.composer && this.device) {
        this.initComposer();
      }
      if (this.composer) {
        this.composer.render(scene, camera);
        return;
      }
    }
    this.renderer.render(scene, camera);
  }

  dispose(): void {
    if (this.composer) {
      this.composer.dispose();
      this.composer = null;
    }
    if (this.renderer) {
      const canvas = this.renderer.domElement;
      if (canvas.parentElement) {
        canvas.parentElement.removeChild(canvas);
      }
    }
    this.host = null;
    this.renderer = null;
  }
}
