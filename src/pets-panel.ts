// The Pets & plants panel (feature 014): adopt a pet, name it, change its color or send it away; add up to three plants,
// place them at your desk and see how they are growing; and, after being away, who looked after them.
import {
  ACTION_PAST, MAX_PLANTS, MOOD_NAMES, NAME_MAX, PET_KINDS, PLANT_KINDS, STAGE_NAMES, daysToNext, droopy, moodOf, stageOf,
  type CareAction, type PetColor, type PetKind, type PlantKind,
} from '../shared/pets';
import type { ClientMsg } from '../shared/protocol';
import { careLine, type PetsClient } from './pets';
import { petCanvas, plantCanvas } from './pets-art';

export interface PetsPanelDeps {
  send(msg: ClientMsg): void;
  memberId(): string;
  hasDesk(): boolean;
  now(): number;
}

type Summary = { by: string; action: CareAction; name: string; at: number }[];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
}
const picture = (c: HTMLCanvasElement, size = 48) => {
  const img = el('canvas', { width: size, height: size, className: 'petPic' });
  const ctx = img.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(c, 0, 0, size, size);
  return img;
};
const when = (at: number, now: number) => {
  const h = (now - at) / 3_600_000;
  return h < 1 ? 'earlier' : h < 24 ? `${Math.round(h)} h ago` : h < 48 ? 'yesterday' : `${Math.round(h / 24)} days ago`;
};

export class PetsPanel {
  private kind: PetKind = 'cat';
  private color: PetColor = 0;
  private plantKind: PlantKind = 'tulip';
  private adding = false;
  private summary: Summary = [];
  private error = '';

  constructor(private root: HTMLElement, private pets: PetsClient, private d: PetsPanelDeps) {}

  get isOpen() {
    return !this.root.hidden;
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.show();
  }

  show() {
    this.root.hidden = false;
    this.error = '';
    this.render();
  }

  close() {
    this.root.hidden = true;
    this.summary = []; // read once the panel has been seen
    this.adding = false;
  }

  /** Something changed: redraw if open, without losing what is being typed. */
  refresh() {
    if (!this.isOpen) return;
    if (this.root.contains(document.activeElement) && (document.activeElement as HTMLElement).tagName === 'INPUT') return;
    this.render();
  }

  showError(message: string) {
    this.error = message;
    this.refresh();
  }

  /** Who looked after things while you were away: kept at the top until the panel is closed. */
  setSummary(entries: Summary) {
    this.summary = entries;
    this.refresh();
  }

  private render() {
    const memberId = this.d.memberId();
    const parts: Node[] = [el('div', { className: 'head' }, el('span', {}, '🐾 Pets & plants'), el('button', { type: 'button', textContent: '✕', title: 'Close', onclick: () => this.close() }))];
    if (memberId.startsWith('eph-')) {
      parts.push(el('div', { className: 'sys', textContent: "Guests can look after other people's pets and plants. Reload the page to get a member id to have your own." }));
      this.root.replaceChildren(...parts);
      return;
    }
    const now = this.d.now();
    if (this.summary.length) {
      const box = el('div', { className: 'petAway' }, el('b', { textContent: 'While you were away' }));
      for (const e of this.summary) box.append(el('div', { textContent: `${e.by} ${ACTION_PAST[e.action]} ${e.name} · ${when(e.at, now)}` }));
      parts.push(box);
    }
    if (this.error) parts.push(el('div', { className: 'bwarn', textContent: this.error }));

    const { pet, plants } = this.pets.mine(memberId);
    parts.push(el('div', { className: 'petSection', textContent: 'Your pet' }));
    if (!pet) parts.push(this.adoptForm());
    else {
      const mood = moodOf(pet.lastCareAt, now);
      const name = el('input', { value: pet.name, maxLength: NAME_MAX, ariaLabel: 'Pet name' });
      name.onchange = () => this.d.send({ t: 'pet', op: 'edit', name: name.value });
      const dots = el('div', { className: 'petDots' });
      PET_KINDS[pet.kind].colors.forEach((label, i) => {
        dots.append(el('button', {
          type: 'button', className: `petDot${pet.color === i ? ' on' : ''}`, title: label,
          onclick: () => this.d.send({ t: 'pet', op: 'edit', color: i as PetColor }),
        }, picture(petCanvas(pet.kind, i as PetColor, 'down', 'sit', 0), 28)));
      });
      const away = el('button', { type: 'button', textContent: 'Send away…', className: 'petDanger' });
      away.onclick = () => {
        if (confirm(`Send ${pet.name} away? This can't be undone.`)) this.d.send({ t: 'pet', op: 'remove' });
      };
      parts.push(
        el('div', { className: 'petRow' },
          picture(petCanvas(pet.kind, pet.color, 'down', mood === 'sleepy' ? 'sleep' : 'sit', 0)),
          el('div', { className: 'petInfo' }, name, el('div', { className: 'sys', textContent: `${pet.name} is ${MOOD_NAMES[mood].toLowerCase()}` }), el('div', { className: 'sys', textContent: careLine(pet.lastCare, now) }))),
        dots,
        away,
      );
    }

    parts.push(el('div', { className: 'petSection', textContent: `Your plants (${plants.length}/${MAX_PLANTS})` }));
    const desk = this.d.hasDesk();
    for (const p of plants) {
      const stage = stageOf(p.wateredDays);
      const left = daysToNext(p.wateredDays);
      const progress = left ? `${STAGE_NAMES[stage]} · ${left} more watering day${left > 1 ? 's' : ''} to ${STAGE_NAMES[stage + 1].toLowerCase()}` : 'In full bloom';
      const name = el('input', { value: p.name, maxLength: NAME_MAX, ariaLabel: 'Plant name' });
      name.onchange = () => this.d.send({ t: 'plant', op: 'rename', id: p.id, name: name.value });
      const btns = el('div', { className: 'petBtns' });
      if (p.spot) {
        btns.append(
          el('button', { type: 'button', textContent: 'Move', onclick: () => this.d.send({ t: 'plant', op: 'move', id: p.id }) }),
          el('button', { type: 'button', textContent: 'Unplace', onclick: () => this.d.send({ t: 'plant', op: 'unplace', id: p.id }) }),
        );
      } else {
        btns.append(el('button', {
          type: 'button', textContent: 'Place', disabled: !desk, title: desk ? 'Put it at your desk' : 'Claim a desk first.',
          onclick: () => this.d.send({ t: 'plant', op: 'place', id: p.id }),
        }));
      }
      const remove = el('button', { type: 'button', textContent: 'Remove…', className: 'petDanger' });
      remove.onclick = () => {
        if (confirm(`Remove ${p.name}? This can't be undone.`)) this.d.send({ t: 'plant', op: 'remove', id: p.id });
      };
      btns.append(remove);
      parts.push(el('div', { className: 'petRow' },
        picture(plantCanvas(p.kind, stage, droopy(p.lastWateredAt, now))),
        el('div', { className: 'petInfo' }, name,
          el('div', { className: 'sys', textContent: progress + (p.spot ? '' : ' · not placed') }),
          el('div', { className: 'sys', textContent: careLine(p.lastCare, now) }),
          btns)));
    }
    if (!desk && plants.some((p) => !p.spot)) parts.push(el('div', { className: 'sys', textContent: 'Claim a desk first to place your plants.' }));
    if (plants.length < MAX_PLANTS) {
      if (this.adding) parts.push(this.plantForm());
      else parts.push(el('button', { type: 'button', textContent: 'Add a plant', onclick: () => ((this.adding = true), this.render()) }));
    }
    this.root.replaceChildren(...parts);
  }

  private adoptForm(): HTMLElement {
    const grid = el('div', { className: 'petGrid' });
    for (const k of Object.keys(PET_KINDS) as PetKind[]) {
      const tile = el('div', { className: `petTile${this.kind === k ? ' on' : ''}` }, el('b', { textContent: PET_KINDS[k].name }));
      const swatches = el('div', { className: 'petDots' });
      PET_KINDS[k].colors.forEach((label, i) => {
        swatches.append(el('button', {
          type: 'button', className: `petDot${this.kind === k && this.color === i ? ' on' : ''}`, title: `${label} ${PET_KINDS[k].name.toLowerCase()}`,
          onclick: () => {
            const name = this.root.querySelector<HTMLInputElement>('.petName');
            const keep = name && name.value !== PET_KINDS[this.kind].name ? name.value : null;
            [this.kind, this.color] = [k, i as PetColor];
            this.render();
            if (keep !== null) this.root.querySelector<HTMLInputElement>('.petName')!.value = keep;
          },
        }, picture(petCanvas(k, i as PetColor, 'down', 'sit', 0), 32)));
      });
      tile.append(swatches);
      grid.append(tile);
    }
    const name = el('input', { className: 'petName', value: PET_KINDS[this.kind].name, maxLength: NAME_MAX, ariaLabel: 'Name' });
    const adopt = el('button', { type: 'button', textContent: 'Adopt', className: 'on' });
    adopt.onclick = () => this.d.send({ t: 'pet', op: 'adopt', kind: this.kind, color: this.color, name: name.value });
    name.onkeydown = (e) => {
      if (e.key === 'Enter') adopt.click();
    };
    return el('div', { className: 'petForm' }, grid, el('div', { className: 'petRow' }, name, adopt));
  }

  private plantForm(): HTMLElement {
    const grid = el('div', { className: 'petGrid' });
    for (const k of Object.keys(PLANT_KINDS) as PlantKind[]) {
      grid.append(el('button', {
        type: 'button', className: `petTile${this.plantKind === k ? ' on' : ''}`, title: PLANT_KINDS[k].name,
        onclick: () => {
          const name = this.root.querySelector<HTMLInputElement>('.plantName');
          const keep = name && name.value !== PLANT_KINDS[this.plantKind].name ? name.value : null;
          this.plantKind = k;
          this.render();
          if (keep !== null) this.root.querySelector<HTMLInputElement>('.plantName')!.value = keep;
        },
      }, picture(plantCanvas(k, 3, false), 36), el('span', { textContent: PLANT_KINDS[k].name })));
    }
    const name = el('input', { className: 'plantName', value: PLANT_KINDS[this.plantKind].name, maxLength: NAME_MAX, ariaLabel: 'Plant name' });
    const add = el('button', { type: 'button', textContent: 'Add', className: 'on' });
    add.onclick = () => {
      this.d.send({ t: 'plant', op: 'add', kind: this.plantKind, name: name.value });
      this.adding = false;
    };
    const cancel = el('button', { type: 'button', textContent: 'Cancel', onclick: () => ((this.adding = false), this.render()) });
    return el('div', { className: 'petForm' }, grid, el('div', { className: 'petRow' }, name, add, cancel));
  }
}
