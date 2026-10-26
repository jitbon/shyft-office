import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ItemsStore } from '../../server/items';
import type { RunningServer } from '../../server/app';
import { setStudioItems } from '../../shared/catalog';
import { compileDefault, setWorld } from '../../shared/map';
import { itemDef } from '../unit/fixtures/items';
import { api, connectClient, newMemberId, startTestServer, type TestClient } from './helpers';

let server: RunningServer | undefined;
let dataDir: string;
let clients: TestClient[] = [];
const member = async (name: string) => {
  const c = await connectClient(server!.port, name, { memberId: newMemberId() });
  clients.push(c);
  return c;
};
const put = (c: TestClient, body: unknown) => api(server!.port, c, 'PUT', '/api/studio/draft', body);

beforeEach(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shyft-studio-'));
  server = await startTestServer({ dataDir, studioDraftCooldownMs: 0 });
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

describe('the studio draft', () => {
  it('keeps one draft per member: a second save replaces the first', async () => {
    const a = await member('Ana');
    expect((await put(a, { design: { name: 'First' } })).status).toBe(200);
    expect((await put(a, { design: { name: 'Second' }, itemId: 'abc', fromHelper: true })).status).toBe(200);
    expect((await api(server!.port, a, 'GET', '/api/studio/draft')).body).toMatchObject({ design: { name: 'Second' }, itemId: 'abc', fromHelper: true });
    expect((await api(server!.port, a, 'DELETE', '/api/studio/draft')).status).toBe(204);
    expect((await api(server!.port, a, 'GET', '/api/studio/draft')).status).toBe(404);
  });

  it('says which codes the design has now, without refusing an unfinished one', async () => {
    const a = await member('Ana');
    expect((await put(a, { design: itemDef('floor') })).body.problems).toEqual([]);
    const r = await put(a, { design: { ...itemDef('floor'), parts: [] } });
    expect(r.status).toBe(200);
    expect(r.body.problems).toEqual(['no-parts']);
  });

  it('refuses a design over 64 KB or with more than 64 parts, or one that is not an object', async () => {
    const a = await member('Ana');
    expect((await put(a, { design: { name: 'x'.repeat(70_000) } })).status).toBe(413);
    expect(await put(a, { design: { parts: Array.from({ length: 65 }, () => ({})) } })).toMatchObject({ status: 400, body: { error: 'too-many-parts' } });
    expect(await put(a, { design: [1] })).toMatchObject({ status: 400, body: { error: 'bad-request' } });
    expect(await put(a, {})).toMatchObject({ status: 400, body: { error: 'bad-request' } });
  });

  it('allows one save a second', async () => {
    await server!.close();
    server = await startTestServer({ dataDir, studioDraftCooldownMs: 1000 });
    const a = await member('Ana');
    expect((await put(a, { design: {} })).status).toBe(200);
    expect((await put(a, { design: {} })).status).toBe(429);
  });

  it('prunes drafts older than 30 days', () => {
    const store = ItemsStore.load(path.join(dataDir, 'items'));
    store.saveDraft('old-member', { name: 'Old' }, undefined, false);
    store.saveDraft('new-member', { name: 'New' }, undefined, false);
    store.pruneDrafts(Date.now() + 29 * 86_400_000);
    expect(store.getDraft('old-member')).toBeDefined();
    store.pruneDrafts(Date.now() + 31 * 86_400_000);
    expect(store.getDraft('old-member')).toBeUndefined();
    expect(store.getDraft('new-member')).toBeUndefined();
  });
});
