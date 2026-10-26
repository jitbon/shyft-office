import fs from 'node:fs';
import path from 'node:path';
import { DESKS, areaById, deskById, podById, type PodMode } from '../shared/map';
import { MAX_MEMBER_ID } from '../shared/member';

export interface DeskClaim {
  memberId: string;
  name: string;
  claimedAt: number;
}

/** Why a member is to be told about their desk: the office was redesigned, or their desk was removed in an update. */
export type DeskNoticeKind = 'reset' | 'removed';
export interface DeskNotice {
  memberId: string;
  kind: DeskNoticeKind;
}

/** Everything that must survive a server restart. */
export interface StoredState {
  version: 3;
  /** Desk object id -> who holds it. A member holds at most one desk. */
  deskClaims: Record<string, DeskClaim>;
  /** Admin overrides of a pod's mode. */
  podModes: Record<string, PodMode>;
  /** Admin overrides of a restricted area's allow-list (member ids). */
  areaAllowed: Record<string, string[]>;
  /** Members to tell, once, that their desk was reset or removed. */
  deskNotice: DeskNotice[];
  /** Whether non-admin members can edit the office layout. */
  buildingEnabled: boolean;
  /** Whether an admin has switched the item helper on. Off until they do. */
  helperEnabled: boolean;
}

const FILE = 'office-state.json';
const MAX_ALLOWED = 200;
const MAX_NOTICE = 500;

export const emptyState = (): StoredState => ({
  version: 3, deskClaims: {}, podModes: {}, areaAllowed: {}, deskNotice: [], buildingEnabled: true, helperEnabled: false,
});

const realMember = (id: unknown): id is string =>
  typeof id === 'string' && !!id && id.length <= MAX_MEMBER_ID && !id.startsWith('eph-');

/** Notices worth keeping: real members, each kind once per member, at most MAX_NOTICE. */
function notices(list: DeskNotice[]): DeskNotice[] {
  const seen = new Set<string>();
  const out: DeskNotice[] = [];
  for (const n of list) {
    const key = `${n.kind}|${n.memberId}`;
    if (!realMember(n.memberId) || seen.has(key)) continue;
    seen.add(key);
    out.push({ memberId: n.memberId, kind: n.kind });
    if (out.length >= MAX_NOTICE) break;
  }
  return out;
}

const roomAllowLists = (raw: unknown, out: StoredState) => {
  for (const [areaId, ids] of Object.entries((raw ?? {}) as Record<string, unknown>)) {
    if (areaById(areaId) && Array.isArray(ids)) {
      out.areaAllowed[areaId] = ids.filter((m): m is string => typeof m === 'string').slice(0, MAX_ALLOWED);
    }
  }
};

/** The desk a saved claim key points at: a desk id, or (from version 2) `<pod>:<seatX>,<seatY>`, the desk with that chair. */
function deskFor(key: string): string | undefined {
  const direct = deskById(key);
  if (direct) return direct.id;
  const m = /^pod-\d+:(\d+),(\d+)$/.exec(key);
  return m ? DESKS.find((d) => d.seat.x === Number(m[1]) && d.seat.y === Number(m[2]))?.id : undefined;
}

/**
 * Reads untrusted JSON into a valid state, dropping anything that no longer fits the office.
 * - A version 1 file comes from the old desk layout, whose desk and pod ids mean something else now: every claim
 *   and pod mode is released, and each former claim holder is listed once to be told.
 * - A version 2 file keys claims by `<pod>:<seatX>,<seatY>`: each is moved to the desk whose chair is there.
 *   A claim with no such desk is released and its holder told.
 * - A version 3 file keys claims by desk id. Claims for desks that are gone are released and their holders told.
 */
export function parseState(raw: unknown): StoredState {
  const out = emptyState();
  if (typeof raw !== 'object' || raw === null) return out;
  const r = raw as Partial<Record<string, unknown>>;
  const version = r.version;

  if (version === 1) {
    const claims = Object.values((r.deskClaims ?? {}) as Record<string, Partial<DeskClaim> | null>);
    out.deskNotice = notices(claims.map((c) => ({ memberId: c?.memberId as string, kind: 'reset' as const })));
    roomAllowLists(r.areaAllowed, out);
    return out;
  }
  if (version !== 2 && version !== 3) return out;

  const lost: DeskNotice[] = [];
  const claims: { deskId: string; claim: DeskClaim }[] = [];
  for (const [key, c] of Object.entries((r.deskClaims ?? {}) as Record<string, Partial<DeskClaim>>)) {
    if (!realMember(c?.memberId)) continue;
    const deskId = deskFor(key);
    if (!deskId) {
      lost.push({ memberId: c.memberId, kind: 'removed' });
      continue;
    }
    claims.push({
      deskId,
      claim: {
        memberId: c.memberId,
        name: String(c.name ?? 'Member').slice(0, 24),
        claimedAt: typeof c.claimedAt === 'number' ? c.claimedAt : 0,
      },
    });
  }
  claims.sort((a, b) => a.claim.claimedAt - b.claim.claimedAt);
  const holders = new Set<string>();
  for (const { deskId, claim } of claims) {
    if (holders.has(claim.memberId) || out.deskClaims[deskId]) continue; // one desk per member: the earliest claim wins
    holders.add(claim.memberId);
    out.deskClaims[deskId] = claim;
  }

  for (const [podId, mode] of Object.entries((r.podModes ?? {}) as Record<string, unknown>)) {
    if (podById(podId) && (mode === 'ambient' || mode === 'cubicle')) out.podModes[podId] = mode;
  }
  roomAllowLists(r.areaAllowed, out);

  const kept: DeskNotice[] = [];
  if (version === 2 && Array.isArray(r.deskResetNotice)) {
    for (const id of r.deskResetNotice) kept.push({ memberId: id as string, kind: 'reset' });
  }
  if (version === 3 && Array.isArray(r.deskNotice)) {
    for (const n of r.deskNotice as Partial<DeskNotice>[]) {
      if (n && (n.kind === 'reset' || n.kind === 'removed')) kept.push({ memberId: n.memberId as string, kind: n.kind });
    }
  }
  out.deskNotice = notices([...kept, ...lost]);
  out.buildingEnabled = version === 3 ? r.buildingEnabled !== false : true;
  out.helperEnabled = version === 3 && r.helperEnabled === true;
  return out;
}

export function loadState(dir: string): StoredState {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(path.join(dir, FILE), 'utf8'));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') console.warn(`Ignoring unreadable ${FILE}:`, (err as Error).message);
    return emptyState();
  }
  const state = parseState(raw);
  const version = (raw as { version?: unknown } | null)?.version;
  if (version === 1 || version === 2) {
    // Save the upgraded file at once, so the upgrade happens exactly once.
    const store = new StateStore(dir);
    store.save(state);
    store.flush();
  }
  return state;
}

/** Saves the state in the background: many changes in quick succession become one write. */
export class StateStore {
  private pending: StoredState | null = null;
  private timer: NodeJS.Timeout | undefined;

  constructor(private dir: string, private debounceMs = 1000) {}

  save(state: StoredState) {
    this.pending = state;
    this.timer ??= setTimeout(() => this.flush(), this.debounceMs);
    this.timer.unref?.();
  }

  /** Writes any pending state now. Call on shutdown. */
  flush() {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.pending) return;
    const state = this.pending;
    this.pending = null;
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      const file = path.join(this.dir, FILE);
      const tmp = `${file}.tmp`;
      // Write beside the real file, then rename: a crash mid-write never leaves half a file.
      fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
      fs.renameSync(tmp, file);
    } catch (err) {
      console.error('Could not save office state:', (err as Error).message);
    }
  }
}
