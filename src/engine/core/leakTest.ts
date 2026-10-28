import { EngineBridge } from '@/engine/core/Bridge';
import { Engine } from '@/engine/core/Engine';
import { ScreenPresenter } from '@/engine/core/Presenter';
import { ShowcaseWorldSystem } from '@/engine/world/ShowcaseScene';
import type { DeviceProfile } from '@/lib/deviceProfile';
import { log } from '@/lib/log';

export interface LeakTestReport {
  iterations: number;
  peakGeometries: number;
  peakTextures: number;
  finalGeometries: number;
  finalTextures: number;
  heapDeltaMb: number;
  passed: boolean;
}

interface PerformanceWithMemory extends Performance {
  memory?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
  };
}

declare global {
  interface Window {
    __ARKVOID_LEAK_REPORT__?: LeakTestReport;
  }
}

function getUsedHeapBytes(): number {
  if (typeof performance === 'undefined') return 0;
  const perf = performance as PerformanceWithMemory;
  return perf.memory?.usedJSHeapSize ?? 0;
}

let activeLeakTestPromise: Promise<LeakTestReport> | null = null;

export function runEngineLeakTest(
  host: HTMLElement,
  device: DeviceProfile,
  iterations = 10,
): Promise<LeakTestReport> {
  if (activeLeakTestPromise) {
    return activeLeakTestPromise;
  }

  activeLeakTestPromise = (async () => {
    const startHeap = getUsedHeapBytes();
    let peakGeometries = 0;
    let peakTextures = 0;
    let finalGeometries = 0;
    let finalTextures = 0;

    for (let i = 0; i < iterations; i++) {
      const bridge = new EngineBridge();
      const presenter = new ScreenPresenter();
      const engine = new Engine(host, { device, presenter, bridge });
      engine.register(new ShowcaseWorldSystem());
      engine.init();

      // Render a frame so all geometries and textures upload to WebGL memory
      engine.stepFrame(16.67 * (i + 1));

      const activeMem = engine.renderer.info.memory;
      if (activeMem.geometries > peakGeometries) {
        peakGeometries = activeMem.geometries;
      }
      if (activeMem.textures > peakTextures) {
        peakTextures = activeMem.textures;
      }

      engine.dispose();

      const afterMem = engine.renderer.info.memory;
      finalGeometries = afterMem.geometries;
      finalTextures = afterMem.textures;

      // Release underlying WebGL context slot so 10 rapid cycles never hit browser context cap
      try {
        engine.renderer.forceContextLoss();
      } catch {
        // Ignore if context already lost
      }
    }

    const endHeap = getUsedHeapBytes();
    const rawDeltaMb =
      startHeap > 0 && endHeap >= startHeap
        ? (endHeap - startHeap) / (1024 * 1024)
        : 0;
    const heapDeltaMb = Math.round(rawDeltaMb * 100) / 100;

    const passed =
      finalGeometries === 0 && finalTextures === 0 && heapDeltaMb < 8;

    const report: LeakTestReport = {
      iterations,
      peakGeometries,
      peakTextures,
      finalGeometries,
      finalTextures,
      heapDeltaMb,
      passed,
    };

    if (typeof window !== 'undefined') {
      window.__ARKVOID_LEAK_REPORT__ = report;
    }

    log.info('Engine leak test complete', report);
    activeLeakTestPromise = null;
    return report;
  })();

  return activeLeakTestPromise;
}
