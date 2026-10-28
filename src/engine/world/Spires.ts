import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { TimeOfDayState } from '@/engine/world/sky';
import type { AssetStore } from '@/engine/core/AssetStore';

interface SpireDef {
  x: number;
  y: number;
  z: number;
  height: number;
  radius: number;
  hasWaterfall: boolean;
  waterfallAngle: number;
}

const SPIRE_DEFS: SpireDef[] = [
  { x: 175, y: 22, z: 85, height: 95, radius: 22, hasWaterfall: true, waterfallAngle: -0.4 },
  { x: -195, y: 40, z: -95, height: 125, radius: 28, hasWaterfall: true, waterfallAngle: 1.2 },
  { x: 265, y: -8, z: -215, height: 110, radius: 26, hasWaterfall: false, waterfallAngle: 0 },
  { x: -285, y: 52, z: 145, height: 145, radius: 32, hasWaterfall: true, waterfallAngle: 2.1 },
  { x: 85, y: 68, z: -365, height: 160, radius: 38, hasWaterfall: true, waterfallAngle: 0.8 },
  { x: -95, y: -12, z: 345, height: 85, radius: 20, hasWaterfall: false, waterfallAngle: 0 },
  { x: 345, y: 32, z: 225, height: 135, radius: 30, hasWaterfall: true, waterfallAngle: -1.8 },
];

export class DistantSpires extends THREE.Group {
  private readonly rockMesh: THREE.Mesh;
  private readonly foliageMesh: THREE.Mesh;
  private readonly waterfallsMesh: THREE.Mesh;

  private readonly rockMaterial: THREE.MeshStandardMaterial;
  private readonly foliageMaterial: THREE.MeshStandardMaterial;
  private readonly waterfallMaterial: THREE.MeshBasicMaterial;

  constructor(isPhone = false, assets?: AssetStore) {
    super();

    // 1. Spire rock cones geometry (merged into 1 draw call)
    const spireGeos: THREE.BufferGeometry[] = [];
    const foliageGeos: THREE.BufferGeometry[] = [];
    const waterfallGeos: THREE.BufferGeometry[] = [];

    const radialSegments = isPhone ? 24 : 36;
    const heightSegments = isPhone ? 32 : 54;

    for (let i = 0; i < SPIRE_DEFS.length; i++) {
      const def = SPIRE_DEFS[i]!;

      // Build displaced tapered cone
      const cone = this.buildSpireGeometry(
        def.radius,
        def.height,
        radialSegments,
        heightSegments,
        i * 137.5,
      );
      cone.translate(def.x, def.y - def.height * 0.45, def.z);
      spireGeos.push(cone);

      // Summit foliage crowns (pine and maple clumps)
      const crown = this.buildSummitFoliage(def.x, def.y + def.height * 0.55, def.z, def.radius * 0.42);
      foliageGeos.push(crown);

      // Waterfall ribbon falling from summit edge down to cloud sea (y = -22)
      if (def.hasWaterfall) {
        const wf = this.buildWaterfallRibbon(
          def.x,
          def.y + def.height * 0.52,
          def.z,
          def.radius * 0.88,
          def.waterfallAngle,
        );
        waterfallGeos.push(wf);
      }
    }

    const mergedRockGeo = BufferGeometryUtils.mergeGeometries(spireGeos, false)!;
    mergedRockGeo.computeVertexNormals();

    const mergedFoliageGeo = BufferGeometryUtils.mergeGeometries(foliageGeos, false)!;
    const mergedWaterfallGeo = BufferGeometryUtils.mergeGeometries(waterfallGeos, false)!;

    const rockSlot = assets?.getSlot('rock');

    // Materials with heavy aerial perspective
    this.rockMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#7A7482').multiplyScalar(rockSlot?.albedoGain ?? 1.0), // purple-grey rock with distance haze
      map: rockSlot?.diff,
      normalMap: rockSlot?.nor,
      roughness: 0.92,
      metalness: 0.05,
    });

    this.foliageMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#3A5E38'), // deep pine green
      roughness: 0.85,
      metalness: 0.0,
    });

    this.waterfallMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#8ED6E8'), // cyan-teal water ribbon
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });

    this.rockMesh = new THREE.Mesh(mergedRockGeo, this.rockMaterial);
    this.foliageMesh = new THREE.Mesh(mergedFoliageGeo, this.foliageMaterial);
    this.waterfallsMesh = new THREE.Mesh(mergedWaterfallGeo, this.waterfallMaterial);

    this.add(this.rockMesh);
    this.add(this.foliageMesh);
    this.add(this.waterfallsMesh);
  }

  private buildSpireGeometry(
    radius: number,
    height: number,
    radialSeg: number,
    heightSeg: number,
    phase: number,
  ): THREE.BufferGeometry {
    const geo = new THREE.CylinderGeometry(
      radius * 0.28, // top radius
      radius * 1.15, // base radius
      height,
      radialSeg,
      heightSeg,
    );

    const pos = geo.attributes.position!;
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i);
      const py = pos.getY(i);
      const pz = pos.getZ(i);

      const angle = Math.atan2(pz, px);
      const hFrac = (py + height * 0.5) / height;

      // Ridged noise displacement along spire body
      const ridge1 = Math.abs(Math.sin(angle * 5.0 + hFrac * 12.0 + phase));
      const ridge2 = Math.sin(angle * 8.0 - hFrac * 18.0) * 0.5 + 0.5;
      const disp = (ridge1 * 0.65 + ridge2 * 0.35) * radius * 0.32 * Math.sin(hFrac * Math.PI);

      const len = Math.hypot(px, pz);
      if (len > 1e-4) {
        pos.setX(i, px + (px / len) * disp);
        pos.setZ(i, pz + (pz / len) * disp);
      }
    }

    geo.computeVertexNormals();
    return geo;
  }

  private buildSummitFoliage(
    cx: number,
    cy: number,
    cz: number,
    radius: number,
  ): THREE.BufferGeometry {
    const crowns: THREE.BufferGeometry[] = [];
    const count = 5;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + 0.5;
      const r = (i % 2 === 0 ? 0.4 : 0.8) * radius;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      const y = cy + 1.2 + (i % 3) * 0.6;

      const clump = new THREE.DodecahedronGeometry(1.4 + (i % 2) * 0.5, 1);
      clump.scale(1.2, 0.8, 1.2);
      clump.translate(x, y, z);
      crowns.push(clump);
    }
    return BufferGeometryUtils.mergeGeometries(crowns, false)!;
  }

  private buildWaterfallRibbon(
    cx: number,
    topY: number,
    cz: number,
    radius: number,
    angle: number,
  ): THREE.BufferGeometry {
    const startX = cx + Math.cos(angle) * radius;
    const startZ = cz + Math.sin(angle) * radius;
    const botY = -22; // cloud sea level
    const lenY = topY - botY;

    // Plane strip facing outwards
    const ribbon = new THREE.PlaneGeometry(1.8, lenY, 1, 8);
    ribbon.translate(0, -lenY * 0.5, 0);

    const normalAngle = angle;
    ribbon.rotateY(-normalAngle + Math.PI * 0.5);
    ribbon.translate(startX, topY, startZ);

    return ribbon;
  }

  syncSky(skyState: TimeOfDayState): void {
    // Aerial perspective adjusts with horizon / fog color
    this.rockMaterial.color.copy(skyState.fog).lerp(new THREE.Color('#5E5868'), 0.45);
  }

  override dispose(): void {
    this.rockMesh.geometry.dispose();
    this.foliageMesh.geometry.dispose();
    this.waterfallsMesh.geometry.dispose();

    this.rockMaterial.dispose();
    this.foliageMaterial.dispose();
    this.waterfallMaterial.dispose();
  }
}
