import { describe, expect, it } from 'vitest';
import { builtInCatalog, parseLayoutWith } from '../../shared/catalog';
import { parsePaintKey } from '../../shared/finishes';
import { checkLayout } from '../../shared/layout-check';
import { KIT_MAX, ROOM_KITS, stampKit } from '../../shared/room-kits';
import { isThemeId } from '../../shared/themes';
import { compileWorld } from '../../shared/world';
import { emptyLayout } from './fixtures/layouts';

const catalog = builtInCatalog();
const big = () => emptyLayout(30, 30);

describe('room kits', () => {
  it('offers at least eight, each at most 12×12', () => {
    expect(ROOM_KITS.length).toBeGreaterThanOrEqual(8);
    expect(new Set(ROOM_KITS.map((k) => k.id)).size).toBe(ROOM_KITS.length);
    for (const k of ROOM_KITS) {
      expect(k.w).toBeLessThanOrEqual(KIT_MAX);
      expect(k.h).toBeLessThanOrEqual(KIT_MAX);
      expect(k.walls).toHaveLength(k.w * k.h);
      expect(k.floorPaint).toHaveLength(k.w * k.h);
    }
  });

  it('has a doorway on its edge, and uses only known finishes, themes and items', () => {
    for (const k of ROOM_KITS) {
      const edge: string[] = [];
      for (let y = 0; y < k.h; y++) for (let x = 0; x < k.w; x++) if (x === 0 || y === 0 || x === k.w - 1 || y === k.h - 1) edge.push(k.walls[y * k.w + x]);
      expect(edge.includes(' '), `${k.id} doorway`).toBe(true);
      for (const key of k.paints) expect(parsePaintKey(key), `${k.id} ${key}`).not.toBeNull();
      if (k.style) expect(isThemeId(k.style.theme), k.id).toBe(true);
      for (const ob of k.objects) expect(catalog.has(ob.kind), `${k.id} ${ob.kind}`).toBe(true);
    }
  });

  it('stamps onto an empty office as a layout the server accepts with no problems', () => {
    for (const k of ROOM_KITS) {
      const r = stampKit(big(), k, 5, 6, new Set(), catalog);
      expect('layout' in r).toBe(true);
      if (!('layout' in r)) continue;
      const parsed = parseLayoutWith(JSON.parse(JSON.stringify(r.layout)), catalog);
      expect(parsed.ok, `${k.id}: ${parsed.ok ? '' : parsed.errors.join('; ')}`).toBe(true);
      expect(checkLayout(r.layout, catalog), k.id).toEqual([]);
      expect(r.layout.rooms.find((room) => room.id === r.roomId)).toMatchObject({ name: k.room.name, private: k.room.private, ...(k.style ? { style: k.style } : {}) });
    }
  });

  it('leaves the room inside reachable from its doorway', () => {
    for (const k of ROOM_KITS) {
      const r = stampKit(big(), k, 4, 4, new Set(), catalog);
      if (!('layout' in r)) throw new Error(k.id);
      const w = compileWorld(r.layout, catalog);
      const free = (x: number, y: number) => x >= 0 && y >= 0 && x < w.w && y < w.h && !w.block[y * w.w + x];
      const door: [number, number] = [4 + k.door, 4 + k.h - 1];
      const seen = new Set([`${door[0]},${door[1]}`]);
      const queue = [door];
      while (queue.length) {
        const [cx, cy] = queue.pop()!;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const [nx, ny] = [cx + dx, cy + dy];
          if (free(nx, ny) && !seen.has(`${nx},${ny}`) && ny >= 4 && ny <= 4 + k.h - 1 && nx >= 4 && nx <= 4 + k.w - 1) {
            seen.add(`${nx},${ny}`);
            queue.push([nx, ny]);
          }
        }
      }
      let open = 0, reached = 0;
      for (let y = 5; y < 4 + k.h - 1; y++) for (let x = 5; x < 4 + k.w - 1; x++) if (free(x, y)) { open++; if (seen.has(`${x},${y}`)) reached++; }
      expect(reached, k.id).toBe(open);
    }
  });

  it('refuses to stamp off the grid, over a claimed desk, or over the spawn point', () => {
    const k = ROOM_KITS[0];
    expect(stampKit(big(), k, 25, 5, new Set(), catalog)).toEqual({ error: 'off-map' });
    expect(stampKit(big(), k, -1, 5, new Set(), catalog)).toEqual({ error: 'off-map' });
    expect(stampKit(big(), k, 5, 5, new Set(['7,8']), catalog)).toEqual({ error: 'covers-desk' });
    const l = big();
    l.spawn = { x: 8, y: 8 };
    expect(stampKit(l, k, 5, 5, new Set(), catalog)).toEqual({ error: 'covers-spawn' });
  });

  it('gives every new object an id no other object has, even when stamped twice', () => {
    let l = big();
    for (const [x, y] of [[2, 2], [14, 2]]) {
      const r = stampKit(l, ROOM_KITS[0], x, y, new Set(), catalog);
      if (!('layout' in r)) throw new Error('stamp');
      l = r.layout;
    }
    const ids = l.objects.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(l.rooms).toHaveLength(2);
    expect(new Set(l.rooms.map((r) => r.id)).size).toBe(2);
  });

  it('replaces what stood in the rectangle', () => {
    const l = big();
    l.objects.push({ id: 'old-plant', kind: 'plant', x: 6, y: 7, rot: 0 });
    const r = stampKit(l, ROOM_KITS[0], 5, 5, new Set(), catalog);
    if (!('layout' in r)) throw new Error('stamp');
    expect(r.layout.objects.some((o) => o.id === 'old-plant')).toBe(false);
  });
});
