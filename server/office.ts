import {
  AREAS, DESKS, DESK_PODS, areaAt, areaById, deskAt, deskById, podById, type PodMode,
} from '../shared/map';
import type { OfficeSnapshot, PlayerStatus } from '../shared/protocol';
import type { OfficeInput } from '../shared/proximity';
import { emptyState, type DeskClaim, type DeskNotice, type DeskNoticeKind, type StoredState } from './store';

export type EntryDenied = 'full' | 'restricted' | 'locked';

/** The slice of a connected player that office rules need. */
export interface OfficePlayer {
  id: string;
  memberId: string;
  x: number;
  y: number;
  name?: string;
  status?: PlayerStatus;
}

export type DeskResult = { ok: true; deskId: string } | { ok: false; error: string };

export interface Knock {
  areaId: string;
  memberId: string;
  playerId: string;
  at: number;
}

export const KNOCK_TTL_MS = 60_000;
/** Most people one desk owner can have invited at a time. */
export const MAX_DESK_GUESTS = 50;

/**
 * Who may be where: capacity, restricted areas, knocking and admission.
 * Rules live here, as plain data and functions, so they can be tested without a server.
 */
export class OfficeState {
  /** memberId -> areas the person was let into and has not left since. */
  private admitted = new Map<string, Set<string>>();
  private knocks = new Map<string, Knock>();
  /** Admin-set allow-lists; they replace the allow-list written in the map data. */
  private allowedOverride = new Map<string, Set<string>>();
  private claims = new Map<string, DeskClaim>();
  private podModeOverride = new Map<string, PodMode>();
  /** Desks whose owner has locked them. Locks are never saved: they end when the owner leaves. */
  private locked = new Set<string>();
  /** deskId -> member ids the owner invited. */
  private guests = new Map<string, Set<string>>();
  /** Members still to be told that their desk was reset or removed. Saved, so a restart does not lose them. */
  private deskNotice: DeskNotice[] = [];
  /** Whether non-admin members can edit the layout. Saved. */
  buildingEnabled = true;
  /** Whether the item helper is switched on. Saved. */
  helperEnabled = false;

  constructor(
    private players: () => Iterable<OfficePlayer>,
    opts: { state?: StoredState; onChange?: () => void } = {},
  ) {
    const state = opts.state ?? emptyState();
    for (const [areaId, ids] of Object.entries(state.areaAllowed)) {
      if (areaById(areaId)) this.allowedOverride.set(areaId, new Set(ids));
    }
    for (const [deskId, claim] of Object.entries(state.deskClaims)) this.claims.set(deskId, claim);
    for (const [podId, mode] of Object.entries(state.podModes)) this.podModeOverride.set(podId, mode);
    this.deskNotice = [...state.deskNotice];
    this.buildingEnabled = state.buildingEnabled;
    this.helperEnabled = state.helperEnabled;
    this.onChange = opts.onChange ?? (() => {});
  }

  private onChange: () => void;

  /** Ids of players currently standing in the area. */
  occupants(areaId: string): string[] {
    const out: string[] = [];
    for (const p of this.players()) {
      if (areaAt(p.x, p.y)?.id === areaId) out.push(p.id);
    }
    return out;
  }

  /** The member ids allowed into an area without knocking. */
  allowedFor(areaId: string): string[] {
    const override = this.allowedOverride.get(areaId);
    return override ? [...override] : [...(areaById(areaId)?.allowed ?? [])];
  }

  setAreaAllowed(areaId: string, memberIds: string[]): boolean {
    if (!areaById(areaId)) return false;
    this.allowedOverride.set(areaId, new Set(memberIds));
    this.onChange();
    return true;
  }

  /** Saves the state in the background, after a change that is not made through a method here. */
  save() {
    this.onChange();
  }

  /** Everything that must survive a restart. */
  persistState(): StoredState {
    return {
      version: 3,
      deskClaims: Object.fromEntries(this.claims),
      podModes: Object.fromEntries(this.podModeOverride),
      areaAllowed: Object.fromEntries([...this.allowedOverride].map(([id, set]) => [id, [...set]])),
      deskNotice: [...this.deskNotice],
      buildingEnabled: this.buildingEnabled,
      helperEnabled: this.helperEnabled,
    };
  }

  /** What to tell a member who lost their desk, once: they are told, then forgotten. */
  takeDeskNotice(memberId: string): DeskNoticeKind | null {
    const first = this.deskNotice.find((n) => n.memberId === memberId);
    if (!first) return null;
    this.deskNotice = this.deskNotice.filter((n) => n.memberId !== memberId);
    this.onChange();
    return first.kind;
  }

  /** Remembers to tell an offline member about their desk the next time they join. */
  addDeskNotice(memberId: string, kind: DeskNoticeKind) {
    if (memberId.startsWith('eph-') || this.deskNotice.some((n) => n.memberId === memberId && n.kind === kind)) return;
    if (this.deskNotice.length < 500) this.deskNotice.push({ memberId, kind });
    this.onChange();
  }

  /**
   * Whether `p` may move from (fromX, fromY) to (toX, toY). Only crossing into a different
   * area is checked, so people already inside are never trapped or ejected.
   */
  checkEntry(p: OfficePlayer, fromX: number, fromY: number, toX: number, toY: number): EntryDenied | null {
    const to = areaAt(toX, toY);
    if (to && to.id !== areaAt(fromX, fromY)?.id) {
      if (to.restricted) {
        const allowed = this.allowedFor(to.id).includes(p.memberId) || this.admitted.get(p.memberId)?.has(to.id);
        if (!allowed) return 'restricted';
      }
      if (to.capacity !== undefined) {
        const inside = this.occupants(to.id).filter((id) => id !== p.id).length;
        if (inside >= to.capacity) return 'full';
      }
    }
    // A locked desk is closed to everyone but its owner and invited guests, unless already inside.
    const desk = deskAt(toX, toY);
    if (desk && this.locked.has(desk.id) && deskAt(fromX, fromY)?.id !== desk.id && !this.isGuestOf(desk.id, p.memberId)) {
      return 'locked';
    }
    return null;
  }

  // ------------------------------------------------------------------ desks

  /** The desk a member holds, if any. */
  deskOf(memberId: string): string | undefined {
    for (const [deskId, c] of this.claims) if (c.memberId === memberId) return deskId;
    return undefined;
  }

  ownerOf(deskId: string): DeskClaim | undefined {
    return this.claims.get(deskId);
  }

  isLocked(deskId: string): boolean {
    return this.locked.has(deskId);
  }

  /** Whether the member invited to that desk, or owns it. */
  isGuestOf(deskId: string, memberId: string): boolean {
    return this.claims.get(deskId)?.memberId === memberId || !!this.guests.get(deskId)?.has(memberId);
  }

  /** Claims a desk, or the first free one when `deskId` is omitted. A member holds one desk at a time. */
  claim(p: OfficePlayer, deskId?: string): DeskResult {
    if (p.memberId.startsWith('eph-')) {
      return { ok: false, error: 'Guests cannot claim a desk. Reload the page to get a member id.' };
    }
    const target = deskId === undefined ? DESKS.find((d) => !this.claims.has(d.id))?.id : deskById(deskId)?.id;
    if (!target) return { ok: false, error: deskId === undefined ? 'No desks are free.' : 'That desk does not exist.' };
    const holder = this.claims.get(target);
    if (holder && holder.memberId !== p.memberId) return { ok: false, error: 'That desk is already claimed.' };
    if (holder) return { ok: true, deskId: target };
    this.unclaim(p.memberId); // switching desks releases the old one
    this.claims.set(target, { memberId: p.memberId, name: (p.name ?? 'Member').slice(0, 24), claimedAt: Date.now() });
    this.onChange();
    return { ok: true, deskId: target };
  }

  unclaim(memberId: string): boolean {
    const deskId = this.deskOf(memberId);
    if (!deskId) return false;
    this.claims.delete(deskId);
    this.locked.delete(deskId);
    this.guests.delete(deskId);
    this.onChange();
    return true;
  }

  /** Locks the player's own desk, which only works while they are at it. */
  lock(p: OfficePlayer): DeskResult {
    const deskId = this.deskOf(p.memberId);
    if (!deskId) return { ok: false, error: 'Claim a desk first.' };
    if (deskAt(p.x, p.y)?.id !== deskId) return { ok: false, error: 'Go to your desk to lock it.' };
    this.locked.add(deskId);
    return { ok: true, deskId };
  }

  /** Unlocking also withdraws every invitation. */
  unlock(memberId: string): boolean {
    const deskId = this.deskOf(memberId);
    if (!deskId) return false;
    const was = this.locked.delete(deskId);
    this.guests.delete(deskId);
    return was;
  }

  /** The owner invites someone to their desk. The caller has already checked the id's shape. */
  invite(owner: OfficePlayer, guestMemberId: string): DeskResult {
    const deskId = this.deskOf(owner.memberId);
    if (!deskId) return { ok: false, error: 'Claim a desk first.' };
    if (guestMemberId === owner.memberId) return { ok: false, error: 'You cannot invite yourself.' };
    const set = this.guests.get(deskId) ?? new Set<string>();
    if (!set.has(guestMemberId) && set.size >= MAX_DESK_GUESTS) return { ok: false, error: 'Too many invitations.' };
    set.add(guestMemberId);
    this.guests.set(deskId, set);
    return { ok: true, deskId };
  }

  /**
   * Call after a player's position changed. A lock ends when its owner leaves the desk area.
   * Returns true when something changed that everyone should see.
   */
  afterMove(p: OfficePlayer): boolean {
    const deskId = this.deskOf(p.memberId);
    if (deskId && this.locked.has(deskId) && deskAt(p.x, p.y)?.id !== deskId) return this.unlock(p.memberId);
    return false;
  }

  podMode(podId: string): PodMode {
    return this.podModeOverride.get(podId) ?? podById(podId)?.mode ?? 'ambient';
  }

  setPodMode(podId: string, mode: PodMode): boolean {
    if (!podById(podId) || (mode !== 'ambient' && mode !== 'cubicle')) return false;
    this.podModeOverride.set(podId, mode);
    this.onChange();
    return true;
  }

  /**
   * Call after a new layout became the office. Releases what no longer exists: claims (with their lock and
   * invitations) on desks that are gone, and allow-lists, admissions, knocks and pod modes for rooms and pods that
   * are gone. A desk that only moved keeps its claim, because the desk keeps its id. Returns the released claims, so
   * their holders can be told.
   */
  reconcile(): { released: { memberId: string; deskId: string }[] } {
    const released: { memberId: string; deskId: string }[] = [];
    let changed = false;
    for (const [deskId, claim] of [...this.claims]) {
      if (deskById(deskId)) continue;
      this.claims.delete(deskId);
      released.push({ memberId: claim.memberId, deskId });
      changed = true;
    }
    for (const deskId of [...this.locked]) if (!deskById(deskId)) this.locked.delete(deskId);
    for (const deskId of [...this.guests.keys()]) if (!deskById(deskId)) this.guests.delete(deskId);
    for (const areaId of [...this.allowedOverride.keys()]) {
      if (areaById(areaId)) continue;
      this.allowedOverride.delete(areaId);
      changed = true;
    }
    for (const [memberId, areas] of [...this.admitted]) {
      for (const areaId of [...areas]) if (!areaById(areaId)) areas.delete(areaId);
      if (!areas.size) this.admitted.delete(memberId);
    }
    for (const key of [...this.knocks.keys()]) if (!areaById(key.slice(0, key.indexOf('|')))) this.knocks.delete(key);
    for (const podId of [...this.podModeOverride.keys()]) {
      if (podById(podId)) continue;
      this.podModeOverride.delete(podId);
      changed = true;
    }
    if (changed) this.onChange();
    return { released };
  }

  /** What the link rules need to know about desks right now. */
  linkInput(): OfficeInput {
    const players = [...this.players()];
    const locked = new Map<string, Set<string>>();
    for (const deskId of this.locked) {
      const allowed = new Set<string>();
      for (const p of players) if (this.isGuestOf(deskId, p.memberId)) allowed.add(p.id);
      locked.set(deskId, allowed);
    }
    return {
      locked,
      cubiclePods: new Set(DESK_PODS.filter((p) => this.podMode(p.id) === 'cubicle').map((p) => p.id)),
      deskLabels: new Map([...this.claims].map(([id, c]) => [id, `${c.name}'s desk`])),
    };
  }

  /** Call after a move is accepted. Leaving an area ends any admission to it. */
  noteMove(memberId: string, fromAreaId: string | null, toAreaId: string | null) {
    if (fromAreaId && fromAreaId !== toAreaId) this.admitted.get(memberId)?.delete(fromAreaId);
  }

  /** Forget a departed member's session state. */
  leave(memberId: string) {
    this.unlock(memberId);
    this.admitted.delete(memberId);
    for (const [key, k] of this.knocks) if (k.memberId === memberId) this.knocks.delete(key);
  }

  /** Records a knock. Returns null when knocking makes no sense (unknown or unrestricted area, or already inside). */
  knock(areaId: string, p: OfficePlayer): Knock | null {
    const area = areaById(areaId);
    if (!area?.restricted || areaAt(p.x, p.y)?.id === areaId) return null;
    const knock: Knock = { areaId, memberId: p.memberId, playerId: p.id, at: Date.now() };
    this.knocks.set(`${areaId}|${p.memberId}`, knock);
    return knock;
  }

  /**
   * An occupant answers a knock. Only someone standing in the area may answer, and only while
   * the knock is still pending. Returns the knock, or null when the answer is not valid.
   */
  admit(areaId: string, memberId: string, allow: boolean, by: OfficePlayer): Knock | null {
    if (areaAt(by.x, by.y)?.id !== areaId) return null;
    const key = `${areaId}|${memberId}`;
    const knock = this.knocks.get(key);
    if (!knock) return null;
    this.knocks.delete(key);
    if (Date.now() - knock.at > KNOCK_TTL_MS) return null;
    if (allow) {
      const set = this.admitted.get(memberId) ?? new Set<string>();
      set.add(areaId);
      this.admitted.set(memberId, set);
    }
    return knock;
  }

  /** Public state of the areas people care about: private, limited or restricted ones. */
  snapshot(): OfficeSnapshot {
    return {
      areas: AREAS.filter((a) => a.private || a.capacity !== undefined || a.restricted).map((a) => ({
        id: a.id,
        occupants: this.occupants(a.id).length,
        ...(a.capacity === undefined ? {} : { capacity: a.capacity }),
        restricted: a.restricted,
      })),
      pods: DESK_PODS.map((p) => ({ id: p.id, mode: this.podMode(p.id) })),
      desks: [...this.claims].map(([id, c]) => {
        const online = [...this.players()].find((p) => p.memberId === c.memberId);
        return {
          id,
          locked: this.locked.has(id),
          owner: {
            memberId: c.memberId,
            name: online?.name ?? c.name,
            online: !!online,
            ...(online?.status ? { status: online.status } : {}),
          },
        };
      }),
    };
  }
}
