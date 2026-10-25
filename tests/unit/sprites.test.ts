import { describe, expect, it } from 'vitest';
import { FORMAT_VERSION, MAX_BYTES, validateSheet, validateSidecar } from '../../shared/sprites';

/** A sheet where every frame has a small opaque square in the middle and transparent corners. */
function sheet(frame: 16 | 32, opts: { blank?: [number, number]; corner?: [number, number] } = {}) {
  const w = frame * 4;
  const data = new Uint8Array(w * w * 4);
  const put = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    data.set([200, 100, 50, 255], i);
  };
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      if (opts.blank?.[0] === row && opts.blank?.[1] === col) continue;
      const cx = col * frame + frame / 2, cy = row * frame + frame / 2;
      for (let dy = -2; dy < 2; dy++) for (let dx = -2; dx < 2; dx++) put(cx + dx, cy + dy);
      if (opts.corner?.[0] === row && opts.corner?.[1] === col) put(col * frame, row * frame);
    }
  }
  return { data, w, h: w };
}

describe('validateSheet', () => {
  it('accepts a 64x64 and a 128x128 sheet', () => {
    const a = sheet(16);
    expect(validateSheet(a.data, a.w, a.h)).toEqual({ ok: true, frameSize: 16 });
    const b = sheet(32);
    expect(validateSheet(b.data, b.w, b.h)).toEqual({ ok: true, frameSize: 32 });
  });

  it('rejects any other size with bad-size', () => {
    const data = new Uint8Array(60 * 60 * 4).fill(255);
    expect(validateSheet(data, 60, 60)).toEqual({ ok: false, errors: ['bad-size'] });
    const wide = new Uint8Array(128 * 64 * 4);
    expect(validateSheet(wide, 128, 64)).toEqual({ ok: false, errors: ['bad-size'] });
  });

  it('rejects an opaque corner with no-alpha, and a fully opaque image too', () => {
    const s = sheet(16, { corner: [1, 2] });
    expect(validateSheet(s.data, s.w, s.h)).toEqual({ ok: false, errors: ['no-alpha'] });
    const solid = new Uint8Array(64 * 64 * 4).fill(255);
    expect(validateSheet(solid, 64, 64)).toEqual({ ok: false, errors: ['no-alpha'] });
  });

  it('names the blank frame by row and column', () => {
    const s = sheet(16, { blank: [2, 1] });
    expect(validateSheet(s.data, s.w, s.h)).toEqual({ ok: false, errors: ['empty-frame:2,1'] });
  });

  it('reports every problem at once', () => {
    const s = sheet(16, { blank: [0, 0], corner: [3, 3] });
    const r = validateSheet(s.data, s.w, s.h, MAX_BYTES + 1);
    expect(r).toEqual({ ok: false, errors: ['too-large', 'empty-frame:0,0', 'no-alpha'] });
  });

  it('rejects files over 256 KB', () => {
    const s = sheet(16);
    expect(validateSheet(s.data, s.w, s.h, MAX_BYTES + 1)).toMatchObject({ ok: false, errors: ['too-large'] });
    expect(validateSheet(s.data, s.w, s.h, MAX_BYTES)).toMatchObject({ ok: true });
  });

  it('rejects pixel data that does not match the stated size', () => {
    expect(validateSheet(new Uint8Array(10), 64, 64)).toEqual({ ok: false, errors: ['bad-size'] });
  });
});

describe('validateSidecar', () => {
  it('defaults to a full sheet named after its id when there is no sidecar', () => {
    expect(validateSidecar(undefined, 'robot')).toEqual({ ok: true, meta: { name: 'robot', layer: 'full' } });
  });

  it('reads name, layer and author, trimming the name to 32 characters', () => {
    const r = validateSidecar({ name: 'x'.repeat(40), layer: 'hair', author: ' sam ' }, 'wig');
    expect(r).toEqual({ ok: true, meta: { name: 'x'.repeat(32), layer: 'hair', author: 'sam' } });
  });

  it('rejects an unknown layer with bad-layer', () => {
    expect(validateSidecar({ layer: 'hat' }, 'hat')).toEqual({ ok: false, errors: ['bad-layer'] });
  });

  it('rejects ids that are not lowercase letters, digits and dashes', () => {
    for (const id of ['Robot_1', 'robot 1', '', 'ro.bot']) {
      expect(validateSidecar(undefined, id)).toEqual({ ok: false, errors: ['bad-id'] });
    }
    expect(validateSidecar(undefined, 'robot-2')).toMatchObject({ ok: true });
  });

  it('accepts the current format version, and rejects any other with bad-format', () => {
    expect(validateSidecar({ format: FORMAT_VERSION }, 'robot')).toMatchObject({ ok: true });
    expect(validateSidecar({}, 'robot')).toMatchObject({ ok: true }); // leaving it out means the current one
    for (const format of [2, 0, '1', null]) {
      expect(validateSidecar({ format }, 'robot'), String(format)).toEqual({ ok: false, errors: ['bad-format'] });
    }
  });

  it('rejects a sidecar that is not an object', () => {
    expect(validateSidecar('hello', 'robot')).toEqual({ ok: false, errors: ['bad-sidecar'] });
    expect(validateSidecar([1], 'robot')).toEqual({ ok: false, errors: ['bad-sidecar'] });
  });
});
