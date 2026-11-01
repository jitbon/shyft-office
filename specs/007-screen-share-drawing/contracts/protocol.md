# Contract: Ink messages

These are additions to `shared/protocol.ts`. 006's messages are unchanged except `ShareInfo` (one field) and `ConversationInfo` (one optional field).

## Client → server

```ts
| { t: 'ink'; shareId: string; strokeId: number; seq: number; pts: number[]; end?: true; keep?: true }
| { t: 'inkClear'; shareId: string; scope: 'mine' | 'all' }
| { t: 'inkAllow'; shareId: string; on: boolean }
```

- `pts` are integers 0–10000 across the shared picture, as `[x, y, …]`, with 1–64 points (research R3, R4).
- The client sends `ink` at most every 33 ms per stroke while drawing.
- Validation and the server's checks are in [data-model.md](../data-model.md). Bad or disallowed messages are dropped silently. The only reply is `inkSlow` when rate-limited.

## Server → client

```ts
| { t: 'ink'; from: string; shareId: string; strokeId: number; seq: number; pts: number[]; end?: true; keep?: true }
| { t: 'inkClear'; from: string; shareId: string; scope: 'mine' | 'all' }
| { t: 'inkSlow' }   // to the sender only, at most once per second
```

- `ink` and `inkClear` go to every member of the **sharer's conversation** except the sender, at once (not on the link tick).

```ts
interface ShareInfo { /* 006 */ drawing: boolean }
interface ConversationInfo { /* 006 */ ink?: Record<string, number> }  // player id → ink slot 0–7; only when there are shares
```

## Privacy invariants (tested)

1. No `ink` or `inkClear` for a share reaches anyone outside its sharer's conversation. That covers someone outside a private room, outside a locked desk, and an ambient pod neighbour.
2. `ink` from a sender who isn't in that conversation is dropped.
3. `ink` for a share that isn't running is dropped.
4. While `drawing` is false, `ink` from anyone but the sharer is dropped.
5. `inkClear scope:'all'` and `inkAllow` from anyone but the sharer are ignored.
6. The server keeps no stroke. A member who joins receives nothing drawn before they joined.
