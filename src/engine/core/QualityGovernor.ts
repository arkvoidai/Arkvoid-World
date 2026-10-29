import type { System, EngineContext } from '@/engine/core/Engine';
import {
  type QualityPreset,
  type QualityTier,
  QUALITY_PRESETS,
  getAdjustedPreset,
} from '@/engine/core/Quality';
import { log } from '@/lib/log';

export interface QualityGovernorState {
  currentTier: QualityTier;
  preset: QualityPreset;
  degradeStep: number; // 0 = pristine, 1..7
  renderScale: number;
  p50Ms: number;
  p95Ms: number;
  averageFps: number;
  targetFrameMs: number;
  estimatedRefreshHz: number;
  isWarmup: boolean;
  isSessionLocked: boolean;
  downgradesInWindow: number;
  recentEmergencySpikes: number;
  lastDecisionReason: string;
}

export type ToastCallback = (message: string, durationMs?: number) => void;

declare global {
  interface Window {
    __ARKVOID_GOVERNOR__?: QualityGovernorState;
  }
}

export class QualityGovernor implements System {
  readonly id = 'quality-governor';
  readonly priority = 90;

  private ctx: EngineContext | null = null;
  private currentTier: QualityTier = 'balanced';
  private activePreset: QualityPreset = QUALITY_PRESETS.balanced;

  // Frame time ring buffer (up to 120 frames)
  private readonly frameHistory = new Float32Array(120);
  private frameCount = 0;
  private head = 0;

  // Warmup tracking
  private sessionElapsedSec = 0;
  private warmupSec = 5.0; // 5s after load or refocus
  private lastResizeOrFocusTime = 0;

  // Refresh rate estimation (first 90 frames)
  private refreshRateEstimated = false;
  private initialFramesCollected = 0;
  private initialFrameTimeSum = 0;
  private estimatedRefreshHz = 60;
  private targetFrameMs = 16.67;

  // Evaluation timer (1 Hz)
  private timeSinceLastEvalSec = 0;
  private consecutiveOverBudgetSec = 0;
  private consecutiveUnderBudgetSec = 0;
  private timeSinceLastChangeSec = 999.0;

  // Degradation tracking
  private degradeStep = 0; // 0..7
  private renderScale = 1.0;
  private grassScale = 1.0;
  private leafCardScale = 1.0;
  private particleScale = 1.0;

  // Session lock after 3 downgrades within 90s
  private isSessionLocked = false;
  private readonly downgradeTimestamps: number[] = [];

  // Emergency tracking: 3 frames > 250ms within 5s
  private readonly spikeTimestamps: number[] = [];

  // Metrics readout
  private p50Ms = 16.67;
  private p95Ms = 16.67;
  private averageFps = 60.0;
  private lastDecisionReason = 'Initialized';
  private readonly logs: string[] = [];

  private toastCallback: ToastCallback | null = null;
  private suggestedPerformanceBatteryToast = false;

  constructor(initialTier: QualityTier = 'balanced', toastCallback?: ToastCallback) {
    this.currentTier = initialTier;
    this.activePreset = QUALITY_PRESETS[initialTier];
    this.renderScale = this.activePreset.renderScale;
    this.toastCallback = toastCallback ?? null;
  }

  setToastHandler(cb: ToastCallback): void {
    this.toastCallback = cb;
  }

  init(ctx: EngineContext): void {
    this.ctx = ctx;
    const isPhone = ctx.device.deviceClass === 'phone';
    this.activePreset = getAdjustedPreset(this.currentTier, isPhone);
    this.renderScale = this.activePreset.renderScale;

    // Apply starting tier to presenter / composer
    ctx.presenter.applyQuality?.(this.activePreset);

    // Window focus / blur listeners to handle warmups and background throttling
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', this.onRefocus);
      window.addEventListener('blur', this.onBlur);
    }

    this.checkBatteryAndSaveData(ctx);
  }

  private onRefocus = (): void => {
    this.lastResizeOrFocusTime = this.sessionElapsedSec;
    this.consecutiveOverBudgetSec = 0;
    this.consecutiveUnderBudgetSec = 0;
    this.logReason('Refocus: entering 5s warmup');
  };

  private onBlur = (): void => {
    this.consecutiveOverBudgetSec = 0;
    this.consecutiveUnderBudgetSec = 0;
  };

  onResize(_width: number, _height: number): void {
    this.lastResizeOrFocusTime = this.sessionElapsedSec;
    this.consecutiveOverBudgetSec = 0;
    this.consecutiveUnderBudgetSec = 0;
    this.logReason('Resize: entering 5s warmup');
  }

  private checkBatteryAndSaveData(_ctx: EngineContext): void {
    if (typeof navigator === 'undefined') return;

    // Check saveData
    const conn = (navigator as unknown as { connection?: { saveData?: boolean } }).connection;
    if (conn?.saveData && !this.suggestedPerformanceBatteryToast) {
      this.suggestedPerformanceBatteryToast = true;
      this.toastCallback?.('Data saver detected: Performance tier recommended');
    }

    // Check battery
    const navWithBattery = navigator as unknown as {
      getBattery?: () => Promise<{ charging: boolean; level: number }>;
    };
    if (typeof navWithBattery.getBattery === 'function') {
      navWithBattery.getBattery().then((battery) => {
        if (!battery.charging && battery.level <= 0.20 && !this.suggestedPerformanceBatteryToast) {
          this.suggestedPerformanceBatteryToast = true;
          this.toastCallback?.('Low battery (≤ 20%): Performance tier recommended');
        }
      }).catch(() => {
        // Battery status API optional
      });
    }
  }

  update(dt: number, ctx: EngineContext): void {
    this.sessionElapsedSec += dt;
    this.timeSinceLastEvalSec += dt;
    this.timeSinceLastChangeSec += dt;

    // Record raw frame time
    const frameMs = Math.max(0.1, dt * 1000);
    this.frameHistory[this.head] = frameMs;
    this.head = (this.head + 1) % 120;
    this.frameCount = Math.min(120, this.frameCount + 1);

    // Refresh rate estimation from first 90 frames
    if (!this.refreshRateEstimated) {
      this.initialFramesCollected++;
      this.initialFrameTimeSum += frameMs;
      if (this.initialFramesCollected >= 90) {
        this.refreshRateEstimated = true;
        const avgMs = this.initialFrameTimeSum / this.initialFramesCollected;
        const rawHz = avgMs > 0 ? 1000 / avgMs : 60;
        this.estimatedRefreshHz = Math.round(rawHz);
        const cappedHz = Math.min(this.estimatedRefreshHz, 60);
        this.targetFrameMs = 1000 / Math.max(20, cappedHz);
        this.logReason(`Refresh estimated: ${this.estimatedRefreshHz} Hz (Target: ${this.targetFrameMs.toFixed(1)} ms)`);
      }
    }

    // Emergency spike check: frames > 250 ms
    if (frameMs > 250.0) {
      const now = this.sessionElapsedSec;
      this.spikeTimestamps.push(now);
      // Keep only spikes within 5s
      while (this.spikeTimestamps.length > 0 && now - this.spikeTimestamps[0]! > 5.0) {
        this.spikeTimestamps.shift();
      }
      if (this.spikeTimestamps.length >= 3 && this.degradeStep < 4) {
        this.applyEmergencyDegrade(ctx);
      }
    }

    // Run governor analysis at 1 Hz
    if (this.timeSinceLastEvalSec >= 1.0) {
      this.timeSinceLastEvalSec = 0;
      this.evaluatePerformance(ctx);
    }
  }

  private isWarmup(): boolean {
    if (this.sessionElapsedSec < this.warmupSec) return true;
    if (this.sessionElapsedSec - this.lastResizeOrFocusTime < 5.0) return true;
    return false;
  }

  private evaluatePerformance(ctx: EngineContext): void {
    if (this.frameCount < 10) return;

    // Compute p50 and p95 over last 120 frames
    const count = this.frameCount;
    const sorted = new Float32Array(count);
    let sum = 0;
    for (let i = 0; i < count; i++) {
      const v = this.frameHistory[i]!;
      sorted[i] = v;
      sum += v;
    }
    sorted.sort();

    this.p50Ms = sorted[Math.floor(count * 0.50)]!;
    this.p95Ms = sorted[Math.floor(count * 0.95)]!;
    const avgMs = sum / count;
    this.averageFps = avgMs > 0 ? 1000 / avgMs : 60;

    if (this.isWarmup()) {
      return;
    }

    const isPhone = ctx.device.deviceClass === 'phone';
    // Over-budget condition: p95 > 1.35x target (phones: > 45ms when target is 33ms)
    const overBudgetThreshold = isPhone && this.targetFrameMs >= 30.0 ? 45.0 : this.targetFrameMs * 1.35;
    const underBudgetThreshold = this.targetFrameMs * 0.70;

    if (this.p95Ms > overBudgetThreshold) {
      this.consecutiveOverBudgetSec++;
      this.consecutiveUnderBudgetSec = 0;

      // Degrade when over-budget for 3 consecutive seconds, at most one change per 2s
      if (this.consecutiveOverBudgetSec >= 3 && this.timeSinceLastChangeSec >= 2.0 && !this.isSessionLocked) {
        this.stepDegrade(ctx);
        this.consecutiveOverBudgetSec = 0;
      }
    } else if (this.p95Ms < underBudgetThreshold) {
      this.consecutiveUnderBudgetSec++;
      this.consecutiveOverBudgetSec = 0;

      // Upgrade after 12s under-budget and 20s since last change
      if (this.consecutiveUnderBudgetSec >= 12 && this.timeSinceLastChangeSec >= 20.0 && !this.isSessionLocked) {
        this.stepUpgrade(ctx);
        this.consecutiveUnderBudgetSec = 0;
      }
    } else {
      this.consecutiveOverBudgetSec = 0;
      this.consecutiveUnderBudgetSec = 0;
    }

    if (typeof window !== 'undefined') {
      window.__ARKVOID_GOVERNOR__ = this.getState();
    }
  }

  private stepDegrade(ctx: EngineContext): void {
    if (this.degradeStep >= 7) return;

    const now = this.sessionElapsedSec;
    this.downgradeTimestamps.push(now);
    // Keep timestamps within 90s
    while (this.downgradeTimestamps.length > 0 && now - this.downgradeTimestamps[0]! > 90.0) {
      this.downgradeTimestamps.shift();
    }

    if (this.downgradeTimestamps.length >= 3) {
      this.isSessionLocked = true;
      this.logReason('Session locked: 3 downgrades in 90s');
    }

    this.degradeStep++;
    this.timeSinceLastChangeSec = 0;
    this.applyDegradeStep(this.degradeStep, ctx, `p95=${this.p95Ms.toFixed(1)}ms exceeded target`);
  }

  private stepUpgrade(ctx: EngineContext): void {
    if (this.degradeStep <= 0) return;

    this.degradeStep--;
    this.timeSinceLastChangeSec = 0;
    this.applyDegradeStep(this.degradeStep, ctx, `p95=${this.p95Ms.toFixed(1)}ms well within budget`);
  }

  private applyEmergencyDegrade(ctx: EngineContext): void {
    this.logReason('Emergency: 3 frames > 250ms within 5s, jumping to step 4');
    this.degradeStep = Math.max(this.degradeStep, 4);
    this.timeSinceLastChangeSec = 0;
    this.applyDegradeStep(this.degradeStep, ctx, 'Emergency frame spike');
  }

  /**
   * Applies the exact degradation step in order:
   * 1. render scale down by 0.1 to its minimum (0.7);
   * 2. grass density * 0.7 and leaf-card counts * 0.8 down to floors;
   * 3. cloud light march and sun shafts off, particles * 0.6;
   * 4. disable real shadows (AO decals remain);
   * 5. disable bloom and GTAO;
   * 6. next lower preset;
   * 7. Lite.
   */
  private applyDegradeStep(step: number, ctx: EngineContext, reason: string): void {
    const isPhone = ctx.device.deviceClass === 'phone';

    switch (step) {
      case 0:
        // Pristine
        this.renderScale = this.activePreset.renderScale;
        this.grassScale = 1.0;
        this.leafCardScale = 1.0;
        this.particleScale = 1.0;
        ctx.presenter.applyQuality?.(this.activePreset);
        ctx.events.emit('qualityScale', { scale: this.renderScale });
        this.logReason(`Step 0 (Pristine): scale=${this.renderScale} [${reason}]`);
        break;

      case 1:
        // Step 1: Render scale down by 0.1 to minimum (0.7)
        this.renderScale = Math.max(0.70, Math.round((this.renderScale - 0.10) * 100) / 100);
        ctx.events.emit('qualityScale', { scale: this.renderScale });
        this.logReason(`Step 1: Render scale reduced to ${this.renderScale} [${reason}]`);
        break;

      case 2:
        // Step 2: Grass density * 0.7 and leaf-card counts * 0.8
        this.grassScale = Math.max(0.35, this.grassScale * 0.70);
        this.leafCardScale = Math.max(0.40, this.leafCardScale * 0.80);
        this.logReason(`Step 2: Grass density=${this.grassScale.toFixed(2)}, Leaf cards=${this.leafCardScale.toFixed(2)} [${reason}]`);
        break;

      case 3:
        // Step 3: Cloud light march and sun shafts off, particles * 0.6
        this.particleScale = Math.max(0.25, this.particleScale * 0.60);
        ctx.presenter.getComposer?.()?.setEnabled('sunShafts', false);
        this.logReason(`Step 3: Sun shafts off, particles=${this.particleScale.toFixed(2)} [${reason}]`);
        break;

      case 4:
        // Step 4: Disable real shadows (AO decals remain)
        ctx.renderer.shadowMap.enabled = false;
        this.logReason(`Step 4: Real shadows disabled [${reason}]`);
        break;

      case 5:
        // Step 5: Disable bloom and GTAO
        ctx.presenter.getComposer?.()?.setEnabled('bloom', false);
        ctx.presenter.getComposer?.()?.setEnabled('gtao', false);
        this.logReason(`Step 5: Bloom and GTAO disabled [${reason}]`);
        break;

      case 6:
        // Step 6: Next lower preset
        if (this.currentTier === 'ultra') {
          this.currentTier = 'balanced';
        } else if (this.currentTier === 'balanced') {
          this.currentTier = 'performance';
        }
        this.activePreset = getAdjustedPreset(this.currentTier, isPhone);
        this.renderScale = this.activePreset.renderScale;
        ctx.presenter.applyQuality?.(this.activePreset);
        ctx.events.emit('qualityScale', { scale: this.renderScale });
        this.logReason(`Step 6: Lowered preset to ${this.currentTier} [${reason}]`);
        break;

      case 7:
        // Step 7: Lite
        this.currentTier = 'lite';
        this.activePreset = QUALITY_PRESETS.lite;
        this.renderScale = 0.65;
        this.grassScale = 0.0;
        this.leafCardScale = 0.0;
        this.particleScale = 0.1;
        ctx.presenter.applyQuality?.(this.activePreset);
        ctx.events.emit('qualityScale', { scale: this.renderScale });
        this.logReason(`Step 7: Fallen back to Lite tier [${reason}]`);
        break;
    }
  }

  private logReason(reason: string): void {
    this.lastDecisionReason = reason;
    this.logs.push(`[${this.sessionElapsedSec.toFixed(1)}s] ${reason}`);
    if (this.logs.length > 50) {
      this.logs.shift();
    }
    log.info(`[QualityGovernor] ${reason}`);
  }

  getState(): QualityGovernorState {
    return {
      currentTier: this.currentTier,
      preset: this.activePreset,
      degradeStep: this.degradeStep,
      renderScale: this.renderScale,
      p50Ms: this.p50Ms,
      p95Ms: this.p95Ms,
      averageFps: this.averageFps,
      targetFrameMs: this.targetFrameMs,
      estimatedRefreshHz: this.estimatedRefreshHz,
      isWarmup: this.isWarmup(),
      isSessionLocked: this.isSessionLocked,
      downgradesInWindow: this.downgradeTimestamps.length,
      recentEmergencySpikes: this.spikeTimestamps.length,
      lastDecisionReason: this.lastDecisionReason,
    };
  }

  getLogs(): readonly string[] {
    return this.logs;
  }

  dispose(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', this.onRefocus);
      window.removeEventListener('blur', this.onBlur);
    }
    this.ctx = null;
    this.toastCallback = null;
  }
}
