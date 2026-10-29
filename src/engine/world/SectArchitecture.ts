import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  type ObstacleCylinder,
  type PlatformBox,
} from '@/engine/world/layout';
import type { MaterialLibrary } from '@/engine/world/MaterialLibrary';
import type { TimeOfDayState } from '@/engine/world/sky';
import {
  createBeveledBoxGeometry,
} from './kit/bevel';
import {
  createEntasisColumnGeometry,
  createPlinthGeometry,
  createBracketClusterGeometry,
  createRafterGeometry,
} from './kit/columns';
import {
  createHipAndGableRoofGeometry,
  createRidgeCapGeometry,
} from './kit/roofs';
import {
  getLatticeWindowTexture,
} from './kit/walls';
import {
  createGrandStairGeometry,
  createAshlarTerraceBaseGeometry,
} from './kit/stairs';
import {
  createHangingPaperLanternGeometry,
  createStoneLanternGeometry,
} from './kit/lanterns';
import {
  createStoneBrazierGeometry,
  createSpiritFlameMaterial,
  createFlameGeometry,
  createBrazierGlowDecal,
} from './kit/braziers';
import {
  createBellTowerGroup,
  createCeremonialDrumGroup,
  createNoticeBoardGroup,
  createFlutteringBannerMesh,
  createIncenseBurnerGroup,
  createTrainingCircleGroup,
} from './kit/props';

export interface SectArchitectureInstance {
  group: THREE.Group;
  colliders: {
    platforms: readonly PlatformBox[];
    cylinders: readonly ObstacleCylinder[];
    boxes: readonly {
      id: string;
      kind: 'wall' | 'dais' | 'rail' | 'stand';
      minX: number;
      maxX: number;
      minZ: number;
      maxZ: number;
      baseY: number;
      height: number;
    }[];
  };
  update: (time: number, skyState: TimeOfDayState) => void;
  dispose: () => void;
}

/**
 * Builds the complete Sect Architecture across Island A (Dawn Terrace),
 * Island B (Still Garden Archive), and Island C (Falls Shrine).
 */
export function createSectArchitecture(
  materials: MaterialLibrary,
  _isPhone = false,
): SectArchitectureInstance {
  const rootGroup = new THREE.Group();
  rootGroup.name = 'SectArchitecture';

  const dynamicUpdaters: ((time: number, skyState: TimeOfDayState) => void)[] = [];
  const disposables: { dispose: () => void }[] = [];

  // PBR Materials from MaterialLibrary
  const stoneMat = materials.getMaterial('stone', {
    tint: '#BDB3A3',
    vertexColors: true,
  });
  const pathMat = materials.getMaterial('path', {
    tint: '#BDB3A3',
    roughnessScale: 0.9,
  });
  const plasterMat = materials.getMaterial('plaster', {
    tint: '#E2DCCD',
    physical: true,
    clearcoat: 0.2,
    clearcoatRoughness: 0.4,
    vertexColors: true,
  });
  const timberMat = materials.getMaterial('timber', {
    tint: '#5B3F2B',
    uvScale: 1.0 / 1.5,
  });
  const lacquerMat = materials.getMaterial('timber', {
    tint: '#B3342A',
    physical: true,
    clearcoat: 0.6,
    clearcoatRoughness: 0.3,
  });
  const roofMat = materials.getMaterial('roof', {
    tint: '#3F4F55',
    physical: true,
    clearcoat: 0.45,
    clearcoatRoughness: 0.25,
    vertexColors: true,
  });

  const goldMat = materials.getMaterial('stone', {
    tint: '#D9A441',
    metalness: 0.95,
    roughnessScale: 0.32,
  });

  const latticeTexture = getLatticeWindowTexture();
  const latticeMat = new THREE.MeshStandardMaterial({
    map: latticeTexture,
    alphaTest: 0.35,
    side: THREE.DoubleSide,
    roughness: 0.5,
    emissive: new THREE.Color('#FF9640'),
    emissiveIntensity: 0.55,
  });
  disposables.push(latticeMat);

  const windowGlowMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#FFB060'),
    transparent: true,
    opacity: 0.65,
    side: THREE.DoubleSide,
  });
  disposables.push(windowGlowMat);

  const paperLanternMat = materials.getMaterial('plaster', {
    tint: '#FF8C2A',
    roughnessScale: 0.7,
  });
  paperLanternMat.emissive.set('#FFA65C');
  paperLanternMat.emissiveIntensity = 0.85;

  // Dynamic sky updater for emissives
  dynamicUpdaters.push((_, sky) => {
    const h = sky.hour;
    // Dim at noon (0.15), glowing at golden hour (0.6), strong at dusk/night (1.35)
    let emissiveFactor = 1.35;
    if (h >= 7.0 && h <= 17.5) {
      if (h < 9.5) {
        emissiveFactor = 1.35 - (h - 7.0) * 0.48;
      } else if (h > 15.5) {
        emissiveFactor = 0.15 + (h - 15.5) * 0.6;
      } else {
        emissiveFactor = 0.15;
      }
    }
    latticeMat.emissiveIntensity = emissiveFactor * 0.75;
    windowGlowMat.opacity = Math.max(0.12, emissiveFactor * 0.55);
    paperLanternMat.emissiveIntensity = emissiveFactor * 0.95;
  });

  // Trackers for analytic collision
  const platforms: PlatformBox[] = [];
  const cylinders: ObstacleCylinder[] = [];
  const boxes: {
    id: string;
    kind: 'wall' | 'dais' | 'rail' | 'stand';
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    baseY: number;
    height: number;
  }[] = [];

  // -------------------------------------------------------------
  // 1. ISLAND A: THE GRAND STONE STAIR & ASHLAR TERRACE BASE
  // -------------------------------------------------------------
  const terraceX = 15.8;
  const terraceZ = -6.0;
  const terraceW = 18.0; // depth along X (from x = 6.8 to 24.8)
  const terraceD = 27.0; // width along Z (from z = -19.5 to 7.5)
  const terraceH = 2.2;

  // Ashlar stone terrace base + paved stone top walking deck (fixes D5 plank appearance)
  const terraceBaseGeo = createAshlarTerraceBaseGeometry(terraceW, terraceD, terraceH, 0.22);
  terraceBaseGeo.translate(terraceX, 0, terraceZ);
  const terraceBaseMesh = new THREE.Mesh(terraceBaseGeo, stoneMat);
  terraceBaseMesh.name = 'HallTerraceAshlarBase';
  terraceBaseMesh.castShadow = true;
  terraceBaseMesh.receiveShadow = true;
  rootGroup.add(terraceBaseMesh);

  const terracePavingGeo = createBeveledBoxGeometry(terraceW - 0.16, 0.06, terraceD - 0.16, 0.015);
  terracePavingGeo.translate(terraceX, terraceH + 0.01, terraceZ);
  const terracePavingMesh = new THREE.Mesh(terracePavingGeo, pathMat);
  terracePavingMesh.name = 'HallTerraceStonePaving';
  terracePavingMesh.receiveShadow = true;
  rootGroup.add(terracePavingMesh);

  // Walkable terrace platform (starts at x = 6.84 at top of stairs)
  platforms.push({
    id: 'hall-terrace-main',
    island: 'A',
    minX: 6.84,
    maxX: terraceX + terraceW * 0.5,
    minZ: terraceZ - terraceD * 0.5,
    maxZ: terraceZ + terraceD * 0.5,
    floorY: terraceH,
  });

  // Grand Stone Stair: 14 steps rising from x = 2.08 to x = 6.84 at z = -6.0
  const stairWidth = 6.4;
  const stairSteps = 14;
  const stairRun = 0.34;
  const stairRise = terraceH / stairSteps; // ~0.157 m
  const stairStartX = 2.08;

  const { steps: stairStepsGeo, ramp: stairRampGeo, balustrades: stairBaluGeo } =
    createGrandStairGeometry(stairWidth, stairSteps, terraceH, stairRun, 1.4);

  stairStepsGeo.translate(stairStartX, 0, terraceZ);
  stairRampGeo.translate(stairStartX, 0, terraceZ);
  stairBaluGeo.translate(stairStartX, 0, terraceZ);

  const stairMesh = new THREE.Mesh(stairStepsGeo, pathMat);
  stairMesh.castShadow = true;
  stairMesh.receiveShadow = true;

  const rampMesh = new THREE.Mesh(stairRampGeo, stoneMat);
  rampMesh.castShadow = true;
  rampMesh.receiveShadow = true;

  const baluMesh = new THREE.Mesh(stairBaluGeo, stoneMat);
  baluMesh.castShadow = true;
  baluMesh.receiveShadow = true;

  rootGroup.add(stairMesh, rampMesh, baluMesh);

  // Stair walkable platform boxes (one per step, each rising 0.157 m <= 0.4 m)
  for (let i = 0; i < stairSteps; i++) {
    const sMinX = stairStartX + i * stairRun;
    const sMaxX = sMinX + stairRun + 0.05;
    platforms.push({
      id: `stair-step-${i + 1}`,
      island: 'A',
      minX: sMinX,
      maxX: sMaxX,
      minZ: terraceZ - stairWidth * 0.5 - 0.1,
      maxZ: terraceZ + stairWidth * 0.5 + 0.1,
      floorY: (i + 1) * stairRise,
    });
  }

  // Two stone braziers at the foot of the grand stair
  for (const dir of [-1, 1]) {
    const bz = terraceZ + dir * (stairWidth * 0.5 + 0.65);
    const bx = stairStartX - 0.4;
    const brazierGeo = createStoneBrazierGeometry(1.15, 0.52);
    brazierGeo.translate(bx, 0, bz);
    const bMesh = new THREE.Mesh(brazierGeo, stoneMat);
    bMesh.castShadow = true;
    rootGroup.add(bMesh);

    // Glowing flame (orange at south, purple at north)
    const flameMat = createSpiritFlameMaterial(dir > 0 ? 'orange' : 'purple');
    disposables.push(flameMat);
    dynamicUpdaters.push((t, s) => {
      if (flameMat.uniforms.uTime) flameMat.uniforms.uTime.value = t;
      if (flameMat.uniforms.uIntensity) {
        const h = s.hour;
        flameMat.uniforms.uIntensity.value = h >= 8.5 && h <= 16.5 ? 0.65 : 1.25;
      }
    });
    const flameGeo = createFlameGeometry(0.55, 1.15);
    flameGeo.translate(bx, 1.12, bz);
    const flameMesh = new THREE.Mesh(flameGeo, flameMat);
    rootGroup.add(flameMesh);

    // Ground glow decal
    const glowDecal = createBrazierGlowDecal(2.6, dir > 0 ? 'orange' : 'purple');
    glowDecal.position.set(bx, 0.02, bz);
    rootGroup.add(glowDecal);

    cylinders.push({
      id: `brazier-stair-${dir > 0 ? 'south' : 'north'}`,
      kind: 'column',
      x: bx,
      z: bz,
      baseY: 0,
      height: 1.6,
      radius: 0.52,
    });
  }

  // -------------------------------------------------------------
  // 2. ISLAND A: THE MAIN HALL (footprint 24 x 14 m, 5.6 m columns, 9.5 m height)
  // Facade (24 m) along Z, Depth (14 m) along X (from x = 8.5 to 22.5)
  // -------------------------------------------------------------
  const hallX = 15.5;
  const hallZ = -6.0;
  const hallDepthX = 14.0; // from x = 8.5 to 22.5
  const hallWidthZ = 24.0; // from z = -18.0 to 6.0
  const colH = 5.6;
  const hallFloorY = terraceH + 0.25; // y = 2.45 m

  // Hall interior floor platform (walkable inside!)
  platforms.push({
    id: 'hall-interior-floor',
    island: 'A',
    minX: 8.5,
    maxX: 22.5,
    minZ: hallZ - hallWidthZ * 0.5,
    maxZ: hallZ + hallWidthZ * 0.5,
    floorY: hallFloorY,
  });

  // Plinth and columns
  const hallColGeoList: THREE.BufferGeometry[] = [];
  const hallPlinthGeoList: THREE.BufferGeometry[] = [];
  const hallGoldList: THREE.BufferGeometry[] = [];
  const bracketList: THREE.BufferGeometry[] = [];

  const bracketProto = createBracketClusterGeometry();

  // Column grid: 4 along X (depth), 7 along Z (facade)
  const colsDepthX = 4;
  const colsWidthZ = 7;
  const colSpanX = hallDepthX / (colsDepthX - 1);
  const colSpanZ = hallWidthZ / (colsWidthZ - 1);

  for (let ix = 0; ix < colsDepthX; ix++) {
    const cx = 8.5 + ix * colSpanX;
    for (let iz = 0; iz < colsWidthZ; iz++) {
      const cz = hallZ - hallWidthZ * 0.5 + iz * colSpanZ;

      // Skip inner columns so hall interior is open and walkable
      const isInner = ix > 0 && ix < colsDepthX - 1 && iz > 1 && iz < colsWidthZ - 2;
      if (isInner) continue;

      // Skip central entrance colonnade column so doorway is wide open
      if (ix === 0 && Math.abs(cz - hallZ) < 1.0) continue;

      // Stone plinth
      const plinth = createPlinthGeometry(0.78, 0.28);
      plinth.translate(cx, terraceH, cz);
      hallPlinthGeoList.push(plinth);

      // Lathe entasis column in vermilion lacquer
      const col = createEntasisColumnGeometry(colH, 0.26, 0.22, 1.08, 14);
      col.translate(cx, terraceH + 0.25, cz);
      hallColGeoList.push(col);

      // Gold collar rings
      const gCollarBot = new THREE.TorusGeometry(0.265, 0.02, 6, 12);
      gCollarBot.rotateX(Math.PI / 2);
      gCollarBot.translate(cx, terraceH + 0.55, cz);
      hallGoldList.push(gCollarBot);

      const gCollarTop = new THREE.TorusGeometry(0.23, 0.02, 6, 12);
      gCollarTop.rotateX(Math.PI / 2);
      gCollarTop.translate(cx, terraceH + 0.25 + colH - 0.2, cz);
      hallGoldList.push(gCollarTop);

      // Bracket cluster on outer columns
      const isPerimeter = ix === 0 || ix === colsDepthX - 1 || iz === 0 || iz === colsWidthZ - 1;
      if (isPerimeter) {
        const brk = bracketProto.clone();
        brk.translate(cx, terraceH + 0.25 + colH, cz);
        bracketList.push(brk);
      }

      // Add cylinder obstacle for player collision
      cylinders.push({
        id: `hall-col-${ix}-${iz}`,
        kind: 'column',
        x: cx,
        z: cz,
        baseY: terraceH,
        height: colH + 0.5,
        radius: 0.26,
      });
    }
  }

  // Tie beams connecting columns
  const beamY = terraceH + 0.25 + colH - 0.18;
  const beamGeoList: THREE.BufferGeometry[] = [];

  // Tie beams along Z
  for (let ix = 0; ix < colsDepthX; ix++) {
    const cx = 8.5 + ix * colSpanX;
    const beamZ = createBeveledBoxGeometry(0.28, 0.32, hallWidthZ + 0.6, 0.02);
    beamZ.translate(cx, beamY, hallZ);
    beamGeoList.push(beamZ);
  }
  // Tie beams along X
  for (let iz = 0; iz < colsWidthZ; iz++) {
    const cz = hallZ - hallWidthZ * 0.5 + iz * colSpanZ;
    const beamX = createBeveledBoxGeometry(hallDepthX + 0.6, 0.32, 0.28, 0.02);
    beamX.translate(hallX, beamY, cz);
    beamGeoList.push(beamX);
  }

  // Perimeter Walls with Plaster Panels & Lattice Windows
  // Back wall (east +X at x = 22.5)
  const backWallX = 22.5;
  const backWall = createBeveledBoxGeometry(0.28, colH * 0.9, hallWidthZ, 0.02);
  backWall.translate(backWallX, terraceH + 0.25 + colH * 0.45, hallZ);
  rootGroup.add(new THREE.Mesh(backWall, plasterMat));
  boxes.push({
    id: 'hall-wall-back',
    kind: 'wall',
    minX: backWallX - 0.25,
    maxX: backWallX + 0.25,
    minZ: hallZ - hallWidthZ * 0.5,
    maxZ: hallZ + hallWidthZ * 0.5,
    baseY: terraceH,
    height: colH,
  });

  // North wall (-Z at z = -18.0)
  const northWallZ = hallZ - hallWidthZ * 0.5;
  const northWall = createBeveledBoxGeometry(hallDepthX, colH * 0.9, 0.28, 0.02);
  northWall.translate(hallX, terraceH + 0.25 + colH * 0.45, northWallZ);
  rootGroup.add(new THREE.Mesh(northWall, plasterMat));
  boxes.push({
    id: 'hall-wall-north',
    kind: 'wall',
    minX: 8.5,
    maxX: 22.5,
    minZ: northWallZ - 0.25,
    maxZ: northWallZ + 0.25,
    baseY: terraceH,
    height: colH,
  });

  // South wall (+Z at z = +6.0)
  const southWallZ = hallZ + hallWidthZ * 0.5;
  const southWall = createBeveledBoxGeometry(hallDepthX, colH * 0.9, 0.28, 0.02);
  southWall.translate(hallX, terraceH + 0.25 + colH * 0.45, southWallZ);
  rootGroup.add(new THREE.Mesh(southWall, plasterMat));
  boxes.push({
    id: 'hall-wall-south',
    kind: 'wall',
    minX: 8.5,
    maxX: 22.5,
    minZ: southWallZ - 0.25,
    maxZ: southWallZ + 0.25,
    baseY: terraceH,
    height: colH,
  });

  // Front Wall (West -X at x = 8.5): Open-front colonnade with central door gap!
  // Central gap (z in [-8.5, -3.5]) is wide open for door entrance
  const frontWallX = 8.5;
  const doorHalfW = 2.5;

  const wingNorthLen = (hallZ - doorHalfW) - (hallZ - hallWidthZ * 0.5);
  const wingNorthMidZ = (hallZ - hallWidthZ * 0.5 + hallZ - doorHalfW) * 0.5;
  const wingNorth = createBeveledBoxGeometry(0.26, colH * 0.9, wingNorthLen, 0.02);
  wingNorth.translate(frontWallX, terraceH + 0.25 + colH * 0.45, wingNorthMidZ);
  rootGroup.add(new THREE.Mesh(wingNorth, plasterMat));

  const wingSouthLen = (hallZ + hallWidthZ * 0.5) - (hallZ + doorHalfW);
  const wingSouthMidZ = (hallZ + doorHalfW + hallZ + hallWidthZ * 0.5) * 0.5;
  const wingSouth = createBeveledBoxGeometry(0.26, colH * 0.9, wingSouthLen, 0.02);
  wingSouth.translate(frontWallX, terraceH + 0.25 + colH * 0.45, wingSouthMidZ);
  rootGroup.add(new THREE.Mesh(wingSouth, plasterMat));

  boxes.push(
    {
      id: 'hall-front-wall-north',
      kind: 'wall',
      minX: frontWallX - 0.25,
      maxX: frontWallX + 0.25,
      minZ: hallZ - hallWidthZ * 0.5,
      maxZ: hallZ - doorHalfW,
      baseY: terraceH,
      height: colH,
    },
    {
      id: 'hall-front-wall-south',
      kind: 'wall',
      minX: frontWallX - 0.25,
      maxX: frontWallX + 0.25,
      minZ: hallZ + doorHalfW,
      maxZ: hallZ + hallWidthZ * 0.5,
      baseY: terraceH,
      height: colH,
    },
  );

  // Lattice windows flush against the North, South, and Back walls (fixes D7 hovering rotated window)
  const winW = hallDepthX * 0.62;
  const winH = 1.85;
  const winY = terraceH + 2.55;

  // North wall lattice window (flush on northWall at z = northWallZ, rotation.y = 0)
  const windowMeshNorth = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), latticeMat);
  windowMeshNorth.name = 'HallLatticeWindowNorth';
  windowMeshNorth.position.set(hallX, winY, northWallZ + 0.155);
  rootGroup.add(windowMeshNorth);

  // South wall lattice window (flush on southWall at z = southWallZ, rotation.y = 0)
  const windowMeshSouth = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), latticeMat);
  windowMeshSouth.name = 'HallLatticeWindowSouth';
  windowMeshSouth.position.set(hallX, winY, southWallZ - 0.155);
  rootGroup.add(windowMeshSouth);

  // Back wall central lattice window (flush on backWall at x = backWallX, rotation.y = -Math.PI / 2)
  const windowMeshEast = new THREE.Mesh(new THREE.PlaneGeometry(hallWidthZ * 0.45, winH), latticeMat);
  windowMeshEast.name = 'HallLatticeWindowEast';
  windowMeshEast.rotateY(-Math.PI / 2);
  windowMeshEast.position.set(backWallX - 0.155, winY, hallZ);
  rootGroup.add(windowMeshEast);

  // Timber window frames around North, South, and East lattice windows (merged into beamGeoList)
  const nFrame = createBeveledBoxGeometry(winW + 0.24, winH + 0.24, 0.32, 0.02);
  nFrame.translate(hallX, winY, northWallZ);
  beamGeoList.push(nFrame);

  const sFrame = createBeveledBoxGeometry(winW + 0.24, winH + 0.24, 0.32, 0.02);
  sFrame.translate(hallX, winY, southWallZ);
  beamGeoList.push(sFrame);

  const eFrame = createBeveledBoxGeometry(0.32, winH + 0.24, hallWidthZ * 0.45 + 0.24, 0.02);
  eFrame.translate(backWallX, winY, hallZ);
  beamGeoList.push(eFrame);

  // Interior Altar-like stone dais at the back of the hall
  const daisX = 20.0;
  const daisZ = hallZ;
  const daisW = 2.8;
  const daisD = 4.8;
  const daisH = 0.45;
  const daisGeo = createBeveledBoxGeometry(daisW, daisH, daisD, 0.03);
  daisGeo.translate(daisX, hallFloorY + daisH * 0.5, daisZ);
  const daisMesh = new THREE.Mesh(daisGeo, stoneMat);
  daisMesh.castShadow = true;
  rootGroup.add(daisMesh);

  platforms.push({
    id: 'hall-altar-dais',
    island: 'A',
    minX: daisX - daisW * 0.5,
    maxX: daisX + daisW * 0.5,
    minZ: daisZ - daisD * 0.5,
    maxZ: daisZ + daisD * 0.5,
    floorY: hallFloorY + daisH,
  });

  // Two spirit braziers on the dais (one orange, one purple)
  for (const dir of [-1, 1]) {
    const bz = daisZ + dir * 1.8;
    const brazierGeo = createStoneBrazierGeometry(0.85, 0.38);
    brazierGeo.translate(daisX, hallFloorY + daisH, bz);
    const bMesh = new THREE.Mesh(brazierGeo, stoneMat);
    bMesh.castShadow = true;
    rootGroup.add(bMesh);

    const flameMat = createSpiritFlameMaterial(dir > 0 ? 'orange' : 'purple');
    disposables.push(flameMat);
    dynamicUpdaters.push((t, s) => {
      if (flameMat.uniforms.uTime) flameMat.uniforms.uTime.value = t;
      if (flameMat.uniforms.uIntensity) {
        const h = s.hour;
        flameMat.uniforms.uIntensity.value = h >= 8.5 && h <= 16.5 ? 0.75 : 1.35;
      }
    });
    const flameGeo = createFlameGeometry(0.42, 0.85);
    flameGeo.translate(daisX, hallFloorY + daisH + 0.82, bz);
    const flameMesh = new THREE.Mesh(flameGeo, flameMat);
    rootGroup.add(flameMesh);

    cylinders.push({
      id: `dais-brazier-${dir > 0 ? 'south' : 'north'}`,
      kind: 'column',
      x: daisX,
      z: bz,
      baseY: hallFloorY + daisH,
      height: 1.2,
      radius: 0.38,
    });
  }

  // Hanging banners in the hall (suspended directly from the interior tie beam at x = 8.5 + 2 * colSpanX)
  const bannerBeamX = 8.5 + 2 * colSpanX;
  for (const dir of [-1, 1]) {
    const bz = daisZ + dir * 2.2;
    const { bannerMesh } = createFlutteringBannerMesh(
      dir > 0 ? 'orange' : 'purple',
      3.2,
      0.7,
      materials,
    );
    bannerMesh.position.set(bannerBeamX - 0.35, beamY + 0.04, bz);
    disposables.push(bannerMesh.material as THREE.Material);
    dynamicUpdaters.push((t) => {
      const bMat = bannerMesh.material as THREE.ShaderMaterial;
      if (bMat.uniforms.uTime) bMat.uniforms.uTime.value = t;
    });
    rootGroup.add(bannerMesh);
  }

  // DOUBLE-TIER ROOF FOR MAIN HALL
  // Tier 1: Lower penthouse roof tier (seated on perimeter columns & tie beams)
  const roofTier1Geo = createHipAndGableRoofGeometry(
    hallDepthX + 2.0,
    hallWidthZ + 2.0,
    1.4,
    2.4,
    0.65,
    0.18,
    22,
    32,
  );
  roofTier1Geo.translate(hallX, terraceH + colH * 0.65, hallZ);
  const roofTier1Mesh = new THREE.Mesh(roofTier1Geo, roofMat);
  roofTier1Mesh.name = 'HallRoofTier1';
  roofTier1Mesh.castShadow = true;
  rootGroup.add(roofTier1Mesh);

  // Tier 2: Upper main hall roof tier with sweeping upturned eaves
  const roofTier2Geo = createHipAndGableRoofGeometry(
    hallDepthX + 1.0,
    hallWidthZ + 1.0,
    2.1,
    3.8,
    0.95,
    0.24,
    24,
    36,
  );
  roofTier2Geo.translate(hallX, terraceH + colH + 0.25, hallZ);
  const roofTier2Mesh = new THREE.Mesh(roofTier2Geo, roofMat);
  roofTier2Mesh.name = 'HallRoofTier2';
  roofTier2Mesh.castShadow = true;
  rootGroup.add(roofTier2Mesh);

  // Ridge cap with ornamental chiwei finials seated directly along the Z-axis ridge of Tier 2 roof (fixes D7)
  const ridgeCapGeo = createRidgeCapGeometry(11.6, 0.18);
  ridgeCapGeo.rotateY(Math.PI / 2);
  ridgeCapGeo.translate(hallX, terraceH + colH + 0.25 + 3.74, hallZ);
  const ridgeMesh = new THREE.Mesh(ridgeCapGeo, goldMat);
  ridgeMesh.name = 'HallRidgeCapOrnament';
  ridgeMesh.castShadow = true;
  rootGroup.add(ridgeMesh);

  // Instanced rafters under the eaves (rows of small beams, 90 per eave side)
  const rafterProto = createRafterGeometry(1.4, 0.08);
  const rafterCount = 180;
  const rafterMesh = new THREE.InstancedMesh(rafterProto, timberMat, rafterCount);
  rafterMesh.castShadow = true;
  const rafterDummy = new THREE.Object3D();
  let rIdx = 0;
  for (const side of [-1, 1]) {
    const rz = hallZ + side * (hallWidthZ * 0.5 + 0.15);
    for (let i = 0; i < 90; i++) {
      const rx = (hallX - hallDepthX * 0.5) + (i / 89) * hallDepthX;
      rafterDummy.position.set(rx, terraceH + colH * 0.65 - 0.05, rz);
      rafterDummy.rotation.set(side * 0.15, 0, 0);
      rafterDummy.updateMatrix();
      rafterMesh.setMatrixAt(rIdx++, rafterDummy.matrix);
    }
  }
  rafterMesh.instanceMatrix.needsUpdate = true;
  rootGroup.add(rafterMesh);
  disposables.push(rafterProto);

  // Merge static column, beam, plinth, and bracket geometries
  const mergedPlinths = mergeGeometries(hallPlinthGeoList, false);
  const mergedColumns = mergeGeometries(hallColGeoList, false);
  const mergedBeams = mergeGeometries(beamGeoList, false);
  const mergedBrackets = mergeGeometries(bracketList, false);
  const mergedGold = mergeGeometries(hallGoldList, false);

  for (const g of hallPlinthGeoList) g.dispose();
  for (const g of hallColGeoList) g.dispose();
  for (const g of beamGeoList) g.dispose();
  for (const g of bracketList) g.dispose();
  for (const g of hallGoldList) g.dispose();
  bracketProto.dispose();

  const plinthsMesh = new THREE.Mesh(mergedPlinths, stoneMat);
  plinthsMesh.castShadow = true;
  const columnsMesh = new THREE.Mesh(mergedColumns, lacquerMat);
  columnsMesh.castShadow = true;
  const beamsMesh = new THREE.Mesh(mergedBeams, timberMat);
  beamsMesh.castShadow = true;
  const bracketsMesh = new THREE.Mesh(mergedBrackets, timberMat);
  bracketsMesh.castShadow = true;
  const goldMesh = new THREE.Mesh(mergedGold, goldMat);

  rootGroup.add(plinthsMesh, columnsMesh, beamsMesh, bracketsMesh, goldMesh);

  // Hanging paper lanterns under front colonnade eaves (seated on front tie beam at x = frontWallX)
  for (let i = 0; i < 4; i++) {
    const lz = hallZ - hallWidthZ * 0.38 + i * (hallWidthZ * 0.25);
    const lx = frontWallX - 0.12;
    const ly = beamY - 0.15;
    const { paper, timber: lTim, gold: lGld } = createHangingPaperLanternGeometry(0.55, 0.22);
    paper.translate(lx, ly, lz);
    lTim.translate(lx, ly, lz);
    lGld.translate(lx, ly, lz);

    const pMesh = new THREE.Mesh(paper, paperLanternMat);
    const tMesh = new THREE.Mesh(lTim, timberMat);
    const gMesh = new THREE.Mesh(lGld, goldMat);
    rootGroup.add(pMesh, tMesh, gMesh);
  }

  // -------------------------------------------------------------
  // 3. ISLAND A: PAVILION NEAR SPIRIT POND & COVERED CORRIDOR
  // -------------------------------------------------------------
  // Pavilion (9 x 7 m) at (-4.5, 0, -7.5) with bench ring where Hale stands
  const pavX = -4.5;
  const pavZ = -7.5;
  const pavW = 8.6;
  const pavD = 6.8;
  const pavFloorY = 0.35;

  const pavBaseGeo = createAshlarTerraceBaseGeometry(pavW, pavD, pavFloorY, 0.16);
  pavBaseGeo.translate(pavX, 0, pavZ);
  rootGroup.add(new THREE.Mesh(pavBaseGeo, stoneMat));

  platforms.push({
    id: 'pavilion-pond-base',
    island: 'A',
    minX: pavX - pavW * 0.5,
    maxX: pavX + pavW * 0.5,
    minZ: pavZ - pavD * 0.5,
    maxZ: pavZ + pavD * 0.5,
    floorY: pavFloorY,
  });

  // Pavilion 6 columns
  const pavCols: THREE.BufferGeometry[] = [];
  const pavColSpacingX = pavW * 0.72;
  const pavColSpacingZ = pavD * 0.68;
  const pavColH = 3.6;

  for (const dx of [-pavColSpacingX * 0.5, 0, pavColSpacingX * 0.5]) {
    for (const dz of [-pavColSpacingZ * 0.5, pavColSpacingZ * 0.5]) {
      const c = createEntasisColumnGeometry(pavColH, 0.20, 0.17, 1.06, 12);
      c.translate(pavX + dx, pavFloorY, pavZ + dz);
      pavCols.push(c);

      cylinders.push({
        id: `pav-col-${dx.toFixed(1)}-${dz.toFixed(1)}`,
        kind: 'column',
        x: pavX + dx,
        z: pavZ + dz,
        baseY: pavFloorY,
        height: pavColH,
        radius: 0.22,
      });
    }
  }

  // Pavilion Bench Ring (perimeter seating between columns)
  const benchParts: THREE.BufferGeometry[] = [];
  const benchH = 0.45;
  const benchW = 0.38;
  const bEast = createBeveledBoxGeometry(benchW, benchH, pavColSpacingZ, 0.02);
  bEast.translate(pavX + pavColSpacingX * 0.5, pavFloorY + benchH * 0.5, pavZ);
  benchParts.push(bEast);

  const bWest = createBeveledBoxGeometry(benchW, benchH, pavColSpacingZ, 0.02);
  bWest.translate(pavX - pavColSpacingX * 0.5, pavFloorY + benchH * 0.5, pavZ);
  benchParts.push(bWest);

  const bNorth = createBeveledBoxGeometry(pavColSpacingX, benchH, benchW, 0.02);
  bNorth.translate(pavX, pavFloorY + benchH * 0.5, pavZ - pavColSpacingZ * 0.5);
  benchParts.push(bNorth);

  const mergedBench = mergeGeometries(benchParts, false);
  for (const p of benchParts) p.dispose();
  rootGroup.add(new THREE.Mesh(mergedBench, timberMat));

  // Pavilion Roof
  const pavRoofGeo = createHipAndGableRoofGeometry(pavW, pavD, 1.3, 2.2, 0.65, 0.18, 24, 18);
  pavRoofGeo.translate(pavX, pavFloorY + pavColH, pavZ);
  rootGroup.add(new THREE.Mesh(pavRoofGeo, roofMat));

  const mergedPavCols = mergeGeometries(pavCols, false);
  for (const p of pavCols) p.dispose();
  rootGroup.add(new THREE.Mesh(mergedPavCols, lacquerMat));

  // Covered Walkway Corridor linking Pavilion and Hall:
  // Walkway from x = -0.5 to x = 6.5 at z = -6.2
  const corrStartX = pavX + pavW * 0.5; // ~ -0.2
  const corrEndX = terraceX - terraceW * 0.5 - 0.2; // ~ 1.8
  const corrLen = corrEndX - corrStartX;
  const corrMidX = (corrStartX + corrEndX) * 0.5;
  const corrZ = -6.2;
  const corrW = 2.4;

  const corrDeck = createBeveledBoxGeometry(corrLen + 0.2, 0.22, corrW, 0.02);
  corrDeck.translate(corrMidX, 0.11, corrZ);
  rootGroup.add(new THREE.Mesh(corrDeck, pathMat));

  platforms.push({
    id: 'corridor-walkway',
    island: 'A',
    minX: corrStartX,
    maxX: corrEndX,
    minZ: corrZ - corrW * 0.5,
    maxZ: corrZ + corrW * 0.5,
    floorY: 0.22,
  });

  // Corridor small colonnade posts & rooflet
  const corrCols: THREE.BufferGeometry[] = [];
  const colSteps = 3;
  for (let i = 0; i <= colSteps; i++) {
    const cx = corrStartX + (i / colSteps) * corrLen;
    for (const side of [-1, 1]) {
      const cz = corrZ + side * (corrW * 0.5 - 0.16);
      const c = createEntasisColumnGeometry(2.8, 0.14, 0.12, 1.05, 10);
      c.translate(cx, 0.22, cz);
      corrCols.push(c);
    }
  }
  const mergedCorrCols = mergeGeometries(corrCols, false);
  for (const p of corrCols) p.dispose();
  rootGroup.add(new THREE.Mesh(mergedCorrCols, lacquerMat));

  const corrRoof = createHipAndGableRoofGeometry(corrLen + 0.6, corrW + 0.6, 0.4, 0.85, 0.25, 0.12, 16, 8);
  corrRoof.translate(corrMidX, 3.02, corrZ);
  rootGroup.add(new THREE.Mesh(corrRoof, roofMat));

  // -------------------------------------------------------------
  // 4. ISLAND A: SPIRIT POND RING WALL & ISLET ZIGZAG BRIDGE
  // -------------------------------------------------------------
  const pondX = -9.0;
  const pondZ = -4.0;
  const pondR = 3.6;

  // Stone ring wall around spirit pond
  const wallRing = new THREE.TorusGeometry(pondR, 0.22, 10, 36);
  wallRing.rotateX(Math.PI / 2);
  wallRing.translate(pondX, 0.22, pondZ);
  rootGroup.add(new THREE.Mesh(wallRing, stoneMat));

  cylinders.push({
    id: 'pond-ring-wall',
    kind: 'pool',
    x: pondX,
    z: pondZ,
    baseY: -1.2,
    height: 1.8,
    radius: pondR + 0.2,
  });

  // Short zigzag stone bridge to islet (connected from pond ring wall at x = -5.4 to islet at x = -8.8)
  const zigZags: THREE.BufferGeometry[] = [];
  const zzPts = [
    { x: -5.35, y: 0.18, z: -4.0 },
    { x: -7.0, y: 0.16, z: -4.8 },
    { x: -8.6, y: 0.14, z: -4.0 },
  ];
  for (let i = 0; i < zzPts.length - 1; i++) {
    const p0 = zzPts[i]!;
    const p1 = zzPts[i + 1]!;
    const zLen = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    const zYaw = Math.atan2(p1.x - p0.x, p1.z - p0.z);
    const slab = createBeveledBoxGeometry(1.2, 0.24, zLen + 0.12, 0.02);
    slab.rotateY(zYaw);
    slab.translate((p0.x + p1.x) * 0.5, (p0.y + p1.y) * 0.5 - 0.04, (p0.z + p1.z) * 0.5);
    zigZags.push(slab);

    platforms.push({
      id: `pond-zigzag-slab-${i + 1}`,
      island: 'A',
      minX: Math.min(p0.x, p1.x) - 0.6,
      maxX: Math.max(p0.x, p1.x) + 0.6,
      minZ: Math.min(p0.z, p1.z) - 0.6,
      maxZ: Math.max(p0.z, p1.z) + 0.6,
      floorY: 0.16,
    });
  }
  const mergedZigZag = mergeGeometries(zigZags, false);
  for (const p of zigZags) p.dispose();
  rootGroup.add(new THREE.Mesh(mergedZigZag, stoneMat));

  // -------------------------------------------------------------
  // 5. ISLAND A: COURTYARD LEVEL (PLAZA, BELL TOWER, DRUM, PROPS)
  // -------------------------------------------------------------
  // Bell tower at (5.5, 0, -16.0)
  const { group: bellGroup, bellMesh } = createBellTowerGroup(materials);
  bellGroup.position.set(5.5, 0, -16.0);
  rootGroup.add(bellGroup);
  dynamicUpdaters.push((t) => {
    // Subtle idle swing of bronze bell
    bellMesh.rotation.z = Math.sin(t * 1.8) * 0.045;
  });

  platforms.push({
    id: 'bell-tower-base-platform',
    island: 'A',
    minX: 3.7,
    maxX: 7.3,
    minZ: -17.8,
    maxZ: -14.2,
    floorY: 0.22,
  });
  cylinders.push({
    id: 'bell-tower-body',
    kind: 'column',
    x: 5.5,
    z: -16.0,
    baseY: 0,
    height: 4.8,
    radius: 1.4,
  });

  // Ceremonial Drum on stand at (1.5, 0, 3.5)
  const drumGroup = createCeremonialDrumGroup(materials);
  drumGroup.position.set(1.5, 0, 3.5);
  drumGroup.rotation.y = -0.4;
  rootGroup.add(drumGroup);
  boxes.push({
    id: 'ceremonial-drum-box',
    kind: 'stand',
    minX: 0.6,
    maxX: 2.4,
    minZ: 2.6,
    maxZ: 4.4,
    baseY: 0,
    height: 2.4,
  });

  // Wooden notice board at (2.5, 0, 8.5)
  const noticeGroup = createNoticeBoardGroup(materials);
  noticeGroup.position.set(2.5, 0, 8.5);
  noticeGroup.rotation.y = Math.PI * 0.95;
  rootGroup.add(noticeGroup);
  boxes.push({
    id: 'notice-board-box',
    kind: 'stand',
    minX: 1.5,
    maxX: 3.5,
    minZ: 8.2,
    maxZ: 8.8,
    baseY: 0,
    height: 2.6,
  });

  // Incense burner at (0, 0, 5.5) with rising smoke
  const { group: incenseGroup, smokePoints } = createIncenseBurnerGroup(materials);
  incenseGroup.position.set(0, 0, 5.5);
  rootGroup.add(incenseGroup);
  dynamicUpdaters.push((t) => {
    const sPos = smokePoints.geometry.attributes.position as THREE.BufferAttribute;
    const count = sPos.count;
    for (let i = 0; i < count; i++) {
      let py = sPos.getY(i) + 0.015;
      if (py > 3.6) py = 0.9;
      sPos.setY(i, py);
      sPos.setX(i, Math.sin(t * 1.5 + py * 2.0) * 0.12);
      sPos.setZ(i, Math.cos(t * 1.3 + py * 1.8) * 0.10);
    }
    sPos.needsUpdate = true;
  });
  cylinders.push({
    id: 'incense-burner-collider',
    kind: 'column',
    x: 0,
    z: 5.5,
    baseY: 0,
    height: 1.4,
    radius: 0.44,
  });

  // Training Circle Inlay on plaza floor
  const trainingCircle = createTrainingCircleGroup();
  trainingCircle.position.set(-1.5, 0, 0);
  rootGroup.add(trainingCircle);

  // 4 Stone Lanterns around plaza courtyard
  const lanternCoords = [
    { x: 5.2, z: 5.2 },
    { x: -5.2, z: 5.2 },
    { x: 5.2, z: -5.2 },
    { x: -5.2, z: -5.2 },
  ];
  for (let i = 0; i < lanternCoords.length; i++) {
    const lc = lanternCoords[i]!;
    const { stone, lightCore } = createStoneLanternGeometry(2.4, 0.68);
    stone.translate(lc.x, 0, lc.z);
    lightCore.translate(lc.x, 0, lc.z);

    const sMesh = new THREE.Mesh(stone, stoneMat);
    sMesh.castShadow = true;
    const lMesh = new THREE.Mesh(lightCore, paperLanternMat);

    rootGroup.add(sMesh, lMesh);

    cylinders.push({
      id: `plaza-lantern-${i + 1}`,
      kind: 'lantern',
      x: lc.x,
      z: lc.z,
      baseY: 0,
      height: 2.4,
      radius: 0.36,
    });
  }

  // Refined Sealed Gate at (0, 0, -21)
  const gateColH = 5.6;
  const gateSpan = 4.2;
  const gateColParts: THREE.BufferGeometry[] = [];
  const gatePlinthParts: THREE.BufferGeometry[] = [];

  for (const dir of [-1, 1]) {
    const gx = dir * (gateSpan * 0.5);
    const plinth = createPlinthGeometry(0.9, 0.35);
    plinth.translate(gx, 0, -21);
    gatePlinthParts.push(plinth);

    const col = createEntasisColumnGeometry(gateColH, 0.32, 0.28, 1.08, 16);
    col.translate(gx, 0.32, -21);
    gateColParts.push(col);

    cylinders.push({
      id: `gate-col-${dir > 0 ? 'right' : 'left'}`,
      kind: 'column',
      x: gx,
      z: -21,
      baseY: 0,
      height: gateColH + 0.5,
      radius: 0.36,
    });
  }

  // Curved tiled lintel rooflet on Gate
  const gateRoof = createHipAndGableRoofGeometry(gateSpan + 2.2, 2.4, 0.6, 1.2, 0.38, 0.16, 20, 10);
  gateRoof.translate(0, 0.32 + gateColH, -21);
  rootGroup.add(new THREE.Mesh(gateRoof, roofMat));

  const mergedGatePlinths = mergeGeometries(gatePlinthParts, false);
  const mergedGateCols = mergeGeometries(gateColParts, false);
  for (const p of gatePlinthParts) p.dispose();
  for (const p of gateColParts) p.dispose();
  rootGroup.add(new THREE.Mesh(mergedGatePlinths, stoneMat));
  rootGroup.add(new THREE.Mesh(mergedGateCols, lacquerMat));

  // Luminous vertical light veil between gate columns (spans gx = -2.1 .. +2.1 so it touches both gate columns)
  const veilGeo = new THREE.PlaneGeometry(gateSpan, gateColH - 0.2);
  veilGeo.translate(0, (gateColH - 0.2) * 0.5 + 0.32, -21);
  const veilMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uColor: { value: new THREE.Color('#FFB27A') },
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
      varying vec2 vUv;
      void main() {
        float edgeX = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
        float edgeY = smoothstep(0.0, 0.10, vUv.y) * smoothstep(1.0, 0.90, vUv.y);
        float alpha = edgeX * edgeY * 0.55;
        if (alpha <= 0.01) discard;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
  });
  disposables.push(veilMat);
  rootGroup.add(new THREE.Mesh(veilGeo, veilMat));

  // Gate veil collision blockers
  for (let i = -1; i <= 1; i++) {
    cylinders.push({
      id: `gate-veil-${i + 2}`,
      kind: 'gate-veil',
      x: i * 1.05,
      z: -21,
      baseY: 0,
      height: gateColH,
      radius: 0.55,
    });
  }

  // -------------------------------------------------------------
  // 6. ISLAND B (STILL GARDEN): TWO-STOREY ARCHIVE PAVILION
  // -------------------------------------------------------------
  const archX = 64.0;
  const archY = -2.0;
  const archZ = -10.0;
  const archW = 12.0;
  const archD = 9.0;

  // Base platform
  const archBaseGeo = createAshlarTerraceBaseGeometry(archW + 1.2, archD + 1.2, 0.35, 0.14);
  archBaseGeo.translate(archX, archY, archZ);
  rootGroup.add(new THREE.Mesh(archBaseGeo, stoneMat));

  platforms.push({
    id: 'archive-pavilion-base',
    island: 'B',
    minX: archX - archW * 0.5,
    maxX: archX + archW * 0.5,
    minZ: archZ - archD * 0.5,
    maxZ: archZ + archD * 0.5,
    floorY: 0.35,
  });

  // Storey 1 & 2 columns supporting both archive roofs
  const archCols: THREE.BufferGeometry[] = [];
  const archColH = 3.6;
  for (const dx of [-archW * 0.45, archW * 0.45]) {
    for (const dz of [-archD * 0.45, archD * 0.45]) {
      const c1 = createEntasisColumnGeometry(archColH * 2 + 0.1, 0.20, 0.16, 1.06, 12);
      c1.translate(archX + dx, archY + 0.35, archZ + dz);
      archCols.push(c1);
      cylinders.push({
        id: `archive-col-${dx.toFixed(1)}-${dz.toFixed(1)}`,
        kind: 'column',
        x: archX + dx,
        z: archZ + dz,
        baseY: archY,
        height: archColH * 2 + 1.0,
        radius: 0.22,
      });
    }
  }

  // Storey 1 roof with balcony floor
  const archMidRoof = createHipAndGableRoofGeometry(archW + 1.2, archD + 1.2, 0.8, 1.4, 0.35, 0.14, 20, 14);
  archMidRoof.translate(archX, archY + 0.35 + archColH, archZ);
  rootGroup.add(new THREE.Mesh(archMidRoof, roofMat));

  // Storey 2 upper pavilion roof seated on upper columns
  const archTopRoof = createHipAndGableRoofGeometry(archW * 0.85, archD * 0.85, 1.1, 1.8, 0.55, 0.16, 20, 14);
  archTopRoof.translate(archX, archY + 0.35 + archColH * 2, archZ);
  rootGroup.add(new THREE.Mesh(archTopRoof, roofMat));

  const mergedArchCols = mergeGeometries(archCols, false);
  for (const p of archCols) p.dispose();
  rootGroup.add(new THREE.Mesh(mergedArchCols, lacquerMat));

  // -------------------------------------------------------------
  // 7. ISLAND C (FALLS OF LIGHT): SHRINE HALL & LOOKOUT PLATFORM
  // -------------------------------------------------------------
  const shrineX = 38.0;
  const shrineY = 1.0;
  const shrineZ = -52.0;
  const shrineW = 8.0;
  const shrineD = 6.0;
  const shrineColH = 3.4;

  const shrineBaseGeo = createAshlarTerraceBaseGeometry(shrineW + 0.8, shrineD + 0.8, 0.35, 0.12);
  shrineBaseGeo.translate(shrineX, shrineY, shrineZ);
  rootGroup.add(new THREE.Mesh(shrineBaseGeo, stoneMat));

  const shrineCols: THREE.BufferGeometry[] = [];
  for (const dx of [-shrineW * 0.42, shrineW * 0.42]) {
    for (const dz of [-shrineD * 0.42, shrineD * 0.42]) {
      const sc = createEntasisColumnGeometry(shrineColH + 0.08, 0.18, 0.15, 1.06, 12);
      sc.translate(shrineX + dx, shrineY + 0.35, shrineZ + dz);
      shrineCols.push(sc);
    }
  }
  const mergedShrineCols = mergeGeometries(shrineCols, false);
  for (const p of shrineCols) p.dispose();
  rootGroup.add(new THREE.Mesh(mergedShrineCols, lacquerMat));

  platforms.push({
    id: 'shrine-hall-base',
    island: 'C',
    minX: shrineX - shrineW * 0.5,
    maxX: shrineX + shrineW * 0.5,
    minZ: shrineZ - shrineD * 0.5,
    maxZ: shrineZ + shrineD * 0.5,
    floorY: 0.35,
  });

  const shrineRoof = createHipAndGableRoofGeometry(shrineW, shrineD, 1.2, 2.2, 0.65, 0.16, 22, 16);
  shrineRoof.translate(shrineX, shrineY + 0.35 + shrineColH, shrineZ);
  rootGroup.add(new THREE.Mesh(shrineRoof, roofMat));

  // Lookout platform at falls edge (33, 1, -64)
  const lookX = 33.0;
  const lookY = 1.0;
  const lookZ = -64.0;
  const lookDeck = createBeveledBoxGeometry(4.8, 0.28, 4.8, 0.03);
  lookDeck.translate(lookX, lookY, lookZ);
  rootGroup.add(new THREE.Mesh(lookDeck, stoneMat));

  platforms.push({
    id: 'lookout-platform',
    island: 'C',
    minX: lookX - 2.4,
    maxX: lookX + 2.4,
    minZ: lookZ - 2.4,
    maxZ: lookZ + 2.4,
    floorY: 0.14,
  });

  // Ring of 8 standing stones on Island C around (44, 1, -48)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const sx = 44.0 + Math.cos(a) * 4.2;
    const sz = -48.0 + Math.sin(a) * 4.2;
    const sStone = createBeveledBoxGeometry(0.55, 2.2, 0.45, 0.04);
    sStone.rotateY(a + 0.3);
    sStone.translate(sx, shrineY + 1.1, sz);
    rootGroup.add(new THREE.Mesh(sStone, stoneMat));

    cylinders.push({
      id: `standing-stone-${i + 1}`,
      kind: 'column',
      x: sx,
      z: sz,
      baseY: shrineY,
      height: 2.2,
      radius: 0.38,
    });
  }

  // Clean disposal method
  const dispose = () => {
    for (const d of disposables) d.dispose();
  };

  const update = (time: number, skyState: TimeOfDayState) => {
    for (const fn of dynamicUpdaters) {
      fn(time, skyState);
    }
  };

  return {
    group: rootGroup,
    colliders: {
      platforms,
      cylinders,
      boxes,
    },
    update,
    dispose,
  };
}
