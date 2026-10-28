import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createBeveledBoxGeometry, applyVertexWear } from './bevel';

/**
 * Creates a canvas-based tileable East Asian geometric lattice texture.
 * Alpha-tested with warm interior emissive backing.
 */
let cachedLatticeTexture: THREE.CanvasTexture | null = null;
export function getLatticeWindowTexture(): THREE.CanvasTexture {
  if (cachedLatticeTexture) return cachedLatticeTexture;

  const size = 256;
  let canvas: HTMLCanvasElement;
  if (typeof document !== 'undefined') {
    canvas = document.createElement('canvas');
  } else {
    canvas = {
      width: size,
      height: size,
      getContext: () => null,
    } as unknown as HTMLCanvasElement;
  }
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    // Clear transparent background
    ctx.clearRect(0, 0, size, size);

    // Warm translucent paper backing
    ctx.fillStyle = 'rgba(255, 246, 230, 0.88)';
    ctx.fillRect(0, 0, size, size);

    // Dark lacquered timber lattice ribs
    ctx.strokeStyle = '#2B1E16';
    ctx.lineWidth = 6;

    const cells = 8;
    const step = size / cells;

    // Grid lattice
    for (let i = 0; i <= cells; i++) {
      ctx.beginPath();
      ctx.moveTo(i * step, 0);
      ctx.lineTo(i * step, size);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, i * step);
      ctx.lineTo(size, i * step);
      ctx.stroke();
    }

    // Diagonal decorative diamond ribs in center quadrants
    ctx.lineWidth = 3.5;
    for (let cy = 0; cy < cells; cy += 2) {
      for (let cx = 0; cx < cells; cx += 2) {
        ctx.beginPath();
        ctx.moveTo(cx * step + step, cy * step);
        ctx.lineTo(cx * step + step * 2, cy * step + step);
        ctx.lineTo(cx * step + step, cy * step + step * 2);
        ctx.lineTo(cx * step, cy * step + step);
        ctx.closePath();
        ctx.stroke();
      }
    }
  }

  cachedLatticeTexture = new THREE.CanvasTexture(canvas);
  cachedLatticeTexture.wrapS = THREE.RepeatWrapping;
  cachedLatticeTexture.wrapT = THREE.RepeatWrapping;
  cachedLatticeTexture.repeat.set(2, 2);
  return cachedLatticeTexture;
}

/**
 * Creates a framed wall section:
 * - Outer timber frame posts & beams (beveled)
 * - Recessed white plaster panel
 */
export function createFramedWallGeometry(
  width = 4.0,
  height = 3.6,
  frameThickness = 0.16,
  postWidth = 0.22,
): { frame: THREE.BufferGeometry; plaster: THREE.BufferGeometry } {
  const frameParts: THREE.BufferGeometry[] = [];

  // Left post
  const pLeft = createBeveledBoxGeometry(postWidth, height, frameThickness, 0.015);
  pLeft.translate(-width * 0.5 + postWidth * 0.5, height * 0.5, 0);
  frameParts.push(pLeft);

  // Right post
  const pRight = createBeveledBoxGeometry(postWidth, height, frameThickness, 0.015);
  pRight.translate(width * 0.5 - postWidth * 0.5, height * 0.5, 0);
  frameParts.push(pRight);

  // Bottom tie beam (sill)
  const bSill = createBeveledBoxGeometry(width, postWidth, frameThickness, 0.015);
  bSill.translate(0, postWidth * 0.5, 0);
  frameParts.push(bSill);

  // Top tie beam (lintel)
  const bLintel = createBeveledBoxGeometry(width, postWidth, frameThickness, 0.015);
  bLintel.translate(0, height - postWidth * 0.5, 0);
  frameParts.push(bLintel);

  // Recessed plaster infill panel
  const panelW = width - postWidth * 1.8;
  const panelH = height - postWidth * 1.8;
  const plaster = createBeveledBoxGeometry(panelW, panelH, frameThickness * 0.55, 0.01);
  plaster.translate(0, height * 0.5, 0);
  applyVertexWear(plaster, 0, height, 0.4, 0.18);

  const mergedFrame = mergeGeometries(frameParts, false);
  for (const p of frameParts) p.dispose();

  return { frame: mergedFrame, plaster };
}

/**
 * Creates double doors in lacquer with gold studs and frame.
 */
export function createDoubleDoorsGeometry(
  doorWidth = 2.8,
  doorHeight = 3.4,
  frameThickness = 0.20,
): { frame: THREE.BufferGeometry; doors: THREE.BufferGeometry; studs: THREE.BufferGeometry } {
  const frameParts: THREE.BufferGeometry[] = [];
  const postW = 0.24;

  // Lintel & posts
  const lPost = createBeveledBoxGeometry(postW, doorHeight, frameThickness, 0.02);
  lPost.translate(-doorWidth * 0.5 - postW * 0.5, doorHeight * 0.5, 0);
  frameParts.push(lPost);

  const rPost = createBeveledBoxGeometry(postW, doorHeight, frameThickness, 0.02);
  rPost.translate(doorWidth * 0.5 + postW * 0.5, doorHeight * 0.5, 0);
  frameParts.push(rPost);

  const lintel = createBeveledBoxGeometry(doorWidth + postW * 2, postW, frameThickness * 1.15, 0.02);
  lintel.translate(0, doorHeight + postW * 0.5, 0);
  frameParts.push(lintel);

  // Two door leaves
  const leafW = doorWidth * 0.5 - 0.02;
  const leafH = doorHeight - 0.04;
  const doorParts: THREE.BufferGeometry[] = [];
  const studParts: THREE.BufferGeometry[] = [];

  for (const dir of [-1, 1]) {
    const doorLeaf = createBeveledBoxGeometry(leafW, leafH, 0.10, 0.015);
    doorLeaf.translate(dir * (leafW * 0.5 + 0.01), leafH * 0.5 + 0.02, 0);
    doorParts.push(doorLeaf);

    // 4 rows x 2 cols of gold studs per door leaf
    for (let r = 0; r < 4; r++) {
      const sy = 0.6 + r * 0.68;
      for (let c = 0; c < 2; c++) {
        const sx = dir * (leafW * 0.3 + c * leafW * 0.4);
        const stud = new THREE.SphereGeometry(0.032, 8, 6);
        stud.translate(sx, sy, 0.055);
        studParts.push(stud);
      }
    }
  }

  const mergedFrame = mergeGeometries(frameParts, false);
  const mergedDoors = mergeGeometries(doorParts, false);
  const mergedStuds = mergeGeometries(studParts, false);

  for (const p of frameParts) p.dispose();
  for (const p of doorParts) p.dispose();
  for (const p of studParts) p.dispose();

  return { frame: mergedFrame, doors: mergedDoors, studs: mergedStuds };
}
