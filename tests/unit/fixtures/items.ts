import type { ItemDefinition, Kind, Part } from '../../../shared/items';

/** A valid plain part, 0.5 wide and deep and 0.2 tall, in a corner of the item. */
export const part = (over: Partial<Part> = {}): Part => ({ x: 0, y: 0, z: 0, w: 0.5, d: 0.5, h: 0.2, pattern: 'plain', color: '#c0c0c0', ...over });

/** A valid definition of each kind: floor 1×1, deskitem 0.5×0.5, wall 0.5×0.25, floorart 2×1 with a flat part. */
export function itemDef(kind: Kind = 'floor', over: Partial<ItemDefinition> = {}): ItemDefinition {
  const base: Record<Kind, ItemDefinition> = {
    floor: { format: 1, name: 'Test stool', group: 'chairs', kind: 'floor', footprint: [1, 1], blocks: true, parts: [part()] },
    deskitem: { format: 1, name: 'Test mug', group: 'computers', kind: 'deskitem', footprint: [0.5, 0.5], blocks: false, parts: [part({ w: 0.25, d: 0.25, h: 0.15 })] },
    wall: { format: 1, name: 'Test poster', group: 'walldecor', kind: 'wall', footprint: [0.5, 0.25], blocks: false, hang: 0.35, parts: [part({ w: 0.5, d: 0.05, h: 0.4 })] },
    floorart: { format: 1, name: 'Test rug', group: 'floorart', kind: 'floorart', footprint: [2, 1], blocks: false, parts: [part({ w: 2, d: 1, h: 0.05 })] },
  };
  return { ...base[kind], ...over };
}

import { setStudioItems, type StudioRecord } from '../../../shared/catalog';

/** Makes studio items known to the catalog for one test: `const restore = withItems([{ id: 'stool', def: itemDef('floor') }])`. */
export function withItems(items: { id: string; def: ItemDefinition; by?: string; version?: number }[]): () => void {
  const records: StudioRecord[] = items.map((i) => ({ id: i.id, def: i.def, by: i.by ?? 'Tester', version: i.version ?? 1 }));
  setStudioItems(records);
  return () => setStudioItems([]);
}

import { compileWorld } from '../../../shared/world';
import type { Layout } from '../../../shared/layout';

/** `count` open floor spots in a layout, each with a free 2×2 around it and at least 3 tiles from the next, row by row. */
export function openSpots(layout: Layout, count: number): [number, number][] {
  const w = compileWorld(layout);
  const free = (x: number, y: number) => x >= 0 && y >= 0 && x < w.w && y < w.h && !w.block[y * w.w + x] && w.grid[y][x] === layout.floor[y * w.w + x] && !(x === layout.spawn.x && y === layout.spawn.y);
  const out: [number, number][] = [];
  for (let y = 2; y < w.h - 2 && out.length < count; y++) {
    for (let x = 2; x < w.w - 2 && out.length < count; x++) {
      if (![0, 1].every((dy) => [0, 1, 2].every((dx) => free(x + dx, y + dy)))) continue;
      if (out.some(([ox, oy]) => Math.abs(ox - x) < 4 && Math.abs(oy - y) < 4)) continue;
      out.push([x, y]);
    }
  }
  if (out.length < count) throw new Error('not enough open floor');
  return out;
}
