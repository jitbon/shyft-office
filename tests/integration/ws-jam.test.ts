import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RunningServer } from '../../server/app';
import { LENGTH_WAIT_MS } from '../../shared/jam';
import { connectClient, type TestClient } from './helpers';
import { KITCHEN, LOBBY, bootJam, errors, link, live, nulls, sleep, until, vid, type Clock } from './jam-helpers';

vi.setConfig({ testTimeout: 20_000 });

let server: RunningServer;
let clock: Clock;
let clients: TestClient[] = [];
afterEach(async () => {
  clients.forEach((c) => c.close());
  clients = [];
  await server?.close();
});

async function connect(name: string) {
  const c = await connectClient(server.port, name);
  clients.push(c);
  return c;
}
const boot = async () => ({ server, clock } = await bootJam());
/** Joins the Kitchen and waits for the first state. */
async function enter(c: TestClient) {
  c.at(KITCHEN.x, KITCHEN.y);
  await until(() => !!live(c), `${c.id} to be told about the jam`);
}
const track = (c: TestClient) => live(c)?.track;
const queueIds = (c: TestClient) => live(c)?.queue.map((q) => q.ref) ?? [];
/** Adds a song and waits for it to appear in the sender's queue or become the current track. */
async function add(c: TestClient, n: number) {
  c.send({ t: 'jam', op: 'add', url: link(n) });
  await until(() => queueIds(c).includes(vid(n)) || track(c)?.ref === vid(n), `song ${n} to be added`);
}
/** Moves the shared clock on and lets a few ticks pass. */
async function pass(ms: number) {
  clock.advance(ms);
  await sleep(60);
}

describe('walking into a Jam Room', () => {
  it('starts the station for you, in step with everyone else inside', async () => {
    await boot();
    const [A, B] = [await connect('Ana'), await connect('Ben')];
    await enter(A);
    const first = live(A)!;
    expect(first).toMatchObject({ room: 'kitchen', name: 'Kitchen', mode: 'station', queue: [], listeners: ['Ana'] });
    expect(first.station.seed).toBeGreaterThan(0);
    expect(first.track).toBeUndefined();
    expect(first.now).toBe(clock.now);

    await enter(B);
    expect(live(B)!.station).toEqual(first.station);
    expect(live(B)!.listeners).toEqual(['Ana', 'Ben']);
    await until(() => live(A)!.listeners.length === 2, 'Ana to see Ben');
    expect(live(A)!.listeners).toEqual(['Ana', 'Ben']);
  });

  it('sends exactly one room:null when you leave, and nothing after', async () => {
    await boot();
    const [A, B] = [await connect('Ana'), await connect('Ben')];
    await enter(A);
    await enter(B);
    B.at(LOBBY.x, LOBBY.y);
    await until(() => nulls(B) === 1, 'Ben to be told he left');
    await until(() => live(A)!.listeners.length === 1, 'Ana to see Ben go');
    const after = await B.quiet('jam', 200);
    expect(after).toEqual([]);
    expect(nulls(B)).toBe(1);
    expect(live(A)!.listeners).toEqual(['Ana']);
  });

  it('starts a fresh station with an empty queue when the last listener leaves and someone returns', async () => {
    await boot();
    const A = await connect('Ana');
    await enter(A);
    const seed = live(A)!.station.seed;
    await add(A, 1);
    A.at(LOBBY.x, LOBBY.y);
    await until(() => nulls(A) === 1, 'Ana to leave');
    clock.advance(5000);
    A.at(KITCHEN.x, KITCHEN.y);
    await until(() => !!live(A) && A.all('jam').length >= 3, 'Ana to come back');
    const again = live(A)!;
    expect(again.queue).toEqual([]);
    expect(again.track).toBeUndefined();
    expect(again.mode).toBe('station');
    expect(again.station.epoch).toBe(clock.now);
    expect(typeof seed).toBe('number');
  });

  it('survives 50 walk-ins and walk-outs, with and without a queued song (SC-006)', async () => {
    await boot();
    const [A, B] = [await connect('Ana'), await connect('Ben')];
    await enter(B);
    for (let i = 0; i < 50; i++) {
      const before = nulls(A);
      A.at(KITCHEN.x, KITCHEN.y);
      await until(() => live(A)?.listeners.includes('Ana') === true && nulls(A) === before, `Ana in, round ${i}`);
      if (i === 1 || i === 3 || i === 5) await add(A, 10 + i); // adds are limited to 6 a minute and 3 a member
      A.at(LOBBY.x, LOBBY.y);
      await until(() => nulls(A) === before + 1, `Ana out, round ${i}`);
      expect(live(B)!.listeners).toContain('Ben');
    }
    expect(nulls(A)).toBe(50);
    await sleep(100);
    expect(nulls(A)).toBe(50);
    expect(live(B)!.listeners).toContain('Ben');
  });
});

describe('queueing songs', () => {
  it('puts a song in everyone’s queue, and plays it after the gap', async () => {
    await boot();
    const [A, B] = [await connect('Ana'), await connect('Ben')];
    await enter(A);
    await enter(B);
    A.send({ t: 'jam', op: 'add', url: `https://www.youtube.com/watch?v=${vid(1)}&list=PLxx&t=5` });
    await until(() => queueIds(B).length === 1 || track(B)?.ref === vid(1), 'the song to arrive');
    // The first look at it, before the gap is up, shows it waiting.
    const waiting = B.all('jam').filter((m): m is NonNullable<ReturnType<typeof live>> => m.room !== null).find((m) => m.queue.length === 1);
    if (waiting) expect(waiting.queue[0]).toMatchObject({ ref: vid(1), title: `Title ${vid(1).slice(5)}`, byName: 'Ana', provider: 'youtube' });
    await pass(100);
    await until(() => track(B)?.ref === vid(1), 'the track to start');
    expect(track(A)).toMatchObject({ ref: vid(1), byName: 'Ana' });
    expect(live(A)!.mode).toBe('track');
    expect(live(A)!.queue).toEqual([]);
    expect(track(A)!.startedAt).toBe(track(B)!.startedAt);
  });

  it('marks only the adder’s own songs as mine, and never sends a member id', async () => {
    await boot();
    const [A, B] = [await connect('Ana'), await connect('Ben')];
    await enter(A);
    await enter(B);
    await add(A, 1);
    await pass(100);
    await until(() => track(A)?.ref === vid(1), 'track 1');
    await add(A, 2);
    await add(B, 3);
    await until(() => live(A)!.queue.length === 2 && live(B)!.queue.length === 2, 'both songs queued');
    expect(live(A)!.queue.map((q) => q.mine)).toEqual([true, false]);
    expect(live(B)!.queue.map((q) => q.mine)).toEqual([false, true]);
    expect(JSON.stringify(A.all('jam'))).not.toMatch(/"by":/);
  });

  it('ends a track at its reported length and starts the next one', async () => {
    await boot();
    const [A, B] = [await connect('Ana'), await connect('Ben')];
    await enter(A);
    await enter(B);
    await add(A, 1);
    await add(B, 2);
    await pass(100);
    await until(() => track(A)?.ref === vid(1), 'track 1');
    const id = track(A)!.id;
    A.send({ t: 'jamTrack', id, len: 30 });
    await until(() => track(B)?.len === 30, 'the length to reach Ben');
    await pass(29_000);
    expect(track(B)!.ref).toBe(vid(1));
    await pass(1100);
    await until(() => !track(B), 'track 1 to end');
    await pass(100);
    await until(() => track(B)?.ref === vid(2), 'track 2');
    expect(live(B)!.queue).toEqual([]);
  });

  it('goes back to the station when the queue runs out', async () => {
    await boot();
    const A = await connect('Ana');
    await enter(A);
    await add(A, 1);
    await pass(100);
    await until(() => track(A)?.ref === vid(1), 'track');
    A.send({ t: 'jamTrack', id: track(A)!.id, len: 6 });
    await until(() => track(A)?.len === 6, 'length');
    await pass(6100);
    await until(() => live(A)!.mode === 'station' && !track(A), 'the station to resume');
  });

  it('skips for everyone and says who skipped', async () => {
    await boot();
    const [A, B] = [await connect('Ana'), await connect('Ben')];
    await enter(A);
    await enter(B);
    await add(A, 1);
    await add(A, 2);
    await pass(100);
    await until(() => track(B)?.ref === vid(1), 'track 1');
    B.send({ t: 'jam', op: 'skip' });
    const note = await A.next('jamNote');
    expect(note.text).toBe(`Ben skipped *Title ${vid(1).slice(5)}*`);
    await pass(100);
    await until(() => track(A)?.ref === vid(2) && track(B)?.ref === vid(2), 'track 2 for both');
  });

  it('ignores skip while only the station plays', async () => {
    await boot();
    const A = await connect('Ana');
    await enter(A);
    const before = A.all('jam').length;
    A.send({ t: 'jam', op: 'skip' });
    expect(await A.quiet('jamNote', 100)).toEqual([]);
    expect(A.all('jam').length).toBe(before);
  });

  it('lets you remove your own song but not someone else’s', async () => {
    await boot();
    const [A, B] = [await connect('Ana'), await connect('Ben')];
    await enter(A);
    await enter(B);
    await add(A, 1);
    await pass(100);
    await until(() => track(A)?.ref === vid(1), 'track 1');
    await add(A, 2);
    await add(B, 3);
    await until(() => live(A)!.queue.length === 2, 'two waiting');
    const [a2, b3] = live(A)!.queue;
    B.send({ t: 'jam', op: 'remove', id: a2.id });
    await sleep(100);
    expect(live(A)!.queue.map((q) => q.ref)).toEqual([vid(2), vid(3)]);
    B.send({ t: 'jam', op: 'remove', id: b3.id });
    await until(() => live(A)!.queue.length === 1, 'Ben’s song to go');
    A.send({ t: 'jam', op: 'remove', id: a2.id });
    await until(() => live(A)!.queue.length === 0, 'Ana’s song to go');
  });

  it('refuses in plain words, and changes nothing', async () => {
    await boot();
    const [A, B] = [await connect('Ana'), await connect('Ben')];
    await enter(A);
    await enter(B);
    const state = () => JSON.stringify(live(B)!.queue);
    const empty = state();
    const tries: [string, RegExp][] = [
      ['not a link at all', /link/i],
      ['https://vimeo.com/12345678', /YouTube/],
      [link(900), /not be found|cannot be played/],
      [link(901), /look that song up/],
    ];
    for (const [url, re] of tries) {
      const before = errors(A).length;
      A.send({ t: 'jam', op: 'add', url });
      await until(() => errors(A).length === before + 1, `a refusal for ${url}`);
      expect(errors(A).at(-1)).toMatch(re);
    }
    await sleep(60);
    expect(state()).toBe(empty);
    expect(errors(B)).toEqual([]);
  });

  it('holds the per-member cap of 3 and the queue cap of 20', async () => {
    await boot();
    const [A, B] = [await connect('Ana'), await connect('Ben')];
    await enter(A);
    await enter(B);
    // The first song starts playing, then the queue fills.
    await add(A, 1);
    await pass(100);
    await until(() => track(A)?.ref === vid(1), 'track 1');
    for (const n of [2, 3, 4]) await add(A, n);
    const before = errors(A).length;
    A.send({ t: 'jam', op: 'add', url: link(5) });
    await until(() => errors(A).length === before + 1, 'the member cap');
    expect(errors(A).at(-1)).toMatch(/3 songs/);
    expect(live(A)!.queue).toHaveLength(3);
  });

  it('refuses the 21st song', async () => {
    await boot();
    // Many members, since each may add 3: use 7 clients.
    const people = await Promise.all(Array.from({ length: 7 }, (_, i) => connect(`P${i}`)));
    for (const p of people) await enter(p);
    let n = 1;
    for (const p of people.slice(0, 6)) for (let k = 0; k < 3; k++) {
      p.send({ t: 'jam', op: 'add', url: link(n++) });
      await sleep(5);
    }
    await until(() => (live(people[0])!.queue.length + (track(people[0]) ? 1 : 0)) === 18, 'eighteen songs', 5000);
    const last = people[6];
    for (const m of [19, 20, 21]) last.send({ t: 'jam', op: 'add', url: link(m) });
    await until(() => errors(last).length >= 1, 'a refusal', 5000);
    expect(errors(last).at(-1)).toMatch(/queue is full|3 songs/);
  });

  it('only lets listeners add: an outsider is told they are not in a Jam Room', async () => {
    await boot();
    const [A, W] = [await connect('Ana'), await connect('Walt')];
    await enter(A);
    W.at(LOBBY.x, LOBBY.y);
    W.send({ t: 'jam', op: 'add', url: link(1) });
    await until(() => errors(W).length === 1, 'Walt to be told');
    expect(errors(W)[0]).toMatch(/not in a Jam Room/);
    await sleep(60);
    expect(live(A)!.queue).toEqual([]);
    expect(errors(A)).toEqual([]);
  });
});

describe('songs that cannot be played', () => {
  async function playing(n: number, names: string[]) {
    const people: TestClient[] = [];
    for (const name of names) people.push(await connect(name));
    for (const p of people) await enter(p);
    await add(people[0], n);
    await pass(100);
    await until(() => track(people[0])?.ref === vid(n), 'the track to start');
    return people;
  }

  it('skips when more than half of the listeners report a failure', async () => {
    await boot();
    const [A, B, C] = await playing(1, ['Ana', 'Ben', 'Cy']);
    const id = track(A)!.id;
    A.send({ t: 'jamFail', id });
    await sleep(80);
    expect(track(B)?.ref).toBe(vid(1));
    A.send({ t: 'jamFail', id }); // the same sender again counts once
    await sleep(80);
    expect(track(B)?.ref).toBe(vid(1));
    B.send({ t: 'jamFail', id });
    const note = await C.next('jamNote');
    expect(note.text).toMatch(/can't be played here, skipping/);
    await until(() => !track(C), 'the track to be dropped');
  });

  it.each([0, 3, 5000])('treats a reported length of %s as unplayable', async (len) => {
    await boot();
    const [A, B] = await playing(1, ['Ana', 'Ben']);
    A.send({ t: 'jamTrack', id: track(A)!.id, len });
    const note = await B.next('jamNote');
    expect(note.text).toMatch(/can't be played here/);
    await until(() => !track(B) && live(B)!.mode === 'station', 'the station to resume');
  });

  it('skips a track that never gets a length', async () => {
    await boot();
    const [A, B] = await playing(1, ['Ana', 'Ben']);
    await pass(LENGTH_WAIT_MS - 1000);
    expect(track(B)?.ref).toBe(vid(1));
    await pass(1500);
    await until(() => !track(B), 'the track to time out');
    expect(A.all('jamNote').at(-1)?.text).toMatch(/can't be played here/);
  });

  it('ignores a length for another track, and a second length', async () => {
    await boot();
    const [A, B] = await playing(1, ['Ana', 'Ben']);
    A.send({ t: 'jamTrack', id: 't999', len: 100 });
    await sleep(80);
    expect(track(B)!.len).toBeUndefined();
    A.send({ t: 'jamTrack', id: track(A)!.id, len: 100 });
    await until(() => track(B)?.len === 100, 'the first length');
    B.send({ t: 'jamTrack', id: track(B)!.id, len: 20 });
    B.send({ t: 'jamTrack', id: track(B)!.id, len: 0 });
    await sleep(80);
    expect(track(A)!.len).toBe(100);
    expect(track(A)?.ref).toBe(vid(1));
  });
});

describe('rate limits', () => {
  it('does not let repeated skips use up the allowance for adding songs', async () => {
    await boot();
    const A = await connect('Ana');
    await enter(A);
    for (let i = 0; i < 25; i++) A.send({ t: 'jam', op: 'skip' }); // over the 20-per-minute limit for other actions
    await sleep(60);
    await add(A, 1); // still allowed: adds have their own count
    expect(errors(A)).toEqual([]);
  });
});

describe('hanging out', () => {
  it('leaves status and Do Not Disturb alone, and still delivers the jam during Do Not Disturb', async () => {
    await boot();
    const [A, W] = [await connect('Ana'), await connect('Walt')];
    A.send({ t: 'status', kind: 'dnd' } as never);
    await sleep(60);
    await enter(A);
    expect(live(A)).toBeDefined();
    const presence = A.all('presence').filter((p) => p.id === A.id);
    expect(presence.at(-1)?.status?.kind ?? 'dnd').toBe('dnd');
    // Walking in opens no call or media: no mic or camera change comes from the server.
    expect(presence.some((p) => p.mic === true || p.cam === true)).toBe(false);
    expect(W.all('presence').some((p) => p.id === A.id && (p.mic || p.cam))).toBe(false);
  });
});
