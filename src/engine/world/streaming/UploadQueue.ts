export interface UploadTask { id: string; run: () => void; cancel?: () => void }

export class UploadQueue {
  private readonly queue: UploadTask[] = [];
  private head = 0;

  enqueue(task: UploadTask): void { this.queue.push(task); }

  cancel(id: string): boolean {
    for (let i = this.head; i < this.queue.length; i++) {
      const task = this.queue[i]!;
      if (task.id === id) {
        task.cancel?.();
        this.queue[i] = { id: '', run: () => undefined };
        return true;
      }
    }
    return false;
  }

  process(budgetMs: number, now: () => number = () => performance.now()): number {
    const start = now();
    let processed = 0;
    while (this.head < this.queue.length) {
      if (processed > 0 && now() - start >= budgetMs) break;
      const task = this.queue[this.head++]!;
      if (task.id) { task.run(); processed++; }
    }
    if (this.head >= this.queue.length) {
      this.queue.length = 0;
      this.head = 0;
    } else if (this.head > 64) {
      this.queue.splice(0, this.head);
      this.head = 0;
    }
    return processed;
  }

  get pending(): number { return this.queue.length - this.head; }

  dispose(): void {
    for (let i = this.head; i < this.queue.length; i++) this.queue[i]!.cancel?.();
    this.queue.length = 0;
    this.head = 0;
  }
}
