import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { disposeObject3D } from '@/engine/core/Disposables';
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

function getCloudDomeFragmentShader(marchSteps: number): string {
  return /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform vec3 uSunColor;
uniform vec3 uShadowColor;
uniform float uSunVis;
uniform float uMoonVis;
uniform float uStars;
uniform float uTime;

varying vec3 vWorldDir;

#define MARCH_STEPS ${marchSteps}

float hash12(vec2 p) {
  vec3 p3  = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 hash33(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
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

// 3-octave FBM
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  vec2 shift = vec2(100.0);
  mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.50));
  for (int i = 0; i < 3; ++i) {
    v += a * vnoise(p);
    p = rot * p * 2.0 + shift;
    a *= 0.5;
  }
  return v;
}

float starLayer(vec3 dir, float scale, float threshold, float time) {
  vec3 p = dir * scale;
  vec3 id = floor(p);
  vec3 f = fract(p) - 0.5;
  vec3 rnd = hash33(id);
  if (rnd.x < threshold) return 0.0;
  vec3 offset = (rnd - 0.5) * 0.52;
  float d = length(f - offset);
  float core = smoothstep(0.24, 0.02, d);
  float twinkle = 0.68 + 0.32 * sin(time * (1.1 + rnd.y * 1.9) + rnd.z * 6.28318);
  return core * core * twinkle;
}

void main() {
  vec3 dir = normalize(vWorldDir);
  float y = clamp(dir.y, 0.0, 1.0);

  // Map upper sphere into polar coordinates for seamless cloud mapping
  vec2 uv = vec2(atan(dir.z, dir.x) * 0.1591549 + 0.5, acos(clamp(dir.y, 0.0, 1.0)) * 0.3183098);

  // 1. 3-octave FBM with domain warping
  vec2 q = uv * 4.2 + vec2(uTime * 0.0018, uTime * 0.0012);
  vec2 r = vec2(fbm(q + vec2(1.7, 9.2)), fbm(q + vec2(8.3, 2.8)));
  float cloudNoise = fbm(q + 2.2 * r);

  // Density threshold
  float density = smoothstep(0.44, 0.76, cloudNoise);
  // Fade near horizon to leave Preetham scattering glow pristine
  float horizonFade = smoothstep(0.04, 0.28, y);
  density *= horizonFade;

  // 2. Light marching toward sun so cloud undersides are dark and edges have luminous silver lining
  float sunPenetration = 0.5;
  #if MARCH_STEPS > 0
    vec2 stepDir = normalize(vec2(uSunDir.x, uSunDir.z) + 1e-4) * 0.06;
    float marchAcc = 0.0;
    for (int i = 1; i <= MARCH_STEPS; i++) {
      vec2 samplePos = q + stepDir * float(i);
      marchAcc += smoothstep(0.44, 0.76, fbm(samplePos + 2.0 * r));
    }
    sunPenetration = clamp(1.0 - marchAcc / float(MARCH_STEPS), 0.0, 1.0);
  #endif

  float sunDot = max(0.0, dot(dir, normalize(uSunDir)));
  float edgeLining = pow(clamp(1.0 - abs(density - 0.5) * 2.2, 0.0, 1.0), 2.2) * (pow(sunDot, 5.0) * 1.8 + 0.35);

  vec3 cloudColor = mix(uShadowColor, uSunColor, sunPenetration * 0.82 + 0.18) + uSunColor * (edgeLining * 0.75);

  // 3. Faint high cirrus streaks higher up (y > 0.38)
  float cirrusMask = smoothstep(0.38, 0.78, y);
  float cirrusNoise = sin(uv.x * 28.0 + cos(uv.y * 16.0 + uTime * 0.008)) * cos(uv.y * 22.0);
  float cirrus = smoothstep(0.45, 0.92, cirrusNoise) * 0.24 * cirrusMask;
  density = max(density, cirrus);

  vec4 col = vec4(cloudColor, density * 0.78);

  // 4. Star field & Moon at night
  float starMask = uStars * smoothstep(0.08, 0.40, y);
  if (starMask > 0.005) {
    float s1 = starLayer(dir, 95.0, 0.968, uTime);
    float s2 = starLayer(dir * 1.37 + vec3(7.1, 3.4, 11.2), 155.0, 0.982, uTime * 0.85) * 0.7;
    vec3 starColor = vec3(0.96, 0.94, 1.0);
    col.rgb += starColor * (s1 + s2) * starMask * 1.4 * (1.0 - density);
  }

  // Moon disc and soft pearl halo
  float moonDot = max(dot(dir, normalize(uMoonDir)), 0.0);
  float moonDisc = smoothstep(0.99935, 0.99975, moonDot) * 1.6;
  float moonHalo = pow(moonDot, 28.0) * 0.28 + pow(moonDot, 6.0) * 0.08;
  vec3 moonColor = vec3(0.92, 0.90, 1.0);
  col.rgb += moonColor * (moonDisc + moonHalo) * uMoonVis * (1.0 - density * 0.7);

  // Dither
  float dither = (hash12(gl_FragCoord.xy * 0.73 + fract(uTime)) - 0.5) / 255.0;
  col.rgb += dither;

  gl_FragColor = col;
}
`;
}

export class SkyDome {
  readonly group: THREE.Group;
  readonly sky: Sky;
  readonly cloudDomeMesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  readonly cloudUniforms: {
    [key: string]: THREE.IUniform<unknown>;
    uSunDir: THREE.IUniform<THREE.Vector3>;
    uMoonDir: THREE.IUniform<THREE.Vector3>;
    uSunColor: THREE.IUniform<THREE.Color>;
    uShadowColor: THREE.IUniform<THREE.Color>;
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

    // 2. Layered inside: inverted sphere (radius 880) with procedural cloud dome shader
    const isPhone = device.deviceClass === 'phone';
    const isLow = isPhone || device.gpuTier <= 1 || device.isSoftwareGl;
    const marchSteps = isLow ? 0 : isPhone ? 2 : 4;

    this.cloudUniforms = {
      uSunDir: { value: new THREE.Vector3(1, 0.1, -0.35).normalize() },
      uMoonDir: { value: new THREE.Vector3(-1, 0.4, -0.35).normalize() },
      uSunColor: { value: new THREE.Color('#FFAE42') },
      uShadowColor: { value: new THREE.Color('#432E6A') },
      uSunVis: { value: 1.0 },
      uMoonVis: { value: 0.0 },
      uStars: { value: 0.0 },
      uTime: { value: 0.0 },
    };

    const cloudGeo = new THREE.SphereGeometry(880, 48, 28);
    const cloudMat = new THREE.ShaderMaterial({
      vertexShader: CLOUD_DOME_VERTEX_SHADER,
      fragmentShader: getCloudDomeFragmentShader(marchSteps),
      uniforms: this.cloudUniforms,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    });

    this.cloudDomeMesh = new THREE.Mesh(cloudGeo, cloudMat);
    this.cloudDomeMesh.frustumCulled = false;
    this.cloudDomeMesh.renderOrder = -10;
    this.group.add(this.cloudDomeMesh);
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
    this.cloudUniforms.uSunVis.value = skyState.sunVisibility;
    this.cloudUniforms.uMoonVis.value = skyState.moonVisibility;
    this.cloudUniforms.uStars.value = skyState.stars;
  }

  dispose(): void {
    disposeObject3D(this.group);
  }
}
