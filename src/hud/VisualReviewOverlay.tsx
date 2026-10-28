import { useState } from 'react';
import { REVIEW_SHOTS } from '@/engine/world/reviewShots';
import { REVIEW_HOURS, setHourOverride } from '@/lib/worldClock';
import { sharedEngineBridge } from '@/state/worldBridgeStore';

export interface VisualReviewOverlayProps {
  onCaptureFrame?: () => string | null;
}

export default function VisualReviewOverlay({
  onCaptureFrame,
}: VisualReviewOverlayProps) {
  const [shotIndex, setShotIndex] = useState(0);
  const [hourIndex, setHourIndex] = useState(0);
  const [savedDataUrl, setSavedDataUrl] = useState<string | null>(null);
  const [savedFilename, setSavedFilename] = useState<string>('');

  const currentShot = REVIEW_SHOTS[shotIndex] ?? REVIEW_SHOTS[0]!;
  const currentHour = REVIEW_HOURS[hourIndex] ?? REVIEW_HOURS[0];

  const selectShot = (nextIdx: number) => {
    const count = REVIEW_SHOTS.length;
    const wrapped = ((nextIdx % count) + count) % count;
    setShotIndex(wrapped);
    sharedEngineBridge.enqueue({ type: 'setReviewShot', shotIndex: wrapped });
    onCaptureFrame?.();
  };

  const selectNextHour = () => {
    const nextIdx = (hourIndex + 1) % REVIEW_HOURS.length;
    const nextHour = REVIEW_HOURS[nextIdx] ?? REVIEW_HOURS[0];
    setHourIndex(nextIdx);
    setHourOverride(nextHour);
    sharedEngineBridge.enqueue({ type: 'setHourOverride', hour: nextHour });
    onCaptureFrame?.();
  };

  const handleSaveImage = () => {
    const dataUrl = onCaptureFrame?.() ?? null;
    if (!dataUrl) return;

    const filename = `arkvoid-shot-${shotIndex + 1}-${currentShot.id}-${currentHour}h.png`;
    setSavedDataUrl(dataUrl);
    setSavedFilename(filename);

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
      aria-label="Visual Review Controls"
      data-testid="visual-review-overlay"
      className="pointer-events-auto fixed bottom-4 left-4 z-overlay flex flex-col gap-2 rounded-card border border-line bg-surface p-3 font-sans text-xs text-ink shadow-glass backdrop-blur-glass"
    >
      <div className="flex items-center justify-between gap-4 border-b border-line pb-1.5">
        <span data-testid="review-shot-label" className="font-medium text-ink">
          {currentShot.label}
        </span>
        <span
          data-testid="review-hour-label"
          className="font-mono text-muted tabular-nums"
        >
          {currentHour.toFixed(1)}h
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => selectShot(shotIndex - 1)}
          className="rounded-pill border border-line bg-pearl/80 px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:bg-pearl"
        >
          Prev shot
        </button>
        <button
          type="button"
          onClick={() => selectShot(shotIndex + 1)}
          className="rounded-pill border border-line bg-pearl/80 px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:bg-pearl"
        >
          Next shot
        </button>
        <button
          type="button"
          onClick={selectNextHour}
          className="rounded-pill border border-line bg-pearl/80 px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:bg-pearl"
        >
          Next hour
        </button>
        <button
          type="button"
          onClick={handleSaveImage}
          className="rounded-pill border border-orange/40 bg-orange/15 px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:bg-orange/25"
        >
          Save image
        </button>
      </div>

      {savedDataUrl ? (
        <div
          data-testid="review-saved-preview"
          className="mt-1 flex items-center gap-2 border-t border-line pt-1.5"
        >
          <img
            src={savedDataUrl}
            alt={savedFilename}
            className="h-9 w-14 rounded border border-line object-cover"
          />
          <div className="flex flex-col">
            <span className="font-mono text-[10px] text-muted">
              {savedFilename}
            </span>
            <span className="text-[10px] text-faint">
              Saved (long-press image on phone)
            </span>
          </div>
          <button
            type="button"
            aria-label="Close saved image preview"
            onClick={() => setSavedDataUrl(null)}
            className="ml-auto px-1.5 py-0.5 text-muted hover:text-ink"
          >
            ×
          </button>
        </div>
      ) : null}
    </aside>
  );
}
