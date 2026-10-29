import * as THREE from 'three';
import { disposeObject3D } from '@/engine/core/Disposables';
import type { TimeOfDayState } from '@/engine/world/sky';
import type { DeviceProfile } from '@/lib/deviceProfile';

const CLOUD_PLANE_VERTEX_SHADER = /* glsl */ `
varying vec3 vWorldPos;
varying vec2 vUv;

void main() {
  vUv = uv;
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPosition.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const CLOUD_PLANE_FRAGMENT_SHADER = /* glsl */ `
uniform float uTime;
uniform float uSpeed;
uniform float uDepthTint;
uniform float uBaseAlpha;
uniform float uLayerIndex;
uniform vec3 uFogColor;
uniform vec3 uSunColor;
uniform vec3 uHorizonColor;
uniform vec3 uSkyTopColor;
uniform vec3 uSunDir;
uniform vec3 uCameraPos;

varying vec3 vWorldPos;
varying vec2 vUv;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Billowy cumulus heightfield using rounded abs/pow lobes
float billowHeight(vec2 p, float t) {
  vec2 driftA = vec2(t * 0.85, t * 0.42);
  vec2 driftB = vec2(-t * 0.48, t * 0.72);

  float n1 = 1.0 - abs(valueNoise(p * 1.0 + driftA) * 2.0 - 1.0);
  float n2 = 1.0 - abs(valueNoise(p * 2.15 + driftB) * 2.0 - 1.0);
  float n3 = valueNoise(p * 4.4 + driftA * 1.3);

  float h = pow(n1, 1.35) * 0.55 + pow(n2, 1.5) * 0.30 + n3 * 0.15;
  return smoothstep(0.18, 0.88, h);
}

void main() {
  vec2 worldUv = vWorldPos.xz * 0.0095 + vec2(uLayerIndex * 1.37, uLayerIndex * 0.91);
  float scroll = uTime * uSpeed;

  float hCenter = billowHeight(worldUv, scroll);
  float eps = 0.08;
  float hX = billowHeight(worldUv + vec2(eps, 0.0), scroll);
  float hZ = billowHeight(worldUv + vec2(0.0, eps), scroll);

  // Finite-difference cumulus surface normal
  vec3 cloudNormal = normalize(vec3(-(hX - hCenter) * 4.2, 1.0, -(hZ - hCenter) * 4.2));

  vec3 sunDir = normalize(vec3(uSunDir.x, max(0.12, uSunDir.y), uSunDir.z));
  float ndotl = clamp(dot(cloudNormal, sunDir) * 0.5 + 0.5, 0.0, 1.0);
  float valleyAo = mix(0.55, 1.0, hCenter);

  // Lit tops: warm peach-white at dawn/dusk, crisp cream-white at day; valleys: soft lavender-grey
  vec3 litTop = mix(vec3(0.98, 0.95, 0.92), uSunColor, 0.35) * 1.06;
  litTop = mix(litTop, uHorizonColor * 1.08, 0.28);

  vec3 valleyShade = mix(vec3(0.52, 0.48, 0.62), uSkyTopColor, 0.38) * uDepthTint;
  valleyShade = mix(valleyShade, uHorizonColor * 0.72, 0.25);

  vec3 cloudColor = mix(valleyShade, litTop, smoothstep(0.22, 0.85, ndotl * hCenter)) * valleyAo;

  // Forward silver scatter toward sun
  vec3 toFrag = vWorldPos - uCameraPos;
  float dist = length(toFrag.xz);
  vec2 horizView = normalize(toFrag.xz + vec2(1e-5, 0.0));
  vec2 horizSun = normalize(uSunDir.xz + vec2(1e-5, 0.0));
  float sunAlign = pow(max(0.0, dot(horizView, horizSun)), 3.0);
  cloudColor += uSunColor * (sunAlign * 0.16 * hCenter);

  // Cap fog contribution at 35% so the cloud sea never flattens into a solid purple disc
  vec3 fogMixTarget = mix(uHorizonColor, uFogColor, 0.35);
  float fogAmount = smoothstep(140.0, 620.0, dist) * 0.35;
  cloudColor = mix(cloudColor, fogMixTarget, fogAmount);

  // Smooth horizon merge at outer radius R = 560..880 m (no hard outer edge ever visible)
  float horizonMerge = smoothstep(420.0, 860.0, dist);
  cloudColor = mix(cloudColor, uHorizonColor, horizonMerge);

  // Soft cutout around floating island roots so undersides emerge through mist
  float dIslA = length(vWorldPos.xz - vec2(0.0, 0.0));
  float dIslB = length(vWorldPos.xz - vec2(58.0, -8.0));
  float dIslC = length(vWorldPos.xz - vec2(42.0, -34.0));
  float islandMask = smoothstep(12.0, 26.0, dIslA)
                   * smoothstep(7.0, 16.0, dIslB)
                   * smoothstep(6.0, 14.0, dIslC);

  float layerDensity = smoothstep(0.18 + uLayerIndex * 0.04, 0.78, hCenter);
  float radialAlpha = 1.0 - smoothstep(560.0, 880.0, dist);
  float alpha = uBaseAlpha * mix(0.38, 1.0, layerDensity) * radialAlpha * mix(0.65, 1.0, islandMask);

  gl_FragColor = vec4(cloudColor, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const PUFF_VERTEX_SHADER = /* glsl */ `
attribute vec2 aAtlasOffset;
attribute float aAlphaScale;

varying vec2 vUv;
varying vec2 vAtlasUv;
varying float vAlpha;
varying vec3 vColor;

void main() {
  vUv = uv;
  vAtlasUv = uv * 0.5 + aAtlasOffset;
  vAlpha = aAlphaScale;
  #ifdef USE_INSTANCING_COLOR
    vColor = instanceColor;
  #else
    vColor = vec3(1.0);
  #endif
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const PUFF_FRAGMENT_SHADER = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uSunColor;
uniform vec3 uShadowColor;

varying vec2 vUv;
varying vec2 vAtlasUv;
varying float vAlpha;
varying vec3 vColor;

void main() {
  vec4 tex = texture2D(uMap, vAtlasUv);
  if (tex.a <= 0.01) discard;
  // Two-tone vertical gradient: sunlit top to cool lavender-grey base
  vec3 twoTone = mix(uShadowColor, uSunColor, smoothstep(0.15, 0.85, vUv.y));
  vec3 col = vColor * mix(vec3(1.0), twoTone, 0.38);
  gl_FragColor = vec4(col, tex.a * vAlpha);
}
`;

interface PuffRecord {
  angle: number;
  angularSpeed: number;
  radius: number;
  y: number;
  heightNorm: number;
  scaleX: number;
  scaleY: number;
  layer: 0 | 1 | 2;
  bobPhase: number;
}

/**
 * Generates a 512x512 2x2 sprite atlas of 4 distinct multi-lobe cumulus cloud puffs.
 */
function createCloudPuffAtlasTexture(): THREE.CanvasTexture {
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
    ctx.clearRect(0, 0, size, size);
    const cell = 256;

    const variants: Array<Array<{ x: number; y: number; r: number; a: number }>> = [
      [
        { x: 128, y: 138, r: 94, a: 0.54 },
        { x: 84, y: 144, r: 72, a: 0.42 },
        { x: 172, y: 142, r: 74, a: 0.42 },
        { x: 112, y: 104, r: 68, a: 0.48 },
        { x: 148, y: 108, r: 64, a: 0.45 },
      ],
      [
        { x: 124, y: 142, r: 88, a: 0.50 },
        { x: 78, y: 136, r: 66, a: 0.40 },
        { x: 168, y: 148, r: 78, a: 0.44 },
        { x: 132, y: 98, r: 72, a: 0.46 },
        { x: 96, y: 112, r: 58, a: 0.38 },
      ],
      [
        { x: 130, y: 144, r: 92, a: 0.52 },
        { x: 90, y: 148, r: 70, a: 0.42 },
        { x: 174, y: 136, r: 68, a: 0.40 },
        { x: 118, y: 108, r: 64, a: 0.44 },
        { x: 154, y: 106, r: 66, a: 0.44 },
      ],
      [
        { x: 128, y: 134, r: 96, a: 0.52 },
        { x: 82, y: 142, r: 68, a: 0.38 },
        { x: 174, y: 142, r: 70, a: 0.38 },
        { x: 128, y: 96, r: 74, a: 0.48 },
      ],
    ];

    for (let v = 0; v < 4; v++) {
      const ox = (v % 2) * cell;
      const oy = Math.floor(v / 2) * cell;
      const lobes = variants[v]!;
      for (const lobe of lobes) {
        const cx = ox + lobe.x;
        const cy = oy + lobe.y;
        const grad = ctx.createRadialGradient(cx, cy, lobe.r * 0.08, cx, cy, lobe.r);
        grad.addColorStop(0, `rgba(255, 255, 255, ${lobe.a})`);
        grad.addColorStop(0.5, `rgba(255, 255, 255, ${lobe.a * 0.52})`);
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, lobe.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export class CloudSea {
  readonly group = new THREE.Group();
  readonly planes: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>[] = [];
  readonly upperPlane: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  readonly lowerPlane: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  readonly puffsMesh: THREE.InstancedMesh<
    THREE.PlaneGeometry,
    THREE.ShaderMaterial
  >;

  private readonly puffTexture: THREE.CanvasTexture;
  private readonly puffs: PuffRecord[] = [];
  private readonly puffCount: number;
  private lastColorHour = -999;

  // Scratch objects to ensure zero per-frame allocations
  private readonly dummyMatrix = new THREE.Matrix4();
  private readonly dummyPos = new THREE.Vector3();
  private readonly dummyQuat = new THREE.Quaternion();
  private readonly dummyScale = new THREE.Vector3();
  private readonly dummyColor = new THREE.Color();
  private readonly pearlTint = new THREE.Color('#FBFAF7');

  constructor(device: DeviceProfile) {
    this.group.name = 'CloudSea';

    const planeGeo = new THREE.PlaneGeometry(1800, 1800, 1, 1);
    planeGeo.rotateX(-Math.PI / 2);

    // 5 stacked translucent cumulus planes at y = -22, -24, -27, -31, -36
    const layerHeights = [-22, -24, -27, -31, -36];
    const layerAlphas = [0.58, 0.64, 0.72, 0.82, 0.95];
    const layerDepthTints = [1.0, 0.95, 0.90, 0.84, 0.78];
    const layerSpeeds = [0.0085, 0.0072, 0.0060, 0.0050, 0.0042];

    for (let i = 0; i < layerHeights.length; i++) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: CLOUD_PLANE_VERTEX_SHADER,
        fragmentShader: CLOUD_PLANE_FRAGMENT_SHADER,
        uniforms: {
          uTime: { value: 0 },
          uSpeed: { value: layerSpeeds[i]! },
          uDepthTint: { value: layerDepthTints[i]! },
          uBaseAlpha: { value: layerAlphas[i]! },
          uLayerIndex: { value: i },
          uFogColor: { value: new THREE.Color('#FFD2B3') },
          uSunColor: { value: new THREE.Color('#FFB073') },
          uHorizonColor: { value: new THREE.Color('#FF9450') },
          uSkyTopColor: { value: new THREE.Color('#6B7FD6') },
          uSunDir: { value: new THREE.Vector3(1, 0.2, -0.35).normalize() },
          uCameraPos: { value: new THREE.Vector3() },
        },
        transparent: true,
        depthWrite: false,
      });

      const mesh = new THREE.Mesh(i === 0 ? planeGeo : planeGeo.clone(), mat);
      mesh.name = `CloudSeaLayer_${i}`;
      mesh.position.y = layerHeights[i]!;
      mesh.renderOrder = -6 - i;
      this.planes.push(mesh);
      this.group.add(mesh);
    }

    this.upperPlane = this.planes[0]!;
    this.lowerPlane = this.planes[this.planes.length - 1]!;

    // Billowy 3D cloud puffs rising 2..9 m above the top cloud plane (y = -20 .. -13)
    const isPhone = device.deviceClass === 'phone';
    this.puffCount = isPhone ? Math.min(30, device.cloudPuffCount) : Math.max(70, device.cloudPuffCount);
    this.puffTexture = createCloudPuffAtlasTexture();

    const puffGeo = new THREE.PlaneGeometry(1, 1);
    const atlasOffsets = new Float32Array(this.puffCount * 2);
    const alphaScales = new Float32Array(this.puffCount);

    for (let i = 0; i < this.puffCount; i++) {
      const v = i % 4;
      atlasOffsets[i * 2] = (v % 2) * 0.5;
      atlasOffsets[i * 2 + 1] = Math.floor(v / 2) * 0.5;
      alphaScales[i] = 0.26 + (i % 5) * 0.03;
    }
    puffGeo.setAttribute('aAtlasOffset', new THREE.InstancedBufferAttribute(atlasOffsets, 2));
    puffGeo.setAttribute('aAlphaScale', new THREE.InstancedBufferAttribute(alphaScales, 1));

    const puffMat = new THREE.ShaderMaterial({
      vertexShader: PUFF_VERTEX_SHADER,
      fragmentShader: PUFF_FRAGMENT_SHADER,
      uniforms: {
        uMap: { value: this.puffTexture },
        uSunColor: { value: new THREE.Color('#FFE6CC') },
        uShadowColor: { value: new THREE.Color('#8E84A6') },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    this.puffsMesh = new THREE.InstancedMesh(puffGeo, puffMat, this.puffCount);
    this.puffsMesh.name = 'CloudSeaPuffs';
    this.puffsMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.puffsMesh.frustumCulled = false;
    this.puffsMesh.renderOrder = -5;

    const rawPuffs: PuffRecord[] = [];
    for (let i = 0; i < this.puffCount; i++) {
      const t = i / Math.max(1, this.puffCount);
      const golden = (i * 0.61803398875) % 1;
      const layer: 0 | 1 | 2 = i % 3 === 0 ? 0 : i % 3 === 1 ? 1 : 2;

      const baseRadius = layer === 0 ? 220 : layer === 1 ? 135 : 68;
      const radius = baseRadius + golden * 65;
      const hRaw = (i * 0.381966) % 1;
      // Rise 2..9 m above the cloud sea surface (-20 to -13) with a few higher wisps
      const y = -20 + hRaw * 9.0;
      const heightNorm = Math.max(0, Math.min(1, (y + 20) / 9.0));

      const scaleBase = layer === 0 ? 68 : layer === 1 ? 52 : 38;
      const scaleX = scaleBase * (0.88 + golden * 0.42);
      const scaleY = scaleX * (0.45 + ((i * 0.27) % 0.18));

      const angularSpeed =
        (layer === 0 ? 0.004 : layer === 1 ? 0.0065 : 0.009) *
        (i % 2 === 0 ? 1 : -0.8);

      rawPuffs.push({
        angle: t * Math.PI * 2,
        angularSpeed,
        radius,
        y,
        heightNorm,
        scaleX,
        scaleY,
        layer,
        bobPhase: i * 1.71,
      });
    }

    rawPuffs.sort((a, b) => a.layer - b.layer);
    for (let i = 0; i < rawPuffs.length; i++) {
      this.puffs.push(rawPuffs[i]!);
      this.dummyColor.setHex(0xffffff);
      this.puffsMesh.setColorAt(i, this.dummyColor);
    }
    if (this.puffsMesh.instanceColor) {
      this.puffsMesh.instanceColor.needsUpdate = true;
    }

    this.group.add(this.puffsMesh);
  }

  update(
    sky: TimeOfDayState,
    elapsed: number,
    camera: THREE.PerspectiveCamera,
    reducedMotion: boolean,
  ): void {
    const effectiveTime = reducedMotion ? 0 : elapsed;

    for (let i = 0; i < this.planes.length; i++) {
      const plane = this.planes[i]!;
      plane.position.x = camera.position.x;
      plane.position.z = camera.position.z;
      const u = plane.material.uniforms;
      u.uTime!.value = effectiveTime;
      (u.uCameraPos!.value as THREE.Vector3).copy(camera.position);
    }

    const hourDiff = Math.abs(sky.hour - this.lastColorHour);
    if (hourDiff > 0.01) {
      this.lastColorHour = sky.hour;

      for (let i = 0; i < this.planes.length; i++) {
        const u = this.planes[i]!.material.uniforms;
        (u.uFogColor!.value as THREE.Color).copy(sky.fog);
        (u.uSunColor!.value as THREE.Color).copy(sky.light);
        (u.uHorizonColor!.value as THREE.Color).copy(sky.horizon);
        (u.uSkyTopColor!.value as THREE.Color).copy(sky.mid);
        (u.uSunDir!.value as THREE.Vector3).copy(sky.keyLightDirection);
      }

      const puffUniforms = this.puffsMesh.material.uniforms;
      (puffUniforms.uSunColor!.value as THREE.Color).copy(sky.light).lerp(this.pearlTint, 0.35);
      (puffUniforms.uShadowColor!.value as THREE.Color).copy(sky.horizon).lerp(sky.mid, 0.45);

      for (let i = 0; i < this.puffCount; i++) {
        const puff = this.puffs[i]!;
        this.dummyColor
          .copy(sky.horizon)
          .lerp(sky.light, 0.35 + puff.heightNorm * 0.25)
          .lerp(this.pearlTint, 0.25 * (1 - sky.stars * 0.5));
        this.puffsMesh.setColorAt(i, this.dummyColor);
      }
      if (this.puffsMesh.instanceColor) {
        this.puffsMesh.instanceColor.needsUpdate = true;
      }
    }

    this.dummyQuat.copy(camera.quaternion);
    for (let i = 0; i < this.puffCount; i++) {
      const puff = this.puffs[i]!;
      const a = puff.angle + effectiveTime * puff.angularSpeed;
      const bob = reducedMotion
        ? 0
        : Math.sin(effectiveTime * 0.28 + puff.bobPhase) * 0.7;

      this.dummyPos.set(
        Math.cos(a) * puff.radius,
        puff.y + bob,
        Math.sin(a) * puff.radius,
      );
      this.dummyScale.set(puff.scaleX, puff.scaleY, 1);
      this.dummyMatrix.compose(this.dummyPos, this.dummyQuat, this.dummyScale);
      this.puffsMesh.setMatrixAt(i, this.dummyMatrix);
    }
    this.puffsMesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.puffTexture.dispose();
    disposeObject3D(this.group);
  }
}
