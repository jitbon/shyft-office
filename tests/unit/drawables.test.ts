import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { currentCatalog } from '../../shared/catalog';
import { normalizeLayout } from '../../shared/layout';
import { compileWorld } from '../../shared/world';
import { drawablesOf, tileSignatures } from '../../src/drawables';
import { itemDef, withItems } from './fixtures/items';
import { emptyLayout, withObject } from './fixtures/layouts';

let restore: () => void;
beforeEach(() => {
  restore = withItems([
    { id: 'shelf', def: itemDef('floor', { name: 'Shelf' }) },
    { id: 'lamp', def: itemDef('deskitem') },
    { id: 'poster', def: itemDef('wall') },
    { id: 'rug', def: itemDef('floorart') },
  ]);
});
afterEach(() => restore());

const world = (...objs: Parameters<typeof withObject>[1][]) =>
  compileWorld(normalizeLayout(objs.reduce((l, o) => withObject(l, o), emptyLayout()), currentCatalog()).layout, currentCatalog());

describe('drawablesOf', () => {
  it('lists only what is drawn from pictures, never built-in furniture', () => {
    const w = world({ id: 'd', kind: 'desk', x: 4, y: 4, rot: 0 }, { id: 's', kind: 'item:shelf', x: 8, y: 8, rot: 0 });
    expect(drawablesOf(w).map((d) => d.id)).toEqual(['s']);
  });

  it('puts a desk item after its desk, and sorts things further back first', () => {
    const w = world(
      { id: 'front', kind: 'item:shelf', x: 8, y: 8, rot: 0 }, { id: 'back', kind: 'item:shelf', x: 8, y: 3, rot: 0 },
      { id: 'd', kind: 'item:shelf', x: 2, y: 2, rot: 0 }, { id: 'l', kind: 'item:lamp', x: 0, y: 0, rot: 0, on: 'd', at: [0, 0] },
    );
    const ids = drawablesOf(w).map((d) => d.id);
    expect(ids.indexOf('back')).toBeLessThan(ids.indexOf('front'));
    expect(ids.filter((i) => i === 'l')).toHaveLength(0); // 'd' is a shelf, not a desk, so the lamp has no host
    const desks = world({ id: 'd', kind: 'desk', x: 4, y: 4, rot: 0 }, { id: 'l', kind: 'item:lamp', x: 0, y: 0, rot: 0, on: 'd', at: [1, 0.25] });
    expect(drawablesOf(desks).map((d) => d.id)).toEqual(['l']);
    expect(drawablesOf(desks)[0]).toMatchObject({ kind: 'deskitem', base: 0.31 });
  });

  it('puts floor art first, and gives wall decor the wall tile and its neighbours', () => {
    const w = world({ id: 's', kind: 'item:shelf', x: 8, y: 8, rot: 0 }, { id: 'r', kind: 'item:rug', x: 3, y: 3, rot: 0 }, { id: 'p', kind: 'item:poster', x: 5, y: 0, rot: 0, wall: 's' });
    const list = drawablesOf(w);
    expect(list[0].id).toBe('r');
    const poster = list.find((d) => d.id === 'p')!;
    expect(poster).toMatchObject({ kind: 'wall', face: 's', x0: 4, x1: 6, base: 0.35 });
  });
});

describe('tileSignatures', () => {
  it('changes for the tiles an item touches when it moves, and for no others', () => {
    const a = tileSignatures(world({ id: 's', kind: 'item:shelf', x: 4, y: 4, rot: 0 }));
    const b = tileSignatures(world({ id: 's', kind: 'item:shelf', x: 9, y: 4, rot: 0 }));
    const w = 16;
    expect(a[4 * w + 4]).not.toBe(b[4 * w + 4]);
    expect(a[4 * w + 9]).not.toBe(b[4 * w + 9]);
    expect(a[8 * w + 12]).toBe(b[8 * w + 12]); // far from both
  });

  it('changes when an item is turned or replaced on the spot', () => {
    const base = tileSignatures(world({ id: 's', kind: 'item:shelf', x: 4, y: 4, rot: 0 }));
    expect(tileSignatures(world({ id: 's', kind: 'item:shelf', x: 4, y: 4, rot: 2 }))[4 * 16 + 4]).not.toBe(base[4 * 16 + 4]);
    expect(tileSignatures(world({ id: 's', kind: 'item:lamp', x: 4, y: 4, rot: 0 }))[4 * 16 + 4]).toBe(''); // a lamp with no desk is not drawn
  });
});
