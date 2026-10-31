# Data Model: Screen Sharing

Nothing here is written to disk. Shares exist only while they run (spec: no recording or history). The server keeps the share list in memory; viewer focus and shared-sound levels live in each browser.

## Share (server, `ShareRegistry`)

```ts
interface ShareRecord {
  shareId: string;        // `${sharerId}:${n}`, n counts up per connection (R10)
  sharer: string;         // player id
  startedAt: number;      // server epoch ms
  audio: boolean;         // the share carries sound (US4)
  w: number; h: number;   // picture size in pixels, integers 1–8192
  origin: LinkContext;    // positionContext of the sharer when it started (R4)
}
```

- One share per sharer at most. Starting again while sharing only updates `audio`, `w` and `h` (a "resize").
- **Created** when a `share { on: true }` arrives, the sharer is not on Do Not Disturb, and fewer than `MAX_SHARES` (3) shares run among the sharer's conversation members (just the sharer when they are alone).
- **Removed** when `shareKeeps` says no (R4: place changed; alone on the open floor and not at a desk; DND), or on `share { on: false }`, or on disconnect.
- On removal for any reason except the sharer's own stop, the sharer gets `shareState { on: false, reason }`.

### State transitions

```text
          share{on:true} & allowed            share{on:true} (resize)
 (none) ─────────────────────────────▶ active ◀──────────────┐
   ▲   ╲ share{on:true} & refused            │ ──────────────┘
   │    ╲──▶ shareState{on:false,'full'|'dnd'}│
   │                                          │ share{on:false} | disconnect
   │                                          │ | shareKeeps()=false (left/dnd)
   └──────────────────────────────────────────┘
```

## Share info (sent, inside `ConversationInfo`)

```ts
interface ShareInfo {
  shareId: string;
  sharer: string;
  startedAt: number;
  audio: boolean;
  w: number; h: number;
}
interface ConversationInfo { /* existing fields */ shares?: ShareInfo[] }  // members' shares, oldest first; omitted when none
```

Since `ConversationInfo` is only ever sent to the members of that conversation, `shares` inherits its scope. `origin` is not sent.

## Place rule (`shared/screen-share.ts`, pure)

```ts
interface SharePlace { context: LinkContext; inConversation: boolean; atDesk: boolean; dnd: boolean }
function shareKeeps(origin: LinkContext, now: SharePlace): boolean
// false if now.dnd
// false if now.context !== origin
// false if now.context === 'open' && !now.inConversation && !now.atDesk
// true otherwise
```

The server builds `SharePlace` from `positionContext(x, y, id, office)`, `links.conversationMembers(id).length > 0`, `deskAt(x, y) !== null` and `status.kind`.

## Bitrate (pure)

`screenBitrate(receivers: number): number` = `clamp(6_000_000 / max(1, receivers), 400_000, 2_500_000)`.

## Viewer focus (browser, `stagePlan`, pure)

```ts
interface StageInput { shares: ShareInfo[]; selfId: string; picked: string | null }  // picked: a shareId the viewer clicked
interface StagePlan {
  large: string | null;     // shareId shown large: picked if still running, else the newest share not your own
  thumbs: string[];         // the other shares not your own, newest first
  selfPreview: string | null; // your own shareId, shown small (FR-015), never large
  picked: string | null;    // picked, cleared when that share ended
  started: string[];        // shareIds new since the last plan, for the "<name> started sharing" cue
}
```

## Shared sound level (browser)

`Map<shareId, number>`, 0–1, default 1. It is kept in memory only and forgotten when the share ends.

## Validation (server, `validateShareMsg`)

| Field | Rule |
|---|---|
| `on` | boolean, required |
| `audio` | boolean, default false |
| `w`, `h` | numbers. Rounded and clamped to 1–8192. If either is missing or not a number, the message is ignored (only when `on: true`) |
| rate | at most 4 `share` messages per second per connection. Extra ones are dropped |
