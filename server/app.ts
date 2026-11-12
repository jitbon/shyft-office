import crypto from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { WebSocketServer, WebSocket } from 'ws';
import os from 'node:os';
import { currentCatalog, setCustomObjects, setStudioItems } from '../shared/catalog';
import {
  AREAS, MAP_H, MAP_W, SPAWN, areaAt, areaById, deskAt, deskById, getWorld, isBlocking, nearestFreeTile, nearestFreeTileNear, setWorld, validateOffice,
} from '../shared/map';
import { compileWorld } from '../shared/world';
import type { ClientMsg, ItemInfo, Look, PlayerState, PlayerStatus, ServerMsg } from '../shared/protocol';
import { isMemberId, isUuid } from '../shared/member';
import { positionContext } from '../shared/proximity';
import { INK_RATE_MSGS, INK_RATE_POINTS, validateInk, validateInkAllow, validateInkClear } from '../shared/ink';
import { shareKeeps, validateShareMsg, type SharePlace } from '../shared/screen-share';
import { blocksConversations, cleanStatus, devicesOff, shownStatus, STATUS_PRESETS, statusId, timeLeftText } from '../shared/status';
import { handleApi, type ApiContext } from './api';
import { LayoutStore } from './layout-store';
import { ObjectsStore } from './objects';
import { Helper, type Drafter } from './helper';
import { ItemsStore } from './items';
import { pinnedVersions } from '../shared/items-edit';
import { JUMP_COOLDOWN_MS } from '../shared/jump';
import { LinkEngine } from './links';
import { MatchEngine } from './arena';
import { DESK_LOOK_MESSAGES, clampDeskLook, validateDeskLook, type DeskLookError, type LookDesk } from '../shared/desk-look';
import { seasonOf } from '../shared/season';
import { JamEngine, REFUSALS, type JamTimings, type TitleLookup } from './jam';
import { moveAllowed, type Timings } from '../shared/arena';
import { ShareRegistry } from './shares';
import { OfficeState } from './office';
import { loadSprites, noSprites, validateAvatarChoice } from './sprites';
import { StateStore, loadState } from './store';
import { loadCharacter } from './characters';
import { Cooldown, RateWindow, type Limit } from './rate';
import { DEFAULT_LOOK, validateLook } from '../shared/wardrobe';
import { COMPANION_MESSAGES, Trail, type CompanionError } from '../shared/pets';
import { CompanionBook, type PlantChange } from './companions';

export interface ServerOptions {
  port: number;
  /** Where the built client lives; only used in production. */
  distDir?: string;
  /** Persistent state (desk claims etc). */
  dataDir?: string;
  spritesDir?: string;
  /** Opening the app with ?admin=<token> grants the admin role. Empty disables it. */
  adminToken?: string;
  ice?: { urls: string | string[]; username?: string; credential?: string }[];
  /** How often links are recomputed regardless of movement. */
  tickMs?: number;
  /** Most custom-object uploads one member may make in a minute. Default 10. */
  uploadsPerMinute?: number;
  /** Least time between one member's publishes. Default 2 s. */
  publishCooldownMs?: number;
  /** Least time between one member's draft saves. Default 0.5 s. */
  draftCooldownMs?: number;
  /** The service the item helper asks for drafts; none means the helper is unavailable. */
  drafter?: Drafter;
  /** How long the helper waits for an answer. Default 60 s. */
  helperTimeoutMs?: number;
  /** Most item saves one member may make in a minute. Default 20. */
  itemSavesPerMinute?: number;
  /** Least time between one member's studio draft saves. Default 1 s. */
  studioDraftCooldownMs?: number;
  /** How often idle connections are pinged. One that misses a whole round is dropped, so a dead one goes within twice this. */
  pingMs?: number;
  /** Phase lengths for Office Arena; tests shorten them. */
  arenaTimings?: Timings;
  /** Fixed team spawn points for Office Arena, instead of ones worked out from the layout. For tests. */
  arenaSpawns?: Record<'blue' | 'orange', { x: number; y: number }[]>;
  /** How often Jam Rooms are ticked and how long the gap between songs is; tests shorten both. */
  jamTimings?: JamTimings;
  /** Looks up a song's title; tests replace it so nothing touches the network. */
  jamLookup?: TitleLookup;
  /** The clock Jam Rooms use, in ms; tests drive it. */
  jamNow?: () => number;
  /** The office's clock: where it starts (default: now) and which hemisphere the seasons follow. */
  clock?: { startAt?: number; hemisphere?: 'north' | 'south'; now?: () => number; seasonCheckMs?: number };
}

export interface RunningServer {
  port: number;
  /** How long recomputing everyone's links takes, for load checks. */
  linkStats(): { lastMs: number; peakMs: number };
  close(): Promise<void>;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/**
 * Call-setup frames bigger than this are dropped. With the voice, camera and screen slots one SDP is about 16 KB in Chrome,
 * and about 26 KB when both sides offer at once, so the limit leaves room (the socket's own limit is 64 KB).
 */
/**
 * One call-setup message may be this big: a Chrome offer with four media slots is about 16 KB, and 26 KB when both sides offer.
 * With the socket's own 64 KB limit this bounds what one connection can make the server relay.
 */
const MAX_RTC_BYTES = 48 * 1024;
/** Per connection, per second. */
const PER_SECOND = {
  /** Call setup: a full meeting sends a burst of offers and candidates, nothing like this much. */
  rtc: { count: 200, weight: 1024 * 1024 },
  /** Character changes: each is a broadcast and a save. */
  avatar: { count: 4 },
  /** Starting, stopping or resizing a screen share. */
  share: { count: 4 },
  /** Pen ink (weight is points). */
  ink: { count: INK_RATE_MSGS, weight: INK_RATE_POINTS },
  /** Office Arena controls and purchases; a shot is limited by its gear's fire rate instead. */
  arena: { count: 10 },
  fire: { count: 30 },
  /** Status preferences. */
  statusPrefs: { count: 4 },
  /** Adopting, changing or placing a pet or plant: each is a broadcast and a save. */
  companion: { count: 4 },
} satisfies Record<string, Limit>;

const cleanLook = (l: unknown): Look => validateLook(l, DEFAULT_LOOK);
const cleanName = (n: unknown) => String(n ?? '').trim().slice(0, 24) || 'Guest';
const num = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;

interface Conn {
  ws: WebSocket;
  p: PlayerState;
  isAdmin: boolean;
  /** Token this connection sends to the HTTP API. */
  session: string;
  /** Office Arena speed check: the last place and time a move was measured from. */
  moveFrom: { x: number; y: number; at: number };
  /** The status the member set (or Available). Automatic rules never change it; `p.status` is what everyone sees. */
  chosen: PlayerStatus;
  /** Show Available as In a meeting while in one (the member's setting). */
  autoMeeting: boolean;
  /** Whether the member is in a meeting right now, as of the last tick. */
  inMeeting: boolean;
  /** Where this person has just walked: their pet follows it (feature 014). */
  trail: Trail;
}

export function startServer(opts: ServerOptions): Promise<RunningServer> {
  const distDir = opts.distDir ?? path.resolve(import.meta.dirname, '../dist');
  const ice = opts.ice ?? [{ urls: 'stun:stun.l.google.com:19302' }];

  let sprites = opts.spritesDir ? loadSprites(opts.spritesDir) : noSprites();

  /** Serves the sprite index, valid sheets, the guide template and the format doc. Nothing else. */
  function serveSprites(name: string, res: http.ServerResponse) {
    const send = (type: string, body: Buffer | string) => {
      res.writeHead(200, { 'content-type': type, 'cache-control': 'no-cache' }).end(body);
    };
    if (name === 'index.json') return send('application/json', JSON.stringify(sprites.index));
    if (name === 'template.png' || name === 'FORMAT.md') {
      const file = opts.spritesDir ? path.join(opts.spritesDir, name) : '';
      if (file && fs.existsSync(file)) return send(name.endsWith('.png') ? 'image/png' : 'text/markdown; charset=utf-8', fs.readFileSync(file));
    } else {
      const m = /^([a-z0-9-]+)\.png$/.exec(name);
      const bytes = m && sprites.files.get(m[1]);
      if (bytes) return send('image/png', bytes);
    }
    res.writeHead(404).end();
  }

  /** Serves the sheets of validated custom objects. The version in the URL changes when a sheet does, so they cache for long. */
  function serveObjects(name: string, res: http.ServerResponse) {
    const m = /^([a-z0-9-]+)\.png$/.exec(name);
    const bytes = m && objects.file(m[1]);
    if (!bytes) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=31536000, immutable' }).end(bytes);
  }

  // Serves the built client in production; during development Vite serves it.
  const server = http.createServer((req, res) => {
    // One bad request must never take the office down for everyone.
    try {
      serveHttp(req, res);
    } catch (err) {
      console.warn('http request failed:', (err as Error).message);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });

  function serveHttp(req: http.IncomingMessage, res: http.ServerResponse) {
    let urlPath: string;
    try {
      urlPath = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    } catch {
      res.writeHead(400).end(); // malformed percent-encoding
      return;
    }
    if (urlPath.startsWith('/sprites/')) return serveSprites(urlPath.slice('/sprites/'.length), res);
    if (urlPath.startsWith('/objects/')) return serveObjects(urlPath.slice('/objects/'.length), res);
    if (urlPath.startsWith('/api/')) {
      void handleApi(req, res, new URL(req.url ?? '/', 'http://x'), apiContext);
      return;
    }
    let file = path.join(distDir, urlPath);
    // Inside dist itself: a bare prefix check would also let in a sibling such as dist-old/.
    if (file !== distDir && !file.startsWith(distDir + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(distDir, 'index.html');
    if (!fs.existsSync(file)) {
      res.writeHead(200, { 'content-type': 'text/plain' }).end('Shyft Office server is running. Use `npm run dev` and open the Vite URL.');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  }

  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });
  const conns = new Map<WebSocket, Conn>();
  const byId = new Map<string, Conn>();
  const sessions = new Map<string, Conn>();
  const alive = new WeakSet<WebSocket>();
  let nextId = 1;
  let nextEphemeral = 1;

  function send(ws: WebSocket, msg: ServerMsg) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }
  const sendTo = (id: string, msg: ServerMsg) => {
    const c = byId.get(id);
    if (c) send(c.ws, msg);
  };
  /** Per-connection limits, keyed `<what>:<player id>`; see PER_SECOND. */
  const perSecond = new RateWindow(1000);
  /** Jam Room limits, per minute: adding songs is the costly one (it asks the provider for a title). */
  const perMinute = new RateWindow(60_000);
  const JAM_LIMITS = { add: { count: 6 }, other: { count: 20 } } satisfies Record<string, Limit>;
  const within = (what: keyof typeof PER_SECOND, id: string, weight = 0) => perSecond.take(`${what}:${id}`, PER_SECOND[what], weight);
  /** One jump at a time per person. */
  const jumpCooldown = new Cooldown(JUMP_COOLDOWN_MS - 50);
  /** "Slow down" goes to a drawer at most once a second. */
  const inkSlowCooldown = new Cooldown(1000);

  function broadcast(msg: ServerMsg, except?: WebSocket) {
    const data = JSON.stringify(msg);
    for (const ws of conns.keys()) {
      if (ws !== except && ws.readyState === WebSocket.OPEN) ws.send(data);
    }
  }

  const dataDir = opts.dataDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'shyft-data-'));
  // Custom objects first: a layout may place them. Then the published layout, before saved desk claims, which are matched against its desks.
  const objects = ObjectsStore.load(path.join(dataDir, 'objects'));
  setCustomObjects(objects.list());
  const items = ItemsStore.load(path.join(dataDir, 'items'));
  setStudioItems(items.records(), items.olderRecords()); // before the layouts: a layout may place them, or pin a copy to an older version
  const layouts = LayoutStore.load(dataDir);
  items.prune(pinnedVersions(layouts.current.layout));
  items.pruneDrafts();
  const draftPruner = setInterval(() => items.pruneDrafts(), 24 * 60 * 60 * 1000);
  draftPruner.unref();
  setWorld(compileWorld(layouts.current.layout, currentCatalog()));
  layouts.pruneDrafts();
  const pruner = setInterval(() => layouts.pruneDrafts(), 24 * 60 * 60 * 1000);
  pruner.unref();
  validateOffice();
  const store = opts.dataDir ? new StateStore(opts.dataDir) : null;
  const loaded = opts.dataDir ? loadState(opts.dataDir) : undefined;
  const office: OfficeState = new OfficeState(() => [...conns.values()].map((c) => c.p), {
    state: loaded,
    onChange: () => store?.save(office.persistState()),
  });
  const helper = new Helper({ drafter: opts.drafter, enabled: () => office.helperEnabled, timeoutMs: opts.helperTimeoutMs });
  /** Tells everyone who can build how the helper is, now and again when a cool-down after a failure ends. */
  let helperTimer: NodeJS.Timeout | undefined;
  const broadcastHelper = () => {
    const status = helper.status();
    const cooling = status === 'unavailable' && helper.retryAt() !== undefined;
    for (const o of conns.values()) if (canBuild(o)) send(o.ws, { t: 'helper', status, ...(cooling ? { cooling } : {}) });
    clearTimeout(helperTimer);
    const at = helper.retryAt();
    if (at) {
      helperTimer = setTimeout(broadcastHelper, at - Date.now() + 50);
      helperTimer.unref();
    }
  };
  const itemInfos = (): ItemInfo[] => items.list().map((i) => ({
    id: `item:${i.id}`, name: i.def.name, group: i.def.group, ...(i.def.season ? { season: i.def.season } : {}), kind: i.def.kind, by: i.by.name, version: i.version,
  }));
  const canBuild = (c: Conn) => !c.p.memberId.startsWith('eph-') && (c.isAdmin || office.buildingEnabled);
  const apiContext: ApiContext = {
    layouts,
    objects,
    objectsChanged: () => {
      setCustomObjects(objects.list());
      broadcast({ t: 'objects', objects: objects.list() });
    },
    items,
    helper,
    helperChanged: () => broadcastHelper(),
    itemsChanged: () => {
      setStudioItems(items.records(), items.olderRecords());
      broadcast({ t: 'items', items: itemInfos() });
    },
    itemSavesPerMinute: opts.itemSavesPerMinute ?? 20,
    studioDraftCooldownMs: opts.studioDraftCooldownMs ?? 1000,
    uploadsPerMinute: opts.uploadsPerMinute ?? 10,
    catalog: () => currentCatalog(),
    character: (memberId) => loadCharacter(office.characters, memberId, sprites.index),
    caller: (token) => {
      const c = token ? sessions.get(token) : undefined;
      return c && { memberId: c.p.memberId, name: c.p.name, isAdmin: c.isAdmin, guest: c.p.memberId.startsWith('eph-'), inMatch: arena.isPlayer(c.p.id) };
    },
    buildingEnabled: () => office.buildingEnabled,
    applyPublish: (layout, by) => applyPublish(layout, by),
    publishCooldownMs: opts.publishCooldownMs ?? 2000,
    draftCooldownMs: opts.draftCooldownMs ?? 500,
  };
  const shares = new ShareRegistry();
  const links = new LinkEngine(() => [...conns.values()].map((c) => c.p), sendTo, {
    office: () => office.linkInput(),
    shares: (members) => shares.sharesOf(members),
  });
  /** Where a player stands for the screen-share rules, or null once they are gone. */
  const placeOf = (id: string): SharePlace | null => {
    const p = byId.get(id)?.p;
    if (!p) return null;
    return {
      context: positionContext(p.x, p.y, p.id, office.linkInput()),
      inConversation: links.conversationMembers(p.id).length > 0,
      atDesk: deskAt(p.x, p.y) !== null,
      dnd: devicesOff(p.status),
    };
  };
  /**
   * Works out the status everyone sees for one connection (its chosen status, an expired one reverted, or an automatic
   * In a meeting) and, when it changed, applies its effects and tells everyone. Never turns a device on.
   */
  const applyShown = (c: Conn, now: number) => {
    const next = shownStatus(c.chosen, c.inMeeting, c.autoMeeting, now);
    if (JSON.stringify(next) === JSON.stringify(c.p.status)) return;
    c.p.status = next;
    if (devicesOff(next)) {
      if (c.p.mic || c.p.cam) {
        c.p.mic = false;
        c.p.cam = false;
        broadcast({ t: 'presence', id: c.p.id, mic: false, cam: false });
      }
      if (shares.stop(c.p.id)) send(c.ws, { t: 'shareState', on: false, reason: next.kind === 'dnd' ? 'dnd' : 'status' });
    }
    broadcast({ t: 'presence', id: c.p.id, status: next });
    if (office.deskOf(c.p.memberId)) broadcastOffice();
  };
  /** Connections of the same signed-in member (tabs). A guest is just themselves. */
  const tabsOf = (c: Conn): Conn[] =>
    c.p.memberId.startsWith('eph-') ? [c] : [...conns.values()].filter((o) => o.p.memberId === c.p.memberId);
  links.beforeUpdate = () => {
    const now = Date.now();
    // In a meeting: sharing a screen, in a conversation of 3 or more, or in a private area with someone else.
    // Contexts are counted once per tick so this stays linear in the number of players.
    const contexts = new Map<string, string>();
    const perArea = new Map<string, number>();
    for (const c of conns.values()) {
      const ctx = positionContext(c.p.x, c.p.y, c.p.id, office.linkInput());
      contexts.set(c.p.id, ctx);
      if (ctx.startsWith('area:')) perArea.set(ctx, (perArea.get(ctx) ?? 0) + 1);
    }
    for (const c of conns.values()) {
      const ctx = contexts.get(c.p.id)!;
      c.inMeeting =
        shares.has(c.p.id) || links.conversationMembers(c.p.id).length >= 3 || (ctx.startsWith('area:') && (perArea.get(ctx) ?? 0) > 1);
      applyShown(c, now);
    }
    // A share ends when its sharer's place no longer keeps it; only the sharer is told.
    for (const { sharer, reason } of shares.sweep(placeOf)) sendTo(sharer, { t: 'shareState', on: false, reason });
  };
  links.start(opts.tickMs ?? 200);
  const MATCH_REFUSED = 'Not during a match';
  const arena = new MatchEngine({
    pose: (id) => {
      const p = byId.get(id)?.p;
      return p ? { x: p.x, y: p.y, a: p.a, mode: p.mode } : null;
    },
    send: sendTo,
    broadcast: (msg) => broadcast(msg),
    teleport: (id, x, y, a, back) => {
      const c = byId.get(id);
      if (!c) return;
      c.p.x = x;
      c.p.y = y;
      c.p.a = a;
      c.moveFrom = { x, y, at: Date.now() };
      syncJam(c);
      send(c.ws, { t: 'teleport', x, y, a, reason: 'arena', ...(back ? { back: true as const } : {}) });
      broadcast({ t: 'state', id, x, y, a, mode: c.p.mode, moving: false }, c.ws);
      if (areaAt(x, y)?.id !== undefined) broadcastOffice();
    },
    world: () => getWorld(),
    enabled: () => office.arenaEnabled,
    changed: () => {
      links.update();
      syncJamAll(); // players in a match are never listeners
    },
    timings: opts.arenaTimings,
    spawns: opts.arenaSpawns,
  });
  office.inArena = (id) => arena.isPlayer(id);
  office.matchPlayers = () => arena.players();
  const arenaTimer = setInterval(() => arena.tick(), opts.arenaTimings ? 20 : 100);
  arenaTimer.unref();
  const jam = new JamEngine({
    send: sendTo,
    nameOf: (id) => byId.get(id)?.p.name ?? 'Someone',
    memberOf: (id) => byId.get(id)?.p.memberId ?? id,
    inArena: (id) => arena.isPlayer(id),
    rooms: () => new Map(AREAS.filter((a) => a.jam).map((a) => [a.id, a.name])),
    now: opts.jamNow,
    lookup: opts.jamLookup,
    timings: opts.jamTimings,
  });
  /** The Jam Room a player stands in, if it is one and they are not in a match. */
  const jamRoomFor = (c: Conn): string | null => {
    if (arena.isPlayer(c.p.id)) return null;
    const area = areaAt(c.p.x, c.p.y);
    return area?.jam ? area.id : null;
  };
  /** Makes the player a listener of the Jam Room they stand in, or not a listener of any. */
  function syncJam(c: Conn) {
    const want = jamRoomFor(c);
    if (want === jam.roomOf(c.p.id)) return;
    if (want === null || !jam.enter(c.p.id, want)) jam.leave(c.p.id);
  }
  const syncJamAll = () => {
    for (const c of conns.values()) syncJam(c);
  };
  const jamTimer = setInterval(() => jam.tick(), jam.tickMs);
  jamTimer.unref();
  /** Rings waiting for an answer, keyed `<ringer>><recipient>`, and when each was last sent. */
  const rings = new Map<string, number>();
  const lastWave = new Map<string, number>();
  const RING_TTL_MS = 60_000;
  const RING_COOLDOWN_MS = 5_000;
  const WAVE_COOLDOWN_MS = 2_000;
  const broadcastOffice = () => broadcast({ t: 'office', ...office.snapshot() });

  // The office's clock (tests and OFFICE_FAKE_DATE start it elsewhere) and the season it shows.
  const clockOffset = opts.clock?.now ? 0 : opts.clock?.startAt !== undefined ? opts.clock.startAt - Date.now() : 0;
  const officeNow = opts.clock?.now ?? (() => Date.now() + clockOffset);
  const hemisphere = opts.clock?.hemisphere ?? 'north';
  const seasonNow = () => seasonOf(new Date(officeNow()), hemisphere);
  let lastSeason = seasonNow();
  const seasonTimer = setInterval(() => {
    const now = seasonNow();
    if (now !== lastSeason) {
      lastSeason = now;
      broadcast({ t: 'season', season: now });
    }
  }, opts.clock?.seasonCheckMs ?? 3_600_000);
  seasonTimer.unref();

  // ------------------------------------------------------------ pets and plants (feature 014)
  const book = new CompanionBook({
    records: loaded?.companions,
    now: officeNow,
    tzOffsetMin: () => -new Date(officeNow()).getTimezoneOffset(),
    deskOf: (memberId) => office.deskOf(memberId),
    // A pet follows its owner's oldest open tab, unless they are in a match or listening in a Jam Room: then it rests.
    follower: (memberId) => {
      let first: Conn | undefined;
      for (const o of conns.values()) if (o.p.memberId === memberId && (!first || Number(o.p.id) < Number(first.p.id))) first = o;
      if (!first || arena.isPlayer(first.p.id) || jam.roomOf(first.p.id) !== null) return undefined;
      return { id: first.p.id, trail: first.trail, x: first.p.x, y: first.p.y };
    },
    online: () => new Set([...conns.values()].map((o) => o.p.memberId)),
    onChange: () => office.save(),
  });
  office.companions = () => book.persist();
  /** What each pet's view last said about where it is (following whom, or its rest spot), so a change is sent once. */
  const petSigs = new Map<string, string>();
  const petSig = (v: { follow?: string; rest: { x: number; y: number } }) => `${v.follow ?? ''}|${v.rest.x},${v.rest.y}`;
  const broadcastPet = (owner: string) => {
    const view = book.petView(owner);
    if (!view) return;
    petSigs.set(owner, petSig(view));
    broadcast({ t: 'petUpsert', pet: view });
  };
  /** A plant changed: everyone sees placed plants; an unplaced one is only in its owner's panel. */
  const sendPlant = (ch: PlantChange & { removed?: true }) => {
    if (ch.removed) return broadcast({ t: 'plantGone', id: ch.plant.id });
    const view = book.plantView(ch.owner, ch.plant);
    if (view.spot) return broadcast({ t: 'plantUpsert', plant: view });
    if (ch.wasPlaced) broadcast({ t: 'plantGone', id: ch.plant.id });
    for (const o of conns.values()) if (o.p.memberId === ch.owner) send(o.ws, { t: 'plantUpsert', plant: view });
  };
  // Every link tick: plants follow desk changes, and a pet whose owner came, went, joined a match or a jam, or changed desk
  // is told to everyone. Watching the result covers every way those can change.
  // Links are also recomputed on every move, so this runs at most about five times a second.
  const statusTick = links.beforeUpdate;
  let companionsAt = 0;
  links.beforeUpdate = () => {
    statusTick();
    const t = Date.now();
    if (t - companionsAt < 150) return;
    companionsAt = t;
    for (const ch of book.reconcileDesks()) sendPlant(ch);
    for (const view of book.views().pets) {
      if (petSigs.get(view.owner) === petSig(view)) continue;
      petSigs.set(view.owner, petSig(view));
      broadcast({ t: 'petUpsert', pet: view });
    }
  };

  /** Desk looks: shown to everyone, for every claimed desk that has one. */
  const broadcastLooks = () => broadcast({ t: 'deskLooks', looks: office.looksByDesk() });
  /** The desk a look is checked against: the member's desk as the office has it now. */
  const lookDeskFor = (deskId: string): LookDesk | null => {
    const world = getWorld();
    const desk = world.desks.find((d) => d.id === deskId);
    const placed = world.objects.find((o) => o.obj.id === deskId);
    if (!desk || !placed) return null;
    const chair = world.objects.find((o) => o.item.tile === 'h' && desk.seat.x >= o.x && desk.seat.x < o.x + o.w && desk.seat.y >= o.y && desk.seat.y < o.y + o.d);
    return { obj: placed.obj, item: placed.item, chairItem: chair?.item, tiles: desk.tiles };
  };
  const looksCooldown = new Cooldown(1000);
  const REMOVED_TEXT = (memberId: string) =>
    `Your desk was removed in the latest office update.${office.deskLookOf(memberId) ? ' Your desk decorations are saved for your next desk.' : ''}`;
  const sendAdminState = (c: Conn) => {
    if (!c.isAdmin) return;
    const areaAllowed: Record<string, string[]> = {};
    for (const a of AREAS) if (a.restricted) areaAllowed[a.id] = office.allowedFor(a.id);
    send(c.ws, {
      t: 'adminState', areaAllowed, buildingEnabled: office.buildingEnabled, helperEnabled: office.helperEnabled, arenaEnabled: office.arenaEnabled,
    });
  };

  wss.on('connection', (ws) => {
    alive.add(ws);
    ws.on('pong', () => alive.add(ws));
    // ws closes the socket itself after an error (an oversized or malformed frame); without a listener
    // the error would be thrown and stop the whole server.
    ws.on('error', (err) => console.warn('socket error:', err.message));

    ws.on('message', (raw) => {
      let msg: ClientMsg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      // Valid JSON is not necessarily an object: `null`, `7` or `"hi"` must be ignored, not crash the server.
      if (typeof msg !== 'object' || msg === null || Array.isArray(msg)) return;
      try {
        handle(ws, msg, String(raw).length);
      } catch (err) {
        console.warn(`message ${String((msg as { t?: unknown }).t)} failed:`, (err as Error).message);
      }
    });

    ws.on('close', () => onClose(ws));
  });

  /**
   * Makes a checked layout the office everyone shares: the world is recompiled, anyone left inside a wall or
   * furniture is moved to a free tile, and every client is told to fetch the new revision.
   */
  function applyPublish(layout: import('../shared/layout').Layout, by: import('./layout-store').Publisher) {
    const rev = layouts.publish(layout, by);
    items.prune(pinnedVersions(rev.layout)); // an older version nobody is pinned to any more is not kept
    setWorld(compileWorld(rev.layout, currentCatalog()));
    // Desks that are gone lose their claim; each holder hears about it, now if online, otherwise on their next join.
    for (const { memberId, deskId } of office.reconcile().released) {
      const online = [...conns.values()].filter((c) => c.p.memberId === memberId);
      if (!online.length) office.addDeskNotice(memberId, 'removed');
      for (const c of online) send(c.ws, { t: 'notify', kind: 'deskRemoved', deskId, text: REMOVED_TEXT(memberId) });
    }
    broadcastLooks(); // a desk that moved keeps its look; one that is gone loses it (it stays saved with the member)
    const taken = new Set<string>();
    for (const c of conns.values()) {
      if (isBlocking(Math.floor(c.p.x), Math.floor(c.p.y))) continue;
      taken.add(`${Math.floor(c.p.x)},${Math.floor(c.p.y)}`);
    }
    for (const c of conns.values()) {
      if (!isBlocking(Math.floor(c.p.x), Math.floor(c.p.y))) continue;
      const spot = nearestFreeTile(c.p.x, c.p.y, taken);
      taken.add(`${Math.floor(spot.x)},${Math.floor(spot.y)}`);
      c.p.x = spot.x;
      c.p.y = spot.y;
      send(c.ws, { t: 'teleport', ...spot, reason: 'layout' });
    }
    jam.roomsChanged(); // rooms that stopped being Jam Rooms close, then people standing in new ones join
    syncJamAll();
    broadcast({ t: 'layout', rev: rev.rev, by: { name: by.name }, at: rev.at });
    broadcastOffice();
    links.update();
    return rev;
  }

  /** Tells the sender of a ring or wave when the target's status keeps conversations away ("Sam is at lunch · back at 1"). */
  function tellAway(ws: WebSocket, target: Conn) {
    const st = target.p.status;
    if (!blocksConversations(st)) return;
    const text = [`${target.p.name} ${STATUS_PRESETS[statusId(st)].phrase}`, st.text, timeLeftText(st, Date.now())].filter(Boolean).join(' · ');
    send(ws, { t: 'notify', kind: 'awayInfo', from: target.p.id, text });
  }

  function handle(ws: WebSocket, msg: ClientMsg, rawLength: number) {
    const conn = conns.get(ws);

    if (msg.t === 'join') {
      if (conn) return;
      const look = cleanLook(msg.look);
      const p: PlayerState = {
        id: String(nextId++),
        name: cleanName(msg.name),
        look,
        // Members without a valid id are guests for this session and cannot claim desks.
        memberId: isUuid(msg.memberId) ? msg.memberId.toLowerCase() : `eph-${nextEphemeral++}`,
        avatar: validateAvatarChoice(msg.avatar, sprites.index, look),
        status: { kind: 'available' },
        mic: false,
        cam: false,
        x: SPAWN.x,
        y: SPAWN.y,
        a: -Math.PI / 2,
        mode: '2d',
        moving: false,
      };
      const c: Conn = {
        ws,
        p,
        isAdmin: !!opts.adminToken && typeof msg.admin === 'string' && msg.admin === opts.adminToken,
        session: crypto.randomBytes(16).toString('hex'),
        moveFrom: { x: p.x, y: p.y, at: Date.now() },
        chosen: { kind: 'available' },
        autoMeeting: true,
        inMeeting: false,
        trail: new Trail(),
      };
      c.trail.push(p.x, p.y, officeNow());
      // A second tab of the same member starts with the status they chose in the first.
      const otherTab = p.memberId.startsWith('eph-') ? undefined : [...conns.values()].find((o) => o.p.memberId === p.memberId);
      if (otherTab) {
        c.chosen = otherTab.chosen;
        c.autoMeeting = otherTab.autoMeeting;
        p.status = shownStatus(c.chosen, false, c.autoMeeting, Date.now());
      }
      conns.set(ws, c);
      office.saveCharacter(p.memberId, p.avatar);
      byId.set(p.id, c);
      sessions.set(c.session, c);
      send(ws, {
        t: 'welcome',
        id: p.id,
        players: [...conns.values()].map((o) => o.p).filter((o) => o !== p),
        office: office.snapshot(),
        sprites: sprites.index,
        ice,
        isAdmin: c.isAdmin,
        session: c.session,
        layoutRev: layouts.current.rev,
        deskLooks: office.looksByDesk(),
        season: seasonNow(),
        tzOffsetMin: -new Date(officeNow()).getTimezoneOffset(),
        now: officeNow(),
        canBuild: canBuild(c),
        objects: objects.list(),
        items: itemInfos(),
        ...(canBuild(c) ? { helper: helper.status(), ...(helper.retryAt() !== undefined && helper.status() === 'unavailable' ? { helperCooling: true } : {}) } : {}),
        companions: book.views(p.memberId),
      });
      sendAdminState(c);
      // Back after being away: once, who looked after their pet and plants meanwhile.
      if (!otherTab && !p.memberId.startsWith('eph-')) {
        const entries = book.arrived(p.memberId, p.name);
        if (entries.length) send(ws, { t: 'careSummary', entries });
      }
      // Someone who lost their desk when the office was redesigned or updated hears about it once, on their first join.
      if (otherTab) send(ws, { t: 'presence', id: p.id, status: p.status });
      const deskNotice = office.takeDeskNotice(p.memberId);
      if (deskNotice) send(ws, { t: 'notify', kind: deskNotice === 'reset' ? 'deskReset' : 'deskRemoved', ...(deskNotice === 'removed' ? { text: REMOVED_TEXT(p.memberId) } : {}) });
      broadcast({ t: 'join', player: p }, ws);
      broadcastOffice();
      send(ws, arena.summary());
      syncJam(c); // a spawn inside a Jam Room makes them a listener straight away
      console.log(`+ ${p.name} (${conns.size} online)`);
      return;
    }
    if (!conn) return;
    const me = conn.p;

    if (msg.t === 'state') {
      const nx = num(msg.x, 0, MAP_W, me.x);
      const ny = num(msg.y, 0, MAP_H, me.y);
      const inMatch = arena.isPlayer(me.id);
      if (inMatch && Math.hypot(nx - me.x, ny - me.y) > 0.001) {
        // A match player cannot move while frozen (buy phase, tagged out) or from the top-down view, and cannot move faster than running.
        if (arena.frozen(me.id) || msg.mode !== '3d' || !moveAllowed(conn.moveFrom, { x: nx, y: ny }, Date.now() - conn.moveFrom.at)) {
          send(ws, { t: 'correct', x: me.x, y: me.y, reason: 'arena' });
          return;
        }
      }
      const denied = office.checkEntry(me, me.x, me.y, nx, ny);
      if (denied) {
        // Keep the old position and snap the client back.
        send(ws, {
          t: 'correct', x: me.x, y: me.y, reason: denied,
          ...(denied === 'locked' ? { deskId: deskAt(nx, ny)?.id } : denied === 'arena' ? {} : { areaId: areaAt(nx, ny)?.id }),
        });
        return;
      }
      const before = areaAt(me.x, me.y)?.id ?? null;
      me.x = nx;
      me.y = ny;
      conn.trail.push(nx, ny, officeNow());
      // The speed is measured from a checkpoint that advances at most every 200 ms, so many small hops add up to no more than running.
      if (inMatch && Date.now() - conn.moveFrom.at >= 200) conn.moveFrom = { x: nx, y: ny, at: Date.now() };
      me.a = num(msg.a, -1e6, 1e6, me.a);
      me.mode = msg.mode === '3d' ? '3d' : '2d';
      me.moving = !!msg.moving;
      const after = areaAt(me.x, me.y)?.id ?? null;
      if (before !== after) {
        office.noteMove(me.memberId, before, after);
        syncJam(conn);
        broadcastOffice();
      }
      if (office.afterMove(me)) broadcastOffice(); // leaving your desk unlocks it
      broadcast({ t: 'state', id: me.id, x: me.x, y: me.y, a: me.a, mode: me.mode, moving: me.moving }, ws);
      links.update();
    } else if (msg.t === 'jump') {
      // Only for show, but still limited: one jump at a time per person, told to everyone who is sent their moves.
      if (!jumpCooldown.ready(me.id)) return;
      broadcast({ t: 'jump', id: me.id }, ws);
    } else if (msg.t === 'desk') {
      const fail = (error: string) => send(ws, { t: 'notify', kind: 'error', text: error });
      if (msg.op === 'claim') {
        const r = office.claim(me, typeof msg.deskId === 'string' ? msg.deskId : undefined);
        if (!r.ok) return fail(r.error);
      } else if (msg.op === 'unclaim') {
        office.unclaim(me.memberId);
      } else if (msg.op === 'lock') {
        const r = office.lock(me);
        if (!r.ok) return fail(r.error);
      } else if (msg.op === 'unlock') {
        office.unlock(me.memberId);
      } else {
        return;
      }
      broadcastOffice();
      if (msg.op === 'claim' || msg.op === 'unclaim') broadcastLooks(); // the holder's look appears or goes with the claim
      links.update();
    } else if (msg.t === 'deskLook') {
      const refuse = (code: DeskLookError) => send(ws, { t: 'deskLookError', code, message: DESK_LOOK_MESSAGES[code] });
      if (me.memberId.startsWith('eph-')) return refuse('not-member');
      if (!looksCooldown.ready(`desklook:${me.memberId}`)) return refuse('rate');
      const deskId = office.deskOf(me.memberId);
      const target = deskId ? lookDeskFor(deskId) : null;
      if (!deskId || !target) return refuse('no-desk');
      if (msg.look === null) office.setDeskLook(me.memberId, null);
      else {
        const look = clampDeskLook(msg.look);
        if (!look) return refuse('unknown-item');
        const bad = validateDeskLook(look, target, currentCatalog());
        if (bad) return refuse(bad);
        office.setDeskLook(me.memberId, look);
      }
      broadcastLooks();
    } else if (msg.t === 'deskInvite') {
      if (!isMemberId(msg.memberId)) {
        send(ws, { t: 'notify', kind: 'error', text: 'That is not someone you can invite.' });
        return;
      }
      const guestId = msg.memberId.toLowerCase(); // ids are stored in lower case
      const invited = office.invite(me, guestId);
      if (!invited.ok) {
        send(ws, { t: 'notify', kind: 'error', text: invited.error });
        return;
      }
      const guest = [...conns.values()].find((c) => c.p.memberId === guestId);
      if (guest) sendTo(guest.p.id, { t: 'notify', kind: 'deskInvite', from: me.id, deskId: invited.deskId, text: me.name });
      else send(ws, { t: 'notify', kind: 'error', text: 'They are not online right now.' });
    } else if (msg.t === 'walkToDesk') {
      if (arena.isPlayer(me.id)) return void send(ws, { t: 'notify', kind: 'error', text: MATCH_REFUSED });
      const own = office.deskOf(me.memberId);
      const deskId = typeof msg.deskId === 'string' ? msg.deskId : own;
      const desk = deskId ? deskById(deskId) : undefined;
      const fail = (error: string) => send(ws, { t: 'notify', kind: 'error', text: error });
      if (!desk) return fail(deskId ? 'That desk does not exist.' : 'You have not claimed a desk yet.');
      if (desk.id === own) {
        send(ws, { t: 'teleport', x: desk.seat.x + 0.5, y: desk.seat.y + 0.5, reason: 'desk' });
      } else if (office.isGuestOf(desk.id, me.memberId)) {
        const taken = new Set([...conns.values()].map((c) => `${Math.floor(c.p.x)},${Math.floor(c.p.y)}`));
        const spot = nearestFreeTileNear(desk.seat.x + 0.5, desk.seat.y + 0.5, taken);
        if (!spot) return fail('There is no room at that desk right now.');
        send(ws, { t: 'teleport', ...spot, reason: 'desk' });
      } else {
        fail('You were not invited to that desk.');
      }
    } else if (msg.t === 'knock') {
      const knock = typeof msg.areaId === 'string' ? office.knock(msg.areaId, me) : null;
      if (!knock) {
        send(ws, { t: 'notify', kind: 'error', text: 'You cannot knock there.' });
        return;
      }
      for (const id of office.occupants(knock.areaId)) {
        sendTo(id, { t: 'notify', kind: 'knock', from: me.id, memberId: me.memberId, areaId: knock.areaId, text: me.name });
      }
    } else if (msg.t === 'admit') {
      const knock = typeof msg.areaId === 'string' && typeof msg.memberId === 'string'
        ? office.admit(msg.areaId, msg.memberId, !!msg.allow, me)
        : null;
      if (knock) sendTo(knock.playerId, { t: 'notify', kind: 'knockResult', areaId: knock.areaId, ok: !!msg.allow });
    } else if (msg.t === 'admin') {
      if (!conn.isAdmin) return;
      if (msg.op === 'reloadSprites') {
        if (!opts.spritesDir) return;
        sprites = loadSprites(opts.spritesDir);
        broadcast({ t: 'sprites', sprites: sprites.index }, ws);
        send(ws, { t: 'sprites', sprites: sprites.index, rejected: sprites.rejected, warnings: sprites.warnings });
        // Anyone wearing a sheet that is gone (or changed layer) goes back to the built-in character.
        for (const c of conns.values()) {
          const fixed = validateAvatarChoice(c.p.avatar, sprites.index, c.p.look);
          if (JSON.stringify(fixed) !== JSON.stringify(c.p.avatar)) {
            c.p.avatar = fixed;
            broadcast({ t: 'presence', id: c.p.id, avatar: fixed });
          }
        }
      } else if (msg.op === 'podMode') {
        if (office.setPodMode(String(msg.podId), msg.mode)) {
          broadcastOffice();
          links.update();
        }
      } else if (msg.op === 'building' && typeof msg.enabled === 'boolean') {
        if (office.buildingEnabled !== msg.enabled) {
          office.buildingEnabled = msg.enabled;
          office.save();
        }
        for (const o of conns.values()) send(o.ws, { t: 'building', enabled: office.buildingEnabled, canBuild: canBuild(o) });
      } else if (msg.op === 'helper' && typeof msg.enabled === 'boolean') {
        // Only with a service set up: with no key it stays unavailable and cannot be switched on.
        if (!msg.enabled || helper.configured) {
          if (office.helperEnabled !== msg.enabled) {
            office.helperEnabled = msg.enabled;
            office.save();
          }
          broadcastHelper();
          for (const o of conns.values()) sendAdminState(o); // every admin's switch shows the new setting
        }
      } else if (msg.op === 'arena' && typeof msg.enabled === 'boolean') {
        if (office.arenaEnabled !== msg.enabled) {
          office.arenaEnabled = msg.enabled;
          office.save();
        }
        if (!msg.enabled) arena.shutdown();
        for (const o of conns.values()) sendAdminState(o);
      } else if (msg.op === 'areaAllowed' && areaById(String(msg.areaId)) && Array.isArray(msg.memberIds)) {
        const ids = msg.memberIds.filter(isUuid).slice(0, 200);
        office.setAreaAllowed(msg.areaId, ids.map((m) => m.toLowerCase()));
        sendAdminState(conn);
      }
    } else if (msg.t === 'chat') {
      const text = String(msg.text ?? '').trim().slice(0, 300);
      if (!text) return;
      // Chat follows where the sender stands, not who they are talking to: someone alone in a
      // meeting room still chats inside the room and never to the office. Nothing is stored, so
      // people who join later never see earlier messages.
      const input = office.linkInput();
      const ctx = positionContext(me.x, me.y, me.id, input);
      if (ctx !== 'open') {
        const out: ServerMsg = { t: 'chat', id: me.id, name: me.name, text, zone: ctx, scope: ctx.startsWith('desk:') ? 'desk' : 'area' };
        for (const c of conns.values()) {
          if (positionContext(c.p.x, c.p.y, c.p.id, input) === ctx) send(c.ws, out);
        }
      } else if (msg.to === 'nearby') {
        const members = links.conversationMembers(me.id);
        if (members.length < 2) {
          send(ws, { t: 'notify', kind: 'error', text: 'No one is nearby to hear that.' });
          return;
        }
        const out: ServerMsg = { t: 'chat', id: me.id, name: me.name, text, zone: null, scope: 'nearby' };
        for (const id of members) sendTo(id, out);
      } else {
        broadcast({ t: 'chat', id: me.id, name: me.name, text, zone: null, scope: 'office' });
      }
    } else if (msg.t === 'media') {
      // Do Not Disturb and the away statuses keep mic and camera off, even if a client asks otherwise.
      const off = devicesOff(me.status);
      me.mic = !!msg.mic && !off;
      me.cam = !!msg.cam && !off;
      if (msg.speaking !== undefined) {
        links.noteSpeaking(me.id, !!msg.speaking);
        links.update();
      }
      broadcast({ t: 'presence', id: me.id, mic: me.mic, cam: me.cam, ...(msg.speaking === undefined ? {} : { speaking: !!msg.speaking }) }, ws);
    } else if (msg.t === 'status') {
      const next = cleanStatus(msg, Date.now());
      if (!next) {
        send(ws, { t: 'notify', kind: 'error', text: 'That status is not valid, or has already run out.' });
        return;
      }
      // A tab that reconnects re-sends what it remembers; another tab may have changed it since, so that one wins.
      const sibling = msg.resume === true ? tabsOf(conn).find((o) => o !== conn) : undefined;
      const now = Date.now();
      if (sibling) {
        conn.chosen = sibling.chosen;
        applyShown(conn, now);
      } else {
        // One member, one status: every tab of a signed-in member takes it.
        for (const tab of tabsOf(conn)) {
          tab.chosen = next;
          applyShown(tab, now);
        }
      }
      links.update();
    } else if (msg.t === 'statusPrefs') {
      if (typeof msg.autoMeeting !== 'boolean' || !within('statusPrefs', me.id)) return;
      for (const tab of tabsOf(conn)) tab.autoMeeting = msg.autoMeeting;
    } else if (msg.t === 'ring') {
      const target = typeof msg.to === 'string' ? byId.get(msg.to) : undefined;
      const key = `${me.id}>${msg.to}`;
      const fail = (text: string) => send(ws, { t: 'notify', kind: 'error', text });
      if (!target || target.p.id === me.id) return fail('You cannot ring them.');
      if (Date.now() - (rings.get(key) ?? 0) < RING_COOLDOWN_MS) return fail('Give them a moment before ringing again.');
      rings.set(key, Date.now());
      sendTo(target.p.id, { t: 'notify', kind: 'ring', from: me.id, text: me.name });
      tellAway(ws, target);
    } else if (msg.t === 'ringReply') {
      const ringer = typeof msg.from === 'string' ? byId.get(msg.from) : undefined;
      const key = `${msg.from}>${me.id}`;
      const sentAt = rings.get(key);
      if (!ringer || sentAt === undefined) return; // no one rang us
      rings.delete(key);
      if (Date.now() - sentAt > RING_TTL_MS) return;
      const tell = (ok: boolean, text?: string) =>
        sendTo(ringer.p.id, { t: 'notify', kind: 'ringResult', from: me.id, ok, ...(text ? { text } : {}) });
      if (!msg.accept) return tell(false, `${me.name} is not coming over.`);
      if (arena.isPlayer(me.id)) {
        send(ws, { t: 'notify', kind: 'error', text: MATCH_REFUSED });
        return tell(false, `${me.name} is in a match.`);
      }
      const taken = new Set([...conns.values()].map((c) => `${Math.floor(c.p.x)},${Math.floor(c.p.y)}`));
      const spot = nearestFreeTileNear(ringer.p.x, ringer.p.y, taken);
      if (!spot) return tell(false, 'There is no room beside you.');
      // Accepting never gets someone into a room or desk they would otherwise be turned away from.
      const denied = office.checkEntry(me, me.x, me.y, spot.x, spot.y);
      if (denied) {
        send(ws, { t: 'notify', kind: 'error', text: `You cannot join ${ringer.p.name} there.` });
        return tell(false, `${me.name} cannot get in where you are.`);
      }
      send(ws, { t: 'teleport', ...spot, reason: 'ring' });
      tell(true);
    } else if (msg.t === 'wave') {
      const target = typeof msg.to === 'string' ? byId.get(msg.to) : undefined;
      const key = `${me.id}>${msg.to}`;
      if (!target || target.p.id === me.id || Date.now() - (lastWave.get(key) ?? 0) < WAVE_COOLDOWN_MS) return;
      lastWave.set(key, Date.now());
      sendTo(target.p.id, { t: 'notify', kind: 'wave', from: me.id, text: me.name, reply: !!msg.reply });
      tellAway(ws, target);
    } else if (msg.t === 'avatar') {
      // Each change is a broadcast and a save: past a few a second the rest are dropped.
      if (!within('avatar', me.id)) return;
      if (arena.isPlayer(me.id)) {
        send(ws, { t: 'notify', kind: 'error', text: MATCH_REFUSED });
        send(ws, { t: 'presence', id: me.id, avatar: me.avatar });
        return;
      }
      me.avatar = validateAvatarChoice(msg.avatar, sprites.index, me.look);
      office.saveCharacter(me.memberId, me.avatar);
      broadcast({ t: 'presence', id: me.id, avatar: me.avatar }); // the sender too, in case we corrected it
    } else if (msg.t === 'share') {
      if (!within('share', me.id)) return;
      const now = Date.now();
      const share = validateShareMsg(msg);
      if (!share) return;
      if (!share.on) {
        shares.stop(me.id);
        send(ws, { t: 'shareState', on: false, reason: 'stopped' });
        links.update();
        return;
      }
      if (devicesOff(me.status)) return void send(ws, { t: 'shareState', on: false, reason: me.status.kind === 'dnd' ? 'dnd' : 'status' });
      if (arena.isPlayer(me.id)) {
        send(ws, { t: 'notify', kind: 'error', text: MATCH_REFUSED });
        return void send(ws, { t: 'shareState', on: false, reason: 'arena' });
      }
      // A share the rules would end at the next tick (alone on the open floor, away from a desk) is not accepted at all.
      const origin = positionContext(me.x, me.y, me.id, office.linkInput());
      const place = placeOf(me.id);
      if (!shares.has(me.id) && place && !shareKeeps(origin, place)) {
        return void send(ws, { t: 'shareState', on: false, reason: 'left' });
      }
      const started = shares.start(me.id, share, origin, links.conversationMembers(me.id), now);
      send(ws, started.ok ? { t: 'shareState', on: true, shareId: started.shareId } : { t: 'shareState', on: false, reason: started.reason });
      links.update();
    } else if (msg.t === 'arena') {
      if (!within('arena', me.id)) return;
      const fail = (text: string | null) => text && send(ws, { t: 'notify', kind: 'error', text });
      if (msg.op === 'start' || msg.op === 'join') {
        // Joining stops a screen share first: the share cannot go on inside a match.
        if (shares.stop(me.id)) {
          send(ws, { t: 'shareState', on: false, reason: 'arena' });
          links.update();
        }
        fail(msg.op === 'start' ? arena.start(me.id) : arena.join(me.id));
      } else if (msg.op === 'leave') fail(arena.leave(me.id));
      else if (msg.op === 'begin') fail(arena.begin(me.id));
      else if (msg.op === 'stop') fail(arena.stop(me.id, conn.isAdmin));
      else if (msg.op === 'reset') fail(arena.reset(me.id));
    } else if (msg.t === 'fire') {
      if (!within('fire', me.id) || !Number.isFinite(msg.a) || !Number.isInteger(msg.seq)) return;
      arena.fire(me.id, msg.a, msg.seq);
    } else if (msg.t === 'buy') {
      if (!within('arena', me.id) || typeof msg.item !== 'string') return;
      const refused = arena.buy(me.id, msg.item);
      if (refused) send(ws, { t: 'notify', kind: 'error', text: refused });
    } else if (msg.t === 'jam' || msg.t === 'jamTrack' || msg.t === 'jamFail') {
      const adding = msg.t === 'jam' && msg.op === 'add';
      if (!perMinute.take(adding ? `jam-add:${me.id}` : `jam:${me.id}`, adding ? JAM_LIMITS.add : JAM_LIMITS.other)) {
        if (adding) send(ws, { t: 'notify', kind: 'error', text: REFUSALS.rate });
        return;
      }
      jam.handle(me.id, msg);
    } else if (msg.t === 'ink' || msg.t === 'inkClear' || msg.t === 'inkAllow') {
      handleInk(ws, me, msg);
    } else if (msg.t === 'pet' || msg.t === 'plant') {
      const refuse = (code: CompanionError) => send(ws, { t: 'companionError', code, message: COMPANION_MESSAGES[code] });
      if (me.memberId.startsWith('eph-')) return refuse('not-member');
      if (!within('companion', me.id)) return refuse('rate');
      const member = { memberId: me.memberId, name: me.name };
      if (msg.t === 'pet') {
        const err =
          msg.op === 'adopt' ? book.adopt(member, msg.kind, msg.color, msg.name)
          : msg.op === 'edit' ? book.editPet(me.memberId, { name: msg.name, color: msg.color })
          : msg.op === 'remove' ? book.removePet(me.memberId)
          : 'bad';
        if (err) return refuse(err);
        if (msg.op === 'remove') {
          petSigs.delete(me.memberId);
          broadcast({ t: 'petGone', owner: me.memberId });
        } else {
          broadcastPet(me.memberId);
        }
      } else {
        const op = msg.op;
        const r =
          op === 'add' ? book.addPlant(member, msg.kind, msg.name)
          : op === 'place' || op === 'move' || op === 'unplace' || op === 'remove' || op === 'rename'
            ? book.plantOp(me.memberId, op, msg.id, op === 'rename' ? msg.name : undefined)
            : { error: 'bad' as const };
        if ('error' in r) return refuse(r.error);
        sendPlant(r);
      }
    } else if (msg.t === 'care') {
      const r = book.care({ id: me.id, memberId: me.memberId, name: me.name, x: me.x, y: me.y, inMatch: arena.isPlayer(me.id) }, msg.target, msg.action);
      if (!r.ok) return void send(ws, { t: 'companionError', code: r.code, message: COMPANION_MESSAGES[r.code] });
      const target = 'pet' in msg.target ? { pet: msg.target.pet } : { plant: msg.target.plant };
      broadcast({
        t: 'care', target, action: msg.action, by: me.name, at: r.at, react: r.react,
        ...(r.wateredDays !== undefined ? { wateredDays: r.wateredDays } : {}), ...(r.grew ? { grew: true } : {}),
      });
    } else if (msg.t === 'rtc') {
      // Call setup only travels between people who are currently linked.
      if (rawLength > MAX_RTC_BYTES || !within('rtc', me.id, rawLength)) return;
      if (typeof msg.to !== 'string' || !links.hasLink(me.id, msg.to)) return;
      sendTo(msg.to, { t: 'rtc', from: me.id, data: msg.data });
    }
  }

  /**
   * Pen ink on a share. The server keeps no stroke: it checks who may draw, and passes the ink on to the other members of the
   * sharer's conversation at once (not on the link tick).
   */
  function handleInk(ws: WebSocket, me: PlayerState, msg: Extract<ClientMsg, { t: 'ink' | 'inkClear' | 'inkAllow' }>) {
    const points = msg.t === 'ink' && Array.isArray(msg.pts) ? msg.pts.length / 2 : 0;
    if (!within('ink', me.id, points)) {
      if (inkSlowCooldown.ready(me.id)) send(ws, { t: 'inkSlow' });
      return;
    }

    const parsed = msg.t === 'ink' ? validateInk(msg) : msg.t === 'inkClear' ? validateInkClear(msg) : validateInkAllow(msg);
    if (!parsed) return;
    const rec = shares.byId(parsed.shareId);
    if (!rec) return;
    const isSharer = me.id === rec.sharer;
    const members = links.conversationMembers(rec.sharer);
    if (!isSharer && !members.includes(me.id)) return;
    const others = members.filter((id) => id !== me.id);

    if (msg.t === 'inkAllow') {
      if (!isSharer) return;
      const allow = parsed as { shareId: string; on: boolean };
      shares.setDrawing(me.id, allow.on);
      if (!allow.on) for (const id of others) sendTo(id, { t: 'inkClear', from: me.id, shareId: rec.shareId, scope: 'all' });
      links.update();
    } else if (msg.t === 'inkClear') {
      const clear = parsed as { shareId: string; scope: 'mine' | 'all' };
      if (clear.scope === 'all' && !isSharer) return;
      for (const id of others) sendTo(id, { t: 'inkClear', from: me.id, shareId: rec.shareId, scope: clear.scope });
    } else {
      if (!rec.drawing && !isSharer) return;
      for (const id of others) sendTo(id, { t: 'ink', from: me.id, ...(parsed as ReturnType<typeof validateInk> & object) });
    }
  }

  function onClose(ws: WebSocket) {
    const c = conns.get(ws);
    if (!c) return;
    jam.leave(c.p.id, true);
    conns.delete(ws);
    byId.delete(c.p.id);
    perMinute.forget(`jam:${c.p.id}`);
    perMinute.forget(`jam-add:${c.p.id}`);
    for (const what of Object.keys(PER_SECOND)) perSecond.forget(`${what}:${c.p.id}`);
    jumpCooldown.forget(c.p.id);
    inkSlowCooldown.forget(c.p.id);
    shares.stop(c.p.id);
    book.forgetCarer(c.p.id);
    sessions.delete(c.session);
    if (arena.isPlayer(c.p.id)) arena.leave(c.p.id); // the connection is already gone, so no one is teleported
    links.remove(c.p.id);
    for (const key of [...rings.keys(), ...lastWave.keys()]) {
      if (key.startsWith(`${c.p.id}>`) || key.endsWith(`>${c.p.id}`)) {
        rings.delete(key);
        lastWave.delete(key);
      }
    }
    // Two tabs of one browser share a member id: only forget the member when their last tab goes.
    if (![...conns.values()].some((o) => o.p.memberId === c.p.memberId)) {
      office.leave(c.p.memberId);
      if (!c.p.memberId.startsWith('eph-')) book.departed(c.p.memberId);
    }
    broadcast({ t: 'leave', id: c.p.id });
    broadcastOffice();
    links.update();
    console.log(`- ${c.p.name} (${conns.size} online)`);
  }

  // Drop connections that stop answering pings (closed laptops, dead Wi-Fi).
  const pinger = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.has(ws)) {
        ws.terminate();
        continue;
      }
      alive.delete(ws);
      ws.ping();
    }
  }, opts.pingMs ?? 5000);
  pinger.unref();

  return new Promise((resolve, reject) => {
    // The WebSocket server re-emits the HTTP server's errors (listen failures included) and would throw
    // them if nobody listened, so listen there.
    wss.once('error', (err) => {
      links.stop();
      clearInterval(pinger);
      clearInterval(pruner);
      clearInterval(arenaTimer);
      clearInterval(jamTimer);
      clearInterval(seasonTimer);
      reject(err); // e.g. the port is already in use
    });
    server.listen(opts.port, () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        port,
        linkStats: () => links.stats(),
        close: () =>
          new Promise<void>((done) => {
            links.stop();
            store?.flush();
            clearInterval(pinger);
            clearInterval(pruner);
            clearInterval(arenaTimer);
            clearInterval(jamTimer);
      clearInterval(seasonTimer);
            for (const ws of wss.clients) ws.terminate();
            wss.close(() => server.close(() => done()));
          }),
      });
    });
  });
}
