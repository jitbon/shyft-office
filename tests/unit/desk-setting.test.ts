import { describe, expect, it } from 'vitest';
import { DESK_VIEW_KEY, readDeskViewSetting, writeDeskViewSetting } from '../../shared/desk-presence';

const memory = (): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, String(v)),
    removeItem: (k) => void data.delete(k),
  };
};
const broken = {
  getItem: () => { throw new Error('blocked'); },
  setItem: () => { throw new Error('blocked'); },
  removeItem: () => { throw new Error('blocked'); },
};

describe('the desk view setting', () => {
  it('uses the key shyft.deskView', () => {
    expect(DESK_VIEW_KEY).toBe('shyft.deskView');
  });

  it('is on when nothing is stored, and for any value but "off"', () => {
    const s = memory();
    expect(readDeskViewSetting(s)).toBe(true);
    s.data.set(DESK_VIEW_KEY, 'on');
    expect(readDeskViewSetting(s)).toBe(true);
    s.data.set(DESK_VIEW_KEY, 'whatever');
    expect(readDeskViewSetting(s)).toBe(true);
    s.data.set(DESK_VIEW_KEY, 'off');
    expect(readDeskViewSetting(s)).toBe(false);
  });

  it('stores "off" when switched off and removes the key when switched on', () => {
    const s = memory();
    writeDeskViewSetting(s, false);
    expect(s.data.get(DESK_VIEW_KEY)).toBe('off');
    expect(readDeskViewSetting(s)).toBe(false);
    writeDeskViewSetting(s, true);
    expect(s.data.has(DESK_VIEW_KEY)).toBe(false);
    expect(readDeskViewSetting(s)).toBe(true);
  });

  it('treats storage that throws, or no storage, as on and never throws', () => {
    expect(readDeskViewSetting(broken)).toBe(true);
    expect(() => writeDeskViewSetting(broken, false)).not.toThrow();
    expect(readDeskViewSetting(undefined)).toBe(true);
    expect(() => writeDeskViewSetting(undefined, false)).not.toThrow();
  });
});
