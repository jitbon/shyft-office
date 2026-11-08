// Draws one face of a box into a framebuffer with a depth value per pixel: clipped at the near plane, projected, and filled
// line by line with a perspective-correct texture. The office view and the studio's preview both use it, so a preview pixel
// is the pixel the office will draw.
import type { Texture } from './art';
import { clipNear, toCamera, type Cam, type Face } from './mesh3d';

/** The picture being drawn: packed pixels (ABGR), the distance of what was drawn at each pixel, and the size. */
export interface Target {
  pix: Uint32Array;
  depth: Float32Array;
  w: number;
  h: number;
}

/** Nearest depth drawn, in tiles. */
export const NEAR = 0.15;

/** Darkens a packed color by a factor. */
export function shade(c: number, f: number) {
  const r = (c & 255) * f, g = ((c >>> 8) & 255) * f, b = ((c >>> 16) & 255) * f;
  return 0xff000000 | (b << 16) | (g << 8) | r;
}

/** The tint of the light and the color distant things fade to (each `0..255` for the fade). Neutral light is today's plain darkening. */
export interface Light {
  r: number;
  g: number;
  b: number;
  fr: number;
  fg: number;
  fb: number;
}
export const NEUTRAL_LIGHT: Light = { r: 1, g: 1, b: 1, fr: 0, fg: 0, fb: 0 };
export const isNeutral = (l: Light) =>
  Math.abs(l.r - 1) < 1e-6 && Math.abs(l.g - 1) < 1e-6 && Math.abs(l.b - 1) < 1e-6 && l.fr < 1e-6 && l.fg < 1e-6 && l.fb < 1e-6;

/**
 * Darkens by `f` like `shade`, tints by the light, and fades toward the fog color by the light that is lost (`1 − f`).
 * With neutral light and black fog it gives exactly the pixels `shade` does.
 */
export function shadeRGB(c: number, f: number, l: Light) {
  const lose = 1 - f;
  const r = Math.min(255, (c & 255) * f * l.r + l.fr * lose);
  const g = Math.min(255, ((c >>> 8) & 255) * f * l.g + l.fg * lose);
  const b = Math.min(255, ((c >>> 16) & 255) * f * l.b + l.fb * lose);
  return 0xff000000 | (b << 16) | (g << 8) | r;
}

/** How much light is left at distance `d` tiles. */
export const fog = (d: number) => Math.max(0.35, 1 / (1 + d * d * 0.01));

/**
 * `K` is the number of pixels one world unit covers at distance 1, `horizon` the row of the horizon, and `eye` the height of the eye
 * above the floor (it rises during a jump); all come from the camera setup of the view. Faces nearer than what is already drawn replace it; farther ones are left.
 */
export function fillFace(t: Target, face: Face, cam: Cam, K: number, horizon: number, tex: Texture, eye = 0.5, light: Light = NEUTRAL_LIGHT) {
  const plain = isNeutral(light);
  const { w, h, pix, depth } = t;
  const poly = clipNear(face.pts.map((p, i) => toCamera(cam, p, face.uv[i][0], face.uv[i][1])), NEAR);
  const n = poly.length;
  if (n < 3) return;
  const sx = new Float64Array(n), sy = new Float64Array(n), iw = new Float64Array(n), uw = new Float64Array(n), vw = new Float64Array(n);
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const p = poly[i];
    const inv = 1 / p.ty;
    iw[i] = inv;
    sx[i] = (w / 2) * (1 + p.tx * inv);
    sy[i] = horizon + K * inv * (eye - p.z);
    uw[i] = p.u * inv;
    vw[i] = p.v * inv;
    if (sy[i] < minY) minY = sy[i];
    if (sy[i] > maxY) maxY = sy[i];
  }
  const y0 = Math.max(0, Math.ceil(minY - 0.5)), y1 = Math.min(h - 1, Math.ceil(maxY - 0.5) - 1);
  for (let y = y0; y <= y1; y++) {
    const yc = y + 0.5;
    let xl = Infinity, xr = -Infinity;
    let liw = 0, luw = 0, lvw = 0, riw = 0, ruw = 0, rvw = 0;
    for (let i = 0; i < n; i++) {
      const j = i + 1 === n ? 0 : i + 1;
      const ay = sy[i], by = sy[j];
      if (!((ay <= yc && by > yc) || (by <= yc && ay > yc))) continue;
      const tt = (yc - ay) / (by - ay);
      const x = sx[i] + (sx[j] - sx[i]) * tt;
      const a = iw[i] + (iw[j] - iw[i]) * tt, b = uw[i] + (uw[j] - uw[i]) * tt, c = vw[i] + (vw[j] - vw[i]) * tt;
      if (x < xl) { xl = x; liw = a; luw = b; lvw = c; }
      if (x > xr) { xr = x; riw = a; ruw = b; rvw = c; }
    }
    if (!(xr - xl > 1e-6)) continue;
    const x0 = Math.max(0, Math.ceil(xl - 0.5)), x1 = Math.min(w - 1, Math.ceil(xr - 0.5) - 1);
    const span = 1 / (xr - xl);
    for (let x = x0; x <= x1; x++) {
      const tt = (x + 0.5 - xl) * span;
      const inv = liw + (riw - liw) * tt;
      const d = 1 / inv;
      const idx = y * w + x;
      if (d >= depth[idx]) continue;
      depth[idx] = d;
      const u = (luw + (ruw - luw) * tt) * d, v = (lvw + (rvw - lvw) * tt) * d;
      const tx = ((u - Math.floor(u)) * tex.w) | 0, ty = ((v - Math.floor(v)) * tex.h) | 0;
      const lit = fog(d) * face.shade;
      pix[idx] = plain ? shade(tex.data[ty * tex.w + tx], lit) : shadeRGB(tex.data[ty * tex.w + tx], lit, light);
    }
  }
}
