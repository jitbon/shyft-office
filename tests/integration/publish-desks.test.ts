import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RunningServer } from '../../server/app';
import { defaultLayout } from '../../shared/default-layout';
import { cloneLayout, type Layout } from '../../shared/layout';
import { compileDefault, setWorld } from '../../shared/map';
import { api, connectClient, newMemberId, startTestServer, type TestClient } from './helpers';

let server: RunningServer | undefined;
let dataDir: string;
let clients: TestClient[] = [];
const join = async (name: string, memberId = newMemberId()) => {
  const c = await connectClient(server!.port, name, { memberId });
  clients.push(c);
  return c;
};
const publish = (who: TestClient, layout: Layout, baseRev: number) =>
  api(server!.port, who, 'POST', '/api/publish', { baseRev, layout });
/** Pod 4 is open floor in the middle of the office: room for one desk with its chair. */
const withPod4 = () => {
  const l = cloneLayout(defaultLayout());
  l.pods.push({ id: 'pod-4', name: 'Desk pod 4', rects: [[18, 1, 21, 9]], mode: 'ambient' });
  return l;
};
const moveDeskToPod4 = (l: Layout) => {
  const d = l.objects.find((o) => o.id === 'desk-5-13')!;
  const c = l.objects.find((o) => o.id === 'chair-6-12')!;
  Object.assign(d, { x: 18, y: 3 });
  Object.assign(c, { x: 19, y: 2 });
};
const without = (l: Layout, ...ids: string[]) => {
  const c = cloneLayout(l);
  c.objects = c.objects.filter((o) => !ids.includes(o.id));
  return c;
};

beforeEach(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shyft-pubdesks-'));
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

describe('desk claims when the layout changes', () => {
  it('follow their desk when it moves, so walk-to-desk goes to the new spot', async () => {
    const builder = await join('Ana');
    const owner = await join('Ben');
    owner.send({ t: 'desk', op: 'claim', deskId: 'desk-5-13' });
    await owner.next('office', (o) => o.desks.some((d) => d.id === 'desk-5-13'));

    const moved = withPod4();
    moveDeskToPod4(moved);
    expect((await publish(builder, moved, 1)).status).toBe(200);
    const snap = await owner.next('office', (o) => o.pods.some((p) => p.id === 'pod-4'));
    expect(snap.desks.find((d) => d.id === 'desk-5-13')?.owner?.memberId).toBeTruthy();

    owner.send({ t: 'walkToDesk' });
    expect(await owner.next('teleport', (t) => t.reason === 'desk')).toMatchObject({ x: 19.5, y: 2.5 });
  });

  it('are released, and the holder told at once, when the desk is deleted', async () => {
    const builder = await join('Ana');
    const owner = await join('Ben');
    owner.send({ t: 'desk', op: 'claim', deskId: 'desk-5-13' });
    await owner.next('office', (o) => o.desks.some((d) => d.id === 'desk-5-13'));

    expect((await publish(builder, without(defaultLayout(), 'desk-5-13'), 1)).status).toBe(200);
    const note = await owner.next('notify', (n) => n.kind === 'deskRemoved');
    expect(note.text).toMatch(/removed/);
    const snap = await owner.next('office', (o) => !o.desks.some((d) => d.id === 'desk-5-13'));
    expect(snap.desks).toEqual([]);
    expect(await builder.quiet('notify', 300)).toEqual([]); // nobody else is told
  });

  it('tell an offline holder once, on their next join', async () => {
    const builder = await join('Ana');
    const memberId = newMemberId();
    const owner = await join('Ben', memberId);
    owner.send({ t: 'desk', op: 'claim', deskId: 'desk-9-13' });
    await owner.next('office', (o) => o.desks.some((d) => d.id === 'desk-9-13'));
    owner.close();
    await new Promise((r) => setTimeout(r, 200));

    expect((await publish(builder, without(defaultLayout(), 'desk-9-13'), 1)).status).toBe(200);

    const back = await join('Ben', memberId);
    expect(await back.next('notify', (n) => n.kind === 'deskRemoved')).toMatchObject({ kind: 'deskRemoved' });
    back.close();
    const again = await join('Ben', memberId);
    expect(await again.quiet('notify', 400)).toEqual([]);
  });
});
