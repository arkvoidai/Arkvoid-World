import * as THREE from 'three';
import type { TimeOfDayState } from '@/engine/world/sky';
import type { DeviceProfile } from '@/lib/deviceProfile';
import type { QualityPreset } from '@/engine/core/Quality';

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

export type ComposerPassName =
  | 'gtao'
  | 'bloom'
  | 'sunShafts'
  | 'grain'
  | 'lensGlare';

export interface ComposerUniforms {
  [key: string]: THREE.IUniform<unknown>;
  tDiffuse: THREE.IUniform<THREE.Texture | null>;
  tBloom: THREE.IUniform<THREE.Texture | null>;
  tSunShafts: THREE.IUniform<THREE.Texture | null>;
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
  // Step 10 finishing passes
  uBloomEnabled: THREE.IUniform<number>;
  uBloomStrength: THREE.IUniform<number>;
  uSunShaftsEnabled: THREE.IUniform<number>;
  uSunShaftStrength: THREE.IUniform<number>;
  uSunScreenPos: THREE.IUniform<THREE.Vector2>;
  uSunFacing: THREE.IUniform<number>;
  uLensFacingSun: THREE.IUniform<number>;
}

const PASSTHROUGH_VS = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// Extract pixels above threshold 1.0 for HDR bloom (sun glare, lanterns, braziers, spirit flames)
const BLOOM_EXTRACT_FS = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uThreshold;
varying vec2 vUv;

void main() {
  vec4 color = texture2D(tDiffuse, vUv);
  float maxVal = max(color.r, max(color.g, color.b));
  // Soft knee thresholding
  float excess = max(0.0, maxVal - uThreshold);
  float factor = excess / max(maxVal, 0.0001);
  vec3 bright = color.rgb * factor;
  gl_FragColor = vec4(bright, 1.0);
}
`;

// Separable Gaussian Blur (9-tap)
const GAUSSIAN_BLUR_FS = /* glsl */ `
uniform sampler2D tSource;
uniform vec2 uResolution;
uniform vec2 uDirection; // (1, 0) for horizontal, (0, 1) for vertical
varying vec2 vUv;

void main() {
  vec2 texel = uDirection / uResolution;
  vec3 result = vec3(0.0);
  
  // 9-tap gaussian weights: center + 4 symmetrical taps
  result += texture2D(tSource, vUv).rgb * 0.2270270270;
  result += texture2D(tSource, vUv + texel * 1.3846153846).rgb * 0.3162162162;
  result += texture2D(tSource, vUv - texel * 1.3846153846).rgb * 0.3162162162;
  result += texture2D(tSource, vUv + texel * 3.2307692308).rgb * 0.0702702703;
  result += texture2D(tSource, vUv - texel * 3.2307692308).rgb * 0.0702702703;

  gl_FragColor = vec4(result, 1.0);
}
`;

// Radial blur for Screen-space Sun Shafts (24 samples)
const SUN_SHAFTS_FS = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uSunPos;
uniform float uStrength;
uniform float uThreshold;
varying vec2 vUv;

void main() {
  vec2 delta = (vUv - uSunPos);
  float dist = length(delta);
  vec2 stepDir = delta / 24.0 * 0.85; // march inward toward sun
  
  vec2 curUv = vUv;
  vec3 accum = vec3(0.0);
  float weight = 1.0;
  float decay = 0.94;

  for (int i = 0; i < 24; i++) {
    curUv -= stepDir;
    // Keep within bounds
    if (curUv.x >= 0.0 && curUv.x <= 1.0 && curUv.y >= 0.0 && curUv.y <= 1.0) {
      vec3 samp = texture2D(tDiffuse, curUv).rgb;
      // Extract highlights that cast shafts (sun, sky rim)
      float lum = dot(samp, vec3(0.299, 0.587, 0.114));
      if (lum > uThreshold) {
        accum += samp * weight;
      }
    }
    weight *= decay;
  }

  // Fade with distance from screen edges
  float edgeFade = smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.85, vUv.x) *
                   smoothstep(0.0, 0.15, vUv.y) * smoothstep(1.0, 0.85, vUv.y);

  gl_FragColor = vec4(accum * (uStrength / 24.0) * edgeFade, 1.0);
}
`;

const COMPOSITE_FRAGMENT_SHADER = /* glsl */ `
uniform sampler2D tDiffuse;
uniform sampler2D tBloom;
uniform sampler2D tSunShafts;

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

// Step 10 feature uniforms
uniform float uBloomEnabled;
uniform float uBloomStrength;
uniform float uSunShaftsEnabled;
uniform float uSunShaftStrength;
uniform vec2 uSunScreenPos;
uniform float uSunFacing;
uniform float uLensFacingSun;

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

  // 1. Additive Bloom in Linear HDR
  if (uBloomEnabled > 0.5) {
    vec3 bloomCol = texture2D(tBloom, vUv).rgb;
    col += bloomCol * uBloomStrength;
  }

  // 2. Additive Screen-space Sun Shafts
  if (uSunShaftsEnabled > 0.5) {
    vec3 shaftCol = texture2D(tSunShafts, vUv).rgb;
    col += shaftCol * uSunShaftStrength;
  }

  // 3. Gentle bloom bleed around the sun & soft procedural lens glare when facing sun
  if (uLensFacingSun > 0.01) {
    vec2 sunToCenter = vec2(0.5) - uSunScreenPos;
    // 3 subtle additive flare sprites along ray to center
    vec2 p1 = uSunScreenPos + sunToCenter * 0.35;
    vec2 p2 = uSunScreenPos + sunToCenter * 0.70;
    vec2 p3 = uSunScreenPos + sunToCenter * 1.15;

    float d1 = length(vUv - p1);
    float d2 = length(vUv - p2);
    float d3 = length(vUv - p3);

    float flare1 = exp(-d1 * d1 * 80.0) * 0.035;
    float flare2 = exp(-d2 * d2 * 120.0) * 0.025;
    float flare3 = exp(-d3 * d3 * 40.0) * 0.018;

    vec3 flareTint1 = vec3(1.0, 0.88, 0.65);
    vec3 flareTint2 = vec3(0.85, 0.75, 1.0);
    vec3 flareTint3 = vec3(1.0, 0.80, 0.60);

    col += (flare1 * flareTint1 + flare2 * flareTint2 + flare3 * flareTint3) * uLensFacingSun;
  }

  // 4. Subtle breathing exposure (plus or minus 2% over 20s)
  float breathing = 1.0 + 0.02 * sin(uTime * 0.314159);
  col *= uExposure * breathing;

  // 5. Filmic tone mapping (AgX in linear space)
  col = arkAgXToneMapping(col);

  // 6. Colour grading in linear space:
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

  // 7. Subtle warm lens vignette (radius 0.75, strength 0.22)
  vec2 vCoords = (vUv - 0.5) * 2.0;
  float dist = length(vCoords);
  float vFactor = smoothstep(uVignetteRadius * 0.45, uVignetteRadius, dist) * uVignetteStrength;
  vec3 warmVignetteTint = vec3(0.95, 0.91, 0.96);
  col = mix(col, col * warmVignetteTint * (1.0 - vFactor), vFactor);

  // 8. Film grain (0.012 desktop only) & dither (1/255 noise)
  if (uGrainStrength > 0.0001) {
    float grainNoise = fract(sin(dot(gl_FragCoord.xy + fract(uTime * 17.0), vec2(12.9898, 78.233))) * 43758.5453);
    col += (grainNoise - 0.5) * uGrainStrength;
  }

  float ditherNoise = fract(sin(dot(gl_FragCoord.xy, vec2(26.123, 47.917))) * 19283.456);
  col += (ditherNoise - 0.5) / 255.0;

  // 9. Output sRGB
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

  // Feature enablement switches
  private gtaoEnabled = false;
  private bloomEnabled = true;
  private bloomRes: 'half' | 'quarter' = 'quarter';
  private bloomStrength = 0.20;
  private bloomThreshold = 1.0;
  private sunShaftsEnabled = true;
  private sunShaftSamples = 24;
  private grainEnabled = true;
  private lensGlareEnabled = true;

  // Render Targets (allocated on demand, resized with canvas)
  private msaaTarget: THREE.WebGLRenderTarget | null = null;
  private bloomExtractTarget: THREE.WebGLRenderTarget | null = null;
  private bloomBlurTarget: THREE.WebGLRenderTarget | null = null;
  private sunShaftsTarget: THREE.WebGLRenderTarget | null = null;

  // Quad pipeline
  private quadGeo: THREE.PlaneGeometry | null = null;
  private quadCam: THREE.OrthographicCamera | null = null;
  private mainScene: THREE.Scene | null = null;
  private mainMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> | null = null;

  // Helper pass materials
  private bloomExtractMat: THREE.ShaderMaterial | null = null;
  private blurHorizontalMat: THREE.ShaderMaterial | null = null;
  private blurVerticalMat: THREE.ShaderMaterial | null = null;
  private sunShaftsMat: THREE.ShaderMaterial | null = null;
  private helperScene: THREE.Scene | null = null;
  private helperMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> | null = null;

  // Exposure probe
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

  // Cached vector for sun projection
  private readonly sunWorldPos = new THREE.Vector3();
  private readonly projectedSun = new THREE.Vector3();
  private readonly cameraDir = new THREE.Vector3();

  constructor(
    renderer: THREE.WebGLRenderer,
    device: DeviceProfile,
    enableProbe = false,
  ) {
    this.renderer = renderer;
    this.isPhone = device.deviceClass === 'phone';
    this.isLowTier = this.isPhone || device.gpuTier <= 1 || device.isSoftwareGl;
    this.probeEnabled = enableProbe;

    if (this.isPhone || this.isLowTier) {
      this.bloomEnabled = false;
      this.sunShaftsEnabled = false;
      this.grainEnabled = false;
      this.lensGlareEnabled = false;
    } else if (device.gpuTier >= 3) {
      this.bloomRes = 'half';
      this.bloomStrength = 0.35;
      this.gtaoEnabled = true;
    }

    const grainStrength = !this.isPhone && !device.isSoftwareGl ? 0.012 : 0.0;

    this.uniforms = {
      tDiffuse: { value: null },
      tBloom: { value: null },
      tSunShafts: { value: null },
      uExposure: { value: 1.0 },
      uShadowSplitColor: { value: new THREE.Color('#5B49C9') },
      uShadowSplitAmount: { value: 0.03 },
      uHighlightSplitColor: { value: new THREE.Color('#FF9B4A') },
      uHighlightSplitAmount: { value: 0.08 },
      uContrast: { value: 0.14 },
      uSaturation: { value: 1.18 },
      uVibrance: { value: 0.22 },
      uLift: { value: new THREE.Vector3(0.0, 0.0, 0.0) },
      uGamma: { value: new THREE.Vector3(1.0, 1.0, 1.0) },
      uGain: { value: new THREE.Vector3(1.0, 1.0, 1.0) },
      uVignetteRadius: { value: 0.75 },
      uVignetteStrength: { value: 0.22 },
      uGrainStrength: { value: grainStrength },
      uTime: { value: 0 },
      uBloomEnabled: { value: this.bloomEnabled ? 1 : 0 },
      uBloomStrength: { value: this.bloomStrength },
      uSunShaftsEnabled: { value: this.sunShaftsEnabled ? 1 : 0 },
      uSunShaftStrength: { value: 0.0 },
      uSunScreenPos: { value: new THREE.Vector2(0.5, 0.5) },
      uSunFacing: { value: 0.0 },
      uLensFacingSun: { value: 0.0 },
    };

    this.initPipelines();
    if (this.probeEnabled) {
      this.initProbeTarget();
    }
  }

  private initPipelines(): void {
    try {
      this.quadGeo = new THREE.PlaneGeometry(2, 2);
      this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

      // Main composite screen quad
      this.mainScene = new THREE.Scene();
      const mainMat = new THREE.ShaderMaterial({
        vertexShader: PASSTHROUGH_VS,
        fragmentShader: COMPOSITE_FRAGMENT_SHADER,
        uniforms: this.uniforms,
        depthTest: false,
        depthWrite: false,
      });
      this.mainMesh = new THREE.Mesh(this.quadGeo, mainMat);
      this.mainMesh.frustumCulled = false;
      this.mainScene.add(this.mainMesh);

      // Helper quad for intermediate passes (bloom, sun shafts)
      this.helperScene = new THREE.Scene();
      this.bloomExtractMat = new THREE.ShaderMaterial({
        vertexShader: PASSTHROUGH_VS,
        fragmentShader: BLOOM_EXTRACT_FS,
        uniforms: {
          tDiffuse: { value: null },
          uThreshold: { value: this.bloomThreshold },
        },
        depthTest: false,
        depthWrite: false,
      });
      this.blurHorizontalMat = new THREE.ShaderMaterial({
        vertexShader: PASSTHROUGH_VS,
        fragmentShader: GAUSSIAN_BLUR_FS,
        uniforms: {
          tSource: { value: null },
          uResolution: { value: new THREE.Vector2(1, 1) },
          uDirection: { value: new THREE.Vector2(1, 0) },
        },
        depthTest: false,
        depthWrite: false,
      });
      this.blurVerticalMat = new THREE.ShaderMaterial({
        vertexShader: PASSTHROUGH_VS,
        fragmentShader: GAUSSIAN_BLUR_FS,
        uniforms: {
          tSource: { value: null },
          uResolution: { value: new THREE.Vector2(1, 1) },
          uDirection: { value: new THREE.Vector2(0, 1) },
        },
        depthTest: false,
        depthWrite: false,
      });
      this.sunShaftsMat = new THREE.ShaderMaterial({
        vertexShader: PASSTHROUGH_VS,
        fragmentShader: SUN_SHAFTS_FS,
        uniforms: {
          tDiffuse: { value: null },
          uSunPos: { value: new THREE.Vector2(0.5, 0.5) },
          uStrength: { value: 0.0 },
          uThreshold: { value: 0.95 },
        },
        depthTest: false,
        depthWrite: false,
      });

      this.helperMesh = new THREE.Mesh(this.quadGeo, this.bloomExtractMat);
      this.helperMesh.frustumCulled = false;
      this.helperScene.add(this.helperMesh);
    } catch {
      this.fallbackDirect = true;
    }
  }

  applyQuality(preset: QualityPreset): void {
    this.setEnabled('bloom', preset.bloom);
    this.bloomRes = preset.bloomResolution;
    this.bloomStrength = preset.bloomStrength;
    this.bloomThreshold = preset.bloomThreshold;
    this.uniforms.uBloomStrength.value = preset.bloomStrength;

    this.setEnabled('sunShafts', preset.sunShafts === 'screen-space');
    this.sunShaftSamples = preset.sunShaftSamples;

    this.setEnabled('gtao', preset.gtao);
    this.setEnabled('grain', preset.filmGrain > 0);
    this.uniforms.uGrainStrength.value = preset.filmGrain;

    this.setEnabled('lensGlare', !this.isPhone && preset.id !== 'lite');

    // Re-allocate targets to fit new quality tier resolutions
    this.resizeTargets();
  }

  setEnabled(pass: ComposerPassName, enabled: boolean): void {
    switch (pass) {
      case 'gtao':
        this.gtaoEnabled = enabled;
        break;
      case 'bloom':
        this.bloomEnabled = enabled;
        this.uniforms.uBloomEnabled.value = enabled ? 1 : 0;
        if (!enabled && this.bloomExtractTarget) {
          this.bloomExtractTarget.dispose();
          this.bloomExtractTarget = null;
          this.bloomBlurTarget?.dispose();
          this.bloomBlurTarget = null;
        }
        break;
      case 'sunShafts':
        this.sunShaftsEnabled = enabled;
        this.uniforms.uSunShaftsEnabled.value = enabled ? 1 : 0;
        if (!enabled && this.sunShaftsTarget) {
          this.sunShaftsTarget.dispose();
          this.sunShaftsTarget = null;
        }
        break;
      case 'grain':
        this.grainEnabled = enabled;
        this.uniforms.uGrainStrength.value = enabled ? 0.012 : 0.0;
        break;
      case 'lensGlare':
        this.lensGlareEnabled = enabled;
        break;
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
    this.resizeTargets();
  }

  private resizeTargets(): void {
    const rtW = Math.max(1, Math.floor(this.width * this.dpr));
    const rtH = Math.max(1, Math.floor(this.height * this.dpr));

    // 1. MSAA Main Target
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
      return;
    }

    // 2. Bloom Targets (allocated only when bloom is enabled)
    if (this.bloomExtractTarget) {
      this.bloomExtractTarget.dispose();
      this.bloomExtractTarget = null;
    }
    if (this.bloomBlurTarget) {
      this.bloomBlurTarget.dispose();
      this.bloomBlurTarget = null;
    }

    if (this.bloomEnabled) {
      const divisor = this.bloomRes === 'half' ? 2 : 4;
      const bW = Math.max(1, Math.floor(rtW / divisor));
      const bH = Math.max(1, Math.floor(rtH / divisor));

      this.bloomExtractTarget = new THREE.WebGLRenderTarget(bW, bH, {
        type: THREE.HalfFloatType,
        format: THREE.RGBAFormat,
        stencilBuffer: false,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
      });
      this.bloomBlurTarget = new THREE.WebGLRenderTarget(bW, bH, {
        type: THREE.HalfFloatType,
        format: THREE.RGBAFormat,
        stencilBuffer: false,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
      });
      this.uniforms.tBloom.value = this.bloomBlurTarget.texture;

      if (this.blurHorizontalMat && this.blurVerticalMat) {
        (this.blurHorizontalMat.uniforms['uResolution']!.value as THREE.Vector2).set(bW, bH);
        (this.blurVerticalMat.uniforms['uResolution']!.value as THREE.Vector2).set(bW, bH);
      }
    }

    // 3. Sun Shafts Target (quarter resolution)
    if (this.sunShaftsTarget) {
      this.sunShaftsTarget.dispose();
      this.sunShaftsTarget = null;
    }

    if (this.sunShaftsEnabled) {
      const sW = Math.max(1, Math.floor(rtW / 4));
      const sH = Math.max(1, Math.floor(rtH / 4));
      this.sunShaftsTarget = new THREE.WebGLRenderTarget(sW, sH, {
        type: THREE.HalfFloatType,
        format: THREE.RGBAFormat,
        stencilBuffer: false,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
      });
      this.uniforms.tSunShafts.value = this.sunShaftsTarget.texture;
    }
  }

  update(skyState: TimeOfDayState, elapsed: number, camera?: THREE.Camera): void {
    this.uniforms.uTime.value = elapsed;
    this.uniforms.uExposure.value = skyState.exposure;

    // Subtle grading adaptation per phase (Step 11 D11 fix: shadow split <= 0.05 so greens/reds/stones stay true)
    const h = skyState.hour;
    if (h >= 15.5 && h <= 18.0) {
      // Golden hour: warm orange highlights & minimal shadow tint
      this.uniforms.uShadowSplitAmount.value = 0.04;
      this.uniforms.uHighlightSplitAmount.value = 0.10;
      this.uniforms.uContrast.value = 0.15;
    } else if (h >= 18.0 && h <= 21.0) {
      // Dusk: shadow split capped at 0.05
      this.uniforms.uShadowSplitAmount.value = 0.05;
      this.uniforms.uHighlightSplitAmount.value = 0.08;
      this.uniforms.uContrast.value = 0.14;
    } else {
      this.uniforms.uShadowSplitAmount.value = 0.03;
      this.uniforms.uHighlightSplitAmount.value = 0.08;
      this.uniforms.uContrast.value = 0.14;
    }

    // Project sun into screen coordinates for sun shafts and lens flare
    if (camera) {
      this.sunWorldPos.copy(skyState.sunDirection).multiplyScalar(400);
      this.projectedSun.copy(this.sunWorldPos).project(camera);

      // Check if sun is in front of camera
      camera.getWorldDirection(this.cameraDir);
      const dotSun = this.cameraDir.dot(skyState.sunDirection);

      const isFacing = dotSun > 0.05 && this.projectedSun.z < 1.0;
      const screenX = (this.projectedSun.x + 1.0) * 0.5;
      const screenY = (this.projectedSun.y + 1.0) * 0.5;

      this.uniforms.uSunScreenPos.value.set(screenX, screenY);
      this.uniforms.uSunFacing.value = isFacing ? Math.max(0, dotSun) : 0.0;

      // Sun elevation factor: strongest at dawn (5.5 - 7.5h) and dusk (17.0 - 19.5h)
      let elevationFactor = 0.0;
      if (skyState.sunElevation > 0.02) {
        if ((h >= 5.2 && h <= 8.0) || (h >= 16.5 && h <= 19.5)) {
          elevationFactor = 1.0; // peak golden hour shafts
        } else if (h > 8.0 && h < 16.5) {
          elevationFactor = 0.45; // noon / mid-day subtle shafts
        }
      }

      const shaftStrength = isFacing ? elevationFactor * Math.max(0, dotSun) * 0.45 : 0.0;
      this.uniforms.uSunShaftStrength.value = shaftStrength;

      if (this.sunShaftsMat) {
        (this.sunShaftsMat.uniforms['uSunPos']!.value as THREE.Vector2).set(screenX, screenY);
        this.sunShaftsMat.uniforms['uStrength']!.value = shaftStrength;
      }

      // Procedural lens flare when camera looks towards sun (desktop only, gentle)
      const lensStrength =
        this.lensGlareEnabled && isFacing && screenX >= -0.1 && screenX <= 1.1 && screenY >= -0.1 && screenY <= 1.1
          ? Math.pow(Math.max(0, dotSun), 2.5) * 0.75
          : 0.0;
      this.uniforms.uLensFacingSun.value = lensStrength;
    }
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    if (this.fallbackDirect || !this.msaaTarget || !this.mainScene || !this.quadCam || !this.helperScene || !this.helperMesh) {
      this.renderer.render(scene, camera);
      this.sampleDirectProbe(scene, camera);
      return;
    }

    // 1. Render 3D scene into multisampled HalfFloat target
    this.renderer.setRenderTarget(this.msaaTarget);
    this.renderer.render(scene, camera);

    // 2. Bloom pass: extract bright pixels (> 1.0), then separable gaussian blur
    if (this.bloomEnabled && this.bloomExtractTarget && this.bloomBlurTarget && this.bloomExtractMat && this.blurHorizontalMat && this.blurVerticalMat) {
      // Step A: Extract bright highlights into bloomExtractTarget
      this.bloomExtractMat.uniforms['tDiffuse']!.value = this.msaaTarget.texture;
      this.bloomExtractMat.uniforms['uThreshold']!.value = this.bloomThreshold;
      this.helperMesh.material = this.bloomExtractMat;
      this.renderer.setRenderTarget(this.bloomExtractTarget);
      this.renderer.render(this.helperScene, this.quadCam);

      // Step B: Horizontal blur from bloomExtractTarget into bloomBlurTarget
      this.blurHorizontalMat.uniforms['tSource']!.value = this.bloomExtractTarget.texture;
      this.helperMesh.material = this.blurHorizontalMat;
      this.renderer.setRenderTarget(this.bloomBlurTarget);
      this.renderer.render(this.helperScene, this.quadCam);

      // Step C: Vertical blur from bloomBlurTarget back into bloomExtractTarget
      this.blurVerticalMat.uniforms['tSource']!.value = this.bloomBlurTarget.texture;
      this.helperMesh.material = this.blurVerticalMat;
      this.renderer.setRenderTarget(this.bloomExtractTarget);
      this.renderer.render(this.helperScene, this.quadCam);

      // Final bloom texture is in bloomExtractTarget
      this.uniforms.tBloom.value = this.bloomExtractTarget.texture;
    }

    // 3. Screen-space sun shafts pass (quarter-res radial blur)
    if (this.sunShaftsEnabled && this.sunShaftsTarget && this.sunShaftsMat && this.uniforms.uSunShaftStrength.value > 0.001) {
      this.sunShaftsMat.uniforms['tDiffuse']!.value = this.msaaTarget.texture;
      this.helperMesh.material = this.sunShaftsMat;
      this.renderer.setRenderTarget(this.sunShaftsTarget);
      this.renderer.render(this.helperScene, this.quadCam);
      this.uniforms.tSunShafts.value = this.sunShaftsTarget.texture;
    }

    // 4. Final Composite pass to screen
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.mainScene, this.quadCam);

    // 5. 1 Hz Exposure Probe readback (?probe=1)
    if (this.probeEnabled && this.probeTarget) {
      const now = performance.now();
      if (now - this.lastProbeTimeMs >= 1000) {
        this.lastProbeTimeMs = now;
        this.sampleExposureProbe();
      }
    }
  }

  private sampleDirectProbe(scene: THREE.Scene, camera: THREE.Camera): void {
    if (!this.probeEnabled || !this.probeTarget) return;
    const now = performance.now();
    if (now - this.lastProbeTimeMs < 1000) return;
    this.lastProbeTimeMs = now;

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

  private sampleExposureProbe(): void {
    if (!this.probeTarget || !this.mainScene || !this.quadCam) return;

    this.renderer.setRenderTarget(this.probeTarget);
    this.renderer.render(this.mainScene, this.quadCam);
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

    lums.sort();

    const mean = sumLum / totalPixels;
    const p5 = lums[Math.floor(totalPixels * 0.05)]!;
    const p95 = lums[Math.floor(totalPixels * 0.95)]!;
    const clippedWhiteFraction = clippedCount / totalPixels;
    const crushedBlackFraction = crushedCount / totalPixels;

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
    if (this.bloomExtractTarget) {
      this.bloomExtractTarget.dispose();
      this.bloomExtractTarget = null;
    }
    if (this.bloomBlurTarget) {
      this.bloomBlurTarget.dispose();
      this.bloomBlurTarget = null;
    }
    if (this.sunShaftsTarget) {
      this.sunShaftsTarget.dispose();
      this.sunShaftsTarget = null;
    }
    if (this.probeTarget) {
      this.probeTarget.dispose();
      this.probeTarget = null;
    }
    if (this.quadGeo) {
      this.quadGeo.dispose();
      this.quadGeo = null;
    }
    if (this.mainMesh) {
      this.mainMesh.geometry.dispose();
      this.mainMesh.material.dispose();
      this.mainMesh = null;
    }
    if (this.bloomExtractMat) this.bloomExtractMat.dispose();
    if (this.blurHorizontalMat) this.blurHorizontalMat.dispose();
    if (this.blurVerticalMat) this.blurVerticalMat.dispose();
    if (this.sunShaftsMat) this.sunShaftsMat.dispose();
    this.mainScene = null;
    this.helperScene = null;
    this.helperMesh = null;
    this.quadCam = null;
  }
}
