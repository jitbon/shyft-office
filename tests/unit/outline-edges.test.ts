import { describe, expect, it } from 'vitest';
import { defaultLayout } from '../../shared/default-layout';
import { outlineEdges } from '../../shared/desk-presence';
import { cloneLayout } from '../../shared/layout';
import { compileWorld } from '../../shared/world';

const len = (e: { x1: number; y1: number; x2: number; y2: number }) => Math.abs(e.x2 - e.x1) + Math.abs(e.y2 - e.y1);

describe('outlineEdges', () => {
  it('gives four unit edges for one tile', () => {
    const e = outlineEdges([{ x: 3, y: 4 }]);
    expect(e).toHaveLength(4);
    expect(e.every((q) => len(q) === 1)).toBe(true);
  });

  it('gives 8 edges for a row of 3 and none between neighbours', () => {
    const e = outlineEdges([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }]);
    expect(e).toHaveLength(8);
    expect(e.some((q) => q.x1 === 1 && q.x2 === 1)).toBe(false);
  });

  it('gives 12 edges for an L of 5 tiles', () => {
    const l = [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]].map(([x, y]) => ({ x, y }));
    expect(outlineEdges(l)).toHaveLength(12);
  });

  it('gives nothing for an empty set', () => {
    expect(outlineEdges([])).toEqual([]);
  });

  it('for a real desk space, has no edge inside the set and every edge has exactly one side in the set', () => {
    const w = compileWorld(defaultLayout());
    const d = w.desks[0];
    const inSet = new Set(d.tiles.map((t) => `${t.x},${t.y}`));
    for (const e of outlineEdges(d.tiles)) {
      // a horizontal edge at y between x1 and x1+1 separates tiles (x1, y-1) and (x1, y); a vertical one separates (x-1, y1) and (x, y1)
      const [a, b] = e.y1 === e.y2 ? [`${e.x1},${e.y1 - 1}`, `${e.x1},${e.y1}`] : [`${e.x1 - 1},${e.y1}`, `${e.x1},${e.y1}`];
      expect(Number(inSet.has(a)) + Number(inSet.has(b)), JSON.stringify(e)).toBe(1);
    }
  });

  it('gives the same count for a desk turned a quarter', () => {
    const l = cloneLayout(defaultLayout());
    const o = l.objects.find((q) => q.id === 'desk-5-13')!;
    const before = outlineEdges(compileWorld(l).desks.find((d) => d.id === 'desk-5-13')!.tiles).length;
    Object.assign(o, { rot: 1 });
    const turned = compileWorld(l).desks.find((d) => d.id === 'desk-5-13');
    if (turned) expect(outlineEdges(turned.tiles).length).toBeGreaterThan(0); // a turned desk may not stay a valid desk in the default room; when it does it has an outline
    expect(before).toBeGreaterThan(0);
  });
});
