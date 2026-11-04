import { describe, expect, it } from 'vitest';
import { getMemberId } from '../../src/join';
import { readLocal, writeLocal } from '../../src/storage';

// The test runner has no localStorage, which is exactly a browser that blocks site data.
describe('getMemberId without storage', () => {
  it('gives the same id every time in one page, so the player and the join message agree', () => {
    const first = getMemberId();
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(getMemberId()).toBe(first);
    expect(getMemberId()).toBe(first);
  });
});

describe('storage helpers', () => {
  it('read null and ignore writes when there is no storage, without throwing', () => {
    expect(() => writeLocal('k', 'v')).not.toThrow();
    expect(readLocal('k')).toBeNull();
    expect(() => writeLocal('k', null)).not.toThrow();
  });
});
