import { describe, expect, it } from 'vitest';
import { builtInCatalog } from '../../shared/catalog';
import { compileWorld } from '../../shared/world';
import { clipNear, makeCam, objectMesh, toCamera, visibleFaces, worldMeshes, type CamVert, type Face } from '../../src/mesh3d';
import { emptyLayout, smallOffice, withObject } from './fixtures/layouts';

const meshOf = (rot: 0 | 1 | 2 | 3, kind = 'desk', x = 4, y = 4) => {
  const w = compileWorld(withObject(emptyLayout(), { id: 'o', kind, x, y, rot }), builtInCatalog());
  return objectMesh(w.objects[0]);
};
const extent = (faces: Face[]) => {
  const xs = faces.flatMap((f) => f.pts.map((p) => p.x)), ys = faces.flatMap((f) => f.pts.map((p) => p.y));
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
};

describe('object meshes', () => {
  it('makes five faces per box (the bottom is never seen)', () => {
    const item = builtInCatalog().get('desk')!;
    expect(meshOf(0).faces).toHaveLength(item.model.length * 5);
  });

  it('keeps a turned 3×1 desk inside its footprint, swapped to 1×3', () => {
    const flat = extent(meshOf(0, 'desk', 4, 4).faces);
    expect([flat.x1 - flat.x0, flat.y1 - flat.y0].map((n) => Math.round(n * 100) / 100)).toEqual([3, 0.9]);
    expect(flat.x0).toBeGreaterThanOrEqual(4);
    expect(flat.x1).toBeLessThanOrEqual(7);
    // Turned a quarter, it is placed by the compiler with its corner at (x, y) as a 1×3.
    const w = compileWorld(withObject(emptyLayout(), { id: 'o', kind: 'desk', x: 5, y: 3, rot: 1 }), builtInCatalog());
    const e = extent(objectMesh(w.objects[0]).faces);
    expect(e.x0).toBeGreaterThanOrEqual(5);
    expect(e.x1).toBeLessThanOrEqual(6);
    expect(e.y0).toBeGreaterThanOrEqual(3);
    expect(e.y1).toBeLessThanOrEqual(6);
    expect(e.y1 - e.y0).toBeGreaterThan(2.5);
  });

  it('turns the front: the desk monitor faces south at 0, west at 1, north at 2, east at 3', () => {
    const front = (rot: 0 | 1 | 2 | 3) => meshOf(rot).faces.find((f) => f.mat === 'screen')!.n;
    expect(front(0)).toMatchObject({ x: 0, y: 1 });
    expect(front(1)).toMatchObject({ x: -1, y: 0 });
    expect(front(2)).toMatchObject({ x: 0, y: -1 });
    expect(front(3)).toMatchObject({ x: 1, y: 0 });
  });

  it('shades tops brightest and east–west sides darkest', () => {
    const faces = meshOf(0, 'table').faces;
    expect(Math.max(...faces.map((f) => f.shade))).toBe(1);
    expect(faces.find((f) => f.n.x !== 0)!.shade).toBeLessThan(faces.find((f) => f.n.y !== 0)!.shade);
  });

  it('builds one mesh per object in a world', () => {
    const w = compileWorld(smallOffice(), builtInCatalog());
    expect(worldMeshes(w)).toHaveLength(w.objects.length);
  });
});

describe('visibility and projection', () => {
  it('drops faces that point away from the eye', () => {
    const faces = meshOf(0, 'table').faces;
    const south = visibleFaces(faces, 4.5, 10, 0.1);
    expect(south.some((f) => f.n.y === 1)).toBe(true);
    expect(south.some((f) => f.n.y === -1)).toBe(false);
    expect(south.some((f) => f.n.z === 1)).toBe(false); // an eye below the table top never sees the top
    expect(visibleFaces(faces, 4.5, 4.5, 5).some((f) => f.n.z === 1)).toBe(true);
  });

  it('puts a point straight ahead on the centre column and gives its depth', () => {
    const cam = makeCam(10, 10, 0, 0.66); // looking east
    const p = toCamera(cam, { x: 12, y: 10, z: 0 });
    expect(p.tx).toBeCloseTo(0, 6);
    expect(p.ty).toBeCloseTo(2, 6);
    expect(toCamera(cam, { x: 12, y: 11, z: 0 }).tx).toBeGreaterThan(0); // south is to the right when facing east
  });

  it('cuts a polygon at the near plane so every corner is in front', () => {
    const poly: CamVert[] = [
      { tx: -1, ty: -1, z: 0, u: 0, v: 0 }, { tx: 1, ty: -1, z: 0, u: 1, v: 0 },
      { tx: 1, ty: 3, z: 1, u: 1, v: 1 }, { tx: -1, ty: 3, z: 1, u: 0, v: 1 },
    ];
    const cut = clipNear(poly, 0.15);
    expect(cut.length).toBeGreaterThanOrEqual(3);
    expect(cut.every((p) => p.ty >= 0.15 - 1e-9)).toBe(true);
    expect(cut.some((p) => Math.abs(p.ty - 0.15) < 1e-9)).toBe(true);
    // Attributes are interpolated: a corner on the near plane lies between the two ends.
    const edge = cut.find((p) => p.ty === 0.15 && p.tx > 0)!;
    expect(edge.v).toBeGreaterThan(0);
    expect(edge.v).toBeLessThan(1);
    expect(clipNear(poly.map((p) => ({ ...p, ty: -2 })), 0.15)).toEqual([]);
  });
});

import { afterEach, beforeEach } from 'vitest';
import { currentCatalog } from '../../shared/catalog';
import { normalizeLayout } from '../../shared/layout';
import { itemDef, part, withItems } from './fixtures/items';

describe('desk items and wall decor in first person', () => {
  let restore: () => void;
  beforeEach(() => {
    restore = withItems([
      { id: 'lamp', def: itemDef('deskitem', { name: 'Lamp', footprint: [0.5, 0.5], parts: [part({ w: 0.25, d: 0.25, x: 0.125, y: 0.125, h: 0.3, pattern: 'metal' })] }) },
      { id: 'poster', def: itemDef('wall', { name: 'Poster', footprint: [0.5, 0.25], hang: 0.4, parts: [part({ w: 0.5, d: 0.05, h: 0.4, pattern: 'paper' })] }) },
    ]);
  });
  afterEach(() => restore());

  const compile = (objs: Parameters<typeof withObject>[1][]) =>
    compileWorld(normalizeLayout(objs.reduce((acc, o) => withObject(acc, o), emptyLayout()), currentCatalog()).layout, currentCatalog());
  const lampOn = (rot: 0 | 1 | 2 | 3) => compile([{ id: 'd', kind: 'desk', x: 4, y: 4, rot }, { id: 'l', kind: 'item:lamp', x: 0, y: 0, rot: 0, on: 'd', at: [1, 0.25] }]);

  it('stands a lamp on the desk top and groups it with the desk', () => {
    const world = lampOn(0);
    const meshes = worldMeshes(world);
    expect(meshes.map((m) => m.id)).toEqual(['d']); // one mesh for the desk and the lamp
    const lampFaces = meshes[0].faces.filter((f) => f.mat === 'm:metal:c0c0c0');
    expect(lampFaces.length).toBe(5);
    const bottoms = lampFaces.flatMap((f) => f.pts.map((p) => p.z));
    expect(Math.min(...bottoms)).toBeCloseTo(0.31, 5);
    expect(Math.max(...bottoms)).toBeCloseTo(0.61, 5);
  });

  it('turns the lamp with the desk', () => {
    const where = (rot: 0 | 1 | 2 | 3) => {
      const faces = worldMeshes(lampOn(rot))[0].faces.filter((f) => f.mat === 'm:metal:c0c0c0');
      const xs = faces.flatMap((f) => f.pts.map((p) => p.x)), ys = faces.flatMap((f) => f.pts.map((p) => p.y));
      return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
    };
    // Lamp centre in the desk's frame: (1.25, 0.5). Upright: 4 + 1.25, 4 + 0.5. Half turn on a 3×1 desk: 4 + 3 - 1.25, 4 + 1 - 0.5.
    expect(where(0)).toEqual({ x: 5.25, y: 4.5 });
    expect(where(2).x).toBeCloseTo(5.75, 5);
    expect(where(2).y).toBeCloseTo(4.5, 5);
    const q = where(1);
    expect(q.x).toBeCloseTo(4 + 1 - 0.5, 5);
    expect(q.y).toBeCloseTo(4 + 1.25, 5);
  });

  it('hangs a poster against the face of its wall, facing out of the room, at its hang height', () => {
    // The top wall (y = 0) faces south into the room; the bottom wall (y = 11) faces north; the left wall (x = 0) faces east; the right (x = 15) west.
    const south = worldMeshes(compile([{ id: 'p', kind: 'item:poster', x: 5, y: 0, rot: 0, wall: 's' }]))[0];
    const front = south.faces.find((f) => f.n.y === 1)!; // the face people see points south
    expect(front.pts[0].y).toBeGreaterThan(1); // beyond the wall's south edge (y = 1)
    expect(front.pts[0].y).toBeLessThan(1.3);
    expect(Math.min(...south.faces.flatMap((f) => f.pts.map((p) => p.z)))).toBeCloseTo(0.4, 5);
    expect(Math.max(...south.faces.flatMap((f) => f.pts.map((p) => p.z)))).toBeCloseTo(0.8, 5);
    const north = worldMeshes(compile([{ id: 'p', kind: 'item:poster', x: 5, y: 11, rot: 0, wall: 'n' }]))[0];
    expect(north.faces.find((f) => f.n.y === -1)!.pts[0].y).toBeLessThan(11);
    const east = worldMeshes(compile([{ id: 'p', kind: 'item:poster', x: 0, y: 5, rot: 0, wall: 'e' }]))[0];
    expect(east.faces.find((f) => f.n.x === 1)!.pts[0].x).toBeGreaterThan(1);
    const west = worldMeshes(compile([{ id: 'p', kind: 'item:poster', x: 15, y: 5, rot: 0, wall: 'w' }]))[0];
    expect(west.faces.find((f) => f.n.x === -1)!.pts[0].x).toBeLessThan(15);
  });

  it('draws nothing for floor art', () => {
    const restoreArt = withItems([{ id: 'rug', def: itemDef('floorart') }]);
    const w = compile([{ id: 'r', kind: 'item:rug', x: 4, y: 4, rot: 0 }]);
    expect(worldMeshes(w)).toEqual([]);
    restoreArt();
  });
});
