import { describe, expect, it } from 'vitest';
import { CLOTH_FAMILY, randomLook, validateLook } from '../../shared/wardrobe';

/** A small seeded generator (mulberry32). */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('randomLook', () => {
  const rng = seeded(42);
  const looks = Array.from({ length: 1000 }, () => randomLook(rng));

  it('never pairs a top and bottom of the same color or family', () => {
    for (const l of looks) {
      expect(l.bottomColor).not.toBe(l.shirt);
      expect(CLOTH_FAMILY[l.bottomColor!]).not.toBe(CLOTH_FAMILY[l.shirt]);
    }
  });

  it('never picks an outfit, and picks an accessory 20-40% of the time', () => {
    expect(looks.some((l) => l.outfit)).toBe(false);
    const share = looks.filter((l) => l.accessory).length / looks.length;
    expect(share).toBeGreaterThan(0.2);
    expect(share).toBeLessThan(0.4);
  });

  it('gives looks the server would keep as they are', () => {
    for (const l of looks) expect(validateLook(l, { shirt: '#000000', hair: '#000000', skin: '#000000' })).toStrictEqual(l);
  });

  it('gives different looks in a row', () => {
    const r = seeded(7);
    const keys = Array.from({ length: 30 }, () => JSON.stringify(randomLook(r)));
    expect(new Set(keys).size).toBe(30);
  });
});
