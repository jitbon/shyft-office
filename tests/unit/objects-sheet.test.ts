import { describe, expect, it } from 'vitest';
import { MAX_OBJECT_BYTES, customCatalogItem, expectedSize, validateObjectMeta, validateObjectSheet, viewRect, type ObjectMeta } from '../../shared/objects';

const meta = (over: Partial<ObjectMeta> = {}): ObjectMeta => ({ name: 'Vending machine', footprint: [1, 1], height: 64, blocks: true, frames: 2, fps: 4, back: false, ...over });

/** A sheet with something opaque in every view of every frame, except where `empty` names a cell. */
function sheet(m: ObjectMeta, empty: [number, number][] = [], fillTop = true) {
  const { width, height } = expectedSize(m);
  const rgba = new Uint8Array(width * height * 4);
  const views = (m.back ? ['top', 'front', 'side', 'back'] : ['top', 'front', 'side']) as ('top' | 'front' | 'side' | 'back')[];
  views.forEach((view, row) => {
    if (view === 'top' && !fillTop) return;
    for (let f = 0; f < m.frames; f++) {
      if (empty.some(([r, c]) => r === row && c === f)) continue;
      const r = viewRect(m, view, f);
      rgba.set([200, 80, 80, 255], ((r.y + 2) * width + r.x + 2) * 4);
    }
  });
  return { rgba, width, height };
}

describe('object metadata', () => {
  it('accepts a complete description and fills in the defaults', () => {
    expect(validateObjectMeta({ format: 1, name: ' Arcade ', footprint: [2, 1], height: 64 })).toEqual({
      ok: true, meta: { name: 'Arcade', footprint: [2, 1], height: 64, blocks: true, frames: 1, fps: 4, back: false },
    });
    expect(validateObjectMeta({ name: 'x', footprint: [4, 4], height: 96, blocks: false, frames: 8, fps: 12, back: true })).toMatchObject({ ok: true });
  });

  it.each([
    ['not an object', null, ['bad-meta']],
    ['an array', [], ['bad-meta']],
    ['another format version', { format: 2, name: 'a', footprint: [1, 1], height: 32 }, ['bad-format']],
    ['an empty name', { name: '  ', footprint: [1, 1], height: 32 }, ['bad-name']],
    ['a 33-character name', { name: 'x'.repeat(33), footprint: [1, 1], height: 32 }, ['bad-name']],
    ['a footprint of 5', { name: 'a', footprint: [5, 1], height: 32 }, ['bad-footprint']],
    ['a footprint of 0', { name: 'a', footprint: [0, 1], height: 32 }, ['bad-footprint']],
    ['a footprint that is not a pair', { name: 'a', footprint: 2, height: 32 }, ['bad-footprint']],
    ['a height of 60', { name: 'a', footprint: [1, 1], height: 60 }, ['bad-height']],
    ['a height of 104', { name: 'a', footprint: [1, 1], height: 104 }, ['bad-height']],
    ['a height of 0', { name: 'a', footprint: [1, 1], height: 0 }, ['bad-height']],
    ['9 frames', { name: 'a', footprint: [1, 1], height: 32, frames: 9 }, ['bad-frames']],
    ['13 fps', { name: 'a', footprint: [1, 1], height: 32, fps: 13 }, ['bad-frames']],
  ])('refuses %s', (_, json, errors) => {
    expect(validateObjectMeta(json)).toEqual({ ok: false, errors });
  });
});

describe('object sheets', () => {
  it('works out the size a sheet must have', () => {
    expect(expectedSize(meta())).toEqual({ width: 64, height: 32 + 64 * 2 });
    expect(expectedSize(meta({ back: true }))).toEqual({ width: 64, height: 32 + 64 * 3 });
    expect(expectedSize(meta({ footprint: [2, 1], frames: 3 }))).toEqual({ width: 3 * 64, height: 32 + 128 });
    expect(expectedSize(meta({ footprint: [1, 3], frames: 1, height: 32 }))).toEqual({ width: 96, height: 96 + 64 });
  });

  it('places each view: top, front, side and back, one column per frame', () => {
    const m = meta({ footprint: [2, 1], back: true });
    expect(viewRect(m, 'top', 0)).toEqual({ x: 0, y: 0, w: 64, h: 32 });
    expect(viewRect(m, 'front', 1)).toEqual({ x: 64, y: 32, w: 64, h: 64 });
    expect(viewRect(m, 'side', 0)).toEqual({ x: 0, y: 96, w: 32, h: 64 });
    expect(viewRect(m, 'back', 1)).toEqual({ x: 64, y: 160, w: 64, h: 64 });
  });

  it('accepts a sheet that follows the format', () => {
    const { rgba, width, height } = sheet(meta());
    expect([width, height]).toEqual([64, 160]);
    expect(validateObjectSheet(rgba, width, height, 1000, meta())).toEqual({ ok: true });
    const withBack = sheet(meta({ back: true }));
    expect([withBack.width, withBack.height]).toEqual([64, 224]);
    expect(validateObjectSheet(withBack.rgba, withBack.width, withBack.height, 1000, meta({ back: true }))).toEqual({ ok: true });
  });

  it('says the size it wanted when the image is the wrong size', () => {
    const s = sheet(meta());
    expect(validateObjectSheet(s.rgba, 33, 64, 1000, meta())).toEqual({ ok: false, errors: ['bad-size:64x160'] });
    expect(validateObjectSheet(new Uint8Array(4), 1, 1, 10, meta({ footprint: [2, 2], height: 32, frames: 1 }))).toEqual({ ok: false, errors: ['bad-size:64x128'] });
  });

  it('names a view with nothing drawn, by row and frame, but lets the top view be empty', () => {
    const s = sheet(meta(), [[1, 0], [2, 1]]);
    expect(validateObjectSheet(s.rgba, s.width, s.height, 10, meta())).toEqual({ ok: false, errors: ['empty-view:1,0', 'empty-view:2,1'] });
    const noTop = sheet(meta(), [], false);
    expect(validateObjectSheet(noTop.rgba, noTop.width, noTop.height, 10, meta())).toEqual({ ok: true });
    const back = sheet(meta({ back: true }), [[3, 1]]);
    expect(validateObjectSheet(back.rgba, back.width, back.height, 10, meta({ back: true }))).toEqual({ ok: false, errors: ['empty-view:3,1'] });
  });

  it('refuses a file over 512 KB, along with anything else wrong', () => {
    const s = sheet(meta());
    expect(validateObjectSheet(s.rgba, s.width, s.height, MAX_OBJECT_BYTES + 1, meta())).toEqual({ ok: false, errors: ['too-large'] });
    expect(validateObjectSheet(s.rgba, 3, 3, MAX_OBJECT_BYTES + 1, meta())).toEqual({ ok: false, errors: ['too-large', 'bad-size:64x160'] });
  });
});

describe('a custom object as furniture', () => {
  it('is a solid box of its footprint and height, with a view on every face and nothing repeated', () => {
    const item = customCatalogItem({ ...meta({ footprint: [2, 1], back: true, height: 64 }), id: 'arcade', url: '/objects/arcade.png' });
    expect(item).toMatchObject({ id: 'custom:arcade', footprint: [2, 1], blocks: true, tile: 'x', facing: true, custom: true });
    expect(item.model).toHaveLength(1);
    expect(item.model[0]).toMatchObject({ w: 2, d: 1, h: 2, stretch: true });
    expect(item.model[0].mat).toEqual({
      top: 'custom:arcade/top', front: 'custom:arcade/front', side: 'custom:arcade/side',
      back: 'custom:arcade/back', east: 'custom:arcade/side', west: 'custom:arcade/side!',
    });
  });

  it('puts the front on the back as well when the sheet has no back view', () => {
    const item = customCatalogItem({ ...meta(), id: 'vend', url: '/objects/vend.png' });
    expect((item.model[0].mat as { back: string }).back).toBe('custom:vend/front');
  });
});

import { describeObjectError } from '../../shared/objects';

describe('describeObjectError', () => {
  it('turns every code into a sentence, including the size and the empty view', () => {
    expect(describeObjectError('bad-size:64x160')).toBe('With these settings the picture must be 64 × 160 pixels.');
    expect(describeObjectError('empty-view:1,0')).toBe('The front view of frame 1 has nothing drawn in it.');
    expect(describeObjectError('empty-view:3,1')).toBe('The back view of frame 2 has nothing drawn in it.');
    for (const code of ['too-large', 'not-png', 'bad-meta', 'bad-format', 'bad-name', 'bad-footprint', 'bad-height', 'bad-frames', 'bad-id', 'too-many']) {
      expect(describeObjectError(code)).not.toBe(code);
    }
    expect(describeObjectError('something-new')).toBe('something-new');
  });
});
