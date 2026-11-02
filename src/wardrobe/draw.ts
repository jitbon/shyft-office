// What every wardrobe painter shares: the pixel primitives, the facing and the colors derived from a look.
import type { Look } from '../../shared/protocol';
import { light, mix, shade } from '../palette';

export type Ctx = CanvasRenderingContext2D;
/** `side` faces right; the left-facing frames are its mirror. */
export type View = 'front' | 'back' | 'side';

export const rect = (ctx: Ctx, color: string, x: number, y: number, w: number, h: number) => {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
};
/** A rectangle with its four corner pixels cut off. */
export const round = (ctx: Ctx, color: string, x: number, y: number, w: number, h: number) => {
  rect(ctx, color, x + 1, y, w - 2, h);
  rect(ctx, color, x, y + 1, w, h - 2);
};

export const SHOE = '#2f2a38';
export const EYE = '#2a2233';

export interface Tones {
  skin: string; skinD: string; hair: string; hairL: string; hairD: string;
  shirt: string; shirtL: string; shirtD: string; blush: string; mouth: string;
  /** The far arm's sleeve in the side view: the top's color, or skin for a sleeveless top. */
  sleeveD: string;
  bottom: string; bottomL: string; bottomD: string; bottomDD: string;
  /** The accessory's color, and the outfit's. */
  acc: string; accL: string; accD: string;
  outfit: string; outfitL: string; outfitD: string;
}

/**
 * Paints one piece. `step` is -1, 0 or +1 through the walk cycle. Hair is clipped below `hatLine` by the caller, so
 * a painter never has to think about a hat.
 */
export type Painter = (ctx: Ctx, t: Tones, view: View, step: number) => void;

export function tonesOf(look: Look, bottomColor: string, accColor: string, outfitColor: string, sleeveless: boolean): Tones {
  return {
    skin: look.skin, skinD: shade(look.skin, 0.16),
    hair: look.hair, hairL: light(look.hair, 0.3), hairD: shade(look.hair, 0.3),
    shirt: look.shirt, shirtL: light(look.shirt, 0.2), shirtD: shade(look.shirt, 0.25),
    blush: mix(look.skin, '#e8708a', 0.45), mouth: mix(look.skin, '#8f3b3b', 0.6),
    sleeveD: sleeveless ? shade(look.skin, 0.16) : shade(look.shirt, 0.25),
    bottom: bottomColor, bottomL: light(bottomColor, 0.2), bottomD: shade(bottomColor, 0.25), bottomDD: shade(bottomColor, 0.3),
    acc: accColor, accL: light(accColor, 0.3), accD: shade(accColor, 0.3),
    outfit: outfitColor, outfitL: light(outfitColor, 0.3), outfitD: shade(outfitColor, 0.3),
  };
}
