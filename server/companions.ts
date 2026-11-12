// Pets and plants on the server (feature 014): who owns what, the owner-only changes, and looking after them. The rules
// themselves (mood, growth, spots, poses, range) are in shared/pets.ts; this keeps the records and checks every request.
import crypto from 'node:crypto';
import {
  AWAY_MAX, CARE_PER_CARER, MAX_COMPANION_RECORDS, CARE_RANGE_SERVER, MAX_PLANTS, PET_KINDS, PLANT_KINDS, REACT_GAP_MS,
  actionFits, careCheck, cleanPetName, isCareAction, isPetColor, isPetKind, isPlantId, isPlantKind, nextSpot, petPose, petRestSpot,
  plantSpots, water,
  type CareAction, type CareEntry, type CareTarget, type CompanionError, type PetColor, type PetView, type PlantKind,
  type PlantView, type Trail,
} from '../shared/pets';
import type { CompanionRecord, StoredCare, StoredPlant } from './store';

/** The connection a pet follows: its player id, its owner's path and where they are now. */
export interface Follower {
  id: string;
  trail: Trail;
  x: number;
  y: number;
}

export interface Carer {
  /** Player id: the per-person limit, which guests have too. */
  id: string;
  memberId: string;
  name: string;
  x: number;
  y: number;
  inMatch: boolean;
}

export type CareResult =
  | { ok: false; code: CompanionError }
  | { ok: true; react: boolean; at: number; wateredDays?: number; grew?: boolean };

export type PlantChange = { owner: string; plant: StoredPlant; wasPlaced: boolean };

const publicCare = (c: StoredCare | undefined): CareEntry | undefined => c && { by: c.by, action: c.action, at: c.at };
const spotKey = (s: { x: number; y: number }) => `${s.x},${s.y}`;

export class CompanionBook {
  private records = new Map<string, CompanionRecord>();
  /** Per carer (player id): the times of their recent care actions. */
  private recent = new Map<string, number[]>();
  /** Per target: when it last played a reaction. */
  private reacted = new Map<string, number>();

  constructor(private o: {
    records?: Record<string, CompanionRecord>;
    now: () => number;
    tzOffsetMin: () => number;
    deskOf: (memberId: string) => string | undefined;
    /** The connection a member's pet follows now, or undefined when it rests (offline, in a match, in a jam). */
    follower: (memberId: string) => Follower | undefined;
    /** Member ids with an open connection now: only theirs can be following. */
    online: () => ReadonlySet<string>;
    onChange: () => void;
  }) {
    for (const [id, r] of Object.entries(o.records ?? {})) this.records.set(id, r);
  }

  persist(): Record<string, CompanionRecord> | undefined {
    const out: Record<string, CompanionRecord> = {};
    for (const [id, r] of this.records) if (r.pet || r.plants.length || r.away.length) out[id] = r;
    return Object.keys(out).length ? out : undefined;
  }

  private record(memberId: string, name: string): CompanionRecord {
    let r = this.records.get(memberId);
    if (!r) {
      this.records.set(memberId, (r = { ownerName: name, plants: [], lastSeen: 0, away: [] }));
      if (this.records.size > MAX_COMPANION_RECORDS) this.dropOldest();
    }
    return r;
  }

  /** Past MAX_COMPANION_RECORDS, forgets the member seen longest ago who is not online now. */
  private dropOldest() {
    const online = this.o.online();
    let oldest: string | undefined;
    for (const [id, r] of this.records) {
      if (online.has(id) || r.lastSeen === 0) continue;
      if (!oldest || r.lastSeen < this.records.get(oldest)!.lastSeen) oldest = id;
    }
    if (oldest) this.records.delete(oldest);
  }

  /** The connection a member's pet follows, looked up only for members who are online. */
  private followerOf(memberId: string, online = this.o.online()): Follower | undefined {
    return online.has(memberId) ? this.o.follower(memberId) : undefined;
  }

  // ---------------------------------------------------------------- views

  /** Owners of pets that rest at the pet corner (no desk), in a fixed order, for their corner spots. */
  private cornerOrder(online = this.o.online()): string[] {
    const out: string[] = [];
    for (const [id, r] of this.records) if (r.pet && !this.followerOf(id, online) && !this.o.deskOf(id)) out.push(id);
    return out.sort();
  }

  /** Where a member's pet rests: their desk, or its place in the pet corner. */
  restOf(memberId: string, corner = this.cornerOrder(), index?: ReadonlyMap<string, number>): { x: number; y: number } {
    return petRestSpot(this.o.deskOf(memberId), Math.max(0, index ? index.get(memberId) ?? -1 : corner.indexOf(memberId)));
  }

  petView(memberId: string, corner?: string[], online = this.o.online(), index?: ReadonlyMap<string, number>): PetView | undefined {
    const r = this.records.get(memberId);
    if (!r?.pet) return undefined;
    const f = this.followerOf(memberId, online);
    const care = publicCare(r.pet.lastCare);
    return {
      owner: memberId, ownerName: r.ownerName, ...(f ? { follow: f.id } : {}), rest: this.restOf(memberId, corner, index),
      kind: r.pet.kind, color: r.pet.color, name: r.pet.name, lastCareAt: r.pet.lastCareAt, ...(care ? { lastCare: care } : {}),
    };
  }

  plantView(owner: string, p: StoredPlant): PlantView {
    const care = publicCare(p.lastCare);
    return {
      id: p.id, owner, ownerName: this.records.get(owner)?.ownerName ?? 'Member', kind: p.kind, name: p.name,
      wateredDays: p.wateredDays, lastWateredAt: p.lastWateredAt, ...(care ? { lastCare: care } : {}), ...(p.spot ? { spot: { ...p.spot } } : {}),
    };
  }

  /** Every pet, every placed plant, and `forMember`'s own unplaced plants. */
  views(forMember?: string): { pets: PetView[]; plants: PlantView[] } {
    const online = this.o.online();
    const corner = this.cornerOrder(online);
    const index = new Map(corner.map((id, i) => [id, i]));
    const pets: PetView[] = [];
    const plants: PlantView[] = [];
    for (const [id, r] of this.records) {
      const v = this.petView(id, corner, online, index);
      if (v) pets.push(v);
      for (const p of r.plants) if (p.spot || id === forMember) plants.push(this.plantView(id, p));
    }
    return { pets, plants };
  }

  /** Where a member's pet is right now, worked out the same way every client does. */
  petPos(memberId: string, now: number): { x: number; y: number } | undefined {
    const r = this.records.get(memberId);
    if (!r?.pet) return undefined;
    const f = this.followerOf(memberId);
    return petPose({ petId: memberId, now, rest: this.restOf(memberId), ...(f ? { follow: { trail: f.trail, x: f.x, y: f.y } } : {}) });
  }

  ownerOfPlant(id: string): { owner: string; plant: StoredPlant } | undefined {
    for (const [owner, r] of this.records) {
      const plant = r.plants.find((p) => p.id === id);
      if (plant) return { owner, plant };
    }
    return undefined;
  }

  // ---------------------------------------------------------------- pets

  adopt(member: { memberId: string; name: string }, kind: unknown, color: unknown, name: unknown): CompanionError | null {
    if (!isPetKind(kind) || !isPetColor(color)) return 'bad';
    const r = this.record(member.memberId, member.name);
    if (r.pet) return 'has-pet';
    const now = this.o.now();
    r.pet = { kind, color, name: cleanPetName(name, PET_KINDS[kind].name), adoptedAt: now, lastCareAt: now };
    this.o.onChange();
    return null;
  }

  editPet(memberId: string, change: { name?: unknown; color?: unknown }): CompanionError | null {
    const pet = this.records.get(memberId)?.pet;
    if (!pet) return 'no-pet';
    if (change.color !== undefined && !isPetColor(change.color)) return 'bad';
    if (change.name !== undefined) pet.name = cleanPetName(change.name, PET_KINDS[pet.kind].name);
    if (change.color !== undefined) pet.color = change.color as PetColor;
    this.o.onChange();
    return null;
  }

  removePet(memberId: string): CompanionError | null {
    const r = this.records.get(memberId);
    if (!r?.pet) return 'no-pet';
    delete r.pet;
    this.reacted.delete(`pet:${memberId}`);
    this.o.onChange();
    return null;
  }

  // ---------------------------------------------------------------- plants

  private takenAt(r: CompanionRecord, except?: StoredPlant): Set<string> {
    return new Set(r.plants.filter((p) => p !== except && p.spot).map((p) => spotKey(p.spot!)));
  }

  /** Puts a plant on the next free spot at its owner's desk (after its current one when moving). */
  private placeAt(memberId: string, r: CompanionRecord, plant: StoredPlant, moving: boolean): CompanionError | null {
    const deskId = this.o.deskOf(memberId);
    if (!deskId) return 'no-desk';
    const current = moving && plant.spot?.deskId === deskId ? plant.spot : undefined;
    const spot = nextSpot(plantSpots(deskId), this.takenAt(r, plant), current);
    if (!spot) return current ? null : 'no-spot'; // the only spot there is: moving it stays where it is
    plant.spot = spot;
    return null;
  }

  addPlant(member: { memberId: string; name: string }, kind: unknown, name: unknown): { error: CompanionError } | PlantChange {
    if (!isPlantKind(kind)) return { error: 'bad' };
    const r = this.record(member.memberId, member.name);
    if (r.plants.length >= MAX_PLANTS) return { error: 'too-many' };
    const now = this.o.now();
    let id: string;
    do id = `pl-${crypto.randomBytes(6).readUIntBE(0, 6).toString(36).padStart(8, '0').slice(-8)}`;
    while (this.ownerOfPlant(id));
    const plant: StoredPlant = { id, kind: kind as PlantKind, name: cleanPetName(name, PLANT_KINDS[kind as PlantKind].name), addedAt: now, wateredDays: 0, lastWateredAt: now };
    r.plants.push(plant);
    this.placeAt(member.memberId, r, plant, false); // with no desk or no room it simply stays unplaced
    this.o.onChange();
    return { owner: member.memberId, plant, wasPlaced: false };
  }

  plantOp(memberId: string, op: 'place' | 'move' | 'unplace' | 'remove' | 'rename', id: unknown, name?: unknown): { error: CompanionError } | (PlantChange & { removed?: true }) {
    if (!isPlantId(id)) return { error: 'bad' };
    const found = this.ownerOfPlant(id);
    if (!found) return { error: 'bad' };
    if (found.owner !== memberId) return { error: 'not-yours' };
    const r = this.records.get(memberId)!;
    const plant = found.plant;
    const wasPlaced = !!plant.spot;
    if (op === 'remove') {
      r.plants = r.plants.filter((p) => p !== plant);
      this.reacted.delete(`plant:${id}`);
    } else if (op === 'unplace') {
      delete plant.spot;
    } else if (op === 'rename') {
      plant.name = cleanPetName(name, PLANT_KINDS[plant.kind].name);
    } else {
      const err = this.placeAt(memberId, r, plant, op === 'move');
      if (err) return { error: err };
    }
    this.o.onChange();
    return { owner: memberId, plant, wasPlaced, ...(op === 'remove' ? { removed: true as const } : {}) };
  }

  /**
   * After desks changed (claimed, switched, released, or a new layout): a plant whose owner no longer holds its desk is
   * taken back (not placed), and one whose spot no longer exists moves to a free spot at the same desk. Returns what changed.
   */
  reconcileDesks(): PlantChange[] {
    const changed: PlantChange[] = [];
    for (const [owner, r] of this.records) {
      for (const plant of r.plants) {
        if (!plant.spot) continue;
        const deskId = this.o.deskOf(owner);
        const spots = deskId === plant.spot.deskId ? plantSpots(deskId) : [];
        if (spots.some((s) => s.x === plant.spot!.x && s.y === plant.spot!.y)) continue;
        const spot = deskId === plant.spot.deskId ? nextSpot(spots, this.takenAt(r, plant)) : undefined;
        if (spot) plant.spot = spot;
        else delete plant.spot;
        changed.push({ owner, plant, wasPlaced: true });
      }
    }
    if (changed.length) this.o.onChange();
    return changed;
  }

  // ---------------------------------------------------------------- care

  care(carer: Carer, target: CareTarget, action: unknown): CareResult & { owner?: string } {
    if (!isCareAction(action) || typeof target !== 'object' || target === null) return { ok: false, code: 'bad' };
    const now = this.o.now();
    let owner: string;
    let pos: { x: number; y: number } | undefined;
    let plant: StoredPlant | undefined;
    let key: string;
    let name: string;
    if ('pet' in target && typeof target.pet === 'string') {
      owner = target.pet;
      const pet = this.records.get(owner)?.pet;
      if (!pet || !actionFits(action, 'pet')) return { ok: false, code: 'bad' };
      pos = this.petPos(owner, now);
      key = `pet:${owner}`;
      name = pet.name;
    } else if ('plant' in target && isPlantId(target.plant)) {
      const found = this.ownerOfPlant(target.plant);
      if (!found?.plant.spot || !actionFits(action, 'plant')) return { ok: false, code: 'bad' };
      ({ owner, plant } = found);
      pos = { x: plant.spot!.x + 0.5, y: plant.spot!.y + 0.5 };
      key = `plant:${plant.id}`;
      name = plant.name;
    } else {
      return { ok: false, code: 'bad' };
    }
    if (carer.inMatch) return { ok: false, code: 'in-match' };
    const where = careCheck(carer, pos!, CARE_RANGE_SERVER);
    if (where !== 'ok') return { ok: false, code: where };
    const times = (this.recent.get(carer.id) ?? []).filter((t) => now - t < CARE_PER_CARER.windowMs);
    if (times.length >= CARE_PER_CARER.count) {
      this.recent.set(carer.id, times);
      return { ok: false, code: 'rate' };
    }
    times.push(now);
    this.recent.set(carer.id, times);
    const react = now - (this.reacted.get(key) ?? -Infinity) >= REACT_GAP_MS;
    if (react) this.reacted.set(key, now);

    const r = this.records.get(owner)!;
    const entry: StoredCare = { by: carer.name, ...(carer.memberId.startsWith('eph-') ? {} : { byMember: carer.memberId }), action, at: now };
    let result: CareResult;
    if (plant) {
      const grew = water(plant, now, this.o.tzOffsetMin());
      plant.lastCare = entry;
      result = { ok: true, react, at: now, wateredDays: plant.wateredDays, ...(grew ? { grew } : {}) };
    } else {
      r.pet!.lastCareAt = now;
      r.pet!.lastCare = entry;
      result = { ok: true, react, at: now };
    }
    if (carer.memberId !== owner && r.lastSeen > 0) r.away = [{ ...entry, name }, ...r.away].slice(0, AWAY_MAX);
    this.o.onChange();
    return { ...result, owner };
  }

  /** A carer's connection closed: forget their limits. */
  forgetCarer(playerId: string) {
    this.recent.delete(playerId);
  }

  // ---------------------------------------------------------------- comings and goings

  /** A member's first connection opened: they are online, and hear (once) who looked after their things while away. */
  arrived(memberId: string, name: string): { by: string; action: CareAction; name: string; at: number }[] {
    const r = this.records.get(memberId);
    if (!r) return [];
    const entries = r.away.map((e) => ({ by: e.by, action: e.action, name: e.name ?? 'your pet', at: e.at }));
    r.away = [];
    r.lastSeen = 0;
    r.ownerName = name;
    this.o.onChange();
    return entries;
  }

  /** A member's last connection closed. */
  departed(memberId: string) {
    const r = this.records.get(memberId);
    if (!r) return;
    r.lastSeen = this.o.now();
    this.o.onChange();
  }

  /** Members with a pet: their pet's view may need sending when where it is changes. */
  petOwners(): string[] {
    return [...this.records].filter(([, r]) => r.pet).map(([id]) => id);
  }
}
