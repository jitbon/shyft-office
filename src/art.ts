// All art is generated in code: no image assets to load or license.
import type { AvatarChoice, Layer, Look, SpriteIndex } from '../shared/protocol';
import { COLS, LAYER_ORDER, ROW_DIRS } from '../shared/sprites';

export const TILE = 16;
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

// ---------------------------------------------------------------- avatars

const FRONT = [
  '................',
  '....kkkkkkkk....',
  '...khhhhhhhhk...',
  '...khhhhhhhhk...',
  '...khsssssshk...',
  '...ksessssesk...',
  '...kssssssssk...',
  '....kssssssk....',
  '...kkcccccckk...',
  '..kcccccccccck..',
  '..ksccccccccsk..',
  '...kcccccccck...',
  '...kppppppppk...',
  '...kpppkkpppk...',
];
const BACK = FRONT.map((row, i) =>
  i >= 4 && i <= 6 ? '...khhhhhhhhk...' : i === 7 ? '....khhhhhhk....' : row,
);
const SIDE = [
  '................',
  '....kkkkkkk.....',
  '...khhhhhhhk....',
  '...khhhhhhhhk...',
  '...khhhhssssk...',
  '...khhhsssesk...',
  '...khhssssssk...',
  '....kksssssk....',
  '....kcccccck....',
  '....kcccccck....',
  '....kccsccck....',
  '....kcccccck....',
  '....kppppppk....',
  '....kppppppk....',
];
const FRONT_LEGS = [
  ['...kppk..kppk...', '...kkkk..kkkk...'],
  ['...kkkk..kppk...', '.........kkkk...'],
  ['...kppk..kppk...', '...kkkk..kkkk...'],
  ['...kppk..kkkk...', '...kkkk.........'],
];
const SIDE_LEGS = [
  ['....kppppppk....', '....kkk..kkk....'],
  ['...kppk..kppk...', '...kkk....kkk...'],
  ['....kppppppk....', '....kkk..kkk....'],
  ['....kpkkppk.....', '....kkk.kkk.....'],
];

export interface Avatar {
  /** 16x16 canvases, 4 walk frames per direction (2D view). */
  frames: Record<Dir, HTMLCanvasElement[]>;
  /** Same frames as raycaster textures (first-person view). */
  tex: Record<Dir, Texture[]>;
}

const avatarCache = new Map<string, Avatar>();

export function makeAvatar(look: Look): Avatar {
  const key = `${look.shirt}${look.hair}${look.skin}`;
  const cached = avatarCache.get(key);
  if (cached) return cached;

  const palette: Record<string, string> = {
    k: '#1a1c2c', e: '#1a1c2c', p: '#2b3a67', s: look.skin, h: look.hair, c: look.shirt,
  };
  const draw = (rows: string[], mirror: boolean) => {
    const [c, ctx] = makeCanvas(16, 16);
    rows.forEach((row, y) => {
      for (let x = 0; x < 16; x++) {
        const col = palette[row[x]];
        if (col) rect(ctx, col, mirror ? 15 - x : x, y, 1, 1);
      }
    });
    return c;
  };

  const frames = {} as Record<Dir, HTMLCanvasElement[]>;
  const tex = {} as Record<Dir, Texture[]>;
  const dirs: [Dir, string[], string[][], boolean][] = [
    ['down', FRONT, FRONT_LEGS, false],
    ['up', BACK, FRONT_LEGS, false],
    ['right', SIDE, SIDE_LEGS, false],
    ['left', SIDE, SIDE_LEGS, true],
  ];
  for (const [dir, body, legs, mirror] of dirs) {
    frames[dir] = legs.map((l) => draw([...body, ...l], mirror));
    tex[dir] = frames[dir].map(toTexture);
  }
  const avatar = { frames, tex };
  avatarCache.set(key, avatar);
  return avatar;
}

// -------------------------------------------------- custom (sheet) avatars

type SheetSource = HTMLImageElement | HTMLCanvasElement;

/**
 * Slices a 4x4 sheet (see contracts/sprite-sheet.md) into the frames both views use. Sheets with
 * 32px frames are shrunk to 16px by nearest-neighbour sampling, so pixel art stays crisp.
 */
export function avatarFromSheet(img: SheetSource): Avatar {
  const frame = img.width / COLS;
  const frames = {} as Record<Dir, HTMLCanvasElement[]>;
  const tex = {} as Record<Dir, Texture[]>;
  ROW_DIRS.forEach((dir, row) => {
    frames[dir] = Array.from({ length: COLS }, (_, col) => {
      const [c, ctx] = makeCanvas(16, 16);
      ctx.drawImage(img, col * frame, row * frame, frame, frame, 0, 0, 16, 16);
      return c;
    });
    tex[dir] = frames[dir].map(toTexture);
  });
  return { frames, tex };
}

/** Stacks part sheets (body, bottom, top, hair, accessory, in that order) into one character. */
export function avatarFromLayers(imgs: Partial<Record<Layer, SheetSource>>): Avatar {
  const [sheet, ctx] = makeCanvas(16 * COLS, 16 * ROW_DIRS.length);
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

export function drawFloor(ctx: Ctx, kind: string, ox: number, oy: number, sx: number, sy: number) {
  if (kind === ',' || kind === ';') {
    const carpet = kind === ',';
    rect(ctx, carpet ? '#4d6a9a' : '#7b4b55', ox, oy, 16, 16);
    const hi = carpet ? '#5a78aa' : '#8c5963';
    const lo = carpet ? '#43608e' : '#6c414b';
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        if (carpet) {
          const n = hash(sx * 16 + x, sy * 16 + y);
          if (n < 0.08) rect(ctx, hi, ox + x, oy + y, 1, 1);
          else if (n > 0.94) rect(ctx, lo, ox + x, oy + y, 1, 1);
        } else if ((x + y) % 8 === 0 || (x - y + 16) % 8 === 0) {
          rect(ctx, hi, ox + x, oy + y, 1, 1);
        }
      }
    }
  } else if (kind === '_') {
    for (let q = 0; q < 4; q++) {
      const qx = q % 2, qy = q >> 1;
      rect(ctx, (qx + qy) % 2 ? '#e9e6df' : '#cbc6bc', ox + qx * 8, oy + qy * 8, 8, 8);
    }
  } else {
    rect(ctx, '#c99e6e', ox, oy, 16, 16);
    for (let i = 0; i < 4; i++) {
      if (hash(sx, sy * 4 + i) < 0.35) rect(ctx, '#c09464', ox, oy + i * 4, 16, 3);
      rect(ctx, '#a77b4f', ox, oy + i * 4 + 3, 16, 1);
      const seam = Math.floor(hash(sx * 7 + i, sy * 3 + 1) * 16);
      rect(ctx, '#a77b4f', ox + seam, oy + i * 4, 1, 3);
    }
  }
}

export function drawWelcomeMat(ctx: Ctx, ox: number, oy: number) {
  rect(ctx, '#7a2e3a', ox + 1, oy + 3, 14, 10);
  rect(ctx, '#a8434f', ox + 2, oy + 4, 12, 8);
  rect(ctx, '#f4d28a', ox + 4, oy + 7, 8, 2);
}

// ------------------------------------------------------- walls (2D view)

/**
 * Walls are drawn in a 3/4 view: a dark cap, plus a front face when the
 * tile below is open floor, which is where windows, shelves etc. show.
 */
export function drawWall2D(ctx: Ctx, kind: string, ox: number, oy: number, faceVisible: boolean, edgeAbove: boolean) {
  rect(ctx, '#3a3e5a', ox, oy, 16, 16);
  if (edgeAbove) rect(ctx, '#565b80', ox, oy, 16, 1);
  if (!faceVisible) return;
  rect(ctx, '#23263a', ox, oy + 5, 16, 1);
  const fy = oy + 6;
  const wallBase = () => {
    rect(ctx, '#e6dccb', ox, fy, 16, 10);
    rect(ctx, '#d3c7b3', ox, fy, 16, 1);
    rect(ctx, '#8a7560', ox, fy + 8, 16, 2);
  };
  switch (kind) {
    case 'G':
      wallBase();
      rect(ctx, '#ffffff', ox + 1, fy + 1, 14, 6);
      rect(ctx, '#8fd0ff', ox + 2, fy + 2, 12, 4);
      rect(ctx, '#c8ecff', ox + 3, fy + 2, 2, 1);
      rect(ctx, '#c8ecff', ox + 9, fy + 3, 1, 1);
      rect(ctx, '#ffffff', ox + 7, fy + 2, 2, 4);
      break;
    case 'W':
      wallBase();
      rect(ctx, '#9aa0a6', ox, fy + 1, 16, 6);
      rect(ctx, '#fbfbfb', ox, fy + 2, 16, 4);
      rect(ctx, '#e04f5f', ox + 2, fy + 3, 5, 1);
      rect(ctx, '#3fa7d6', ox + 9, fy + 3, 4, 1);
      rect(ctx, '#5cb85c', ox + 4, fy + 4, 6, 1);
      break;
    case 'B': {
      rect(ctx, '#5c3d24', ox, fy, 16, 10);
      const books = ['#c0392b', '#2e86c1', '#f1c40f', '#27ae60', '#8e44ad', '#e67e22', '#ecf0f1'];
      for (let shelf = 0; shelf < 2; shelf++) {
        for (let x = 1; x < 15; x += 2) {
          const col = books[Math.floor(hash(ox + x, oy + shelf) * books.length)];
          const h = 3 + (hash(ox + x * 3, oy + shelf * 5) < 0.3 ? 0 : 1);
          rect(ctx, col, ox + x, fy + 1 + shelf * 5 + (4 - h), 2, h);
        }
      }
      break;
    }
    case 'K':
      rect(ctx, '#d9d9d9', ox, fy, 16, 3);
      rect(ctx, '#9c7b5a', ox, fy + 3, 16, 7);
      rect(ctx, '#7f6247', ox + 7, fy + 3, 1, 7);
      rect(ctx, '#e6e6e6', ox + 5, fy + 5, 1, 2);
      rect(ctx, '#e6e6e6', ox + 9, fy + 5, 1, 2);
      break;
    default:
      wallBase();
  }
}

// -------------------------------------------------- furniture (2D view)

export function drawFurniture2D(ctx: Ctx, kind: string, ox: number, oy: number, nb: (dx: number, dy: number) => string) {
  const same = (dx: number, dy: number) => nb(dx, dy) === kind;
  switch (kind) {
    case 'd': {
      const l = same(-1, 0) ? 0 : 1, r = same(1, 0) ? 16 : 15;
      rect(ctx, '#9c6b45', ox + l, oy + 2, r - l, 10);
      rect(ctx, '#6b4429', ox + l, oy + 12, r - l, 3);
      rect(ctx, '#22252e', ox + 5, oy + 2, 6, 5);
      rect(ctx, '#5ad1ff', ox + 6, oy + 3, 4, 3);
      rect(ctx, '#22252e', ox + 7, oy + 7, 2, 1);
      rect(ctx, '#d5d5d5', ox + 5, oy + 9, 6, 2);
      break;
    }
    case 't': {
      const l = same(-1, 0) ? 0 : 1, r = same(1, 0) ? 16 : 15;
      const t = same(0, -1) ? 0 : 1, b = same(0, 1) ? 16 : 13;
      rect(ctx, '#c08a58', ox + l, oy + t, r - l, b - t);
      if (!same(0, -1)) rect(ctx, '#d39d69', ox + l, oy + t, r - l, 1);
      if (!same(0, 1)) rect(ctx, '#8a5d36', ox + l, oy + 13, r - l, 2);
      break;
    }
    case 'h': {
      const up = nb(0, -1), facingUp = up === 'd' || up === 't';
      rect(ctx, '#2b3550', ox + 4, oy + 4, 8, 8);
      rect(ctx, '#3c4a6b', ox + 5, oy + 5, 6, 6);
      rect(ctx, '#1f2740', ox + 4, facingUp ? oy + 11 : oy + 2, 8, 3);
      break;
    }
    case 'p':
      rect(ctx, '#b5651d', ox + 5, oy + 10, 6, 5);
      rect(ctx, '#cf7a2d', ox + 4, oy + 10, 8, 1);
      blob(ctx, ox + 1, oy, 14, 12, ox + oy);
      break;
    case 's': {
      const l = same(-1, 0) ? 0 : 1, r = same(1, 0) ? 16 : 15;
      rect(ctx, '#24706c', ox + l, oy + 2, r - l, 12);
      rect(ctx, '#2f8f8a', ox + l, oy + 6, r - l, 7);
      rect(ctx, '#1f5f5b', ox + l, oy + 13, r - l, 2);
      if (!same(-1, 0)) rect(ctx, '#1f5f5b', ox + 1, oy + 3, 3, 11);
      if (!same(1, 0)) rect(ctx, '#1f5f5b', ox + 12, oy + 3, 3, 11);
      if (same(1, 0)) rect(ctx, '#287a76', ox + 15, oy + 6, 1, 7);
      break;
    }
  }
}

/** A leafy blob for plants, shaded lighter at the top. */
function blob(ctx: Ctx, ox: number, oy: number, w: number, h: number, seed: number) {
  const cx = w / 2, cy = h / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x + 0.5 - cx) / cx, dy = (y + 0.5 - cy) / cy;
      const d = dx * dx + dy * dy + (hash(seed + x, y) - 0.5) * 0.5;
      if (d > 1) continue;
      const n = hash(x * 3 + seed, y * 7);
      const col = y < h * 0.35 ? (n < 0.5 ? '#6fd07a' : '#4fb35c') : n < 0.2 ? '#2d7a39' : n < 0.7 ? '#3f9a4a' : '#4fb35c';
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

const paintWallBase = (ctx: Ctx) => {
  rect(ctx, '#e6dccb', 0, 0, TEX, TEX);
  for (let i = 0; i < 40; i++) rect(ctx, '#ddd2bf', Math.floor(hash(i, 1) * TEX), Math.floor(hash(i, 2) * TEX), 1, 1);
  rect(ctx, '#cfc2ac', 0, 0, TEX, 2);
  rect(ctx, '#8a7560', 0, 28, TEX, 4);
  rect(ctx, '#a08a73', 0, 28, TEX, 1);
};

export function makeWallTextures(): Record<string, Texture> {
  return {
    '#': tex(TEX, TEX, paintWallBase),
    G: tex(TEX, TEX, (ctx) => {
      paintWallBase(ctx);
      rect(ctx, '#ffffff', 3, 4, 26, 20);
      for (let y = 0; y < 16; y++) {
        const t = y / 16;
        const r = Math.round(0x8f + (0xd8 - 0x8f) * t), g = Math.round(0xd0 + (0xf0 - 0xd0) * t);
        rect(ctx, `rgb(${r},${g},255)`, 5, 6 + y, 22, 1);
      }
      rect(ctx, '#ffffff', 8, 9, 6, 2);
      rect(ctx, '#ffffff', 7, 10, 9, 2);
      rect(ctx, '#ffffff', 19, 15, 5, 2);
      rect(ctx, '#ffffff', 15, 6, 2, 16);
      rect(ctx, '#ffffff', 5, 13, 22, 1);
      rect(ctx, '#f4f4f4', 2, 24, 28, 2);
    }),
    W: tex(TEX, TEX, (ctx) => {
      paintWallBase(ctx);
      rect(ctx, '#9aa0a6', 2, 5, 28, 18);
      rect(ctx, '#fbfbfb', 3, 6, 26, 16);
      rect(ctx, '#b0b4b8', 3, 22, 26, 2);
      rect(ctx, '#e04f5f', 5, 8, 9, 1);
      rect(ctx, '#3fa7d6', 5, 10, 13, 1);
      rect(ctx, '#3fa7d6', 5, 12, 7, 1);
      [3, 6, 4, 8].forEach((h, i) => rect(ctx, ['#5cb85c', '#f29e4c', '#7b68ee', '#e04f5f'][i], 18 + i * 2, 20 - h, 1, h));
      rect(ctx, '#555', 17, 20, 9, 1);
      rect(ctx, '#e04f5f', 10, 22, 3, 1);
    }),
    B: tex(TEX, TEX, (ctx) => {
      rect(ctx, '#5c3d24', 0, 0, TEX, TEX);
      const books = ['#c0392b', '#2e86c1', '#f1c40f', '#27ae60', '#8e44ad', '#e67e22', '#ecf0f1', '#16a085'];
      for (let shelf = 0; shelf < 4; shelf++) {
        const base = shelf * 8 + 7;
        rect(ctx, '#3e2915', 0, base, TEX, 1);
        let x = 1;
        while (x < 31) {
          const w = 2 + Math.floor(hash(x, shelf) * 2);
          const h = 4 + Math.floor(hash(x * 5, shelf * 3) * 3);
          rect(ctx, books[Math.floor(hash(x * 13, shelf * 7) * books.length)], x, base - h, Math.min(w, 31 - x), h);
          x += w + (hash(x, shelf * 11) < 0.15 ? 2 : 0);
        }
      }
      rect(ctx, '#3e2915', 0, 0, 1, TEX);
      rect(ctx, '#3e2915', 31, 0, 1, TEX);
    }),
    K: tex(TEX, TEX, (ctx) => {
      rect(ctx, '#b38b63', 0, 0, TEX, 10);
      rect(ctx, '#8f6c4a', 15, 0, 2, 10);
      rect(ctx, '#8f6c4a', 0, 9, TEX, 1);
      for (let y = 10; y < 18; y += 4) {
        for (let x = 0; x < TEX; x += 4) rect(ctx, (x + y) % 8 ? '#dfe7ea' : '#cdd8dc', x, y, 4, 4);
      }
      rect(ctx, '#cfcfcf', 0, 18, TEX, 2);
      rect(ctx, '#9c7b5a', 0, 20, TEX, 12);
      rect(ctx, '#7f6247', 15, 20, 2, 12);
      rect(ctx, '#e6e6e6', 12, 23, 1, 3);
      rect(ctx, '#e6e6e6', 19, 23, 1, 3);
    }),
  };
}

export function makeFloorTextures(): Record<string, Texture> {
  const out: Record<string, Texture> = {};
  for (const kind of ['.', ',', ';', '_']) {
    const [small, sctx] = makeCanvas(16, 16);
    drawFloor(sctx, kind, 0, 0, 0, 0);
    out[kind] = tex(TEX, TEX, (ctx) => ctx.drawImage(small, 0, 0, TEX, TEX));
  }
  return out;
}

export function makeCeilingTextures() {
  const paint = (light: boolean) => (ctx: Ctx) => {
    rect(ctx, '#d8d8d4', 0, 0, TEX, TEX);
    for (let i = 0; i < 30; i++) rect(ctx, '#c9c9c4', Math.floor(hash(i, 9) * TEX), Math.floor(hash(i, 8) * TEX), 1, 1);
    rect(ctx, '#b4b4ae', 0, 0, TEX, 1);
    rect(ctx, '#b4b4ae', 0, 0, 1, TEX);
    if (light) {
      rect(ctx, '#f0ede0', 5, 5, 22, 22);
      rect(ctx, '#fffdf2', 7, 7, 18, 18);
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

export function makeFurnitureSprites(): Record<string, SpriteArt> {
  return {
    d: {
      w: 1, h: 0.5,
      tex: tex(32, 18, (ctx) => {
        rect(ctx, '#22252e', 10, 0, 12, 8);
        rect(ctx, '#5ad1ff', 11, 1, 10, 6);
        rect(ctx, '#a8e9ff', 12, 2, 3, 1);
        rect(ctx, '#22252e', 15, 8, 2, 2);
        rect(ctx, '#9c6b45', 0, 10, 32, 2);
        rect(ctx, '#7a5233', 1, 12, 30, 6);
        rect(ctx, '#6b4429', 20, 13, 9, 4);
        rect(ctx, '#c9a27e', 24, 14, 2, 1);
      }),
    },
    t: {
      w: 1, h: 0.3,
      tex: tex(32, 10, (ctx) => {
        rect(ctx, '#c08a58', 0, 0, 32, 2);
        rect(ctx, '#9a6a40', 1, 2, 30, 2);
        rect(ctx, '#7a5233', 2, 4, 2, 6);
        rect(ctx, '#7a5233', 28, 4, 2, 6);
      }),
    },
    h: {
      w: 0.4, h: 0.42,
      tex: tex(16, 16, (ctx) => {
        rect(ctx, '#3c4a6b', 4, 0, 8, 7);
        rect(ctx, '#2b3550', 3, 7, 10, 3);
        rect(ctx, '#555a66', 7, 10, 2, 4);
        rect(ctx, '#555a66', 3, 14, 10, 1);
        rect(ctx, '#1a1c2c', 3, 15, 2, 1);
        rect(ctx, '#1a1c2c', 11, 15, 2, 1);
      }),
    },
    p: {
      w: 0.5, h: 0.8,
      tex: tex(16, 26, (ctx) => {
        blob(ctx, 0, 0, 16, 18, 7);
        rect(ctx, '#b5651d', 4, 18, 8, 8);
        rect(ctx, '#cf7a2d', 3, 18, 10, 2);
      }),
    },
    s: {
      w: 1, h: 0.45,
      tex: tex(32, 16, (ctx) => {
        rect(ctx, '#24706c', 0, 0, 32, 8);
        rect(ctx, '#2f8f8a', 0, 8, 32, 5);
        rect(ctx, '#287a76', 15, 1, 1, 12);
        rect(ctx, '#1a1c2c', 2, 13, 2, 3);
        rect(ctx, '#1a1c2c', 28, 13, 2, 3);
      }),
    },
  };
}
