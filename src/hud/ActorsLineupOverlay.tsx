import { useState } from 'react';
import { REVIEW_HOURS, setHourOverride } from '@/lib/worldClock';
import { sharedEngineBridge } from '@/state/worldBridgeStore';
import type { AnimationStateName } from '@/engine/actors/Animator';

export interface ActorsLineupOverlayProps {
  onCaptureFrame?: () => string | null;
  onSelectAnimation?: (anim: AnimationStateName) => void;
  onToggleAutoCycle?: (enabled: boolean) => void;
}

const ANIMATIONS: { id: AnimationStateName; label: string }[] = [
  { id: 'idle', label: 'Idle' },
  { id: 'walk', label: 'Walk' },
  { id: 'run', label: 'Run' },
  { id: 'sit-meditate', label: 'Meditate' },
  { id: 'bow', label: 'Bow' },
  { id: 'wave', label: 'Wave' },
  { id: 'talk', label: 'Talk' },
  { id: 'gather', label: 'Gather' },
];

export default function ActorsLineupOverlay({
  onCaptureFrame,
  onSelectAnimation,
  onToggleAutoCycle,
}: ActorsLineupOverlayProps) {
  const [hourIndex, setHourIndex] = useState(0);
  const [activeAnim, setActiveAnim] = useState<AnimationStateName | 'auto'>('auto');
  const [savedDataUrl, setSavedDataUrl] = useState<string | null>(null);

  const currentHour = REVIEW_HOURS[hourIndex] ?? REVIEW_HOURS[0];

  const handleSelectHour = (idx: number) => {
    setHourIndex(idx);
    const hour = REVIEW_HOURS[idx] ?? REVIEW_HOURS[0];
    setHourOverride(hour);
    sharedEngineBridge.enqueue({ type: 'setHourOverride', hour });
    onCaptureFrame?.();
  };

  const handleSelectAnim = (anim: AnimationStateName | 'auto') => {
    setActiveAnim(anim);
    if (anim === 'auto') {
      onToggleAutoCycle?.(true);
    } else {
      onToggleAutoCycle?.(false);
      onSelectAnimation?.(anim);
    }
    onCaptureFrame?.();
  };

  const handleSaveImage = () => {
    const dataUrl = onCaptureFrame?.() ?? null;
    if (!dataUrl) return;

    const filename = `arkvoid-actors-${activeAnim}-${currentHour}h.png`;
    setSavedDataUrl(dataUrl);

    if (typeof document !== 'undefined') {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  return (
    <aside
      aria-label="Actors Lineup Stage Controls"
      data-testid="actors-lineup-overlay"
      className="pointer-events-auto fixed bottom-4 left-4 z-overlay flex max-w-sm flex-col gap-2.5 rounded-card border border-line bg-surface p-3 font-sans text-xs text-ink shadow-glass backdrop-blur-glass"
    >
      <div className="flex items-center justify-between gap-4 border-b border-line pb-1.5">
        <span className="font-semibold text-ink">Actors Lineup (4 Forms · 3 Leanings · 4 Residents)</span>
        <span className="font-mono text-muted tabular-nums">{currentHour.toFixed(1)}h</span>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted">Time of Day</span>
        <div className="flex flex-wrap gap-1">
          {REVIEW_HOURS.map((h, idx) => (
            <button
              key={h}
              type="button"
              onClick={() => handleSelectHour(idx)}
              className={`rounded-pill border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                hourIndex === idx
                  ? 'border-orange bg-orange/15 text-orange'
                  : 'border-line bg-pearl/80 text-ink-2 hover:bg-pearl'
              }`}
            >
              {h}h
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted">Pose & Animation</span>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => handleSelectAnim('auto')}
            className={`rounded-pill border px-2 py-0.5 text-[11px] font-medium transition-colors ${
              activeAnim === 'auto'
                ? 'border-purple bg-purple/15 text-purple'
                : 'border-line bg-pearl/80 text-ink-2 hover:bg-pearl'
            }`}
          >
            Auto Cycle
          </button>
          {ANIMATIONS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => handleSelectAnim(a.id)}
              className={`rounded-pill border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                activeAnim === a.id
                  ? 'border-purple bg-purple/15 text-purple'
                  : 'border-line bg-pearl/80 text-ink-2 hover:bg-pearl'
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-1 border-t border-line">
        <span className="text-[10px] text-muted">Move: WASD · Shift: Run · G: Gather · M: Meditate</span>
        <button
          type="button"
          onClick={handleSaveImage}
          data-testid="save-actors-image-button"
          className="rounded-pill border border-line bg-orange/10 px-3 py-1 font-medium text-orange transition-colors hover:bg-orange/20"
        >
          Save image
        </button>
      </div>

      {savedDataUrl && (
        <div className="mt-1 flex flex-col gap-1 rounded border border-line bg-pearl/60 p-1.5 text-[10px]">
          <span className="text-muted">Saved snapshot</span>
          <img
            src={savedDataUrl}
            alt="Actors lineup preview"
            className="h-20 w-auto rounded border border-line object-cover"
          />
        </div>
      )}
    </aside>
  );
}
