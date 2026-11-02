import { describe, expect, it } from 'vitest';
import { CATALOG, CLOTH_COLORS, DEFAULTS, HAIR_COLORS, SKIN_TONES, byKind } from '../../shared/wardrobe';

const HEX = /^#[0-9a-f]{6}$/;

describe('wardrobe catalog', () => {
  it('has enough options of each kind', () => {
    const min = { hairStyle: 10, face: 6, top: 8, bottom: 5, shoes: 4, accessory: 8, outfit: 20 } as const;
    for (const [kind, n] of Object.entries(min)) expect(byKind(kind as keyof typeof min).length, kind).toBeGreaterThanOrEqual(n);
    expect(byKind('hairStyle').some((o) => o.id === 'bald')).toBe(true);
  });

  it('has outfits for every season and the named ones', () => {
    const outfits = byKind('outfit');
    for (const s of ['winter', 'spring', 'summer', 'autumn'] as const) {
      expect(outfits.filter((o) => o.season === s).length, s).toBeGreaterThanOrEqual(3);
    }
    expect(outfits.filter((o) => o.season === 'all').length).toBeGreaterThanOrEqual(4);
    const ids = outfits.map((o) => o.id);
    for (const id of ['snowman', 'santa', 'scarecrow', 'zombie', 'leprechaun']) expect(ids).toContain(id);
    expect(outfits.every((o) => o.season)).toBe(true);
  });

  it('has unique, short kebab-case ids and valid colors', () => {
    const seen = new Set<string>();
    for (const o of CATALOG) {
      const key = `${o.kind}/${o.id}`;
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
      expect(o.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(o.id.length).toBeLessThanOrEqual(32);
      if (o.colors) {
        expect(o.colors.length).toBeGreaterThanOrEqual(2);
        for (const c of o.colors) expect(c).toMatch(HEX);
      }
    }
  });

  it('has the palettes', () => {
    expect(CLOTH_COLORS.length).toBeGreaterThanOrEqual(16);
    expect(HAIR_COLORS.length).toBeGreaterThanOrEqual(12);
    expect(SKIN_TONES.length).toBeGreaterThanOrEqual(8);
    for (const c of [...CLOTH_COLORS, ...HAIR_COLORS, ...SKIN_TONES]) expect(c).toMatch(HEX);
  });

  it('defaults to today\'s parts, all in the catalog', () => {
    expect(DEFAULTS).toMatchObject({ hairStyle: 'short', face: 'smile', top: 't-shirt', bottom: 'trousers', shoes: 'sneakers' });
    for (const kind of ['hairStyle', 'face', 'top', 'bottom', 'shoes'] as const) {
      expect(byKind(kind).some((o) => o.id === DEFAULTS[kind])).toBe(true);
    }
  });
});
