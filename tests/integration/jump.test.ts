import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RunningServer } from '../../server/app';
import { JUMP_COOLDOWN_MS } from '../../shared/jump';
import { connectClient, startTestServer, type TestClient } from './helpers';

let server: RunningServer;
let clients: TestClient[] = [];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const join = async (name: string) => {
  const c = await connectClient(server.port, name, { memberId: crypto.randomUUID() });
  c.at(20.5, 19.5);
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

describe('jumping', () => {
  it('is shown to the others, not echoed to the jumper, and moves nobody', async () => {
    const a = await join('A');
    const b = await join('B');
    await wait(150);
    const statesBefore = b.all('state').length;
    a.send({ t: 'jump' });
    expect(await b.next('jump')).toEqual({ t: 'jump', id: a.id });
    expect(await a.quiet('jump', 200)).toEqual([]);
    expect(b.all('state').length).toBe(statesBefore); // a jump is not a move
  });

  it('allows one jump at a time per person', async () => {
    const a = await join('A');
    const b = await join('B');
    await wait(150);
    a.send({ t: 'jump' });
    a.send({ t: 'jump' });
    a.send({ t: 'jump' });
    await wait(200);
    expect(b.all('jump')).toHaveLength(1);
    await wait(JUMP_COOLDOWN_MS);
    a.send({ t: 'jump' });
    await wait(200);
    expect(b.all('jump')).toHaveLength(2);
  });
});
