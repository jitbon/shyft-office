import { describe, expect, it } from 'vitest';
import { InkStore, penPaused } from '../../src/inkModel';

const batch = (over: Partial<Parameters<InkStore['add']>[0]> = {}) => ({
  from: 'b', shareId: 'a:1', strokeId: 1, seq: 0, pts: [10, 10, 20, 20], ...over,
});

describe('InkStore', () => {
  it('creates a stroke and extends it with later batches', () => {
    const s = new InkStore();
    s.add(batch(), 1, 100);
    s.add(batch({ seq: 1, pts: [30, 30] }), 1, 120);
    const [one] = s.visible('a:1', 130);
    expect(one.stroke.pts).toEqual([10, 10, 20, 20, 30, 30]);
    expect(one.alpha).toBe(1);
  });

  it('ignores a duplicate or older batch', () => {
    const s = new InkStore();
    s.add(batch({ seq: 2 }), 1, 100);
    s.add(batch({ seq: 2, pts: [99, 99] }), 1, 101);
    s.add(batch({ seq: 1, pts: [98, 98] }), 1, 102);
    expect(s.visible('a:1', 103)[0].stroke.pts).toEqual([10, 10, 20, 20]);
  });

  it('appends a batch after a gap in the numbers', () => {
    const s = new InkStore();
    s.add(batch({ seq: 0 }), 1, 100);
    s.add(batch({ seq: 5, pts: [50, 50] }), 1, 101);
    expect(s.visible('a:1', 102)[0].stroke.pts).toHaveLength(6);
  });

  it('holds a finished stroke 3 s, fades it over 1 s, then removes it', () => {
    const s = new InkStore();
    s.add(batch({ end: true }), 1, 1000);
    expect(s.visible('a:1', 3999)[0].alpha).toBe(1);
    expect(s.visible('a:1', 4500)[0].alpha).toBeCloseTo(0.5);
    expect(s.visible('a:1', 5000)).toEqual([]);
    expect(s.count('a:1')).toBe(0);
  });

  it('ends a stroke whose end never came', () => {
    const s = new InkStore();
    s.add(batch(), 1, 1000);
    s.endStale(5999);
    expect(s.visible('a:1', 6000)[0].alpha).toBe(1);
    s.endStale(6000);
    expect(s.visible('a:1', 6000)[0].alpha).toBe(1); // ended at 1000 + 5000, so it holds 3 s from then
    expect(s.visible('a:1', 9000)[0].alpha).toBe(1);
    expect(s.visible('a:1', 10000)).toEqual([]);
  });

  it('keeps the color a stroke started with', () => {
    const s = new InkStore();
    s.add(batch(), 3, 100);
    s.add(batch({ seq: 1, pts: [1, 1] }), 5, 110);
    expect(s.visible('a:1', 120)[0].stroke.color).toBe(3);
  });

  it('clears all of a share, or one drawer\'s, kept or not', () => {
    const s = new InkStore();
    s.add(batch({ from: 'b', keep: true }), 1, 100);
    s.add(batch({ from: 'c' }), 2, 100);
    s.add(batch({ shareId: 'z:1' }), 1, 100);
    s.clear('a:1', 'mine', 'b');
    expect(s.visible('a:1', 110).map((v) => v.stroke.from)).toEqual(['c']);
    s.clear('a:1', 'all', 'a');
    expect(s.count('a:1')).toBe(0);
    expect(s.count('z:1')).toBe(1);
  });

  it('drops a whole share', () => {
    const s = new InkStore();
    s.add(batch(), 1, 100);
    s.dropShare('a:1');
    expect(s.count('a:1')).toBe(0);
  });

  it('ends a drawer\'s open strokes when they leave', () => {
    const s = new InkStore();
    s.add(batch({ from: 'b' }), 1, 1000);
    s.add(batch({ from: 'c' }), 1, 1000);
    s.endFrom('b', 2000);
    expect(s.visible('a:1', 4999).find((v) => v.stroke.from === 'b')!.alpha).toBe(1);
    expect(s.visible('a:1', 5500).find((v) => v.stroke.from === 'b')!.alpha).toBeCloseTo(0.5);
    expect(s.visible('a:1', 5500).find((v) => v.stroke.from === 'c')!.alpha).toBe(1);
  });

  it('keeps a kept stroke visible long after it ended, until cleared', () => {
    const s = new InkStore();
    s.add(batch({ end: true, keep: true }), 1, 1000);
    expect(s.visible('a:1', 11000)[0].alpha).toBe(1);
    s.clear('a:1', 'mine', 'b');
    expect(s.visible('a:1', 11001)).toEqual([]);
  });

  it('counts a drawer\'s strokes', () => {
    const s = new InkStore();
    s.add(batch({ from: 'b' }), 1, 100);
    s.add(batch({ from: 'c' }), 1, 100);
    expect(s.count('a:1')).toBe(2);
    expect(s.count('a:1', 'b')).toBe(1);
  });
});

describe('penPaused', () => {
  it('is paused until the given time', () => {
    expect(penPaused(500, 1000)).toBe(true);
    expect(penPaused(1000, 1000)).toBe(false);
    expect(penPaused(5, 0)).toBe(false);
  });
});
