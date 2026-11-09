import fs from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { RunningServer } from '../../server/app';
import { connectClient, startTestServer, type TestClient } from './helpers';

// Row 19 of the lobby (x 14-25) is open floor; Meeting Room A is a private area around (2.5, 2.5).
const Y = 19.5;
const ROOM = { x: 2.5, y: 2.5 };

let server: RunningServer;
let clients: TestClient[] = [];
const join = async (name: string, x = 15.5, y = Y, extra: Parameters<typeof connectClient>[2] = {}) => {
  const c = await connectClient(server.port, name, extra);
  c.at(x, y);
  clients.push(c);
  return c;
};
const statusOf = (who: TestClient, from: TestClient, pred: (s: any) => boolean = () => true) =>
  who.next('presence', (m) => m.id === from.id && !!m.status && pred(m.status));

beforeAll(async () => {
  server = await startTestServer();
});
afterEach(() => {
  vi.useRealTimers();
  clients.forEach((c) => c.close());
  clients = [];
});
afterAll(async () => {
  await server.close();
});

describe('statuses on the wire', () => {
  it('sends a status change to everyone', async () => {
    const a = await join('SA');
    const b = await join('SB', 20.5);
    a.send({ t: 'status', kind: 'busy' });
    expect((await statusOf(b, a)).status).toMatchObject({ kind: 'busy' });
  });

  it('stores a preset as busy, with its note and emoji, and refuses an invalid one', async () => {
    const a = await join('PA');
    const b = await join('PB', 20.5);
    a.send({ t: 'status', kind: 'available', preset: 'lunch', text: 'back at 1', emoji: '🍜', until: Date.now() + 3_600_000 });
    const got = await statusOf(b, a);
    expect(got.status).toMatchObject({ kind: 'busy', preset: 'lunch', text: 'back at 1', emoji: '🍜' });
    expect(got.status!.until).toBeGreaterThan(Date.now());

    a.send({ t: 'status', kind: 'busy', preset: 'nap' } as never);
    expect((await a.next('notify')).kind).toBe('error');
  });

  it('ignores a client-sent auto', async () => {
    const a = await join('XA');
    const b = await join('XB', 20.5);
    a.send({ t: 'status', kind: 'busy', preset: 'meeting', auto: true } as never);
    const got = await statusOf(b, a);
    expect(got.status!.auto).toBeUndefined();
  });
});

describe('automatic In a meeting', () => {
  it('shows Available people in a private room together as in a meeting, and reverts when they leave', async () => {
    const a = await join('MA', ROOM.x, ROOM.y);
    const b = await join('MB', ROOM.x + 3, ROOM.y + 1);
    const seen = await statusOf(b, a, (s) => s.preset === 'meeting');
    expect(seen.status).toMatchObject({ kind: 'busy', preset: 'meeting', auto: true });
    await statusOf(a, b, (s) => s.preset === 'meeting');

    a.at(20.5, Y);
    expect((await statusOf(b, a, (s) => s.kind === 'available')).status).toEqual({ kind: 'available' });
  });

  it('does nothing when the member turned it off, and never replaces a chosen status', async () => {
    const a = await join('NA');
    a.send({ t: 'statusPrefs', autoMeeting: false });
    const b = await join('NB');
    a.at(ROOM.x, ROOM.y);
    b.at(ROOM.x + 1, ROOM.y);
    // B (setting on) shows as in a meeting; A (setting off) stays Available.
    await statusOf(a, b, (s) => s.preset === 'meeting');
    expect(await b.quiet('presence', 300)).not.toContainEqual(expect.objectContaining({ id: a.id, status: expect.objectContaining({ preset: 'meeting' }) }));

    const c = await join('NC', 20.5);
    c.send({ t: 'status', kind: 'busy', preset: 'focus' });
    c.at(ROOM.x + 2, ROOM.y);
    await new Promise((r) => setTimeout(r, 300));
    const d = await join('ND', 20.5);
    d.at(ROOM.x + 3, ROOM.y);
    await new Promise((r) => setTimeout(r, 300));
    expect(c.all('presence').filter((m) => m.id === c.id && m.status?.preset === 'meeting')).toHaveLength(0);
  });
});

describe('what a status does', () => {
  it('forces mic and camera off, and keeps them off', async () => {
    const a = await join('DA');
    const b = await join('DB', 20.5);
    a.send({ t: 'media', mic: true, cam: false });
    await b.next('presence', (m) => m.id === a.id && m.mic === true);
    a.send({ t: 'status', kind: 'busy', preset: 'lunch' });
    expect(await b.next('presence', (m) => m.id === a.id && m.mic === false)).toMatchObject({ cam: false });
    a.send({ t: 'media', mic: true, cam: true });
    expect(await b.next('presence', (m) => m.id === a.id && m.mic === false && m.cam === false)).toBeTruthy();
  });

  it('leaves the mic alone for Focusing', async () => {
    const a = await join('FA');
    const b = await join('FB', 20.5);
    a.send({ t: 'media', mic: true, cam: false });
    await b.next('presence', (m) => m.id === a.id && m.mic === true);
    a.send({ t: 'status', kind: 'busy', preset: 'focus' });
    await statusOf(b, a, (s) => s.preset === 'focus');
    expect(b.all('presence').filter((m) => m.id === a.id && m.mic === false)).toHaveLength(0);
  });

  it('stops a screen share when an away status starts', async () => {
    const a = await join('CA');
    const b = await join('CB', 16.5);
    await a.untilLinks((l) => l.some((x) => x.peer === b.id));
    a.send({ t: 'share', on: true, audio: false, w: 1920, h: 1080 });
    expect((await a.next('shareState')).on).toBe(true);
    a.send({ t: 'status', kind: 'busy', preset: 'coffee' });
    expect(await a.next('shareState', (m) => !m.on)).toMatchObject({ reason: 'status' });
  });

  it('keeps a person with a blocking status out of conversations', async () => {
    const a = await join('LA');
    const b = await join('LB', 16.5);
    await a.untilLinks((l) => l.some((x) => x.peer === b.id));
    b.send({ t: 'status', kind: 'busy', preset: 'lunch' });
    await a.untilLinks((l) => l.length === 0);
  });

  it('tells a ringer or waver that the target is away', async () => {
    const a = await join('RA');
    const b = await join('RB', 20.5);
    b.send({ t: 'status', kind: 'busy', preset: 'lunch', text: 'back at 1', until: Date.now() + 3_600_000 });
    await statusOf(a, b);
    a.send({ t: 'ring', to: b.id });
    expect((await b.next('notify', (m) => m.kind === 'ring')).from).toBe(a.id);
    const info = await a.next('notify', (m) => m.kind === 'awayInfo');
    expect(info.text).toContain('is at lunch');
    expect(info.text).toContain('back at 1');

    b.send({ t: 'status', kind: 'busy', preset: 'focus' });
    await statusOf(a, b, (s) => s.preset === 'focus');
    a.send({ t: 'wave', to: b.id });
    expect((await a.next('notify', (m) => m.kind === 'awayInfo')).text).toContain('is focusing');

    b.send({ t: 'status', kind: 'dnd' });
    await statusOf(a, b, (s) => s.kind === 'dnd');
    const c = await join('RC', 21.5);
    c.send({ t: 'wave', to: b.id });
    expect((await c.next('notify', (m) => m.kind === 'awayInfo')).text).toContain('Do Not Disturb');
  });

  it('says nothing about a busy person', async () => {
    const a = await join('BA');
    const b = await join('BB', 20.5);
    b.send({ t: 'status', kind: 'busy' });
    await statusOf(a, b);
    a.send({ t: 'wave', to: b.id });
    await b.next('notify', (m) => m.kind === 'wave');
    expect((await a.quiet('notify', 300)).filter((m) => m.kind === 'awayInfo')).toHaveLength(0);
  });

  it('reverts a status whose time ran out, and never turns a device back on', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const a = await join('EA');
    const b = await join('EB', 20.5);
    a.send({ t: 'media', mic: true, cam: false });
    await b.next('presence', (m) => m.id === a.id && m.mic === true);
    a.send({ t: 'status', kind: 'busy', preset: 'coffee', until: Date.now() + 15 * 60_000 });
    await statusOf(b, a, (s) => s.preset === 'coffee');
    vi.setSystemTime(Date.now() + 16 * 60_000);
    expect((await statusOf(b, a, (s) => s.kind === 'available')).status).toEqual({ kind: 'available' });
    expect(b.all('presence').filter((m) => m.id === a.id && m.mic === true && m === b.all('presence').at(-1))).toHaveLength(0);
  });

  it('does not go Away by itself (no automatic Away)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const a = await join('IA');
    const b = await join('IB', 20.5);
    vi.setSystemTime(Date.now() + 2 * 3_600_000);
    expect(await b.quiet('presence', 300)).not.toContainEqual(expect.objectContaining({ id: a.id, status: expect.anything() }));
    const src = fs.readFileSync(path.resolve(import.meta.dirname, '../../src/status.ts'), 'utf8');
    expect(src).not.toMatch(/visibilitychange|document\.hidden/);
  });
});

describe('one member in two tabs', () => {
  it('applies a status to every tab of the member, and a new tab starts with it', async () => {
    const id = crypto.randomUUID();
    const t1 = await join('TabA', 15.5, Y, { memberId: id });
    const t2 = await join('TabB', 20.5, Y, { memberId: id });
    const watcher = await join('Watch', 17.5);
    t1.send({ t: 'status', kind: 'busy', preset: 'lunch' });
    expect((await statusOf(t2, t2, (s) => s.preset === 'lunch')).status).toMatchObject({ preset: 'lunch' });
    await statusOf(watcher, t1, (s) => s.preset === 'lunch');
    await statusOf(watcher, t2, (s) => s.preset === 'lunch');

    const t3 = await join('TabC', 22.5, Y, { memberId: id });
    expect((await t3.next('presence', (m) => m.id === t3.id && !!m.status)).status).toMatchObject({ preset: 'lunch' });
  });

  it('lets another tab win over a reconnecting tab\'s older status', async () => {
    const id = crypto.randomUUID();
    const t1 = await join('RTabA', 15.5, Y, { memberId: id });
    const watcher = await join('RWatch', 20.5);
    t1.send({ t: 'status', kind: 'busy', preset: 'lunch' });
    await statusOf(watcher, t1, (s) => s.preset === 'lunch');
    const t2 = await join('RTabB', 22.5, Y, { memberId: id });
    t2.send({ t: 'status', kind: 'busy', resume: true } as never); // an older Busy from before the reconnect
    await new Promise((r) => setTimeout(r, 300));
    // Everyone who looks now sees Lunch for both tabs, not the older Busy.
    const late = await join('RLate', 24.5);
    for (const tab of [t1, t2]) expect(late.players.find((p) => p.id === tab.id)?.status).toMatchObject({ preset: 'lunch' });
  });
});
