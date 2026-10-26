import { describe, expect, it } from 'vitest';
import { validateItem } from '../../shared/items';
import {
  SHAPES, addPart, deletePart, duplicatePart, mirrorPart, movePart, newDesign, problemsOf, reorderPart, resizePart, setBlocks,
  setFootprint, setGroup, setHang, setKind, setPart, setSeason,
} from '../../src/studio/model';

describe('a new design', () => {
  it('is valid for every kind', () => {
    for (const kind of ['floor', 'deskitem', 'wall', 'floorart'] as const) expect(problemsOf(newDesign(kind)), kind).toEqual([]);
  });
});

describe('adding, copying and removing parts', () => {
  it('adds each ready shape as a valid part on top, up to 24', () => {
    let d = newDesign('floor');
    for (const shape of SHAPES) {
      const r = addPart(d, shape);
      expect(r.index).toBe(d.parts.length);
      d = r.design;
      expect(problemsOf(d), shape).toEqual([]);
    }
    expect(d.parts).toHaveLength(1 + SHAPES.length);
    while (d.parts.length < 24) d = addPart(d, 'box').design;
    expect(addPart(d, 'box').design.parts).toHaveLength(24);
    expect(problemsOf(d)).toEqual([]);
  });

  it('adds parts that fit even on a small desk item', () => {
    let d = newDesign('deskitem');
    for (const shape of SHAPES) d = addPart(d, shape).design;
    expect(problemsOf(d)).toEqual([]);
  });

  it('duplicates just after the original, deletes, and reorders', () => {
    let d = addPart(newDesign('floor'), 'post').design;
    const dup = duplicatePart(d, 0);
    expect(dup.index).toBe(1);
    expect(dup.design.parts).toHaveLength(3);
    expect(dup.design.parts[1]).toMatchObject({ pattern: d.parts[0].pattern, color: d.parts[0].color });
    expect(dup.design.parts[1].x).not.toBe(dup.design.parts[0].x);
    expect(deletePart(dup.design, 1).parts).toHaveLength(2);
    const re = reorderPart(d, 0, 1);
    expect(re.index).toBe(1);
    expect(re.design.parts[1]).toEqual(d.parts[0]);
    expect(reorderPart(d, 0, -1).design).toBe(d);
  });

  it('never changes the design it was given', () => {
    const d = newDesign('floor');
    const copy = structuredClone(d);
    addPart(d, 'box'); duplicatePart(d, 0); mirrorPart(d, 0); movePart(d, 0, 1, 1); resizePart(d, 0, 1, 1); setKind(d, 'floorart');
    expect(d).toEqual(copy);
  });
});

describe('mirroring', () => {
  it('adds a twin at footprint − x − w', () => {
    let d = newDesign('floor');
    d = setFootprint(d, [2, 1]);
    d = setPart(d, 0, { x: 0.1, w: 0.2 });
    const m = mirrorPart(d, 0);
    expect(m.added).toBe(true);
    expect(m.design.parts[1].x).toBeCloseTo(2 - 0.1 - 0.2, 5);
    expect(m.design.parts[1]).toMatchObject({ w: 0.2, pattern: d.parts[0].pattern });
  });

  it('adds nothing for a part that is already in the middle', () => {
    const d = setPart(setFootprint(newDesign('floor'), [2, 1]), 0, { x: 0.75, w: 0.5 });
    expect(mirrorPart(d, 0).added).toBe(false);
  });
});

describe('moving and resizing in 0.05 steps', () => {
  it('stays inside the footprint', () => {
    let d = newDesign('floor');
    d = movePart(d, 0, 5, 5);
    expect(d.parts[0].x + d.parts[0].w).toBeCloseTo(1, 5);
    expect(d.parts[0].y + d.parts[0].d).toBeCloseTo(1, 5);
    d = movePart(d, 0, -5, -5);
    expect(d.parts[0]).toMatchObject({ x: 0, y: 0 });
    d = resizePart(d, 0, 5, 5);
    expect(d.parts[0].w).toBe(1);
    d = resizePart(d, 0, -5, -5, -5);
    expect(d.parts[0]).toMatchObject({ w: 0.05, d: 0.05, h: 0.05 });
    expect(problemsOf(d)).toEqual([]);
  });

  it('moves by exactly 0.05 and rounds a sloppy number', () => {
    const d = movePart(newDesign('floor'), 0, 0.05, 0);
    expect(d.parts[0].x).toBeCloseTo(0.3, 5);
    expect(setPart(d, 0, { x: 0.123 }).parts[0].x).toBeCloseTo(0.1, 5);
  });

  it('keeps a part under the height limit of the kind', () => {
    const d = setPart(newDesign('deskitem'), 0, { z: 5, h: 5 });
    expect(d.parts[0].z + d.parts[0].h).toBeLessThanOrEqual(0.6 + 1e-9);
  });
});

describe('changing the kind', () => {
  it('flattens parts when it becomes floor art, and says so', () => {
    const r = setKind(newDesign('floor'), 'floorart');
    expect(r.design.kind).toBe('floorart');
    expect(r.design.parts.every((p) => p.h === 0.05 && p.z === 0)).toBe(true);
    expect(r.notes).toContain('Parts were flattened to 0.05 thick.');
    expect(problemsOf(r.design)).toEqual([]);
  });

  it('follows the limits of each new kind', () => {
    let d = setFootprint(newDesign('floor'), [3, 2]);
    d = addPart(d, 'slab').design;
    for (const kind of ['deskitem', 'wall', 'floor', 'floorart'] as const) {
      const r = setKind(d, kind);
      expect(problemsOf(r.design), kind).toEqual([]);
      d = r.design;
    }
  });

  it('sets blocks only on floor items and hang only on wall items', () => {
    expect(setBlocks(newDesign('deskitem'), true)).toEqual(newDesign('deskitem'));
    expect(setBlocks(newDesign('floor'), false).blocks).toBe(false);
    expect(setHang(newDesign('floor'), 0.5)).toEqual(newDesign('floor'));
    expect(setHang(newDesign('wall'), 0.52).hang).toBeCloseTo(0.5, 5);
  });

  it('asks for a season for a seasonal item', () => {
    const d = setGroup(newDesign('floor'), 'seasonal');
    expect(d.season).toBe('winter');
    expect(problemsOf(d)).toEqual([]);
    expect(problemsOf(setSeason(d, undefined))).toEqual(['bad-season']);
  });
});

describe('the live problem list', () => {
  it('equals what validateItem says', () => {
    const bad = { ...newDesign('floor'), name: '', parts: [] };
    const r = validateItem(bad);
    expect(problemsOf(bad)).toEqual(r.ok ? [] : r.errors);
    expect(problemsOf(bad)).toEqual(['bad-name', 'no-parts']);
  });

  it('shrinks parts into a smaller footprint', () => {
    const d = setFootprint(setPart(setFootprint(newDesign('floor'), [3, 1]), 0, { x: 2, w: 1 }), [1, 1]);
    expect(problemsOf(d)).toEqual([]);
  });
});

import { builtInCatalog } from '../../shared/catalog';
import { customCatalogItem } from '../../shared/objects';
import { designFromItem } from '../../src/studio/model';

describe('starting from existing furniture', () => {
  it('turns every built-in piece into a valid design with parts', () => {
    for (const id of ['desk', 'desk-small', 'chair', 'table', 'plant', 'sofa']) {
      const d = designFromItem(builtInCatalog().get(id)!);
      expect(problemsOf(d), id).toEqual([]);
      expect(d.parts.length, id).toBeGreaterThan(0);
      expect(d.name).toMatch(/ copy$/);
    }
  });

  it('turns an uploaded object into one box of its footprint (as tall as designs may be)', () => {
    const o = customCatalogItem({ id: 'vend', name: 'Vending machine', footprint: [2, 1], height: 64, blocks: true, frames: 1, fps: 4, back: false, url: '/x.png' });
    const d = designFromItem(o);
    expect(problemsOf(d)).toEqual([]);
    expect(d.parts).toHaveLength(1);
    expect(d.parts[0]).toMatchObject({ w: 2, d: 1, h: 1 });
  });
});
