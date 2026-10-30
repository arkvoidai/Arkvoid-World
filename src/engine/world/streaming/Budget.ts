import type { CellRing } from './Cells';

export interface TrackedResource {
  id: string;
  layer: string;
  bytes: number;
  ring: CellRing;
  lastUsedFrame: number;
  dispose: () => void;
}

export class ResourceBudget {
  private readonly resources = new Map<string, TrackedResource>();
  private bytes = 0;

  constructor(readonly maxBytes: number) {
    if (!(maxBytes > 0) || !Number.isFinite(maxBytes)) throw new RangeError('Resource budget must be positive and finite');
  }

  register(resource: TrackedResource): void {
    if (!Number.isFinite(resource.bytes) || resource.bytes < 0) throw new RangeError('Invalid resource byte count');
    this.release(resource.id);
    this.resources.set(resource.id, resource);
    this.bytes += resource.bytes;
  }

  touch(id: string, frame: number): void {
    const resource = this.resources.get(id);
    if (resource) resource.lastUsedFrame = frame;
  }

  release(id: string): boolean {
    const resource = this.resources.get(id);
    if (!resource) return false;
    this.resources.delete(id);
    this.bytes = Math.max(0, this.bytes - resource.bytes);
    resource.dispose();
    return true;
  }

  enforceBudget(): string[] {
    if (this.bytes <= this.maxBytes) return [];
    const candidates = [...this.resources.values()].filter((resource) => resource.ring !== 0);
    candidates.sort((a, b) => b.ring - a.ring || a.lastUsedFrame - b.lastUsedFrame);
    const evicted: string[] = [];
    for (const resource of candidates) {
      if (this.bytes <= this.maxBytes) break;
      evicted.push(resource.id);
      this.release(resource.id);
    }
    return evicted;
  }

  get usedBytes(): number { return this.bytes; }
  get resourceCount(): number { return this.resources.size; }

  dispose(): void {
    for (const id of [...this.resources.keys()]) this.release(id);
  }
}
