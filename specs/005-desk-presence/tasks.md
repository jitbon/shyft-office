---

description: "Tasks for desk presence (the stronger desk highlight and the video view at your own desk)"
---

# Tasks: Desk Presence

**Input**: design documents in `specs/005-desk-presence/`: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/ui-behavior.md](contracts/ui-behavior.md) and [quickstart.md](quickstart.md)

**Tests**: included. Constitution V asks for unit tests of deterministic logic, and Constitution III for a test wherever privacy could be touched (the desk view must add no traffic). Write each story's tests before its code and see them fail first.

**Organization**: tasks are grouped by user story. US1 (the highlight) and US2 (the video view) are both P1 and independent of each other once the pure core exists; US3 (the setting) is P3.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US3 from spec.md
- Paths are relative to the repository root

## Notes for every task

- **No server, protocol or file-format change.** Presence is worked out in the browser from the compiled world and the office snapshot. If a task seems to need a new message, stop: something is wrong (plan, research R3).
- **Pure modules do not touch the DOM or `localStorage` at load.** `shared/desk-presence.ts` takes plain data; the browser glue is in `src/desk-presence.ts`.
- **Read the world at use time** (`getWorld()` from `shared/map.ts`), never copy desks or tiles into a constant at import time, so a publish is followed at once.
- **Tests that change the world restore it** in `afterEach` (`setWorld(compileDefault())`).
- **Existing behaviour stays.** The full suite (517 tests) must pass after every phase; desk claiming, locking, invitations, pods and conversations behave as now.
- **Mic and camera are never turned on by anything in this feature** (FR-010).
- **Rebuild before checking in a browser** (`npm run build`); the test server serves `dist/`. A browser check against an old build proves nothing.

---

## Phase 1: Setup

- [X] T001 Confirm the baseline: `npm run typecheck` is clean and `npm test` passes (517 tests). Note the numbers in specs/005-desk-presence/checklists/validation.md (create it with a first heading) so the end of the feature can be compared.

---

## Phase 2: Foundational (the pure core)

**Purpose**: the decisions that both stories need, as pure functions with tests.

### Tests (write first, see them fail)

- [X] T002 [P] Write tests/unit/desk-presence.test.ts for `presenceOf(world, x, y, memberId, owners)` (data-model "Presence"): null outside any desk space; the seat tile, a desk-top tile and a ring tile each give that desk's id and its `tiles`; `mine` is true only when `owners[deskId]` equals `memberId`; a guest member id (`eph-…`) is never `mine`; an unclaimed desk gives `mine: false`; a position exactly on a tile edge belongs to the tile it floors to; a desk turned or moved in a recompiled world is found at its new tiles and not at the old ones; two desks never give the same tile.
- [X] T003 [P] Write tests/unit/desk-dwell.test.ts for `DeskDwell.update(presence, now)` (data-model "Dwell state"): `highlight` equals the presence at once; `view` is null before 1000 ms in the same own desk and the desk id from 1000 ms on; crossing an own desk in under 1000 ms never reports a view (SC-006); after leaving, `view` still reports the desk id for 600 ms and is null afterwards (`VIEW_CLOSE_MS`); stepping out for 300 ms and back in keeps the view without a gap; moving into a different desk space restarts the 1000 ms; another member's desk (`mine: false`) never reports a view; a guest never does.
- [X] T004 [P] Write tests/unit/outline-edges.test.ts for `outlineEdges(tiles)`: one tile gives 4 edges of length 1; a row of 3 gives 8 edges and none between neighbours; an L of 5 tiles gives 12; a seat + desk + ring set of a real desk from `compileWorld(defaultLayout())` has no edge inside the set and every edge has exactly one side in the set; the same set turned a quarter gives the same count; an empty set gives none.
- [X] T005 [P] Write tests/unit/desk-panel.test.ts for `panelPlan({ conversation, desk })` (data-model "Panel model"): no conversation and no due desk view → `{kind: 'none'}`; no conversation and a due own desk → `{kind: 'desk', heading: 'Your desk'}` with only the member's own tile; a conversation and no desk → `{kind: 'conversation', heading: <label>}`; a conversation while on your own desk → `{kind: 'conversation', heading: 'Your desk · <label>'}`; the desk kind never carries the "conversation is full" text.

### Implementation

- [X] T006 Create shared/desk-presence.ts: `presenceOf` (finds the desk whose `tiles` contain `Math.floor(x), Math.floor(y)` in a `World`, using `World.desks`), `DeskDwell` (state as in data-model "Dwell state"; the 1000 ms constants exported as `VIEW_OPEN_MS = 1000` and `VIEW_CLOSE_MS = 600`, both exported), `outlineEdges(tiles) → {x1,y1,x2,y2}[]` (tile units), and `panelPlan`. No DOM, no storage, no `map.ts` globals: everything is passed in. Make T002–T005 pass.

**Checkpoint**: `npm test` is green; the core is done.

---

## Phase 3: User Story 1 - The desk lights up when you are on it (Priority: P1)

**Goal**: a strong, clearly visible highlight and a "Your desk" cue when you stand in a desk space.

**Independent Test**: quickstart Q1.

- [X] T007 [US1] Create src/desk-presence.ts, the browser glue: `deskPresenceNow(now)` reads `me` (x, y, memberId), `getWorld()` and the owners (from the office snapshot, see T008), calls `presenceOf`, feeds a module-level `DeskDwell`, and returns `{ highlight, view }`. Export `deskCueText(highlight)`: `"Your desk"` when `mine`, otherwise null.
- [X] T008 [US1] In src/office-ui.ts export `deskOwners(): Record<string, string>` (desk id → owner member id, from the current snapshot) for T007, and add `showDeskCue(text: string | null)` that shows or hides a new `<div id="deskCue" class="panel" hidden>` (add it to index.html beside `deskHint`; style it as a small pill in src/style.css with the existing tokens; hidden while `body.building`, as `deskHint` is).
- [X] T009 [US1] In src/render2d.ts replace the own-desk tint with a `deskPresence: { tiles: {x:number;y:number}[]; mine: boolean } | null` field on `Renderer2D`: while it is set, fill every tile of the space (own desk: the accent `rgba(241, 196, 83, 0.35)`; another desk: a cooler `rgba(120, 170, 255, 0.3)`) and draw the edge from `outlineEdges(tiles)` as a 3 CSS-pixel line (accent `rgba(241, 196, 83, 0.95)` / cool `rgba(150, 190, 255, 0.95)`) at the display scale `s`; while it is null, keep today's behaviour exactly (the `0.2` tint on your own claimed desk, via `deskTags`). While it is set, skip that old tint for the desk you are inside, so the two fills do not stack. Draw it after the map and before people, as the tint is drawn now.
- [X] T010 [US1] In src/main.ts `render(now)`: call `deskPresenceNow(now)` once a frame; in `2d` set `renderer2d.deskPresence` from `highlight` (null when none); in both views call `showDeskCue(deskCueText(highlight))`. First person draws nothing else for the highlight (research R7).
- [X] T011 [US1] Run quickstart Q1 in a real browser (build first; isolated server; Chrome driver): claim a desk, walk on and off in top-down and in first person, step onto an unclaimed desk, turn a desk and publish, and record each outcome with screenshots in specs/005-desk-presence/checklists/validation.md. Fix anything that disagrees with contracts/ui-behavior.md.

**Checkpoint**: US1 works on its own.

---

## Phase 4: User Story 2 - The video view opens at your desk (Priority: P1)

**Goal**: your own desk opens the voice and video view with your own tile and mic and camera buttons, with no traffic added.

**Independent Test**: quickstart Q2 and Q4.

### Tests (write first, see them fail)

- [X] T012 [P] [US2] Write tests/integration/desk-presence-privacy.test.ts, in the style of tests/integration/ws-desk-privacy.test.ts: member A claims a desk and walks onto its seat and ring, back and forth, with B in the room next to it; **expect** that neither A nor B receives any `links`, `rtc`, `chat` or `notify` message that they would not have received without the walk (compare to the same script with A standing elsewhere), that no `media` message is sent by the server on A's behalf, and that a locked desk still stops B at its edge and shows B nothing of A. This guards that nothing was added on the server side (FR-006, FR-011).

### Implementation

- [X] T013 [US2] In src/callPanel.ts: let `render` take a heading kind (`'desk' | 'conversation'`, from `panelPlan`) and show no "conversation is full" text for `'desk'`; add `onToggle(which: 'mic' | 'cam')` to the constructor and, on the member's own tile (`info.self`), two small buttons (mic, camera) whose state follows `info.mic` and `info.cam`, with the same labels and `off` styling as the toolbar buttons (src/style.css); they call `onToggle`. Remote tiles get no buttons.
- [X] T014 [US2] In src/main.ts: pass `toggleDevice` as the panel's `onToggle`; make `refreshCallPanel` use `panelPlan({ conversation, desk })` where `desk` is the due own desk from `deskPresenceNow(...).view` (T007); with no conversation and a due desk, render the heading `"Your desk"` and one tile, the member's own (their stream if the camera is on, otherwise their character; `self: true`); with a conversation, keep its tiles and use the heading from `panelPlan` (`"Your desk · <label>"` on your own desk). Call `refreshCallPanel()` from the frame loop whenever the desk `view` value changes, not every frame, so the panel does not redraw 60 times a second.
- [X] T015 [US2] Make the hand-over clean: when a conversation starts while the desk view is showing, the panel re-renders with the conversation's tiles in the same call (own tile kept by id, so no flash and no duplicate), and when the conversation ends while still on the desk the desk view comes back at once if it is due. Cover with a unit test of the sequence over `panelPlan` in tests/unit/desk-panel.test.ts (extend T005).
- [X] T016 [US2] Run quickstart Q2 and Q4 in a real browser with two members (build first; two Chrome launches have different member ids; the second member can also be a scripted `ws` client): the panel opens after about a second with one tile and mic and camera buttons, both off; turning the camera on shows the picture; walking off closes it a second later; crossing the desk without stopping shows nothing; an invited member's tile appears; a locked desk stops the other member; no camera or microphone indicator for A in B's browser. Record with screenshots in checklists/validation.md.

**Checkpoint**: US1 and US2 work together.

---

## Phase 5: User Story 3 - Choose whether the desk view opens by itself (Priority: P3)

**Goal**: a per-device switch for the automatic opening.

**Independent Test**: quickstart Q3.

- [X] T017 [P] [US3] Write tests/unit/desk-setting.test.ts for `readDeskViewSetting(storage)` / `writeDeskViewSetting(storage, on)` (data-model "Setting"): absent → on; `"off"` → off; any other value → on; writing off stores `"off"`, writing on removes the key; a storage that throws on read or on write is treated as on and never throws.
- [X] T018 [US3] In src/desk-presence.ts add the two functions of T017 over `localStorage` under the key `shyft.deskView`, and make `deskPresenceNow` report `view: null` while the setting is off (the highlight is unaffected, FR-014). In src/office-ui.ts `renderDeskCard`, for your own desk add a checkbox "Open the video view when I'm at my desk" bound to the setting; changing it takes effect at once (call `refreshCallPanel` through the existing deps).
- [X] T019 [US3] Run quickstart Q3 in a real browser (switch off, walk on: highlight but no panel; reload: still off; switch on: it opens) and record it in checklists/validation.md.

**Checkpoint**: all three stories work.

---

## Phase 6: Polish & Cross-Cutting

- [X] T020 [P] Add a short "At your desk" paragraph to README.md under "Using the office" (the highlight, the video view, the setting, and that mic and camera stay off until you turn them on).
- [X] T021 Run quickstart Q0 and Q5: the full suite and typecheck pass, and first person at device pixel ratios 1 and 2 turning for 5 s while standing on a desk holds at least 50 fps (it draws no highlight, so it should equal today); record both in checklists/validation.md.
- [X] T022 Final gate. All must pass: `npm run typecheck`, `npm test`, `npm run build`, and quickstart Q0–Q5 with each outcome in checklists/validation.md. State in the log anything that was covered by tests rather than a real browser.

---

## Dependencies & Execution Order

- **Setup (Phase 1)**: none.
- **Foundational (Phase 2)**: needs Setup. **Blocks both stories.** T002–T005 in parallel, then T006.
- **US1 (Phase 3)**: needs Foundational. T007 → T008 → T009/T010 → T011.
- **US2 (Phase 4)**: needs Foundational and T007 (the glue). T012 and T013 can run in parallel; then T014 → T015 → T016. It does not need US1's drawing.
- **US3 (Phase 5)**: needs T007 and T014 (the view it switches). T017 can run any time after Foundational.
- **Polish (Phase 6)**: needs everything it documents or measures.

### Parallel opportunities

- T002, T003, T004, T005 (four test files).
- T012 with T013.
- T017 with any US1 or US2 task.
- T020 with T021.

### Within a story

Tests first and failing, then the pure parts, then the glue, then the renderer or panel, then the browser check.

## Implementation Strategy

1. **Core first:** Phase 2, so the rules are settled and tested before anything is drawn.
2. **Then US1 (MVP):** the highlight is the smallest visible win and needs no panel work. Stop and look at it.
3. **Then US2:** the video view, with its privacy test.
4. **Then US3:** the setting.
5. **Polish:** README, the speed check and the final gate.

Each checkpoint leaves `npm test` green and the office usable, so the work can be committed story by story.

## Phase 7: Convergence

- [X] T023 Add tests/integration/desk-space-3x3-privacy.test.ts pinning the new 3×3 desk boundary on the server: with `desk-5-13` claimed and locked, an uninvited member is refused at a newly included corner (5,11) and (7,11); a member standing on the gap tile between two desks (8,12) is in no desk's space and is not linked into either desk's conversation; then amend plan.md (Constraints: "No server change") and the spec's Assumptions to say the desk space shape (3×3, in shared/world.ts deriveDesks) is a shared rule the server also uses, per Constitution III, plan: no server change (contradicts)
- [X] T024 Bring contracts/ui-behavior.md and quickstart.md up to date with the amendments: the meeting-room view (opens at once, closes 0.6 s after leaving, headed with the room's name, below a conversation and a desk in precedence), the desk titles ("Your desk", "<Owner>'s desk", "Free desk"), and a quickstart step for each, per FR-015, FR-016 (partial)
- [X] T025 Record the top-bar redesign (separate 2D/3D pill, mic and camera icon buttons, floating Build button, status opening on hover and pinning on click, stacking below 1150 px so the area name stays visible) as an amendment in spec.md with a quickstart check and its validation log entry, per user request outside the 005 artifacts (unrequested)
