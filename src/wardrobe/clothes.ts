// Tops (with the arms), bottoms (the legs) and shoes.
import { SHOE, rect, round, type Painter } from './draw';
import { light, shade } from '../palette';
import type { Ctx, Tones, View } from './draw';

const tShirt: Painter = (ctx, t, view, step) => {
  if (view === 'side') {
    const frontArm = 14 - 3 * step;
    round(ctx, t.shirt, 11, 16, 10, 8);
    rect(ctx, t.shirtL, 12, 16, 8, 1);
    rect(ctx, t.shirtD, 11, 22, 10, 2);
    rect(ctx, t.shirt, frontArm, 17, 4, 6);
    rect(ctx, t.shirtL, frontArm, 17, 4, 1);
    rect(ctx, t.skin, frontArm, 23, 4, 2);
    return;
  }
  // Arms swing opposite to the legs.
  for (const [x, dy] of [[6, -step], [23, step]]) {
    const y = 17 + dy;
    rect(ctx, t.shirt, x, y, 3, 6);
    rect(ctx, t.shirtL, x, y, 3, 1);
    rect(ctx, t.shirtD, x, y + 5, 3, 1);
    rect(ctx, t.skin, x, y + 6, 3, 2);
  }
  round(ctx, t.shirt, 9, 16, 14, 8);
  rect(ctx, t.shirtL, 10, 16, 12, 1);
  rect(ctx, t.shirtD, 9, 22, 14, 2);
  rect(ctx, t.shirtD, 21, 17, 2, 5);
  if (view === 'front') rect(ctx, t.skinD, 15, 16, 2, 1); // collar
};

const trousers: Painter = (ctx, t, view, step) => {
  if (view === 'side') {
    const frontLeg = 14 + 3 * step, backLeg = 14 - 3 * step;
    rect(ctx, t.bottomD, backLeg, 25, 4, 3);
    rect(ctx, t.bottom, 11, 25, 10, 2);
    rect(ctx, t.bottomDD, 11, 24, 10, 1);
    rect(ctx, t.bottom, frontLeg, 25, 4, 3);
    return;
  }
  // The stepping leg reaches a pixel lower, the other lifts.
  for (const [x0, off] of [[10, step], [17, -step]]) {
    const bottom = 27 + off;
    rect(ctx, t.bottom, x0, 25, 5, bottom - 24);
    rect(ctx, t.bottomD, x0 + 4, 25, 1, bottom - 24);
  }
  rect(ctx, t.bottom, 10, 25, 12, 2);
  rect(ctx, t.bottomDD, 10, 24, 12, 1);
};

const sneakers: Painter = (ctx, _t, view, step) => {
  if (view === 'side') {
    const frontLeg = 14 + 3 * step, backLeg = 14 - 3 * step;
    rect(ctx, SHOE, backLeg, 28, 6, 2);
    rect(ctx, SHOE, frontLeg, 28, 6, 2);
    rect(ctx, light(SHOE, 0.25), frontLeg, 28, 6, 1);
    return;
  }
  for (const [x0, off] of [[10, step], [17, -step]]) {
    const bottom = 27 + off;
    rect(ctx, SHOE, x0, bottom + 1, 5, 2);
    rect(ctx, light(SHOE, 0.25), x0, bottom + 1, 5, 1);
  }
};


// ------------------------------------------------------------ shared pieces

/** The trunk in a color, in the shape of the t-shirt's. */
function torso(ctx: Ctx, view: View, c: string, cL: string, cD: string) {
  if (view === 'side') {
    round(ctx, c, 11, 16, 10, 8);
    rect(ctx, cL, 12, 16, 8, 1);
    rect(ctx, cD, 11, 22, 10, 2);
    return;
  }
  round(ctx, c, 9, 16, 14, 8);
  rect(ctx, cL, 10, 16, 12, 1);
  rect(ctx, cD, 9, 22, 14, 2);
  rect(ctx, cD, 21, 17, 2, 5);
}

/** The arms with `cloth` rows of sleeve and skin below; in the side view only the near arm (the far one is the body's). */
function arms(ctx: Ctx, t: Tones, view: View, step: number, o: { c: string; cL: string; cD: string; cloth: number }) {
  const sleeve = (x: number, y: number, w: number, band: boolean) => {
    if (o.cloth > 0) {
      rect(ctx, o.c, x, y, w, o.cloth);
      rect(ctx, o.cL, x, y, w, 1);
      if (band) rect(ctx, o.cD, x, y + o.cloth - 1, w, 1);
    }
    rect(ctx, t.skin, x, y + o.cloth, w, 8 - o.cloth);
    if (o.cloth === 0) rect(ctx, t.skinD, x + w - 1, y, 1, 8);
  };
  if (view === 'side') return sleeve(14 - 3 * step, 17, 4, false);
  sleeve(6, 17 - step, 3, true);
  sleeve(23, 17 + step, 3, true);
}

const CREAM = '#ece6da';
const TIE = '#c8323c';

// ------------------------------------------------------------ tops

const hoodie: Painter = (ctx, t, view, step) => {
  torso(ctx, view, t.shirt, t.shirtL, t.shirtD);
  if (view === 'front') {
    rect(ctx, t.shirtD, 11, 15, 10, 2); // hood around the neck
    rect(ctx, t.shirtL, 11, 17, 10, 1);
    rect(ctx, t.shirtL, 14, 18, 1, 3); // drawstrings
    rect(ctx, t.shirtL, 17, 18, 1, 3);
    rect(ctx, t.shirtD, 11, 20, 10, 1); // pocket
    rect(ctx, t.shirtD, 11, 20, 1, 3);
    rect(ctx, t.shirtD, 20, 20, 1, 3);
  } else if (view === 'back') {
    round(ctx, t.shirtD, 10, 14, 12, 7); // the hood hanging behind
    rect(ctx, t.shirt, 12, 16, 8, 3);
    rect(ctx, t.shirtL, 12, 16, 8, 1);
  } else {
    round(ctx, t.shirtD, 10, 14, 5, 6);
    rect(ctx, t.shirt, 11, 16, 3, 3);
    rect(ctx, t.shirtD, 15, 21, 5, 1); // pocket
  }
  arms(ctx, t, view, step, { c: t.shirt, cL: t.shirtL, cD: t.shirtD, cloth: 7 });
};

const sweater: Painter = (ctx, t, view, step) => {
  torso(ctx, view, t.shirt, t.shirtL, t.shirtD);
  const x0 = view === 'side' ? 11 : 9, w = view === 'side' ? 10 : 14;
  for (let x = x0; x < x0 + w; x += 2) rect(ctx, t.shirtL, x, 22, 1, 2); // ribbed hem
  for (let x = x0 + 1; x < x0 + w - 1; x += 2) rect(ctx, t.shirtL, x, 19, 1, 1); // a stitched band
  rect(ctx, t.shirtD, view === 'side' ? 12 : 11, 15, view === 'side' ? 6 : 10, view === 'back' ? 1 : 2); // crew neck
  arms(ctx, t, view, step, { c: t.shirt, cL: t.shirtL, cD: t.shirtD, cloth: 7 });
};

const shirtTie: Painter = (ctx, t, view, step) => {
  const white = light(t.shirt, 0.8);
  torso(ctx, view, t.shirt, t.shirtL, t.shirtD);
  if (view === 'front') {
    rect(ctx, white, 12, 15, 3, 2);
    rect(ctx, white, 17, 15, 3, 2);
    rect(ctx, TIE, 15, 16, 2, 1);
    rect(ctx, TIE, 15, 17, 2, 4);
    rect(ctx, shade(TIE, 0.3), 15, 21, 2, 1);
    rect(ctx, t.shirtD, 14, 17, 1, 5); // placket
  } else if (view === 'back') {
    rect(ctx, white, 12, 15, 8, 1);
    rect(ctx, t.shirtD, 16, 17, 1, 6);
  } else {
    rect(ctx, white, 14, 15, 4, 2);
    rect(ctx, TIE, 19, 17, 1, 5);
  }
  arms(ctx, t, view, step, { c: t.shirt, cL: t.shirtL, cD: t.shirtD, cloth: 7 });
};

const blouse: Painter = (ctx, t, view, step) => {
  torso(ctx, view, t.shirt, t.shirtL, t.shirtD);
  const frill = light(t.shirt, 0.55);
  if (view === 'front') {
    rect(ctx, frill, 11, 15, 10, 2);
    rect(ctx, t.shirtD, 15, 17, 2, 2); // bow
    rect(ctx, frill, 9, 23, 14, 1);
  } else if (view === 'back') {
    rect(ctx, frill, 11, 15, 10, 1);
    rect(ctx, frill, 9, 23, 14, 1);
  } else {
    rect(ctx, frill, 12, 15, 7, 2);
    rect(ctx, t.shirtD, 18, 17, 2, 2);
    rect(ctx, frill, 11, 23, 10, 1);
  }
  arms(ctx, t, view, step, { c: t.shirt, cL: t.shirtL, cD: frill, cloth: 3 });
};

const dress: Painter = (ctx, t, view, step) => {
  torso(ctx, view, t.shirt, t.shirtL, t.shirtD);
  if (view === 'side') {
    rect(ctx, t.shirt, 10, 24, 12, 4); // the skirt, over the legs
    rect(ctx, t.shirtD, 10, 27, 12, 1);
    rect(ctx, t.shirtD, 11, 23, 10, 1);
    if (step) rect(ctx, t.shirt, step > 0 ? 22 : 9, 26, 1, 2);
  } else {
    rect(ctx, t.shirt, 8, 24, 16, 4);
    rect(ctx, t.shirtD, 8, 27, 16, 1);
    rect(ctx, t.shirtD, 9, 23, 14, 1); // belt
    for (const x of [12, 16, 20]) rect(ctx, t.shirtD, x, 25, 1, 2);
    if (step) rect(ctx, t.shirt, step > 0 ? 24 : 7, 26, 1, 2);
    for (const [x0, off] of [[10, step], [17, -step]]) if (off > 0) rect(ctx, t.skin, x0, 28, 5, 1); // a leg reaching below the hem
  }
  arms(ctx, t, view, step, { c: t.shirt, cL: t.shirtL, cD: t.shirtD, cloth: 4 });
};

const jacket: Painter = (ctx, t, view, step) => {
  const inner = light(t.shirt, 0.65);
  torso(ctx, view, t.shirt, t.shirtL, t.shirtD);
  if (view === 'front') {
    rect(ctx, inner, 14, 16, 4, 8);
    rect(ctx, t.shirtD, 13, 16, 1, 6);
    rect(ctx, t.shirtD, 18, 16, 1, 6);
    rect(ctx, t.shirtD, 11, 15, 3, 2);
    rect(ctx, t.shirtD, 18, 15, 3, 2);
    rect(ctx, t.shirtD, 10, 21, 3, 1);
    rect(ctx, t.shirtD, 19, 21, 3, 1);
  } else if (view === 'back') {
    rect(ctx, t.shirtD, 15, 16, 2, 8);
    rect(ctx, t.shirtD, 11, 15, 10, 1);
  } else {
    rect(ctx, inner, 19, 16, 1, 8);
    rect(ctx, t.shirtD, 12, 15, 5, 2);
  }
  arms(ctx, t, view, step, { c: t.shirt, cL: t.shirtL, cD: t.shirtD, cloth: 7 });
};

const tankTop: Painter = (ctx, t, view, step) => {
  if (view === 'side') {
    round(ctx, t.shirt, 12, 17, 8, 7);
    rect(ctx, t.shirtL, 13, 17, 6, 1);
    rect(ctx, t.shirtD, 12, 22, 8, 2);
    rect(ctx, t.shirt, 13, 16, 2, 1); // strap
    rect(ctx, t.skin, 11, 16, 1, 7);
  } else {
    rect(ctx, t.skin, 9, 16, 14, 2);
    round(ctx, t.shirt, 10, 17, 12, 7);
    rect(ctx, t.shirtL, 11, 17, 10, 1);
    rect(ctx, t.shirtD, 10, 22, 12, 2);
    rect(ctx, t.shirtD, 20, 18, 2, 4);
    rect(ctx, t.shirt, 11, 16, 2, 1); // straps
    rect(ctx, t.shirt, 19, 16, 2, 1);
    if (view === 'front') rect(ctx, t.skin, 13, 17, 6, 1); // the neckline
  }
  arms(ctx, t, view, step, { c: t.skin, cL: t.skin, cD: t.skinD, cloth: 0 });
};

const polo: Painter = (ctx, t, view, step) => {
  torso(ctx, view, t.shirt, t.shirtL, t.shirtD);
  if (view === 'front') {
    rect(ctx, t.shirtL, 11, 15, 4, 2);
    rect(ctx, t.shirtL, 17, 15, 4, 2);
    rect(ctx, t.shirtD, 16, 17, 1, 3); // placket
    rect(ctx, t.shirtL, 15, 18, 1, 1);
  } else if (view === 'back') {
    rect(ctx, t.shirtL, 11, 15, 10, 1);
  } else {
    rect(ctx, t.shirtL, 12, 15, 5, 2);
    rect(ctx, t.shirtD, 19, 17, 1, 3);
  }
  arms(ctx, t, view, step, { c: t.shirt, cL: t.shirtL, cD: t.shirtD, cloth: 3 });
};

const overalls: Painter = (ctx, t, view, step) => {
  torso(ctx, view, CREAM, light(CREAM, 0.3), shade(CREAM, 0.15));
  if (view === 'front') {
    rect(ctx, t.shirt, 11, 19, 10, 5); // the bib
    rect(ctx, t.shirtD, 13, 20, 6, 1);
    rect(ctx, t.shirt, 11, 16, 2, 3);
    rect(ctx, t.shirt, 19, 16, 2, 3);
    rect(ctx, t.shirtL, 11, 19, 1, 1);
    rect(ctx, t.shirtL, 20, 19, 1, 1);
    rect(ctx, t.shirt, 9, 22, 14, 2);
    rect(ctx, t.shirtD, 9, 23, 14, 1);
  } else if (view === 'back') {
    rect(ctx, t.shirt, 11, 16, 2, 6);
    rect(ctx, t.shirt, 19, 16, 2, 6);
    rect(ctx, t.shirt, 9, 21, 14, 3);
    rect(ctx, t.shirtD, 9, 23, 14, 1);
    rect(ctx, t.shirtL, 11, 21, 1, 1);
    rect(ctx, t.shirtL, 20, 21, 1, 1);
  } else {
    rect(ctx, t.shirt, 12, 19, 9, 5);
    rect(ctx, t.shirt, 14, 16, 2, 3);
    rect(ctx, t.shirtD, 17, 20, 3, 1);
    rect(ctx, t.shirtD, 12, 23, 9, 1);
  }
  arms(ctx, t, view, step, { c: CREAM, cL: light(CREAM, 0.3), cD: shade(CREAM, 0.15), cloth: 4 });
};

// ------------------------------------------------------------ bottoms

/** Straight legs to the ankle; `jeans` adds a stitched seam, `joggers` a stripe and cuffs. */
const longLegs = (extra: (ctx: Ctx, t: Tones, view: View, leg: { x: number; bottom: number }) => void): Painter => (ctx, t, view, step) => {
  if (view === 'side') {
    const frontLeg = 14 + 3 * step, backLeg = 14 - 3 * step;
    rect(ctx, t.bottomD, backLeg, 25, 4, 3);
    rect(ctx, t.bottom, 11, 25, 10, 2);
    rect(ctx, t.bottomDD, 11, 24, 10, 1);
    rect(ctx, t.bottom, frontLeg, 25, 4, 3);
    extra(ctx, t, view, { x: frontLeg, bottom: 27 });
    return;
  }
  for (const [x0, off] of [[10, step], [17, -step]]) {
    const bottom = 27 + off;
    rect(ctx, t.bottom, x0, 25, 5, bottom - 24);
    rect(ctx, t.bottomD, x0 + 4, 25, 1, bottom - 24);
    extra(ctx, t, view, { x: x0, bottom });
  }
  rect(ctx, t.bottom, 10, 25, 12, 2);
  rect(ctx, t.bottomDD, 10, 24, 12, 1);
};

const jeans = longLegs((ctx, t, view, { x, bottom }) => {
  if (view === 'side') {
    rect(ctx, t.bottomL, 19, 25, 1, 1); // pocket stitch
    rect(ctx, t.bottomD, x, bottom, 4, 1); // hem
    return;
  }
  rect(ctx, t.bottomL, x + 1, 26, 1, bottom - 25); // the seam
  rect(ctx, t.bottomD, x, bottom, 5, 1);
  if (view === 'front') rect(ctx, t.bottomL, x === 10 ? 11 : 20, 25, 1, 1);
});

const joggers = longLegs((ctx, t, view, { x, bottom }) => {
  if (view === 'side') {
    rect(ctx, t.bottomL, x + 3, 25, 1, 2);
    rect(ctx, t.bottomDD, x, bottom, 4, 1); // cuff
    return;
  }
  rect(ctx, t.bottomL, x === 10 ? x : x + 4, 25, 1, bottom - 25); // the stripe
  rect(ctx, t.bottomDD, x, bottom, 5, 1);
});

/** Skin from the knee down, for the bottoms that stop above it. */
function bareLegs(ctx: Ctx, t: Tones, view: View, step: number, from: number) {
  if (view === 'side') {
    const frontLeg = 14 + 3 * step, backLeg = 14 - 3 * step;
    rect(ctx, t.skinD, backLeg, from, 4, 28 - from);
    rect(ctx, t.skin, frontLeg, from, 4, 28 - from);
    return;
  }
  for (const [x0, off] of [[10, step], [17, -step]]) {
    const bottom = 27 + off;
    if (bottom >= from) {
      rect(ctx, t.skin, x0, from, 5, bottom - from + 1);
      rect(ctx, t.skinD, x0 + 4, from, 1, bottom - from + 1);
    }
  }
}

const shorts: Painter = (ctx, t, view, step) => {
  bareLegs(ctx, t, view, step, 26);
  if (view === 'side') {
    rect(ctx, t.bottom, 11, 25, 10, 2);
    rect(ctx, t.bottomDD, 11, 24, 10, 1);
    rect(ctx, t.bottomD, 14 - 3 * step, 25, 4, 2);
    rect(ctx, t.bottom, 14 + 3 * step, 25, 4, 2);
    rect(ctx, t.bottomD, 14 + 3 * step, 26, 4, 1);
    return;
  }
  for (const x0 of [10, 17]) {
    rect(ctx, t.bottom, x0, 25, 5, 2);
    rect(ctx, t.bottomD, x0 + 4, 25, 1, 2);
    rect(ctx, t.bottomD, x0, 26, 5, 1);
  }
  rect(ctx, t.bottom, 10, 25, 12, 1);
  rect(ctx, t.bottomDD, 10, 24, 12, 1);
};

const skirt: Painter = (ctx, t, view, step) => {
  bareLegs(ctx, t, view, step, 27);
  if (view === 'side') {
    rect(ctx, t.bottom, 10, 24, 12, 3);
    rect(ctx, t.bottomDD, 10, 24, 12, 1);
    rect(ctx, t.bottomD, 10, 26, 12, 1);
    if (step) rect(ctx, t.bottom, step > 0 ? 22 : 9, 25, 1, 2);
    return;
  }
  rect(ctx, t.bottom, 9, 24, 14, 3);
  rect(ctx, t.bottomDD, 9, 24, 14, 1);
  rect(ctx, t.bottomD, 9, 26, 14, 1);
  for (const x of [12, 16, 19]) rect(ctx, t.bottomD, x, 25, 1, 1);
  if (step) rect(ctx, t.bottom, step > 0 ? 23 : 8, 25, 1, 2);
};

const longSkirt: Painter = (ctx, t, view, step) => {
  if (view === 'side') {
    rect(ctx, t.bottom, 10, 24, 12, 4);
    rect(ctx, t.bottomDD, 10, 24, 12, 1);
    rect(ctx, t.bottomD, 10, 27, 12, 1);
    rect(ctx, t.bottomD, 14, 25, 1, 2);
    if (step) rect(ctx, t.bottom, step > 0 ? 22 : 9, 26, 1, 2);
    return;
  }
  for (const [x0, off] of [[10, step], [17, -step]]) if (off > 0) rect(ctx, t.skin, x0, 28, 5, 1); // a leg reaching below the hem
  rect(ctx, t.bottom, 8, 24, 16, 4);
  rect(ctx, t.bottomDD, 8, 24, 16, 1);
  rect(ctx, t.bottomD, 8, 27, 16, 1);
  for (const x of [11, 15, 20]) rect(ctx, t.bottomD, x, 25, 1, 2);
  if (step) rect(ctx, t.bottom, step > 0 ? 24 : 7, 26, 1, 2);
};

// ------------------------------------------------------------ shoes

/** A pair of shoes, each drawn by `one(ctx, x, y, w, near)`: `near` is the front foot of the side view. */
const pairOf = (one: (ctx: Ctx, x: number, y: number, w: number, near: boolean) => void): Painter => (ctx, _t, view, step) => {
  if (view === 'side') {
    one(ctx, 14 - 3 * step, 28, 6, false);
    one(ctx, 14 + 3 * step, 28, 6, true);
    return;
  }
  for (const [x0, off] of [[10, step], [17, -step]]) one(ctx, x0, 27 + off + 1, 5, true);
};

const BOOT = '#6b4a2f';
const boots = pairOf((ctx, x, y, w, near) => {
  rect(ctx, BOOT, x, y, w, 3);
  rect(ctx, light(BOOT, 0.25), x, y, w, 1);
  rect(ctx, shade(BOOT, 0.45), x, y + 2, w, 1);
  if (!near) rect(ctx, shade(BOOT, 0.2), x, y, w, 2);
});

const sandals: Painter = (ctx, t, view, step) => {
  const STRAP = '#8a5a3b';
  pairOf((c, x, y, w, near) => {
    rect(c, near ? t.skin : t.skinD, x, y, w, 1);
    rect(c, STRAP, x + (w > 5 ? 2 : 1), y, 1, 1);
    rect(c, STRAP, x, y + 1, w, 1);
  })(ctx, t, view, step);
};

const DRESS_SHOE = '#4a2e22';
const dressShoes = pairOf((ctx, x, y, w, near) => {
  rect(ctx, DRESS_SHOE, x, y, w, 2);
  rect(ctx, shade(DRESS_SHOE, 0.5), x, y + 1, w, 1);
  if (near) rect(ctx, light(DRESS_SHOE, 0.55), x + 1, y, 1, 1); // a shine
});

const SLIPPER = '#d98fb0';
const slippers = pairOf((ctx, x, y, w, near) => {
  rect(ctx, SLIPPER, x, y, w, 2);
  rect(ctx, light(SLIPPER, 0.4), x, y, w, 1);
  rect(ctx, shade(SLIPPER, 0.25), x, y + 1, w, 1);
  if (near) rect(ctx, light(SLIPPER, 0.4), x + w - 2, y + 1, 1, 1);
});

export const tops: Record<string, Painter> = {
  't-shirt': tShirt, hoodie, sweater, 'shirt-tie': shirtTie, blouse, dress, jacket, 'tank-top': tankTop, polo, overalls,
};
export const bottoms: Record<string, Painter> = { trousers, jeans, shorts, skirt, 'long-skirt': longSkirt, joggers };
export const shoes: Record<string, Painter> = { sneakers, boots, sandals, 'dress-shoes': dressShoes, slippers };
/** Tops with no sleeves: the far arm in the side view is skin. */
export const SLEEVELESS = new Set(['tank-top']);
