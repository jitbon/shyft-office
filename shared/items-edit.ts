// Changing an item that is already placed (specs/004-furniture-studio/research.md R9). Pure: given the layout and the old
// and new look of one item, every placed copy that cannot take the new footprint or kind is pinned to the old version
// (`v`), so nobody's layout is broken by someone else's edit.
import type { CatalogItem } from './catalog';
import { NO_WALL, rotFootprint, type Layout, type PlacedObject } from './layout';

const EPS = 1e-6;
const sameFootprint = (a: CatalogItem, b: CatalogItem) => Math.abs(a.footprint[0] - b.footprint[0]) < EPS && Math.abs(a.footprint[1] - b.footprint[1]) < EPS;

/** The older versions placed copies are pinned to, as `<kind>@<version>`. */
export function pinnedVersions(layout: Layout): Set<string> {
  const out = new Set<string>();
  for (const o of layout.objects) if (o.v !== undefined) out.add(`${o.kind}@${o.v}`);
  return out;
}

/** A copy's place on the floor, in tiles. */
type Rect = { x: number; y: number; w: number; d: number };
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.d && b.y < a.y + a.d;

/**
 * Pins the copies of `kind` that cannot take `next`. `prev` is how they look now (at `prev.version`); `others` resolves the
 * kind of every other object. Returns the new layout and how many copies were pinned. A copy already pinned stays as it is.
 */
export function pinMisfits(
  layout: Layout,
  kind: string,
  prev: CatalogItem,
  next: CatalogItem,
  others: (kind: string, v?: number) => CatalogItem | undefined,
): { layout: Layout; pinned: number } {
  // An item that desk items stand on can also stop being something they can stand on (it left the Desks group).
  const losesSurface = prev.surface !== undefined && next.surface === undefined;
  if (prev.kind === next.kind && sameFootprint(prev, next) && !losesSurface) return { layout, pinned: 0 };
  const copies = layout.objects.filter((o) => o.kind === kind && o.v === undefined);
  if (!copies.length) return { layout, pinned: 0 };

  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < layout.w && y < layout.h;
  const wallAt = (x: number, y: number) => !inside(x, y) || (layout.walls[y * layout.w + x] ?? NO_WALL) !== NO_WALL;
  // What stands on the floor and takes tiles, as it is now (copies of this item at their old size until they are decided).
  const floorRects = new Map<string, Rect>();
  for (const o of layout.objects) {
    const item = o.kind === kind && o.v === undefined ? prev : others(o.kind, o.v);
    if (!item || item.kind !== 'floor') continue;
    const [w, d] = rotFootprint(item.footprint, o.rot);
    floorRects.set(o.id, { x: o.x, y: o.y, w, d });
  }

  const fits = (o: PlacedObject): boolean => {
    if (prev.kind !== next.kind) return false; // a copy cannot change what it is
    if (losesSurface && layout.objects.some((q) => q.on === o.id)) return false; // keep the desk its items stand on
    if (next.kind === 'floor' || next.kind === 'floorart') {
      const [w, d] = rotFootprint(next.footprint, o.rot);
      for (let y = o.y; y < o.y + d; y++) for (let x = o.x; x < o.x + w; x++) if (wallAt(x, y)) return false;
      if (next.kind === 'floor') {
        const mine = { x: o.x, y: o.y, w, d };
        for (const [id, r] of floorRects) if (id !== o.id && overlaps(mine, r)) return false;
        if (next.blocks && o.x <= layout.spawn.x && layout.spawn.x < o.x + w && o.y <= layout.spawn.y && layout.spawn.y < o.y + d) return false;
      }
      return true;
    }
    if (next.kind === 'deskitem') {
      const host = layout.objects.find((h) => h.id === o.on);
      const hostItem = host && others(host.kind, host.v);
      if (!host || !hostItem || !o.at) return false;
      const [iw, id] = rotFootprint(next.footprint, o.rot);
      return o.at[0] + iw <= hostItem.footprint[0] + EPS && o.at[1] + id <= hostItem.footprint[1] + EPS;
    }
    return true; // wall decor: the face and the wall are the same whatever its size
  };

  let pinned = 0;
  const objects = layout.objects.map((o) => {
    if (o.kind !== kind || o.v !== undefined) return o;
    if (fits(o)) {
      if (next.kind === 'floor') {
        const [w, d] = rotFootprint(next.footprint, o.rot);
        floorRects.set(o.id, { x: o.x, y: o.y, w, d });
      }
      return o;
    }
    pinned++;
    return { ...o, v: prev.version };
  });
  return pinned ? { layout: { ...layout, objects }, pinned } : { layout, pinned: 0 };
}
