# Implementation Plan: Furniture Studio and Ready-Made Catalog

**Branch**: `004-furniture-studio` | **Date**: 2026-10-26 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/004-furniture-studio/spec.md`

## Summary

Make furnishing the office quick for everyone, in four parts:

1. **One item format, built from parts.** An item is a name, a group, a season, a kind (floor, deskitem, wall, floorart), a footprint, and up to 24 colored, patterned boxes. The 3D model is those boxes, and the top-down picture is *derived* from them (`renderItemTop`), so the two views cannot disagree. The same pure validator serves the studio, the server, the AI helper and a command-line checker.
2. **A ready-made catalog** of about 90 original items in nine groups, defined in code (`shared/readymade.ts`), so it ships with every install, needs no files, and is tested for counts, validity and look.
3. **New placement kinds.** Desk items stand on a desk and move with it (they refer to the desk by id, like desk claims already do), wall decor hangs on a wall face, and floor art is baked into the floor in both views. `normalizeLayout` keeps layouts free of orphans and over-limit items. Desk rules, collision and privacy still read only floor objects, so they do not change.
4. **The studio and the optional helper.** A studio panel with a parts list, numeric properties, and two live previews (the top-down picture, and a 3D preview drawn by the *same* rasteriser the office uses). Saved items are shared with the office, with versions so that editing an item cannot break copies that no longer fit. An AI helper, off by default and configured by the admin, turns words or a picture into a draft through a `Drafter` interface; its output goes through the same validator and is never saved without the member.

## Technical Context

**Language/Version**: TypeScript 5 (strict), Node 20+ server, browser client built with Vite

**Primary Dependencies**: `ws`, `pngjs`, `vitest` (dev), as today. **No new packages**: the helper calls the service with the platform `fetch`.

**Storage**: JSON files in `data/`: `items/<id>.json` (and `<id>@<n>.json` for kept versions), `studio/<memberId>.json` (one draft per member). `layout.json` stays at format 1. `office-state.json` gains an optional `helperEnabled`; it stays at version 3. See [data-model.md](data-model.md).

**Testing**: Vitest unit tests for the pure modules (item validation, parts-to-boxes, the derived picture, ready-made list checks, `normalizeLayout`, desk-item and wall-decor placement, version pinning) and integration tests (items API, permissions, helper with a fake `Drafter`, edit pinning, privacy of drafts). Real-browser checks follow [quickstart.md](quickstart.md).

**Target Platform**: current desktop Chromium, Firefox and Safari, at device pixel ratio 1 and 2

**Project Type**: web application (Node server, browser client and a `shared/` model)

**Performance Goals**:
- First person at 50 fps or more with 200 mixed items in range (SC-005).
- The studio's previews redraw in under 16 ms for a 24-part item.
- `normalizeLayout` plus `checkLayout` under 10 ms for 2 000 objects.
- A helper draft in under a minute (limited by the service, with a 60 s timeout).

**Constraints**:
- Server-authoritative checks, limits and permissions (Constitution III).
- One shared world model (Constitution II); desk rules untouched (FR-011).
- No Gather art (Constitution I).
- The app must work with no extra services (Constitution V).
- The six built-in items and custom sheet objects stay as they are (FR-006, FR-022).

**Scale/Scope**: about 90 ready-made items, up to 500 studio items, 24 parts per item, one office. About 14 new source files and about 14 changed ones.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | How |
|---|---|---|
| I. Gather parity, original assets | PASS | Gather's builder has a furniture catalog with desks, decor and seasonal-style objects (RG §1); the groups here follow the request rather than copying it. Every ready-made item is designed by this project from boxes and palette colors, and nothing is copied. The deviation of making items from parts is the user's choice (clarification). |
| II. One world, many views | PASS | Items are defined once, in `shared/`. The first-person model and the top-down picture are both derived from the same parts; floor art is baked into the floor for both views; desk items and wall decor are part of the shared layout, so a publish reaches every view and the server. |
| III. Server-authoritative presence and privacy | PASS | The server validates every design and every layout (`validateItem`, `normalizeLayout`), enforces creator/admin rights, limits saves and helper requests, and refuses guests. Studio drafts are returned only to their owner. Helper requests go from the browser to this server to the service; nothing is stored. **Desk privacy is unchanged**: items never take part in desk rules. A new integration test proves a desk with items still keeps its lock and its privacy. |
| IV. Open sprite pipeline | PASS | The item format is documented, versioned and checked by a command-line tool with a template, and the server rejects bad items with specific codes ([contracts/item-format.md](contracts/item-format.md)). The ready-made list and the six built-ins keep the app working with no outside assets. Object sheets (format v1) are untouched. |
| V. Simple to run, tested at the core | PASS | `npm install && npm run dev` still works with nothing else. The helper is behind a `Drafter` interface, off by default, with no new package; the zero-service path is the default. Parsing, validation, normalization, picture derivation and the ready-made list are pure modules with unit tests. Each story has a quickstart scenario. |

**Re-check after Phase 1:** still PASS. The one new network call (the helper) is optional, configured by the admin, never reached by tests, and cannot store anything without a member saving it.

## Project Structure

### Documentation (this feature)

```text
specs/004-furniture-studio/
├── plan.md              # This file
├── research.md          # Phase 0: decisions R1–R13
├── data-model.md        # Phase 1: item definition, catalog entry, placed object fields, drafts, versions
├── quickstart.md        # Phase 1: scenarios Q0–Q7
├── contracts/
│   ├── item-format.md     # item definition v1 and error codes
│   ├── layout-delta.md    # placed object fields, normalizeLayout, merge, compile
│   ├── http-api.md        # /api/items, /api/studio/draft, /api/studio/helper
│   ├── protocol-delta.md  # welcome.items/helper, items and helper messages, admin op
│   └── helper.md          # configuration, what the server does, failure cases
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
shared/
├── items.ts           # NEW: ItemDefinition, validateItem (clamp + codes), partsToBoxes, bounds
├── readymade.ts       # NEW: ~90 ready-made definitions, built with small helpers
├── catalog.ts         # catalogFromDefinition; group/season/kind/by/version/surface on entries; item ids; group listing
├── layout.ts          # PlacedObject v/on/at/wall; parse accepts them; normalizeLayout
├── layout-check.ts    # item-orphan, item-limit
├── layout-merge.ts    # unit value includes v/on/at/wall; normalize after merge
├── world.ts           # deskItems, wallDecor, floorArt in the compiled world; surface heights
├── protocol.ts        # welcome.items/helper; items and helper messages; admin 'helper'
└── map.ts             # (unchanged API)

server/
├── items.ts           # NEW: studio items (data/items), versions, drafts (data/studio), pinning on edit
├── helper.ts          # NEW: Drafter interface, Anthropic provider (fetch), clamp + validate, status
├── api.ts             # /api/items, /api/studio/draft, /api/studio/helper
├── store.ts, office.ts# helperEnabled (optional, default false)
└── app.ts             # load items + readymade into the catalog; helper status; 'helper' admin op; items broadcast

src/
├── item2d.ts          # NEW: renderItemTop(item, rot): the derived top-down picture, cached
├── raster.ts          # NEW: the face rasteriser, moved out of render3d so the studio can use it
├── materials.ts       # NEW: pattern + color → 32×32 texture, cached (replaces the fixed set for items)
├── studio/
│   ├── studio.ts      # NEW: the design, parts editing, autosave of the draft, save / copy / delete
│   ├── preview3d.ts   # NEW: orbiting 3D preview using raster.ts and mesh3d
│   ├── panel.ts       # NEW: parts list, properties, previews, problems
│   └── helper-ui.ts   # NEW: describe/picture request, cancel, status
├── builder/           # catalog panel: groups, season filter, search, New item; tools place desk/wall/floorart kinds
├── mesh3d.ts          # desk items at the host's surface, wall decor on the face, items from boxes
├── render3d.ts        # uses raster.ts; baked floor cells; small-decoration range cut
├── render2d.ts        # draws derived pictures (desk items on desks, wall decor on walls), baked floor art
├── art.ts             # texture painters per pattern (shared by materials.ts and item2d.ts)
├── main.ts            # items/helper messages; recompile on items change
└── office-ui.ts       # Admin: Item helper switch

tools/
├── item-template.ts   # NEW: npm run items:template
├── item-check.ts      # NEW: npm run items:check
└── e2e/cdp.mjs        # (from 003) used for the browser checks

tests/unit/            # NEW: items-validate, items-boxes, readymade, item2d, layout-normalize, layout-desk-items,
                       #      layout-wall-decor, floor-art, items-versions
tests/integration/     # NEW: items-api, items-permissions, items-edit-pinning, studio-draft, helper (fake Drafter),
                       #      desk-items-privacy
```

**Structure decision:** the existing single repository stays as it is. Everything that can be decided without a screen or a network (the format, validation, picture derivation, normalization, the ready-made list) is a pure module in `shared/` or `src/`, as the constitution asks. The studio gets its own `src/studio/` folder, like the builder's.

## Phases

- **Phase 0, research:** [research.md](research.md), decisions R1–R13. No open questions remain.
- **Phase 1, design:** [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md).
- **Suggested build order for tasks:**
  1. **Foundation:** `shared/items.ts` (format, validate, parts to boxes), `src/materials.ts`, `src/raster.ts` (move the rasteriser, the office view must look exactly the same), `src/item2d.ts`; catalog entries from definitions.
  2. **US2, placement kinds (needed by the catalog):** placed object fields, `normalizeLayout`, world exports, 3D and 2D for desk items, wall decor and baked floor art, builder tools to place them with the limits.
  3. **US1, the ready-made catalog:** `shared/readymade.ts` (about 90 items in nine groups), the catalog panel with groups, season filter and search, and the tests that count and render every item.
  4. **US3, the studio:** items store and API, drafts, versions and pinning on edit, the studio panel and previews, the checker and template.
  5. **US4, the helper:** `Drafter`, the provider, the admin switch, the studio's helper button and failure messages.
  6. **Polish:** README and docs, the performance check with 200 items, the final gate.

## Complexity Tracking

No constitution violations. Three decisions deserve noting:

| Decision | Why it is needed | Simpler alternative rejected because |
|---|---|---|
| Derive the top-down picture from the parts | The user chose parts, and the two views must never disagree | Asking members to draw a second view was rejected in clarification |
| Version pinning when an item changes | A copy that no longer fits must keep its size (FR-019) | Refusing edits would block creators, and resizing silently would break other people's layouts |
| Move the rasteriser into its own module | The studio preview must draw exactly what the office draws | A second painter would drift from the office |
