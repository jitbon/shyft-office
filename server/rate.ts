/**
 * Sliding-window limits, one list of recent events per key (a connection, a member). Every per-second and per-minute limit
 * on the server goes through this, so each new message type adds one line rather than another map and its cleanup.
 */
export interface Limit {
  /** Most events in the window. */
  count: number;
  /** Most total weight (bytes, points…) in the window; unlimited when absent. */
  weight?: number;
}

/** Keys not touched for this many takes are swept, so keys that never come back (closed connections) do not pile up. */
const SWEEP_EVERY = 256;

export class RateWindow {
  private log = new Map<string, { at: number; w: number }[]>();
  private takes = 0;

  constructor(private windowMs: number) {}

  /** True when one more event of `weight` fits under `limit` for `key`, and records it then. A refused event is not recorded. */
  take(key: string, limit: Limit, weight = 0, now = Date.now()): boolean {
    if (++this.takes % SWEEP_EVERY === 0) this.sweep(now);
    const recent = (this.log.get(key) ?? []).filter((e) => now - e.at < this.windowMs);
    const total = recent.reduce((n, e) => n + e.w, weight);
    if (recent.length >= limit.count || (limit.weight !== undefined && total > limit.weight)) {
      this.log.set(key, recent);
      return false;
    }
    recent.push({ at: now, w: weight });
    this.log.set(key, recent);
    return true;
  }

  /** Drops a key, for example when its connection closes. */
  forget(key: string) {
    this.log.delete(key);
  }

  /** How many keys are being tracked (for tests). */
  get size() {
    return this.log.size;
  }

  private sweep(now: number) {
    for (const [key, events] of this.log) {
      if (!events.length || now - events[events.length - 1].at >= this.windowMs) this.log.delete(key);
    }
  }
}

/** A cooldown per key: true at most once every `ms`. */
export class Cooldown {
  private last = new Map<string, number>();

  constructor(private ms: number) {}

  /** True when `key` is past its cooldown, and starts a new one then. */
  ready(key: string, now = Date.now()): boolean {
    if (now - (this.last.get(key) ?? -Infinity) < this.ms) return false;
    this.last.set(key, now);
    return true;
  }

  forget(key: string) {
    this.last.delete(key);
  }
}
