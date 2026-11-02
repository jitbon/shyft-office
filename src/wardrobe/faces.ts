import { EYE, rect, type Painter } from './draw';

const smile: Painter = (ctx, t, view) => {
  if (view === 'back') return;
  if (view === 'front') {
    for (const x of [12, 18]) {
      rect(ctx, t.hairD, x, 9, 2, 1);
      rect(ctx, EYE, x, 10, 2, 2);
      rect(ctx, '#ffffff', x, 10, 1, 1);
    }
    rect(ctx, t.blush, 11, 12, 2, 1);
    rect(ctx, t.blush, 19, 12, 2, 1);
    rect(ctx, t.mouth, 15, 13, 2, 1);
  } else {
    rect(ctx, t.hairD, 18, 9, 3, 1);
    rect(ctx, EYE, 18, 10, 2, 2);
    rect(ctx, '#ffffff', 18, 10, 1, 1);
    rect(ctx, t.blush, 17, 12, 2, 1);
    rect(ctx, t.mouth, 19, 13, 2, 1);
  }
};

const WHITE = '#ffffff';

/** A normal eye: dark, with a highlight. */
const eye = (ctx: Parameters<Painter>[0], x: number, y = 10) => {
  rect(ctx, EYE, x, y, 2, 2);
  rect(ctx, WHITE, x, y, 1, 1);
};

const grin: Painter = (ctx, t, view) => {
  if (view === 'back') return;
  if (view === 'front') {
    for (const x of [12, 18]) { rect(ctx, t.hairD, x, 9, 2, 1); eye(ctx, x); }
    rect(ctx, t.blush, 11, 12, 2, 1);
    rect(ctx, t.blush, 19, 12, 2, 1);
    rect(ctx, EYE, 14, 12, 4, 1); // open mouth, teeth below the lip
    rect(ctx, WHITE, 14, 13, 4, 1);
    rect(ctx, t.mouth, 15, 14, 2, 1);
  } else {
    rect(ctx, t.hairD, 18, 9, 3, 1);
    eye(ctx, 18);
    rect(ctx, t.blush, 17, 12, 2, 1);
    rect(ctx, EYE, 19, 12, 3, 1);
    rect(ctx, WHITE, 19, 13, 3, 1);
    rect(ctx, t.mouth, 19, 14, 2, 1);
  }
};

const calm: Painter = (ctx, t, view) => {
  if (view === 'back') return;
  if (view === 'front') {
    for (const x of [12, 18]) {
      rect(ctx, t.hairD, x, 9, 2, 1);
      rect(ctx, EYE, x, 11, 2, 1); // closed, relaxed
      rect(ctx, t.skinD, x, 12, 2, 1);
    }
    rect(ctx, t.blush, 11, 12, 1, 1);
    rect(ctx, t.blush, 20, 12, 1, 1);
    rect(ctx, t.mouth, 15, 13, 2, 1);
    rect(ctx, t.skinD, 14, 13, 1, 1);
    rect(ctx, t.skinD, 17, 13, 1, 1);
  } else {
    rect(ctx, t.hairD, 18, 9, 3, 1);
    rect(ctx, EYE, 18, 11, 2, 1);
    rect(ctx, t.skinD, 18, 12, 2, 1);
    rect(ctx, t.blush, 17, 12, 1, 1);
    rect(ctx, t.mouth, 19, 13, 2, 1);
    rect(ctx, t.skinD, 18, 13, 1, 1);
  }
};

const wink: Painter = (ctx, t, view) => {
  if (view === 'back') return;
  if (view === 'front') {
    rect(ctx, t.hairD, 12, 9, 2, 1);
    eye(ctx, 12);
    rect(ctx, t.hairD, 18, 8, 2, 1); // raised brow
    rect(ctx, EYE, 18, 11, 2, 1); // the winking eye is a line
    rect(ctx, EYE, 20, 10, 1, 1);
    rect(ctx, t.blush, 11, 12, 2, 1);
    rect(ctx, t.blush, 19, 12, 2, 1);
    rect(ctx, t.mouth, 15, 13, 3, 1); // lopsided smile
    rect(ctx, t.mouth, 18, 12, 1, 1);
  } else {
    rect(ctx, t.hairD, 18, 8, 3, 1);
    rect(ctx, EYE, 18, 11, 2, 1);
    rect(ctx, EYE, 20, 10, 1, 1);
    rect(ctx, t.blush, 17, 12, 2, 1);
    rect(ctx, t.mouth, 19, 13, 2, 1);
    rect(ctx, t.mouth, 21, 12, 1, 1);
  }
};

const neutral: Painter = (ctx, t, view) => {
  if (view === 'back') return;
  if (view === 'front') {
    for (const x of [12, 18]) {
      rect(ctx, t.hairD, x, 9, 2, 1);
      rect(ctx, EYE, x, 10, 2, 2);
    }
    rect(ctx, t.mouth, 14, 13, 4, 1); // flat, wide
  } else {
    rect(ctx, t.hairD, 18, 9, 3, 1);
    rect(ctx, EYE, 18, 10, 2, 2);
    rect(ctx, t.mouth, 18, 13, 3, 1);
  }
};

const surprised: Painter = (ctx, t, view) => {
  if (view === 'back') return;
  if (view === 'front') {
    for (const x of [12, 18]) {
      rect(ctx, t.hairD, x, 8, 2, 1); // brows high
      rect(ctx, WHITE, x - 1, 9, 4, 4);
      rect(ctx, EYE, x, 10, 2, 2);
    }
    rect(ctx, EYE, 15, 13, 2, 2); // open "o" mouth
    rect(ctx, t.mouth, 15, 13, 1, 1);
  } else {
    rect(ctx, t.hairD, 18, 8, 3, 1);
    rect(ctx, WHITE, 17, 9, 4, 4);
    rect(ctx, EYE, 18, 10, 2, 2);
    rect(ctx, EYE, 19, 13, 2, 2);
    rect(ctx, t.mouth, 19, 13, 1, 1);
  }
};

const sleepy: Painter = (ctx, t, view) => {
  if (view === 'back') return;
  if (view === 'front') {
    for (const x of [12, 18]) {
      rect(ctx, t.skinD, x, 10, 2, 1); // heavy lid
      rect(ctx, EYE, x, 11, 2, 1);
      rect(ctx, t.skinD, x, 12, 2, 1); // bag
    }
    rect(ctx, t.mouth, 15, 13, 2, 1);
    rect(ctx, t.mouth, 16, 14, 1, 1); // small yawn
  } else {
    rect(ctx, t.skinD, 18, 10, 2, 1);
    rect(ctx, EYE, 18, 11, 2, 1);
    rect(ctx, t.skinD, 18, 12, 2, 1);
    rect(ctx, t.mouth, 19, 13, 2, 1);
    rect(ctx, t.mouth, 19, 14, 1, 1);
  }
};

const freckles: Painter = (ctx, t, view) => {
  if (view === 'back') return;
  const spot = '#a8663a';
  if (view === 'front') {
    for (const x of [12, 18]) { rect(ctx, t.hairD, x, 9, 2, 1); eye(ctx, x); }
    rect(ctx, t.blush, 11, 12, 2, 1);
    rect(ctx, t.blush, 19, 12, 2, 1);
    rect(ctx, t.mouth, 15, 13, 2, 1);
    for (const [x, y] of [[11, 11], [13, 12], [12, 13], [19, 11], [21, 12], [20, 13]]) rect(ctx, spot, x, y, 1, 1);
  } else {
    rect(ctx, t.hairD, 18, 9, 3, 1);
    eye(ctx, 18);
    rect(ctx, t.blush, 17, 12, 2, 1);
    rect(ctx, t.mouth, 19, 13, 2, 1);
    for (const [x, y] of [[17, 11], [19, 12], [18, 13]]) rect(ctx, spot, x, y, 1, 1);
  }
};

export const faces: Record<string, Painter> = { smile, grin, calm, wink, neutral, surprised, sleepy, freckles };
