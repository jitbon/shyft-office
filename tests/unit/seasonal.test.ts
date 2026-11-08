import { describe, expect, it } from 'vitest';
import { THEMES } from '../../shared/themes';
import { compose, seasonLayer } from '../../src/seasonal';
import { pixelHash } from './paint-helpers';

const accents = THEMES[0].seasons;

describe('seasonal touches', () => {
  it('give each season its own window and its own trim', () => {
    const windows = (['winter', 'spring', 'summer', 'autumn'] as const).map((s) => pixelHash(seasonLayer('G', accents[s], 0)));
    expect(new Set(windows).size).toBe(4);
    const trims = (['winter', 'spring', 'summer', 'autumn'] as const).map((s) => pixelHash(seasonLayer('#', accents[s], 0)));
    expect(new Set(trims).size).toBe(4);
  });

  it('draw the same pixels every time, and the trim lower down in the top-down view', () => {
    expect(pixelHash(seasonLayer('G', accents.winter, 0))).toBe(pixelHash(seasonLayer('G', accents.winter, 0)));
    expect(pixelHash(seasonLayer('#', accents.winter, 12))).not.toBe(pixelHash(seasonLayer('#', accents.winter, 0)));
  });

  it('leave a plain wall with no trim untouched', () => {
    const none = { ...accents.winter, trim: 'none' as const };
    expect(seasonLayer('#', none, 0).data.every((c) => c === 0)).toBe(true);
  });

  it('only change the pixels they cover when laid over a picture', () => {
    const base = { w: 32, h: 32, data: new Uint32Array(1024).fill(0xff102030) };
    const layer = seasonLayer('#', accents.winter, 0);
    const out = compose(base, layer);
    const changed = out.data.filter((c, i) => c !== base.data[i]).length;
    expect(changed).toBeGreaterThan(0);
    expect(changed).toBeLessThan(200);
    expect(base.data.every((c) => c === 0xff102030)).toBe(true); // the original is not changed
  });
});
