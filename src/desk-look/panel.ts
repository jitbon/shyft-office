// The Customize desk panel: how the member's own desk space looks to everyone, while they hold the desk. It edits a draft of the
// look, shows it in a small top-down picture of the space, and sends it with Save. The server checks every piece again.
import { currentCatalog, type CatalogItem } from '../../shared/catalog';
import {
  COMPUTER_KINDS, DESK_ITEMS_MAX, isEmptyLook, rugPlacement, validateDeskLook, type DeskLook, type LookDesk, type LookPiece,
} from '../../shared/desk-look';
import { FLOOR_FINISHES, SWATCHES, formatPaintKey, parsePaintKey } from '../../shared/finishes';
import { rotFootprint, turnPoint, unturnPoint, type Rot } from '../../shared/layout';
import { compileWorld } from '../../shared/world';
import type { ClientMsg } from '../../shared/protocol';
import { TILE } from '../art';
import { itemPicture } from '../item2d';
import { buildMapCanvas } from '../render2d';
import { Raycaster } from '../render3d';
import type { Player } from '../types';
import { deskLooks, published } from '../world-client';

export interface DeskLookDeps {
  send(m: ClientMsg): void;
  /** The id of the desk the member holds, if any. */
  deskId(): string | undefined;
  /** Hands the office view the panel's unsaved look as a picture of the desk space (tile x, y and size), or null when there is none. */
  draft?(d: { x: number; y: number; w: number; h: number; picture: CanvasImageSource } | null): void;
}

/** What the preview can select and drag. */
type Pick = { kind: 'computer' } | { kind: 'item'; i: number } | { kind: 'rug' };

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

/** Items offered for a slot: floor items of a group that are exactly the size of what they replace. */
const sameSize = (kind: 'floor', group: string, fp: readonly [number, number]) =>
  [...currentCatalog().values()].filter((i) => i.kind === kind && i.group === group && i.footprint[0] === fp[0] && i.footprint[1] === fp[1]);

export class DeskLookPanel {
  private draft: DeskLook = { items: [] };
  private open = false;
  private error = '';
  private preview = el('canvas', 'dlPreview');
  private thumb = el('canvas', 'dlThumb');
  private thumbView: Raycaster | null = null;
  private selected: Pick | null = null;
  /** Save or Reset was pressed and the server has not answered yet. */
  private saving = false;
  /** The preview's frame: where the desk space lies in the world and how it is scaled on screen. */
  private frame: { x0: number; y0: number; w: number; h: number; desk: { x: number; y: number; rot: number; hw: number; hd: number } } | null = null;
  private grab: { dx: number; dy: number } | null = null;

  constructor(private root: HTMLElement, private deps: DeskLookDeps) {
    // Typing or choosing here must not walk the character.
    root.addEventListener('keydown', (e) => e.stopPropagation());
    root.addEventListener('keyup', (e) => e.stopPropagation());
    root.addEventListener('pointerdown', () => document.exitPointerLock());
    this.preview.addEventListener('pointerdown', (e) => this.pointerDown(e));
    this.preview.addEventListener('pointermove', (e) => this.pointerMove(e));
    this.preview.addEventListener('pointerup', () => (this.grab = null));
    this.preview.addEventListener('pointercancel', () => (this.grab = null));
  }

  get isOpen() {
    return this.open;
  }

  show() {
    const id = this.deps.deskId();
    if (!id) return;
    this.draft = structuredClone(deskLooks[id] ?? { items: [] });
    this.error = '';
    this.selected = null;
    this.saving = false;
    this.open = true;
    this.render();
  }

  hide() {
    this.open = false;
    this.saving = false;
    this.root.hidden = true;
    this.deps.draft?.(null);
  }

  /** The server sent the looks again: close when it brings the look this panel just sent (or the member has no desk any more). */
  onLooks() {
    if (!this.open) return;
    if (!this.deps.deskId() || this.saving) this.hide();
  }

  /** The server refused the look: stay open with the edits and say why. */
  onError(message: string) {
    this.error = message;
    this.saving = false;
    if (this.open) this.render();
  }

  /** The draft's pieces with their rectangles in the desk's own frame. */
  private pieces(): { pick: Pick; x: number; y: number; w: number; h: number }[] {
    const cat = currentCatalog();
    const out: { pick: Pick; x: number; y: number; w: number; h: number }[] = [];
    const add = (pick: Pick, p: LookPiece) => {
      const it = cat.get(p.kind);
      if (!it) return;
      const [w, h] = rotFootprint(it.footprint, p.rot);
      out.push({ pick, x: p.at[0], y: p.at[1], w, h });
    };
    if (this.draft.computer) add({ kind: 'computer' }, this.draft.computer);
    this.draft.items.forEach((p, i) => add({ kind: 'item', i }, p));
    return out;
  }

  private lookDesk(t: NonNullable<ReturnType<DeskLookPanel['target']>>): LookDesk {
    return { obj: t.placed.obj, item: t.placed.item, chairItem: t.chair?.item, tiles: t.desk.tiles };
  }

  /** A pointer position on the preview, as a point in the desk's own frame. */
  private toDeskFrame(e: PointerEvent): [number, number] | null {
    const f = this.frame;
    if (!f) return null;
    const r = this.preview.getBoundingClientRect();
    const wx = f.x0 + ((e.clientX - r.left) / r.width) * f.w - f.desk.x;
    const wy = f.y0 + ((e.clientY - r.top) / r.height) * f.h - f.desk.y;
    return unturnPoint(wx, wy, f.desk.hw, f.desk.hd, f.desk.rot);
  }

  private pointerDown(e: PointerEvent) {
    const p = this.toDeskFrame(e);
    if (!p) return;
    const hit = [...this.pieces()].reverse().find((q) => p[0] >= q.x && p[0] <= q.x + q.w && p[1] >= q.y && p[1] <= q.y + q.h);
    if (hit) {
      this.selected = hit.pick;
      this.grab = { dx: p[0] - hit.x, dy: p[1] - hit.y };
    } else if (this.draft.rug && this.rugRect() && p[0] >= this.rugRect()!.x && p[0] <= this.rugRect()!.x + this.rugRect()!.w && p[1] >= this.rugRect()!.y && p[1] <= this.rugRect()!.y + this.rugRect()!.h) {
      this.selected = { kind: 'rug' };
      this.grab = { dx: p[0] - this.draft.rug.dx, dy: p[1] - this.draft.rug.dy };
    } else {
      this.selected = null;
      this.grab = null;
    }
    try {
      this.preview.setPointerCapture(e.pointerId);
    } catch {
      // a pointer that is already gone: dragging still works while it is over the picture
    }
    this.render();
  }

  private rugRect() {
    const r = this.draft.rug;
    const it = r && currentCatalog().get(r.kind);
    if (!r || !it) return null;
    const [w, h] = rotFootprint(it.footprint, r.rot);
    return { x: r.dx, y: r.dy, w, h };
  }

  private pointerMove(e: PointerEvent) {
    const sel = this.selected, grab = this.grab, t = this.target();
    if (!sel || !grab || !t || !(e.buttons & 1)) return;
    const p = this.toDeskFrame(e);
    if (!p) return;
    const next = structuredClone(this.draft);
    if (sel.kind === 'rug') {
      if (!next.rug) return;
      next.rug.dx = Math.round(p[0] - grab.dx);
      next.rug.dy = Math.round(p[1] - grab.dy);
    } else {
      const piece = sel.kind === 'computer' ? next.computer : next.items[sel.i];
      const it = piece && currentCatalog().get(piece.kind);
      if (!piece || !it) return;
      const [iw, id] = rotFootprint(it.footprint, piece.rot);
      const [hw, hd] = t.placed.item.footprint;
      const snap = (v: number, max: number) => Math.round(Math.min(Math.max(v, 0), Math.max(0, max)) * 4) / 4;
      piece.at = [snap(p[0] - grab.dx, hw - iw), snap(p[1] - grab.dy, hd - id)];
    }
    if (validateDeskLook(next, this.lookDesk(t), currentCatalog())) return; // it would not fit there: stay where it was
    this.draft = next;
    this.error = '';
    this.render();
  }

  /** Turns the selected thing a quarter turn, if it still fits. */
  private turnSelected(t: NonNullable<ReturnType<DeskLookPanel['target']>>) {
    const sel = this.selected;
    if (!sel) return;
    const next = structuredClone(this.draft);
    const piece = sel.kind === 'rug' ? next.rug : sel.kind === 'computer' ? next.computer : next.items[sel.i];
    if (!piece) return;
    piece.rot = (((piece.rot as number) + 1) & 3) as Rot;
    if (sel.kind !== 'rug') {
      const p = piece as LookPiece;
      const it = currentCatalog().get(p.kind);
      if (it) {
        const [iw, id] = rotFootprint(it.footprint, p.rot);
        const [hw, hd] = t.placed.item.footprint;
        p.at = [Math.min(p.at[0], Math.max(0, hw - iw)), Math.min(p.at[1], Math.max(0, hd - id))];
      }
    }
    if (validateDeskLook(next, this.lookDesk(t), currentCatalog())) {
      this.error = 'It does not fit turned that way here.';
      this.render();
      return;
    }
    this.draft = next;
    this.error = '';
    this.render();
  }

  /** The desk the panel edits, as the office has it now: its object, item and space. */
  private target() {
    const id = this.deps.deskId();
    const world = published && id ? compileWorld(published.layout, currentCatalog()) : null;
    const desk = world?.desks.find((d) => d.id === id);
    const placed = world?.objects.find((o) => o.obj.id === id);
    if (!world || !desk || !placed) return null;
    const chair = world.objects.find((o) => o.item.tile === 'h' && desk.seat.x >= o.x && desk.seat.x < o.x + o.w && desk.seat.y >= o.y && desk.seat.y < o.y + o.d);
    return { world, desk, placed, chair };
  }

  private edit(change: (d: DeskLook) => void) {
    change(this.draft);
    this.error = '';
    this.render();
  }

  private render() {
    const t = this.target();
    this.root.hidden = !this.open || !t;
    if (!this.open || !t) return;
    const cat = currentCatalog();
    const [hw, hd] = t.placed.item.footprint;
    const d = this.draft;
    const kids: HTMLElement[] = [];

    const head = el('div', 'head', 'Customize desk');
    const close = Object.assign(el('button', '', '×'), { type: 'button', title: 'Close' });
    close.onclick = () => this.hide();
    head.append(close);
    kids.push(head, el('div', 'sys', 'Only you change how your own desk looks. Everyone sees it while it is yours.'));

    const row = (label: string, ...nodes: Node[]) => {
      const r = el('div', 'dlRow');
      r.append(el('span', '', label), ...nodes);
      return r;
    };
    const select = (options: [string, string][], value: string, onChange: (v: string) => void, label: string) => {
      const s = document.createElement('select');
      s.setAttribute('aria-label', label);
      for (const [v, name] of options) s.append(Object.assign(document.createElement('option'), { value: v, textContent: name, selected: v === value }));
      s.onchange = () => onChange(s.value);
      return s;
    };

    // Desk and chair: only ones the same size as what they replace, as picture tiles with the current one marked.
    const tiles = (label: string, base: CatalogItem | undefined, options: CatalogItem[], current: string | undefined, pick: (id: string | undefined) => void) => {
      const wrap = el('div', 'dlTiles');
      const tile = (item: CatalogItem | undefined, name: string, id: string | undefined) => {
        const on = (current ?? undefined) === id;
        const b = Object.assign(el('button', 'dlTile' + (on ? ' on' : '')), { type: 'button', title: name });
        b.setAttribute('aria-label', `${label}: ${name}`);
        b.setAttribute('aria-pressed', String(on));
        if (item) {
          const src = itemPicture(item, 0).canvas;
          const c = el('canvas');
          c.width = src.width;
          c.height = src.height;
          c.getContext('2d')!.drawImage(src, 0, 0);
          b.append(c);
        }
        b.append(el('span', '', name));
        b.onclick = () => this.edit(() => pick(id));
        return b;
      };
      wrap.append(tile(base, 'Office’s', undefined), ...options.map((i) => tile(i, i.name, i.id)));
      const block = el('div', 'dlBlock');
      block.append(el('span', '', label), wrap);
      return block;
    };
    kids.push(tiles('Desk', t.placed.item, sameSize('floor', 'desks', t.placed.item.footprint), d.desk, (id) => (id ? (d.desk = id) : delete d.desk)));
    kids.push(tiles('Chair', t.chair?.item, sameSize('floor', 'chairs', t.chair?.item.footprint ?? [1, 1]), d.chair, (id) => (id ? (d.chair = id) : delete d.chair)));

    // Computer: keep the builder's, none, or one of the computers.
    const computers = COMPUTER_KINDS.map((k) => cat.get(k)).filter((i): i is CatalogItem => !!i);
    const comp = d.computer === undefined ? '' : d.computer === null ? 'none' : d.computer.kind;
    kids.push(row('Computer', select([['', 'The office’s'], ['none', 'None'], ...computers.map((i): [string, string] => [i.id, i.name])], comp, (v) => this.edit((x) => {
      if (v === '') delete x.computer;
      else if (v === 'none') x.computer = null;
      else x.computer = this.spot(v, 0, hw, hd, x) ?? x.computer ?? null;
    }), 'Computer')));

    // Things on the desk.
    const deskItems = [...cat.values()].filter((i) => i.kind === 'deskitem' && !COMPUTER_KINDS.includes(i.id));
    const list = el('div', 'dlItems');
    d.items.forEach((p, i) => {
      const line = el('div', 'dlItem' + (this.selected?.kind === 'item' && this.selected.i === i ? ' on' : ''));
      const name = Object.assign(el('button', 'dlName', cat.get(p.kind)?.name ?? p.kind), { type: 'button', title: 'Select, then drag it in the picture' });
      name.onclick = () => {
        this.selected = { kind: 'item', i };
        this.render();
      };
      line.append(name);
      const rm = Object.assign(el('button', '', 'Remove'), { type: 'button' });
      rm.onclick = () => this.edit((x) => {
        x.items.splice(i, 1);
        this.selected = null;
      });
      line.append(rm);
      list.append(line);
    });
    const add = select([['', 'Add something…'], ...deskItems.map((i): [string, string] => [i.id, i.name])], '', (v) => {
      if (!v) return;
      this.edit((x) => {
        const spot = this.spot(v, x.items.length + 1, hw, hd, x);
        if (spot) x.items.push(spot);
        else this.error = 'There is no free room on the desk for that.';
      });
    }, 'Add a desk item');
    add.disabled = d.items.length >= DESK_ITEMS_MAX;
    kids.push(el('b', '', 'On the desk'), list, row(`${d.items.length} / ${DESK_ITEMS_MAX}`, add));

    // A rug, in one of the spots inside the desk space.
    const rugs = [...cat.values()].filter((i) => i.kind === 'floorart');
    const rugKind = d.rug?.kind ?? '';
    const spots = (kind: string): { dx: number; dy: number }[] => {
      const item = cat.get(kind);
      if (!item) return [];
      const inSpace = new Set(t.desk.tiles.map((q) => `${q.x},${q.y}`));
      const out: { dx: number; dy: number }[] = [];
      for (let dy = -3; dy <= 4; dy++) for (let dx = -3; dx <= 5; dx++) {
        if (rugPlacement({ kind, dx, dy, rot: 0 }, item, t.placed.obj, t.placed.item).tiles.every(([x, y]) => inSpace.has(`${x},${y}`))) out.push({ dx, dy });
      }
      return out;
    };
    kids.push(row('Rug', select([['', 'None'], ...rugs.map((i): [string, string] => [i.id, i.name])], rugKind, (v) => this.edit((x) => {
      if (!v) delete x.rug;
      else {
        const first = spots(v)[0];
        if (first) x.rug = { kind: v, dx: first.dx, dy: first.dy, rot: 0 };
        else this.error = 'That rug does not fit in your desk space.';
      }
    }), 'Rug')));
    if (d.rug && spots(d.rug.kind).length === 0) this.error ||= 'That rug does not fit in your desk space.';

    // The floor of the desk space.
    const parsed = d.floor ? parsePaintKey(d.floor) : null;
    kids.push(row('Floor', select([['', 'The office’s floor'], ...FLOOR_FINISHES.map((f): [string, string] => [f.id, f.name])], parsed?.finish.id ?? '', (v) => this.edit((x) => (v ? (x.floor = formatPaintKey(v, parsed?.color)) : delete x.floor)), 'Floor finish')));
    if (parsed) {
      kids.push(row('Floor color', select([['', 'Theme color'], ...SWATCHES.map((s): [string, string] => [s.hex.slice(1), s.name])], parsed.color ?? '', (v) => this.edit((x) => (x.floor = formatPaintKey(parsed.finish.id, v || undefined))), 'Floor color')));
    }

    this.paintPreview(t);
    const sel = this.selected;
    const hint = el('div', 'sys', sel ? 'Drag it in the picture to move it.' : 'Click something in the picture, then drag it to move it.');
    const turn = Object.assign(el('button', '', 'Turn'), { type: 'button', title: 'Turn the selected thing a quarter turn' });
    turn.disabled = !sel;
    turn.onclick = () => this.turnSelected(t);
    kids.push(this.preview, hint, row('Selected', turn), el('b', '', 'From your chair'), this.thumb);
    if (this.error) kids.push(el('div', 'bwarn', this.error));
    const actions = el('div', 'actions');
    const save = Object.assign(el('button', 'primary', 'Save'), { type: 'button' });
    save.onclick = () => {
      this.saving = true;
      this.deps.send({ t: 'deskLook', look: isEmptyLook(this.draft) ? null : this.draft });
    };
    const reset = Object.assign(el('button', '', 'Reset to office default'), { type: 'button' });
    reset.onclick = () => {
      this.draft = { items: [] };
      this.selected = null;
      this.saving = true;
      this.deps.send({ t: 'deskLook', look: null });
    };
    actions.append(save, reset);
    kids.push(actions);
    this.root.replaceChildren(...kids);
  }

  /** A free spot on the desk for something of `kind`, scanning the surface in quarter-tile steps; null when there is none. */
  private spot(kind: string, _n: number, hw: number, hd: number, look: DeskLook): LookPiece | null {
    const item = currentCatalog().get(kind);
    if (!item) return null;
    const [iw, id] = rotFootprint(item.footprint, 0);
    const taken = [...look.items, ...(look.computer ? [look.computer] : [])]
      .filter((p) => p.kind !== kind || look.computer !== p)
      .map((p) => {
        const it = currentCatalog().get(p.kind)!;
        const [w, h] = rotFootprint(it.footprint, p.rot);
        return { x: p.at[0], y: p.at[1], w, h };
      });
    for (let y = 0; y + id <= hd + 1e-9; y += 0.25) {
      for (let x = 0; x + iw <= hw + 1e-9; x += 0.25) {
        if (taken.every((q) => x >= q.x + q.w || x + iw <= q.x || y >= q.y + q.h || y + id <= q.y)) return { kind, at: [Math.round(x * 20) / 20, Math.round(y * 20) / 20], rot: 0 as Rot };
      }
    }
    return null;
  }

  /** A top-down picture of the desk space with the draft look on it, the first-person thumbnail, and the dashed copy in the office. */
  private paintPreview(t: NonNullable<ReturnType<DeskLookPanel['target']>>) {
    if (!published) return;
    const id = t.placed.obj.id;
    const world = compileWorld(published.layout, currentCatalog(), { [id]: this.draft });
    const xs = t.desk.tiles.map((q) => q.x), ys = t.desk.tiles.map((q) => q.y);
    const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0 + 1, h = Math.max(...ys) - y0 + 1;
    const [hw, hd] = t.placed.item.footprint;
    const map = buildMapCanvas(world);
    const clean = el('canvas');
    clean.width = w * TILE;
    clean.height = h * TILE;
    clean.getContext('2d')!.drawImage(map, x0 * TILE, y0 * TILE, w * TILE, h * TILE, 0, 0, w * TILE, h * TILE);
    this.frame = { x0, y0, w, h, desk: { x: t.placed.x, y: t.placed.y, rot: t.placed.obj.rot, hw, hd } };
    this.preview.width = w * TILE;
    this.preview.height = h * TILE;
    this.preview.style.width = `${w * TILE * 2}px`;
    this.preview.style.imageRendering = 'pixelated';
    this.preview.style.touchAction = 'none';
    this.preview.style.cursor = this.grab ? 'grabbing' : 'pointer';
    const pc = this.preview.getContext('2d')!;
    pc.drawImage(clean, 0, 0);
    // Outline whatever is selected.
    const sel = this.selected;
    const rect = sel?.kind === 'rug' ? this.rugRect() : sel ? this.pieces().find((q) => q.pick.kind === sel.kind && (q.pick.kind !== 'item' || q.pick.i === (sel as { i: number }).i)) : null;
    if (rect) {
      const c = [[rect.x, rect.y], [rect.x + rect.w, rect.y], [rect.x + rect.w, rect.y + rect.h], [rect.x, rect.y + rect.h]].map(([fx, fy]) => turnPoint(fx, fy, hw, hd, t.placed.obj.rot));
      const px = c.map(([cx]) => (t.placed.x + cx - x0) * TILE), py = c.map(([, cy]) => (t.placed.y + cy - y0) * TILE);
      pc.strokeStyle = '#f1c453';
      pc.lineWidth = 1;
      pc.setLineDash([3, 2]);
      pc.strokeRect(Math.min(...px) + 0.5, Math.min(...py) + 0.5, Math.max(...px) - Math.min(...px) - 1, Math.max(...py) - Math.min(...py) - 1);
      pc.setLineDash([]);
    }
    // The same picture, dashed, at the desk in the office, while there are unsaved edits.
    const saved = deskLooks[id] ?? { items: [] };
    this.deps.draft?.(JSON.stringify(saved) === JSON.stringify(this.draft) ? null : { x: x0, y: y0, w, h, picture: clean });
    this.paintThumb(t, world);
  }

  /** What the member would see sitting at the desk: the office's own first-person painters over the draft look. */
  private paintThumb(t: NonNullable<ReturnType<DeskLookPanel['target']>>, world: ReturnType<typeof compileWorld>) {
    try {
      this.thumbView ??= new Raycaster();
      const view = this.thumbView;
      view.rebuild(world);
      view.resize(16, 10);
      const cx = t.placed.x + t.placed.w / 2, cy = t.placed.y + t.placed.d / 2;
      const sx = t.desk.seat.x + 0.5, sy = t.desk.seat.y + 0.5;
      const eye = { x: sx, y: sy, a: Math.atan2(cy - sy, cx - sx), jumpAt: 0 } as unknown as Player;
      view.render(eye, [], 0, 0);
      this.thumb.width = view.w;
      this.thumb.height = view.h;
      this.thumb.style.width = '100%';
      this.thumb.style.borderRadius = '6px';
      this.thumb.getContext('2d')!.drawImage(view.canvas, 0, 0);
    } catch {
      this.thumb.hidden = true; // a browser that cannot draw it still gets the rest of the panel
    }
  }
}
