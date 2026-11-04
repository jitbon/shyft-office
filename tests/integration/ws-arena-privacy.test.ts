import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RunningServer } from '../../server/app';
import type { Team } from '../../shared/protocol';
import { api, connectClient, newMemberId, startTestServer, type TestClient } from './helpers';

// Players and non-players stay apart: voice, private state, meeting rooms and desks (contracts/protocol.md "Privacy invariants").
vi.setConfig({ testTimeout: 20_000 });

const SPAWNS: Record<Team, { x: number; y: number }[]> = {
  blue: [{ x: 15.5, y: 19.5 }],
  orange: [{ x: 22.5, y: 19.5 }],
};
const TIMINGS = { buyMs: 200, playMs: 20_000, roundEndMs: 200 };

let server: RunningServer;
let clients: TestClient[] = [];
afterEach(async () => {
  clients.forEach((c) => c.close());
  clients = [];
  await server?.close();
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
const where = (c: TestClient) => last(c.all('teleport').filter((t) => t.reason === 'arena'))!;
const linkedWith = (c: TestClient, other: TestClient) => c.links().some((l) => l.peer === other.id);

async function connect(name: string, extra = {}) {
  const c = await connectClient(server.port, name, extra);
  clients.push(c);
  return c;
}
const boot = async () => {
  server = await startTestServer({ arenaTimings: TIMINGS, arenaSpawns: SPAWNS });
};

describe('Office Arena privacy', () => {
  it('never hits or tells a non-player standing in the line of fire', async () => {
    await boot();
    const [A, B, W] = [await connect('A'), await connect('B'), await connect('W')];
    W.at(19.5, 19.5);
    await sleep(100);
    A.send({ t: 'arena', op: 'start' });
    await until(() => !!summary(A), 'the lobby');
    B.send({ t: 'arena', op: 'join' });
    await until(() => Object.keys(summary(B)?.teams ?? {}).length === 2, 'B to join');
    A.send({ t: 'arena', op: 'begin' });
    await until(() => summary(A)?.phase === 'buy', 'buy');
    for (const c of [A, B]) c.send({ t: 'state', ...{ x: where(c).x, y: where(c).y }, a: 0, mode: '3d', moving: false });
    W.at(19.5, 19.5); // back in the line of fire, between A and B
    await until(() => summary(A)?.phase === 'play', 'play');

    const a = Math.atan2(where(B).y - where(A).y, where(B).x - where(A).x);
    for (let i = 0; i < 6; i++) {
      A.send({ t: 'fire', a, seq: i });
      await sleep(240);
    }
    await until(() => W.all('arenaShot').length >= 5, 'tracers on the watcher');
    expect(W.all('arenaShot').every((s) => s.hit !== W.id)).toBe(true);
    expect(W.all('arenaShot').some((s) => s.hit === B.id)).toBe(true);
    expect(W.all('arenaYou')).toHaveLength(0);
    expect(W.all('arenaBoard')).toHaveLength(0);
    expect(W.all('correct')).toHaveLength(0);
    // The summary a watcher gets has no health, money or gear.
    expect(JSON.stringify(W.all('arena'))).not.toMatch(/money|health|gear|armour/);
  });

  it('keeps players and non-players out of each other’s voice, and links them again after the player leaves', async () => {
    await boot();
    const [A, W, B] = [await connect('A'), await connect('W'), await connect('B')];
    A.at(19.5, 19.5);
    W.at(20.5, 19.5);
    B.at(19.5, 23.5);
    await A.untilLinks((ls) => ls.some((l) => l.peer === W.id));

    A.send({ t: 'arena', op: 'start' });
    await until(() => !!summary(A), 'the lobby');
    await A.untilLinks((ls) => !ls.some((l) => l.peer === W.id));
    await W.untilLinks((ls) => !ls.some((l) => l.peer === A.id));
    // Held for a while: the pair never comes back together while the match runs.
    for (let i = 0; i < 6; i++) {
      await sleep(60);
      expect(linkedWith(A, W) || linkedWith(W, A)).toBe(false);
    }

    A.send({ t: 'arena', op: 'leave' });
    await A.untilLinks((ls) => ls.some((l) => l.peer === W.id));
  });

  it('turns a player away from a meeting room and from another member’s desk', async () => {
    await boot();
    const owner = await connect('Owner', { memberId: newMemberId() });
    const A = await connect('A');
    owner.at(30.5, 22.5);
    owner.send({ t: 'desk', op: 'claim', deskId: 'desk-5-13' });
    A.at(6.5, 10.5);
    await sleep(100);
    A.send({ t: 'arena', op: 'start' });
    await until(() => !!summary(A), 'the lobby');

    A.send({ t: 'state', x: 6.5, y: 12.5, a: 0, mode: '3d', moving: true }); // into the owner's desk space
    expect((await A.next('correct')).reason).toBe('arena');

    A.send({ t: 'state', x: 6.5, y: 9.5, a: 0, mode: '3d', moving: true }); // the meeting room's doorway row
    A.send({ t: 'state', x: 6.5, y: 8.5, a: 0, mode: '3d', moving: true }); // and in
    expect((await A.next('correct', (c) => c.y > 9)).reason).toBe('arena');
  });

  it('leaves a meeting in a meeting room alone', async () => {
    await boot();
    const [M1, M2, A] = [await connect('M1'), await connect('M2'), await connect('A')];
    M1.at(5.5, 5.5);
    M2.at(7.5, 5.5);
    await M1.untilLinks((ls) => ls.some((l) => l.peer === M2.id && l.context === 'area:meet-a'));
    A.at(19.5, 19.5);
    A.send({ t: 'arena', op: 'start' });
    await until(() => !!summary(A), 'the lobby');
    for (let i = 0; i < 6; i++) {
      await sleep(60);
      expect(M1.links().some((l) => l.peer === M2.id && l.context === 'area:meet-a')).toBe(true);
    }
  });

  it('closes the builder to a player in a match', async () => {
    await boot();
    const A = await connect('A', { memberId: newMemberId() });
    expect((await api(server.port, A, 'POST', '/api/publish', {})).status).not.toBe(409);
    A.send({ t: 'arena', op: 'start' });
    await until(() => !!summary(A), 'the lobby');
    const r = await api(server.port, A, 'POST', '/api/publish', {});
    expect(r).toMatchObject({ status: 409, body: { error: 'in-match' } });
  });
});
