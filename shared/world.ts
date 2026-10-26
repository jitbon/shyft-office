// Turns a Layout into the lookup data every rule reads: the tile grid, areas, pods, desks and the spawn point.
// Pure, so the server, both renderers and the tests all get the same world from the same layout.
import { currentCatalog, itemAt, type Catalog, type CatalogItem } from './catalog';
import { NO_WALL, rotFootprint, turnPoint, type Face, type Layout, type PlacedObject, type Pod, type Rect, type Rot, type Room } from './layout';

export type Area = Room;
export type DeskPod = Pod;
export type PodMode = Pod['mode'];

export interface Desk {
  /** The desk object's id. It stays the same when the desk is moved or turned. */
  id: string;
  podId: string;
  /** The chair tile. */
  seat: { x: number; y: number };
  /** Seat, the desk surface, and a one-tile ring of walkable floor. Desks never share a tile. */
  tiles: { x: number; y: number }[];
}

/** A placed object with its catalog item and the tiles it covers after turning. */
export interface WorldObject {
  obj: PlacedObject;
  item: CatalogItem;
  x: number;
  y: number;
  /** Footprint after turning. */
  w: number;
  d: number;
}

/** A flat piece laid on the floor, under everything. */
export interface FloorArtPiece {
  obj: PlacedObject;
  item: CatalogItem;
  /** Top-left tile of the footprint after turning, and its size. */
  x: number;
  y: number;
  w: number;
  d: number;
  rot: Rot;
}

/** A small item standing on a desk. `x`, `y` is the top-left corner of its footprint in the world, in tiles. */
export interface DeskItemPiece {
  obj: PlacedObject;
  item: CatalogItem;
  host: WorldObject;
  x: number;
  y: number;
  w: number;
  d: number;
  /** The world facing: the host's turn plus the item's own. */
  rot: Rot;
  /** Height of the desk top it stands on. */
  z: number;
}

/** Something hanging on one face of a wall tile. */
export interface WallDecorPiece {
  obj: PlacedObject;
  item: CatalogItem;
  x: number;
  y: number;
  face: Face;
}

export interface World {
  w: number;
  h: number;
  /** One string per row; the same alphabet the maps always used. */
  grid: string[];
  /** The floor code under every tile, row by row. */
  floor: string[];
  /** 1 where nobody can walk. */
  block: Uint8Array;
  areas: Area[];
  pods: DeskPod[];
  desks: Desk[];
  /** Tile centre. */
  spawn: { x: number; y: number };
  /** The objects that stand on the floor and take tiles. Desk items, wall decor and floor art are listed apart. */
  objects: WorldObject[];
  deskItems: DeskItemPiece[];
  wallDecor: WallDecorPiece[];
  floorArt: FloorArtPiece[];
  layout: Layout;
}

const keyOf = (x: number, y: number) => `${x},${y}`;
const inRect = (x: number, y: number, [x0, y0, x1, y1]: Rect) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

export function compileWorld(layout: Layout, catalog: Catalog = currentCatalog()): World {
  const { w, h } = layout;
  const cells: string[] = Array.from(layout.floor);
  const floor = Array.from({ length: h }, (_, y) => layout.floor.slice(y * w, (y + 1) * w));
  const block = new Uint8Array(w * h);
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;

  const objects: WorldObject[] = [];
  const floorArt: FloorArtPiece[] = [];
  const wallDecor: WallDecorPiece[] = [];
  const attached: { obj: PlacedObject; item: CatalogItem }[] = [];
  for (const obj of layout.objects) {
    const item = itemAt(obj.kind, obj.v, catalog);
    if (!item) continue;
    const [fw, fd] = rotFootprint(item.footprint, obj.rot);
    if (item.kind === 'floor') objects.push({ obj, item, x: obj.x, y: obj.y, w: fw, d: fd });
    else if (item.kind === 'floorart') floorArt.push({ obj, item, x: obj.x, y: obj.y, w: fw, d: fd, rot: obj.rot });
    else if (item.kind === 'wall' && obj.wall) wallDecor.push({ obj, item, x: obj.x, y: obj.y, face: obj.wall });
    else if (item.kind === 'deskitem') attached.push({ obj, item });
  }
  const hosts = new Map(objects.map((o) => [o.obj.id, o]));
  const deskItems: DeskItemPiece[] = [];
  for (const { obj, item } of attached) {
    const host = obj.on ? hosts.get(obj.on) : undefined;
    if (!host || host.item.surface === undefined || !obj.at) continue;
    const [hw, hd] = host.item.footprint;
    const [iw, id] = rotFootprint(item.footprint, obj.rot);
    // The item's centre in the host's own frame, turned with the host to the world.
    const [cx, cy] = turnPoint(obj.at[0] + iw / 2, obj.at[1] + id / 2, hw, hd, host.obj.rot);
    const rot = ((host.obj.rot + obj.rot) & 3) as Rot;
    const [ww, wd] = rotFootprint(item.footprint, rot);
    deskItems.push({ obj, item, host, x: host.x + cx - ww / 2, y: host.y + cy - wd / 2, w: ww, d: wd, rot, z: host.item.surface });
  }

  if (inside(layout.spawn.x, layout.spawn.y)) cells[layout.spawn.y * w + layout.spawn.x] = 'S';
  const stamp = (o: WorldObject, solid: boolean) => {
    for (let y = o.y; y < o.y + o.d; y++) {
      for (let x = o.x; x < o.x + o.w; x++) {
        if (!inside(x, y)) continue;
        cells[y * w + x] = o.item.tile;
        if (solid) block[y * w + x] = 1;
      }
    }
  };
  for (const o of objects) if (!o.item.blocks) stamp(o, false);
  for (const o of objects) if (o.item.blocks) stamp(o, true);
  for (let i = 0; i < w * h; i++) {
    const wc = layout.walls[i];
    if (wc && wc !== NO_WALL) {
      cells[i] = wc;
      block[i] = 1;
    }
  }
  const grid = Array.from({ length: h }, (_, y) => cells.slice(y * w, (y + 1) * w).join(''));

  // A private room inside a bigger open area wins for the tiles it covers, so private rooms come first.
  const copy = (r: Room) => ({ ...r, rects: r.rects.map((q) => [...q] as Rect), allowed: [...r.allowed] });
  const areas = [...layout.rooms.filter((r) => r.private).map(copy), ...layout.rooms.filter((r) => !r.private).map(copy)];
  const pods = layout.pods.map((p) => ({ ...p, rects: p.rects.map((q) => [...q] as Rect) }));
  const blocked = (x: number, y: number) => !inside(x, y) || block[y * w + x] === 1;

  return {
    w, h, grid, floor, block, areas, pods,
    desks: deriveDesks(objects, pods, blocked),
    spawn: { x: layout.spawn.x + 0.5, y: layout.spawn.y + 0.5 },
    objects,
    deskItems,
    wallDecor,
    floorArt,
    layout,
  };
}

/**
 * A desk object is claimable when a chair stands against one of its long sides and that chair is inside a pod.
 * The desk keeps its object id, so moving it (with its chair) never changes who owns it.
 */
/**
 * A desk's space is a 3×3 block: the desk (3 tiles on its long side), the chair against it, and the row of floor behind the chair,
 * with the chair in the middle of its row. A desk or chair that does not fit that shape (a 2-wide desk, a thicker desk) gets the
 * smallest block of at least 3×3 that holds the desk and its seat, grown away from the desk and towards higher coordinates.
 */
function deskBox(o: WorldObject, chair: WorldObject, seat: { x: number; y: number }): { x: number; y: number }[] {
  let x0 = Math.min(o.x, seat.x), x1 = Math.max(o.x + o.w - 1, seat.x);
  let y0 = Math.min(o.y, seat.y), y1 = Math.max(o.y + o.d - 1, seat.y);
  const horizontal = o.w >= o.d;
  if (horizontal) {
    const need = 3 - (y1 - y0 + 1);
    if (need > 0) chair.y < o.y ? (y0 -= need) : (y1 += need); // behind the chair
    const along = 3 - (x1 - x0 + 1);
    if (along > 0) x1 += along;
  } else {
    const need = 3 - (x1 - x0 + 1);
    if (need > 0) chair.x < o.x ? (x0 -= need) : (x1 += need);
    const along = 3 - (y1 - y0 + 1);
    if (along > 0) y1 += along;
  }
  const out: { x: number; y: number }[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push({ x, y });
  return out;
}

function deriveDesks(objects: WorldObject[], pods: DeskPod[], blocked: (x: number, y: number) => boolean): Desk[] {
  const chairAt = new Map<string, WorldObject>();
  for (const o of objects) if (o.item.tile === 'h') for (let y = o.y; y < o.y + o.d; y++) for (let x = o.x; x < o.x + o.w; x++) chairAt.set(keyOf(x, y), o);
  const podOf = (x: number, y: number) => pods.find((p) => p.rects.some((r) => inRect(x, y, r)));

  interface Raw { id: string; pod: DeskPod; seat: { x: number; y: number }; surface: { x: number; y: number }[]; key: string; box: { x: number; y: number }[] }
  const raws: Raw[] = [];
  for (const o of objects) {
    if (o.item.tile !== 'd') continue;
    const beside: [number, number][] = [];
    if (o.w >= o.d) for (let i = 0; i < o.w; i++) beside.push([o.x + i, o.y - 1], [o.x + i, o.y + o.d]);
    else for (let j = 0; j < o.d; j++) beside.push([o.x - 1, o.y + j], [o.x + o.w, o.y + j]);
    let chair: WorldObject | undefined;
    for (const [x, y] of beside) {
      const c = chairAt.get(keyOf(x, y));
      if (c && podOf(c.x, c.y) && (!chair || c.obj.id < chair.obj.id)) chair = c;
    }
    if (!chair) continue;
    const pod = podOf(chair.x, chair.y)!;
    const surface: { x: number; y: number }[] = [];
    for (let y = o.y; y < o.y + o.d; y++) for (let x = o.x; x < o.x + o.w; x++) surface.push({ x, y });
    const seat = { x: chair.x, y: chair.y };
    raws.push({ id: o.obj.id, pod, seat, surface, key: `${pod.id}:${seat.x},${seat.y}`, box: deskBox(o, chair, seat) });
  }
  // Pods in order, then by chair position: the first free desk is always the same one.
  raws.sort((a, b) => pods.indexOf(a.pod) - pods.indexOf(b.pod) || a.seat.y - b.seat.y || a.seat.x - b.seat.x || (a.id < b.id ? -1 : 1));

  // Every desk keeps its own tiles first; contested floor goes to the nearest seat.
  const owned = new Set<string>();
  for (const d of raws) {
    owned.add(keyOf(d.seat.x, d.seat.y));
    d.surface.forEach((t) => owned.add(keyOf(t.x, t.y)));
  }
  const ring = new Map<string, { tile: { x: number; y: number }; desk: Raw; dist: number }>();
  for (const d of raws) {
    for (const t of d.box) {
      const k = keyOf(t.x, t.y);
      if (owned.has(k) || blocked(t.x, t.y) || !d.pod.rects.some((r) => inRect(t.x, t.y, r))) continue;
      const dist = Math.hypot(t.x - d.seat.x, t.y - d.seat.y);
      const best = ring.get(k);
      if (!best || dist < best.dist || (dist === best.dist && d.key < best.desk.key)) ring.set(k, { tile: t, desk: d, dist });
    }
  }
  return raws.map((d) => ({
    id: d.id,
    podId: d.pod.id,
    seat: d.seat,
    tiles: [d.seat, ...d.surface, ...[...ring.values()].filter((r) => r.desk === d).map((r) => r.tile)],
  }));
}
