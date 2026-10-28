import { useId } from 'react';
import { COLORS } from '@/config/tokens';
import { haptic } from '@/lib/motion';
import { useGlass } from '@/ui/Glass';

export type OrbPulse = 'dawn' | 'dusk' | null;

export interface OrbProps {
  hour: number;
  dawn: number;
  dusk: number;
  pulse?: OrbPulse;
  onPress?: () => void;
  ariaLabel?: string;
  className?: string;
}

export type DayPhase = 'rising' | 'noon' | 'setting' | 'night';

export function resolveDayPhase(hour: number): DayPhase {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 4.5 && h < 9.5) return 'rising';
  if (h >= 9.5 && h < 16.5) return 'noon';
  if (h >= 16.5 && h < 20.5) return 'setting';
  return 'night';
}

export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function Orb({
  hour,
  dawn,
  dusk,
  pulse = null,
  onPress,
  ariaLabel = 'World Orb',
  className = '',
}: OrbProps) {
  const uid = useId().replace(/:/g, '');
  const glassStyle = useGlass({ elevated: true });

  const normalizedHour = ((hour % 24) + 24) % 24;
  const angleDeg = (normalizedHour / 24) * 360;
  const phase = resolveDayPhase(normalizedHour);

  const clampedDawn = clamp01(dawn);
  const clampedDusk = clamp01(dusk);

  const outerRadius = 33;
  const dawnRadius = 26;
  const duskRadius = 20.5;

  const dawnCircumference = 2 * Math.PI * dawnRadius;
  const duskCircumference = 2 * Math.PI * duskRadius;

  const dawnDashOffset = dawnCircumference * (1 - clampedDawn);
  const duskDashOffset = duskCircumference * (1 - clampedDusk);

  const isDaytime = normalizedHour >= 5 && normalizedHour < 18.5;
  const markerGlowColor = isDaytime ? COLORS.orange : COLORS.purple;

  const pulseGlow =
    pulse === 'dawn'
      ? `0 0 28px 6px ${COLORS.orangeGlow}, ${glassStyle.boxShadow ?? ''}`
      : pulse === 'dusk'
        ? `0 0 28px 6px ${COLORS.purpleGlow}, ${glassStyle.boxShadow ?? ''}`
        : glassStyle.boxShadow;

  return (
    <button
      type="button"
      onClick={() => {
        haptic('soft');
        onPress?.();
      }}
      aria-label={ariaLabel}
      className={`arkvoid-focus-ring relative inline-flex h-[76px] w-[76px] min-h-[76px] min-w-[76px] shrink-0 items-center justify-center rounded-full p-0 select-none transition-transform duration-[180ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] active:scale-[0.96] ${className}`}
      style={{
        ...glassStyle,
        boxShadow: pulseGlow,
      }}
    >
      <svg
        width="76"
        height="76"
        viewBox="0 0 76 76"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="pointer-events-none block h-[76px] w-[76px]"
      >
        <defs>
          <linearGradient
            id={`orb-aurora-${uid}`}
            x1="8"
            y1="8"
            x2="68"
            y2="68"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#FF8A3D" />
            <stop offset="28%" stopColor="#FFB27A" />
            <stop offset="68%" stopColor="#C9B8FF" />
            <stop offset="100%" stopColor="#7C5CFF" />
          </linearGradient>
        </defs>

        {/* Outer time-of-day ring (2.5px, Aurora gradient) */}
        <circle
          cx="38"
          cy="38"
          r={outerRadius}
          stroke={`url(#orb-aurora-${uid})`}
          strokeWidth="2.5"
          strokeOpacity="0.88"
        />

        {/* Inner track rings */}
        <circle
          cx="38"
          cy="38"
          r={dawnRadius}
          stroke="rgba(23, 20, 31, 0.07)"
          strokeWidth="3"
        />
        <circle
          cx="38"
          cy="38"
          r={duskRadius}
          stroke="rgba(23, 20, 31, 0.07)"
          strokeWidth="3"
        />

        {/* Dawn Breath outer concentric arc (3px, orange, stroke-dashoffset only) */}
        <circle
          cx="38"
          cy="38"
          r={dawnRadius}
          stroke={COLORS.orange}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={dawnCircumference}
          strokeDashoffset={dawnDashOffset}
          transform="rotate(-90 38 38)"
          style={{
            transition:
              'stroke-dashoffset 320ms cubic-bezier(0.2, 0.8, 0.2, 1)',
          }}
        />

        {/* Dusk Breath inner concentric arc (3px, purple, stroke-dashoffset only) */}
        <circle
          cx="38"
          cy="38"
          r={duskRadius}
          stroke={COLORS.purple}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={duskCircumference}
          strokeDashoffset={duskDashOffset}
          transform="rotate(-90 38 38)"
          style={{
            transition:
              'stroke-dashoffset 320ms cubic-bezier(0.2, 0.8, 0.2, 1)',
          }}
        />
      </svg>

      {/* Zero-cost CSS transform rotating hour marker (top=00:00, right=06:00, bottom=12:00, left=18:00) */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          transform: `rotate(${angleDeg}deg)`,
          transition: 'transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        }}
      >
        <span
          className="absolute left-1/2 top-[5px] -ml-[3px] -mt-[3px] h-[6px] w-[6px] rounded-full"
          style={{
            backgroundColor: '#FFFFFF',
            boxShadow: `0 0 8px 2px ${markerGlowColor}`,
          }}
        />
      </span>

      {/* Centre 14px custom phase glyph (crossfading smoothly via opacity & transform) */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute flex h-[14px] w-[14px] items-center justify-center"
        style={{ color: COLORS.ink3 }}
      >
        {/* Rising Sun */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          className="absolute inset-0 transition-[opacity,transform] duration-[320ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]"
          style={{
            opacity: phase === 'rising' ? 1 : 0,
            transform: phase === 'rising' ? 'scale(1)' : 'scale(0.82)',
          }}
        >
          <path
            d="M2 10.5H12"
            stroke="currentColor"
            strokeWidth="1.35"
            strokeLinecap="round"
          />
          <path
            d="M3.8 10.5A3.2 3.2 0 0 1 10.2 10.5"
            stroke="currentColor"
            strokeWidth="1.35"
            strokeLinecap="round"
          />
          <path
            d="M7 3.2V4.8"
            stroke="currentColor"
            strokeWidth="1.35"
            strokeLinecap="round"
          />
        </svg>

        {/* Full Sun (Noon) */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          className="absolute inset-0 transition-[opacity,transform] duration-[320ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]"
          style={{
            opacity: phase === 'noon' ? 1 : 0,
            transform: phase === 'noon' ? 'scale(1)' : 'scale(0.82)',
          }}
        >
          <circle
            cx="7"
            cy="7"
            r="2.9"
            stroke="currentColor"
            strokeWidth="1.35"
          />
          <path
            d="M7 1.6V2.5M7 11.5V12.4M1.6 7H2.5M11.5 7H12.4M3.2 3.2L3.85 3.85M10.15 10.15L10.8 10.8M10.8 3.2L10.15 3.85M3.85 10.15L3.2 10.8"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
          />
        </svg>

        {/* Setting Sun */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          className="absolute inset-0 transition-[opacity,transform] duration-[320ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]"
          style={{
            opacity: phase === 'setting' ? 1 : 0,
            transform: phase === 'setting' ? 'scale(1)' : 'scale(0.82)',
          }}
        >
          <path
            d="M2 9.2H12"
            stroke="currentColor"
            strokeWidth="1.35"
            strokeLinecap="round"
          />
          <path
            d="M4.2 9.2A2.8 2.8 0 0 1 9.8 9.2"
            stroke="currentColor"
            strokeWidth="1.35"
            strokeLinecap="round"
          />
          <path
            d="M4.2 11.4H9.8"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
          />
        </svg>

        {/* Night Moon */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          className="absolute inset-0 transition-[opacity,transform] duration-[320ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]"
          style={{
            opacity: phase === 'night' ? 1 : 0,
            transform: phase === 'night' ? 'scale(1)' : 'scale(0.82)',
          }}
        >
          <path
            d="M9.9 8.85A4.1 4.1 0 0 1 5.15 4.1a4.15 4.15 0 0 1 .42-1.82A4.1 4.1 0 1 0 11.72 8.43c-.58.27-1.19.42-1.82.42Z"
            stroke="currentColor"
            strokeWidth="1.35"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </button>
  );
}
