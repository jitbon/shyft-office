import { describe, expect, it } from 'vitest';
import { screenBitrate } from '../../shared/screen-share';

describe('screenBitrate', () => {
  it('gives the most to one or two receivers', () => {
    expect(screenBitrate(0)).toBe(2_500_000);
    expect(screenBitrate(1)).toBe(2_500_000);
    expect(screenBitrate(2)).toBe(2_500_000);
  });

  it('shares the budget among more receivers', () => {
    expect(screenBitrate(3)).toBe(2_000_000);
    expect(screenBitrate(7)).toBe(857_142);
  });

  it('never goes below the floor', () => {
    expect(screenBitrate(20)).toBe(400_000);
    expect(screenBitrate(1000)).toBe(400_000);
  });

  it('is always an integer', () => {
    for (let n = 0; n < 40; n++) expect(Number.isInteger(screenBitrate(n))).toBe(true);
  });
});
