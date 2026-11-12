// Pets and plants in the browser (feature 014): what the server says exists, where each pet is this frame (worked out
// from its owner's path, never sent), the reactions playing, and looking after things: the "Press X" hint, the care
// menu, and the hover or click card.
import {
  ACTION_NAMES, CARE_RANGE, MOOD_NAMES, PET_ACTIONS, PET_KINDS, PLANT_ACTIONS, PLANT_KINDS, STAGE_NAMES, Trail, canCare, careCheck,
  droopy, hashString, moodOf, petPose, stageOf,
  type CareAction, type CareEntry, type CareTarget, type Mood, type PetPose, type PetView, type PlantView,
} from '../shared/pets';
import type { ClientMsg, ServerMsg } from '../shared/protocol';
import { dirFromAngle } from './render2d';
import { REACTION_MS, petCanvas, petTexture, plantCanvas, plantTexture } from './pets-art';
import type { Texture } from './art';
import type { Player } from './types';

/** One pet or plant to draw this frame, in either view. */
export interface Companion {
  key: string;
  target: CareTarget;
  x: number;
  y: number;
  canvas: HTMLCanvasElement;
  tex: Texture;
  /** World size in first person. */
  size: number;
  /** A pet's name under it; plants show theirs only on hover. */
  label?: string;
  mood?: Mood;
  seed: number;
  reaction?: { action: CareAction; t: number; grew: boolean };
  /** The one you can look after right now: draw the "Press X" chip on it. */
  chip?: boolean;
  /** "Walk closer": shown for a moment after clicking it from too far away. */
  far?: boolean;
}

export interface PetsDeps {
  send(msg: ClientMsg): void;
  me(): Player;
  player(id: string): Player | undefined;
  players(): Iterable<Player>;
  /** The office clock: Date.now() plus the server's offset. */
  now(): number;
  inMatch(): boolean;
  /** A short message near the top of the screen. */
  notice(text: string): void;
  /** Something in the panel may have changed (a pet, a plant, or a care summary). */
  changed(): void;
  onSummary(entries: Extract<ServerMsg, { t: 'careSummary' }>['entries']): void;
}

const keyOf = (t: CareTarget) => ('pet' in t ? `pet:${t.pet}` : `plant:${t.plant}`);
const ago = (at: number, now: number) => {
  const m = Math.max(0, Math.round((now - at) / 60_000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : h < 48 ? 'yesterday' : `${Math.round(h / 24)} days ago`;
};
export const careLine = (c: CareEntry | undefined, now: number) =>
  c ? `${{ pet: 'Petted', feed: 'Fed', play: 'Played with', water: 'Watered' }[c.action]} by ${c.by} · ${ago(c.at, now)}` : 'No one has looked after it yet';

export class PetsClient {
  pets = new Map<string, PetView>();
  plants = new Map<string, PlantView>();
  private trails = new Map<string, Trail>();
  private poses = new Map<string, PetPose>();
  private reactions = new Map<string, { action: CareAction; at: number; grew: boolean }>();
  private far: { key: string; until: number } | null = null;
  /** The pet or plant whose care menu is open. */
  menuFor: CareTarget | null = null;
  private menu: HTMLElement;
  /** Everything drawn this frame (updated by `frame`). */
  list: Companion[] = [];
  /** The nearest one you can look after, if any. */
  nearest: Companion | null = null;

  constructor(private d: PetsDeps, menu: HTMLElement) {
    this.menu = menu;
  }

  // ---------------------------------------------------------------- messages

  /** Handles a pet or plant message; returns whether it was one. */
  onMessage(msg: ServerMsg): boolean {
    switch (msg.t) {
      case 'petUpsert':
        this.pets.set(msg.pet.owner, msg.pet);
        break;
      case 'petGone':
        this.pets.delete(msg.owner);
        this.poses.delete(msg.owner);
        if (this.menuFor && 'pet' in this.menuFor && this.menuFor.pet === msg.owner) this.closeMenu();
        break;
      case 'plantUpsert':
        this.plants.set(msg.plant.id, msg.plant);
        if (!msg.plant.spot && this.menuFor && 'plant' in this.menuFor && this.menuFor.plant === msg.plant.id) this.closeMenu();
        break;
      case 'plantGone':
        this.plants.delete(msg.id);
        if (this.menuFor && 'plant' in this.menuFor && this.menuFor.plant === msg.id) this.closeMenu();
        break;
      case 'care': {
        const entry = { by: msg.by, action: msg.action, at: msg.at };
        if ('pet' in msg.target) {
          const p = this.pets.get(msg.target.pet);
          if (p) Object.assign(p, { lastCareAt: msg.at, lastCare: entry });
        } else {
          const p = this.plants.get(msg.target.plant);
          if (p) Object.assign(p, { lastWateredAt: msg.at, lastCare: entry, ...(msg.wateredDays !== undefined ? { wateredDays: msg.wateredDays } : {}) });
        }
        if (msg.react) this.reactions.set(keyOf(msg.target), { action: msg.action, at: performance.now(), grew: !!msg.grew });
        if (this.menuFor) this.fillMenu();
        break;
      }
      case 'careSummary':
        this.d.onSummary(msg.entries);
        break;
      case 'companionError':
        this.d.notice(msg.message);
        break;
      default:
        return false;
    }
    this.d.changed();
    return true;
  }

  /** The welcome: everything, replacing what was known before (a reconnect). */
  reset(companions: { pets: PetView[]; plants: PlantView[] } | undefined) {
    this.pets = new Map((companions?.pets ?? []).map((p) => [p.owner, p]));
    this.plants = new Map((companions?.plants ?? []).map((p) => [p.id, p]));
    this.poses.clear();
    this.closeMenu();
    this.d.changed();
  }

  mine(memberId: string): { pet?: PetView; plants: PlantView[] } {
    return { pet: this.pets.get(memberId), plants: [...this.plants.values()].filter((p) => p.owner === memberId) };
  }

  // ---------------------------------------------------------------- each frame

  /** Moves trails on, works out every pet's pose, and builds the list both views draw. */
  frame() {
    const now = this.d.now();
    const clock = performance.now();
    for (const p of this.d.players()) {
      let t = this.trails.get(p.id);
      if (!t) this.trails.set(p.id, (t = new Trail()));
      t.push(p.x, p.y, now);
    }
    if (this.trails.size > 64) {
      const live = new Set([...this.d.players()].map((p) => p.id));
      for (const id of this.trails.keys()) if (!live.has(id)) this.trails.delete(id);
    }

    const list: Companion[] = [];
    const reaction = (key: string) => {
      const r = this.reactions.get(key);
      if (!r) return undefined;
      const t = (clock - r.at) / REACTION_MS;
      if (t >= 1) {
        this.reactions.delete(key);
        return undefined;
      }
      return { action: r.action, t, grew: r.grew };
    };
    for (const pet of this.pets.values()) {
      const owner = pet.follow ? this.d.player(pet.follow) : undefined;
      const trail = pet.follow ? this.trails.get(pet.follow) : undefined;
      const pose = petPose({ petId: pet.owner, now, rest: pet.rest, ...(owner && trail ? { follow: { trail, x: owner.x, y: owner.y } } : {}) });
      this.poses.set(pet.owner, pose);
      const mood = moodOf(pet.lastCareAt, now);
      // A sleepy pet that is sitting shuts its eyes; walking it is awake whatever its mood.
      const shown = mood === 'sleepy' && pose.pose !== 'walk' ? 'sleep' : pose.pose;
      const dir = dirFromAngle(pose.a);
      const step = Math.floor(clock / 180) % 2;
      const key = `pet:${pet.owner}`;
      list.push({
        key, target: { pet: pet.owner }, x: pose.x, y: pose.y,
        canvas: petCanvas(pet.kind, pet.color, dir, shown, step), tex: petTexture(pet.kind, pet.color, dir, shown, step), size: 0.62,
        label: pet.name, mood, seed: hashString(pet.owner) % 1000, reaction: reaction(key),
      });
    }
    for (const plant of this.plants.values()) {
      if (!plant.spot) continue;
      const stage = stageOf(plant.wateredDays);
      const droop = droopy(plant.lastWateredAt, now);
      const key = `plant:${plant.id}`;
      list.push({
        key, target: { plant: plant.id }, x: plant.spot.x + 0.5, y: plant.spot.y + 0.5,
        canvas: plantCanvas(plant.kind, stage, droop), tex: plantTexture(plant.kind, stage, droop), size: 0.5,
        seed: hashString(plant.id) % 1000, reaction: reaction(key),
      });
    }

    // The nearest one you can look after, for the hint and the X key.
    const me = this.d.me();
    let best: Companion | null = null, bestD = Infinity;
    if (!this.d.inMatch()) {
      for (const c of list) {
        const dist = Math.hypot(c.x - me.x, c.y - me.y);
        if (dist < bestD && canCare(me, c, CARE_RANGE)) [best, bestD] = [c, dist];
      }
    }
    if (best) best.chip = true;
    this.nearest = best;
    if (this.far && clock > this.far.until) this.far = null;
    for (const c of list) if (this.far?.key === c.key) c.far = true;
    this.list = list;

    // The menu closes when you walk away from what it is for.
    if (this.menuFor) {
      const c = list.find((x) => x.key === keyOf(this.menuFor!));
      if (!c || this.d.inMatch() || careCheck(me, c, CARE_RANGE + 0.5) !== 'ok') this.closeMenu();
    }
  }

  // ---------------------------------------------------------------- looking after

  /** The X key: opens the menu for the nearest one, or closes it. Returns whether it did anything. */
  pressX(): boolean {
    if (this.menuFor) {
      this.closeMenu();
      return true;
    }
    if (!this.nearest || this.d.inMatch()) return false;
    this.openMenu(this.nearest.target);
    return true;
  }

  /** A key while the menu is open: 1–3 pick an action, Esc closes. Returns whether it was used. */
  menuKey(e: KeyboardEvent): boolean {
    if (!this.menuFor) return false;
    if (e.key === 'Escape') {
      this.closeMenu();
      return true;
    }
    const n = Number(e.key);
    const acts = this.actionsFor(this.menuFor);
    if (n >= 1 && n <= acts.length) {
      this.care(acts[n - 1]);
      return true;
    }
    return false;
  }

  /** Clicked on (x, y) in the office: a pet or plant there opens its menu if you are close, or says to walk closer. */
  clickAt(x: number, y: number): boolean {
    const c = this.hitAt(x, y);
    if (!c) return false;
    this.clicked(c);
    return true;
  }

  /** First person: clicking with one under the crosshair (nearest the middle of the screen). */
  clicked(c: Companion) {
    if (this.d.inMatch()) return;
    const check = careCheck(this.d.me(), c, CARE_RANGE);
    if (check === 'ok') this.openMenu(c.target);
    else {
      this.far = { key: c.key, until: performance.now() + 1500 };
      if (check === 'walls') this.d.notice('You need to be in the same room.');
    }
  }

  /** The pet or plant drawn at (x, y), if any (within about half a tile of where it stands). */
  hitAt(x: number, y: number): Companion | null {
    let best: Companion | null = null, bestD = 0.7;
    for (const c of this.list) {
      const d = Math.hypot(c.x - x, c.y - 0.2 - y);
      if (d < bestD) [best, bestD] = [c, d];
    }
    return best;
  }

  private actionsFor(t: CareTarget): readonly CareAction[] {
    return 'pet' in t ? PET_ACTIONS : PLANT_ACTIONS;
  }

  private care(action: CareAction) {
    if (!this.menuFor) return;
    this.d.send({ t: 'care', target: this.menuFor, action });
    this.closeMenu();
  }

  openMenu(t: CareTarget) {
    this.menuFor = t;
    this.fillMenu();
    this.menu.hidden = false;
  }

  closeMenu() {
    this.menuFor = null;
    this.menu.hidden = true;
  }

  /** Where the menu sits: set by the view, in CSS pixels. */
  placeMenu(x: number, y: number) {
    this.menu.style.left = `${Math.max(8, Math.min(window.innerWidth - 228, x - 110))}px`;
    this.menu.style.top = `${Math.max(8, Math.min(window.innerHeight - 140, y))}px`;
  }

  private fillMenu() {
    const t = this.menuFor;
    if (!t) return;
    const info = this.describe(t);
    if (!info) return this.closeMenu();
    const head = document.createElement('div');
    head.className = 'careHead';
    head.append(Object.assign(document.createElement('b'), { textContent: info.title }), Object.assign(document.createElement('div'), { className: 'sys', textContent: info.lines.join(' · ') }));
    const row = document.createElement('div');
    row.className = 'careActs';
    this.actionsFor(t).forEach((a, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = `<kbd>${i + 1}</kbd> ${ACTION_NAMES[a]}`;
      b.onclick = () => this.care(a);
      row.append(b);
    });
    this.menu.replaceChildren(head, row);
  }

  /** Name, whose it is, mood or stage, and the last care: for the menu and the card. */
  describe(t: CareTarget): { title: string; lines: string[] } | null {
    const now = this.d.now();
    if ('pet' in t) {
      const p = this.pets.get(t.pet);
      if (!p) return null;
      return { title: p.name, lines: [`${p.ownerName}'s ${PET_KINDS[p.kind].name.toLowerCase()}`, MOOD_NAMES[moodOf(p.lastCareAt, now)], careLine(p.lastCare, now)] };
    }
    const p = this.plants.get(t.plant);
    if (!p) return null;
    const stage = STAGE_NAMES[stageOf(p.wateredDays)];
    return {
      title: p.name,
      lines: [`${p.ownerName}'s ${PLANT_KINDS[p.kind].name.toLowerCase()}`, droopy(p.lastWateredAt, now) ? `${stage}, drooping a little` : stage, careLine(p.lastCare, now)],
    };
  }

  /** Fills a card element (the person card's look) with what is known about a pet or plant. */
  fillCard(card: HTMLElement, t: CareTarget): boolean {
    const info = this.describe(t);
    if (!info) return false;
    card.replaceChildren(
      Object.assign(document.createElement('b'), { textContent: info.title }),
      ...info.lines.map((l, i) => Object.assign(document.createElement('div'), { className: i === info.lines.length - 1 ? 'sys' : '', textContent: l })),
    );
    return true;
  }
}
