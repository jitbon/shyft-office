import { describe, expect, it } from 'vitest';
import type { ShareInfo } from '../../shared/protocol';
import { soundControlsFor, stagePlan } from '../../src/shareStage';

const share = (sharer: string, startedAt: number, audio = false): ShareInfo => ({
  shareId: `${sharer}:1`, sharer, startedAt, audio, w: 1920, h: 1080, drawing: true,
});
const A = share('a', 1);
const B = share('b', 2);
const C = share('c', 3);

describe('stagePlan', () => {
  it('is empty with no shares', () => {
    expect(stagePlan({ shares: [], selfId: 'me', picked: null })).toEqual({
      large: null, thumbs: [], selfPreview: null, picked: null, started: [],
    });
  });

  it('shows one share from someone else large', () => {
    const p = stagePlan({ shares: [A], selfId: 'me', picked: null });
    expect(p.large).toBe('a:1');
    expect(p.thumbs).toEqual([]);
  });

  it('keeps your own share small, never large', () => {
    const p = stagePlan({ shares: [share('me', 1)], selfId: 'me', picked: null });
    expect(p).toMatchObject({ large: null, thumbs: [], selfPreview: 'me:1', started: [] });
  });

  it('puts the newest large and the rest in thumbnails, newest first', () => {
    const p = stagePlan({ shares: [A, B, C], selfId: 'me', picked: null });
    expect(p.large).toBe('c:1');
    expect(p.thumbs).toEqual(['b:1', 'a:1']);
  });

  it('lets the viewer pick', () => {
    const p = stagePlan({ shares: [A, B], selfId: 'me', picked: 'a:1' });
    expect(p).toMatchObject({ large: 'a:1', thumbs: ['b:1'], picked: 'a:1' });
  });

  it('clears a pick whose share ended and lets the newest take over', () => {
    const p = stagePlan({ shares: [B], selfId: 'me', picked: 'a:1' });
    expect(p).toMatchObject({ large: 'b:1', picked: null });
  });

  it('keeps the pick large when a new share starts, and reports the new one', () => {
    const p = stagePlan({ shares: [A, B, C], selfId: 'me', picked: 'a:1' }, ['a:1', 'b:1']);
    expect(p.large).toBe('a:1');
    expect(p.started).toEqual(['c:1']);
  });

  it('never puts your own share in large or thumbs, or among the started', () => {
    const own = share('me', 2);
    const p = stagePlan({ shares: [A, own], selfId: 'me', picked: null });
    expect(p.large).toBe('a:1');
    expect(p.thumbs).toEqual([]);
    expect(p.selfPreview).toBe('me:1');
    expect(p.started).toEqual(['a:1']);
    expect(stagePlan({ shares: [A, own], selfId: 'me', picked: 'me:1' }).picked).toBeNull();
  });
});

describe('soundControlsFor', () => {
  it('offers sound controls only for a share with sound', () => {
    expect(soundControlsFor(share('a', 1, false))).toBe(false);
    expect(soundControlsFor(share('a', 1, true))).toBe(true);
  });
});

describe('stagePlan with your own share large', () => {
  const mine = share('me', 5);
  it('shows your own share large and the others as thumbnails', () => {
    const p = stagePlan({ shares: [A, B, mine], selfId: 'me', picked: null, selfLarge: true });
    expect(p.large).toBe('me:1');
    expect(p.thumbs).toEqual(['b:1', 'a:1']);
    expect(p.selfPreview).toBe('me:1');
  });
  it('ignores selfLarge when you are not sharing', () => {
    const p = stagePlan({ shares: [A, B], selfId: 'me', picked: null, selfLarge: true });
    expect(p.large).toBe('b:1');
    expect(p.thumbs).toEqual(['a:1']);
  });
  it('leaves the old behaviour alone when selfLarge is off', () => {
    const p = stagePlan({ shares: [A, mine], selfId: 'me', picked: null, selfLarge: false });
    expect(p.large).toBe('a:1');
  });
});

