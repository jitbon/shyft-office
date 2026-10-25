import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RunningServer } from '../../server/app';
import { defaultLayout } from '../../shared/default-layout';
import { cloneLayout, type Layout } from '../../shared/layout';
import { compileDefault, setWorld } from '../../shared/map';
import { api, connectClient, newMemberId, startTestServer, type TestClient } from './helpers';

let server: RunningServer;
let clients: TestClient[] = [];
const join = async (name: string) => {
  const c = await connectClient(server.port, name, { memberId: newMemberId() });
  clients.push(c);
  return c;
};
const edit = (l: Layout, f: (c: Layout) => void): Layout => {
  const c = cloneLayout(l);
  f(c);
  return c;
};
const setFloor = (c: Layout, x: number, y: number, code: string) => {
  const i = y * c.w + x;
  c.floor = c.floor.slice(0, i) + code + c.floor.slice(i + 1);
};
const moveObj = (c: Layout, id: string, x: number, y: number) => {
  const o = c.objects.find((q) => q.id === id)!;
  o.x = x;
  o.y = y;
};

beforeEach(async () => {
  server = await startTestServer({ publishCooldownMs: 0, draftCooldownMs: 0 });
});
afterEach(async () => {
  clients.forEach((c) => c.close());
  clients = [];
  await server.close();
  setWorld(compileDefault());
});

describe('two builders at once', () => {
  it('merges a publish made from an older revision when the edits do not touch', async () => {
    const a = await join('Ana');
    const b = await join('Ben');
    const base = defaultLayout();
    expect((await api(server.port, a, 'POST', '/api/publish', { baseRev: 1, layout: edit(base, (c) => setFloor(c, 20, 20, ',')) })).status).toBe(200);
    // Ben started from revision 1 too, and moves a plant.
    const r = await api(server.port, b, 'POST', '/api/publish', { baseRev: 1, layout: edit(base, (c) => moveObj(c, 'plant-14-1', 15, 1)) });
    expect(r).toMatchObject({ status: 200, body: { rev: 3 } });
    const now = (await api(server.port, b, 'GET', '/api/layout')).body.layout as Layout;
    expect(now.floor[20 * now.w + 20]).toBe(',');
    expect(now.objects.find((o) => o.id === 'plant-14-1')).toMatchObject({ x: 15, y: 1 });
  });

  it('answers 409 with the clash when both moved the same object', async () => {
    const a = await join('Ana');
    const b = await join('Ben');
    const base = defaultLayout();
    expect((await api(server.port, a, 'POST', '/api/publish', { baseRev: 1, layout: edit(base, (c) => moveObj(c, 'plant-14-1', 15, 1)) })).status).toBe(200);
    const r = await api(server.port, b, 'POST', '/api/publish', { baseRev: 1, layout: edit(base, (c) => moveObj(c, 'plant-14-1', 16, 1)) });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ error: 'clash', currentRev: 2 });
    expect(r.body.clashes.map((c: { key: string }) => c.key)).toEqual(['obj:plant-14-1']);
    // Nothing was published.
    expect((await api(server.port, b, 'GET', '/api/layout')).body.rev).toBe(2);
  });

  it('treats a draft whose base has dropped out of history as all clashes', async () => {
    const a = await join('Ana');
    let l = defaultLayout();
    for (let i = 0; i < 11; i++) {
      l = edit(l, (c) => setFloor(c, 20, 20 + (i % 2), i % 2 ? ',' : ';'));
      expect((await api(server.port, a, 'POST', '/api/publish', { baseRev: i + 1, layout: l })).status).toBe(200);
    }
    const b = await join('Ben');
    const old = edit(defaultLayout(), (c) => setFloor(c, 5, 25, ','));
    const r = await api(server.port, b, 'POST', '/api/publish', { baseRev: 1, layout: old });
    expect(r.status).toBe(409);
    expect(r.body.clashes.length).toBeGreaterThan(0);
  });
});
