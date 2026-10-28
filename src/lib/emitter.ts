export type EventListener<T> = (payload: T) => void;

export class Emitter<Events extends Record<string, unknown>> {
  private listeners = new Map<keyof Events, Set<EventListener<never>>>();

  on<K extends keyof Events>(
    event: K,
    listener: EventListener<Events[K]>,
  ): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as EventListener<never>);
    return () => this.off(event, listener);
  }

  off<K extends keyof Events>(
    event: K,
    listener: EventListener<Events[K]>,
  ): void {
    const set = this.listeners.get(event);
    if (!set) return;
    set.delete(listener as EventListener<never>);
    if (set.size === 0) {
      this.listeners.delete(event);
    }
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      (listener as EventListener<Events[K]>)(payload);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
