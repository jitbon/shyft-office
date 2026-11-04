import {
  GEAR, TIMINGS, addPlayer, alivePlayers, applyHit, arenaSpawns, buy, canHit, canJoin, castShot, createMatch, makeRng, removePlayer,
  rewardTag, stepMatch, type ArenaPlayer, type MatchEvent, type MatchState, type Timings,
} from '../shared/arena';
import type { ServerMsg, Team, ViewMode } from '../shared/protocol';
import type { World } from '../shared/world';

export interface ArenaPose {
  x: number;
  y: number;
  a: number;
  mode: ViewMode;
}

/** What the engine needs from the rest of the server. */
export interface ArenaDeps {
  /** Where a connected player is now, or null once they are gone. */
  pose(id: string): ArenaPose | null;
  send(id: string, msg: ServerMsg): void;
  broadcast(msg: ServerMsg): void;
  /** Moves a player: sets their server position, restarts their speed check from there, and tells them and everyone else. */
  teleport(id: string, x: number, y: number, a: number, back?: boolean): void;
  world(): World;
  /** Fixed team spawns, instead of ones worked out from the office. For tests. */
  spawns?: Record<Team, { x: number; y: number }[]>;
  enabled(): boolean;
  /** Called after the set of players changed, so voice groups are recomputed. */
  changed(): void;
  now?: () => number;
  timings?: Timings;
  seed?: number;
}

/** The slack on the fire rate: a shot may come this fraction early. */
const RATE_SLACK = 0.9;
const HOST_ONLY = 'Only the host can do that';

/**
 * The one match the office can have. It holds the state and applies the pure rules in shared/arena.ts; browsers only send
 * intents. Methods that can be refused return the reason to show, or null when they worked.
 */
export class MatchEngine {
  private match: MatchState | null = null;
  /** Where each player stood before joining, so leaving puts them back. */
  private returnTo = new Map<string, ArenaPose>();
  private rng: () => number;
  private timings: Timings;
  private now: () => number;

  constructor(private deps: ArenaDeps) {
    this.now = deps.now ?? Date.now;
    this.timings = deps.timings ?? TIMINGS;
    this.rng = makeRng(deps.seed ?? Math.floor(Math.random() * 2 ** 32));
  }

  // ------------------------------------------------------------------ questions

  isPlayer(id: string): boolean {
    return !!this.match?.players.some((p) => p.id === id);
  }

  players(): ReadonlySet<string> {
    return new Set(this.match?.players.map((p) => p.id));
  }

  /** Whether a player's moves are refused right now: in the buy phase, and while tagged out. */
  frozen(id: string): boolean {
    const m = this.match;
    const p = m?.players.find((q) => q.id === id);
    return !!m && !!p && m.phase !== 'lobby' && (m.phase === 'buy' || !p.alive);
  }

  /** The public summary, with no money, health or gear. */
  summary(): Extract<ServerMsg, { t: 'arena' }> {
    const m = this.match;
    if (!m) return { t: 'arena', match: null };
    return {
      t: 'arena',
      match: {
        phase: m.phase,
        round: m.round,
        wins: m.wins,
        endsIn: m.phaseEndsAt ? Math.max(0, m.phaseEndsAt - this.now()) : 0,
        host: m.host,
        teams: Object.fromEntries(m.players.map((p) => [p.id, p.team])),
        alive: alivePlayers(m).map((p) => p.id),
        ...(m.lastRoundWinner && (m.phase === 'roundEnd' || m.phase === 'matchEnd') ? { lastWinner: m.lastRoundWinner } : {}),
      },
    };
  }

  // ------------------------------------------------------------------ joining and leaving

  start(id: string): string | null {
    if (!this.deps.enabled()) return 'The Arena is switched off';
    if (this.match) return 'A match is already running';
    const pose = this.deps.pose(id);
    if (!pose) return 'You are not in the office';
    if (!this.spawnTiles()) return 'This office has no room for a match';
    this.match = createMatch(`m${this.now()}`, id, this.now());
    this.returnTo.set(id, pose);
    this.afterChange();
    return null;
  }

  join(id: string): string | null {
    const m = this.match;
    if (!this.deps.enabled()) return 'The Arena is switched off';
    if (!m) return 'There is no match to join';
    if (m.players.some((p) => p.id === id)) return null;
    if (!canJoin(m, id)) return 'The match is full';
    const pose = this.deps.pose(id);
    if (!pose) return 'You are not in the office';
    this.match = addPlayer(m, id, this.now());
    this.returnTo.set(id, pose);
    this.afterChange();
    this.sendBoard();
    this.sendYou(id);
    return null;
  }

  /** A player leaves, or their connection closed. They go back to where they stood unless they are gone. */
  leave(id: string): string | null {
    const m = this.match;
    if (!m || !m.players.some((p) => p.id === id)) return 'You are not in a match';
    this.sendBack(id);
    const next = removePlayer(m, id);
    this.match = next;
    if (!next) this.returnTo.clear();
    // A team that just lost its last player ends the round.
    else this.advance();
    this.afterChange();
    this.sendBoard();
    return null;
  }

  // ------------------------------------------------------------------ the host's controls

  begin(id: string): string | null {
    const m = this.match;
    if (!m) return 'There is no match';
    if (m.host !== id) return HOST_ONLY;
    if (m.phase !== 'lobby') return 'The match has already begun';
    return this.advance({ op: 'begin' }) ? null : 'You need at least 2 players';
  }

  reset(id: string): string | null {
    const m = this.match;
    if (!m) return 'There is no match';
    if (m.host !== id) return HOST_ONLY;
    this.advance({ op: 'reset' });
    return null;
  }

  /** Ends the match and puts everyone back. The host or an admin may. */
  stop(id: string, isAdmin = false): string | null {
    const m = this.match;
    if (!m) return 'There is no match';
    if (m.host !== id && !isAdmin) return HOST_ONLY;
    this.shutdown();
    return null;
  }

  /** Ends the match without asking anyone (the Arena was switched off). */
  shutdown() {
    const m = this.match;
    if (!m) return;
    for (const p of m.players) this.sendBack(p.id);
    this.match = null;
    this.returnTo.clear();
    this.afterChange();
  }

  // ------------------------------------------------------------------ play

  /**
   * A shot. The server decides everything: the phase, whether the shooter may fire, where it goes and what it hits. `seq` is carried
   * back to the shooter so the browser can match the hit marker to the click.
   */
  fire(id: string, angle: number, seq: number): void {
    const m = this.match;
    const now = this.now();
    const shooter = m?.players.find((p) => p.id === id);
    if (!m || !shooter || m.phase !== 'play' || !shooter.alive || !Number.isFinite(angle)) return;
    const pose = this.deps.pose(id);
    if (!pose || pose.mode !== '3d') return;
    const gear = GEAR[shooter.gear];
    if (now - shooter.lastShotAt < (60_000 / gear.rpm) * RATE_SLACK) return;

    // Only living opponents are ever targets, so nobody outside the match can be hit.
    const targets: { id: string; x: number; y: number }[] = [];
    for (const t of m.players) {
      const tp = canHit(shooter, t) ? this.deps.pose(t.id) : null;
      if (tp) targets.push({ id: t.id, x: tp.x, y: tp.y });
    }
    const rays = castShot(this.deps.world(), pose, targets, angle, gear, this.rng);

    const byId = new Map<string, ArenaPlayer>(m.players.map((p) => [p.id, p]));
    let me = { ...shooter, lastShotAt: now };
    const hit = new Map<string, boolean>(); // target id → tagged out by this shot
    for (const ray of rays) {
      this.deps.broadcast({ t: 'arenaShot', from: id, x0: pose.x, y0: pose.y, x1: ray.x1, y1: ray.y1, ...(ray.hit ? { hit: ray.hit } : {}) });
      const target = ray.hit ? byId.get(ray.hit) : undefined;
      if (!ray.hit || !target || !canHit(me, target)) continue;
      const after = applyHit(target, gear.damage);
      byId.set(target.id, after);
      hit.set(target.id, !after.alive);
      if (!after.alive) me = rewardTag(me);
    }
    byId.set(id, me);
    this.match = { ...m, players: m.players.map((p) => byId.get(p.id)!) };

    const tagged = [...hit].find(([, out]) => out)?.[0];
    const first = tagged ?? [...hit.keys()][0];
    this.advance();
    for (const [tid, out] of hit) this.sendYou(tid, { kind: out ? 'tagged' : 'hit', by: id });
    this.sendYou(id, first ? { kind: tagged ? 'tag' : 'hit', target: first, seq } : undefined);
    if (tagged) {
      this.sendBoard();
      this.publish();
    }
  }

  buy(id: string, item: string): string | null {
    const m = this.match;
    const p = m?.players.find((q) => q.id === id);
    if (!m || !p) return 'You are not in a match';
    const r = buy(p, item, m.phase);
    if (!r.ok) {
      this.sendYou(id, { kind: 'refused' });
      return {
        phase: 'You can only buy between rounds', dead: 'You are tagged out', unknown: 'That is not for sale', money: 'Not enough money', owned: 'You already have that',
      }[r.reason];
    }
    this.match = { ...m, players: m.players.map((q) => (q.id === id ? r.player : q)) };
    this.sendYou(id, { kind: 'bought' });
    return null;
  }

  /** Moves the clock on. The server calls it a few times a second. */
  tick() {
    if (this.match) this.advance();
  }

  // ------------------------------------------------------------------ internals

  /** Runs the rules for the time now (and an optional `begin` or `reset`). Returns false when the rules refused. */
  private advance(input: { op?: 'begin' | 'reset' } = {}): boolean {
    const m = this.match;
    if (!m) return false;
    const r = stepMatch(m, this.now(), input, this.timings);
    this.match = r.match;
    if (r.events.some((e) => e.kind === 'refused')) return false;
    if (r.events.length) this.onEvents(r.events);
    return true;
  }

  private onEvents(events: MatchEvent[]) {
    for (const e of events) {
      if (e.kind === 'roundStart' && !this.placeTeams()) return;
    }
    const m = this.match!;
    this.publish();
    this.sendBoard();
    for (const p of m.players) this.sendYou(p.id);
    this.deps.changed();
  }

  /** Puts each team on its spawn tiles. If the office has changed so there is no room, the match ends. */
  private placeTeams(): boolean {
    const m = this.match!;
    const spawns = this.spawnTiles();
    if (!spawns) {
      this.shutdown();
      return false;
    }
    const centre = (t: Team) => ({ x: avg(spawns[t].map((s) => s.x)), y: avg(spawns[t].map((s) => s.y)) });
    const idx: Record<Team, number> = { blue: 0, orange: 0 };
    for (const p of m.players) {
      if (!this.deps.pose(p.id)) continue;
      const spot = spawns[p.team][idx[p.team]++ % spawns[p.team].length];
      const toward = centre(p.team === 'blue' ? 'orange' : 'blue');
      this.deps.teleport(p.id, spot.x, spot.y, Math.atan2(toward.y - spot.y, toward.x - spot.x));
    }
    return true;
  }

  private spawnTiles() {
    return this.deps.spawns ?? arenaSpawns(this.deps.world());
  }

  private sendBack(id: string) {
    const to = this.returnTo.get(id);
    this.returnTo.delete(id);
    if (to && this.deps.pose(id)) this.deps.teleport(id, to.x, to.y, to.a, true);
  }

  private afterChange() {
    this.publish();
    this.deps.changed();
  }

  private publish() {
    this.deps.broadcast(this.summary());
  }

  /** Only to players. */
  private sendBoard() {
    const m = this.match;
    if (!m) return;
    const msg: ServerMsg = {
      t: 'arenaBoard',
      rows: m.players.map((p) => ({ id: p.id, team: p.team, tags: p.tags, tagOuts: p.tagOuts, money: p.money })),
    };
    for (const p of m.players) this.deps.send(p.id, msg);
  }

  /** A player's own state, only to them. */
  private sendYou(id: string, event?: { kind: 'hit' | 'tagged' | 'tag' | 'bought' | 'refused'; by?: string; target?: string; seq?: number }) {
    const p = this.match?.players.find((q) => q.id === id);
    if (!p) return;
    this.deps.send(id, {
      t: 'arenaYou', health: p.health, armour: p.armour, money: p.money, gear: p.gear,
      ...(event ? { event } : {}),
    });
  }
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
