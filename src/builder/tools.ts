// What a builder can do to a draft. Every function takes a layout and returns a new one (the old one is never
// changed, so undo can keep it), or says why the edit is not possible. No screen or network in here.
import { currentCatalog, prefabById, type Catalog } from '../../shared/catalog';
import {
  FACE_STEP, MAX_ON_DESK_TILE, MAX_ON_WALL_FACE, MAX_PODS, MAX_ROOMS, MAX_SIZE, MIN_SIZE, NAME_MAX, NO_WALL, cloneLayout,
  deskTileOf, normalizeLayout, rotFootprint, unturnPoint,
  type Face, type Layout, type PlacedObject, type Pod, type Rect, type Room, type Rot,
} from '../../shared/layout';
import { compileWorld } from '../../shared/world';

export type Edit = { ok: true; layout: Layout } | { ok: false; error: string };
export type Tile = [number, number];

const fail = (error: string): Edit => ({ ok: false, error });
const inside = (l: Layout, x: number, y: number) => x >= 0 && y >= 0 && x < l.w && y < l.h;
const setCell = (s: string, i: number, c: string) => s.slice(0, i) + c + s.slice(i + 1);

const kindOf = (o: PlacedObject, catalog: Catalog) => catalog.get(o.kind)?.kind;

/** A layout made consistent after an edit: what lost its desk, wall or item is gone, and what is over the limits. */
const tidy = (l: Layout, catalog: Catalog): Layout => normalizeLayout(l, catalog).layout;

const tilesOfRect = (x: number, y: number, w: number, d: number): Tile[] => {
  const out: Tile[] = [];
  for (let ty = y; ty < y + d; ty++) for (let tx = x; tx < x + w; tx++) out.push([tx, ty]);
  return out;
};

/** The tiles an object that stands on the floor takes. Desk items, wall decor and floor art take none. */
export function coverOf(o: PlacedObject, catalog: Catalog = currentCatalog()): Tile[] {
  if (kindOf(o, catalog) !== 'floor') return [];
  const [w, d] = rotFootprint(catalog.get(o.kind)?.footprint ?? [1, 1], o.rot);
  return tilesOfRect(o.x, o.y, w, d);
}

/** The tiles a piece of floor art lies on. */
export function artTiles(o: PlacedObject, catalog: Catalog = currentCatalog()): Tile[] {
  const [w, d] = rotFootprint(catalog.get(o.kind)?.footprint ?? [1, 1], o.rot);
  return tilesOfRect(o.x, o.y, w, d);
}

/** The object standing on a tile, if any (floor objects only). */
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
  if (item.kind === 'deskitem') return 'Desk items go on a desk.';
  if (item.kind === 'wall') return 'Hang this on a wall.';
  const [w, d] = rotFootprint(item.footprint, rot);
  const taken = new Set<string>();
  // Only things that stand on the floor take room: a chair can stand on a rug.
  if (item.kind === 'floor') for (const o of l.objects) if (o.id !== ignore) for (const [cx, cy] of coverOf(o, catalog)) taken.add(`${cx},${cy}`);
  for (let ty = y; ty < y + d; ty++) {
    for (let tx = x; tx < x + w; tx++) {
      if (!inside(l, tx, ty)) return 'That doesn’t fit inside the office.';
      const wc = l.walls[ty * l.w + tx];
      if (wc && wc !== NO_WALL) return 'There’s a wall in the way.';
      if (taken.has(`${tx},${ty}`)) return 'Something is already there.';
      if (item.kind === 'floor' && item.blocks && tx === l.spawn.x && ty === l.spawn.y) return 'That’s where people appear.';
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
  return tidy(c, catalog); // painting a wall away takes the decor on it too
}

/**
 * Takes away what is on a tile, one thing at a time: a wall first (and the decor on it), then what stands on the floor,
 * then desk items, then floor art, the newest first.
 */
export function erase(l: Layout, tiles: Tile[], catalog: Catalog = currentCatalog()): Layout {
  let c = cloneLayout(l);
  for (const [x, y] of tiles) {
    if (!inside(c, x, y)) continue;
    const wc = c.walls[y * c.w + x];
    if (wc && wc !== NO_WALL) {
      c.walls = setCell(c.walls, y * c.w + x, NO_WALL);
      c = tidy(c, catalog);
      continue;
    }
    const o = objectAt(c, x, y, catalog);
    if (o) {
      c = deleteObject(c, o.id, catalog);
      continue;
    }
    const world = compileWorld(c, catalog);
    const onTile = (px: number, py: number, w: number, d: number) => x + 0.5 > px && x + 0.5 < px + w && y + 0.5 > py && y + 0.5 < py + d;
    const desk = [...world.deskItems].reverse().find((i) => onTile(i.x, i.y, i.w, i.d));
    if (desk) {
      c = deleteObject(c, desk.obj.id, catalog);
      continue;
    }
    const art = [...world.floorArt].reverse().find((a) => x >= a.x && y >= a.y && x < a.x + a.w && y < a.y + a.d);
    if (art) c = deleteObject(c, art.obj.id, catalog);
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

/** Places something that stands on the floor, or floor art. Desk items and wall decor have their own functions. */
export function placeObject(l: Layout, kind: string, x: number, y: number, rot: number, catalog: Catalog = currentCatalog()): Edit & { id?: string } {
  const why = whyNotFit(l, kind, x, y, rot, undefined, catalog);
  if (why) return fail(why);
  const c = cloneLayout(l);
  const id = newId(c, kind);
  c.objects.push({ id, kind, x, y, rot: (rot & 3) as Rot });
  return { ok: true, layout: c, id };
}

const snap05 = (n: number) => Math.round(n * 20) / 20;

/** The floor object at a world point that desk items can stand on (an original desk, or an item in group Desks), if any. */
export function hostAt(l: Layout, wx: number, wy: number, catalog: Catalog = currentCatalog()): PlacedObject | undefined {
  for (let i = l.objects.length - 1; i >= 0; i--) {
    const o = l.objects[i];
    const item = catalog.get(o.kind);
    if (!item || item.kind !== 'floor' || item.surface === undefined) continue;
    const [w, d] = rotFootprint(item.footprint, o.rot);
    if (wx >= o.x && wx < o.x + w && wy >= o.y && wy < o.y + d) return o;
  }
  return undefined;
}

/** Where on `host` an item whose centre is at the world point goes, as `at` in the host's frame and the item's turn relative to the host. */
function deskPose(host: PlacedObject, itemFootprint: readonly [number, number], wx: number, wy: number, worldRot: number, catalog: Catalog) {
  const [hw, hd] = catalog.get(host.kind)!.footprint;
  const rel = (((worldRot - host.rot) % 4) + 4) % 4 as Rot;
  const [iw, id] = rotFootprint(itemFootprint, rel);
  const [lx, ly] = unturnPoint(wx - host.x, wy - host.y, hw, hd, host.rot);
  const at: [number, number] = [
    snap05(Math.min(Math.max(lx - iw / 2, 0), Math.max(0, hw - iw))),
    snap05(Math.min(Math.max(ly - id / 2, 0), Math.max(0, hd - id))),
  ];
  return { at, rel, tile: deskTileOf(hw, hd, at, iw, id) };
}

const deskCount = (l: Layout, hostId: string, tile: [number, number], except: string | undefined, catalog: Catalog) =>
  l.objects.filter((o) => {
    if (o.id === except || o.on !== hostId || !o.at) return false;
    const item = catalog.get(o.kind), host = l.objects.find((h) => h.id === hostId);
    if (!item || !host) return false;
    const [hw, hd] = catalog.get(host.kind)!.footprint;
    const [iw, id] = rotFootprint(item.footprint, o.rot);
    const t = deskTileOf(hw, hd, o.at, iw, id);
    return t[0] === tile[0] && t[1] === tile[1];
  }).length;

/** Puts a desk item with its centre at the world point (tiles, fractions allowed), turned `rot` in the world. */
export function placeDeskItem(l: Layout, kind: string, wx: number, wy: number, rot: number, catalog: Catalog = currentCatalog()): Edit & { id?: string } {
  const item = catalog.get(kind);
  if (!item || item.kind !== 'deskitem') return fail('That isn’t a desk item.');
  const host = hostAt(l, wx, wy, catalog);
  if (!host) return fail('Desk items go on a desk.');
  const { at, rel, tile } = deskPose(host, item.footprint, wx, wy, rot, catalog);
  if (deskCount(l, host.id, tile, undefined, catalog) >= MAX_ON_DESK_TILE) return fail('That desk tile is full.');
  const c = cloneLayout(l);
  const id = newId(c, kind);
  c.objects.push({ id, kind, x: 0, y: 0, rot: rel, on: host.id, at });
  return { ok: true, layout: c, id };
}

/** Moves a desk item to the world point (it may go to another desk), keeping the way it faces in the world. */
export function moveDeskItem(l: Layout, id: string, wx: number, wy: number, catalog: Catalog = currentCatalog()): Edit {
  const o = l.objects.find((q) => q.id === id);
  const item = o && catalog.get(o.kind);
  if (!o || !item || item.kind !== 'deskitem') return fail('That isn’t there any more.');
  const oldHost = o.on ? l.objects.find((q) => q.id === o.on) : undefined;
  const worldRot = ((oldHost?.rot ?? 0) + o.rot) & 3;
  const host = hostAt(l, wx, wy, catalog);
  if (!host) return fail('Desk items go on a desk.');
  const { at, rel, tile } = deskPose(host, item.footprint, wx, wy, worldRot, catalog);
  if (deskCount(l, host.id, tile, id, catalog) >= MAX_ON_DESK_TILE) return fail('That desk tile is full.');
  const c = cloneLayout(l);
  Object.assign(c.objects.find((q) => q.id === id)!, { on: host.id, at, rot: rel });
  return { ok: true, layout: c };
}

/** Which face of the wall tile (tx, ty), with the pointer at (fx, fy) within it from 0 to 1, a piece of wall decor would hang on; null if the tile has no free face. */
export function wallFaceAt(l: Layout, tx: number, ty: number, fx: number, fy: number): Face | null {
  if (!inside(l, tx, ty) || l.walls[ty * l.w + tx] === NO_WALL) return null;
  const open = (f: Face) => {
    const [dx, dy] = FACE_STEP[f];
    const nx = tx + dx, ny = ty + dy;
    return inside(l, nx, ny) && l.walls[ny * l.w + nx] === NO_WALL;
  };
  const dist: Record<Face, number> = { n: fy, s: 1 - fy, w: fx, e: 1 - fx };
  const faces = (['n', 's', 'w', 'e'] as Face[]).filter(open).sort((a, b) => dist[a] - dist[b]);
  return faces[0] ?? null;
}

const faceCount = (l: Layout, tx: number, ty: number, face: Face, except?: string) =>
  l.objects.filter((o) => o.id !== except && o.wall === face && o.x === tx && o.y === ty).length;

/** Hangs wall decor on a face of the wall tile (tx, ty). */
export function placeWallDecor(l: Layout, kind: string, tx: number, ty: number, face: Face | null, catalog: Catalog = currentCatalog()): Edit & { id?: string } {
  const item = catalog.get(kind);
  if (!item || item.kind !== 'wall') return fail('That isn’t wall decor.');
  if (!face) return fail('Hang this on a wall.');
  const [dx, dy] = FACE_STEP[face];
  if (!inside(l, tx, ty) || l.walls[ty * l.w + tx] === NO_WALL || !inside(l, tx + dx, ty + dy) || l.walls[(ty + dy) * l.w + tx + dx] !== NO_WALL) return fail('Hang this on a wall.');
  if (faceCount(l, tx, ty, face) >= MAX_ON_WALL_FACE) return fail('That wall is full.');
  const c = cloneLayout(l);
  const id = newId(c, kind);
  c.objects.push({ id, kind, x: tx, y: ty, rot: 0, wall: face });
  return { ok: true, layout: c, id };
}

/** Moves wall decor to a face of another (or the same) wall tile. */
export function moveWallDecor(l: Layout, id: string, tx: number, ty: number, face: Face | null, catalog: Catalog = currentCatalog()): Edit {
  const o = l.objects.find((q) => q.id === id);
  if (!o || catalog.get(o.kind)?.kind !== 'wall') return fail('That isn’t there any more.');
  if (!face) return fail('Hang this on a wall.');
  const [dx, dy] = FACE_STEP[face];
  if (!inside(l, tx, ty) || l.walls[ty * l.w + tx] === NO_WALL || !inside(l, tx + dx, ty + dy) || l.walls[(ty + dy) * l.w + tx + dx] !== NO_WALL) return fail('Hang this on a wall.');
  if (faceCount(l, tx, ty, face, id) >= MAX_ON_WALL_FACE) return fail('That wall is full.');
  const c = cloneLayout(l);
  Object.assign(c.objects.find((q) => q.id === id)!, { x: tx, y: ty, wall: face });
  return { ok: true, layout: c };
}

/** What a click at a world point (tiles) picks: desk items first, then wall decor, then what stands on the floor, then floor art. */
export function hitTest(l: Layout, wx: number, wy: number, catalog: Catalog = currentCatalog()): PlacedObject | undefined {
  const world = compileWorld(l, catalog);
  const desk = [...world.deskItems].reverse().find((i) => wx >= i.x && wx < i.x + i.w && wy >= i.y && wy < i.y + i.d);
  if (desk) return desk.obj;
  const tx = Math.floor(wx), ty = Math.floor(wy);
  const face = wallFaceAt(l, tx, ty, wx - tx, wy - ty);
  const decor = world.wallDecor.filter((d) => d.x === tx && d.y === ty);
  if (decor.length) return (decor.find((d) => d.face === face) ?? decor[decor.length - 1]).obj;
  const floor = objectAt(l, tx, ty, catalog);
  if (floor) return floor;
  const art = [...world.floorArt].reverse().find((a) => tx >= a.x && ty >= a.y && tx < a.x + a.w && ty < a.y + a.d);
  return art?.obj;
}

/** Moves something that stands on the floor, or floor art, so its top-left corner is at (x, y). */
export function moveObject(l: Layout, id: string, x: number, y: number, catalog: Catalog = currentCatalog()): Edit {
  const o = l.objects.find((q) => q.id === id);
  if (!o) return fail('That isn’t there any more.');
  const why = whyNotFit(l, o.kind, x, y, o.rot, id, catalog);
  if (why) return fail(why);
  const c = cloneLayout(l);
  const m = c.objects.find((q) => q.id === id)!;
  m.x = x;
  m.y = y;
  return { ok: true, layout: tidy(c, catalog) }; // a desk takes its items with it, by id: nothing else to move
}

/** A quarter turn clockwise about the object's centre. */
export function rotateObject(l: Layout, id: string, catalog: Catalog = currentCatalog()): Edit {
  const o = l.objects.find((q) => q.id === id);
  if (!o) return fail('That isn’t there any more.');
  const kind = catalog.get(o.kind)?.kind;
  if (kind === 'wall') return fail('Wall decor can’t be turned.');
  if (kind === 'deskitem') {
    // A quarter turn about its own centre, staying where it is on the desk.
    const item = catalog.get(o.kind)!;
    const host = o.on ? l.objects.find((q) => q.id === o.on) : undefined;
    if (!host || !o.at) return fail('That isn’t on a desk.');
    const [iw, id2] = rotFootprint(item.footprint, o.rot);
    const rot2 = ((o.rot + 1) & 3) as Rot;
    const [nw, nd] = rotFootprint(item.footprint, rot2);
    const c = cloneLayout(l);
    Object.assign(c.objects.find((q) => q.id === id)!, { rot: rot2, at: [snap05(o.at[0] + iw / 2 - nw / 2), snap05(o.at[1] + id2 / 2 - nd / 2)] });
    return { ok: true, layout: tidy(c, catalog) };
  }
  const fp = catalog.get(o.kind)?.footprint ?? [1, 1];
  const [w, d] = rotFootprint(fp, o.rot);
  const rot = ((o.rot + 1) & 3) as Rot;
  const [nw, nd] = rotFootprint(fp, rot);
  const x = Math.round(o.x + (w - 1) / 2 - (nw - 1) / 2);
  const y = Math.round(o.y + (d - 1) / 2 - (nd - 1) / 2);
  if (whyNotFit(l, o.kind, x, y, rot, id, catalog)) return fail('Not enough room to turn this here.');
  const c = cloneLayout(l);
  Object.assign(c.objects.find((q) => q.id === id)!, { x, y, rot });
  return { ok: true, layout: tidy(c, catalog) };
}

/** Removes an object. A desk takes the things on it with it. */
export function deleteObject(l: Layout, id: string, catalog: Catalog = currentCatalog()): Layout {
  const c = cloneLayout(l);
  c.objects = c.objects.filter((o) => o.id !== id);
  return tidy(c, catalog);
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
    const kind = catalog.get(o.kind)?.kind;
    const tiles = kind === 'floorart' ? artTiles(o, catalog) : kind === 'wall' ? [[o.x, o.y] as Tile] : coverOf(o, catalog);
    const fits = tiles.every(([x, y]) => x < w && y < h);
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
