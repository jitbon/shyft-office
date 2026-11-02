import { describe, expect, it } from 'vitest';
import { makeCam, type Face } from '../../src/mesh3d';
import { fillFace } from '../../src/raster';

const W = 120, H = 160, PLANE = 0.66, K = W / (2 * PLANE);
const tex = { w: 2, h: 2, data: new Uint32Array([0xff3366cc, 0xff3366cc, 0xff3366cc, 0xff3366cc]) };

// An upright face 3 tiles ahead of a camera at the origin facing +x, from the floor to 0.8 high.
const face: Face = {
  pts: [{ x: 3, y: -0.5, z: 0.8 }, { x: 3, y: 0.5, z: 0.8 }, { x: 3, y: 0.5, z: 0 }, { x: 3, y: -0.5, z: 0 }],
  uv: [[0, 0], [1, 0], [1, 1], [0, 1]],
  mat: 'test',
  shade: 1,
  n: { x: -1, y: 0, z: 0 },
};

const draw = (horizon: number) => {
  const t = { pix: new Uint32Array(W * H), depth: new Float32Array(W * H).fill(Infinity), w: W, h: H };
  fillFace(t, face, makeCam(0, 0, 0, PLANE), K, horizon, tex, 0.5);
  return t;
};

/** Per row: how many pixels were drawn and the first column; only rows with something. */
const rows = (t: ReturnType<typeof draw>) => {
  const out = new Map<number, { n: number; x0: number }>();
  for (let y = 0; y < H; y++) {
    let n = 0, x0 = -1;
    for (let x = 0; x < W; x++) if (t.pix[y * W + x] !== 0) { n++; if (x0 < 0) x0 = x; }
    if (n) out.set(y, { n, x0 });
  }
  return out;
};

describe('fillFace with a moved horizon', () => {
  it('draws the same face, moved down by the same number of rows', () => {
    const level = rows(draw(H / 2));
    const down = rows(draw(H / 2 + 40));
    expect(level.size).toBeGreaterThan(10);
    expect(Math.abs(down.size - level.size)).toBeLessThanOrEqual(1);
    const first = Math.min(...level.keys()), firstDown = Math.min(...down.keys());
    expect(Math.abs(firstDown - first - 40)).toBeLessThanOrEqual(1);
    const last = Math.max(...level.keys()), lastDown = Math.max(...down.keys());
    expect(Math.abs(lastDown - last - 40)).toBeLessThanOrEqual(1);
    // the same columns in the same rows
    for (const [y, r] of level) {
      const d = down.get(y + 40) ?? down.get(y + 39) ?? down.get(y + 41);
      expect(d).toBeDefined();
      expect(Math.abs(d!.x0 - r.x0)).toBeLessThanOrEqual(1);
      expect(Math.abs(d!.n - r.n)).toBeLessThanOrEqual(1);
    }
  });
});
