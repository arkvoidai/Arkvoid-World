import type { CellKey } from './Cells';

export type CellLayer = 'terrain' | 'architecture' | 'vegetation' | 'water' | 'props' | 'residents' | 'collision';
export interface CellContext { atlasHash: string; quality: 'ultra' | 'balanced' | 'performance' | 'lite'; seed: number }
export interface CellJob { providerId: string; cellKey: CellKey; generation: number; priority: number; context: CellContext }
export interface CellBuildParts<ObjectType = unknown> { objects: ObjectType[]; bytes: number }

export interface CellContentProvider<Generated = unknown, ObjectType = unknown> {
  id: string;
  layer: CellLayer;
  generate(job: CellJob): Generated;
  build(result: Generated, job: CellJob): CellBuildParts<ObjectType>;
  dispose(parts: CellBuildParts<ObjectType>): void;
}

export class CellProviderRegistry {
  private readonly providers = new Map<string, CellContentProvider>();

  register(provider: CellContentProvider): void {
    if (this.providers.has(provider.id)) throw new Error('Cell provider already registered: ' + provider.id);
    this.providers.set(provider.id, provider);
  }

  get(id: string): CellContentProvider | undefined { return this.providers.get(id); }

  byLayer(layer: CellLayer): CellContentProvider[] {
    return [...this.providers.values()].filter((provider) => provider.layer === layer);
  }

  dispose(): void { this.providers.clear(); }
}
