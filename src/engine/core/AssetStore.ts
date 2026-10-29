import * as THREE from 'three';
import {
  TEXTURE_SLOTS,
  type TextureSlotConfig,
  type TextureSlotId,
} from '@/config/assets';
import { TEXTURE_TUNING } from '@/config/textureTuning';
import type { DeviceProfile } from '@/lib/deviceProfile';
import { TextureCatalog } from '@/engine/core/TextureCatalog';

export interface TextureSlotMaps {
  slot: TextureSlotId;
  diff: THREE.Texture;
  nor: THREE.Texture;
  arm?: THREE.Texture;
  crossfadeAlpha: number; // 0 = fallback, 1 = fully real
  isReal: boolean;
  isLoading: boolean;
  error?: string;
  bytesEstimate: number;
  albedoGain: number;
  flipGreen: boolean;
  chosenRes: number;
  fileSizeBytes: number;
  setKey: string;
  mapsFound: string[];
  thumbnailUrl?: string;
  meanLuminance: number;
  postGainLuminance: number;
  meanHueDeg: number;
  meanSaturation: number;
  stripeRatio: number;
  isSuspicious: boolean;
  suspicionReason?: string;
}

export interface AssetSlotReport {
  slot: TextureSlotId;
  setKey: string;
  diffStatus: 'present' | 'missing' | 'fallback';
  norStatus: 'present' | 'missing' | 'fallback';
  armStatus: 'present' | 'missing' | 'fallback';
  mapsFound: string[];
  chosenRes: number;
  fileSizeBytes: number;
  normalConvention: 'GL' | 'Flipped DX';
  albedoGain: number;
  thumbnailUrl?: string;
  isReal: boolean;
  nominalRoughness: number;
  uvScaleMeters: number;
  meanLuminance: number;
  postGainLuminance: number;
  meanHueDeg: number;
  meanSaturation: number;
  stripeRatio: number;
  isSuspicious: boolean;
  suspicionReason?: string;
}

export interface AssetStoreReport {
  tierTargetRes: number;
  anisotropy: number;
  totalTextureMemoryBytes: number;
  totalTextureMemoryMb: number;
  totalDownloadBytes: number;
  totalDownloadMb: number;
  isDownloadBudgetExceeded: boolean; // > 40 MB
  isMemoryBudgetExceeded: boolean; // > 60 MB phone, > 200 MB desktop
  unusedSets: string[];
  ignoredFiles: string[];
  slots: AssetSlotReport[];
}

declare global {
  interface Window {
    __ARKVOID_ASSETS__?: AssetStoreReport;
  }
}

// Priority order: grass, rock, path, moss, then architecture slots, then bark
export const LOAD_PRIORITY: TextureSlotId[] = [
  'grass',
  'rock',
  'path',
  'moss',
  'stone',
  'timber',
  'roof',
  'plaster',
  'bark',
];

export class AssetStore {
  private readonly device: DeviceProfile;
  private targetRes: number;
  private readonly maxAnisotropy: number;
  private readonly catalog: TextureCatalog;
  private readonly slots = new Map<TextureSlotId, TextureSlotMaps>();
  private readonly uploadQueue: THREE.Texture[] = [];
  private readonly crossfadeTransitions = new Map<
    TextureSlotId,
    { startTime: number; duration: number }
  >();
  private disposed = false;
  private disableRealTextures = false;

  constructor(device: DeviceProfile) {
    this.device = device;
    this.catalog = TextureCatalog.getInstance();

    // Check ?tex=0 override
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('tex') === '0') {
        this.disableRealTextures = true;
      }
    }

    // Tier budgets
    // desktop-high: 1024 (2048 only if 2k set exists and GPU tier is high)
    // desktop-mid and high phones: 1024
    // mid phones: 512
    // low phones: 256
    const isDesktop = device.deviceClass === 'desktop';
    if (isDesktop && device.gpuTier >= 3) {
      this.targetRes = 1024;
      this.maxAnisotropy = 8;
    } else if (device.gpuTier >= 2) {
      this.targetRes = 1024;
      this.maxAnisotropy = 4;
    } else if (device.gpuTier === 1) {
      this.targetRes = 512;
      this.maxAnisotropy = 2;
    } else {
      this.targetRes = 256;
      this.maxAnisotropy = 1;
    }

    // Initialise procedural fallback textures first for instantaneous zero-wait startup
    this.initFallbackTextures();

    // Begin background loading if real textures are not disabled
    if (!this.disableRealTextures) {
      this.startBackgroundLoading();
    }
  }

  getSlot(id: TextureSlotId): TextureSlotMaps {
    const s = this.slots.get(id);
    if (!s) {
      throw new Error(`Texture slot ${id} not initialized in AssetStore`);
    }
    return s;
  }

  getSlotConfig(id: TextureSlotId): TextureSlotConfig {
    return TEXTURE_SLOTS[id];
  }

  getSlotTuning(id: TextureSlotId) {
    return TEXTURE_TUNING[id];
  }

  update(_deltaSeconds: number, renderer?: THREE.WebGLRenderer): void {
    // 1. Process at most one texture upload per frame to avoid GPU pipeline stalls
    if (renderer && this.uploadQueue.length > 0) {
      const tex = this.uploadQueue.shift();
      if (tex && !this.disposed) {
        try {
          renderer.initTexture(tex);
        } catch {
          // ignore upload error in headless/mock environments
        }
      }
    }

    // 2. Crossfade transitions (400 ms)
    if (this.crossfadeTransitions.size > 0) {
      const now = performance.now();
      for (const [id, trans] of this.crossfadeTransitions.entries()) {
        const elapsed = now - trans.startTime;
        const progress = Math.min(1.0, elapsed / trans.duration);
        const slot = this.slots.get(id);
        if (slot) {
          slot.crossfadeAlpha = progress;
        }
        if (progress >= 1.0) {
          this.crossfadeTransitions.delete(id);
        }
      }
    }
  }

  private initFallbackTextures(): void {
    const allSlotIds = Object.keys(TEXTURE_SLOTS) as TextureSlotId[];
    for (const id of allSlotIds) {
      const { diff, nor, arm, bytes } = this.generateProceduralFallback(id);
      this.slots.set(id, {
        slot: id,
        diff,
        nor,
        arm,
        crossfadeAlpha: 0,
        isReal: false,
        isLoading: false,
        bytesEstimate: bytes,
        albedoGain: 1.0,
        flipGreen: false,
        chosenRes: 512,
        fileSizeBytes: 0,
        setKey: 'procedural_fallback',
        mapsFound: ['diff', 'nor', 'arm'],
        thumbnailUrl: undefined,
        meanLuminance: TEXTURE_TUNING[id].targetMeanLuminance,
        postGainLuminance: TEXTURE_TUNING[id].targetMeanLuminance,
        meanHueDeg: id === 'grass' || id === 'moss' ? 105 : 34,
        meanSaturation: 0.22,
        stripeRatio: 1.0,
        isSuspicious: false,
      });
    }
  }

  private generateProceduralFallback(id: TextureSlotId): {
    diff: THREE.CanvasTexture;
    nor: THREE.CanvasTexture;
    arm: THREE.CanvasTexture;
    bytes: number;
  } {
    const size = 512;
    if (typeof document === 'undefined') {
      const dummyData = new Uint8Array(4 * 4 * 4).fill(128);
      const diff = new THREE.DataTexture(dummyData, 4, 4);
      const nor = new THREE.DataTexture(dummyData, 4, 4);
      const arm = new THREE.DataTexture(dummyData, 4, 4);
      return { diff: diff as unknown as THREE.CanvasTexture, nor: nor as unknown as THREE.CanvasTexture, arm: arm as unknown as THREE.CanvasTexture, bytes: 3 * size * size * 4 * 1.33 };
    }

    const diffCanvas = document.createElement('canvas');
    diffCanvas.width = size;
    diffCanvas.height = size;
    const diffCtx = diffCanvas.getContext('2d')!;

    const heightData = new Float32Array(size * size);
    const imgData = diffCtx.createImageData(size, size);
    const d = imgData.data;

    const noise2D = (x: number, y: number): number => {
      const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453123;
      return n - Math.floor(n);
    };

    const smoothNoise = (x: number, y: number): number => {
      const i = Math.floor(x);
      const j = Math.floor(y);
      const fx = x - i;
      const fy = y - j;
      const sx = fx * fx * (3 - 2 * fx);
      const sy = fy * fy * (3 - 2 * fy);

      const s = size;
      const n00 = noise2D(((i % s) + s) % s, ((j % s) + s) % s);
      const n10 = noise2D((((i + 1) % s) + s) % s, ((j % s) + s) % s);
      const n01 = noise2D(((i % s) + s) % s, (((j + 1) % s) + s) % s);
      const n11 = noise2D((((i + 1) % s) + s) % s, (((j + 1) % s) + s) % s);

      const top = n00 + sx * (n10 - n00);
      const bot = n01 + sx * (n11 - n01);
      return top + sy * (bot - top);
    };

    const fbm = (x: number, y: number, oct = 4): number => {
      let val = 0;
      let amp = 0.5;
      let freq = 1;
      for (let o = 0; o < oct; o++) {
        val += amp * smoothNoise(x * freq, y * freq);
        freq *= 2;
        amp *= 0.5;
      }
      return val;
    };

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = y * size + x;
        const pIdx = idx * 4;

        let r = 128;
        let g = 128;
        let b = 128;
        let h = 0.5;

        switch (id) {
          case 'grass': {
            const nFine = fbm(x * 0.15, y * 0.15, 3);
            const nCoarse = fbm(x * 0.02, y * 0.02, 3);
            h = nFine * 0.6 + nCoarse * 0.4;
            r = Math.floor(80 + h * 45);
            g = Math.floor(130 + h * 45);
            b = Math.floor(48 + h * 25);
            break;
          }
          case 'moss': {
            const n = fbm(x * 0.12, y * 0.12, 4);
            const speck = noise2D(x * 0.8, y * 0.8) > 0.6 ? 0.15 : 0;
            h = Math.min(1.0, n + speck);
            r = Math.floor(65 + h * 35);
            g = Math.floor(95 + h * 35);
            b = Math.floor(40 + h * 25);
            break;
          }
          case 'rock': {
            const strata =
              Math.sin(y * 0.08 + fbm(x * 0.03, y * 0.03, 3) * 6.0) * 0.5 + 0.5;
            const cracks = fbm(x * 0.05, y * 0.05, 4);
            h = strata * 0.5 + cracks * 0.5;
            r = Math.floor(125 + h * 30);
            g = Math.floor(118 + h * 25);
            b = Math.floor(116 + h * 28);
            break;
          }
          case 'path': {
            const cellX = (x % 32) / 32;
            const cellY = (y % 32) / 32;
            const joint = cellX < 0.08 || cellY < 0.08 ? 0.35 : 1.0;
            const n = fbm(x * 0.04, y * 0.04, 3);
            h = n * joint;
            r = Math.floor((170 + n * 25) * joint);
            g = Math.floor((162 + n * 22) * joint);
            b = Math.floor((148 + n * 22) * joint);
            break;
          }
          case 'bark': {
            const grain = fbm(x * 0.08, y * 0.015, 4);
            h = grain;
            r = Math.floor(95 + h * 25);
            g = Math.floor(72 + h * 20);
            b = Math.floor(55 + h * 18);
            break;
          }
          case 'timber': {
            const grain = smoothNoise(x * 0.04, y * 0.008);
            h = grain;
            r = Math.floor(85 + h * 20);
            g = Math.floor(58 + h * 15);
            b = Math.floor(40 + h * 12);
            break;
          }
          case 'roof': {
            const row = (y % 24) / 24;
            const lip = row > 0.85 ? 0.55 : 1.0;
            const n = fbm(x * 0.04, y * 0.04, 2);
            h = n * lip;
            r = Math.floor(55 * lip);
            g = Math.floor(72 * lip);
            b = Math.floor(78 * lip);
            break;
          }
          case 'plaster': {
            const n = fbm(x * 0.03, y * 0.03, 3);
            h = n;
            r = Math.floor(210 + h * 15);
            g = Math.floor(205 + h * 15);
            b = Math.floor(192 + h * 15);
            break;
          }
          case 'stone': {
            const bx = (x % 64) / 64;
            const by = (y % 48) / 48;
            const edge = bx < 0.06 || by < 0.06 ? 0.4 : 1.0;
            const n = fbm(x * 0.02, y * 0.02, 3);
            h = n * edge;
            r = Math.floor((175 + n * 20) * edge);
            g = Math.floor((168 + n * 20) * edge);
            b = Math.floor((155 + n * 20) * edge);
            break;
          }
        }

        d[pIdx] = Math.min(255, Math.max(0, r));
        d[pIdx + 1] = Math.min(255, Math.max(0, g));
        d[pIdx + 2] = Math.min(255, Math.max(0, b));
        d[pIdx + 3] = 255;
        heightData[idx] = h;
      }
    }

    diffCtx.putImageData(imgData, 0, 0);

    const norCanvas = document.createElement('canvas');
    norCanvas.width = size;
    norCanvas.height = size;
    const norCtx = norCanvas.getContext('2d')!;
    const norImg = norCtx.createImageData(size, size);
    const nd = norImg.data;

    const armCanvas = document.createElement('canvas');
    armCanvas.width = size;
    armCanvas.height = size;
    const armCtx = armCanvas.getContext('2d')!;
    const armImg = armCtx.createImageData(size, size);
    const ad = armImg.data;
    const nominalRough = TEXTURE_TUNING[id].nominalRoughness;

    const normalScale = 1.8;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const xL = (x - 1 + size) % size;
        const xR = (x + 1) % size;
        const yU = (y - 1 + size) % size;
        const yD = (y + 1) % size;

        const hL = heightData[y * size + xL]!;
        const hR = heightData[y * size + xR]!;
        const hU = heightData[yU * size + x]!;
        const hD = heightData[yD * size + x]!;

        const dx = (hR - hL) * normalScale;
        const dy = (hD - hU) * normalScale;
        const dz = 1.0;

        const len = Math.hypot(dx, dy, dz);
        const nx = -dx / len;
        const ny = -dy / len;
        const nz = dz / len;

        const pIdx = (y * size + x) * 4;
        nd[pIdx] = Math.floor((nx * 0.5 + 0.5) * 255);
        nd[pIdx + 1] = Math.floor((ny * 0.5 + 0.5) * 255);
        nd[pIdx + 2] = Math.floor((nz * 0.5 + 0.5) * 255);
        nd[pIdx + 3] = 255;

        const ao = Math.max(0.65, Math.min(1.0, 1.0 - (1.0 - heightData[y * size + x]!) * 0.35));
        ad[pIdx] = Math.floor(ao * 255);
        ad[pIdx + 1] = Math.floor(nominalRough * 255);
        ad[pIdx + 2] = 0;
        ad[pIdx + 3] = 255;
      }
    }
    norCtx.putImageData(norImg, 0, 0);
    armCtx.putImageData(armImg, 0, 0);

    const diffTex = new THREE.CanvasTexture(diffCanvas);
    diffTex.wrapS = THREE.RepeatWrapping;
    diffTex.wrapT = THREE.RepeatWrapping;
    diffTex.colorSpace = THREE.SRGBColorSpace;
    diffTex.generateMipmaps = true;
    diffTex.anisotropy = this.maxAnisotropy;

    const norTex = new THREE.CanvasTexture(norCanvas);
    norTex.wrapS = THREE.RepeatWrapping;
    norTex.wrapT = THREE.RepeatWrapping;
    norTex.colorSpace = THREE.LinearSRGBColorSpace;
    norTex.generateMipmaps = true;
    norTex.anisotropy = this.maxAnisotropy;

    const armTex = new THREE.CanvasTexture(armCanvas);
    armTex.wrapS = THREE.RepeatWrapping;
    armTex.wrapT = THREE.RepeatWrapping;
    armTex.colorSpace = THREE.LinearSRGBColorSpace;
    armTex.generateMipmaps = true;
    armTex.anisotropy = this.maxAnisotropy;

    const bytes = 3 * size * size * 4 * 1.33;

    return { diff: diffTex, nor: norTex, arm: armTex, bytes };
  }

  private startBackgroundLoading(): void {
    void (async () => {
      for (const slotId of LOAD_PRIORITY) {
        if (this.disposed) return;
        await this.loadSlotFromRepo(slotId);
      }
    })();
  }

  private async loadSlotFromRepo(slotId: TextureSlotId): Promise<void> {
    const assignment = this.catalog.assignments[slotId];
    if (!assignment?.assignedSet) {
      // Slot has no real texture set assigned; keeps procedural fallback
      return;
    }

    const set = assignment.assignedSet;
    const slotState = this.slots.get(slotId);
    if (!slotState) return;

    slotState.isLoading = true;
    slotState.setKey = set.setKey;

    try {
      // Pick best file for diffuse, normal, arm, rough, ao
      const diffFile = this.catalog.pickFileForMap(slotId, 'diff', this.targetRes);
      const norFile = this.catalog.pickFileForMap(slotId, 'nor', this.targetRes);
      const armFile = this.catalog.pickFileForMap(slotId, 'arm', this.targetRes);
      const roughFile = this.catalog.pickFileForMap(slotId, 'rough', this.targetRes);
      const aoFile = this.catalog.pickFileForMap(slotId, 'ao', this.targetRes);

      if (!diffFile) {
        slotState.isLoading = false;
        return;
      }

      const mapsFound: string[] = ['diff'];
      if (norFile) mapsFound.push('nor');
      if (armFile) mapsFound.push('arm');
      if (roughFile) mapsFound.push('rough');
      if (aoFile) mapsFound.push('ao');
      slotState.mapsFound = mapsFound;

      // 1. Fetch & decode diffuse map off-thread
      const diffDecoded = await this.fetchAndDecodeImage(diffFile.url, this.targetRes);
      if (!diffDecoded || this.disposed) {
        slotState.isLoading = false;
        return;
      }

      // Compute mean luminance, hue, stripe ratio & albedo gain on a 32x32 downsample
      const stats = this.computeLuminanceAndThumb(diffDecoded);
      const meanLuminance = stats.meanLuminance;
      const thumbDataUrl = stats.thumbDataUrl;
      const targetMean = TEXTURE_TUNING[slotId].targetMeanLuminance;
      const maxGain = slotId === 'plaster' ? 1.85 : 1.6;
      const uAlbedoGain = Math.min(maxGain, Math.max(0.6, targetMean / (meanLuminance || 0.01)));
      const postGainLuminance = Math.min(1.0, meanLuminance * uAlbedoGain);
      const { isSuspicious, reason } = this.evaluateSuspicion(
        slotId,
        stats.meanHueDeg,
        stats.meanSaturation,
        stats.stripeRatio,
        postGainLuminance,
      );

      const diffTex = new THREE.Texture(diffDecoded);
      diffTex.wrapS = THREE.RepeatWrapping;
      diffTex.wrapT = THREE.RepeatWrapping;
      diffTex.colorSpace = THREE.SRGBColorSpace;
      diffTex.generateMipmaps = true;
      diffTex.minFilter = THREE.LinearMipmapLinearFilter;
      diffTex.magFilter = THREE.LinearFilter;
      diffTex.anisotropy = this.maxAnisotropy;
      diffTex.flipY = false;
      diffTex.needsUpdate = true;

      // 2. Fetch or synthesize Normal Map
      let norTex: THREE.Texture;
      let flipGreen = false;
      if (norFile) {
        flipGreen = norFile.flipGreen;
        const norDecoded = await this.fetchAndDecodeImage(norFile.url, this.targetRes);
        if (norDecoded) {
          norTex = new THREE.Texture(norDecoded);
          norTex.wrapS = THREE.RepeatWrapping;
          norTex.wrapT = THREE.RepeatWrapping;
          norTex.colorSpace = THREE.LinearSRGBColorSpace;
          norTex.generateMipmaps = true;
          norTex.minFilter = THREE.LinearMipmapLinearFilter;
          norTex.magFilter = THREE.LinearFilter;
          norTex.anisotropy = this.maxAnisotropy;
          norTex.flipY = false;
          norTex.needsUpdate = true;
        } else {
          norTex = this.deriveNormalMapFromImage(diffDecoded);
        }
      } else {
        norTex = this.deriveNormalMapFromImage(diffDecoded);
      }

      // 3. Fetch or synthesize ARM Map
      let armTex: THREE.Texture | undefined;
      if (armFile) {
        const armDecoded = await this.fetchAndDecodeImage(armFile.url, this.targetRes);
        if (armDecoded) {
          armTex = new THREE.Texture(armDecoded);
          armTex.wrapS = THREE.RepeatWrapping;
          armTex.wrapT = THREE.RepeatWrapping;
          armTex.colorSpace = THREE.LinearSRGBColorSpace;
          armTex.generateMipmaps = true;
          armTex.minFilter = THREE.LinearMipmapLinearFilter;
          armTex.magFilter = THREE.LinearFilter;
          armTex.anisotropy = this.maxAnisotropy;
          armTex.flipY = false;
          armTex.needsUpdate = true;
        }
      } else if (roughFile || aoFile) {
        armTex = await this.synthesizeArmFromRoughAndAo(
          roughFile?.url,
          aoFile?.url,
          TEXTURE_TUNING[slotId].nominalRoughness,
        );
      }

      if (this.disposed) {
        diffTex.dispose();
        norTex.dispose();
        armTex?.dispose();
        return;
      }

      // Queue textures for gradual upload
      this.uploadQueue.push(diffTex);
      this.uploadQueue.push(norTex);
      if (armTex) this.uploadQueue.push(armTex);

      // Memory estimation
      const w = this.targetRes;
      const h = this.targetRes;
      const mapCount = armTex ? 3 : 2;
      const totalBytes = mapCount * w * h * 4 * 1.33;

      // Dispose fallback textures
      slotState.diff.dispose();
      slotState.nor.dispose();
      slotState.arm?.dispose();

      // Apply real textures
      slotState.diff = diffTex;
      slotState.nor = norTex;
      if (armTex) slotState.arm = armTex;
      slotState.isReal = true;
      slotState.isLoading = false;
      slotState.albedoGain = uAlbedoGain;
      slotState.flipGreen = flipGreen;
      slotState.chosenRes = diffFile.resolution || this.targetRes;
      slotState.fileSizeBytes = diffFile.fileSizeBytes + (norFile?.fileSizeBytes || 0);
      slotState.bytesEstimate = totalBytes;
      slotState.thumbnailUrl = thumbDataUrl;
      slotState.meanLuminance = meanLuminance;
      slotState.postGainLuminance = postGainLuminance;
      slotState.meanHueDeg = stats.meanHueDeg;
      slotState.meanSaturation = stats.meanSaturation;
      slotState.stripeRatio = stats.stripeRatio;
      slotState.isSuspicious = isSuspicious;
      slotState.suspicionReason = reason;

      // Start 400 ms crossfade
      this.crossfadeTransitions.set(slotId, {
        startTime: performance.now(),
        duration: 400,
      });
    } catch (err) {
      if (!this.disposed) {
        slotState.isLoading = false;
        slotState.error = err instanceof Error ? err.message : String(err);
      }
    }
  }

  private async fetchAndDecodeImage(
    url: string,
    targetRes: number,
  ): Promise<ImageBitmap | HTMLImageElement | null> {
    try {
      const resp = await fetch(url);
      if (!resp.ok) return null;
      const blob = await resp.blob();
      if (!blob || blob.size === 0) return null;

      if (typeof createImageBitmap !== 'undefined') {
        return await createImageBitmap(blob, {
          resizeWidth: targetRes,
          resizeHeight: targetRes,
          resizeQuality: 'high',
          imageOrientation: 'flipY',
        });
      }

      if (typeof Image !== 'undefined') {
        const img = new Image();
        img.src = URL.createObjectURL(blob);
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });
        return img;
      }

      return null;
    } catch {
      return null;
    }
  }

  private evaluateSuspicion(
    slotId: TextureSlotId,
    meanHueDeg: number,
    meanSat: number,
    stripeRatio: number,
    postGainLum: number,
  ): { isSuspicious: boolean; reason?: string } {
    if (
      (slotId === 'path' || slotId === 'stone') &&
      meanHueDeg >= 15 &&
      meanHueDeg <= 42 &&
      meanSat > 0.35 &&
      stripeRatio > 1.85
    ) {
      return {
        isSuspicious: true,
        reason: `${slotId} has wood-like orange-brown hue (${meanHueDeg.toFixed(0)}deg) and high horizontal stripe ratio (${stripeRatio.toFixed(2)})`,
      };
    }
    if ((slotId === 'bark' || slotId === 'timber') && meanHueDeg >= 75 && meanHueDeg <= 165 && meanSat > 0.20) {
      return {
        isSuspicious: true,
        reason: `${slotId} has green mean hue (${meanHueDeg.toFixed(0)}deg)`,
      };
    }
    if (slotId === 'plaster' && postGainLum < 0.6) {
      return {
        isSuspicious: true,
        reason: `plaster post-gain luminance (${postGainLum.toFixed(2)}) is under 0.60`,
      };
    }
    return { isSuspicious: false };
  }

  private computeLuminanceAndThumb(
    img: ImageBitmap | HTMLImageElement,
  ): {
    meanLuminance: number;
    meanHueDeg: number;
    meanSaturation: number;
    stripeRatio: number;
    thumbDataUrl?: string;
  } {
    if (typeof document === 'undefined') {
      return { meanLuminance: 0.5, meanHueDeg: 35, meanSaturation: 0.15, stripeRatio: 1.0 };
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 32;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return { meanLuminance: 0.5, meanHueDeg: 35, meanSaturation: 0.15, stripeRatio: 1.0 };
      }

      ctx.drawImage(img, 0, 0, 32, 32);
      const data = ctx.getImageData(0, 0, 32, 32).data;

      let sumLum = 0;
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      const pixelCount = 32 * 32;
      const lums = new Float32Array(pixelCount);

      for (let i = 0; i < pixelCount; i++) {
        const p = i * 4;
        const r = data[p]! / 255.0;
        const g = data[p + 1]! / 255.0;
        const b = data[p + 2]! / 255.0;
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        lums[i] = lum;
        sumLum += lum;
        sumR += r;
        sumG += g;
        sumB += b;
      }

      const mR = sumR / pixelCount;
      const mG = sumG / pixelCount;
      const mB = sumB / pixelCount;
      const maxC = Math.max(mR, mG, mB);
      const minC = Math.min(mR, mG, mB);
      const delta = maxC - minC;
      let hue = 0;
      if (delta > 1e-4) {
        if (maxC === mR) {
          hue = ((mG - mB) / delta) % 6;
        } else if (maxC === mG) {
          hue = (mB - mR) / delta + 2;
        } else {
          hue = (mR - mG) / delta + 4;
        }
        hue *= 60;
        if (hue < 0) hue += 360;
      }
      const sat = maxC > 1e-4 ? delta / maxC : 0;

      // Compute horizontal vs vertical gradient energy to detect plank-like striping
      let diffAcrossRows = 0;
      let diffAlongRows = 0;
      for (let y = 0; y < 31; y++) {
        for (let x = 0; x < 31; x++) {
          const c = lums[y * 32 + x]!;
          diffAlongRows += Math.abs(lums[y * 32 + (x + 1)]! - c);
          diffAcrossRows += Math.abs(lums[(y + 1) * 32 + x]! - c);
        }
      }
      const stripeRatio = diffAcrossRows / Math.max(0.001, diffAlongRows);

      // Generate 64px thumbnail
      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = 64;
      thumbCanvas.height = 64;
      const tCtx = thumbCanvas.getContext('2d');
      let thumbDataUrl: string | undefined;
      if (tCtx) {
        tCtx.drawImage(img, 0, 0, 64, 64);
        thumbDataUrl = thumbCanvas.toDataURL('image/jpeg', 0.85);
      }

      return {
        meanLuminance: sumLum / pixelCount,
        meanHueDeg: hue,
        meanSaturation: sat,
        stripeRatio,
        thumbDataUrl,
      };
    } catch {
      return { meanLuminance: 0.5, meanHueDeg: 35, meanSaturation: 0.15, stripeRatio: 1.0 };
    }
  }

  private deriveNormalMapFromImage(
    diffImg: ImageBitmap | HTMLImageElement,
  ): THREE.Texture {
    const size = 512;
    if (typeof document === 'undefined') {
      const data = new Uint8Array(4 * 4 * 4).fill(128);
      return new THREE.DataTexture(data, 4, 4);
    }

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(diffImg, 0, 0, size, size);

    const imgData = ctx.getImageData(0, 0, size, size);
    const d = imgData.data;

    const height = new Float32Array(size * size);
    for (let i = 0; i < size * size; i++) {
      const p = i * 4;
      height[i] =
        (0.299 * d[p]! + 0.587 * d[p + 1]! + 0.114 * d[p + 2]!) / 255.0;
    }

    const norData = ctx.createImageData(size, size);
    const nd = norData.data;
    const strength = 1.6;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const xL = (x - 1 + size) % size;
        const xR = (x + 1) % size;
        const yU = (y - 1 + size) % size;
        const yD = (y + 1) % size;

        const hL = height[y * size + xL]!;
        const hR = height[y * size + xR]!;
        const hU = height[yU * size + x]!;
        const hD = height[yD * size + x]!;

        const dx = (hR - hL) * strength;
        const dy = (hD - hU) * strength;
        const dz = 1.0;

        const len = Math.hypot(dx, dy, dz);
        const nx = -dx / len;
        const ny = -dy / len;
        const nz = dz / len;

        const p = (y * size + x) * 4;
        nd[p] = Math.floor((nx * 0.5 + 0.5) * 255);
        nd[p + 1] = Math.floor((ny * 0.5 + 0.5) * 255);
        nd[p + 2] = Math.floor((nz * 0.5 + 0.5) * 255);
        nd[p + 3] = 255;
      }
    }

    ctx.putImageData(norData, 0, 0);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.LinearSRGBColorSpace;
    tex.generateMipmaps = true;
    tex.anisotropy = this.maxAnisotropy;
    tex.needsUpdate = true;
    return tex;
  }

  private async synthesizeArmFromRoughAndAo(
    roughUrl?: string,
    aoUrl?: string,
    nominalRough = 0.8,
  ): Promise<THREE.Texture | undefined> {
    if (typeof document === 'undefined') return undefined;

    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const armData = ctx.createImageData(size, size);
    const ad = armData.data;

    let roughImg: ImageBitmap | HTMLImageElement | null = null;
    let aoImg: ImageBitmap | HTMLImageElement | null = null;

    if (roughUrl) roughImg = await this.fetchAndDecodeImage(roughUrl, size);
    if (aoUrl) aoImg = await this.fetchAndDecodeImage(aoUrl, size);

    let roughPixels: Uint8ClampedArray | null = null;
    let aoPixels: Uint8ClampedArray | null = null;

    if (roughImg) {
      const rCanvas = document.createElement('canvas');
      rCanvas.width = size;
      rCanvas.height = size;
      const rCtx = rCanvas.getContext('2d');
      if (rCtx) {
        rCtx.drawImage(roughImg, 0, 0, size, size);
        roughPixels = rCtx.getImageData(0, 0, size, size).data;
      }
    }

    if (aoImg) {
      const aCanvas = document.createElement('canvas');
      aCanvas.width = size;
      aCanvas.height = size;
      const aCtx = aCanvas.getContext('2d');
      if (aCtx) {
        aCtx.drawImage(aoImg, 0, 0, size, size);
        aoPixels = aCtx.getImageData(0, 0, size, size).data;
      }
    }

    for (let i = 0; i < size * size; i++) {
      const p = i * 4;
      const aoVal = aoPixels ? aoPixels[p]! : 255;
      const roughVal = roughPixels ? roughPixels[p]! : Math.floor(nominalRough * 255);
      ad[p] = aoVal;
      ad[p + 1] = roughVal;
      ad[p + 2] = 0; // dielectric non-metal
      ad[p + 3] = 255;
    }

    ctx.putImageData(armData, 0, 0);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.LinearSRGBColorSpace;
    tex.generateMipmaps = true;
    tex.anisotropy = this.maxAnisotropy;
    tex.needsUpdate = true;
    return tex;
  }

  generateReport(): AssetStoreReport {
    const slotsReport: AssetSlotReport[] = [];
    let totalBytes = 0;
    let totalDownloadBytes = 0;

    for (const [id, slot] of this.slots.entries()) {
      const tuning = TEXTURE_TUNING[id];
      const diffPresent = slot.isReal ? 'present' : slot.isLoading ? 'missing' : 'fallback';
      const norPresent = slot.isReal ? 'present' : slot.isLoading ? 'missing' : 'fallback';
      const armPresent = slot.arm ? 'present' : 'missing';

      slotsReport.push({
        slot: id,
        setKey: slot.setKey,
        diffStatus: diffPresent,
        norStatus: norPresent,
        armStatus: armPresent,
        mapsFound: slot.mapsFound,
        chosenRes: slot.chosenRes,
        fileSizeBytes: slot.fileSizeBytes,
        normalConvention: slot.flipGreen ? 'Flipped DX' : 'GL',
        albedoGain: Number(slot.albedoGain.toFixed(2)),
        thumbnailUrl: slot.thumbnailUrl,
        isReal: slot.isReal,
        nominalRoughness: tuning.nominalRoughness,
        uvScaleMeters: tuning.uvScaleMeters,
        meanLuminance: Number(slot.meanLuminance.toFixed(3)),
        postGainLuminance: Number(slot.postGainLuminance.toFixed(3)),
        meanHueDeg: Number(slot.meanHueDeg.toFixed(1)),
        meanSaturation: Number(slot.meanSaturation.toFixed(2)),
        stripeRatio: Number(slot.stripeRatio.toFixed(2)),
        isSuspicious: slot.isSuspicious,
        suspicionReason: slot.suspicionReason,
      });

      totalBytes += slot.bytesEstimate;
      totalDownloadBytes += slot.fileSizeBytes;
    }

    const isPhone = this.device.deviceClass === 'phone';
    const memoryCapMb = isPhone ? 60 : 200;
    const totalMemoryMb = Number((totalBytes / (1024 * 1024)).toFixed(2));
    const totalDownloadMb = Number((totalDownloadBytes / (1024 * 1024)).toFixed(2));

    return {
      tierTargetRes: this.targetRes,
      anisotropy: this.maxAnisotropy,
      totalTextureMemoryBytes: totalBytes,
      totalTextureMemoryMb: totalMemoryMb,
      totalDownloadBytes: totalDownloadBytes,
      totalDownloadMb: totalDownloadMb,
      isDownloadBudgetExceeded: totalDownloadMb > 40,
      isMemoryBudgetExceeded: totalMemoryMb > memoryCapMb,
      unusedSets: this.catalog.unusedSets,
      ignoredFiles: this.catalog.ignoredFiles,
      slots: slotsReport,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const slot of this.slots.values()) {
      slot.diff.dispose();
      slot.nor.dispose();
      slot.arm?.dispose();
    }
    this.slots.clear();
    this.uploadQueue.length = 0;
    this.crossfadeTransitions.clear();
  }
}
