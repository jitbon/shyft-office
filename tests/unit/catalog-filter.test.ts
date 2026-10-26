import { describe, expect, it } from 'vitest';
import { catalogItems, filterCatalog } from '../../shared/catalog';

const all = catalogItems();

describe('filterCatalog', () => {
  it('gives everything when nothing is asked, in the catalog order', () => {
    expect(filterCatalog(all)).toEqual(all);
    expect(filterCatalog(all, { text: '  ' })).toEqual(all);
  });

  it('filters by group', () => {
    const r = filterCatalog(all, { group: 'chairs' });
    expect(r.length).toBeGreaterThanOrEqual(5);
    expect(r.every((i) => i.group === 'chairs')).toBe(true);
  });

  it('filters by season, and never matches an item with no season', () => {
    const r = filterCatalog(all, { season: 'winter' });
    expect(r.length).toBeGreaterThanOrEqual(3);
    expect(r.every((i) => i.season === 'winter')).toBe(true);
    expect(filterCatalog(all, { season: 'autumn' }).some((i) => i.id === 'desk')).toBe(false);
  });

  it('filters by part of a name, ignoring case', () => {
    const r = filterCatalog(all, { text: 'LAMP' });
    expect(r.length).toBeGreaterThanOrEqual(2);
    expect(r.every((i) => i.name.toLowerCase().includes('lamp'))).toBe(true);
  });

  it('combines the three, and clearing gives everything again', () => {
    const r = filterCatalog(all, { group: 'seasonal', season: 'summer', text: 'fan' });
    expect(r.map((i) => i.name)).toEqual(['Desk fan']);
    expect(filterCatalog(all, {})).toHaveLength(all.length);
  });

  it('keeps the catalog order', () => {
    const r = filterCatalog(all, { group: 'desks' });
    expect(r.map((i) => all.indexOf(i))).toEqual([...r.map((i) => all.indexOf(i))].sort((a, b) => a - b));
  });
});

describe('catalogItems', () => {
  it('lists by group in the order of the group bar', () => {
    const order = ['desks', 'chairs', 'computers', 'shelves', 'decorations', 'walldecor', 'floorart', 'odds', 'seasonal'];
    const ranks = all.map((i) => order.indexOf(i.group));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });
});
