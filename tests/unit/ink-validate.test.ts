import { describe, expect, it } from 'vitest';
import { validateInk, validateInkAllow, validateInkClear } from '../../shared/ink';

const ok = { t: 'ink', shareId: 'a:1', strokeId: 1, seq: 0, pts: [1, 2, 3, 4] };

describe('validateInk', () => {
  it('accepts a good message and drops extra fields', () => {
    expect(validateInk({ ...ok, extra: 'x', end: true, keep: true })).toEqual({
      shareId: 'a:1', strokeId: 1, seq: 0, pts: [1, 2, 3, 4], end: true, keep: true,
    });
    expect(validateInk(ok)).toEqual({ shareId: 'a:1', strokeId: 1, seq: 0, pts: [1, 2, 3, 4] });
  });
  it('checks the share id', () => {
    expect(validateInk({ ...ok, shareId: 5 })).toBeNull();
    expect(validateInk({ ...ok, shareId: 'x'.repeat(81) })).toBeNull();
    expect(validateInk({ ...ok, shareId: 'x'.repeat(80) })).not.toBeNull();
  });
  it('needs whole stroke ids and sequence numbers in range', () => {
    for (const bad of [-1, 1.5, NaN, '1', 2 ** 31 + 1, null]) {
      expect(validateInk({ ...ok, strokeId: bad })).toBeNull();
      expect(validateInk({ ...ok, seq: bad })).toBeNull();
    }
    expect(validateInk({ ...ok, strokeId: 2 ** 31, seq: 0 })).not.toBeNull();
  });
  it('rounds and clamps points', () => {
    expect(validateInk({ ...ok, pts: [-5, 10000.6] })?.pts).toEqual([0, 10000]);
  });
  it('rejects odd, empty, long and non-numeric points', () => {
    expect(validateInk({ ...ok, pts: [1, 2, 3] })).toBeNull();
    expect(validateInk({ ...ok, pts: [] })).toBeNull();
    expect(validateInk({ ...ok, pts: Array(130).fill(5) })).toBeNull();
    expect(validateInk({ ...ok, pts: Array(128).fill(5) })).not.toBeNull();
    expect(validateInk({ ...ok, pts: [1, NaN] })).toBeNull();
    expect(validateInk({ ...ok, pts: [1, '2'] })).toBeNull();
    expect(validateInk({ ...ok, pts: 'no' })).toBeNull();
  });
  it('counts anything but true as absent for end and keep', () => {
    const v = validateInk({ ...ok, end: 'yes', keep: 1 });
    expect(v).toEqual({ shareId: 'a:1', strokeId: 1, seq: 0, pts: [1, 2, 3, 4] });
  });
  it('ignores things that are not objects', () => {
    expect(validateInk(null)).toBeNull();
    expect(validateInk('ink')).toBeNull();
  });
});

describe('validateInkClear and validateInkAllow', () => {
  it('takes mine or all', () => {
    expect(validateInkClear({ shareId: 'a:1', scope: 'mine' })).toEqual({ shareId: 'a:1', scope: 'mine' });
    expect(validateInkClear({ shareId: 'a:1', scope: 'all' })).toEqual({ shareId: 'a:1', scope: 'all' });
    expect(validateInkClear({ shareId: 'a:1', scope: 'some' })).toBeNull();
    expect(validateInkClear({ shareId: 3, scope: 'all' })).toBeNull();
  });
  it('takes a boolean', () => {
    expect(validateInkAllow({ shareId: 'a:1', on: false })).toEqual({ shareId: 'a:1', on: false });
    expect(validateInkAllow({ shareId: 'a:1', on: 'no' })).toBeNull();
  });
});
