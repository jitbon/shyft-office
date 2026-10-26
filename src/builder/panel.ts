// The builder's side panel: the catalog, the tools, undo, problems, merge clashes and history. It only draws what the
// controller tells it and calls back what the person clicked; the edits themselves live in tools.ts.
import { GROUPS, PREFABS, catalogItems, currentCatalog, filterCatalog, type CatalogItem } from '../../shared/catalog';
import type { Group, Season } from '../../shared/items';
import { flatPicture, itemPicture } from '../item2d';
import { FLOOR_CODES } from '../../shared/layout';
import { describeObjectError, type CustomObject } from '../../shared/objects';
import { viewCanvas } from '../custom-objects';
import type { Clash, Side } from '../../shared/layout-merge';
import type { Problem } from '../../shared/layout-check';
import { TILE, drawFloor, drawFurniture2D, drawWall2D, makeCanvas } from '../art';

export type Tab = 'floors' | 'walls' | 'furniture' | 'rooms' | 'custom' | 'history';
export type ToolId = 'select' | 'floor' | 'wall' | 'place' | 'erase' | 'spawn' | 'region' | 'prefab';
export type RegionRef = { kind: 'room' | 'pod'; id: string };

export interface HistoryRow {
  rev: number;
  by: string;
  at: number;
  objects: number;
}

export interface PanelState {
  tab: Tab;
  tool: ToolId;
  brush: { floor: string; wall: string; kind: string; prefab: string };
  rooms: { id: string; name: string; private: boolean; restricted: boolean; capacity?: number }[];
  pods: { id: string; name: string; mode: 'ambient' | 'cubicle' }[];
  region: RegionRef | null;
  customs: CustomObject[];
  /** Why the last upload was turned away, in words. */
  uploadErrors: string[];
  /** Painting tiles into the chosen room or pod, or taking them out. */
  regionMode: 'paint' | 'unpaint';
  selected: { id: string; name: string; kind: string } | null;
  canUndo: boolean;
  canRedo: boolean;
  /** "Saved" / "Saving…" / why saving failed. */
  saveText: string;
  /** Said when the office moved on since this draft was started. */
  behindText: string;
  problems: Problem[];
  clashes: Clash[];
  resolve: Record<string, Side>;
  history: HistoryRow[] | null;
  size: { w: number; h: number };
  publishedRev: number;
  busy: boolean;
  /** A line shown under the tools: the last thing that could not be done, and why. */
  message: string;
}

export interface PanelApi {
  setTab(tab: Tab): void;
  pickPrefab(id: string): void;
  newRegion(kind: 'room' | 'pod', isPrivate?: boolean): void;
  selectRegion(ref: RegionRef | null): void;
  regionMode(mode: 'paint' | 'unpaint'): void;
  patchRoom(patch: { name?: string; private?: boolean; capacity?: number | null; restricted?: boolean }): void;
  patchPod(patch: { name?: string; mode?: 'ambient' | 'cubicle' }): void;
  deleteRegion(): void;
  upload(file: File, meta: unknown): void;
  removeObject(id: string): void;
  setTool(tool: ToolId): void;
  pickFloor(code: string): void;
  pickWall(code: string): void;
  pickItem(kind: string): void;
  /** Opens the studio: with no argument on a new design, with a catalog id on that item (as a copy unless it is the member's own). */
  openStudio(kind?: string): void;
  undo(): void;
  redo(): void;
  turn(): void;
  remove(): void;
  applySize(w: number, h: number): void;
  focus(tiles: [number, number][]): void;
  choose(key: string, side: Side): void;
  publish(): void;
  discard(): void;
  exit(): void;
  restore(rev: number): void;
}

const FLOOR_NAMES: Record<string, string> = { '.': 'Wood', ',': 'Carpet', ';': 'Library carpet', _: 'Kitchen tile' };
const WALL_NAMES: [string, string][] = [['#', 'Wall'], ['G', 'Window'], ['W', 'Whiteboard'], ['B', 'Bookshelf'], ['K', 'Counter']];

const button = (label: string, onClick: () => void, props: Partial<HTMLButtonElement> = {}) => {
  const b = Object.assign(document.createElement('button'), { type: 'button', textContent: label, ...props });
  b.onclick = onClick;
  return b;
};

/** A tiny picture of a floor, wall or piece of furniture, painted by the same code that draws the office. */
function swatch(kind: 'floor' | 'wall' | 'item', code: string, title: string, on: boolean, onClick: () => void): HTMLButtonElement {
  let tilesW = 1, tilesH = 1;
  const item = kind === 'item' ? currentCatalog().get(code) : undefined;
  if (item) [tilesW, tilesH] = item.footprint;
  const [c, ctx] = makeCanvas(TILE * tilesW, TILE * tilesH);
  for (let y = 0; y < tilesH; y++) {
    for (let x = 0; x < tilesW; x++) {
      const ox = x * TILE, oy = y * TILE;
      if (kind === 'floor') drawFloor(ctx, code, ox, oy, 4, 4);
      else if (kind === 'wall') {
        drawFloor(ctx, '.', ox, oy, 4, 4);
        drawWall2D(ctx, code, ox, oy, true, false);
      } else if (item) {
        drawFloor(ctx, '.', ox, oy, 4 + x, 4 + y);
        drawFurniture2D(ctx, item.tile, ox, oy, (dx, dy) => (x + dx >= 0 && y + dy >= 0 && x + dx < tilesW && y + dy < tilesH ? item.tile : '.'));
      }
    }
  }
  const b = button('', onClick, { title, className: 'pick' + (on ? ' on' : '') });
  b.setAttribute('aria-label', title);
  b.setAttribute('aria-pressed', String(on));
  c.style.width = `${Math.min(tilesW, 2) * 44}px`;
  b.append(c, Object.assign(document.createElement('span'), { textContent: title }));
  return b;
}

/** A picture button for any item: the derived picture for made items, the built-in swatch for the six, the top view for sheet objects. */
function itemButton(item: CatalogItem, on: boolean, onClick: () => void, showGroup = false): HTMLButtonElement {
  if (!item.id.startsWith('item:') && !item.custom) {
    const sw = swatch('item', item.id, item.name, on, onClick);
    sw.append(itemCredit(item, showGroup));
    return sw;
  }
  const canvas = item.custom
    ? viewCanvas(item.id.slice('custom:'.length), 'top', 0)
    : item.kind === 'floorart' ? flatPicture(item, 0) : itemPicture(item, 0).canvas;
  const b = button('', onClick, { title: `${item.name} · by ${item.by}`, className: 'pick' + (on ? ' on' : '') });
  b.setAttribute('aria-label', item.name);
  b.setAttribute('aria-pressed', String(on));
  if (canvas) {
    const c = makeCanvas(canvas.width, canvas.height)[0];
    c.getContext('2d')!.drawImage(canvas, 0, 0);
    c.style.width = `${Math.min(Math.max(item.footprint[0], 0.75), 2) * 44}px`;
    c.style.maxHeight = '56px';
    c.style.objectFit = 'contain';
    b.append(c);
  }
  b.append(Object.assign(document.createElement('span'), { textContent: item.name }), itemCredit(item, showGroup));
  return b;
}

/** A small line under an item's name: who made it, and its group when the list mixes groups. */
function itemCredit(item: CatalogItem, showGroup: boolean): HTMLElement {
  const group = showGroup ? GROUPS.find((g) => g.id === item.group)?.name : undefined;
  return Object.assign(document.createElement('small'), { className: 'credit', textContent: group ? `${item.by} · ${group}` : item.by });
}

const SEASON_NAMES: [Season | '', string][] = [['', 'All seasons'], ['winter', 'Winter'], ['spring', 'Spring'], ['summer', 'Summer'], ['autumn', 'Autumn']];
/** How many items the picture grid shows before it scrolls. */
const SHOWN = 24;

const ago = (at: number) => {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
};

export class BuilderPanel {
  /** What was typed in the upload form, kept while the panel is redrawn. */
  private form = { name: '', w: 1, d: 1, height: 64, blocks: true, frames: 1, fps: 4, back: false };
  private file: File | null = null;
  /** The Items tab's filters, kept while the panel is redrawn. */
  private filter: { group: Group | ''; season: Season | ''; text: string } = { group: '', season: '', text: '' };

  constructor(private root: HTMLElement, private api: PanelApi) {}

  /** The Items tab: group bar, season filter, search and a grid of pictures with a count and the picked item's creator. */
  private renderItems(root: HTMLElement, s: PanelState) {
    const a = this.api;
    const f = this.filter;
    const all = catalogItems(currentCatalog());
    const bar = document.createElement('div');
    bar.className = 'groups';
    const draw = () => {
      for (const b of bar.querySelectorAll('button')) b.classList.toggle('on', (b as HTMLElement).dataset.group === f.group);
      list.replaceChildren();
      const shown = filterCatalog(all, { group: f.group || undefined, season: f.season || undefined, text: f.text });
      for (const item of shown) list.append(itemButton(item, s.tool === 'place' && s.brush.kind === item.id, () => a.pickItem(item.id), !f.group));
      if (!shown.length) list.append(Object.assign(document.createElement('div'), { className: 'bnote', textContent: 'Nothing matches.' }));
      count.textContent = `${shown.length} ${shown.length === 1 ? 'item' : 'items'}`;
      const picked = currentCatalog().get(s.brush.kind);
      who.textContent = picked && s.tool === 'place' ? `${picked.name} · by ${picked.by}` : '';
    };
    for (const [id, name] of [['', 'All'], ...GROUPS.map((g) => [g.id, g.name] as const)] as const) {
      const b = button(name, () => { f.group = id as Group | ''; draw(); }, { className: f.group === id ? 'on' : '' });
      b.dataset.group = id;
      bar.append(b);
    }
    const season = document.createElement('select');
    season.setAttribute('aria-label', 'Season');
    for (const [id, name] of SEASON_NAMES) season.append(Object.assign(document.createElement('option'), { value: id, textContent: name, selected: f.season === id }));
    season.onchange = () => { f.season = season.value as Season | ''; draw(); };
    const make = button('New item', () => a.openStudio(), { className: 'primary', title: 'Design your own furniture' });
    const search = Object.assign(document.createElement('input'), { type: 'search', placeholder: 'Search items', value: f.text });
    search.setAttribute('aria-label', 'Search items');
    search.oninput = () => { f.text = search.value; draw(); };
    const row = document.createElement('div');
    row.className = 'filters';
    row.append(season, search);
    const list = document.createElement('div');
    list.className = 'picks';
    list.style.maxHeight = `${Math.ceil(SHOWN / 3) * 78}px`;
    list.style.overflowY = 'auto';
    const count = document.createElement('div');
    count.className = 'bnote';
    const who = document.createElement('div');
    who.className = 'bnote';
    const edit = button('Edit', () => a.openStudio(s.brush.kind), { title: 'Open this item in the studio', hidden: !(s.tool === 'place' && currentCatalog().get(s.brush.kind)) });
    root.append(make, bar, row, list, count, who, edit);
    draw();
  }

  render(s: PanelState) {
    const a = this.api;
    const sections: HTMLElement[] = [];

    const head = document.createElement('div');
    head.className = 'bhead';
    head.append(
      Object.assign(document.createElement('b'), { textContent: 'Build mode' }),
      button('Undo', a.undo, { disabled: !s.canUndo, title: 'Undo (Ctrl/Cmd+Z)' }),
      button('Redo', a.redo, { disabled: !s.canRedo, title: 'Redo (Shift+Ctrl/Cmd+Z)' }),
      button('Close', a.exit, { title: 'Leave build mode (your draft is kept)', className: 'quiet' }),
    );
    sections.push(head);
    sections.push(Object.assign(document.createElement('div'), {
      className: 'bnote',
      textContent: `${s.saveText}${s.behindText ? ` · ${s.behindText}` : ''}`,
    }));

    const tabs = document.createElement('div');
    tabs.className = 'tabs';
    for (const [id, label] of [['floors', 'Floors'], ['walls', 'Walls'], ['furniture', 'Items'], ['rooms', 'Rooms'], ['custom', 'Custom'], ['history', 'History']] as const) {
      tabs.append(button(label, () => a.setTab(id), { className: s.tab === id ? 'on' : '' }));
    }
    sections.push(tabs);

    const grid = document.createElement('div');
    grid.className = 'picks';
    if (s.tab === 'floors') {
      for (const code of FLOOR_CODES) grid.append(swatch('floor', code, FLOOR_NAMES[code], s.tool === 'floor' && s.brush.floor === code, () => a.pickFloor(code)));
    } else if (s.tab === 'walls') {
      for (const [code, name] of WALL_NAMES) grid.append(swatch('wall', code, name, s.tool === 'wall' && s.brush.wall === code, () => a.pickWall(code)));
    } else if (s.tab === 'furniture') {
      grid.className = 'items';
      this.renderItems(grid, s);
    } else if (s.tab === 'rooms') {
      grid.className = 'rooms';
      this.renderRooms(grid, s);
    } else if (s.tab === 'custom') {
      grid.className = 'customs';
      this.renderCustom(grid, s);
    } else {
      grid.className = 'history';
      if (!s.history) grid.append(Object.assign(document.createElement('div'), { className: 'bnote', textContent: 'Loading…' }));
      for (const r of s.history ?? []) {
        const row = document.createElement('div');
        row.className = 'hrow';
        row.append(
          Object.assign(document.createElement('span'), { textContent: `#${r.rev} · ${r.by} · ${ago(r.at)}` }),
          button(r.rev === s.publishedRev ? 'Current' : 'Restore into draft', () => a.restore(r.rev), { disabled: r.rev === s.publishedRev || s.busy }),
        );
        grid.append(row);
      }
    }
    sections.push(grid);

    const tools = document.createElement('div');
    tools.className = 'tools';
    for (const [id, label, tip] of [
      ['select', 'Select', 'Click furniture to select it; drag to move it'],
      ['erase', 'Erase', 'Click or drag to remove walls, then furniture'],
      ['spawn', 'Spawn', 'Click a tile where people appear'],
    ] as const) {
      tools.append(button(label, () => a.setTool(id), { className: s.tool === id ? 'on' : '', title: tip }));
    }
    sections.push(tools);

    if (s.selected) {
      const sel = document.createElement('div');
      sel.className = 'selected';
      sel.append(
        Object.assign(document.createElement('span'), { textContent: s.selected.name }),
        button('Turn (R)', a.turn),
        button('Edit item', () => a.openStudio(s.selected!.kind), { title: 'Change this item, or make your own copy of it, in the studio' }),
        button('Delete', a.remove),
      );
      sections.push(sel);
    }
    if (s.message) sections.push(Object.assign(document.createElement('div'), { className: 'bwarn', textContent: s.message }));

    const size = document.createElement('div');
    size.className = 'size';
    const w = Object.assign(document.createElement('input'), { type: 'number', min: '10', max: '100', value: String(s.size.w), ariaLabel: 'Width in tiles' });
    const h = Object.assign(document.createElement('input'), { type: 'number', min: '10', max: '100', value: String(s.size.h), ariaLabel: 'Height in tiles' });
    size.append('Size ', w, ' × ', h, button('Apply', () => a.applySize(Number(w.value), Number(h.value))));
    sections.push(size);

    if (s.clashes.length) {
      const box = document.createElement('div');
      box.className = 'clashes';
      box.append(Object.assign(document.createElement('b'), { textContent: 'Someone changed the same things' }));
      for (const c of s.clashes) {
        const row = document.createElement('div');
        row.className = 'hrow';
        const pick = s.resolve[c.key];
        row.append(
          button(c.key.replace(/^obj:/, '').replace(':', ' '), () => a.focus(c.tiles), { className: 'link', title: 'Show on the map' }),
          button('Keep mine', () => a.choose(c.key, 'mine'), { className: pick === 'mine' ? 'on' : '' }),
          button('Keep theirs', () => a.choose(c.key, 'theirs'), { className: pick === 'theirs' ? 'on' : '' }),
        );
        box.append(row);
      }
      sections.push(box);
    }

    if (s.problems.length) {
      const box = document.createElement('div');
      box.className = 'problems';
      box.append(Object.assign(document.createElement('b'), { textContent: `${s.problems.length} problem${s.problems.length === 1 ? '' : 's'} to fix` }));
      for (const p of s.problems.slice(0, 12)) {
        box.append(button(p.message, () => a.focus(p.tiles), { className: 'link', title: 'Show on the map' }));
      }
      sections.push(box);
    }

    const foot = document.createElement('div');
    foot.className = 'bfoot';
    const needsPick = s.clashes.some((c) => !s.resolve[c.key]);
    foot.append(
      button('Discard draft', a.discard, { disabled: s.busy, title: 'Throw away your changes and start again from the office as it is' }),
      button(s.clashes.length ? 'Publish merged' : 'Publish', a.publish, {
        className: 'primary',
        disabled: s.busy || s.problems.length > 0 || needsPick,
        title: s.problems.length ? 'Fix the problems first' : needsPick ? 'Choose what to keep first' : 'Everyone sees your changes',
      }),
    );
    sections.push(foot);

    this.root.replaceChildren(...sections);
  }

  /** The Rooms tab: ready-made rooms, new rooms and pods, and the settings of the one picked. */
  private renderRooms(box: HTMLElement, s: PanelState) {
    const a = this.api;
    const title = (t: string) => Object.assign(document.createElement('b'), { textContent: t });
    const row = (...kids: Node[]) => {
      const r = document.createElement('div');
      r.className = 'hrow';
      r.append(...kids);
      return r;
    };

    box.append(title('Ready-made'));
    for (const p of PREFABS) box.append(button(p.name, () => a.pickPrefab(p.id), { className: s.tool === 'prefab' && s.brush.prefab === p.id ? 'on' : '', title: 'Click, then click the map to place it' }));

    box.append(title('Mark out your own'));
    const make = document.createElement('div');
    make.className = 'tools';
    make.append(
      button('Meeting room', () => a.newRegion('room', true), { title: 'A private room: only the people inside see and hear each other' }),
      button('Open area', () => a.newRegion('room', false), { title: 'A named area, like a kitchen' }),
      button('Desk pod', () => a.newRegion('pod'), { title: 'A group of desks people can claim' }),
    );
    box.append(make);

    const all: { ref: RegionRef; name: string; note: string }[] = [
      ...s.rooms.map((r) => ({ ref: { kind: 'room' as const, id: r.id }, name: r.name, note: r.private ? 'private' : 'open' })),
      ...s.pods.map((p) => ({ ref: { kind: 'pod' as const, id: p.id }, name: p.name, note: `pod · ${p.mode}` })),
    ];
    if (all.length) box.append(title('In this office'));
    for (const r of all) {
      const on = s.region?.kind === r.ref.kind && s.region.id === r.ref.id;
      box.append(button(`${r.name || '(no name)'} · ${r.note}`, () => a.selectRegion(on ? null : r.ref), { className: 'link' + (on ? ' on' : ''), title: 'Pick it to change it' }));
    }

    const sel = s.region;
    if (!sel) return;
    const room = sel.kind === 'room' ? s.rooms.find((r) => r.id === sel.id) : undefined;
    const pod = sel.kind === 'pod' ? s.pods.find((p) => p.id === sel.id) : undefined;
    if (!room && !pod) return;
    const name = Object.assign(document.createElement('input'), { type: 'text', maxLength: 25, value: (room ?? pod)!.name, ariaLabel: 'Name' });
    name.onchange = () => (room ? a.patchRoom({ name: name.value }) : a.patchPod({ name: name.value }));
    box.append(title('Settings'), row(document.createTextNode('Name'), name));
    if (room) {
      const priv = Object.assign(document.createElement('input'), { type: 'checkbox', checked: room.private });
      priv.onchange = () => a.patchRoom({ private: priv.checked });
      const restricted = Object.assign(document.createElement('input'), { type: 'checkbox', checked: room.restricted });
      restricted.onchange = () => a.patchRoom({ restricted: restricted.checked });
      const cap = Object.assign(document.createElement('input'), { type: 'number', min: '1', max: '50', value: room.capacity === undefined ? '' : String(room.capacity), placeholder: 'any', ariaLabel: 'Most people' });
      cap.onchange = () => a.patchRoom({ capacity: cap.value === '' ? null : Number(cap.value) });
      box.append(
        row(document.createTextNode('Private (closed door)'), priv),
        row(document.createTextNode('Knock to enter'), restricted),
        row(document.createTextNode('Most people'), cap),
      );
    } else if (pod) {
      const mode = document.createElement('select');
      for (const m of ['ambient', 'cubicle'] as const) mode.append(Object.assign(document.createElement('option'), { value: m, textContent: m, selected: pod.mode === m }));
      mode.onchange = () => a.patchPod({ mode: mode.value as 'ambient' | 'cubicle' });
      box.append(row(document.createTextNode('Neighbours'), mode));
    }
    const paint = document.createElement('div');
    paint.className = 'tools';
    paint.append(
      button('Paint tiles', () => a.regionMode('paint'), { className: s.tool === 'region' && s.regionMode === 'paint' ? 'on' : '', title: 'Click or drag on the map to add tiles' }),
      button('Erase tiles', () => a.regionMode('unpaint'), { className: s.tool === 'region' && s.regionMode === 'unpaint' ? 'on' : '', title: 'Click or drag on the map to take tiles away' }),
      button('Delete', a.deleteRegion),
    );
    box.append(paint);
  }

  /** The Custom tab: the objects builders added, and a form to add one. */
  private renderCustom(box: HTMLElement, s: PanelState) {
    const a = this.api;
    const title = (t: string) => Object.assign(document.createElement('b'), { textContent: t });
    box.append(title('Added by builders'));
    if (!s.customs.length) box.append(Object.assign(document.createElement('div'), { className: 'bnote', textContent: 'Nothing yet. Add your own below.' }));
    const list = document.createElement('div');
    list.className = 'picks';
    for (const o of s.customs) {
      const kind = `custom:${o.id}`;
      const pick = button('', () => a.pickItem(kind), { className: 'pick' + (s.tool === 'place' && s.brush.kind === kind ? ' on' : ''), title: `${o.name} (${o.footprint[0]}\u00d7${o.footprint[1]})` });
      const top = viewCanvas(o.id, 'top', 0);
      if (top) {
        const c = document.createElement('canvas');
        c.width = top.width;
        c.height = top.height;
        c.getContext('2d')!.drawImage(top, 0, 0);
        c.style.width = `${Math.min(o.footprint[0], 2) * 44}px`;
        pick.append(c);
      }
      pick.append(Object.assign(document.createElement('span'), { textContent: o.name }));
      const del = button('Remove', () => a.removeObject(o.id), { className: 'quiet', title: `Remove ${o.name} from the office` });
      const cell = document.createElement('div');
      cell.className = 'customcell';
      cell.append(pick, del);
      list.append(cell);
    }
    box.append(list);

    box.append(title('Add your own'));
    box.append(Object.assign(document.createElement('div'), {
      className: 'bnote',
      textContent: 'Draw it in any pixel-art tool (see objects/FORMAT.md for the sheet layout), then choose the PNG and describe it.',
    }));
    const f = this.form;
    const row = (label: string, ...kids: Node[]) => {
      const r = document.createElement('div');
      r.className = 'hrow';
      r.append(document.createTextNode(label), ...kids);
      return r;
    };
    const num = (value: number, min: number, max: number, set: (n: number) => void, step = 1) => {
      const i = Object.assign(document.createElement('input'), { type: 'number', min: String(min), max: String(max), step: String(step), value: String(value) });
      i.onchange = () => set(Number(i.value));
      return i;
    };
    const file = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/png,.png', ariaLabel: 'Sheet (PNG)' });
    file.onchange = () => {
      this.file = file.files?.[0] ?? null;
      if (this.file && !f.name) f.name = this.file.name.replace(/\.png$/i, '').replace(/[-_]+/g, ' ').slice(0, 32);
      a.setTab('custom');
    };
    const json = Object.assign(document.createElement('input'), { type: 'file', accept: 'application/json,.json', ariaLabel: 'Settings (JSON), optional' });
    json.onchange = async () => {
      try {
        const m = JSON.parse(await json.files![0].text());
        if (typeof m.name === 'string') f.name = m.name.slice(0, 32);
        if (Array.isArray(m.footprint)) [f.w, f.d] = [Number(m.footprint[0]) || 1, Number(m.footprint[1]) || 1];
        if (Number.isFinite(m.height)) f.height = m.height;
        if (typeof m.blocks === 'boolean') f.blocks = m.blocks;
        if (Number.isFinite(m.frames)) f.frames = m.frames;
        if (Number.isFinite(m.fps)) f.fps = m.fps;
        f.back = m.back === true;
      } catch {
        /* an unreadable settings file just leaves the form as it was */
      }
      a.setTab('custom');
    };
    const name = Object.assign(document.createElement('input'), { type: 'text', maxLength: 32, value: f.name, ariaLabel: 'Name' });
    name.onchange = () => (f.name = name.value);
    const height = document.createElement('select');
    for (let h = 8; h <= 96; h += 8) height.append(Object.assign(document.createElement('option'), { value: String(h), textContent: `${h} px`, selected: f.height === h }));
    height.onchange = () => (f.height = Number(height.value));
    const blocks = Object.assign(document.createElement('input'), { type: 'checkbox', checked: f.blocks });
    blocks.onchange = () => (f.blocks = blocks.checked);
    const back = Object.assign(document.createElement('input'), { type: 'checkbox', checked: f.back });
    back.onchange = () => (f.back = back.checked);
    box.append(
      row('Sheet (PNG)', file),
      row('Settings (optional)', json),
      row('Name', name),
      row('Footprint (tiles)', num(f.w, 1, 4, (n) => (f.w = n)), num(f.d, 1, 4, (n) => (f.d = n))),
      row('Height', height),
      row('Blocks walking', blocks),
      row('Frames \u00b7 per second', num(f.frames, 1, 8, (n) => (f.frames = n)), num(f.fps, 1, 12, (n) => (f.fps = n))),
      row('Separate back view', back),
    );
    const go = button('Add to the office', () => {
      if (!this.file) return a.upload(new File([], 'none'), null);
      a.upload(this.file, { format: 1, name: f.name, footprint: [f.w, f.d], height: f.height, blocks: f.blocks, frames: f.frames, fps: f.fps, back: f.back });
    }, { className: 'primary', disabled: s.busy });
    box.append(go);
    for (const e of s.uploadErrors) box.append(Object.assign(document.createElement('div'), { className: 'bwarn', textContent: describeObjectError(e) }));
  }
}
