import { describe, expect, it } from 'vitest';
import type { Texture } from '../../src/art';
import { makeCam, type Face } from '../../src/mesh3d';
import { fillFace, fog, shade, type Target } from '../../src/raster';

const W = 64, H = 48, PLANE = 0.66;
const K = W / (2 * PLANE);
const half = H / 2;
const solid = (c: number): Texture => ({ w: 32, h: 32, data: new Uint32Array(1024).fill(c) });
const target = (): Target => ({ pix: new Uint32Array(W * H), depth: new Float32Array(W * H).fill(Infinity), w: W, h: H });

/** A vertical square one tile wide and half a tile high, facing south, with its bottom edge at y. */
const wall = (y: number, shadeFactor = 1): Face => ({
  pts: [{ x: 4, y, z: 0.5 }, { x: 5, y, z: 0.5 }, { x: 5, y, z: 0 }, { x: 4, y, z: 0 }],
  uv: [[0, 0], [1, 0], [1, 1], [0, 1]],
  mat: 'x',
  shade: shadeFactor,
  n: { x: 0, y: 1, z: 0 },
});
// Standing at (4.5, 8) and looking north, a face at y = 5 is 3 tiles away, straight ahead.
const cam = makeCam(4.5, 8, -Math.PI / 2, PLANE);
const mid = (H / 2) * W + W / 2;

describe('fillFace', () => {
  it('draws a face ahead with its distance, texture, fog and shade', () => {
    const t = target();
    fillFace(t, wall(5, 0.85), cam, K, half, solid(0xff3366cc));
    expect(t.depth[mid]).toBeCloseTo(3, 4);
    expect(t.pix[mid]).toBe(shade(0xff3366cc, fog(3) * 0.85) >>> 0);
    // It covers the rows between the floor point and half a tile above, and nothing outside.
    expect(t.depth[0]).toBe(Infinity);
    expect(t.depth[(H - 1) * W]).toBe(Infinity);
    const rows = Array.from({ length: H }, (_, y) => t.depth[y * W + W / 2] !== Infinity);
    const first = rows.indexOf(true), last = rows.lastIndexOf(true);
    expect(last - first + 1).toBe(Math.round(K / 3 / 2)); // half a tile of height at distance 3
  });

  it('lets a nearer face replace a farther one and ignores a farther face drawn afterwards', () => {
    const t = target();
    fillFace(t, wall(3), cam, K, half, solid(0xff0000ff)); // 5 away
    expect(t.depth[mid]).toBeCloseTo(5, 4);
    fillFace(t, wall(6), cam, K, half, solid(0xff00ff00)); // 2 away: in front
    expect(t.depth[mid]).toBeCloseTo(2, 4);
    const front = t.pix[mid];
    fillFace(t, wall(2), cam, K, half, solid(0xffff0000)); // 6 away: behind
    expect(t.depth[mid]).toBeCloseTo(2, 4);
    expect(t.pix[mid]).toBe(front);
  });

  it('draws nothing for a face behind the camera, and clips one that crosses the near plane', () => {
    const t = target();
    fillFace(t, wall(9), cam, K, half, solid(0xff112233)); // behind (the camera is at y = 8, looking north)
    expect(t.depth.every((d) => d === Infinity)).toBe(true);
    fillFace(t, wall(7.95), cam, K, half, solid(0xff112233)); // 0.05 away: inside the near plane, so cut
    expect(t.depth.every((d) => d === Infinity)).toBe(true);
    const crossing: Face = { ...wall(5), pts: [{ x: 4, y: 12, z: 0.5 }, { x: 5, y: 12, z: 0.5 }, { x: 5, y: 5, z: 0 }, { x: 4, y: 5, z: 0 }] };
    fillFace(t, crossing, cam, K, half, solid(0xff112233));
    expect(t.depth.some((d) => d !== Infinity)).toBe(true);
  });

  it('samples a texture across the face and repeats it', () => {
    const data = new Uint32Array(1024);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) data[y * 32 + x] = x < 16 ? 0xff0000ff : 0xff00ff00;
    const face = { ...wall(5), uv: [[0, 0], [2, 0], [2, 1], [0, 1]] as Face['uv'] }; // the texture twice across
    const t = target();
    fillFace(t, face, cam, K, half, { w: 32, h: 32, data });
    const row = Math.round(half + (K / 3) * 0.25); // inside the face
    const colors = Array.from({ length: W }, (_, x) => t.pix[row * W + x]).filter((c) => c !== 0);
    const changes = colors.filter((c, i) => i > 0 && c !== colors[i - 1]).length;
    expect(changes).toBeGreaterThanOrEqual(3); // red, green, red, green
  });
});
