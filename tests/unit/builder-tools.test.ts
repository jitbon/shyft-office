import { describe, expect, it } from 'vitest';
import {
  deleteObject, erase, moveObject, newRegion, objectAt, paintFloor, paintRegion, paintWall, placeObject, placePrefab, rectsFromTiles, resize,
  rotateObject, setSpawn, unpaintRegion, updatePod, updateRoom, whyNotFit, type Edit,
} from '../../src/builder/tools';
import { builtInCatalog } from '../../shared/catalog';
import { checkLayout } from '../../shared/layout-check';
import { compileWorld } from '../../shared/world';
import { emptyLayout, smallOffice, withObject, withWall } from './fixtures/layouts';
import type { Layout } from '../../shared/layout';

const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  expect(r.ok, JSON.stringify(r)).toBe(true);
  return r as never;
};
const objectOf = (l: Layout, id: string) => l.objects.find((o) => o.id === id)!;

describe('painting', () => {
  it('paints floor and walls on the tiles asked, ignoring tiles outside, without touching the original', () => {
    const before = emptyLayout();
    const after = paintFloor(before, [[2, 2], [3, 2], [99, 99]], ',');
    expect(after.floor[2 * 16 + 2]).toBe(',');
    expect(after.floor[2 * 16 + 3]).toBe(',');
    expect(before.floor[2 * 16 + 2]).toBe('.');
    expect(paintWall(before, [[4, 4]], 'G').walls[4 * 16 + 4]).toBe('G');
    expect(paintWall(paintWall(before, [[4, 4]], 'G'), [[4, 4]], ' ').walls[4 * 16 + 4]).toBe(' ');
  });

  it('leaves furniture tiles and the spawn tile alone when painting walls', () => {
    const l = withObject(emptyLayout(), { id: 'p', kind: 'plant', x: 3, y: 3, rot: 0 });
    const painted = paintWall(l, [[3, 3], [8, 6], [5, 5]], '#');
    expect(painted.walls[3 * 16 + 3]).toBe(' ');
    expect(painted.walls[6 * 16 + 8]).toBe(' ');
    expect(painted.walls[5 * 16 + 5]).toBe('#');
  });

  it('erases a wall first, and furniture where there is no wall', () => {
    let l = withObject(emptyLayout(), { id: 'p', kind: 'plant', x: 3, y: 3, rot: 0 });
    l = withWall(l, 5, 5, '#');
    expect(erase(l, [[5, 5]]).walls[5 * 16 + 5]).toBe(' ');
    expect(erase(l, [[3, 3]]).objects).toEqual([]);
    expect(erase(l, [[3, 3]]).walls).toBe(l.walls);
  });
});

describe('furniture', () => {
  it('places furniture with a fresh id, and refuses outside, on a wall, on other furniture, and on the spawn', () => {
    const l = emptyLayout();
    const placed = ok(placeObject(l, 'sofa', 3, 3, 0));
    expect(placed.layout.objects).toHaveLength(1);
    expect(placed.layout.objects[0].id).toMatch(/^[a-z0-9-]{1,40}$/);
    expect(placeObject(l, 'plant', 16, 3, 0)).toMatchObject({ ok: false, error: expect.stringMatching(/fit inside/) });
    expect(placeObject(l, 'plant', 0, 3, 0)).toMatchObject({ ok: false, error: expect.stringMatching(/wall/) });
    expect(placeObject(placed.layout, 'plant', 3, 3, 0)).toMatchObject({ ok: false, error: expect.stringMatching(/already there/) });
    expect(placeObject(l, 'table', 8, 6, 0)).toMatchObject({ ok: false, error: expect.stringMatching(/appear/) });
    expect(placeObject(l, 'chair', 8, 6, 0).ok).toBe(true); // a chair doesn't block, so it may sit on the spawn
    expect(placeObject(l, 'nonsense', 3, 3, 0).ok).toBe(false);
  });

  it('gives different objects different ids', () => {
    let l = emptyLayout();
    for (let i = 0; i < 20; i++) l = ok(placeObject(l, 'plant', 1 + i % 10, 1 + Math.floor(i / 10), 0)).layout;
    expect(new Set(l.objects.map((o) => o.id)).size).toBe(20);
  });

  it('moves an object, keeping its id, and refuses a move onto something', () => {
    const l = smallOffice();
    const moved = ok(moveObject(l, 'chair-a', 10, 2)).layout;
    expect(objectOf(moved, 'chair-a')).toMatchObject({ x: 10, y: 2, rot: 0 });
    expect(objectOf(l, 'chair-a')).toMatchObject({ x: 10, y: 4 });
    expect(moveObject(l, 'chair-a', 10, 5).ok).toBe(false); // onto desk-a
    expect(moveObject(l, 'desk-a', 9, 6).ok).toBe(false); // onto desk-b
    expect(moveObject(l, 'ghost', 3, 3).ok).toBe(false);
    expect(moveObject(l, 'desk-a', 9, 5).ok).toBe(true); // staying put is fine: it ignores itself
  });

  it('turns an object a quarter turn about its centre, and a 3×1 desk becomes 1×3', () => {
    const l = withObject(emptyLayout(), { id: 'd', kind: 'desk', x: 4, y: 4, rot: 0 });
    const turned = ok(rotateObject(l, 'd')).layout;
    expect(objectOf(turned, 'd')).toMatchObject({ x: 5, y: 3, rot: 1 });
    const again = ok(rotateObject(turned, 'd')).layout;
    expect(objectOf(again, 'd')).toMatchObject({ x: 4, y: 4, rot: 2 });
    // Four turns bring it back.
    let r = l;
    for (let i = 0; i < 4; i++) r = ok(rotateObject(r, 'd')).layout;
    expect(objectOf(r, 'd')).toMatchObject({ x: 4, y: 4, rot: 0 });
  });

  it('refuses a turn that would leave the office or hit something', () => {
    const edge = withObject(emptyLayout(), { id: 'd', kind: 'desk', x: 4, y: 10, rot: 0 }); // turning needs rows 9..11 and row 11 is the wall
    expect(rotateObject(edge, 'd')).toEqual({ ok: false, error: 'Not enough room to turn this here.' });
    const blocked = withObject(withObject(emptyLayout(), { id: 'd', kind: 'desk', x: 4, y: 4, rot: 0 }), { id: 'p', kind: 'plant', x: 5, y: 3, rot: 0 });
    expect(rotateObject(blocked, 'd').ok).toBe(false);
  });

  it('deletes by id and finds what stands on a tile', () => {
    const l = smallOffice();
    expect(objectAt(l, 10, 5)?.id).toBe('desk-a');
    expect(objectAt(l, 10, 9)).toBeUndefined();
    expect(deleteObject(l, 'desk-a').objects.map((o) => o.id)).not.toContain('desk-a');
    expect(whyNotFit(l, 'desk', 9, 5, 2, 'desk-a')).toBeNull();
  });
});

describe('spawn and size', () => {
  it('moves the spawn to a free floor tile only', () => {
    const l = withWall(withObject(emptyLayout(), { id: 't', kind: 'table', x: 3, y: 3, rot: 0 }), 5, 5, '#');
    expect(ok(setSpawn(l, 2, 2)).layout.spawn).toEqual({ x: 2, y: 2 });
    expect(setSpawn(l, 3, 3).ok).toBe(false);
    expect(setSpawn(l, 5, 5).ok).toBe(false);
    expect(setSpawn(l, 40, 3).ok).toBe(false);
  });

  it('resizes between 10 and 100, keeps what fits, and lists what it cut', () => {
    const l = smallOffice();
    const grown = resize(l, 20, 14);
    expect([grown.layout.w, grown.layout.h]).toEqual([20, 14]);
    expect(grown.cut).toEqual([]);
    expect(grown.layout.floor).toHaveLength(20 * 14);
    expect(grown.layout.objects).toHaveLength(l.objects.length);

    const shrunk = resize(l, 11, 10);
    expect(shrunk.cut.length).toBeGreaterThan(0);
    expect(shrunk.cut.join(' ')).toMatch(/Desk/);
    expect(shrunk.layout.objects.length).toBeLessThan(l.objects.length);
    expect(shrunk.layout.pods[0].rects[0][2]).toBeLessThanOrEqual(10);

    expect(resize(l, 5, 500).layout).toMatchObject({ w: 10, h: 100 });
  });
});

describe('rooms and pods', () => {
  const T = (...tiles: [number, number][]) => tiles;
  const edit = (r: { ok: boolean }) => (r as { ok: true; layout: Layout }).layout;

  it('turns tiles into the fewest rectangles', () => {
    const set = new Set(['1,1', '2,1', '3,1', '1,2', '2,2', '3,2', '5,1']);
    expect(rectsFromTiles(set)).toEqual([[1, 1, 3, 2], [5, 1, 5, 1]]);
    expect(rectsFromTiles(new Set())).toEqual([]);
    // An L shape needs two.
    expect(rectsFromTiles(new Set(['1,1', '1,2', '2,2'])).length).toBe(2);
  });

  it('creates a room, paints tiles into it, and keeps a name of at most 25 characters', () => {
    const made = newRegion(emptyLayout(), 'room', '  A very long meeting room name indeed  ', { private: true });
    expect(made.ok).toBe(true);
    const id = (made as { id: string }).id;
    expect(edit(made).rooms[0]).toMatchObject({ name: 'A very long meeting room ', private: true, highlight: true, rects: [] });
    const painted = paintRegion(edit(made), 'room', id, T([2, 2], [3, 2], [2, 3], [3, 3]));
    expect(edit(painted).rooms[0].rects).toEqual([[2, 2, 3, 3]]);
    const more = paintRegion(edit(painted), 'room', id, T([4, 2], [4, 3]));
    expect(edit(more).rooms[0].rects).toEqual([[2, 2, 4, 3]]);
  });

  it('will not paint a private room over another private room, but may over an open area', () => {
    let l = emptyLayout();
    const open = newRegion(l, 'room', 'Open area') as Edit & { id: string };
    l = edit(paintRegion(edit(open), 'room', open.id, T([2, 2], [3, 2], [4, 2])));
    const priv = newRegion(l, 'room', 'Huddle', { private: true }) as Edit & { id: string };
    const inside = paintRegion(edit(priv), 'room', priv.id, T([3, 2]));
    expect(inside.ok).toBe(true);
    const second = newRegion(edit(inside), 'room', 'Other', { private: true }) as Edit & { id: string };
    const clash = paintRegion(edit(second), 'room', second.id, T([3, 2]));
    expect(clash).toMatchObject({ ok: false, error: expect.stringMatching(/private room/) });
  });

  it('removes tiles from rooms or pods, and a region left with no tiles disappears from its rectangles', () => {
    const made = newRegion(emptyLayout(), 'pod', 'Pod');
    const painted = edit(paintRegion(edit(made), 'pod', (made as { id: string }).id, T([2, 2], [3, 2])));
    const less = unpaintRegion(painted, 'pod', T([3, 2]));
    expect(less.pods[0].rects).toEqual([[2, 2, 2, 2]]);
    expect(unpaintRegion(less, 'pod', T([2, 2])).pods[0].rects).toEqual([]);
  });

  it('edits a room and a pod, clamping capacity to 1–50', () => {
    const r = newRegion(emptyLayout(), 'room', 'Room') as Edit & { id: string };
    const patched = edit(updateRoom(edit(r), r.id, { name: 'Huddle', private: true, capacity: 99, restricted: true }));
    expect(patched.rooms[0]).toMatchObject({ name: 'Huddle', private: true, highlight: true, capacity: 50, restricted: true });
    expect('capacity' in edit(updateRoom(patched, r.id, { capacity: null })).rooms[0]).toBe(false);
    const p = newRegion(emptyLayout(), 'pod', 'Pod') as Edit & { id: string };
    expect(edit(updatePod(edit(p), p.id, { mode: 'cubicle', name: 'Quiet' })).pods[0]).toMatchObject({ mode: 'cubicle', name: 'Quiet' });
    expect(updateRoom(emptyLayout(), 'nope', {}).ok).toBe(false);
  });

  it('places the ready-made pod and meeting room, and everything they add is checked clean and editable', () => {
    const l = emptyLayout(30, 20);
    const pod = edit(placePrefab(l, 'pod-4', 10, 4));
    expect(pod.objects.filter((o) => o.kind === 'desk')).toHaveLength(4);
    expect(pod.objects.filter((o) => o.kind === 'chair')).toHaveLength(4);
    expect(pod.pods).toHaveLength(1);
    expect(checkLayout(pod)).toEqual([]);
    expect(compileWorld(pod, builtInCatalog()).desks).toHaveLength(4);

    const room = edit(placePrefab(l, 'meeting-6', 3, 3));
    expect(room.objects.filter((o) => o.kind === 'chair')).toHaveLength(6);
    expect(room.rooms[0]).toMatchObject({ private: true, rects: [[4, 4, 9, 8]] });
    expect(checkLayout(room)).toEqual([]);
    // Edit one piece afterwards, like anything else.
    expect(moveObject(room, room.objects.find((o) => o.kind === 'plant')!.id, 8, 7).ok).toBe(true);
  });

  it('refuses a prefab outside the office or over another pod or private room, and clears what stood under it', () => {
    const l = emptyLayout(30, 20);
    expect(placePrefab(l, 'pod-4', 27, 4)).toMatchObject({ ok: false, error: expect.stringMatching(/fit inside/) });
    const pod = edit(placePrefab(l, 'pod-4', 10, 4));
    expect(placePrefab(pod, 'pod-4', 12, 5)).toMatchObject({ ok: false, error: expect.stringMatching(/another desk pod/) });
    const room = edit(placePrefab(l, 'meeting-6', 3, 3));
    expect(placePrefab(room, 'meeting-6', 4, 4)).toMatchObject({ ok: false, error: expect.stringMatching(/private room/) });
    const plant = withObject(l, { id: 'p', kind: 'plant', x: 12, y: 5, rot: 0 });
    expect(edit(placePrefab(plant, 'pod-4', 10, 4)).objects.some((o) => o.id === 'p')).toBe(false);
  });
});
