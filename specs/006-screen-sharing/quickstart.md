# Quickstart: Screen Sharing

**Prerequisites:**
- `npm install`.
- A test server on its own port and data folder (as in features 003–005: `npm run build`, then `startServer({ port: 3101, dataDir: <temp>, adminToken: 'letmein' })`), or simply `npm run dev`.
- Chrome for the driver (`tools/e2e/cdp.mjs`). For unattended runs, launch Chrome with `--use-fake-ui-for-media-stream --auto-select-desktop-capture-source="Shyft share target"`. Open a local page titled "Shyft share target" with 14 px text and a scrolling area, so the picker is skipped.
- Windows A, B and C, each a member.

Contracts: [protocol](contracts/protocol.md), [UI behavior](contracts/ui-behavior.md). Data shapes: [data-model](data-model.md).

## Q0. Nothing else changed (SC-008)

1. `npm test` and `npm run typecheck`.
2. **Expect:** all pass, including every existing link, privacy and video-cap test.

## Q1. Share and stop (US1, SC-001, SC-002)

1. Put A and B next to each other on the open floor. A conversation opens.
2. In A press **Share screen** and pick the share target window.
3. **Expect:**
   - B sees it in the large view within 3 s;
   - A sees "You are sharing", a small self-preview and **Stop sharing**;
   - voices and camera tiles still work;
   - in B, `getStats` for the screen receiver shows `frameWidth` ≥ 1280, and the 14 px text is readable in a 1440×900 window.
4. A presses **Stop sharing**. **Expect:** B's large view closes within 2 s.
5. Share again and stop it with Chrome's own "Stop sharing" bar. **Expect:** the same result.
6. Press **Share screen** and cancel the picker. **Expect:** nothing shown to anyone, and no error.

## Q2. Only the conversation sees it (US2, SC-004, Constitution III)

1. A and B in Meeting Room A. A shares. C stands just outside the room's wall.
2. **Expect:** C's `links` messages have no `shares`. C's browser has no peer connection to A or B. C sees nothing.
3. C knocks and B admits C. **Expect:** C sees A's share within 3 s.
4. B walks out of the room. **Expect:** B's large view closes within 2 s.
5. A walks out of the room. **Expect:** the share ends for everyone, and A sees "Screen sharing stopped because you left the conversation."
6. Ambient pod: A and B sit at neighbouring desks in an ambient pod, more than 3 tiles apart (they only overhear). A shares. **Expect:** B sees no share and B's `links` has no `shares`.
7. A turns on Do Not Disturb while sharing. **Expect:** the share ends, with the DND notice.
8. Automated equivalents: `tests/integration/ws-share-privacy.test.ts`, `ws-share-lifecycle.test.ts`.

## Q3. Several shares (US3)

1. A, B and C in one conversation. A shares, then B shares.
2. **Expect:** C sees B's share large and A's as a labelled thumbnail. C clicks A's thumbnail and A's is large. B still sees A's large (B's own share is only a self-preview).
3. C presses full window. **Expect:** the share fills the window, and Esc returns.
4. C shares too. Then a fourth member D joins and presses Share screen. **Expect:** D is told sharing is full.
5. A stops. **Expect:** in C, the most recent remaining share moves to the large view.

## Q4. Smooth and voice first (SC-003, SC-005, SC-007)

1. A shares the target window and scrolls it continuously. In B, read `framesPerSecond` for the screen receiver over 10 s. **Expect:** ≥ 15 on average, and no gap longer than 1 s.
2. Throttle A's upload in DevTools (Network → custom profile, 1.5 Mbps up) while A talks and scrolls. **Expect:** B still hears A clearly, and the share drops frame rate or sharpness first.
3. With the share running, check the FPS overlay in A and B in 2D and first person. **Expect:** about 60 fps.

## Q5. Shared sound (US4)

1. In Chrome, A shares a tab playing a video, with "Also share tab audio" ticked.
2. **Expect:** B hears the video and A's voice. B mutes the shared sound and still hears A talk.
3. A shares a window instead. **Expect:** B sees no sound control.
4. On the open floor, B steps back to the edge of talking range. **Expect:** A's voice fades and the shared sound does not.

## Q6. Views and edges

1. While A shares, A and B press **Tab** to switch to first person and back. **Expect:** the share and banner stay, with no reconnect.
2. A, alone at a desk (desk view open), shares. **Expect:** "No one else is here yet". B is invited and steps in, and B sees the share.
3. Open the app on `http://<lan-ip>:5173` (not localhost). **Expect:** Share screen is disabled, with the secure-address reason.
4. A shares the office tab itself. **Expect:** it works (a mirror effect), with no error.
