import { describe, expect, it } from 'vitest';
import {
  BUY_MS, ECONOMY, GEAR, MIN_PLAYERS, PLAY_MS, ROUND_END_MS, WIN_TARGET, addPlayer, applyHit, assignTeams, buy, canHit,
  createMatch, isBlaster, newPlayer, removePlayer, rewardRound, rewardTag, stepMatch, teamForNewcomer, type MatchState,
} from '../../shared/arena';

const lobby = (n: number): MatchState => {
  let m = createMatch('m', 'p0', 0);
  for (let i = 1; i < n; i++) m = addPlayer(m, `p${i}`, i);
  return m;
};
const begun = (n = 4, t = 0): MatchState => stepMatch(lobby(n), t, { op: 'begin' }).match;
const inPlay = (n = 4): MatchState => stepMatch(begun(n), BUY_MS).match;
/** Tags out everyone on a team. */
const wipe = (m: MatchState, team: 'blue' | 'orange'): MatchState => ({
  ...m, players: m.players.map((p) => (p.team === team ? applyHit(p, 1000) : p)),
});

describe('teams', () => {
  it('alternates in join order so sizes differ by at most one', () => {
    const t = assignTeams(['a', 'b', 'c', 'd', 'e']);
    expect(t).toEqual({ a: 'blue', b: 'orange', c: 'blue', d: 'orange', e: 'blue' });
  });
  it('puts a newcomer on the smaller team, blue on a tie', () => {
    expect(teamForNewcomer({ players: [] })).toBe('blue');
    expect(teamForNewcomer(lobby(1))).toBe('orange');
    expect(teamForNewcomer(lobby(2))).toBe('blue');
    expect(teamForNewcomer(lobby(3))).toBe('orange');
  });
  it('does not add the same player twice or an eleventh player', () => {
    expect(addPlayer(lobby(2), 'p1', 5).players).toHaveLength(2);
    expect(addPlayer(lobby(10), 'late', 5).players).toHaveLength(10);
  });
  it('hands the host to the earliest-joined player', () => {
    const m = removePlayer(lobby(3), 'p0')!;
    expect(m.host).toBe('p1');
    expect(removePlayer(removePlayer(lobby(1), 'zz')!, 'p0')).toBeNull();
  });
});

describe('phases', () => {
  it('begins with at least the minimum of players, and refuses with one', () => {
    expect(MIN_PLAYERS).toBe(2);
    const refused = stepMatch(lobby(1), 0, { op: 'begin' });
    expect(refused.match.phase).toBe('lobby');
    expect(refused.events).toEqual([{ kind: 'refused', reason: 'players' }]);
    const m = begun(2, 1000);
    expect(m.phase).toBe('buy');
    expect(m.round).toBe(1);
    expect(m.phaseEndsAt).toBe(1000 + BUY_MS);
    expect(m.players.map((p) => p.team)).toEqual(['blue', 'orange']);
  });

  it('goes buy → play at the end of the buy phase', () => {
    const m = begun();
    expect(stepMatch(m, BUY_MS - 1).match.phase).toBe('buy');
    const r = stepMatch(m, BUY_MS);
    expect(r.match.phase).toBe('play');
    expect(r.match.phaseEndsAt).toBe(BUY_MS + PLAY_MS);
  });

  it('ends the round when a team has no one alive, and the other team wins it', () => {
    const r = stepMatch(wipe(inPlay(), 'orange'), BUY_MS + 1000);
    expect(r.match.phase).toBe('roundEnd');
    expect(r.match.wins).toEqual({ blue: 1, orange: 0 });
    expect(r.events).toEqual([{ kind: 'roundEnd', winner: 'blue' }]);
  });

  it('decides a time-out by who is alive, and calls an equal count a draw', () => {
    const m = inPlay(4);
    const end = BUY_MS + PLAY_MS;
    expect(stepMatch(m, end - 1).match.phase).toBe('play');
    const draw = stepMatch(m, end).match;
    expect(draw.phase).toBe('roundEnd');
    expect(draw.lastRoundWinner).toBe('draw');
    expect(draw.wins).toEqual({ blue: 0, orange: 0 });
    const one = { ...m, players: m.players.map((p, i) => (i === 1 ? applyHit(p, 1000) : p)) }; // an orange out
    expect(stepMatch(one, end).match.wins).toEqual({ blue: 1, orange: 0 });
  });

  it('starts the next round after the round-end pause, with everyone alive and the tagged-out reset', () => {
    let m = inPlay(4);
    m = { ...m, players: m.players.map((p, i) => ({ ...p, gear: 'paint-marker', armour: 50, ...(i === 1 ? applyHit({ ...p, armour: 0 }, 1000) : {}) })) };
    const t = BUY_MS + 1000;
    m = stepMatch(wipe(m, 'orange'), t).match;
    expect(stepMatch(m, t + ROUND_END_MS - 1).match.phase).toBe('roundEnd');
    const next = stepMatch(m, t + ROUND_END_MS).match;
    expect(next.phase).toBe('buy');
    expect(next.round).toBe(2);
    expect(next.players.every((p) => p.alive && p.health === 100)).toBe(true);
    const [blue0, orange] = [next.players[0], next.players[1]];
    expect(blue0.gear).toBe('paint-marker'); // a survivor keeps the blaster
    expect(orange.gear).toBe('stapler');
    expect(orange.armour).toBe(0);
  });

  it('ends the match when a team reaches the win target', () => {
    let m = inPlay();
    m = { ...wipe(m, 'orange'), wins: { blue: WIN_TARGET - 1, orange: 0 } };
    const over = stepMatch(m, BUY_MS + 1).match;
    expect(over.wins.blue).toBe(WIN_TARGET);
    const r = stepMatch(over, BUY_MS + 1 + ROUND_END_MS);
    expect(r.match.phase).toBe('matchEnd');
    expect(r.events).toEqual([{ kind: 'matchEnd', winner: 'blue' }]);
  });

  it('resets to round one with money, tags and gear back', () => {
    let m = inPlay();
    m = { ...m, wins: { blue: 3, orange: 2 }, players: m.players.map((p) => ({ ...p, tags: 4, tagOuts: 2, money: 7000, gear: 'mail-tube' as const })) };
    const r = stepMatch(m, 500_000, { op: 'reset' }).match;
    expect(r.phase).toBe('buy');
    expect(r.round).toBe(1);
    expect(r.wins).toEqual({ blue: 0, orange: 0 });
    for (const p of r.players) expect(p).toMatchObject({ tags: 0, tagOuts: 0, money: ECONOMY.start, gear: 'stapler', alive: true });
  });

  it('ends a round when a leave empties a team during play', () => {
    let m = inPlay(2);
    m = removePlayer(m, 'p1')!;
    expect(stepMatch(m, BUY_MS + 10).match.wins).toEqual({ blue: 1, orange: 0 });
  });

  it('keeps a mid-round joiner out until the next round starts', () => {
    const m = addPlayer(inPlay(4), 'late', 99);
    const late = m.players.find((p) => p.id === 'late')!;
    expect(late.alive).toBe(false);
    const ended = stepMatch(wipe(m, 'orange'), BUY_MS + 1).match;
    const next = stepMatch(ended, BUY_MS + 1 + ROUND_END_MS).match;
    expect(next.players.find((p) => p.id === 'late')).toMatchObject({ alive: true, health: 100 });
  });
});

describe('damage and money', () => {
  const a = newPlayer('a', 'blue', 0), b = newPlayer('b', 'orange', 0);

  it('lets armour take half of each hit as far as it lasts', () => {
    expect(applyHit({ ...b, armour: 50 }, 20)).toMatchObject({ armour: 40, health: 90 });
    expect(applyHit({ ...b, armour: 4 }, 20)).toMatchObject({ armour: 0, health: 84 });
    expect(applyHit(b, 20)).toMatchObject({ armour: 0, health: 80 });
  });
  it('floors health at zero and tags the player out', () => {
    expect(applyHit({ ...b, health: 10 }, 95)).toMatchObject({ health: 0, alive: false, tagOuts: 1 });
  });
  it('allows no friendly fire and no shots from or at the tagged-out', () => {
    expect(canHit(a, b)).toBe(true);
    expect(canHit(a, { ...b, team: 'blue', id: 'c' })).toBe(false);
    expect(canHit(a, { ...b, alive: false })).toBe(false);
    expect(canHit({ ...a, alive: false }, b)).toBe(false);
    expect(canHit(a, a)).toBe(false);
  });
  it('rewards tags, wins, losses and draws, up to the cap', () => {
    expect(rewardTag(a)).toMatchObject({ tags: 1, money: 1250 });
    expect(rewardRound(a, 'blue').money).toBe(1000 + ECONOMY.win);
    expect(rewardRound(a, 'orange').money).toBe(1000 + ECONOMY.loss);
    expect(rewardRound(a, 'draw').money).toBe(1000 + ECONOMY.loss);
    expect(rewardRound({ ...a, money: 7900 }, 'blue').money).toBe(ECONOMY.cap);
    expect(rewardTag({ ...a, money: 8000 }).money).toBe(ECONOMY.cap);
  });
});

describe('buying', () => {
  const rich = { ...newPlayer('a', 'blue', 0), money: 5000 };
  it('replaces the blaster and charges the price', () => {
    const r = buy(rich, 'paint-marker', 'buy');
    expect(r.ok && r.player).toMatchObject({ gear: 'paint-marker', money: 2600 });
  });
  it('sets armour with the vest', () => {
    const r = buy(rich, 'cardboard-vest', 'buy');
    expect(r.ok && r.player).toMatchObject({ armour: 50, money: 4400 });
  });
  it('refuses outside the buy phase, when tagged out, for unknown items and without the money', () => {
    expect(buy(rich, 'paint-marker', 'play')).toEqual({ ok: false, reason: 'phase' });
    expect(buy({ ...rich, alive: false }, 'paint-marker', 'buy')).toEqual({ ok: false, reason: 'dead' });
    expect(buy(rich, 'rocket', 'buy')).toEqual({ ok: false, reason: 'unknown' });
    expect(buy(newPlayer('a', 'blue', 0), 'paint-marker', 'buy')).toEqual({ ok: false, reason: 'money' });
  });
  it('does not charge twice for what the player already has', () => {
    expect(buy({ ...rich, gear: 'paint-marker' }, 'paint-marker', 'buy')).toEqual({ ok: false, reason: 'owned' });
    expect(buy({ ...rich, armour: 50 }, 'cardboard-vest', 'buy')).toEqual({ ok: false, reason: 'owned' });
  });
});

describe('gear', () => {
  it('has the shop list with the agreed prices', () => {
    expect(Object.values(GEAR).map((g) => [g.id, g.price])).toEqual([
      ['stapler', 0], ['foam-repeater', 1100], ['band-scatter', 1600], ['paint-marker', 2400], ['mail-tube', 3800], ['cardboard-vest', 600],
    ]);
    expect(GEAR['band-scatter'].pellets).toBe(6);
  });
  it('has at least five blasters that differ in damage, rate, range and spread', () => {
    const blasters = Object.values(GEAR).filter(isBlaster);
    expect(blasters.length).toBeGreaterThanOrEqual(5);
    expect(new Set(blasters.map((g) => [g.damage, g.rpm, g.range, g.spread].join())).size).toBe(blasters.length);
  });
});
