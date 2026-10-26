import { FURNITURE, WALLS, areaAt, getWorld, type World } from '../shared/map';
import type { WorldObject } from '../shared/world';
import { frameAt, viewCanvas } from './custom-objects';
import { drawablesOf, isPictured, tileSignatures, type Drawable } from './drawables';
import { flatPicture, itemPicture } from './item2d';
import { TILE, drawFloor, drawFurniture2D, drawTurned2D, drawWall2D, drawWelcomeMat, makeCanvas, type Dir } from './art';
import { outlineEdges } from '../shared/desk-presence';
import { hopHeight } from '../shared/jump';
import type { DeskTag } from './office-ui';
import { statusColor, walkFrame, type Player } from './types';

export const UI_FONT = '"Nunito", system-ui, sans-serif';

export function dirFromAngle(a: number): Dir {
  const c = Math.cos(a), s = Math.sin(a);
  if (Math.abs(c) > Math.abs(s)) return c > 0 ? 'right' : 'left';
  return s > 0 ? 'down' : 'up';
}

/** The same desk space: equal tile lists (the two lists may be different arrays of one desk). */
const sameTiles = (a: readonly { x: number; y: number }[], b: readonly { x: number; y: number }[]) =>
  a.length === b.length && a.every((t, i) => t.x === b[i].x && t.y === b[i].y);

const gridAt = (w: World, x: number, y: number) => (x < 0 || y < 0 || x >= w.w || y >= w.h ? '#' : w.grid[y][x]);

/** Which placed object stands on each tile, for the objects that face a way. Built once per world. */
const facingCache = new WeakMap<World, Map<number, WorldObject>>();
function facingAt(w: World, x: number, y: number): WorldObject | undefined {
  let m = facingCache.get(w);
  if (!m) {
    m = new Map();
    for (const o of w.objects) {
      if (!o.item.facing || o.item.custom) continue;
      for (let ty = o.y; ty < o.y + o.d; ty++) for (let tx = o.x; tx < o.x + o.w; tx++) m.set(ty * w.w + tx, o);
    }
    facingCache.set(w, m);
  }
  return m.get(y * w.w + x);
}

/** The custom objects in a world. They are drawn every frame (they may animate), not into the map. */
const customCache = new WeakMap<World, WorldObject[]>();
const customIn = (w: World) => {
  let list = customCache.get(w);
  if (!list) customCache.set(w, (list = w.objects.filter((o) => o.item.custom)));
  return list;
};

/** Paints one tile's floor and what stands on it (the whole map is this, tile by tile). `drawn` stops a turned piece being painted once per tile. */
function paintTile(ctx: CanvasRenderingContext2D, w: World, x: number, y: number, pass: 'floor' | 'top', drawn: Set<string>) {
  const t = gridAt(w, x, y);
  if (pass === 'floor') {
    drawFloor(ctx, w.floor[y][x], x * TILE, y * TILE, x, y);
    if (t === 'S') drawWelcomeMat(ctx, x * TILE, y * TILE);
    // Floor art lies on the floor, in list order, so the later piece is on top.
    for (const a of w.floorArt) {
      if (x >= a.x && y >= a.y && x < a.x + a.w && y < a.y + a.d) {
        ctx.drawImage(flatPicture(a.item, a.rot), (x - a.x) * TILE, (y - a.y) * TILE, TILE, TILE, x * TILE, y * TILE, TILE, TILE);
      }
    }
    return;
  }
  if (WALLS.has(t)) {
    drawWall2D(ctx, t, x * TILE, y * TILE, !WALLS.has(gridAt(w, x, y + 1)), y > 0 && !WALLS.has(gridAt(w, x, y - 1)));
  } else if (FURNITURE.has(t)) {
    const o = facingAt(w, x, y);
    const nb = (dx: number, dy: number) => gridAt(w, x + dx, y + dy);
    const rot = o?.obj.rot;
    if (o && (rot === 1 || rot === 3 || (rot !== 0 && t === 's'))) {
      // Turned west or east (or a turned sofa): the whole piece is drawn once, facing south, and turned.
      if (!drawn.has(o.obj.id)) {
        drawn.add(o.obj.id);
        drawTurned2D(ctx, t, o.obj.rot, o.x * TILE, o.y * TILE, o.w, o.d);
      }
    } else drawFurniture2D(ctx, t, x * TILE, y * TILE, nb, rot);
  }
}

/** Wall decor on a face other than the south one is a thin strip along that edge of the wall tile. */
const STRIP = 6;

/** Draws one picture-made thing: a floor item, a desk item or wall decor. */
function paintDrawable(ctx: CanvasRenderingContext2D, d: Drawable) {
  const { canvas, pad } = itemPicture(d.item, d.rot);
  const lifted = d.base * TILE * 0.5; // a desk's top, or how high a poster hangs
  if (d.kind === 'wall' && d.face && d.face !== 's') {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    const cx = (d.x + 0.5) * TILE, cy = (d.y + 0.5) * TILE, len = Math.min(TILE, d.w * TILE);
    if (d.face === 'n') ctx.drawImage(canvas, cx - len / 2, d.y * TILE, len, STRIP);
    else if (d.face === 'e') ctx.drawImage(canvas, (d.x + 1) * TILE - STRIP, cy - len / 2, STRIP, len);
    else ctx.drawImage(canvas, d.x * TILE, cy - len / 2, STRIP, len);
    ctx.restore();
    return;
  }
  const left = d.kind === 'wall' ? (d.x + 0.5) * TILE - (d.w * TILE) / 2 : d.x * TILE;
  const bottom = d.kind === 'wall' ? (d.y + 1) * TILE - lifted : (d.y + d.d) * TILE - lifted;
  // The picture's footprint ends `pad` pixels above its bottom edge, so that edge goes at `bottom + pad`.
  ctx.drawImage(canvas, Math.round(left - pad), Math.round(bottom + pad - canvas.height));
}

/** Paints the picture-made things, back to front. With `only`, just those touching one of those tiles. */
function paintDrawables(ctx: CanvasRenderingContext2D, w: World, only?: Set<number>) {
  for (const d of drawablesOf(w)) {
    if (d.kind === 'floorart' || !isPictured(d.item)) continue;
    if (only) {
      let touches = false;
      for (let y = Math.max(0, d.y0); y <= Math.min(w.h - 1, d.y1) && !touches; y++) {
        for (let x = Math.max(0, d.x0); x <= Math.min(w.w - 1, d.x1); x++) if (only.has(y * w.w + x)) { touches = true; break; }
      }
      if (!touches) continue;
    }
    paintDrawable(ctx, d);
  }
}

/** Pre-renders the static office (floors, walls, furniture) once. */
export function buildMapCanvas(w: World = getWorld()): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(w.w * TILE, w.h * TILE);
  const drawn = new Set<string>();
  for (const pass of ['floor', 'top'] as const) {
    for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) paintTile(ctx, w, x, y, pass, drawn);
  }
  paintDrawables(ctx, w);
  return c;
}

/**
 * Brings a map canvas painted from `prev` up to date with `next`, repainting only the tiles that changed and their
 * neighbours (painters look at the tiles around them). Returns false when the size changed and a full rebuild is needed.
 */
export function updateMapCanvas(c: HTMLCanvasElement, prev: World, next: World): boolean {
  if (prev.w !== next.w || prev.h !== next.h) return false;
  const changed = new Set<number>();
  const before = tileSignatures(prev), after = tileSignatures(next);
  for (let y = 0; y < next.h; y++) {
    for (let x = 0; x < next.w; x++) {
      // A chair or desk turned on the spot leaves the same tile code but looks different; so does a picture that moved.
      if (prev.grid[y][x] !== next.grid[y][x] || prev.floor[y][x] !== next.floor[y][x]
        || facingAt(prev, x, y)?.obj.rot !== facingAt(next, x, y)?.obj.rot
        || before[y * next.w + x] !== after[y * next.w + x]) changed.add(y * next.w + x);
    }
  }
  if (!changed.size) return true;
  const grow = (set: Set<number>) => {
    const out = new Set<number>();
    for (const k of set) {
      const x = k % next.w, y = (k - x) / next.w;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (x + dx >= 0 && y + dy >= 0 && x + dx < next.w && y + dy < next.h) out.add((y + dy) * next.w + x + dx);
        }
      }
    }
    return out;
  };
  const clip = grow(changed);   // repainted
  const draw = grow(clip);      // painted again around it, so a neighbour's overhang is not lost
  const ctx = c.getContext('2d')!;
  ctx.save();
  ctx.beginPath();
  for (const k of clip) ctx.rect((k % next.w) * TILE, Math.floor(k / next.w) * TILE, TILE, TILE);
  ctx.clip();
  for (const k of clip) ctx.clearRect((k % next.w) * TILE, Math.floor(k / next.w) * TILE, TILE, TILE);
  const order = [...draw].sort((a, b) => a - b);
  const drawn = new Set<string>();
  for (const pass of ['floor', 'top'] as const) {
    for (const k of order) paintTile(ctx, next, k % next.w, Math.floor(k / next.w), pass, drawn);
  }
  paintDrawables(ctx, next, draw);
  ctx.restore();
  return true;
}

/** Draws a rounded rectangle, or a plain one on a browser without `roundRect`. */
function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

/**
 * Draws a name tag as a pill and returns its top edge. `size` is the old label size: the text is drawn at
 * about three quarters of it but never below 14 CSS px, which reads as large as the old pixel font did.
 * `dot` adds a small status circle before the name.
 */
export function drawNameTag(ctx: CanvasRenderingContext2D, text: string, cx: number, bottom: number, size = 18, dot?: string) {
  const px = Math.max(14, Math.round(size * 0.78));
  ctx.font = `700 ${px}px ${UI_FONT}`;
  const d = Math.round(px * 0.55);
  const dotW = dot ? d + 5 : 0;
  const h = px + 8;
  const w = Math.ceil(ctx.measureText(text).width) + 18 + dotW;
  const x = Math.round(cx - w / 2), y = Math.round(bottom - h);
  ctx.fillStyle = 'rgba(20, 22, 40, 0.82)';
  roundedRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  if (dot) {
    ctx.fillStyle = dot;
    ctx.beginPath();
    ctx.arc(x + 9 + d / 2, y + h / 2, d / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx + dotW / 2, y + h / 2 + 1);
  return y;
}

export function drawBubble(ctx: CanvasRenderingContext2D, text: string, cx: number, bottom: number) {
  ctx.font = `600 15px ${UI_FONT}`;
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > 200 && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  const shown = lines.slice(0, 4);
  if (lines.length > 4) shown[3] += '…';

  const lh = 19;
  const w = Math.ceil(Math.max(...shown.map((l) => ctx.measureText(l).width))) + 20;
  const h = shown.length * lh + 12;
  const x = Math.round(cx - w / 2), y = Math.round(bottom - h - 9);
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = '#fff';
  roundedRect(ctx, x, y, w, h, 12);
  ctx.fill();
  ctx.beginPath(); // the little tail pointing at the speaker
  ctx.moveTo(cx - 6, y + h - 1);
  ctx.lineTo(cx + 6, y + h - 1);
  ctx.lineTo(cx, y + h + 7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#1a1c2c';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  shown.forEach((l, i) => ctx.fillText(l, cx, y + 6 + i * lh));
}

/** What the builder draws over the map, in device pixels: `ox`/`oy` is the map's corner, `s` the tile size. */
export interface MapView {
  ox: number;
  oy: number;
  s: number;
  k: number;
  dpr: number;
}

export class Renderer2D {
  map = buildMapCanvas();
  /** The world the map canvas shows. */
  private built: World = getWorld();
  /** Drawn over the map and under the people; set while building. */
  overlay: ((ctx: CanvasRenderingContext2D, v: MapView, now: number) => void) | null = null;
  /** Looks at this point (in tiles) instead of following the player; used while building. */
  focus: { x: number; y: number } | null = null;
  /** Skip the spotlight on the room you stand in; used while building. */
  noSpotlight = false;
  /** Text for the room you are in ("Meeting Room A · 2 here"), drawn at its top edge. */
  areaLabel: string | null = null;
  /** Claimed desks to label and highlight. */
  deskTags: DeskTag[] = [];
  /** The desk space you are standing in, drawn with a strong fill and an edge; null when you are in none. */
  deskPresence: { tiles: readonly { x: number; y: number }[]; mine: boolean } | null = null;
  private view = { ox: 0, oy: 0, s: TILE, dpr: 1 };

  /** The desk space you are in: a strong fill over every tile and an edge along its outside (warm for your own, cool for another's). */
  private drawDeskSpace(ctx: CanvasRenderingContext2D, ox: number, oy: number, s: number, dpr: number, p: { tiles: readonly { x: number; y: number }[]; mine: boolean }) {
    ctx.fillStyle = p.mine ? 'rgba(241, 196, 83, 0.35)' : 'rgba(120, 170, 255, 0.3)';
    for (const t of p.tiles) ctx.fillRect(ox + t.x * s, oy + t.y * s, s, s);
    ctx.strokeStyle = p.mine ? 'rgba(241, 196, 83, 0.95)' : 'rgba(150, 190, 255, 0.95)';
    ctx.lineWidth = 3 * dpr;
    ctx.lineCap = 'square';
    ctx.beginPath();
    for (const e of outlineEdges(p.tiles)) {
      ctx.moveTo(ox + e.x1 * s, oy + e.y1 * s);
      ctx.lineTo(ox + e.x2 * s, oy + e.y2 * s);
    }
    ctx.stroke();
  }

  /** Custom objects: the top view of the sheet's current frame, turned the way the object faces. */
  private drawCustom(ctx: CanvasRenderingContext2D, ox: number, oy: number, s: number) {
    const clock = Date.now();
    for (const o of customIn(this.built)) {
      const id = o.item.id.slice('custom:'.length);
      const top = viewCanvas(id, 'top', frameAt(id, clock));
      if (!top) continue;
      const [fw, fd] = o.item.footprint;
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.translate(ox + (o.x + o.w / 2) * s, oy + (o.y + o.d / 2) * s);
      ctx.rotate((o.obj.rot * Math.PI) / 2);
      ctx.drawImage(top, (-fw * s) / 2, (-fd * s) / 2, fw * s, fd * s);
      ctx.restore();
    }
  }

  /** Shows `world` on the map, repainting only what changed since the last one. */
  setWorld(world: World) {
    if (world === this.built) return;
    if (!updateMapCanvas(this.map, this.built, world)) this.map = buildMapCanvas(world);
    this.built = world;
  }

  /** The world being shown. */
  get shown(): World {
    return this.built;
  }

  /** The map point under a point of the page (CSS pixels), in tiles with fractions. */
  pointUnder(px: number, py: number): { x: number; y: number } {
    const { ox, oy, s, dpr } = this.view;
    return { x: (px * dpr - ox) / s, y: (py * dpr - oy) / s };
  }

  /** The map tile under a point of the page (CSS pixels). */
  tileUnder(px: number, py: number): { x: number; y: number } {
    const { ox, oy, s, dpr } = this.view;
    return { x: Math.floor((px * dpr - ox) / s), y: Math.floor((py * dpr - oy) / s) };
  }

  /**
   * `w` and `h` are the canvas size in device pixels; `k` is the zoom in device pixels per art pixel and `dpr`
   * the device pixel ratio. The world is drawn in device pixels, text and labels in CSS pixels.
   */
  render(ctx: CanvasRenderingContext2D, w: number, h: number, k: number, dpr: number, me: Player, players: Player[], now: number) {
    const s = TILE * k;
    const mapW = this.built.w * s, mapH = this.built.h * s;
    const cx = this.focus?.x ?? me.x, cy = this.focus?.y ?? me.y;
    const camX = mapW <= w ? (mapW - w) / 2 : Math.min(Math.max(cx * s - w / 2, 0), mapW - w);
    const camY = mapH <= h ? (mapH - h) / 2 : Math.min(Math.max(cy * s - h / 2, 0), mapH - h);
    const ox = Math.round(-camX), oy = Math.round(-camY);

    ctx.fillStyle = '#14152a';
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.map, ox, oy, mapW, mapH);
    this.view = { ox, oy, s, dpr };
    this.drawCustom(ctx, ox, oy, s);
    this.overlay?.(ctx, { ox, oy, s, k, dpr }, now);

    // A soft glow on your own desk, so you can find it at a glance.
    const inside = this.deskPresence;
    ctx.fillStyle = 'rgba(241, 196, 83, 0.2)';
    for (const tag of this.deskTags) {
      // The space you are standing in gets the stronger fill below instead, so the two do not stack.
      if (tag.mine && !(inside && sameTiles(inside.tiles, tag.tiles))) for (const t of tag.tiles) ctx.fillRect(ox + t.x * s, oy + t.y * s, s, s);
    }
    if (inside) this.drawDeskSpace(ctx, ox, oy, s, dpr, inside);

    const sorted = [...players].sort((a, b) => a.y - b.y);
    const clock = Date.now();
    for (const p of sorted) {
      const fx = ox + p.x * s, fy = oy + p.y * s;
      // Mid-jump the body rises up the screen and its shadow on the floor shrinks.
      const lift = hopHeight(p.jumpAt, clock) * s;
      const shrink = 1 - lift / (s * 1.4);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.beginPath();
      ctx.ellipse(fx, fy, 10 * k * shrink, 4 * k * shrink, 0, 0, Math.PI * 2);
      ctx.fill();
      // A frame is TILE px square with the feet two art pixels below the position, centred.
      const img = p.avatar.frames[dirFromAngle(p.a)][walkFrame(p)];
      ctx.drawImage(img, Math.round(fx - (TILE / 2) * k), Math.round(fy - lift - (TILE - 2) * k), TILE * k, TILE * k);
    }

    // Spotlight the private room you're in, like a meeting with the door closed.
    const zone = this.noSpotlight ? null : areaAt(me.x, me.y);
    if (zone?.private) {
      ctx.fillStyle = 'rgba(10, 10, 30, 0.5)';
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      for (const [x0, y0, x1, y1] of zone.rects) ctx.rect(ox + (x1 + 1) * s, oy + y0 * s, -(x1 - x0 + 1) * s, (y1 - y0 + 1) * s);
      ctx.fill('evenodd');

      if (zone.highlight) {
        // A lit, marching outline so everyone inside can see where the room's walls of sound are.
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 240, 150, 0.95)';
        ctx.lineWidth = Math.max(2, 2 * k);
        ctx.setLineDash([k * 8, k * 6]);
        ctx.lineDashOffset = -(now / 40) % (k * 14);
        for (const [x0, y0, x1, y1] of zone.rects) {
          ctx.strokeRect(ox + x0 * s, oy + y0 * s, (x1 - x0 + 1) * s, (y1 - y0 + 1) * s);
        }
        ctx.restore();
      }
    }

    // Labels are laid out in CSS pixels, so they stay the same size at any pixel ratio.
    ctx.save();
    ctx.scale(dpr, dpr);
    if (zone?.private && this.areaLabel) {
      const [x0, y0, x1] = zone.rects[0];
      drawNameTag(ctx, this.areaLabel, (ox + ((x0 + x1 + 1) / 2) * s) / dpr, (oy + y0 * s) / dpr + 30, 22);
    }

    for (const tag of this.deskTags) {
      if (tag.show) drawNameTag(ctx, tag.text, (ox + tag.anchor.x * s) / dpr, (oy + (tag.anchor.y - 0.35) * s) / dpr, 16, tag.dot);
    }

    for (const p of sorted) {
      const fx = ox + p.x * s, fy = oy + p.y * s - hopHeight(p.jumpAt, clock) * s;
      const top = drawNameTag(ctx, p.name, fx / dpr, (fy - (TILE - 2) * k) / dpr - 2, 18, statusColor(p.status));
      if (p.bubble && p.bubble.until > now) drawBubble(ctx, p.bubble.text, fx / dpr, top);
    }
    ctx.restore();
  }
}
