import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { disposeObject3D } from '@/engine/core/Disposables';
import type { AssetStore } from '@/engine/core/AssetStore';
import type { TimeOfDayState } from '@/engine/world/sky';
import type { WindUniforms } from '@/engine/fx/Wind';
import { WIND_GLSL_PARS } from '@/engine/fx/Wind';
import { terrainHeight, terrainGradient } from '@/engine/world/terrain';
import { ISLANDS, type IslandKey, islandRadiusAtAngle } from '@/engine/world/layout';

export type TreeSpecies = 'maple' | 'ginkgo' | 'wisteria' | 'pine' | 'bamboo';

export interface TreeInstanceData {
  species: TreeSpecies;
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
}

let cachedLeafAtlas: THREE.Texture | null = null;

function createLeafAtlas(): THREE.Texture {
  if (cachedLeafAtlas) return cachedLeafAtlas;

  if (typeof document === 'undefined') {
    const data = new Uint8Array(16 * 4).fill(255);
    cachedLeafAtlas = new THREE.DataTexture(data, 4, 4);
    return cachedLeafAtlas;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, 512, 512);

  // 1. Maple (top-left 0..256, 0..256): 5-lobed palmate leaf with veins
  ctx.save();
  ctx.translate(128, 128);
  ctx.fillStyle = '#E8521A';
  ctx.beginPath();
  ctx.moveTo(0, 90);
  ctx.bezierCurveTo(-25, 60, -40, 70, -75, 40);
  ctx.bezierCurveTo(-60, 20, -75, 10, -90, -30);
  ctx.bezierCurveTo(-60, -25, -55, -45, -50, -85);
  ctx.bezierCurveTo(-25, -65, -15, -75, 0, -100);
  ctx.bezierCurveTo(15, -75, 25, -65, 50, -85);
  ctx.bezierCurveTo(55, -45, 60, -25, 90, -30);
  ctx.bezierCurveTo(75, 10, 60, 20, 75, 40);
  ctx.bezierCurveTo(40, 70, 25, 60, 0, 90);
  ctx.fill();

  // Veins
  ctx.strokeStyle = '#FFA050';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 90);
  ctx.lineTo(0, -90);
  ctx.moveTo(0, 20);
  ctx.lineTo(-75, -20);
  ctx.moveTo(0, 20);
  ctx.lineTo(75, -20);
  ctx.moveTo(0, 50);
  ctx.lineTo(-60, 35);
  ctx.moveTo(0, 50);
  ctx.lineTo(60, 35);
  ctx.stroke();
  ctx.restore();

  // 2. Ginkgo (top-right 256..512, 0..256): fan shape with notched margin
  ctx.save();
  ctx.translate(384, 128);
  ctx.fillStyle = '#F5C232';
  ctx.beginPath();
  ctx.moveTo(0, 90);
  ctx.lineTo(-8, 30);
  ctx.bezierCurveTo(-80, 20, -100, -50, -50, -95);
  ctx.bezierCurveTo(-20, -85, -5, -70, 0, -80);
  ctx.bezierCurveTo(5, -70, 20, -85, 50, -95);
  ctx.bezierCurveTo(100, -50, 80, 20, 8, 30);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#DDA31A';
  ctx.lineWidth = 1.5;
  for (let a = -0.9; a <= 0.9; a += 0.18) {
    ctx.beginPath();
    ctx.moveTo(0, 40);
    ctx.lineTo(Math.sin(a) * 85, -Math.cos(a) * 85);
    ctx.stroke();
  }
  ctx.restore();

  // 3. Wisteria (bottom-left 0..256, 256..512): drooping raceme cluster
  ctx.save();
  ctx.translate(128, 384);
  const wisteriaColors = ['#9B7BE0', '#B9A6FF', '#D8CCFF', '#825BD8'];
  for (let r = 0; r < 24; r++) {
    const y = -80 + r * 7;
    const widthR = Math.max(8, (1 - (r / 24) * 0.75) * 45);
    for (let c = -1; c <= 1; c += 0.8) {
      ctx.fillStyle = wisteriaColors[(r + Math.abs(Math.floor(c * 2))) % wisteriaColors.length]!;
      ctx.beginPath();
      ctx.arc(c * (widthR * 0.5) + (Math.random() - 0.5) * 6, y, 7 + Math.random() * 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  // 4. Pine / Cypress (bottom-right 256..512, 256..512): radiating needle cluster
  ctx.save();
  ctx.translate(384, 384);
  ctx.strokeStyle = '#2A6136';
  ctx.lineWidth = 3.5;
  for (let a = 0; a < Math.PI * 2; a += 0.16) {
    const len = 70 + (Math.sin(a * 5) * 0.5 + 0.5) * 25;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
    ctx.stroke();
  }
  // Light green accents
  ctx.strokeStyle = '#4A8F58';
  ctx.lineWidth = 2;
  for (let a = 0.08; a < Math.PI * 2; a += 0.32) {
    const len = 55 + (Math.cos(a * 4) * 0.5 + 0.5) * 20;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
    ctx.stroke();
  }
  ctx.restore();

  cachedLeafAtlas = new THREE.CanvasTexture(canvas);
  cachedLeafAtlas.generateMipmaps = true;
  cachedLeafAtlas.colorSpace = THREE.SRGBColorSpace;
  return cachedLeafAtlas;
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
  private leafParticlesMat: THREE.MeshBasicMaterial | null = null;

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

    // 1. Materials
    const barkGain = barkSlot?.albedoGain ?? 1.0;
    const barkNorScale = 1.5;
    const barkNorY = barkSlot?.flipGreen ? -barkNorScale : barkNorScale;

    this.barkMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#5B3F2B').multiplyScalar(barkGain),
      roughness: 0.9,
      metalness: 0.04,
      map: barkSlot?.diff,
      normalMap: barkSlot?.nor,
      normalScale: new THREE.Vector2(barkNorScale, barkNorY),
    });
    if (barkSlot?.arm) {
      this.barkMaterial.roughnessMap = barkSlot.arm;
      this.barkMaterial.aoMap = barkSlot.arm;
      this.barkMaterial.aoMapIntensity = 0.8;
    }

    this.leafMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uLeafAtlas: { value: leafAtlas },
        uWindDir: windUniforms.uWindDir,
        uWindStrength: windUniforms.uWindStrength,
        uGust: windUniforms.uGust,
        uTime: windUniforms.uTime,
        uPushPoints: windUniforms.uPushPoints,
        uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.3) },
        uSunColor: { value: new THREE.Color('#FFF5EA') },
      },
      vertexShader: /* glsl */ `
        attribute float aUvSlot;
        attribute vec3 aClumpCenter;
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        varying float vSlot;

        ${WIND_GLSL_PARS}

        void main() {
          vSlot = aUvSlot;

          // Compute atlas UVs from 2x2 grid
          vec2 atlasOffset = vec2(
            mod(aUvSlot, 2.0) * 0.5,
            floor(aUvSlot / 2.0) * 0.5
          );
          vUv = uv * 0.5 + atlasOffset;

          // Normal trick: blend vertex normal toward clump center normal for soft volume
          vec3 clumpNormal = normalize(position - aClumpCenter);
          vec3 blendedNormal = normalize(mix(normal, clumpNormal, 0.72));
          vNormal = normalize(normalMatrix * blendedNormal);

          // Wind sway
          vec3 localPos = position;
          float heightFactor = clamp(localPos.y / 6.0, 0.0, 1.0);
          vec4 worldPos = modelMatrix * vec4(localPos, 1.0);

          vec3 windOffset = evaluateWindOffset(worldPos.xyz, heightFactor);
          // High-frequency leaf card flutter
          windOffset += vec3(
            sin(uTime * 8.0 + worldPos.x * 2.0) * 0.08,
            cos(uTime * 6.5 + worldPos.z * 2.0) * 0.05,
            sin(uTime * 7.5 + worldPos.y * 2.0) * 0.08
          ) * (uWindStrength + uGust * 0.5);

          worldPos.xyz += windOffset;
          vWorldPos = worldPos.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uLeafAtlas;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;

        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        varying float vSlot;

        void main() {
          vec4 texColor = texture2D(uLeafAtlas, vUv);
          if (texColor.a < 0.45) discard;

          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          vec3 lightDir = normalize(uSunDir);

          // Direct light + soft wrap
          float NdotL = max(0.0, dot(vNormal, lightDir)) * 0.65 + 0.35;

          // Backlight translucency (glow against low sun)
          float backlight = pow(max(0.0, dot(viewDir, -lightDir)), 3.0) * 0.45;

          vec3 litColor = texColor.rgb * (NdotL + backlight) * (uSunColor * 0.8 + 0.3);
          gl_FragColor = vec4(litColor, texColor.a);
        }
      `,
      side: THREE.DoubleSide,
      transparent: true,
      alphaTest: 0.45,
    });

    this.crownMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#4E7836'),
      roughness: 0.75,
      metalness: 0.02,
    });

    // 2. Build template geometries per species
    const speciesList: TreeSpecies[] = ['maple', 'ginkgo', 'wisteria', 'pine', 'bamboo'];
    const trunkGeos = new Map<TreeSpecies, THREE.BufferGeometry>();
    const canopyGeos = new Map<TreeSpecies, THREE.BufferGeometry>();
    const crownGeos = new Map<TreeSpecies, THREE.BufferGeometry>();

    trunkGeos.set('maple', this.createTrunkGeometry(6.2, 0.42, 5, 0.12));
    canopyGeos.set('maple', this.createCanopyGeometry(0, 7, 0.35, '#E8521A'));
    crownGeos.set('maple', this.createCrownGeometry(2.4, '#C23B22'));

    trunkGeos.set('ginkgo', this.createTrunkGeometry(7.5, 0.45, 6, 0.08));
    canopyGeos.set('ginkgo', this.createCanopyGeometry(1, 8, 0.32, '#F5C232'));
    crownGeos.set('ginkgo', this.createCrownGeometry(2.2, '#E6A820'));

    trunkGeos.set('wisteria', this.createTrunkGeometry(4.8, 0.38, 5, 0.22));
    canopyGeos.set('wisteria', this.createCanopyGeometry(2, 6, 0.42, '#9B7BE0'));
    crownGeos.set('wisteria', this.createCrownGeometry(2.0, '#825BD8'));

    trunkGeos.set('pine', this.createTrunkGeometry(8.2, 0.48, 7, 0.05));
    canopyGeos.set('pine', this.createCanopyGeometry(3, 9, 0.28, '#2A6136'));
    crownGeos.set('pine', this.createCrownGeometry(1.9, '#1F4D28'));

    trunkGeos.set('bamboo', this.createBambooGeometry());
    canopyGeos.set('bamboo', this.createBambooCanopyGeometry());
    crownGeos.set('bamboo', this.createCrownGeometry(1.2, '#5B8A3D'));

    // 3. Generate placements across islands
    const placements = this.generatePlacements();
    this.totalTreeCount = placements.length;

    // Group instances by species
    const bySpecies = new Map<TreeSpecies, TreeInstanceData[]>();
    for (const sp of speciesList) bySpecies.set(sp, []);
    for (const p of placements) bySpecies.get(p.species)!.push(p);

    const dummy = new THREE.Object3D();

    for (const sp of speciesList) {
      const list = bySpecies.get(sp)!;
      if (list.length === 0) continue;

      const tGeo = trunkGeos.get(sp)!;
      const cGeo = canopyGeos.get(sp)!;
      const crGeo = crownGeos.get(sp)!;

      const tMesh = new THREE.InstancedMesh(tGeo, this.barkMaterial, list.length);
      tMesh.name = `Trunk_${sp}`;
      tMesh.castShadow = true;
      tMesh.receiveShadow = true;

      const cMesh = new THREE.InstancedMesh(cGeo, this.leafMaterial, list.length);
      cMesh.name = `Canopy_${sp}`;
      cMesh.castShadow = true;

      const crMesh = new THREE.InstancedMesh(crGeo, this.crownMaterial, list.length);
      crMesh.name = `Crown_${sp}`;
      crMesh.visible = false; // Used beyond LOD threshold

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

    // 4. Falling leaves & petals
    this.buildFallingLeaves();
  }

  private createTrunkGeometry(
    height: number,
    baseR: number,
    branchesCount: number,
    bendAmp: number,
  ): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = [];

    // Main trunk tapered cylinder
    const trunkGeo = new THREE.CylinderGeometry(baseR * 0.45, baseR, height, 10, 8);
    trunkGeo.translate(0, height * 0.5, 0);

    // Apply trunk noise bend and root buttress flare
    const pos = trunkGeo.attributes.position!;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      const y = pos.getY(i);
      let z = pos.getZ(i);

      const hFrac = y / height;
      x += Math.sin(hFrac * Math.PI) * height * bendAmp;
      z += Math.cos(hFrac * Math.PI * 0.8) * height * bendAmp * 0.6;

      // Root buttress flare at base
      if (hFrac < 0.22) {
        const flare = Math.pow(1.0 - hFrac / 0.22, 2.0) * 0.35;
        const ang = Math.atan2(z, x);
        const fin = Math.cos(ang * 4.0) * 0.5 + 0.5;
        x += (x / (Math.hypot(x, z) || 1)) * flare * fin;
        z += (z / (Math.hypot(x, z) || 1)) * flare * fin;
      }

      pos.setXYZ(i, x, y, z);
    }
    const trunkUv = trunkGeo.attributes.uv;
    if (trunkUv) {
      for (let i = 0; i < trunkUv.count; i++) {
        trunkUv.setY(i, pos.getY(i) / 1.2);
      }
    }
    trunkGeo.computeVertexNormals();
    parts.push(trunkGeo);

    // 4 to 6 Branches
    for (let b = 0; b < branchesCount; b++) {
      const bFrac = 0.55 + (b / branchesCount) * 0.38;
      const bY = height * bFrac;
      const bAngle = (b / branchesCount) * Math.PI * 2 + b * 0.7;
      const bLen = height * 0.42;
      const bRad = baseR * 0.32;

      const branchGeo = new THREE.CylinderGeometry(bRad * 0.35, bRad, bLen, 8, 4);
      branchGeo.translate(0, bLen * 0.5, 0);
      const bPos = branchGeo.attributes.position;
      const bUv = branchGeo.attributes.uv;
      if (bUv && bPos) {
        for (let i = 0; i < bUv.count; i++) {
          bUv.setY(i, bPos.getY(i) / 1.2);
        }
      }
      branchGeo.rotateZ(0.75 + (b % 2) * 0.2);
      branchGeo.rotateY(bAngle);
      branchGeo.translate(Math.cos(bAngle) * (baseR * 0.5), bY, Math.sin(bAngle) * (baseR * 0.5));
      parts.push(branchGeo);
    }

    const merged = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    return merged;
  }

  private createBambooGeometry(): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = [];
    const count = 5;

    for (let i = 0; i < count; i++) {
      const h = 5.5 + (i % 3) * 0.8;
      const r = 0.055;
      const ox = (Math.sin(i * 1.8) - 0.5) * 0.6;
      const oz = (Math.cos(i * 1.8) - 0.5) * 0.6;

      const stalkGeo = new THREE.CylinderGeometry(r * 0.85, r, h, 8, 12);
      stalkGeo.translate(0, h * 0.5, 0);
      stalkGeo.translate(ox, 0, oz);
      parts.push(stalkGeo);
    }

    const merged = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    return merged;
  }

  private createCanopyGeometry(
    uvSlot: number,
    clumpsCount: number,
    cardSize: number,
    _tintHex: string,
  ): THREE.BufferGeometry {
    const clumpCenters: THREE.Vector3[] = [];

    // Clump positions around crown
    for (let c = 0; c < clumpsCount; c++) {
      const a = (c / clumpsCount) * Math.PI * 2;
      const elev = 4.8 + Math.sin(c * 2.3) * 1.2;
      const dist = 1.6 + Math.cos(c * 1.7) * 0.6;
      clumpCenters.push(new THREE.Vector3(Math.cos(a) * dist, elev, Math.sin(a) * dist));
    }

    const cardsPerClump = this.isPhone ? 14 : 22;
    const totalQuads = clumpsCount * cardsPerClump * 2;
    const totalVerts = totalQuads * 4;
    const totalIndices = totalQuads * 6;

    const positions = new Float32Array(totalVerts * 3);
    const normals = new Float32Array(totalVerts * 3);
    const uvs = new Float32Array(totalVerts * 2);
    const uvSlots = new Float32Array(totalVerts);
    const clumpCentersArr = new Float32Array(totalVerts * 3);
    const indices = new Uint32Array(totalIndices);

    let vIdx = 0;
    let iIdx = 0;

    const rotMat = new THREE.Matrix4();
    const euler = new THREE.Euler();
    const corner = new THREE.Vector3();
    const norm = new THREE.Vector3();

    const addQuad = (
      cx: number, cy: number, cz: number,
      rotX: number, rotY: number, rotZ: number,
      clumpX: number, clumpY: number, clumpZ: number,
    ) => {
      euler.set(rotX, rotY, rotZ, 'YXZ');
      rotMat.makeRotationFromEuler(euler);
      norm.set(0, 0, 1).applyMatrix4(rotMat);

      const vBase = vIdx;
      const localCorners = [
        [-cardSize, -cardSize],
        [ cardSize, -cardSize],
        [ cardSize,  cardSize],
        [-cardSize,  cardSize],
      ];
      const localUvs = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ];

      for (let i = 0; i < 4; i++) {
        corner.set(localCorners[i]![0]!, localCorners[i]![1]!, 0).applyMatrix4(rotMat);
        const idx3 = (vBase + i) * 3;
        const idx2 = (vBase + i) * 2;

        positions[idx3] = cx + corner.x;
        positions[idx3 + 1] = cy + corner.y;
        positions[idx3 + 2] = cz + corner.z;

        normals[idx3] = norm.x;
        normals[idx3 + 1] = norm.y;
        normals[idx3 + 2] = norm.z;

        uvs[idx2] = localUvs[i]![0]!;
        uvs[idx2 + 1] = localUvs[i]![1]!;

        uvSlots[vBase + i] = uvSlot;

        clumpCentersArr[idx3] = clumpX;
        clumpCentersArr[idx3 + 1] = clumpY;
        clumpCentersArr[idx3 + 2] = clumpZ;
      }

      indices[iIdx++] = vBase;
      indices[iIdx++] = vBase + 1;
      indices[iIdx++] = vBase + 2;
      indices[iIdx++] = vBase;
      indices[iIdx++] = vBase + 2;
      indices[iIdx++] = vBase + 3;

      vIdx += 4;
    };

    for (let c = 0; c < clumpsCount; c++) {
      const center = clumpCenters[c]!;

      for (let k = 0; k < cardsPerClump; k++) {
        const offA = (k / cardsPerClump) * Math.PI * 2;
        const offR = Math.sin(k * 1.3) * 0.85;
        const offY = (Math.cos(k * 2.1) - 0.2) * 0.85;

        const cx = center.x + Math.cos(offA) * offR;
        const cy = center.y + offY;
        const cz = center.z + Math.sin(offA) * offR;

        // Plane 1
        addQuad(cx, cy, cz, Math.sin(k) * 0.3, k * 0.8, 0, center.x, center.y, center.z);
        // Plane 2 (crossed 90 degrees)
        addQuad(cx, cy, cz, Math.cos(k) * 0.3, k * 0.8 + Math.PI * 0.5, 0, center.x, center.y, center.z);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setAttribute('aUvSlot', new THREE.BufferAttribute(uvSlots, 1));
    geo.setAttribute('aClumpCenter', new THREE.BufferAttribute(clumpCentersArr, 3));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));

    return geo;
  }

  private createBambooCanopyGeometry(): THREE.BufferGeometry {
    const count = this.isPhone ? 20 : 36;
    const totalVerts = count * 4;
    const totalIndices = count * 6;

    const positions = new Float32Array(totalVerts * 3);
    const normals = new Float32Array(totalVerts * 3);
    const uvs = new Float32Array(totalVerts * 2);
    const uvSlots = new Float32Array(totalVerts);
    const clumpCentersArr = new Float32Array(totalVerts * 3);
    const indices = new Uint32Array(totalIndices);

    const rotMat = new THREE.Matrix4();
    const euler = new THREE.Euler();
    const corner = new THREE.Vector3();
    const norm = new THREE.Vector3();

    let vIdx = 0;
    let iIdx = 0;

    const localCorners = [
      [-0.175, -0.375],
      [ 0.175, -0.375],
      [ 0.175,  0.375],
      [-0.175,  0.375],
    ];
    const localUvs = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];

    for (let i = 0; i < count; i++) {
      const h = 3.5 + (i / count) * 2.8;
      const a = (i / count) * Math.PI * 2;
      const r = 0.4 + ((i * 3) % 5) * 0.14;
      const cx = Math.cos(a) * r;
      const cy = h;
      const cz = Math.sin(a) * r;

      euler.set(0, a, 0.45, 'YXZ');
      rotMat.makeRotationFromEuler(euler);
      norm.set(0, 0, 1).applyMatrix4(rotMat);

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

        uvSlots[vBase + j] = 4; // Bamboo slot
        clumpCentersArr[idx3] = 0;
        clumpCentersArr[idx3 + 1] = h;
        clumpCentersArr[idx3 + 2] = 0;
      }

      indices[iIdx++] = vBase;
      indices[iIdx++] = vBase + 1;
      indices[iIdx++] = vBase + 2;
      indices[iIdx++] = vBase;
      indices[iIdx++] = vBase + 2;
      indices[iIdx++] = vBase + 3;

      vIdx += 4;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setAttribute('aUvSlot', new THREE.BufferAttribute(uvSlots, 1));
    geo.setAttribute('aClumpCenter', new THREE.BufferAttribute(clumpCentersArr, 3));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));

    return geo;
  }

  private createCrownGeometry(radius: number, tintHex: string): THREE.BufferGeometry {
    const geo = new THREE.DodecahedronGeometry(radius, 1);
    geo.translate(0, 5.5, 0);

    const count = geo.attributes.position!.count;
    const colors = new Float32Array(count * 3);
    const col = new THREE.Color(tintHex);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }

  private buildFallingLeaves(): void {
    const count = this.isPhone ? 70 : 220;
    const geo = new THREE.PlaneGeometry(0.16, 0.16);

    this.leafParticlesMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#FF8A3D'),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });

    this.fallingLeavesMesh = new THREE.InstancedMesh(geo, this.leafParticlesMat, count);
    this.fallingLeavesMesh.name = 'FallingLeavesAndPetals';
    this.add(this.fallingLeavesMesh);

    const speciesColors = ['#E8521A', '#F5C232', '#9B7BE0', '#FFA050'];
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const r = 4.0 + Math.random() * 18.0;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const baseY = terrainHeight(x, z);
      const y = baseY + 2.0 + Math.random() * 6.0;

      const colHex = speciesColors[i % speciesColors.length]!;
      this.fallingLeavesMesh.setColorAt(i, new THREE.Color(colHex));

      this.fallingLeavesData.push({
        x,
        y,
        z,
        baseY,
        vx: (Math.random() - 0.5) * 0.4,
        vy: -0.35 - Math.random() * 0.45,
        vz: (Math.random() - 0.5) * 0.4,
        rotX: Math.random() * Math.PI,
        rotY: Math.random() * Math.PI,
        rotZ: Math.random() * Math.PI,
        scale: 0.8 + Math.random() * 0.6,
      });

      dummy.position.set(x, y, z);
      dummy.scale.setScalar(0.8);
      dummy.updateMatrix();
      this.fallingLeavesMesh.setMatrixAt(i, dummy.matrix);
    }

    if (this.fallingLeavesMesh.instanceColor) {
      this.fallingLeavesMesh.instanceColor.needsUpdate = true;
    }
    this.fallingLeavesMesh.instanceMatrix.needsUpdate = true;
  }

  private generatePlacements(): TreeInstanceData[] {
    const list: TreeInstanceData[] = [];
    const islandKeys: IslandKey[] = ['A', 'B', 'C'];

    for (const key of islandKeys) {
      const isl = ISLANDS[key];
      const count = key === 'A' ? (this.isPhone ? 45 : 70) : (this.isPhone ? 25 : 40);

      if (key === 'A') {
        // Island A curated stands:
        // 1. Maple grove behind Hall Terrace: X: [-9..9], Z: [15..23]
        for (let i = 0; i < (this.isPhone ? 8 : 14); i++) {
          const x = -8 + ((i * 3.7) % 16);
          const z = 15 + ((i * 2.3) % 7);
          const y = terrainHeight(x, z);
          list.push({ species: 'maple', x, y, z, yaw: i * 0.9, scale: 0.95 + (i % 3) * 0.1 });
        }

        // 2. Ginkgo pair at the gate
        list.push(
          { species: 'ginkgo', x: -3.8, y: terrainHeight(-3.8, -20.2), z: -20.2, yaw: 0.4, scale: 1.1 },
          { species: 'ginkgo', x: 3.8, y: terrainHeight(3.8, -20.2), z: -20.2, yaw: -0.4, scale: 1.1 },
        );

        // 3. Wisteria arbour near pond (-9, -4)
        const wisteriaLocs = [
          { x: -12.5, z: -2.2 },
          { x: -14.2, z: -4.0 },
          { x: -7.2, z: -1.5 },
          { x: -5.8, z: -3.2 },
          { x: -13.0, z: -6.5 },
          { x: -6.5, z: -6.0 },
        ];
        for (let i = 0; i < (this.isPhone ? 4 : wisteriaLocs.length); i++) {
          const loc = wisteriaLocs[i]!;
          const y = terrainHeight(loc.x, loc.z);
          list.push({ species: 'wisteria', x: loc.x, y, z: loc.z, yaw: i * 1.2, scale: 1.0 });
        }

        // 4. Bamboo grove along stream channel
        const bambooLocs = [
          { x: -11.2, z: -6.5 },
          { x: -12.8, z: -7.2 },
          { x: -16.5, z: -8.5 },
          { x: -18.2, z: -9.4 },
          { x: -20.5, z: -9.8 },
          { x: -22.2, z: -10.2 },
          { x: -15.2, z: -4.5 },
          { x: -17.8, z: -5.2 },
        ];
        for (let i = 0; i < (this.isPhone ? 5 : bambooLocs.length); i++) {
          const loc = bambooLocs[i]!;
          const y = terrainHeight(loc.x, loc.z);
          list.push({ species: 'bamboo', x: loc.x, y, z: loc.z, yaw: i * 0.8, scale: 1.0 });
        }

        // 5. Pine / Cypress along cliff edges
        const pineAngles = [0.45, 1.15, 1.75, 2.35, 3.15, 3.75, 4.25, 4.95, 5.55, 6.05];
        for (let i = 0; i < (this.isPhone ? 6 : pineAngles.length); i++) {
          const a = pineAngles[i]!;
          const r = 21.5 + (i % 2) * 1.5;
          const x = Math.cos(a) * r;
          const z = Math.sin(a) * r;
          const y = terrainHeight(x, z);
          list.push({ species: 'pine', x, y, z, yaw: a + 0.5, scale: 1.05 + (i % 3) * 0.12 });
        }

        // 6. Fill remaining quota with scattered maple & ginkgo in meadow
        let tryIndex = 0;
        while (list.length < count && tryIndex < 600) {
          tryIndex++;
          const a = (tryIndex * 2.39996) % (Math.PI * 2);
          const r = 10.0 + ((tryIndex * 7.1) % 11.0);
          const x = Math.cos(a) * r;
          const z = Math.sin(a) * r;
          const grad = terrainGradient(x, z);
          if (grad.slopeDeg < 26.0 || tryIndex > 250) {
            const y = terrainHeight(x, z);
            const sp: TreeSpecies = (tryIndex % 2 === 0) ? 'maple' : 'ginkgo';
            list.push({ species: sp, x, y, z, yaw: tryIndex * 1.1, scale: 0.9 + (tryIndex % 4) * 0.1 });
          }
        }
      } else {
        // Islands B and C: seeded distribution
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2 + key.charCodeAt(0) * 0.3;
          const maxR = islandRadiusAtAngle(key, isl.radius, a);
          const r = maxR * (0.35 + ((i * 3.7) % 5.0) * 0.1);
          const x = isl.center.x + Math.cos(a) * r;
          const z = isl.center.z + Math.sin(a) * r;
          const grad = terrainGradient(x, z);
          if (grad.slopeDeg < 26.0) {
            const y = terrainHeight(x, z);
            const sp: TreeSpecies = key === 'B'
              ? ((i % 3 === 0) ? 'ginkgo' : (i % 3 === 1) ? 'pine' : 'wisteria')
              : ((i % 2 === 0) ? 'maple' : 'pine');
            list.push({ species: sp, x, y, z, yaw: i * 0.85, scale: 0.95 + (i % 3) * 0.1 });
          }
        }
      }
    }

    return list;
  }

  update(dt: number, elapsed: number, cameraPos: THREE.Vector3, skyState?: TimeOfDayState): void {
    if (this.leafMaterial && skyState) {
      this.leafMaterial.uniforms.uSunDir!.value.copy(skyState.keyLightDirection);
      this.leafMaterial.uniforms.uSunColor!.value.copy(skyState.keyColor);
    }

    // Dynamic LOD switching based on camera distance
    for (const [sp, cMesh] of this.canopyMeshes) {
      const crMesh = this.midLodMeshes.get(sp);
      if (!crMesh) continue;

      // Check average distance or sample first instance
      const dist = cameraPos.distanceTo(cMesh.position);
      if (dist > 75) {
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
        item.x += item.vx * dt + Math.sin(elapsed * 2.5 + i) * 0.015;
        item.z += item.vz * dt + Math.cos(elapsed * 2.0 + i) * 0.015;

        item.rotX += 1.8 * dt;
        item.rotY += 2.2 * dt;
        item.rotZ += 1.2 * dt;

        // Reset if touches ground
        if (item.y <= item.baseY + 0.05) {
          item.y = item.baseY + 3.5 + Math.random() * 4.5;
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
