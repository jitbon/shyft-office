import { describe, expect, it } from 'vitest';
import { parseLayoutWith } from '../../shared/catalog';
import { defaultLayout } from '../../shared/default-layout';
import { mergeLayouts } from '../../shared/layout-merge';
import { cloneLayout, type Layout } from '../../shared/layout';
import { updateRoom } from '../../src/builder/tools';
import { smallOffice, withRoom } from './fixtures/layouts';

const parseRoom = (jam: unknown) => {
  const raw = JSON.parse(JSON.stringify(smallOffice()));
  raw.rooms[0] = { ...raw.rooms[0], jam };
  const r = parseLayoutWith(raw);
  if (!r.ok) throw new Error(r.errors.join());
  return r.layout.rooms[0];
};

describe('Room.jam', () => {
  it('is kept only when exactly true', () => {
    expect(parseRoom(true).jam).toBe(true);
    for (const v of [false, undefined, null, 'true', 1, 0, {}, []]) expect('jam' in parseRoom(v)).toBe(false);
  });

  it('leaves a layout without it unchanged', () => {
    const l = smallOffice();
    const parsed = parseLayoutWith(JSON.parse(JSON.stringify(l)));
    expect(parsed.ok && parsed.layout).toEqual(l);
    expect(l.rooms.every((r) => !('jam' in r))).toBe(true);
  });

  it('survives a merge', () => {
    const base = smallOffice();
    const mine: Layout = cloneLayout(base);
    mine.rooms[0].jam = true;
    const { merged, clashes } = mergeLayouts(base, base, mine);
    expect(clashes).toEqual([]);
    expect(merged.rooms.find((r) => r.id === mine.rooms[0].id)?.jam).toBe(true);
    const added = withRoom(base, { id: 'new-jam', rects: [[10, 10, 11, 11]], jam: true });
    expect(mergeLayouts(base, base, added).merged.rooms.find((r) => r.id === 'new-jam')?.jam).toBe(true);
  });

  it('is on for the default Kitchen only', () => {
    const jams = defaultLayout().rooms.filter((r) => r.jam).map((r) => r.id);
    expect(jams).toEqual(['kitchen']);
  });

  it('is set and cleared by the builder without touching private or restricted', () => {
    const l = smallOffice();
    const id = l.rooms[0].id;
    const on = updateRoom(l, id, { jam: true });
    expect(on.ok && on.layout.rooms[0]).toMatchObject({ jam: true, private: l.rooms[0].private, restricted: l.rooms[0].restricted });
    const off = on.ok && updateRoom(on.layout, id, { jam: false });
    expect(off && off.ok && 'jam' in off.layout.rooms[0]).toBe(false);
  });
});
