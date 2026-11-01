# Quickstart: Drawing on a Screen Share

**Prerequisites:**
- The same setup as [006's quickstart](../006-screen-sharing/quickstart.md): `npm run build`, a test server on its own port and data folder, and the Chrome driver (`tools/e2e/cdp.mjs`).
- A share target window with text, and the stubbed or fake capture used in 006's browser checks.
- Windows A (sharer), B, C and D, each a member.

Contracts: [protocol](contracts/protocol.md), [UI behavior](contracts/ui-behavior.md). Data shapes: [data-model](data-model.md).

## Q0. Nothing else changed (SC-008)

1. Run `npm test` and `npm run typecheck`.
2. **Expect:** all pass, including every 006 share test and every privacy test.

## Q1. Draw and see it (US1, SC-001, SC-002)

1. A shares, and B watches.
2. B turns the pen on and circles a word near the middle and one near a corner.
3. **Expect:**
   - B sees the line under the pointer at once;
   - A's own view (press **Open** in the banner) and C's view show the circles around the same words, in B's color, within 0.5 s. Log send-to-draw times;
   - with C in full window and B in a 1280×800 window, the circles land on the same words (compare positions as a fraction of the picture; they're within 1 %).
4. Wait. **Expect:** the circles stay about 3 s after the pen lifts, then fade over about 1 s.
5. With the pen off, click the picture and a thumbnail. **Expect:** nothing is drawn, and the thumbnail swaps the share as in 006.

## Q2. Several at once (US2, SC-003, SC-004)

1. B, C and D draw continuously for 30 s, scribbling fast.
2. **Expect:**
   - every window shows three lines in three distinct colors, each with a name tag at its tip;
   - the lines are smooth curves;
   - no stroke is missing (compare the strokes each drawer sent with those each viewer received, in the logs).
3. During step 1, read the share's `framesPerSecond` in a viewer (≥ 15, as in 006) and the office FPS overlay (about 60).
4. Have C leave and E join. **Expect:** B, D and E keep distinct colors. B and D keep theirs.

## Q3. Privacy (US3, SC-005)

1. A and B in Meeting Room A. A shares and B draws. C stands just outside the wall.
2. **Expect:** C receives no `ink` or `inkClear` frames (check C's WebSocket frames).
3. From C's console, send an `ink` for A's `shareId`. **Expect:** no one receives it.
4. C is admitted. **Expect:** C sees B's next stroke, and nothing drawn earlier.
5. A stops sharing. **Expect:** all ink disappears everywhere. An `ink` sent afterwards for that share is dropped.
6. **Automated:** `tests/integration/ws-ink-privacy.test.ts` (room wall, locked desk, ambient pod, non-member, ended share).

## Q4. Sharer control (US4, SC-006)

1. B and C draw. A presses **Clear all**. **Expect:** all lines go for everyone within 0.5 s.
2. B draws, then presses **Clear mine**. **Expect:** only B's lines go.
3. A turns off **Let others draw**. **Expect:** B's and C's lines vanish, their pens show "Ann turned drawing off", and an `ink` sent from B's console reaches no one. A can still draw.
4. A turns it back on. **Expect:** B can draw again at once.

## Q5. Keep (US5)

1. B turns on **Keep** and circles a word. Wait 6 s. **Expect:** it is still there for everyone.
2. A resizes the shared window. **Expect:** the circle stays at the same relative place.
3. B presses **Clear mine**. **Expect:** it goes.

## Q6. Edges

1. In first person, B draws. **Expect:** it works the same, and pointer lock is released.
2. B drags from the picture out past its edge and back. **Expect:** only the parts on the picture are drawn.
3. B scribbles as fast as possible for 5 s. **Expect:** no "Slow down" for honest drawing. A script sending 100 messages a second gets `inkSlow`, and others receive at most 40 a second from it.
4. While B's pen is on, press W. **Expect:** B's avatar doesn't move.
