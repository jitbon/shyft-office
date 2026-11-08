// Seasonal touches: a transparent picture laid over a wall face, such as frost on a window or a garland along the top of a wall.
// Pure and deterministic (noise from `hash`), so every browser draws the same one. `layer` is 32×32 with alpha: only the pixels that
// are part of the touch are set, and the rest stay clear. All of it is drawn here; nothing is loaded.
import type { SeasonAccent } from '../shared/themes';
import { hash, type Texture } from './art';
import { abgr } from './pattern';

const N = 32;
const cache = new Map<string, Texture>();

/** Where the window's glass lies on a 32-row face (see `paintWallFace`): columns 4–27, rows 4–22. The top-down view shows only the bottom 20 rows, with a shorter window (rows 16–22). */
const glass = (top: number) => ({ x0: 4, x1: 27, y0: top === 0 ? 4 : top + 4, y1: 22 });

/**
 * The touch for one wall face. `kind` is the wall's own code (`G` for a window, anything else for a plain face), and `top` is the row
 * where the top of the visible face is: 0 in first person, 12 in the top-down view (which shows the bottom 20 rows).
 */
export function seasonLayer(kind: string, accent: SeasonAccent, top: number): Texture {
  const key = `${kind === 'G' ? 'G' : '#'}|${kind === 'G' ? accent.window : accent.trim}|${top}`;
  let t = cache.get(key);
  if (t) return t;
  const data = new Uint32Array(N * N);
  const put = (x: number, y: number, hex: string) => {
    if (x >= 0 && y >= 0 && x < N && y < N) data[y * N + x] = abgr(hex);
  };
  if (kind === 'G') windowTouch(put, accent.window, glass(top));
  else trimTouch(put, accent.trim, top);
  t = { w: N, h: N, data };
  cache.set(key, t);
  return t;
}

type Put = (x: number, y: number, hex: string) => void;

function windowTouch(put: Put, kind: SeasonAccent['window'], { x0, x1, y0, y1 }: { x0: number; x1: number; y0: number; y1: number }) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const edge = Math.min(x - x0, x1 - x, y - y0, y1 - y);
      const n = hash(x * 7, y * 3);
      if (kind === 'frost') {
        // Frost creeps in from the edges and gathers along the bottom.
        const reach = 2 + (y - y0 > 12 ? 3 : 0);
        if (edge < reach && n < 0.35 + (reach - edge) * 0.2) put(x, y, n < 0.15 ? '#ffffff' : '#dbeefb');
      } else if (kind === 'blossom') {
        const branch = Math.abs(x - x0 - (y - y0) * 1.4) < 0.7 && y - y0 < 9;
        if (branch) put(x, y, '#7d5a3c');
        else if (x - x0 + (y - y0) < 14 && n < 0.22) put(x, y, n < 0.1 ? '#f9d3e1' : '#f3a9c4');
      } else if (kind === 'sun') {
        const d = Math.hypot(x - 22, y - 8);
        if (d < 3.2) put(x, y, '#fff2a8');
        else if (d < 4.4) put(x, y, '#ffd25a');
        else if (d < 8 && (x + y) % 5 === 0) put(x, y, '#ffe9a0');
      } else if (kind === 'leaves') {
        if (n < 0.04) put(x, y, ['#c8571f', '#e0902a', '#a83a1a', '#d9b53a'][Math.floor(hash(x, y * 5) * 4)]);
        if (n > 0.985 && y - y0 < 12) put(x + 1, y, '#c8571f');
      }
    }
  }
}

function trimTouch(put: Put, kind: SeasonAccent['trim'], top: number) {
  switch (kind) {
    case 'garland':
      for (let x = 0; x < N; x++) {
        const sag = Math.round(Math.sin((x / 16) * Math.PI) * 2);
        put(x, top + 1 + sag, '#2f7a3c');
        put(x, top + 2 + sag, '#3f9a4c');
        if (x % 5 === 2) put(x, top + 3 + sag, hash(x, 2) < 0.5 ? '#d9534f' : '#f2c94c');
      }
      break;
    case 'bunting': {
      for (let x = 0; x < N; x++) put(x, top + 1, '#6b4a32');
      const colors = ['#d9534f', '#f2c94c', '#4a9ad4', '#5fb96a'];
      for (let f = 0; f < 4; f++) {
        for (let r = 0; r < 4; r++) for (let x = f * 8 + 1 + r; x <= f * 8 + 6 - r; x++) put(x, top + 2 + r, colors[f]);
      }
      break;
    }
    case 'vines':
      for (let x = 0; x < N; x++) {
        put(x, top + 1 + (hash(x, 4) < 0.3 ? 1 : 0), '#3f8a3c');
        if (x % 4 === 1) for (let d = 0; d < 2 + Math.floor(hash(x, 8) * 5); d++) put(x, top + 3 + d, d % 2 ? '#5fb96a' : '#2f7a3c');
      }
      break;
    case 'leaves':
      for (let x = 0; x < N; x++) {
        const n = hash(x, 6);
        if (n < 0.35) put(x, top + 1 + Math.floor(hash(x, 9) * 3), ['#c8571f', '#e0902a', '#a83a1a', '#d9b53a'][Math.floor(hash(x * 3, 1) * 4)]);
      }
      break;
    default:
      break;
  }
}

/** The picture with the touch laid over it (where the touch has any color). */
export function compose(base: Texture, layer: Texture): Texture {
  const data = base.data.slice();
  for (let i = 0; i < data.length; i++) if (layer.data[i] >>> 24) data[i] = layer.data[i];
  return { w: base.w, h: base.h, data };
}
