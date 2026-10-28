import * as THREE from 'three';
import { disposeObject3D } from '@/engine/core/Disposables';
import type { WindUniforms } from '@/engine/fx/Wind';
import { WIND_GLSL_PARS } from '@/engine/fx/Wind';
import {
  terrainHeight,
  terrainGradient,
  pathDistance,
  streamDistance,
} from '@/engine/world/terrain';
import { ISLANDS, type IslandKey, islandRadiusAtAngle } from '@/engine/world/layout';

let cachedFlowerAtlas: THREE.Texture | null = null;

function createFlowerAtlas(): THREE.Texture {
  if (cachedFlowerAtlas) return cachedFlowerAtlas;

  if (typeof document === 'undefined') {
    const data = new Uint8Array(16 * 4).fill(255);
    cachedFlowerAtlas = new THREE.DataTexture(data, 4, 4);
    return cachedFlowerAtlas;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 512, 512);

  // 6 flower shapes in a 3x2 grid (each cell 170 x 256)
  const cellW = 512 / 3;
  const cellH = 512 / 2;

  // 0. Daisy: radiating white petals with golden disc center
  ctx.save();
  ctx.translate(cellW * 0.5, cellH * 0.45);
  ctx.fillStyle = '#FFFFFF';
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
    ctx.save();
    ctx.rotate(a);
    ctx.beginPath();
    ctx.ellipse(0, -38, 9, 24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#FFC107';
  ctx.beginPath();
  ctx.arc(0, 0, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 1. Bellflower: drooping purple bell
  ctx.save();
  ctx.translate(cellW * 1.5, cellH * 0.45);
  ctx.fillStyle = '#825BD8';
  ctx.beginPath();
  ctx.moveTo(0, -45);
  ctx.bezierCurveTo(-35, -20, -40, 25, -28, 45);
  ctx.bezierCurveTo(-15, 30, 0, 42, 0, 42);
  ctx.bezierCurveTo(0, 42, 15, 30, 28, 45);
  ctx.bezierCurveTo(40, 25, 35, -20, 0, -45);
  ctx.fill();
  ctx.fillStyle = '#B9A6FF';
  ctx.beginPath();
  ctx.arc(0, 15, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 2. Poppy: wide scarlet-orange petals
  ctx.save();
  ctx.translate(cellW * 2.5, cellH * 0.45);
  ctx.fillStyle = '#FF4500';
  for (let a = 0; a < Math.PI * 2; a += Math.PI * 0.5) {
    ctx.save();
    ctx.rotate(a);
    ctx.beginPath();
    ctx.arc(0, -22, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#211714';
  ctx.beginPath();
  ctx.arc(0, 0, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 3. Lavender Spike: vertical stacked violet florets
  ctx.save();
  ctx.translate(cellW * 0.5, cellH * 1.45);
  const lavCols = ['#9B7BE0', '#855AD8', '#B9A6FF', '#6B45B8'];
  for (let r = 0; r < 14; r++) {
    const y = 50 - r * 8;
    const w = Math.max(6, (1 - (r / 14) * 0.6) * 16);
    for (let c = -1; c <= 1; c += 1) {
      ctx.fillStyle = lavCols[(r + c + 4) % lavCols.length]!;
      ctx.beginPath();
      ctx.arc(c * w, y, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  // 4. Small Orange Lily: 6 slender recurved orange petals
  ctx.save();
  ctx.translate(cellW * 1.5, cellH * 1.45);
  ctx.fillStyle = '#FF8A3D';
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 3) {
    ctx.save();
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-12, -20, -10, -45, 0, -55);
    ctx.bezierCurveTo(10, -45, 12, -20, 0, 0);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#FFB27A';
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 5. White Star: 5 pointed delicate petals
  ctx.save();
  ctx.translate(cellW * 2.5, cellH * 1.45);
  ctx.fillStyle = '#F5F3ED';
  for (let a = 0; a < Math.PI * 2; a += (Math.PI * 2) / 5) {
    ctx.save();
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-8, -20);
    ctx.lineTo(0, -48);
    ctx.lineTo(8, -20);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#FFD147';
  ctx.beginPath();
  ctx.arc(0, 0, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  cachedFlowerAtlas = new THREE.CanvasTexture(canvas);
  cachedFlowerAtlas.generateMipmaps = true;
  cachedFlowerAtlas.colorSpace = THREE.SRGBColorSpace;
  return cachedFlowerAtlas;
}

export class FlowerSystem extends THREE.Group {
  override readonly name = 'FlowerSystem';

  private flowerMesh: THREE.InstancedMesh | null = null;
  private flowerMaterial: THREE.ShaderMaterial | null = null;
  private pebblesMesh: THREE.InstancedMesh | null = null;
  private mushroomsMesh: THREE.InstancedMesh | null = null;

  totalFlowerCount = 0;

  override get count(): number {
    return this.flowerMesh ? this.flowerMesh.count : 0;
  }

  get flowersMesh(): THREE.InstancedMesh | null {
    return this.flowerMesh;
  }

  get pebbles(): THREE.InstancedMesh | null {
    return this.pebblesMesh;
  }

  get mushrooms(): THREE.InstancedMesh | null {
    return this.mushroomsMesh;
  }

  constructor(windUniforms: WindUniforms, isPhone = false) {
    super();
    this.buildFlowers(windUniforms, isPhone);
    this.buildPebblesAndMushrooms(isPhone);
  }

  update(_dt = 0.016, _elapsed = 0): void {
    // Flower sway and push points are bound directly to windUniforms
  }

  private buildFlowers(windUniforms: WindUniforms, isPhone: boolean): void {
    const atlas = createFlowerAtlas();
    const count = isPhone ? 2500 : 9000;
    this.totalFlowerCount = count;

    // Crossed quads geometry (two crossing vertical planes)
    const quadW = 0.32;
    const quadH = 0.42;

    const basePositions = new Float32Array([
      // Plane 1
      -quadW * 0.5, 0.0, 0.0,
       quadW * 0.5, 0.0, 0.0,
      -quadW * 0.5, quadH, 0.0,
       quadW * 0.5, quadH, 0.0,
      // Plane 2
      0.0, 0.0, -quadW * 0.5,
      0.0, 0.0,  quadW * 0.5,
      0.0, quadH, -quadW * 0.5,
      0.0, quadH,  quadW * 0.5,
    ]);

    const baseUvs = new Float32Array([
      0, 0,  1, 0,  0, 1,  1, 1,
      0, 0,  1, 0,  0, 1,  1, 1,
    ]);

    const indices = [
      0, 1, 2,  2, 1, 3,
      4, 5, 6,  6, 5, 7,
    ];

    const instGeo = new THREE.InstancedBufferGeometry();
    instGeo.setAttribute('position', new THREE.BufferAttribute(basePositions, 3));
    instGeo.setAttribute('uv', new THREE.BufferAttribute(baseUvs, 2));
    instGeo.setIndex(indices);
    instGeo.computeVertexNormals();

    // Shader Material
    this.flowerMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uAtlas: { value: atlas },
        uWindDir: windUniforms.uWindDir,
        uWindStrength: windUniforms.uWindStrength,
        uGust: windUniforms.uGust,
        uTime: windUniforms.uTime,
        uPushPoints: windUniforms.uPushPoints,
      },
      vertexShader: /* glsl */ `
        attribute vec3 aPosition;
        attribute float aFlowerId;
        attribute vec3 aClusterColor;
        attribute float aScale;
        attribute float aSwayPhase;

        varying vec2 vUv;
        varying vec3 vClusterColor;
        varying vec3 vWorldPos;

        ${WIND_GLSL_PARS}

        void main() {
          vClusterColor = aClusterColor;

          // 3x2 grid atlas coordinate
          float col = mod(aFlowerId, 3.0);
          float row = floor(aFlowerId / 3.0);
          vUv = vec2(
            (uv.x + col) / 3.0,
            (uv.y + row) / 2.0
          );

          vec3 localPos = position * aScale;
          vec3 baseWorldPos = aPosition;

          // Wind sway
          float heightFactor = uv.y;
          vec3 windOffset = evaluateWindOffset(baseWorldPos, heightFactor);
          windOffset += vec3(
            sin(uTime * 3.5 + aSwayPhase) * 0.04,
            0.0,
            cos(uTime * 3.0 + aSwayPhase) * 0.04
          ) * (uWindStrength + uGust);

          vec3 worldPos = baseWorldPos + localPos + windOffset;
          vWorldPos = worldPos;
          gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uAtlas;
        varying vec2 vUv;
        varying vec3 vClusterColor;
        varying vec3 vWorldPos;

        void main() {
          vec4 texColor = texture2D(uAtlas, vUv);
          if (texColor.a < 0.5) discard;

          // Subtle cluster tint
          vec3 finalColor = mix(texColor.rgb, texColor.rgb * vClusterColor, 0.28);
          gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
      side: THREE.DoubleSide,
      alphaTest: 0.5,
    });

    // Generate drift placements
    const flowerData = this.generateFlowerPlacements(count);
    const actualCount = flowerData.length;
    this.totalFlowerCount = actualCount;

    const aPos = new Float32Array(actualCount * 3);
    const aFlowerId = new Float32Array(actualCount);
    const aClusterColor = new Float32Array(actualCount * 3);
    const aScale = new Float32Array(actualCount);
    const aSwayPhase = new Float32Array(actualCount);

    for (let i = 0; i < actualCount; i++) {
      const f = flowerData[i]!;
      aPos[i * 3] = f.x;
      aPos[i * 3 + 1] = f.y;
      aPos[i * 3 + 2] = f.z;

      aFlowerId[i] = f.id;

      aClusterColor[i * 3] = f.color.r;
      aClusterColor[i * 3 + 1] = f.color.g;
      aClusterColor[i * 3 + 2] = f.color.b;

      aScale[i] = f.scale;
      aSwayPhase[i] = f.sway;
    }

    instGeo.setAttribute('aPosition', new THREE.InstancedBufferAttribute(aPos, 3));
    instGeo.setAttribute('aFlowerId', new THREE.InstancedBufferAttribute(aFlowerId, 1));
    instGeo.setAttribute('aClusterColor', new THREE.InstancedBufferAttribute(aClusterColor, 3));
    instGeo.setAttribute('aScale', new THREE.InstancedBufferAttribute(aScale, 1));
    instGeo.setAttribute('aSwayPhase', new THREE.InstancedBufferAttribute(aSwayPhase, 1));

    this.flowerMesh = new THREE.InstancedMesh(instGeo, this.flowerMaterial, actualCount);
    this.flowerMesh.name = 'FlowerDrifts';

    const dummy = new THREE.Object3D();
    for (let i = 0; i < actualCount; i++) {
      this.flowerMesh.setMatrixAt(i, dummy.matrix);
    }
    this.flowerMesh.instanceMatrix.needsUpdate = true;
    this.add(this.flowerMesh);
  }

  private generateFlowerPlacements(count: number): Array<{
    x: number;
    y: number;
    z: number;
    id: number;
    color: THREE.Color;
    scale: number;
    sway: number;
  }> {
    const list: ReturnType<typeof this.generateFlowerPlacements> = [];
    const clusterPalette = [
      new THREE.Color('#FF8A3D'), // orange
      new THREE.Color('#9B7BE0'), // purple
      new THREE.Color('#FDFBF7'), // white
      new THREE.Color('#FFD147'), // yellow
    ];

    let seed = 42;
    const rng = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    const islandKeys: IslandKey[] = ['A', 'B', 'C'];
    let attempts = 0;
    const maxAttempts = count * 5;

    while (list.length < count && attempts < maxAttempts) {
      attempts++;
      const islKey = islandKeys[Math.floor(rng() * islandKeys.length)]!;
      const isl = ISLANDS[islKey];
      const theta = rng() * Math.PI * 2;
      const maxR = islandRadiusAtAngle(islKey, isl.radius, theta);
      const r = rng() * maxR * 0.88;

      const x = isl.center.x + Math.cos(theta) * r;
      const z = isl.center.z + Math.sin(theta) * r;

      const grad = terrainGradient(x, z);
      if (grad.slopeDeg > 28.0) continue;

      // Filter for drifts: path edges (pDist 1.2..2.6) OR pond rim (dist 5.0..7.8) OR meadow drifts
      const pDist = pathDistance(x, z);
      const pondDist = Math.hypot(x - (-9), z - (-4));
      const sDist = streamDistance(x, z);

      if (pondDist < 4.8 || sDist < 1.1) continue;

      const isPathEdge = pDist >= 1.2 && pDist <= 2.8;
      const isPondDrift = pondDist >= 5.0 && pondDist <= 8.2;
      const isMeadowCluster = rng() < 0.65;

      if (!isPathEdge && !isPondDrift && !isMeadowCluster && attempts < count * 2) continue;

      const y = terrainHeight(x, z);
      const clusterIdx = Math.floor(rng() * clusterPalette.length);
      const clusterColor = clusterPalette[clusterIdx]!;
      const flowerId = Math.floor(rng() * 6);

      list.push({
        x,
        y,
        z,
        id: flowerId,
        color: clusterColor,
        scale: 0.8 + rng() * 0.45,
        sway: rng() * Math.PI * 2,
      });
    }

    return list;
  }

  private buildPebblesAndMushrooms(isPhone: boolean): void {
    const pebbleCount = isPhone ? 120 : 380;
    const mushroomCount = isPhone ? 80 : 220;

    // 1. Pebbles
    const pebbleGeo = new THREE.DodecahedronGeometry(0.08, 1);
    pebbleGeo.scale(1.2, 0.45, 0.9);
    const pebbleMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#7F7870'),
      roughness: 0.9,
    });
    this.pebblesMesh = new THREE.InstancedMesh(pebbleGeo, pebbleMat, pebbleCount);
    this.pebblesMesh.name = 'ScatteredPebbles';

    const dummy = new THREE.Object3D();
    for (let i = 0; i < pebbleCount; i++) {
      const a = (i / pebbleCount) * Math.PI * 2;
      const r = 5.0 + ((i * 13.7) % 18.0);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = terrainHeight(x, z);
      dummy.position.set(x, y + 0.02, z);
      dummy.rotation.set(0.1, i * 1.5, 0.1);
      dummy.scale.setScalar(0.7 + (i % 5) * 0.15);
      dummy.updateMatrix();
      this.pebblesMesh.setMatrixAt(i, dummy.matrix);
    }
    this.pebblesMesh.instanceMatrix.needsUpdate = true;
    this.add(this.pebblesMesh);

    // 2. Mushrooms
    const shroomCap = new THREE.ConeGeometry(0.065, 0.05, 8);
    shroomCap.translate(0, 0.06, 0);
    const shroomStem = new THREE.CylinderGeometry(0.015, 0.02, 0.08, 6);
    shroomStem.translate(0, 0.04, 0);

    const shroomMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#D9784E'),
      roughness: 0.7,
    });
    this.mushroomsMesh = new THREE.InstancedMesh(shroomCap, shroomMat, mushroomCount);
    this.mushroomsMesh.name = 'TreeRootMushrooms';

    for (let i = 0; i < mushroomCount; i++) {
      // Clustered near tree stands on Island A
      const standCenter = (i % 2 === 0) ? new THREE.Vector3(0, 0, 18) : new THREE.Vector3(-10, 0, -1);
      const rx = (Math.sin(i * 3.1) - 0.5) * 7.0;
      const rz = (Math.cos(i * 3.1) - 0.5) * 7.0;
      const x = standCenter.x + rx;
      const z = standCenter.z + rz;
      const y = terrainHeight(x, z);

      dummy.position.set(x, y, z);
      dummy.rotation.set(Math.sin(i) * 0.1, i * 0.8, Math.cos(i) * 0.1);
      dummy.scale.setScalar(0.85 + (i % 4) * 0.2);
      dummy.updateMatrix();
      this.mushroomsMesh.setMatrixAt(i, dummy.matrix);
    }
    this.mushroomsMesh.instanceMatrix.needsUpdate = true;
    this.add(this.mushroomsMesh);
  }

  override dispose(): void {
    if (this.flowerMesh) {
      this.flowerMesh.geometry.dispose();
      this.flowerMesh = null;
    }
    if (this.flowerMaterial) {
      this.flowerMaterial.dispose();
      this.flowerMaterial = null;
    }
    if (this.pebblesMesh) {
      this.pebblesMesh.geometry.dispose();
      (this.pebblesMesh.material as THREE.Material).dispose();
      this.pebblesMesh = null;
    }
    if (this.mushroomsMesh) {
      this.mushroomsMesh.geometry.dispose();
      (this.mushroomsMesh.material as THREE.Material).dispose();
      this.mushroomsMesh = null;
    }
    disposeObject3D(this);
  }
}
