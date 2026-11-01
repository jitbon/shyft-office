# Phase 0 Research: Drawing on a Screen Share

## R1. Reference behavior (Constitution I)

- **Decision:** model the feature on Slack huddles' "draw on a shared screen", and record the sources honestly:
  - **Reported** (product owner, issue #5): "draw on the screen-share like how slack-huddle allows us to do this smoothly. multiple folks need to be able to draw and it work fine".
  - **Reported** (Slack's public help pages; not captured in a session):
    - anyone in the huddle can draw on a shared screen;
    - each person's drawing has its own color;
    - marks fade after a few seconds;
    - the person sharing can turn drawing off for others;
    - in Slack's desktop app the ink is drawn over the sharer's real screen.
  - **Inferred**: Slack sends ink as small vector messages, not as video. The ink stays sharp at any size, and drawing doesn't affect the screen's video quality.
  - **Unknown**:
    - Slack's exact fade timing (the spec assumes 3 s visible and a 1 s fade);
    - its color palette;
    - whether it caps the number of drawers;
    - whether Gather has an equivalent (none is known; Gather's screen share has no documented drawing tool).
- **Deviation (in the spec's Assumptions):** a web page can't draw over the sharer's real desktop, so the sharer sees ink in the app (R9).
- **Learned while building:** nothing new about Slack or Gather, since no live capture was done. The in-app view is the only place the sharer sees ink, so Open sits on the 006 banner.
- **Not done:** a live capture of Slack or Gather. The timings and palette are constants (R6, R7), so they're cheap to change.

## R2. Transport: server relay over the existing WebSocket

- **Decision:** a drawer's browser sends ink to the server in the existing WebSocket (`{ t: 'ink', … }`). The server checks it and forwards it at once to the other members of the share's conversation. It doesn't wait for the link tick. Nothing is stored.
- **Rationale:**
  - **Constitution III and FR-011:** the server decides who receives ink, with the rule it already has: the share's sharer's conversation members (`links.conversationMembers(sharer)`). The membership check and the drop of ink from non-members happen in one place that tests can reach.
  - **Latency:** a WebSocket relay adds one server hop, typically 10–60 ms on an office network. That is well inside FR-002 and SC-001's 0.5 s.
  - **Load:** at 30 batches a second per drawer (R4), 8 drawers send 240 small messages a second and the server sends about 1,700. Each is under 1 KB, far below the socket's limits, and O(members) per message.
- **Alternatives:**
  - **WebRTC data channels between peers:** lower latency. But the server could no longer see or drop ink, and refusing ink when drawing is off would rely on clients. It would also mean a fifth negotiated slot per connection, with the setup issues 006 found (research R3a there).
  - **Drawing the ink into the shared video:** only the sharer's browser could do that. It costs video quality and adds a round trip through the sharer.

## R3. Coordinates

- **Decision:** points are sent as integers 0–10000 across the shared picture's width and height (normalized × 10000, rounded). A message carries a flat array `[x0, y0, x1, y1, …]`.
- **Rationale:**
  - It is independent of window size, full window and the picture's resolution (FR-003). After a resize (006 `ShareInfo.w/h`), points stay at the same relative place.
  - 1/10000 is about 0.2 px on a 1920-wide picture, so precision loss isn't visible, and SC-002 (within 1 %) is met with margin.
  - Integers keep messages small and easy to validate.
- **Mapping on screen:** the overlay canvas covers exactly the video's *content* box. With `object-fit: contain` (006), that is the letterboxed rectangle computed from `videoWidth`/`videoHeight` and the element's size, recomputed on `resize` and `loadedmetadata`. Points outside 0–10000 are clipped (edge case "a stroke that leaves the edge").

## R4. Sending: batching for smoothness and rate

- **Decision:**
  - The drawer uses Pointer Events with pointer capture and `getCoalescedEvents()`, so a fast movement keeps every sample the hardware reported.
  - Points are drawn locally at once (FR-002), and are also queued and sent every 33 ms (about 30 a second), at most 64 points per message.
  - Consecutive points closer than 0.15 % of the picture are dropped (a pure `thin` step).
  - A stroke is identified by `(drawer, strokeId)`, where the drawer's browser counts `strokeId` up. It has a `seq` per message. The last message carries `end: true`.
- **Rationale:** 30 batches a second look continuous to watchers when smoothed (R5), and keep message counts low. Coalesced events stop fast circles from turning into polygons (US2 AC4).
- **Rate limit (FR-010):** the server allows at most 40 `ink` messages and 2,000 points per second per connection. Beyond that it drops the message and replies `{ t: 'inkSlow' }`, at most once a second. The client then pauses the pen for 1 s with "Slow down". A normal fast scribble is about 30 messages and under 600 points a second, so honest drawing never hits it.
- **Alternatives:** sending every pointer event (60–240 messages a second per drawer); sending only on stroke end (no live drawing, which goes against US1).

## R5. Rendering

- **Decision:**
  - One `<canvas>` overlay per stage, sized to the video content box × `devicePixelRatio`, with `pointer-events` on only while the pen is on.
  - It is redrawn on `requestAnimationFrame` only while some stroke is visible or fading, and idles otherwise (so it costs nothing when nobody draws, SC-004).
  - Each stroke is drawn as quadratic curves through the midpoints of its points: `quadraticCurveTo(p[i], mid(p[i], p[i+1]))`. The stroke is 4 px wide at the picture's 1080p scale, scaled with the box, with a minimum of 2.5 CSS px. It has round caps and joins and a 1 px contrasting outline: a dark or light halo picked per color (spec edge case "colors and themes").
  - Fading is the stroke's opacity: 1 until `endedAt + 3000 ms`, then a linear fall to 0 over 1000 ms, then the stroke is dropped. `endedAt` is when the end arrived locally. A stroke with no message for 5 s is treated as ended at its last message (edge case "a stroke whose end never arrives").
  - Name tags are DOM labels in the drawer's color, positioned at the last point of their open stroke, and hidden 1.5 s after that stroke's last point.
- **Rationale:** midpoint quadratics are the standard cheap smoothing for sampled pen input (US2 AC4, FR-004). Redrawing only while ink is alive keeps the 60 fps target (FR-009). Canvas costs nothing per stroke in the DOM.
- **Alternatives:** SVG paths (simple, but DOM cost grows with strokes, and fading means per-element style changes); Catmull-Rom splines (a little smoother, more points to keep, not needed at 30 Hz batches).

## R6. Colors

- **Decision:** the server assigns each conversation member an **ink slot** 0–7, the lowest slot not used by the other current members. It keeps the slot while the player stays in a conversation, and frees it when they have none. The slots go out in `ConversationInfo.ink: Record<playerId, number>`, and only when the conversation has a share, so it costs nothing otherwise. The palette is 8 colors with good contrast on light and dark content:
  1. red `#ff3b30`
  2. blue `#0a84ff`
  3. green `#30d158`
  4. orange `#ff9f0a`
  5. purple `#bf5af2`
  6. teal `#40c8e0`
  7. yellow `#ffd60a`
  8. pink `#ff375f`

  A ninth member (rooms can exceed 8) reuses `slot % 8`. Their strokes are still told apart by the name tag.
- **Rationale:** every browser has to show the same color for a person (US2 AC3). Only the server sees the true membership order, so it assigns. The pure `assignInkSlots(members, prev)` in `shared/ink.ts` is unit-tested.
- **Alternatives:** color from a hash of the player id (collisions within 8 people are likely); a color from the index in `members` (it shifts when someone earlier leaves, so colors would change mid-conversation).

## R7. Lifetime, clearing and the drawing setting

- **Decision:**
  - **Server-side state:** only `drawing: boolean` on each share (006 `ShareRecord`, default `true`), sent in `ShareInfo.drawing`. No strokes are kept on the server (FR-012).
  - **Clearing:** `{ t: 'inkClear', shareId, scope: 'mine' | 'all' }`. `mine` is allowed for any member of the share's conversation. `all` is for the sharer only. The server forwards `{ t: 'inkClear', shareId, from, scope }` to the conversation members. Receivers drop the matching strokes, including kept ones.
  - **Turning drawing off and on:** `{ t: 'inkAllow', shareId, on }`, sharer only. It sets `drawing` (so the next link update shows it in `ShareInfo`) and also sends `inkClear all` at once (FR-016).
  - **While drawing is off:** the server drops `ink` from anyone but the sharer for that share (FR-016).
  - **Share end:** ink for a `shareId` that is not running is dropped (FR-013). Clients drop all strokes of a share when it leaves `conversation.shares`.
  - **Join:** a member who joins only receives messages sent after they joined. Nothing is replayed (US3 AC3, FR-012).
- **Rationale:** keeping no stroke on the server is the simplest way to meet "never stored or replayed". The one stored bit (`drawing`) rides on 006's `ShareInfo`, which is already scoped to members.
- **Alternatives:** the server keeping recent strokes so joiners see them (that is replay, which the spec excludes).

## R8. Keep (P3)

- **Decision:** a `keep: true` flag on a stroke's messages. Receivers don't fade it. It goes on `inkClear` (`mine` from its drawer, or `all`), on drawing being turned off, or on the share ending. The keep toggle sits next to the pen, and is off by default.
- **Rationale:** it needs no server state, and the existing clear paths remove kept strokes.

## R9. The sharer draws on their own share

- **Decision:**
  - The 006 banner's self-preview gets an **Open** button. It shows your own share in the stage's large view, drawn from your own capture (`media.localScreen()`), with the same overlay and pen.
  - `stagePlan` gains an input `selfLarge: boolean`. When it is true, your own share is `large` and the others' shares become thumbnails.
  - Closing it (or pressing Esc) goes back to 006 behavior. Your own share is never large by default (006 FR-015 still holds unless you ask for it).
- **Rationale:** FR-017 asks for exactly this, and it is the stated deviation from Slack (R1). Watching your own capture doesn't loop back through the network.
- **Alternatives:** a floating Picture-in-Picture window over the desktop (`documentPictureInPicture`, Chromium only). It is closer to Slack's overlay and could be added later as an option.

## R10. Input and both views

- **Decision:**
  - Pen: a toggle button on the stage bar. There is no letter shortcut: the obvious ones (D for draw, P for pen) are already movement or are likely to clash, and 006 also kept sharing off the keyboard.
  - While the pen is on, movement keys are ignored (the `typingInField`-style guard extended to "drawing"), so a drawer doesn't walk out of the conversation by accident.
  - Esc turns the pen off.
  - Touch and stylus use Pointer Events with `touch-action: none` on the overlay. Pressure is ignored.
  - In first person, a pointer-down on the stage already releases pointer lock (006).
  - **One pointer at a time (found in review):** the layer remembers the `pointerId` that started a stroke and ignores `pointerdown`, `pointermove` and `pointerup` from any other pointer until it lifts. Without it a second finger interleaved its points into the first finger's stroke, and lifting either finger ended it.
- **Rationale:** FR-001, FR-006, FR-019, and the spec's edge cases on touch and first person.

## R11. Testing approach

- **Pure, unit (Vitest), in `shared/ink.ts` and `src/inkModel.ts`:**
  - `validateInk`: ranges, point count, ids, and `end`/`keep` booleans;
  - `thin`: drops points closer than the threshold and keeps the first and last;
  - `assignInkSlots`;
  - `strokeAlpha(now, endedAt, keep)` for the fade;
  - `contentBox(elW, elH, vidW, vidH)` for the letterbox mapping;
  - `InkStore`: adding batches by `(from, strokeId, seq)` in order and with gaps, clearing by scope, and dropping a share's strokes.
- **Server, integration (ws):**
  - ink reaches every member of the share's conversation except its sender;
  - none reaches an outsider at a room wall, someone outside a locked desk, or an ambient pod neighbour (FR-014);
  - ink from a non-member is dropped;
  - ink for an ended or unknown share is dropped;
  - while drawing is off, ink from viewers is dropped and the sharer's still goes through;
  - `inkClear all` from a non-sharer is ignored;
  - the rate limit replies `inkSlow`;
  - `ConversationInfo.ink` slots are distinct and stable when a member leaves and another joins.
- **Browser:** quickstart scenarios with the Chrome driver and three or four windows. Latency is measured as the time from the drawer's local point to the watcher's canvas draw, logged via `performance.now()` against a shared clock offset.

## R12. Dependencies

- **Decision:** none new. Pointer Events, Canvas 2D and the existing `ws` server (Constitution V).
