import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import {
  MAX_OBJECTS, MAX_OBJECT_BYTES, OBJECT_ID_RE, validateObjectMeta, validateObjectSheet, type CustomObject, type ObjectMeta,
} from '../shared/objects';

export type AddResult = { ok: true; object: CustomObject } | { ok: false; errors: string[]; full?: boolean };

interface Stored {
  object: CustomObject;
  png: Buffer;
}

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'object';

/** Decodes a PNG and checks it against its metadata. */
function check(png: Buffer, meta: ObjectMeta): string[] {
  if (png.length > MAX_OBJECT_BYTES) return ['too-large'];
  let decoded: PNG;
  try {
    decoded = PNG.sync.read(png);
  } catch {
    return ['not-png'];
  }
  const r = validateObjectSheet(decoded.data, decoded.width, decoded.height, png.length, meta);
  return r.ok ? [] : r.errors;
}

/** The custom objects on this server: validated on the way in, kept in data/objects, served at /objects/<id>.png. */
export class ObjectsStore {
  private items = new Map<string, Stored>();

  private constructor(private dir: string) {}

  /** Reads every sheet in `dir`. A bad one is logged with its error codes and skipped; nobody ever sees it. */
  static load(dir: string): ObjectsStore {
    const store = new ObjectsStore(dir);
    let names: string[] = [];
    try {
      names = fs.readdirSync(dir).filter((n) => n.endsWith('.json')).sort();
    } catch {
      return store; // no folder yet: only the built-in furniture exists
    }
    for (const name of names) {
      const id = name.slice(0, -'.json'.length);
      const skip = (errors: string[]) => console.warn(`objects: skipped ${id}: ${errors.join(', ')}`);
      if (!OBJECT_ID_RE.test(id)) {
        skip(['bad-id']);
        continue;
      }
      try {
        const json = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) as Record<string, unknown>;
        const meta = validateObjectMeta(json);
        if (!meta.ok) {
          skip(meta.errors);
          continue;
        }
        const png = fs.readFileSync(path.join(dir, `${id}.png`));
        const errors = check(png, meta.meta);
        if (errors.length) skip(errors);
        else store.items.set(id, { object: store.describe(id, meta.meta, typeof json.author === 'string' ? json.author : undefined, png), png });
      } catch (err) {
        skip([(err as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing-file' : 'bad-meta']);
      }
    }
    return store;
  }

  private describe(id: string, meta: ObjectMeta, author: string | undefined, png: Buffer): CustomObject {
    // The version in the URL makes browsers fetch a replaced sheet again.
    const v = crypto.createHash('sha1').update(png).digest('hex').slice(0, 8);
    return { id, ...meta, ...(author ? { author } : {}), url: `/objects/${id}.png?v=${v}` };
  }

  list(): CustomObject[] {
    return [...this.items.values()].map((s) => s.object);
  }

  get(id: string): CustomObject | undefined {
    return this.items.get(id)?.object;
  }

  file(id: string): Buffer | undefined {
    return this.items.get(id)?.png;
  }

  /** Checks and keeps an uploaded sheet. Nothing is stored unless every check passes. */
  add(png: Buffer, metaJson: unknown, author: string): AddResult {
    const meta = validateObjectMeta(metaJson);
    if (!meta.ok) return { ok: false, errors: meta.errors };
    if (this.items.size >= MAX_OBJECTS) return { ok: false, errors: ['too-many'], full: true };
    const errors = check(png, meta.meta);
    if (errors.length) return { ok: false, errors };
    let id = '';
    do id = `${slug(meta.meta.name)}-${crypto.randomBytes(2).toString('hex')}`;
    while (this.items.has(id));
    const object = this.describe(id, meta.meta, author.slice(0, 24), png);
    this.write(id, png, { ...meta.meta, format: 1, author: object.author, createdAt: Date.now() });
    this.items.set(id, { object, png });
    return { ok: true, object };
  }

  private write(id: string, png: Buffer, sidecar: unknown) {
    fs.mkdirSync(this.dir, { recursive: true });
    for (const [name, data] of [[`${id}.png`, png], [`${id}.json`, JSON.stringify(sidecar)]] as const) {
      const file = path.join(this.dir, name);
      fs.writeFileSync(`${file}.tmp`, data);
      fs.renameSync(`${file}.tmp`, file);
    }
  }

  remove(id: string): boolean {
    if (!this.items.delete(id)) return false;
    for (const ext of ['png', 'json']) fs.rmSync(path.join(this.dir, `${id}.${ext}`), { force: true });
    return true;
  }
}
