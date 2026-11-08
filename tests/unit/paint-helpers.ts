// Shared helpers for the look tests: a drawing surface that is just pixels, stable hashes, and small layouts.
import { PixelCtx, asCtx } from '../../src/pixelctx';
import type { Layout } from '../../shared/layout';
import { emptyLayout } from './fixtures/layouts';

export { PixelCtx };
/** A drawing surface for the painters in `src/art.ts`; only `fillStyle` and `fillRect` exist, any other call fails loudly. */
export const fakeCtx = (w: number, h: number) => {
  const c = new PixelCtx(w, h);
  return { c, ctx: asCtx(c) };
};

/** A stable 32-bit hash of pixels (FNV-1a over the packed values). */
export function pixelHash(pixels: Uint32Array | { data: Uint32Array }): number {
  const d = pixels instanceof Uint32Array ? pixels : pixels.data;
  let h = 0x811c9dc5;
  for (let i = 0; i < d.length; i++) {
    h ^= d[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** A valid walled room, `w`×`h` (at least 10×10) with wood floor and the spawn in the middle. */
export const tinyLayout = (w = 16, h = 12): Layout => emptyLayout(w, h);

/** The layout with `tiles` ([x, y] pairs) painted `key` on `surface`. */
export function withPaint(layout: Layout, tiles: [number, number][], key: string, surface: 'floor' | 'wall'): Layout {
  const out: Layout = { ...layout, paints: [...(layout.paints ?? [])] };
  let i = out.paints!.indexOf(key);
  if (i < 0) i = out.paints!.push(key) - 1;
  const ch = String.fromCharCode(33 + i);
  const field = surface === 'floor' ? 'floorPaint' : 'wallPaint';
  const grid = (out[field] ?? ' '.repeat(layout.w * layout.h)).split('');
  for (const [x, y] of tiles) grid[y * layout.w + x] = ch;
  out[field] = grid.join('');
  return out;
}

