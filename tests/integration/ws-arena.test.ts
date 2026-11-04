import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startServer, type RunningServer, type ServerOptions } from '../../server/app';
import type { ServerMsg, Team } from '../../shared/protocol';
import { connectClient, startTestServer, type TestClient } from './helpers';

/** Blue stands at x 15.5 and orange at x 22.5 on the lobby's open floor, in clear lines along rows 19.5, 21.5 and 24.5. */
const SPAWNS: Record<Team, { x: number; y: number }[]> = {
  blue: [{ x: 15.5, y: 19.5 }, { x: 15.5, y: 21.5 }, { x: 15.5, y: 24.5 }],
  orange: [{ x: 22.5, y: 19.5 }, { x: 22.5, y: 21.5 }, { x: 22.5, y: 24.5 }],
};
const TIMINGS = { buyMs: 300, playMs: 20_000, roundEndMs: 200 };
const ADMIN = 'sesame';

// A round of real shooting takes seconds.
vi.setConfig({ testTimeout: 20_000 });

let servers: RunningServer[] = [];
let clients: TestClient[] = [];
afterEach(async () => {
  clients.forEach((c) => c.close());
  for (const s of servers) await s.close();
  servers = [];
  clients = [];
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, what: string, ms = 4000) {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(10);
  }
}
const last = <T>(a: T[]): T | undefined => a[a.length - 1];
const summary = (c: TestClient) => last(c.all('arena'))?.match ?? null;
const phase = (c: TestClient) => summary(c)?.phase;
const you = (c: TestClient) => last(c.all('arenaYou'));
const where = (c: TestClient) => last(c.all('teleport').filter((t) => t.reason === 'arena'))!;
/** Same spot, but in first person: the server only takes shots from there. */
const look = (c: TestClient, a = 0) => {
  const t = where(c);
  c.send({ t: 'state', x: t.x, y: t.y, a, mode: '3d', moving: false });
};

async function boot(opts: Partial<ServerOptions> = {}) {
  const server = await startTestServer({ arenaTimings: TIMINGS, arenaSpawns: SPAWNS, adminToken: ADMIN, ...opts });
  servers.push(server);
  return server;
}
async function join(server: RunningServer, names: string[], extra = {}) {
  const out: TestClient[] = [];
  for (const n of names) {
    const c = await connectClient(server.port, n, extra);
    clients.push(c);
    out.push(c);
  }
  return out;
}
/** Everyone starts, joins and the host begins. Resolves in the buy phase. */
async function begin(cs: TestClient[]) {
  cs[0].send({ t: 'arena', op: 'start' });
  await until(() => !!summary(cs[0]), 'the lobby');
  for (const c of cs.slice(1)) c.send({ t: 'arena', op: 'join' });
  await until(() => cs.every((c) => summary(c)?.alive.length === cs.length || summary(c)?.teams[cs[cs.length - 1].id]), 'everyone to join');
  cs[0].send({ t: 'arena', op: 'begin' });
  await until(() => cs.every((c) => phase(c) === 'buy'), 'the buy phase');
}
async function intoPlay(cs: TestClient[]) {
  await begin(cs);
  cs.forEach((c) => look(c));
  await until(() => cs.every((c) => phase(c) === 'play'), 'the play phase');
}
const angleTo = (from: { x: number; y: number }, to: { x: number; y: number }) => Math.atan2(to.y - from.y, to.x - from.x);
/** Keeps firing from `from` at `to` until the shooter hears they were tagged out. */
async function tag(from: TestClient, to: TestClient) {
  const a = angleTo(where(from), where(to));
  const before = from.all('arenaYou').filter((y) => y.event?.kind === 'tag' && y.event.target === to.id).length;
  for (let i = 0; i < 20; i++) {
    from.send({ t: 'fire', a, seq: i + 1 });
    await sleep(240);
    if (from.all('arenaYou').filter((y) => y.event?.kind === 'tag' && y.event.target === to.id).length > before) return;
  }
  throw new Error('never tagged out');
}

describe('starting, joining and beginning', () => {
  it('runs a lobby, refuses a second match and a full one, and begins with two teams at the spawns', async () => {
    const server = await boot();
    const cs = await join(server, ['A', 'B', 'C', 'D']);
    const [A, B, C, D] = cs;
    A.send({ t: 'arena', op: 'start' });
    await until(() => cs.every((c) => phase(c) === 'lobby'), 'the lobby on every screen');
    expect(summary(D)).toMatchObject({ host: A.id });

    B.send({ t: 'arena', op: 'start' });
    expect((await B.next('notify', (n) => n.kind === 'error')).text).toBe('A match is already running');

    for (const c of [B, C, D]) c.send({ t: 'arena', op: 'join' });
    await until(() => Object.keys(summary(A)?.teams ?? {}).length === 4, 'all four to join');

    A.send({ t: 'arena', op: 'begin' });
    await until(() => cs.every((c) => phase(c) === 'buy'), 'the buy phase');
    expect(summary(B)!.teams).toEqual({ [A.id]: 'blue', [B.id]: 'orange', [C.id]: 'blue', [D.id]: 'orange' });
    expect(where(A)).toMatchObject({ x: 15.5, y: 19.5 });
    expect(where(B)).toMatchObject({ x: 22.5, y: 19.5 });
    expect(where(C)).toMatchObject({ x: 15.5, y: 21.5 });
  });

  it('refuses an eleventh player', async () => {
    const server = await boot();
    const cs = await join(server, Array.from({ length: 11 }, (_, i) => `P${i}`));
    cs[0].send({ t: 'arena', op: 'start' });
    await until(() => !!summary(cs[0]), 'the lobby');
    cs.slice(1, 10).forEach((c) => c.send({ t: 'arena', op: 'join' }));
    await until(() => Object.keys(summary(cs[0])?.teams ?? {}).length === 10, 'ten players');
    cs[10].send({ t: 'arena', op: 'join' });
    expect((await cs[10].next('notify', (n) => n.kind === 'error')).text).toBe('The match is full');
  });

  it('does not begin with one player', async () => {
    const server = await boot();
    const [A] = await join(server, ['A']);
    A.send({ t: 'arena', op: 'start' });
    await until(() => phase(A) === 'lobby', 'the lobby');
    A.send({ t: 'arena', op: 'begin' });
    expect((await A.next('notify', (n) => n.kind === 'error')).text).toBe('You need at least 2 players');
    expect(phase(A)).toBe('lobby');
  });

  it('accepts a small move after the round-start teleport and after leaving', async () => {
    const server = await boot();
    const cs = await join(server, ['A', 'B']);
    await intoPlay(cs);
    const t = where(cs[0]);
    cs[0].send({ t: 'state', x: t.x + 0.2, y: t.y, a: 0, mode: '3d', moving: true });
    expect(await cs[0].quiet('correct', 150)).toHaveLength(0);

    cs[1].send({ t: 'arena', op: 'leave' });
    await until(() => cs[1].all('teleport').length >= 2, 'the way back');
    const back = last(cs[1].all('teleport'))!;
    cs[1].send({ t: 'state', x: back.x + 0.2, y: back.y, a: 0, mode: '2d', moving: true });
    expect(await cs[1].quiet('correct', 150)).toHaveLength(0);
  });

  it('keeps everyone still during the buy phase', async () => {
    const server = await boot({ arenaTimings: { ...TIMINGS, buyMs: 2000 } });
    const cs = await join(server, ['A', 'B']);
    await begin(cs);
    const t = where(cs[0]);
    cs[0].send({ t: 'state', x: t.x + 0.3, y: t.y, a: 0, mode: '3d', moving: true });
    expect((await cs[0].next('correct')).reason).toBe('arena');
  });

  it('puts a late joiner on the smaller team, out of the round until the next one', async () => {
    const server = await boot();
    const cs = await join(server, ['A', 'B', 'C', 'D', 'E']);
    const [A, B, , D, E] = cs;
    await intoPlay(cs.slice(0, 4));
    E.send({ t: 'arena', op: 'join' });
    await until(() => !!summary(E)?.teams[E.id], 'E to join');
    expect(summary(E)!.teams[E.id]).toBe('blue');
    expect(summary(E)!.alive).not.toContain(E.id);
    expect(E.all('teleport').filter((t) => t.reason === 'arena')).toHaveLength(0);

    E.send({ t: 'state', x: 20.5, y: 19.5, a: 0, mode: '3d', moving: false });
    E.send({ t: 'fire', a: 0, seq: 1 });
    expect((await A.quiet('arenaShot', 300)).filter((s) => s.from === E.id)).toHaveLength(0);

    await tag(A, B);
    await tag(A, D);
    await until(() => phase(E) === 'buy' && summary(E)!.round === 2, 'the next round');
    expect(summary(E)!.alive).toContain(E.id);
    expect(where(E)).toMatchObject({ x: 15.5, y: 24.5 });
  });
});

describe('firing, tag-outs and rounds', () => {
  it('decides a hit on the server, tells the shooter and the target, and ends the round when a team is out', async () => {
    const server = await boot();
    const cs = await join(server, ['A', 'B', 'C', 'D']);
    const [A, B, C, D] = cs;
    await intoPlay(cs);

    A.send({ t: 'fire', a: angleTo(where(A), where(B)), seq: 7 });
    await until(() => C.all('arenaShot').some((s) => s.from === A.id && s.hit === B.id), 'the shot on a bystander screen');
    await until(() => you(B)?.event?.kind === 'hit', 'B to be told');
    expect(you(B)).toMatchObject({ health: 82, event: { kind: 'hit', by: A.id } });
    expect(A.all('arenaYou').find((y) => y.event?.kind === 'hit')!.event).toMatchObject({ target: B.id, seq: 7 });

    await tag(A, B);
    expect(you(B)).toMatchObject({ health: 0, event: { kind: 'tagged', by: A.id } });
    expect(summary(C)!.alive).not.toContain(B.id);

    await tag(A, D);
    await until(() => summary(A)!.wins.blue === 1, 'the round to end');
    expect(summary(A)!.wins).toEqual({ blue: 1, orange: 0 });
    await until(() => last(A.all('arenaBoard'))?.rows.find((r) => r.id === A.id)?.tags === 2, 'the board');
    const row = last(B.all('arenaBoard'))!.rows.find((r) => r.id === B.id)!;
    expect(row.tagOuts).toBe(1);
  });

  it('plays to the match win', async () => {
    const server = await boot({ arenaTimings: { buyMs: 120, playMs: 20_000, roundEndMs: 100 } });
    const cs = await join(server, ['A', 'B']);
    const [A, B] = cs;
    await intoPlay(cs);
    for (let round = 1; round <= 5; round++) {
      await until(() => phase(A) === 'play' && summary(A)!.round === round, `round ${round}`);
      await tag(A, B);
      await until(() => summary(A)!.wins.blue === round, 'the round to be won');
    }
    await until(() => phase(A) === 'matchEnd', 'the match to end');
    expect(summary(A)!.wins).toEqual({ blue: 5, orange: 0 });
  }, 40_000);
});

describe('cheating', () => {
  it('limits the rate of fire to the gear and ignores shots from the tagged-out and bad angles', async () => {
    const server = await boot();
    const cs = await join(server, ['A', 'B', 'C', 'D']);
    const [A, B, C] = cs;
    await intoPlay(cs);
    const a = angleTo(where(A), where(B));
    const start = Date.now();
    for (let i = 0; i < 50; i++) A.send({ t: 'fire', a, seq: i });
    await sleep(1000 - (Date.now() - start));
    expect(C.all('arenaShot').filter((s) => s.from === A.id).length).toBeLessThanOrEqual(5);

    await tag(A, B);
    const shots = C.all('arenaShot').length;
    B.send({ t: 'fire', a: 0, seq: 1 });
    A.send({ t: 'fire', a: NaN, seq: 2 });
    A.send({ t: 'fire', a: 'north' as never, seq: 3 });
    await sleep(300);
    expect(C.all('arenaShot').length).toBe(shots);
  });

  it('corrects a move of ten tiles and many small hops that add up to a jump', async () => {
    const server = await boot();
    const cs = await join(server, ['A', 'B']);
    await intoPlay(cs);
    const t = where(cs[0]);
    cs[0].send({ t: 'state', x: t.x + 6, y: t.y, a: 0, mode: '3d', moving: true });
    expect((await cs[0].next('correct')).reason).toBe('arena');

    const before = cs[0].all('correct').length;
    for (let i = 1; i <= 40; i++) {
      cs[0].send({ t: 'state', x: t.x + i * 0.25, y: t.y, a: 0, mode: '3d', moving: true });
      await sleep(5);
    }
    await sleep(100);
    expect(cs[0].all('correct').length).toBeGreaterThan(before + 10);
  });

  it('lets a shot through nothing: a wall in the way means a miss', async () => {
    const server = await boot({
      arenaSpawns: { blue: [{ x: 14.5, y: 19.5 }], orange: [{ x: 11.5, y: 19.5 }] }, // the wall at x = 13 lies between
    });
    const cs = await join(server, ['A', 'B']);
    await intoPlay(cs);
    cs[0].send({ t: 'fire', a: Math.PI, seq: 1 });
    await until(() => cs[1].all('arenaShot').length > 0, 'the tracer');
    const shot = cs[1].all('arenaShot')[0];
    expect(shot.hit).toBeUndefined();
    expect(shot.x1).toBeGreaterThan(13.9);
    expect(you(cs[1])?.health).toBe(100);
  });

  it('refuses a walk to the desk, a ring accepted, a screen share, a character change and the builder during a match', async () => {
    const server = await boot();
    const cs = await join(server, ['A', 'B']);
    const [A, B] = cs;
    await intoPlay(cs);

    A.send({ t: 'walkToDesk' });
    expect((await A.next('notify', (n) => n.kind === 'error')).text).toBe('Not during a match');
    A.send({ t: 'ring', to: B.id });
    await B.next('notify', (n) => n.kind === 'ring');
    const before = B.all('teleport').length;
    B.send({ t: 'ringReply', from: A.id, accept: true });
    expect((await B.next('notify', (n) => n.kind === 'error')).text).toBe('Not during a match');
    expect(B.all('teleport')).toHaveLength(before);

    A.send({ t: 'share', on: true, audio: false, w: 640, h: 480 });
    expect(await A.next('shareState', (s) => s.reason === 'arena')).toMatchObject({ on: false });

    const seen = B.all('presence').length;
    A.send({ t: 'avatar', avatar: { kind: 'built-in', look: { shirt: '#111111', hair: '#222222', skin: '#f1c27d' } } });
    await sleep(200);
    expect(B.all('presence').slice(seen).filter((p) => p.avatar)).toHaveLength(0);
  });
});

describe('controls', () => {
  it('lets anyone leave back to where they stood, and only the host stop or reset', async () => {
    const server = await boot();
    const cs = await join(server, ['A', 'B', 'C']);
    const [A, B, C] = cs;
    B.at(18.5, 19.5);
    A.at(17.5, 19.5);
    C.at(19.5, 22.5);
    await sleep(100);
    await begin(cs);

    B.send({ t: 'arena', op: 'leave' });
    await until(() => B.all('teleport').length >= 2, 'B to go back');
    expect(last(B.all('teleport'))).toMatchObject({ x: 18.5, y: 19.5, reason: 'arena' });
    expect(phase(A)).toBe('buy');

    C.send({ t: 'arena', op: 'stop' });
    expect((await C.next('notify', (n) => n.kind === 'error')).text).toBe('Only the host can do that');
    C.send({ t: 'arena', op: 'reset' });
    expect((await C.next('notify', (n) => n.kind === 'error')).text).toBe('Only the host can do that');

    A.send({ t: 'arena', op: 'stop' });
    await until(() => summary(C) === null, 'the match to stop');
    expect(last(C.all('teleport'))).toMatchObject({ x: 19.5, y: 22.5, reason: 'arena' });
    expect(last(A.all('teleport'))).toMatchObject({ x: 17.5, y: 19.5, reason: 'arena' });
  });

  it('resets to round one with the scoreboard at zero', async () => {
    const server = await boot();
    const cs = await join(server, ['A', 'B']);
    await intoPlay(cs);
    await tag(cs[0], cs[1]);
    await until(() => summary(cs[0])!.wins.blue === 1, 'a win');
    cs[0].send({ t: 'arena', op: 'reset' });
    await until(() => summary(cs[1])!.round === 1 && summary(cs[1])!.wins.blue === 0, 'the reset');
    await until(() => last(cs[0].all('arenaBoard'))!.rows.every((r) => r.tags === 0 && r.money === 1000), 'a zero board');
  });

  it('hands the host to the earliest-joined player when the host disconnects', async () => {
    const server = await boot();
    const cs = await join(server, ['A', 'B', 'C']);
    cs[0].send({ t: 'arena', op: 'start' });
    await until(() => !!summary(cs[0]), 'the lobby');
    cs[1].send({ t: 'arena', op: 'join' });
    await sleep(30);
    cs[2].send({ t: 'arena', op: 'join' });
    await until(() => Object.keys(summary(cs[2])?.teams ?? {}).length === 3, 'three players');
    cs[0].close();
    await until(() => summary(cs[2])?.host === cs[1].id, 'the host to pass on');
    expect(Object.keys(summary(cs[2])!.teams)).not.toContain(cs[0].id);
  });

  it('is switched off by an admin: the match stops, starting is refused, and it stays off after a restart', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shyft-arena-'));
    const opts = { port: 0, dataDir, tickMs: 50, arenaTimings: TIMINGS, arenaSpawns: SPAWNS, adminToken: ADMIN };
    let server = await startServer(opts);
    servers.push(server);
    const [A, B, admin] = [
      ...(await join(server, ['A', 'B'])),
      await connectClient(server.port, 'Admin', { admin: ADMIN }),
    ];
    clients.push(admin);
    B.at(18.5, 19.5);
    await begin([A, B]);

    admin.send({ t: 'admin', op: 'arena', enabled: false });
    await until(() => summary(A) === null, 'the match to stop');
    expect(last(B.all('teleport'))).toMatchObject({ x: 18.5, y: 19.5, reason: 'arena' });
    expect(last(admin.all('adminState'))!.arenaEnabled).toBe(false);
    A.send({ t: 'arena', op: 'start' });
    expect((await A.next('notify', (n) => n.kind === 'error')).text).toBe('The Arena is switched off');

    clients.forEach((c) => c.close());
    await server.close();
    servers = [];
    server = await startServer(opts);
    servers.push(server);
    const again = await connectClient(server.port, 'Admin2', { admin: ADMIN });
    clients.push(again);
    await until(() => again.all('adminState').length > 0, 'admin state');
    expect(last(again.all('adminState'))!.arenaEnabled).toBe(false);
  });
});

describe('money and the shop', () => {
  const money = (c: TestClient) => you(c)?.money;

  it('refuses what cannot be afforded or bought now, and charges for the vest', async () => {
    const server = await boot({ arenaTimings: { ...TIMINGS, buyMs: 3000 } });
    const cs = await join(server, ['A', 'B']);
    const [A] = cs;
    await begin(cs);
    A.send({ t: 'buy', item: 'paint-marker' });
    await until(() => you(A)?.event?.kind === 'refused', 'a refusal');
    expect(money(A)).toBe(1000);
    A.send({ t: 'buy', item: 'rocket' });
    await until(() => A.all('arenaYou').filter((y) => y.event?.kind === 'refused').length === 2, 'a second refusal');
    A.send({ t: 'buy', item: 'cardboard-vest' });
    await until(() => you(A)?.event?.kind === 'bought', 'the vest');
    expect(you(A)).toMatchObject({ money: 400, armour: 50 });
  });

  it('refuses a purchase during play', async () => {
    const server = await boot();
    const cs = await join(server, ['A', 'B']);
    await intoPlay(cs);
    cs[0].send({ t: 'buy', item: 'cardboard-vest' });
    await until(() => you(cs[0])?.event?.kind === 'refused', 'a refusal');
    expect(money(cs[0])).toBe(1000);
  });

  it('pays for tags, wins and losses, keeps a survivor’s gear and resets the tagged-out', async () => {
    const server = await boot({ arenaTimings: { ...TIMINGS, buyMs: 600 } });
    const cs = await join(server, ['A', 'B']);
    const [A, B] = cs;
    await begin(cs);
    cs.forEach((c) => look(c));
    await until(() => phase(A) === 'play', 'play');
    await tag(A, B);
    await until(() => summary(A)!.wins.blue === 1, 'round end');
    // 1000 + 250 for the tag + 2500 for the win; the loser gets 1200.
    await until(() => money(A) === 3750 && money(B) === 2200, 'the payout');
    await until(() => phase(A) === 'buy' && summary(A)!.round === 2, 'round two');
    A.send({ t: 'buy', item: 'paint-marker' });
    await until(() => you(A)?.gear === 'paint-marker', 'the marker');
    expect(money(A)).toBe(1350);
    cs.forEach((c) => look(c));
    await until(() => phase(A) === 'play', 'play again');
    expect(you(A)?.gear).toBe('paint-marker');
    expect(you(B)?.gear).toBe('stapler');
  });
});

describe('what everyone is told', () => {
  it('sends the summary and tracers to non-players, who also hear nothing private', async () => {
    const server = await boot();
    const cs = await join(server, ['A', 'B', 'W']);
    const [A, B, W] = cs;
    await intoPlay([A, B]);
    A.send({ t: 'fire', a: angleTo(where(A), where(B)), seq: 1 });
    await until(() => W.all('arenaShot').length > 0, 'a tracer on a watcher');
    expect(summary(W)).toMatchObject({ phase: 'play' });
    expect(W.all('arenaYou')).toHaveLength(0);
    expect(W.all('arenaBoard')).toHaveLength(0);
    const msgs: ServerMsg['t'][] = W.all('arena').map((m) => m.t);
    expect(msgs.length).toBeGreaterThan(0);
  });
});
