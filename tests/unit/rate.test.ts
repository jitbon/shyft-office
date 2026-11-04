import { describe, expect, it } from 'vitest';
import { Cooldown, RateWindow } from '../../server/rate';

describe('RateWindow', () => {
  it('allows up to the count in the window, then refuses until the oldest event leaves it', () => {
    const w = new RateWindow(1000);
    for (let i = 0; i < 4; i++) expect(w.take('a', { count: 4 }, 0, 100 + i)).toBe(true);
    expect(w.take('a', { count: 4 }, 0, 200)).toBe(false);
    expect(w.take('a', { count: 4 }, 0, 1099)).toBe(false);
    expect(w.take('a', { count: 4 }, 0, 1100)).toBe(true); // the event at 100 has left the window
  });

  it('does not record a refused event', () => {
    const w = new RateWindow(1000);
    expect(w.take('a', { count: 1 }, 0, 0)).toBe(true);
    for (let i = 0; i < 10; i++) expect(w.take('a', { count: 1 }, 0, 10 + i)).toBe(false);
    expect(w.take('a', { count: 1 }, 0, 1000)).toBe(true); // the refusals did not push the window along
  });

  it('limits total weight as well as count', () => {
    const w = new RateWindow(1000);
    expect(w.take('a', { count: 100, weight: 1000 }, 600, 0)).toBe(true);
    expect(w.take('a', { count: 100, weight: 1000 }, 500, 1)).toBe(false);
    expect(w.take('a', { count: 100, weight: 1000 }, 400, 2)).toBe(true);
  });

  it('keeps keys apart', () => {
    const w = new RateWindow(1000);
    expect(w.take('a', { count: 1 }, 0, 0)).toBe(true);
    expect(w.take('b', { count: 1 }, 0, 0)).toBe(true);
    expect(w.take('a', { count: 1 }, 0, 1)).toBe(false);
  });

  it('forgets a key on request, and sweeps keys that went quiet', () => {
    const w = new RateWindow(1000);
    w.take('gone', { count: 5 }, 0, 0);
    w.forget('gone');
    expect(w.size).toBe(0);
    for (let i = 0; i < 300; i++) w.take(`k${i}`, { count: 5 }, 0, 0);
    for (let i = 0; i < 256; i++) w.take('live', { count: 1000 }, 0, 5000);
    expect(w.size).toBe(1); // only the key still in use
  });
});

describe('Cooldown', () => {
  it('lets a key through once per period', () => {
    const c = new Cooldown(1000);
    expect(c.ready('a', 0)).toBe(true);
    expect(c.ready('a', 999)).toBe(false);
    expect(c.ready('a', 1000)).toBe(true);
    expect(c.ready('b', 1)).toBe(true);
  });
});
