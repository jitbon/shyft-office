import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RunningServer } from '../../server/app';
import { defaultLayout } from '../../shared/default-layout';
import { cloneLayout } from '../../shared/layout';
import { compileDefault, setWorld } from '../../shared/map';
import { api, connectClient, newMemberId, startTestServer, type TestClient } from './helpers';

// Constitution III: a closed room really is closed, also when a builder redraws it while people are meeting in it.

let server: RunningServer;
let clients: TestClient[] = [];
const join = async (name: string) => {
  const c = await connectClient(server.port, name, { memberId: newMemberId() });
  clients.push(c);
  return c;
};

beforeEach(async () => {
  server = await startTestServer({ publishCooldownMs: 0, draftCooldownMs: 0 });
});
afterEach(async () => {
  clients.forEach((c) => c.close());
  clients = [];
  await server.close();
  setWorld(compileDefault());
});

describe('shrinking a meeting room while people are in it', () => {
  it('takes people who are now outside its tiles out of its conversation, chat and call setup', async () => {
    const a = await join('Ana');
    const b = await join('Ben');
    const c = await join('Cat'); // never in the room
    a.at(2.5, 2.5);
    b.at(3.5, 2.5);
    c.at(20.5, 21.5);
    await a.untilLinks((l) => l.some((x) => x.peer === b.id && x.context === 'area:meet-a'));
    await b.untilLinks((l) => l.some((x) => x.peer === a.id && x.context === 'area:meet-a'));

    // Cat redraws Meeting Room A so that it only covers the two leftmost columns.
    const smaller = cloneLayout(defaultLayout());
    smaller.rooms.find((r) => r.id === 'meet-a')!.rects = [[1, 1, 2, 8]];
    expect((await api(server.port, c, 'POST', '/api/publish', { baseRev: 1, layout: smaller })).status).toBe(200);

    await b.untilLinks((l) => !l.some((x) => x.peer === a.id), 1000);
    await a.untilLinks((l) => !l.some((x) => x.peer === b.id), 1000);

    // Ben's words and call setup no longer reach Ana, who is still inside the (smaller) room.
    b.send({ t: 'chat', text: 'secret plans', to: 'nearby' });
    b.send({ t: 'rtc', to: a.id, data: { sdp: 'x' } });
    expect(await a.quiet('chat', 400)).toEqual([]);
    expect(await a.quiet('rtc', 100)).toEqual([]);

    // Cat, outside the whole time, got nothing from the room.
    expect(c.all('chat')).toEqual([]);
    expect(c.links().some((x) => x.peer === a.id || x.peer === b.id)).toBe(false);
  });

  it('keeps a room private when it moves: people left outside do not hear the new location either', async () => {
    const a = await join('Ana');
    const b = await join('Ben');
    const c = await join('Cat');
    const moved = cloneLayout(defaultLayout());
    moved.rooms.find((r) => r.id === 'meet-b')!.rects = [[27, 1, 30, 8]]; // narrower: x 31..38 is now open floor
    expect((await api(server.port, c, 'POST', '/api/publish', { baseRev: 1, layout: moved })).status).toBe(200);
    a.at(28.5, 2.5);
    b.at(36.5, 2.5); // in the old part of the room, now outside it
    await new Promise((r) => setTimeout(r, 400));
    a.send({ t: 'chat', text: 'inside only', to: 'nearby' });
    expect(await b.quiet('chat', 400)).toEqual([]);
  });
});
