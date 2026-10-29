import type { DeviceProfile } from '@/lib/deviceProfile';
import type { QualityTier } from '@/engine/core/Quality';
import { CameraRailDef } from '@/engine/core/CameraRail';

export interface BenchmarkReport {
  readonly deviceClass: string;
  readonly gpuTier: number;
  readonly refreshHz: number;
  readonly tierHistory: readonly QualityTier[];
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly worstFrameMs: number;
  readonly avgFps: number;
  readonly loadTimeMs: number;
  readonly textures: number;
  readonly geometries: number;
  readonly passed: boolean;
  readonly budgetP95Ms: number;
}

export const BENCHMARK_RAIL: CameraRailDef = {
  id: 'benchmark-60s',
  name: '60s Core World Benchmark Loop',
  duration: 60.0,
  keyframes: [
    // 0s: Plaza Hero View
    {
      time: 0.0,
      position: [0.0, 3.5, 20.0],
      lookAt: [0.0, 3.2, -6.0],
      fov: 50,
      ease: 'easeInOut',
    },
    // 12s: Hall Interior
    {
      time: 12.0,
      position: [11.5, 3.2, -6.0],
      lookAt: [17.5, 3.6, -6.0],
      fov: 48,
      ease: 'easeInOut',
    },
    // 24s: Arched Stone Bridge
    {
      time: 24.0,
      position: [38.0, 5.0, -16.0],
      lookAt: [55.0, 2.5, -28.0],
      fov: 52,
      ease: 'easeInOut',
    },
    // 36s: Breath Pond & Motes
    {
      time: 36.0,
      position: [-4.8, 2.0, 0.2],
      lookAt: [-9.2, 0.9, -4.2],
      fov: 46,
      ease: 'easeInOut',
    },
    // 48s: Waterfall Base & Island Underside
    {
      time: 48.0,
      position: [26.0, -8.0, -18.0],
      lookAt: [32.0, 1.0, -22.0],
      fov: 54,
      ease: 'easeInOut',
    },
    // 60s: Return to Plaza Hero
    {
      time: 60.0,
      position: [0.0, 3.5, 20.0],
      lookAt: [0.0, 3.2, -6.0],
      fov: 50,
      ease: 'easeInOut',
    },
  ],
};

declare global {
  interface Window {
    __ARKVOID_BENCHMARK_REPORT__?: BenchmarkReport;
  }
}

export class BenchmarkSession {
  private readonly device: DeviceProfile;
  private readonly loadTimeMs: number;
  private elapsedSec = 0;
  private readonly frameTimesMs: number[] = [];
  private worstFrameMs = 0;
  private readonly tiers: QualityTier[] = [];
  private active = true;
  private report: BenchmarkReport | null = null;
  private readonly onComplete?: (report: BenchmarkReport) => void;

  constructor(
    device: DeviceProfile,
    loadTimeMs: number,
    initialTier: QualityTier,
    onComplete?: (report: BenchmarkReport) => void,
  ) {
    this.device = device;
    this.loadTimeMs = loadTimeMs;
    this.tiers.push(initialTier);
    this.onComplete = onComplete;
  }

  recordTier(tier: QualityTier): void {
    if (this.tiers[this.tiers.length - 1] !== tier) {
      this.tiers.push(tier);
    }
  }

  recordFrame(dtSec: number, frameMs: number, currentTier: QualityTier): void {
    if (!this.active) return;
    this.elapsedSec += dtSec;
    this.recordTier(currentTier);

    // Skip first 1s to exclude warmup spikes
    if (this.elapsedSec > 1.0) {
      this.frameTimesMs.push(frameMs);
      if (frameMs > this.worstFrameMs) {
        this.worstFrameMs = frameMs;
      }
    }

    if (this.elapsedSec >= 60.0 && !this.report) {
      this.finish();
    }
  }

  finish(textures = 0, geometries = 0): BenchmarkReport {
    this.active = false;
    const isPhone = this.device.deviceClass === 'phone';
    const budgetP95Ms = isPhone ? 40.0 : 25.0;

    let p50 = 16.67;
    let p95 = 16.67;
    let avgFps = 60.0;

    if (this.frameTimesMs.length > 0) {
      const sorted = [...this.frameTimesMs].sort((a, b) => a - b);
      const count = sorted.length;
      p50 = Math.round(sorted[Math.floor(count * 0.50)]! * 10) / 10;
      p95 = Math.round(sorted[Math.floor(count * 0.95)]! * 10) / 10;
      const sum = sorted.reduce((acc, v) => acc + v, 0);
      const avgMs = sum / count;
      avgFps = Math.round((avgMs > 0 ? 1000 / avgMs : 60) * 10) / 10;
    }

    const passed = p95 <= budgetP95Ms;

    this.report = {
      deviceClass: this.device.deviceClass,
      gpuTier: this.device.gpuTier,
      refreshHz: Math.round(avgFps >= 50 ? 60 : 30),
      tierHistory: [...this.tiers],
      p50Ms: p50,
      p95Ms: p95,
      worstFrameMs: Math.round(this.worstFrameMs * 10) / 10,
      avgFps,
      loadTimeMs: Math.round(this.loadTimeMs),
      textures,
      geometries,
      passed,
      budgetP95Ms,
    };

    if (typeof window !== 'undefined') {
      window.__ARKVOID_BENCHMARK_REPORT__ = this.report;
    }

    this.onComplete?.(this.report);
    return this.report;
  }

  isActive(): boolean {
    return this.active;
  }

  getElapsed(): number {
    return this.elapsedSec;
  }

  getReport(): BenchmarkReport | null {
    return this.report;
  }
}
