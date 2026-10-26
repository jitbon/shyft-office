// The items members make in the studio (specs/004-furniture-studio): validated on the way in, kept in data/items as
// one file per item, with the last few older versions kept for as long as a placed copy is pinned to them. A member's
// unfinished design is a draft in data/studio, which only they can read.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { StudioRecord } from '../shared/catalog';
import { validateItem, type ItemDefinition } from '../shared/items';

export const MAX_STUDIO_ITEMS = 500;
const KEEP_VERSIONS = 5;
export const MAX_DRAFT_BYTES = 64 * 1024;
export const MAX_DRAFT_PARTS = 64;
const DRAFT_DAYS = 30;
const ID_RE = /^[a-z0-9-]{1,32}$/;

/** A studio item as the HTTP API shows it. */
export interface ItemRecord {
  id: string;
  def: ItemDefinition;
  by: { name: string };
  version: number;
  at: number;
}

interface Stored extends ItemRecord {
  /** Who may change or delete it besides an admin. */
  owner: string;
}

export type AddResult = { ok: true; item: ItemRecord } | { ok: false; errors: string[]; full?: boolean };

export interface Draft {
  design: unknown;
  itemId?: string;
  fromHelper: boolean;
  savedAt: number;
}

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 22) || 'item';

function writeFile(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(data));
  fs.renameSync(`${file}.tmp`, file);
}

const readJson = (file: string): unknown => JSON.parse(fs.readFileSync(file, 'utf8'));
const publicRecord = ({ owner: _owner, ...rest }: Stored): ItemRecord => rest;

export class ItemsStore {
  private items = new Map<string, Stored>();
  /** Older versions that placed copies may still be pinned to, by `<id>@<version>`. */
  private older = new Map<string, Stored>();

  private constructor(private dir: string, private draftDir: string) {}

  /** Reads every item in `dir`. A bad file is logged with its codes and skipped. */
  static load(dir: string, draftDir = path.join(path.dirname(dir), 'studio')): ItemsStore {
    const store = new ItemsStore(dir, draftDir);
    let names: string[] = [];
    try {
      names = fs.readdirSync(dir).filter((n) => n.endsWith('.json')).sort();
    } catch {
      return store;
    }
    for (const name of names) {
      const base = name.slice(0, -'.json'.length);
      const [id, ver] = base.split('@');
      const skip = (codes: string[]) => console.warn(`items: skipped ${base}: ${codes.join(', ')}`);
      if (!ID_RE.test(id)) {
        skip(['bad-id']);
        continue;
      }
      try {
        const raw = readJson(path.join(dir, name)) as Partial<Stored>;
        const checked = validateItem(raw.def);
        if (!checked.ok) {
          skip(checked.errors);
          continue;
        }
        const stored: Stored = {
          id, def: checked.item, by: { name: String(raw.by?.name ?? 'A member').slice(0, 24) },
          version: Number.isInteger(raw.version) ? (raw.version as number) : 1, at: Number(raw.at) || 0, owner: String(raw.owner ?? ''),
        };
        if (ver === undefined) store.items.set(id, stored);
        else store.older.set(`${id}@${ver}`, stored);
      } catch {
        skip(['bad-item']);
      }
    }
    return store;
  }

  list(): ItemRecord[] {
    return [...this.items.values()].map(publicRecord);
  }

  /** The kept older versions, for browsers that show a copy pinned to one. */
  olderList(): ItemRecord[] {
    return [...this.older.values()].map(publicRecord);
  }

  get(id: string): ItemRecord | undefined {
    const s = this.items.get(id);
    return s && publicRecord(s);
  }

  ownerOf(id: string): string | undefined {
    return this.items.get(id)?.owner;
  }

  /** The records for the catalog: the current version of every item. */
  records(): StudioRecord[] {
    return [...this.items.values()].map((s) => ({ id: s.id, def: s.def, by: s.by.name, version: s.version }));
  }

  /** The kept older versions, for catalog entries that a pinned copy shows. */
  olderRecords(): StudioRecord[] {
    return [...this.older.values()].map((s) => ({ id: s.id, def: s.def, by: s.by.name, version: s.version }));
  }

  /** Checks and keeps a new item. Nothing is stored unless it is valid. */
  add(def: unknown, by: { name: string; memberId: string }): AddResult {
    const checked = validateItem(def);
    if (!checked.ok) return { ok: false, errors: checked.errors };
    if (this.items.size >= MAX_STUDIO_ITEMS) return { ok: false, errors: ['too-many'], full: true };
    let id = '';
    do {
      id = `${slug(checked.item.name)}-${crypto.randomBytes(2).toString('hex')}`;
      if (id.startsWith('rm-')) id = `my-${id}`.slice(0, 32); // `rm-` is the ready-made prefix
    } while (this.items.has(id));
    const stored: Stored = { id, def: checked.item, by: { name: by.name.slice(0, 24) }, version: 1, at: Date.now(), owner: by.memberId };
    writeFile(path.join(this.dir, `${id}.json`), stored);
    this.items.set(id, stored);
    return { ok: true, item: publicRecord(stored) };
  }

  /**
   * Replaces the design of `id` with a new version. The old one is kept as `<id>@<version>` when `keepOld` (some placed copy
   * is pinned to it). Returns the new record, or the codes when the design is not valid.
   */
  change(id: string, def: unknown, keepOld: boolean): { ok: true; item: ItemRecord; old: ItemRecord } | { ok: false; errors: string[] } {
    const cur = this.items.get(id);
    if (!cur) return { ok: false, errors: ['no-such-item'] };
    const checked = validateItem(def);
    if (!checked.ok) return { ok: false, errors: checked.errors };
    const next: Stored = { ...cur, def: checked.item, version: cur.version + 1, at: Date.now() };
    if (keepOld) {
      writeFile(path.join(this.dir, `${id}@${cur.version}.json`), cur);
      this.older.set(`${id}@${cur.version}`, cur);
    }
    writeFile(path.join(this.dir, `${id}.json`), next);
    this.items.set(id, next);
    return { ok: true, item: publicRecord(next), old: publicRecord(cur) };
  }

  /** Throws away older versions nothing is pinned to, and all but the last few of the rest. `pinned` lists `item:<id>@<version>`, as a layout's `v` fields give them. */
  prune(pinned: ReadonlySet<string>) {
    const byItem = new Map<string, number[]>();
    for (const key of this.older.keys()) {
      const [id, v] = key.split('@');
      byItem.set(id, [...(byItem.get(id) ?? []), Number(v)]);
    }
    for (const [id, versions] of byItem) {
      const keep = new Set(versions.filter((v) => pinned.has(`item:${id}@${v}`)).sort((a, b) => b - a).slice(0, KEEP_VERSIONS));
      for (const v of versions) {
        if (keep.has(v) && this.items.has(id)) continue;
        this.older.delete(`${id}@${v}`);
        fs.rmSync(path.join(this.dir, `${id}@${v}.json`), { force: true });
      }
    }
  }

  /** Removes an item and every kept version of it. */
  remove(id: string): boolean {
    if (!this.items.delete(id)) return false;
    fs.rmSync(path.join(this.dir, `${id}.json`), { force: true });
    for (const key of [...this.older.keys()]) {
      if (key.startsWith(`${id}@`)) {
        this.older.delete(key);
        fs.rmSync(path.join(this.dir, `${key}.json`), { force: true });
      }
    }
    return true;
  }

  // ------------------------------------------------------------------ studio drafts

  private draftFile(memberId: string) {
    return path.join(this.draftDir, `${crypto.createHash('sha1').update(memberId).digest('hex')}.json`);
  }

  getDraft(memberId: string): Draft | undefined {
    try {
      return readJson(this.draftFile(memberId)) as Draft;
    } catch {
      return undefined;
    }
  }

  saveDraft(memberId: string, design: unknown, itemId: string | undefined, fromHelper: boolean): number {
    const savedAt = Date.now();
    writeFile(this.draftFile(memberId), { design, ...(itemId ? { itemId } : {}), fromHelper, savedAt } satisfies Draft);
    return savedAt;
  }

  deleteDraft(memberId: string) {
    fs.rmSync(this.draftFile(memberId), { force: true });
  }

  /** Removes drafts nobody has touched for 30 days. */
  pruneDrafts(now = Date.now()) {
    let names: string[] = [];
    try {
      names = fs.readdirSync(this.draftDir);
    } catch {
      return;
    }
    for (const n of names) {
      const file = path.join(this.draftDir, n);
      try {
        const d = readJson(file) as Draft;
        if (now - d.savedAt > DRAFT_DAYS * 86_400_000) fs.rmSync(file, { force: true });
      } catch {
        fs.rmSync(file, { force: true });
      }
    }
  }
}
