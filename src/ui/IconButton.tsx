import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { COLORS } from '@/config/tokens';
import { haptic } from '@/lib/motion';
import { useGlass } from '@/ui/Glass';

export interface IconButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  'aria-label': string;
  children: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    { children, className = '', style, onClick, disabled, ...rest },
    ref,
  ) {
    const glassStyle = useGlass();

    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        onClick={(event) => {
          if (disabled) return;
          haptic('tap');
          onClick?.(event);
        }}
        className={`arkvoid-focus-ring inline-flex h-12 w-12 min-h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-full select-none transition-[transform,opacity] duration-[90ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none ${className}`}
        style={{
          ...glassStyle,
          color: COLORS.ink,
          ...style,
        }}
        {...rest}
      >
        {children}
      </button>
    );
  },
);
