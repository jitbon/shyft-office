# Data Model: Character Statuses (013)

## PlayerStatus (extended, `shared/protocol.ts`)

| Field | Type | Rules |
|---|---|---|
| `kind` | `'available' \| 'busy' \| 'dnd'` | Unchanged. The server sets `'busy'` whenever `preset` is present. |
| `preset` | `'meeting' \| 'focus' \| 'lunch' \| 'coffee' \| 'away' \| 'out'` (optional) | Must be a known id; unknown ids are rejected. |
| `text` | string (optional) | Trimmed, at most 60 characters (`MAX_STATUS_TEXT`), blank dropped. |
| `emoji` | string (optional) | Exactly one grapheme matching `\p{Extended_Pictographic}`, at most 16 UTF-16 units; anything else is dropped. |
| `until` | epoch ms (optional) | Must be in the future; capped at now + 24 h (`MAX_STATUS_MS`). |
| `auto` | `true` (optional) | Set only by the server, on an automatic In a meeting. A client sending it is ignored. |

The **id** of a status for display and effects is `preset ?? kind` (nine ids, R3 table).

## StatusPreset (constant table, `shared/status.ts`)

| Field | Type |
|---|---|
| `id` | the nine status ids |
| `label` | e.g. "Lunch" |
| `phrase` | for notices, e.g. "is at lunch" |
| `icon` | one emoji |
| `color` | dot and icon ring color, contrast-checked on the name tag background |
| `defaultLimit` | minutes, `'morning'`, or none |
| `blocksConversations` | boolean |
| `devicesOff` | boolean (also stops screen share) |
| `dims` | boolean |

## Server connection state (`server/app.ts` `PlayerState`/`Conn`)

| Field | Meaning |
|---|---|
| `chosen` | The status the member set (or Available). Never changed by automatic rules. |
| `status` | The shown status, broadcast to everyone; what every rule reads. |
| `autoMeeting` | boolean, default `true`, from `statusPrefs`. |

### Shown-status rule (pure, `shownStatus`)

```
expired(chosen)                      → { kind: 'available' }       (then rule below)
chosen is Available and autoMeeting
  and inMeeting                      → { kind: 'busy', preset: 'meeting', auto: true }
otherwise                            → chosen
```

`inMeeting(p)` = sharing a screen, OR in a conversation of ≥ 3 members, OR in a private area (`positionContext` starts with `area:`) with at least one other player in the same context.

### State transitions

```
Available ──set by member──▶ any status ──time runs out──▶ Available
Available ──enters meeting (autoMeeting on)──▶ In a meeting (auto) ──leaves──▶ Available
any non-Available chosen ──enters meeting──▶ unchanged
In a meeting (auto) ──member sets a status──▶ that status (chosen wins)
```

No transition depends on idle time or tab visibility (FR-013).

## Status preferences (device storage, key `shyft.status.v1`)

```json
{ "autoMeeting": true, "recent": [{ "preset": "lunch", "text": "back at 1", "emoji": "🍜", "minutes": 60 }] }
```

- `recent`: at most 3, newest first, de-duplicated by `(id, text, emoji)`; Available is never stored.
- Unreadable or missing storage → defaults (`autoMeeting: true`, no recent).
