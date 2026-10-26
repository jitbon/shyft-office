// Floor art is part of the floor: for every floor cell it covers, the cell's texture is the floor with the matching
// slice of the art painted over it. Both views use the same cells, so art is always under people and furniture, never
// fights with their feet, and costs nothing per frame.
import type { World } from '../shared/world';
import type { Texture } from './art';
import { paintFlat } from './item2d';

const PX = 32;
const slices = new Map<string, { w: number; h: number; px: Uint32Array }>();

function flat(item: Parameters<typeof paintFlat>[0], rot: 0 | 1 | 2 | 3) {
  const key = `${item.id}@${item.version}/${rot}`;
  let s = slices.get(key);
  if (!s) {
    const f = paintFlat(item, rot);
    s = { w: f.w, h: f.h, px: new Uint32Array(f.rgba.buffer) };
    slices.set(key, s);
  }
  return s;
}

/** The floor texture of cell (x, y): `base` itself when no art covers it, otherwise a copy with the art over it, in list order. */
export function bakedFloorCell(world: World, x: number, y: number, base: Texture): Texture {
  let out: Texture | null = null;
  for (const a of world.floorArt) {
    if (x < a.x || y < a.y || x >= a.x + a.w || y >= a.y + a.d) continue;
    const pic = flat(a.item, a.rot);
    out ??= { w: base.w, h: base.h, data: base.data.slice() };
    const sx = (x - a.x) * PX, sy = (y - a.y) * PX;
    for (let j = 0; j < base.h; j++) {
      for (let i = 0; i < base.w; i++) {
        const c = pic.px[(sy + j) * pic.w + (sx + i)];
        if (c >>> 24) out.data[j * base.w + i] = c;
      }
    }
  }
  return out ?? base;
}
