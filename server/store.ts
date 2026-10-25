import fs from 'node:fs';
import path from 'node:path';
import { areaById, deskById, podById, type PodMode } from '../shared/map';

export interface DeskClaim {
  memberId: string;
  name: string;
  claimedAt: number;
}

/** Everything that must survive a server restart. */
export interface StoredState {
  version: 1;
  /** Desk id -> who holds it. A member holds at most one desk. */
  deskClaims: Record<string, DeskClaim>;
  /** Admin overrides of a pod's mode. */
  podModes: Record<string, PodMode>;
  /** Admin overrides of a restricted area's allow-list (member ids). */
  areaAllowed: Record<string, string[]>;
}

const FILE = 'office-state.json';
const MAX_ALLOWED = 200;

export const emptyState = (): StoredState => ({ version: 1, deskClaims: {}, podModes: {}, areaAllowed: {} });

/** Reads untrusted JSON into a valid state, dropping anything that no longer fits the office. */
export function parseState(raw: unknown): StoredState {
  const out = emptyState();
  if (typeof raw !== 'object' || raw === null || (raw as { version?: unknown }).version !== 1) return out;
  const r = raw as Partial<Record<keyof StoredState, unknown>>;

  const claims = Object.entries((r.deskClaims ?? {}) as Record<string, Partial<DeskClaim>>)
    .filter(([deskId, c]) =>
      deskById(deskId) && typeof c?.memberId === 'string' && c.memberId && !c.memberId.startsWith('eph-'))
    .map(([deskId, c]) => ({
      deskId,
      claim: {
        memberId: c.memberId!,
        name: String(c.name ?? 'Member').slice(0, 24),
        claimedAt: typeof c.claimedAt === 'number' ? c.claimedAt : 0,
      },
    }))
    .sort((a, b) => a.claim.claimedAt - b.claim.claimedAt);
  const holders = new Set<string>();
  for (const { deskId, claim } of claims) {
    if (holders.has(claim.memberId)) continue; // one desk per member: the earliest claim wins
    holders.add(claim.memberId);
    out.deskClaims[deskId] = claim;
  }

  for (const [podId, mode] of Object.entries((r.podModes ?? {}) as Record<string, unknown>)) {
    if (podById(podId) && (mode === 'ambient' || mode === 'cubicle')) out.podModes[podId] = mode;
  }
  for (const [areaId, ids] of Object.entries((r.areaAllowed ?? {}) as Record<string, unknown>)) {
    if (areaById(areaId) && Array.isArray(ids)) {
      out.areaAllowed[areaId] = ids.filter((m): m is string => typeof m === 'string').slice(0, MAX_ALLOWED);
    }
  }
  return out;
}

export function loadState(dir: string): StoredState {
  try {
    return parseState(JSON.parse(fs.readFileSync(path.join(dir, FILE), 'utf8')));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') console.warn(`Ignoring unreadable ${FILE}:`, (err as Error).message);
    return emptyState();
  }
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
