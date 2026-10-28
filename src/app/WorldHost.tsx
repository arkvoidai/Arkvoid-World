import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Engine } from '@/engine/core/Engine';
import {
  type LeakTestReport,
  runEngineLeakTest,
} from '@/engine/core/leakTest';
import { ScreenPresenter } from '@/engine/core/Presenter';
import { computePhaseVignetteStyle } from '@/engine/fx/Atmosphere';
import { ShowcaseWorldSystem } from '@/engine/world/ShowcaseScene';
import { DebugReadout } from '@/hud/DebugReadout';
import {
  type DeviceProfile,
  getImmediateDeviceProfile,
  resolveDeviceProfile,
} from '@/lib/deviceProfile';
import { hourNow } from '@/lib/worldClock';
import { sharedEngineBridge } from '@/state/worldBridgeStore';
import { Logo } from '@/ui/Logo';

const VisualReviewOverlay =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_REVIEW === '1'
    ? lazy(() => import('@/hud/VisualReviewOverlay'))
    : null;

declare global {
  interface Window {
    __ARKVOID_LEAK_REPORT__?: LeakTestReport;
    __ARKVOID_WORLD_STATS__?: {
      buildTimeMs: number;
      drawCalls: number;
      triangles: number;
      geometries: number;
      textures: number;
    };
  }
}

export interface WorldHostProps {
  debug?: boolean;
  probe?: boolean;
  assets?: boolean;
  leakTest?: boolean;
  reviewShots?: boolean;
}

export default function WorldHost({
  debug = false,
  probe = false,
  assets = false,
  leakTest = false,
  reviewShots = false,
}: WorldHostProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const vignetteRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const [firstFrameReady, setFirstFrameReady] = useState(false);
  const [splashMounted, setSplashMounted] = useState(true);

  const syncVignetteOverlay = useCallback(() => {
    const el = vignetteRef.current;
    if (!el) return;
    el.style.background = computePhaseVignetteStyle(hourNow());
  }, []);

  // Update the phase-tinted radial vignette at most once per second (1 Hz)
  useEffect(() => {
    syncVignetteOverlay();
    const interval = window.setInterval(syncVignetteOverlay, 1000);
    return () => window.clearInterval(interval);
  }, [syncVignetteOverlay]);

  useEffect(() => {
    if (!firstFrameReady) return;
    const timer = window.setTimeout(() => {
      setSplashMounted(false);
    }, 650);
    return () => window.clearTimeout(timer);
  }, [firstFrameReady]);

  const handleCaptureFrame = useCallback((): string | null => {
    const eng = engineRef.current;
    if (!eng) return null;
    eng.stepFrame(performance.now());
    syncVignetteOverlay();
    if (import.meta.env.DEV && typeof window !== 'undefined') {
      const showcase = eng.get<ShowcaseWorldSystem>('world-showcase');
      window.__ARKVOID_WORLD_STATS__ = {
        buildTimeMs: showcase?.buildTimeMs ?? 0,
        drawCalls: eng.metrics.drawCalls,
        triangles: eng.metrics.triangles,
        geometries: eng.renderer.info.memory.geometries,
        textures: eng.renderer.info.memory.textures,
      };
    }
    try {
      return eng.renderer.domElement.toDataURL('image/png');
    } catch {
      return null;
    }
  }, [syncVignetteOverlay]);

  useEffect(() => {
    const hostEl = hostRef.current;
    if (!hostEl) return;

    let cancelled = false;
    let activeEngine: Engine | null = null;

    const mountEngine = (device: DeviceProfile) => {
      if (cancelled) return;
      const presenter = new ScreenPresenter(device, probe);
      const engine = new Engine(hostEl, {
        device,
        presenter,
        bridge: sharedEngineBridge,
      });
      activeEngine = engine;
      engineRef.current = engine;

      const showcase = new ShowcaseWorldSystem(reviewShots);

      engine.events.on('firstFrame', () => {
        if (!cancelled) {
          setFirstFrameReady(true);
          syncVignetteOverlay();
          if (import.meta.env.DEV && typeof window !== 'undefined') {
            window.__ARKVOID_WORLD_STATS__ = {
              buildTimeMs: showcase.buildTimeMs,
              drawCalls: engine.metrics.drawCalls,
              triangles: engine.metrics.triangles,
              geometries: engine.renderer.info.memory.geometries,
              textures: engine.renderer.info.memory.textures,
            };
          }
        }
      });

      engine.register(showcase);
      engine.start();
    };

    const initialDevice = getImmediateDeviceProfile();

    if (import.meta.env.DEV && leakTest) {
      void resolveDeviceProfile().then(async (resolvedDevice) => {
        if (cancelled) return;
        const report = await runEngineLeakTest(hostEl, resolvedDevice, 10);
        if (typeof window !== 'undefined') {
          window.__ARKVOID_LEAK_REPORT__ = report;
        }
        mountEngine(resolvedDevice);
      });
    } else {
      mountEngine(initialDevice);
      void resolveDeviceProfile();
    }

    const cleanupEngine = () => {
      cancelled = true;
      engineRef.current = null;
      if (activeEngine) {
        const renderer = activeEngine.renderer;
        activeEngine.dispose();
        try {
          renderer.forceContextLoss();
        } catch {
          // Ignore if already lost
        }
        activeEngine = null;
      }
    };

    window.addEventListener('pagehide', cleanupEngine);

    return () => {
      window.removeEventListener('pagehide', cleanupEngine);
      cleanupEngine();
    };
  }, [leakTest, probe, reviewShots, syncVignetteOverlay]);

  return (
    <main className="relative h-full w-full overflow-hidden bg-pearl select-none">
      <div
        ref={hostRef}
        data-testid="world-canvas-host"
        className="h-full w-full"
      />

      {/* Phase-graded soft radial vignette overlay (pointer-events: none, updated <= 1 Hz, no CSS filter on canvas) */}
      <div
        ref={vignetteRef}
        aria-hidden="true"
        data-testid="world-phase-vignette"
        className="pointer-events-none fixed inset-0 z-hud transition-[background] duration-700 ease-out"
      />

      {import.meta.env.DEV && (debug || probe || assets) ? (
        <DebugReadout showDebug={debug} showProbe={probe} showAssets={assets} />
      ) : null}

      {reviewShots && VisualReviewOverlay ? (
        <Suspense fallback={null}>
          <VisualReviewOverlay onCaptureFrame={handleCaptureFrame} />
        </Suspense>
      ) : null}

      {splashMounted ? (
        <div
          aria-hidden={firstFrameReady}
          className={`pointer-events-none fixed inset-0 z-system flex flex-col items-center justify-center bg-pearl transition-opacity duration-[600ms] ease-out ${
            firstFrameReady ? 'opacity-0' : 'opacity-100'
          }`}
        >
          <Logo size={42} />
        </div>
      ) : null}
    </main>
  );
}
