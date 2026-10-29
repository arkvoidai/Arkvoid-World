import * as THREE from 'three';
import {
  createSeededRandom,
  LANTERN_PLACEMENTS,
  SPOTS,
  TREE_PLACEMENTS,
} from '@/engine/world/layout';
import type { TimeOfDayState } from '@/engine/world/sky';
import type { DeviceProfile } from '@/lib/deviceProfile';

/**
 * Pure helper computing God Ray intensity from sun elevation (sunDirection.y):
 * - Strongest at dawn and dusk (sun elevation ~0.04 .. 0.45)
 * - Nearly invisible at noon (sun elevation > 0.72 -> ~0.06)
 * - Off at deep night (sun elevation < -0.08 -> 0.0)
 */
export function computeGodRayStrength(sunElevationY: number): number {
  if (sunElevationY <= -0.08) {
    return 0;
  }
  if (sunElevationY < 0.08) {
    // Rising from night into dawn / setting from dusk into night
    const t = (sunElevationY + 0.08) / 0.16;
    return t * t * (3 - 2 * t) * 0.85;
  }
  if (sunElevationY <= 0.42) {
    // Golden hour peak (dawn & dusk)
    const peakT = 1 - Math.abs(sunElevationY - 0.22) / 0.22;
    return 0.78 + Math.max(0, peakT) * 0.22;
  }
  // Fade down toward high noon so rays are nearly invisible at midday
  const noonFade = Math.max(0, Math.min(1, (sunElevationY - 0.42) / 0.45));
  const s = noonFade * noonFade * (3 - 2 * noonFade);
  return 0.78 * (1 - s) + 0.06 * s;
}

/**
 * Pure helper computing the CSS radial vignette background for the phase-graded overlay
 * (updated at most once per second, pointer-events: none, zero canvas filter cost).
 */
export function computePhaseVignetteStyle(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 5 && h < 8) {
    // Dawn: warm orange-white soft vignette
    return 'radial-gradient(circle at 50% 48%, rgba(255, 246, 236, 0.0) 56%, rgba(255, 164, 98, 0.14) 86%, rgba(235, 128, 76, 0.22) 100%)';
  }
  if (h >= 8 && h < 17) {
    // Day: clear airy porcelain edge
    return 'radial-gradient(circle at 50% 48%, rgba(255, 255, 255, 0.0) 64%, rgba(232, 226, 242, 0.07) 90%, rgba(214, 206, 232, 0.12) 100%)';
  }
  if (h >= 17 && h < 20) {
    // Dusk: lavender & warm dusk vignette
    return 'radial-gradient(circle at 50% 48%, rgba(240, 228, 255, 0.0) 54%, rgba(164, 134, 236, 0.16) 85%, rgba(118, 92, 198, 0.26) 100%)';
  }
  // Night: deep soft violet vignette
  return 'radial-gradient(circle at 50% 48%, rgba(92, 82, 168, 0.0) 52%, rgba(58, 50, 124, 0.20) 84%, rgba(34, 29, 86, 0.32) 100%)';
}

interface PetalState {
  treeIndex: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  vrx: number;
  vry: number;
  vrz: number;
  scale: number;
  phase: number;
}

interface BeamAnchor {
  x: number;
  y: number;
  z: number;
  width: number;
  length: number;
  phase: number;
}

const DESKTOP_BEAMS: readonly BeamAnchor[] = [
  { x: -6, y: 12, z: -16, width: 9.5, length: 68, phase: 0.0 },
  { x: 8, y: 14, z: -8, width: 11.0, length: 74, phase: 1.6 },
  { x: 22, y: 11, z: -3, width: 8.5, length: 64, phase: 3.1 },
  { x: -14, y: 10, z: 4, width: 8.0, length: 60, phase: 4.7 },
];

const MIST_RIBBON_ANCHORS = [
  { x: 0, y: 0.34, z: -12, w: 18, d: 6.5, yaw: 0.18, phase: 0.0 },
  { x: -8.5, y: 0.3, z: -4, w: 13, d: 5.5, yaw: -0.42, phase: 1.1 },
  { x: 10.5, y: 0.32, z: -5.5, w: 14, d: 5.8, yaw: 0.65, phase: 2.3 },
  { x: 32, y: -0.35, z: -4, w: 16, d: 4.6, yaw: -0.14, phase: 3.4 },
  { x: 58, y: -1.65, z: -8, w: 20, d: 7.0, yaw: 0.35, phase: 4.5 },
  { x: 42, y: 0.45, z: -34, w: 16, d: 5.5, yaw: -1.1, phase: 5.6 },
] as const;

export class Atmosphere {
  readonly group: THREE.Group;

  private readonly isPhone: boolean;

  // 1. God rays (4 desktop, 2 phone) — 1 draw call (InstancedMesh of crossed beam planes)
  private readonly godRayMesh: THREE.InstancedMesh;
  private readonly godRayMat: THREE.ShaderMaterial;
  private readonly beamAnchors: readonly BeamAnchor[];

  // 2. Mist ribbons (6 flat soft drifting quads over island tops & bridges) — 1 draw call
  private readonly mistRibbonMesh: THREE.InstancedMesh;
  private readonly mistRibbonMat: THREE.ShaderMaterial;

  // 3. Motes (1800 desktop, 600 phone in 70m camera cylinder + Breath Pool rising column) — 1 draw call
  private readonly motesPoints: THREE.Points;
  private readonly motesMat: THREE.ShaderMaterial;

  // 4. Blossom petals (140 desktop, 50 phone) — 1 draw call
  private readonly petalsMesh: THREE.InstancedMesh;
  private readonly petalsMat: THREE.ShaderMaterial;
  private readonly petalsState: PetalState[] = [];

  // 5. Lantern & emissive soft additive halo billboards (16 lanterns) — 1 draw call
  private readonly haloMesh: THREE.InstancedMesh;
  private readonly haloMat: THREE.ShaderMaterial;
  private readonly haloPositions: { x: number; y: number; z: number; scale: number }[] = [];

  private readonly dummy = new THREE.Object3D();
  private readonly upVec = new THREE.Vector3(0, 1, 0);
  private readonly beamDir = new THREE.Vector3(0.5, 0.6, -0.5);
  private readonly beamRight = new THREE.Vector3(1, 0, 0);
  private readonly beamFaceNorm = new THREE.Vector3(0, 0, 1);
  private readonly toCam = new THREE.Vector3();
  private readonly rotMat = new THREE.Matrix4();

  private lastSkySyncHour = -999;

  // Pre-allocated phase colors for motes and haloes
  private readonly cDawnMoteA = new THREE.Color('#FFA25B');
  private readonly cDawnMoteB = new THREE.Color('#FFE0B5');
  private readonly cDayMoteA = new THREE.Color('#FFFDF9');
  private readonly cDayMoteB = new THREE.Color('#EAE4F8');
  private readonly cDuskMoteA = new THREE.Color('#B799FF');
  private readonly cDuskMoteB = new THREE.Color('#FF9E5E');
  private readonly cNightMoteA = new THREE.Color('#BEB2FF');
  private readonly cNightMoteB = new THREE.Color('#8E7CFF');

  constructor(device: DeviceProfile) {
    this.isPhone = device.deviceClass === 'phone';
    this.group = new THREE.Group();
    this.group.name = 'ArkvoidAtmosphere';

    // -------------------------------------------------------------------------
    // 1. GOD RAYS (4 desktop, 2 phone)
    // -------------------------------------------------------------------------
    this.beamAnchors = this.isPhone
      ? DESKTOP_BEAMS.slice(0, 2)
      : DESKTOP_BEAMS;

    const beamGeo = new THREE.PlaneGeometry(1, 1, 8, 1);

    const beamPhaseArray = new Float32Array(this.beamAnchors.length);
    for (let i = 0; i < this.beamAnchors.length; i++) {
      beamPhaseArray[i] = this.beamAnchors[i]!.phase;
    }
    beamGeo.setAttribute(
      'aBeamPhase',
      new THREE.InstancedBufferAttribute(beamPhaseArray, 1),
    );

    this.godRayMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uRayStrength: { value: 0.85 },
        uRayColor: { value: new THREE.Color('#FFB870') },
        uCameraPos: { value: new THREE.Vector3() },
      },
      vertexShader: /* glsl */ `
        attribute float aBeamPhase;
        varying vec2 vUv;
        varying float vPhase;
        varying vec3 vWorldPos;

        void main() {
          vUv = uv;
          vPhase = aBeamPhase;
          vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uRayStrength;
        uniform vec3 uRayColor;
        uniform vec3 uCameraPos;

        varying vec2 vUv;
        varying float vPhase;
        varying vec3 vWorldPos;

        void main() {
          if (uRayStrength <= 0.005) discard;

          // Smooth Gaussian falloff across width so beam never has a hard edge or center spine
          float centeredX = (vUv.x - 0.5) * 2.0;
          float widthFalloff = exp(-centeredX * centeredX * 3.8) * (1.0 - centeredX * centeredX);
          if (widthFalloff <= 0.005) discard;

          float lengthFalloff = smoothstep(0.0, 0.30, vUv.y) * smoothstep(1.0, 0.18, vUv.y);
          float camDistFade = smoothstep(6.0, 16.0, length(vWorldPos - uCameraPos));

          // Slow breathing intensity
          float breath = 0.80 + 0.20 * sin(uTime * 0.45 + vPhase);

          float alpha = widthFalloff * lengthFalloff * camDistFade * breath * uRayStrength * 0.095;
          gl_FragColor = vec4(uRayColor, alpha);
        }
      `,
    });

    this.godRayMesh = new THREE.InstancedMesh(
      beamGeo,
      this.godRayMat,
      this.beamAnchors.length,
    );
    this.godRayMesh.name = 'GodRays';
    this.godRayMesh.frustumCulled = false;
    this.group.add(this.godRayMesh);

    // -------------------------------------------------------------------------
    // 2. MIST RIBBONS (6 flat soft drifting quads over island tops & bridges)
    // -------------------------------------------------------------------------
    const ribbonGeo = new THREE.PlaneGeometry(1, 1, 12, 2);
    ribbonGeo.rotateX(-Math.PI * 0.5);
    const ribbonPhases = new Float32Array(MIST_RIBBON_ANCHORS.length);
    for (let i = 0; i < MIST_RIBBON_ANCHORS.length; i++) {
      ribbonPhases[i] = MIST_RIBBON_ANCHORS[i]!.phase;
    }
    ribbonGeo.setAttribute(
      'aRibbonPhase',
      new THREE.InstancedBufferAttribute(ribbonPhases, 1),
    );

    this.mistRibbonMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uFogColor: { value: new THREE.Color('#D8CCF0') },
        uOpacity: { value: 0.16 },
      },
      vertexShader: /* glsl */ `
        attribute float aRibbonPhase;
        uniform float uTime;
        varying vec2 vUv;
        varying float vPhase;

        void main() {
          vUv = uv;
          vPhase = aRibbonPhase;
          vec3 pos = position;
          // Gentle horizontal & vertical undulation along the ribbon
          float wave = sin(uv.x * 6.28318 + uTime * 0.35 + aRibbonPhase) * 0.08;
          pos.y += wave;
          pos.z += cos(uv.x * 3.14159 - uTime * 0.25 + aRibbonPhase) * 0.06;
          vec4 wp = modelMatrix * instanceMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uFogColor;
        uniform float uOpacity;
        varying vec2 vUv;
        varying float vPhase;

        void main() {
          float edgeX = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x);
          float edgeY = smoothstep(0.0, 0.32, vUv.y) * smoothstep(1.0, 0.68, vUv.y);
          float flow1 = sin(vUv.x * 10.0 - uTime * 0.42 + vPhase) * 0.5 + 0.5;
          float flow2 = cos(vUv.y * 6.0 + vUv.x * 5.0 + uTime * 0.28) * 0.5 + 0.5;
          float wisp = mix(0.45, 1.0, flow1 * 0.6 + flow2 * 0.4);
          float alpha = edgeX * edgeY * wisp * uOpacity;
          gl_FragColor = vec4(uFogColor, alpha);
        }
      `,
    });

    this.mistRibbonMesh = new THREE.InstancedMesh(
      ribbonGeo,
      this.mistRibbonMat,
      MIST_RIBBON_ANCHORS.length,
    );
    this.mistRibbonMesh.name = 'MistRibbons';
    this.mistRibbonMesh.frustumCulled = false;

    for (let i = 0; i < MIST_RIBBON_ANCHORS.length; i++) {
      const r = MIST_RIBBON_ANCHORS[i]!;
      this.dummy.position.set(r.x, r.y, r.z);
      this.dummy.rotation.set(0, r.yaw, 0);
      this.dummy.scale.set(r.w, 1, r.d);
      this.dummy.updateMatrix();
      this.mistRibbonMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mistRibbonMesh.instanceMatrix.needsUpdate = true;
    this.group.add(this.mistRibbonMesh);

    // -------------------------------------------------------------------------
    // 3. MOTES (1800 desktop, 600 phone in 70m camera cylinder + Breath Pool column)
    // -------------------------------------------------------------------------
    const totalMotes = this.isPhone ? 600 : 1800;
    const poolMoteCount = this.isPhone ? 75 : 220;
    const rng = createSeededRandom(50509);

    const motePositions = new Float32Array(totalMotes * 3);
    const moteSeeds = new Float32Array(totalMotes * 4); // x: phase, y: size, z: speed, w: isPoolColumn

    const poolPos = SPOTS['breath-pool'].position;

    for (let i = 0; i < totalMotes; i++) {
      const isPool = i < poolMoteCount;
      if (isPool) {
        // Rising column of luminous motes above the Breath Pool (-9, 0, -4)
        const angle = rng() * Math.PI * 2;
        const radius = Math.sqrt(rng()) * 2.15;
        const h = rng() * 7.2;
        motePositions[i * 3] = poolPos.x + Math.cos(angle) * radius;
        motePositions[i * 3 + 1] = 0.28 + h;
        motePositions[i * 3 + 2] = poolPos.z + Math.sin(angle) * radius;

        moteSeeds[i * 4] = rng() * Math.PI * 2;
        moteSeeds[i * 4 + 1] = 0.95 + rng() * 1.1; // Delicate luminous motes over the pool
        moteSeeds[i * 4 + 2] = 0.45 + rng() * 0.45;
        moteSeeds[i * 4 + 3] = 1.0; // Pool flag
      } else {
        // 70 m diameter cylinder (radius 35 m, height 22 m) wrapped around camera in shader
        const angle = rng() * Math.PI * 2;
        const radius = Math.sqrt(rng()) * 35.0;
        const yOff = (rng() - 0.35) * 20.0;
        motePositions[i * 3] = Math.cos(angle) * radius;
        motePositions[i * 3 + 1] = yOff;
        motePositions[i * 3 + 2] = Math.sin(angle) * radius;

        moteSeeds[i * 4] = rng() * Math.PI * 2;
        moteSeeds[i * 4 + 1] = 0.65 + rng() * 0.95;
        moteSeeds[i * 4 + 2] = 0.22 + rng() * 0.38;
        moteSeeds[i * 4 + 3] = 0.0;
      }
    }

    const motesGeo = new THREE.BufferGeometry();
    motesGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(motePositions, 3),
    );
    motesGeo.setAttribute('aSeed', new THREE.BufferAttribute(moteSeeds, 4));

    this.motesMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uCameraPos: { value: new THREE.Vector3() },
        uPixelRatio: { value: 1.5 },
        uColorA: { value: this.cDawnMoteA.clone() },
        uColorB: { value: this.cDawnMoteB.clone() },
        uSunDir: { value: new THREE.Vector3(0.5, 0.5, -0.5) },
        uBeamBoostStrength: { value: 0.8 },
        uDayFade: { value: 0.85 },
      },
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        uniform float uTime;
        uniform vec3 uCameraPos;
        uniform float uPixelRatio;
        uniform vec3 uSunDir;
        uniform float uBeamBoostStrength;
        uniform float uDayFade;

        varying float vColorMix;
        varying float vAlpha;
        varying float vBeamBoost;

        void main() {
          float phase = aSeed.x;
          float size = aSeed.y;
          float speed = aSeed.z;
          float isPool = aSeed.w;

          vec3 worldPos;
          if (isPool > 0.5) {
            // Rising spiral column above Breath Pool (-9, 0.28, -4)
            float cycleH = mod(position.y - 0.28 + uTime * speed * 1.1, 7.2);
            float swirlAngle = uTime * 0.45 + phase + cycleH * 0.35;
            float radialR = length(position.xz - vec2(-9.0, -4.0)) * (1.0 - cycleH * 0.05);
            worldPos.x = -9.0 + cos(swirlAngle) * radialR;
            worldPos.y = 0.28 + cycleH;
            worldPos.z = -4.0 + sin(swirlAngle) * radialR;
            vAlpha = smoothstep(0.0, 0.8, cycleH) * smoothstep(7.2, 4.8, cycleH) * 0.88 * max(0.55, uDayFade);
          } else {
            // 70 m cylinder wrapping around uCameraPos with upward drift & curl noise
            vec3 rel = position;
            rel.y += uTime * speed;
            rel.x += sin(uTime * 0.55 + phase) * 0.85;
            rel.z += cos(uTime * 0.48 + phase * 1.3) * 0.85;

            // Wrap within [-35, +35] in XZ and [-8, +14] in Y around camera
            vec3 delta = rel - uCameraPos;
            worldPos.x = uCameraPos.x + (mod(delta.x + 35.0, 70.0) - 35.0);
            worldPos.z = uCameraPos.z + (mod(delta.z + 35.0, 70.0) - 35.0);
            worldPos.y = uCameraPos.y + (mod(delta.y + 8.0, 22.0) - 8.0);

            float distXZ = length(worldPos.xz - uCameraPos.xz);
            float cylFade = smoothstep(35.0, 24.0, distXZ);
            float twinkle = 0.62 + 0.38 * sin(uTime * 1.8 + phase * 3.0);
            vAlpha = cylFade * twinkle * 0.68 * uDayFade;
          }

          // Brighter inside sunbeams (check alignment with sunbeams passing plaza)
          float sunAlign = sin(worldPos.x * 0.18 + worldPos.z * 0.14) * 0.5 + 0.5;
          vBeamBoost = 1.0 + (isPool * 0.45 + sunAlign * uBeamBoostStrength * 0.75);
          vColorMix = fract(phase * 0.3183);

          vec4 mvPosition = viewMatrix * vec4(worldPos, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          // Strictly <= 3.6 px (never > 4 px)
          gl_PointSize = clamp(size * min(uPixelRatio, 2.0) * (18.0 / max(3.0, -mvPosition.z)), 1.2, 3.6);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColorA;
        uniform vec3 uColorB;

        varying float vColorMix;
        varying float vAlpha;
        varying float vBeamBoost;

        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float r2 = dot(c, c) * 4.0;
          if (r2 > 1.0) discard;

          float softDisc = pow(1.0 - r2, 2.3);
          vec3 col = mix(uColorA, uColorB, vColorMix) * vBeamBoost;
          gl_FragColor = vec4(col, softDisc * vAlpha);
        }
      `,
    });


    this.motesPoints = new THREE.Points(motesGeo, this.motesMat);
    this.motesPoints.name = 'AtmosphericMotes';
    this.motesPoints.frustumCulled = false;
    this.group.add(this.motesPoints);

    // -------------------------------------------------------------------------
    // 4. BLOSSOM PETALS (desktop 140, phone 50) — 5..7 cm soft notched petal SDF
    // -------------------------------------------------------------------------
    const petalCount = this.isPhone ? 50 : 140;
    const petalGeo = new THREE.PlaneGeometry(0.07, 0.05);

    this.petalsMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uSunLight: { value: new THREE.Color('#FFF5EA') },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vColor;

        void main() {
          vUv = uv;
          #ifdef USE_INSTANCING_COLOR
            vColor = instanceColor;
          #else
            vColor = vec3(1.0, 0.72, 0.52);
          #endif
          vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uSunLight;
        varying vec2 vUv;
        varying vec3 vColor;

        void main() {
          // Delicate notched blossom petal silhouette with soft alpha edge
          vec2 p = (vUv - 0.5) * 2.0;
          p.x *= 0.85;
          float notch = 0.14 * exp(-p.x * p.x * 12.0) * max(0.0, p.y);
          float d = length(vec2(p.x, p.y + notch));
          if (d > 0.96) discard;
          float alpha = smoothstep(0.96, 0.42, d) * 0.90;
          vec3 col = vColor * mix(vec3(0.88), uSunLight, 0.42);
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });

    this.petalsMesh = new THREE.InstancedMesh(
      petalGeo,
      this.petalsMat,
      petalCount,
    );
    this.petalsMesh.name = 'BlossomPetals';
    this.petalsMesh.frustumCulled = false;

    const cOrangePetal1 = new THREE.Color('#FF944D');
    const cOrangePetal2 = new THREE.Color('#FFC9A3');
    const cLavPetal1 = new THREE.Color('#BFA8FF');
    const cLavPetal2 = new THREE.Color('#E6DCFF');
    const tmpPetalColor = new THREE.Color();

    for (let i = 0; i < petalCount; i++) {
      const treeIndex = i % TREE_PLACEMENTS.length;
      const tree = TREE_PLACEMENTS[treeIndex]!;
      const pState: PetalState = {
        treeIndex,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        rx: rng() * Math.PI * 2,
        ry: rng() * Math.PI * 2,
        rz: rng() * Math.PI * 2,
        vrx: (rng() - 0.5) * 2.4,
        vry: (rng() - 0.5) * 2.4,
        vrz: (rng() - 0.5) * 2.4,
        scale: 0.75 + rng() * 0.55,
        phase: rng() * Math.PI * 2,
      };
      this.resetPetalToTree(pState, rng, true);
      this.petalsState.push(pState);

      if (tree.variant === 2) {
        tmpPetalColor.copy(cLavPetal1).lerp(cLavPetal2, rng());
      } else {
        tmpPetalColor.copy(cOrangePetal1).lerp(cOrangePetal2, rng());
      }
      this.petalsMesh.setColorAt(i, tmpPetalColor);
    }
    if (this.petalsMesh.instanceColor) {
      this.petalsMesh.instanceColor.needsUpdate = true;
    }
    this.updatePetals(0, 0, false);
    this.group.add(this.petalsMesh);

    // -------------------------------------------------------------------------
    // 5. LANTERN & EMISSIVE GLOW BILLBOARDS (12 Plaza + 4 Pavilion Eave Lanterns)
    // -------------------------------------------------------------------------
    for (const l of LANTERN_PLACEMENTS) {
      this.haloPositions.push({
        x: l.x,
        y: l.y + 2.18,
        z: l.z,
        scale: 1.45,
      });
    }
    const pavX = 12;
    const pavZ = -6;
    const pavLanternY = 3.7 + 0.22 - 0.65 - 0.14;
    const eaveCorners = [
      { x: pavX - 5.2, z: pavZ - 4.2 },
      { x: pavX + 5.2, z: pavZ - 4.2 },
      { x: pavX - 5.2, z: pavZ + 4.2 },
      { x: pavX + 5.2, z: pavZ + 4.2 },
    ];
    for (const c of eaveCorners) {
      this.haloPositions.push({
        x: c.x,
        y: pavLanternY,
        z: c.z,
        scale: 1.65,
      });
    }

    const haloGeo = new THREE.PlaneGeometry(1, 1);
    this.haloMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uHaloColor: { value: new THREE.Color('#FFA860') },
        uHaloStrength: { value: 0.65 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uHaloColor;
        uniform float uHaloStrength;
        varying vec2 vUv;
        void main() {
          vec2 c = (vUv - 0.5) * 2.0;
          float r2 = dot(c, c);
          if (r2 > 1.0) discard;
          float glow = pow(1.0 - r2, 2.6) * uHaloStrength;
          gl_FragColor = vec4(uHaloColor, glow);
        }
      `,
    });

    this.haloMesh = new THREE.InstancedMesh(
      haloGeo,
      this.haloMat,
      this.haloPositions.length,
    );
    this.haloMesh.name = 'LanternGlowHaloes';
    this.haloMesh.frustumCulled = false;
    this.group.add(this.haloMesh);
  }

  private resetPetalToTree(
    p: PetalState,
    rng: () => number,
    initialSpread = false,
  ): void {
    const tree = TREE_PLACEMENTS[p.treeIndex]!;
    const angle = rng() * Math.PI * 2;
    const radius = rng() * 1.85 * tree.scale;
    p.x = tree.x + Math.cos(angle) * radius;
    p.z = tree.z + Math.sin(angle) * radius;
    const topCanopyY = tree.y + (2.6 + rng() * 1.6) * tree.scale;
    p.y = initialSpread ? tree.y + 0.25 + rng() * (topCanopyY - tree.y) : topCanopyY;
    p.vx = (rng() - 0.5) * 0.22;
    p.vy = -(0.32 + rng() * 0.24);
    p.vz = (rng() - 0.5) * 0.22;
  }

  private updatePetals(
    dt: number,
    elapsed: number,
    reducedMotion: boolean,
  ): void {
    const stepDt = reducedMotion ? 0 : dt;
    for (let i = 0; i < this.petalsState.length; i++) {
      const p = this.petalsState[i]!;
      if (stepDt > 0) {
        const breezeX = Math.sin(elapsed * 0.9 + p.phase) * 0.28;
        const breezeZ = Math.cos(elapsed * 0.75 + p.phase * 1.3) * 0.24;
        p.x += (p.vx + breezeX) * stepDt;
        p.y += p.vy * stepDt;
        p.z += (p.vz + breezeZ) * stepDt;
        p.rx += p.vrx * stepDt;
        p.ry += p.vry * stepDt;
        p.rz += p.vrz * stepDt;

        // Reset when passing below the island top surface or outside the 26m island rim
        const distSq = p.x * p.x + p.z * p.z;
        if (p.y < 0.04 || distSq > 25.5 * 25.5) {
          const tree = TREE_PLACEMENTS[p.treeIndex]!;
          const pseudo = Math.sin(elapsed * 3.7 + i * 1.9) * 0.5 + 0.5;
          const angle = (elapsed * 0.8 + i * 2.1) % (Math.PI * 2);
          const rad = (0.35 + pseudo * 1.4) * tree.scale;
          p.x = tree.x + Math.cos(angle) * rad;
          p.z = tree.z + Math.sin(angle) * rad;
          p.y = tree.y + (2.7 + pseudo * 1.4) * tree.scale;
        }
      }

      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.rotation.set(p.rx, p.ry, p.rz);
      this.dummy.scale.setScalar(p.scale);
      this.dummy.updateMatrix();
      this.petalsMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.petalsMesh.instanceMatrix.needsUpdate = true;
  }

  private syncSkyState(skyState: TimeOfDayState, force: boolean): void {
    const h = skyState.hour;
    const rawDiff = Math.abs(h - this.lastSkySyncHour);
    const wrappedDiff =
      this.lastSkySyncHour < 0 ? Infinity : Math.min(rawDiff, 24 - rawDiff);
    if (!force && wrappedDiff < 0.01) return;
    this.lastSkySyncHour = h;


    // 1. Update God Ray strength, warm golden-orange colour & beam direction from sunDirection
    const rayStrength = computeGodRayStrength(skyState.sunDirection.y);
    this.godRayMat.uniforms.uRayStrength!.value = rayStrength;
    (this.godRayMat.uniforms.uRayColor!.value as THREE.Color)
      .set('#FFB870')
      .lerp(skyState.light, 0.45);

    this.beamDir.copy(skyState.sunDirection).normalize();
    if (this.beamDir.y < 0.16) {
      this.beamDir.y = 0.16;
      this.beamDir.normalize();
    }

    // 2. Mist ribbons tinted by fog colour
    (this.mistRibbonMat.uniforms.uFogColor!.value as THREE.Color)
      .copy(skyState.fog)
      .lerp(skyState.horizon, 0.25);

    // 3. Motes coloured by phase (orange at dawn, white at day, purple at dusk, lavender at night)
    const moteColA = this.motesMat.uniforms.uColorA!.value as THREE.Color;
    const moteColB = this.motesMat.uniforms.uColorB!.value as THREE.Color;
    if (h >= 5 && h < 8.2) {
      moteColA.copy(this.cDawnMoteA);
      moteColB.copy(this.cDawnMoteB);
      this.motesMat.uniforms.uDayFade!.value = 0.82;
    } else if (h >= 8.2 && h < 16.5) {
      moteColA.copy(this.cDayMoteA);
      moteColB.copy(this.cDayMoteB);
      this.motesMat.uniforms.uDayFade!.value = 0.28;
    } else if (h >= 16.5 && h < 20.2) {
      moteColA.copy(this.cDuskMoteA);
      moteColB.copy(this.cDuskMoteB);
      this.motesMat.uniforms.uDayFade!.value = 0.88;
    } else {
      moteColA.copy(this.cNightMoteA);
      moteColB.copy(this.cNightMoteB);
      this.motesMat.uniforms.uDayFade!.value = 0.92;
    }

    (this.motesMat.uniforms.uSunDir!.value as THREE.Vector3).copy(
      skyState.sunDirection,
    );
    this.motesMat.uniforms.uBeamBoostStrength!.value = rayStrength;

    // 4. Blossom petal sunlight tint
    (this.petalsMat.uniforms.uSunLight!.value as THREE.Color).copy(
      skyState.light,
    );

    // 5. Lantern halo strength (strongest at dusk/night/dawn, soft at noon)
    const isBrightDay = h >= 8.5 && h <= 16.0;
    this.haloMat.uniforms.uHaloStrength!.value = isBrightDay ? 0.16 : 0.62;
    (this.haloMat.uniforms.uHaloColor!.value as THREE.Color).set(
      h >= 16.5 && h < 20.2 ? '#FFB078' : '#FFA65C',
    );
  }

  update(
    dt: number,
    elapsed: number,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    skyState: TimeOfDayState,
    reducedMotion: boolean,
    force = false,
  ): void {
    const timeVal = reducedMotion ? 0 : elapsed;

    this.godRayMat.uniforms.uTime!.value = timeVal;
    (this.godRayMat.uniforms.uCameraPos!.value as THREE.Vector3).copy(
      camera.position,
    );
    this.mistRibbonMat.uniforms.uTime!.value = timeVal;
    this.motesMat.uniforms.uTime!.value = timeVal;
    (this.motesMat.uniforms.uCameraPos!.value as THREE.Vector3).copy(
      camera.position,
    );
    this.motesMat.uniforms.uPixelRatio!.value = renderer.getPixelRatio();

    this.syncSkyState(skyState, force);
    this.updatePetals(dt, elapsed, reducedMotion);

    // Billboard GodRay planes around beamDir toward camera so they are never viewed edge-on as a vertical line (D9)
    for (let i = 0; i < this.beamAnchors.length; i++) {
      const b = this.beamAnchors[i]!;
      this.dummy.position.set(b.x, b.y, b.z);
      this.toCam.copy(camera.position).sub(this.dummy.position);
      this.beamRight.crossVectors(this.beamDir, this.toCam);
      if (this.beamRight.lengthSq() < 1e-4) {
        this.beamRight.crossVectors(this.beamDir, this.upVec);
      }
      this.beamRight.normalize();
      this.beamFaceNorm.crossVectors(this.beamRight, this.beamDir).normalize();
      this.rotMat.makeBasis(this.beamRight, this.beamDir, this.beamFaceNorm);
      this.dummy.quaternion.setFromRotationMatrix(this.rotMat);
      this.dummy.scale.set(b.width, b.length, 1);
      this.dummy.updateMatrix();
      this.godRayMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.godRayMesh.instanceMatrix.needsUpdate = true;

    // Orient lantern glow haloes toward camera
    const camQuat = camera.quaternion;
    for (let i = 0; i < this.haloPositions.length; i++) {
      const hp = this.haloPositions[i]!;
      this.dummy.position.set(hp.x, hp.y, hp.z);
      this.dummy.quaternion.copy(camQuat);
      this.dummy.scale.setScalar(hp.scale);
      this.dummy.updateMatrix();
      this.haloMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.haloMesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.godRayMesh.geometry.dispose();
    this.godRayMat.dispose();

    this.mistRibbonMesh.geometry.dispose();
    this.mistRibbonMat.dispose();

    this.motesPoints.geometry.dispose();
    this.motesMat.dispose();

    this.petalsMesh.geometry.dispose();
    this.petalsMat.dispose();

    this.haloMesh.geometry.dispose();
    this.haloMat.dispose();

    this.group.removeFromParent();
  }
}
