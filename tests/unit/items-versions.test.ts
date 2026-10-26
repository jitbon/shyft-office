import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { catalogFromDefinition, currentCatalog, itemAt } from '../../shared/catalog';
import { pinMisfits } from '../../shared/items-edit';
import { itemDef, part, withItems } from './fixtures/items';
import { emptyLayout, withObject, withWall } from './fixtures/layouts';
import type { ItemDefinition } from '../../shared/items';

const make = (def: ItemDefinition, version: number) => catalogFromDefinition(def, { id: 'item:shelf', by: 'T', version });
const shelf1 = itemDef('floor', { name: 'Shelf', group: 'shelves', footprint: [1, 1], parts: [part({ w: 1, d: 1, h: 0.9 })] });
const shelf2 = itemDef('floor', { name: 'Shelf', group: 'shelves', footprint: [2, 1], parts: [part({ w: 2, d: 1, h: 0.9 })] });
const others = (kind: string, v?: number) => itemAt(kind, v, currentCatalog());

let restore: () => void;
beforeEach(() => { restore = withItems([{ id: 'shelf', def: shelf2, version: 2 }]); });
afterEach(() => restore());

const three = () => {
  let l = emptyLayout();
  l = withObject(l, { id: 'a', kind: 'item:shelf', x: 3, y: 3, rot: 0 }); // room to grow
  l = withObject(l, { id: 'b', kind: 'item:shelf', x: 6, y: 6, rot: 0 }); // room to grow
  l = withWall(l, 11, 8, '#');
  l = withObject(l, { id: 'c', kind: 'item:shelf', x: 10, y: 8, rot: 0 }); // the wall is right beside it
  return l;
};

describe('pinMisfits', () => {
  it('pins only the copies that cannot take a wider footprint, to the old version', () => {
    const r = pinMisfits(three(), 'item:shelf', make(shelf1, 1), make(shelf2, 2), others);
    expect(r.pinned).toBe(1);
    expect(r.layout.objects.find((o) => o.id === 'c')?.v).toBe(1);
    expect(r.layout.objects.find((o) => o.id === 'a')?.v).toBeUndefined();
    expect(r.layout.objects.find((o) => o.id === 'b')?.v).toBeUndefined();
  });

  it('pins nothing when footprint and kind are unchanged', () => {
    const recolored = { ...shelf1, parts: [part({ w: 1, d: 1, h: 0.5, color: '#ff0000' })] };
    const l = three();
    const r = pinMisfits(l, 'item:shelf', make(shelf1, 1), make(recolored, 2), others);
    expect(r.pinned).toBe(0);
    expect(r.layout).toBe(l);
  });

  it('pins twice no more than once', () => {
    const once = pinMisfits(three(), 'item:shelf', make(shelf1, 1), make(shelf2, 2), others);
    const twice = pinMisfits(once.layout, 'item:shelf', make(shelf1, 1), make(shelf2, 2), others);
    expect(twice.pinned).toBe(0);
  });

  it('pins copies that would overlap their neighbours', () => {
    let l = withObject(emptyLayout(), { id: 'a', kind: 'item:shelf', x: 3, y: 3, rot: 0 });
    l = withObject(l, { id: 'n', kind: 'chair', x: 4, y: 3, rot: 0 });
    const r = pinMisfits(l, 'item:shelf', make(shelf1, 1), make(shelf2, 2), others);
    expect(r.pinned).toBe(1);
  });

  it('pins every copy when the kind changes', () => {
    const wallDef = itemDef('wall', { name: 'Shelf' });
    const r = pinMisfits(three(), 'item:shelf', make(shelf1, 1), make(wallDef, 2), others);
    expect(r.pinned).toBe(3);
  });

  it('pins a desk item that no longer fits on its desk', () => {
    const lamp1 = itemDef('deskitem', { name: 'Lamp', footprint: [0.5, 0.5], parts: [part({ w: 0.25, d: 0.25, h: 0.2 })] });
    const lamp2 = itemDef('deskitem', { name: 'Lamp', footprint: [1, 1], parts: [part({ w: 1, d: 1, h: 0.2 })] });
    let l = withObject(emptyLayout(), { id: 'd', kind: 'desk', x: 4, y: 4, rot: 0 });
    l = withObject(l, { id: 'l1', kind: 'item:lamp', x: 0, y: 0, rot: 0, on: 'd', at: [0.5, 0] });
    l = withObject(l, { id: 'l2', kind: 'item:lamp', x: 0, y: 0, rot: 0, on: 'd', at: [2, 0] });
    const mk = (d: ItemDefinition, v: number) => catalogFromDefinition(d, { id: 'item:lamp', by: 'T', version: v });
    restore();
    restore = withItems([{ id: 'lamp', def: lamp2, version: 2 }]);
    const r = pinMisfits(l, 'item:lamp', mk(lamp1, 1), mk(lamp2, 2), others);
    expect(r.pinned).toBe(0); // 3×1 desk: a 1×1 lamp at x 0.5 and at x 2 both fit inside it
    const l3 = withObject(l, { id: 'l3', kind: 'item:lamp', x: 0, y: 0, rot: 0, on: 'd', at: [2.5, 0.5] });
    expect(pinMisfits(l3, 'item:lamp', mk(lamp1, 1), mk(lamp2, 2), others).layout.objects.find((o) => o.id === 'l3')?.v).toBe(1);
  });
});

describe('pinMisfits when a desk stops being a desk', () => {
  it('pins a copy that has desk items on it, and only that one', () => {
    const desk1 = itemDef('floor', { name: 'Shelf', group: 'desks', footprint: [1, 1], parts: [part({ w: 1, d: 1, h: 0.4 })] });
    const desk2 = { ...desk1, group: 'shelves' as const };
    let l = withObject(emptyLayout(), { id: 'a', kind: 'item:shelf', x: 3, y: 3, rot: 0 });
    l = withObject(l, { id: 'b', kind: 'item:shelf', x: 6, y: 6, rot: 0 });
    l = withObject(l, { id: 'lamp', kind: 'item:lamp', x: 0, y: 0, rot: 0, on: 'a', at: [0.2, 0.2] });
    const r = pinMisfits(l, 'item:shelf', make(desk1, 1), make(desk2, 2), others);
    expect(r.pinned).toBe(1);
    expect(r.layout.objects.find((o) => o.id === 'a')?.v).toBe(1);
    expect(r.layout.objects.find((o) => o.id === 'b')?.v).toBeUndefined();
  });
});
