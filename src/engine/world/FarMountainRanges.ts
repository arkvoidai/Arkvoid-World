import * as THREE from 'three';
import type { TimeOfDayState } from '@/engine/world/sky';

interface RangeSpec {
  radius: number;
  thickness: number;
  baseHeight: number;
  peakHeight: number;
  seed: number;
  segments: number;
  rows: number;
}

function hash(value: number): number {
  const n = Math.sin(value * 127.1 + 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function ridge(angle: number, seed: number): number {
  const broad = Math.sin(angle * 3 + seed) * 0.5 + 0.5;
  const medium = Math.sin(angle * 7 - seed * 1.7) * 0.5 + 0.5;
  const fine = Math.sin(angle * 17 + seed * 0.71) * 0.5 + 0.5;
  const noise = hash(Math.floor(angle / (Math.PI * 2) * 256) + seed);
  return Math.max(0.08, Math.min(1, Math.pow(broad * 0.56 + medium * 0.32 + fine * 0.12, 2.15) * 0.72 + noise * 0.28));
}

function createRangeGeometry(spec: RangeSpec): THREE.BufferGeometry {
  const vertexCount = (spec.segments + 1) * (spec.rows + 1);
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const indices = new Uint32Array(spec.segments * spec.rows * 6);
  const low = new THREE.Color('#35404B');
  const middle = new THREE.Color('#687783');
  const high = new THREE.Color('#BCC0BB');
  const color = new THREE.Color();
  let indexOffset = 0;

  for (let i = 0; i <= spec.segments; i++) {
    const angle = i / spec.segments * Math.PI * 2;
    const profile = ridge(angle, spec.seed);
    const peak = spec.baseHeight + spec.peakHeight * (0.35 + profile * 0.65);
    const radialNoise = (hash(i + spec.seed * 31) - 0.5) * 80;

    for (let j = 0; j <= spec.rows; j++) {
      const t = j / spec.rows;
      const vertex = i * (spec.rows + 1) + j;
      const radius = spec.radius + (1 - t) * spec.thickness + Math.sin(angle * 11 + t * 3) * 18;
      const y = -22 + t * peak + Math.sin(angle * 23 + spec.seed) * t * 22 + radialNoise * t;
      positions[vertex * 3] = Math.cos(angle) * radius;
      positions[vertex * 3 + 1] = y;
      positions[vertex * 3 + 2] = Math.sin(angle) * radius;

      if (t < 0.58) color.copy(low).lerp(middle, t / 0.58);
      else color.copy(middle).lerp(high, (t - 0.58) / 0.42);
      const variation = 0.94 + hash(i * 13 + j * 5 + spec.seed) * 0.08;
      colors[vertex * 3] = color.r * variation;
      colors[vertex * 3 + 1] = color.g * variation;
      colors[vertex * 3 + 2] = color.b * variation;

      if (i < spec.segments && j < spec.rows) {
        const a = vertex;
        const b = (i + 1) * (spec.rows + 1) + j;
        const c = vertex + 1;
        const d = b + 1;
        indices[indexOffset++] = a;
        indices[indexOffset++] = b;
        indices[indexOffset++] = c;
        indices[indexOffset++] = c;
        indices[indexOffset++] = b;
        indices[indexOffset++] = d;
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function createDistantFallMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSunColor: { value: new THREE.Color('#FFF0D8') },
      uShadowColor: { value: new THREE.Color('#9CAFC0') },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSunColor;
      uniform vec3 uShadowColor;
      varying vec2 vUv;
      void main() {
        float flow = vUv.y * 18.0 - uTime * 1.8;
        float streakA = sin(vUv.x * 42.0 + sin(flow * 0.7) * 2.0);
        float streakB = sin(vUv.x * 93.0 - flow * 1.2);
        float foam = smoothstep(-0.1, 0.85, streakA * 0.65 + streakB * 0.35);
        float edge = smoothstep(0.0, 0.12, vUv.x) * (1.0 - smoothstep(0.88, 1.0, vUv.x));
        float alpha = edge * (0.28 + foam * 0.5) * (1.0 - smoothstep(0.92, 1.0, vUv.y));
        vec3 color = mix(uShadowColor, uSunColor, 0.32 + foam * 0.45);
        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/** Distant silhouette ranges; these are non-walkable backdrop meshes. */
export class FarMountainRanges extends THREE.Group {
  override readonly name = 'ArkvoidFarMountainRanges';
  private readonly rangeMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly waterfallMaterial: THREE.ShaderMaterial;

  constructor(isPhone = false) {
    super();
    const segments = isPhone ? 128 : 256;
    const rows = isPhone ? 5 : 8;
    // The first ridgelines sit beyond the Cloud Ocean, close enough to frame the
    // starting island instead of disappearing as a tiny horizon at several kilometres.
    const specs: RangeSpec[] = [
      { radius: 1250, thickness: 520, baseHeight: 90, peakHeight: 520, seed: 31, segments, rows },
      { radius: 2250, thickness: 760, baseHeight: 160, peakHeight: 880, seed: 73, segments, rows },
      { radius: 3900, thickness: 1120, baseHeight: 290, peakHeight: 1350, seed: 127, segments, rows },
      { radius: 6400, thickness: 1680, baseHeight: 480, peakHeight: 2050, seed: 181, segments, rows },
    ];

    for (const spec of specs) {
      const material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 1,
        metalness: 0,
        side: THREE.DoubleSide,
        fog: true,
      });
      const mesh = new THREE.Mesh(createRangeGeometry(spec), material);
      mesh.frustumCulled = true;
      mesh.name = 'MountainRange_' + spec.radius;
      this.add(mesh);
      this.rangeMaterials.push(material);
    }

    this.waterfallMaterial = createDistantFallMaterial();
    const falls = [
      { x: 1480, z: -1120, top: 460, height: 210, width: 16, yaw: 0.4 },
      { x: -2600, z: 1850, top: 880, height: 330, width: 22, yaw: -0.8 },
      { x: 4200, z: 2550, top: 1240, height: 420, width: 26, yaw: 1.25 },
      { x: -5600, z: -4200, top: 1850, height: 520, width: 30, yaw: 0.65 },
    ];
    for (let i = 0; i < falls.length; i++) {
      const fall = falls[i]!;
      const geometry = new THREE.PlaneGeometry(fall.width, fall.height, 2, isPhone ? 8 : 16);
      geometry.translate(0, -fall.height * 0.5, 0);
      const mesh = new THREE.Mesh(geometry, this.waterfallMaterial);
      mesh.position.set(fall.x, fall.top, fall.z);
      mesh.rotation.y = fall.yaw;
      mesh.name = 'DistantWaterfall_' + i;
      mesh.frustumCulled = true;
      this.add(mesh);
    }
  }

  syncSky(sky: TimeOfDayState): void {
    for (const material of this.rangeMaterials) {
      material.color.copy(sky.hemiSky).lerp(sky.keyColor, 0.18);
      material.emissive.copy(sky.fillColor).multiplyScalar(0.035);
    }
    this.waterfallMaterial.uniforms.uSunColor!.value.copy(sky.keyColor);
    this.waterfallMaterial.uniforms.uShadowColor!.value.copy(sky.fillColor).lerp(sky.hemiSky, 0.45);
  }

  update(elapsed: number): void {
    this.waterfallMaterial.uniforms.uTime!.value = elapsed;
  }

  override dispose(): void {
    for (const child of [...this.children]) {
      if ((child as THREE.Mesh).isMesh) (child as THREE.Mesh).geometry.dispose();
      this.remove(child);
    }
    for (const material of this.rangeMaterials) material.dispose();
    this.rangeMaterials.length = 0;
    this.waterfallMaterial.dispose();
  }
}
