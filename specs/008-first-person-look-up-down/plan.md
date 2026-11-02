# Implementation Plan: Look Up and Down in First Person

**Branch**: `008-first-person-look-up-down` | **Date**: 2026-11-01 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/008-first-person-look-up-down/spec.md`

## Summary

Add mouse-only vertical look, up to about 60° up and down, to the first-person view:

1. **A moving horizon.** First person is a column raycaster with its horizon fixed at the framebuffer's middle. The tilt moves that horizon to `h/2 + K·tan(pitch)`, and every place that drew relative to `h/2` uses the new row. That covers floor and ceiling rows, wall columns, furniture faces, people, name labels and desk markers. It is the standard raycaster "look up/down": exact through the middle of the view, the same cost per frame, and pixel-identical at level (research R2, R6).
2. **Mouse only.** While the pointer is locked, `movementY` changes `pitch` at the same sensitivity as turning, clamped to ±60°. No keys (clarification).
3. **Personal and reset.** `pitch` lives in `src/main.ts` beside `me.a`. It is never sent or stored, and is reset to level on entering first person or build mode (R4).
4. **Invert.** An "Invert mouse up/down" checkbox in the first-person hint, kept in `localStorage` (R5).

No server, protocol, `shared/` or top-down change.

## Technical Context

**Language/Version**: TypeScript 5 (strict), Vite client.

**Primary Dependencies**: none new (R9).

**Storage**: one device key, `localStorage['shyft.invertLook']`. Nothing on the server.

**Testing**:
- Vitest unit tests for `src/look.ts` (clamp, mouse look, horizon row, the invert setting with throwing storage).
- A headless raycaster test: level output is unchanged, and a tilted horizon lands at the expected row.
- The `fp-hash` check, plus quickstart scenarios with the Chrome driver.

**Target Platform**: current desktop Chromium, Firefox and Safari, with a mouse and pointer lock.

**Project Type**: web application. Only the browser client changes.

**Performance Goals**: first person keeps 60 fps at any tilt (FR-011, SC-003). The per-frame work is the same loops with a different horizon row.

**Constraints**:
- Mouse only, no new keys (FR-003).
- Level view pixel-identical to today (R6).
- Tilt never shared (FR-009).

**Scale/Scope**: 1 new source file (`src/look.ts`) and 3–4 changed ones (`src/render3d.ts`, `src/mesh3d.ts` if needed, `src/main.ts`, `index.html` and `src/style.css` for the checkbox).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | How |
|---|---|---|
| I. Gather parity, original assets | PASS | Gather's first person isn't a reference for this (spec Assumptions). The "it used to work" claim was checked against the history and recorded as not so (research R1). No assets. |
| II. One world, many views | PASS | Only the first-person *presentation* changes: the horizon row. The world model, collision and desks are untouched. Top-down is unaffected by construction, and the spec states how first person behaves when switching views (FR-008). |
| III. Server-authoritative presence and privacy | PASS | Nothing new reaches the server or others. The tilt is local camera state (FR-009). Mic, camera and privacy rules are untouched. |
| IV. Open sprite pipeline | N/A | No sprite or file formats change. |
| V. Simple to run, tested at the core | PASS | No new package or service. The look math is a pure module with unit tests, the renderer change has a headless test, and each story has a quickstart scenario. |

**Re-check after Phase 1:** still PASS.

## Project Structure

### Documentation (this feature)

```text
specs/008-first-person-look-up-down/
├── plan.md              # This file
├── research.md          # Phase 0: decisions R1–R9
├── data-model.md        # Phase 1: pitch, horizon, invert setting, pure helpers
├── quickstart.md        # Phase 1: scenarios Q0–Q4
├── contracts/
│   └── ui-behavior.md   # mouse, keys (none), levelling, invert, help line, what stays the same
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── look.ts            # NEW: PITCH_MAX, clampPitch, mouseLook, horizonRow, readInvert/writeInvert (pure)
├── render3d.ts        # render(me, others, now, pitch = 0): horizon replaces half everywhere
├── mesh3d.ts          # fillFace already takes the horizon as `half`; rename the parameter for clarity only
├── main.ts            # pitch state; mouse Y while locked; reset in setMode('3d') and toggleBuild; invert flag; help line
├── index.html         # the invert checkbox inside #lockHint
└── style.css          # the checkbox in the hint (existing tokens)

tests/unit/            # NEW: look.test.ts, raycast-pitch.test.ts
```

**Structure decision:** the existing repository stays as it is. The math is in a pure `src/look.ts`, as the constitution asks for deterministic logic. The renderer change is a single horizon value threaded through `Raycaster.render`.

## Phases

- **Phase 0, research:** [research.md](research.md), decisions R1–R9. No open questions remain.
- **Phase 1, design:** [data-model.md](data-model.md), [contracts/ui-behavior.md](contracts/ui-behavior.md), [quickstart.md](quickstart.md).
- **Suggested build order for tasks:**
  1. **Baseline:** `fp-hash` before any change.
  2. **Pure core:** `src/look.ts` with its tests.
  3. **Renderer:** the horizon in `Raycaster.render`, with the headless test. `fp-hash` must be unchanged at level.
  4. **US1:** the mouse in `main.ts`, the resets and the help line; quickstart Q1, Q2 and Q4.
  5. **US2:** the invert checkbox and setting; quickstart Q3.
  6. **Polish:** README controls table, the final gate.

## Complexity Tracking

No constitution violations to justify.
