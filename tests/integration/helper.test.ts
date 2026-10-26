import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Drafter } from '../../server/helper';
import type { RunningServer } from '../../server/app';
import { setStudioItems } from '../../shared/catalog';
import { compileDefault, setWorld } from '../../shared/map';
import { itemDef, part } from '../unit/fixtures/items';
import { api, connectClient, newMemberId, startTestServer, type TestClient } from './helpers';

let server: RunningServer | undefined;
let dataDir: string;
let clients: TestClient[] = [];
let reply: (signal: AbortSignal) => Promise<unknown> = async () => itemDef('floor', { name: 'Cactus' });
let calls = 0;
const fake: Drafter = { draft: async (_req, signal) => { calls++; return reply(signal); } };

const start = async (opts: Parameters<typeof startTestServer>[0] = {}) => {
  server = await startTestServer({ dataDir, adminToken: 'letmein', drafter: fake, helperTimeoutMs: 400, ...opts });
};
const join = async (name: string, extra = {}) => {
  const c = await connectClient(server!.port, name, { memberId: newMemberId(), ...extra });
  clients.push(c);
  return c;
};
const ask = (c: TestClient, body: unknown = { text: 'a small cactus' }) => api(server!.port, c, 'POST', '/api/studio/helper', body);
const switchOn = async (admin: TestClient) => { admin.send({ t: 'admin', op: 'helper', enabled: true }); await admin.next('helper', (m) => m.status === 'on'); };

beforeEach(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shyft-helper-'));
  calls = 0;
  reply = async () => itemDef('floor', { name: 'Cactus' });
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

describe('the item helper', () => {
  it('returns a checked draft, and stores nothing', async () => {
    const admin = await join('Ada', { admin: 'letmein' });
    await switchOn(admin);
    const r = await ask(admin);
    expect(r.status).toBe(200);
    expect(r.body.design).toMatchObject({ name: 'Cactus', kind: 'floor', format: 1 });
    expect((await api(server!.port, admin, 'GET', '/api/items')).body.items).toEqual([]);
    expect((await api(server!.port, admin, 'GET', '/api/studio/draft')).status).toBe(404);
    expect(fs.existsSync(path.join(dataDir, 'items')) ? fs.readdirSync(path.join(dataDir, 'items')) : []).toEqual([]);
  });

  it('turns away a reply that is not JSON, not an item, or beyond rescue, in plain words', async () => {
    const admin = await join('Ada', { admin: 'letmein' });
    await switchOn(admin);
    for (const bad of ['sorry, I cannot do that', { hello: 'world' }, { ...itemDef('floor'), parts: Array.from({ length: 30 }, () => part()) }, { ...itemDef('floor'), kind: 'sofa' }]) {
      reply = async () => bad;
      const r = await ask(admin);
      expect(r.status, JSON.stringify(bad)).toBe(422);
      expect(r.body).toMatchObject({ error: 'unusable' });
      expect(r.body.message).toMatch(/couldn’t make that into an item/);
    }
  });

  it('clamps a reply that is only a little out of range', async () => {
    const admin = await join('Ada', { admin: 'letmein' });
    await switchOn(admin);
    reply = async () => ({ ...itemDef('floor'), name: 'N'.repeat(40), parts: [{ ...part(), x: 0.123, w: 0.5, pattern: 'glitter' }] });
    const r = await ask(admin);
    expect(r.status).toBe(200);
    expect(r.body.design.name).toHaveLength(32);
    expect(r.body.design.parts[0]).toMatchObject({ x: 0.1, pattern: 'plain' });
  });

  it('accepts a reply that is text around a JSON object', async () => {
    const admin = await join('Ada', { admin: 'letmein' });
    await switchOn(admin);
    reply = async () => 'Here you go:\n```json\n' + JSON.stringify(itemDef('floor', { name: 'Boxy' })) + '\n```';
    expect((await ask(admin)).body.design.name).toBe('Boxy');
  });

  it('says 502 when the service fails and 504 when it hangs, and stores nothing', async () => {
    const admin = await join('Ada', { admin: 'letmein' });
    await switchOn(admin);
    reply = async () => { throw new Error('refused'); };
    expect(await ask(admin)).toMatchObject({ status: 502, body: { error: 'helper-failed' } });
    await server!.close();
    await start();
    const admin2 = await join('Ada2', { admin: 'letmein' });
    await switchOn(admin2);
    reply = (signal) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
    expect(await ask(admin2)).toMatchObject({ status: 504, body: { error: 'helper-failed' } });
    expect((await api(server!.port, admin2, 'GET', '/api/items')).body.items).toEqual([]);
  });

  it('stays out of the way of guests, and answers helper-off while it is off', async () => {
    const guest = await join('Gus', { memberId: undefined });
    expect(await ask(guest)).toMatchObject({ status: 403, body: { error: 'not-builder' } });
    const member = await join('Mia');
    expect(await ask(member)).toMatchObject({ status: 403, body: { error: 'helper-off' } });
    expect(calls).toBe(0);
  });

  it('is unavailable with no service and cannot be switched on', async () => {
    await server!.close();
    await start({ drafter: undefined });
    const admin = await join('Ada', { admin: 'letmein' });
    expect(admin.all('welcome')[0].helper).toBe('unavailable');
    admin.send({ t: 'admin', op: 'helper', enabled: true });
    expect(await admin.quiet('helper', 300)).toEqual([]);
    expect(await ask(admin)).toMatchObject({ status: 403, body: { error: 'helper-off' } });
  });

  it('lets an admin switch it for everyone who builds, and remembers across a restart', async () => {
    const admin = await join('Ada', { admin: 'letmein' });
    const member = await join('Mia');
    const guest = await join('Gus', { memberId: undefined });
    expect(member.all('welcome')[0].helper).toBe('off');
    expect(guest.all('welcome')[0].helper).toBeUndefined();
    admin.send({ t: 'admin', op: 'helper', enabled: true });
    expect((await member.next('helper')).status).toBe('on');
    expect(await guest.quiet('helper', 200)).toEqual([]);
    member.send({ t: 'admin', op: 'helper', enabled: false }); // not an admin: ignored
    expect(await admin.quiet('helper', 200)).toHaveLength(0);
    await new Promise((r) => setTimeout(r, 400)); // the state file is written a moment later
    clients.forEach((c) => c.close());
    clients = [];
    await server!.close();
    await start();
    expect((await join('Mia2')).all('welcome')[0].helper).toBe('on');
    admin.send({ t: 'admin', op: 'helper', enabled: false });
  });

  it('limits a member to 5 a minute and one at a time', async () => {
    const admin = await join('Ada', { admin: 'letmein' });
    await switchOn(admin);
    let release!: () => void;
    reply = () => new Promise((resolve) => { release = () => resolve(itemDef('floor')); });
    const first = ask(admin);
    await new Promise((r) => setTimeout(r, 100));
    expect(await ask(admin)).toMatchObject({ status: 429 });
    release();
    expect((await first).status).toBe(200);
    reply = async () => itemDef('floor');
    for (let i = 0; i < 3; i++) expect((await ask(admin)).status).toBe(200);
    expect((await ask(admin)).status).toBe(200); // the 5th
    expect((await ask(admin)).status).toBe(429); // the 6th
  });

  it('checks the request: some text or a picture, text up to 500, a picture up to 2 MB of PNG or JPEG', async () => {
    const admin = await join('Ada', { admin: 'letmein' });
    await switchOn(admin);
    expect((await ask(admin, {})).status).toBe(400);
    expect((await ask(admin, { text: 'x'.repeat(501) })).status).toBe(400);
    expect((await ask(admin, { image: { type: 'image/gif', data: 'AAAA' } })).status).toBe(400);
    expect((await ask(admin, { image: { type: 'image/png', data: Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64') } })).status).toBe(400);
    expect((await ask(admin, { image: { type: 'image/png', data: Buffer.from([1, 2, 3]).toString('base64') } })).status).toBe(200);
    expect(calls).toBe(1);
  });
});

describe('the admin switch', () => {
  it('tells every admin the new setting, so each one sees the same switch', async () => {
    const a1 = await join('Ada', { admin: 'letmein' });
    const a2 = await join('Alan', { admin: 'letmein' });
    a1.send({ t: 'admin', op: 'helper', enabled: true });
    expect((await a2.next('adminState', (m) => m.helperEnabled === true)).helperEnabled).toBe(true);
    a2.send({ t: 'admin', op: 'helper', enabled: false });
    expect((await a1.next('adminState', (m) => m.helperEnabled === false)).helperEnabled).toBe(false);
  });
});

describe('after the service fails', () => {
  it('tells builders it is unavailable for now, not that it is not set up', async () => {
    const admin = await join('Ada', { admin: 'letmein' });
    const member = await join('Mia');
    await switchOn(admin);
    reply = async () => { throw new Error('down'); };
    expect((await ask(admin)).status).toBe(502);
    expect(await member.next('helper', (m) => m.status === 'unavailable')).toMatchObject({ cooling: true });
    expect((await join('Late')).all('welcome')[0]).toMatchObject({ helper: 'unavailable', helperCooling: true });
  });
});
