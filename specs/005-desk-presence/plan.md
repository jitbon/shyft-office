# Implementation Plan: Desk Presence

**Branch**: `005-desk-presence` | **Date**: 2026-10-26 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/005-desk-presence/spec.md`

## Summary

Make "being at your desk" visible and useful, entirely in the browser:

1. **Presence is worked out, not stored.** A pure function takes the compiled world (desks with their tiles), where you stand, and who owns what, and says which desk space you are in and whether it is yours (`shared/desk-presence.ts`). Every browser reaches the same answer from the same published layout; the server is not involved and nothing new is sent.
2. **A stronger highlight.** Top-down: a brighter fill and a drawn edge around the whole desk space, with a "Your desk" cue (`src/render2d.ts`, using a pure `outlineEdges` helper). First person: the same cue as a small on-screen pill, and no marking of the floor (the owner's call; research R7).
3. **The video view opens at your own desk.** After you have stayed in your own space about a second (a small pure state machine, `DeskDwell`), the existing conversation panel opens with your own tile, headed by the desk's name, even when alone. It closes about a second after you leave, and yields to a real conversation without flashing. The panel gets mic and camera toggles on your own tile, so "the controls" are in the view like Gather's.
4. **A device setting.** "Open the video view when I'm at my desk" lives in the Desk card, defaults to on, and is kept in `localStorage`.

Nothing changes on the server, in the protocol, or in who can hear or see whom (FR-006, FR-010, FR-011).

## Technical Context

**Language/Version**: TypeScript 5 (strict), Node 20+ server (unchanged), Vite client

**Primary Dependencies**: none new

**Storage**: none on the server. One `localStorage` key on the device: `shyft.deskView` (`"off"` when switched off).

**Testing**: Vitest unit tests for the pure parts (presence, dwell, outline edges, panel model); a ws integration test that stepping onto a desk sends no media or link traffic the server did not already send; real-browser checks per [quickstart.md](quickstart.md) with the Chrome driver.

**Target Platform**: current desktop Chromium, Firefox and Safari, device pixel ratio 1 and 2

**Project Type**: web application (Node server, browser client and a `shared/` model)

**Performance Goals**: first person is unchanged (it draws no highlight); presence is a table lookup per frame (a few microseconds); the highlight and view react within the spec's 0.5 s and 1 s.

**Constraints**:
- No new message, and the server's privacy rules are unchanged, with one exception added later on request: the desk space became a 3×3 block. That shape is a shared rule (`deriveDesks` in `shared/world.ts`) that the server also uses for desk privacy, locked-desk entry and pod links, so it changed there too; `tests/integration/desk-space-3x3-privacy.test.ts` pins the new boundary (Constitution III).
- One shared world model: presence uses `World.desks[].tiles` from `shared/` (Constitution II).
- Mic and camera stay off until the member turns them on (Constitution III, FR-010).
- No new dependency (Constitution V).

**Scale/Scope**: about 2 new files and 7 changed ones.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | How |
|---|---|---|
| I. Gather parity, original assets | PASS | The behavior is modeled on Gather's desk (your own tile and controls when you are at your desk). The user's description is the source; it is recorded as *reported*, and the earlier desk research is cited, in [research.md](research.md) R1. No Gather asset is used; the highlight is drawn in code with the palette's accent color. |
| II. One world, many views | PASS | Presence is computed from the shared compiled world, so desk moves and layout changes are followed in every view. The top-down highlight is drawn from the shared tile set; first person shows only the cue, which the spec states; the panel is a shared overlay, so switching views never interrupts it. |
| III. Server-authoritative presence and privacy | PASS | The server keeps deciding who hears and sees whom. The desk view only *shows* your own tile or tiles of people the server already linked to you; it turns nothing on and sends nothing. Because nothing is added on the server, the existing desk-privacy tests are the guard, plus one new test that stepping onto a desk produces no new links or media traffic. |
| IV. Open sprite pipeline | N/A | No sprite or file format changes. |
| V. Simple to run, tested at the core | PASS | No new services or packages. Presence, the dwell rule, the dwell rule and the outline are pure modules with unit tests; each story has a quickstart scenario. |

**Re-check after Phase 1:** still PASS. The only stored thing is one device-local flag.

## Project Structure

### Documentation (this feature)

```text
specs/005-desk-presence/
├── plan.md              # This file
├── research.md          # Phase 0: decisions R1–R8
├── data-model.md        # Phase 1: presence, dwell state, highlight, panel model, setting
├── quickstart.md        # Phase 1: scenarios Q0–Q5
├── contracts/
│   └── ui-behavior.md   # what is drawn and shown, when, in each view; timings and the setting
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
shared/
└── desk-presence.ts   # NEW: deskSpaceAt(world, x, y), presenceOf(...), DeskDwell (pure state machine), outlineEdges(tiles)

src/
├── desk-presence.ts   # NEW: the browser glue: reads me/office/world each frame, keeps the dwell, exposes highlight tiles, cue and view state
├── render2d.ts        # strong fill + edge for the desk space you are in; faint tint for your own desk otherwise (as today)
├── callPanel.ts       # desk heading; mic/camera toggles on your own tile; no "conversation is full" text for the desk view
├── main.ts            # refreshCallPanel shows the desk view when there is no conversation; frame loop updates presence
├── office-ui.ts       # the Desk card gets the setting; the "Your desk" cue pill
├── index.html         # the #deskCue element (T008)
└── style.css          # cue pill, panel toggles (existing tokens)

tests/unit/            # NEW: desk-presence, desk-dwell, outline-edges
tests/integration/     # NEW: desk-presence-privacy (a member stepping onto a desk causes no new links or media)
```

**Structure decision:** the existing single repository stays as it is. The decisions that can be made without a screen (which desk, whether it is yours, how long you have stayed, where the edge runs) are pure modules in `shared/`, as the constitution asks; the browser glue and the two renderers only draw their results.

## Phases

- **Phase 0, research:** [research.md](research.md), decisions R1–R8. No open questions remain.
- **Phase 1, design:** [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md).
- **Suggested build order for tasks:**
  1. **Pure core:** `shared/desk-presence.ts` with its tests (presence, dwell, outline).
  2. **US1, the highlight:** top-down fill and edge, the cue in both views, for your own desk and for a desk you are let into.
  3. **US2, the video view:** the glue, `refreshCallPanel` for the desk view, the panel heading and own-tile toggles, the hand-over to and from conversations, the privacy test.
  4. **US3, the setting:** the Desk card checkbox and `localStorage`.
  5. **Polish:** README line, the real-browser run of the quickstart, the final gate.
