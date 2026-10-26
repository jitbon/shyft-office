import { describe, expect, it } from 'vitest';
import { PATTERNS } from '../../shared/items';
import { isStyleMat, materialFor } from '../../src/materials';
import { abgr, patternTexture } from '../../src/pattern';

const channels = (c: number) => [c & 255, (c >> 8) & 255, (c >> 16) & 255];

describe('patternTexture', () => {
  it.each(PATTERNS)('%s: 1024 opaque pixels, varied, deterministic and tileable', (pattern) => {
    const a = patternTexture(pattern, '#8a6a4a');
    const b = patternTexture(pattern, '#8a6a4a');
    expect([a.w, a.h, a.data.length]).toEqual([32, 32, 1024]);
    expect(a.data).toEqual(b.data);
    expect(a.data.every((c) => c >>> 24 === 255)).toBe(true);
    expect(new Set(a.data).size).toBeGreaterThan(pattern === 'paper' ? 1 : 2);
    // The left and right edge columns are alike on average, so repeated tiles do not show a seam.
    let diff = 0;
    for (let y = 0; y < 32; y++) {
      const l = channels(a.data[y * 32]), r = channels(a.data[y * 32 + 31]);
      diff += Math.abs(l[0] - r[0]) + Math.abs(l[1] - r[1]) + Math.abs(l[2] - r[2]);
    }
    expect(diff / 32 / 3).toBeLessThan(60);
  });

  it('follows the color it is given', () => {
    const red = patternTexture('plain', '#cc2222'), blue = patternTexture('plain', '#2222cc');
    const mean = (t: { data: Uint32Array }, ch: number) => t.data.reduce((s, c) => s + channels(c)[ch], 0) / 1024;
    expect(mean(red, 0)).toBeGreaterThan(mean(red, 2));
    expect(mean(blue, 2)).toBeGreaterThan(mean(blue, 0));
    expect(abgr('#ff8000')).toBe(((0xff << 24) | (0x00 << 16) | (0x80 << 8) | 0xff) >>> 0);
  });
});

describe('materialFor', () => {
  it('returns the same texture twice and refuses malformed names', () => {
    expect(materialFor('m:wood:aabbcc')).toBe(materialFor('m:wood:aabbcc'));
    expect(materialFor('m:wood:aabbcc')).not.toBeNull();
    for (const bad of ['m:glitter:aabbcc', 'm:wood:xyz', 'wood', 'm:wood:AABBCC', 'm:wood:aabbc']) expect(materialFor(bad), bad).toBeNull();
    expect(isStyleMat('m:wood:aabbcc')).toBe(true);
    expect(isStyleMat('desk')).toBe(false);
  });
});
