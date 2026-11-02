import type { Painter } from './draw';
import { allYearOutfits } from './outfits-all-year';
import { summerAutumnOutfits } from './outfits-summer-autumn';
import { winterSpringOutfits } from './outfits-winter-spring';

/** Whole-figure outfits. They paint everything, so the parts under them are not drawn. */
export const outfits: Record<string, Painter> = { ...winterSpringOutfits, ...summerAutumnOutfits, ...allYearOutfits };
