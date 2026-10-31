# Validation: Screen Sharing

## Baseline (T001)

- `npm run typecheck`: clean
- `npm test`: 566 tests in 73 files, all passing

## Final gate (T034)

- `npm run typecheck`: clean. `npm test`: 81 files, 614 tests pass (566 in 73 files at the start; +48 tests in 8 new files, and the existing suite is unchanged except the oversized-call-setup test, see below). `npm run build` succeeds.

## Browser checks (T035, T036)

Isolated server on port 3101, headless Chrome 2D and first person, the built client, real `RTCPeerConnection`s between tabs. The screen was a 1920×1080 canvas with 14 px text, scrolling, captured with `captureStream(30)` and returned from a stubbed `getDisplayMedia` (headless Chrome has no picker). The picker, the browser's own Stop bar and tab audio were therefore **not** exercised.

- **Q1 share and stop:** A pressed Share screen; B's large view had a picture 413 ms later (SC-001 ≤ 3 s). A showed "You are sharing", a self-preview and Stop sharing. B read 1920×1080 at 30 fps over 8 s (SC-002, SC-003; the sender reported VP9, 30 fps, no quality limit). Stop sharing from the panel closed B's view within one round trip, and the banner went away. **Not run:** the browser's Stop bar, and cancelling the picker (covered by the `cancelled` path in code only).
- **Q2 privacy:** `tests/integration/ws-share-privacy.test.ts` (outsider at a room's wall, locked desk, ambient pod neighbour, join, leave, sharer leaving, Do Not Disturb, `rtc` relay). Not repeated in three browsers.
- **Q3 several shares:** four tabs at one spot. A then B shared; C saw B large and A as a labelled thumbnail with a screen mark on both tiles; clicking A's thumbnail made it large (1280 wide) and B a thumbnail; the third share from C made D's button read "Unavailable" with "Sharing is full here (3 people are sharing)"; after A stopped, D's button returned to Share screen and C (who had picked A) fell back to B. **Not run:** the Full window button (it calls `requestFullscreen`; headless Chrome does not show it).
- **Q4 frame rate:** B's frame rate with the share running was 60.2 fps in 2D and in first person, on both the viewer and the sharer (60.2 fps before the share, at the headless cap). SC-007 holds. **Not run:** the throttled-upload voice-first check (SC-005).
- **Q5 sound:** not run (needs a real tab with audio). The code path is in place (`attachScreenAudio`, no distance gain), and the controls only show when `audio` is true.
- **Q6:** switching 2D ↔ first person kept the stage and banner (Q6.1). Q6.2 (alone at a desk) is covered by the server's place rule test; Q6.3 (insecure address) and Q6.4 (sharing the office tab) were not run.

## Things found on the way

- **Call setup was too big for the server's limit.** With four media slots one Chrome offer is about 15.5 KB, and about 26 KB when both sides offer at once. The server dropped anything over 16 KB, so the second offer was lost and the screen never arrived. The limit is now 48 KB (the socket's own limit is 64 KB). The oversized-frame test now sends 50 KB.
- **Chrome does not reuse the slots we add when it answers an offer.** Each side ends up with its own four sending slots plus four new receiving ones. So a received track is matched to a screen slot by its place among the receiving transceivers (voice, camera, screen video, screen audio), not by identity (`slotOf` in `src/media.ts`). The polite side also waits up to 1.5 s for the other side's first offer, which avoids a rolled-back offer in the usual case.
- The panel was taller than a 900 px window with the stage open; the stage's height is now `clamp(160px, 70vh − 170px, 540px)` and the panel scrolls if it still does not fit. The top bar sits above the panel (z-index), so it is not covered in first person.
- `tools/e2e/cdp.mjs` `launch()` takes an optional `args` list for extra Chrome flags.

## Phase 8 (convergence) results

- **T038 settings on a late viewer (Chrome, headless, isolated server on port 3107):** Ann shared; Bob was already there, Cy and Di joined while the share ran. After a few seconds all three senders on Ann's screen slot reported `maxBitrate` 2 000 000 (6 Mbps ÷ 3 viewers), `maxFramerate` 30 and priority `low`, and her voice sender priority `high`. The settings are now also re-applied once a link first reaches `connected`, and a refused `setParameters` retries with only `maxBitrate` and `maxFramerate`. Only Chrome was checked.
- **T039 connect time with the 1.5 s polite wait (Chrome, headless):** from pressing Join (page already loaded) to every call `connected`: 221 ms when the joiner's id sorts after the existing player's (the existing player is polite), 74 ms when the joiner is polite ("10" joining "9"), 81 ms for the next joiner. The wait never came into play, because the impolite side offers at once. Microphone and camera were off, so this is the time to a connected call, not to the first audio or video frame. Well inside the 2 s rule.
- **T040 Firefox and Safari: not run.** Neither browser is driven by `tools/e2e/cdp.mjs`. `slotOf` and the polite-side wait are still only checked in Chrome.
- **T041 headed Chrome with the real picker: not run.** Still open: the browser's Stop bar (Q1.5), cancelling the picker (Q1.6), Full window and Esc (Q3.3), tab sound (Q5), the throttled-upload voice check (Q4.2), the insecure-address message (Q6.3) and sharing the office tab (Q6.4).
- **T042:** the client now counts the Stops it sent and treats the matching `shareState { on: false, reason: 'stopped' }` as an answer only, so pressing Stop and then Share screen again no longer lets the old reply end the new share.
- **T043:** the server refuses a new share that the place rule would end at once (alone on the open floor, away from a desk) with `shareState { on: false, reason: 'left' }`; covered in `ws-share-lifecycle.test.ts`.
- **T044:** see research.md R3a.
