// Room kits: a finished little room (walls with a doorway, finishes, a style, furniture and a named room) that a builder stamps
// into a draft in one step. Everything here is original and made of the same pieces any builder can place by hand.
import { currentCatalog, type Catalog } from './catalog';
import { MAX_PAINTS, UNPAINTED, paintChar } from './finishes';
import { MAX_ROOMS, NO_WALL, normalizeLayout, rotFootprint, type Face, type Layout, type PlacedObject, type Rot } from './layout';

export interface KitObject {
  kind: string;
  /** Offsets from the kit's top-left corner. For wall decor, the wall tile it hangs on. */
  x: number;
  y: number;
  rot: Rot;
  wall?: Face;
}

export interface RoomKit {
  id: string;
  name: string;
  /** Outer size, including the walls: at most 12×12. */
  w: number;
  h: number;
  /** `w*h` wall codes; a space is open floor, and the doorway is a space on the edge. */
  walls: string;
  /** Paint keys the kit uses, and per-tile characters into them (a space leaves the floor as it is). */
  paints: string[];
  floorPaint: string;
  wallPaint?: string;
  style?: { theme: string };
  objects: KitObject[];
  room: { name: string; private: boolean };
  /** Where the doorway is on the bottom edge, as an offset. */
  door: number;
}

export const KIT_MAX = 12;

/** Walls all round with a doorway in the bottom edge, and windows at the given top-edge offsets. */
function shell(w: number, h: number, door: number, windows: number[] = []): string {
  let out = '';
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      out += !edge || (y === h - 1 && x === door) ? NO_WALL : y === 0 && windows.includes(x) ? 'G' : '#';
    }
  }
  return out;
}

/** Floor paint over the whole inside, in `key`, optionally with a second finish in the border ring of the inside. */
function inside(w: number, h: number, ring = false): string {
  let out = '';
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const inner = x > 0 && y > 0 && x < w - 1 && y < h - 1;
      out += !inner ? UNPAINTED : ring && (x === 1 || y === 1 || x === w - 2 || y === h - 2) ? '"' : '!';
    }
  }
  return out;
}

const o = (kind: string, x: number, y: number, rot: Rot = 0): KitObject => ({ kind, x, y, rot });
const decor = (kind: string, x: number, y = 0, wall: Face = 's'): KitObject => ({ kind, x, y, rot: 0, wall });

export const ROOM_KITS: RoomKit[] = [
  {
    id: 'lounge', name: 'Lounge', w: 9, h: 7, door: 4, walls: shell(9, 7, 4), paints: ['carpet-loop:b2574a', 'planks-wide:7b5436'], floorPaint: inside(9, 7, true),
    style: { theme: 'cozy-cabin' }, room: { name: 'Lounge', private: false },
    objects: [o('sofa', 2, 1), o('sofa', 3, 1), o('sofa', 4, 1), o('item:rm-armchair', 6, 2, 3), o('item:rm-coffee-table', 3, 3), o('item:rm-floor-lamp', 7, 1), o('plant', 1, 5), decor('item:rm-poster', 3)],
  },
  {
    id: 'library-corner', name: 'Library corner', w: 8, h: 7, door: 5, walls: shell(8, 7, 5), paints: ['library-diamond'], floorPaint: inside(8, 7),
    room: { name: 'Library corner', private: false },
    objects: [o('item:rm-bookshelf', 1, 1), o('item:rm-bookshelf', 3, 1), o('item:rm-bookshelf', 5, 1), o('item:rm-armchair', 1, 4, 3), o('item:rm-floor-lamp', 1, 3), o('table', 3, 4), decor('item:rm-clock', 4)],
  },
  {
    id: 'boardroom', name: 'Boardroom', w: 11, h: 8, door: 5, walls: shell(11, 8, 5), paints: ['carpet-striped:44577f'], floorPaint: inside(11, 8),
    style: { theme: 'scandinavian' }, room: { name: 'Boardroom', private: true },
    objects: [o('item:rm-round-meeting-table', 4, 3), o('item:rm-office-chair', 3, 3, 3), o('item:rm-office-chair', 3, 4, 3), o('item:rm-office-chair', 6, 3, 1), o('item:rm-office-chair', 6, 4, 1), o('item:rm-office-chair', 4, 2, 0), o('item:rm-office-chair', 5, 2, 0), decor('item:rm-small-whiteboard', 5)],
  },
  {
    id: 'cafe', name: 'Café', w: 10, h: 8, door: 4, walls: shell(10, 8, 4), paints: ['tile-square:e9dfc8', 'checker-tile:9ccdb4'], floorPaint: inside(10, 8, true),
    style: { theme: 'garden-atrium' }, room: { name: 'Café', private: false },
    objects: [o('table', 2, 2), o('item:rm-stool', 1, 2), o('item:rm-stool', 3, 2), o('table', 6, 2), o('item:rm-stool', 5, 2), o('item:rm-stool', 7, 2), o('item:rm-reception-desk', 5, 5), o('item:rm-water-cooler', 1, 5), o('plant', 8, 1)],
  },
  {
    id: 'game-room', name: 'Game room', w: 9, h: 8, door: 4, walls: shell(9, 8, 4), paints: ['checker-tile:7d5a86', 'checker-tile:464a52'], floorPaint: inside(9, 8, true),
    style: { theme: 'retro-arcade' }, room: { name: 'Game room', private: false },
    objects: [o('item:rm-arcade-cabinet', 1, 1, 0), o('item:rm-arcade-cabinet', 2, 1, 0), o('item:rm-arcade-cabinet', 3, 1, 0), o('item:rm-bean-bag', 6, 2), o('item:rm-bean-bag', 7, 4), o('item:rm-coffee-table', 5, 3), decor('item:rm-banner', 5)],
  },
  {
    id: 'quiet-booth', name: 'Quiet booth', w: 5, h: 5, door: 2, walls: shell(5, 5, 2), paints: ['felt-floor:5b6573'], floorPaint: inside(5, 5),
    style: { theme: 'night-mode' }, room: { name: 'Quiet booth', private: true },
    objects: [o('item:rm-armchair', 1, 1, 0), o('item:rm-floor-lamp', 3, 1), o('plant', 3, 3)],
  },
  {
    id: 'studio', name: 'Studio', w: 10, h: 7, door: 5, walls: shell(10, 7, 5, [2, 4, 6]), paints: ['concrete-polished:b9b4a8'], floorPaint: inside(10, 7),
    style: { theme: 'scandinavian' }, room: { name: 'Studio', private: false },
    objects: [o('item:rm-drafting-table', 1, 2), o('item:rm-drafting-table', 1, 4), o('item:rm-stool', 3, 2), o('item:rm-stool', 3, 4), o('item:rm-low-shelf', 6, 5), o('item:rm-filing-cabinet', 8, 1), decor('item:rm-corkboard', 8)],
  },
  {
    id: 'garden-nook', name: 'Garden nook', w: 7, h: 6, door: 3, walls: shell(7, 6, 3, [2, 4]), paints: ['grass', 'flagstone:b9b4a8'], floorPaint: inside(7, 6, true),
    style: { theme: 'garden-atrium' }, room: { name: 'Garden nook', private: false },
    objects: [o('item:rm-potted-palm', 1, 1), o('item:rm-fern', 5, 1), o('item:rm-bench', 3, 1), o('item:rm-cactus', 5, 3), o('item:rm-aquarium', 1, 3)],
  },
];

export const kitById = (id: string): RoomKit | undefined => ROOM_KITS.find((k) => k.id === id);

export type StampError = 'off-map' | 'covers-desk' | 'covers-spawn';
export const STAMP_MESSAGES: Record<StampError, string> = {
  'off-map': 'That does not fit inside the office.',
  'covers-desk': 'That would cover a desk someone holds.',
  'covers-spawn': 'That would cover the spot where people appear.',
  };

/**
 * Stamps `kit` with its top-left corner at (x, y): its walls, finishes, furniture and room go into a copy of `layout`, and what stood
 * in that rectangle is replaced. It is refused when it would leave the grid, or cover the spawn point or a desk someone holds
 * (`claimedTiles` are `"x,y"` of those desk spaces).
 */
export function stampKit(
  layout: Layout, kit: RoomKit, x: number, y: number, claimedTiles: ReadonlySet<string> = new Set(), catalog: Catalog = currentCatalog(),
): { layout: Layout; roomId: string } | { error: StampError } {
  if (x < 0 || y < 0 || x + kit.w > layout.w || y + kit.h > layout.h) return { error: 'off-map' };
  if (layout.spawn.x >= x && layout.spawn.x < x + kit.w && layout.spawn.y >= y && layout.spawn.y < y + kit.h) return { error: 'covers-spawn' };
  for (let j = 0; j < kit.h; j++) for (let i = 0; i < kit.w; i++) if (claimedTiles.has(`${x + i},${y + j}`)) return { error: 'covers-desk' };

  const l: Layout = { ...layout, objects: [...layout.objects], rooms: [...layout.rooms], paints: [...(layout.paints ?? [])] };
  const inRect = (tx: number, ty: number) => tx >= x && ty >= y && tx < x + kit.w && ty < y + kit.h;

  // What stood there goes: floor things by the tiles they cover, wall decor and desk items by where they are.
  l.objects = l.objects.filter((ob) => {
    const item = catalog.get(ob.kind);
    if (!item) return true;
    if (item.kind === 'floor' || item.kind === 'floorart') {
      const [fw, fd] = rotFootprint(item.footprint, ob.rot);
      return !(ob.x < x + kit.w && ob.x + fw > x && ob.y < y + kit.h && ob.y + fd > y);
    }
    if (item.kind === 'wall') return !inRect(ob.x, ob.y);
    return true; // desk items go with their desks when `normalizeLayout` finds no host
  });

  const walls = layout.walls.split(''), floorPaint = (layout.floorPaint ?? UNPAINTED.repeat(layout.w * layout.h)).split(''), wallPaint = (layout.wallPaint ?? UNPAINTED.repeat(layout.w * layout.h)).split('');
  const index = new Map<string, number>(l.paints!.map((k, i) => [k, i]));
  const slot = (key: string): number => {
    let i = index.get(key);
    if (i === undefined && l.paints!.length < MAX_PAINTS) {
      i = l.paints!.push(key) - 1;
      index.set(key, i);
    }
    return i ?? -1;
  };
  for (let j = 0; j < kit.h; j++) {
    for (let i = 0; i < kit.w; i++) {
      const at = (y + j) * layout.w + x + i, k = j * kit.w + i;
      walls[at] = kit.walls[k];
      const fp = kit.floorPaint[k];
      floorPaint[at] = UNPAINTED;
      if (fp !== UNPAINTED) {
        const s = slot(kit.paints[fp.charCodeAt(0) - 33]);
        if (s >= 0) floorPaint[at] = paintChar(s);
      }
      wallPaint[at] = UNPAINTED;
      const wp = kit.wallPaint?.[k];
      if (wp && wp !== UNPAINTED) {
        const s = slot(kit.paints[wp.charCodeAt(0) - 33]);
        if (s >= 0) wallPaint[at] = paintChar(s);
      }
    }
  }
  l.walls = walls.join('');
  l.floorPaint = floorPaint.join('');
  l.wallPaint = wallPaint.join('');

  const taken = new Set(l.objects.map((ob) => ob.id));
  let n = 1;
  const fresh = (kind: string) => {
    const base = kind.replace(/^item:rm-/, '').replace(/[^a-z0-9]+/g, '-').slice(0, 20);
    for (;;) {
      const id = `${base}-${kit.id.slice(0, 8)}-${n++}`.slice(0, 40);
      if (!taken.has(id)) {
        taken.add(id);
        return id;
      }
    }
  };
  for (const ob of kit.objects) {
    const placed: PlacedObject = { id: fresh(ob.kind), kind: ob.kind, x: x + ob.x, y: y + ob.y, rot: ob.rot, ...(ob.wall ? { wall: ob.wall } : {}) };
    l.objects.push(placed);
  }

  let roomId = `${kit.id}-1`;
  for (let k = 1; l.rooms.some((r) => r.id === roomId); k++) roomId = `${kit.id}-${k + 1}`;
  if (l.rooms.length < MAX_ROOMS) {
    l.rooms.push({
      id: roomId, name: kit.room.name, private: kit.room.private, rects: [[x + 1, y + 1, x + kit.w - 2, y + kit.h - 2]], restricted: false, allowed: [], highlight: kit.room.private,
      ...(kit.style ? { style: { ...kit.style } } : {}),
    });
  }
  return { layout: normalizeLayout(l, catalog).layout, roomId };
}
