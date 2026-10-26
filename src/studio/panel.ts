// The studio's screen: parts on the left, the two previews in the middle, properties on the right, and the limits and
// what is wrong along the bottom. It draws what the controller gives it and calls back what the person did.
import { GROUPS, KINDS, MAX_PARTS, PATTERNS, SEASONS, STEP, heightLimit, type Kind, type Part, type Pattern } from '../../shared/items';
import * as m from './model';
import type { ViewName } from './preview3d';
import { MAX_TEXT, markNoteRead } from './helper-ui';
import { drawTopPreview, partAt, pointToTile, topLayout } from './top-preview';

export interface StudioState {
  design: m.Design;
  selected: number | null;
  /** Plain words, one per problem. */
  problems: string[];
  codes: string[];
  notes: string[];
  saveText: string;
  /** Whether a save changes an existing item (otherwise it makes a new one). */
  editing: boolean;
  canUndo: boolean;
  canRedo: boolean;
  busy: boolean;
  fromHelper: boolean;
  /** The item helper: absent when it is off or for a guest. */
  helper?: { status: 'unavailable' | 'on'; working: boolean; cooling: boolean; message: string; noteRead: boolean };
}

export interface StudioApi {
  addPart(shape: m.Shape): void;
  duplicate(): void;
  remove(): void;
  reorder(by: -1 | 1): void;
  mirror(): void;
  select(i: number | null): void;
  nudge(dx: number, dy: number, dz?: number): void;
  resize(dw: number, dd: number, dh?: number): void;
  setPart(patch: Partial<Part>): void;
  setName(n: string): void;
  setGroup(g: (typeof GROUPS)[number]['id']): void;
  setSeason(s: (typeof SEASONS)[number] | undefined): void;
  setKind(k: Kind): void;
  setFootprint(w: number, d: number): void;
  setBlocks(b: boolean): void;
  setHang(h: number): void;
  view(v: ViewName): void;
  undo(): void;
  redo(): void;
  /** Ask the helper for a draft from words and/or a picture. */
  askHelper(text: string, image: File | null): void;
  cancelHelper(): void;
  save(asCopy?: boolean): void;
  discard(): void;
  remove_item(): void;
  close(): void;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
};
const button = (label: string, onClick: () => void, props: Record<string, unknown> = {}) => el('button', { type: 'button', textContent: label, onclick: onClick, ...props });

const KIND_NAMES: Record<Kind, string> = { floor: 'Stands on the floor', deskitem: 'Stands on a desk', wall: 'Hangs on a wall', floorart: 'Lies flat on the floor' };
const SHAPE_NAMES: Record<m.Shape, string> = { box: 'Box', plank: 'Plank', post: 'Post', sheet: 'Sheet', slab: 'Slab' };
const SEASON_NAMES = { winter: 'Winter', spring: 'Spring', summer: 'Summer', autumn: 'Autumn' };

export class StudioPanel {
  private top = el('canvas', { className: 'studiotop' });
  private last: StudioState | null = null;
  /** The field that had focus before a redraw, so typing is not interrupted. */
  private focusKey: string | null = null;
  /** What was typed for the helper, kept while the panel is redrawn. */
  private helperText = '';
  private helperImage: File | null = null;

  constructor(private root: HTMLElement, private canvas3d: HTMLCanvasElement, private a: StudioApi) {
    let drag: { px: number; py: number; part: number } | null = null;
    this.top.addEventListener('pointerdown', (e) => {
      const s = this.last;
      if (!s) return;
      const r = this.top.getBoundingClientRect();
      const [tx, ty] = pointToTile(topLayout(s.design), ((e.clientX - r.left) * this.top.width) / r.width, ((e.clientY - r.top) * this.top.height) / r.height);
      const hit = partAt(s.design, tx, ty);
      this.a.select(hit);
      drag = hit === null ? null : { px: e.clientX, py: e.clientY, part: hit };
      this.top.setPointerCapture(e.pointerId);
    });
    this.top.addEventListener('pointermove', (e) => {
      const s = this.last;
      if (!drag || !s) return;
      const l = topLayout(s.design);
      const r = this.top.getBoundingClientRect();
      const scale = this.top.width / r.width;
      const dx = Math.round(((e.clientX - drag.px) * scale) / l.tilePx / STEP) * STEP;
      const dy = Math.round(((e.clientY - drag.py) * scale) / l.tilePx / STEP) * STEP;
      if (!dx && !dy) return;
      drag.px += (dx * l.tilePx) / scale;
      drag.py += (dy * l.tilePx) / scale;
      this.a.nudge(dx, dy);
    });
    const end = () => { drag = null; };
    this.top.addEventListener('pointerup', end);
    this.top.addEventListener('pointercancel', end);
  }

  focus() {
    (this.root.querySelector('input, button') as HTMLElement | null)?.focus();
  }

  /** The top-down canvas is drawn apart from the form, because dragging redraws it many times a second. */
  drawTop(d: m.Design, selected: number | null) {
    const l = topLayout(d);
    if (this.top.width !== l.width || this.top.height !== l.height) {
      this.top.width = l.width;
      this.top.height = l.height;
    }
    drawTopPreview(this.top.getContext('2d')!, d, selected);
  }

  render(s: StudioState) {
    this.last = s;
    const a = this.a;
    const active = document.activeElement as HTMLElement | null;
    this.focusKey = active && this.root.contains(active) ? active.dataset.key ?? null : null;
    const d = s.design;
    const sel = s.selected === null ? undefined : d.parts[s.selected];

    // Left: the parts.
    const left = el('div', { className: 'sparts' }, el('b', { textContent: `Parts ${d.parts.length} of ${MAX_PARTS}` }));
    const shapes = el('div', { className: 'sshapes' });
    for (const shape of m.SHAPES) shapes.append(button(`+ ${SHAPE_NAMES[shape]}`, () => a.addPart(shape), { disabled: d.parts.length >= MAX_PARTS }));
    left.append(shapes);
    const list = el('ol', { className: 'slist' });
    d.parts.forEach((p, i) => {
      const li = el('li', { className: i === s.selected ? 'on' : '' });
      const chip = el('span', { className: 'chip' });
      chip.style.background = p.color;
      li.append(chip, el('span', { textContent: `${i + 1}  ${p.pattern} ${p.w}×${p.d}×${p.h}` }));
      li.onclick = () => a.select(i);
      list.append(li);
    });
    const tools = el('div', { className: 'sshapes' },
      button('Copy', a.duplicate, { disabled: !sel || d.parts.length >= MAX_PARTS, title: 'Copy the selected part' }),
      button('Mirror', a.mirror, { disabled: !sel || d.parts.length >= MAX_PARTS, title: 'Add a twin on the other side of the middle' }),
      button('Up', () => a.reorder(-1), { disabled: !sel, title: 'Earlier in the list' }),
      button('Down', () => a.reorder(1), { disabled: !sel, title: 'Later in the list' }),
      button('Delete', a.remove, { disabled: !sel, title: 'Delete the selected part (Delete key)' }),
    );
    left.append(tools, list);

    // The helper, under the parts.
    if (s.helper) {
      const box = el('div', { className: 'shelper' }, el('b', { textContent: 'Helper' }));
      if (s.helper.status === 'unavailable') {
        box.append(el('div', { className: 'bnote', textContent: s.helper.cooling ? 'The helper isn’t answering right now. Try again in a minute.' : 'The helper isn’t set up on this server.' }));
        box.classList.add('off');
      } else if (!s.helper.noteRead) {
        box.append(
          el('div', { className: 'bnote', textContent: 'The helper turns a few words or a picture into a first draft. What you type or choose is sent to the AI service your admin chose, and this office keeps none of it.' }),
          button('Got it', () => { markNoteRead(); a.cancelHelper(); }),
        );
      } else {
        const text = el('textarea', { rows: 3, maxLength: MAX_TEXT, placeholder: 'Describe it: a small potted cactus with a red pot', value: this.helperText, disabled: s.helper.working });
        text.dataset.key = 'helper-text';
        text.oninput = () => { this.helperText = text.value; };
        const file = el('input', { type: 'file', accept: 'image/png,image/jpeg', disabled: s.helper.working });
        file.dataset.key = 'helper-file';
        file.onchange = () => { this.helperImage = file.files?.[0] ?? null; };
        box.append(text, file);
        if (s.helper.working) box.append(el('div', { className: 'bnote', textContent: 'Working on it…' }), button('Cancel', a.cancelHelper));
        else box.append(button('Make a draft', () => a.askHelper(this.helperText, this.helperImage), { className: 'primary' }));
        if (s.helper.message) box.append(el('div', { className: 'bwarn', textContent: s.helper.message }));
      }
      left.append(box);
    }

    // Middle: the previews.
    const views = el('div', { className: 'sviews' });
    for (const v of ['front', 'back', 'left', 'right'] as ViewName[]) views.append(button(v[0].toUpperCase() + v.slice(1), () => a.view(v)));
    const middle = el('div', { className: 'smiddle' },
      el('div', { className: 'spreview' }, el('b', { textContent: 'In the office (first person)' }), this.canvas3d, views),
      el('div', { className: 'spreview' }, el('b', { textContent: 'On the map (top-down)' }), this.top),
      el('div', { className: 'bnote', textContent: 'Drag the 3D view to turn it, scroll to zoom. Click a part on the map to select it; drag to move. Arrow keys nudge by 0.05.' }),
    );

    // Right: properties.
    const right = el('div', { className: 'sprops' });
    const field = (label: string, ctl: HTMLElement) => right.append(el('label', {}, el('span', { textContent: label }), ctl));
    const input = (key: string, props: Record<string, unknown>, onCommit: (v: string) => void) => {
      const i = el('input', props);
      i.dataset.key = key;
      i.onchange = () => onCommit(i.value);
      return i;
    };
    const select = (key: string, options: [string, string][], value: string, onCommit: (v: string) => void) => {
      const e = el('select');
      for (const [v, name] of options) e.append(el('option', { value: v, textContent: name, selected: v === value }));
      e.dataset.key = key;
      e.onchange = () => onCommit(e.value);
      return e;
    };
    right.append(el('b', { textContent: s.editing ? 'This item' : 'New item' }));
    field('Name', input('name', { type: 'text', value: d.name, maxLength: 32 }, a.setName));
    field('Where it goes', select('kind', KINDS.map((k) => [k, KIND_NAMES[k]]), d.kind, (v) => a.setKind(v as Kind)));
    field('Group', select('group', GROUPS.map((g) => [g.id, g.name]), d.group, (v) => a.setGroup(v as (typeof GROUPS)[number]['id'])));
    field('Season', select('season', [['', 'None'], ...SEASONS.map((x) => [x, SEASON_NAMES[x]] as [string, string])], d.season ?? '', (v) => a.setSeason((v || undefined) as (typeof SEASONS)[number] | undefined)));
    const fpStep = d.kind === 'floor' || d.kind === 'floorart' ? 1 : 0.25;
    const fpMax = d.kind === 'floor' || d.kind === 'floorart' ? 4 : 1;
    const wInput = input('fw', { type: 'number', value: String(d.footprint[0]), min: String(fpStep), max: String(fpMax), step: String(fpStep) }, (v) => a.setFootprint(Number(v), d.footprint[1]));
    const dInput = input('fd', {
      type: 'number', value: String(d.footprint[1]), min: d.kind === 'wall' ? '0.05' : String(fpStep), max: d.kind === 'wall' ? '0.25' : String(fpMax), step: d.kind === 'wall' ? '0.05' : String(fpStep),
    }, (v) => a.setFootprint(d.footprint[0], Number(v)));
    field('Footprint (tiles)', el('span', { className: 'pair' }, wInput, '×', dInput));
    if (d.kind === 'floor') field('Blocks walking', input('blocks', { type: 'checkbox', checked: d.blocks !== false }, () => a.setBlocks(!(d.blocks !== false))));
    if (d.kind === 'wall') field('Hangs at (tiles up)', input('hang', { type: 'number', value: String(d.hang ?? 0.35), min: '0', max: '0.8', step: '0.05' }, (v) => a.setHang(Number(v))));
    if (sel) {
      right.append(el('b', { textContent: `Part ${s.selected! + 1}` }));
      const num = (key: 'x' | 'y' | 'z' | 'w' | 'd' | 'h', label: string) => {
        const flat = d.kind === 'floorart' && (key === 'z' || key === 'h');
        const i = input(`p-${key}`, { type: 'number', value: String(sel[key]), step: String(STEP), min: key === 'w' || key === 'd' || key === 'h' ? String(STEP) : '0', max: key === 'h' || key === 'z' ? String(heightLimit(d.kind)) : '4', disabled: flat }, (v) => a.setPart({ [key]: Number(v) }));
        return el('label', {}, el('span', { textContent: label }), i);
      };
      right.append(el('div', { className: 'pgrid' }, num('x', 'Left'), num('y', 'Back'), num('z', 'Up'), num('w', 'Width'), num('d', 'Depth'), num('h', 'Height')));
      field('Pattern', select('pattern', PATTERNS.map((p) => [p, p[0].toUpperCase() + p.slice(1)]), sel.pattern, (v) => a.setPart({ pattern: v as Pattern })));
      field('Color', input('color', { type: 'color', value: sel.color }, (v) => a.setPart({ color: v })));
    }

    // Bottom: what is wrong, the limits, and the buttons.
    const notes = el('div', { className: 'snotes' });
    if (s.fromHelper) notes.append(el('div', { className: 'bnote', textContent: 'A first draft from the helper. Check it and change what you like.' }));
    for (const p of s.problems) notes.append(el('div', { className: 'bwarn', textContent: p }));
    for (const n of s.notes) notes.append(el('div', { className: 'bnote', textContent: n }));
    const bottom = el('div', { className: 'sbottom' },
      notes,
      el('div', { className: 'bnote', textContent: s.saveText }),
      button('Undo', a.undo, { disabled: !s.canUndo }),
      button('Redo', a.redo, { disabled: !s.canRedo }),
      button('Discard', a.discard, { title: 'Start over with an empty design' }),
      s.editing ? button('Delete item', a.remove_item, { className: 'quiet' }) : el('span'),
      button('Save as copy', () => a.save(true), { disabled: s.busy || s.codes.length > 0 || !s.editing, title: 'Keep this as a new item and leave the original alone' }),
      button(s.editing ? 'Save changes' : 'Save', () => a.save(false), { disabled: s.busy || s.codes.length > 0, className: 'primary' }),
      button('Close', a.close, { className: 'quiet' }),
    );

    this.root.replaceChildren(el('div', { className: 'sbody' }, left, middle, right), bottom);
    if (this.focusKey) (this.root.querySelector(`[data-key="${this.focusKey}"]`) as HTMLElement | null)?.focus();
  }
}
