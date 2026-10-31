import { useEffect, useRef, useState } from 'react';
import { Engine as BabylonEngine } from '@babylonjs/core/Engines/engine';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Scene } from '@babylonjs/core/scene';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import '@babylonjs/loaders/glTF';

function makeMaterial(
  scene: Scene,
  name: string,
  color: Color3,
  roughness = 0.82,
  metallic = 0,
): PBRMaterial {
  const material = new PBRMaterial(name, scene);
  material.albedoColor = color;
  material.roughness = roughness;
  material.metallic = metallic;
  return material;
}

function buildPreviewScene(engine: BabylonEngine): Scene {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.77, 0.83, 0.9, 1);
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.0024;
  scene.fogColor = new Color3(0.77, 0.83, 0.9);
  scene.environmentIntensity = 0.8;

  const camera = new ArcRotateCamera(
    'arkvoid-preview-camera',
    -Math.PI / 2.4,
    Math.PI / 3.1,
    38,
    new Vector3(0, 3, 0),
    scene,
  );
  camera.lowerRadiusLimit = 18;
  camera.upperRadiusLimit = 76;
  camera.lowerBetaLimit = 0.18;
  camera.upperBetaLimit = Math.PI * 0.48;
  camera.panningSensibility = 0;
  camera.wheelPrecision = 65;
  camera.pinchPrecision = 90;
  camera.attachControl(engine.getRenderingCanvas(), true);

  const ambient = new HemisphericLight(
    'arkvoid-sky-fill',
    new Vector3(0, 1, 0),
    scene,
  );
  ambient.intensity = 0.68;
  ambient.diffuse = new Color3(0.91, 0.94, 1);
  ambient.groundColor = new Color3(0.34, 0.35, 0.4);

  const sun = new DirectionalLight(
    'arkvoid-sun',
    new Vector3(-0.55, -1, 0.35),
    scene,
  );
  sun.position = new Vector3(28, 42, -24);
  sun.intensity = 2.1;
  sun.diffuse = new Color3(1, 0.86, 0.69);

  const shadowMapSize = window.matchMedia('(pointer: coarse)').matches ? 512 : 1024;
  const shadows = new ShadowGenerator(shadowMapSize, sun);
  shadows.usePercentageCloserFiltering = true;
  shadows.filteringQuality = ShadowGenerator.QUALITY_LOW;
  shadows.bias = 0.0005;

  const porcelain = makeMaterial(scene, 'warm-porcelain', new Color3(0.88, 0.86, 0.8), 0.58);
  const paleStone = makeMaterial(scene, 'pale-stone', new Color3(0.48, 0.46, 0.43), 0.92);
  const moss = makeMaterial(scene, 'living-moss', new Color3(0.19, 0.29, 0.19), 0.98);
  const roof = makeMaterial(scene, 'temple-roof', new Color3(0.22, 0.25, 0.29), 0.66);
  const gold = makeMaterial(scene, 'warm-metal', new Color3(0.7, 0.43, 0.18), 0.3, 0.68);
  const water = makeMaterial(scene, 'cloud-sea', new Color3(0.48, 0.62, 0.73), 0.18, 0.08);
  water.alpha = 0.82;

  const sea = MeshBuilder.CreateGround(
    'cloud-sea-surface',
    { width: 420, height: 420, subdivisions: 2 },
    scene,
  );
  sea.position.y = -21;
  sea.material = water;
  sea.receiveShadows = true;

  const island = MeshBuilder.CreateCylinder(
    'home-reach-floating-rock',
    { height: 9, diameterTop: 31, diameterBottom: 12, tessellation: 40 },
    scene,
  );
  island.position.y = -4.25;
  island.material = paleStone;
  island.receiveShadows = true;
  shadows.addShadowCaster(island);

  const islandTop = MeshBuilder.CreateDisc(
    'island-moss-cap',
    { radius: 15.25, tessellation: 64 },
    scene,
  );
  islandTop.rotation.x = Math.PI / 2;
  islandTop.position.y = 0.28;
  islandTop.material = moss;
  islandTop.receiveShadows = true;

  const foundation = MeshBuilder.CreateBox(
    'sanctuary-foundation',
    { width: 9.5, height: 0.8, depth: 8 },
    scene,
  );
  foundation.position.set(0, 0.85, -2);
  foundation.material = porcelain;
  foundation.receiveShadows = true;
  shadows.addShadowCaster(foundation);

  const hall = MeshBuilder.CreateBox(
    'sanctuary-hall',
    { width: 6.8, height: 5.1, depth: 5.2 },
    scene,
  );
  hall.position.set(0, 3.65, -2);
  hall.material = porcelain;
  hall.receiveShadows = true;
  shadows.addShadowCaster(hall);

  const roofCap = MeshBuilder.CreateCylinder(
    'sanctuary-roof',
    { height: 1.25, diameterTop: 4.5, diameterBottom: 9.4, tessellation: 4 },
    scene,
  );
  roofCap.rotation.y = Math.PI / 4;
  roofCap.position.set(0, 6.82, -2);
  roofCap.material = roof;
  roofCap.receiveShadows = true;
  shadows.addShadowCaster(roofCap);

  const roofEdge = MeshBuilder.CreateBox(
    'sanctuary-eave',
    { width: 10.3, height: 0.22, depth: 8.5 },
    scene,
  );
  roofEdge.position.set(0, 6.15, -2);
  roofEdge.material = gold;
  shadows.addShadowCaster(roofEdge);

  const columns = [
    [-3.65, -4.45],
    [3.65, -4.45],
    [-3.65, 0.45],
    [3.65, 0.45],
  ] as const;
  for (let i = 0; i < columns.length; i += 1) {
    const [x, z] = columns[i]!;
    const column = MeshBuilder.CreateCylinder(
      'sanctuary-column',
      { height: 5, diameter: 0.58, tessellation: 16 },
      scene,
    );
    column.position.set(x, 3.5, z);
    column.material = porcelain;
    column.receiveShadows = true;
    shadows.addShadowCaster(column);
  }

  const stair = MeshBuilder.CreateBox(
    'sanctuary-approach',
    { width: 4.4, height: 0.3, depth: 5 },
    scene,
  );
  stair.position.set(0, 0.92, 4.1);
  stair.material = porcelain;
  stair.receiveShadows = true;

  const waterPillars = [
    [-10.5, 0.4, 5.2],
    [10.5, 0.4, 5.2],
    [-9.5, 0.4, -9],
    [9.5, 0.4, -9],
  ] as const;
  for (const [x, y, z] of waterPillars) {
    const pillar = MeshBuilder.CreateCylinder(
      'island-ward-pillar',
      { height: 1.8, diameter: 0.38, tessellation: 12 },
      scene,
    );
    pillar.position.set(x, y, z);
    pillar.material = porcelain;
  }

  const clouds: ReturnType<typeof MeshBuilder.CreateSphere>[] = [];
  const cloudMaterial = makeMaterial(
    scene,
    'high-cloud-pearl',
    new Color3(0.93, 0.95, 0.97),
    1,
  );
  const cloudPositions = [
    [-31, 3, 15, 5.5],
    [-23, 5, 19, 6.2],
    [-14, 2, 21, 4.8],
    [22, 1, 14, 5.8],
    [31, 4, 17, 6.5],
    [40, 2, 13, 4.5],
    [-36, -2, -17, 6.5],
    [-25, 1, -22, 5.4],
    [25, -1, -20, 6.1],
    [36, 2, -17, 5.1],
  ] as const;
  for (const [x, y, z, diameter] of cloudPositions) {
    const cloud = MeshBuilder.CreateSphere(
      'distant-cloud-bank',
      { diameter, segments: 10 },
      scene,
    );
    cloud.position.set(x, y, z);
    cloud.material = cloudMaterial;
    cloud.isPickable = false;
    clouds.push(cloud);
  }

  const farIslands = [
    [-54, -3, -45, 13],
    [53, -5, -48, 16],
    [-72, -8, 24, 18],
    [75, -7, 28, 17],
  ] as const;
  for (const [x, y, z, size] of farIslands) {
    const distant = MeshBuilder.CreateCylinder(
      'distant-floating-island',
      { height: size * 0.45, diameterTop: size, diameterBottom: size * 0.3, tessellation: 18 },
      scene,
    );
    distant.position.set(x, y, z);
    distant.material = paleStone;
    distant.isPickable = false;
  }

  const treeLocations = [
    [-10, -4], [-7.8, 7.5], [8.5, 7.2], [11, -4.6], [-13, 1.8], [13, 1.4],
  ] as const;
  for (let i = 0; i < treeLocations.length; i += 1) {
    const [x, z] = treeLocations[i]!;
    const trunk = MeshBuilder.CreateCylinder(
      'sanctuary-tree-trunk',
      { height: 3.3, diameterTop: 0.28, diameterBottom: 0.48, tessellation: 8 },
      scene,
    );
    trunk.position.set(x, 1.95, z);
    trunk.material = roof;

    const canopy = MeshBuilder.CreateSphere(
      'sanctuary-tree-canopy',
      { diameter: 3.8, segments: 10 },
      scene,
    );
    canopy.position.set(x, 4, z);
    canopy.scaling.y = 0.82;
    canopy.material = moss;
    canopy.isPickable = false;
  }

  const lantern = MeshBuilder.CreateTorus(
    'sanctuary-breath-ring',
    { diameter: 1.2, thickness: 0.12, tessellation: 32 },
    scene,
  );
  lantern.position.set(0, 2.15, 4.35);
  lantern.rotation.x = Math.PI / 2;
  lantern.material = gold;

  return scene;
}

export default function BabylonWorldPreview() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let engine: BabylonEngine | null = null;
    let scene: Scene | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let disposed = false;

    const render = () => {
      if (!disposed && scene && !scene.isDisposed()) {
        scene.render();
      }
    };

    try {
      const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
      engine = new BabylonEngine(canvas, true, {
        antialias: !isTouchDevice,
        stencil: false,
        preserveDrawingBuffer: false,
        powerPreference: 'high-performance',
        adaptToDeviceRatio: false,
      });
      const maxDpr = isTouchDevice ? 1.5 : 2;
      engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, maxDpr));
      scene = buildPreviewScene(engine);

      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => engine?.resize());
        resizeObserver.observe(canvas);
      } else {
        window.addEventListener('resize', onResize);
      }

      document.addEventListener('visibilitychange', onVisibilityChange);
      engine.runRenderLoop(render);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Babylon.js could not initialise WebGL.';
      setBootError(message);
    }

    function onResize() {
      engine?.resize();
    }

    function onVisibilityChange() {
      if (!engine) return;
      if (document.hidden) {
        engine.stopRenderLoop(render);
      } else {
        engine.runRenderLoop(render);
      }
    }

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('resize', onResize);
      resizeObserver?.disconnect();
      if (engine) engine.stopRenderLoop(render);
      scene?.dispose();
      engine?.dispose();
    };
  }, []);

  return (
    <main className="fixed inset-0 overflow-hidden bg-[#e3e8ef]">
      <canvas
        ref={canvasRef}
        aria-label="Arkvoid Babylon.js world preview"
        className="absolute inset-0 h-full w-full outline-none"
        style={{ touchAction: 'none' }}
      />
      <div className="pointer-events-none absolute left-4 top-4 rounded-2xl border border-white/55 bg-white/65 px-4 py-3 text-ink shadow-lg backdrop-blur-xl">
        <div className="font-serif text-lg">Arkvoid · Babylon Runtime</div>
        <div className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-ink/55">
          Celestial Frontier / Engine preview
        </div>
      </div>
      <a
        href="/"
        className="absolute right-4 top-4 rounded-full border border-white/60 bg-white/70 px-4 py-2 text-xs font-medium text-ink shadow-lg backdrop-blur-xl"
      >
        Return
      </a>
      {bootError && (
        <div
          role="alert"
          className="absolute bottom-4 left-4 right-4 rounded-xl border border-red-300 bg-white/95 p-4 text-xs text-red-800 shadow-xl"
        >
          Babylon runtime failed to start: {bootError}
        </div>
      )}
    </main>
  );
}
