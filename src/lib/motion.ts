import type { Transition, Variants } from 'motion/react';

export const SPRING: Transition = {
  type: 'spring',
  stiffness: 260,
  damping: 30,
};

export const DURATIONS = {
  fast: 0.18,
  medium: 0.32,
  slow: 0.6,
  reduced: 0.12,
} as const;

export const EASING: [number, number, number, number] = [0.2, 0.8, 0.2, 1];

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function getMotionPreset(
  preset: 'fadeUp' | 'fadeScale' | 'sheetIn' | 'titleCard' | 'crossfade',
  reduced: boolean = prefersReducedMotion(),
): Variants {
  if (reduced) {
    const fadeTransition: Transition = {
      duration: DURATIONS.reduced,
      ease: 'linear',
    };
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1, transition: fadeTransition },
      exit: { opacity: 0, transition: fadeTransition },
    };
  }

  switch (preset) {
    case 'fadeUp':
      return {
        initial: { opacity: 0, y: 12 },
        animate: {
          opacity: 1,
          y: 0,
          transition: { duration: DURATIONS.medium, ease: EASING },
        },
        exit: {
          opacity: 0,
          y: 8,
          transition: { duration: DURATIONS.fast, ease: EASING },
        },
      };
    case 'fadeScale':
      return {
        initial: { opacity: 0, scale: 0.96 },
        animate: {
          opacity: 1,
          scale: 1,
          transition: SPRING,
        },
        exit: {
          opacity: 0,
          scale: 0.97,
          transition: { duration: DURATIONS.fast, ease: EASING },
        },
      };
    case 'sheetIn':
      return {
        initial: { opacity: 0, y: 40 },
        animate: {
          opacity: 1,
          y: 0,
          transition: SPRING,
        },
        exit: {
          opacity: 0,
          y: 32,
          transition: { duration: DURATIONS.fast, ease: EASING },
        },
      };
    case 'titleCard':
      return {
        initial: { opacity: 0, y: 8 },
        animate: {
          opacity: 1,
          y: 0,
          transition: { duration: DURATIONS.slow, ease: EASING },
        },
        exit: {
          opacity: 0,
          y: -8,
          transition: { duration: DURATIONS.medium, ease: EASING },
        },
      };
    case 'crossfade':
      return {
        initial: { opacity: 0 },
        animate: {
          opacity: 1,
          transition: { duration: DURATIONS.fast, ease: EASING },
        },
        exit: {
          opacity: 0,
          transition: { duration: DURATIONS.fast, ease: EASING },
        },
      };
  }
}

export type HapticKind = 'tap' | 'soft' | 'success';

const HAPTIC_PATTERNS: Record<HapticKind, number | number[]> = {
  tap: 8,
  soft: 4,
  success: [8, 40, 14],
};

export function haptic(kind: HapticKind): void {
  try {
    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.vibrate === 'function'
    ) {
      navigator.vibrate(HAPTIC_PATTERNS[kind]);
    }
  } catch {
    // Silent fallback when vibration API is restricted
  }
}
