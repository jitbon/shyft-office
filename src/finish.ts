// Turns a finish (shared/finishes.ts) into pixels. Pure: no canvas, no timers, no Math.random. Noise comes from `hash(x, y)` of the
// pixel's place in the pattern, so the same inputs always give the same pixels and both views draw the same office.
//
// A floor pixel is a function of its world position, reduced to the finish's period; a wall pixel is a function of its place along
// the wall (reduced to the period) and its row on a 32-pixel-tall face. The top-down view shows the bottom 20 rows of that face.
import type { Finish } from '../shared/finishes';
import { themeById } from '../shared/themes';
import { TEX, drawFloor, hash, paintWallFace, withPalette, type Texture } from './art';
import { PALETTE, light, mix, shade, type Palette } from './palette';
import { abgr } from './pattern';
import { PixelCtx, asCtx } from './pixelctx';

const N = 32;

export { paintColor as colorOf } from '../shared/themes';

interface Ramp {
  base: number; lit: number; dim: number; dark: number; seam: number; pale: number;
}

const hsl = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
};
const fromHsl = (h: number, s: number, l: number): string => {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return `#${[f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};

/** Floors stay readable under characters: whatever color is picked, the base lands between these lightnesses. */
export const FLOOR_L_MIN = 0.42, FLOOR_L_MAX = 0.68;

/** The color with its lightness held inside the floor range. */
export function clampFloor(hex: string): string {
  const [h, s, l] = hsl(hex);
  return fromHsl(h, s, Math.min(FLOOR_L_MAX, Math.max(FLOOR_L_MIN, l)));
}

/** One base color becomes four steps: lights lean warm, darks lean cool. */
export function rampOf(hex: string, floor: boolean): Ramp {
  const base = floor ? clampFloor(hex) : hex;
  const lit = mix(light(base, 0.22), '#fff0d0', 0.12);
  const dim = shade(base, 0.2);
  const dark = mix(shade(base, 0.38), '#3a3a6a', 0.12);
  return {
    base: abgr(base), lit: abgr(lit), dim: abgr(dim), dark: abgr(dark), seam: abgr(mix(shade(base, 0.5), '#3a3a6a', 0.15)), pale: abgr(light(base, 0.45)),
  };
}

interface Kit {
  c: Ramp;
  p: Record<string, number>;
  seed: number;
  period: number;
}
type Painter = (u: number, v: number, k: Kit) => number;

const seedOf = (id: string) => [...id].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 997, 7);
const noise = (u: number, v: number, k: Kit) => hash(u + k.seed * 7, v + k.seed * 13);
const pick = (n: number, k: Kit, litBelow = 0.25, dimAbove = 0.75) => (n < litBelow ? k.c.lit : n > dimAbove ? k.c.dim : k.c.base);
/** A trim band along the bottom of a face (the baseboard). */
const baseboard = (v: number, k: Kit): number | null => (v === 26 ? k.c.pale : v >= 27 && v <= 30 ? k.c.dim : v === 31 ? k.c.dark : null);
const tri = (n: number, period: number) => {
  const m = n % period;
  return m < period / 2 ? m : period - 1 - m;
};

const planks: Painter = (u, v, k) => {
  const { h, len, off, gap } = k.p;
  const r = Math.floor(v / h), lv = v % h;
  const x = u + r * off;
  const id = r * 8 + Math.floor(x / len);
  if (lv === h - 1) return gap ? k.c.seam : k.c.dark;
  if (x % len === 0) return k.c.dark;
  if (lv === 0) return k.c.lit;
  const n = hash(id, 3 + k.seed);
  const body = pick(n, k, 0.3, 0.75);
  return lv % 4 === 2 && noise(Math.floor(u / 5), r, k) < 0.4 ? k.c.dim : body;
};

const diagonalBoards = (u: number, v: number, k: Kit, z: number, seam: boolean): number => {
  const h = k.p.h;
  const t = v + z;
  if (seam) return k.c.dark;
  if (t % h === h - 1) return k.c.dark;
  const board = Math.floor(t / h) % (N / h);
  return pick(hash(board, 5 + k.seed + Math.floor(u / (k.p.block ?? 16))), k, 0.3, 0.75);
};
const herringbone: Painter = (u, v, k) => {
  const block = k.p.block;
  const col = Math.floor(u / block), lu = u % block;
  const z = col % 2 ? block - 1 - lu : lu;
  return diagonalBoards(u, v, k, z, lu === 0);
};
const chevron: Painter = (u, v, k) => diagonalBoards(u, v, k, tri(u, 16), false);

const parquet: Painter = (u, v, k) => {
  const { block, strip } = k.p;
  const bx = Math.floor(u / block), by = Math.floor(v / block);
  const lu = u % block, lv = v % block;
  if (lu === 0 || lv === 0) return k.c.dark;
  const across = (bx + by) % 2 ? lu : lv;
  if (across % strip === strip - 1) return k.c.seam;
  return pick(hash(bx * 3 + by, Math.floor(across / strip) + k.seed), k, 0.3, 0.75);
};

const tiles: Painter = (u, v, k) => {
  const { s, grout, stagger, alt, diamond } = k.p;
  const th = k.p.h ?? s;
  const r = Math.floor(v / th);
  const uu = u + (stagger && r % 2 ? s / 2 : 0);
  const col = Math.floor(uu / s);
  const lu = uu % s, lv = v % th;
  if (grout && (lu >= s - grout || lv >= th - grout)) return k.c.seam;
  if (diamond && Math.abs(lu - s / 2) + Math.abs(lv - th / 2) < s / 3) return k.c.lit;
  if (alt) return (col + r) % 2 ? k.c.dim : k.c.base;
  if (lu === 0 || lv === 0) return k.c.lit;
  return pick(hash(col + 11 * r, r + k.seed), k, 0.2, 0.85);
};

const hex: Painter = (u, v, k) => {
  const { w, h } = k.p;
  const r = Math.floor(v / h);
  const uu = u + (r % 2 ? w / 2 : 0);
  const lu = uu % w, lv = v % h;
  if (lu === w - 1 || lv === h - 1) return k.c.seam;
  if ((lu < 2 || lu >= w - 3) && (lv < 1 || lv >= h - 2)) return k.c.seam;
  return pick(hash(Math.floor(uu / w) + 7 * r, r + k.seed), k, 0.25, 0.8);
};

const terrazzo: Painter = (u, v, k) => {
  const n = noise(u >> 1, v >> 1, k);
  const cork = k.p.cork;
  if (n < (cork ? 0.07 : 0.05)) return k.c.dark;
  if (n < (cork ? 0.12 : 0.09)) return cork ? k.c.dim : k.c.pale;
  if (n > 0.95) return k.c.lit;
  return k.c.base;
};

const concrete: Painter = (u, v, k) => {
  const { joint, smooth, rubber } = k.p;
  if (joint && (u % joint === 0 || v % joint === 0)) return k.c.dim;
  if (rubber && u % 4 === 1 && v % 4 === 1) return k.c.dim;
  const n = noise(u, v, k);
  const amount = smooth ? 0.03 : 0.06;
  return n < amount ? k.c.lit : n > 1 - amount ? k.c.dim : k.c.base;
};

const seedCache = new Map<string, [number, number][]>();
function seedPoints(k: Kit): [number, number][] {
  const key = `${k.seed}:${k.period}:${k.p.cells}`;
  let pts = seedCache.get(key);
  if (!pts) {
    const g = Math.round(Math.sqrt(k.p.cells)), size = k.period / g;
    pts = [];
    for (let gy = 0; gy < g; gy++) for (let gx = 0; gx < g; gx++) pts.push([(gx + 0.15 + 0.7 * hash(gx + k.seed, gy)) * size, (gy + 0.15 + 0.7 * hash(gy + k.seed * 3, gx + 5)) * size]);
    seedCache.set(key, pts);
  }
  return pts;
}
const stone: Painter = (u, v, k) => {
  const P = k.period;
  let d1 = 1e9, d2 = 1e9, at = 0;
  seedPoints(k).forEach(([sx, sy], i) => {
    const dx = Math.min(Math.abs(u - sx), P - Math.abs(u - sx)), dy = Math.min(Math.abs(v - sy), P - Math.abs(v - sy));
    const d = Math.hypot(dx, dy);
    if (d < d1) {
      d2 = d1;
      d1 = d;
      at = i;
    } else if (d < d2) d2 = d;
  });
  if (k.p.edge && d2 - d1 < 1.6) return k.c.seam;
  if (k.p.vein && (u * 2 + v * 3) % 23 === 0) return k.c.pale;
  return pick(hash(at, k.seed), k, 0.3, 0.7);
};

const carpet: Painter = (u, v, k) => {
  const n = noise(u, v, k);
  if (k.p.loop) return u % 4 < 2 && v % 4 < 2 ? k.c.lit : u % 4 === 2 || v % 4 === 2 ? k.c.dim : k.c.base;
  if (k.p.stripe) return v % 16 < 4 ? k.c.dim : v % 16 === 4 ? k.c.dark : n < 0.08 ? k.c.lit : k.c.base;
  if (k.p.border) {
    const d = Math.abs((u % 16) - 8) + Math.abs((v % 16) - 8);
    return d === 6 ? k.c.pale : d < 3 ? k.c.dim : n < 0.06 ? k.c.lit : k.c.base;
  }
  return v % 4 === 3 ? k.c.dim : n < 0.08 ? k.c.lit : n > 0.94 ? k.c.dark : k.c.base;
};

const grass: Painter = (u, v, k) => {
  const n = noise(u, v, k);
  return n < 0.1 ? k.c.lit : n < 0.17 ? k.c.dark : n > 0.93 ? k.c.dim : k.c.base;
};
const sand: Painter = (u, v, k) => {
  const n = noise(u, v, k);
  if ((v + (u >> 3)) % 6 === 0 && n < 0.6) return k.c.dim;
  return n < 0.06 ? k.c.lit : n > 0.94 ? k.c.dim : k.c.base;
};

const felt: Painter = (u, v, k) => {
  const n = noise(u, v, k);
  return n < 0.06 ? k.c.lit : n > 0.94 ? k.c.dim : (u + v) % 2 ? k.c.base : k.c.base;
};

// ---- walls

const paint: Painter = (u, v, k) => {
  const { trim, dado, board } = k.p;
  const n = noise(u, v, k);
  if (board) {
    if (v < 3 || v >= 24) return v === 2 || v === 24 ? k.c.pale : k.c.seam;
    return n < 0.05 ? k.c.lit : n > 0.97 ? k.c.dim : k.c.base;
  }
  if (trim) {
    const b = baseboard(v, k);
    if (b !== null) return b;
  }
  if (dado) {
    if (v === 13) return k.c.pale;
    if (v === 14) return k.c.dark;
    if (v > 14) return v === 15 ? k.c.dim : k.c.dim;
  }
  if (v < 2) return k.c.lit;
  return n < 0.04 ? k.c.lit : n > 0.96 ? k.c.dim : k.c.base;
};

const wallpaper: Painter = (u, v, k) => {
  const b = baseboard(v, k);
  if (b !== null) return b;
  const lu = u % 16, lv = v % 16;
  let mark = false;
  switch (k.p.kind) {
    case 0:
      if (u % 8 < 4) return u % 8 === 0 ? k.c.dim : k.c.lit;
      return k.c.base;
    case 1: mark = u % 6 === 0; break;
    case 2: mark = u % 8 >= 3 && u % 8 <= 4 && (v + ((u >> 3) % 2) * 4) % 8 >= 3 && (v + ((u >> 3) % 2) * 4) % 8 <= 4; break;
    case 3: mark = (u + v) % 16 === 0 || (u - v + 64) % 16 === 0; break;
    case 4: {
      const leaf = ((lu - 8) / 3) ** 2 + ((lv - 7) / 5) ** 2 < 1;
      const stem = lu === 8 && lv >= 11;
      return leaf || stem ? k.c.dim : v < 2 ? k.c.lit : k.c.base;
    }
    default: {
      const du = u % 32, dv = v % 32;
      const d = Math.abs(du - 16) + Math.abs(dv - 12);
      mark = d === 9 || d === 3 || (d < 3 && (du + dv) % 2 === 0);
    }
  }
  return mark ? k.c.dim : v < 2 ? k.c.lit : k.c.base;
};

const brick: Painter = (u, v, k) => {
  const row = Math.floor(v / 4);
  const uu = u + (row % 2) * 8;
  if (v % 4 === 3) return k.c.pale;
  if (uu % 16 === 15) return k.c.pale;
  const n = hash(Math.floor(uu / 16) + 5 * row, row + k.seed);
  const body = k.p.white ? (n < 0.3 ? k.c.lit : n > 0.8 ? k.c.dim : k.c.base) : pick(n, k, 0.25, 0.7);
  return v % 4 === 0 ? k.c.lit : body;
};

const panel: Painter = (u, v, k) => {
  switch (k.p.kind) {
    case 0: {
      if (v >= 30) return k.c.dark;
      if (v === 12) return k.c.pale;
      if (v === 13) return k.c.dark;
      if (v < 12) return v < 2 ? k.c.lit : k.c.base;
      const lu = u % 16;
      if (lu === 0 || lu === 15 || v === 16 || v === 28) return k.c.dim;
      return lu === 1 || v === 17 ? k.c.lit : k.c.base;
    }
    case 1: {
      const lu = u % 8;
      if (lu === 7) return k.c.dark;
      if (lu === 0) return k.c.lit;
      return pick(hash(Math.floor(u / 8), k.seed), k, 0.3, 0.7);
    }
    default: {
      const lv = v % 6, row = Math.floor(v / 6);
      if (lv === 5) return k.c.dark;
      if (lv === 0) return k.c.lit;
      return u % 32 === (row * 11) % 32 && lv === 2 ? k.c.dim : pick(hash(row, k.seed), k, 0.3, 0.7);
    }
  }
};

const metal: Painter = (u, v, k) => {
  if (v % 16 === 15) return k.c.dark;
  const profile = [k.c.lit, k.c.base, k.c.base, k.c.dim, k.c.dark, k.c.dim, k.c.base, k.c.lit][u % 8];
  return noise(u, v, k) > 0.97 ? k.c.dim : profile;
};

const glassblock: Painter = (u, v, k) => {
  const lu = u % 8, lv = v % 8;
  if (lu === 0 || lv === 0) return k.c.pale;
  if (lu === 1 && lv < 4) return k.c.lit;
  if (lv === 1 && lu < 4) return k.c.lit;
  return (lu * lv) % 5 === 0 ? k.c.dim : lu + lv < 8 ? k.c.base : k.c.dim;
};

const PAINTERS: Partial<Record<Finish['painter'], Painter>> = {
  planks, herringbone, chevron, parquet, tiles, hex, terrazzo, concrete, stone, carpet, grass, sand, paint, wallpaper, brick, panel, felt, metal, glassblock,
};

// ---- the original five, kept exactly (they run today's art code)

export function legacyPalette(finish: Finish, hex: string, base: Palette): Palette {
  if (hex === finish.defaultColor) return base;
  const p = { ...base };
  switch (finish.painter) {
    case 'legacy-wood': {
      const seam = shade(hex, 0.3);
      p.floorWood = { base: hex, light: light(hex, 0.22), dark: shade(hex, 0.15), seam, grain: mix(hex, shade(hex, 0.15), 0.5) };
      break;
    }
    case 'legacy-carpet': p.carpet = { base: hex, light: light(hex, 0.12), dark: shade(hex, 0.12), weave: shade(hex, 0.05) }; break;
    case 'legacy-library': p.library = { base: hex, light: light(hex, 0.12), dark: shade(hex, 0.14) }; break;
    case 'legacy-kitchen': p.kitchen = { a: hex, b: shade(hex, 0.08), grout: shade(hex, 0.2) }; break;
    default: p.wallFace = { ...base.wallFace, base: hex, light: light(hex, 0.4), dark: shade(hex, 0.07), speck: shade(hex, 0.05) };
  }
  return p;
}

function legacyPixels(finish: Finish, color: string, wx: number, wy: number, theme: Palette): Texture {
  const ctx = new PixelCtx(N, N);
  const hex = finish.surface === 'floor' && color !== finish.defaultColor ? clampFloor(color) : color;
  // Only the plaster wall takes anything from the theme (its trim); the floors are their own colors.
  const pal = legacyPalette(finish, hex, finish.painter === 'legacy-plaster' ? theme : PALETTE);
  withPalette(pal, () => {
    if (finish.painter === 'legacy-plaster') paintWallFace(asCtx(ctx), '#', 0, 0, N);
    else {
      const kind = { 'legacy-wood': '.', 'legacy-carpet': ',', 'legacy-library': ';', 'legacy-kitchen': '_' }[finish.painter as string]!;
      drawFloor(asCtx(ctx), kind, 0, 0, wx, wy);
    }
  });
  return ctx.texture();
}

// ---- entry points

const cache = new Map<string, Texture>();
const remember = (key: string, make: () => Texture): Texture => {
  let t = cache.get(key);
  if (!t) {
    t = make();
    if (cache.size > 4000) cache.clear();
    cache.set(key, t);
  }
  return t;
};

/**
 * The 32×32 picture of `finish` in `color` (`#rrggbb`) for the tile at world tile (`wx`, `wy`). For floors the tile position
 * decides which part of the pattern shows; for walls it decides where along the wall.
 */
export function finishPixels(finish: Finish, color: string, wx: number, wy: number, pal: Palette = PALETTE): Texture {
  const legacy = finish.painter.startsWith('legacy-');
  const reps = finish.period / N;
  // A pattern repeats every `reps` tiles, so only that many different pictures exist. Legacy art varies by tile on purpose.
  const px = finish.painter === 'legacy-plaster' ? 0 : legacy ? wx : ((wx % reps) + reps) % reps;
  const py = legacy || finish.surface === 'wall' ? (finish.surface === 'wall' ? 0 : wy) : ((wy % reps) + reps) % reps;
  const trim = finish.painter === 'legacy-plaster' ? `|${pal.wallFace.trim}` : '';
  return remember(`${finish.id}|${color}|${px}|${py}${trim}`, () => {
    if (legacy) return legacyPixels(finish, color, px, py, pal);
    const painter = PAINTERS[finish.painter]!;
    const kit: Kit = { c: rampOf(color, finish.surface === 'floor'), p: finish.params, seed: seedOf(finish.id), period: finish.period };
    const out = new Uint32Array(N * N);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const u = (px * N + x) % finish.period, v = finish.surface === 'wall' ? y : (py * N + y) % finish.period;
        out[y * N + x] = painter(u, v, kit);
      }
    }
    return { w: N, h: N, data: out };
  });
}

/** The picture the first-person view uses for a tile: the same picture the top-down view shows, except legacy art, which keeps its one look. */
export function cellTexture(finish: Finish, color: string, cx: number, cy: number, pal: Palette = PALETTE): Texture {
  return finish.painter.startsWith('legacy-') ? finishPixels(finish, color, 0, 0, pal) : finishPixels(finish, color, cx, cy, pal);
}

/** One tile of the finish, for swatches and previews. */
export const finishTexture = (finish: Finish, color: string): Texture => finishPixels(finish, color, 0, 0);

export { resolvePaintKey as resolvePaint, themeFloorPaint as themeFloor, themeWallPaint as themeWall } from '../shared/themes';

export { themeById, TEX };
