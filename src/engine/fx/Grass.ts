import * as THREE from 'three';
import { disposeObject3D } from '@/engine/core/Disposables';
import type { TimeOfDayState } from '@/engine/world/sky';
import type { WindUniforms } from '@/engine/fx/Wind';
import { WIND_GLSL_PARS } from '@/engine/fx/Wind';
import {
  terrainHeight,
  terrainGradient,
  pathDistance,
  streamDistance,
} from '@/engine/world/terrain';
import { ISLANDS, type IslandKey, islandRadiusAtAngle } from '@/engine/world/layout';

export interface GrassTierConfig {
  maxVisibleBlades: number;
  cellBladeLimit: number;
}

const TIER_CONFIGS: Record<string, GrassTierConfig> = {
  'desktop-high': { maxVisibleBlades: 120000, cellBladeLimit: 6000 },
  'desktop-mid': { maxVisibleBlades: 70000, cellBladeLimit: 3800 },
  'phone-high': { maxVisibleBlades: 28000, cellBladeLimit: 1600 },
  'phone-mid': { maxVisibleBlades: 14000, cellBladeLimit: 900 },
  low: { maxVisibleBlades: 0, cellBladeLimit: 0 },
};

interface GrassCell {
  key: string;
  cx: number;
  cz: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  built: boolean;
  mesh: THREE.InstancedMesh | null;
  boundingSphere: THREE.Sphere;
  bladeCount: number;
}

export class GrassSystem extends THREE.Group {
  override readonly name = 'GrassSystem';

  private material: THREE.ShaderMaterial | null = null;
  private bladeGeo: THREE.InstancedBufferGeometry | null = null;
  private cells = new Map<string, GrassCell>();
  private buildQueue: GrassCell[] = [];
  private tierConfig: GrassTierConfig;
  private cameraFrustum = new THREE.Frustum();
  private projScreenMatrix = new THREE.Matrix4();

  visibleBladeCount = 0;

  get bladeBudget(): number {
    return this.tierConfig.maxVisibleBlades;
  }

  get bladeGeometry(): THREE.InstancedBufferGeometry | null {
    return this.bladeGeo;
  }

  get chunks(): Map<string, GrassCell> {
    return this.cells;
  }

  constructor(windUniforms: WindUniforms, tierKey = 'desktop-high') {
    super();
    this.tierConfig = TIER_CONFIGS[tierKey] || TIER_CONFIGS['desktop-high']!;
    if (this.tierConfig.maxVisibleBlades > 0) {
      this.initGrass(windUniforms);
    }
  }

  private initGrass(windUniforms: WindUniforms): void {
    // 1. Blade Geometry: 5 vertices (bent tapered strip)
    // 0: base left, 1: base right, 2: mid left, 3: mid right, 4: tip
    const positions = new Float32Array([
      -0.5, 0.0, 0.0,
       0.5, 0.0, 0.0,
      -0.35, 0.5, 0.25,
       0.35, 0.5, 0.25,
       0.0, 1.0, 0.75,
    ]);
    const uvs = new Float32Array([
      0.0, 0.0,
      1.0, 0.0,
      0.15, 0.5,
      0.85, 0.5,
      0.5, 1.0,
    ]);
    const indices = [0, 1, 2, 2, 1, 3, 2, 3, 4];

    this.bladeGeo = new THREE.InstancedBufferGeometry();
    this.bladeGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.bladeGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    this.bladeGeo.setIndex(indices);
    this.bladeGeo.computeVertexNormals();

    // 2. Custom Grass Material
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uWindDir: windUniforms.uWindDir,
        uWindStrength: windUniforms.uWindStrength,
        uGust: windUniforms.uGust,
        uTime: windUniforms.uTime,
        uPushPoints: windUniforms.uPushPoints,
        uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.3) },
        uSunColor: { value: new THREE.Color('#FFF5EA') },
        uGoldenHour: { value: 0.0 },
      },
      vertexShader: /* glsl */ `
        attribute vec3 aPosition;
        attribute float aYaw;
        attribute float aHeight;
        attribute float aWidth;
        attribute float aColorVar;
        attribute float aBend;

        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        varying float vColorVar;

        ${WIND_GLSL_PARS}

        void main() {
          vUv = uv;
          vColorVar = aColorVar;

          // Scale blade dimensions
          vec3 localPos = position;
          localPos.x *= aWidth;
          localPos.y *= aHeight;
          localPos.z *= aBend;

          // Yaw rotation around Y
          float cosY = cos(aYaw);
          float sinY = sin(aYaw);
          vec3 rotatedPos = vec3(
            localPos.x * cosY - localPos.z * sinY,
            localPos.y,
            localPos.x * sinY + localPos.z * cosY
          );

          vec3 baseWorldPos = aPosition;
          vec3 worldPos = baseWorldPos + rotatedPos;

          // Quadratic bend and wind sway along blade height
          float v = uv.y;
          vec3 windOffset = evaluateWindOffset(baseWorldPos, v);
          worldPos += windOffset * aHeight;

          vWorldPos = worldPos;
          vNormal = normalize(vec3(0.0, 1.0, 0.35));

          gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform float uGoldenHour;

        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        varying float vColorVar;

        void main() {
          // Base to tip gradient
          vec3 shadowBase = vec3(0.12, 0.20, 0.07);
          vec3 litGrass = mix(vec3(0.35, 0.55, 0.22), vec3(0.48, 0.68, 0.28), vColorVar);
          vec3 bladeColor = mix(shadowBase, litGrass, smoothstep(0.05, 0.95, vUv.y));

          // Golden hour warm gold vs purple shade
          vec3 goldenTint = vec3(0.85, 0.72, 0.35);
          bladeColor = mix(bladeColor, bladeColor * goldenTint, uGoldenHour * 0.45);

          // Backlight forward scatter glow against low sun
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          vec3 lightDir = normalize(uSunDir);
          float backlight = pow(max(0.0, dot(viewDir, -lightDir)), 2.5) * 0.45;
          bladeColor += uSunColor * backlight * vUv.y * 0.75;

          gl_FragColor = vec4(bladeColor, 1.0);
        }
      `,
      side: THREE.DoubleSide,
    });
  }

  update(
    _dt: number,
    _elapsed: number,
    camera: THREE.PerspectiveCamera,
    focusPos: THREE.Vector3,
    skyState?: TimeOfDayState,
  ): void {
    if (this.tierConfig.maxVisibleBlades === 0) return;

    if (this.material && skyState) {
      this.material.uniforms.uSunDir!.value.copy(skyState.keyLightDirection);
      this.material.uniforms.uSunColor!.value.copy(skyState.keyColor);

      // Golden hour uniform
      const h = skyState.hour;
      const isGolden = h >= 16.0 && h <= 18.2;
      this.material.uniforms.uGoldenHour!.value = isGolden
        ? Math.sin(((h - 16.0) / 2.2) * Math.PI)
        : 0.0;
    }

    // Update Frustum for culling
    this.projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.cameraFrustum.setFromProjectionMatrix(this.projScreenMatrix);

    // Ensure chunks around focus (radius 60 m) exist
    this.ensureCellsAroundFocus(focusPos.x, focusPos.z);

    // Process build queue (time-sliced: <= 3 ms per frame)
    this.processBuildQueue();

    // Frustum culling and visible blade budget enforcement
    let visibleCount = 0;
    for (const cell of this.cells.values()) {
      if (!cell.built || !cell.mesh) continue;

      const inFrustum = this.cameraFrustum.intersectsSphere(cell.boundingSphere);
      const dist = Math.hypot(cell.cx - focusPos.x, cell.cz - focusPos.z);

      if (inFrustum && dist <= 60.0 && visibleCount + cell.bladeCount <= this.tierConfig.maxVisibleBlades) {
        cell.mesh.visible = true;
        visibleCount += cell.bladeCount;
      } else {
        cell.mesh.visible = false;
      }
    }

    this.visibleBladeCount = visibleCount;
  }

  private ensureCellsAroundFocus(fx: number, fz: number): void {
    const cellSize = 16;
    const radius = 60;
    const minGridX = Math.floor((fx - radius) / cellSize);
    const maxGridX = Math.floor((fx + radius) / cellSize);
    const minGridZ = Math.floor((fz - radius) / cellSize);
    const maxGridZ = Math.floor((fz + radius) / cellSize);

    for (let gx = minGridX; gx <= maxGridX; gx++) {
      for (let gz = minGridZ; gz <= maxGridZ; gz++) {
        const key = `${gx}_${gz}`;
        if (this.cells.has(key)) continue;

        const cx = (gx + 0.5) * cellSize;
        const cz = (gz + 0.5) * cellSize;
        const dist = Math.hypot(cx - fx, cz - fz);
        if (dist > radius + 12) continue;

        const minX = gx * cellSize;
        const maxX = minX + cellSize;
        const minZ = gz * cellSize;
        const maxZ = minZ + cellSize;
        const midY = terrainHeight(cx, cz);

        const cell: GrassCell = {
          key,
          cx,
          cz,
          minX,
          maxX,
          minZ,
          maxZ,
          built: false,
          mesh: null,
          boundingSphere: new THREE.Sphere(new THREE.Vector3(cx, midY + 0.4, cz), 12.0),
          bladeCount: 0,
        };

        this.cells.set(key, cell);
        this.buildQueue.push(cell);
      }
    }
  }

  private processBuildQueue(): void {
    if (this.buildQueue.length === 0) return;
    const t0 = performance.now();

    while (this.buildQueue.length > 0 && performance.now() - t0 < 3.0) {
      const cell = this.buildQueue.shift()!;
      if (!cell.built) {
        this.buildCell(cell);
      }
    }
  }

  private buildCell(cell: GrassCell): void {
    if (!this.bladeGeo || !this.material) return;

    const blades: Array<{
      x: number;
      y: number;
      z: number;
      yaw: number;
      height: number;
      width: number;
      colorVar: number;
      bend: number;
    }> = [];

    const step = this.tierConfig.maxVisibleBlades > 50000 ? 0.32 : 0.55;
    const islandKeys: IslandKey[] = ['A', 'B', 'C'];

    for (let x = cell.minX; x < cell.maxX; x += step) {
      for (let z = cell.minZ; z < cell.maxZ; z += step) {
        // Jitter
        const jx = x + (Math.sin(x * 12.5 + z * 4.2) * 0.5 + 0.5) * step;
        const jz = z + (Math.cos(x * 3.7 - z * 8.1) * 0.5 + 0.5) * step;

        // Check if on any reachable island
        let onIsland = false;
        for (const k of islandKeys) {
          const isl = ISLANDS[k];
          const dx = jx - isl.center.x;
          const dz = jz - isl.center.z;
          const dist = Math.hypot(dx, dz);
          const theta = Math.atan2(dz, dx);
          const rTheta = islandRadiusAtAngle(k, isl.radius, theta);
          const t = dist / rTheta;
          if (t <= 0.86) {
            onIsland = true;
            break;
          }
        }
        if (!onIsland) continue;

        // Slope check
        const grad = terrainGradient(jx, jz);
        if (grad.slopeDeg > 24.0) continue;

        // Path check: thin or skip
        const pDist = pathDistance(jx, jz);
        if (pDist < 1.3) continue;
        if (pDist < 2.0 && Math.sin(jx * 7.0 + jz * 5.0) > 0.0) continue;

        // Water check: pond basin & stream channel
        const pondDist = Math.hypot(jx - (-9), jz - (-4));
        if (pondDist < 4.8) continue;
        const sDist = streamDistance(jx, jz);
        if (sDist < 1.1) continue;

        // Density enhancement near pond rim and under trees
        const nearPondRim = pondDist >= 4.8 && pondDist <= 7.2;
        const height = (0.28 + ((Math.sin(jx * 2.1 + jz * 1.8) * 0.5 + 0.5) * 0.28)) * (nearPondRim ? 1.25 : 1.0);
        const y = terrainHeight(jx, jz);

        blades.push({
          x: jx,
          y,
          z: jz,
          yaw: Math.sin(jx * 3.1) * Math.PI,
          height,
          width: 0.045 + Math.cos(jz * 4.2) * 0.02,
          colorVar: Math.sin(jx * 1.5 + jz * 2.3) * 0.5 + 0.5,
          bend: 0.18 + Math.cos(jx * 2.7) * 0.12,
        });

        if (blades.length >= this.tierConfig.cellBladeLimit) break;
      }
      if (blades.length >= this.tierConfig.cellBladeLimit) break;
    }

    if (blades.length > 0) {
      const geo = this.bladeGeo.clone();
      const count = blades.length;

      const aPos = new Float32Array(count * 3);
      const aYaw = new Float32Array(count);
      const aHeight = new Float32Array(count);
      const aWidth = new Float32Array(count);
      const aColorVar = new Float32Array(count);
      const aBend = new Float32Array(count);

      for (let i = 0; i < count; i++) {
        const b = blades[i]!;
        aPos[i * 3] = b.x;
        aPos[i * 3 + 1] = b.y;
        aPos[i * 3 + 2] = b.z;

        aYaw[i] = b.yaw;
        aHeight[i] = b.height;
        aWidth[i] = b.width;
        aColorVar[i] = b.colorVar;
        aBend[i] = b.bend;
      }

      geo.setAttribute('aPosition', new THREE.InstancedBufferAttribute(aPos, 3));
      geo.setAttribute('aYaw', new THREE.InstancedBufferAttribute(aYaw, 1));
      geo.setAttribute('aHeight', new THREE.InstancedBufferAttribute(aHeight, 1));
      geo.setAttribute('aWidth', new THREE.InstancedBufferAttribute(aWidth, 1));
      geo.setAttribute('aColorVar', new THREE.InstancedBufferAttribute(aColorVar, 1));
      geo.setAttribute('aBend', new THREE.InstancedBufferAttribute(aBend, 1));

      const mesh = new THREE.InstancedMesh(geo, this.material, count);
      mesh.name = `GrassCell_${cell.key}`;
      mesh.frustumCulled = false; // We perform our own sphere culling

      // Identity instance matrices
      const dummy = new THREE.Object3D();
      for (let i = 0; i < count; i++) {
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;

      this.add(mesh);
      cell.mesh = mesh;
      cell.bladeCount = count;
    }

    cell.built = true;
  }

  override dispose(): void {
    for (const cell of this.cells.values()) {
      if (cell.mesh) {
        cell.mesh.geometry.dispose();
        cell.mesh.removeFromParent();
        cell.mesh = null;
      }
    }
    this.cells.clear();
    this.buildQueue = [];

    if (this.bladeGeo) {
      this.bladeGeo.dispose();
      this.bladeGeo = null;
    }
    if (this.material) {
      this.material.dispose();
      this.material = null;
    }
    disposeObject3D(this);
  }
}
