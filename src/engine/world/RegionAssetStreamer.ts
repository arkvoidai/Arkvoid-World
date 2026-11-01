import * as THREE from 'three';
import type { DeviceProfile } from '@/lib/deviceProfile';
import { expandedRegionHeightAt, EXPANDED_REGIONS } from '@/engine/world/WorldRegions';
import type { ExpandedRegionId, WorldRegions } from '@/engine/world/WorldRegions';

export interface RegionAssetStreamerOptions {
  supabaseUrl: string;
  device: DeviceProfile;
}

export interface RegionModelSpec {
  readonly id: string;
  readonly regionId: ExpandedRegionId;
  readonly fileName: string;
  readonly estimatedBytes: number;
  readonly minGpuTier: 0 | 1 | 2 | 3;
  readonly desktopOnly?: boolean;
  readonly priority: number;
  readonly offsetX: number;
  readonly offsetZ: number;
  readonly targetHeight: number;
  readonly yaw: number;
}

const MB = 1024 * 1024;
const STORAGE_BUCKET = 'arkvoid-assets';
const UP = new THREE.Vector3(0, 1, 0);

function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47) end -= 1;
  return value.slice(0, end);
}

export const REGION_MODEL_MANIFEST: readonly RegionModelSpec[] = [
  {
    id: 'veiled-peaks-great-mountain', regionId: 'veiled-peaks',
    fileName: 'great_mountain.glb', estimatedBytes: 2_800_452,
    minGpuTier: 0, priority: 100, offsetX: 0, offsetZ: -180,
    targetHeight: 285, yaw: 0,
  },
  {
    id: 'veiled-peaks-pine', regionId: 'veiled-peaks',
    fileName: 'pine_tree.glb', estimatedBytes: 4_937_388,
    minGpuTier: 1, priority: 90, offsetX: -165, offsetZ: 105,
    targetHeight: 38, yaw: 0.42,
  },
  {
    id: 'veiled-peaks-shrine', regionId: 'veiled-peaks',
    fileName: 'chinese_temple__sacred_peak_shrine.glb', estimatedBytes: 33_542_940,
    minGpuTier: 3, desktopOnly: true, priority: 80,
    offsetX: 105, offsetZ: 135, targetHeight: 68, yaw: -0.18,
  },
  {
    id: 'veiled-peaks-boulder-field', regionId: 'veiled-peaks',
    fileName: 'cliff_rock_boulder_field.glb', estimatedBytes: 9_244_056,
    minGpuTier: 2, desktopOnly: true, priority: 70,
    offsetX: -235, offsetZ: -75, targetHeight: 78, yaw: 0.2,
  },
  {
    id: 'capital-valley-bridge', regionId: 'capital-valley',
    fileName: 'delal_bridge_zakho.glb', estimatedBytes: 1_170_700,
    minGpuTier: 0, priority: 100, offsetX: 0, offsetZ: 5,
    targetHeight: 17, yaw: 0,
  },
  {
    id: 'primordial-forest-rock', regionId: 'primordial-forest',
    fileName: 'rock.glb', estimatedBytes: 4_298_376,
    minGpuTier: 2, priority: 100, offsetX: 245, offsetZ: -165,
    targetHeight: 56, yaw: 0.3,
  },
  {
    id: 'primordial-forest-pine', regionId: 'primordial-forest',
    fileName: 'pine_tree (1).glb', estimatedBytes: 5_464_704,
    minGpuTier: 2, priority: 90, offsetX: -175, offsetZ: -145,
    targetHeight: 48, yaw: -0.55,
  },
];

export function buildPublicRegionAssetUrl(supabaseUrl: string, fileName: string): string | null {
  const base = trimTrailingSlashes(supabaseUrl);
  if (!base) return null;
  return base + '/storage/v1/object/public/' + STORAGE_BUCKET + '/' + encodeURIComponent(fileName);
}

export function selectRegionModels(
  regionId: ExpandedRegionId,
  device: DeviceProfile,
): readonly RegionModelSpec[] {
  if (device.isSoftwareGl || device.gpuTier === 0) return [];
  const byteBudget = device.deviceClass === 'phone'
    ? (device.gpuTier >= 2 ? 8 * MB : 3.5 * MB)
    : (device.gpuTier >= 3 ? 48 * MB : device.gpuTier >= 2 ? 18 * MB : 8 * MB);
  let selectedBytes = 0;
  const selected: RegionModelSpec[] = [];
  const candidates = REGION_MODEL_MANIFEST
    .filter((asset) => asset.regionId === regionId)
    .filter((asset) => device.gpuTier >= asset.minGpuTier)
    .filter((asset) => !asset.desktopOnly || device.deviceClass === 'desktop')
    .slice()
    .sort((a, b) => b.priority - a.priority);
  for (const asset of candidates) {
    if (selectedBytes + asset.estimatedBytes > byteBudget) continue;
    selected.push(asset);
    selectedBytes += asset.estimatedBytes;
  }
  return selected;
}

export function countRegionModelTriangles(root: THREE.Object3D): number {
  let triangles = 0;
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    const position = mesh.geometry.getAttribute('position');
    if (!position) return;
    const index = mesh.geometry.getIndex();
    const available = index ? index.count : position.count;
    const drawCount = Math.min(available, mesh.geometry.drawRange.count);
    const instances = (mesh as THREE.InstancedMesh).isInstancedMesh
      ? (mesh as THREE.InstancedMesh).count
      : 1;
    triangles += Math.floor(drawCount / 3) * instances;
  });
  return triangles;
}

export function fitRegionModel(
  sourceScene: THREE.Object3D,
  target: { x: number; y: number; z: number },
  targetHeight: number,
  yaw = 0,
): THREE.Group | null {
  const visual = new THREE.Group();
  visual.add(sourceScene);
  visual.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(visual);
  if (bounds.isEmpty()) return null;
  const size = bounds.getSize(new THREE.Vector3());
  if (!Number.isFinite(size.y) || size.y < 0.01 || !Number.isFinite(targetHeight) || targetHeight <= 0) {
    return null;
  }
  const scale = targetHeight / size.y;
  const centre = bounds.getCenter(new THREE.Vector3());
  visual.scale.setScalar(scale);
  visual.rotation.y = yaw;
  visual.position.copy(
    new THREE.Vector3(-centre.x, -bounds.min.y, -centre.z)
      .multiplyScalar(scale)
      .applyAxisAngle(UP, yaw),
  );
  visual.updateMatrixWorld(true);

  const anchor = new THREE.Group();
  anchor.position.set(target.x, target.y, target.z);
  anchor.add(visual);
  anchor.updateMatrixWorld(true);
  return anchor;
}

function disposeModelResources(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh) {
      geometries.add(mesh.geometry);
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of list) {
        materials.add(material);
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture) textures.add(value);
        }
      }
    }
    if (object instanceof THREE.SkinnedMesh) object.skeleton.dispose();
  });
  root.removeFromParent();
  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
  root.clear();
}

interface ResidentRegionAssets {
  group: THREE.Group;
  lastUsed: number;
  loadedBytes: number;
}

export class RegionAssetStreamer {
  private readonly worldRegions: WorldRegions;
  private readonly supabaseUrl: string;
  private readonly device: DeviceProfile;
  private readonly controllers = new Set<AbortController>();
  private readonly resident = new Map<ExpandedRegionId, ResidentRegionAssets>();
  private loadingRegion: ExpandedRegionId | null = null;
  private requestedRegion: ExpandedRegionId | null = null;
  private usageClock = 0;
  private disposed = false;

  constructor(worldRegions: WorldRegions, options: RegionAssetStreamerOptions) {
    this.worldRegions = worldRegions;
    this.supabaseUrl = trimTrailingSlashes(options.supabaseUrl);
    this.device = options.device;
  }

  activate(regionId: ExpandedRegionId): void {
    if (this.disposed || !this.supabaseUrl) return;
    this.requestedRegion = regionId;
    const cached = this.resident.get(regionId);
    if (cached) {
      cached.lastUsed = ++this.usageClock;
      return;
    }
    if (this.loadingRegion) return;
    void this.loadRegion(regionId);
  }

  private async loadRegion(regionId: ExpandedRegionId): Promise<void> {
    if (this.disposed || this.loadingRegion) return;
    this.loadingRegion = regionId;
    const region = this.worldRegions.getRegionGroup(regionId);
    const specs = selectRegionModels(regionId, this.device);
    if (!region || specs.length === 0) {
      this.loadingRegion = null;
      return;
    }

    const group = new THREE.Group();
    group.name = 'AuthoredModels_' + regionId;
    const resident: ResidentRegionAssets = {
      group,
      lastUsed: ++this.usageClock,
      loadedBytes: 0,
    };
    this.resident.set(regionId, resident);
    let totalTriangles = 0;
    const triangleBudget = this.device.deviceClass === 'phone'
      ? 55_000
      : this.device.gpuTier >= 3 ? 200_000 : 150_000;

    try {
      for (const spec of specs) {
        if (this.disposed) break;
        const url = buildPublicRegionAssetUrl(this.supabaseUrl, spec.fileName);
        if (!url) continue;
        const source = await this.fetchModel(url);
        if (!source || this.disposed) {
          if (source) disposeModelResources(source);
          continue;
        }

        const triangles = countRegionModelTriangles(source);
        if (triangles <= 0 || totalTriangles + triangles > triangleBudget) {
          disposeModelResources(source);
          continue;
        }

        const definition = this.getRegionDefinition(regionId);
        if (!definition) {
          disposeModelResources(source);
          continue;
        }
        const fitted = fitRegionModel(
          source,
          {
            x: definition.center.x + spec.offsetX,
            y: this.getGroundHeight(definition.center.x + spec.offsetX, definition.center.z + spec.offsetZ, definition.baseY),
            z: definition.center.z + spec.offsetZ,
          },
          spec.targetHeight,
          spec.yaw,
        );
        if (!fitted) {
          disposeModelResources(source);
          continue;
        }
        fitted.name = spec.id;
        fitted.traverse((object) => {
          const mesh = object as THREE.Mesh;
          if (!mesh.isMesh) return;
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          const opaque = materials.some((material) => !material.transparent);
          mesh.castShadow = opaque;
          mesh.receiveShadow = opaque;
          mesh.frustumCulled = true;
        });
        group.add(fitted);
        totalTriangles += triangles;
        resident.loadedBytes += spec.estimatedBytes;
        if (!group.parent) region.add(group);
      }

      if (group.children.length === 0) {
        this.resident.delete(regionId);
        group.removeFromParent();
      } else {
        this.evictInactiveRegions();
      }
    } catch (error) {
      this.resident.delete(regionId);
      disposeModelResources(group);
      if (!this.disposed && !(error instanceof DOMException && error.name === 'AbortError') && import.meta.env.DEV) {
        console.warn('[Arkvoid] Region model streaming failed for ' + regionId, error);
      }
    } finally {
      this.loadingRegion = null;
      const next = this.requestedRegion;
      if (!this.disposed && next && next !== regionId && !this.resident.has(next)) {
        void this.loadRegion(next);
      }
    }
  }

  private async fetchModel(url: string): Promise<THREE.Object3D | null> {
    const controller = new AbortController();
    this.controllers.add(controller);
    try {
      const response = await fetch(url, { signal: controller.signal, cache: 'force-cache' });
      if (!response.ok) throw new Error('HTTP ' + response.status + ' while fetching a GLB model');
      const bytes = await response.arrayBuffer();
      if (this.disposed || controller.signal.aborted) return null;
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      const loader = new GLTFLoader();
      const basePath = url.slice(0, url.lastIndexOf('/') + 1);
      const gltf = await loader.parseAsync(bytes, basePath);
      if (this.disposed || controller.signal.aborted) {
        disposeModelResources(gltf.scene);
        return null;
      }
      return gltf.scene;
    } catch (error) {
      if (!controller.signal.aborted && !this.disposed && import.meta.env.DEV) {
        console.warn('[Arkvoid] Optional GLB failed: ' + url, error);
      }
      return null;
    } finally {
      this.controllers.delete(controller);
    }
  }

  private getRegionDefinition(regionId: ExpandedRegionId) {
    return EXPANDED_REGIONS.find((region) => region.id === regionId);
  }

  private getGroundHeight(x: number, z: number, fallback: number): number {
    return expandedRegionHeightAt(x, z) ?? fallback;
  }

  private evictInactiveRegions(): void {
    const capacity = this.device.deviceClass === 'phone' || this.device.isSoftwareGl ? 1 : 2;
    while (this.resident.size > capacity) {
      let oldestId: ExpandedRegionId | null = null;
      let oldestUsage = Infinity;
      for (const [id, entry] of this.resident) {
        if (id === this.requestedRegion || id === this.loadingRegion) continue;
        if (entry.lastUsed < oldestUsage) {
          oldestUsage = entry.lastUsed;
          oldestId = id;
        }
      }
      if (!oldestId) break;
      const entry = this.resident.get(oldestId);
      this.resident.delete(oldestId);
      if (entry) disposeModelResources(entry.group);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
    for (const entry of this.resident.values()) disposeModelResources(entry.group);
    this.resident.clear();
    this.requestedRegion = null;
    this.loadingRegion = null;
  }
}
