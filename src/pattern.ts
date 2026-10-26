// Surfaces for the parts of an item: a pattern in a color, as a tileable 32×32 picture. Pure (no canvas), so tests and
// the picture painter can use it. The first-person view and the top-down picture draw from the same textures.
import type { Pattern } from '../shared/items';
import { hash, type Texture } from './art';
import { light, mix, shade } from './palette';

const N = 32;

/** `#rrggbb` as the packed color the renderers use (ABGR, fully opaque). */
export function abgr(hex: string): number {
  const n = parseInt(hex.replace('#', ''), 16);
  return (0xff000000 | ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255)) >>> 0;
}

/** A tileable texture of `pattern` in `color`. The same inputs always give the same pixels. */
export function patternTexture(pattern: Pattern, color: string): Texture {
  const data = new Uint32Array(N * N);
  const seed = parseInt(color.replace('#', '').slice(0, 4), 16) % 97;
  const base = abgr(color), lit = abgr(light(color, 0.22)), dim = abgr(shade(color, 0.2)), dark = abgr(shade(color, 0.38));
  const put = (x: number, y: number, c: number) => {
    data[y * N + x] = c;
  };
  const noise = (x: number, y: number) => hash(x + seed * 7, y + seed * 13);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const n = noise(x, y);
      let c = base;
      switch (pattern) {
        case 'plain':
          c = n < 0.05 ? lit : n > 0.95 ? dim : base;
          break;
        case 'wood': {
          const row = y % 8;
          c = row === 1 ? lit : row === 5 ? dim : base;
          if (c === base && noise(Math.floor(x / 8), y) > 0.82) c = dim; // a grain streak that is eight pixels long
          break;
        }
        case 'fabric': {
          const cell = ((x >> 1) + (y >> 1)) % 2 === 0;
          c = cell ? lit : base;
          if (x % 8 === 0 || y % 8 === 0) c = dim;
          break;
        }
        case 'metal':
          c = noise(0, y) > 0.66 ? lit : noise(0, y) < 0.25 ? dim : base;
          if (n > 0.97) c = dark;
          break;
        case 'leaf':
          c = n < 0.28 ? lit : n > 0.72 ? dark : n > 0.55 ? dim : base;
          break;
        case 'glass': {
          const pale = abgr(mix(color, '#ffffff', 0.55));
          c = (x + y) % 16 < 3 ? abgr('#ffffff') : pale;
          if (x % 31 === 0 || y % 31 === 0) c = lit; // a frame on every edge, so tiles join up
          break;
        }
        case 'screen': {
          const bright = abgr(mix(color, '#ffffff', 0.35));
          c = y % 4 === 0 ? bright : base;
          if (x > 3 && x < 14 && y > 3 && y < 6) c = abgr('#ffffff');
          break;
        }
        case 'paper': {
          const cream = abgr(mix(color, '#ffffff', 0.7));
          c = y % 8 === 5 && x > 3 && x < 28 ? abgr('#b9b3a4') : cream;
          break;
        }
        case 'stone': {
          const rowBlock = Math.floor(y / 8);
          const joint = y % 8 === 0 || (x + (rowBlock % 2) * 8) % 16 === 0;
          c = joint ? dark : n < 0.12 ? lit : n > 0.9 ? dim : base;
          break;
        }
      }
      put(x, y, c);
    }
  }
  return { w: N, h: N, data };
}
