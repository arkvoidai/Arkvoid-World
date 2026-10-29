import { useState } from 'react';
import type { BenchmarkReport } from '@/engine/core/Benchmark';

export interface BenchmarkOverlayProps {
  report: BenchmarkReport;
  onClose?: () => void;
}

export default function BenchmarkOverlay({ report, onClose }: BenchmarkOverlayProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const json = JSON.stringify(report, null, 2);
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(json).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      });
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Benchmark Results"
      data-testid="benchmark-results-card"
      className="pointer-events-auto fixed inset-0 z-overlay flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm font-sans text-xs text-ink"
    >
      <div className="w-full max-w-md rounded-card border border-line bg-surface p-5 shadow-glass backdrop-blur-glass">
        {/* Header with PASS/FAIL badge */}
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div>
            <h2 className="font-serif text-lg font-medium text-ink">Arkvoid Benchmark</h2>
            <p className="font-mono text-[11px] text-muted">
              {report.deviceClass.toUpperCase()} · GPU TIER {report.gpuTier} · {report.refreshHz} Hz
            </p>
          </div>
          <span
            data-testid="benchmark-status-badge"
            className={`rounded-pill px-3 py-1 font-mono text-xs font-semibold ${
              report.passed
                ? 'border border-emerald-500/30 bg-emerald-500/15 text-emerald-600'
                : 'border border-rose-500/30 bg-rose-500/15 text-rose-600'
            }`}
          >
            {report.passed ? 'PASS' : 'FAIL'}
          </span>
        </div>

        {/* Core Metrics Grid */}
        <div className="my-4 grid grid-cols-2 gap-3 font-mono">
          <div className="rounded-card border border-line bg-pearl/60 p-2.5">
            <span className="text-[10px] uppercase text-muted">p95 Frame Time</span>
            <div className="mt-0.5 text-base font-semibold text-ink">
              {report.p95Ms.toFixed(1)} <span className="text-xs font-normal text-muted">ms</span>
            </div>
            <span className="text-[10px] text-muted">Budget: ≤ {report.budgetP95Ms} ms</span>
          </div>

          <div className="rounded-card border border-line bg-pearl/60 p-2.5">
            <span className="text-[10px] uppercase text-muted">Average FPS</span>
            <div className="mt-0.5 text-base font-semibold text-ink">
              {report.avgFps.toFixed(1)} <span className="text-xs font-normal text-muted">fps</span>
            </div>
            <span className="text-[10px] text-muted">p50: {report.p50Ms.toFixed(1)} ms</span>
          </div>

          <div className="rounded-card border border-line bg-pearl/60 p-2.5">
            <span className="text-[10px] uppercase text-muted">Worst Frame</span>
            <div className="mt-0.5 text-base font-semibold text-ink">
              {report.worstFrameMs.toFixed(1)} <span className="text-xs font-normal text-muted">ms</span>
            </div>
            <span className="text-[10px] text-muted">Load time: {report.loadTimeMs} ms</span>
          </div>

          <div className="rounded-card border border-line bg-pearl/60 p-2.5">
            <span className="text-[10px] uppercase text-muted">GPU Memory</span>
            <div className="mt-0.5 text-base font-semibold text-ink">
              {report.textures} <span className="text-xs font-normal text-muted">textures</span>
            </div>
            <span className="text-[10px] text-muted">{report.geometries} geometries</span>
          </div>
        </div>

        {/* Tier History */}
        <div className="mb-4 flex items-center justify-between rounded-card border border-line bg-pearl/40 px-3 py-2 font-mono text-[11px]">
          <span className="text-muted">Tier History:</span>
          <span className="font-medium text-ink">
            {report.tierHistory.join(' → ')}
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-pill border border-line bg-pearl/80 px-3 py-1.5 font-medium text-ink hover:bg-pearl"
            >
              Close
            </button>
          )}
          <button
            type="button"
            onClick={handleCopy}
            className="rounded-pill border border-orange/40 bg-orange/15 px-3.5 py-1.5 font-medium text-ink transition-colors hover:bg-orange/25"
          >
            {copied ? 'Copied JSON!' : 'Copy results'}
          </button>
        </div>
      </div>
    </div>
  );
}
