import type { ConversationInfo, Link, PlayerState, ServerMsg, ShareInfo } from '../shared/protocol';
import { assignInkSlots } from '../shared/ink';
import { computeLinks, pairKey, prevFrom, type LinkResult, type OfficeInput } from '../shared/proximity';

const EMPTY = JSON.stringify({ links: [], conversation: null, full: false });

/** Area meetings above this many people limit who sends video (FR-011a). */
export const VIDEO_THRESHOLD = 8;
/** At most this many people send video in such a meeting. */
export const MAX_VIDEO = 6;

/**
 * Who may send video in a big meeting: people speaking now first, then the most recent
 * speakers, then join order. `members` is in join order.
 */
export function pickVideo(
  members: string[],
  speaking: ReadonlySet<string>,
  spokeAt: ReadonlyMap<string, number>,
  limit = MAX_VIDEO,
): string[] {
  return members
    .map((id, joined) => ({ id, joined }))
    .sort((a, b) => {
      const s = +speaking.has(b.id) - +speaking.has(a.id);
      if (s) return s;
      const t = (spokeAt.get(b.id) ?? 0) - (spokeAt.get(a.id) ?? 0);
      return t || a.joined - b.joined;
    })
    .slice(0, limit)
    .map((m) => m.id);
}

/**
 * Recomputes the link graph from player positions and tells each player about their own
 * links, and only when those changed. Clients open and close peer connections to match.
 */
export class LinkEngine {
  private prev = new Set<string>();
  private result: LinkResult = { links: [], conversations: [], overflow: new Set() };
  private pairs = new Set<string>();
  private sent = new Map<string, string>();
  private speaking = new Set<string>();
  private spokeAt = new Map<string, number>();
  /** Each player's ink color slot, kept while they stay in a conversation that has a share. */
  private inkSlots = new Map<string, number>();
  /** Runs before every recompute, for time-based changes such as expiring statuses. */
  beforeUpdate: () => void = () => {};
  private tickMs = 0;
  private maxTickMs = 0;
  private peakMs = 0;
  private timer: NodeJS.Timeout | undefined;
  private logTimer: NodeJS.Timeout | undefined;

  private opts: { maxOpen?: number };
  private office: () => OfficeInput;
  private shares: (members: string[]) => ShareInfo[];

  constructor(
    /** Players in join order. */
    private players: () => PlayerState[],
    private send: (id: string, msg: ServerMsg) => void,
    inputs: {
      maxOpen?: number;
      /** Desk locks and pod modes, as of now. */
      office?: () => OfficeInput;
      /** The running screen shares of these players, oldest first. */
      shares?: (members: string[]) => ShareInfo[];
    } = {},
  ) {
    this.opts = { maxOpen: inputs.maxOpen };
    this.office = inputs.office ?? (() => ({}));
    this.shares = inputs.shares ?? (() => []);
  }

  start(tickMs: number) {
    this.timer = setInterval(() => this.update(), tickMs);
    this.logTimer = setInterval(() => {
      if (this.maxTickMs > 0) console.log(`link tick: last ${this.tickMs.toFixed(2)} ms, max ${this.maxTickMs.toFixed(2)} ms`);
      this.maxTickMs = 0;
    }, 30000);
    this.timer.unref?.();
    this.logTimer.unref?.();
  }

  stop() {
    clearInterval(this.timer);
    clearInterval(this.logTimer);
  }

  /** How long a recompute takes: the last one, and the slowest since the engine started. */
  stats(): { lastMs: number; peakMs: number } {
    return { lastMs: this.tickMs, peakMs: this.peakMs };
  }

  /** True when the two players currently have a link of any kind. */
  hasLink(a: string, b: string): boolean {
    return this.pairs.has(pairKey(a, b));
  }

  /** Ids of everyone in the player's conversation, including the player. Empty when alone. */
  conversationMembers(id: string): string[] {
    return this.result.conversations.find((c) => c.members.includes(id))?.members ?? [];
  }

  /** Records who is talking, which decides who sends video in big area meetings. */
  noteSpeaking(id: string, on: boolean) {
    if (on) this.speaking.add(id);
    else this.speaking.delete(id);
    this.spokeAt.set(id, Date.now());
  }

  /** Forget a departed player; the next update tells the people who were linked to them. */
  remove(id: string) {
    this.sent.delete(id);
    this.speaking.delete(id);
    this.spokeAt.delete(id);
    this.inkSlots.delete(id);
  }

  update() {
    const t0 = performance.now();
    this.beforeUpdate();
    const players = this.players();
    this.result = computeLinks(players, this.prev, this.opts, this.office());
    this.prev = prevFrom(this.result.links);
    this.pairs = new Set(this.result.links.map((l) => pairKey(l.a, l.b)));

    // Ink colors: one slot per member of any conversation, kept while they stay in one (even between shares), and sent
    // only with a conversation that has a share.
    const inkOf = new Map<string, Record<string, number>>();
    const inConversation = new Set<string>();
    for (const c of this.result.conversations) {
      const slots = assignInkSlots(c.members, this.inkSlots);
      const hasShare = this.shares(c.members).length > 0;
      const ink = hasShare ? Object.fromEntries(slots) : undefined;
      for (const id of c.members) {
        inConversation.add(id);
        this.inkSlots.set(id, slots.get(id)!);
        if (ink) inkOf.set(id, ink);
      }
    }
    for (const id of [...this.inkSlots.keys()]) if (!inConversation.has(id)) this.inkSlots.delete(id);

    for (const p of players) {
      const links: Link[] = [];
      for (const l of this.result.links) {
        if (l.a === p.id) links.push({ peer: l.b, kind: l.kind, context: l.context });
        else if (l.b === p.id) links.push({ peer: l.a, kind: l.kind, context: l.context });
      }
      links.sort((x, y) => (x.peer < y.peer ? -1 : x.peer > y.peer ? 1 : 0));
      const conv = this.result.conversations.find((c) => c.members.includes(p.id));
      const shares = conv ? this.shares(conv.members) : [];
      const conversation: ConversationInfo | null = conv
        ? {
            id: conv.id,
            members: conv.members,
            context: conv.context,
            label: conv.label,
            ...(conv.context.startsWith('area:') && conv.members.length > VIDEO_THRESHOLD
              ? { video: pickVideo(conv.members, this.speaking, this.spokeAt) }
              : {}),
            ...(shares.length ? { shares, ink: inkOf.get(p.id) } : {}),
          }
        : null;
      const full = this.result.overflow.has(p.id);
      const sig = JSON.stringify({ links, conversation, full });
      if (sig === (this.sent.get(p.id) ?? EMPTY)) continue;
      this.sent.set(p.id, sig);
      this.send(p.id, { t: 'links', links, conversation, ...(full ? { full } : {}) });
    }

    this.tickMs = performance.now() - t0;
    this.maxTickMs = Math.max(this.maxTickMs, this.tickMs);
    this.peakMs = Math.max(this.peakMs, this.tickMs);
  }
}
