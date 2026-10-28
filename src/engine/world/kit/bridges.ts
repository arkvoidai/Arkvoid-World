import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BRIDGES } from '@/engine/world/layout';
import { createBeveledBoxGeometry, applyVertexWear } from './bevel';
import { createCarvedPostGeometry } from './stairs';
import { createStoneLanternGeometry } from './lanterns';
import type { MaterialLibrary } from '@/engine/world/MaterialLibrary';

/**
 * Builds realistic East Asian stone arch bridges:
 * - Single stone vault arch underneath for Bridge A->B
 * - Gentle double stone arch with central pier for Bridge B->C
 * - Solid stone ashlar parapets with moulded caps
 * - Instanced carved end posts (lotus finials)
 * - Lantern posts placed every ~6 meters
 * - Warm stone paving deck with vertex wear and moss patches
 */
export function createStoneArchBridgesGroup(
  materials: MaterialLibrary,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'StoneArchBridges';

  const stoneMat = materials.getMaterial('stone', {
    tint: '#BDB3A3',
    vertexColors: true,
  });
  const pathMat = materials.getMaterial('path', {
    tint: '#BDB3A3',
    roughnessScale: 0.9,
  });

  const deckParts: THREE.BufferGeometry[] = [];
  const parapetParts: THREE.BufferGeometry[] = [];
  const vaultParts: THREE.BufferGeometry[] = [];
  const postParts: THREE.BufferGeometry[] = [];
  const lanternStoneParts: THREE.BufferGeometry[] = [];
  const lanternLightParts: THREE.BufferGeometry[] = [];

  for (let bIdx = 0; bIdx < BRIDGES.length; bIdx++) {
    const bridge = BRIDGES[bIdx]!;
    const pts = bridge.points;
    const segs = pts.length - 1;
    const halfW = bridge.width * 0.5;
    const deckThickness = 0.28;

    const startPt = pts[0]!;
    const endPt = pts[segs]!;
    const spanLength = bridge.totalLengthXZ;

    // 1. Deck segments along bridge polyline
    for (let i = 0; i < segs; i++) {
      const p0 = pts[i]!;
      const p1 = pts[i + 1]!;
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const dz = p1.z - p0.z;
      const segLen = Math.hypot(dx, dy, dz);
      const midX = (p0.x + p1.x) * 0.5;
      const midY = (p0.y + p1.y) * 0.5;
      const midZ = (p0.z + p1.z) * 0.5;

      const yaw = Math.atan2(bridge.dirX, bridge.dirZ);
      const pitch = -Math.atan2(dy, Math.hypot(dx, dz));
      const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
      const mat = new THREE.Matrix4();

      // Walkable stone slab deck
      const slab = createBeveledBoxGeometry(bridge.width, deckThickness, segLen + 0.04, 0.02, 4, 2, 2);
      mat.compose(
        new THREE.Vector3(midX, midY - deckThickness * 0.5, midZ),
        quat,
        new THREE.Vector3(1, 1, 1),
      );
      slab.applyMatrix4(mat);
      deckParts.push(slab);

      // Parapets on both sides
      const paraH = 0.78;
      const paraW = 0.24;
      for (const side of [-1, 1]) {
        const curbOffset = side * (halfW - paraW * 0.5);
        const px = midX + bridge.normalX * curbOffset;
        const pz = midZ + bridge.normalZ * curbOffset;

        const parapet = createBeveledBoxGeometry(paraW, paraH, segLen + 0.04, 0.02, 2, 2, 2);
        mat.compose(
          new THREE.Vector3(px, midY + paraH * 0.5, pz),
          quat,
          new THREE.Vector3(1, 1, 1),
        );
        parapet.applyMatrix4(mat);
        parapetParts.push(parapet);
      }
    }

    // 2. Stone Arch Vault underneath
    // For Bridge A->B: single stone arch barrel underneath
    // For Bridge B->C: double stone arch with central support pier
    const isDoubleArch = bridge.id === 'bridge-bc';
    const numArches = isDoubleArch ? 2 : 1;
    const archSpan = spanLength / numArches;

    for (let a = 0; a < numArches; a++) {
      const archFrac0 = a / numArches;
      const archFrac1 = (a + 1) / numArches;
      const pA = pts[Math.floor(archFrac0 * segs)]!;
      const pB = pts[Math.floor(archFrac1 * segs)]!;
      const midArchX = (pA.x + pB.x) * 0.5;
      const midArchY = (pA.y + pB.y) * 0.5;
      const midArchZ = (pA.z + pB.z) * 0.5;

      const archVault = createBeveledBoxGeometry(
        bridge.width * 0.88,
        1.4,
        archSpan * 0.85,
        0.04,
        4,
        4,
        6,
      );
      const yaw = Math.atan2(bridge.dirX, bridge.dirZ);
      archVault.rotateY(yaw);
      archVault.translate(midArchX, midArchY - 1.1, midArchZ);
      vaultParts.push(archVault);
    }

    // Central pier for double arch
    if (isDoubleArch) {
      const midPt = pts[Math.floor(segs * 0.5)]!;
      const pier = createBeveledBoxGeometry(bridge.width * 1.05, 4.5, 1.8, 0.04, 4, 4, 4);
      pier.translate(midPt.x, midPt.y - 2.4, midPt.z);
      vaultParts.push(pier);
    }

    // 3. Carved terminal posts at bridge ends
    for (const pt of [startPt, endPt]) {
      for (const side of [-1, 1]) {
        const px = pt.x + bridge.normalX * (side * (halfW - 0.12));
        const pz = pt.z + bridge.normalZ * (side * (halfW - 0.12));
        const post = createCarvedPostGeometry(0.28, 1.05);
        post.translate(px, pt.y + 0.52, pz);
        postParts.push(post);
      }
    }

    // 4. Lantern posts every ~6 meters along the bridge parapet
    const stepInterval = Math.max(2, Math.floor(6.0 / (spanLength / segs)));
    for (let i = stepInterval; i < segs - 1; i += stepInterval) {
      const pt = pts[i]!;
      for (const side of [-1, 1]) {
        const px = pt.x + bridge.normalX * (side * (halfW - 0.08));
        const pz = pt.z + bridge.normalZ * (side * (halfW - 0.08));
        const { stone, lightCore } = createStoneLanternGeometry(1.6, 0.44);
        stone.translate(px, pt.y + 0.78, pz);
        lightCore.translate(px, pt.y + 0.78, pz);
        lanternStoneParts.push(stone);
        lanternLightParts.push(lightCore);
      }
    }
  }

  // Merge geometries
  const mergedDeck = mergeGeometries(deckParts, false);
  const mergedParapets = mergeGeometries(parapetParts, false);
  const mergedVaults = mergeGeometries(vaultParts, false);
  const mergedPosts = mergeGeometries(postParts, false);
  const mergedLanternStones = mergeGeometries(lanternStoneParts, false);

  for (const g of deckParts) g.dispose();
  for (const g of parapetParts) g.dispose();
  for (const g of vaultParts) g.dispose();
  for (const g of postParts) g.dispose();
  for (const g of lanternStoneParts) g.dispose();

  applyVertexWear(mergedDeck, -4, 4, 0.35, 0.18);
  applyVertexWear(mergedParapets, -4, 4, 0.4, 0.22);
  applyVertexWear(mergedVaults, -10, 2, 0.55, 0.3);
  applyVertexWear(mergedPosts, -4, 4, 0.3, 0.15);

  const deckMesh = new THREE.Mesh(mergedDeck, pathMat);
  deckMesh.castShadow = true;
  deckMesh.receiveShadow = true;

  const parapetMesh = new THREE.Mesh(mergedParapets, stoneMat);
  parapetMesh.castShadow = true;
  parapetMesh.receiveShadow = true;

  const vaultMesh = new THREE.Mesh(mergedVaults, stoneMat);
  vaultMesh.castShadow = true;
  vaultMesh.receiveShadow = true;

  const postMesh = new THREE.Mesh(mergedPosts, stoneMat);
  postMesh.castShadow = true;

  const lanternStoneMesh = new THREE.Mesh(mergedLanternStones, stoneMat);
  lanternStoneMesh.castShadow = true;

  group.add(deckMesh, parapetMesh, vaultMesh, postMesh, lanternStoneMesh);

  if (lanternLightParts.length > 0) {
    const mergedLight = mergeGeometries(lanternLightParts, false);
    for (const g of lanternLightParts) g.dispose();
    const lightMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#FFA65C'),
      transparent: true,
      opacity: 0.85,
    });
    const lightMesh = new THREE.Mesh(mergedLight, lightMat);
    lightMesh.name = 'BridgeLanternLights';
    group.add(lightMesh);
  }

  return group;
}
