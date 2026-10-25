import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DESKS, DESK_PODS } from '../../shared/map';
import { StateStore, emptyState, loadState, type StoredState } from '../../server/store';

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
  version: 1,
  deskClaims: { [DESKS[0].id]: { memberId: 'm1', name: 'Sam', claimedAt: 100 } },
  podModes: { [DESK_PODS[0].id]: 'cubicle' },
  areaAllowed: { 'meet-b': ['m1', 'm2'] },
});

describe('state store', () => {
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

  it('drops claims for desks that no longer exist, and unknown pods and areas', () => {
    const raw = {
      version: 1,
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
    expect(s.podModes).toEqual({ [DESK_PODS[0].id]: 'cubicle' });
    expect(s.areaAllowed).toEqual({ 'meet-b': ['m1'] });
  });

  it('keeps one desk per member (the earliest claim) and ignores guest ids', () => {
    const raw = {
      version: 1,
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
    fs.writeFileSync(path.join(dir, 'office-state.json'), JSON.stringify({ ...sample(), version: 2 }));
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
