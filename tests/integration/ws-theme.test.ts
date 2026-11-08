import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { RunningServer } from '../../server/app';
import { defaultLayout } from '../../shared/default-layout';
import { cloneLayout, type Layout } from '../../shared/layout';
import { compileDefault, setWorld } from '../../shared/map';
import { api, connectClient, newMemberId, startTestServer, type TestClient } from './helpers';

let server: RunningServer | undefined;
let clients: TestClient[] = [];
afterEach(async () => {
  clients.forEach((c) => c.close());
  clients = [];
  await server?.close();
  setWorld(compileDefault());
});

const member = async (name: string, opts: { admin?: string } = {}) => {
  const c = await connectClient(server!.port, name, { memberId: newMemberId(), ...opts });
  clients.push(c);
  return c;
};
const themed = (theme: string) => ({ ...cloneLayout(defaultLayout()), theme });
const current = async (c: TestClient) => ((await api(server!.port, c, 'GET', '/api/layout')).body as { layout: Layout }).layout;

describe('publishing a theme', () => {
  it('reaches a second client within two seconds, and moves nothing', async () => {
    server = await startTestServer({ publishCooldownMs: 0 });
    const [a, b] = [await member('Ana'), await member('Ben')];
    const before = await current(b);
    const started = Date.now();
    expect((await api(server.port, a, 'POST', '/api/publish', { baseRev: 1, layout: themed('industrial-loft') })).status).toBe(200);
    await b.next('layout', undefined, 2000);
    expect(Date.now() - started).toBeLessThan(2000);
    const after = await current(b);
    expect(after.theme).toBe('industrial-loft');
    expect(after.objects).toEqual(before.objects);
    expect(after.rooms).toEqual(before.rooms);
    expect(after.pods).toEqual(before.pods);
    expect(after.spawn).toEqual(before.spawn);
    expect(after.floor).toBe(before.floor);
    expect(after.walls).toBe(before.walls);
  });

  it('is kept across a restart', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shyft-theme-'));
    server = await startTestServer({ dataDir, publishCooldownMs: 0 });
    const a = await member('Ana');
    await api(server.port, a, 'POST', '/api/publish', { baseRev: 1, layout: themed('cozy-cabin') });
    clients.forEach((c) => c.close());
    clients = [];
    await server.close();
    server = await startTestServer({ dataDir });
    const b = await member('Ben');
    expect((await current(b)).theme).toBe('cozy-cabin');
  });

  it('refuses a theme that does not exist', async () => {
    server = await startTestServer({ publishCooldownMs: 0 });
    const a = await member('Ana');
    const res = await api(server.port, a, 'POST', '/api/publish', { baseRev: 1, layout: themed('neon-dreams') });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('bad-theme');
  });

  it('is refused for a non-admin while building is off, as any publish is', async () => {
    server = await startTestServer({ publishCooldownMs: 0, adminToken: 'letmein' });
    const [admin, a] = [await member('Root', { admin: 'letmein' }), await member('Ana')];
    admin.send({ t: 'admin', op: 'building', enabled: false });
    await a.next('building');
    const res = await api(server.port, a, 'POST', '/api/publish', { baseRev: 1, layout: themed('night-mode') });
    expect(res.status).toBe(403);
  });
});

describe('season and clock', () => {
  it('puts the season, the server clock and its offset in the welcome', async () => {
    server = await startTestServer({ clock: { startAt: new Date(2026, 11, 20, 21, 30).getTime() } });
    const w = (await member('Ana')).all('welcome')[0];
    expect(w.season).toBe('winter');
    expect(typeof w.tzOffsetMin).toBe('number');
    expect(Math.abs(w.now! - (new Date(2026, 11, 20, 21, 30).getTime() + 0))).toBeLessThan(10_000);
  });

  it('runs the seasons the other way round in the southern hemisphere', async () => {
    server = await startTestServer({ clock: { startAt: new Date(2026, 11, 20).getTime(), hemisphere: 'south' } });
    expect((await member('Ana')).all('welcome')[0].season).toBe('summer');
  });

  it('tells everyone when the hourly check sees the season change', async () => {
    let now = new Date(2026, 4, 31, 23).getTime(); // the last evening of spring
    server = await startTestServer({ clock: { now: () => now, seasonCheckMs: 30 } });
    const a = await member('Ana');
    expect(a.all('welcome')[0].season).toBe('spring');
    now = new Date(2026, 5, 1, 1).getTime();
    expect((await a.next('season', undefined, 2000)).season).toBe('summer');
    expect(await a.quiet('season', 150)).toEqual([]); // told once, not every check
  });
});
