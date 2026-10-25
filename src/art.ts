// All art is generated in code: no image assets to load or license.
import type { AvatarChoice, Layer, Look, SpriteIndex } from '../shared/protocol';
import { COLS, LAYER_ORDER, ROW_DIRS } from '../shared/sprites';
import { PALETTE as P, light, mix, shade } from './palette';
import { TILE } from './scale';

export { TILE };
/** Texels per side of a first-person texture: one art pixel per texel, the same as a map tile. */
export const TEX = 32;

export type Dir = 'down' | 'up' | 'left' | 'right';

export interface Texture {
  w: number;
  h: number;
  /** ABGR pixels (little-endian ImageData layout). */
  data: Uint32Array;
}

export function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx] as const;
}

export function toTexture(c: HTMLCanvasElement): Texture {
  const img = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
  return { w: c.width, h: c.height, data: new Uint32Array(img.data.buffer) };
}

/** Deterministic 0..1 noise so the map looks the same for everyone. */
export function hash(x: number, y: number) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

type Ctx = CanvasRenderingContext2D;
const rect = (ctx: Ctx, color: string, x: number, y: number, w: number, h: number) => {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
};
/** A rectangle with its four corner pixels cut off. */
const round = (ctx: Ctx, color: string, x: number, y: number, w: number, h: number) => {
  rect(ctx, color, x + 1, y, w - 2, h);
  rect(ctx, color, x, y + 1, w, h - 2);
};
const SHADOW = 'rgba(0, 0, 0, 0.16)';

// ---------------------------------------------------------------- avatars

const PANTS = '#3b4a7a';
const SHOE = '#2f2a38';
const EYE = '#2a2233';

export interface Avatar {
  /** TILE x TILE canvases, 4 walk frames per direction (2D view). */
  frames: Record<Dir, HTMLCanvasElement[]>;
  /** Same frames as raycaster textures (first-person view). */
  tex: Record<Dir, Texture[]>;
}

/** Adds a one-pixel dark outline around everything that was drawn. */
function outline(c: HTMLCanvasElement): HTMLCanvasElement {
  const [out, octx] = makeCanvas(c.width, c.height);
  const img = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
  const src = new Uint32Array(img.data.buffer);
  const dst = new Uint32Array(src);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(P.ink.slice(i, i + 2), 16));
  const ink = (255 << 24) | (b << 16) | (g << 8) | r;
  const w = c.width, h = c.height;
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && src[y * w + x] >>> 24 > 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (src[y * w + x] >>> 24 === 0 && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) {
        dst[y * w + x] = ink;
      }
    }
  }
  octx.putImageData(new ImageData(new Uint8ClampedArray(dst.buffer), w, h), 0, 0);
  return out;
}

function flipped(c: HTMLCanvasElement): HTMLCanvasElement {
  const [out, ctx] = makeCanvas(c.width, c.height);
  ctx.translate(c.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(c, 0, 0);
  return out;
}

interface Tones {
  skin: string; skinD: string; hair: string; hairL: string; hairD: string;
  shirt: string; shirtL: string; shirtD: string; blush: string; mouth: string;
}

function tonesOf(look: Look): Tones {
  return {
    skin: look.skin, skinD: shade(look.skin, 0.16),
    hair: look.hair, hairL: light(look.hair, 0.3), hairD: shade(look.hair, 0.3),
    shirt: look.shirt, shirtL: light(look.shirt, 0.2), shirtD: shade(look.shirt, 0.25),
    blush: mix(look.skin, '#e8708a', 0.45), mouth: mix(look.skin, '#8f3b3b', 0.6),
  };
}

/** Facing the camera, or away from it. `step` is +1 / -1 on the walking frames and 0 when standing. */
function paintFrontOrBack(ctx: Ctx, t: Tones, back: boolean, step: number) {
  // Legs and shoes: the stepping leg reaches a pixel lower, the other lifts.
  for (const [x0, off] of [[10, step], [17, -step]]) {
    const bottom = 27 + off;
    rect(ctx, PANTS, x0, 25, 5, bottom - 24);
    rect(ctx, shade(PANTS, 0.25), x0 + 4, 25, 1, bottom - 24);
    rect(ctx, SHOE, x0, bottom + 1, 5, 2);
    rect(ctx, light(SHOE, 0.25), x0, bottom + 1, 5, 1);
  }
  rect(ctx, PANTS, 10, 25, 12, 2);
  rect(ctx, shade(PANTS, 0.3), 10, 24, 12, 1);

  // Arms swing opposite to the legs.
  for (const [x, dy] of [[6, -step], [23, step]]) {
    const y = 17 + dy;
    rect(ctx, t.shirt, x, y, 3, 6);
    rect(ctx, t.shirtL, x, y, 3, 1);
    rect(ctx, t.shirtD, x, y + 5, 3, 1);
    rect(ctx, t.skin, x, y + 6, 3, 2);
  }

  // Torso.
  round(ctx, t.shirt, 9, 16, 14, 8);
  rect(ctx, t.shirtL, 10, 16, 12, 1);
  rect(ctx, t.shirtD, 9, 22, 14, 2);
  rect(ctx, t.shirtD, 21, 17, 2, 5);
  rect(ctx, t.skinD, 14, 15, 4, 1); // neck

  if (back) {
    round(ctx, t.hair, 9, 1, 14, 13);
    rect(ctx, t.hairL, 11, 2, 5, 1);
    rect(ctx, t.hairL, 10, 3, 2, 2);
    rect(ctx, t.hairD, 10, 11, 12, 3);
    rect(ctx, t.hairD, 15, 6, 2, 3);
    rect(ctx, t.skinD, 14, 14, 4, 1);
    return;
  }
  rect(ctx, t.skinD, 15, 16, 2, 1); // collar
  round(ctx, t.skin, 9, 3, 14, 12);
  rect(ctx, t.skinD, 21, 11, 1, 3);
  rect(ctx, t.skinD, 11, 14, 10, 1);
  round(ctx, t.hair, 9, 1, 14, 6);
  rect(ctx, t.hair, 9, 7, 2, 4);
  rect(ctx, t.hair, 21, 7, 2, 4);
  rect(ctx, t.hair, 11, 7, 6, 2);
  rect(ctx, t.hair, 17, 7, 4, 1);
  rect(ctx, t.hairL, 11, 2, 5, 1);
  rect(ctx, t.hairL, 10, 3, 2, 1);
  rect(ctx, t.hairD, 11, 6, 10, 1);
  for (const x of [12, 18]) {
    rect(ctx, t.hairD, x, 9, 2, 1);
    rect(ctx, EYE, x, 10, 2, 2);
    rect(ctx, '#ffffff', x, 10, 1, 1);
  }
  rect(ctx, t.blush, 11, 12, 2, 1);
  rect(ctx, t.blush, 19, 12, 2, 1);
  rect(ctx, t.mouth, 15, 13, 2, 1);
}

/** Facing right; the left-facing frames are this one mirrored. */
function paintSide(ctx: Ctx, t: Tones, step: number) {
  const frontLeg = 14 + 3 * step, backLeg = 14 - 3 * step;
  const frontArm = 14 - 3 * step, backArm = 14 + 3 * step;
  // Far arm and leg first, in shadow.
  rect(ctx, t.shirtD, backArm, 17, 4, 6);
  rect(ctx, t.skinD, backArm, 23, 4, 2);
  rect(ctx, shade(PANTS, 0.25), backLeg, 25, 4, 3);
  rect(ctx, SHOE, backLeg, 28, 6, 2);
  // Hips, near leg.
  rect(ctx, PANTS, 11, 25, 10, 2);
  rect(ctx, shade(PANTS, 0.3), 11, 24, 10, 1);
  rect(ctx, PANTS, frontLeg, 25, 4, 3);
  rect(ctx, SHOE, frontLeg, 28, 6, 2);
  rect(ctx, light(SHOE, 0.25), frontLeg, 28, 6, 1);
  // Torso and the near arm.
  round(ctx, t.shirt, 11, 16, 10, 8);
  rect(ctx, t.shirtL, 12, 16, 8, 1);
  rect(ctx, t.shirtD, 11, 22, 10, 2);
  rect(ctx, t.shirt, frontArm, 17, 4, 6);
  rect(ctx, t.shirtL, frontArm, 17, 4, 1);
  rect(ctx, t.skin, frontArm, 23, 4, 2);
  // Head.
  rect(ctx, t.skinD, 13, 15, 4, 1);
  round(ctx, t.skin, 10, 3, 12, 12);
  rect(ctx, t.skin, 22, 11, 1, 2);
  rect(ctx, t.skinD, 22, 12, 1, 1);
  rect(ctx, t.skinD, 15, 9, 2, 3);
  round(ctx, t.hair, 9, 1, 13, 6);
  rect(ctx, t.hair, 9, 7, 6, 6);
  rect(ctx, t.hair, 15, 7, 6, 2);
  rect(ctx, t.hairL, 11, 2, 5, 1);
  rect(ctx, t.hairL, 10, 3, 2, 1);
  rect(ctx, t.hairD, 9, 11, 6, 2);
  rect(ctx, t.hairD, 18, 9, 3, 1);
  rect(ctx, EYE, 18, 10, 2, 2);
  rect(ctx, '#ffffff', 18, 10, 1, 1);
  rect(ctx, t.blush, 17, 12, 2, 1);
  rect(ctx, t.mouth, 19, 13, 2, 1);
}

function drawCharacter(look: Look, dir: Dir, frame: number): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(TILE, TILE);
  const step = frame === 1 ? 1 : frame === 3 ? -1 : 0;
  const t = tonesOf(look);
  if (dir === 'down' || dir === 'up') paintFrontOrBack(ctx, t, dir === 'up', step);
  else paintSide(ctx, t, step);
  return outline(dir === 'left' ? flipped(c) : c);
}

const avatarCache = new Map<string, Avatar>();

export function makeAvatar(look: Look): Avatar {
  const key = `${look.shirt}${look.hair}${look.skin}`;
  const cached = avatarCache.get(key);
  if (cached) return cached;

  const frames = {} as Record<Dir, HTMLCanvasElement[]>;
  const tex = {} as Record<Dir, Texture[]>;
  for (const dir of ['down', 'up', 'right', 'left'] as Dir[]) {
    frames[dir] = [0, 1, 2, 3].map((f) => drawCharacter(look, dir, f));
    tex[dir] = frames[dir].map(toTexture);
  }
  const avatar = { frames, tex };
  avatarCache.set(key, avatar);
  return avatar;
}

// -------------------------------------------------- custom (sheet) avatars

type SheetSource = HTMLImageElement | HTMLCanvasElement;

/**
 * Slices a 4x4 sheet (see contracts/sprite-sheet.md) into the frames both views use. Frames are TILE px:
 * sheets with 32px frames are used as drawn, and sheets with 16px frames are doubled by nearest-neighbour
 * sampling, so pixel art stays crisp and every character is the same size.
 */
export function avatarFromSheet(img: SheetSource): Avatar {
  const frame = img.width / COLS;
  const frames = {} as Record<Dir, HTMLCanvasElement[]>;
  const tex = {} as Record<Dir, Texture[]>;
  ROW_DIRS.forEach((dir, row) => {
    frames[dir] = Array.from({ length: COLS }, (_, col) => {
      const [c, ctx] = makeCanvas(TILE, TILE);
      ctx.drawImage(img, col * frame, row * frame, frame, frame, 0, 0, TILE, TILE);
      return c;
    });
    tex[dir] = frames[dir].map(toTexture);
  });
  return { frames, tex };
}

/** Stacks part sheets (body, bottom, top, hair, accessory, in that order) into one character. */
export function avatarFromLayers(imgs: Partial<Record<Layer, SheetSource>>): Avatar {
  const [sheet, ctx] = makeCanvas(TILE * COLS, TILE * ROW_DIRS.length);
  for (const slot of LAYER_ORDER) {
    const img = imgs[slot];
    if (img) ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, sheet.width, sheet.height);
  }
  return avatarFromSheet(sheet);
}

const imageCache = new Map<string, Promise<HTMLImageElement>>();
const sheetAvatarCache = new Map<string, Avatar>();

function loadImage(url: string): Promise<HTMLImageElement> {
  let p = imageCache.get(url);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => {
        imageCache.delete(url);
        reject(new Error(`could not load ${url}`));
      };
      img.src = url;
    });
    imageCache.set(url, p);
  }
  return p;
}

const DEFAULT_LOOK: Look = { shirt: '#3fa7d6', hair: '#2b1d14', skin: '#f1c27d' };

/** Resolves a choice to drawable frames. Anything that cannot be loaded falls back to the built-in character. */
export async function loadAvatar(choice: AvatarChoice, index: SpriteIndex, look: Look = DEFAULT_LOOK): Promise<Avatar> {
  try {
    if (choice.kind === 'built-in') return makeAvatar(choice.look);
    if (choice.kind === 'sheet') {
      const info = index.find((s) => s.id === choice.id);
      if (!info) throw new Error(`unknown sheet ${choice.id}`);
      const cached = sheetAvatarCache.get(info.url);
      if (cached) return cached;
      const avatar = avatarFromSheet(await loadImage(info.url));
      sheetAvatarCache.set(info.url, avatar);
      return avatar;
    }
    const parts = LAYER_ORDER.flatMap((slot) => {
      const id = choice.ids[slot];
      const info = id ? index.find((s) => s.id === id) : undefined;
      if (id && !info) throw new Error(`unknown sheet ${id}`);
      return info ? [[slot, info.url] as const] : [];
    });
    const key = parts.map(([slot, url]) => `${slot}=${url}`).join('&');
    const cached = sheetAvatarCache.get(key);
    if (cached) return cached;
    const imgs = await Promise.all(parts.map(async ([slot, url]) => [slot, await loadImage(url)] as const));
    const avatar = avatarFromLayers(Object.fromEntries(imgs));
    sheetAvatarCache.set(key, avatar);
    return avatar;
  } catch (err) {
    console.warn('Using the built-in character instead:', (err as Error).message);
    return makeAvatar(look);
  }
}

// ---------------------------------------------------------------- floors

/** `sx`, `sy` are the tile's map coordinates, so patterns and noise carry on across tile edges. */
export function drawFloor(ctx: Ctx, kind: string, ox: number, oy: number, sx: number, sy: number) {
  const wx = sx * TILE, wy = sy * TILE;
  if (kind === ',') {
    const c = P.carpet;
    rect(ctx, c.base, ox, oy, TILE, TILE);
    for (let y = 0; y < TILE; y++) {
      if (y % 4 === 3) rect(ctx, c.weave, ox, oy + y, TILE, 1);
      for (let x = 0; x < TILE; x++) {
        const n = hash(wx + x, wy + y);
        if (n < 0.09) rect(ctx, c.light, ox + x, oy + y, 1, 1);
        else if (n > 0.94) rect(ctx, c.dark, ox + x, oy + y, 1, 1);
      }
    }
  } else if (kind === ';') {
    const c = P.library;
    rect(ctx, c.base, ox, oy, TILE, TILE);
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const u = wx + x, v = wy + y;
        const d1 = (u + v) % 16, d2 = (((u - v) % 16) + 16) % 16;
        if (d1 === 0 || d2 === 0) rect(ctx, c.light, ox + x, oy + y, 1, 1);
        else if (d1 === 1 || d2 === 1) rect(ctx, c.dark, ox + x, oy + y, 1, 1);
        else if (hash(u, v) > 0.95) rect(ctx, c.dark, ox + x, oy + y, 1, 1);
      }
    }
  } else if (kind === '_') {
    const k = P.kitchen;
    for (let q = 0; q < 4; q++) {
      const qx = q % 2, qy = q >> 1;
      const col = (sx * 2 + qx + sy * 2 + qy) % 2 ? k.b : k.a;
      const x = ox + qx * 16, y = oy + qy * 16;
      rect(ctx, col, x, y, 16, 16);
      rect(ctx, light(col, 0.4), x, y, 16, 1);
      rect(ctx, light(col, 0.4), x, y, 1, 16);
      rect(ctx, k.grout, x + 15, y, 1, 16);
      rect(ctx, k.grout, x, y + 15, 16, 1);
    }
  } else {
    const w = P.floorWood;
    rect(ctx, w.base, ox, oy, TILE, TILE);
    for (let i = 0; i < 4; i++) {
      const y = oy + i * 8;
      const n = hash(sx, sy * 4 + i);
      const plank = n < 0.3 ? mix(w.base, w.light, 0.65) : n > 0.75 ? mix(w.base, w.dark, 0.65) : w.base;
      rect(ctx, plank, ox, y, TILE, 7);
      rect(ctx, light(plank, 0.18), ox, y, TILE, 1);
      rect(ctx, w.seam, ox, y + 7, TILE, 1);
      for (let g = 0; g < 3; g++) {
        const gx = Math.floor(hash(sx * 5 + g, sy * 4 + i + 9) * 22);
        const len = 4 + Math.floor(hash(sx + g, sy * 3 + i) * 6);
        rect(ctx, w.grain, ox + gx, y + 2 + g * 2, len, 1);
      }
      const seam = Math.floor(hash(sx * 7 + i, sy * 3 + 1) * TILE);
      rect(ctx, w.seam, ox + seam, y, 1, 7);
    }
  }
}

export function drawWelcomeMat(ctx: Ctx, ox: number, oy: number) {
  const m = P.mat;
  round(ctx, m.edge, ox + 3, oy + 7, 26, 20);
  round(ctx, m.field, ox + 5, oy + 9, 22, 16);
  rect(ctx, light(m.field, 0.12), ox + 5, oy + 9, 22, 1);
  rect(ctx, m.stripe, ox + 9, oy + 15, 14, 3);
  rect(ctx, m.edge, ox + 12, oy + 16, 8, 1);
  for (const x of [3, 28]) for (let y = 9; y < 25; y += 3) rect(ctx, light(m.edge, 0.3), ox + x - (x < 10 ? 1 : 0), oy + y, 1, 2);
}

// ------------------------------------------------------- walls (both views)

/**
 * The front of a wall: the part with windows, shelves and so on. It is `h` pixels tall and TILE wide. The top-down
 * view shows 20 rows under the cap; first person shows the whole 32.
 */
function paintWallFace(ctx: Ctx, kind: string, x: number, y: number, h: number) {
  const f = P.wallFace;
  const body = h - 5; // everything above the baseboard
  const base = () => {
    rect(ctx, f.base, x, y, TILE, h);
    rect(ctx, f.light, x, y, TILE, 2);
    for (let i = 0; i < 8; i++) {
      rect(ctx, f.speck, x + Math.floor(hash(x + i * 3, y + i) * 31), y + 3 + Math.floor(hash(y + i, x + i * 5) * (body - 4)), 1, 1);
    }
    rect(ctx, f.trimLight, x, y + h - 5, TILE, 1);
    rect(ctx, f.trim, x, y + h - 4, TILE, 4);
    rect(ctx, shade(f.trim, 0.25), x, y + h - 1, TILE, 1);
  };

  switch (kind) {
    case 'G': {
      base();
      const g = P.glass;
      const wy = y + 2, wh = body - 4;
      rect(ctx, g.frame, x + 2, wy, 28, wh);
      const iy = wy + 2, ih = wh - 4;
      for (let r = 0; r < ih; r++) rect(ctx, mix(g.skyTop, g.skyBottom, r / Math.max(1, ih - 1)), x + 4, iy + r, 24, 1);
      rect(ctx, g.cloud, x + 7, iy + 1, 6, 1);
      rect(ctx, g.cloud, x + 9, iy, 3, 1);
      rect(ctx, g.cloud, x + 20, iy + Math.min(3, ih - 2), 5, 1);
      for (let i = 0; i < ih && i < 6; i++) rect(ctx, light(g.skyBottom, 0.5), x + 5 + i, iy + i, 2, 1);
      rect(ctx, g.frame, x + 15, iy, 2, ih);
      if (ih >= 10) rect(ctx, g.frame, x + 4, iy + Math.floor(ih / 2), 24, 2);
      rect(ctx, g.frameDark, x + 1, wy + wh, 30, 2);
      break;
    }
    case 'W': {
      base();
      const b = P.board;
      const fy = y + 2, fh = body - 3;
      rect(ctx, b.frame, x, fy, TILE, fh);
      rect(ctx, b.face, x, fy + 2, TILE, fh - 4);
      rect(ctx, b.frameDark, x, fy + fh - 1, TILE, 1);
      const lines = Math.floor((fh - 4) / 3);
      const colors = [b.red, b.blue, b.green];
      for (let r = 0; r < lines; r++) {
        const w = 8 + Math.floor(hash(x + r, y + r * 3) * 16);
        const lx = x + 2 + Math.floor(hash(x * 3 + r, y) * (TILE - w - 4));
        rect(ctx, colors[Math.floor(hash(x + r * 7, y + 1) * 3)], lx, fy + 3 + r * 3, w, 1);
      }
      rect(ctx, b.red, x + 22, fy + fh - 2, 3, 1);
      rect(ctx, b.blue, x + 26, fy + fh - 2, 3, 1);
      break;
    }
    case 'B': {
      const s = P.shelf;
      rect(ctx, s.wood, x, y, TILE, h);
      rect(ctx, s.dark, x, y, 1, h);
      rect(ctx, s.dark, x + TILE - 1, y, 1, h);
      const n = Math.max(2, Math.floor(body / 7));
      const sh = Math.floor(body / n);
      for (let r = 0; r < n; r++) {
        const board = y + (r + 1) * sh;
        for (let bx = x + 1; bx < x + TILE - 1;) {
          const bw = 3 + Math.floor(hash(bx * 3, y + r) * 2);
          const bh = sh - 4 - Math.floor(hash(bx * 5, r * 3 + y) * 3);
          const col = s.books[Math.floor(hash(bx * 13 + y, r * 7) * s.books.length)];
          const w = Math.min(bw, x + TILE - 1 - bx);
          rect(ctx, col, bx, board - 2 - bh, w, bh);
          rect(ctx, light(col, 0.3), bx, board - 2 - bh, 1, bh);
          if (w > 2) rect(ctx, shade(col, 0.3), bx + w - 1, board - 2 - bh, 1, bh);
          rect(ctx, shade(col, 0.2), bx, board - 2 - bh, w, 1);
          bx += bw + (hash(bx, r * 11 + y) < 0.15 ? 2 : 0);
        }
        rect(ctx, s.light, x, board - 2, TILE, 1);
        rect(ctx, s.dark, x, board - 1, TILE, 1);
      }
      rect(ctx, s.dark, x, y + n * sh, TILE, h - n * sh);
      break;
    }
    case 'K': {
      const c = P.counter;
      const splash = Math.max(0, h - 24);
      rect(ctx, P.wallFace.base, x, y, TILE, h);
      for (let r = 0; r < splash; r += 4) {
        for (let q = 0; q < TILE; q += 4) rect(ctx, (q + r) / 4 % 2 ? c.splash : c.splashB, x + q, y + r, 4, Math.min(4, splash - r));
      }
      const top = y + splash;
      rect(ctx, c.top, x, top, TILE, 5);
      rect(ctx, light(c.top, 0.5), x, top, TILE, 1);
      rect(ctx, c.topDark, x, top + 4, TILE, 1);
      const cy = top + 5, ch = y + h - cy;
      rect(ctx, c.cabinet, x, cy, TILE, ch);
      for (const px of [x + 2, x + 18]) {
        rect(ctx, c.cabinetLight, px, cy + 2, 12, 1);
        rect(ctx, c.cabinetDark, px, cy + 2, 1, ch - 6);
        rect(ctx, c.cabinetDark, px, cy + ch - 5, 12, 1);
        rect(ctx, c.cabinetDark, px + 11, cy + 2, 1, ch - 6);
      }
      rect(ctx, c.cabinetDark, x + 15, cy, 2, ch);
      rect(ctx, c.handle, x + 12, cy + 3, 2, 5);
      rect(ctx, c.handle, x + 18, cy + 3, 2, 5);
      rect(ctx, shade(c.cabinet, 0.45), x, y + h - 2, TILE, 2);
      break;
    }
    default:
      base();
  }
}

/**
 * Walls are drawn in a 3/4 view: a dark cap, plus a front face when the
 * tile below is open floor, which is where windows, shelves etc. show.
 */
export function drawWall2D(ctx: Ctx, kind: string, ox: number, oy: number, faceVisible: boolean, edgeAbove: boolean) {
  const c = P.wallCap;
  rect(ctx, c.base, ox, oy, TILE, TILE);
  for (let i = 0; i < 8; i++) {
    const n = hash(ox + i * 5, oy + i * 3);
    rect(ctx, mix(c.base, n < 0.5 ? c.light : c.dark, 0.5), ox + Math.floor(hash(ox + i, oy) * 31), oy + 2 + Math.floor(hash(oy + i, ox) * 6), 1, 1);
  }
  if (edgeAbove) rect(ctx, c.light, ox, oy, TILE, 2);
  if (!faceVisible) return;
  rect(ctx, mix(c.base, c.light, 0.35), ox, oy + 8, TILE, 2);
  rect(ctx, c.shadow, ox, oy + 10, TILE, 2);
  paintWallFace(ctx, kind, ox, oy + 12, 20);
}

// -------------------------------------------------- furniture (2D view)

function monitor(ctx: Ctx, x: number, y: number, back: boolean) {
  const m = P.monitor;
  rect(ctx, m.body, x + 8, y, 16, 11);
  if (back) {
    rect(ctx, m.back, x + 9, y + 1, 14, 9);
    rect(ctx, light(m.back, 0.35), x + 15, y + 4, 2, 2);
  } else {
    rect(ctx, m.screen, x + 9, y + 1, 14, 8);
    rect(ctx, m.screenLight, x + 10, y + 2, 6, 1);
    rect(ctx, m.screenLight, x + 10, y + 3, 3, 1);
    rect(ctx, shade(m.screen, 0.3), x + 9, y + 8, 14, 1);
  }
  rect(ctx, m.stand, x + 14, y + 11, 4, 2);
  rect(ctx, m.stand, x + 11, y + 13, 10, 1);
}

function keyboard(ctx: Ctx, x: number, y: number) {
  rect(ctx, '#cfd3da', x + 9, y, 14, 4);
  rect(ctx, '#aeb4bf', x + 9, y + 3, 14, 1);
  for (let kx = 10; kx < 22; kx += 2) {
    rect(ctx, '#8d94a0', x + kx, y + 1, 1, 1);
    rect(ctx, '#8d94a0', x + kx + 1, y + 2, 1, 1);
  }
}

function mug(ctx: Ctx, x: number, y: number) {
  rect(ctx, '#f4f1ea', x, y, 5, 5);
  rect(ctx, '#d6d1c4', x, y + 4, 5, 1);
  rect(ctx, '#f4f1ea', x + 5, y + 1, 2, 3);
  rect(ctx, P.desk.top, x + 5, y + 2, 1, 1);
  rect(ctx, '#6b4a2f', x + 1, y, 3, 1);
}

function papers(ctx: Ctx, x: number, y: number) {
  rect(ctx, '#d8d3c6', x + 1, y + 2, 11, 13);
  rect(ctx, '#f7f4ee', x, y, 11, 13);
  for (let i = 0; i < 4; i++) rect(ctx, '#c9c4b8', x + 2, y + 2 + i * 3, 7, 1);
}

function lamp(ctx: Ctx, x: number, y: number) {
  rect(ctx, '#3b3f4e', x, y + 11, 7, 2);
  rect(ctx, '#5a606e', x + 3, y + 3, 1, 8);
  rect(ctx, '#f2cf62', x, y, 8, 4);
  rect(ctx, '#fff0a8', x + 1, y, 6, 1);
}

function deskTile(ctx: Ctx, ox: number, oy: number, nb: (dx: number, dy: number) => string, sitsAboveOverride?: boolean) {
  const D = P.desk;
  const same = (dx: number, dy: number) => nb(dx, dy) === 'd';
  const left = same(-1, 0), right = same(1, 0), above = same(0, -1), below = same(0, 1);
  const chairAbove = sitsAboveOverride ?? nb(0, -1) === 'h';
  const l = left ? 0 : 2, r = right ? TILE : TILE - 2;
  const top = above ? 0 : 4, bottom = below ? TILE : 24;

  rect(ctx, D.top, ox + l, oy + top, r - l, bottom - top);
  if (!above) rect(ctx, D.topLight, ox + l, oy + top, r - l, 2);
  if (!left) rect(ctx, D.topLight, ox + l, oy + top, 1, bottom - top);
  if (!right) rect(ctx, D.topDark, ox + r - 1, oy + top, 1, bottom - top);
  for (let i = 0; i < 3; i++) {
    const len = 6 + Math.floor(hash(ox + i * 3, oy + 7) * 6);
    const gx = Math.floor(hash(ox + i * 9, oy + i) * (r - l - len));
    rect(ctx, D.grain, ox + l + gx, oy + top + 5 + i * 6, len, 1);
  }
  if (!below) {
    rect(ctx, D.lip, ox + l, oy + bottom, r - l, 6);
    rect(ctx, D.lipDark, ox + l, oy + bottom + 5, r - l, 1);
    rect(ctx, SHADOW, ox + l, oy + bottom + 6, r - l, 2);
  } else {
    // A divider screen between the two rows of a pod.
    rect(ctx, D.screen, ox + l, oy + 28, r - l, 4);
    rect(ctx, D.screenLight, ox + l, oy + 28, r - l, 1);
    rect(ctx, D.screenDark, ox + l, oy + 31, r - l, 1);
  }
  if (above) rect(ctx, SHADOW, ox + l, oy, r - l, 2);

  // What is on the desk depends on where this tile sits in its run of desks. Whoever sits at the far
  // side sees the screen, so from here that row shows the back of the monitor.
  const sitsAbove = chairAbove;
  const mid = left && right;
  if (mid || (!left && !right)) {
    if (sitsAbove) {
      keyboard(ctx, ox, oy + 6);
      monitor(ctx, ox, oy + 12, true);
    } else {
      monitor(ctx, ox, oy + 5, false);
      keyboard(ctx, ox, oy + 19);
    }
  } else if (!left) {
    if (hash(ox, oy) < 0.5) mug(ctx, ox + 9, oy + (sitsAbove ? 8 : 11));
    else lamp(ctx, ox + 12, oy + (sitsAbove ? 6 : 6));
  } else {
    if (hash(ox, oy) < 0.5) papers(ctx, ox + 10, oy + (sitsAbove ? 6 : 6));
    else {
      rect(ctx, '#c0504a', ox + 9, oy + 8, 10, 12);
      rect(ctx, '#e4efe9', ox + 11, oy + 10, 6, 1);
      rect(ctx, '#4a9ad4', ox + 20, oy + 14, 7, 1);
    }
  }
}

/**
 * Paints one tile of furniture. `rot` says which way a desk or chair faces (0 south, 2 north); when it is left out,
 * the way is worked out from what stands beside it, as the swatches in the builder do.
 */
export function drawFurniture2D(ctx: Ctx, kind: string, ox: number, oy: number, nb: (dx: number, dy: number) => string, rot?: number) {
  const same = (dx: number, dy: number) => nb(dx, dy) === kind;
  switch (kind) {
    case 'd':
      deskTile(ctx, ox, oy, nb, rot === undefined ? undefined : rot === 2);
      break;
    case 't': {
      const T = P.table;
      const l = same(-1, 0) ? 0 : 2, r = same(1, 0) ? TILE : TILE - 2;
      const t = same(0, -1) ? 0 : 2, b = same(0, 1) ? TILE : 26;
      rect(ctx, T.top, ox + l, oy + t, r - l, b - t);
      if (!same(0, -1)) rect(ctx, T.topLight, ox + l, oy + t, r - l, 2);
      if (!same(-1, 0)) rect(ctx, T.topLight, ox + l, oy + t, 1, b - t);
      if (!same(1, 0)) rect(ctx, T.edge, ox + r - 1, oy + t, 1, b - t);
      for (let i = 0; i < 2; i++) {
        const gx = Math.floor(hash(ox + i * 7, oy + 3) * (r - l - 10));
        rect(ctx, mix(T.top, T.edge, 0.25), ox + l + gx, oy + t + 6 + i * 8, 8, 1);
      }
      if (!same(0, 1)) {
        rect(ctx, T.edge, ox + l, oy + b, r - l, 4);
        rect(ctx, shade(T.edge, 0.3), ox + l, oy + b + 3, r - l, 1);
        rect(ctx, SHADOW, ox + l, oy + b + 4, r - l, 2);
      }
      const n = hash(ox + 11, oy + 5);
      if (n < 0.18) mug(ctx, ox + 12, oy + 10);
      else if (n < 0.3) papers(ctx, ox + 10, oy + 6);
      break;
    }
    case 'h': {
      const C = P.chair;
      const up = nb(0, -1), facingUp = rot === undefined ? up === 'd' || up === 't' : rot === 2;
      rect(ctx, SHADOW, ox + 7, oy + 22, 18, 5);
      rect(ctx, C.base, ox + 15, oy + 21, 2, 5);
      rect(ctx, C.base, ox + 9, oy + 25, 5, 2);
      rect(ctx, C.base, ox + 18, oy + 25, 5, 2);
      round(ctx, C.seat, ox + 8, oy + 10, 16, 12);
      rect(ctx, C.seatLight, ox + 10, oy + 11, 12, 2);
      rect(ctx, C.seatDark, ox + 10, oy + 20, 12, 2);
      if (facingUp) {
        round(ctx, C.seatDark, ox + 9, oy + 22, 14, 6);
        rect(ctx, C.seat, ox + 11, oy + 23, 10, 3);
      } else {
        round(ctx, C.seatDark, ox + 9, oy + 3, 14, 7);
        rect(ctx, C.seat, ox + 11, oy + 4, 10, 4);
        rect(ctx, C.seatLight, ox + 11, oy + 4, 10, 1);
      }
      break;
    }
    case 'p': {
      const L = P.plant;
      rect(ctx, SHADOW, ox + 8, oy + 29, 16, 3);
      rect(ctx, L.potLight, ox + 9, oy + 21, 14, 2);
      rect(ctx, L.pot, ox + 10, oy + 23, 12, 6);
      rect(ctx, L.potDark, ox + 18, oy + 23, 4, 6);
      rect(ctx, L.potLight, ox + 10, oy + 23, 1, 6);
      rect(ctx, L.pot, ox + 11, oy + 29, 10, 2);
      rect(ctx, L.soil, ox + 11, oy + 22, 10, 1);
      blob(ctx, ox + 2, oy, 28, 24, ox + oy);
      break;
    }
    case 's': {
      const S = P.sofa;
      const l = same(-1, 0) ? 0 : 2, r = same(1, 0) ? TILE : TILE - 2;
      rect(ctx, SHADOW, ox + l, oy + 26, r - l, 5);
      rect(ctx, S.dark, ox + l, oy + 4, r - l, 22);
      rect(ctx, S.base, ox + l, oy + 4, r - l, 10);
      rect(ctx, S.light, ox + l, oy + 4, r - l, 2);
      rect(ctx, S.base, ox + l, oy + 14, r - l, 10);
      rect(ctx, S.light, ox + l, oy + 14, r - l, 2);
      rect(ctx, S.seam, ox + 15, oy + 14, 1, 10);
      rect(ctx, S.seam, ox + l, oy + 24, r - l, 2);
      if (!same(-1, 0)) {
        rect(ctx, S.dark, ox + 2, oy + 6, 6, 20);
        rect(ctx, S.base, ox + 3, oy + 7, 4, 17);
        rect(ctx, S.light, ox + 3, oy + 7, 4, 2);
      }
      if (!same(1, 0)) {
        rect(ctx, S.dark, ox + TILE - 8, oy + 6, 6, 20);
        rect(ctx, S.base, ox + TILE - 7, oy + 7, 4, 17);
        rect(ctx, S.light, ox + TILE - 7, oy + 7, 4, 2);
      }
      break;
    }
  }
}

/**
 * Paints furniture that is turned a quarter (west or east) as one piece: it is drawn facing south, then turned with
 * the same pixels, so it stays crisp. `w` and `d` are the tiles it covers after turning; (ox, oy) is its top-left corner.
 */
export function drawTurned2D(ctx: Ctx, tile: string, rot: number, ox: number, oy: number, w: number, d: number) {
  const cw = rot % 2 ? d : w, ch = rot % 2 ? w : d; // the size it has facing south
  const [c, cctx] = makeCanvas(cw * TILE, ch * TILE);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const inside = (dx: number, dy: number) => x + dx >= 0 && y + dy >= 0 && x + dx < cw && y + dy < ch;
      drawFurniture2D(cctx, tile, x * TILE, y * TILE, (dx, dy) => (inside(dx, dy) ? tile : '.'), 0);
    }
  }
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(ox + (w * TILE) / 2, oy + (d * TILE) / 2);
  ctx.rotate((rot * Math.PI) / 2);
  ctx.drawImage(c, -(cw * TILE) / 2, -(ch * TILE) / 2);
  ctx.restore();
}

/** A leafy blob for plants: lit at the top left, darker underneath and around the rim. */
function blob(ctx: Ctx, ox: number, oy: number, w: number, h: number, seed: number) {
  const L = P.plant;
  const cx = w / 2, cy = h / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x + 0.5 - cx) / cx, dy = (y + 0.5 - cy) / cy;
      const n = hash(seed + x, y);
      const d = dx * dx + dy * dy + (n - 0.5) * 0.45;
      if (d > 1) continue;
      let col = L.leaf;
      if (d > 0.72 || (dy > 0.35 && n > 0.45)) col = L.leafDark;
      else if ((dy < -0.1 && dx < 0.25 && n < 0.55) || n < 0.1) col = L.leafLight;
      rect(ctx, col, ox + x, oy + y, 1, 1);
    }
  }
}

// ---------------------------------------------- textures (first person)

function tex(w: number, h: number, paint: (ctx: Ctx) => void): Texture {
  const [c, ctx] = makeCanvas(w, h);
  paint(ctx);
  return toTexture(c);
}

export function makeWallTextures(): Record<string, Texture> {
  const face = (kind: string) => tex(TEX, TEX, (ctx) => paintWallFace(ctx, kind, 0, 0, TEX));
  return { '#': face('#'), G: face('G'), W: face('W'), B: face('B'), K: face('K') };
}

export function makeFloorTextures(): Record<string, Texture> {
  const out: Record<string, Texture> = {};
  for (const kind of ['.', ',', ';', '_']) out[kind] = tex(TEX, TEX, (ctx) => drawFloor(ctx, kind, 0, 0, 0, 0));
  return out;
}

export function makeCeilingTextures() {
  const c = P.ceiling;
  const paint = (lit: boolean) => (ctx: Ctx) => {
    rect(ctx, c.base, 0, 0, TEX, TEX);
    for (let i = 0; i < 40; i++) rect(ctx, c.speck, Math.floor(hash(i, 9) * TEX), Math.floor(hash(i, 8) * TEX), 1, 1);
    rect(ctx, c.line, 0, 0, TEX, 1);
    rect(ctx, c.line, 0, 0, 1, TEX);
    rect(ctx, light(c.base, 0.5), 1, 1, TEX - 1, 1);
    rect(ctx, light(c.base, 0.5), 1, 1, 1, TEX - 1);
    if (lit) {
      rect(ctx, c.lamp, 5, 5, 22, 22);
      rect(ctx, c.glow, 7, 7, 18, 18);
      rect(ctx, '#ffffff', 11, 11, 10, 10);
    }
  };
  return { plain: tex(TEX, TEX, paint(false)), light: tex(TEX, TEX, paint(true)) };
}

export interface SpriteArt {
  tex: Texture;
  /** World-space size; 1 = one tile wide / one wall tall. */
  w: number;
  h: number;
}

/** A tileable 32×32 surface: a base colour flecked with lighter and darker pixels. */
function speckle(ctx: Ctx, base: string, lightC: string, darkC: string, seed: number, amount = 0.12) {
  rect(ctx, base, 0, 0, 32, 32);
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const n = hash(x + seed * 17, y + seed * 31);
      if (n < amount) rect(ctx, lightC, x, y, 1, 1);
      else if (n > 1 - amount) rect(ctx, darkC, x, y, 1, 1);
    }
  }
}

/** Surfaces for the solid furniture in first person, all from the shared palette. Each is tileable. */
export function makeMaterials(): Record<string, Texture> {
  const D = P.desk, M = P.monitor, C = P.chair, T = P.table, L = P.plant, S = P.sofa;
  const paint = (f: (ctx: Ctx) => void) => tex(32, 32, f);
  const wood = (base: string, lightC: string, dark: string, seed: number) => paint((ctx) => {
    rect(ctx, base, 0, 0, 32, 32);
    for (let y = 0; y < 32; y += 4) {
      rect(ctx, y % 8 === 0 ? lightC : dark, 0, y + 1, 32, 1);
      const gx = Math.floor(hash(y, seed) * 24);
      rect(ctx, dark, gx, y + 2, 7, 1);
    }
  });
  return {
    woodTop: wood(D.top, D.topLight, D.grain, 3),
    woodDark: wood(D.lip, mix(D.lip, D.top, 0.35), D.lipDark, 5),
    tableTop: wood(T.top, T.topLight, mix(T.top, T.edge, 0.3), 7),
    tableLeg: wood(T.edge, mix(T.edge, T.top, 0.3), shade(T.edge, 0.25), 9),
    metal: paint((ctx) => speckle(ctx, M.stand, light(M.stand, 0.22), shade(M.stand, 0.25), 11, 0.1)),
    metalDark: paint((ctx) => speckle(ctx, M.body, light(M.body, 0.15), shade(M.body, 0.3), 13, 0.08)),
    // A lit screen with a soft highlight and faint lines. It is used once across the whole face of the monitor.
    screen: paint((ctx) => {
      rect(ctx, M.screen, 0, 0, 32, 32);
      for (let y = 0; y < 32; y += 3) rect(ctx, mix(M.screen, M.screenLight, 0.25), 0, y, 32, 1);
      rect(ctx, M.screenLight, 3, 3, 14, 2);
      rect(ctx, M.screenLight, 3, 7, 9, 2);
      rect(ctx, mix(M.screen, M.body, 0.45), 20, 18, 9, 9);
    }),
    paper: paint((ctx) => {
      rect(ctx, '#f4f1ea', 0, 0, 32, 32);
      for (let y = 4; y < 30; y += 5) rect(ctx, '#b9b3a4', 4, y, 24, 1);
    }),
    chair: paint((ctx) => speckle(ctx, C.seat, C.seatLight, C.seatDark, 15, 0.1)),
    chairDark: paint((ctx) => speckle(ctx, C.seatDark, C.seat, shade(C.seatDark, 0.3), 17, 0.08)),
    sofa: paint((ctx) => {
      speckle(ctx, S.base, S.light, S.dark, 19, 0.1);
      rect(ctx, S.seam, 15, 0, 1, 32);
    }),
    sofaDark: paint((ctx) => speckle(ctx, S.dark, S.base, S.seam, 21, 0.08)),
    leaf: paint((ctx) => speckle(ctx, L.leaf, L.leafLight, L.leafDark, 23, 0.28)),
    leafDark: paint((ctx) => speckle(ctx, L.leafDark, L.leaf, shade(L.leafDark, 0.3), 25, 0.25)),
    pot: paint((ctx) => {
      rect(ctx, L.pot, 0, 0, 32, 32);
      rect(ctx, L.potLight, 0, 0, 5, 32);
      rect(ctx, L.potDark, 22, 0, 10, 32);
      rect(ctx, L.potLight, 0, 0, 32, 2);
    }),
  };
}

