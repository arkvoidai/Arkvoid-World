import { useEffect, useState } from 'react';
import { useWorldBridgeStore } from '@/state/worldBridgeStore';

export interface ArrivalOverlayProps {
  onSkip?: () => void;
}

export function ArrivalOverlay({ onSkip }: ArrivalOverlayProps) {
  const [showWorldName, setShowWorldName] = useState(true);
  const hour = useWorldBridgeStore((s) => s.hour);

  const formattedHour = `${String(Math.floor(hour)).padStart(2, '0')}:${String(
    Math.floor((hour % 1) * 60),
  ).padStart(2, '0')}`;

  // World name fades after 4 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowWorldName(false);
    }, 4000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Skip arrival sequence"
      onClick={onSkip}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape') {
          onSkip?.();
        }
      }}
      className="fixed inset-0 z-hud flex flex-col items-center justify-center p-8 select-none cursor-pointer outline-none pointer-events-auto"
    >
      {/* Title Card: "Dawn Terrace" + current world hour mono label */}
      <div
        className={`flex flex-col items-center gap-2 text-center transition-opacity duration-1000 ${
          showWorldName ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <h1
          className="font-serif italic text-4xl md:text-5xl text-ink font-normal tracking-wide drop-shadow-sm"
          style={{ fontFamily: "'Instrument Serif', serif" }}
        >
          Dawn Terrace
        </h1>
        <span className="font-mono text-xs tracking-widest text-ink/70 uppercase">
          {formattedHour}
        </span>
      </div>
    </div>
  );
}
