import { prefersReducedMotion } from '@/lib/motion';

export type DeviceClass = 'desktop' | 'phone';

export interface DeviceProfile {
  deviceClass: DeviceClass;
  gpuTier: 0 | 1 | 2 | 3;
  deviceMemory: number;
  reducedMotion: boolean;
  isSoftwareGl: boolean;
  dprCap: number;
  cloudPuffCount: number;
  starDensity: number;
  skyExtraHalo: boolean;
}

function detectSoftwareGl(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl');
    if (!gl || !('getParameter' in gl)) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const rendererStr = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(
      rendererStr,
    );
  } catch {
    return false;
  }
}

function detectInitialClass(): DeviceClass {
  if (typeof window === 'undefined') return 'phone';
  const coarse =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches;
  if (coarse || window.innerWidth < 900) {
    return 'phone';
  }
  return 'desktop';
}

export function buildDeviceProfileFromInputs(inputs: {
  deviceClass: DeviceClass;
  gpuTier: 0 | 1 | 2 | 3;
  deviceMemory: number;
  reducedMotion: boolean;
  isSoftwareGl: boolean;
}): DeviceProfile {
  const isPhone =
    inputs.deviceClass === 'phone' ||
    inputs.gpuTier <= 1 ||
    inputs.deviceMemory <= 3;

  const dprCap = inputs.isSoftwareGl
    ? 1
    : isPhone
      ? 1.5
      : 2;

  const cloudPuffCount = isPhone ? 28 : 60;
  const starDensity = isPhone ? 0.65 : 1.0;
  const skyExtraHalo = !isPhone && inputs.gpuTier >= 2;

  return {
    deviceClass: isPhone ? 'phone' : 'desktop',
    gpuTier: inputs.gpuTier,
    deviceMemory: inputs.deviceMemory,
    reducedMotion: inputs.reducedMotion,
    isSoftwareGl: inputs.isSoftwareGl,
    dprCap,
    cloudPuffCount,
    starDensity,
    skyExtraHalo,
  };
}

let cachedProfile: DeviceProfile | null = null;

export async function resolveDeviceProfile(): Promise<DeviceProfile> {
  if (cachedProfile) return cachedProfile;

  const deviceClass = detectInitialClass();
  const isSoftwareGl = detectSoftwareGl();
  const reducedMotion = prefersReducedMotion();
  const deviceMemory =
    typeof navigator !== 'undefined' && 'deviceMemory' in navigator
      ? Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4)
      : 4;

  const conservativeFallback = buildDeviceProfileFromInputs({
    deviceClass,
    gpuTier: deviceClass === 'phone' ? 1 : 2,
    deviceMemory,
    reducedMotion,
    isSoftwareGl,
  });

  if (isSoftwareGl) {
    cachedProfile = conservativeFallback;
    return cachedProfile;
  }

  try {
    const gpuPromise = import('detect-gpu').then(async (mod) => {
      const fn =
        mod.getGPUTier ??
        (mod as unknown as { default?: { getGPUTier?: typeof mod.getGPUTier } })
          .default?.getGPUTier;
      if (!fn) return null;
      return fn();
    });

    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), 1500);
    });

    const tierResult = await Promise.race([gpuPromise, timeoutPromise]);
    if (!tierResult) {
      cachedProfile = conservativeFallback;
      return cachedProfile;
    }

    const tier = Math.max(0, Math.min(3, tierResult.tier)) as 0 | 1 | 2 | 3;
    cachedProfile = buildDeviceProfileFromInputs({
      deviceClass: tierResult.isMobile ? 'phone' : deviceClass,
      gpuTier: tier,
      deviceMemory,
      reducedMotion,
      isSoftwareGl,
    });
    return cachedProfile;
  } catch {
    cachedProfile = conservativeFallback;
    return cachedProfile;
  }
}

export function getImmediateDeviceProfile(): DeviceProfile {
  if (cachedProfile) return cachedProfile;
  const deviceClass = detectInitialClass();
  const isSoftwareGl = detectSoftwareGl();
  const reducedMotion = prefersReducedMotion();
  const deviceMemory =
    typeof navigator !== 'undefined' && 'deviceMemory' in navigator
      ? Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4)
      : 4;

  return buildDeviceProfileFromInputs({
    deviceClass,
    gpuTier: deviceClass === 'phone' ? 1 : 2,
    deviceMemory,
    reducedMotion,
    isSoftwareGl,
  });
}
