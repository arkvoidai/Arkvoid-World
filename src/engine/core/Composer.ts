import * as THREE from 'three';
import type { TimeOfDayState } from '@/engine/world/sky';
import type { DeviceProfile } from '@/lib/deviceProfile';

export interface ExposureProbeStats {
  mean: number;
  p5: number;
  p95: number;
  clippedWhiteFraction: number;
  crushedBlackFraction: number;
  isInTarget: boolean;
  sampleCount: number;
  lastUpdatedMs: number;
}

export interface ComposerUniforms {
  [key: string]: THREE.IUniform<unknown>;
  tDiffuse: THREE.IUniform<THREE.Texture | null>;
  uExposure: THREE.IUniform<number>;
  uShadowSplitColor: THREE.IUniform<THREE.Color>;
  uShadowSplitAmount: THREE.IUniform<number>;
  uHighlightSplitColor: THREE.IUniform<THREE.Color>;
  uHighlightSplitAmount: THREE.IUniform<number>;
  uContrast: THREE.IUniform<number>;
  uSaturation: THREE.IUniform<number>;
  uVibrance: THREE.IUniform<number>;
  uLift: THREE.IUniform<THREE.Vector3>;
  uGamma: THREE.IUniform<THREE.Vector3>;
  uGain: THREE.IUniform<THREE.Vector3>;
  uVignetteRadius: THREE.IUniform<number>;
  uVignetteStrength: THREE.IUniform<number>;
  uGrainStrength: THREE.IUniform<number>;
  uTime: THREE.IUniform<number>;
}

const COMPOSITE_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const COMPOSITE_FRAGMENT_SHADER = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uExposure;
uniform vec3 uShadowSplitColor;
uniform float uShadowSplitAmount;
uniform vec3 uHighlightSplitColor;
uniform float uHighlightSplitAmount;
uniform float uContrast;
uniform float uSaturation;
uniform float uVibrance;
uniform vec3 uLift;
uniform vec3 uGamma;
uniform vec3 uGain;
uniform float uVignetteRadius;
uniform float uVignetteStrength;
uniform float uGrainStrength;
uniform float uTime;

varying vec2 vUv;

// Linear sRGB to Rec2020 matrices for AgX
const mat3 ARK_REC2020_TO_LINEAR_SRGB = mat3(
  vec3(1.6605, -0.1246, -0.0182),
  vec3(-0.5876, 1.1329, -0.1006),
  vec3(-0.0728, -0.0083, 1.1187)
);
const mat3 ARK_LINEAR_SRGB_TO_LINEAR_REC2020 = mat3(
  vec3(0.6274, 0.0691, 0.0164),
  vec3(0.3293, 0.9195, 0.0880),
  vec3(0.0433, 0.0113, 0.8956)
);

vec3 arkAgxDefaultContrastApprox(vec3 x) {
  vec3 x2 = x * x;
  vec3 x4 = x2 * x2;
  return + 15.5 * x4 * x2
         - 40.14 * x4 * x
         + 31.96 * x4
         - 6.868 * x2 * x
         + 0.4298 * x2
         + 0.1191 * x
         - 0.00232;
}

vec3 arkAgXToneMapping(vec3 color) {
  const mat3 AgXInsetMatrix = mat3(
    vec3(0.856627153315983, 0.137318972929847, 0.11189821299995),
    vec3(0.0951212405381588, 0.761241990602591, 0.0767994186031903),
    vec3(0.0482516061458583, 0.101439036467562, 0.811302368396859)
  );
  const mat3 AgXOutsetMatrix = mat3(
    vec3(1.1271005818144368, -0.1413297634984383, -0.14132976349843826),
    vec3(-0.11060664309660323, 1.157823702216272, -0.11060664309660294),
    vec3(-0.016493938717834573, -0.016493938717834257, 1.2519364065950405)
  );
  const float AgxMinEv = -12.47393;
  const float AgxMaxEv = 4.026069;

  color = ARK_LINEAR_SRGB_TO_LINEAR_REC2020 * color;
  color = AgXInsetMatrix * color;
  color = max(color, 1e-10);
  color = log2(color);
  color = (color - AgxMinEv) / (AgxMaxEv - AgxMinEv);
  color = clamp(color, 0.0, 1.0);
  color = arkAgxDefaultContrastApprox(color);
  color = AgXOutsetMatrix * color;
  color = pow(max(vec3(0.0), color), vec3(2.2));
  color = ARK_REC2020_TO_LINEAR_SRGB * color;
  return clamp(color, 0.0, 1.0);
}

void main() {
  vec4 sampleColor = texture2D(tDiffuse, vUv);
  vec3 col = sampleColor.rgb;

  // 1. Exposure
  col *= uExposure;

  // 2. Filmic tone mapping (AgX in linear space)
  col = arkAgXToneMapping(col);

  // 3. Colour grading in linear space:
  // Split-tone with shadows pushed toward purple #5B49C9 and highlights toward warm orange #FF9B4A
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float shadowWeight = smoothstep(0.48, 0.04, lum) * uShadowSplitAmount;
  float highlightWeight = smoothstep(0.52, 0.96, lum) * uHighlightSplitAmount;
  col = mix(col, uShadowSplitColor, shadowWeight);
  col = mix(col, uHighlightSplitColor, highlightWeight);

  // S-curve contrast (0.12)
  vec3 sCurve = col * col * (3.0 - 2.0 * col);
  col = mix(col, sCurve, uContrast);

  // Saturation (1.12) and Vibrance (0.15)
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float maxC = max(col.r, max(col.g, col.b));
  float minC = min(col.r, min(col.g, col.b));
  float sat = maxC - minC;
  col = mix(vec3(l), col, uSaturation);
  float vibFactor = 1.0 + (1.0 - sat) * uVibrance;
  col = mix(vec3(l), col, vibFactor);

  // Lift, Gamma, Gain
  col = pow(max(vec3(0.0), col * uGain + uLift), vec3(1.0 / max(vec3(0.01), uGamma)));

  // 4. Subtle warm vignette (radius 0.75, strength 0.22)
  vec2 vCoords = (vUv - 0.5) * 2.0;
  float dist = length(vCoords);
  float vFactor = smoothstep(uVignetteRadius * 0.45, uVignetteRadius, dist) * uVignetteStrength;
  vec3 warmVignetteTint = vec3(0.88, 0.76, 0.94);
  col = mix(col, col * warmVignetteTint * (1.0 - vFactor), vFactor);

  // 5. Film grain (0.012 desktop only) & dither (1/255 noise)
  float grainNoise = fract(sin(dot(gl_FragCoord.xy + fract(uTime * 17.0), vec2(12.9898, 78.233))) * 43758.5453);
  col += (grainNoise - 0.5) * uGrainStrength;

  float ditherNoise = fract(sin(dot(gl_FragCoord.xy, vec2(26.123, 47.917))) * 19283.456);
  col += (ditherNoise - 0.5) / 255.0;

  // 6. Output sRGB
  col = clamp(col, 0.0, 1.0);
  col = mix(col * 12.92, 1.055 * pow(col, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, col));

  gl_FragColor = vec4(col, 1.0);
}
`;

declare global {
  interface Window {
    __ARKVOID_EXPOSURE_PROBE__?: ExposureProbeStats;
  }
}

export class Composer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly isPhone: boolean;
  private readonly isLowTier: boolean;

  private msaaTarget: THREE.WebGLRenderTarget | null = null;
  private quadMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> | null = null;
  private quadScene: THREE.Scene | null = null;
  private quadCam: THREE.OrthographicCamera | null = null;

  // 64x36 Exposure Probe target and readback buffer
  private probeTarget: THREE.WebGLRenderTarget | null = null;
  private readonly probeBuffer = new Uint8Array(64 * 36 * 4);
  private lastProbeTimeMs = 0;
  private probeStats: ExposureProbeStats | null = null;
  private probeEnabled = false;

  readonly uniforms: ComposerUniforms;

  private width = 1;
  private height = 1;
  private dpr = 1;
  private fallbackDirect = false;

  constructor(
    renderer: THREE.WebGLRenderer,
    device: DeviceProfile,
    enableProbe = false,
  ) {
    this.renderer = renderer;
    this.isPhone = device.deviceClass === 'phone';
    this.isLowTier = this.isPhone || device.gpuTier <= 1 || device.isSoftwareGl;
    this.probeEnabled = enableProbe;

    const grainStrength = !this.isPhone && !device.isSoftwareGl ? 0.012 : 0.0;

    this.uniforms = {
      tDiffuse: { value: null },
      uExposure: { value: 1.0 },
      // Split-tone: shadows pushed toward purple #5B49C9, highlights toward warm orange #FF9B4A
      uShadowSplitColor: { value: new THREE.Color('#5B49C9') },
      uShadowSplitAmount: { value: 0.10 },
      uHighlightSplitColor: { value: new THREE.Color('#FF9B4A') },
      uHighlightSplitAmount: { value: 0.08 },
      uContrast: { value: 0.12 },
      uSaturation: { value: 1.12 },
      uVibrance: { value: 0.15 },
      uLift: { value: new THREE.Vector3(0.0, 0.0, 0.0) },
      uGamma: { value: new THREE.Vector3(1.0, 1.0, 1.0) },
      uGain: { value: new THREE.Vector3(1.0, 1.0, 1.0) },
      uVignetteRadius: { value: 0.75 },
      uVignetteStrength: { value: 0.22 },
      uGrainStrength: { value: grainStrength },
      uTime: { value: 0 },
    };

    this.initQuad();
    if (this.probeEnabled) {
      this.initProbeTarget();
    }
  }

  private initQuad(): void {
    try {
      this.quadScene = new THREE.Scene();
      this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const quadGeo = new THREE.PlaneGeometry(2, 2);

      const quadMat = new THREE.ShaderMaterial({
        vertexShader: COMPOSITE_VERTEX_SHADER,
        fragmentShader: COMPOSITE_FRAGMENT_SHADER,
        uniforms: this.uniforms,
        depthTest: false,
        depthWrite: false,
      });

      this.quadMesh = new THREE.Mesh(quadGeo, quadMat);
      this.quadMesh.frustumCulled = false;
      this.quadScene.add(this.quadMesh);
    } catch {
      this.fallbackDirect = true;
    }
  }

  private initProbeTarget(): void {
    if (this.probeTarget) return;
    this.probeTarget = new THREE.WebGLRenderTarget(64, 36, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      stencilBuffer: false,
    });
  }

  setProbeEnabled(enabled: boolean): void {
    this.probeEnabled = enabled;
    if (enabled) {
      this.initProbeTarget();
    }
  }

  getProbeStats(): ExposureProbeStats | null {
    return this.probeStats;
  }

  setSize(width: number, height: number, dpr: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.dpr = Math.max(0.5, dpr);

    const rtW = Math.max(1, Math.floor(this.width * this.dpr));
    const rtH = Math.max(1, Math.floor(this.height * this.dpr));

    if (this.msaaTarget) {
      this.msaaTarget.dispose();
      this.msaaTarget = null;
    }

    try {
      const samples = this.isPhone ? 2 : 4;
      this.msaaTarget = new THREE.WebGLRenderTarget(rtW, rtH, {
        samples,
        type: THREE.HalfFloatType,
        format: THREE.RGBAFormat,
        stencilBuffer: false,
      });
      this.uniforms.tDiffuse.value = this.msaaTarget.texture;
    } catch {
      this.fallbackDirect = true;
    }
  }

  update(skyState: TimeOfDayState, elapsed: number): void {
    this.uniforms.uTime.value = elapsed;
    this.uniforms.uExposure.value = skyState.exposure;

    // Subtle grading adaptation per phase
    const h = skyState.hour;
    if (h >= 15.5 && h <= 18.0) {
      // Golden hour: richer orange highlights & purple shadows
      this.uniforms.uShadowSplitAmount.value = 0.12;
      this.uniforms.uHighlightSplitAmount.value = 0.10;
      this.uniforms.uContrast.value = 0.14;
    } else if (h >= 18.0 && h <= 21.0) {
      // Dusk
      this.uniforms.uShadowSplitAmount.value = 0.14;
      this.uniforms.uHighlightSplitAmount.value = 0.08;
      this.uniforms.uContrast.value = 0.12;
    } else {
      this.uniforms.uShadowSplitAmount.value = 0.10;
      this.uniforms.uHighlightSplitAmount.value = 0.08;
      this.uniforms.uContrast.value = 0.12;
    }
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    if (this.fallbackDirect || !this.msaaTarget || !this.quadScene || !this.quadCam) {
      this.renderer.render(scene, camera);
      if (this.probeEnabled && this.probeTarget) {
        const now = performance.now();
        if (now - this.lastProbeTimeMs >= 1000) {
          this.lastProbeTimeMs = now;
          this.sampleDirectExposureProbe(scene, camera);
        }
      }
      return;
    }

    // 1. Render 3D scene into multisampled HalfFloat target
    this.renderer.setRenderTarget(this.msaaTarget);
    this.renderer.render(scene, camera);

    // 2. Composite pass to screen
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.quadScene, this.quadCam);

    // 3. 1 Hz Exposure Probe readback (?probe=1)
    if (this.probeEnabled && this.probeTarget) {
      const now = performance.now();
      if (now - this.lastProbeTimeMs >= 1000) {
        this.lastProbeTimeMs = now;
        this.sampleExposureProbe();
      }
    }
  }

  private sampleDirectExposureProbe(scene: THREE.Scene, camera: THREE.Camera): void {
    if (!this.probeTarget) return;
    this.renderer.setRenderTarget(this.probeTarget);
    this.renderer.render(scene, camera);
    this.renderer.readRenderTargetPixels(
      this.probeTarget,
      0,
      0,
      64,
      36,
      this.probeBuffer,
    );
    this.renderer.setRenderTarget(null);
    this.processLuminanceBuffer();
  }

  /**
   * 1 Hz Exposure Probe sampler:
   * Blits composite output to 64x36 target, reads pixels,
   * calculates luminance distribution (mean, p5, p95, clipped white, crushed black).
   */
  private sampleExposureProbe(): void {
    if (!this.probeTarget || !this.quadScene || !this.quadCam) return;

    this.renderer.setRenderTarget(this.probeTarget);
    this.renderer.render(this.quadScene, this.quadCam);
    this.renderer.readRenderTargetPixels(
      this.probeTarget,
      0,
      0,
      64,
      36,
      this.probeBuffer,
    );
    this.renderer.setRenderTarget(null);
    this.processLuminanceBuffer();
  }

  private processLuminanceBuffer(): void {

    const totalPixels = 64 * 36;
    const lums = new Float32Array(totalPixels);
    let sumLum = 0;
    let clippedCount = 0;
    let crushedCount = 0;

    for (let i = 0; i < totalPixels; i++) {
      const r = this.probeBuffer[i * 4]! / 255;
      const g = this.probeBuffer[i * 4 + 1]! / 255;
      const b = this.probeBuffer[i * 4 + 2]! / 255;
      // Rec.709 relative luminance
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      lums[i] = lum;
      sumLum += lum;

      if (lum >= 0.985 || (r >= 0.99 && g >= 0.99 && b >= 0.99)) {
        clippedCount++;
      }
      if (lum <= 0.015) {
        crushedCount++;
      }
    }

    // Sort to compute percentiles
    lums.sort();

    const mean = sumLum / totalPixels;
    const p5 = lums[Math.floor(totalPixels * 0.05)]!;
    const p95 = lums[Math.floor(totalPixels * 0.95)]!;
    const clippedWhiteFraction = clippedCount / totalPixels;
    const crushedBlackFraction = crushedCount / totalPixels;

    // Target checks:
    // mean: 0.30 .. 0.45, p5: >= 0.015 (shadows not crushed), p95: <= 0.95 (highlights not blown),
    // clipped white < 2%, crushed black < 4%
    const isInTarget =
      mean >= 0.25 &&
      mean <= 0.48 &&
      p5 >= 0.015 &&
      p95 <= 0.95 &&
      clippedWhiteFraction < 0.02 &&
      crushedBlackFraction < 0.04;

    this.probeStats = {
      mean,
      p5,
      p95,
      clippedWhiteFraction,
      crushedBlackFraction,
      isInTarget,
      sampleCount: totalPixels,
      lastUpdatedMs: performance.now(),
    };

    if (typeof window !== 'undefined') {
      window.__ARKVOID_EXPOSURE_PROBE__ = this.probeStats;
    }
  }

  dispose(): void {
    if (this.msaaTarget) {
      this.msaaTarget.dispose();
      this.msaaTarget = null;
    }
    if (this.probeTarget) {
      this.probeTarget.dispose();
      this.probeTarget = null;
    }
    if (this.quadMesh) {
      this.quadMesh.geometry.dispose();
      this.quadMesh.material.dispose();
      this.quadMesh = null;
    }
    this.quadScene = null;
    this.quadCam = null;
  }
}
