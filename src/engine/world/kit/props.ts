import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createBeveledBoxGeometry } from './bevel';
import { createEntasisColumnGeometry } from './columns';
import { createHipAndGableRoofGeometry } from './roofs';
import type { MaterialLibrary } from '@/engine/world/MaterialLibrary';

/**
 * Creates the bronze bell geometry using lathe profile with relief rings and suspension loop.
 */
export function createBronzeBellGeometry(
  height = 1.6,
  radius = 0.62,
): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const steps = 16;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = t * height;
    // Bell flare at lip (t near 0) and dome top (t near 1)
    const flare = Math.pow(1.0 - t, 2.2) * 0.45;
    const dome = Math.sqrt(Math.max(0, 1.0 - Math.pow(t - 0.7, 2.0))) * 0.25;
    const r = radius * (0.65 + flare + dome * 0.4);
    pts.push(new THREE.Vector2(r, y));
  }
  const bellBody = new THREE.LatheGeometry(pts, 16);

  // Top cannon / dragon loop for hanging
  const loop = new THREE.TorusGeometry(0.18, 0.05, 8, 12);
  loop.translate(0, height + 0.14, 0);

  const merged = mergeGeometries([bellBody, loop], false);
  bellBody.dispose();
  loop.dispose();
  return merged;
}

/**
 * Creates a Bell Tower structure (open 4-column pavilion housing the swinging bell).
 */
export function createBellTowerGroup(
  materials: MaterialLibrary,
): { group: THREE.Group; bellMesh: THREE.Mesh } {
  const group = new THREE.Group();
  group.name = 'BellTower';

  // 1. Stone base
  const stoneMat = materials.getMaterial('stone', { tint: '#BDB3A3' });
  const timberMat = materials.getMaterial('timber', { tint: '#5B3F2B' });
  const lacquerMat = materials.getMaterial('timber', {
    tint: '#B3342A',
    physical: true,
    clearcoat: 0.6,
    clearcoatRoughness: 0.3,
  });
  const roofMat = materials.getMaterial('roof', {
    tint: '#3F4F55',
    physical: true,
    clearcoat: 0.4,
    clearcoatRoughness: 0.25,
  });
  const bronzeMat = materials.getMaterial('stone', {
    tint: '#4D6256',
    metalness: 0.85,
    roughnessScale: 0.42,
  });

  const baseGeo = createBeveledBoxGeometry(3.6, 0.32, 3.6, 0.03);
  baseGeo.translate(0, 0.16, 0);
  const baseMesh = new THREE.Mesh(baseGeo, stoneMat);
  baseMesh.castShadow = true;
  baseMesh.receiveShadow = true;
  group.add(baseMesh);

  // 2. 4 Columns & Tie beams
  const colHeight = 3.6;
  const colSpacing = 2.4;
  const colParts: THREE.BufferGeometry[] = [];
  for (const dx of [-colSpacing * 0.5, colSpacing * 0.5]) {
    for (const dz of [-colSpacing * 0.5, colSpacing * 0.5]) {
      const col = createEntasisColumnGeometry(colHeight, 0.18, 0.15, 1.06, 12);
      col.translate(dx, 0.32, dz);
      colParts.push(col);
    }
  }

  // Tie beams
  const beamParts: THREE.BufferGeometry[] = [];
  const beamW = colSpacing + 0.36;
  const beamY = 0.32 + colHeight - 0.15;
  for (const dz of [-colSpacing * 0.5, colSpacing * 0.5]) {
    const beam = createBeveledBoxGeometry(beamW, 0.22, 0.22, 0.02);
    beam.translate(0, beamY, dz);
    beamParts.push(beam);
  }
  for (const dx of [-colSpacing * 0.5, colSpacing * 0.5]) {
    const beam = createBeveledBoxGeometry(0.22, 0.22, beamW, 0.02);
    beam.translate(dx, beamY, 0);
    beamParts.push(beam);
  }

  const mergedCols = mergeGeometries(colParts, false);
  const mergedBeams = mergeGeometries(beamParts, false);
  for (const p of colParts) p.dispose();
  for (const p of beamParts) p.dispose();

  const colMesh = new THREE.Mesh(mergedCols, lacquerMat);
  colMesh.castShadow = true;
  group.add(colMesh);

  const beamMesh = new THREE.Mesh(mergedBeams, timberMat);
  beamMesh.castShadow = true;
  group.add(beamMesh);

  // 3. Small hip roof seated directly on the columns and tie beams
  const roofGeo = createHipAndGableRoofGeometry(4.2, 4.2, 0.8, 1.6, 0.45, 0.15, 18, 18);
  roofGeo.translate(0, 0.32 + colHeight - 0.04, 0);
  const roofMesh = new THREE.Mesh(roofGeo, roofMat);
  roofMesh.castShadow = true;
  group.add(roofMesh);

  // 4. Swinging Bronze Bell
  const bellGeo = createBronzeBellGeometry(1.4, 0.54);
  bellGeo.translate(0, -1.4, 0); // pivot at top hanging loop
  const bellMesh = new THREE.Mesh(bellGeo, bronzeMat);
  bellMesh.name = 'SwingingBell';
  bellMesh.position.set(0, beamY - 0.1, 0);
  bellMesh.castShadow = true;
  group.add(bellMesh);

  return { group, bellMesh };
}

/**
 * Creates large ceremonial sect drum on a carved timber trestle stand.
 */
export function createCeremonialDrumGroup(
  materials: MaterialLibrary,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'CeremonialDrum';

  const timberMat = materials.getMaterial('timber', { tint: '#5B3F2B' });
  const goldMat = materials.getMaterial('stone', {
    tint: '#D9A441',
    metalness: 0.95,
    roughnessScale: 0.35,
  });
  const drumSkinMat = materials.getMaterial('plaster', {
    tint: '#E8DFCE',
    roughnessScale: 0.85,
  });

  // Trestle legs
  const legParts: THREE.BufferGeometry[] = [];
  const legH = 1.4;
  for (const dirX of [-0.65, 0.65]) {
    const legA = createBeveledBoxGeometry(0.12, legH, 0.12, 0.015);
    legA.rotateZ(0.22 * Math.sign(dirX));
    legA.translate(dirX, legH * 0.45, -0.4);
    legParts.push(legA);

    const legB = createBeveledBoxGeometry(0.12, legH, 0.12, 0.015);
    legB.rotateZ(0.22 * Math.sign(dirX));
    legB.translate(dirX, legH * 0.45, 0.4);
    legParts.push(legB);
  }
  const crossBar = createBeveledBoxGeometry(1.5, 0.14, 0.14, 0.015);
  crossBar.translate(0, 0.45, 0);
  legParts.push(crossBar);

  const mergedLegs = mergeGeometries(legParts, false);
  for (const p of legParts) p.dispose();
  const legsMesh = new THREE.Mesh(mergedLegs, timberMat);
  legsMesh.castShadow = true;
  group.add(legsMesh);

  // Large barrel drum (red lacquer body, leather skin heads)
  const drumR = 0.85;
  const drumW = 1.1;
  const drumBody = new THREE.CylinderGeometry(drumR, drumR, drumW, 18);
  drumBody.rotateZ(Math.PI / 2);
  const drumMesh = new THREE.Mesh(drumBody, drumSkinMat);
  drumMesh.position.set(0, 1.45, 0);
  drumMesh.castShadow = true;
  group.add(drumMesh);

  // Gold stud rings on rim
  const studs: THREE.BufferGeometry[] = [];
  for (const dirX of [-drumW * 0.48, drumW * 0.48]) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const stud = new THREE.SphereGeometry(0.025, 6, 6);
      stud.translate(dirX, Math.sin(a) * (drumR + 0.02), Math.cos(a) * (drumR + 0.02));
      studs.push(stud);
    }
  }
  const mergedStuds = mergeGeometries(studs, false);
  for (const p of studs) p.dispose();
  const studMesh = new THREE.Mesh(mergedStuds, goldMat);
  studMesh.position.set(0, 1.45, 0);
  group.add(studMesh);

  return group;
}

/**
 * Wooden notice board with abstract sectarian line glyphs (ink talismans, no real script).
 */
export function createNoticeBoardGroup(
  materials: MaterialLibrary,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'NoticeBoard';

  const timberMat = materials.getMaterial('timber', { tint: '#5B3F2B' });
  const roofMat = materials.getMaterial('roof', { tint: '#3F4F55' });

  // Post & frame
  const frameParts: THREE.BufferGeometry[] = [];
  const postH = 2.4;
  for (const dx of [-0.95, 0.95]) {
    const post = createBeveledBoxGeometry(0.14, postH, 0.14, 0.015);
    post.translate(dx, postH * 0.5, 0);
    frameParts.push(post);
  }
  const board = createBeveledBoxGeometry(1.9, 1.1, 0.08, 0.015);
  board.translate(0, 1.65, 0);
  frameParts.push(board);

  const mergedFrame = mergeGeometries(frameParts, false);
  for (const p of frameParts) p.dispose();
  const frameMesh = new THREE.Mesh(mergedFrame, timberMat);
  frameMesh.castShadow = true;
  group.add(frameMesh);

  // Little tiled gabled rooflet on top
  const rooflet = createHipAndGableRoofGeometry(2.3, 0.6, 0.2, 0.35, 0.08, 0.08, 12, 6);
  rooflet.translate(0, 2.3, 0);
  const roofletMesh = new THREE.Mesh(rooflet, roofMat);
  roofletMesh.castShadow = true;
  group.add(roofletMesh);

  // Notice board paper with abstract glyph lines
  const size = 256;
  let canvas: HTMLCanvasElement;
  if (typeof document !== 'undefined') {
    canvas = document.createElement('canvas');
  } else {
    canvas = { width: size, height: size, getContext: () => null } as unknown as HTMLCanvasElement;
  }
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#E8E1D3';
    ctx.fillRect(0, 0, size, size);

    // Decorative ink borders
    ctx.strokeStyle = '#5A4634';
    ctx.lineWidth = 3;
    ctx.strokeRect(12, 12, size - 24, size - 24);

    // Abstract vertical talismanic glyph lines
    ctx.strokeStyle = '#2B1C10';
    ctx.lineWidth = 4;
    for (let c = 0; c < 5; c++) {
      const colX = 40 + c * 42;
      ctx.beginPath();
      ctx.moveTo(colX, 36);
      ctx.lineTo(colX + (c % 2 === 0 ? 8 : -8), 75);
      ctx.lineTo(colX, 115);
      ctx.lineTo(colX + (c % 2 === 0 ? -10 : 10), 160);
      ctx.lineTo(colX, 215);
      ctx.stroke();

      // Horizontal slash accents
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(colX - 12, 90);
      ctx.lineTo(colX + 12, 90);
      ctx.moveTo(colX - 8, 140);
      ctx.lineTo(colX + 14, 140);
      ctx.stroke();
    }
  }

  const paperTex = new THREE.CanvasTexture(canvas);
  const paperMat = new THREE.MeshBasicMaterial({ map: paperTex });
  const paperPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.68, 0.94), paperMat);
  paperPlane.position.set(0, 1.65, 0.045);
  group.add(paperPlane);

  return group;
}

/**
 * Creates cloth fluttering banners on tall lacquer poles.
 * Custom vertex shader simulates graceful wind wave along banner length.
 */
export function createFlutteringBannerMesh(
  colorType: 'orange' | 'purple' = 'orange',
  length = 3.6,
  width = 0.85,
  materials?: MaterialLibrary,
): { bannerMesh: THREE.Mesh; poleMesh: THREE.Mesh } {
  // Tall lacquer pole with gold cap
  const poleGeo = createBeveledBoxGeometry(0.10, length + 2.5, 0.10, 0.015);
  poleGeo.translate(0, (length + 2.5) * 0.5, 0);
  const poleMat = materials
    ? materials.getMaterial('timber', { tint: '#3A1812', roughnessScale: 0.5 })
    : new THREE.MeshBasicMaterial({ color: new THREE.Color('#3A1812') });
  const poleMesh = new THREE.Mesh(poleGeo, poleMat);
  poleMesh.castShadow = true;

  // Banner cloth geometry with segments for smooth wave motion
  const clothGeo = new THREE.PlaneGeometry(width, length, 12, 24);
  clothGeo.translate(width * 0.5, -length * 0.5, 0);

  const mainColor = colorType === 'orange' ? new THREE.Color('#FF7824') : new THREE.Color('#784BFF');
  const borderColor = new THREE.Color('#E8B923');

  const bannerMat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uMainColor: { value: mainColor },
      uBorderColor: { value: borderColor },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      varying float vLight;

      void main() {
        vUv = uv;
        vec3 pos = position;

        // Wave flutter increases towards loose bottom and free edge
        float flutterWeight = (1.0 - uv.y) * uv.x;
        float wave = sin(uTime * 3.8 + pos.y * 3.2 + pos.x * 2.0) * 0.14 * flutterWeight;
        float wave2 = cos(uTime * 2.4 + pos.y * 4.5) * 0.08 * flutterWeight;
        pos.z += wave + wave2;

        vLight = 0.82 + 0.18 * sin(uTime * 3.8 + pos.y * 3.2);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uMainColor;
      uniform vec3 uBorderColor;
      varying vec2 vUv;
      varying float vLight;

      void main() {
        // Thin gold border on sides & bottom
        float borderDist = min(min(vUv.x, 1.0 - vUv.x), vUv.y);
        float isBorder = smoothstep(0.065, 0.04, borderDist);

        vec3 col = mix(uMainColor, uBorderColor, isBorder) * vLight;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const bannerMesh = new THREE.Mesh(clothGeo, bannerMat);
  bannerMesh.name = `FlutteringBanner_${colorType}`;
  bannerMesh.position.set(0.05, length + 2.1, 0);
  bannerMesh.castShadow = true;

  return { bannerMesh, poleMesh };
}

/**
 * Creates bronze tripod incense burner with rising soft smoke particle column.
 */
export function createIncenseBurnerGroup(
  materials?: MaterialLibrary,
): { group: THREE.Group; smokePoints: THREE.Points } {
  const group = new THREE.Group();
  group.name = 'IncenseBurner';

  const parts: THREE.BufferGeometry[] = [];
  const censerR = 0.44;

  // Round bowl
  const bowl = new THREE.SphereGeometry(censerR, 12, 10);
  bowl.translate(0, 0.65, 0);
  parts.push(bowl);

  // 3 tripod legs
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = new THREE.CylinderGeometry(0.06, 0.04, 0.52, 8);
    leg.rotateZ(0.24);
    leg.rotateY(a);
    leg.translate(Math.cos(a) * 0.28, 0.26, Math.sin(a) * 0.28);
    parts.push(leg);
  }

  // Pierced dome lid
  const lid = new THREE.SphereGeometry(censerR * 0.94, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
  lid.translate(0, 0.72, 0);
  parts.push(lid);

  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();

  const censerMat = materials
    ? materials.getMaterial('stone', {
        tint: '#3E4F44',
        metalness: 0.85,
        roughnessScale: 0.45,
      })
    : new THREE.MeshBasicMaterial({ color: new THREE.Color('#3E4F44') });
  const censerMesh = new THREE.Mesh(merged, censerMat);
  censerMesh.name = 'IncenseCenserBody';
  censerMesh.castShadow = true;
  group.add(censerMesh);

  // Rising smoke particle column (soft Gaussian points strictly <= 3.4 px)
  const smokeCount = 48;
  const smokePositions = new Float32Array(smokeCount * 3);
  for (let i = 0; i < smokeCount; i++) {
    const t = i / smokeCount;
    smokePositions[i * 3] = ((i * 0.618) % 1 - 0.5) * 0.14;
    smokePositions[i * 3 + 1] = 0.9 + t * 2.8;
    smokePositions[i * 3 + 2] = ((i * 0.382) % 1 - 0.5) * 0.14;
  }
  const smokeGeo = new THREE.BufferGeometry();
  smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokePositions, 3));

  const smokeMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    uniforms: {
      uColor: { value: new THREE.Color('#D8CFDE') },
    },
    vertexShader: /* glsl */ `
      varying float vHeightAlpha;
      void main() {
        float h = clamp((position.y - 0.9) / 2.8, 0.0, 1.0);
        vHeightAlpha = smoothstep(0.0, 0.18, h) * smoothstep(1.0, 0.35, h) * 0.34;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = clamp(18.0 / max(4.5, -mvPosition.z), 1.4, 3.4);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vHeightAlpha;
      void main() {
        vec2 c = (gl_PointCoord - 0.5) * 2.0;
        float r2 = dot(c, c);
        if (r2 > 1.0) discard;
        float soft = exp(-r2 * 2.5) * (1.0 - r2);
        gl_FragColor = vec4(uColor, soft * vHeightAlpha);
      }
    `,
  });
  const smokePoints = new THREE.Points(smokeGeo, smokeMat);
  smokePoints.name = 'IncenseSmoke';
  group.add(smokePoints);

  return { group, smokePoints };
}

/**
 * Creates training circle inlay geometry:
 * Paved ring with 8 radial sectarian compass lines merged into a single ground inlay mesh.
 */
export function createTrainingCircleGroup(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'TrainingCircle';

  const parts: THREE.BufferGeometry[] = [];
  const rings = [2.2, 4.4, 6.2];
  for (const r of rings) {
    const ring = new THREE.RingGeometry(r - 0.035, r + 0.035, 48);
    ring.rotateX(-Math.PI / 2);
    ring.translate(0, 0.02, 0);
    parts.push(ring);
  }

  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const line = new THREE.PlaneGeometry(0.05, 6.2);
    line.rotateX(-Math.PI / 2);
    line.rotateY(a);
    line.translate(Math.sin(a) * 3.1, 0.02, Math.cos(a) * 3.1);
    parts.push(line);
  }

  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();

  const ringMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uColor: { value: new THREE.Color('#D9A441') },
    },
    vertexShader: /* glsl */ `
      varying vec3 vLocalPos;
      void main() {
        vLocalPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying vec3 vLocalPos;
      void main() {
        float r = length(vLocalPos.xz) / 6.35;
        if (r > 1.0) discard;
        float alpha = smoothstep(1.0, 0.92, r) * 0.72;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
  });

  const mesh = new THREE.Mesh(merged, ringMat);
  mesh.name = 'TrainingCircleInlay';
  group.add(mesh);

  return group;
}
