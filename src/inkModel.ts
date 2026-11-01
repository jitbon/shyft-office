import { INK_STALE_MS, strokeAlpha, strokeDone, type InkBatch } from '../shared/ink';

/** One line by one member on one share, as it is on screen. Nothing here is kept on the server. */
export interface Stroke {
  shareId: string;
  from: string;
  strokeId: number;
  /** The ink slot at the time it started. */
  color: number;
  keep: boolean;
  /** Flat `[x, y, …]`, integers 0–10000 across the shared picture, in arrival order. */
  pts: number[];
  lastSeq: number;
  /** Local time of the last batch. */
  lastAt: number;
  /** Local time the pen lifted, or null while drawing. */
  endedAt: number | null;
}

export interface VisibleStroke {
  stroke: Stroke;
  alpha: number;
}

/** The pen is held for a moment after the server says "slow down". */
export const penPaused = (now: number, pausedUntil: number): boolean => now < pausedUntil;

/** The strokes on screen, for the shares you can see. Plain data: times are passed in. */
export class InkStore {
  private strokes = new Map<string, Stroke>();

  /** Adds a batch of points to its stroke, starting the stroke if it is new. Older or repeated batches are ignored. */
  add(msg: Pick<InkBatch, 'shareId' | 'strokeId' | 'seq' | 'pts' | 'end' | 'keep'> & { from: string }, color: number, now: number): void {
    const key = `${msg.shareId}|${msg.from}|${msg.strokeId}`;
    let s = this.strokes.get(key);
    if (!s) {
      s = { shareId: msg.shareId, from: msg.from, strokeId: msg.strokeId, color, keep: false, pts: [], lastSeq: -1, lastAt: now, endedAt: null };
      this.strokes.set(key, s);
    }
    if (msg.seq <= s.lastSeq) return;
    s.lastSeq = msg.seq;
    s.lastAt = now;
    s.pts.push(...msg.pts);
    if (msg.keep) s.keep = true;
    if (msg.end && s.endedAt === null) s.endedAt = now;
  }

  /** A stroke that has heard nothing for a while is treated as ended, so it does not stay on screen for ever. */
  endStale(now: number): void {
    for (const s of this.strokes.values()) {
      if (s.endedAt === null && now - s.lastAt >= INK_STALE_MS) s.endedAt = s.lastAt + INK_STALE_MS;
    }
  }

  /** Removes all of a share's strokes (`all`), or only one drawer's (`mine`), kept or not. */
  clear(shareId: string, scope: 'mine' | 'all', from: string): void {
    for (const [key, s] of [...this.strokes]) {
      if (s.shareId === shareId && (scope === 'all' || s.from === from)) this.strokes.delete(key);
    }
  }

  dropShare(shareId: string): void {
    this.clear(shareId, 'all', '');
  }

  /** The drawer has left: their open strokes end now and fade like any other. */
  endFrom(from: string, now: number): void {
    for (const s of this.strokes.values()) if (s.from === from && s.endedAt === null) s.endedAt = now;
  }

  /** The share ids that have any stroke. */
  shareIds(): string[] {
    return [...new Set([...this.strokes.values()].map((s) => s.shareId))];
  }

  /** Everyone who has a stroke on screen. */
  drawers(): string[] {
    return [...new Set([...this.strokes.values()].map((s) => s.from))];
  }

  /** How many strokes a share has, or one drawer has on it. Finished ones are only removed by `visible`. */
  count(shareId: string, from?: string): number {
    let n = 0;
    for (const s of this.strokes.values()) if (s.shareId === shareId && (from === undefined || s.from === from)) n++;
    return n;
  }

  /** The share's strokes with their opacity now; strokes that have fully faded are removed. */
  visible(shareId: string, now: number): VisibleStroke[] {
    const out: VisibleStroke[] = [];
    for (const [key, s] of [...this.strokes]) {
      if (strokeDone(now, s.endedAt, s.keep)) {
        this.strokes.delete(key);
        continue;
      }
      if (s.shareId === shareId) out.push({ stroke: s, alpha: strokeAlpha(now, s.endedAt, s.keep) });
    }
    return out;
  }
}
