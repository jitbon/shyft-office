// Keeps this browser's copy of the office in step with the server's published layout, and wraps the builder API.
import { currentCatalog } from '../shared/catalog';
import type { DeskLook } from '../shared/desk-look';
import type { Layout } from '../shared/layout';
import { setWorld } from '../shared/map';
import { compileWorld } from '../shared/world';
import { session } from './session';

export interface ApiResult<T = any> {
  status: number;
  body: T;
}

/** Calls the builder HTTP API as this connection. */
export async function api<T = any>(path: string, method = 'GET', body?: unknown): Promise<ApiResult<T>> {
  const res = await fetch(path, {
    method,
    headers: { 'x-shyft-session': session.token, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed as T };
}

export interface Published {
  rev: number;
  layout: Layout;
  by: { name: string };
  at: number;
}

/** The layout this browser last loaded, which builders start their drafts from. */
export let published: Published | null = null;

/** The look of every claimed desk that has one, by desk id, as the server last said. */
export let deskLooks: Record<string, DeskLook> = {};

/** Sets the desk looks. With `redraw`, the office is compiled again so they show at once. */
export function setDeskLooks(looks: Record<string, DeskLook>, redraw = true) {
  deskLooks = looks;
  if (redraw) recompile();
}

/** The custom objects or desk looks changed: recompile the office we have, so they show or vanish. */
export function recompile() {
  if (published) setWorld(compileWorld(published.layout, currentCatalog(), deskLooks));
}

/** Fetches a published revision (the current one when `rev` is omitted) and makes it the office. */
export async function loadLayout(rev?: number): Promise<Published | null> {
  const r = await api<Published>(rev === undefined ? '/api/layout' : `/api/layout?rev=${rev}`);
  if (r.status !== 200) return null;
  published = r.body;
  session.layoutRev = r.body.rev;
  setWorld(compileWorld(r.body.layout, currentCatalog(), deskLooks));
  return r.body;
}
