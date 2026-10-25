import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import type { RunningServer } from '../../server/app';
import { startServer } from '../../server/app';
import { connectClient, startTestServer, type TestClient } from './helpers';

// Hostile or broken input from one client must never take the office down for everyone else.

let server: RunningServer;
let clients: TestClient[] = [];
let warn: ReturnType<typeof vi.spyOn>;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Opens a bare socket (no join) and sends raw frames. */
async function raw(port: number, frames: (string | Buffer)[], joinFirst = false) {
  const ws = new WebSocket(`ws://localhost:${port}/ws`);
  ws.on('error', () => {}); // the server may close us; that is fine here
  await new Promise<void>((resolve) => ws.once('open', () => resolve()));
  if (joinFirst) ws.send(JSON.stringify({ t: 'join', name: 'fuzzer', look: {} }));
  for (const f of frames) ws.send(f);
  await wait(150);
  ws.close();
}

/** The office still works: a newcomer can join and be seen, and chat reaches an existing member. */
async function officeStillWorks() {
  const a = await connectClient(server.port, 'Still-A');
  const b = await connectClient(server.port, 'Still-B');
  clients.push(a, b);
  b.send({ t: 'chat', text: 'still here' });
  expect((await a.next('chat', (m) => m.text === 'still here')).name).toBe('Still-B');
}

/** Warnings the server logs when a message handler threw (it catches them, but they are still bugs). */
const handlerFailures = () => warn.mock.calls.map((c) => String(c[0])).filter((s) => s.startsWith('message '));

beforeEach(async () => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  server = await startTestServer();
});
afterEach(async () => {
  clients.forEach((c) => c.close());
  clients = [];
  await server.close();
  vi.restoreAllMocks();
});

describe('malformed messages', () => {
  it('ignores JSON that is not an object, before and after joining', async () => {
    const junk = ['null', '7', '"hi"', 'true', '[]', '[1,2]', '{}', '{"t":"nope"}', 'not json', ''];
    await raw(server.port, junk);
    await raw(server.port, junk, true);
    await officeStillWorks();
    expect(handlerFailures()).toEqual([]);
  });

  it('survives every message type with fields of the wrong type, and no handler throws', async () => {
    const types = [
      'join', 'state', 'chat', 'media', 'rtc', 'status', 'avatar', 'desk', 'deskInvite', 'walkToDesk',
      'knock', 'admit', 'ring', 'ringReply', 'wave', 'admin',
    ];
    const weird: unknown[] = [null, 0, -1, 1e308, 'x', 'x'.repeat(20_000), [], [null], {}, { a: { b: [] } }, true];
    const fields = [
      'name', 'look', 'memberId', 'avatar', 'admin', 'x', 'y', 'a', 'mode', 'moving', 'text', 'to', 'mic', 'cam',
      'speaking', 'data', 'kind', 'until', 'op', 'deskId', 'areaId', 'allow', 'from', 'accept', 'reply', 'podId',
      'memberIds', 'ids', 'id',
    ];
    const frames: string[] = [];
    for (const t of types) {
      for (const v of weird) {
        frames.push(JSON.stringify(Object.fromEntries([['t', t], ...fields.map((f) => [f, v])])));
      }
    }
    // Same messages from an admin, so the admin-only branches are exercised too.
    const admin = await startTestServer({ adminToken: 'tok' });
    try {
      await raw(admin.port, [JSON.stringify({ t: 'join', name: 'a', look: {}, admin: 'tok' }), ...frames]);
    } finally {
      await admin.close();
    }
    await raw(server.port, frames, true);
    await officeStillWorks();
    expect(handlerFailures()).toEqual([]);
  });

  it('drops a frame over the size limit by closing that one socket, and carries on', async () => {
    const victim = await connectClient(server.port, 'Victim');
    clients.push(victim);
    await raw(server.port, ['x'.repeat(100 * 1024)], true);
    await officeStillWorks();
    victim.send({ t: 'chat', text: 'unaffected' });
    await victim.next('chat', (m) => m.text === 'unaffected');
  });
});

describe('http', () => {
  it('answers a malformed URL with 400 instead of crashing', async () => {
    const r = await fetch(`http://localhost:${server.port}/%E0%A4%A`);
    expect(r.status).toBe(400);
    await officeStillWorks();
  });

  it('never serves files from a sibling folder whose name starts like the build folder', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shyft-dist-'));
    fs.mkdirSync(path.join(root, 'dist'));
    fs.mkdirSync(path.join(root, 'dist-secret'));
    fs.writeFileSync(path.join(root, 'dist', 'index.html'), '<p>office</p>');
    fs.writeFileSync(path.join(root, 'dist-secret', 'key.txt'), 'SECRET');
    const s = await startServer({ port: 0, distDir: path.join(root, 'dist') });
    try {
      const r = await fetch(`http://localhost:${s.port}/..%2Fdist-secret%2Fkey.txt`);
      expect(r.status).toBe(403);
      expect(await (await fetch(`http://localhost:${s.port}/`)).text()).toBe('<p>office</p>');
    } finally {
      await s.close();
    }
  });

  it('rejects, rather than crashing, when the port is already taken', async () => {
    const blocker = net.createServer();
    await new Promise<void>((r) => blocker.listen(0, () => r()));
    const port = (blocker.address() as net.AddressInfo).port;
    try {
      await expect(startServer({ port })).rejects.toThrow(/EADDRINUSE/);
    } finally {
      blocker.close();
    }
  });
});

describe('two tabs of one browser', () => {
  it('closing one tab does not unlock the desk the other tab is sitting at', async () => {
    const id = crypto.randomUUID();
    const tab1 = await connectClient(server.port, 'Sam', { memberId: id });
    clients.push(tab1);
    tab1.at(6.5, 12.5); // the chair of desk desk-5-13
    tab1.send({ t: 'desk', op: 'claim', deskId: 'desk-5-13' });
    await tab1.next('office', (m) => m.desks.some((d) => d.id === 'desk-5-13'));
    tab1.send({ t: 'desk', op: 'lock' });
    await tab1.next('office', (m) => m.desks.some((d) => d.locked));

    const tab2 = await connectClient(server.port, 'Sam', { memberId: id });
    await tab1.next('join', (m) => m.player.id === tab2.id);
    tab2.close();
    // The server announces the departure, then sends the office state as it is after it.
    await tab1.next('leave', (m) => m.id === tab2.id);
    const after = await tab1.next('office');
    expect(after.desks.find((d) => d.id === 'desk-5-13')?.locked).toBe(true);

    // When the last tab goes, the lock does end.
    const watcher = await connectClient(server.port, 'Watcher');
    clients.push(watcher);
    tab1.close();
    await watcher.next('office', (m) => m.desks.some((d) => d.id === 'desk-5-13' && !d.locked));
  });
});
