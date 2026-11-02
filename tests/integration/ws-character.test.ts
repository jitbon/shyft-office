import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { RunningServer } from '../../server/app';
import { loadState } from '../../server/store';
import { connectClient, startTestServer } from './helpers';

let server: RunningServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

const base = { shirt: '#e04f5f', hair: '#111111', skin: '#8d5524' };
const full = {
  ...base, hairStyle: 'curly', face: 'grin', top: 'hoodie', bottom: 'shorts', bottomColor: '#3b5bdb', shoes: 'boots', accessory: 'glasses',
};

describe('character over the socket', () => {
  it('validates a full look and shows the same one to others', async () => {
    server = await startTestServer();
    const a = await connectClient(server.port, 'Ana', { look: full, avatar: { kind: 'built-in', look: full } });
    const b = await connectClient(server.port, 'Ben');
    expect(b.players.find((p) => p.name === 'Ana')?.look).toEqual(full);
    expect(b.players.find((p) => p.name === 'Ana')?.avatar).toEqual({ kind: 'built-in', look: full });

    a.send({ t: 'avatar', avatar: { kind: 'built-in', look: { ...full, hairStyle: 'nope', outfit: 'evil' } as never } });
    const seen = await b.next('presence', (m) => !!m.avatar);
    expect(seen.avatar).toEqual({ kind: 'built-in', look: { ...full, hairStyle: undefined } });
    expect(JSON.stringify(seen.avatar)).not.toContain('evil');
    expect(JSON.stringify(seen.avatar)).not.toContain('nope');
  });

  it('passes on at most 4 character changes a second', async () => {
    server = await startTestServer();
    const a = await connectClient(server.port, 'Ana');
    const b = await connectClient(server.port, 'Ben');
    for (let i = 0; i < 10; i++) a.send({ t: 'avatar', avatar: { kind: 'built-in', look: { ...base, shirt: `#00000${i}` } } });
    const got = await b.quiet('presence', 400);
    expect(got.filter((m) => m.avatar).length).toBeLessThanOrEqual(4);
  });

  it('saves a member\'s character but not a guest\'s', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shyft-char-'));
    server = await startTestServer({ dataDir });
    const id = crypto.randomUUID();
    const a = await connectClient(server.port, 'Ana', { memberId: id });
    a.send({ t: 'avatar', avatar: { kind: 'built-in', look: full } });
    await a.next('presence', (m) => !!m.avatar);
    const guest = await connectClient(server.port, 'Gus');
    guest.send({ t: 'avatar', avatar: { kind: 'built-in', look: full } });
    await guest.next('presence', (m) => !!m.avatar);
    await server.close();
    server = undefined;
    const saved = loadState(dataDir).characters;
    expect(Object.keys(saved)).toEqual([id]);
    expect(saved[id].avatar).toEqual({ kind: 'built-in', look: full });
  });
});
