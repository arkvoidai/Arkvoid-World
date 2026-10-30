import { worldNow } from '@/net/api';
import { setServerOffset, worldMinute } from '@/lib/worldClock';

let syncInterval: number | null = null;
let isSyncing = false;
let hasPerformedDevCheck = false;

export interface ClockSyncState {
  lastSyncAt: number | null;
  offsetMs: number;
  skewMinutes: number;
}

const state: ClockSyncState = {
  lastSyncAt: null,
  offsetMs: 0,
  skewMinutes: 0,
};

export function parseServerTimestamp(raw: string | number): number {
  if (typeof raw === 'number') {
    // If it's in seconds (e.g., ~1.7e9), convert to ms
    return raw < 1e11 ? raw * 1000 : raw;
  }
  const numeric = Number(raw);
  if (!Number.isNaN(numeric) && raw.trim() !== '') {
    return numeric < 1e11 ? numeric * 1000 : numeric;
  }
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? Date.now() : parsed;
}

/**
 * Perform a single round-trip clock sync against Supabase world_now().
 */
export async function syncClockNow(): Promise<number | null> {
  if (isSyncing) return null;
  isSyncing = true;

  const t0 = Date.now();
  try {
    const res = await worldNow();
    const t1 = Date.now();

    if (!res.ok) {
      return null;
    }

    const localMidpoint = (t0 + t1) / 2;
    const serverMs = parseServerTimestamp(res.data);
    const offsetMs = serverMs - localMidpoint;

    setServerOffset(offsetMs);
    state.offsetMs = offsetMs;
    state.lastSyncAt = t1;

    // Server-side world minute directly from serverMs
    const serverMinute = 360 + Math.floor((serverMs / 1000 - 1790812800) / 10);
    // Client-side world minute evaluated with the new offset
    const clientMinute = worldMinute(localMidpoint + offsetMs);
    const skew = Math.abs(clientMinute - serverMinute);
    state.skewMinutes = skew;

    // One-time dev check: difference must be under 1 world minute
    const isDev = Boolean(typeof import.meta !== 'undefined' && import.meta.env?.DEV);
    if (isDev && !hasPerformedDevCheck) {
      hasPerformedDevCheck = true;
      if (skew > 1) {
        console.warn(
          `[Arkvoid Clock] World minute skew exceeds 1 minute: client=${clientMinute}, server=${serverMinute}, diff=${skew}`,
        );
      } else {
        console.info(
          `[Arkvoid Clock] World clock synced: offsetMs=${offsetMs}ms, clientMinute=${clientMinute}, serverMinute=${serverMinute} (diff=${skew})`,
        );
      }
    }

    return offsetMs;
  } catch {
    return null;
  } finally {
    isSyncing = false;
  }
}

/**
 * Initializes clock sync:
 * - Calls world_now() once on first use
 * - Re-syncs every 10 minutes
 * - Re-syncs on window focus and visibility change
 */
export function initClockSync(): () => void {
  // Sync immediately
  syncClockNow();

  // Re-sync every 10 minutes (600,000 ms)
  if (typeof window !== 'undefined') {
    if (syncInterval !== null) {
      clearInterval(syncInterval);
    }
    syncInterval = window.setInterval(() => {
      syncClockNow();
    }, 10 * 60 * 1000);

    const onRefocus = () => {
      if (document.visibilityState === 'visible') {
        syncClockNow();
      }
    };

    window.addEventListener('focus', onRefocus);
    document.addEventListener('visibilitychange', onRefocus);

    return () => {
      if (syncInterval !== null) {
        clearInterval(syncInterval);
        syncInterval = null;
      }
      window.removeEventListener('focus', onRefocus);
      document.removeEventListener('visibilitychange', onRefocus);
    };
  }

  return () => {
    if (syncInterval !== null) {
      clearInterval(syncInterval);
      syncInterval = null;
    }
  };
}

export function getClockSyncState(): Readonly<ClockSyncState> {
  return state;
}
