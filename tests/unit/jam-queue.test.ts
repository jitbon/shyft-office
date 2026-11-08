import { describe, expect, it } from 'vitest';
import { PER_MEMBER_MAX, QUEUE_MAX, addTrack, canSkip, cleanTitle, removeTrack, trackId, TITLE_MAX, type Current, type Track } from '../../shared/jam';

const track = (n: number, by = 'ana'): Track => ({ id: trackId(n), provider: 'youtube', ref: 'dQw4w9WgXcQ', title: `Song ${n}`, by, byName: by });
const fill = (queue: Track[], n: number, by: string, from: number) => {
  let q = queue;
  for (let i = 0; i < n; i++) {
    const r = addTrack(q, track(from + i, by));
    if (!r.ok) throw new Error(r.reason);
    q = r.queue;
  }
  return q;
};

describe('the queue', () => {
  it('appends in order and never changes the queue it was given', () => {
    const q0: Track[] = [];
    const a = addTrack(q0, track(1));
    expect(a.ok && a.queue.map((t) => t.id)).toEqual(['t1']);
    const b = a.ok && addTrack(a.queue, track(2, 'ben'));
    expect(b && b.ok && b.queue.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(q0).toEqual([]);
  });

  it('refuses a 4th song from one member with member-cap', () => {
    const q = fill([], PER_MEMBER_MAX, 'ana', 1);
    expect(addTrack(q, track(9, 'ana'))).toEqual({ ok: false, reason: 'member-cap' });
    expect(addTrack(q, track(9, 'ben')).ok).toBe(true);
  });

  it('refuses the 21st song with queue-full, whoever adds it', () => {
    let q: Track[] = [];
    for (let i = 0; i < QUEUE_MAX; i++) q = fill(q, 1, `m${i}`, i + 1);
    expect(q).toHaveLength(QUEUE_MAX);
    expect(addTrack(q, track(99, 'fresh'))).toEqual({ ok: false, reason: 'queue-full' });
  });

  it('removes a track only for the member who added it', () => {
    const q = fill(fill([], 1, 'ana', 1), 1, 'ben', 2);
    expect(removeTrack(q, 't1', 'ben')).toBeNull();
    expect(removeTrack(q, 'nope', 'ana')).toBeNull();
    expect(removeTrack(q, 't1', 'ana')?.map((t) => t.id)).toEqual(['t2']);
    expect(q).toHaveLength(2);
  });

  it('skips only while a track, not the station, is playing', () => {
    const cur: Current = { track: track(1), startedAt: 0, fails: new Set() };
    expect(canSkip(cur)).toBe(true);
    expect(canSkip(null)).toBe(false);
  });

  it('makes distinct ids for distinct counters', () => {
    const ids = new Set(Array.from({ length: 50 }, (_, i) => trackId(i + 1)));
    expect(ids.size).toBe(50);
  });

  it('cleans titles: control characters out, trimmed, cut to the limit', () => {
    expect(cleanTitle('  Hello\u0000\u0007 \n World  ')).toBe('Hello World');
    expect(cleanTitle('x'.repeat(500))).toHaveLength(TITLE_MAX);
    expect(cleanTitle(undefined)).toBe('');
  });
});
