// The builder HTTP API (specs/003-office-builder/contracts/http-api.md). Layouts can be hundreds of KB, more than a
// WebSocket message may carry, so they travel over plain requests. Each request names its connection with the
// session token from `welcome`, so the server knows who is asking without trusting anything the client says.
import type http from 'node:http';
import type { Catalog } from '../shared/catalog';
import { itemAt, parseLayoutWith } from '../shared/catalog';
import { checkLayout, type Problem } from '../shared/layout-check';
import { mergeLayouts } from '../shared/layout-merge';
import { normalizeLayout, type Layout } from '../shared/layout';
import { MAX_OBJECT_BYTES, customKind } from '../shared/objects';
import { catalogFromDefinition } from '../shared/catalog';
import { pinMisfits } from '../shared/items-edit';
import { validateItem } from '../shared/items';
import type { LayoutStore, Publisher, Revision } from './layout-store';
import type { Helper } from './helper';
import { MAX_DRAFT_BYTES, MAX_DRAFT_PARTS, type ItemsStore } from './items';
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
  items: ItemsStore;
  helper: Helper;
  /** The helper's status may have changed (after a failure): tell the builders. */
  helperChanged(): void;
  /** Tell everyone the studio items changed: the catalog is rebuilt here and the light index goes to everyone. */
  itemsChanged(): void;
  /** Most item saves one member may make in a minute. */
  itemSavesPerMinute: number;
  /** Least time between one member's studio draft saves. */
  studioDraftCooldownMs: number;
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
const MAX_HELPER_IMAGE = 2 * 1024 * 1024;
const MAX_HELPER_BODY = Math.ceil(MAX_HELPER_IMAGE * 1.4) + 4096;
/** Members whose helper request is running: one at a time each. */
const helperBusy = new Set<string>();

type Json = Record<string, unknown> | unknown[] | null;

const lastAt = {
  publish: new WeakMap<ApiContext, Map<string, number>>(),
  draft: new WeakMap<ApiContext, Map<string, number>>(),
  studio: new WeakMap<ApiContext, Map<string, number>>(),
};

/** True when `memberId` may act now; records the attempt. */
function ratePasses(kind: 'publish' | 'draft' | 'studio', ctx: ApiContext, memberId: string, cooldownMs: number): boolean {
  let m = lastAt[kind].get(ctx);
  if (!m) lastAt[kind].set(ctx, (m = new Map()));
  const now = Date.now();
  if (now - (m.get(memberId) ?? 0) < cooldownMs) return false;
  m.set(memberId, now);
  return true;
}

const perMinuteLog = new WeakMap<ApiContext, Map<string, number[]>>();

/** True when `memberId` may do `what` now, given `limit` a minute; records the attempt. */
function perMinute(what: 'upload' | 'item' | 'helper', ctx: ApiContext, memberId: string, limit: number): boolean {
  let m = perMinuteLog.get(ctx);
  if (!m) perMinuteLog.set(ctx, (m = new Map()));
  const now = Date.now();
  const key = `${what}:${memberId}`;
  const recent = (m.get(key) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= limit) return false;
  m.set(key, [...recent, now]);
  return true;
}

const uploadPasses = (ctx: ApiContext, memberId: string) => perMinute('upload', ctx, memberId, ctx.uploadsPerMinute);

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

/** A layout made consistent: what lost its item, desk or wall is gone, and what is over the limits. */
const tidy = (layout: Layout, catalog: Catalog): Layout =>
  normalizeLayout(layout, catalog, { hasVersion: (kind, v) => itemAt(kind, v, catalog)?.version === v }).layout;

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
        const draft = tidy(parsed.layout, catalog);
        const savedAt = ctx.layouts.saveDraft(who.memberId, body!.baseRev as number, draft);
        return reply(res, 200, { savedAt, problems: checkLayout(draft, catalog) });
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

      let final = tidy(parsed.layout, catalog);
      if (baseRev !== cur.rev) {
        const base = ctx.layouts.revision(baseRev as number)?.layout ?? null;
        const { merged, clashes } = mergeLayouts(base, cur.layout, parsed.layout);
        if (clashes.length) throw new HttpError(409, { error: 'clash', currentRev: cur.rev, clashes: clashes as unknown as Json });
        const again = parseLayoutWith(merged, catalog);
        if (!again.ok) {
          const problem: Problem = { code: 'bad-merge', message: 'The two edits can’t be combined: ' + again.errors[0], tiles: [] };
          throw new HttpError(422, { error: 'problems', problems: [problem] as unknown as Json });
        }
        final = tidy(again.layout, catalog);
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

    if (route === 'GET /api/items') return reply(res, 200, { items: ctx.items.list() as unknown as Json, older: ctx.items.olderList() as unknown as Json });

    if (route === 'POST /api/items') {
      requireBuilder(ctx, who);
      const body = (await readJson(req, MAX_LAYOUT_BYTES)) as { def?: unknown; id?: unknown; asCopy?: unknown } | null;
      if (!perMinute('item', ctx, who.memberId, ctx.itemSavesPerMinute)) throw new HttpError(429, { error: 'slow-down' });
      const checked = validateItem(body?.def);
      if (!checked.ok) throw new HttpError(400, { error: 'bad-item', errors: checked.errors });
      const id = typeof body?.id === 'string' ? body.id : undefined;
      if (!id || body?.asCopy === true) {
        const r = ctx.items.add(checked.item, who);
        if (!r.ok) throw new HttpError(r.full ? 409 : 400, r.full ? { error: 'too-many' } : { error: 'bad-item', errors: r.errors });
        ctx.itemsChanged();
        return reply(res, 201, { item: r.item as unknown as Json, pinned: 0 });
      }
      const cur = ctx.items.get(id);
      if (!cur) throw new HttpError(404, { error: 'no-such-item' });
      if (!who.isAdmin && ctx.items.ownerOf(id) !== who.memberId) throw new HttpError(403, { error: 'not-yours' });
      // Copies that cannot take a changed footprint or kind stay as they were, pinned to the version they have now.
      const kind = `item:${id}`;
      const prev = catalogFromDefinition(cur.def, { id: kind, by: cur.by.name, version: cur.version });
      const next = catalogFromDefinition(checked.item, { id: kind, by: cur.by.name, version: cur.version + 1 });
      const { layout: pinnedLayout, pinned } = pinMisfits(ctx.layouts.current.layout, kind, prev, next, (k, v) => itemAt(k, v, catalog));
      const r = ctx.items.change(id, checked.item, pinned > 0);
      if (!r.ok) throw new HttpError(400, { error: 'bad-item', errors: r.errors });
      ctx.itemsChanged();
      if (pinned > 0) ctx.applyPublish(pinnedLayout, { memberId: who.memberId, name: who.name });
      return reply(res, 200, { item: r.item as unknown as Json, pinned });
    }

    const delItem = /^\/api\/items\/([a-z0-9-]+)$/.exec(url.pathname);
    if (req.method === 'DELETE' && delItem) {
      requireBuilder(ctx, who);
      const id = delItem[1];
      if (!ctx.items.get(id)) throw new HttpError(404, { error: 'no-such-item' });
      if (!who.isAdmin && ctx.items.ownerOf(id) !== who.memberId) throw new HttpError(403, { error: 'not-yours' });
      const kind = `item:${id}`;
      const current = ctx.layouts.current;
      const placed = current.layout.objects.filter((o) => o.kind === kind).length;
      if (url.searchParams.get('confirm') !== '1') return reply(res, 200, { placed });
      let rev = current.rev;
      if (placed) {
        // The copies go in a published revision of their own, credited to whoever removed the item.
        const without = tidy({ ...current.layout, objects: current.layout.objects.filter((o) => o.kind !== kind) }, catalog);
        rev = ctx.applyPublish(without, { memberId: who.memberId, name: who.name }).rev;
      }
      ctx.items.remove(id);
      ctx.itemsChanged();
      return reply(res, 200, { rev });
    }

    if (url.pathname === '/api/studio/draft') {
      requireBuilder(ctx, who);
      if (req.method === 'GET') {
        const d = ctx.items.getDraft(who.memberId);
        if (!d) throw new HttpError(404, { error: 'no-draft' });
        return reply(res, 200, d as unknown as Json);
      }
      if (req.method === 'DELETE') {
        ctx.items.deleteDraft(who.memberId);
        return reply(res, 204);
      }
      if (req.method === 'PUT') {
        const body = (await readJson(req, MAX_DRAFT_BYTES)) as { design?: unknown; itemId?: unknown; fromHelper?: unknown } | null;
        if (!ratePasses('studio', ctx, who.memberId, ctx.studioDraftCooldownMs)) throw new HttpError(429, { error: 'slow-down' });
        const design = body?.design;
        if (typeof design !== 'object' || design === null || Array.isArray(design)) throw new HttpError(400, { error: 'bad-request' });
        const parts = (design as { parts?: unknown }).parts;
        if (Array.isArray(parts) && parts.length > MAX_DRAFT_PARTS) throw new HttpError(400, { error: 'too-many-parts' });
        const itemId = typeof body?.itemId === 'string' ? body.itemId : undefined;
        const savedAt = ctx.items.saveDraft(who.memberId, design, itemId, body?.fromHelper === true);
        const checked = validateItem(design);
        return reply(res, 200, { savedAt, problems: checked.ok ? [] : checked.errors });
      }
    }

    if (route === 'POST /api/studio/helper') {
      requireBuilder(ctx, who);
      const body = (await readJson(req, MAX_HELPER_BODY)) as { text?: unknown; image?: { type?: unknown; data?: unknown } } | null;
      const text = typeof body?.text === 'string' ? body.text.trim() : '';
      const img = body?.image;
      let image: { type: string; data: Buffer } | undefined;
      if (img !== undefined) {
        if ((img?.type !== 'image/png' && img?.type !== 'image/jpeg') || typeof img.data !== 'string') throw new HttpError(400, { error: 'bad-request' });
        const data = Buffer.from(img.data, 'base64');
        if (!data.length || data.length > MAX_HELPER_IMAGE) throw new HttpError(400, { error: 'bad-request' });
        image = { type: img.type, data };
      }
      if ((!text && !image) || text.length > 500) throw new HttpError(400, { error: 'bad-request' });
      if (ctx.helper.status() !== 'on') throw new HttpError(403, { error: 'helper-off' });
      if (helperBusy.has(who.memberId) || !perMinute('helper', ctx, who.memberId, 5)) throw new HttpError(429, { error: 'slow-down' });
      helperBusy.add(who.memberId);
      // A member who gives up (closes the request) cancels the service call too.
      const abort = new AbortController();
      const gone = () => { if (!res.writableEnded) abort.abort(); };
      res.on('close', gone);
      try {
        const before = ctx.helper.status();
        const r = await ctx.helper.draftItem({ ...(text ? { text } : {}), ...(image ? { image } : {}) }, abort.signal);
        if (ctx.helper.status() !== before) ctx.helperChanged();
        if (r.ok) return reply(res, 200, { design: r.design as unknown as Json });
        if (abort.signal.aborted) return;
        if (r.kind === 'unusable') throw new HttpError(422, { error: 'unusable', message: r.message });
        throw new HttpError(r.kind === 'timeout' ? 504 : 502, { error: 'helper-failed', message: r.message });
      } finally {
        helperBusy.delete(who.memberId);
        res.off('close', gone);
      }
    }

    throw new HttpError(404, { error: 'not-found' });
  } catch (err) {
    if (err instanceof HttpError) return reply(res, err.status, err.body);
    console.warn('api request failed:', (err as Error).message);
    if (!res.headersSent) reply(res, 500, { error: 'server-error' });
  }
}
