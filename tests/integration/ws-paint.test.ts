import { afterEach, describe, expect, it } from 'vitest';
import type { RunningServer } from '../../server/app';
import { defaultLayout } from '../../shared/default-layout';
import { SWATCHES } from '../../shared/finishes';
import { cloneLayout, type Layout } from '../../shared/layout';
import { compileDefault, setWorld } from '../../shared/map';
import { api, connectClient, newMemberId, startTestServer, type TestClient } from './helpers';

let server: RunningServer;
let clients: TestClient[] = [];
afterEach(async () => {
  clients.forEach((c) => c.close());
  clients = [];
  await server?.close();
  setWorld(compileDefault());
});

async function boot() {
  server = await startTestServer({ publishCooldownMs: 0 });
}
async function member(name: string, guest = false) {
  const c = await connectClient(server.port, name, guest ? {} : { memberId: newMemberId() });
  clients.push(c);
  return c;
}
const painted = (edit: (l: Layout) => void) => {
  const l = cloneLayout(defaultLayout());
  edit(l);
  return l;
};
const blank = (l: Layout) => ' '.repeat(l.w * l.h);
const put = (g: string, i: number, ch: string) => g.slice(0, i) + ch + g.slice(i + 1);

describe('publishing paint', () => {
  it('reaches everyone: the layout a second client fetches has the paints', async () => {
    await boot();
    const [a, b] = [await member('Ana'), await member('Ben')];
    const hex = SWATCHES[4].hex.slice(1);
    const layout = painted((l) => {
      l.theme = 'night-mode';
      l.paints = [`herringbone-oak:${hex}`, 'brick-red'];
      l.floorPaint = put(blank(l), 12 * l.w + 5, '!');
      l.wallPaint = put(blank(l), 0, '"');
    });
    const res = await api(server.port, a, 'POST', '/api/publish', { baseRev: 1, layout });
    expect(res.status).toBe(200);
    const note = await b.next('layout');
    expect(note.rev).toBe(2);
    const got = await api(server.port, b, 'GET', '/api/layout');
    const body = got.body as { layout: Layout };
    expect(body.layout.theme).toBe('night-mode');
    expect(body.layout.paints).toEqual([`herringbone-oak:${hex}`, 'brick-red']);
    expect(body.layout.floorPaint![12 * body.layout.w + 5]).toBe('!');
  });

  it('refuses a malformed paint key or grid with its code', async () => {
    await boot();
    const a = await member('Ana');
    const bad = async (edit: (l: Layout) => void) => {
      const res = await api(server.port, a, 'POST', '/api/publish', { baseRev: 1, layout: painted(edit) });
      expect(res.status).toBe(400);
      return JSON.stringify(res.body);
    };
    expect(await bad((l) => (l.paints = ['no-such-finish']))).toContain('bad-paint');
    expect(await bad((l) => { l.paints = ['grass:ABCDEF']; l.floorPaint = blank(l); })).toContain('bad-paint');
    expect(await bad((l) => { l.paints = ['grass']; l.floorPaint = 'short'; })).toContain('bad-paint-grid');
    expect(await bad((l) => (l.theme = 'neon'))).toContain('bad-theme');
  });

  it('turns a guest’s publish away, as before', async () => {
    await boot();
    const guest = await member('Gus', true);
    const res = await api(server.port, guest, 'POST', '/api/publish', { baseRev: 1, layout: painted((l) => (l.theme = 'night-mode')) });
    expect([401, 403]).toContain(res.status);
  });
});
