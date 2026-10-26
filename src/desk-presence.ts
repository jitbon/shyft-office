// The browser's side of desk presence: reads where you are, the compiled world and who owns which desk each frame, and keeps the
// dwell timer. The decisions themselves are pure and live in shared/desk-presence.ts.
import { DeskDwell, presenceOf, readDeskViewSetting, writeDeskViewSetting, type DeskPresence } from '../shared/desk-presence';
import { areaAt, getWorld } from '../shared/map';
import { deskOwners } from './office-ui';

const dwell = new DeskDwell();

/** The device's storage, when the browser lets us have it (a private window or blocked site data may not). */
const storage = (): Storage | undefined => {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
};

/** Whether the desk view opens by itself. Read once; changing it takes effect at once and is remembered on this device. */
let viewOn = readDeskViewSetting(storage());
export const deskViewOn = () => viewOn;
export function setDeskViewOn(on: boolean) {
  viewOn = on;
  writeDeskViewSetting(storage(), on);
}

/** Which desk space `me` is in (for the highlight), and the id of your own desk when its video view is due (null otherwise). */
export function deskPresenceNow(me: { x: number; y: number; memberId: string }, now: number): { highlight: DeskPresence; view: string | null } {
  const r = dwell.update(presenceOf(getWorld(), me.x, me.y, me.memberId, deskOwners()), now);
  // With the setting off the highlight still works (FR-014), only the view does not open by itself.
  return viewOn ? r : { highlight: r.highlight, view: null };
}

const roomDwell = new DeskDwell(0);

/**
 * The name of the meeting room (private area) you are in, once you are in it, and for a moment after you leave; null elsewhere.
 * You walk into a room on purpose, so there is no wait before it shows. Follows the same setting as the desk view.
 */
export function roomViewNow(me: { x: number; y: number }, now: number): string | null {
  const area = areaAt(me.x, me.y);
  if (area?.private) lastRoomName = area.name;
  const r = roomDwell.update(area?.private ? { deskId: area.id, mine: true, tiles: [] } : null, now);
  return viewOn && r.view !== null ? lastRoomName : null;
}
let lastRoomName: string | null = null;

/** The words of the cue for the desk space you are in: only your own desk has any. */
export const deskCueText = (p: DeskPresence): string | null => (p?.mine ? 'Your desk' : null);
