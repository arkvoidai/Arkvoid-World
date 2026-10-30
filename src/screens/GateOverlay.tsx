import { useState } from 'react';
import { Logo } from '@/ui/Logo';
import { Button } from '@/ui/Button';
import { Sheet } from '@/ui/Sheet';
import { AccountSheet } from '@/ui/AccountSheet';
import { useAuthStore } from '@/state/auth';

export interface GateOverlayProps {
  onBegin: () => Promise<void>;
  onAccountResolved: () => void;
  isLoading?: boolean;
}

export function GateOverlay({ onBegin, onAccountResolved, isLoading = false }: GateOverlayProps) {
  const [accountSheetOpen, setAccountSheetOpen] = useState(false);
  const [legalSheetDoc, setLegalSheetDoc] = useState<'privacy' | 'terms' | null>(null);
  const [clickPending, setClickPending] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const status = useAuthStore((s) => s.status);

  const handleBeginClick = async () => {
    if (clickPending || isLoading) return;
    setClickPending(true);
    setLocalError(null);
    try {
      await onBegin();
    } catch {
      setLocalError('Unable to begin. Retrying...');
      useAuthStore.getState().resetGuestState();
      try {
        await onBegin();
      } catch {
        setLocalError('Something went quiet. Try again.');
      }
    } finally {
      setClickPending(false);
    }
  };

  return (
    <aside
      aria-label="Welcome Gate"
      className="pointer-events-none fixed inset-0 z-hud flex flex-col justify-between overflow-y-auto overscroll-contain px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+1rem)] select-none sm:px-6"
    >
      {/* Top tiny mono label */}
      <div className="flex items-center justify-between">
        <span
          data-testid="gate-early-preview-badge"
          className="rounded-pill border border-white/70 bg-[#fbfaf7]/90 px-3 py-1.5 font-mono text-[10px] tracking-[0.18em] text-ink-3 shadow-sm backdrop-blur-xl"
        >
          EARLY PREVIEW
        </span>
      </div>

      {/* Main Gate Card: Bottom centered on phones, left-center on desktop */}
      <div className="pointer-events-auto my-auto mx-auto flex w-full max-w-[26rem] flex-col">
        <div
          data-testid="gate-main-card"
          className="flex flex-col gap-4 rounded-[26px] border border-white/70 bg-[#fbfaf7]/95 p-5 shadow-[0_24px_80px_rgba(18,12,22,0.28)] backdrop-blur-2xl sm:gap-5 sm:p-7"
        >
          {/* Logo Lockup */}
          <div className="flex items-center">
            <Logo size={38} variant="lockup" />
          </div>

          {/* World Name in Instrument Serif italic */}
          <div className="flex flex-col gap-1">
            <h1
              className="font-serif italic text-3xl font-normal leading-tight text-ink md:text-4xl"
              style={{ fontFamily: "'Instrument Serif', serif" }}
            >
              Celestial Frontier
            </h1>
            <p className="mt-1 text-xs leading-relaxed text-ink-3 sm:text-sm">
              A living world that remembers you.
            </p>
          </div>

          {/* Primary Action Button: "Begin" */}
          <div className="flex flex-col gap-2 pt-1">
            <Button
              data-testid="gate-begin-btn"
              variant="light"
              size="md"
              loading={isLoading || clickPending || status === 'loading'}
              onClick={handleBeginClick}
              className="w-full text-sm font-semibold tracking-wide shadow-sm hover:shadow"
              style={{
                backgroundImage: 'linear-gradient(110deg, #f5b777 0%, #efa878 58%, #e4aaa0 100%)',
                boxShadow: '0 12px 28px rgba(180, 104, 78, 0.20)',
              }}
            >
              Enter Arkvoid
            </Button>

            {localError && (
              <p className="text-center text-xs text-orange">{localError}</p>
            )}

            <button
              type="button"
              onClick={() => setAccountSheetOpen(true)}
              className="py-2 text-center text-xs text-ink-3 hover:text-ink transition-colors"
            >
              I already have an account
            </button>
          </div>
        </div>
      </div>

      {/* Footer tiny links for Privacy and Terms */}
      <footer className="pointer-events-auto flex items-center justify-center gap-4 py-2 text-[11px] text-ink-3">
        <button
          type="button"
          onClick={() => setLegalSheetDoc('privacy')}
          className="hover:text-ink transition-colors"
        >
          Privacy
        </button>
        <span className="opacity-40">·</span>
        <button
          type="button"
          onClick={() => setLegalSheetDoc('terms')}
          className="hover:text-ink transition-colors"
        >
          Terms
        </button>
      </footer>

      {/* Account Sheet for "I have an account" */}
      <AccountSheet
        open={accountSheetOpen}
        onClose={() => {
          setAccountSheetOpen(false);
          onAccountResolved();
        }}
      />

      {/* Simple Legal Sheet for Privacy & Terms (Step 30 placeholder) */}
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
