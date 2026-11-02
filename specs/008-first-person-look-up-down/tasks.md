---

description: "Tasks for looking up and down in first person (mouse-only vertical look, about 60° each way)"
---

# Tasks: Look Up and Down in First Person

**Input**: design documents in `specs/008-first-person-look-up-down/`: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/ui-behavior.md](contracts/ui-behavior.md) and [quickstart.md](quickstart.md)

**Tests**: included. Constitution V asks for unit tests of deterministic logic (the look math), and the plan requires proof that the level view is pixel-identical (research R6). Write each story's tests before its code and see them fail first.

**Organization**: US1 (mouse look) is P1 and the MVP. US2 (invert) is P3. The renderer's horizon change is foundational, because US1 has nothing to show without it.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US2 from spec.md
- Paths are relative to the repository root

## Notes for every task

- **Mouse only.** No key tilts or levels the view, and no existing key changes (FR-003, clarification 2026-11-01). If a task seems to need a key, stop.
- **The tilt is the member's own.** `pitch` lives in src/main.ts beside `me.a`. It is never on `Player`, in a `state` message, or in storage (FR-009). There are no server, `shared/` or protocol changes.
- **Level is pixel-identical.** With `pitch = 0` the horizon is exactly `h / 2`. Run `node tools/e2e/fp-hash.mjs` before and after: the hashes must match (research R6).
- **Walking, jumping and the desk card ignore the tilt** (FR-006, FR-010). Don't touch `update()` movement or `facedDesk()`.
- **Existing behavior stays.** The full suite (680 tests in 89 files at the start) must pass after every phase.
- **Rebuild before checking in a browser** (`npm run build`). The test server serves `dist/`.

---

## Phase 1: Setup

- [X] T001 Confirm the baseline: `npm run typecheck` is clean and `npm test` passes (680 tests in 89 files). Then `npm run build`, start a test server on port 3101 with a temporary data folder, and run `node tools/e2e/fp-hash.mjs http://localhost:3101/`. Record the numbers and the **level-view hash** in specs/008-first-person-look-up-down/checklists/validation.md (create it with a first heading).

---

## Phase 2: Foundational (the look math and the moving horizon)

**Purpose**: the pure math, and the renderer drawing everything relative to a horizon row that can move.

### Tests (write first, see them fail)

- [X] T002 [P] Write tests/unit/look.test.ts for src/look.ts (data-model "Pure helpers"):
  - **`clampPitch`:** 0 → 0; `PITCH_MAX + 1` → `PITCH_MAX`; `−PITCH_MAX − 1` → `−PITCH_MAX`; NaN → 0. `PITCH_MAX` equals `Math.PI / 3`.
  - **`mouseLook(pitch, movementY, invert)`:**
    - `mouseLook(0, −100, false)` ≈ `+0.28` (mouse up looks up);
    - `mouseLook(0, 100, false)` ≈ `−0.28`;
    - `mouseLook(0, −100, true)` ≈ `−0.28`;
    - a huge movement clamps to ±`PITCH_MAX`;
    - an optional `sens` argument scales it.
  - **`horizonRow(h, K, pitch)`:**
    - `horizonRow(360, 436, 0)` = 180;
    - `horizonRow(360, 436, Math.PI / 6)` ≈ `180 + 436 · tan(30°)` ≈ 431.7;
    - a negative pitch moves it up the screen (below 180);
    - ±`PITCH_MAX` gives `180 ± 436·√3`.
  - **`readInvert(store)`:**
    - true only for `getItem('shyft.invertLook') === '1'`;
    - false for null, `'0'` and `'true'`;
    - false when `getItem` throws, or when no store is given and `localStorage` is undefined.
  - **`writeInvert(on, store)`:** it sets `'1'` or removes the key (or sets `'0'`), and swallows a throwing `setItem`.
- [X] T003 [P] Write tests/unit/raster-horizon.test.ts for `fillFace` in src/raster.ts with a moved horizon. Build a small `Target` (as tests/unit/preview3d.test.ts does: `pix`, `depth`, `w`, `h`) and one upright face in front of a camera from `makeCam`. Render it with `half = h/2` and then with `half = h/2 + 40`. Check:
  - every drawn pixel moved exactly 40 rows down (compare row indices of non-zero pixels, allowing a 1-row rounding difference);
  - nothing else changed: same columns, same count ±1 row.
  This pins that faces follow the horizon argument.

### Implementation

- [X] T004 Create src/look.ts with these exports (no DOM access at load) and make T002 pass:
  - `PITCH_MAX = Math.PI / 3`;
  - `clampPitch`;
  - `mouseLook(pitch, movementY, invert, sens = 0.0028)` returning `clampPitch(pitch − movementY · sens · (invert ? −1 : 1))`;
  - `horizonRow(h, K, pitch)` returning `h / 2 + K · Math.tan(pitch)`;
  - `INVERT_KEY = 'shyft.invertLook'`;
  - `readInvert(store?)` and `writeInvert(on, store?)`, defaulting to `localStorage` inside a try/catch, like `src/desk-presence.ts`.
- [X] T005 In src/render3d.ts, add a fourth parameter `pitch = 0` to `Raycaster.render(me, others, now = 0, pitch = 0)`. Compute `const horizon = horizonRow(h, K, pitch)` (after `K`) and use it in place of `half` everywhere `half` stands for the horizon:
  - the floor/ceiling row loop (`dy = y + 0.5 − horizon`);
  - wall `top`/`bottom` and the per-pixel wall height `z = eye + (horizon − (y + 0.5)) / unit`;
  - the `fillFace(target, face, cam, K, horizon, tex, eye)` call;
  - the people's `bottom`;
  - the label `mid` clamp;
  - the desk-marker `ly`.
  Keep the variable `half` out of the function, so no use of the old fixed middle remains. Don't change the DDA, the column math, the texture lookups or `fog`. Make T003 pass (it needs no change in src/raster.ts, whose `half` parameter already is the horizon; rename it to `horizon` there, with no behavior change).
- [X] T006 Check level is unchanged: `npm run build`, restart the test server, run `node tools/e2e/fp-hash.mjs http://localhost:3101/`, and compare with T001's hash. **They must match.** Record the result in validation.md. If they differ, a `half` → `horizon` substitution changed rounding: fix it before going on.

**Checkpoint**: `npm test` is green, and the level view is pixel-identical.

---

## Phase 3: User Story 1 - Look up and down with the mouse (Priority: P1) 🎯 MVP

**Goal**: with the mouse captured in first person, moving it up and down tilts the view up to 60° each way. Walking, jumping and the desk card are unchanged, and the view levels on entering first person or build mode.

**Independent Test**: quickstart Q1, Q2 and Q4.

- [X] T007 [US1] In src/main.ts:
  - add `let pitch = 0;` next to the other first-person state (near `MOUSE_SENS`), and import `mouseLook` from src/look.ts;
  - in the `document` `mousemove` handler that turns (`if (mode === '3d' && document.pointerLockElement === canvas) me.a += e.movementX * MOUSE_SENS;`), also set `pitch = mouseLook(pitch, e.movementY, invertLook, MOUSE_SENS)` in the same condition (`invertLook` is a module `let`, false until US2);
  - pass `pitch` as the fourth argument in `raycaster.render(me, [...others.values()], Date.now(), pitch)`.
- [X] T008 [US1] In src/main.ts:
  - reset `pitch = 0` in `setMode(next)` whenever `next === '3d'` (FR-008);
  - reset it in `toggleBuild()` when build mode turns on (it already switches to 2D there; make it explicit).
  Leave `update()` (movement) and `facedDesk()` untouched: they use only `me.a` (FR-006, FR-010).
- [X] T009 [US1] In src/main.ts `updateHints()`, change the first-person help line to "**WASD** move · **mouse** look around · **←→** turn · **Shift** run · **Space** jump · **Tab** top-down · **Enter** chat · **M** mic · **C** camera · **G** my desk · **F** desk menu" (contracts/ui-behavior.md, FR-012).
- [X] T010 [US1] Run quickstart Q1, Q2 and Q4 with `npm run build` and the Chrome driver (tools/e2e/cdp.mjs). Capture the pointer by clicking the canvas, then send `Input.dispatchMouseEvent` moves with `deltaY`, or drive `movementY` through synthetic events if pointer lock can't be held headless, and say which was used. Record in validation.md:
  - **Q1:** screenshots at level, +30°, +60° and −60°, and check the clamp (more movement after 60° changes nothing);
  - **Q2:** the distances walked by holding W for 2 s at level, fully up and fully down, within 2 % (SC-004); the desk card from F is the same when tilted; Tab twice comes back level;
  - **Q4:** first-person frame rate at ±60° and while sweeping (SC-003, about 60 fps).

**Checkpoint**: quickstart Q1, Q2 and Q4 pass. **MVP complete.**

---

## Phase 4: User Story 2 - Invert the vertical look (Priority: P3)

**Goal**: an "Invert mouse up/down" checkbox, remembered on the device and off by default.

**Independent Test**: quickstart Q3.

- [X] T011 [US2] In index.html, inside `#lockHint`, add `<label class="invertLook"><input type="checkbox" id="invertLook"> Invert mouse up/down</label>` under the existing text. In src/style.css, style it with the existing tokens. The hint must accept pointer events for the label, but a click on the label or checkbox must not reach the canvas: call `stopPropagation` in its handler, so it doesn't request pointer lock (contracts/ui-behavior.md "Invert setting").
- [X] T012 [US2] In src/main.ts:
  - initialise `invertLook = readInvert()` at load and set the checkbox's `checked` from it;
  - on `change`, set `invertLook` and call `writeInvert(invertLook)`, then `blur()` the checkbox so movement keys work again.
  Make sure `typingInField` treats the checkbox as non-typing: it's an INPUT, so blur it after change, and WASD still works once it has lost focus.

**Checkpoint**: quickstart Q3 passes (moving the mouse up looks down when ticked, the setting survives a reload, and unticking restores it).

---

## Phase 5: Polish & cross-cutting concerns

- [X] T013 [P] In README.md's controls table, change the first-person **Look** cell to "mouse (click to lock): look around, up and down to about 60°; ←/→, Q/E turn". Add one sentence after the table: looking up and down is mouse only, and "Invert mouse up/down" is in the "Click to look around" hint.
- [X] T014 [P] Check `npm run typecheck` and `npm test`. The full suite must pass, with the new files on top of the 680 baseline. Record the numbers in specs/008-first-person-look-up-down/checklists/validation.md, along with T006's level-hash comparison.

---

## Dependencies & execution order

- **Phase 1** (T001): first, since its hash is the baseline for T006.
- **Phase 2** (T002–T006):
  - T002 and T003 run in parallel;
  - T004 makes T002 pass;
  - T005 depends on T004 (it uses `horizonRow`) and makes T003 pass;
  - T006 comes after T005.
- **Phase 3, US1** (T007–T010) depends on Phase 2. T007, T008 and T009 all edit src/main.ts, so run them in order. T010 comes last.
- **Phase 4, US2** (T011–T012) depends on T007 (`invertLook` used in the mouse handler). T011 comes before T012.
- **Phase 5** depends on the included stories.

### Story completion order

```text
Setup → Foundational (math + horizon, level unchanged) → US1 (mouse look) → US2 (invert)
```

## Parallel examples

- **Phase 2 tests:** T002 (look.test.ts) and T003 (raster-horizon.test.ts). They are two new files.
- **Polish:** T013 (README) and T014 (gate).

## Implementation strategy

1. **MVP = US1:** mouse look up and down to 60°, with movement, jumping and the desk card unchanged, and the level view pixel-identical. Ship after T010.
2. **Then US2:** the invert checkbox.
3. After each phase, run the full suite. After Phase 2, re-check the level hash.

---

## Phase 6: Convergence

- [X] T015 Finish the checks the headless run couldn't do or skipped, in a normal (headed) Chrome with real pointer lock, per US1/AC1, US1/AC3, US2, SC-002 and SC-004 (partial). Record pass or fail for each in specs/008-first-person-look-up-down/checklists/validation.md:
  - with the mouse really captured (a click on the canvas), moving it up and down tilts the view, and stops at 60° each way;
  - hold W for 2 s at level, fully up and fully down: the distances agree within 2 % (SC-004);
  - jump while tilted: the view rises and falls and keeps its tilt;
  - press F facing a desk while tilted: the same desk card as when level;
  - walk around a desk pod and past another member for 30 s while sweeping the tilt: no tearing, sliding or gaps, and name labels and desk markers stay attached (SC-002). Save one screenshot at +60° and one at −60°;
  - tick "Invert mouse up/down" in the hint: ticking doesn't capture the mouse, moving the mouse up then looks down, the box is still ticked after a reload, and W still walks right after ticking it (quickstart Q3).
