import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { RunningServer } from '../../server/app';
import { defaultLayout } from '../../shared/default-layout';
import type { DeskLook } from '../../shared/desk-look';
import { cloneLayout } from '../../shared/layout';
import { compileDefault, setWorld } from '../../shared/map';
import { api, connectClient, newMemberId, startTestServer, type TestClient } from './helpers';

// desk-5-13: a 3×1 desk at (5,13) with its chair at (6,12), in the first desk pod.
const DESK = 'desk-5-13';
const LOOK: DeskLook = { items: [{ kind: 'item:rm-mug', at: [0.5, 0.2], rot: 0 }], computer: { kind: 'item:rm-laptop', at: [1.2, 0.1], rot: 0 }, floor: 'grass' };

let server: RunningServer | undefined;
let clients: TestClient[] = [];
afterEach(async () => {
  clients.forEach((c) => c.close());
  clients = [];
  await server?.close();
  setWorld(compileDefault());
});

const start = async (opts: Parameters<typeof startTestServer>[0] = {}) => {
  server = await startTestServer({ publishCooldownMs: 0, adminToken: 'letmein', ...opts });
};
const join = async (name: string, extra: Record<string, unknown> = {}) => {
  const c = await connectClient(server!.port, name, { memberId: newMemberId(), ...extra });
  clients.push(c);
  return c;
};
const claim = (c: TestClient) => c.send({ t: 'desk', op: 'claim', deskId: DESK });
const lastLooks = (c: TestClient) => c.all('deskLooks').at(-1)?.looks;
const looksWhere = async (c: TestClient, pred: (l: Record<string, DeskLook>) => boolean) => (await c.next('deskLooks', (m) => pred(m.looks), 2000)).looks;

describe('Customize desk', () => {
  it('is saved and shown to everyone within two seconds', async () => {
    await start();
    const [a, b] = [await join('Ana'), await join('Ben')];
    claim(a);
    await a.next('office');
    const started = Date.now();
    a.send({ t: 'deskLook', look: LOOK });
    const looks = await looksWhere(b, (l) => !!l[DESK]);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(looks[DESK]).toMatchObject({ floor: 'grass', items: [{ kind: 'item:rm-mug' }] });
    expect(a.all('deskLookError')).toEqual([]);
  });

  it('tells only the sender when someone with no desk, or a guest, tries', async () => {
    await start();
    const [nobody, guest, other] = [await join('Nia'), await connectClient(server!.port, 'Gus'), await join('Otto')];
    clients.push(guest);
    nobody.send({ t: 'deskLook', look: LOOK });
    expect((await nobody.next('deskLookError')).code).toBe('no-desk');
    guest.send({ t: 'deskLook', look: LOOK });
    expect((await guest.next('deskLookError')).code).toBe('not-member');
    expect(await other.quiet('deskLookError', 150)).toEqual([]);
    expect(other.all('welcome')[0].deskLooks).toEqual({});
    expect(other.all('deskLooks')).toEqual([]); // nothing was saved, so nobody heard anything
  });

  it('refuses a look that does not fit, with its code, and keeps the old one', async () => {
    await start();
    const a = await join('Ana');
    claim(a);
    a.send({ t: 'deskLook', look: LOOK });
    await looksWhere(a, (l) => !!l[DESK]);
    await new Promise((r) => setTimeout(r, 1050));
    a.send({ t: 'deskLook', look: { items: Array.from({ length: 7 }, (_, i) => ({ kind: 'item:rm-mug', at: [0.1 + i * 0.3, 0.4], rot: 0 })) } });
    expect((await a.next('deskLookError')).code).toBe('too-many');
    await new Promise((r) => setTimeout(r, 1050));
    a.send({ t: 'deskLook', look: { items: [], desk: 'item:rm-standing-desk' } });
    expect((await a.next('deskLookError')).code).toBe('wrong-size');
    expect(lastLooks(a)![DESK].floor).toBe('grass');
  });

  it('works while building is turned off', async () => {
    await start();
    const [admin, a] = [await join('Root', { admin: 'letmein' }), await join('Ana')];
    admin.send({ t: 'admin', op: 'building', enabled: false });
    await a.next('building');
    claim(a);
    a.send({ t: 'deskLook', look: LOOK });
    expect((await looksWhere(a, (l) => !!l[DESK]))[DESK]).toBeTruthy();
  });

  it('turns away a second message within a second', async () => {
    await start();
    const a = await join('Ana');
    claim(a);
    a.send({ t: 'deskLook', look: LOOK });
    a.send({ t: 'deskLook', look: { items: [] } });
    expect((await a.next('deskLookError')).code).toBe('rate');
  });

  it('resets with null', async () => {
    await start();
    const [a, b] = [await join('Ana'), await join('Ben')];
    claim(a);
    a.send({ t: 'deskLook', look: LOOK });
    await looksWhere(b, (l) => !!l[DESK]);
    await new Promise((r) => setTimeout(r, 1050));
    a.send({ t: 'deskLook', look: null });
    expect(await looksWhere(b, (l) => !l[DESK])).toEqual({});
  });

  it('goes with the claim, stays saved with the member, and comes back with the next claim', async () => {
    await start();
    const memberId = newMemberId();
    const [a, b] = [await join('Ana', { memberId }), await join('Ben')];
    claim(a);
    a.send({ t: 'deskLook', look: LOOK });
    await looksWhere(b, (l) => !!l[DESK]);
    a.send({ t: 'desk', op: 'unclaim' });
    expect(await looksWhere(b, (l) => !l[DESK])).toEqual({});
    claim(a);
    expect((await looksWhere(b, (l) => !!l[DESK]))[DESK].floor).toBe('grass');
  });

  it('survives a restart', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shyft-look-'));
    await start({ dataDir });
    const memberId = newMemberId();
    const a = await join('Ana', { memberId });
    claim(a);
    a.send({ t: 'deskLook', look: LOOK });
    await looksWhere(a, (l) => !!l[DESK]);
    clients.forEach((c) => c.close());
    clients = [];
    await server!.close();
    await start({ dataDir });
    const again = await join('Ana', { memberId });
    expect(again.all('welcome')[0].deskLooks![DESK].floor).toBe('grass');
  });

  it('moves with its desk when a publish moves it', async () => {
    await start();
    const [a, b] = [await join('Ana'), await join('Ben')];
    claim(a);
    a.send({ t: 'deskLook', look: LOOK });
    await looksWhere(b, (l) => !!l[DESK]);
    const moved = cloneLayout(defaultLayout());
    for (const id of [DESK, 'chair-6-12']) moved.objects.find((o) => o.id === id)!.x += 1;
    expect((await api(server!.port, b, 'POST', '/api/publish', { baseRev: 1, layout: moved })).status).toBe(200);
    await b.next('layout');
    expect(lastLooks(b)![DESK].floor).toBe('grass');
  });

  it('loses its desk with a publish that deletes it, keeps the look for the member, and says so', async () => {
    await start();
    const [a, b] = [await join('Ana'), await join('Ben')];
    claim(a);
    a.send({ t: 'deskLook', look: LOOK });
    await looksWhere(b, (l) => !!l[DESK]);
    const gone = cloneLayout(defaultLayout());
    gone.objects = gone.objects.filter((o) => o.id !== DESK && o.id !== 'chair-6-12');
    expect((await api(server!.port, b, 'POST', '/api/publish', { baseRev: 1, layout: gone })).status).toBe(200);
    const note = await a.next('notify', (m) => m.kind === 'deskRemoved');
    expect(note.text).toContain('decorations are saved');
    expect(await looksWhere(b, (l) => !l[DESK])).toEqual({});
    // Another desk, claimed later, shows the saved look.
    a.send({ t: 'desk', op: 'claim', deskId: 'desk-5-14' });
    expect((await looksWhere(b, (l) => !!l['desk-5-14']))['desk-5-14'].floor).toBe('grass');
  });
});
