# Research: Furniture Studio and Ready-Made Catalog

"Observed" means seen in this codebase or in earlier Gather research (`specs/001-gather-office-spaces/research-gather.md`, RG). "Inferred" is a judgement.

## Starting point (observed in the code, as of feature 003)

- **Placed objects** (`shared/layout.ts`) are `{id, kind, x, y, rot}`. `compileWorld` stamps each object's footprint into the tile grid, one object per tile. Nothing can stand on another object, hang on a wall, or lie under walkers.
- **The catalog** (`shared/catalog.ts`) holds six hand-drawn built-ins, plus custom sheet objects (`custom:<id>`) added by `setCustomObjects`. Every item has a `model: Box[]` that first person draws (`src/mesh3d.ts` → `Raycaster.drawFace`). Boxes use named materials that `makeMaterials()` paints from the palette, and custom sheet views.
- **2D pictures** are painted per tile code by `drawFurniture2D` for the built-ins (hand-written), and from the sheet's top view for custom objects. There is no way to get a 2D picture from a model.
- **Custom objects** (`shared/objects.ts`, `server/objects.ts`, `/api/objects`) are validated sheets, with a template and CLI checker. Their format is version 1 and must not change.
- **Desks** (`deriveDesks` in `shared/world.ts`) are found from a `desk` object with a chair on its long side. Claims are keyed by the desk object's id.
- **Builder** (`src/builder/`) edits a draft layout with pure functions in `tools.ts`; the server checks and merges (`shared/layout-check.ts`, `layout-merge.ts`).

## R1. One item format, built from parts

- **Decision:**
  - Every new item (ready-made, studio, helper) is an **item definition v1**: metadata plus up to 24 **parts**.
  - A part is a box with a size, a place in the item's frame, and a `style`: a pattern (`plain`, `wood`, `fabric`, `metal`, `leaf`, `glass`, `screen`, `paper`, `stone`) and a color.
  - See [contracts/item-format.md](contracts/item-format.md).
  - The definition is the only source: the first-person model and the top-down picture are both *derived* from it, so they cannot disagree (FR-004, FR-015).
- **Rationale:** a part is the same `Box` the renderer already draws. A style names a pattern and a color, so there are no per-item textures to ship. Everything is a small JSON document, easy to validate, version, store and have an AI emit.
- **Alternatives:**
  - Pixel-sheet items only: already exist (custom objects), and the user chose parts in clarification.
  - Arbitrary meshes or imported 3D files: out of scope in the spec, and would need a loader and size limits.
  - Voxels: look blocky at the scale of a desk, and an item would need many cells.

## R2. How items join the catalog

- **Decision:**
  - Catalog ids stay as they are for the six built-ins (`desk`, `chair`, …) and custom sheets (`custom:<id>`). New items use `item:<id>`.
  - **Ready-made items** are defined in code, in `shared/readymade.ts`, as item definitions (about 90). They ship with every install, need no files, and are the default when the office has no studio items (Constitution IV).
  - **Studio items** are saved by the server in `data/items/<id>.json` and sent to browsers.
  - A catalog entry gains `group`, `season`, `kind` (floor, deskitem, wall, floorart), `by` (a name, or "Shyft" for ready-made) and `version`.
  - Custom sheet objects appear in the catalog under "Odds and ends" without any change to their format.
  - The six hand-drawn built-ins keep their art (FR-006) and are listed under their groups: desk, small desk and table under *Desks*, chair and sofa under *Chairs*, plant under *Decorations*.
- **Rationale:** code for the ready-made list means it is reviewed, tested and versioned with the app, and the same module powers both server and browser. Studio items are data, because members make them at run time.
- **Alternatives:**
  - Ready-made list as JSON files read at start: more moving parts, and the client needs it too.
  - Ready-made items copied into `data/items` on first run: members could edit or lose them, and upgrades could not add items.

## R3. The top-down picture is derived from the parts

- **Decision:** `renderItemTop(item, rot)` in `src/item2d.ts` paints a picture on a canvas at 32 px per tile, in the same slightly-from-the-front look as the hand-drawn art:
  - Parts are sorted by height, then back to front.
  - Each part draws its top face, lifted up by its height on the page (half a pixel per pixel of height, so a one-tile-tall thing rises half a tile), and its south face below it, shaded darker.
  - The pattern fills the faces with the same texture painters the 3D materials use. There is a one-pixel dark outline round the whole item.
  - The canvas is cached per item, version and turn.
  - For turned items, the result is the same picture, drawn with the item turned; the footprint rotates and the lift stays "up the page".
- **Rationale:** it looks like the rest of the 2D office, depends only on the parts, and costs one painting per item version, not per frame. The 3D view needs no new code because it already draws parts.
- **Check:** quickstart Q1 compares every ready-made item in both views, and a unit test paints each item and checks it is not empty and stays within its footprint plus the lift.
- **Alternatives:**
  - Render the 3D model off-screen from above and use that picture: needs a second rasteriser setup, gives a flat top-down look, and loses the front lip that the office's 2D art has.
  - Ask the member to draw the 2D view: rejected in clarification.

## R4. Placement kinds (FR-007 … FR-013)

- **Decision:** `PlacedObject` gets optional fields (layout format stays 1, and every existing layout still parses):

  | Kind | Extra fields | Meaning |
  |---|---|---|
  | floor | none | As today: footprint stamped into the grid, may block. |
  | desk item | `on` (host desk object id), `at` ([x, y] inside the host's footprint, in tiles) | Stands on the desk top. World position = host origin + `at` turned with the host. `rot` is relative to the host. Never blocks, never stamped. |
  | wall decor | `wall` (`'n'\|'e'\|'s'\|'w'`: which face of the wall tile it hangs on); `x`, `y` are the wall tile | Hangs on that face of a wall tile that borders open floor on that side. Never blocks. |
  | floor art | none (uses `x`, `y`, `rot`) | Flat. Not stamped, never blocks, drawn under everything. Several may overlap; the later one in the list is on top. |

  - **Hosts:** a desk item may stand on any floor object whose catalog entry has a `surface`: the two original desks (0.31) and every item in group `desks` (its top, from its parts). **Claiming stays with the original desks** (the chair rule in `deriveDesks` is unchanged); the ready-made desks are for looks and for holding desk items.
  - `normalizeLayout(layout, catalog)` (pure, in `shared/layout.ts`) drops any desk item whose host is gone, wall decor whose wall tile is gone or whose face no longer borders floor, and any item over the limits (6 per desk tile, 2 per wall face). The builder, the server's publish and the merge all call it, so an orphan can never be saved.
  - Moving or turning a desk needs no work for its items, because they refer to the desk by id.
  - Deleting a desk removes its items through the same `normalizeLayout`.
  - **Desk rules** (claims, locks, privacy) read desks, not items, so they are untouched (FR-011).
- **Rationale:** referring to the host by id is how desk claims already survive moves (feature 003 R2), and the items need the same property. Keeping the tile grid for floor objects only means collision, line of sight and desk derivation remain exactly as they are.
- **Alternatives:**
  - A second grid layer per kind: more state to keep in step, and a desk item still needs to know its desk.
  - Items as children inside the host object: merges and undo would treat desk plus items as one unit, losing per-item edits.

## R5. How each kind looks in 3D

- **Decision:**
  - **Desk items:** their boxes are placed at the host's desk-top height. The desk top is at z 0.31; each desk item's parts start at z 0. `worldMeshes` offsets them by the host's top height (a catalog field, `surface`, which the desk models declare, default 0.31).
  - **Wall decor:** boxes are placed against the wall face, 0.02 off it, at the item's own `z` (most hang at about 0.5 of the wall). The raycaster draws wall cubes; the decor's faces are in front of the wall face so the depth test keeps them visible.
  - **Floor art:** it is *baked into the floor*: for every floor cell the art covers, the floor texture for that cell is a copy of the floor with the art's slice painted over it (`bakeFloor`). The floor sampler needs no change, art never hides or is hidden wrongly by people, and it costs nothing per frame.
  - 2D uses the same baked cells: floor art is painted into the map canvas in the floor pass.
  - **Materials:** a part's style `pattern:color` becomes a 32×32 texture created on first use and cached (`materialFor(style)`), replacing the fixed named set for studio and ready-made items. The six built-ins keep their named materials.
- **Rationale:** each kind reuses an existing path (boxes, depth, floor textures) rather than adding a renderer. Baking floor art avoids z-fighting and per-pixel work.
- **Alternatives:** drawing floor art as depth-writing quads (fights with people's feet and costs per frame); a decal pass in the floor loop (extra lookup per pixel).

## R6. The studio preview uses the real renderer's drawing code

- **Decision:** the face rasteriser moves from `Raycaster.drawFace` into a small module, `src/raster.ts` (`fillFace(buffer, depth, face, cam, …)`). The office view and the studio's 3D preview both call it, so a preview pixel is the pixel the office will draw. The preview is a 360×270 framebuffer with an orbiting camera (drag to turn, wheel to zoom); the top-down preview is `renderItemTop` shown at 3× zoom, with a faint 32 px grid.
- **Rationale:** guarantees the preview is truthful, avoids a second rendering path to keep right, and needs no WebGL or library.
- **Alternatives:** a separate canvas painter's-algorithm preview (looks different from the office, and drifts); an `<iframe>` of the office (heavy, and cannot show an unsaved design).

## R7. The studio itself

- **Decision:** the studio is a full-height panel opened from build mode ("New item" or "Edit"), with a parts list on the left, the two previews in the middle, and properties on the right:
  - **Parts list:** add (box), duplicate, delete, reorder, and a few ready shapes (box, plank, post, sheet, slab) that fill in sensible sizes. Selecting a part outlines it in both previews.
  - **Properties of a part:** size, place and height by number fields with steppers (0.05 tile steps), pattern, color (palette swatches plus a hex field), and "mirror across the item's middle" to make left and right halves quickly.
  - **Item properties:** name, group, season, kind, footprint, "blocks walking", how high it sits (wall decor), and what it stands on.
  - **Top-down preview:** clicking a part selects it; dragging moves it on the grid in 0.05 steps.
  - **Limits shown live:** parts used of 24, footprint, and what is wrong, with the first problem outlined.
  - **Save / Save as copy / Discard / Delete (own items).**
  - **Draft:** the design is autosaved to the server as that member's one studio draft (`data/studio/<memberId>.json`) every second after a change, and restored when they return.
- **Rationale:** numeric parts with live previews are accurate, easy to test and keyboard-friendly, and avoid building a 3D gizmo editor. The previews do the work of making it feel direct.
- **Alternatives:** a 3D drag-handle editor (much larger, and hard to make accessible); a text-only JSON editor (not for the audience).

## R8. Storage, API and checks

- **Decision:** `POST /api/items` (create or update, with the design in the body), `DELETE /api/items/:id[?confirm=1]`, `GET/PUT/DELETE /api/studio/draft`, and `GET /api/items` for the full definitions (the welcome message carries a light index: id, name, group, season, kind, by, version). See [contracts/http-api.md](contracts/http-api.md). The server validates with the same pure `validateItem` the checker uses, limits saves to 20 a minute per member, and keeps at most 500 studio items.
- **Rationale:** the HTTP pattern is how layouts and sheets already travel, so sessions, limits, and error shapes stay the same.

## R9. Editing an item that is already placed (FR-019)

- **Decision:**
  - The server keeps the last 5 versions of each studio item (`data/items/<id>@<version>.json`).
  - When a member saves a change that alters the footprint or the kind:
    - For each placed copy, the server tests whether the new footprint fits where the copy stands (same test the builder uses).
    - A copy that fits keeps its position and facing and shows the new item.
    - A copy that does not fit is **pinned** to the old version (`v` on the placed object) in a published revision credited to the editor. It keeps its old look and size.
    - The save answers with how many copies were pinned, and the studio tells the member.
  - A change that does not alter footprint or kind updates all copies without any pin.
  - Desk items and wall decor are checked the same way: one that no longer fits its desk surface or wall is pinned too.
- **Rationale:** a pinned copy is a copy of an old version, which is simple to draw, merge and explain. No separate "size override" is needed. Old versions are kept only as long as a placed copy uses them.
- **Alternatives:** refusing the edit while copies exist (blocks creators); silently resizing neighbours (breaks other people's layouts).

## R10. The optional AI helper (FR-023 … FR-026)

- **Decision:**
  - A `Drafter` interface on the server: `draft(request) → Promise<ItemDefinition>`, where the request is `{text?, image?}` (an image is a PNG or JPEG of at most 2 MB).
  - **One provider ships:** the Anthropic Messages API, called with the platform `fetch`: no SDK, no new package. It asks the model for a single JSON object that matches the item format (the schema is in the prompt and in a tool definition), with a short style guide and the allowed patterns.
  - **Configuration** (environment): `ITEM_AI_KEY` (required to enable), `ITEM_AI_MODEL` (default `claude-sonnet-5-5`), `ITEM_AI_URL` (default the public API), `ITEM_AI_TIMEOUT_MS` (60 000).
  - **Admin switch:** `admin {op:'helper', enabled}` turns the helper on and off. It is saved in office state (default off). The server reports `helper: 'off' | 'unavailable' | 'on'` to builders in `welcome`, and in a `helper` message when it changes; members see the button only when it is `on`.
  - **Flow:** `POST /api/studio/helper` → the server sends the request to the service, parses the reply, runs `validateItem` (parts, ranges, colors, names are all clamped and checked), and returns a design. It is not saved as an item; the studio opens it as an unsaved design marked "from the helper".
  - **Privacy:** nothing is sent until a member presses the button. The request and the image are not stored or logged; only the member's saved design survives. The studio says which service gets the description before the first use.
  - **Limits:** 5 requests a minute per member; one at a time per member; the member can cancel.
  - **No service:** if no key is set, `helper` is `unavailable`, the button explains why, and nothing else changes.
- **Rationale:** it keeps the zero-infrastructure path (Constitution V) and keeps the model's output inside the same validator as everything else (Constitution III). A reply that fails validation is shown as a plain failure, never half-saved.
- **Alternatives:** an SDK (a new dependency for one call); a local model (heavy to run); letting the browser call the service (would put the key in the browser, and bypass server limits).

## R11. Performance (SC-005)

- **Decision:**
  - The existing per-object culling stays: objects beyond 20 tiles or well behind the camera are skipped, and back faces are dropped.
  - Desk items belong to their host's mesh group (one distance test for a desk and everything on it).
  - Small decorations (taller than 0.15 and wider than 0.1, so not floor art) beyond 12 tiles are skipped.
  - The parts limit (24 per item, and 6 items per desk tile) bounds the worst case.
  - **Measure:** 200 mixed items in range at DPR 1 and 2, as in quickstart Q5. If it falls below 50 frames per second, lower the small-decoration cut to 8 tiles, then lower `RENDER_H` to 300.
- **Rationale:** a desk with six items is at most about 50 boxes; with 12 desks that is about 600 boxes (3 000 faces) before culling, which is within the rasteriser's measured headroom (60 fps with 60 extra pieces today).

## R12. Seasons

- **Decision:** a season is a tag on an item (`winter|spring|summer|autumn`, or none). The catalog has a season filter and a "Seasonal" group. Holidays are named in item names, and filed under their season (winter: tree, wreath, lights, snowman, gifts, menorah; spring: tulips, eggs; summer: umbrella, surfboard; autumn: pumpkins, scarecrow, harvest). Nothing happens automatically with dates. Everything stays available all year.
- **Rationale:** it is what the spec asks for, and an automatic date feature is easy to add later on top of the tag.

## R13. Compatibility (FR-006, FR-022, SC-007)

- **Decision:** the layout format stays at 1 with optional fields, so offices saved before this feature load unchanged. The six built-ins and custom sheets are untouched. `data/layout.json`, `office-state.json` and `data/objects/` need no migration. New folders (`data/items`, `data/studio`) appear when first used.

## Dependencies

No new packages. The helper uses `fetch` (Node 20+ and browsers). The item checker and template use existing code.
