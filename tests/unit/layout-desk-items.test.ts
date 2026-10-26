import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { currentCatalog } from '../../shared/catalog';
import { normalizeLayout, type Layout, type PlacedObject } from '../../shared/layout';
import { compileWorld } from '../../shared/world';
import { itemDef, part, withItems } from './fixtures/items';
import { emptyLayout, smallOffice, withObject } from './fixtures/layouts';

let restore: () => void;
beforeEach(() => {
  restore = withItems([{ id: 'lamp', def: itemDef('deskitem', { name: 'Lamp', footprint: [0.5, 0.25], parts: [part({ w: 0.5, d: 0.25, h: 0.2 })] }) }]);
});
afterEach(() => restore());

const world = (l: Layout) => compileWorld(normalizeLayout(l, currentCatalog()).layout, currentCatalog());
const desk = (rot: 0 | 1 | 2 | 3, x = 4, y = 4): PlacedObject => ({ id: 'd', kind: 'desk', x, y, rot });
const lamp = (at: [number, number], rot: 0 | 1 | 2 | 3 = 0): PlacedObject => ({ id: 'lamp-1', kind: 'item:lamp', x: 0, y: 0, rot, on: 'd', at });
const on = (rot: 0 | 1 | 2 | 3, at: [number, number] = [0.5, 0.25], lampRot: 0 | 1 | 2 | 3 = 0, x = 4, y = 4) =>
  world(withObject(withObject(emptyLayout(), desk(rot, x, y)), lamp(at, lampRot))).deskItems[0];

describe('desk items in the world', () => {
  it('stands the item at the host origin plus where it was put, for every turn of a 3×1 desk', () => {
    // The lamp is 0.5×0.25 and is put at (0.5, 0.25) on a desk 3 wide and 1 deep whose corner is (4, 4): centre (0.75, 0.375).
    expect(on(0)).toMatchObject({ x: 4.5, y: 4.25, rot: 0, w: 0.5, d: 0.25, z: 0.31 });
    // Turned a quarter the desk is 1 wide and 3 deep at (4, 4); the centre (0.75, 0.375) turns to (1 - 0.375, 0.75).
    const q = on(1);
    expect(q.x + q.w / 2).toBeCloseTo(4.625, 5);
    expect(q.y + q.d / 2).toBeCloseTo(4.75, 5);
    expect(q.rot).toBe(1);
    expect([q.w, q.d]).toEqual([0.25, 0.5]); // the lamp turns with the desk
    const h = on(2);
    expect(h.x + h.w / 2).toBeCloseTo(4 + 3 - 0.75, 5);
    expect(h.y + h.d / 2).toBeCloseTo(4 + 1 - 0.375, 5);
    const t = on(3);
    expect(t.x + t.w / 2).toBeCloseTo(4 + 0.375, 5);
    expect(t.y + t.d / 2).toBeCloseTo(4 + 3 - 0.75, 5);
    expect(t.rot).toBe(3);
  });

  it('adds the item’s own turn to the host’s', () => {
    expect(on(1, [0.5, 0.25], 1).rot).toBe(2);
    expect(on(3, [0.5, 0.25], 2).rot).toBe(1);
    expect(on(0, [0.5, 0.25], 3).rot).toBe(3);
  });

  it('moves with the host when the host moves, with no change to the item', () => {
    const a = on(0, [1, 0.25], 0, 4, 4), b = on(0, [1, 0.25], 0, 9, 6);
    expect(b.x - a.x).toBeCloseTo(5, 5);
    expect(b.y - a.y).toBeCloseTo(2, 5);
  });

  it('goes when the host is deleted', () => {
    const l = withObject(withObject(emptyLayout(), desk(0)), lamp([0.5, 0.25]));
    const without: Layout = { ...l, objects: l.objects.filter((o) => o.id !== 'd') };
    const r = normalizeLayout(without, currentCatalog());
    expect(r.layout.objects).toEqual([]);
    expect(r.removed).toEqual([{ id: 'lamp-1', why: 'no-host' }]);
  });

  it('never takes a tile: not in the grid, not blocking, not in a desk’s tiles, and desks come out the same', () => {
    const base = smallOffice();
    const plain = compileWorld(base, currentCatalog());
    const withItemsOn = world(withObject(base, { id: 'lamp-1', kind: 'item:lamp', x: 0, y: 0, rot: 0, on: 'desk-a', at: [1, 0.25] }));
    expect(withItemsOn.grid).toEqual(plain.grid);
    expect(Array.from(withItemsOn.block)).toEqual(Array.from(plain.block));
    expect(withItemsOn.desks).toEqual(plain.desks);
    expect(withItemsOn.objects.map((o) => o.obj.id)).toEqual(plain.objects.map((o) => o.obj.id)); // only floor objects
    expect(withItemsOn.deskItems).toHaveLength(1);
  });
});
