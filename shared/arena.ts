// Office Arena: every rule of the match as a pure function. No timers, no I/O, and no randomness except a seeded
// generator that the caller passes in. The server's MatchEngine (server/arena.ts) applies these rules and sends messages.
import { RUN_MULT, WALK_SPEED } from './movement';
import type { Phase, Team } from './protocol';
import type { World } from './world';

export type { Phase, Team };

export const MAX_PLAYERS = 10;
export const MIN_PLAYERS = 2;
export const WIN_TARGET = 5;
export const BUY_MS = 15_000;
export const PLAY_MS = 120_000;
export const ROUND_END_MS = 5_000;
export const HEALTH = 100;
export const ARMOUR = 50;
/** How wide a player is to a shot, in tiles. */
export const HIT_RADIUS = 0.3;
export const ECONOMY = { start: 1000, tag: 250, win: 2500, loss: 1200, cap: 8000 } as const;

export type GearId = 'stapler' | 'foam-repeater' | 'band-scatter' | 'paint-marker' | 'mail-tube' | 'cardboard-vest';

export interface GearDef {
  id: GearId;
  name: string;
  price: number;
  damage: number;
  pellets: number;
  /** Shots per minute. */
  rpm: number;
  /** Tiles. */
  range: number;
  /** Degrees of jitter, total width. */
  spread: number;
  /** Set only for armour: how much it gives. */
  armour?: number;
}

export const STARTER: GearId = 'stapler';

const blaster = (id: GearId, name: string, price: number, damage: number, pellets: number, rpm: number, range: number, spread: number): GearDef => ({
  id, name, price, damage, pellets, rpm, range, spread,
});

export const GEAR: Record<GearId, GearDef> = {
  stapler: blaster('stapler', 'Stapler Popper', 0, 18, 1, 240, 16, 3),
  'foam-repeater': blaster('foam-repeater', 'Foam Repeater', 1100, 12, 1, 600, 13, 6),
  'band-scatter': blaster('band-scatter', 'Rubber-Band Scatter', 1600, 9, 6, 70, 7, 14),
  'paint-marker': blaster('paint-marker', 'Paint Marker', 2400, 28, 1, 360, 24, 2.5),
  'mail-tube': blaster('mail-tube', 'Mailing-Tube Launcher', 3800, 95, 1, 45, 40, 0.5),
  'cardboard-vest': { id: 'cardboard-vest', name: 'Cardboard Vest', price: 600, damage: 0, pellets: 0, rpm: 0, range: 0, spread: 0, armour: ARMOUR },
};

export const isGearId = (id: string): id is GearId => Object.prototype.hasOwnProperty.call(GEAR, id);
export const isBlaster = (g: GearDef) => g.armour === undefined;

export interface Timings {
  buyMs: number;
  playMs: number;
  roundEndMs: number;
}
export const TIMINGS: Timings = { buyMs: BUY_MS, playMs: PLAY_MS, roundEndMs: ROUND_END_MS };

export interface ArenaPlayer {
  id: string;
  team: Team;
  alive: boolean;
  health: number;
  armour: number;
  money: number;
  gear: GearId;
  /** The kill count for the whole match. */
  tags: number;
  tagOuts: number;
  joinedAt: number;
  lastShotAt: number;
}

export interface MatchState {
  id: string;
  /** Player id. It passes to the earliest-joined player if the host leaves. */
  host: string;
  phase: Phase;
  /** Server ms; 0 in the lobby and at match end. */
  phaseEndsAt: number;
  /** 0 in the lobby, then 1, 2, … */
  round: number;
  wins: Record<Team, number>;
  /** In join order. */
  players: ArenaPlayer[];
  lastRoundWinner?: Team | 'draw';
}

export type MatchEvent =
  | { kind: 'roundStart'; round: number }
  | { kind: 'playStart' }
  | { kind: 'roundEnd'; winner: Team | 'draw' }
  | { kind: 'matchEnd'; winner: Team }
  | { kind: 'reset' }
  | { kind: 'refused'; reason: 'players' };

export const otherTeam = (t: Team): Team => (t === 'blue' ? 'orange' : 'blue');
const capMoney = (n: number) => Math.min(ECONOMY.cap, Math.max(0, n));

// ------------------------------------------------------------------ teams and players

/** Blue, orange, blue … in join order, so the sizes differ by at most one. */
export function assignTeams(ids: readonly string[]): Record<string, Team> {
  const out: Record<string, Team> = {};
  ids.forEach((id, i) => (out[id] = i % 2 === 0 ? 'blue' : 'orange'));
  return out;
}

/** The smaller team, blue on a tie. */
export function teamForNewcomer(match: Pick<MatchState, 'players'>): Team {
  const blue = match.players.filter((p) => p.team === 'blue').length;
  const orange = match.players.length - blue;
  return orange < blue ? 'orange' : 'blue';
}

export function newPlayer(id: string, team: Team, joinedAt: number): ArenaPlayer {
  return {
    id, team, alive: true, health: HEALTH, armour: 0, money: ECONOMY.start, gear: STARTER, tags: 0, tagOuts: 0, joinedAt, lastShotAt: 0,
  };
}

/** A match in the lobby with its host as the only player. */
export function createMatch(id: string, hostId: string, now: number): MatchState {
  return {
    id, host: hostId, phase: 'lobby', phaseEndsAt: 0, round: 0, wins: { blue: 0, orange: 0 }, players: [newPlayer(hostId, 'blue', now)],
  };
}

export const canJoin = (match: MatchState, id: string) => match.players.length < MAX_PLAYERS && !match.players.some((p) => p.id === id);

/**
 * Adds a player to the smaller team. Anyone who arrives after the lobby is not alive until the next round starts.
 * Returns the match unchanged when the player is already in it or it is full.
 */
export function addPlayer(match: MatchState, id: string, now: number): MatchState {
  if (!canJoin(match, id)) return match;
  const p = newPlayer(id, teamForNewcomer(match), now);
  if (match.phase !== 'lobby') p.alive = false;
  return { ...match, players: [...match.players, p] };
}

/** Removes a player. The host passes to the earliest-joined player left. Null when nobody is left. */
export function removePlayer(match: MatchState, id: string): MatchState | null {
  const players = match.players.filter((p) => p.id !== id);
  if (!players.length) return null;
  const host = match.host === id ? players.reduce((a, b) => (b.joinedAt < a.joinedAt ? b : a)).id : match.host;
  return { ...match, players, host };
}

export const alivePlayers = (match: Pick<MatchState, 'players'>, team?: Team) =>
  match.players.filter((p) => p.alive && (team === undefined || p.team === team));

// ------------------------------------------------------------------ hits and money

export const canHit = (shooter: ArenaPlayer, target: ArenaPlayer) =>
  shooter.id !== target.id && shooter.alive && target.alive && shooter.team !== target.team;

/** Armour takes half of the damage (as far as it lasts), health takes the rest. Tagging out counts a tag-out. */
export function applyHit(target: ArenaPlayer, damage: number): ArenaPlayer {
  if (!target.alive || damage <= 0) return target;
  const absorbed = Math.min(target.armour, Math.floor(damage / 2));
  const health = Math.max(0, target.health - (damage - absorbed));
  const out = { ...target, armour: target.armour - absorbed, health };
  if (health === 0) {
    out.alive = false;
    out.tagOuts += 1;
  }
  return out;
}

/** The shooter's reward for a tag. */
export const rewardTag = (shooter: ArenaPlayer): ArenaPlayer => ({
  ...shooter, tags: shooter.tags + 1, money: capMoney(shooter.money + ECONOMY.tag),
});

/** Round-end money: winners get the win bonus, everyone else the loss one (a draw gives everyone the loss one). */
export const rewardRound = (p: ArenaPlayer, winner: Team | 'draw'): ArenaPlayer => ({
  ...p, money: capMoney(p.money + (winner === p.team ? ECONOMY.win : ECONOMY.loss)),
});

export type BuyResult = { ok: true; player: ArenaPlayer } | { ok: false; reason: 'phase' | 'dead' | 'unknown' | 'money' | 'owned' };

export function buy(player: ArenaPlayer, item: string, phase: Phase): BuyResult {
  if (phase !== 'buy') return { ok: false, reason: 'phase' };
  if (!player.alive) return { ok: false, reason: 'dead' };
  if (!isGearId(item)) return { ok: false, reason: 'unknown' };
  const def = GEAR[item];
  if (def.armour !== undefined ? player.armour >= def.armour : player.gear === def.id) return { ok: false, reason: 'owned' };
  if (player.money < def.price) return { ok: false, reason: 'money' };
  const money = player.money - def.price;
  return { ok: true, player: def.armour !== undefined ? { ...player, money, armour: def.armour } : { ...player, money, gear: def.id } };
}

// ------------------------------------------------------------------ phases

function startRound(m: MatchState, round: number, now: number, t: Timings): MatchState {
  return {
    ...m,
    phase: 'buy',
    phaseEndsAt: now + t.buyMs,
    round,
    players: m.players.map((p) => ({
      ...p,
      alive: true,
      health: HEALTH,
      // The tagged-out start again with the starter gear and no armour; survivors keep theirs.
      ...(p.alive ? {} : { gear: STARTER, armour: 0 }),
    })),
  };
}

function endRound(m: MatchState, winner: Team | 'draw', now: number, t: Timings): MatchState {
  return {
    ...m,
    phase: 'roundEnd',
    phaseEndsAt: now + t.roundEndMs,
    wins: winner === 'draw' ? m.wins : { ...m.wins, [winner]: m.wins[winner] + 1 },
    lastRoundWinner: winner,
    players: m.players.map((p) => rewardRound(p, winner)),
  };
}

/**
 * Moves the match on: a `begin` or `reset` from the host, or time passing. Returns the next state and what happened,
 * so the server can teleport players, send the scoreboard and so on.
 */
export function stepMatch(
  match: MatchState,
  now: number,
  input: { op?: 'begin' | 'reset' } = {},
  timings: Timings = TIMINGS,
): { match: MatchState; events: MatchEvent[] } {
  const events: MatchEvent[] = [];
  let m = match;

  if (input.op === 'reset' && m.phase !== 'lobby') {
    m = {
      ...m,
      wins: { blue: 0, orange: 0 },
      lastRoundWinner: undefined,
      players: m.players.map((p) => ({ ...newPlayer(p.id, p.team, p.joinedAt) })),
    };
    events.push({ kind: 'reset' }, { kind: 'roundStart', round: 1 });
    return { match: startRound(m, 1, now, timings), events };
  }

  if (input.op === 'begin' && m.phase === 'lobby') {
    if (m.players.length < MIN_PLAYERS) return { match, events: [{ kind: 'refused', reason: 'players' }] };
    const teams = assignTeams(m.players.map((p) => p.id));
    m = { ...m, players: m.players.map((p) => ({ ...p, team: teams[p.id], alive: true })) };
    events.push({ kind: 'roundStart', round: 1 });
    return { match: startRound(m, 1, now, timings), events };
  }

  if (m.phase === 'buy' && now >= m.phaseEndsAt) {
    m = { ...m, phase: 'play', phaseEndsAt: now + timings.playMs };
    events.push({ kind: 'playStart' });
  } else if (m.phase === 'play') {
    const blue = alivePlayers(m, 'blue').length;
    const orange = alivePlayers(m, 'orange').length;
    let winner: Team | 'draw' | null = null;
    if (blue === 0 || orange === 0) winner = blue === orange ? 'draw' : blue === 0 ? 'orange' : 'blue';
    else if (now >= m.phaseEndsAt) winner = blue === orange ? 'draw' : blue > orange ? 'blue' : 'orange';
    if (winner) {
      m = endRound(m, winner, now, timings);
      events.push({ kind: 'roundEnd', winner });
    }
  } else if (m.phase === 'roundEnd' && now >= m.phaseEndsAt) {
    const champion = (['blue', 'orange'] as const).find((t) => m.wins[t] >= WIN_TARGET);
    if (champion) {
      m = { ...m, phase: 'matchEnd', phaseEndsAt: 0 };
      events.push({ kind: 'matchEnd', winner: champion });
    } else {
      m = startRound(m, m.round + 1, now, timings);
      events.push({ kind: 'roundStart', round: m.round });
    }
  }
  return { match: m, events };
}

// ------------------------------------------------------------------ shots

/** A small seeded generator (mulberry32), so spread is reproducible in tests. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Ray {
  /** Where the tracer ends: the hit, the wall, or the end of range. */
  x1: number;
  y1: number;
  hit?: string;
}

const solidAt = (world: World, tx: number, ty: number) =>
  tx < 0 || ty < 0 || tx >= world.w || ty >= world.h || world.block[ty * world.w + tx] === 1;

/** Distance along a unit ray from (x, y) to the first solid tile, or `max` when none lies in the way. Tile DDA. */
function wallDistance(world: World, x: number, y: number, dx: number, dy: number, max: number): number {
  let tx = Math.floor(x), ty = Math.floor(y);
  const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1;
  const tDeltaX = dx === 0 ? Infinity : Math.abs(1 / dx);
  const tDeltaY = dy === 0 ? Infinity : Math.abs(1 / dy);
  let tMaxX = dx === 0 ? Infinity : (dx > 0 ? tx + 1 - x : x - tx) * tDeltaX;
  let tMaxY = dy === 0 ? Infinity : (dy > 0 ? ty + 1 - y : y - ty) * tDeltaY;
  for (let guard = Math.ceil(max) * 2 + 4; guard-- > 0; ) {
    let t: number;
    if (tMaxX < tMaxY) {
      t = tMaxX;
      tx += stepX;
      tMaxX += tDeltaX;
    } else {
      t = tMaxY;
      ty += stepY;
      tMaxY += tDeltaY;
    }
    if (t >= max) return max;
    if (solidAt(world, tx, ty)) return t;
  }
  return max;
}

/**
 * Fires `gear` from `shooter` along `angle` (0 = east, y grows downward). Each pellet is a ray with seeded spread. It is stopped by
 * walls and solid furniture and by the range, and hits the nearest target whose circle (radius HIT_RADIUS) it crosses.
 * Pass only the opponents who can be hit: the caller decides who is a target.
 */
export function castShot(
  world: World,
  shooter: { x: number; y: number },
  targets: readonly { id: string; x: number; y: number }[],
  angle: number,
  gear: GearDef,
  rng: () => number,
): Ray[] {
  const rays: Ray[] = [];
  const spread = (gear.spread * Math.PI) / 180;
  for (let i = 0; i < Math.max(1, gear.pellets); i++) {
    const a = angle + (rng() - 0.5) * spread;
    const dx = Math.cos(a), dy = Math.sin(a);
    const reach = wallDistance(world, shooter.x, shooter.y, dx, dy, gear.range);
    let hit: { id: string; t: number } | null = null;
    for (const tg of targets) {
      const rx = tg.x - shooter.x, ry = tg.y - shooter.y;
      const along = rx * dx + ry * dy;
      if (along < 0) continue;
      const off = Math.abs(rx * dy - ry * dx);
      if (off > HIT_RADIUS + 1e-9) continue;
      const t = Math.max(0, along - Math.sqrt(Math.max(0, HIT_RADIUS * HIT_RADIUS - off * off)));
      if (t <= reach && (!hit || t < hit.t)) hit = { id: tg.id, t };
    }
    const t = hit ? hit.t : reach;
    rays.push({ x1: shooter.x + dx * t, y1: shooter.y + dy * t, ...(hit ? { hit: hit.id } : {}) });
  }
  return rays;
}

// ------------------------------------------------------------------ spawns and movement

/**
 * Where the two teams start: five tiles each, around the two open-floor tiles that are farthest apart. Open floor is walkable, outside
 * meeting rooms, restricted or limited areas, and outside every desk space, so a match never starts inside someone's room or desk.
 * Null when the office has fewer than ten such tiles.
 */
export function arenaSpawns(world: World): Record<Team, { x: number; y: number }[]> | null {
  const desk = new Set<number>();
  for (const d of world.desks) for (const t of d.tiles) desk.add(t.y * world.w + t.x);
  const open: { x: number; y: number }[] = [];
  for (let y = 0; y < world.h; y++) {
    for (let x = 0; x < world.w; x++) {
      if (world.block[y * world.w + x] === 1 || desk.has(y * world.w + x)) continue;
      const area = world.areas.find((a) => a.rects.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1));
      if (area && (area.private || area.restricted || area.capacity !== undefined)) continue;
      open.push({ x, y });
    }
  }
  if (open.length < 2 * 5) return null;

  // The farthest pair, looking only at a coarse grid of tiles so it stays quick on big offices.
  const coarse = open.filter((t) => t.x % 2 === 0 && t.y % 2 === 0);
  const pool = coarse.length >= 2 ? coarse : open;
  let best = { a: pool[0], b: pool[1], d: -1 };
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const d = Math.hypot(pool[i].x - pool[j].x, pool[i].y - pool[j].y);
      if (d > best.d) best = { a: pool[i], b: pool[j], d };
    }
  }
  const taken = new Set<number>();
  const around = (anchor: { x: number; y: number }) => {
    const picked = open
      .filter((t) => !taken.has(t.y * world.w + t.x))
      .sort((p, q) => Math.hypot(p.x - anchor.x, p.y - anchor.y) - Math.hypot(q.x - anchor.x, q.y - anchor.y) || p.y - q.y || p.x - q.x)
      .slice(0, 5);
    picked.forEach((t) => taken.add(t.y * world.w + t.x));
    return picked.map((t) => ({ x: t.x + 0.5, y: t.y + 0.5 }));
  };
  return { blue: around(best.a), orange: around(best.b) };
}

/**
 * The speed check for match players: whether a move of `from` to `to`, `dtMs` after the last accepted one, is no faster than
 * running (with slack). A long pause counts as at most a second, so waiting never buys a teleport.
 */
export function moveAllowed(from: { x: number; y: number }, to: { x: number; y: number }, dtMs: number): boolean {
  const dt = Math.min(1000, Math.max(0, dtMs)) / 1000;
  return Math.hypot(to.x - from.x, to.y - from.y) <= WALK_SPEED * RUN_MULT * dt * 1.5 + 0.3;
}
