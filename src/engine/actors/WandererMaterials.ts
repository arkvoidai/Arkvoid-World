import * as THREE from 'three';

export type LeaningId = 'dawn' | 'dusk' | 'still';
export type FormId = 0 | 1 | 2 | 3; // 0: Traveller, 1: Scholar, 2: Warden, 3: Sage
export type ResidentId = 'hale' | 'ione' | 'tamsin' | 'corvin' | 'meilin' | 'yue' | 'sylva';

export interface LeaningColours {
  primary: THREE.Color;
  secondary: THREE.Color;
  trim: THREE.Color;
  eyeGlow: THREE.Color;
  hexEye: string;
}

export const LEANING_PALETTE: Record<LeaningId, LeaningColours> = {
  dawn: {
    primary: new THREE.Color('#36594F'), // Deep jade silk
    secondary: new THREE.Color('#78927C'), // Sage lining
    trim: new THREE.Color('#C99B5C'), // Aged brass
    eyeGlow: new THREE.Color('#F0C17B'), // Warm amber
    hexEye: '#F0C17B',
  },
  dusk: {
    primary: new THREE.Color('#343F4B'), // Slate blue
    secondary: new THREE.Color('#687B82'), // Mist silver
    trim: new THREE.Color('#BFA58A'), // Weathered silver-brass
    eyeGlow: new THREE.Color('#D9C1A1'), // Soft lantern gold
    hexEye: '#D9C1A1',
  },
  still: {
    primary: new THREE.Color('#E7E0D3'), // Warm porcelain
    secondary: new THREE.Color('#B4AA96'), // Stone taupe
    trim: new THREE.Color('#B98C52'), // Quiet gold
    eyeGlow: new THREE.Color('#F5E9C9'), // Candlelight
    hexEye: '#F5E9C9',
  },
};

export class WandererMaterials {
  private static instance: WandererMaterials | null = null;

  // Cached canvas textures
  readonly embroideryMap: THREE.CanvasTexture;
  readonly embroideryNormalMap: THREE.CanvasTexture;
  readonly wovenBambooMap: THREE.CanvasTexture;
  readonly blobShadowMap: THREE.CanvasTexture;

  // Material caches
  private readonly fabricMaterials = new Map<string, THREE.MeshPhysicalMaterial>();
  private readonly midFabricMaterials = new Map<string, THREE.MeshStandardMaterial>();
  private readonly eyeMaterials = new Map<string, THREE.MeshBasicMaterial>();
  private readonly accessoryMaterials = new Map<string, THREE.Material>();

  static get(): WandererMaterials {
    if (!WandererMaterials.instance) {
      WandererMaterials.instance = new WandererMaterials();
    }
    return WandererMaterials.instance;
  }

  constructor() {
    this.embroideryMap = this.createEmbroideryCanvas();
    this.embroideryNormalMap = this.createEmbroideryNormalCanvas();
    this.wovenBambooMap = this.createWovenBambooCanvas();
    this.blobShadowMap = this.createBlobShadowCanvas();
  }

  /**
   * Procedural embroidery pattern: subtle mountain arcs and cloud scroll motifs.
   */
  private createEmbroideryCanvas(): THREE.CanvasTexture {
    const size = 512;
    if (typeof document === 'undefined') {
      const dummy = new THREE.DataTexture(new Uint8Array(4 * 4 * 4).fill(255), 4, 4);
      dummy.needsUpdate = true;
      return dummy as unknown as THREE.CanvasTexture;
    }

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Base background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, size, size);

    // Decorative geometric cloud scroll & mountain motif bands
    ctx.strokeStyle = '#D8D0C5';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';

    // Repeating wave/mountain bands
    const bands = [64, 192, 320, 448];
    for (const y of bands) {
      ctx.beginPath();
      for (let x = 0; x <= size; x += 32) {
        const my = y + Math.sin((x / size) * Math.PI * 8) * 16;
        if (x === 0) ctx.moveTo(x, my);
        else ctx.lineTo(x, my);
      }
      ctx.stroke();

      // Small accent diamond dots
      for (let x = 16; x < size; x += 32) {
        ctx.fillStyle = '#C8BEAF';
        ctx.beginPath();
        ctx.arc(x, y + 24, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 4);
    return tex;
  }

  /**
   * Sobel/emboss normal map for thread relief embroidery.
   */
  private createEmbroideryNormalCanvas(): THREE.CanvasTexture {
    const size = 512;
    if (typeof document === 'undefined') {
      const dummy = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
      dummy.needsUpdate = true;
      return dummy as unknown as THREE.CanvasTexture;
    }

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Flat normal color (0.5, 0.5, 1.0) -> #8080FF
    ctx.fillStyle = '#8080FF';
    ctx.fillRect(0, 0, size, size);

    // Embossed thread lines
    const bands = [64, 192, 320, 448];
    for (const y of bands) {
      // Upper highlight
      ctx.strokeStyle = '#A090FF';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let x = 0; x <= size; x += 32) {
        const my = y - 1 + Math.sin((x / size) * Math.PI * 8) * 16;
        if (x === 0) ctx.moveTo(x, my);
        else ctx.lineTo(x, my);
      }
      ctx.stroke();

      // Lower shadow
      ctx.strokeStyle = '#6070FF';
      ctx.beginPath();
      for (let x = 0; x <= size; x += 32) {
        const my = y + 1 + Math.sin((x / size) * Math.PI * 8) * 16;
        if (x === 0) ctx.moveTo(x, my);
        else ctx.lineTo(x, my);
      }
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 4);
    return tex;
  }

  /**
   * Procedural woven bamboo canvas for traveller hats and accessories.
   */
  private createWovenBambooCanvas(): THREE.CanvasTexture {
    const size = 256;
    if (typeof document === 'undefined') {
      const dummy = new THREE.DataTexture(new Uint8Array([196, 169, 125, 255]), 1, 1);
      dummy.needsUpdate = true;
      return dummy as unknown as THREE.CanvasTexture;
    }

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#C2A378'; // Natural bamboo straw
    ctx.fillRect(0, 0, size, size);

    const step = 8;
    for (let x = 0; x < size; x += step) {
      for (let y = 0; y < size; y += step) {
        const isHorizontal = ((x / step) + (y / step)) % 2 === 0;
        ctx.fillStyle = isHorizontal ? '#B39164' : '#CFB085';
        ctx.fillRect(x, y, step, step);

        // Thin shadow line between weaves
        ctx.strokeStyle = '#8E6F45';
        ctx.lineWidth = 0.8;
        ctx.strokeRect(x, y, step, step);
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 4);
    return tex;
  }

  /**
   * Cached radial soft blob shadow decal.
   */
  private createBlobShadowCanvas(): THREE.CanvasTexture {
    const size = 128;
    if (typeof document === 'undefined') {
      const dummy = new THREE.DataTexture(new Uint8Array([45, 38, 62, 100]), 1, 1);
      dummy.needsUpdate = true;
      return dummy as unknown as THREE.CanvasTexture;
    }

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const grad = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
    // Soft violet-grey contact shadow
    grad.addColorStop(0, 'rgba(45, 38, 62, 0.45)');
    grad.addColorStop(0.5, 'rgba(45, 38, 62, 0.20)');
    grad.addColorStop(1, 'rgba(45, 38, 62, 0.0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }

  /**
   * Full detail MeshPhysicalMaterial with silk sheen for Near LOD.
   */
  getFabricMaterial(leaning: LeaningId, isTrim = false): THREE.MeshPhysicalMaterial {
    const key = `${leaning}_${isTrim ? 'trim' : 'main'}`;
    let mat = this.fabricMaterials.get(key);
    if (!mat) {
      const palette = LEANING_PALETTE[leaning];
      const color = isTrim ? palette.trim : palette.primary;
      const sheenTint = isTrim ? palette.trim : palette.secondary;

      mat = new THREE.MeshPhysicalMaterial({
        color,
        roughness: 0.75,
        metalness: 0.05,
        sheen: 0.6,
        sheenRoughness: 0.5,
        sheenColor: sheenTint,
        map: isTrim ? this.embroideryMap : null,
        normalMap: isTrim ? this.embroideryNormalMap : null,
        normalScale: new THREE.Vector2(0.5, 0.5),
      });
      this.fabricMaterials.set(key, mat);
    }
    return mat;
  }

  /**
   * Simplified MeshStandardMaterial without sheen for Mid LOD.
   */
  getMidFabricMaterial(leaning: LeaningId, isTrim = false): THREE.MeshStandardMaterial {
    const key = `${leaning}_${isTrim ? 'trim' : 'main'}`;
    let mat = this.midFabricMaterials.get(key);
    if (!mat) {
      const palette = LEANING_PALETTE[leaning];
      const color = isTrim ? palette.trim : palette.primary;
      mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.8,
        metalness: 0.0,
      });
      this.midFabricMaterials.set(key, mat);
    }
    return mat;
  }

  /**
   * Emissive glowing eye mark material (additive, always sharp).
   */
  getEyeMaterial(leaning: LeaningId): THREE.MeshBasicMaterial {
    let mat = this.eyeMaterials.get(leaning);
    if (!mat) {
      const palette = LEANING_PALETTE[leaning];
      mat = new THREE.MeshBasicMaterial({
        color: palette.eyeGlow,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      this.eyeMaterials.set(leaning, mat);
    }
    return mat;
  }

  /** Shared natural skin material for faces, ears and hands. */
  getSkinMaterial(): THREE.MeshStandardMaterial {
    let mat = this.accessoryMaterials.get('skin') as THREE.MeshStandardMaterial;
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color('#C98F79'),
        roughness: 0.72,
        metalness: 0,
      });
      this.accessoryMaterials.set('skin', mat);
    }
    return mat;
  }

  /** Vertex-coloured face detail material keeps the complete facial feature set to one draw call. */
  getFaceDetailMaterial(): THREE.MeshStandardMaterial {
    let mat = this.accessoryMaterials.get('faceDetails') as THREE.MeshStandardMaterial;
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color('#FFFFFF'),
        vertexColors: true,
        roughness: 0.56,
        metalness: 0,
      });
      this.accessoryMaterials.set('faceDetails', mat);
    }
    return mat;
  }

  /** Deep chestnut hair with a restrained satin response. */
  getHairMaterial(): THREE.MeshStandardMaterial {
    let mat = this.accessoryMaterials.get('hair') as THREE.MeshStandardMaterial;
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color('#30231F'),
        roughness: 0.68,
        metalness: 0,
        side: THREE.DoubleSide,
      });
      this.accessoryMaterials.set('hair', mat);
    }
    return mat;
  }

  /** Cached silk-and-metal accent used by resident hair ornaments. */
  getAdornmentMaterial(color: string): THREE.MeshStandardMaterial {
    const key = 'adornment:' + color;
    let mat = this.accessoryMaterials.get(key) as THREE.MeshStandardMaterial;
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.34,
        metalness: 0.38,
      });
      this.accessoryMaterials.set(key, mat);
    }
    return mat;
  }

  /**
   * Gauze veil material (soft semi-transparent alpha gradient).
   */
  getGauzeMaterial(): THREE.MeshStandardMaterial {
    let mat = this.accessoryMaterials.get('gauze') as THREE.MeshStandardMaterial;
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color('#ECE8F2'),
        transparent: true,
        opacity: 0.62,
        roughness: 0.85,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      this.accessoryMaterials.set('gauze', mat);
    }
    return mat;
  }

  /**
   * Woven bamboo material for straw hats and accessories.
   */
  getBambooMaterial(): THREE.MeshStandardMaterial {
    let mat = this.accessoryMaterials.get('bamboo') as THREE.MeshStandardMaterial;
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color('#C4A97D'),
        map: this.wovenBambooMap,
        roughness: 0.8,
        metalness: 0.05,
      });
      this.accessoryMaterials.set('bamboo', mat);
    }
    return mat;
  }

  /**
   * Contact blob shadow material.
   */
  getBlobShadowMaterial(): THREE.MeshBasicMaterial {
    let mat = this.accessoryMaterials.get('blobShadow') as THREE.MeshBasicMaterial;
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({
        map: this.blobShadowMap,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
      });
      this.accessoryMaterials.set('blobShadow', mat);
    }
    return mat;
  }

  /**
   * Concentric expanding gathering ring material.
   */
  getGatheringRingMaterial(leaning: LeaningId): THREE.MeshBasicMaterial {
    const key = `gatherRing_${leaning}`;
    let mat = this.accessoryMaterials.get(key) as THREE.MeshBasicMaterial;
    if (!mat) {
      const palette = LEANING_PALETTE[leaning];
      mat = new THREE.MeshBasicMaterial({
        color: palette.eyeGlow,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      this.accessoryMaterials.set(key, mat);
    }
    return mat;
  }

  dispose(): void {
    this.embroideryMap.dispose();
    this.embroideryNormalMap.dispose();
    this.wovenBambooMap.dispose();
    this.blobShadowMap.dispose();
    for (const mat of this.fabricMaterials.values()) mat.dispose();
    for (const mat of this.midFabricMaterials.values()) mat.dispose();
    for (const mat of this.eyeMaterials.values()) mat.dispose();
    for (const mat of this.accessoryMaterials.values()) mat.dispose();
    this.fabricMaterials.clear();
    this.midFabricMaterials.clear();
    this.eyeMaterials.clear();
    this.accessoryMaterials.clear();
    WandererMaterials.instance = null;
  }
}
