# Data Model: Drawing on a Screen Share

Nothing here is written to disk, and no stroke is kept on the server (FR-012). The server keeps one flag per share and one ink slot per player. Strokes live only in the browsers that are showing them.

## Additions to 006's share

```ts
interface ShareInfo { /* 006 fields */ drawing: boolean }   // others may draw; default true
interface ShareRecord { /* 006 fields */ drawing: boolean }
```

- Set by `inkAllow` from the sharer only. Lost when the share ends.

## Ink slots (server, `assignInkSlots`, pure)

```ts
function assignInkSlots(members: string[], prev: ReadonlyMap<string, number>): Map<string, number>
```

- Members keep their slot from `prev` if they have one and it is not already taken in this result.
- Others get the lowest free slot 0–7, in join order. A ninth member or later gets `slot % 8` for the lowest-loaded slot.
- The server keeps one `Map<playerId, number>` across ticks and drops a player's slot when they have no conversation.
- Sent as `ConversationInfo.ink?: Record<string, number>`, only when the conversation has at least one share.

## Ink message (client → server)

```ts
interface InkOut {
  t: 'ink';
  shareId: string;
  strokeId: number;  // integer ≥ 0, counted up by the drawer's browser
  seq: number;       // integer ≥ 0, per stroke, counting messages
  pts: number[];     // flat [x, y, …], integers 0–10000, even length, 2–128 numbers (1–64 points)
  end?: boolean;     // last message of the stroke
  keep?: boolean;    // don't fade (P3)
}
```

### Validation (`validateInk`, shared, pure)

| Field | Rule |
|---|---|
| `shareId` | string, ≤ 80 chars |
| `strokeId`, `seq` | integers 0–2^31 |
| `pts` | array, even length, 2–128 entries, each a finite number. Rounded and clamped to 0–10000 |
| `end`, `keep` | `true` or absent. Any other value counts as absent |
| otherwise | the message is ignored |

## Server checks before relaying

1. The connection's rate allows it (≤ 40 messages and ≤ 2,000 points per second). Otherwise drop it and send `inkSlow`, at most once a second.
2. The share `shareId` is running. Let `sharer` be its sharer.
3. The sender is in `links.conversationMembers(sharer)`, or is the sharer.
4. `drawing` is true, or the sender is the sharer.
5. Send `{ ...ink, from: sender }` to every member of `conversationMembers(sharer)` except the sender.

## Stroke (browser, `InkStore`)

```ts
interface Stroke {
  shareId: string;
  from: string;           // drawer's player id
  strokeId: number;
  color: number;          // ink slot at the time it started
  keep: boolean;
  pts: number[];          // in arrival order of seq; gaps are allowed (drawn joined)
  lastSeq: number;
  lastAt: number;         // local ms of the last message
  endedAt: number | null; // local ms when `end` arrived, or lastAt + 5000 if it never does
}
```

- Key: `${shareId}|${from}|${strokeId}`.
- A batch with `seq ≤ lastSeq` is ignored (duplicate). One with a gap is appended anyway.
- **Opacity** (`strokeAlpha(now, endedAt, keep)`):
  - 1 while drawing, or when `keep` is set;
  - 1 until `endedAt + 3000`;
  - linear to 0 at `endedAt + 4000`;
  - removed after that.
- **Removed** on `inkClear` (`mine` removes strokes `from` that member; `all` removes every stroke of the share), when the share is no longer in `conversation.shares`, when `drawing` becomes false (every stroke of the share, the sharer's included), or when the drawer leaves the conversation (their open strokes are ended at once and fade).

## Clear and allow (client → server, server → clients)

```ts
| { t: 'inkClear'; shareId: string; scope: 'mine' | 'all' }  // 'all' only from the sharer
| { t: 'inkAllow'; shareId: string; on: boolean }            // sharer only
```

- Server → members: `{ t: 'ink', …, from }`, `{ t: 'inkClear', shareId, scope, from }` and `{ t: 'inkSlow' }` (to the sender only).
- `inkAllow` changes `ShareRecord.drawing`. It reaches members through the next `links` (`ShareInfo.drawing`), and `off` also sends `inkClear all` at once.

## Content box (pure, `contentBox`)

`contentBox(elW, elH, vidW, vidH) → { x, y, w, h }`: the rectangle the video occupies inside its element under `object-fit: contain`. Ink points map as `x = box.x + px / 10000 * box.w` (the same for y).

## Pen state (browser, in memory)

`{ on: boolean; keep: boolean; pausedUntil: number }`. It is off whenever the large share changes, the share ends or drawing is turned off.
