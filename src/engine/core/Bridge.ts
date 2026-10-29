export interface PlayerCoarseCoords {
  x: number;
  y: number;
  z: number;
}

export interface BridgePrompt {
  id: string;
  label: string;
  keycap?: string;
}

export interface BridgeSnapshot {
  fps: number;
  frameMsP95: number;
  drawCalls: number;
  triangles: number;
  hour: number;
  playerCoarse: PlayerCoarseCoords;
  prompt: BridgePrompt | null;
  loadProgress: number;
  natureStats?: {
    grass: number;
    flowers: number;
    trees: number;
    particles: number;
  };
  actorStats?: {
    count: number;
    near: number;
    frameMs: number;
  };
}

export type EngineCommand =
  | { type: 'setRenderScale'; scale: number }
  | { type: 'setHourOverride'; hour: number | null }
  | { type: 'setTimeSpeed'; speed: number }
  | { type: 'setPostProcessing'; enabled: boolean }
  | { type: 'setReviewShot'; shotIndex: number | null }
  | { type: 'triggerInteract' };


export type SnapshotSubscriber = (snapshot: Readonly<BridgeSnapshot>) => void;

export class EngineBridge {
  /** Mutable snapshot updated in-place each frame by the engine */
  readonly mutable: BridgeSnapshot = {
    fps: 60,
    frameMsP95: 16.7,
    drawCalls: 0,
    triangles: 0,
    hour: 6,
    playerCoarse: { x: 0, y: 0, z: 0 },
    prompt: null,
    loadProgress: 0,
  };

  private readonly lastPublished: BridgeSnapshot = {
    fps: -1,
    frameMsP95: -1,
    drawCalls: -1,
    triangles: -1,
    hour: -1,
    playerCoarse: { x: 0, y: 0, z: 0 },
    prompt: null,
    loadProgress: -1,
  };

  private readonly commandQueue: EngineCommand[] = [];
  private readonly subscribers = new Set<SnapshotSubscriber>();
  private publishAccumSec = 0;

  enqueue(cmd: EngineCommand): void {
    this.commandQueue.push(cmd);
  }

  drainCommands(handler: (cmd: EngineCommand) => void): void {
    while (this.commandQueue.length > 0) {
      const cmd = this.commandQueue.shift();
      if (cmd) {
        handler(cmd);
      }
    }
  }

  subscribe(fn: SnapshotSubscriber): () => void {
    this.subscribers.add(fn);
    return () => {
      this.subscribers.delete(fn);
    };
  }

  /**
   * Called each frame by Engine. Publishes to subscribers at most 10 times per second
   * (every >= 0.10 s) and only when a field has changed.
   */
  tickPublish(dtSec: number, force: boolean = false): void {
    this.publishAccumSec += dtSec;
    if (!force && this.publishAccumSec < 0.1) {
      return;
    }

    if (!force && !this.hasChanged()) {
      return;
    }

    this.publishAccumSec = 0;
    this.copyMutableToLastPublished();

    const copy: BridgeSnapshot = {
      fps: this.mutable.fps,
      frameMsP95: this.mutable.frameMsP95,
      drawCalls: this.mutable.drawCalls,
      triangles: this.mutable.triangles,
      hour: Number(this.mutable.hour.toFixed(3)),
      playerCoarse: {
        x: Math.round(this.mutable.playerCoarse.x * 10) / 10,
        y: Math.round(this.mutable.playerCoarse.y * 10) / 10,
        z: Math.round(this.mutable.playerCoarse.z * 10) / 10,
      },
      prompt: this.mutable.prompt ? { ...this.mutable.prompt } : null,
      loadProgress: this.mutable.loadProgress,
    };

    for (const sub of this.subscribers) {
      sub(copy);
    }
  }

  private hasChanged(): boolean {
    const m = this.mutable;
    const p = this.lastPublished;
    if (m.fps !== p.fps) return true;
    if (Math.abs(m.frameMsP95 - p.frameMsP95) > 0.05) return true;
    if (m.drawCalls !== p.drawCalls) return true;
    if (m.triangles !== p.triangles) return true;
    if (Math.abs(m.hour - p.hour) > 0.005) return true;
    if (m.loadProgress !== p.loadProgress) return true;
    if (
      Math.abs(m.playerCoarse.x - p.playerCoarse.x) > 0.05 ||
      Math.abs(m.playerCoarse.y - p.playerCoarse.y) > 0.05 ||
      Math.abs(m.playerCoarse.z - p.playerCoarse.z) > 0.05
    ) {
      return true;
    }
    if ((m.prompt?.id ?? null) !== (p.prompt?.id ?? null)) return true;
    if ((m.prompt?.label ?? null) !== (p.prompt?.label ?? null)) return true;
    return false;
  }

  private copyMutableToLastPublished(): void {
    const m = this.mutable;
    const p = this.lastPublished;
    p.fps = m.fps;
    p.frameMsP95 = m.frameMsP95;
    p.drawCalls = m.drawCalls;
    p.triangles = m.triangles;
    p.hour = m.hour;
    p.loadProgress = m.loadProgress;
    p.playerCoarse.x = m.playerCoarse.x;
    p.playerCoarse.y = m.playerCoarse.y;
    p.playerCoarse.z = m.playerCoarse.z;
    p.prompt = m.prompt ? { ...m.prompt } : null;
  }
}
