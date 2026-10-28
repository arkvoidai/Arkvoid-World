import {
  useEffect,
  useId,
  useState,
  type ReactNode,
} from 'react';
import { AnimatePresence, LazyMotion, domAnimation, m } from 'motion/react';
import { COLORS, Z_INDEX } from '@/config/tokens';
import { getMotionPreset, prefersReducedMotion } from '@/lib/motion';
import { useGlass } from '@/ui/Glass';

export interface TooltipProps {
  label: string;
  children: ReactNode;
}

export function Tooltip({ label, children }: TooltipProps) {
  const tooltipId = useId();
  const [open, setOpen] = useState(false);
  const [isFinePointer, setIsFinePointer] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: fine)').matches
      : false,
  );
  const glassStyle = useGlass({ elevated: true });
  const variants = getMotionPreset('fadeScale', prefersReducedMotion());

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    ) {
      return;
    }
    const mq = window.matchMedia('(pointer: fine)');
    const onChange = (e: MediaQueryListEvent) => setIsFinePointer(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return (
    <LazyMotion features={domAnimation}>
      <span
        className="relative inline-flex items-center"
        onMouseEnter={() => {
          if (isFinePointer) setOpen(true);
        }}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => {
          if (isFinePointer) setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        aria-describedby={isFinePointer && open ? tooltipId : undefined}
      >
        {children}
        <AnimatePresence>
          {isFinePointer && open ? (
            <m.span
              id={tooltipId}
              role="tooltip"
              variants={variants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap"
              style={{
                ...glassStyle,
                color: COLORS.ink,
                zIndex: Z_INDEX.prompt,
              }}
            >
              {label}
            </m.span>
          ) : null}
        </AnimatePresence>
      </span>
    </LazyMotion>
  );
}
