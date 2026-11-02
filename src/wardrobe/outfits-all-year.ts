// The all-year outfits: astronaut, robot, pirate, chef, superhero and dinosaur. Each paints the whole figure.
import { light, mix, shade } from '../palette';
import { EYE, rect, round, type Ctx, type Painter, type View } from './draw';

interface Fig {
  legs: string; shoe: string; torso: string; arm: string; hand: string; head: string;
}

/** Legs, feet, arms, torso and a plain head in the default figure's proportions; outfits dress it afterwards. */
function figure(ctx: Ctx, view: View, step: number, f: Fig) {
  if (view === 'side') {
    const frontLeg = 14 + 3 * step, backLeg = 14 - 3 * step;
    const frontArm = 14 - 3 * step, backArm = 14 + 3 * step;
    rect(ctx, shade(f.arm, 0.25), backArm, 17, 4, 6);
    rect(ctx, shade(f.hand, 0.16), backArm, 23, 4, 2);
    rect(ctx, shade(f.legs, 0.25), backLeg, 25, 4, 3);
    rect(ctx, f.shoe, backLeg, 28, 6, 2);
    rect(ctx, f.legs, 11, 25, 10, 2);
    rect(ctx, shade(f.legs, 0.3), 11, 24, 10, 1);
    rect(ctx, f.legs, frontLeg, 25, 4, 3);
    rect(ctx, f.shoe, frontLeg, 28, 6, 2);
    rect(ctx, light(f.shoe, 0.25), frontLeg, 28, 6, 1);
    round(ctx, f.torso, 11, 16, 10, 8);
    rect(ctx, light(f.torso, 0.2), 12, 16, 8, 1);
    rect(ctx, shade(f.torso, 0.25), 11, 22, 10, 2);
    rect(ctx, f.arm, frontArm, 17, 4, 6);
    rect(ctx, light(f.arm, 0.2), frontArm, 17, 4, 1);
    rect(ctx, f.hand, frontArm, 23, 4, 2);
    rect(ctx, shade(f.head, 0.16), 13, 15, 4, 1);
    round(ctx, f.head, 10, 3, 12, 12);
    rect(ctx, f.head, 22, 11, 1, 2);
    return;
  }
  for (const [x0, off] of [[10, step], [17, -step]]) {
    const bottom = 27 + off;
    rect(ctx, f.legs, x0, 25, 5, bottom - 24);
    rect(ctx, shade(f.legs, 0.25), x0 + 4, 25, 1, bottom - 24);
    rect(ctx, f.shoe, x0, bottom + 1, 5, 2);
    rect(ctx, light(f.shoe, 0.25), x0, bottom + 1, 5, 1);
  }
  rect(ctx, f.legs, 10, 25, 12, 2);
  rect(ctx, shade(f.legs, 0.3), 10, 24, 12, 1);
  for (const [x, dy] of [[6, -step], [23, step]]) {
    const y = 17 + dy;
    rect(ctx, f.arm, x, y, 3, 6);
    rect(ctx, light(f.arm, 0.2), x, y, 3, 1);
    rect(ctx, shade(f.arm, 0.25), x, y + 5, 3, 1);
    rect(ctx, f.hand, x, y + 6, 3, 2);
  }
  round(ctx, f.torso, 9, 16, 14, 8);
  rect(ctx, light(f.torso, 0.2), 10, 16, 12, 1);
  rect(ctx, shade(f.torso, 0.25), 9, 22, 14, 2);
  rect(ctx, shade(f.torso, 0.25), 21, 17, 2, 5);
  rect(ctx, shade(f.head, 0.16), 14, 15, 4, 1);
  round(ctx, f.head, 9, 3, 14, 12);
}

const SPACE_WHITE = '#eef1f6';
const SPACE_GREY = '#9aa3b2';

const astronaut: Painter = (ctx, t, view, step) => {
  figure(ctx, view, step, { legs: '#dfe4ec', shoe: '#6b7280', torso: SPACE_WHITE, arm: '#e4e8ef', hand: SPACE_GREY, head: '#c9d0dc' });
  rect(ctx, SPACE_GREY, view === 'side' ? 11 : 9, 22, view === 'side' ? 10 : 14, 1); // belt
  if (view === 'front') {
    rect(ctx, SPACE_GREY, 12, 18, 8, 3);
    rect(ctx, '#e04f5f', 13, 19, 2, 2);
    rect(ctx, '#3fa7d6', 17, 19, 2, 2);
  } else if (view === 'side') {
    rect(ctx, SPACE_GREY, 14, 18, 4, 3);
    rect(ctx, '#e04f5f', 15, 19, 2, 1);
  }
  if (view === 'back') {
    rect(ctx, '#aab3c2', 11, 16, 10, 8);
    rect(ctx, '#d3d9e4', 11, 16, 10, 1);
    rect(ctx, '#7c8596', 11, 22, 10, 2);
    rect(ctx, '#7c8596', 15, 17, 2, 4);
  }
  if (view === 'side') rect(ctx, '#aab3c2', 8, 17, 3, 7);
  // Helmet.
  if (view === 'side') {
    round(ctx, SPACE_WHITE, 9, 1, 14, 14);
    rect(ctx, '#c9d0dc', 9, 10, 5, 4);
    round(ctx, '#27304a', 15, 4, 7, 9);
    rect(ctx, '#6fb6e8', 16, 5, 2, 1);
    rect(ctx, '#6fb6e8', 16, 6, 1, 2);
    rect(ctx, '#3a4668', 15, 11, 7, 2);
  } else {
    round(ctx, SPACE_WHITE, 8, 1, 16, 14);
    rect(ctx, '#c9d0dc', 21, 3, 2, 11);
    rect(ctx, '#c9d0dc', 9, 12, 14, 2);
    if (view === 'front') {
      round(ctx, '#27304a', 10, 4, 12, 9);
      rect(ctx, '#6fb6e8', 11, 5, 3, 1);
      rect(ctx, '#6fb6e8', 11, 6, 1, 2);
      rect(ctx, '#3a4668', 10, 11, 12, 2);
    } else {
      rect(ctx, '#ffffff', 11, 3, 4, 1);
      rect(ctx, SPACE_GREY, 14, 12, 4, 1);
    }
  }
};

const robot: Painter = (ctx, t, view, step) => {
  const metal = '#c3cad4';
  figure(ctx, view, step, { legs: '#4b5563', shoe: '#2f3640', torso: t.outfit, arm: t.outfitD, hand: metal, head: t.outfit });
  const screen = '#1c2430', glow = '#7ee0f5';
  if (view === 'front') {
    rect(ctx, '#2f3640', 12, 18, 8, 4);
    rect(ctx, '#7ee0a0', 13, 19, 2, 2);
    rect(ctx, '#f4d35e', 17, 19, 2, 2);
  } else if (view === 'back') {
    rect(ctx, t.outfitD, 12, 18, 8, 4);
    rect(ctx, t.outfitL, 12, 18, 8, 1);
  } else {
    rect(ctx, '#2f3640', 14, 18, 4, 4);
    rect(ctx, '#7ee0a0', 15, 19, 2, 2);
  }
  // Boxy head, antenna.
  const x = view === 'side' ? 10 : 9, w = view === 'side' ? 12 : 14;
  rect(ctx, '#4b5563', 14, 15, 4, 1);
  rect(ctx, t.outfit, x, 4, w, 11);
  rect(ctx, t.outfitL, x, 4, w, 1);
  rect(ctx, t.outfitD, x, 14, w, 1);
  rect(ctx, t.outfitD, x + w - 2, 5, 2, 9);
  rect(ctx, metal, 15, 3, 2, 1);
  rect(ctx, '#e04f5f', 15, 1, 2, 2);
  if (view === 'front') {
    rect(ctx, metal, 8, 8, 1, 4);
    rect(ctx, metal, 23, 8, 1, 4);
    rect(ctx, screen, 11, 6, 10, 6);
    rect(ctx, glow, 13, 7, 2, 2);
    rect(ctx, glow, 18, 7, 2, 2);
    rect(ctx, glow, 14, 10, 4, 1);
  } else if (view === 'back') {
    for (const y of [6, 8, 10]) rect(ctx, t.outfitD, 12, y, 8, 1);
  } else {
    rect(ctx, metal, 14, 8, 2, 3);
    rect(ctx, screen, 16, 6, 6, 6);
    rect(ctx, glow, 18, 7, 2, 2);
    rect(ctx, glow, 18, 10, 3, 1);
  }
};

const HAT = '#23232b';

const pirate: Painter = (ctx, t, view, step) => {
  figure(ctx, view, step, { legs: '#3a2f2a', shoe: '#2a1f1a', torso: '#eee8da', arm: '#eee8da', hand: t.skin, head: t.skin });
  const red = '#c8323c';
  const front = view !== 'side';
  for (const y of [17, 19, 21]) rect(ctx, red, front ? 9 : 11, y, front ? 14 : 10, 1);
  rect(ctx, red, front ? 10 : 12, 23, front ? 12 : 8, 1);
  rect(ctx, '#7a5a2a', front ? 9 : 11, 22, front ? 14 : 10, 1); // belt over the stripes
  if (view === 'front') {
    rect(ctx, t.hair, 9, 6, 2, 5);
    rect(ctx, t.hair, 21, 6, 2, 5);
    rect(ctx, '#17151b', 9, 8, 6, 1); // strap
    rect(ctx, '#17151b', 11, 9, 4, 3); // patch
    rect(ctx, EYE, 18, 10, 2, 2);
    rect(ctx, '#ffffff', 18, 10, 1, 1);
    rect(ctx, t.blush, 19, 12, 2, 1);
    rect(ctx, t.mouth, 15, 13, 2, 1);
  } else if (view === 'back') {
    round(ctx, t.hair, 9, 5, 14, 9);
    rect(ctx, t.hairD, 10, 11, 12, 3);
    rect(ctx, '#17151b', 9, 8, 14, 1);
  } else {
    rect(ctx, t.hair, 10, 6, 4, 7);
    rect(ctx, '#17151b', 10, 8, 11, 1);
    rect(ctx, '#17151b', 17, 9, 4, 3);
    rect(ctx, t.blush, 17, 12, 2, 1);
    rect(ctx, t.mouth, 19, 13, 2, 1);
  }
  // Tricorn hat with a skull.
  if (view === 'side') {
    rect(ctx, HAT, 9, 1, 14, 3);
    rect(ctx, HAT, 8, 4, 16, 2);
    rect(ctx, '#c9a227', 9, 5, 14, 1);
    rect(ctx, '#ffffff', 15, 2, 2, 2);
  } else {
    rect(ctx, HAT, 10, 1, 12, 3);
    rect(ctx, HAT, 8, 4, 16, 2);
    rect(ctx, '#c9a227', 8, 5, 16, 1);
    if (view === 'front') {
      rect(ctx, '#ffffff', 15, 2, 2, 2);
      rect(ctx, HAT, 15, 3, 1, 1);
    }
  }
};

const chef: Painter = (ctx, t, view, step) => {
  const white = '#fbfbfd', shadowWhite = '#dfe2ea';
  figure(ctx, view, step, { legs: '#aeb4c0', shoe: '#3a3a44', torso: '#f6f7fa', arm: '#f0f1f5', hand: t.skin, head: t.skin });
  if (view === 'front') {
    for (const [x, y] of [[13, 18], [13, 20], [18, 18], [18, 20]]) rect(ctx, '#8a93a3', x, y, 1, 1);
    rect(ctx, '#c8323c', 14, 15, 4, 2);
    rect(ctx, t.hair, 9, 7, 2, 4);
    rect(ctx, t.hair, 21, 7, 2, 4);
    for (const x of [12, 18]) {
      rect(ctx, EYE, x, 10, 2, 2);
      rect(ctx, '#ffffff', x, 10, 1, 1);
    }
    rect(ctx, t.blush, 11, 12, 2, 1);
    rect(ctx, t.blush, 19, 12, 2, 1);
    rect(ctx, t.mouth, 15, 13, 2, 1);
  } else if (view === 'back') {
    rect(ctx, t.hair, 10, 8, 12, 4);
    rect(ctx, '#c8323c', 14, 15, 4, 1);
  } else {
    rect(ctx, '#8a93a3', 15, 18, 1, 1);
    rect(ctx, '#8a93a3', 15, 20, 1, 1);
    rect(ctx, '#c8323c', 15, 15, 4, 2);
    rect(ctx, t.hair, 10, 7, 3, 5);
    rect(ctx, EYE, 18, 10, 2, 2);
    rect(ctx, '#ffffff', 18, 10, 1, 1);
    rect(ctx, t.blush, 17, 12, 2, 1);
    rect(ctx, t.mouth, 19, 13, 2, 1);
  }
  // Tall hat.
  round(ctx, white, 9, 1, 14, 6);
  rect(ctx, shadowWhite, 20, 2, 2, 5);
  rect(ctx, shadowWhite, 12, 3, 1, 3);
  rect(ctx, white, 10, 6, 12, 2);
  rect(ctx, shadowWhite, 10, 7, 12, 1);
};

const SUIT = '#f4d35e';

const superhero: Painter = (ctx, t, view, step) => {
  const side = view === 'side';
  const sway = step;
  // The cape behind the body: it flows back in the side view.
  if (view === 'front') {
    round(ctx, t.outfitD, 7, 16, 18, 13);
  } else if (side) {
    rect(ctx, t.outfit, 7, 16, 5, 11);
    rect(ctx, t.outfitD, 5 + sway, 21, 3, 7);
    rect(ctx, t.outfit, 6 + sway, 20, 3, 8);
    rect(ctx, t.outfitD, 7, 16, 1, 10);
  }
  figure(ctx, view, step, { legs: SUIT, shoe: t.outfitD, torso: SUIT, arm: SUIT, hand: t.outfitD, head: t.skin });
  rect(ctx, t.outfit, side ? 11 : 9, 22, side ? 10 : 14, 1); // belt
  if (view === 'front') {
    rect(ctx, t.outfit, 15, 17, 2, 1);
    rect(ctx, t.outfit, 14, 18, 4, 2);
    rect(ctx, t.outfit, 15, 20, 2, 1);
    rect(ctx, t.outfitL, 15, 18, 2, 1);
    round(ctx, t.hair, 9, 1, 14, 6);
    rect(ctx, t.hair, 9, 7, 2, 4);
    rect(ctx, t.hair, 21, 7, 2, 4);
    rect(ctx, t.hairD, 11, 6, 10, 1);
    rect(ctx, t.outfit, 10, 8, 12, 4);
    rect(ctx, '#ffffff', 12, 10, 2, 1);
    rect(ctx, '#ffffff', 18, 10, 2, 1);
    rect(ctx, t.mouth, 15, 13, 2, 1);
  } else if (view === 'back') {
    round(ctx, t.hair, 9, 1, 14, 13);
    rect(ctx, t.hairD, 10, 11, 12, 3);
    rect(ctx, t.outfit, 9, 8, 14, 2);
    // The cape over the back, the hem in points.
    round(ctx, t.outfit, 8, 15, 16, 13);
    rect(ctx, t.outfitD, 11, 16, 1, 10);
    rect(ctx, t.outfitD, 15, 16, 2, 11);
    rect(ctx, t.outfitD, 20, 16, 1, 10);
    rect(ctx, t.outfitD, 10, 26, 1, 2);
    rect(ctx, t.outfitD, 14, 27, 1, 1);
    rect(ctx, t.outfitD, 17, 27, 1, 1);
    rect(ctx, t.outfitD, 21, 26, 1, 2);
    rect(ctx, t.outfitL, 9, 15, 14, 1);
  } else {
    round(ctx, t.hair, 9, 1, 13, 6);
    rect(ctx, t.hair, 9, 7, 5, 6);
    rect(ctx, t.outfit, 10, 9, 6, 2);
    rect(ctx, t.outfit, 16, 8, 6, 4);
    rect(ctx, '#ffffff', 18, 10, 2, 1);
    rect(ctx, t.mouth, 19, 13, 2, 1);
    rect(ctx, t.outfit, 11, 15, 2, 2); // cape tie
  }
};

const dinosaur: Painter = (ctx, t, view, step) => {
  const belly = mix(t.outfit, '#f4ecc0', 0.6);
  // The tail trails behind: it sways with the step.
  if (view === 'side') {
    rect(ctx, t.outfit, 7, 22, 5, 4);
    rect(ctx, t.outfit, 4, 23 + step, 4, 3);
    rect(ctx, t.outfitD, 2, 24 + step, 3, 2);
    rect(ctx, t.outfitL, 7, 22, 5, 1);
  }
  figure(ctx, view, step, { legs: t.outfit, shoe: t.outfitD, torso: t.outfit, arm: t.outfit, hand: t.outfitL, head: t.outfit });
  const spikes = (x: number, ys: number[]) => ys.forEach((y) => rect(ctx, t.outfitD, x, y, 2, 2));
  if (view === 'front') {
    round(ctx, belly, 12, 17, 8, 6);
    rect(ctx, shade(belly, 0.12), 12, 21, 8, 1);
  } else if (view === 'back') {
    spikes(15, [16, 19, 22]);
    // Tail hangs between the legs.
    rect(ctx, t.outfit, 13, 24, 6, 2);
    rect(ctx, t.outfit, 14, 26, 4, 3);
    rect(ctx, t.outfitD, 15, 29, 2, 1);
    rect(ctx, t.outfitD, 15, 25, 2, 1);
  } else {
    round(ctx, belly, 15, 17, 5, 6);
    rect(ctx, t.outfitD, 11, 17, 1, 2);
    rect(ctx, t.outfitD, 11, 20, 1, 2);
  }
  // The hood: spikes along the top, eye bumps, and a face looking out between the teeth.
  const teeth = '#ffffff';
  if (view === 'front') {
    round(ctx, t.outfit, 8, 2, 16, 13);
    rect(ctx, t.outfitL, 10, 2, 6, 1);
    for (const x of [11, 15, 19]) rect(ctx, t.outfitD, x, 1, 2, 1);
    for (const x of [10, 19]) {
      rect(ctx, t.outfitL, x, 3, 3, 3);
      rect(ctx, teeth, x, 4, 3, 2);
      rect(ctx, EYE, x + 1, 5, 1, 1);
    }
    round(ctx, t.skin, 11, 8, 10, 7);
    for (const x of [11, 14, 17, 20]) rect(ctx, teeth, x, 8, 1, 2);
    for (const x of [12, 18]) {
      rect(ctx, EYE, x, 10, 2, 2);
      rect(ctx, '#ffffff', x, 10, 1, 1);
    }
    rect(ctx, t.mouth, 15, 13, 2, 1);
  } else if (view === 'back') {
    round(ctx, t.outfit, 8, 2, 16, 13);
    rect(ctx, t.outfitL, 10, 2, 6, 1);
    for (const x of [11, 15, 19]) rect(ctx, t.outfitD, x, 1, 2, 1);
    spikes(15, [4, 7, 10]);
    rect(ctx, t.outfitD, 9, 12, 14, 2);
  } else {
    round(ctx, t.outfit, 9, 2, 13, 13);
    rect(ctx, t.outfit, 22, 5, 2, 5);
    rect(ctx, t.outfitL, 11, 2, 6, 1);
    for (const x of [11, 14, 17]) rect(ctx, t.outfitD, x, 1, 2, 1);
    rect(ctx, t.outfitL, 17, 3, 3, 3);
    rect(ctx, teeth, 17, 4, 3, 2);
    rect(ctx, EYE, 19, 5, 1, 1);
    rect(ctx, t.skin, 15, 8, 7, 7);
    for (const x of [16, 19]) rect(ctx, teeth, x, 8, 1, 2);
    rect(ctx, EYE, 18, 10, 2, 2);
    rect(ctx, '#ffffff', 18, 10, 1, 1);
    rect(ctx, t.mouth, 19, 13, 2, 1);
    rect(ctx, teeth, 22, 8, 1, 2);
  }
};

export const allYearOutfits: Record<string, Painter> = { astronaut, robot, pirate, chef, superhero, dinosaur };
