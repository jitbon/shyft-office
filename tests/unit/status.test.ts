import { describe, expect, it } from 'vitest';
import { nearestFreeTileNear, tileAt } from '../../shared/map';
import { MAX_STATUS_MS, MAX_STATUS_TEXT, cleanStatus, expireStatus } from '../../shared/status';

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
