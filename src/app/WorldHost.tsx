import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { BenchmarkReport } from '@/engine/core/Benchmark';
import { DebugReadout } from '@/hud/DebugReadout';
import {
  getImmediateDeviceProfile,
  resolveDeviceProfile,
  type DeviceProfile,
} from '@/lib/deviceProfile';
import type { Engine } from '@/engine/core/Engine';
import type { LeakTestReport } from '@/engine/core/leakTest';
import type { SceneAuditResult } from '@/engine/world/SceneAudit';
import type { ShowcaseWorldSystem } from '@/engine/world/ShowcaseScene';
import { hourNow } from '@/lib/worldClock';
import { sharedEngineBridge, useWorldBridgeStore } from '@/state/worldBridgeStore';
import { WorldLoadingScreen } from '@/ui/WorldLoadingScreen';
import { Pill } from '@/ui/Pill';
import type { FormId, LeaningId } from '@/engine/actors/WandererMaterials';
import type { AnimationStateName } from '@/engine/actors/Animator';
import type { MapRegionId } from '@/hud/WorldMapOverlay';

import { GuideWisp } from '@/hud/GuideWisp';
import { useAuthStore } from '@/state/auth';
import { useGameStore } from '@/state/game';
import { bootstrapSession } from '@/app/bootstrap';
import { resolvePostBootstrapMode, shouldCreateGuestSession } from '@/app/entryFlow';
import type { Leaning } from '@/net/api';
import { reportClientError } from '@/net/clientTelemetry';

const GateOverlay = lazy(() => import('@/screens/GateOverlay').then((module) => ({ default: module.GateOverlay })));
const AwakeningScreen = lazy(() => import('@/screens/AwakeningScreen').then((module) => ({ default: module.AwakeningScreen })));
const ArrivalOverlay = lazy(() => import('@/screens/ArrivalOverlay').then((module) => ({ default: module.ArrivalOverlay })));
const BenchmarkOverlay = lazy(() => import('@/hud/BenchmarkOverlay'));
const ActorsLineupOverlay = lazy(() => import('@/hud/ActorsLineupOverlay'));
const NpcDialogueOverlay = lazy(() => import('@/hud/NpcDialogueOverlay'));
const WorldMapOverlay = lazy(() => import('@/hud/WorldMapOverlay'));

const VisualReviewOverlay =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_REVIEW === '1'
    ? lazy(() => import('@/hud/VisualReviewOverlay'))
    : null;

type WorldRuntime = {
  Engine: typeof import('@/engine/core/Engine').Engine;
  runEngineLeakTest: typeof import('@/engine/core/leakTest').runEngineLeakTest;
  ScreenPresenter: typeof import('@/engine/core/Presenter').ScreenPresenter;
  QualityGovernor: typeof import('@/engine/core/QualityGovernor').QualityGovernor;
  loadUserQualityPreference: typeof import('@/engine/core/Quality').loadUserQualityPreference;
  resolveEffectiveTier: typeof import('@/engine/core/Quality').resolveEffectiveTier;
  ShowcaseWorldSystem: typeof import('@/engine/world/ShowcaseScene').ShowcaseWorldSystem;
  runSceneAudit: typeof import('@/engine/world/SceneAudit').runSceneAudit;
};
let worldRuntimePromise: Promise<WorldRuntime> | null = null;
function loadWorldRuntime(): Promise<WorldRuntime> {
  if (!worldRuntimePromise) {
    worldRuntimePromise = Promise.all([
      import('@/engine/core/Engine'),
      import('@/engine/core/leakTest'),
      import('@/engine/core/Presenter'),
      import('@/engine/core/QualityGovernor'),
      import('@/engine/core/Quality'),
      import('@/engine/world/ShowcaseScene'),
      import('@/engine/world/SceneAudit'),
    ]).then(([engine, leak, presenter, governor, quality, showcase, audit]) => {
      performance.mark?.('arkvoid:engine-chunk-loaded');
      return {
      Engine: engine.Engine,
      runEngineLeakTest: leak.runEngineLeakTest,
      ScreenPresenter: presenter.ScreenPresenter,
      QualityGovernor: governor.QualityGovernor,
      loadUserQualityPreference: quality.loadUserQualityPreference,
      resolveEffectiveTier: quality.resolveEffectiveTier,
      ShowcaseWorldSystem: showcase.ShowcaseWorldSystem,
      runSceneAudit: audit.runSceneAudit,
      };
    });
  }
  return worldRuntimePromise;
}

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
  const startEngineRef = useRef<(() => Promise<void>) | null>(null);
  const showcaseRef = useRef<ShowcaseWorldSystem | null>(null);
  const [firstFrameReady, setFirstFrameReady] = useState(false);
  const [splashMounted, setSplashMounted] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [activeNpcId, setActiveNpcId] = useState<string | null>(null);
  const [showWorldMap, setShowWorldMap] = useState(false);
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
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;
  const worldReady = firstFrameReady && sessionReady;

  // Bootstrap session and route to gate, awakening, or arrival
  useEffect(() => {
    if (viewMode !== 'boot') {
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
          // Existing guests without a character return to the visible world gate.
          // Only a saved character bypasses the gate and plays the arrival rail.
          const destination = resolvePostBootstrapMode(outcome);
          if (destination === 'arrival') {
            setViewMode('arrival');
            sharedEngineBridge.enqueue({
              type: 'playArrivalRail',
              duration: 5.0,
              onDone: () => {
                if (!cancelled) setViewMode('world');
              },
            });
          } else {
            setViewMode('gate');
            sharedEngineBridge.enqueue({ type: 'setViewMode', mode: 'gate' });
          }
        }
        setSessionReady(true);
      })
      .catch((err) => {
        reportClientError('bootstrap', err);
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

  useEffect(() => {
    const handleNpcTalk = (event: Event) => {
      const detail = (event as CustomEvent<{ npcId?: string }>).detail;
      if (detail?.npcId) setActiveNpcId(detail.npcId);
    };
    window.addEventListener('arkvoid:npc-talk', handleNpcTalk);
    return () => window.removeEventListener('arkvoid:npc-talk', handleNpcTalk);
  }, []);

  useEffect(() => {
    const isTextEntry = (target: Element | null): boolean =>
      target instanceof HTMLElement &&
      target.matches('input, textarea, select, [contenteditable="true"]');

    const syncTextFocus = () => {
      const engine = engineRef.current;
      if (!engine) return;
      if (isTextEntry(document.activeElement)) engine.pause('text-input');
      else engine.resume('text-input');
    };

    const viewport = window.visualViewport;
    const syncViewport = () => {
      const height = viewport?.height ?? window.innerHeight;
      const offsetTop = viewport?.offsetTop ?? 0;
      document.documentElement.style.setProperty('--arkvoid-visual-height', `${Math.round(height)}px`);
      document.documentElement.style.setProperty('--arkvoid-visual-offset-top', `${Math.round(offsetTop)}px`);
    };

    const handleFocusOut = () => window.setTimeout(syncTextFocus, 0);
    document.addEventListener('focusin', syncTextFocus);
    document.addEventListener('focusout', handleFocusOut);
    window.addEventListener('resize', syncViewport, { passive: true });
    viewport?.addEventListener('resize', syncViewport, { passive: true });
    viewport?.addEventListener('scroll', syncViewport, { passive: true });
    syncViewport();
    syncTextFocus();

    return () => {
      document.removeEventListener('focusin', syncTextFocus);
      document.removeEventListener('focusout', handleFocusOut);
      window.removeEventListener('resize', syncViewport);
      viewport?.removeEventListener('resize', syncViewport);
      viewport?.removeEventListener('scroll', syncViewport);
      document.documentElement.style.removeProperty('--arkvoid-visual-height');
      document.documentElement.style.removeProperty('--arkvoid-visual-offset-top');
    };
  }, []);

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
    setAwakeningError(null);
    try {
      const auth = useAuthStore.getState();
      const sessionReady = !shouldCreateGuestSession(auth.status) || await auth.signInGuest();
      if (!sessionReady) {
        throw new Error(useAuthStore.getState().error?.message ?? 'Unable to start a guest session.');
      }

      const hasChar = await useGameStore.getState().loadInitialGameData();
      const game = useGameStore.getState();
      if (game.error) throw new Error(game.error);
      if (hasChar) {
        setViewMode('arrival');
        sharedEngineBridge.enqueue({
          type: 'playArrivalRail',
          duration: 5.0,
          onDone: () => setViewMode('world'),
        });
      } else {
        // Let the landscape arrive before opening character creation.
        setViewMode('arrival');
        sharedEngineBridge.enqueue({
          type: 'playArrivalRail',
          duration: 4.5,
          onDone: () => {
            setViewMode('awakening');
            sharedEngineBridge.enqueue({ type: 'setViewMode', mode: 'awakening' });
          },
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to open the world. Please try again.';
      reportClientError('begin', err);
      setAwakeningError(message);
      setViewMode('gate');
      sharedEngineBridge.enqueue({ type: 'setViewMode', mode: 'gate' });
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
        setViewMode('arrival');
        sharedEngineBridge.enqueue({
          type: 'playArrivalRail',
          duration: 4.5,
          onDone: () => {
            setViewMode('awakening');
            sharedEngineBridge.enqueue({ type: 'setViewMode', mode: 'awakening' });
          },
        });
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
    if (useGameStore.getState().character) {
      setViewMode('world');
    } else {
      setViewMode('awakening');
      sharedEngineBridge.enqueue({ type: 'setViewMode', mode: 'awakening' });
    }
  }, []);

  const syncVignetteOverlay = useCallback(() => {
    const el = vignetteRef.current;
    if (!el) return;
    const hour = hourNow();
    const phase = hour >= 5 && hour < 8 ? 'dawn' : hour >= 8 && hour < 17 ? 'day' : hour >= 17 && hour < 20 ? 'dusk' : 'night';
    const tint = phase === 'dawn' ? '255,122,26' : phase === 'dusk' ? '124,92,255' : phase === 'night' ? '64,58,104' : '255,255,255';
    el.style.background = `radial-gradient(ellipse at 50% 52%, rgba(${tint},0.065), transparent 68%)`;
  }, []);

  // Update the phase-tinted radial vignette at most once per second (1 Hz)
  useEffect(() => {
    syncVignetteOverlay();
    const interval = window.setInterval(syncVignetteOverlay, 1000);
    return () => window.clearInterval(interval);
  }, [syncVignetteOverlay]);

  useEffect(() => {
    if (!sessionReady || (viewMode !== 'gate' && !worldReady)) return;
    const timer = window.setTimeout(() => setSplashMounted(false), 180);
    return () => window.clearTimeout(timer);
  }, [sessionReady, viewMode, worldReady]);

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

  const currentRegionId = (() => {
    const regions = [
      { id: 'veiled-peaks', x: 2400, z: -3600 },
      { id: 'capital-valley', x: -5000, z: -2400 },
      { id: 'primordial-forest', x: -1800, z: 4200 },
    ];
    for (const region of regions) {
      if (Math.hypot(playerCoarse.x - region.x, playerCoarse.z - region.z) < 760) return region.id;
    }
    return 'home-reach';
  })();

  const handleMapTravel = useCallback((regionId: MapRegionId) => {
    window.dispatchEvent(new CustomEvent('arkvoid:travel-region', { detail: { regionId } }));
    setShowWorldMap(false);
  }, []);

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

    const mountEngine = (device: DeviceProfile, runtime: WorldRuntime) => {
      if (cancelled) return;
      const presenter = new runtime.ScreenPresenter(device, probe || audit);
      const engine = new runtime.Engine(hostEl, {
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

      const showcase = new runtime.ShowcaseWorldSystem({
        reviewShots,
        actorsLineup: actors,
        playerForm: parsedForm,
        playerLeaning: parsedLeaning,
      });
      showcaseRef.current = showcase;

      // Determine initial quality tier
      const pref = runtime.loadUserQualityPreference();
      const initialTier = runtime.resolveEffectiveTier(pref, device);
      const governor = new runtime.QualityGovernor(initialTier, (msg) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(null), 5000);
      });

      const performAudit = () => {
        if (cancelled) return;
        const res = runtime.runSceneAudit(
          engine.scene,
          showcase,
          engine.assets,
          presenter.getProbeStats() ?? null,
        );
        setAuditResult(res);
      };

      engine.events.on('firstFrame', () => {
        if (!cancelled) {
          performance.mark?.('arkvoid:first-world-frame');
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
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLElement &&
        activeElement.matches('input, textarea, select, [contenteditable="true"]')
      ) {
        engine.pause('text-input');
      }
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

    let idleHandle: number | null = null;
    let idleTimer: number | null = null;
    let startPromise: Promise<void> | null = null;

    const startEngine = (): Promise<void> => {
      if (startPromise) return startPromise;
      startPromise = (async () => {
        try {
          const runtime = await loadWorldRuntime();
          if (cancelled) return;
          const initialDevice = getImmediateDeviceProfile();
          if (import.meta.env.DEV && leakTest) {
            const resolvedDevice = await resolveDeviceProfile();
            if (cancelled) return;
            const report = await runtime.runEngineLeakTest(hostEl, resolvedDevice, 10);
            if (typeof window !== 'undefined') window.__ARKVOID_LEAK_REPORT__ = report;
            mountEngine(resolvedDevice, runtime);
          } else {
            mountEngine(initialDevice, runtime);
            void resolveDeviceProfile();
          }
        } catch (error) {
          reportClientError('world-runtime', error);
          if (!cancelled) {
            const detail = error instanceof Error ? error.message.toLowerCase() : '';
            setAwakeningError(
              detail.includes('webgl') || detail.includes('context')
                ? '3D graphics are unavailable on this device. You can still return to the Gate.'
                : 'The world could not open just now. Please try again.',
            );
          }
          throw error;
        }
      })();
      return startPromise;
    };
    startEngineRef.current = startEngine;

    const connection = (typeof navigator !== 'undefined'
      ? (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
      : undefined);
    const connectionIsConstrained = Boolean(
      connection?.saveData || ['slow-2g', '2g', '3g'].includes(connection?.effectiveType ?? ''),
    );
    const immediateProfile = getImmediateDeviceProfile();
    const deviceIsConstrained = immediateProfile.gpuTier <= 1 || immediateProfile.deviceMemory <= 3;
    const shouldWaitForBegin = connectionIsConstrained || deviceIsConstrained;

    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (!shouldWaitForBegin) {
      if (typeof idleWindow.requestIdleCallback === 'function') {
        idleHandle = idleWindow.requestIdleCallback(() => { void startEngine().catch(() => undefined); }, { timeout: 2500 });
      } else {
        idleTimer = window.setTimeout(() => { void startEngine().catch(() => undefined); }, 1200);
      }
    } else if (viewModeRef.current === 'awakening' || viewModeRef.current === 'arrival' || viewModeRef.current === 'world') {
      void startEngine().catch(() => undefined);
    }

    const cleanupEngine = () => {
      cancelled = true;
      if (idleHandle !== null) idleWindow.cancelIdleCallback?.(idleHandle);
      if (idleTimer !== null) window.clearTimeout(idleTimer);
      if (startEngineRef.current === startEngine) startEngineRef.current = null;
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
  }, [actors, audit, benchmark, form, leaning, leakTest, probe, reviewShots, syncVignetteOverlay, viewModeRef]);

  // A saved character can enter Arrival directly after asynchronous bootstrap;
  // low-tier devices must start the runtime here rather than waiting for a Gate button.
  useEffect(() => {
    if (viewMode === 'awakening' || viewMode === 'arrival' || viewMode === 'world') {
      void startEngineRef.current?.().catch(() => undefined);
    }
  }, [viewMode, sessionReady]);

  return (
    <main className="relative h-full w-full overflow-hidden bg-[#fbfaf7] select-none">
      <div
        ref={hostRef}
        data-testid="world-canvas-host"
        className="arkvoid-world-canvas h-full w-full"
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
      {viewMode === 'gate' && sessionReady && (
        <Suspense fallback={null}>
          <GateOverlay
            onBegin={async () => { await startEngineRef.current?.(); await handleBegin(); }}
            onAccountResolved={handleAccountResolved}
            isLoading={isBeginning}
            errorMessage={awakeningError}
          />
        </Suspense>
      )}

      {/* Step 15 Awakening Screen: 3D character creation */}
      {viewMode === 'awakening' && worldReady && (
        <Suspense fallback={null}>
          <AwakeningScreen
            onAwakenComplete={handleAwakenComplete}
            error={awakeningError}
          />
        </Suspense>
      )}

      {/* Step 15 Arrival Overlay: Camera rail arrival banner */}
      {viewMode === 'arrival' && (
        <Suspense fallback={null}>
          <ArrivalOverlay onSkip={handleSkipArrival} />
        </Suspense>
      )}

      {awakeningError && viewMode !== 'gate' && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom)+12px)] left-1/2 z-system max-w-[calc(100vw-32px)] -translate-x-1/2 rounded-full border border-white/70 bg-[#fbfaf7]/92 px-3 py-2 text-center text-[11px] text-[#514d45] shadow-sm backdrop-blur"
        >
          {awakeningError}
        </div>
      )}

      {/* Step 15 First-Run Guidance: Glowing guide wisp toward hall stair */}
      {viewMode === 'world' && !hallReached && (
        <GuideWisp
          playerPos={playerCoarse}
          onHallReached={() => setHallReached(true)}
        />
      )}

      {activeNpcId && viewMode === 'world' && (
        <Suspense fallback={null}>
          <NpcDialogueOverlay
            npcId={activeNpcId}
            onClose={() => {
              window.dispatchEvent(new Event('arkvoid:npc-close'));
              setActiveNpcId(null);
            }}
          />
        </Suspense>
      )}

      {viewMode === 'world' && (
        <button
          type="button"
          onClick={() => setShowWorldMap(true)}
          className="pointer-events-auto fixed right-4 top-4 z-overlay flex items-center gap-2 rounded-full border border-white/60 bg-[#f8f6f0]/90 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#293a31] shadow-glass backdrop-blur-xl transition hover:bg-white sm:right-6 sm:top-6"
          aria-label="Open world atlas"
        >
          <span className="text-sm">⌖</span>
          World map
        </button>
      )}

      {showWorldMap && viewMode === 'world' && (
        <Suspense fallback={null}>
          <WorldMapOverlay
            currentRegion={currentRegionId}
            onClose={() => setShowWorldMap(false)}
            onTravel={handleMapTravel}
          />
        </Suspense>
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
        <Suspense fallback={null}>
          <BenchmarkOverlay
            report={benchmarkReport}
            onClose={() => setBenchmarkReport(null)}
          />
        </Suspense>
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
        <Suspense fallback={null}>
          <ActorsLineupOverlay
            onCaptureFrame={handleCaptureFrame}
            onSelectAnimation={handleSelectActorAnimation}
            onToggleAutoCycle={handleToggleAutoCycle}
          />
        </Suspense>
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
