import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RunningServer } from '../../server/app';
import { defaultLayout } from '../../shared/default-layout';
import { compileDefault, setWorld } from '../../shared/map';
import { api, connectClient, startTestServer, type TestClient } from './helpers';

// Quickstart Q0: the first start with the builder keeps the office exactly as it was, claims, access lists and all.

let server: RunningServer | undefined;
let dataDir: string;
let clients: TestClient[] = [];

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shyft-upgrade-'));
});
afterEach(async () => {
  clients.forEach((c) => c.close());
  clients = [];
  await server?.close();
  server = undefined;
  setWorld(compileDefault());
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const uuid = () => crypto.randomUUID();

describe('upgrading an office saved before the builder existed', () => {
  it('keeps every desk claim, pod mode and access list, and makes the old office revision 1', async () => {
    const [ana, ben] = [uuid(), uuid()];
    fs.writeFileSync(
      path.join(dataDir, 'office-state.json'),
      JSON.stringify({
        version: 2,
        // Version 2 named a desk after its pod and chair position.
        deskClaims: {
          'pod-1:6,12': { memberId: ana, name: 'Ana', claimedAt: 1 },
          'pod-3:34,15': { memberId: ben, name: 'Ben', claimedAt: 2 },
        },
        podModes: { 'pod-2': 'cubicle' },
        areaAllowed: { 'meet-b': [ana] },
        deskResetNotice: [],
      }),
    );
    server = await startTestServer({ dataDir });

    // The saved file is version 3 straight away, and the old office is the first published layout.
    expect(JSON.parse(fs.readFileSync(path.join(dataDir, 'office-state.json'), 'utf8'))).toMatchObject({
      version: 3,
      deskClaims: { 'desk-5-13': { memberId: ana }, 'desk-33-14': { memberId: ben } },
      podModes: { 'pod-2': 'cubicle' },
      areaAllowed: { 'meet-b': [ana] },
      buildingEnabled: true,
    });
    const layout = JSON.parse(fs.readFileSync(path.join(dataDir, 'layout.json'), 'utf8'));
    expect(layout.rev).toBe(1);
    expect(layout.current.layout).toEqual(JSON.parse(JSON.stringify(defaultLayout())));

    const c = await connectClient(server.port, 'Ana', { memberId: ana });
    clients.push(c);
    const office = c.all('welcome')[0].office!;
    expect(office.desks.map((d) => [d.id, d.owner?.name]).sort()).toEqual([['desk-33-14', 'Ben'], ['desk-5-13', 'Ana']]);
    expect(office.pods.find((p) => p.id === 'pod-2')?.mode).toBe('cubicle');
    expect(await c.quiet('notify', 300)).toEqual([]); // nobody lost a desk, so nobody is told
    expect((await api(server.port, c, 'GET', '/api/layout')).body.rev).toBe(1);
  });
});
