import type { CellKey } from './Cells';

export type GenerationJobType = 'TERRAIN_TILE' | 'INSTANCE_SET' | 'BUILDING_BATCH' | 'NAV_CELL' | 'COLLISION_CELL';
export interface WorkerMessage {
  id: number; type: GenerationJobType; cellKey: CellKey; priority: number; generation: number; payload: unknown;
}
export interface WorkerResult {
  id: number; cellKey: CellKey; generation: number; payload: unknown;
}
type Generator = (message: WorkerMessage) => unknown;
interface QueuedJob {
  message: WorkerMessage;
  resolve: (result: WorkerResult) => void;
  reject: (error: Error) => void;
}

function keyOf(key: CellKey): string { return key.level + ':' + key.ix + ':' + key.iz; }

/**
 * Deterministic generation scheduler with a 3 ms main-thread fallback.
 * Worker transport can be attached without changing the typed job/result contract.
 */
export class GenerationPool {
  private readonly handlers = new Map<GenerationJobType, Generator>();
  private readonly queue: QueuedJob[] = [];
  private readonly generationByCell = new Map<string, number>();
  private nextId = 1;
  private disposed = false;

  register(type: GenerationJobType, generator: Generator): void { this.handlers.set(type, generator); }

  submit(type: GenerationJobType, cellKey: CellKey, payload: unknown, priority = 0): Promise<WorkerResult> {
    if (this.disposed) return Promise.reject(new Error('Generation pool is disposed'));
    const message: WorkerMessage = {
      id: this.nextId++, type, cellKey, priority,
      generation: this.generationByCell.get(keyOf(cellKey)) ?? 0,
      payload,
    };
    return new Promise((resolve, reject) => {
      this.queue.push({ message, resolve, reject });
      this.queue.sort((a, b) => b.message.priority - a.message.priority || a.message.id - b.message.id);
    });
  }

  cancelCell(cellKey: CellKey): void {
    const key = keyOf(cellKey);
    this.generationByCell.set(key, (this.generationByCell.get(key) ?? 0) + 1);
    for (let i = this.queue.length - 1; i >= 0; i--) {
      if (keyOf(this.queue[i]!.message.cellKey) === key) {
        const [job] = this.queue.splice(i, 1);
        job!.reject(new Error('Generation job cancelled'));
      }
    }
  }

  processFallback(budgetMs = 3, now: () => number = () => performance.now()): number {
    const start = now();
    let processed = 0;
    while (this.queue.length) {
      if (processed > 0 && now() - start >= budgetMs) break;
      const job = this.queue.shift()!;
      const key = keyOf(job.message.cellKey);
      if (job.message.generation !== (this.generationByCell.get(key) ?? 0)) {
        job.reject(new Error('Stale generation result discarded'));
        continue;
      }
      const generator = this.handlers.get(job.message.type);
      if (!generator) { job.reject(new Error('No generator registered for ' + job.message.type)); continue; }
      try {
        job.resolve({
          id: job.message.id,
          cellKey: job.message.cellKey,
          generation: job.message.generation,
          payload: generator(job.message),
        });
        processed++;
      } catch (error) {
        job.reject(error instanceof Error ? error : new Error(String(error)));
      }
    }
    return processed;
  }

  get pending(): number { return this.queue.length; }

  dispose(): void {
    this.disposed = true;
    for (const job of this.queue) job.reject(new Error('Generation pool disposed'));
    this.queue.length = 0;
    this.handlers.clear();
    this.generationByCell.clear();
  }
}
