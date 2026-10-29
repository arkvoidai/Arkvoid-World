import * as THREE from 'three';
import { CSM } from 'three/examples/jsm/csm/CSM.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { disposeObject3D } from '@/engine/core/Disposables';
import {
  ISLANDS,
  islandRadiusAtAngle,
  islandSurfaceUndulation,
  LANTERN_PLACEMENTS,
  SPOTS,
  TREE_PLACEMENTS,
} from '@/engine/world/layout';
import type { TimeOfDayState } from '@/engine/world/sky';
import type { DeviceProfile } from '@/lib/deviceProfile';

export type ShadowTier = 'desktop-high' | 'desktop-mid' | 'phone-high' | 'none';

export function resolveShadowTier(device: DeviceProfile): ShadowTier {
  if (device.isSoftwareGl || device.gpuTier <= 1) {
    return 'none';
  }
  if (device.deviceClass === 'phone') {
    return device.gpuTier >= 2 ? 'phone-high' : 'none';
  }
  if (device.gpuTier >= 3) {
    return 'desktop-high';
  }
  return 'desktop-mid';
}

export function shouldRegeneratePmrem(
  isLowTier: boolean,
  elapsedSinceLastSec: number,
  currentHour: number,
  lastRegenHour: number,
): boolean {
  if (isLowTier) return false;
  if (elapsedSinceLastSec < 45) return false;
  const rawDiff = Math.abs(currentHour - lastRegenHour);
  const wrappedDiff =
    lastRegenHour < 0 ? Infinity : Math.min(rawDiff, 24 - rawDiff);
  return wrappedDiff >= 0.25;
}

/**
 * Generates a cached 128x128 radial-gradient CanvasTexture for soft ambient occlusion
 * decals and character blob shadows.
 */
function createRadialAoTexture(): THREE.CanvasTexture {
  const size = 128;
  let canvas: HTMLCanvasElement;
  if (typeof document !== 'undefined') {
    canvas = document.createElement('canvas');
  } else {
    canvas = {
      width: size,
      height: size,
      getContext: () => null,
    } as unknown as HTMLCanvasElement;
  }
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.clearRect(0, 0, size, size);

    const grad = ctx.createRadialGradient(
      size * 0.5,
      size * 0.5,
      size * 0.02,
      size * 0.5,
      size * 0.5,
      size * 0.48,
    );
    grad.addColorStop(0.0, 'rgba(45, 38, 65, 0.35)');
    grad.addColorStop(0.42, 'rgba(55, 48, 75, 0.18)');
    grad.addColorStop(0.76, 'rgba(70, 62, 90, 0.06)');
    grad.addColorStop(1.0, 'rgba(70, 62, 90, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createInstancedAoDecals(
  aoMaterial: THREE.MeshBasicMaterial,
): THREE.InstancedMesh {
  interface AoPlacement {
    x: number;
    y: number;
    z: number;
    scaleX: number;
    scaleZ: number;
    yaw?: number;
  }

  const placements: AoPlacement[] = [];

  // 1. Dawn Terrace Pavilion (12, 0, -6) footprint decal
  placements.push({
    x: 12,
    y: islandSurfaceUndulation(12, -6) + 0.016,
    z: -6,
    scaleX: 11.6,
    scaleZ: 9.6,
  });

  // 2. Bell Pavilion (6, 0, -17) footprint decal
  placements.push({
    x: SPOTS.bell.position.x,
    y: islandSurfaceUndulation(SPOTS.bell.position.x, SPOTS.bell.position.z) + 0.016,
    z: SPOTS.bell.position.z,
    scaleX: 4.5,
    scaleZ: 4.5,
  });

  // 3. Breath Pool (-9, 0, -4) outer basin contact ring shadow
  placements.push({
    x: SPOTS['breath-pool'].position.x,
    y:
      islandSurfaceUndulation(
        SPOTS['breath-pool'].position.x,
        SPOTS['breath-pool'].position.z,
      ) + 0.015,
    z: SPOTS['breath-pool'].position.z,
    scaleX: 6.4,
    scaleZ: 6.4,
  });

  // 4. Luminous Sealed Gate (0, 0, -21) twin columns
  for (const side of [-1, 1]) {
    const cx = SPOTS.gate.position.x + side * 1.95;
    const cz = SPOTS.gate.position.z;
    placements.push({
      x: cx,
      y: islandSurfaceUndulation(cx, cz) + 0.016,
      z: cz,
      scaleX: 2.2,
      scaleZ: 2.2,
    });
  }

  // 5. Blossom Trees
  for (const tree of TREE_PLACEMENTS) {
    placements.push({
      x: tree.x,
      y: tree.y + 0.015,
      z: tree.z,
      scaleX: 4.4 * tree.scale,
      scaleZ: 4.4 * tree.scale,
      yaw: tree.yaw,
    });
  }

  // 6. Plaza Lantern Posts
  for (const lantern of LANTERN_PLACEMENTS) {
    placements.push({
      x: lantern.x,
      y: lantern.y + 0.016,
      z: lantern.z,
      scaleX: 1.15,
      scaleZ: 1.15,
    });
  }

  // 7. Subtle AO along the inner rim bevel of Island A
  const islandA = ISLANDS.A;
  const rimSegs = 8;
  for (let i = 0; i < rimSegs; i++) {
    const theta = (i / rimSegs) * Math.PI * 2 + 0.2;
    const r = islandRadiusAtAngle('A', islandA.radius, theta) - 1.45;
    const rx = Math.cos(theta) * r;
    const rz = Math.sin(theta) * r;
    placements.push({
      x: rx,
      y: islandSurfaceUndulation(rx, rz) + 0.012,
      z: rz,
      scaleX: 6.8,
      scaleZ: 2.2,
      yaw: -theta + Math.PI * 0.5,
    });
  }

  const quadGeo = new THREE.PlaneGeometry(1, 1);
  quadGeo.rotateX(-Math.PI * 0.5);

  const instanced = new THREE.InstancedMesh(
    quadGeo,
    aoMaterial,
    placements.length,
  );
  instanced.name = 'AmbientOcclusionDecals';
  instanced.renderOrder = 1;

  const dummy = new THREE.Object3D();
  for (let i = 0; i < placements.length; i++) {
    const p = placements[i]!;
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(0, p.yaw ?? 0, 0);
    dummy.scale.set(p.scaleX, 1, p.scaleZ);
    dummy.updateMatrix();
    instanced.setMatrixAt(i, dummy.matrix);
  }
  instanced.instanceMatrix.needsUpdate = true;
  return instanced;
}

export class LightRig {
  readonly keyLight: THREE.DirectionalLight;
  readonly fillLight: THREE.DirectionalLight;
  readonly hemiLight: THREE.HemisphereLight;
  readonly aoDecals: THREE.InstancedMesh;
  readonly shadowTier: ShadowTier;

  private readonly isLowTier: boolean;
  private readonly aoTexture: THREE.CanvasTexture;
  private readonly aoMaterial: THREE.MeshBasicMaterial;

  private csm: CSM | null = null;
  private pmremGenerator: THREE.PMREMGenerator | null = null;
  private envRenderTarget: THREE.WebGLRenderTarget | null = null;
  private miniSkyScene: THREE.Scene | null = null;
  private miniSkyMat: THREE.ShaderMaterial | null = null;

  private lastLightSyncHour = -999;
  private lastEnvRegenHour = -999;
  private lastEnvRegenElapsed = -999;
  private smoothedExposure = 1.0;

  private readonly pointLights: THREE.PointLight[] = [];
  private readonly lightAnchors: Array<{ pos: THREE.Vector3; color: THREE.Color }> = [];
  private lastPointLightUpdateElapsed = -999;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    device: DeviceProfile,
    initialSky: TimeOfDayState,
    camera?: THREE.PerspectiveCamera,
  ) {
    this.shadowTier = resolveShadowTier(device);
    this.isLowTier = this.shadowTier === 'none';
    this.smoothedExposure = initialSky.exposure;
    renderer.toneMappingExposure = this.smoothedExposure;

    // 1. Key DirectionalLight
    this.keyLight = new THREE.DirectionalLight(
      initialSky.keyColor,
      initialSky.keyIntensity,
    );
    this.keyLight.position
      .copy(initialSky.keyLightDirection)
      .multiplyScalar(110);

    // 2. Fill DirectionalLight: opposite azimuth, low elevation, no shadows, twilight/purple tinted
    this.fillLight = new THREE.DirectionalLight(
      initialSky.fillColor,
      initialSky.fillIntensity,
    );
    this.fillLight.position
      .copy(initialSky.fillLightDirection)
      .multiplyScalar(90);
    this.fillLight.castShadow = false;

    // 3. HemisphereLight
    this.hemiLight = new THREE.HemisphereLight(
      initialSky.hemiSky,
      initialSky.hemiGround,
      initialSky.hemiIntensity,
    );
    this.hemiLight.position.set(0, 80, 0);

    scene.add(this.keyLight, this.keyLight.target, this.fillLight, this.hemiLight);

    // 3b. Pool of 4 shadowless PointLights (2 on phone) for warm lantern & brazier pools
    const pointLightCount = device.deviceClass === 'phone' ? 2 : 4;
    for (const l of LANTERN_PLACEMENTS) {
      this.lightAnchors.push({
        pos: new THREE.Vector3(l.x, l.y + 2.1, l.z),
        color: new THREE.Color('#FFA24A'),
      });
    }
    // Stair & Hall braziers
    this.lightAnchors.push(
      { pos: new THREE.Vector3(1.68, 1.4, -2.15), color: new THREE.Color('#FF8C2A') },
      { pos: new THREE.Vector3(1.68, 1.4, -9.85), color: new THREE.Color('#9D6CFF') },
      { pos: new THREE.Vector3(8.38, 7.6, -9.0), color: new THREE.Color('#FFA24A') },
      { pos: new THREE.Vector3(8.38, 7.6, -3.0), color: new THREE.Color('#FFA24A') },
    );

    for (let i = 0; i < pointLightCount; i++) {
      const pl = new THREE.PointLight('#FFA24A', 0.0, 9.0, 2.0);
      pl.castShadow = false;
      const anchor = this.lightAnchors[i % this.lightAnchors.length]!;
      pl.position.copy(anchor.pos);
      this.pointLights.push(pl);
      scene.add(pl);
    }

    // 4. Shadow Configuration
    if (this.shadowTier === 'desktop-high' && camera) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      try {
        this.csm = new CSM({
          maxFar: 140,
          cascades: 3,
          mode: 'practical',
          parent: scene,
          shadowMapSize: 2048,
          shadowBias: -0.0003,
          lightDirection: initialSky.keyLightDirection.clone().negate(),
          camera,
        });
        this.csm.fade = true;
        // Key light shadows are managed by CSM cascades on desktop-high
        this.keyLight.castShadow = false;
      } catch {
        // Fallback to single shadow map if CSM setup encounters issue
        this.setupSingleShadowMap(renderer, 2048, 50);
      }
    } else if (this.shadowTier === 'desktop-mid') {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.setupSingleShadowMap(renderer, 2048, 50);
    } else if (this.shadowTier === 'phone-high') {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      this.setupSingleShadowMap(renderer, 1024, 30);
    } else {
      renderer.shadowMap.enabled = false;
      this.keyLight.castShadow = false;
    }

    // 5. Cached radial-gradient texture & 1-draw-call InstancedMesh AO decals
    this.aoTexture = createRadialAoTexture();
    this.aoMaterial = new THREE.MeshBasicMaterial({
      map: this.aoTexture,
      transparent: true,
      blending: THREE.NormalBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -2,
    });
    this.aoDecals = createInstancedAoDecals(this.aoMaterial);
    scene.add(this.aoDecals);

    // 6. PMREM Environment Map
    this.pmremGenerator = new THREE.PMREMGenerator(renderer);
    this.pmremGenerator.compileEquirectangularShader();

    if (this.isLowTier) {
      const roomEnv = new RoomEnvironment();
      this.envRenderTarget = this.pmremGenerator.fromScene(roomEnv, 0.04);
      scene.environment = this.envRenderTarget.texture;
      disposeObject3D(roomEnv);
      roomEnv.dispose();
    } else {
      this.initMiniSkyScene(initialSky);
      this.regenerateProceduralPmrem(scene, initialSky, 0);
    }

    this.syncSkyState(scene, initialSky, true);
  }

  private setupSingleShadowMap(
    renderer: THREE.WebGLRenderer,
    mapSize: number,
    boxSize: number,
  ): void {
    renderer.shadowMap.enabled = true;
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(mapSize, mapSize);
    this.keyLight.shadow.bias = -0.00035;
    this.keyLight.shadow.normalBias = 0.025;
    this.keyLight.shadow.radius = 2.0;

    const half = boxSize * 0.5;
    const cam = this.keyLight.shadow.camera;
    cam.left = -half;
    cam.right = half;
    cam.top = half;
    cam.bottom = -half;
    cam.near = 5;
    cam.far = 220;
    cam.updateProjectionMatrix();
  }

  setupMaterialWithCSM(material: THREE.Material): void {
    if (this.csm) {
      this.csm.setupMaterial(material);
    }
  }

  private initMiniSkyScene(initialSky: TimeOfDayState): void {
    this.miniSkyScene = new THREE.Scene();
    this.miniSkyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uHorizon: { value: initialSky.hemiSky.clone() },
        uZenith: { value: initialSky.fillColor.clone() },
        uGround: { value: initialSky.hemiGround.clone() },
        uSunDir: { value: initialSky.sunDirection.clone() },
        uSunColor: { value: initialSky.keyColor.clone() },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uHorizon;
        uniform vec3 uZenith;
        uniform vec3 uGround;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        varying vec3 vDir;

        void main() {
          vec3 d = normalize(vDir);
          float y = d.y;
          vec3 skyCol;
          if (y < 0.0) {
            skyCol = mix(uHorizon, uGround, smoothstep(0.0, -0.45, y));
          } else {
            skyCol = mix(uHorizon, uZenith, smoothstep(0.05, 0.90, y));
          }
          float sunDot = max(0.0, dot(d, normalize(uSunDir)));
          skyCol += uSunColor * pow(sunDot, 24.0) * 0.55;
          gl_FragColor = vec4(skyCol, 1.0);
        }
      `,
    });
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(12, 16, 12),
      this.miniSkyMat,
    );
    this.miniSkyScene.add(dome);
  }

  private regenerateProceduralPmrem(
    scene: THREE.Scene,
    skyState: TimeOfDayState,
    elapsedSec: number,
  ): void {
    if (!this.pmremGenerator || !this.miniSkyScene || !this.miniSkyMat) return;

    (this.miniSkyMat.uniforms.uHorizon!.value as THREE.Color).copy(
      skyState.hemiSky,
    );
    (this.miniSkyMat.uniforms.uZenith!.value as THREE.Color).copy(
      skyState.fillColor,
    );
    (this.miniSkyMat.uniforms.uGround!.value as THREE.Color).copy(
      skyState.hemiGround,
    );
    (this.miniSkyMat.uniforms.uSunDir!.value as THREE.Vector3).copy(
      skyState.sunDirection,
    );
    (this.miniSkyMat.uniforms.uSunColor!.value as THREE.Color).copy(
      skyState.keyColor,
    );

    const nextTarget = this.pmremGenerator.fromScene(this.miniSkyScene, 0.04);
    if (this.envRenderTarget) {
      this.envRenderTarget.dispose();
    }
    this.envRenderTarget = nextTarget;
    scene.environment = this.envRenderTarget.texture;

    this.lastEnvRegenHour = skyState.hour;
    this.lastEnvRegenElapsed = elapsedSec;
  }

  private syncSkyState(
    scene: THREE.Scene,
    skyState: TimeOfDayState,
    force: boolean,
  ): void {
    const rawDiff = Math.abs(skyState.hour - this.lastLightSyncHour);
    const wrappedDiff =
      this.lastLightSyncHour < 0 ? Infinity : Math.min(rawDiff, 24 - rawDiff);
    if (!force && wrappedDiff < 0.01) return;
    this.lastLightSyncHour = skyState.hour;

    // 1. Key DirectionalLight
    this.keyLight.color.copy(skyState.keyColor);
    this.keyLight.intensity = skyState.keyIntensity;

    // 2. Fill DirectionalLight
    this.fillLight.color.copy(skyState.fillColor);
    this.fillLight.intensity = skyState.fillIntensity;

    // 3. HemisphereLight
    this.hemiLight.color.copy(skyState.hemiSky);
    this.hemiLight.groundColor.copy(skyState.hemiGround);
    this.hemiLight.intensity = skyState.hemiIntensity;

    // Environment reflection intensity
    const sunElev = Math.max(0, skyState.sunDirection.y);
    scene.environmentIntensity = 0.52 + sunElev * 0.32;

    // Shadow strength: 0.85 at noon, 1.0 at golden hour
    const h = skyState.hour;
    let shadowStrength: number;
    if (h >= 15.0 && h <= 18.0) {
      // Golden hour: deep rich contrast
      shadowStrength = 1.0;
    } else if (h >= 10.5 && h <= 13.5) {
      // High noon: slightly softer overhead
      shadowStrength = 0.85;
    } else {
      const t = Math.min(1, Math.abs(h - 12.0) / 4.5);
      shadowStrength = 0.85 + t * 0.15;
    }

    if (this.keyLight.castShadow) {
      this.keyLight.shadow.intensity = shadowStrength;
    }
    if (this.csm) {
      this.csm.lightDirection.copy(skyState.keyLightDirection).negate();
      for (const light of this.csm.lights) {
        light.color.copy(skyState.keyColor);
        light.intensity = skyState.keyIntensity;
        light.shadow.intensity = shadowStrength;
      }
    }
  }

  createCharacterBlobShadow(radius = 0.65): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(radius * 2, radius * 2);
    geo.rotateX(-Math.PI * 0.5);
    const mesh = new THREE.Mesh(geo, this.aoMaterial);
    mesh.renderOrder = 2;
    return mesh;
  }

  update(
    dt: number,
    elapsedSec: number,
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    skyState: TimeOfDayState,
    cameraTarget: THREE.Vector3,
    force = false,
  ): void {
    this.syncSkyState(scene, skyState, force);

    // Update lights to follow camera target
    this.keyLight.target.position.copy(cameraTarget);
    this.keyLight.target.updateMatrixWorld();
    this.keyLight.position
      .copy(cameraTarget)
      .addScaledVector(skyState.keyLightDirection, 110);

    this.fillLight.position
      .copy(cameraTarget)
      .addScaledVector(skyState.fillLightDirection, 90);

    if (this.csm) {
      this.csm.update();
    }

    // Smooth exposure transitions
    if (force || Math.abs(skyState.exposure - this.smoothedExposure) > 0.15) {
      this.smoothedExposure = skyState.exposure;
    } else {
      const alpha = 1 - Math.exp(-Math.max(0.001, dt) * 4.5);
      this.smoothedExposure +=
        (skyState.exposure - this.smoothedExposure) * alpha;
    }
    renderer.toneMappingExposure = this.smoothedExposure;

    // Reassign PointLight pool every 0.5 s to the nearest lantern/brazier anchors
    if (force || elapsedSec - this.lastPointLightUpdateElapsed >= 0.5) {
      this.lastPointLightUpdateElapsed = elapsedSec;
      const h = skyState.hour;
      const isDay = h >= 8.5 && h <= 16.2;
      const baseIntensity = isDay ? 0.35 : 1.85;

      // Sort anchors by squared distance to cameraTarget
      const sorted = [...this.lightAnchors].sort(
        (a, b) => a.pos.distanceToSquared(cameraTarget) - b.pos.distanceToSquared(cameraTarget),
      );
      for (let i = 0; i < this.pointLights.length; i++) {
        const pl = this.pointLights[i]!;
        const anchor = sorted[i];
        if (anchor) {
          pl.position.copy(anchor.pos);
          pl.color.copy(anchor.color);
          const dist = anchor.pos.distanceTo(cameraTarget);
          const fade = Math.max(0, 1 - Math.max(0, dist - 22) / 18);
          pl.intensity = baseIntensity * fade;
        }
      }
    }

    // PMREM environment update
    const elapsedSinceRegen = elapsedSec - this.lastEnvRegenElapsed;
    if (
      shouldRegeneratePmrem(
        this.isLowTier,
        elapsedSinceRegen,
        skyState.hour,
        this.lastEnvRegenHour,
      )
    ) {
      this.regenerateProceduralPmrem(scene, skyState, elapsedSec);
    }
  }

  dispose(scene: THREE.Scene): void {
    if (this.csm) {
      this.csm.dispose();
      this.csm = null;
    }
    if (scene.environment) {
      scene.environment = null;
    }
    if (this.envRenderTarget) {
      this.envRenderTarget.dispose();
      this.envRenderTarget = null;
    }
    if (this.miniSkyScene) {
      disposeObject3D(this.miniSkyScene);
      this.miniSkyScene = null;
      this.miniSkyMat = null;
    }
    if (this.pmremGenerator) {
      this.pmremGenerator.dispose();
      this.pmremGenerator = null;
    }

    this.aoDecals.removeFromParent();
    this.aoDecals.geometry.dispose();
    this.aoMaterial.dispose();
    this.aoTexture.dispose();

    this.keyLight.removeFromParent();
    this.keyLight.target.removeFromParent();
    this.keyLight.dispose();

    this.fillLight.removeFromParent();
    this.fillLight.dispose();

    this.hemiLight.removeFromParent();
    this.hemiLight.dispose();

    for (const pl of this.pointLights) {
      pl.removeFromParent();
      pl.dispose();
    }
  }
}
