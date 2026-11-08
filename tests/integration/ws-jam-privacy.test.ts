import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RunningServer } from '../../server/app';
import { defaultLayout } from '../../shared/default-layout';
import { cloneLayout } from '../../shared/layout';
import { compileDefault, setWorld } from '../../shared/map';
import { api, connectClient, newMemberId, startTestServer, type TestClient } from './helpers';
import { KITCHEN, LOBBY, bootJam, errors, link, live, nulls, sleep, until, vid, type Clock } from './jam-helpers';

// Constitution III: people outside a Jam Room receive nothing from it.
vi.setConfig({ testTimeout: 20_000 });

let server: RunningServer;
let clock: Clock;
let clients: TestClient[] = [];
afterEach(async () => {
  clients.forEach((c) => c.close());
  clients = [];
  await server?.close();
  setWorld(compileDefault());
});

async function connect(name: string) {
  const c = await connectClient(server.port, name, { memberId: newMemberId() });
  clients.push(c);
  return c;
}
const boot = async () => ({ server, clock } = await bootJam());
const enter = async (c: TestClient) => {
  c.at(KITCHEN.x, KITCHEN.y);
  await until(() => !!live(c), 'the jam state');
};
const jamTraffic = (c: TestClient) => c.all('jam').length + c.all('jamNote').length;

describe('Jam Room privacy', () => {
  it('sends an outsider no jam or jamNote across entering, leaving and everything the others do', async () => {
    await boot();
    const [A, B, W] = [await connect('Ana'), await connect('Ben'), await connect('Walt')];
    W.at(LOBBY.x, LOBBY.y);
    await enter(A);
    await enter(B);
    A.send({ t: 'jam', op: 'add', url: link(1) });
    await until(() => !!live(B)?.queue.length, 'the song to queue');
    clock.advance(100);
    await until(() => !!live(B)?.track, 'the track to start');
    B.send({ t: 'jam', op: 'add', url: link(2) });
    A.send({ t: 'jamTrack', id: live(A)!.track!.id, len: 20 });
    await until(() => live(B)?.track?.len === 20, 'the length');
    B.send({ t: 'jam', op: 'skip' });
    await sleep(60);
    B.send({ t: 'jamFail', id: 'whatever' });
    A.at(LOBBY.x, LOBBY.y);
    await until(() => nulls(A) === 1, 'Ana to leave');
    B.at(LOBBY.x, LOBBY.y);
    await until(() => nulls(B) === 1, 'Ben to leave');
    await sleep(150);
    expect(jamTraffic(W)).toBe(0);
  });

  it('ignores an outsider’s own jam, jamTrack and jamFail, and tells only them about an add', async () => {
    await boot();
    const [A, W] = [await connect('Ana'), await connect('Walt')];
    await enter(A);
    A.send({ t: 'jam', op: 'add', url: link(1) });
    await until(() => !!live(A)?.queue.length, 'queued');
    clock.advance(100);
    await until(() => !!live(A)?.track, 'playing');
    const snapshot = JSON.stringify(live(A)!.queue) + JSON.stringify(live(A)!.track);
    const count = A.all('jam').length;
    W.at(LOBBY.x, LOBBY.y);
    const track = live(A)!.track!;
    W.send({ t: 'jam', op: 'skip' });
    W.send({ t: 'jam', op: 'remove', id: 't1' });
    W.send({ t: 'jam', op: 'add', url: link(3) });
    W.send({ t: 'jamTrack', id: track.id, len: 0 });
    W.send({ t: 'jamFail', id: track.id });
    await until(() => errors(W).length === 1, 'Walt’s refusal');
    expect(errors(W)[0]).toMatch(/not in a Jam Room/);
    await sleep(150);
    expect(A.all('jam').length).toBe(count);
    expect(A.all('jamNote')).toEqual([]);
    expect(errors(A)).toEqual([]);
    expect(JSON.stringify(live(A)!.queue) + JSON.stringify(live(A)!.track)).toBe(snapshot);
    expect(jamTraffic(W)).toBe(0);
  });

  it('keeps two Jam Rooms apart, and a member in only one', async () => {
    server = await startTestServer({ jamTimings: { tickMs: 15, gapMs: 40 }, publishCooldownMs: 0 });
    const [A, B] = [await connect('Ana'), await connect('Ben')];
    // Mark the Library as a second Jam Room, through the same publish path a builder uses.
    const layout = cloneLayout(defaultLayout());
    layout.rooms.find((r) => r.id === 'library')!.jam = true;
    expect((await api(server.port, A, 'POST', '/api/publish', { baseRev: 1, layout })).status).toBe(200);
    A.at(KITCHEN.x, KITCHEN.y);
    B.at(32.5, 22.5);
    await until(() => !!live(A) && !!live(B), 'both in their rooms');
    expect(live(A)!.room).toBe('kitchen');
    expect(live(B)!.room).toBe('library');
    expect(live(A)!.station.seed).not.toBe(live(B)!.station.seed);
    expect(live(A)!.listeners).toEqual(['Ana']);
    expect(live(B)!.listeners).toEqual(['Ben']);
  });

  it('never shows a URL, a query, a host or an adder id to anyone', async () => {
    await boot();
    const [A, B] = [await connect('Ana'), await connect('Ben')];
    await enter(A);
    await enter(B);
    for (const url of [`https://www.youtube.com/watch?v=${vid(1)}&list=PLsecret&t=99&si=tracking`, `https://youtu.be/${vid(2)}?si=zzz`, link(3)]) {
      A.send({ t: 'jam', op: 'add', url });
      await sleep(20);
    }
    await until(() => (live(B)?.queue.length ?? 0) + (live(B)?.track ? 1 : 0) === 3, 'three songs', 5000);
    clock.advance(100);
    await sleep(80);
    for (const c of [A, B]) {
      const seen = c.all('jam').filter((m) => m.room !== null) as NonNullable<ReturnType<typeof live>>[];
      for (const m of seen) {
        for (const t of [...m.queue, ...(m.track ? [m.track] : [])]) expect(t.ref).toMatch(/^[A-Za-z0-9_-]{11}$/);
      }
      const text = JSON.stringify(c.all('jam'));
      expect(text).not.toMatch(/https?:|youtube\.com|youtu\.be|PLsecret|tracking|"by"/);
    }
    // No member id travels in a jam message.
    const memberId = /[0-9a-f]{8}-[0-9a-f]{4}-/;
    expect(JSON.stringify(B.all('jam'))).not.toMatch(memberId);
  });

  it('cannot remove or skip from outside', async () => {
    await boot();
    const [A, W] = [await connect('Ana'), await connect('Walt')];
    await enter(A);
    A.send({ t: 'jam', op: 'add', url: link(1) });
    await until(() => !!live(A)?.queue.length, 'queued');
    const id = live(A)!.queue[0].id;
    W.at(LOBBY.x, LOBBY.y);
    W.send({ t: 'jam', op: 'remove', id });
    W.send({ t: 'jam', op: 'skip' });
    await sleep(120);
    expect(live(A)!.queue.length + (live(A)!.track ? 1 : 0)).toBe(1);
  });

  it('keeps players in an Office Arena match out of the jam', async () => {
    server = await startTestServer({
      jamTimings: { tickMs: 15, gapMs: 40 }, arenaTimings: { buyMs: 200, playMs: 20_000, roundEndMs: 200 },
      arenaSpawns: { blue: [{ x: 15.5, y: 19.5 }], orange: [{ x: 22.5, y: 19.5 }] },
    });
    const [A, B, C] = [await connect('Ana'), await connect('Ben'), await connect('Cy')];
    A.send({ t: 'arena', op: 'start' });
    await until(() => A.all('arena').some((m) => m.match), 'the lobby');
    B.send({ t: 'arena', op: 'join' });
    await until(() => Object.keys(B.all('arena').at(-1)?.match?.teams ?? {}).length === 2, 'B to join');
    // Ana is in a match: walking into the Kitchen makes her no listener, and she hears nothing.
    A.at(KITCHEN.x, KITCHEN.y);
    C.at(KITCHEN.x, KITCHEN.y);
    await until(() => !!live(C), 'Cy in the Kitchen');
    await sleep(120);
    expect(jamTraffic(A)).toBe(0);
    expect(live(C)!.listeners).toEqual(['Cy']);
  });

  it('tells a listener at once when they join a match', async () => {
    server = await startTestServer({
      jamTimings: { tickMs: 15, gapMs: 40 }, arenaTimings: { buyMs: 200, playMs: 20_000, roundEndMs: 200 },
      arenaSpawns: { blue: [{ x: 15.5, y: 19.5 }], orange: [{ x: 22.5, y: 19.5 }] },
    });
    const [A, C] = [await connect('Ana'), await connect('Cy')];
    for (const p of [A, C]) await enter(p);
    A.send({ t: 'arena', op: 'start' });
    await until(() => nulls(A) === 1, 'Ana to be dropped from the jam');
    await until(() => live(C)?.listeners.length === 1, 'Cy to see Ana go');
    expect(live(C)!.listeners).toEqual(['Cy']);
    await sleep(100);
    expect(nulls(A)).toBe(1);
  });
});
