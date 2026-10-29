import * as THREE from 'three';

/**
 * Creates a box geometry where all edges are bevelled / chamfered (~2 cm default).
 * This ensures specular highlights catch every architectural edge cleanly.
 */
export function createBeveledBoxGeometry(
  width: number,
  height: number,
  depth: number,
  bevelRadius = 0.02,
  segX = 4,
  segY = 4,
  segZ = 4,
): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(width, height, depth, segX, segY, segZ);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;

  const hx = Math.max(0.005, width * 0.5 - bevelRadius);
  const hy = Math.max(0.005, height * 0.5 - bevelRadius);
  const hz = Math.max(0.005, depth * 0.5 - bevelRadius);

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

  // Compute metric box UVs (2.0 meters per tile) so large slabs/walls never stretch a single [0..1] tile into planks
  const norm = geo.getAttribute('normal') as THREE.BufferAttribute;
  const uvAttr = geo.getAttribute('uv') as THREE.BufferAttribute | undefined;
  const invMeters = 1.0 / 2.0;
  if (norm && uvAttr) {
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i);
      const py = pos.getY(i);
      const pz = pos.getZ(i);
      const nx = Math.abs(norm.getX(i));
      const ny = Math.abs(norm.getY(i));
      const nz = Math.abs(norm.getZ(i));
      if (ny >= nx && ny >= nz) {
        uvAttr.setXY(i, px * invMeters, pz * invMeters);
      } else if (nx >= ny && nx >= nz) {
        uvAttr.setXY(i, pz * invMeters, py * invMeters);
      } else {
        uvAttr.setXY(i, px * invMeters, py * invMeters);
      }
    }
    uvAttr.needsUpdate = true;
  }

  return geo;
}

/**
 * Applies subtle vertex-colour wear: darker and greener at the base, lighter at the top.
 */
export function applyVertexWear(
  geometry: THREE.BufferGeometry,
  minY = 0,
  maxY = 1,
  darkenFactor = 0.35,
  mossFactor = 0.18,
): THREE.BufferGeometry {
  const pos = geometry.getAttribute('position');
  if (!pos) return geometry;

  const count = pos.count;
  const colors = new Float32Array(count * 3);
  const heightSpan = Math.max(0.01, maxY - minY);

  for (let i = 0; i < count; i++) {
    const y = pos.getY(i);
    const t = Math.max(0, Math.min(1, (y - minY) / heightSpan));
    // Base is darker and slightly mossy green-grey; top is clean/bright
    const wear = (1 - t) * darkenFactor;
    const r = Math.max(0.1, 1.0 - wear);
    const g = Math.max(0.1, 1.0 - wear * (1 - mossFactor));
    const b = Math.max(0.1, 1.0 - wear * 1.15);

    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}
