import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createBeveledBoxGeometry } from './bevel';

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Creates an authentic East Asian hip-and-gable roof geometry with:
 * - Curved ridge line (gentle sag in middle, rising towards ends)
 * - Concave slope (s-curve pitch)
 * - Upturned sweeping eave corners (feiyan)
 * - Box UV mapping with moss vertex coloring on north-facing slopes
 */
export function createHipAndGableRoofGeometry(
  width = 24.0,
  depth = 14.0,
  overhang = 1.8,
  height = 3.6,
  upturn = 0.85,
  thickness = 0.22,
  gridX = 36,
  gridZ = 28,
): THREE.BufferGeometry {
  const halfW = width * 0.5 + overhang;
  const halfD = depth * 0.5 + overhang;
  const ridgeAlongZ = depth > width;
  const ridgeHalfLen = Math.max(1.2, Math.abs(width - depth) * 0.48);

  // Height function for the roof surface
  const evalHeight = (x: number, z: number): { y: number; isNorth: boolean } => {
    const ax = Math.abs(x);
    const az = Math.abs(z);

    let rx: number;
    let rz: number;
    let ridgeFrac: number;
    if (ridgeAlongZ) {
      const excessZ = Math.max(0, az - ridgeHalfLen);
      rx = ax / halfW;
      rz = excessZ / Math.max(0.01, halfD - ridgeHalfLen);
      ridgeFrac = az / halfD;
    } else {
      const excessX = Math.max(0, ax - ridgeHalfLen);
      rx = excessX / Math.max(0.01, halfW - ridgeHalfLen);
      rz = az / halfD;
      ridgeFrac = ax / halfW;
    }

    // Concave pitch curve: steep near ridge, flattening towards eaves
    const r = Math.min(1.05, Math.max(rx, rz) * 0.85 + Math.hypot(rx, rz) * 0.15);
    const clampedR = Math.min(1, r);

    // Eave corner upturn
    const cornerMask = smoothstep(0.4, 1.0, (ax / halfW) * (az / halfD));
    const upturnHeight = upturn * Math.pow(smoothstep(0.72, 1.0, clampedR), 2.0) * (0.3 + 0.7 * cornerMask);

    // Ridge curvature: central ridge sags slightly, rising at ends
    const ridgeRise = Math.pow(ridgeFrac, 2.0) * 0.22;

    const baseH = height * Math.pow(Math.max(0, 1.0 - clampedR), 1.55);
    const y = baseH + upturnHeight + ridgeRise;

    return { y, isNorth: z < -0.1 };
  };

  const cols = gridX + 1;
  const rows = gridZ + 1;
  const topCount = cols * rows;
  const totalVerts = topCount * 2;

  const positions = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const colors = new Float32Array(totalVerts * 3);
  const indices: number[] = [];

  let vIdx = 0;
  let uvIdx = 0;
  let colIdx = 0;

  // Top surface
  for (let iz = 0; iz <= gridZ; iz++) {
    const tz = iz / gridZ;
    const z = (tz * 2 - 1) * halfD;
    for (let ix = 0; ix <= gridX; ix++) {
      const tx = ix / gridX;
      const x = (tx * 2 - 1) * halfW;
      const { y, isNorth } = evalHeight(x, z);

      positions[vIdx++] = x;
      positions[vIdx++] = y;
      positions[vIdx++] = z;

      // Realistic tile row UV mapping: 2.0 meters per tile
      uvs[uvIdx++] = x * 0.5;
      uvs[uvIdx++] = Math.hypot(y, z) * 0.5;

      // Subtle moss wear on north-facing edge (z < 0 and near eave)
      const eaveDist = Math.abs(z) / halfD;
      const isNorthEave = isNorth && eaveDist > 0.75;
      if (isNorthEave) {
        colors[colIdx++] = 0.78; // slight green-moss tint
        colors[colIdx++] = 0.92;
        colors[colIdx++] = 0.75;
      } else {
        colors[colIdx++] = 1.0;
        colors[colIdx++] = 1.0;
        colors[colIdx++] = 1.0;
      }
    }
  }

  // Bottom surface (underside)
  for (let iz = 0; iz <= gridZ; iz++) {
    const tz = iz / gridZ;
    const z = (tz * 2 - 1) * halfD;
    for (let ix = 0; ix <= gridX; ix++) {
      const tx = ix / gridX;
      const x = (tx * 2 - 1) * halfW;
      const { y } = evalHeight(x, z);

      positions[vIdx++] = x;
      positions[vIdx++] = y - thickness;
      positions[vIdx++] = z;

      uvs[uvIdx++] = x * 0.5;
      uvs[uvIdx++] = z * 0.5;

      colors[colIdx++] = 0.7; // darker underside
      colors[colIdx++] = 0.68;
      colors[colIdx++] = 0.66;
    }
  }

  // Top quads
  for (let iz = 0; iz < gridZ; iz++) {
    for (let ix = 0; ix < gridX; ix++) {
      const a = iz * cols + ix;
      const b = a + cols;
      const c = b + 1;
      const d = a + 1;
      indices.push(a, b, c, a, c, d);
    }
  }

  // Bottom quads (reversed winding)
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

  // Perimeter side skirts
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
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  return geo;
}

/**
 * Ridge cap geometry with cylindrical top roll and ornamental end pieces (chiwei).
 */
export function createRidgeCapGeometry(
  length = 16.0,
  radius = 0.16,
): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Main cylindrical roll along X
  const roll = new THREE.CylinderGeometry(radius, radius, length, 12);
  roll.rotateZ(Math.PI / 2);
  parts.push(roll);

  // Ornamental end finial (chiwei) on both ends with gold rim
  for (const dir of [-1, 1]) {
    const finialBox = createBeveledBoxGeometry(0.35, 0.75, 0.22, 0.03, 2, 4, 2);
    finialBox.translate(dir * (length * 0.5 + 0.12), 0.32, 0);
    parts.push(finialBox);

    const tip = new THREE.ConeGeometry(0.18, 0.45, 8);
    tip.rotateZ(-dir * 0.45);
    tip.translate(dir * (length * 0.5 + 0.22), 0.72, 0);
    parts.push(tip);
  }

  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

/**
 * Circular eave round caps (wadang) along the eave perimeter.
 */
export function createEaveCapGeometry(radius = 0.08, thickness = 0.04): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(radius, radius, thickness, 10);
  geo.rotateX(Math.PI / 2);
  return geo;
}
