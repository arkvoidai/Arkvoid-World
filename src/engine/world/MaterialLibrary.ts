import * as THREE from 'three';
import type { TextureSlotId } from '@/config/assets';
import { TEXTURE_TUNING } from '@/config/textureTuning';
import type { AssetStore } from '@/engine/core/AssetStore';

export interface MaterialOptions {
  tint?: THREE.ColorRepresentation;
  uvScale?: number;
  normalScale?: number;
  roughnessScale?: number;
  mapping?: 'uv' | 'box' | 'biplanar';
  physical?: boolean;
  clearcoat?: number;
  clearcoatRoughness?: number;
  metalness?: number;
  vertexColors?: boolean;
  side?: THREE.Side;
  transparent?: boolean;
  opacity?: number;
  alphaTest?: number;
}

/**
 * Projects world-space box UVs onto a BufferGeometry based on face/vertex normals.
 */
export function applyBoxUV(
  geometry: THREE.BufferGeometry,
  metersPerTile = 2.0,
): THREE.BufferGeometry {
  if (!geometry.attributes.position) return geometry;

  const pos = geometry.attributes.position;
  let norm = geometry.attributes.normal;
  if (!norm) {
    geometry.computeVertexNormals();
    norm = geometry.attributes.normal;
  }
  if (!norm) return geometry;

  const count = pos.count;
  const uvs = new Float32Array(count * 2);
  const invMeters = 1.0 / Math.max(0.01, metersPerTile);

  for (let i = 0; i < count; i++) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    const pz = pos.getZ(i);

    const nx = Math.abs(norm.getX(i));
    const ny = Math.abs(norm.getY(i));
    const nz = Math.abs(norm.getZ(i));

    if (ny >= nx && ny >= nz) {
      // Top / bottom projection
      uvs[i * 2] = px * invMeters;
      uvs[i * 2 + 1] = pz * invMeters;
    } else if (nx >= ny && nx >= nz) {
      // Side projection (X)
      uvs[i * 2] = pz * invMeters;
      uvs[i * 2 + 1] = py * invMeters;
    } else {
      // Front / back projection (Z)
      uvs[i * 2] = px * invMeters;
      uvs[i * 2 + 1] = py * invMeters;
    }
  }

  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geometry;
}

export class MaterialLibrary {
  private readonly assets: AssetStore;
  private readonly cache = new Map<string, THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial>();
  private readonly registeredMaterials = new Set<{
    mat: THREE.MeshStandardMaterial;
    slot: TextureSlotId;
    options: MaterialOptions;
  }>();

  constructor(assets: AssetStore) {
    this.assets = assets;
  }

  getMaterial(
    slot: TextureSlotId,
    options: MaterialOptions = {},
  ): THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial {
    const key = this.createCacheKey(slot, options);
    const cached = this.cache.get(key);
    if (cached) return cached;

    const slotState = this.assets.getSlot(slot);
    const tuning = TEXTURE_TUNING[slot];

    const baseTint = options.tint ? new THREE.Color(options.tint) : new THREE.Color('#FFFFFF');
    const slotTint = new THREE.Color(tuning.tintMultiplier);
    baseTint.multiply(slotTint);

    // Apply albedo gain
    baseTint.multiplyScalar(slotState.albedoGain);

    const rough = Math.max(
      0.04,
      Math.min(1.0, tuning.nominalRoughness * (options.roughnessScale ?? 1.0)),
    );

    const baseNormalScale = (options.normalScale ?? tuning.normalScale);
    const normalY = slotState.flipGreen ? -baseNormalScale : baseNormalScale;

    const matParams: THREE.MeshStandardMaterialParameters = {
      color: baseTint,
      roughness: rough,
      metalness: options.metalness ?? 0.04,
      map: slotState.diff,
      normalMap: slotState.nor,
      normalScale: new THREE.Vector2(baseNormalScale, normalY),
      vertexColors: options.vertexColors ?? false,
      side: options.side ?? THREE.FrontSide,
      transparent: options.transparent ?? false,
      opacity: options.opacity ?? 1.0,
      alphaTest: options.alphaTest ?? 0.0,
    };

    if (slotState.arm) {
      matParams.roughnessMap = slotState.arm;
      matParams.aoMap = slotState.arm;
      matParams.aoMapIntensity = 0.8;
    }

    let material: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;
    if (options.physical) {
      const physParams: THREE.MeshPhysicalMaterialParameters = {
        ...matParams,
        clearcoat: options.clearcoat ?? 0.0,
        clearcoatRoughness: options.clearcoatRoughness ?? 0.0,
      };
      material = new THREE.MeshPhysicalMaterial(physParams);
    } else {
      material = new THREE.MeshStandardMaterial(matParams);
    }

    // If biplanar mapping requested, inject shader logic
    if (options.mapping === 'biplanar') {
      const uvScale = options.uvScale ?? (1.0 / tuning.uvScaleMeters);
      material.onBeforeCompile = (shader) => {
        shader.uniforms.uBiplanarScale = { value: uvScale };
        shader.vertexShader = shader.vertexShader.replace(
          '#include <uv_pars_vertex>',
          `#include <uv_pars_vertex>
varying vec3 vBiplanarPos;
varying vec3 vBiplanarNormal;
`,
        );
        shader.vertexShader = shader.vertexShader.replace(
          '#include <worldpos_vertex>',
          `#include <worldpos_vertex>
vBiplanarPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vBiplanarNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
`,
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <uv_pars_fragment>',
          `#include <uv_pars_fragment>
varying vec3 vBiplanarPos;
varying vec3 vBiplanarNormal;
uniform float uBiplanarScale;
`,
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <map_fragment>',
          `
#ifdef USE_MAP
  vec3 n = abs(normalize(vBiplanarNormal));
  vec2 uvSide = vec2(vBiplanarPos.x + vBiplanarPos.z, vBiplanarPos.y) * uBiplanarScale;
  vec2 uvTop = vBiplanarPos.xz * uBiplanarScale;
  float topW = smoothstep(0.4, 0.8, n.y);
  vec4 sideTex = texture2D(map, uvSide);
  vec4 topTex = texture2D(map, uvTop);
  diffuseColor *= mix(sideTex, topTex, topW);
#endif
`,
        );
      };
    }

    this.cache.set(key, material);
    this.registeredMaterials.add({ mat: material, slot, options });

    return material;
  }

  /**
   * Syncs dynamic texture updates (e.g. after real texture decode / crossfade)
   */
  update(): void {
    for (const reg of this.registeredMaterials) {
      const slotState = this.assets.getSlot(reg.slot);
      let needsMatUpdate = false;

      if (reg.mat.map !== slotState.diff) {
        reg.mat.map = slotState.diff;
        needsMatUpdate = true;
      }
      if (reg.mat.normalMap !== slotState.nor) {
        reg.mat.normalMap = slotState.nor;
        const ns = reg.options.normalScale ?? TEXTURE_TUNING[reg.slot].normalScale;
        reg.mat.normalScale.set(ns, slotState.flipGreen ? -ns : ns);
        needsMatUpdate = true;
      }
      if (slotState.arm && reg.mat.aoMap !== slotState.arm) {
        reg.mat.roughnessMap = slotState.arm;
        reg.mat.aoMap = slotState.arm;
        reg.mat.aoMapIntensity = 0.8;
        needsMatUpdate = true;
      }

      if (needsMatUpdate) {
        reg.mat.needsUpdate = true;
      }
    }
  }

  private createCacheKey(slot: TextureSlotId, options: MaterialOptions): string {
    return [
      slot,
      options.tint ? String(options.tint) : 'def',
      options.uvScale ?? 'def',
      options.normalScale ?? 'def',
      options.roughnessScale ?? 'def',
      options.mapping ?? 'uv',
      options.physical ? 'phys' : 'std',
      options.clearcoat ?? '0',
      options.clearcoatRoughness ?? '0',
      options.metalness ?? 'def',
      options.vertexColors ? 'vc' : 'novc',
      options.alphaTest ?? '0',
    ].join('_');
  }

  dispose(): void {
    for (const mat of this.cache.values()) {
      mat.dispose();
    }
    this.cache.clear();
    this.registeredMaterials.clear();
  }
}
