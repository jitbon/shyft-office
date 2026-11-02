// Winter and spring outfits: snowman, Santa suit, reindeer, elf, leprechaun, bunny and gardener.
import { light, shade } from '../palette';
import { EYE, rect, round, type Ctx, type Painter, type View } from './draw';

interface Cloth {
  coat: string; pants: string; shoe: string; skin: string;
  sleeve?: string; cuff?: string; hands?: string;
}

/** Legs, feet, torso and arms in the given colors (no head), laid out like the default character. */
function figure(ctx: Ctx, view: View, step: number, c: Cloth) {
  const sleeve = c.sleeve ?? c.coat, hands = c.hands ?? c.skin;
  if (view === 'side') {
    const frontLeg = 14 + 3 * step, backLeg = 14 - 3 * step;
    const frontArm = 14 - 3 * step, backArm = 14 + 3 * step;
    rect(ctx, shade(sleeve, 0.25), backArm, 17, 4, 6);
    rect(ctx, shade(hands, 0.16), backArm, 23, 4, 2);
    rect(ctx, shade(c.pants, 0.25), backLeg, 25, 4, 3);
    rect(ctx, c.shoe, backLeg, 28, 6, 2);
    rect(ctx, c.pants, 11, 25, 10, 2);
    rect(ctx, shade(c.pants, 0.3), 11, 24, 10, 1);
    rect(ctx, c.pants, frontLeg, 25, 4, 3);
    rect(ctx, c.shoe, frontLeg, 28, 6, 2);
    rect(ctx, light(c.shoe, 0.25), frontLeg, 28, 6, 1);
    round(ctx, c.coat, 11, 16, 10, 8);
    rect(ctx, light(c.coat, 0.2), 12, 16, 8, 1);
    rect(ctx, shade(c.coat, 0.25), 11, 22, 10, 2);
    rect(ctx, sleeve, frontArm, 17, 4, 6);
    rect(ctx, light(sleeve, 0.2), frontArm, 17, 4, 1);
    if (c.cuff) rect(ctx, c.cuff, frontArm, 22, 4, 1);
    rect(ctx, hands, frontArm, 23, 4, 2);
    return;
  }
  for (const [x0, off] of [[10, step], [17, -step]]) {
    const bottom = 27 + off;
    rect(ctx, c.pants, x0, 25, 5, bottom - 24);
    rect(ctx, shade(c.pants, 0.25), x0 + 4, 25, 1, bottom - 24);
    rect(ctx, c.shoe, x0, bottom + 1, 5, 2);
    rect(ctx, light(c.shoe, 0.25), x0, bottom + 1, 5, 1);
  }
  rect(ctx, c.pants, 10, 25, 12, 2);
  rect(ctx, shade(c.pants, 0.3), 10, 24, 12, 1);
  for (const [x, dy] of [[6, -step], [23, step]]) {
    const y = 17 + dy;
    rect(ctx, sleeve, x, y, 3, 6);
    rect(ctx, light(sleeve, 0.2), x, y, 3, 1);
    rect(ctx, shade(sleeve, 0.25), x, y + 5, 3, 1);
    if (c.cuff) rect(ctx, c.cuff, x, y + 4, 3, 1);
    rect(ctx, hands, x, y + 6, 3, 2);
  }
  round(ctx, c.coat, 9, 16, 14, 8);
  rect(ctx, light(c.coat, 0.2), 10, 16, 12, 1);
  rect(ctx, shade(c.coat, 0.25), 9, 22, 14, 2);
  rect(ctx, shade(c.coat, 0.25), 21, 17, 2, 5);
}

/** Neck and a head whose top is row `top`; front and back are 14 wide, the side 12. */
function head(ctx: Ctx, view: View, skin: string, top = 3) {
  const d = shade(skin, 0.16), h = 15 - top;
  rect(ctx, d, view === 'side' ? 13 : 14, 15, 4, 1);
  if (view === 'side') {
    round(ctx, skin, 10, top, 12, h);
    rect(ctx, skin, 22, 11, 1, 2);
    rect(ctx, d, 22, 12, 1, 1);
  } else {
    round(ctx, skin, 9, top, 14, h);
    if (view === 'front') rect(ctx, d, 11, 14, 10, 1);
  }
}

/** Two eyes (one in the side view). */
function eyes(ctx: Ctx, view: View, y: number, color = EYE) {
  if (view === 'front') {
    for (const x of [12, 18]) {
      rect(ctx, color, x, y, 2, 2);
      rect(ctx, '#ffffff', x, y, 1, 1);
    }
  } else if (view === 'side') {
    rect(ctx, color, 18, y, 2, 2);
    rect(ctx, '#ffffff', 18, y, 1, 1);
  }
}

const mouthOf = (skin: string) => shade(skin, 0.35);

// ------------------------------------------------------------------ snowman

const SNOW = '#f4f8fb', SNOW_D = '#c4d3e2', COAL = '#2b2b33', CARROT = '#f08a2c', STICK = '#6b4a2a', SCARF = '#d64545';

function ball(ctx: Ctx, x: number, y: number, w: number, h: number) {
  round(ctx, SNOW, x, y, w, h);
  rect(ctx, SNOW_D, x + w - 3, y + 2, 2, h - 4);
  rect(ctx, SNOW_D, x + 2, y + h - 1, w - 4, 1);
  rect(ctx, '#ffffff', x + 2, y + 1, 3, 1);
}

const snowman: Painter = (ctx, _t, view, step) => {
  const side = view === 'side';
  // Two stubby feet that take turns lifting.
  for (const [x, off] of side ? [[11, step], [16, -step]] : [[10, step], [17, -step]]) rect(ctx, '#4a4a52', x, 28 - Math.max(0, off), 5, 2);
  const bx = side ? 8 : 7, bw = side ? 15 : 18;
  ball(ctx, bx, 19, bw, 10);
  // Stick arms swing opposite to each other.
  if (side) {
    rect(ctx, STICK, 5, 15 + step, 4, 1);
    rect(ctx, STICK, 5, 14 + step, 1, 2);
  } else {
    rect(ctx, STICK, 3, 15 - step, 5, 1);
    rect(ctx, STICK, 3, 14 - step, 1, 2);
    rect(ctx, STICK, 24, 15 + step, 5, 1);
    rect(ctx, STICK, 28, 14 + step, 1, 2);
  }
  ball(ctx, side ? 9 : 8, 11, side ? 14 : 16, 9);
  if (side) {
    rect(ctx, STICK, 22, 15 - step, 4, 1);
    rect(ctx, STICK, 25, 14 - step, 1, 2);
  }
  ball(ctx, 10, 1, 12, 11);
  // Scarf.
  rect(ctx, SCARF, side ? 10 : 9, 11, side ? 12 : 14, 2);
  rect(ctx, shade(SCARF, 0.25), side ? 10 : 9, 12, side ? 12 : 14, 1);
  if (view === 'front') rect(ctx, SCARF, 19, 13, 3, 5);
  else if (view === 'back') rect(ctx, SCARF, 13, 13, 4, 6);
  else rect(ctx, SCARF, 10, 13, 3, 5);
  if (view === 'front') {
    rect(ctx, COAL, 12, 4, 2, 2);
    rect(ctx, COAL, 18, 4, 2, 2);
    rect(ctx, CARROT, 15, 6, 3, 2);
    rect(ctx, shade(CARROT, 0.25), 15, 7, 3, 1);
    for (const [x, y, w] of [[12, 8, 1], [13, 9, 1], [15, 9, 2], [18, 9, 1], [19, 8, 1]]) rect(ctx, COAL, x, y, w, 1);
    for (const y of [15, 17, 19]) rect(ctx, COAL, 15, y, 2, 2);
  } else if (view === 'side') {
    rect(ctx, COAL, 18, 4, 2, 2);
    rect(ctx, CARROT, 21, 6, 5, 2);
    rect(ctx, shade(CARROT, 0.25), 21, 7, 5, 1);
    rect(ctx, COAL, 18, 9, 2, 1);
    for (const y of [15, 17, 19]) rect(ctx, COAL, 19, y, 2, 2);
  }
};

// -------------------------------------------------------------------- Santa

const santa: Painter = (ctx, t, view, step) => {
  const suit = t.outfit, trim = '#f6f6f2', trimD = '#d4d4cc';
  figure(ctx, view, step, { coat: suit, pants: suit, shoe: '#2a2024', skin: t.skin, cuff: trim, hands: '#f0e4d8' });
  // Belt and hem.
  if (view === 'side') {
    rect(ctx, '#2a2024', 11, 20, 10, 2);
    rect(ctx, '#e8c547', 15, 20, 3, 2);
    rect(ctx, trim, 11, 23, 10, 1);
  } else {
    rect(ctx, '#2a2024', 9, 20, 14, 2);
    if (view === 'front') {
      rect(ctx, '#e8c547', 14, 20, 4, 2);
      rect(ctx, '#2a2024', 15, 21, 2, 1);
      rect(ctx, trim, 15, 16, 2, 4); // fur down the front
    }
    rect(ctx, trim, 9, 23, 14, 1);
  }
  head(ctx, view, t.skin);
  if (view === 'front') {
    eyes(ctx, view, 8);
    rect(ctx, '#e8a090', 15, 9, 2, 2);
    round(ctx, trim, 10, 10, 12, 5);
    rect(ctx, trim, 12, 15, 8, 2);
    rect(ctx, trimD, 12, 13, 8, 1);
    rect(ctx, trim, 11, 10, 10, 2);
    rect(ctx, '#e8a090', 15, 9, 2, 2);
    rect(ctx, mouthOf(t.skin), 15, 12, 2, 1);
  } else if (view === 'back') {
    round(ctx, trim, 9, 6, 14, 8);
    rect(ctx, trimD, 10, 12, 12, 2);
  } else {
    eyes(ctx, view, 8);
    rect(ctx, trim, 9, 6, 6, 8);
    rect(ctx, trimD, 9, 12, 6, 2);
    round(ctx, trim, 15, 10, 7, 5);
    rect(ctx, trim, 17, 15, 4, 2);
    rect(ctx, '#e8a090', 21, 9, 2, 2);
  }
  // Hat with a white brim and a pom-pom on a drooping tip.
  const w = view === 'side' ? 13 : 14;
  rect(ctx, suit, 10, 0, w - 2, 2);
  rect(ctx, suit, 9, 2, w, 3);
  rect(ctx, shade(suit, 0.25), 9, 4, w, 1);
  rect(ctx, trim, 9, 5, w, 2);
  rect(ctx, trimD, 9, 6, w, 1);
  rect(ctx, trim, view === 'side' ? 7 : 20, 0, 3, 3);
};

// ----------------------------------------------------------------- reindeer

const FUR = '#9a6a3f', HORN = '#e0c892';

const reindeer: Painter = (ctx, t, view, step) => {
  figure(ctx, view, step, { coat: FUR, pants: shade(FUR, 0.15), shoe: '#3a2a22', skin: FUR, hands: '#6e4a2a' });
  if (view === 'front') rect(ctx, '#e6cfa0', 12, 17, 8, 6);
  else if (view === 'side') rect(ctx, '#e6cfa0', 17, 17, 3, 6);
  else rect(ctx, '#ffffff', 15, 22, 3, 2); // tail
  head(ctx, view, FUR, 4);
  const horn = (x: number, flip: number) => {
    // A stem with two tines; `flip` mirrors the tines outward.
    rect(ctx, HORN, x, 0, 2, 5);
    rect(ctx, HORN, flip < 0 ? x - 2 : x + 2, 1, 2, 1);
    rect(ctx, HORN, flip < 0 ? x - 2 : x + 2, 0, 1, 2);
    rect(ctx, shade(HORN, 0.25), x + 1, 3, 1, 2);
  };
  if (view === 'side') {
    rect(ctx, shade(HORN, 0.2), 12, 1, 2, 4);
    rect(ctx, shade(HORN, 0.2), 10, 1, 2, 1);
    horn(15, 1);
    rect(ctx, FUR, 11, 5, 3, 3);
    rect(ctx, '#e8a0a0', 12, 6, 1, 1);
    eyes(ctx, view, 8);
    rect(ctx, '#e6cfa0', 17, 10, 5, 4);
    rect(ctx, '#d64545', 21, 10, 2, 2);
  } else {
    horn(10, -1);
    horn(20, 1);
    rect(ctx, FUR, 7, 6, 3, 3);
    rect(ctx, FUR, 22, 6, 3, 3);
    rect(ctx, '#e8a0a0', 8, 7, 1, 1);
    rect(ctx, '#e8a0a0', 23, 7, 1, 1);
    if (view === 'front') {
      eyes(ctx, view, 8);
      rect(ctx, '#e6cfa0', 12, 10, 8, 4);
      rect(ctx, '#d64545', 15, 10, 2, 2);
      rect(ctx, mouthOf('#e6cfa0'), 15, 13, 2, 1);
    }
  }
};

// ---------------------------------------------------------------------- elf

const ELF_GREEN = '#3f9d5a', ELF_RED = '#c8323c';

const elf: Painter = (ctx, t, view, step) => {
  figure(ctx, view, step, { coat: ELF_GREEN, pants: ELF_RED, shoe: '#6b4a2a', skin: t.skin, cuff: '#f6f6f2' });
  // Tunic with a belt and a zig-zag hem.
  const x0 = view === 'side' ? 11 : 9, tw = view === 'side' ? 10 : 14;
  rect(ctx, '#5a3a22', x0, 21, tw, 1);
  if (view === 'front') rect(ctx, '#e8c547', 15, 21, 2, 1);
  for (let x = x0; x < x0 + tw; x += 2) rect(ctx, ELF_GREEN, x, 24, 1, 1);
  if (view === 'front') rect(ctx, '#f6f6f2', 14, 16, 4, 1);
  head(ctx, view, t.skin);
  // Pointed ears.
  if (view === 'side') {
    rect(ctx, t.skin, 12, 8, 4, 3);
    rect(ctx, t.skin, 11, 7, 1, 2);
  } else {
    for (const x of [6, 23]) {
      rect(ctx, t.skin, x + 1, 8, 2, 3);
      rect(ctx, t.skin, x + (x < 10 ? 0 : 2), 7, 1, 2);
    }
  }
  // Brown hair under the hat.
  const hair = '#7a4a2a';
  if (view === 'back') round(ctx, hair, 9, 6, 14, 8);
  else if (view === 'front') {
    rect(ctx, hair, 9, 6, 14, 2);
    rect(ctx, hair, 9, 8, 2, 3);
    rect(ctx, hair, 21, 8, 2, 3);
  } else {
    rect(ctx, hair, 9, 6, 13, 2);
    rect(ctx, hair, 9, 8, 6, 5);
  }
  if (view === 'front') {
    eyes(ctx, view, 9);
    rect(ctx, t.blush, 11, 12, 2, 1);
    rect(ctx, t.blush, 19, 12, 2, 1);
    rect(ctx, t.mouth, 14, 13, 4, 1);
  } else if (view === 'side') {
    eyes(ctx, view, 9);
    rect(ctx, t.mouth, 19, 13, 2, 1);
  }
  // Pointed hat bending to one side, with a gold bell.
  const w = view === 'side' ? 13 : 14;
  rect(ctx, ELF_RED, 9, 5, w, 2);
  rect(ctx, ELF_GREEN, 10, 3, w - 2, 2);
  rect(ctx, ELF_GREEN, 12, 1, w - 6, 2);
  rect(ctx, shade(ELF_GREEN, 0.25), 10, 4, w - 2, 1);
  rect(ctx, ELF_GREEN, 17, 0, 5, 1);
  rect(ctx, '#e8c547', 22, 0, 2, 2);
};

// -------------------------------------------------------------- leprechaun

const LEP_GREEN = '#2f8f4e', LEP_DARK = '#1f5c35', GINGER = '#d9712a', GOLD = '#e8c547';

const leprechaun: Painter = (ctx, t, view, step) => {
  figure(ctx, view, step, { coat: LEP_GREEN, pants: LEP_DARK, shoe: '#2a2024', skin: t.skin, cuff: '#f6f6f2' });
  if (view === 'front') {
    rect(ctx, '#f6f6f2', 14, 16, 4, 2);
    rect(ctx, GOLD, 15, 19, 2, 1);
    rect(ctx, GOLD, 15, 22, 2, 1);
    rect(ctx, LEP_DARK, 9, 20, 14, 1);
  } else if (view === 'side') {
    rect(ctx, GOLD, 19, 19, 1, 1);
    rect(ctx, LEP_DARK, 11, 20, 10, 1);
  } else rect(ctx, LEP_DARK, 9, 20, 14, 1);
  head(ctx, view, t.skin, 5);
  if (view === 'back') round(ctx, GINGER, 9, 6, 14, 8);
  else if (view === 'front') {
    rect(ctx, GINGER, 9, 6, 3, 5);
    rect(ctx, GINGER, 20, 6, 3, 5);
    eyes(ctx, view, 8);
    round(ctx, GINGER, 10, 10, 12, 5);
    rect(ctx, GINGER, 12, 15, 8, 2);
    rect(ctx, shade(GINGER, 0.25), 12, 14, 8, 1);
    rect(ctx, light(GINGER, 0.3), 11, 11, 4, 1);
    rect(ctx, '#e8a090', 15, 10, 2, 1);
  } else {
    rect(ctx, GINGER, 9, 6, 6, 7);
    eyes(ctx, view, 8);
    round(ctx, GINGER, 15, 10, 7, 5);
    rect(ctx, GINGER, 17, 15, 4, 2);
    rect(ctx, shade(GINGER, 0.25), 15, 14, 7, 1);
  }
  // Top hat: crown, black band with a gold buckle, wide brim.
  const bx = view === 'side' ? 9 : 8, bw = view === 'side' ? 15 : 16;
  rect(ctx, LEP_GREEN, 11, 0, 10, 4);
  rect(ctx, light(LEP_GREEN, 0.2), 12, 0, 3, 3);
  rect(ctx, '#1d1d24', 11, 3, 10, 1);
  rect(ctx, LEP_DARK, bx, 4, bw, 2);
  rect(ctx, shade(LEP_DARK, 0.3), bx, 5, bw, 1);
  if (view === 'front') rect(ctx, GOLD, 15, 2, 3, 2);
  else if (view === 'side') rect(ctx, GOLD, 19, 2, 2, 2);
};

// -------------------------------------------------------------------- bunny

const FLUFF = '#f4f1f4', PINK = '#f2a8c4';

const bunny: Painter = (ctx, t, view, step) => {
  figure(ctx, view, step, { coat: FLUFF, pants: FLUFF, shoe: PINK, skin: FLUFF, hands: FLUFF });
  if (view === 'front') {
    rect(ctx, '#f9dbe6', 12, 17, 8, 5);
    rect(ctx, '#ffffff', 15, 24, 2, 1);
  } else if (view === 'side') {
    rect(ctx, '#f9dbe6', 17, 17, 3, 5);
  }
  head(ctx, view, FLUFF, 5);
  rect(ctx, shade(FLUFF, 0.12), view === 'side' ? 10 : 9, 12, view === 'side' ? 12 : 14, 2);
  // Long ears.
  if (view === 'side') {
    rect(ctx, shade(FLUFF, 0.15), 11, 1, 3, 5);
    rect(ctx, FLUFF, 14, 0, 3, 6);
    rect(ctx, PINK, 15, 1, 1, 4);
  } else {
    for (const x of [11, 18]) {
      rect(ctx, FLUFF, x, 0, 3, 6);
      if (view === 'front') rect(ctx, PINK, x + 1, 1, 1, 4);
      else rect(ctx, shade(FLUFF, 0.12), x + 1, 1, 1, 4);
    }
  }
  if (view === 'front') {
    eyes(ctx, view, 8);
    rect(ctx, '#e8708a', 15, 10, 2, 1);
    rect(ctx, PINK, 11, 11, 2, 1);
    rect(ctx, PINK, 19, 11, 2, 1);
    rect(ctx, '#8f3b3b', 15, 12, 2, 1);
  } else if (view === 'side') {
    eyes(ctx, view, 8);
    rect(ctx, '#e8708a', 22, 10, 1, 2);
    rect(ctx, PINK, 17, 11, 2, 1);
    rect(ctx, '#8f3b3b', 20, 12, 2, 1);
  } else {
    // Round cotton tail.
    round(ctx, '#ffffff', 12, 22, 8, 6);
    rect(ctx, shade(FLUFF, 0.12), 13, 26, 6, 2);
  }
  if (view === 'side') {
    round(ctx, '#ffffff', 7, 22, 5, 5);
    rect(ctx, shade(FLUFF, 0.12), 8, 25, 3, 2);
  }
};

// ----------------------------------------------------------------- gardener

const STRAW = '#e0c070', DENIM = '#4b6fb0', CAN = '#9fb0c2';

const gardener: Painter = (ctx, t, view, step) => {
  figure(ctx, view, step, { coat: '#8bc34a', pants: DENIM, shoe: '#6b4a2a', skin: t.skin });
  // Bib and straps.
  if (view === 'front') {
    rect(ctx, DENIM, 11, 18, 10, 6);
    rect(ctx, shade(DENIM, 0.25), 14, 21, 4, 2);
    rect(ctx, DENIM, 10, 16, 2, 3);
    rect(ctx, DENIM, 20, 16, 2, 3);
    rect(ctx, '#e8c547', 11, 18, 1, 1);
    rect(ctx, '#e8c547', 20, 18, 1, 1);
  } else if (view === 'back') {
    rect(ctx, DENIM, 9, 21, 14, 3);
    rect(ctx, DENIM, 11, 16, 2, 5);
    rect(ctx, DENIM, 19, 16, 2, 5);
  } else {
    rect(ctx, DENIM, 11, 19, 10, 5);
    rect(ctx, DENIM, 12, 16, 2, 3);
    rect(ctx, shade(DENIM, 0.25), 15, 21, 4, 2);
    rect(ctx, '#e8c547', 19, 19, 1, 1);
  }
  head(ctx, view, t.skin);
  const hair = '#6b4423';
  if (view === 'back') round(ctx, hair, 9, 6, 14, 8);
  else if (view === 'front') {
    rect(ctx, hair, 9, 6, 14, 2);
    rect(ctx, hair, 9, 8, 2, 3);
    rect(ctx, hair, 21, 8, 2, 3);
    eyes(ctx, view, 9);
    rect(ctx, t.blush, 11, 12, 2, 1);
    rect(ctx, t.blush, 19, 12, 2, 1);
    rect(ctx, t.mouth, 15, 13, 2, 1);
  } else {
    rect(ctx, hair, 9, 6, 13, 2);
    rect(ctx, hair, 9, 8, 6, 5);
    eyes(ctx, view, 9);
    rect(ctx, t.blush, 17, 12, 2, 1);
    rect(ctx, t.mouth, 19, 13, 2, 1);
  }
  // Watering can in the near hand: body, handle and a spout with a rose.
  if (view === 'side') {
    const x = 14 - 3 * step + 3;
    rect(ctx, CAN, x, 24, 5, 4);
    rect(ctx, light(CAN, 0.3), x, 24, 5, 1);
    rect(ctx, shade(CAN, 0.25), x, 27, 5, 1);
    rect(ctx, shade(CAN, 0.25), x, 22, 1, 2);
    rect(ctx, shade(CAN, 0.25), x, 22, 3, 1);
    rect(ctx, CAN, x + 5, 24, 3, 1);
    rect(ctx, CAN, x + 7, 23, 2, 1);
    rect(ctx, '#7f8fa2', x + 8, 21, 1, 3);
  } else {
    const y = 24 + step;
    rect(ctx, CAN, 24, y, 5, 4);
    rect(ctx, light(CAN, 0.3), 24, y, 5, 1);
    rect(ctx, shade(CAN, 0.25), 24, y + 3, 5, 1);
    rect(ctx, shade(CAN, 0.25), 24, y - 2, 1, 2);
    rect(ctx, shade(CAN, 0.25), 24, y - 2, 4, 1);
    if (view === 'front') {
      rect(ctx, CAN, 29, y, 2, 1);
      rect(ctx, CAN, 30, y - 1, 1, 1);
      rect(ctx, '#7f8fa2', 30, y - 3, 1, 2);
    }
  }
  // Wide straw hat with a red ribbon.
  const side = view === 'side';
  round(ctx, STRAW, 11, 1, 10, 5);
  rect(ctx, light(STRAW, 0.3), 12, 1, 4, 1);
  rect(ctx, '#c8323c', 11, 4, 10, 1);
  rect(ctx, STRAW, side ? 6 : 5, 5, side ? 19 : 22, 2);
  rect(ctx, shade(STRAW, 0.3), side ? 6 : 5, 6, side ? 19 : 22, 1);
};

export const winterSpringOutfits: Record<string, Painter> = { snowman, santa, reindeer, elf, leprechaun, bunny, gardener };
