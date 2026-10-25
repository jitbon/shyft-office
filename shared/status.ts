import type { PlayerStatus, StatusKind } from './protocol';

export const MAX_STATUS_TEXT = 60;
/** The furthest ahead a status may expire; anything later is shortened to this. */
export const MAX_STATUS_MS = 24 * 60 * 60 * 1000;
export const STATUS_KINDS: readonly StatusKind[] = ['available', 'busy', 'dnd'];

/**
 * Turns a client's status request into a valid status, or null when it cannot be honoured: an unknown kind,
 * or an expiry that is not in the future. The text is trimmed and cut to 60 characters.
 */
export function cleanStatus(input: unknown, now: number): PlayerStatus | null {
  if (typeof input !== 'object' || input === null) return null;
  const { kind, text, until } = input as { kind?: unknown; text?: unknown; until?: unknown };
  if (!STATUS_KINDS.includes(kind as StatusKind)) return null;
  const status: PlayerStatus = { kind: kind as StatusKind };
  const cleanText = typeof text === 'string' ? text.trim().slice(0, MAX_STATUS_TEXT) : '';
  if (cleanText) status.text = cleanText;
  if (until !== undefined && until !== null) {
    if (typeof until !== 'number' || !Number.isFinite(until) || until <= now) return null;
    status.until = Math.min(until, now + MAX_STATUS_MS);
  }
  return status;
}

/** The status to show at `now`: one whose time has run out reverts to available. */
export function expireStatus(status: PlayerStatus, now: number): PlayerStatus {
  return status.until !== undefined && status.until <= now ? { kind: 'available' } : status;
}
