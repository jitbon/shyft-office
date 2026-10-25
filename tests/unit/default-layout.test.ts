import { describe, expect, it } from 'vitest';
import { builtInCatalog } from '../../shared/catalog';
import { LEGACY_ROWS, defaultLayout } from '../../shared/default-layout';
import { parseLayoutWith } from '../../shared/catalog';
import { compileWorld } from '../../shared/world';

const world = compileWorld(defaultLayout(), builtInCatalog());

describe('the default layout', () => {
  it('compiles to exactly the rows the office always had', () => {
    expect(world.grid).toEqual(LEGACY_ROWS);
    expect([world.w, world.h]).toEqual([40, 28]);
  });

  it('keeps the spawn, the rooms and the pods', () => {
    expect(world.spawn).toEqual({ x: 19.5, y: 24.5 });
    expect(world.areas.map((a) => a.id)).toEqual(['meet-a', 'meet-b', 'kitchen', 'library', 'lobby', 'open']);
    expect(world.areas.filter((a) => a.private).map((a) => a.id)).toEqual(['meet-a', 'meet-b']);
    expect(world.pods.map((p) => p.id)).toEqual(['pod-1', 'pod-2', 'pod-3']);
  });

  it('has 12 desks in 3 pods of 4, named after their left tile, with the chair as the seat', () => {
    expect(world.desks).toHaveLength(12);
    for (const pod of world.pods) expect(world.desks.filter((d) => d.podId === pod.id)).toHaveLength(4);
    const first = world.desks[0];
    expect(first.id).toBe('desk-5-13');
    expect(first.seat).toEqual({ x: 6, y: 12 });
    expect(world.desks.map((d) => d.id).slice(0, 4)).toEqual(['desk-5-13', 'desk-9-13', 'desk-5-14', 'desk-9-14']);
    expect(world.desks[2].seat).toEqual({ x: 6, y: 15 });
  });

  it('turns desks and chairs toward each other', () => {
    const rot = (id: string) => defaultLayout().objects.find((o) => o.id === id)?.rot;
    expect(rot('desk-5-13')).toBe(2); // chair above
    expect(rot('desk-5-14')).toBe(0); // chair below
    expect(rot('chair-6-12')).toBe(0); // above the desk, faces south
    expect(rot('chair-6-15')).toBe(2);
  });

  it('survives a round trip through the parser', () => {
    const parsed = parseLayoutWith(JSON.parse(JSON.stringify(defaultLayout())));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.layout).toEqual(defaultLayout());
  });
});
