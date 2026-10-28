import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createBeveledBoxGeometry, applyVertexWear } from './bevel';

/**
 * Creates the grand stone stair geometry:
 * - 14 steps with rise ~0.157 m (total rise 2.2 m) and run 0.34 m (total run 4.76 m)
 * - Central carved ramp slab (danbi / spirit path) in the middle
 * - Side stringers / balustrade bases
 */
export function createGrandStairGeometry(
  width = 6.4,
  numSteps = 14,
  totalRise = 2.2,
  run = 0.34,
  rampWidth = 1.4,
): { steps: THREE.BufferGeometry; ramp: THREE.BufferGeometry; balustrades: THREE.BufferGeometry } {
  const stepRise = totalRise / numSteps; // ~0.157 m
  const totalLength = numSteps * run;

  const stepParts: THREE.BufferGeometry[] = [];
  const halfW = width * 0.5;
  const halfRampW = rampWidth * 0.5;
  const sideStepW = halfW - halfRampW;

  // Split each step into left and right flights around the central ramp slab
  for (let i = 0; i < numSteps; i++) {
    const stepY = i * stepRise + stepRise * 0.5;
    const stepX = i * run + run * 0.5; // along stair direction (X)

    // Left flight
    const leftStep = createBeveledBoxGeometry(run + 0.04, stepRise + 0.02, sideStepW, 0.015, 2, 2, 2);
    leftStep.translate(stepX, stepY, -halfRampW - sideStepW * 0.5);
    stepParts.push(leftStep);

    // Right flight
    const rightStep = createBeveledBoxGeometry(run + 0.04, stepRise + 0.02, sideStepW, 0.015, 2, 2, 2);
    rightStep.translate(stepX, stepY, halfRampW + sideStepW * 0.5);
    stepParts.push(rightStep);
  }

  // Central ramp slab (sloping stone slab with carved relief)
  const rampThickness = 0.22;
  const slopeLen = Math.hypot(totalLength, totalRise);
  const slopeAngle = Math.atan2(totalRise, totalLength);

  const ramp = createBeveledBoxGeometry(slopeLen, rampThickness, rampWidth - 0.04, 0.02, 6, 2, 4);
  ramp.rotateZ(slopeAngle);
  ramp.translate(totalLength * 0.5, totalRise * 0.5, 0);

  // Side balustrades (sloping handrails along outer edges)
  const balustradeParts: THREE.BufferGeometry[] = [];
  const railThickness = 0.16;
  const railHeight = 0.82;

  for (const side of [-1, 1]) {
    const railZ = side * (halfW + railThickness * 0.5);

    // Sloping rail beam
    const rail = createBeveledBoxGeometry(slopeLen, railThickness, railThickness, 0.015);
    rail.rotateZ(slopeAngle);
    rail.translate(totalLength * 0.5, totalRise * 0.5 + railHeight, railZ);
    balustradeParts.push(rail);

    // Bottom solid stringer
    const stringer = createBeveledBoxGeometry(slopeLen, railHeight * 0.7, railThickness * 0.9, 0.02);
    stringer.rotateZ(slopeAngle);
    stringer.translate(totalLength * 0.5, totalRise * 0.5 + railHeight * 0.35, railZ);
    balustradeParts.push(stringer);

    // Start & end terminal carved posts
    const startPost = createCarvedPostGeometry(0.24, 1.1);
    startPost.translate(0, 0.55, railZ);
    balustradeParts.push(startPost);

    const endPost = createCarvedPostGeometry(0.24, 1.1);
    endPost.translate(totalLength, totalRise + 0.55, railZ);
    balustradeParts.push(endPost);
  }

  const mergedSteps = mergeGeometries(stepParts, false);
  const mergedBalustrades = mergeGeometries(balustradeParts, false);

  for (const p of stepParts) p.dispose();
  for (const p of balustradeParts) p.dispose();

  applyVertexWear(mergedSteps, 0, totalRise, 0.4, 0.15);
  applyVertexWear(ramp, 0, totalRise, 0.3, 0.12);
  applyVertexWear(mergedBalustrades, 0, totalRise + 1.2, 0.35, 0.15);

  return { steps: mergedSteps, ramp, balustrades: mergedBalustrades };
}

/**
 * Carved stone post geometry with lotus / flame finial.
 */
export function createCarvedPostGeometry(size = 0.22, height = 1.0): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Square shaft with chamfers
  const shaft = createBeveledBoxGeometry(size, height * 0.75, size, 0.02, 2, 4, 2);
  shaft.translate(0, height * 0.375, 0);
  parts.push(shaft);

  // Moulded capital
  const cap = createBeveledBoxGeometry(size * 1.25, height * 0.1, size * 1.25, 0.015);
  cap.translate(0, height * 0.8, 0);
  parts.push(cap);

  // Lotus bud finial (sphere + cone)
  const bud = new THREE.SphereGeometry(size * 0.45, 10, 8);
  bud.translate(0, height * 0.9, 0);
  parts.push(bud);

  const tip = new THREE.ConeGeometry(size * 0.28, height * 0.18, 8);
  tip.translate(0, height * 0.98, 0);
  parts.push(tip);

  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

/**
 * Creates stacked ashlar stone terrace platform base with moulded cap.
 */
export function createAshlarTerraceBaseGeometry(
  width = 28.0,
  depth = 18.0,
  height = 2.2,
  capOverhang = 0.18,
): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Main ashlar stone body
  const body = createBeveledBoxGeometry(width, height, depth, 0.04, 8, 4, 6);
  body.translate(0, height * 0.5, 0);
  parts.push(body);

  // Moulded stone top cap
  const capH = 0.22;
  const cap = createBeveledBoxGeometry(width + capOverhang * 2, capH, depth + capOverhang * 2, 0.03, 8, 2, 6);
  cap.translate(0, height + capH * 0.5, 0);
  parts.push(cap);

  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();

  applyVertexWear(merged, 0, height + capH, 0.5, 0.22);
  return merged;
}
