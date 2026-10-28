import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { COLORS } from '@/config/tokens';
import { haptic } from '@/lib/motion';
import { useGlass } from '@/ui/Glass';

export interface PillProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  keycap?: string;
}

export const Pill = forwardRef<HTMLButtonElement, PillProps>(function Pill(
  { label, keycap, className = '', style, onClick, disabled, ...rest },
  ref,
) {
  const glassStyle = useGlass({ elevated: true });

  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      onClick={(event) => {
        if (disabled) return;
        haptic('soft');
        onClick?.(event);
      }}
      className={`arkvoid-focus-ring inline-flex items-center gap-3 rounded-full px-5 whitespace-nowrap shrink-0 select-none transition-[transform,opacity] duration-[90ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none ${className}`}
      style={{
        height: '54px',
        minHeight: '54px',
        ...glassStyle,
        color: COLORS.ink,
        ...style,
      }}
      {...rest}
    >
      <span
        aria-hidden="true"
        className="arkvoid-orange-dot-pulse h-2 w-2 shrink-0 rounded-full"
        style={{
          backgroundColor: COLORS.orange,
          boxShadow: `0 0 10px ${COLORS.orangeGlow}`,
        }}
      />
      <span
        className="text-body font-medium"
        style={{ letterSpacing: '-0.01em' }}
      >
        {label}
      </span>
      {keycap ? (
        <kbd
          className="hidden [@media(pointer:fine)]:inline-flex items-center justify-center rounded-full px-2 py-0.5 uppercase"
          style={{
            fontFamily: "'Geist Mono Variable', monospace",
            fontSize: '11px',
            letterSpacing: '0.14em',
            color: COLORS.ink2,
            backgroundColor: 'rgba(23, 20, 31, 0.05)',
            border: `1px solid ${COLORS.line}`,
          }}
        >
          {keycap}
        </kbd>
      ) : null}
    </button>
  );
});
