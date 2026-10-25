import crypto from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { WebSocketServer, WebSocket } from 'ws';
import os from 'node:os';
import { currentCatalog, setCustomObjects } from '../shared/catalog';
import {
  AREAS, MAP_H, MAP_W, SPAWN, areaAt, areaById, deskAt, deskById, isBlocking, nearestFreeTile, nearestFreeTileNear, setWorld, validateOffice,
} from '../shared/map';
import { compileWorld } from '../shared/world';
import type { ClientMsg, Look, PlayerState, ServerMsg } from '../shared/protocol';
import { isMemberId, isUuid } from '../shared/member';
import { positionContext } from '../shared/proximity';
import { cleanStatus, expireStatus } from '../shared/status';
import { handleApi, type ApiContext } from './api';
import { LayoutStore } from './layout-store';
import { ObjectsStore } from './objects';
import { LinkEngine } from './links';
import { OfficeState } from './office';
import { loadSprites, noSprites, validateAvatarChoice } from './sprites';
import { StateStore, loadState } from './store';

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
  /** How often idle connections are pinged. One that misses a whole round is dropped, so a dead one goes within twice this. */
  pingMs?: number;
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

const HEX = /^#[0-9a-f]{6}$/i;
/** Call-setup frames bigger than this are dropped (SDP is a few KB). */
const MAX_RTC_BYTES = 16 * 1024;

const cleanColor = (c: unknown, fallback: string) => (typeof c === 'string' && HEX.test(c) ? c : fallback);
const cleanLook = (l: Partial<Look> | undefined): Look => ({
  shirt: cleanColor(l?.shirt, '#3fa7d6'),
  hair: cleanColor(l?.hair, '#2b1d14'),
  skin: cleanColor(l?.skin, '#f1c27d'),
});
const cleanName = (n: unknown) => String(n ?? '').trim().slice(0, 24) || 'Guest';
const num = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;

interface Conn {
  ws: WebSocket;
  p: PlayerState;
  isAdmin: boolean;
  /** Token this connection sends to the HTTP API. */
  session: string;
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
  const layouts = LayoutStore.load(dataDir);
  setWorld(compileWorld(layouts.current.layout, currentCatalog()));
  layouts.pruneDrafts();
  const pruner = setInterval(() => layouts.pruneDrafts(), 24 * 60 * 60 * 1000);
  pruner.unref();
  validateOffice();
  const store = opts.dataDir ? new StateStore(opts.dataDir) : null;
  const office: OfficeState = new OfficeState(() => [...conns.values()].map((c) => c.p), {
    state: opts.dataDir ? loadState(opts.dataDir) : undefined,
    onChange: () => store?.save(office.persistState()),
  });
  const canBuild = (c: Conn) => !c.p.memberId.startsWith('eph-') && (c.isAdmin || office.buildingEnabled);
  const apiContext: ApiContext = {
    layouts,
    objects,
    objectsChanged: () => {
      setCustomObjects(objects.list());
      broadcast({ t: 'objects', objects: objects.list() });
    },
    uploadsPerMinute: opts.uploadsPerMinute ?? 10,
    catalog: () => currentCatalog(),
    caller: (token) => {
      const c = token ? sessions.get(token) : undefined;
      return c && { memberId: c.p.memberId, name: c.p.name, isAdmin: c.isAdmin, guest: c.p.memberId.startsWith('eph-') };
    },
    buildingEnabled: () => office.buildingEnabled,
    applyPublish: (layout, by) => applyPublish(layout, by),
    publishCooldownMs: opts.publishCooldownMs ?? 2000,
    draftCooldownMs: opts.draftCooldownMs ?? 500,
  };
  const links = new LinkEngine(() => [...conns.values()].map((c) => c.p), sendTo, {}, () => office.linkInput());
  // A status with a time limit goes back to available when it runs out.
  links.beforeUpdate = () => {
    const now = Date.now();
    for (const c of conns.values()) {
      const next = expireStatus(c.p.status, now);
      if (next === c.p.status) continue;
      c.p.status = next;
      broadcast({ t: 'presence', id: c.p.id, status: next });
      if (office.deskOf(c.p.memberId)) broadcastOffice();
    }
  };
  links.start(opts.tickMs ?? 200);
  /** Rings waiting for an answer, keyed `<ringer>><recipient>`, and when each was last sent. */
  const rings = new Map<string, number>();
  const lastWave = new Map<string, number>();
  const RING_TTL_MS = 60_000;
  const RING_COOLDOWN_MS = 5_000;
  const WAVE_COOLDOWN_MS = 2_000;
  const broadcastOffice = () => broadcast({ t: 'office', ...office.snapshot() });
  const sendAdminState = (c: Conn) => {
    if (!c.isAdmin) return;
    const areaAllowed: Record<string, string[]> = {};
    for (const a of AREAS) if (a.restricted) areaAllowed[a.id] = office.allowedFor(a.id);
    send(c.ws, { t: 'adminState', areaAllowed, buildingEnabled: office.buildingEnabled });
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
    setWorld(compileWorld(rev.layout, currentCatalog()));
    // Desks that are gone lose their claim; each holder hears about it, now if online, otherwise on their next join.
    for (const { memberId, deskId } of office.reconcile().released) {
      const online = [...conns.values()].filter((c) => c.p.memberId === memberId);
      if (!online.length) office.addDeskNotice(memberId, 'removed');
      for (const c of online) send(c.ws, { t: 'notify', kind: 'deskRemoved', deskId, text: 'Your desk was removed in the latest office update.' });
    }
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
    broadcast({ t: 'layout', rev: rev.rev, by: { name: by.name }, at: rev.at });
    broadcastOffice();
    links.update();
    return rev;
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
      };
      conns.set(ws, c);
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
        canBuild: canBuild(c),
        objects: objects.list(),
      });
      sendAdminState(c);
      // Someone who lost their desk when the office was redesigned or updated hears about it once, on their first join.
      const deskNotice = office.takeDeskNotice(p.memberId);
      if (deskNotice) send(ws, { t: 'notify', kind: deskNotice === 'reset' ? 'deskReset' : 'deskRemoved', ...(deskNotice === 'removed' ? { text: 'Your desk was removed in the latest office update.' } : {}) });
      broadcast({ t: 'join', player: p }, ws);
      broadcastOffice();
      console.log(`+ ${p.name} (${conns.size} online)`);
      return;
    }
    if (!conn) return;
    const me = conn.p;

    if (msg.t === 'state') {
      const nx = num(msg.x, 0, MAP_W, me.x);
      const ny = num(msg.y, 0, MAP_H, me.y);
      const denied = office.checkEntry(me, me.x, me.y, nx, ny);
      if (denied) {
        // Keep the old position and snap the client back.
        send(ws, {
          t: 'correct', x: me.x, y: me.y, reason: denied,
          ...(denied === 'locked' ? { deskId: deskAt(nx, ny)?.id } : { areaId: areaAt(nx, ny)?.id }),
        });
        return;
      }
      const before = areaAt(me.x, me.y)?.id ?? null;
      me.x = nx;
      me.y = ny;
      me.a = num(msg.a, -1e6, 1e6, me.a);
      me.mode = msg.mode === '3d' ? '3d' : '2d';
      me.moving = !!msg.moving;
      const after = areaAt(me.x, me.y)?.id ?? null;
      if (before !== after) {
        office.noteMove(me.memberId, before, after);
        broadcastOffice();
      }
      if (office.afterMove(me)) broadcastOffice(); // leaving your desk unlocks it
      broadcast({ t: 'state', id: me.id, x: me.x, y: me.y, a: me.a, mode: me.mode, moving: me.moving }, ws);
      links.update();
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
      links.update();
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
      // Do Not Disturb keeps mic and camera off, even if a client asks otherwise.
      const dnd = me.status.kind === 'dnd';
      me.mic = !!msg.mic && !dnd;
      me.cam = !!msg.cam && !dnd;
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
      me.status = next;
      // Do Not Disturb means no mic, no camera and no calls: enforce it here, whatever the client does.
      if (next.kind === 'dnd') {
        me.mic = false;
        me.cam = false;
        broadcast({ t: 'presence', id: me.id, mic: false, cam: false });
      }
      broadcast({ t: 'presence', id: me.id, status: next });
      if (office.deskOf(me.memberId)) broadcastOffice();
      links.update();
    } else if (msg.t === 'ring') {
      const target = typeof msg.to === 'string' ? byId.get(msg.to) : undefined;
      const key = `${me.id}>${msg.to}`;
      const fail = (text: string) => send(ws, { t: 'notify', kind: 'error', text });
      if (!target || target.p.id === me.id) return fail('You cannot ring them.');
      if (Date.now() - (rings.get(key) ?? 0) < RING_COOLDOWN_MS) return fail('Give them a moment before ringing again.');
      rings.set(key, Date.now());
      sendTo(target.p.id, { t: 'notify', kind: 'ring', from: me.id, text: me.name });
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
    } else if (msg.t === 'avatar') {
      me.avatar = validateAvatarChoice(msg.avatar, sprites.index, me.look);
      broadcast({ t: 'presence', id: me.id, avatar: me.avatar }); // the sender too, in case we corrected it
    } else if (msg.t === 'rtc') {
      // Call setup only travels between people who are currently linked.
      if (rawLength > MAX_RTC_BYTES) return;
      if (typeof msg.to !== 'string' || !links.hasLink(me.id, msg.to)) return;
      sendTo(msg.to, { t: 'rtc', from: me.id, data: msg.data });
    }
  }

  function onClose(ws: WebSocket) {
    const c = conns.get(ws);
    if (!c) return;
    conns.delete(ws);
    byId.delete(c.p.id);
    sessions.delete(c.session);
    links.remove(c.p.id);
    for (const key of [...rings.keys(), ...lastWave.keys()]) {
      if (key.startsWith(`${c.p.id}>`) || key.endsWith(`>${c.p.id}`)) {
        rings.delete(key);
        lastWave.delete(key);
      }
    }
    // Two tabs of one browser share a member id: only forget the member when their last tab goes.
    if (![...conns.values()].some((o) => o.p.memberId === c.p.memberId)) office.leave(c.p.memberId);
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
            for (const ws of wss.clients) ws.terminate();
            wss.close(() => server.close(() => done()));
          }),
      });
    });
  });
}
