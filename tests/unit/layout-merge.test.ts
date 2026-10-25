import { describe, expect, it } from 'vitest';
import { cloneLayout, type Layout } from '../../shared/layout';
import { mergeLayouts } from '../../shared/layout-merge';
import { emptyLayout, smallOffice, withObject, withPod, withRoom, withWall } from './fixtures/layouts';

const paint = (l: Layout, x: number, y: number, code: string): Layout => {
  const c = cloneLayout(l);
  const i = y * c.w + x;
  c.floor = c.floor.slice(0, i) + code + c.floor.slice(i + 1);
  return c;
};
const move = (l: Layout, id: string, x: number, y: number): Layout => {
  const c = cloneLayout(l);
  const o = c.objects.find((q) => q.id === id)!;
  o.x = x;
  o.y = y;
  return c;
};
const base = () => smallOffice();
const at = (l: Layout, id: string) => l.objects.find((o) => o.id === id);

describe('mergeLayouts', () => {
  it('combines edits to different tiles and different objects', () => {
    const theirs = move(paint(base(), 2, 8, ','), 'desk-a', 9, 5);
    const mine = move(paint(base(), 3, 8, ';'), 'desk-b', 10, 6);
    const { merged, clashes } = mergeLayouts(base(), theirs, mine);
    expect(clashes).toEqual([]);
    expect(merged.floor[8 * 16 + 2]).toBe(',');
    expect(merged.floor[8 * 16 + 3]).toBe(';');
    expect(at(merged, 'desk-b')).toMatchObject({ x: 10, y: 6 });
  });

  it('does not call it a clash when both sides made the same edit', () => {
    const edit = (l: Layout) => move(paint(l, 2, 8, ','), 'desk-a', 9, 5);
    const { merged, clashes } = mergeLayouts(base(), edit(base()), edit(base()));
    expect(clashes).toEqual([]);
    expect(merged.floor[8 * 16 + 2]).toBe(',');
  });

  it('reports the same object moved two ways as one clash, and keeps theirs until it is resolved', () => {
    const theirs = move(base(), 'chair-a', 10, 3);
    const mine = move(base(), 'chair-a', 11, 4);
    const { merged, clashes } = mergeLayouts(base(), theirs, mine);
    expect(clashes).toHaveLength(1);
    expect(clashes[0].key).toBe('obj:chair-a');
    expect(clashes[0].tiles).toEqual(expect.arrayContaining([[10, 3], [11, 4]]));
    expect(at(merged, 'chair-a')).toMatchObject({ x: 10, y: 3 });
  });

  it('applies the chosen side for a clash', () => {
    const theirs = move(base(), 'chair-a', 10, 3);
    const mine = move(base(), 'chair-a', 11, 4);
    const pickMine = mergeLayouts(base(), theirs, mine, { 'obj:chair-a': 'mine' });
    expect(pickMine.clashes).toEqual([]);
    expect(at(pickMine.merged, 'chair-a')).toMatchObject({ x: 11, y: 4 });
    const pickTheirs = mergeLayouts(base(), theirs, mine, { 'obj:chair-a': 'theirs' });
    expect(at(pickTheirs.merged, 'chair-a')).toMatchObject({ x: 10, y: 3 });
  });

  it('treats an object deleted on one side and moved on the other as a clash', () => {
    const theirs = cloneLayout(base());
    theirs.objects = theirs.objects.filter((o) => o.id !== 'chair-a');
    const mine = move(base(), 'chair-a', 11, 4);
    expect(mergeLayouts(base(), theirs, mine).clashes.map((c) => c.key)).toEqual(['obj:chair-a']);
    // Deleted on one side only is not a clash.
    expect(mergeLayouts(base(), theirs, base()).merged.objects.map((o) => o.id)).not.toContain('chair-a');
  });

  it('merges rooms, pods, the spawn and the size as units', () => {
    const theirs = withRoom(base(), { id: 'new-room', name: 'New', rects: [[10, 9, 13, 10]] });
    const mine = withPod(base(), { id: 'new-pod', name: 'Pod B', rects: [[1, 8, 4, 10]] });
    mine.spawn = { x: 7, y: 9 };
    const merged = mergeLayouts(base(), theirs, mine).merged;
    expect(merged.rooms.map((r) => r.id)).toEqual(['room-a', 'new-room']);
    expect(merged.pods.map((p) => p.id)).toEqual(['pod-a', 'new-pod']);
    expect(merged.spawn).toEqual({ x: 7, y: 9 });

    const a = withRoom(base(), { id: 'x', name: 'A', rects: [[1, 8, 2, 9]] });
    const b = withRoom(base(), { id: 'x', name: 'B', rects: [[1, 8, 2, 9]] });
    expect(mergeLayouts(base(), a, b).clashes.map((c) => c.key)).toEqual(['room:x']);

    const grown = emptyLayout(20, 12);
    const tweak = paint(emptyLayout(16, 12), 2, 2, ',');
    const both = mergeLayouts(emptyLayout(16, 12), grown, tweak);
    expect(both.clashes).toEqual([]);
    expect([both.merged.w, both.merged.h]).toEqual([20, 12]);
    expect(both.merged.floor[2 * 20 + 2]).toBe(',');
    expect(both.merged.floor).toHaveLength(20 * 12);
    expect(both.merged.walls).toHaveLength(20 * 12);
  });

  it('merges wall edits as tiles', () => {
    const theirs = withWall(base(), 8, 9, '#');
    const mine = withWall(base(), 9, 9, 'G');
    const { merged, clashes } = mergeLayouts(base(), theirs, mine);
    expect(clashes).toEqual([]);
    expect(merged.walls[9 * 16 + 8]).toBe('#');
    expect(merged.walls[9 * 16 + 9]).toBe('G');
  });

  it('turns every differing unit into a clash when the base is gone', () => {
    const theirs = paint(base(), 2, 8, ',');
    const mine = paint(withObject(base(), { id: 'fern', kind: 'plant', x: 3, y: 9, rot: 0 }), 2, 8, ';');
    const { clashes } = mergeLayouts(null, theirs, mine);
    expect(clashes.map((c) => c.key).sort()).toEqual(['floor:2,8', 'obj:fern']);
    expect(mergeLayouts(null, base(), base()).clashes).toEqual([]);
  });
});
