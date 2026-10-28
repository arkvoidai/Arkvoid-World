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
uniform vec3 uFogColor;
uniform vec3 uSunColor;
uniform vec3 uHorizonColor;
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

// 3-octave value-noise FBM scrolling in two directions
float fbm3(vec2 p, float t) {
  vec2 driftA = vec2(t * 0.9, t * 0.45);
  vec2 driftB = vec2(-t * 0.55, t * 0.8);

  float v = 0.0;
  v += 0.55 * valueNoise(p * 1.0 + driftA);
  v += 0.30 * valueNoise(p * 2.15 + driftB);
  v += 0.15 * valueNoise(p * 4.35 + driftA * 1.35);
  return v;
}

void main() {
  vec2 worldUv = vWorldPos.xz * 0.011;
  float scroll = uTime * uSpeed;

  float n1 = fbm3(worldUv, scroll);
  float n2 = fbm3(worldUv * 1.55 + vec2(4.2, -3.1), scroll * 0.78);
  float rawCloud = mix(n1, n2, 0.42);

  // Soft rounded billows shaped with a pow curve
  float billow = pow(smoothstep(0.22, 0.84, rawCloud), 1.3);
  float crest = pow(smoothstep(0.46, 0.90, rawCloud), 1.75);

  vec3 toFrag = vWorldPos - uCameraPos;
  float dist = length(toFrag.xz);
  vec2 horizView = normalize(toFrag.xz + vec2(1e-5, 0.0));
  vec2 horizSun = normalize(uSunDir.xz + vec2(1e-5, 0.0));
  float sunFacing = max(dot(horizView, horizSun), 0.0);
  float forwardScatter = pow(sunFacing, 2.2) * 0.35 + 0.10;

  // Lit cloud color from uSunColor and uHorizonColor
  vec3 litCloud = mix(uHorizonColor, uSunColor, 0.58) * (1.04 + forwardScatter);
  vec3 shadowCloud = mix(uFogColor, uHorizonColor, 0.28) * uDepthTint;

  vec3 cloudColor = mix(shadowCloud, litCloud, billow);
  cloudColor = mix(cloudColor, litCloud * 1.14, crest * 0.48);

  // Fade cleanly into horizon mist at radial distance so no square plane edge is ever visible
  vec3 horizonMist = mix(uFogColor, uHorizonColor, 0.65);
  float distColorFade = smoothstep(95.0, 440.0, dist);
  cloudColor = mix(cloudColor, horizonMist, distColorFade);

  float radialAlpha = 1.0 - smoothstep(260.0, 580.0, dist);
  float alpha = uBaseAlpha * mix(0.88, 1.0, billow) * radialAlpha;

  gl_FragColor = vec4(cloudColor, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
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

function createSoftCloudTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.clearRect(0, 0, size, size);

    const lobes: Array<{ x: number; y: number; r: number; a: number }> = [
      { x: 128, y: 136, r: 96, a: 0.56 },
      { x: 86, y: 142, r: 72, a: 0.42 },
      { x: 170, y: 140, r: 74, a: 0.42 },
      { x: 112, y: 106, r: 68, a: 0.46 },
      { x: 148, y: 110, r: 64, a: 0.44 },
      { x: 128, y: 154, r: 82, a: 0.34 },
    ];

    for (const lobe of lobes) {
      const grad = ctx.createRadialGradient(
        lobe.x,
        lobe.y,
        lobe.r * 0.08,
        lobe.x,
        lobe.y,
        lobe.r,
      );
      grad.addColorStop(0, `rgba(255, 255, 255, ${lobe.a})`);
      grad.addColorStop(0.5, `rgba(255, 255, 255, ${lobe.a * 0.52})`);
      grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(lobe.x, lobe.y, lobe.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export class CloudSea {
  readonly group = new THREE.Group();
  readonly upperPlane: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  readonly lowerPlane: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  readonly puffsMesh: THREE.InstancedMesh<
    THREE.PlaneGeometry,
    THREE.MeshBasicMaterial
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

    const planeGeo = new THREE.PlaneGeometry(1400, 1400, 1, 1);
    planeGeo.rotateX(-Math.PI / 2);

    const upperMaterial = new THREE.ShaderMaterial({
      vertexShader: CLOUD_PLANE_VERTEX_SHADER,
      fragmentShader: CLOUD_PLANE_FRAGMENT_SHADER,
      uniforms: {
        uTime: { value: 0 },
        uSpeed: { value: 0.008 },
        uDepthTint: { value: 0.94 },
        uBaseAlpha: { value: 0.94 },
        uFogColor: { value: new THREE.Color('#FFD2B3') },
        uSunColor: { value: new THREE.Color('#FFB073') },
        uHorizonColor: { value: new THREE.Color('#FF9450') },
        uSunDir: { value: new THREE.Vector3(1, 0.2, -0.35).normalize() },
        uCameraPos: { value: new THREE.Vector3() },
      },
      transparent: true,
      depthWrite: false,
    });

    const lowerMaterial = new THREE.ShaderMaterial({
      vertexShader: CLOUD_PLANE_VERTEX_SHADER,
      fragmentShader: CLOUD_PLANE_FRAGMENT_SHADER,
      uniforms: {
        uTime: { value: 0 },
        uSpeed: { value: 0.0046 },
        uDepthTint: { value: 0.78 },
        uBaseAlpha: { value: 0.98 },
        uFogColor: { value: new THREE.Color('#FFD2B3') },
        uSunColor: { value: new THREE.Color('#FFB073') },
        uHorizonColor: { value: new THREE.Color('#FF9450') },
        uSunDir: { value: new THREE.Vector3(1, 0.2, -0.35).normalize() },
        uCameraPos: { value: new THREE.Vector3() },
      },
      transparent: true,
      depthWrite: false,
    });

    this.upperPlane = new THREE.Mesh(planeGeo, upperMaterial);
    this.upperPlane.position.y = -22;
    this.upperPlane.renderOrder = -7;

    this.lowerPlane = new THREE.Mesh(planeGeo.clone(), lowerMaterial);
    this.lowerPlane.position.y = -34;
    this.lowerPlane.renderOrder = -8;

    this.group.add(this.lowerPlane, this.upperPlane);

    // Procedural camera-facing cloud puffs in a donut around the world (y = -12..+46)
    this.puffCount = device.cloudPuffCount;
    this.puffTexture = createSoftCloudTexture();

    const puffGeo = new THREE.PlaneGeometry(1, 1);
    const puffMat = new THREE.MeshBasicMaterial({
      map: this.puffTexture,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      blending: THREE.NormalBlending,
      fog: false,
    });

    this.puffsMesh = new THREE.InstancedMesh(puffGeo, puffMat, this.puffCount);
    this.puffsMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.puffsMesh.frustumCulled = false;
    this.puffsMesh.renderOrder = -5;

    // Deterministic Halton-like distribution sorted in 3 layers (outer -> middle -> inner)
    const rawPuffs: PuffRecord[] = [];
    for (let i = 0; i < this.puffCount; i++) {
      const t = i / Math.max(1, this.puffCount);
      const golden = (i * 0.61803398875) % 1;
      const layer: 0 | 1 | 2 = i % 3 === 0 ? 0 : i % 3 === 1 ? 1 : 2;

      const baseRadius = layer === 0 ? 255 : layer === 1 ? 180 : 120;
      const radius = baseRadius + golden * 55;
      // Weight more puffs near the cloud-sea horizon (-12..+18) while spanning up to +46
      const hRaw = (i * 0.381966) % 1;
      const y = -12 + Math.pow(hRaw, 1.35) * 58; // -12 to +46
      const heightNorm = Math.max(0, Math.min(1, (y + 12) / 58));

      const scaleBase = layer === 0 ? 78 : layer === 1 ? 58 : 46;
      const scaleX = scaleBase * (0.88 + golden * 0.45);
      const scaleY = scaleX * (0.48 + ((i * 0.27) % 0.2));

      const angularSpeed =
        (layer === 0 ? 0.0045 : layer === 1 ? 0.007 : 0.0095) *
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

    this.upperPlane.position.x = camera.position.x;
    this.upperPlane.position.z = camera.position.z;
    this.lowerPlane.position.x = camera.position.x;
    this.lowerPlane.position.z = camera.position.z;

    const uUpper = this.upperPlane.material.uniforms;
    const uLower = this.lowerPlane.material.uniforms;

    uUpper.uTime!.value = effectiveTime;
    uLower.uTime!.value = effectiveTime;
    (uUpper.uCameraPos!.value as THREE.Vector3).copy(camera.position);
    (uLower.uCameraPos!.value as THREE.Vector3).copy(camera.position);

    const hourDiff = Math.abs(sky.hour - this.lastColorHour);
    if (hourDiff > 0.01) {
      this.lastColorHour = sky.hour;

      (uUpper.uFogColor!.value as THREE.Color).copy(sky.fog);
      (uUpper.uSunColor!.value as THREE.Color).copy(sky.light);
      (uUpper.uHorizonColor!.value as THREE.Color).copy(sky.horizon);
      (uUpper.uSunDir!.value as THREE.Vector3).copy(sky.keyLightDirection);

      (uLower.uFogColor!.value as THREE.Color).copy(sky.fog);
      (uLower.uSunColor!.value as THREE.Color).copy(sky.light);
      (uLower.uHorizonColor!.value as THREE.Color).copy(sky.horizon);
      (uLower.uSunDir!.value as THREE.Vector3).copy(sky.keyLightDirection);

      // Tint puffs by height (horizon -> mid), lifted by key light and pearl highlight
      for (let i = 0; i < this.puffCount; i++) {
        const puff = this.puffs[i]!;
        this.dummyColor
          .copy(sky.horizon)
          .lerp(sky.mid, puff.heightNorm * 0.72)
          .lerp(sky.light, 0.32)
          .lerp(this.pearlTint, 0.18 * (1 - sky.stars * 0.6));
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
        : Math.sin(effectiveTime * 0.28 + puff.bobPhase) * 0.9;

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
