import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { disposeObject3D } from '@/engine/core/Disposables';
import type { AssetStore } from '@/engine/core/AssetStore';
import type { TimeOfDayState } from '@/engine/world/sky';
import type { WindUniforms } from '@/engine/fx/Wind';
import { WIND_GLSL_PARS } from '@/engine/fx/Wind';
import {
  pathDistance,
  streamDistance,
  terrainGradient,
  terrainHeight,
} from '@/engine/world/terrain';
import {
  createSeededRandom,
  ISLANDS,
  type IslandKey,
  islandRadiusAtAngle,
  OBSTACLES,
  PLATFORMS,
} from '@/engine/world/layout';

export type TreeSpecies = 'maple' | 'ginkgo' | 'wisteria' | 'pine' | 'bamboo';

export interface TreeInstanceData {
  species: TreeSpecies;
  island: IslandKey;
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
}

export interface TreeAuditMetrics {
  totalPlaced: number;
  slopeOver25Count: number;
  outsideRimCount: number;
  nearPathBuildingPondCount: number;
  belowRimHeightCount: number;
  lowLeafCardSpeciesCount: number;
  leafAtlasLoadFailures: number;
  minLeafCardsPerTree: number;
}

let cachedLeafAtlas: THREE.Texture | null = null;
let leafAtlasFailures = 0;

/**
 * Generates a synchronous 512x512 2x2 Leaf Atlas where each quadrant is a rich multi-leaf
 * foliage cluster with 35%..60% alpha coverage and crisp silhouette edges.
 */
function createLeafAtlas(): THREE.Texture {
  if (cachedLeafAtlas) return cachedLeafAtlas;

  if (typeof document === 'undefined') {
    const size = 64;
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const qx = ((x % 32) - 16) / 16;
        const qy = ((y % 32) - 16) / 16;
        const d = Math.hypot(qx, qy);
        const inside = d < 0.78 ? 255 : 0;
        const idx = (y * size + x) * 4;
        data[idx] = 235;
        data[idx + 1] = 220;
        data[idx + 2] = 205;
        data[idx + 3] = inside;
      }
    }
    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    cachedLeafAtlas = tex;
    return cachedLeafAtlas;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    leafAtlasFailures++;
    const fallback = new THREE.DataTexture(new Uint8Array(16 * 4).fill(255), 4, 4);
    cachedLeafAtlas = fallback;
    return fallback;
  }

  ctx.clearRect(0, 0, 512, 512);
  const rng = createSeededRandom(314159);

  // Helper to draw a palmate maple leaf at (cx, cy) with scale & angle
  const drawMapleLeaf = (cx: number, cy: number, scale: number, angle: number, color: string) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.scale(scale, scale);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, 42);
    ctx.bezierCurveTo(-14, 28, -24, 34, -42, 18);
    ctx.bezierCurveTo(-30, 8, -42, 4, -48, -16);
    ctx.bezierCurveTo(-30, -12, -28, -24, -26, -44);
    ctx.bezierCurveTo(-12, -32, -8, -38, 0, -52);
    ctx.bezierCurveTo(8, -38, 12, -32, 26, -44);
    ctx.bezierCurveTo(28, -24, 30, -12, 48, -16);
    ctx.bezierCurveTo(42, 4, 30, 8, 42, 18);
    ctx.bezierCurveTo(24, 34, 14, 28, 0, 42);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 220, 175, 0.45)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, 36);
    ctx.lineTo(0, -44);
    ctx.moveTo(0, 8);
    ctx.lineTo(-36, -12);
    ctx.moveTo(0, 8);
    ctx.lineTo(36, -12);
    ctx.stroke();
    ctx.restore();
  };

  // 1. Quadrant 0 (top-left 0..256, 0..256): Dense Maple branchlet cluster (16 leaves)
  const mapleColors = ['#E85820', '#D9411A', '#F27430', '#C43218'];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + (rng() - 0.5) * 0.25;
    const r = (i < 4 ? 22 : 58) + (rng() - 0.5) * 20;
    const lx = 128 + Math.cos(a) * r;
    const ly = 128 + Math.sin(a) * r;
    const sc = 0.72 + rng() * 0.35;
    drawMapleLeaf(lx, ly, sc, a + Math.PI * 0.5 + (rng() - 0.5) * 0.5, mapleColors[i % mapleColors.length]!);
  }

  // 2. Quadrant 1 (top-right 256..512, 0..256): Dense Ginkgo fan cluster (16 fan leaves)
  const ginkgoColors = ['#F2C632', '#E5B21E', '#F8D754', '#D69E14'];
  const drawGinkgoLeaf = (cx: number, cy: number, scale: number, angle: number, color: string) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.scale(scale, scale);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, 38);
    ctx.lineTo(-5, 12);
    ctx.bezierCurveTo(-42, 8, -52, -24, -26, -46);
    ctx.bezierCurveTo(-10, -40, -3, -32, 0, -38);
    ctx.bezierCurveTo(3, -32, 10, -40, 26, -46);
    ctx.bezierCurveTo(52, -24, 42, 8, 5, 12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + (rng() - 0.5) * 0.25;
    const r = (i < 4 ? 24 : 56) + (rng() - 0.5) * 18;
    const lx = 384 + Math.cos(a) * r;
    const ly = 128 + Math.sin(a) * r;
    const sc = 0.78 + rng() * 0.34;
    drawGinkgoLeaf(lx, ly, sc, a + Math.PI * 0.5 + (rng() - 0.5) * 0.4, ginkgoColors[i % ginkgoColors.length]!);
  }

  // 3. Quadrant 2 (bottom-left 0..256, 256..512): Wisteria blossom racemes & foliage (5 hanging clusters)
  const wisteriaColors = ['#9B7BE0', '#B69EFF', '#D4C4FF', '#8462D2'];
  const racemeX = [72, 100, 128, 156, 184];
  for (let c = 0; c < racemeX.length; c++) {
    const rx = racemeX[c]!;
    for (let r = 0; r < 18; r++) {
      const ry = 292 + r * 10.5;
      const spread = Math.max(8, (1 - r / 20) * 26);
      for (let k = -1; k <= 1; k++) {
        ctx.fillStyle = wisteriaColors[(r + c + k + 4) % wisteriaColors.length]!;
        ctx.beginPath();
        const bx = rx + k * spread * 0.55 + (rng() - 0.5) * 6;
        const by = ry + (rng() - 0.5) * 4;
        ctx.ellipse(bx, by, 10 + rng() * 4, 8 + rng() * 3, (rng() - 0.5) * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // 4. Quadrant 3 (bottom-right 256..512, 256..512): Dense Pine / Cypress needle boughs
  const pineColors = ['#2C5E3B', '#387349', '#234C30', '#48875A'];
  for (let b = 0; b < 14; b++) {
    const ba = (b / 14) * Math.PI * 2;
    const br = b < 4 ? 22 : 56;
    const bx = 384 + Math.cos(ba) * br;
    const by = 384 + Math.sin(ba) * br;
    ctx.save();
    ctx.translate(bx, by);
    for (let n = 0; n < 18; n++) {
      const na = (n / 18) * Math.PI * 2 + b * 0.2;
      const len = 34 + (n % 3) * 10;
      ctx.fillStyle = pineColors[(b + n) % pineColors.length]!;
      ctx.beginPath();
      ctx.ellipse(
        Math.cos(na) * len * 0.45,
        Math.sin(na) * len * 0.45,
        len * 0.52,
        6.5,
        na,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.restore();
  }

  // Verify non-empty alpha coverage via 32x32 readback
  const imgData = ctx.getImageData(0, 0, 512, 512).data;
  let alphaPixels = 0;
  let totalSamples = 0;
  for (let y = 8; y < 512; y += 16) {
    for (let x = 8; x < 512; x += 16) {
      totalSamples++;
      const a = imgData[(y * 512 + x) * 4 + 3] ?? 0;
      if (a > 100) alphaPixels++;
    }
  }
  const coverage = alphaPixels / Math.max(1, totalSamples);
  if (coverage < 0.20) {
    leafAtlasFailures++;
  }

  cachedLeafAtlas = new THREE.CanvasTexture(canvas);
  cachedLeafAtlas.generateMipmaps = true;
  cachedLeafAtlas.colorSpace = THREE.SRGBColorSpace;
  cachedLeafAtlas.needsUpdate = true;
  return cachedLeafAtlas;
}

interface BranchEnd {
  pos: THREE.Vector3;
  rx: number;
  ry: number;
  rz: number;
}

interface TreeArchTemplate {
  trunkGeo: THREE.BufferGeometry;
  canopyGeo: THREE.BufferGeometry;
  crownGeo: THREE.BufferGeometry;
  leafCardCount: number;
}

export class TreeSystem extends THREE.Group {
  override readonly name = 'TreeSystem';

  private trunkMeshes = new Map<TreeSpecies, THREE.InstancedMesh>();
  private canopyMeshes = new Map<TreeSpecies, THREE.InstancedMesh>();
  private midLodMeshes = new Map<TreeSpecies, THREE.InstancedMesh>();
  private fallingLeavesMesh: THREE.InstancedMesh | null = null;

  private barkMaterial: THREE.MeshStandardMaterial | null = null;
  private leafMaterial: THREE.ShaderMaterial | null = null;
  private crownMaterial: THREE.MeshStandardMaterial | null = null;
  private leafParticlesMat: THREE.ShaderMaterial | null = null;

  private placements: TreeInstanceData[] = [];
  private speciesLeafCardCounts = new Map<TreeSpecies, number>();

  private fallingLeavesData: Array<{
    x: number;
    y: number;
    z: number;
    baseY: number;
    vx: number;
    vy: number;
    vz: number;
    rotX: number;
    rotY: number;
    rotZ: number;
    scale: number;
  }> = [];

  private isPhone: boolean;
  totalTreeCount = 0;

  get totalTrees(): number {
    return this.totalTreeCount;
  }

  get fallingLeaves(): THREE.InstancedMesh | null {
    return this.fallingLeavesMesh;
  }

  constructor(windUniforms: WindUniforms, assets?: AssetStore, isPhone = false) {
    super();
    this.isPhone = isPhone;
    this.buildTrees(windUniforms, assets);
  }

  private buildTrees(windUniforms: WindUniforms, assets?: AssetStore): void {
    const leafAtlas = createLeafAtlas();
    const barkSlot = assets?.getSlot('bark');

    // 1. Bark Material (warm dark brown #5B4030, wired to bark slot)
    const barkGain = barkSlot?.albedoGain ?? 1.0;
    const barkNorScale = 1.4;
    const barkNorY = barkSlot?.flipGreen ? -barkNorScale : barkNorScale;

    this.barkMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#5B4030').multiplyScalar(barkGain),
      roughness: 0.88,
      metalness: 0.02,
      map: barkSlot?.diff ?? null,
      normalMap: barkSlot?.nor ?? null,
      normalScale: new THREE.Vector2(barkNorScale, barkNorY),
    });
    if (barkSlot?.arm) {
      this.barkMaterial.roughnessMap = barkSlot.arm;
      this.barkMaterial.aoMap = barkSlot.arm;
      this.barkMaterial.aoMapIntensity = 0.75;
    }

    // 2. Foliage Leaf-Card ShaderMaterial with spherical clump normals, per-card color gradient & sun translucency
    this.leafMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uLeafAtlas: { value: leafAtlas },
        uWindDir: windUniforms.uWindDir,
        uWindStrength: windUniforms.uWindStrength,
        uGust: windUniforms.uGust,
        uTime: windUniforms.uTime,
        uPushPoints: windUniforms.uPushPoints,
        uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() },
        uSunColor: { value: new THREE.Color('#FFF5EA') },
        uAmbientColor: { value: new THREE.Color('#7C88B8') },
      },
      vertexShader: /* glsl */ `
        attribute float aUvSlot;
        attribute vec3 aClumpCenter;
        attribute vec3 aLeafTint;

        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        varying vec3 vLeafTint;

        ${WIND_GLSL_PARS}

        void main() {
          vLeafTint = aLeafTint;

          float slotIdx = min(aUvSlot, 3.0);
          vec2 atlasOffset = vec2(
            mod(slotIdx, 2.0) * 0.5,
            floor(slotIdx / 2.0) * 0.5
          );
          vUv = uv * 0.48 + atlasOffset + vec2(0.01);

          // Blend 72% spherical clump normal so canopy reads as a lush 3D cloud, never flat planes
          vec3 clumpNormal = normalize(position - aClumpCenter + vec3(0.0, 0.25, 0.0));
          vec3 localNorm = normalize(mix(normal, clumpNormal, 0.72));

          vec3 localPos = position;
          float heightFactor = clamp(localPos.y / 6.5, 0.0, 1.0);

          #ifdef USE_INSTANCING
            vec4 instWorldPos = instanceMatrix * vec4(localPos, 1.0);
            vec3 instWorldNorm = normalize(mat3(instanceMatrix) * localNorm);
          #else
            vec4 instWorldPos = vec4(localPos, 1.0);
            vec3 instWorldNorm = localNorm;
          #endif

          vec4 worldPos = modelMatrix * instWorldPos;
          vNormal = normalize(mat3(modelMatrix) * instWorldNorm);

          vec3 windOffset = evaluateWindOffset(worldPos.xyz, heightFactor);
          windOffset += vec3(
            sin(uTime * 5.2 + worldPos.x * 1.9 + localPos.y * 2.3) * 0.055,
            cos(uTime * 4.4 + worldPos.z * 1.9) * 0.035,
            sin(uTime * 4.8 + worldPos.y * 1.7 + worldPos.x) * 0.055
          ) * (uWindStrength + uGust * 0.45);

          worldPos.xyz += windOffset;
          vWorldPos = worldPos.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uLeafAtlas;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform vec3 uAmbientColor;

        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        varying vec3 vLeafTint;

        void main() {
          vec4 texColor = texture2D(uLeafAtlas, vUv);
          if (texColor.a < 0.42) discard;

          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          vec3 lightDir = normalize(uSunDir);
          vec3 norm = normalize(vNormal);

          // Soft wrapped sun diffuse + sky hemisphere fill
          float ndotl = clamp(dot(norm, lightDir) * 0.55 + 0.45, 0.0, 1.0);
          float skyUp = clamp(norm.y * 0.5 + 0.5, 0.0, 1.0);

          // Warm backlight translucency when looking toward the sun
          float backlight = pow(max(0.0, dot(viewDir, -lightDir)), 2.6) * 0.42;

          // Combine species gradient tint with subtle atlas detail variation
          float atlasDetail = mix(0.86, 1.14, dot(texColor.rgb, vec3(0.333)));
          vec3 baseAlbedo = vLeafTint * atlasDetail;

          vec3 directTerm = uSunColor * (ndotl * 0.82 + backlight);
          vec3 ambientTerm = mix(vec3(0.26, 0.24, 0.30), uAmbientColor, skyUp) * 0.52;
          vec3 litColor = baseAlbedo * (directTerm + ambientTerm);

          gl_FragColor = vec4(litColor, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
      side: THREE.DoubleSide,
      transparent: false,
      alphaTest: 0.42,
    });

    const grassSlot = assets?.getSlot('grass');
    this.crownMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#FFFFFF'),
      map: grassSlot?.diff ?? null,
      vertexColors: true,
      roughness: 0.78,
      metalness: 0.02,
    });

    // 3. Build multi-tier curved trunk & lush foliage templates per species
    const templates = new Map<TreeSpecies, TreeArchTemplate>();
    templates.set(
      'maple',
      this.buildSpeciesTemplate('maple', 6.4, 0, '#A8321E', '#E8601C', 101),
    );
    templates.set(
      'ginkgo',
      this.buildSpeciesTemplate('ginkgo', 7.4, 1, '#C99A1A', '#F0CB3C', 202),
    );
    templates.set(
      'wisteria',
      this.buildSpeciesTemplate('wisteria', 5.2, 2, '#7B5CC8', '#C7B2FF', 303),
    );
    templates.set(
      'pine',
      this.buildSpeciesTemplate('pine', 8.0, 3, '#24472F', '#3E7A4C', 404),
    );
    templates.set('bamboo', this.buildBambooTemplate());

    for (const [sp, tmpl] of templates) {
      this.speciesLeafCardCounts.set(sp, tmpl.leafCardCount);
    }

    // 4. Generate strictly validated placements across Islands A, B, C
    this.placements = this.generatePlacements();
    this.totalTreeCount = this.placements.length;

    const speciesList: TreeSpecies[] = ['maple', 'ginkgo', 'wisteria', 'pine', 'bamboo'];
    const bySpecies = new Map<TreeSpecies, TreeInstanceData[]>();
    for (const sp of speciesList) bySpecies.set(sp, []);
    for (const p of this.placements) bySpecies.get(p.species)!.push(p);

    const dummy = new THREE.Object3D();

    for (const sp of speciesList) {
      const list = bySpecies.get(sp)!;
      if (list.length === 0) continue;

      const tmpl = templates.get(sp)!;

      const tMesh = new THREE.InstancedMesh(tmpl.trunkGeo, this.barkMaterial, list.length);
      tMesh.name = `Trunk_${sp}`;
      tMesh.castShadow = true;
      tMesh.receiveShadow = true;

      const cMesh = new THREE.InstancedMesh(tmpl.canopyGeo, this.leafMaterial, list.length);
      cMesh.name = `Canopy_${sp}`;
      cMesh.castShadow = true;

      const crMesh = new THREE.InstancedMesh(tmpl.crownGeo, this.crownMaterial, list.length);
      crMesh.name = `Crown_${sp}`;
      crMesh.visible = false;

      for (let i = 0; i < list.length; i++) {
        const item = list[i]!;
        dummy.position.set(item.x, item.y, item.z);
        dummy.rotation.set(0, item.yaw, 0);
        dummy.scale.set(item.scale, item.scale, item.scale);
        dummy.updateMatrix();

        tMesh.setMatrixAt(i, dummy.matrix);
        cMesh.setMatrixAt(i, dummy.matrix);
        crMesh.setMatrixAt(i, dummy.matrix);
      }

      tMesh.instanceMatrix.needsUpdate = true;
      cMesh.instanceMatrix.needsUpdate = true;
      crMesh.instanceMatrix.needsUpdate = true;

      this.trunkMeshes.set(sp, tMesh);
      this.canopyMeshes.set(sp, cMesh);
      this.midLodMeshes.set(sp, crMesh);

      this.add(tMesh);
      this.add(cMesh);
      this.add(crMesh);
    }

    // 5. Falling leaves with soft alpha leaf silhouette (fixes D4 floating grey shards)
    this.buildFallingLeaves();
  }

  /**
   * Builds a tapered tube along a 3D CatmullRomCurve3 with root flare and metric bark UVs.
   */
  private buildTaperedCurveTube(
    curve: THREE.CatmullRomCurve3,
    rStart: number,
    rEnd: number,
    tubularSegs: number,
    radialSegs: number,
    isMainTrunk = false,
  ): THREE.BufferGeometry {
    const frames = curve.computeFrenetFrames(tubularSegs, false);
    const numVerts = (tubularSegs + 1) * (radialSegs + 1);
    const positions = new Float32Array(numVerts * 3);
    const normals = new Float32Array(numVerts * 3);
    const uvs = new Float32Array(numVerts * 2);
    const indices: number[] = [];

    const totalLen = curve.getLength();
    const pt = new THREE.Vector3();
    const norm = new THREE.Vector3();
    let vIdx = 0;

    for (let i = 0; i <= tubularSegs; i++) {
      const t = i / tubularSegs;
      curve.getPointAt(t, pt);
      const N = frames.normals[i]!;
      const B = frames.binormals[i]!;

      let radius = rStart * Math.pow(Math.max(0.05, rEnd / rStart), t);
      if (isMainTrunk && t < 0.16) {
        // Root flare at ground contact (1.6x base radius)
        const flareT = 1.0 - t / 0.16;
        radius *= 1.0 + flareT * flareT * 0.6;
      }

      for (let j = 0; j <= radialSegs; j++) {
        const u = j / radialSegs;
        const theta = u * Math.PI * 2;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);

        let localR = radius;
        if (isMainTrunk && t < 0.16) {
          const lobe = Math.cos(theta * 4.0) * 0.5 + 0.5;
          localR *= 1.0 + (1.0 - t / 0.16) * lobe * 0.22;
        }

        norm.set(0, 0, 0).addScaledVector(N, cosT).addScaledVector(B, sinT).normalize();

        positions[vIdx * 3] = pt.x + norm.x * localR;
        positions[vIdx * 3 + 1] = pt.y + norm.y * localR;
        positions[vIdx * 3 + 2] = pt.z + norm.z * localR;

        normals[vIdx * 3] = norm.x;
        normals[vIdx * 3 + 1] = norm.y;
        normals[vIdx * 3 + 2] = norm.z;

        uvs[vIdx * 2] = u * 2.0;
        uvs[vIdx * 2 + 1] = (t * totalLen) / 1.2;
        vIdx++;
      }
    }

    const stride = radialSegs + 1;
    for (let i = 0; i < tubularSegs; i++) {
      for (let j = 0; j < radialSegs; j++) {
        const a = i * stride + j;
        const b = (i + 1) * stride + j;
        const c = (i + 1) * stride + (j + 1);
        const d = i * stride + (j + 1);
        indices.push(a, b, d);
        indices.push(b, c, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    return geo;
  }

  private buildSpeciesTemplate(
    species: TreeSpecies,
    height: number,
    uvSlot: number,
    innerHex: string,
    outerHex: string,
    seed: number,
  ): TreeArchTemplate {
    const rng = createSeededRandom(seed);
    const woodParts: THREE.BufferGeometry[] = [];
    const branchEnds: BranchEnd[] = [];

    // Slender trunk: base radius = 0.036 * height
    const baseR = height * 0.036;
    const topR = baseR * 0.30;

    // Curved S-bend trunk (sink base -0.18m so roots are always embedded in soil)
    const leanX = (rng() - 0.5) * 0.55;
    const leanZ = (rng() - 0.5) * 0.55;
    const trunkCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.18, 0),
      new THREE.Vector3(leanX * 0.35, height * 0.28, leanZ * 0.35),
      new THREE.Vector3(-leanX * 0.25, height * 0.62, leanZ * 0.55),
      new THREE.Vector3(leanX * 0.45, height * 0.90, -leanZ * 0.25),
    ]);
    woodParts.push(this.buildTaperedCurveTube(trunkCurve, baseR, topR, 10, 8, true));

    // Summit canopy clump at top of trunk
    const trunkTop = trunkCurve.getPointAt(0.95);
    branchEnds.push({
      pos: trunkTop.clone().add(new THREE.Vector3(0, 0.35, 0)),
      rx: 1.55,
      ry: 1.05,
      rz: 1.55,
    });

    // Level 1 primary limbs (5 curved limbs emerging at 48%..84% trunk height)
    const l1Count = 5;
    for (let i = 0; i < l1Count; i++) {
      const tJoin = 0.48 + (i / (l1Count - 1)) * 0.36;
      const origin = trunkCurve.getPointAt(tJoin);
      const parentR = baseR * Math.pow(topR / baseR, tJoin);
      // Strictly <= 0.52 * parentRadius at join
      const l1RStart = parentR * 0.50;
      const l1REnd = l1RStart * 0.32;

      const azim = (i / l1Count) * Math.PI * 2 + (rng() - 0.5) * 0.35;
      const l1Len = height * (0.34 + (1.0 - tJoin) * 0.16);
      const dirX = Math.cos(azim);
      const dirZ = Math.sin(azim);

      const pMid = new THREE.Vector3(
        origin.x + dirX * l1Len * 0.52,
        origin.y + l1Len * (species === 'wisteria' ? 0.18 : 0.28),
        origin.z + dirZ * l1Len * 0.52,
      );
      const pEnd = new THREE.Vector3(
        origin.x + dirX * l1Len,
        origin.y + l1Len * (species === 'wisteria' ? 0.08 : 0.42),
        origin.z + dirZ * l1Len,
      );

      const l1Curve = new THREE.CatmullRomCurve3([origin, pMid, pEnd]);
      woodParts.push(this.buildTaperedCurveTube(l1Curve, l1RStart, l1REnd, 6, 6, false));

      branchEnds.push({
        pos: pEnd.clone(),
        rx: 1.45,
        ry: species === 'pine' ? 0.72 : 1.05,
        rz: 1.45,
      });

      // Level 2 secondary branches (2 per primary limb)
      const l2Count = 2;
      for (let j = 0; j < l2Count; j++) {
        const t2 = 0.48 + j * 0.32;
        const o2 = l1Curve.getPointAt(t2);
        const l1RAtJoin = l1RStart * Math.pow(l1REnd / l1RStart, t2);
        const l2RStart = l1RAtJoin * 0.50;
        const l2REnd = l2RStart * 0.35;

        const subAngle = azim + (j === 0 ? -0.62 : 0.62);
        const l2Len = l1Len * 0.55;
        const sMid = new THREE.Vector3(
          o2.x + Math.cos(subAngle) * l2Len * 0.5,
          o2.y + l2Len * 0.22,
          o2.z + Math.sin(subAngle) * l2Len * 0.5,
        );
        const sEnd = new THREE.Vector3(
          o2.x + Math.cos(subAngle) * l2Len,
          o2.y + l2Len * (species === 'wisteria' ? 0.05 : 0.36),
          o2.z + Math.sin(subAngle) * l2Len,
        );
        const l2Curve = new THREE.CatmullRomCurve3([o2, sMid, sEnd]);
        woodParts.push(this.buildTaperedCurveTube(l2Curve, l2RStart, l2REnd, 4, 5, false));

        if (j === 0) {
          branchEnds.push({
            pos: sEnd.clone(),
            rx: 1.25,
            ry: species === 'pine' ? 0.65 : 0.92,
            rz: 1.25,
          });
        }
      }
    }

    const trunkGeo = mergeGeometries(woodParts, false)!;
    for (const p of woodParts) p.dispose();

    // Build lush multi-clump leaf-card canopy at branch ends
    // Desktop: 11 branches * 14 cards = 154 cards per tree; Phone: 11 * 7 = 77 cards per tree
    const cardsPerClump = this.isPhone ? 7 : 14;
    const { geo: canopyGeo, cardCount } = this.createRichCanopyGeometry(
      uvSlot,
      branchEnds,
      cardsPerClump,
      innerHex,
      outerHex,
      seed + 50,
    );

    const crownGeo = this.createMultiBlobCrownGeometry(branchEnds, innerHex, outerHex);

    return {
      trunkGeo,
      canopyGeo,
      crownGeo,
      leafCardCount: cardCount,
    };
  }

  private createRichCanopyGeometry(
    uvSlot: number,
    clumps: BranchEnd[],
    cardsPerClump: number,
    innerHex: string,
    outerHex: string,
    seed: number,
  ): { geo: THREE.BufferGeometry; cardCount: number } {
    const rng = createSeededRandom(seed);
    const totalCards = clumps.length * cardsPerClump;
    const totalVerts = totalCards * 4;
    const totalIndices = totalCards * 6;

    const positions = new Float32Array(totalVerts * 3);
    const normals = new Float32Array(totalVerts * 3);
    const uvs = new Float32Array(totalVerts * 2);
    const uvSlots = new Float32Array(totalVerts);
    const clumpCentersArr = new Float32Array(totalVerts * 3);
    const leafTints = new Float32Array(totalVerts * 3);
    const indices = new Uint32Array(totalIndices);

    const cInner = new THREE.Color(innerHex);
    const cOuter = new THREE.Color(outerHex);
    const cardColor = new THREE.Color();

    const rotMat = new THREE.Matrix4();
    const euler = new THREE.Euler();
    const corner = new THREE.Vector3();
    const norm = new THREE.Vector3();

    let vIdx = 0;
    let iIdx = 0;

    for (let c = 0; c < clumps.length; c++) {
      const clump = clumps[c]!;
      for (let k = 0; k < cardsPerClump; k++) {
        // Golden-angle distribution inside ellipsoid clump
        const phi = k * 2.3999632 + c * 0.7;
        const radialFrac = Math.sqrt((k + 0.5) / cardsPerClump);
        const yOff = (rng() - 0.42) * clump.ry;
        const rHoriz = Math.sqrt(Math.max(0.05, 1.0 - (yOff / clump.ry) ** 2)) * radialFrac;

        const cx = clump.pos.x + Math.cos(phi) * rHoriz * clump.rx;
        const cy = clump.pos.y + yOff;
        const cz = clump.pos.z + Math.sin(phi) * rHoriz * clump.rz;

        // Card half-size 0.42..0.52m (0.84..1.04m full card width) so cards overlap into a continuous lush crown
        const halfW = 0.42 + rng() * 0.12;
        const halfH = 0.42 + rng() * 0.12;

        // Varied card orientation (crossed & tilted)
        const pitch = (rng() - 0.5) * 1.1;
        const yaw = phi + (k % 2 === 0 ? 0 : Math.PI * 0.5) + (rng() - 0.5) * 0.5;
        const roll = (rng() - 0.5) * 0.7;
        euler.set(pitch, yaw, roll, 'YXZ');
        rotMat.makeRotationFromEuler(euler);
        norm.set(0, 0, 1).applyMatrix4(rotMat);

        // Color gradient: deeper shade inside clump, sunlit tip color on outer/upper cards
        const sunwardT = Math.max(
          0,
          Math.min(1, 0.35 + radialFrac * 0.45 + (yOff / clump.ry) * 0.3 + (rng() - 0.5) * 0.15),
        );
        cardColor.copy(cInner).lerp(cOuter, sunwardT);

        const localCorners = [
          [-halfW, -halfH],
          [halfW, -halfH],
          [halfW, halfH],
          [-halfW, halfH],
        ];
        const localUvs = [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ];

        const vBase = vIdx;
        for (let j = 0; j < 4; j++) {
          corner.set(localCorners[j]![0]!, localCorners[j]![1]!, 0).applyMatrix4(rotMat);
          const idx3 = (vBase + j) * 3;
          const idx2 = (vBase + j) * 2;

          positions[idx3] = cx + corner.x;
          positions[idx3 + 1] = cy + corner.y;
          positions[idx3 + 2] = cz + corner.z;

          normals[idx3] = norm.x;
          normals[idx3 + 1] = norm.y;
          normals[idx3 + 2] = norm.z;

          uvs[idx2] = localUvs[j]![0]!;
          uvs[idx2 + 1] = localUvs[j]![1]!;

          uvSlots[vBase + j] = uvSlot;

          clumpCentersArr[idx3] = clump.pos.x;
          clumpCentersArr[idx3 + 1] = clump.pos.y;
          clumpCentersArr[idx3 + 2] = clump.pos.z;

          leafTints[idx3] = cardColor.r;
          leafTints[idx3 + 1] = cardColor.g;
          leafTints[idx3 + 2] = cardColor.b;
        }

        indices[iIdx++] = vBase;
        indices[iIdx++] = vBase + 1;
        indices[iIdx++] = vBase + 2;
        indices[iIdx++] = vBase;
        indices[iIdx++] = vBase + 2;
        indices[iIdx++] = vBase + 3;

        vIdx += 4;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setAttribute('aUvSlot', new THREE.BufferAttribute(uvSlots, 1));
    geo.setAttribute('aClumpCenter', new THREE.BufferAttribute(clumpCentersArr, 3));
    geo.setAttribute('aLeafTint', new THREE.BufferAttribute(leafTints, 3));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));

    return { geo, cardCount: totalCards };
  }

  private buildBambooTemplate(): TreeArchTemplate {
    const parts: THREE.BufferGeometry[] = [];
    const clumpEnds: BranchEnd[] = [];
    const stalkCount = 6;

    for (let i = 0; i < stalkCount; i++) {
      const h = 5.4 + (i % 3) * 0.75;
      const r = 0.048;
      const angle = (i / stalkCount) * Math.PI * 2;
      const dist = 0.18 + (i % 2) * 0.16;
      const ox = Math.cos(angle) * dist;
      const oz = Math.sin(angle) * dist;
      const lean = 0.25 + (i % 3) * 0.08;

      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(ox, -0.12, oz),
        new THREE.Vector3(ox + Math.cos(angle) * lean * 0.4, h * 0.5, oz + Math.sin(angle) * lean * 0.4),
        new THREE.Vector3(ox + Math.cos(angle) * lean, h, oz + Math.sin(angle) * lean),
      ]);
      parts.push(this.buildTaperedCurveTube(curve, r, r * 0.55, 8, 6, false));

      clumpEnds.push({
        pos: curve.getPointAt(0.88),
        rx: 0.95,
        ry: 0.85,
        rz: 0.95,
      });
    }

    const trunkGeo = mergeGeometries(parts, false)!;
    for (const p of parts) p.dispose();

    const cardsPerStalk = this.isPhone ? 11 : 18;
    const { geo: canopyGeo, cardCount } = this.createRichCanopyGeometry(
      3,
      clumpEnds,
      cardsPerStalk,
      '#5E8C3A',
      '#9BC05A',
      505,
    );
    const crownGeo = this.createMultiBlobCrownGeometry(clumpEnds, '#5E8C3A', '#9BC05A');

    return {
      trunkGeo,
      canopyGeo,
      crownGeo,
      leafCardCount: cardCount,
    };
  }

  /**
   * Builds a multi-blob vertex-colored distant LOD canopy cluster seated on the branch ends
   * (never a single rock ball on a pole — fixes D2).
   */
  private createMultiBlobCrownGeometry(
    clumps: BranchEnd[],
    innerHex: string,
    outerHex: string,
  ): THREE.BufferGeometry {
    const blobs: THREE.BufferGeometry[] = [];
    const cInner = new THREE.Color(innerHex);
    const cOuter = new THREE.Color(outerHex);
    const col = new THREE.Color();

    const limit = Math.min(7, clumps.length);
    for (let i = 0; i < limit; i++) {
      const cl = clumps[i]!;
      const g = new THREE.IcosahedronGeometry(1.0, 1);
      g.scale(cl.rx * 0.9, cl.ry * 0.85, cl.rz * 0.9);
      g.translate(cl.pos.x, cl.pos.y, cl.pos.z);

      const pos = g.attributes.position!;
      const colors = new Float32Array(pos.count * 3);
      for (let v = 0; v < pos.count; v++) {
        const y = pos.getY(v);
        const t = Math.max(0, Math.min(1, (y - (cl.pos.y - cl.ry)) / (cl.ry * 2)));
        col.copy(cInner).lerp(cOuter, t);
        colors[v * 3] = col.r;
        colors[v * 3 + 1] = col.g;
        colors[v * 3 + 2] = col.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      blobs.push(g);
    }

    const merged = mergeGeometries(blobs, false)!;
    for (const b of blobs) b.dispose();
    merged.computeVertexNormals();
    return merged;
  }

  private buildFallingLeaves(): void {
    const count = this.isPhone ? 60 : 160;
    const geo = new THREE.PlaneGeometry(0.065, 0.05);

    this.leafParticlesMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vColor;
        void main() {
          vUv = uv;
          #ifdef USE_INSTANCING_COLOR
            vColor = instanceColor;
          #else
            vColor = vec3(0.92, 0.42, 0.18);
          #endif
          vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vColor;
        void main() {
          vec2 p = (vUv - 0.5) * 2.0;
          // Tapered leaf silhouette with soft alpha discard (never a square or diamond shard)
          p.x /= (1.0 - p.y * 0.32);
          float d = length(p);
          if (d > 0.95) discard;
          float alpha = smoothstep(0.95, 0.45, d) * 0.88;
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
    });

    this.fallingLeavesMesh = new THREE.InstancedMesh(geo, this.leafParticlesMat, count);
    this.fallingLeavesMesh.name = 'FallingLeavesAndPetals';
    this.add(this.fallingLeavesMesh);

    const rng = createSeededRandom(88421);
    const speciesColors = ['#E8601C', '#F0CB3C', '#B69EFF', '#D94824'];
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const r = 4.5 + rng() * 15.0;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const baseY = terrainHeight(x, z);
      const y = baseY + 1.8 + rng() * 4.5;

      const colHex = speciesColors[i % speciesColors.length]!;
      this.fallingLeavesMesh.setColorAt(i, new THREE.Color(colHex));

      this.fallingLeavesData.push({
        x,
        y,
        z,
        baseY,
        vx: (rng() - 0.5) * 0.35,
        vy: -0.32 - rng() * 0.38,
        vz: (rng() - 0.5) * 0.35,
        rotX: rng() * Math.PI,
        rotY: rng() * Math.PI,
        rotZ: rng() * Math.PI,
        scale: 0.85 + rng() * 0.35,
      });

      dummy.position.set(x, y, z);
      dummy.scale.setScalar(0.9);
      dummy.updateMatrix();
      this.fallingLeavesMesh.setMatrixAt(i, dummy.matrix);
    }

    if (this.fallingLeavesMesh.instanceColor) {
      this.fallingLeavesMesh.instanceColor.needsUpdate = true;
    }
    this.fallingLeavesMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Strict placement predicate ensuring no tree ever spawns on a steep cliff, outside the rim,
   * below the island rim height, or within 2m of paths, buildings, or the pond basin.
   */
  public isValidTreePlacement(
    islandKey: IslandKey,
    x: number,
    z: number,
    existing: readonly TreeInstanceData[],
  ): boolean {
    const isl = ISLANDS[islandKey];
    const dx = x - isl.center.x;
    const dz = z - isl.center.z;
    const distFromCenter = Math.hypot(dx, dz);
    const angle = Math.atan2(dz, dx);
    const rimR = islandRadiusAtAngle(islandKey, isl.radius, angle);
    const t = distFromCenter / Math.max(1e-4, rimR);

    // 1. Inside island rim t <= 0.84 (audit requires t <= 0.88)
    if (t > 0.84) return false;

    // 2. Slope strictly < 23.5 deg (audit requires <= 25 deg)
    const grad = terrainGradient(x, z);
    if (grad.slopeDeg > 23.5) return false;

    // 3. Elevation strictly above island rim height
    const y = terrainHeight(x, z);
    if (y < isl.topY - 0.25) return false;

    if (islandKey === 'A') {
      // 4. At least 2.25 m from any path centerline
      if (pathDistance(x, z) < 2.25) return false;

      // 5. Outside pond basin (radius 4.6 m + 2.15 m margin = 6.75 m from (-9, -4))
      const pondDist = Math.hypot(x - -9, z - -4);
      if (pondDist < 6.75) return false;

      // Keep clear of stream channel center
      if (streamDistance(x, z) < 1.35) return false;
    }

    // 6. At least 2.25 m from any building footprint / platform
    for (const plat of PLATFORMS) {
      if (plat.island !== islandKey) continue;
      const cx = Math.max(plat.minX, Math.min(x, plat.maxX));
      const cz = Math.max(plat.minZ, Math.min(z, plat.maxZ));
      if (Math.hypot(x - cx, z - cz) < 2.25) return false;
    }

    // 7. At least 2.1 m from any architectural obstacle
    for (const obs of OBSTACLES) {
      if (Math.hypot(x - obs.x, z - obs.z) < obs.radius + 2.05) return false;
    }

    // 8. Minimum spacing between trees
    for (const other of existing) {
      if (other.island !== islandKey) continue;
      if (Math.hypot(x - other.x, z - other.z) < 2.1) return false;
    }

    return true;
  }

  private generatePlacements(): TreeInstanceData[] {
    const list: TreeInstanceData[] = [];
    const rng = createSeededRandom(202611);

    const tryAdd = (
      island: IslandKey,
      species: TreeSpecies,
      x: number,
      z: number,
      yaw: number,
      scale: number,
    ): boolean => {
      if (!this.isValidTreePlacement(island, x, z, list)) return false;
      const y = terrainHeight(x, z);
      list.push({ species, island, x, y, z, yaw, scale });
      return true;
    };

    // Curated hero candidates on Island A (filtered through strict placement validator)
    const curatedA: Array<{ species: TreeSpecies; x: number; z: number; scale: number }> = [
      // Gate flanking ginkgos
      { species: 'ginkgo', x: -4.6, z: -18.5, scale: 1.12 },
      { species: 'ginkgo', x: 4.6, z: -18.5, scale: 1.12 },
      { species: 'maple', x: -8.2, z: -16.8, scale: 1.05 },
      { species: 'maple', x: 8.2, z: -16.8, scale: 1.05 },
      // Wisteria near Spirit Pond outer bank (> 6.8m from pond center)
      { species: 'wisteria', x: -16.2, z: -2.0, scale: 1.05 },
      { species: 'wisteria', x: -15.8, z: -6.2, scale: 1.02 },
      { species: 'wisteria', x: -9.2, z: 3.4, scale: 1.04 },
      { species: 'wisteria', x: -13.5, z: 2.2, scale: 1.0 },
      // Maple & Ginkgo stands framing the Hall and lawns
      { species: 'maple', x: -13.2, z: 9.5, scale: 1.1 },
      { species: 'maple', x: -13.8, z: 13.5, scale: 1.06 },
      { species: 'maple', x: 13.2, z: 9.5, scale: 1.1 },
      { species: 'maple', x: 13.8, z: 13.5, scale: 1.06 },
      { species: 'ginkgo', x: -11.8, z: 6.2, scale: 1.08 },
      { species: 'ginkgo', x: 11.8, z: 5.5, scale: 1.08 },
      // Bamboo stands near western lawn
      { species: 'bamboo', x: -16.8, z: -10.8, scale: 1.0 },
      { species: 'bamboo', x: -18.4, z: -1.5, scale: 0.98 },
      { species: 'bamboo', x: -17.2, z: 4.8, scale: 1.02 },
      { species: 'bamboo', x: -14.5, z: -12.5, scale: 0.96 },
      // Pines along safe inner ridges (r ~ 16..19m)
      { species: 'pine', x: 16.5, z: -11.2, scale: 1.12 },
      { species: 'pine', x: 18.2, z: 2.5, scale: 1.1 },
      { species: 'pine', x: -17.8, z: 8.2, scale: 1.14 },
      { species: 'pine', x: -12.0, z: -15.5, scale: 1.08 },
    ];

    for (let i = 0; i < curatedA.length; i++) {
      if (this.isPhone && i % 3 === 2) continue;
      const c = curatedA[i]!;
      tryAdd('A', c.species, c.x, c.z, i * 1.17, c.scale);
    }

    const targets: Record<IslandKey, number> = {
      A: this.isPhone ? 34 : 56,
      B: this.isPhone ? 20 : 32,
      C: this.isPhone ? 20 : 32,
      S: 0,
    };

    const islandKeys: IslandKey[] = ['A', 'B', 'C'];
    for (const key of islandKeys) {
      const isl = ISLANDS[key];
      const targetCount = targets[key];
      let currentOnIsland = list.filter((t) => t.island === key).length;
      let attempts = 0;

      while (currentOnIsland < targetCount && attempts < 1800) {
        attempts++;
        const a = rng() * Math.PI * 2;
        const maxR = islandRadiusAtAngle(key, isl.radius, a);
        const rFrac = 0.22 + rng() * 0.58; // strictly inside t <= 0.80
        const x = isl.center.x + Math.cos(a) * maxR * rFrac;
        const z = isl.center.z + Math.sin(a) * maxR * rFrac;

        let sp: TreeSpecies;
        if (key === 'A') {
          const pick = attempts % 10;
          sp =
            pick < 4
              ? 'maple'
              : pick < 7
                ? 'ginkgo'
                : pick === 7
                  ? 'wisteria'
                  : pick === 8
                    ? 'pine'
                    : 'bamboo';
        } else if (key === 'B') {
          const pick = attempts % 3;
          sp = pick === 0 ? 'ginkgo' : pick === 1 ? 'pine' : 'wisteria';
        } else {
          sp = attempts % 2 === 0 ? 'maple' : 'pine';
        }

        const scale = 0.92 + rng() * 0.24;
        if (tryAdd(key, sp, x, z, rng() * Math.PI * 2, scale)) {
          currentOnIsland++;
        }
      }
    }

    return list;
  }

  public getPlacements(): readonly TreeInstanceData[] {
    return this.placements;
  }

  public getAuditData(): TreeAuditMetrics {
    let slopeOver25Count = 0;
    let outsideRimCount = 0;
    let nearPathBuildingPondCount = 0;
    let belowRimHeightCount = 0;

    for (const p of this.placements) {
      const isl = ISLANDS[p.island];
      const dx = p.x - isl.center.x;
      const dz = p.z - isl.center.z;
      const dist = Math.hypot(dx, dz);
      const rimR = islandRadiusAtAngle(p.island, isl.radius, Math.atan2(dz, dx));
      const t = dist / Math.max(1e-4, rimR);

      if (t > 0.88) outsideRimCount++;

      const grad = terrainGradient(p.x, p.z);
      if (grad.slopeDeg > 25.0) slopeOver25Count++;

      if (p.y < isl.topY - 0.5) belowRimHeightCount++;

      let tooClose = false;
      if (p.island === 'A') {
        if (pathDistance(p.x, p.z) < 2.0) tooClose = true;
        if (Math.hypot(p.x - -9, p.z - -4) < 6.5) tooClose = true;
      }
      for (const plat of PLATFORMS) {
        if (plat.island !== p.island) continue;
        const cx = Math.max(plat.minX, Math.min(p.x, plat.maxX));
        const cz = Math.max(plat.minZ, Math.min(p.z, plat.maxZ));
        if (Math.hypot(p.x - cx, p.z - cz) < 2.0) tooClose = true;
      }
      if (tooClose) nearPathBuildingPondCount++;
    }

    const minReq = this.isPhone ? 55 : 90;
    let lowLeafCardSpeciesCount = 0;
    let minLeafCardsPerTree = Infinity;
    for (const [, count] of this.speciesLeafCardCounts) {
      if (count < minLeafCardsPerTree) minLeafCardsPerTree = count;
      if (count < minReq) lowLeafCardSpeciesCount++;
    }
    if (!Number.isFinite(minLeafCardsPerTree)) minLeafCardsPerTree = 0;

    return {
      totalPlaced: this.placements.length,
      slopeOver25Count,
      outsideRimCount,
      nearPathBuildingPondCount,
      belowRimHeightCount,
      lowLeafCardSpeciesCount,
      leafAtlasLoadFailures: leafAtlasFailures,
      minLeafCardsPerTree,
    };
  }

  public updateTextures(assets: AssetStore): void {
    const barkSlot = assets.getSlot('bark');
    const grassSlot = assets.getSlot('grass');

    if (this.barkMaterial && this.barkMaterial.map !== barkSlot.diff) {
      const barkGain = barkSlot.albedoGain;
      const barkNorScale = 1.4;
      const barkNorY = barkSlot.flipGreen ? -barkNorScale : barkNorScale;
      this.barkMaterial.color.set('#5B4030').multiplyScalar(barkGain);
      this.barkMaterial.map = barkSlot.diff;
      this.barkMaterial.normalMap = barkSlot.nor;
      this.barkMaterial.normalScale.set(barkNorScale, barkNorY);
      this.barkMaterial.needsUpdate = true;
    }

    if (this.crownMaterial && this.crownMaterial.map !== grassSlot.diff) {
      this.crownMaterial.map = grassSlot.diff;
      this.crownMaterial.needsUpdate = true;
    }
  }

  update(dt: number, elapsed: number, cameraPos: THREE.Vector3, skyState?: TimeOfDayState): void {
    if (this.leafMaterial && skyState) {
      this.leafMaterial.uniforms.uSunDir!.value.copy(skyState.keyLightDirection);
      this.leafMaterial.uniforms.uSunColor!.value.copy(skyState.keyColor);
      this.leafMaterial.uniforms.uAmbientColor!.value.copy(skyState.hemiSky);
    }

    // Only switch to multi-blob mid-LOD when camera is > 140 m from Island A center
    const distFromOrigin = cameraPos.length();
    for (const [sp, cMesh] of this.canopyMeshes) {
      const crMesh = this.midLodMeshes.get(sp);
      if (!crMesh) continue;

      if (distFromOrigin > 140) {
        cMesh.visible = false;
        crMesh.visible = true;
      } else {
        cMesh.visible = true;
        crMesh.visible = false;
      }
    }

    // Update falling leaves and petals
    if (this.fallingLeavesMesh) {
      const dummy = new THREE.Object3D();
      const count = this.fallingLeavesData.length;

      for (let i = 0; i < count; i++) {
        const item = this.fallingLeavesData[i]!;

        item.y += item.vy * dt;
        item.x += item.vx * dt + Math.sin(elapsed * 2.2 + i) * 0.012;
        item.z += item.vz * dt + Math.cos(elapsed * 1.8 + i) * 0.012;

        item.rotX += 1.6 * dt;
        item.rotY += 2.0 * dt;
        item.rotZ += 1.1 * dt;

        if (item.y <= item.baseY + 0.05) {
          item.y = item.baseY + 3.2 + ((i * 0.37) % 3.5);
        }

        dummy.position.set(item.x, item.y, item.z);
        dummy.rotation.set(item.rotX, item.rotY, item.rotZ);
        dummy.scale.setScalar(item.scale);
        dummy.updateMatrix();

        this.fallingLeavesMesh.setMatrixAt(i, dummy.matrix);
      }

      this.fallingLeavesMesh.instanceMatrix.needsUpdate = true;
    }
  }

  override dispose(): void {
    for (const [, m] of this.trunkMeshes) {
      m.geometry.dispose();
      m.removeFromParent();
    }
    this.trunkMeshes.clear();

    for (const [, m] of this.canopyMeshes) {
      m.geometry.dispose();
      m.removeFromParent();
    }
    this.canopyMeshes.clear();

    for (const [, m] of this.midLodMeshes) {
      m.geometry.dispose();
      m.removeFromParent();
    }
    this.midLodMeshes.clear();

    if (this.barkMaterial) {
      this.barkMaterial.dispose();
      this.barkMaterial = null;
    }
    if (this.leafMaterial) {
      this.leafMaterial.dispose();
      this.leafMaterial = null;
    }
    if (this.crownMaterial) {
      this.crownMaterial.dispose();
      this.crownMaterial = null;
    }
    if (this.fallingLeavesMesh) {
      this.fallingLeavesMesh.geometry.dispose();
      if (this.leafParticlesMat) this.leafParticlesMat.dispose();
      this.fallingLeavesMesh = null;
    }
    disposeObject3D(this);
  }
}
