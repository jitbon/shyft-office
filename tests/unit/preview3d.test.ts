import { describe, expect, it } from 'vitest';
import { PREVIEW_H, PREVIEW_W, VIEWS, drawPreview, orbitCam } from '../../src/studio/preview3d';
import { newDesign, setPart } from '../../src/studio/model';

const blank = () => ({ pix: new Uint32Array(PREVIEW_W * PREVIEW_H), depth: new Float32Array(PREVIEW_W * PREVIEW_H), w: PREVIEW_W, h: PREVIEW_H });
const hash = (t: ReturnType<typeof blank>) => t.pix.reduce((a, v) => (a * 31 + v) >>> 0, 7);

describe('the studio 3D preview', () => {
  it('puts the camera on the named side and looking at the middle', () => {
    const d = newDesign('floor');
    const front = orbitCam(d, VIEWS.front);
    expect(front.x).toBeCloseTo(0.5, 5);
    expect(front.y).toBeGreaterThan(1);
    expect(front.a).toBeCloseTo(VIEWS.front + Math.PI, 5);
    expect(orbitCam(d, VIEWS.back).y).toBeLessThan(0);
    expect(orbitCam(d, VIEWS.left).x).toBeLessThan(0);
    expect(orbitCam(d, VIEWS.right).x).toBeGreaterThan(1);
    expect(orbitCam(d, VIEWS.front, 2).dist).toBeLessThan(front.dist);
  });

  it('draws the item in the middle of the picture on a ground square', () => {
    const t = blank();
    drawPreview(t, newDesign('floor'), VIEWS.front, 1);
    const sky = t.pix[0];
    const mid = t.pix[Math.floor(PREVIEW_H * 0.55) * PREVIEW_W + PREVIEW_W / 2];
    expect(mid).not.toBe(sky);
    expect(t.depth[Math.floor(PREVIEW_H * 0.55) * PREVIEW_W + PREVIEW_W / 2]).toBeLessThan(Infinity);
  });

  it('changes with the view and with the design', () => {
    const d = setPart(newDesign('floor'), 0, { x: 0, w: 0.5 });
    const front = blank(), back = blank(), left = blank(), edited = blank();
    drawPreview(front, d, VIEWS.front, 1);
    drawPreview(back, d, VIEWS.back, 1);
    drawPreview(left, d, VIEWS.left, 1);
    drawPreview(edited, setPart(d, 0, { color: '#ff0000' }), VIEWS.front, 1);
    expect(new Set([hash(front), hash(back), hash(left), hash(edited)]).size).toBe(4);
  });
});
