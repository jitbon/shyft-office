import { describe, expect, it } from 'vitest';
import { catalogFromDefinition } from '../../shared/catalog';
import { PAD, paintItemTop } from '../../src/item2d';
import { itemDef, part } from './fixtures/items';

const entry = (kind: Parameters<typeof itemDef>[0], over = {}) => catalogFromDefinition(itemDef(kind, over), { id: 'item:t', by: 'T', version: 1 });
const opaque = (pic: ReturnType<typeof paintItemTop>) => {
  const px = new Uint32Array(pic.rgba.buffer);
  let n = 0, x0 = pic.w, x1 = -1, y0 = pic.h, y1 = -1;
  for (let y = 0; y < pic.h; y++) for (let x = 0; x < pic.w; x++) if (px[y * pic.w + x] >>> 24) { n++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { n, x0, x1, y0, y1, px };
};

describe('paintItemTop', () => {
  it.each(['floor', 'deskitem', 'wall', 'floorart'] as const)('paints a %s item inside its footprint plus the lift and the outline margin', (kind) => {
    const item = entry(kind);
    const pic = paintItemTop(item, 0);
    const o = opaque(pic);
    expect(o.n).toBeGreaterThan(0);
    const [fw, fd] = item.footprint;
    expect(pic.w).toBe(Math.ceil(fw * 32) + PAD * 2);
    expect(pic.h).toBe(Math.ceil(fd * 32) + pic.lift + PAD * 2);
    expect(o.x0).toBeGreaterThanOrEqual(0);
    expect(o.x1).toBeLessThan(pic.w);
    expect(o.y1).toBeLessThan(pic.h);
  });

  it('is deterministic', () => {
    const a = paintItemTop(entry('floor'), 0), b = paintItemTop(entry('floor'), 0);
    expect(a.rgba).toEqual(b.rgba);
  });

  it('draws a dark outline round a floor item, but none round floor art', () => {
    const stool = opaque(paintItemTop(entry('floor'), 0));
    const w = paintItemTop(entry('floor'), 0).w;
    expect(stool.px[stool.y0 * w + stool.x0 + 3] >>> 24).toBe(255);
    const rug = paintItemTop(entry('floorart'), 0);
    const r = opaque(rug);
    expect(r.x0).toBe(PAD); // the picture starts at the padding: nothing is added round it
    expect(r.y0).toBeGreaterThanOrEqual(PAD);
    expect(r.y0).toBeLessThanOrEqual(PAD + rug.lift);
  });

  it('swaps width and depth for an odd turn', () => {
    const item = entry('floor', { footprint: [2, 1], parts: [part({ w: 2, d: 1, h: 0.3 })] });
    const a = paintItemTop(item, 0), b = paintItemTop(item, 1);
    expect(a.w).toBe(64 + 2);
    expect(b.w).toBe(32 + 2);
    expect(b.h).toBe(64 + b.lift + 2);
    const c = paintItemTop(item, 2);
    expect([c.w, c.h]).toEqual([a.w, a.h]);
  });

  it('shows a taller part higher up the page than a shorter one at the same place', () => {
    const short = paintItemTop(entry('floor', { parts: [part({ w: 1, d: 1, h: 0.2 })] }), 0);
    const tall = paintItemTop(entry('floor', { parts: [part({ w: 1, d: 1, h: 0.8 })] }), 0);
    expect(tall.lift).toBeGreaterThan(short.lift);
    // Measured from the bottom edge, the top face of the tall part starts higher.
    const topOf = (p: ReturnType<typeof paintItemTop>) => p.h - opaque(p).y0;
    expect(topOf(tall)).toBeGreaterThan(topOf(short));
  });

  it('draws a taller part over a shorter one in front of it', () => {
    const item = entry('floor', {
      footprint: [1, 1],
      parts: [part({ w: 1, d: 0.5, y: 0.5, h: 0.2, pattern: 'plain', color: '#ff0000' }), part({ w: 1, d: 0.5, y: 0, h: 0.4, pattern: 'plain', color: '#0000ff' })],
    });
    const pic = paintItemTop(item, 0);
    expect(opaque(pic).n).toBeGreaterThan(500);
  });
});
