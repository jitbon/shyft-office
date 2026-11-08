# Data Model: Jam Mode

Server state is in memory only. Nothing here is saved; the one persisted field is `Room.jam`, which rides on the layout.

## Constants (`shared/jam.ts`)

| Name | Value | Purpose |
|---|---|---|
| `QUEUE_MAX` | 20 | Songs waiting in one room |
| `PER_MEMBER_MAX` | 3 | Songs one member can have waiting |
| `TITLE_MAX` | 100 | Characters kept of a title |
| `TRACK_MIN_S` / `TRACK_MAX_S` | 5 / 1200 | Accepted track length |
| `LENGTH_WAIT_MS` | 15000 | Time to get a length before a track counts as unplayable |
| `DRIFT_MS` | 1500 | Position difference before a listener seeks |
| `GAP_MS` | 800 | Pause between tracks |
| `TICK_MS` | 500 | Engine tick |

## Room (changed, `shared/layout.ts`)

| Field | Type | Rule |
|---|---|---|
| `jam` | `boolean?` | Optional. Absent or `false` means an ordinary room. Anything other than `true` is read as absent. |

## Track

| Field | Type | Rule |
|---|---|---|
| `id` | string | Server-made, unique in the room (`t1`, `t2`, …) |
| `provider` | `'youtube'` | The only value in v1 |
| `ref` | string | The provider's id. `^[A-Za-z0-9_-]{11}$` for YouTube. Never a full URL. |
| `title` | string | Cleaned, at most `TITLE_MAX` |
| `by` | string | The adder's member id |
| `byName` | string | The adder's name when added |

## JamRoom (server, per occupied Jam Room)

| Field | Type | Notes |
|---|---|---|
| `roomId` | string | The room's id |
| `listeners` | ordered set of player ids | Join order |
| `mode` | `'station' \| 'track'` | |
| `stationEpoch` | ms | Server time the station began; bars count from it |
| `seed` | int | Fixed for the life of the jam, sent so everyone plays the same notes |
| `current` | `{ track, startedAt, len?, fails: Set<id> } \| null` | `len` is set by the first valid report |
| `queue` | `Track[]` | In play order |
| `gapUntil` | ms \| null | Short silence between tracks |

## State transitions

```
empty ──first listener──▶ station
station ──queue not empty──▶ track (after GAP_MS)
track ──len reached / skip / unplayable──▶ track (next) | station (queue empty)
any ──last listener leaves / room unmarked / layout removes room──▶ empty   (queue cleared)
```

## Validation rules

- **Link** (`parseTrackLink`): a string up to 300 characters; scheme `http` or `https`; host exactly one of the allowed hosts; the id from `v=` (watch), the path (`/shorts/`, `/embed/`, `/live/`) or, for `youtu.be`, the first path segment; all other parts discarded; the id must match the pattern. Failure gives a reason code: `bad-link`, `unsupported-site`.
- **Add**: sender is a listener; the queue has room (`queue-full`); the sender is under their cap (`member-cap`); the title lookup works (`not-found`, `lookup-failed`); rate limit passes.
- **Remove**: the sender is a listener and added that track.
- **Skip**: the sender is a listener and a track (not the station) is playing.
- **Length report**: the sender is a listener, the id is the current track, `len` is an integer in range, and no length is set yet.
- **Failure report**: the sender is a listener and the id is the current track; counted once per sender.

## Derived values

- `positionAt(current, now)` = `now − startedAt` in ms, clamped to `[0, len × 1000]` (`len` is in seconds, as reported and sent).
- `stationBar(jam, now)` = `floor((now − stationEpoch) / barMs)` and the offset into that bar.
- Failure rule: skip when `fails.size > listeners.size / 2`.
