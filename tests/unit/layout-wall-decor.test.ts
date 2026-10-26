import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { currentCatalog } from '../../shared/catalog';
import { normalizeLayout, type Layout, type PlacedObject } from '../../shared/layout';
import { compileWorld } from '../../shared/world';
import { itemDef, withItems } from './fixtures/items';
import { emptyLayout, withObject, withWall } from './fixtures/layouts';

let restore: () => void;
beforeEach(() => {
  restore = withItems([{ id: 'poster', def: itemDef('wall', { name: 'Poster' }) }]);
});
afterEach(() => restore());

const poster = (x: number, y: number, wall: 'n' | 'e' | 's' | 'w', id = 'p1'): PlacedObject => ({ id, kind: 'item:poster', x, y, rot: 0, wall });
const world = (l: Layout) => compileWorld(normalizeLayout(l, currentCatalog()).layout, currentCatalog());

describe('wall decor in the world', () => {
  it('is exposed with its wall tile and face, and does not block anything', () => {
    const plain = compileWorld(emptyLayout(), currentCatalog());
    const w = world(withObject(emptyLayout(), poster(5, 0, 's')));
    expect(w.wallDecor).toHaveLength(1);
    expect(w.wallDecor[0]).toMatchObject({ x: 5, y: 0, face: 's' });
    expect(w.wallDecor[0].item.id).toBe('item:poster');
    expect(Array.from(w.block)).toEqual(Array.from(plain.block));
    expect(w.grid).toEqual(plain.grid);
    expect(w.objects).toEqual([]);
  });

  it('is removed when its wall is erased', () => {
    const l = withObject(emptyLayout(), poster(5, 0, 's'));
    const erased = withWall(l, 5, 0, ' ');
    const r = normalizeLayout(erased, currentCatalog());
    expect(r.layout.objects).toEqual([]);
    expect(r.removed).toEqual([{ id: 'p1', why: 'no-wall' }]);
  });

  it('is removed when its face stops bordering open floor', () => {
    // Walling in the floor tile below the poster means the south face now looks at a wall.
    const l = withWall(withObject(emptyLayout(), poster(5, 0, 's')), 5, 1, '#');
    expect(normalizeLayout(l, currentCatalog()).layout.objects).toEqual([]);
  });

  it('can hang on any face of a pillar that borders floor', () => {
    let l = emptyLayout();
    l = withWall(l, 8, 5, '#');
    l = withObject(l, poster(8, 5, 'e', 'east'));
    l = withObject(l, poster(8, 5, 'w', 'west'));
    l = withObject(l, poster(8, 5, 'n', 'north'));
    l = withObject(l, poster(8, 5, 's', 'south'));
    expect(world(l).wallDecor.map((d) => d.face).sort()).toEqual(['e', 'n', 's', 'w']);
  });
});
