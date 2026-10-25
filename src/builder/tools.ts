// What a builder can do to a draft. Every function takes a layout and returns a new one (the old one is never
// changed, so undo can keep it), or says why the edit is not possible. No screen or network in here.
import { currentCatalog, prefabById, type Catalog } from '../../shared/catalog';
import {
  MAX_PODS, MAX_ROOMS, MAX_SIZE, MIN_SIZE, NAME_MAX, NO_WALL, cloneLayout, rotFootprint,
  type Layout, type PlacedObject, type Pod, type Rect, type Room, type Rot,
} from '../../shared/layout';

export type Edit = { ok: true; layout: Layout } | { ok: false; error: string };
export type Tile = [number, number];

const fail = (error: string): Edit => ({ ok: false, error });
const inside = (l: Layout, x: number, y: number) => x >= 0 && y >= 0 && x < l.w && y < l.h;
const setCell = (s: string, i: number, c: string) => s.slice(0, i) + c + s.slice(i + 1);

/** The tiles an object covers. */
export function coverOf(o: PlacedObject, catalog: Catalog = currentCatalog()): Tile[] {
  const [w, d] = rotFootprint(catalog.get(o.kind)?.footprint ?? [1, 1], o.rot);
  const out: Tile[] = [];
  for (let y = o.y; y < o.y + d; y++) for (let x = o.x; x < o.x + w; x++) out.push([x, y]);
  return out;
}

/** The object standing on a tile, if any. */
export function objectAt(l: Layout, x: number, y: number, catalog: Catalog = currentCatalog()): PlacedObject | undefined {
  for (let i = l.objects.length - 1; i >= 0; i--) {
    if (coverOf(l.objects[i], catalog).some(([cx, cy]) => cx === x && cy === y)) return l.objects[i];
  }
  return undefined;
}

/** Why `kind` turned `rot` can't stand with its top-left at (x, y), or null when it can. `ignore` is an object being moved. */
export function whyNotFit(l: Layout, kind: string, x: number, y: number, rot: number, ignore?: string, catalog: Catalog = currentCatalog()): string | null {
  const item = catalog.get(kind);
  if (!item) return 'That kind of furniture doesn’t exist.';
  const [w, d] = rotFootprint(item.footprint, rot);
  const taken = new Set<string>();
  for (const o of l.objects) if (o.id !== ignore) for (const [cx, cy] of coverOf(o, catalog)) taken.add(`${cx},${cy}`);
  for (let ty = y; ty < y + d; ty++) {
    for (let tx = x; tx < x + w; tx++) {
      if (!inside(l, tx, ty)) return 'That doesn’t fit inside the office.';
      const wc = l.walls[ty * l.w + tx];
      if (wc && wc !== NO_WALL) return 'There’s a wall in the way.';
      if (taken.has(`${tx},${ty}`)) return 'Something is already there.';
      if (item.blocks && tx === l.spawn.x && ty === l.spawn.y) return 'That’s where people appear.';
    }
  }
  return null;
}

export function paintFloor(l: Layout, tiles: Tile[], code: string): Layout {
  const c = cloneLayout(l);
  for (const [x, y] of tiles) if (inside(c, x, y)) c.floor = setCell(c.floor, y * c.w + x, code);
  return c;
}

/** Paints walls, or clears them with a space. Tiles with furniture on them, and the spawn tile, are left alone. */
export function paintWall(l: Layout, tiles: Tile[], code: string, catalog: Catalog = currentCatalog()): Layout {
  const c = cloneLayout(l);
  for (const [x, y] of tiles) {
    if (!inside(c, x, y) || (code !== NO_WALL && ((x === c.spawn.x && y === c.spawn.y) || objectAt(c, x, y, catalog)))) continue;
    c.walls = setCell(c.walls, y * c.w + x, code);
  }
  return c;
}

/** Takes away a wall; or, where there is none, whatever furniture stands there. */
export function erase(l: Layout, tiles: Tile[], catalog: Catalog = currentCatalog()): Layout {
  let c = cloneLayout(l);
  for (const [x, y] of tiles) {
    if (!inside(c, x, y)) continue;
    const wc = c.walls[y * c.w + x];
    if (wc && wc !== NO_WALL) c.walls = setCell(c.walls, y * c.w + x, NO_WALL);
    else {
      const o = objectAt(c, x, y, catalog);
      if (o) c = deleteObject(c, o.id);
    }
  }
  return c;
}

let counter = 0;
/** A fresh object id that no other object in the layout has. */
export function newId(l: Layout, kind: string): string {
  const base = kind.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'item';
  for (;;) {
    const id = `${base}-${(Date.now() + counter++).toString(36).slice(-6)}`;
    if (!l.objects.some((o) => o.id === id)) return id;
  }
}

export function placeObject(l: Layout, kind: string, x: number, y: number, rot: number, catalog: Catalog = currentCatalog()): Edit & { id?: string } {
  const why = whyNotFit(l, kind, x, y, rot, undefined, catalog);
  if (why) return fail(why);
  const c = cloneLayout(l);
  const id = newId(c, kind);
  c.objects.push({ id, kind, x, y, rot: (rot & 3) as Rot });
  return { ok: true, layout: c, id };
}

export function moveObject(l: Layout, id: string, x: number, y: number, catalog: Catalog = currentCatalog()): Edit {
  const o = l.objects.find((q) => q.id === id);
  if (!o) return fail('That isn’t there any more.');
  const why = whyNotFit(l, o.kind, x, y, o.rot, id, catalog);
  if (why) return fail(why);
  const c = cloneLayout(l);
  const m = c.objects.find((q) => q.id === id)!;
  m.x = x;
  m.y = y;
  return { ok: true, layout: c };
}

/** A quarter turn clockwise about the object's centre. */
export function rotateObject(l: Layout, id: string, catalog: Catalog = currentCatalog()): Edit {
  const o = l.objects.find((q) => q.id === id);
  if (!o) return fail('That isn’t there any more.');
  const fp = catalog.get(o.kind)?.footprint ?? [1, 1];
  const [w, d] = rotFootprint(fp, o.rot);
  const rot = ((o.rot + 1) & 3) as Rot;
  const [nw, nd] = rotFootprint(fp, rot);
  const x = Math.round(o.x + (w - 1) / 2 - (nw - 1) / 2);
  const y = Math.round(o.y + (d - 1) / 2 - (nd - 1) / 2);
  if (whyNotFit(l, o.kind, x, y, rot, id, catalog)) return fail('Not enough room to turn this here.');
  const c = cloneLayout(l);
  Object.assign(c.objects.find((q) => q.id === id)!, { x, y, rot });
  return { ok: true, layout: c };
}

export function deleteObject(l: Layout, id: string): Layout {
  const c = cloneLayout(l);
  c.objects = c.objects.filter((o) => o.id !== id);
  return c;
}

export function setSpawn(l: Layout, x: number, y: number, catalog: Catalog = currentCatalog()): Edit {
  if (!inside(l, x, y)) return fail('That’s outside the office.');
  const wc = l.walls[y * l.w + x];
  if (wc && wc !== NO_WALL) return fail('The spawn point can’t be on a wall.');
  const o = objectAt(l, x, y, catalog);
  if (o && catalog.get(o.kind)?.blocks) return fail('The spawn point can’t be on furniture.');
  const c = cloneLayout(l);
  c.spawn = { x, y };
  return { ok: true, layout: c };
}

/** Changes the grid size, keeping what fits. `cut` lists what no longer does, so the panel can ask first. */
export function resize(l: Layout, w: number, h: number, catalog: Catalog = currentCatalog()): { layout: Layout; cut: string[] } {
  w = Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(w)));
  h = Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(h)));
  const cut: string[] = [];
  let floor = '', walls = '';
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      floor += inside(l, x, y) ? l.floor[y * l.w + x] : '.';
      walls += inside(l, x, y) ? l.walls[y * l.w + x] : NO_WALL;
    }
  }
  const c: Layout = { ...cloneLayout(l), w, h, floor, walls };
  c.objects = c.objects.filter((o) => {
    const fits = coverOf(o, catalog).every(([x, y]) => x < w && y < h);
    if (!fits) cut.push(`${catalog.get(o.kind)?.name ?? o.kind} at ${o.x},${o.y}`);
    return fits;
  });
  const clampRects = <T extends { name: string; rects: [number, number, number, number][] }>(items: T[]) =>
    items.filter((it) => {
      const lost = it.rects.some(([, , x1, y1]) => x1 >= w || y1 >= h);
      it.rects = it.rects
        .filter(([x0, y0]) => x0 < w && y0 < h)
        .map(([x0, y0, x1, y1]) => [x0, y0, Math.min(x1, w - 1), Math.min(y1, h - 1)] as [number, number, number, number]);
      if (lost) cut.push(`${it.name} (part of it)`);
      return it.rects.length > 0;
    });
  c.rooms = clampRects(c.rooms);
  c.pods = clampRects(c.pods);
  if (c.spawn.x >= w || c.spawn.y >= h) {
    c.spawn = { x: Math.min(c.spawn.x, w - 1), y: Math.min(c.spawn.y, h - 1) };
    cut.push('the spawn point');
  }
  return { layout: c, cut };
}

// ------------------------------------------------------------ rooms and pods

export type RegionKind = 'room' | 'pod';

const key = (x: number, y: number) => `${x},${y}`;

/** The tiles of some rectangles. */
function tileSet(rects: Rect[]): Set<string> {
  const set = new Set<string>();
  for (const [x0, y0, x1, y1] of rects) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set.add(key(x, y));
  return set;
}

/** Fewest rectangles that cover a set of tiles: runs along each row, then runs with the same span on rows below joined up. */
export function rectsFromTiles(tiles: ReadonlySet<string>): Rect[] {
  const rows = new Map<number, number[]>();
  for (const t of tiles) {
    const [x, y] = t.split(',').map(Number);
    rows.set(y, [...(rows.get(y) ?? []), x]);
  }
  const open = new Map<string, Rect>(); // span "x0-x1" -> the rectangle still growing downward
  const done: Rect[] = [];
  let prevY = -Infinity;
  for (const y of [...rows.keys()].sort((a, b) => a - b)) {
    const xs = rows.get(y)!.sort((a, b) => a - b);
    const spans: [number, number][] = [];
    for (const x of xs) {
      const last = spans[spans.length - 1];
      if (last && last[1] === x - 1) last[1] = x;
      else spans.push([x, x]);
    }
    const next = new Map<string, Rect>();
    for (const [x0, x1] of spans) {
      const k = `${x0}-${x1}`;
      const grow = y === prevY + 1 ? open.get(k) : undefined;
      if (grow) {
        grow[3] = y;
        next.set(k, grow);
        open.delete(k);
      } else next.set(k, [x0, y, x1, y]);
    }
    done.push(...open.values());
    open.clear();
    for (const [k, r] of next) open.set(k, r);
    prevY = y;
  }
  done.push(...open.values());
  return done.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

const regions = (l: Layout, kind: RegionKind): (Room | Pod)[] => (kind === 'room' ? l.rooms : l.pods);

let regionCounter = 0;
function newRegionId(l: Layout, kind: RegionKind) {
  for (;;) {
    const id = `${kind}-${(Date.now() + regionCounter++).toString(36).slice(-6)}`;
    if (!regions(l, kind).some((r) => r.id === id)) return id;
  }
}

const cleanName = (n: string) => n.trim().slice(0, NAME_MAX);

/** A new, empty room or pod. Paint tiles into it afterwards. */
export function newRegion(l: Layout, kind: RegionKind, name: string, opts: { private?: boolean } = {}): Edit & { id?: string } {
  if (regions(l, kind).length >= (kind === 'room' ? MAX_ROOMS : MAX_PODS)) return fail(`An office can have at most ${kind === 'room' ? MAX_ROOMS : MAX_PODS} ${kind}s.`);
  const c = cloneLayout(l);
  const id = newRegionId(c, kind);
  const nm = cleanName(name) || (kind === 'room' ? 'New room' : 'New pod');
  if (kind === 'room') c.rooms.push({ id, name: nm, private: !!opts.private, rects: [], restricted: false, allowed: [], highlight: !!opts.private });
  else c.pods.push({ id, name: nm, rects: [], mode: 'ambient' });
  return { ok: true, layout: c, id };
}

/** Adds tiles to a room or pod. A tile can belong to one room of each kind (private or open) and to one pod. */
export function paintRegion(l: Layout, kind: RegionKind, id: string, tiles: Tile[]): Edit {
  const target = regions(l, kind).find((r) => r.id === id);
  if (!target) return fail('Pick or create one first.');
  const c = cloneLayout(l);
  const mine = regions(c, kind).find((r) => r.id === id)!;
  const set = tileSet(mine.rects);
  const others = regions(c, kind).filter((r) => r.id !== id && (kind === 'pod' || (r as Room).private === (mine as Room).private));
  const taken = new Set<string>();
  for (const o of others) for (const t of tileSet(o.rects)) taken.add(t);
  let refused = false;
  for (const [x, y] of tiles) {
    if (!inside(c, x, y)) continue;
    if (taken.has(key(x, y))) refused = true;
    else set.add(key(x, y));
  }
  mine.rects = rectsFromTiles(set);
  if (refused && set.size === tileSet(target.rects).size) return fail(`That belongs to another ${kind === 'pod' ? 'pod' : (mine as Room).private ? 'private room' : 'area'}.`);
  return { ok: true, layout: c };
}

/** Takes tiles out of every room or pod of that kind; one left with no tiles is removed. */
export function unpaintRegion(l: Layout, kind: RegionKind, tiles: Tile[], only?: string): Layout {
  const c = cloneLayout(l);
  const gone = new Set(tiles.map(([x, y]) => key(x, y)));
  const list = regions(c, kind);
  for (const r of list) {
    if (only && r.id !== only) continue;
    const set = tileSet(r.rects);
    let changed = false;
    for (const g of gone) changed = set.delete(g) || changed;
    if (changed) r.rects = rectsFromTiles(set);
  }
  return c;
}

export function deleteRegion(l: Layout, kind: RegionKind, id: string): Layout {
  const c = cloneLayout(l);
  if (kind === 'room') c.rooms = c.rooms.filter((r) => r.id !== id);
  else c.pods = c.pods.filter((p) => p.id !== id);
  return c;
}

export interface RoomPatch { name?: string; private?: boolean; capacity?: number | null; restricted?: boolean }

export function updateRoom(l: Layout, id: string, patch: RoomPatch): Edit {
  const c = cloneLayout(l);
  const r = c.rooms.find((q) => q.id === id);
  if (!r) return fail('That room is gone.');
  if (patch.name !== undefined) r.name = cleanName(patch.name);
  if (patch.private !== undefined) {
    r.private = patch.private;
    r.highlight = patch.private;
  }
  if (patch.restricted !== undefined) r.restricted = patch.restricted;
  if (patch.capacity !== undefined) {
    if (patch.capacity === null || !Number.isFinite(patch.capacity)) delete r.capacity;
    else r.capacity = Math.min(50, Math.max(1, Math.round(patch.capacity)));
  }
  return { ok: true, layout: c };
}

export function updatePod(l: Layout, id: string, patch: { name?: string; mode?: 'ambient' | 'cubicle' }): Edit {
  const c = cloneLayout(l);
  const p = c.pods.find((q) => q.id === id);
  if (!p) return fail('That pod is gone.');
  if (patch.name !== undefined) p.name = cleanName(patch.name);
  if (patch.mode === 'ambient' || patch.mode === 'cubicle') p.mode = patch.mode;
  return { ok: true, layout: c };
}

/** The region of a kind that covers a tile: private rooms first, as in the world. */
export function regionAt(l: Layout, kind: RegionKind, x: number, y: number): Room | Pod | undefined {
  const list = [...regions(l, kind)].sort((a, b) => +!!(b as Room).private - +!!(a as Room).private);
  return list.find((r) => r.rects.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1));
}

/** Why a prefab can't go with its corner at (x, y), or null. */
export function whyNotPrefab(l: Layout, prefabId: string, x: number, y: number): string | null {
  const p = prefabById(prefabId);
  if (!p) return 'That ready-made room doesn\u2019t exist.';
  if (x < 0 || y < 0 || x + p.size[0] > l.w || y + p.size[1] > l.h) return 'That doesn\u2019t fit inside the office.';
  if (p.pod) {
    const mine = tileSet([[x, y, x + p.size[0] - 1, y + p.size[1] - 1]]);
    for (const other of l.pods) for (const t of tileSet(other.rects)) if (mine.has(t)) return 'That overlaps another desk pod.';
  }
  if (p.room?.private) {
    const r = p.room.rect ?? [0, 0, p.size[0] - 1, p.size[1] - 1];
    const mine = tileSet([[x + r[0], y + r[1], x + r[2], y + r[3]]]);
    for (const other of l.rooms) if (other.private) for (const t of tileSet(other.rects)) if (mine.has(t)) return 'That overlaps another private room.';
  }
  return null;
}

/** Puts a ready-made room or pod down with its corner at (x, y). Everything it adds can be edited afterwards. */
export function placePrefab(l: Layout, prefabId: string, x: number, y: number, catalog: Catalog = currentCatalog()): Edit {
  const p = prefabById(prefabId);
  const why = whyNotPrefab(l, prefabId, x, y);
  if (!p || why) return fail(why ?? 'That ready-made room doesn\u2019t exist.');
  let c = cloneLayout(l);
  // Whatever stood where it goes is cleared first, so the new furniture never overlaps old.
  const inRect = (tx: number, ty: number) => tx >= x && ty >= y && tx < x + p.size[0] && ty < y + p.size[1];
  c.objects = c.objects.filter((o) => !coverOf(o, catalog).some(([tx, ty]) => inRect(tx, ty)));
  for (let dy = 0; dy < p.size[1]; dy++) {
    for (let dx = 0; dx < p.size[0]; dx++) {
      const f = p.floor?.[dy]?.[dx], w = p.walls?.[dy]?.[dx];
      const i = (y + dy) * c.w + x + dx;
      if (f && f !== ' ') c.floor = setCell(c.floor, i, f);
      if (p.walls) c.walls = setCell(c.walls, i, w ?? NO_WALL);
    }
  }
  for (const o of p.objects) {
    const placed = placeObject(c, o.kind, x + o.dx, y + o.dy, o.rot, catalog);
    if (!placed.ok) return fail(placed.error);
    c = placed.layout;
  }
  if (p.room) {
    const made = newRegion(c, 'room', p.room.name, { private: p.room.private });
    if (!made.ok) return made;
    c = made.layout;
    const r = p.room.rect ?? [0, 0, p.size[0] - 1, p.size[1] - 1];
    c.rooms[c.rooms.length - 1].rects = [[x + r[0], y + r[1], x + r[2], y + r[3]]];
  }
  if (p.pod) {
    const made = newRegion(c, 'pod', p.pod.name);
    if (!made.ok) return made;
    c = made.layout;
    const last = c.pods[c.pods.length - 1];
    last.mode = p.pod.mode;
    last.rects = [[x, y, x + p.size[0] - 1, y + p.size[1] - 1]];
  }
  return { ok: true, layout: c };
}
