// The top-down picture of an item, worked out from its parts so the two views can never disagree. It is drawn the way
// the rest of the 2D office is: seen from slightly in front, so each part shows its top (lifted up the page by half a
// pixel per pixel of height) and its front below it, shaded darker. Pure (no canvas) apart from the thin wrapper at the end.
import type { CatalogItem } from '../shared/catalog';
import { rotFootprint } from '../shared/layout';
import { materialFor } from './materials';
import { turn } from './mesh3d';
import { shade } from './raster';
import { abgr } from './pattern';
import { PALETTE } from './palette';

const PX = 32;
/** Pixels of picture added round the item for its outline. */
export const PAD = 1;

export interface ItemPicture {
  /** Width and height in pixels, including the padding. */
  w: number;
  h: number;
  /** RGBA bytes, row by row. */
  rgba: Uint8ClampedArray<ArrayBuffer>;
  /** Pixels the tallest part rises above the item's footprint. */
  lift: number;
  pad: number;
}

interface Placed {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
  mat: string;
}

/** Paints `item` turned `rot` quarter turns. The footprint sits at the bottom of the picture; the lift is above it. */
export function paintItemTop(item: CatalogItem, rot: 0 | 1 | 2 | 3): ItemPicture {
  const [fw, fd] = item.footprint;
  const [w, d] = rotFootprint(item.footprint, rot);
  const height = item.model.reduce((m, b) => Math.max(m, b.z + b.h), 0);
  const lift = Math.ceil(height * PX * 0.5);
  const W = Math.ceil(w * PX) + PAD * 2, H = Math.ceil(d * PX) + lift + PAD * 2;
  const rgba = new Uint8ClampedArray(new ArrayBuffer(W * H * 4));
  const out = new Uint32Array(rgba.buffer);

  const placed: Placed[] = item.model.map((b) => {
    const [ax, ay] = turn(b.x, b.y, fw, fd, rot);
    const [bx, by] = turn(b.x + b.w, b.y + b.d, fw, fd, rot);
    return {
      x0: Math.min(ax, bx), x1: Math.max(ax, bx), y0: Math.min(ay, by), y1: Math.max(ay, by),
      z0: b.z, z1: b.z + b.h, mat: typeof b.mat === 'string' ? b.mat : b.mat.top,
    };
  });
  // Low parts first, then back to front, so a taller part in front covers what is behind it.
  placed.sort((a, b) => a.z0 - b.z0 || a.y1 - b.y1 || a.x0 - b.x0);

  const put = (x: number, y: number, c: number) => {
    if (x >= 0 && y >= 0 && x < W && y < H) out[y * W + x] = c >>> 0;
  };
  for (const p of placed) {
    const tex = materialFor(p.mat) ?? materialFor('m:plain:b0b0b0')!;
    const left = Math.round(p.x0 * PX) + PAD, right = Math.round(p.x1 * PX) + PAD;
    const base = lift + PAD;
    const topY0 = Math.round(base + p.y0 * PX - p.z1 * PX * 0.5), topY1 = Math.round(base + p.y1 * PX - p.z1 * PX * 0.5);
    const frontY1 = Math.round(base + p.y1 * PX - p.z0 * PX * 0.5);
    const sample = (x: number, y: number) => tex.data[(((y % 32) + 32) % 32) * 32 + (((x - left) % 32) + 32) % 32];
    for (let y = topY0; y < topY1; y++) {
      for (let x = left; x < right; x++) put(x, y, y === topY0 ? shade(sample(x, y - topY0), 1.12) : sample(x, y - topY0));
    }
    for (let y = topY1; y < frontY1; y++) {
      for (let x = left; x < right; x++) put(x, y, shade(sample(x, y - topY1), 0.78));
    }
  }

  if (item.kind !== 'floorart') {
    // A one-pixel dark outline round whatever was drawn, as round the characters.
    const ink = abgr(PALETTE.ink);
    const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && out[y * W + x] >>> 24 !== 0;
    const edge: number[] = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) edge.push(y * W + x);
      }
    }
    for (const i of edge) out[i] = ink;
  }
  return { w: W, h: H, rgba, lift, pad: PAD };
}

/** A flat picture of floor art seen straight from above: the footprint and nothing else, no lift, no front, no outline. */
export function paintFlat(item: CatalogItem, rot: 0 | 1 | 2 | 3): { w: number; h: number; rgba: Uint8ClampedArray<ArrayBuffer> } {
  const [fw, fd] = item.footprint;
  const [w, d] = rotFootprint(item.footprint, rot);
  const W = Math.ceil(w * PX), H = Math.ceil(d * PX);
  const rgba = new Uint8ClampedArray(new ArrayBuffer(W * H * 4));
  const out = new Uint32Array(rgba.buffer);
  const parts = item.model
    .map((b) => {
      const [ax, ay] = turn(b.x, b.y, fw, fd, rot);
      const [bx, by] = turn(b.x + b.w, b.y + b.d, fw, fd, rot);
      return { x0: Math.min(ax, bx), x1: Math.max(ax, bx), y0: Math.min(ay, by), y1: Math.max(ay, by), z: b.z, mat: typeof b.mat === 'string' ? b.mat : b.mat.top };
    })
    .sort((a, b) => a.z - b.z);
  for (const p of parts) {
    const tex = materialFor(p.mat) ?? materialFor('m:plain:b0b0b0')!;
    const x0 = Math.round(p.x0 * PX), x1 = Math.round(p.x1 * PX), y0 = Math.round(p.y0 * PX), y1 = Math.round(p.y1 * PX);
    for (let y = y0; y < y1 && y < H; y++) {
      for (let x = x0; x < x1 && x < W; x++) out[y * W + x] = tex.data[(y % 32) * 32 + ((x - x0) % 32)] >>> 0;
    }
  }
  return { w: W, h: H, rgba };
}

// ------------------------------------------------------------------ browser

const cache = new Map<string, { canvas: HTMLCanvasElement; lift: number; pad: number }>();

/** The picture as a canvas, kept for next time. Draw it at (tile x × 32 − pad, tile y × 32 − lift − pad). */
export function itemPicture(item: CatalogItem, rot: 0 | 1 | 2 | 3): { canvas: HTMLCanvasElement; lift: number; pad: number } {
  const key = `${item.id}@${item.version}/${rot}`;
  const have = cache.get(key);
  if (have) return have;
  const pic = paintItemTop(item, rot);
  const canvas = Object.assign(document.createElement('canvas'), { width: pic.w, height: pic.h });
  canvas.getContext('2d')!.putImageData(new ImageData(pic.rgba, pic.w, pic.h), 0, 0);
  const made = { canvas, lift: pic.lift, pad: pic.pad };
  cache.set(key, made);
  return made;
}

const flatCache = new Map<string, HTMLCanvasElement>();

/** Floor art as a canvas, drawn at its footprint's corner. */
export function flatPicture(item: CatalogItem, rot: 0 | 1 | 2 | 3): HTMLCanvasElement {
  const key = `${item.id}@${item.version}/${rot}`;
  const have = flatCache.get(key);
  if (have) return have;
  const pic = paintFlat(item, rot);
  const canvas = Object.assign(document.createElement('canvas'), { width: pic.w, height: pic.h });
  canvas.getContext('2d')!.putImageData(new ImageData(pic.rgba, pic.w, pic.h), 0, 0);
  flatCache.set(key, canvas);
  return canvas;
}
