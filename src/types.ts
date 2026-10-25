import type { AvatarChoice, Look, PlayerStatus, ViewMode } from '../shared/protocol';
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
}

export const STATUS_COLORS: Record<PlayerStatus['kind'], string> = {
  available: '#5cb85c',
  busy: '#f1c453',
  dnd: '#e04f5f',
};
/** Someone who is not connected has no status, so their dot is grey. */
export const OFFLINE_COLOR = '#6b7088';
export const statusColor = (s: Pick<PlayerStatus, 'kind'>) => STATUS_COLORS[s.kind];

export const walkFrame = (p: Player) => (p.moving ? Math.floor(p.animT * 8) % 4 : 0);
