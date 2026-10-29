import {
  TEXTURE_SLOTS,
  type TextureSlotId,
} from '@/config/assets';
import { TEXTURE_OVERRIDES } from '@/config/textureOverrides';

export type MapType = 'diff' | 'nor' | 'arm' | 'rough' | 'ao' | 'disp';

export interface TextureFileInfo {
  path: string;
  url: string;
  fileName: string;
  setKey: string;
  mapType: MapType;
  resolution: number;
  flipGreen: boolean;
  fileSizeBytes: number;
}

export interface TextureSet {
  setKey: string;
  maps: Partial<Record<MapType, TextureFileInfo[]>>;
}

export interface SlotAssignment {
  slot: TextureSlotId;
  assignedSet: TextureSet | null;
  chosenDiff?: TextureFileInfo;
  chosenNor?: TextureFileInfo;
  chosenArm?: TextureFileInfo;
  chosenRough?: TextureFileInfo;
  chosenAo?: TextureFileInfo;
  flipGreen: boolean;
  score: number;
}

export interface CatalogReport {
  assignedSlots: Record<TextureSlotId, SlotAssignment>;
  unusedSets: string[];
  ignoredFiles: string[];
  totalFileSizeBytes: number;
}

// Slot evaluation order as specified: roof, bark, moss, timber, plaster, path, stone, rock, grass
export const SLOT_EVALUATION_ORDER: TextureSlotId[] = [
  'roof',
  'bark',
  'moss',
  'timber',
  'plaster',
  'path',
  'stone',
  'rock',
  'grass',
];

// Keywords per slot
export const SLOT_KEYWORDS: Record<TextureSlotId, string[]> = {
  roof: ['roof', 'roofing', 'shingle', 'slate_roof', 'tile_roof', 'clay_tile'],
  bark: ['bark', 'trunk', 'tree'],
  moss: ['moss', 'lichen', 'mossy'],
  timber: ['wood', 'plank', 'planks', 'timber', 'wooden', 'board'],
  plaster: ['plaster', 'stucco', 'wall_plaster', 'painted', 'concrete_wall'],
  path: [
    'path',
    'cobble',
    'cobblestone',
    'paving',
    'paved',
    'flagstone',
    'pavement',
    'gravel',
    'floor_tiles',
    'stone_tiles',
  ],
  stone: [
    'brick',
    'bricks',
    'block',
    'blocks',
    'ashlar',
    'masonry',
    'stone_wall',
    'stone_brick',
    'stone',
  ],
  rock: ['rock', 'cliff', 'boulder', 'granite', 'rock_face', 'rocky'],
  grass: [
    'grass',
    'lawn',
    'meadow',
    'forest_ground',
    'forest',
    'ground',
    'leaves',
    'leaf_litter',
    'mud_forest',
  ],
};

const SUPPORTED_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const IGNORED_LOG_EXTS = new Set(['.exr', '.zip', '.tif', '.tiff', '.blend', '.txt', '.md']);

/**
 * Discovers and parses texture files from the repository at build time using Vite import.meta.glob
 */
export class TextureCatalog {
  private static instance: TextureCatalog | null = null;

  readonly allSets = new Map<string, TextureSet>();
  readonly ignoredFiles: string[] = [];
  readonly assignments: Record<TextureSlotId, SlotAssignment>;
  readonly unusedSets: string[] = [];

  static getInstance(): TextureCatalog {
    if (!TextureCatalog.instance) {
      TextureCatalog.instance = new TextureCatalog();
    }
    return TextureCatalog.instance;
  }

  constructor() {
    this.assignments = {} as Record<TextureSlotId, SlotAssignment>;
    for (const slot of Object.keys(TEXTURE_SLOTS) as TextureSlotId[]) {
      this.assignments[slot] = {
        slot,
        assignedSet: null,
        flipGreen: false,
        score: 0,
      };
    }

    this.scanAndParse();
    this.assignSetsToSlots();
  }

  private scanAndParse(): void {
    // Eager Vite glob over all files in /src/assets/textures/
    // Using import: "default" and query: "?url" to get the asset URL
    let modules: Record<string, string>;
    try {
      modules = import.meta.glob(
        '/src/assets/textures/**/*',
        { eager: true, query: '?url', import: 'default' },
      ) as Record<string, string>;
    } catch {
      modules = {};
    }

    for (const [filePath, url] of Object.entries(modules)) {
      const slashIdx = filePath.lastIndexOf('/');
      const fileName = slashIdx >= 0 ? filePath.slice(slashIdx + 1) : filePath;
      const dotIdx = fileName.lastIndexOf('.');
      if (dotIdx === -1) {
        this.ignoredFiles.push(fileName);
        continue;
      }

      const ext = fileName.slice(dotIdx).toLowerCase();
      if (!SUPPORTED_EXTS.has(ext)) {
        if (IGNORED_LOG_EXTS.has(ext)) {
          console.info(`[TextureCatalog] ignored ${fileName}`);
        }
        this.ignoredFiles.push(fileName);
        continue;
      }

      const parsed = this.parsePolyHavenFileName(filePath, fileName, url);
      if (!parsed) {
        this.ignoredFiles.push(fileName);
        continue;
      }

      let set = this.allSets.get(parsed.setKey);
      if (!set) {
        set = {
          setKey: parsed.setKey,
          maps: {},
        };
        this.allSets.set(parsed.setKey, set);
      }

      if (!set.maps[parsed.mapType]) {
        set.maps[parsed.mapType] = [];
      }
      set.maps[parsed.mapType]!.push(parsed);
    }
  }

  /**
   * Tokenises Poly Haven file names:
   * Map types:
   * diff, diffuse, color, col, albedo, basecolor => 'diff'
   * nor_gl, normal_gl, normalgl => 'nor' (flipGreen = false)
   * nor_dx, normal_dx => 'nor' (flipGreen = true)
   * plain nor or normal => 'nor' (assume GL)
   * arm => 'arm'
   * rough or roughness => 'rough'
   * ao or ambientocclusion => 'ao'
   * disp, displacement, height => 'disp'
   * metal, metallic => ignored (return null)
   */
  private parsePolyHavenFileName(
    path: string,
    fileName: string,
    url: string,
  ): TextureFileInfo | null {
    const baseName = fileName.slice(0, fileName.lastIndexOf('.')).toLowerCase();

    // Check for metallic (ignored)
    if (/(^|[_-])(metal|metallic)($|[_-])/i.test(baseName)) {
      return null;
    }

    let mapType: MapType | null = null;
    let flipGreen = false;
    let matchedMapToken = '';

    // Check map type tokens in priority order (specific to generic)
    const mNorDx = baseName.match(/(^|[_-])(nor_dx|normal_dx)($|[_-])/i);
    const mNorGl = baseName.match(/(^|[_-])(nor_gl|normal_gl|normalgl)($|[_-])/i);
    const mNor = baseName.match(/(^|[_-])(nor|normal)($|[_-])/i);
    const mDiff = baseName.match(/(^|[_-])(diff|diffuse|color|col|albedo|basecolor)($|[_-])/i);
    const mRough = baseName.match(/(^|[_-])(rough|roughness)($|[_-])/i);
    const mAo = baseName.match(/(^|[_-])(ao|ambientocclusion)($|[_-])/i);
    const mDisp = baseName.match(/(^|[_-])(disp|displacement|height)($|[_-])/i);

    if (mNorDx) {
      mapType = 'nor';
      flipGreen = true;
      matchedMapToken = mNorDx[2] ?? '';
    } else if (mNorGl) {
      mapType = 'nor';
      flipGreen = false;
      matchedMapToken = mNorGl[2] ?? '';
    } else if (mNor) {
      mapType = 'nor';
      flipGreen = false;
      matchedMapToken = mNor[2] ?? '';
    } else if (mDiff) {
      mapType = 'diff';
      matchedMapToken = mDiff[2] ?? '';
    } else if (/(^|[_-])arm($|[_-])/i.test(baseName)) {
      mapType = 'arm';
      matchedMapToken = 'arm';
    } else if (mRough) {
      mapType = 'rough';
      matchedMapToken = mRough[2] ?? '';
    } else if (mAo) {
      mapType = 'ao';
      matchedMapToken = mAo[2] ?? '';
    } else if (mDisp) {
      mapType = 'disp';
      matchedMapToken = mDisp[2] ?? '';
    }

    if (!mapType) {
      return null;
    }

    // Resolution token: 512, 1k, 2k, 4k, 8k
    let resolution = 1024;
    let matchedResToken = '';
    const resMatch = baseName.match(/(^|[_-])(512|1k|2k|4k|8k)($|[_-])/i);
    if (resMatch && resMatch[2]) {
      matchedResToken = resMatch[2];
      const rLower = matchedResToken.toLowerCase();
      if (rLower === '512') resolution = 512;
      else if (rLower === '1k') resolution = 1024;
      else if (rLower === '2k') resolution = 2048;
      else if (rLower === '4k') resolution = 4096;
      else if (rLower === '8k') resolution = 8192;
    }

    // Set key: baseName with matchedMapToken and matchedResToken removed
    let setKey = baseName;
    if (matchedMapToken) {
      setKey = setKey.replace(new RegExp(`(^|[_-])${matchedMapToken}($|[_-])`, 'i'), '$1$3');
    }
    if (matchedResToken) {
      setKey = setKey.replace(new RegExp(`(^|[_-])${matchedResToken}($|[_-])`, 'i'), '$1$3');
    }
    setKey = setKey
      .replace(/^_+|_+$/g, '')
      .replace(/^-+|-+$/g, '')
      .replace(/__+/g, '_')
      .replace(/--+/g, '-');

    if (!setKey) {
      setKey = 'default';
    }

    return {
      path,
      url,
      fileName,
      setKey,
      mapType,
      resolution,
      flipGreen,
      fileSizeBytes: 1024 * 1024, // initial estimate, updated on fetch if needed
    };
  }

  private assignSetsToSlots(): void {
    const assignedSetKeys = new Set<string>();

    // 1. Process explicit overrides first
    for (const slot of SLOT_EVALUATION_ORDER) {
      const overrideKey = TEXTURE_OVERRIDES[slot];
      if (overrideKey && this.allSets.has(overrideKey) && !assignedSetKeys.has(overrideKey)) {
        const set = this.allSets.get(overrideKey)!;
        assignedSetKeys.add(overrideKey);
        this.assignments[slot] = {
          slot,
          assignedSet: set,
          flipGreen: this.detectFlipGreen(set),
          score: 999, // override always wins
        };
      }
    }

    // 2. Score unassigned sets against keyword lists in priority order
    for (const slot of SLOT_EVALUATION_ORDER) {
      if (this.assignments[slot].assignedSet) continue;

      const keywords = SLOT_KEYWORDS[slot];
      let bestSet: TextureSet | null = null;
      let highestScore = -1;
      let mostMapsCount = -1;
      let shortestNameLen = Infinity;

      for (const [key, set] of this.allSets.entries()) {
        if (assignedSetKeys.has(key)) continue;

        const score = this.calculateKeywordScore(key, keywords);
        if (score <= 0) continue;

        const mapsCount = Object.keys(set.maps).length;
        const nameLen = key.length;

        let isBetter = false;
        if (score > highestScore) {
          isBetter = true;
        } else if (score === highestScore) {
          if (mapsCount > mostMapsCount) {
            isBetter = true;
          } else if (mapsCount === mostMapsCount) {
            if (nameLen < shortestNameLen) {
              isBetter = true;
            }
          }
        }

        if (isBetter) {
          bestSet = set;
          highestScore = score;
          mostMapsCount = mapsCount;
          shortestNameLen = nameLen;
        }
      }

      if (bestSet) {
        assignedSetKeys.add(bestSet.setKey);
        this.assignments[slot] = {
          slot,
          assignedSet: bestSet,
          flipGreen: this.detectFlipGreen(bestSet),
          score: highestScore,
        };
      }
    }

    // 3. Mark unassigned sets as unused
    for (const key of this.allSets.keys()) {
      if (!assignedSetKeys.has(key)) {
        this.unusedSets.push(key);
      }
    }
  }

  private calculateKeywordScore(setKey: string, keywords: string[]): number {
    const lowerKey = setKey.toLowerCase();
    const tokens = lowerKey.split(/[_-]/);
    let hits = 0;

    for (const kw of keywords) {
      const lowerKw = kw.toLowerCase();
      // Exact match with token, or key contains whole keyword with delimiters
      if (tokens.includes(lowerKw) || lowerKey === lowerKw || lowerKey.includes(`_${lowerKw}`) || lowerKey.includes(`${lowerKw}_`)) {
        hits += 1;
      }
    }

    return hits;
  }

  private detectFlipGreen(set: TextureSet): boolean {
    const norFiles = set.maps.nor;
    if (!norFiles || norFiles.length === 0) return false;
    return norFiles.some((f) => f.flipGreen);
  }

  /**
   * For a given slot and target resolution, choose the closest file <= targetRes
   * unless it is the only one.
   */
  pickFileForMap(
    slot: TextureSlotId,
    mapType: MapType,
    targetRes: number,
  ): TextureFileInfo | undefined {
    const assignment = this.assignments[slot];
    if (!assignment?.assignedSet) return undefined;

    const files = assignment.assignedSet.maps[mapType];
    if (!files || files.length === 0) return undefined;

    // Filter files <= targetRes
    const valid = files.filter((f) => f.resolution <= targetRes);
    if (valid.length > 0) {
      // Pick the highest resolution <= targetRes
      return valid.sort((a, b) => b.resolution - a.resolution)[0];
    }

    // If none are <= targetRes, pick the smallest available
    return files.slice().sort((a, b) => a.resolution - b.resolution)[0];
  }

  generateReport(): CatalogReport {
    let totalBytes = 0;
    for (const set of this.allSets.values()) {
      for (const mapFiles of Object.values(set.maps)) {
        if (mapFiles) {
          for (const f of mapFiles) {
            totalBytes += f.fileSizeBytes;
          }
        }
      }
    }

    return {
      assignedSlots: this.assignments,
      unusedSets: this.unusedSets,
      ignoredFiles: this.ignoredFiles,
      totalFileSizeBytes: totalBytes,
    };
  }
}
