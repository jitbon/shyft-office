import { describe, expect, it } from 'vitest';
import { TILE, clampZoom, defaultZoom, rescale, stepZoom, tileCssPx, zoomRange } from '../../src/scale';

describe('zoom steps (whole device pixels per art pixel)', () => {
  it('uses 32-pixel tiles', () => {
    expect(TILE).toBe(32);
  });

  it('gives the default tile 64 CSS px at dpr 1 and 48 at dpr 2', () => {
    expect(zoomRange(1)).toEqual({ min: 1, max: 3 });
    expect(defaultZoom(1)).toBe(2);
    expect(tileCssPx(defaultZoom(1), 1)).toBe(64);
    expect(zoomRange(2)).toEqual({ min: 2, max: 6 });
    expect(defaultZoom(2)).toBe(3);
    expect(tileCssPx(defaultZoom(2), 2)).toBe(48);
  });

  it('keeps the same on-screen range (32 to 96 CSS px) on both densities', () => {
    for (const dpr of [1, 2]) {
      const { min, max } = zoomRange(dpr);
      expect(tileCssPx(min, dpr)).toBe(32);
      expect(tileCssPx(max, dpr)).toBe(96);
    }
  });

  it('rounds a fractional pixel ratio first, so steps stay whole', () => {
    expect(zoomRange(1.5)).toEqual({ min: 2, max: 6 });
    expect(defaultZoom(1.5)).toBe(2);
    expect(zoomRange(1.4)).toEqual({ min: 1, max: 3 });
    expect(zoomRange(3)).toEqual({ min: 3, max: 9 });
  });

  it('treats a missing or nonsense ratio as 1', () => {
    for (const dpr of [0, -2, NaN, Infinity, 0.5]) {
      expect(zoomRange(dpr)).toEqual({ min: 1, max: 3 });
      expect(defaultZoom(dpr)).toBe(2);
    }
  });

  it('steps by one and stops at both ends', () => {
    expect(stepZoom(2, 1, 1)).toBe(3);
    expect(stepZoom(3, 1, 1)).toBe(3);
    expect(stepZoom(1, -1, 1)).toBe(1);
    expect(stepZoom(2, -1, 2)).toBe(2);
    expect(stepZoom(6, 1, 2)).toBe(6);
  });

  it('clamps and rounds any value into the range', () => {
    expect(clampZoom(0, 1)).toBe(1);
    expect(clampZoom(9, 1)).toBe(3);
    expect(clampZoom(2.6, 1)).toBe(3);
    expect(clampZoom(1, 2)).toBe(2);
    expect(clampZoom(NaN, 2)).toBe(defaultZoom(2));
  });

  it('keeps the closest tile size when the screen density changes', () => {
    // 48 CSS px at dpr 2: dpr 1 offers 32 or 64, equally close, so the larger art wins.
    expect(rescale(3, 2, 1)).toBe(2);
    // Same screen: nothing changes.
    expect(rescale(4, 2, 2)).toBe(4);
    // 64 CSS px at dpr 1 (k=2) -> dpr 2 has exactly 64 at k=4.
    expect(rescale(2, 1, 4 / 2)).toBe(4);
    expect(rescale(2, 1, 2)).toBe(4);
    // The smallest and largest stay the smallest and largest.
    expect(rescale(1, 1, 2)).toBe(2);
    expect(rescale(6, 2, 1)).toBe(3);
  });
});
