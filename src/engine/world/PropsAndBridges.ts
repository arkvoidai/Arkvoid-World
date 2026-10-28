import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  BELL_COLUMNS,
  BRIDGES,
  type BridgeDef,
  createSeededRandom,
  islandSurfaceUndulation,
  LANTERN_PLACEMENTS,
  SPOTS,
  TREE_PLACEMENTS,
} from '@/engine/world/layout';
import {
  WORLD_PALETTE,
  type WorldMaterialBank,
} from '@/engine/world/materials';

/**
 * 1. Builds the 12 Plaza Lantern Posts with dark timber frames (#5B3F2B),
 * gold collars (#D9A441), and warm paper glow.
 */
export function createLanternPosts(materials: WorldMaterialBank): THREE.Group {
  const group = new THREE.Group();
  group.name = 'PlazaLanternPosts';
  const count = LANTERN_PLACEMENTS.length;

  const postProfile = [
    new THREE.Vector2(0.16, 0.0),
    new THREE.Vector2(0.16, 0.14),
    new THREE.Vector2(0.11, 0.24),
    new THREE.Vector2(0.085, 1.85),
    new THREE.Vector2(0.13, 1.96),
    new THREE.Vector2(0.13, 2.02),
  ];
  const postGeo = new THREE.LatheGeometry(postProfile, 14);
  postGeo.deleteAttribute('uv');

  const collarGeo = new THREE.CylinderGeometry(0.135, 0.135, 0.05, 14);
  collarGeo.deleteAttribute('uv');
  collarGeo.translate(0, 1.98, 0);

  const capGeo = new THREE.ConeGeometry(0.24, 0.14, 14);
  capGeo.deleteAttribute('uv');
  capGeo.translate(0, 2.38, 0);

  const finialGeo = new THREE.SphereGeometry(0.04, 8, 8);
  finialGeo.deleteAttribute('uv');
  finialGeo.translate(0, 2.47, 0);

  const goldGeo = mergeGeometries([collarGeo, capGeo, finialGeo], false);
  collarGeo.dispose();
  capGeo.dispose();
  finialGeo.dispose();

  const glowGeo = new THREE.SphereGeometry(0.15, 14, 12);
  glowGeo.deleteAttribute('uv');
  glowGeo.translate(0, 2.18, 0);

  const postInstanced = new THREE.InstancedMesh(
    postGeo,
    materials.timber,
    count,
  );
  const goldInstanced = new THREE.InstancedMesh(goldGeo, materials.gold, count);
  const glowInstanced = new THREE.InstancedMesh(
    glowGeo,
    materials.lanternGlow,
    count,
  );

  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const l = LANTERN_PLACEMENTS[i]!;
    dummy.position.set(l.x, l.y, l.z);
    dummy.rotation.set(0, l.yaw, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    postInstanced.setMatrixAt(i, dummy.matrix);
    goldInstanced.setMatrixAt(i, dummy.matrix);
    glowInstanced.setMatrixAt(i, dummy.matrix);
  }

  postInstanced.instanceMatrix.needsUpdate = true;
  goldInstanced.instanceMatrix.needsUpdate = true;
  glowInstanced.instanceMatrix.needsUpdate = true;

  group.add(postInstanced, goldInstanced, glowInstanced);
  return group;
}

/**
 * 2. Builds the Bell Pavilion at (6, 0, -17) with paving stone platform,
 * rich timber columns, slate-teal roof, and lathe oxidized bronze bell.
 */
export function createBellPavilion(materials: WorldMaterialBank): THREE.Group {
  const group = new THREE.Group();
  group.name = 'BellPavilion';

  const bx = SPOTS.bell.position.x;
  const bz = SPOTS.bell.position.z;
  const platH = 0.22;
  const colH = 2.75;
  const eaveY = platH + colH;

  const stoneParts: THREE.BufferGeometry[] = [];
  const timberParts: THREE.BufferGeometry[] = [];
  const goldParts: THREE.BufferGeometry[] = [];

  // Paving stone platform base
  const platGeo = new THREE.BoxGeometry(3.2, platH, 3.2);
  platGeo.deleteAttribute('uv');
  platGeo.translate(bx, platH * 0.5, bz);
  stoneParts.push(platGeo);

  // 4 slim timber columns
  const colProfile = [
    new THREE.Vector2(0.17, 0),
    new THREE.Vector2(0.15, 0.14),
    new THREE.Vector2(0.13, colH - 0.16),
    new THREE.Vector2(0.16, colH),
  ];
  const baseCol = new THREE.LatheGeometry(colProfile, 16);
  baseCol.deleteAttribute('uv');

  for (const c of BELL_COLUMNS) {
    const cg = baseCol.clone();
    cg.translate(c.x, platH, c.z);
    timberParts.push(cg);

    const ring = new THREE.TorusGeometry(0.14, 0.018, 8, 20);
    ring.rotateX(Math.PI * 0.5);
    ring.deleteAttribute('uv');
    ring.translate(c.x, platH + colH - 0.16, c.z);
    goldParts.push(ring);
  }
  baseCol.dispose();

  // Crossbeam under roof
  const beamGeo = new THREE.BoxGeometry(2.7, 0.14, 0.18);
  beamGeo.deleteAttribute('uv');
  beamGeo.translate(bx, eaveY - 0.06, bz);
  timberParts.push(beamGeo);

  // Oxidized bronze bell with lathe profile
  const bellProfile = [
    new THREE.Vector2(0.01, 0.92),
    new THREE.Vector2(0.12, 0.9),
    new THREE.Vector2(0.24, 0.78),
    new THREE.Vector2(0.3, 0.52),
    new THREE.Vector2(0.34, 0.22),
    new THREE.Vector2(0.42, 0.04),
    new THREE.Vector2(0.39, 0.0),
    new THREE.Vector2(0.32, 0.18),
  ];
  const bellGeo = new THREE.LatheGeometry(bellProfile, 24);
  bellGeo.deleteAttribute('uv');
  bellGeo.translate(bx, eaveY - 1.28, bz);

  // Hanging chain/rod
  const chainGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.42, 10);
  chainGeo.deleteAttribute('uv');
  chainGeo.translate(bx, eaveY - 0.26, bz);
  goldParts.push(chainGeo);

  // Miniature upturned pyramid roof in slate-teal glazed tile
  const roofSize = 3.9;
  const roofGrid = 18;
  const roofGeo = new THREE.PlaneGeometry(
    roofSize,
    roofSize,
    roofGrid,
    roofGrid,
  );
  roofGeo.rotateX(-Math.PI * 0.5);
  roofGeo.deleteAttribute('uv');
  const rPos = roofGeo.getAttribute('position') as THREE.BufferAttribute;
  const halfR = roofSize * 0.5;
  for (let i = 0; i < rPos.count; i++) {
    const x = rPos.getX(i);
    const z = rPos.getZ(i);
    const r = Math.min(
      1.05,
      Math.max(Math.abs(x), Math.abs(z)) / halfR * 0.85 +
        Math.hypot(x, z) / (halfR * 1.414) * 0.15,
    );
    const cr = Math.min(1, r);
    const diag = (Math.abs(x) / halfR) * (Math.abs(z) / halfR);
    const s = Math.max(0, Math.min(1, (cr - 0.72) / 0.28));
    const h = 1.15 * Math.pow(1 - cr, 1.5) + 0.32 * s * s * (0.35 + 0.65 * diag);
    rPos.setY(i, eaveY + h);
    rPos.setX(i, bx + x);
    rPos.setZ(i, bz + z);
  }
  roofGeo.computeVertexNormals();

  const finial = new THREE.SphereGeometry(0.13, 12, 10);
  finial.deleteAttribute('uv');
  finial.translate(bx, eaveY + 1.24, bz);
  goldParts.push(finial);

  const mergedStone = mergeGeometries(stoneParts, false);
  const mergedTimber = mergeGeometries(timberParts, false);
  const mergedGold = mergeGeometries(goldParts, false);
  for (const g of stoneParts) g.dispose();
  for (const g of timberParts) g.dispose();
  for (const g of goldParts) g.dispose();

  // Oxidized bronze material for the bell
  const bronzeMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(WORLD_PALETTE.bronze),
    metalness: 0.75,
    roughness: 0.45,
  });

  group.add(new THREE.Mesh(mergedStone, materials.pavingStone));
  group.add(new THREE.Mesh(mergedTimber, materials.timber));
  group.add(new THREE.Mesh(mergedGold, materials.gold));
  group.add(new THREE.Mesh(bellGeo, bronzeMat));
  group.add(new THREE.Mesh(roofGeo, materials.glazedTile));

  return group;
}

/**
 * 3. Builds the Breath Pool at (-9, 0, -4):
 * Warm paving stone rim with inner gold line and cyan-teal water.
 */
export function createBreathPool(materials: WorldMaterialBank): THREE.Group {
  const group = new THREE.Group();
  group.name = 'BreathPool';

  const px = SPOTS['breath-pool'].position.x;
  const pz = SPOTS['breath-pool'].position.z;
  const py = islandSurfaceUndulation(px, pz);

  const stoneParts: THREE.BufferGeometry[] = [];

  const torusGeo = new THREE.TorusGeometry(2.4, 0.3, 18, 56);
  torusGeo.rotateX(Math.PI * 0.5);
  torusGeo.deleteAttribute('uv');
  torusGeo.translate(px, py + 0.22, pz);
  stoneParts.push(torusGeo);

  const apronGeo = new THREE.CylinderGeometry(2.74, 2.86, 0.14, 48);
  apronGeo.deleteAttribute('uv');
  apronGeo.translate(px, py + 0.06, pz);
  stoneParts.push(apronGeo);

  const basinFloor = new THREE.CylinderGeometry(2.35, 2.25, 0.08, 40);
  basinFloor.deleteAttribute('uv');
  basinFloor.translate(px, py + 0.08, pz);
  stoneParts.push(basinFloor);

  const mergedBasin = mergeGeometries(stoneParts, false);
  for (const g of stoneParts) g.dispose();

  const goldRimGeo = new THREE.TorusGeometry(2.14, 0.025, 10, 48);
  goldRimGeo.rotateX(Math.PI * 0.5);
  goldRimGeo.deleteAttribute('uv');
  goldRimGeo.translate(px, py + 0.3, pz);

  const waterGeo = new THREE.CircleGeometry(2.32, 48);
  waterGeo.rotateX(-Math.PI * 0.5);
  waterGeo.translate(px, py + 0.28, pz);

  group.add(new THREE.Mesh(mergedBasin, materials.pavingStone));
  group.add(new THREE.Mesh(goldRimGeo, materials.gold));
  group.add(new THREE.Mesh(waterGeo, materials.breathPoolWater));

  return group;
}

/**
 * Builds Blossom Tree variant geometries:
 * - Bark #6B5240
 * - Deep saturated foliage (#E8601C, #9B7BE0, #C23B22) with shaded interior core vertices
 */
function buildTreeVariantGeometries(variant: 0 | 1 | 2): {
  trunkGeo: THREE.BufferGeometry;
  canopyGeo: THREE.BufferGeometry;
} {
  const rng = createSeededRandom(7001 + variant * 409);

  const leanX = variant === 0 ? 0.45 : variant === 1 ? -0.38 : 0.32;
  const leanZ = variant === 0 ? -0.25 : variant === 1 ? 0.42 : 0.28;
  const height = variant === 0 ? 3.9 : variant === 1 ? 3.6 : 3.75;

  const curvePts = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(leanX * 0.25, height * 0.26, leanZ * 0.2),
    new THREE.Vector3(leanX * 0.65, height * 0.54, leanZ * 0.55),
    new THREE.Vector3(leanX * 0.92, height * 0.8, leanZ * 0.85),
    new THREE.Vector3(leanX * 1.1, height, leanZ * 1.05),
  ];
  const trunkCurve = new THREE.CatmullRomCurve3(curvePts);
  const mainTrunk = new THREE.TubeGeometry(trunkCurve, 16, 1.0, 9, false);
  mainTrunk.deleteAttribute('uv');

  const tPos = mainTrunk.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < tPos.count; i++) {
    const py = Math.max(0, tPos.getY(i));
    const u = Math.min(1, py / height);
    const center = trunkCurve.getPoint(u);
    const radius = 0.35 * Math.pow(1 - u, 0.72) + 0.08 * u;
    tPos.setXYZ(
      i,
      center.x + (tPos.getX(i) - center.x) * radius,
      py,
      center.z + (tPos.getZ(i) - center.z) * radius,
    );
  }
  mainTrunk.computeVertexNormals();

  const trunkParts: THREE.BufferGeometry[] = [mainTrunk];
  const branchOffsets = [
    { startU: 0.58, dx: -0.95, dy: 0.95, dz: 0.65 },
    { startU: 0.68, dx: 0.85, dy: 0.85, dz: -0.75 },
  ];

  const branchTipPositions: THREE.Vector3[] = [curvePts[4]!.clone()];

  for (const br of branchOffsets) {
    const pStart = trunkCurve.getPoint(br.startU);
    const pMid = new THREE.Vector3(
      pStart.x + br.dx * 0.55,
      pStart.y + br.dy * 0.6,
      pStart.z + br.dz * 0.55,
    );
    const pEnd = new THREE.Vector3(
      pStart.x + br.dx,
      pStart.y + br.dy,
      pStart.z + br.dz,
    );
    branchTipPositions.push(pEnd);

    const bCurve = new THREE.CatmullRomCurve3([pStart, pMid, pEnd]);
    const bTube = new THREE.TubeGeometry(bCurve, 8, 1.0, 7, false);
    bTube.deleteAttribute('uv');
    const bPos = bTube.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < bPos.count; i++) {
      const py = bPos.getY(i);
      const u = Math.max(0, Math.min(1, (py - pStart.y) / Math.max(0.1, br.dy)));
      const c = bCurve.getPoint(u);
      const r = 0.16 * (1 - u) + 0.06 * u;
      bPos.setXYZ(
        i,
        c.x + (bPos.getX(i) - c.x) * r,
        py,
        c.z + (bPos.getZ(i) - c.z) * r,
      );
    }
    bTube.computeVertexNormals();
    trunkParts.push(bTube);
  }

  const trunkGeo = mergeGeometries(trunkParts, false);
  for (const g of trunkParts) g.dispose();

  // Canopy of soft Icosahedron blobs with darker interior core shading
  const blobCount = variant === 0 ? 9 : 8;
  const canopyParts: THREE.BufferGeometry[] = [];

  // Deep foliage palettes per variant:
  // Variant 0: Maple orange #E8601C to gold #E8B923 with deep shadow #5A1E08
  // Variant 1: Maple red #C23B22 to orange #E8601C with deep shadow #4E1208
  // Variant 2: Wisteria #9B7BE0 to lavender #B9A6FF with deep shadow #351C55
  let cOuter: THREE.Color;
  let cMid: THREE.Color;
  let cCoreShadow: THREE.Color;

  if (variant === 0) {
    cOuter = new THREE.Color(WORLD_PALETTE.ginkgoGold);
    cMid = new THREE.Color(WORLD_PALETTE.mapleOrange);
    cCoreShadow = new THREE.Color('#5A1E08');
  } else if (variant === 1) {
    cOuter = new THREE.Color(WORLD_PALETTE.mapleOrange);
    cMid = new THREE.Color(WORLD_PALETTE.mapleRed);
    cCoreShadow = new THREE.Color('#4E1208');
  } else {
    cOuter = new THREE.Color(WORLD_PALETTE.lavender);
    cMid = new THREE.Color(WORLD_PALETTE.wisteria);
    cCoreShadow = new THREE.Color('#351C55');
  }

  const tmpColor = new THREE.Color();
  const crownCenter = curvePts[4]!.clone();

  for (let i = 0; i < blobCount; i++) {
    const anchor =
      i < branchTipPositions.length
        ? branchTipPositions[i]!
        : crownCenter;
    const angle = (i / blobCount) * Math.PI * 2 + rng() * 0.5;
    const spread = i === 0 ? 0.15 : 0.75 + rng() * 0.85;
    const bx = anchor.x + Math.cos(angle) * spread;
    const bz = anchor.z + Math.sin(angle) * spread;
    const by = anchor.y + (i === 0 ? 0.35 : (rng() - 0.35) * 0.65);
    const radius = i === 0 ? 1.25 : 0.78 + rng() * 0.45;

    const ico = new THREE.IcosahedronGeometry(radius, 1);
    ico.deleteAttribute('uv');
    ico.scale(1.18, 0.72, 1.18);
    ico.translate(bx, by, bz);

    const pos = ico.getAttribute('position') as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);

    for (let k = 0; k < pos.count; k++) {
      const vx = pos.getX(k);
      const vy = pos.getY(k);
      const vz = pos.getZ(k);

      // Distance from crown center gives interior depth (dark core vs luminous outer leaves)
      const distFromCenter = Math.hypot(
        vx - crownCenter.x,
        (vy - crownCenter.y) * 1.3,
        vz - crownCenter.z,
      );
      const coreFactor = Math.max(0, Math.min(1, (distFromCenter - 0.4) / 1.6));

      // Vertical gradient from bottom shadow to sunlit top
      const heightFactor = Math.max(0, Math.min(1, (vy - (crownCenter.y - 0.6)) / 1.5));

      tmpColor.copy(cCoreShadow).lerp(cMid, coreFactor);
      tmpColor.lerp(cOuter, Math.pow(heightFactor, 1.2) * 0.75);

      colors[k * 3] = tmpColor.r;
      colors[k * 3 + 1] = tmpColor.g;
      colors[k * 3 + 2] = tmpColor.b;
    }
    ico.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    ico.computeVertexNormals();
    canopyParts.push(ico);
  }

  const canopyGeo = mergeGeometries(canopyParts, false);
  for (const g of canopyParts) g.dispose();

  return { trunkGeo, canopyGeo };
}

/**
 * 4. Builds the 9 Blossom Trees across 3 variants with shaded interior vertices.
 */
export function createBlossomTrees(materials: WorldMaterialBank): THREE.Group {
  const group = new THREE.Group();
  group.name = 'BlossomTrees';

  const dummy = new THREE.Object3D();

  for (const variant of [0, 1, 2] as const) {
    const placements = TREE_PLACEMENTS.filter((t) => t.variant === variant);
    if (placements.length === 0) continue;

    const { trunkGeo, canopyGeo } = buildTreeVariantGeometries(variant);
    const trunkInstanced = new THREE.InstancedMesh(
      trunkGeo,
      materials.bark,
      placements.length,
    );
    const canopyInstanced = new THREE.InstancedMesh(
      canopyGeo,
      materials.blossomCanopy,
      placements.length,
    );

    for (let i = 0; i < placements.length; i++) {
      const p = placements[i]!;
      dummy.position.set(p.x, p.y - 0.08, p.z);
      dummy.rotation.set(0, p.yaw, 0);
      dummy.scale.set(p.scale, p.scale, p.scale);
      dummy.updateMatrix();
      trunkInstanced.setMatrixAt(i, dummy.matrix);
      canopyInstanced.setMatrixAt(i, dummy.matrix);
    }

    trunkInstanced.instanceMatrix.needsUpdate = true;
    canopyInstanced.instanceMatrix.needsUpdate = true;
    group.add(trunkInstanced, canopyInstanced);
  }

  return group;
}

/**
 * 5. Builds arched stone bridges with paving stone deck (#BDB3A3),
 * rich timber handrails (#5B3F2B), and gold finial caps (#D9A441).
 */
function buildBridgeGeometries(
  bridge: BridgeDef,
  postMatrices: THREE.Matrix4[],
  capMatrices: THREE.Matrix4[],
): {
  deckGeo: THREE.BufferGeometry;
  railGeo: THREE.BufferGeometry;
  trimGeo: THREE.BufferGeometry;
} {
  const pts = bridge.points;
  const segs = pts.length - 1;
  const halfW = bridge.width * 0.5;
  const deckThickness = 0.36;

  const deckParts: THREE.BufferGeometry[] = [];
  const railParts: THREE.BufferGeometry[] = [];
  const trimParts: THREE.BufferGeometry[] = [];

  for (let i = 0; i < segs; i++) {
    const p0 = pts[i]!;
    const p1 = pts[i + 1]!;
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const dz = p1.z - p0.z;
    const segLen3D = Math.hypot(dx, dy, dz);
    const midX = (p0.x + p1.x) * 0.5;
    const midY = (p0.y + p1.y) * 0.5;
    const midZ = (p0.z + p1.z) * 0.5;

    const yaw = Math.atan2(bridge.dirX, bridge.dirZ);
    const pitch = -Math.atan2(dy, Math.hypot(dx, dz));

    const orient = new THREE.Euler(pitch, yaw, 0, 'YXZ');
    const quat = new THREE.Quaternion().setFromEuler(orient);
    const mat = new THREE.Matrix4();

    // Main arched paving stone slab segment
    const slab = new THREE.BoxGeometry(
      bridge.width,
      deckThickness,
      segLen3D + 0.04,
    );
    slab.deleteAttribute('uv');
    mat.compose(
      new THREE.Vector3(midX, midY - deckThickness * 0.5, midZ),
      quat,
      new THREE.Vector3(1, 1, 1),
    );
    slab.applyMatrix4(mat);
    deckParts.push(slab);

    for (const side of [-1, 1]) {
      const curbOffset = side * (halfW - 0.12);
      const cx = midX + bridge.normalX * curbOffset;
      const cz = midZ + bridge.normalZ * curbOffset;

      const curb = new THREE.BoxGeometry(0.22, 0.1, segLen3D + 0.04);
      curb.deleteAttribute('uv');
      mat.compose(
        new THREE.Vector3(cx, midY + 0.05, cz),
        quat,
        new THREE.Vector3(1, 1, 1),
      );
      curb.applyMatrix4(mat);
      deckParts.push(curb);

      // Continuous timber handrail
      const rail = new THREE.BoxGeometry(0.1, 0.08, segLen3D + 0.05);
      rail.deleteAttribute('uv');
      mat.compose(
        new THREE.Vector3(cx, midY + 0.88, cz),
        quat,
        new THREE.Vector3(1, 1, 1),
      );
      rail.applyMatrix4(mat);
      railParts.push(rail);

      const midRail = new THREE.BoxGeometry(0.05, 0.045, segLen3D + 0.04);
      midRail.deleteAttribute('uv');
      mat.compose(
        new THREE.Vector3(cx, midY + 0.48, cz),
        quat,
        new THREE.Vector3(1, 1, 1),
      );
      midRail.applyMatrix4(mat);
      railParts.push(midRail);

      // Gold edge inlay line along deck border
      const edgeLine = new THREE.BoxGeometry(0.035, 0.02, segLen3D + 0.02);
      edgeLine.deleteAttribute('uv');
      const lx = midX + bridge.normalX * (side * (halfW - 0.26));
      const lz = midZ + bridge.normalZ * (side * (halfW - 0.26));
      mat.compose(
        new THREE.Vector3(lx, midY + 0.01, lz),
        quat,
        new THREE.Vector3(1, 1, 1),
      );
      edgeLine.applyMatrix4(mat);
      trimParts.push(edgeLine);
    }
  }

  // Instanced handrail posts
  const dummy = new THREE.Object3D();
  const yaw = Math.atan2(bridge.dirX, bridge.dirZ);
  for (let i = 0; i <= segs; i += 3) {
    const pt = pts[i]!;
    for (const side of [-1, 1]) {
      const px = pt.x + bridge.normalX * (side * (halfW - 0.12));
      const pz = pt.z + bridge.normalZ * (side * (halfW - 0.12));
      dummy.position.set(px, pt.y + 0.48, pz);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      postMatrices.push(dummy.matrix.clone());

      dummy.position.set(px, pt.y + 0.96, pz);
      dummy.updateMatrix();
      capMatrices.push(dummy.matrix.clone());
    }
  }

  const deckGeo = mergeGeometries(deckParts, false);
  const railGeo = mergeGeometries(railParts, false);
  const trimGeo = mergeGeometries(trimParts, false);
  for (const g of deckParts) g.dispose();
  for (const g of railParts) g.dispose();
  for (const g of trimParts) g.dispose();

  return { deckGeo, railGeo, trimGeo };
}

export function createBridges(materials: WorldMaterialBank): THREE.Group {
  const group = new THREE.Group();
  group.name = 'ArchedStoneBridges';

  const allDeckGeo: THREE.BufferGeometry[] = [];
  const allRailGeo: THREE.BufferGeometry[] = [];
  const allTrimGeo: THREE.BufferGeometry[] = [];
  const postMatrices: THREE.Matrix4[] = [];
  const capMatrices: THREE.Matrix4[] = [];

  for (const bridge of BRIDGES) {
    const { deckGeo, railGeo, trimGeo } = buildBridgeGeometries(
      bridge,
      postMatrices,
      capMatrices,
    );
    allDeckGeo.push(deckGeo);
    allRailGeo.push(railGeo);
    allTrimGeo.push(trimGeo);
  }

  const mergedDeck = mergeGeometries(allDeckGeo, false);
  const mergedRail = mergeGeometries(allRailGeo, false);
  const mergedGoldTrim = mergeGeometries(allTrimGeo, false);
  for (const g of allDeckGeo) g.dispose();
  for (const g of allRailGeo) g.dispose();
  for (const g of allTrimGeo) g.dispose();

  group.add(new THREE.Mesh(mergedDeck, materials.pavingStone));
  group.add(new THREE.Mesh(mergedRail, materials.timber));
  group.add(new THREE.Mesh(mergedGoldTrim, materials.gold));

  const postGeo = new THREE.BoxGeometry(0.14, 0.92, 0.14);
  postGeo.deleteAttribute('uv');
  const postInstanced = new THREE.InstancedMesh(
    postGeo,
    materials.pavingStone,
    postMatrices.length,
  );

  const capGeo = new THREE.SphereGeometry(0.085, 10, 8);
  capGeo.deleteAttribute('uv');
  const capInstanced = new THREE.InstancedMesh(
    capGeo,
    materials.gold,
    capMatrices.length,
  );

  for (let i = 0; i < postMatrices.length; i++) {
    postInstanced.setMatrixAt(i, postMatrices[i]!);
    capInstanced.setMatrixAt(i, capMatrices[i]!);
  }
  postInstanced.instanceMatrix.needsUpdate = true;
  capInstanced.instanceMatrix.needsUpdate = true;

  group.add(postInstanced, capInstanced);
  return group;
}
