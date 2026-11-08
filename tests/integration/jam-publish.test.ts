import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RunningServer } from '../../server/app';
import { defaultLayout } from '../../shared/default-layout';
import { cloneLayout, type Layout } from '../../shared/layout';
import { compileDefault, setWorld } from '../../shared/map';
import { api, connectClient, newMemberId, type TestClient } from './helpers';
import { KITCHEN, LOBBY, bootJam, link, live, nulls, sleep, until } from './jam-helpers';

vi.setConfig({ testTimeout: 20_000 });

let server: RunningServer;
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
const boot = async () => ({ server } = await bootJam({ publishCooldownMs: 0 }));
const publish = async (by: TestClient, edit: (l: Layout) => void) => {
  const layout = cloneLayout(defaultLayout());
  edit(layout);
  return api(server.port, by, 'POST', '/api/publish', { baseRev: 1, layout });
};
const room = (l: Layout, id: string) => l.rooms.find((r) => r.id === id)!;

describe('spawning in a Jam Room', () => {
  it('makes someone who joins at a spawn inside the room a listener straight away', async () => {
    await boot();
    const B = await connect('Ben');
    expect((await publish(B, (l) => (l.spawn = { x: 6, y: 21 }))).status).toBe(200);
    const A = await connect('Ana');
    await until(() => live(A)?.room === 'kitchen', 'Ana to be told');
    expect(live(A)).toMatchObject({ name: 'Kitchen', mode: 'station' });
  });
});

describe('publishing Jam Rooms', () => {
  it('makes a newly marked room a Jam Room at once, for people already standing in it', async () => {
    await boot();
    const [A, B] = [await connect('Ana'), await connect('Ben')];
    A.at(32.5, 22.5); // the Library
    B.at(LOBBY.x, LOBBY.y);
    await sleep(60);
    expect(A.all('jam')).toEqual([]);
    expect((await publish(B, (l) => (room(l, 'library').jam = true))).status).toBe(200);
    await until(() => live(A)?.room === 'library', 'Ana to be told');
    expect(live(A)).toMatchObject({ name: 'Library', mode: 'station', listeners: ['Ana'] });
    expect(B.all('jam')).toEqual([]);
  });

  it('ends the jam within a tick when the flag is removed, with a note and an empty queue', async () => {
    await boot();
    const [A, B] = [await connect('Ana'), await connect('Ben')];
    A.at(KITCHEN.x, KITCHEN.y);
    await until(() => !!live(A), 'Ana in');
    A.send({ t: 'jam', op: 'add', url: link(1) });
    await until(() => !!live(A)?.queue.length, 'queued');
    expect((await publish(B, (l) => delete room(l, 'kitchen').jam)).status).toBe(200);
    const note = await A.next('jamNote');
    expect(note.text).toMatch(/no longer a Jam Room/);
    await until(() => nulls(A) === 1, 'room:null');
    await sleep(100);
    expect(nulls(A)).toBe(1);
    // Marking it again starts afresh, with nothing queued.
    expect((await api(server.port, B, 'POST', '/api/publish', { baseRev: 2, layout: defaultLayout() })).status).toBe(200);
    await until(() => A.all('jam').length >= 3 && !!live(A) && live(A)!.room === 'kitchen' && nulls(A) === 1 && A.all('jam').at(-1)!.room === 'kitchen', 'Ana back in');
    expect(live(A)!.queue).toEqual([]);
  });

  it('ends the jam when the room is deleted', async () => {
    await boot();
    const [A, B] = [await connect('Ana'), await connect('Ben')];
    A.at(KITCHEN.x, KITCHEN.y);
    await until(() => !!live(A), 'Ana in');
    expect((await publish(B, (l) => (l.rooms = l.rooms.filter((r) => r.id !== 'kitchen')))).status).toBe(200);
    await until(() => nulls(A) === 1, 'room:null');
  });

  it('keeps a private Jam Room private: outsiders get no jam traffic', async () => {
    await boot();
    const [A, W, B] = [await connect('Ana'), await connect('Walt'), await connect('Ben')];
    W.at(LOBBY.x, LOBBY.y);
    expect((await publish(B, (l) => (room(l, 'meet-a').jam = true))).status).toBe(200);
    A.at(2.5, 2.5);
    await until(() => live(A)?.room === 'meet-a', 'Ana in the meeting room');
    A.send({ t: 'jam', op: 'add', url: link(1) });
    await until(() => !!live(A)?.queue.length, 'queued');
    A.at(LOBBY.x, LOBBY.y);
    await until(() => nulls(A) === 1, 'Ana out');
    await sleep(100);
    expect(W.all('jam')).toEqual([]);
    expect(W.all('jamNote')).toEqual([]);
    expect(room(defaultLayout(), 'meet-a').private).toBe(true);
  });
});
