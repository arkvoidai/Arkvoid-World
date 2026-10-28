import {
  forwardRef,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { COLORS, GRADIENTS, SHADOWS } from '@/config/tokens';
import { haptic } from '@/lib/motion';
import { useGlass } from '@/ui/Glass';

export type ButtonVariant = 'ink' | 'light' | 'quiet' | 'ghost';
export type ButtonSize = 'lg' | 'md' | 'sm';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

const SIZE_STYLES: Record<
  ButtonSize,
  { height: string; paddingInline: string; fontSize: string; className: string }
> = {
  lg: {
    height: '56px',
    paddingInline: '24px',
    fontSize: '16px',
    className: '',
  },
  md: {
    height: '48px',
    paddingInline: '20px',
    fontSize: '16px',
    className: '',
  },
  sm: {
    height: '40px',
    paddingInline: '16px',
    fontSize: '14px',
    className: 'arkvoid-btn-sm',
  },
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = 'ink',
      size = 'md',
      loading = false,
      disabled = false,
      leadingIcon,
      trailingIcon,
      children,
      className = '',
      style,
      onClick,
      ...rest
    },
    ref,
  ) {
    const glassStyle = useGlass();
    const sizeSpec = SIZE_STYLES[size];
    const isDisabled = disabled || loading;

    const getVariantStyle = (): CSSProperties => {
      switch (variant) {
        case 'ink':
          return {
            backgroundColor: COLORS.ink,
            color: COLORS.pearl,
            border: '1px solid transparent',
            boxShadow: SHADOWS.violetSoft,
          };
        case 'light':
          return {
            backgroundImage: GRADIENTS.aurora,
            color: COLORS.ink,
            border: '1px solid rgba(255, 255, 255, 0.72)',
            boxShadow: SHADOWS.orangeLight,
          };
        case 'quiet':
          return {
            ...glassStyle,
            color: COLORS.ink,
            border: `1px solid ${COLORS.line}`,
          };
        case 'ghost':
          return {
            backgroundColor: 'transparent',
            color: COLORS.ink2,
            border: '1px solid transparent',
          };
      }
    };

    const handleClick: ButtonHTMLAttributes<HTMLButtonElement>['onClick'] = (
      event,
    ) => {
      if (isDisabled) {
        event.preventDefault();
        return;
      }
      haptic(variant === 'light' ? 'soft' : 'tap');
      onClick?.(event);
    };

    return (
      <button
        ref={ref}
        type="button"
        disabled={isDisabled}
        aria-busy={loading || undefined}
        onClick={handleClick}
        className={`arkvoid-focus-ring relative inline-flex items-center justify-center rounded-full font-medium whitespace-nowrap shrink-0 select-none transition-[transform,opacity,background-color] duration-[90ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none ${sizeSpec.className} ${className}`}
        style={{
          height: sizeSpec.height,
          minHeight: sizeSpec.height,
          paddingInline: sizeSpec.paddingInline,
          fontSize: sizeSpec.fontSize,
          letterSpacing: '-0.01em',
          ...getVariantStyle(),
          ...style,
        }}
        {...rest}
      >
        <span
          className={`inline-flex items-center justify-center gap-2 ${
            loading ? 'opacity-0' : 'opacity-100'
          }`}
        >
          {leadingIcon ? <span className="shrink-0">{leadingIcon}</span> : null}
          <span>{children}</span>
          {trailingIcon ? (
            <span className="shrink-0">{trailingIcon}</span>
          ) : null}
        </span>
        {loading ? (
          <span
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
            aria-hidden="true"
          >
            <svg
              className="h-4 w-4 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                cx="12"
                cy="12"
                r="9"
                stroke="currentColor"
                strokeOpacity="0.24"
                strokeWidth="2"
              />
              <path
                d="M21 12a9 9 0 0 0-9-9"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </span>
        ) : null}
      </button>
    );
  },
);
