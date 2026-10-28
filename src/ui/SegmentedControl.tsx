import { useId, useRef, type KeyboardEvent } from 'react';
import { LazyMotion, domAnimation, m } from 'motion/react';
import { COLORS, SHADOWS } from '@/config/tokens';
import { SPRING, haptic, prefersReducedMotion } from '@/lib/motion';
import { useGlass } from '@/ui/Glass';

export interface SegmentedOption<T extends string = string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string = string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}

export function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  ariaLabel,
  className = '',
}: SegmentedControlProps<T>) {
  const layoutId = useId();
  const glassStyle = useGlass();
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const reduced = prefersReducedMotion();

  const handleKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const count = options.length;
    if (count === 0) return;

    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (index + 1) % count;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (index - 1 + count) % count;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = count - 1;
    }

    if (nextIndex !== null) {
      event.preventDefault();
      const nextOption = options[nextIndex];
      if (nextOption) {
        haptic('tap');
        onChange(nextOption.value);
        buttonRefs.current[nextIndex]?.focus();
      }
    }
  };

  return (
    <LazyMotion features={domAnimation}>
      <div
        role="radiogroup"
        aria-label={ariaLabel}
        className={`relative inline-flex items-center rounded-full p-1 select-none ${className}`}
        style={{
          minHeight: '48px',
          ...glassStyle,
        }}
      >
        {options.map((option, index) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              ref={(el) => {
                buttonRefs.current[index] = el;
              }}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              onClick={() => {
                if (!active) {
                  haptic('tap');
                  onChange(option.value);
                }
              }}
              onKeyDown={(e) => handleKeyDown(e, index)}
              className="arkvoid-focus-ring relative z-10 inline-flex h-10 min-w-[76px] items-center justify-center rounded-full px-4 text-sm font-medium whitespace-nowrap shrink-0 transition-colors"
              style={{
                color: active ? COLORS.ink : COLORS.ink2,
              }}
            >
              {active ? (
                <m.span
                  layoutId={`seg-${layoutId}`}
                  transition={reduced ? { duration: 0.12 } : SPRING}
                  className="pointer-events-none absolute inset-0 rounded-full"
                  style={{
                    backgroundColor: COLORS.pearl,
                    border: `1px solid ${COLORS.line}`,
                    boxShadow: SHADOWS.violetSoft,
                  }}
                />
              ) : null}
              <span className="relative z-10">{option.label}</span>
            </button>
          );
        })}
      </div>
    </LazyMotion>
  );
}
