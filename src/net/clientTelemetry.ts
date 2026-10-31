import { getSupabaseSafe } from '@/net/supabase';

type ClientErrorRecord = {
  kind: string;
  message: string;
  at: number;
};

export type WebVitalSnapshot = {
  lcp: number | null;
  inp: number | null;
  cls: number;
};

declare global {
  interface Window {
    __ARKVOID_WEB_VITALS__?: WebVitalSnapshot;
  __ARKVOID_PERF_AUDIT__?: {
    marks: Record<string, number | null>;
    longTaskCountAfterFirstFrame: number;
    longTaskOver50MsAfterFirstFrame: number;
    longTaskOver100MsAfterFirstFrame: number;
    longestPostFrameTaskMs: number;
    heapUsedBytesAfterFiveMinutes: number | null;
    capturedAtMs: number;
  };
  }
}

const ERROR_LIMIT_PER_MINUTE = 5;
const DEDUPE_WINDOW_MS = 60_000;
const MAX_BATCH_SIZE = 5;
const errorTimes: number[] = [];
const seenErrors = new Map<string, number>();
const pendingErrors = new Map<string, ClientErrorRecord>();
let flushTimer: number | null = null;

function safeMessage(value: unknown): string {
  const raw = value instanceof Error ? value.message : typeof value === 'string' ? value : 'Unhandled client error';
  return raw.replace(/https?:\/\/\S+/gi, '[url]').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 300) || 'Unhandled client error';
}

async function flushClientErrors(): Promise<void> {
  flushTimer = null;
  const batch = [...pendingErrors.values()].slice(0, MAX_BATCH_SIZE);
  pendingErrors.clear();
  if (batch.length === 0) return;
  const client = getSupabaseSafe();
  if (!client) return;
  const summary = batch.length === 1
    ? batch[0]!.message
    : `${batch[0]!.message} (+${batch.length - 1} related errors)`;
  try {
    await client.rpc('log_client_error', {
      p_kind: 'error',
      p_message: summary.slice(0, 500),
      p_ctx: {
        events: batch.map(({ kind, message, at }) => ({ kind, message, at })),
      },
    });
  } catch {
    // Telemetry must never interrupt the world or create another rejected promise.
  }
}

/** Queue, deduplicate and rate-limit client errors before sending one DB batch. */
export function reportClientError(kind: string, value: unknown, context?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  while (errorTimes.length && now - errorTimes[0]! > 60_000) errorTimes.shift();
  const message = safeMessage(value);
  const key = `${kind.slice(0, 32)}:${message}`;
  if (seenErrors.size > 256) {
    for (const [seenKey, timestamp] of seenErrors) {
      if (now - timestamp > DEDUPE_WINDOW_MS) seenErrors.delete(seenKey);
    }
  }
  const lastSeen = seenErrors.get(key);
  if (lastSeen !== undefined && now - lastSeen < DEDUPE_WINDOW_MS) return;
  if (errorTimes.length >= ERROR_LIMIT_PER_MINUTE) return;

  errorTimes.push(now);
  seenErrors.set(key, now);
  pendingErrors.set(key, {
    kind: kind.slice(0, 32),
    message: context ? `${message} [${Object.keys(context).slice(0, 4).join(',')}]`.slice(0, 300) : message,
    at: now,
  });

  if (flushTimer === null) {
    flushTimer = window.setTimeout(() => { void flushClientErrors(); }, 900);
  }
}

function installPerformanceAudit(): void {
  let longTaskCountAfterFirstFrame = 0;
  let longTaskOver50MsAfterFirstFrame = 0;
  let longTaskOver100MsAfterFirstFrame = 0;
  let longestPostFrameTaskMs = 0;

  const firstFrameMark = () =>
    performance.getEntriesByName('arkvoid:first-world-frame', 'mark')[0]?.startTime ?? null;

  const capture = (heapUsedBytesAfterFiveMinutes: number | null) => {
    const names = [
      'arkvoid:navigation-start',
      'arkvoid:first-paint',
      'arkvoid:boot-ui-visible',
      'arkvoid:react-mounted',
      'arkvoid:engine-chunk-loaded',
      'arkvoid:first-world-frame',
      'arkvoid:interactive',
    ];
    const marks: Record<string, number | null> = {};
    for (const name of names) {
      marks[name] = performance.getEntriesByName(name, 'mark')[0]?.startTime ?? null;
    }
    window.__ARKVOID_PERF_AUDIT__ = {
      marks,
      longTaskCountAfterFirstFrame,
      longTaskOver50MsAfterFirstFrame,
      longTaskOver100MsAfterFirstFrame,
      longestPostFrameTaskMs: Math.round(longestPostFrameTaskMs * 10) / 10,
      heapUsedBytesAfterFiveMinutes,
      capturedAtMs: Date.now(),
    };
  };

  try {
    if (PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
      const observer = new PerformanceObserver((list) => {
        const firstFrameAt = firstFrameMark();
        if (firstFrameAt === null) return;
        for (const entry of list.getEntries()) {
          if (entry.startTime < firstFrameAt) continue;
          longTaskCountAfterFirstFrame += 1;
          if (entry.duration > 50) longTaskOver50MsAfterFirstFrame += 1;
          if (entry.duration > 100) longTaskOver100MsAfterFirstFrame += 1;
          longestPostFrameTaskMs = Math.max(longestPostFrameTaskMs, entry.duration);
        }
      });
      observer.observe({ type: 'longtask', buffered: true });
    }
  } catch {
    // Long-task entries are not exposed in every browser.
  }

  if (import.meta.env.DEV) {
    window.setTimeout(() => {
      const memory = (performance as Performance & {
        memory?: { usedJSHeapSize?: number };
      }).memory;
      capture(typeof memory?.usedJSHeapSize === 'number' ? memory.usedJSHeapSize : null);
    }, 5 * 60 * 1000);
  }
  window.addEventListener('pagehide', () => capture(null), { once: true });
}

function installErrorListeners(): void {
  window.addEventListener('error', (event) => {
    reportClientError('window', event.message || 'Unhandled window error');
  });
  window.addEventListener('unhandledrejection', (event) => {
    reportClientError('promise', event.reason);
  });
  window.addEventListener('vite:preloadError', () => {
    reportClientError('preload', 'A previously cached application module could not be loaded');
  });
}

function installVitals(): void {
  const productionSample = import.meta.env.DEV || Math.random() < 0.1;
  let lcp: number | null = null;
  const interactions = new Map<number, number>();
  let clsWindowValue = 0;
  let clsWindowStart = 0;
  let clsLastEntry = 0;
  let cls = 0;
  const observers: PerformanceObserver[] = [];

  const observe = (callback: (entries: PerformanceEntry[]) => void, options: PerformanceObserverInit): void => {
    try {
      const observer = new PerformanceObserver((list) => callback(list.getEntries()));
      observer.observe(options);
      observers.push(observer);
    } catch {
      // Unsupported entry types are normal on older browsers.
    }
  };

  observe((entries) => {
    for (const entry of entries) lcp = entry.startTime;
  }, { type: 'largest-contentful-paint', buffered: true });

  observe((entries) => {
    for (const entry of entries) {
      const event = entry as PerformanceEntry & { interactionId?: number };
      if (event.interactionId && event.interactionId > 0) {
        interactions.set(event.interactionId, Math.max(interactions.get(event.interactionId) ?? 0, event.duration));
      }
    }
  }, { type: 'event', buffered: true, durationThreshold: 40 });

  observe((entries) => {
    for (const entry of entries) {
      const shift = entry as PerformanceEntry & { value?: number; hadRecentInput?: boolean };
      if (shift.hadRecentInput || typeof shift.value !== 'number') continue;
      const time = shift.startTime;
      if (time - clsLastEntry < 1000 && time - clsWindowStart < 5000) {
        clsWindowValue += shift.value;
      } else {
        clsWindowValue = shift.value;
        clsWindowStart = time;
      }
      clsLastEntry = time;
      cls = Math.max(cls, clsWindowValue);
    }
  }, { type: 'layout-shift', buffered: true });

  const snapshot = (): WebVitalSnapshot => {
    const durations = [...interactions.values()].sort((a, b) => a - b);
    const inp = durations.length
      ? durations[Math.max(0, Math.ceil(durations.length * 0.98) - 1)]!
      : null;
    return {
      lcp: lcp === null ? null : Math.round(lcp),
      inp: inp === null ? null : Math.round(inp),
      cls: Number(cls.toFixed(4)),
    };
  };

  const finish = () => {
    const values = snapshot();
    window.__ARKVOID_WEB_VITALS__ = values;
    if (productionSample && !import.meta.env.DEV) {
      const client = getSupabaseSafe();
      if (client) {
        void (async () => {
          try {
            await client.rpc('log_client_error', {
              p_kind: 'vital',
              p_message: 'Web Vitals sample',
              p_ctx: values,
            });
          } catch {
            // Performance reporting is best-effort.
          }
        })();
      }
    }
    for (const observer of observers) observer.disconnect();
  };

  window.addEventListener('pagehide', finish, { once: true });
}

let installed = false;

export function installClientTelemetry(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  installErrorListeners();
  installVitals();
  installPerformanceAudit();
}
