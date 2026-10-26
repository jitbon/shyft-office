import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DESKS, DESK_PODS } from '../../shared/map';
import { StateStore, emptyState, loadState, parseState, type StoredState } from '../../server/store';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shyft-store-'));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  fs.rmSync(dir, { recursive: true, force: true });
});

const sample = (): StoredState => ({
  version: 3,
  deskClaims: { [DESKS[0].id]: { memberId: 'm1', name: 'Sam', claimedAt: 100 } },
  podModes: { [DESK_PODS[0].id]: 'cubicle' },
  areaAllowed: { 'meet-b': ['m1', 'm2'] },
  deskNotice: [{ memberId: 'm9', kind: 'removed' }],
  buildingEnabled: false,
  helperEnabled: true,
});

describe('state store', () => {
  it('reads a state file saved before the helper existed as helper off', () => {
    fs.writeFileSync(path.join(dir, 'office-state.json'), JSON.stringify({ version: 3, deskClaims: {}, podModes: {}, areaAllowed: {}, deskNotice: [], buildingEnabled: true }));
    expect(loadState(dir).helperEnabled).toBe(false);
  });

  it('round-trips a saved state', () => {
    const store = new StateStore(dir);
    store.save(sample());
    store.flush();
    expect(loadState(dir)).toEqual(sample());
  });

  it('starts empty when there is no file or it is corrupt', () => {
    expect(loadState(dir)).toEqual(emptyState());
    fs.writeFileSync(path.join(dir, 'office-state.json'), '{not json');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(loadState(dir)).toEqual(emptyState());
  });

  it('drops claims for desks that no longer exist, tells their holders, and drops unknown pods and areas', () => {
    const raw = {
      version: 3,
      deskClaims: {
        [DESKS[0].id]: { memberId: 'm1', name: 'Sam', claimedAt: 1 },
        'pod-99:1,1': { memberId: 'm2', name: 'Ghost', claimedAt: 2 },
      },
      podModes: { [DESK_PODS[0].id]: 'cubicle', 'pod-99': 'cubicle', [DESK_PODS[1].id]: 'weird' },
      areaAllowed: { 'meet-b': ['m1', 7], nowhere: ['m1'] },
    };
    fs.writeFileSync(path.join(dir, 'office-state.json'), JSON.stringify(raw));
    const s = loadState(dir);
    expect(Object.keys(s.deskClaims)).toEqual([DESKS[0].id]);
    expect(s.deskNotice).toEqual([{ memberId: 'm2', kind: 'removed' }]);
    expect(s.podModes).toEqual({ [DESK_PODS[0].id]: 'cubicle' });
    expect(s.areaAllowed).toEqual({ 'meet-b': ['m1'] });
  });

  it('keeps one desk per member (the earliest claim) and ignores guest ids', () => {
    const raw = {
      version: 3,
      deskClaims: {
        [DESKS[2].id]: { memberId: 'm1', name: 'Sam', claimedAt: 50 },
        [DESKS[1].id]: { memberId: 'm1', name: 'Sam', claimedAt: 10 },
        [DESKS[3].id]: { memberId: 'eph-4', name: 'Guest', claimedAt: 5 },
      },
    };
    fs.writeFileSync(path.join(dir, 'office-state.json'), JSON.stringify(raw));
    expect(Object.keys(loadState(dir).deskClaims)).toEqual([DESKS[1].id]);
  });

  it('ignores an unknown version', () => {
    fs.writeFileSync(path.join(dir, 'office-state.json'), JSON.stringify({ ...sample(), version: 99 }));
    expect(loadState(dir)).toEqual(emptyState());
  });

  it('writes to a temporary file and renames it into place', () => {
    const rename = vi.spyOn(fs, 'renameSync');
    const store = new StateStore(dir);
    store.save(sample());
    store.flush();
    const file = path.join(dir, 'office-state.json');
    expect(rename).toHaveBeenCalledWith(`${file}.tmp`, file);
    expect(fs.readdirSync(dir)).toEqual(['office-state.json']);
  });

  it('turns changes made within a second into one write', () => {
    vi.useFakeTimers();
    const write = vi.spyOn(fs, 'writeFileSync');
    const store = new StateStore(dir, 1000);
    store.save(sample());
    store.save({ ...sample(), podModes: {} });
    vi.advanceTimersByTime(900);
    expect(write).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(write).toHaveBeenCalledTimes(1);
    expect(loadState(dir).podModes).toEqual({});
  });
});

describe('desks reset by the redesign (version 1 files)', () => {
  const file = () => path.join(dir, 'office-state.json');
  const v1 = () => ({
    version: 1,
    deskClaims: {
      'pod-1:4,12': { memberId: 'm1', name: 'Sam', claimedAt: 10 },
      'pod-5:20,12': { memberId: 'm2', name: 'Kim', claimedAt: 20 },
      'pod-2:12,12': { memberId: 'm1', name: 'Sam', claimedAt: 30 },
      'pod-3:26,12': { memberId: 'eph-7', name: 'Guest', claimedAt: 40 },
    },
    podModes: { 'pod-2': 'cubicle' },
    areaAllowed: { 'meet-b': ['m1', 7] },
  });

  it('releases every claim and pod mode, keeps the room allow-lists, and lists each holder once', () => {
    fs.writeFileSync(file(), JSON.stringify(v1()));
    expect(parseState(v1())).toEqual({
      version: 3,
      deskClaims: {},
      podModes: {},
      areaAllowed: { 'meet-b': ['m1'] },
      deskNotice: [{ memberId: 'm1', kind: 'reset' }, { memberId: 'm2', kind: 'reset' }],
      buildingEnabled: true,
      helperEnabled: false,
    });
  });

  it('saves the migrated file straight away, so a restart never resets again', () => {
    fs.writeFileSync(file(), JSON.stringify(v1()));
    const first = loadState(dir);
    expect(first.deskNotice.map((n) => n.memberId)).toEqual(['m1', 'm2']);
    expect(JSON.parse(fs.readFileSync(file(), 'utf8'))).toMatchObject({ version: 3, deskClaims: {} });
    // Someone claims a desk, the notice list is emptied, and the next start keeps both.
    const later: StoredState = { ...first, deskClaims: { [DESKS[0].id]: { memberId: 'm1', name: 'Sam', claimedAt: 99 } }, deskNotice: [] };
    const store = new StateStore(dir);
    store.save(later);
    store.flush();
    expect(loadState(dir)).toEqual(later);
  });

  it('caps the notice list and skips junk member ids', () => {
    const claims = Object.fromEntries(
      Array.from({ length: 600 }, (_, i) => [`pod-1:${i},1`, { memberId: `m${i}`, name: 'x', claimedAt: i }]),
    );
    claims['pod-1:1,2'] = { memberId: '', name: 'x', claimedAt: 1 };
    claims['pod-1:1,3'] = { memberId: 5 as unknown as string, name: 'x', claimedAt: 1 };
    const out = parseState({ version: 1, deskClaims: claims });
    expect(out.deskNotice).toHaveLength(500);
    expect(out.deskNotice.map((n) => n.memberId)).not.toContain('');
  });
});

describe('desk claims move to desk ids (version 2 files)', () => {
  const file = () => path.join(dir, 'office-state.json');
  // Version 2 named a desk after its pod and chair: pod-1:6,12 is the desk whose chair is at (6, 12).
  const v2 = () => ({
    version: 2,
    deskClaims: Object.fromEntries(
      DESKS.map((d, i) => [`${d.podId}:${d.seat.x},${d.seat.y}`, { memberId: `m${i}`, name: `Member ${i}`, claimedAt: i }]),
    ),
    podModes: { 'pod-2': 'cubicle' },
    areaAllowed: { 'meet-b': ['m1'] },
    deskResetNotice: ['n1', 'n1', '', 7, 'eph-1'],
  });

  it('keeps all 12 claims with the same holders', () => {
    const out = parseState(v2());
    expect(Object.keys(out.deskClaims)).toEqual(DESKS.map((d) => d.id));
    DESKS.forEach((d, i) => expect(out.deskClaims[d.id].memberId).toBe(`m${i}`));
    expect(out.podModes).toEqual({ 'pod-2': 'cubicle' });
    expect(out.areaAllowed).toEqual({ 'meet-b': ['m1'] });
    expect(out.buildingEnabled).toBe(true);
  });

  it('keeps notices still waiting, as reset notices, once each and for real members only', () => {
    expect(parseState(v2()).deskNotice).toEqual([{ memberId: 'n1', kind: 'reset' }]);
  });

  it('releases a claim whose desk is gone and tells its holder', () => {
    const raw = v2();
    (raw.deskClaims as Record<string, unknown>)['pod-9:1,1'] = { memberId: 'gone', name: 'Gone', claimedAt: 99 };
    const out = parseState(raw);
    expect(Object.keys(out.deskClaims)).toHaveLength(12);
    expect(out.deskNotice).toContainEqual({ memberId: 'gone', kind: 'removed' });
  });

  it('saves the upgrade at once as version 3', () => {
    fs.writeFileSync(file(), JSON.stringify(v2()));
    loadState(dir);
    expect(JSON.parse(fs.readFileSync(file(), 'utf8'))).toMatchObject({ version: 3, buildingEnabled: true });
  });

  it('cleans a version 3 notice list: real members only, no repeats, at most 500', () => {
    const out = parseState({
      version: 3,
      deskNotice: [
        { memberId: 'a', kind: 'reset' }, { memberId: 'a', kind: 'reset' }, { memberId: '', kind: 'reset' },
        { memberId: 7, kind: 'reset' }, { memberId: 'eph-1', kind: 'reset' }, { memberId: 'b', kind: 'removed' },
        { memberId: 'c', kind: 'nope' },
        ...Array.from({ length: 600 }, (_, i) => ({ memberId: `n${i}`, kind: 'removed' })),
      ],
    });
    expect(out.deskNotice.slice(0, 2)).toEqual([{ memberId: 'a', kind: 'reset' }, { memberId: 'b', kind: 'removed' }]);
    expect(out.deskNotice).toHaveLength(500);
    expect(parseState({ version: 3, deskNotice: 'nope' }).deskNotice).toEqual([]);
  });

  it('keeps building switched on unless it was saved as off', () => {
    expect(parseState({ version: 3 }).buildingEnabled).toBe(true);
    expect(parseState({ version: 3, buildingEnabled: false }).buildingEnabled).toBe(false);
  });

  it('starts a fresh install with nothing to tell anyone', () => {
    expect(loadState(dir)).toEqual(emptyState());
    expect(emptyState()).toEqual({ version: 3, deskClaims: {}, podModes: {}, areaAllowed: {}, deskNotice: [], buildingEnabled: true, helperEnabled: false });
    expect(fs.existsSync(file())).toBe(false);
  });
});
