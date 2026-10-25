import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RunningServer } from '../../server/app';
import { connectClient, startTestServer, writeTestSheet, type TestClient } from './helpers';

let server: RunningServer;
let dir: string;
let clients: TestClient[] = [];
const base = () => `http://localhost:${server.port}`;
const join = async (name: string, extra: Record<string, unknown> = {}) => {
  const c = await connectClient(server.port, name, extra);
  clients.push(c);
  return c;
};

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shyft-sprites-it-'));
  writeTestSheet(dir, 'robot');
  writeTestSheet(dir, 'wig', 'hair');
  fs.writeFileSync(path.join(dir, 'sixty.png'), 'not a png');
  fs.writeFileSync(path.join(dir, 'FORMAT.md'), '# format');
  fs.writeFileSync(path.join(dir, 'template.png'), 'guide');
  server = await startTestServer({ spritesDir: dir, adminToken: 'letmein' });
});
afterEach(async () => {
  clients.forEach((c) => c.close());
  clients = [];
  await server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('serving sprites', () => {
  it('lists valid sheets only, and serves them as images', async () => {
    const index = await (await fetch(`${base()}/sprites/index.json`)).json();
    expect(index.map((s: { id: string }) => s.id)).toEqual(['robot', 'wig']);
    const png = await fetch(`${base()}/sprites/robot.png`);
    expect(png.status).toBe(200);
    expect(png.headers.get('content-type')).toBe('image/png');
    expect((await fetch(`${base()}/sprites/sixty.png`)).status).toBe(404); // rejected sheets are never served
  });

  it('serves the template and the format doc, and nothing else from the folder', async () => {
    expect(await (await fetch(`${base()}/sprites/FORMAT.md`)).text()).toBe('# format');
    expect((await fetch(`${base()}/sprites/template.png`)).status).toBe(200);
    fs.writeFileSync(path.join(dir, 'secret.txt'), 'x');
    expect((await fetch(`${base()}/sprites/secret.txt`)).status).toBe(404);
    expect((await fetch(`${base()}/sprites/..%2Fpackage.json`)).status).toBe(404);
    expect((await fetch(`${base()}/sprites/robot.json`)).status).toBe(404);
  });
});

describe('avatars over the wire', () => {
  it('tells joiners which sheets exist and shows others the avatar they chose', async () => {
    const a = await join('A', { avatar: { kind: 'sheet', id: 'robot' } });
    expect(a.all('welcome')[0].sprites?.map((s) => s.id)).toEqual(['robot', 'wig']);
    const b = await join('B');
    expect(b.players[0].avatar).toEqual({ kind: 'sheet', id: 'robot' });
  });

  it('replaces a forged or misplaced avatar with the built-in character', async () => {
    const a = await join('A', { avatar: { kind: 'sheet', id: 'ghost' } });
    const b = await join('B', { avatar: { kind: 'layers', ids: { body: 'wig' } } }); // a hair sheet in the body slot
    expect(a.players).toEqual([]);
    expect(b.players[0].avatar.kind).toBe('built-in');
    const c = await join('C');
    expect(c.players.map((p) => p.avatar.kind)).toEqual(['built-in', 'built-in']);
  });

  it('broadcasts a changed avatar, to the sender as well, corrected if it was invalid', async () => {
    const a = await join('A');
    const b = await join('B');
    a.send({ t: 'avatar', avatar: { kind: 'sheet', id: 'robot' } });
    expect(await b.next('presence', (m) => m.avatar?.kind === 'sheet')).toMatchObject({ id: a.id, avatar: { id: 'robot' } });
    expect(await a.next('presence', (m) => m.id === a.id && m.avatar?.kind === 'sheet')).toBeTruthy();
    a.send({ t: 'avatar', avatar: { kind: 'sheet', id: 'ghost' } });
    expect((await b.next('presence', (m) => m.avatar?.kind === 'built-in')).id).toBe(a.id);
  });
});

describe('reloading sprites', () => {
  it('lets only an admin reload, then tells everyone, and the admin which files were rejected', async () => {
    const admin = await join('Admin', { admin: 'letmein' });
    const other = await join('Other');
    writeTestSheet(dir, 'cat');

    other.send({ t: 'admin', op: 'reloadSprites' }); // not an admin: ignored
    expect(await admin.quiet('sprites', 300)).toHaveLength(0);

    admin.send({ t: 'admin', op: 'reloadSprites' });
    const mine = await admin.next('sprites');
    expect(mine.sprites.map((s) => s.id)).toEqual(['cat', 'robot', 'wig']);
    expect(mine.rejected).toEqual([{ file: 'sixty.png', errors: ['not-png'] }]);
    expect(mine.warnings).toEqual([]);
    const theirs = await other.next('sprites');
    expect(theirs.sprites.map((s) => s.id)).toEqual(['cat', 'robot', 'wig']);
    expect(theirs.rejected).toBeUndefined();
  });

  it('puts someone back in the built-in character when their sheet disappears', async () => {
    const admin = await join('Admin', { admin: 'letmein' });
    const robot = await join('Robot', { avatar: { kind: 'sheet', id: 'robot' } });
    fs.rmSync(path.join(dir, 'robot.png'));
    admin.send({ t: 'admin', op: 'reloadSprites' });
    expect(await admin.next('presence', (m) => m.id === robot.id)).toMatchObject({ avatar: { kind: 'built-in' } });
  });
});
