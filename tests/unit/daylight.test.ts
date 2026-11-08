import { describe, expect, it } from 'vitest';
import { NIGHT_FLOOR, daylightAt, seasonFor } from '../../shared/themes';

describe('daylightAt', () => {
  it('is plain at noon, warm in the morning and the evening, and cool at night', () => {
    expect(daylightAt(12)).toEqual({ r: 1, g: 1, b: 1 });
    for (const h of [7.5, 8, 8.5, 17.5, 18, 19, 19.5]) {
      const l = daylightAt(h);
      expect(l.r, `${h}h`).toBeGreaterThan(l.b);
    }
    const night = daylightAt(2);
    expect(night.b).toBeGreaterThan(night.r);
  });

  it('never goes below the night floor in any channel', () => {
    for (let m = 0; m < 24 * 60; m++) {
      const l = daylightAt(m / 60);
      for (const c of [l.r, l.g, l.b]) expect(c).toBeGreaterThanOrEqual(NIGHT_FLOOR);
    }
  });

  it('changes smoothly: no more than 0.02 in any channel from one minute to the next', () => {
    let prev = daylightAt(0);
    for (let m = 1; m <= 24 * 60; m++) {
      const l = daylightAt(m / 60);
      expect(Math.abs(l.r - prev.r)).toBeLessThanOrEqual(0.02);
      expect(Math.abs(l.g - prev.g)).toBeLessThanOrEqual(0.02);
      expect(Math.abs(l.b - prev.b)).toBeLessThanOrEqual(0.02);
      prev = l;
    }
  });

  it('repeats every 24 hours', () => {
    for (const h of [0, 3.3, 12, 17.9]) expect(daylightAt(h + 24)).toEqual(daylightAt(h));
    expect(daylightAt(24)).toEqual(daylightAt(0));
  });
});

describe('seasonFor', () => {
  it('follows the calendar in the north and is shifted by two seasons in the south', () => {
    const d = (month: number) => new Date(2026, month, 15);
    expect([0, 3, 6, 9, 11].map((m) => seasonFor(d(m)))).toEqual(['winter', 'spring', 'summer', 'autumn', 'winter']);
    expect([0, 3, 6, 9, 11].map((m) => seasonFor(d(m), 'south'))).toEqual(['summer', 'autumn', 'winter', 'spring', 'summer']);
  });
});

describe('serverHour and extraLight', () => {
  it('reads the server’s local hour from the browser clock, the offset between them and the server’s zone', async () => {
    const { serverHour } = await import('../../src/light');
    const noonUtc = Date.UTC(2026, 5, 1, 12, 30);
    expect(serverHour(noonUtc, 0, 0)).toBeCloseTo(12.5);
    expect(serverHour(noonUtc, 0, 120)).toBeCloseTo(14.5); // a server two hours ahead of UTC
    expect(serverHour(noonUtc, 30 * 60_000, 0)).toBeCloseTo(13); // our clock runs half an hour behind the server's
    expect(serverHour(Date.UTC(2026, 5, 1, 23, 0), 0, 120)).toBeCloseTo(1); // wraps past midnight
  });

  it('is plain without the switches, and uses the season and the time of day with them', async () => {
    const { extraLight } = await import('../../src/light');
    const { compileWorld } = await import('../../shared/world');
    const { builtInCatalog } = await import('../../shared/catalog');
    const { emptyLayout } = await import('./fixtures/layouts');
    const at = (layout: ReturnType<typeof emptyLayout>) => extraLight(compileWorld(layout, builtInCatalog()), 3, 3, 'winter', Date.UTC(2026, 0, 1, 18), 0, 0);
    expect(at(emptyLayout())).toEqual({ r: 1, g: 1, b: 1 });
    const day = at({ ...emptyLayout(), daylight: true });
    expect(day.r).toBeGreaterThan(day.b); // 18:00 is warm
    const both = at({ ...emptyLayout(), daylight: true, seasonal: true });
    expect(both.b).toBeGreaterThan(day.b); // winter light is a little cooler
  });
});
