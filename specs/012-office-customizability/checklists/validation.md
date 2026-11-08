# Validation: Office Customizability

What was checked, how, and what still needs a person. Written after the implementation (tasks T001–T061 and T062–T066).

## Automated

- `npm run typecheck` and `npm test`: clean. The suite covers the finishes, paint keys, themes, contrast and daylight rules,
  paint storage, merge and clashes, `paintAt`/`styleAt` precedence, room kits, desk looks, seasonal layers, the light tint, and
  the WebSocket flows for publishing paint and themes, desk looks (saved, shown, refused, rate limited, restart, move, delete)
  and the season and clock in the welcome.
- **Warm Studio equals today's art** (FR-002, SC-008): `tests/unit/warm-studio.test.ts` pins pixel hashes recorded from the original
  floor, wall and ceiling code before any art file was changed (39 hashes: four floors at three places, five walls in four
  2D states and the 3D face, the ceiling with and without a lamp). `shadeRGB` with neutral light gives exactly the pixels of `shade`
  (`tests/unit/raster.test.ts`).

## In a real browser (Chrome, driven by `tools/e2e/cdp.mjs`)

| Scenario | Result |
|---|---|
| Q2 themes: Themes tab with 8 cards and previews; picking one restyles the draft at once | Seen. Retro Arcade and Cozy Cabin both rendered in top-down and first person. |
| Q2 publish reaches a second client | Covered by `ws-theme.test.ts` (within 2 s, nothing moved, survives restart). Not checked with two real windows. |
| Q3 finishes: Floors tab with groups, search, color row, previews | Seen. Painting a published layout with paints shows the same finish in both views. |
| Q5 Customize desk: cue shows the button, panel edits a draft, preview, Save | Seen with real clicks: computer, two desk items, chair and a herringbone floor were saved and drawn at the desk. |
| Q6 seasonal and time of day (December evening, `OFFICE_FAKE_DATE`) | Seen: a garland along plain walls in top-down, and warmer first-person light with the garland on the far wall. |
| Q0 contact sheet (`npm run finishes:sheet`) | Looked at the wood, tile, carpet and wall strips: patterns are tileable and no finish is an obvious copy of another. |

## Performance (T064, R11, SC-006)

Measured in headless Chrome on the development machine: a 100×100 layout with 92 different paints, every floor tile painted and
walls painted, in the Cozy Cabin theme.

| What | Time |
|---|---|
| Compiling the world | 0.2 ms |
| 2D map layer, first build (textures made) | 62 ms |
| 2D map layer, textures cached | 15 ms |
| First-person per-cell textures rebuild | 5 ms |

The 100 ms target for a 100×100 rebuild is met. The 60 fps check with Space Station, 3 styled rooms, seasonal on and 25 bots (Q6
step 3) was **not** run.

## Not done, and why

- **Blind theme comparison (SC-002)** with five people, and the owner's review of `out/finishes.png`: need people.
- **Q1 screenshots before and after switching branches**: replaced by the pixel-hash test above.
- **Two-window runs** of Q2–Q5 end to end by hand: each step was covered by integration tests or one-window browser runs.
- **25-bot frame-rate run** (T064, Q6 step 3, SC-006) and the **full two-window quickstart** (T065): still to do by hand.

The first-person thumbnail, the dimmed overlay in build mode and the contact sheet's theme row, listed here before, were added
in T070, T071 and T077 (below). `/speckit-analyze` (T067) was run on 2026-11-08 with no critical or high findings.

## Follow-ups T068–T077 (Customize desk and previews)

Checked in headless Chrome (one member, one claimed desk): the **Customize desk** button shows in the desk view heading and on the cue; the panel's Desk and Chair choices are picture tiles with the current one marked; dragging a desk item in the top-down picture moves it (a move the server would refuse is ignored); **Turn** turns the selected thing; unsaved edits show as a dashed copy of the desk space in the office view and clear on save, reset or close; the panel closes after a saved look comes back and stays open with a message on `deskLookError`; "From your chair" shows the draft look through the office's own first-person painters; the Themes tab preview now has a chair; a room's Style dropdown has a preview; `npm run finishes:sheet` adds a block per theme (floor, wall, ceiling). In build mode, a claimed desk with a look is drawn over the builder's version at 40% opacity. Not checked by eye: build-mode dimmed overlay and the room Style preview (typechecked and built only); real mouse drag (pointer events were synthesized).
