# Validation Log: Higher-Detail Office and Polished Interface

## Baseline (T001, T002) — 2026-10-25

- `npm run typecheck`: clean. `npx vitest run`: 16 files, **154 tests passing**. `vite build`: OK.
- "Before" screenshots (16-px art, 48-px tiles at the default zoom): `screenshots/before-lobby.png`, `screenshots/before-firstperson.png`.

## Phase 2 checkpoint (T009) — 2026-10-25

- `tsc` clean; 17 files / **162 tests** passing (154 baseline + 8 new in `scale.test.ts`); build OK.
- Browser, headless Chrome against an isolated test server:
  - DPR 1: default tile 64 CSS px; `=` / `-` step through 96 / 64 / 32 px; art sharp; no page errors.
  - DPR 2 (`--force-device-scale-factor=2`, 2560-px screenshots): default tile 48 CSS px, labels crisp.

## US1 art (T010–T017) — 2026-10-25

- Built-in art is painted natively at 32 px in `src/art.ts` (floors, walls, furniture, characters, 3D textures) using the shared `PALETTE` in `src/palette.ts`. The 2D map shim was removed.
- 3D desk billboards use three variants (`d`, `d:l`, `d:r`) so a 3-tile desk reads as one workstation. The 3D furniture billboards are front-elevation drawings in the same palette, not the top-down painters (the task text said "shared painters"; that cannot work across a top-down and a front view, so floors and wall faces are shared and furniture shares colours only).
- Frame rate (T017), headless Chrome on the dev Mac, 2 players, measured with `requestAnimationFrame` over 3 s (capped at 60 by the display):

  | | DPR 1 (1280×633) | DPR 2 (2560×1266) |
  |---|---|---|
  | 2D default zoom | 60.6 | 60.5 |
  | 2D zoomed out | 60.4 | 60.5 |
  | First person (`RENDER_H = 360`) | 60.4 | 60.4 |

  So `RENDER_H` stays 360 (no fallback to 300 needed). Not measured with a crowd: the load bots leave after 3 s.

## US1 quickstart Q1–Q3 (T018) — 2026-10-25

- **Q1**: at DPR 1 and 2 the art is crisp at every zoom step; characters show eyes, shaded hair and clothes; floors, walls and furniture have texture. After screenshots (DPR 1, same spots as before): `screenshots/after-lobby.png`, `after-office.png`, `after-firstperson.png`. The SC-001 "which looks more modern" survey of 5 people is still to do by hand.
- **Q2**: first person uses the same palette and the same floor and wall-face painters as 2D (`after-firstperson.png`).
- **Q3**: `npm run sprites:check sprites/robot.png` passes (16-px sheet). A scratch 32-px copy (`robot32`, validated) and the 16-px robot were worn in two browsers: both characters were the same size on screen (16-px doubled, 32-px native).

## US2 desks (T019–T030) — 2026-10-25

- New tests: `desks-layout.test.ts` (6), `store.test.ts` migration cases (5, plus 3 existing updated), `ws-desk-reset.test.ts` (3). Old desk ids updated in 5 test files. `npm test`: **176 passing**, `tsc` clean.
- Negative controls: removing the `deskReset` send fails 2 integration tests; removing the save-on-upgrade fails 2 more (1 unit, 1 integration).
- **Q5 (browser)**: `screenshots/after-desk-claimed.png` shows 12 desks in 3 pods, two facing two with a divider screen, 3-tile surfaces with the monitor in the middle and a mug / lamp / papers at the ends, plants in the 5-tile aisles; the toolbar Desk button claimed the first desk (it glows). Lock, invite, `G` (walk to desk), the cubicle pod and the desk privacy cases are covered by the integration tests on the new layout, not re-clicked by hand.
- **Q6 (browser)**: a v1 `office-state.json` holding one claim was written, the server started: the file became `"version": 2` with empty `deskClaims` and the member listed in `deskResetNotice`; joining as that member showed the notice (`screenshots/after-deskreset-notice.png`) with a "Got it" button. "Reload gives no notice" and "restart keeps new claims" are covered by `ws-desk-reset.test.ts`.

## US3 interface (T031–T037) — 2026-10-25

- `index.html` loads only Nunito (400/600/700/800); `style.css` uses tokens (`--font`, `--radius` 12, `--radius-sm` 8, pill) on every panel, button, input, notice, card and video tile. Map labels are pills (`roundRect`, with a plain-rectangle fallback), chat bubbles have rounded corners and a tail; both draw in CSS pixels at 14 px minimum (name tags) and 15 px (bubbles).
- Browser (`screenshots/after-ui.png`, `after-talking-outline.png`):
  - DevTools font check: loaded faces are all Nunito; computed `font-family` on `body` and `#chatInput` is Nunito; **0 elements** use VT323 or Press Start 2P.
  - The green talking outline follows the tile's rounded corners (6,756 outline-green pixels, all on the rounded border).
  - At 1024×640 with the status panel and call panel open: nothing overlaps or clips (checked by eye).
- Sizes: panel text 14 px, chat 15 px, small headers 12 px, secondary text 12–13 px (the VT323 text they replace was 16–20 px, which reads as roughly 12–15 px in Nunito).
- Not changed: in first-person view the call panel still sits over part of the toolbar at 1280 px wide (the toolbar moves down there to clear the minimap). That overlap predates this feature.

## Polish and final gate (T038–T042) — 2026-10-25

- `sprites:template` now defaults to 32 px (`sprites/template.png` is 128×128); `sprites/robot.png` is regenerated as a 128×128 sheet (the same robot, drawn on a 16 grid and doubled by `tools/sprite-example.ts`) and `npm run sprites:check sprites/robot.png` prints OK. `sprites/FORMAT.md` recommends 32 px and says 16 px sheets are shown doubled. `README.md` updated (desk count, 32-px sprites, state version 2, source layout).
- Final gate: `tsc` clean · `npm test`: **19 files, 176 tests passing** (154 baseline + 22 new: 8 scale, 6 desk layout, 5 store migration, 3 desk-reset integration) · `npm run build` OK.
- **SC-004 (feature 001's scenarios on the new layout)**:
  - Scenario 1 (a meeting opens when two meet) and the call panel: seen in the browser on every run (two people join, "Nearby · 2" tiles appear, the green talking outline works).
  - Scenario 3 (desks): claim, walk away, `G` back to the seat, own-desk glow all checked in the browser (`screenshots/after-desk-walk-back.png`); lock / invite / cubicle / privacy are in `ws-desk-privacy.test.ts` on the new ids.
  - Scenario 2 (private rooms) and 5 (status, ring, wave): covered by the existing integration tests, which all pass. **Not re-clicked by hand**: the meeting-room spotlight and its label after the zoom/pixel-ratio change to `render2d.ts` (the code path is shared with the checked ones, but nobody has looked at it).
  - Scenario 4 (custom sprites): checked in Q3 above.
- **Still to do by hand**: the SC-001 "which looks more modern" survey of 5 people (before / after screenshots are in `screenshots/`).
- Found while testing, not a bug in the product: a long-running dev or test server started before this change keeps the old 32-desk map in memory while a rebuilt page uses the new one (desk ids and seats then disagree). `npm run dev` uses `tsx watch`, which restarts the server on file changes, so it stays in step.
