import { rect, round, type Painter } from './draw';

const short: Painter = (ctx, t, view) => {
  if (view === 'back') {
    round(ctx, t.hair, 9, 1, 14, 13);
    rect(ctx, t.hairL, 11, 2, 5, 1);
    rect(ctx, t.hairL, 10, 3, 2, 2);
    rect(ctx, t.hairD, 10, 11, 12, 3);
    rect(ctx, t.hairD, 15, 6, 2, 3);
  } else if (view === 'front') {
    round(ctx, t.hair, 9, 1, 14, 6);
    rect(ctx, t.hair, 9, 7, 2, 4);
    rect(ctx, t.hair, 21, 7, 2, 4);
    rect(ctx, t.hair, 11, 7, 6, 2);
    rect(ctx, t.hair, 17, 7, 4, 1);
    rect(ctx, t.hairL, 11, 2, 5, 1);
    rect(ctx, t.hairL, 10, 3, 2, 1);
    rect(ctx, t.hairD, 11, 6, 10, 1);
  } else {
    round(ctx, t.hair, 9, 1, 13, 6);
    rect(ctx, t.hair, 9, 7, 6, 6);
    rect(ctx, t.hair, 15, 7, 6, 2);
    rect(ctx, t.hairL, 11, 2, 5, 1);
    rect(ctx, t.hairL, 10, 3, 2, 1);
    rect(ctx, t.hairD, 9, 11, 6, 2);
  }
};


type P = Parameters<Painter>;
/** Alternating light/dark rows down a plait or tail. */
const strand = (ctx: P[0], t: P[1], x: number, y: number, w: number, h: number) => {
  rect(ctx, t.hair, x, y, w, h);
  for (let i = 1; i < h; i += 2) rect(ctx, t.hairD, x, y + i, w, 1);
  rect(ctx, t.hairL, x, y, 1, h);
  if (w >= 3) rect(ctx, t.hairD, x + w - 1, y, 1, h);
};

const crew: Painter = (ctx, t, view) => {
  if (view === 'back') {
    round(ctx, t.hair, 9, 2, 14, 10);
    rect(ctx, t.hairL, 11, 3, 5, 1);
    rect(ctx, t.hairD, 10, 10, 12, 2);
  } else if (view === 'front') {
    round(ctx, t.hair, 9, 2, 14, 5);
    rect(ctx, t.hair, 9, 7, 1, 3);
    rect(ctx, t.hair, 22, 7, 1, 3);
    rect(ctx, t.hair, 11, 7, 10, 1);
    rect(ctx, t.hairL, 11, 3, 5, 1);
    rect(ctx, t.hairD, 11, 6, 10, 1);
  } else {
    round(ctx, t.hair, 10, 2, 12, 5);
    rect(ctx, t.hair, 9, 5, 5, 6);
    rect(ctx, t.hair, 15, 7, 6, 1);
    rect(ctx, t.hairL, 12, 3, 5, 1);
    rect(ctx, t.hairD, 9, 10, 5, 1);
  }
};

const sidePart: Painter = (ctx, t, view, step) => {
  if (view === 'back') return short(ctx, t, view, step);
  if (view === 'front') {
    round(ctx, t.hair, 9, 1, 14, 6);
    rect(ctx, t.hair, 9, 7, 2, 4);
    rect(ctx, t.hair, 21, 7, 2, 3);
    rect(ctx, t.hair, 11, 7, 8, 2);
    rect(ctx, t.hair, 19, 7, 2, 1);
    rect(ctx, t.hairL, 11, 2, 4, 1);
    rect(ctx, t.hairL, 12, 7, 4, 1);
    rect(ctx, t.hairD, 18, 1, 1, 5);
    rect(ctx, t.hairD, 11, 6, 7, 1);
    rect(ctx, t.hairD, 19, 6, 3, 1);
  } else {
    round(ctx, t.hair, 9, 1, 13, 6);
    rect(ctx, t.hair, 9, 7, 6, 6);
    rect(ctx, t.hair, 15, 7, 7, 2);
    rect(ctx, t.hairL, 12, 2, 5, 1);
    rect(ctx, t.hairL, 16, 7, 4, 1);
    rect(ctx, t.hairD, 14, 1, 1, 4);
    rect(ctx, t.hairD, 9, 11, 6, 2);
  }
};

const curly: Painter = (ctx, t, view) => {
  for (const x of view === 'side' ? [10, 14, 18] : [10, 14, 19]) rect(ctx, t.hair, x, 0, x === 14 ? 4 : 3, 1);
  if (view === 'back') {
    round(ctx, t.hair, 8, 1, 16, 13);
    for (const x of [9, 12, 15, 18, 21]) rect(ctx, t.hair, x, 14, 2, 1);
    rect(ctx, t.hairD, 9, 11, 14, 2);
    for (const [x, y] of [[11, 3], [17, 4], [13, 7], [19, 8], [10, 9]]) rect(ctx, t.hairL, x, y, 2, 1);
  } else if (view === 'front') {
    round(ctx, t.hair, 8, 1, 16, 7);
    rect(ctx, t.hair, 8, 7, 3, 6);
    rect(ctx, t.hair, 21, 7, 3, 6);
    rect(ctx, t.hair, 11, 7, 3, 2);
    rect(ctx, t.hair, 16, 7, 5, 2);
    rect(ctx, t.hair, 14, 7, 2, 1);
    for (const [x, y] of [[10, 2], [16, 3], [13, 5], [20, 4], [9, 8]]) rect(ctx, t.hairL, x, y, 2, 1);
    for (const x of [11, 17, 21]) rect(ctx, t.hairD, x, 6, 2, 1);
    rect(ctx, t.hairD, 8, 12, 2, 1);
    rect(ctx, t.hairD, 22, 12, 2, 1);
  } else {
    round(ctx, t.hair, 8, 1, 14, 7);
    rect(ctx, t.hair, 8, 7, 7, 7);
    rect(ctx, t.hair, 15, 7, 6, 2);
    rect(ctx, t.hair, 15, 9, 1, 1);
    for (const [x, y] of [[10, 2], [15, 3], [12, 6], [9, 9]]) rect(ctx, t.hairL, x, y, 2, 1);
    rect(ctx, t.hairD, 8, 12, 7, 2);
    rect(ctx, t.hairD, 18, 7, 3, 1);
  }
};

const afro: Painter = (ctx, t, view) => {
  if (view === 'back') {
    round(ctx, t.hair, 6, 0, 20, 15);
    rect(ctx, t.hairD, 8, 11, 16, 3);
    rect(ctx, t.hairL, 9, 2, 5, 1);
    rect(ctx, t.hairL, 8, 3, 2, 3);
    for (const [x, y] of [[16, 4], [12, 7], [19, 8]]) rect(ctx, t.hairL, x, y, 2, 1);
  } else if (view === 'front') {
    round(ctx, t.hair, 6, 0, 20, 8);
    rect(ctx, t.hair, 6, 7, 4, 7);
    rect(ctx, t.hair, 22, 7, 4, 7);
    rect(ctx, t.hairL, 9, 1, 5, 1);
    rect(ctx, t.hairL, 8, 2, 2, 2);
    for (const [x, y] of [[16, 3], [12, 5], [20, 5]]) rect(ctx, t.hairL, x, y, 2, 1);
    rect(ctx, t.hairD, 10, 7, 12, 1);
    rect(ctx, t.hairD, 7, 12, 3, 2);
    rect(ctx, t.hairD, 22, 12, 3, 2);
  } else {
    round(ctx, t.hair, 6, 0, 17, 8);
    rect(ctx, t.hair, 6, 7, 9, 7);
    rect(ctx, t.hair, 15, 7, 6, 1);
    rect(ctx, t.hairL, 9, 1, 5, 1);
    rect(ctx, t.hairL, 8, 2, 2, 2);
    for (const [x, y] of [[15, 3], [11, 6]]) rect(ctx, t.hairL, x, y, 2, 1);
    rect(ctx, t.hairD, 7, 12, 8, 2);
    rect(ctx, t.hairD, 16, 7, 5, 1);
  }
};

const long: Painter = (ctx, t, view, step) => {
  if (view === 'back') {
    round(ctx, t.hair, 9, 1, 14, 13);
    rect(ctx, t.hair, 9, 13, 14, 9);
    rect(ctx, t.hair, 10 + step, 22, 12, 1);
    rect(ctx, t.hairL, 11, 2, 5, 1);
    rect(ctx, t.hairL, 10, 3, 2, 2);
    rect(ctx, t.hairD, 10, 11, 12, 2);
    rect(ctx, t.hairD, 15, 6, 2, 3);
    rect(ctx, t.hairD, 10 + step, 21, 12, 1);
  } else if (view === 'front') {
    short(ctx, t, view, step);
    rect(ctx, t.hair, 9, 10, 2, 12);
    rect(ctx, t.hair, 21, 10, 2, 12);
    rect(ctx, t.hairD, 9, 20, 2, 2);
    rect(ctx, t.hairD, 21, 20, 2, 2);
    rect(ctx, t.hairL, 9, 11, 1, 6);
  } else {
    short(ctx, t, view, step);
    rect(ctx, t.hair, 9, 13, 6, 8);
    rect(ctx, t.hair, 9 - step, 21, 6, 2);
    rect(ctx, t.hairD, 9 - step, 22, 6, 1);
    rect(ctx, t.hairD, 9, 17, 2, 4);
    rect(ctx, t.hairL, 11, 13, 1, 6);
  }
};

const ponytail: Painter = (ctx, t, view, step) => {
  if (view === 'back') {
    short(ctx, t, view, step);
    rect(ctx, t.hairD, 14, 5, 4, 1);
    strand(ctx, t, 14 + step, 6, 4, 11);
  } else if (view === 'side') {
    short(ctx, t, view, step);
    rect(ctx, t.hairD, 7, 5, 3, 3);
    strand(ctx, t, 5 + step, 8, 3, 9);
  } else {
    short(ctx, t, view, step);
  }
};

const bun: Painter = (ctx, t, view) => {
  if (view === 'back') {
    round(ctx, t.hair, 9, 2, 14, 12);
    rect(ctx, t.hairL, 11, 3, 5, 1);
    rect(ctx, t.hairD, 10, 11, 12, 3);
    round(ctx, t.hair, 12, 0, 8, 3);
    rect(ctx, t.hairL, 13, 0, 3, 1);
  } else if (view === 'front') {
    round(ctx, t.hair, 9, 2, 14, 5);
    rect(ctx, t.hair, 9, 7, 2, 4);
    rect(ctx, t.hair, 21, 7, 2, 4);
    rect(ctx, t.hair, 11, 7, 6, 2);
    rect(ctx, t.hair, 17, 7, 4, 1);
    rect(ctx, t.hairL, 11, 3, 5, 1);
    rect(ctx, t.hairD, 11, 6, 10, 1);
    round(ctx, t.hair, 12, 0, 8, 3);
    rect(ctx, t.hairL, 13, 0, 3, 1);
    rect(ctx, t.hairD, 12, 2, 8, 1);
  } else {
    round(ctx, t.hair, 9, 2, 13, 5);
    rect(ctx, t.hair, 9, 7, 6, 6);
    rect(ctx, t.hair, 15, 7, 6, 2);
    rect(ctx, t.hairL, 12, 3, 5, 1);
    rect(ctx, t.hairD, 9, 11, 6, 2);
    round(ctx, t.hair, 9, 0, 7, 3);
    rect(ctx, t.hairL, 10, 0, 3, 1);
    rect(ctx, t.hairD, 9, 2, 7, 1);
  }
};

const bob: Painter = (ctx, t, view) => {
  if (view === 'back') {
    round(ctx, t.hair, 8, 1, 16, 14);
    rect(ctx, t.hairL, 11, 2, 5, 1);
    rect(ctx, t.hairL, 10, 3, 2, 2);
    rect(ctx, t.hairD, 9, 12, 14, 3);
    rect(ctx, t.hairD, 15, 6, 2, 3);
  } else if (view === 'front') {
    round(ctx, t.hair, 9, 1, 14, 7);
    rect(ctx, t.hair, 8, 6, 3, 9);
    rect(ctx, t.hair, 21, 6, 3, 9);
    rect(ctx, t.hair, 11, 7, 10, 2);
    rect(ctx, t.hairL, 11, 2, 5, 1);
    rect(ctx, t.hairL, 9, 3, 2, 1);
    rect(ctx, t.hairD, 11, 6, 10, 1);
    rect(ctx, t.hairD, 8, 13, 3, 2);
    rect(ctx, t.hairD, 21, 13, 3, 2);
  } else {
    round(ctx, t.hair, 9, 1, 13, 7);
    rect(ctx, t.hair, 8, 6, 8, 9);
    rect(ctx, t.hair, 15, 7, 6, 2);
    rect(ctx, t.hair, 14, 9, 3, 5);
    rect(ctx, t.hairL, 11, 2, 5, 1);
    rect(ctx, t.hairD, 8, 13, 8, 2);
    rect(ctx, t.hairD, 16, 11, 1, 3);
  }
};

const mohawk: Painter = (ctx, t, view) => {
  if (view === 'back') {
    rect(ctx, t.hair, 14, 0, 4, 12);
    rect(ctx, t.hairL, 14, 1, 1, 8);
    rect(ctx, t.hairD, 17, 4, 1, 7);
  } else if (view === 'front') {
    rect(ctx, t.hair, 14, 0, 4, 7);
    rect(ctx, t.hairL, 14, 0, 1, 6);
    rect(ctx, t.hairD, 17, 2, 1, 5);
  } else {
    rect(ctx, t.hair, 10, 1, 10, 3);
    rect(ctx, t.hair, 12, 0, 6, 1);
    rect(ctx, t.hairL, 12, 1, 5, 1);
    rect(ctx, t.hairD, 10, 3, 10, 1);
  }
};

const braids: Painter = (ctx, t, view, step) => {
  short(ctx, t, view, step);
  if (view === 'front') {
    strand(ctx, t, 9, 11, 2, 12 + step);
    strand(ctx, t, 21, 11, 2, 12 - step);
  } else if (view === 'back') {
    strand(ctx, t, 11, 13, 2, 12 + step);
    strand(ctx, t, 19, 13, 2, 12 - step);
  } else {
    strand(ctx, t, 9, 13, 3, 10);
    rect(ctx, t.hair, 8 - step, 22, 3, 2);
  }
};

const bald: Painter = () => {};

export const hairStyles: Record<string, Painter> = {
  short, crew, 'side-part': sidePart, curly, afro, long, ponytail, bun, bob, mohawk, braids, bald,
};
