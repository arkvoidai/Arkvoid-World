import { useState } from 'react';
import { Sheet } from '@/ui/Sheet';
import { AccountSheet } from '@/ui/AccountSheet';
import { useAuthStore } from '@/state/auth';

export interface GateOverlayProps {
  onBegin: () => Promise<void>;
  onAccountResolved: () => void;
  isLoading?: boolean;
  errorMessage?: string | null;
}

export function GateOverlay({
  onBegin,
  onAccountResolved,
  isLoading = false,
  errorMessage,
}: GateOverlayProps) {
  const [accountSheetOpen, setAccountSheetOpen] = useState(false);
  const [legalSheetDoc, setLegalSheetDoc] = useState<'privacy' | 'terms' | null>(null);
  const [clickPending, setClickPending] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const status = useAuthStore((s) => s.status);
  const busy = isLoading || clickPending || status === 'loading';

  const handleBeginClick = async () => {
    if (busy) return;
    setClickPending(true);
    setLocalError(null);
    try {
      await onBegin();
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'The gate did not open. Please try again.');
    } finally {
      setClickPending(false);
    }
  };

  return (
    <aside
      aria-label="Enter Arkvoid"
      className="pointer-events-none fixed inset-0 z-hud overflow-y-auto overscroll-contain select-none"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(90deg, rgba(13,20,19,0.68) 0%, rgba(13,20,19,0.34) 36%, rgba(13,20,19,0.02) 78%), linear-gradient(0deg, rgba(10,16,16,0.70) 0%, rgba(10,16,16,0.16) 39%, transparent 72%)',
        }}
      />

      <header className="pointer-events-none absolute left-5 right-5 top-[calc(env(safe-area-inset-top)+1.25rem)] flex items-center justify-between sm:left-9 sm:right-9 sm:top-8">
        <div className="flex items-center gap-3 text-white">
          <span className="font-sans text-[13px] font-medium tracking-[0.34em]">ARKVOID</span>
          <span className="h-3 w-px bg-white/35" />
          <span className="font-mono text-[9px] tracking-[0.2em] text-white/65">WORLD 01</span>
        </div>
        <span className="rounded-full border border-white/25 bg-black/10 px-3 py-1.5 font-mono text-[9px] tracking-[0.17em] text-white/75 backdrop-blur-md">
          HOME REACH
        </span>
      </header>

      <main className="pointer-events-auto absolute bottom-[calc(env(safe-area-inset-bottom)+3.8rem)] left-5 right-5 flex max-w-[38rem] flex-col items-start sm:bottom-14 sm:left-9 lg:bottom-[11vh] lg:left-[8vw]">
        <p className="mb-4 font-mono text-[9px] tracking-[0.24em] text-[#E8C9A4] sm:text-[10px]">
          BEYOND THE VEIL
        </p>
        <h1
          className="max-w-[34rem] text-[2.45rem] font-normal leading-[0.94] tracking-[-0.035em] text-[#F8F5EE] sm:text-6xl lg:text-[5.25rem]"
          style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}
        >
          A world you can
          <br />
          step inside.
        </h1>
        <p className="mt-5 max-w-[25rem] text-[13px] leading-[1.75] text-white/78 sm:text-[14px]">
          Walk the quiet islands. Find the old paths. Let the world unfold at your pace.
        </p>

        <div className="mt-7 flex w-full flex-col items-start gap-3 sm:w-auto sm:flex-row sm:items-center">
          <button
            type="button"
            data-testid="gate-begin-btn"
            onClick={handleBeginClick}
            disabled={busy}
            aria-busy={busy}
            className="group flex min-h-[52px] w-full items-center justify-between gap-9 rounded-full bg-[#F5F0E7] px-6 text-[13px] font-semibold tracking-[0.02em] text-[#1D2521] shadow-[0_12px_38px_rgba(0,0,0,0.22)] transition-[transform,background-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_16px_44px_rgba(0,0,0,0.28)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#E8C9A4] disabled:cursor-wait disabled:opacity-75 sm:w-[224px]"
          >
            <span>{busy ? 'Opening the gate…' : 'Begin your journey'}</span>
            <span className="text-lg transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true">↗</span>
          </button>
          <button
            type="button"
            onClick={() => setAccountSheetOpen(true)}
            className="min-h-11 px-1 text-left text-[12px] text-white/75 underline decoration-white/25 underline-offset-4 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:px-3"
          >
            I have an account
          </button>
        </div>

        {(localError || errorMessage) && (
          <p role="alert" className="mt-3 max-w-md text-[12px] text-[#FFD0B8]">
            {errorMessage || localError}
          </p>
        )}
      </main>

      <footer className="pointer-events-auto absolute bottom-[calc(env(safe-area-inset-bottom)+0.65rem)] right-5 flex items-center gap-4 text-[10px] text-white/55 sm:bottom-8 sm:right-9">
        <button type="button" onClick={() => setLegalSheetDoc('privacy')} className="transition-colors hover:text-white">Privacy</button>
        <span aria-hidden="true" className="text-white/30">·</span>
        <button type="button" onClick={() => setLegalSheetDoc('terms')} className="transition-colors hover:text-white">Terms</button>
      </footer>

      <AccountSheet
        open={accountSheetOpen}
        onClose={() => {
          setAccountSheetOpen(false);
          onAccountResolved();
        }}
      />

      <Sheet
        open={legalSheetDoc !== null}
        onClose={() => setLegalSheetDoc(null)}
        title={legalSheetDoc === 'privacy' ? 'Privacy' : 'Terms'}
        initialDetent="peek"
      >
        <div className="py-6 font-serif text-sm text-ink-2">
          This document is not published yet.
        </div>
      </Sheet>
    </aside>
  );
}
