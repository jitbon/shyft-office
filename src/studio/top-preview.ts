// The studio's top-down preview: the picture the office will draw for this design (the very same painter), enlarged on a
// grid with the footprint outlined. Also the maths to turn a click on it into a place on the item, and a part that is there.
import { catalogFromDefinition } from '../../shared/catalog';
import type { ItemDefinition } from '../../shared/items';
import { paintItemTop } from '../item2d';
import type { Design } from './model';

const MARGIN = 16;
const MAX_SIDE = 320;

export interface TopLayout {
  /** Pixels per tile on this canvas. */
  tilePx: number;
  /** Pixels the tallest part rises above the footprint on this canvas. */
  liftPx: number;
  width: number;
  height: number;
  /** Top-left of the footprint on the canvas. */
  ox: number;
  oy: number;
}

const heightOf = (d: Design) => d.parts.reduce((m, p) => Math.max(m, p.z + p.h), 0);

export function topLayout(d: Pick<Design, 'footprint' | 'parts'>): TopLayout {
  const [fw, fd] = d.footprint;
  const tilePx = Math.max(24, Math.min(128, Math.floor(MAX_SIDE / Math.max(fw, fd, 0.25))));
  const liftPx = Math.ceil(heightOf(d as Design) * tilePx * 0.5);
  return { tilePx, liftPx, width: Math.ceil(fw * tilePx) + 2 * MARGIN, height: Math.ceil(fd * tilePx) + liftPx + 2 * MARGIN, ox: MARGIN, oy: MARGIN + liftPx };
}

/** A click at canvas pixel (px, py) as a place on the footprint, in tiles (not clamped). */
export const pointToTile = (l: TopLayout, px: number, py: number): [number, number] => [(px - l.ox) / l.tilePx, (py - l.oy) / l.tilePx];

/** The part under a place on the footprint, the one drawn last (on top) first; null when none. */
export function partAt(d: Pick<Design, 'parts'>, tx: number, ty: number): number | null {
  for (let i = d.parts.length - 1; i >= 0; i--) {
    const p = d.parts[i];
    if (tx >= p.x && tx <= p.x + p.w && ty >= p.y && ty <= p.y + p.d) return i;
  }
  return null;
}

/** Paints the preview onto a canvas the size of `topLayout(d)`. */
export function drawTopPreview(ctx: CanvasRenderingContext2D, d: Design, selected: number | null) {
  const l = topLayout(d);
  const [fw, fd] = d.footprint;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = '#2b2f45';
  ctx.fillRect(l.ox, l.oy, fw * l.tilePx, fd * l.tilePx);
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1;
  const stepTiles = fw <= 1 && fd <= 1 ? 0.25 : 1;
  ctx.beginPath();
  for (let x = 0; x <= fw + 1e-6; x += stepTiles) { ctx.moveTo(l.ox + x * l.tilePx + 0.5, l.oy); ctx.lineTo(l.ox + x * l.tilePx + 0.5, l.oy + fd * l.tilePx); }
  for (let y = 0; y <= fd + 1e-6; y += stepTiles) { ctx.moveTo(l.ox, l.oy + y * l.tilePx + 0.5); ctx.lineTo(l.ox + fw * l.tilePx, l.oy + y * l.tilePx + 0.5); }
  ctx.stroke();
  if (d.parts.length) {
    const item = catalogFromDefinition(d as ItemDefinition, { id: 'item:preview', by: 'You', version: 0 });
    const pic = paintItemTop(item, 0);
    const tmp = Object.assign(document.createElement('canvas'), { width: pic.w, height: pic.h });
    tmp.getContext('2d')!.putImageData(new ImageData(pic.rgba, pic.w, pic.h), 0, 0);
    const s = l.tilePx / 32;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, l.ox - pic.pad * s, l.oy - (pic.lift + pic.pad) * s, pic.w * s, pic.h * s);
  }
  ctx.strokeStyle = '#8fa3ff';
  ctx.lineWidth = 2;
  ctx.strokeRect(l.ox, l.oy, fw * l.tilePx, fd * l.tilePx);
  const p = selected === null ? undefined : d.parts[selected];
  if (p) {
    ctx.strokeStyle = '#f1c453';
    ctx.lineWidth = 2;
    ctx.strokeRect(l.ox + p.x * l.tilePx, l.oy + p.y * l.tilePx, p.w * l.tilePx, p.d * l.tilePx);
  }
}
