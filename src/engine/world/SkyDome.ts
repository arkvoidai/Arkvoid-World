import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { disposeObject3D } from '@/engine/core/Disposables';
import { createSeededRandom } from '@/engine/world/layout';
import type { TimeOfDayState } from '@/engine/world/sky';
import type { DeviceProfile } from '@/lib/deviceProfile';

const CLOUD_DOME_VERTEX_SHADER = /* glsl */ `
varying vec3 vWorldDir;

void main() {
  vWorldDir = position;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
}
`;

function getCloudDomeFragmentShader(octaves: number, marchSteps: number): string {
  return /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform vec3 uSunColor;
uniform vec3 uShadowColor;
uniform vec3 uHorizonColor;
uniform float uSunVis;
uniform float uMoonVis;
uniform float uStars;
uniform float uTime;

varying vec3 vWorldDir;

#define FBM_OCTAVES ${octaves}
#define MARCH_STEPS ${marchSteps}

float hash12(vec2 p) {
  vec3 p3  = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// 2D smooth value noise
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// Multi-octave FBM with domain rotation
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.52;
  vec2 shift = vec2(100.0);
  mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
  for (int i = 0; i < FBM_OCTAVES; ++i) {
    v += a * vnoise(p);
    p = rot * p * 2.03 + shift;
    a *= 0.5;
  }
  return v;
}

float sampleCloudDensity(vec2 planeUv, vec2 wind) {
  vec2 q = planeUv + wind;
  vec2 warp = vec2(
    fbm(q * 0.85 + vec2(1.7, 9.2)),
    fbm(q * 0.85 + vec2(8.3, 2.8))
  );
  float n = fbm(q + 1.35 * (warp - 0.5));
  // Coverage threshold 0.46 with soft smoothstep width 0.28 (0.32 .. 0.60) so edges are feathered, never hard
  return smoothstep(0.32, 0.60, n);
}

void main() {
  vec3 dir = normalize(vWorldDir);
  if (dir.y <= 0.005) discard;
  float y = clamp(dir.y, 0.0, 1.0);

  // Cloud-plane intersection projection at altitude H: foreshortens naturally toward the horizon
  vec2 planeUv = (dir.xz / max(dir.y, 0.04)) * 0.32;
  vec2 wind = vec2(uTime * 0.007, uTime * 0.0038);

  float density = sampleCloudDensity(planeUv, wind);

  // Distance / horizon fade so distant clouds blend smoothly into horizon haze
  float horizonBlend = smoothstep(0.015, 0.22, y);
  float zenithSoft = 1.0 - smoothstep(0.75, 0.99, y) * 0.25;
  density *= horizonBlend * zenithSoft;

  // Light march toward sun direction in cloud-plane space
  float sunPenetration = 0.62;
  #if MARCH_STEPS > 0
    vec2 sunStep = normalize(uSunDir.xz + vec2(1e-4, 0.0)) * 0.14;
    float occ = 0.0;
    for (int i = 1; i <= MARCH_STEPS; ++i) {
      occ += sampleCloudDensity(planeUv + sunStep * float(i), wind);
    }
    sunPenetration = clamp(1.0 - (occ / float(MARCH_STEPS)) * 0.85, 0.08, 1.0);
  #endif

  float sunDot = max(0.0, dot(dir, normalize(uSunDir)));
  float silverLining = pow(clamp(1.0 - abs(density - 0.42) * 2.2, 0.0, 1.0), 2.0)
                     * (pow(sunDot, 4.0) * 1.15 + 0.22) * uSunVis;

  // Lit side vs darker cloud bases, tinted by sun & shadow colours
  vec3 baseShadow = mix(uShadowColor, uHorizonColor, 0.38);
  vec3 litTop = mix(uHorizonColor, uSunColor, 0.65);
  vec3 cloudRgb = mix(baseShadow, litTop, sunPenetration) + uSunColor * (silverLining * 0.48);

  // Second high cirrus layer (soft wisps at higher elevation)
  vec2 cirrusUv = (dir.xz / max(dir.y, 0.12)) * 0.55 + wind * 0.45;
  float cirrusNoise = vnoise(cirrusUv * vec2(2.4, 0.65) + vec2(fbm(cirrusUv) * 1.6));
  float cirrus = smoothstep(0.54, 0.86, cirrusNoise) * smoothstep(0.14, 0.48, y) * 0.28;
  cloudRgb = mix(cloudRgb, mix(litTop, uHorizonColor, 0.35), cirrus * 0.5);
  float totalAlpha = clamp(density * 0.72 + cirrus, 0.0, 0.82);

  // Night dimming with moonlit silver-lilac edges
  if (uStars > 0.01) {
    float moonDot = max(0.0, dot(dir, normalize(uMoonDir)));
    vec3 nightBase = vec3(0.18, 0.17, 0.30);
    vec3 moonEdge = vec3(0.68, 0.66, 0.88) * (0.35 + 0.65 * pow(moonDot, 3.0)) * uMoonVis;
    vec3 nightCloud = nightBase + moonEdge * sunPenetration;
    cloudRgb = mix(cloudRgb, nightCloud, clamp(uStars, 0.0, 1.0));
  }

  // Blend cloud colour toward horizon colour as dir.y -> 0
  cloudRgb = mix(uHorizonColor, cloudRgb, smoothstep(0.015, 0.26, y));

  // Clamp cloud luminance to never exceed 1.05x the horizon luminance
  float horizLum = max(0.08, dot(uHorizonColor, vec3(0.2126, 0.7152, 0.0722)));
  float cloudLum = max(0.001, dot(cloudRgb, vec3(0.2126, 0.7152, 0.0722)));
  float maxAllowedLum = horizLum * 1.05;
  if (cloudLum > maxAllowedLum) {
    cloudRgb *= (maxAllowedLum / cloudLum);
  }

  // Moon disc and soft pearl halo
  float moonDot = max(dot(dir, normalize(uMoonDir)), 0.0);
  float moonDisc = smoothstep(0.99935, 0.99975, moonDot) * 1.35;
  float moonHalo = pow(moonDot, 28.0) * 0.24 + pow(moonDot, 6.0) * 0.07;
  vec3 moonColor = vec3(0.92, 0.90, 1.0);
  vec3 finalRgb = cloudRgb + moonColor * (moonDisc + moonHalo) * uMoonVis * (1.0 - totalAlpha * 0.65);
  float finalAlpha = clamp(totalAlpha + (moonDisc + moonHalo * 0.5) * uMoonVis, 0.0, 0.92);

  // Dither
  float dither = (hash12(gl_FragCoord.xy * 0.73 + fract(uTime)) - 0.5) / 255.0;
  finalRgb += dither;

  gl_FragColor = vec4(finalRgb, finalAlpha);
}
`;
}

const STAR_FIELD_VERTEX_SHADER = /* glsl */ `
attribute float aSize;
attribute float aPhase;
attribute vec3 aStarColor;

uniform float uTime;
uniform float uStars;
uniform float uPixelRatio;

varying vec3 vColor;
varying float vAlpha;

void main() {
  vColor = aStarColor;
  float twinkle = 0.65 + 0.35 * sin(uTime * 1.6 + aPhase);
  float horizonFade = smoothstep(0.06, 0.28, normalize(position).y);
  vAlpha = uStars * twinkle * horizonFade;

  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  // Strictly <= 3.2 px (never > 4 px)
  gl_PointSize = clamp(aSize * min(uPixelRatio, 2.0), 1.2, 3.2);
}
`;

const STAR_FIELD_FRAGMENT_SHADER = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;

void main() {
  if (vAlpha <= 0.005) discard;
  vec2 c = (gl_PointCoord - 0.5) * 2.0;
  float r2 = dot(c, c);
  if (r2 > 1.0) discard;
  float gauss = exp(-r2 * 3.2) * (1.0 - r2);
  gl_FragColor = vec4(vColor, gauss * vAlpha);
}
`;

export class SkyDome {
  readonly group: THREE.Group;
  readonly sky: Sky;
  readonly cloudDomeMesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  readonly starsPoints: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  readonly cloudUniforms: {
    [key: string]: THREE.IUniform<unknown>;
    uSunDir: THREE.IUniform<THREE.Vector3>;
    uMoonDir: THREE.IUniform<THREE.Vector3>;
    uSunColor: THREE.IUniform<THREE.Color>;
    uShadowColor: THREE.IUniform<THREE.Color>;
    uHorizonColor: THREE.IUniform<THREE.Color>;
    uSunVis: THREE.IUniform<number>;
    uMoonVis: THREE.IUniform<number>;
    uStars: THREE.IUniform<number>;
    uTime: THREE.IUniform<number>;
  };

  private lastHour = -999;

  constructor(device: DeviceProfile) {
    this.group = new THREE.Group();
    this.group.name = 'PreethamSkyAndCloudDome';

    // 1. Three's Preetham atmospheric scattering Sky object
    this.sky = new Sky();
    this.sky.scale.setScalar(450000);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -20;
    this.group.add(this.sky);

    // 2. Layered inside: inverted sphere (radius 880) with cloud-plane intersection shader
    const isPhone = device.deviceClass === 'phone';
    const isLow = device.gpuTier <= 1 || device.isSoftwareGl;
    const octaves = isLow ? 2 : isPhone ? 3 : 4;
    const marchSteps = isLow ? 1 : 2;

    this.cloudUniforms = {
      uSunDir: { value: new THREE.Vector3(1, 0.1, -0.35).normalize() },
      uMoonDir: { value: new THREE.Vector3(-1, 0.4, -0.35).normalize() },
      uSunColor: { value: new THREE.Color('#FFAE42') },
      uShadowColor: { value: new THREE.Color('#432E6A') },
      uHorizonColor: { value: new THREE.Color('#F29B6E') },
      uSunVis: { value: 1.0 },
      uMoonVis: { value: 0.0 },
      uStars: { value: 0.0 },
      uTime: { value: 0.0 },
    };

    const cloudGeo = new THREE.SphereGeometry(880, 48, 28);
    const cloudMat = new THREE.ShaderMaterial({
      vertexShader: CLOUD_DOME_VERTEX_SHADER,
      fragmentShader: getCloudDomeFragmentShader(octaves, marchSteps),
      uniforms: this.cloudUniforms,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    });

    this.cloudDomeMesh = new THREE.Mesh(cloudGeo, cloudMat);
    this.cloudDomeMesh.name = 'CloudDome';
    this.cloudDomeMesh.frustumCulled = false;
    this.cloudDomeMesh.renderOrder = -10;
    this.group.add(this.cloudDomeMesh);

    // 3. Dedicated Starfield Points (600 stars above horizon, soft gaussian <= 3.2 px)
    const starCount = 600;
    const rng = createSeededRandom(774123);
    const starPos = new Float32Array(starCount * 3);
    const starSize = new Float32Array(starCount);
    const starPhase = new Float32Array(starCount);
    const starColor = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount; i++) {
      const theta = rng() * Math.PI * 2;
      const y = 0.07 + Math.pow(rng(), 0.85) * 0.92;
      const rHoriz = Math.sqrt(Math.max(0, 1 - y * y));
      const radius = 895;
      starPos[i * 3] = Math.cos(theta) * rHoriz * radius;
      starPos[i * 3 + 1] = y * radius;
      starPos[i * 3 + 2] = Math.sin(theta) * rHoriz * radius;

      starSize[i] = 1.0 + rng() * 0.85;
      starPhase[i] = rng() * Math.PI * 2;

      const tint = rng();
      if (tint < 0.35) {
        // Warm white-gold star
        starColor[i * 3] = 1.0;
        starColor[i * 3 + 1] = 0.95;
        starColor[i * 3 + 2] = 0.88;
      } else if (tint < 0.7) {
        // Soft pearl-lavender star
        starColor[i * 3] = 0.92;
        starColor[i * 3 + 1] = 0.90;
        starColor[i * 3 + 2] = 1.0;
      } else {
        // Cool blue-white star
        starColor[i * 3] = 0.86;
        starColor[i * 3 + 1] = 0.94;
        starColor[i * 3 + 2] = 1.0;
      }
    }

    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    starGeo.setAttribute('aSize', new THREE.BufferAttribute(starSize, 1));
    starGeo.setAttribute('aPhase', new THREE.BufferAttribute(starPhase, 1));
    starGeo.setAttribute('aStarColor', new THREE.BufferAttribute(starColor, 3));

    const starMat = new THREE.ShaderMaterial({
      vertexShader: STAR_FIELD_VERTEX_SHADER,
      fragmentShader: STAR_FIELD_FRAGMENT_SHADER,
      uniforms: {
        uTime: this.cloudUniforms.uTime,
        uStars: this.cloudUniforms.uStars,
        uPixelRatio: { value: 1.5 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.starsPoints = new THREE.Points(starGeo, starMat);
    this.starsPoints.name = 'SkyStars';
    this.starsPoints.frustumCulled = false;
    this.starsPoints.renderOrder = -15;
    this.group.add(this.starsPoints);
  }

  // Alias for backward compatibility with scene.add(this.skyDome.mesh)
  get mesh(): THREE.Group {
    return this.group;
  }

  update(
    skyState: TimeOfDayState,
    elapsed: number,
    cameraPosition: THREE.Vector3,
    reducedMotion: boolean,
  ): void {
    this.group.position.copy(cameraPosition);
    this.cloudUniforms.uTime.value = reducedMotion ? 0 : elapsed;

    // Only update sky scattering & cloud uniforms when the hour moves > 0.01
    const hourDiff = Math.abs(skyState.hour - this.lastHour);
    const wrappedDiff =
      this.lastHour < 0 ? Infinity : Math.min(hourDiff, 24 - hourDiff);

    if (wrappedDiff > 0.01) {
      this.lastHour = skyState.hour;
      this.syncSkyUniforms(skyState);
    }
  }

  forceSync(skyState: TimeOfDayState): void {
    this.lastHour = skyState.hour;
    this.syncSkyUniforms(skyState);
  }

  private syncSkyUniforms(skyState: TimeOfDayState): void {
    // 1. Preetham Sky uniforms
    const skyUniforms = this.sky.material.uniforms;
    if (skyUniforms.turbidity) {
      skyUniforms.turbidity.value = skyState.turbidity;
    }
    if (skyUniforms.rayleigh) {
      skyUniforms.rayleigh.value = skyState.rayleigh;
    }
    if (skyUniforms.mieCoefficient) {
      skyUniforms.mieCoefficient.value = skyState.mieCoefficient;
    }
    if (skyUniforms.mieDirectionalG) {
      skyUniforms.mieDirectionalG.value = skyState.mieDirectionalG;
    }
    if (skyUniforms.sunPosition) {
      (skyUniforms.sunPosition.value as THREE.Vector3).copy(skyState.sunPosition);
    }

    // 2. Procedural Cloud Dome uniforms
    this.cloudUniforms.uSunDir.value.copy(skyState.sunDirection);
    this.cloudUniforms.uMoonDir.value.copy(skyState.moonDirection);
    this.cloudUniforms.uSunColor.value.copy(skyState.keyColor);
    this.cloudUniforms.uShadowColor.value.copy(skyState.fillColor);
    this.cloudUniforms.uHorizonColor.value.copy(skyState.horizon);
    this.cloudUniforms.uSunVis.value = skyState.sunVisibility;
    this.cloudUniforms.uMoonVis.value = skyState.moonVisibility;
    this.cloudUniforms.uStars.value = skyState.stars;
  }

  dispose(): void {
    disposeObject3D(this.group);
  }
}
