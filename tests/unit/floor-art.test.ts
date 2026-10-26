import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { currentCatalog } from '../../shared/catalog';
import { normalizeLayout, type Layout, type PlacedObject } from '../../shared/layout';
import { compileWorld } from '../../shared/world';
import type { Texture } from '../../src/art';
import { bakedFloorCell } from '../../src/floorart';
import { abgr } from '../../src/pattern';
import { itemDef, part, withItems } from './fixtures/items';
import { emptyLayout, withObject } from './fixtures/layouts';

const RED = '#cc2222', BLUE = '#2222cc';
let restore: () => void;
beforeEach(() => {
  const rug = (color: string) => itemDef('floorart', { footprint: [2, 1], parts: [part({ w: 2, d: 1, h: 0.05, color })] });
  restore = withItems([
    { id: 'red', def: rug(RED) },
    { id: 'blue', def: rug(BLUE) },
    { id: 'chair', def: itemDef('floor') },
  ]);
});
afterEach(() => restore());

const base = (): Texture => ({ w: 32, h: 32, data: new Uint32Array(1024).fill(abgr('#d7ad7c')) });
const art = (id: string, x: number, y: number, rot: 0 | 1 | 2 | 3 = 0): PlacedObject => ({ id, kind: `item:${id.split('-')[0]}`, x, y, rot });
const world = (...objs: PlacedObject[]) => {
  const l: Layout = objs.reduce((acc, o) => withObject(acc, o), emptyLayout());
  return compileWorld(normalizeLayout(l, currentCatalog()).layout, currentCatalog());
};
const differs = (t: Texture) => t.data.some((c) => c !== abgr('#d7ad7c'));
const allColor = (t: Texture, hex: string) => t.data.every((c) => c === abgr(hex));

describe('bakedFloorCell', () => {
  it('paints the matching slice of a 2×1 rug over each cell it covers, and leaves other cells alone', () => {
    const w = world(art('red-1', 4, 4));
    const left = bakedFloorCell(w, 4, 4, base()), right = bakedFloorCell(w, 5, 4, base());
    expect(differs(left)).toBe(true);
    expect(differs(right)).toBe(true);
    const outside = base();
    expect(bakedFloorCell(w, 6, 4, outside)).toBe(outside); // not covered: the same texture comes back
    expect(bakedFloorCell(w, 4, 5, outside)).toBe(outside);
    // The rug is one picture: the two halves are made of the same pixels, so a plain rug is the same in both.
    expect(left.data.filter((c) => c !== abgr('#d7ad7c')).length).toBeGreaterThan(900);
  });

  it('does not change the texture it was given', () => {
    const input = base();
    const before = input.data.slice();
    bakedFloorCell(world(art('red-1', 4, 4)), 4, 4, input);
    expect(input.data).toEqual(before);
  });

  it('puts a later piece over an earlier one, and an earlier one shows where the later does not reach', () => {
    const w = world(art('red-1', 4, 4), art('blue-2', 5, 4));
    // Cell (4,4) is red only; cell (5,4) is red under blue, so blue shows; (6,4) is blue only.
    expect(differs(bakedFloorCell(w, 4, 4, base()))).toBe(true);
    const mid = bakedFloorCell(w, 5, 4, base());
    const px = mid.data[16 * 32 + 16];
    expect(px).not.toBe(bakedFloorCell(world(art('red-1', 4, 4)), 5, 4, base()).data[16 * 32 + 16]);
    const later = world(art('blue-1', 4, 4), art('red-2', 4, 4));
    const top = bakedFloorCell(later, 4, 4, base());
    expect(top.data[16 * 32 + 16]).toBe(bakedFloorCell(world(art('red-2', 4, 4)), 4, 4, base()).data[16 * 32 + 16]);
  });

  it('covers the turned footprint of a turned rug', () => {
    const w = world(art('red-1', 4, 4, 1)); // 1 wide and 2 deep
    expect(differs(bakedFloorCell(w, 4, 4, base()))).toBe(true);
    expect(differs(bakedFloorCell(w, 4, 5, base()))).toBe(true);
    const o = base();
    expect(bakedFloorCell(w, 5, 4, o)).toBe(o);
  });

  it('never changes what blocks walking, and sits under a chair without trouble', () => {
    const plain = compileWorld(emptyLayout(), currentCatalog());
    const w = world(art('red-1', 4, 4), { id: 'chair-1', kind: 'item:chair', x: 4, y: 4, rot: 0 });
    expect(w.floorArt).toHaveLength(1);
    expect(w.floorArt[0]).toMatchObject({ x: 4, y: 4, w: 2, d: 1 });
    expect(Array.from(w.block).filter(Boolean).length).toBe(Array.from(plain.block).filter(Boolean).length + 1); // only the chair
    expect(allColor(base(), '#d7ad7c')).toBe(true);
  });
});
