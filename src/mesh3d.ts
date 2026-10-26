// Solid furniture for the first-person view: every object's box model, turned and placed in the world, as faces a
// renderer can draw. Pure maths (no canvas), so it can be tested. Map units are tiles; x and y are on the floor
// (y grows south), z is height above it, and a wall is one tile tall.
import type { Box } from '../shared/catalog';
import { turnPoint } from '../shared/layout';
import type { WallDecorPiece, World, WorldObject } from '../shared/world';

export interface V3 {
  x: number;
  y: number;
  z: number;
}

export interface Face {
  /** Corners as seen from outside: top-left, top-right, bottom-right, bottom-left. */
  pts: [V3, V3, V3, V3];
  /** Texture coordinates of the corners. A coordinate of 2 repeats the texture twice. */
  uv: [[number, number], [number, number], [number, number], [number, number]];
  mat: string;
  /** Light on this face: tops are brightest, east and west sides darkest. */
  shade: number;
  /** Outward direction. */
  n: V3;
}

export interface ObjectMesh {
  id: string;
  /** Centre on the floor, for culling. */
  cx: number;
  cy: number;
  faces: Face[];
  /** Small decoration: not worth drawing as far away as furniture. */
  minor?: boolean;
}

type Rot = 0 | 1 | 2 | 3;

/** Local frame (footprint fw×fd, facing south) to the map after `rot` clockwise quarter turns. */
export const turn = (lx: number, ly: number, fw: number, fd: number, rot: Rot): [number, number] => turnPoint(lx, ly, fw, fd, rot);

const repeatOf = (extent: number) => Math.max(1, Math.round(extent));

function faceShade(n: V3): number {
  if (n.z > 0.5) return 1;
  return Math.abs(n.y) > Math.abs(n.x) ? 0.85 : 0.72;
}

/** The five visible faces of a box (the bottom is never seen), as drawn from outside. */
function boxFaces(b: Box, fw: number, fd: number, rot: Rot, ox: number, oy: number): Face[] {
  const mat = (side: 'top' | 'side' | 'front' | 'back' | 'east' | 'west') => {
    if (typeof b.mat === 'string') return b.mat;
    return (side === 'back' || side === 'east' || side === 'west' ? b.mat[side] : undefined) ?? b.mat[side === 'back' || side === 'east' || side === 'west' ? 'side' : side];
  };
  const x0 = b.x, x1 = b.x + b.w, y0 = b.y, y1 = b.y + b.d, z0 = b.z, z1 = b.z + b.h;
  const at = (lx: number, ly: number, z: number): V3 => {
    const [tx, ty] = turn(lx, ly, fw, fd, rot);
    return { x: ox + tx, y: oy + ty, z };
  };
  const dir = (dx: number, dy: number): V3 => {
    const [tx, ty] = turn(dx, dy, 0, 0, rot);
    return { x: tx, y: ty, z: 0 };
  };
  const rep = (u: number, v: number): [[number, number], [number, number], [number, number], [number, number]] => [[0, 0], [u, 0], [u, v], [0, v]];
  const mk = (pts: [V3, V3, V3, V3], n: V3, m: string, ru: number, rv: number): Face => ({ pts, uv: rep(ru, rv), mat: m, shade: faceShade(n), n });
  const rp = (extent: number) => (b.stretch ? 1 : repeatOf(extent));
  const rh = rp(b.h);
  return [
    // top: seen from above with north up, so left is west and the top edge is north
    mk([at(x0, y0, z1), at(x1, y0, z1), at(x1, y1, z1), at(x0, y1, z1)], { x: 0, y: 0, z: 1 }, mat('top'), rp(b.w), rp(b.d)),
    // south (the front): left is west
    mk([at(x0, y1, z1), at(x1, y1, z1), at(x1, y1, z0), at(x0, y1, z0)], { ...dir(0, 1) }, mat('front'), rp(b.w), rh),
    // north: left is east
    mk([at(x1, y0, z1), at(x0, y0, z1), at(x0, y0, z0), at(x1, y0, z0)], { ...dir(0, -1) }, mat('back'), rp(b.w), rh),
    // east: left is south
    mk([at(x1, y1, z1), at(x1, y0, z1), at(x1, y0, z0), at(x1, y1, z0)], { ...dir(1, 0) }, mat('east'), rp(b.d), rh),
    // west: left is north
    mk([at(x0, y0, z1), at(x0, y1, z1), at(x0, y1, z0), at(x0, y0, z0)], { ...dir(-1, 0) }, mat('west'), rp(b.d), rh),
  ];
}

/** Boxes of `item` turned `rot`, with its footprint's top-left corner at (x, y) and its base `lift` above the floor. */
export function itemFaces(item: { footprint: readonly [number, number]; model: Box[] }, rot: Rot, x: number, y: number, lift: number): Face[] {
  const [fw, fd] = item.footprint;
  const faces: Face[] = [];
  for (const b of item.model) faces.push(...boxFaces(lift ? { ...b, z: b.z + lift } : b, fw, fd, rot, x, y));
  return faces;
}

/** The solid shape of one placed object, turned to face as it does on the map. */
export function objectMesh(o: WorldObject): ObjectMesh {
  return { id: o.obj.id, cx: o.x + o.w / 2, cy: o.y + o.d / 2, faces: itemFaces(o.item, o.obj.rot, o.x, o.y, 0) };
}

/** How far decor stands out from the wall it hangs on, in tiles (so it is never inside the wall's own face). */
const WALL_GAP = 0.02;

/** The shape of wall decor: against the face of its wall tile, turned to face out of the room. */
export function wallDecorMesh(d: WallDecorPiece): ObjectMesh {
  const [fw, fd] = d.item.footprint;
  const hang = d.item.hang ?? 0.35;
  // South faces south (not turned), west faces west (one turn), north (two), east (three).
  const rot = ({ s: 0, w: 1, n: 2, e: 3 } as const)[d.face];
  let x = 0, y = 0;
  if (d.face === 's') [x, y] = [d.x + 0.5 - fw / 2, d.y + 1 + WALL_GAP];
  else if (d.face === 'n') [x, y] = [d.x + 0.5 - fw / 2, d.y - WALL_GAP - fd];
  else if (d.face === 'e') [x, y] = [d.x + 1 + WALL_GAP, d.y + 0.5 - fw / 2];
  else [x, y] = [d.x - WALL_GAP - fd, d.y + 0.5 - fw / 2];
  return { id: d.obj.id, cx: d.x + 0.5, cy: d.y + 0.5, faces: itemFaces(d.item, rot, x, y, hang), minor: fw <= 0.5 };
}

/**
 * Every object with a shape. A desk and the things on it are one mesh, so one distance test culls them together.
 * Floor art has no shape: it is part of the floor. Built once per world, not every frame.
 */
export function worldMeshes(world: World): ObjectMesh[] {
  const meshes = world.objects.filter((o) => o.item.model.length).map(objectMesh);
  const byHost = new Map(meshes.map((m) => [m.id, m]));
  for (const d of world.deskItems) {
    const host = byHost.get(d.host.obj.id);
    if (host) host.faces.push(...itemFaces(d.item, d.rot, d.x, d.y, d.z));
  }
  for (const d of world.wallDecor) meshes.push(wallDecorMesh(d));
  return meshes;
}

/** Faces that point toward the eye; the others are on the far side and never seen. */
export function visibleFaces(faces: readonly Face[], ex: number, ey: number, ez: number): Face[] {
  return faces.filter((f) => {
    const c = f.pts[0], d = f.pts[2];
    const mx = (c.x + d.x) / 2 - ex, my = (c.y + d.y) / 2 - ey, mz = (c.z + d.z) / 2 - ez;
    return f.n.x * mx + f.n.y * my + f.n.z * mz < 0;
  });
}

// ------------------------------------------------------------------ camera

export interface Cam {
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  planeX: number;
  planeY: number;
  invDet: number;
}

/** The same camera the wall caster uses: facing `a`, with a plane that sets the field of view. */
export function makeCam(x: number, y: number, a: number, plane: number): Cam {
  const dirX = Math.cos(a), dirY = Math.sin(a);
  const planeX = -dirY * plane, planeY = dirX * plane;
  return { x, y, dirX, dirY, planeX, planeY, invDet: 1 / (planeX * dirY - dirX * planeY) };
}

/** A corner in camera space: `tx` across the view, `ty` the depth, `z` the height. `u`, `v` ride along. */
export interface CamVert {
  tx: number;
  ty: number;
  z: number;
  u: number;
  v: number;
}

export function toCamera(c: Cam, p: V3, u = 0, v = 0): CamVert {
  const dx = p.x - c.x, dy = p.y - c.y;
  return { tx: c.invDet * (c.dirY * dx - c.dirX * dy), ty: c.invDet * (-c.planeY * dx + c.planeX * dy), z: p.z, u, v };
}

/** Cuts a polygon at the near plane: every corner left has depth of at least `near`. */
export function clipNear(poly: readonly CamVert[], near: number): CamVert[] {
  const out: CamVert[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ain = a.ty >= near, bin = b.ty >= near;
    if (ain) out.push(a);
    if (ain !== bin) {
      const t = (near - a.ty) / (b.ty - a.ty);
      out.push({ tx: a.tx + (b.tx - a.tx) * t, ty: near, z: a.z + (b.z - a.z) * t, u: a.u + (b.u - a.u) * t, v: a.v + (b.v - a.v) * t });
    }
  }
  return out;
}
