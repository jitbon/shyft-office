# Protocol changes: Character Statuses (013)

All messages are the existing WebSocket JSON messages in `shared/protocol.ts`. Only additions are listed. Every field below is optional, so a client from before this feature keeps working (R2).

## Client → server

### `status` (extended)

```ts
{ t: 'status', kind: 'available' | 'busy' | 'dnd', preset?: PresetId, text?: string, emoji?: string, until?: number }
```

- Validated by `cleanStatus` (data-model.md). Invalid → `notify { kind: 'error', text: 'That status is not valid, or has already run out.' }` (unchanged).
- With `preset`, the server stores `kind: 'busy'` whatever the client sent.
- `auto` from a client is ignored.
- `resume?: true` marks the re-send after a reconnect. When another connection of the same member is online, the server ignores it and gives this connection that member's current chosen status (research R6).
- Applied to every connection of the same member (not guests); each gets `presence` for its own id.
- If the new shown status has `devicesOff`: the server sets mic and camera off, broadcasts it, and stops a screen share with `shareState { on: false, reason: 'status' }` (`'dnd'` stays for Do Not Disturb).

### `statusPrefs` (new)

```ts
{ t: 'statusPrefs', autoMeeting: boolean }
```

- Sent after `welcome` and whenever the setting changes. Non-boolean → ignored. Rate-limited with the existing per-second limiter.

### `media` (rule change)

- While the shown status has `devicesOff`, the server forces `mic` and `cam` to false (today: only Do Not Disturb).

## Server → client

### `presence.status` (extended)

```ts
{ t: 'presence', id, status: { kind, preset?, text?, emoji?, until?, auto? } }
```

- Sent within one link tick (≤ 200 ms) of any change to the shown status, including automatic In a meeting starting or ending and a time limit running out.

### `welcome` / player snapshot

- Each player's `status` carries the new fields.

### `notify` kind `awayInfo` (new)

```ts
{ t: 'notify', kind: 'awayInfo', from: string /* target id */, text: string }
```

- Sent to the sender of a `ring` or `wave` when the target's shown status blocks conversations (FR-020) (Do Not Disturb, Focusing, Lunch, Coffee break, Away, Out for the day).
- `text` example: `"Sam is at lunch · back at 1 · 42 min left"`. The ring or wave is still delivered.

### Office snapshot (desk owners)

- `owner.status` carries the new fields (unchanged shape otherwise).

## Rules that read the shown status

| Rule | Where | Before | After |
|---|---|---|---|
| Joins conversations | `shared/proximity.ts` `contextOf` | `kind === 'dnd'` → none | `blocksConversations(status)` → none |
| Mic/camera forced off | `server/app.ts` `media`, `status` | DND | `devicesOff(status)` |
| Screen share stops | `server/app.ts` `placeOf` → `shares.sweep` | `dnd` | `devicesOff(status)` |

## Privacy

Statuses are public to everyone in the office, as today (spec Assumptions). No new private context is added, so no new privacy test is required by Constitution III. The existing `ws-privacy` tests must still pass.
