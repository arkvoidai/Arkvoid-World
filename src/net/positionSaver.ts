import { savePosition, type CharacterPos } from '@/net/api';
import { areaAt, type ReachableAreaId } from '@/engine/world/layout';
import { areaAtAtlas } from '@/engine/world/atlas/Atlas';

class PositionSaver {
  private lastSavedPos: CharacterPos | null = null;
  private lastSavedArea: string | null = null;
  private lastSaveTime = 0;
  private pendingTimer: number | null = null;
  private pendingPos: CharacterPos | null = null;
  private pendingArea: string | null = null;
  private awayReportRun = false;
  private isSaving = false;

  constructor() {
    if (typeof window !== 'undefined') {
      const handleFlush = () => {
        if (document.visibilityState === 'hidden') {
          this.flushNow();
        }
      };
      window.addEventListener('visibilitychange', handleFlush);
      window.addEventListener('pagehide', () => this.flushNow());
    }
  }

  public setAwayReportRun(value: boolean): void {
    this.awayReportRun = value;
  }

  public hasAwayReportRun(): boolean {
    return this.awayReportRun;
  }

  public reset(): void {
    if (this.pendingTimer !== null) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
    this.lastSavedPos = null;
    this.lastSavedArea = null;
    this.lastSaveTime = 0;
    this.pendingPos = null;
    this.pendingArea = null;
    this.awayReportRun = false;
    this.isSaving = false;
  }

  /**
   * Derive area using layout's areaAt, fallback to last known or dawn-terrace.
   */
  public resolveArea(pos: CharacterPos, explicitArea?: string): string {
    if (explicitArea) return explicitArea;
    const atlasArea = areaAtAtlas(pos.x, pos.y, pos.z);
    if (atlasArea) return atlasArea.id;
    const derived = areaAt(pos.x, pos.z);
    if (derived) return derived;
    return this.lastSavedArea ?? ('dawn-terrace' as ReachableAreaId);
  }

  private isPosEqual(a: CharacterPos | null, b: CharacterPos | null): boolean {
    if (!a || !b) return false;
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    const dz = Math.abs(a.z - b.z);
    const dry = Math.abs(a.ry - b.ry);
    return dx < 0.05 && dy < 0.05 && dz < 0.05 && dry < 0.05;
  }

  /**
   * Main entry called by game/engine loop.
   * Never blocks a frame.
   */
  public save(areaOrPos: string | CharacterPos, maybePos?: CharacterPos): void {
    if (!this.awayReportRun) {
      // Must not save before away_report has completed
      return;
    }

    let area: string;
    let pos: CharacterPos;

    if (typeof areaOrPos === 'string' && maybePos) {
      area = areaOrPos;
      pos = maybePos;
    } else {
      pos = areaOrPos as CharacterPos;
      area = this.resolveArea(pos);
    }

    // Skip if unchanged
    if (
      this.lastSavedArea === area &&
      this.isPosEqual(this.lastSavedPos, pos)
    ) {
      return;
    }

    const now = Date.now();
    const areaChanged = this.lastSavedArea !== null && this.lastSavedArea !== area;

    // Immediately save on area change
    if (areaChanged) {
      this.executeSave(area, pos, now);
      return;
    }

    // Otherwise throttle at most every 8s while moving
    const timeSinceLast = now - this.lastSaveTime;
    if (timeSinceLast >= 8000) {
      this.executeSave(area, pos, now);
    } else {
      // Queue a pending save for the end of the 8s window
      this.pendingArea = area;
      this.pendingPos = { ...pos };
      if (this.pendingTimer === null) {
        const remaining = 8000 - timeSinceLast;
        this.pendingTimer = window.setTimeout(() => {
          this.pendingTimer = null;
          if (this.pendingPos && this.pendingArea) {
            this.executeSave(this.pendingArea, this.pendingPos, Date.now());
            this.pendingPos = null;
            this.pendingArea = null;
          }
        }, remaining);
      }
    }
  }

  /**
   * Immediate synchronous/best-effort trigger for pagehide & visibility hidden.
   */
  public flushNow(): void {
    if (!this.awayReportRun) return;

    if (this.pendingTimer !== null) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }

    if (this.pendingPos && this.pendingArea) {
      this.executeSave(this.pendingArea, this.pendingPos, Date.now());
      this.pendingPos = null;
      this.pendingArea = null;
    }
  }

  private executeSave(area: string, pos: CharacterPos, timestamp: number): void {
    if (this.isSaving) {
      // Keep as pending
      this.pendingArea = area;
      this.pendingPos = { ...pos };
      return;
    }

    this.isSaving = true;
    this.lastSavedPos = { ...pos };
    this.lastSavedArea = area;
    this.lastSaveTime = timestamp;

    // Fire-and-forget in background, never throwing or blocking
    savePosition(area, pos)
      .catch(() => {
        // Best effort
      })
      .finally(() => {
        this.isSaving = false;
        // If another position was queued while saving, dispatch if 8s elapsed
        if (this.pendingPos && this.pendingArea) {
          const now = Date.now();
          if (now - this.lastSaveTime >= 8000) {
            const pArea = this.pendingArea;
            const pPos = this.pendingPos;
            this.pendingArea = null;
            this.pendingPos = null;
            this.executeSave(pArea, pPos, now);
          }
        }
      });
  }
}

export const positionSaver = new PositionSaver();
