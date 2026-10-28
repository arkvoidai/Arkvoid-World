import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createBeveledBoxGeometry, applyVertexWear } from './bevel';

/**
 * Creates a traditional hanging paper lantern:
 * - Octagonal paper body with horizontal bamboo rings
 * - Lacquered timber top cap and bottom collar
 * - Silk cord suspension and bottom tassel
 */
export function createHangingPaperLanternGeometry(
  height = 0.58,
  radius = 0.22,
): { paper: THREE.BufferGeometry; timber: THREE.BufferGeometry; gold: THREE.BufferGeometry } {
  const paperParts: THREE.BufferGeometry[] = [];
  const timberParts: THREE.BufferGeometry[] = [];
  const goldParts: THREE.BufferGeometry[] = [];

  // 1. Bulbous paper body using LatheGeometry
  const pts: THREE.Vector2[] = [];
  const latheSteps = 12;
  for (let i = 0; i <= latheSteps; i++) {
    const t = i / latheSteps;
    const y = (t - 0.5) * height;
    const r = radius * Math.sin(t * Math.PI) * 0.95 + 0.08;
    pts.push(new THREE.Vector2(r, y));
  }
  const paperGeo = new THREE.LatheGeometry(pts, 12);
  paperParts.push(paperGeo);

  // 2. Timber top cap and bottom ring
  const topCap = new THREE.CylinderGeometry(0.12, 0.14, 0.05, 8);
  topCap.translate(0, height * 0.5 + 0.025, 0);
  timberParts.push(topCap);

  const botRing = new THREE.CylinderGeometry(0.12, 0.10, 0.05, 8);
  botRing.translate(0, -height * 0.5 - 0.025, 0);
  timberParts.push(botRing);

  // 3. Gold suspension loop & tassel cap
  const hook = new THREE.TorusGeometry(0.035, 0.008, 6, 8);
  hook.translate(0, height * 0.5 + 0.07, 0);
  goldParts.push(hook);

  const tasselCap = new THREE.ConeGeometry(0.03, 0.06, 8);
  tasselCap.translate(0, -height * 0.5 - 0.08, 0);
  goldParts.push(tasselCap);

  const tasselStrands = new THREE.CylinderGeometry(0.025, 0.015, 0.18, 6);
  tasselStrands.translate(0, -height * 0.5 - 0.19, 0);
  goldParts.push(tasselStrands);

  const mergedPaper = mergeGeometries(paperParts, false);
  const mergedTimber = mergeGeometries(timberParts, false);
  const mergedGold = mergeGeometries(goldParts, false);

  for (const p of paperParts) p.dispose();
  for (const p of timberParts) p.dispose();
  for (const p of goldParts) p.dispose();

  return { paper: mergedPaper, timber: mergedTimber, gold: mergedGold };
}

/**
 * Creates an authentic East Asian stacked stone lantern (toro / shideng):
 * - Base plinth (kiso)
 * - Shaft (sao) with entasis
 * - Middle platform (chudai)
 * - Carved light box (hibukuro) with pierced window openings
 * - Hexagonal umbrella roof (kasa) with upturned corners
 * - Top jewel finial (hoju)
 */
export function createStoneLanternGeometry(
  totalHeight = 2.4,
  baseWidth = 0.68,
): { stone: THREE.BufferGeometry; lightCore: THREE.BufferGeometry } {
  const stoneParts: THREE.BufferGeometry[] = [];

  // 1. Base plinth (octagonal stepped stone)
  const base1 = new THREE.CylinderGeometry(baseWidth * 0.5, baseWidth * 0.54, 0.28, 8);
  base1.translate(0, 0.14, 0);
  stoneParts.push(base1);

  const base2 = new THREE.CylinderGeometry(baseWidth * 0.42, baseWidth * 0.46, 0.22, 8);
  base2.translate(0, 0.39, 0);
  stoneParts.push(base2);

  // 2. Shaft (sao)
  const shaft = new THREE.CylinderGeometry(baseWidth * 0.24, baseWidth * 0.26, 0.72, 8);
  shaft.translate(0, 0.86, 0);
  stoneParts.push(shaft);

  // 3. Middle platform (chudai) with lotus moulding
  const chudai = new THREE.CylinderGeometry(baseWidth * 0.52, baseWidth * 0.36, 0.24, 8);
  chudai.translate(0, 1.34, 0);
  stoneParts.push(chudai);

  // 4. Light box (hibukuro) - outer frame
  const boxR = baseWidth * 0.40;
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const post = createBeveledBoxGeometry(0.09, 0.42, 0.09, 0.015);
    post.translate(Math.cos(angle) * boxR, 1.67, Math.sin(angle) * boxR);
    stoneParts.push(post);
  }

  // 5. Hexagonal umbrella roof (kasa)
  const kasa = new THREE.ConeGeometry(baseWidth * 0.64, 0.34, 8);
  kasa.translate(0, 2.05, 0);
  stoneParts.push(kasa);

  // 6. Top jewel finial (hoju)
  const hojuBase = new THREE.CylinderGeometry(0.12, 0.16, 0.08, 8);
  hojuBase.translate(0, 2.26, 0);
  stoneParts.push(hojuBase);

  const hojuBall = new THREE.SphereGeometry(0.11, 10, 8);
  hojuBall.translate(0, 2.37, 0);
  stoneParts.push(hojuBall);

  const hojuTip = new THREE.ConeGeometry(0.06, 0.14, 8);
  hojuTip.translate(0, 2.50, 0);
  stoneParts.push(hojuTip);

  // Glowing inner light core inside the light chamber
  const lightCore = new THREE.CylinderGeometry(boxR * 0.65, boxR * 0.65, 0.32, 8);
  lightCore.translate(0, 1.67, 0);

  const mergedStone = mergeGeometries(stoneParts, false);
  for (const p of stoneParts) p.dispose();

  applyVertexWear(mergedStone, 0, totalHeight, 0.45, 0.22);
  return { stone: mergedStone, lightCore };
}
