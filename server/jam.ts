// Jam Rooms: shared listening, run by the server. It decides who is a listener, the queue and its order, and when a track
// ends. Browsers play the sound themselves: linked songs in the provider's own embedded player, the station from code
// (shared/lofi.ts). The server stores and relays no audio. Only a room's listeners ever receive its state.
import crypto from 'node:crypto';
import {
  GAP_MS, TICK_MS, addRefusal, addTrack, canSkip, cleanTitle, failMajority, judgeLength, lengthTimedOut, nextAfter, parseTrackLink, removeTrack,
  trackEnded, trackId, type AddRefusal, type Current, type LinkError, type Track,
} from '../shared/jam';
import type { ClientMsg, JamState, ServerMsg } from '../shared/protocol';

export type LookupFailure = 'not-found' | 'lookup-failed';
export type TitleLookup = (provider: 'youtube', ref: string) => Promise<{ title: string } | { error: LookupFailure }>;

type Refusal = LinkError | AddRefusal | LookupFailure | 'rate' | 'not-in-room';

/** Plain-words texts for everything a member can be refused (contracts/protocol.md). */
export const REFUSALS: Record<Refusal, string> = {
  'bad-link': 'That does not look like a link to a song.',
  'unsupported-site': 'Only YouTube links work for now.',
  'queue-full': 'The queue is full (20 songs). Wait for one to finish.',
  'member-cap': 'You already have 3 songs waiting. Wait for one to play.',
  'not-found': 'That song could not be found, or it cannot be played here.',
  'lookup-failed': 'Could not look that song up just now. Try again in a moment.',
  rate: 'Slow down a little.',
  'not-in-room': 'You are not in a Jam Room.',
};

export interface JamTimings {
  tickMs?: number;
  gapMs?: number;
}

export interface JamDeps {
  send(id: string, msg: ServerMsg): void;
  nameOf(id: string): string;
  /** The stable member id, so a member's cap holds across tabs. */
  memberOf(id: string): string;
  /** Office Arena players are never listeners. */
  inArena(id: string): boolean;
  /** The Jam Rooms in the current layout: room id to room name. */
  rooms(): Map<string, string>;
  now?: () => number;
  lookup?: TitleLookup;
  timings?: JamTimings;
  seed?: () => number;
}

interface JamRoom {
  roomId: string;
  name: string;
  listeners: Set<string>;
  mode: 'station' | 'track';
  stationEpoch: number;
  seed: number;
  current: Current | null;
  queue: Track[];
  gapUntil: number | null;
  counter: number;
}

export class JamEngine {
  private rooms = new Map<string, JamRoom>();
  private where = new Map<string, string>();
  private now: () => number;
  private lookup: TitleLookup;
  private gapMs: number;

  constructor(private deps: JamDeps) {
    this.now = deps.now ?? Date.now;
    this.lookup = deps.lookup ?? oembedLookup();
    this.gapMs = deps.timings?.gapMs ?? GAP_MS;
  }

  get tickMs() {
    return this.deps.timings?.tickMs ?? TICK_MS;
  }

  roomOf(id: string): string | null {
    return this.where.get(id) ?? null;
  }

  listenersOf(roomId: string): string[] {
    return [...(this.rooms.get(roomId)?.listeners ?? [])];
  }

  /** Makes `id` a listener of Jam Room `roomId`. False when they cannot be one (not a Jam Room, or they are in a match). */
  enter(id: string, roomId: string): boolean {
    if (this.deps.inArena(id)) return false;
    const name = this.deps.rooms().get(roomId);
    if (name === undefined) return false;
    if (this.where.get(id) === roomId) return true;
    if (this.where.has(id)) this.leave(id, true);
    let room = this.rooms.get(roomId);
    if (!room) {
      room = {
        roomId, name, listeners: new Set(), mode: 'station', stationEpoch: this.now(), seed: this.deps.seed?.() ?? crypto.randomInt(1, 2 ** 31),
        current: null, queue: [], gapUntil: null, counter: 0,
      };
      this.rooms.set(roomId, room);
    }
    room.listeners.add(id);
    this.where.set(id, roomId);
    this.broadcast(room);
    return true;
  }

  /** Stops `id` being a listener. They get one `room: null` (not when `quiet`, because another room's state follows). */
  leave(id: string, quiet = false) {
    const roomId = this.where.get(id);
    if (roomId === undefined) return;
    this.where.delete(id);
    if (!quiet) this.deps.send(id, { t: 'jam', room: null });
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.listeners.delete(id);
    room.current?.fails.delete(id);
    if (!room.listeners.size) {
      this.rooms.delete(roomId); // the queue goes with the last listener
      return;
    }
    if (room.current && failMajority(room.current.fails, room.listeners)) this.unplayable(room);
    else this.broadcast(room);
  }

  /** The layout changed: rooms that are no longer Jam Rooms close, and renamed ones are told the new name. */
  roomsChanged() {
    const now = this.deps.rooms();
    for (const room of [...this.rooms.values()]) {
      const name = now.get(room.roomId);
      if (name === undefined) {
        for (const id of room.listeners) {
          this.where.delete(id);
          this.deps.send(id, { t: 'jamNote', text: 'This room is no longer a Jam Room. The music has stopped.' });
          this.deps.send(id, { t: 'jam', room: null });
        }
        this.rooms.delete(room.roomId);
      } else if (name !== room.name) {
        room.name = name;
        this.broadcast(room);
      }
    }
  }

  /** A message from a member. Anything from someone who is not a listener changes nothing. */
  handle(id: string, msg: ClientMsg) {
    const room = this.rooms.get(this.where.get(id) ?? '');
    if (!room || !room.listeners.has(id)) {
      if (msg.t === 'jam' && msg.op === 'add') this.refuse(id, 'not-in-room');
      return;
    }
    if (msg.t === 'jam') {
      if (msg.op === 'add') void this.add(id, room, msg.url);
      else if (msg.op === 'remove') this.remove(id, room, msg.id);
      else if (msg.op === 'skip') this.skip(id, room);
    } else if (msg.t === 'jamTrack') {
      this.length(room, msg.id, msg.len);
    } else if (msg.t === 'jamFail') {
      this.fail(id, room, msg.id);
    }
  }

  /** Moves things on: ends finished or unplayable tracks and starts the next one after the gap. */
  tick() {
    const now = this.now();
    for (const room of [...this.rooms.values()]) {
      const cur = room.current;
      if (cur) {
        if (trackEnded(cur, now)) this.advance(room);
        else if (lengthTimedOut(cur, now)) this.unplayable(room);
      } else if (room.gapUntil !== null && now >= room.gapUntil) {
        room.gapUntil = null;
        if (room.queue.length) this.startNext(room);
        else {
          room.mode = 'station';
          this.broadcast(room);
        }
      }
    }
  }

  // ---------------------------------------------------------------- actions

  private refuse(id: string, why: Refusal) {
    this.deps.send(id, { t: 'notify', kind: 'error', text: REFUSALS[why] });
  }

  private async add(id: string, room: JamRoom, url: unknown) {
    const parsed = parseTrackLink(typeof url === 'string' ? url : '');
    if (!parsed.ok) return this.refuse(id, parsed.reason);
    const member = this.deps.memberOf(id);
    const early = addRefusal(room.queue, member);
    if (early) return this.refuse(id, early);
    let found: Awaited<ReturnType<TitleLookup>>;
    try {
      found = await this.lookup(parsed.provider, parsed.ref);
    } catch {
      found = { error: 'lookup-failed' };
    }
    if ('error' in found) return this.refuse(id, found.error);
    // Time has passed: they may have left, or the room closed, or the queue may have filled meanwhile.
    if (this.rooms.get(room.roomId) !== room || !room.listeners.has(id)) return;
    const track: Track = {
      id: trackId(++room.counter),
      provider: parsed.provider,
      ref: parsed.ref,
      title: cleanTitle(found.title) || 'Untitled song',
      by: member,
      byName: this.deps.nameOf(id),
    };
    const added = addTrack(room.queue, track);
    if (!added.ok) return this.refuse(id, added.reason);
    room.queue = added.queue;
    if (!room.current && room.gapUntil === null) room.gapUntil = this.now() + this.gapMs;
    this.broadcast(room);
  }

  private remove(id: string, room: JamRoom, trackIdValue: unknown) {
    if (typeof trackIdValue !== 'string' || trackIdValue.length > 16) return;
    const next = removeTrack(room.queue, trackIdValue, this.deps.memberOf(id));
    if (!next) return;
    room.queue = next;
    if (!room.queue.length && !room.current) {
      room.mode = 'station';
      room.gapUntil = null;
    }
    this.broadcast(room);
  }

  private skip(id: string, room: JamRoom) {
    if (!room.current || !canSkip(room.current)) return;
    this.note(room, `${this.deps.nameOf(id)} skipped *${room.current.track.title}*`);
    this.advance(room);
  }

  private length(room: JamRoom, trackIdValue: unknown, len: unknown) {
    const cur = room.current;
    if (!cur || typeof trackIdValue !== 'string' || cur.track.id !== trackIdValue || typeof len !== 'number') return;
    const verdict = judgeLength(cur, len);
    if (verdict === 'set') {
      cur.len = len;
      this.broadcast(room);
    } else if (verdict === 'unplayable') {
      this.unplayable(room);
    }
  }

  private fail(id: string, room: JamRoom, trackIdValue: unknown) {
    const cur = room.current;
    if (!cur || typeof trackIdValue !== 'string' || cur.track.id !== trackIdValue) return;
    cur.fails.add(id);
    if (failMajority(cur.fails, room.listeners)) this.unplayable(room);
  }

  private unplayable(room: JamRoom) {
    if (!room.current) return;
    this.note(room, `*${room.current.track.title}* can't be played here, skipping`);
    this.advance(room);
  }

  /** The current track is over: the next queued one after the gap, or the station. */
  private advance(room: JamRoom) {
    room.current = null;
    const next = nextAfter(room.queue, this.now(), this.gapMs);
    if (next.mode === 'station') {
      room.mode = 'station';
      room.gapUntil = null;
    } else {
      room.mode = 'track';
      room.gapUntil = next.startAt;
    }
    this.broadcast(room);
  }

  private startNext(room: JamRoom) {
    const track = room.queue.shift();
    if (!track) return;
    room.current = { track, startedAt: this.now(), fails: new Set() };
    room.mode = 'track';
    this.broadcast(room);
  }

  // ---------------------------------------------------------------- sending

  private note(room: JamRoom, text: string) {
    for (const id of room.listeners) this.deps.send(id, { t: 'jamNote', text });
  }

  private stateFor(room: JamRoom, id: string): JamState {
    const member = this.deps.memberOf(id);
    const cur = room.current;
    return {
      t: 'jam',
      room: room.roomId,
      name: room.name,
      now: this.now(),
      mode: room.mode,
      station: { seed: room.seed, epoch: room.stationEpoch },
      ...(cur
        ? {
            track: {
              id: cur.track.id, provider: cur.track.provider, ref: cur.track.ref, title: cur.track.title, byName: cur.track.byName,
              startedAt: cur.startedAt, ...(cur.len === undefined ? {} : { len: cur.len }),
            },
          }
        : {}),
      queue: room.queue.map((t) => ({ id: t.id, provider: t.provider, ref: t.ref, title: t.title, byName: t.byName, mine: t.by === member })),
      listeners: [...room.listeners].map((l) => this.deps.nameOf(l)),
    };
  }

  private broadcast(room: JamRoom) {
    for (const id of room.listeners) this.deps.send(id, this.stateFor(room, id));
  }
}

/**
 * The default title lookup: YouTube's public oEmbed endpoint, built from the validated id only. It gives up after 4 s, reads at most
 * 64 KB, follows no redirects, runs at most 4 lookups at once, and remembers an answer for an hour.
 */
export function oembedLookup(fetchImpl: typeof fetch = fetch): TitleLookup {
  const cache = new Map<string, { title: string; at: number }>();
  const waiting: (() => void)[] = [];
  let busy = 0;
  const slot = async () => {
    if (busy >= 4) await new Promise<void>((r) => waiting.push(r));
    busy++;
  };
  const free = () => {
    busy--;
    waiting.shift()?.();
  };
  return async (_provider, ref) => {
    const hit = cache.get(ref);
    if (hit && Date.now() - hit.at < 3_600_000) return { title: hit.title };
    await slot();
    try {
      const watch = `https://www.youtube.com/watch?v=${ref}`;
      const res = await fetchImpl(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watch)}`, {
        redirect: 'error',
        signal: AbortSignal.timeout(4000),
      });
      if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 404) return { error: 'not-found' };
      if (!res.ok || !res.body) return { error: 'lookup-failed' };
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 64 * 1024) {
          await reader.cancel();
          return { error: 'lookup-failed' };
        }
        chunks.push(value);
      }
      const data = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { title?: unknown };
      const title = cleanTitle(data.title);
      if (!title) return { error: 'not-found' };
      cache.set(ref, { title, at: Date.now() });
      return { title };
    } catch {
      return { error: 'lookup-failed' };
    } finally {
      free();
    }
  };
}
