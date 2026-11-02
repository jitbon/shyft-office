// Draws a built-in character: a fixed body and one painter per chosen option, in a fixed order, or a whole outfit.
import type { Look } from '../../shared/protocol';
import { CLOTH_COLORS, DEFAULTS, optionOf } from '../../shared/wardrobe';
import { accessories, HAT_LINES } from './accessories';
import { farArm, head } from './body';
import { SLEEVELESS, bottoms, shoes, tops } from './clothes';
import { tonesOf, type Ctx, type Painter, type View } from './draw';
import { faces } from './faces';
import { hairStyles } from './hair';
import { outfits } from './outfits';

const pick = (registry: Record<string, Painter>, id: string | undefined, fallback: string): Painter =>
  (id && registry[id]) || registry[fallback];

/** `view` is the facing; the left-facing frame is the right-facing one mirrored by the caller. */
export function paintCharacter(ctx: Ctx, look: Look, view: View, step: number) {
  const outfit = look.outfit ? optionOf('outfit', look.outfit) : undefined;
  const outfitPaint = outfit && outfits[outfit.id];
  const accColor = look.accessoryColor ?? CLOTH_COLORS[0];
  const t = tonesOf(look, look.bottomColor ?? DEFAULTS.bottomColor, accColor, look.outfitColor ?? outfit?.colors?.[0] ?? '#ffffff',
    SLEEVELESS.has(look.top ?? ''));
  if (outfitPaint) {
    outfitPaint(ctx, t, view, step);
    return;
  }
  const hatLine = look.accessory ? HAT_LINES[look.accessory] ?? 0 : 0;

  farArm(ctx, t, view, step);
  pick(shoes, look.shoes, DEFAULTS.shoes)(ctx, t, view, step);
  pick(bottoms, look.bottom, DEFAULTS.bottom)(ctx, t, view, step);
  pick(tops, look.top, DEFAULTS.top)(ctx, t, view, step);
  head(ctx, t, view, step);
  if (view !== 'back') pick(faces, look.face, DEFAULTS.face)(ctx, t, view, step);
  // Hair lies below a hat's line (spec: a cap over a bun trims the bun).
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, hatLine, 64, 64);
  ctx.clip();
  pick(hairStyles, look.hairStyle, DEFAULTS.hairStyle)(ctx, t, view, step);
  ctx.restore();
  if (look.accessory) accessories[look.accessory]?.(ctx, t, view, step);
}
