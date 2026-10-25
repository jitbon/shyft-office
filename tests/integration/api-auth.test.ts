import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RunningServer } from '../../server/app';
import { defaultLayout } from '../../shared/default-layout';
import { compileDefault, setWorld } from '../../shared/map';
import { api, connectClient, newMemberId, startTestServer, type TestClient } from './helpers';

// Who may use the builder API: members, while building is on. Guests never; non-admins not while it is off.

let server: RunningServer;
let clients: TestClient[] = [];
const join = async (name: string, extra: Parameters<typeof connectClient>[2] = {}) => {
  const c = await connectClient(server.port, name, extra);
  clients.push(c);
  return c;
};
const draftBody = () => ({ baseRev: 1, layout: defaultLayout() });

beforeEach(async () => {
  server = await startTestServer({ adminToken: 'letmein', publishCooldownMs: 0, draftCooldownMs: 0 });
});
afterEach(async () => {
  clients.forEach((c) => c.close());
  clients = [];
  await server.close();
  setWorld(compileDefault());
});

describe('the builder API', () => {
  it('needs a session', async () => {
    expect((await api(server.port, null, 'GET', '/api/layout')).status).toBe(401);
    const m = await join('Mia', { memberId: newMemberId() });
    expect((await api(server.port, m, 'GET', '/api/layout')).status).toBe(200);
  });

  it('lets anyone with a session read the layout, but only members build', async () => {
    const guest = await join('Gus'); // no member id
    expect(guest.all('welcome')[0].canBuild).toBe(false);
    expect((await api(server.port, guest, 'GET', '/api/layout')).body).toMatchObject({ rev: 1 });
    for (const [method, path] of [['PUT', '/api/draft'], ['POST', '/api/publish'], ['GET', '/api/draft'], ['GET', '/api/layout/history']] as const) {
      const r = await api(server.port, guest, method, path, method === 'GET' ? undefined : draftBody());
      expect(r, `${method} ${path}`).toMatchObject({ status: 403, body: { error: 'not-builder' } });
    }
    const member = await join('Mia', { memberId: newMemberId() });
    expect(member.all('welcome')[0].canBuild).toBe(true);
    expect(await api(server.port, member, 'PUT', '/api/draft', draftBody())).toMatchObject({ status: 200, body: { problems: [] } });
  });

  it('switches building off for members but not for admins, and tells everyone', async () => {
    const admin = await join('Ada', { memberId: newMemberId(), admin: 'letmein' });
    const member = await join('Mia', { memberId: newMemberId() });
    admin.send({ t: 'admin', op: 'building', enabled: false });
    expect(await member.next('building')).toEqual({ t: 'building', enabled: false, canBuild: false });
    expect(await admin.next('building')).toEqual({ t: 'building', enabled: false, canBuild: true });
    expect(await api(server.port, member, 'PUT', '/api/draft', draftBody())).toMatchObject({ status: 403, body: { error: 'building-off' } });
    expect((await api(server.port, admin, 'PUT', '/api/draft', draftBody())).status).toBe(200);

    admin.send({ t: 'admin', op: 'building', enabled: true });
    expect(await member.next('building')).toEqual({ t: 'building', enabled: true, canBuild: true });
    expect((await api(server.port, member, 'PUT', '/api/draft', draftBody())).status).toBe(200);
  });

  it('ignores the building switch from anyone but an admin', async () => {
    const member = await join('Mia', { memberId: newMemberId() });
    member.send({ t: 'admin', op: 'building', enabled: false });
    expect(await member.quiet('building', 300)).toEqual([]);
    expect((await api(server.port, member, 'PUT', '/api/draft', draftBody())).status).toBe(200);
  });

  it('keeps each draft private to its owner', async () => {
    const a = await join('Ana', { memberId: newMemberId() });
    const b = await join('Ben', { memberId: newMemberId() });
    expect((await api(server.port, a, 'GET', '/api/draft')).status).toBe(404);
    await api(server.port, a, 'PUT', '/api/draft', draftBody());
    expect((await api(server.port, a, 'GET', '/api/draft')).body).toMatchObject({ baseRev: 1 });
    expect((await api(server.port, b, 'GET', '/api/draft')).status).toBe(404);
    expect((await api(server.port, a, 'DELETE', '/api/draft')).status).toBe(204);
    expect((await api(server.port, a, 'GET', '/api/draft')).status).toBe(404);
  });

  it('refuses bodies over 1 MB, and layouts that do not parse', async () => {
    const m = await join('Mia', { memberId: newMemberId() });
    const big = await api(server.port, m, 'PUT', '/api/draft', undefined, JSON.stringify({ pad: 'x'.repeat(1_100_000) }));
    expect(big.status).toBe(413);
    const bad = await api(server.port, m, 'PUT', '/api/draft', { baseRev: 1, layout: { w: 3, h: 3 } });
    expect(bad).toMatchObject({ status: 400, body: { error: 'bad-layout' } });
    expect((await api(server.port, m, 'PUT', '/api/draft', undefined, '{nope')).status).toBe(400);
  });
});

describe('rate limits', () => {
  it('allows one publish every 2 seconds per member', async () => {
    await server.close();
    server = await startTestServer({ draftCooldownMs: 0 });
    const m = await join('Mia', { memberId: newMemberId() });
    expect((await api(server.port, m, 'POST', '/api/publish', draftBody())).status).toBe(200);
    expect((await api(server.port, m, 'POST', '/api/publish', { baseRev: 2, layout: defaultLayout() })).status).toBe(429);
  });

  it('allows one draft save every half second per member', async () => {
    await server.close();
    server = await startTestServer({ publishCooldownMs: 0 });
    const m = await join('Mia', { memberId: newMemberId() });
    expect((await api(server.port, m, 'PUT', '/api/draft', draftBody())).status).toBe(200);
    expect((await api(server.port, m, 'PUT', '/api/draft', draftBody())).status).toBe(429);
  });
});

describe('layouts a builder should not be able to send', () => {
  it('refuses 3 000 objects, a spawn outside the office, and a grid of the wrong size', async () => {
    const m = await join('Mia', { memberId: newMemberId() });
    const many = defaultLayout();
    for (let i = 0; i < 3000; i++) many.objects.push({ id: `p${i}`, kind: 'plant', x: 1, y: 1, rot: 0 });
    expect(await api(server.port, m, 'PUT', '/api/draft', { baseRev: 1, layout: many })).toMatchObject({ status: 400, body: { error: 'bad-layout' } });
    const outside = { ...defaultLayout(), spawn: { x: 400, y: 2 } };
    expect((await api(server.port, m, 'PUT', '/api/draft', { baseRev: 1, layout: outside })).status).toBe(400);
    expect((await api(server.port, m, 'PUT', '/api/draft', { baseRev: 1, layout: { ...defaultLayout(), w: 500 } })).status).toBe(400);
  });

  it('cuts a room name of 200 characters down to 25 and leaves the server running', async () => {
    const m = await join('Mia', { memberId: newMemberId() });
    const l = defaultLayout();
    l.rooms[0].name = 'x'.repeat(200);
    expect((await api(server.port, m, 'POST', '/api/publish', { baseRev: 1, layout: l })).status).toBe(200);
    const now = (await api(server.port, m, 'GET', '/api/layout')).body.layout;
    expect(now.rooms[0].name).toHaveLength(25);
  });

  it('refuses objects of a kind that does not exist, and ids that are not safe', async () => {
    const m = await join('Mia', { memberId: newMemberId() });
    const l = defaultLayout();
    l.objects.push({ id: 'ok-id', kind: 'jacuzzi', x: 1, y: 1, rot: 0 });
    expect((await api(server.port, m, 'PUT', '/api/draft', { baseRev: 1, layout: l })).status).toBe(400);
    const l2 = defaultLayout();
    l2.objects.push({ id: '../etc', kind: 'plant', x: 1, y: 1, rot: 0 });
    expect((await api(server.port, m, 'PUT', '/api/draft', { baseRev: 1, layout: l2 })).status).toBe(400);
    expect((await api(server.port, m, 'GET', '/api/layout')).status).toBe(200); // still up
  });
});
