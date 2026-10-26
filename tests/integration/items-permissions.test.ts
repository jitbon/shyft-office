import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RunningServer } from '../../server/app';
import { setStudioItems } from '../../shared/catalog';
import { compileDefault, setWorld } from '../../shared/map';
import { itemDef, part } from '../unit/fixtures/items';
import { api, connectClient, newMemberId, startTestServer, type TestClient } from './helpers';

let server: RunningServer | undefined;
let dataDir: string;
let clients: TestClient[] = [];
const join = async (name: string, extra = {}) => {
  const c = await connectClient(server!.port, name, extra);
  clients.push(c);
  return c;
};
const member = (name: string, extra = {}) => join(name, { memberId: newMemberId(), ...extra });
const def = (name = 'Stool') => itemDef('floor', { name, parts: [part()] });
const save = (c: TestClient, body: unknown) => api(server!.port, c, 'POST', '/api/items', body);
const start = (opts = {}) => startTestServer({ dataDir, adminToken: 'letmein', publishCooldownMs: 0, draftCooldownMs: 0, studioDraftCooldownMs: 0, ...opts });

beforeEach(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shyft-items-'));
  server = await start();
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

describe('who may save, change and delete items', () => {
  it('turns guests away from every item route', async () => {
    const guest = await join('Guest');
    expect(await save(guest, { def: def() })).toMatchObject({ status: 403, body: { error: 'not-builder' } });
    expect(await api(server!.port, guest, 'DELETE', '/api/items/x')).toMatchObject({ status: 403, body: { error: 'not-builder' } });
    expect(await api(server!.port, guest, 'PUT', '/api/studio/draft', { design: {} })).toMatchObject({ status: 403, body: { error: 'not-builder' } });
    expect((await api(server!.port, guest, 'GET', '/api/items')).status).toBe(200); // anyone can read
  });

  it('lets only the creator or an admin change or delete, and anyone save a copy', async () => {
    const a = await member('Ana');
    const b = await member('Ben');
    const admin = await member('Ada', { admin: 'letmein' });
    const id = (await save(a, { def: def() })).body.item.id as string;
    expect(await save(b, { id, def: def('Bigger stool') })).toMatchObject({ status: 403, body: { error: 'not-yours' } });
    expect((await api(server!.port, b, 'DELETE', `/api/items/${id}?confirm=1`)).status).toBe(403);
    const copy = await save(b, { id, def: def('Ben stool'), asCopy: true });
    expect(copy.status).toBe(201);
    expect(copy.body.item.id).not.toBe(id);
    expect(copy.body.item.by).toEqual({ name: 'Ben' });
    expect(await save(a, { id, def: def('Ana stool 2') })).toMatchObject({ status: 200, body: { item: { version: 2 } } });
    expect(await save(admin, { id, def: def('Admin edit') })).toMatchObject({ status: 200, body: { item: { version: 3, by: { name: 'Ana' } } } });
    expect((await api(server!.port, admin, 'DELETE', `/api/items/${copy.body.item.id}?confirm=1`)).status).toBe(200);
  });

  it('limits a member to 20 saves a minute', async () => {
    await server!.close();
    server = await start({ itemSavesPerMinute: 20 });
    const a = await member('Ana');
    for (let i = 0; i < 20; i++) expect((await save(a, { def: def(`Stool ${i}`) })).status).toBe(201);
    expect((await save(a, { def: def('One more') })).status).toBe(429);
  });

  it('holds at 500 items', async () => {
    await server!.close();
    server = await start({ itemSavesPerMinute: 1000 });
    const a = await member('Ana');
    for (let i = 0; i < 500; i++) expect((await save(a, { def: def(`Stool ${i}`) })).status).toBe(201);
    expect(await save(a, { def: def('Too many') })).toMatchObject({ status: 409, body: { error: 'too-many' } });
  }, 60_000);

  it('blocks members, not admins, while building is switched off', async () => {
    const admin = await member('Ada', { admin: 'letmein' });
    const a = await member('Ana');
    admin.send({ t: 'admin', op: 'building', enabled: false });
    await a.next('building');
    expect(await save(a, { def: def() })).toMatchObject({ status: 403, body: { error: 'building-off' } });
    expect((await save(admin, { def: def() })).status).toBe(201);
  });

  it('shows a studio draft only to its owner', async () => {
    const a = await member('Ana');
    const b = await member('Ben');
    expect((await api(server!.port, a, 'PUT', '/api/studio/draft', { design: { name: 'Half done' } })).status).toBe(200);
    expect((await api(server!.port, a, 'GET', '/api/studio/draft')).body).toMatchObject({ design: { name: 'Half done' } });
    expect((await api(server!.port, b, 'GET', '/api/studio/draft')).status).toBe(404);
  });
});
