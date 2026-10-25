# Validation log: Office Builder and 3D Furniture

Real-browser checks run with headless Google Chrome (DPR 1, 1280×800), driven over the DevTools protocol by `tools/e2e/cdp.mjs`, against a separate test server (port 3101, its own temporary data folder) so the dev server's saved office was never touched. Screenshots are in `../screenshots/`.

## US1: builder (quickstart Q1, Q3, Q4)

| Check | Result |
|---|---|
| Admin and member each get a Build button; `B` opens the panel, the grid overlay and the camera moves with WASD | Pass |
| Paint carpet across 5 tiles, two wall segments with a gap, drag a sofa 2 tiles | Pass: the saved draft differs from the published office by 5 floor tiles, 6 wall tiles and the sofa position |
| Four Ctrl+Z, then four Shift+Ctrl+Z (also pressed rapidly) | Pass: back to the published office, then back to the edited draft, each step one stroke |
| A second browser sees nothing until publish | Pass: no `layout` message before publish |
| Reload the builder's page | Pass: the saved draft comes back identical (the harness first read a stale session token, which looked like a failure; fixed in the harness, not the app) |
| Publish | Pass: the other browser gets `layout` 56 ms later, shows the new carpet, walls and sofa, and the notice "Ana updated the office" |
| Two builders, disjoint edits from the same revision | Pass: the second publish (older base) merges, both edits are live (rev 7 → 8) |
| Two builders move the same plant differently | Pass: the second publish answers 409; the panel lists `plant-16-20` with Keep mine / Keep theirs, both positions shown in amber on the map, Publish merged stays disabled until a side is chosen; after Keep mine the plant is where the second builder put it |
| Admin switches building off | Pass: the member is dropped out of build mode with "An admin turned building off. Your draft is saved.", the Build button disappears, the API answers 403; the admin keeps building; after switching on again the member's draft is still there |
| Console errors in any page | None |

Found and fixed while checking: the builder's swatch buttons took the join screen's `.swatch` colour-chip style (24 px circles), so catalog pictures overlapped the tools row; the builder classes are now `.pick` / `.picks`, and the panel's children no longer shrink.

Not covered by a real-browser step: someone standing where a wall appears being moved (covered by `tests/integration/publish-effects.test.ts`), and the restart check (also an integration test).

## US2: meeting rooms and desk pods (quickstart Q2)

Real Chrome with the builder, plus four scripted players on the WebSocket (screenshots `q2-*.png`).

| Check | Result |
|---|---|
| Rooms tab lists the ready-made pod and meeting room, the three "mark out your own" buttons, and every room and pod in the office | Pass |
| Place **Meeting room (6 people)** over the lobby and **Desk pod (4 desks)** in the open office, publish | Pass: the room (walls with a doorway, carpet, table, six chairs, plant) is drawn at its place; the published layout has a private room `[[17,18,22,22]]` and a pod `[[18,2,24,7]]`; rooms and pods are tinted and named in build mode |
| Two players walk into the new room, one stays outside | Pass: the two are in a conversation with context `area:room-…`; the one outside has no links |
| A player claims a desk in the new pod | Pass: the snapshot shows the claim and the new pod |
| Console errors | None |

Covered by tests rather than by clicking: claims follow a moved desk, including into another pod, and are released with a notice when the desk or chair goes (`office-reconcile`, `publish-desks`); shrinking a room removes the people now outside it from its conversation, chat and call setup (`publish-privacy`).

Found while building this: a private room placed inside the open office was blocked by the "rooms overlap" check. The rule is now that a private room may sit inside an open area (private rooms win for the tiles they cover) while two private rooms, or two open areas, may not overlap.

Not done by hand: moving a claimed desk into another pod with the mouse, and the spawn tool (the spawn tool and the two integration cases are covered by `builder-tools` and `publish-effects`).

## US3: solid furniture in first person (quickstart Q5)

Real Chrome, DPR 1 and 2 (screenshots `q5-*.png`).

| Check | Result |
|---|---|
| Furniture is drawn as solid boxes with depth: desks (top, side panels, monitor with a lit screen, keyboard), chairs (seat, back, base), tables, plants (pot and three leaf tiers), sofas (base, cushion, back, arms) | Pass: seen close up and from the side in `q5-0` … `q5-6`; each piece shows different faces from different sides and none turns with the camera |
| Furniture hides people behind it and people in front hide furniture (per-pixel depth) | Pass: a person billboard in front of the sofas and plants covers them, and the desk owner's name label is hidden behind walls but not behind its own desk (`q5-2-along-the-pod`) |
| 2D and first person face the same way | Pass: desks, chairs and sofas turned in the builder are drawn turned in 2D (`q5-8-turned-in-2d`: a desk turned a quarter, a sofa turned a half, side chairs in the meeting rooms now face their table), and the box models use the same `rot` |
| Frame rate with the default office plus 60 extra tables, sofas and plants in the aisles | Pass: 60 fps at both pixel ratios, standing at the spawn and after walking into the lobby grid (this is the display's limit; headless Chrome caps at 60) |
| Console errors | None |

Notes:
- The 2D side chairs in the two meeting rooms used to be drawn facing south whatever stood beside them; they now turn to face the table, which is a small visible change from the old office.
- The "preview the draft in first person" idea from the research (R9) was not built: while building, `V` says to publish first. First person always shows the published office.

## US4: custom furniture and object art (quickstart Q6)

Real Chrome; a two-frame vending machine painted with `pngjs` (`npm run objects:check` says OK), uploaded through the builder with its settings file (screenshots `q6-*.png`).

| Check | Result |
|---|---|
| `objects:template` writes a guide sheet and its settings; `objects:check` accepts a sheet that follows the format | Pass |
| Upload a 33×64 picture | Pass: refused before it is sent, with "With these settings the picture must be 32 × 160 pixels."; nothing reaches the server |
| Upload the real sheet, choosing its settings file to fill the form | Pass: the form fills in from the file, the object appears under Custom with a picture of its top view |
| Place two copies and turn one a quarter, publish | Pass: the top-down view shows the top view of the sheet, turned with the object |
| In first person | Pass: a solid box of its footprint and height, the front drawing facing the way it was turned, the east and west faces showing the side drawing (mirrored on the west), the black outline from the sheet intact; it never turns with the camera (`q6-3`, `q6-4`) |
| Console errors | None |

The animation (frame by clock, 2 per second here) is covered by the code path that picks the frame for both views; a still screenshot cannot show it, and the two frames of this sheet differ only in the glow of the drinks window.

Covered by integration tests: upload accepted, told to everyone, served; refused for wrong size, a bad description and a non-PNG; guests refused; 11th upload in a minute refused; 101st object refused; kept across a restart while a damaged file is skipped; removal reports the placed copies and, once confirmed, publishes a revision without them.

## Closing the two open items of feature 002

| Item | Result |
|---|---|
| T043: the first-person desk pictures had hard-coded colours | The pictures are gone: furniture in first person is built from box models and `makeMaterials`, which paints from the shared palette (`specs/002-hd-office-polish/tasks.md`) |
| T044: the private-room spotlight and label after the zoom change | Checked in Chrome (`q7-private-room-spotlight.png`): the room is lit with its dashed outline, the rest dimmed, and the label "Meeting Room A · 1 here" sits at the top |

## Q0: the upgrade (`tests/integration/ws-upgrade.test.ts`)

A saved version 2 office with two desk claims, a cubicle pod and a room allow-list is started on the new server: the state file becomes version 3 straight away with both claims under their desk names (`desk-5-13`, `desk-33-14`), the pod mode and allow-list kept, `layout.json` holds the old office as revision 1 (identical to the built-in layout), the holders see their desks in the welcome message, and nobody is told they lost a desk. The developer's own server (`npm run dev`) did the same upgrade when it restarted on the new code: its file had no claims at the time, so there was nothing to carry.

## Final gate (T064)

| Gate | Result |
|---|---|
| `npm run typecheck` | Clean |
| `npm test` | 36 files, 317 tests pass (176 before this feature) |
| `npm run build` | Built |
| `npm run objects:check objects/template-example.png` | OK |
| Quickstart Q0–Q6 | Q0 by the upgrade test above; Q1, Q3, Q4 (US1), Q2 (US2), Q5 (US3), Q6 (US4) in real Chrome, with screenshots, as logged above |

Speed (SC-005): 60 fps in first person with 12 desks, the meeting rooms and 60 extra pieces, at pixel ratio 1 and 2.
Publish speed (SC-002): the other browser was told 56 ms after the publish click on a local network.

Not checked: SC-001 (a first-time builder adds a four-person meeting room in under five minutes, which needs people), the restart check by hand (an integration test covers it), and the first-person preview of a draft (not built).
