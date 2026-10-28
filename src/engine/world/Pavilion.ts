import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PAVILION_COLUMNS } from '@/engine/world/layout';
import type { WorldMaterialBank } from '@/engine/world/materials';

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Creates a rounded-box BufferGeometry with smooth beveled edges and no UVs.
 */
function createRoundedBoxGeometry(
  width: number,
  height: number,
  depth: number,
  bevelRadius = 0.08,
  segX = 12,
  segY = 4,
  segZ = 12,
): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(width, height, depth, segX, segY, segZ);
  geo.deleteAttribute('uv');

  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const hx = Math.max(0.01, width * 0.5 - bevelRadius);
  const hy = Math.max(0.01, height * 0.5 - bevelRadius);
  const hz = Math.max(0.01, depth * 0.5 - bevelRadius);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);

    const cx = Math.max(-hx, Math.min(hx, x));
    const cy = Math.max(-hy, Math.min(hy, y));
    const cz = Math.max(-hz, Math.min(hz, z));

    const dx = x - cx;
    const dy = y - cy;
    const dz = z - cz;
    const len = Math.hypot(dx, dy, dz);
    if (len > 1e-5) {
      pos.setXYZ(
        i,
        cx + (dx / len) * bevelRadius,
        cy + (dy / len) * bevelRadius,
        cz + (dz / len) * bevelRadius,
      );
    }
  }

  geo.computeVertexNormals();
  return geo;
}

/**
 * Parametric hip roof geometry with sweeping upturned eaves.
 */
function createParametricHipRoofGeometry(
  baseWidth = 9.0,
  baseDepth = 7.0,
  overhang = 1.2,
  H = 2.05,
  U = 0.55,
  thickness = 0.18,
  gridX = 36,
  gridZ = 30,
): THREE.BufferGeometry {
  const halfW = baseWidth * 0.5 + overhang; // 5.7 m
  const halfD = baseDepth * 0.5 + overhang; // 4.7 m
  const ridgeHalfLen = Math.max(0.6, (baseWidth - baseDepth) * 0.5); // 1.0 m ridge along X

  const evalHeight = (x: number, z: number): number => {
    const ax = Math.abs(x);
    const az = Math.abs(z);

    const excessX = Math.max(0, ax - ridgeHalfLen);
    const rx = excessX / (halfW - ridgeHalfLen);
    const rz = az / halfD;

    const r = Math.min(
      1.08,
      Math.max(rx, rz) * 0.86 + Math.hypot(rx, rz) * 0.14,
    );
    const clampedR = Math.min(1, r);

    const diag = smoothstep(0.35, 1.0, (ax / halfW) * (az / halfD));
    const upturnMask = 0.35 + 0.65 * diag;

    const s = smoothstep(0.78, 1.0, clampedR);
    const h =
      H * Math.pow(Math.max(0, 1 - clampedR), 1.6) + U * (s * s) * upturnMask;
    return h;
  };

  const cols = gridX + 1;
  const rows = gridZ + 1;
  const topCount = cols * rows;
  const totalVerts = topCount * 2;

  const positions = new Float32Array(totalVerts * 3);
  const indices: number[] = [];

  let vIdx = 0;
  for (let iz = 0; iz <= gridZ; iz++) {
    const z = ((iz / gridZ) * 2 - 1) * halfD;
    for (let ix = 0; ix <= gridX; ix++) {
      const x = ((ix / gridX) * 2 - 1) * halfW;
      const y = evalHeight(x, z);
      positions[vIdx++] = x;
      positions[vIdx++] = y;
      positions[vIdx++] = z;
    }
  }

  for (let iz = 0; iz <= gridZ; iz++) {
    const z = ((iz / gridZ) * 2 - 1) * halfD;
    for (let ix = 0; ix <= gridX; ix++) {
      const x = ((ix / gridX) * 2 - 1) * halfW;
      const y = evalHeight(x, z) - thickness;
      positions[vIdx++] = x;
      positions[vIdx++] = y;
      positions[vIdx++] = z;
    }
  }

  for (let iz = 0; iz < gridZ; iz++) {
    for (let ix = 0; ix < gridX; ix++) {
      const a = iz * cols + ix;
      const b = a + cols;
      const c = b + 1;
      const d = a + 1;
      indices.push(a, b, c, a, c, d);
    }
  }

  const botOffset = topCount;
  for (let iz = 0; iz < gridZ; iz++) {
    for (let ix = 0; ix < gridX; ix++) {
      const a = botOffset + iz * cols + ix;
      const b = a + cols;
      const c = b + 1;
      const d = a + 1;
      indices.push(a, c, b, a, d, c);
    }
  }

  const addQuad = (t0: number, t1: number, b1: number, b0: number) => {
    indices.push(t0, b0, b1, t0, b1, t1);
  };

  for (let ix = 0; ix < gridX; ix++) {
    const t0 = ix;
    const t1 = ix + 1;
    addQuad(t1, t0, botOffset + t0, botOffset + t1);
  }
  for (let ix = 0; ix < gridX; ix++) {
    const t0 = gridZ * cols + ix;
    const t1 = t0 + 1;
    addQuad(t0, t1, botOffset + t1, botOffset + t0);
  }
  for (let iz = 0; iz < gridZ; iz++) {
    const t0 = iz * cols;
    const t1 = (iz + 1) * cols;
    addQuad(t0, t1, botOffset + t1, botOffset + t0);
  }
  for (let iz = 0; iz < gridZ; iz++) {
    const t0 = iz * cols + gridX;
    const t1 = (iz + 1) * cols + gridX;
    addQuad(t1, t0, botOffset + t0, botOffset + t1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds the Dawn Terrace Pavilion at (12, 0, -6):
 * - Platform: warm paving stone #BDB3A3
 * - Columns: rich timber #5B3F2B with gold #D9A441 collars
 * - Roof tiles: slate-teal #3F4F55 with subtle glazed sheen
 * - Four hanging eave lanterns with dark timber caps and warm paper glow
 */
export function createPavilion(materials: WorldMaterialBank): THREE.Group {
  const group = new THREE.Group();
  group.name = 'DawnTerracePavilion';

  const centerX = 12;
  const centerZ = -6;
  const platformH = 0.35;
  const colH = 3.35;
  const eaveBaseY = platformH + colH;

  const platformParts: THREE.BufferGeometry[] = [];
  const columnParts: THREE.BufferGeometry[] = [];
  const goldParts: THREE.BufferGeometry[] = [];
  const lanternSphereParts: THREE.BufferGeometry[] = [];

  // 1. Platform: 9 m x 7 m, 0.35 m high paving stone base at (12, 0, -6)
  const mainPlatform = createRoundedBoxGeometry(9.0, platformH, 7.0, 0.07);
  mainPlatform.translate(centerX, platformH * 0.5, centerZ);
  platformParts.push(mainPlatform);

  // Three shallow steps on the plaza-facing side
  const stepSpecs = [
    { x: 7.275, h: 0.27, depth: 0.45 },
    { x: 6.825, h: 0.18, depth: 0.45 },
    { x: 6.375, h: 0.09, depth: 0.45 },
  ];
  for (const st of stepSpecs) {
    const stepGeo = createRoundedBoxGeometry(st.depth, st.h, 3.6, 0.03, 4, 2, 6);
    stepGeo.translate(st.x, st.h * 0.5, centerZ);
    platformParts.push(stepGeo);
  }

  // 2. Six columns around perimeter: rich timber #5B3F2B with gold collars
  const lathePoints = [
    new THREE.Vector2(0.24, 0.0),
    new THREE.Vector2(0.24, 0.12),
    new THREE.Vector2(0.22, 0.18),
    new THREE.Vector2(0.2, colH * 0.52),
    new THREE.Vector2(0.18, colH - 0.22),
    new THREE.Vector2(0.23, colH - 0.08),
    new THREE.Vector2(0.23, colH),
  ];
  const baseColumnGeo = new THREE.LatheGeometry(lathePoints, 20);
  baseColumnGeo.deleteAttribute('uv');

  const baseCollarGeo = new THREE.TorusGeometry(0.195, 0.022, 10, 24);
  baseCollarGeo.rotateX(Math.PI * 0.5);
  baseCollarGeo.deleteAttribute('uv');

  for (const col of PAVILION_COLUMNS) {
    const cGeo = baseColumnGeo.clone();
    cGeo.translate(col.x, platformH, col.z);
    columnParts.push(cGeo);

    const collarTop = baseCollarGeo.clone();
    collarTop.translate(col.x, platformH + colH - 0.22, col.z);
    goldParts.push(collarTop);

    const collarBot = baseCollarGeo.clone();
    collarBot.scale(1.12, 1.0, 1.12);
    collarBot.translate(col.x, platformH + 0.18, col.z);
    goldParts.push(collarBot);
  }
  baseColumnGeo.dispose();
  baseCollarGeo.dispose();

  // 3. Under-roof timber ceiling frame
  const ceilingGeo = createRoundedBoxGeometry(8.6, 0.12, 6.6, 0.03, 4, 2, 4);
  ceilingGeo.translate(centerX, eaveBaseY - 0.02, centerZ);
  columnParts.push(ceilingGeo);

  // 4. Parametric Hip Roof (slate-teal #3F4F55 glazed tiles)
  const roofGeo = createParametricHipRoofGeometry(
    9.0,
    7.0,
    1.2,
    2.05,
    0.55,
    0.18,
  );
  roofGeo.translate(centerX, eaveBaseY, centerZ);

  // Gold ridge cap + finial
  const ridgeCapGeo = createRoundedBoxGeometry(2.3, 0.14, 0.22, 0.04, 6, 2, 2);
  ridgeCapGeo.translate(centerX, eaveBaseY + 2.07, centerZ);
  goldParts.push(ridgeCapGeo);

  const finialBaseGeo = new THREE.CylinderGeometry(0.06, 0.14, 0.22, 14);
  finialBaseGeo.deleteAttribute('uv');
  finialBaseGeo.translate(centerX, eaveBaseY + 2.2, centerZ);
  goldParts.push(finialBaseGeo);

  const finialSphereGeo = new THREE.SphereGeometry(0.18, 16, 12);
  finialSphereGeo.deleteAttribute('uv');
  finialSphereGeo.translate(centerX, eaveBaseY + 2.4, centerZ);
  goldParts.push(finialSphereGeo);

  // 5. Four hanging eave lanterns
  const eaveCorners = [
    { x: centerX - 5.2, z: centerZ - 4.2 },
    { x: centerX + 5.2, z: centerZ - 4.2 },
    { x: centerX - 5.2, z: centerZ + 4.2 },
    { x: centerX + 5.2, z: centerZ + 4.2 },
  ];
  const eaveCornerAnchorY = eaveBaseY + 0.22;
  const threadLen = 0.65;

  for (const corner of eaveCorners) {
    const threadGeo = new THREE.CylinderGeometry(0.012, 0.012, threadLen, 6);
    threadGeo.deleteAttribute('uv');
    threadGeo.translate(
      corner.x,
      eaveCornerAnchorY - threadLen * 0.5,
      corner.z,
    );
    goldParts.push(threadGeo);

    const capGeo = new THREE.ConeGeometry(0.21, 0.1, 14);
    capGeo.deleteAttribute('uv');
    capGeo.translate(corner.x, eaveCornerAnchorY - threadLen + 0.04, corner.z);
    columnParts.push(capGeo); // Dark timber cap

    const tasselGeo = new THREE.CylinderGeometry(0.04, 0.015, 0.12, 8);
    tasselGeo.deleteAttribute('uv');
    tasselGeo.translate(
      corner.x,
      eaveCornerAnchorY - threadLen - 0.34,
      corner.z,
    );
    goldParts.push(tasselGeo);

    const sphereGeo = new THREE.SphereGeometry(0.18, 14, 12);
    sphereGeo.deleteAttribute('uv');
    sphereGeo.translate(
      corner.x,
      eaveCornerAnchorY - threadLen - 0.14,
      corner.z,
    );
    lanternSphereParts.push(sphereGeo);
  }

  const mergedPlatform = mergeGeometries(platformParts, false);
  const mergedColumns = mergeGeometries(columnParts, false);
  const mergedGold = mergeGeometries(goldParts, false);
  const mergedLanterns = mergeGeometries(lanternSphereParts, false);

  for (const g of platformParts) g.dispose();
  for (const g of columnParts) g.dispose();
  for (const g of goldParts) g.dispose();
  for (const g of lanternSphereParts) g.dispose();

  const platformMesh = new THREE.Mesh(mergedPlatform, materials.pavingStone);
  platformMesh.castShadow = true;
  platformMesh.receiveShadow = true;

  const columnMesh = new THREE.Mesh(mergedColumns, materials.timber);
  columnMesh.castShadow = true;
  columnMesh.receiveShadow = true;

  const roofMesh = new THREE.Mesh(roofGeo, materials.glazedTile);
  roofMesh.castShadow = true;
  roofMesh.receiveShadow = true;

  const goldMesh = new THREE.Mesh(mergedGold, materials.gold);
  goldMesh.castShadow = true;

  const lanternMesh = new THREE.Mesh(mergedLanterns, materials.emissiveWarm);

  group.add(platformMesh, columnMesh, roofMesh, goldMesh, lanternMesh);

  return group;
}
