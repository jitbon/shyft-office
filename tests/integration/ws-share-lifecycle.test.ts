import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { RunningServer } from '../../server/app';
import { connectClient, startTestServer, type TestClient } from './helpers';

let server: RunningServer;
let clients: TestClient[] = [];

beforeAll(async () => {
  server = await startTestServer();
});
afterEach(() => {
  clients.forEach((c) => c.close());
  clients = [];
});
afterAll(async () => {
  await server.close();
});

const START = { t: 'share', on: true, audio: false, w: 1920, h: 1080 } as const;
const Y = 19.5;

async function pair(name: string) {
  const a = await connectClient(server.port, `${name}A`);
  const b = await connectClient(server.port, `${name}B`);
  clients.push(a, b);
  a.at(15.5, Y);
  b.at(16.5, Y);
  await a.untilLinks((l) => l.some((x) => x.peer === b.id && x.kind === 'conversation'));
  await b.untilLinks((l) => l.some((x) => x.peer === a.id && x.kind === 'conversation'));
  return { a, b };
}

describe('screen share lifecycle', () => {
  it('starts, resizes and stops, and the other member sees each change', async () => {
    const { a, b } = await pair('Life');
    a.send(START);
    const ok = await a.next('shareState');
    expect(ok.on).toBe(true);
    expect(ok.shareId).toBe(`${a.id}:1`);
    const seen = await b.next('links', (m) => !!m.conversation?.shares?.length);
    expect(seen.conversation?.shares?.[0]).toMatchObject({ sharer: a.id, w: 1920, h: 1080 });

    a.send({ ...START, w: 1280 });
    expect((await a.next('shareState')).shareId).toBe(ok.shareId); // a resize keeps the same share
    const resized = await b.next('links', (m) => m.conversation?.shares?.[0]?.w === 1280);
    expect(resized.conversation?.shares?.[0].h).toBe(1080);

    a.send({ t: 'share', on: false });
    expect(await a.next('shareState')).toMatchObject({ on: false, reason: 'stopped' });
    const gone = await b.next('links', (m) => !m.conversation?.shares);
    expect(gone.conversation?.shares).toBeUndefined();
  });

  it('ends the share when the sharer walks off alone', async () => {
    const { a, b } = await pair('Walk');
    a.send(START);
    await a.next('shareState', (m) => m.on);
    await b.next('links', (m) => !!m.conversation?.shares?.length);
    a.at(40.5, Y);
    expect(await a.next('shareState', (m) => !m.on)).toMatchObject({ on: false, reason: 'left' });
    await b.next('links', (m) => !m.conversation?.shares);
  });

  it('refuses a share from someone alone on the open floor, without registering it', async () => {
    const solo = await connectClient(server.port, 'Solo');
    const other = await connectClient(server.port, 'SoloWatcher');
    clients.push(solo, other);
    solo.at(40.5, Y);
    other.at(44.5, 2.5);
    solo.send(START);
    expect(await solo.next('shareState')).toMatchObject({ on: false, reason: 'left' });
    expect(other.all('links').every((m) => !m.conversation?.shares)).toBe(true);
  });

  it('ends the share when the sharer disconnects', async () => {
    const { a, b } = await pair('Gone');
    a.send(START);
    await b.next('links', (m) => !!m.conversation?.shares?.length);
    a.close();
    await b.next('links', (m) => !m.conversation?.shares);
  });

  it('ignores a malformed share and does not echo it', async () => {
    const { a, b } = await pair('Bad');
    a.send({ t: 'share', on: true, audio: false, w: 'big', h: 10 } as never);
    a.send({ t: 'share' } as never);
    expect(await a.quiet('shareState', 300)).toEqual([]);
    expect(b.all('links').every((m) => !m.conversation?.shares)).toBe(true);
  });

  it('allows three shares among the same people and refuses a fourth until one stops', async () => {
    const room: TestClient[] = [];
    for (let i = 0; i < 4; i++) {
      const c = await connectClient(server.port, `Full${i}`);
      c.at(2.5 + i * 2, 2.5);
      room.push(c);
      clients.push(c);
    }
    await room[0].untilLinks((l) => l.length >= 3);
    for (const c of room.slice(0, 3)) {
      c.send(START);
      expect((await c.next('shareState')).on).toBe(true);
    }
    room[3].send(START);
    expect(await room[3].next('shareState')).toMatchObject({ on: false, reason: 'full' });
    room[1].send({ t: 'share', on: false });
    await room[1].next('shareState');
    room[3].send(START);
    expect((await room[3].next('shareState')).on).toBe(true);
  });
});
