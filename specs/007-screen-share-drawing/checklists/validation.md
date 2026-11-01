# Validation: Drawing on a Screen Share

## Baseline (before 007)

`npm run typecheck` clean. `npm test`: 616 tests in 81 files.

## Final gate

`npm run typecheck` clean. `npm test`: 679 tests in 89 files (616 in 81 at the baseline).

## Browser checks (headless Chrome, isolated server, built client)

The screen was a stubbed 1920×1080 canvas (`getDisplayMedia` has no picker headless). Each drawer's tab was brought to the front for its own strokes, because headless Chrome does not deliver mouse input to a background tab. Drawn with `Input.dispatchMouseEvent` drags, so this is mouse input only. **Touch and stylus were not tried** (no touch screen here).

- **Q1 draw and see it (SC-001):** from Bob's pen going down to the ink message reaching Ann and Cy: 35 ms for both. Ann saw it in her **Open** view. The ink was complete on her canvas once her tab was shown.
- **Position (SC-002):** the same diagonal, measured as the ink's bounding box on each canvas, as a fraction of the picture: Ann and Bob (818 px wide) 0.197–0.802 across, 0.293–0.704 down; Cy (a 900 px window, 569 px wide) 0.195–0.803, 0.291–0.706. Within 0.3 % of the picture.
- **Q2 several drawers:** Bob and Cy drew; Ann saw two lines in two colors and Cy's name tag in green at the pen tip. Bob's tag had already gone (more than 1.5 s after his last point).
- **Q4 control (SC-006):** Bob's **Clear mine** left only Cy's line on Ann's canvas. Ann's **Clear all** emptied Cy's canvas within the 300 ms wait. When Ann turned drawing off, Bob's pen was disabled with "Ann turned drawing off" and its canvas stopped taking input.
- **Keep:** Bob's and Cy's lines stayed on Ann's canvas past the 4 s fade.
- **Q3 privacy:** `tests/integration/ws-ink-privacy.test.ts` (outsider at a room's wall, locked desk, ambient pod neighbour, a non-member sending ink, an ended share, no replay to a later joiner).
- **Fade and load (SC-003, SC-004), seven guests scribbling for 6 s at 30 messages a second, with Ann sharing (8 people in the conversation):** the frame rate was 56.9 fps in Ann's tab (the headless cap was 60.2 before). Painting the ink took 0.23 ms on average, 0.4 ms at the 95th percentile and 0.6 ms at most, against the 4 ms budget. 5.5 s after they stopped, the canvas was empty. The guests were raw sockets, so this tested the server and Ann's drawing, not seven real browsers. Voices and the share's own frame rate were not measured with drawers active.
- **Not run:** touch and stylus; Firefox and Safari; Full window with ink; first-person view with the pen; the "Slow down" note in a browser (the rate limit and `inkSlow` are covered in `ws-ink-control.test.ts`); a usability check with five people (SC-007).

## Phase 8 (convergence) results

Headless Chrome, isolated server, built client. Drawers in background tabs used synthetic pointer events, because headless Chrome does not deliver mouse input to a hidden tab.

- **T036, first person (Q6.1, Q6.4): pass.** Bob in first person with the pen on and W held for 0.9 s did not move (19.5, 24.5 before and after). With the pen off, the same hold moved him to (19.5, 23.3). His line drew in first person (1 777 ink pixels) and pointer lock was not held afterwards.
- **T036, "Slow down": pass.** Bob's own socket sent 60 ink messages in a burst while he drew. The note "Slow down" showed at once, nothing was sent for the next 0.95 s, then the line carried on as a new stroke (id 1 000 000, 49 messages) and the note hid. **Not run:** Full window. Headless Chrome does not show fullscreen, so ink placement in Full window (within 1 %) still needs a headed Chrome.
- **T037 one pointer at a time: pass with synthetic touch pointers.** Pointer 1 started a stroke, pointer 2 pressed, moved and lifted, then pointer 1 finished: the browser sent one stroke (id 1) in four messages, with `end` only on the last, and none of pointer 2's points. **Not run:** a real touch screen or tablet (none available).
- **T038 load with real tabs (SC-004, FR-009):** Ann shared; Bob, Cy, Di and Ed (real tabs, mics on) and three raw-socket guests drew for 22 s, eight people in all. Bob's screen receiver reported 29, 31, 30 and 29 frames a second at 1920×1080 (29 before drawing; 006 asks for 15 or more). Voice at Bob: jitter 0 ms, 0 packets lost out of 4 407 received. The server's link tick was 0.14 ms (peak 1.39 ms; budget 20 ms). Caveats: everything was on one machine over loopback, so jitter and loss show nothing about a real network; the four tabs' drawing was synthetic pointer events.
- **T039 Firefox and Safari: not run.** Neither is driven by `tools/e2e/cdp.mjs`. Still open with 006's T040.
- **T040 stable ink colors:** a member now keeps their slot while they stay in a conversation, across a share stopping and another starting (unit test in `links-shares.test.ts`). The slot is only sent with a conversation that has a share, as before.
