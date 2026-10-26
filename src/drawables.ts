// What the top-down map shows that is drawn from item pictures (not by the tile painters): floor items made from parts,
// desk items, wall decor and floor art. Pure geometry: where each one is, what order to paint it in, and which tiles
// it touches, so the map can repaint exactly the tiles that changed.
import type { CatalogItem } from '../shared/catalog';
import type { Face, Rot } from '../shared/layout';
import type { World } from '../shared/world';

export interface Drawable {
  id: string;
  kind: 'floor' | 'deskitem' | 'wall' | 'floorart';
  item: CatalogItem;
  rot: Rot;
  /** Top-left corner of the footprint in tiles (for wall decor, the wall tile), and the size after turning. */
  x: number;
  y: number;
  w: number;
  d: number;
  face?: Face;
  /** Height of whatever it stands on or hangs at, in tiles (a desk's top, or the hang height). */
  base: number;
  /** Paint in ascending order: things further back first. */
  order: number;
  /** Anything that changes how it looks changes this. */
  key: string;
  /** The tiles its picture can touch, inclusive. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Whether an item is drawn from its parts (built-in furniture and sheet objects have painters of their own). */
export const isPictured = (item: CatalogItem) => item.id.startsWith('item:');

const height = (item: CatalogItem) => item.model.reduce((m, b) => Math.max(m, b.z + b.h), 0);
const cache = new WeakMap<World, { list: Drawable[]; sigs: string[] }>();

function build(w: World): { list: Drawable[]; sigs: string[] } {
  const list: Drawable[] = [];
  const add = (d: Omit<Drawable, 'key' | 'x0' | 'y0' | 'x1' | 'y1'>) => {
    // A picture rises up the page by half a tile per tile of height, and a little beyond its footprint all round.
    const rise = (height(d.item) + d.base) * 0.5;
    list.push({
      ...d,
      key: `${d.id}|${d.item.id}@${d.item.version}|${d.rot}|${d.x},${d.y}|${d.face ?? ''}|${d.base}`,
      x0: Math.floor(d.x - 0.05), y0: Math.floor(d.y - rise - 0.05),
      x1: Math.ceil(d.x + d.w + 0.05) - 1, y1: Math.ceil(d.y + d.d + 0.05) - 1,
    });
  };
  for (const o of w.objects) {
    if (isPictured(o.item)) add({ id: o.obj.id, kind: 'floor', item: o.item, rot: o.obj.rot, x: o.x, y: o.y, w: o.w, d: o.d, base: 0, order: o.y + o.d });
  }
  for (const a of w.floorArt) add({ id: a.obj.id, kind: 'floorart', item: a.item, rot: a.rot, x: a.x, y: a.y, w: a.w, d: a.d, base: 0, order: -1 });
  for (const i of w.deskItems) {
    add({ id: i.obj.id, kind: 'deskitem', item: i.item, rot: i.rot, x: i.x, y: i.y, w: i.w, d: i.d, base: i.z, order: i.host.y + i.host.d + 0.5 });
  }
  for (const d of w.wallDecor) {
    const [fw, fd] = d.item.footprint;
    const order = d.face === 's' ? d.y + 1 : d.face === 'n' ? d.y : d.y + 0.5;
    add({ id: d.obj.id, kind: 'wall', item: d.item, rot: 0, x: d.x, y: d.y, w: fw, d: fd, face: d.face, base: d.item.hang ?? 0.35, order });
    // Decor is drawn on the wall tile and a tile around it.
    const last = list[list.length - 1];
    last.x0 = d.x - 1; last.x1 = d.x + 1; last.y0 = d.y - 1; last.y1 = d.y + 1;
  }
  list.sort((a, b) => a.order - b.order || a.x - b.x);
  const sigs: string[] = new Array(w.w * w.h).fill('');
  for (const d of list) {
    for (let y = Math.max(0, d.y0); y <= Math.min(w.h - 1, d.y1); y++) {
      for (let x = Math.max(0, d.x0); x <= Math.min(w.w - 1, d.x1); x++) sigs[y * w.w + x] += `${d.key};`;
    }
  }
  return { list, sigs };
}

/** Everything drawn from pictures, in the order to paint it. */
export function drawablesOf(w: World): Drawable[] {
  let c = cache.get(w);
  if (!c) cache.set(w, (c = build(w)));
  return c.list;
}

/** For every tile, a text that changes when anything drawn there from a picture changes. */
export function tileSignatures(w: World): string[] {
  let c = cache.get(w);
  if (!c) cache.set(w, (c = build(w)));
  return c.sigs;
}
