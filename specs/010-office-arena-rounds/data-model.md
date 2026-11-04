# Data Model: Office Arena

Nothing about a match is stored. It exists in server memory while it runs. The only stored value is the admin's `arenaEnabled`.

## Match (server, `MatchState` in shared/arena.ts)

```ts
type Team = 'blue' | 'orange';
type Phase = 'lobby' | 'buy' | 'play' | 'roundEnd' | 'matchEnd';

interface MatchState {
  id: string;
  host: string;                      // player id; passes to the earliest-joined player if the host leaves
  phase: Phase;
  phaseEndsAt: number;               // server ms; 0 in lobby and matchEnd
  round: number;                     // 0 in lobby, then 1, 2, …
  wins: Record<Team, number>;        // first to WIN_TARGET (5)
  players: ArenaPlayer[];            // join order; at most MAX_PLAYERS (10)
  lastRoundWinner?: Team | 'draw';
}

interface ArenaPlayer {
  id: string;                        // player id
  team: Team;
  alive: boolean;
  health: number;                    // 0–100
  armour: number;                    // 0–50
  money: number;                     // 0–MONEY_CAP
  gear: GearId;                      // current blaster
  tags: number;                      // kill count, whole match
  tagOuts: number;
  joinedAt: number;
  returnTo: { x: number; y: number; a: number; mode: '2d' | '3d' };  // pose before joining (FR-003)
  lastShotAt: number;                // for the fire-rate check
  lastMoveAt: number; lastX: number; lastY: number;                  // for the speed check
}
```

### Constants (shared/arena.ts)

| Name | Value |
|---|---|
| `MAX_PLAYERS` | 10 |
| `MIN_PLAYERS` | 2 |
| `WIN_TARGET` | 5 |
| `BUY_MS` | 15,000 |
| `PLAY_MS` | 120,000 |
| `ROUND_END_MS` | 5,000 |
| `HEALTH` | 100 |
| `ARMOUR` | 50 |
| `ECONOMY` | `{ start: 1000, tag: 250, win: 2500, loss: 1200, cap: 8000 }` |
| `HIT_RADIUS` | 0.3 tiles |

`GEAR` is the table in research R7, with the fields `id, name, price, damage, pellets, rpm, range, spread, armour?`.

### Phase transitions (`stepMatch`)

| From | When | To | Effects |
|---|---|---|---|
| lobby | host `begin` with ≥ 2 players | buy | assign teams, round = 1, spawn and teleport, everyone alive with full health |
| buy | `now ≥ phaseEndsAt` | play | — |
| play | a team has no one alive | roundEnd | the other team gets +1 win; rewards |
| play | `now ≥ phaseEndsAt` | roundEnd | the team with more alive wins; an equal count is a draw (no win); rewards |
| roundEnd | a team has `WIN_TARGET` wins | matchEnd | final board |
| roundEnd | `now ≥ phaseEndsAt` | buy | round + 1, respawn, the tagged-out get the starter gear and no armour |
| any | host `reset` | buy | round 1, wins 0, tags, tag-outs and money reset, starter gear |
| any | host or admin `stop`, the Arena switched off, or the last player leaves | (removed) | everyone teleported to `returnTo` |

- **Rewards** at round end: winners +`win`, losers +`loss`, a draw gives everyone +`loss`. Each tag gave +`tag` when it happened. Everything is capped at `cap`.

## Validation of client messages

| Message | Rule |
|---|---|
| `arena { op }` | `op` is one of `start`, `join`, `leave`, `begin`, `stop`, `reset`. `begin`, `stop` and `reset` are host only (`stop` also admin); `start` only when none runs and the Arena is enabled; `join` only when a match runs, it has fewer than 10 players, and the member isn't sharing a screen (or the share is stopped first) |
| `fire { a, seq }` | `a` is finite; phase is `play`; shooter alive; at least `60000/rpm × 0.9` ms since the last shot; `seq` is an integer, used only to match the confirmation |
| `buy { item }` | `item` is in `GEAR`; phase is `buy`; shooter alive; `money ≥ price`. A blaster replaces the current one, and the vest sets armour to 50 |

## Additions elsewhere

- `shared/proximity.ts`: `computeLinks(…, office)` reads `office.match?: ReadonlySet<string>`. A pair split by it never links.
- `server/office.ts`: `checkEntry` returns `'arena'` for a match player moving into a private area or a desk space that isn't their own.
- `shared/protocol.ts`:
  - `EntryDenied` and `correct.reason` gain `'arena'`;
  - `teleport.reason` gains `'arena'`;
  - `AdminOp` gains `{ op: 'arena'; enabled: boolean }`;
  - `adminState` gains `arenaEnabled?`.
- `server/store.ts`: `arenaEnabled?: boolean`, an additive field (absent means true, and the version is unchanged).
