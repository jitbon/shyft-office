import { describe, expect, it } from 'vitest';
import {
  AREAS, DESKS, DESK_PODS, deriveDesks, deskAt, nearestFreeTileNear, podAt, tileAt, validateOffice,
  type DeskPod,
} from '../../shared/map';

describe('derived desks', () => {
  it('finds one desk per chair next to a desk tile, with ids <podId>:<x>,<y>', () => {
    // Eight clusters of four desks.
    expect(DESKS).toHaveLength(32);
    expect(deriveDesks()).toEqual(DESKS);
    for (const d of DESKS) {
      expect(d.id).toBe(`${d.podId}:${d.seat.x},${d.seat.y}`);
      expect(tileAt(d.seat.x, d.seat.y)).toBe('h');
      expect(d.tiles.some((t) => tileAt(t.x, t.y) === 'd')).toBe(true);
      expect(d.tiles[0]).toEqual(d.seat);
    }
  });

  it('gives every pod at least one desk', () => {
    for (const pod of DESK_PODS) expect(DESKS.some((d) => d.podId === pod.id)).toBe(true);
  });

  it('never lets two desks share a tile', () => {
    const seen = new Map<string, string>();
    for (const d of DESKS) {
      for (const t of d.tiles) {
        const k = `${t.x},${t.y}`;
        expect(seen.get(k), `tile ${k}`).toBeUndefined();
        seen.set(k, d.id);
      }
    }
  });

  it('only includes walkable floor around the furniture, never other desks or walls', () => {
    for (const d of DESKS) {
      for (const t of d.tiles.slice(1)) {
        const tile = tileAt(t.x, t.y);
        expect(['d', '.']).toContain(tile);
      }
    }
  });

  it('looks desks up by position', () => {
    const d = DESKS[0];
    expect(deskAt(d.seat.x + 0.5, d.seat.y + 0.5)?.id).toBe(d.id);
    expect(deskAt(20.5, 22.5)).toBeNull();
    expect(podAt(d.seat.x + 0.5, d.seat.y + 0.5)?.id).toBe(d.podId);
  });
});

describe('validateOffice', () => {
  it('accepts the real office', () => {
    expect(() => validateOffice()).not.toThrow();
  });

  it('throws when a pod overlaps a private area', () => {
    const meetA = AREAS.find((a) => a.id === 'meet-a')!;
    const bad: DeskPod = { id: 'bad', name: 'Bad pod', rects: [[meetA.rects[0][0], meetA.rects[0][1], 3, 3]], mode: 'ambient' };
    expect(() => validateOffice([...DESK_PODS, bad], AREAS, [...DESKS, { id: 'bad:1,1', podId: 'bad', seat: { x: 1, y: 1 }, tiles: [{ x: 1, y: 1 }] }]))
      .toThrow(/overlaps private area meet-a/);
  });

  it('throws when two pods overlap, a pod has no desks, or a name is too long', () => {
    const [a] = DESK_PODS;
    expect(() => validateOffice([...DESK_PODS, { ...a, id: 'dup' }], AREAS, [...DESKS, { id: 'dup:0,0', podId: 'dup', seat: { x: 0, y: 0 }, tiles: [] }]))
      .toThrow(/overlap/);
    expect(() => validateOffice([...DESK_PODS, { id: 'empty', name: 'Empty', rects: [[20, 20, 21, 21]], mode: 'ambient' }]))
      .toThrow(/contains no desks/);
    expect(() => validateOffice([{ ...a, name: 'x'.repeat(26) }], AREAS, DESKS)).toThrow(/longer than 25/);
  });

  it('throws when two desks share a tile', () => {
    const [a, b] = DESKS;
    const crowded = DESKS.map((d) => (d === b ? { ...b, tiles: [...b.tiles, a.tiles[1]] } : d));
    expect(() => validateOffice(DESK_PODS, AREAS, crowded)).toThrow(/share tile/);
  });
});

describe('nearestFreeTileNear', () => {
  it('returns the start tile when it is free', () => {
    expect(nearestFreeTileNear(20.5, 19.5, new Set())).toEqual({ x: 20.5, y: 19.5 });
  });

  it('steps to a neighbouring tile when the start is occupied, and never into furniture', () => {
    const t = nearestFreeTileNear(20.5, 19.5, new Set(['20,19']))!;
    expect(Math.abs(t.x - 20.5) + Math.abs(t.y - 19.5)).toBe(1);
    // Next to the sofa at (18-21, 22): the answer is never a sofa tile.
    const u = nearestFreeTileNear(19.5, 23.5, new Set(['19,23']))!;
    expect(tileAt(Math.floor(u.x), Math.floor(u.y))).not.toBe('s');
  });

  it('does not cross the wall of a meeting room', () => {
    // Everything inside Meeting Room A near its doorway is taken, so the search must not escape outside.
    const occupied = new Set<string>();
    for (let x = 4; x <= 8; x++) for (let y = 6; y <= 8; y++) occupied.add(`${x},${y}`);
    const t = nearestFreeTileNear(6.5, 8.5, occupied);
    expect(t === null || t.y < 9).toBe(true);
  });

  it('gives up when nothing within three tiles is free', () => {
    const occupied = new Set<string>();
    for (let x = 10; x <= 30; x++) for (let y = 15; y <= 25; y++) occupied.add(`${x},${y}`);
    expect(nearestFreeTileNear(20.5, 20.5, occupied)).toBeNull();
  });
});
