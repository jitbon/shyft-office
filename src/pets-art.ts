// Pictures of pets and plants (feature 014), drawn in code as pixel art on TILE-sized canvases, cached, and turned into
// textures for first person. All original: simple shapes in the office's own pixel style. Reactions and mood marks are
// drawn in screen space over either view, so both get the same ones.
import { TILE, makeCanvas, toTexture, type Dir, type Texture } from './art';
import type { CareAction, Mood, PetColor, PetKind, PetPoseName, PlantKind, PlantStage } from '../shared/pets';

type Ctx = CanvasRenderingContext2D;
/** Art is drawn on a 32-pixel grid and scaled to TILE. */
const ART = 32;

const PET_COLORS: Record<PetKind, [string, string, string][]> = {
  // [main, shade, accent]
  cat: [['#e8913a', '#c26d22', '#f6d3a8'], ['#a3a8b1', '#7a808a', '#e3e5ea'], ['#3d3d48', '#25252e', '#6e6e7c']],
  dog: [['#e0b25c', '#b98a38', '#f5deb0'], ['#8a5a36', '#653f24', '#c79a6e'], ['#f2efe8', '#cfc8bb', '#4a3a30']],
  rabbit: [['#f4f1ec', '#d5cec2', '#f2b8c2'], ['#a67b55', '#7f5a3a', '#e6cdb3'], ['#a9a9b2', '#84848e', '#e9c2c9']],
  bird: [['#4f8fe0', '#2f69b8', '#f2c14e'], ['#f2cf3c', '#cfa71b', '#f08a3c'], ['#5cbf6a', '#3b9a4a', '#f2c14e']],
};
const EYE = '#1d1d26';
const NOSE = '#3a2a2a';

function px(ctx: Ctx, c: string, x: number, y: number, w = 1, h = 1) {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
}

// ------------------------------------------------------------------ pets

function quadruped(ctx: Ctx, kind: Exclude<PetKind, 'bird'>, color: PetColor, dir: Dir, pose: PetPoseName, frame: number) {
  const [main, shade, accent] = PET_COLORS[kind][color];
  const spotted = kind === 'dog' && color === 2;
  const small = kind === 'rabbit';
  const g = 29; // the ground line
  const step = pose === 'walk' ? (frame % 2 ? 1 : -1) : 0;

  if (pose === 'sleep') {
    // Lying down, curled, eyes shut.
    px(ctx, shade, 9, g - 5, 15, 5);
    px(ctx, main, 10, g - 6, 13, 5);
    px(ctx, main, 6, g - 6, 7, 5);
    px(ctx, EYE, 8, g - 4, 2, 1);
    if (kind === 'cat') px(ctx, main, 22, g - 3, 5, 2);
    if (kind === 'rabbit') {
      px(ctx, main, 9, g - 9, 2, 4);
      px(ctx, accent, 9, g - 8, 1, 2);
    }
    if (kind === 'dog') px(ctx, shade, 6, g - 6, 2, 4);
    if (spotted) px(ctx, accent, 15, g - 5, 3, 2);
    return;
  }

  const side = dir === 'left' || dir === 'right';
  if (side) {
    // Facing left; the caller mirrors it for right.
    const sit = pose === 'sit' || pose === 'look';
    const bodyX = sit ? 13 : 11, bodyW = sit ? 9 : 12, bodyY = sit ? g - 11 : g - 9, bodyH = sit ? 9 : 6;
    // legs
    if (sit) {
      px(ctx, shade, 12, g - 4, 2, 4);
      px(ctx, shade, 19, g - 3, 4, 3);
    } else {
      px(ctx, shade, 12 + step, g - 4, 2, 4);
      px(ctx, shade, 15 - step, g - 4, 2, 4);
      px(ctx, shade, 19 + step, g - 4, 2, 4);
      px(ctx, shade, 21 - step, g - 4, 2, 4);
    }
    px(ctx, main, bodyX, bodyY, bodyW, bodyH);
    px(ctx, accent, bodyX + 1, bodyY + bodyH - 2, bodyW - 3, 2);
    if (spotted) {
      px(ctx, accent, bodyX + 3, bodyY + 1, 3, 2);
      px(ctx, accent, bodyX + 7, bodyY + 3, 2, 2);
    }
    // tail
    if (kind === 'cat') {
      px(ctx, main, bodyX + bodyW, bodyY - 3, 2, bodyH);
      px(ctx, main, bodyX + bodyW + 1, bodyY - 5, 2, 3);
    } else if (kind === 'dog') {
      px(ctx, main, bodyX + bodyW, bodyY - 2 + (frame % 2), 3, 2);
    } else {
      px(ctx, '#ffffff', bodyX + bodyW - 1, bodyY + 1, 3, 3);
    }
    // head (looking around turns it to face you)
    const hx = sit ? 8 : 6, hy = sit ? g - 17 : g - 14, hw = small ? 7 : 8, hh = 7;
    px(ctx, main, hx, hy, hw, hh);
    px(ctx, accent, hx, hy + 4, 3, 3);
    if (pose === 'look') {
      px(ctx, EYE, hx + 2, hy + 2, 1, 2);
      px(ctx, EYE, hx + 5, hy + 2, 1, 2);
    } else {
      px(ctx, EYE, hx + 2, hy + 2, 1, 2);
    }
    px(ctx, NOSE, hx, hy + 4, 1, 1);
    // ears
    if (kind === 'cat') {
      px(ctx, main, hx + 1, hy - 2, 2, 2);
      px(ctx, main, hx + 5, hy - 2, 2, 2);
      px(ctx, shade, hx + 1, hy - 3, 1, 1);
      px(ctx, shade, hx + 6, hy - 3, 1, 1);
    } else if (kind === 'dog') {
      px(ctx, shade, hx + 5, hy, 3, 6);
    } else {
      px(ctx, main, hx + 3, hy - 7, 2, 7);
      px(ctx, accent, hx + 3, hy - 6, 1, 5);
      px(ctx, main, hx + 5, hy - 6, 2, 6);
    }
    return;
  }

  // Front (down) and back (up).
  const back = dir === 'up';
  const sit = pose === 'sit' || pose === 'look';
  const bx = 11, bw = 10, by = sit ? g - 10 : g - 9, bh = sit ? 8 : 7;
  px(ctx, shade, bx + 1, g - 3, 2, 3);
  px(ctx, shade, bx + bw - 3, g - 3, 2, 3);
  if (!sit) {
    px(ctx, shade, bx + 1, g - 3 + (step > 0 ? 0 : 1), 2, 2);
    px(ctx, shade, bx + bw - 3, g - 3 + (step < 0 ? 0 : 1), 2, 2);
  }
  px(ctx, main, bx, by, bw, bh);
  if (!back) px(ctx, accent, bx + 3, by + 1, bw - 6, bh - 2);
  if (spotted) px(ctx, accent, bx + 1, by + 2, 2, 2);
  if (back) {
    if (kind === 'cat') px(ctx, main, bx + bw / 2 - 1, by - 5, 2, 6);
    else if (kind === 'dog') px(ctx, main, bx + bw / 2 - 1 + (frame % 2), by - 2, 2, 3);
    else px(ctx, '#ffffff', bx + bw / 2 - 2, by + 1, 4, 3);
  }
  const hx = 10, hy = by - 8, hw = 12, hh = 8;
  px(ctx, main, hx, hy, hw, hh);
  if (!back) {
    px(ctx, accent, hx + 3, hy + 4, hw - 6, 4);
    const look = pose === 'look' ? (frame % 2 ? 1 : -1) : 0;
    px(ctx, EYE, hx + 3 + look, hy + 2, 2, 2);
    px(ctx, EYE, hx + hw - 5 + look, hy + 2, 2, 2);
    px(ctx, NOSE, hx + hw / 2 - 1, hy + 5, 2, 1);
  }
  if (kind === 'cat') {
    px(ctx, main, hx, hy - 3, 3, 3);
    px(ctx, main, hx + hw - 3, hy - 3, 3, 3);
    px(ctx, shade, hx + 1, hy - 2, 1, 2);
    px(ctx, shade, hx + hw - 2, hy - 2, 1, 2);
  } else if (kind === 'dog') {
    px(ctx, shade, hx - 2, hy + 1, 3, 6);
    px(ctx, shade, hx + hw - 1, hy + 1, 3, 6);
  } else {
    px(ctx, main, hx + 2, hy - 8, 3, 8);
    px(ctx, main, hx + hw - 5, hy - 8, 3, 8);
    if (!back) {
      px(ctx, accent, hx + 3, hy - 7, 1, 6);
      px(ctx, accent, hx + hw - 4, hy - 7, 1, 6);
    }
  }
}

function bird(ctx: Ctx, color: PetColor, dir: Dir, pose: PetPoseName, frame: number) {
  const [main, shade, beak] = PET_COLORS.bird[color];
  const g = 29;
  if (pose === 'sleep') {
    px(ctx, shade, 12, g - 7, 9, 6);
    px(ctx, main, 13, g - 8, 8, 6);
    px(ctx, EYE, 14, g - 6, 2, 1);
    px(ctx, beak, 12, g - 5, 1, 1);
    return;
  }
  const hop = pose === 'walk' && frame % 2 ? 1 : 0;
  const y = g - 12 - hop;
  px(ctx, beak, 14, g - 2, 1, 2);
  px(ctx, beak, 17, g - 2, 1, 2);
  px(ctx, main, 12, y + 3, 9, 8);
  px(ctx, main, 13, y, 7, 5);
  px(ctx, '#ffffff', 14, y + 6, 5, 4);
  const flap = pose === 'look' ? 0 : frame % 2;
  if (dir === 'left' || dir === 'right') {
    px(ctx, shade, 15, y + 4 - flap, 5, 4);
    px(ctx, EYE, 14, y + 2, 1, 1);
    px(ctx, beak, 11, y + 2, 2, 1);
    px(ctx, shade, 21, y + 7, 3, 2);
  } else {
    px(ctx, shade, 11, y + 4 - flap, 2, 5);
    px(ctx, shade, 20, y + 4 - flap, 2, 5);
    if (dir === 'down') {
      px(ctx, EYE, 14, y + 2, 1, 1);
      px(ctx, EYE, 18, y + 2, 1, 1);
      px(ctx, beak, 16, y + 3, 1, 2);
    } else {
      px(ctx, shade, 15, y + 10, 3, 2);
    }
  }
}

const petCache = new Map<string, { canvas: HTMLCanvasElement; tex?: Texture }>();

function petEntry(kind: PetKind, color: PetColor, dir: Dir, pose: PetPoseName, frame: number) {
  const key = `${kind}|${color}|${dir}|${pose}|${frame % 2}`;
  let e = petCache.get(key);
  if (!e) {
    const [art, actx] = makeCanvas(ART, ART);
    const flip = dir === 'right';
    if (flip) {
      actx.translate(ART, 0);
      actx.scale(-1, 1);
    }
    const d: Dir = flip ? 'left' : dir;
    if (kind === 'bird') bird(actx, color, d, pose, frame);
    else quadruped(actx, kind, color, d, pose, frame);
    const [canvas, ctx] = makeCanvas(TILE, TILE);
    ctx.drawImage(art, 0, 0, TILE, TILE);
    petCache.set(key, (e = { canvas }));
  }
  return e;
}

/** A pet's picture: TILE square, feet on the bottom row, about half an avatar tall. */
export const petCanvas = (kind: PetKind, color: PetColor, dir: Dir, pose: PetPoseName, frame: number) => petEntry(kind, color, dir, pose, frame).canvas;
export function petTexture(kind: PetKind, color: PetColor, dir: Dir, pose: PetPoseName, frame: number): Texture {
  const e = petEntry(kind, color, dir, pose, frame);
  return (e.tex ??= toTexture(e.canvas));
}

// ------------------------------------------------------------------ plants

const LEAF = '#4f9a4a', LEAF_D = '#357a36', STEM = '#3f8a3f';

function pot(ctx: Ctx) {
  px(ctx, '#a9552c', 10, 23, 12, 2);
  px(ctx, '#c0693a', 11, 25, 10, 5);
  px(ctx, '#d98552', 12, 25, 2, 4);
  px(ctx, '#5a3a24', 11, 23, 10, 1);
}

function plantTop(ctx: Ctx, kind: PlantKind, stage: PlantStage) {
  const base = 23;
  if (stage === 0) {
    px(ctx, STEM, 15, base - 2, 1, 2);
    px(ctx, LEAF, 13, base - 3, 2, 1);
    px(ctx, LEAF, 16, base - 3, 2, 1);
    return;
  }
  if (kind === 'cactus') {
    const h = stage === 1 ? 5 : stage === 2 ? 9 : 11;
    px(ctx, '#4a9a5a', 14, base - h, 4, h);
    px(ctx, '#6cbf7a', 15, base - h, 1, h);
    if (stage >= 2) {
      px(ctx, '#4a9a5a', 11, base - h + 3, 3, 2);
      px(ctx, '#4a9a5a', 11, base - h, 2, 4);
      px(ctx, '#4a9a5a', 18, base - h + 5, 3, 2);
      px(ctx, '#4a9a5a', 19, base - h + 2, 2, 4);
    }
    if (stage === 2) px(ctx, '#e88fb0', 15, base - h - 1, 2, 1);
    if (stage === 3) {
      px(ctx, '#f2a6c4', 14, base - h - 3, 4, 3);
      px(ctx, '#f7d24a', 15, base - h - 2, 2, 1);
    }
    return;
  }
  if (kind === 'fern') {
    const n = stage + 2;
    for (let i = 0; i < n; i++) {
      const dx = (i - (n - 1) / 2) * 3;
      const h = 5 + stage * 2 - Math.abs(dx) / 2;
      for (let y = 0; y < h; y++) px(ctx, y % 2 ? LEAF : LEAF_D, Math.round(15 + dx * (y / h)), base - y - 1, 2, 1);
      px(ctx, LEAF, Math.round(15 + dx) - 1, base - h - 1, 3, 1);
    }
    if (stage === 3) {
      px(ctx, '#6cbf62', 10, base - 6, 3, 1);
      px(ctx, '#6cbf62', 19, base - 6, 3, 1);
    }
    return;
  }
  // Sunflower and tulip: a stem with leaves, then a bud, then a flower.
  const h = kind === 'sunflower' ? [0, 6, 11, 14][stage] : [0, 5, 9, 10][stage];
  px(ctx, STEM, 15, base - h, 2, h);
  px(ctx, LEAF, 12, base - Math.ceil(h / 2), 3, 2);
  px(ctx, LEAF, 17, base - Math.ceil(h / 2) - 1, 3, 2);
  if (stage === 2) {
    px(ctx, kind === 'sunflower' ? '#7aa83c' : '#d9455a', 14, base - h - 3, 4, 3);
    px(ctx, kind === 'sunflower' ? '#f2cf3c' : '#f07a8a', 15, base - h - 3, 2, 1);
  }
  if (stage === 3) {
    if (kind === 'sunflower') {
      const cx = 16, cy = base - h - 3;
      px(ctx, '#f2c42e', cx - 5, cy - 2, 10, 5);
      px(ctx, '#f2c42e', cx - 3, cy - 4, 6, 9);
      px(ctx, '#f7d85a', cx - 4, cy - 3, 8, 7);
      px(ctx, '#7a4a22', cx - 2, cy - 1, 4, 3);
    } else {
      px(ctx, '#d9455a', 13, base - h - 5, 6, 5);
      px(ctx, '#d9455a', 12, base - h - 6, 2, 3);
      px(ctx, '#d9455a', 18, base - h - 6, 2, 3);
      px(ctx, '#f07a8a', 15, base - h - 6, 2, 3);
    }
  }
}

const plantCache = new Map<string, { canvas: HTMLCanvasElement; tex?: Texture }>();

function plantEntry(kind: PlantKind, stage: PlantStage, droop: boolean) {
  const key = `${kind}|${stage}|${droop ? 1 : 0}`;
  let e = plantCache.get(key);
  if (!e) {
    const [top, tctx] = makeCanvas(ART, ART);
    plantTop(tctx, kind, stage);
    const [art, actx] = makeCanvas(ART, ART);
    pot(actx);
    if (droop) {
      // Bent over a little: higher rows lean further and everything sags a pixel.
      for (let y = 0; y < 23; y++) actx.drawImage(top, 0, y, ART, 1, Math.round((23 - y) / 6), y + 1, ART, 1);
    } else {
      actx.drawImage(top, 0, 0);
    }
    const [canvas, ctx] = makeCanvas(TILE, TILE);
    ctx.drawImage(art, 0, 0, TILE, TILE);
    plantCache.set(key, (e = { canvas }));
  }
  return e;
}

/** A plant's picture: TILE square, the pot on the bottom rows. */
export const plantCanvas = (kind: PlantKind, stage: PlantStage, droop: boolean) => plantEntry(kind, stage, droop).canvas;
export function plantTexture(kind: PlantKind, stage: PlantStage, droop: boolean): Texture {
  const e = plantEntry(kind, stage, droop);
  return (e.tex ??= toTexture(e.canvas));
}

// ------------------------------------------------------------------ reactions and marks (screen space)

function heart(ctx: Ctx, x: number, y: number, s: number, color: string) {
  ctx.fillStyle = color;
  const p = Math.max(1, Math.round(s));
  for (const [dx, dy] of [[1, 0], [3, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [1, 2], [2, 2], [3, 2], [2, 3]]) {
    ctx.fillRect(Math.round(x + (dx - 2) * p), Math.round(y + (dy - 2) * p), p, p);
  }
}

/** How long a reaction plays. */
export const REACTION_MS = 1500;

/**
 * A care reaction around (cx, bottom) in screen pixels, `t` from 0 to 1, `s` the size of one art pixel. Pet: hearts rise;
 * Feed: a bowl and crumbs; Play: sparkles round a hop; Water: drops and a splash; and a sparkle when a plant grew.
 */
export function drawReaction(ctx: Ctx, action: CareAction, t: number, cx: number, bottom: number, s: number, grew = false) {
  const a = t < 0.8 ? 1 : (1 - t) / 0.2;
  ctx.save();
  ctx.globalAlpha = Math.max(0, a);
  const top = bottom - 18 * s;
  if (action === 'pet') {
    heart(ctx, cx - 4 * s, top - t * 10 * s, s, '#ff5a7a');
    heart(ctx, cx + 4 * s, top - 4 * s - t * 14 * s, s * 0.8, '#ff8aa2');
    if (t > 0.3) heart(ctx, cx, top - 8 * s - (t - 0.3) * 16 * s, s * 0.7, '#ff5a7a');
  } else if (action === 'feed') {
    ctx.fillStyle = '#c0693a';
    ctx.fillRect(cx + 4 * s, bottom - 3 * s, 7 * s, 2 * s);
    ctx.fillStyle = '#e8b04a';
    ctx.fillRect(cx + 5 * s, bottom - 4 * s, 5 * s, s);
    for (let i = 0; i < 4; i++) {
      const k = (t * 3 + i * 0.25) % 1;
      ctx.fillRect(cx + (i - 1.5) * 3 * s, top + 6 * s - k * 8 * s, s, s);
    }
  } else if (action === 'play') {
    ctx.fillStyle = '#f2cf3c';
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 + t * 4;
      const r = (6 + t * 6) * s;
      ctx.fillRect(cx + Math.cos(ang) * r, top + 8 * s + Math.sin(ang) * r * 0.6, s, s);
    }
  } else {
    ctx.fillStyle = '#5ab4f0';
    for (let i = 0; i < 5; i++) {
      const k = Math.min(1, t * 2 - i * 0.12);
      if (k <= 0) continue;
      ctx.fillRect(cx + (i - 2) * 2 * s, top + k * 12 * s, s, 2 * s);
    }
    if (t > 0.45) {
      const r = (t - 0.45) * 14 * s;
      ctx.fillRect(cx - r, bottom - 9 * s, s, s);
      ctx.fillRect(cx + r, bottom - 9 * s, s, s);
    }
  }
  if (grew) {
    ctx.fillStyle = '#fff3a8';
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const r = (4 + t * 10) * s;
      ctx.fillRect(cx + Math.cos(ang) * r, top + Math.sin(ang) * r, s, s);
    }
  }
  ctx.restore();
}

/** A pet's mood mark over its head, now and then: a small heart when happy, a "z" when sleepy and hungry. */
export function drawMoodMark(ctx: Ctx, mood: Mood, now: number, cx: number, top: number, s: number, seed: number) {
  if (mood === 'content') return;
  const cycle = (now + seed * 997) % 3000;
  if (mood === 'happy') {
    if (cycle > 1200) return;
    ctx.save();
    ctx.globalAlpha = 1 - cycle / 1200;
    heart(ctx, cx + 3 * s, top - (cycle / 1200) * 6 * s, s * 0.7, '#ff7a96');
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.fillStyle = '#e6e9ff';
  ctx.font = `800 ${Math.round(7 * s)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.globalAlpha = 0.9;
  ctx.fillText('z', cx + 4 * s + (cycle / 3000) * 3 * s, top - (cycle / 3000) * 6 * s);
  ctx.restore();
}

/** The "Press X" chip, centred at (cx, bottom). */
export function drawPressX(ctx: Ctx, cx: number, bottom: number, text = 'Press X') {
  ctx.save();
  ctx.font = '800 12px sans-serif';
  const w = ctx.measureText(text).width + 14, h = 20;
  ctx.fillStyle = 'rgba(20, 21, 42, 0.88)';
  ctx.beginPath();
  ctx.roundRect(cx - w / 2, bottom - h, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = '#f1c453';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, bottom - h / 2 + 0.5);
  ctx.restore();
}
