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
import { FarMountainRanges } from '@/engine/world/FarMountainRanges';
import { DiscoveryTracker, discoverableAreaAt } from '@/engine/world/atlas';
import { WeatherController } from '@/engine/world/sky/Weather';
import { worldMinute } from '@/lib/worldClock';
import { discoverArea, getAreas, getDiscoveredAreas } from '@/net/api';
import { BUILT_AREAS } from '@/engine/world/atlas/Atlas';
import { log } from '@/lib/log';
import { WorldExpansionInspector } from '@/engine/world/atlas/AtlasInspector';
import {
  createTimeOfDayState,
  type TimeOfDayState,
  timeOfDayState,
} from '@/engine/world/sky';
import { hourNow, REVIEW_HOURS, setHourOverride } from '@/lib/worldClock';
import { CameraRailController, BUILT_IN_RAILS } from '@/engine/core/CameraRail';
import { BenchmarkSession, BENCHMARK_RAIL } from '@/engine/core/Benchmark';
import { Wanderer, type FormId, type LeaningId } from '@/engine/actors/Wanderer';
import { WandererPool } from '@/engine/actors/WandererPool';
import {
  PlayerController,
  InputManager,
  CameraRig,
  InteractablesSystem,
  type InputState,
} from '@/engine/locomotion';
import { ActorsLineup } from '@/engine/actors/ActorsLineup';
import { heightAt } from '@/engine/world/collision';
import { useGameStore } from '@/state/game';
import { positionSaver } from '@/net/positionSaver';

declare global {
  interface Window {
    __ARKVOID_WALK_TEST__?: {
      passed: boolean;
      duration: number;
      maxStuckDurationSec: number;
      penetrationFrames: number;
      totalFrames: number;
      report: string;
    };
  }
}

export interface ShowcaseSystemOptions {
  reviewShots?: boolean;
  actorsLineup?: boolean;
  playerForm?: FormId;
  playerLeaning?: LeaningId;
}

export class ShowcaseWorldSystem implements System {
  readonly id = 'world-showcase';
  readonly priority = 10;

  private sceneRef: THREE.Scene | null = null;
  private skyDome: SkyDome | null = null;
  private cloudSea: CloudSea | null = null;
  private farMountains: FarMountainRanges | null = null;
  private discoveryTracker: DiscoveryTracker | null = null;
  private expansionInspector: WorldExpansionInspector | null = null;
  private readonly weatherController = new WeatherController();
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

  // Wanderer Actors, Locomotion & Player
  private wandererPool: WandererPool | null = null;
  private playerController: PlayerController | null = null;
  private inputManager: InputManager | null = null;
  private cameraRig: CameraRig | null = null;
  private interactables: InteractablesSystem | null = null;
  private actorsLineup: ActorsLineup | null = null;
  readonly isActorsMode: boolean = false;
  playerForm: FormId = 0;
  playerLeaning: LeaningId = 'dawn';
  hasStartedLocomotion = false;
  private localPlayer: Wanderer | null = null;
  private previewWanderer: Wanderer | null = null;
  private viewMode: 'gate' | 'awakening' | 'arrival' | 'world' = 'gate';
  private awakenPulseMesh: THREE.Mesh | null = null;
  private awakenPulseTimer = -1;
  private targetHour: number | null = null;
  private currentHourSmooth: number = 18.3; // golden hour on first sight
  private arrivalShortened = false;
  private isWalkTest = false;
  private walkTestTimer = 0;
  private walkTestWaypointIndex = 0;
  private readonly walkTestLastPosition = new THREE.Vector3();
  private walkTestStuckDuration = 0;
  private walkTestMaxStuckDuration = 0;
  private walkTestPenetrationFrames = 0;
  private walkTestTotalFrames = 0;
  private readonly syntheticInput: InputState = {
    moveX: 0,
    moveY: 0,
    lookDeltaYaw: 0,
    lookDeltaPitch: 0,
    run: false,
    interact: false,
    cancel: false,
  };
  private readonly activeInput: InputState = {
    moveX: 0,
    moveY: 0,
    lookDeltaYaw: 0,
    lookDeltaPitch: 0,
    run: false,
    interact: false,
    cancel: false,
  };

  private static readonly WALK_TEST_WAYPOINTS: readonly THREE.Vector3[] = [
    new THREE.Vector3(0, 0, 10),
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(-4.5, 0.35, -7.5),
    new THREE.Vector3(-9.0, 0.05, -3.0),
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(5.5, 0.22, -15.0),
    new THREE.Vector3(2.0, 0, -6.0),
    new THREE.Vector3(7.2, 2.2, -6.0),
    new THREE.Vector3(12.0, 2.45, -6.0),
    new THREE.Vector3(7.2, 2.2, -6.0),
    new THREE.Vector3(2.0, 0, -6.0),
    new THREE.Vector3(0, 0, 14),
  ];

  private readonly skyState: TimeOfDayState = createTimeOfDayState();
  private readonly defaultLookTarget = new THREE.Vector3(6, 2, -4);
  private readonly activeLookTarget = new THREE.Vector3(6, 2, -4);
  private lastFogSyncHour = -999;
  private orbitAngle = 1.18;
  private reviewShotIndex: number | null = null;
  private forceNextSkySync = false;
  private unsubCommand: (() => void) | null = null;

  buildTimeMs = 0;
  readonly railController = new CameraRailController();
  private benchmarkSession: BenchmarkSession | null = null;

  constructor(options: ShowcaseSystemOptions | boolean = false) {
    if (typeof options === 'boolean') {
      if (options) {
        this.reviewShotIndex = 0;
      }
    } else {
      if (options.reviewShots) {
        this.reviewShotIndex = 0;
      }
      this.isActorsMode = Boolean(options.actorsLineup);
      if (options.playerForm !== undefined) {
        this.playerForm = options.playerForm;
      }
      if (options.playerLeaning !== undefined) {
        this.playerLeaning = options.playerLeaning;
      }
    }

    // Also inspect URL query params if in browser
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('actors') === '1') {
        this.isActorsMode = true;
      }
      const fParam = params.get('form');
      if (fParam !== null) {
        const parsed = parseInt(fParam, 10);
        if (parsed >= 0 && parsed <= 3) {
          this.playerForm = parsed as FormId;
        }
      }
      const lParam = params.get('leaning');
      if (lParam === 'dawn' || lParam === 'dusk' || lParam === 'still') {
        this.playerLeaning = lParam;
      }
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

  getBenchmarkSession(): BenchmarkSession | null {
    return this.benchmarkSession;
  }

  getTrees(): TreeSystem | null {
    return this.trees;
  }

  getSectArch(): SectArchitectureInstance | null {
    return this.sectArch;
  }

  getMaterialLibrary(): MaterialLibrary | null {
    return this.materialLibrary;
  }

  getPlayerController(): PlayerController | null {
    return this.playerController;
  }

  getInputManager(): InputManager | null {
    return this.inputManager;
  }

  getCameraRig(): CameraRig | null {
    return this.cameraRig;
  }

  getInteractables(): InteractablesSystem | null {
    return this.interactables;
  }

  getWandererPool(): WandererPool | null {
    return this.wandererPool;
  }

  getActorsLineup(): ActorsLineup | null {
    return this.actorsLineup;
  }

  getWorldGroup(): THREE.Group | null {
    return this.worldGroup;
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

    // Dev preview query: ?rail=arrival|orbit|bridge-cross or ?bench=1
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const railParam = params.get('rail');
      const benchParam = params.get('bench');
      if (benchParam === '1') {
        this.railController.play(BENCHMARK_RAIL, { loop: false });
        this.benchmarkSession = new BenchmarkSession(ctx.device, 0, 'balanced');
      } else if (railParam && BUILT_IN_RAILS[railParam]) {
        this.railController.play(BUILT_IN_RAILS[railParam]!, { loop: true });
      }
      if (params.get('walk') === '1') {
        this.isWalkTest = true;
        this.hasStartedLocomotion = true;
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

    // Distant non-walkable terrain frames the existing Home Reach without changing its collision.
    this.farMountains = new FarMountainRanges(ctx.device.deviceClass === 'phone');
    ctx.scene.add(this.farMountains);

    // Load remote discoveries before dwell tracking so returning players are not rediscovered.
    this.discoveryTracker = new DiscoveryTracker(3, [], false);
    void getDiscoveredAreas().then((result) => {
      if (result.ok) this.discoveryTracker?.seedDiscovered(result.data);
      else this.discoveryTracker?.markReady();
    }).catch(() => this.discoveryTracker?.markReady());

    // Missing built Atlas rows are non-fatal and produce one diagnostic line.
    void getAreas().then((result) => {
      if (!result.ok) return;
      const remoteIds = new Set(result.data.map((area) => area.id));
      const missing = BUILT_AREAS.filter((area) => !remoteIds.has(area.id)).map((area) => area.id);
      if (missing.length > 0) log.error('Built Atlas areas missing from Supabase:', missing.join(', '));
    }).catch(() => log.error('Built Atlas area validation could not reach Supabase'));

    this.expansionInspector = WorldExpansionInspector.create();

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

    this.flowers = new FlowerSystem(this.wind.uniforms, isPhone, ctx.assets);
    this.worldGroup.add(this.flowers);

    const tierKey = ctx.device.deviceClass === 'desktop'
      ? (ctx.device.gpuTier >= 2 ? 'desktop-high' : 'desktop-mid')
      : (ctx.device.gpuTier >= 2 ? 'phone-high' : 'phone-mid');
    this.grass = new GrassSystem(this.wind.uniforms, tierKey);
    this.worldGroup.add(this.grass);

    this.life = new LifeSystem(isPhone);
    this.worldGroup.add(this.life);

    // 6. Characters, Residents & Crowd Pool
    this.wandererPool = new WandererPool(ctx.device);
    this.worldGroup.add(this.wandererPool.group);

    // Spawn 4 World Residents
    const hale = this.wandererPool.spawn('hale', { resident: 'hale' });
    hale.position.set(12, heightAt(12, -6) ?? 0, -6);
    hale.rotation.y = -Math.PI / 4;
    hale.setAnimationState('sit-meditate');

    const ione = this.wandererPool.spawn('ione', { resident: 'ione' });
    ione.position.set(60, heightAt(60, -8) ?? -2, -8);
    ione.rotation.y = Math.PI / 2;
    ione.setAnimationState('idle');

    const tamsin = this.wandererPool.spawn('tamsin', { resident: 'tamsin' });
    tamsin.position.set(0, heightAt(0, 8) ?? 0, 8);
    tamsin.rotation.y = Math.PI;
    tamsin.setAnimationState('walk');

    const corvin = this.wandererPool.spawn('corvin', { resident: 'corvin' });
    corvin.position.set(6, heightAt(6, -17) ?? 0, -17);
    corvin.rotation.y = -Math.PI / 2;
    corvin.setAnimationState('idle');

    // Local Player Character (at saved position if available, else SPAWN 0, 0, 14)
    const savedChar = useGameStore.getState().character;
    const initialPos = savedChar?.pos
      ? new THREE.Vector3(savedChar.pos.x, savedChar.pos.y, savedChar.pos.z)
      : new THREE.Vector3(0, 0, 14);
    const initialYaw = savedChar?.pos?.ry ?? 0;

    const localPlayer = new Wanderer({
      form: this.playerForm,
      leaning: this.playerLeaning,
      castShadow: true,
    });
    localPlayer.position.copy(initialPos);
    localPlayer.rotation.y = initialYaw;
    this.localPlayer = localPlayer;
    this.worldGroup.add(localPlayer);

    // Awakening Preview Wanderer (pedestal spot beside the spirit pond: -7.5, 0.05, -3.8)
    const preview = new Wanderer({
      form: this.playerForm,
      leaning: this.playerLeaning,
      castShadow: true,
    });
    preview.position.set(-7.5, 0.05, -3.8);
    preview.rotation.y = 0.45;
    preview.setAnimationState('idle');
    this.previewWanderer = preview;
    this.worldGroup.add(preview);

    // Awakening Ground Pulse Ring Mesh
    const ringGeo = new THREE.RingGeometry(0.5, 1.2, 48);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: '#FFB27A',
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.awakenPulseMesh = new THREE.Mesh(ringGeo, ringMat);
    this.awakenPulseMesh.position.set(-7.5, 0.08, -3.8);
    this.awakenPulseMesh.visible = false;
    this.worldGroup.add(this.awakenPulseMesh);

    this.playerController = new PlayerController(localPlayer, {
      assistedMovement: false,
      onEdgeToast: (message) => {
        ctx.events.emit('toast', { message });
      },
    });
    this.playerController.teleport(
      initialPos.x,
      initialPos.y,
      initialPos.z,
      initialYaw,
    );

    this.inputManager = new InputManager(ctx.renderer.domElement, {
      assistedMovement: false,
      reducedMotion: ctx.device.reducedMotion,
    });

    this.cameraRig = new CameraRig(ctx.camera, ctx.device, {
      assistedMovement: false,
      reducedMotion: ctx.device.reducedMotion,
    });

    this.interactables = new InteractablesSystem(this.playerController, this.cameraRig, {
      onToast: (message) => {
        ctx.events.emit('toast', { message });
      },
      onBellRung: () => {
        // Bell feedback
      },
    });

    const swingingBell = this.sectArch?.group.getObjectByName('SwingingBell');
    if (swingingBell) {
      this.interactables.bellSwingMesh = swingingBell;
    }

    // Dev Lineup Stage if ?actors=1
    if (this.isActorsMode) {
      this.actorsLineup = new ActorsLineup();
      this.worldGroup.add(this.actorsLineup.group);
    }

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
      } else if (cmd.type === 'triggerInteract') {
        this.interactables?.triggerInteraction();
      } else if (cmd.type === 'setViewMode') {
        this.viewMode = cmd.mode;
        if (cmd.mode === 'awakening') {
          if (this.previewWanderer) this.previewWanderer.visible = true;
          this.targetHour = 18.3; // golden hour on first sight
          this.inputManager?.setLocked(true);
        } else if (cmd.mode === 'gate') {
          if (this.previewWanderer) this.previewWanderer.visible = false;
          this.targetHour = 18.3;
          this.inputManager?.setLocked(true);
        } else if (cmd.mode === 'arrival') {
          this.inputManager?.setLocked(true);
        } else if (cmd.mode === 'world') {
          if (this.previewWanderer) this.previewWanderer.visible = false;
          this.hasStartedLocomotion = true;
          this.inputManager?.setLocked(false);
        }
      } else if (cmd.type === 'setPreviewFigure') {
        this.playerLeaning = cmd.leaning;
        this.playerForm = cmd.form;
        this.previewWanderer?.setFormAndLeaning(cmd.form, cmd.leaning);
        this.localPlayer?.setFormAndLeaning(cmd.form, cmd.leaning);
        // Eased transition of sky hour based on leaning:
        // Dawn -> 6.5, Dusk -> 18.3, Still -> 12.0
        if (cmd.leaning === 'dawn') this.targetHour = 6.5;
        else if (cmd.leaning === 'dusk') this.targetHour = 18.3;
        else if (cmd.leaning === 'still') this.targetHour = 12.0;
      } else if (cmd.type === 'triggerAwakenPulse') {
        this.previewWanderer?.brightenEyes(true);
        this.awakenPulseTimer = 0;
        if (this.awakenPulseMesh) {
          this.awakenPulseMesh.visible = true;
          this.awakenPulseMesh.scale.set(0.1, 0.1, 0.1);
        }
      } else if (cmd.type === 'playArrivalRail') {
        this.viewMode = 'arrival';
        this.arrivalShortened = false;
        this.inputManager?.setLocked(true);
        if (this.previewWanderer) this.previewWanderer.visible = false;
        const dur = cmd.duration ?? 9.0;
        this.railController.play(BUILT_IN_RAILS.arrival!, {
          duration: dur,
          onDone: () => {
            this.viewMode = 'world';
            this.hasStartedLocomotion = true;
            this.inputManager?.setLocked(false);
            this.cameraRig?.startHandoffFromShowcase(ctx.camera.position, this.activeLookTarget);
            cmd.onDone?.();
          },
        });
      } else if (cmd.type === 'skipArrivalRail') {
        if (this.railController.isPlaying() && !this.arrivalShortened) {
          this.arrivalShortened = true;
          this.railController.skipToEnd(ctx.camera);
          this.viewMode = 'world';
          this.hasStartedLocomotion = true;
          this.inputManager?.setLocked(false);
          this.cameraRig?.startHandoffFromShowcase(ctx.camera.position, this.activeLookTarget);
        }
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
      this.islands[i]!.updateTextures(ctx.assets);
    }
    this.spires?.syncSky(this.skyState);
    this.trees?.update(0, ctx.clock.elapsed, ctx.camera.position, this.skyState);
    this.life?.update(0, ctx.clock.elapsed, this.skyState);

    this.buildTimeMs = Math.round((performance.now() - t0) * 100) / 100;
  }

  update(dt: number, ctx: EngineContext): void {
    const realHour = hourNow();
    let visualHour: number;

    // In gate or awakening mode, smoothly transition toward targetHour (1.5s ease) or golden hour (18.3)
    if (this.viewMode === 'gate' || this.viewMode === 'awakening') {
      const target = this.targetHour ?? 18.3;
      // Exponential smoothing with tau ~ 0.5s => ~1.5s transition
      const alpha = 1.0 - Math.exp(-dt * 2.5);
      this.currentHourSmooth += (target - this.currentHourSmooth) * alpha;
      visualHour = this.currentHourSmooth;
    } else if (this.viewMode === 'arrival') {
      // Transition toward real world hour over 4s
      const alpha = 1.0 - Math.exp(-dt * 1.5);
      this.currentHourSmooth += (realHour - this.currentHourSmooth) * alpha;
      visualHour = this.currentHourSmooth;
    } else {
      visualHour = realHour;
      this.currentHourSmooth = realHour;
    }

    ctx.bridge.mutable.hour = visualHour;

    const force = this.forceNextSkySync;
    this.forceNextSkySync = false;

    timeOfDayState(visualHour, this.skyState);
    this.syncFog(force);

    // Update preview figure slow rotation (14s full turn) in awakening mode
    if (this.viewMode === 'awakening' && this.previewWanderer) {
      this.previewWanderer.rotation.y += dt * (Math.PI * 2 / 14);
      this.previewWanderer.update(dt, 0, this.wind?.uniforms.uWindDir.value, 0.05);
    }

    // Update Awaken pulse ring expanding outward from the pond (or gentle fade on reduced motion)
    if (this.awakenPulseTimer >= 0 && this.awakenPulseMesh) {
      this.awakenPulseTimer += dt;
      const t = this.awakenPulseTimer / 2.5; // 2.5s expansion
      if (t <= 1.0) {
        if (ctx.device.reducedMotion) {
          this.awakenPulseMesh.scale.set(22.0, 1.0, 22.0);
          const opacity = (1.0 - t) * 0.75;
          (this.awakenPulseMesh.material as THREE.MeshBasicMaterial).opacity = opacity;
        } else {
          const radius = 0.5 + t * 45.0; // expand across island (up to 45m)
          this.awakenPulseMesh.scale.set(radius, 1.0, radius);
          const opacity = Math.sin(t * Math.PI) * 0.85;
          (this.awakenPulseMesh.material as THREE.MeshBasicMaterial).opacity = opacity;
        }
      } else {
        this.awakenPulseTimer = -1;
        this.awakenPulseMesh.visible = false;
        this.previewWanderer?.brightenEyes(false);
      }
    }

    // Sample user or synthetic input
    const rawInput = this.inputManager?.sample() ?? {
      moveX: 0,
      moveY: 0,
      lookDeltaYaw: 0,
      lookDeltaPitch: 0,
      run: false,
      interact: false,
      cancel: false,
    };

    const input = this.isWalkTest
      ? this.updateSyntheticWalkTest(dt, ctx)
      : rawInput;

    this.activeInput.moveX = input.moveX;
    this.activeInput.moveY = input.moveY;
    this.activeInput.lookDeltaYaw = input.lookDeltaYaw;
    this.activeInput.lookDeltaPitch = input.lookDeltaPitch;
    this.activeInput.run = input.run;
    this.activeInput.interact = input.interact;
    this.activeInput.cancel = input.cancel;

    const hasInput =
      Math.hypot(input.moveX, input.moveY) > 0.05 ||
      Math.abs(input.lookDeltaYaw) > 0.001 ||
      Math.abs(input.lookDeltaPitch) > 0.001 ||
      input.interact;

    if (
      !this.hasStartedLocomotion &&
      hasInput &&
      this.reviewShotIndex === null &&
      !this.railController.isPlaying() &&
      !this.isActorsMode &&
      this.viewMode === 'world'
    ) {
      this.hasStartedLocomotion = true;
      this.cameraRig?.startHandoffFromShowcase(ctx.camera.position, this.activeLookTarget);
    }

    if (input.interact) {
      this.interactables?.triggerInteraction();
    }

    this.updateShowcaseCamera(dt, ctx);

    const elapsed = ctx.clock.elapsed;
    const reduced = ctx.device.reducedMotion;
    const worldDay = Math.floor(worldMinute() / 1440);
    const weatherMinute = worldDay * 1440 + this.skyState.hour * 60;
    const weather = this.weatherController.update('home-reach', weatherMinute, {
      temperature: 0.55,
      moisture: 0.64,
      snowAllowed: false,
    });
    if (this.fog) this.fog.far = Math.max(150, 42000 / weather.fogMultiplier);
    const debugPosition = this.playerController?.position ?? ctx.camera.position;
    this.expansionInspector?.update(
      debugPosition.x,
      debugPosition.y,
      debugPosition.z,
      this.skyState.hour,
      weather,
    );

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

    this.cloudSea?.update(this.skyState, elapsed, ctx.camera, reduced, weather);
    this.farMountains?.syncSky(this.skyState);
    this.farMountains?.update(elapsed);
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
      this.islands[i]!.updateTextures(ctx.assets);
    }
    this.spires?.syncSky(this.skyState);

    // Living Nature & Water updates
    this.wind?.update(dt, elapsed, this.skyState, reduced);
    this.rocks?.updateTextures(ctx.assets);
    this.flowers?.updateTextures(ctx.assets);
    this.water?.update(dt, elapsed, this.skyState);
    this.trees?.updateTextures(ctx.assets);
    this.trees?.update(dt, elapsed, ctx.camera.position, this.skyState);
    this.grass?.update(dt, elapsed, ctx.camera, this.activeLookTarget, this.skyState);
    this.life?.update(dt, elapsed, this.skyState);

    // Update player, residents and wanderer pool
    const tActors0 = performance.now();
    const windVec = this.wind?.uniforms.uWindDir.value;

    if (this.playerController) {
      const camYaw = this.cameraRig ? this.cameraRig.yaw : 0;
      this.playerController.update(dt, this.activeInput, camYaw, windVec, elapsed);
      const pPos = this.playerController.position;
      ctx.bridge.mutable.playerCoarse = { x: pPos.x, y: pPos.y, z: pPos.z };
      positionSaver.save({
        x: pPos.x,
        y: pPos.y,
        z: pPos.z,
        ry: this.playerController.facing,
      });

      const area = discoverableAreaAt(pPos.x, pPos.y, pPos.z);
      const discoveredId = this.discoveryTracker?.update(dt, area?.id ?? null);
      if (discoveredId) {
        ctx.events.emit('discover', { areaId: discoveredId });
        void discoverArea(discoveredId).catch(() => undefined);
      }

      // Register player push point with GrassSystem via WindSystem
      this.wind?.setPushPoint(0, pPos.x, pPos.y, pPos.z, 0.95);
    }

    if (this.interactables) {
      this.interactables.update(
        dt,
        elapsed,
        Math.hypot(this.activeInput.moveX, this.activeInput.moveY) > 0.05,
        this.activeInput.cancel,
      );
    }

    if (this.wandererPool) {
      this.wandererPool.update(dt, ctx.camera.position, windVec, (x, z) => heightAt(x, z) ?? 0);
    }

    if (this.actorsLineup) {
      this.actorsLineup.update(dt, windVec);
    }

    const tActorsEnd = performance.now();
    const actorFrameMs = Math.round((tActorsEnd - tActors0) * 100) / 100;

    const totalActors =
      (this.playerController ? 1 : 0) +
      (this.wandererPool ? this.wandererPool.getActiveCount() : 0) +
      (this.actorsLineup ? this.actorsLineup.entries.length : 0);
    const nearActors =
      (this.playerController ? 1 : 0) +
      (this.wandererPool ? this.wandererPool.getNearCount() : 0) +
      (this.actorsLineup ? this.actorsLineup.entries.length : 0);

    ctx.bridge.mutable.actorStats = {
      count: totalActors,
      near: nearActors,
      frameMs: actorFrameMs,
    };

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
    ctx.presenter.updateSky?.(this.skyState, elapsed, ctx.camera);

    if (this.benchmarkSession?.isActive()) {
      this.benchmarkSession.recordFrame(dt, Math.max(0.1, dt * 1000), 'balanced');
    }
  }

  private syncFog(force: boolean): void {
    const rawDiff = Math.abs(this.skyState.hour - this.lastFogSyncHour);
    const wrappedDiff =
      this.lastFogSyncHour < 0 ? Infinity : Math.min(rawDiff, 24 - rawDiff);
    if (!force && wrappedDiff < 0.01) return;
    this.lastFogSyncHour = this.skyState.hour;

    if (this.fog) {
      this.fog.color.copy(this.skyState.fog);
      this.fog.near = Math.max(900, this.skyState.fogNear * 9);
      this.fog.far = 42000;
    }
  }

  private updateShowcaseCamera(dt: number, ctx: EngineContext): void {
    if (this.railController.isPlaying()) {
      this.railController.update(dt, ctx.camera);
      return;
    }

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

    if (this.isActorsMode) {
      if (Math.abs(ctx.camera.fov - 52) > 0.05) {
        ctx.camera.fov = 52;
        ctx.camera.updateProjectionMatrix();
      }
      ctx.camera.position.set(0, 3.2, 9.2);
      this.activeLookTarget.set(0, 1.2, 0.5);
      ctx.camera.lookAt(this.activeLookTarget);
      return;
    }

    if (this.viewMode === 'awakening' && this.previewWanderer) {
      // Pedestal spot beside spirit pond: previewWanderer is at (-7.5, 0.05, -3.8)
      // On phone, frame in upper half (raise look target slightly); on desktop, frame slightly to right
      const isPhone = ctx.device.deviceClass === 'phone';
      const targetFov = isPhone ? 46 : 40;
      if (Math.abs(ctx.camera.fov - targetFov) > 0.05) {
        ctx.camera.fov = targetFov;
        ctx.camera.updateProjectionMatrix();
      }
      const camPos = isPhone ? new THREE.Vector3(-7.5, 1.45, -0.9) : new THREE.Vector3(-6.2, 1.35, -1.2);
      const lookAt = isPhone ? new THREE.Vector3(-7.5, 0.75, -3.8) : new THREE.Vector3(-7.5, 0.95, -3.8);

      if (ctx.device.reducedMotion) {
        ctx.camera.position.copy(camPos);
        this.activeLookTarget.copy(lookAt);
      } else {
        // Eased transition into awakening pedestal view
        ctx.camera.position.lerp(camPos, 0.08);
        this.activeLookTarget.lerp(lookAt, 0.08);
      }
      ctx.camera.lookAt(this.activeLookTarget);
      return;
    }

    if (this.hasStartedLocomotion && this.cameraRig && this.playerController) {
      this.cameraRig.update(
        dt,
        this.playerController.position,
        this.playerController.facing,
        this.playerController.speed01,
        this.activeInput.lookDeltaYaw,
        this.activeInput.lookDeltaPitch,
        this.playerController.speed01 > 0.05,
      );
      this.activeLookTarget.copy(this.playerController.position);
      this.activeLookTarget.y += 1.35;
      return;
    }

    if (Math.abs(ctx.camera.fov - 52) > 0.05) {
      ctx.camera.fov = 52;
      ctx.camera.updateProjectionMatrix();
    }

    const radius = 36;
    const baseHeight = 7.5;
    const angularSpeed = ctx.device.reducedMotion ? 0 : 0.03;

    this.orbitAngle += dt * angularSpeed;
    const driftY = ctx.device.reducedMotion
      ? 0
      : Math.sin(ctx.clock.elapsed * 0.35) * 1.8;
    const clampedY = Math.max(4.0, Math.min(11.0, baseHeight + driftY));

    this.activeLookTarget.copy(this.defaultLookTarget);
    ctx.camera.position.set(
      this.activeLookTarget.x + Math.cos(this.orbitAngle) * radius,
      clampedY,
      this.activeLookTarget.z + Math.sin(this.orbitAngle) * radius,
    );
    ctx.camera.lookAt(this.activeLookTarget);
  }

  private updateSyntheticWalkTest(dt: number, ctx: EngineContext): InputState {
    if (!this.playerController) return this.syntheticInput;
    this.walkTestTimer += dt;
    this.walkTestTotalFrames++;

    const pPos = this.playerController.position;
    const waypoints = ShowcaseWorldSystem.WALK_TEST_WAYPOINTS;
    const currentWaypoint = waypoints[this.walkTestWaypointIndex]!;
    const dx = currentWaypoint.x - pPos.x;
    const dz = currentWaypoint.z - pPos.z;
    const distToWaypoint = Math.hypot(dx, dz);

    if (distToWaypoint < 1.0) {
      this.walkTestWaypointIndex = (this.walkTestWaypointIndex + 1) % waypoints.length;
    }

    const movedDist = pPos.distanceTo(this.walkTestLastPosition);
    this.walkTestLastPosition.copy(pPos);

    if (movedDist < 0.02 * dt * 60) {
      this.walkTestStuckDuration += dt;
      if (this.walkTestStuckDuration > this.walkTestMaxStuckDuration) {
        this.walkTestMaxStuckDuration = this.walkTestStuckDuration;
      }
    } else {
      this.walkTestStuckDuration = 0;
    }

    const camY = ctx.camera.position.y;
    const terrainY = heightAt(ctx.camera.position.x, ctx.camera.position.z, camY);
    if (terrainY !== null && camY < terrainY + 0.15) {
      this.walkTestPenetrationFrames++;
    }

    const angleToTarget = Math.atan2(dx, dz);
    const cameraYaw = this.cameraRig ? this.cameraRig.yaw : 0;
    const relAngle = angleToTarget - cameraYaw;

    this.syntheticInput.moveX = Math.sin(relAngle);
    this.syntheticInput.moveY = Math.cos(relAngle);
    this.syntheticInput.run = true;
    this.syntheticInput.lookDeltaYaw = 0;
    this.syntheticInput.lookDeltaPitch = 0;
    this.syntheticInput.interact = false;
    this.syntheticInput.cancel = false;

    if (this.walkTestTimer >= 30.0 && typeof window !== 'undefined') {
      const passed = this.walkTestMaxStuckDuration < 2.0 && this.walkTestPenetrationFrames === 0;
      window.__ARKVOID_WALK_TEST__ = {
        passed,
        duration: this.walkTestTimer,
        maxStuckDurationSec: this.walkTestMaxStuckDuration,
        penetrationFrames: this.walkTestPenetrationFrames,
        totalFrames: this.walkTestTotalFrames,
        report: passed
          ? `PASS: 30s walk test completed without being stuck > 2s (max stuck: ${this.walkTestMaxStuckDuration.toFixed(2)}s) and 0 camera penetrations.`
          : `FAIL: maxStuck=${this.walkTestMaxStuckDuration.toFixed(2)}s, penetrations=${this.walkTestPenetrationFrames}`,
      };
    }

    return this.syntheticInput;
  }

  dispose(): void {
    this.railController.stop();
    if (this.unsubCommand) {
      this.unsubCommand();
      this.unsubCommand = null;
    }
    if (this.inputManager) {
      this.inputManager.dispose();
      this.inputManager = null;
    }
    if (this.cameraRig) {
      this.cameraRig.dispose();
      this.cameraRig = null;
    }
    if (this.interactables) {
      this.interactables.dispose();
      this.interactables = null;
    }
    if (this.playerController) {
      this.playerController.dispose();
      this.playerController = null;
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
    if (this.farMountains) {
      this.farMountains.removeFromParent();
      this.farMountains.dispose();
      this.farMountains = null;
    }
    this.discoveryTracker = null;
    if (this.expansionInspector) {
      this.expansionInspector.dispose();
      this.expansionInspector = null;
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
    if (this.wandererPool) {
      this.wandererPool.dispose();
      this.wandererPool = null;
    }
    if (this.actorsLineup) {
      this.actorsLineup.dispose();
      this.actorsLineup = null;
    }
    if (this.previewWanderer) {
      this.previewWanderer.dispose();
      this.previewWanderer = null;
    }
    if (this.localPlayer) {
      this.localPlayer.dispose();
      this.localPlayer = null;
    }
    if (this.awakenPulseMesh) {
      this.awakenPulseMesh.geometry.dispose();
      (this.awakenPulseMesh.material as THREE.Material).dispose();
      this.awakenPulseMesh = null;
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
