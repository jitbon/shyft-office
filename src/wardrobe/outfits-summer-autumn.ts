// Summer and autumn outfits: beach-goer, lifeguard, ice-cream seller, scarecrow, zombie, pumpkin head, ghost, witch.
import { light, shade } from '../palette';
import { EYE, SHOE, rect, round, type Ctx, type Painter, type View } from './draw';
import { faces } from './faces';
import { hairStyles } from './hair';

/** The colors and cut of a plain figure: the same proportions as the default character. */
interface Fig {
  skin: string;
  top: string;
  /** Sleeve length: 'long' to the wrist, 'short', or 'none' (bare arms). */
  sleeves: 'long' | 'short' | 'none';
  pant: string;
  /** Legs are skin from this row down (shorts, torn trousers). */
  bareFrom?: number;
  shoe?: string;
  /** Leave the head's skin unpainted (the outfit draws its own head). */
  noHead?: boolean;
}

const SLEEVE_LEN = { long: 6, short: 3, none: 0 };

function legs(ctx: Ctx, view: View, step: number, f: Fig) {
  const pantD = shade(f.pant, 0.25), skinD = shade(f.skin, 0.16), shoe = f.shoe ?? SHOE;
  if (view === 'side') {
    const front = 14 + 3 * step, back = 14 - 3 * step;
    const leg = (x: number, c: string, s: string) => {
      rect(ctx, c, x, 25, 4, 3);
      if (f.bareFrom !== undefined) rect(ctx, s, x, f.bareFrom, 4, 28 - f.bareFrom);
    };
    leg(back, pantD, skinD);
    rect(ctx, shade(shoe, 0.2), back, 28, 6, 2);
    rect(ctx, f.pant, 11, 24, 10, 3);
    leg(front, f.pant, f.skin);
    rect(ctx, shoe, front, 28, 6, 2);
    rect(ctx, light(shoe, 0.25), front, 28, 6, 1);
    return;
  }
  for (const [x0, off] of [[10, step], [17, -step]]) {
    const bottom = 27 + off;
    rect(ctx, f.pant, x0, 25, 5, bottom - 24);
    rect(ctx, pantD, x0 + 4, 25, 1, bottom - 24);
    if (f.bareFrom !== undefined) {
      rect(ctx, f.skin, x0, f.bareFrom, 5, bottom + 1 - f.bareFrom);
      rect(ctx, skinD, x0 + 4, f.bareFrom, 1, bottom + 1 - f.bareFrom);
    }
    rect(ctx, shoe, x0, bottom + 1, 5, 2);
    rect(ctx, light(shoe, 0.25), x0, bottom + 1, 5, 1);
  }
  rect(ctx, f.pant, 10, 25, 12, 2);
  rect(ctx, shade(f.pant, 0.3), 10, 24, 12, 1);
}

function torso(ctx: Ctx, view: View, step: number, f: Fig) {
  const L = light(f.top, 0.2), D = shade(f.top, 0.25), skinD = shade(f.skin, 0.16);
  const len = SLEEVE_LEN[f.sleeves];
  if (view === 'side') {
    rect(ctx, f.sleeves === 'none' ? skinD : D, 14 + 3 * step, 17, 4, 6); // far arm
    rect(ctx, skinD, 14 + 3 * step, 23, 4, 2);
    round(ctx, f.top, 11, 16, 10, 8);
    rect(ctx, L, 12, 16, 8, 1);
    rect(ctx, D, 11, 22, 10, 2);
    const a = 14 - 3 * step;
    rect(ctx, f.skin, a, 17, 4, 8);
    if (len) {
      rect(ctx, f.top, a, 17, 4, len);
      rect(ctx, L, a, 17, 4, 1);
    }
    return;
  }
  for (const [x, dy] of [[6, -step], [23, step]]) {
    const y = 17 + dy;
    rect(ctx, f.skin, x, y, 3, 8);
    rect(ctx, skinD, x + 2, y, 1, 8);
    if (len) {
      rect(ctx, f.top, x, y, 3, len);
      rect(ctx, L, x, y, 3, 1);
      rect(ctx, D, x, y + len - 1, 3, 1);
    }
  }
  round(ctx, f.top, 9, 16, 14, 8);
  rect(ctx, L, 10, 16, 12, 1);
  rect(ctx, D, 9, 22, 14, 2);
  rect(ctx, D, 21, 17, 2, 5);
}

function headSkin(ctx: Ctx, view: View, skin: string) {
  const D = shade(skin, 0.16);
  rect(ctx, D, view === 'side' ? 13 : 14, 15, 4, 1);
  if (view === 'back') round(ctx, skin, 9, 3, 14, 11);
  else if (view === 'front') {
    round(ctx, skin, 9, 3, 14, 12);
    rect(ctx, D, 21, 11, 1, 3);
    rect(ctx, D, 11, 14, 10, 1);
  } else {
    round(ctx, skin, 10, 3, 12, 12);
    rect(ctx, skin, 22, 11, 1, 2);
    rect(ctx, D, 15, 9, 2, 3);
  }
}

// ------------------------------------------------------------------ summer

const STRAW = '#e8c872';

/** A wide straw hat over the top of the head; the hair shows below its brim. */
function sunHat(ctx: Ctx, view: View, band: string) {
  const brimD = shade(STRAW, 0.2);
  if (view === 'side') {
    round(ctx, STRAW, 11, 1, 10, 5);
    round(ctx, STRAW, 7, 5, 20, 3);
    rect(ctx, brimD, 8, 7, 18, 1);
    rect(ctx, band, 11, 4, 10, 1);
  } else {
    round(ctx, STRAW, 11, 1, 10, 5);
    round(ctx, STRAW, 6, 5, 20, 3);
    rect(ctx, brimD, 7, 7, 18, 1);
    rect(ctx, band, 11, 4, 10, 1);
  }
  rect(ctx, light(STRAW, 0.3), 12, 2, 4, 1);
}

const beachGoer: Painter = (ctx, t, view, step) => {
  const f: Fig = { skin: t.skin, top: '#f29e4c', sleeves: 'none', pant: '#2a9d9d', bareFrom: 27, shoe: '#b98a4e' };
  legs(ctx, view, step, f);
  torso(ctx, view, step, f);
  // Flower print on the tank top.
  if (view !== 'side') for (const [x, y] of [[11, 18], [15, 20], [19, 18], [12, 22], [18, 22]]) rect(ctx, '#ffffff', x, y, 1, 1);
  else for (const [x, y] of [[13, 19], [17, 21]]) rect(ctx, '#ffffff', x, y, 1, 1);
  headSkin(ctx, view, f.skin);
  if (view !== 'back') faces.smile(ctx, t, view, step);
  hairStyles.short(ctx, t, view, step);
  if (view === 'front') {
    rect(ctx, '#1d1b26', 11, 9, 5, 3);
    rect(ctx, '#1d1b26', 17, 9, 5, 3);
    rect(ctx, '#1d1b26', 16, 9, 1, 1);
    rect(ctx, '#6b6a86', 12, 9, 1, 1);
    rect(ctx, '#6b6a86', 18, 9, 1, 1);
  } else if (view === 'side') {
    rect(ctx, '#1d1b26', 17, 9, 4, 3);
    rect(ctx, '#1d1b26', 12, 9, 5, 1);
    rect(ctx, '#6b6a86', 18, 9, 1, 1);
  }
  sunHat(ctx, view, '#e04f5f');
};

const lifeguard: Painter = (ctx, t, view, step) => {
  const red = '#d64545';
  const f: Fig = { skin: t.skin, top: red, sleeves: 'short', pant: red, bareFrom: 27, shoe: '#3d4452' };
  legs(ctx, view, step, f);
  torso(ctx, view, step, f);
  // A white stripe across the chest and the whistle on its cord.
  if (view === 'front') {
    rect(ctx, '#f0f0f2', 9, 21, 14, 1);
    rect(ctx, '#2c2c34', 14, 16, 1, 2);
    rect(ctx, '#2c2c34', 17, 16, 1, 2);
    rect(ctx, '#2c2c34', 15, 18, 2, 1);
    rect(ctx, '#f1c453', 15, 19, 3, 2);
  } else if (view === 'back') rect(ctx, '#f0f0f2', 9, 21, 14, 1);
  else {
    rect(ctx, '#f0f0f2', 11, 21, 10, 1);
    rect(ctx, '#2c2c34', 19, 17, 1, 2);
    rect(ctx, '#f1c453', 19, 19, 2, 2);
  }
  headSkin(ctx, view, f.skin);
  if (view !== 'back') faces.smile(ctx, t, view, step);
  hairStyles.short(ctx, t, view, step);
  // Zinc on the nose and a white visor.
  if (view === 'front') {
    rect(ctx, '#ffffff', 15, 11, 2, 1);
    rect(ctx, '#f0f0f2', 9, 3, 14, 2);
    rect(ctx, '#d6d6dc', 9, 4, 14, 1);
  } else if (view === 'side') {
    rect(ctx, '#ffffff', 21, 11, 1, 1);
    rect(ctx, '#f0f0f2', 10, 3, 14, 2);
    rect(ctx, '#d6d6dc', 10, 4, 14, 1);
  } else {
    rect(ctx, '#f0f0f2', 9, 3, 14, 2);
    rect(ctx, '#d6d6dc', 9, 4, 14, 1);
  }
};

const PINK = '#e86fb0', CREAM = '#f0f0f2';

const iceCreamSeller: Painter = (ctx, t, view, step) => {
  const f: Fig = { skin: t.skin, top: CREAM, sleeves: 'short', pant: '#3d4452' };
  legs(ctx, view, step, f);
  torso(ctx, view, step, f);
  // A striped apron over the front.
  if (view === 'front') {
    for (let x = 10; x < 22; x += 2) {
      rect(ctx, PINK, x, 17, 1, 9);
      rect(ctx, CREAM, x + 1, 17, 1, 9);
    }
    rect(ctx, shade(PINK, 0.25), 10, 25, 12, 1);
    rect(ctx, PINK, 9, 16, 1, 3);
    rect(ctx, PINK, 22, 16, 1, 3);
  } else if (view === 'back') {
    rect(ctx, PINK, 9, 18, 14, 1);
    rect(ctx, PINK, 14, 19, 4, 2);
    rect(ctx, shade(PINK, 0.25), 15, 21, 2, 3);
  } else {
    for (let y = 17; y < 26; y += 2) {
      rect(ctx, PINK, 19, y, 3, 1);
      rect(ctx, CREAM, 19, y + 1, 3, 1);
    }
  }
  headSkin(ctx, view, f.skin);
  if (view !== 'back') faces.smile(ctx, t, view, step);
  hairStyles.short(ctx, t, view, step);
  // A paper hat with a pink band.
  const x0 = view === 'side' ? 10 : 9, w = view === 'side' ? 13 : 14;
  round(ctx, CREAM, x0 + 1, 1, w - 2, 5);
  rect(ctx, PINK, x0, 5, w, 2);
  rect(ctx, shade(PINK, 0.25), x0, 6, w, 1);
  rect(ctx, '#d6d6dc', x0 + 2, 2, 1, 3);
  rect(ctx, '#d6d6dc', x0 + w - 4, 2, 1, 3);
};

// ------------------------------------------------------------------ autumn

const BURLAP = '#d9b36c';
const HAY = '#f0cf6a';

const scarecrow: Painter = (ctx, t, view, step) => {
  const f: Fig = { skin: BURLAP, top: '#b5472d', sleeves: 'long', pant: '#6b5a3a', shoe: '#4a3320' };
  const hayD = shade(HAY, 0.25);
  legs(ctx, view, step, f);
  torso(ctx, view, step, f);
  // Straw instead of hands, under the shirt hem and out of the trouser cuffs.
  if (view === 'side') {
    const a = 14 - 3 * step;
    rect(ctx, HAY, a, 23, 4, 2);
    rect(ctx, hayD, a, 25, 1, 1);
    rect(ctx, hayD, a + 2, 25, 1, 1);
    rect(ctx, '#3f9d5a', 13, 19, 4, 4);
    rect(ctx, '#2c6e3f', 14, 20, 2, 2);
  } else {
    for (const [x, dy] of [[6, -step], [23, step]]) {
      const y = 17 + dy;
      rect(ctx, HAY, x, y + 6, 3, 2);
      rect(ctx, hayD, x, y + 8, 1, 1);
      rect(ctx, hayD, x + 2, y + 8, 1, 1);
      rect(ctx, hayD, x + 1, y + 7, 1, 1);
    }
    for (const x of [10, 13, 16, 19]) rect(ctx, HAY, x, 24, 1, 1);
    if (view === 'front') {
      // A patch with stitches.
      rect(ctx, '#3f9d5a', 10, 18, 5, 4);
      rect(ctx, '#2c6e3f', 11, 19, 3, 2);
      for (const [x, y] of [[10, 18], [14, 18], [10, 21], [14, 21]]) rect(ctx, '#2a2233', x, y, 1, 1);
    }
  }
  // Patch on the knee.
  if (view !== 'side') rect(ctx, '#8a5a3b', view === 'front' ? 11 : 18, 26, 3, 2);
  headSkin(ctx, view, BURLAP);
  if (view === 'front') {
    rect(ctx, EYE, 12, 10, 2, 2);
    rect(ctx, EYE, 18, 10, 2, 2);
    rect(ctx, '#2a2233', 12, 13, 8, 1);
    for (const x of [12, 15, 18]) rect(ctx, '#2a2233', x, 12, 1, 3);
    rect(ctx, '#b88d4a', 15, 11, 2, 1);
  } else if (view === 'side') {
    rect(ctx, EYE, 18, 10, 2, 2);
    rect(ctx, '#2a2233', 17, 13, 4, 1);
    rect(ctx, '#2a2233', 18, 12, 1, 3);
    rect(ctx, '#2a2233', 20, 12, 1, 3);
  }
  // Straw sticking out under the hat.
  const sx = view === 'side' ? [9, 22] : [8, 23];
  for (const x of sx) {
    rect(ctx, HAY, x, 6, 2, 5);
    rect(ctx, hayD, x, 10, 2, 1);
  }
  if (view === 'back') rect(ctx, HAY, 10, 7, 12, 5);
  // A floppy straw hat with a patched band.
  const crown = '#c9a24a', brim = '#b58b34';
  const bx = view === 'side' ? 7 : 6;
  round(ctx, crown, 11, 0, 10, 6);
  round(ctx, brim, bx, 5, 20, 3);
  rect(ctx, shade(brim, 0.25), bx + 1, 7, 18, 1);
  rect(ctx, '#7a3b1f', 11, 4, 10, 1);
  rect(ctx, '#3f9d5a', 14, 3, 3, 2);
  rect(ctx, light(crown, 0.3), 12, 1, 4, 1);
};

const ZOMBIE_SKIN = '#8bb36a';

const zombie: Painter = (ctx, t, view, step) => {
  const skin = ZOMBIE_SKIN, skinD = shade(skin, 0.2), top = '#5d6b86', topD = shade(top, 0.25);
  const f: Fig = { skin, top, sleeves: 'long', pant: '#4a4a58', bareFrom: 26, shoe: '#5a4632' };
  legs(ctx, view, step, f);
  // Arms stretched out in front: forward in the side view, bent up toward the camera or away from it.
  if (view === 'side') {
    torso(ctx, 'side', step, { ...f, sleeves: 'none' }); // far arm and torso; the real arms are drawn below
    const bob = step;
    rect(ctx, shade(top, 0.15), 17, 17 + bob, 5, 3);
    rect(ctx, skinD, 22, 17 + bob, 4, 3);
    rect(ctx, top, 16, 18 - bob, 6, 3);
    rect(ctx, skin, 22, 18 - bob, 5, 3);
    rect(ctx, '#3a1f26', 26, 19 - bob, 1, 1);
  } else {
    torso(ctx, view, 0, f);
    for (const [x, d] of [[6, 1], [23, -1]]) {
      const dy = step * d;
      // Cover the hanging arm, then draw the raised one.
      rect(ctx, '#00000000', x, 17, 3, 8);
      ctx.clearRect(x, 17 - 2, 3, 12);
      rect(ctx, top, x, 18 + dy, 3, 4);
      rect(ctx, topD, x, 21 + dy, 3, 1);
      rect(ctx, skin, x, 14 + dy, 3, 4);
      rect(ctx, skinD, x + 2, 14 + dy, 1, 4);
    }
  }
  // Torn shirt: a hole showing skin, and a ragged hem.
  if (view === 'front') {
    rect(ctx, skin, 11, 19, 3, 2);
    rect(ctx, '#7a2f3a', 12, 20, 1, 1);
    rect(ctx, skinD, 16, 17, 1, 1);
    for (const x of [10, 14, 18]) ctx.clearRect(x, 23, 2, 1);
    rect(ctx, skin, 15, 22, 3, 1);
  } else if (view === 'back') {
    rect(ctx, skinD, 14, 19, 3, 3);
    for (const x of [11, 16, 19]) ctx.clearRect(x, 23, 2, 1);
  } else {
    rect(ctx, skin, 14, 20, 3, 2);
    ctx.clearRect(12, 23, 2, 1);
    ctx.clearRect(17, 23, 2, 1);
  }
  headSkin(ctx, view, skin);
  const hair = '#4a4a4a';
  if (view === 'front') {
    rect(ctx, '#4f6f3e', 11, 9, 3, 1);
    rect(ctx, '#4f6f3e', 17, 9, 3, 1);
    rect(ctx, '#e8e8c8', 12, 10, 2, 2);
    rect(ctx, '#e8e8c8', 18, 10, 2, 2);
    rect(ctx, '#c0392b', 13, 11, 1, 1);
    rect(ctx, '#c0392b', 18, 10, 1, 1);
    rect(ctx, '#3a1f26', 14, 13, 4, 2);
    rect(ctx, '#e8e8c8', 14, 13, 1, 1);
    rect(ctx, '#e8e8c8', 17, 13, 1, 1);
    rect(ctx, '#7a2f3a', 20, 6, 1, 3);
    rect(ctx, hair, 10, 2, 5, 3);
    rect(ctx, hair, 17, 1, 5, 3);
    rect(ctx, hair, 9, 5, 2, 4);
    rect(ctx, shade(hair, 0.3), 12, 4, 2, 1);
  } else if (view === 'side') {
    rect(ctx, '#4f6f3e', 17, 9, 3, 1);
    rect(ctx, '#e8e8c8', 18, 10, 2, 2);
    rect(ctx, '#c0392b', 19, 10, 1, 1);
    rect(ctx, '#3a1f26', 19, 13, 3, 2);
    rect(ctx, '#e8e8c8', 19, 13, 1, 1);
    rect(ctx, hair, 10, 2, 6, 3);
    rect(ctx, hair, 17, 1, 4, 3);
    rect(ctx, hair, 9, 5, 4, 6);
  } else {
    rect(ctx, hair, 9, 1, 14, 7);
    rect(ctx, shade(hair, 0.3), 12, 4, 3, 1);
    rect(ctx, skin, 14, 3, 3, 2);
    rect(ctx, hair, 10, 8, 4, 3);
    rect(ctx, hair, 18, 8, 4, 2);
  }
};

const PUMPKIN = '#e8892f';

const pumpkinHead: Painter = (ctx, t, view, step) => {
  const f: Fig = { skin: t.skin, top: '#4b3a5e', sleeves: 'long', pant: '#3d4452' };
  legs(ctx, view, step, f);
  torso(ctx, view, step, f);
  const D = shade(PUMPKIN, 0.25), L = light(PUMPKIN, 0.25), CUT = '#2a1a14', GLOW = '#f1c453';
  rect(ctx, shade(PUMPKIN, 0.3), 14, 15, 4, 1);
  if (view === 'side') {
    round(ctx, PUMPKIN, 9, 2, 14, 13);
    rect(ctx, D, 13, 3, 1, 11);
    rect(ctx, D, 17, 3, 1, 11);
    rect(ctx, L, 11, 4, 1, 6);
    rect(ctx, L, 15, 4, 1, 6);
    rect(ctx, D, 9, 13, 14, 1);
    rect(ctx, CUT, 19, 6, 3, 2);
    rect(ctx, GLOW, 20, 7, 1, 1);
    rect(ctx, CUT, 18, 11, 5, 2);
    rect(ctx, GLOW, 19, 12, 3, 1);
    rect(ctx, '#4b7a2a', 14, 0, 3, 2);
    rect(ctx, '#2c4a18', 14, 0, 1, 2);
    return;
  }
  round(ctx, PUMPKIN, 7, 2, 18, 13);
  for (const x of [10, 13, 18, 21]) rect(ctx, D, x, 3, 1, 11);
  for (const x of [11, 19]) rect(ctx, L, x, 4, 1, 5);
  rect(ctx, D, 8, 13, 16, 1);
  rect(ctx, '#4b7a2a', 15, 0, 3, 2);
  rect(ctx, '#2c4a18', 15, 0, 1, 2);
  if (view === 'front') {
    for (const x of [11, 17]) {
      rect(ctx, CUT, x + 1, 6, 2, 1);
      rect(ctx, CUT, x, 7, 4, 2);
      rect(ctx, GLOW, x + 1, 7, 2, 1);
    }
    rect(ctx, CUT, 15, 9, 2, 1);
    rect(ctx, CUT, 11, 10, 10, 3);
    rect(ctx, GLOW, 12, 11, 8, 1);
    for (const x of [13, 18]) rect(ctx, PUMPKIN, x, 10, 2, 1);
    rect(ctx, PUMPKIN, 15, 12, 2, 1);
  }
};

const SHEET = '#f2f2fa', SHEET_EDGE = '#6f74a8', SHEET_FOLD = '#d3d6ec';

const ghost: Painter = (ctx, _t, view, step) => {
  const [x0, x1] = view === 'side' ? [9, 22] : [7, 24];
  const hem = (x: number) => 27 + (((x >> 1) + step) & 1);
  // The dark edge first, then the sheet inside it.
  for (const [c, inset] of [[SHEET_EDGE, 0], [SHEET, 1]] as const) {
    round(ctx, c, x0 + 1 + inset, 2 + inset, x1 - x0 - 1 - 2 * inset, 11 - inset);
    for (let x = x0 + inset; x <= x1 - inset; x++) rect(ctx, c, x, 10, 1, hem(x) - 10 + 1 - inset);
  }
  // Little arms under the sheet, swinging.
  if (view === 'side') {
    rect(ctx, SHEET_EDGE, 19, 15 + step, 6, 5);
    rect(ctx, SHEET, 19, 16 + step, 5, 3);
  } else {
    for (const [x, d] of [[4, -1], [24, 1]]) {
      const y = 15 + step * d;
      rect(ctx, SHEET_EDGE, x, y, 4, 6);
      rect(ctx, SHEET, x + (x < 10 ? 1 : 0), y + 1, 3, 4);
    }
  }
  rect(ctx, SHEET_FOLD, view === 'side' ? 11 : 9, 20, 1, 6);
  rect(ctx, SHEET_FOLD, view === 'side' ? 14 : 21, 18, 1, 8);
  if (view === 'front') {
    rect(ctx, EYE, 12, 7, 3, 4);
    rect(ctx, EYE, 17, 7, 3, 4);
    rect(ctx, '#ffffff', 12, 7, 1, 1);
    rect(ctx, '#ffffff', 17, 7, 1, 1);
    rect(ctx, EYE, 15, 12, 2, 3);
  } else if (view === 'side') {
    rect(ctx, EYE, 17, 7, 3, 4);
    rect(ctx, '#ffffff', 17, 7, 1, 1);
    rect(ctx, EYE, 19, 12, 2, 3);
  } else {
    rect(ctx, SHEET_FOLD, 15, 5, 2, 12);
  }
};

const witch: Painter = (ctx, t, view, step) => {
  const robe = '#4b2d6e', robeL = light(robe, 0.2), robeD = shade(robe, 0.3), hatC = '#2f1f4d';
  const hair = '#2b2b34';
  // Pointed shoes under the hem.
  for (const [x, d] of [[9, 1], [18, -1]]) {
    if (view === 'side') break;
    rect(ctx, SHOE, x + step * d, 29, 5, 2);
    rect(ctx, SHOE, x + step * d + (x < 12 ? -1 : 1), 30, 1, 1);
  }
  if (view === 'side') {
    rect(ctx, SHOE, 14 + 3 * step, 29, 6, 2);
    rect(ctx, SHOE, 14 - 3 * step, 29, 6, 2);
  }
  // Arms, then the robe that widens to the hem and sways with the step.
  const sleeveX = view === 'side' ? [] : [[6, -step], [23, step]];
  for (const [x, dy] of sleeveX) {
    const y = 17 + dy;
    rect(ctx, robe, x, y, 3, 6);
    rect(ctx, robeL, x, y, 3, 1);
    rect(ctx, t.skin, x, y + 6, 3, 2);
  }
  if (view === 'side') {
    rect(ctx, robeD, 14 + 3 * step, 17, 4, 6);
    rect(ctx, shade(t.skin, 0.16), 14 + 3 * step, 23, 4, 2);
    round(ctx, robe, 11, 16, 10, 8);
    rect(ctx, robe, 10, 24, 12, 2);
    rect(ctx, robe, 9 + step, 26, 14, 2);
    rect(ctx, robe, 8 + step, 28, 16, 1);
    rect(ctx, robeD, 8 + step, 28, 16, 1);
    rect(ctx, robe, 14 - 3 * step, 17, 4, 6);
    rect(ctx, robeL, 14 - 3 * step, 17, 4, 1);
    rect(ctx, t.skin, 14 - 3 * step, 23, 4, 2);
  } else {
    round(ctx, robe, 9, 16, 14, 8);
    rect(ctx, robeL, 10, 16, 12, 1);
    rect(ctx, robe, 8, 24, 16, 1);
    rect(ctx, robe, 7, 25, 18, 2);
    rect(ctx, robe, 6 + step, 27, 20, 2);
    rect(ctx, robeD, 6 + step, 28, 20, 1);
    rect(ctx, robeD, 21, 17, 2, 7);
    rect(ctx, robeD, 14, 25, 1, 3);
    rect(ctx, robeD, 18, 25, 1, 3);
  }
  const belt = view === 'side' ? [11, 10] : [9, 14];
  rect(ctx, '#3a2a1a', belt[0], 22, belt[1], 1);
  if (view === 'front') rect(ctx, '#f1c453', 15, 22, 2, 1);
  else if (view === 'side') rect(ctx, '#f1c453', 19, 22, 2, 1);
  headSkin(ctx, view, t.skin);
  if (view !== 'back') faces.smile(ctx, t, view, step);
  // Long dark hair framing the face.
  if (view === 'front') {
    rect(ctx, hair, 8, 4, 2, 11);
    rect(ctx, hair, 22, 4, 2, 11);
    rect(ctx, hair, 9, 7, 14, 2);
  } else if (view === 'back') {
    round(ctx, hair, 8, 3, 16, 14);
    rect(ctx, shade(hair, 0.3), 15, 8, 2, 8);
  } else {
    rect(ctx, hair, 9, 4, 8, 12);
    rect(ctx, hair, 10, 7, 10, 2);
  }
  // The pointed hat: a cone on a wide brim, with a band.
  const dx = view === 'side' ? -2 : 0;
  const rows: [number, number][] = [[15, 2], [14, 4], [13, 6], [12, 8], [11, 10], [10, 12]];
  rows.forEach(([x, w], y) => rect(ctx, hatC, x + dx, y, w, 1));
  rect(ctx, light(hatC, 0.25), 13 + dx, 3, 1, 2);
  rect(ctx, '#e8892f', 10 + dx, 5, 12, 1);
  rect(ctx, '#f1c453', 15 + dx, 5, 2, 1);
  rect(ctx, hatC, view === 'side' ? 7 : 6, 6, 20, 2);
  rect(ctx, shade(hatC, 0.3), view === 'side' ? 8 : 7, 7, 18, 1);
};

export const summerAutumnOutfits: Record<string, Painter> = {
  'beach-goer': beachGoer,
  lifeguard,
  'ice-cream-seller': iceCreamSeller,
  scarecrow,
  zombie,
  'pumpkin-head': pumpkinHead,
  ghost,
  witch,
};
