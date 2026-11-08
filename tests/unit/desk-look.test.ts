import { describe, expect, it } from 'vitest';
import { builtInCatalog } from '../../shared/catalog';
import { DESK_ITEMS_MAX, clampDeskLook, validateDeskLook, type DeskLook, type LookDesk } from '../../shared/desk-look';
import { cloneLayout } from '../../shared/layout';
import { compileWorld } from '../../shared/world';
import { smallOffice } from './fixtures/layouts';

const catalog = builtInCatalog();
const layout = smallOffice();
const world = compileWorld(layout, catalog);
const lookDesk = (id: string): LookDesk => ({
  obj: layout.objects.find((o) => o.id === id)!,
  item: catalog.get('desk')!,
  chairItem: catalog.get('chair'),
  tiles: world.desks.find((d) => d.id === id)!.tiles,
});
const check = (look: Partial<DeskLook>, id = 'desk-b') => validateDeskLook({ items: [], ...look }, lookDesk(id), catalog);
const LAPTOP = 'item:rm-laptop', MUG = 'item:rm-mug', NOTES = 'item:rm-notebook-and-pen';
const piece = (kind: string, x = 0.2, y = 0.1) => ({ kind, at: [x, y] as [number, number], rot: 0 as const });
const rugKind = [...catalog.values()].find((i) => i.kind === 'floorart' && i.footprint[0] === 1 && i.footprint[1] === 1)!.id;

describe('validateDeskLook', () => {
  it('accepts an empty look', () => {
    expect(check({})).toBeNull();
  });

  it('wants a desk and a chair of the same size', () => {
    expect(check({ desk: 'item:rm-reception-desk' })).toBeNull(); // 3×1 like the desk
    expect(check({ desk: 'item:rm-standing-desk' })).toBe('wrong-size'); // 2×1
    expect(check({ desk: 'plant' })).toBe('unknown-item');
    expect(check({ desk: 'nonsense' })).toBe('unknown-item');
    expect(check({ chair: 'item:rm-office-chair' })).toBeNull();
    expect(check({ chair: 'item:rm-bench' })).toBe('wrong-size');
    expect(check({ chair: 'desk' })).toBe('unknown-item');
  });

  it('lets the computer be none, keep the builder’s, or a computer, and does not count it in the six', () => {
    expect(check({ computer: null })).toBeNull();
    expect(check({ computer: piece(LAPTOP) })).toBeNull();
    expect(check({ computer: piece(MUG) })).toBe('unknown-item');
    const six = Array.from({ length: DESK_ITEMS_MAX }, (_, i) => piece(MUG, 0.2 + i * 0.4, 0.4));
    expect(check({ computer: piece(LAPTOP, 0.1, 0.1), items: six })).toBeNull();
  });

  it('allows at most six desk items, all desk items, all on the desk', () => {
    const seven = Array.from({ length: DESK_ITEMS_MAX + 1 }, (_, i) => piece(MUG, 0.1 + i * 0.3, 0.4));
    expect(check({ items: seven })).toBe('too-many');
    expect(check({ items: [piece('plant')] })).toBe('unknown-item');
    expect(check({ items: [piece(MUG, 2.9, 0)] })).toBe('outside-space'); // 3 wide desk: 2.9 + 0.25 is past the edge
    expect(check({ items: [piece(MUG, 0.2, 0.9)] })).toBe('outside-space');
    expect(check({ items: [piece(MUG, -0.2, 0)] })).toBe('outside-space');
  });

  it('keeps a rug inside the desk space', () => {
    // desk-b faces south with its chair at (10,7): the row below the desk in the desk's own frame.
    expect(check({ rug: { kind: rugKind, dx: 1, dy: 1, rot: 0 } })).toBeNull();
    expect(check({ rug: { kind: rugKind, dx: 5, dy: 1, rot: 0 } })).toBe('outside-space');
    expect(check({ rug: { kind: 'desk', dx: 1, dy: 1, rot: 0 } })).toBe('unknown-item');
  });

  it('keeps a rug inside the space of a desk that faces the other way', () => {
    expect(check({ rug: { kind: rugKind, dx: 1, dy: 1, rot: 0 } }, 'desk-a')).toBeNull();
    expect(check({ rug: { kind: rugKind, dx: 1, dy: -4, rot: 0 } }, 'desk-a')).toBe('outside-space');
  });

  it('wants a floor finish that is a floor paint key', () => {
    expect(check({ floor: 'grass' })).toBeNull();
    expect(check({ floor: 'brick-red' })).toBe('bad-paint');
    expect(check({ floor: 'nope' })).toBe('bad-paint');
  });
});

describe('clampDeskLook', () => {
  it('reads good input, rounds placements, and keeps one extra item so too-many can be reported', () => {
    const raw = { items: Array.from({ length: 20 }, () => ({ kind: MUG, at: [0.123, 0.5], rot: 1 })), floor: 'grass' };
    const l = clampDeskLook(raw)!;
    expect(l.items).toHaveLength(DESK_ITEMS_MAX + 1);
    expect(l.items[0].at[0]).toBe(0.1);
    expect(check(l)).toBe('too-many');
  });

  it('refuses what is not a look', () => {
    for (const bad of [null, 5, 'x', [], { items: 'no' }, { items: [{ kind: 5, at: [0, 0], rot: 0 }] }, { items: [{ kind: MUG, at: [0, 0], rot: 9 }] }, { desk: 7 }, { rug: { kind: 'x' } }]) {
      expect(clampDeskLook(bad)).toBeNull();
    }
    expect(clampDeskLook({ computer: null })).toEqual({ items: [], computer: null });
  });
});

describe('showing a look', () => {
  const withLook = (l: typeof layout, look: DeskLook, id = 'desk-b') => compileWorld(l, catalog, { [id]: look });
  const look: DeskLook = { items: [piece(MUG, 0.5, 0.2)] };

  it('puts items on the desk, relative to it, however it is turned', () => {
    for (const id of ['desk-a', 'desk-b']) {
      const viaLook = withLook(layout, look, id).deskItems.find((p) => p.obj.kind === MUG)!;
      const built = cloneLayout(layout);
      built.objects.push({ id: 'mug-1', kind: MUG, x: 0, y: 0, rot: 0, on: id, at: [0.5, 0.2] });
      const viaBuilder = compileWorld(built, catalog).deskItems.find((p) => p.obj.kind === MUG)!;
      expect([viaLook.x, viaLook.y, viaLook.rot]).toEqual([viaBuilder.x, viaBuilder.y, viaBuilder.rot]);
    }
  });

  it('follows a desk that was moved', () => {
    const moved = cloneLayout(layout);
    for (const id of ['desk-b', 'chair-b']) moved.objects.find((o) => o.id === id)!.x -= 1; // the desk and its chair move together
    const a = withLook(layout, look).deskItems.find((p) => p.obj.kind === MUG)!;
    const b = withLook(moved, look).deskItems.find((p) => p.obj.kind === MUG)!;
    expect(b.x - a.x).toBe(-1);
  });

  it('swaps the desk and chair for ones of the same size, and adds a rug and a floor', () => {
    const w = withLook(layout, { items: [], desk: 'item:rm-reception-desk', chair: 'item:rm-office-chair', rug: { kind: rugKind, dx: 1, dy: 1, rot: 0 }, floor: 'grass' });
    expect(w.objects.find((o) => o.obj.id === 'desk-b')!.item.id).toBe('item:rm-reception-desk');
    expect(w.objects.find((o) => o.obj.id === 'chair-b')!.item.id).toBe('item:rm-office-chair');
    expect(w.floorArt.some((a) => a.obj.id.endsWith('-rug'))).toBe(true);
    expect(w.paintAt(10, 7, 'floor').finish.id).toBe('grass');
    expect(w.paintAt(2, 9, 'floor').finish.id).not.toBe('grass');
  });

  it('never changes collision, the grid, the desks or the spawn', () => {
    const big: DeskLook = { items: [piece(MUG, 0.5, 0.2), piece(NOTES, 1.5, 0.2)], computer: piece(LAPTOP, 2, 0.1), desk: 'item:rm-reception-desk', chair: 'item:rm-office-chair', rug: { kind: rugKind, dx: 1, dy: 1, rot: 0 }, floor: 'grass' };
    const plain = compileWorld(layout, catalog), shown = withLook(layout, big);
    expect(shown.block).toEqual(plain.block);
    expect(shown.grid).toEqual(plain.grid);
    expect(shown.desks).toEqual(plain.desks);
    expect(shown.spawn).toEqual(plain.spawn);
  });

  it('hides the builder’s items on the desk that the look replaces, and only on that desk', () => {
    const built = cloneLayout(layout);
    built.objects.push({ id: 'b-mug', kind: MUG, x: 0, y: 0, rot: 0, on: 'desk-b', at: [0.1, 0.1] }, { id: 'a-mug', kind: MUG, x: 0, y: 0, rot: 0, on: 'desk-a', at: [0.1, 0.1] });
    const w = withLook(built, { items: [piece(NOTES, 1.5, 0.2)] });
    expect(w.deskItems.some((p) => p.obj.id === 'b-mug')).toBe(false);
    expect(w.deskItems.some((p) => p.obj.id === 'a-mug')).toBe(true);
    // No items in the look: the builder's stay.
    expect(withLook(built, { items: [], floor: 'grass' }).deskItems.some((p) => p.obj.id === 'b-mug')).toBe(true);
  });

  it('skips a piece that does not fit the desk it is shown at, and keeps the rest', () => {
    const small = cloneLayout(layout);
    small.objects.find((o) => o.id === 'desk-b')!.kind = 'desk-small';
    const w = withLook(small, { items: [piece(MUG, 2.4, 0.2), piece(MUG, 0.2, 0.2)] });
    expect(w.deskItems.filter((p) => p.obj.kind === MUG)).toHaveLength(1);
  });

  it('ignores a look for a desk that is not there', () => {
    expect(withLook(layout, look, 'no-such-desk').deskItems.some((p) => p.obj.kind === MUG)).toBe(false);
  });
});
