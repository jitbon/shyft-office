import { describe, expect, it } from 'vitest';
import { validateShareMsg } from '../../shared/screen-share';

describe('validateShareMsg', () => {
  it('needs a boolean on', () => {
    expect(validateShareMsg({ t: 'share' })).toBeNull();
    expect(validateShareMsg({ t: 'share', on: 'yes' })).toBeNull();
    expect(validateShareMsg(null)).toBeNull();
    expect(validateShareMsg('share')).toBeNull();
  });

  it('accepts a stop with nothing else, dropping extras', () => {
    expect(validateShareMsg({ t: 'share', on: false })).toEqual({ on: false });
    expect(validateShareMsg({ t: 'share', on: false, w: 5 })).toEqual({ on: false });
  });

  it('rounds and clamps the size', () => {
    expect(validateShareMsg({ on: true, w: 1920.4, h: 1080.6 })).toEqual({ on: true, audio: false, w: 1920, h: 1081 });
    expect(validateShareMsg({ on: true, w: 99999, h: -3 })).toEqual({ on: true, audio: false, w: 8192, h: 1 });
    expect(validateShareMsg({ on: true, w: 0, h: 0.2 })).toEqual({ on: true, audio: false, w: 1, h: 1 });
  });

  it('ignores a start without a usable size', () => {
    expect(validateShareMsg({ on: true })).toBeNull();
    expect(validateShareMsg({ on: true, w: 'big', h: 100 })).toBeNull();
    expect(validateShareMsg({ on: true, w: 100 })).toBeNull();
    expect(validateShareMsg({ on: true, w: NaN, h: 100 })).toBeNull();
    expect(validateShareMsg({ on: true, w: Infinity, h: 100 })).toBeNull();
  });

  it('takes audio only when it is exactly true', () => {
    expect(validateShareMsg({ on: true, w: 10, h: 10, audio: true })).toMatchObject({ audio: true });
    expect(validateShareMsg({ on: true, w: 10, h: 10, audio: 1 })).toMatchObject({ audio: false });
    expect(validateShareMsg({ on: true, w: 10, h: 10 })).toMatchObject({ audio: false });
  });

  it('drops extra fields', () => {
    expect(validateShareMsg({ t: 'share', on: true, w: 10, h: 10, x: 1 })).toEqual({ on: true, audio: false, w: 10, h: 10 });
  });
});
