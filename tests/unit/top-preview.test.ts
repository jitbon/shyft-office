import { describe, expect, it } from 'vitest';
import { newDesign, setFootprint, setPart } from '../../src/studio/model';
import { partAt, pointToTile, topLayout } from '../../src/studio/top-preview';

describe('the top-down preview maths', () => {
  it('scales small footprints up and large ones to fit', () => {
    const small = topLayout(newDesign('deskitem'));
    const large = topLayout(setFootprint(newDesign('floor'), [4, 4]));
    expect(small.tilePx).toBeGreaterThan(large.tilePx);
    expect(large.width).toBeLessThanOrEqual(400);
  });

  it('turns a click into a place on the footprint, and back to the footprint corner', () => {
    const l = topLayout(newDesign('floor'));
    expect(pointToTile(l, l.ox, l.oy)).toEqual([0, 0]);
    const [tx, ty] = pointToTile(l, l.ox + l.tilePx / 2, l.oy + l.tilePx / 4);
    expect(tx).toBeCloseTo(0.5, 5);
    expect(ty).toBeCloseTo(0.25, 5);
  });

  it('finds the part on top at a place, or none', () => {
    let d = newDesign('floor');
    d = { ...d, parts: [{ ...d.parts[0], x: 0, y: 0, w: 1, d: 1 }, { ...d.parts[0], x: 0.25, y: 0.25, w: 0.5, d: 0.5 }] };
    expect(partAt(d, 0.5, 0.5)).toBe(1);
    expect(partAt(d, 0.1, 0.1)).toBe(0);
    expect(partAt(setPart(d, 0, { x: 0.5, w: 0.5 }), 0.05, 0.9)).toBeNull();
  });
});
