// The browser's side of Office Arena: what the server last told us, and the intents we send. The server decides every outcome.
import type { ClientMsg, Phase, ServerMsg, Team, ViewMode } from '../../shared/protocol';

type Summary = NonNullable<Extract<ServerMsg, { t: 'arena' }>['match']>;
type You = Extract<ServerMsg, { t: 'arenaYou' }>;
export type BoardRow = Extract<ServerMsg, { t: 'arenaBoard' }>['rows'][number];

export const TEAM_NAME: Record<Team, string> = { blue: 'Blue', orange: 'Orange' };
export const TEAM_COLOR: Record<Team, string> = { blue: '#3fa7d6', orange: '#f29e4c' };

const TRACER_MS = 150;
const PUFF_MS = 600;

export interface Tracer {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  team: Team | null;
  until: number;
}
export interface Puff {
  x: number;
  y: number;
  until: number;
}
export type ArenaSound = 'shot' | 'hit' | 'tagout' | 'round';

export interface ArenaDeps {
  send(msg: ClientMsg): void;
  myId(): string;
  /** Where a player is drawn now (for tag-out puffs). */
  posOf(id: string): { x: number; y: number } | undefined;
  /** Called when anything the HUD shows changed. */
  onChange(): void;
  onSound(kind: ArenaSound): void;
}

export class ArenaClient {
  match: Summary | null = null;
  /** Our own state; only ever sent to players. */
  you: Pick<You, 'health' | 'armour' | 'money' | 'gear'> | null = null;
  board: BoardRow[] = [];
  tracers: Tracer[] = [];
  puffs: Puff[] = [];
  /** performance.now() times until which each cue shows. */
  hitMarkerUntil = 0;
  hurtUntil = 0;
  flashUntil = 0;
  /** The last thing that happened to us, for the HUD line ("Tagged by Sam"). */
  taggedBy: string | null = null;
  /** Where we stood before joining, so leaving puts us back as we were. */
  returnPose: { a: number; mode: ViewMode } | null = null;
  private receivedAt = 0;
  private seq = 0;
  private spectate = 0;

  constructor(private deps: ArenaDeps) {}

  // ------------------------------------------------------------------ questions

  get me(): string {
    return this.deps.myId();
  }
  inMatch(): boolean {
    return !!this.match && this.deps.myId() in this.match.teams;
  }
  get phase(): Phase | null {
    return this.match?.phase ?? null;
  }
  teamOf(id: string): Team | null {
    return this.match?.teams[id] ?? null;
  }
  get myTeam(): Team | null {
    return this.teamOf(this.deps.myId());
  }
  isAlive(id: string): boolean {
    return !!this.match?.alive.includes(id);
  }
  /** Milliseconds left in this phase, counted down from when we were told. */
  endsIn(now = performance.now()): number {
    return this.match ? Math.max(0, this.match.endsIn - (now - this.receivedAt)) : 0;
  }
  get playerCount(): number {
    return Object.keys(this.match?.teams ?? {}).length;
  }
  /** Moving is refused in the buy phase, while tagged out, and from the top-down overview (the server enforces all three). */
  frozen(mode: ViewMode): boolean {
    if (!this.inMatch()) return false;
    const me = this.deps.myId();
    return mode === '2d' || (this.phase !== 'lobby' && (this.phase === 'buy' || !this.isAlive(me)));
  }
  /** Tagged out during a round: we watch a teammate who is still in. */
  spectating(): boolean {
    return this.inMatch() && (this.phase === 'play' || this.phase === 'roundEnd') && !this.isAlive(this.deps.myId()) && this.mates().length > 0;
  }
  private mates(): string[] {
    const me = this.deps.myId();
    return (this.match?.alive ?? []).filter((id) => id !== me && this.teamOf(id) === this.myTeam);
  }
  spectateTarget(): string | null {
    const mates = this.mates();
    return mates.length && this.spectating() ? mates[this.spectate % mates.length] : null;
  }
  nextSpectate() {
    this.spectate++;
  }

  // ------------------------------------------------------------------ intents

  /** A click: send the shot if we may fire. The muzzle flash shows at once; the tracer comes back from the server. */
  fire(angle: number): boolean {
    if (!this.inMatch() || this.phase !== 'play' || !this.isAlive(this.deps.myId())) return false;
    this.deps.send({ t: 'fire', a: angle, seq: ++this.seq });
    this.flashUntil = performance.now() + 70;
    this.deps.onSound('shot');
    return true;
  }

  // ------------------------------------------------------------------ from the server

  onArena(msg: Extract<ServerMsg, { t: 'arena' }>) {
    const prev = this.match;
    const now = performance.now();
    if (prev && msg.match) {
      for (const id of prev.alive) {
        const pos = !msg.match.alive.includes(id) && prev.round === msg.match.round ? this.deps.posOf(id) : undefined;
        if (pos) this.puffs.push({ x: pos.x, y: pos.y, until: now + PUFF_MS });
      }
      if (msg.match.phase === 'buy' && prev.phase !== 'buy' && this.inMatchFor(msg.match)) this.deps.onSound('round');
    }
    this.match = msg.match;
    this.receivedAt = now;
    if (!msg.match) {
      this.you = null;
      this.board = [];
      this.taggedBy = null;
    } else if (msg.match.phase === 'buy') {
      this.taggedBy = null;
    }
    this.deps.onChange();
  }

  private inMatchFor(m: Summary) {
    return this.deps.myId() in m.teams;
  }

  onShot(msg: Extract<ServerMsg, { t: 'arenaShot' }>) {
    const team = this.teamOf(msg.from);
    this.tracers.push({ x0: msg.x0, y0: msg.y0, x1: msg.x1, y1: msg.y1, team, until: performance.now() + TRACER_MS });
    if (this.inMatch() && msg.from !== this.deps.myId()) this.deps.onSound('shot');
  }

  onYou(msg: You) {
    this.you = { health: msg.health, armour: msg.armour, money: msg.money, gear: msg.gear };
    const now = performance.now();
    const e = msg.event;
    if (e?.kind === 'hit' || e?.kind === 'tag') {
      this.hitMarkerUntil = now + 220;
      this.deps.onSound('hit');
    } else if (e?.kind === 'tagged') {
      this.hurtUntil = now + 400;
      this.taggedBy = e.by ?? null;
      this.spectate = 0;
      this.deps.onSound('tagout');
    }
    if (e?.kind === 'hit' && msg.event?.by) this.hurtUntil = now + 300;
    this.deps.onChange();
  }

  onBoard(msg: Extract<ServerMsg, { t: 'arenaBoard' }>) {
    this.board = msg.rows;
    this.deps.onChange();
  }

  /** Drops tracers and puffs that have run out. */
  prune(now = performance.now()) {
    if (this.tracers.length) this.tracers = this.tracers.filter((t) => t.until > now);
    if (this.puffs.length) this.puffs = this.puffs.filter((p) => p.until > now);
  }
}
