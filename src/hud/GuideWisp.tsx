import { useEffect } from 'react';
import type { PlayerCoarseCoords } from '@/engine/core/Bridge';

export interface GuideWispProps {
  playerPos: PlayerCoarseCoords;
  onHallReached?: () => void;
}

/**
 * First-run guide wisp:
 * Invites the wanderer toward the Grand Stair of the Main Hall (x ~ 2.08, z ~ -6.0).
 * Dissolves once the player reaches the stair or moves past it.
 */
export function GuideWisp({ playerPos, onHallReached }: GuideWispProps) {
  // Check distance to the hall stair (x=2.08, z=-6.0)
  const distToStair = Math.hypot(playerPos.x - 2.08, playerPos.z - (-6.0));
  const isNear = distToStair < 4.5;

  useEffect(() => {
    if (isNear) {
      onHallReached?.();
    }
  }, [isNear, onHallReached]);

  if (isNear) return null;

  return (
    <aside
      role="status"
      aria-live="polite"
      data-testid="first-run-guide-wisp"
      className="pointer-events-none fixed top-6 left-1/2 -translate-x-1/2 z-overlay flex items-center gap-2.5 rounded-pill border border-orange/30 bg-surface/85 px-4 py-2 font-sans text-xs text-ink shadow-glass backdrop-blur-glass transition-all duration-700 animate-fade-in"
    >
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-orange shadow-sm" />
      </span>
      <span className="font-serif italic text-xs text-ink tracking-wide">
        A gentle wisp drifts toward the Grand Stair
      </span>
    </aside>
  );
}
