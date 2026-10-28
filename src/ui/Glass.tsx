import type { CSSProperties, ElementType, ComponentPropsWithoutRef } from 'react';
import { SHADOWS } from '@/config/tokens';
import { useDeviceTier, type DeviceTier } from '@/lib/deviceTier';

export interface GlassOptions {
  tier?: DeviceTier;
  elevated?: boolean;
}

export function getGlassStyle(
  tier: DeviceTier,
  elevated: boolean = false,
): CSSProperties {
  const shadow = elevated ? SHADOWS.violetLayered : SHADOWS.violetSoft;
  const boxShadow = `inset 0 1px 0 rgba(255, 255, 255, 0.9), ${shadow}`;

  if (tier === 'desktop-high') {
    return {
      backgroundColor: 'rgba(255, 255, 255, 0.62)',
      backdropFilter: 'blur(24px) saturate(1.4)',
      WebkitBackdropFilter: 'blur(24px) saturate(1.4)',
      border: '1px solid rgba(23, 20, 31, 0.08)',
      boxShadow,
    };
  }

  return {
    backgroundColor: 'rgba(255, 255, 255, 0.90)',
    backdropFilter: 'none',
    WebkitBackdropFilter: 'none',
    border: '1px solid rgba(23, 20, 31, 0.08)',
    boxShadow,
  };
}

export function useGlass(options: GlassOptions = {}): CSSProperties {
  const tier = useDeviceTier(options.tier);
  return getGlassStyle(tier, options.elevated);
}

type GlassProps<T extends ElementType = 'div'> = {
  as?: T;
  tier?: DeviceTier;
  elevated?: boolean;
  style?: CSSProperties;
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'style'>;

export function Glass<T extends ElementType = 'div'>({
  as,
  tier,
  elevated = false,
  style,
  children,
  ...rest
}: GlassProps<T>) {
  const Component = (as ?? 'div') as ElementType;
  const glassStyle = useGlass({ tier, elevated });

  return (
    <Component style={{ ...glassStyle, ...style }} {...rest}>
      {children}
    </Component>
  );
}
