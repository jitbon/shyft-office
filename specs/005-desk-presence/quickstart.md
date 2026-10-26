# Quickstart: Desk Presence

Prerequisites: `npm install`; a test server on its own port and data folder (as in features 003 and 004: `startServer({ port: 3101, dataDir: <temp>, adminToken: 'letmein', ... })` and `npm run build` first); Chrome for the driver (`tools/e2e/cdp.mjs`). Two browser windows A and B, each a member (not a guest).

## Q0. Nothing else changed

1. `npm test` and `npm run typecheck`.
2. **Expect:** all pass, including every existing desk and privacy test.

## Q1. The highlight (US1, SC-001, SC-002)

1. In A claim a desk. Walk onto its seat, then off.
2. **Expect (top-down):** on the desk space a bright fill and an edge around the whole space (a ring plus seat and desk), and "Your desk"; they appear and go within half a second of crossing the edge. Off the desk only the faint tint remains.
3. Press **Tab** to first person and walk on and off. **Expect:** the "Your desk" cue shows and goes; the floor is not tinted or edged.
4. Walk onto an unclaimed desk space. **Expect:** the same fill and edge in the cooler color, no "Your desk".
5. Turn a desk (build mode, then publish) and repeat. **Expect:** the edge follows the turned shape.
6. Optional, manual (SC-001): ask five people who have not seen the feature to walk onto their desk and say what they notice. **Expect:** at least four say, within 5 seconds, that something marked it as theirs.

## Q2. The video view (US2, SC-003, SC-004, SC-006)

1. Alone in A, walk onto your own desk and stay. **Expect:** after about a second the panel opens headed "Your desk" with one tile, you, and mic and camera buttons. Mic and camera are still off.
2. Turn the camera on from the tile. **Expect:** your picture shows; the toolbar button agrees.
3. Walk off. **Expect:** it closes within a second (about 0.6 s).
4. Walk across the desk without stopping. **Expect:** no panel at all.
5. Invite B to your desk and have B step in. **Expect:** both see both tiles and can talk.
6. In B (not invited, desk locked): **Expect:** B is stopped at the edge and sees no tile of A's desk.
7. Walk from your desk into a conversation. **Expect:** the panel changes to the conversation with no duplicate tile.

## Q2b. Any desk, and meeting rooms (amendments)

1. Walk onto a desk that is not yours (a free one) and stay. **Expect:** after about a second the panel opens headed "Free desk"; on someone else's desk it says "<Owner>'s desk".
2. Walk alone into a meeting room. **Expect:** the panel opens at once headed with the room's name; walking out closes it within a second.
3. Stand in a meeting room while a desk view is due (or with someone else). **Expect:** a conversation wins, then a desk, then the room.

## Q3. The setting (US3)

1. Open the Desk card, switch the setting off. Walk onto your desk. **Expect:** the highlight shows; the panel does not open.
2. Reload. **Expect:** it is still off. Switch on, walk off and on again: it opens.

## Q4. Privacy (SC-004, SC-005)

1. `tests/integration/desk-presence-privacy.test.ts` passes: stepping onto a desk produces no new links, no signalling and no chat for anyone.
2. In A at the desk with the view open and everything off, check B's browser: no camera or microphone indicator for A.

## Q5. Speed

1. First person at DPR 1 and 2 standing on the desk, turning for 5 s. **Expect:** at least 50 fps (first person draws no highlight, so this should match today).

## Q6. The top bar (amendment)

1. At 1400 px wide: the area name in the middle of the top is fully visible; at the top right there are two separate pills, actions (mic and camera icons, Desk, Character, Status, Admin for admins) and 2D | 3D.
2. Hover **Status**. **Expect:** the panel opens; moving away closes it; clicking pins it open, clicking again closes it.
3. Mic and camera: **expect** filled icons when on, muted red with a slash when off; the same icons on your own tile in the strip.
4. **Build** is a floating button at the bottom right, hidden while building.
5. At 1000 px wide the two pills stack on the right and the area name stays visible. In 3D the pills sit below the minimap.
