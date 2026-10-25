import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deskAt, deskById } from '../../shared/map';
import type { RunningServer } from '../../server/app';
import { connectClient, startTestServer, type TestClient } from './helpers';

// pod-1:4,12 is an inner desk: its chair at (4,12), the desk at (4,11), and the tiles at (4,10) and (4,13).
// The chairs either side, (3,12) and (5,12), belong to other desks, one tile away.
const DESK = 'pod-1:4,12';
const SEAT = { x: 4.5, y: 12.5 };
const BEHIND = { x: 4.5, y: 13.5 };
const NEXT_DOOR = [{ x: 5.5, y: 12.5 }, { x: 5.5, y: 13.5 }];

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

// A fresh server per test, so desk claims from one test never leak into the next.
beforeEach(async () => {
  server = await startTestServer({ adminToken: 'letmein' });
});
afterEach(async () => {
  clients.forEach((c) => c.close());
  clients = [];
  await server.close();
});

/** Hammers the closed desk from next door and asserts nothing reaches the person outside. */
async function expectNothingLeaks(a: TestClient, b: TestClient, c: TestClient) {
  await wait(200); // let any start-up links at the shared spawn point settle
  const linksBefore = c.all('links').length;
  for (let i = 0; i < 20; i++) {
    const at = NEXT_DOOR[i % 2];
    c.at(at.x, at.y);
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
  }
  expect(b.all('chat').filter((m) => m.scope === 'desk')).toHaveLength(20);
}

describe('a locked desk is closed to people outside it', () => {
  it('leaks nothing to the person at the next chair', async () => {
    const idA = uuid();
    const idB = uuid();
    const a = await join('A', SEAT, { memberId: idA });
    const b = await join('B', { x: 20.5, y: 19.5 }, { memberId: idB });
    const c = await join('C', { x: 20.5, y: 19.5 }, { memberId: uuid() });

    a.send({ t: 'desk', op: 'claim', deskId: DESK });
    await a.next('office', (m) => m.desks.some((d) => d.id === DESK && d.owner?.memberId === idA));
    a.send({ t: 'desk', op: 'lock' });
    await a.next('office', (m) => m.desks.some((d) => d.id === DESK && d.locked));

    // Uninvited people are turned away at the edge of the desk.
    b.at(BEHIND.x, BEHIND.y);
    expect(await b.next('correct')).toMatchObject({ reason: 'locked', deskId: DESK });

    // After an invitation B can join, and A and B form a private conversation.
    a.send({ t: 'deskInvite', memberId: idB });
    expect(await b.next('notify', (m) => m.kind === 'deskInvite')).toMatchObject({ deskId: DESK, text: 'A' });
    b.at(BEHIND.x, BEHIND.y);
    await a.untilLinks((l) => l.some((x) => x.peer === b.id));
    await b.untilLinks((l) => l.some((x) => x.peer === a.id));

    await expectNothingLeaks(a, b, c);
  });

  it('also leaks nothing when the pod is switched to cubicle mode', async () => {
    const a = await join('A', SEAT, { memberId: uuid(), admin: 'letmein' });
    const b = await join('B', BEHIND, { memberId: uuid() });
    const c = await join('C', { x: 20.5, y: 19.5 }, { memberId: uuid() });

    // In an ambient pod, A and B at one desk are seated neighbours of the same pod only by ambient links.
    a.send({ t: 'admin', op: 'podMode', podId: 'pod-1', mode: 'cubicle' });
    await a.next('office', (m) => m.pods.some((p) => p.id === 'pod-1' && p.mode === 'cubicle'));
    await a.untilLinks((l) => l.some((x) => x.peer === b.id && x.kind === 'conversation'));

    await expectNothingLeaks(a, b, c);
  });
});

describe('desk ownership', () => {
  it('lets the owner walk back to their seat, and an invited guest to a free tile beside it', async () => {
    const idA = uuid();
    const a = await join('A', SEAT, { memberId: idA });
    a.send({ t: 'desk', op: 'claim', deskId: DESK });
    await a.next('office', (m) => m.desks.some((d) => d.id === DESK));
    a.at(20.5, 19.5);
    await wait(100);
    a.send({ t: 'walkToDesk' });
    const home = await a.next('teleport');
    expect(home).toMatchObject({ x: SEAT.x, y: SEAT.y, reason: 'desk' });

    const idB = uuid();
    const b = await join('B', { x: 20.5, y: 19.5 }, { memberId: idB });
    b.send({ t: 'walkToDesk', deskId: DESK });
    expect((await b.next('notify')).text).toMatch(/not invited/);

    a.at(SEAT.x, SEAT.y);
    a.send({ t: 'desk', op: 'lock' });
    a.send({ t: 'deskInvite', memberId: idB });
    await b.next('notify', (m) => m.kind === 'deskInvite');
    b.send({ t: 'walkToDesk', deskId: DESK });
    const t = await b.next('teleport');
    expect(deskAt(t.x, t.y)?.id).toBe(deskById(DESK)!.id);
    expect(Math.floor(t.x) === 4 && Math.floor(t.y) === 12).toBe(false); // A is sitting in the chair
  });

  it('keeps claims across a server restart', async () => {
    const idA = uuid();
    const dataDir = (await import('node:fs')).mkdtempSync((await import('node:path')).join((await import('node:os')).tmpdir(), 'shyft-restart-'));
    let s = await startTestServer({ dataDir });
    let a = await connectClient(s.port, 'A', { memberId: idA });
    a.send({ t: 'desk', op: 'claim', deskId: DESK });
    await a.next('office', (m) => m.desks.some((d) => d.id === DESK));
    a.close();
    await s.close(); // flushes the pending save

    s = await startTestServer({ dataDir });
    a = await connectClient(s.port, 'A', { memberId: idA });
    const welcome = a.all('welcome')[0];
    expect(welcome.office?.desks.find((d) => d.id === DESK)).toMatchObject({ owner: { memberId: idA, online: true } });
    a.close();
    await s.close();
  });
});

describe('invitations', () => {
  it('refuses an oversized or malformed id, and treats an upper-case id as the same person', async () => {
    const idB = uuid();
    const a = await join('A', SEAT, { memberId: uuid() });
    const b = await join('B', { x: 20.5, y: 19.5 }, { memberId: idB });
    a.send({ t: 'desk', op: 'claim', deskId: DESK });
    await a.next('office', (m) => m.desks.some((d) => d.id === DESK));

    for (const bad of ['x'.repeat(50_000), 'not-an-id', 42]) {
      a.send({ t: 'deskInvite', memberId: bad as string });
      expect((await a.next('notify')).text).toMatch(/not someone you can invite/);
    }
    expect(await b.quiet('notify', 200)).toHaveLength(0);

    a.send({ t: 'deskInvite', memberId: idB.toUpperCase() });
    expect(await b.next('notify', (m) => m.kind === 'deskInvite')).toMatchObject({ deskId: DESK });
    b.send({ t: 'walkToDesk', deskId: DESK }); // only a guest may do this
    expect((await b.next('teleport')).reason).toBe('desk');
  });
});
