import { useEffect } from 'react';
import { create } from 'zustand';
import { AnimatePresence, LazyMotion, domAnimation, m } from 'motion/react';
import { COLORS, Z_INDEX } from '@/config/tokens';
import { getMotionPreset, prefersReducedMotion } from '@/lib/motion';
import { useGlass } from '@/ui/Glass';

export type ToastTone = 'neutral' | 'dawn' | 'dusk';

export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastState {
  current: ToastItem | null;
  show: (message: string, tone?: ToastTone) => void;
  dismiss: () => void;
}

let nextToastId = 1;

export const useToastStore = create<ToastState>((set) => ({
  current: null,
  show(message: string, tone: ToastTone = 'neutral') {
    set({
      current: {
        id: nextToastId++,
        message,
        tone,
      },
    });
  },
  dismiss() {
    set({ current: null });
  },
}));

export function showToast(message: string, tone: ToastTone = 'neutral'): void {
  useToastStore.getState().show(message, tone);
}

export function ToastHost() {
  const current = useToastStore((s) => s.current);
  const dismiss = useToastStore((s) => s.dismiss);
  const glassStyle = useGlass({ elevated: true });
  const reduced = prefersReducedMotion();
  const variants = getMotionPreset('fadeUp', reduced);

  useEffect(() => {
    if (!current) return;
    const timer = window.setTimeout(() => {
      dismiss();
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [current, dismiss]);

  return (
    <LazyMotion features={domAnimation}>
      <div
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed inset-x-0 flex justify-center px-4"
        style={{
          bottom: 'calc(var(--safe-bottom, 0px) + 20px)',
          zIndex: Z_INDEX.toast,
        }}
      >
        <AnimatePresence mode="wait">
          {current ? (
            <m.div
              key={current.id}
              variants={variants}
              initial="initial"
              animate="animate"
              exit="exit"
              role="status"
              className="pointer-events-auto inline-flex min-h-[44px] max-w-md items-center gap-2.5 rounded-full px-5 py-2.5 text-sm font-medium text-ink"
              style={glassStyle}
            >
              {current.tone !== 'neutral' ? (
                <span
                  aria-hidden="true"
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{
                    backgroundColor:
                      current.tone === 'dawn' ? COLORS.orange : COLORS.purple,
                    boxShadow:
                      current.tone === 'dawn'
                        ? `0 0 8px ${COLORS.orangeGlow}`
                        : `0 0 8px ${COLORS.purpleGlow}`,
                  }}
                />
              ) : null}
              <span>{current.message}</span>
            </m.div>
          ) : null}
        </AnimatePresence>
      </div>
    </LazyMotion>
  );
}
