import type { WebGLRenderer } from 'three';

export interface EngineMetricsSnapshot {
  fps: number;
  frameMsP50: number;
  frameMsP95: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
}

const RING_CAPACITY = 240;

export class EngineMetrics {
  private readonly frameMsRing = new Float32Array(RING_CAPACITY);
  private readonly scratchSort = new Float32Array(RING_CAPACITY);
  private writeIndex = 0;
  private sampleCount = 0;
  private infoAccumSec = 0;

  fps = 60;
  frameMsP50 = 16.67;
  frameMsP95 = 16.67;
  drawCalls = 0;
  triangles = 0;
  geometries = 0;
  textures = 0;

  recordFrame(dtSec: number, renderer?: WebGLRenderer): void {
    const ms = Math.max(0.1, dtSec * 1000);
    this.frameMsRing[this.writeIndex] = ms;
    this.writeIndex = (this.writeIndex + 1) % RING_CAPACITY;
    if (this.sampleCount < RING_CAPACITY) {
      this.sampleCount++;
    }

    if (renderer) {
      // Capture drawCalls and triangles from the just-completed render pass
      this.drawCalls = renderer.info.render.calls;
      this.triangles = renderer.info.render.triangles;
      this.geometries = renderer.info.memory.geometries;
      this.textures = renderer.info.memory.textures;
    }

    this.infoAccumSec += dtSec;
    if (this.infoAccumSec >= 1.0 || this.sampleCount <= 4) {
      this.infoAccumSec = 0;
      this.recomputeStats();
    }
  }

  recomputeStats(): void {
    const n = this.sampleCount;
    if (n === 0) return;

    let sumMs = 0;
    for (let i = 0; i < n; i++) {
      const val = this.frameMsRing[i] ?? 16.67;
      this.scratchSort[i] = val;
      sumMs += val;
    }

    const sub = this.scratchSort.subarray(0, n);
    sub.sort();

    const p50Idx = Math.min(n - 1, Math.floor(n * 0.5));
    const p95Idx = Math.min(n - 1, Math.floor(n * 0.95));

    const avgMs = sumMs / n;
    this.fps = Math.round(1000 / Math.max(1, avgMs));
    this.frameMsP50 = Number((sub[p50Idx] ?? avgMs).toFixed(2));
    this.frameMsP95 = Number((sub[p95Idx] ?? avgMs).toFixed(2));
  }

  reset(): void {
    this.writeIndex = 0;
    this.sampleCount = 0;
    this.infoAccumSec = 0;
  }
}
