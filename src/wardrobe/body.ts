// The fixed body under every look: the head's skin, the neck and, in the side view, the far arm.
import { rect, round, type Painter } from './draw';

/** The far arm in the side view; drawn first so the hips and torso cover its top and bottom. */
export const farArm: Painter = (ctx, t, view, step) => {
  if (view !== 'side') return;
  const backArm = 14 + 3 * step;
  rect(ctx, t.sleeveD, backArm, 17, 4, 6);
  rect(ctx, t.skinD, backArm, 23, 4, 2);
};

/** The head's skin and neck, under the face and hair. */
export const head: Painter = (ctx, t, view) => {
  rect(ctx, t.skinD, view === 'side' ? 13 : 14, 15, 4, 1); // neck
  if (view === 'back') {
    round(ctx, t.skin, 9, 3, 14, 11);
    rect(ctx, t.skinD, 14, 14, 4, 1);
  } else if (view === 'front') {
    round(ctx, t.skin, 9, 3, 14, 12);
    rect(ctx, t.skinD, 21, 11, 1, 3);
    rect(ctx, t.skinD, 11, 14, 10, 1);
  } else {
    round(ctx, t.skin, 10, 3, 12, 12);
    rect(ctx, t.skin, 22, 11, 1, 2);
    rect(ctx, t.skinD, 22, 12, 1, 1);
    rect(ctx, t.skinD, 15, 9, 2, 3); // ear
  }
};
