# Contract: Screen-share messages

These are additions to `shared/protocol.ts`. Existing messages are unchanged except `ConversationInfo`, which gets an optional field.

## Client → server

```ts
| { t: 'share'; on: true; audio: boolean; w: number; h: number }  // start, or update size/audio while sharing
| { t: 'share'; on: false }                                        // stop
```

- The client sends `on: true` only after `getDisplayMedia` returned a track (R2). It may send it again, at most once a second, when the track's size changes.
- Validation is in [data-model.md](../data-model.md#validation-server-validatesharemsg). Bad messages are ignored, never echoed.

## Server → client

```ts
| { t: 'shareState'; on: boolean; shareId?: string; reason?: 'full' | 'dnd' | 'left' | 'stopped' }
```

- Sent **only to the sharer**:
  - `on: true` with `shareId` when the share is accepted;
  - `on: false` with a reason when it is refused (`full`, `dnd`) or ended by the server (`left`, `dnd`).
- On `on: false`, the client stops the capture track and clears the screen slots.
- `stopped` is sent back for the client's own `share { on: false }`, so the client has one place where it handles every end.

```ts
interface ConversationInfo {
  // …existing fields…
  /** Members' running screen shares, oldest first. Omitted when there are none. */
  shares?: ShareInfo[];
}
interface ShareInfo { shareId: string; sharer: string; startedAt: number; audio: boolean; w: number; h: number }
```

- This field lives inside the existing per-member `links` message, so it reaches exactly the members of that conversation (R4).
- The link engine's "send only on change" signature includes `shares`, so starts, stops and resizes reach members on the next tick (≤ one tick, then the media frames, within SC-001's 3 s).

## Media (peer to peer)

- Every `RTCPeerConnection` has four transceivers, added in this order on both sides:
  1. voice (`audio`);
  2. camera (`video`);
  3. **screen video** (`video`);
  4. **screen audio** (`audio`).
  All are `sendrecv`. A share is `replaceTrack` on slots 3 and 4, with no renegotiation.
- The sharer puts tracks on slots 3–4 **only** for peers whose current link is `kind: 'conversation'`, and `null` for everyone else.
- The receiver sorts tracks from slots 3–4 into `peer.screen`, never into `peer.stream`.

## Privacy invariants (tested)

1. A player who is not a member of the sharer's conversation never receives a `links` message whose `shares` names that share. This covers a player outside a private room, an ambient pod neighbour, and someone outside a locked desk.
2. `shareState` is only ever sent to the sharer.
3. `rtc` relay between non-linked players stays dropped (existing test, re-run).
