import {
  INK_BATCH_MS, INK_MAX_POINTS, INK_PALETTE, contentBox, fromPicture, thin, toPicture, type Box,
} from '../shared/ink';
import { InkStore, penPaused, type Stroke } from './inkModel';

/** What the layer sends for the stroke being drawn. */
export interface InkOut {
  t: 'ink';
  shareId: string;
  strokeId: number;
  seq: number;
  pts: number[];
  end?: true;
  keep?: true;
}

/** The share the layer sits on, with the picture's size from the share (used until the first frame). */
export interface InkTarget {
  shareId: string;
  w: number;
  h: number;
}

const TAG_MS = 1500;

/** Dark ink colors get a light outline and light ones a dark one, so every color reads on any screen content. */
const isLight = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 110;
};

/**
 * The pen on a shared screen: a canvas laid exactly over the picture inside the stage frame. It draws everyone's strokes
 * (from the shared `InkStore`) and turns your own pointer into strokes. Ink points are 0–10000 across the picture, so
 * it lands on the same spot whatever the window size.
 */
export class InkLayer {
  /** Called with each batch of your points to send to the server. */
  onSend: (msg: InkOut) => void = () => {};
  /** Called when the pen turns itself off (Esc or a change of share). */
  onPenChange: (on: boolean) => void = () => {};
  nameOf: (id: string) => string = (id) => id;

  private canvas = document.createElement('canvas');
  private note = document.createElement('div');
  private tags = new Map<string, HTMLElement>();
  private target: InkTarget | null = null;
  private box: Box = { x: 0, y: 0, w: 0, h: 0 };
  private pen = false;
  private keep = false;
  private pausedUntil = 0;
  private raf = 0;
  private lastStale = 0;
  private resizer: ResizeObserver | undefined;

  // The stroke being drawn.
  private drawing = false;
  /** The one pointer that is drawing; a second finger or another pen is ignored until it lifts. */
  private pointerId: number | null = null;
  private localId = 0;
  private localSeq = 0;
  private netId = 0;
  private netSeq = 0;
  private netStale = false;
  /** Stroke ids for the pieces that follow a pause; far above the ones counted by `localId`. */
  private extraNet = 1_000_000;
  private lastPointer: [number, number] | null = null;
  private queue: number[] = [];
  private batchTimer = 0;
  private lastPt: [number, number] | null = null;

  constructor(
    private frame: HTMLElement,
    private video: HTMLVideoElement,
    private store: InkStore,
    private selfId: () => string,
    private colorOf: (id: string) => number,
  ) {
    this.canvas.className = 'inkCanvas';
    this.note.className = 'inkNote';
    this.note.hidden = true;
    this.frame.append(this.canvas, this.note);
    this.canvas.addEventListener('pointerdown', (e) => this.down(e));
    this.canvas.addEventListener('pointermove', (e) => this.move(e));
    this.canvas.addEventListener('pointerup', (e) => this.up(e));
    this.canvas.addEventListener('pointercancel', (e) => this.up(e));
    if (typeof ResizeObserver !== 'undefined') {
      this.resizer = new ResizeObserver(() => this.fit());
      this.resizer.observe(this.frame);
    }
    this.video.addEventListener('loadedmetadata', () => this.fit());
    this.video.addEventListener('resize', () => this.fit());
    window.addEventListener('resize', () => this.fit());
    this.setPen(false);
  }

  get penOn() {
    return this.pen;
  }

  /** Points the layer at a share. A different share turns the pen off and shows only that share's ink. */
  setShare(target: InkTarget | null) {
    const changed = this.target?.shareId !== target?.shareId;
    this.target = target;
    if (changed) {
      this.endStroke();
      if (this.pen) this.setPen(false, true);
      this.hideTags();
    }
    this.fit();
    this.wake();
  }

  setPen(on: boolean, notify = false) {
    if (!on) this.endStroke();
    this.pen = on && !!this.target;
    this.canvas.classList.toggle('pen', this.pen);
    if (notify) this.onPenChange(this.pen);
  }

  setKeep(on: boolean) {
    this.keep = on;
  }

  /** The server said slow down: keep drawing locally, but send nothing for a moment. */
  pause(ms: number) {
    this.pausedUntil = performance.now() + ms;
    this.netStale = true;
    this.note.hidden = false;
    this.note.textContent = 'Slow down';
    this.placeNote();
    setTimeout(() => {
      if (!penPaused(performance.now(), this.pausedUntil)) this.note.hidden = true;
    }, ms + 50);
  }

  /** Starts the render loop if there is anything to draw. It stops itself when the ink has gone. */
  wake() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => this.frameTick());
  }

  destroy() {
    this.resizer?.disconnect();
    cancelAnimationFrame(this.raf);
    clearInterval(this.batchTimer);
  }

  // ------------------------------------------------------------------ size

  /** Lays the canvas exactly over the picture, which `object-fit: contain` letterboxes inside the frame. */
  private fit() {
    const w = this.frame.clientWidth;
    const h = this.frame.clientHeight;
    const vw = this.video.videoWidth || this.target?.w || 0;
    const vh = this.video.videoHeight || this.target?.h || 0;
    this.box = contentBox(w, h, vw, vh);
    const dpr = window.devicePixelRatio || 1;
    const c = this.canvas;
    c.style.left = `${this.box.x}px`;
    c.style.top = `${this.box.y}px`;
    c.style.width = `${this.box.w}px`;
    c.style.height = `${this.box.h}px`;
    const cw = Math.max(1, Math.round(this.box.w * dpr));
    const ch = Math.max(1, Math.round(this.box.h * dpr));
    if (c.width !== cw || c.height !== ch) {
      c.width = cw;
      c.height = ch;
    }
    this.wake();
  }

  // ------------------------------------------------------------------ your pointer

  private local(e: PointerEvent): [number, number] | null {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return toPicture({ x: 0, y: 0, w: r.width, h: r.height }, e.clientX - r.left, e.clientY - r.top);
  }

  private down(e: PointerEvent) {
    if (!this.pen || !this.target || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (this.pointerId !== null) return; // one pointer at a time
    e.preventDefault();
    this.pointerId = e.pointerId;
    try {
      this.canvas.setPointerCapture?.(e.pointerId);
    } catch {
      // a pointer the browser does not know (a synthetic one) cannot be captured; drawing still works
    }
    this.endStroke();
    this.drawing = true;
    this.localId++;
    this.localSeq = 0;
    this.netId = this.localId;
    this.netSeq = 0;
    this.netStale = false;
    this.queue = [];
    const p = this.local(e);
    if (p) this.addPoints(p);
    clearInterval(this.batchTimer);
    this.batchTimer = window.setInterval(() => this.flush(false), INK_BATCH_MS);
    this.wake();
  }

  private move(e: PointerEvent) {
    if (!this.drawing || e.pointerId !== this.pointerId) return;
    const events = e.getCoalescedEvents?.();
    const pts: [number, number][] = [];
    for (const ev of events?.length ? events : [e]) {
      const p = this.local(ev);
      if (p) pts.push(p);
    }
    if (pts.length) this.addPoints(...pts);
    this.lastPointer = [e.clientX, e.clientY];
    this.wake();
  }

  private up(e: PointerEvent) {
    if (e.pointerId !== this.pointerId) return;
    this.endStroke();
  }

  /** Your points go on screen at once and into the queue for the next batch. */
  private addPoints(...pts: [number, number][]) {
    const target = this.target;
    if (!target) return;
    const flat = pts.flat();
    this.lastPt = pts[pts.length - 1];
    this.store.add(
      { from: this.selfId(), shareId: target.shareId, strokeId: this.localId, seq: ++this.localSeq, pts: flat, keep: this.keep ? true : undefined },
      this.colorOf(this.selfId()), performance.now(),
    );
    if (!penPaused(performance.now(), this.pausedUntil)) this.queue.push(...flat);
    else this.netStale = true;
  }

  /** Sends what is queued, in messages of at most INK_MAX_POINTS points. `end` marks the last one. */
  private flush(end: boolean) {
    const target = this.target;
    if (!target) return;
    if (penPaused(performance.now(), this.pausedUntil)) {
      this.queue = [];
      return;
    }
    if (this.netStale) {
      // The server asked us to slow down: carry on as a new stroke so nobody waits for the old one's end.
      this.netId = this.extraNet++;
      this.netSeq = 0;
      this.netStale = false;
    }
    let pts = thin(this.queue);
    this.queue = [];
    if (!pts.length) {
      if (!end || !this.lastPt) return;
      pts = [...this.lastPt]; // the end of a stroke needs a point to travel with
    }
    for (let i = 0; i < pts.length; i += 2 * INK_MAX_POINTS) {
      const chunk = pts.slice(i, i + 2 * INK_MAX_POINTS);
      const last = i + 2 * INK_MAX_POINTS >= pts.length;
      this.onSend({
        t: 'ink', shareId: target.shareId, strokeId: this.netId, seq: this.netSeq++, pts: chunk,
        ...(end && last ? { end: true as const } : {}),
        ...(this.keep ? { keep: true as const } : {}),
      });
    }
  }

  private endStroke() {
    if (!this.drawing) return;
    this.drawing = false;
    this.pointerId = null;
    clearInterval(this.batchTimer);
    this.flush(true);
    const target = this.target;
    if (target) {
      this.store.add({ from: this.selfId(), shareId: target.shareId, strokeId: this.localId, seq: ++this.localSeq, pts: [], end: true }, 0, performance.now());
    }
    this.lastPt = null;
    this.wake();
  }

  // ------------------------------------------------------------------ drawing

  private frameTick() {
    this.raf = 0;
    const now = performance.now();
    if (now - this.lastStale > 1000) {
      this.store.endStale(now);
      this.lastStale = now;
    }
    const live = this.paint(now);
    if (live || this.drawing) this.raf = requestAnimationFrame(() => this.frameTick());
  }

  /** Paints everyone's ink on the share. Returns true while anything is still on screen. */
  private paint(now: number): boolean {
    const c = this.canvas;
    const g = c.getContext('2d');
    if (!g) return false;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    const target = this.target;
    if (!target || this.box.w <= 0) {
      this.hideTags();
      return false;
    }
    const visible = this.store.visible(target.shareId, now);
    const dpr = c.width / Math.max(1, this.box.w);
    g.scale(dpr, dpr);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const width = Math.max(2.5, (4 * this.box.h) / 1080);
    for (const { stroke, alpha } of visible) {
      if (alpha <= 0 || !stroke.pts.length) continue;
      const color = INK_PALETTE[stroke.color % INK_PALETTE.length];
      g.globalAlpha = alpha;
      g.strokeStyle = isLight(color) ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.7)';
      g.lineWidth = width + 2;
      this.trace(g, stroke);
      g.stroke();
      g.strokeStyle = color;
      g.lineWidth = width;
      this.trace(g, stroke);
      g.stroke();
    }
    g.globalAlpha = 1;
    const tagged = this.placeTags(visible.map((v) => v.stroke), now);
    // Kept lines that are finished need no more frames; everything else is still drawing, holding or fading.
    return tagged || visible.some((v) => !v.stroke.keep || v.stroke.endedAt === null);
  }

  /** A smooth path through the points: quadratic curves between midpoints. */
  private trace(g: CanvasRenderingContext2D, s: Stroke) {
    const pt = (i: number): [number, number] => {
      const [x, y] = fromPicture({ x: 0, y: 0, w: this.box.w, h: this.box.h }, s.pts[i], s.pts[i + 1]);
      return [x, y];
    };
    g.beginPath();
    const n = s.pts.length / 2;
    const [x0, y0] = pt(0);
    g.moveTo(x0, y0);
    if (n === 1) {
      g.lineTo(x0 + 0.01, y0); // a click leaves a dot
      return;
    }
    for (let i = 1; i < n - 1; i++) {
      const [x, y] = pt(2 * i);
      const [nx, ny] = pt(2 * (i + 1));
      g.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
    }
    const [lx, ly] = pt(2 * (n - 1));
    g.lineTo(lx, ly);
  }

  // ------------------------------------------------------------------ name tags and notes

  /** A name tag follows the pen tip of each other drawer, and goes shortly after they stop. */
  private placeTags(strokes: Stroke[], now: number): boolean {
    const latest = new Map<string, Stroke>();
    for (const s of strokes) {
      if (s.from === this.selfId() || !s.pts.length) continue;
      const cur = latest.get(s.from);
      if (!cur || s.lastAt > cur.lastAt) latest.set(s.from, s);
    }
    let shown = false;
    for (const [id, s] of latest) {
      if (now - s.lastAt > TAG_MS) continue;
      shown = true;
      let el = this.tags.get(id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'inkTag';
        this.frame.append(el);
        this.tags.set(id, el);
      }
      const color = INK_PALETTE[s.color % INK_PALETTE.length];
      el.textContent = this.nameOf(id);
      el.style.background = color;
      el.style.color = isLight(color) ? '#111' : '#fff';
      const [x, y] = fromPicture(this.box, s.pts[s.pts.length - 2], s.pts[s.pts.length - 1]);
      el.style.transform = `translate(${Math.round(x + 10)}px, ${Math.round(y + 8)}px)`;
      el.hidden = false;
    }
    for (const [id, el] of this.tags) {
      const s = latest.get(id);
      if (!s || now - s.lastAt > TAG_MS) el.hidden = true;
    }
    return shown;
  }

  private hideTags() {
    this.tags.forEach((el) => (el.hidden = true));
  }

  private placeNote() {
    const p = this.lastPointer;
    const r = this.frame.getBoundingClientRect();
    const x = p ? p[0] - r.left : r.width / 2;
    const y = p ? p[1] - r.top : r.height / 2;
    this.note.style.transform = `translate(${Math.round(x + 12)}px, ${Math.round(y + 12)}px)`;
  }
}
