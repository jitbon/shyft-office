// The office that ships with the app, and the first published layout. It is written as rows of characters because
// that is easy to read and edit by hand; `defaultLayout()` turns it into the same Layout a builder edits.
//
//  #  wall          G  window wall     W  whiteboard wall
//  B  bookshelf     K  kitchen counter
//  .  wood floor    ,  carpet          ;  library carpet    _  kitchen tile
//  d  desk          t  table           h  chair (walkable)
//  p  plant         s  sofa            S  spawn point
import { NO_WALL, type Layout, type PlacedObject, type Pod, type Rect, type Room, type Rot } from './layout';

export const LEGACY_ROWS: string[] = [
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
  '#.............p...........p............#',
  '#.....h...h.......h...h.......h...h....#',
  'G....ddd.ddd.....ddd.ddd.....ddd.ddd...G',
  'G....ddd.ddd.....ddd.ddd.....ddd.ddd...G',
  '#.....h...h.......h...h.......h...h....#',
  '#.............p...........p............#',
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

const WALL_CHARS = new Set(['#', 'G', 'W', 'B', 'K']);
const FLOOR_CHARS = new Set(['.', ',', ';', '_']);

const room = (r: Pick<Room, 'id' | 'name' | 'rects'> & Partial<Room>): Room => ({
  private: false,
  restricted: false,
  allowed: [],
  highlight: !!r.private,
  ...r,
});

const ROOMS: Room[] = [
  room({ id: 'meet-a', name: 'Meeting Room A', private: true, rects: [[1, 1, 12, 8]] }),
  room({ id: 'meet-b', name: 'Meeting Room B', private: true, rects: [[27, 1, 38, 8]] }),
  room({ id: 'kitchen', name: 'Kitchen', rects: [[1, 19, 12, 26]] }),
  room({ id: 'library', name: 'Library', rects: [[27, 19, 38, 26]] }),
  room({ id: 'lobby', name: 'Lobby', rects: [[14, 18, 25, 26]] }),
  room({ id: 'open', name: 'Open Office', rects: [[14, 1, 25, 9], [1, 10, 38, 17]] }),
];

// Three pods of four desks: two desks facing two, with a chair on the outer side of each.
const POD_COLUMNS: [number, number][] = [[5, 11], [17, 23], [29, 35]];
const POD_ROWS: [number, number] = [11, 16];

/** The floor under a tile: furniture and walls sit on whatever floor is around them. */
function floorUnder(rows: string[], x: number, y: number): string {
  const at = (px: number, py: number) => rows[py]?.[px] ?? '#';
  const t = at(x, y);
  if (FLOOR_CHARS.has(t)) return t;
  if (t === 'S') return '.';
  for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0], [0, -2], [0, 2], [-2, 0], [2, 0]]) {
    const n = at(x + dx, y + dy);
    if (FLOOR_CHARS.has(n)) return n;
  }
  return '.';
}

export function defaultLayout(rows: string[] = LEGACY_ROWS): Layout {
  const h = rows.length, w = rows[0].length;
  const at = (x: number, y: number) => rows[y]?.[x] ?? '#';
  let floor = '', walls = '';
  const objects: PlacedObject[] = [];
  let spawn = { x: Math.floor(w / 2), y: Math.floor(h / 2) };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = at(x, y);
      floor += floorUnder(rows, x, y);
      walls += WALL_CHARS.has(t) ? t : NO_WALL;
      if (t === 'S') spawn = { x, y };
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = at(x, y);
      if (t === 'd' && at(x - 1, y) !== 'd') {
        let len = 0;
        while (at(x + len, y) === 'd') len++;
        if (len !== 2 && len !== 3) throw new Error(`desk run of ${len} at ${x},${y}`);
        const chairAbove = Array.from({ length: len }, (_, i) => at(x + i, y - 1)).includes('h');
        const kind = len === 3 ? 'desk' : 'desk-small';
        objects.push({ id: `${kind}-${x}-${y}`, kind, x, y, rot: chairAbove ? 2 : 0 });
      } else if (t === 'h') {
        const faces = (c: string) => c === 'd' || c === 't';
        // A chair turns toward the desk or table beside it: south 0, west 1, north 2, east 3.
        let rot: Rot = 0;
        if (faces(at(x, y + 1))) rot = 0;
        else if (faces(at(x, y - 1))) rot = 2;
        else if (faces(at(x + 1, y))) rot = 3;
        else if (faces(at(x - 1, y))) rot = 1;
        objects.push({ id: `chair-${x}-${y}`, kind: 'chair', x, y, rot });
      } else if (t === 't' || t === 'p' || t === 's') {
        const kind = t === 't' ? 'table' : t === 'p' ? 'plant' : 'sofa';
        objects.push({ id: `${kind}-${x}-${y}`, kind, x, y, rot: 0 });
      }
    }
  }

  const pods: Pod[] = POD_COLUMNS.map(([x0, x1], i) => ({
    id: `pod-${i + 1}`,
    name: `Desk pod ${i + 1}`,
    rects: [[x0 - 1, POD_ROWS[0], x1 + 1, POD_ROWS[1]] as Rect],
    mode: 'ambient' as const,
  }));

  return {
    w, h, floor, walls, objects,
    rooms: ROOMS.map((r) => ({ ...r, rects: r.rects.map((q) => [...q] as Rect), allowed: [...r.allowed] })),
    pods,
    spawn,
  };
}
