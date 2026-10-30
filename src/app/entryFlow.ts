import type { BootstrapOutcome } from '@/app/bootstrap';
import type { AuthStatus } from '@/state/auth';

/** New visitors and persisted guests without a character always land at the gate. */
export function resolvePostBootstrapMode(outcome: BootstrapOutcome): 'gate' | 'arrival' {
  return outcome.type === 'AUTH_READY' && outcome.hasCharacter ? 'arrival' : 'gate';
}

/** Never create a second anonymous identity for a visitor who already has a session. */
export function shouldCreateGuestSession(status: AuthStatus): boolean {
  return status !== 'guest' && status !== 'member';
}
