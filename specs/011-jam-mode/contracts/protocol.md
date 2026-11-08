# Contract: Jam Mode messages

All messages are JSON over the existing WebSocket. Types go in `shared/protocol.ts`.

## Client → server

| Message | Fields | Meaning |
|---|---|---|
| `jam` | `op: 'add'`, `url: string` | Queue a song from a pasted link |
| `jam` | `op: 'remove'`, `id: string` | Remove one of your own queued songs |
| `jam` | `op: 'skip'` | Skip the current song |
| `jamTrack` | `id: string`, `len: number` | The player's reported track length, in seconds |
| `jamFail` | `id: string` | This listener's player can't play the current track |

Every message is ignored unless the sender is currently a listener of a Jam Room. Strings are length-checked (`url` ≤ 300, `id` ≤ 16). Numbers must be finite integers in range.

## Server → client

| Message | Fields | Sent to |
|---|---|---|
| `jam` | see below | Each listener of that room |
| `jam` | `room: null` | A member who has just stopped being a listener, once |
| `jamNote` | `text: string` | Each listener of that room |

`jam` state:

```text
{
  t: 'jam',
  room: string,             // the room's id
  name: string,             // the room's name
  now: number,              // server clock, ms
  mode: 'station' | 'track',
  station: { seed: number, epoch: number },     // always present: used when mode is 'station'
  track?: { id, provider, ref, title, byName, startedAt, len? },
  queue: { id, provider, ref, title, byName, mine: boolean }[],
  listeners: string[]       // names, in join order
}
```

`mine` is true for tracks the recipient added, and is the only per-recipient difference between two listeners' copies. `by` (member id) is never sent.

`jamNote` carries short plain-words messages: who skipped, that a song was skipped because it can't be played ("*Title* can't be played here, skipping"), or that the room was switched off ("This room is no longer a Jam Room. The music has stopped."). Titles are wrapped in `*asterisks*`; the browser shows them as quotes.

Refusals to the sender (`bad-link`, `unsupported-site`, `queue-full`, `member-cap`, `not-found`, `lookup-failed`, `rate`, `not-in-room`) reuse the existing `notify` message with kind `error` and a plain-words text.

## When state is sent

- To a member who becomes a listener: at once.
- To all listeners: whenever the track, queue, listener list or mode changes.
- Nothing is sent on a timer, because clients derive position from `now` and `startedAt`.

## Invariants (each has a test)

1. A member who is not inside a Jam Room receives no `jam` or `jamNote` message, ever, apart from the single `room: null` after leaving.
2. Two Jam Rooms never share a queue, and a member is a listener of at most one.
3. A non-listener's `jam`, `jamTrack` and `jamFail` messages change nothing and leak nothing.
4. `ref` in any message matches the provider pattern. No URL, query or host reaches another client.
5. A member can't remove another member's track, and `by` is never sent.
6. Queue and per-member caps hold under repeated and concurrent adds.
7. A track is never advanced early by a client's report: only the length (once, bounded), a skip, or a failure majority can end it.
8. Unmarking a room, or publishing a layout without it, ends the jam for its listeners within one tick.
