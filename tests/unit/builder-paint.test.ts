import { describe, expect, it } from 'vitest';
import { SWATCHES } from '../../shared/finishes';
import { builtInCatalog } from '../../shared/catalog';
import { erase, paintFloor, paintFloorKey, paintWallKey, resize, TABLE_FULL, unpaint } from '../../src/builder/tools';
import { tinyLayout, withPaint } from './paint-helpers';
import type { Layout } from '../../shared/layout';

const ok = (e: { ok: boolean; layout?: Layout }) => {
  expect(e.ok).toBe(true);
  return (e as { layout: Layout }).layout;
};

describe('painting floors with finishes', () => {
  it('adds the key once and points the tiles at it', () => {
    let l = ok(paintFloorKey(tinyLayout(), [[2, 2], [3, 2]], 'grass'));
    l = ok(paintFloorKey(l, [[4, 2]], 'grass'));
    expect(l.paints).toEqual(['grass']);
    expect(l.floorPaint!.slice(2 * 16 + 2, 2 * 16 + 5)).toBe('!!!');
  });

  it('says so when the office already uses the most finishes and the key is new', () => {
    let l = tinyLayout(20, 20);
    const names = ['grass', 'sand', 'terrazzo', 'cork', 'rubber', 'felt-floor'];
    const keys = names.flatMap((n) => SWATCHES.map((s) => `${n}:${s.hex.slice(1)}`)).slice(0, 94);
    keys.forEach((k, i) => (l = ok(paintFloorKey(l, [[i % 18, 1 + Math.floor(i / 18)]], k))));
    expect(l.paints).toHaveLength(94);
    const full = paintFloorKey(l, [[1, 10]], 'cork');
    expect(full).toEqual({ ok: false, error: TABLE_FULL });
    expect(paintFloorKey(l, [[1, 10]], keys[3]).ok).toBe(true); // reusing one is fine
  });

  it('is replaced by a plain floor code, and by the eraser', () => {
    const l = ok(paintFloorKey(tinyLayout(), [[2, 2]], 'grass'));
    expect(paintFloor(l, [[2, 2]], ',').paints).toBeUndefined();
    expect(erase(l, [[2, 2]], builtInCatalog()).paints).toBeUndefined();
    expect(unpaint(l, [[2, 2]], 'floor').floorPaint).toBeUndefined();
  });
});

describe('painting walls with finishes', () => {
  it('makes a plain wall on an empty tile, repaints a plain wall, and leaves special walls alone', () => {
    let l = tinyLayout();
    l = { ...l, walls: l.walls.slice(0, 5 * 16 + 3) + 'G' + l.walls.slice(5 * 16 + 4) };
    const e = paintWallKey(l, [[6, 6], [0, 0], [3, 5]], 'brick-red');
    const out = ok(e);
    expect(out.walls[6 * 16 + 6]).toBe('#');
    expect(out.wallPaint![6 * 16 + 6]).toBe('!');
    expect(out.wallPaint![0]).toBe('!');
    expect(out.walls[5 * 16 + 3]).toBe('G');
    expect(out.wallPaint![5 * 16 + 3]).toBe(' ');
  });

  it('skips the spawn tile', () => {
    const l = tinyLayout();
    const out = ok(paintWallKey(l, [[l.spawn.x, l.spawn.y]], 'brick-red'));
    expect(out.walls[l.spawn.y * l.w + l.spawn.x]).toBe(' ');
  });
});

describe('resizing', () => {
  it('resizes the paint grids with the floor and walls, new tiles unpainted', () => {
    const l = withPaint(tinyLayout(), [[2, 2], [14, 10]], 'grass', 'floor');
    const bigger = resize(l, 20, 14).layout;
    expect(bigger.floorPaint).toHaveLength(20 * 14);
    expect(bigger.floorPaint![2 * 20 + 2]).toBe('!');
    expect(bigger.floorPaint![13 * 20 + 19]).toBe(' ');
    const smaller = resize(l, 12, 10).layout;
    expect(smaller.floorPaint).toHaveLength(12 * 10);
    expect(smaller.floorPaint![2 * 12 + 2]).toBe('!');
    // (14,10) was cut away, but (2,2) keeps the only paint in use.
    expect(smaller.paints).toEqual(['grass']);
  });
});
