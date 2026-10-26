import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RunningServer } from '../../server/app';
import { LayoutStore } from '../../server/layout-store';
import { builtInCatalog, currentCatalog, setCustomObjects } from '../../shared/catalog';
import { defaultLayout } from '../../shared/default-layout';
import { cloneLayout } from '../../shared/layout';
import { compileDefault, setWorld } from '../../shared/map';
import { expectedSize, viewRect, type ObjectMeta } from '../../shared/objects';
import { api, connectClient, newMemberId, startTestServer, type TestClient } from './helpers';

// Quickstart Q0: a data folder written before this feature (layout format 1 with a custom object and desk claims) opens
// unchanged, and nothing is rewritten just by starting up and looking around.

const META: ObjectMeta = { name: 'Vending machine', footprint: [1, 1], height: 64, blocks: true, frames: 1, fps: 4, back: false };
let server: RunningServer | undefined;
let dataDir: string;
let clients: TestClient[] = [];
const sha = (file: string) => crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex');

function writeSheet(dir: string, id: string) {
  const size = expectedSize(META);
  const png = new PNG({ width: size.width, height: size.height });
  for (const view of ['top', 'front', 'side'] as const) {
    const r = viewRect(META, view, 0);
    png.data.set([200, 60, 60, 255], ((r.y + 2) * size.width + r.x + 2) * 4);
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id}.png`), PNG.sync.write(png));
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({ ...META, format: 1, author: 'Ana' }));
}

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shyft-upgrade-'));
  writeSheet(path.join(dataDir, 'objects'), 'vending-machine-ab12');
  setCustomObjects([]);
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

describe('opening data from before the furniture studio', () => {
  it('keeps the layout, the desk claim, the custom object and every file as they were', async () => {
    // The layout as feature 003 wrote it: format 1, the custom object placed, no item fields anywhere.
    const first = await startTestServer({ dataDir, adminToken: 'letmein' });
    await first.close();
    setCustomObjects([]);
    const layout = cloneLayout(defaultLayout());
    layout.objects.push({ id: 'vend-1', kind: 'custom:vending-machine-ab12', x: 20, y: 12, rot: 0 });
    const store = LayoutStore.load(dataDir);
    store.publish(layout, { memberId: 'old-admin', name: 'Old Admin' });
    fs.writeFileSync(
      path.join(dataDir, 'office-state.json'),
      JSON.stringify({ version: 3, deskClaims: { 'desk-5-13': { memberId: '11111111-1111-4111-8111-111111111111', name: 'Sam', claimedAt: 5 } }, podModes: {}, areaAllowed: {}, deskNotice: [], buildingEnabled: true }),
    );
    const layoutFile = path.join(dataDir, 'layout.json');
    const before = sha(layoutFile);
    const written = JSON.parse(fs.readFileSync(layoutFile, 'utf8'));
    for (const o of written.current.layout.objects) expect(Object.keys(o).filter((k) => ['v', 'on', 'at', 'wall'].includes(k)), o.id).toEqual([]);

    setCustomObjects([]);
    server = await startTestServer({ dataDir, adminToken: 'letmein' });
    const c = await connectClient(server.port, 'Ana', { memberId: newMemberId() });
    clients.push(c);

    const welcome = c.all('welcome')[0];
    expect(welcome.items).toEqual([]);
    expect(welcome.objects?.map((o) => o.id)).toEqual(['vending-machine-ab12']);
    expect(welcome.office?.desks.find((d) => d.id === 'desk-5-13')?.owner).toMatchObject({ memberId: '11111111-1111-4111-8111-111111111111', name: 'Sam' });
    const now = (await api(server.port, c, 'GET', '/api/layout')).body;
    expect(now.rev).toBe(2);
    expect(now.layout.objects.find((o: { id: string }) => o.id === 'vend-1')).toMatchObject({ kind: 'custom:vending-machine-ab12', x: 20, y: 12, rot: 0 });
    expect(now.layout.rooms.length).toBe(defaultLayout().rooms.length);
    expect((await api(server.port, c, 'GET', '/api/items')).body).toEqual({ items: [], older: [] });

    const cat = currentCatalog();
    for (const id of ['desk', 'desk-small', 'chair', 'table', 'plant', 'sofa', 'custom:vending-machine-ab12']) expect(cat.has(id), id).toBe(true);
    expect(builtInCatalog().get('desk')).toMatchObject({ kind: 'floor', group: 'desks', by: 'Shyft' });
    expect(sha(layoutFile)).toBe(before); // starting up and looking around wrote nothing
  });
});
