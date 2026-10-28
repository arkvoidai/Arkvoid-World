import * as THREE from 'three';
import { disposeObject3D } from '@/engine/core/Disposables';
import type { TimeOfDayState } from '@/engine/world/sky';
import { terrainHeight } from '@/engine/world/terrain';

let cachedGlowTexture: THREE.Texture | null = null;

function getSoftGlowTexture(): THREE.Texture {
  if (cachedGlowTexture) return cachedGlowTexture;

  if (typeof document === 'undefined') {
    const data = new Uint8Array(16 * 4).fill(255);
    cachedGlowTexture = new THREE.DataTexture(data, 4, 4);
    return cachedGlowTexture;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
  grad.addColorStop(0.25, 'rgba(255, 255, 255, 0.7)');
  grad.addColorStop(0.6, 'rgba(255, 255, 255, 0.2)');
  grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  cachedGlowTexture = new THREE.CanvasTexture(canvas);
  return cachedGlowTexture;
}

export class LifeSystem extends THREE.Group {
  override readonly name = 'LifeSystem';

  public butterfliesMesh: THREE.InstancedMesh | null = null;
  public butterfliesMat: THREE.ShaderMaterial | null = null;

  public firefliesPoints: THREE.Points | null = null;
  public firefliesGeo: THREE.BufferGeometry | null = null;
  public firefliesMat: THREE.PointsMaterial | null = null;

  public cranesMesh: THREE.InstancedMesh | null = null;
  public cranesMat: THREE.ShaderMaterial | null = null;

  public swiftsMesh: THREE.InstancedMesh | null = null;
  public swiftsMat: THREE.ShaderMaterial | null = null;

  public koiMesh: THREE.InstancedMesh | null = null;
  public koiMat: THREE.ShaderMaterial | null = null;

  public wispsMesh: THREE.InstancedMesh | null = null;
  public wispsMat: THREE.ShaderMaterial | null = null;

  public butterflyCount: number;
  public fireflyCount: number;
  public craneCount = 12;
  public swiftCount = 8;
  public koiCount = 6;
  public wispCount = 24;

  get butterflies(): THREE.InstancedMesh | null { return this.butterfliesMesh; }
  get fireflies(): THREE.Points | null { return this.firefliesPoints; }
  get firefliesMesh(): THREE.Points | null { return this.firefliesPoints; }
  get cranes(): THREE.InstancedMesh | null { return this.cranesMesh; }
  get swifts(): THREE.InstancedMesh | null { return this.swiftsMesh; }
  get koi(): THREE.InstancedMesh | null { return this.koiMesh; }
  get wisps(): THREE.InstancedMesh | null { return this.wispsMesh; }

  private craneProgress = 0.0;
  private butterflyData: Array<{
    cx: number;
    cz: number;
    baseY: number;
    r: number;
    speed: number;
    phase: number;
  }> = [];

  private koiData: Array<{
    angle: number;
    rad: number;
    speed: number;
    depth: number;
  }> = [];

  private wispData: Array<{
    cx: number;
    cz: number;
    baseY: number;
    r: number;
    speed: number;
    phase: number;
    color: THREE.Color;
  }> = [];

  constructor(isPhone = false) {
    super();
    this.butterflyCount = isPhone ? 12 : 36;
    this.fireflyCount = isPhone ? 90 : 300;

    this.buildButterflies();
    this.buildFireflies();
    this.buildBirds();
    this.buildKoi();
    this.buildWisps();
  }

  private buildButterflies(): void {
    // Two wings joined along spine
    const wGeo = new THREE.BufferGeometry();
    const pos = new Float32Array([
      // Left wing
       0.0, 0.0, -0.06,
      -0.12, 0.06, -0.08,
      -0.14, 0.04, 0.06,
       0.0, 0.0, 0.04,
      // Right wing
       0.0, 0.0, -0.06,
       0.0, 0.0, 0.04,
       0.14, 0.04, 0.06,
       0.12, 0.06, -0.08,
    ]);
    const indices = [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6];
    wGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    wGeo.setIndex(indices);
    wGeo.computeVertexNormals();

    this.butterfliesMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uDayAlpha: { value: 1.0 },
      },
      vertexShader: /* glsl */ `
        uniform float uTime;
        attribute float aPhase;
        varying vec3 vColor;

        void main() {
          vec3 p = position;
          // Wing flapping
          float flap = sin(uTime * 18.0 + aPhase);
          if (p.x < -0.001) {
            p.y += abs(flap) * 0.12;
            p.x += (1.0 - abs(flap)) * -0.04;
          } else if (p.x > 0.001) {
            p.y += abs(flap) * 0.12;
            p.x += (1.0 - abs(flap)) * 0.04;
          }

          #ifdef USE_INSTANCING
            vec4 worldPos = instanceMatrix * vec4(p, 1.0);
            #ifdef USE_COLOR
              vColor = instanceColor;
            #else
              vColor = vec3(1.0);
            #endif
          #else
            vec4 worldPos = modelMatrix * vec4(p, 1.0);
            vColor = vec3(1.0);
          #endif

          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uDayAlpha;
        varying vec3 vColor;

        void main() {
          if (uDayAlpha <= 0.01) discard;
          gl_FragColor = vec4(vColor, uDayAlpha * 0.95);
        }
      `,
      side: THREE.DoubleSide,
      transparent: true,
    });

    const aPhase = new Float32Array(this.butterflyCount);
    for (let i = 0; i < this.butterflyCount; i++) {
      aPhase[i] = i * 1.84;
    }
    wGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(aPhase, 1));

    this.butterfliesMesh = new THREE.InstancedMesh(
      wGeo,
      this.butterfliesMat,
      this.butterflyCount,
    );
    this.butterfliesMesh.name = 'Butterflies';

    const colors = [
      new THREE.Color('#FF7A1A'), // orange
      new THREE.Color('#FFFFFF'), // white
      new THREE.Color('#B9A6FF'), // purple
    ];

    for (let i = 0; i < this.butterflyCount; i++) {
      const col = colors[i % colors.length]!;
      this.butterfliesMesh.setColorAt(i, col);

      const a = (i / this.butterflyCount) * Math.PI * 2;
      const r = 5.0 + ((i * 7) % 14);
      const cx = Math.cos(a) * r;
      const cz = Math.sin(a) * r;
      const baseY = terrainHeight(cx, cz) + 0.6;

      this.butterflyData.push({
        cx,
        cz,
        baseY,
        r: 1.2 + (i % 3) * 0.6,
        speed: 1.2 + (i % 4) * 0.3,
        phase: i * 0.75,
      });
    }

    if (this.butterfliesMesh.instanceColor) {
      this.butterfliesMesh.instanceColor.needsUpdate = true;
    }
    this.add(this.butterfliesMesh);
  }

  private buildFireflies(): void {
    this.firefliesGeo = new THREE.BufferGeometry();
    const count = this.fireflyCount;

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const phases = new Float32Array(count);

    const fColors = [
      new THREE.Color('#FFD147'), // warm gold
      new THREE.Color('#FFA040'), // soft orange
    ];

    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const r = 3.5 + Math.random() * 20.0;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = terrainHeight(x, z) + 0.4 + Math.random() * 1.8;

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      const col = fColors[i % fColors.length]!;
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;

      phases[i] = Math.random() * Math.PI * 2;
    }

    this.firefliesGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.firefliesGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.firefliesGeo.setAttribute('phase', new THREE.BufferAttribute(phases, 1));

    this.firefliesMat = new THREE.PointsMaterial({
      size: 0.38,
      map: getSoftGlowTexture(),
      vertexColors: true,
      transparent: true,
      opacity: 0.0, // Driven by dusk/night
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.firefliesPoints = new THREE.Points(this.firefliesGeo, this.firefliesMat);
    this.firefliesPoints.name = 'Fireflies';
    this.add(this.firefliesPoints);
  }

  private buildBirds(): void {
    // 1. White Cranes (long-necked silhouette with flapping wings)
    const craneGeo = new THREE.BufferGeometry();
    const cPos = new Float32Array([
      // Body & Neck
       0.0, 0.0,  0.8,
       0.0, 0.1, -0.6,
       0.0, 0.2, -1.2,
      // Left Wing
       0.0, 0.0, 0.1,
      -1.4, 0.0, 0.0,
      -2.2, 0.1, -0.2,
      // Right Wing
       0.0, 0.0, 0.1,
       1.4, 0.0, 0.0,
       2.2, 0.1, -0.2,
    ]);
    const cIndices = [0, 1, 2, 0, 3, 4, 3, 4, 5, 0, 6, 7, 6, 7, 8];
    craneGeo.setAttribute('position', new THREE.BufferAttribute(cPos, 3));
    craneGeo.setIndex(cIndices);
    craneGeo.computeVertexNormals();

    this.cranesMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        uniform float uTime;
        attribute float aFlapOffset;

        void main() {
          vec3 p = position;
          float flap = sin(uTime * 3.5 + aFlapOffset);
          if (abs(p.x) > 0.1) {
            p.y += flap * 0.45 * (abs(p.x) / 2.2);
          }
          vec4 worldPos = instanceMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */ `
        void main() {
          gl_FragColor = vec4(0.96, 0.96, 0.98, 0.92);
        }
      `,
      side: THREE.DoubleSide,
    });

    const cFlap = new Float32Array(this.craneCount);
    for (let i = 0; i < this.craneCount; i++) cFlap[i] = i * 0.45;
    craneGeo.setAttribute('aFlapOffset', new THREE.InstancedBufferAttribute(cFlap, 1));

    this.cranesMesh = new THREE.InstancedMesh(craneGeo, this.cranesMat, this.craneCount);
    this.cranesMesh.name = 'CranesFlock';
    this.add(this.cranesMesh);

    // 2. Swifts (fast small silhouettes banking high)
    const swiftGeo = new THREE.ConeGeometry(0.18, 0.65, 4);
    swiftGeo.rotateX(Math.PI * 0.5);

    this.swiftsMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        void main() {
          vec4 worldPos = instanceMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */ `
        void main() {
          gl_FragColor = vec4(0.24, 0.22, 0.28, 0.88);
        }
      `,
    });

    this.swiftsMesh = new THREE.InstancedMesh(swiftGeo, this.swiftsMat, this.swiftCount);
    this.swiftsMesh.name = 'SwiftsFlock';
    this.add(this.swiftsMesh);
  }

  private buildKoi(): void {
    // Slender tapered fish geometry
    const kGeo = new THREE.ConeGeometry(0.14, 0.72, 8, 3);
    kGeo.rotateX(Math.PI * 0.5);

    this.koiMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        uniform float uTime;
        attribute float aWagPhase;
        varying vec3 vColor;

        void main() {
          #ifdef USE_INSTANCING_COLOR
            vColor = instanceColor;
          #else
            #ifdef USE_COLOR
              vColor = instanceColor;
            #else
              vColor = vec3(1.0, 0.45, 0.15);
            #endif
          #endif

          vec3 p = position;
          // Tail wiggle
          float wag = sin(uTime * 4.5 + aWagPhase);
          if (p.z < 0.0) {
            p.x += wag * 0.08 * (-p.z / 0.36);
          }
          vec4 worldPos = instanceMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        void main() {
          gl_FragColor = vec4(vColor, 0.88);
        }
      `,
      transparent: true,
    });

    const aWag = new Float32Array(this.koiCount);
    for (let i = 0; i < this.koiCount; i++) aWag[i] = i * 1.2;
    kGeo.setAttribute('aWagPhase', new THREE.InstancedBufferAttribute(aWag, 1));

    this.koiMesh = new THREE.InstancedMesh(kGeo, this.koiMat, this.koiCount);
    this.koiMesh.name = 'SpiritPondKoi';

    const koiColors = [
      new THREE.Color('#FF5511'),
      new THREE.Color('#F2E6D8'),
      new THREE.Color('#FF8833'),
      new THREE.Color('#E63311'),
      new THREE.Color('#F5C232'),
      new THREE.Color('#FF7722'),
    ];

    for (let i = 0; i < this.koiCount; i++) {
      this.koiMesh.setColorAt(i, koiColors[i]!);
      this.koiData.push({
        angle: (i / this.koiCount) * Math.PI * 2,
        rad: 1.5 + (i % 3) * 0.9,
        speed: 0.35 + (i % 3) * 0.12,
        depth: -0.38 - (i % 2) * 0.18,
      });
    }

    if (this.koiMesh.instanceColor) {
      this.koiMesh.instanceColor.needsUpdate = true;
    }
    this.add(this.koiMesh);
  }

  private buildWisps(): void {
    const wGeo = new THREE.PlaneGeometry(0.75, 0.75);

    this.wispsMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uGlowTex: { value: getSoftGlowTexture() },
        uNightAlpha: { value: 0.0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vColor;

        void main() {
          vUv = uv;
          #ifdef USE_COLOR
            vColor = instanceColor;
          #else
            vColor = vec3(1.0);
          #endif

          // Camera-facing billboard rotation
          vec4 worldPos = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);

          worldPos.xyz += (camRight * position.x + camUp * position.y);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uGlowTex;
        uniform float uNightAlpha;
        varying vec2 vUv;
        varying vec3 vColor;

        void main() {
          if (uNightAlpha <= 0.01) discard;
          vec4 t = texture2D(uGlowTex, vUv);
          gl_FragColor = vec4(vColor, t.a * uNightAlpha * 0.85);
        }
      `,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });

    this.wispsMesh = new THREE.InstancedMesh(wGeo, this.wispsMat, this.wispCount);
    this.wispsMesh.name = 'LightWisps';

    const wispColors = [
      new THREE.Color('#B9A6FF'), // purple
      new THREE.Color('#FFA040'), // dawn orange
      new THREE.Color('#D8CCFF'), // lavender
    ];

    for (let i = 0; i < this.wispCount; i++) {
      const col = wispColors[i % wispColors.length]!;
      this.wispsMesh.setColorAt(i, col);

      const a = (i / this.wispCount) * Math.PI * 2;
      const r = 4.0 + ((i * 7.7) % 18.0);
      const cx = Math.cos(a) * r;
      const cz = Math.sin(a) * r;
      const baseY = terrainHeight(cx, cz) + 1.2 + (i % 4) * 0.6;

      this.wispData.push({
        cx,
        cz,
        baseY,
        r: 1.8 + (i % 3) * 0.8,
        speed: 0.25 + (i % 3) * 0.1,
        phase: i * 0.85,
        color: col,
      });
    }

    if (this.wispsMesh.instanceColor) {
      this.wispsMesh.instanceColor.needsUpdate = true;
    }
    this.add(this.wispsMesh);
  }

  update(dt: number, elapsed: number, skyState?: TimeOfDayState | number): void {
    const h = typeof skyState === 'number' ? skyState : skyState ? skyState.hour : 12.0;

    // Day vs Night alpha transitions
    const isDay = h >= 6.0 && h < 18.2;
    const dayAlpha = isDay ? (h >= 17.5 ? (18.2 - h) / 0.7 : 1.0) : 0.0;
    const isDuskOrNight = h >= 17.5 || h < 5.8;
    const nightAlpha = isDuskOrNight ? 1.0 : 0.0;

    // 1. Butterflies
    if (this.butterfliesMesh && this.butterfliesMat) {
      this.butterfliesMat.uniforms.uTime!.value = elapsed;
      this.butterfliesMat.uniforms.uDayAlpha!.value = dayAlpha;

      if (dayAlpha > 0.01) {
        const dummy = new THREE.Object3D();
        for (let i = 0; i < this.butterflyCount; i++) {
          const bd = this.butterflyData[i]!;
          const ang = elapsed * bd.speed + bd.phase;
          const x = bd.cx + Math.cos(ang) * bd.r;
          const z = bd.cz + Math.sin(ang * 1.5) * bd.r;
          const y = bd.baseY + Math.sin(ang * 2.5) * 0.45;

          dummy.position.set(x, y, z);
          dummy.rotation.y = -ang + Math.PI * 0.5;
          dummy.updateMatrix();
          this.butterfliesMesh.setMatrixAt(i, dummy.matrix);
        }
        this.butterfliesMesh.instanceMatrix.needsUpdate = true;
      }
    }

    // 2. Fireflies
    if (this.firefliesMat && this.firefliesGeo) {
      this.firefliesMat.opacity = nightAlpha * 0.88;

      if (nightAlpha > 0.01) {
        const pos = this.firefliesGeo.attributes.position!;
        const count = pos.count;
        for (let i = 0; i < count; i++) {
          const yOrig = pos.getY(i);
          pos.setY(i, yOrig + Math.sin(elapsed * 1.8 + i) * 0.003);
          pos.setX(i, pos.getX(i) + Math.cos(elapsed * 1.2 + i) * 0.002);
        }
        pos.needsUpdate = true;
      }
    }

    // 3. Cranes
    if (this.cranesMesh && this.cranesMat) {
      this.cranesMat.uniforms.uTime!.value = elapsed;

      // Periodically cross sky (every 180 s)
      const period = 180.0;
      this.craneProgress = (elapsed % period) / period;

      // Curve: starts at (-120, 55, 140), flies to (140, 68, -160)
      const t = this.craneProgress;
      const startP = new THREE.Vector3(-120, 52, 120);
      const midP = new THREE.Vector3(15, 62, -10);
      const endP = new THREE.Vector3(150, 68, -140);

      // Quadratic bezier
      const p = new THREE.Vector3()
        .copy(startP).multiplyScalar((1 - t) * (1 - t))
        .addScaledVector(midP, 2 * (1 - t) * t)
        .addScaledVector(endP, t * t);

      // Tangent for heading
      const tangent = new THREE.Vector3()
        .copy(midP).sub(startP).multiplyScalar(2 * (1 - t))
        .addScaledVector(new THREE.Vector3().copy(endP).sub(midP), 2 * t)
        .normalize();
      const yaw = Math.atan2(tangent.x, tangent.z);

      const dummy = new THREE.Object3D();
      for (let i = 0; i < this.craneCount; i++) {
        // V-formation: leader at i=0, flanks spreading backwards
        const flank = (i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2);
        const back = Math.ceil(i / 2) * 2.8;
        const side = flank * 2.2;

        const right = new THREE.Vector3(-tangent.z, 0, tangent.x);
        const birdPos = p.clone()
          .addScaledVector(tangent, -back)
          .addScaledVector(right, side);

        dummy.position.copy(birdPos);
        dummy.rotation.y = yaw;
        dummy.updateMatrix();
        this.cranesMesh.setMatrixAt(i, dummy.matrix);
      }
      this.cranesMesh.instanceMatrix.needsUpdate = true;
    }

    // 4. Swifts
    if (this.swiftsMesh && this.swiftsMat) {
      this.swiftsMat.uniforms.uTime!.value = elapsed;

      const dummy = new THREE.Object3D();
      for (let i = 0; i < this.swiftCount; i++) {
        const a = elapsed * 0.85 + (i / this.swiftCount) * Math.PI * 2;
        const r = 24.0 + Math.sin(i * 1.5) * 6.0;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        const y = 22.0 + Math.sin(elapsed * 2.0 + i) * 2.5;

        dummy.position.set(x, y, z);
        dummy.rotation.y = -a + Math.PI * 0.5;
        dummy.rotation.z = 0.25; // Bank
        dummy.updateMatrix();
        this.swiftsMesh.setMatrixAt(i, dummy.matrix);
      }
      this.swiftsMesh.instanceMatrix.needsUpdate = true;
    }

    // 5. Koi
    if (this.koiMesh && this.koiMat) {
      this.koiMat.uniforms.uTime!.value = elapsed;

      const dummy = new THREE.Object3D();
      for (let i = 0; i < this.koiCount; i++) {
        const kd = this.koiData[i]!;
        kd.angle += dt * kd.speed;
        const x = -9 + Math.cos(kd.angle) * kd.rad;
        const z = -4 + Math.sin(kd.angle) * (kd.rad * 0.75);
        const y = kd.depth;

        dummy.position.set(x, y, z);
        dummy.rotation.y = -kd.angle + Math.PI * 0.5;
        dummy.scale.set(0.9, 0.9, 0.9);
        dummy.updateMatrix();
        this.koiMesh.setMatrixAt(i, dummy.matrix);
      }
      this.koiMesh.instanceMatrix.needsUpdate = true;
    }

    // 6. Wisps
    if (this.wispsMesh && this.wispsMat) {
      this.wispsMat.uniforms.uTime!.value = elapsed;
      this.wispsMat.uniforms.uNightAlpha!.value = nightAlpha;

      if (nightAlpha > 0.01) {
        const dummy = new THREE.Object3D();
        for (let i = 0; i < this.wispCount; i++) {
          const wd = this.wispData[i]!;
          const ang = elapsed * wd.speed + wd.phase;
          const x = wd.cx + Math.cos(ang) * wd.r;
          const z = wd.cz + Math.sin(ang * 0.8) * wd.r;
          const y = wd.baseY + Math.sin(ang * 1.5) * 0.75;

          dummy.position.set(x, y, z);
          dummy.updateMatrix();
          this.wispsMesh.setMatrixAt(i, dummy.matrix);
        }
        this.wispsMesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  override dispose(): void {
    if (this.butterfliesMesh) {
      this.butterfliesMesh.geometry.dispose();
      this.butterfliesMesh = null;
    }
    if (this.butterfliesMat) {
      this.butterfliesMat.dispose();
      this.butterfliesMat = null;
    }
    if (this.firefliesPoints && this.firefliesGeo) {
      this.firefliesGeo.dispose();
      (this.firefliesPoints.material as THREE.Material).dispose();
      this.firefliesPoints = null;
    }
    if (this.cranesMesh) {
      this.cranesMesh.geometry.dispose();
      this.cranesMesh = null;
    }
    if (this.cranesMat) {
      this.cranesMat.dispose();
      this.cranesMat = null;
    }
    if (this.swiftsMesh) {
      this.swiftsMesh.geometry.dispose();
      this.swiftsMesh = null;
    }
    if (this.swiftsMat) {
      this.swiftsMat.dispose();
      this.swiftsMat = null;
    }
    if (this.koiMesh) {
      this.koiMesh.geometry.dispose();
      this.koiMesh = null;
    }
    if (this.koiMat) {
      this.koiMat.dispose();
      this.koiMat = null;
    }
    if (this.wispsMesh) {
      this.wispsMesh.geometry.dispose();
      this.wispsMesh = null;
    }
    if (this.wispsMat) {
      this.wispsMat.dispose();
      this.wispsMat = null;
    }
    disposeObject3D(this);
  }
}
