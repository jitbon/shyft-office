# Implementation Plan: Office Customizability

**Branch**: `012-office-customizability` | **Date**: 2026-11-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/012-office-customizability/spec.md`

## Summary

Make the office's *look* customizable on top of the builder (003) and catalog (004):

1. **Finishes.** About 15 pure painters with parameters give at least 25 floor and 20 wall finishes, each in any of 24 swatches or the theme's color. Pixels are made without a canvas, so both views and the tests share them (R2, R3).
2. **Paint in the layout.** Additive `paints`, `floorPaint` and `wallPaint` fields, one character per tile into a table of up to 94 paint keys. `floor` and `walls` still decide collision, so nothing else moves. Old layouts load unchanged (R4).
3. **Themes.** 8 data-defined themes set what legacy floors, plain walls, special walls, ceilings, built-in furniture and first-person light look like. Warm Studio reproduces today's pixels exactly. `Layout.theme` stores the id (R5, R6).
4. **Room styles and kits.** `Room.style.theme` overrides the office theme inside a room. Wall faces follow the tile they face. 8 room kits stamp walls, paints, a styled room and furniture into a draft (R7).
5. **Customize desk.** A per-member `DeskLook` (desk, chair, up to 6 desk items, 1 rug, 1 floor paint) is overlaid on the desk the member holds. It is checked by the server, saved in the state file and shown to everyone. It works when building is off (R8).
6. **Seasonal touches and time-of-day light**, both off by default: painted texture variants and a light curve from the server's date and clock (R6, R9).

## Technical Context

**Language/Version**: TypeScript 5 (strict), Node 20+, Vite client.

**Primary Dependencies**: none new. `pngjs` (already a dependency) writes the finish contact sheet.

**Storage**:
- Layout (`data/layout.json`): additive `theme`, `paints`, `floorPaint`, `wallPaint`, `seasonal`, `daylight`, and `Room.style`.
- State (`data/office-state.json`): additive `deskLooks`, version stays 4.

**Testing**:
- Vitest unit tests:
  - finish painters: deterministic, tileable at their period, right size;
  - catalog counts (≥25 / ≥20 finishes, ≥8 themes, ≥8 kits, ≥16 swatches);
  - Warm Studio matches today's art pixel for pixel;
  - layout parse, normalize and resize of paints;
  - merge by paint key, with clashes;
  - `paintAt` / `styleAt` precedence;
  - room-kit stamping;
  - desk-look validation and overlay;
  - contrast for every theme;
  - time-of-day curve: smooth, never below 0.7.
- ws integration tests: theme publish reaches everyone; desk look saved, broadcast, refused for non-owners and guests, works with building off, survives restart, moves with its desk.
- Browser quickstart Q1–Q6.

**Target Platform**: current desktop Chromium, Firefox and Safari.

**Project Type**: web application (Node server, browser client, `shared/` model).

**Performance Goals**:
- 60 fps in both views with any theme (SC-006);
- publish to everyone in under 2 s (SC-005);
- 2D floor-layer rebuild under 100 ms for a 100×100 office;
- 3D per-pixel cost unchanged apart from 2 multiplies (R11).

**Constraints**:
- Warm Studio must be pixel-identical to today (FR-002, SC-008).
- All art generated in code (FR-025, Constitution I and IV).
- Desk looks never change collision.
- Text contrast ≥ 4.5:1 in every theme (FR-006).

**Scale/Scope**: as built, 15 new source files (plus tests and the sheet tool) and about 28 changed ones.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | How |
|---|---|---|
| I. Gather parity, original assets | PASS | Room kits and Customize desk follow observed Gather behavior (RG §1, §3, recorded in R1). Themes, wall colors, seasonal touches and light are **unknown** in Gather and are listed as deviations in the spec's Assumptions. All art is painted by code; no Gather textures or names. |
| II. One world, many views | PASS | Paints, styles and looks live in the shared layout and `compileWorld` (`paintAt`, `styleAt`). Both views draw from the same painters. Light is first-person presentation keyed off the shared model, and the spec says how 2D degrades (no dynamic light). |
| III. Server-authoritative presence and privacy | PASS | The server validates every theme, paint and style (`parseLayout`) and every desk look (owner, limits, placement), with rate limits. No private context is added; looks are public like desk labels. |
| IV. Open sprite pipeline | PASS / N/A | No sprite format changes, and no uploaded textures (spec clarification). Built-in art stays the default. |
| V. Simple to run, tested at the core | PASS | No new dependency or service. Painters, theme resolution, paint storage, merge, desk-look rules and contrast are pure with unit tests. There is a quickstart per story. |

**Re-check after Phase 1:** still PASS.

## Project Structure

### Documentation (this feature)

```text
specs/012-office-customizability/
├── plan.md              # This file
├── research.md          # Phase 0: decisions R1–R12
├── data-model.md        # Phase 1: Finish, paint key, Layout/Room changes, Theme, RoomKit, DeskLook
├── quickstart.md        # Phase 1: scenarios Q0–Q6
├── contracts/
│   ├── protocol.md      # layout fields and clashes, welcome, season, deskLook / deskLooks
│   └── ui-behavior.md   # Themes tab, finish picker, room style, room kits, Customize desk, rendering
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
shared/
├── finishes.ts        # NEW: Finish list, painters' ids and params, SWATCHES, paint-key parse/format
├── themes.ts          # NEW: Theme data (8), resolve theme for a tile, light, season accents, time-of-day curve
├── room-kits.ts       # NEW: 8 room kits and stampKit(draft, kit, x, y)
├── desk-look.ts       # NEW: DeskLook type, validateDeskLook, applyDeskLook (overlay onto a desk)
├── season.ts          # NEW (as built): Season type and the season for a date and hemisphere
├── layout.ts          # CHANGED: theme, paints, floorPaint, wallPaint, seasonal, daylight, Room.style; parse, normalize, resize
├── layout-merge.ts    # CHANGED: merge paints by key; theme/seasonal/daylight units; new clash keys
├── world.ts           # CHANGED: compileWorld(layout, catalog, looks?) → paintAt, styleAt, overlaid objects
└── protocol.ts        # CHANGED: welcome fields, season, deskLook, deskLooks, deskLookError

server/
├── app.ts             # CHANGED: deskLook handler + rate limit, broadcast looks on claim/unclaim/publish, season tick, welcome fields
├── store.ts           # CHANGED: deskLooks in StoredState (additive)
├── layout-store.ts    # CHANGED: lenient load of unknown finishes/themes
└── index.ts           # CHANGED: OFFICE_FAKE_DATE and OFFICE_HEMISPHERE options

src/
├── finish.ts          # NEW: painters → ABGR pixels, cached by (finish, color, variant, season)
├── surfaces.ts        # NEW (as built): a tile's floor, wall faces and ceiling as pixels for both views
├── seasonal.ts        # NEW (as built): seasonal layers over windows and plain walls
├── light.ts           # NEW (as built): the season and time-of-day tint on first-person light
├── pixelctx.ts        # NEW (as built): a canvas-free fillStyle/fillRect context, so art.ts painters make Textures
├── palette.ts         # CHANGED: paletteFor(theme); PALETTE stays Warm Studio
├── art.ts             # CHANGED: floors, walls, ceiling and built-in furniture take a palette/paint instead of the constant
├── render2d.ts        # CHANGED: floor/wall layer from paintAt/styleAt; themed room labels; look overlay in build mode
├── render3d.ts        # CHANGED: per-cell textures from the world, tinted light with fog color, room blend, time of day
├── raster.ts          # CHANGED: shadeRGB(c, f, light)
├── builder/
│   ├── themes.ts      # NEW: Themes tab (cards, seasonal and daylight switches)
│   ├── kits.ts        # NEW: Room kits tab and stamping tool
│   ├── panel.ts       # CHANGED: finish picker with groups/search/colors; room Style dropdown
│   └── tools.ts       # CHANGED: paint tools write paints; kit stamp tool
├── desk-look/
│   └── panel.ts       # NEW: Customize desk panel and previews
├── office-ui.ts       # CHANGED: Customize desk button on the "Your desk" cue (planned for desk-presence.ts, which is unchanged)
├── callPanel.ts       # CHANGED: Customize desk button in the desk view heading
└── main.ts            # CHANGED: route season/deskLooks, pass looks to the world, clock offset for daylight

tools/
└── finishes-sheet.ts  # NEW: `npm run finishes:sheet` contact sheet PNG

tests/
├── unit/finishes.test.ts, themes.test.ts, warm-studio.test.ts, layout-paint.test.ts, merge-paint.test.ts,
│   world-paint.test.ts, room-kits.test.ts, desk-look.test.ts, contrast.test.ts, daylight.test.ts,
│   builder-paint.test.ts, seasonal.test.ts (as built),
│   paint-helpers.ts (fake 2D context that records fillStyle/fillRect into pixels, pixel hashes, tiny layouts)
└── integration/ws-paint.test.ts, ws-theme.test.ts, ws-desk-look.test.ts
```

**Structure Decision**: the existing single repository with `shared/` (pure rules), `server/` (authority) and `src/` (browser), as in features 003 and 004. Painters go in `src/finish.ts` next to `src/pattern.ts` because they produce renderer pixels, but they are pure (no DOM), so tests import them directly.

## Delivery order

1. **Finishes + paint storage + Warm Studio equivalence** (Story 2 core). It is the base for everything else, and proves nothing changes visually.
2. **Themes** (Story 1).
3. **Customize desk** (Story 4). It needs only finishes and the catalog, so it can go in parallel with 4.
4. **Room styles and kits** (Story 3).
5. **Seasonal and time of day** (Story 5).

## Risks

- **Pixel-identical Warm Studio**: today's floor and wall code reads world coordinates and the palette directly. The refactor must keep both. The equivalence test is written first, against today's code.
- **Art quality is subjective**: "pretty" can't be unit-tested. The contact sheet (R3) and the blind theme comparison (SC-002) are the checks, and the owner should review the sheet before themes are tuned.
- **Merge complexity**: paints add new clash units. Merge tests cover different tiles, the same tile, and table re-indexing.

## Complexity Tracking

No constitution violations to justify.
