# Implementation Plan: Higher-Detail Office and Polished Interface

**Branch**: `002-hd-office-polish` | **Date**: 2026-10-25 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/002-hd-office-polish/spec.md`

## Summary

Make the office look like Gather v1 instead of 8-bit, in three parts:
1. **Art at 32 px per tile.** All built-in art is redrawn at 32 pixels per tile and per character frame, twice today's 16. That covers floors, walls, furniture and characters, in a softer palette. The 2D canvas becomes aware of high-density screens, and zoom moves to whole-number steps, so the art stays crisp. The first-person view uses the same 32-px painters.
2. **Fewer, wider desks.** The open office is re-laid out as 12 desks, each 3 tiles wide, in 3 pods of 4 (two facing two). Desk detection learns about multi-tile desks. The saved office state moves to version 2: loading a version-1 file releases every claim once, and tells each former holder once that desks were reset.
3. **Rounder interface.** Every panel and button gets rounded corners, and the text font changes from VT323 / Press Start 2P to Nunito. Name tags and chat bubbles on the map are drawn rounded, in the same font.

Behaviour is otherwise unchanged. The sprite-sheet format stays v1: it already accepts both 16-px and 32-px frames, and only the rendering of 32-px frames changes, from downscaled to native.

## Technical Context

**Language/Version**: TypeScript 5 (strict), Node 20+ server, browser client built with Vite

**Primary Dependencies**: `ws`, `pngjs`, and `vitest` (dev), as today. No new packages. The Nunito font comes from Google Fonts, replacing the two fonts loaded today (see research R6).

**Storage**: `data/office-state.json`, version 1 → 2 (see [data-model.md](data-model.md))

**Testing**: Vitest unit and integration tests, plus real-browser checks through the quickstart

**Target Platform**: current desktop Chromium, Firefox and Safari, at device pixel ratio 1 and 2

**Project Type**: web application (Node server + browser client + `shared/` model)

**Performance Goals**: at least 50 frames per second in 2D and first-person on a typical laptop (SC-003); map pre-render under 200 ms

**Constraints**: crisp pixel art (whole-number scale in device pixels); no Gather assets (Constitution I); sprite format v1 stays valid (FR-015)

**Scale/Scope**: about 12 source files touched; built-in art fully redrawn; 1 map region re-laid out

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | How |
|---|---|---|
| I. Gather parity, original assets | PASS | 32-px tiles follow Gather v1's tile size (observed earlier and recorded in `specs/001…/research-gather.md`). All art is still painted in code by this project, and nothing is copied. |
| II. One world, many views | PASS | The new desk layout lives only in `shared/map.ts`. Both views read it. The 3D textures are painted by the same 32-px tile painters as 2D, so new art reaches both views (FR-004). |
| III. Server-authoritative privacy | PASS | Desk rules are unchanged. The desk-reset notice is decided and sent by the server, only to the affected member. The existing desk-privacy tests are rerun against the new desk IDs. |
| IV. Open sprite pipeline | PASS | Format stays v1, and both frame sizes still validate. The template and docs now recommend 32 px. Built-in code-generated art remains the default. |
| V. Simple to run, tested | PASS | No new infrastructure or packages. Pure logic gets unit tests: multi-tile desk detection, the v1→v2 state migration, and zoom/scale maths. The visual work gets quickstart scenarios. |

**Re-check after Phase 1:** still PASS. The data model adds only a saved list of member IDs to notify, and the protocol adds one notice kind.

## Project Structure

### Documentation (this feature)

```text
specs/002-hd-office-polish/
├── plan.md              # This file
├── research.md          # Phase 0: decisions R1–R9
├── data-model.md        # Phase 1: desk layout, saved state v2, render scale
├── quickstart.md        # Phase 1: validation scenarios
├── contracts/
│   ├── office-state-v2.md   # saved-state file and migration
│   ├── protocol-delta.md    # the one new notice kind
│   └── sprite-format.md     # what changes (and doesn't) for sheet authors
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
shared/
├── map.ts          # new open-office rows; 3 pods; deriveDesks handles multi-tile desks
└── protocol.ts     # NotifyKind += 'deskReset'

server/
├── store.ts        # StoredState v2; v1 → v2 migration; deskResetNotice list
├── office.ts       # carries the notice list; take-and-clear on join
└── app.ts          # sends the one-time 'deskReset' notice on join

src/
├── art.ts          # TILE = 32; every painter redrawn at 32 px; 32-px avatars; native 32-px sheets
├── render2d.ts     # device-pixel-aware drawing; rounded name tags and bubbles; Nunito
├── render3d.ts     # 32-px shared textures; RENDER_H raised; 32-px billboards
├── scale.ts        # NEW: pure zoom/scale maths (device pixel ratio → crisp whole-number zooms)
├── main.ts         # DPR-aware canvas sizing; zoom steps from scale.ts; deskReset notice
├── callPanel.ts    # tile radius (talking outline follows it)
└── style.css       # design tokens: radii, Nunito, softer palette; every panel rounded

index.html          # font link: Nunito replaces Press Start 2P + VT323
tools/sprite-template.ts  # default --size 32
sprites/FORMAT.md, sprites/template.png  # recommend 32-px frames

tests/unit/
├── desks-layout.test.ts   # NEW: 12 desks, 3 pods of 4, 3-tile surfaces, aisles ≥ 2
├── store.test.ts          # v1 → v2 migration cases
└── scale.test.ts          # NEW: zoom steps per device pixel ratio
tests/integration/         # desk ids updated (pod-1:4,12 → new ids); deskReset notice test
```

**Structure Decision**: this keeps the existing single repository, with `shared/`, `server/`, `src/` and `tests/` as in feature 001. The only new source file is `src/scale.ts`, which holds the zoom maths in a pure, testable module, as Constitution V requires.

## Phases

- **Phase 0, research**: [research.md](research.md), decisions R1–R9. No open questions remain.
- **Phase 1, design**: [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md).
- **Suggested build order for tasks**:
  1. **Foundation**: scale maths, then the DPR-aware canvas and `TILE = 32` with the art scaled up 2× as a placeholder, so everything runs at the new size before any redraw.
  2. **US1, art**: redraw the tiles, furniture and avatars; switch the 3D textures to the shared painters; render 32-px sheets natively.
  3. **US2, desks**: map rows, `deriveDesks`, store v2 migration and notice, test id updates.
  4. **US3, interface**: CSS tokens and font, rounded canvas labels.
  5. **Polish**: sprite template and docs, frame-rate check, quickstart run.

## Complexity Tracking

No constitution violations to justify.
