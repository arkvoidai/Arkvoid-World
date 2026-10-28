import type { CSSProperties } from 'react';

export type LogoVariant = 'mark' | 'wordmark' | 'lockup';

export interface LogoProps {
  variant?: LogoVariant;
  size?: number;
  className?: string;
  style?: CSSProperties;
}

export function Logo({
  variant = 'mark',
  size = 36,
  className = '',
  style,
}: LogoProps) {
  const markSvg = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={variant !== 'mark'}
      role={variant === 'mark' ? 'img' : undefined}
      aria-label={variant === 'mark' ? 'Arkvoid' : undefined}
      className="shrink-0"
    >
      <path
        d="M17 11 A10 10 0 0 1 31 11"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 39 L24 17 L39 39"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  if (variant === 'mark') {
    return (
      <span
        className={`inline-flex items-center justify-center text-ink select-none ${className}`}
        style={style}
      >
        {markSvg}
      </span>
    );
  }

  const wordmarkText = (
    <span
      className="text-ink select-none"
      style={{
        fontFamily: "'Geist Variable', 'Geist Fallback', sans-serif",
        fontWeight: 300,
        letterSpacing: '0.32em',
        fontSize: `${Math.max(14, Math.round(size * 0.56))}px`,
        lineHeight: 1.1,
        paddingLeft: '0.32em',
      }}
    >
      Arkvoid
    </span>
  );

  if (variant === 'wordmark') {
    return (
      <span
        className={`inline-flex items-center select-none ${className}`}
        style={style}
      >
        {wordmarkText}
      </span>
    );
  }

  return (
    <div
      className={`inline-flex flex-col items-center gap-2 text-ink select-none ${className}`}
      style={style}
    >
      {markSvg}
      <div className="flex flex-col items-center gap-1">
        {wordmarkText}
        <span
          className="uppercase text-ink-2"
          style={{
            fontFamily: "'Geist Mono Variable', monospace",
            fontSize: '11px',
            letterSpacing: '0.14em',
            lineHeight: 1.2,
            paddingLeft: '0.14em',
          }}
        >
          MATRIX COMPUTING
        </span>
      </div>
    </div>
  );
}
