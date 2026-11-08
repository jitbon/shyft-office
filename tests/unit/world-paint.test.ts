import { describe, expect, it } from 'vitest';
import { builtInCatalog } from '../../shared/catalog';
import { SWATCHES } from '../../shared/finishes';
import { themeById } from '../../shared/themes';
import { compileWorld } from '../../shared/world';
import type { Layout } from '../../shared/layout';
import { withRoom } from './fixtures/layouts';
import { tinyLayout, withPaint } from './paint-helpers';

const world = (l: Layout) => compileWorld(l, builtInCatalog());
const idOf = (p: { finish: { id: string } }) => p.finish.id;

describe('paintAt and styleAt', () => {
  it('give the office theme everywhere in a layout with no look fields', () => {
    const w = world(tinyLayout());
    expect(w.theme).toBe('warm-studio');
    expect(w.styleAt(3, 3)).toBe('warm-studio');
    expect(idOf(w.paintAt(3, 3, 'floor'))).toBe('wood-plank-classic');
    expect(idOf(w.paintAt(0, 0, 'wall'))).toBe('plaster-wall');
  });

  it('draws the legacy floor codes as the theme says', () => {
    const l = { ...tinyLayout(), theme: 'garden-atrium' };
    l.floor = l.floor.slice(0, 3 * 16 + 3) + ',' + l.floor.slice(3 * 16 + 4);
    const w = world(l);
    expect(idOf(w.paintAt(2, 3, 'floor'))).toBe('tile-square');
    expect(idOf(w.paintAt(3, 3, 'floor'))).toBe('grass');
  });

  it('puts an explicit paint above the room style and the office theme', () => {
    let l: Layout = { ...tinyLayout(), theme: 'night-mode' };
    l = withRoom(l, { id: 'r', rects: [[2, 2, 6, 6]], style: { theme: 'cozy-cabin' } });
    l = withPaint(l, [[3, 3]], 'sand', 'floor');
    const w = world(l);
    expect(idOf(w.paintAt(3, 3, 'floor'))).toBe('sand');
    expect(idOf(w.paintAt(4, 3, 'floor'))).toBe('planks-wide'); // the room's theme
    expect(idOf(w.paintAt(9, 9, 'floor'))).toBe('planks-narrow'); // the office theme
    expect(w.styleAt(4, 3)).toBe('cozy-cabin');
    expect(w.styleAt(9, 9)).toBe('night-mode');
  });

  it('gives a wall face the style of the floor tile it faces', () => {
    let l = withRoom(tinyLayout(), { id: 'r', rects: [[1, 1, 6, 4]], style: { theme: 'industrial-loft' } });
    l = { ...l, walls: l.walls.slice(0, 5 * 16 + 3) + '#' + l.walls.slice(5 * 16 + 4) };
    const w = world(l);
    // The wall at (3,5) faces the room above it to the north, and the open floor below it to the south.
    expect(idOf(w.wallFacePaint(3, 5, 'n'))).toBe('brick-red');
    expect(idOf(w.wallFacePaint(3, 5, 's'))).toBe('plaster-wall');
    expect(idOf(w.paintAt(3, 5, 'wall'))).toBe('plaster-wall');
  });

  it('lets a theme-color paint follow the theme that applies, and a fixed color stay', () => {
    const fixed = SWATCHES[8].hex.slice(1);
    let l = withRoom(tinyLayout(), { id: 'r', rects: [[1, 1, 6, 4]], style: { theme: 'cozy-cabin' } });
    l = withPaint(l, [[2, 2], [9, 9]], 'planks-wide', 'floor');
    l = withPaint(l, [[3, 2], [10, 9]], `planks-wide:${fixed}`, 'floor');
    const w = world(l);
    expect(w.paintAt(2, 2, 'floor').color).toBe(themeById('cozy-cabin').colors.wood);
    expect(w.paintAt(9, 9, 'floor').color).toBe('#cfa56f'); // the finish's own color: Warm Studio names none for wood
    expect(w.paintAt(3, 2, 'floor').color).toBe(`#${fixed}`);
    expect(w.paintAt(10, 9, 'floor').color).toBe(`#${fixed}`);
  });

  it('applies wall paint only to plain walls, and never changes collision', () => {
    const base = tinyLayout();
    const painted = withPaint(withPaint(base, [[0, 0]], 'brick-red', 'wall'), [[3, 3]], 'grass', 'floor');
    const a = world(base), b = world(painted);
    expect(idOf(b.wallFacePaint(0, 0, 'e'))).toBe('brick-red'); // a plain wall's paint shows on every face
    expect(idOf(b.wallFacePaint(0, 0, 's'))).toBe('brick-red');
    // Special walls keep their own art: a paint on a window tile is ignored.
    const window = withPaint({ ...base, walls: base.walls.slice(0, 5) + 'G' + base.walls.slice(6) }, [[5, 0]], 'brick-red', 'wall');
    expect(idOf(world(window).wallFacePaint(5, 0, 's'))).toBe('plaster-wall');
    expect(b.block).toEqual(a.block);
    expect(b.grid).toEqual(a.grid);
    expect(b.desks).toEqual(a.desks);
    expect(b.spawn).toEqual(a.spawn);
  });
});

describe('room styles', () => {
  const styled = () => {
    const l = withRoom(tinyLayout(), { id: 'r', private: true, capacity: 4, restricted: true, allowed: ['m1'], rects: [[2, 2, 6, 6]], style: { theme: 'industrial-loft' } });
    // A wall along the room's top edge, one tile above it: its south face looks into the room, its north face looks outside.
    const i = 1 * 16 + 4;
    return { ...l, walls: l.walls.slice(0, i) + '#' + l.walls.slice(i + 1) };
  };

  it('gives the room’s floor and ceiling its theme, and the office theme everywhere else', () => {
    const w = world(styled());
    expect(w.styleAt(4, 4)).toBe('industrial-loft');
    expect(idOf(w.paintAt(4, 4, 'floor'))).toBe('concrete-polished');
    expect(w.styleAt(10, 8)).toBe('warm-studio');
  });

  it('shows a wall between the room and the office in the room’s style inside and the office’s outside', () => {
    const w = world(styled());
    expect(idOf(w.wallFacePaint(4, 1, 's'))).toBe('brick-red'); // looks into the room: (4,2)
    expect(idOf(w.wallFacePaint(4, 1, 'n'))).toBe('plaster-wall'); // looks out at (4,0)... a wall tile, so the office theme
  });

  it('keeps an explicit paint above the room style, and goes back to the office theme when the style is cleared', () => {
    const w = world(withPaint(styled(), [[4, 4]], 'sand', 'floor'));
    expect(idOf(w.paintAt(4, 4, 'floor'))).toBe('sand');
    const cleared = styled();
    delete cleared.rooms[0].style;
    expect(world(cleared).styleAt(4, 4)).toBe('warm-studio');
  });

  it('changes nothing but the look when a style is set or cleared (the builder tool)', async () => {
    const { updateRoom } = await import('../../src/builder/tools');
    const before = withRoom(tinyLayout(), { id: 'r', private: true, capacity: 4, restricted: true, allowed: ['m1'], jam: true, rects: [[2, 2, 6, 6]] });
    const set = updateRoom(before, 'r', { style: 'cozy-cabin' });
    expect(set.ok && set.layout.rooms[0]).toMatchObject({ private: true, capacity: 4, restricted: true, allowed: ['m1'], jam: true, style: { theme: 'cozy-cabin' } });
    const cleared = set.ok ? updateRoom(set.layout, 'r', { style: null }) : set;
    expect(cleared.ok && cleared.layout.rooms[0].style).toBeUndefined();
    expect(updateRoom(before, 'r', { style: 'nope' }).ok).toBe(false);
  });
});
