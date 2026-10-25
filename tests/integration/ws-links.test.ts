import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { RunningServer } from '../../server/app';
import { areaById } from '../../shared/map';
import { connectClient, startTestServer, type TestClient } from './helpers';

// Row 19 of the lobby (x 14-25) is open floor.
const Y = 19.5;

let server: RunningServer;
let clients: TestClient[] = [];
const join = async (name: string, x = 15.5, y = Y) => {
  const c = await connectClient(server.port, name);
  c.at(x, y);
  clients.push(c);
  return c;
};

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

describe('proximity links', () => {
  it('links two players in range, and unlinks when one walks away', async () => {
    const a = await join('A');
    const b = await join('B', 17.5);
    await a.untilLinks((l) => l.some((x) => x.peer === b.id));
    await b.untilLinks((l) => l.some((x) => x.peer === a.id));

    b.at(22.5, Y); // 7 tiles away
    await a.untilLinks((l) => l.length === 0);
    await b.untilLinks((l) => l.length === 0);
  });

  it('relays call setup only between linked players', async () => {
    const a = await join('A2');
    const b = await join('B2', 17.5);
    const c = await join('C2', 24.5);
    await a.untilLinks((l) => l.some((x) => x.peer === b.id));

    a.send({ t: 'rtc', to: b.id, data: { sdp: 'hello' } });
    const got = await b.next('rtc');
    expect(got).toMatchObject({ from: a.id, data: { sdp: 'hello' } });

    a.send({ t: 'rtc', to: c.id, data: { sdp: 'nope' } });
    expect(await c.quiet('rtc', 300)).toHaveLength(0);
  });

  it('drops oversized call-setup frames', async () => {
    const a = await join('A3');
    const b = await join('B3', 17.5);
    await a.untilLinks((l) => l.some((x) => x.peer === b.id));
    a.send({ t: 'rtc', to: b.id, data: { sdp: 'x'.repeat(20 * 1024) } });
    expect(await b.quiet('rtc', 300)).toHaveLength(0);
  });

  it('puts a third player who walks into range of either participant in the same conversation', async () => {
    const a = await join('A4');
    const b = await join('B4', 17.5);
    await a.untilLinks((l) => l.some((x) => x.peer === b.id));
    const c = await join('C4', 20.0); // 2.5 from B, 4.5 from A
    const seen = await a.next('links', (m) => m.conversation?.members.length === 3);
    expect(seen.conversation?.members.sort()).toEqual([a.id, b.id, c.id].sort());
    expect(seen.links.map((l) => l.peer)).toEqual([b.id]);
  });

  it('does not link players on either side of a wall', async () => {
    const a = await join('A5', 3.5, 17.5); // open office
    const b = await join('B5', 3.5, 19.5); // kitchen, 2 tiles away through the wall at (3,18)
    await a.quiet('links', 300);
    expect(a.links()).toEqual([]);
    expect(b.links()).toEqual([]);
  });

  it('does not churn links while someone hovers between talking range and range + 1', async () => {
    const a = await join('A6');
    const b = await join('B6', 18.4);
    await a.untilLinks((l) => l.some((x) => x.peer === b.id));
    const jitter = (async () => {
      for (let i = 0; i < 12; i++) {
        b.at(i % 2 ? 18.6 : 18.9, Y); // 3.1 and 3.4 tiles from A: over range, inside hysteresis
        await new Promise((r) => setTimeout(r, 40));
      }
    })();
    const during = await a.quiet('links', 500);
    await jitter;
    expect(during).toHaveLength(0);
    expect(a.links().map((l) => l.peer)).toEqual([b.id]);
  });

  it('delivers Nearby chat only to the sender conversation', async () => {
    const a = await join('A7');
    const b = await join('B7', 17.5);
    const far = await join('Far7', 24.5);
    await a.untilLinks((l) => l.some((x) => x.peer === b.id));

    a.send({ t: 'chat', text: 'psst', to: 'nearby' });
    const got = await b.next('chat');
    expect(got).toMatchObject({ text: 'psst', scope: 'nearby' });
    await a.next('chat', (m) => m.scope === 'nearby'); // the sender sees it too
    expect(await far.quiet('chat', 300)).toHaveLength(0);

    far.send({ t: 'chat', text: 'anyone?', to: 'nearby' });
    expect((await far.next('notify')).kind).toBe('error');
  });
});

describe('Do Not Disturb', () => {
  it('keeps a person out of conversations, and brings them back when they are available again', async () => {
    const a = await join('A8');
    const b = await join('B8', 17.5);
    await a.untilLinks((l) => l.some((x) => x.peer === b.id));

    b.send({ t: 'status', kind: 'dnd', text: 'deep work' });
    expect(await a.next('presence', (m) => m.id === b.id && m.status?.kind === 'dnd')).toMatchObject({ status: { text: 'deep work' } });
    await a.untilLinks((l) => l.length === 0);
    await b.untilLinks((l) => l.length === 0);

    // A walking right up to them still does not open a conversation.
    a.at(17.6, Y);
    expect(await a.quiet('links', 300)).toHaveLength(0);

    b.send({ t: 'status', kind: 'available' });
    await a.untilLinks((l) => l.some((x) => x.peer === b.id));
  });

  it('turns itself off when its time runs out', async () => {
    const a = await join('A9');
    const b = await join('B9', 17.5);
    b.send({ t: 'status', kind: 'dnd', until: Date.now() + 400 });
    await a.next('presence', (m) => m.status?.kind === 'dnd');
    await a.untilLinks((l) => l.length === 0);
    const back = await a.next('presence', (m) => m.id === b.id && m.status?.kind === 'available', 3000);
    expect(back.status).toEqual({ kind: 'available' });
    await a.untilLinks((l) => l.some((x) => x.peer === b.id));
  });

  it('refuses a status that has already run out, and keeps the mic off in Do Not Disturb', async () => {
    const a = await join('A10');
    const b = await join('B10', 17.5);
    b.send({ t: 'status', kind: 'dnd', until: Date.now() - 1000 });
    expect((await b.next('notify')).kind).toBe('error');
    b.send({ t: 'status', kind: 'dnd' });
    await a.next('presence', (m) => m.status?.kind === 'dnd');
    b.send({ t: 'media', mic: true, cam: true });
    expect(await a.next('presence', (m) => m.mic !== undefined && m.id === b.id)).toMatchObject({ mic: false, cam: false });
  });
});

describe('ringing and waving', () => {
  it('brings the person who accepts next to the caller, and opens a conversation', async () => {
    const a = await join('A11');
    const b = await join('B11', 24.5); // nine tiles away
    await b.quiet('links', 150);
    expect(b.links()).toEqual([]);

    a.send({ t: 'ring', to: b.id });
    expect(await b.next('notify', (m) => m.kind === 'ring')).toMatchObject({ from: a.id, text: 'A11' });
    b.send({ t: 'ringReply', from: a.id, accept: true });
    const go = await b.next('teleport');
    expect(go.reason).toBe('ring');
    expect(Math.hypot(go.x - 15.5, go.y - Y)).toBeLessThanOrEqual(1.5);
    expect(await a.next('notify', (m) => m.kind === 'ringResult')).toMatchObject({ ok: true, from: b.id });

    b.at(go.x, go.y); // the client moves itself
    await a.untilLinks((l) => l.some((x) => x.peer === b.id));
    await b.untilLinks((l) => l.some((x) => x.peer === a.id));
  });

  it('tells the caller when the ring is declined, and ignores replies to rings that never happened', async () => {
    const a = await join('A12');
    const b = await join('B12', 24.5);
    b.send({ t: 'ringReply', from: a.id, accept: true }); // nobody rang
    expect(await b.quiet('teleport', 300)).toHaveLength(0);

    a.send({ t: 'ring', to: b.id });
    await b.next('notify', (m) => m.kind === 'ring');
    b.send({ t: 'ringReply', from: a.id, accept: false });
    expect(await a.next('notify', (m) => m.kind === 'ringResult')).toMatchObject({ ok: false });
    expect(await b.quiet('teleport', 200)).toHaveLength(0);
  });

  it('limits how often one person can ring another', async () => {
    const a = await join('A13');
    const b = await join('B13', 24.5);
    a.send({ t: 'ring', to: b.id });
    await b.next('notify', (m) => m.kind === 'ring');
    a.send({ t: 'ring', to: b.id });
    expect((await a.next('notify')).kind).toBe('error');
    expect(await b.quiet('notify', 200)).toHaveLength(0);
  });

  it('never moves someone to a place they would be turned away from', async () => {
    const room = areaById('meet-b')!;
    const idA = crypto.randomUUID();
    room.restricted = true;
    room.allowed = [idA];
    try {
      const a = await connectClient(server.port, 'A14', { memberId: idA });
      clients.push(a);
      a.at(30.5, 4.5); // inside the restricted room
      const b = await join('B14', 24.5);
      await a.next('office', (m) => m.areas.find((x) => x.id === 'meet-b')?.occupants === 1);

      a.send({ t: 'ring', to: b.id });
      await b.next('notify', (m) => m.kind === 'ring');
      b.send({ t: 'ringReply', from: a.id, accept: true });
      expect((await b.next('notify')).kind).toBe('error');
      expect(await a.next('notify', (m) => m.kind === 'ringResult')).toMatchObject({ ok: false });
      expect(await b.quiet('teleport', 200)).toHaveLength(0);
    } finally {
      Object.assign(room, { restricted: false, allowed: [] });
    }
  });

  it('delivers a wave, lets the other wave back, and ignores waves sent in quick succession', async () => {
    const a = await join('A15');
    const b = await join('B15', 24.5);
    a.send({ t: 'wave', to: b.id });
    expect(await b.next('notify', (m) => m.kind === 'wave')).toMatchObject({ from: a.id, text: 'A15', reply: false });
    a.send({ t: 'wave', to: b.id });
    expect(await b.quiet('notify', 250)).toHaveLength(0);

    b.send({ t: 'wave', to: a.id, reply: true });
    expect(await a.next('notify', (m) => m.kind === 'wave')).toMatchObject({ from: b.id, reply: true });
  });
});

describe('dropped connections', () => {
  it('removes someone who goes silent, so the others see them leave and the conversation carries on', async () => {
    const quick = await startTestServer({ pingMs: 100 });
    const mine: TestClient[] = [];
    try {
      const a = await connectClient(quick.port, 'A', {});
      const b = await connectClient(quick.port, 'B', {});
      // The silent one never answers the server's pings, as if their laptop had been closed.
      const silent = await connectClient(quick.port, 'Silent', {}, { autoPong: false });
      mine.push(a, b, silent);
      a.at(15.5, Y);
      b.at(16.5, Y);
      silent.at(17.5, Y);
      await a.untilLinks((l) => l.some((x) => x.peer === silent.id) && l.some((x) => x.peer === b.id));

      const gone = await a.next('leave', (m) => m.id === silent.id, 1500);
      expect(gone.id).toBe(silent.id);
      await a.untilLinks((l) => !l.some((x) => x.peer === silent.id) && l.some((x) => x.peer === b.id));
    } finally {
      mine.forEach((c) => c.close());
      await quick.close();
    }
  });
});

