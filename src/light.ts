// The extra tint on first-person light: the season's, when the office has seasonal touches on, and the time of day's, when it has
// daylight on. Both are first person only; the top-down view does not change.
import type { Season } from '../shared/season';
import { daylightAt, themeById } from '../shared/themes';
import type { World } from '../shared/world';

/** The hour of the server's local day (0–24) at browser time `now`, given how far the server's clock is from ours. */
export function serverHour(now: number, clockOffset: number, tzOffsetMin: number): number {
  const local = new Date(now + clockOffset + tzOffsetMin * 60_000);
  return local.getUTCHours() + local.getUTCMinutes() / 60;
}

let cacheKey = '';
let cached = { r: 1, g: 1, b: 1 };

/** The tint to multiply onto the theme's light for a camera at (x, y). Recalculated once a minute (and when anything it reads changes). */
export function extraLight(world: World, x: number, y: number, season: Season, now: number, clockOffset: number, tzOffsetMin: number) {
  const theme = world.styleAt(Math.floor(x), Math.floor(y));
  const minute = Math.floor((now + clockOffset) / 60_000);
  const key = `${world.layout.seasonal === true}|${world.layout.daylight === true}|${theme}|${season}|${minute}|${tzOffsetMin}`;
  if (key === cacheKey) return cached;
  cacheKey = key;
  let r = 1, g = 1, b = 1;
  if (world.layout.seasonal === true) {
    const l = themeById(theme).seasons[season].light;
    r *= l.r; g *= l.g; b *= l.b;
  }
  if (world.layout.daylight === true) {
    const l = daylightAt(serverHour(now, clockOffset, tzOffsetMin));
    r *= l.r; g *= l.g; b *= l.b;
  }
  cached = { r, g, b };
  return cached;
}
