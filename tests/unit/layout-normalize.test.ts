import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { currentCatalog } from '../../shared/catalog';
import { normalizeLayout, type Layout, type PlacedObject } from '../../shared/layout';
import { itemDef, part, withItems } from './fixtures/items';
import { emptyLayout, withObject } from './fixtures/layouts';

let restore: () => void;
beforeEach(() => {
  restore = withItems([
    { id: 'lamp', def: itemDef('deskitem', { name: 'Lamp' }) },
    { id: 'poster', def: itemDef('wall', { name: 'Poster' }) },
    { id: 'rug', def: itemDef('floorart', { name: 'Rug' }) },
    { id: 'writing', def: itemDef('floor', { name: 'Writing desk', group: 'desks', footprint: [2, 1], parts: [part({ w: 2, d: 1, h: 0.3 })] }) },
    { id: 'shelf', def: itemDef('floor', { name: 'Shelf', group: 'shelves' }) },
  ]);
});
afterEach(() => restore());

const norm = (l: Layout) => normalizeLayout(l, currentCatalog());
const add = (l: Layout, ...objs: PlacedObject[]) => objs.reduce((acc, o) => withObject(acc, o), l);
const lamp = (id: string, on: string, at: [number, number] = [0.25, 0.25]): PlacedObject => ({ id, kind: 'item:lamp', x: 0, y: 0, rot: 0, on, at });
const poster = (id: string, x: number, y: number, wall: 'n' | 'e' | 's' | 'w'): PlacedObject => ({ id, kind: 'item:poster', x, y, rot: 0, wall });
const desk = (id = 'desk-1', x = 4, y = 4): PlacedObject => ({ id, kind: 'desk', x, y, rot: 0 });
const ids = (l: Layout) => l.objects.map((o) => o.id);

describe('normalizeLayout', () => {
  it('removes an object whose kind is not in the catalog', () => {
    const r = norm(add(emptyLayout(), { id: 'ghost', kind: 'item:nope', x: 3, y: 3, rot: 0 }, { id: 'ok', kind: 'item:shelf', x: 5, y: 5, rot: 0 }));
    expect(ids(r.layout)).toEqual(['ok']);
    expect(r.removed).toEqual([{ id: 'ghost', why: 'unknown' }]);
  });

  it('removes a desk item whose host is missing, is not an object with a surface, or has gone', () => {
    const l = add(emptyLayout(), desk(), { id: 'shelf-1', kind: 'item:shelf', x: 8, y: 8, rot: 0 },
      lamp('on-desk', 'desk-1'), lamp('no-host', 'nope'), lamp('on-shelf', 'shelf-1'),
      { id: 'no-on', kind: 'item:lamp', x: 0, y: 0, rot: 0, at: [0, 0] });
    const r = norm(l);
    expect(ids(r.layout)).toEqual(['desk-1', 'shelf-1', 'on-desk']);
    expect(r.removed.map((x) => x.id).sort()).toEqual(['no-host', 'no-on', 'on-shelf']);
    // An item in group desks hosts desk items too.
    const writing = add(emptyLayout(), { id: 'w1', kind: 'item:writing', x: 4, y: 4, rot: 0 }, lamp('on-writing', 'w1'));
    expect(ids(norm(writing).layout)).toContain('on-writing');
  });

  it('moves a desk item that lies outside its host inside, and zeroes x and y', () => {
    const l = add(emptyLayout(), desk(), { ...lamp('l', 'desk-1', [9, 7]), x: 5, y: 5 });
    const item = norm(l).layout.objects.find((o) => o.id === 'l')!;
    // The desk is 3×1 and the lamp 0.5×0.5, so it can be at most 2.5 across and 0.5 deep.
    expect(item.at).toEqual([2.5, 0.5]);
    expect([item.x, item.y]).toEqual([0, 0]);
    const low = norm(add(emptyLayout(), desk(), lamp('l', 'desk-1', [-1, -1]))).layout.objects.find((o) => o.id === 'l')!;
    expect(low.at).toEqual([0, 0]);
  });

  it('removes wall decor with no wall tile, with a face that does not border floor, or with no face', () => {
    let l = emptyLayout(); // walls round the edge; the open floor is inside
    l = add(l, poster('good', 5, 0, 's'), poster('open-floor', 5, 5, 's'), poster('outside', 5, 0, 'n'), poster('into-wall', 5, 0, 'e'),
      { id: 'no-face', kind: 'item:poster', x: 5, y: 0, rot: 0 });
    const r = norm(l);
    expect(ids(r.layout)).toEqual(['good']);
    expect(r.removed.map((x) => x.id).sort()).toEqual(['into-wall', 'no-face', 'open-floor', 'outside']);
  });

  it('keeps at most 6 desk items on a host tile and 2 on a wall face, the earliest first', () => {
    const lamps = Array.from({ length: 8 }, (_, i) => lamp(`l${i}`, 'desk-1', [0.1, 0.25]));
    const r = norm(add(emptyLayout(), desk(), ...lamps));
    expect(ids(r.layout).filter((i) => i.startsWith('l'))).toEqual(['l0', 'l1', 'l2', 'l3', 'l4', 'l5']);
    expect(r.removed.map((x) => x.id)).toEqual(['l6', 'l7']);
    // A different tile of the same desk has room of its own.
    const other = norm(add(emptyLayout(), desk(), ...lamps.slice(0, 6), lamp('far', 'desk-1', [2.3, 0.25]))).layout;
    expect(ids(other)).toContain('far');
    const posters = norm(add(emptyLayout(), poster('a', 5, 0, 's'), poster('b', 5, 0, 's'), poster('c', 5, 0, 's'), poster('d', 6, 0, 's'))).layout;
    expect(ids(posters)).toEqual(['a', 'b', 'd']);
  });

  it('drops a pin to a version the item does not have', () => {
    const l = add(emptyLayout(), { id: 's1', kind: 'item:shelf', x: 5, y: 5, rot: 0, v: 7 }, { id: 's2', kind: 'item:shelf', x: 7, y: 5, rot: 0, v: 1 });
    const r = normalizeLayout(l, currentCatalog(), { hasVersion: (_, v) => v === 1 });
    expect(r.layout.objects.map((o) => o.v)).toEqual([undefined, 1]);
  });

  it('strips fields that do not belong to an object of that kind, changes nothing else, and is stable', () => {
    const l = add(emptyLayout(), { id: 'sh', kind: 'item:shelf', x: 5, y: 5, rot: 1, on: 'desk-1', at: [1, 1], wall: 's' }, { id: 'rg', kind: 'item:rug', x: 3, y: 3, rot: 2 });
    const a = norm(l);
    expect(a.layout.objects[0]).toEqual({ id: 'sh', kind: 'item:shelf', x: 5, y: 5, rot: 1 });
    expect(a.layout.objects[1]).toEqual({ id: 'rg', kind: 'item:rug', x: 3, y: 3, rot: 2 });
    expect(a.removed).toEqual([]);
    expect(norm(a.layout).layout).toEqual(a.layout);
    expect(l.objects[0].on).toBe('desk-1'); // the input is not changed
  });
});
