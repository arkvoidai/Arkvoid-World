import * as THREE from 'three';

export type ExpandedRegionId = 'veiled-peaks' | 'capital-valley' | 'primordial-forest';

export interface ExpandedRegionDefinition {
  id: ExpandedRegionId;
  name: string;
  center: { x: number; z: number };
  radius: number;
  baseY: number;
  palette: { ground: string; rock: string; accent: string; water: string; foliage: string };
}

export const EXPANDED_REGIONS: readonly ExpandedRegionDefinition[] = [
  {
    id: 'veiled-peaks', name: 'Veiled Peaks', center: { x: 2400, z: -3600 }, radius: 760, baseY: 72,
    palette: { ground: '#8A887F', rock: '#555B60', accent: '#D8D4C7', water: '#A9C9D5', foliage: '#52665D' },
  },
  {
    id: 'capital-valley', name: 'Capital Valley', center: { x: -5000, z: -2400 }, radius: 820, baseY: 48,
    palette: { ground: '#8D946D', rock: '#6D705B', accent: '#D2B77E', water: '#4D91A0', foliage: '#536C4D' },
  },
  {
    id: 'primordial-forest', name: 'Primordial Forest', center: { x: -1800, z: 4200 }, radius: 820, baseY: 42,
    palette: { ground: '#455B42', rock: '#555C4B', accent: '#B4A477', water: '#568D91', foliage: '#294A35' },
  },
];

function smoothNoise(x: number, z: number, seed: number): number {
  const n = Math.sin(x * 0.013 + z * 0.019 + seed * 9.17) * 43758.5453;
  return (n - Math.floor(n)) * 2 - 1;
}

export function expandedRegionAt(x: number, z: number): ExpandedRegionDefinition | null {
  for (const region of EXPANDED_REGIONS) {
    const dx = x - region.center.x;
    const dz = z - region.center.z;
    if (dx * dx + dz * dz <= region.radius * region.radius) return region;
  }
  return null;
}

export function expandedRegionHeightAt(x: number, z: number): number | null {
  const region = expandedRegionAt(x, z);
  if (!region) return null;
  const dx = x - region.center.x;
  const dz = z - region.center.z;
  const d = Math.hypot(dx, dz);
  const edge = Math.max(0, 1 - d / region.radius);
  const n1 = smoothNoise(x, z, region.id.length);
  const n2 = smoothNoise(x * 0.43, z * 0.43, 31);
  if (region.id === 'veiled-peaks') {
    const ridge = Math.max(0, Math.sin((dx + dz * 0.34) * 0.004)) * 92;
    const shoulder = Math.max(0, Math.sin((dx * 0.6 - dz) * 0.0027)) * 54;
    return region.baseY + 5 + n1 * 5 + n2 * 8 + ridge * edge + shoulder * edge;
  }
  if (region.id === 'capital-valley') {
    const riverBasin = Math.exp(-Math.pow((dz - Math.sin(dx * 0.0018) * 110) / 115, 2));
    return region.baseY + n1 * 2.2 + n2 * 1.5 + Math.sin(dx * 0.002) * 3 - riverBasin * 5;
  }
  const karst = Math.sin(dx * 0.006) * Math.cos(dz * 0.005) * 10;
  const rootRise = Math.exp(-Math.pow(d / 230, 2)) * 18;
  return region.baseY + n1 * 3 + n2 * 4 + karst + rootRise;
}

function seeded(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function createTerrain(region: ExpandedRegionDefinition, phone: boolean): THREE.BufferGeometry {
  const rings = phone ? 34 : 52;
  const segments = phone ? 64 : 96;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let ring = 0; ring <= rings; ring++) {
    const r = (ring / rings) * region.radius;
    for (let segment = 0; segment <= segments; segment++) {
      const angle = (segment / segments) * Math.PI * 2;
      const irregular = 1 + 0.018 * Math.sin(angle * 5 + region.id.length) + 0.012 * Math.cos(angle * 9);
      const x = region.center.x + Math.cos(angle) * r * irregular;
      const z = region.center.z + Math.sin(angle) * r * irregular;
      const y = expandedRegionHeightAt(x, z) ?? region.baseY;
      positions.push(x, y, z);
      uvs.push((x - region.center.x) / 90, (z - region.center.z) / 90);
    }
  }
  for (let ring = 0; ring < rings; ring++) {
    for (let segment = 0; segment < segments; segment++) {
      const a = ring * (segments + 1) + segment;
      const b = a + segments + 1;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function addInstancedForest(group: THREE.Group, region: ExpandedRegionDefinition, phone: boolean): void {
  const random = seeded(region.id.length * 1931);
  const count = phone ? 72 : 150;
  const trunkGeometry = new THREE.CylinderGeometry(0.35, 0.62, 8, 7);
  const crownGeometry = new THREE.ConeGeometry(4.2, 11, 7);
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: region.id === 'primordial-forest' ? '#594735' : '#6D5944', roughness: 0.94 });
  const crownMaterial = new THREE.MeshStandardMaterial({ color: region.palette.foliage, roughness: 0.9 });
  const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, count);
  const crowns = new THREE.InstancedMesh(crownGeometry, crownMaterial, count);
  const matrix = new THREE.Object3D();
  let placed = 0;
  for (let i = 0; i < count * 4 && placed < count; i++) {
    const angle = random() * Math.PI * 2;
    const radius = (0.25 + random() * 0.66) * region.radius;
    const x = region.center.x + Math.cos(angle) * radius;
    const z = region.center.z + Math.sin(angle) * radius;
    if (region.id === 'capital-valley' && Math.abs(z - region.center.z) < 150) continue;
    if (region.id === 'veiled-peaks' && random() < 0.64) continue;
    const y = expandedRegionHeightAt(x, z) ?? region.baseY;
    const scale = region.id === 'primordial-forest' ? 1.35 + random() * 1.4 : 0.72 + random() * 0.65;
    matrix.position.set(x, y + 4 * scale, z);
    matrix.rotation.set(0, random() * Math.PI * 2, 0);
    matrix.scale.setScalar(scale);
    matrix.updateMatrix();
    trunks.setMatrixAt(placed, matrix.matrix);
    matrix.position.y += 6.2 * scale;
    matrix.scale.setScalar(scale * (region.id === 'primordial-forest' ? 1.45 : 1));
    matrix.updateMatrix();
    crowns.setMatrixAt(placed, matrix.matrix);
    placed++;
  }
  trunks.count = placed;
  crowns.count = placed;
  trunks.castShadow = true;
  crowns.castShadow = true;
  group.add(trunks, crowns);
}

function addMountainLandmarks(group: THREE.Group, region: ExpandedRegionDefinition): void {
  const rock = new THREE.MeshStandardMaterial({ color: region.palette.rock, roughness: 0.92 });
  const snow = new THREE.MeshStandardMaterial({ color: '#D9E0DF', roughness: 0.86 });
  for (let i = 0; i < 5; i++) {
    const x = region.center.x - 430 + i * 210;
    const z = region.center.z - 220 + Math.sin(i * 1.4) * 130;
    const y = expandedRegionHeightAt(x, z) ?? region.baseY;
    const peak = new THREE.Mesh(new THREE.ConeGeometry(75 + (i % 2) * 25, 250 + (i % 3) * 55, 7), rock);
    peak.position.set(x, y + 115, z);
    peak.rotation.z = (i % 2 ? -1 : 1) * 0.08;
    peak.castShadow = true;
    group.add(peak);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(36 + (i % 2) * 12, 82, 7), snow);
    cap.position.set(x, y + 248 + (i % 3) * 55, z);
    cap.castShadow = true;
    group.add(cap);
  }
  const waterfall = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 110),
    new THREE.MeshBasicMaterial({ color: region.palette.water, transparent: true, opacity: 0.72, side: THREE.DoubleSide }),
  );
  waterfall.position.set(region.center.x + 290, region.baseY + 38, region.center.z + 260);
  group.add(waterfall);
}

function addCapitalLandmarks(group: THREE.Group, region: ExpandedRegionDefinition): void {
  const stone = new THREE.MeshStandardMaterial({ color: '#B9A47D', roughness: 0.78 });
  const roof = new THREE.MeshStandardMaterial({ color: '#684A3C', roughness: 0.82 });
  const gold = new THREE.MeshStandardMaterial({ color: region.palette.accent, metalness: 0.45, roughness: 0.4 });
  const buildPagoda = (x: number, z: number, scale: number) => {
    const y = expandedRegionHeightAt(x, z) ?? region.baseY;
    const base = new THREE.Mesh(new THREE.BoxGeometry(42 * scale, 5 * scale, 34 * scale), stone);
    base.position.set(x, y + 2.5 * scale, z);
    group.add(base);
    for (let floor = 0; floor < 3; floor++) {
      const h = y + (12 + floor * 16) * scale;
      const body = new THREE.Mesh(new THREE.BoxGeometry((28 - floor * 4) * scale, 13 * scale, (24 - floor * 3) * scale), stone);
      body.position.set(x, h, z);
      group.add(body);
      const eaves = new THREE.Mesh(new THREE.ConeGeometry(23 * scale - floor * 2 * scale, 8 * scale, 4), roof);
      eaves.rotation.y = Math.PI / 4;
      eaves.position.set(x, h + 8 * scale, z);
      group.add(eaves);
    }
    const finial = new THREE.Mesh(new THREE.CylinderGeometry(0.6 * scale, 1.1 * scale, 16 * scale, 8), gold);
    finial.position.set(x, y + 70 * scale, z);
    group.add(finial);
  };
  buildPagoda(region.center.x + 110, region.center.z - 90, 2.2);
  buildPagoda(region.center.x - 220, region.center.z + 160, 1.15);
  buildPagoda(region.center.x + 320, region.center.z + 240, 0.85);

  const river = new THREE.Mesh(
    new THREE.PlaneGeometry(1250, 210, 1, 1),
    new THREE.MeshStandardMaterial({ color: region.palette.water, roughness: 0.18, metalness: 0.12, transparent: true, opacity: 0.88 }),
  );
  river.rotation.x = -Math.PI / 2;
  river.position.set(region.center.x, region.baseY + 1.8, region.center.z + 5);
  group.add(river);
}

function addForestLandmarks(group: THREE.Group, region: ExpandedRegionDefinition): void {
  const trunk = new THREE.MeshStandardMaterial({ color: '#493B2D', roughness: 0.98 });
  const canopy = new THREE.MeshStandardMaterial({ color: '#31543A', roughness: 0.9 });
  const x = region.center.x;
  const z = region.center.z;
  const y = expandedRegionHeightAt(x, z) ?? region.baseY;
  const bole = new THREE.Mesh(new THREE.CylinderGeometry(12, 21, 105, 12), trunk);
  bole.position.set(x, y + 52, z);
  bole.castShadow = true;
  group.add(bole);
  for (let i = 0; i < 7; i++) {
    const angle = i * Math.PI * 2 / 7;
    const limb = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 5.2, 54, 7), trunk);
    limb.position.set(x + Math.cos(angle) * 23, y + 86 + (i % 3) * 8, z + Math.sin(angle) * 23);
    limb.rotation.z = Math.cos(angle) * 0.72;
    limb.rotation.x = Math.sin(angle) * 0.72;
    group.add(limb);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(44 + (i % 2) * 12, 1), canopy);
    crown.position.set(x + Math.cos(angle) * 45, y + 130 + (i % 3) * 18, z + Math.sin(angle) * 45);
    crown.scale.set(1.15, 0.82, 1.1);
    crown.castShadow = true;
    group.add(crown);
  }
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(78, 48),
    new THREE.MeshStandardMaterial({ color: region.palette.water, roughness: 0.16, metalness: 0.12 }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(x + 210, (expandedRegionHeightAt(x + 210, z) ?? y) + 0.5, z + 160);
  group.add(pool);
}


export const HOME_REGION_GATES = [
  { id: 'gate-veiled-peaks', regionId: 'veiled-peaks' as const, position: { x: -10, y: 0.2, z: -22 }, label: 'Veiled Peaks' },
  { id: 'gate-capital-valley', regionId: 'capital-valley' as const, position: { x: 0, y: 0.2, z: -27 }, label: 'Capital Valley' },
  { id: 'gate-primordial-forest', regionId: 'primordial-forest' as const, position: { x: 10, y: 0.2, z: -22 }, label: 'Primordial Forest' },
] as const;

function addPortalArch(group: THREE.Group, x: number, y: number, z: number, tint: string, scale = 1): void {
  const stone = new THREE.MeshStandardMaterial({ color: '#8B8172', roughness: 0.84 });
  const glow = new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0.82, side: THREE.DoubleSide });
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.72 * scale, 6.2 * scale, 0.82 * scale), stone);
    pillar.position.set(x + side * 3.2 * scale, y + 3.1 * scale, z);
    pillar.castShadow = true;
    group.add(pillar);
    const capital = new THREE.Mesh(new THREE.BoxGeometry(1.1 * scale, 0.45 * scale, 1.15 * scale), stone);
    capital.position.set(x + side * 3.2 * scale, y + 6.3 * scale, z);
    group.add(capital);
  }
  const arch = new THREE.Mesh(new THREE.TorusGeometry(3.2 * scale, 0.2 * scale, 10, 48, Math.PI), stone);
  arch.position.set(x, y + 6.2 * scale, z);
  group.add(arch);
  const veil = new THREE.Mesh(new THREE.PlaneGeometry(5.9 * scale, 5.8 * scale), glow);
  veil.position.set(x, y + 3.05 * scale, z + 0.08 * scale);
  group.add(veil);
  const step = new THREE.Mesh(new THREE.BoxGeometry(8.2 * scale, 0.24 * scale, 3.4 * scale), stone);
  step.position.set(x, y + 0.12 * scale, z + 1.2 * scale);
  group.add(step);
}

export class WorldRegions extends THREE.Group {
  private readonly materials: THREE.Material[] = [];
  constructor(phone = false) {
    super();
    this.name = 'ArkvoidDistinctRegions';
    const gateColours: Record<ExpandedRegionId, string> = {
      'veiled-peaks': '#C5E7F1',
      'capital-valley': '#E5B96D',
      'primordial-forest': '#8EBE83',
    };
    for (const gate of HOME_REGION_GATES) {
      addPortalArch(this, gate.position.x, gate.position.y, gate.position.z, gateColours[gate.regionId], 0.82);
    }
    for (const region of EXPANDED_REGIONS) {
      const returnY = expandedRegionHeightAt(region.center.x - 90, region.center.z + 110) ?? region.baseY;
      addPortalArch(this, region.center.x - 90, returnY, region.center.z + 110, '#E8D8B0', 1.05);
      const area = new THREE.Group();
      area.name = 'Region_' + region.id;
      const geometry = createTerrain(region, phone);
      const material = new THREE.MeshStandardMaterial({
        color: region.palette.ground,
        roughness: region.id === 'capital-valley' ? 0.92 : 0.98,
        metalness: 0.02,
        flatShading: false,
      });
      this.materials.push(material);
      const ground = new THREE.Mesh(geometry, material);
      ground.name = 'WalkableTerrain_' + region.id;
      ground.receiveShadow = true;
      ground.castShadow = true;
      area.add(ground);
      addInstancedForest(area, region, phone);
      if (region.id === 'veiled-peaks') addMountainLandmarks(area, region);
      if (region.id === 'capital-valley') addCapitalLandmarks(area, region);
      if (region.id === 'primordial-forest') addForestLandmarks(area, region);
      this.add(area);
    }
  }

  dispose(): void {
    this.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.InstancedMesh) {
        object.geometry.dispose();
        if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
        else object.material.dispose();
      }
    });
    this.clear();
    this.materials.length = 0;
  }
}
