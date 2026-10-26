import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RunningServer } from '../../server/app';
import { connectClient, startTestServer, type TestClient } from './helpers';

// The desk view is drawn in the browser from where you stand. This guards that standing on a desk adds nothing on the server:
// no links, no signalling and no chat for anyone that stepping around elsewhere would not have produced (FR-006, FR-011).
const DESK = 'desk-5-13';
const SEAT = { x: 6.5, y: 12.5 };
const BEHIND = { x: 6.5, y: 11.5 };
const ELSEWHERE = { x: 20.5, y: 19.5 };
const FAR = { x: 30.5, y: 19.5 };

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

beforeEach(async () => {
  server = await startTestServer({ adminToken: 'letmein' });
});
afterEach(async () => {
  clients.forEach((c) => c.close());
  clients = [];
  await server.close();
});

describe('standing on your own desk', () => {
  it('sends nothing to anyone and links nobody', async () => {
    const a = await join('Ana', SEAT, { memberId: uuid() });
    const b = await join('Ben', FAR, { memberId: uuid() });
    a.send({ t: 'desk', op: 'claim', deskId: DESK });
    await a.next('office', (m) => m.desks.some((d) => d.id === DESK && d.owner));
    await wait(200);
    const aLinks = a.all('links').length, bLinks = b.all('links').length;

    // Step onto the seat and the ring behind it, back and forth, as someone settling at their desk would.
    for (let i = 0; i < 20; i++) {
      const at = i % 2 ? SEAT : BEHIND;
      a.at(at.x, at.y);
      await wait(15);
    }
    await wait(300);

    for (const m of a.all('links').slice(aLinks)) expect(m.links, 'a alone at their desk').toEqual([]);
    for (const m of b.all('links').slice(bLinks)) expect(m.links.map((l) => l.peer)).not.toContain(a.id);
    for (const c of [a, b]) {
      expect(c.all('rtc')).toHaveLength(0);
      expect(c.all('chat')).toHaveLength(0);
      expect(c.all('notify').filter((n) => n.kind !== 'deskReset' && n.kind !== 'deskRemoved')).toHaveLength(0);
    }
  });

  it('produces the same kinds of messages as walking about elsewhere', async () => {
    const kinds = async (spot: (i: number) => { x: number; y: number }) => {
      server = await startTestServer({ adminToken: 'letmein' });
      const a = await join('Ana', ELSEWHERE, { memberId: uuid() });
      a.send({ t: 'desk', op: 'claim', deskId: DESK });
      await a.next('office', (m) => m.desks.some((d) => d.id === DESK && d.owner));
      await wait(200);
      const seen = new Set<string>();
      const start = a.all('links').length;
      for (let i = 0; i < 12; i++) {
        const at = spot(i);
        a.at(at.x, at.y);
        await wait(15);
      }
      await wait(300);
      if (a.all('links').length > start) seen.add('links');
      for (const t of ['rtc', 'chat', 'notify', 'correct', 'teleport'] as const) if (a.all(t).length) seen.add(t);
      clients.forEach((c) => c.close());
      clients = [];
      await server.close();
      return [...seen].sort();
    };
    await server.close();
    const onDesk = await kinds((i) => (i % 2 ? SEAT : BEHIND));
    const elsewhere = await kinds((i) => ({ x: ELSEWHERE.x + (i % 2), y: ELSEWHERE.y }));
    expect(onDesk).toEqual(elsewhere);
    server = await startTestServer({ adminToken: 'letmein' }); // for afterEach
  });

  it('still keeps a locked desk closed to someone who is not invited', async () => {
    const a = await join('Ana', SEAT, { memberId: uuid() });
    a.send({ t: 'desk', op: 'claim', deskId: DESK });
    await a.next('office', (m) => m.desks.some((d) => d.id === DESK && d.owner));
    a.send({ t: 'desk', op: 'lock' });
    await a.next('office', (m) => m.desks.some((d) => d.id === DESK && d.locked));
    const b = await join('Ben', ELSEWHERE, { memberId: uuid() });
    await wait(200);
    const bLinks = b.all('links').length;
    b.at(BEHIND.x, BEHIND.y);
    expect(await b.next('correct')).toMatchObject({ reason: 'locked', deskId: DESK });
    await wait(200);
    for (const m of b.all('links').slice(bLinks)) expect(m.links.map((l) => l.peer)).not.toContain(a.id);
  });
});
