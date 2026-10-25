import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultLayout } from '../../shared/default-layout';
import { DRAFT_MAX_AGE_MS, KEPT_HISTORY, LayoutStore } from '../../server/layout-store';
import { emptyLayout, smallOffice } from './fixtures/layouts';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shyft-layout-'));
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

const by = { memberId: 'm1', name: 'Sam' };
const MEMBER = 'a1b2c3d4-0000-4000-8000-000000000001';

describe('published layouts', () => {
  it('starts a fresh folder as revision 1 of the built-in office, and saves it at once', () => {
    const store = LayoutStore.load(dir);
    expect(store.current.rev).toBe(1);
    expect(store.current.layout).toEqual(defaultLayout());
    expect(store.current.by.name).toBe('Shyft');
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'layout.json'), 'utf8'))).toMatchObject({ format: 1, rev: 1 });
  });

  it('keeps the current revision and nine earlier ones', () => {
    const store = LayoutStore.load(dir);
    for (let i = 0; i < 12; i++) store.publish(i % 2 ? smallOffice() : emptyLayout(), by);
    expect(store.current.rev).toBe(13);
    expect(store.history()).toHaveLength(KEPT_HISTORY + 1);
    expect(store.history().map((r) => r.rev)).toEqual([13, 12, 11, 10, 9, 8, 7, 6, 5, 4]);
    expect(store.revision(3)).toBeUndefined();
    expect(store.revision(7)?.by).toEqual(by);
  });

  it('serves the same revisions after a restart', () => {
    const store = LayoutStore.load(dir);
    store.publish(smallOffice(), by);
    const again = LayoutStore.load(dir);
    expect(again.current.rev).toBe(2);
    expect(again.current.layout).toEqual(smallOffice());
    expect(again.revision(1)?.layout).toEqual(defaultLayout());
  });

  it('moves a broken file aside, never deletes it, and starts from the built-in office', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    fs.writeFileSync(path.join(dir, 'layout.json'), '{not json');
    const store = LayoutStore.load(dir);
    expect(store.current.rev).toBe(1);
    expect(fs.readdirSync(dir).some((n) => n.startsWith('layout.json.broken-'))).toBe(true);
  });

  it('drops placed objects of a kind that no longer exists instead of losing the office', () => {
    const store = LayoutStore.load(dir);
    const l = smallOffice();
    store.publish({ ...l, objects: [...l.objects, { id: 'ghost', kind: 'custom:gone', x: 2, y: 8, rot: 0 }] } as never, by);
    const again = LayoutStore.load(dir);
    expect(again.current.rev).toBe(2);
    expect(again.current.layout.objects.map((o) => o.id)).not.toContain('ghost');
  });
});

describe('drafts', () => {
  it('saves, loads and deletes a draft for one member', () => {
    const store = LayoutStore.load(dir);
    expect(store.getDraft(MEMBER)).toBeNull();
    store.saveDraft(MEMBER, 1, smallOffice(), 1234);
    expect(store.getDraft(MEMBER)).toEqual({ baseRev: 1, layout: smallOffice(), savedAt: 1234 });
    expect(store.getDraft('someone-else')).toBeNull();
    store.deleteDraft(MEMBER);
    expect(store.getDraft(MEMBER)).toBeNull();
  });

  it('refuses member ids that could point outside the drafts folder', () => {
    const store = LayoutStore.load(dir);
    expect(() => store.saveDraft('../../etc/passwd', 1, smallOffice())).toThrow();
    expect(() => store.getDraft('a/b')).not.toThrow(); // reading a bad id just finds nothing
    expect(store.getDraft('a/b')).toBeNull();
  });

  it('prunes only drafts last saved more than 30 days ago', () => {
    const store = LayoutStore.load(dir);
    const now = 10 * DRAFT_MAX_AGE_MS;
    store.saveDraft('old-one', 1, smallOffice(), now - DRAFT_MAX_AGE_MS - 1);
    store.saveDraft('new-one', 1, smallOffice(), now - DRAFT_MAX_AGE_MS + 1000);
    expect(store.pruneDrafts(now)).toBe(1);
    expect(store.getDraft('old-one')).toBeNull();
    expect(store.getDraft('new-one')).not.toBeNull();
  });
});
