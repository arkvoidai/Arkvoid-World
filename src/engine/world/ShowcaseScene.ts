import * as THREE from 'three';
import { disposeObject3D } from '@/engine/core/Disposables';
import type { EngineContext, System } from '@/engine/core/Engine';
import { Atmosphere } from '@/engine/fx/Atmosphere';
import { CloudSea } from '@/engine/world/CloudSea';
import { IslandLandformMesh } from '@/engine/world/IslandMesh';
import { DistantSpires } from '@/engine/world/Spires';
import { LightRig } from '@/engine/world/LightRig';
import { WorldMaterialBank } from '@/engine/world/materials';
import { MaterialLibrary } from '@/engine/world/MaterialLibrary';
import {
  createSectArchitecture,
  type SectArchitectureInstance,
} from '@/engine/world/SectArchitecture';
import { createStoneArchBridgesGroup } from '@/engine/world/kit/bridges';
import { createBreathPool } from '@/engine/world/PropsAndBridges';
import { WindSystem } from '@/engine/fx/Wind';
import { GrassSystem } from '@/engine/fx/Grass';
import { FlowerSystem } from '@/engine/fx/Flowers';
import { TreeSystem } from '@/engine/world/Trees';
import { RockSystem } from '@/engine/world/Rocks';
import { WaterSystem } from '@/engine/world/Water';
import { LifeSystem } from '@/engine/fx/Life';
import { REVIEW_SHOTS } from '@/engine/world/reviewShots';
import { SkyDome } from '@/engine/world/SkyDome';
import {
  createTimeOfDayState,
  type TimeOfDayState,
  timeOfDayState,
} from '@/engine/world/sky';
import { hourNow, REVIEW_HOURS, setHourOverride } from '@/lib/worldClock';

export class ShowcaseWorldSystem implements System {
  readonly id = 'world-showcase';
  readonly priority = 10;

  private sceneRef: THREE.Scene | null = null;
  private skyDome: SkyDome | null = null;
  private cloudSea: CloudSea | null = null;
  private materialBank: WorldMaterialBank | null = null;
  private materialLibrary: MaterialLibrary | null = null;
  private sectArch: SectArchitectureInstance | null = null;
  private lightRig: LightRig | null = null;
  private atmosphere: Atmosphere | null = null;
  private worldGroup: THREE.Group | null = null;
  private islands: IslandLandformMesh[] = [];
  private spires: DistantSpires | null = null;
  private plazaInlayMat: THREE.MeshBasicMaterial | null = null;
  private fog: THREE.Fog | null = null;

  private wind: WindSystem | null = null;
  private rocks: RockSystem | null = null;
  private water: WaterSystem | null = null;
  private trees: TreeSystem | null = null;
  private flowers: FlowerSystem | null = null;
  private grass: GrassSystem | null = null;
  private life: LifeSystem | null = null;

  private readonly skyState: TimeOfDayState = createTimeOfDayState();
  private readonly defaultLookTarget = new THREE.Vector3(6, 2, -4);
  private readonly activeLookTarget = new THREE.Vector3(6, 2, -4);
  private lastFogSyncHour = -999;
  private orbitAngle = 1.18;
  private reviewShotIndex: number | null = null;
  private forceNextSkySync = false;
  private unsubCommand: (() => void) | null = null;

  buildTimeMs = 0;

  constructor(initialReviewMode = false) {
    if (initialReviewMode) {
      this.reviewShotIndex = 0;
    }
  }

  setReviewShot(shotIndex: number | null): void {
    if (shotIndex === null) {
      this.reviewShotIndex = null;
      return;
    }
    const count = REVIEW_SHOTS.length;
    this.reviewShotIndex = ((shotIndex % count) + count) % count;
  }

  getReviewShot(): number | null {
    return this.reviewShotIndex;
  }

  init(ctx: EngineContext): void {
    this.dispose();
    this.sceneRef = ctx.scene;

    const t0 = performance.now();

    // If booting in ?shots=1 without an explicit ?time= parameter, start at REVIEW_HOURS[0] (6.5 Dawn)
    if (this.reviewShotIndex !== null && typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (!params.has('time')) {
        setHourOverride(REVIEW_HOURS[0]);
      }
    }

    const initialHour = hourNow();
    ctx.bridge.mutable.hour = initialHour;
    timeOfDayState(initialHour, this.skyState);

    // Height & distance fog with near / far from Time-of-Day table v2
    this.fog = new THREE.Fog(
      this.skyState.fog.getHex(),
      this.skyState.fogNear,
      this.skyState.fogFar,
    );
    ctx.scene.fog = this.fog;

    // 1. Preetham Sky + Inverted Cloud Dome
    this.skyDome = new SkyDome(ctx.device);
    this.skyDome.forceSync(this.skyState);
    ctx.scene.add(this.skyDome.mesh);

    this.cloudSea = new CloudSea(ctx.device);
    ctx.scene.add(this.cloudSea.group);

    // 2. Shared Material Bank
    this.materialBank = new WorldMaterialBank(ctx.device, ctx.assets);

    // 3. LightRig (Key, Fill, Hemisphere, CSM/shadow maps)
    this.lightRig = new LightRig(
      ctx.renderer,
      ctx.scene,
      ctx.device,
      this.skyState,
      ctx.camera,
    );

    // 4. Islands, bridges, and architecture in natural palette
    this.worldGroup = new THREE.Group();
    this.worldGroup.name = 'ArkvoidIslandsAndArchitecture';

    const islandKeys = ['A', 'B', 'C', 'S'] as const;
    const isPhone = ctx.device.deviceClass === 'phone';
    for (const key of islandKeys) {
      const landform = new IslandLandformMesh(key, ctx.assets, {
        isPhone,
      });
      this.islands.push(landform);
      this.worldGroup.add(landform);
    }

    // Plaza Inlay Rings on Island A (concentric rings + 12 radial rays)
    this.plazaInlayMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#FFA040'),
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    });
    const plazaInlays = new THREE.Group();
    const ringRadii = [3.8, 6.2, 8.4];
    for (const r of ringRadii) {
      const ringGeo = new THREE.RingGeometry(r - 0.04, r + 0.04, 64);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMesh = new THREE.Mesh(ringGeo, this.plazaInlayMat);
      ringMesh.position.set(0, 0.02, 0);
      plazaInlays.add(ringMesh);
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const rayGeo = new THREE.PlaneGeometry(0.06, 7.2);
      rayGeo.rotateX(-Math.PI / 2);
      rayGeo.rotateY(a);
      const rayMesh = new THREE.Mesh(rayGeo, this.plazaInlayMat);
      rayMesh.position.set(Math.sin(a) * 4.8, 0.02, Math.cos(a) * 4.8);
      plazaInlays.add(rayMesh);
    }
    this.worldGroup.add(plazaInlays);

    this.materialLibrary = new MaterialLibrary(ctx.assets);
    this.sectArch = createSectArchitecture(this.materialLibrary, isPhone);
    this.worldGroup.add(this.sectArch.group);
    this.worldGroup.add(createStoneArchBridgesGroup(this.materialLibrary));
    this.worldGroup.add(createBreathPool(this.materialBank));

    // 5. Living Nature & Water Systems
    this.wind = new WindSystem();

    this.rocks = new RockSystem(ctx.assets);
    this.worldGroup.add(this.rocks);

    this.water = new WaterSystem(isPhone, ctx.assets);
    this.worldGroup.add(this.water);

    this.trees = new TreeSystem(this.wind.uniforms, ctx.assets, isPhone);
    this.worldGroup.add(this.trees);

    this.flowers = new FlowerSystem(this.wind.uniforms, isPhone);
    this.worldGroup.add(this.flowers);

    const tierKey = ctx.device.deviceClass === 'desktop'
      ? (ctx.device.gpuTier >= 2 ? 'desktop-high' : 'desktop-mid')
      : (ctx.device.gpuTier >= 2 ? 'phone-high' : 'phone-mid');
    this.grass = new GrassSystem(this.wind.uniforms, tierKey);
    this.worldGroup.add(this.grass);

    this.life = new LifeSystem(isPhone);
    this.worldGroup.add(this.life);

    // 5. Distant Floating Spires
    this.spires = new DistantSpires(isPhone, ctx.assets);
    ctx.scene.add(this.spires);

    // Enable shadows across solid architectural meshes
    if (this.lightRig.shadowTier !== 'none') {
      this.worldGroup.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          const mat = m.material as THREE.Material;
          if (!mat.transparent) {
            m.castShadow = true;
            m.receiveShadow = true;
          }
        }
      });
    }

    ctx.scene.add(this.worldGroup);

    // 5. Atmosphere
    this.atmosphere = new Atmosphere(ctx.device);
    ctx.scene.add(this.atmosphere.group);

    // Command listener
    this.unsubCommand = ctx.events.on('command', (cmd) => {
      if (cmd.type === 'setReviewShot') {
        this.setReviewShot(cmd.shotIndex);
      } else if (cmd.type === 'setHourOverride') {
        this.forceNextSkySync = true;
      }
    });

    this.updateShowcaseCamera(0, ctx);
    this.syncFog(true);
    this.lightRig.update(
      0,
      ctx.clock.elapsed,
      ctx.renderer,
      ctx.scene,
      this.skyState,
      this.activeLookTarget,
      true,
    );
    this.materialBank.update(
      this.skyState,
      ctx.clock.elapsed,
      ctx.device.reducedMotion,
      true,
    );
    this.atmosphere.update(
      0,
      ctx.clock.elapsed,
      ctx.camera,
      ctx.renderer,
      this.skyState,
      ctx.device.reducedMotion,
      true,
    );
    for (let i = 0; i < this.islands.length; i++) {
      this.islands[i]!.syncSky(this.skyState, ctx.clock.elapsed);
    }
    this.spires?.syncSky(this.skyState);

    this.buildTimeMs = Math.round((performance.now() - t0) * 100) / 100;
  }

  update(dt: number, ctx: EngineContext): void {
    const currentHour = hourNow();
    ctx.bridge.mutable.hour = currentHour;

    const force = this.forceNextSkySync;
    this.forceNextSkySync = false;

    timeOfDayState(currentHour, this.skyState);
    this.syncFog(force);

    this.updateShowcaseCamera(dt, ctx);

    const elapsed = ctx.clock.elapsed;
    const reduced = ctx.device.reducedMotion;

    this.lightRig?.update(
      dt,
      elapsed,
      ctx.renderer,
      ctx.scene,
      this.skyState,
      this.activeLookTarget,
      force,
    );

    if (force) {
      this.skyDome?.forceSync(this.skyState);
    } else {
      this.skyDome?.update(
        this.skyState,
        elapsed,
        ctx.camera.position,
        reduced,
      );
    }

    this.cloudSea?.update(this.skyState, elapsed, ctx.camera, reduced);
    this.materialBank?.update(this.skyState, elapsed, reduced, force);
    this.materialBank?.updateTextures(ctx.assets);
    this.materialLibrary?.update();
    this.sectArch?.update(elapsed, this.skyState);
    this.atmosphere?.update(
      dt,
      elapsed,
      ctx.camera,
      ctx.renderer,
      this.skyState,
      reduced,
      force,
    );

    for (let i = 0; i < this.islands.length; i++) {
      this.islands[i]!.syncSky(this.skyState, elapsed);
      this.islands[i]!.terrainMaterial.updateTextures(ctx.assets);
    }
    this.spires?.syncSky(this.skyState);

    // Living Nature & Water updates
    this.wind?.update(dt, elapsed, this.skyState, reduced);
    this.water?.update(dt, elapsed, this.skyState);
    this.trees?.update(dt, elapsed, ctx.camera.position, this.skyState);
    this.grass?.update(dt, elapsed, ctx.camera, this.activeLookTarget, this.skyState);
    this.life?.update(dt, elapsed, this.skyState);

    ctx.bridge.mutable.natureStats = {
      grass: this.grass?.visibleBladeCount || 0,
      flowers: this.flowers?.totalFlowerCount || 0,
      trees: this.trees?.totalTreeCount || 0,
      particles: (this.atmosphere ? 140 : 0) + (this.life ? 300 : 0),
    };

    // Update Plaza Inlays emissive glow with sky state
    if (this.plazaInlayMat) {
      const h = this.skyState.hour;
      const isNightOrDusk = h >= 18.0 || h < 6.0;
      const orange = new THREE.Color('#FFA040');
      const purple = new THREE.Color('#B9A6FF');
      const blend = h >= 17.5 && h <= 19.5 ? (h - 17.5) / 2.0 : isNightOrDusk ? 1.0 : 0.0;
      this.plazaInlayMat.color.copy(orange).lerp(purple, blend);
      this.plazaInlayMat.opacity = isNightOrDusk ? 0.90 : 0.40;
    }

    // Sync composer grading uniforms with current sky state
    ctx.presenter.updateSky?.(this.skyState, elapsed);
  }

  private syncFog(force: boolean): void {
    const rawDiff = Math.abs(this.skyState.hour - this.lastFogSyncHour);
    const wrappedDiff =
      this.lastFogSyncHour < 0 ? Infinity : Math.min(rawDiff, 24 - rawDiff);
    if (!force && wrappedDiff < 0.01) return;
    this.lastFogSyncHour = this.skyState.hour;

    if (this.fog) {
      this.fog.color.copy(this.skyState.fog);
      this.fog.near = this.skyState.fogNear;
      this.fog.far = this.skyState.fogFar;
    }
  }

  private updateShowcaseCamera(dt: number, ctx: EngineContext): void {
    if (this.reviewShotIndex !== null) {
      const shot = REVIEW_SHOTS[this.reviewShotIndex] ?? REVIEW_SHOTS[0]!;
      const targetFov = shot.fov ?? 52;
      if (Math.abs(ctx.camera.fov - targetFov) > 0.05) {
        ctx.camera.fov = targetFov;
        ctx.camera.updateProjectionMatrix();
      }
      ctx.camera.position.set(
        shot.position[0],
        shot.position[1],
        shot.position[2],
      );
      this.activeLookTarget.set(shot.target[0], shot.target[1], shot.target[2]);
      ctx.camera.lookAt(this.activeLookTarget);
      return;
    }

    if (Math.abs(ctx.camera.fov - 52) > 0.05) {
      ctx.camera.fov = 52;
      ctx.camera.updateProjectionMatrix();
    }

    const radius = 52;
    const baseHeight = 9;
    const angularSpeed = ctx.device.reducedMotion ? 0 : 0.03;

    this.orbitAngle += dt * angularSpeed;
    const driftY = ctx.device.reducedMotion
      ? 0
      : Math.sin(ctx.clock.elapsed * 0.35) * 0.6;

    this.activeLookTarget.copy(this.defaultLookTarget);
    ctx.camera.position.set(
      this.activeLookTarget.x + Math.cos(this.orbitAngle) * radius,
      baseHeight + driftY,
      this.activeLookTarget.z + Math.sin(this.orbitAngle) * radius,
    );
    ctx.camera.lookAt(this.activeLookTarget);
  }

  dispose(): void {
    if (this.unsubCommand) {
      this.unsubCommand();
      this.unsubCommand = null;
    }
    if (this.skyDome) {
      this.skyDome.mesh.removeFromParent();
      this.skyDome.dispose();
      this.skyDome = null;
    }
    if (this.cloudSea) {
      this.cloudSea.group.removeFromParent();
      this.cloudSea.dispose();
      this.cloudSea = null;
    }
    if (this.atmosphere) {
      this.atmosphere.dispose();
      this.atmosphere = null;
    }
    if (this.grass) {
      this.grass.dispose();
      this.grass = null;
    }
    if (this.flowers) {
      this.flowers.dispose();
      this.flowers = null;
    }
    if (this.trees) {
      this.trees.dispose();
      this.trees = null;
    }
    if (this.rocks) {
      this.rocks.dispose();
      this.rocks = null;
    }
    if (this.water) {
      this.water.dispose();
      this.water = null;
    }
    if (this.life) {
      this.life.dispose();
      this.life = null;
    }
    if (this.wind) {
      this.wind.dispose();
      this.wind = null;
    }
    if (this.worldGroup) {
      disposeObject3D(this.worldGroup);
      this.worldGroup = null;
    }
    if (this.spires) {
      this.spires.removeFromParent();
      this.spires.dispose();
      this.spires = null;
    }
    if (this.plazaInlayMat) {
      this.plazaInlayMat.dispose();
      this.plazaInlayMat = null;
    }
    for (let i = 0; i < this.islands.length; i++) {
      this.islands[i]!.dispose();
    }
    this.islands = [];
    if (this.lightRig && this.sceneRef) {
      this.lightRig.dispose(this.sceneRef);
      this.lightRig = null;
    }
    if (this.materialBank) {
      this.materialBank.dispose();
      this.materialBank = null;
    }
    if (this.sectArch) {
      this.sectArch.dispose();
      this.sectArch = null;
    }
    if (this.materialLibrary) {
      this.materialLibrary.dispose();
      this.materialLibrary = null;
    }
    this.fog = null;
    this.sceneRef = null;
  }
}
