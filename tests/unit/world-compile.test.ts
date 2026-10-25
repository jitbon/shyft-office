import { afterEach, describe, expect, it } from 'vitest';
import { builtInCatalog } from '../../shared/catalog';
import { defaultLayout } from '../../shared/default-layout';
import { AREAS, DESKS, MAP_W, areaAt, compileDefault, deskAt, isBlocking, setWorld, tileAt } from '../../shared/map';
import { compileWorld } from '../../shared/world';
import { emptyLayout, smallOffice, withObject } from './fixtures/layouts';

const compile = (l: Parameters<typeof compileWorld>[0]) => compileWorld(l, builtInCatalog());

afterEach(() => setWorld(compileDefault()));

describe('compileWorld', () => {
  it('stamps a turned 3×1 desk into 1×3 tiles', () => {
    const w = compile(withObject(emptyLayout(), { id: 'd1', kind: 'desk', x: 5, y: 3, rot: 1 }));
    const tiles = w.grid.flatMap((row, y) => [...row].map((c, x) => (c === 'd' ? `${x},${y}` : '')).filter(Boolean));
    expect(tiles).toEqual(['5,3', '5,4', '5,5']);
    expect(w.objects[0]).toMatchObject({ w: 1, d: 3 });
  });

  it('shows a chair as h without blocking it, and lets a blocking object win on the same tile', () => {
    let l = withObject(emptyLayout(), { id: 'c1', kind: 'chair', x: 4, y: 4, rot: 0 });
    let w = compile(l);
    expect(w.grid[4][4]).toBe('h');
    expect(w.block[4 * w.w + 4]).toBe(0);
    l = withObject(l, { id: 'p1', kind: 'plant', x: 4, y: 4, rot: 0 });
    w = compile(l);
    expect(w.grid[4][4]).toBe('p');
    expect(w.block[4 * w.w + 4]).toBe(1);
  });

  it('puts walls over everything and marks the spawn', () => {
    const l = withObject(emptyLayout(), { id: 'p1', kind: 'plant', x: 0, y: 0, rot: 0 });
    const w = compile(l);
    expect(w.grid[0][0]).toBe('#');
    expect(w.grid[6][8]).toBe('S');
    expect(w.spawn).toEqual({ x: 8.5, y: 6.5 });
  });

  it('finds desks only inside pods, and only with a chair against the long side', () => {
    const w = compile(smallOffice());
    expect(w.desks.map((d) => d.id)).toEqual(['desk-a', 'desk-b']);
    expect(w.desks[0]).toMatchObject({ podId: 'pod-a', seat: { x: 10, y: 4 } });

    const noChair = smallOffice();
    noChair.objects = noChair.objects.filter((o) => o.id !== 'chair-a');
    expect(compile(noChair).desks.map((d) => d.id)).toEqual(['desk-b']);

    const outside = smallOffice();
    outside.pods = [];
    expect(compile(outside).desks).toEqual([]);

    const endOn = smallOffice();
    endOn.objects = endOn.objects.map((o) => (o.id === 'chair-a' ? { ...o, x: 8, y: 5 } : o)); // beside the desk's short end
    expect(compile(endOn).desks.map((d) => d.id)).toEqual(['desk-b']);
  });

  it('keeps a desk id when the desk and its chair are moved', () => {
    const moved = smallOffice();
    moved.objects = moved.objects.map((o) => (o.id === 'desk-a' ? { ...o, x: 10, y: 5 } : o.id === 'chair-a' ? { ...o, x: 11, y: 4 } : o));
    const w = compile(moved);
    expect(w.desks.find((d) => d.id === 'desk-a')?.seat).toEqual({ x: 11, y: 4 });
  });

  it('never gives two desks the same tile', () => {
    const seen = new Set<string>();
    for (const d of compile(smallOffice()).desks) for (const t of d.tiles) {
      expect(seen.has(`${t.x},${t.y}`)).toBe(false);
      seen.add(`${t.x},${t.y}`);
    }
  });
});

describe('setWorld', () => {
  it('updates what every importer reads', () => {
    expect(MAP_W).toBe(40);
    expect(DESKS).toHaveLength(12);
    setWorld(compile(smallOffice()));
    expect(MAP_W).toBe(16);
    expect(DESKS.map((d) => d.id)).toEqual(['desk-a', 'desk-b']);
    expect(areaAt(2.5, 2.5)?.id).toBe('room-a');
    expect(AREAS).toHaveLength(1);
    expect(deskAt(10.5, 5.5)?.id).toBe('desk-a');
    expect(tileAt(10, 5)).toBe('d');
    expect(isBlocking(10, 5)).toBe(true);
    expect(isBlocking(10, 4)).toBe(false);
    expect(isBlocking(-1, 0)).toBe(true);
  });

  it('defaults back to the office that ships with the app', () => {
    setWorld(compile(smallOffice()));
    setWorld(compileDefault());
    expect(MAP_W).toBe(defaultLayout().w);
  });
});
