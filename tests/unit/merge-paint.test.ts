import { describe, expect, it } from 'vitest';
import { cloneLayout, type Layout } from '../../shared/layout';
import { mergeLayouts } from '../../shared/layout-merge';
import { SWATCHES } from '../../shared/finishes';
import { smallOffice } from './fixtures/layouts';
import { withPaint } from './paint-helpers';

const base = () => smallOffice();
const keyAt = (l: Layout, x: number, y: number, surface: 'floor' | 'wall' = 'floor') => {
  const g = surface === 'floor' ? l.floorPaint : l.wallPaint;
  const c = g?.[y * l.w + x];
  return c && c !== ' ' ? l.paints![c.charCodeAt(0) - 33] : undefined;
};

describe('merging paint', () => {
  it('keeps different tiles painted differently on each side', () => {
    const theirs = withPaint(base(), [[2, 8]], 'grass', 'floor');
    const mine = withPaint(base(), [[3, 8]], 'sand', 'floor');
    const { merged, clashes } = mergeLayouts(base(), theirs, mine);
    expect(clashes).toEqual([]);
    expect(keyAt(merged, 2, 8)).toBe('grass');
    expect(keyAt(merged, 3, 8)).toBe('sand');
  });

  it('is a clash when the same tile is painted two ways, and settles by key', () => {
    const theirs = withPaint(base(), [[2, 8]], 'grass', 'floor');
    const mine = withPaint(base(), [[2, 8]], 'sand', 'floor');
    const first = mergeLayouts(base(), theirs, mine);
    expect(first.clashes.map((c) => c.key)).toEqual(['paint-floor:2,8']);
    expect(first.clashes[0].tiles).toEqual([[2, 8]]);
    expect(keyAt(first.merged, 2, 8)).toBe('grass'); // theirs until settled
    const settled = mergeLayouts(base(), theirs, mine, { 'paint-floor:2,8': 'mine' });
    expect(settled.clashes).toEqual([]);
    expect(keyAt(settled.merged, 2, 8)).toBe('sand');
  });

  it('does not clash when both sides painted the same key, even if their tables number it differently', () => {
    const theirs = withPaint(withPaint(base(), [[2, 8]], 'sand', 'floor'), [[4, 8]], 'grass', 'floor');
    const mine = withPaint(base(), [[4, 8]], 'grass', 'floor');
    const { merged, clashes } = mergeLayouts(base(), theirs, mine);
    expect(clashes).toEqual([]);
    expect(keyAt(merged, 2, 8)).toBe('sand');
    expect(keyAt(merged, 4, 8)).toBe('grass');
  });

  it('numbers new paints from both sides again in the merged table', () => {
    const theirs = withPaint(base(), [[2, 8]], 'sand', 'floor');
    const mine = withPaint(withPaint(base(), [[3, 8]], 'cork', 'floor'), [[4, 8]], 'grass', 'floor');
    const { merged } = mergeLayouts(base(), theirs, mine);
    expect(new Set(merged.paints)).toEqual(new Set(['sand', 'cork', 'grass']));
    expect([2, 3, 4].map((x) => keyAt(merged, x, 8))).toEqual(['sand', 'cork', 'grass']);
  });

  it('merges wall paint by key too', () => {
    const wallTile = [0, 0] as [number, number];
    const theirs = withPaint(base(), [wallTile], 'brick-red', 'wall');
    const mine = withPaint(base(), [[1, 0]], 'brick-white', 'wall');
    const { merged, clashes } = mergeLayouts(base(), theirs, mine);
    expect(clashes).toEqual([]);
    expect(keyAt(merged, 0, 0, 'wall')).toBe('brick-red');
    expect(keyAt(merged, 1, 0, 'wall')).toBe('brick-white');
  });

  it('clashes on a theme changed two ways, and merges a theme changed on one side only', () => {
    const night = { ...cloneLayout(base()), theme: 'night-mode' };
    const cabin = { ...cloneLayout(base()), theme: 'cozy-cabin' };
    expect(mergeLayouts(base(), night, cabin).clashes.map((c) => c.key)).toEqual(['theme']);
    const one = mergeLayouts(base(), night, base());
    expect(one.clashes).toEqual([]);
    expect(one.merged.theme).toBe('night-mode');
  });

  it('treats a missing theme and Warm Studio as the same, and merges the switches', () => {
    const warm = { ...cloneLayout(base()), theme: 'warm-studio' };
    const out = mergeLayouts(base(), warm, base());
    expect(out.clashes).toEqual([]);
    expect(out.merged.theme).toBeUndefined();
    const a = { ...cloneLayout(base()), seasonal: true };
    const b = { ...cloneLayout(base()), daylight: true };
    const both = mergeLayouts(base(), a, b);
    expect(both.clashes).toEqual([]);
    expect(both.merged).toMatchObject({ seasonal: true, daylight: true });
  });

  it('keeps a room style with its room', () => {
    const styled = cloneLayout(base());
    styled.rooms[0].style = { theme: 'industrial-loft' };
    const { merged, clashes } = mergeLayouts(base(), base(), styled);
    expect(clashes).toEqual([]);
    expect(merged.rooms[0].style).toEqual({ theme: 'industrial-loft' });
    const other = cloneLayout(base());
    other.rooms[0].style = { theme: 'cozy-cabin' };
    expect(mergeLayouts(base(), other, styled).clashes.map((c) => c.key)).toEqual(['room:room-a']);
  });

  it('leaves a layout with no look fields without any', () => {
    const { merged } = mergeLayouts(base(), base(), base());
    expect(merged).toEqual(base());
    void SWATCHES;
  });
});
