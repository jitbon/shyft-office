// Who is connected to whom. Pure functions: the server runs them every tick to decide
// conversations, and the client uses `gainFor` to set per-peer volume.
import { areaAt, deskAt, isWall, tileAt } from './map';
import type { LinkContext, LinkKind, StatusKind } from './protocol';

/** Open-floor talking range, in tiles. */
export const TALK_RANGE = 3;
/** An existing link survives until the pair is this much farther apart than TALK_RANGE. */
export const HYSTERESIS = 1;
/** Most people in one open-floor conversation (direct browser-to-browser calls, see research R1). */
export const MAX_OPEN = 8;
/** Ambient (desk pod) hearing range, in tiles. */
export const POD_RANGE = 6;
/** Ambient neighbours are heard at this fraction of full volume at most. */
export const AMBIENT_GAIN = 0.2;

export interface LinkPlayer {
  id: string;
  x: number;
  y: number;
  status: { kind: StatusKind };
}

export interface PairLink {
  a: string;
  b: string;
  kind: LinkKind;
  context: LinkContext;
}

export interface ConversationGroup {
  /** Id of the earliest-joined member, so it stays stable while that member stays. */
  id: string;
  context: LinkContext;
  label: string;
  /** In join order. */
  members: string[];
}

export interface LinkResult {
  links: PairLink[];
  conversations: ConversationGroup[];
  /** In range of a conversation that is already at the cap. */
  overflow: Set<string>;
}

/** Desk state the link rules need. Kept as plain data so the rules stay pure. */
export interface OfficeInput {
  /** Locked desk id -> ids of the players allowed inside it (the owner and invited guests). */
  locked?: ReadonlyMap<string, ReadonlySet<string>>;
  /** Pods whose desks act as private areas. */
  cubiclePods?: ReadonlySet<string>;
  /** Display name for a desk's conversation, by desk id. */
  deskLabels?: ReadonlyMap<string, string>;
}

export interface LinkOptions {
  range?: number;
  hysteresis?: number;
  maxOpen?: number;
}

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** The conversation links of a result, as the `prev` argument for the next call. */
export const prevFrom = (links: PairLink[]): Set<string> =>
  new Set(links.filter((l) => l.kind === 'conversation' && l.context === 'open').map((l) => pairKey(l.a, l.b)));

/**
 * True when no wall tile lies on the segment between the two points (tile coordinates).
 * Furniture does not block. Amanatides-Woo grid traversal.
 */
export function lineOfSight(x0: number, y0: number, x1: number, y1: number): boolean {
  let tx = Math.floor(x0), ty = Math.floor(y0);
  const ex = Math.floor(x1), ey = Math.floor(y1);
  if (isWall(tileAt(tx, ty))) return false;
  const dx = x1 - x0, dy = y1 - y0;
  const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1;
  const tDeltaX = dx === 0 ? Infinity : Math.abs(1 / dx);
  const tDeltaY = dy === 0 ? Infinity : Math.abs(1 / dy);
  let tMaxX = dx === 0 ? Infinity : (dx > 0 ? tx + 1 - x0 : x0 - tx) * tDeltaX;
  let tMaxY = dy === 0 ? Infinity : (dy > 0 ? ty + 1 - y0 : y0 - ty) * tDeltaY;
  // The segment crosses at most |ex-tx| + |ey-ty| tile borders.
  let guard = Math.abs(ex - tx) + Math.abs(ey - ty) + 2;
  while ((tx !== ex || ty !== ey) && guard-- > 0) {
    if (tMaxX < tMaxY) {
      tx += stepX;
      tMaxX += tDeltaX;
    } else {
      ty += stepY;
      tMaxY += tDeltaY;
    }
    if (isWall(tileAt(tx, ty))) return false;
  }
  return true;
}

/**
 * The private context a position falls in, ignoring status. Chat uses this so that someone
 * alone in a meeting room still chats inside the room, never to the whole office.
 */
export function positionContext(x: number, y: number, who?: string, office: OfficeInput = {}): LinkContext {
  const area = areaAt(x, y);
  if (area?.private) return `area:${area.id}`;
  const desk = deskAt(x, y);
  if (desk) {
    const allowed = office.locked?.get(desk.id);
    // Someone standing in a locked desk without an invitation stays in the open: they are not let into its meeting.
    if (allowed) return who !== undefined && allowed.has(who) ? `desk:${desk.id}` : 'open';
    if (office.cubiclePods?.has(desk.podId)) return `desk:${desk.id}`;
  }
  return 'open';
}

function contextOf(p: LinkPlayer, office: OfficeInput): { context: LinkContext; label: string } | null {
  if (p.status.kind === 'dnd') return null;
  const context = positionContext(p.x, p.y, p.id, office);
  if (context === 'open') return { context, label: 'Nearby' };
  if (context.startsWith('desk:')) return { context, label: office.deskLabels?.get(context.slice(5)) ?? 'Desk' };
  return { context, label: areaAt(p.x, p.y)!.name };
}

/** The ambient pod a player is seated in, when it is an ambient one. */
function seatedPod(p: LinkPlayer, office: OfficeInput): string | null {
  const desk = deskAt(p.x, p.y);
  return desk && !office.cubiclePods?.has(desk.podId) ? desk.podId : null;
}

/**
 * Computes every link and conversation for one tick. `players` must be in join order.
 * `prev` holds the open-floor conversation pairs from the previous tick (see `prevFrom`),
 * which stay linked out to `range + hysteresis`.
 */
export function computeLinks(
  players: LinkPlayer[],
  prev: ReadonlySet<string> = new Set(),
  opts: LinkOptions = {},
  office: OfficeInput = {},
): LinkResult {
  const range = opts.range ?? TALK_RANGE;
  const hyst = opts.hysteresis ?? HYSTERESIS;
  const maxOpen = opts.maxOpen ?? MAX_OPEN;
  const links: PairLink[] = [];
  const conversations: ConversationGroup[] = [];
  const overflow = new Set<string>();

  const open: LinkPlayer[] = [];
  const byArea = new Map<LinkContext, { label: string; members: LinkPlayer[] }>();
  for (const p of players) {
    const c = contextOf(p, office);
    if (!c) continue;
    if (c.context === 'open') {
      open.push(p);
    } else {
      const g = byArea.get(c.context) ?? { label: c.label, members: [] };
      g.members.push(p);
      byArea.set(c.context, g);
    }
  }

  // Private areas and private desks: everyone inside is in one conversation, however far apart.
  for (const [context, g] of byArea) {
    if (g.members.length < 2) continue;
    conversations.push({ id: g.members[0].id, context, label: g.label, members: g.members.map((m) => m.id) });
    for (let i = 0; i < g.members.length; i++) {
      for (let j = i + 1; j < g.members.length; j++) {
        links.push({ a: g.members[i].id, b: g.members[j].id, kind: 'conversation', context });
      }
    }
  }

  // Open floor: pair links by distance and line of sight, grouped into connected components.
  const parent = open.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const pairs: [number, number][] = [];
  for (let i = 0; i < open.length; i++) {
    for (let j = i + 1; j < open.length; j++) {
      const a = open[i], b = open[j];
      // Neighbours seated in the same ambient pod only overhear each other; walking up opens a conversation.
      const pod = seatedPod(a, office);
      if (pod && pod === seatedPod(b, office)) continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const limit = prev.has(pairKey(a.id, b.id)) ? range + hyst : range;
      if (d > limit || !lineOfSight(a.x, a.y, b.x, b.y)) continue;
      pairs.push([i, j]);
      parent[find(i)] = find(j);
    }
  }
  const comps = new Map<number, number[]>();
  open.forEach((_, i) => {
    const r = find(i);
    comps.set(r, [...(comps.get(r) ?? []), i]);
  });
  const kept = new Set<number>();
  for (const idxs of comps.values()) {
    if (idxs.length < 2) continue;
    const members = idxs.slice(0, maxOpen); // idxs is already in join order
    idxs.slice(maxOpen).forEach((i) => overflow.add(open[i].id));
    members.forEach((i) => kept.add(i));
    conversations.push({
      id: open[members[0]].id,
      context: 'open',
      label: 'Nearby',
      members: members.map((i) => open[i].id),
    });
  }
  for (const [i, j] of pairs) {
    if (kept.has(i) && kept.has(j)) {
      links.push({ a: open[i].id, b: open[j].id, kind: 'conversation', context: 'open' });
    }
  }

  // Ambient pod hearing: seated neighbours who are not already in one conversation.
  const seated = open.map((p, i) => ({ i, pod: seatedPod(p, office) })).filter((s) => s.pod);
  for (let x = 0; x < seated.length; x++) {
    for (let y = x + 1; y < seated.length; y++) {
      const a = seated[x], b = seated[y];
      if (a.pod !== b.pod || find(a.i) === find(b.i)) continue;
      links.push({ a: open[a.i].id, b: open[b.i].id, kind: 'ambient', context: `pod:${a.pod}` });
    }
  }

  return { links, conversations, overflow };
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Playback volume (0-1) for a peer at `dist` tiles. */
export function gainFor(kind: LinkKind, context: LinkContext, dist: number): number {
  if (kind === 'ambient') return AMBIENT_GAIN * clamp01(1 - dist / POD_RANGE);
  if (context === 'open') return clamp01(1 - dist / TALK_RANGE);
  return 1;
}
