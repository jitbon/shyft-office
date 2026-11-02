import { describe, expect, it } from 'vitest';
import { outfitGroups, seasonOf } from '../../shared/wardrobe';

describe('seasonOf', () => {
  it('changes on the first of March, June, September and December', () => {
    expect(seasonOf(new Date(2026, 1, 28))).toBe('winter');
    expect(seasonOf(new Date(2026, 2, 1))).toBe('spring');
    expect(seasonOf(new Date(2026, 4, 31))).toBe('spring');
    expect(seasonOf(new Date(2026, 5, 1))).toBe('summer');
    expect(seasonOf(new Date(2026, 7, 31))).toBe('summer');
    expect(seasonOf(new Date(2026, 8, 1))).toBe('autumn');
    expect(seasonOf(new Date(2026, 10, 30))).toBe('autumn');
    expect(seasonOf(new Date(2026, 11, 1))).toBe('winter');
  });
});

describe('outfitGroups', () => {
  it('lists this season first, the others in calendar order, then all year', () => {
    expect(outfitGroups(new Date(2026, 10, 1)).map((g) => g.season)).toEqual(['autumn', 'winter', 'spring', 'summer', 'all']);
    expect(outfitGroups(new Date(2026, 6, 1)).map((g) => g.season)).toEqual(['summer', 'autumn', 'winter', 'spring', 'all']);
  });

  it('puts each outfit in its season\'s group', () => {
    for (const g of outfitGroups(new Date(2026, 0, 1))) {
      expect(g.outfits.length).toBeGreaterThan(0);
      expect(g.outfits.every((o) => o.season === g.season)).toBe(true);
    }
  });
});
