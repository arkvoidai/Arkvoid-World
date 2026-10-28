import { COLORS, GRADIENTS } from '@/config/tokens';
import { clamp01 } from '@/ui/Orb';

export interface DividerProps {
  variant?: 'hairline' | 'aurora-progress';
  progress?: number;
  className?: string;
}

export function Divider({
  variant = 'hairline',
  progress = 1,
  className = '',
}: DividerProps) {
  if (variant === 'aurora-progress') {
    const p = clamp01(progress);
    return (
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(p * 100)}
        aria-label="Progress"
        className={`relative h-[2px] w-full overflow-hidden rounded-full ${className}`}
        style={{ backgroundColor: COLORS.line }}
      >
        <div
          className="h-full w-full origin-left transition-transform duration-[320ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]"
          style={{
            backgroundImage: GRADIENTS.aurora,
            transform: `scaleX(${p})`,
          }}
        />
      </div>
    );
  }

  return (
    <hr
      className={`m-0 h-px w-full border-0 ${className}`}
      style={{ backgroundColor: COLORS.line }}
    />
  );
}
