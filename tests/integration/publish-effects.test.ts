import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RunningServer } from '../../server/app';
import { defaultLayout } from '../../shared/default-layout';
import { cloneLayout, type Layout } from '../../shared/layout';
import { compileDefault, isBlocking, setWorld } from '../../shared/map';
import { api, connectClient, newMemberId, startTestServer, type TestClient } from './helpers';

let server: RunningServer | undefined;
let dataDir: string;
let clients: TestClient[] = [];
const join = async (name: string) => {
  const c = await connectClient(server!.port, name, { memberId: newMemberId() });
  clients.push(c);
  return c;
};
const withWalls = (l: Layout, tiles: [number, number][], code = '#'): Layout => {
  const c = cloneLayout(l);
  for (const [x, y] of tiles) {
    const i = y * c.w + x;
    c.walls = c.walls.slice(0, i) + code + c.walls.slice(i + 1);
  }
  return c;
};

beforeEach(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shyft-publish-'));
  server = await startTestServer({ dataDir, publishCooldownMs: 0, draftCooldownMs: 0 });
});
afterEach(async () => {
  clients.forEach((c) => c.close());
  clients = [];
  await server?.close();
  server = undefined;
  setWorld(compileDefault());
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('publishing a layout', () => {
  it('tells everyone, serves the new revision, and makes the new wall solid', async () => {
    const a = await join('Ana');
    const b = await join('Ben');
    const next = withWalls(defaultLayout(), [[20, 20], [21, 20], [22, 20]]);
    expect(isBlocking(21, 20)).toBe(false);

    const r = await api(server!.port, a, 'POST', '/api/publish', { baseRev: 1, layout: next });
    expect(r).toMatchObject({ status: 200, body: { rev: 2 } });

    const msg = await b.next('layout');
    expect(msg).toMatchObject({ rev: 2, by: { name: 'Ana' } });
    const got = await api(server!.port, b, 'GET', '/api/layout?rev=2');
    expect(got.body.layout.walls).toBe(next.walls);
    expect(isBlocking(21, 20)).toBe(true);
    expect((await api(server!.port, b, 'GET', '/api/layout?rev=99')).status).toBe(404);
  });

  it('moves someone standing where a wall or furniture now is, to a free tile', async () => {
    const a = await join('Ana');
    const b = await join('Ben');
    b.at(21.5, 20.5);
    await new Promise((res) => setTimeout(res, 150));
    await api(server!.port, a, 'POST', '/api/publish', { baseRev: 1, layout: withWalls(defaultLayout(), [[21, 20]]) });

    const t = await b.next('teleport', (m) => m.reason === 'layout');
    expect(isBlocking(Math.floor(t.x), Math.floor(t.y))).toBe(false);
    expect(Math.abs(t.x - 21.5) + Math.abs(t.y - 20.5)).toBeLessThanOrEqual(2);
    // Nobody else was in the way.
    expect(await a.quiet('teleport', 300)).toEqual([]);
  });

  it('refuses a layout with problems and leaves the office as it was', async () => {
    const a = await join('Ana');
    const spawn = defaultLayout().spawn;
    const blocked = withWalls(defaultLayout(), [[spawn.x, spawn.y]]);
    const r = await api(server!.port, a, 'POST', '/api/publish', { baseRev: 1, layout: blocked });
    expect(r.status).toBe(422);
    expect(r.body.problems.map((p: { code: string }) => p.code)).toContain('spawn-blocked');
    expect((await api(server!.port, a, 'GET', '/api/layout')).body.rev).toBe(1);
  });

  it('survives a restart', async () => {
    const a = await join('Ana');
    const next = withWalls(defaultLayout(), [[20, 20]]);
    await api(server!.port, a, 'POST', '/api/publish', { baseRev: 1, layout: next });
    clients.forEach((c) => c.close());
    clients = [];
    await server!.close();
    setWorld(compileDefault());

    server = await startTestServer({ dataDir, publishCooldownMs: 0 });
    const again = await join('Ana');
    expect(again.all('welcome')[0].layoutRev).toBe(2);
    expect((await api(server.port, again, 'GET', '/api/layout')).body.layout.walls).toBe(next.walls);
    expect(isBlocking(20, 20)).toBe(true);
  });

  it('puts new joiners at the spawn point of the published layout', async () => {
    const a = await join('Ana');
    const moved = cloneLayout(defaultLayout());
    moved.spawn = { x: 20, y: 21 };
    expect((await api(server!.port, a, 'POST', '/api/publish', { baseRev: 1, layout: moved })).status).toBe(200);
    const c = await join('Cat');
    expect((await a.next('join', (m) => m.player.id === c.id)).player).toMatchObject({ x: 20.5, y: 21.5 });
  });
});
