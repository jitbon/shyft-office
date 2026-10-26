import { describe, expect, it } from 'vitest';
import { itemHeight, partsToBoxes, styleMat } from '../../shared/items';
import { itemDef, part } from './fixtures/items';

describe('partsToBoxes', () => {
  it('makes one box per part with its position, size and material name', () => {
    const def = itemDef('floor', { parts: [part({ x: 0.1, y: 0.2, z: 0.05, w: 0.4, d: 0.3, h: 0.25, pattern: 'wood', color: '#AABBCC' })] });
    expect(partsToBoxes(def)).toEqual([{ x: 0.1, y: 0.2, z: 0.05, w: 0.4, d: 0.3, h: 0.25, mat: 'm:wood:aabbcc' }]);
    expect(styleMat('leaf', '#00ff00')).toBe('m:leaf:00ff00');
  });

  it('gives 24 boxes for 24 parts, all inside the footprint, for every kind of fixture', () => {
    const many = itemDef('floor', { parts: Array.from({ length: 24 }, (_, i) => part({ x: (i % 2) * 0.5 })) });
    expect(partsToBoxes(many)).toHaveLength(24);
    for (const kind of ['floor', 'deskitem', 'wall', 'floorart'] as const) {
      const def = itemDef(kind);
      for (const b of partsToBoxes(def)) {
        expect(b.x + b.w).toBeLessThanOrEqual(def.footprint[0] + 1e-9);
        expect(b.y + b.d).toBeLessThanOrEqual(def.footprint[1] + 1e-9);
      }
    }
  });

  it('measures the height as the highest top', () => {
    expect(itemHeight(itemDef('floor', { parts: [part({ z: 0, h: 0.3 }), part({ z: 0.3, h: 0.4 })] }))).toBeCloseTo(0.7, 9);
  });
});
