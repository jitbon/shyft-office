import { describe, expect, it } from 'vitest';
import { clampItem, validateItem, type ItemDefinition } from '../../shared/items';
import { itemDef, part } from './fixtures/items';

const errorsOf = (raw: unknown) => {
  const r = validateItem(raw);
  return r.ok ? [] : r.errors;
};
const withParts = (kind: Parameters<typeof itemDef>[0], parts: unknown[], over: Record<string, unknown> = {}) => ({ ...itemDef(kind), parts, ...over });

describe('validateItem', () => {
  it('accepts a valid item of each kind and fills in the defaults', () => {
    for (const kind of ['floor', 'deskitem', 'wall', 'floorart'] as const) expect(validateItem(itemDef(kind)).ok, kind).toBe(true);
    const bare = { name: ' Stool ', group: 'chairs', kind: 'floor', footprint: [1, 1], parts: [part()] };
    const r = validateItem(bare);
    expect(r.ok && r.item).toMatchObject({ format: 1, name: 'Stool', blocks: true });
    const wall = validateItem({ ...itemDef('wall'), hang: undefined });
    expect(wall.ok && wall.item.hang).toBe(0.35);
    const rug = validateItem({ ...itemDef('floorart'), blocks: undefined });
    expect(rug.ok && rug.item.blocks).toBe(false);
  });

  it.each([
    ['not an object', null, ['bad-item']],
    ['an array', [], ['bad-item']],
    ['another format', { ...itemDef(), format: 2 }, ['bad-format']],
    ['an empty name', { ...itemDef(), name: '  ' }, ['bad-name']],
    ['a 33-character name', { ...itemDef(), name: 'x'.repeat(33) }, ['bad-name']],
    ['an unknown group', { ...itemDef(), group: 'toys' }, ['bad-group']],
    ['an unknown season', { ...itemDef(), season: 'monsoon' }, ['bad-season']],
    ['a seasonal item with no season', { ...itemDef(), group: 'seasonal' }, ['bad-season']],
    ['an unknown kind', { ...itemDef(), kind: 'ceiling' }, ['bad-kind']],
    ['a floor footprint of 5', { ...itemDef('floor'), footprint: [5, 1] }, ['bad-footprint']],
    ['a fractional floor footprint', { ...itemDef('floor'), footprint: [1.5, 1] }, ['bad-footprint']],
    ['a desk item footprint of 1.5', { ...itemDef('deskitem'), footprint: [1.5, 1] }, ['bad-footprint']],
    ['a desk item footprint of 0.3', { ...itemDef('deskitem'), footprint: [0.3, 0.5] }, ['bad-footprint']],
    ['a wall item deeper than a quarter', { ...itemDef('wall'), footprint: [0.5, 0.5] }, ['bad-footprint']],
    ['blocks on a desk item', { ...itemDef('deskitem'), blocks: true }, ['bad-blocks']],
    ['hang on a floor item', { ...itemDef('floor'), hang: 0.3 }, ['bad-hang']],
    ['hang of 0.9', { ...itemDef('wall'), hang: 0.9 }, ['bad-hang']],
    ['hang of 0.33', { ...itemDef('wall'), hang: 0.33 }, ['bad-hang']],
    ['no parts', { ...itemDef(), parts: [] }, ['no-parts']],
    ['a missing parts list', { ...itemDef(), parts: undefined }, ['no-parts']],
    ['25 parts', withParts('floor', Array.from({ length: 25 }, () => part())), ['too-many-parts']],
  ])('refuses %s', (_, raw, errors) => {
    expect(errorsOf(raw)).toEqual(errors);
  });

  it('names the part by its position', () => {
    expect(errorsOf(withParts('floor', [part(), part({ w: 0 })]))).toEqual(['bad-part:1']);
    expect(errorsOf(withParts('floor', [part({ x: 0.03 })]))).toEqual(['bad-part:0']); // not a multiple of 0.05
    expect(errorsOf(withParts('floor', [part(), part(), { ...part(), z: 'high' }]))).toEqual(['bad-part:2']);
    expect(errorsOf(withParts('floor', [part({ x: -0.05 })]))).toEqual(['bad-part:0']);
    expect(errorsOf(withParts('floor', [part(), part({ x: 0.6, w: 0.5 })]))).toEqual(['part-outside:1']);
    expect(errorsOf(withParts('floor', [part({ y: 0.6, d: 0.5 })]))).toEqual(['part-outside:0']);
    expect(errorsOf(withParts('floor', [part({ z: 0.9, h: 0.2 })]))).toEqual(['too-tall:0']);
    expect(errorsOf(withParts('floor', [part({ color: 'red' }), part({ color: '#12345' })]))).toEqual(['bad-color:0', 'bad-color:1']);
    expect(errorsOf(withParts('floor', [part({ pattern: 'glitter' as never })]))).toEqual(['bad-pattern:0']);
  });

  it('keeps to the limits exactly at the boundary', () => {
    expect(errorsOf(withParts('floor', Array.from({ length: 24 }, () => part())))).toEqual([]);
    expect(errorsOf({ ...itemDef('floor'), footprint: [4, 4], parts: [part({ w: 4, d: 4 })] })).toEqual([]);
    expect(errorsOf(withParts('floor', [part({ z: 0.8, h: 0.2 })]))).toEqual([]); // z + h of exactly 1
    expect(errorsOf(withParts('deskitem', [part({ w: 0.25, d: 0.25, z: 0.45, h: 0.15 })]))).toEqual([]); // exactly 0.6
    expect(errorsOf(withParts('deskitem', [part({ w: 0.25, d: 0.25, z: 0.45, h: 0.2 })]))).toEqual(['too-tall:0']);
    expect(errorsOf(withParts('floorart', [part({ w: 2, d: 1, h: 0.05 })]))).toEqual([]);
    expect(errorsOf(withParts('floorart', [part({ w: 2, d: 1, h: 0.1 })]))).toEqual(['too-tall:0']);
  });

  it('collects every problem, not just the first', () => {
    const errors = errorsOf({ ...itemDef(), name: '', group: 'x', parts: [part({ color: 'nope' })] });
    expect(errors).toEqual(['bad-name', 'bad-group', 'bad-color:0']);
  });

  it('tidies numbers to two decimals and lowercases colors', () => {
    const r = validateItem(withParts('floor', [part({ x: 0.15, color: '#AABBCC' })]));
    expect(r.ok && r.item.parts[0]).toMatchObject({ x: 0.15, color: '#aabbcc' });
  });
});

describe('clampItem', () => {
  const ok = (raw: unknown) => {
    const r = validateItem(clampItem(raw));
    expect(r.ok, JSON.stringify(r)).toBe(true);
    return (r as { ok: true; item: ItemDefinition }).item;
  };

  it('rounds to 0.05, cuts the name, fixes the pattern and the color, and turns a rescuable item valid', () => {
    const item = ok({ ...itemDef(), name: 'N'.repeat(40), parts: [{ ...part({ x: 0.123, w: 0.481 }), pattern: 'glitter', color: 'aabbcc' }] });
    expect(item.name).toHaveLength(32);
    expect(item.parts[0]).toMatchObject({ x: 0.1, w: 0.5, pattern: 'plain', color: '#aabbcc' });
  });

  it('moves a part that sticks out inside first, then shrinks what still does', () => {
    const moved = ok({ ...itemDef('floor'), parts: [part({ x: 0.8, w: 0.5 })] }); // would end at 1.3: moved to 0.5
    expect(moved.parts[0]).toMatchObject({ x: 0.5, w: 0.5 });
    const shrunk = ok({ ...itemDef('floor'), parts: [part({ x: 0, w: 3 })] });
    expect(shrunk.parts[0]).toMatchObject({ x: 0, w: 1 });
  });

  it('pulls heights into the limit of the kind and flattens floor art', () => {
    expect(ok({ ...itemDef('floor'), parts: [part({ z: 0.9, h: 0.6 })] }).parts[0].h).toBeCloseTo(0.1, 5);
    expect(ok({ ...itemDef('deskitem'), parts: [part({ w: 0.25, d: 0.25, h: 0.9 })] }).parts[0].h).toBeCloseTo(0.6, 5);
    expect(ok({ ...itemDef('floorart'), parts: [part({ w: 2, d: 1, h: 0.3 })] }).parts[0].h).toBeCloseTo(0.05, 5);
  });

  it('pulls footprints to the nearest allowed value', () => {
    expect(ok({ ...itemDef('floor'), footprint: [7, 0], parts: [part()] }).footprint).toEqual([4, 1]);
    expect(ok({ ...itemDef('deskitem'), footprint: [0.6, 2], parts: [part({ w: 0.25, d: 0.25, h: 0.1 })] }).footprint).toEqual([0.5, 1]);
  });

  it('never adds or removes parts, never throws, and leaves a hopeless item failing for a reason', () => {
    const many = { ...itemDef('floor'), parts: Array.from({ length: 30 }, () => part()) };
    expect((clampItem(many) as { parts: unknown[] }).parts).toHaveLength(30);
    expect(errorsOf(clampItem(many))).toEqual(['too-many-parts']);
    expect(() => clampItem(null)).not.toThrow();
    expect(() => clampItem({ parts: [null, 7, 'x'] })).not.toThrow();
    expect(errorsOf(clampItem({ name: 7, parts: [null] }))).not.toEqual([]);
    expect(errorsOf(clampItem('text'))).toEqual(['bad-item']);
  });
});
