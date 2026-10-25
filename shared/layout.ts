// The office layout as data: what a builder edits and what the server saves. Pure types and functions, so the
// server, the browser and the tests all read and check a layout the same way.

/** Inclusive tile rectangle: [x0, y0, x1, y1]. */
export type Rect = [number, number, number, number];
export type Rot = 0 | 1 | 2 | 3;

export interface PlacedObject {
  /** `[a-z0-9-]{1,40}`, unique in the layout. It never changes when the object is moved or turned. */
  id: string;
  /** A built-in catalog id, or `custom:<objectId>`. */
  kind: string;
  /** The top-left tile of the footprint after turning. */
  x: number;
  y: number;
  /** Quarter turns clockwise. 0 faces down (south). */
  rot: Rot;
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
      const fp = rotFootprint(footprintOf(kind) ?? [1, 1], o.rot);
      if (!inside(o.x, o.y) || !inside(o.x + fp[0] - 1, o.y + fp[1] - 1)) {
        errors.push(`object-outside: ${id}`);
        continue;
      }
      objects.push({ id, kind, x: o.x, y: o.y, rot: o.rot });
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

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    layout: { w, h, floor: floor as string, walls: walls as string, objects, rooms, pods, spawn: { x: sp!.x as number, y: sp!.y as number } },
  };
}

/** A deep copy that is safe to edit. */
export function cloneLayout(l: Layout): Layout {
  return {
    ...l,
    objects: l.objects.map((o) => ({ ...o })),
    rooms: l.rooms.map((r) => ({ ...r, rects: r.rects.map((q) => [...q] as Rect), allowed: [...r.allowed] })),
    pods: l.pods.map((p) => ({ ...p, rects: p.rects.map((q) => [...q] as Rect) })),
    spawn: { ...l.spawn },
  };
}
