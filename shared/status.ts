import type { PlayerStatus, StatusId, StatusKind, StatusPreset } from './protocol';

export const MAX_STATUS_TEXT = 60;
/** The furthest ahead a status may expire; anything later is shortened to this. */
export const MAX_STATUS_MS = 24 * 60 * 60 * 1000;
export const STATUS_KINDS: readonly StatusKind[] = ['available', 'busy', 'dnd'];
export const STATUS_PRESET_IDS: readonly StatusPreset[] = ['meeting', 'focus', 'lunch', 'coffee', 'away', 'out'];
/** Grid order in the status menu. */
export const STATUS_IDS: readonly StatusId[] = ['available', 'busy', 'dnd', 'meeting', 'focus', 'lunch', 'coffee', 'away', 'out'];
const MAX_EMOJI_UNITS = 16;
/** How opaque an away person's avatar is, in both views (FR-008). */
export const DIM_ALPHA = 0.45;

export interface StatusPresetInfo {
  label: string;
  /** For notices: "Sam <phrase>". */
  phrase: string;
  icon: string;
  color: string;
  /** Minutes, 'morning' (08:00 the next day), or null for no limit. */
  defaultLimit: number | 'morning' | null;
  blocksConversations: boolean;
  devicesOff: boolean;
  dims: boolean;
}

/** The one table of statuses and what they do. Server rules and every view read it. */
export const STATUS_PRESETS: Record<StatusId, StatusPresetInfo> = {
  available: { label: 'Available', phrase: 'is available', icon: '', color: '#5cb85c', defaultLimit: null, blocksConversations: false, devicesOff: false, dims: false },
  busy: { label: 'Busy', phrase: 'is busy', icon: '⏳', color: '#f1c453', defaultLimit: null, blocksConversations: false, devicesOff: false, dims: false },
  dnd: { label: 'Do Not Disturb', phrase: 'has Do Not Disturb on', icon: '⛔', color: '#e04f5f', defaultLimit: null, blocksConversations: true, devicesOff: true, dims: false },
  meeting: { label: 'In a meeting', phrase: 'is in a meeting', icon: '📅', color: '#6fa8ff', defaultLimit: 60, blocksConversations: false, devicesOff: false, dims: false },
  focus: { label: 'Focusing', phrase: 'is focusing', icon: '🎧', color: '#b693f5', defaultLimit: 60, blocksConversations: true, devicesOff: false, dims: false },
  lunch: { label: 'Lunch', phrase: 'is at lunch', icon: '🍽', color: '#f29b5c', defaultLimit: 60, blocksConversations: true, devicesOff: true, dims: true },
  coffee: { label: 'Coffee break', phrase: 'is on a coffee break', icon: '☕', color: '#c9a07a', defaultLimit: 15, blocksConversations: true, devicesOff: true, dims: true },
  away: { label: 'Away', phrase: 'is away', icon: '💤', color: '#9aa1bd', defaultLimit: null, blocksConversations: true, devicesOff: true, dims: true },
  out: { label: 'Out for the day', phrase: 'is out for the day', icon: '🌙', color: '#8f9bd6', defaultLimit: 'morning', blocksConversations: true, devicesOff: true, dims: true },
};

/** The id of a status: its preset when it has one, otherwise its kind. Unknown ids fall back to the kind. */
export function statusId(s: Pick<PlayerStatus, 'kind' | 'preset'>): StatusId {
  return s.preset && s.preset in STATUS_PRESETS ? s.preset : s.kind;
}
const info = (s: Pick<PlayerStatus, 'kind' | 'preset'>) => STATUS_PRESETS[statusId(s)] ?? STATUS_PRESETS.available;
export const blocksConversations = (s: Pick<PlayerStatus, 'kind' | 'preset'>) => info(s).blocksConversations;
export const devicesOff = (s: Pick<PlayerStatus, 'kind' | 'preset'>) => info(s).devicesOff;
export const dims = (s: Pick<PlayerStatus, 'kind' | 'preset'>) => info(s).dims;
export const isAway = dims;
export const statusLabel = (s: Pick<PlayerStatus, 'kind' | 'preset'>) => info(s).label;
/** The icon to show: the custom emoji when set, otherwise the status's own; empty for Available. */
export const statusIcon = (s: Pick<PlayerStatus, 'kind' | 'preset' | 'emoji'>) => s.emoji || info(s).icon;

/** The first grapheme of `value` when it is a single emoji, else undefined. */
function cleanEmoji(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  const first = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)][0]?.segment;
  if (!first || first.length > MAX_EMOJI_UNITS || !/\p{Extended_Pictographic}/u.test(first)) return undefined;
  return first;
}

/**
 * Turns a client's status request into a valid status, or null when it cannot be honoured: an unknown kind,
 * or an expiry that is not in the future. The text is trimmed and cut to 60 characters.
 */
export function cleanStatus(input: unknown, now: number): PlayerStatus | null {
  if (typeof input !== 'object' || input === null) return null;
  const { kind, preset, text, emoji, until } = input as { kind?: unknown; preset?: unknown; text?: unknown; emoji?: unknown; until?: unknown };
  if (!STATUS_KINDS.includes(kind as StatusKind)) return null;
  const status: PlayerStatus = { kind: kind as StatusKind };
  if (preset !== undefined && preset !== null) {
    if (!STATUS_PRESET_IDS.includes(preset as StatusPreset)) return null;
    // Older clients read only `kind`, so every preset is stored as Busy.
    status.kind = 'busy';
    status.preset = preset as StatusPreset;
  }
  const cleanText = typeof text === 'string' ? text.trim().slice(0, MAX_STATUS_TEXT) : '';
  if (cleanText) status.text = cleanText;
  const cleanIcon = cleanEmoji(emoji);
  if (cleanIcon) status.emoji = cleanIcon;
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

/** 08:00 local time: today when `now` is before it, otherwise tomorrow. */
export function nextMorning(now: number): number {
  const d = new Date(now);
  d.setHours(8, 0, 0, 0);
  if (d.getTime() <= now) d.setDate(d.getDate() + 1);
  return d.getTime();
}

/** The time limit a status gets when picked in one click, or undefined for none. */
export function limitUntil(id: StatusId, now: number): number | undefined {
  const limit = STATUS_PRESETS[id]?.defaultLimit;
  if (limit === 'morning') return nextMorning(now);
  return typeof limit === 'number' ? now + limit * 60_000 : undefined;
}

/** "42 min left", "1 h 5 min left", "back tomorrow" (Out for the day), or "" with no limit. */
export function timeLeftText(status: Pick<PlayerStatus, 'kind' | 'preset' | 'until'>, now: number): string {
  if (status.until === undefined) return '';
  if (status.preset === 'out') return 'back tomorrow';
  const mins = Math.max(1, Math.ceil((status.until - now) / 60_000));
  return mins >= 60 ? `${Math.floor(mins / 60)} h${mins % 60 ? ` ${mins % 60} min` : ''} left` : `${mins} min left`;
}

export interface RecentStatus {
  kind: StatusKind;
  preset?: StatusPreset;
  text?: string;
  emoji?: string;
  minutes?: number;
}

/** The recent list after using `status`: newest first, at most 3, no duplicates, never Available. */
export function pushRecent<T extends RecentStatus>(list: readonly T[], status: T): T[] {
  if (statusId(status) === 'available') return [...list];
  const same = (a: T) => statusId(a) === statusId(status) && (a.text ?? '') === (status.text ?? '') && (a.emoji ?? '') === (status.emoji ?? '');
  return [status, ...list.filter((r) => !same(r))].slice(0, 3);
}

/**
 * The status everyone sees. A chosen status that ran out is Available; an Available member in a meeting
 * (with the setting on) shows as In a meeting; anything else they chose wins.
 */
export function shownStatus(chosen: PlayerStatus, inMeeting: boolean, autoMeeting: boolean, now: number): PlayerStatus {
  const base = expireStatus(chosen, now);
  if (base.kind === 'available' && inMeeting && autoMeeting) return { kind: 'busy', preset: 'meeting', auto: true };
  return base;
}
