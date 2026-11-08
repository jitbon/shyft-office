// The floor and wall finishes a builder can paint with, and the paint key that names one in a layout. This file is only data and
// string rules (no drawing): src/finish.ts turns a finish into pixels, so the server can check keys without any art code.

export type PainterId =
  | 'legacy-wood' | 'legacy-carpet' | 'legacy-library' | 'legacy-kitchen' | 'legacy-plaster'
  | 'planks' | 'herringbone' | 'chevron' | 'parquet' | 'tiles' | 'hex' | 'terrazzo' | 'concrete' | 'stone' | 'carpet'
  | 'grass' | 'sand' | 'paint' | 'wallpaper' | 'brick' | 'panel' | 'felt' | 'metal' | 'glassblock';

export type FloorGroup = 'wood' | 'tile' | 'stone' | 'soft' | 'outdoor' | 'special';
export type WallGroup = 'paint' | 'wallpaper' | 'masonry' | 'panel' | 'special';

export interface Finish {
  /** `[a-z0-9-]{1,32}` */
  id: string;
  /** Shown in the builder, at most 32 characters. */
  name: string;
  surface: 'floor' | 'wall';
  group: FloorGroup | WallGroup;
  painter: PainterId;
  /** Numbers the painter reads (sizes, joints, which variant). */
  params: Record<string, number>;
  /** Pixels before the pattern repeats. */
  period: 32 | 64;
  /** Used when a theme or room kit does not name a color. */
  defaultColor: string;
}

export const MAX_PAINTS = 94;
export const UNPAINTED = ' ';
export const PAINT_KEY_RE = /^[a-z0-9-]{1,32}(:[0-9a-f]{6})?$/;

export const FLOOR_GROUPS: FloorGroup[] = ['wood', 'tile', 'stone', 'soft', 'outdoor', 'special'];
export const WALL_GROUPS: WallGroup[] = ['paint', 'wallpaper', 'masonry', 'panel', 'special'];
export const GROUP_NAMES: Record<string, string> = {
  wood: 'Wood', tile: 'Tile', stone: 'Stone and concrete', soft: 'Carpet and soft', outdoor: 'Outdoor', special: 'Special',
  paint: 'Paint', wallpaper: 'Wallpaper', masonry: 'Brick, stone and tile', panel: 'Panels',
};

/** The colors a builder can pick for a finish, besides the theme's own. Original names. */
export const SWATCHES: { id: string; name: string; hex: string }[] = [
  { id: 'oak', name: 'Oak', hex: '#c89a62' },
  { id: 'walnut', name: 'Walnut', hex: '#7b5436' },
  { id: 'birch', name: 'Birch', hex: '#e0c9a0' },
  { id: 'ash', name: 'Ash', hex: '#a9a49a' },
  { id: 'slate', name: 'Slate', hex: '#5b6573' },
  { id: 'charcoal', name: 'Charcoal', hex: '#464a52' },
  { id: 'cream', name: 'Cream', hex: '#e9dfc8' },
  { id: 'stone', name: 'Stone', hex: '#b9b4a8' },
  { id: 'brick', name: 'Brick', hex: '#b2574a' },
  { id: 'terracotta', name: 'Terracotta', hex: '#c8774a' },
  { id: 'rose', name: 'Rose', hex: '#c98592' },
  { id: 'plum', name: 'Plum', hex: '#7d5a86' },
  { id: 'navy', name: 'Navy', hex: '#44577f' },
  { id: 'sky', name: 'Sky', hex: '#6fa3c8' },
  { id: 'teal', name: 'Teal', hex: '#3f8f8c' },
  { id: 'sage', name: 'Sage', hex: '#8aa684' },
  { id: 'moss', name: 'Moss', hex: '#5f8a4f' },
  { id: 'olive', name: 'Olive', hex: '#8a8a4a' },
  { id: 'mustard', name: 'Mustard', hex: '#d1a53a' },
  { id: 'butter', name: 'Butter', hex: '#ecd98a' },
  { id: 'coral', name: 'Coral', hex: '#e0816a' },
  { id: 'lilac', name: 'Lilac', hex: '#a99bc9' },
  { id: 'mint', name: 'Mint', hex: '#9ccdb4' },
  { id: 'ink', name: 'Ink', hex: '#2e3140' },
];
const SWATCH_HEX = new Set(SWATCHES.map((s) => s.hex.slice(1)));
export const isSwatch = (hex6: string) => SWATCH_HEX.has(hex6);

type P = Record<string, number>;
const f = (id: string, name: string, group: Finish['group'], painter: PainterId, color: string, params: P = {}, period: 32 | 64 = 32): Finish => ({
  id, name, surface: 'floor', group, painter, params, period, defaultColor: color,
});
const w = (id: string, name: string, group: Finish['group'], painter: PainterId, color: string, params: P = {}, period: 32 | 64 = 32): Finish => ({
  id, name, surface: 'wall', group, painter, params, period, defaultColor: color,
});

export const FINISHES: Finish[] = [
  // Floors: wood
  f('wood-plank-classic', 'Classic planks', 'wood', 'legacy-wood', '#d7ad7c'),
  f('planks-wide', 'Wide planks', 'wood', 'planks', '#cfa56f', { h: 16, len: 32, off: 11 }),
  f('planks-narrow', 'Narrow planks', 'wood', 'planks', '#c99a64', { h: 4, len: 16, off: 5 }),
  f('herringbone-oak', 'Herringbone', 'wood', 'herringbone', '#c8965f', { h: 4, block: 8 }),
  f('chevron-walnut', 'Chevron', 'wood', 'chevron', '#8a6140', { h: 4 }),
  f('parquet-square', 'Parquet squares', 'wood', 'parquet', '#d0a56d', { block: 16, strip: 4 }),
  f('deck-boards', 'Deck boards', 'wood', 'planks', '#a98156', { h: 8, len: 64, off: 23, gap: 1 }, 64),
  // Floors: tile
  f('tile-square', 'Square tile', 'tile', 'tiles', '#cfc9bc', { s: 16, grout: 1 }),
  f('tile-large', 'Large tile', 'tile', 'tiles', '#d6d0c2', { s: 32, grout: 1 }),
  f('tile-subway-floor', 'Brick-set tile', 'tile', 'tiles', '#d8d2c6', { s: 16, h: 8, grout: 1, stagger: 1 }),
  f('hex-tile', 'Honeycomb tile', 'tile', 'hex', '#c4bcae', { w: 16, h: 8 }),
  f('checker-tile', 'Checker tile', 'tile', 'tiles', '#cfc9bc', { s: 16, grout: 0, alt: 1 }),
  f('kitchen-check', 'Kitchen check', 'tile', 'legacy-kitchen', '#efebe3'),
  // Floors: stone and concrete
  f('terrazzo', 'Terrazzo', 'stone', 'terrazzo', '#cdc6b8', {}, 64),
  f('concrete-polished', 'Polished concrete', 'stone', 'concrete', '#a9a8a2', { joint: 32, smooth: 1 }),
  f('concrete-rough', 'Rough concrete', 'stone', 'concrete', '#9a9892', { joint: 0, smooth: 0 }),
  f('flagstone', 'Flagstone', 'stone', 'stone', '#a39c8e', { cells: 9, edge: 1 }, 64),
  f('marble-tile', 'Marble tile', 'stone', 'stone', '#dcd8d0', { cells: 4, edge: 1, vein: 1 }, 64),
  // Floors: carpet and soft
  f('carpet-blue', 'Office carpet', 'soft', 'legacy-carpet', '#6b86b0'),
  f('carpet-loop', 'Loop carpet', 'soft', 'carpet', '#7d8fa3', { loop: 1 }),
  f('carpet-striped', 'Striped carpet', 'soft', 'carpet', '#8a7aa6', { stripe: 1 }),
  f('library-diamond', 'Diamond carpet', 'soft', 'legacy-library', '#8d5f68'),
  f('felt-floor', 'Felt', 'soft', 'felt', '#7f8a8c'),
  f('cork', 'Cork', 'soft', 'terrazzo', '#c19a6b', { cork: 1 }, 64),
  f('rubber', 'Rubber', 'soft', 'concrete', '#4f5560', { rubber: 1, joint: 0, smooth: 1 }),
  // Floors: outdoor
  f('grass', 'Grass', 'outdoor', 'grass', '#5f9a4f'),
  f('sand', 'Sand', 'outdoor', 'sand', '#dcc592'),
  // Floors: special
  f('rug-field', 'Rug field', 'special', 'carpet', '#a8434f', { border: 1 }),
  f('diamond-tile', 'Diamond tile', 'special', 'tiles', '#d0c9bc', { s: 16, grout: 1, diamond: 1 }),

  // Walls: paint
  w('plaster-wall', 'Plaster', 'paint', 'legacy-plaster', '#efe6d6'),
  w('paint-flat', 'Flat paint', 'paint', 'paint', '#d9d2c3', { trim: 0 }),
  w('paint-eggshell', 'Paint with trim', 'paint', 'paint', '#d9d2c3', { trim: 1 }),
  w('paint-wainscot', 'Painted lower half', 'paint', 'paint', '#cdc6b6', { trim: 1, dado: 1 }),
  // Walls: wallpaper
  w('wall-stripes', 'Stripes', 'wallpaper', 'wallpaper', '#d4c4a8', { kind: 0 }),
  w('wall-pinstripe', 'Pinstripe', 'wallpaper', 'wallpaper', '#cfc8bb', { kind: 1 }),
  w('wall-dots', 'Dots', 'wallpaper', 'wallpaper', '#d9cfbc', { kind: 2 }),
  w('wall-geometric', 'Geometric', 'wallpaper', 'wallpaper', '#c8c0ae', { kind: 3 }),
  w('wall-botanical', 'Botanical', 'wallpaper', 'wallpaper', '#d3d6c0', { kind: 4 }),
  w('wall-damask', 'Ornament', 'wallpaper', 'wallpaper', '#cdb9ae', { kind: 5 }),
  // Walls: brick, stone and tile
  w('brick-red', 'Red brick', 'masonry', 'brick', '#b2574a'),
  w('brick-white', 'White brick', 'masonry', 'brick', '#e4e0d8', { white: 1 }),
  w('stone-wall', 'Stone', 'masonry', 'stone', '#9d9686', { cells: 9, edge: 1, wall: 1 }, 64),
  w('subway-wall', 'Subway tile', 'masonry', 'tiles', '#e4e6e3', { s: 16, h: 8, grout: 1, stagger: 1, wall: 1 }),
  w('concrete-board', 'Concrete board', 'masonry', 'concrete', '#9c9b95', { joint: 16, smooth: 1, wall: 1 }),
  // Walls: panels
  w('wainscot-panel', 'Wainscot', 'panel', 'panel', '#d3c4a6', { kind: 0 }),
  w('vertical-panel', 'Vertical boards', 'panel', 'panel', '#b88d62', { kind: 1 }),
  w('shiplap', 'Shiplap', 'panel', 'panel', '#d8d2c6', { kind: 2 }),
  w('felt-wall', 'Acoustic felt', 'panel', 'felt', '#7d8a98', { wall: 1 }),
  // Walls: special
  w('glass-block', 'Glass block', 'special', 'glassblock', '#a9d4dc'),
  w('corrugated-metal', 'Corrugated metal', 'special', 'metal', '#9aa3ab'),
  w('chalkboard', 'Chalkboard', 'special', 'paint', '#3b4540', { trim: 1, board: 1 }),
];

const BY_ID = new Map(FINISHES.map((x) => [x.id, x]));
export const finishById = (id: string): Finish | undefined => BY_ID.get(id);
export const FLOOR_FINISHES = FINISHES.filter((x) => x.surface === 'floor');
export const WALL_FINISHES = FINISHES.filter((x) => x.surface === 'wall');

export interface ParsedPaint {
  finish: Finish;
  /** `rrggbb` of a fixed color, or undefined for the theme's color. */
  color?: string;
}

/** Reads a paint key; null when it is malformed, names no finish, or names a color that is not offered. */
export function parsePaintKey(key: unknown): ParsedPaint | null {
  if (typeof key !== 'string' || !PAINT_KEY_RE.test(key)) return null;
  const [id, color] = key.split(':');
  const finish = BY_ID.get(id);
  if (!finish) return null;
  if (color !== undefined && !isSwatch(color)) return null;
  return { finish, ...(color !== undefined ? { color } : {}) };
}

export const formatPaintKey = (finishId: string, color?: string): string => (color ? `${finishId}:${color.replace('#', '')}` : finishId);

/** The character that stands for table entry `i` in `floorPaint` / `wallPaint` (`!` is entry 0). */
export const paintChar = (i: number): string => String.fromCharCode(33 + i);
/** The table entry a paint character stands for, or -1 for unpainted or anything else. */
export function paintIndex(ch: string): number {
  if (ch.length !== 1) return -1;
  const c = ch.charCodeAt(0) - 33;
  return c >= 0 && c < MAX_PAINTS ? c : -1;
}
