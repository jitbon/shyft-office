---

description: "Tasks for the furniture studio and ready-made catalog"
---

# Tasks: Furniture Studio and Ready-Made Catalog

**Input**: design documents in `specs/004-furniture-studio/`: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/) and [quickstart.md](quickstart.md)

**Tests**: included. Constitution V requires unit tests for deterministic logic, and Constitution III a test for anything that touches privacy (desk items sit on desks, so that is covered). Write each story's tests before its implementation and see them fail first.

**Organization**: tasks are grouped by user story. **US2 (where items go) comes before US1 (the catalog) in build order**, although both are P1: the ready-made list contains desk items, wall decor and floor art, which need the placement kinds to be placed at all. Each story still has its own independent test.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US4 from spec.md
- Paths are relative to the repository root

## Notes for every task

- **Tests run in Node without a browser.** Anything a test must check (item validation, parts to boxes, pattern textures, the derived picture, normalization, baking) is written as a pure function over numbers and arrays (`Uint32Array`, `Uint8ClampedArray`), with a thin canvas wrapper for the browser. Do not import `document` at module load in a pure module.
- **The world is global to each process** (`setWorld` in `shared/map.ts`; `setCustomObjects`, and from this feature `setStudioItems`, in `shared/catalog.ts`). Tests that change them restore the defaults in `afterEach` (`setWorld(compileDefault())`, `setStudioItems([])`, `setCustomObjects([])`).
- **Read live bindings at use time**, never copy `AREAS`, `DESKS`, `DESK_PODS`, `MAP_W`, `MAP_H`, `SPAWN` or the catalog into a constant at import time.
- **Existing behaviour stays.** Desk derivation, claims, locks, collision, proximity, the six built-in items and custom sheet objects must behave exactly as now. The full existing suite (317 tests) must keep passing after every phase.
- **Original art only** (Constitution I): every ready-made item is designed here from parts and palette colors.

---

## Phase 1: Setup

- [X] T001 Add the scripts `"items:template": "tsx tools/item-template.ts"` and `"items:check": "tsx tools/item-check.ts"` to package.json.
- [X] T002 [P] Create tests/unit/fixtures/items.ts with helpers used by later tests: `part(over?)` (a valid `plain` part `#c0c0c0`, 0.5 wide and deep, 0.2 tall, at 0,0,0), `itemDef(kind, over?)` returning a valid definition for each kind (`floor` 1×1 with one part; `deskitem` 0.5×0.5; `wall` 0.5×0.25 with `hang` 0.35; `floorart` 2×1 with a 0.02-tall part), and `withItems(items[])` that calls `setStudioItems` and returns a restore function.

---

## Phase 2: Foundational (the item format and the shared drawing pieces)

**Purpose**: the format, the materials, the moved rasteriser and the derived picture. No story can start until this is done and the existing suite passes, with the office looking exactly as before.

- [X] T003 Create shared/items.ts with the types `ItemDefinition`, `Part`, `Group`, `Season`, `Kind` and the constants for the limits, then these pure functions. Quote the rules from data-model.md exactly:
  - `validateItem(raw) → {ok:true, item} | {ok:false, errors:string[]}` with the codes of [contracts/item-format.md](contracts/item-format.md): `bad-item`, `bad-format` (not 1), `bad-name` ("1–32 characters"), `bad-group`, `bad-season` ("Required when `group` is `seasonal`"), `bad-kind`, `bad-footprint` (`floor`, `floorart`: "whole tiles, 1–4 each"; `deskitem`: "each of 0.25, 0.5, 0.75 or 1"; `wall`: "width 0.25–1 in steps of 0.25, depth 0.25 at most"), `bad-blocks` ("Only for `floor`"), `bad-hang` ("0–0.8, in steps of 0.05"; default 0.35), `no-parts`, `too-many-parts` ("1–24"), `bad-part:<i>` ("steps of 0.05, at least 0.05"), `part-outside:<i>` ("`0 ≤ x`, `x + w ≤ footprint width`, same for `y` and depth"), `too-tall:<i>` ("`z + h ≤ 1` for every part; `deskitem` items `z + h ≤ 0.6`; `floorart` parts `h ≤ 0.05`"), `bad-color:<i>` (`#rrggbb`), `bad-pattern:<i>` (`plain | wood | fabric | metal | leaf | glass | screen | paper | stone`).
  - `clampItem(raw) → unknown`: trims the name to 32 characters, rounds numbers to 0.05, pulls numbers into range, turns an unknown pattern into `plain`; used on helper output before `validateItem`.
  - `partsToBoxes(def) → Box[]`: one `Box` per part, material name `m:<pattern>:<hex without #>` for every face; same frame as the catalog models (x runs left to right, y back to front, front faces south).
  - `itemHeight(def)`: the highest `z + h`.
- [X] T004 [P] Write tests/unit/items-validate.test.ts: one case per error code with the exact `<i>` index; a valid item of each kind passes; boundary values (24 parts passes, 25 fails; footprint 4 passes, 5 fails; `z + h` exactly 1 passes; desk item at 0.6 passes, 0.65 fails); `clampItem` rounds 0.123 to 0.1, cuts a 40-character name, turns `pattern: "glitter"` into `plain`, and its output of a wildly out-of-range item still fails `validateItem` for a reason rather than throwing; `blocks` defaults to true for `floor`.
- [X] T005 [P] Write tests/unit/items-boxes.test.ts: `partsToBoxes` gives one box per part with the right position and size and the material name `m:wood:aabbcc`; a 24-part item gives 24 boxes; the boxes fit inside the footprint for every kind of fixture.
- [X] T006 Create src/pattern.ts (pure): `patternTexture(pattern, color) → Texture` (32×32 `Uint32Array` in ABGR, as `Texture` in src/art.ts), one painter per pattern, tileable, derived from the color with `mix`, `shade` and `light` from src/palette.ts and the noise function `hash` from src/art.ts: `plain` (flat with a few specks), `wood` (grain lines), `fabric` (weave), `metal` (brushed), `leaf` (dense dither of three greens around the color), `glass` (pale, with a diagonal glint), `screen` (lit with scanlines), `paper` (cream lines), `stone` (blocks with joints). Then create src/materials.ts: `isStyleMat(name)`, `materialFor(name) → Texture` for names `m:<pattern>:<hex>`, cached.
- [X] T007 [P] Write tests/unit/pattern.test.ts: every pattern returns 1024 pixels that are not all one value (except `plain` may be nearly flat), is tileable (the left and right edge columns are within one shade step of each other), and is deterministic (two calls give identical data); `materialFor` returns the same object twice and refuses a malformed name with `null`.
- [X] T008 Move the face rasteriser out of src/render3d.ts into a new src/raster.ts: `fillFace(t: {pix: Uint32Array; depth: Float32Array; w: number; h: number}, face: Face, cam: Cam, K: number, half: number, tex: Texture, fog: (d: number) => number, shade: (c: number, f: number) => number)`. **First**, write tests/unit/raster.test.ts against the *current* code: render one box (a 1×1×0.5 table-like box at 3 tiles in front of a camera) into a 64×48 buffer and record a small set of pixel colors and depths as the golden values. Then move the code, and the test must still pass: the office must look exactly the same. (Done differently, because the old class cannot run in Node: the first-person canvas hash was recorded in Chrome before the move with `node tools/e2e/fp-hash.mjs` and was identical after it, and tests/unit/raster.test.ts pins the behaviour of the new module.)
- [X] T009 In src/render3d.ts, use `fillFace` from src/raster.ts, and resolve a face's texture as `this.mats[name] ?? viewTexture(name, now) ?? (isStyleMat(name) ? materialFor(name) : null)`.
- [X] T010 Extend shared/catalog.ts. Add to `CatalogItem`: `group`, `season?`, `kind` (`floor | desk | wall | floorart`), `by` (a name, `Shyft` for ready-made), `version` (a whole number, 1 for ready-made), `surface?` (the height of an item's top, for desks), `hang?`. Then:
  - give the six built-ins their values per research R2 (desk, small desk and table: group `desks`; chair and sofa: `chairs`; plant: `decorations`; all `kind floor`; the two desks get `surface: 0.31`; every item built from a definition in group `desks` gets `surface` = the highest `z + h` of its parts, so it can host desk items);
  - custom sheet objects: group `odds`, `kind floor`, `by` their author;
  - export `GROUPS` (the nine groups with display names: "Desks", "Chairs", "Computers & desk items", "Shelves & storage", "Decorations", "Wall decor", "Floor art", "Odds & ends", "Seasonal");
  - add `catalogFromDefinition(def, {id, by, version}) → CatalogItem` (model = `partsToBoxes(def)`, tile `'x'` for items that stamp the grid, i.e. `floor`; `blocks` from the definition);
  - add `setStudioItems(records: {id, def, by, version}[])` and `studioItems()` in the same style as `setCustomObjects`, with `currentCatalog()` including them (ids `item:<id>`).
- [X] T011 Create src/item2d.ts: the derived top-down picture (research R3). Pure core `paintItemTop(item, rot) → {w, h, rgba: Uint8ClampedArray, lift: number}` at 32 px per tile: parts sorted by `z` then back to front; each draws its top face lifted up the page by `0.5 × z` tiles and its south face as a darker strip below it (shade 0.8), filled from the part's `patternTexture`; one-pixel dark outline (`PALETTE.ink`) round the whole item; for a turned item the footprint turns and the lift stays up the page. The browser wrapper `itemPicture(item, rot) → HTMLCanvasElement` caches by `id@version/rot`. The six built-ins and sheet objects are not painted here (they keep their own painters).
- [X] T012 [P] Write tests/unit/item2d.test.ts: for fixtures of each kind, the picture is not empty, lies inside the footprint plus the lift above, has the outline, is deterministic, turning by `rot` swaps width and depth for odd turns, and a taller part shows higher up the page than a shorter one at the same place.

**Checkpoint**: the format validates, patterns and pictures are pure and tested, the office renders identically (T008 golden), `npm test` is green.

---

## Phase 3: User Story 2 - Desk items, wall decor and floor art go where they belong (Priority: P1)

**Goal**: three new placement kinds that work in the layout, the builder, the world and both views, with limits, and with desk rules unchanged.

**Independent Test**: quickstart Q2.

### Tests for User Story 2 (write first, and see them fail)

- [X] T013 [P] [US2] Write tests/unit/layout-normalize.test.ts for `normalizeLayout` ([contracts/layout-delta.md](contracts/layout-delta.md)): an object of an unknown kind is removed; a desk item whose `on` is missing, not in the layout, or not a desk is removed; `at` outside the host's footprint is moved inside; wall decor on a tile with no wall, or on a face that does not border non-wall floor, or with no `wall`, is removed; 7 items on one host tile keep the first 6; 3 on one wall face keep the first 2; a `v` the item does not have is dropped; the result lists what was removed and why; running it twice changes nothing.
- [X] T014 [P] [US2] Write tests/unit/layout-desk-items.test.ts: the world position of a desk item is the host's origin plus `at` turned with the host (all four turns, for a 3×1 desk), and its facing is `host.rot + rot`; moving the host (new `x`, `y`) moves the item with no change to the item; deleting the host and normalizing removes the item; desk items do not appear in `grid`, `block` or `DESKS` tiles, and `deriveDesks` gives the same desks with or without them.
- [X] T015 [P] [US2] Write tests/unit/layout-wall-decor.test.ts: decor is placed on the wall tile and face given, never blocks (`block` unchanged), is exposed in `world.wallDecor` with tile and face, and is removed by `normalizeLayout` when the wall is erased or the face stops bordering floor.
- [X] T016 [P] [US2] Write tests/unit/floor-art.test.ts for `bakedFloorCell` (task T021): a 2×1 rug over two floor cells gives two cells that are the floor with the matching half of the rug painted over; cells outside the art are the floor unchanged; a later piece covers an earlier one; a turned rug covers the turned footprint; art never changes `block`.
- [X] T017 [P] [US2] Write tests/integration/desk-items-privacy.test.ts (Constitution III): with a published layout that has a desk with 3 items on it, a member claims it, locks it, and invites a guest; a person at the next desk and a person outside the desk area get nothing from it (same assertions as ws-desk-privacy); the claim, the lock and the invite work as without items; a publish that deletes the desk removes its items and releases the claim with the usual notice; a publish that deletes a wall piece removes the decor on it.

### Implementation for User Story 2

- [X] T018 [US2] In shared/layout.ts, add the optional fields `v`, `on`, `at`, `wall` to `PlacedObject` (types and `cloneLayout`), let `parseLayout` accept them with the right shapes ("`at` has two numbers in steps of 0.05", `wall` one of `n e s w`, `v` a whole number from 1) and ignore them otherwise. `parseLayout` checks that an object is inside the grid only for `floor` and `floorart` items (by footprint), for wall decor checks that its tile is inside the grid, and does not check `x`, `y` of desk items at all. Write `normalizeLayout(layout, catalog) → {layout, removed: {id, why}[]}` with the rules and order of the contract, including setting `x` and `y` to 0 on desk items, and treating a host as valid when its catalog entry has a `surface` (the original desks and every item in group `desks`). Layout `format` stays 1.
- [X] T019 [US2] In shared/layout-check.ts add the problem codes `item-orphan` and `item-limit` (tiles outlined); in shared/layout-merge.ts include `v`, `on`, `at` and `wall` in the value of the `obj:<id>` unit, and run `normalizeLayout` on the merged result. **Also restrict the occupancy tests to floor objects:** `object-overlap` and `object-outside` in `checkLayout` consider only objects whose catalog `kind` is `floor`, so floor art under a chair, a lamp on a desk and a poster on a wall are never reported as overlaps; wall decor is checked only for its tile being a wall with an open face (`item-orphan`). Add cases for these to tests/unit/layout-check.test.ts.
- [X] T020 [US2] In shared/world.ts, stop stamping or blocking for any object whose catalog `kind` is not `floor`; add to `World`: `deskItems` (item, host, world `x`, `y` in tiles, `rot`, surface height), `wallDecor` (item, tile, face) and `floorArt` (item, footprint after turning, in list order); resolve pinned copies with `v` through the catalog (`itemAt(kind, v)`, see T043; until then the newest). A desk item's host may be any floor object whose catalog entry has a `surface`; `deriveDesks` (claims, locks, privacy) still looks only at the original desks and gives the same results as before for layouts with only floor objects.
- [X] T021 [US2] Create src/floorart.ts (pure): `bakedFloorCell(world, x, y, base: Texture) → Texture` returning `base` when no art covers the cell and otherwise a copy with the art's slice painted over, in list order, using `paintItemTop`.
- [X] T022 [US2] In src/mesh3d.ts make `worldMeshes` include: desk items (boxes lifted by the host's `surface`, turned with the host plus `rot`), wall decor (boxes against the wall face, 0.02 off it, lifted by `hang`, facing out), and nothing for floor art; make each desk item part of its host's mesh group so one distance test culls a desk with everything on it. Extend tests/unit/mesh3d.test.ts: a lamp on a desk stands at z 0.31, turns with the desk, and a wall poster's front faces away from the wall.
- [X] T023 [US2] In src/render3d.ts, build the floor cells in `rebuild()` with `bakedFloorCell` (so floor art shows under feet and people stand on it with no depth tricks), and skip desk items and wall decor smaller than 0.1 wide and 0.15 tall beyond 12 tiles (research R11).
- [X] T024 [US2] In src/render2d.ts: paint floor art into the map canvas in the floor pass (over the floor, in list order); draw desk items and wall decor from their derived pictures after the objects pass, a desk item lifted up the page by its host's `surface × 0.5` tiles on top of its own parts' lift; wall decor on a south face is drawn on the wall's front face, and on a north, east or west face as a thin strip (0.2 tile) along that edge of the wall tile, over the wall cap, with its picture squeezed to fit; change `updateMapCanvas` so the repaint set also includes tiles whose desk items, wall decor or floor art changed (compare their positions and facing between the old and new world), with the existing radius.
- [X] T025 [US2] In src/builder/tools.ts: add placement for the three kinds. `placeObject` for a `deskitem` takes a point on a desk (tile and fraction): sets `on`, `at` (snapped to 0.05 and kept inside the host's footprint), refuses with exactly "Desk items go on a desk." when no desk is there and "That desk tile is full." beyond 6; for a `wall` item takes a wall tile and face, refuses with "Hang this on a wall." when the face does not border floor and "That wall is full." beyond 2; for `floorart` takes a tile like a floor item but never refuses for overlap. `moveObject`, `rotateObject` (relative `rot` for desk items), `deleteObject` and `erase` work for all kinds; every edit ends in `normalizeLayout`. **Occupancy uses only floor objects:** `coverOf`, `objectAt`, `whyNotFit` and the erase order (wall, then floor object, then the other kinds on that tile, newest first) must not treat desk items, wall decor or floor art as taking up floor tiles, so a chair can stand on a rug and a mug on a desk without a refusal.
- [X] T026 [P] [US2] Write tests/unit/builder-tools-kinds.test.ts for T025: each success and each refusal message, the limits 6 and 2, moving a desk keeps its items, deleting a desk with items removes them and says how many, turning a desk item turns it on the desk, floor art overlaps freely and the later one is last in the list, a chair can be placed on a rug, a desk item can be placed on a ready-made desk (group `desks`) and refused on a bookshelf, and erase on a tile with floor art under a chair removes the chair first.
- [X] T027 [US2] In src/builder/builder.ts: ghosts for the three kinds (a desk item's ghost is outlined on the desk under the pointer, green when it fits and red with the reason otherwise; wall decor's on the wall face; floor art's footprint), selection and dragging of desk items on their desk, `R` to turn, and a notice after any edit that removed things ("2 desk items went with their desk").
- [X] T028 [US2] In server/app.ts and server/api.ts, run `normalizeLayout` on every layout that comes in (draft save, publish) and on the merged result before `checkLayout`, and keep the removal list out of the response (the client already ran it); `reconcile` is unchanged.
- [X] T029 [US2] The browser check of quickstart Q2 needs real items in a running office, which only exist once the ready-made list does (T032, T033). So it is run **as part of T036**, together with Q1. Here, confirm the same behaviours with the unit and integration tests above (T013–T017, T026), and leave this task open until T036 is done, then mark both.

**Checkpoint**: desk items, wall decor and floor art work in both views, desk rules are untouched, the existing suite is green.

---

## Phase 4: User Story 1 - Pick from a ready-made catalog (Priority: P1) 🎯 MVP

**Goal**: about a hundred original items in nine groups, browsable and placeable, that look right in both views.

**Independent Test**: quickstart Q1.

### Tests for User Story 1 (write first, and see them fail)

- [X] T030 [P] [US1] Write tests/unit/readymade.test.ts: at least 80 items, each group in `GROUPS` has at least 5 (counting the six built-ins in their groups), at least 12 seasonal with at least 3 for each of winter, spring, summer and autumn, every definition passes `validateItem`, ids and names are unique, every kind occurs (at least 10 desk items, 8 wall decor, 6 floor art), every item's picture (`paintItemTop`) is non-empty and inside its footprint plus lift, and every item's boxes fit its footprint and the height limits. No two items have identical parts.
- [X] T031 [P] [US1] Write tests/unit/catalog-filter.test.ts for `filterCatalog(items, {group?, season?, text?})`: by group, by season, by text (case-insensitive, matches part of a name), all three together, clearing gives everything, results keep the catalog's order, an item with no season never matches a season filter.

### Implementation for User Story 1

- [X] T032 [US1] Create shared/readymade.ts with the ready-made list, as `READY_MADE: ItemDefinition[]` built with small local helpers (`slab`, `leg`, `pot`, `cushion`, …) so each item is a handful of parts. Ids are `item:rm-<slug>`; `by` is `Shyft`. Items by group (the kind in brackets; a group may hold more, never fewer):
  - **Desks** (floor): Standing desk, Corner desk (2×2), Writing desk, Reception desk (3×1), Drafting table, Workbench, Round meeting table (2×2), Coffee table.
  - **Chairs** (floor): Office chair, Stool, Bar stool, Armchair, Bean bag, Bench (2×1), Folding chair, Gaming chair.
  - **Computers & desk items** (desk): Laptop, Monitor, Dual monitors, Keyboard, Mouse pad, Desk lamp, Mug, Notebook and pen, Phone, Headphones, Small plant, Pen cup, Photo frame, Sticky notes.
  - **Shelves & storage** (floor): Bookshelf (2×1), Low shelf, Filing cabinet, Locker, Storage cube, Coat rack, Wardrobe, Display case, Printer stand, Cabinet.
  - **Decorations** (floor): Floor lamp, Fern, Potted palm, Cactus, Aquarium, Statue, Vase, Standing sign, Water cooler, Waste bin, Umbrella stand, Globe.
  - **Wall decor** (wall): Poster, Framed picture, Clock, Small whiteboard, Corkboard, Wall shelf, Mirror, Banner, Wall lamp, Calendar.
  - **Floor art** (floorart): Round rug, Rectangle rug (2×1), Welcome mat, Logo mat, Checker tile patch, Runner carpet (3×1), Arrow decals, Star rug.
  - **Odds & ends** (floor): Bicycle, Skateboard, Guitar stand, Arcade cabinet, Toolbox, Traffic cone, Cardboard boxes, Robot toy.
  - **Seasonal**: winter (Christmas tree, Wreath [wall], String lights [wall], Snowman, Gift pile), spring (Tulip pot, Easter basket, Flower garland [wall], Bunny figure [desk]), summer (Beach umbrella, Surfboard [wall], Cooler box, Desk fan [desk], Sandcastle [desk]), autumn (Pumpkin, Jack-o-lantern [desk], Hay bale, Scarecrow, Leaf garland [wall]).
  Design each from at most 24 parts with chunky shapes and palette colors that read at 32 px. The six built-ins are not repeated here.
- [X] T033 [US1] In shared/catalog.ts, load `READY_MADE` into the built-in catalog (ids `item:rm-…`), export `catalogItems()` in group order, and write `filterCatalog` (T031).
- [X] T034 [US1] In src/builder/panel.ts, replace the Furniture tab with an **Items** tab: a bar of the nine groups plus "All", a season filter (All, Winter, Spring, Summer, Autumn), a search box, and a grid of pictures (the derived picture for items, the built-in swatch for the six, the top view for sheet objects) with their names; the grid shows 24 entries and scrolls; a count ("94 items"). The selected group, season and text survive redraws.
- [X] T035 [US1] In src/builder/builder.ts, picking any item sets the place tool with that item's kind (T027's ghosts), shows its name and creator under the grid, and `R` turns it before placing.
- [X] T036 (partial: see checklists/validation.md) [US1] Run quickstart Q1 in real browsers: place one item of every group, check both views side by side for every ready-made item (flip through the catalog in first person and in the top-down view and compare each to its picture), and record the result with screenshots in checklists/validation.md; fix any item whose two views disagree.

**Checkpoint**: US1 and US2 work together. The MVP is ready to demo.

---

## Phase 5: User Story 3 - Build your own furniture in the studio (Priority: P2)

**Goal**: members make, save, share and change items; editing is safe for placed copies; drafts are kept.

**Independent Test**: quickstart Q3 and Q4.

### Tests for User Story 3 (write first, and see them fail)

- [X] T037 [P] [US3] Write tests/integration/items-api.test.ts for [contracts/http-api.md](contracts/http-api.md): a member `POST /api/items` with a valid design gets 201 and `{item, pinned: 0}` and everyone gets an `items` message; the item is in `GET /api/items`, in the next `welcome`, and survives a server restart; an invalid design gets 400 with the codes and nothing is stored; `DELETE` without `confirm` reports the placed count, with `confirm=1` publishes a revision without the copies (credited to the caller) and removes the item.
- [X] T038 [P] [US3] Write tests/integration/items-permissions.test.ts: a guest cannot save, copy or delete (403 `not-builder`); a member cannot change or delete another member's item (403 `not-yours`) but can save a copy (`asCopy`); an admin can change or delete anyone's; the 21st save in a minute gets 429; the 501st item gets 409 `too-many`; building switched off blocks members but not admins; a studio draft is returned only to its owner.
- [X] T039 [P] [US3] Write tests/integration/items-edit-pinning.test.ts: a shelf placed three times, one hemmed in by walls; the creator saves a wider footprint; the response says `pinned: 1`; the two that fit show the new footprint, the hemmed one keeps its old one (its `v` is set, and a published revision credited to the creator records it); a change that does not alter footprint or kind pins nothing; a desk item that no longer fits its desk surface is pinned too; the older version is kept while a copy uses it and removed when none does.
- [X] T040 [P] [US3] Write tests/integration/studio-draft.test.ts: `PUT /api/studio/draft` saves one draft per member (a second replaces the first), returns the codes the design has now, `GET` returns it, `DELETE` discards it, a design over 64 KB or 64 parts is refused, one save a second is allowed, another member's `GET` is 404, and drafts older than 30 days are pruned at start.
- [X] T041 [P] [US3] Write tests/unit/studio-model.test.ts for the pure design model of T047: add a part of each ready shape, duplicate, delete, reorder, mirror a part across the item's middle (a part at x 0.1 gets a twin at `footprint − 0.1 − w`), move and resize in 0.05 steps clamped inside the footprint, change kind and see the limits follow (changing to `floorart` flattens parts to 0.05 and says so), and the live problem list equals `validateItem`'s codes.

### Implementation for User Story 3

- [X] T042 [US3] Create server/items.ts: `ItemsStore.load(dir)` reading data/items/<id>.json (skipping bad files with a logged code), `add/change/remove`, `get`, `list`, `versions`; ids `[a-z0-9-]{1,32}` made unique; "At most 500" items; the creator (`by`) kept and checked; the last 5 versions kept as `<id>@<n>.json` while any placed copy is pinned; studio drafts in data/studio/<memberId>.json with `savedAt`, pruned 30 days after it; every write is write-then-rename.
- [X] T043 [US3] Support versions in the catalog and world: in shared/catalog.ts keep the kept versions of each studio item and add `itemAt(kind, v?)`; in shared/world.ts use it for pinned copies (T020's hook); `setStudioItems` takes the versions.
- [X] T044 [US3] Create shared/items-edit.ts (pure): `pinMisfits(layout, oldItem, newItem) → {layout, pinned: number}` per research R9: for every placed copy of the item, test whether the new footprint fits where it stands (floor items against walls, other objects and the grid; desk items against their host's surface; wall decor against its face and the wall's width) using the same test the builder uses; set `v` to the old version on those that do not; return the count. Unit tests in tests/unit/items-versions.test.ts: copies that fit are untouched, ones that do not are pinned, nothing is pinned when footprint and kind are unchanged, and pinning twice does nothing more.
- [X] T045 [US3] In server/api.ts add `GET /api/items`, `POST /api/items`, `DELETE /api/items/:id[?confirm=1]` and `GET/PUT/DELETE /api/studio/draft` exactly as in the contract (builder checks, rate limits of 20 saves a minute and one draft save a second, body caps, the codes); on a change that alters footprint or kind run `pinMisfits` and publish the result through `applyPublish` credited to the editor; on delete publish the layout without the copies, then remove the item.
- [X] T046 [US3] In shared/protocol.ts and server/app.ts: `welcome.items` (the light `ItemInfo` index), the `items` broadcast after every add, change or delete, and load the store at start (before the layouts, as for custom objects) with `setStudioItems`; create src/items-client.ts that keeps the browser's copy: reads the index, fetches the full definitions of new or changed items from `GET /api/items`, calls `setStudioItems`, and recompiles the office (`recompile()`) when the set changed.
- [X] T047 [US3] Create src/studio/studio.ts: the design model as pure functions plus a small controller: the list of parts, add (box, plank, post, sheet, slab shapes with sensible sizes), duplicate, delete, reorder, mirror, move and resize (0.05 steps, clamped to the footprint), item properties (name, group, season, kind, footprint, blocks, hang), live problems from `validateItem`, autosave of the draft one second after a change (`PUT /api/studio/draft`), restore of the draft on open, and **Save** (new, or change when it is the member's own item), **Save as copy**, **Discard**, **Delete** (own items; asks how many copies).
- [X] T048 [US3] Create src/studio/preview3d.ts: a 360×270 framebuffer drawn with `fillFace` from src/raster.ts and the mesh code, an orbiting camera (drag to turn, wheel to zoom, a "front/back/left/right/top" set of buttons), the selected part outlined, a ground square under the item, and the same fog and shading as the office. The top-down preview is `itemPicture` at 3× on a 32 px grid with the footprint outlined; clicking selects a part and dragging moves it in 0.05 steps.
- [X] T049 [US3] Create src/studio/panel.ts and add its styles to src/style.css (existing tokens): parts list on the left, previews in the middle, properties on the right, the limits shown live ("parts 7 of 24", the footprint, what is wrong, with the first problem outlined), Save / Save as copy / Discard, keyboard: arrows nudge the selected part by 0.05, `Delete` removes it.
- [X] T050 [US3] Wire the studio into the builder: a **New item** button and an **Edit** button on a selected item in src/builder/panel.ts open the studio (from nothing, from a catalog item as a copy, or from the member's own item); after a save the catalog and every placed copy update (the `items` message), and the builder says how many copies were kept at the old size.
- [X] T051 [P] [US3] Create tools/item-template.ts (`--kind`, `--footprint 2x1`, `--out`; writes a valid one-part item of that kind) and tools/item-check.ts (prints `OK <file>` or `<file>: <codes>`, exit 1 on any failure), in the style of tools/object-check.ts; add tests/unit/item-check.test.ts that runs `checkFile` on a valid item, one with a part outside the footprint (`part-outside:0`), and a file that is not JSON (`bad-item`).
- [X] T052 [US3] Run quickstart Q3 and Q4 in real browsers and record them with screenshots in checklists/validation.md.

**Checkpoint**: US3 works on its own; the studio is usable without any AI service.

---

## Phase 6: User Story 4 - Let an AI helper make the first draft (Priority: P3)

**Goal**: an optional, admin-controlled helper that turns words or a picture into an editable draft, and is clearly unavailable when it is not set up.

**Independent Test**: quickstart Q6.

### Tests for User Story 4 (write first, and see them fail)

- [X] T053 [P] [US4] Write tests/integration/helper.test.ts with a fake `Drafter` injected through the server options (the real service is never called): a good reply returns a checked draft and stores nothing (no item, no draft file, nothing logged); a reply that is not JSON, one that is not an item, and one over the limits that `clampItem` cannot rescue each give 422 `unusable` with plain words; an out-of-range but rescuable reply (0.123, a 40-character name, `pattern: "glitter"`) comes back clamped and valid; a drafter that throws, refuses, or hangs past the timeout gives 502/504 and stores nothing; guests get 403 `not-builder`; with the helper off 403 `helper-off`; status is `unavailable` with no key and cannot be switched on; an admin's `helper` op changes the status for all builders (`helper` message) and survives a restart; the 6th request in a minute gets 429; a second request while one is running is refused; text over 500 characters or an image over 2 MB or of another type gets 400.

### Implementation for User Story 4

- [X] T054 [US4] Create server/helper.ts per [contracts/helper.md](contracts/helper.md): the `Drafter` interface; the Anthropic Messages provider using the platform `fetch` (no package), with `ITEM_AI_KEY`, `ITEM_AI_MODEL` (default `claude-sonnet-5-5`), `ITEM_AI_URL`, `ITEM_AI_TIMEOUT_MS` (60 000), an `AbortSignal` for cancel and timeout, a prompt that includes the item format, a short style guide and the member's text and/or image; `draftItem(request)` that parses the reply, runs `clampItem` then `validateItem`, and returns the design or an `unusable` message; `status()` as `off | unavailable | on` (off when switched off, unavailable with no key or when the service last failed, on otherwise); nothing is logged or stored about requests or replies.
- [X] T055 [US4] In server/store.ts and server/office.ts add the optional `helperEnabled` (default false; the state file stays version 3, so a file without it reads as off); in server/app.ts take the `Drafter` as an option for tests, send `welcome.helper` to builders, handle `admin {op:'helper'}` (admins only) and broadcast `{t:'helper', status}`; in server/api.ts add `POST /api/studio/helper` with the limits (5 a minute, one at a time per member, text up to 500 characters, image PNG or JPEG up to 2 MB) and the responses of the contract.
- [X] T056 [US4] Create src/studio/helper-ui.ts and add to the studio panel: a "Describe it" box and a picture chooser (shown only when the status is `on`; greyed with "The helper isn't set up on this server." when `unavailable`; absent when `off`), a note before the first use naming that the description goes to the service the admin chose, a Cancel button while it works, plain failure messages from the contract, and the draft opening in the studio marked "from the helper" (it is not in the catalog until saved).
- [X] T057 [US4] In src/office-ui.ts add to the Admin panel an **Item helper** switch (sends `admin {op:'helper', enabled}`), disabled with its reason when the status is `unavailable`, and update it from the `helper` message.
- [X] T058 [US4] Run quickstart Q6 in real browsers against a tiny local fake service (started with `ITEM_AI_URL` pointing at it, returning a canned item in the service's reply shape) and record it in checklists/validation.md. A real service is not needed to accept the story; say so in the log.

**Checkpoint**: all four stories work. The helper is optional and the app is complete without it.

---

## Phase 7: Polish & Cross-Cutting

- [X] T059 [P] Write items/FORMAT.md (the user-facing copy of contracts/item-format.md, with a bookshelf example and the template and checker commands) and add "Furnishing the office" to README.md: the catalog, desk items / wall decor / floor art, the studio, versions, the optional helper and how an admin sets it up (`ITEM_AI_KEY`, `ITEM_AI_MODEL`, `ITEM_AI_URL`, the Admin switch, and what is sent where).
- [X] T060 Performance check (quickstart Q5): publish 200 mixed items in range (floor items, 6 on each of 12 desks, wall decor) and measure first-person frame rate at DPR 1 and 2 with the Chrome driver; if below 50 fps apply the research R11 fallback (small-decoration cut at 8 tiles, then `RENDER_H` 300) and measure again. Record the result.
- [X] T061 [P] Write tests/integration/items-upgrade.test.ts (quickstart Q0): start the server on a data folder written by feature 003 (layout format 1 with desks, a custom sheet object, claims, and a room); the layout, claims, rooms and custom object are all unchanged, `GET /api/items` is empty, the catalog still has the six built-ins and the sheet object, and `data/layout.json` is not rewritten.
- [X] T062 Final gate. All of these must pass: `npm run typecheck`, `npm test`, `npm run build`, `npm run items:check` on the template output, and quickstart Q0–Q7 with each outcome recorded in checklists/validation.md.

---

## Dependencies & Execution Order

### Phases

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: needs Setup. **Blocks every story.** T008 (moving the rasteriser) must keep the office pixel-identical.
- **US2 (Phase 3)**: needs Foundational. It comes first of the two P1 stories because the ready-made list needs its placement kinds.
- **US1 (Phase 4)**: needs Foundational and US2 (T020–T027 for desk, wall and floor art kinds). It is the MVP.
- **US3 (Phase 5)**: needs Foundational and the builder from US2/US1 (T034, T035 for the Items tab it extends). T044 and T043 need T020.
- **US4 (Phase 6)**: needs US3 (the studio and its draft route).
- **Polish (Phase 7)**: needs every story.

### Within each story

Tests first, and see them fail. Then the shared pure modules, then the server, then the client, then the browser check.

### Parallel opportunities

- **Phase 2:** T004, T005, T007 and T012 can be written alongside their targets once the signatures exist; T006 (patterns) and T003 (format) are independent; T008 can run alongside T006.
- **US2:** the tests T013–T017 in parallel; then T018 → T019/T020 → T021 → T022/T023/T024 in parallel → T025 → T026/T027.
- **US1:** T030 and T031 in parallel; T032 (the ready-made list) is long but parallelisable by group, one person or agent per group, as long as they add to separate arrays that T032 concatenates.
- **US3:** the tests T037–T041 in parallel; T042 → T043/T044 → T045 → T046; the studio client (T047–T049) can be built alongside the server tasks once the contract is fixed; T051 is independent.
- **US4:** T053 first, then T054 and T057 in parallel.

## Parallel Example: User Story 2

```text
Together:  T013 normalize tests | T014 desk-item tests | T015 wall-decor tests | T016 floor-art tests | T017 privacy test
Then:      T018 layout fields + normalizeLayout → T019 check/merge  ‖  T020 world
Then:      T021 baked floor → T022 mesh3d  ‖  T023 render3d  ‖  T024 render2d
Then:      T025 tools → T026 tool tests  ‖  T027 builder ghosts → T028 server → T029 quickstart Q2
```

## Implementation Strategy

1. **MVP:** Phases 1–4. The office gets about a hundred furnishings in nine groups, with desk items, wall decor and floor art that work properly in both views. Stop and check with Q0, Q1, Q2 and Q5.
2. **Then US3:** the studio, sharing, versions and the checker.
3. **Then US4:** the optional helper.
4. **Polish:** docs, the 200-item speed check, the upgrade test and the final gate.

Each checkpoint leaves `npm test` green and the office usable, so the work can be committed phase by phase.

## Phase 8: Convergence

- [X] T063 In shared/items-edit.ts and server/api.ts, when a changed item that desk items stand on would lose its `surface` (it leaves the Desks group or stops being a floor item), pin that host copy to its old version (or otherwise keep its desk items) and count it in `pinned`, so no desk item is silently lost; add cases to tests/unit/items-versions.test.ts and tests/integration/items-edit-pinning.test.ts per FR-008, FR-019, SC-006 (partial)
- [X] T064 In src/builder/builder.ts (`openStudio`) and src/studio/model.ts, let the six built-in pieces open in the studio as a copy (their boxes turned into parts with the nearest pattern and color) and a sheet object open as a one-box copy of its footprint and height, instead of refusing; add a unit test that each built-in becomes a valid design per FR-014 (partial)
- [X] T065 Run the full two-view check of every ready-made item (a contact sheet of the studio's 3D preview from the front next to `paintItemTop` for all 97, made with the Chrome driver), fix any item whose views disagree, and record the result in checklists/validation.md, closing T036 per FR-004, SC-003 (partial)
- [X] T066 In src/builder/panel.ts `itemButton`, show the creator under each item's name (and its group when the "All" group is selected) so items with the same name can be told apart per FR-017, spec edge case "Same name twice" (partial)
- [X] T067 In src/studio/panel.ts and src/studio/helper-ui.ts, tell "the helper isn't set up on this server" (no service) apart from "the helper isn't answering right now; try again in a minute" (cool-down after a failure), e.g. by sending the reason with the `helper` status, per FR-025 (partial)

## Phase 9: Convergence

- [X] T068 In src/builder/builder.ts `paintAt`, when a paint or erase stroke (painting a wall away, erasing a wall or a desk) makes wall decor or desk items go with it, tell the builder how many ("2 items went with their wall") the way `commit` does for other edits, counting once per stroke, per T027, spec edge cases "Desk items when their desk changes" and "Wall decor when its wall goes" (partial)
- [X] T069 Check in first person that a person standing behind a desk is hidden by a lamp where they overlap and a person in front hides it (quickstart Q2 step 7), with the Chrome driver and a second member, fix any ordering problem, and record the result in checklists/validation.md per FR-013 (partial: the desk and its items are one mesh in the shared depth buffer, but nothing has exercised it)

## Phase 10: Convergence

- [X] T070 Update contracts/protocol-delta.md to match what was built: `welcome.helperCooling` and `helper` message `cooling?` (the service is set up but just failed), and `adminState.helperEnabled` (resent to every admin after the switch), per plan: contracts are the documented protocol (Constitution IV) (partial)
