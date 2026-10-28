import { useEffect, useRef, type MutableRefObject } from 'react';
import { COLORS, Z_INDEX } from '@/config/tokens';
import { useGlass } from '@/ui/Glass';

export interface WorldLabelScreenPoint {
  /** Screen X in CSS pixels */
  x: number;
  /** Screen Y in CSS pixels */
  y: number;
  /** Distance from camera in world metres */
  distance: number;
  /** Whether the 3D point is in front of the camera */
  visible: boolean;
  /** Screen X of the Orb centre (for non-overlap guard) */
  orbX?: number;
  /** Screen Y of the Orb centre (for non-overlap guard) */
  orbY?: number;
}

export interface WorldLabelProps {
  text: string;
  kind?: 'name' | 'verb';
  positionRef: MutableRefObject<WorldLabelScreenPoint>;
  fadeNear?: number;
  fadeFar?: number;
  className?: string;
}

export function computeWorldLabelTransform(
  point: WorldLabelScreenPoint,
  fadeNear: number = 4,
  fadeFar: number = 28,
): { opacity: number; x: number; y: number } {
  if (!point.visible || point.distance >= fadeFar) {
    return { opacity: 0, x: point.x, y: point.y };
  }

  const distFactor =
    point.distance <= fadeNear
      ? 1
      : 1 - (point.distance - fadeNear) / Math.max(fadeFar - fadeNear, 0.001);

  let x = point.x;
  let y = point.y;
  let orbFade = 1;

  if (point.orbX !== undefined && point.orbY !== undefined) {
    const dx = x - point.orbX;
    const dy = y - point.orbY;
    const d = Math.hypot(dx, dy);
    const minClearance = 92;
    if (d < minClearance) {
      const nx = d > 0.001 ? dx / d : 0;
      const ny = d > 0.001 ? dy / d : -1;
      x = point.orbX + nx * minClearance;
      y = point.orbY + ny * minClearance;
      orbFade = Math.max(0.15, d / minClearance);
    }
  }

  const opacity = Math.max(0, Math.min(1, distFactor * orbFade));
  return { opacity, x, y };
}

export function WorldLabel({
  text,
  kind = 'name',
  positionRef,
  fadeNear = 4,
  fadeFar = 28,
  className = '',
}: WorldLabelProps) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const glassStyle = useGlass();

  useEffect(() => {
    let rafId = 0;

    const tick = () => {
      const el = elRef.current;
      if (el) {
        const { opacity, x, y } = computeWorldLabelTransform(
          positionRef.current,
          fadeNear,
          fadeFar,
        );
        el.style.opacity = opacity.toFixed(3);
        el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`;
      }
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [positionRef, fadeNear, fadeFar]);

  return (
    <div
      ref={elRef}
      className={`pointer-events-none absolute top-0 left-0 inline-flex items-center rounded-full px-3.5 py-1 whitespace-nowrap select-none will-change-[transform,opacity] ${className}`}
      style={{
        ...glassStyle,
        zIndex: Z_INDEX.hud,
        color: COLORS.ink,
        fontFamily:
          kind === 'name'
            ? "'Instrument Serif', 'Instrument Serif Fallback', Georgia, serif"
            : "'Geist Variable', 'Geist Fallback', sans-serif",
        fontStyle: kind === 'name' ? 'italic' : 'normal',
        fontSize: kind === 'name' ? '18px' : '13px',
        fontWeight: kind === 'name' ? 400 : 500,
        lineHeight: 1.2,
      }}
    >
      {text}
    </div>
  );
}
