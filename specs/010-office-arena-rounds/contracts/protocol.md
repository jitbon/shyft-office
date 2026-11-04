# Contract: Arena messages

These are additions to `shared/protocol.ts`.

## Client → server

```ts
| { t: 'arena'; op: 'start' | 'join' | 'leave' | 'begin' | 'stop' | 'reset' }
| { t: 'fire'; a: number; seq: number }
| { t: 'buy'; item: string }
| { t: 'admin'; op: 'arena'; enabled: boolean }   // via the existing AdminOp
```

Validation is in [data-model.md](../data-model.md#validation-of-client-messages). Refused requests get a `notify { kind: 'error', text }` with a short reason ("The match is full", "Not enough money", "Only the host can do that"). Dropped `fire` messages get no reply.

## Server → client

```ts
// To everyone, when it changes and at each phase start. No money, health or gear.
| { t: 'arena'; match: null | {
      phase: Phase; round: number; wins: Record<Team, number>; endsIn: number;   // ms left in this phase
      host: string; teams: Record<string, Team>; alive: string[] } }
// To everyone: a visual tracer. Non-players draw it silently.
| { t: 'arenaShot'; from: string; x0: number; y0: number; x1: number; y1: number; hit?: string }
// To one player only: their own state and the events that involve them.
| { t: 'arenaYou'; health: number; armour: number; money: number; gear: string;
    event?: { kind: 'hit' | 'tagged' | 'tag' | 'bought' | 'refused'; by?: string; target?: string; seq?: number } }
// To players only: the full scoreboard.
| { t: 'arenaBoard'; rows: { id: string; team: Team; tags: number; tagOuts: number; money: number }[] }
```

## Changes to existing messages

- `correct.reason` and the server's `EntryDenied` gain `'arena'`. The browser shows "Not during a match".
- `teleport.reason` gains `'arena'`, sent at round start and when returning to the office.
- `adminState` gains `arenaEnabled?: boolean`.
- `shareState.reason` gains `'arena'`: a match player can't start a screen share.
- **Refused for match players with "Not during a match":** `walkToDesk`, accepting a ring, `share { on: true }`, `avatar` changes, and the builder and studio API (HTTP 409 `in-match`).
- **Every arena teleport** also sets the player's position on the server and resets the speed-check baseline, so the next move is measured from the new spot.
- `links`: no new fields. Players and non-players simply never link with each other (research R8).

## Privacy invariants (tested)

1. `arenaYou` and `arenaBoard` are only ever sent to members of the match.
2. While a match runs, no `links` message pairs a player with a non-player, in either direction and of any kind.
3. A shot never changes a non-player's state, and no `arenaYou` is ever sent to one.
4. A match player is refused (`correct`, reason `'arena'`) when moving into a meeting room or a desk space that isn't their own.
5. Only the server changes health, money, gear, tags and wins. A `fire` or `buy` that breaks the rules has no effect.
