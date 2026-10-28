import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { islandSurfaceUndulation, SPOTS } from '@/engine/world/layout';
import type { WorldMaterialBank } from '@/engine/world/materials';

/**
 * Builds a swept curved lintel beam (torus-arc profile with upturned ends).
 */
function createCurvedLintelGeometry(
  span = 5.8,
  radiusX = 0.28,
  radiusY = 0.34,
  upturn = 0.52,
  dip = 0.14,
  yOffset = 0,
): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  const steps = 28;
  for (let i = 0; i <= steps; i++) {
    const u = (i / steps) * 2 - 1;
    const x = u * (span * 0.5);
    const absU = Math.abs(u);
    const sagY = -dip * (1 - u * u);
    const tipTurn =
      absU > 0.55 ? Math.pow((absU - 0.55) / 0.45, 2.0) * upturn : 0;
    const y = yOffset + sagY + tipTurn;
    pts.push(new THREE.Vector3(x, y, 0));
  }

  const curve = new THREE.CatmullRomCurve3(pts);
  const tube = new THREE.TubeGeometry(curve, 32, 1.0, 12, false);
  tube.deleteAttribute('uv');

  const pos = tube.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    const pz = pos.getZ(i);
    const u = Math.max(-1, Math.min(1, px / (span * 0.5)));
    const centerPt = curve.getPoint((u + 1) * 0.5);
    const dy = py - centerPt.y;
    const dz = pz - centerPt.z;
    const tipTaper = 1 - Math.pow(Math.abs(u), 3) * 0.28;
    pos.setXYZ(
      i,
      px,
      centerPt.y + dy * radiusY * tipTaper,
      centerPt.z + dz * radiusX * tipTaper,
    );
  }

  tube.computeVertexNormals();
  return tube;
}

/**
 * Builds the Luminous Sealed Gate at (0, 0, -21) on Island A:
 * - Vermilion lacquer #B3342A posts and curved lintels
 * - Gold #D9A441 caps, rings, and crest medallion
 * - Paving stone #BDB3A3 threshold sill
 * - Purple-orange light veil
 */
export function createSealedGate(materials: WorldMaterialBank): THREE.Group {
  const group = new THREE.Group();
  group.name = 'LuminousSealedGate';

  const gateSpot = SPOTS.gate.position;
  const gx = gateSpot.x;
  const gz = gateSpot.z;
  const gy = islandSurfaceUndulation(gx, gz);

  const colSpacingHalf = 1.95;
  const colRadius = 0.4;
  const colHeight = 5.2;

  const lacquerParts: THREE.BufferGeometry[] = [];
  const goldParts: THREE.BufferGeometry[] = [];
  const stoneParts: THREE.BufferGeometry[] = [];

  // 1. Two tall vermilion lacquer columns (radius 0.4, height 5.2)
  const colProfile = [
    new THREE.Vector2(0.54, 0.0),
    new THREE.Vector2(0.54, 0.24),
    new THREE.Vector2(0.45, 0.36),
    new THREE.Vector2(colRadius, 0.48),
    new THREE.Vector2(colRadius * 0.96, colHeight * 0.65),
    new THREE.Vector2(colRadius * 0.92, colHeight - 0.35),
    new THREE.Vector2(0.46, colHeight - 0.14),
    new THREE.Vector2(0.46, colHeight),
  ];
  const baseColGeo = new THREE.LatheGeometry(colProfile, 24);
  baseColGeo.deleteAttribute('uv');

  for (const side of [-1, 1]) {
    const cx = gx + side * colSpacingHalf;
    const colGeo = baseColGeo.clone();
    colGeo.translate(cx, gy, gz);
    lacquerParts.push(colGeo);

    // Gold base ring and upper capital bands
    const botRing = new THREE.TorusGeometry(0.43, 0.032, 10, 28);
    botRing.rotateX(Math.PI * 0.5);
    botRing.deleteAttribute('uv');
    botRing.translate(cx, gy + 0.44, gz);
    goldParts.push(botRing);

    const topRing = new THREE.TorusGeometry(0.39, 0.035, 10, 28);
    topRing.rotateX(Math.PI * 0.5);
    topRing.deleteAttribute('uv');
    topRing.translate(cx, gy + colHeight - 0.36, gz);
    goldParts.push(topRing);

    const midRing = new THREE.TorusGeometry(0.395, 0.022, 8, 28);
    midRing.rotateX(Math.PI * 0.5);
    midRing.deleteAttribute('uv');
    midRing.translate(cx, gy + colHeight - 1.15, gz);
    goldParts.push(midRing);
  }
  baseColGeo.dispose();

  // 2. Curved lintels in vermilion lacquer
  const upperLintel = createCurvedLintelGeometry(
    6.4,
    0.32,
    0.36,
    0.58,
    0.12,
    gy + colHeight + 0.12,
  );
  upperLintel.translate(gx, 0, gz);
  lacquerParts.push(upperLintel);

  const lowerLintel = createCurvedLintelGeometry(
    5.4,
    0.22,
    0.2,
    0.26,
    0.06,
    gy + colHeight - 0.72,
  );
  lowerLintel.translate(gx, 0, gz);
  lacquerParts.push(lowerLintel);

  // Gold underline and crest medallion
  const goldUnderline = createCurvedLintelGeometry(
    6.2,
    0.12,
    0.07,
    0.55,
    0.12,
    gy + colHeight - 0.18,
  );
  goldUnderline.translate(gx, 0, gz);
  goldParts.push(goldUnderline);

  const crestRing = new THREE.TorusGeometry(0.36, 0.045, 12, 28);
  crestRing.deleteAttribute('uv');
  crestRing.translate(gx, gy + colHeight - 0.32, gz);
  goldParts.push(crestRing);

  // Threshold sill in paving stone
  const sillGeo = new THREE.BoxGeometry(3.5, 0.14, 0.72);
  sillGeo.deleteAttribute('uv');
  sillGeo.translate(gx, gy + 0.07, gz);
  stoneParts.push(sillGeo);

  // 3. Luminous veil plane between the columns
  const veilWidth = (colSpacingHalf - colRadius * 0.85) * 2;
  const veilHeight = colHeight - 0.88;
  const veilGeo = new THREE.PlaneGeometry(veilWidth, veilHeight, 16, 24);
  veilGeo.translate(gx, gy + 0.14 + veilHeight * 0.5, gz);
  const veilMesh = new THREE.Mesh(veilGeo, materials.gateVeil);
  group.add(veilMesh);

  // 4. Stepping stones path beyond veil toward Sanctuary (-10, 12, -120)
  const pathDirX = -10 / Math.hypot(-10, -99);
  const pathDirZ = -99 / Math.hypot(-10, -99);
  const pathYaw = Math.atan2(pathDirX, pathDirZ);

  const steppingStones = [
    { dist: 1.2, w: 2.8, d: 1.1, h: 0.18, yOff: 0.02, broken: 0 },
    { dist: 2.55, w: 2.5, d: 1.05, h: 0.18, yOff: 0.06, broken: 0.04 },
    { dist: 3.85, w: 2.2, d: 0.95, h: 0.16, yOff: 0.12, broken: -0.05 },
    { dist: 5.05, w: 1.75, d: 0.82, h: 0.15, yOff: 0.2, broken: 0.08 },
    { dist: 6.1, w: 1.2, d: 0.65, h: 0.14, yOff: 0.3, broken: -0.1 },
  ];

  for (const st of steppingStones) {
    const slab = new THREE.BoxGeometry(st.w, st.h, st.d);
    slab.deleteAttribute('uv');
    slab.rotateY(pathYaw + st.broken - Math.PI);
    slab.translate(
      gx + pathDirX * st.dist,
      gy + st.yOff,
      gz + pathDirZ * st.dist,
    );
    stoneParts.push(slab);
  }

  const mergedLacquer = mergeGeometries(lacquerParts, false);
  const mergedGold = mergeGeometries(goldParts, false);
  const mergedStone = mergeGeometries(stoneParts, false);

  for (const g of lacquerParts) g.dispose();
  for (const g of goldParts) g.dispose();
  for (const g of stoneParts) g.dispose();

  const lacquerMesh = new THREE.Mesh(mergedLacquer, materials.lacquerVermilion);
  lacquerMesh.castShadow = true;
  lacquerMesh.receiveShadow = true;

  const goldMesh = new THREE.Mesh(mergedGold, materials.gold);
  goldMesh.castShadow = true;

  const stoneMesh = new THREE.Mesh(mergedStone, materials.pavingStone);
  stoneMesh.receiveShadow = true;

  group.add(lacquerMesh, goldMesh, stoneMesh);

  return group;
}
