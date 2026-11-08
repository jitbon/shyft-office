// Which season it is, and how bright the office should be at a time of day. Pure, so the server, the browser and the tests agree.
import { seasonOf as northSeason } from './wardrobe';

export type Season = 'winter' | 'spring' | 'summer' | 'autumn';
export type Hemisphere = 'north' | 'south';

const FLIP: Record<Season, Season> = { winter: 'summer', summer: 'winter', spring: 'autumn', autumn: 'spring' };

/** The season on `date` (by its local month). */
export function seasonOf(date: Date, hemisphere: Hemisphere = 'north'): Season {
  const s = northSeason(date);
  return hemisphere === 'south' ? FLIP[s] : s;
}
