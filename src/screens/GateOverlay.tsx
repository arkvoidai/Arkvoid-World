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
      className="pointer-events-none fixed inset-0 z-hud flex flex-col justify-between p-6 select-none"
    >
      {/* Top tiny mono label */}
      <div className="flex items-center justify-between">
        <span
          data-testid="gate-early-preview-badge"
          className="rounded-pill border border-line bg-white/85 px-2.5 py-1 font-mono text-[10px] tracking-widest text-ink-3 shadow-sm backdrop-blur-md"
        >
          EARLY PREVIEW
        </span>
      </div>

      {/* Main Gate Card: Bottom centered on phones, left-center on desktop */}
      <div className="pointer-events-auto flex flex-col w-full max-w-md mx-auto md:mx-0 md:my-auto mb-3 md:mb-0">
        <div
          data-testid="gate-main-card"
          className="flex flex-col gap-5 rounded-panel border border-line bg-white/92 p-6 shadow-violet-layered backdrop-blur-md md:p-8"
        >
          {/* Logo Lockup */}
          <div className="flex items-center">
            <Logo size={42} variant="lockup" />
          </div>

          {/* World Name in Instrument Serif italic */}
          <div className="flex flex-col gap-1">
            <h1
              className="font-serif italic text-3xl font-normal leading-tight text-ink md:text-4xl"
              style={{ fontFamily: "'Instrument Serif', serif" }}
            >
              Celestial Frontier
            </h1>
          </div>

          {/* Primary Action Button: "Begin" */}
          <div className="flex flex-col gap-2.5 pt-2">
            <Button
              data-testid="gate-begin-btn"
              variant="light"
              size="lg"
              loading={isLoading || clickPending || status === 'loading'}
              onClick={handleBeginClick}
              className="w-full text-base font-medium shadow-sm hover:shadow"
            >
              Begin
            </Button>

            {localError && (
              <p className="text-center text-xs text-orange">{localError}</p>
            )}

            <button
              type="button"
              onClick={() => setAccountSheetOpen(true)}
              className="py-2 text-center text-xs text-ink-3 hover:text-ink transition-colors"
            >
              I have an account
            </button>
          </div>
        </div>
      </div>

      {/* Footer tiny links for Privacy and Terms */}
      <footer className="pointer-events-auto flex items-center justify-center gap-4 py-1 text-[11px] text-ink-3">
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
