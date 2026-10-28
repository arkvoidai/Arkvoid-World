import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createBeveledBoxGeometry, applyVertexWear } from './bevel';

export interface ColumnPlacement {
  x: number;
  y: number;
  z: number;
  height: number;
  radiusBase?: number;
}

/**
 * Creates a lathe column geometry with entasis (slight swelling around 1/3 height).
 */
export function createEntasisColumnGeometry(
  height = 5.6,
  radiusBase = 0.24,
  radiusTop = 0.21,
  entasisRatio = 1.08,
  segments = 16,
): THREE.BufferGeometry {
  const points: THREE.Vector2[] = [];
  const steps = 18;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = t * height;
    // Entasis swells around t = 0.35
    const swell = Math.sin(t * Math.PI) * (entasisRatio - 1.0) * (1.0 - t * 0.4);
    const nominalR = radiusBase + (radiusTop - radiusBase) * t;
    const r = nominalR * (1.0 + swell);
    points.push(new THREE.Vector2(r, y));
  }

  const geo = new THREE.LatheGeometry(points, segments);
  applyVertexWear(geo, 0, height, 0.3, 0.12);
  return geo;
}

/**
 * Creates a moulded stone plinth geometry for column bases.
 */
export function createPlinthGeometry(
  width = 0.72,
  height = 0.32,
): THREE.BufferGeometry {
  const baseBox = createBeveledBoxGeometry(width, height * 0.6, width, 0.02, 2, 2, 2);
  baseBox.translate(0, height * 0.3, 0);

  const topCyl = new THREE.CylinderGeometry(width * 0.46, width * 0.48, height * 0.4, 16);
  topCyl.translate(0, height * 0.8, 0);

  const merged = mergeGeometries([baseBox, topCyl], false);
  baseBox.dispose();
  topCyl.dispose();

  applyVertexWear(merged, 0, height, 0.45, 0.2);
  return merged;
}

/**
 * Creates gold collar ring geometry.
 */
export function createGoldCollarGeometry(
  radius = 0.25,
  thickness = 0.04,
): THREE.BufferGeometry {
  const geo = new THREE.TorusGeometry(radius, thickness * 0.5, 8, 16);
  geo.rotateX(Math.PI / 2);
  return geo;
}

/**
 * Simplified 3-tier stepped cantilever bracket cluster (dougong).
 * 3 stepped cantilevered blocks with curved tips.
 */
export function createBracketClusterGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Base cap block (dou)
  const dou = createBeveledBoxGeometry(0.38, 0.14, 0.38, 0.015);
  dou.translate(0, 0.07, 0);
  parts.push(dou);

  // Tier 1 cantilever arm (gong) along X
  const t1 = createBeveledBoxGeometry(0.72, 0.12, 0.22, 0.015);
  t1.translate(0, 0.20, 0);
  parts.push(t1);

  // Tier 2 cantilever arms along X and Z
  const t2x = createBeveledBoxGeometry(1.05, 0.12, 0.22, 0.015);
  t2x.translate(0, 0.32, 0);
  parts.push(t2x);

  const t2z = createBeveledBoxGeometry(0.22, 0.12, 0.76, 0.015);
  t2z.translate(0, 0.32, 0.15);
  parts.push(t2z);

  // Tier 3 top bearing block & angled eaves strut
  const t3x = createBeveledBoxGeometry(1.36, 0.13, 0.24, 0.015);
  t3x.translate(0, 0.44, 0);
  parts.push(t3x);

  const t3z = createBeveledBoxGeometry(0.24, 0.13, 1.08, 0.015);
  t3z.translate(0, 0.44, 0.26);
  parts.push(t3z);

  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

/**
 * Single rafter beam geometry (small rectangular beam under eaves).
 */
export function createRafterGeometry(length = 1.4, size = 0.08): THREE.BufferGeometry {
  const geo = createBeveledBoxGeometry(size, size, length, 0.01, 2, 2, 4);
  geo.translate(0, 0, length * 0.5);
  return geo;
}
