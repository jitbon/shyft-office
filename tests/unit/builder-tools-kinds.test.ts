import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  deleteObject, erase, hitTest, moveDeskItem, moveObject, moveWallDecor, placeDeskItem, placeObject, placeWallDecor, rotateObject, wallFaceAt, whyNotFit,
} from '../../src/builder/tools';
import { itemDef, part, withItems } from './fixtures/items';
import { emptyLayout, withObject } from './fixtures/layouts';
import type { Layout } from '../../shared/layout';

const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  expect(r.ok, JSON.stringify(r)).toBe(true);
  return r as never;
};
const err = (r: { ok: boolean; error?: string }) => (r.ok ? 'ok' : r.error);
const get = (l: Layout, id: string) => l.objects.find((o) => o.id === id)!;

let restore: () => void;
beforeEach(() => {
  restore = withItems([
    { id: 'lamp', def: itemDef('deskitem', { name: 'Lamp', footprint: [0.5, 0.5], parts: [part({ w: 0.25, d: 0.25, x: 0.125, y: 0.125, h: 0.3 })] }) },
    { id: 'poster', def: itemDef('wall', { name: 'Poster', footprint: [0.5, 0.25], parts: [part({ w: 0.5, d: 0.05, h: 0.4 })] }) },
    { id: 'rug', def: itemDef('floorart', { name: 'Rug', footprint: [2, 2], parts: [part({ w: 2, d: 2, h: 0.05, pattern: 'fabric' })] }) },
    { id: 'rug2', def: itemDef('floorart', { name: 'Rug 2', footprint: [2, 2], parts: [part({ w: 2, d: 2, h: 0.05, pattern: 'fabric' })] }) },
    { id: 'bigdesk', def: itemDef('floor', { name: 'Big desk', group: 'desks', footprint: [2, 1], parts: [part({ w: 2, d: 1, h: 0.4 })] }) },
    { id: 'shelf', def: itemDef('floor', { name: 'Shelf', group: 'shelves', footprint: [1, 1], parts: [part({ w: 1, d: 1, h: 0.9 })] }) },
  ]);
});
afterEach(() => restore());

const withDesk = () => withObject(emptyLayout(), { id: 'd', kind: 'desk', x: 4, y: 4, rot: 0 });

describe('desk items', () => {
  it('stands on a desk, snapped to 0.05 and inside it', () => {
    const r = ok(placeDeskItem(withDesk(), 'item:lamp', 4.5, 4.5, 0));
    expect(get(r.layout, r.id!)).toMatchObject({ kind: 'item:lamp', on: 'd', x: 0, y: 0, rot: 0 });
    const at = get(r.layout, r.id!).at!;
    expect(at[0]).toBeCloseTo(0.25, 5);
    expect(at[1]).toBeCloseTo(0.25, 5);
    const edge = ok(placeDeskItem(withDesk(), 'item:lamp', 6.99, 4.99, 0));
    expect(get(edge.layout, edge.id!).at).toEqual([2.5, 0.5]); // kept inside 3×1
  });

  it('refuses away from a desk, and on the seventh in a tile', () => {
    expect(err(placeDeskItem(withDesk(), 'item:lamp', 9.5, 9.5, 0))).toBe('Desk items go on a desk.');
    let l = withDesk();
    for (let i = 0; i < 6; i++) l = ok(placeDeskItem(l, 'item:lamp', 4.5, 4.5, 0)).layout;
    expect(err(placeDeskItem(l, 'item:lamp', 4.5, 4.5, 0))).toBe('That desk tile is full.');
    expect(ok(placeDeskItem(l, 'item:lamp', 5.5, 4.5, 0)).layout.objects).toHaveLength(8);
  });

  it('goes on a ready-made desk (group desks) but not on a shelf', () => {
    expect(placeDeskItem(withObject(emptyLayout(), { id: 'b', kind: 'item:bigdesk', x: 4, y: 4, rot: 0 }), 'item:lamp', 4.5, 4.5, 0).ok).toBe(true);
    expect(err(placeDeskItem(withObject(emptyLayout(), { id: 's', kind: 'item:shelf', x: 4, y: 4, rot: 0 }), 'item:lamp', 4.5, 4.5, 0))).toBe('Desk items go on a desk.');
  });

  it('is refused by the plain place function, which is for floor things', () => {
    expect(err(placeObject(withDesk(), 'item:lamp', 8, 8, 0))).toBe('Desk items go on a desk.');
    expect(whyNotFit(withDesk(), 'item:poster', 8, 8, 0)).toBe('Hang this on a wall.');
  });

  it('moves with its desk, and turns on the desk', () => {
    const placed = ok(placeDeskItem(withDesk(), 'item:lamp', 4.5, 4.5, 0));
    const moved = ok(moveObject(placed.layout, "d", 10, 8));
    expect(get(moved.layout, placed.id!)).toMatchObject({ on: 'd', at: get(placed.layout, placed.id!).at });
    const turned = ok(rotateObject(placed.layout, placed.id!));
    expect(get(turned.layout, placed.id!).rot).toBe(1);
    expect(get(turned.layout, placed.id!).on).toBe('d');
  });

  it('moves to another desk', () => {
    let l = withObject(withDesk(), { id: 'd2', kind: 'desk', x: 4, y: 8, rot: 0 });
    const p = ok(placeDeskItem(l, 'item:lamp', 4.5, 4.5, 0));
    const m = ok(moveDeskItem(p.layout, p.id!, 5.5, 8.5));
    expect(get(m.layout, p.id!).on).toBe('d2');
  });

  it('is removed with its desk', () => {
    const p = ok(placeDeskItem(withDesk(), 'item:lamp', 4.5, 4.5, 0));
    expect(deleteObject(p.layout, 'd').objects).toEqual([]);
  });
});

describe('wall decor', () => {
  it('hangs on a face that borders floor, at most two to a face', () => {
    const l = emptyLayout();
    expect(wallFaceAt(l, 5, 0, 0.5, 0.9)).toBe('s');
    let cur = l;
    cur = ok(placeWallDecor(cur, 'item:poster', 5, 0, 's')).layout;
    cur = ok(placeWallDecor(cur, 'item:poster', 5, 0, 's')).layout;
    expect(err(placeWallDecor(cur, 'item:poster', 5, 0, 's'))).toBe('That wall is full.');
  });

  it('refuses where there is no wall or the face is buried', () => {
    expect(err(placeWallDecor(emptyLayout(), 'item:poster', 6, 6, 's'))).toBe('Hang this on a wall.');
    expect(err(placeWallDecor(emptyLayout(), 'item:poster', 5, 0, null))).toBe('Hang this on a wall.');
    expect(err(placeWallDecor(emptyLayout(), 'item:poster', 5, 0, 'n'))).toBe('Hang this on a wall.'); // north of the top wall is outside
  });

  it('moves to another face and goes when its wall is painted away', () => {
    const p = ok(placeWallDecor(emptyLayout(), 'item:poster', 5, 0, 's'));
    expect(get(ok(moveWallDecor(p.layout, p.id!, 8, 0, 's')).layout, p.id!)).toMatchObject({ x: 8, y: 0, wall: 's' });
    expect(erase(p.layout, [[5, 0]]).objects).toEqual([]);
  });
});

describe('floor art', () => {
  it('overlaps freely, the later one last', () => {
    let l = ok(placeObject(emptyLayout(), 'item:rug', 5, 5, 0)).layout;
    l = ok(placeObject(l, 'item:rug2', 6, 6, 0)).layout;
    expect(l.objects.map((o) => o.kind)).toEqual(['item:rug', 'item:rug2']);
  });

  it('lets a chair and a desk item stand on it', () => {
    const l = ok(placeObject(emptyLayout(), 'item:rug', 5, 5, 0)).layout;
    expect(placeObject(l, 'chair', 5, 5, 0).ok).toBe(true);
  });

  it('is erased after the chair on the same tile', () => {
    let l = ok(placeObject(emptyLayout(), 'item:rug', 5, 5, 0)).layout;
    l = ok(placeObject(l, 'chair', 5, 5, 0)).layout;
    const first = erase(l, [[5, 5]]);
    expect(first.objects.map((o) => o.kind)).toEqual(['item:rug']);
    expect(erase(first, [[5, 5]]).objects).toEqual([]);
  });

  it('is picked last by a click', () => {
    const l = ok(placeObject(emptyLayout(), 'item:rug', 5, 5, 0)).layout;
    expect(hitTest(l, 5.5, 5.5)?.kind).toBe('item:rug');
    expect(hitTest(ok(placeObject(l, 'chair', 5, 5, 0)).layout, 5.5, 5.5)?.kind).toBe('chair');
  });
});
