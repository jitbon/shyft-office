import type { LinkContext } from './protocol';

/** At most this many screens are shared at once among the people of one conversation. */
export const MAX_SHARES = 3;
/** The sharer's upload budget for one screen, split among its viewers. */
export const SCREEN_BUDGET_BPS = 6_000_000;
export const SCREEN_MIN_BPS = 400_000;
export const SCREEN_MAX_BPS = 2_500_000;

/** Where a sharer stands now, as the rules see it. */
export interface SharePlace {
  context: LinkContext;
  inConversation: boolean;
  atDesk: boolean;
  dnd: boolean;
}

/**
 * Whether a share that began in `origin` may keep running. It ends on Do Not Disturb, when the
 * sharer's place changed, and when they are alone on the open floor and not at a desk.
 */
export function shareKeeps(origin: LinkContext, now: SharePlace): boolean {
  if (now.dnd) return false;
  if (now.context !== origin) return false;
  if (now.context === 'open' && !now.inConversation && !now.atDesk) return false;
  return true;
}

/** The video bitrate for a screen sent to this many viewers, in whole bits per second. */
export function screenBitrate(receivers: number): number {
  const share = SCREEN_BUDGET_BPS / Math.max(1, receivers);
  return Math.floor(Math.min(SCREEN_MAX_BPS, Math.max(SCREEN_MIN_BPS, share)));
}

export type ShareMsg = { on: false } | { on: true; audio: boolean; w: number; h: number };

const side = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(8192, Math.max(1, Math.round(v))) : null;

/** Checks a `share` message from a client; null means ignore it. */
export function validateShareMsg(raw: unknown): ShareMsg | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const m = raw as Record<string, unknown>;
  if (typeof m.on !== 'boolean') return null;
  if (!m.on) return { on: false };
  const w = side(m.w);
  const h = side(m.h);
  if (w === null || h === null) return null;
  return { on: true, audio: m.audio === true, w, h };
}
