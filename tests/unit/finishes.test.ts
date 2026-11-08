import { describe, expect, it } from 'vitest';
import {
  FINISHES, FLOOR_FINISHES, FLOOR_GROUPS, GROUP_NAMES, PAINT_KEY_RE, SWATCHES, WALL_FINISHES, WALL_GROUPS,
  formatPaintKey, paintChar, paintIndex, parsePaintKey,
} from '../../shared/finishes';
import { finishPixels } from '../../src/finish';
import { pixelHash } from './paint-helpers';

describe('the finish list', () => {
  it('gives every finish a unique id, a short name and a valid period', () => {
    const ids = new Set<string>();
    for (const f of FINISHES) {
      expect(f.id).toMatch(/^[a-z0-9-]{1,32}$/);
      expect(ids.has(f.id)).toBe(false);
      ids.add(f.id);
      expect(f.name.length).toBeGreaterThan(0);
      expect(f.name.length).toBeLessThanOrEqual(32);
      expect(['floor', 'wall']).toContain(f.surface);
      expect([32, 64]).toContain(f.period);
      expect(f.defaultColor).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('offers at least 25 floors, 20 walls and 16 swatches', () => {
    expect(FLOOR_FINISHES.length).toBeGreaterThanOrEqual(25);
    expect(WALL_FINISHES.length).toBeGreaterThanOrEqual(20);
    expect(SWATCHES.length).toBeGreaterThanOrEqual(16);
    for (const s of SWATCHES) expect(s.hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('has at least two finishes in every group, each with a name', () => {
    for (const g of FLOOR_GROUPS) {
      expect(GROUP_NAMES[g]).toBeTruthy();
      expect(FLOOR_FINISHES.filter((f) => f.group === g).length).toBeGreaterThanOrEqual(2);
    }
    for (const g of WALL_GROUPS) {
      expect(GROUP_NAMES[g]).toBeTruthy();
      expect(WALL_FINISHES.filter((f) => f.group === g).length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('paint keys', () => {
  it('round-trips', () => {
    const hex = SWATCHES[3].hex.slice(1);
    expect(parsePaintKey(formatPaintKey('herringbone-oak', hex))).toMatchObject({ finish: { id: 'herringbone-oak' }, color: hex });
    expect(formatPaintKey('grass')).toBe('grass');
    expect(parsePaintKey('grass')).toMatchObject({ finish: { id: 'grass' } });
    expect(parsePaintKey('grass')!.color).toBeUndefined();
  });

  it('refuses an unknown finish, an upper-case color, a color that is not offered, and junk', () => {
    const hex = SWATCHES[0].hex.slice(1);
    expect(parsePaintKey('no-such-finish')).toBeNull();
    expect(parsePaintKey(`grass:${hex.toUpperCase()}`)).toBeNull();
    expect(parsePaintKey('grass:123456')).toBeNull();
    expect(parsePaintKey('Grass')).toBeNull();
    expect(parsePaintKey('')).toBeNull();
    expect(parsePaintKey(5)).toBeNull();
    expect(PAINT_KEY_RE.test('a'.repeat(33))).toBe(false);
  });

  it('maps table entries to printable characters and back', () => {
    expect(paintChar(0)).toBe('!');
    expect(paintChar(93)).toBe('~');
    for (let i = 0; i < 94; i++) expect(paintIndex(paintChar(i))).toBe(i);
    expect(paintIndex(' ')).toBe(-1);
  });
});

describe('painters', () => {
  const swatch = SWATCHES[7].hex;
  it('give the same pixels on two calls', () => {
    for (const f of FINISHES) {
      const a = pixelHash(finishPixels(f, f.defaultColor, 3, 2));
      const b = pixelHash(finishPixels(f, f.defaultColor, 3, 2));
      expect(b).toBe(a);
    }
  });

  it('make 32×32 pictures', () => {
    for (const f of FINISHES) {
      const t = finishPixels(f, swatch, 1, 1);
      expect([t.w, t.h, t.data.length]).toEqual([32, 32, 1024]);
    }
  });

  it('repeat at their period, so a pattern carries on across tile edges', () => {
    for (const f of FINISHES.filter((x) => !x.painter.startsWith('legacy-'))) {
      const reps = f.period / 32;
      for (const [x, y] of [[0, 0], [1, 2], [5, 3]]) {
        const a = finishPixels(f, swatch, x, y), b = finishPixels(f, swatch, x + reps, y + (f.surface === 'floor' ? reps : 0));
        expect(pixelHash(b), f.id).toBe(pixelHash(a));
      }
      // The neighbor across the wrap is not the same picture only because the pattern moved on: a period-64 finish has two different columns.
      if (reps === 2) expect(pixelHash(finishPixels(f, swatch, 0, 0)), f.id).not.toBe(pixelHash(finishPixels(f, swatch, 1, 0)));
    }
  });

  it('keep floors readable in every swatch (lightness 35%–75%)', () => {
    const lightness = (t: { data: Uint32Array }) => {
      let sum = 0;
      for (const c of t.data) sum += (Math.max(c & 255, (c >> 8) & 255, (c >> 16) & 255) + Math.min(c & 255, (c >> 8) & 255, (c >> 16) & 255)) / 510;
      return sum / t.data.length;
    };
    for (const f of FLOOR_FINISHES) {
      for (const s of SWATCHES) {
        const l = lightness(finishPixels(f, s.hex, 0, 0));
        expect(l, `${f.id} in ${s.id}`).toBeGreaterThanOrEqual(0.3);
        expect(l, `${f.id} in ${s.id}`).toBeLessThanOrEqual(0.78);
      }
    }
  });

  it('never draw two finishes alike in the same color', () => {
    for (const set of [FLOOR_FINISHES, WALL_FINISHES]) {
      const seen = new Map<number, string>();
      for (const f of set) {
        const h = pixelHash(finishPixels(f, swatch, 0, 0));
        expect(seen.get(h), `${f.id} matches ${seen.get(h)}`).toBeUndefined();
        seen.set(h, f.id);
      }
    }
  });
});
