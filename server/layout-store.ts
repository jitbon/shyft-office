import fs from 'node:fs';
import path from 'node:path';
import { currentCatalog, parseLayoutWith, type Catalog } from '../shared/catalog';
import { defaultLayout } from '../shared/default-layout';
import { cloneLayout, type Layout } from '../shared/layout';

export interface Publisher {
  memberId: string;
  name: string;
}

export interface Revision {
  rev: number;
  layout: Layout;
  by: Publisher;
  at: number;
}

export interface Draft {
  baseRev: number;
  layout: Layout;
  savedAt: number;
}

const FILE = 'layout.json';
const DRAFTS = 'drafts';
/** The current revision plus this many earlier ones are kept. */
export const KEPT_HISTORY = 9;
export const DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const SYSTEM: Publisher = { memberId: 'system', name: 'Shyft' };
const SAFE_ID = /^[a-z0-9-]{1,64}$/;

/** Writes beside the real file, then renames: a crash mid-write never leaves half a file. */
function writeJson(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file);
}

/** Objects whose kind is not in the catalog (a custom object that was removed) are dropped, not fatal. */
function dropUnknownObjects(raw: unknown, catalog: Catalog): unknown {
  if (typeof raw !== 'object' || raw === null || !Array.isArray((raw as { objects?: unknown }).objects)) return raw;
  const l = raw as { objects: { kind?: unknown }[] };
  return { ...l, objects: l.objects.filter((o) => typeof o?.kind === 'string' && catalog.has(o.kind)) };
}

/** The published layout and its recent history, and every member's private draft. */
export class LayoutStore {
  /** The current revision first, then older ones, newest to oldest. */
  private revs: Revision[];

  private constructor(private dir: string, private catalog: () => Catalog, revs: Revision[]) {
    this.revs = revs;
  }

  /**
   * Reads data/layout.json. A missing file starts the built-in office as revision 1 and saves it at once. A
   * broken file is renamed aside (never deleted) and the built-in office is used.
   */
  static load(dir: string, catalog: () => Catalog = currentCatalog): LayoutStore {
    const file = path.join(dir, FILE);
    let raw: string | undefined;
    try {
      raw = fs.readFileSync(file, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') console.warn(`Ignoring unreadable ${FILE}:`, (err as Error).message);
    }
    const fresh = () => {
      const store = new LayoutStore(dir, catalog, [{ rev: 1, layout: defaultLayout(), by: SYSTEM, at: Date.now() }]);
      store.save();
      return store;
    };
    if (raw === undefined) return fresh();

    const revs = LayoutStore.parseFile(raw, catalog());
    if (!revs) {
      const aside = `${file}.broken-${Date.now()}`;
      try {
        fs.renameSync(file, aside);
      } catch {
        /* the file stays where it is; the next save replaces it */
      }
      console.warn(`${FILE} could not be read; moved to ${path.basename(aside)} and using the built-in office`);
      return fresh();
    }
    return new LayoutStore(dir, catalog, revs);
  }

  private static parseFile(text: string, catalog: Catalog): Revision[] | null {
    let json: { format?: unknown; current?: unknown; history?: unknown };
    try {
      json = JSON.parse(text);
    } catch {
      return null;
    }
    if (json?.format !== 1) return null;
    const revision = (v: unknown): Revision | null => {
      const r = v as Partial<Revision> | null;
      if (!r || !Number.isInteger(r.rev) || (r.rev as number) < 1) return null;
      const parsed = parseLayoutWith(dropUnknownObjects(r.layout, catalog), catalog);
      if (!parsed.ok) return null;
      const by = r.by as Partial<Publisher> | undefined;
      return {
        rev: r.rev as number,
        layout: parsed.layout,
        by: { memberId: String(by?.memberId ?? 'system').slice(0, 64), name: String(by?.name ?? 'Shyft').slice(0, 24) },
        at: typeof r.at === 'number' ? r.at : 0,
      };
    };
    const current = revision(json.current);
    if (!current) return null;
    const older = (Array.isArray(json.history) ? json.history : []).map(revision).filter((r): r is Revision => !!r);
    return [current, ...older.slice(0, KEPT_HISTORY)];
  }

  private save() {
    const [current, ...history] = this.revs;
    writeJson(path.join(this.dir, FILE), { format: 1, rev: current.rev, current, history });
  }

  get current(): Revision {
    return this.revs[0];
  }

  /** Every kept revision, newest first. */
  history(): Revision[] {
    return [...this.revs];
  }

  revision(rev: number): Revision | undefined {
    return this.revs.find((r) => r.rev === rev);
  }

  /** Makes `layout` the new current revision and returns it. */
  publish(layout: Layout, by: Publisher): Revision {
    const next: Revision = { rev: this.current.rev + 1, layout: cloneLayout(layout), by: { ...by }, at: Date.now() };
    this.revs = [next, ...this.revs].slice(0, KEPT_HISTORY + 1);
    this.save();
    return next;
  }

  // ------------------------------------------------------------------ drafts

  private draftFile(memberId: string) {
    if (!SAFE_ID.test(memberId)) throw new Error('bad member id');
    return path.join(this.dir, DRAFTS, `${memberId}.json`);
  }

  getDraft(memberId: string): Draft | null {
    let json: Partial<Draft>;
    try {
      json = JSON.parse(fs.readFileSync(this.draftFile(memberId), 'utf8'));
    } catch {
      return null;
    }
    const parsed = parseLayoutWith(dropUnknownObjects(json.layout, this.catalog()), this.catalog());
    if (!parsed.ok || !Number.isInteger(json.baseRev)) return null;
    return { baseRev: json.baseRev as number, layout: parsed.layout, savedAt: typeof json.savedAt === 'number' ? json.savedAt : 0 };
  }

  saveDraft(memberId: string, baseRev: number, layout: Layout, now = Date.now()): number {
    writeJson(this.draftFile(memberId), { baseRev, layout, savedAt: now });
    return now;
  }

  deleteDraft(memberId: string) {
    try {
      fs.unlinkSync(this.draftFile(memberId));
    } catch {
      /* no draft */
    }
  }

  /** Removes drafts last saved more than 30 days ago. Returns how many. */
  pruneDrafts(now = Date.now()): number {
    const dir = path.join(this.dir, DRAFTS);
    let removed = 0;
    let names: string[] = [];
    try {
      names = fs.readdirSync(dir);
    } catch {
      return 0;
    }
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      try {
        const saved = (JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) as Partial<Draft>).savedAt;
        if (typeof saved === 'number' && now - saved <= DRAFT_MAX_AGE_MS) continue;
        fs.unlinkSync(path.join(dir, name));
        removed++;
      } catch {
        /* unreadable: leave it */
      }
    }
    return removed;
  }
}
