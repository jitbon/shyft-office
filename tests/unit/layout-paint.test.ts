import { describe, expect, it } from 'vitest';
import { defaultLayout } from '../../shared/default-layout';
import { parseLayoutWith } from '../../shared/catalog';
import { MAX_PAINTS, SWATCHES, paintChar } from '../../shared/finishes';
import { cloneLayout, compactPaints, normalizeLayout, type Layout } from '../../shared/layout';
import { builtInCatalog } from '../../shared/catalog';
import { tinyLayout, withPaint } from './paint-helpers';

const parse = (l: unknown, lenient = false) => parseLayoutWith(JSON.parse(JSON.stringify(l)), undefined, { lenient });
const errs = (l: unknown) => {
  const r = parse(l);
  return r.ok ? [] : r.errors.map((e) => e.split(':')[0]);
};
const norm = (l: Layout) => normalizeLayout(l, builtInCatalog()).layout;

describe('layout look fields', () => {
  it('reads a layout without them as before', () => {
    const l = defaultLayout();
    const r = parse(l);
    expect(r.ok && r.layout).toEqual(l);
    expect(r.ok && Object.keys(r.layout).sort()).toEqual(Object.keys(l).sort());
  });

  it('accepts a known theme and refuses an unknown one', () => {
    expect(parse({ ...tinyLayout(), theme: 'night-mode' }).ok).toBe(true);
    expect(errs({ ...tinyLayout(), theme: 'neon-dreams' })).toEqual(['bad-theme']);
  });

  it('refuses seasonal and daylight that are not true or false', () => {
    expect(parse({ ...tinyLayout(), seasonal: true, daylight: false }).ok).toBe(true);
    expect(errs({ ...tinyLayout(), seasonal: 'yes' })).toEqual(['bad-flag']);
    expect(errs({ ...tinyLayout(), daylight: 1 })).toEqual(['bad-flag']);
  });

  it('accepts a painted floor and a painted plain wall', () => {
    const hex = SWATCHES[2].hex.slice(1);
    let l = withPaint(tinyLayout(), [[2, 2], [3, 2]], `herringbone-oak:${hex}`, 'floor');
    l = withPaint(l, [[0, 0]], 'brick-red', 'wall');
    const r = parse(l);
    expect(r.ok && r.layout.paints).toEqual([`herringbone-oak:${hex}`, 'brick-red']);
  });

  it('counts at most 94 distinct paints', () => {
    const l = tinyLayout();
    const finishes = ['grass', 'sand', 'terrazzo', 'cork', 'rubber', 'felt-floor'];
    const keys = [...finishes, ...finishes.flatMap((f) => SWATCHES.map((s) => `${f}:${s.hex.slice(1)}`))];
    expect(keys.length).toBeGreaterThan(MAX_PAINTS);
    expect(errs({ ...l, paints: keys.slice(0, MAX_PAINTS + 1), floorPaint: ' '.repeat(l.w * l.h) })).toEqual(['too-many-paints']);
    expect(parse({ ...l, paints: keys.slice(0, MAX_PAINTS), floorPaint: ' '.repeat(l.w * l.h) }).ok).toBe(true);
  });

  it('refuses a bad key, a duplicate, and a finish on the wrong surface', () => {
    const l = tinyLayout();
    const blank = ' '.repeat(l.w * l.h);
    expect(errs({ ...l, paints: ['no-such-finish'], floorPaint: blank })).toEqual(['bad-paint']);
    expect(errs({ ...l, paints: ['grass', 'grass'], floorPaint: blank })).toEqual(['bad-paint']);
    expect(errs({ ...l, paints: ['grass:ABCDEF'], floorPaint: blank })).toEqual(['bad-paint']);
    expect(errs(withPaint(l, [[2, 2]], 'brick-red', 'floor'))).toEqual(['bad-paint']);
    expect(errs(withPaint(l, [[0, 0]], 'grass', 'wall'))).toEqual(['bad-paint']);
  });

  it('wants a grid with one character per tile, each naming a paint', () => {
    const l = tinyLayout();
    expect(errs({ ...l, paints: ['grass'], floorPaint: ' ' })).toEqual(['bad-paint-grid']);
    expect(errs({ ...l, paints: ['grass'], floorPaint: paintChar(1).repeat(l.w * l.h) })).toEqual(['bad-paint-grid']);
    expect(errs({ ...l, paints: ['grass'], floorPaint: 7 })).toEqual(['bad-paint-grid']);
  });

  it('checks a room style', () => {
    const l = tinyLayout();
    const room = { id: 'r', name: 'R', private: false, rects: [[1, 1, 3, 3]], restricted: false, allowed: [], highlight: false };
    expect(parse({ ...l, rooms: [{ ...room, style: { theme: 'cozy-cabin' } }] }).ok).toBe(true);
    expect(errs({ ...l, rooms: [{ ...room, style: { theme: 'nope' } }] })).toEqual(['bad-theme']);
  });

  it('reads the saved file leniently: a finish or theme that is gone does not refuse the layout', () => {
    const l = tinyLayout();
    const raw = { ...withPaint(withPaint(l, [[2, 2]], 'grass', 'floor'), [[3, 2]], 'sand', 'floor'), theme: 'gone-theme' };
    raw.paints = ['grass', 'removed-finish'];
    const r = parse(raw, true);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.layout.theme).toBe('warm-studio');
      const n = norm(r.layout);
      // The tile that used the removed finish is plain again, so it shows the theme's own floor.
      expect(n.paints).toEqual(['grass']);
      expect(n.floorPaint![2 * l.w + 3]).toBe(' ');
      expect(n.floorPaint![2 * l.w + 2]).toBe('!');
    }
  });
});

describe('normalizing paint', () => {
  it('drops paints nothing uses and renumbers the rest', () => {
    let l = withPaint(tinyLayout(), [[2, 2]], 'grass', 'floor');
    l = withPaint(l, [[3, 2]], 'sand', 'floor');
    l = withPaint(l, [[4, 2]], 'cork', 'floor');
    l.floorPaint = l.floorPaint!.split('').map((c, i) => (i === 2 * l.w + 2 ? ' ' : c)).join(''); // grass is no longer used
    const n = norm(l);
    expect(n.paints).toEqual(['sand', 'cork']);
    expect(n.floorPaint![2 * l.w + 3]).toBe('!');
    expect(n.floorPaint![2 * l.w + 4]).toBe('"');
  });

  it('clears wall paint on tiles that are not plain walls', () => {
    const base = tinyLayout();
    let l = withPaint(base, [[0, 0], [1, 1]], 'brick-red', 'wall'); // (1,1) is open floor
    const walls = l.walls.split('');
    walls[0] = 'G'; // a window, not a plain wall
    l = { ...l, walls: walls.join('') };
    const n = norm(l);
    expect(n.paints).toBeUndefined();
    expect(n.wallPaint).toBeUndefined();
  });

  it('removes the fields when nothing is painted, so the layout equals an old one', () => {
    const l = { ...tinyLayout(), paints: ['grass'], floorPaint: ' '.repeat(16 * 12) };
    const n = compactPaints(l);
    expect(n).toEqual(tinyLayout());
  });

  it('keeps clones independent', () => {
    const l = withPaint(tinyLayout(), [[2, 2]], 'grass', 'floor');
    const c = cloneLayout(l);
    c.paints!.push('sand');
    expect(l.paints).toEqual(['grass']);
  });
});
