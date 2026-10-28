import * as THREE from 'three';
import type { EngineBridge, EngineCommand } from '@/engine/core/Bridge';
import { Disposables } from '@/engine/core/Disposables';
import { EngineMetrics } from '@/engine/core/Metrics';
import type { Presenter } from '@/engine/core/Presenter';
import { AssetStore } from '@/engine/core/AssetStore';
import { heightAt, resolveMove } from '@/engine/world/collision';
import { areaAt, WORLD, type WorldLayout } from '@/engine/world/layout';
import type { DeviceProfile } from '@/lib/deviceProfile';
import { Emitter } from '@/lib/emitter';
import { log } from '@/lib/log';
import { setHourOverride, setTimeSpeedOverride } from '@/lib/worldClock';

/**
 * Pure helper for the Step 5 temporary render-scale governor:
 * If frameMsP95 exceeds the frame budget continuously for 3.0 seconds,
 * lower renderScale by 0.1 down to a floor of 0.7.
 */
export function stepRenderScaleGovernor(
  currentScale: number,
  frameMsP95: number,
  budgetMs: number,
  overBudgetAccumSec: number,
  dtSec: number,
): { nextScale: number; nextAccumSec: number; steppedDown: boolean } {
  if (currentScale <= 0.701) {
    return { nextScale: 0.7, nextAccumSec: 0, steppedDown: false };
  }
  if (frameMsP95 > budgetMs) {
    const nextAccum = overBudgetAccumSec + dtSec;
    if (nextAccum >= 3.0) {
      const nextScale = Math.max(
        0.7,
        Math.round((currentScale - 0.1) * 100) / 100,
      );
      return { nextScale, nextAccumSec: 0, steppedDown: true };
    }
    return { nextScale: currentScale, nextAccumSec: nextAccum, steppedDown: false };
  }
  return {
    nextScale: currentScale,
    nextAccumSec: Math.max(0, overBudgetAccumSec - dtSec * 0.5),
    steppedDown: false,
  };
}

export type EngineEvents = {
  firstFrame: void;
  paused: string;
  resumed: string;
  contextLost: void;
  contextRestored: void;
  command: EngineCommand;
  qualityScale: { scale: number };
};

export interface CollisionAPI {
  readonly heightAt: typeof heightAt;
  readonly resolveMove: typeof resolveMove;
  readonly areaAt: typeof areaAt;
}

export interface EngineContext {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly presenter: Presenter;
  readonly clock: { elapsed: number; delta: number };
  readonly device: DeviceProfile;
  readonly bridge: EngineBridge;
  readonly metrics: EngineMetrics;
  readonly disposables: Disposables;
  readonly events: Emitter<EngineEvents>;
  readonly world: WorldLayout;
  readonly collision: CollisionAPI;
  readonly assets: AssetStore;
}

export interface System {
  readonly id: string;
  readonly priority: number;
  init?(ctx: EngineContext): void;
  update(dt: number, ctx: EngineContext): void;
  onResize?(width: number, height: number, ctx: EngineContext): void;
  dispose(): void;
}

export interface EngineDeps {
  device: DeviceProfile;
  presenter: Presenter;
  bridge: EngineBridge;
}

export class Engine {
  private readonly host: HTMLElement;
  private readonly device: DeviceProfile;
  private readonly presenter: Presenter;
  private readonly bridge: EngineBridge;

  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly metrics = new EngineMetrics();
  readonly disposables = new Disposables();
  readonly events = new Emitter<EngineEvents>();
  readonly clock = { elapsed: 0, delta: 0 };
  readonly assets: AssetStore;

  private readonly systems: System[] = [];
  private readonly systemMap = new Map<string, System>();
  private readonly pauseReasons = new Set<string>();

  private resizeObserver: ResizeObserver | null = null;
  private initialized = false;
  private running = false;
  private disposed = false;
  private firstFrameRendered = false;
  private lastTimestampMs: number | null = null;
  private renderScale = 1.0;
  private overBudgetAccumSec = 0;
  private hostWidth = 1;
  private hostHeight = 1;

  // Software-WebGL pacing handle so CPU SwiftShader never starves screenshots
  private swTimerId: number | null = null;

  readonly ctx: EngineContext;

  constructor(host: HTMLElement, deps: EngineDeps) {
    this.host = host;
    this.device = deps.device;
    this.presenter = deps.presenter;
    this.bridge = deps.bridge;
    this.assets = new AssetStore(this.device);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(52, 1, 0.25, 1600);

    this.ctx = {
      renderer: this.renderer,
      scene: this.scene,
      camera: this.camera,
      presenter: this.presenter,
      clock: this.clock,
      device: this.device,
      bridge: this.bridge,
      metrics: this.metrics,
      disposables: this.disposables,
      events: this.events,
      world: WORLD,
      collision: {
        heightAt,
        resolveMove,
        areaAt,
      },
      assets: this.assets,
    };
  }

  register(system: System): this {
    if (this.disposed) return this;
    if (this.systemMap.has(system.id)) {
      const existing = this.systemMap.get(system.id);
      existing?.dispose();
      const idx = this.systems.findIndex((s) => s.id === system.id);
      if (idx >= 0) this.systems.splice(idx, 1);
    }
    this.systems.push(system);
    this.systems.sort((a, b) => a.priority - b.priority);
    this.systemMap.set(system.id, system);
    if (this.initialized) {
      system.init?.(this.ctx);
      system.onResize?.(this.hostWidth, this.hostHeight, this.ctx);
    }
    return this;
  }

  get<T extends System = System>(id: string): T | undefined {
    return this.systemMap.get(id) as T | undefined;
  }

  getRenderScale(): number {
    return this.renderScale;
  }

  setRenderScale(scale: number): void {
    const clamped = Math.max(0.6, Math.min(1.0, scale));
    if (Math.abs(clamped - this.renderScale) > 0.01) {
      this.renderScale = clamped;
      this.applySize(this.hostWidth, this.hostHeight);
    }
  }

  init(): this {
    if (this.initialized || this.disposed) return this;
    this.initialized = true;

    // In Step 6, the Composer pipeline is active for all devices.
    // Internal fallback in Composer switches to direct rendering if HalfFloat RT is unsupported.
    this.presenter.setPostProcessingEnabled?.(true);
    this.presenter.attach(this.host, this.renderer);
    this.measureAndResize();


    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        if (!this.disposed) {
          this.measureAndResize();
        }
      });
      this.resizeObserver.observe(this.host);
    }

    const canvas = this.renderer.domElement;
    const onContextLost = (e: Event) => {
      e.preventDefault();
      this.pause('context-lost');
      this.events.emit('contextLost', undefined);
    };

    const onContextRestored = () => {
      log.info('WebGL context restored');
      for (const sys of this.systems) {
        sys.init?.(this.ctx);
      }
      this.events.emit('contextRestored', undefined);
      this.resume('context-lost');
    };

    const onVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.hidden) {
        this.pause('visibility-hidden');
      } else {
        this.resume('visibility-hidden');
      }
    };

    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }

    this.disposables.add(() => {
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
    });

    for (const system of this.systems) {
      system.init?.(this.ctx);
      system.onResize?.(this.hostWidth, this.hostHeight, this.ctx);
    }

    return this;
  }

  start(): this {
    if (this.disposed) return this;
    if (!this.initialized) {
      this.init();
    }
    if (this.running) return this;
    this.running = true;
    this.lastTimestampMs = null;

    if (this.device.isSoftwareGl) {
      this.scheduleSoftwareFrame();
    } else {
      this.renderer.setAnimationLoop(this.onAnimationFrame);
    }
    return this;
  }

  pause(reason: string): void {
    if (this.disposed) return;
    this.pauseReasons.add(reason);
    if (this.running) {
      this.running = false;
      this.lastTimestampMs = null;
      this.renderer.setAnimationLoop(null);
      if (this.swTimerId !== null && typeof window !== 'undefined') {
        window.clearTimeout(this.swTimerId);
        this.swTimerId = null;
      }
      this.events.emit('paused', reason);
    }
  }

  resume(reason: string): void {
    if (this.disposed) return;
    this.pauseReasons.delete(reason);
    if (this.pauseReasons.size === 0 && !this.running && this.initialized) {
      this.running = true;
      this.lastTimestampMs = null;
      if (this.device.isSoftwareGl) {
        this.scheduleSoftwareFrame();
      } else {
        this.renderer.setAnimationLoop(this.onAnimationFrame);
      }
      this.events.emit('resumed', reason);
    }
  }

  /** Step a single deterministic frame (also used by leak test and headless checks) */
  stepFrame(nowMs: number = performance.now()): void {
    if (this.disposed || !this.initialized) return;

    const rawDt =
      this.lastTimestampMs === null
        ? 1 / 60
        : Math.max(0.0001, (nowMs - this.lastTimestampMs) / 1000);
    this.lastTimestampMs = nowMs;

    // Clamp dt to 1/20 s (0.05 s)
    const dt = Math.min(rawDt, 1 / 20);
    this.clock.delta = dt;
    this.clock.elapsed += dt;

    this.bridge.drainCommands((cmd) => {
      if (cmd.type === 'setRenderScale') {
        this.setRenderScale(cmd.scale);
      } else if (cmd.type === 'setHourOverride') {
        setHourOverride(cmd.hour);
      } else if (cmd.type === 'setTimeSpeed') {
        setTimeSpeedOverride(cmd.speed);
      } else if (cmd.type === 'setPostProcessing') {
        this.presenter.setPostProcessingEnabled?.(cmd.enabled);
      }
      this.events.emit('command', cmd);
    });

    for (let i = 0; i < this.systems.length; i++) {
      this.systems[i]?.update(dt, this.ctx);
    }

    this.presenter.render(this.scene, this.camera);
    this.metrics.recordFrame(dt, this.renderer);

    // Temporary render-scale governor: if frameMsP95 exceeds budget for 3s, lower renderScale by 0.1 down to 0.7
    if (!this.device.isSoftwareGl) {
      const budgetMs = this.device.deviceClass === 'phone' ? 40 : 25;
      const gov = stepRenderScaleGovernor(
        this.renderScale,
        this.metrics.frameMsP95,
        budgetMs,
        this.overBudgetAccumSec,
        dt,
      );
      this.overBudgetAccumSec = gov.nextAccumSec;
      if (gov.steppedDown) {
        this.setRenderScale(gov.nextScale);
        this.events.emit('qualityScale', { scale: gov.nextScale });
      }
    }

    this.assets.update(dt, this.renderer);
    if (import.meta.env.DEV && typeof window !== 'undefined') {
      window.__ARKVOID_ASSETS__ = this.assets.generateReport();
    }

    this.bridge.mutable.fps = this.metrics.fps;
    this.bridge.mutable.frameMsP95 = this.metrics.frameMsP95;
    this.bridge.mutable.drawCalls = this.metrics.drawCalls;
    this.bridge.mutable.triangles = this.metrics.triangles;


    if (!this.firstFrameRendered) {
      this.firstFrameRendered = true;
      this.bridge.mutable.loadProgress = 1;
      this.bridge.tickPublish(dt, true);
      this.events.emit('firstFrame', undefined);
    } else {
      this.bridge.tickPublish(dt, false);
    }
  }

  private readonly onAnimationFrame = (timestampMs: number): void => {
    if (!this.running || this.disposed) return;
    this.stepFrame(timestampMs);
  };

  private scheduleSoftwareFrame(): void {
    if (!this.running || this.disposed || typeof window === 'undefined') return;
    const now = performance.now();
    this.stepFrame(now);

    try {
      const gl = this.renderer.getContext() as WebGL2RenderingContext | null;
      if (gl && typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (!this.running || this.disposed) {
            if (sync) gl.deleteSync(sync);
            return;
          }
          const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
          if (state === gl.UNSIGNALED) {
            this.swTimerId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            this.swTimerId = window.setTimeout(
              () => this.scheduleSoftwareFrame(),
              240,
            );
          }
        };
        this.swTimerId = window.setTimeout(poll, 5);
        return;
      }
    } catch {
      // Fallback if fenceSync unavailable
    }

    this.swTimerId = window.setTimeout(() => this.scheduleSoftwareFrame(), 240);
  }

  private measureAndResize(): void {
    const rect = this.host.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width || window.innerWidth || 1));
    const height = Math.max(
      1,
      Math.round(rect.height || window.innerHeight || 1),
    );
    this.hostWidth = width;
    this.hostHeight = height;
    this.applySize(width, height);
  }

  private applySize(width: number, height: number): void {
    const rawDpr =
      typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const swFactor = this.device.isSoftwareGl ? 0.75 : 1.0;
    const dpr = Math.min(rawDpr, this.device.dprCap) * this.renderScale * swFactor;

    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.presenter.setSize(width, height, dpr);

    for (const system of this.systems) {
      system.onResize?.(width, height, this.ctx);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.running = false;

    this.renderer.setAnimationLoop(null);
    if (this.swTimerId !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.swTimerId);
      this.swTimerId = null;
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    // Release Three.js r186 internal DFG_LUT texture from renderer properties if PBR materials were rendered
    this.scene.traverse((obj) => {
      const mat = (obj as { material?: THREE.Material | THREE.Material[] })
        .material;
      const list = Array.isArray(mat) ? mat : mat ? [mat] : [];
      for (const m of list) {
        const props = this.renderer.properties.get(m) as {
          uniforms?: { dfgLUT?: { value?: THREE.Texture } };
        };
        props?.uniforms?.dfgLUT?.value?.dispose();
      }
    });

    for (let i = this.systems.length - 1; i >= 0; i--) {
      this.systems[i]?.dispose();
    }
    this.systems.length = 0;
    this.systemMap.clear();

    this.disposables.dispose();
    this.assets.dispose();
    this.presenter.dispose();
    this.renderer.dispose();
    this.events.clear();
  }
}
