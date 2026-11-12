import { describe, expect, it } from 'vitest';
import { DESKS, SPAWN, areaAt, isBlocking } from '../../shared/map';
import {
  HAPPY_MS, IDLE_AFTER_MS, NAME_MAX, NEGLECT_MS, Trail, actionFits, careCheck, cleanPetName, dayKey, daysToNext, droopy, isCareAction,
  isPetColor, isPetKind, isPlantKind, moodOf, nextSpot, petCornerSpot, petPose, petRestSpot, plantSpots, stageOf, water,
} from '../../shared/pets';

// Row 19 of the lobby (x 14-25) is open floor; Meeting Room A is a private area around (2.5, 2.5).
const Y = 19.5;
const ROOM = { x: 2.5, y: 2.5 };
const H = 3_600_000;

describe('pets: names and choices', () => {
  it('cleans names like people names', () => {
    expect(cleanPetName('  Miso  ', 'Cat')).toBe('Miso');
    expect(cleanPetName('Mi\u0000so​', 'Cat')).toBe('Miso');
    expect(cleanPetName('Big    Fluffy\n\tCat', 'Cat')).toBe('Big Fluffy Cat');
    expect(cleanPetName('x'.repeat(40), 'Cat')).toHaveLength(NAME_MAX);
    expect(cleanPetName('   ', 'Cat')).toBe('Cat');
    expect(cleanPetName(undefined, 'Tulip')).toBe('Tulip');
    expect(cleanPetName(42, 'Cat')).toBe('42');
  });

  it('accepts only the listed kinds, colors and actions', () => {
    expect(['cat', 'dog', 'rabbit', 'bird'].every(isPetKind)).toBe(true);
    expect(isPetKind('dragon')).toBe(false);
    expect(isPetKind('toString')).toBe(false);
    expect(['sunflower', 'tulip', 'cactus', 'fern'].every(isPlantKind)).toBe(true);
    expect(isPlantKind('rose')).toBe(false);
    expect([0, 1, 2].every(isPetColor)).toBe(true);
    expect(isPetColor(3)).toBe(false);
    expect(isPetColor('1')).toBe(false);
    expect(['pet', 'feed', 'play', 'water'].every(isCareAction)).toBe(true);
    expect(isCareAction('kick')).toBe(false);
  });

  it('matches actions to what they are for', () => {
    expect(actionFits('water', 'plant')).toBe(true);
    expect(actionFits('feed', 'plant')).toBe(false);
    for (const a of ['pet', 'feed', 'play'] as const) expect(actionFits(a, 'pet')).toBe(true);
    expect(actionFits('water', 'pet')).toBe(false);
  });
});

describe('pets: who can care', () => {
  it('needs the carer close enough', () => {
    expect(careCheck({ x: 15.5, y: Y }, { x: 16.5, y: Y }, 1.5)).toBe('ok');
    expect(careCheck({ x: 15.5, y: Y }, { x: 17.1, y: Y }, 1.5)).toBe('too-far');
  });

  it('never reaches through a private room wall', () => {
    expect(areaAt(ROOM.x, ROOM.y)?.private).toBe(true);
    // Find a walkable tile just outside the room, as near as possible.
    const room = areaAt(ROOM.x, ROOM.y)!;
    const [x0, y0, x1, y1] = room.rects[0];
    let outside: { x: number; y: number } | undefined;
    for (let x = x1 + 1; x <= x1 + 3 && !outside; x++) {
      for (let y = y0; y <= y1; y++) if (!isBlocking(x, y) && !areaAt(x + 0.5, y + 0.5)?.private) outside = { x: x + 0.5, y: y + 0.5 };
    }
    expect(outside).toBeDefined();
    const inside = { x: x1 + 0.5, y: outside!.y };
    expect(careCheck(outside!, inside, 99)).toBe('walls');
    expect(careCheck(inside, outside!, 99)).toBe('walls');
    expect(careCheck({ x: x0 + 0.5, y: y0 + 0.5 }, { x: x0 + 1.5, y: y0 + 0.5 }, 1.5)).toBe('ok');
  });
});

describe('pets: mood', () => {
  it('is happy, then content, then sleepy, and any care makes it happy', () => {
    const now = 100 * H;
    expect(moodOf(now - 1 * H, now)).toBe('happy');
    expect(moodOf(now - 3 * H, now)).toBe('content');
    expect(moodOf(now - 25 * H, now)).toBe('sleepy');
    expect(moodOf(now - 1000 * H, now)).toBe('sleepy'); // never lower
    expect(moodOf(now, now)).toBe('happy');
    expect(moodOf(now - HAPPY_MS, now)).toBe('content');
    expect(moodOf(now - NEGLECT_MS, now)).toBe('sleepy');
  });
});

describe('pets: following', () => {
  it('keeps a trail of real moves and starts again after a jump', () => {
    const t = new Trail();
    t.push(15, Y, 0);
    t.push(15.05, Y, 10);
    expect(t.points).toHaveLength(1);
    for (let i = 1; i <= 40; i++) t.push(15 + i * 0.2, Y, i * 10);
    expect(t.points).toHaveLength(32);
    expect(t.movedAt).toBe(400);
    t.push(15 + 8 + 3.5, Y, 500);
    expect(t.points).toHaveLength(1);
  });

  it('walks a little behind its owner along their path', () => {
    const t = new Trail();
    for (let x = 14.5; x <= 20.5; x += 0.25) t.push(x, Y, 1000);
    const pose = petPose({ petId: 'a', now: 1000, follow: { trail: t, x: 20.5, y: Y }, rest: { x: 0, y: 0 } });
    expect(pose.x).toBeCloseTo(20.5 - 1.2, 5);
    expect(pose.y).toBeCloseTo(Y, 5);
    expect(pose.pose).toBe('walk');
  });

  it('idles the same way for everyone once its owner stands still, never on a wall', () => {
    const t = new Trail();
    for (let x = 14.5; x <= 20.5; x += 0.25) t.push(x, Y, 1000);
    const input = (now: number) => ({ petId: 'pet-1', now, follow: { trail: t, x: 20.5, y: Y }, rest: { x: 0, y: 0 } });
    const poses = new Set<string>();
    for (let now = 1000 + IDLE_AFTER_MS; now < 1000 + IDLE_AFTER_MS + 120_000; now += 250) {
      const a = petPose(input(now));
      expect(petPose(input(now))).toEqual(a); // deterministic
      expect(isBlocking(Math.floor(a.x), Math.floor(a.y))).toBe(false);
      expect(Math.hypot(a.x - 19.3, a.y - Y)).toBeLessThanOrEqual(1.2);
      poses.add(a.pose);
    }
    expect(poses.has('sit') || poses.has('look')).toBe(true);
  });

  it('rests near its rest spot', () => {
    const rest = { x: 16.5, y: Y };
    for (let now = 0; now < 60_000; now += 500) {
      const p = petPose({ petId: 'r', now, rest });
      expect(Math.hypot(p.x - rest.x, p.y - rest.y)).toBeLessThanOrEqual(1.2);
    }
  });

  it('has distinct walkable corner spots near the spawn', () => {
    const spots = [0, 1, 2, 3, 4].map(petCornerSpot);
    expect(new Set(spots.map((s) => `${s.x},${s.y}`)).size).toBe(5);
    for (const s of spots) {
      expect(isBlocking(Math.floor(s.x), Math.floor(s.y))).toBe(false);
      expect(Math.hypot(s.x - SPAWN.x, s.y - SPAWN.y)).toBeLessThan(6);
      // Never right where newcomers appear.
      expect(Math.max(Math.abs(Math.floor(s.x) - Math.floor(SPAWN.x)), Math.abs(Math.floor(s.y) - Math.floor(SPAWN.y)))).toBeGreaterThanOrEqual(2);
    }
  });

  it('rests at its owner desk when they have one', () => {
    const desk = DESKS[0];
    const spot = petRestSpot(desk.id, 0);
    expect(desk.tiles.some((t) => t.x === Math.floor(spot.x) && t.y === Math.floor(spot.y))).toBe(true);
    expect(petRestSpot(undefined, 2)).toEqual(petCornerSpot(2));
  });
});

describe('plants: growth', () => {
  it('reaches Sprout, Bud and Bloom after 1, 3 and 5 watering days', () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(stageOf)).toEqual([0, 1, 1, 2, 2, 3, 3]);
    expect([0, 1, 2, 3, 4, 5].map(daysToNext)).toEqual([1, 2, 1, 2, 1, 0]);
  });

  it('counts office days in the office time zone', () => {
    const t = Date.UTC(2026, 10, 10, 23, 30);
    expect(dayKey(t, 0)).toBe('2026-11-10');
    expect(dayKey(t, 60)).toBe('2026-11-11');
    expect(dayKey(Date.UTC(2026, 10, 11, 2, 0), -300)).toBe('2026-11-10');
  });

  it('grows once per day however often it is watered, and gaps do not matter', () => {
    const plant = { wateredDays: 0, lastWateredAt: 0 } as { wateredDays: number; lastWaterDay?: string; lastWateredAt: number };
    const day = (d: number, h = 10) => Date.UTC(2026, 10, d, h);
    expect(water(plant, day(1), 0)).toBe(true);
    expect(water(plant, day(1, 15), 0)).toBe(false);
    expect(plant.wateredDays).toBe(1);
    for (const d of [2, 3, 7, 20]) water(plant, day(d), 0);
    expect(plant.wateredDays).toBe(5);
    expect(stageOf(plant.wateredDays)).toBe(3);
    water(plant, day(21), 0);
    expect(plant.wateredDays).toBe(6);
    expect(stageOf(plant.wateredDays)).toBe(3); // a Bloom stays a Bloom
  });

  it('droops after a day without water and stands up when watered', () => {
    const at = 1000 * H;
    expect(droopy(at, at + 23 * H)).toBe(false);
    expect(droopy(at, at + 24 * H)).toBe(true);
    const plant = { wateredDays: 0, lastWateredAt: at };
    water(plant, at + 30 * H, 0);
    expect(droopy(plant.lastWateredAt, at + 30 * H + 1)).toBe(false);
  });
});

describe('plants: spots', () => {
  it('uses walkable desk-space tiles, not the chair, in reading order', () => {
    const desk = DESKS[0];
    const spots = plantSpots(desk.id);
    expect(spots.length).toBeGreaterThan(0);
    for (const s of spots) {
      expect(isBlocking(s.x, s.y)).toBe(false);
      expect(s.x === desk.seat.x && s.y === desk.seat.y).toBe(false);
      expect(desk.tiles.some((t) => t.x === s.x && t.y === s.y)).toBe(true);
    }
    const order = spots.map((s) => s.y * 1000 + s.x);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(plantSpots('no-such-desk')).toEqual([]);
  });

  it('steps to the next free spot, wrapping, and runs out', () => {
    const spots = [{ deskId: 'd', x: 1, y: 1 }, { deskId: 'd', x: 2, y: 1 }, { deskId: 'd', x: 3, y: 1 }];
    expect(nextSpot(spots, new Set())).toEqual(spots[0]);
    expect(nextSpot(spots, new Set(['1,1']))).toEqual(spots[1]);
    expect(nextSpot(spots, new Set(['1,1']), spots[2])).toEqual(spots[1]); // wraps past the taken first spot
    expect(nextSpot(spots, new Set(['2,1']), spots[0])).toEqual(spots[2]);
    expect(nextSpot(spots, new Set(['1,1', '2,1', '3,1']))).toBeUndefined();
    expect(nextSpot(spots, new Set(['2,1', '3,1']), spots[0])).toBeUndefined();
  });
});
