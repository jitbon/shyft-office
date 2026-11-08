// What a tile's floor, walls and ceiling look like, for both views: the paint and theme that apply (shared/world.ts) turned into
// pixels (src/finish.ts). The top-down view draws a tile from `floorPixels`; the first-person view samples the same finish by world
// position, so one painted room looks the same from above and from inside.
import type { Face } from '../shared/layout';
import { themeById, themeWallPaint } from '../shared/themes';
import { FACE_STEP } from '../shared/layout';
import type { World } from '../shared/world';
import { TEX, paintWallFace, withPalette, type Texture } from './art';
import { cellTexture, finishPixels } from './finish';
import { PALETTE, paletteFor, type Palette } from './palette';
import { PixelCtx, asCtx } from './pixelctx';
import { paintCeiling } from './art';
import { compose, seasonLayer } from './seasonal';
import type { Season } from '../shared/season';

/** The palette that applies at a tile. */
export const paletteAt = (world: World, x: number, y: number): Palette => paletteFor(themeById(world.styleAt(x, y)));

/** The picture of the floor at a tile for the top-down view. */
export function floorPixels(world: World, x: number, y: number): Texture {
  const p = world.paintAt(x, y, 'floor');
  return finishPixels(p.finish, p.color, x, y);
}

/** The picture of the floor at a tile for first person. */
export function floorCell(world: World, x: number, y: number): Texture {
  const p = world.paintAt(x, y, 'floor');
  return cellTexture(p.finish, p.color, x, y);
}

const specialCache = new Map<string, Texture>();
/** A window, board, shelf or counter wall face in a theme's colors, 32 tall. */
export function specialFace(themeId: string, kind: string): Texture {
  const key = `${themeId}|${kind}`;
  let t = specialCache.get(key);
  if (!t) {
    const ctx = new PixelCtx(TEX, TEX);
    withPalette(paletteFor(themeById(themeId)), () => paintWallFace(asCtx(ctx), kind, 0, 0, TEX));
    t = ctx.texture();
    specialCache.set(key, t);
  }
  return t;
}

let currentSeason: Season | null = null;
/** The season the server says it is. Seasonal touches show only in an office that has them switched on. */
export function setSeason(s: Season | null) {
  currentSeason = s;
}
/** The season whose touches to draw in this world, or null when it has none switched on. */
export const seasonIn = (world: World): Season | null => (world.layout.seasonal === true ? currentSeason : null);

const touched = new WeakMap<Texture, Map<string, Texture>>();
/** `base` with this season's touch for the wall at (x, y): a window gets its weather, a plain wall its trim. */
function withSeason(world: World, base: Texture, kind: string, themeId: string): Texture {
  const season = seasonIn(world);
  if (!season || (kind !== 'G' && kind !== '#')) return base;
  const accent = themeById(themeId).seasons[season];
  const key = `${themeId}|${season}`;
  let per = touched.get(base);
  if (!per) touched.set(base, (per = new Map()));
  let t = per.get(key);
  if (!t) per.set(key, (t = compose(base, seasonLayer(kind, accent, 0))));
  return t;
}

/** The first-person picture of the wall at (x, y) seen from its `face` side: it follows the style of the floor in front of it. */
export function wallFaceTexture(world: World, x: number, y: number, face: Face): Texture {
  const [dx, dy] = FACE_STEP[face];
  const themeId = world.styleAt(x + dx, y + dy);
  const kind = world.grid[y]?.[x] ?? '#';
  if (kind !== '#') return withSeason(world, specialFace(themeId, kind), kind, themeId);
  const p = world.wallFacePaint(x, y, face);
  return withSeason(world, cellTexture(p.finish, p.color, face === 'n' || face === 's' ? x : y, 0, paletteFor(themeById(themeId))), '#', themeId);
}

/** The plain wall of the style in front of a wall: what a tall wall shows above its own picture. */
export function plainWallFace(world: World, x: number, y: number, face: Face): Texture {
  const [dx, dy] = FACE_STEP[face];
  const theme = themeById(world.styleAt(x + dx, y + dy));
  const p = world.layout.walls[y * world.w + x] === '#' ? world.wallFacePaint(x, y, face) : themeWallPaint(theme);
  return cellTexture(p.finish, p.color, face === 'n' || face === 's' ? x : y, 0, paletteFor(theme));
}

const ceilCache = new Map<string, { plain: Texture; light: Texture }>();
export function ceilingTextures(themeId: string): { plain: Texture; light: Texture } {
  let c = ceilCache.get(themeId);
  if (!c) {
    const make = (lit: boolean) => {
      const ctx = new PixelCtx(TEX, TEX);
      withPalette(paletteFor(themeById(themeId)), () => paintCeiling(asCtx(ctx), lit));
      return ctx.texture();
    };
    c = { plain: make(false), light: make(true) };
    ceilCache.set(themeId, c);
  }
  return c;
}

export { PALETTE };
