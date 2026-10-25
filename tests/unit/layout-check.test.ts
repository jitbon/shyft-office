import { describe, expect, it } from 'vitest';
import { defaultLayout } from '../../shared/default-layout';
import { checkLayout } from '../../shared/layout-check';
import type { Layout } from '../../shared/layout';
import { emptyLayout, smallOffice, withObject, withPod, withRoom, withWall } from './fixtures/layouts';

const codes = (l: Layout) => checkLayout(l).map((p) => p.code);

describe('checkLayout', () => {
  it('finds nothing wrong with the office that ships, or with the small fixture', () => {
    expect(checkLayout(defaultLayout())).toEqual([]);
    expect(checkLayout(smallOffice())).toEqual([]);
  });

  it('reports a spawn on a wall or on blocking furniture, with its tile', () => {
    const onWall = withWall(emptyLayout(), 8, 6, '#');
    expect(checkLayout(onWall)).toEqual([expect.objectContaining({ code: 'spawn-blocked', tiles: [[8, 6]] })]);
    const onPlant = withObject(emptyLayout(), { id: 'p', kind: 'plant', x: 8, y: 6, rot: 0 });
    expect(codes(onPlant)).toEqual(['spawn-blocked']);
  });

  it('reports a spawn outside the grid', () => {
    const l = emptyLayout();
    l.spawn = { x: 99, y: 2 };
    expect(codes(l)).toContain('spawn-outside');
  });

  it('reports objects outside the grid', () => {
    const l = withObject(emptyLayout(), { id: 'd', kind: 'desk', x: 14, y: 3, rot: 0 }); // 3 wide from x=14 in a 16-wide grid
    expect(checkLayout(l)).toContainEqual(expect.objectContaining({ code: 'object-outside' }));
  });

  it('reports blocking objects that overlap each other or sit on a wall', () => {
    let l = withObject(emptyLayout(), { id: 'a', kind: 'plant', x: 3, y: 3, rot: 0 });
    l = withObject(l, { id: 'b', kind: 'table', x: 3, y: 3, rot: 0 });
    expect(checkLayout(l)).toContainEqual({ code: 'object-overlap', message: expect.any(String), tiles: [[3, 3]] });
    const onWall = withObject(emptyLayout(), { id: 'c', kind: 'sofa', x: 0, y: 3, rot: 0 });
    expect(codes(onWall)).toContain('object-overlap');
  });

  it('reports overlapping rooms, overlapping pods, and a pod inside a private room', () => {
    let l = withRoom(emptyLayout(), { id: 'r1', name: 'One', rects: [[1, 1, 5, 5]] });
    l = withRoom(l, { id: 'r2', name: 'Two', rects: [[4, 4, 8, 8]] });
    expect(codes(l)).toContain('room-overlap');

    let p = withPod(emptyLayout(), { id: 'p1', name: 'One', rects: [[1, 1, 5, 5]] });
    p = withPod(p, { id: 'p2', name: 'Two', rects: [[5, 5, 8, 8]] });
    expect(codes(p)).toContain('pod-overlap');

    let q = withRoom(emptyLayout(), { id: 'r', name: 'Private', private: true, rects: [[1, 1, 5, 5]] });
    q = withPod(q, { id: 'p', name: 'Pod', rects: [[4, 4, 7, 7]] });
    expect(codes(q)).toContain('pod-in-private-room');
  });

  it('reports a room that cannot be reached from the spawn', () => {
    let l = withRoom(emptyLayout(), { id: 'vault', name: 'Vault', rects: [[2, 2, 4, 4]] });
    for (let i = 1; i <= 5; i++) {
      l = withWall(l, i, 1, '#');
      l = withWall(l, i, 5, '#');
      l = withWall(l, 1, i, '#');
      l = withWall(l, 5, i, '#');
    }
    const found = checkLayout(l).find((p) => p.code === 'unreachable');
    expect(found?.message).toMatch(/Vault/);
    expect(found?.tiles).toContainEqual([3, 3]);
    // A doorway makes it reachable again.
    expect(codes(withWall(l, 5, 3, ' '))).not.toContain('unreachable');
  });

  it('reports a desk whose chair cannot be reached', () => {
    let l = smallOffice();
    // Wall in the chair above desk-a.
    for (const x of [9, 10, 11]) l = withWall(l, x, 3, '#');
    l = withWall(l, 8, 4, '#');
    l = withWall(l, 11, 4, '#');
    const found = checkLayout(l).find((p) => p.code === 'unreachable');
    expect(found?.tiles).toEqual([[10, 4]]);
  });

  it('reports empty room and pod names', () => {
    let l = withRoom(emptyLayout(), { id: 'r', name: '', rects: [[1, 1, 3, 3]] });
    l = withPod(l, { id: 'p', name: '', rects: [[6, 1, 9, 3]] });
    expect(codes(l).filter((c) => c === 'bad-name')).toHaveLength(2);
  });

  it('reports too many objects', () => {
    const l = emptyLayout(100, 100);
    for (let i = 0; i < 2001; i++) l.objects.push({ id: `p${i}`, kind: 'plant', x: 1 + (i % 90), y: 1 + Math.floor(i / 90), rot: 0 });
    expect(codes(l)).toContain('too-many-objects');
  });

  it('checks a 100×100 office in under 5 ms', () => {
    const l = emptyLayout(100, 100);
    for (let i = 0; i < 300; i++) l.objects.push({ id: `p${i}`, kind: 'plant', x: 2 + (i % 90), y: 2 + Math.floor(i / 90) * 2, rot: 0 });
    for (let i = 0; i < 3; i++) checkLayout(l); // warm up
    const runs = Array.from({ length: 7 }, () => {
      const t = performance.now();
      checkLayout(l);
      return performance.now() - t;
    }).sort((a, b) => a - b);
    expect(runs[3]).toBeLessThan(5);
  });
});

describe('rooms inside bigger areas', () => {
  it('lets a private room sit inside an open area, but not two private rooms or two open areas overlap', () => {
    let l = withRoom(emptyLayout(), { id: 'open', name: 'Open', rects: [[1, 1, 10, 9]] });
    l = withRoom(l, { id: 'huddle', name: 'Huddle', private: true, rects: [[3, 3, 5, 5]] });
    expect(codes(l)).not.toContain('room-overlap');
    const twoPrivate = withRoom(l, { id: 'huddle2', name: 'Huddle 2', private: true, rects: [[5, 5, 7, 7]] });
    expect(codes(twoPrivate)).toContain('room-overlap');
  });

  it('does not call an empty room unreachable', () => {
    expect(codes(withRoom(emptyLayout(), { id: 'new', name: 'New room', rects: [] }))).toEqual([]);
  });
});
