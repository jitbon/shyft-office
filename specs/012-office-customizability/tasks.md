---

description: "Tasks for Office Customizability (themes, finishes, room styles, Customize desk, seasonal touches)"
---

# Tasks: Office Customizability

**Input**: design documents in `specs/012-office-customizability/`: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/protocol.md](contracts/protocol.md), [contracts/ui-behavior.md](contracts/ui-behavior.md) and [quickstart.md](quickstart.md)

**Tests**: included.
- Constitution V asks for unit tests of deterministic logic: painters, theme resolution, paint storage and merge, desk-look rules, contrast and the light curve.
- FR-002 and SC-008 need a pixel test proving Warm Studio matches today's art. **That test is written first (T005), against today's code, before any art is refactored.**

Write each story's tests before its code and see them fail first.

**Organization**:
- US1 (themes) and US2 (finishes and colors) are P1. US3 (room styles and kits) and US4 (Customize desk) are P2. US5 (seasonal and time of day) is P3.
- The painters, paint keys, theme data shape, layout fields and `paintAt`/`styleAt` are foundational, because every story draws through them.
- US2 comes before US1 in delivery order (plan.md "Delivery order"), because themes are made of finishes. Both are P1 and together form the MVP.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US5 from spec.md
- Paths are relative to the repository root

## Notes for every task

- **Old offices look the same.** A layout without the new fields must render pixel-identically to today (FR-004, SC-008). Run `tests/unit/warm-studio.test.ts` after every art change.
- **Look never changes behavior.** Theme, paint, style and desk-look changes never move walls, objects, rooms (other than `style`), pods, claims or spawn, and never change collision (contracts/protocol.md invariants 2–3).
- **Painters are pure.** `src/finish.ts` and `shared/themes.ts` use no DOM, timers or `Math.random`. Noise comes from `hash(worldX, worldY)` with a per-finish seed. Same inputs, same pixels.
- **Validate on the server with the exact limits** in data-model.md: `MAX_PAINTS` 94, paint key `^[a-z0-9-]{1,32}(:[0-9a-f]{6})?$` with a color from `SWATCHES`, `DESK_ITEMS_MAX` 6, `DESK_RUGS_MAX` 1, light per channel 0.6–1.2, night never below 0.7.
- **All art is original and generated** (FR-025). No image files and no new npm packages.
- **Existing behavior stays.** The full suite must pass after every phase.
- **Rebuild before checking in a browser** (`npm run build`).

---

## Phase 1: Setup

**Purpose**: test scaffolding and the visual review tool.

- [x] T001 Add the `finishes:sheet` script (`tsx tools/finishes-sheet.ts`) to `package.json`, and create an empty `tools/finishes-sheet.ts` that writes `out/finishes.png` with `pngjs` (already a dependency). Add `out/` to `.gitignore` if it isn't there.
- [x] T002 [P] Add a test helper `tests/unit/paint-helpers.ts`:
  - `fakeCtx(w, h)`: a minimal stand-in for `CanvasRenderingContext2D` that supports the `fillStyle` setter (`#rrggbb`) and `fillRect(x, y, w, h)`, writing into a `Uint32Array` in the same ABGR layout as `Texture`. The floor, wall and ceiling painters in `src/art.ts` draw only through `rect()` (`src/wardrobe/draw.ts`), which uses just these two. Throw on any other call so a missed one is obvious. Tests run in Node (`vitest.config.ts` `environment: 'node'`) and no canvas package may be added;
  - `pixelHash(pixels)`: a stable hash of a `Texture`'s or `fakeCtx`'s pixels;
  - `tinyLayout(w, h, opts)`: a valid layout with chosen floor and wall codes;
  - `withPaint(layout, tiles, key, surface)`.
- [x] T003 [P] Add `OFFICE_FAKE_DATE` (ISO date-time; the server's clock reads it as the start time and then advances normally) and `OFFICE_HEMISPHERE` (`north` default, or `south`) to `server/index.ts`, passed into `createApp` as a `clock` option. Document both in `README.md` under configuration.

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: finishes, paint keys, theme shape, the new layout fields and per-tile resolution. No story is visible until these are done.

**⚠️ CRITICAL**: no user-story work can begin until this phase is complete.

### Tests for the foundation (write first, see them fail)

- [x] T004 [P] Write `tests/unit/finishes.test.ts`:
  - every finish has a unique `id` matching `[a-z0-9-]{1,32}`, a name ≤ 32 characters, surface `floor` or `wall`, and `period` 32 or 64;
  - `parsePaintKey`/`formatPaintKey` round-trip;
  - keys with an unknown finish, an upper-case color or a color not in `SWATCHES` are refused;
  - `SWATCHES` has at least 16 entries (24 planned) of `#rrggbb`;
  - each painter gives the same pixels on two calls;
  - each texture is tileable at its period: the left and right columns, and top and bottom rows, continue the pattern when sampled by world position.
- [x] T005 [P] Write `tests/unit/warm-studio.test.ts` **against today's code first**, before any art file is changed. Use `fakeCtx` (T002) to call today's `drawFloor(ctx, code, 0, 0, sx, sy)` for each floor code `. , ; _` at tiles (0,0), (3,1) and (7,5), today's 2D wall drawing for each wall code `# G W B K` (face visible and not, edge above and not), and the painting functions behind `makeWallTextures` and `makeCeilingTextures` at 32×32. Record each `pixelHash` in the test as a constant, then commit.
  - Later tasks must keep these exact hashes when drawing with the Warm Studio theme and no paint.
  - If a painter turns out to call anything besides `fillStyle`/`fillRect`, extend `fakeCtx` for that call rather than changing `art.ts` first.
- [x] T006 [P] Write `tests/unit/layout-paint.test.ts`:
  - a layout with no new fields parses to the same layout as today;
  - `theme` must be a known id (`bad-theme`);
  - `paints` must hold at most `MAX_PAINTS` (94) distinct valid keys, with no duplicates (`too-many-paints`, `bad-paint`);
  - `floorPaint`/`wallPaint` must be exactly `w*h` characters, each `' '` or `!`..`~` indexing into `paints` (`bad-paint-grid`);
  - a floor finish in `wallPaint`, or the reverse, is `bad-paint`;
  - `normalizeLayout` drops unused paints, re-indexes the strings, and clears `wallPaint` on tiles that aren't plain `#` walls;
  - `Room.style.theme` must be known;
  - `seasonal` and `daylight` must be booleans when present;
  - the lenient load path (`parseLayout(..., { lenient: true })`) replaces an unknown finish with the theme default for its surface and an unknown theme with `warm-studio`.
- [x] T007 [P] Write `tests/unit/world-paint.test.ts` for `paintAt(x, y, surface)` and `styleAt(x, y)` precedence: desk-look floor (stub, until US4) > explicit paint > room style's theme > office theme. Also: a wall face takes the style of the floor tile it faces (south face → tile below; in 3D, each side's neighbor); a theme-color paint resolves to the color of the theme that applies at that tile; a fixed-color paint doesn't.

### Implementation of the foundation

- [x] T008 Create `shared/finishes.ts`:
  - `Finish` exactly as data-model.md (`id`, `name`, `surface`, `group`, `painter`, `params`, `period: 32 | 64`, `defaultColor`);
  - `PainterId` union;
  - `SWATCHES` (24 named colors);
  - `MAX_PAINTS = 94`, `UNPAINTED = ' '`;
  - `PAINT_KEY_RE = /^[a-z0-9-]{1,32}(:[0-9a-f]{6})?$/`;
  - `parsePaintKey(key) → { finish, color?: string } | null`, `formatPaintKey`, `finishById`;
  - `paintChar(i) = String.fromCharCode(33 + i)`, `paintIndex(ch)`.
  Start the list with the five Warm Studio legacy finishes: `wood-plank-classic`, `carpet-blue`, `library-diamond`, `kitchen-check`, `plaster-wall`.
- [x] T009 Create `src/finish.ts`: `finishPixels(finish, color, worldX, worldY, variant?) → Texture` (32×32 for the tile at that world position) and `finishTexture(finish, color) → Texture` (one full period, for the 3D sampler), cached by `(id, color, variant)`. Both are pure and canvas-free, like `src/pattern.ts`. Implement the `legacy-*` painters that reproduce today's `drawFloor` (`.`, `,`, `;`, `_`) and `paintWallFace('#')` pixel for pixel from a palette argument. Make T005 pass for floors and plain walls through this path.
- [x] T010 Create `shared/themes.ts`:
  - the `Theme` and `SeasonAccent` types exactly as data-model.md;
  - `DEFAULT_THEME = 'warm-studio'`, `themeById`, `LIGHT_MIN = 0.6`, `LIGHT_MAX = 1.2`;
  - only Warm Studio for now, built from today's `PALETTE` values, with `floors` mapping `. , ; _` to the legacy finishes, `wall: 'plaster-wall'`, and light `{ r: 1, g: 1, b: 1, fog: '#000000' }`.
- [x] T011 Change `src/palette.ts`: add `paletteFor(theme: Theme)` returning the full `PALETTE` shape with the theme's `cap`, `trim`, `special`, `furniture` and `ceiling` colors filled in. `PALETTE` stays as the Warm Studio result, so every existing import still works.
- [x] T012 Change `shared/layout.ts`:
  - add `theme?`, `paints?`, `floorPaint?`, `wallPaint?`, `seasonal?`, `daylight?` to `Layout` and `style?: { theme: string }` to `Room`;
  - validate them in `parseLayout` with the codes `bad-theme`, `bad-paint`, `too-many-paints`, `bad-paint-grid`;
  - add a `lenient` option for the server's own saved file;
  - carry them through `cloneLayout`, and compact paints in `normalizeLayout`.
  Make T006 pass.
- [x] T013 Change `src/builder/tools.ts` `resize` to resize `floorPaint` and `wallPaint` with the same rule as `floor`/`walls` (new tiles are `' '`). Extend `tests/unit/layout-paint.test.ts` with a resize case.
- [x] T014 Change `shared/world.ts` `compileWorld(layout, catalog, looks?)`: precompute per tile the resolved floor paint, wall-face paints (n, e, s, w), ceiling paint and style theme id. Expose `paintAt`, `wallFacePaint(x, y, face)`, `styleAt`. `looks` is accepted and ignored until US4. Make T007 pass.
- [x] T015 Change `src/art.ts` so `drawFloor`, `drawWall2D`, `makeWallTextures`, `makeFloorTextures` and `makeCeilingTextures` take a resolved paint (finish + color) and a palette, and draw through `src/finish.ts`. The special walls (`G W B K`) keep their own drawing code and read colors from the palette argument. T005 must still pass unchanged.
- [x] T016 Change `src/render2d.ts` `paintTile` and the wall pass to draw from `world.paintAt` / `wallFacePaint` with `paletteFor(themeById(world.styleAt(x, y)))`. Rebuild the cached map layer when the layout's theme or paints change (they do, as part of publish).
- [x] T017 Change `src/render3d.ts` to build per-cell floor, ceiling and wall-face texture arrays from the world when it changes, instead of one texture per code. Sample finish textures by world position modulo their period. T005 and the existing 3D tests must still pass.
- [x] T018 Change `shared/layout-merge.ts`:
  - units `paint-floor:x,y` and `paint-wall:x,y` compare the **paint key** (not the index); add `theme`, `seasonal` and `daylight` units;
  - rebuild a compact `paints` table for the merged result;
  - room `style` is part of the `room:<id>` unit.
  Add `tests/unit/merge-paint.test.ts`: different tiles with different paints merge cleanly; the same tile painted differently is a clash; both sides adding new paints re-index correctly; a theme changed differently on both sides is a `theme` clash.
- [x] T019 Change `server/layout-store.ts` to load the saved layout with `parseLayout(..., { lenient: true })` and publish with the strict path.

**Checkpoint**: the suite passes, a layout without new fields looks identical in both views, and paints in a hand-written layout render in both views.

---

## Phase 3: User Story 2 - Paint with many more finishes and colors (Priority: P1) 🎯 MVP part 1

**Goal**: builders paint floors and plain walls with at least 25 floor and 20 wall finishes, in theme color or one of the swatches, and everyone sees the same in both views.

**Independent Test**: quickstart Q3. Paint a room herringbone sage and its walls striped wallpaper in theme color, publish, and check it in a second window in both views. Paint the same tile differently in two drafts: a clash.

### Tests for User Story 2

- [x] T020 [P] [US2] Extend `tests/unit/finishes.test.ts`: at least 25 `floor` and 20 `wall` finishes; every group named in data-model.md (floors: wood, tile, stone, soft, outdoor, special; walls: paint, wallpaper, masonry, panel, special) has at least 2; floor finishes keep lightness between 35% and 75% for every swatch (R3); no two finishes produce the same pixels in the same color.
- [x] T021 [P] [US2] Write `tests/integration/ws-paint.test.ts`: a builder publishes a layout with `paints`/`floorPaint`/`wallPaint`; a second client receives it in the `layout` message; a malformed paint key or grid is refused with its code; a guest's publish is refused as today.

### Implementation for User Story 2

- [x] T022 [US2] Implement the remaining painters in `src/finish.ts`: `planks`, `herringbone`, `chevron`, `parquet`, `tiles`, `hex`, `terrazzo`, `concrete`, `stone`, `carpet`, `grass`, `paint`, `wallpaper`, `brick`, `panel`, `felt`, `metal`, `glassblock`. Each uses the 4-step hue-shifted ramp from one base color (light 0.22, dim 0.2, dark 0.38; lights toward warm, darks toward cool) and noise on at most 12% of pixels (R3).
- [x] T023 [US2] List the finishes in `shared/finishes.ts`: at least 25 floors (for example classic, wide and narrow planks, herringbone, chevron, parquet, deck, square tile, large tile, subway floor, hex tile, checker, terrazzo, polished concrete, rough concrete, flagstone, marble, cork, rubber, loop carpet, striped carpet, felt, grass, sand, rug field, and the legacy four) and at least 20 walls (flat paint, eggshell with trim, stripes, pinstripe, dots, geometric, botanical, damask-like motif, wainscot, vertical panel, shiplap, red brick, white brick, concrete board, subway tile, stone, glass block, acoustic felt, corrugated metal, chalkboard, plaster). Use original names.
- [x] T024 [US2] Write `tools/finishes-sheet.ts`: a contact sheet of every finish in 4 swatches, each over a 3×3 tile block (to show seams) at 1× and 3×, labeled with its id. Run it and look at `out/finishes.png` for seams and noise.
- [x] T025 [US2] Change `src/builder/tools.ts`:
  - `paintFloor(l, tiles, key)` and `paintWall(l, tiles, key)` accept a paint key: they add it to `paints` (or reuse it), and return a `table-full` reason when 94 are in use and the key is new;
  - `paintWall` on an empty tile creates a plain `#` wall with that paint, on a plain wall repaints it, and on `G W B K` does nothing;
  - the eraser clears paint back to `' '`.
  Keep the old code-based calls working for the special walls.
- [x] T026 [US2] Change `src/builder/panel.ts` per contracts/ui-behavior.md "floor and wall finishes": group headings, a search box (case-insensitive substring on name and id), 32×32 finish previews at 2× from `src/finish.ts`, and a color row (**Theme color** plus the 24 swatches) that redraws the previews. Special walls stay in their own list. Show "This office uses the most finishes it can. Reuse one already in the office." on `table-full`.
- [x] T027 [US2] Change `src/builder/builder.ts` to keep the chosen finish and color as the paint tool's current key, and route paint, drag and rectangle tools through T025. Each stroke is one undo step.
- [x] T028 [US2] Show the merge dialog's new clash kinds (`paint-floor`, `paint-wall`) in `src/builder/builder.ts` with their tiles marked, using the existing clash UI.

**Checkpoint**: quickstart Q3 steps 1–3, 5 and 6 pass. Step 4 needs US1.

---

## Phase 4: User Story 1 - Restyle the whole office with a theme (Priority: P1) 🎯 MVP part 2

**Goal**: 8 themes restyle floors, walls, ceiling, built-in furniture and first-person light in one step, published like any layout change.

**Independent Test**: quickstart Q1 and Q2. Switch to Industrial Loft, publish, and check that a second window sees it in both views within 2 s with nothing moved. Undo back to Warm Studio, pixel-identical.

### Tests for User Story 1

- [x] T029 [P] [US1] Write `tests/unit/themes.test.ts`:
  - at least 8 themes with unique ids;
  - every theme's `floors`, `wall` and `ceiling` keys parse and use finishes of the right surface;
  - light channels are within 0.6–1.2;
  - every `special` and `furniture` color is `#rrggbb`;
  - each has all four `seasons`;
  - any two themes differ in the average color of their main floor by a visible amount (ΔE ≥ 10), as a proxy for SC-002;
  - SC-003: (floor finishes × (swatches + 1 for theme color)) × themes is at least 1,000 distinct room looks.
- [x] T030 [P] [US1] Write `tests/unit/contrast.test.ts` (R10, FR-006, SC-007): for every theme, `labelInk` with a 2 px `labelHalo` has at least 4.5:1 contrast against the average color of every finish and color the theme draws. The name-tag and marker pill colors against their text are at least 4.5:1, independent of theme.
- [x] T031 [P] [US1] Write `tests/integration/ws-theme.test.ts`:
  - a builder publishes `theme: 'industrial-loft'` and a second client receives it within 2 s (SC-005);
  - objects, rooms, pods, claims and spawn are unchanged;
  - a restart keeps the theme;
  - `bad-theme` is refused;
  - publishing with building turned off is refused for non-admins, as today.

### Implementation for User Story 1

- [x] T032 [US1] Add the other 7 themes to `shared/themes.ts`: Scandinavian, Industrial Loft, Cozy Cabin, Night Mode, Garden Atrium, Retro Arcade and Space Station. Each has its own finishes for the legacy floors and plain walls, colors, light and fog, `labelInk`/`labelHalo`, and season accents. Each has a distinct value range and hue family (R5). Tune them using `npm run finishes:sheet` with a theme row added to the sheet.
  - Themes were tuned from the Themes-tab previews and a test that keeps any two main floors at least ΔE 10 apart (`tests/unit/themes.test.ts`). The theme row on the contact sheet was added in T077.
- [x] T033 [US1] Change `src/art.ts` built-in furniture (desk, chair, table, plant, sofa, and their first-person materials in `makeMaterials`) to take colors from the palette argument (`paletteFor(theme).desk`, `.chair`, …), so furniture follows the theme (FR-001). Warm Studio hashes in T005 must not change.
- [x] T034 [US1] Change `src/raster.ts`: add `shadeRGB(c, f, light)` multiplying r, g and b by `f·light.r`, `f·light.g`, `f·light.b`, then mixing toward `light.fog` by `1 − f` beyond the existing fog minimum. Change `src/render3d.ts` to use it with the theme's light, computed once per frame (R6). Warm Studio, with light 1,1,1 and black fog, must give today's pixels.
- [x] T035 [US1] Change `src/render2d.ts` room labels to draw with the theme's `labelInk` and a 2 px `labelHalo` outline (R10). The ♪ Jam Room label uses the same colors.
- [x] T036 [US1] Create `src/builder/themes.ts`, the Themes tab (contracts/ui-behavior.md): cards with name and a 96×64 preview (main floor strip, plain wall, a desk with a chair) painted with `src/finish.ts` and `paletteFor`. Clicking sets `layout.theme` in the draft as one undo step and marks the active card. Add the tab in `src/builder/panel.ts`.
- [x] T037 [US1] Make sure a theme change in the draft re-renders both views at once: the 2D map layer rebuilds, and the 3D per-cell textures and light update. Go through `recompile()` in `src/world-client.ts` (called from `src/main.ts`), which already recompiles the world for draft previews and publishes.

**Checkpoint**: quickstart Q1, Q2 and Q3 step 4 pass. **MVP complete** (US1 + US2).

---

## Phase 5: User Story 4 - Decorate your own desk space (Priority: P2)

**Goal**: the holder of a claimed desk swaps desk, chair and computer, adds up to 6 desk items, 1 rug and a floor finish, without builder rights. Everyone sees it, and it is saved.

**Independent Test**: quickstart Q5.

### Tests for User Story 4

- [x] T038 [P] [US4] Write `tests/unit/desk-look.test.ts` for `validateDeskLook(look, desk, layout, catalog)` and `applyDeskLook`:
  - `desk`/`chair` must exist and have the same footprint (`wrong-size`);
  - `computer` must be a `deskitem` in the `computers` group (or `null` for none; absent keeps the builder's computer) and isn't counted in the 6;
  - `items` must be `deskitem` kinds, at most `DESK_ITEMS_MAX` = 6, fitting on the desk surface by the builder's desk-item rules;
  - `rug` must be `floorart`, at most `DESK_RUGS_MAX` = 1, every covered tile in `desk.tiles` (`outside-space`);
  - `floor` must be a valid floor paint key (`bad-paint`);
  - unknown kinds are `unknown-item`;
  - applying to a turned or moved desk places pieces relative to it;
  - applying to a desk where a piece doesn't fit skips that piece;
  - collision is identical with and without a look.
- [x] T039 [P] [US4] Write `tests/integration/ws-desk-look.test.ts`:
  - the holder sends `deskLook`, which is saved and broadcast as `deskLooks`, reaching another client within 2 s (FR-020);
  - a non-holder gets `no-desk` and a guest gets `not-member`, sent only to the sender;
  - it works with building turned off;
  - 2 messages within 1 s gives `rate`;
  - a restart keeps it;
  - unclaim removes it from `deskLooks` but keeps it saved, and the next claim shows it again;
  - a publish that moves the desk keeps it attached;
  - a publish that deletes the desk removes it from `deskLooks`, keeps it saved for the member (FR-022), and the desk-removed notice says the decorations are kept;
  - `deskLook: null` resets.

### Implementation for User Story 4

- [x] T040 [US4] Create `shared/desk-look.ts`: the `DeskLook` and `StoredDeskLook` types exactly as data-model.md, `DESK_ITEMS_MAX = 6`, `DESK_RUGS_MAX = 1`, `validateDeskLook` returning a protocol error code, `clampDeskLook` for untrusted input, and `applyDeskLook(layoutObjects, desk, look, catalog)` returning the objects to show (replacements, items, rug) and the builder desk-item ids to hide. Reuse `deskTileOf`, `turnPoint` and `rotFootprint` from `shared/layout.ts`. Make T038 pass.
- [x] T041 [US4] Change `shared/world.ts` `compileWorld(layout, catalog, looks)` to overlay looks for claimed desks: replace desk/chair objects, add items and the rug, hide the builder's desk items on that desk, and set the desk-look floor paint for the space's floor tiles (top precedence in `paintAt`). Collision is computed from the base layout.
- [x] T042 [US4] Change `shared/protocol.ts`: client `{ t: 'deskLook'; look: DeskLook | null }`; server `{ t: 'deskLooks'; looks: Record<string, DeskLook> }` and `{ t: 'deskLookError'; code; message }`; welcome gains `deskLooks`.
- [x] T043 [US4] Change `server/store.ts`: `deskLooks?: Record<memberId, StoredDeskLook>` (additive; version stays 4). Parse it with `clampDeskLook` and drop entries for invalid member ids.
- [x] T044 [US4] Change `server/app.ts`:
  - handle `deskLook` with rate key `desklook:<memberId>` (1 per second), checking member, claim and `validateDeskLook` against the member's current desk;
  - save and broadcast `deskLooks` (keyed by desk id, only for claimed desks with a look) on save, reset, claim, unclaim and layout publish;
  - include `deskLooks` in the welcome;
  - change the desk-removed notice text to add "Your desk decorations are saved for your next desk."
  Make T039 pass.
- [x] T045 [US4] Change `src/main.ts` / `src/world-client.ts` to keep the latest `deskLooks` and pass them into `compileWorld`, recompiling when they change.
- [x] T046 [US4] Create `src/desk-look/panel.ts`, the Customize desk panel (contracts/ui-behavior.md):
  - Desk and Chair pickers filtered to same-footprint items;
  - a Computer picker (none, or the Computers group);
  - "On the desk" list with add (desk items only), remove and a "n / 6" counter that doesn't count the computer;
  - Rug picker, and drag on the preview to place it;
  - Floor finish and color;
  - Save and Reset to office default;
  - a top-down preview of the space and a first-person thumbnail;
  - server errors shown inline, with edits kept.
  - The first-person thumbnail was added in T070; dragging on the preview in T072; picture tiles for Desk and Chair in T074.
- [x] T047 [US4] Change `src/desk-presence.ts` and `src/main.ts` (as built: `showDeskCue` in `src/office-ui.ts` and `setCustomize` in `src/callPanel.ts`, wired from `src/main.ts`; `src/desk-presence.ts` is unchanged) to show a **Customize desk** button on the "Your desk" cue and the desk view heading, only for a member in their own desk space, also while building is off. Never show it to guests.
- [x] T048 [US4] Change `src/render2d.ts` build mode to draw a customized desk as the builder's base with the owner's look as a dimmed overlay on top, with the hover text "Decorated by <name>: their look shows while they hold this desk."
  - The dimmed overlay of the owner's look was added in T071.

**Checkpoint**: quickstart Q5 passes.

---

## Phase 6: User Story 3 - Give a room its own style (Priority: P2)

**Goal**: rooms override the office theme, and 8 room kits stamp a whole styled room in one step.

**Independent Test**: quickstart Q4.

### Tests for User Story 3

- [x] T049 [P] [US3] Extend `tests/unit/world-paint.test.ts`: a styled room's floor and ceiling tiles resolve to its theme; a wall between the room and the office shows the room's style on the inside face and the office theme on the outside face; explicit paint wins over a room style; clearing the style returns to the office theme; changing `style` leaves `private`, `jam`, `capacity`, `restricted` and `allowed` untouched.
- [x] T050 [P] [US3] Write `tests/unit/room-kits.test.ts`: at least 8 kits; each is at most 12×12, has a doorway on its edge, uses known finishes, themes and catalog items; `stampKit` on an empty 30×30 layout produces a layout that `parseLayout` accepts and `checkLayout` reports no problems for; the room inside is reachable from the doorway; stamping off the grid, over a claimed desk or over spawn is refused with `off-map`, `covers-desk` or `covers-spawn`; new object ids don't collide.

### Implementation for User Story 3

- [x] T051 [US3] Change `src/builder/panel.ts` room properties: a **Style** dropdown ("Office theme" plus every theme, with a small preview). Use `updateRoom` in `src/builder/tools.ts` with a `style` patch, as one undo step.
- [x] T052 [US3] Change `src/render3d.ts` to blend the light over 1 tile when the camera crosses a room edge with a different style (R7), using `styleAt` of the camera's tile and its neighbor.
- [x] T053 [US3] Create `shared/room-kits.ts`: the `RoomKit` type exactly as data-model.md, at least 8 original kits (lounge, library corner, boardroom, café, game room, quiet booth, studio, garden nook), and `stampKit(layout, kit, x, y, occupied)` returning `{ layout } | { error: 'off-map' | 'covers-desk' | 'covers-spawn' }`. It writes walls, paints, objects with fresh ids (`newId`), and a room with its style. Make T050 pass.
- [x] T054 [US3] Create `src/builder/kits.ts`, the Room kits tab: cards with name, size and preview; a hover outline (green or red with the reason) and a click that stamps as one undo step. Add the tab in `src/builder/panel.ts`.

**Checkpoint**: quickstart Q4 passes.

---

## Phase 7: User Story 5 - Seasonal and time-of-day touches (Priority: P3)

**Goal**: optional seasonal accents and first-person light that follows the server's clock.

**Independent Test**: quickstart Q6 steps 1–2.

### Tests for User Story 5

- [x] T055 [P] [US5] Write `tests/unit/daylight.test.ts` for `daylightAt(hour)` in `shared/themes.ts`: smooth (no step larger than 0.02 per minute), warm at 7–9 and 17–20, neutral at noon, never below 0.7 brightness, and periodic over 24 h. Add `seasonFor(date, hemisphere)`: the southern hemisphere is shifted by two seasons.
- [x] T056 [P] [US5] Extend `tests/integration/ws-theme.test.ts`: the welcome carries `season`, `tzOffsetMin` and `now`; with `OFFICE_FAKE_DATE` in December the season is `winter` (and `summer` with `OFFICE_HEMISPHERE=south`); a `season` message is sent when the hourly check sees a change (with an injected clock).

### Implementation for User Story 5

- [x] T057 [US5] Add `daylightAt` and `seasonFor` to `shared/themes.ts` (reusing `seasonOf` from `shared/wardrobe.ts`). Make T055 pass.
- [x] T058 [US5] Change `shared/protocol.ts` and `server/app.ts`: welcome fields `season`, `tzOffsetMin`, `now`; an hourly season check that broadcasts `{ t: 'season', season }` on change, using the `clock` option from T003. Make T056 pass.
- [x] T059 [US5] Change `src/finish.ts` and `src/art.ts` to paint seasonal variants when `layout.seasonal` is on: window walls get frost, blossom, sun or leaves (from the theme's `SeasonAccent.window`), and plain walls get a top trim (garland, bunting, vines, leaves or none). The cache key includes the season.
- [x] T060 [US5] Change `src/render3d.ts` to multiply the light by the season's `light` when `seasonal` is on, and by `daylightAt(server local hour)` when `daylight` is on. The hour is from `Date.now() + offset` and `tzOffsetMin`, recalculated once a minute. The 2D view doesn't change.
- [x] T061 [US5] Add the **Seasonal touches** and **Time-of-day light** switches under the theme cards in `src/builder/themes.ts`, setting `layout.seasonal` / `layout.daylight` in the draft as undo steps. Show the current season, and "first person only" under the light switch.

**Checkpoint**: quickstart Q6 steps 1–2 pass.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [x] T062 [P] Update `README.md`: themes, finishes, room styles and kits, Customize desk, seasonal and time-of-day switches, `npm run finishes:sheet`, and `OFFICE_FAKE_DATE` / `OFFICE_HEMISPHERE`.
- [x] T063 [P] REA research on Gather themes, wall colors and seasonal map changes is deferred (research R1). If evidence is gathered before merge, record it in R1 with its source and mark each point observed, inferred or unknown. Otherwise leave R1 as is.
- [ ] T064 Check performance (R11, SC-006): time the 2D map-layer rebuild for a 100×100 layout with 94 paints (must be under 100 ms), and run quickstart Q6 step 3 (Space Station, 3 styled rooms, seasonal on, 25 bots). Record results in `specs/012-office-customizability/checklists/validation.md`.
  - **Status:** the 2D rebuild was measured (62 ms cold, 15 ms warm, 92 paints, 100×100) and recorded. The 25-bot frame-rate run was not done, so this stays open.
- [ ] T065 Run the full quickstart Q0–Q6 by hand in two windows and record the results in `specs/012-office-customizability/checklists/validation.md`. Include the blind theme comparison (SC-002) with 5 people if possible, and the owner's review of `out/finishes.png`.
- [x] T066 Run `npm run typecheck` and `npm test`, and fix anything that fails.
- [x] T067 Run `/speckit-analyze` on the finished artifacts and resolve what it finds.
  - Run on 2026-11-08: no critical or high findings. Stale notes, the plan's file list, the turn control in the UI contract and the spec status were corrected.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: none.
- **Foundational (Phase 2)**: needs Setup. Blocks every story. Inside it: T005 is written before T009, T015 and T016, and T008 → T009 → T015 → T016/T017.
- **US2 (Phase 3)**: needs Phase 2.
- **US1 (Phase 4)**: needs Phase 2. T032 reuses US2's finishes (T022, T023), so do US2 first.
- **US4 (Phase 5)**: needs Phase 2. US2's floor finishes make its floor picker useful, but it can start alongside US1.
- **US3 (Phase 6)**: needs US1 (styles are themes) and US2 (kits use finishes).
- **US5 (Phase 7)**: needs US1 (season accents and light live in themes).
- **Polish (Phase 8)**: needs all the stories you want to ship.

### Story completion order

```text
Setup → Foundational → US2 → US1 ─┬→ US3 → US5 → Polish
                         └─ US4 ──┘ (US4 may run in parallel with US1)
```

### Within each story

Tests first (they must fail), then shared rules, then server, then client UI.

---

## Parallel Examples

### Phase 2

```text
T004 finishes.test.ts | T005 warm-studio.test.ts | T006 layout-paint.test.ts | T007 world-paint.test.ts
```

### US2

```text
T020 finishes counts test | T021 ws-paint.test.ts
then T022 painters and T026 panel UI can proceed side by side (different files) once T023's ids are agreed
```

### US1

```text
T029 themes.test.ts | T030 contrast.test.ts | T031 ws-theme.test.ts
T033 art.ts furniture colors | T034 raster.ts light | T035 render2d labels  (different files)
```

### US4

```text
T038 desk-look.test.ts | T039 ws-desk-look.test.ts
T042 protocol.ts | T043 store.ts  (after T040)
```

### US3 and US5

```text
T049 | T050         (US3 tests)
T055 | T056         (US5 tests)
```

---

## Implementation Strategy

### MVP first (US2 + US1)

1. Phases 1–2: the foundation. Prove with T005 that nothing changed visually.
2. Phase 3 (US2): builders can paint many finishes. **Stop and validate** with quickstart Q3.
3. Phase 4 (US1): themes. **Stop and validate** with Q1 and Q2. This is the MVP: an office that can look clearly different with a click, and be painted in detail.

### Incremental delivery

4. US4 (Customize desk): the "your office space" part of the issue. It ships independently.
5. US3 (room styles and kits).
6. US5 (seasonal and time of day).
7. Polish and hand validation.

### Notes

- Art quality is the main risk (plan.md "Risks"). Review `out/finishes.png` with the owner after T024 and again after T032, before tuning further.
- Commit after each task or small group, and keep the suite green.

---

## Phase 9: Convergence

- [X] T068 [US4] Show the **Customize desk** button in the desk view's heading, not only on the "Your desk" cue: `src/main.ts` hides the cue while the desk view is open (`showDeskCue(view ? null : …)`), so the button disappears there. Show it only to the desk's owner and never to guests, as on the cue, per T047 / US4/AC1 (partial)
- [X] T069 [US4] Close the Customize desk panel after a successful save. Today `DeskLookPanel.onLooks()` in `src/desk-look/panel.ts` only closes it when the member has no desk; it should close when a `deskLooks` message brings this member's saved look. A `deskLookError` keeps it open with the edits, per contracts/ui-behavior.md "After save" (partial)
- [X] T070 [US4] Add the first-person thumbnail to the Customize desk preview in `src/desk-look/panel.ts`, drawn by the office's own 3D painters from the draft look, per T046 / contracts/ui-behavior.md "Preview" (partial)
- [X] T071 [US4] In build mode, draw a claimed desk that has a look as the builder's base with the owner's look dimmed on top, in `src/render2d.ts` / `src/builder/builder.ts`. Keep the existing "Decorated by <name>" hover, per T048 / contracts/ui-behavior.md "Builder while desks are customized" (partial)
- [X] T072 [US4] Make desk items and the rug placeable by dragging on the Customize desk top-down preview (move, plus turn for desk items), in `src/desk-look/panel.ts`. Today items are auto-placed with no way to move or turn them, and the rug uses a "Spot N" dropdown. Validate the result with `validateDeskLook` before accepting it, per contracts/ui-behavior.md "Customize desk" (partial)
- [X] T073 [US4] While the panel has unsaved edits, show them as a dashed preview at the desk in the office view, cleared on save, reset or close, per contracts/ui-behavior.md "Changes show only in the panel's preview and as a dashed preview at the desk until saved" (missing)
- [X] T074 [US4] Show the Desk and Chair choices in `src/desk-look/panel.ts` as picture tiles (same-footprint catalog items) with the current one marked, instead of dropdowns, per contracts/ui-behavior.md "Desk, Chair: … as tiles" (partial)
- [X] T075 [US1] Draw a chair with the desk in the Themes tab preview (`themePreview` in `src/builder/themes.ts` draws a desk and a plant), per contracts/ui-behavior.md "a desk with a chair" (partial)
- [X] T076 [US3] Add a small preview of each theme next to the room **Style** dropdown in `src/builder/panel.ts` (reuse `themePreview`), per T051 / contracts/ui-behavior.md "Room properties" (partial)
- [X] T077 Add a theme row to the contact sheet in `tools/finishes-sheet.ts`: each theme's main floor, plain wall and ceiling side by side, so themes can be compared and tuned there, per T032 / plan "Risks: art quality" (partial)
