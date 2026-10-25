// The builder HTTP API (specs/003-office-builder/contracts/http-api.md). Layouts can be hundreds of KB, more than a
// WebSocket message may carry, so they travel over plain requests. Each request names its connection with the
// session token from `welcome`, so the server knows who is asking without trusting anything the client says.
import type http from 'node:http';
import type { Catalog } from '../shared/catalog';
import { parseLayoutWith } from '../shared/catalog';
import { checkLayout, type Problem } from '../shared/layout-check';
import { mergeLayouts } from '../shared/layout-merge';
import type { Layout } from '../shared/layout';
import { MAX_OBJECT_BYTES, customKind } from '../shared/objects';
import type { LayoutStore, Publisher, Revision } from './layout-store';
import type { ObjectsStore } from './objects';

export interface ApiCaller {
  memberId: string;
  name: string;
  isAdmin: boolean;
  guest: boolean;
}

export interface ApiContext {
  layouts: LayoutStore;
  objects: ObjectsStore;
  /** Tell everyone the list of custom objects changed. */
  objectsChanged(): void;
  catalog(): Catalog;
  /** The caller behind a session token, if that connection is still open. */
  caller(token: string | undefined): ApiCaller | undefined;
  buildingEnabled(): boolean;
  /** Makes a checked layout the published office and tells everyone. */
  applyPublish(layout: Layout, by: Publisher): Revision;
  publishCooldownMs: number;
  draftCooldownMs: number;
  /** Most uploads one member may make in a minute. */
  uploadsPerMinute: number;
}

export const MAX_LAYOUT_BYTES = 1024 * 1024;

type Json = Record<string, unknown> | unknown[] | null;

const lastAt = {
  publish: new WeakMap<ApiContext, Map<string, number>>(),
  draft: new WeakMap<ApiContext, Map<string, number>>(),
};

/** True when `memberId` may act now; records the attempt. */
function ratePasses(kind: 'publish' | 'draft', ctx: ApiContext, memberId: string, cooldownMs: number): boolean {
  let m = lastAt[kind].get(ctx);
  if (!m) lastAt[kind].set(ctx, (m = new Map()));
  const now = Date.now();
  if (now - (m.get(memberId) ?? 0) < cooldownMs) return false;
  m.set(memberId, now);
  return true;
}

const uploads = new WeakMap<ApiContext, Map<string, number[]>>();

/** True when `memberId` may upload now; records the attempt. */
function uploadPasses(ctx: ApiContext, memberId: string): boolean {
  let m = uploads.get(ctx);
  if (!m) uploads.set(ctx, (m = new Map()));
  const now = Date.now();
  const recent = (m.get(memberId) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= ctx.uploadsPerMinute) return false;
  m.set(memberId, [...recent, now]);
  return true;
}

class HttpError extends Error {
  constructor(public status: number, public body: Json) {
    super(String((body as { error?: unknown } | null)?.error ?? status));
  }
}

/** Reads a JSON body. Past the limit the rest is read and thrown away (so the client gets its answer), then it is refused. */
function readBody(req: http.IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size <= limit) chunks.push(c);
      else if (size > limit * 20) req.destroy();
    });
    req.on('end', () => (size > limit ? reject(new HttpError(413, { error: 'too-large' })) : resolve(Buffer.concat(chunks).toString('utf8'))));
    req.on('error', reject);
  });
}

async function readJson(req: http.IncomingMessage, limit: number): Promise<unknown> {
  const text = await readBody(req, limit);
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, { error: 'bad-json' });
  }
}

function reply(res: http.ServerResponse, status: number, body?: Json) {
  if (body === undefined) {
    res.writeHead(status).end();
    return;
  }
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(body));
}

function requireBuilder(ctx: ApiContext, who: ApiCaller) {
  if (who.guest) throw new HttpError(403, { error: 'not-builder' });
  if (!who.isAdmin && !ctx.buildingEnabled()) throw new HttpError(403, { error: 'building-off' });
}

const counts = (r: Revision) => ({ objects: r.layout.objects.length, rooms: r.layout.rooms.length, pods: r.layout.pods.length });

/** Answers one `/api/*` request. */
export async function handleApi(req: http.IncomingMessage, res: http.ServerResponse, url: URL, ctx: ApiContext): Promise<void> {
  try {
    const token = req.headers['x-shyft-session'];
    const who = ctx.caller(typeof token === 'string' ? token : undefined);
    if (!who) throw new HttpError(401, { error: 'no-session' });
    const route = `${req.method} ${url.pathname}`;
    const catalog = ctx.catalog();

    if (route === 'GET /api/layout') {
      const want = url.searchParams.get('rev');
      const r = want === null ? ctx.layouts.current : ctx.layouts.revision(Number(want));
      if (!r) throw new HttpError(404, { error: 'no-such-revision' });
      return reply(res, 200, { rev: r.rev, layout: r.layout, by: { name: r.by.name }, at: r.at });
    }

    if (route === 'GET /api/layout/history') {
      requireBuilder(ctx, who);
      return reply(res, 200, ctx.layouts.history().map((r) => ({ rev: r.rev, by: { name: r.by.name }, at: r.at, ...counts(r) })));
    }

    if (url.pathname === '/api/draft') {
      requireBuilder(ctx, who);
      if (req.method === 'GET') {
        const d = ctx.layouts.getDraft(who.memberId);
        if (!d) throw new HttpError(404, { error: 'no-draft' });
        return reply(res, 200, d as unknown as Json);
      }
      if (req.method === 'DELETE') {
        ctx.layouts.deleteDraft(who.memberId);
        return reply(res, 204);
      }
      if (req.method === 'PUT') {
        const body = (await readJson(req, MAX_LAYOUT_BYTES)) as { baseRev?: unknown; layout?: unknown } | null;
        if (!ratePasses('draft', ctx, who.memberId, ctx.draftCooldownMs)) throw new HttpError(429, { error: 'slow-down' });
        const parsed = parseLayoutWith(body?.layout, catalog);
        if (!parsed.ok) throw new HttpError(400, { error: 'bad-layout', details: parsed.errors });
        if (!Number.isInteger(body?.baseRev) || (body!.baseRev as number) < 1) throw new HttpError(400, { error: 'bad-request' });
        const savedAt = ctx.layouts.saveDraft(who.memberId, body!.baseRev as number, parsed.layout);
        return reply(res, 200, { savedAt, problems: checkLayout(parsed.layout, catalog) });
      }
    }

    if (route === 'POST /api/publish') {
      requireBuilder(ctx, who);
      const body = (await readJson(req, MAX_LAYOUT_BYTES)) as { baseRev?: unknown; layout?: unknown } | null;
      if (!ratePasses('publish', ctx, who.memberId, ctx.publishCooldownMs)) throw new HttpError(429, { error: 'slow-down' });
      const parsed = parseLayoutWith(body?.layout, catalog);
      if (!parsed.ok) throw new HttpError(400, { error: 'bad-layout', details: parsed.errors });
      const baseRev = body?.baseRev;
      const cur = ctx.layouts.current;
      if (!Number.isInteger(baseRev) || (baseRev as number) < 1 || (baseRev as number) > cur.rev) throw new HttpError(400, { error: 'bad-request' });

      let final = parsed.layout;
      if (baseRev !== cur.rev) {
        const base = ctx.layouts.revision(baseRev as number)?.layout ?? null;
        const { merged, clashes } = mergeLayouts(base, cur.layout, parsed.layout);
        if (clashes.length) throw new HttpError(409, { error: 'clash', currentRev: cur.rev, clashes: clashes as unknown as Json });
        const again = parseLayoutWith(merged, catalog);
        if (!again.ok) {
          const problem: Problem = { code: 'bad-merge', message: 'The two edits can’t be combined: ' + again.errors[0], tiles: [] };
          throw new HttpError(422, { error: 'problems', problems: [problem] as unknown as Json });
        }
        final = again.layout;
      }
      const problems = checkLayout(final, catalog);
      if (problems.length) throw new HttpError(422, { error: 'problems', problems: problems as unknown as Json });
      const rev = ctx.applyPublish(final, { memberId: who.memberId, name: who.name });
      ctx.layouts.deleteDraft(who.memberId);
      return reply(res, 200, { rev: rev.rev });
    }

    if (route === 'POST /api/objects') {
      requireBuilder(ctx, who);
      const body = (await readJson(req, MAX_LAYOUT_BYTES)) as { png?: unknown; meta?: unknown } | null;
      if (!uploadPasses(ctx, who.memberId)) throw new HttpError(429, { error: 'slow-down' });
      if (typeof body?.png !== 'string') throw new HttpError(400, { error: 'bad-request' });
      const png = Buffer.from(body.png, 'base64');
      if (png.length > MAX_OBJECT_BYTES) throw new HttpError(400, { error: 'bad-sheet', errors: ['too-large'] });
      const r = ctx.objects.add(png, body.meta, who.name);
      if (!r.ok) throw new HttpError(r.full ? 409 : 400, r.full ? { error: 'too-many' } : { error: 'bad-sheet', errors: r.errors });
      ctx.objectsChanged();
      return reply(res, 201, { object: r.object as unknown as Json });
    }

    const del = /^\/api\/objects\/([a-z0-9-]+)$/.exec(url.pathname);
    if (req.method === 'DELETE' && del) {
      requireBuilder(ctx, who);
      const id = del[1];
      if (!ctx.objects.get(id)) throw new HttpError(404, { error: 'no-such-object' });
      const kind = customKind(id);
      const current = ctx.layouts.current;
      const placed = current.layout.objects.filter((o) => o.kind === kind).length;
      if (url.searchParams.get('confirm') !== '1') return reply(res, 200, { placed });
      let rev = current.rev;
      if (placed) {
        // The copies go in a published revision of their own, credited to whoever removed the object.
        rev = ctx.applyPublish({ ...current.layout, objects: current.layout.objects.filter((o) => o.kind !== kind) }, { memberId: who.memberId, name: who.name }).rev;
      }
      ctx.objects.remove(id);
      ctx.objectsChanged();
      return reply(res, 200, { rev });
    }

    throw new HttpError(404, { error: 'not-found' });
  } catch (err) {
    if (err instanceof HttpError) return reply(res, err.status, err.body);
    console.warn('api request failed:', (err as Error).message);
    if (!res.headersSent) reply(res, 500, { error: 'server-error' });
  }
}
