// The office layout. One character per tile; the same grid drives the 2D
// view, the first-person raycaster, collision, and zones.
//
//  #  wall          G  window wall     W  whiteboard wall
//  B  bookshelf     K  kitchen counter
//  .  wood floor    ,  carpet          ;  library carpet    _  kitchen tile
//  d  desk          t  table           h  chair (walkable)
//  p  plant         s  sofa            S  spawn point
export const MAP_ROWS: string[] = [
  '#GG#GG#GG#GG##' + '#GG##GG##GG#' + '##GG#GG#GG#GG#',
  '#p,,,,,,,,,,p#' + 'p..........p' + '#p,,,,,,,,,,p#',
  '#,,,,,,,,,,,,#' + '............' + '#,,,,,,,,,,,,#',
  'W,,,hhhhhh,,,#' + '..dd....dd..' + '#,,,hhhhhh,,,W',
  'W,,htttttth,,#' + '..hh....hh..' + '#,,htttttth,,W',
  'W,,htttttth,,#' + '............' + '#,,htttttth,,W',
  '#,,,hhhhhh,,,#' + '..dd....dd..' + '#,,,hhhhhh,,,#',
  '#,,,,,,,,,,,,#' + '..hh....hh..' + '#,,,,,,,,,,,,#',
  '#p,,,,,,,,,,p#' + '............' + '#p,,,,,,,,,,p#',
  '######.#######' + '............' + '#######.######',
  '#......................................#',
  '#..dddd....dddd....p.....dddd....dddd..#',
  '#..hhhh....hhhh..........hhhh....hhhh..#',
  'G......................................G',
  'G......................................G',
  '#..dddd....dddd....p.....dddd....dddd..#',
  '#..hhhh....hhhh..........hhhh....hhhh..#',
  '#......................................#',
  '######.#######' + '............' + '#######.######',
  '#____________#' + '............' + '#;;;;;;;;;;;;B',
  'K____________#' + '..p......p..' + '#;;;;;;;;;;;;B',
  'K___tt__tt___#' + '............' + '#;;BBBB;BBBB;B',
  'K___hh__hh___#' + '....ssss....' + '#;;;;;;;;;;;;B',
  '#____________#' + '............' + '#;;BBBB;BBBB;B',
  '#ss_________p#' + '.....S......' + '#;;;;;;;;;;;;B',
  '#____________#' + '............' + '#;s;;;;;;;;s;B',
  '#p__________p#' + 'p..........p' + '#p;;;;;;;;;;pB',
  '#KKKKKKKKKK###' + '###GG##GG###' + 'BBBBBBBBBBBBBB',
];

export const MAP_W = MAP_ROWS[0].length;
export const MAP_H = MAP_ROWS.length;

export const WALLS = new Set(['#', 'G', 'W', 'B', 'K']);
export const FLOORS = new Set(['.', ',', ';', '_']);
export const FURNITURE = new Set(['d', 't', 'h', 'p', 's']);
const BLOCKING = new Set([...WALLS, 'd', 't', 'p', 's']);

export function tileAt(x: number, y: number): string {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return '#';
  return MAP_ROWS[y][x];
}

export const isWall = (t: string) => WALLS.has(t);
export const isBlocking = (x: number, y: number) => BLOCKING.has(tileAt(x, y));

/** The floor drawn underneath a tile (furniture sits on whatever floor surrounds it). */
export function baseFloor(x: number, y: number): string {
  const t = tileAt(x, y);
  if (FLOORS.has(t)) return t;
  if (t === 'S') return '.';
  const around = [[0, -1], [0, 1], [-1, 0], [1, 0], [0, -2], [0, 2], [-2, 0], [2, 0]];
  for (const [dx, dy] of around) {
    const n = tileAt(x + dx, y + dy);
    if (FLOORS.has(n)) return n;
  }
  return '.';
}

function findSpawn() {
  for (let y = 0; y < MAP_H; y++) {
    const x = MAP_ROWS[y].indexOf('S');
    if (x >= 0) return { x: x + 0.5, y: y + 0.5 };
  }
  return { x: MAP_W / 2, y: MAP_H / 2 };
}
export const SPAWN = findSpawn();

export interface Area {
  id: string;
  name: string;
  /** Private areas hold one meeting that nobody outside can hear, see or read. */
  private: boolean;
  /** Inclusive tile rectangles: [x0, y0, x1, y1]. */
  rects: [number, number, number, number][];
  /** Most people allowed inside at once; absent means unlimited. */
  capacity?: number;
  /** Restricted areas admit only `allowed` members, or people an occupant admits after a knock. */
  restricted: boolean;
  /** Member ids (stable per-browser UUIDs) allowed into a restricted area. */
  allowed: string[];
  /** Draw a lit border around the area for people inside it. */
  highlight: boolean;
}

const area = (a: Pick<Area, 'id' | 'name' | 'rects'> & Partial<Area>): Area => ({
  private: false,
  restricted: false,
  allowed: [],
  highlight: !!a.private,
  ...a,
});

export const AREAS: Area[] = [
  area({ id: 'meet-a', name: 'Meeting Room A', private: true, rects: [[1, 1, 12, 8]] }),
  area({ id: 'meet-b', name: 'Meeting Room B', private: true, rects: [[27, 1, 38, 8]] }),
  area({ id: 'kitchen', name: 'Kitchen', rects: [[1, 19, 12, 26]] }),
  area({ id: 'library', name: 'Library', rects: [[27, 19, 38, 26]] }),
  area({ id: 'lobby', name: 'Lobby', rects: [[14, 18, 25, 26]] }),
  area({ id: 'open', name: 'Open Office', rects: [[14, 1, 25, 9], [1, 10, 38, 17]] }),
];

export function areaById(id: string): Area | undefined {
  return AREAS.find((a) => a.id === id);
}

export function areaAt(x: number, y: number): Area | null {
  const tx = Math.floor(x), ty = Math.floor(y);
  for (const z of AREAS) {
    for (const [x0, y0, x1, y1] of z.rects) {
      if (tx >= x0 && tx <= x1 && ty >= y0 && ty <= y1) return z;
    }
  }
  return null;
}

// ---------------------------------------------------------------- desks

type Rect = [number, number, number, number];
const inRect = (x: number, y: number, [x0, y0, x1, y1]: Rect) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const rectsOverlap = (a: Rect, b: Rect) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

export type PodMode = 'ambient' | 'cubicle';

/** A group of desks. Neighbours in an ambient pod hear each other faintly; cubicle desks are private. */
export interface DeskPod {
  id: string;
  /** At most 25 characters. */
  name: string;
  rects: Rect[];
  mode: PodMode;
}

export interface Desk {
  /** `<podId>:<seatX>,<seatY>` */
  id: string;
  podId: string;
  /** The chair tile. */
  seat: { x: number; y: number };
  /** Seat, adjacent desk tiles, and a one-tile ring of walkable floor. Desks never share a tile. */
  tiles: { x: number; y: number }[];
}

export const DESK_NAME_MAX = 25;

// The eight desk rows in the open office: four clusters across, two rows deep. Each pod spans a
// cluster plus the walkable tile around it.
const POD_COLUMNS: [number, number][] = [[3, 6], [11, 14], [25, 28], [33, 36]];
const POD_DESK_ROWS = [11, 15]; // desks on this row, chairs on the row below
export const DESK_PODS: DeskPod[] = POD_DESK_ROWS.flatMap((row, r) =>
  POD_COLUMNS.map(([x0, x1], c) => ({
    id: `pod-${r * POD_COLUMNS.length + c + 1}`,
    name: `Desk pod ${r * POD_COLUMNS.length + c + 1}`,
    rects: [[x0 - 1, row - 1, x1 + 1, row + 2] as Rect],
    mode: 'ambient' as PodMode,
  })),
);

const keyOf = (x: number, y: number) => `${x},${y}`;
const NEIGHBOURS_4 = [[0, -1], [0, 1], [-1, 0], [1, 0]];

/** Finds every desk: a chair tile inside a pod next to at least one desk tile. */
export function deriveDesks(pods: DeskPod[] = DESK_PODS): Desk[] {
  interface Raw { id: string; podId: string; seat: { x: number; y: number }; furniture: { x: number; y: number }[] }
  const raws: Raw[] = [];
  for (const pod of pods) {
    const seen = new Set<string>();
    for (const r of pod.rects) {
      for (let y = r[1]; y <= r[3]; y++) {
        for (let x = r[0]; x <= r[2]; x++) {
          if (tileAt(x, y) !== 'h' || seen.has(keyOf(x, y))) continue;
          seen.add(keyOf(x, y));
          const furniture = NEIGHBOURS_4
            .map(([dx, dy]) => ({ x: x + dx, y: y + dy }))
            .filter((t) => tileAt(t.x, t.y) === 'd');
          if (furniture.length) raws.push({ id: `${pod.id}:${x},${y}`, podId: pod.id, seat: { x, y }, furniture });
        }
      }
    }
  }

  // Every desk claims its own tiles first; contested floor goes to the nearest seat.
  const owned = new Set<string>();
  for (const d of raws) {
    owned.add(keyOf(d.seat.x, d.seat.y));
    d.furniture.forEach((t) => owned.add(keyOf(t.x, t.y)));
  }
  const ring = new Map<string, { tile: { x: number; y: number }; desk: Raw; dist: number }>();
  for (const d of raws) {
    const pod = pods.find((p) => p.id === d.podId)!;
    for (const base of [d.seat, ...d.furniture]) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const t = { x: base.x + dx, y: base.y + dy };
          const k = keyOf(t.x, t.y);
          if (owned.has(k) || isBlocking(t.x, t.y) || !pod.rects.some((r) => inRect(t.x, t.y, r))) continue;
          const dist = Math.hypot(t.x - d.seat.x, t.y - d.seat.y);
          const best = ring.get(k);
          if (!best || dist < best.dist || (dist === best.dist && d.id < best.desk.id)) ring.set(k, { tile: t, desk: d, dist });
        }
      }
    }
  }
  return raws.map((d) => ({
    id: d.id,
    podId: d.podId,
    seat: d.seat,
    tiles: [d.seat, ...d.furniture, ...[...ring.values()].filter((r) => r.desk === d).map((r) => r.tile)],
  }));
}

export const DESKS: Desk[] = deriveDesks();
const DESK_BY_TILE = new Map<string, Desk>();
for (const d of DESKS) for (const t of d.tiles) DESK_BY_TILE.set(keyOf(t.x, t.y), d);

export const deskById = (id: string): Desk | undefined => DESKS.find((d) => d.id === id);
export const podById = (id: string): DeskPod | undefined => DESK_PODS.find((p) => p.id === id);

/** The desk whose area contains this position. */
export function deskAt(x: number, y: number): Desk | null {
  return DESK_BY_TILE.get(keyOf(Math.floor(x), Math.floor(y))) ?? null;
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
