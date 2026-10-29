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
}

const SPIRE_DEFS: SpireDef[] = [
  { x: 175, y: 22, z: 85, height: 95, radius: 22 },
  { x: -195, y: 40, z: -95, height: 125, radius: 28 },
  { x: 265, y: -8, z: -215, height: 110, radius: 26 },
  { x: -285, y: 52, z: 145, height: 145, radius: 32 },
  { x: 85, y: 68, z: -365, height: 160, radius: 38 },
  { x: -95, y: -12, z: 345, height: 85, radius: 20 },
  { x: 345, y: 32, z: 225, height: 135, radius: 30 },
];

const SPIRE_AERIAL_VERTEX_SHADER = /* glsl */ `
varying vec3 vWorldPos;
varying vec3 vWorldNormal;

void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const SPIRE_AERIAL_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uBaseColor;
uniform vec3 uHorizonColor;
uniform vec3 uMidSkyColor;
uniform vec3 uTopSkyColor;
uniform vec3 uKeyColor;
uniform vec3 uKeyDir;
uniform float uSunVis;

varying vec3 vWorldPos;
varying vec3 vWorldNormal;

void main() {
  vec3 toFrag = vWorldPos - cameraPosition;
  float dist = length(toFrag);
  vec3 viewDir = toFrag / max(dist, 1e-4);
  float elev = clamp(viewDir.y, 0.0, 1.0);

  // Sample background sky colour at this fragment's view elevation
  vec3 skyAtElev = mix(uHorizonColor, uMidSkyColor, smoothstep(0.0, 0.28, elev));
  skyAtElev = mix(skyAtElev, uTopSkyColor, smoothstep(0.28, 0.78, elev));

  vec3 norm = normalize(vWorldNormal);
  vec3 keyDir = normalize(uKeyDir);
  float ndotl = clamp(dot(norm, keyDir) * 0.5 + 0.5, 0.0, 1.0);

  // Subtle horizontal rock strata bands
  float strata = 0.90 + 0.10 * sin(vWorldPos.y * 0.42 + sin(vWorldPos.x * 0.08) * 1.5);
  vec3 litSurface = uBaseColor * strata * mix(0.52, 0.92, ndotl);

  // Warm rim on the sun-facing silhouette edge at dawn/dusk
  float fresnel = pow(1.0 - clamp(abs(dot(norm, -viewDir)), 0.0, 1.0), 2.4);
  float sunSide = max(0.0, dot(norm, keyDir));
  litSurface += uKeyColor * (fresnel * sunSide * 0.22 * uSunVis);

  // Exponential aerial perspective toward a darker silhouette value than the sky behind it (D10 fix)
  float aerialT = clamp(1.0 - exp(-dist * 0.0042), 0.25, 0.86);
  vec3 aerialTarget = skyAtElev * 0.76;
  vec3 finalCol = mix(litSurface, aerialTarget, aerialT);

  // Guarantee distant spire is always slightly darker than the background sky in daylight/dusk
  vec3 maxAllowed = skyAtElev * 0.88;
  finalCol = min(finalCol, maxAllowed);

  // Soft base mist blend near cloud sea (y = -22 .. +2)
  float baseMist = smoothstep(-24.0, 6.0, vWorldPos.y);
  finalCol = mix(uHorizonColor * 0.86, finalCol, baseMist);

  gl_FragColor = vec4(finalCol, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class DistantSpires extends THREE.Group {
  private readonly rockMesh: THREE.Mesh;
  private readonly foliageMesh: THREE.Mesh;

  private readonly rockMaterial: THREE.ShaderMaterial;
  private readonly foliageMaterial: THREE.ShaderMaterial;

  constructor(isPhone = false, _assets?: AssetStore) {
    super();
    this.name = 'DistantSpires';

    const spireGeos: THREE.BufferGeometry[] = [];
    const foliageGeos: THREE.BufferGeometry[] = [];

    const radialSegments = isPhone ? 24 : 36;
    const heightSegments = isPhone ? 32 : 54;

    for (let i = 0; i < SPIRE_DEFS.length; i++) {
      const def = SPIRE_DEFS[i]!;

      const cone = this.buildSpireGeometry(
        def.radius,
        def.height,
        radialSegments,
        heightSegments,
        i * 137.5,
      );
      cone.translate(def.x, def.y - def.height * 0.45, def.z);
      spireGeos.push(cone);

      const crown = this.buildSummitFoliage(
        def.x,
        def.y + def.height * 0.55,
        def.z,
        def.radius * 0.42,
      );
      foliageGeos.push(crown);
    }

    const mergedRockGeo = BufferGeometryUtils.mergeGeometries(spireGeos, false)!;
    mergedRockGeo.computeVertexNormals();

    const mergedFoliageGeo = BufferGeometryUtils.mergeGeometries(foliageGeos, false)!;
    mergedFoliageGeo.computeVertexNormals();

    const sharedUniforms = {
      uHorizonColor: { value: new THREE.Color('#D68A6C') },
      uMidSkyColor: { value: new THREE.Color('#7C629E') },
      uTopSkyColor: { value: new THREE.Color('#342C5E') },
      uKeyColor: { value: new THREE.Color('#FF9E58') },
      uKeyDir: { value: new THREE.Vector3(0.5, 0.25, -0.5).normalize() },
      uSunVis: { value: 1.0 },
    };

    this.rockMaterial = new THREE.ShaderMaterial({
      vertexShader: SPIRE_AERIAL_VERTEX_SHADER,
      fragmentShader: SPIRE_AERIAL_FRAGMENT_SHADER,
      uniforms: {
        ...sharedUniforms,
        uBaseColor: { value: new THREE.Color('#4A4458') },
      },
    });

    this.foliageMaterial = new THREE.ShaderMaterial({
      vertexShader: SPIRE_AERIAL_VERTEX_SHADER,
      fragmentShader: SPIRE_AERIAL_FRAGMENT_SHADER,
      uniforms: {
        ...sharedUniforms,
        uBaseColor: { value: new THREE.Color('#2B4632') },
      },
    });

    this.rockMesh = new THREE.Mesh(mergedRockGeo, this.rockMaterial);
    this.rockMesh.name = 'DistantSpiresRock';
    this.foliageMesh = new THREE.Mesh(mergedFoliageGeo, this.foliageMaterial);
    this.foliageMesh.name = 'DistantSpiresFoliage';

    // Note: Removed the 160m unlit #8ED6E8 waterfall plane strips that caused the pale-blue vertical sky line defect (D9).
    this.add(this.rockMesh);
    this.add(this.foliageMesh);
  }

  private buildSpireGeometry(
    radius: number,
    height: number,
    radialSeg: number,
    heightSeg: number,
    phase: number,
  ): THREE.BufferGeometry {
    const geo = new THREE.CylinderGeometry(
      radius * 0.28,
      radius * 1.15,
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

      const ridge1 = Math.abs(Math.sin(angle * 5.0 + hFrac * 12.0 + phase));
      const ridge2 = Math.sin(angle * 8.0 - hFrac * 18.0) * 0.5 + 0.5;
      const disp =
        (ridge1 * 0.65 + ridge2 * 0.35) *
        radius *
        0.32 *
        Math.sin(hFrac * Math.PI);

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

  syncSky(skyState: TimeOfDayState): void {
    const u = this.rockMaterial.uniforms;
    (u.uHorizonColor!.value as THREE.Color).copy(skyState.horizon);
    (u.uMidSkyColor!.value as THREE.Color).copy(skyState.mid);
    (u.uTopSkyColor!.value as THREE.Color).copy(skyState.zenith);
    (u.uKeyColor!.value as THREE.Color).copy(skyState.keyColor);
    (u.uKeyDir!.value as THREE.Vector3).copy(skyState.keyLightDirection);
    u.uSunVis!.value = skyState.sunVisibility;
  }

  override dispose(): void {
    this.rockMesh.geometry.dispose();
    this.foliageMesh.geometry.dispose();

    this.rockMaterial.dispose();
    this.foliageMaterial.dispose();
  }
}
