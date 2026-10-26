// Desk presence (specs/005-desk-presence): being "at your desk" worked out from where you stand, so every browser reaches the
// same answer from the same published layout. Pure: plain data in, plain data out, no DOM and no storage. Nothing here is
// stored or sent; the server's rules for who hears and sees whom are untouched.

/** A tile of the map. */
export interface Tile {
  x: number;
  y: number;
}

/** What presence needs of a compiled world: its desks and their spaces (seat, desk top and the ring of floor round them). */
export interface DeskSpaces {
  desks: readonly { id: string; tiles: readonly Tile[] }[];
}

/** The desk space a member is in, or null when they are in none. */
export type DeskPresence = null | { deskId: string; mine: boolean; tiles: readonly Tile[] };

/** The desk space containing the position, and whether it is this member's own (`owners` maps desk id to owner member id). */
export function presenceOf(world: DeskSpaces, x: number, y: number, memberId: string, owners: Readonly<Record<string, string>>): DeskPresence {
  const tx = Math.floor(x), ty = Math.floor(y);
  const desk = world.desks.find((d) => d.tiles.some((t) => t.x === tx && t.y === ty));
  if (!desk) return null;
  // A guest (a member id that starts with `eph-`) cannot own a desk, whatever the table says.
  const mine = !memberId.startsWith('eph-') && owners[desk.id] === memberId;
  return { deskId: desk.id, mine, tiles: desk.tiles };
}

/** How long you must stay in your own desk space before the video view opens (so crossing a desk never flashes it). */
export const VIEW_OPEN_MS = 1000;
/** How long the video view stays after you leave (so a quick step out and back in does not flicker it). */
export const VIEW_CLOSE_MS = 600;

/**
 * Turns presence into what to show. `highlight` is the presence as it is, at once. `view` is the id of the desk space you are in
 * (any desk, yours or not) once you have stayed `VIEW_OPEN_MS` in it, and it stays that id for `VIEW_CLOSE_MS` after you leave;
 * otherwise null. Moving straight into a different desk space starts the wait again.
 */
export class DeskDwell {
  /** The desk space entered, when we entered it, and when we left it (null while inside). */
  private deskId: string | null = null;
  private since = 0;
  private outAt: number | null = null;
  /** The desk id last reported as the view. */
  private shown: string | null = null;

  /** `openMs` is how long you must stay before the view opens (a desk: 1000; a room, where you walk in on purpose: 0). */
  constructor(private openMs = VIEW_OPEN_MS, private closeMs = VIEW_CLOSE_MS) {}

  update(presence: DeskPresence, now: number): { highlight: DeskPresence; view: string | null } {
    if (presence) {
      const back = this.deskId === presence.deskId && (this.outAt === null || now - this.outAt < this.closeMs);
      if (!back) {
        this.deskId = presence.deskId;
        this.since = now;
        this.shown = null;
      }
      this.outAt = null;
      if (now - this.since >= this.openMs) this.shown = presence.deskId;
      return { highlight: presence, view: this.shown };
    }
    // Outside every desk space.
    if (this.deskId !== null) {
      this.outAt ??= now;
      if (this.shown !== null && now - this.outAt < this.closeMs) return { highlight: presence, view: this.shown };
      this.deskId = null;
      this.outAt = null;
      this.shown = null;
    }
    return { highlight: presence, view: null };
  }
}

/** One edge of the outline of a set of tiles, in tile units: a unit-long horizontal or vertical segment. */
export interface Edge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** The boundary of a set of tiles: one unit edge for every tile side whose neighbour is not in the set. */
export function outlineEdges(tiles: readonly Tile[]): Edge[] {
  const inSet = new Set(tiles.map((t) => `${t.x},${t.y}`));
  const has = (x: number, y: number) => inSet.has(`${x},${y}`);
  const out: Edge[] = [];
  for (const { x, y } of tiles) {
    if (!has(x, y - 1)) out.push({ x1: x, y1: y, x2: x + 1, y2: y });
    if (!has(x, y + 1)) out.push({ x1: x, y1: y + 1, x2: x + 1, y2: y + 1 });
    if (!has(x - 1, y)) out.push({ x1: x, y1: y, x2: x, y2: y + 1 });
    if (!has(x + 1, y)) out.push({ x1: x + 1, y1: y, x2: x + 1, y2: y + 1 });
  }
  return out;
}

export type PanelPlan = { kind: 'none' } | { kind: 'desk'; heading: string } | { kind: 'conversation'; heading: string };

/**
 * What the voice and video panel shows: the conversation when there is one (with the desk named in its heading while you are on
 * your own desk), the desk view when you are at your own desk alone, otherwise nothing. `desk` is the due desk view's title;
 * `room` is the name of the meeting room you are in when that view is due; `deskConversation` says the conversation is the one of
 * a desk (its label already names the desk).
 */
export function panelPlan(s: { conversation: string | null; desk: string | null; room?: string | null; deskConversation?: boolean }): PanelPlan {
  // `desk` is how the desk space you are in is called ("Your desk", "Sam's desk", "Free desk"), when its view is due.
  if (s.conversation !== null) {
    // A conversation at a desk is named after that desk (its own label would repeat it).
    if (s.desk && s.deskConversation) return { kind: 'conversation', heading: s.desk };
    return { kind: 'conversation', heading: s.desk ? `${s.desk} · ${s.conversation}` : s.conversation };
  }
  if (s.desk) return { kind: 'desk', heading: s.desk };
  if (s.room) return { kind: 'desk', heading: s.room }; // inside a meeting room on your own: the same one-tile view, headed with the room's name
  return { kind: 'none' };
}

// ------------------------------------------------------------------ the setting

/** Where a device remembers whether the desk view opens by itself (the value `"off"` means it does not). */
export const DESK_VIEW_KEY = 'shyft.deskView';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Whether the desk view opens by itself on this device. On unless it was switched off; storage that fails counts as on. */
export function readDeskViewSetting(storage: Store | undefined): boolean {
  try {
    return storage?.getItem(DESK_VIEW_KEY) !== 'off';
  } catch {
    return true;
  }
}

/** Remembers the setting: "off" is stored, "on" is the absence of the key. Storage that fails is ignored. */
export function writeDeskViewSetting(storage: Store | undefined, on: boolean): void {
  try {
    if (on) storage?.removeItem(DESK_VIEW_KEY);
    else storage?.setItem(DESK_VIEW_KEY, 'off');
  } catch {
    /* a private window: the choice lasts until the page is reloaded */
  }
}
