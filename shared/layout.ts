// The office layout as data: what a builder edits and what the server saves. Pure types and functions, so the
// server, the browser and the tests all read and check a layout the same way.
import { MAX_PAINTS, UNPAINTED, paintChar, paintIndex, parsePaintKey } from './finishes';
import { isThemeId } from './themes';

/** Inclusive tile rectangle: [x0, y0, x1, y1]. */
export type Rect = [number, number, number, number];
export type Rot = 0 | 1 | 2 | 3;
export type Face = 'n' | 'e' | 's' | 'w';

export interface PlacedObject {
  /** `[a-z0-9-]{1,40}`, unique in the layout. It never changes when the object is moved or turned. */
  id: string;
  /** A built-in catalog id, or `custom:<objectId>`. */
  kind: string;
  /** The top-left tile of the footprint after turning. */
  x: number;
  y: number;
  /** Quarter turns clockwise. 0 faces down (south). For a desk item, relative to its host. */
  rot: Rot;
  /** Pins this copy to an older version of its item (when the newer one would not fit where it stands). */
  v?: number;
  /** Desk items: the id of the object they stand on, and where on it, in that object's own (unturned) frame. */
  on?: string;
  at?: [number, number];
  /** Wall decor: which face of the wall tile `(x, y)` it hangs on. */
  wall?: Face;
}

export interface Room {
  id: string;
  name: string;
  /** Private areas hold one meeting that nobody outside can hear, see or read. */
  private: boolean;
  rects: Rect[];
  /** Most people allowed inside at once; absent means unlimited. */
  capacity?: number;
  /** Restricted areas admit only `allowed` members, or people an occupant admits after a knock. */
  restricted: boolean;
  /** Member ids (stable per-browser UUIDs) allowed into a restricted area. */
  allowed: string[];
  /** Draw a lit border around the area for people inside it. */
  highlight: boolean;
  /** A Jam Room plays shared music for everyone inside. Absent means an ordinary room. */
  jam?: boolean;
  /** Inside this room the floor, ceiling, wall faces and light follow this theme instead of the office's. */
  style?: { theme: string };
}

export type PodMode = 'ambient' | 'cubicle';

export interface Pod {
  id: string;
  name: string;
  rects: Rect[];
  mode: PodMode;
}

export interface Layout {
  w: number;
  h: number;
  /** One floor code per tile, row by row. */
  floor: string;
  /** One wall code per tile, row by row; a space means no wall. */
  walls: string;
  objects: PlacedObject[];
  rooms: Room[];
  pods: Pod[];
  /** A tile. */
  spawn: { x: number; y: number };
  /** How the whole office looks; absent means Warm Studio. */
  theme?: string;
  /** The paint keys in use (at most `MAX_PAINTS`); `floorPaint` and `wallPaint` index into them. */
  paints?: string[];
  /** One character per tile: `' '` for no paint, else `paintChar(index into paints)`. Looks only; `floor` still decides everything else. */
  floorPaint?: string;
  /** The same for plain `#` walls. */
  wallPaint?: string;
  /** Seasonal touches (off when absent). */
  seasonal?: boolean;
  /** Time-of-day light in first person (off when absent). */
  daylight?: boolean;
}

export const MIN_SIZE = 10;
export const MAX_SIZE = 100;
export const MAX_OBJECTS = 2000;
export const MAX_ROOMS = 50;
export const MAX_PODS = 30;
export const NAME_MAX = 25;
export const MAX_ALLOWED = 200;

export const FLOOR_CODES = ['.', ',', ';', '_'] as const;
export const WALL_CODES = ['#', 'G', 'W', 'B', 'K'] as const;
export const NO_WALL = ' ';
export const ID_RE = /^[a-z0-9-]{1,40}$/;

/** A point in an object's own frame (footprint `fw`×`fd`, facing south) to the frame it has after `rot` clockwise quarter turns. */
export function turnPoint(lx: number, ly: number, fw: number, fd: number, rot: number): [number, number] {
  switch (rot & 3) {
    case 1: return [fd - ly, lx];
    case 2: return [fw - lx, fd - ly];
    case 3: return [ly, fw - lx];
    default: return [lx, ly];
  }
}

/** The opposite of `turnPoint`: a point in the turned frame back to the object's own frame. */
export function unturnPoint(tx: number, ty: number, fw: number, fd: number, rot: number): [number, number] {
  switch (rot & 3) {
    case 1: return [ty, fd - tx];
    case 2: return [fw - tx, fd - ty];
    case 3: return [fw - ty, tx];
    default: return [tx, ty];
  }
}

/** The footprint after `rot` quarter turns. */
export function rotFootprint([w, d]: readonly [number, number], rot: number): [number, number] {
  return rot % 2 === 0 ? [w, d] : [d, w];
}

export const cellIndex = (l: Pick<Layout, 'w'>, x: number, y: number) => y * l.w + x;
export const inGrid = (l: Pick<Layout, 'w' | 'h'>, x: number, y: number) => x >= 0 && y >= 0 && x < l.w && y < l.h;

export type ParseResult = { ok: true; layout: Layout } | { ok: false; errors: string[] };

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * Reads untrusted JSON into a layout, or says what is wrong with it. Strings are trimmed and clamped, unknown
 * fields are dropped, and every limit from the data model is enforced. `knownKind` says which object kinds exist.
 */
export function parseLayout(
  raw: unknown,
  knownKind: (kind: string) => boolean,
  footprintOf: (kind: string) => readonly [number, number] | undefined,
  /** Where an item goes (`floor`, `deskitem`, `wall`, `floorart`); anything unknown counts as `floor`. */
  placementOf: (kind: string) => string | undefined = () => undefined,
  /** `lenient` is for the server's own saved file: a finish or theme that no longer exists is dropped instead of refusing the layout. */
  opts: { lenient?: boolean } = {},
): ParseResult {
  const errors: string[] = [];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, errors: ['not-an-object'] };
  const r = raw as Record<string, unknown>;

  const { w, h } = r;
  if (!isInt(w) || !isInt(h) || w < MIN_SIZE || w > MAX_SIZE || h < MIN_SIZE || h > MAX_SIZE) {
    return { ok: false, errors: [`bad-size: w and h must be whole numbers from ${MIN_SIZE} to ${MAX_SIZE}`] };
  }
  const cells = w * h;
  const floor = r.floor, walls = r.walls;
  if (typeof floor !== 'string' || floor.length !== cells) errors.push('bad-floor: floor must be a string with one code per tile');
  else if ([...floor].some((c) => !(FLOOR_CODES as readonly string[]).includes(c))) errors.push('bad-floor: unknown floor code');
  if (typeof walls !== 'string' || walls.length !== cells) errors.push('bad-walls: walls must be a string with one code per tile');
  else if ([...walls].some((c) => c !== NO_WALL && !(WALL_CODES as readonly string[]).includes(c))) errors.push('bad-walls: unknown wall code');

  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;

  const objects: PlacedObject[] = [];
  if (!Array.isArray(r.objects)) errors.push('bad-objects: objects must be a list');
  else if (r.objects.length > MAX_OBJECTS) errors.push(`too-many-objects: at most ${MAX_OBJECTS}`);
  else {
    const seen = new Set<string>();
    for (const o of r.objects as Record<string, unknown>[]) {
      const id = typeof o?.id === 'string' ? o.id : '';
      if (!ID_RE.test(id) || seen.has(id)) {
        errors.push(`bad-object-id: ${id.slice(0, 40)}`);
        continue;
      }
      seen.add(id);
      const kind = typeof o.kind === 'string' ? o.kind : '';
      if (!knownKind(kind)) {
        errors.push(`unknown-kind: ${kind.slice(0, 40)}`);
        continue;
      }
      if (!isInt(o.x) || !isInt(o.y) || (o.rot !== 0 && o.rot !== 1 && o.rot !== 2 && o.rot !== 3)) {
        errors.push(`bad-object: ${id}`);
        continue;
      }
      const placement = placementOf(kind) ?? 'floor';
      // Desk items stand on a desk and are not placed by x and y; wall decor needs only its tile in the grid.
      const fp = placement === 'floor' || placement === 'floorart' ? rotFootprint(footprintOf(kind) ?? [1, 1], o.rot) : ([1, 1] as const);
      if (placement !== 'deskitem' && (!inside(o.x, o.y) || !inside(o.x + fp[0] - 1, o.y + fp[1] - 1))) {
        errors.push(`object-outside: ${id}`);
        continue;
      }
      const placed: PlacedObject = { id, kind, x: o.x, y: o.y, rot: o.rot };
      if (isInt(o.v) && o.v >= 1) placed.v = o.v;
      if (typeof o.on === 'string' && ID_RE.test(o.on)) placed.on = o.on;
      const at = o.at as unknown[] | undefined;
      if (Array.isArray(at) && at.length === 2 && at.every((n) => typeof n === 'number' && Number.isFinite(n))) {
        placed.at = [Math.round((at[0] as number) * 20) / 20, Math.round((at[1] as number) * 20) / 20];
      }
      if (o.wall === 'n' || o.wall === 'e' || o.wall === 's' || o.wall === 'w') placed.wall = o.wall;
      objects.push(placed);
    }
  }

  const rects = (v: unknown): Rect[] | null => {
    if (!Array.isArray(v) || v.length > 2000) return null;
    const out: Rect[] = [];
    for (const q of v) {
      if (!Array.isArray(q) || q.length !== 4 || !q.every(isInt)) return null;
      const [a, b, c, d] = q as number[];
      const x0 = Math.max(0, Math.min(a, c)), x1 = Math.min(w - 1, Math.max(a, c));
      const y0 = Math.max(0, Math.min(b, d)), y1 = Math.min(h - 1, Math.max(b, d));
      if (x0 <= x1 && y0 <= y1) out.push([x0, y0, x1, y1]);
    }
    return out;
  };

  const rooms: Room[] = [];
  if (!Array.isArray(r.rooms) || r.rooms.length > MAX_ROOMS) errors.push(`bad-rooms: a list of at most ${MAX_ROOMS}`);
  else {
    const seen = new Set<string>();
    for (const o of r.rooms as Record<string, unknown>[]) {
      const id = typeof o?.id === 'string' ? o.id : '';
      const rs = rects(o?.rects);
      if (!ID_RE.test(id) || seen.has(id) || !rs) {
        errors.push(`bad-room: ${id.slice(0, 40)}`);
        continue;
      }
      seen.add(id);
      const cap = o.capacity;
      const allowed = Array.isArray(o.allowed)
        ? o.allowed.filter((m): m is string => typeof m === 'string' && m.length <= 64).slice(0, MAX_ALLOWED)
        : [];
      rooms.push({
        id,
        name: clean(o.name, NAME_MAX),
        private: o.private === true,
        rects: rs,
        ...(isInt(cap) && cap >= 1 && cap <= 50 ? { capacity: cap } : {}),
        restricted: o.restricted === true,
        allowed,
        highlight: typeof o.highlight === 'boolean' ? o.highlight : o.private === true,
        ...(o.jam === true ? { jam: true } : {}),
        ...roomStyle(o.style, errors, opts.lenient === true),
      });
    }
  }

  const pods: Pod[] = [];
  if (!Array.isArray(r.pods) || r.pods.length > MAX_PODS) errors.push(`bad-pods: a list of at most ${MAX_PODS}`);
  else {
    const seen = new Set<string>();
    for (const o of r.pods as Record<string, unknown>[]) {
      const id = typeof o?.id === 'string' ? o.id : '';
      const rs = rects(o?.rects);
      if (!ID_RE.test(id) || seen.has(id) || !rs) {
        errors.push(`bad-pod: ${id.slice(0, 40)}`);
        continue;
      }
      seen.add(id);
      pods.push({ id, name: clean(o.name, NAME_MAX), rects: rs, mode: o.mode === 'cubicle' ? 'cubicle' : 'ambient' });
    }
  }

  const sp = r.spawn as { x?: unknown; y?: unknown } | undefined;
  if (!sp || !isInt(sp.x) || !isInt(sp.y) || !inside(sp.x, sp.y)) errors.push('bad-spawn: spawn must be a tile inside the grid');

  const look = parseLook(r, cells, errors, opts.lenient === true);

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    layout: { w, h, floor: floor as string, walls: walls as string, objects, rooms, pods, spawn: { x: sp!.x as number, y: sp!.y as number }, ...look },
  };
}

/** A room's own theme: kept when it is a known one; refused (`bad-theme`) otherwise, or quietly dropped when reading the saved file. */
function roomStyle(raw: unknown, errors: string[], lenient: boolean): { style?: { theme: string } } {
  if (raw === undefined || raw === null) return {};
  const theme = (raw as { theme?: unknown }).theme;
  if (isThemeId(theme)) return { style: { theme } };
  if (!lenient) errors.push('bad-theme: a room style must name a known theme');
  return {};
}

/** The look fields: theme, paint table and grids, and the two switches. Nothing here changes what is solid or where anything stands. */
function parseLook(r: Record<string, unknown>, cells: number, errors: string[], lenient: boolean): Pick<Layout, 'theme' | 'paints' | 'floorPaint' | 'wallPaint' | 'seasonal' | 'daylight'> {
  const out: Pick<Layout, 'theme' | 'paints' | 'floorPaint' | 'wallPaint' | 'seasonal' | 'daylight'> = {};

  if (r.theme !== undefined) {
    if (isThemeId(r.theme)) out.theme = r.theme;
    else if (lenient) out.theme = 'warm-studio';
    else errors.push('bad-theme: unknown theme');
  }
  for (const flag of ['seasonal', 'daylight'] as const) {
    if (r[flag] === undefined) continue;
    if (typeof r[flag] === 'boolean') out[flag] = r[flag] as boolean;
    else if (!lenient) errors.push(`bad-flag: ${flag} must be true or false`);
  }

  if (r.paints === undefined && r.floorPaint === undefined && r.wallPaint === undefined) return out;
  if (!Array.isArray(r.paints)) {
    if (!lenient) errors.push('bad-paint: paints must be a list');
    return out;
  }
  if (r.paints.length > MAX_PAINTS) {
    errors.push(`too-many-paints: at most ${MAX_PAINTS}`);
    return out;
  }
  const paints = r.paints as unknown[];
  // Entries nobody can draw (when reading the saved file) are remembered so their tiles can be cleared.
  const dead = new Set<number>();
  const seen = new Set<string>();
  paints.forEach((key, i) => {
    if (typeof key === 'string' && parsePaintKey(key) && !seen.has(key)) {
      seen.add(key);
      return;
    }
    dead.add(i);
    if (!lenient) errors.push(`bad-paint: ${typeof key === 'string' ? key.slice(0, 40) : 'not a text key'}`);
  });

  const grid = (value: unknown, surface: 'floor' | 'wall'): string | undefined => {
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || value.length !== cells) {
      if (!lenient) errors.push(`bad-paint-grid: ${surface}Paint must have one character per tile`);
      return undefined;
    }
    let outGrid = '';
    let reported = false;
    for (const ch of value) {
      if (ch === UNPAINTED) {
        outGrid += ch;
        continue;
      }
      const i = paintIndex(ch);
      const finish = i >= 0 && i < paints.length && !dead.has(i) ? parsePaintKey(paints[i])?.finish : undefined;
      if (i < 0 || i >= paints.length) {
        if (!lenient && !reported) errors.push('bad-paint-grid: a character does not name a paint');
        reported = true;
        outGrid += UNPAINTED;
      } else if (!finish) outGrid += UNPAINTED;
      else if (finish.surface !== surface) {
        if (!lenient && !reported) errors.push(`bad-paint: a ${finish.surface} finish is painted on a ${surface}`);
        reported = true;
        outGrid += UNPAINTED;
      } else outGrid += ch;
    }
    return outGrid;
  };
  const floorPaint = grid(r.floorPaint, 'floor');
  const wallPaint = grid(r.wallPaint, 'wall');
  out.paints = paints.map((k, i) => (dead.has(i) ? '' : (k as string)));
  if (floorPaint !== undefined) out.floorPaint = floorPaint;
  if (wallPaint !== undefined) out.wallPaint = wallPaint;
  // A dead entry keeps its slot (an empty key) so the other characters still point at the right paints; compaction removes it.
  return out;
}

/**
 * Drops paints nothing uses and numbers the rest again in their old order. A wall paint only counts on a plain `#` wall, and is cleared
 * everywhere else. When nothing is painted, the fields go away so an unpainted layout looks exactly like an old one.
 */
export function compactPaints(layout: Layout): Layout {
  const l = layout;
  if (!l.paints && !l.floorPaint && !l.wallPaint) return l;
  const paints = l.paints ?? [];
  let floorPaint = l.floorPaint, wallPaint = l.wallPaint;
  if (wallPaint) {
    const cells = [...wallPaint];
    for (let i = 0; i < cells.length; i++) if (l.walls[i] !== '#') cells[i] = UNPAINTED;
    wallPaint = cells.join('');
  }
  const used = new Set<number>();
  for (const g of [floorPaint, wallPaint]) if (g) for (const ch of g) if (ch !== UNPAINTED) used.add(paintIndex(ch));
  const order = [...used].filter((i) => i >= 0 && i < paints.length && paints[i]).sort((a, b) => a - b);
  const renumber = new Map(order.map((old, n) => [old, n]));
  const remap = (g: string | undefined) =>
    g === undefined ? undefined : [...g].map((ch) => (ch === UNPAINTED ? ch : renumber.has(paintIndex(ch)) ? paintChar(renumber.get(paintIndex(ch))!) : UNPAINTED)).join('');
  floorPaint = remap(floorPaint);
  wallPaint = remap(wallPaint);
  const { paints: _p, floorPaint: _f, wallPaint: _w, ...rest } = l;
  const next: Layout = { ...rest };
  if (order.length) {
    next.paints = order.map((i) => paints[i]);
    if (floorPaint && /[^ ]/.test(floorPaint)) next.floorPaint = floorPaint;
    if (wallPaint && /[^ ]/.test(wallPaint)) next.wallPaint = wallPaint;
  }
  return next;
}

/** A deep copy that is safe to edit. */
export function cloneLayout(l: Layout): Layout {
  return {
    ...l,
    objects: l.objects.map((o) => ({ ...o, ...(o.at ? { at: [...o.at] as [number, number] } : {}) })),
    rooms: l.rooms.map((r) => ({ ...r, rects: r.rects.map((q) => [...q] as Rect), allowed: [...r.allowed], ...(r.style ? { style: { ...r.style } } : {}) })),
    pods: l.pods.map((p) => ({ ...p, rects: p.rects.map((q) => [...q] as Rect) })),
    spawn: { ...l.spawn },
    ...(l.paints ? { paints: [...l.paints] } : {}),
  };
}

// ------------------------------------------------------------------ normalizing

export interface Removed {
  id: string;
  /** `unknown` (its item is gone), `no-host`, `no-wall`, or `full`. */
  why: 'unknown' | 'no-host' | 'no-wall' | 'full';
}

export interface NormalizeOptions {
  /** Whether an item still has the version a copy is pinned to. When absent, pins are left alone. */
  hasVersion?: (kind: string, v: number) => boolean;
}

/** Most desk items on one tile of a desk, and most wall decor items on one wall face. */
export const MAX_ON_DESK_TILE = 6;
export const MAX_ON_WALL_FACE = 2;

export const FACE_STEP: Record<Face, [number, number]> = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };

/** Which tile of a desk (in the desk's own frame) a desk item at `at`, of size `iw`×`id`, counts as being on. */
export const deskTileOf = (hw: number, hd: number, at: [number, number], iw: number, id: number): [number, number] => [
  Math.min(hw - 1, Math.floor(at[0] + iw / 2)),
  Math.min(hd - 1, Math.floor(at[1] + id / 2)),
];

/**
 * Makes a layout consistent after an edit: drops objects whose item is gone, desk items whose desk is gone (or that
 * have no desk to stand on), wall decor with no wall to hang on, and what is over the limits; moves a desk item that
 * lies outside its desk back onto it. Pure; the builder, the server and the merge all run it. Returns what it removed.
 */
export function normalizeLayout(
  layout: Layout,
  catalog: ReadonlyMap<string, { kind: string; footprint: readonly [number, number]; surface?: number }>,
  opts: NormalizeOptions = {},
): { layout: Layout; removed: Removed[] } {
  const l = cloneLayout(layout);
  const removed: Removed[] = [];

  // Pass 1: drop what has no item, and strip the fields that do not belong to an object of its kind.
  const alive: PlacedObject[] = [];
  for (const o of l.objects) {
    const item = catalog.get(o.kind);
    if (!item) {
      removed.push({ id: o.id, why: 'unknown' });
      continue;
    }
    if (item.kind !== 'deskitem') {
      delete o.on;
      delete o.at;
    }
    if (item.kind !== 'wall') delete o.wall;
    if (o.v !== undefined && opts.hasVersion && !opts.hasVersion(o.kind, o.v)) delete o.v;
    alive.push(o);
  }
  const byId = new Map(alive.map((o) => [o.id, o]));

  // Pass 2: desk items and wall decor need something to stand on or hang on, and have limits.
  const counts = new Map<string, number>();
  const kept: PlacedObject[] = [];
  for (const o of alive) {
    const item = catalog.get(o.kind)!;
    if (item.kind === 'deskitem') {
      const host = o.on ? byId.get(o.on) : undefined;
      const hostItem = host && catalog.get(host.kind);
      if (!o.on || !o.at || !host || !hostItem || hostItem.surface === undefined) {
        removed.push({ id: o.id, why: 'no-host' });
        continue;
      }
      const [iw, id] = rotFootprint(item.footprint, o.rot);
      const [hw, hd] = hostItem.footprint;
      const at: [number, number] = [
        Math.round(Math.min(Math.max(o.at[0], 0), Math.max(0, hw - iw)) * 20) / 20,
        Math.round(Math.min(Math.max(o.at[1], 0), Math.max(0, hd - id)) * 20) / 20,
      ];
      const key = `${host.id}|${deskTileOf(hw, hd, at, iw, id).join(',')}`;
      if ((counts.get(key) ?? 0) >= MAX_ON_DESK_TILE) {
        removed.push({ id: o.id, why: 'full' });
        continue;
      }
      counts.set(key, (counts.get(key) ?? 0) + 1);
      o.at = at;
      o.x = 0;
      o.y = 0;
    } else if (item.kind === 'wall') {
      const face = o.wall;
      const wallAt = (x: number, y: number) => x >= 0 && y >= 0 && x < l.w && y < l.h && l.walls[y * l.w + x] !== NO_WALL;
      const openAt = (x: number, y: number) => x >= 0 && y >= 0 && x < l.w && y < l.h && l.walls[y * l.w + x] === NO_WALL;
      const step = face ? FACE_STEP[face] : undefined;
      if (!step || !wallAt(o.x, o.y) || !openAt(o.x + step[0], o.y + step[1])) {
        removed.push({ id: o.id, why: 'no-wall' });
        continue;
      }
      const key = `wall|${o.x},${o.y},${face}`;
      if ((counts.get(key) ?? 0) >= MAX_ON_WALL_FACE) {
        removed.push({ id: o.id, why: 'full' });
        continue;
      }
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    kept.push(o);
  }
  l.objects = kept;
  return { layout: compactPaints(l), removed };
}
