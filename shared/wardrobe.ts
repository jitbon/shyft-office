// The built-in character's wardrobe: every option the picker offers and the server accepts, as plain data.
// The painters in src/wardrobe/ draw these ids; a missing part in a `Look` is the default one (today's character).
import type { Look } from './protocol';

export type WardrobeKind = 'hairStyle' | 'face' | 'top' | 'bottom' | 'shoes' | 'accessory' | 'outfit';
export type Season = 'winter' | 'spring' | 'summer' | 'autumn' | 'all';

export interface WardrobeOption {
  /** Stable, kebab-case, at most 32 characters. */
  id: string;
  kind: WardrobeKind;
  name: string;
  /** Takes a color from the matching palette. */
  colored: boolean;
  /** Accessories only: hair is drawn below it. */
  hat?: boolean;
  /** Outfits only. */
  season?: Season;
  /** Outfits only: their own color choices; the first is the default. */
  colors?: string[];
}

const opt = (kind: WardrobeKind, id: string, name: string, extra: Partial<WardrobeOption> = {}): WardrobeOption =>
  ({ id, kind, name, colored: false, ...extra });
const hair = (id: string, name: string) => opt('hairStyle', id, name);
const face = (id: string, name: string) => opt('face', id, name);
const top = (id: string, name: string) => opt('top', id, name, { colored: true });
const bottom = (id: string, name: string) => opt('bottom', id, name, { colored: true });
const shoes = (id: string, name: string) => opt('shoes', id, name);
const acc = (id: string, name: string, extra: Partial<WardrobeOption> = {}) => opt('accessory', id, name, extra);
const outfit = (id: string, name: string, season: Season, colors?: string[]) =>
  opt('outfit', id, name, { season, colored: !!colors, ...(colors ? { colors } : {}) });

export const CATALOG: WardrobeOption[] = [
  hair('short', 'Short'), hair('crew', 'Crew cut'), hair('side-part', 'Side part'), hair('curly', 'Curly'),
  hair('afro', 'Afro'), hair('long', 'Long'), hair('ponytail', 'Ponytail'), hair('bun', 'Bun'),
  hair('bob', 'Bob'), hair('mohawk', 'Mohawk'), hair('braids', 'Braids'), hair('bald', 'Bald'),

  face('smile', 'Smile'), face('grin', 'Grin'), face('calm', 'Calm'), face('wink', 'Wink'),
  face('neutral', 'Neutral'), face('surprised', 'Surprised'), face('sleepy', 'Sleepy'), face('freckles', 'Freckles'),

  top('t-shirt', 'T-shirt'), top('hoodie', 'Hoodie'), top('sweater', 'Sweater'), top('shirt-tie', 'Shirt and tie'),
  top('blouse', 'Blouse'), top('dress', 'Dress'), top('jacket', 'Jacket'), top('tank-top', 'Tank top'),
  top('polo', 'Polo'), top('overalls', 'Overalls'),

  bottom('trousers', 'Trousers'), bottom('jeans', 'Jeans'), bottom('shorts', 'Shorts'), bottom('skirt', 'Skirt'),
  bottom('long-skirt', 'Long skirt'), bottom('joggers', 'Joggers'),

  shoes('sneakers', 'Sneakers'), shoes('boots', 'Boots'), shoes('sandals', 'Sandals'),
  shoes('dress-shoes', 'Dress shoes'), shoes('slippers', 'Slippers'),

  acc('glasses', 'Glasses', { colored: true }), acc('sunglasses', 'Sunglasses'),
  acc('cap', 'Cap', { colored: true, hat: true }), acc('beanie', 'Beanie', { colored: true, hat: true }),
  acc('headphones', 'Headphones', { colored: true }), acc('bow', 'Bow', { colored: true }),
  acc('mustache', 'Mustache'), acc('beard', 'Beard'),
  acc('earrings', 'Earrings', { colored: true }), acc('flower-clip', 'Flower clip', { colored: true }),

  outfit('snowman', 'Snowman', 'winter'), outfit('santa', 'Santa suit', 'winter', ['#c8323c', '#2f8f4e']),
  outfit('reindeer', 'Reindeer', 'winter'), outfit('elf', 'Elf', 'winter'),
  outfit('leprechaun', 'Leprechaun', 'spring'), outfit('bunny', 'Bunny', 'spring'), outfit('gardener', 'Gardener', 'spring'),
  outfit('beach-goer', 'Beach-goer', 'summer'), outfit('lifeguard', 'Lifeguard', 'summer'),
  outfit('ice-cream-seller', 'Ice-cream seller', 'summer'),
  outfit('scarecrow', 'Scarecrow', 'autumn'), outfit('zombie', 'Zombie', 'autumn'),
  outfit('pumpkin-head', 'Pumpkin head', 'autumn'), outfit('ghost', 'Ghost', 'autumn'), outfit('witch', 'Witch', 'autumn'),
  outfit('astronaut', 'Astronaut', 'all'), outfit('robot', 'Robot', 'all', ['#9aa4b2', '#d6b04c', '#4fa3d6']),
  outfit('pirate', 'Pirate', 'all'), outfit('chef', 'Chef', 'all'),
  outfit('superhero', 'Superhero', 'all', ['#d64545', '#3b5bdb', '#7b4fd1']),
  outfit('dinosaur', 'Dinosaur', 'all', ['#4caf50', '#e8892f', '#7b4fd1']),
];

export const byKind = (kind: WardrobeKind): WardrobeOption[] => CATALOG.filter((o) => o.kind === kind);
const find = (kind: WardrobeKind, id: unknown) =>
  typeof id === 'string' ? CATALOG.find((o) => o.kind === kind && o.id === id) : undefined;
/** The catalog entry for an id of a kind, if it is one. */
export const optionOf = find;

/** What a part is when a look doesn't name it: today's character. */
export const DEFAULTS = {
  hairStyle: 'short', face: 'smile', top: 't-shirt', bottom: 'trousers', shoes: 'sneakers',
  bottomColor: '#3b4a7a',
} as const;

export const CLOTH_COLORS = [
  '#e04f5f', '#8c2f3f', '#f29e4c', '#f1c453', '#8bc34a', '#3f9d5a', '#2a9d9d', '#3fa7d6',
  '#3b5bdb', '#3b4a7a', '#7b68ee', '#e86fb0', '#8a5a3b', '#8b8f99', '#3d4452', '#f0f0f2',
];
/** Colors in one family look alike, so Surprise me never pairs a top and bottom from the same one. */
export const CLOTH_FAMILY: Record<string, string> = {
  '#e04f5f': 'red', '#8c2f3f': 'red', '#f29e4c': 'orange', '#f1c453': 'yellow', '#8bc34a': 'green', '#3f9d5a': 'green',
  '#2a9d9d': 'teal', '#3fa7d6': 'blue', '#3b5bdb': 'blue', '#3b4a7a': 'blue', '#7b68ee': 'purple', '#e86fb0': 'pink',
  '#8a5a3b': 'brown', '#8b8f99': 'neutral', '#3d4452': 'neutral', '#f0f0f2': 'neutral',
};
export const HAIR_COLORS = [
  '#2b1d14', '#111111', '#5a3825', '#a0522d', '#d9a441', '#ecd58a', '#c0392b', '#7a7a80', '#e8e1d5', '#3b5bdb', '#e86fb0', '#7b4fd1',
];
export const SKIN_TONES = ['#ffdbb4', '#f1c27d', '#e0ac69', '#c68642', '#a9714b', '#8d5524', '#6b4226', '#5c3a21'];

/** The look of a member who sent none, or whose colors were not colors. */
export const DEFAULT_LOOK: Look = { shirt: '#3fa7d6', hair: '#2b1d14', skin: '#f1c27d' };

const HEX = /^#[0-9a-f]{6}$/i;
const hex = (c: unknown): string | undefined => (typeof c === 'string' && HEX.test(c) ? c : undefined);

/**
 * Keeps each known id and color of a look and drops the rest, so what the server relays and stores is always
 * something the painters know. `shirt`, `hair` and `skin` fall back to `fallback`; every other field is omitted
 * (which draws that part's default).
 */
export function validateLook(raw: unknown, fallback: Look): Look {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const look: Look = {
    shirt: hex(r.shirt) ?? fallback.shirt,
    hair: hex(r.hair) ?? fallback.hair,
    skin: hex(r.skin) ?? fallback.skin,
  };
  for (const kind of ['hairStyle', 'face', 'top', 'bottom', 'shoes'] as const) {
    if (find(kind, r[kind])) look[kind] = r[kind] as string;
  }
  const bottomColor = hex(r.bottomColor);
  if (bottomColor) look.bottomColor = bottomColor;
  const accessory = find('accessory', r.accessory);
  if (accessory) {
    look.accessory = accessory.id;
    const c = hex(r.accessoryColor);
    if (c && accessory.colored) look.accessoryColor = c;
  }
  const outfitOpt = find('outfit', r.outfit);
  if (outfitOpt) {
    look.outfit = outfitOpt.id;
    const c = hex(r.outfitColor);
    if (c && outfitOpt.colors) look.outfitColor = c;
  }
  return look;
}

const SEASON_ORDER: Exclude<Season, 'all'>[] = ['winter', 'spring', 'summer', 'autumn'];

/** Northern hemisphere, by calendar month. */
export function seasonOf(date: Date): Exclude<Season, 'all'> {
  const m = date.getMonth();
  return m === 11 || m < 2 ? 'winter' : m < 5 ? 'spring' : m < 8 ? 'summer' : 'autumn';
}

export const SEASON_NAMES: Record<Season, string> = {
  winter: 'Winter', spring: 'Spring', summer: 'Summer', autumn: 'Autumn', all: 'All year',
};

/** The outfits in picker order: this season's first, then the others in calendar order, then the all-year ones. */
export function outfitGroups(date: Date): { season: Season; name: string; outfits: WardrobeOption[] }[] {
  const start = SEASON_ORDER.indexOf(seasonOf(date));
  const order: Season[] = [...SEASON_ORDER.slice(start), ...SEASON_ORDER.slice(0, start), 'all'];
  const outfits = byKind('outfit');
  return order.map((season) => ({ season, name: SEASON_NAMES[season], outfits: outfits.filter((o) => o.season === season) }));
}

const pick = <T>(list: readonly T[], rng: () => number): T => list[Math.floor(rng() * list.length) % list.length];

/** Surprise me: matching parts and colors, never an outfit. */
export function randomLook(rng: () => number = Math.random): Look {
  const shirt = pick(CLOTH_COLORS, rng);
  const bottomColor = pick(CLOTH_COLORS.filter((c) => CLOTH_FAMILY[c] !== CLOTH_FAMILY[shirt]), rng);
  const look: Look = {
    shirt, hair: pick(HAIR_COLORS, rng), skin: pick(SKIN_TONES, rng),
    hairStyle: pick(byKind('hairStyle'), rng).id, face: pick(byKind('face'), rng).id,
    top: pick(byKind('top'), rng).id, bottom: pick(byKind('bottom'), rng).id, bottomColor,
    shoes: pick(byKind('shoes'), rng).id,
  };
  if (rng() < 0.3) {
    const a = pick(byKind('accessory'), rng);
    look.accessory = a.id;
    if (a.colored) look.accessoryColor = pick(CLOTH_COLORS, rng);
  }
  return look;
}
