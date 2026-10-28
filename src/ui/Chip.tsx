import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { COLORS } from '@/config/tokens';
import { haptic } from '@/lib/motion';
import { useGlass } from '@/ui/Glass';

export type ChipTone = 'neutral' | 'dawn' | 'dusk';

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  tone?: ChipTone;
  selected?: boolean;
}

export const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip(
  {
    label,
    tone = 'neutral',
    selected = false,
    className = '',
    style,
    onClick,
    disabled,
    ...rest
  },
  ref,
) {
  const glassStyle = useGlass();

  const dotColor =
    tone === 'dawn'
      ? COLORS.orange
      : tone === 'dusk'
        ? COLORS.purple
        : COLORS.ink3;

  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      onClick={(e) => {
        if (disabled) return;
        haptic('tap');
        onClick?.(e);
      }}
      className={`arkvoid-focus-ring inline-flex min-h-[40px] items-center gap-2 rounded-full px-4 text-sm font-medium whitespace-nowrap shrink-0 select-none transition-[transform,opacity] duration-[90ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] active:scale-[0.98] disabled:opacity-50 arkvoid-btn-sm ${className}`}
      style={{
        ...glassStyle,
        border: selected
          ? `1px solid ${COLORS.lineStrong}`
          : `1px solid ${COLORS.line}`,
        color: selected ? COLORS.ink : COLORS.ink2,
        ...style,
      }}
      {...rest}
    >
      {tone !== 'neutral' ? (
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{
            backgroundColor: dotColor,
            boxShadow:
              tone === 'dawn'
                ? `0 0 6px ${COLORS.orangeGlow}`
                : `0 0 6px ${COLORS.purpleGlow}`,
          }}
        />
      ) : null}
      <span>{label}</span>
    </button>
  );
});
