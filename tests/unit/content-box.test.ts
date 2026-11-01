import { describe, expect, it } from 'vitest';
import { contentBox, fromPicture, toPicture } from '../../shared/ink';

describe('contentBox', () => {
  it('letterboxes a wide picture in a square', () => {
    expect(contentBox(1000, 1000, 1920, 1080)).toEqual({ x: 0, y: 218.75, w: 1000, h: 562.5 });
  });
  it('pillarboxes a tall picture in a wide box', () => {
    expect(contentBox(1000, 500, 1080, 1920)).toEqual({ x: 359.375, y: 0, w: 281.25, h: 500 });
  });
  it('fills the box when the proportions match', () => {
    expect(contentBox(960, 540, 1920, 1080)).toEqual({ x: 0, y: 0, w: 960, h: 540 });
  });
  it('uses the whole element for a zero video size', () => {
    expect(contentBox(300, 200, 0, 0)).toEqual({ x: 0, y: 0, w: 300, h: 200 });
  });
  it('works from the share size before the first frame', () => {
    expect(contentBox(1000, 1000, 1920, 1080)).toEqual(contentBox(1000, 1000, 1920, 1080));
  });
});

describe('toPicture and fromPicture', () => {
  const box = { x: 0, y: 218.75, w: 1000, h: 562.5 };
  it('maps inside the box to 0–10000', () => {
    expect(toPicture(box, 500, 500)).toEqual([5000, 5000]);
    expect(toPicture(box, 0, 218.75)).toEqual([0, 0]);
  });
  it('gives null outside the box', () => {
    expect(toPicture(box, 500, 100)).toBeNull();
    expect(toPicture(box, 1200, 500)).toBeNull();
  });
  it('maps back to element coordinates', () => {
    expect(fromPicture(box, 5000, 5000)).toEqual([500, 500]);
  });
});
