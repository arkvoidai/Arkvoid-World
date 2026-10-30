export class DiscoveryTracker {
  private readonly discovered = new Set<string>();
  private candidateId: string | null = null;
  private dwellSeconds = 0;
  private ready: boolean;

  constructor(
    private readonly dwellRequiredSeconds = 3,
    initialDiscovered: readonly string[] = [],
    ready = true,
  ) {
    this.ready = ready;
    for (const id of initialDiscovered) this.discovered.add(id);
  }

  seedDiscovered(ids: readonly string[]): void {
    for (const id of ids) this.discovered.add(id);
    this.ready = true;
    this.candidateId = null;
    this.dwellSeconds = 0;
  }

  markReady(): void {
    this.ready = true;
  }

  update(deltaSeconds: number, areaId: string | null): string | null {
    if (!this.ready) return null;
    const dt = Math.max(0, Math.min(deltaSeconds, 0.25));
    if (!areaId || this.discovered.has(areaId)) {
      this.candidateId = null;
      this.dwellSeconds = 0;
      return null;
    }
    if (this.candidateId !== areaId) {
      this.candidateId = areaId;
      this.dwellSeconds = 0;
    }
    this.dwellSeconds += dt;
    if (this.dwellSeconds < this.dwellRequiredSeconds) return null;
    this.discovered.add(areaId);
    this.candidateId = null;
    this.dwellSeconds = 0;
    return areaId;
  }

  hasDiscovered(areaId: string): boolean {
    return this.discovered.has(areaId);
  }

  getDiscoveredIds(): readonly string[] {
    return [...this.discovered];
  }
}
