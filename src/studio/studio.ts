// The studio controller: holds the design being made, changes it through the pure model, keeps an unfinished design as
// the member's draft on the server, and saves it as an item. It draws nothing itself (see panel.ts).
import { describeItemError, type ItemDefinition, type Kind, type Part } from '../../shared/items';
import { api } from '../world-client';
import * as m from './model';
import { StudioPanel, type StudioState } from './panel';
import { helperCooling, helperStatus, noteRead, requestDraft } from './helper-ui';
import { Preview3D, type ViewName } from './preview3d';

export interface StudioDeps {
  /** Said at the top of the office for a few seconds. */
  notice(text: string): void;
  /** Runs after an item was saved or deleted, so the builder can pick it up. */
  onItemChanged(id: string | null): void;
}

export interface Seed {
  design: m.Design;
  /** Set when this is the member's own item and a save should change it (a new version) rather than make a copy. */
  itemId?: string;
  fromHelper?: boolean;
}

const AUTOSAVE_MS = 1000;
const HISTORY = 60;

export class Studio {
  private root = document.createElement('div');
  private panel: StudioPanel;
  private preview: Preview3D;
  private design: m.Design = m.newDesign('floor');
  private itemId: string | undefined;
  private fromHelper = false;
  private selected: number | null = 0;
  private undoStack: m.Design[] = [];
  private redoStack: m.Design[] = [];
  private notes: string[] = [];
  private saveText = '';
  private busy = false;
  private timer = 0;
  private opened = false;
  private helperAbort: AbortController | null = null;
  private helperMessage = '';

  constructor(private deps: StudioDeps) {
    this.root.id = 'studio';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Furniture studio');
    document.body.append(this.root);
    const canvas3d = document.createElement('canvas');
    canvas3d.className = 'studio3d';
    this.preview = new Preview3D(canvas3d);
    this.preview.onChange = () => this.draw();
    this.panel = new StudioPanel(this.root, canvas3d, this.api());
    this.root.addEventListener('keydown', (e) => this.key(e));
  }

  get isOpen() {
    return this.opened;
  }

  /** Opens the studio on `seed`, or on the member's saved draft, or on a fresh design. */
  async open(seed?: Seed) {
    this.opened = true;
    this.root.hidden = false;
    this.notes = [];
    this.undoStack = [];
    this.redoStack = [];
    if (seed) this.load(seed);
    else {
      const r = await api<{ design: m.Design; itemId?: string; fromHelper?: boolean }>('/api/studio/draft');
      if (r.status === 200 && typeof r.body.design === 'object') this.load({ design: r.body.design, itemId: r.body.itemId, fromHelper: r.body.fromHelper });
      else this.load({ design: m.newDesign('floor') });
    }
    this.saveText = seed ? '' : this.saveText;
    this.render();
    this.panel.focus();
  }

  close() {
    this.opened = false;
    this.root.hidden = true;
    clearTimeout(this.timer);
    void this.flushDraft();
  }

  private load(seed: Seed) {
    this.design = structuredClone(seed.design);
    this.itemId = seed.itemId;
    this.fromHelper = !!seed.fromHelper;
    this.selected = this.design.parts.length ? 0 : null;
    this.scheduleDraft();
  }

  // ------------------------------------------------------------------ changing the design

  /** Applies a change; keeps the old design for undo. */
  private change(next: m.Design, select?: number | null) {
    if (next === this.design) return;
    this.undoStack.push(this.design);
    if (this.undoStack.length > HISTORY) this.undoStack.shift();
    this.redoStack = [];
    this.design = next;
    if (select !== undefined) this.selected = select;
    else if (this.selected !== null && this.selected >= next.parts.length) this.selected = next.parts.length ? next.parts.length - 1 : null;
    this.notes = [];
    this.scheduleDraft();
    this.render();
  }

  private undo() {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(this.design);
    this.design = prev;
    if (this.selected !== null && this.selected >= prev.parts.length) this.selected = prev.parts.length ? prev.parts.length - 1 : null;
    this.scheduleDraft();
    this.render();
  }

  private redo() {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.design);
    this.design = next;
    this.scheduleDraft();
    this.render();
  }

  private part<T>(fn: (i: number) => T): T | undefined {
    return this.selected === null ? undefined : fn(this.selected);
  }

  private api() {
    return {
      addPart: (shape: m.Shape) => { const r = m.addPart(this.design, shape); this.change(r.design, r.index); },
      duplicate: () => this.part((i) => { const r = m.duplicatePart(this.design, i); this.change(r.design, r.index); }),
      remove: () => this.part((i) => this.change(m.deletePart(this.design, i))),
      reorder: (by: -1 | 1) => this.part((i) => { const r = m.reorderPart(this.design, i, by); this.change(r.design, r.index); }),
      mirror: () => this.part((i) => {
        const r = m.mirrorPart(this.design, i);
        if (!r.added) this.notes = ['That part is already in the middle, so it has no twin.'];
        this.change(r.design, r.index);
        this.render();
      }),
      select: (i: number | null) => { this.selected = i; this.render(); },
      nudge: (dx: number, dy: number, dz = 0) => this.part((i) => this.change(m.movePart(this.design, i, dx, dy, dz))),
      resize: (dw: number, dd: number, dh = 0) => this.part((i) => this.change(m.resizePart(this.design, i, dw, dd, dh))),
      setPart: (patch: Partial<Part>) => this.part((i) => this.change(m.setPart(this.design, i, patch))),
      setName: (n: string) => this.change(m.setName(this.design, n)),
      setGroup: (g: Parameters<typeof m.setGroup>[1]) => this.change(m.setGroup(this.design, g)),
      setSeason: (s: Parameters<typeof m.setSeason>[1]) => this.change(m.setSeason(this.design, s)),
      setKind: (k: Kind) => { const r = m.setKind(this.design, k); this.change(r.design); this.notes = r.notes; this.render(); },
      setFootprint: (w: number, d: number) => this.change(m.setFootprint(this.design, [w, d])),
      setBlocks: (b: boolean) => this.change(m.setBlocks(this.design, b)),
      setHang: (h: number) => this.change(m.setHang(this.design, h)),
      view: (v: ViewName) => this.preview.setView(v),
      undo: () => this.undo(),
      redo: () => this.redo(),
      askHelper: (text: string, image: File | null) => void this.askHelper(text, image),
      cancelHelper: () => { this.helperAbort?.abort(); this.render(); },
      save: (asCopy = false) => void this.save(asCopy),
      discard: () => void this.discard(),
      remove_item: () => void this.deleteItem(),
      close: () => this.close(),
    };
  }

  private key(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement).tagName;
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag);
    e.stopPropagation(); // the office must not hear WASD while a member is designing
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if (e.key === 'Escape') {
      if (typing) (e.target as HTMLElement).blur();
      else this.close();
      return;
    }
    if (typing) return;
    const step = e.shiftKey ? 0.25 : 0.05;
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (arrows[e.key]) {
      e.preventDefault();
      this.api().nudge(...arrows[e.key]);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      this.api().remove();
    } else if (e.key === 'PageUp') this.api().nudge(0, 0, step);
    else if (e.key === 'PageDown') this.api().nudge(0, 0, -step);
  }

  // ------------------------------------------------------------------ the server

  private scheduleDraft() {
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.flushDraft(), AUTOSAVE_MS);
  }

  private async flushDraft() {
    clearTimeout(this.timer);
    const r = await api('/api/studio/draft', 'PUT', { design: this.design, ...(this.itemId ? { itemId: this.itemId } : {}), fromHelper: this.fromHelper });
    this.saveText = r.status === 200 ? 'Draft saved' : r.status === 429 ? '' : 'Draft not saved';
    if (this.opened) this.render();
  }

  private async save(asCopy: boolean) {
    const codes = m.problemsOf(this.design);
    if (codes.length || this.busy) return;
    this.busy = true;
    this.render();
    const r = await api<{ item: { id: string; version: number }; pinned: number; error?: string; errors?: string[] }>('/api/items', 'POST', {
      def: this.design as ItemDefinition, ...(this.itemId ? { id: this.itemId } : {}), ...(asCopy ? { asCopy: true } : {}),
    });
    this.busy = false;
    if (r.status === 200 || r.status === 201) {
      this.itemId = r.body.item.id;
      this.fromHelper = false;
      await api('/api/studio/draft', 'DELETE');
      this.saveText = 'Saved';
      this.notes = r.body.pinned ? [`${r.body.pinned} placed ${r.body.pinned === 1 ? 'copy was' : 'copies were'} kept at the old size because the new one doesn’t fit where ${r.body.pinned === 1 ? 'it stands' : 'they stand'}.`] : [];
      this.deps.notice(r.status === 201 ? 'Item saved' : 'Item changed');
      this.deps.onItemChanged(`item:${r.body.item.id}`);
    } else if (r.body?.error === 'not-yours') {
      this.itemId = undefined;
      this.notes = ['That item belongs to someone else. Press Save as copy to keep your version.'];
    } else if (r.body?.error === 'too-many') this.notes = [describeItemError('too-many')];
    else if (r.body?.error === 'slow-down') this.notes = ['Saving too fast. Wait a moment.'];
    else if (r.body?.errors) this.notes = r.body.errors.map(describeItemError);
    else this.notes = ['Couldn’t save. Try again.'];
    this.render();
  }

  /** Asks the helper for a draft and, when it comes, opens it here marked as from the helper. Nothing is saved until the member saves. */
  private async askHelper(text: string, image: File | null) {
    if (this.helperAbort) return;
    this.helperAbort = new AbortController();
    this.helperMessage = '';
    this.render();
    const r = await requestDraft(text, image, this.helperAbort.signal);
    this.helperAbort = null;
    if ('design' in r) {
      this.undoStack.push(this.design);
      this.redoStack = [];
      this.design = structuredClone(r.design);
      this.itemId = undefined; // a helper draft is a new item
      this.fromHelper = true;
      this.selected = this.design.parts.length ? 0 : null;
      this.notes = [];
      this.scheduleDraft();
    } else this.helperMessage = r.cancelled ? '' : r.message;
    this.render();
  }

  /** Redraws, for when something outside the studio changed (the helper was switched on or off). */
  refresh() {
    if (this.opened) this.render();
  }

  private async discard() {
    this.undoStack = [];
    this.redoStack = [];
    this.itemId = undefined;
    this.design = m.newDesign('floor');
    this.selected = 0;
    this.notes = [];
    await api('/api/studio/draft', 'DELETE');
    this.saveText = '';
    this.render();
  }

  private async deleteItem() {
    if (!this.itemId || this.busy) return;
    const first = await api<{ placed?: number }>(`/api/items/${this.itemId}`, 'DELETE');
    if (first.status === 403) {
      this.notes = ['Only the person who made an item, or an admin, can delete it.'];
      return this.render();
    }
    if (first.status !== 200) return;
    const placed = first.body.placed ?? 0;
    if (!window.confirm(placed ? `${placed} ${placed === 1 ? 'copy is' : 'copies are'} placed in the office and will be removed. Delete this item?` : 'Delete this item?')) return;
    const id = this.itemId;
    const done = await api(`/api/items/${id}?confirm=1`, 'DELETE');
    if (done.status === 200) {
      this.itemId = undefined;
      this.deps.notice('Item deleted');
      this.deps.onItemChanged(null);
    }
    this.render();
  }

  // ------------------------------------------------------------------ drawing

  private state(): StudioState {
    const codes = m.problemsOf(this.design);
    return {
      design: this.design, selected: this.selected, problems: codes.map(describeItemError), codes, notes: this.notes, saveText: this.saveText,
      editing: !!this.itemId, canUndo: this.undoStack.length > 0, canRedo: this.redoStack.length > 0, busy: this.busy, fromHelper: this.fromHelper,
      ...(helperStatus() === 'on' || helperStatus() === 'unavailable' ? { helper: { status: helperStatus() as 'on' | 'unavailable', working: !!this.helperAbort, cooling: helperCooling(), message: this.helperMessage, noteRead: noteRead() } } : {}),
    };
  }

  private render() {
    this.panel.render(this.state());
    this.draw();
  }

  private draw() {
    if (!this.opened) return;
    this.preview.render(this.design, this.selected);
    this.panel.drawTop(this.design, this.selected);
  }
}

