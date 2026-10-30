import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Engine } from '@/engine/core/Engine';
import {
  type LeakTestReport,
  runEngineLeakTest,
} from '@/engine/core/leakTest';
import { ScreenPresenter } from '@/engine/core/Presenter';
import { QualityGovernor } from '@/engine/core/QualityGovernor';
import {
  loadUserQualityPreference,
  resolveEffectiveTier,
} from '@/engine/core/Quality';
import type { BenchmarkReport } from '@/engine/core/Benchmark';
import BenchmarkOverlay from '@/hud/BenchmarkOverlay';
import { computePhaseVignetteStyle } from '@/engine/fx/Atmosphere';
import { ShowcaseWorldSystem } from '@/engine/world/ShowcaseScene';
import { runSceneAudit, type SceneAuditResult } from '@/engine/world/SceneAudit';
import { DebugReadout } from '@/hud/DebugReadout';
import {
  type DeviceProfile,
  getImmediateDeviceProfile,
  resolveDeviceProfile,
} from '@/lib/deviceProfile';
import { hourNow } from '@/lib/worldClock';
import { sharedEngineBridge, useWorldBridgeStore } from '@/state/worldBridgeStore';
import { WorldLoadingScreen } from '@/ui/WorldLoadingScreen';
import { Pill } from '@/ui/Pill';
import ActorsLineupOverlay from '@/hud/ActorsLineupOverlay';
import type { FormId, LeaningId } from '@/engine/actors/WandererMaterials';
import type { AnimationStateName } from '@/engine/actors/Animator';

import { GateOverlay } from '@/screens/GateOverlay';
import { AwakeningScreen } from '@/screens/AwakeningScreen';
import { ArrivalOverlay } from '@/screens/ArrivalOverlay';
import { GuideWisp } from '@/hud/GuideWisp';
import { useAuthStore } from '@/state/auth';
import { useGameStore } from '@/state/game';
import { bootstrapSession } from '@/app/bootstrap';
import type { Leaning } from '@/net/api';

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

export type WorldViewMode = 'boot' | 'gate' | 'awakening' | 'arrival' | 'world';

export interface WorldHostProps {
  debug?: boolean;
  probe?: boolean;
  assets?: boolean;
  leakTest?: boolean;
  reviewShots?: boolean;
  benchmark?: boolean;
  audit?: boolean;
  actors?: boolean;
  form?: string;
  leaning?: string;
  initialMode?: WorldViewMode;
}

export default function WorldHost({
  debug = false,
  probe = false,
  assets = false,
  leakTest = false,
  reviewShots = false,
  benchmark = false,
  audit = false,
  actors = false,
  form,
  leaning,
  initialMode,
}: WorldHostProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const vignetteRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const showcaseRef = useRef<ShowcaseWorldSystem | null>(null);
  const [firstFrameReady, setFirstFrameReady] = useState(false);
  const [splashMounted, setSplashMounted] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [benchmarkReport, setBenchmarkReport] = useState<BenchmarkReport | null>(null);
  const [auditResult, setAuditResult] = useState<SceneAuditResult | null>(null);
  const prompt = useWorldBridgeStore((s) => s.prompt);
  const playerCoarse = useWorldBridgeStore((s) => s.playerCoarse);

  const [viewMode, setViewMode] = useState<WorldViewMode>(() => {
    if (initialMode) return initialMode;
    if (benchmark || leakTest || reviewShots || actors || audit || probe || debug) {
      return 'world';
    }
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const modeParam = params.get('mode') as WorldViewMode | null;
      if (modeParam && ['gate', 'awakening', 'arrival', 'world'].includes(modeParam)) {
        return modeParam;
      }
      if (params.get('walk') === '1') {
        return 'world';
      }
    }
    return 'boot';
  });

  const [isBeginning, setIsBeginning] = useState(false);
  const [awakeningError, setAwakeningError] = useState<string | null>(null);
  const [hallReached, setHallReached] = useState(false);
  const [sessionReady, setSessionReady] = useState(() => viewMode !== 'boot');
  const worldReady = firstFrameReady && sessionReady;

  // Bootstrap session and route to gate, awakening, or arrival
  useEffect(() => {
    if (viewMode !== 'boot') {
      setSessionReady(true);
      if (viewMode === 'gate' || viewMode === 'awakening') {
        sharedEngineBridge.enqueue({ type: 'setViewMode', mode: viewMode });
      }
      return;
    }

    let cancelled = false;

    bootstrapSession()
      .then((outcome) => {
        if (cancelled) return;
        if (outcome.type === 'NO_SESSION') {
          setViewMode('gate');
          sharedEngineBridge.enqueue({ type: 'setViewMode', mode: 'gate' });
        } else {
          if (outcome.hasCharacter) {
            // Returning user: 5s arrival rail, then world
            setViewMode('arrival');
            sharedEngineBridge.enqueue({
              type: 'playArrivalRail',
              duration: 5.0,
              onDone: () => {
                if (!cancelled) setViewMode('world');
              },
            });
          } else {
            // Session without character: awakening
            setViewMode('awakening');
            sharedEngineBridge.enqueue({ type: 'setViewMode', mode: 'awakening' });
          }
        }
        setSessionReady(true);
      })
      .catch((err) => {
        console.warn('Bootstrap error:', err);
        if (!cancelled) {
          setViewMode('gate');
          sharedEngineBridge.enqueue({ type: 'setViewMode', mode: 'gate' });
          setSessionReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [viewMode]);

  // Subscribe to auth state: on sign-out reset to gate
  useEffect(() => {
    const unsub = useAuthStore.subscribe((state, prevState) => {
      if (state.status === 'signed-out' && prevState.status !== 'signed-out') {
        useGameStore.getState().resetGame();
        setViewMode('gate');
        sharedEngineBridge.enqueue({ type: 'setViewMode', mode: 'gate' });
      }
    });
    return unsub;
  }, []);

  const handleBegin = useCallback(async () => {
    setIsBeginning(true);
    try {
      const ok = await useAuthStore.getState().signInGuest();
      if (ok) {
        const hasChar = await useGameStore.getState().loadInitialGameData();
        if (hasChar) {
          setViewMode('arrival');
          sharedEngineBridge.enqueue({
            type: 'playArrivalRail',
            duration: 5.0,
            onDone: () => setViewMode('world'),
          });
        } else {
          setViewMode('awakening');
          sharedEngineBridge.enqueue({ type: 'setViewMode', mode: 'awakening' });
        }
      } else {
        // Fallback: if guest sign-in returned false, transition to awakening
        setViewMode('awakening');
        sharedEngineBridge.enqueue({ type: 'setViewMode', mode: 'awakening' });
      }
    } catch (err) {
      console.warn('[Arkvoid] Begin action error, transitioning to Awakening:', err);
      setViewMode('awakening');
      sharedEngineBridge.enqueue({ type: 'setViewMode', mode: 'awakening' });
    } finally {
      setIsBeginning(false);
    }
  }, []);

  const handleAccountResolved = useCallback(async () => {
    const authStatus = useAuthStore.getState().status;
    if (authStatus === 'guest' || authStatus === 'member') {
      const hasChar = await useGameStore.getState().loadInitialGameData();
      if (hasChar) {
        setViewMode('arrival');
        sharedEngineBridge.enqueue({
          type: 'playArrivalRail',
          duration: 5.0,
          onDone: () => setViewMode('world'),
        });
      } else {
        setViewMode('awakening');
        sharedEngineBridge.enqueue({ type: 'setViewMode', mode: 'awakening' });
      }
    }
  }, []);

  const handleAwakenComplete = useCallback(
    async (name: string, leaning: Leaning, form: FormId): Promise<boolean> => {
      setAwakeningError(null);
      const ok = await useGameStore.getState().createCharacter(name, leaning, form);
      if (ok) {
        setViewMode('arrival');
        sharedEngineBridge.enqueue({
          type: 'playArrivalRail',
          duration: 9.0,
          onDone: () => setViewMode('world'),
        });
        return true;
      } else {
        setAwakeningError(useGameStore.getState().error || 'Please choose another name.');
        return false;
      }
    },
    [],
  );

  const handleSkipArrival = useCallback(() => {
    sharedEngineBridge.enqueue({ type: 'skipArrivalRail' });
    setViewMode('world');
  }, []);

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
    if (!worldReady) return;
    const timer = window.setTimeout(() => {
      setSplashMounted(false);
    }, 360);
    return () => window.clearTimeout(timer);
  }, [worldReady]);

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

  const handleSelectActorAnimation = useCallback((anim: AnimationStateName) => {
    showcaseRef.current?.getActorsLineup()?.setAnimation(anim);
  }, []);

  const handleToggleAutoCycle = useCallback((enabled: boolean) => {
    showcaseRef.current?.getActorsLineup()?.setAutoCycle(enabled);
  }, []);

  useEffect(() => {
    const hostEl = hostRef.current;
    if (!hostEl) return;

    let cancelled = false;
    let activeEngine: Engine | null = null;
    let benchInterval: number | null = null;
    let auditInterval: number | null = null;
    let auditSettleTimer: number | null = null;

    const mountEngine = (device: DeviceProfile) => {
      if (cancelled) return;
      const presenter = new ScreenPresenter(device, probe || audit);
      const engine = new Engine(hostEl, {
        device,
        presenter,
        bridge: sharedEngineBridge,
      });
      activeEngine = engine;
      engineRef.current = engine;

      const parsedForm = form !== undefined ? (parseInt(form, 10) as FormId) : undefined;
      const parsedLeaning =
        leaning === 'dawn' || leaning === 'dusk' || leaning === 'still'
          ? (leaning as LeaningId)
          : undefined;

      const showcase = new ShowcaseWorldSystem({
        reviewShots,
        actorsLineup: actors,
        playerForm: parsedForm,
        playerLeaning: parsedLeaning,
      });
      showcaseRef.current = showcase;

      // Determine initial quality tier
      const pref = loadUserQualityPreference();
      const initialTier = resolveEffectiveTier(pref, device);
      const governor = new QualityGovernor(initialTier, (msg) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(null), 5000);
      });

      const performAudit = () => {
        if (cancelled) return;
        const res = runSceneAudit(
          engine.scene,
          showcase,
          engine.assets,
          presenter.getProbeStats() ?? null,
        );
        setAuditResult(res);
      };

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
          if (audit) {
            performAudit();
          }
        }
      });

      engine.events.on('toast', ({ message }) => {
        if (!cancelled) {
          setToastMessage(message);
          window.setTimeout(() => setToastMessage(null), 4000);
        }
      });

      engine.register(governor);
      engine.register(showcase);
      engine.start();

      if (audit) {
        performAudit();
        auditSettleTimer = window.setTimeout(performAudit, 1500);
        auditInterval = window.setInterval(performAudit, 10000);
      }

      if (benchmark) {
        benchInterval = window.setInterval(() => {
          const session = showcase.getBenchmarkSession();
          if (!session) return;
          if (!session.isActive()) {
            const report = session.finish(
              engine.renderer.info.memory.textures,
              engine.renderer.info.memory.geometries,
            );
            setBenchmarkReport(report);
            if (benchInterval) {
              window.clearInterval(benchInterval);
              benchInterval = null;
            }
          }
        }, 1000);
      }
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
      if (benchInterval) {
        window.clearInterval(benchInterval);
        benchInterval = null;
      }
      if (auditInterval) {
        window.clearInterval(auditInterval);
        auditInterval = null;
      }
      if (auditSettleTimer) {
        window.clearTimeout(auditSettleTimer);
        auditSettleTimer = null;
      }
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
  }, [actors, audit, benchmark, form, leaning, leakTest, probe, reviewShots, syncVignetteOverlay]);

  return (
    <main className="relative h-full w-full overflow-hidden bg-[#fbfaf7] select-none">
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

      {/* Low battery / SaveData toast suggestion */}
      {toastMessage && (
        <aside
          role="status"
          aria-live="polite"
          data-testid="governor-toast"
          className="pointer-events-auto fixed top-4 left-1/2 -translate-x-1/2 z-overlay flex items-center gap-2 rounded-pill border border-line bg-surface px-4 py-2 font-sans text-xs text-ink shadow-glass backdrop-blur-glass animate-fade-in"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-orange" />
          <span>{toastMessage}</span>
          <button
            type="button"
            aria-label="Dismiss toast"
            onClick={() => setToastMessage(null)}
            className="ml-2 text-muted hover:text-ink"
          >
            ×
          </button>
        </aside>
      )}

      {/* Step 15 Gate Overlay: Welcome over live showcase world */}
      {viewMode === 'gate' && worldReady && (
        <GateOverlay
          onBegin={handleBegin}
          onAccountResolved={handleAccountResolved}
          isLoading={isBeginning}
        />
      )}

      {/* Step 15 Awakening Screen: 3D character creation */}
      {viewMode === 'awakening' && worldReady && (
        <AwakeningScreen
          onAwakenComplete={handleAwakenComplete}
          error={awakeningError}
        />
      )}

      {/* Step 15 Arrival Overlay: Camera rail arrival banner */}
      {viewMode === 'arrival' && (
        <ArrivalOverlay onSkip={handleSkipArrival} />
      )}

      {/* Step 15 First-Run Guidance: Glowing guide wisp toward hall stair */}
      {viewMode === 'world' && !hallReached && (
        <GuideWisp
          playerPos={playerCoarse}
          onHallReached={() => setHallReached(true)}
        />
      )}

      {/* Contextual Action Pill (world mode only) */}
      {prompt && viewMode === 'world' && (
        <div
          data-testid="world-context-pill"
          className="pointer-events-auto fixed bottom-8 left-1/2 -translate-x-1/2 z-overlay transition-all duration-150 animate-fade-in"
        >
          <Pill
            label={prompt.label}
            keycap={prompt.keycap}
            onClick={() => sharedEngineBridge.enqueue({ type: 'triggerInteract' })}
          />
        </div>
      )}

      {/* Benchmark results overlay (?bench=1) */}
      {benchmarkReport && (
        <BenchmarkOverlay
          report={benchmarkReport}
          onClose={() => setBenchmarkReport(null)}
        />
      )}

      {import.meta.env.DEV && (debug || probe || assets) ? (
        <DebugReadout showDebug={debug} showProbe={probe} showAssets={assets} />
      ) : null}

      {audit && auditResult ? (
        <pre
          data-testid="scene-audit-overlay"
          className="pointer-events-none fixed bottom-3 left-3 z-overlay max-w-[94vw] overflow-x-auto rounded-card border border-line bg-surface/90 p-3 font-mono text-[11px] leading-relaxed text-ink shadow-glass backdrop-blur-glass"
        >
          {`ARKVOID SCENE AUDIT · ${auditResult.passed ? 'ALL CHECKS PASSED' : `${auditResult.failCount} FAILED`} (${auditResult.passCount} PASS / ${auditResult.failCount} FAIL)\n`}
          {auditResult.lines.join('\n')}
        </pre>
      ) : null}

      {actors && (
        <ActorsLineupOverlay
          onCaptureFrame={handleCaptureFrame}
          onSelectAnimation={handleSelectActorAnimation}
          onToggleAutoCycle={handleToggleAutoCycle}
        />
      )}

      {reviewShots && VisualReviewOverlay ? (
        <Suspense fallback={null}>
          <VisualReviewOverlay onCaptureFrame={handleCaptureFrame} />
        </Suspense>
      ) : null}

      {splashMounted ? (
        <div
          aria-hidden={worldReady}
          className={`pointer-events-none fixed inset-0 z-system transition-opacity duration-500 ease-out ${
            worldReady ? 'opacity-0' : 'opacity-100'
          }`}
        >
          <WorldLoadingScreen />
        </div>
      ) : null}
    </main>
  );
}
