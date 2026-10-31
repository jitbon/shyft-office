import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RunningServer } from '../../server/app';
import { connectClient, startTestServer, type TestClient } from './helpers';

// A screen share reaches exactly the people the camera reaches: the members of the sharer's conversation.
// Meeting Room A is x 1-12, y 1-8; its doorway (6, 9) counts as outside.
const START = { t: 'share', on: true, audio: false, w: 1920, h: 1080 } as const;
const IN_A = { x: 2.5, y: 2.5 };
const IN_B = { x: 11.5, y: 7.5 };
const OUTSIDE = { x: 6.5, y: 9.5 };
const FAR = { x: 30.5, y: 19.5 };
const DESK = 'desk-5-13';
const SEAT = { x: 6.5, y: 12.5 };
const BEHIND = { x: 6.5, y: 11.5 };
const NEXT_DOOR = [{ x: 8.5, y: 12.5 }, { x: 8.5, y: 11.5 }];

let server: RunningServer;
let clients: TestClient[] = [];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const uuid = () => crypto.randomUUID();

const join = async (name: string, at: { x: number; y: number }, extra: Record<string, unknown> = {}) => {
  const c = await connectClient(server.port, name, extra);
  c.at(at.x, at.y);
  clients.push(c);
  return c;
};
const sharesOf = (c: TestClient, from: number) => c.all('links').slice(from).flatMap((m) => m.conversation?.shares ?? []);

beforeEach(async () => {
  server = await startTestServer();
});
afterEach(async () => {
  clients.forEach((c) => c.close());
  clients = [];
  await server.close();
});

describe('a screen share stays inside its conversation', () => {
  it('never reaches someone outside a private room', async () => {
    const a = await join('A', IN_A);
    const b = await join('B', IN_B);
    const c = await join('C', OUTSIDE);
    await a.untilLinks((l) => l.some((x) => x.peer === b.id));
    await wait(200);
    const before = c.all('links').length;
    a.send(START);
    expect((await a.next('shareState')).on).toBe(true);
    await b.next('links', (m) => !!m.conversation?.shares?.length);
    for (let i = 0; i < 3; i++) {
      c.at(i % 2 ? 3.5 : OUTSIDE.x, i % 2 ? 10.5 : OUTSIDE.y);
      await wait(120);
    }
    expect(sharesOf(c, before)).toEqual([]);
    expect(c.all('shareState')).toHaveLength(0);
  });

  it('never reaches someone outside a locked desk', async () => {
    const idA = uuid();
    const idB = uuid();
    const a = await join('A', SEAT, { memberId: idA });
    const b = await join('B', FAR, { memberId: idB });
    const c = await join('C', FAR, { memberId: uuid() });
    a.send({ t: 'desk', op: 'claim', deskId: DESK });
    await a.next('office', (m) => m.desks.some((d) => d.id === DESK && d.owner?.memberId === idA));
    a.send({ t: 'desk', op: 'lock' });
    await a.next('office', (m) => m.desks.some((d) => d.id === DESK && d.locked));
    a.send({ t: 'deskInvite', memberId: idB });
    await b.next('notify', (m) => m.kind === 'deskInvite');
    b.at(BEHIND.x, BEHIND.y);
    await a.untilLinks((l) => l.some((x) => x.peer === b.id));
    await wait(200);
    const before = c.all('links').length;

    a.send(START);
    expect((await a.next('shareState')).on).toBe(true);
    await b.next('links', (m) => !!m.conversation?.shares?.length);
    for (let i = 0; i < 6; i++) {
      c.at(NEXT_DOOR[i % 2].x, NEXT_DOOR[i % 2].y);
      await wait(60);
    }
    expect(sharesOf(c, before)).toEqual([]);
    expect(c.all('shareState')).toHaveLength(0);
  });

  it('does not reach a neighbour in an ambient pod', async () => {
    const a = await join('A', SEAT);
    const b = await join('B', { x: 10.5, y: 15.5 }); // another desk of the same pod, over three tiles away
    await a.untilLinks((l) => l.some((x) => x.peer === b.id && x.kind === 'ambient'));
    await b.untilLinks((l) => l.some((x) => x.peer === a.id && x.kind === 'ambient'));
    const before = b.all('links').length;
    a.send(START);
    expect((await a.next('shareState')).on).toBe(true);
    await wait(400);
    expect(sharesOf(b, before)).toEqual([]);
    expect(b.all('links').every((m) => m.conversation === null)).toBe(true);
  });

  it('reaches someone who joins the room, and stops reaching someone who leaves', async () => {
    const a = await join('A', IN_A);
    const b = await join('B', IN_B);
    const c = await join('C', FAR);
    await a.untilLinks((l) => l.some((x) => x.peer === b.id));
    a.send(START);
    await b.next('links', (m) => !!m.conversation?.shares?.length);

    c.at(5.5, 4.5); // walks in
    const joined = await c.next('links', (m) => !!m.conversation?.shares?.length);
    expect(joined.conversation?.shares?.[0].sharer).toBe(a.id);

    b.at(FAR.x, FAR.y - 3); // walks out
    const left = await b.next('links', (m) => !m.conversation);
    expect(left.conversation).toBeNull();
    // A's share keeps running for the people still inside.
    c.at(5.6, 4.5);
    expect(a.all('shareState').filter((m) => !m.on)).toHaveLength(0);
    expect(c.all('links').at(-1)?.conversation?.shares).toHaveLength(1);
  });

  it('ends when the sharer leaves the room, and only the sharer is told', async () => {
    const a = await join('A', IN_A);
    const b = await join('B', IN_B);
    await a.untilLinks((l) => l.some((x) => x.peer === b.id));
    a.send(START);
    await a.next('shareState', (m) => m.on);
    a.at(FAR.x, FAR.y);
    expect(await a.next('shareState', (m) => !m.on)).toMatchObject({ reason: 'left' });
    expect(b.all('shareState')).toHaveLength(0);
  });

  it('ends on Do Not Disturb', async () => {
    const a = await join('A', IN_A);
    const b = await join('B', IN_B);
    await a.untilLinks((l) => l.some((x) => x.peer === b.id));
    a.send(START);
    await a.next('shareState', (m) => m.on);
    a.send({ t: 'status', kind: 'dnd' });
    expect(await a.next('shareState', (m) => !m.on)).toMatchObject({ reason: 'dnd' });
    // And a share cannot be started while on Do Not Disturb.
    a.send(START);
    expect(await a.next('shareState')).toMatchObject({ on: false, reason: 'dnd' });
  });

  it('still drops call setup between people who are not linked', async () => {
    const a = await join('A', IN_A);
    const b = await join('B', IN_B);
    const c = await join('C', OUTSIDE);
    await a.untilLinks((l) => l.some((x) => x.peer === b.id));
    a.send(START);
    await a.next('shareState', (m) => m.on);
    c.send({ t: 'rtc', to: a.id, data: { sdp: 'sneaky' } });
    expect(await a.quiet('rtc', 300)).toHaveLength(0);
  });
});
