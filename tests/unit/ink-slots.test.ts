import { describe, expect, it } from 'vitest';
import { assignInkSlots } from '../../shared/ink';

describe('assignInkSlots', () => {
  it('numbers members in join order from an empty start', () => {
    expect([...assignInkSlots(['a', 'b', 'c'], new Map())]).toEqual([['a', 0], ['b', 1], ['c', 2]]);
  });
  it('lets a member keep their slot', () => {
    expect(assignInkSlots(['a', 'b'], new Map([['a', 5], ['b', 3]])).get('a')).toBe(5);
  });
  it('gives a newcomer the freed slot and leaves the others alone', () => {
    const prev = new Map([['a', 0], ['b', 1], ['c', 2]]);
    const next = assignInkSlots(['a', 'c', 'd'], prev);
    expect(next.get('a')).toBe(0);
    expect(next.get('c')).toBe(2);
    expect(next.get('d')).toBe(1);
  });
  it('never gives one slot to two members', () => {
    const next = assignInkSlots(['a', 'b'], new Map([['a', 2], ['b', 2]]));
    expect(next.get('a')).toBe(2);
    expect(next.get('b')).toBe(0);
  });
  it('wraps for a ninth member into the range 0–7', () => {
    const members = Array.from({ length: 9 }, (_, i) => `p${i}`);
    const next = assignInkSlots(members, new Map());
    expect(next.get('p8')).toBeGreaterThanOrEqual(0);
    expect(next.get('p8')).toBeLessThanOrEqual(7);
    expect(new Set([...next.values()].slice(0, 8)).size).toBe(8);
  });
  it('only has keys for the members', () => {
    const next = assignInkSlots(['a'], new Map([['gone', 1]]));
    expect([...next.keys()]).toEqual(['a']);
  });
});
