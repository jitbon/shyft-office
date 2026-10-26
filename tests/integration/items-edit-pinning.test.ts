import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RunningServer } from '../../server/app';
import { setStudioItems } from '../../shared/catalog';
import { defaultLayout } from '../../shared/default-layout';
import { NO_WALL, cloneLayout, type Layout } from '../../shared/layout';
import { compileDefault, setWorld } from '../../shared/map';
import { compileWorld } from '../../shared/world';
import { itemDef, openSpots, part } from '../unit/fixtures/items';
import { api, connectClient, newMemberId, startTestServer, type TestClient } from './helpers';

let server: RunningServer | undefined;
let dataDir: string;
let clients: TestClient[] = [];
const member = async (name: string) => {
  const c = await connectClient(server!.port, name, { memberId: newMemberId() });
  clients.push(c);
  return c;
};
const shelf = (w: number) => itemDef('floor', { name: 'Shelf', group: 'shelves', footprint: [w, 1], parts: [part({ w, d: 1, h: 0.9 })] });
const lamp = (s: number) => itemDef('deskitem', { name: 'Lamp', footprint: [s, s], parts: [part({ w: s / 2, d: s / 2, h: 0.2 })] });

/** An open tile with a wall right beside it on the east, so a wider thing cannot grow there. */
function hemmed(l: Layout): [number, number] {
  const w = compileWorld(l);
  for (let y = 1; y < l.h - 1; y++) {
    for (let x = 1; x < l.w - 2; x++) {
      const free = (tx: number, ty: number) => !w.block[ty * l.w + tx] && w.grid[ty][tx] === l.floor[ty * l.w + tx];
      if (free(x, y) && l.walls[y * l.w + x + 1] !== NO_WALL && (x !== l.spawn.x || y !== l.spawn.y)) return [x, y];
    }
  }
  throw new Error('no hemmed-in tile');
}

beforeEach(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shyft-pin-'));
  server = await startTestServer({ dataDir, publishCooldownMs: 0, draftCooldownMs: 0, itemSavesPerMinute: 100 });
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

const current = async (c: TestClient) => (await api(server!.port, c, 'GET', '/api/layout')).body as { rev: number; layout: Layout; by: { name: string } };

describe('changing an item that is already placed', () => {
  it('keeps the copy that cannot grow at its old version, and says how many', async () => {
    const a = await member('Ana');
    const saved = await api(server!.port, a, 'POST', '/api/items', { def: shelf(1) });
    const id = saved.body.item.id as string;
    const base = cloneLayout(defaultLayout());
    const [p1, p2] = openSpots(base, 2);
    const h = hemmed(base);
    base.objects.push(
      { id: 's1', kind: `item:${id}`, x: p1[0], y: p1[1], rot: 0 },
      { id: 's2', kind: `item:${id}`, x: p2[0], y: p2[1], rot: 0 },
      { id: 's3', kind: `item:${id}`, x: h[0], y: h[1], rot: 0 },
    );
    const pub = await api(server!.port, a, 'POST', '/api/publish', { baseRev: 1, layout: base });
    expect(pub.status, JSON.stringify(pub.body)).toBe(200);

    const b = await member('Ben'); // someone else is watching
    const edit = await api(server!.port, a, 'POST', '/api/items', { id, def: shelf(2) });
    expect(edit).toMatchObject({ status: 200, body: { pinned: 1, item: { version: 2 } } });
    await b.next('items');
    await b.next('layout', (m) => m.rev === pub.body.rev + 1);

    const now = await current(a);
    expect(now.by).toEqual({ name: 'Ana' });
    expect(now.layout.objects.find((o) => o.id === 's3')?.v).toBe(1);
    expect(now.layout.objects.find((o) => o.id === 's1')?.v).toBeUndefined();
    expect(now.layout.objects.find((o) => o.id === 's2')?.v).toBeUndefined();
    const w = compileWorld(now.layout);
    expect(w.objects.find((o) => o.obj.id === 's1')).toMatchObject({ w: 2, d: 1 });
    expect(w.objects.find((o) => o.obj.id === 's3')).toMatchObject({ w: 1, d: 1 });
    expect(fs.existsSync(path.join(dataDir, 'items', `${id}@1.json`))).toBe(true);
  });

  it('pins nothing, and publishes nothing, when only the look changes', async () => {
    const a = await member('Ana');
    const id = (await api(server!.port, a, 'POST', '/api/items', { def: shelf(1) })).body.item.id as string;
    const base = cloneLayout(defaultLayout());
    const [p1] = openSpots(base, 1);
    base.objects.push({ id: 's1', kind: `item:${id}`, x: p1[0], y: p1[1], rot: 0 });
    await api(server!.port, a, 'POST', '/api/publish', { baseRev: 1, layout: base });
    const rev = (await current(a)).rev;
    const recolored = { ...shelf(1), parts: [part({ w: 1, d: 1, h: 0.5, color: '#ff0000' })] };
    expect(await api(server!.port, a, 'POST', '/api/items', { id, def: recolored })).toMatchObject({ status: 200, body: { pinned: 0 } });
    expect((await current(a)).rev).toBe(rev);
    expect(fs.existsSync(path.join(dataDir, 'items', `${id}@1.json`))).toBe(false);
  });

  it('pins a desk item that no longer fits on its desk', async () => {
    const a = await member('Ana');
    const id = (await api(server!.port, a, 'POST', '/api/items', { def: lamp(0.5) })).body.item.id as string;
    const base = cloneLayout(defaultLayout());
    const desk = base.objects.find((o) => o.kind === 'desk')!;
    base.objects.push({ id: 'l1', kind: `item:${id}`, x: 0, y: 0, rot: 0, on: desk.id, at: [0.5, 0] }, { id: 'l2', kind: `item:${id}`, x: 0, y: 0, rot: 0, on: desk.id, at: [2.5, 0] });
    const pub = await api(server!.port, a, 'POST', '/api/publish', { baseRev: 1, layout: base });
    expect(pub.status, JSON.stringify(pub.body)).toBe(200);
    const edit = await api(server!.port, a, 'POST', '/api/items', { id, def: lamp(1) });
    expect(edit.body.pinned).toBe(1);
    const now = await current(a);
    expect(now.layout.objects.find((o) => o.id === 'l2')?.v).toBe(1);
    expect(now.layout.objects.find((o) => o.id === 'l1')?.v).toBeUndefined();
  });

  it('keeps the older version while a copy uses it, and drops it when none does', async () => {
    const a = await member('Ana');
    const id = (await api(server!.port, a, 'POST', '/api/items', { def: shelf(1) })).body.item.id as string;
    const base = cloneLayout(defaultLayout());
    const h = hemmed(base);
    base.objects.push({ id: 's3', kind: `item:${id}`, x: h[0], y: h[1], rot: 0 });
    await api(server!.port, a, 'POST', '/api/publish', { baseRev: 1, layout: base });
    await api(server!.port, a, 'POST', '/api/items', { id, def: shelf(2) });
    const file = path.join(dataDir, 'items', `${id}@1.json`);
    expect(fs.existsSync(file)).toBe(true);
    const now = await current(a);
    const without = cloneLayout(now.layout);
    without.objects = without.objects.filter((o) => o.id !== 's3');
    expect((await api(server!.port, a, 'POST', '/api/publish', { baseRev: now.rev, layout: without })).status).toBe(200);
    expect(fs.existsSync(file)).toBe(false);
  });
});
