// Accessories, drawn last over the hair. Hats register the row their lower edge ends on in HAT_LINES, and hair
// above that row is not drawn.
import { rect, round, type Painter } from './draw';

const DARK = '#1f1d26';

const glasses: Painter = (ctx, t, view) => {
  if (view === 'back') return;
  const frame = (x: number) => {
    rect(ctx, t.acc, x, 9, 4, 1);
    rect(ctx, t.acc, x, 12, 4, 1);
    rect(ctx, t.acc, x, 9, 1, 4);
    rect(ctx, t.acc, x + 3, 9, 1, 4);
  };
  if (view === 'front') {
    frame(11);
    frame(17);
    rect(ctx, t.acc, 15, 10, 2, 1);
  } else {
    frame(17);
    rect(ctx, t.acc, 14, 10, 3, 1);
  }
};

const sunglasses: Painter = (ctx, _t, view) => {
  if (view === 'back') return;
  const lens = (x: number) => {
    rect(ctx, DARK, x, 9, 4, 3);
    rect(ctx, '#5a5668', x + 1, 9, 1, 1);
  };
  if (view === 'front') {
    lens(11);
    lens(17);
    rect(ctx, DARK, 15, 9, 2, 1);
  } else {
    lens(17);
    rect(ctx, DARK, 14, 9, 3, 1);
  }
};

const cap: Painter = (ctx, t, view) => {
  round(ctx, t.acc, 9, 0, view === 'side' ? 13 : 14, 7);
  rect(ctx, t.accL, 11, 1, 5, 1);
  rect(ctx, t.accD, 9, 6, view === 'side' ? 13 : 14, 1);
  if (view === 'front') rect(ctx, t.accD, 10, 7, 12, 1); // the bill, seen from the front
  if (view === 'side') {
    rect(ctx, t.accD, 21, 6, 5, 1); // the bill points the way the face looks
    rect(ctx, t.acc, 21, 5, 4, 1);
  }
  if (view === 'back') rect(ctx, t.accD, 14, 5, 4, 1);
};

const beanie: Painter = (ctx, t, view) => {
  const w = view === 'side' ? 13 : 14;
  round(ctx, t.acc, 9, 0, w, 8);
  rect(ctx, t.accL, 11, 1, 5, 1);
  rect(ctx, t.accD, 9, 6, w, 2);
  for (let x = 10; x < 9 + w - 1; x += 2) rect(ctx, t.acc, x, 6, 1, 1);
};

const headphones: Painter = (ctx, t, view) => {
  if (view === 'side') {
    rect(ctx, t.acc, 11, 0, 9, 1);
    rect(ctx, t.acc, 15, 1, 2, 7);
    round(ctx, t.accD, 13, 8, 6, 5);
    rect(ctx, t.accL, 14, 9, 4, 1);
    return;
  }
  rect(ctx, t.acc, 10, 0, 12, 1);
  rect(ctx, t.acc, 9, 1, 1, 8);
  rect(ctx, t.acc, 22, 1, 1, 8);
  for (const x of [7, 22]) {
    round(ctx, t.accD, x, 8, 3, 6);
    rect(ctx, t.accL, x, 9, 3, 1);
  }
};

const bow: Painter = (ctx, t, view) => {
  const [l, r, k] = view === 'side' ? [10, 15, 13] : [15, 20, 18];
  rect(ctx, t.acc, l, 1, 3, 4);
  rect(ctx, t.acc, r, 1, 3, 4);
  rect(ctx, t.accL, l, 1, 3, 1);
  rect(ctx, t.accL, r, 1, 3, 1);
  rect(ctx, t.accD, k, 2, 2, 2);
};

const FLOWER = '#f1c453';
const flowerClip: Painter = (ctx, t, view) => {
  const [x, y] = view === 'front' ? [11, 3] : view === 'side' ? [12, 3] : [20, 3];
  rect(ctx, t.acc, x, y - 1, 1, 3);
  rect(ctx, t.acc, x - 1, y, 3, 1);
  rect(ctx, FLOWER, x, y, 1, 1);
};

const mustache: Painter = (ctx, t, view) => {
  if (view === 'front') {
    rect(ctx, t.hair, 13, 12, 6, 1);
    rect(ctx, t.hair, 13, 13, 1, 1);
    rect(ctx, t.hair, 18, 13, 1, 1);
    rect(ctx, t.hairD, 14, 12, 4, 1);
  } else if (view === 'side') {
    rect(ctx, t.hair, 18, 12, 4, 1);
    rect(ctx, t.hairD, 19, 12, 2, 1);
  }
};

const beard: Painter = (ctx, t, view) => {
  if (view === 'front') {
    rect(ctx, t.hair, 9, 11, 2, 4);
    rect(ctx, t.hair, 21, 11, 2, 4);
    rect(ctx, t.hair, 11, 14, 10, 1);
    rect(ctx, t.hair, 12, 13, 3, 1);
    rect(ctx, t.hair, 17, 13, 3, 1);
    rect(ctx, t.hair, 12, 15, 8, 1);
    rect(ctx, t.hairD, 12, 15, 8, 1);
    rect(ctx, t.hairD, 11, 14, 10, 1);
  } else if (view === 'side') {
    rect(ctx, t.hair, 13, 10, 2, 3);
    rect(ctx, t.hair, 13, 13, 9, 2);
    rect(ctx, t.hair, 18, 12, 4, 1);
    rect(ctx, t.hairD, 13, 14, 9, 1);
    rect(ctx, t.mouth, 19, 13, 2, 1);
  }
};

const earrings: Painter = (ctx, t, view) => {
  if (view === 'side') {
    rect(ctx, t.acc, 15, 12, 1, 2);
    rect(ctx, t.accL, 15, 12, 1, 1);
    return;
  }
  for (const x of [9, 22]) {
    rect(ctx, t.acc, x, 13, 1, 2);
    rect(ctx, t.accL, x, 13, 1, 1);
  }
};

export const accessories: Record<string, Painter> = {
  glasses, sunglasses, cap, beanie, headphones, bow, mustache, beard, earrings, 'flower-clip': flowerClip,
};
/** Accessories that sit on the head: hair above this row is not drawn. */
export const HAT_LINES: Record<string, number> = { cap: 7, beanie: 8 };
