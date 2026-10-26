import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RunningServer } from '../../server/app';
import { setStudioItems } from '../../shared/catalog';
import { defaultLayout } from '../../shared/default-layout';
import { cloneLayout, type Layout } from '../../shared/layout';
import { compileDefault, setWorld } from '../../shared/map';
import { itemDef, openSpots, part } from '../unit/fixtures/items';
import { api, connectClient, newMemberId, startTestServer, type TestClient } from './helpers';

let server: RunningServer | undefined;
let dataDir: string;
let clients: TestClient[] = [];
const join = async (name: string, extra = {}) => {
  const c = await connectClient(server!.port, name, { memberId: newMemberId(), ...extra });
  clients.push(c);
  return c;
};
const shelf = (over = {}) => itemDef('floor', { name: 'Bookshelf', group: 'shelves', footprint: [1, 1], parts: [part({ w: 1, d: 1, h: 0.9 })], ...over });
const start = async () => { server = await startTestServer({ dataDir, publishCooldownMs: 0, draftCooldownMs: 0, itemSavesPerMinute: 100 }); };

beforeEach(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shyft-items-'));
  await start();
});
afterEach(async () => {
  clients.forEach((c) => c.close());
  clients = [];
  await server?.close();
  server = undefined;
  setStudioItems([]);
  setWorld(compileDefault());
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('saving a studio item', () => {
  it('keeps placed copies across a restart', async () => {
    const a = await join('Ana');
    const id = (await api(server!.port, a, 'POST', '/api/items', { def: shelf() })).body.item.id as string;
    const layout: Layout = cloneLayout(defaultLayout());
    const [p1] = openSpots(layout, 1);
    layout.objects.push({ id: 's1', kind: `item:${id}`, x: p1[0], y: p1[1], rot: 0 });
    expect((await api(server!.port, a, 'POST', '/api/publish', { baseRev: 1, layout })).status).toBe(200);
    clients.forEach((c) => c.close());
    clients = [];
    await server!.close();
    await start();
    const b = await join('Ben');
    const now = (await api(server!.port, b, 'GET', '/api/layout')).body.layout as Layout;
    expect(now.objects.some((o) => o.id === 's1' && o.kind === `item:${id}`)).toBe(true);
  });

  it('stores a valid design, tells everyone, lists it, and keeps it across a restart', async () => {
    const a = await join('Ana');
    const b = await join('Ben');
    const r = await api(server!.port, a, 'POST', '/api/items', { def: shelf() });
    expect(r.status).toBe(201);
    expect(r.body.pinned).toBe(0);
    expect(r.body.item).toMatchObject({ def: { name: 'Bookshelf', group: 'shelves' }, by: { name: 'Ana' }, version: 1 });
    expect(r.body.item.id).toMatch(/^bookshelf-[0-9a-f]{4}$/);
    const msg = await b.next('items');
    expect(msg.items).toEqual([{ id: `item:${r.body.item.id}`, name: 'Bookshelf', group: 'shelves', kind: 'floor', by: 'Ana', version: 1 }]);
    expect((await api(server!.port, b, 'GET', '/api/items')).body.items).toHaveLength(1);
    expect((await join('Cy')).all('welcome')[0].items).toHaveLength(1);

    clients.forEach((c) => c.close());
    clients = [];
    await server!.close();
    await start();
    expect((await api(server!.port, await join('Dee'), 'GET', '/api/items')).body.items[0].id).toBe(r.body.item.id);
  });

  it('turns away an invalid design with the codes, and stores nothing', async () => {
    const a = await join('Ana');
    const r = await api(server!.port, a, 'POST', '/api/items', { def: shelf({ footprint: [1, 1], parts: [part({ w: 2, h: 0.2 })] }) });
    expect(r).toMatchObject({ status: 400, body: { error: 'bad-item', errors: ['part-outside:0'] } });
    expect((await api(server!.port, a, 'GET', '/api/items')).body.items).toEqual([]);
    expect(fs.existsSync(path.join(dataDir, 'items')) ? fs.readdirSync(path.join(dataDir, 'items')) : []).toEqual([]);
  });

  it('asks before deleting, then removes the copies in a revision credited to the caller', async () => {
    const a = await join('Ana');
    const id = (await api(server!.port, a, 'POST', '/api/items', { def: shelf() })).body.item.id as string;
    const layout: Layout = cloneLayout(defaultLayout());
    const [p1, p2] = openSpots(layout, 2);
    layout.objects.push({ id: 's1', kind: `item:${id}`, x: p1[0], y: p1[1], rot: 0 }, { id: 's2', kind: `item:${id}`, x: p2[0], y: p2[1], rot: 0 });
    const pub = await api(server!.port, a, 'POST', '/api/publish', { baseRev: 1, layout });
    expect(pub.status, JSON.stringify(pub.body)).toBe(200);
    expect((await api(server!.port, a, 'DELETE', `/api/items/${id}`)).body).toEqual({ placed: 2 });
    expect((await api(server!.port, a, 'GET', '/api/items')).body.items).toHaveLength(1); // not yet
    const b = await join('Ben');
    const del = await api(server!.port, b, 'DELETE', `/api/items/${id}?confirm=1`);
    expect(del.status).toBe(403); // not Ben's
    const ok = await api(server!.port, a, 'DELETE', `/api/items/${id}?confirm=1`);
    expect(ok.status).toBe(200);
    const now = (await api(server!.port, a, 'GET', '/api/layout')).body;
    expect(now.layout.objects.some((o: { kind: string }) => o.kind === `item:${id}`)).toBe(false);
    expect(now.by).toEqual({ name: 'Ana' });
    expect((await api(server!.port, a, 'GET', '/api/items')).body.items).toEqual([]);
  });
});
