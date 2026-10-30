import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  AnimatePresence,
  LazyMotion,
  domAnimation,
  m,
  type PanInfo,
} from 'motion/react';
import { COLORS, RADII, Z_INDEX } from '@/config/tokens';
import { SPRING, haptic, prefersReducedMotion } from '@/lib/motion';
import { useGlass } from '@/ui/Glass';

export type SheetDetent = 'peek' | 'medium' | 'full';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  initialDetent?: SheetDetent;
  detent?: SheetDetent;
  onDetentChange?: (detent: SheetDetent) => void;
  children: ReactNode;
}

const DETENT_VH: Record<SheetDetent, number> = {
  peek: 30,
  medium: 58,
  full: 92,
};

const DETENT_ORDER: SheetDetent[] = ['peek', 'medium', 'full'];

export function resolveNextDetentOnDrag(
  current: SheetDetent,
  offsetY: number,
  velocityY: number,
  viewportHeight: number,
): SheetDetent | 'close' {
  const deltaVh = (-offsetY / Math.max(viewportHeight, 1)) * 100;
  const currentVh = DETENT_VH[current];
  const projectedVh = currentVh + deltaVh - (velocityY / 1000) * 14;

  if (current === 'peek' && (offsetY > 64 || velocityY > 420)) {
    return 'close';
  }
  if (projectedVh < 20) {
    return 'close';
  }

  let closest: SheetDetent = 'peek';
  let minDiff = Infinity;
  for (const candidate of DETENT_ORDER) {
    const diff = Math.abs(DETENT_VH[candidate] - projectedVh);
    if (diff < minDiff) {
      minDiff = diff;
      closest = candidate;
    }
  }
  return closest;
}

export function Sheet({
  open,
  onClose,
  title = 'Panel',
  initialDetent = 'medium',
  detent: controlledDetent,
  onDetentChange,
  children,
}: SheetProps) {
  const [internalDetent, setInternalDetent] =
    useState<SheetDetent>(initialDetent);
  const activeDetent = controlledDetent ?? internalDetent;

  const [isDesktop, setIsDesktop] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : false,
  );
  const [hasScrolledContent, setHasScrolledContent] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);

  const sheetRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const glassStyle = useGlass({ elevated: true });

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const setDetent = useCallback(
    (next: SheetDetent) => {
      setInternalDetent(next);
      onDetentChange?.(next);
    },
    [onDetentChange],
  );

  useEffect(() => {
    const onResize = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Keyboard movement only changes the visual viewport. Keep the world/layout
  // viewport steady, and update the focused sheet's position without React
  // rerenders on every frame of the keyboard animation.
  useEffect(() => {
    if (!open || isDesktop) return;
    const sheet = sheetRef.current;
    if (!sheet) return;

    const viewport = window.visualViewport;
    const syncVisualViewport = () => {
      const height = viewport?.height ?? window.innerHeight;
      const offsetTop = viewport?.offsetTop ?? 0;
      const keyboardInset = Math.max(0, window.innerHeight - height - offsetTop);
      sheet.style.setProperty('--arkvoid-visual-height', `${Math.round(height)}px`);
      sheet.style.setProperty('--arkvoid-keyboard-inset', `${Math.round(keyboardInset)}px`);
      sheet.style.setProperty(
        '--arkvoid-sheet-input-height',
        `${Math.max(180, Math.min(560, Math.round(height - 16)))}px`,
      );
    };

    syncVisualViewport();
    viewport?.addEventListener('resize', syncVisualViewport);
    viewport?.addEventListener('scroll', syncVisualViewport);
    window.addEventListener('resize', syncVisualViewport, { passive: true });
    return () => {
      viewport?.removeEventListener('resize', syncVisualViewport);
      viewport?.removeEventListener('scroll', syncVisualViewport);
      window.removeEventListener('resize', syncVisualViewport);
    };
  }, [open, isDesktop, isInputFocused]);

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;

    const rootChildren = Array.from(document.body.children);
    const modifiedElements: Element[] = [];
    for (const el of rootChildren) {
      if (el.id === 'root' && sheetRef.current && el.contains(sheetRef.current)) {
        const siblings = Array.from(el.children);
        for (const sibling of siblings) {
          if (!sibling.contains(sheetRef.current)) {
            sibling.setAttribute('inert', '');
            sibling.setAttribute('aria-hidden', 'true');
            modifiedElements.push(sibling);
          }
        }
      }
    }

    const focusTimer = window.setTimeout(() => {
      const container = sheetRef.current;
      if (!container) return;

      // Never steal focus if an input or textarea inside the sheet is already active
      const active = document.activeElement;
      if (
        active &&
        container.contains(active) &&
        (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')
      ) {
        return;
      }

      // On mobile/coarse pointers, never force auto-focus on sheet open (prevents soft keyboard jitter)
      const isCoarse =
        typeof window !== 'undefined' &&
        window.matchMedia('(pointer: coarse)').matches;
      if (isCoarse) {
        container.focus({ preventScroll: true });
        return;
      }

      const focusables = container.querySelectorAll<HTMLElement>(
        'input:not([disabled]), textarea:not([disabled]), [contenteditable], button:not([aria-label*="handle"]):not([aria-label*="detent"]):not([disabled]), [href]',
      );
      if (focusables[0]) {
        focusables[0].focus();
      } else {
        container.focus({ preventScroll: true });
      }
    }, 30);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key === 'Tab' && sheetRef.current) {
        const focusables = Array.from(
          sheetRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        );
        if (focusables.length === 0) {
          event.preventDefault();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.dispatchEvent(
        new CustomEvent('arkvoid:text-input-focus', { detail: { active: false } }),
      );
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
      for (const el of modifiedElements) {
        el.removeAttribute('inert');
        el.removeAttribute('aria-hidden');
      }
      previousFocusRef.current?.focus?.();
    };
  }, [open]);

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const vh = typeof window !== 'undefined' ? window.innerHeight : 844;
    const outcome = resolveNextDetentOnDrag(
      activeDetent,
      info.offset.y,
      info.velocity.y,
      vh,
    );
    haptic('soft');
    if (outcome === 'close') {
      onClose();
    } else {
      setDetent(outcome);
    }
  };

  const reduced = prefersReducedMotion();
  const canScrollBody =
    isDesktop || activeDetent === 'full' || hasScrolledContent || isInputFocused;

  return (
    <LazyMotion features={domAnimation}>
      <AnimatePresence>
        {open ? (
          <div
            className="fixed inset-0"
            style={{ zIndex: Z_INDEX.sheet }}
            data-testid="arkvoid-sheet-layer"
          >
            {/* Subtle pearl-tinted scrim backdrop */}
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduced ? 0.12 : 0.18 }}
              onClick={onClose}
              aria-hidden="true"
              className="fixed inset-0"
              style={{
                backgroundColor: 'rgba(23, 20, 31, 0.16)',
              }}
            />

            {isDesktop ? (
              /* Desktop (>= 1024px): Floating right panel 400px wide, 16px margin, 28px radius */
              <m.div
                ref={sheetRef}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                tabIndex={-1}
                initial={reduced ? { opacity: 0 } : { opacity: 0, x: 24 }}
                animate={reduced ? { opacity: 1 } : { opacity: 1, x: 0 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, x: 16 }}
                transition={reduced ? { duration: 0.12 } : SPRING}
                className="fixed flex flex-col overflow-hidden outline-none"
                style={{
                  top: 'calc(var(--safe-top, 0px) + 16px)',
                  right: 'calc(var(--safe-right, 0px) + 16px)',
                  bottom: 'calc(var(--safe-bottom, 0px) + 16px)',
                  width: '400px',
                  borderRadius: RADII.panel,
                  ...glassStyle,
                  backgroundColor:
                    glassStyle.backdropFilter === 'none'
                      ? 'rgba(251, 250, 247, 0.97)'
                      : 'rgba(255, 255, 255, 0.82)',
                }}
              >
                <div className="flex items-center justify-between px-6 pt-5 pb-3">
                  <span className="text-heading font-medium text-ink">
                    {title}
                  </span>
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close panel"
                    className="arkvoid-focus-ring inline-flex h-10 w-10 items-center justify-center rounded-full text-ink-2 transition-transform duration-[90ms] active:scale-[0.98]"
                    style={{
                      backgroundColor: 'rgba(23, 20, 31, 0.05)',
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path
                        d="M4 4L12 12M12 4L4 12"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto px-6 pb-6">
                  {children}
                </div>
              </m.div>
            ) : (
              /* Mobile/Tablet (< 1024px): Bottom sheet with peek (30dvh), medium (58dvh), full (92dvh) detents */
              <m.div
                ref={sheetRef}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                tabIndex={-1}
                drag={isInputFocused ? false : 'y'}
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={0.18}
                onDragEnd={handleDragEnd}
                onFocusCapture={(e) => {
                  if (
                    e.target instanceof HTMLInputElement ||
                    e.target instanceof HTMLTextAreaElement
                  ) {
                    setIsInputFocused(true);
                    window.dispatchEvent(
                      new CustomEvent('arkvoid:text-input-focus', { detail: { active: true } }),
                    );
                  }
                }}
                onBlurCapture={(e) => {
                  if (
                    e.target instanceof HTMLInputElement ||
                    e.target instanceof HTMLTextAreaElement
                  ) {
                    window.setTimeout(() => {
                      const active = document.activeElement;
                      if (
                        !(
                          active instanceof HTMLInputElement ||
                          active instanceof HTMLTextAreaElement
                        )
                      ) {
                        setIsInputFocused(false);
                        window.dispatchEvent(
                          new CustomEvent('arkvoid:text-input-focus', { detail: { active: false } }),
                        );
                      }
                    }, 60);
                  }
                }}
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 80 }}
                animate={{
                  opacity: 1,
                  y: 0,
                }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, y: 80 }}
                transition={reduced ? { duration: 0.12 } : SPRING}
                className="fixed inset-x-0 bottom-0 flex flex-col overflow-hidden outline-none"
                style={{
                  bottom: isInputFocused
                    ? 'calc(var(--arkvoid-keyboard-inset, 0px) + var(--safe-bottom, 0px))'
                    : '0px',
                  height: isInputFocused
                    ? 'var(--arkvoid-sheet-input-height, min(88dvh, 560px))'
                    : `${DETENT_VH[activeDetent]}dvh`,
                  maxHeight: isInputFocused
                    ? 'var(--arkvoid-sheet-input-height, 94dvh)'
                    : '94dvh',
                  borderTopLeftRadius: RADII.sheet,
                  borderTopRightRadius: RADII.sheet,
                  paddingBottom: 'var(--safe-bottom, 0px)',
                  transition: isInputFocused
                    ? 'none'
                    : 'height 320ms cubic-bezier(0.2, 0.8, 0.2, 1)',
                  ...glassStyle,
                  backgroundColor: 'rgba(251, 250, 247, 0.97)',
                }}
              >
                {/* Grab handle zone (36x4 px) + cycle detent on tap */}
                <div className="flex flex-col items-center pt-3 pb-2">
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={`Sheet handle, current height ${activeDetent}`}
                    onClick={() => {
                      const nextIdx =
                        (DETENT_ORDER.indexOf(activeDetent) + 1) %
                        DETENT_ORDER.length;
                      const next = DETENT_ORDER[nextIdx];
                      if (next) setDetent(next);
                    }}
                    className="arkvoid-focus-ring flex h-6 w-16 items-center justify-center rounded-full"
                  >
                    <span
                      aria-hidden="true"
                      className="block rounded-full"
                      style={{
                        width: '36px',
                        height: '4px',
                        backgroundColor: COLORS.lineStrong,
                      }}
                    />
                  </button>
                  <div className="flex w-full items-center justify-between px-6 pt-1 pb-2">
                    <span className="text-heading font-medium text-ink">
                      {title}
                    </span>
                    <div className="flex items-center gap-1">
                      {DETENT_ORDER.map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setDetent(d)}
                          className="arkvoid-focus-ring rounded-full px-2.5 py-1 uppercase transition-colors"
                          style={{
                            fontFamily: "'Geist Mono Variable', monospace",
                            fontSize: '11px',
                            letterSpacing: '0.14em',
                            color:
                              activeDetent === d ? COLORS.ink : COLORS.ink2,
                            backgroundColor:
                              activeDetent === d
                                ? 'rgba(23, 20, 31, 0.08)'
                                : 'transparent',
                          }}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div
                  onScroll={(e) => {
                    if (e.currentTarget.scrollTop > 0 && !hasScrolledContent) {
                      setHasScrolledContent(true);
                    }
                  }}
                  className={`min-h-0 flex-1 px-6 pb-6 ${
                    canScrollBody ? 'overflow-y-auto' : 'overflow-y-hidden'
                  }`}
                  style={{
                    overscrollBehavior: 'contain',
                    WebkitOverflowScrolling: 'touch',
                  }}
                >
                  {children}
                </div>
              </m.div>
            )}
          </div>
        ) : null}
      </AnimatePresence>
    </LazyMotion>
  );
}
