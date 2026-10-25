// Zoom maths for the 2D view. Pixel art stays crisp only when each art pixel covers a whole number of
// device pixels, so the zoom is that whole number (`k`) rather than a free-floating scale.

/** Art pixels per map tile. */
export const TILE = 32;

/** The device pixel ratio as a whole number of at least 1; anything unusable counts as 1. */
function wholeDpr(dpr: number): number {
  return Number.isFinite(dpr) && dpr >= 1 ? Math.round(dpr) : 1;
}

/** Smallest and largest zoom: tiles from 32 to 96 CSS pixels, whatever the screen density. */
export function zoomRange(dpr: number): { min: number; max: number } {
  const r = wholeDpr(dpr);
  return { min: r, max: 3 * r };
}

export function clampZoom(k: number, dpr: number): number {
  const { min, max } = zoomRange(dpr);
  if (!Number.isFinite(k)) return defaultZoom(dpr);
  return Math.min(max, Math.max(min, Math.round(k)));
}

/** Tiles of 64 CSS px on a normal screen and 48 on a 2x screen. */
export function defaultZoom(dpr: number): number {
  const { min, max } = zoomRange(dpr);
  const k = Number.isFinite(dpr) && dpr >= 1 ? Math.round(1.5 * dpr) : 2;
  return Math.min(max, Math.max(min, k));
}

export function stepZoom(k: number, dir: 1 | -1, dpr: number): number {
  return clampZoom(k + dir, dpr);
}

/** How big a tile looks on screen, in CSS pixels. */
export function tileCssPx(k: number, dpr: number): number {
  return (TILE * k) / dpr;
}

/** When the window moves to a screen with another density, keep the tile size closest to what it was. */
export function rescale(k: number, oldDpr: number, newDpr: number): number {
  const target = tileCssPx(k, oldDpr);
  const { min, max } = zoomRange(newDpr);
  const real = Number.isFinite(newDpr) && newDpr >= 1 ? newDpr : 1;
  let best = min;
  let bestGap = Infinity;
  for (let c = min; c <= max; c++) {
    const gap = Math.abs(tileCssPx(c, real) - target);
    if (gap <= bestGap) { // ties go to the larger art
      best = c;
      bestGap = gap;
    }
  }
  return best;
}
