// Build mode: a member edits a private draft of the office in the top-down view, then publishes it for everyone.
// This class owns the draft, the mouse and keyboard handling, saving and publishing; tools.ts makes the edits,
// panel.ts draws the panel, and the server decides what is allowed (it checks everything again on publish).
import { currentCatalog, customObjects, prefabById } from '../../shared/catalog';
import { designFromItem } from '../studio/model';
import { READY_MADE } from '../../shared/readymade';
import { studioDefinitions } from '../items-client';
import { validateObjectMeta, validateObjectSheet } from '../../shared/objects';
import { NO_WALL, cloneLayout, rotFootprint, type Face, type Layout, type PlacedObject } from '../../shared/layout';
import { checkLayout, type Problem } from '../../shared/layout-check';
import { mergeLayouts, type Clash, type Side } from '../../shared/layout-merge';
import { compileWorld, type World } from '../../shared/world';
import type { MapView, Renderer2D } from '../render2d';
import { api, published } from '../world-client';
import { History } from './history';
import { BuilderPanel, type HistoryRow, type PanelState, type RegionRef, type Tab, type ToolId } from './panel';
import * as tools from './tools';

export interface BuilderHost {
  canvas: HTMLCanvasElement;
  renderer: Renderer2D;
  /** The element the panel is drawn into. */
  panel: HTMLElement;
  notice(text: string, ttlMs?: number): void;
  /** Opens the furniture studio on a design (or on the member's saved one). */
  openStudio(seed?: { design: import('../studio/model').Design; itemId?: string }): void;
  /** Where the player stands (tiles); the camera starts there. */
  here(): { x: number; y: number };
  /** Build mode closed (by the person, or because building was switched off). */
  onClose(): void;
}

const SAVE_DELAY_MS = 1000;
const PAN_SPEED = 12; // tiles per second

interface Drag {
  id: string;
  /** Tile offset from the object's corner to where it was grabbed. */
  dx: number;
  dy: number;
  /** Desk items and wall decor are dragged by the pointer, not by tile. */
  attached?: 'deskitem' | 'wall';
  /** For those: the layout the drop would give, when it is allowed. */
  result?: Layout;
  /** Where it would land now. */
  x: number;
  y: number;
  why: string | null;
  moved: boolean;
}

export class Builder {
  private readonly panel: BuilderPanel;
  private _active = false;
  private layout!: Layout;
  private world!: World;
  private baseRev = 1;
  private history = new History();
  private problems: Problem[] = [];
  private clashes: Clash[] = [];
  private resolve: Record<string, Side> = {};
  private merge: { base: Layout | null; theirs: Layout; rev: number } | null = null;
  private tab: Tab = 'furniture';
  private tool: ToolId = 'select';
  private brush = { floor: '.', wall: '#', kind: 'desk', prefab: 'pod-4' };
  private region: RegionRef | null = null;
  private regionMode: 'paint' | 'unpaint' = 'paint';
  private rot = 0;
  private selected: string | null = null;
  private hover: [number, number] | null = null;
  /** The pointer in tiles with fractions, for desk items and wall decor. */
  private point: [number, number] | null = null;
  private pointFrom: [number, number] = [0, 0];
  private stroke = false;
  private lastTile: [number, number] | null = null;
  /** How many items went with a wall or desk during the stroke in progress. */
  private strokeGone = 0;
  private drag: Drag | null = null;
  private cam = { x: 0, y: 0 };
  private saveTimer = 0;
  private saveText = '';
  private behindText = '';
  private message = '';
  private busy = false;
  private rows: HistoryRow[] | null = null;
  private uploadErrors: string[] = [];
  private size = { w: 0, h: 0 };
  private readonly listeners: [EventTarget, string, (e: never) => void, AddEventListenerOptions?][] = [];

  constructor(private host: BuilderHost) {
    this.panel = new BuilderPanel(host.panel, {
      setTab: (t) => {
        this.tab = t;
        if (t === 'history') void this.loadHistory();
        this.emit();
      },
      setTool: (t) => this.setTool(t),
      pickPrefab: (id) => {
        this.brush.prefab = id;
        this.setTool('prefab');
      },
      newRegion: (kind, isPrivate) => {
        const r = tools.newRegion(this.layout, kind, '', { private: isPrivate });
        if (!r.ok) return this.tell(r.error);
        this.commit(r.layout);
        this.region = { kind, id: r.id! };
        this.regionMode = 'paint';
        this.setTool('region');
      },
      selectRegion: (ref) => {
        this.region = ref;
        if (!ref && this.tool === 'region') this.tool = 'select';
        this.emit();
      },
      regionMode: (mode) => {
        this.regionMode = mode;
        this.setTool('region');
      },
      patchRoom: (patch) => {
        if (!this.region) return;
        const r = tools.updateRoom(this.layout, this.region.id, patch);
        if (r.ok) this.commit(r.layout);
        else this.tell(r.error);
      },
      patchPod: (patch) => {
        if (!this.region) return;
        const r = tools.updatePod(this.layout, this.region.id, patch);
        if (r.ok) this.commit(r.layout);
        else this.tell(r.error);
      },
      upload: (file, meta) => void this.uploadObject(file, meta),
      removeObject: (id) => void this.removeObject(id),
      deleteRegion: () => {
        if (!this.region) return;
        this.commit(tools.deleteRegion(this.layout, this.region.kind, this.region.id));
        this.region = null;
        if (this.tool === 'region') this.setTool('select');
      },
      pickFloor: (c) => {
        this.brush.floor = c;
        this.setTool('floor');
      },
      pickWall: (c) => {
        this.brush.wall = c;
        this.setTool('wall');
      },
      openStudio: (k) => this.openStudio(k),
      pickItem: (k) => {
        this.brush.kind = k;
        this.rot = 0;
        this.setTool('place');
      },
      undo: () => this.undo(),
      redo: () => this.redo(),
      turn: () => this.turnSelected(),
      remove: () => this.removeSelected(),
      applySize: (w, h) => this.applySize(w, h),
      focus: (tiles) => this.focusOn(tiles),
      choose: (key, side) => {
        this.resolve[key] = side;
        this.emit();
      },
      publish: () => void this.publish(),
      discard: () => void this.discard(),
      exit: () => this.exit(),
      restore: (rev) => void this.restore(rev),
    });
  }

  get active() {
    return this._active;
  }

  /** The world being edited (for previews). */
  get draftWorld(): World {
    return this.world;
  }

  async enter() {
    if (this._active || this.busy) return;
    this.busy = true;
    const r = await api('/api/draft');
    this.busy = false;
    const base = published;
    if (!base) return this.host.notice('The office hasn’t loaded yet.', 3000);
    if (r.status === 403) return this.host.notice(r.body?.error === 'building-off' ? 'An admin has turned building off.' : 'Only members can build.', 4000);
    let layout = cloneLayout(base.layout);
    this.baseRev = base.rev;
    if (r.status === 200) {
      layout = r.body.layout;
      this.baseRev = r.body.baseRev;
      this.host.notice('Picked up your saved draft.', 3000);
    }
    this._active = true;
    document.body.classList.add('building');
    this.host.panel.hidden = false;
    this.history.clear();
    this.clashes = [];
    this.resolve = {};
    this.merge = null;
    this.message = '';
    this.saveText = 'Draft';
    this.tool = 'select';
    this.selected = null;
    const here = this.host.here();
    this.cam = { x: here.x, y: here.y };
    this.host.renderer.noSpotlight = true;
    this.host.renderer.focus = this.cam;
    this.host.renderer.overlay = (ctx, v, now) => this.drawOverlay(ctx, v, now);
    this.attach();
    this.setLayout(layout, false);
    this.checkBehind();
  }

  exit() {
    if (!this._active) return;
    void this.flushSave();
    this._active = false;
    this.detach();
    document.body.classList.remove('building');
    this.host.panel.hidden = true;
    const r = this.host.renderer;
    r.overlay = null;
    r.focus = null;
    r.noSpotlight = false;
    this.host.canvas.style.cursor = '';
    this.host.onClose();
  }

  toggle() {
    if (this._active) this.exit();
    else void this.enter();
  }

  /** The server turned building off for non-admins. */
  buildingOff() {
    if (!this._active) return;
    this.exit();
    this.host.notice('An admin turned building off. Your draft is saved.', 6000);
  }

  private lastOwnRev = 0;

  /** True for the revision this builder just published, so it is not announced as someone else's. */
  ownRev(rev: number): boolean {
    return rev === this.lastOwnRev;
  }

  /** Redraws the panel, for when something it shows (a custom picture) finished loading. */
  refreshPanel() {
    this.emit();
  }

  /** Someone published (possibly us). Tells the builder when its draft is behind the office. */
  publishedChanged() {
    if (this._active) this.checkBehind();
  }

  private checkBehind() {
    const p = published;
    this.behindText = p && p.rev > this.baseRev ? `${p.by.name} updated the office; yours will be merged in` : '';
    this.emit();
  }

  // ------------------------------------------------------------------ draft

  private setLayout(layout: Layout, save = true) {
    this.layout = layout;
    this.world = compileWorld(layout, currentCatalog());
    this.problems = checkLayout(layout, currentCatalog(), this.world);
    this.size = { w: layout.w, h: layout.h };
    this.host.renderer.setWorld(this.world);
    if (this.selected && !layout.objects.some((o) => o.id === this.selected)) this.selected = null;
    if (this.region && !(this.region.kind === 'room' ? layout.rooms : layout.pods).some((r) => r.id === this.region!.id)) this.region = null;
    if (save) this.scheduleSave();
    this.emit();
  }

  /** Remember the draft for undo, then change it. `meant` is how many objects the edit was meant to take away. */
  private commit(next: Layout, meant = 0) {
    const gone = this.layout.objects.length - next.objects.length - meant;
    this.history.push(this.layout);
    this.message = gone > 0 ? `${gone} ${gone === 1 ? 'item' : 'items'} went with ${gone === 1 ? 'its' : 'their'} desk or wall` : '';
    this.setLayout(next);
    if (gone > 0) this.emit();
  }

  private undo() {
    const prev = this.history.undo(this.layout);
    if (prev) this.setLayout(prev);
  }

  private redo() {
    const next = this.history.redo(this.layout);
    if (next) this.setLayout(next);
  }

  private tell(why: string) {
    this.message = why;
    this.emit();
  }

  private scheduleSave() {
    this.saveText = 'Saving…';
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => void this.flushSave(), SAVE_DELAY_MS);
  }

  private async flushSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = 0;
    if (!this.layout) return;
    const r = await api('/api/draft', 'PUT', { baseRev: this.baseRev, layout: this.layout });
    if (r.status === 200) this.saveText = 'Draft saved';
    else if (r.status === 429) {
      this.saveTimer = window.setTimeout(() => void this.flushSave(), 700);
      return;
    } else if (r.status === 403) {
      if (this._active) this.buildingOff();
      return;
    } else this.saveText = 'Couldn’t save your draft';
    if (this._active) this.emit();
  }

  private async discard() {
    if (this.busy || !window.confirm('Throw away your draft and start again from the office as it is?')) return;
    clearTimeout(this.saveTimer);
    await api('/api/draft', 'DELETE');
    const p = published;
    if (!p) return;
    this.baseRev = p.rev;
    this.history.clear();
    this.clashes = [];
    this.resolve = {};
    this.merge = null;
    this.message = '';
    this.setLayout(cloneLayout(p.layout), false);
    this.saveText = 'Draft';
    this.checkBehind();
  }

  private async restore(rev: number) {
    this.busy = true;
    this.emit();
    const r = await api(`/api/layout?rev=${rev}`);
    this.busy = false;
    if (r.status !== 200) return this.tell('That version is no longer kept.');
    this.history.push(this.layout);
    this.setLayout(r.body.layout);
    this.tell(`Version #${rev} is in your draft. Publish to make it live.`);
  }

  private async loadHistory() {
    const r = await api('/api/layout/history');
    this.rows = r.status === 200 ? r.body.map((x: { rev: number; by: { name: string }; at: number; objects: number }) => ({ rev: x.rev, by: x.by.name, at: x.at, objects: x.objects })) : [];
    this.emit();
  }

  // --------------------------------------------------------------- publishing

  private async publish() {
    if (this.busy) return;
    if (this.merge && this.clashes.length) {
      if (this.clashes.some((c) => !this.resolve[c.key])) return;
      const { base, theirs, rev } = this.merge;
      const { merged } = mergeLayouts(base, theirs, this.layout, this.resolve);
      this.history.push(this.layout);
      this.baseRev = rev;
      this.clashes = [];
      this.resolve = {};
      this.merge = null;
      this.setLayout(merged);
      if (this.problems.length) return this.tell('The merged office has problems. Fix them, then publish.');
    }
    if (this.problems.length) return;
    this.busy = true;
    this.emit();
    clearTimeout(this.saveTimer);
    const r = await api('/api/publish', 'POST', { baseRev: this.baseRev, layout: this.layout });
    this.busy = false;
    if (r.status === 200) {
      this.baseRev = r.body.rev;
      this.lastOwnRev = r.body.rev;
      this.message = '';
      this.saveText = 'Published';
      this.host.notice('Published. Everyone can see your changes.', 4000);
      this.checkBehind();
    } else if (r.status === 409) {
      await this.beginMerge(r.body.currentRev);
    } else if (r.status === 422) {
      this.problems = r.body.problems;
      this.tell('The office can’t be published yet.');
    } else if (r.status === 429) {
      this.tell('Wait a moment before publishing again.');
    } else if (r.status === 403) {
      this.buildingOff();
    } else this.tell('Couldn’t publish. Try again.');
  }

  private async beginMerge(currentRev: number) {
    const [b, t] = await Promise.all([api(`/api/layout?rev=${this.baseRev}`), api(`/api/layout?rev=${currentRev}`)]);
    if (t.status !== 200) return this.tell('Couldn’t load the latest office to merge with.');
    this.merge = { base: b.status === 200 ? b.body.layout : null, theirs: t.body.layout, rev: currentRev };
    const { clashes } = mergeLayouts(this.merge.base, this.merge.theirs, this.layout);
    this.clashes = clashes;
    this.resolve = {};
    this.tell('Someone else published while you were editing. Choose what to keep.');
  }

  // --------------------------------------------------------- custom objects

  /** Checks a sheet here first (the server checks it again), then sends it. */
  private async uploadObject(file: File, metaJson: unknown) {
    this.uploadErrors = [];
    const meta = validateObjectMeta(metaJson);
    if (!file.size) this.uploadErrors = ['not-png'];
    else if (!meta.ok) this.uploadErrors = meta.errors;
    else {
      try {
        const bitmap = await createImageBitmap(file);
        const canvas = Object.assign(document.createElement('canvas'), { width: bitmap.width, height: bitmap.height });
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(bitmap, 0, 0);
        const px = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const r = validateObjectSheet(px.data, px.width, px.height, file.size, meta.meta);
        if (!r.ok) this.uploadErrors = r.errors;
      } catch {
        this.uploadErrors = ['not-png'];
      }
    }
    if (this.uploadErrors.length || !meta.ok) return this.emit();
    this.busy = true;
    this.emit();
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const r = await api('/api/objects', 'POST', { png: btoa(binary), meta: meta.meta });
    this.busy = false;
    if (r.status === 201) {
      this.host.notice(`Added ${r.body.object.name}. Pick it and click the map to place it.`, 5000);
      this.brush.kind = `custom:${r.body.object.id}`;
    } else if (r.status === 409) this.uploadErrors = ['too-many'];
    else if (r.status === 429) this.uploadErrors = ['You can add ten objects a minute. Wait a little and try again.'];
    else if (r.status === 403) return this.buildingOff();
    else this.uploadErrors = r.body?.errors ?? ['Couldn\u2019t add that. Try again.'];
    this.emit();
  }

  private async removeObject(id: string) {
    const obj = customObjects().find((o) => o.id === id);
    if (!obj || this.busy) return;
    const asked = await api(`/api/objects/${id}`, 'DELETE');
    if (asked.status !== 200) return this.tell('Couldn\u2019t remove that.');
    const n: number = asked.body.placed;
    const text = n ? `Remove ${obj.name}? ${n} placed ${n === 1 ? 'copy' : 'copies'} will go too, for everyone.` : `Remove ${obj.name}?`;
    if (!window.confirm(text)) return;
    this.busy = true;
    this.emit();
    const done = await api(`/api/objects/${id}?confirm=1`, 'DELETE');
    this.busy = false;
    if (done.status === 200) {
      if (this.brush.kind === `custom:${id}`) this.brush.kind = 'desk';
      this.host.notice(`Removed ${obj.name}.`, 3000);
    } else this.tell('Couldn\u2019t remove that.');
    this.emit();
  }

  // ----------------------------------------------------------------- tools

  private setTool(t: ToolId) {
    this.tool = t;
    if (t !== 'select') this.selected = null;
    this.message = ''; 
    this.host.canvas.style.cursor = t === 'select' ? '' : 'crosshair';
    this.emit();
  }

  /** Opens the studio on the item `kind`: a ready-made one as a copy, one a member made as itself (the server decides who may change it). */
  private openStudio(kind?: string) {
    if (!kind) return this.host.openStudio();
    const item = currentCatalog().get(kind);
    if (!item) return this.tell('That item isn’t there any more.');
    // The six built-ins and uploaded objects can't be changed, but they make a fine starting point for a design of your own.
    if (!kind.startsWith('item:')) return this.host.openStudio({ design: designFromItem(item) });
    const made = studioDefinitions().find((r) => `item:${r.id}` === kind);
    const ready = READY_MADE.find((r) => r.id === kind);
    const def = made?.def ?? (ready && (({ id: _id, ...rest }) => rest)(ready));
    if (!def) return this.tell('That item isn’t there any more.');
    this.host.openStudio({ design: structuredClone(def), ...(made ? { itemId: made.id } : {}) });
  }

  /** Called when the studio saved or deleted an item: pick it for placing, or just redraw. */
  itemSaved(kind: string | null) {
    if (kind && currentCatalog().has(kind)) {
      this.brush.kind = kind;
      this.setTool('place');
    } else this.emit();
  }

  private turnSelected() {
    if (!this.selected) return;
    const r = tools.rotateObject(this.layout, this.selected, currentCatalog());
    if (r.ok) this.commit(r.layout);
    else this.tell(r.error);
  }

  private removeSelected() {
    if (!this.selected) return;
    this.commit(tools.deleteObject(this.layout, this.selected, currentCatalog()), 1);
    this.selected = null;
  }

  private applySize(w: number, h: number) {
    if (!Number.isFinite(w) || !Number.isFinite(h)) return;
    const { layout, cut } = tools.resize(this.layout, w, h, currentCatalog());
    if (layout.w === this.layout.w && layout.h === this.layout.h) return;
    if (cut.length && !window.confirm(`Making the office smaller removes: ${cut.slice(0, 8).join(', ')}${cut.length > 8 ? ', and more' : ''}. Go ahead?`)) return;
    this.commit(layout);
  }

  private focusOn(tiles: [number, number][]) {
    if (!tiles.length) return;
    const x = tiles.reduce((a, t) => a + t[0], 0) / tiles.length + 0.5;
    const y = tiles.reduce((a, t) => a + t[1], 0) / tiles.length + 0.5;
    this.cam.x = x;
    this.cam.y = y;
  }

  // ------------------------------------------------------------------ input

  private attach() {
    const on = <E extends Event>(t: EventTarget, type: string, fn: (e: E) => void, opts?: AddEventListenerOptions) => {
      t.addEventListener(type, fn as EventListener, opts);
      this.listeners.push([t, type, fn as never, opts]);
    };
    on<MouseEvent>(this.host.canvas, 'mousedown', (e) => this.down(e));
    on<MouseEvent>(window, 'mousemove', (e) => this.move(e));
    on<MouseEvent>(window, 'mouseup', () => this.up());
    on<Event>(this.host.canvas, 'contextmenu', (e) => e.preventDefault());
  }

  private detach() {
    for (const [t, type, fn, opts] of this.listeners) t.removeEventListener(type, fn as EventListener, opts);
    this.listeners.length = 0;
  }

  private tileOf(e: MouseEvent): [number, number] | null {
    const t = this.host.renderer.tileUnder(e.clientX, e.clientY);
    return t.x >= 0 && t.y >= 0 && t.x < this.layout.w && t.y < this.layout.h ? [t.x, t.y] : null;
  }

  private pointOf(e: MouseEvent): [number, number] {
    const p = this.host.renderer.pointUnder(e.clientX, e.clientY);
    return [p.x, p.y];
  }

  /** Where wall decor would hang for a pointer at (wx, wy): the wall tile and the face it is nearest. */
  private wallSpot(wx: number, wy: number): { tx: number; ty: number; face: Face | null } {
    const tx = Math.floor(wx), ty = Math.floor(wy);
    return { tx, ty, face: tools.wallFaceAt(this.layout, tx, ty, wx - tx, wy - ty) };
  }

  private down(e: MouseEvent) {
    if (e.button !== 0) return;
    this.point = this.pointOf(e);
    const t = this.tileOf(e);
    if (!t) return;
    const [x, y] = t;
    this.message = '';
    if (this.tool === 'prefab') {
      const p = prefabById(this.brush.prefab);
      if (!p) return;
      const r = tools.placePrefab(this.layout, p.id, x - Math.floor(p.size[0] / 2), y - Math.floor(p.size[1] / 2), currentCatalog());
      if (r.ok) this.commit(r.layout);
      else this.tell(r.error);
    } else if (this.tool === 'region') {
      if (!this.region) return this.tell('Pick or create a room or pod first.');
      this.history.push(this.layout);
      this.stroke = true;
      this.lastTile = null;
      this.paintAt(t);
    } else if (this.tool === 'floor' || this.tool === 'wall' || this.tool === 'erase') {
      this.history.push(this.layout);
      this.stroke = true;
      this.lastTile = null;
      this.paintAt(t);
    } else if (this.tool === 'place') {
      const item = currentCatalog().get(this.brush.kind);
      if (!item) return this.tell('That object has been removed.');
      if (item.kind === 'deskitem') {
        const r = tools.placeDeskItem(this.layout, this.brush.kind, this.point![0], this.point![1], this.rot, currentCatalog());
        if (r.ok) this.commit(r.layout);
        else this.tell(r.error);
        return;
      }
      if (item.kind === 'wall') {
        const s = this.wallSpot(this.point![0], this.point![1]);
        const r = tools.placeWallDecor(this.layout, this.brush.kind, s.tx, s.ty, s.face, currentCatalog());
        if (r.ok) this.commit(r.layout);
        else this.tell(r.error);
        return;
      }
      const [fw, fd] = this.footprint(item.footprint);
      const r = tools.placeObject(this.layout, this.brush.kind, x - Math.floor((fw - 1) / 2), y - Math.floor((fd - 1) / 2), this.rot, currentCatalog());
      if (r.ok) this.commit(r.layout);
      else this.tell(r.error);
    } else if (this.tool === 'spawn') {
      const r = tools.setSpawn(this.layout, x, y, currentCatalog());
      if (r.ok) this.commit(r.layout);
      else this.tell(r.error);
    } else {
      const o = tools.hitTest(this.layout, this.point![0], this.point![1], currentCatalog());
      this.selected = o?.id ?? null;
      const kind = o && currentCatalog().get(o.kind)?.kind;
      this.pointFrom = [this.point![0], this.point![1]];
      this.drag = o ? { id: o.id, dx: x - o.x, dy: y - o.y, x: o.x, y: o.y, why: null, moved: false, attached: kind === 'deskitem' || kind === 'wall' ? kind : undefined } : null;
      this.emit();
    }
  }

  private move(e: MouseEvent) {
    if (!this._active) return;
    const t = this.tileOf(e);
    this.hover = t;
    this.point = this.pointOf(e);
    if (!t) return;
    if (this.stroke) this.paintAt(t);
    else if (this.drag?.attached) {
      // Desk items and wall decor follow the pointer to wherever they would land; a refusal shows in red.
      const [wx, wy] = this.point;
      const d = this.drag;
      d.moved = d.moved || Math.abs(wx - this.pointFrom[0]) > 0.15 || Math.abs(wy - this.pointFrom[1]) > 0.15;
      if (d.moved) {
        const r = d.attached === 'wall'
          ? (() => { const s = this.wallSpot(wx, wy); return tools.moveWallDecor(this.layout, d.id, s.tx, s.ty, s.face, currentCatalog()); })()
          : tools.moveDeskItem(this.layout, d.id, wx, wy, currentCatalog());
        d.why = r.ok ? null : r.error;
        d.result = r.ok ? r.layout : undefined;
      }
    } else if (this.drag) {
      const o = this.layout.objects.find((q) => q.id === this.drag!.id);
      if (!o) return;
      const x = t[0] - this.drag.dx, y = t[1] - this.drag.dy;
      this.drag.x = x;
      this.drag.y = y;
      this.drag.moved = this.drag.moved || x !== o.x || y !== o.y;
      this.drag.why = tools.whyNotFit(this.layout, o.kind, x, y, o.rot, o.id, currentCatalog());
    }
  }

  private up() {
    if (this.stroke) {
      this.stroke = false;
      this.strokeGone = 0;
      this.lastTile = null;
      this.scheduleSave();
    }
    const d = this.drag;
    this.drag = null;
    if (d?.attached) {
      if (d.moved && d.result) this.commit(d.result);
      else if (d.moved && d.why) this.tell(d.why);
      return;
    }
    if (d?.moved) {
      const r = tools.moveObject(this.layout, d.id, d.x, d.y, currentCatalog());
      if (r.ok) this.commit(r.layout);
      else this.tell(r.error);
    }
  }

  /** Paints every tile from the last one visited to this one, so a quick drag leaves no gaps. */
  private paintAt(to: [number, number]) {
    const from = this.lastTile ?? to;
    const tiles: tools.Tile[] = [];
    const n = Math.max(Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1]));
    for (let i = 0; i <= n; i++) {
      tiles.push([Math.round(from[0] + ((to[0] - from[0]) * i) / (n || 1)), Math.round(from[1] + ((to[1] - from[1]) * i) / (n || 1))]);
    }
    this.lastTile = to;
    let next = this.layout;
    if (this.tool === 'floor') next = tools.paintFloor(next, tiles, this.brush.floor);
    else if (this.tool === 'wall') next = tools.paintWall(next, tiles, this.brush.wall, currentCatalog());
    else if (this.tool === 'region' && this.region) {
      if (this.regionMode === 'paint') {
        const r = tools.paintRegion(next, this.region.kind, this.region.id, tiles);
        if (r.ok) next = r.layout;
        else this.message = r.error;
      } else next = tools.unpaintRegion(next, this.region.kind, tiles, this.region.id);
    } else next = tools.erase(next, tiles, currentCatalog());
    // Decor and desk items that went with the wall or desk this stroke took away.
    const left = new Set(next.objects.map((o) => o.id));
    const gone = this.layout.objects.filter((o) => !left.has(o.id) && ((o.on && !left.has(o.on)) || o.wall)).filter((o) => !o.wall || next.walls[o.y * next.w + o.x] === NO_WALL || tools.wallFaceAt(next, o.x, o.y, 0.5, 0.5) === null).length;
    if (gone) {
      this.strokeGone += gone;
      this.message = `${this.strokeGone} ${this.strokeGone === 1 ? 'item' : 'items'} went with ${this.strokeGone === 1 ? 'its' : 'their'} desk or wall`;
    }
    if (JSON.stringify(next.rooms) !== JSON.stringify(this.layout.rooms) || JSON.stringify(next.pods) !== JSON.stringify(this.layout.pods)) this.setLayout(next, false);
    else if (next.floor !== this.layout.floor || next.walls !== this.layout.walls || next.objects.length !== this.layout.objects.length) {
      this.setLayout(next, false);
    }
  }

  private footprint(fp: readonly [number, number]): [number, number] {
    return this.rot % 2 === 0 ? [fp[0], fp[1]] : [fp[1], fp[0]];
  }

  /** Returns true when the key was used here; false lets the rest of the app see it (panning, zoom). */
  handleKey(e: KeyboardEvent): boolean {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.code === 'KeyZ') {
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
      return true;
    }
    if (mod && e.code === 'KeyY') {
      e.preventDefault();
      this.redo();
      return true;
    }
    if (mod) return false;
    switch (e.code) {
      case 'Escape':
        if (this.tool !== 'select') this.setTool('select');
        else if (this.selected) {
          this.selected = null;
          this.emit();
        }
        return true;
      case 'KeyR':
        if (e.repeat) return true;
        if (this.selected) this.turnSelected();
        else if (this.tool === 'place') this.rot = (this.rot + 1) & 3;
        return true;
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        this.removeSelected();
        return true;
      case 'KeyV':
      case 'Tab':
        e.preventDefault();
        this.host.notice('Publish your changes to look around in first person.', 3000);
        return true;
      case 'KeyG':
      case 'KeyF':
        return true;
      default:
        return false;
    }
  }

  /** Pans the camera with WASD or the arrow keys. */
  update(dt: number, held: ReadonlySet<string>) {
    const dx = +(held.has('KeyD') || held.has('ArrowRight')) - +(held.has('KeyA') || held.has('ArrowLeft'));
    const dy = +(held.has('KeyS') || held.has('ArrowDown')) - +(held.has('KeyW') || held.has('ArrowUp'));
    if (!dx && !dy) return;
    this.cam.x = Math.min(this.layout.w, Math.max(0, this.cam.x + dx * PAN_SPEED * dt));
    this.cam.y = Math.min(this.layout.h, Math.max(0, this.cam.y + dy * PAN_SPEED * dt));
  }

  // ------------------------------------------------------------------ view

  private emit() {
    if (!this._active) return;
    const sel: PlacedObject | undefined = this.layout.objects.find((o) => o.id === this.selected);
    const state: PanelState = {
      tab: this.tab,
      tool: this.tool,
      brush: this.brush,
      rooms: this.layout.rooms.map((r) => ({ id: r.id, name: r.name, private: r.private, restricted: r.restricted, ...(r.capacity === undefined ? {} : { capacity: r.capacity }) })),
      pods: this.layout.pods.map((p) => ({ id: p.id, name: p.name, mode: p.mode })),
      region: this.region,
      customs: [...customObjects()],
      uploadErrors: this.uploadErrors,
      regionMode: this.regionMode,
      selected: sel ? { id: sel.id, name: currentCatalog().get(sel.kind)?.name ?? sel.kind, kind: sel.kind } : null,
      canUndo: this.history.canUndo(),
      canRedo: this.history.canRedo(),
      saveText: this.saveText,
      behindText: this.behindText,
      problems: this.problems,
      clashes: this.clashes,
      resolve: this.resolve,
      history: this.rows,
      size: this.size,
      publishedRev: published?.rev ?? 0,
      busy: this.busy,
      message: this.message,
    };
    this.panel.render(state);
  }

  private drawOverlay(ctx: CanvasRenderingContext2D, v: MapView, now: number) {
    const { ox, oy, s } = v;
    const { w, h } = this.world;
    const line = Math.max(1, Math.round(v.dpr));
    ctx.save();
    ctx.lineWidth = line;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.09)';
    ctx.beginPath();
    for (let x = 0; x <= w; x++) {
      ctx.moveTo(ox + x * s + 0.5, oy);
      ctx.lineTo(ox + x * s + 0.5, oy + h * s);
    }
    for (let y = 0; y <= h; y++) {
      ctx.moveTo(ox, oy + y * s + 0.5);
      ctx.lineTo(ox + w * s, oy + y * s + 0.5);
    }
    ctx.stroke();

    const fillTiles = (tiles: readonly (readonly [number, number])[], fill: string, stroke?: string) => {
      ctx.fillStyle = fill;
      for (const [x, y] of tiles) ctx.fillRect(ox + x * s, oy + y * s, s, s);
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 2 * line;
        for (const [x, y] of tiles) ctx.strokeRect(ox + x * s + line, oy + y * s + line, s - 2 * line, s - 2 * line);
      }
    };
    // Rooms and pods: tinted, named, and the one being edited brighter.
    const tint = (rects: readonly (readonly [number, number, number, number])[], fill: string, picked: boolean, label: string) => {
      ctx.fillStyle = fill;
      for (const [x0, y0, x1, y1] of rects) ctx.fillRect(ox + x0 * s, oy + y0 * s, (x1 - x0 + 1) * s, (y1 - y0 + 1) * s);
      if (picked) {
        ctx.strokeStyle = 'rgba(241, 196, 83, 0.95)';
        ctx.lineWidth = 2 * line;
        for (const [x0, y0, x1, y1] of rects) ctx.strokeRect(ox + x0 * s + line, oy + y0 * s + line, (x1 - x0 + 1) * s - 2 * line, (y1 - y0 + 1) * s - 2 * line);
      }
      if (rects[0] && label) {
        ctx.font = `800 ${Math.round(12 * v.dpr)}px "Nunito", system-ui, sans-serif`;
        ctx.textBaseline = 'top';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fillText(label, ox + rects[0][0] * s + 4 * v.dpr, oy + rects[0][1] * s + 3 * v.dpr);
      }
    };
    for (const r of this.layout.rooms) {
      tint(r.rects, r.private ? 'rgba(110, 160, 255, 0.2)' : 'rgba(255, 255, 255, 0.06)', this.region?.kind === 'room' && this.region.id === r.id, r.name);
    }
    for (const p of this.layout.pods) tint(p.rects, 'rgba(100, 220, 140, 0.16)', this.region?.kind === 'pod' && this.region.id === p.id, p.name);

    for (const p of this.problems) fillTiles(p.tiles, 'rgba(224, 60, 80, 0.35)', 'rgba(255, 110, 120, 0.95)');
    for (const c of this.clashes) fillTiles(c.tiles, 'rgba(241, 196, 83, 0.4)', 'rgba(255, 220, 120, 1)');

    // The spawn point.
    const sx = ox + (this.layout.spawn.x + 0.5) * s, sy = oy + (this.layout.spawn.y + 0.5) * s;
    ctx.strokeStyle = 'rgba(255, 240, 150, 0.95)';
    ctx.lineWidth = 2 * line;
    ctx.setLineDash([s / 6, s / 8]);
    ctx.lineDashOffset = -(now / 60) % s;
    ctx.beginPath();
    ctx.arc(sx, sy, s * 0.36, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    const outline = (tiles: tools.Tile[], color: string, fill?: string) => {
      const xs = tiles.map((t) => t[0]), ys = tiles.map((t) => t[1]);
      const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fillRect(ox + x0 * s, oy + y0 * s, (x1 - x0 + 1) * s, (y1 - y0 + 1) * s);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 2 * line;
      ctx.strokeRect(ox + x0 * s + line, oy + y0 * s + line, (x1 - x0 + 1) * s - 2 * line, (y1 - y0 + 1) * s - 2 * line);
    };

    const good = ['rgba(120, 230, 150, 1)', 'rgba(80, 200, 120, 0.3)'] as const;
    const badc = ['rgba(255, 110, 120, 1)', 'rgba(224, 60, 80, 0.3)'] as const;
    /** A box in map tiles, for items that sit between tile lines. */
    const box = (x: number, y: number, w: number, d: number, ok: boolean) => {
      const [stroke, fill] = ok ? good : badc;
      ctx.fillStyle = fill;
      ctx.fillRect(ox + x * s, oy + y * s, w * s, d * s);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2 * line;
      ctx.strokeRect(ox + x * s, oy + y * s, w * s, d * s);
    };
    /** A short reason beside the pointer. */
    const hint = (text: string, x: number, y: number, line: number) => {
      const px = 13 * line;
      ctx.font = `600 ${px}px system-ui, sans-serif`;
      const w = ctx.measureText(text).width + 12 * line;
      ctx.fillStyle = 'rgba(20, 22, 40, 0.88)';
      ctx.fillRect(x + 12 * line, y - px - 6 * line, w, px + 8 * line);
      ctx.fillStyle = '#ffb3bb';
      ctx.fillText(text, x + 18 * line, y - 6 * line);
    };
    const attachedItem = this.tool === 'place' ? currentCatalog().get(this.brush.kind) : undefined;
    if (attachedItem && this.point && !this.drag?.moved) {
      const [wx, wy] = this.point;
      if (attachedItem.kind === 'deskitem') {
        const [iw, id] = this.footprint(attachedItem.footprint);
        const r = tools.placeDeskItem(this.layout, this.brush.kind, wx, wy, this.rot, currentCatalog());
        box(wx - iw / 2, wy - id / 2, iw, id, r.ok);
        if (!r.ok) hint(r.error, ox + wx * s, oy + wy * s, line);
      } else if (attachedItem.kind === 'wall') {
        const sp = this.wallSpot(wx, wy);
        const r = tools.placeWallDecor(this.layout, this.brush.kind, sp.tx, sp.ty, sp.face, currentCatalog());
        const edge = sp.face === 'n' ? [0, 0, 1, 0.2] : sp.face === 's' ? [0, 0.8, 1, 0.2] : sp.face === 'w' ? [0, 0, 0.2, 1] : [0.8, 0, 0.2, 1];
        if (sp.face) box(sp.tx + edge[0], sp.ty + edge[1], edge[2], edge[3], r.ok);
        else outline([[sp.tx, sp.ty]], badc[0], badc[1]);
        if (!r.ok) hint(r.error, ox + wx * s, oy + wy * s, line);
      }
    }
    const dragged = this.drag?.attached && this.drag.moved ? this.layout.objects.find((q) => q.id === this.drag!.id) : undefined;
    if (dragged && this.point) {
      const item = currentCatalog().get(dragged.kind);
      if (item && this.drag!.attached === 'deskitem') {
        const [iw, id] = rotFootprint(item.footprint, dragged.rot);
        box(this.point[0] - iw / 2, this.point[1] - id / 2, iw, id, !this.drag!.why);
      } else if (item) {
        const sp = this.wallSpot(this.point[0], this.point[1]);
        outline([[sp.tx, sp.ty]], this.drag!.why ? badc[0] : good[0], this.drag!.why ? badc[1] : good[1]);
      }
      if (this.drag!.why) hint(this.drag!.why, ox + this.point[0] * s, oy + this.point[1] * s, line);
    }

    const sel = this.layout.objects.find((o) => o.id === this.selected);
    if (sel && !this.drag?.moved) {
      const k = currentCatalog().get(sel.kind)?.kind;
      if (k === 'floor') outline(tools.coverOf(sel, currentCatalog()), 'rgba(241, 196, 83, 1)', 'rgba(241, 196, 83, 0.15)');
      else if (k === 'floorart') outline(tools.artTiles(sel, currentCatalog()), 'rgba(241, 196, 83, 1)', 'rgba(241, 196, 83, 0.15)');
      else if (k === 'wall') outline([[sel.x, sel.y]], 'rgba(241, 196, 83, 1)', 'rgba(241, 196, 83, 0.15)');
      else {
        const piece = compileWorld(this.layout, currentCatalog()).deskItems.find((i) => i.obj.id === sel.id);
        if (piece) {
          ctx.strokeStyle = 'rgba(241, 196, 83, 1)';
          ctx.lineWidth = 2 * line;
          ctx.strokeRect(ox + piece.x * s, oy + piece.y * s, piece.w * s, piece.d * s);
        }
      }
    }

    if (this.drag?.moved) {
      const o = this.layout.objects.find((q) => q.id === this.drag!.id);
      if (o) {
        const at = tools.coverOf({ ...o, x: this.drag.x, y: this.drag.y }, currentCatalog());
        outline(at, this.drag.why ? 'rgba(255, 110, 120, 1)' : 'rgba(120, 230, 150, 1)', this.drag.why ? 'rgba(224, 60, 80, 0.3)' : 'rgba(80, 200, 120, 0.3)');
      }
    } else if (this.tool === 'place' && this.hover) {
      const item = currentCatalog().get(this.brush.kind);
      if (item) {
        const [fw, fd] = this.footprint(item.footprint);
        const x = this.hover[0] - Math.floor((fw - 1) / 2), y = this.hover[1] - Math.floor((fd - 1) / 2);
        const bad = tools.whyNotFit(this.layout, this.brush.kind, x, y, this.rot, undefined, currentCatalog());
        const tiles: tools.Tile[] = [];
        for (let ty = y; ty < y + fd; ty++) for (let tx = x; tx < x + fw; tx++) tiles.push([tx, ty]);
        outline(tiles, bad ? 'rgba(255, 110, 120, 1)' : 'rgba(120, 230, 150, 1)', bad ? 'rgba(224, 60, 80, 0.3)' : 'rgba(80, 200, 120, 0.3)');
      }
    } else if (this.tool === 'prefab' && this.hover) {
      const p = prefabById(this.brush.prefab);
      if (p) {
        const x = this.hover[0] - Math.floor(p.size[0] / 2), y = this.hover[1] - Math.floor(p.size[1] / 2);
        const bad = tools.whyNotPrefab(this.layout, p.id, x, y);
        const tiles: tools.Tile[] = [];
        for (let ty = y; ty < y + p.size[1]; ty++) for (let tx = x; tx < x + p.size[0]; tx++) tiles.push([tx, ty]);
        outline(tiles, bad ? 'rgba(255, 110, 120, 1)' : 'rgba(120, 230, 150, 1)', bad ? 'rgba(224, 60, 80, 0.25)' : 'rgba(80, 200, 120, 0.25)');
      }
    } else if (this.hover && (this.tool === 'region' || this.tool === 'floor' || this.tool === 'wall' || this.tool === 'erase' || this.tool === 'spawn')) {
      outline([this.hover], 'rgba(255, 255, 255, 0.9)');
    }
    ctx.restore();
  }
}
