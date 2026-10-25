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

describe('large meeting rooms', () => {
  it('limits video to six people, favouring whoever is speaking', async () => {
    // Nine people in Meeting Room A, spread out so no one is in a proximity range.
    for (let i = 0; i < 9; i++) {
      const c = await connectClient(server.port, `P${i}`);
      c.at(2.5 + (i % 3) * 4, 2.5 + Math.floor(i / 3) * 2);
      clients.push(c);
    }
    const last = clients[8];
    const first = await clients[0].next('links', (m) => m.conversation?.members.length === 9);
    expect(first.conversation?.video).toHaveLength(6);
    expect(first.conversation?.video).not.toContain(last.id);

    last.send({ t: 'media', mic: true, cam: true, speaking: true });
    const after = await clients[0].next('links', (m) => m.conversation?.video?.[0] === last.id);
    expect(after.conversation?.video).toHaveLength(6);
  });

  it('does not limit video in a room of eight or fewer', async () => {
    for (let i = 0; i < 4; i++) {
      const c = await connectClient(server.port, `Q${i}`);
      c.at(2.5 + i * 2, 2.5);
      clients.push(c);
    }
    const msg = await clients[0].next('links', (m) => m.conversation?.members.length === 4);
    expect(msg.conversation?.video).toBeUndefined();
  });
});
