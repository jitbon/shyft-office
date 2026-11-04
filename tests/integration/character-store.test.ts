import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { RunningServer } from '../../server/app';
import { connectClient, startTestServer } from './helpers';

let server: RunningServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

const look = { shirt: '#e04f5f', hair: '#111111', skin: '#8d5524', hairStyle: 'bun', top: 'sweater' };
const get = (port: number, member?: string) =>
  fetch(`http://localhost:${port}/api/character`, { headers: member ? { 'X-Shyft-Member': member } : {} });

describe('GET /api/character', () => {
  it('returns a member\'s saved character, and 404 for anyone else', async () => {
    server = await startTestServer();
    const id = crypto.randomUUID();
    await connectClient(server.port, 'Ana', { memberId: id, look, avatar: { kind: 'built-in', look } });
    const res = await get(server.port, id.toUpperCase());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ avatar: { kind: 'built-in', look } });
    expect((await get(server.port)).status).toBe(404);
    expect((await get(server.port, 'not-a-uuid')).status).toBe(404);
    expect((await get(server.port, crypto.randomUUID())).status).toBe(404);
    expect((await get(server.port, 'eph-1')).status).toBe(404);
  });

  it('still returns it after the server restarts', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shyft-char-'));
    server = await startTestServer({ dataDir });
    const id = crypto.randomUUID();
    await connectClient(server.port, 'Ana', { memberId: id, look, avatar: { kind: 'built-in', look } });
    await server.close();
    server = await startTestServer({ dataDir });
    expect(await (await get(server.port, id)).json()).toEqual({ avatar: { kind: 'built-in', look } });
  });

  it('refuses more than 10 requests a minute for one member id', async () => {
    server = await startTestServer();
    const id = crypto.randomUUID();
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) statuses.push((await get(server.port, id)).status);
    expect(statuses.slice(0, 10).every((s) => s === 404)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
  });

  it('does not let many members behind one address (a tunnel) use up each other\'s limit', async () => {
    server = await startTestServer();
    const statuses: number[] = [];
    for (let i = 0; i < 30; i++) statuses.push((await get(server.port, crypto.randomUUID())).status);
    expect(statuses.every((s) => s === 404)).toBe(true);
  });
});
