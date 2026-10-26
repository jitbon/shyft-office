import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RunningServer } from '../../server/app';
import { defaultLayout } from '../../shared/default-layout';
import { cloneLayout, type Layout } from '../../shared/layout';
import { compileDefault, setWorld } from '../../shared/map';
import { itemDef, withItems } from '../unit/fixtures/items';
import { api, connectClient, newMemberId, startTestServer, type TestClient } from './helpers';

// Constitution III: things on a desk change nothing about who owns it, who may enter it, or who can hear it.

const DESK = 'desk-5-13';
const SEAT = { x: 6.5, y: 12.5 };
const BEHIND = { x: 6.5, y: 11.5 };
const NEXT_DOOR = [{ x: 8.5, y: 12.5 }, { x: 8.5, y: 11.5 }];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

let server: RunningServer;
let restore: () => void;
let clients: TestClient[] = [];
const join = async (name: string, at: { x: number; y: number }, memberId = newMemberId()) => {
  const c = await connectClient(server.port, name, { memberId });
  c.at(at.x, at.y);
  clients.push(c);
  return { c, memberId };
};

/** The default office with three desk items on the top-left desk and a poster on the top wall. */
function furnished(): Layout {
  const l = cloneLayout(defaultLayout());
  for (let i = 0; i < 3; i++) l.objects.push({ id: `lamp-${i}`, kind: 'item:lamp', x: 0, y: 0, rot: 0, on: DESK, at: [0.5 + i * 0.7, 0.25] });
  l.objects.push({ id: 'poster-1', kind: 'item:poster', x: 3, y: 0, rot: 0, wall: 's' });
  return l;
}

beforeEach(async () => {
  server = await startTestServer({ publishCooldownMs: 0, draftCooldownMs: 0 });
  // The server resets the catalog to what it has stored (nothing); these test items live only in this process.
  restore = withItems([
    { id: 'lamp', def: itemDef('deskitem', { name: 'Lamp' }) },
    { id: 'poster', def: itemDef('wall', { name: 'Poster' }) },
  ]);
});
afterEach(async () => {
  clients.forEach((c) => c.close());
  clients = [];
  await server.close();
  restore();
  setWorld(compileDefault());
});

describe('a desk with things on it', () => {
  it('still keeps its lock, its invitations and its privacy', async () => {
    const builder = await join('Builder', { x: 20.5, y: 19.5 });
    expect((await api(server.port, builder.c, 'POST', '/api/publish', { baseRev: 1, layout: furnished() })).status).toBe(200);

    const a = await join('A', SEAT);
    const b = await join('B', { x: 20.5, y: 19.5 });
    const c = await join('C', { x: 20.5, y: 19.5 });
    a.c.send({ t: 'desk', op: 'claim', deskId: DESK });
    await a.c.next('office', (m) => m.desks.some((d) => d.id === DESK && d.owner?.memberId === a.memberId));
    a.c.send({ t: 'desk', op: 'lock' });
    await a.c.next('office', (m) => m.desks.some((d) => d.id === DESK && d.locked));

    // The uninvited are turned away; the invited get in and talk privately.
    b.c.at(BEHIND.x, BEHIND.y);
    expect(await b.c.next('correct')).toMatchObject({ reason: 'locked', deskId: DESK });
    a.c.send({ t: 'deskInvite', memberId: b.memberId });
    expect(await b.c.next('notify', (m) => m.kind === 'deskInvite')).toMatchObject({ deskId: DESK });
    b.c.at(BEHIND.x, BEHIND.y);
    await a.c.untilLinks((l) => l.some((x) => x.peer === b.c.id));

    // Someone at the next chair hears and sees nothing of it.
    await wait(200);
    const before = c.c.all('links').length;
    for (let i = 0; i < 12; i++) {
      const at = NEXT_DOOR[i % 2];
      c.c.at(at.x, at.y);
      a.c.send({ t: 'chat', text: `secret ${i}` });
      a.c.send({ t: 'rtc', to: c.c.id, data: { sdp: `a${i}` } });
      await wait(15);
    }
    await wait(300);
    expect(c.c.all('rtc')).toHaveLength(0);
    expect(c.c.all('chat')).toHaveLength(0);
    for (const m of c.c.all('links').slice(before)) {
      expect(m.links.map((l) => l.peer)).not.toContain(a.c.id);
      expect(m.links.map((l) => l.peer)).not.toContain(b.c.id);
    }
  });

  it('loses its items with the desk, and the owner is told, when a publish deletes the desk', async () => {
    const builder = await join('Builder', { x: 20.5, y: 19.5 });
    expect((await api(server.port, builder.c, 'POST', '/api/publish', { baseRev: 1, layout: furnished() })).status).toBe(200);
    const a = await join('A', SEAT);
    a.c.send({ t: 'desk', op: 'claim', deskId: DESK });
    await a.c.next('office', (m) => m.desks.some((d) => d.id === DESK));

    const without = furnished();
    without.objects = without.objects.filter((o) => o.id !== DESK);
    expect((await api(server.port, builder.c, 'POST', '/api/publish', { baseRev: 2, layout: without })).status).toBe(200);
    expect(await a.c.next('notify', (n) => n.kind === 'deskRemoved')).toMatchObject({ kind: 'deskRemoved' });
    const now = (await api(server.port, builder.c, 'GET', '/api/layout')).body.layout as Layout;
    expect(now.objects.some((o) => o.id.startsWith('lamp-'))).toBe(false);
    expect(now.objects.some((o) => o.id === 'poster-1')).toBe(true);
  });

  it('loses wall decor when a publish removes the wall piece it hangs on', async () => {
    const builder = await join('Builder', { x: 20.5, y: 19.5 });
    expect((await api(server.port, builder.c, 'POST', '/api/publish', { baseRev: 1, layout: furnished() })).status).toBe(200);
    const open = furnished();
    open.walls = open.walls.slice(0, 3) + ' ' + open.walls.slice(4); // tile (3, 0)
    expect((await api(server.port, builder.c, 'POST', '/api/publish', { baseRev: 2, layout: open })).status).toBe(200);
    const now = (await api(server.port, builder.c, 'GET', '/api/layout')).body.layout as Layout;
    expect(now.objects.some((o) => o.id === 'poster-1')).toBe(false);
    expect(now.objects.filter((o) => o.id.startsWith('lamp-'))).toHaveLength(3);
  });
});
