// The Office Arena shop: opened with B in the buy phase, closed when the play phase starts.
import { GEAR, isBlaster, type GearDef } from '../../shared/arena';
import type { ClientMsg } from '../../shared/protocol';
import type { ArenaClient } from './client';

const stats = (g: GearDef) =>
  isBlaster(g)
    ? `${g.damage}${g.pellets > 1 ? ` × ${g.pellets}` : ''} damage · ${g.rpm}/min · ${g.range} tiles · ${g.spread}° spread`
    : `Takes half of each hit, up to ${g.armour} armour`;

export class ArenaShop {
  private open = false;
  private key = '';

  constructor(private root: HTMLElement, private arena: ArenaClient, private send: (m: ClientMsg) => void) {}

  get isOpen() {
    return this.open;
  }

  toggle() {
    if (this.open) this.close();
    else if (this.arena.phase === 'buy' && this.arena.isAlive(this.arena.me)) {
      this.open = true;
      this.key = '';
    }
  }

  close() {
    this.open = false;
    this.root.hidden = true;
  }

  /** Call every frame. */
  update() {
    const a = this.arena;
    if (this.open && (!a.inMatch() || a.phase !== 'buy')) this.close();
    if (!this.open) return;
    this.root.hidden = false;
    const money = a.you?.money ?? 0;
    const key = `${money}|${a.you?.gear}|${a.you?.armour}`;
    if (key === this.key) return;
    this.key = key;
    this.root.replaceChildren();
    const head = document.createElement('div');
    head.className = 'asHead';
    head.textContent = `Shop · $${money}`;
    this.root.append(head);
    for (const g of Object.values(GEAR)) {
      const owned = isBlaster(g) ? a.you?.gear === g.id : (a.you?.armour ?? 0) >= (g.armour ?? 0);
      const afford = money >= g.price;
      const row = document.createElement('div');
      row.className = `asItem${afford || owned ? '' : ' dim'}`;
      const info = document.createElement('div');
      info.innerHTML = '<b></b><span></span>';
      info.querySelector('b')!.textContent = g.name;
      info.querySelector('span')!.textContent = stats(g);
      const buy = document.createElement('button');
      buy.textContent = owned ? 'Have it' : `$${g.price}`;
      buy.disabled = owned || !afford;
      buy.title = owned ? '' : afford ? 'Buy' : 'Not enough money';
      buy.onclick = () => {
        this.send({ t: 'buy', item: g.id });
        buy.blur();
      };
      row.append(info, buy);
      if (!afford && !owned) row.append(Object.assign(document.createElement('em'), { textContent: 'Not enough money' }));
      this.root.append(row);
    }
    this.root.append(Object.assign(document.createElement('div'), { className: 'asNote', textContent: 'B or Esc to close' }));
  }
}
