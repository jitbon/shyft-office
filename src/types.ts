import type { AvatarChoice, Look, PlayerStatus, ViewMode } from '../shared/protocol';
import { STATUS_PRESETS, statusId } from '../shared/status';
import type { Avatar } from './art';

export interface Player {
  id: string;
  /** Stable per-browser id, used for desk claims and allow-lists. */
  memberId: string;
  name: string;
  look: Look;
  avatar: Avatar;
  /** What this player chose to wear; `avatar` is the loaded result and may lag behind it. */
  avatarChoice: AvatarChoice;
  x: number;
  y: number;
  a: number;
  /** Network target; remote players ease toward it. */
  tx: number;
  ty: number;
  ta: number;
  mode: ViewMode;
  moving: boolean;
  mic: boolean;
  cam: boolean;
  status: PlayerStatus;
  animT: number;
  bubble?: { text: string; until: number };
  /** When this person last jumped (ms, `Date.now()` clock); they are in the air for a moment after it. */
  jumpAt?: number;
}

/** Someone who is not connected has no status, so their dot is grey. */
export const OFFLINE_COLOR = '#6b7088';
export const statusColor = (s: Pick<PlayerStatus, 'kind' | 'preset'>) => STATUS_PRESETS[statusId(s)].color;

export const walkFrame = (p: Player) => (p.moving ? Math.floor(p.animT * 8) % 4 : 0);
