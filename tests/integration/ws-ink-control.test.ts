import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RunningServer } from '../../server/app';
import { connectClient, startTestServer, type TestClient } from './helpers';

const START = { t: 'share', on: true, audio: false, w: 1920, h: 1080 } as const;
const stroke = (shareId: string, strokeId = 1, seq = 0) => ({ t: 'ink' as const, shareId, strokeId, seq, pts: [100, 100, 200, 200] });

let server: RunningServer;
let clients: TestClient[] = [];

beforeEach(async () => {
  server = await startTestServer();
});
afterEach(async () => {
  clients.forEach((c) => c.close());
  clients = [];
  await server.close();
});

/** Three people in Meeting Room A; A is sharing. */
async function room() {
  const spots = [{ x: 2.5, y: 2.5 }, { x: 4.5, y: 2.5 }, { x: 6.5, y: 2.5 }];
  const [a, b, c] = await Promise.all(spots.map(async (at, i) => {
    const cl = await connectClient(server.port, `Ink${i}`);
    cl.at(at.x, at.y);
    clients.push(cl);
    return cl;
  }));
  await a.untilLinks((l) => l.length >= 2);
  a.send(START);
  const shareId = (await a.next('shareState', (m) => m.on)).shareId!;
  for (const w of [b, c]) await w.next('links', (m) => !!m.conversation?.shares?.length);
  return { a, b, c, shareId };
}

describe('clearing ink', () => {
  it('lets the sharer clear all, and ignores that from a viewer', async () => {
    const { a, b, c, shareId } = await room();
    b.send({ t: 'inkClear', shareId, scope: 'all' });
    expect(await a.quiet('inkClear', 300)).toHaveLength(0);
    a.send({ t: 'inkClear', shareId, scope: 'all' });
    expect(await b.next('inkClear')).toMatchObject({ from: a.id, shareId, scope: 'all' });
    expect((await c.next('inkClear')).scope).toBe('all');
  });

  it('lets anyone clear their own', async () => {
    const { a, b, c, shareId } = await room();
    b.send({ t: 'inkClear', shareId, scope: 'mine' });
    expect(await a.next('inkClear')).toMatchObject({ from: b.id, scope: 'mine' });
    expect((await c.next('inkClear')).from).toBe(b.id);
  });
});

describe('turning drawing off', () => {
  it('stops other people, clears the ink at once, and lets the sharer keep drawing', async () => {
    const { a, b, c, shareId } = await room();
    a.send({ t: 'inkAllow', shareId, on: false });
    expect(await b.next('inkClear')).toMatchObject({ from: a.id, scope: 'all' });
    const off = await b.next('links', (m) => m.conversation?.shares?.[0]?.drawing === false);
    expect(off.conversation?.shares?.[0].sharer).toBe(a.id);

    b.send(stroke(shareId, 1));
    expect(await a.quiet('ink', 300)).toHaveLength(0);
    expect(await c.quiet('ink', 100)).toHaveLength(0);
    a.send(stroke(shareId, 9));
    expect((await b.next('ink')).strokeId).toBe(9);

    a.send({ t: 'inkAllow', shareId, on: true });
    await b.next('links', (m) => m.conversation?.shares?.[0]?.drawing === true);
    b.send(stroke(shareId, 2));
    expect((await a.next('ink')).strokeId).toBe(2);
  });

  it('ignores inkAllow from a viewer', async () => {
    const { a, b, shareId } = await room();
    b.send({ t: 'inkAllow', shareId, on: false });
    b.send(stroke(shareId, 3));
    expect((await a.next('ink')).strokeId).toBe(3);
    expect(a.all('inkClear')).toHaveLength(0);
  });
});

describe('the ink rate limit', () => {
  it('relays at most 40 messages a second and tells the drawer once', async () => {
    const { a, b, shareId } = await room();
    for (let i = 0; i < 60; i++) b.send(stroke(shareId, 1, i));
    await a.quiet('ink', 500);
    expect(a.all('ink').length).toBeGreaterThan(0);
    expect(a.all('ink').length).toBeLessThanOrEqual(40);
    expect(b.all('inkSlow')).toHaveLength(1);
  });
});

describe('ink slots', () => {
  it('gives every member a distinct slot', async () => {
    const { b } = await room();
    const info = b.all('links').at(-1)!.conversation!;
    const slots = Object.values(info.ink!);
    expect(Object.keys(info.ink!).sort()).toEqual([...info.members].sort());
    expect(new Set(slots).size).toBe(3);
  });
});
