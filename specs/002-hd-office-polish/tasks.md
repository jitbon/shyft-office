---
description: "Task list for Higher-Detail Office and Polished Interface"
---

# Tasks: Higher-Detail Office and Polished Interface

**Input**: Design documents from `/specs/002-hd-office-polish/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Constitution V requires unit tests for pure logic. That covers zoom maths, multi-tile desk detection, the desk layout and the saved-state migration, so those test tasks are included. Visual results are checked through the [quickstart](quickstart.md) scenarios.

**Organization**: Tasks are grouped by user story, so each story can be built and checked on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on unfinished tasks)
- **[Story]**: US1 = detailed art, US2 = fewer and wider desks, US3 = rounder interface
- Paths are relative to the repository root (`shared/`, `server/`, `src/`, `tests/`, `tools/`, `sprites/`)

---

## Phase 1: Setup

**Purpose**: confirm a clean starting point before anything changes.

- [X] T001 Run `npm run typecheck && npm test && npm run build`. Record the baseline (expect 154 tests passing) in specs/002-hd-office-polish/checklists/validation.md, creating the file with a "Baseline" heading.
- [X] T002 [P] Take "before" screenshots for SC-001 and the US3 legibility comparison: lobby at the default zoom, the open office, first person facing a desk, and a call with the people panel open. Save them as specs/002-hd-office-polish/screenshots/before-*.png.

---

## Phase 2: Foundational (blocking all stories)

**Purpose**: switch the renderer to 32 art pixels per tile and crisp device-pixel scaling, with today's art upscaled 2× as a placeholder. Every later task then draws into the final pipeline.

**⚠️ CRITICAL**: no user-story work can begin until this phase is done.

- [X] T003 [P] Write tests/unit/scale.test.ts, covering `zoomRange(dpr)`, `defaultZoom(dpr)`, `clampZoom(k, dpr)`, `stepZoom(k, ±1, dpr)` and `tileCssPx(k, dpr)`. Cases:
  - dpr 1: range [1,3], default 2, tile 64 px.
  - dpr 2: range [2,6], default 3, tile 48 px.
  - dpr 1.5 rounds to 2.
  - dpr 0 or NaN is treated as 1.
  - Stepping stops at the ends of the range.
  - `rescale(k, oldDpr, newDpr)` keeps the closest on-screen tile size (for example k=3 at dpr 2 → k=2 at dpr 1, 48 → 64 px is the closest whole step).
- [X] T004 Create the pure module src/scale.ts, exporting `TILE = 32` and the functions from T003. Rules from data-model.md "Render scale": k is "An integer in `[max(1, round(dpr)), 3 × round(dpr)]`", the default is "`max(1, round(1.5 × dpr))`", and the on-screen tile is "`TILE × k / dpr` CSS px". Make T003 pass.
- [X] T005 In src/art.ts, change `export const TILE = 16` to re-export `TILE` from src/scale.ts.
  - Make every 2D painter (`drawFloor`, `drawWelcomeMat`, `drawWall2D`, `drawFurniture2D`, `blob`) and `makeAvatar`, `avatarFromSheet` and `avatarFromLayers` produce 32-px output, temporarily by painting at 16 and scaling 2× with no smoothing, so behaviour is unchanged.
  - Avatar frames become 32×32 canvases. 16-px sheets upscale 2× with nearest-neighbour; 32-px sheets are copied natively instead of being downscaled.
- [X] T006 Make the 2D canvas device-pixel aware in src/main.ts `resize()`:
  - Backing store `innerWidth × dpr` by `innerHeight × dpr`, CSS size `innerWidth × innerHeight`.
  - Listen for `matchMedia('(resolution: …dppx)')` changes and call `rescale` from src/scale.ts.
  - Replace `let zoom = 3` and the `+`/`-`/wheel handlers (src/main.ts lines ~49, 128–138) with `defaultZoom`/`stepZoom`.
  - Pass `k` and `dpr` to the renderers.
  - Convert pointer coordinates for `tileUnder` (src/main.ts ~147–154) from CSS to device pixels.
- [X] T007 Update `Renderer2D.render` in src/render2d.ts:
  - Tile size in device pixels is `s = TILE × k`. Draw the map at `MAP_W × s`.
  - Draw avatars at `TILE × k` square, anchored bottom-centre at the feet, replacing the hard-coded `8 * zoom`, `15 * zoom` and `16 * zoom`. Scale the shadow ellipse to match.
  - Draw text (name tags, bubbles, area label, desk tags) in CSS pixels by multiplying sizes by `dpr`.
  - Scale the marching outline's dash and line width by `k`.
- [X] T008 [P] Update the other places that assumed 16-px art:
  - The minimap in src/main.ts `drawMinimap` (~645–651): keep smoothing on for the minimap only.
  - The first-person blit and marker labels in src/main.ts (~677–680): CSS size × dpr.
  - The picker preview in src/join.ts (~229–231).
  - The call-panel avatar copy in src/callPanel.ts (~92): size the canvas to the frame, 32×32.
- [X] T009 Checkpoint:
  - `npm run typecheck && npm test` passes.
  - In the browser at DPR 1 and 2 the office looks like before (upscaled), but sharp, with default tiles of 64 px and 48 px and zoom working through every step.
  - Record the result in specs/002-hd-office-polish/checklists/validation.md.

**Checkpoint**: the pipeline is now 32 px and crisp; the stories can start.

---

## Phase 3: User Story 1 - The office looks detailed, not 8-bit (Priority: P1) 🎯 MVP

**Goal**: all built-in art drawn natively at 32 px, with a softer palette, in both views.

**Independent Test**: [quickstart.md](quickstart.md) Q1, Q2, Q3 and Q4.

- [X] T010 [US1] Add a single `PALETTE` object to src/art.ts (research R4): muted warm materials with 2–3 shades each.
  - Floors: wood, carpet, library carpet, kitchen tile.
  - Walls: wall, trim, window, whiteboard, bookshelf, counter.
  - Furniture: desk, table, chair, plant, sofa, monitor.
  - Characters: outline colour, plus `shade(hex, amount)` and `light(hex, amount)` helpers for Look colours.
- [X] T011 [US1] Redraw the floors natively at 32×32 in `drawFloor`, src/art.ts: wood with plank grain and seams, carpet with a woven texture, library carpet, and kitchen tile with grout. Keep the noise deterministic through `hash`. Also redraw `drawWelcomeMat` at 32 px. Remove the T005 2× shim for these.
- [X] T012 [US1] Redraw the walls natively at 32 px in `drawWall2D`, src/art.ts: wall top with highlight, front face with trim, window with frame and sky gradient, whiteboard with marker lines, bookshelf with spines on several shelves, and kitchen counter with a worktop. Remove the shim.
- [X] T013 [US1] Redraw the furniture natively at 32 px in `drawFurniture2D`, src/art.ts:
  - **Desks**: tiles join only horizontally into one surface with rounded outer corners and a lip shadow. Where two desk rows meet back to back, draw a thin divider screen. The centre tile of each 3-tile run carries a monitor; the side tiles carry small items (lamp, mug, papers) chosen with `hash`.
  - **Others**: table, office chair with a seat highlight, potted plant with layered leaves, sofa with cushions.
  - Remove the shim.
- [X] T014 [US1] Redraw the built-in avatars natively on 32×32 frames in src/art.ts: replace the 16-col `FRONT`, `BACK`, `SIDE`, `FRONT_LEGS` and `SIDE_LEGS` templates and `makeAvatar`.
  - Use 32-col row templates with outline, skin, hair and shirt in base/shade/light, trousers, shoes, eyes with a highlight, and a mouth (front).
  - Head about 40% of the height, feet on row 31, centred.
  - 4 directions × 4 walk frames, with the legs and arm swing animated.
  - Remove the avatar shim from T005.
- [X] T015 [P] [US1] Paint the 3D textures with the shared 32-px painters in src/art.ts:
  - `makeFloorTextures` draws `drawFloor` straight into a TEX×TEX canvas (no 16→32 upscale).
  - `makeWallTextures` (`#`, `G`, `W`, `B`, `K`) reuses the wall face painters from T012 at 32×32, so both views match.
  - `makeCeilingTextures` uses PALETTE.
  - `makeFurnitureSprites` (`d`, `t`, `h`, `p`, `s`) draws with the T013 furniture painters, keeping the same world sizes `w`/`h`.
- [X] T016 [US1] In src/render3d.ts, raise `RENDER_H` from 240 to 360. Make sure avatar billboards use the 32-px `avatar.tex` frames. Update the header comment: it no longer aims for a chunky 8-bit look.
- [X] T017 [US1] Check speed (SC-003) per quickstart Q4. With `npm run bots` and 10 or more bots, both 2D and first person must hold at least 50 fps. If first person drops below 50, set `RENDER_H = 300` in src/render3d.ts. Record the fps in specs/002-hd-office-polish/checklists/validation.md.
- [X] T018 [US1] Run quickstart Q1–Q3 in the browser at DPR 1 and 2:
  - Crisp at every zoom; characters show eyes and shading; 2D and first person match.
  - A 16-px and a 32-px custom sheet appear the same size.
  - Save "after" screenshots to specs/002-hd-office-polish/screenshots/after-*.png, and record the result in checklists/validation.md.

**Checkpoint**: the office looks Gather-like in both views. This is the MVP.

---

## Phase 4: User Story 2 - Fewer, wider desks (Priority: P2)

**Goal**: 12 desks, 3 tiles wide each, in 3 pods of 4. Old claims are released once, with a notice.

**Independent Test**: [quickstart.md](quickstart.md) Q5 and Q6, plus the unit tests below.

### Tests for User Story 2

- [X] T019 [P] [US2] Write tests/unit/desks-layout.test.ts, asserting the data-model.md rules against `DESKS` and `DESK_PODS` from shared/map.ts:
  - "exactly 3 pods and 12 desks, 4 per pod".
  - "one horizontal run of exactly 3 `d` tiles, and its chair `h` sits at the centre tile, directly above or below it".
  - A gap of at least 1 floor tile between desks in a row, and aisles of at least 2 tiles between pods.
  - No two desks share a tile.
  - Every chair is reachable from the spawn point (BFS over non-blocking tiles).
  - The `G` window walls stay at x = 0 and x = 39 on rows 13–14.
- [X] T020 [P] [US2] Extend tests/unit/store.test.ts with v1→v2 migration cases, per contracts/office-state-v2.md "Reading rules":
  - v1 → empty `deskClaims` and `podModes`, `areaAllowed` kept.
  - `deskResetNotice` is the unique v1 holders, skipping `eph-` ids, capped at 500.
  - v2 → `deskResetNotice` validated: "non-empty strings without the `eph-` prefix, de-duplicated, at most 500".
  - Unknown version → empty v2.
  - `loadState` on a v1 file rewrites it as `"version": 2` straight away.

### Implementation for User Story 2

- [X] T021 [US2] Replace open-office rows 10–17 of `MAP_ROWS` in shared/map.ts with the layout in data-model.md:
  - Pods at x = 5–11, 17–23 and 29–35.
  - Desk rows 13–14, with chairs at the centre tile on rows 12 and 15.
  - Plants at x = 14 and 26 on rows 11 and 16.
  - Every row exactly 40 characters.
  - Update `POD_COLUMNS`/`POD_DESK_ROWS` into a 3-pod definition (`pod-1` … `pod-3`, names `Desk pod 1` … `Desk pod 3`), with rects covering each pod's footprint plus a 1-tile margin.
- [X] T022 [US2] Change `deriveDesks` in shared/map.ts so a chair's furniture is "the maximal horizontal run of `d` tiles that contains a tile 4-adjacent to the chair. Runs never extend vertically." Then make T019 and the existing map and validation tests pass (`validateOffice`, `nearestFreeTileNear`).
- [X] T023 [US2] Implement StoredState v2 in server/store.ts:
  - `version: 2`, plus `deskResetNotice: string[]`.
  - Migrate v1 in `parseState` per contracts/office-state-v2.md.
  - `loadState` saves straight away (atomic temp file + rename) when it migrated.
  - Make T020 pass.
- [X] T024 [US2] Carry `deskResetNotice` in server/office.ts:
  - Load it from state, and include it in the saved snapshot (~line 91).
  - Add `takeDeskResetNotice(memberId): boolean`, which removes the id, schedules a save, and returns whether it was there.
- [X] T025 [US2] In server/app.ts, on a successful `join`: if `office.takeDeskResetNotice(memberId)` returns true, send only that socket `{ t: 'notify', kind: 'deskReset' }`.
- [X] T026 [P] [US2] Add `'deskReset'` to `NotifyKind` in shared/protocol.ts.
- [X] T027 [US2] Handle `notify kind 'deskReset'` on the client (src/main.ts `onNotify`, or src/office-ui.ts if that's where notices render). Show "The office was redesigned and desks were reset. Click a free desk to claim a new one." for at least 8 s, dismissable.
- [X] T028 [US2] Add an integration test in tests/integration/ws-desk-reset.test.ts:
  - Start the server with a dataDir holding a v1 file with one claim for member M.
  - M joins and gets `deskReset` exactly once; a second client joining does not get it.
  - M reconnects and gets no notice.
  - A server restart on the same dataDir gives no notice and keeps a claim made after the reset.
- [X] T029 [US2] Update desk ids in tests/unit/store.test.ts, tests/unit/proximity.test.ts, tests/unit/office-desks.test.ts, tests/integration/ws-desk-privacy.test.ts and tests/integration/ws-robustness.test.ts:
  - Replace `pod-1:4,12` and other old ids with ids derived from the new layout. Prefer looking up `DESKS[0].id` and its seat over hard-coding.
  - Fix any player positions (`at(x, y)`) that pointed at old chairs.
  - `npm test` must pass.
- [X] T030 [US2] Run quickstart Q5 and Q6 in the browser: 12 desks, claim/lock/invite/G and a cubicle pod all work, and the one-time reset notice appears. Record the result in specs/002-hd-office-polish/checklists/validation.md.

**Checkpoint**: desks are fewer and wider, and old claims are cleanly reset.

---

## Phase 5: User Story 3 - A cleaner, rounder interface (Priority: P3)

**Goal**: rounded panels, buttons, tiles and map labels, all in Nunito, with text at least as legible as today.

**Independent Test**: [quickstart.md](quickstart.md) Q7.

- [X] T031 [P] [US3] In index.html, replace the Google Fonts link (`Press+Start+2P` and `VT323`) with Nunito weights 400, 600, 700 and 800 (`display=swap`).
- [X] T032 [US3] Restyle src/style.css with tokens on `:root`:
  - `--font: 'Nunito', system-ui, sans-serif`
  - `--radius: 12px`, `--radius-sm: 8px`, `--radius-pill: 999px`
  - Softer panel colours that match PALETTE, and a subtle panel shadow
  - Remove `--pixel` and `--body`.
- [X] T033 [US3] Apply the tokens across src/style.css so every rule that used `var(--pixel)` or `var(--body)` (lines ~20, 65, 74, 89, 101, 139, 161, 174, and the rest) uses `var(--font)`, at these minimum sizes from research R6:
  - "14 px for name tags and panel text, 15 px for chat, and 12 px for small headers".
  - Give every panel, card, notice, button, input, chip and `.tile` a radius: panels `--radius`, buttons/inputs/tiles `--radius-sm`, chips/status `--radius-pill`.
  - Add `overflow: hidden` to `.tile`. Keep the `.tile.talking` box-shadow outline; it follows the radius.
- [X] T034 [US3] In src/render2d.ts:
  - Change `UI_FONT` to `'"Nunito", system-ui, sans-serif'`.
  - Draw `drawNameTag` as a pill (`ctx.roundRect`, radius h/2) at 600 weight, minimum 14 CSS px, with the status dot as a circle.
  - Draw `drawBubble` with radius 10 and a small rounded tail, at 15 CSS px.
  - Fall back to `rect` if `roundRect` is missing.
- [X] T035 [US3] Wait for the font before the first measured label draw, in src/main.ts: `await document.fonts.load('600 14px Nunito')`, with a 2 s timeout fallback, before starting the render loop.
- [X] T036 [P] [US3] Check src/join.ts, src/office-ui.ts, src/status.ts and src/callPanel.ts for inline styles or class names that set fonts or square corners, and move them onto the tokens.
- [X] T037 [US3] Run quickstart Q7: every panel is rounded and in Nunito with no old fonts in DevTools Rendered Fonts; the talking outline follows the corners; text is at least as legible as the before screenshots; nothing clips at 1024 px wide. Record the result in specs/002-hd-office-polish/checklists/validation.md.

**Checkpoint**: all three stories done.

---

## Phase 6: Polish & Cross-Cutting

- [X] T038 [P] Change the default `--size` from 16 to 32 in tools/sprite-template.ts (line 13). Regenerate sprites/template.png (128×128).
- [X] T039 [P] Update sprites/FORMAT.md per contracts/sprite-format.md: frame size "**32×32 px** (recommended) or **16×16 px** (shown at 2× with no smoothing)". Update the template size and examples to match.
- [X] T040 Regenerate the bundled example sprites/robot.png at 32 px with tools/sprite-example.ts, and update sprites/robot.json if it records a size. If tests/unit/sprite-loader.test.ts reads the bundled robot (expects `frameSize: 16`, lines 44 and 104), update the expected value to 32. Otherwise leave its fixtures alone. Run `npm run sprites:check sprites/robot.png`.
- [X] T041 [P] Update the README.md screenshots/description where it mentions the 8-bit look, fonts or the desk count.
- [X] T042 Final gate:
  - `npm run typecheck && npm test && npm run build` all pass, with the test count at or above the baseline.
  - Run the full quickstart Q1–Q7 once more.
  - Rerun the desk, private-room and call scenarios from specs/001-gather-office-spaces/quickstart.md with the new layout (SC-004).
  - Mark the results in specs/002-hd-office-polish/checklists/validation.md.

---

## Dependencies & Execution Order

```text
Setup (T001–T002)
   └─▶ Foundational (T003–T009)  ── blocks everything
          ├─▶ US1 art (T010–T018)      🎯 MVP
          ├─▶ US2 desks (T019–T030)    independent of US1
          └─▶ US3 interface (T031–T037) independent of US1/US2
                 └─▶ Polish (T038–T042)
```

- **Between stories**:
  - US2 and US3 don't need US1's art. They can start after Phase 2.
  - T013's back-to-back divider looks best once T021's layout exists, but it doesn't depend on it.
  - US3 T034 edits src/render2d.ts, which T007 also edits, so it must run after Phase 2.
- **Within US1**: T010 → T011, T012, T013 and T014 (all in src/art.ts, so one after another) → T015 → T016 → T017 → T018.
- **Within US2**:
  - Tests T019 and T020 come first.
  - T021 → T022 (shared/map.ts).
  - T023 → T024 → T025.
  - T026 can run any time.
  - T027 after T026.
  - Then T028, T029 and T030.
- **Within US3**: T031 and T032 → T033 → T034 → T035; T036 can run alongside T034; T037 last.

## Parallel Opportunities

- **Phase 2**: T003 (test) runs alongside T008 once T004 and T005 exist.
- **US1**: T015 (3D textures) can be drafted alongside T016. The painters T011–T014 share src/art.ts, so run them one after another.
- **US2**: T019, T020 and T026 run together. T021–T022 (shared/) run alongside T023–T025 (server/).
- **US3**: T031 and T036 run alongside T032 and T033.
- **Across stories**: once Phase 2 is done, US1 (src/art.ts, src/render3d.ts), US2 (shared/, server/, tests/) and US3 (index.html, src/style.css) touch mostly different files. Watch src/render2d.ts (T034) and src/main.ts (T027, T035).
- **Polish**: T038, T039 and T041 run together.

## Implementation Strategy

1. **MVP**: Phase 1 → Phase 2 → US1. That gives the visible "not 8-bit anymore" change. Stop and check with quickstart Q1–Q4.
2. **Then US2**: desks. It is the only story that touches saved data, so ship it with T028 green.
3. **Then US3**: interface polish.
4. **Polish phase**: sprite tooling and docs, then the final gate.

Each phase ends at a checkpoint where `npm test` passes and the office is usable, so the work can be committed phase by phase.

## Phase 7: Convergence

- [X] T043 Replace the hard-coded hex colours in the first-person desk sprites `d`, `d:l` and `d:r` (`makeFurnitureSprites`, src/art.ts) with `PALETTE` entries, so both views share one palette, per FR-004 / FR-005 and T015 (partial)
- [X] T044 Walk into a private meeting room in the browser and confirm the spotlight and room label still render correctly after the zoom/dpr change in src/render2d.ts, then log the result in specs/002-hd-office-polish/checklists/validation.md, per FR-009 / SC-004 (partial)
