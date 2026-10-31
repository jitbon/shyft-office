import type { LinkContext, ShareInfo } from '../shared/protocol';
import { MAX_SHARES, shareKeeps, type SharePlace } from '../shared/screen-share';

interface ShareRecord extends ShareInfo {
  /** Where the sharer stood when the share started. */
  origin: LinkContext;
}

export type StartResult = { ok: true; shareId: string } | { ok: false; reason: 'full' };

/** The screen shares running now. Nothing is kept once a share ends. */
export class ShareRegistry {
  private shares = new Map<string, ShareRecord>();
  private counts = new Map<string, number>();

  /**
   * Starts a share, or only updates a running one (sound and size). `members` is the sharer's
   * conversation (just the sharer when alone); at most MAX_SHARES run among them.
   */
  start(
    sharer: string,
    spec: { audio: boolean; w: number; h: number },
    origin: LinkContext,
    members: string[],
    now: number,
  ): StartResult {
    const running = this.shares.get(sharer);
    if (running) {
      running.audio = spec.audio;
      running.w = spec.w;
      running.h = spec.h;
      return { ok: true, shareId: running.shareId };
    }
    const among = new Set(members.length ? members : [sharer]);
    let count = 0;
    for (const s of this.shares.values()) if (among.has(s.sharer)) count++;
    if (count >= MAX_SHARES) return { ok: false, reason: 'full' };
    const n = (this.counts.get(sharer) ?? 0) + 1;
    this.counts.set(sharer, n);
    const shareId = `${sharer}:${n}`;
    this.shares.set(sharer, { shareId, sharer, startedAt: now, audio: spec.audio, w: spec.w, h: spec.h, origin });
    return { ok: true, shareId };
  }

  /** Ends the sharer's share. True when there was one. */
  stop(sharer: string): boolean {
    return this.shares.delete(sharer);
  }

  has(sharer: string): boolean {
    return this.shares.has(sharer);
  }

  /**
   * Ends every share the sharer's current place no longer keeps. `placeOf` returns null for a
   * player who is gone, which ends the share without a report.
   */
  sweep(placeOf: (sharer: string) => SharePlace | null): { sharer: string; reason: 'left' | 'dnd' }[] {
    const ended: { sharer: string; reason: 'left' | 'dnd' }[] = [];
    for (const [sharer, s] of [...this.shares]) {
      const place = placeOf(sharer);
      if (place && shareKeeps(s.origin, place)) continue;
      this.shares.delete(sharer);
      if (place) ended.push({ sharer, reason: place.dnd ? 'dnd' : 'left' });
    }
    return ended;
  }

  /** The running shares of these players, oldest first, as members see them. */
  sharesOf(members: string[]): ShareInfo[] {
    const among = new Set(members);
    return [...this.shares.values()]
      .filter((s) => among.has(s.sharer))
      .sort((a, b) => a.startedAt - b.startedAt)
      .map(({ origin: _origin, ...info }) => info);
  }
}
