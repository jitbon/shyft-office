import { describe, expect, it } from 'vitest';
import { defaultLayout } from '../../shared/default-layout';
import { cloneLayout, type Layout } from '../../shared/layout';
import { compileWorld } from '../../shared/world';

const bounds = (tiles: { x: number; y: number }[]) => ({
  x0: Math.min(...tiles.map((t) => t.x)), x1: Math.max(...tiles.map((t) => t.x)),
  y0: Math.min(...tiles.map((t) => t.y)), y1: Math.max(...tiles.map((t) => t.y)),
});

describe('a desk space is a 3×3 block', () => {
  const w = compileWorld(defaultLayout());

  it('is exactly nine tiles in a 3×3 square for every desk of the default office', () => {
    expect(w.desks).toHaveLength(12);
    for (const d of w.desks) {
      const b = bounds(d.tiles);
      expect(d.tiles, d.id).toHaveLength(9);
      expect(b.x1 - b.x0 + 1, d.id).toBe(3);
      expect(b.y1 - b.y0 + 1, d.id).toBe(3);
    }
  });

  it('holds the whole desk (3 tiles) and puts the chair in the middle of its row, with floor behind it', () => {
    for (const d of w.desks) {
      const desk = w.objects.find((o) => o.obj.id === d.id)!;
      const keys = new Set(d.tiles.map((t) => `${t.x},${t.y}`));
      for (let y = desk.y; y < desk.y + desk.d; y++) for (let x = desk.x; x < desk.x + desk.w; x++) expect(keys.has(`${x},${y}`), d.id).toBe(true);
      const b = bounds(d.tiles);
      expect(d.seat.x, d.id).toBe(b.x0 + 1);
      expect(desk.w, d.id).toBe(3);
      // The chair row is next to the desk row, and the third row is the floor behind the chair.
      const deskRow = desk.y, seatRow = d.seat.y;
      expect(Math.abs(seatRow - deskRow), d.id).toBe(1);
      const behind = seatRow < deskRow ? seatRow - 1 : seatRow + 1;
      expect([b.y0, b.y1]).toContain(behind);
    }
  });

  it('never shares a tile between two desks', () => {
    const seen = new Set<string>();
    for (const d of w.desks) for (const t of d.tiles) {
      const k = `${t.x},${t.y}`;
      expect(seen.has(k), k).toBe(false);
      seen.add(k);
    }
  });

  it('is still 3×3 for a desk turned a quarter, with the chair beside its long side', () => {
    const l: Layout = cloneLayout(defaultLayout());
    l.pods.push({ id: 'pod-4', name: 'Desk pod 4', rects: [[18, 1, 21, 9]], mode: 'ambient' });
    const desk = l.objects.find((o) => o.id === 'desk-5-13')!;
    const chair = l.objects.find((o) => o.id === 'chair-6-12')!;
    Object.assign(desk, { x: 20, y: 3, rot: 1 }); // 1 wide, 3 tall
    Object.assign(chair, { x: 19, y: 4, rot: 0 }); // to its west, level with the middle
    const d = compileWorld(l).desks.find((q) => q.id === 'desk-5-13')!;
    const b = bounds(d.tiles);
    expect(b.x1 - b.x0 + 1).toBe(3);
    expect(b.y1 - b.y0 + 1).toBe(3);
    expect(d.tiles).toHaveLength(9);
    expect(b.x0).toBe(18); // the extra column is behind the chair
    expect(d.seat).toEqual({ x: 19, y: 4 });
  });

  it('never takes tiles that are blocked or outside the pod', () => {
    const l: Layout = cloneLayout(defaultLayout());
    // Put a plant on the tile behind the first desk's chair: that corner of its space is lost.
    l.objects.push({ id: 'plant-x', kind: 'plant', x: 5, y: 11, rot: 0 });
    const d = compileWorld(l).desks.find((q) => q.id === 'desk-5-13')!;
    expect(d.tiles.some((t) => t.x === 5 && t.y === 11)).toBe(false);
    expect(d.tiles).toHaveLength(8);
  });
});
