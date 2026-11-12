// Pets and plants (feature 014): the kinds, the limits, and every rule about them, in one pure module so the server and
// both views agree. Nothing here ever makes a pet or plant worse than "a little sleepy" or "drooping a bit": growth only
// goes up and nothing is removed for neglect.
import { SPAWN, areaAt, deskById, getWorld, isBlocking } from './map';
import type { World } from './world';

export type PetKind = 'cat' | 'dog' | 'rabbit' | 'bird';
export type PetColor = 0 | 1 | 2;
export type PlantKind = 'sunflower' | 'tulip' | 'cactus' | 'fern';
export type CareAction = 'pet' | 'feed' | 'play' | 'water';
export type Mood = 'happy' | 'content' | 'sleepy';
/** 0 Seedling, 1 Sprout, 2 Bud, 3 Bloom. */
export type PlantStage = 0 | 1 | 2 | 3;

export const PET_KINDS: Record<PetKind, { name: string; colors: [string, string, string] }> = {
  cat: { name: 'Cat', colors: ['Ginger', 'Grey', 'Black'] },
  dog: { name: 'Dog', colors: ['Golden', 'Brown', 'Spotted'] },
  rabbit: { name: 'Rabbit', colors: ['White', 'Brown', 'Grey'] },
  bird: { name: 'Bird', colors: ['Blue', 'Yellow', 'Green'] },
};
export const PLANT_KINDS: Record<PlantKind, { name: string }> = {
  sunflower: { name: 'Sunflower' },
  tulip: { name: 'Tulip' },
  cactus: { name: 'Cactus' },
  fern: { name: 'Fern' },
};
export const STAGE_NAMES = ['Seedling', 'Sprout', 'Bud', 'Bloom'] as const;
export const MOOD_NAMES: Record<Mood, string> = { happy: 'Happy', content: 'Content', sleepy: 'Sleepy and hungry' };
export const ACTION_NAMES: Record<CareAction, string> = { pet: 'Pet', feed: 'Feed', play: 'Play', water: 'Water' };
/** "Sam fed Miso": the verb in the past tense. */
export const ACTION_PAST: Record<CareAction, string> = { pet: 'petted', feed: 'fed', play: 'played with', water: 'watered' };
export const PET_ACTIONS: readonly CareAction[] = ['pet', 'feed', 'play'];
export const PLANT_ACTIONS: readonly CareAction[] = ['water'];

export const MAX_PLANTS = 3;
export const NAME_MAX = 20;
export const HAPPY_MS = 2 * 60 * 60 * 1000;
export const NEGLECT_MS = 24 * 60 * 60 * 1000;
/** Watering days needed to reach Sprout, Bud and Bloom. */
export const STAGE_DAYS = [1, 3, 5] as const;
/** How near you must stand to care for something (the hint and menu), in tiles. */
export const CARE_RANGE = 1;
/** The server's range: the spec's 1 tile plus half a tile for small differences between clients. */
export const CARE_RANGE_SERVER = 1.5;
/** How far behind its owner, along their path, a pet walks. */
export const FOLLOW_GAP = 1.2;
export const IDLE_AFTER_MS = 2000;
/** A move longer than this in one step is a teleport: the pet appears beside its owner. */
export const JUMP_TILES = 3;
export const AWAY_MAX = 5;
export const MAX_COMPANION_RECORDS = 2000;
/** Care limits: per carer, and one reaction per target. */
export const CARE_PER_CARER = { count: 5, windowMs: 10_000 };
export const REACT_GAP_MS = 2000;

export interface CareEntry {
  /** The carer's display name. */
  by: string;
  action: CareAction;
  at: number;
}

export interface PetView {
  /** The owner's member id; one pet per member, so it is also the pet's id. */
  owner: string;
  ownerName: string;
  /** The player id it follows; absent while it rests. */
  follow?: string;
  rest: { x: number; y: number };
  kind: PetKind;
  color: PetColor;
  name: string;
  lastCareAt: number;
  lastCare?: CareEntry;
}

export interface PlantSpot {
  deskId: string;
  x: number;
  y: number;
}

export interface PlantView {
  id: string;
  owner: string;
  ownerName: string;
  kind: PlantKind;
  name: string;
  wateredDays: number;
  lastWateredAt: number;
  lastCare?: CareEntry;
  spot?: PlantSpot;
}

export type CareTarget = { pet: string } | { plant: string };

export type CompanionError =
  | 'not-member' | 'has-pet' | 'no-pet' | 'too-many' | 'no-desk' | 'no-spot' | 'not-yours' | 'bad' | 'too-far' | 'walls' | 'in-match' | 'rate';

export const COMPANION_MESSAGES: Record<CompanionError, string> = {
  'not-member': "Guests can't adopt pets or own plants. Reload the page to get a member id.",
  'has-pet': 'You already have a pet.',
  'no-pet': "You don't have a pet.",
  'too-many': `You can have up to ${MAX_PLANTS} plants.`,
  'no-desk': 'Claim a desk first.',
  'no-spot': "There's no free spot at your desk.",
  'not-yours': "That isn't yours.",
  bad: "That isn't a valid choice.",
  'too-far': 'Walk closer.',
  walls: 'You need to be in the same room.',
  'in-match': 'Not during a match.',
  rate: 'Slow down a little.',
};

// ------------------------------------------------------------------ checks

export const isPetKind = (v: unknown): v is PetKind => typeof v === 'string' && Object.hasOwn(PET_KINDS, v);
export const isPlantKind = (v: unknown): v is PlantKind => typeof v === 'string' && Object.hasOwn(PLANT_KINDS, v);
export const isPetColor = (v: unknown): v is PetColor => v === 0 || v === 1 || v === 2;
export const isCareAction = (v: unknown): v is CareAction => v === 'pet' || v === 'feed' || v === 'play' || v === 'water';
/** Pet, Feed and Play are for pets; Water is for plants. */
export const actionFits = (action: CareAction, target: 'pet' | 'plant') => (target === 'plant') === (action === 'water');
export const isPlantId = (v: unknown): v is string => typeof v === 'string' && /^pl-[0-9a-z]{8}$/.test(v);

/** A name as people see it: no control characters, single spaces, at most NAME_MAX characters; the fallback when empty. */
export function cleanPetName(raw: unknown, fallback: string): string {
  const s = String(raw ?? '')
    .replace(/\s+/g, ' ') // tabs and newlines become spaces first, so words stay apart
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, '')
    .replace(/ {2,}/g, ' ')
    .trim();
  return [...s].slice(0, NAME_MAX).join('').trim() || fallback;
}

/** The private room (if any) a point is in: care never reaches through a meeting-room wall. */
const roomOf = (x: number, y: number) => {
  const a = areaAt(x, y);
  return a?.private ? a.id : null;
};

/** Whether someone at `carer` can care for something at `target`: close enough, and on the same side of any private room's walls. */
export function careCheck(carer: { x: number; y: number }, target: { x: number; y: number }, range: number): 'ok' | 'too-far' | 'walls' {
  if (roomOf(carer.x, carer.y) !== roomOf(target.x, target.y)) return 'walls';
  return Math.hypot(carer.x - target.x, carer.y - target.y) <= range ? 'ok' : 'too-far';
}
export const canCare = (carer: { x: number; y: number }, target: { x: number; y: number }, range: number) => careCheck(carer, target, range) === 'ok';

// ------------------------------------------------------------------ mood, droop, growth

export function moodOf(lastCareAt: number, now: number): Mood {
  const since = now - lastCareAt;
  return since < HAPPY_MS ? 'happy' : since < NEGLECT_MS ? 'content' : 'sleepy';
}
export const droopy = (lastWateredAt: number, now: number) => now - lastWateredAt >= NEGLECT_MS;

export function stageOf(wateredDays: number): PlantStage {
  let s = 0;
  for (const d of STAGE_DAYS) if (wateredDays >= d) s++;
  return s as PlantStage;
}
/** Watering days still needed for the next stage, or 0 at Bloom. */
export const daysToNext = (wateredDays: number) => {
  const next = STAGE_DAYS.find((d) => d > wateredDays);
  return next === undefined ? 0 : next - wateredDays;
};

/** The office's calendar day, 'YYYY-MM-DD', for a time and the office's offset from UTC in minutes. */
export const dayKey = (now: number, tzOffsetMin: number) => new Date(now + tzOffsetMin * 60_000).toISOString().slice(0, 10);

/** Waters a plant: always freshens it; counts toward growth once per office day. Returns whether it reached a new stage. */
export function water(plant: { wateredDays: number; lastWaterDay?: string; lastWateredAt: number }, now: number, tzOffsetMin: number): boolean {
  plant.lastWateredAt = Math.max(plant.lastWateredAt, now);
  const day = dayKey(now, tzOffsetMin);
  if (day === plant.lastWaterDay) return false;
  const before = stageOf(plant.wateredDays);
  plant.wateredDays += 1;
  plant.lastWaterDay = day;
  return stageOf(plant.wateredDays) !== before;
}

// ------------------------------------------------------------------ places

const key = (x: number, y: number) => `${x},${y}`;

/** The tiles at a desk where plants can stand: its walkable desk-space tiles, not the chair's, in reading order. */
export function plantSpots(deskId: string): PlantSpot[] {
  const desk = deskById(deskId);
  if (!desk) return [];
  return desk.tiles
    .filter((t) => !isBlocking(t.x, t.y) && !(t.x === desk.seat.x && t.y === desk.seat.y))
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((t) => ({ deskId, x: t.x, y: t.y }));
}

/** The first free spot after `current` (wrapping), or the first free one; undefined when every spot is taken. */
export function nextSpot(spots: readonly PlantSpot[], taken: ReadonlySet<string>, current?: { x: number; y: number }): PlantSpot | undefined {
  const start = current ? spots.findIndex((s) => s.x === current.x && s.y === current.y) + 1 : 0;
  for (let i = 0; i < spots.length; i++) {
    const s = spots[(start + i) % spots.length];
    if (!taken.has(key(s.x, s.y)) && !(current && s.x === current.x && s.y === current.y)) return s;
  }
  return undefined;
}

/** Walkable tiles near the spawn point, nearest first, outside private rooms and at least 2 tiles from the spawn itself. */
function cornerTiles(limit: number): { x: number; y: number }[] {
  const sx = Math.floor(SPAWN.x), sy = Math.floor(SPAWN.y);
  const out: { x: number; y: number }[] = [];
  const seen = new Set([key(sx, sy)]);
  let frontier = [[sx, sy]];
  while (frontier.length && out.length < limit) {
    const next: number[][] = [];
    for (const [x, y] of frontier) {
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (seen.has(key(nx, ny))) continue;
        seen.add(key(nx, ny));
        if (isBlocking(nx, ny) || roomOf(nx + 0.5, ny + 0.5) !== null) continue;
        // Not right where people appear: newcomers would land on a napping pet.
        if (Math.max(Math.abs(nx - sx), Math.abs(ny - sy)) >= 2) out.push({ x: nx, y: ny });
        next.push([nx, ny]);
      }
    }
    frontier = next;
  }
  return out;
}

/** The corner tiles found so far for the current office: searched again only when the layout changes or more are needed. */
let corner: { world: World; tiles: { x: number; y: number }[]; asked: number } | null = null;
function cornerTilesCached(need: number) {
  if (!corner || corner.world !== getWorld() || (need > corner.asked && corner.tiles.length >= corner.asked)) {
    const asked = Math.max(need, (corner?.world === getWorld() ? corner.asked : 0) * 2, 64);
    corner = { world: getWorld(), tiles: cornerTiles(asked), asked };
  }
  return corner.tiles;
}

/** Where the `index`-th resting pet with no desk naps: the pet corner around the spawn point (tile centre). */
export function petCornerSpot(index: number): { x: number; y: number } {
  const tiles = cornerTilesCached(index + 1);
  const t = tiles[Math.min(index, tiles.length - 1)];
  return t ? { x: t.x + 0.5, y: t.y + 0.5 } : { x: SPAWN.x, y: SPAWN.y };
}

/** Where a pet rests: at its owner's desk (the last plant spot, so it rarely sits on a plant), else the pet corner. */
export function petRestSpot(deskId: string | undefined, cornerIndex: number): { x: number; y: number } {
  const spots = deskId ? plantSpots(deskId) : [];
  const s = spots[spots.length - 1];
  return s ? { x: s.x + 0.5, y: s.y + 0.5 } : petCornerSpot(cornerIndex);
}

// ------------------------------------------------------------------ movement

interface TrailPoint {
  x: number;
  y: number;
}

/** An owner's recent path: points at least 0.1 tile apart, newest last, at most 32. A long jump starts it again. */
export class Trail {
  points: TrailPoint[] = [];
  /** When the owner last moved. */
  movedAt = 0;

  push(x: number, y: number, now: number) {
    const last = this.points[this.points.length - 1];
    if (!last) {
      this.points.push({ x, y });
      this.movedAt = now;
      return;
    }
    const d = Math.hypot(x - last.x, y - last.y);
    if (d < 0.1) return;
    if (d > JUMP_TILES) this.points = [];
    this.points.push({ x, y });
    if (this.points.length > 32) this.points.shift();
    this.movedAt = now;
  }

  get head(): TrailPoint | undefined {
    return this.points[this.points.length - 1];
  }

  /** The point `gap` tiles back along the path from `from` (the owner now), or undefined when the path is shorter. */
  behind(from: TrailPoint, gap: number): TrailPoint | undefined {
    let left = gap;
    let prev = from;
    for (let i = this.points.length - 1; i >= 0; i--) {
      const p = this.points[i];
      const d = Math.hypot(prev.x - p.x, prev.y - p.y);
      if (d >= left && d > 0) {
        const f = left / d;
        return { x: prev.x + (p.x - prev.x) * f, y: prev.y + (p.y - prev.y) * f };
      }
      left -= d;
      prev = p;
    }
    return undefined;
  }
}

export type PetPoseName = 'walk' | 'sit' | 'look' | 'sleep';
export interface PetPose {
  x: number;
  y: number;
  /** Facing angle, as for players. */
  a: number;
  pose: PetPoseName;
}

/** A stable number for a string (FNV-1a). */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
/** Deterministic 0..1 from a seed and a slot. */
function rand(seed: number, slot: number, salt: number) {
  let h = (seed ^ Math.imul(slot, 0x9e3779b1) ^ Math.imul(salt, 0x85ebca6b)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

const SLOT_MS = 4000;
const STEP_MS = 1000;

/** Where an idle pet is in a slot: near its anchor, on a free tile. */
function idlePoint(seed: number, slot: number, anchor: TrailPoint): TrailPoint {
  if (rand(seed, slot, 1) < 0.55) return anchor; // stays put this time
  const x = anchor.x + (rand(seed, slot, 2) * 2 - 1) * 0.8;
  const y = anchor.y + (rand(seed, slot, 3) * 2 - 1) * 0.8;
  return isBlocking(Math.floor(x), Math.floor(y)) || roomOf(x, y) !== roomOf(anchor.x, anchor.y) ? anchor : { x, y };
}

/** Idling around an anchor since `since`: sits, looks around, or takes a short wander, the same for everyone. */
function idle(seed: number, anchor: TrailPoint, since: number, now: number, resting: boolean): PetPose {
  const slot = Math.floor(now / SLOT_MS);
  const firstSlot = Math.floor(since / SLOT_MS);
  const at = slot <= firstSlot ? anchor : idlePoint(seed, slot, anchor);
  const from = slot - 1 <= firstSlot ? anchor : idlePoint(seed, slot - 1, anchor);
  const f = Math.min(1, (now - slot * SLOT_MS) / STEP_MS);
  const x = from.x + (at.x - from.x) * f, y = from.y + (at.y - from.y) * f;
  const moving = f < 1 && Math.hypot(at.x - from.x, at.y - from.y) > 0.05;
  const a = moving ? Math.atan2(at.y - from.y, at.x - from.x) : rand(seed, slot, 4) * Math.PI * 2;
  const r = rand(seed, slot, 5);
  const pose: PetPoseName = moving ? 'walk' : resting && r < 0.6 ? 'sleep' : r < 0.75 ? 'sit' : 'look';
  return { x, y, a, pose };
}

/** A spot right beside the owner, for when there is no path to follow yet. */
function beside(owner: TrailPoint): TrailPoint {
  for (const [dx, dy] of [[-0.8, 0.4], [0.8, 0.4], [0, 0.8], [0, -0.8]]) {
    const x = owner.x + dx, y = owner.y + dy;
    if (!isBlocking(Math.floor(x), Math.floor(y)) && roomOf(x, y) === roomOf(owner.x, owner.y)) return { x, y };
  }
  return owner;
}

/**
 * Where a pet is and what it is doing. Following: `FOLLOW_GAP` behind its owner along their path, idling there once the
 * owner has stood still for `IDLE_AFTER_MS`. Resting: idling (often asleep) around its rest spot. Pure and deterministic,
 * so the server and every client put the pet in (nearly) the same place without sending it.
 */
export function petPose(input: {
  petId: string;
  now: number;
  /** The owner's path and where they are now, while it follows. */
  follow?: { trail: Trail; x: number; y: number };
  rest: { x: number; y: number };
}): PetPose {
  const seed = hashString(input.petId);
  const f = input.follow;
  if (!f) return idle(seed, input.rest, 0, input.now, true);
  const owner = { x: f.x, y: f.y };
  const spot = f.trail.behind(owner, FOLLOW_GAP) ?? beside(owner);
  const still = input.now - f.trail.movedAt;
  if (still >= IDLE_AFTER_MS) return idle(seed, spot, f.trail.movedAt + IDLE_AFTER_MS, input.now, false);
  return { x: spot.x, y: spot.y, a: Math.atan2(owner.y - spot.y, owner.x - spot.x), pose: still < 300 ? 'walk' : 'sit' };
}
