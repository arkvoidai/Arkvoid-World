import * as THREE from 'three';
import type { AssetStore } from '@/engine/core/AssetStore';
import { TEXTURE_TUNING } from '@/config/textureTuning';
import type { TimeOfDayState } from '@/engine/world/sky';

export interface TerrainMaterialOptions {
  isPhone?: boolean;
  baseY?: number;
}

export class TerrainMaterial extends THREE.MeshStandardMaterial {
  private readonly isPhone: boolean;
  private readonly baseY: number;
  private readonly customUniforms: {
    tGrassDiff: { value: THREE.Texture | null };
    tGrassNor: { value: THREE.Texture | null };
    tGrassArm: { value: THREE.Texture | null };
    tMossDiff: { value: THREE.Texture | null };
    tMossNor: { value: THREE.Texture | null };
    tMossArm: { value: THREE.Texture | null };
    tRockDiff: { value: THREE.Texture | null };
    tRockNor: { value: THREE.Texture | null };
    tRockArm: { value: THREE.Texture | null };
    tPathDiff: { value: THREE.Texture | null };
    tPathNor: { value: THREE.Texture | null };
    tPathArm: { value: THREE.Texture | null };
    uGrassUvScale: { value: number };
    uMossUvScale: { value: number };
    uRockUvScale: { value: number };
    uPathUvScale: { value: number };
    uGrassGain: { value: number };
    uMossGain: { value: number };
    uRockGain: { value: number };
    uPathGain: { value: number };
    uGrassFlip: { value: number };
    uMossFlip: { value: number };
    uRockFlip: { value: number };
    uPathFlip: { value: number };
    uGrassTint: { value: THREE.Color };
    uMossTint: { value: THREE.Color };
    uRockTint: { value: THREE.Color };
    uPathTint: { value: THREE.Color };
    uGrassRoughness: { value: number };
    uMossRoughness: { value: number };
    uRockRoughness: { value: number };
    uPathRoughness: { value: number };
    uRimColor: { value: THREE.Color };
    uRimStrength: { value: number };
    uKeyLightDir: { value: THREE.Vector3 };
    uBaseY: { value: number };
    uIsPhone: { value: number };
    uTime: { value: number };
  };

  constructor(options: TerrainMaterialOptions = {}) {
    super({
      roughness: 0.85,
      metalness: 0.04,
    });

    this.isPhone = options.isPhone ?? false;
    this.baseY = options.baseY ?? 0;

    this.customUniforms = {
      tGrassDiff: { value: null },
      tGrassNor: { value: null },
      tGrassArm: { value: null },
      tMossDiff: { value: null },
      tMossNor: { value: null },
      tMossArm: { value: null },
      tRockDiff: { value: null },
      tRockNor: { value: null },
      tRockArm: { value: null },
      tPathDiff: { value: null },
      tPathNor: { value: null },
      tPathArm: { value: null },
      uGrassUvScale: { value: 1.0 / TEXTURE_TUNING.grass.uvScaleMeters },
      uMossUvScale: { value: 1.0 / TEXTURE_TUNING.moss.uvScaleMeters },
      uRockUvScale: { value: 1.0 / TEXTURE_TUNING.rock.uvScaleMeters },
      uPathUvScale: { value: 1.0 / TEXTURE_TUNING.path.uvScaleMeters },
      uGrassGain: { value: 1.0 },
      uMossGain: { value: 1.0 },
      uRockGain: { value: 1.0 },
      uPathGain: { value: 1.0 },
      uGrassFlip: { value: 1.0 },
      uMossFlip: { value: 1.0 },
      uRockFlip: { value: 1.0 },
      uPathFlip: { value: 1.0 },
      uGrassTint: { value: new THREE.Color(TEXTURE_TUNING.grass.tintMultiplier) },
      uMossTint: { value: new THREE.Color(TEXTURE_TUNING.moss.tintMultiplier) },
      uRockTint: { value: new THREE.Color(TEXTURE_TUNING.rock.tintMultiplier) },
      uPathTint: { value: new THREE.Color(TEXTURE_TUNING.path.tintMultiplier) },
      uGrassRoughness: { value: TEXTURE_TUNING.grass.nominalRoughness },
      uMossRoughness: { value: TEXTURE_TUNING.moss.nominalRoughness },
      uRockRoughness: { value: TEXTURE_TUNING.rock.nominalRoughness },
      uPathRoughness: { value: TEXTURE_TUNING.path.nominalRoughness },
      uRimColor: { value: new THREE.Color('#FF9E66') },
      uRimStrength: { value: this.isPhone ? 0.25 : 0.35 },
      uKeyLightDir: { value: new THREE.Vector3(1, 0.7, -0.35).normalize() },
      uBaseY: { value: this.baseY },
      uIsPhone: { value: this.isPhone ? 1.0 : 0.0 },
      uTime: { value: 0.0 },
    };

    this.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.customUniforms);

      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
attribute float aPath;
attribute float aShore;
attribute float aMoss;
attribute float aAO;
attribute float aWear;

varying float vPath;
varying float vShore;
varying float vMoss;
varying float vAO;
varying float vWear;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
`,
      );

      shader.vertexShader = shader.vertexShader.replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
vPath = aPath;
vShore = aShore;
vMoss = aMoss;
vAO = aAO;
vWear = aWear;
vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
`,
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
uniform sampler2D tGrassDiff;
uniform sampler2D tGrassNor;
uniform sampler2D tGrassArm;

uniform sampler2D tMossDiff;
uniform sampler2D tMossNor;
uniform sampler2D tMossArm;

uniform sampler2D tRockDiff;
uniform sampler2D tRockNor;
uniform sampler2D tRockArm;

uniform sampler2D tPathDiff;
uniform sampler2D tPathNor;
uniform sampler2D tPathArm;

uniform float uGrassUvScale;
uniform float uMossUvScale;
uniform float uRockUvScale;
uniform float uPathUvScale;

uniform float uGrassGain;
uniform float uMossGain;
uniform float uRockGain;
uniform float uPathGain;

uniform float uGrassFlip;
uniform float uMossFlip;
uniform float uRockFlip;
uniform float uPathFlip;

uniform vec3 uGrassTint;
uniform vec3 uMossTint;
uniform vec3 uRockTint;
uniform vec3 uPathTint;

uniform float uGrassRoughness;
uniform float uMossRoughness;
uniform float uRockRoughness;
uniform float uPathRoughness;

uniform vec3 uRimColor;
uniform float uRimStrength;
uniform vec3 uKeyLightDir;
uniform float uBaseY;
uniform float uIsPhone;
uniform float uTime;

varying float vPath;
varying float vShore;
varying float vMoss;
varying float vAO;
varying float vWear;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;

vec3 perturbNormal2Arb(vec3 surf_pos, vec3 surf_norm, vec3 normalSample) {
  vec3 q0 = dFdx(surf_pos);
  vec3 q1 = dFdy(surf_pos);
  vec2 st0 = dFdx(surf_pos.xz);
  vec2 st1 = dFdy(surf_pos.xz);

  float det = st0.x * st1.y - st1.x * st0.y;
  if (abs(det) < 1e-6) return surf_norm;
  float invDet = 1.0 / det;

  vec3 S = normalize((q0 * st1.y - q1 * st0.y) * invDet);
  vec3 T = normalize((-q0 * st1.x + q1 * st0.x) * invDet);
  vec3 N = surf_norm;

  S = normalize(S - N * dot(N, S));
  T = normalize(cross(N, S));

  mat3 tbn = mat3(S, T, N);
  vec3 mapN = normalSample * 2.0 - 1.0;
  return normalize(tbn * mapN);
}
`,
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `
  // 1. Coordinates and UVs
  vec2 uvXZ = vWorldPos.xz;
  vec3 geomNormal = normalize(vWorldNormal);
  float slope = geomNormal.y;

  // Anti-tiling dual sampling for desktop, single + noise for phone
  vec2 uvGrass = uvXZ * uGrassUvScale;
  vec4 grassCol = texture2D(tGrassDiff, uvGrass);
  grassCol.rgb *= uGrassGain * uGrassTint;
  vec3 grassNor = texture2D(tGrassNor, uvGrass).xyz;
  grassNor.y = mix(1.0 - grassNor.y, grassNor.y, uGrassFlip);
  float grassR = texture2D(tGrassArm, uvGrass).g;

  // Desktop: tile-break by rotated sample of grass & rock, plus fine detail-normal (scale 0.35x)
  if (uIsPhone < 0.5) {
    vec2 uvGrass2 = mat2(0.866, -0.5, 0.5, 0.866) * uvGrass * 1.37;
    vec4 grassCol2 = texture2D(tGrassDiff, uvGrass2) * vec4(uGrassGain * uGrassTint, 1.0);
    float blendFactor = smoothstep(0.3, 0.7, fract(sin(dot(uvXZ * 0.08, vec2(17.1, 31.7))) * 43758.5));
    grassCol = mix(grassCol, grassCol2, blendFactor * 0.45);

    // Detail-normal sample (scale 0.35x) for close-up crispness
    vec3 grassNorDetail = texture2D(tGrassNor, uvGrass / 0.35).xyz;
    grassNor = normalize(grassNor * 0.7 + grassNorDetail * 0.3);
  }

  vec2 uvMoss = uvXZ * uMossUvScale;
  vec4 mossCol = texture2D(tMossDiff, uvMoss);
  mossCol.rgb *= uMossGain * uMossTint;
  vec3 mossNor = texture2D(tMossNor, uvMoss).xyz;
  mossNor.y = mix(1.0 - mossNor.y, mossNor.y, uMossFlip);
  float mossR = texture2D(tMossArm, uvMoss).g;

  vec2 uvPath = uvXZ * uPathUvScale;
  vec4 pathCol = texture2D(tPathDiff, uvPath);
  pathCol.rgb *= uPathGain * uPathTint;
  vec3 pathNor = texture2D(tPathNor, uvPath).xyz;
  pathNor.y = mix(1.0 - pathNor.y, pathNor.y, uPathFlip);
  float pathR = texture2D(tPathArm, uvPath).g;

  // True world-space Triplanar rock sampling for cliffs & undersides (eliminates vertical UV streaks D6)
  vec3 triW = pow(abs(geomNormal), vec3(4.0));
  triW /= max(triW.x + triW.y + triW.z, 1e-4);

  vec2 uvRockX = vWorldPos.zy * uRockUvScale;
  vec2 uvRockY = vWorldPos.xz * uRockUvScale;
  vec2 uvRockZ = vWorldPos.xy * uRockUvScale;

  vec4 rockCol = texture2D(tRockDiff, uvRockX) * triW.x
               + texture2D(tRockDiff, uvRockY) * triW.y
               + texture2D(tRockDiff, uvRockZ) * triW.z;
  rockCol.rgb *= uRockGain * uRockTint;

  // Horizontal geological strata bands on steep cliff & underside faces
  float strataWave = sin(vWorldPos.y * 1.85 + sin(vWorldPos.x * 0.22 + vWorldPos.z * 0.19) * 1.4);
  float strataBand = mix(0.88, 1.10, smoothstep(-0.6, 0.6, strataWave));
  rockCol.rgb *= mix(1.0, strataBand, clamp(1.0 - abs(slope), 0.0, 1.0));

  vec3 rockNor = texture2D(tRockNor, uvRockX).xyz * triW.x
               + texture2D(tRockNor, uvRockY).xyz * triW.y
               + texture2D(tRockNor, uvRockZ).xyz * triW.z;
  rockNor.y = mix(1.0 - rockNor.y, rockNor.y, uRockFlip);
  float rockR = texture2D(tRockArm, uvRockY).g;

  // 2. Layer Blend Weights
  // Rock on steep slopes (slope < 0.78), plus cliff face / underside body
  float rockWeight = smoothstep(0.84, 0.70, slope);
  if (vWorldPos.y < uBaseY - 1.2) {
    rockWeight = max(rockWeight, smoothstep(uBaseY - 1.2, uBaseY - 2.6, vWorldPos.y));
  }

  // Upward-facing cliff ledges accumulate moss (geomNormal.y > 0.35 on cliff rim)
  float ledgeMoss = smoothstep(0.35, 0.68, slope) * smoothstep(uBaseY - 6.0, uBaseY - 0.3, vWorldPos.y) * 0.45;

  // Path from baked vertex attribute with soft edges
  float pathWeight = vPath * (1.0 - rockWeight);

  // Moss in damp / shaded / north-facing areas + upward cliff ledges
  float mossWeight = clamp(vMoss * (1.0 - rockWeight) * (1.0 - pathWeight) + ledgeMoss, 0.0, 1.0);
  rockWeight = max(0.0, rockWeight - ledgeMoss * 0.6);

  // Grass fills the remainder
  float grassWeight = max(0.0, 1.0 - rockWeight - pathWeight - mossWeight);
  float totalWeight = grassWeight + mossWeight + rockWeight + pathWeight;
  if (totalWeight > 0.001) {
    grassWeight /= totalWeight;
    mossWeight /= totalWeight;
    rockWeight /= totalWeight;
    pathWeight /= totalWeight;
  }

  // 3. Composite Albedo
  vec3 blendedAlbedo = grassCol.rgb * grassWeight +
                       mossCol.rgb * mossWeight +
                       rockCol.rgb * rockWeight +
                       pathCol.rgb * pathWeight;

  // Macro colour variation overlay to hide large-scale repetition
  float macroNoise = sin(uvXZ.x * 0.045 + uvXZ.y * 0.035) * 0.035 + cos(uvXZ.x * 0.02 - uvXZ.y * 0.04) * 0.03;
  blendedAlbedo = clamp(blendedAlbedo + macroNoise, 0.0, 1.0);

  // Elevation warming & cooling
  float elevationRel = vWorldPos.y - uBaseY;
  vec3 ridgeWarm = vec3(1.04, 1.02, 0.95);
  vec3 hollowCool = vec3(0.94, 0.96, 1.03);
  blendedAlbedo *= mix(hollowCool, ridgeWarm, smoothstep(-0.6, 1.2, elevationRel));

  // Wet stone & puddle darkening near water (aShore)
  float wetFactor = smoothstep(2.8, 0.4, vShore);
  blendedAlbedo = mix(blendedAlbedo, blendedAlbedo * 0.68, wetFactor * 0.85);

  // Underside rock gradient: natural warm-grey rock with at most 12% cool shadow tint near bottom tip
  if (vWorldPos.y < uBaseY - 2.0) {
    float underDepth = clamp((uBaseY - 2.0 - vWorldPos.y) / 22.0, 0.0, 1.0);
    vec3 coolRockShadow = vec3(0.54, 0.50, 0.58);
    blendedAlbedo = mix(blendedAlbedo, blendedAlbedo * coolRockShadow * 1.35, underDepth * 0.12);
  }

  // Multiply Ambient Occlusion (aAO)
  blendedAlbedo *= (0.42 + 0.58 * vAO);

  diffuseColor = vec4(blendedAlbedo, 1.0);

  // Blended roughness & wetness sheen
  float blendedRough = grassR * grassWeight + mossR * mossWeight + rockR * rockWeight + pathR * pathWeight;
  blendedRough = mix(blendedRough, 0.16, wetFactor * 0.90);
`,
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        `
  #ifdef USE_NORMALMAP
    vec3 blendedNorSample = grassNor * grassWeight + mossNor * mossWeight + rockNor * rockWeight + pathNor * pathWeight;
    
    // Fade normal strength to zero between 40 and 90 m to avoid shimmering
    float camDist = length(vWorldPos - cameraPosition);
    float normalFade = 1.0 - smoothstep(40.0, 90.0, camDist);
    blendedNorSample = mix(vec3(0.5, 0.5, 1.0), blendedNorSample, normalFade);

    normal = perturbNormal2Arb(-vViewPosition, normal, blendedNorSample);
  #endif
`,
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
  float NdotV = clamp(dot(geometryNormal, geometryViewDir), 0.0, 1.0);
  float fresnel = pow(1.0 - NdotV, 3.2);
  float rimOppose = clamp(-dot(geometryNormal, uKeyLightDir) * 0.65 + 0.35, 0.0, 1.0);
  vec3 rimTerm = uRimColor * (fresnel * rimOppose * uRimStrength);
  gl_FragColor.rgb += rimTerm;
`,
      );
    };
  }

  updateTextures(store: AssetStore): void {
    const grass = store.getSlot('grass');
    const moss = store.getSlot('moss');
    const rock = store.getSlot('rock');
    const path = store.getSlot('path');

    this.customUniforms.tGrassDiff.value = grass.diff;
    this.customUniforms.tGrassNor.value = grass.nor;
    this.customUniforms.tGrassArm.value = grass.arm ?? null;
    this.customUniforms.uGrassGain.value = grass.albedoGain;
    this.customUniforms.uGrassFlip.value = grass.flipGreen ? 0.0 : 1.0;

    this.customUniforms.tMossDiff.value = moss.diff;
    this.customUniforms.tMossNor.value = moss.nor;
    this.customUniforms.tMossArm.value = moss.arm ?? null;
    this.customUniforms.uMossGain.value = moss.albedoGain;
    this.customUniforms.uMossFlip.value = moss.flipGreen ? 0.0 : 1.0;

    this.customUniforms.tRockDiff.value = rock.diff;
    this.customUniforms.tRockNor.value = rock.nor;
    this.customUniforms.tRockArm.value = rock.arm ?? null;
    this.customUniforms.uRockGain.value = rock.albedoGain;
    this.customUniforms.uRockFlip.value = rock.flipGreen ? 0.0 : 1.0;

    this.customUniforms.tPathDiff.value = path.diff;
    this.customUniforms.tPathNor.value = path.nor;
    this.customUniforms.tPathArm.value = path.arm ?? null;
    this.customUniforms.uPathGain.value = path.albedoGain;
    this.customUniforms.uPathFlip.value = path.flipGreen ? 0.0 : 1.0;

    this.needsUpdate = true;
  }

  hasTerrainMaps(): boolean {
    return Boolean(
      this.customUniforms.tGrassDiff.value &&
        this.customUniforms.tMossDiff.value &&
        this.customUniforms.tRockDiff.value &&
        this.customUniforms.tPathDiff.value,
    );
  }

  syncSkyState(skyState: TimeOfDayState, elapsed: number): void {
    this.customUniforms.uTime.value = elapsed;
    this.customUniforms.uKeyLightDir.value.copy(skyState.keyLightDirection);
    this.customUniforms.uRimColor.value.copy(skyState.fillColor).lerp(skyState.hemiSky, 0.5);
  }
}
