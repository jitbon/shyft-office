// Jam Mode rules that need no timers and no I/O: reading a pasted link, the queue limits, where a track is up to, and when it ends.
// The server decides with these (server/jam.ts); the browser only uses the numbers it is sent.

export const QUEUE_MAX = 20;
export const PER_MEMBER_MAX = 3;
export const TITLE_MAX = 100;
export const TRACK_MIN_S = 5;
export const TRACK_MAX_S = 1200;
/** How long a track may go without a reported length before it counts as unplayable. */
export const LENGTH_WAIT_MS = 15_000;
/** How far a listener may be from the shared position before they seek. */
export const DRIFT_MS = 1500;
/** Silence between tracks. */
export const GAP_MS = 800;
export const TICK_MS = 500;
export const URL_MAX = 300;

export type Provider = 'youtube';

export interface Track {
  /** Made by the server, unique in the room (`t1`, `t2`, …). */
  id: string;
  provider: Provider;
  /** The provider's id: eleven characters for YouTube, never a URL. */
  ref: string;
  title: string;
  /** The adder's member id; never sent to clients. */
  by: string;
  byName: string;
}

/** What is playing now. `len` is in seconds, set by the first valid report. */
export interface Current {
  track: Track;
  startedAt: number;
  len?: number;
  fails: Set<string>;
}

export type LinkError = 'bad-link' | 'unsupported-site';
export type LinkResult = { ok: true; provider: Provider; ref: string } | { ok: false; reason: LinkError };

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const YT_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com']);
const YT_SHORT = 'youtu.be';
const PATH_KINDS = new Set(['shorts', 'embed', 'live']);

/** Reads a pasted link down to the provider's video id. Everything else in the link (lists, times, tracking) is dropped. */
export function parseTrackLink(input: unknown): LinkResult {
  const bad: LinkResult = { ok: false, reason: 'bad-link' };
  if (typeof input !== 'string') return bad;
  const text = input.trim();
  if (!text || text.length > URL_MAX) return bad;
  let u: URL;
  try {
    u = new URL(text);
  } catch {
    return bad;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return bad;
  const host = u.hostname.toLowerCase();
  const short = host === YT_SHORT;
  if (!short && !YT_HOSTS.has(host)) return { ok: false, reason: 'unsupported-site' };
  if (u.username || u.password) return bad;
  const parts = u.pathname.split('/').filter(Boolean);
  let ref: string | null = null;
  if (short) ref = parts[0] ?? null;
  else if (parts[0] === 'watch') ref = u.searchParams.get('v');
  else if (parts.length === 2 && PATH_KINDS.has(parts[0])) ref = parts[1];
  return ref !== null && YT_ID.test(ref) ? { ok: true, provider: 'youtube', ref } : bad;
}

/** A title safe to show: control characters removed, trimmed, cut to `TITLE_MAX`. */
export function cleanTitle(raw: unknown): string {
  const text = typeof raw === 'string' ? raw : '';
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX);
}

export const trackId = (n: number) => `t${n}`;

export type AddRefusal = 'queue-full' | 'member-cap';

/** Why this member cannot add another song, or null when they can. */
export function addRefusal(queue: readonly Track[], memberId: string): AddRefusal | null {
  if (queue.length >= QUEUE_MAX) return 'queue-full';
  if (queue.filter((t) => t.by === memberId).length >= PER_MEMBER_MAX) return 'member-cap';
  return null;
}

export function addTrack(queue: readonly Track[], track: Track): { ok: true; queue: Track[] } | { ok: false; reason: AddRefusal } {
  const reason = addRefusal(queue, track.by);
  return reason ? { ok: false, reason } : { ok: true, queue: [...queue, track] };
}

/** The queue without track `id`, or null when it is not in the queue or was not added by `memberId`. */
export function removeTrack(queue: readonly Track[], id: string, memberId: string): Track[] | null {
  const i = queue.findIndex((t) => t.id === id);
  if (i < 0 || queue[i].by !== memberId) return null;
  return [...queue.slice(0, i), ...queue.slice(i + 1)];
}

/** Only a linked song can be skipped; the station cannot. */
export const canSkip = (current: Current | null): boolean => current !== null;

/** Milliseconds into the track: never below 0, and never past the end once the length is known. */
export function positionAt(cur: Pick<Current, 'startedAt' | 'len'>, now: number): number {
  const ms = Math.max(0, now - cur.startedAt);
  return cur.len === undefined ? ms : Math.min(ms, cur.len * 1000);
}

export type Next = { mode: 'station' } | { mode: 'track'; track: Track; rest: Track[]; startAt: number };

/** What follows a finished track: the next queued one after the gap, or the station when nothing is waiting. */
export function nextAfter(queue: readonly Track[], now: number, gapMs = GAP_MS): Next {
  if (!queue.length) return { mode: 'station' };
  return { mode: 'track', track: queue[0], rest: queue.slice(1), startAt: now + gapMs };
}

export const lengthOk = (len: unknown): len is number => typeof len === 'number' && Number.isInteger(len) && len >= TRACK_MIN_S && len <= TRACK_MAX_S;

/**
 * A listener reports the track's length in seconds. The first valid report wins and later ones are ignored.
 * A first report that is out of range means the track cannot be used.
 */
export function judgeLength(cur: Pick<Current, 'len'>, len: unknown): 'set' | 'ignored' | 'unplayable' {
  if (cur.len !== undefined) return 'ignored';
  return lengthOk(len) ? 'set' : 'unplayable';
}

/** The track has run its full length. */
export const trackEnded = (cur: Pick<Current, 'startedAt' | 'len'>, now: number): boolean =>
  cur.len !== undefined && now - cur.startedAt >= cur.len * 1000;

/** Nobody reported a length in time. */
export const lengthTimedOut = (cur: Pick<Current, 'startedAt' | 'len'>, now: number): boolean =>
  cur.len === undefined && now - cur.startedAt >= LENGTH_WAIT_MS;

/** More than half of the listeners cannot play it. Each listener counts once; people who left do not count. */
export function failMajority(fails: ReadonlySet<string>, listeners: ReadonlySet<string>): boolean {
  let n = 0;
  for (const id of fails) if (listeners.has(id)) n++;
  return n > listeners.size / 2;
}
