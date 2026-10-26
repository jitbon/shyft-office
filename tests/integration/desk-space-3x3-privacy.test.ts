import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RunningServer } from '../../server/app';
import { deskAt } from '../../shared/map';
import { connectClient, startTestServer, type TestClient } from './helpers';

// The desk space is a 3×3 block (shared/world.ts deriveDesks), and the server enforces desk privacy on exactly that block.
// desk-5-13: desk at (5..7, 13), chair at (6, 12), so its space is x 5..7, y 11..13. The column x = 8 between it and the next
// desk belongs to neither.
const DESK = 'desk-5-13';
const SEAT = { x: 6.5, y: 12.5 };
const CORNERS = [{ x: 5.5, y: 11.5 }, { x: 7.5, y: 11.5 }];
const GAP = { x: 8.5, y: 12.5 };
const FAR = { x: 20.5, y: 19.5 };

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
  server = await startTestServer({});
});
afterEach(async () => {
  clients.forEach((c) => c.close());
  clients = [];
  await server.close();
});

describe('the 3×3 desk space on the server', () => {
  it('counts the corners behind the chair as the desk, and the gap between desks as no desk', () => {
    for (const c of CORNERS) expect(deskAt(c.x, c.y)?.id, JSON.stringify(c)).toBe(DESK);
    expect(deskAt(GAP.x, GAP.y)).toBeNull();
    expect(deskAt(GAP.x, GAP.y - 1)).toBeNull();
  });

  it('turns an uninvited member away at a corner of a locked desk', async () => {
    const a = await join('A', SEAT, { memberId: uuid() });
    a.send({ t: 'desk', op: 'claim', deskId: DESK });
    await a.next('office', (m) => m.desks.some((d) => d.id === DESK && d.owner));
    a.send({ t: 'desk', op: 'lock' });
    await a.next('office', (m) => m.desks.some((d) => d.id === DESK && d.locked));
    for (const corner of CORNERS) {
      const b = await join('B', FAR, { memberId: uuid() });
      await wait(100);
      b.at(corner.x, corner.y);
      expect(await b.next('correct'), JSON.stringify(corner)).toMatchObject({ reason: 'locked', deskId: DESK });
    }
  });

  it('keeps someone standing in the gap out of the desk conversation', async () => {
    const idB = uuid();
    const a = await join('A', SEAT, { memberId: uuid() });
    const b = await join('B', FAR, { memberId: idB });
    const c = await join('C', FAR, { memberId: uuid() });
    a.send({ t: 'desk', op: 'claim', deskId: DESK });
    await a.next('office', (m) => m.desks.some((d) => d.id === DESK && d.owner));
    a.send({ t: 'desk', op: 'lock' });
    await a.next('office', (m) => m.desks.some((d) => d.id === DESK && d.locked));
    a.send({ t: 'deskInvite', memberId: idB });
    await b.next('notify', (m) => m.kind === 'deskInvite');
    b.at(CORNERS[0].x, CORNERS[0].y); // invited: the corner is inside the desk, so B joins
    await a.untilLinks((l) => l.some((x) => x.peer === b.id));

    c.at(GAP.x, GAP.y); // one tile from the desk's edge, but in no desk's space
    await wait(200);
    const before = c.all('links').length;
    for (let i = 0; i < 10; i++) {
      a.send({ t: 'chat', text: `secret ${i}` });
      a.send({ t: 'rtc', to: c.id, data: { sdp: `a${i}` } });
      await wait(15);
    }
    await wait(300);
    expect(c.all('chat')).toHaveLength(0);
    expect(c.all('rtc')).toHaveLength(0);
    for (const m of c.all('links').slice(before)) {
      expect(m.links.map((l) => l.peer)).not.toContain(a.id);
      expect(m.links.map((l) => l.peer)).not.toContain(b.id);
    }
  });
});
