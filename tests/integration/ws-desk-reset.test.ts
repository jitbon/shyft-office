import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RunningServer } from '../../server/app';
import { DESKS } from '../../shared/map';
import { connectClient, startTestServer, type TestClient } from './helpers';

// When the office was redesigned, every old desk claim was released. Each former holder is told once.

const DESK = DESKS[0].id;
const uuid = () => crypto.randomUUID();
const isReset = (m: { kind: string }) => m.kind === 'deskReset';

let dataDir: string;
let server: RunningServer | undefined;
let clients: TestClient[] = [];
const join = async (name: string, memberId: string) => {
  const c = await connectClient(server!.port, name, { memberId });
  clients.push(c);
  return c;
};

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shyft-reset-'));
});
afterEach(async () => {
  clients.forEach((c) => c.close());
  clients = [];
  await server?.close();
  server = undefined;
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const writeOldOffice = (holders: string[]) =>
  fs.writeFileSync(
    path.join(dataDir, 'office-state.json'),
    JSON.stringify({
      version: 1,
      deskClaims: Object.fromEntries(holders.map((id, i) => [`pod-${i + 1}:4,12`, { memberId: id, name: `Old ${i}`, claimedAt: i }])),
      podModes: { 'pod-1': 'cubicle' },
      areaAllowed: {},
    }),
  );

describe('desks reset by the redesign', () => {
  it('tells each former desk holder once, and nobody else', async () => {
    const [m, n, other] = [uuid(), uuid(), uuid()];
    writeOldOffice([m, n]);
    server = await startTestServer({ dataDir });

    const a = await join('M', m);
    expect(await a.next('notify', isReset)).toMatchObject({ kind: 'deskReset' });
    // Every desk is free (the snapshot lists only claimed desks), and the old pod mode is gone.
    const welcome = a.all('welcome')[0];
    expect(welcome.office!.desks).toEqual([]);
    expect(welcome.office!.pods).toHaveLength(3);
    expect(welcome.office!.pods.every((p) => p.mode === 'ambient')).toBe(true);

    // A newcomer who never had a desk hears nothing.
    const c = await join('Other', other);
    expect(await c.quiet('notify', 300)).toHaveLength(0);

    // The same person reconnecting, or opening a second tab, is not told again.
    a.close();
    const again = await join('M', m);
    const second = await join('M', m);
    expect(await again.quiet('notify', 300)).toHaveLength(0);
    expect(await second.quiet('notify', 300)).toHaveLength(0);

    // The other holder is still waiting to be told.
    const b = await join('N', n);
    expect(await b.next('notify', isReset)).toMatchObject({ kind: 'deskReset' });
  });

  it('saves the upgrade at once, so a restart does not reset again and new claims survive', async () => {
    const m = uuid();
    writeOldOffice([m]);
    server = await startTestServer({ dataDir });
    expect(JSON.parse(fs.readFileSync(path.join(dataDir, 'office-state.json'), 'utf8'))).toMatchObject({
      version: 3, deskClaims: {}, deskNotice: [{ memberId: m, kind: 'reset' }],
    });

    let a = await join('M', m);
    await a.next('notify', isReset);
    a.send({ t: 'desk', op: 'claim', deskId: DESK });
    await a.next('office', (o) => o.desks.some((d) => d.id === DESK && d.owner?.memberId === m));
    a.close();
    await server.close(); // writes the pending save

    server = await startTestServer({ dataDir });
    a = await join('M', m);
    expect(await a.quiet('notify', 300)).toHaveLength(0);
    expect(a.all('welcome')[0].office!.desks.find((d) => d.id === DESK)).toMatchObject({ owner: { memberId: m, online: true } });
  });

  it('does not tell guests', async () => {
    writeOldOffice([uuid()]);
    server = await startTestServer({ dataDir });
    const guest = await connectClient(server.port, 'Guest'); // no member id: a guest for this visit
    clients.push(guest);
    expect(await guest.quiet('notify', 300)).toHaveLength(0);
  });
});
