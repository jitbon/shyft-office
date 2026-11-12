import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { RunningServer } from '../../server/app';
import { deskById } from '../../shared/map';
import { connectClient, newMemberId, startTestServer, type TestClient } from './helpers';

// Row 19 of the lobby (x 14-25) is open floor; Meeting Room A is a private area around (2.5, 2.5).
const Y = 19.5;
const ROOM = { x: 2.5, y: 2.5 };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DAY = 24 * 60 * 60 * 1000;

let server: RunningServer;
let clients: TestClient[] = [];
const join = async (name: string, opts: { member?: string | null; x?: number; y?: number; on?: RunningServer } = {}) => {
  const member = opts.member === undefined ? newMemberId() : opts.member;
  const c = await connectClient((opts.on ?? server).port, name, member ? { memberId: member } : {});
  c.at(opts.x ?? 15.5, opts.y ?? Y);
  clients.push(c);
  return c;
};
/** Walks in small steps, so the server's trail of them is a path a pet can follow. */
const walk = async (c: TestClient, x0: number, x1: number, y = Y) => {
  for (let x = x0; x <= x1 + 1e-9; x += 0.5) c.at(x, y);
  await sleep(60);
};
const noByMember = (c: TestClient) => {
  for (const t of ['welcome', 'petUpsert', 'plantUpsert', 'care', 'careSummary'] as const) expect(JSON.stringify(c.all(t))).not.toContain('byMember');
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

describe('pets', () => {
  it('adopts, follows, and anyone next to it can look after it', async () => {
    const memberA = newMemberId();
    const a = await join('Ann', { member: memberA });
    const b = await join('Bo', { x: 22.5 });
    const g = await join('Guest', { member: null, x: 23.5 });
    expect(a.all('welcome')[0].companions).toBeDefined();

    a.send({ t: 'pet', op: 'adopt', kind: 'cat', color: 1, name: '  Miso  ' });
    const adopted = await b.next('petUpsert', (m) => m.pet.owner === memberA);
    expect(adopted.pet).toMatchObject({ name: 'Miso', kind: 'cat', color: 1, follow: a.id, ownerName: 'Ann' });

    a.send({ t: 'pet', op: 'adopt', kind: 'dog', color: 0, name: 'Rex' });
    expect((await a.next('companionError')).code).toBe('has-pet');
    g.send({ t: 'pet', op: 'adopt', kind: 'dog', color: 0, name: 'Rex' });
    expect((await g.next('companionError')).code).toBe('not-member');

    // A walks along the row; the pet trails 1.2 tiles behind, then idles within about a tile of that.
    await walk(a, 14.5, 19.5);
    b.at(18.3, Y);
    await sleep(60);
    b.send({ t: 'care', target: { pet: memberA }, action: 'feed' });
    const fed = await g.next('care', (m) => 'pet' in m.target && m.target.pet === memberA);
    expect(fed).toMatchObject({ action: 'feed', by: 'Bo', react: true });

    // A second look-after within 2 s plays no second reaction.
    b.send({ t: 'care', target: { pet: memberA }, action: 'pet' });
    expect((await a.next('care', (m) => m.action === 'pet')).react).toBe(false);

    // Guests may look after pets too.
    g.at(18.3, Y + 0.3);
    await sleep(60);
    g.send({ t: 'care', target: { pet: memberA }, action: 'play' });
    expect((await a.next('care', (m) => m.action === 'play')).by).toBe('Guest');

    // Water is for plants.
    b.send({ t: 'care', target: { pet: memberA }, action: 'water' });
    expect((await b.next('companionError')).code).toBe('bad');

    b.at(24.5, Y);
    await sleep(60);
    b.send({ t: 'care', target: { pet: memberA }, action: 'feed' });
    expect((await b.next('companionError')).code).toBe('too-far');
    noByMember(a);
    noByMember(b);
  });

  it('never lets care through a private room wall', async () => {
    const memberA = newMemberId();
    const a = await join('Rina', { member: memberA });
    const b = await join('Bea', { x: 20.5 });
    a.send({ t: 'pet', op: 'adopt', kind: 'rabbit', color: 0, name: 'Bun' });
    await b.next('petUpsert', (m) => m.pet.owner === memberA);
    a.at(ROOM.x, ROOM.y);
    b.at(15.5, Y); // out in the lobby: no distance gets through the room's walls
    await sleep(80);
    b.send({ t: 'care', target: { pet: memberA }, action: 'pet' });
    expect((await b.next('companionError')).code).toBe('walls');
  });

  it('limits care to 5 per person in 10 seconds', async () => {
    const memberA = newMemberId();
    const a = await join('Lim', { member: memberA, x: 15.5 });
    a.send({ t: 'pet', op: 'adopt', kind: 'dog', color: 2, name: 'Dot' });
    await a.next('petUpsert', (m) => m.pet.owner === memberA);
    await sleep(80);
    // Its owner stands still beside it: every care is in range.
    for (let i = 0; i < 6; i++) a.send({ t: 'care', target: { pet: memberA }, action: 'pet' });
    expect((await a.next('companionError')).code).toBe('rate');
    expect(a.all('care').filter((m) => 'pet' in m.target && m.target.pet === memberA)).toHaveLength(5);
  });

  it('rests while its owner is away, follows again on return, can change, and can be sent away', async () => {
    const memberA = newMemberId();
    let a = await join('Ola', { member: memberA });
    const b = await join('Pia', { x: 22.5 });
    a.send({ t: 'pet', op: 'adopt', kind: 'bird', color: 2, name: 'Kiwi' });
    await b.next('petUpsert', (m) => m.pet.owner === memberA && !!m.pet.follow);

    a.close();
    const resting = await b.next('petUpsert', (m) => m.pet.owner === memberA && !m.pet.follow);
    expect(resting.pet.rest).toBeDefined();

    a = await join('Ola', { member: memberA });
    expect((await b.next('petUpsert', (m) => m.pet.owner === memberA && m.pet.follow === a.id)).pet.name).toBe('Kiwi');

    a.send({ t: 'pet', op: 'edit', name: 'Mango', color: 1 });
    expect((await b.next('petUpsert', (m) => m.pet.owner === memberA && m.pet.name === 'Mango')).pet.color).toBe(1);
    await sleep(300);
    a.send({ t: 'pet', op: 'remove' });
    await b.next('petGone', (m) => m.owner === memberA);
  });

  it('tells a returning owner, once, who looked after things while they were away', async () => {
    const memberA = newMemberId();
    let a = await join('Away', { member: memberA });
    const b = await join('Sam', { x: 22.5 });
    a.send({ t: 'pet', op: 'adopt', kind: 'cat', color: 0, name: 'Miso' });
    await b.next('petUpsert', (m) => m.pet.owner === memberA);
    // Care by the owner themselves, while online, is never listed.
    a.send({ t: 'care', target: { pet: memberA }, action: 'pet' });
    await a.next('care');
    a.close();
    const rest = (await b.next('petUpsert', (m) => m.pet.owner === memberA && !m.pet.follow)).pet.rest;
    b.at(rest.x, rest.y);
    await sleep(80);
    b.send({ t: 'care', target: { pet: memberA }, action: 'feed' });
    await b.next('care');
    b.send({ t: 'care', target: { pet: memberA }, action: 'play' });
    await b.next('care');

    a = await join('Away', { member: memberA });
    const summary = await a.next('careSummary');
    expect(summary.entries).toEqual([
      expect.objectContaining({ by: 'Sam', action: 'play', name: 'Miso' }),
      expect.objectContaining({ by: 'Sam', action: 'feed', name: 'Miso' }),
    ]);
    a.close();
    await sleep(80);
    const again = await join('Away', { member: memberA });
    expect(await again.quiet('careSummary', 200)).toHaveLength(0);
    noByMember(again);
    noByMember(b);
  });
});

describe('plants', () => {
  let clocked: RunningServer;
  let now = Date.UTC(2026, 10, 10, 9);
  beforeAll(async () => {
    clocked = await startTestServer({ clock: { now: () => now } });
  });
  afterAll(async () => {
    await clocked.close();
  });

  it('places at the owner desk, waters, grows over days, and comes back when the desk goes', async () => {
    const memberA = newMemberId();
    const a = await join('Gro', { member: memberA, on: clocked });
    const b = await join('Wat', { x: 22.5, on: clocked });

    a.send({ t: 'plant', op: 'add', kind: 'tulip', name: 'Tuli' });
    const added = await a.next('plantUpsert');
    expect(added.plant.spot).toBeUndefined();
    expect(await b.quiet('plantUpsert', 100)).toHaveLength(0);
    a.send({ t: 'plant', op: 'place', id: added.plant.id });
    expect((await a.next('companionError')).code).toBe('no-desk');

    a.send({ t: 'desk', op: 'claim' });
    await a.next('office', (m) => m.desks.some((d) => d.owner?.memberId === memberA));
    await sleep(300);
    a.send({ t: 'plant', op: 'place', id: added.plant.id });
    const placed = await b.next('plantUpsert', (m) => m.plant.id === added.plant.id);
    const spot = placed.plant.spot!;
    expect(deskById(spot.deskId)!.tiles.some((t) => t.x === spot.x && t.y === spot.y)).toBe(true);

    await sleep(300);
    a.send({ t: 'plant', op: 'move', id: added.plant.id });
    const moved = (await b.next('plantUpsert', (m) => m.plant.id === added.plant.id)).plant.spot!;
    expect(`${moved.x},${moved.y}`).not.toBe(`${spot.x},${spot.y}`);

    // Up to 3 plants; someone else's plant is not yours.
    await sleep(1100); // the per-second limit on pet and plant changes
    a.send({ t: 'plant', op: 'add', kind: 'fern', name: 'F' });
    a.send({ t: 'plant', op: 'add', kind: 'cactus', name: 'C' });
    a.send({ t: 'plant', op: 'add', kind: 'sunflower', name: 'S' });
    expect((await a.next('companionError')).code).toBe('too-many');
    b.send({ t: 'plant', op: 'rename', id: added.plant.id, name: 'Mine' });
    expect((await b.next('companionError')).code).toBe('not-yours');

    // Watering on five different days: Sprout on day 1, Bloom by day 5. Twice in a day counts once.
    b.at(moved.x + 0.5, moved.y + 0.5);
    await sleep(80);
    const days: number[] = [];
    for (let d = 0; d < 5; d++) {
      b.send({ t: 'care', target: { plant: added.plant.id }, action: 'water' });
      days.push((await b.next('care', (m) => 'plant' in m.target)).wateredDays!);
      if (d === 0) {
        now += 3000;
        b.send({ t: 'care', target: { plant: added.plant.id }, action: 'water' });
        days.push((await b.next('care', (m) => 'plant' in m.target)).wateredDays!);
      }
      now += DAY;
      await sleep(10);
    }
    expect(days).toEqual([1, 1, 2, 3, 4, 5]);

    // Giving up the desk takes the plants back: gone from the office, kept in the owner's panel.
    await sleep(300);
    a.send({ t: 'desk', op: 'unclaim' });
    await b.next('plantGone', (m) => m.id === added.plant.id);
    const back = await a.next('plantUpsert', (m) => m.plant.id === added.plant.id && !m.plant.spot);
    expect(back.plant.wateredDays).toBe(5);

    await sleep(300);
    a.send({ t: 'plant', op: 'remove', id: added.plant.id });
    await a.next('plantGone', (m) => m.id === added.plant.id);
    noByMember(b);
  });
});

describe('saving', () => {
  it('keeps pets and plants across a restart', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shyft-pets-'));
    const first = await startTestServer({ dataDir });
    const memberA = newMemberId();
    const a = await join('Keep', { member: memberA, on: first });
    a.send({ t: 'pet', op: 'adopt', kind: 'dog', color: 1, name: 'Biscuit' });
    await a.next('petUpsert');
    await sleep(300);
    a.send({ t: 'plant', op: 'add', kind: 'cactus', name: 'Spike' });
    await a.next('plantUpsert');
    a.close();
    await sleep(100);
    await first.close();

    const second = await startTestServer({ dataDir });
    try {
      const back = await join('Keep', { member: memberA, on: second });
      const { pets, plants } = back.all('welcome')[0].companions!;
      expect(pets.find((p) => p.owner === memberA)).toMatchObject({ name: 'Biscuit', kind: 'dog', color: 1 });
      expect(plants.find((p) => p.owner === memberA)).toMatchObject({ name: 'Spike', kind: 'cactus', wateredDays: 0 });
      const other = await join('Other', { on: second });
      expect(other.all('welcome')[0].companions!.plants.some((p) => p.owner === memberA)).toBe(false); // not placed: only its owner sees it
    } finally {
      clients.forEach((c) => c.close());
      clients = [];
      await second.close();
    }
  });
});
