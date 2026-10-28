import { useEffect, useState } from 'react';

export type DeviceTier = 'desktop-high' | 'mobile-or-mid';

let cachedTier: DeviceTier | null = null;
let pendingPromise: Promise<DeviceTier> | null = null;

function inferInitialTier(): DeviceTier {
  if (typeof window === 'undefined') {
    return 'mobile-or-mid';
  }
  const isCoarse =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches;
  const isSmallScreen = window.innerWidth < 1024;
  if (isCoarse || isSmallScreen) {
    return 'mobile-or-mid';
  }
  return 'desktop-high';
}

export function resolveDeviceTier(): Promise<DeviceTier> {
  if (cachedTier) {
    return Promise.resolve(cachedTier);
  }
  if (pendingPromise) {
    return pendingPromise;
  }

  const initial = inferInitialTier();
  if (initial === 'mobile-or-mid') {
    cachedTier = 'mobile-or-mid';
    return Promise.resolve(cachedTier);
  }

  pendingPromise = import('detect-gpu')
    .then(async (mod) => {
      const fn =
        mod.getGPUTier ??
        (mod as unknown as { default?: { getGPUTier?: typeof mod.getGPUTier } })
          .default?.getGPUTier;
      if (!fn) {
        cachedTier = initial;
        return cachedTier;
      }
      const result = await fn();
      if (result.isMobile || result.tier < 2) {
        cachedTier = 'mobile-or-mid';
      } else {
        cachedTier = 'desktop-high';
      }
      return cachedTier;
    })
    .catch(() => {
      cachedTier = initial;
      return cachedTier;
    });

  return pendingPromise;
}

export function useDeviceTier(overrideTier?: DeviceTier): DeviceTier {
  const [tier, setTier] = useState<DeviceTier>(
    () => overrideTier ?? cachedTier ?? inferInitialTier(),
  );

  useEffect(() => {
    if (overrideTier) {
      return;
    }
    let active = true;
    resolveDeviceTier().then((resolved) => {
      if (active) {
        setTier(resolved);
      }
    });

    const onResize = () => {
      if (window.innerWidth < 1024) {
        setTier('mobile-or-mid');
      } else if (cachedTier) {
        setTier(cachedTier);
      }
    };
    window.addEventListener('resize', onResize, { passive: true });
    return () => {
      active = false;
      window.removeEventListener('resize', onResize);
    };
  }, [overrideTier]);

  return overrideTier ?? tier;
}
