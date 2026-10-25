import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RunningServer } from '../../server/app';
import { setCustomObjects } from '../../shared/catalog';
import { defaultLayout } from '../../shared/default-layout';
import { cloneLayout } from '../../shared/layout';
import { compileDefault, setWorld } from '../../shared/map';
import { expectedSize, viewRect, type ObjectMeta } from '../../shared/objects';
import { api, connectClient, newMemberId, startTestServer, type TestClient } from './helpers';

const META: ObjectMeta = { name: 'Vending machine', footprint: [1, 1], height: 64, blocks: true, frames: 2, fps: 4, back: false };

/** A valid sheet: something opaque in every view of every frame. */
function sheetPng(meta = META, size = expectedSize(meta)): string {
  const png = new PNG({ width: size.width, height: size.height });
  for (const view of ['top', 'front', 'side'] as const) {
    for (let f = 0; f < meta.frames; f++) {
      const r = viewRect(meta, view, f);
      if (r.y + 3 < size.height && r.x + 3 < size.width) png.data.set([200, 60, 60, 255], ((r.y + 2) * size.width + r.x + 2) * 4);
    }
  }
  return PNG.sync.write(png).toString('base64');
}

let server: RunningServer | undefined;
let dataDir: string;
let clients: TestClient[] = [];
const join = async (name: string, member = true) => {
  const c = await connectClient(server!.port, name, member ? { memberId: newMemberId() } : {});
  clients.push(c);
  return c;
};
const upload = (who: TestClient, png = sheetPng(), meta: unknown = META) => api(server!.port, who, 'POST', '/api/objects', { png, meta });

beforeEach(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shyft-objects-'));
  server = await startTestServer({ dataDir, publishCooldownMs: 0, draftCooldownMs: 0 });
});
afterEach(async () => {
  clients.forEach((c) => c.close());
  clients = [];
  await server?.close();
  server = undefined;
  setCustomObjects([]);
  setWorld(compileDefault());
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('uploading a custom object', () => {
  it('accepts a good sheet, tells everyone, and serves it', async () => {
    const a = await join('Ana');
    const b = await join('Ben');
    const r = await upload(a);
    expect(r.status).toBe(201);
    expect(r.body.object).toMatchObject({ name: 'Vending machine', footprint: [1, 1], height: 64, frames: 2, author: 'Ana' });
    expect(r.body.object.id).toMatch(/^vending-machine-[0-9a-f]{4}$/);
    const msg = await b.next('objects');
    expect(msg.objects.map((o) => o.id)).toEqual([r.body.object.id]);
    const png = await fetch(`http://localhost:${server!.port}${r.body.object.url}`);
    expect(png.status).toBe(200);
    expect(png.headers.get('content-type')).toBe('image/png');
    expect(PNG.sync.read(Buffer.from(await png.arrayBuffer())).width).toBe(64);
    // Someone who joins later is told in their welcome.
    const c = await join('Cat');
    expect(c.all('welcome')[0].objects?.map((o) => o.id)).toEqual([r.body.object.id]);
  });

  it('rejects a sheet of the wrong size with the size it wanted, and nobody else sees it', async () => {
    const a = await join('Ana');
    const b = await join('Ben');
    const r = await upload(a, sheetPng(META, { width: 33, height: 64 }));
    expect(r).toMatchObject({ status: 400, body: { error: 'bad-sheet', errors: ['bad-size:64x160'] } });
    expect(await b.quiet('objects', 300)).toEqual([]);
    expect(fs.existsSync(path.join(dataDir, 'objects'))).toBe(false);
  });

  it('names what is wrong with the description, and with a file that is not a PNG', async () => {
    const a = await join('Ana');
    expect((await upload(a, sheetPng(), { ...META, height: 60 })).body.errors).toEqual(['bad-height']);
    expect((await upload(a, Buffer.from('not a png').toString('base64'))).body.errors).toEqual(['not-png']);
    expect((await api(server!.port, a, 'POST', '/api/objects', { meta: META })).status).toBe(400);
  });

  it('refuses guests', async () => {
    const guest = await join('Gus', false);
    expect(await upload(guest)).toMatchObject({ status: 403, body: { error: 'not-builder' } });
  });

  it('allows ten uploads a minute per member', async () => {
    const a = await join('Ana');
    for (let i = 0; i < 10; i++) expect((await upload(a)).status).toBe(201);
    expect((await upload(a)).status).toBe(429);
  });

  it('keeps at most 100 objects', async () => {
    await server!.close();
    server = await startTestServer({ dataDir, uploadsPerMinute: 1000 });
    const a = await join('Ana');
    for (let i = 0; i < 100; i++) expect((await upload(a)).status, `upload ${i}`).toBe(201);
    expect(await upload(a)).toMatchObject({ status: 409, body: { error: 'too-many' } });
  }, 30_000);

  it('is still there after a restart, and a damaged file is skipped, not served', async () => {
    const a = await join('Ana');
    const id = (await upload(a)).body.object.id as string;
    fs.writeFileSync(path.join(dataDir, 'objects', 'broken-0000.png'), 'nope');
    fs.writeFileSync(path.join(dataDir, 'objects', 'broken-0000.json'), JSON.stringify(META));
    clients.forEach((c) => c.close());
    clients = [];
    await server!.close();
    server = await startTestServer({ dataDir });
    const again = await join('Ana');
    expect(again.all('welcome')[0].objects?.map((o) => o.id)).toEqual([id]);
    expect((await fetch(`http://localhost:${server.port}/objects/broken-0000.png`)).status).toBe(404);
  });
});

describe('removing a custom object', () => {
  it('reports how many copies are placed, and with confirmation takes them out in a revision of their own', async () => {
    const a = await join('Ana');
    const b = await join('Ben');
    const id = (await upload(a)).body.object.id as string;
    // Ana places two copies on free floor in the lobby and publishes.
    const layout = cloneLayout(defaultLayout());
    layout.objects.push({ id: 'vend-1', kind: `custom:${id}`, x: 15, y: 19, rot: 0 }, { id: 'vend-2', kind: `custom:${id}`, x: 23, y: 19, rot: 2 });
    expect((await api(server!.port, a, 'POST', '/api/publish', { baseRev: 1, layout })).status).toBe(200);

    expect((await api(server!.port, b, 'DELETE', `/api/objects/${id}`)).body).toEqual({ placed: 2 });
    expect((await api(server!.port, b, 'GET', '/api/layout')).body.layout.objects.some((o: { kind: string }) => o.kind.startsWith('custom:'))).toBe(true);

    const gone = await api(server!.port, b, 'DELETE', `/api/objects/${id}?confirm=1`);
    expect(gone).toMatchObject({ status: 200, body: { rev: 3 } });
    const now = (await api(server!.port, b, 'GET', '/api/layout')).body;
    expect(now.rev).toBe(3);
    expect(now.by.name).toBe('Ben');
    expect(now.layout.objects.some((o: { kind: string }) => o.kind.startsWith('custom:'))).toBe(false);
    expect((await a.next('objects', (m) => m.objects.length === 0)).objects).toEqual([]);
    expect((await fetch(`http://localhost:${server!.port}/objects/${id}.png`)).status).toBe(404);
    expect((await api(server!.port, b, 'DELETE', `/api/objects/${id}`)).status).toBe(404);
  });

  it('removes an object nobody placed without publishing anything', async () => {
    const a = await join('Ana');
    const id = (await upload(a)).body.object.id as string;
    expect((await api(server!.port, a, 'DELETE', `/api/objects/${id}?confirm=1`)).body).toEqual({ rev: 1 });
  });

  it('will not accept a layout that uses an object that is gone', async () => {
    const a = await join('Ana');
    const layout = cloneLayout(defaultLayout());
    layout.objects.push({ id: 'vend-1', kind: 'custom:nope-0000', x: 15, y: 19, rot: 0 });
    const r = await api(server!.port, a, 'POST', '/api/publish', { baseRev: 1, layout });
    expect(r).toMatchObject({ status: 400, body: { error: 'bad-layout' } });
  });
});
