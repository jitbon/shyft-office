// Pen ink on a screen share: the rules that both the server and the browser share. No DOM and no timers.

/** Ink points are integers 0..INK_MAX across the shared picture, whatever its pixel size. */
export const INK_MAX = 10000;
/** At most this many points (x, y pairs) in one message. */
export const INK_MAX_POINTS = 64;
/** The drawer's browser sends a stroke's new points this often. */
export const INK_BATCH_MS = 33;
/** A finished line stays fully visible this long, then fades over INK_FADE_MS. */
export const INK_HOLD_MS = 3000;
export const INK_FADE_MS = 1000;
/** A stroke that has heard nothing for this long is treated as ended. */
export const INK_STALE_MS = 5000;
/** One connection may send this many ink messages, and this many points, per second. */
export const INK_RATE_MSGS = 40;
export const INK_RATE_POINTS = 2000;
/** Eight colors that read on light and dark screens, by ink slot. */
export const INK_PALETTE = ['#ff3b30', '#0a84ff', '#30d158', '#ff9f0a', '#bf5af2', '#40c8e0', '#ffd60a', '#ff375f'] as const;

export interface InkBatch {
  shareId: string;
  strokeId: number;
  seq: number;
  pts: number[];
  end?: true;
  keep?: true;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const whole = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 2 ** 31;
const shareIdOf = (v: unknown): v is string => typeof v === 'string' && v.length <= 80;

/** Checks an `ink` message from a client; null means ignore it. Extra fields are dropped. */
export function validateInk(raw: unknown): InkBatch | null {
  if (!isObject(raw)) return null;
  const { shareId, strokeId, seq, pts } = raw;
  if (!shareIdOf(shareId) || !whole(strokeId) || !whole(seq)) return null;
  if (!Array.isArray(pts) || pts.length < 2 || pts.length > 2 * 64 || pts.length % 2 !== 0) return null;
  const clean: number[] = [];
  for (const v of pts) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    clean.push(Math.min(INK_MAX, Math.max(0, Math.round(v))));
  }
  return {
    shareId, strokeId, seq, pts: clean,
    ...(raw.end === true ? { end: true as const } : {}),
    ...(raw.keep === true ? { keep: true as const } : {}),
  };
}

export function validateInkClear(raw: unknown): { shareId: string; scope: 'mine' | 'all' } | null {
  if (!isObject(raw) || !shareIdOf(raw.shareId)) return null;
  return raw.scope === 'mine' || raw.scope === 'all' ? { shareId: raw.shareId, scope: raw.scope } : null;
}

export function validateInkAllow(raw: unknown): { shareId: string; on: boolean } | null {
  if (!isObject(raw) || !shareIdOf(raw.shareId) || typeof raw.on !== 'boolean') return null;
  return { shareId: raw.shareId, on: raw.on };
}

/**
 * Drops points closer than `minDist` to the last kept one (0.15 % of the picture by default). The first
 * point stays, and so does the last, so a stroke ends where the pen lifted.
 */
export function thin(pts: readonly number[], minDist = 15): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < pts.length; i += 2) {
    const last = i + 3 >= pts.length;
    const n = out.length;
    if (n === 0 || last || Math.hypot(pts[i] - out[n - 2], pts[i + 1] - out[n - 1]) >= minDist) out.push(pts[i], pts[i + 1]);
  }
  return out;
}

/**
 * Gives each member of a conversation an ink slot 0–7. Members keep the slot they had; others take the lowest free one in
 * join order, and when all eight are taken, the least used. Only `members` get a key.
 */
export function assignInkSlots(members: readonly string[], prev: ReadonlyMap<string, number>): Map<string, number> {
  const result = new Map<string, number>();
  const taken = new Set<number>();
  for (const id of members) {
    const s = prev.get(id);
    if (s !== undefined && s >= 0 && s < INK_PALETTE.length && !taken.has(s)) {
      result.set(id, s);
      taken.add(s);
    }
  }
  const load = new Array<number>(INK_PALETTE.length).fill(0);
  for (const s of result.values()) load[s]++;
  for (const id of members) {
    if (result.has(id)) continue;
    let slot = load.findIndex((n) => n === 0);
    if (slot < 0) slot = load.indexOf(Math.min(...load));
    result.set(id, slot);
    load[slot]++;
  }
  // Keep the members' own order, which is the order they joined.
  return new Map(members.map((id) => [id, result.get(id)!]));
}

/** How opaque a stroke is: 1 while drawing or kept, 1 for INK_HOLD_MS after it ended, then fading to 0. */
export function strokeAlpha(now: number, endedAt: number | null, keep: boolean): number {
  if (endedAt === null || keep) return 1;
  const t = now - endedAt;
  if (t < INK_HOLD_MS) return 1;
  if (t >= INK_HOLD_MS + INK_FADE_MS) return 0;
  return 1 - (t - INK_HOLD_MS) / INK_FADE_MS;
}

/** True once an unkept stroke has faded out completely. */
export function strokeDone(now: number, endedAt: number | null, keep: boolean): boolean {
  return !keep && endedAt !== null && now >= endedAt + INK_HOLD_MS + INK_FADE_MS;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where a video of size vidW×vidH sits inside an elW×elH element under `object-fit: contain`. */
export function contentBox(elW: number, elH: number, vidW: number, vidH: number): Box {
  if (!(vidW > 0) || !(vidH > 0) || !(elW > 0) || !(elH > 0)) return { x: 0, y: 0, w: Math.max(0, elW), h: Math.max(0, elH) };
  const scale = Math.min(elW / vidW, elH / vidH);
  const w = vidW * scale;
  const h = vidH * scale;
  // Rounded to a millionth of a pixel so equal proportions give an exact fit, not 1e-14 of drift.
  const r = (n: number) => Math.round(n * 1e6) / 1e6 + 0;
  return { x: r((elW - w) / 2), y: r((elH - h) / 2), w: r(w), h: r(h) };
}

/** Element coordinates to a picture point 0–10000, or null outside the picture. */
export function toPicture(box: Box, x: number, y: number): [number, number] | null {
  if (box.w <= 0 || box.h <= 0) return null;
  const px = ((x - box.x) / box.w) * INK_MAX;
  const py = ((y - box.y) / box.h) * INK_MAX;
  if (px < 0 || px > INK_MAX || py < 0 || py > INK_MAX) return null;
  return [Math.round(px), Math.round(py)];
}

/** A picture point back to element coordinates. */
export function fromPicture(box: Box, px: number, py: number): [number, number] {
  return [box.x + (px / INK_MAX) * box.w, box.y + (py / INK_MAX) * box.h];
}
