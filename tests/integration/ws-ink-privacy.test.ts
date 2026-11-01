import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RunningServer } from '../../server/app';
import { connectClient, startTestServer, type TestClient } from './helpers';

// Ink on a share reaches exactly the people the share reaches: the sharer's conversation, and never the drawer back.
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
const stroke = (shareId: string, strokeId = 1) => ({ t: 'ink' as const, shareId, strokeId, seq: 0, pts: [100, 100, 200, 200] });

/** A shares and everyone who should see it has the share in their links. */
async function share(a: TestClient, watchers: TestClient[]) {
  a.send(START);
  const ok = await a.next('shareState', (m) => m.on);
  for (const w of watchers) await w.next('links', (m) => !!m.conversation?.shares?.length);
  return ok.shareId!;
}

beforeEach(async () => {
  server = await startTestServer();
});
afterEach(async () => {
  clients.forEach((c) => c.close());
  clients = [];
  await server.close();
});

describe('ink stays inside the sharer\'s conversation', () => {
  it('reaches the sharer and not someone outside the room, and never echoes to the drawer', async () => {
    const a = await join('A', IN_A);
    const b = await join('B', IN_B);
    const c = await join('C', OUTSIDE);
    await a.untilLinks((l) => l.some((x) => x.peer === b.id));
    const shareId = await share(a, [b]);
    b.send(stroke(shareId));
    const got = await a.next('ink');
    expect(got).toMatchObject({ from: b.id, shareId, strokeId: 1, seq: 0, pts: [100, 100, 200, 200] });
    expect(await c.quiet('ink', 500)).toHaveLength(0);
    expect(b.all('ink')).toHaveLength(0);
  });

  it('does not reach someone outside a locked desk', async () => {
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
    const shareId = await share(a, [b]);
    for (let i = 0; i < 4; i++) {
      c.at(NEXT_DOOR[i % 2].x, NEXT_DOOR[i % 2].y);
      b.send(stroke(shareId, i + 1));
      await wait(60);
    }
    await a.next('ink');
    expect(c.all('ink')).toHaveLength(0);
  });

  it('drops ink from an ambient-pod neighbour, who is not in the conversation', async () => {
    const a = await join('A', SEAT);
    const b = await join('B', { x: 10.5, y: 15.5 });
    await a.untilLinks((l) => l.some((x) => x.peer === b.id && x.kind === 'ambient'));
    const shareId = await share(a, []);
    b.send(stroke(shareId));
    expect(await a.quiet('ink', 500)).toHaveLength(0);
  });

  it('drops ink for a share from someone who is not in its conversation', async () => {
    const a = await join('A', IN_A);
    const b = await join('B', IN_B);
    const c = await join('C', OUTSIDE);
    await a.untilLinks((l) => l.some((x) => x.peer === b.id));
    const shareId = await share(a, [b]);
    c.send(stroke(shareId));
    expect(await a.quiet('ink', 400)).toHaveLength(0);
    expect(await b.quiet('ink', 100)).toHaveLength(0);
  });

  it('refuses ink for a share that has ended', async () => {
    const a = await join('A', IN_A);
    const b = await join('B', IN_B);
    await a.untilLinks((l) => l.some((x) => x.peer === b.id));
    const shareId = await share(a, [b]);
    a.send({ t: 'share', on: false });
    await a.next('shareState', (m) => !m.on);
    b.send(stroke(shareId));
    expect(await a.quiet('ink', 400)).toHaveLength(0);
  });

  it('does not replay ink to someone who joins later, but shows them the next stroke', async () => {
    const a = await join('A', IN_A);
    const b = await join('B', IN_B);
    const c = await join('C', FAR);
    await a.untilLinks((l) => l.some((x) => x.peer === b.id));
    const shareId = await share(a, [b]);
    b.send(stroke(shareId, 1));
    await a.next('ink');
    c.at(5.5, 4.5); // walks in
    await c.next('links', (m) => !!m.conversation?.shares?.length);
    expect(await c.quiet('ink', 400)).toHaveLength(0);
    b.send(stroke(shareId, 2));
    expect((await c.next('ink')).strokeId).toBe(2);
  });
});
