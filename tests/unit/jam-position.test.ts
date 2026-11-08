import { describe, expect, it } from 'vitest';
import {
  GAP_MS, LENGTH_WAIT_MS, failMajority, judgeLength, lengthTimedOut, nextAfter, positionAt, trackEnded, trackId, type Current, type Track,
} from '../../shared/jam';

const track = (n: number): Track => ({ id: trackId(n), provider: 'youtube', ref: 'dQw4w9WgXcQ', title: `Song ${n}`, by: 'ana', byName: 'Ana' });
const cur = (over: Partial<Current> = {}): Current => ({ track: track(1), startedAt: 1000, fails: new Set(), ...over });

describe('positionAt', () => {
  it('counts from the start in milliseconds', () => {
    expect(positionAt(cur({ len: 200 }), 6000)).toBe(5000);
  });
  it('never goes below 0 or past the length', () => {
    expect(positionAt(cur({ len: 200 }), 500)).toBe(0);
    expect(positionAt(cur({ len: 200 }), 1000 + 999_000)).toBe(200_000);
  });
  it('keeps counting while the length is unknown', () => {
    expect(positionAt(cur(), 1000 + 400_000)).toBe(400_000);
  });
});

describe('nextAfter', () => {
  it('plays the next queued track after the gap', () => {
    const n = nextAfter([track(2), track(3)], 5000);
    expect(n).toMatchObject({ mode: 'track', startAt: 5000 + GAP_MS });
    if (n.mode === 'track') {
      expect(n.track.id).toBe('t2');
      expect(n.rest.map((t) => t.id)).toEqual(['t3']);
    }
  });
  it('goes back to the station when nothing is queued', () => {
    expect(nextAfter([], 5000)).toEqual({ mode: 'station' });
  });
});

describe('the length rule', () => {
  it('takes the first valid report and ignores later ones', () => {
    expect(judgeLength(cur(), 180)).toBe('set');
    expect(judgeLength(cur({ len: 180 }), 60)).toBe('ignored');
    expect(judgeLength(cur({ len: 180 }), 0)).toBe('ignored');
  });
  it.each([0, 3, 4, 1201, 5000, 12.5, -10, NaN, '90', null])('counts %s as unplayable', (len) => {
    expect(judgeLength(cur(), len)).toBe('unplayable');
  });
  it.each([5, 1200, 240])('accepts %s', (len) => {
    expect(judgeLength(cur(), len)).toBe('set');
  });
  it('ends a track at its length, and not before', () => {
    expect(trackEnded(cur({ len: 10 }), 1000 + 9999)).toBe(false);
    expect(trackEnded(cur({ len: 10 }), 1000 + 10_000)).toBe(true);
    expect(trackEnded(cur(), 1000 + 10_000_000)).toBe(false);
  });
  it('times out when no length arrives', () => {
    expect(lengthTimedOut(cur(), 1000 + LENGTH_WAIT_MS - 1)).toBe(false);
    expect(lengthTimedOut(cur(), 1000 + LENGTH_WAIT_MS)).toBe(true);
    expect(lengthTimedOut(cur({ len: 100 }), 1000 + LENGTH_WAIT_MS * 10)).toBe(false);
  });
});

describe('failMajority', () => {
  const who = (...ids: string[]) => new Set(ids);
  it('needs more than half of the listeners', () => {
    expect(failMajority(who('a'), who('a', 'b', 'c'))).toBe(false);
    expect(failMajority(who('a', 'b'), who('a', 'b', 'c'))).toBe(true);
    expect(failMajority(who('a'), who('a', 'b'))).toBe(false);
    expect(failMajority(who('a'), who('a'))).toBe(true);
  });
  it('does not count people who have left', () => {
    expect(failMajority(who('a', 'gone1', 'gone2'), who('a', 'b', 'c'))).toBe(false);
  });
  it('counts each sender once because it is a set', () => {
    const fails = who();
    for (let i = 0; i < 5; i++) fails.add('a');
    expect(failMajority(fails, who('a', 'b', 'c'))).toBe(false);
  });
});
