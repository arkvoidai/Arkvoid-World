import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  WandererMaterials,
  type LeaningId,
  type FormId,
  type ResidentId,
} from '@/engine/actors/WandererMaterials';
export type { FormId, LeaningId, ResidentId };
import {
  WandererAnimator,
  type WandererSkeleton,
  type AnimationStateName,
} from '@/engine/actors/Animator';

export interface WandererConfig {
  form?: FormId;
  leaning?: LeaningId;
  resident?: ResidentId;
  lod?: 'near' | 'mid' | 'far';
  castShadow?: boolean;
}

export class SpringLink {
  current = 0;
  target = 0;
  velocity = 0;
  stiffness: number;
  damping: number;

  constructor(stiffness = 180, damping = 18) {
    this.stiffness = stiffness;
    this.damping = damping;
  }

  update(dt: number, target: number): number {
    this.target = target;
    const force = -this.stiffness * (this.current - this.target) - this.damping * this.velocity;
    this.velocity += force * dt;
    this.current += this.velocity * dt;
    return this.current;
  }

  reset(val = 0): void {
    this.current = val;
    this.target = val;
    this.velocity = 0;
  }
}

export class Wanderer extends THREE.Group {
  form: FormId;
  leaning: LeaningId;
  readonly resident?: ResidentId;
  readonly skeleton: WandererSkeleton;
  readonly animator: WandererAnimator;

  private readonly materials: WandererMaterials;
  private readonly config: WandererConfig;

  // Visual Meshes
  private robeMesh!: THREE.Mesh;
  private robeMaterial!: THREE.Material;
  private robeGeometry!: THREE.BufferGeometry;
  private leftSleeveGroup!: THREE.Group;
  private rightSleeveGroup!: THREE.Group;
  private sashGroup!: THREE.Group;
  private eyeGroup!: THREE.Group;
  private leftEyeMesh!: THREE.Mesh;
  private rightEyeMesh!: THREE.Mesh;
  private gatherRingMesh!: THREE.Mesh;
  private blobShadowMesh!: THREE.Mesh;

  // Accessory meshes per form
  private hatMesh?: THREE.Mesh;
  private veilMesh?: THREE.Mesh;
  private satchelMesh?: THREE.Mesh;
  private staffMesh?: THREE.Mesh;
  private mantleMesh?: THREE.Mesh;
  private maskMesh?: THREE.Mesh;
  private cloakMesh?: THREE.Mesh;
  private collarMesh?: THREE.Mesh;
  private hairPinMesh?: THREE.Mesh;
  private hairMesh?: THREE.Mesh;

  // Spring Chains
  private readonly robeHemSprings = [new SpringLink(120, 14), new SpringLink(100, 12), new SpringLink(80, 10)];
  private readonly leftSleeveSprings = [new SpringLink(220, 18), new SpringLink(180, 16), new SpringLink(140, 14)];
  private readonly rightSleeveSprings = [new SpringLink(220, 18), new SpringLink(180, 16), new SpringLink(140, 14)];
  private readonly sashLeftSprings = [new SpringLink(160, 14), new SpringLink(130, 12), new SpringLink(100, 10)];
  private readonly sashRightSprings = [new SpringLink(160, 14), new SpringLink(130, 12), new SpringLink(100, 10)];

  // Eye blinking state
  private blinkTimer = 3.0;
  private isBlinking = false;

  // Height scale based on form
  readonly heightScale: number;

  constructor(config: WandererConfig = {}) {
    super();
    this.name = 'Wanderer';
    this.config = config;
    this.materials = WandererMaterials.get();

    // Resolve form and leaning
    this.resident = config.resident;
    if (this.resident === 'hale') {
      this.form = 3; // Sage base
      this.leaning = 'still';
    } else if (this.resident === 'ione') {
      this.form = 1; // Scholar base
      this.leaning = 'dusk';
    } else if (this.resident === 'tamsin') {
      this.form = 0; // Traveller base
      this.leaning = 'dawn';
    } else if (this.resident === 'corvin') {
      this.form = 2; // Warden base
      this.leaning = 'dawn';
    } else if (this.resident === 'meilin') {
      this.form = config.form ?? 3;
      this.leaning = 'dusk';
    } else if (this.resident === 'yue') {
      this.form = config.form ?? 1;
      this.leaning = 'still';
    } else if (this.resident === 'sylva') {
      this.form = config.form ?? 0;
      this.leaning = 'dawn';
    } else {
      this.form = config.form ?? 0;
      this.leaning = config.leaning ?? 'dawn';
    }

    // Heights: Warden 1.80m, Sage 1.62m, standard 1.72m
    if (this.form === 2) {
      this.heightScale = 1.80 / 1.72; // ~1.046
    } else if (this.form === 3) {
      this.heightScale = 1.62 / 1.72; // ~0.942
    } else {
      this.heightScale = 1.0;
    }

    // 1. Build articulated Object3D skeleton
    this.skeleton = this.buildSkeleton();
    this.add(this.skeleton.root);

    // Apply height scale to skeleton root
    this.skeleton.root.scale.set(this.heightScale, this.heightScale, this.heightScale);

    // 2. Build Procedural Robe Mesh
    this.buildRobeMesh();

    // 3. Build Dynamic Sleeves & Sash
    this.buildSleeves();
    this.buildSash();

    // 4. Build Head, Eyes & Form-Specific Accessories
    this.buildHeadAndAccessories();

    // 5. Build Ground Contact Blob Shadow & Gathering Ring
    this.buildContactDecals();

    // 6. Initialize Animator
    this.animator = new WandererAnimator();

    // Enable shadows if requested
    if (config.castShadow !== false) {
      this.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh && obj !== this.blobShadowMesh && obj !== this.gatherRingMesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      });
    }
  }

  private buildSkeleton(): WandererSkeleton {
    const root = new THREE.Group();
    root.name = 'wanderer_root';

    const pelvis = new THREE.Group();
    pelvis.position.y = 0.88;
    root.add(pelvis);

    // Spine (3 links)
    const spine0 = new THREE.Group();
    spine0.position.y = 0.08;
    pelvis.add(spine0);

    const spine1 = new THREE.Group();
    spine1.position.y = 0.12;
    spine0.add(spine1);

    const spine2 = new THREE.Group();
    spine2.position.y = 0.12;
    spine1.add(spine2);

    // Chest
    const chest = new THREE.Group();
    chest.position.y = 0.14;
    spine2.add(chest);

    // Neck & Head
    const neck = new THREE.Group();
    neck.position.y = 0.18;
    chest.add(neck);

    const head = new THREE.Group();
    head.position.y = 0.10;
    neck.add(head);

    // Shoulders (0.42 m span)
    const leftShoulder = new THREE.Group();
    leftShoulder.position.set(0.21, 0.14, 0);
    chest.add(leftShoulder);

    const rightShoulder = new THREE.Group();
    rightShoulder.position.set(-0.21, 0.14, 0);
    chest.add(rightShoulder);

    // Arms
    const leftUpperArm = new THREE.Group();
    leftUpperArm.position.y = -0.04;
    leftShoulder.add(leftUpperArm);

    const rightUpperArm = new THREE.Group();
    rightUpperArm.position.y = -0.04;
    rightShoulder.add(rightUpperArm);

    const leftForearm = new THREE.Group();
    leftForearm.position.y = -0.28;
    leftUpperArm.add(leftForearm);

    const rightForearm = new THREE.Group();
    rightForearm.position.y = -0.28;
    rightUpperArm.add(rightForearm);

    const leftHand = new THREE.Group();
    leftHand.position.y = -0.24;
    leftForearm.add(leftHand);

    const rightHand = new THREE.Group();
    rightHand.position.y = -0.24;
    rightForearm.add(rightHand);

    // Legs
    const leftThigh = new THREE.Group();
    leftThigh.position.set(0.12, -0.06, 0);
    pelvis.add(leftThigh);

    const rightThigh = new THREE.Group();
    rightThigh.position.set(-0.12, -0.06, 0);
    pelvis.add(rightThigh);

    const leftShin = new THREE.Group();
    leftShin.position.y = -0.40;
    leftThigh.add(leftShin);

    const rightShin = new THREE.Group();
    rightShin.position.y = -0.40;
    rightThigh.add(rightShin);

    const leftFoot = new THREE.Group();
    leftFoot.position.set(0, -0.38, 0.05);
    leftShin.add(leftFoot);

    const rightFoot = new THREE.Group();
    rightFoot.position.set(0, -0.38, 0.05);
    rightShin.add(rightFoot);

    // Add smooth body volumes (head sphere, torso cylinder, hands)
    const skinMat = this.materials.getSkinMaterial();

    const headGeo = new THREE.SphereGeometry(0.11, 16, 12);
    headGeo.scale(0.85, 1.1, 0.95);
    const headMesh = new THREE.Mesh(headGeo, skinMat);
    headMesh.position.y = 0.04;
    head.add(headMesh);

    // Smooth hands (lathe/tapered capsules)
    const handGeo = new THREE.CapsuleGeometry(0.032, 0.08, 8, 8);
    const leftHandMesh = new THREE.Mesh(handGeo, skinMat);
    leftHandMesh.position.y = -0.04;
    leftHand.add(leftHandMesh);

    const rightHandMesh = new THREE.Mesh(handGeo, skinMat);
    rightHandMesh.position.y = -0.04;
    rightHand.add(rightHandMesh);

    // Inner legs (capsules so walking has weight)
    const legGeo = new THREE.CapsuleGeometry(0.06, 0.32, 8, 8);
    const legMat = this.materials.getMidFabricMaterial(this.leaning, true);
    const leftLegMesh = new THREE.Mesh(legGeo, legMat);
    leftLegMesh.position.y = -0.20;
    leftThigh.add(leftLegMesh);

    const rightLegMesh = new THREE.Mesh(legGeo, legMat);
    rightLegMesh.position.y = -0.20;
    rightThigh.add(rightLegMesh);

    // Shoes/feet
    const footGeo = new THREE.BoxGeometry(0.08, 0.06, 0.18);
    const footMat = new THREE.MeshStandardMaterial({ color: '#2B2630', roughness: 0.9 });
    const leftFootMesh = new THREE.Mesh(footGeo, footMat);
    leftFootMesh.position.z = 0.04;
    leftFoot.add(leftFootMesh);

    const rightFootMesh = new THREE.Mesh(footGeo, footMat);
    rightFootMesh.position.z = 0.04;
    rightFoot.add(rightFootMesh);

    return {
      root,
      pelvis,
      spine0,
      spine1,
      spine2,
      chest,
      neck,
      head,
      leftShoulder,
      rightShoulder,
      leftUpperArm,
      rightUpperArm,
      leftForearm,
      rightForearm,
      leftHand,
      rightHand,
      leftThigh,
      rightThigh,
      leftShin,
      rightShin,
      leftFoot,
      rightFoot,
    };
  }

  /**
   * Continuous soft robe from shoulders to hem (lathe with 24 radial and 28 vertical segments).
   */
  private buildRobeMesh(): void {
    const radialSegs = this.config.lod === 'mid' ? 12 : 24;
    const vertSegs = this.config.lod === 'mid' ? 14 : 28;

    // Build lathe points from shoulders (y=1.38) down to hem (y=0.06)
    // Hem radius is at least 0.36m, ensuring zero clipping through legs (capsules radius ~0.18m)
    const points: THREE.Vector2[] = [];
    for (let i = 0; i <= vertSegs; i++) {
      const v = i / vertSegs; // 0 top (shoulders) -> 1 bottom (hem)
      const y = 1.38 * (1 - v) + 0.06 * v;

      // Profile curve: shoulder 0.22 -> chest 0.20 -> waist 0.18 -> flared hem 0.38
      let r: number;
      if (v < 0.25) {
        // Shoulder to chest
        r = 0.22 - (v / 0.25) * 0.02;
      } else if (v < 0.5) {
        // Chest to waist
        r = 0.20 - ((v - 0.25) / 0.25) * 0.02;
      } else {
        // Waist to flared hem
        const fl = (v - 0.5) / 0.5;
        r = 0.18 + fl * fl * 0.20; // Reaches 0.38 at hem (>= 0.34m)
      }
      points.push(new THREE.Vector2(r, y));
    }

    this.robeGeometry = new THREE.LatheGeometry(points, radialSegs);

    // Custom vertex deformation shader hook
    const isNear = this.config.lod !== 'mid' && this.config.lod !== 'far';
    const baseMat = isNear
      ? this.materials.getFabricMaterial(this.leaning, false).clone()
      : this.materials.getMidFabricMaterial(this.leaning, false).clone();

    baseMat.side = THREE.DoubleSide;

    // Inject custom robe deformation shader uniforms and vertex displacement
    baseMat.onBeforeCompile = (shader) => {
      shader.uniforms.uRobePhase = { value: 0 };
      shader.uniforms.uRobeAmplitude = { value: 0 };
      shader.uniforms.uRobeTrail = { value: 0 };
      shader.uniforms.uHemLag = { value: 0 };
      shader.uniforms.uWindTerm = { value: new THREE.Vector2(0, 0) };
      shader.uniforms.uTurnLean = { value: 0 };
      shader.uniforms.uBreath = { value: 0 };

      shader.vertexShader = `
        uniform float uRobePhase;
        uniform float uRobeAmplitude;
        uniform float uRobeTrail;
        uniform float uHemLag;
        uniform vec2 uWindTerm;
        uniform float uTurnLean;
        uniform float uBreath;
        ${shader.vertexShader}
      `;

      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>

        // Vertical parameter (0 at shoulders y=1.38, 1 at hem y=0.06)
        float vNorm = clamp((1.38 - transformed.y) / 1.32, 0.0, 1.0);
        float hemWeight = smoothstep(0.4, 1.0, vNorm);

        // Walking phase swing: left & right lobes swing opposite
        float sideSign = sign(transformed.x);
        float swingAngle = sin(uRobePhase * 6.28318) * uRobeAmplitude * 0.12 * sideSign;
        transformed.z += swingAngle * hemWeight;

        // Velocity trailing backward at the hem + spring hem lag
        transformed.z -= (uRobeTrail * 0.35 + uHemLag * 0.25) * hemWeight;

        // Wind drift
        transformed.x += uWindTerm.x * hemWeight * 0.15;
        transformed.z += uWindTerm.y * hemWeight * 0.15;

        // Turn lean
        transformed.x -= uTurnLean * hemWeight * 0.12;

        // Breathing term at chest and waist (vNorm 0.2 to 0.6)
        float breathWeight = sin(clamp(vNorm, 0.0, 1.0) * 3.14159);
        transformed.x += transformed.x * uBreath * 0.05 * breathWeight;
        transformed.z += transformed.z * uBreath * 0.05 * breathWeight;
        `,
      );

      (baseMat as unknown as { customUniforms: typeof shader.uniforms }).customUniforms = shader.uniforms;
    };

    this.robeMaterial = baseMat;
    this.robeMesh = new THREE.Mesh(this.robeGeometry, this.robeMaterial);
    this.robeMesh.name = 'wanderer_robe';
    this.skeleton.root.add(this.robeMesh);
  }

  /**
   * Wide tapered sleeves with 3-segment spring chain.
   */
  private buildSleeves(): void {
    const sleeveMat = this.materials.getFabricMaterial(this.leaning, false);
    const trimMat = this.materials.getFabricMaterial(this.leaning, true);

    const createSleeveChain = (isLeft: boolean) => {
      const chainGroup = new THREE.Group();
      chainGroup.name = isLeft ? 'left_sleeve' : 'right_sleeve';

      // 3 segments down the arm
      const seg1 = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.15, 0.24, 12, 1, true),
        sleeveMat,
      );
      seg1.position.y = -0.12;
      chainGroup.add(seg1);

      const link2 = new THREE.Group();
      link2.position.y = -0.24;
      chainGroup.add(link2);

      const seg2 = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.19, 0.22, 12, 1, true),
        sleeveMat,
      );
      seg2.position.y = -0.11;
      link2.add(seg2);

      const link3 = new THREE.Group();
      link3.position.y = -0.22;
      link2.add(link3);

      // Flared cuff with decorative trim
      const seg3 = new THREE.Mesh(
        new THREE.CylinderGeometry(0.19, 0.23, 0.12, 12, 1, true),
        trimMat,
      );
      seg3.position.y = -0.06;
      link3.add(seg3);

      return { chainGroup, link2, link3 };
    };

    const left = createSleeveChain(true);
    this.leftSleeveGroup = left.chainGroup;
    this.skeleton.leftUpperArm.add(this.leftSleeveGroup);

    const right = createSleeveChain(false);
    this.rightSleeveGroup = right.chainGroup;
    this.skeleton.rightUpperArm.add(this.rightSleeveGroup);
  }

  /**
   * Belt sash and hanging ribbon strips driven by spring simulation.
   */
  private buildSash(): void {
    this.sashGroup = new THREE.Group();
    this.sashGroup.name = 'wanderer_sash';

    const trimMat = this.materials.getFabricMaterial(this.leaning, true);

    // Belt band around waist (y=0.92)
    const beltGeo = new THREE.CylinderGeometry(0.20, 0.20, 0.08, 16, 1, true);
    const beltMesh = new THREE.Mesh(beltGeo, trimMat);
    beltMesh.position.y = 0.92;
    this.sashGroup.add(beltMesh);

    // Two hanging ribbon strips (left & right)
    const ribbonGeo = new THREE.PlaneGeometry(0.05, 0.45, 1, 3);
    ribbonGeo.translate(0, -0.22, 0);

    const leftRibbon = new THREE.Mesh(ribbonGeo, trimMat);
    leftRibbon.position.set(0.06, 0.88, 0.19);
    this.sashGroup.add(leftRibbon);

    const rightRibbon = new THREE.Mesh(ribbonGeo, trimMat);
    rightRibbon.position.set(-0.06, 0.88, 0.19);
    this.sashGroup.add(rightRibbon);

    this.skeleton.root.add(this.sashGroup);
  }

  /**
   * Head, glowing eye marks, and form-specific attachments.
   */
  private getCharacterHairMaterial(): THREE.MeshStandardMaterial {
    const colour = this.resident === 'meilin' ? '#202634'
      : this.resident === 'yue' ? '#29231F'
      : this.resident === 'sylva' ? '#49372D' : '#30231F';
    return this.materials.getHairMaterial(colour);
  }

  private buildHeadAndAccessories(): void {
    this.eyeGroup = new THREE.Group();
    this.eyeGroup.name = 'face_and_hair';

    const addVertexColour = (geometry: THREE.BufferGeometry, hex: string): THREE.BufferGeometry => {
      const position = geometry.getAttribute('position');
      const color = new THREE.Color(hex);
      const values = new Float32Array(position.count * 3);
      for (let i = 0; i < position.count; i++) {
        values[i * 3] = color.r;
        values[i * 3 + 1] = color.g;
        values[i * 3 + 2] = color.b;
      }
      geometry.setAttribute('color', new THREE.BufferAttribute(values, 3));
      geometry.computeVertexNormals();
      return geometry;
    };

    const eyeParts: THREE.BufferGeometry[] = [];
    const featureParts: THREE.BufferGeometry[] = [];
    const hairParts: THREE.BufferGeometry[] = [];

    const addEllipsoid = (
      parts: THREE.BufferGeometry[],
      x: number, y: number, z: number,
      radius: number, sx: number, sy: number, sz: number,
      color: string,
    ): void => {
      const geometry = new THREE.SphereGeometry(radius, 16, 12);
      geometry.scale(sx, sy, sz);
      geometry.translate(x, y, z);
      parts.push(addVertexColour(geometry, color));
    };

    const addTube = (
      parts: THREE.BufferGeometry[],
      points: THREE.Vector3[],
      radius: number,
      color: string,
      tubularSegments = 10,
    ): void => {
      const curve = new THREE.CatmullRomCurve3(points);
      const geometry = new THREE.TubeGeometry(curve, tubularSegments, radius, 7, false);
      parts.push(addVertexColour(geometry, color));
    };

    // Two readable eyes: warm ivory sclera, amber-brown irises, dark pupils and catchlights.
    for (const side of [-1, 1]) {
      const eyeX = side * 0.038;
      addEllipsoid(eyeParts, eyeX, 0.045, 0.092, 0.017, 1.12, 0.78, 0.58, '#F4EEE4');
      addEllipsoid(eyeParts, eyeX + 0.0015, 0.045, 0.102, 0.0092, 0.88, 0.9, 0.55, '#82583C');
      addEllipsoid(eyeParts, eyeX + 0.0015, 0.045, 0.107, 0.0047, 0.82, 0.9, 0.5, '#241A16');
      addEllipsoid(eyeParts, eyeX - 0.0018, 0.049, 0.109, 0.0019, 1, 1, 0.65, '#FFFFFF');
      addTube(
        eyeParts,
        [
          new THREE.Vector3(eyeX - 0.021, 0.071, 0.091),
          new THREE.Vector3(eyeX, 0.078, 0.101),
          new THREE.Vector3(eyeX + 0.021, 0.071, 0.091),
        ],
        0.0032,
        '#382820',
        8,
      );
    }

    const eyeGeometry = mergeGeometries(eyeParts, false);
    for (const geometry of eyeParts) geometry.dispose();
    if (!eyeGeometry) throw new Error('Unable to build wanderer eye geometry');
    eyeGeometry.computeBoundingSphere();
    const eyeMesh = new THREE.Mesh(eyeGeometry, this.materials.getFaceDetailMaterial());
    eyeMesh.name = 'face_eyes';
    this.eyeGroup.add(eyeMesh);
    // Both blink references share one merged eye mesh, so the paired blink remains synchronised.
    this.leftEyeMesh = eyeMesh;
    this.rightEyeMesh = eyeMesh;

    // Nose, a soft smile, cheek warmth and ears. Kept in a separate mesh so eye blinks
    // never squash the rest of the face.
    addEllipsoid(featureParts, 0, 0.008, 0.096, 0.010, 0.66, 0.88, 0.92, '#C78C76');
    addEllipsoid(featureParts, -0.005, 0.001, 0.105, 0.0022, 1, 0.75, 0.7, '#895B50');
    addEllipsoid(featureParts, 0.005, 0.001, 0.105, 0.0022, 1, 0.75, 0.7, '#895B50');
    addEllipsoid(featureParts, -0.061, 0.006, 0.077, 0.010, 1.1, 0.62, 0.42, '#C8887C');
    addEllipsoid(featureParts, 0.061, 0.006, 0.077, 0.010, 1.1, 0.62, 0.42, '#C8887C');
    addEllipsoid(featureParts, -0.096, 0.004, 0.002, 0.017, 0.48, 0.92, 0.56, '#C98F79');
    addEllipsoid(featureParts, 0.096, 0.004, 0.002, 0.017, 0.48, 0.92, 0.56, '#C98F79');
    addTube(
      featureParts,
      [
        new THREE.Vector3(-0.018, -0.031, 0.096),
        new THREE.Vector3(0, -0.036, 0.102),
        new THREE.Vector3(0.018, -0.031, 0.096),
      ],
      0.0027,
      '#794A43',
      8,
    );

    const featureGeometry = mergeGeometries(featureParts, false);
    for (const geometry of featureParts) geometry.dispose();
    if (!featureGeometry) throw new Error('Unable to build wanderer face geometry');
    featureGeometry.computeBoundingSphere();
    const featureMesh = new THREE.Mesh(featureGeometry, this.materials.getFaceDetailMaterial());
    featureMesh.name = 'face_features';
    this.eyeGroup.add(featureMesh);

    // Scalp cap and tapered locks frame the face without hiding it behind a veil.
    const hairCap = new THREE.SphereGeometry(0.115, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.46);
    hairCap.scale(1, 0.98, 0.96);
    hairCap.translate(0, 0.066, -0.006);
    hairParts.push(addVertexColour(hairCap, '#30231F'));
    addTube(
      hairParts,
      [
        new THREE.Vector3(-0.068, 0.076, 0.062),
        new THREE.Vector3(-0.048, 0.061, 0.092),
        new THREE.Vector3(-0.016, 0.058, 0.103),
        new THREE.Vector3(0.012, 0.067, 0.098),
      ],
      0.008,
      '#30231F',
      12,
    );
    addTube(
      hairParts,
      [
        new THREE.Vector3(0.072, 0.052, 0.056),
        new THREE.Vector3(0.078, 0.005, 0.072),
        new THREE.Vector3(0.073, -0.045, 0.060),
      ],
      0.009,
      '#30231F',
      10,
    );
    addTube(
      hairParts,
      [
        new THREE.Vector3(-0.072, 0.052, 0.056),
        new THREE.Vector3(-0.078, 0.005, 0.072),
        new THREE.Vector3(-0.073, -0.045, 0.060),
      ],
      0.009,
      '#30231F',
      10,
    );
    const hairGeometry = mergeGeometries(hairParts, false);
    for (const geometry of hairParts) geometry.dispose();
    if (!hairGeometry) throw new Error('Unable to build wanderer hair geometry');
    hairGeometry.computeVertexNormals();
    const hairMesh = new THREE.Mesh(hairGeometry, this.getCharacterHairMaterial());
    hairMesh.name = 'wanderer_hair';
    hairMesh.castShadow = true;
    this.eyeGroup.add(hairMesh);
    this.hairMesh = hairMesh;

    this.skeleton.head.add(this.eyeGroup);

    // Form-specific silhouette details remain distinct, but faces stay visible.
    switch (this.form) {
      case 0: {
        const bambooMat = this.materials.getBambooMaterial();
        const hatGeo = new THREE.ConeGeometry(0.44, 0.15, 24, 1, true);
        this.hatMesh = new THREE.Mesh(hatGeo, bambooMat);
        this.hatMesh.position.y = 0.14;
        this.hatMesh.castShadow = true;
        this.skeleton.head.add(this.hatMesh);
        // No full-face gauze curtain: the Traveller's expression remains visible.
        const cloakGeo = new THREE.ConeGeometry(0.34, 0.45, 16, 1, true);
        const cloakMesh = new THREE.Mesh(cloakGeo, this.materials.getFabricMaterial(this.leaning, true));
        cloakMesh.position.y = -0.06;
        cloakMesh.scale.set(1.0, 1.0, 0.7);
        this.cloakMesh = cloakMesh;
        this.skeleton.chest.add(cloakMesh);
        break;
      }

      case 1: {
        const fabricMat = this.materials.getFabricMaterial(this.leaning, false);
        const hoodGeo = new THREE.SphereGeometry(0.18, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.70);
        const hoodMesh = new THREE.Mesh(hoodGeo, fabricMat);
        hoodMesh.position.set(0, 0.055, -0.095);
        hoodMesh.scale.set(0.94, 1.08, 1.04);
        hoodMesh.castShadow = true;
        this.hatMesh = hoodMesh;
        this.skeleton.head.add(hoodMesh);

        const satchelMat = new THREE.MeshStandardMaterial({ color: '#4A3425', roughness: 0.7 });
        this.satchelMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.06), satchelMat);
        this.satchelMesh.position.set(-0.22, 0.82, 0.05);
        this.skeleton.root.add(this.satchelMesh);
        break;
      }

      case 2: {
        const trimMat = this.materials.getFabricMaterial(this.leaning, true);
        const mantleGeo = new THREE.CylinderGeometry(0.24, 0.36, 0.25, 16, 1, true);
        this.mantleMesh = new THREE.Mesh(mantleGeo, trimMat);
        this.mantleMesh.position.y = 0.08;
        this.mantleMesh.scale.set(1.2, 1.0, 0.85);
        this.skeleton.chest.add(this.mantleMesh);

        const maskMat = new THREE.MeshStandardMaterial({ color: '#D9D3C7', roughness: 0.6 });
        this.maskMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.10, 0.10, 0.07, 12, 1, true, -Math.PI / 3, (Math.PI * 2) / 3),
          maskMat,
        );
        this.maskMesh.position.set(0, -0.055, 0.045);
        this.skeleton.head.add(this.maskMesh);
        break;
      }

      case 3: {
        const trimMat = this.materials.getFabricMaterial(this.leaning, true);
        const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.12, 16, 1, true), trimMat);
        collar.position.y = 0.08;
        this.collarMesh = collar;
        this.skeleton.neck.add(collar);

        const bun = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), this.getCharacterHairMaterial());
        bun.position.set(0, 0.14, -0.08);
        this.hairMesh = bun;
        this.skeleton.head.add(bun);

        const pin = new THREE.Mesh(
          new THREE.CylinderGeometry(0.005, 0.005, 0.22, 8),
          new THREE.MeshStandardMaterial({ color: '#D8A24A', roughness: 0.34, metalness: 0.55 }),
        );
        pin.rotation.z = Math.PI / 3;
        pin.position.set(0, 0.14, -0.08);
        this.hairPinMesh = pin;
        this.skeleton.head.add(pin);
        break;
      }
    }

    if (this.resident === 'hale') {
      const beardMat = new THREE.MeshStandardMaterial({ color: '#EAE6DF', roughness: 0.85 });
      const beardGeo = new THREE.ConeGeometry(0.06, 0.35, 8);
      beardGeo.rotateX(Math.PI);
      const beard = new THREE.Mesh(beardGeo, beardMat);
      beard.position.set(0, -0.08, 0.08);
      this.skeleton.head.add(beard);

      const woodMat = new THREE.MeshStandardMaterial({ color: '#5C4431', roughness: 0.8 });
      const staffGeo = new THREE.CylinderGeometry(0.02, 0.02, 1.85, 8);
      this.staffMesh = new THREE.Mesh(staffGeo, woodMat);
      this.staffMesh.position.set(0.32, 0.70, 0.12);
      this.skeleton.root.add(this.staffMesh);
    } else if (this.resident === 'ione') {
      const scrollMat = new THREE.MeshStandardMaterial({ color: '#7A5B3D', roughness: 0.7 });
      const scrollCase = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.38, 8), scrollMat);
      scrollCase.rotation.z = Math.PI / 4;
      scrollCase.position.set(-0.25, 0.75, -0.08);
      this.skeleton.root.add(scrollCase);
    } else if (this.resident === 'tamsin') {
      const poleMat = new THREE.MeshStandardMaterial({ color: '#443B33', roughness: 0.8 });
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.95, 8), poleMat);
      pole.position.set(0.34, 0.75, 0.15);
      const lanternMat = new THREE.MeshBasicMaterial({ color: '#FFA040' });
      const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), lanternMat);
      lantern.position.y = 0.95;
      pole.add(lantern);
      this.skeleton.root.add(pole);
    } else if (this.resident === 'corvin') {
      const swordMat = new THREE.MeshStandardMaterial({ color: '#8A7056', roughness: 0.7 });
      const sword = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.75, 0.02), swordMat);
      sword.rotation.z = -Math.PI / 5;
      sword.position.set(-0.20, 0.65, -0.05);
      this.skeleton.root.add(sword);
    }

    // Named women of the wider world receive distinct long-hair silhouettes and crafted ornaments.
    if (this.resident === 'meilin' || this.resident === 'yue' || this.resident === 'sylva') {
      const hairMat = this.getCharacterHairMaterial();
      const backHair = new THREE.Mesh(new THREE.SphereGeometry(0.12, 18, 14), hairMat);
      backHair.name = 'resident_long_hair';
      backHair.position.set(0, -0.13, -0.055);
      backHair.scale.set(0.98, 1.72, 0.86);
      backHair.castShadow = true;
      this.eyeGroup.add(backHair);

      for (const side of [-1, 1]) {
        const lock = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.055, 0.42, 8), hairMat);
        lock.name = 'resident_hair_lock';
        lock.position.set(side * 0.125, -0.12, 0.015);
        lock.rotation.z = side * -0.12;
        lock.castShadow = true;
        this.eyeGroup.add(lock);
      }

      const ornamentColor = this.resident === 'meilin' ? '#B77B65' : this.resident === 'yue' ? '#D6B86D' : '#8EAC75';
      const ornamentMat = this.materials.getAdornmentMaterial(ornamentColor);
      const flower = new THREE.Mesh(new THREE.IcosahedronGeometry(0.045, 1), ornamentMat);
      flower.name = 'resident_hair_ornament';
      flower.position.set(this.resident === 'yue' ? -0.13 : 0.13, 0.16, -0.035);
      flower.scale.set(1, 0.72, 0.55);
      this.eyeGroup.add(flower);

      const pin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.006, 0.006, 0.24, 8),
        this.materials.getAdornmentMaterial('#D7B879'),
      );
      pin.rotation.z = Math.PI / 2.8;
      pin.position.set(0.12, 0.14, -0.04);
      this.eyeGroup.add(pin);
    }
  }

  /**
   * Soft blob contact shadow decal and expanding gather ring.
   */
  private buildContactDecals(): void {
    // Blob shadow
    const blobGeo = new THREE.PlaneGeometry(0.75, 0.75);
    blobGeo.rotateX(-Math.PI / 2);
    this.blobShadowMesh = new THREE.Mesh(blobGeo, this.materials.getBlobShadowMaterial());
    this.blobShadowMesh.position.y = 0.02;
    this.add(this.blobShadowMesh);

    // Gathering glow ring
    const ringGeo = new THREE.RingGeometry(0.3, 0.9, 32);
    ringGeo.rotateX(-Math.PI / 2);
    this.gatherRingMesh = new THREE.Mesh(ringGeo, this.materials.getGatheringRingMaterial(this.leaning));
    this.gatherRingMesh.position.y = 0.025;
    this.gatherRingMesh.visible = false;
    this.add(this.gatherRingMesh);
  }

  /**
   * Main per-frame update loop.
   */
  update(
    dt: number,
    speed: number,
    windVector?: THREE.Vector2,
    groundY = 0,
  ): void {
    const clampedDt = Math.min(dt, 0.1);

    // 1. Update Animator (pose, state, footsteps)
    this.animator.update(clampedDt, speed, this.skeleton, this.position);
    const pose = this.animator.getBlendedPose();

    // 2. Eye Blinking & Glow Modulation
    this.blinkTimer -= clampedDt;
    if (this.blinkTimer <= 0) {
      if (this.isBlinking) {
        this.isBlinking = false;
        this.blinkTimer = 2.5 + Math.random() * 3.5;
        this.leftEyeMesh.scale.y = 1.0;
        this.rightEyeMesh.scale.y = 1.0;
      } else {
        this.isBlinking = true;
        this.blinkTimer = 0.12; // 120 ms blink
        this.leftEyeMesh.scale.y = 0.1;
        this.rightEyeMesh.scale.y = 0.1;
      }
    }

    // Eye glow intensity
    const eyeScale = pose.eyeGlowMultiplier;
    this.leftEyeMesh.scale.set(eyeScale, this.isBlinking ? 0.1 : eyeScale, 1.0);
    this.rightEyeMesh.scale.set(eyeScale, this.isBlinking ? 0.1 : eyeScale, 1.0);

    // 3. Gathering Ring Scale
    if (pose.gatherRingScale > 0.01) {
      this.gatherRingMesh.visible = true;
      const ringScale = 0.4 + pose.gatherRingScale * 1.2;
      this.gatherRingMesh.scale.set(ringScale, 1.0, ringScale);
      (this.gatherRingMesh.material as THREE.MeshBasicMaterial).opacity = pose.gatherRingScale * 0.75;
    } else {
      this.gatherRingMesh.visible = false;
    }

    // 4. Spring Chain Simulations
    // Robe Hem Springs
    const targetHemLag = pose.robeTrail + (speed > 0.1 ? 0.1 : 0);
    const hemLag0 = this.robeHemSprings[0]!.update(clampedDt, targetHemLag);
    const hemLag1 = this.robeHemSprings[1]!.update(clampedDt, hemLag0);
    const hemLag2 = this.robeHemSprings[2]!.update(clampedDt, hemLag1);

    // Sleeves lag behind arm movements
    const lArmRot = this.skeleton.leftUpperArm.rotation.x;
    const rArmRot = this.skeleton.rightUpperArm.rotation.x;
    const lSleeveLag = this.leftSleeveSprings[1]!.update(clampedDt, -lArmRot * 0.4);
    const rSleeveLag = this.rightSleeveSprings[1]!.update(clampedDt, -rArmRot * 0.4);
    this.leftSleeveGroup.rotation.x = lSleeveLag;
    this.rightSleeveGroup.rotation.x = rSleeveLag;

    // Sash ribbons sway
    const sashLag = this.sashLeftSprings[1]!.update(clampedDt, pose.robeTrail * 0.4);
    this.sashGroup.children.forEach((child, i) => {
      if (i > 0) child.rotation.x = sashLag;
    });

    // 5. Update Robe Material Uniforms
    const customUniforms = (this.robeMaterial as unknown as { customUniforms?: Record<string, { value: unknown }> }).customUniforms;
    if (customUniforms) {
      if (customUniforms.uRobePhase) customUniforms.uRobePhase.value = pose.robePhase;
      if (customUniforms.uRobeAmplitude) customUniforms.uRobeAmplitude.value = pose.robeSpeedAmplitude;
      if (customUniforms.uRobeTrail) customUniforms.uRobeTrail.value = pose.robeTrail;
      if (customUniforms.uHemLag) customUniforms.uHemLag.value = hemLag2;
      if (customUniforms.uWindTerm && windVector) {
        (customUniforms.uWindTerm.value as THREE.Vector2).set(windVector.x, windVector.y);
      }
      if (customUniforms.uTurnLean) customUniforms.uTurnLean.value = this.rotation.y;
      if (customUniforms.uBreath) customUniforms.uBreath.value = Math.sin(performance.now() * 0.0012) * 0.02;
    }

    // 6. Contact Blob Shadow Scaling by height above ground
    const heightAboveGround = Math.max(0, this.position.y - groundY);
    const shadowScale = Math.max(0.2, 1.0 - heightAboveGround * 0.45);
    this.blobShadowMesh.scale.set(shadowScale, 1.0, shadowScale);
    (this.blobShadowMesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0.1, 0.8 - heightAboveGround * 0.5);
  }

  setAnimationState(state: AnimationStateName, blendDuration = 0.15): void {
    this.animator.setState(state, blendDuration);
  }

  getAnimationState(): AnimationStateName {
    return this.animator.getState();
  }

  lookAtTarget(target: THREE.Vector3 | null, weight = 1.0): void {
    this.animator.lookAtTarget = target;
    this.animator.lookAtWeight = weight;
  }

  setSpeechLevel(level: number): void {
    this.animator.speechLevel = THREE.MathUtils.clamp(level, 0, 1);
  }

  setFormAndLeaning(form: FormId, leaning: LeaningId): void {
    this.form = form;
    this.leaning = leaning;

    // Update height scale based on form
    const hScale = form === 2 ? 1.80 / 1.72 : form === 3 ? 1.62 / 1.72 : 1.0;
    this.skeleton.root.scale.set(hScale, hScale, hScale);

    // Update materials: robe and sleeves
    const newRobeMat = this.materials.getFabricMaterial(leaning, false);
    if (this.robeMesh) {
      this.robeMesh.material = newRobeMat;
      this.robeMaterial = newRobeMat;
    }

    // Rebuild sleeves and sash
    if (this.leftSleeveGroup) this.leftSleeveGroup.removeFromParent();
    if (this.rightSleeveGroup) this.rightSleeveGroup.removeFromParent();
    if (this.sashGroup) this.sashGroup.removeFromParent();
    this.buildSleeves();
    this.buildSash();

    // Rebuild head accessories
    const removeAccessory = (mesh?: THREE.Mesh): void => {
      if (!mesh) return;
      mesh.geometry.dispose();
      mesh.removeFromParent();
    };
    removeAccessory(this.hatMesh);
    removeAccessory(this.veilMesh);
    removeAccessory(this.satchelMesh);
    removeAccessory(this.mantleMesh);
    removeAccessory(this.maskMesh);
    removeAccessory(this.cloakMesh);
    removeAccessory(this.collarMesh);
    removeAccessory(this.hairPinMesh);
    this.hatMesh = undefined;
    this.veilMesh = undefined;
    this.satchelMesh = undefined;
    this.mantleMesh = undefined;
    this.maskMesh = undefined;
    this.cloakMesh = undefined;
    this.collarMesh = undefined;
    this.hairPinMesh = undefined;

    if (this.hairMesh && this.hairMesh.parent !== this.eyeGroup) {
      this.hairMesh.geometry.dispose();
      this.hairMesh.removeFromParent();
    }
    this.hairMesh = undefined;
    if (this.eyeGroup) {
      this.eyeGroup.traverse((object) => {
        if ((object as THREE.Mesh).isMesh) (object as THREE.Mesh).geometry.dispose();
      });
      this.eyeGroup.removeFromParent();
    }
    this.buildHeadAndAccessories();
  }

  brightenEyes(brighten = true): void {
    const scale = brighten ? 2.2 : 1.0;
    this.leftEyeMesh.scale.set(scale, scale, 1.0);
    this.rightEyeMesh.scale.set(scale, scale, 1.0);
  }

  // Three.js r186 Object3D/Group has dispose()
  override dispose(): void {
    if (this.eyeGroup) {
      this.eyeGroup.traverse((object) => {
        if ((object as THREE.Mesh).isMesh) (object as THREE.Mesh).geometry.dispose();
      });
      this.eyeGroup.removeFromParent();
    }
    for (const mesh of [
      this.hatMesh, this.veilMesh, this.satchelMesh, this.staffMesh,
      this.mantleMesh, this.maskMesh, this.cloakMesh, this.collarMesh, this.hairPinMesh,
    ]) {
      if (mesh) {
        mesh.geometry.dispose();
        mesh.removeFromParent();
      }
    }
    if (this.hairMesh && this.hairMesh.parent !== this.eyeGroup) {
      this.hairMesh.geometry.dispose();
      this.hairMesh.removeFromParent();
    }
    this.robeGeometry.dispose();
    // Fabric materials are shared and owned by WandererMaterials' cache.
    // Disposing one wanderer must not invalidate materials on every other actor.
  }
}
