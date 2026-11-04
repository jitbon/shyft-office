import { describe, expect, it } from 'vitest';
import { GEAR, HIT_RADIUS, castShot, makeRng, type GearDef } from '../../shared/arena';
import { builtInCatalog } from '../../shared/catalog';
import { NO_WALL, type Layout } from '../../shared/layout';
import { compileWorld } from '../../shared/world';

/** A 20×10 room of open floor, with a wall column at x = 8 from y = 0 to 6 and a solid table at (12, 5). */
function testWorld() {
  const w = 20, h = 10;
  let walls = '';
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) walls += x === 0 || y === 0 || x === w - 1 || y === h - 1 || (x === 8 && y <= 6) ? '#' : NO_WALL;
  }
  const layout: Layout = {
    w, h, floor: '.'.repeat(w * h), walls,
    objects: [{ id: 't1', kind: 'table', v: 1, x: 12, y: 5, rot: 0 }],
    rooms: [], pods: [], spawn: { x: 2, y: 2 },
  };
  return compileWorld(layout, builtInCatalog());
}
const world = testWorld();
const lone: GearDef = { ...GEAR.stapler, spread: 0, range: 30 };
const rng = makeRng(1);
const shoot = (from: [number, number], targets: { id: string; x: number; y: number }[], angle: number, gear = lone) =>
  castShot(world, { x: from[0], y: from[1] }, targets, angle, gear, rng);

describe('castShot', () => {
  it('hits a target straight ahead within range', () => {
    const [ray] = shoot([2.5, 2.5], [{ id: 'a', x: 6.5, y: 2.5 }], 0);
    expect(ray.hit).toBe('a');
    expect(ray.x1).toBeCloseTo(6.5 - HIT_RADIUS, 5);
  });

  it('hits the nearest of two targets in a line', () => {
    const [ray] = shoot([2.5, 8.5], [{ id: 'far', x: 7.5, y: 8.5 }, { id: 'near', x: 5.5, y: 8.5 }], 0);
    expect(ray.hit).toBe('near');
  });

  it('misses a target behind a wall and ends at the wall', () => {
    const [ray] = shoot([2.5, 2.5], [{ id: 'a', x: 11.5, y: 2.5 }], 0);
    expect(ray.hit).toBeUndefined();
    expect(ray.x1).toBeCloseTo(8, 5);
  });

  it('misses a target behind solid furniture', () => {
    const [ray] = shoot([9.5, 5.5], [{ id: 'a', x: 15.5, y: 5.5 }], 0);
    expect(ray.hit).toBeUndefined();
    expect(ray.x1).toBeCloseTo(12, 5);
  });

  it('misses a target beyond range, and ends at the range', () => {
    const [ray] = shoot([2.5, 8.5], [{ id: 'a', x: 17.5, y: 8.5 }], 0, { ...lone, range: 10 });
    expect(ray.hit).toBeUndefined();
    expect(ray.x1).toBeCloseTo(12.5, 5);
  });

  it('hits exactly HIT_RADIUS off the line and misses 0.31 off', () => {
    expect(shoot([2.5, 8.5], [{ id: 'a', x: 6.5, y: 8.5 + HIT_RADIUS }], 0)[0].hit).toBe('a');
    expect(shoot([2.5, 8.5], [{ id: 'a', x: 6.5, y: 8.5 + 0.31 }], 0)[0].hit).toBeUndefined();
  });

  it('does not hit a target behind the shooter', () => {
    expect(shoot([5.5, 8.5], [{ id: 'a', x: 3.5, y: 8.5 }], 0)[0].hit).toBeUndefined();
  });

  it('jitters the angle within the spread, the same way for the same seed', () => {
    const wide: GearDef = { ...lone, spread: 14 };
    const ends = (seed: number) => Array.from({ length: 20 }, (_, i) => {
      const r = makeRng(seed + i);
      return castShot(world, { x: 2.5, y: 8.5 }, [], 0, wide, r)[0];
    });
    const a = ends(7), b = ends(7);
    expect(a).toEqual(b);
    for (const ray of a) {
      const ang = Math.abs(Math.atan2(ray.y1 - 8.5, ray.x1 - 2.5)) * (180 / Math.PI);
      expect(ang).toBeLessThanOrEqual(7 + 1e-6);
    }
    expect(a.some((r) => Math.abs(r.y1 - 8.5) > 0.01)).toBe(true);
  });

  it('fires six pellets for the scatter gun, and each can hit', () => {
    const rays = castShot(world, { x: 2.5, y: 8.5 }, [{ id: 'a', x: 5.5, y: 8.5 }], 0, GEAR['band-scatter'], makeRng(3));
    expect(rays).toHaveLength(6);
    expect(rays.filter((r) => r.hit === 'a').length).toBeGreaterThan(1);
  });
});
