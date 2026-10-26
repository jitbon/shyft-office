import { describe, expect, it } from 'vitest';
import { defaultLayout } from '../../shared/default-layout';
import { presenceOf } from '../../shared/desk-presence';
import { cloneLayout } from '../../shared/layout';
import { compileWorld } from '../../shared/world';

const world = compileWorld(defaultLayout());
const desk = world.desks.find((d) => d.id === 'desk-5-13')!;
const ME = '11111111-1111-4111-8111-111111111111';
const owned = { [desk.id]: ME };

describe('presenceOf', () => {
  it('is null outside every desk space', () => {
    expect(presenceOf(world, 0.5, 0.5, ME, owned)).toBeNull();
  });

  it('finds the desk from the seat, a desk-top tile and a ring tile', () => {
    const seat = desk.seat;
    const top = desk.tiles.find((t) => world.grid[t.y][t.x] === 'd')!;
    const ring = desk.tiles.find((t) => world.grid[t.y][t.x] !== 'd' && !(t.x === seat.x && t.y === seat.y))!;
    for (const t of [seat, top, ring]) {
      const p = presenceOf(world, t.x + 0.5, t.y + 0.5, ME, owned);
      expect(p, JSON.stringify(t)).toMatchObject({ deskId: desk.id, mine: true });
      expect(p!.tiles).toEqual(desk.tiles);
    }
  });

  it('is mine only when the owner is this member', () => {
    const t = desk.seat;
    expect(presenceOf(world, t.x + 0.5, t.y + 0.5, 'someone-else', owned)!.mine).toBe(false);
    expect(presenceOf(world, t.x + 0.5, t.y + 0.5, ME, {})!.mine).toBe(false); // unclaimed
  });

  it('never counts a guest as the owner, even for a claimed desk', () => {
    const t = desk.seat;
    expect(presenceOf(world, t.x + 0.5, t.y + 0.5, 'eph-3', { [desk.id]: 'eph-3' })!.mine).toBe(false);
  });

  it('puts a position on a tile edge in the tile it floors to', () => {
    const t = desk.seat;
    expect(presenceOf(world, t.x, t.y, ME, owned)!.deskId).toBe(desk.id);
    expect(presenceOf(world, t.x + 0.999, t.y + 0.999, ME, owned)!.deskId).toBe(desk.id);
  });

  it('follows a desk that moved in a recompiled world', () => {
    const l = cloneLayout(defaultLayout());
    l.pods.push({ id: 'pod-4', name: 'Desk pod 4', rects: [[18, 1, 21, 9]], mode: 'ambient' }); // open floor for one more desk
    const o = l.objects.find((q) => q.id === 'desk-5-13')!;
    const c = l.objects.find((q) => q.id === 'chair-6-12')!;
    Object.assign(o, { x: 18, y: 3 });
    Object.assign(c, { x: 19, y: 2 });
    const moved = compileWorld(l);
    const md = moved.desks.find((d) => d.id === 'desk-5-13')!;
    expect(presenceOf(moved, md.seat.x + 0.5, md.seat.y + 0.5, ME, owned)!.deskId).toBe('desk-5-13');
    expect(presenceOf(moved, desk.seat.x + 0.5, desk.seat.y + 0.5, ME, owned)?.deskId).not.toBe('desk-5-13');
  });

  it('gives each tile to at most one desk', () => {
    const seen = new Map<string, string>();
    for (const d of world.desks) for (const t of d.tiles) {
      const key = `${t.x},${t.y}`;
      expect(seen.get(key), key).toBeUndefined();
      seen.set(key, d.id);
    }
  });
});
