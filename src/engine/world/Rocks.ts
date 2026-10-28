import * as THREE from 'three';
import { disposeObject3D } from '@/engine/core/Disposables';
import type { AssetStore } from '@/engine/core/AssetStore';
import { terrainHeight } from '@/engine/world/terrain';
import type { PlatformBox } from '@/engine/world/layout';

export const STEPPING_STONE_PLATFORMS: PlatformBox[] = [
  {
    id: 'stream-step-1',
    island: 'A',
    minX: -14.5,
    maxX: -13.7,
    minZ: -4.8,
    maxZ: -4.0,
    floorY: -0.05,
  },
  {
    id: 'stream-step-2',
    island: 'A',
    minX: -14.8,
    maxX: -14.0,
    minZ: -5.4,
    maxZ: -4.6,
    floorY: -0.02,
  },
  {
    id: 'stream-step-3',
    island: 'A',
    minX: -15.1,
    maxX: -14.3,
    minZ: -6.0,
    maxZ: -5.2,
    floorY: 0.0,
  },
  {
    id: 'stream-step-4',
    island: 'A',
    minX: -15.3,
    maxX: -14.5,
    minZ: -6.6,
    maxZ: -5.8,
    floorY: -0.02,
  },
  {
    id: 'stream-step-5',
    island: 'A',
    minX: -15.5,
    maxX: -14.7,
    minZ: -7.2,
    maxZ: -6.4,
    floorY: -0.05,
  },
];

export class RockSystem extends THREE.Group {
  override readonly name = 'RockSystem';

  private boulderMesh: THREE.InstancedMesh | null = null;
  private steppingStonesMesh: THREE.InstancedMesh | null = null;
  private material: THREE.MeshStandardMaterial | null = null;

  override get count(): number {
    return this.boulderMesh ? this.boulderMesh.count : 0;
  }

  get mesh(): THREE.InstancedMesh | null {
    return this.boulderMesh;
  }

  constructor(assets?: AssetStore) {
    super();
    this.buildRocks(assets);
  }

  private buildRocks(assets?: AssetStore): void {
    const geo = this.createBoulderGeometry();
    const steppingGeo = this.createSteppingStoneGeometry();

    const rockSlot = assets?.getSlot('rock');
    const mossSlot = assets?.getSlot('moss');

    this.material = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#948D85'),
      roughness: 0.88,
      metalness: 0.05,
      map: rockSlot?.diff,
      normalMap: rockSlot?.nor,
      normalScale: new THREE.Vector2(0.85, 0.85),
      vertexColors: true,
    });

    if (mossSlot?.diff) {
      this.material.onBeforeCompile = (shader: THREE.WebGLProgramParametersWithUniforms) => {
        shader.uniforms.uMossMap = { value: mossSlot.diff };

        shader.vertexShader = shader.vertexShader.replace(
          '#include <uv_pars_vertex>',
          /* glsl */ `
          #include <uv_pars_vertex>
          varying vec2 vRockUv;
          varying vec3 vRockNormal;
          `,
        );

        shader.vertexShader = shader.vertexShader.replace(
          '#include <uv_vertex>',
          /* glsl */ `
          #include <uv_vertex>
          vRockUv = uv;
          #ifdef USE_INSTANCING
            vRockNormal = normalize((modelMatrix * instanceMatrix * vec4(normal, 0.0)).xyz);
          #else
            vRockNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
          #endif
          `,
        );

        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <uv_pars_fragment>',
          /* glsl */ `
          #include <uv_pars_fragment>
          varying vec2 vRockUv;
          varying vec3 vRockNormal;
          uniform sampler2D uMossMap;
          `,
        );

        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <color_fragment>',
          /* glsl */ `
          #include <color_fragment>
          // Blend moss into upward-facing rock surfaces in world space
          float upwardMoss = smoothstep(0.45, 0.80, vRockNormal.y) * 0.75;
          vec4 mossTex = texture2D(uMossMap, vRockUv * 3.5);
          diffuseColor.rgb = mix(diffuseColor.rgb, mossTex.rgb * vec3(0.85, 1.05, 0.75), upwardMoss);
          `,
        );
      };
    }

    // 1. 60 Boulders on Island A
    const boulderPlacements = this.generateBoulderPlacements();
    this.boulderMesh = new THREE.InstancedMesh(geo, this.material, boulderPlacements.length);
    this.boulderMesh.name = 'IslandABoulders';
    this.boulderMesh.castShadow = true;
    this.boulderMesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < boulderPlacements.length; i++) {
      const p = boulderPlacements[i]!;
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(p.pitch, p.yaw, p.roll);
      dummy.scale.set(p.scaleX, p.scaleY, p.scaleZ);
      dummy.updateMatrix();
      this.boulderMesh.setMatrixAt(i, dummy.matrix);
    }
    this.boulderMesh.instanceMatrix.needsUpdate = true;
    this.add(this.boulderMesh);

    // 2. 5 Stepping Stones across the stream
    this.steppingStonesMesh = new THREE.InstancedMesh(
      steppingGeo,
      this.material,
      STEPPING_STONE_PLATFORMS.length,
    );
    this.steppingStonesMesh.name = 'StreamSteppingStones';
    this.steppingStonesMesh.castShadow = true;
    this.steppingStonesMesh.receiveShadow = true;

    for (let i = 0; i < STEPPING_STONE_PLATFORMS.length; i++) {
      const sp = STEPPING_STONE_PLATFORMS[i]!;
      const cx = (sp.minX + sp.maxX) * 0.5;
      const cz = (sp.minZ + sp.maxZ) * 0.5;
      const cy = sp.floorY - 0.12;
      dummy.position.set(cx, cy, cz);
      dummy.rotation.set(0.04, i * 0.72, -0.03);
      dummy.scale.set(0.72, 0.38, 0.68);
      dummy.updateMatrix();
      this.steppingStonesMesh.setMatrixAt(i, dummy.matrix);
    }
    this.steppingStonesMesh.instanceMatrix.needsUpdate = true;
    this.add(this.steppingStonesMesh);
  }

  private createBoulderGeometry(): THREE.BufferGeometry {
    const geo = new THREE.IcosahedronGeometry(1.0, 3);
    const pos = geo.attributes.position!;
    const count = pos.count;
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);

      // Ridged noise displacement
      const r1 = Math.abs(Math.sin(x * 3.4 + y * 2.1) * Math.cos(z * 3.1));
      const r2 = Math.sin(x * 6.8 - z * 5.2) * 0.5 + 0.5;
      const disp = 1.0 + (r1 * 0.7 + r2 * 0.3) * 0.26;
      x *= disp;
      y *= disp;
      z *= disp;

      // Flatten bottom so the boulder sits firmly in the soil
      if (y < -0.2) {
        y = -0.2 + (y + 0.2) * 0.15;
      }

      pos.setXYZ(i, x, y, z);

      // Vertex color: moss tint on top, crevice darkening below
      const normalY = Math.max(0.0, y / disp);
      const isCrevice = disp < 1.05 ? 0.78 : 1.0;
      const r = (0.75 + normalY * 0.12) * isCrevice;
      const g = (0.75 + normalY * 0.22) * isCrevice;
      const b = (0.72 + normalY * 0.08) * isCrevice;

      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }

  private createSteppingStoneGeometry(): THREE.BufferGeometry {
    const geo = new THREE.CylinderGeometry(0.55, 0.65, 0.35, 16, 2);
    const pos = geo.attributes.position!;
    const count = pos.count;
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);

      // Subtle surface undulation
      const d = Math.sin(x * 4.0 + z * 3.5) * 0.04;
      if (y > 0.1) {
        y += d; // Flat walking top
      }
      x += Math.cos(y * 6.0) * 0.03;
      z += Math.sin(y * 6.0) * 0.03;

      pos.setXYZ(i, x, y, z);

      colors[i * 3] = 0.88;
      colors[i * 3 + 1] = 0.90;
      colors[i * 3 + 2] = 0.85;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }

  private generateBoulderPlacements(): Array<{
    x: number;
    y: number;
    z: number;
    yaw: number;
    pitch: number;
    roll: number;
    scaleX: number;
    scaleY: number;
    scaleZ: number;
  }> {
    const list: ReturnType<typeof this.generateBoulderPlacements> = [];

    // 1. 18 Boulders around Pond Basin (-9, -4)
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + 0.12;
      const rad = 5.2 + (Math.sin(i * 3.7) * 0.5 + 0.5) * 1.6;
      const x = -9 + Math.cos(a) * rad;
      const z = -4 + Math.sin(a) * rad;
      const y = terrainHeight(x, z) - 0.15;
      const s = 0.75 + ((i * 7) % 11) * 0.08;
      list.push({
        x,
        y,
        z,
        yaw: i * 1.3,
        pitch: Math.sin(i) * 0.15,
        roll: Math.cos(i) * 0.15,
        scaleX: s * 1.1,
        scaleY: s * 0.75,
        scaleZ: s * 0.95,
      });
    }

    // 2. 18 Boulders along the Stream channel banks
    const streamSamples = [
      { x: -11.5, z: -3.8 },
      { x: -12.2, z: -6.4 },
      { x: -13.8, z: -4.2 },
      { x: -14.1, z: -7.0 },
      { x: -16.2, z: -5.2 },
      { x: -16.8, z: -8.1 },
      { x: -18.5, z: -6.2 },
      { x: -19.2, z: -9.2 },
      { x: -20.8, z: -7.1 },
      { x: -21.5, z: -9.5 },
      { x: -22.8, z: -7.8 },
      { x: -23.4, z: -9.6 },
      { x: -10.5, z: -5.8 },
      { x: -13.0, z: -3.6 },
      { x: -15.5, z: -8.5 },
      { x: -17.5, z: -5.5 },
      { x: -22.0, z: -6.8 },
      { x: -24.0, z: -8.2 },
    ];
    for (let i = 0; i < streamSamples.length; i++) {
      const pt = streamSamples[i]!;
      const y = terrainHeight(pt.x, pt.z) - 0.12;
      const s = 0.65 + (i % 5) * 0.14;
      list.push({
        x: pt.x,
        y,
        z: pt.z,
        yaw: i * 0.92,
        pitch: 0.1,
        roll: -0.08,
        scaleX: s * 1.05,
        scaleY: s * 0.7,
        scaleZ: s * 0.9,
      });
    }

    // 3. 16 Boulders along Island A cliff edges and terrace rim
    const edgeAngles = [
      0.35, 0.72, 1.25, 1.95, 2.45, 2.92, 3.45, 3.85, 4.35, 4.85, 5.25, 5.75,
      1.65, 2.15, 4.15, 5.95,
    ];
    for (let i = 0; i < edgeAngles.length; i++) {
      const a = edgeAngles[i]!;
      const r = 22.8 + Math.sin(i * 2.5) * 1.5;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = terrainHeight(x, z) - 0.25;
      const s = 0.95 + (i % 6) * 0.2;
      list.push({
        x,
        y,
        z,
        yaw: a + 0.4,
        pitch: Math.sin(i * 1.8) * 0.2,
        roll: Math.cos(i * 1.4) * 0.2,
        scaleX: s * 1.25,
        scaleY: s * 0.85,
        scaleZ: s * 1.1,
      });
    }

    // 4. 8 Landmark Boulders (larger accent stones)
    const landmarks = [
      { x: -7.5, z: 2.5, s: 1.6 },
      { x: 14.5, z: 1.2, s: 1.7 },
      { x: 18.5, z: -12.5, s: 1.9 },
      { x: -16.5, z: -14.2, s: 1.8 },
      { x: 4.5, z: -12.8, s: 1.4 },
      { x: -3.5, z: 17.5, s: 1.75 },
      { x: 8.5, z: 18.2, s: 1.5 },
      { x: -18.2, z: 12.5, s: 1.85 },
    ];
    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i]!;
      const y = terrainHeight(lm.x, lm.z) - 0.35;
      list.push({
        x: lm.x,
        y,
        z: lm.z,
        yaw: i * 1.6,
        pitch: 0.12,
        roll: -0.15,
        scaleX: lm.s * 1.15,
        scaleY: lm.s * 0.8,
        scaleZ: lm.s * 1.05,
      });
    }

    return list;
  }

  override dispose(): void {
    if (this.boulderMesh) {
      this.boulderMesh.geometry.dispose();
      this.boulderMesh = null;
    }
    if (this.steppingStonesMesh) {
      this.steppingStonesMesh.geometry.dispose();
      this.steppingStonesMesh = null;
    }
    if (this.material) {
      this.material.dispose();
      this.material = null;
    }
    disposeObject3D(this);
  }
}
