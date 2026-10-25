// The office as every rule sees it. The layout is data (see layout.ts); `setWorld` compiles it in, and the
// exports below are live bindings, so importers always read the current office, also after a publish.
//
// Tile codes in the compiled grid:
//  #  wall          G  window wall     W  whiteboard wall
//  B  bookshelf     K  kitchen counter
//  .  wood floor    ,  carpet          ;  library carpet    _  kitchen tile
//  d  desk          t  table           h  chair (walkable)
//  p  plant         s  sofa            S  spawn point       x  custom object
import { builtInCatalog } from './catalog';
import { defaultLayout } from './default-layout';
import { compileWorld, type Area, type Desk, type DeskPod, type PodMode, type World } from './world';

export type { Area, Desk, DeskPod, PodMode, World };
export type { Rect } from './layout';

export const WALLS = new Set(['#', 'G', 'W', 'B', 'K']);
export const FLOORS = new Set(['.', ',', ';', '_']);
export const FURNITURE = new Set(['d', 't', 'h', 'p', 's']);
export const DESK_NAME_MAX = 25;

type Rect = [number, number, number, number];

export let MAP_W = 0;
export let MAP_H = 0;
export let SPAWN = { x: 0, y: 0 };
export let AREAS: Area[] = [];
export let DESK_PODS: DeskPod[] = [];
export let DESKS: Desk[] = [];

let world: World;
let deskByTile = new Map<string, Desk>();
const listeners = new Set<(w: World) => void>();

const keyOf = (x: number, y: number) => `${x},${y}`;
const inRect = (x: number, y: number, [x0, y0, x1, y1]: Rect) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const rectsOverlap = (a: Rect, b: Rect) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

/** Makes `w` the office everyone reads. */
export function setWorld(w: World) {
  world = w;
  MAP_W = w.w;
  MAP_H = w.h;
  SPAWN = w.spawn;
  AREAS = w.areas;
  DESK_PODS = w.pods;
  DESKS = w.desks;
  deskByTile = new Map();
  for (const d of w.desks) for (const t of d.tiles) deskByTile.set(keyOf(t.x, t.y), d);
  for (const cb of listeners) cb(w);
}

export const getWorld = () => world;

/** Calls `cb` after every `setWorld`. Returns a function that stops listening. */
export function onWorldChange(cb: (w: World) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** The office that ships with the app. */
export const compileDefault = () => compileWorld(defaultLayout(), builtInCatalog());
setWorld(compileDefault());

export function tileAt(x: number, y: number): string {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return '#';
  return world.grid[y][x];
}

export const isWall = (t: string) => WALLS.has(t);
export const isBlocking = (x: number, y: number) => x < 0 || y < 0 || x >= MAP_W || y >= MAP_H || world.block[y * MAP_W + x] === 1;

/** The floor drawn underneath a tile (furniture sits on whatever floor surrounds it). */
export function baseFloor(x: number, y: number): string {
  return world.floor[y]?.[x] ?? '.';
}

export function areaById(id: string): Area | undefined {
  return AREAS.find((a) => a.id === id);
}

export function areaAt(x: number, y: number): Area | null {
  const tx = Math.floor(x), ty = Math.floor(y);
  for (const z of AREAS) {
    for (const r of z.rects) {
      if (inRect(tx, ty, r)) return z;
    }
  }
  return null;
}

// ---------------------------------------------------------------- desks

export const deskById = (id: string): Desk | undefined => DESKS.find((d) => d.id === id);
export const podById = (id: string): DeskPod | undefined => DESK_PODS.find((p) => p.id === id);

/** The desk whose area contains this position. */
export function deskAt(x: number, y: number): Desk | null {
  return deskByTile.get(keyOf(Math.floor(x), Math.floor(y))) ?? null;
}

/** The pod containing this position. */
export function podAt(x: number, y: number): DeskPod | null {
  const tx = Math.floor(x), ty = Math.floor(y);
  return DESK_PODS.find((p) => p.rects.some((r) => inRect(tx, ty, r))) ?? null;
}

/** Throws a descriptive error if the office data is inconsistent. Run at server start. */
export function validateOffice(pods: DeskPod[] = DESK_PODS, areas: Area[] = AREAS, desks: Desk[] = DESKS) {
  for (const p of pods) {
    if (p.name.length > DESK_NAME_MAX) throw new Error(`Desk pod ${p.id}: name is longer than ${DESK_NAME_MAX} characters`);
    if (!desks.some((d) => d.podId === p.id)) throw new Error(`Desk pod ${p.id} contains no desks`);
  }
  for (let i = 0; i < pods.length; i++) {
    for (let j = i + 1; j < pods.length; j++) {
      if (pods[i].rects.some((a) => pods[j].rects.some((b) => rectsOverlap(a, b)))) {
        throw new Error(`Desk pods ${pods[i].id} and ${pods[j].id} overlap`);
      }
    }
    for (const a of areas) {
      if (a.private && pods[i].rects.some((r) => a.rects.some((b) => rectsOverlap(r, b)))) {
        throw new Error(`Desk pod ${pods[i].id} overlaps private area ${a.id}`);
      }
    }
  }
  const claimed = new Map<string, string>();
  for (const d of desks) {
    for (const t of d.tiles) {
      const other = claimed.get(keyOf(t.x, t.y));
      if (other && other !== d.id) throw new Error(`Desks ${other} and ${d.id} share tile ${t.x},${t.y}`);
      claimed.set(keyOf(t.x, t.y), d.id);
    }
  }
}

const NEIGHBOURS_4 = [[0, -1], [0, 1], [-1, 0], [1, 0]];

/**
 * The closest walkable tile to (x, y), found by a short search around it. It stays in the
 * start's private context (it never crosses a meeting-room wall), skips occupied tiles, and
 * returns the tile centre, or null when nothing within three tiles is free.
 */
export function nearestFreeTileNear(x: number, y: number, occupied: ReadonlySet<string>): { x: number; y: number } | null {
  const sx = Math.floor(x), sy = Math.floor(y);
  const home = areaAt(x, y)?.private ? areaAt(x, y)!.id : null;
  const seen = new Set([keyOf(sx, sy)]);
  let frontier: [number, number][] = [[sx, sy]];
  for (let step = 0; step <= 3; step++) {
    for (const [tx, ty] of frontier) {
      if (!isBlocking(tx, ty) && !occupied.has(keyOf(tx, ty))) return { x: tx + 0.5, y: ty + 0.5 };
    }
    const next: [number, number][] = [];
    for (const [tx, ty] of frontier) {
      for (const [dx, dy] of NEIGHBOURS_4) {
        const nx = tx + dx, ny = ty + dy;
        const k = keyOf(nx, ny);
        const a = areaAt(nx + 0.5, ny + 0.5);
        if (seen.has(k) || isBlocking(nx, ny) || (a?.private ? a.id : null) !== home) continue;
        seen.add(k);
        next.push([nx, ny]);
      }
    }
    frontier = next;
  }
  return null;
}

/**
 * The closest walkable tile to (x, y) that is not taken, searching the whole office if it has to. It prefers a tile
 * reached on foot within three tiles, then the nearest free tile in the same private context, then the spawn point.
 * Used when a new layout leaves someone inside a wall or furniture.
 */
export function nearestFreeTile(x: number, y: number, occupied: ReadonlySet<string> = new Set()): { x: number; y: number } {
  const near = nearestFreeTileNear(x, y, occupied);
  if (near) return near;
  const sx = Math.floor(x), sy = Math.floor(y);
  const home = areaAt(x, y)?.private ? areaAt(x, y)!.id : null;
  for (let r = 1; r <= Math.max(MAP_W, MAP_H); r++) {
    let best: { x: number; y: number; d: number } | null = null;
    for (let ty = sy - r; ty <= sy + r; ty++) {
      for (let tx = sx - r; tx <= sx + r; tx++) {
        if (Math.max(Math.abs(tx - sx), Math.abs(ty - sy)) !== r || isBlocking(tx, ty) || occupied.has(keyOf(tx, ty))) continue;
        const a = areaAt(tx + 0.5, ty + 0.5);
        if ((a?.private ? a.id : null) !== home) continue;
        const d = Math.hypot(tx - sx, ty - sy);
        if (!best || d < best.d) best = { x: tx + 0.5, y: ty + 0.5, d };
      }
    }
    if (best) return { x: best.x, y: best.y };
  }
  return { x: SPAWN.x, y: SPAWN.y };
}

const RADIUS = 0.28;

function boxHits(x: number, y: number): boolean {
  return (
    isBlocking(Math.floor(x - RADIUS), Math.floor(y - RADIUS)) ||
    isBlocking(Math.floor(x + RADIUS), Math.floor(y - RADIUS)) ||
    isBlocking(Math.floor(x - RADIUS), Math.floor(y + RADIUS)) ||
    isBlocking(Math.floor(x + RADIUS), Math.floor(y + RADIUS))
  );
}

/** Moves a body by (dx, dy), sliding along walls and furniture. */
export function moveWithCollision(x: number, y: number, dx: number, dy: number) {
  let nx = x + dx;
  if (boxHits(nx, y)) nx = x;
  let ny = y + dy;
  if (boxHits(nx, ny)) ny = y;
  return { x: nx, y: ny };
}
