export type ViewMode = '2d' | '3d';

export interface Look {
  shirt: string;
  hair: string;
  skin: string;
}

export type Layer = 'full' | 'body' | 'bottom' | 'top' | 'hair' | 'accessory';

/** What a player wears: the generated look, one uploaded sheet, or one sheet per layer. */
export type AvatarChoice =
  | { kind: 'built-in'; look: Look }
  | { kind: 'sheet'; id: string }
  | { kind: 'layers'; ids: Partial<Record<Layer, string>> };

export type StatusKind = 'available' | 'busy' | 'dnd';

export interface PlayerStatus {
  kind: StatusKind;
  text?: string;
  /** Epoch ms when the status reverts to available. */
  until?: number;
}

export type LinkKind = 'conversation' | 'ambient';
export type LinkContext = 'open' | `area:${string}` | `desk:${string}` | `pod:${string}`;

export interface Link {
  peer: string;
  kind: LinkKind;
  context: LinkContext;
}

export interface ConversationInfo {
  id: string;
  members: string[];
  context: LinkContext;
  label: string;
  /** Present only for area meetings above the open-area cap: who may send video, most recent speaker first. */
  video?: string[];
}

export interface SpriteInfo {
  id: string;
  name: string;
  layer: Layer;
  author?: string;
  frameSize: 16 | 32;
  url: string;
}
export type SpriteIndex = SpriteInfo[];

export interface OfficeSnapshot {
  areas: { id: string; occupants: number; capacity?: number; restricted: boolean }[];
  pods: { id: string; mode: 'ambient' | 'cubicle' }[];
  desks: {
    id: string;
    owner?: { memberId: string; name: string; online: boolean; status?: PlayerStatus };
    locked: boolean;
  }[];
}

export interface Pose {
  x: number;
  y: number;
  /** Facing angle in radians; 0 = east, PI/2 = south (y grows downward). */
  a: number;
  mode: ViewMode;
  moving: boolean;
}

export interface PlayerState extends Pose {
  id: string;
  name: string;
  look: Look;
  memberId: string;
  avatar: AvatarChoice;
  status: PlayerStatus;
  mic: boolean;
  cam: boolean;
}

export type ChatScope = 'office' | 'nearby' | 'area' | 'desk';

export type NotifyKind =
  | 'knock' | 'knockResult' | 'ring' | 'ringResult' | 'wave' | 'deskInvite' | 'error';

export type AdminOp =
  | { op: 'podMode'; podId: string; mode: 'ambient' | 'cubicle' }
  | { op: 'reloadSprites' }
  | { op: 'areaAllowed'; areaId: string; memberIds: string[] };

export type ClientMsg =
  | { t: 'join'; name: string; look: Look; memberId?: string; avatar?: AvatarChoice; admin?: string }
  | ({ t: 'state' } & Pose)
  | { t: 'chat'; text: string; to?: 'nearby' | 'office' }
  | { t: 'media'; mic: boolean; cam: boolean; speaking?: boolean }
  | { t: 'rtc'; to: string; data: unknown }
  | ({ t: 'status' } & PlayerStatus)
  | { t: 'avatar'; avatar: AvatarChoice }
  | { t: 'desk'; op: 'claim' | 'unclaim' | 'lock' | 'unlock'; deskId?: string }
  | { t: 'deskInvite'; memberId: string }
  | { t: 'walkToDesk'; deskId?: string }
  | { t: 'knock'; areaId: string }
  | { t: 'admit'; areaId: string; memberId: string; allow: boolean }
  | { t: 'ring'; to: string }
  | { t: 'ringReply'; from: string; accept: boolean }
  | { t: 'wave'; to: string; reply?: boolean }
  | ({ t: 'admin' } & AdminOp);

export type ServerMsg =
  | {
      t: 'welcome';
      id: string;
      players: PlayerState[];
      office?: OfficeSnapshot;
      sprites?: SpriteIndex;
      ice?: { urls: string | string[]; username?: string; credential?: string }[];
      isAdmin?: boolean;
    }
  | { t: 'join'; player: PlayerState }
  | { t: 'leave'; id: string }
  | ({ t: 'state'; id: string } & Pose)
  | { t: 'chat'; id: string; name: string; text: string; zone: string | null; scope?: ChatScope }
  | { t: 'links'; links: Link[]; conversation: ConversationInfo | null; full?: boolean }
  | { t: 'rtc'; from: string; data: unknown }
  | {
      t: 'presence';
      id: string;
      status?: PlayerStatus;
      mic?: boolean;
      cam?: boolean;
      speaking?: boolean;
      avatar?: AvatarChoice;
    }
  | ({ t: 'office' } & OfficeSnapshot)
  | { t: 'correct'; x: number; y: number; reason: 'full' | 'restricted' | 'locked'; areaId?: string; deskId?: string }
  | { t: 'teleport'; x: number; y: number; reason: 'ring' | 'desk' }
  | {
      t: 'notify';
      kind: NotifyKind;
      from?: string;
      areaId?: string;
      deskId?: string;
      /** For knocks: the knocker's stable id, which an occupant sends back in `admit`. */
      memberId?: string;
      ok?: boolean;
      /** For waves: this one answers a wave. */
      reply?: boolean;
      text?: string;
    }
  | { t: 'adminState'; areaAllowed: Record<string, string[]> }
  | {
      t: 'sprites';
      sprites: SpriteIndex;
      /** Sent to the admin who reloaded: sheets that were skipped, and sheets that work but need a look. */
      rejected?: { file: string; errors: string[] }[];
      warnings?: { file: string; warning: string }[];
    };
