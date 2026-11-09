import { describe, expect, it } from 'vitest';
import { nearestFreeTileNear, tileAt } from '../../shared/map';
import {
  MAX_STATUS_MS,
  MAX_STATUS_TEXT,
  STATUS_IDS,
  STATUS_PRESETS,
  blocksConversations,
  cleanStatus,
  devicesOff,
  dims,
  expireStatus,
  isAway,
  limitUntil,
  nextMorning,
  pushRecent,
  shownStatus,
  statusId,
  statusIcon,
  timeLeftText,
} from '../../shared/status';

const NOW = 1_000_000;

describe('cleanStatus', () => {
  it('accepts the three kinds', () => {
    for (const kind of ['available', 'busy', 'dnd']) expect(cleanStatus({ kind }, NOW)).toEqual({ kind });
  });

  it('rejects an unknown kind or something that is not an object', () => {
    for (const bad of [{ kind: 'away' }, { kind: 7 }, {}, null, undefined, 'dnd']) expect(cleanStatus(bad, NOW)).toBeNull();
  });

  it('clamps the text to 60 characters and drops blank text', () => {
    const long = cleanStatus({ kind: 'busy', text: `  ${'x'.repeat(100)}  ` }, NOW)!;
    expect(long.text).toHaveLength(MAX_STATUS_TEXT);
    expect(cleanStatus({ kind: 'busy', text: '   ' }, NOW)).toEqual({ kind: 'busy' });
    expect(cleanStatus({ kind: 'busy', text: 42 }, NOW)).toEqual({ kind: 'busy' });
  });

  it('rejects an expiry that is not in the future', () => {
    expect(cleanStatus({ kind: 'dnd', until: NOW }, NOW)).toBeNull();
    expect(cleanStatus({ kind: 'dnd', until: NOW - 5000 }, NOW)).toBeNull();
    expect(cleanStatus({ kind: 'dnd', until: Number.NaN }, NOW)).toBeNull();
    expect(cleanStatus({ kind: 'dnd', until: '9999999' }, NOW)).toBeNull();
  });

  it('keeps a future expiry, and shortens one more than a day away', () => {
    expect(cleanStatus({ kind: 'dnd', until: NOW + 900_000 }, NOW)).toEqual({ kind: 'dnd', until: NOW + 900_000 });
    expect(cleanStatus({ kind: 'dnd', until: NOW + 10 * MAX_STATUS_MS }, NOW)!.until).toBe(NOW + MAX_STATUS_MS);
  });
});

describe('expireStatus', () => {
  it('reverts an expired status to available', () => {
    expect(expireStatus({ kind: 'dnd', text: 'in a call', until: NOW }, NOW)).toEqual({ kind: 'available' });
    expect(expireStatus({ kind: 'busy', until: NOW - 1 }, NOW)).toEqual({ kind: 'available' });
  });

  it('leaves a running or open-ended status alone', () => {
    const running = { kind: 'dnd' as const, until: NOW + 1 };
    expect(expireStatus(running, NOW)).toBe(running);
    const open = { kind: 'busy' as const, text: 'heads down' };
    expect(expireStatus(open, NOW)).toBe(open);
  });
});

describe('where a ringing teammate lands', () => {
  // Row 19 of the lobby is open floor, nothing on it.
  it('is a walkable tile next to the caller, never the caller tile', () => {
    const caller = { x: 20.5, y: 19.5 };
    const t = nearestFreeTileNear(caller.x, caller.y, new Set(['20,19']))!;
    expect(Math.abs(t.x - caller.x) + Math.abs(t.y - caller.y)).toBe(1);
    expect(['.', ',', ';', '_']).toContain(tileAt(Math.floor(t.x), Math.floor(t.y)));
  });

  it('skips tiles other people stand on', () => {
    const t = nearestFreeTileNear(20.5, 19.5, new Set(['20,19', '21,19', '19,19', '20,18']))!;
    expect(`${Math.floor(t.x)},${Math.floor(t.y)}`).toBe('20,20');
  });

  it('keeps someone in a meeting room inside it', () => {
    // Standing at the room's south wall: the tile beyond the wall is outside, so it is never chosen.
    const t = nearestFreeTileNear(3.5, 8.5, new Set(['3,8']))!;
    expect(t.y).toBeLessThan(9);
  });
});

describe('presets and emoji in cleanStatus', () => {
  it('accepts each preset and stores it as busy whatever kind was sent', () => {
    for (const preset of ['meeting', 'focus', 'lunch', 'coffee', 'away', 'out']) {
      expect(cleanStatus({ kind: 'available', preset }, NOW)).toEqual({ kind: 'busy', preset });
      expect(cleanStatus({ kind: 'dnd', preset }, NOW)).toEqual({ kind: 'busy', preset });
    }
  });

  it('rejects an unknown or non-string preset, and still rejects a bare away kind', () => {
    expect(cleanStatus({ kind: 'busy', preset: 'nap' }, NOW)).toBeNull();
    expect(cleanStatus({ kind: 'busy', preset: 7 }, NOW)).toBeNull();
    expect(cleanStatus({ kind: 'away' }, NOW)).toBeNull();
  });

  it('keeps one emoji grapheme, drops the rest', () => {
    for (const e of ['🍜', '👍🏽', '🏳️‍🌈']) expect(cleanStatus({ kind: 'busy', emoji: e }, NOW)!.emoji).toBe(e);
    expect(cleanStatus({ kind: 'busy', emoji: '🍜🍕' }, NOW)!.emoji).toBe('🍜');
    for (const bad of ['a', '', 7]) expect(cleanStatus({ kind: 'busy', emoji: bad }, NOW)!.emoji).toBeUndefined();
    expect(cleanStatus({ kind: 'busy', emoji: `👩${'\u200d👩'.repeat(8)}` }, NOW)!.emoji).toBeUndefined(); // over 16 units
  });

  it('ignores a client-sent auto', () => {
    expect(cleanStatus({ kind: 'busy', preset: 'meeting', auto: true }, NOW)).toEqual({ kind: 'busy', preset: 'meeting' });
  });
});

describe('status effects table', () => {
  it('answers the effect questions for all nine ids', () => {
    const on = (f: (s: { kind: 'busy' | 'available' | 'dnd'; preset?: any }) => boolean) =>
      STATUS_IDS.filter((id) => f(id === 'available' || id === 'busy' || id === 'dnd' ? { kind: id } : { kind: 'busy', preset: id }));
    expect(on(blocksConversations)).toEqual(['dnd', 'focus', 'lunch', 'coffee', 'away', 'out']);
    expect(on(devicesOff)).toEqual(['dnd', 'lunch', 'coffee', 'away', 'out']);
    expect(on(dims)).toEqual(['lunch', 'coffee', 'away', 'out']);
    expect(on(isAway)).toEqual(['lunch', 'coffee', 'away', 'out']);
  });

  it('gives every id a label, a phrase and (but Available) an icon', () => {
    expect(STATUS_IDS).toHaveLength(9);
    for (const id of STATUS_IDS) {
      expect(STATUS_PRESETS[id].label).not.toBe('');
      expect(STATUS_PRESETS[id].phrase).not.toBe('');
      if (id !== 'available') expect(STATUS_PRESETS[id].icon).not.toBe('');
    }
  });

  it('names a status by its preset, else its kind, and lets a custom emoji win', () => {
    expect(statusId({ kind: 'busy', preset: 'lunch' })).toBe('lunch');
    expect(statusId({ kind: 'dnd' })).toBe('dnd');
    expect(statusIcon({ kind: 'busy', preset: 'lunch', emoji: '🍜' })).toBe('🍜');
    expect(statusIcon({ kind: 'busy', preset: 'lunch' })).toBe('🍽');
  });
});

describe('time limits', () => {
  const at = (h: number, m = 0) => new Date(2026, 5, 10, h, m).getTime();
  it('puts the next morning at 08:00 local', () => {
    expect(nextMorning(at(14))).toBe(new Date(2026, 5, 11, 8).getTime());
    expect(nextMorning(at(6))).toBe(new Date(2026, 5, 10, 8).getTime());
  });

  it('gives each preset its default limit', () => {
    const now = at(12);
    expect(limitUntil('lunch', now)).toBe(now + 3_600_000);
    expect(limitUntil('coffee', now)).toBe(now + 900_000);
    expect(limitUntil('out', now)).toBe(nextMorning(now));
    for (const id of ['away', 'busy', 'dnd'] as const) expect(limitUntil(id, now)).toBeUndefined();
  });

  it('words the time left', () => {
    const now = at(12);
    expect(timeLeftText({ kind: 'busy', preset: 'lunch', until: now + 42 * 60_000 }, now)).toBe('42 min left');
    expect(timeLeftText({ kind: 'busy', preset: 'lunch', until: now + 65 * 60_000 }, now)).toBe('1 h 5 min left');
    expect(timeLeftText({ kind: 'busy', preset: 'out', until: nextMorning(now) }, now)).toBe('back tomorrow');
    expect(timeLeftText({ kind: 'busy' }, now)).toBe('');
  });
});

describe('pushRecent', () => {
  it('keeps three, newest first, without duplicates, and never Available', () => {
    let list: { kind: 'available' | 'busy' | 'dnd'; preset?: any; text?: string }[] = [];
    list = pushRecent(list, { kind: 'busy', preset: 'lunch' });
    list = pushRecent(list, { kind: 'busy', preset: 'coffee' });
    list = pushRecent(list, { kind: 'dnd' });
    list = pushRecent(list, { kind: 'busy', preset: 'focus' });
    expect(list.map(statusId)).toEqual(['focus', 'dnd', 'coffee']);
    list = pushRecent(list, { kind: 'busy', preset: 'coffee' });
    expect(list.map(statusId)).toEqual(['coffee', 'focus', 'dnd']);
    list = pushRecent(list, { kind: 'busy', preset: 'coffee', text: 'quick one' });
    expect(list).toHaveLength(3);
    expect(pushRecent(list, { kind: 'available' })).toEqual(list);
  });
});

describe('shownStatus', () => {
  const auto = { kind: 'busy', preset: 'meeting', auto: true };
  it('shows Available as an automatic meeting while in one, only when the setting is on', () => {
    expect(shownStatus({ kind: 'available' }, true, true, NOW)).toEqual(auto);
    expect(shownStatus({ kind: 'available' }, true, false, NOW)).toEqual({ kind: 'available' });
    expect(shownStatus({ kind: 'available' }, false, true, NOW)).toEqual({ kind: 'available' });
  });

  it('never replaces a status the member chose', () => {
    for (const chosen of [{ kind: 'busy' }, { kind: 'dnd' }, { kind: 'busy', preset: 'lunch' }, { kind: 'busy', preset: 'focus' }] as const) {
      expect(shownStatus(chosen, true, true, NOW)).toBe(chosen);
    }
  });

  it('treats an expired chosen status as Available', () => {
    expect(shownStatus({ kind: 'busy', preset: 'lunch', until: NOW }, false, true, NOW)).toEqual({ kind: 'available' });
    expect(shownStatus({ kind: 'busy', preset: 'lunch', until: NOW }, true, true, NOW)).toEqual(auto);
  });
});
