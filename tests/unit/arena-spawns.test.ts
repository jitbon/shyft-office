import { describe, expect, it } from 'vitest';
import { arenaSpawns } from '../../shared/arena';
import { builtInCatalog } from '../../shared/catalog';
import { defaultLayout } from '../../shared/default-layout';
import { NO_WALL, type Layout } from '../../shared/layout';
import { compileWorld } from '../../shared/world';

const open = (w: number, h: number): Layout => {
  let walls = '';
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) walls += x === 0 || y === 0 || x === w - 1 || y === h - 1 ? '#' : NO_WALL;
  return { w, h, floor: '.'.repeat(w * h), walls, objects: [], rooms: [], pods: [], spawn: { x: 2, y: 2 } };
};

function check(world: ReturnType<typeof compileWorld>) {
  const s = arenaSpawns(world)!;
  expect(s).not.toBeNull();
  expect(s.blue).toHaveLength(5);
  expect(s.orange).toHaveLength(5);
  const desk = new Set(world.desks.flatMap((d) => d.tiles.map((t) => `${t.x},${t.y}`)));
  const seen = new Set<string>();
  for (const p of [...s.blue, ...s.orange]) {
    const tx = Math.floor(p.x), ty = Math.floor(p.y);
    expect(world.block[ty * world.w + tx]).toBe(0);
    expect(desk.has(`${tx},${ty}`)).toBe(false);
    const area = world.areas.find((a) => a.rects.some(([x0, y0, x1, y1]) => tx >= x0 && tx <= x1 && ty >= y0 && ty <= y1));
    expect(area?.private ?? false).toBe(false);
    expect(seen.has(`${tx},${ty}`)).toBe(false);
    seen.add(`${tx},${ty}`);
  }
  return s;
}
const centre = (g: { x: number; y: number }[]) => ({ x: g.reduce((a, p) => a + p.x, 0) / g.length, y: g.reduce((a, p) => a + p.y, 0) / g.length });

describe('arenaSpawns', () => {
  it('finds two groups on open floor in the default office, far apart', () => {
    const world = compileWorld(defaultLayout(), builtInCatalog());
    const s = check(world);
    const a = centre(s.blue), b = centre(s.orange);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(Math.hypot(world.w, world.h) / 2);
  });
  it('works on a small custom layout', () => {
    const world = compileWorld(open(20, 8), builtInCatalog());
    const s = check(world);
    const a = centre(s.blue), b = centre(s.orange);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(8);
  });
  it('is deterministic', () => {
    const world = compileWorld(defaultLayout(), builtInCatalog());
    expect(arenaSpawns(world)).toEqual(arenaSpawns(world));
  });
  it('returns null when there are fewer than ten open tiles', () => {
    expect(arenaSpawns(compileWorld(open(10, 10), builtInCatalog())) ).not.toBeNull(); // 64 open tiles
    const tiny = open(10, 10);
    tiny.walls = '#'.repeat(100);
    expect(arenaSpawns(compileWorld(tiny, builtInCatalog()))).toBeNull();
  });
});
