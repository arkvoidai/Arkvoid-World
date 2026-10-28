import * as THREE from 'three';
import type { TimeOfDayState } from '@/engine/world/sky';

export interface PushPoint {
  x: number;
  y: number;
  z: number;
  radius: number;
}

export interface WindUniforms {
  uWindDir: { value: THREE.Vector2 };
  uWindStrength: { value: number };
  uGust: { value: number };
  uTime: { value: number };
  uPushPoints: { value: THREE.Vector4[] };
}

/**
 * Shared Wind and Life System:
 * Central source of truth for atmospheric wind, gusts, and player physical push points.
 * All vegetation (grass, leaves, flowers) and life shaders read these uniforms.
 */
export class WindSystem {
  readonly uniforms: WindUniforms;

  private windAngle = 0.85; // Initial wind azimuth
  private gustAccum = 0;
  private readonly pushPoints: THREE.Vector4[] = [
    new THREE.Vector4(0, -999, 0, 0),
    new THREE.Vector4(0, -999, 0, 0),
    new THREE.Vector4(0, -999, 0, 0),
    new THREE.Vector4(0, -999, 0, 0),
  ];

  constructor() {
    this.uniforms = {
      uWindDir: { value: new THREE.Vector2(Math.cos(this.windAngle), Math.sin(this.windAngle)) },
      uWindStrength: { value: 0.38 },
      uGust: { value: 0.0 },
      uTime: { value: 0.0 },
      uPushPoints: { value: this.pushPoints },
    };
  }

  /**
   * Sets player or companion physical push radius in the world (up to 4 points).
   */
  setPushPoint(index: number, x: number, y: number, z: number, radius = 0.8): void {
    if (index >= 0 && index < 4) {
      this.pushPoints[index]!.set(x, y, z, radius);
    }
  }

  /**
   * Clears a push point when actor leaves or becomes inactive.
   */
  clearPushPoint(index: number): void {
    if (index >= 0 && index < 4) {
      this.pushPoints[index]!.set(0, -999, 0, 0);
    }
  }

  update(dt: number, elapsed: number, skyState?: TimeOfDayState | number, reducedMotion = false): void {
    if (reducedMotion) {
      this.uniforms.uWindStrength.value = 0.15;
      this.uniforms.uGust.value = 0.0;
      this.uniforms.uTime.value = elapsed * 0.2;
      return;
    }

    // Wind direction drifts slowly over the 4-hour world day with sky hour
    const hour = typeof skyState === 'number' ? skyState : skyState ? skyState.hour : 0;
    const hourFactor = (hour / 24) * Math.PI * 2;
    this.windAngle = 0.85 + Math.sin(elapsed * 0.015 + hourFactor) * 0.45;
    this.uniforms.uWindDir.value.set(Math.cos(this.windAngle), Math.sin(this.windAngle));

    // Slowly varying wind strength between 0.25 and 0.60
    const baseStrength = 0.38 + Math.sin(elapsed * 0.22) * 0.12 + Math.cos(elapsed * 0.07) * 0.08;
    this.uniforms.uWindStrength.value = Math.max(0.25, Math.min(0.6, baseStrength));

    // Low-frequency scrolling gust noise
    this.gustAccum += dt * (0.8 + this.uniforms.uWindStrength.value);
    const g1 = Math.sin(this.gustAccum * 0.42);
    const g2 = Math.sin(this.gustAccum * 1.15 + 1.2);
    const g3 = Math.cos(this.gustAccum * 2.3 - 0.8);
    const gustRaw = Math.max(0.0, g1 * 0.5 + g2 * 0.35 + g3 * 0.15);
    this.uniforms.uGust.value = gustRaw * gustRaw * 0.45; // Sharp peak gusts

    this.uniforms.uTime.value = elapsed;
  }

  dispose(): void {
    // Nothing allocated on GPU directly
  }
}

/**
 * GLSL helper chunk injected into vegetation shaders.
 */
export const WIND_GLSL_PARS = /* glsl */ `
uniform vec2 uWindDir;
uniform float uWindStrength;
uniform float uGust;
uniform float uTime;
uniform vec4 uPushPoints[4];

// Evaluates wind bend offset at world position and blade/branch height factor v (0..1)
vec3 evaluateWindOffset(vec3 worldPos, float v) {
  float spatialNoise = sin(dot(worldPos.xz, uWindDir) * 1.6 + uTime * 2.4);
  float gustEffect = uGust * (1.0 + spatialNoise * 0.35);
  float totalForce = (uWindStrength + gustEffect) * v * v;
  vec3 windDisp = vec3(uWindDir.x, 0.0, uWindDir.y) * totalForce;
  windDisp.y = -totalForce * 0.25; // Droop slightly when pushed

  // Physical push-down from players / companions
  for (int i = 0; i < 4; i++) {
    vec4 pt = uPushPoints[i];
    if (pt.w > 0.0) {
      vec2 diff = worldPos.xz - pt.xz;
      float d = length(diff);
      if (d < pt.w && abs(worldPos.y - pt.y) < 1.8) {
        float pushFactor = (1.0 - d / pt.w) * v;
        vec2 pushDir = d > 0.01 ? normalize(diff) : vec2(0.0, 1.0);
        windDisp.xz += pushDir * pushFactor * 0.65;
        windDisp.y -= pushFactor * 0.4;
      }
    }
  }

  return windDisp;
}
`;
