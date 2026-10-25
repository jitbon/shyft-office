import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { areaById } from '../../shared/map';
import type { RunningServer } from '../../server/app';
import { connectClient, startTestServer, type TestClient } from './helpers';

let server: RunningServer;
let clients: TestClient[] = [];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const join = async (name: string, x: number, y: number, memberId?: string) => {
  const c = await connectClient(server.port, name, memberId ? { memberId } : {});
  c.at(x, y);
  clients.push(c);
  return c;
};

beforeAll(async () => {
  server = await startTestServer();
});
afterEach(() => {
  clients.forEach((c) => c.close());
  clients = [];
  const b = areaById('meet-b')!;
  Object.assign(b, { capacity: undefined, restricted: false, allowed: [] });
});
afterAll(async () => {
  await server.close();
});

describe('a meeting room is closed to people outside it', () => {
  it('sends nothing to someone on the doorway tile or against the outside wall', async () => {
    // Meeting Room A is x 1-12, y 1-8. Tile (6, 9) is its doorway, which counts as outside.
    const a = await join('A', 2.5, 2.5);
    const b = await join('B', 11.5, 7.5);
    const c = await join('C', 6.5, 9.5);
    await a.untilLinks((l) => l.some((x) => x.peer === b.id));
    await b.untilLinks((l) => l.some((x) => x.peer === a.id));
    await wait(200); // let any start-up links at the shared spawn point settle
    const linksBefore = c.all('links').length;

    for (let i = 0; i < 20; i++) {
      if (i % 2) c.at(3.5, 10.5); // pressed against the outside of the south wall
      else c.at(6.5, 9.5); // the doorway
      a.send({ t: 'chat', text: `secret ${i}` });
      a.send({ t: 'rtc', to: c.id, data: { sdp: `a${i}` } });
      b.send({ t: 'rtc', to: c.id, data: { sdp: `b${i}` } });
      await wait(15);
    }
    await wait(300);

    expect(c.all('rtc')).toHaveLength(0);
    expect(c.all('chat')).toHaveLength(0);
    for (const m of c.all('links').slice(linksBefore)) {
      expect(m.links.map((l) => l.peer)).not.toContain(a.id);
      expect(m.links.map((l) => l.peer)).not.toContain(b.id);
      expect(m.conversation?.members ?? []).not.toContain(a.id);
    }
    // The people inside did hear each other.
    expect(b.all('chat').filter((m) => m.scope === 'area')).toHaveLength(20);
  });

  it('keeps the chat of someone alone in a room inside the room', async () => {
    const alone = await join('Alone', 2.5, 2.5);
    const lobby = await join('Lobby', 20.5, 19.5);
    await wait(150);
    alone.send({ t: 'chat', text: 'hello?' });
    await alone.next('chat', (m) => m.scope === 'area');
    expect(await lobby.quiet('chat', 300)).toHaveLength(0);
  });
});

describe('capacity and restricted entry', () => {
  it('snaps back someone who walks into a full area', async () => {
    areaById('meet-b')!.capacity = 1;
    const a = await join('A', 30.5, 4.5);
    await a.next('office', (m) => m.areas.find((x) => x.id === 'meet-b')?.occupants === 1);
    const b = await join('B', 31.5, 4.5);

    const fix = await b.next('correct');
    expect(fix).toMatchObject({ reason: 'full', areaId: 'meet-b' });
    await wait(150);
    // B never appeared inside the room for anyone else.
    expect(a.all('state').filter((m) => m.id === b.id && m.x > 27)).toHaveLength(0);
  });

  it('lets a knocker in only after an occupant admits them', async () => {
    const room = areaById('meet-b')!;
    const idA = crypto.randomUUID();
    const idB = crypto.randomUUID();
    room.restricted = true;
    room.allowed = [idA];

    const a = await join('A', 30.5, 4.5, idA);
    await a.next('office', (m) => m.areas.find((x) => x.id === 'meet-b')?.occupants === 1);
    const b = await join('B', 31.5, 4.5, idB);
    expect(await b.next('correct')).toMatchObject({ reason: 'restricted', areaId: 'meet-b' });

    b.send({ t: 'knock', areaId: 'meet-b' });
    const knock = await a.next('notify', (m) => m.kind === 'knock');
    expect(knock).toMatchObject({ areaId: 'meet-b', memberId: idB, text: 'B' });

    // Someone outside the room cannot answer for it.
    const c = await join('C', 20.5, 19.5);
    c.send({ t: 'admit', areaId: 'meet-b', memberId: idB, allow: true });
    expect(await b.quiet('notify', 300)).toHaveLength(0);

    a.send({ t: 'admit', areaId: 'meet-b', memberId: idB, allow: true });
    expect(await b.next('notify', (m) => m.kind === 'knockResult')).toMatchObject({ ok: true });

    b.at(31.5, 4.5);
    const moved = await a.next('state', (m) => m.id === b.id && m.x > 27);
    expect(moved.x).toBeCloseTo(31.5);
  });
});
