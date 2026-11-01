import { describe, expect, it } from 'vitest';
import { strokeAlpha, strokeDone } from '../../shared/ink';

describe('strokeAlpha', () => {
  it('is 1 while the pen is down', () => expect(strokeAlpha(999, null, false)).toBe(1));
  it('is 1 for a kept stroke at any time', () => expect(strokeAlpha(1e9, 100, true)).toBe(1));
  it('holds for 3 s, then fades over 1 s', () => {
    expect(strokeAlpha(2999 + 100, 100, false)).toBe(1);
    expect(strokeAlpha(3500 + 100, 100, false)).toBeCloseTo(0.5);
    expect(strokeAlpha(4000 + 100, 100, false)).toBe(0);
    expect(strokeAlpha(9000, 100, false)).toBe(0);
  });
});

describe('strokeDone', () => {
  it('is true only for an unkept stroke after the fade', () => {
    expect(strokeDone(4099, 100, false)).toBe(false);
    expect(strokeDone(4100, 100, false)).toBe(true);
    expect(strokeDone(1e9, 100, true)).toBe(false);
    expect(strokeDone(1e9, null, false)).toBe(false);
  });
});
