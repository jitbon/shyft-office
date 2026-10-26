// Finds what is wrong with a layout before it is published. Pure: the builder runs it on every edit and
// the server runs it again before accepting a publish, so neither has to trust the other.
import { currentCatalog, type Catalog } from './catalog';
import { MAX_OBJECTS, normalizeLayout, type Layout, type Rect } from './layout';
import { compileWorld, type World } from './world';

export type ProblemCode =
  | 'spawn-outside'
  | 'spawn-blocked'
  | 'unreachable'
  | 'room-overlap'
  | 'pod-overlap'
  | 'pod-in-private-room'
  | 'object-outside'
  | 'object-overlap'
  | 'bad-name'
  | 'bad-merge'
  | 'item-orphan'
  | 'item-limit'
  | 'too-many-objects';

export interface Problem {
  code: ProblemCode;
  message: string;
  /** Tiles to outline on the map. */
  tiles: [number, number][];
}

const overlap = (a: Rect, b: Rect) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

function overlapTiles(a: Rect[], b: Rect[]): [number, number][] {
  const out = new Map<string, [number, number]>();
  for (const p of a) {
    for (const q of b) {
      if (!overlap(p, q)) continue;
      for (let y = Math.max(p[1], q[1]); y <= Math.min(p[3], q[3]); y++) {
        for (let x = Math.max(p[0], q[0]); x <= Math.min(p[2], q[2]); x++) out.set(`${x},${y}`, [x, y]);
      }
    }
  }
  return [...out.values()];
}

function rectTiles(rects: Rect[], limit = 400): [number, number][] {
  const out: [number, number][] = [];
  for (const [x0, y0, x1, y1] of rects) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (out.length < limit) out.push([x, y]);
  }
  return out;
}

/** Everything wrong with `layout`, or an empty list. Pass the compiled world if you already have it. */
export function checkLayout(layout: Layout, catalog: Catalog = currentCatalog(), world?: World): Problem[] {
  const problems: Problem[] = [];
  const { w, h } = layout;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;
  const W = world ?? compileWorld(layout, catalog);

  if (layout.objects.length > MAX_OBJECTS) {
    problems.push({ code: 'too-many-objects', message: `An office can hold at most ${MAX_OBJECTS} objects.`, tiles: [] });
  }

  // Objects: inside the grid, not on a wall, and not on each other.
  const used = new Map<string, number>();
  for (const o of W.objects) {
    const outside: [number, number][] = [];
    for (let y = o.y; y < o.y + o.d; y++) for (let x = o.x; x < o.x + o.w; x++) if (!inside(x, y)) outside.push([x, y]);
    if (outside.length) {
      problems.push({ code: 'object-outside', message: `${o.item.name} is partly outside the office.`, tiles: outside.filter(([x, y]) => inside(x, y)) });
    }
  }
  const clashes = new Map<string, [number, number]>();
  for (const o of W.objects) {
    for (let y = o.y; y < o.y + o.d; y++) {
      for (let x = o.x; x < o.x + o.w; x++) {
        if (!inside(x, y)) continue;
        const k = y * w + x;
        used.set(String(k), (used.get(String(k)) ?? 0) + 1);
        const wc = layout.walls[k];
        if (used.get(String(k))! > 1 || (wc && wc !== ' ')) clashes.set(String(k), [x, y]);
      }
    }
  }
  if (clashes.size) {
    problems.push({ code: 'object-overlap', message: 'Furniture is overlapping other furniture or a wall.', tiles: [...clashes.values()] });
  }

  // Spawn.
  const sp = layout.spawn;
  if (!inside(sp.x, sp.y)) {
    problems.push({ code: 'spawn-outside', message: 'The spawn point is outside the office.', tiles: [] });
  } else if (W.block[sp.y * w + sp.x] === 1) {
    problems.push({ code: 'spawn-blocked', message: 'The spawn point is on a wall or furniture.', tiles: [[sp.x, sp.y]] });
  }

  // Rooms and pods.
  for (let i = 0; i < layout.rooms.length; i++) {
    const a = layout.rooms[i];
    if (!a.name.trim()) problems.push({ code: 'bad-name', message: 'A room needs a name.', tiles: rectTiles(a.rects, 1) });
    for (let j = i + 1; j < layout.rooms.length; j++) {
      // A private room may sit inside an open area (the lobby, the open office); two of a kind may not overlap.
      if (a.private !== layout.rooms[j].private) continue;
      const tiles = overlapTiles(a.rects, layout.rooms[j].rects);
      if (tiles.length) problems.push({ code: 'room-overlap', message: `${a.name} and ${layout.rooms[j].name} overlap.`, tiles });
    }
  }
  for (let i = 0; i < layout.pods.length; i++) {
    const a = layout.pods[i];
    if (!a.name.trim()) problems.push({ code: 'bad-name', message: 'A desk pod needs a name.', tiles: rectTiles(a.rects, 1) });
    for (let j = i + 1; j < layout.pods.length; j++) {
      const tiles = overlapTiles(a.rects, layout.pods[j].rects);
      if (tiles.length) problems.push({ code: 'pod-overlap', message: `${a.name} and ${layout.pods[j].name} overlap.`, tiles });
    }
    for (const room of layout.rooms) {
      if (!room.private) continue;
      const tiles = overlapTiles(a.rects, room.rects);
      if (tiles.length) problems.push({ code: 'pod-in-private-room', message: `${a.name} overlaps the private room ${room.name}.`, tiles });
    }
  }

  // Desk items and wall decor: attached to something that is gone, or too many in one place. After `normalizeLayout`
  // neither is left, so these only show for a draft loaded from an older file.
  for (const r of normalizeLayout(layout, catalog).removed) {
    if (r.why === 'unknown') continue;
    const o = layout.objects.find((q) => q.id === r.id)!;
    const host = o.on ? layout.objects.find((q) => q.id === o.on) : undefined;
    const tiles: [number, number][] = o.wall ? [[o.x, o.y]] : host ? [[host.x, host.y]] : [];
    problems.push(r.why === 'full'
      ? { code: 'item-limit', message: o.wall ? 'There are too many things on that wall.' : 'There are too many things on that desk tile.', tiles }
      : { code: 'item-orphan', message: o.wall ? 'Wall decor is hanging where there is no wall.' : 'A desk item has no desk to stand on.', tiles });
  }

  // Reachability from the spawn: every room, and every chair at a desk.
  if (inside(sp.x, sp.y) && W.block[sp.y * w + sp.x] !== 1) {
    const seen = new Uint8Array(w * h);
    const queue: number[] = [sp.y * w + sp.x];
    seen[queue[0]] = 1;
    for (let q = 0; q < queue.length; q++) {
      const k = queue[q], x = k % w, y = (k - x) / w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (!inside(nx, ny)) continue;
        const nk = ny * w + nx;
        if (seen[nk] || W.block[nk] === 1) continue;
        seen[nk] = 1;
        queue.push(nk);
      }
    }
    for (const room of layout.rooms) {
      const tiles = rectTiles(room.rects, 2000).filter(([x, y]) => inside(x, y));
      if (tiles.length && !tiles.some(([x, y]) => seen[y * w + x])) {
        problems.push({ code: 'unreachable', message: `${room.name || 'A room'} can't be reached from the spawn point.`, tiles: tiles.slice(0, 400) });
      }
    }
    for (const d of W.desks) {
      if (!seen[d.seat.y * w + d.seat.x]) {
        problems.push({ code: 'unreachable', message: 'A desk chair can’t be reached from the spawn point.', tiles: [[d.seat.x, d.seat.y]] });
      }
    }
  }
  return problems;
}
