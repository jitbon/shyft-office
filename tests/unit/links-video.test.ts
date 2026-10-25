import { describe, expect, it } from 'vitest';
import { MAX_VIDEO, pickVideo } from '../../server/links';

const ids = Array.from({ length: 10 }, (_, i) => `m${i}`);

describe('pickVideo', () => {
  it('caps video at six people', () => {
    expect(pickVideo(ids, new Set(), new Map())).toHaveLength(MAX_VIDEO);
  });

  it('falls back to join order when nobody has spoken', () => {
    expect(pickVideo(ids, new Set(), new Map())).toEqual(['m0', 'm1', 'm2', 'm3', 'm4', 'm5']);
  });

  it('puts people speaking now first, then recent speakers, then join order', () => {
    const picked = pickVideo(ids, new Set(['m7', 'm3']), new Map([['m7', 100], ['m3', 200], ['m9', 50]]));
    expect(picked).toEqual(['m3', 'm7', 'm9', 'm0', 'm1', 'm2']);
  });

  it('puts someone who just stopped talking ahead of people who never spoke', () => {
    const picked = pickVideo(ids, new Set(), new Map([['m8', 10]]));
    expect(picked[0]).toBe('m8');
  });
});
