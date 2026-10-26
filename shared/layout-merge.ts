// Three-way merge of two edits made from the same starting layout. A change made on one side only is kept; the same
// change on both sides is fine; different changes to the same unit are a clash the builder has to settle.
// Units: one floor tile, one wall tile, one object, one room, one pod, the spawn point, and the grid size.
import { currentCatalog, footprintOf, type Catalog } from './catalog';
import { NO_WALL, normalizeLayout, type Layout, type PlacedObject, type Pod, type Rect, type Room } from './layout';

export interface Clash {
  /** `floor:x,y`, `wall:x,y`, `obj:<id>`, `room:<id>`, `pod:<id>`, `spawn` or `size`. */
  key: string;
  /** Tiles to mark on the map. */
  tiles: [number, number][];
}

export type Side = 'mine' | 'theirs';

const stable = (v: unknown): string =>
  JSON.stringify(v, (_, x) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)))
      : x);

/** Every unit of a layout as key -> value text. */
function units(l: Layout): Map<string, string> {
  const m = new Map<string, string>();
  m.set('size', `${l.w}x${l.h}`);
  m.set('spawn', `${l.spawn.x},${l.spawn.y}`);
  for (let y = 0; y < l.h; y++) {
    for (let x = 0; x < l.w; x++) {
      m.set(`floor:${x},${y}`, l.floor[y * l.w + x]);
      m.set(`wall:${x},${y}`, l.walls[y * l.w + x]);
    }
  }
  for (const o of l.objects) m.set(`obj:${o.id}`, stable([o.kind, o.x, o.y, o.rot, o.v ?? null, o.on ?? null, o.at ?? null, o.wall ?? null]));
  for (const r of l.rooms) m.set(`room:${r.id}`, stable(r));
  for (const p of l.pods) m.set(`pod:${p.id}`, stable(p));
  return m;
}

function tilesOf(key: string, ...layouts: Layout[]): [number, number][] {
  const out = new Map<string, [number, number]>();
  const add = (x: number, y: number) => out.set(`${x},${y}`, [x, y]);
  const [kind, id] = [key.slice(0, key.indexOf(':') < 0 ? key.length : key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
  for (const l of layouts) {
    if (kind === 'floor' || kind === 'wall') {
      const [x, y] = id.split(',').map(Number);
      add(x, y);
    } else if (kind === 'spawn') add(l.spawn.x, l.spawn.y);
    else if (kind === 'obj') {
      const o = l.objects.find((q) => q.id === id);
      if (o) {
        const [fw, fd] = footprintOf(o.kind, o.rot);
        for (let y = o.y; y < o.y + fd; y++) for (let x = o.x; x < o.x + fw; x++) add(x, y);
      }
    } else if (kind === 'room' || kind === 'pod') {
      const rects: Rect[] = (kind === 'room' ? l.rooms : l.pods).find((q) => q.id === id)?.rects ?? [];
      for (const [x0, y0, x1, y1] of rects) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (out.size < 400) add(x, y);
    }
  }
  return [...out.values()];
}

/**
 * Merges `mine` into `theirs`, both edited from `base`. With no `base` (it has dropped out of history), every unit that
 * differs is a clash. `resolve` settles clashes by key. Unsettled clashes keep their value from `theirs` in `merged`.
 */
export function mergeLayouts(
  base: Layout | null,
  theirs: Layout,
  mine: Layout,
  resolve: Record<string, Side> = {},
  catalog: Catalog = currentCatalog(),
): { merged: Layout; clashes: Clash[] } {
  const b = base ? units(base) : null, t = units(theirs), m = units(mine);
  const result = new Map<string, string | undefined>();
  const clashes: Clash[] = [];

  const keys = new Set([...t.keys(), ...m.keys(), ...(b?.keys() ?? [])]);
  for (const k of keys) {
    const tv = t.get(k), mv = m.get(k);
    if (tv === mv) result.set(k, tv);
    else if (b && tv === b.get(k)) result.set(k, mv);
    else if (b && mv === b.get(k)) result.set(k, tv);
    else if (resolve[k] === 'mine') result.set(k, mv);
    else if (resolve[k] === 'theirs') result.set(k, tv);
    else {
      result.set(k, tv);
      clashes.push({ key: k, tiles: tilesOf(k, theirs, mine) });
    }
  }

  const size = (result.get('size') ?? `${theirs.w}x${theirs.h}`).split('x').map(Number);
  const [w, h] = size;
  let floor = '', walls = '';
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      floor += result.get(`floor:${x},${y}`) ?? '.';
      walls += result.get(`wall:${x},${y}`) ?? NO_WALL;
    }
  }
  const sp = (result.get('spawn') ?? `${theirs.spawn.x},${theirs.spawn.y}`).split(',').map(Number);

  const ordered = <T extends { id: string }>(a: T[], c: T[]) => [...a, ...c.filter((x) => !a.some((y) => y.id === x.id))];
  const objects: PlacedObject[] = [];
  for (const o of ordered(theirs.objects, mine.objects)) {
    const v = result.get(`obj:${o.id}`);
    if (v === undefined) continue;
    const [kind, x, y, rot, pin, on, at, wall] = JSON.parse(v);
    objects.push({ id: o.id, kind, x, y, rot, ...(pin === null ? {} : { v: pin }), ...(on === null ? {} : { on }), ...(at === null ? {} : { at }), ...(wall === null ? {} : { wall }) });
  }
  const pick = <T extends { id: string }>(prefix: string, a: T[]) => {
    const out: T[] = [];
    for (const item of a) {
      const v = result.get(`${prefix}:${item.id}`);
      if (v !== undefined) out.push(JSON.parse(v));
    }
    return out;
  };
  // A desk item whose desk the other person deleted goes with it, and so on: the merged layout is made consistent.
  const merged: Layout = {
    w, h, floor, walls, objects,
    rooms: pick<Room>('room', ordered(theirs.rooms, mine.rooms)),
    pods: pick<Pod>('pod', ordered(theirs.pods, mine.pods)),
    spawn: { x: sp[0], y: sp[1] },
  };
  return { merged: normalizeLayout(merged, catalog).layout, clashes };
}
