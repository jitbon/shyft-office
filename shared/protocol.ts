import type { CustomObject } from './objects';

/** The light index of a studio item: enough to list it; the full design comes from `GET /api/items`. */
export interface ItemInfo {
  id: string;
  name: string;
  group: string;
  season?: string;
  kind: string;
  by: string;
  version: number;
}

export type ViewMode = '2d' | '3d';

export type Team = 'blue' | 'orange';
export type Phase = 'lobby' | 'buy' | 'play' | 'roundEnd' | 'matchEnd';

export interface Look {
  shirt: string;
  hair: string;
  skin: string;
  /** Wardrobe ids (shared/wardrobe.ts). A missing part is the default one, so a 3-field look is today's character. */
  hairStyle?: string;
  face?: string;
  top?: string;
  bottom?: string;
  bottomColor?: string;
  shoes?: string;
  /** Absent means none. */
  accessory?: string;
  accessoryColor?: string;
  /** When set it replaces the parts, which are kept underneath. */
  outfit?: string;
  outfitColor?: string;
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
  /** Members' running screen shares, oldest first. Omitted when there are none. */
  shares?: ShareInfo[];
  /** Player id → ink slot 0–7. Only when the conversation has a share. */
  ink?: Record<string, number>;
}

/** A running screen share, as the members of its conversation see it. */
export interface ShareInfo {
  shareId: string;
  sharer: string;
  startedAt: number;
  /** The share carries sound. */
  audio: boolean;
  /** The picture's size in pixels. */
  w: number;
  h: number;
  /** Others may draw on this share. Set by the sharer, on by default. */
  drawing: boolean;
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
  | 'knock' | 'knockResult' | 'ring' | 'ringResult' | 'wave' | 'deskInvite' | 'deskReset' | 'deskRemoved' | 'error';

export type AdminOp =
  | { op: 'podMode'; podId: string; mode: 'ambient' | 'cubicle' }
  | { op: 'reloadSprites' }
  | { op: 'areaAllowed'; areaId: string; memberIds: string[] }
  | { op: 'building'; enabled: boolean }
  | { op: 'helper'; enabled: boolean }
  | { op: 'arena'; enabled: boolean };

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
  /** A jump: only for show (it changes no position and no rule). */
  | { t: 'jump' }
  /** Office Arena: start, join or leave a match; the host begins, stops or resets it. */
  | { t: 'arena'; op: 'start' | 'join' | 'leave' | 'begin' | 'stop' | 'reset' }
  /** A shot along the aim angle `a`. The server decides what it hits. */
  | { t: 'fire'; a: number; seq: number }
  /** Buy a blaster or the vest during the buy phase. */
  | { t: 'buy'; item: string }
  /** Start sharing the screen, or (while sharing) update its size or sound; `on: false` stops. */
  | { t: 'share'; on: true; audio: boolean; w: number; h: number }
  | { t: 'share'; on: false }
  /** Pen points for a share: integers 0–10000 across its picture, as `[x, y, …]`. */
  | { t: 'ink'; shareId: string; strokeId: number; seq: number; pts: number[]; end?: true; keep?: true }
  | { t: 'inkClear'; shareId: string; scope: 'mine' | 'all' }
  | { t: 'inkAllow'; shareId: string; on: boolean }
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
      /** Random token this connection sends as `X-Shyft-Session` when it calls the HTTP API. */
      session?: string;
      /** The published layout revision to fetch from `GET /api/layout`. */
      layoutRev?: number;
      /** Whether this connection may edit the office layout. */
      canBuild?: boolean;
      /** The custom furniture and objects builders have added. */
      objects?: CustomObject[];
      /** The items members made in the studio (the ready-made ones ship with the app). */
      items?: ItemInfo[];
      /** The item helper's status, for builders. */
      helper?: 'off' | 'unavailable' | 'on';
      /** With `helper: 'unavailable'`: the service is set up but just failed, so it is worth trying again soon. */
      helperCooling?: boolean;
    }
  | { t: 'join'; player: PlayerState }
  | { t: 'leave'; id: string }
  | ({ t: 'state'; id: string } & Pose)
  /** Someone jumped; draw them rising and falling for a moment. */
  | { t: 'jump'; id: string }
  | { t: 'chat'; id: string; name: string; text: string; zone: string | null; scope?: ChatScope }
  | { t: 'links'; links: Link[]; conversation: ConversationInfo | null; full?: boolean }
  | { t: 'rtc'; from: string; data: unknown }
  /** Sent only to the sharer: the share started, or why it is not running. */
  | { t: 'shareState'; on: boolean; shareId?: string; reason?: 'full' | 'dnd' | 'left' | 'stopped' | 'arena' }
  /** Someone's pen points on a share you can see. Relayed at once; the server keeps nothing. */
  | { t: 'ink'; from: string; shareId: string; strokeId: number; seq: number; pts: number[]; end?: true; keep?: true }
  | { t: 'inkClear'; from: string; shareId: string; scope: 'mine' | 'all' }
  /** To the sender only: too much ink too fast; the pen pauses for a moment. */
  | { t: 'inkSlow' }
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
  | { t: 'correct'; x: number; y: number; reason: 'full' | 'restricted' | 'locked' | 'arena'; areaId?: string; deskId?: string }
  | { t: 'teleport'; x: number; y: number; reason: 'ring' | 'desk' | 'layout' | 'arena'; a?: number; back?: true }
  /** A new layout was published: fetch `GET /api/layout?rev=<rev>`. */
  | { t: 'layout'; rev: number; by: { name: string }; at: number }
  /** The custom objects changed (one was added or removed). */
  | { t: 'objects'; objects: CustomObject[] }
  /** A studio item was added, changed or removed: fetch the new or changed ones from `GET /api/items`. */
  | { t: 'items'; items: ItemInfo[] }
  /** The item helper was switched on or off, or stopped or started answering. Sent to everyone who can build. */
  | { t: 'helper'; status: 'off' | 'unavailable' | 'on'; cooling?: boolean }
  /** An admin turned building on or off; `canBuild` is this recipient's own permission. */
  | { t: 'building'; enabled: boolean; canBuild: boolean }
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
  | {
      t: 'adminState';
      areaAllowed: Record<string, string[]>;
      buildingEnabled?: boolean;
      helperEnabled?: boolean;
      arenaEnabled?: boolean;
    }
  /** To everyone when it changes: the match's public summary (no money, health or gear). */
  | {
      t: 'arena';
      match: null | {
        phase: Phase;
        round: number;
        wins: Record<Team, number>;
        /** Milliseconds left in this phase. */
        endsIn: number;
        host: string;
        teams: Record<string, Team>;
        alive: string[];
        /** Who took the round that just ended (set from the round-end phase on). */
        lastWinner?: Team | 'draw';
      };
    }
  /** To everyone: a visual tracer. Non-players draw it silently. */
  | { t: 'arenaShot'; from: string; x0: number; y0: number; x1: number; y1: number; hit?: string }
  /** To one player only: their own state and the events that involve them. */
  | {
      t: 'arenaYou';
      health: number;
      armour: number;
      money: number;
      gear: string;
      event?: { kind: 'hit' | 'tagged' | 'tag' | 'bought' | 'refused'; by?: string; target?: string; seq?: number };
    }
  /** To match players only: the full scoreboard. */
  | { t: 'arenaBoard'; rows: { id: string; team: Team; tags: number; tagOuts: number; money: number }[] }
  | {
      t: 'sprites';
      sprites: SpriteIndex;
      /** Sent to the admin who reloaded: sheets that were skipped, and sheets that work but need a look. */
      rejected?: { file: string; errors: string[] }[];
      warnings?: { file: string; warning: string }[];
    };
