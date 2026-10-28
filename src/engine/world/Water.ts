import * as THREE from 'three';
import { disposeObject3D } from '@/engine/core/Disposables';
import type { TimeOfDayState } from '@/engine/world/sky';
import { STREAM_SPLINE, terrainHeight } from '@/engine/world/terrain';
import type { AssetStore } from '@/engine/core/AssetStore';
import { applyBoxUV } from '@/engine/world/MaterialLibrary';

let cachedRippleMaps: [THREE.Texture, THREE.Texture] | null = null;

function createRippleTexture(seed: number): THREE.Texture {
  if (typeof document === 'undefined') {
    const data = new Uint8Array(16 * 4).fill(128);
    return new THREE.DataTexture(data, 4, 4);
  }
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(size, size);
  const data = imgData.data;

  // 3-octave continuous tileable sine/harmonic noise derivative
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 2;
      const v = (y / size) * Math.PI * 2;

      // Central differences for tileable normal map
      const du = Math.cos(u * 3 + seed) * 3 * Math.cos(v * 3 + seed * 0.5) +
                 Math.cos(u * 6 - v * 4 + seed * 1.5) * 2.4 -
                 Math.sin(u * 9 + v * 7 - seed) * 1.8;
      const dv = -Math.sin(u * 3 + seed) * Math.sin(v * 3 + seed * 0.5) * 3 -
                 Math.cos(u * 6 - v * 4 + seed * 1.5) * 1.6 -
                 Math.sin(u * 9 + v * 7 - seed) * 1.4;

      const nx = -du * 0.25;
      const ny = -dv * 0.25;
      const nz = 1.0;
      const len = Math.hypot(nx, ny, nz);

      const idx = (y * size + x) * 4;
      data[idx] = Math.floor(((nx / len) * 0.5 + 0.5) * 255);
      data[idx + 1] = Math.floor(((ny / len) * 0.5 + 0.5) * 255);
      data[idx + 2] = Math.floor(((nz / len) * 0.5 + 0.5) * 255);
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

function getRippleTextures(): [THREE.Texture, THREE.Texture] {
  if (!cachedRippleMaps) {
    cachedRippleMaps = [createRippleTexture(1.42), createRippleTexture(3.87)];
  }
  return cachedRippleMaps;
}

export class WaterSystem extends THREE.Group {
  override readonly name = 'WaterSystem';

  public pondMesh: THREE.Mesh | null = null;
  public pondFloorMesh: THREE.Mesh | null = null;
  public pondMaterial: THREE.ShaderMaterial | null = null;
  public streamMesh: THREE.Mesh | null = null;
  public streamMaterial: THREE.ShaderMaterial | null = null;
  public lotusGroup: THREE.Group | null = null;
  public lotusPetalMat: THREE.MeshStandardMaterial | null = null;
  public waterfallsGroup: THREE.Group | null = null;
  public waterfallMaterial: THREE.ShaderMaterial | null = null;
  public heroFallMesh: THREE.Mesh | null = null;
  public rimFallMesh: THREE.Mesh | null = null;
  public sprayParticles: THREE.Points | null = null;
  public sprayGeo: THREE.BufferGeometry | null = null;

  get lotusCount(): number {
    return 14;
  }
  get lotusMesh(): THREE.Group | null {
    return this.lotusGroup;
  }
  get pondMat(): THREE.ShaderMaterial | null {
    return this.pondMaterial;
  }
  get sprayPoints(): THREE.Points | null {
    return this.sprayParticles;
  }

  private isPhone: boolean;
  private assets?: AssetStore;

  constructor(isPhone = false, assets?: AssetStore) {
    super();
    this.isPhone = isPhone;
    this.assets = assets;
    this.initWater();
  }

  private initWater(): void {
    const [ripple1, ripple2] = getRippleTextures();

    // 1. Spirit Pond Surface & Floor
    this.buildSpiritPond(ripple1, ripple2);

    // 2. Spirit Lotus pads with glowing petals
    this.buildSpiritLotus();

    // 3. Stream ribbon mesh along stream spline
    this.buildStreamRibbon(ripple1);

    // 4. Hero Waterfall (Island C), Rim Fall (Island A), and Spray
    this.buildWaterfalls();
  }

  private buildSpiritPond(ripple1: THREE.Texture, ripple2: THREE.Texture): void {
    const pondR = 6.4;
    const pondCenter = new THREE.Vector3(-9, -0.12, -4);

    // Pond floor (path texture darkened and tinted blue-green)
    const floorGeo = new THREE.CircleGeometry(pondR * 0.96, 48);
    floorGeo.rotateX(-Math.PI * 0.5);
    applyBoxUV(floorGeo, 2.5);

    const pathSlot = this.assets?.getSlot('path');
    const floorMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#0D2934'),
      map: pathSlot?.diff,
      normalMap: pathSlot?.nor,
      roughness: 0.9,
      metalness: 0.02,
    });
    this.pondFloorMesh = new THREE.Mesh(floorGeo, floorMat);
    this.pondFloorMesh.position.set(pondCenter.x, -1.05, pondCenter.z);
    this.add(this.pondFloorMesh);

    // Pond surface with baked aShoreDist
    const segs = this.isPhone ? 48 : 72;
    const pondGeo = new THREE.CircleGeometry(pondR, segs);
    pondGeo.rotateX(-Math.PI * 0.5);

    const pos = pondGeo.attributes.position!;
    const shoreDist = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const r = Math.hypot(x, z);
      shoreDist[i] = Math.max(0.0, Math.min(1.0, 1.0 - r / pondR));
    }
    pondGeo.setAttribute('aShoreDist', new THREE.BufferAttribute(shoreDist, 1));

    this.pondMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uRipple1: { value: ripple1 },
        uRipple2: { value: ripple2 },
        uKeyLightDir: { value: new THREE.Vector3(0.5, 0.8, 0.3) },
        uKeyColor: { value: new THREE.Color('#FFF5EA') },
        uSkyZenith: { value: new THREE.Color('#8FB2D6') },
        uSkyHorizon: { value: new THREE.Color('#E3D9C8') },
        uPondGlow: { value: 0.0 },
        uGlowColor: { value: new THREE.Color('#FF9B4A') },
      },
      vertexShader: /* glsl */ `
        attribute float aShoreDist;
        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying float vShoreDist;

        void main() {
          vUv = uv;
          vShoreDist = aShoreDist;
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform sampler2D uRipple1;
        uniform sampler2D uRipple2;
        uniform vec3 uKeyLightDir;
        uniform vec3 uKeyColor;
        uniform vec3 uSkyZenith;
        uniform vec3 uSkyHorizon;
        uniform float uPondGlow;
        uniform vec3 uGlowColor;

        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying float vShoreDist;

        void main() {
          // Scrolling ripple normals
          vec2 uv1 = vUv * 4.2 + vec2(uTime * 0.024, uTime * 0.018);
          vec2 uv2 = vUv * 7.5 - vec2(uTime * 0.016, uTime * 0.028);
          vec3 n1 = texture2D(uRipple1, uv1).xyz * 2.0 - 1.0;
          vec3 n2 = texture2D(uRipple2, uv2).xyz * 2.0 - 1.0;
          vec3 rippleN = normalize(vec3(n1.xy + n2.xy, 1.0));

          vec3 worldN = normalize(vec3(rippleN.x * 0.35, 1.0, rippleN.y * 0.35));
          vec3 viewDir = normalize(cameraPosition - vWorldPos);

          // Schlick Fresnel
          float NdotV = max(0.0, dot(worldN, viewDir));
          float fresnel = 0.04 + 0.96 * pow(1.0 - NdotV, 5.0);

          // Depth color: turquoise (#4FB3BF) at shore to deep teal (#1F5F7A) at center
          vec3 shoreCol = vec3(0.31, 0.70, 0.75);
          vec3 centerCol = vec3(0.12, 0.37, 0.48);
          vec3 waterBody = mix(shoreCol, centerCol, smoothstep(0.0, 0.75, vShoreDist));

          // Sky reflection
          vec3 skyRefl = mix(uSkyHorizon, uSkyZenith, smoothstep(0.1, 0.8, worldN.y));
          vec3 finalCol = mix(waterBody, skyRefl, fresnel * 0.65);

          // Specular glitter
          vec3 halfVec = normalize(viewDir + uKeyLightDir);
          float spec = pow(max(0.0, dot(worldN, halfVec)), 64.0);
          finalCol += uKeyColor * spec * 0.85;

          // Shore foam band with animated noise
          float foamNoise = sin(uTime * 2.5 + vUv.x * 35.0) * 0.5 + 0.5;
          float foamBand = smoothstep(0.14, 0.02, vShoreDist) * (0.65 + foamNoise * 0.35);
          finalCol = mix(finalCol, vec3(0.96, 0.98, 1.0), foamBand * 0.6);

          // Pulsing spirit glow from inside
          if (uPondGlow > 0.0) {
            float pulse = 0.75 + 0.25 * sin(uTime * 2.0);
            finalCol += uGlowColor * uPondGlow * pulse * (1.0 - smoothstep(0.1, 0.9, vShoreDist)) * 0.5;
          }

          float alpha = mix(0.78, 0.96, smoothstep(0.0, 0.4, vShoreDist));
          gl_FragColor = vec4(finalCol, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
    });

    this.pondMesh = new THREE.Mesh(pondGeo, this.pondMaterial);
    this.pondMesh.position.copy(pondCenter);
    this.add(this.pondMesh);
  }

  private buildSpiritLotus(): void {
    this.lotusGroup = new THREE.Group();
    this.lotusGroup.name = 'SpiritLotus';

    const padMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#3A6E40'),
      roughness: 0.65,
      metalness: 0.05,
    });

    this.lotusPetalMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#F7EDF5'),
      emissive: new THREE.Color('#FF9B4A'),
      emissiveIntensity: 0.4,
      roughness: 0.4,
    });

    // Pad geometry: circular disc with a small wedge cut
    const padGeo = new THREE.CircleGeometry(0.42, 24, 0.35, Math.PI * 1.82);
    padGeo.rotateX(-Math.PI * 0.5);

    // Flower geometry: 8 small petals
    const petalParts: THREE.BufferGeometry[] = [];
    for (let p = 0; p < 8; p++) {
      const a = (p / 8) * Math.PI * 2;
      const pGeo = new THREE.ConeGeometry(0.08, 0.22, 6);
      pGeo.rotateZ(0.4);
      pGeo.rotateY(a);
      pGeo.translate(Math.cos(a) * 0.08, 0.08, Math.sin(a) * 0.08);
      petalParts.push(pGeo);
    }
    const flowerGeo = new THREE.ConeGeometry(0.06, 0.16, 8);
    flowerGeo.translate(0, 0.08, 0);
    petalParts.push(flowerGeo);

    // 14 Lotus pads clustered organically around the Spirit Pond
    const lotusOffsets = [
      { x: -1.8, z: -1.2, s: 1.15, hasFlower: true },
      { x: -1.2, z: -1.7, s: 0.85, hasFlower: false },
      { x: -2.4, z: -0.6, s: 1.0, hasFlower: true },
      { x: 1.5, z: 1.2, s: 1.1, hasFlower: true },
      { x: 2.1, z: 0.8, s: 0.9, hasFlower: false },
      { x: 1.1, z: 2.2, s: 1.25, hasFlower: true },
      { x: -1.9, z: 1.8, s: 1.05, hasFlower: true },
      { x: -2.5, z: 1.4, s: 0.8, hasFlower: false },
      { x: 0.4, z: -2.8, s: 1.2, hasFlower: true },
      { x: 1.2, z: -2.4, s: 0.95, hasFlower: false },
      { x: -3.2, z: 0.2, s: 1.15, hasFlower: true },
      { x: 2.8, z: -0.8, s: 1.0, hasFlower: true },
      { x: 0.8, z: 3.1, s: 0.9, hasFlower: false },
      { x: -0.6, z: 2.7, s: 1.1, hasFlower: true },
    ];

    for (let i = 0; i < lotusOffsets.length; i++) {
      const lo = lotusOffsets[i]!;
      const pad = new THREE.Mesh(padGeo, padMat);
      pad.position.set(-9 + lo.x, -0.11, -4 + lo.z);
      pad.rotation.y = i * 1.42;
      pad.scale.set(lo.s, lo.s, lo.s);
      this.lotusGroup.add(pad);

      if (lo.hasFlower) {
        const flower = new THREE.Mesh(flowerGeo, this.lotusPetalMat);
        flower.position.set(-9 + lo.x, -0.11, -4 + lo.z);
        flower.scale.set(lo.s * 0.9, lo.s * 0.9, lo.s * 0.9);
        this.lotusGroup.add(flower);
      }
    }

    this.add(this.lotusGroup);
  }

  private buildStreamRibbon(rippleTex: THREE.Texture): void {
    const pts = STREAM_SPLINE;
    const segments = 48;
    const width = 1.8;

    const positions = new Float32Array((segments + 1) * 2 * 3);
    const uvs = new Float32Array((segments + 1) * 2 * 2);
    const indices: number[] = [];

    // Sample along spline
    const splinePts: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const scaled = t * (pts.length - 1);
      const idx0 = Math.min(pts.length - 2, Math.floor(scaled));
      const frac = scaled - idx0;
      const p0 = pts[idx0]!;
      const p1 = pts[idx0 + 1]!;
      const x = p0.x + (p1.x - p0.x) * frac;
      const z = p0.z + (p1.z - p0.z) * frac;
      const y = terrainHeight(x, z) + 0.06;
      splinePts.push(new THREE.Vector3(x, y, z));
    }

    for (let i = 0; i <= segments; i++) {
      const cur = splinePts[i]!;
      const next = splinePts[Math.min(segments, i + 1)]!;
      const prev = splinePts[Math.max(0, i - 1)]!;
      const dir = new THREE.Vector3().subVectors(next, prev).normalize();
      const norm = new THREE.Vector3(-dir.z, 0, dir.x).normalize();

      const halfW = width * 0.5;
      const left = cur.clone().addScaledVector(norm, -halfW);
      const right = cur.clone().addScaledVector(norm, halfW);

      const vBase = i * 2;
      positions[vBase * 3] = left.x;
      positions[vBase * 3 + 1] = left.y;
      positions[vBase * 3 + 2] = left.z;

      positions[(vBase + 1) * 3] = right.x;
      positions[(vBase + 1) * 3 + 1] = right.y;
      positions[(vBase + 1) * 3 + 2] = right.z;

      const vFrac = i / segments;
      uvs[vBase * 2] = 0;
      uvs[vBase * 2 + 1] = vFrac * 12.0;

      uvs[(vBase + 1) * 2] = 1;
      uvs[(vBase + 1) * 2 + 1] = vFrac * 12.0;

      if (i < segments) {
        indices.push(vBase, vBase + 1, vBase + 2);
        indices.push(vBase + 1, vBase + 3, vBase + 2);
      }
    }

    const streamGeo = new THREE.BufferGeometry();
    streamGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    streamGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    streamGeo.setIndex(indices);
    streamGeo.computeVertexNormals();

    this.streamMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uRipple: { value: rippleTex },
        uKeyLightDir: { value: new THREE.Vector3(0.5, 0.8, 0.3) },
        uKeyColor: { value: new THREE.Color('#FFF5EA') },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying vec3 vNormal;

        void main() {
          vUv = uv;
          vNormal = normalMatrix * normal;
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform sampler2D uRipple;
        uniform vec3 uKeyLightDir;
        uniform vec3 uKeyColor;

        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying vec3 vNormal;

        void main() {
          // Flow along stream length
          vec2 flowUv = vec2(vUv.x, vUv.y - uTime * 0.75);
          vec3 n = texture2D(uRipple, flowUv).xyz * 2.0 - 1.0;

          // Shallow stream colors: turquoise and white foam ripples
          vec3 streamCol = mix(vec3(0.28, 0.65, 0.72), vec3(0.38, 0.78, 0.85), n.y * 0.5 + 0.5);

          // Foam near banks
          float bankDist = abs(vUv.x - 0.5) * 2.0;
          float bankFoam = smoothstep(0.65, 1.0, bankDist) * 0.45;
          streamCol = mix(streamCol, vec3(0.95, 0.98, 1.0), bankFoam);

          gl_FragColor = vec4(streamCol, 0.88);
        }
      `,
      transparent: true,
      depthWrite: false,
    });

    this.streamMesh = new THREE.Mesh(streamGeo, this.streamMaterial);
    this.add(this.streamMesh);
  }

  private buildWaterfalls(): void {
    this.waterfallsGroup = new THREE.Group();
    this.waterfallsGroup.name = 'Waterfalls';

    this.waterfallMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uKeyColor: { value: new THREE.Color('#FFF5EA') },
      },
      vertexShader: /* glsl */ `
        uniform float uTime;
        varying vec2 vUv;
        varying vec3 vWorldPos;

        void main() {
          vUv = uv;
          vec3 pos = position;
          // Turbulent displacement
          float wave = sin(pos.y * 2.2 - uTime * 6.0) * 0.12 * sin(pos.x * 3.0);
          pos.z += wave;
          vec4 worldPos = modelMatrix * vec4(pos, 1.0);
          vWorldPos = worldPos.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uKeyColor;

        varying vec2 vUv;
        varying vec3 vWorldPos;

        void main() {
          // Scrolling vertical streaks
          float streak1 = sin(vUv.x * 24.0 + sin(vUv.y * 12.0 - uTime * 14.0) * 2.5);
          float streak2 = cos(vUv.x * 38.0 - uTime * 18.0);
          float foam = smoothstep(0.1, 0.7, streak1 * 0.6 + streak2 * 0.4);

          // Top and edge foam gradients
          float edgeAlpha = smoothstep(0.0, 0.15, vUv.x) * (1.0 - smoothstep(0.85, 1.0, vUv.x));
          float fallAlpha = smoothstep(0.0, 0.08, vUv.y);

          vec3 baseWater = vec3(0.42, 0.74, 0.82);
          vec3 foamColor = vec3(0.96, 0.98, 1.0);
          vec3 finalColor = mix(baseWater, foamColor, foam * 0.85);

          // Dissolve toward base
          float bottomFade = smoothstep(1.0, 0.82, vUv.y);
          float alpha = (0.75 + foam * 0.25) * edgeAlpha * fallAlpha * bottomFade;

          gl_FragColor = vec4(finalColor, alpha);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    // 1. Hero Waterfall on Island C (near 33, -64, dropping from y=1 to y=-24)
    const heroFallGeo = new THREE.PlaneGeometry(7.5, 25.0, 16, 32);
    heroFallGeo.translate(0, -12.5, 0);
    const heroFall = new THREE.Mesh(heroFallGeo, this.waterfallMaterial);
    heroFall.position.set(33.0, 1.0, -64.2);
    heroFall.rotation.y = 0.45;
    this.heroFallMesh = heroFall;
    this.waterfallsGroup.add(heroFall);

    // 2. Slim Waterfall on Island A rim (at -24.5, -8.8, dropping from y=0 to y=-22)
    const rimFallGeo = new THREE.PlaneGeometry(2.4, 22.0, 8, 24);
    rimFallGeo.translate(0, -11.0, 0);
    const rimFall = new THREE.Mesh(rimFallGeo, this.waterfallMaterial);
    rimFall.position.set(-24.5, 0.0, -8.8);
    rimFall.rotation.y = 1.82;
    this.rimFallMesh = rimFall;
    this.waterfallsGroup.add(rimFall);

    this.add(this.waterfallsGroup);

    // 3. Spray particles at waterfall bases
    const sprayCount = this.isPhone ? 120 : 400;
    this.sprayGeo = new THREE.BufferGeometry();
    const sprayPos = new Float32Array(sprayCount * 3);
    const sprayVel = new Float32Array(sprayCount * 3);

    for (let i = 0; i < sprayCount; i++) {
      // 70% at Hero Fall, 30% at Island A Fall
      const isHero = i < sprayCount * 0.7;
      const baseX = isHero ? 33.0 : -24.5;
      const baseZ = isHero ? -64.2 : -8.8;
      const rad = isHero ? 4.5 : 2.0;

      const rx = (Math.random() - 0.5) * rad;
      const rz = (Math.random() - 0.5) * rad;
      const ry = -23.5 + Math.random() * 3.5;

      sprayPos[i * 3] = baseX + rx;
      sprayPos[i * 3 + 1] = ry;
      sprayPos[i * 3 + 2] = baseZ + rz;

      sprayVel[i * 3] = (Math.random() - 0.5) * 1.5;
      sprayVel[i * 3 + 1] = 1.2 + Math.random() * 2.4;
      sprayVel[i * 3 + 2] = (Math.random() - 0.5) * 1.5;
    }

    this.sprayGeo.setAttribute('position', new THREE.BufferAttribute(sprayPos, 3));
    this.sprayGeo.setAttribute('velocity', new THREE.BufferAttribute(sprayVel, 3));

    const sprayMat = new THREE.PointsMaterial({
      color: new THREE.Color('#EBF3F8'),
      size: this.isPhone ? 0.35 : 0.55,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.sprayParticles = new THREE.Points(this.sprayGeo, sprayMat);
    this.add(this.sprayParticles);
  }

  update(dt: number, elapsed: number, skyState?: TimeOfDayState | number): void {
    if (this.pondMaterial) {
      this.pondMaterial.uniforms.uTime!.value = elapsed;
      if (skyState && typeof skyState === 'object' && 'keyLightDirection' in skyState) {
        this.pondMaterial.uniforms.uKeyLightDir!.value.copy(skyState.keyLightDirection);
        this.pondMaterial.uniforms.uKeyColor!.value.copy(skyState.keyColor);
        this.pondMaterial.uniforms.uSkyZenith!.value.copy(skyState.hemiSky);
        this.pondMaterial.uniforms.uSkyHorizon!.value.copy(skyState.fog);

        // Dusk glow pulse (strongest between hours 17.5 and 20.0)
        const h = skyState.hour;
        const isDusk = h >= 17.0 && h <= 20.5;
        this.pondMaterial.uniforms.uPondGlow!.value = isDusk
          ? Math.sin(((h - 17.0) / 3.5) * Math.PI) * 0.85
          : 0.0;
        this.pondMaterial.uniforms.uGlowColor!.value.set(h > 18.5 ? '#B9A6FF' : '#FF9B4A');
      } else if (typeof skyState === 'number') {
        const h = skyState;
        const isDusk = h >= 17.0 && h <= 20.5;
        this.pondMaterial.uniforms.uPondGlow!.value = isDusk
          ? Math.sin(((h - 17.0) / 3.5) * Math.PI) * 0.85
          : 0.0;
        this.pondMaterial.uniforms.uGlowColor!.value.set(h > 18.5 ? '#B9A6FF' : '#FF9B4A');
      }
    }

    if (this.streamMaterial) {
      this.streamMaterial.uniforms.uTime!.value = elapsed;
      if (skyState && typeof skyState === 'object' && 'keyColor' in skyState) {
        this.streamMaterial.uniforms.uKeyColor!.value.copy(skyState.keyColor);
      }
    }

    if (this.waterfallMaterial) {
      this.waterfallMaterial.uniforms.uTime!.value = elapsed;
    }

    // Lotus petal emissive glow at dusk
    if (this.lotusPetalMat && skyState) {
      const h = typeof skyState === 'number' ? skyState : skyState.hour;
      const isDuskOrNight = h >= 17.5 || h < 5.5;
      const glowStrength = isDuskOrNight ? 0.95 : 0.25;
      this.lotusPetalMat.emissiveIntensity = glowStrength;
      this.lotusPetalMat.emissive.set(h >= 18.5 ? '#B9A6FF' : '#FFA040');
    }

    // Spray particles simulation
    if (this.sprayParticles && this.sprayGeo) {
      const pos = this.sprayGeo.attributes.position!;
      const vel = this.sprayGeo.attributes.velocity!;
      const count = pos.count;

      for (let i = 0; i < count; i++) {
        let y = pos.getY(i) + vel.getY(i) * dt;
        let x = pos.getX(i) + vel.getX(i) * dt;
        let z = pos.getZ(i) + vel.getZ(i) * dt;

        // Reset if too high
        if (y > -19.5) {
          const isHero = i < count * 0.7;
          x = (isHero ? 33.0 : -24.5) + (Math.random() - 0.5) * (isHero ? 4.5 : 2.0);
          z = (isHero ? -64.2 : -8.8) + (Math.random() - 0.5) * (isHero ? 4.5 : 2.0);
          y = -23.5 + Math.random() * 0.8;
        }

        pos.setXYZ(i, x, y, z);
      }
      pos.needsUpdate = true;
    }
  }

  override dispose(): void {
    if (this.pondMesh) {
      this.pondMesh.geometry.dispose();
      this.pondMesh = null;
    }
    if (this.pondFloorMesh) {
      this.pondFloorMesh.geometry.dispose();
      this.pondFloorMesh = null;
    }
    if (this.pondMaterial) {
      this.pondMaterial.dispose();
      this.pondMaterial = null;
    }
    if (this.streamMesh) {
      this.streamMesh.geometry.dispose();
      this.streamMesh = null;
    }
    if (this.streamMaterial) {
      this.streamMaterial.dispose();
      this.streamMaterial = null;
    }
    if (this.waterfallsGroup) {
      disposeObject3D(this.waterfallsGroup);
      this.waterfallsGroup = null;
    }
    if (this.waterfallMaterial) {
      this.waterfallMaterial.dispose();
      this.waterfallMaterial = null;
    }
    if (this.sprayParticles && this.sprayGeo) {
      this.sprayGeo.dispose();
      (this.sprayParticles.material as THREE.Material).dispose();
      this.sprayParticles = null;
    }
    if (this.lotusPetalMat) {
      this.lotusPetalMat.dispose();
      this.lotusPetalMat = null;
    }
    if (this.lotusGroup) {
      disposeObject3D(this.lotusGroup);
      this.lotusGroup = null;
    }
    disposeObject3D(this);
  }
}
