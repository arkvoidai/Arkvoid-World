import { useAuthStore } from '@/state/auth';
import { useGameStore } from '@/state/game';
import { initClockSync } from '@/net/clockSync';
import type { Character } from '@/net/api';

export type BootstrapOutcome =
  | { type: 'NO_SESSION' }
  | { type: 'AUTH_READY'; hasCharacter: boolean; character: Character | null };

let clockCleanup: (() => void) | null = null;

/**
 * Session bootstrap procedure:
 * 1. Initialize world clock sync
 * 2. Initialize auth store
 * 3. If no session, dispatch NO_SESSION
 * 4. If session exists, fetch game data & character, dispatch AUTH_READY(hasCharacter)
 */
export async function bootstrapSession(): Promise<BootstrapOutcome> {
  // 1. Initialize clock sync
  if (!clockCleanup) {
    clockCleanup = initClockSync();
  }

  // 2. Initialize auth store
  await useAuthStore.getState().init();
  const authState = useAuthStore.getState();

  // 3. Check session
  if (authState.status === 'signed-out') {
    return { type: 'NO_SESSION' };
  }

  // 4. If session exists (guest or member), fetch character and initial game data
  const hasChar = await useGameStore.getState().loadInitialGameData();
  const character = useGameStore.getState().character;

  return {
    type: 'AUTH_READY',
    hasCharacter: hasChar,
    character,
  };
}

export function teardownBootstrap(): void {
  if (clockCleanup) {
    clockCleanup();
    clockCleanup = null;
  }
}
