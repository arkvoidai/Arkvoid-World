import * as THREE from 'three';
import { createOutwardGridIndices } from '@/engine/world/meshIndices';
import {
  ISLANDS,
  type IslandDef,
  type IslandKey,
  islandRadiusAtAngle,
  TREE_PLACEMENTS,
} from '@/engine/world/layout';
import {
  pathDistance,
  streamDistance,
  terrainGradient,
  terrainHeight,
} from '@/engine/world/terrain';
import { TerrainMaterial } from '@/engine/world/TerrainMaterial';
import type { AssetStore } from '@/engine/core/AssetStore';
import type { TimeOfDayState } from '@/engine/world/sky';

export interface IslandMeshOptions {
  isPhone?: boolean;
}

export class IslandLandformMesh extends THREE.Group {
  readonly island: IslandDef;
  readonly terrainMesh: THREE.Mesh;
  readonly terrainMaterial: TerrainMaterial;
  private readonly spikesMesh: THREE.InstancedMesh | null = null;
  private readonly rootsMesh: THREE.InstancedMesh | null = null;

  constructor(
    islandKey: IslandKey,
    assetStore: AssetStore,
    options: IslandMeshOptions = {},
  ) {
    super();
    this.island = ISLANDS[islandKey];
    const isPhone = options.isPhone ?? false;

    // 1. Build watertight terrain & rock underside geometry
    const geometry = this.buildWatertightGeometry(isPhone);

    // 2. Multi-layer PBR terrain material
    this.terrainMaterial = new TerrainMaterial({
      isPhone,
      baseY: this.island.topY,
    });
    this.terrainMaterial.updateTextures(assetStore);

    this.terrainMesh = new THREE.Mesh(geometry, this.terrainMaterial);
    this.terrainMesh.receiveShadow = true;
    this.terrainMesh.castShadow = true;
    this.add(this.terrainMesh);

    // 3. Hanging rock spikes under rim & draped roots
    if (this.island.reachable) {
      this.spikesMesh = this.buildHangingSpikes(isPhone, assetStore);
      if (this.spikesMesh) this.add(this.spikesMesh);

      this.rootsMesh = this.buildDrapedRoots(isPhone, assetStore);
      if (this.rootsMesh) this.add(this.rootsMesh);
    }
  }

  private buildWatertightGeometry(isPhone: boolean): THREE.BufferGeometry {
    // Rings and segments per tier
    const topRings = isPhone ? 48 : 84;
    const bodyRings = isPhone ? 28 : 48;
    const totalRings = topRings + bodyRings;
    const segments = isPhone ? 144 : 240;

    const numVertices = (totalRings + 1) * (segments + 1);

    const positions = new Float32Array(numVertices * 3);
    const normals = new Float32Array(numVertices * 3);
    const uvs = new Float32Array(numVertices * 2);

    // Baked vertex attributes
    const aPath = new Float32Array(numVertices);
    const aShore = new Float32Array(numVertices);
    const aMoss = new Float32Array(numVertices);
    const aAO = new Float32Array(numVertices);
    const aWear = new Float32Array(numVertices);

    const cx = this.island.center.x;
    const cz = this.island.center.z;
    const baseR = this.island.radius;
    const baseDepth = baseR * 1.15;
    const islKey = this.island.key;

    let vIdx = 0;

    for (let r = 0; r <= totalRings; r++) {
      const isTop = r <= topRings;

      for (let s = 0; s <= segments; s++) {
        const segFrac = s / segments;
        const theta = segFrac * Math.PI * 2;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);
        const rimR = islandRadiusAtAngle(islKey, baseR, theta);

        let x: number;
        let y: number;
        let z: number;
        let nx: number;
        let ny: number;
        let nz: number;

        let pathVal = 0;
        let shoreVal = 100;
        let mossVal: number;
        let aoVal: number;
        let wearVal = 0;

        if (isTop) {
          // Top surface: non-linear ring distribution clustering more vertices near rim and features
          const rFrac = r / topRings;
          const t = Math.pow(rFrac, 1.18);
          const currentR = rimR * t;

          x = cx + cosT * currentR;
          z = cz + sinT * currentR;
          y = terrainHeight(x, z);

          // Analytic normal from terrain gradient
          const grad = terrainGradient(x, z);
          nx = grad.normalX;
          ny = grad.normalY;
          nz = grad.normalZ;

          // 1. Path mask
          const pDist = pathDistance(x, z);
          if (pDist < 2.8) {
            const pathCore = 1.0 - Math.min(1.0, Math.max(0.0, (pDist - 0.7) / 0.8));
            const wornNoise = Math.sin(x * 1.8 + z * 1.4) * 0.12;
            pathVal = Math.max(0.0, Math.min(1.0, pathCore + wornNoise));
          }

          // 2. Shore distance (pond basin and stream)
          const pondDist = Math.hypot(x - (-9), z - (-4));
          const sDist = streamDistance(x, z);
          shoreVal = Math.min(Math.abs(pondDist - 6.5), sDist);

          // 3. Moss attribute: damp hollows, north slopes, near water, and near trees
          const northSlope = Math.max(0.0, -grad.normalZ * 0.8);
          const waterMoss = Math.max(0.0, 1.0 - Math.min(1.0, shoreVal / 3.5));
          let treeProximity = 0;
          for (let i = 0; i < TREE_PLACEMENTS.length; i++) {
            const tr = TREE_PLACEMENTS[i]!;
            const td = Math.hypot(x - tr.x, z - tr.z);
            if (td < 3.2) {
              treeProximity = Math.max(treeProximity, 1.0 - td / 3.2);
            }
          }
          mossVal = Math.min(1.0, northSlope * 0.45 + waterMoss * 0.65 + treeProximity * 0.5);

          // 4. Horizon AO (cheap sampling of 8 directions at 2 radii)
          let aoSamples = 0;
          const rad1 = 1.4;
          const rad2 = 3.2;
          for (let k = 0; k < 8; k++) {
            const aK = (k / 8) * Math.PI * 2;
            const s1 = terrainHeight(x + Math.cos(aK) * rad1, z + Math.sin(aK) * rad1);
            const s2 = terrainHeight(x + Math.cos(aK) * rad2, z + Math.sin(aK) * rad2);
            aoSamples += Math.max(0.0, s1 - y) * 0.5 + Math.max(0.0, s2 - y) * 0.25;
          }
          aoVal = Math.max(0.25, Math.min(1.0, 1.0 - aoSamples * 0.35));

          // 5. Wear near rim lip
          if (t > 0.86) {
            wearVal = Math.min(1.0, (t - 0.86) / 0.14);
          }
        } else {
          // Underside cliff body: continues down from rim to bottom tip
          const bFrac = (r - topRings) / bodyRings; // 0..1
          // Radial profile u(t) = pow(1 - t, 0.72)
          const uProfile = Math.pow(Math.max(0.0, 1.0 - bFrac), 0.72);

          // 2-octave ridged noise displacement (amplitude 1.5 m)
          const n1 = Math.abs(Math.sin(cosT * 4.0 + bFrac * 8.0) * Math.cos(sinT * 4.0));
          const n2 = Math.sin(cosT * 9.0 - bFrac * 15.0) * 0.5 + 0.5;
          const ridgedDisp = (n1 * 0.7 + n2 * 0.3) * 1.5 * Math.sin(bFrac * Math.PI);

          // Strata ledges
          const strata = Math.sin(bFrac * 22.0 + cosT * 3.0) * 0.25;

          const currentR = Math.max(0.2, rimR * uProfile + ridgedDisp + strata);
          x = cx + cosT * currentR;
          z = cz + sinT * currentR;

          // Cliff lip rim elevation connects seamlessly with top surface
          const rimBaseY = terrainHeight(cx + cosT * rimR, cz + sinT * rimR);
          y = rimBaseY - bFrac * baseDepth;

          // Outward and downward normal for underside rock
          nx = cosT * 0.85;
          ny = -0.52 - bFrac * 0.45;
          nz = sinT * 0.85;
          const nLen = Math.hypot(nx, ny, nz);
          nx /= nLen;
          ny /= nLen;
          nz /= nLen;

          aoVal = Math.max(0.2, 1.0 - bFrac * 0.65);
          mossVal = Math.max(0.0, (1.0 - bFrac * 2.5) * 0.3);
          wearVal = Math.max(0.0, 1.0 - bFrac * 3.0);
        }

        // Store positions
        positions[vIdx * 3] = x;
        positions[vIdx * 3 + 1] = y;
        positions[vIdx * 3 + 2] = z;

        // Normals
        normals[vIdx * 3] = nx;
        normals[vIdx * 3 + 1] = ny;
        normals[vIdx * 3 + 2] = nz;

        // UVs
        uvs[vIdx * 2] = x / 4.0;
        uvs[vIdx * 2 + 1] = z / 4.0;

        // Custom baked attributes
        aPath[vIdx] = pathVal;
        aShore[vIdx] = shoreVal;
        aMoss[vIdx] = mossVal;
        aAO[vIdx] = aoVal;
        aWear[vIdx] = wearVal;

        vIdx++;
      }
    }

    // Keep the visible top surface front-facing; do not mask reversed winding with DoubleSide.
    const indices = createOutwardGridIndices(totalRings, segments);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

    geo.setAttribute('aPath', new THREE.BufferAttribute(aPath, 1));
    geo.setAttribute('aShore', new THREE.BufferAttribute(aShore, 1));
    geo.setAttribute('aMoss', new THREE.BufferAttribute(aMoss, 1));
    geo.setAttribute('aAO', new THREE.BufferAttribute(aAO, 1));
    geo.setAttribute('aWear', new THREE.BufferAttribute(aWear, 1));

    geo.setIndex(indices);
    geo.computeBoundingSphere();
    return geo;
  }

  private createRockSpikeGeometry(): THREE.BufferGeometry {
    const radialSegs = 12;
    const heightSegs = 10;
    const height = 6.2;
    const baseR = 1.15;
    // Cylinder from y = 0 (rooted inside underside rock) down to y = -height (rounded tip)
    const geo = new THREE.CylinderGeometry(baseR, 0.14, height, radialSegs, heightSegs, false);
    geo.translate(0, -height * 0.5, 0);

    const pos = geo.attributes.position!;
    const uv = geo.attributes.uv!;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      const y = pos.getY(i);
      let z = pos.getZ(i);

      const t = Math.max(0, Math.min(1, -y / height)); // 0 at top root, 1 at bottom tip
      const angle = Math.atan2(z, x);

      // Taper with organic rock ridges and slight natural bend
      const taper = Math.pow(1.0 - t * 0.86, 0.85);
      const ridge =
        1.0 +
        0.18 * Math.sin(angle * 3.0 + t * 5.5) +
        0.10 * Math.cos(angle * 5.0 - t * 8.0);
      const r = Math.hypot(x, z);
      if (r > 1e-4) {
        const targetR = baseR * taper * ridge;
        x = (x / r) * targetR + Math.sin(t * Math.PI) * 0.22;
        z = (z / r) * targetR + Math.cos(t * Math.PI * 0.8) * 0.16;
      }

      pos.setXYZ(i, x, y, z);
      // Metric UVs (2.5m per tile)
      uv.setXY(i, (angle / (Math.PI * 2)) * 2.0, -y / 2.5);
    }

    geo.computeVertexNormals();
    return geo;
  }

  private buildHangingSpikes(
    isPhone: boolean,
    assetStore: AssetStore,
  ): THREE.InstancedMesh {
    const clusterCount = isPhone ? 4 : 6;
    const spikesPerCluster = 2;
    const count = clusterCount * spikesPerCluster;
    const spikeGeo = this.createRockSpikeGeometry();

    const rockSlot = assetStore.getSlot('rock');
    const spikeMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#8A8279').multiplyScalar(rockSlot.albedoGain),
      map: rockSlot.diff,
      normalMap: rockSlot.nor,
      roughness: 0.88,
      metalness: 0.03,
    });

    const mesh = new THREE.InstancedMesh(spikeGeo, spikeMat, count);
    mesh.name = `IslandSpikes_${this.island.key}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    const cx = this.island.center.x;
    const cz = this.island.center.z;
    const baseR = this.island.radius;

    let idx = 0;
    for (let c = 0; c < clusterCount; c++) {
      const baseAngle = (c / clusterCount) * Math.PI * 2 + 0.42;
      for (let k = 0; k < spikesPerCluster; k++) {
        const angle = baseAngle + k * 0.09;
        // Rooted well inside the underside rock body (rFrac 0.58..0.72) so they never float in front of the cliff
        const rFrac = k === 0 ? 0.64 : 0.58;
        const rimR = islandRadiusAtAngle(this.island.key, baseR, angle);
        const r = rimR * rFrac;
        const px = cx + Math.cos(angle) * r;
        const pz = cz + Math.sin(angle) * r;
        // Embed top of spike 2.5m inside the underside rock mass
        const py = this.island.topY - 4.2 - k * 1.1;

        dummy.position.set(px, py, pz);
        const scaleXZ = k === 0 ? 0.95 : 0.68;
        const scaleY = k === 0 ? 1.05 : 0.72;
        dummy.scale.set(scaleXZ, scaleY, scaleXZ);
        dummy.rotation.set((k === 0 ? 0.06 : -0.08), angle, 0.05);
        dummy.updateMatrix();
        mesh.setMatrixAt(idx++, dummy.matrix);
      }
    }

    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }

  private buildDrapedRoots(
    isPhone: boolean,
    assetStore: AssetStore,
  ): THREE.InstancedMesh {
    const count = isPhone ? 6 : 10;
    const rootGeo = new THREE.CylinderGeometry(0.08, 0.22, 4.8, 8, 6);
    const barkSlot = assetStore.getSlot('bark');
    const rootMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#5B4030').multiplyScalar(barkSlot.albedoGain),
      map: barkSlot.diff,
      normalMap: barkSlot.nor,
      roughness: 0.90,
      metalness: 0.02,
    });

    const mesh = new THREE.InstancedMesh(rootGeo, rootMat, count);
    mesh.name = `IslandRoots_${this.island.key}`;
    const dummy = new THREE.Object3D();
    const cx = this.island.center.x;
    const cz = this.island.center.z;
    const baseR = this.island.radius;

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + 0.72;
      const r = islandRadiusAtAngle(this.island.key, baseR, angle) * 0.88;
      const px = cx + Math.cos(angle) * r;
      const pz = cz + Math.sin(angle) * r;
      const py = this.island.topY - 2.6 - (i % 3) * 0.6;

      dummy.position.set(px, py, pz);
      dummy.rotation.set(0.18, angle + 0.4, (i % 2) * 0.12);
      dummy.scale.set(1.0, 0.8 + (i % 3) * 0.2, 1.0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }

  updateTextures(assetStore: AssetStore): void {
    this.terrainMaterial.updateTextures(assetStore);
    if (this.spikesMesh) {
      const rock = assetStore.getSlot('rock');
      const mat = this.spikesMesh.material as THREE.MeshStandardMaterial;
      if (mat.map !== rock.diff) {
        mat.map = rock.diff;
        mat.normalMap = rock.nor;
        mat.color.set('#8A8279').multiplyScalar(rock.albedoGain);
        mat.needsUpdate = true;
      }
    }
    if (this.rootsMesh) {
      const bark = assetStore.getSlot('bark');
      const mat = this.rootsMesh.material as THREE.MeshStandardMaterial;
      if (mat.map !== bark.diff) {
        mat.map = bark.diff;
        mat.normalMap = bark.nor;
        mat.color.set('#5B4030').multiplyScalar(bark.albedoGain);
        mat.needsUpdate = true;
      }
    }
  }

  syncSky(skyState: TimeOfDayState, elapsed: number): void {
    this.terrainMaterial.syncSkyState(skyState, elapsed);
  }

  override dispose(): void {
    this.terrainMesh.geometry.dispose();
    this.terrainMaterial.dispose();
    if (this.spikesMesh) {
      this.spikesMesh.geometry.dispose();
      (this.spikesMesh.material as THREE.Material).dispose();
    }
    if (this.rootsMesh) {
      this.rootsMesh.geometry.dispose();
      (this.rootsMesh.material as THREE.Material).dispose();
    }
  }
}
