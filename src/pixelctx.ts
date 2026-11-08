// A drawing surface made of plain pixels: just `fillStyle` and `fillRect`, which is all the floor, wall and ceiling painters use
// (through `rect()` in wardrobe/draw.ts). It lets the same painters run in tests and on the server without a canvas.
// Pixels are packed ABGR, the layout `Texture` and ImageData use.
import type { Texture } from './art';

export class PixelCtx {
  readonly data: Uint32Array;
  private color = 0;

  constructor(readonly w: number, readonly h: number) {
    this.data = new Uint32Array(w * h);
  }

  set fillStyle(v: string) {
    if (!/^#[0-9a-f]{6}$/i.test(v)) throw new Error(`PixelCtx only knows #rrggbb colors, got ${v}`);
    const n = parseInt(v.slice(1), 16);
    this.color = (0xff000000 | ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255)) >>> 0;
  }

  fillRect(x: number, y: number, w: number, h: number) {
    const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(this.w, x + w), y1 = Math.min(this.h, y + h);
    for (let yy = y0; yy < y1; yy++) this.data.fill(this.color, yy * this.w + x0, yy * this.w + x1);
  }

  texture(): Texture {
    return { w: this.w, h: this.h, data: this.data };
  }
}

/** A `CanvasRenderingContext2D` stand-in for the painters. */
export const pixelCtx = (w: number, h: number) => new PixelCtx(w, h);
export const asCtx = (c: PixelCtx) => c as unknown as CanvasRenderingContext2D;
