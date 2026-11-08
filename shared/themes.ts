// The office's themes. A theme is code, not stored data: a layout stores only a theme id. A theme sets what the four legacy floor
// codes and plain walls draw as, the colors of special walls, wall tops, the ceiling and built-in furniture, the tint of the
// first-person light, and the label colors. Warm Studio is today's office, color for color.
import { finishById, parsePaintKey, type Finish } from './finishes';
import { seasonOf, type Season } from './season';

export const DEFAULT_THEME = 'warm-studio';
export const LIGHT_MIN = 0.6;
export const LIGHT_MAX = 1.2;
/** Time of day never makes the office darker than this. */
export const NIGHT_FLOOR = 0.7;

export interface SeasonAccent {
  window: 'frost' | 'blossom' | 'sun' | 'leaves';
  trim: 'garland' | 'bunting' | 'vines' | 'leaves' | 'none';
  light: { r: number; g: number; b: number };
}

export interface Theme {
  id: string;
  name: string;
  /** What each legacy floor code draws as (paint keys). */
  floors: Record<'.' | ',' | ';' | '_', string>;
  /** Plain walls (paint key). */
  wall: string;
  /** The color a theme-color paint takes, by finish group; a group left out uses the finish's own default. */
  colors: Partial<Record<string, string>>;
  cap: { base: string; light: string; dark: string; shadow: string };
  trim: { base: string; light: string };
  special: { glassFrame: string; boardFrame: string; shelfWood: string; counterTop: string; cabinet: string };
  ceiling: { base: string; speck: string; line: string; lamp: string; glow: string };
  furniture: { deskTop: string; chairSeat: string; sofa: string; tableTop: string; plantPot: string };
  /** The tint of the first-person light, and the color distant things fade to. */
  light: { r: number; g: number; b: number; fog: string };
  labelInk: string;
  labelHalo: string;
  seasons: Record<Season, SeasonAccent>;
}

const SEASONS: Theme['seasons'] = {
  winter: { window: 'frost', trim: 'garland', light: { r: 0.97, g: 0.99, b: 1.05 } },
  spring: { window: 'blossom', trim: 'bunting', light: { r: 1.02, g: 1.03, b: 1.0 } },
  summer: { window: 'sun', trim: 'vines', light: { r: 1.05, g: 1.03, b: 0.96 } },
  autumn: { window: 'leaves', trim: 'leaves', light: { r: 1.05, g: 1.0, b: 0.94 } },
};

const mixHex = (a: string, b: string, t: number): string => {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) + (((pb >> s) & 255) - ((pa >> s) & 255)) * t);
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`;
};
const lighter = (c: string, t: number) => mixHex(c, '#ffffff', t);
const darker = (c: string, t: number) => mixHex(c, '#000000', t);
const capOf = (base: string) => ({ base, light: lighter(base, 0.18), dark: darker(base, 0.2), shadow: darker(base, 0.45) });
const trimOf = (base: string) => ({ base, light: lighter(base, 0.2) });
const ceilingOf = (base: string) => ({ base, speck: darker(base, 0.06), line: darker(base, 0.15), lamp: darker(base, 0.04), glow: lighter(base, 0.6) });

export const THEMES: Theme[] = [
  {
    id: 'warm-studio', name: 'Warm Studio',
    floors: { '.': 'wood-plank-classic', ',': 'carpet-blue', ';': 'library-diamond', _: 'kitchen-check' },
    wall: 'plaster-wall',
    colors: {},
    cap: { base: '#4b4f72', light: '#6a6f96', dark: '#383c60', shadow: '#262945' },
    trim: { base: '#9d866b', light: '#b69f84' },
    special: { glassFrame: '#f6f6f2', boardFrame: '#a7adb3', shelfWood: '#6a4a30', counterTop: '#e6e9ea', cabinet: '#a98862' },
    ceiling: { base: '#e2e0d9', speck: '#d3d1c9', line: '#bdbbb2', lamp: '#d9d6c8', glow: '#fffbe8' },
    furniture: { deskTop: '#bd8f60', chairSeat: '#44557f', sofa: '#2f8782', tableTop: '#cf9c68', plantPot: '#c0693a' },
    light: { r: 1, g: 1, b: 1, fog: '#000000' },
    labelInk: '#ffffff', labelHalo: '#3a3354', seasons: SEASONS,
  },
  {
    id: 'scandinavian', name: 'Scandinavian',
    floors: { '.': 'planks-narrow:ecd98a', ',': 'carpet-loop:6fa3c8', ';': 'carpet-striped:e9dfc8', _: 'tile-square:e9dfc8' },
    wall: 'paint-eggshell:e9dfc8',
    colors: { wood: '#ecd98a', soft: '#6fa3c8', paint: '#ece6d8' },
    cap: capOf('#8d9aa6'), trim: trimOf('#d8cfbf'),
    special: { glassFrame: '#ffffff', boardFrame: '#cfd6db', shelfWood: '#c9a77c', counterTop: '#f2f2ee', cabinet: '#d8c3a0' },
    ceiling: ceilingOf('#f1efe9'),
    furniture: { deskTop: '#e0c9a0', chairSeat: '#6fa3c8', sofa: '#8aa684', tableTop: '#e6d3ae', plantPot: '#e9dfc8' },
    light: { r: 1.04, g: 1.04, b: 1.06, fog: '#dfe6ea' },
    labelInk: '#ffffff', labelHalo: '#3d4a56', seasons: SEASONS,
  },
  {
    id: 'industrial-loft', name: 'Industrial Loft',
    floors: { '.': 'concrete-polished', ',': 'carpet-loop:464a52', ';': 'felt-floor:5b6573', _: 'tile-large:b9b4a8' },
    wall: 'brick-red',
    colors: { stone: '#a9a8a2', masonry: '#a85a4c', soft: '#464a52' },
    cap: capOf('#3a3d44'), trim: trimOf('#6b6f78'),
    special: { glassFrame: '#2e3140', boardFrame: '#464a52', shelfWood: '#5a4636', counterTop: '#9aa3ab', cabinet: '#4f5560' },
    ceiling: ceilingOf('#8e8f92'),
    furniture: { deskTop: '#8a6a4a', chairSeat: '#2e3140', sofa: '#b2574a', tableTop: '#7b5436', plantPot: '#464a52' },
    light: { r: 0.96, g: 0.96, b: 1.0, fog: '#14151a' },
    labelInk: '#ffffff', labelHalo: '#2a2c33', seasons: SEASONS,
  },
  {
    id: 'cozy-cabin', name: 'Cozy Cabin',
    floors: { '.': 'planks-wide:7b5436', ',': 'rug-field:b2574a', ';': 'carpet-striped:7d5a86', _: 'tile-square:c8774a' },
    wall: 'shiplap:c89a62',
    colors: { wood: '#8a6140', panel: '#b88d62' },
    cap: capOf('#5a3e2b'), trim: trimOf('#7b5436'),
    special: { glassFrame: '#7b5436', boardFrame: '#6a4a30', shelfWood: '#5a3e2b', counterTop: '#c8b18a', cabinet: '#7b5436' },
    ceiling: ceilingOf('#b89a74'),
    furniture: { deskTop: '#8a6140', chairSeat: '#8a3b34', sofa: '#6f4a2c', tableTop: '#9a7048', plantPot: '#8a6140' },
    light: { r: 1.1, g: 1.0, b: 0.88, fog: '#2a1a10' },
    labelInk: '#ffffff', labelHalo: '#4a3022', seasons: SEASONS,
  },
  {
    id: 'night-mode', name: 'Night Mode',
    floors: { '.': 'planks-narrow:44577f', ',': 'carpet-blue:7d5a86', ';': 'carpet-loop:7d5a86', _: 'tile-square:5b6573' },
    wall: 'paint-flat:2e3140',
    colors: { wood: '#44577f', soft: '#7d5a86', paint: '#2e3140' },
    cap: capOf('#20243a'), trim: trimOf('#4a5070'),
    special: { glassFrame: '#2e3140', boardFrame: '#464a52', shelfWood: '#3a2c22', counterTop: '#5b6573', cabinet: '#3a3f55' },
    ceiling: ceilingOf('#3a3f55'),
    furniture: { deskTop: '#6b5238', chairSeat: '#6fa3c8', sofa: '#5f4f8a', tableTop: '#6b5238', plantPot: '#464a52' },
    light: { r: 0.8, g: 0.86, b: 1.0, fog: '#0a0d1c' },
    labelInk: '#ffffff', labelHalo: '#10142a', seasons: SEASONS,
  },
  {
    id: 'garden-atrium', name: 'Garden Atrium',
    floors: { '.': 'tile-square:9ccdb4', ',': 'grass', ';': 'sand', _: 'flagstone:b9b4a8' },
    wall: 'brick-white',
    colors: { stone: '#a39c8e', outdoor: '#5f9a4f' },
    cap: capOf('#4d6a54'), trim: trimOf('#8aa684'),
    special: { glassFrame: '#e9f2ea', boardFrame: '#8aa684', shelfWood: '#6b5a3a', counterTop: '#e6efe6', cabinet: '#8aa684' },
    ceiling: ceilingOf('#dfe9dd'),
    furniture: { deskTop: '#c8a878', chairSeat: '#3f8f8c', sofa: '#5f8a4f', tableTop: '#c8a878', plantPot: '#c8774a' },
    light: { r: 0.98, g: 1.06, b: 0.98, fog: '#1c2c1f' },
    labelInk: '#ffffff', labelHalo: '#28402c', seasons: SEASONS,
  },
  {
    id: 'retro-arcade', name: 'Retro Arcade',
    floors: { '.': 'checker-tile:7d5a86', ',': 'carpet-loop:e0816a', ';': 'diamond-tile:44577f', _: 'checker-tile:c98592' },
    wall: 'wall-geometric:7d5a86',
    colors: { tile: '#7d5a86', paint: '#5a4a7a', wallpaper: '#5a4a7a' },
    cap: capOf('#2e2347'), trim: trimOf('#c98592'),
    special: { glassFrame: '#c98592', boardFrame: '#7d5a86', shelfWood: '#4a2f5e', counterTop: '#a99bc9', cabinet: '#5a4a7a' },
    ceiling: ceilingOf('#2e2347'),
    furniture: { deskTop: '#7d5a86', chairSeat: '#e0816a', sofa: '#3f8f8c', tableTop: '#a99bc9', plantPot: '#d1a53a' },
    light: { r: 1.0, g: 0.9, b: 1.1, fog: '#140a24' },
    labelInk: '#ffffff', labelHalo: '#2e2347', seasons: SEASONS,
  },
  {
    id: 'space-station', name: 'Space Station',
    floors: { '.': 'hex-tile:6fa3c8', ',': 'concrete-polished:5b6573', ';': 'rubber:5b6573', _: 'tile-large:b9b4a8' },
    wall: 'corrugated-metal',
    colors: { stone: '#5b6573', tile: '#6fa3c8' },
    cap: capOf('#3a4658'), trim: trimOf('#6fa3c8'),
    special: { glassFrame: '#9aa3ab', boardFrame: '#5b6573', shelfWood: '#4f5560', counterTop: '#c4ccd2', cabinet: '#5b6573' },
    ceiling: ceilingOf('#6f7a88'),
    furniture: { deskTop: '#9aa3ab', chairSeat: '#3f8f8c', sofa: '#44577f', tableTop: '#b8c0c8', plantPot: '#5b6573' },
    light: { r: 0.9, g: 1.0, b: 1.1, fog: '#0a1018' },
    labelInk: '#ffffff', labelHalo: '#1e2733', seasons: SEASONS,
  },
];

const BY_ID = new Map(THEMES.map((t) => [t.id, t]));
export const themeById = (id: string | undefined): Theme => BY_ID.get(id ?? DEFAULT_THEME) ?? BY_ID.get(DEFAULT_THEME)!;
export const isThemeId = (id: unknown): id is string => typeof id === 'string' && BY_ID.has(id);

/** WCAG contrast ratio between two `#rrggbb` colors. */
export function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The color a paint draws in: its own fixed swatch, else the theme's color for the finish's group, else the finish's default. */
export function paintColor(finish: Finish, fixed: string | undefined, theme: Theme): string {
  if (fixed) return fixed.startsWith('#') ? fixed : `#${fixed}`;
  return theme.colors[finish.group] ?? finish.defaultColor;
}

/** A paint key read for the theme that applies: what to draw and in which color. Null when the key means nothing. */
export interface ResolvedPaint {
  key: string;
  finish: Finish;
  /** `#rrggbb` */
  color: string;
}
export function resolvePaintKey(key: string, theme: Theme): ResolvedPaint | null {
  const parsed = parsePaintKey(key);
  return parsed ? { key, finish: parsed.finish, color: paintColor(parsed.finish, parsed.color, theme) } : null;
}

/** What a theme draws for a legacy floor code. */
export function themeFloorPaint(theme: Theme, code: string): ResolvedPaint {
  return (
    resolvePaintKey(theme.floors[code as keyof Theme['floors']] ?? theme.floors['.'], theme) ??
    { key: 'wood-plank-classic', finish: finishById('wood-plank-classic')!, color: '#d7ad7c' }
  );
}
export function themeWallPaint(theme: Theme): ResolvedPaint {
  return resolvePaintKey(theme.wall, theme) ?? { key: 'plaster-wall', finish: finishById('plaster-wall')!, color: '#efe6d6' };
}

/** The season on `date`; the southern hemisphere is two seasons ahead. */
export const seasonFor = seasonOf;

// The tint of the daylight through the day, as a few key moments that are smoothly joined. Warm at sunrise and sunset, plain at noon,
// and a cool dim at night that is never darker than `NIGHT_FLOOR` in any channel.
const DAY_KEYS: [number, number, number, number][] = [
  [0, 0.78, 0.82, 0.95], [5, 0.78, 0.82, 0.95], [7, 1.06, 0.92, 0.8], [9, 1.04, 0.98, 0.9], [12, 1, 1, 1], [16, 1.02, 1, 0.96],
  [18, 1.12, 0.95, 0.78], [20, 1.04, 0.9, 0.84], [22, 0.8, 0.84, 0.95], [24, 0.78, 0.82, 0.95],
];

/** The light tint at an hour of the day (0 to 24, fractions allowed; it repeats every 24). */
export function daylightAt(hour: number): { r: number; g: number; b: number } {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < DAY_KEYS.length - 2 && h >= DAY_KEYS[i + 1][0]) i++;
  const [h0, r0, g0, b0] = DAY_KEYS[i], [h1, r1, g1, b1] = DAY_KEYS[i + 1];
  const t = (h - h0) / (h1 - h0);
  const e = t * t * (3 - 2 * t);
  const mix = (a: number, b: number) => Math.max(NIGHT_FLOOR, a + (b - a) * e);
  return { r: mix(r0, r1), g: mix(g0, g1), b: mix(b0, b1) };
}
