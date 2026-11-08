// A desk look: how a member's own desk space looks while they hold the desk. It is a few swaps and additions on top of the
// builder's desk (a different desk and chair of the same size, a computer, up to six small things, one rug, and a floor finish)
// and it never changes who can walk where. Pure, so the server checks it and every client draws it the same way.
import type { Catalog, CatalogItem } from './catalog';
import { parsePaintKey } from './finishes';
import { MAX_ON_DESK_TILE, deskTileOf, rotFootprint, turnPoint, type PlacedObject, type Rot } from './layout';

export const DESK_ITEMS_MAX = 6;
export const DESK_RUGS_MAX = 1;

/** The desk items that count as a computer: they have their own slot, which does not use up one of the six. */
export const COMPUTER_KINDS: readonly string[] = ['item:rm-laptop', 'item:rm-monitor', 'item:rm-dual-monitors'];

export interface LookPiece {
  kind: string;
  /** Top-left corner in the desk's own frame (facing south), in tiles, in steps of 0.05. */
  at: [number, number];
  rot: Rot;
}

export interface DeskLook {
  desk?: string;
  chair?: string;
  /** Absent keeps the builder's computer; null takes it away. */
  computer?: LookPiece | null;
  items: LookPiece[];
  rug?: { kind: string; dx: number; dy: number; rot: Rot };
  /** A floor paint key for the desk space's floor. */
  floor?: string;
}

export interface StoredDeskLook {
  look: DeskLook;
  at: number;
}

export type DeskLookError = 'not-member' | 'no-desk' | 'unknown-item' | 'wrong-size' | 'outside-space' | 'too-many' | 'bad-paint' | 'rate';

export const DESK_LOOK_MESSAGES: Record<DeskLookError, string> = {
  'not-member': 'Guests cannot decorate a desk. Reload the page to get a member id.',
  'no-desk': 'Claim a desk first.',
  'unknown-item': 'One of those things does not exist.',
  'wrong-size': 'The desk and chair must be the same size as the ones they replace.',
  'outside-space': 'Everything has to stay inside your desk space.',
  'too-many': 'That is more than fits: up to 6 desk items and 1 rug.',
  'bad-paint': 'That floor finish is not one of the offered ones.',
  rate: 'Slow down a little.',
};

/** What a look is checked against: the desk the member holds. */
export interface LookDesk {
  /** The desk object as placed (its id is the desk's id). */
  obj: PlacedObject;
  item: CatalogItem;
  /** The chair next to it, and its item. */
  chairItem?: CatalogItem;
  /** The desk space's tiles. */
  tiles: readonly { x: number; y: number }[];
}

const isRot = (r: unknown): r is Rot => r === 0 || r === 1 || r === 2 || r === 3;
const q = (n: number) => Math.round(n * 20) / 20;
const short = (v: unknown, max = 64) => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : undefined);

function clampPiece(raw: unknown): LookPiece | null {
  const o = raw as { kind?: unknown; at?: unknown; rot?: unknown } | null;
  const kind = short(o?.kind);
  const at = o?.at;
  if (!kind || !Array.isArray(at) || at.length !== 2 || !at.every((n) => typeof n === 'number' && Number.isFinite(n)) || !isRot(o?.rot)) return null;
  return { kind, at: [q(at[0] as number), q(at[1] as number)], rot: o!.rot as Rot };
}

/**
 * Reads untrusted JSON into a desk look, or null when it is not one. Strings are length-limited and numbers rounded. Lists are cut a
 * little over their limits, so that `validateDeskLook` can still say "too many".
 */
export function clampDeskLook(raw: unknown): DeskLook | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const out: DeskLook = { items: [] };
  if (r.desk !== undefined) {
    const v = short(r.desk);
    if (!v) return null;
    out.desk = v;
  }
  if (r.chair !== undefined) {
    const v = short(r.chair);
    if (!v) return null;
    out.chair = v;
  }
  if (r.computer === null) out.computer = null;
  else if (r.computer !== undefined) {
    const c = clampPiece(r.computer);
    if (!c) return null;
    out.computer = c;
  }
  if (r.items !== undefined) {
    if (!Array.isArray(r.items)) return null;
    for (const it of r.items.slice(0, DESK_ITEMS_MAX + 1)) {
      const p = clampPiece(it);
      if (!p) return null;
      out.items.push(p);
    }
  }
  if (r.rug !== undefined) {
    const g = r.rug as { kind?: unknown; dx?: unknown; dy?: unknown; rot?: unknown } | null;
    const kind = short(g?.kind);
    if (!kind || typeof g?.dx !== 'number' || typeof g?.dy !== 'number' || !Number.isFinite(g.dx) || !Number.isFinite(g.dy) || !isRot(g.rot)) return null;
    out.rug = { kind, dx: Math.round(g.dx), dy: Math.round(g.dy), rot: g.rot };
  }
  if (r.floor !== undefined) {
    const v = short(r.floor, 40);
    if (!v) return null;
    out.floor = v;
  }
  return out;
}

/** Whether `piece` (a desk item) lies inside a desk of footprint `hw`×`hd` in the desk's own frame. */
function onSurface(piece: LookPiece, item: CatalogItem, hw: number, hd: number): boolean {
  const [iw, id] = rotFootprint(item.footprint, piece.rot);
  const eps = 1e-6;
  return piece.at[0] >= -eps && piece.at[1] >= -eps && piece.at[0] + iw <= hw + eps && piece.at[1] + id <= hd + eps;
}

/** The world tiles a rug covers, and its top-left in the world, given the desk it is laid beside. */
export function rugPlacement(rug: NonNullable<DeskLook['rug']>, rugItem: CatalogItem, desk: PlacedObject, deskItem: CatalogItem): { x: number; y: number; rot: Rot; tiles: [number, number][] } {
  const [hw, hd] = deskItem.footprint;
  const rot = ((desk.rot + rug.rot) & 3) as Rot;
  const [rw, rd] = rotFootprint(rugItem.footprint, rug.rot); // its size in the desk's own frame
  const corners = [[rug.dx, rug.dy], [rug.dx + rw, rug.dy], [rug.dx, rug.dy + rd], [rug.dx + rw, rug.dy + rd]].map(([fx, fy]) => turnPoint(fx, fy, hw, hd, desk.rot));
  const x = desk.x + Math.round(Math.min(...corners.map((c) => c[0])) * 20) / 20, y = desk.y + Math.round(Math.min(...corners.map((c) => c[1])) * 20) / 20;
  const [ww, wd] = rotFootprint(rugItem.footprint, rot);
  const tiles: [number, number][] = [];
  for (let ty = Math.floor(y + 1e-6); ty < y + wd - 1e-6; ty++) for (let tx = Math.floor(x + 1e-6); tx < x + ww - 1e-6; tx++) tiles.push([tx, ty]);
  return { x: Math.round(x), y: Math.round(y), rot, tiles };
}

/**
 * Why this look cannot be shown at this desk, as a protocol code, or null when it is fine. The same rules as the builder's
 * desk items apply to the pieces on the desk, and everything must stay inside the desk space.
 */
export function validateDeskLook(look: DeskLook, desk: LookDesk, catalog: Catalog): DeskLookError | null {
  const [hw, hd] = desk.item.footprint;
  if (look.desk !== undefined) {
    const it = catalog.get(look.desk);
    if (!it || it.kind !== 'floor' || it.group !== 'desks') return 'unknown-item';
    if (it.footprint[0] !== hw || it.footprint[1] !== hd) return 'wrong-size';
  }
  if (look.chair !== undefined) {
    const it = catalog.get(look.chair);
    if (!it || it.kind !== 'floor' || it.group !== 'chairs') return 'unknown-item';
    const want = desk.chairItem?.footprint ?? [1, 1];
    if (it.footprint[0] !== want[0] || it.footprint[1] !== want[1]) return 'wrong-size';
  }
  if (look.items.length > DESK_ITEMS_MAX) return 'too-many';
  const counts = new Map<string, number>();
  const check = (p: LookPiece, computer: boolean): DeskLookError | null => {
    const it = catalog.get(p.kind);
    if (!it || it.kind !== 'deskitem') return 'unknown-item';
    if (computer && !COMPUTER_KINDS.includes(p.kind)) return 'unknown-item'; // the computer slot takes only computers
    if (!onSurface(p, it, hw, hd)) return 'outside-space';
    const [iw, id] = rotFootprint(it.footprint, p.rot);
    const key = deskTileOf(hw, hd, p.at, iw, id).join(',');
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return (counts.get(key) ?? 0) > MAX_ON_DESK_TILE ? 'outside-space' : null;
  };
  if (look.computer) {
    const bad = check(look.computer, true);
    if (bad) return bad;
  }
  for (const p of look.items) {
    const bad = check(p, false);
    if (bad) return bad;
  }
  if (look.rug) {
    const it = catalog.get(look.rug.kind);
    if (!it || it.kind !== 'floorart') return 'unknown-item';
    const inSpace = new Set(desk.tiles.map((t) => `${t.x},${t.y}`));
    if (!rugPlacement(look.rug, it, desk.obj, desk.item).tiles.every(([x, y]) => inSpace.has(`${x},${y}`))) return 'outside-space';
  }
  if (look.floor !== undefined) {
    const p = parsePaintKey(look.floor);
    if (!p || p.finish.surface !== 'floor') return 'bad-paint';
  }
  return null;
}

/** The objects a look puts on its desk: desk items (on the desk, in its frame) and a rug. */
export function lookObjects(look: DeskLook, desk: PlacedObject, deskItem: CatalogItem, catalog: Catalog): { items: PlacedObject[]; rug?: PlacedObject } {
  const items: PlacedObject[] = [];
  const pieces = [...(look.computer ? [look.computer] : []), ...look.items];
  pieces.forEach((p, i) => {
    const it = catalog.get(p.kind);
    if (!it || it.kind !== 'deskitem' || !onSurface(p, it, deskItem.footprint[0], deskItem.footprint[1])) return; // a piece that does not fit here is skipped
    items.push({ id: `look-${desk.id}-${i}`.slice(0, 40), kind: p.kind, x: 0, y: 0, rot: p.rot, on: desk.id, at: p.at });
  });
  let rug: PlacedObject | undefined;
  if (look.rug) {
    const it = catalog.get(look.rug.kind);
    if (it && it.kind === 'floorart') {
      const at = rugPlacement(look.rug, it, desk, deskItem);
      rug = { id: `look-${desk.id}-rug`.slice(0, 40), kind: look.rug.kind, x: at.x, y: at.y, rot: at.rot };
    }
  }
  return { items, ...(rug ? { rug } : {}) };
}

/** A look with nothing in it (and so, nothing to show). */
export const isEmptyLook = (l: DeskLook) =>
  l.desk === undefined && l.chair === undefined && l.computer === undefined && l.items.length === 0 && l.rug === undefined && l.floor === undefined;

