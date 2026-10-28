import type { CSSProperties } from 'react';
import { RADII } from '@/config/tokens';

export interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  rounded?: 'field' | 'card' | 'full';
  className?: string;
  style?: CSSProperties;
}

export function Skeleton({
  width = '100%',
  height = '20px',
  rounded = 'field',
  className = '',
  style,
}: SkeletonProps) {
  const borderRadius =
    rounded === 'full'
      ? RADII.full
      : rounded === 'card'
        ? RADII.card
        : RADII.field;

  return (
    <div
      aria-hidden="true"
      className={`animate-pulse motion-reduce:animate-none ${className}`}
      style={{
        width,
        height,
        borderRadius,
        backgroundColor: 'rgba(236, 232, 244, 0.72)',
        border: '1px solid rgba(23, 20, 31, 0.05)',
        ...style,
      }}
    />
  );
}
