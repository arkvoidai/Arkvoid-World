import { useEffect, useState } from 'react';
import type { ExposureProbeStats } from '@/engine/core/Composer';
import type { AssetStoreReport } from '@/engine/core/AssetStore';
import { useWorldBridgeStore } from '@/state/worldBridgeStore';

export interface DebugReadoutProps {
  showDebug?: boolean;
  showProbe?: boolean;
  showAssets?: boolean;
}

export function DebugReadout({
  showDebug = true,
  showProbe = false,
  showAssets = false,
}: DebugReadoutProps) {
  const fps = useWorldBridgeStore((s) => s.fps);
  const frameMsP95 = useWorldBridgeStore((s) => s.frameMsP95);
  const drawCalls = useWorldBridgeStore((s) => s.drawCalls);
  const triangles = useWorldBridgeStore((s) => s.triangles);
  const hour = useWorldBridgeStore((s) => s.hour);
  const natureStats = useWorldBridgeStore((s) => s.natureStats);

  const [probe, setProbe] = useState<ExposureProbeStats | null>(null);
  const [assetReport, setAssetReport] = useState<AssetStoreReport | null>(null);

  useEffect(() => {
    if (!showProbe) return;
    const updateProbe = () => {
      if (typeof window !== 'undefined' && window.__ARKVOID_EXPOSURE_PROBE__) {
        setProbe({ ...window.__ARKVOID_EXPOSURE_PROBE__ });
      }
    };
    updateProbe();
    const interval = window.setInterval(updateProbe, 1000);
    return () => window.clearInterval(interval);
  }, [showProbe]);

  useEffect(() => {
    if (!showAssets) return;
    const updateAssets = () => {
      if (typeof window !== 'undefined' && window.__ARKVOID_ASSETS__) {
        setAssetReport({ ...window.__ARKVOID_ASSETS__ });
      }
    };
    updateAssets();
    const interval = window.setInterval(updateAssets, 500);
    return () => window.clearInterval(interval);
  }, [showAssets]);

  if (!import.meta.env.DEV) {
    return null;
  }

  return (
    <>
      {showDebug ? (
        <div
          data-testid="debug-readout"
          className="pointer-events-none fixed left-3 top-3 z-hud select-none font-mono text-[11px] uppercase tracking-[0.14em] text-ink/80"
        >
          {`${fps} FPS · P95 ${frameMsP95.toFixed(1)}MS · DC ${drawCalls} · TRI ${triangles} · ${hour.toFixed(2)}H${
            natureStats
              ? ` · GRASS ${natureStats.grass} · FLW ${natureStats.flowers} · TREE ${natureStats.trees}`
              : ''
          }`}
        </div>
      ) : null}

      {showProbe ? (
        <aside
          aria-label="Exposure Probe Diagnostics"
          data-testid="exposure-probe-readout"
          className="pointer-events-none fixed right-3 top-3 z-hud flex flex-col items-end select-none rounded border border-line bg-pearl/85 px-3 py-1.5 font-mono text-[11px] tracking-[0.12em] text-ink shadow-sm backdrop-blur-xs"
        >
          <div className="font-medium text-ink">
            {probe
              ? `MEAN ${probe.mean.toFixed(2)} · P5 ${probe.p5.toFixed(2)} · P95 ${probe.p95.toFixed(2)}`
              : 'PROBE SAMPLING...'}
          </div>
          {probe ? (
            <div className="mt-0.5 text-[10px] text-muted">
              {`CLIP ${(probe.clippedWhiteFraction * 100).toFixed(1)}% · CRUSH ${(probe.crushedBlackFraction * 100).toFixed(1)}% · ${probe.isInTarget ? 'TARGET OK' : 'CHECK'}`}
            </div>
          ) : null}
        </aside>
      ) : null}

      {showAssets ? (
        <aside
          aria-label="Asset Manifest & Texture Budget"
          data-testid="asset-manifest-readout"
          className="fixed bottom-4 left-4 z-hud flex max-h-[85vh] max-w-4xl flex-col overflow-auto rounded-lg border border-line bg-pearl/95 p-4 font-mono text-[11px] text-ink shadow-xl backdrop-blur-md"
        >
          <div className="flex items-center justify-between border-b border-line pb-2 font-semibold">
            <span className="text-[12px] tracking-wider uppercase">Texture Integration Report</span>
            <span className="text-muted text-[10px]">
              {assetReport
                ? `TARGET ${assetReport.tierTargetRes}PX · ANISO ${assetReport.anisotropy}X · MEMORY ${assetReport.totalTextureMemoryMb} MB`
                : 'DISCOVERING TEXTURES...'}
            </span>
          </div>

          {assetReport?.isDownloadBudgetExceeded ? (
            <div className="mt-2 rounded bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-700">
              WARNING: Total texture download size ({assetReport.totalDownloadMb} MB) exceeds the 40 MB budget cap.
            </div>
          ) : null}

          {assetReport?.isMemoryBudgetExceeded ? (
            <div className="mt-1 rounded bg-red-500/10 px-2 py-1 text-[11px] font-medium text-red-700">
              WARNING: Total texture GPU memory ({assetReport.totalTextureMemoryMb} MB) exceeds tier budget.
            </div>
          ) : null}

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-line/60 text-[10px] uppercase text-muted tracking-wider">
                  <th className="py-1 px-1.5">Thumb</th>
                  <th className="py-1 px-1.5">Slot</th>
                  <th className="py-1 px-1.5">Set Key</th>
                  <th className="py-1 px-1.5">Maps Found</th>
                  <th className="py-1 px-1.5">Res</th>
                  <th className="py-1 px-1.5">Size</th>
                  <th className="py-1 px-1.5">Normal</th>
                  <th className="py-1 px-1.5">Gain</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/40 text-[11px]">
                {assetReport?.slots.map((s) => (
                  <tr key={s.slot} className="hover:bg-black/5">
                    <td className="py-1 px-1.5">
                      {s.thumbnailUrl ? (
                        <img
                          src={s.thumbnailUrl}
                          alt={s.slot}
                          className="h-16 w-16 rounded border border-line/60 object-cover"
                        />
                      ) : (
                        <div className="flex h-16 w-16 items-center justify-center rounded border border-line/40 bg-black/5 text-[9px] text-muted">
                          FALLBACK
                        </div>
                      )}
                    </td>
                    <td className="py-1 px-1.5 font-bold uppercase">{s.slot}</td>
                    <td className="py-1 px-1.5 font-medium text-ink-2">{s.setKey}</td>
                    <td className="py-1 px-1.5 text-muted">{s.mapsFound.join(', ') || 'none'}</td>
                    <td className="py-1 px-1.5">{s.chosenRes}px</td>
                    <td className="py-1 px-1.5">
                      {s.fileSizeBytes > 0
                        ? `${(s.fileSizeBytes / (1024 * 1024)).toFixed(2)} MB`
                        : 'procedural'}
                    </td>
                    <td className="py-1 px-1.5">{s.normalConvention}</td>
                    <td className="py-1 px-1.5 font-mono">{s.albedoGain.toFixed(2)}x</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 space-y-1 border-t border-line pt-2 text-[10px] text-muted">
            <div>
              <span className="font-semibold text-ink">Total Download:</span>{' '}
              {assetReport ? `${assetReport.totalDownloadMb} MB` : '0 MB'}
            </div>
            <div>
              <span className="font-semibold text-ink">Unused Sets:</span>{' '}
              {assetReport?.unusedSets.length ? assetReport.unusedSets.join(', ') : 'none'}
            </div>
            <div>
              <span className="font-semibold text-ink">Ignored Files:</span>{' '}
              {assetReport?.ignoredFiles.length ? assetReport.ignoredFiles.join(', ') : 'none'}
            </div>
          </div>
        </aside>
      ) : null}
    </>
  );
}
