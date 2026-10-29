import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { applyVertexWear } from './bevel';

/**
 * Creates the stone brazier bowl on pedestal base geometry.
 */
export function createStoneBrazierGeometry(
  height = 1.15,
  radius = 0.52,
): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Stepped octagonal base
  const base1 = new THREE.CylinderGeometry(radius * 0.85, radius * 0.95, 0.16, 8);
  base1.translate(0, 0.08, 0);
  parts.push(base1);

  const base2 = new THREE.CylinderGeometry(radius * 0.65, radius * 0.75, 0.14, 8);
  base2.translate(0, 0.23, 0);
  parts.push(base2);

  // Pedestal shaft
  const shaft = new THREE.CylinderGeometry(radius * 0.38, radius * 0.44, 0.42, 8);
  shaft.translate(0, 0.51, 0);
  parts.push(shaft);

  // Flaring capital
  const cap = new THREE.CylinderGeometry(radius * 0.75, radius * 0.42, 0.18, 8);
  cap.translate(0, 0.81, 0);
  parts.push(cap);

  // Large stone bowl
  const bowlOuter = new THREE.CylinderGeometry(radius, radius * 0.7, 0.32, 12);
  bowlOuter.translate(0, 1.06, 0);
  parts.push(bowlOuter);

  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();

  applyVertexWear(merged, 0, height, 0.4, 0.18);
  return merged;
}

/**
 * Custom GLSL Animated Spirit Flame Shader Material:
 * Tall, luminous, flickering flame in orange or purple with soft edges and noise curl.
 */
export function createSpiritFlameMaterial(
  colorType: 'orange' | 'purple' = 'orange',
): THREE.ShaderMaterial {
  const coreColor = colorType === 'orange' ? new THREE.Color('#FF8C2A') : new THREE.Color('#9D6CFF');
  const tipColor = colorType === 'orange' ? new THREE.Color('#FFAE52') : new THREE.Color('#C9A8FF');
  const innerColor = colorType === 'orange' ? new THREE.Color('#FFF4D6') : new THREE.Color('#F2E8FF');

  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 1.0 },
      uCoreColor: { value: coreColor },
      uTipColor: { value: tipColor },
      uInnerColor: { value: innerColor },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      varying float vFlicker;

      void main() {
        vUv = uv;
        vec3 pos = position;

        // Upward flutter & curl
        float curl = sin(uTime * 3.5 + pos.y * 4.0) * cos(uTime * 2.8 + pos.x * 3.0);
        float taper = smoothstep(0.0, 1.0, uv.y);
        pos.x += curl * 0.12 * taper;
        pos.z += cos(uTime * 3.1 + pos.y * 3.7) * 0.08 * taper;

        // Vertical stretch pulse
        pos.y *= 1.0 + sin(uTime * 4.8) * 0.08 * taper;

        vFlicker = 0.85 + 0.15 * sin(uTime * 7.2 + pos.x * 2.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uIntensity;
      uniform vec3 uCoreColor;
      uniform vec3 uTipColor;
      uniform vec3 uInnerColor;

      varying vec2 vUv;
      varying float vFlicker;

      void main() {
        // Tapering flame shape
        vec2 p = vUv - vec2(0.5, 0.0);
        float width = (1.0 - vUv.y * 0.82) * 0.48;
        float d = abs(p.x) / max(0.01, width);

        if (d > 1.0 || vUv.y > 0.98) discard;

        float alphaEdge = smoothstep(1.0, 0.0, d);
        float alphaTop = smoothstep(0.98, 0.5, vUv.y);
        float alpha = alphaEdge * alphaTop * (0.85 + 0.15 * vFlicker);

        // Core to tip gradient
        vec3 flameCol = mix(uCoreColor, uTipColor, smoothstep(0.2, 0.9, vUv.y));
        // Hot luminous white center
        float hotCore = smoothstep(0.4, 0.0, d) * smoothstep(0.65, 0.05, vUv.y);
        flameCol = mix(flameCol, uInnerColor, hotCore * 0.75);

        gl_FragColor = vec4(flameCol * (uIntensity * 1.4), alpha * uIntensity);
      }
    `,
  });
}

/**
 * Flame geometry: crossed double plane cards for 360 degree luminous flame volume.
 */
export function createFlameGeometry(width = 0.54, height = 1.1): THREE.BufferGeometry {
  const g1 = new THREE.PlaneGeometry(width, height, 8, 12);
  g1.translate(0, height * 0.5, 0);

  const g2 = new THREE.PlaneGeometry(width, height, 8, 12);
  g2.rotateY(Math.PI / 2);
  g2.translate(0, height * 0.5, 0);

  const merged = mergeGeometries([g1, g2], false);
  g1.dispose();
  g2.dispose();
  return merged;
}

/**
 * Creates soft circular ground glow decal under the brazier.
 */
export function createBrazierGlowDecal(
  radius = 2.4,
  colorType: 'orange' | 'purple' = 'orange',
): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(radius * 2, radius * 2);
  geo.rotateX(-Math.PI / 2);

  const tint = colorType === 'orange' ? '#FF8C2A' : '#9D6CFF';
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uColor: { value: new THREE.Color(tint) },
      uOpacity: { value: 0.34 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        vec2 c = (vUv - 0.5) * 2.0;
        float r2 = dot(c, c);
        if (r2 > 1.0) discard;
        float glow = pow(1.0 - r2, 2.2) * uOpacity;
        gl_FragColor = vec4(uColor, glow);
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = `BrazierGlowDecal_${colorType}`;
  return mesh;
}
