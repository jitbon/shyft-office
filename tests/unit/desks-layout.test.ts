import { describe, expect, it } from 'vitest';
import { DESKS, DESK_PODS, MAP_H, MAP_W, SPAWN, getWorld, isBlocking, tileAt } from '../../shared/map';

// The open office has 3 pods of 4 wide desks: two facing two, with chairs on the outer sides.

const surface = (d: (typeof DESKS)[number]) => d.tiles.filter((t) => tileAt(t.x, t.y) === 'd');

describe('open office layout', () => {
  it('has 3 pods of 4 desks', () => {
    expect(DESK_PODS.map((p) => [p.id, p.name])).toEqual([
      ['pod-1', 'Desk pod 1'], ['pod-2', 'Desk pod 2'], ['pod-3', 'Desk pod 3'],
    ]);
    expect(DESKS).toHaveLength(12);
    for (const pod of DESK_PODS) expect(DESKS.filter((d) => d.podId === pod.id)).toHaveLength(4);
  });

  it('gives every desk a surface of exactly 3 desk tiles in a row, with the chair at the centre', () => {
    for (const d of DESKS) {
      const tiles = surface(d).sort((a, b) => a.x - b.x);
      expect(tiles, d.id).toHaveLength(3);
      expect(new Set(tiles.map((t) => t.y)).size, d.id).toBe(1);
      expect(tiles.map((t) => t.x), d.id).toEqual([tiles[0].x, tiles[0].x + 1, tiles[0].x + 2]);
      expect(d.seat.x, d.id).toBe(tiles[1].x);
      expect(Math.abs(d.seat.y - tiles[0].y), d.id).toBe(1);
      expect(tileAt(d.seat.x, d.seat.y)).toBe('h');
    }
  });

  it('has no desk tile that is not part of a desk, and no two desks sharing a tile', () => {
    const open = getWorld().grid.slice(10, 18).join('');
    expect(open.split('d').length - 1).toBe(12 * 3);
    const seen = new Set<string>();
    for (const d of DESKS) {
      for (const t of d.tiles) {
        const k = `${t.x},${t.y}`;
        expect(seen.has(k), k).toBe(false);
        seen.add(k);
      }
    }
  });

  it('leaves floor between side-by-side desks and aisles of at least 2 tiles between pods', () => {
    // Side by side: every run of desk tiles in a row is a single desk, so desks never touch.
    for (const row of getWorld().grid.slice(10, 18)) {
      for (const run of row.match(/d+/g) ?? []) expect(run).toHaveLength(3);
    }
    const spans = DESK_PODS.map((p) => {
      const xs = DESKS.filter((d) => d.podId === p.id).flatMap((d) => surface(d).map((t) => t.x));
      return { min: Math.min(...xs), max: Math.max(...xs) };
    }).sort((a, b) => a.min - b.min);
    for (let i = 1; i < spans.length; i++) expect(spans[i].min - spans[i - 1].max - 1).toBeGreaterThanOrEqual(2);
  });

  it('keeps the window walls on both sides of the open office', () => {
    for (const y of [13, 14]) {
      expect(tileAt(0, y)).toBe('G');
      expect(tileAt(MAP_W - 1, y)).toBe('G');
    }
  });

  it('lets people walk from the spawn point to every chair', () => {
    const key = (x: number, y: number) => `${x},${y}`;
    const start = [Math.floor(SPAWN.x), Math.floor(SPAWN.y)];
    const seen = new Set([key(start[0], start[1])]);
    const queue = [start];
    while (queue.length) {
      const [x, y] = queue.shift()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H || seen.has(key(nx, ny)) || isBlocking(nx, ny)) continue;
        seen.add(key(nx, ny));
        queue.push([nx, ny]);
      }
    }
    for (const d of DESKS) expect(seen.has(key(d.seat.x, d.seat.y)), d.id).toBe(true);
  });
});
