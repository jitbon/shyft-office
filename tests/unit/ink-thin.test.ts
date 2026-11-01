import { describe, expect, it } from 'vitest';
import { thin } from '../../shared/ink';

describe('thin', () => {
  it('drops points closer than the minimum and keeps the first', () => {
    expect(thin([0, 0, 5, 5, 30, 0, 100, 0])).toEqual([0, 0, 30, 0, 100, 0]);
  });
  it('keeps the last point even when it is close', () => {
    expect(thin([0, 0, 100, 0, 103, 0])).toEqual([0, 0, 100, 0, 103, 0]);
  });
  it('keeps a single point', () => {
    expect(thin([40, 40])).toEqual([40, 40]);
  });
  it('returns a new flat array of even length', () => {
    const input = [0, 0, 1, 1, 2, 2];
    const out = thin(input);
    expect(out).not.toBe(input);
    expect(out.length % 2).toBe(0);
  });
});
