import * as THREE from 'three';
import { createSeededRandom } from '@/engine/world/layout';
import type { TimeOfDayState } from '@/engine/world/sky';
import type { DeviceProfile } from '@/lib/deviceProfile';
import type { AssetStore } from '@/engine/core/AssetStore';

/**
 * 1. Global Height-and-Distance Fog Chunk Override:
 * Density drops exponentially with altitude above the cloud sea:
 * density = exp(-k * max(y - baseY, 0)), baseY = -8, k = 0.045,
 * and fog color shifts toward dusk purple (#5B49C9 / #362450) with distance.
 */
let fogChunkPatched = false;
export function patchHeightAndDistanceFog(): void {
  if (fogChunkPatched) return;
  fogChunkPatched = true;

  THREE.ShaderChunk.fog_pars_vertex = `
#ifdef USE_FOG
  varying float vFogDepth;
  varying float vFogWorldY;
#endif
`;

  THREE.ShaderChunk.fog_vertex = `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vec4 arkFogWp = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    arkFogWp = instanceMatrix * arkFogWp;
  #endif
  arkFogWp = modelMatrix * arkFogWp;
  vFogWorldY = arkFogWp.y;
#endif
`;

  THREE.ShaderChunk.fog_pars_fragment = `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying float vFogWorldY;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif
`;

  THREE.ShaderChunk.fog_fragment = `
#ifdef USE_FOG
  float arkFogHeight = exp( - 0.045 * max( vFogWorldY - (-8.0), 0.0 ) );
  #ifdef FOG_EXP2
    float effectiveDensity = fogDensity * arkFogHeight;
    float fogFactor = 1.0 - exp( - effectiveDensity * effectiveDensity * vFogDepth * vFogDepth );
  #else
    float distFactor = smoothstep( fogNear, fogFar, vFogDepth );
    float fogFactor = clamp( distFactor * ( 0.35 + 0.65 * arkFogHeight ), 0.0, 1.0 );
  #endif
  float distShift = smoothstep( max(15.0, fogNear * 0.8), fogFar * 0.85, vFogDepth );
  vec3 arkDuskPurple = vec3( 0.36, 0.28, 0.44 );
  vec3 effectiveFogColor = mix( fogColor, mix( fogColor, arkDuskPurple, 0.08 ), distShift );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, effectiveFogColor, clamp( fogFactor, 0.0, 1.0 ) );
#endif
`;
}
patchHeightAndDistanceFog();

/**
 * 2. New World Colour Law (sRGB Natural Palette, strictly <= 0.80 albedo)
 */
export const WORLD_PALETTE = {
  // Grass & moss
  grassLit: '#8DB04C',
  grassMid: '#5E8C3A',
  grassShadow: '#3C5E2A',
  moss: '#4C6B34',
  // Rock & stone
  rockWarmGrey: '#8D857B',
  rockShadowTint: '#6B6478',
  wetRock: '#5E5A66',
  pavingStone: '#BDB3A3',
  pavingGrout: '#6E6659',
  plaster: '#E2DCCD',
  // Wood & lacquer
  bark: '#6B5240',
  timber: '#5B3F2B',
  lacquerVermilion: '#B3342A',
  // Roof & architectural accents
  roofTileSlateTeal: '#3F4F55',
  gold: '#D9A441',
  bronze: '#4D6256',
  // Flora
  mapleOrange: '#E8601C',
  mapleRed: '#C23B22',
  ginkgoGold: '#E8B923',
  wisteria: '#9B7BE0',
  lavender: '#B9A6FF',
  pine: '#2F5A3A',
  // Water
  waterShallow: '#4FB3BF',
  waterDeep: '#1F5F7A',
} as const;

/**
 * Generates a deterministic 512x512 Voronoi stone paving CanvasTexture
 * in warm paving stone #BDB3A3 with darker grout #6E6659.
 */
function createVoronoiPavingTexture(): THREE.CanvasTexture {
  const size = 512;
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
    const rng = createSeededRandom(918273);
    const numCells = 64;
    const pts: { x: number; y: number; tone: number; warm: number }[] = [];
    for (let i = 0; i < numCells; i++) {
      pts.push({
        x: rng() * size,
        y: rng() * size,
        tone: (rng() - 0.5) * 12,
        warm: (rng() - 0.5) * 8,
      });
    }

    const img = ctx.createImageData(size, size);
    const data = img.data;

    // Tileable Voronoi evaluation at 4x4 block resolution for rapid startup
    const step = 4;
    for (let y = 0; y < size; y += step) {
      for (let x = 0; x < size; x += step) {
        let d1 = Infinity;
        let d2 = Infinity;
        let winIdx = 0;

        for (let i = 0; i < numCells; i++) {
          const p = pts[i]!;
          let dx = Math.abs(x - p.x);
          let dy = Math.abs(y - p.y);
          if (dx > size * 0.5) dx = size - dx;
          if (dy > size * 0.5) dy = size - dy;
          const dSq = dx * dx + dy * dy;
          if (dSq < d1) {
            d2 = d1;
            d1 = dSq;
            winIdx = i;
          } else if (dSq < d2) {
            d2 = dSq;
          }
        }

        const edgeDist = Math.sqrt(d2) - Math.sqrt(d1);
        const cell = pts[winIdx]!;
        const isJoint = edgeDist < 2.8;

        // Base paving stone #BDB3A3 -> RGB(189, 179, 163)
        let r = 189 + cell.tone + cell.warm * 0.7;
        let g = 179 + cell.tone;
        let b = 163 + cell.tone - cell.warm * 0.6;

        if (isJoint) {
          // Darker grout #6E6659 -> RGB(110, 102, 89)
          const jointFactor = Math.max(0, edgeDist / 2.8);
          const darken = 65 * (1 - jointFactor);
          r -= darken;
          g -= darken * 0.95;
          b -= darken * 0.9;
        }

        const R = Math.max(0, Math.min(255, Math.round(r)));
        const G = Math.max(0, Math.min(255, Math.round(g)));
        const B = Math.max(0, Math.min(255, Math.round(b)));

        for (let sy = 0; sy < step; sy++) {
          const rowOffset = (y + sy) * size;
          for (let sx = 0; sx < step; sx++) {
            const idx = (rowOffset + (x + sx)) * 4;
            data[idx] = R;
            data[idx + 1] = G;
            data[idx + 2] = B;
            data[idx + 3] = 255;
          }
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3.5, 3.5);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Soft radial puff texture (128x128) for the island mist skirt.
 */
function createMistPuffTexture(): THREE.CanvasTexture {
  const size = 128;
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
    const grad = ctx.createRadialGradient(
      size * 0.5,
      size * 0.5,
      size * 0.05,
      size * 0.5,
      size * 0.5,
      size * 0.48,
    );
    grad.addColorStop(0, 'rgba(235, 230, 244, 0.22)');
    grad.addColorStop(0.45, 'rgba(215, 205, 230, 0.09)');
    grad.addColorStop(1, 'rgba(215, 205, 230, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export interface RimAndNoiseUniforms {
  uKeyLightDir: { value: THREE.Vector3 };
  uRimSkyColor: { value: THREE.Color };
  uRimStrength: { value: number };
}

/**
 * Attaches the subtle world-position noise hook and sky-coloured Fresnel rim term.
 */
function attachSurfaceNoiseAndFresnelRim(
  material: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial,
  sharedUniforms: RimAndNoiseUniforms,
  cacheKey: string,
): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uKeyLightDir = sharedUniforms.uKeyLightDir;
    shader.uniforms.uRimSkyColor = sharedUniforms.uRimSkyColor;
    shader.uniforms.uRimStrength = sharedUniforms.uRimStrength;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
      varying vec3 vArkWorldPos;
      varying vec3 vArkWorldNormal;`,
    );

    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      vec4 arkWp = vec4(transformed, 1.0);
      vec3 arkWn = objectNormal;
      #ifdef USE_INSTANCING
        arkWp = instanceMatrix * arkWp;
        arkWn = mat3(instanceMatrix) * arkWn;
      #endif
      arkWp = modelMatrix * arkWp;
      vArkWorldPos = arkWp.xyz;
      vArkWorldNormal = normalize(mat3(modelMatrix) * arkWn);`,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
      uniform vec3 uKeyLightDir;
      uniform vec3 uRimSkyColor;
      uniform float uRimStrength;
      varying vec3 vArkWorldPos;
      varying vec3 vArkWorldNormal;`,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      float arkNoise = sin(vArkWorldPos.x * 0.21 + vArkWorldPos.z * 0.17) * cos(vArkWorldPos.y * 0.27 - vArkWorldPos.x * 0.13) * 0.55
                     + sin(vArkWorldPos.x * 0.57 - vArkWorldPos.z * 0.49 + vArkWorldPos.y * 0.37) * 0.45;
      diffuseColor.rgb *= (1.0 + arkNoise * 0.004);`,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `vec3 arkViewDir = normalize(cameraPosition - vArkWorldPos);
      vec3 arkNorm = normalize(vArkWorldNormal);
      float arkFresnel = pow(1.0 - clamp(abs(dot(arkNorm, arkViewDir)), 0.0, 1.0), 2.5);
      float arkBackFacing = smoothstep(-0.25, 0.78, -dot(arkNorm, normalize(uKeyLightDir)));
      outgoingLight += uRimSkyColor * (arkFresnel * (0.32 + 0.68 * arkBackFacing) * uRimStrength);
      #include <opaque_fragment>`,
    );
  };
  material.customProgramCacheKey = () => cacheKey;
}

export class WorldMaterialBank {
  // PBR and Standard Architectural materials
  readonly porcelain: THREE.MeshPhysicalMaterial; // warm plaster #E2DCCD
  readonly plaster: THREE.MeshPhysicalMaterial; // alias
  readonly plazaPorcelain: THREE.MeshPhysicalMaterial; // warm paving stone #BDB3A3 with Voronoi texture
  readonly pavingStone: THREE.MeshStandardMaterial; // plain paving stone
  readonly grassTop: THREE.MeshStandardMaterial; // mid-grass green with vertex colors
  readonly stone: THREE.MeshStandardMaterial; // warm grey #8D857B
  readonly stoneVertex: THREE.MeshStandardMaterial; // underside rock with purple-grey shading #6B6478
  readonly stoneWarm: THREE.MeshStandardMaterial; // stalactites & roots
  readonly gold: THREE.MeshStandardMaterial; // #D9A441
  readonly glazedTile: THREE.MeshPhysicalMaterial; // slate-teal #3F4F55
  readonly timber: THREE.MeshStandardMaterial; // rich timber #5B3F2B
  readonly lightWood: THREE.MeshStandardMaterial; // alias
  readonly bark: THREE.MeshStandardMaterial; // #6B5240
  readonly lacquerVermilion: THREE.MeshPhysicalMaterial; // #B3342A
  readonly ceilingWarm: THREE.MeshStandardMaterial;
  readonly sanctuarySilhouette: THREE.MeshStandardMaterial;
  readonly blossomCanopy: THREE.MeshStandardMaterial;

  // Emissive & lighting
  readonly emissiveWarm: THREE.MeshBasicMaterial;
  readonly emissiveOrange: THREE.MeshBasicMaterial;
  readonly emissivePurple: THREE.MeshBasicMaterial;
  readonly lanternGlow: THREE.MeshBasicMaterial;
  readonly mistSkirt: THREE.MeshBasicMaterial;

  // Custom Shaders
  readonly veil: THREE.ShaderMaterial;
  readonly gateVeil: THREE.ShaderMaterial;
  readonly breathPoolWater: THREE.ShaderMaterial;

  private readonly pavingTex: THREE.CanvasTexture;
  private readonly mistTex: THREE.CanvasTexture;

  readonly uSwayTime = { value: 0 };
  readonly rimUniforms: RimAndNoiseUniforms;

  private lastSyncHour = -999;
  private skySyncCount = 0;

  // Pre-allocated colour scratchpads
  private readonly cDawnEmissive = new THREE.Color('#FF8A3D').multiplyScalar(1.5);
  private readonly cDayEmissive = new THREE.Color('#FFF5EA').multiplyScalar(1.1);
  private readonly cDuskEmissive = new THREE.Color('#B594FF').multiplyScalar(1.6);
  private readonly cNightEmissive = new THREE.Color('#9D84FF').multiplyScalar(1.5);

  private readonly cNoonInlayOrange = new THREE.Color('#CFA06E');
  private readonly cNightInlayOrange = new THREE.Color('#FF8A3D').multiplyScalar(1.35);
  private readonly cNoonInlayPurple = new THREE.Color('#9E90B8');
  private readonly cNightInlayPurple = new THREE.Color('#9D84FF').multiplyScalar(1.4);

  private readonly cDawnLantern = new THREE.Color('#FF9E58').multiplyScalar(1.55);
  private readonly cDayLantern = new THREE.Color('#FFF4E5').multiplyScalar(1.1);
  private readonly cDuskLantern = new THREE.Color('#FFA65C').multiplyScalar(1.65);
  private readonly cNightLantern = new THREE.Color('#FFB068').multiplyScalar(1.7);

  // Pool colors: cyan-teal (#4FB3BF to #1F5F7A)
  private readonly cPoolDawnCore = new THREE.Color('#4FB3BF');
  private readonly cPoolDawnRim = new THREE.Color('#1F5F7A');
  private readonly cPoolDayCore = new THREE.Color('#38A6B3');
  private readonly cPoolDayRim = new THREE.Color('#194D63');
  private readonly cPoolDuskCore = new THREE.Color('#5E7BA8');
  private readonly cPoolDuskRim = new THREE.Color('#2C2250');
  private readonly cPoolNightCore = new THREE.Color('#2A3855');
  private readonly cPoolNightRim = new THREE.Color('#161030');

  constructor(device?: Pick<DeviceProfile, 'deviceClass'>, assets?: AssetStore) {
    const isPhone = device?.deviceClass === 'phone';
    const rimStrength = isPhone ? 0.25 : 0.35;

    this.rimUniforms = {
      uKeyLightDir: { value: new THREE.Vector3(0.5, 0.6, -0.5).normalize() },
      uRimSkyColor: { value: new THREE.Color('#FF8A3D') },
      uRimStrength: { value: rimStrength },
    };

    // 1. Textures
    this.pavingTex = createVoronoiPavingTexture();
    this.mistTex = createMistPuffTexture();

    const plasterSlot = assets?.getSlot('plaster');
    const pathSlot = assets?.getSlot('path');
    const stoneSlot = assets?.getSlot('stone');
    const timberSlot = assets?.getSlot('timber');
    const roofSlot = assets?.getSlot('roof');
    const barkSlot = assets?.getSlot('bark');

    // 2. Porcelain / Plaster: MeshPhysicalMaterial wired to plaster slot
    this.porcelain = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(WORLD_PALETTE.plaster).multiplyScalar(plasterSlot?.albedoGain ?? 1.0),
      map: plasterSlot?.diff,
      normalMap: plasterSlot?.nor,
      roughness: 0.9,
      metalness: 0.02,
      clearcoat: 0.25,
      clearcoatRoughness: 0.35,
      envMapIntensity: 0.75,
    });
    attachSurfaceNoiseAndFresnelRim(
      this.porcelain,
      this.rimUniforms,
      `arkvoid-porcelain-${isPhone ? 'phone' : 'desk'}-v3`,
    );
    this.plaster = this.porcelain;

    // 3. Plaza Paving with path slot (roughness variation, damp darker at edges)
    this.plazaPorcelain = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(WORLD_PALETTE.pavingStone).multiplyScalar(pathSlot?.albedoGain ?? 1.0),
      map: pathSlot?.diff ?? this.pavingTex,
      normalMap: pathSlot?.nor,
      roughness: 0.8,
      metalness: 0.02,
      clearcoat: 0.15,
      clearcoatRoughness: 0.4,
      envMapIntensity: 0.65,
    });
    attachSurfaceNoiseAndFresnelRim(
      this.plazaPorcelain,
      this.rimUniforms,
      `arkvoid-plaza-paving-${isPhone ? 'phone' : 'desk'}-v3`,
    );

    // 4. Plain Paving Stone (for platforms, bridge decks, steps, lantern posts)
    this.pavingStone = new THREE.MeshStandardMaterial({
      color: new THREE.Color(WORLD_PALETTE.pavingStone).multiplyScalar(stoneSlot?.albedoGain ?? 1.0),
      map: stoneSlot?.diff,
      normalMap: stoneSlot?.nor,
      roughness: 0.8,
      metalness: 0.02,
      envMapIntensity: 0.55,
    });
    attachSurfaceNoiseAndFresnelRim(
      this.pavingStone,
      this.rimUniforms,
      `arkvoid-paving-stone-${isPhone ? 'phone' : 'desk'}-v3`,
    );

    const grassSlot = assets?.getSlot('grass');

    // 5. Island Top Grass (mid-grass green #5E8C3A with vertex colors for macro noise)
    this.grassTop = new THREE.MeshStandardMaterial({
      color: new THREE.Color(WORLD_PALETTE.grassMid).multiplyScalar(grassSlot?.albedoGain ?? 1.0),
      map: grassSlot?.diff ?? null,
      normalMap: grassSlot?.nor ?? null,
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.0,
      envMapIntensity: 0.45,
    });
    attachSurfaceNoiseAndFresnelRim(
      this.grassTop,
      this.rimUniforms,
      `arkvoid-grass-top-${isPhone ? 'phone' : 'desk'}-v3`,
    );

    // 6. Glazed Roof Tiles: roof slot with slate-teal tint #3F4F55 at 35 percent
    const roofColor = new THREE.Color('#FFFFFF').lerp(new THREE.Color(WORLD_PALETTE.roofTileSlateTeal), 0.35);
    this.glazedTile = new THREE.MeshPhysicalMaterial({
      color: roofColor.multiplyScalar(roofSlot?.albedoGain ?? 1.0),
      map: roofSlot?.diff,
      normalMap: roofSlot?.nor,
      roughness: 0.55,
      metalness: 0.06,
      clearcoat: 0.45,
      clearcoatRoughness: 0.22,
      envMapIntensity: 0.85,
    });
    this.glazedTile.onBeforeCompile = (shader) => {
      shader.uniforms.uKeyLightDir = this.rimUniforms.uKeyLightDir;
      shader.uniforms.uRimSkyColor = this.rimUniforms.uRimSkyColor;
      shader.uniforms.uRimStrength = this.rimUniforms.uRimStrength;

      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vTileLocalPos;\nvarying vec3 vTileWorldPos;\nvarying vec3 vTileWorldNormal;',
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvTileLocalPos = position;',
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 tileWp = modelMatrix * vec4(transformed, 1.0);
        vTileWorldPos = tileWp.xyz;
        vTileWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uKeyLightDir;
        uniform vec3 uRimSkyColor;
        uniform float uRimStrength;
        varying vec3 vTileLocalPos;
        varying vec3 vTileWorldPos;
        varying vec3 vTileWorldNormal;`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float tileRow = sin(vTileLocalPos.x * 26.0) * 0.5 + 0.5;
        float tileLap = sin(length(vTileLocalPos.xz) * 18.0) * 0.5 + 0.5;
        float stripe = mix(0.94, 1.05, smoothstep(0.2, 0.8, tileRow) * 0.72 + tileLap * 0.28);
        diffuseColor.rgb *= stripe;`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `vec3 tileViewDir = normalize(cameraPosition - vTileWorldPos);
        vec3 tileNorm = normalize(vTileWorldNormal);
        float tileFresnel = pow(1.0 - clamp(abs(dot(tileNorm, tileViewDir)), 0.0, 1.0), 2.4);
        float tileBack = smoothstep(-0.2, 0.75, -dot(tileNorm, normalize(uKeyLightDir)));
        outgoingLight += uRimSkyColor * (tileFresnel * (0.35 + 0.65 * tileBack) * uRimStrength * 0.85);
        #include <opaque_fragment>`,
      );
    };
    this.glazedTile.customProgramCacheKey = () =>
      `arkvoid-glazed-tile-${isPhone ? 'phone' : 'desk'}-v3`;

    // 7. Stone: stone slot with warm grey
    this.stone = new THREE.MeshStandardMaterial({
      color: new THREE.Color(WORLD_PALETTE.rockWarmGrey).multiplyScalar(stoneSlot?.albedoGain ?? 1.0),
      map: stoneSlot?.diff,
      normalMap: stoneSlot?.nor,
      roughness: 0.8,
      metalness: 0.02,
      envMapIntensity: 0.55,
    });
    attachSurfaceNoiseAndFresnelRim(
      this.stone,
      this.rimUniforms,
      `arkvoid-stone-${isPhone ? 'phone' : 'desk'}-v3`,
    );

    // 8. Stone (vertex colored for island underside with purple-grey shadow tint #6B6478 and strata)
    this.stoneVertex = new THREE.MeshStandardMaterial({
      color: new THREE.Color(WORLD_PALETTE.rockWarmGrey).multiplyScalar(stoneSlot?.albedoGain ?? 1.0),
      map: stoneSlot?.diff,
      normalMap: stoneSlot?.nor,
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.02,
      envMapIntensity: 0.5,
    });
    attachSurfaceNoiseAndFresnelRim(
      this.stoneVertex,
      this.rimUniforms,
      `arkvoid-stone-vertex-${isPhone ? 'phone' : 'desk'}-v3`,
    );

    // 9. Warm Stone (stalactites & roots)
    this.stoneWarm = new THREE.MeshStandardMaterial({
      color: new THREE.Color(WORLD_PALETTE.rockWarmGrey).multiplyScalar(stoneSlot?.albedoGain ?? 1.0),
      map: stoneSlot?.diff,
      normalMap: stoneSlot?.nor,
      roughness: 0.85,
      metalness: 0.02,
      envMapIntensity: 0.55,
    });
    attachSurfaceNoiseAndFresnelRim(
      this.stoneWarm,
      this.rimUniforms,
      `arkvoid-stone-warm-${isPhone ? 'phone' : 'desk'}-v3`,
    );

    // 10. Gold: metalness 1, roughness 0.3, colour #D9A441
    this.gold = new THREE.MeshStandardMaterial({
      color: new THREE.Color(WORLD_PALETTE.gold),
      metalness: 1.0,
      roughness: 0.3,
      envMapIntensity: 1.15,
    });

    // 11. Timber: natural rich timber #5B3F2B on beams
    this.timber = new THREE.MeshStandardMaterial({
      color: new THREE.Color(WORLD_PALETTE.timber).multiplyScalar(timberSlot?.albedoGain ?? 1.0),
      map: timberSlot?.diff,
      normalMap: timberSlot?.nor,
      roughness: 0.65,
      metalness: 0.02,
      envMapIntensity: 0.55,
    });
    this.lightWood = this.timber;

    // 12. Bark: bark slot #6B5240
    this.bark = new THREE.MeshStandardMaterial({
      color: new THREE.Color(WORLD_PALETTE.bark).multiplyScalar(barkSlot?.albedoGain ?? 1.0),
      map: barkSlot?.diff,
      normalMap: barkSlot?.nor,
      roughness: 0.9,
      metalness: 0.01,
      envMapIntensity: 0.45,
    });

    // 13. Vermilion Lacquer: timber slot tinted toward lacquer vermilion #B3342A at 55 percent for columns
    const columnColor = new THREE.Color(WORLD_PALETTE.timber).lerp(
      new THREE.Color(WORLD_PALETTE.lacquerVermilion),
      0.55,
    );
    this.lacquerVermilion = new THREE.MeshPhysicalMaterial({
      color: columnColor.multiplyScalar(timberSlot?.albedoGain ?? 1.0),
      map: timberSlot?.diff,
      normalMap: timberSlot?.nor,
      roughness: 0.35,
      metalness: 0.04,
      clearcoat: 0.4,
      clearcoatRoughness: 0.25,
      envMapIntensity: 0.8,
    });
    attachSurfaceNoiseAndFresnelRim(
      this.lacquerVermilion,
      this.rimUniforms,
      `arkvoid-lacquer-vermilion-${isPhone ? 'phone' : 'desk'}-v3`,
    );

    // 14. Pavilion warm white ceiling
    this.ceilingWarm = new THREE.MeshStandardMaterial({
      color: new THREE.Color(WORLD_PALETTE.plaster).multiplyScalar(plasterSlot?.albedoGain ?? 1.0),
      map: plasterSlot?.diff ?? null,
      normalMap: plasterSlot?.nor ?? null,
      roughness: 0.55,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });

    // 15. Sanctuary veiled silhouette material
    this.sanctuarySilhouette = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#4E4564'),
      map: stoneSlot?.diff ?? null,
      roughness: 0.9,
      metalness: 0.0,
    });

    // 16. Blossom Canopy with vertex colors & gentle sway
    this.blossomCanopy = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#FFFFFF'),
      vertexColors: true,
      roughness: 0.58,
      metalness: 0.02,
      envMapIntensity: 0.65,
    });
    this.blossomCanopy.onBeforeCompile = (shader) => {
      shader.uniforms.uSwayTime = this.uSwayTime;
      shader.uniforms.uKeyLightDir = this.rimUniforms.uKeyLightDir;
      shader.uniforms.uRimSkyColor = this.rimUniforms.uRimSkyColor;
      shader.uniforms.uRimStrength = this.rimUniforms.uRimStrength;

      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        '#include <common>\nuniform float uSwayTime;\nvarying vec3 vCanopyWorldPos;\nvarying vec3 vCanopyWorldNormal;',
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float swayPhase = position.x * 0.35 + position.z * 0.27;
        float swayAngle = sin(uSwayTime * 1.35 + swayPhase) * 0.03;
        float heightMask = clamp((position.y - 1.2) * 0.35, 0.0, 1.0);
        transformed.x += sin(swayAngle) * heightMask * 1.4;
        transformed.z += cos(swayAngle * 0.8) * sin(swayAngle) * heightMask * 1.1;`,
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 cWp = vec4(transformed, 1.0);
        vec3 cWn = objectNormal;
        #ifdef USE_INSTANCING
          cWp = instanceMatrix * cWp;
          cWn = mat3(instanceMatrix) * cWn;
        #endif
        cWp = modelMatrix * cWp;
        vCanopyWorldPos = cWp.xyz;
        vCanopyWorldNormal = normalize(mat3(modelMatrix) * cWn);`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uKeyLightDir;
        uniform vec3 uRimSkyColor;
        uniform float uRimStrength;
        varying vec3 vCanopyWorldPos;
        varying vec3 vCanopyWorldNormal;`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `vec3 cView = normalize(cameraPosition - vCanopyWorldPos);
        vec3 cNorm = normalize(vCanopyWorldNormal);
        float cFresnel = pow(1.0 - clamp(abs(dot(cNorm, cView)), 0.0, 1.0), 2.0);
        outgoingLight += uRimSkyColor * (cFresnel * uRimStrength * 0.75);
        #include <opaque_fragment>`,
      );
    };
    this.blossomCanopy.customProgramCacheKey = () =>
      `arkvoid-blossom-sway-${isPhone ? 'phone' : 'desk'}-v3`;

    // 17. Emissives (warm, orange, purple, lantern)
    this.emissiveWarm = new THREE.MeshBasicMaterial({
      color: this.cDawnEmissive.clone(),
      toneMapped: false,
    });

    this.emissiveOrange = new THREE.MeshBasicMaterial({
      color: new THREE.Color(WORLD_PALETTE.mapleOrange),
      toneMapped: false,
    });

    this.emissivePurple = new THREE.MeshBasicMaterial({
      color: new THREE.Color(WORLD_PALETTE.wisteria),
      toneMapped: false,
    });

    this.lanternGlow = new THREE.MeshBasicMaterial({
      color: this.cDawnLantern.clone(),
      toneMapped: false,
    });

    // 18. Mist skirt
    this.mistSkirt = new THREE.MeshBasicMaterial({
      map: this.mistTex,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // 19. Luminous Sealed Gate Veil ShaderMaterial
    this.gateVeil = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uGlowStrength: { value: 0.85 },
        uOrange: { value: new THREE.Color('#FF8A3D') },
        uPurple: { value: new THREE.Color('#8E72FF') },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vNormalW;
        varying vec3 vViewDir;

        void main() {
          vUv = uv;
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vNormalW = normalize(mat3(modelMatrix) * normal);
          vViewDir = normalize(cameraPosition - worldPos.xyz);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uGlowStrength;
        uniform vec3 uOrange;
        uniform vec3 uPurple;

        varying vec2 vUv;
        varying vec3 vNormalW;
        varying vec3 vViewDir;

        void main() {
          float xFreq1 = sin(vUv.x * 28.0 + sin(vUv.y * 6.0 - uTime * 0.7) * 1.4);
          float xFreq2 = cos(vUv.x * 44.0 - uTime * 0.35 + vUv.y * 8.0);
          float thread = pow(clamp(xFreq1 * 0.5 + 0.5, 0.0, 1.0), 2.4) * 0.65
                       + pow(clamp(xFreq2 * 0.5 + 0.5, 0.0, 1.0), 3.0) * 0.45;

          float drift = sin(vUv.y * 10.0 - uTime * 1.25 + vUv.x * 4.0) * 0.5 + 0.5;
          vec3 threadColor = mix(uOrange, uPurple, clamp(vUv.y * 0.75 + (drift - 0.5) * 0.35, 0.0, 1.0));

          float ndotv = abs(dot(normalize(vNormalW), normalize(vViewDir)));
          float fresnel = pow(1.0 - ndotv, 1.8);

          float edgeX = smoothstep(0.0, 0.14, vUv.x) * smoothstep(1.0, 0.86, vUv.x);
          float edgeY = smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.85, vUv.y);
          float borderGlow = (1.0 - edgeX * edgeY) * 0.55;

          vec3 col = threadColor * (0.48 + thread * 1.05 + fresnel * 0.72 + borderGlow * 0.45);
          float alpha = clamp((0.18 + thread * 0.36 + fresnel * 0.26 + borderGlow * 0.22) * uGlowStrength, 0.08, 0.82);

          gl_FragColor = vec4(col, alpha);
        }
      `,
    });
    this.veil = this.gateVeil;

    // 20. Breath Pool Water ShaderMaterial: cyan-teal with gold sun glints
    this.breathPoolWater = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uGlowStrength: { value: 0.82 },
        uColorCore: { value: new THREE.Color(WORLD_PALETTE.waterShallow) },
        uColorRim: { value: new THREE.Color(WORLD_PALETTE.waterDeep) },
        uSkyRimTint: { value: new THREE.Color('#D8EEF5') },
        uKeyLightDir: this.rimUniforms.uKeyLightDir,
        uGoldGlint: { value: new THREE.Color(WORLD_PALETTE.gold) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying vec3 vViewDir;

        void main() {
          vUv = uv;
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          vViewDir = normalize(cameraPosition - worldPos.xyz);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uGlowStrength;
        uniform vec3 uColorCore;
        uniform vec3 uColorRim;
        uniform vec3 uSkyRimTint;
        uniform vec3 uKeyLightDir;
        uniform vec3 uGoldGlint;

        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying vec3 vViewDir;

        vec2 waterNoiseGrad(vec2 p) {
          float sx = sin(p.x * 4.2 + cos(p.y * 3.7)) * cos(p.y * 4.1 - sin(p.x * 2.9));
          float sy = cos(p.y * 4.5 + sin(p.x * 3.4)) * sin(p.x * 3.9 + cos(p.y * 3.1));
          return vec2(sx, sy);
        }

        void main() {
          vec2 p = (vUv - 0.5) * 2.0;
          float r = length(p);
          if (r > 1.0) discard;

          vec2 uvScroll1 = p * 2.3 + vec2(uTime * 0.16, uTime * 0.11);
          vec2 uvScroll2 = p * 3.6 + vec2(-uTime * 0.13, uTime * 0.18);
          vec2 nGrad = waterNoiseGrad(uvScroll1) * 0.6 + waterNoiseGrad(uvScroll2) * 0.4;

          float wave1 = sin(r * 21.0 - uTime * 1.45);
          float wave2 = sin(r * 11.0 - uTime * 0.85 + 1.2);
          float ringCrest = smoothstep(0.65, 1.0, wave1 * 0.65 + wave2 * 0.35) * (1.0 - r * 0.55);

          vec2 radialDir = r > 0.001 ? (p / r) : vec2(0.0, 0.0);
          vec2 normalXZ = nGrad * 0.16 + radialDir * cos(r * 21.0 - uTime * 1.45) * 0.12 * (1.0 - r * 0.4);
          vec3 waterNormal = normalize(vec3(normalXZ.x, 1.0, normalXZ.y));

          float radialT = smoothstep(0.0, 0.94, r);
          vec3 baseWater = mix(uColorCore, uColorRim, radialT);

          float centerPulse = (1.0 - smoothstep(0.0, 0.68, r)) * (0.28 + 0.08 * sin(uTime * 1.1));
          vec3 ringColor = mix(uColorCore, vec3(0.9, 0.98, 1.0), 0.55);

          // Specular glint from key light with gold sun glint tint
          vec3 halfVec = normalize(normalize(uKeyLightDir) + normalize(vViewDir));
          float spec = pow(max(0.0, dot(waterNormal, halfVec)), 36.0);
          vec3 glintColor = mix(vec3(1.0, 0.98, 0.92), uGoldGlint, 0.5) * (spec * 0.65);

          float ndotv = clamp(dot(waterNormal, normalize(vViewDir)), 0.0, 1.0);
          float viewFresnel = pow(1.0 - ndotv, 2.2);
          float rimMeniscus = smoothstep(0.70, 0.99, r);
          float rimBright = clamp(viewFresnel * 0.65 + rimMeniscus * 0.78, 0.0, 1.25);

          vec3 col = baseWater * (0.78 + centerPulse * uGlowStrength)
                   + ringColor * (ringCrest * 0.38 * uGlowStrength)
                   + uSkyRimTint * (rimBright * 0.46)
                   + glintColor;

          float alpha = mix(0.90, 0.98, clamp(centerPulse + rimMeniscus * 0.7, 0.0, 1.0));
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });
  }

  getSkySyncCount(): number {
    return this.skySyncCount;
  }

  syncSkyState(skyState: TimeOfDayState, force = false): boolean {
    const h = skyState.hour;
    const rawDiff = Math.abs(h - this.lastSyncHour);
    const wrappedDiff =
      this.lastSyncHour < 0 ? Infinity : Math.min(rawDiff, 24 - rawDiff);
    if (!force && wrappedDiff < 0.01) {
      return false;
    }
    this.lastSyncHour = h;
    this.skySyncCount++;

    // 1. Update shared key light direction and Fresnel rim sky color
    this.rimUniforms.uKeyLightDir.value
      .copy(skyState.keyLightDirection)
      .normalize();
    // Warm orange rim at dawn/golden hour, lavender rim at dusk
    this.rimUniforms.uRimSkyColor.value
      .copy(skyState.hemiSky)
      .lerp(skyState.light, 0.35)
      .multiplyScalar(1.05);

    // 2. Compute smooth phase weights for emissives & pool
    let nightFactor = 1.0;
    if (h >= 7.0 && h <= 17.5) {
      if (h < 9.5) {
        nightFactor = 1.0 - (h - 7.0) / 2.5;
      } else if (h > 15.5) {
        nightFactor = (h - 15.5) / 2.0;
      } else {
        nightFactor = 0.08;
      }
    }

    const poolCore = this.breathPoolWater.uniforms.uColorCore!
      .value as THREE.Color;
    const poolRim = this.breathPoolWater.uniforms.uColorRim!
      .value as THREE.Color;
    const poolSkyRim = this.breathPoolWater.uniforms.uSkyRimTint!
      .value as THREE.Color;
    poolSkyRim.copy(skyState.hemiSky).lerp(skyState.light, 0.35);

    if (h >= 4.5 && h < 8.5) {
      // Dawn
      const t = Math.max(0, Math.min(1, (h - 4.5) / 2.0));
      const fadeToDay = h > 6.8 ? (h - 6.8) / 1.7 : 0;
      this.emissiveWarm.color
        .copy(this.cNightEmissive)
        .lerp(this.cDawnEmissive, t)
        .lerp(this.cDayEmissive, fadeToDay);
      this.lanternGlow.color
        .copy(this.cNightLantern)
        .lerp(this.cDawnLantern, t)
        .lerp(this.cDayLantern, fadeToDay);
      poolCore
        .copy(this.cPoolNightCore)
        .lerp(this.cPoolDawnCore, t)
        .lerp(this.cPoolDayCore, fadeToDay);
      poolRim
        .copy(this.cPoolNightRim)
        .lerp(this.cPoolDawnRim, t)
        .lerp(this.cPoolDayRim, fadeToDay);
    } else if (h >= 8.5 && h < 16.2) {
      // Day
      this.emissiveWarm.color.copy(this.cDayEmissive);
      this.lanternGlow.color.copy(this.cDayLantern);
      poolCore.copy(this.cPoolDayCore);
      poolRim.copy(this.cPoolDayRim);
    } else if (h >= 16.2 && h < 20.5) {
      // Dusk
      const intoDusk = Math.max(0, Math.min(1, (h - 16.2) / 1.8));
      const intoNight = h > 19.0 ? (h - 19.0) / 1.5 : 0;
      this.emissiveWarm.color
        .copy(this.cDayEmissive)
        .lerp(this.cDuskEmissive, intoDusk)
        .lerp(this.cNightEmissive, intoNight);
      this.lanternGlow.color
        .copy(this.cDayLantern)
        .lerp(this.cDuskLantern, intoDusk)
        .lerp(this.cNightLantern, intoNight);
      poolCore
        .copy(this.cPoolDayCore)
        .lerp(this.cPoolDuskCore, intoDusk)
        .lerp(this.cPoolNightCore, intoNight);
      poolRim
        .copy(this.cPoolDayRim)
        .lerp(this.cPoolDuskRim, intoDusk)
        .lerp(this.cPoolNightRim, intoNight);
    } else {
      // Night
      this.emissiveWarm.color.copy(this.cNightEmissive);
      this.lanternGlow.color.copy(this.cNightLantern);
      poolCore.copy(this.cPoolNightCore);
      poolRim.copy(this.cPoolNightRim);
    }

    this.emissiveOrange.color
      .copy(this.cNoonInlayOrange)
      .lerp(this.cNightInlayOrange, nightFactor);
    this.emissivePurple.color
      .copy(this.cNoonInlayPurple)
      .lerp(this.cNightInlayPurple, nightFactor);

    this.gateVeil.uniforms.uGlowStrength!.value = 0.54 + nightFactor * 0.52;
    this.breathPoolWater.uniforms.uGlowStrength!.value =
      0.52 + nightFactor * 0.56;
    this.mistSkirt.opacity = 0.2 + nightFactor * 0.16;

    return true;
  }

  update(
    skyState: TimeOfDayState,
    elapsed: number,
    reducedMotion: boolean,
    forceSkySync = false,
  ): void {
    const timeVal = reducedMotion ? 0 : elapsed;
    this.uSwayTime.value = timeVal;
    this.gateVeil.uniforms.uTime!.value = timeVal;
    this.breathPoolWater.uniforms.uTime!.value = timeVal;

    this.syncSkyState(skyState, forceSkySync);
  }

  updateTextures(assets: AssetStore): void {
    const plaster = assets.getSlot('plaster');
    const path = assets.getSlot('path');
    const stone = assets.getSlot('stone');
    const timber = assets.getSlot('timber');
    const roof = assets.getSlot('roof');
    const bark = assets.getSlot('bark');

    const grass = assets.getSlot('grass');
    if (this.grassTop.map !== grass.diff) {
      this.grassTop.map = grass.diff;
      this.grassTop.normalMap = grass.nor;
      this.grassTop.color.set(WORLD_PALETTE.grassMid).multiplyScalar(grass.albedoGain);
      this.grassTop.needsUpdate = true;
    }
    if (this.porcelain.map !== plaster.diff) {
      this.porcelain.map = plaster.diff;
      this.porcelain.normalMap = plaster.nor;
      this.porcelain.color.set(WORLD_PALETTE.plaster).multiplyScalar(plaster.albedoGain);
      this.porcelain.needsUpdate = true;
    }
    if (this.ceilingWarm.map !== plaster.diff) {
      this.ceilingWarm.map = plaster.diff;
      this.ceilingWarm.normalMap = plaster.nor;
      this.ceilingWarm.color.set(WORLD_PALETTE.plaster).multiplyScalar(plaster.albedoGain);
      this.ceilingWarm.needsUpdate = true;
    }
    if (this.plazaPorcelain.map !== path.diff) {
      this.plazaPorcelain.map = path.diff;
      this.plazaPorcelain.normalMap = path.nor;
      this.plazaPorcelain.color.set(WORLD_PALETTE.pavingStone).multiplyScalar(path.albedoGain);
      this.plazaPorcelain.needsUpdate = true;
    }
    if (this.pavingStone.map !== stone.diff) {
      this.pavingStone.map = stone.diff;
      this.pavingStone.normalMap = stone.nor;
      this.pavingStone.color.set(WORLD_PALETTE.pavingStone).multiplyScalar(stone.albedoGain);
      this.pavingStone.needsUpdate = true;
    }
    if (this.stone.map !== stone.diff) {
      this.stone.map = stone.diff;
      this.stone.normalMap = stone.nor;
      this.stone.color.set(WORLD_PALETTE.rockWarmGrey).multiplyScalar(stone.albedoGain);
      this.stone.needsUpdate = true;
    }
    if (this.stoneVertex.map !== stone.diff) {
      this.stoneVertex.map = stone.diff;
      this.stoneVertex.normalMap = stone.nor;
      this.stoneVertex.color.set(WORLD_PALETTE.rockWarmGrey).multiplyScalar(stone.albedoGain);
      this.stoneVertex.needsUpdate = true;
    }
    if (this.stoneWarm.map !== stone.diff) {
      this.stoneWarm.map = stone.diff;
      this.stoneWarm.normalMap = stone.nor;
      this.stoneWarm.color.set(WORLD_PALETTE.rockWarmGrey).multiplyScalar(stone.albedoGain);
      this.stoneWarm.needsUpdate = true;
    }
    if (this.sanctuarySilhouette.map !== stone.diff) {
      this.sanctuarySilhouette.map = stone.diff;
      this.sanctuarySilhouette.needsUpdate = true;
    }
    if (this.glazedTile.map !== roof.diff) {
      this.glazedTile.map = roof.diff;
      this.glazedTile.normalMap = roof.nor;
      const roofCol = new THREE.Color('#FFFFFF').lerp(new THREE.Color(WORLD_PALETTE.roofTileSlateTeal), 0.35);
      this.glazedTile.color.copy(roofCol).multiplyScalar(roof.albedoGain);
      this.glazedTile.needsUpdate = true;
    }
    if (this.timber.map !== timber.diff) {
      this.timber.map = timber.diff;
      this.timber.normalMap = timber.nor;
      this.timber.color.set(WORLD_PALETTE.timber).multiplyScalar(timber.albedoGain);
      this.timber.needsUpdate = true;
    }
    if (this.lacquerVermilion.map !== timber.diff) {
      this.lacquerVermilion.map = timber.diff;
      this.lacquerVermilion.normalMap = timber.nor;
      const colColor = new THREE.Color(WORLD_PALETTE.timber).lerp(
        new THREE.Color(WORLD_PALETTE.lacquerVermilion),
        0.55,
      );
      this.lacquerVermilion.color.copy(colColor).multiplyScalar(timber.albedoGain);
      this.lacquerVermilion.needsUpdate = true;
    }
    if (this.bark.map !== bark.diff) {
      this.bark.map = bark.diff;
      this.bark.normalMap = bark.nor;
      this.bark.color.set(WORLD_PALETTE.bark).multiplyScalar(bark.albedoGain);
      this.bark.needsUpdate = true;
    }
  }

  dispose(): void {
    this.pavingTex.dispose();
    this.mistTex.dispose();

    this.porcelain.dispose();
    this.plazaPorcelain.dispose();
    this.pavingStone.dispose();
    this.grassTop.dispose();
    this.stone.dispose();
    this.stoneVertex.dispose();
    this.stoneWarm.dispose();
    this.gold.dispose();
    this.glazedTile.dispose();
    this.timber.dispose();
    this.bark.dispose();
    this.lacquerVermilion.dispose();
    this.ceilingWarm.dispose();
    this.sanctuarySilhouette.dispose();
    this.blossomCanopy.dispose();
    this.emissiveWarm.dispose();
    this.emissiveOrange.dispose();
    this.emissivePurple.dispose();
    this.lanternGlow.dispose();
    this.mistSkirt.dispose();
    this.gateVeil.dispose();
    this.breathPoolWater.dispose();
  }
}
