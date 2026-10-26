# Validation log: Desk presence

## Baseline (T001)

Before any change: `npm run typecheck` clean; `npm test` 63 files, 517 tests pass.

## Q1. The highlight (T011)

Isolated server, headless Chrome, built client.
- Top-down: claiming a desk and pressing **G** puts the avatar on the seat; the whole desk space (seat, desk top, ring) gets a strong warm fill with an edge, and the "Your desk" pill shows. Walking north out of the space removes both at once (the pill element is hidden).
- While not in the space, your own desk keeps the faint tint, as before (seen after walking just off it).
- Walking onto an unclaimed desk's space shows the cooler blue fill and edge, and **no** "Your desk" pill.
- First person (**V**) on the desk: the "Your desk" pill shows; the floor is untouched (by decision).
- Not checked: the highlight on a turned desk (its outline is covered by `tests/unit/outline-edges.test.ts`).

## Q2 and Q4. The video view and privacy (T016)

Isolated server, headless Chrome (built client), plus a scripted second member over the WebSocket where a second person was needed.
- Alone: the panel is closed on arrival and when 0.5 s have passed; at 1.5 s it is open, headed "Your desk", with one tile ("Fay (you)") and Mic / Cam buttons. The buttons and the toolbar buttons both read off. Nothing was turned on.
- Walking off to the north: the panel closed on its own within about 0.3 s of the key being released (the avatar was still leaving the space; the close delay is 0.6 s).
- Stepping briefly into the space and out again (about 0.4 s inside): the "Your desk" pill showed while inside, the panel never opened (SC-006).
- Locking the desk and inviting the second member from the Desk card, then that member stepping into the space: the panel showed "Your desk · 2" with both tiles; when they left it went back to the one-tile desk view with no duplicate tile.
- Unlocked desk with a second member standing in the space: the server links them only as `ambient` (faint overhearing, as it always did), so the panel stays the one-tile desk view. This is the intended behaviour (spec edge case "Ambient pods").
- Once the view is open the "Your desk" pill hides (the heading says it).
- `tests/integration/desk-presence-privacy.test.ts` passes: walking onto the seat and ring adds no links, signalling, chat or notices, the message kinds are the same as walking elsewhere, and a locked desk still stops an uninvited member.
- **Not checked:** turning the camera on from the tile. Headless Chrome has no camera, and clicking Cam did nothing visible (the toolbar button behaves the same there); the tile button calls the same `toggleDevice` handler. B's browser showing no camera or microphone indicator for A was not looked at; the server sends no media message for A in the privacy test.

## Q3. The setting (T019)

Isolated server, headless Chrome. On by default: panel open on the desk. In the Desk card the checkbox "Open the video view when I'm at my desk" is checked; switching it off closes the panel at once and stores `shyft.deskView = "off"`. Walking off and back with it off: the "Your desk" pill shows (highlight still works) and the panel does not open. After a page reload the setting is still off (checkbox unchecked, stored value `off`); switching it on again opens the view straight away because the member has already stayed.
`tests/unit/desk-setting.test.ts` covers storage that is missing or throws (treated as on).
The pure read/write functions live in `shared/desk-presence.ts` (taking a storage object) rather than in `src/desk-presence.ts` as the task said, so the unit test needs no browser or DOM modules; `src/desk-presence.ts` wraps them over `localStorage`.

## Q0, Q5 and the final gate (T021, T022)

- `npm run typecheck` clean; `npm test`: 69 files, 551 tests pass (517 before; the existing suite is unchanged and still passes); `npm run build` succeeds.
- Q5: first person on the desk with the video view open, turning for 5 s, 60.0 fps at device pixel ratio 1 and 2 in headless Chrome (the display's cap). First person draws no highlight, so this is unchanged from before.
- Q1 step 5 (a turned desk's outline) is covered by `outline-edges.test.ts` and not looked at in a browser. Q1 step 6 (five people recognising the highlight, SC-001) is a manual measure and was not run. Turning the camera on from the tile and the other member's browser showing no media indicator are noted under Q2/Q4. Everything else in Q0–Q5 was run in a real browser or by the tests named above.

## Desk space changed to a 3×3 block (2026-10-26, on request)

The owner found the old ring-shaped desk space odd. `deriveDesks` in `shared/world.ts` now makes every desk space a 3×3 block: the 3-tile desk, the chair in the middle of the next row, and the row of floor behind the chair (a 2-wide or thicker desk gets the smallest block of at least 3×3 that holds it and its seat). Tiles that are blocked or outside the pod are left out, and a tile two desks both reach goes to the nearer seat as before. `tests/unit/desk-space-3x3.test.ts` covers all 12 desks of the default office (nine tiles each, no shared tile), a turned desk, and a blocked corner. The whole suite still passes unchanged, including the desk privacy tests (the floor between two neighbouring desks now belongs to neither).

## Meeting room view (2026-10-26, on request)

In headless Chrome: alone in the lobby nothing shows; at my desk the panel shows "Your desk"; walking north into Meeting Room A alone shows the panel headed "Meeting Room A" with my tile and the Mic and Cam buttons straight away; walking back out returns to the desk view. `tests/unit/desk-dwell.test.ts` (no-wait variant) and `tests/unit/desk-panel.test.ts` (room, and precedence) cover the rules. Not checked: a second person joining while I am alone in the room (that is an ordinary conversation, as before).

## The view at any desk (2026-10-26, on request)

`DeskDwell` no longer requires the desk to be yours; the panel title comes from `deskTitle` ("Your desk", "<Owner>'s desk", "Free desk"). `tests/unit/desk-dwell.test.ts` and `tests/unit/desk-panel.test.ts` were updated to match (any desk, guests included, a direct move between desks restarts the wait).

## Convergence (T023–T025)

- T023: `tests/integration/desk-space-3x3-privacy.test.ts` passes: the corners behind the chair, (5,11) and (7,11) of `desk-5-13`, belong to the desk, and a locked desk turns an uninvited member away there; the gap tile (8,12) belongs to no desk, and a member standing there gets none of the desk's chat, signalling or links. Plan and spec assumptions now say the desk-space shape is a shared rule the server uses.
- T024: the contract and quickstart cover the meeting-room view, the desk titles and the precedence.
- T025, the top bar (quickstart Q6), checked in headless Chrome: at 1400 px the area name ("Lobby") is fully visible with two separate pills at the right; hovering Status opened the panel and moving away closed it; mic and camera show as red slashed icons when off; Build floats at the bottom right; at 1000 px the pills stack and the name stays visible; in 3D they sit below the minimap. Not checked: the pin-on-click and the "on" (filled) icon state in a browser, since headless Chrome has no microphone or camera to turn on.
