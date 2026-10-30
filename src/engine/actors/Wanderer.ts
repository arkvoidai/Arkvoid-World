import * as THREE from 'three';
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
    const skinMat = new THREE.MeshStandardMaterial({
      color: '#E0D6C8',
      roughness: 0.8,
    });

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
  private buildHeadAndAccessories(): void {
    // Eye Marks: 2 glowing marks on veil/mask (emissive, additive, >= 2px screen size)
    this.eyeGroup = new THREE.Group();
    this.eyeGroup.name = 'eye_marks';

    const eyeMat = this.materials.getEyeMaterial(this.leaning);
    const eyeGeo = new THREE.PlaneGeometry(0.024, 0.012);

    this.leftEyeMesh = new THREE.Mesh(eyeGeo, eyeMat);
    this.leftEyeMesh.position.set(0.038, 0.05, 0.11);
    this.eyeGroup.add(this.leftEyeMesh);

    this.rightEyeMesh = new THREE.Mesh(eyeGeo, eyeMat);
    this.rightEyeMesh.position.set(-0.038, 0.05, 0.11);
    this.eyeGroup.add(this.rightEyeMesh);

    this.skeleton.head.add(this.eyeGroup);

    // Form Specific Accessories
    switch (this.form) {
      case 0: {
        // Form 0: Traveller - wide bamboo hat with soft gauze veil hanging to shoulders, short cloak
        const bambooMat = this.materials.getBambooMaterial();
        const gauzeMat = this.materials.getGauzeMaterial();

        // Conical bamboo hat
        const hatGeo = new THREE.ConeGeometry(0.44, 0.15, 24, 1, true);
        this.hatMesh = new THREE.Mesh(hatGeo, bambooMat);
        this.hatMesh.position.y = 0.14;
        this.skeleton.head.add(this.hatMesh);

        // Gauze veil hanging from hat rim
        const veilGeo = new THREE.CylinderGeometry(0.42, 0.45, 0.34, 20, 1, true);
        this.veilMesh = new THREE.Mesh(veilGeo, gauzeMat);
        this.veilMesh.position.y = -0.10;
        this.hatMesh.add(this.veilMesh);

        // Short cloak over shoulders
        const cloakGeo = new THREE.ConeGeometry(0.34, 0.45, 16, 1, true);
        const cloakMat = this.materials.getFabricMaterial(this.leaning, true);
        const cloakMesh = new THREE.Mesh(cloakGeo, cloakMat);
        cloakMesh.position.y = -0.06;
        cloakMesh.scale.set(1.0, 1.0, 0.7);
        this.skeleton.chest.add(cloakMesh);
        break;
      }

      case 1: {
        // Form 1: Scholar - deep hood with face veil, longer layered robe, satchel at hip
        const fabricMat = this.materials.getFabricMaterial(this.leaning, false);
        const gauzeMat = this.materials.getGauzeMaterial();

        // Deep hood
        const hoodGeo = new THREE.SphereGeometry(0.18, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.7);
        const hoodMesh = new THREE.Mesh(hoodGeo, fabricMat);
        hoodMesh.position.set(0, 0.06, -0.02);
        hoodMesh.scale.set(0.9, 1.1, 1.1);
        this.skeleton.head.add(hoodMesh);

        // Face veil
        const faceVeilGeo = new THREE.PlaneGeometry(0.18, 0.22);
        this.veilMesh = new THREE.Mesh(faceVeilGeo, gauzeMat);
        this.veilMesh.position.set(0, -0.02, 0.115);
        this.skeleton.head.add(this.veilMesh);

        // Leather satchel at right hip
        const satchelMat = new THREE.MeshStandardMaterial({ color: '#4A3425', roughness: 0.7 });
        this.satchelMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.06), satchelMat);
        this.satchelMesh.position.set(-0.22, 0.82, 0.05);
        this.skeleton.root.add(this.satchelMesh);
        break;
      }

      case 2: {
        // Form 2: Warden - taller 1.80m, shoulder mantle, topknot with hairpin, plain half-mask
        const trimMat = this.materials.getFabricMaterial(this.leaning, true);

        // Shoulder mantle
        const mantleGeo = new THREE.CylinderGeometry(0.24, 0.36, 0.25, 16, 1, true);
        this.mantleMesh = new THREE.Mesh(mantleGeo, trimMat);
        this.mantleMesh.position.y = 0.08;
        this.mantleMesh.scale.set(1.2, 1.0, 0.85);
        this.skeleton.chest.add(this.mantleMesh);

        // Topknot and hair pin
        const hairMat = new THREE.MeshStandardMaterial({ color: '#1B1822', roughness: 0.9 });
        const topknot = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), hairMat);
        topknot.position.set(0, 0.16, -0.04);
        this.skeleton.head.add(topknot);

        // Half mask
        const maskMat = new THREE.MeshStandardMaterial({ color: '#D9D3C7', roughness: 0.6 });
        this.maskMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.08, 12, 1, true, -Math.PI / 3, (Math.PI * 2) / 3), maskMat);
        this.maskMesh.position.set(0, 0.02, 0.02);
        this.skeleton.head.add(this.maskMesh);
        break;
      }

      case 3: {
        // Form 3: Sage - shorter 1.62m, high collar, hair bun with ornaments, hooded wrap
        const trimMat = this.materials.getFabricMaterial(this.leaning, true);

        // High collar
        const collarGeo = new THREE.CylinderGeometry(0.12, 0.14, 0.12, 16, 1, true);
        const collar = new THREE.Mesh(collarGeo, trimMat);
        collar.position.y = 0.08;
        this.skeleton.neck.add(collar);

        // Hair bun with gold pin
        const hairMat = new THREE.MeshStandardMaterial({ color: '#24202B', roughness: 0.9 });
        const bun = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 10), hairMat);
        bun.position.set(0, 0.12, -0.08);
        this.skeleton.head.add(bun);

        const goldMat = new THREE.MeshStandardMaterial({ color: '#D8A24A', roughness: 0.3, metalness: 0.8 });
        const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.22), goldMat);
        pin.rotation.z = Math.PI / 3;
        pin.position.set(0, 0.12, -0.08);
        this.skeleton.head.add(pin);
        break;
      }
    }

    // Resident specific additions
    if (this.resident === 'hale') {
      // Long white beard geometry & wooden staff
      const beardMat = new THREE.MeshStandardMaterial({ color: '#EAE6DF', roughness: 0.85 });
      const beardGeo = new THREE.ConeGeometry(0.06, 0.35, 8);
      beardGeo.rotateX(Math.PI);
      const beard = new THREE.Mesh(beardGeo, beardMat);
      beard.position.set(0, -0.08, 0.08);
      this.skeleton.head.add(beard);

      // Wooden staff
      const woodMat = new THREE.MeshStandardMaterial({ color: '#5C4431', roughness: 0.8 });
      const staffGeo = new THREE.CylinderGeometry(0.02, 0.02, 1.85, 8);
      this.staffMesh = new THREE.Mesh(staffGeo, woodMat);
      this.staffMesh.position.set(0.32, 0.70, 0.12);
      this.skeleton.root.add(this.staffMesh);
    } else if (this.resident === 'ione') {
      // Round glasses frames & scroll case
      const scrollMat = new THREE.MeshStandardMaterial({ color: '#7A5B3D', roughness: 0.7 });
      const scrollCase = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.38, 8), scrollMat);
      scrollCase.rotation.z = Math.PI / 4;
      scrollCase.position.set(-0.25, 0.75, -0.08);
      this.skeleton.root.add(scrollCase);
    } else if (this.resident === 'tamsin') {
      // Lantern pole
      const poleMat = new THREE.MeshStandardMaterial({ color: '#443B33', roughness: 0.8 });
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.95, 8), poleMat);
      pole.position.set(0.34, 0.75, 0.15);

      const lanternMat = new THREE.MeshBasicMaterial({ color: '#FFA040' });
      const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), lanternMat);
      lantern.position.y = 0.95;
      pole.add(lantern);
      this.skeleton.root.add(pole);
    } else if (this.resident === 'corvin') {
      // Wooden practice sword in scabbard
      const swordMat = new THREE.MeshStandardMaterial({ color: '#8A7056', roughness: 0.7 });
      const sword = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.75, 0.02), swordMat);
      sword.rotation.z = -Math.PI / 5;
      sword.position.set(-0.20, 0.65, -0.05);
      this.skeleton.root.add(sword);
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
    if (this.hatMesh) { this.hatMesh.removeFromParent(); this.hatMesh = undefined; }
    if (this.veilMesh) { this.veilMesh.removeFromParent(); this.veilMesh = undefined; }
    if (this.satchelMesh) { this.satchelMesh.removeFromParent(); this.satchelMesh = undefined; }
    if (this.mantleMesh) { this.mantleMesh.removeFromParent(); this.mantleMesh = undefined; }
    if (this.maskMesh) { this.maskMesh.removeFromParent(); this.maskMesh = undefined; }
    if (this.hairMesh) { this.hairMesh.removeFromParent(); this.hairMesh = undefined; }
    if (this.eyeGroup) this.eyeGroup.removeFromParent();
    this.buildHeadAndAccessories();
  }

  brightenEyes(brighten = true): void {
    const scale = brighten ? 2.2 : 1.0;
    this.leftEyeMesh.scale.set(scale, scale, 1.0);
    this.rightEyeMesh.scale.set(scale, scale, 1.0);
  }

  // Three.js r186 Object3D/Group has dispose()
  override dispose(): void {
    this.robeGeometry.dispose();
    if (this.robeMaterial instanceof THREE.Material) {
      this.robeMaterial.dispose();
    }
  }
}
