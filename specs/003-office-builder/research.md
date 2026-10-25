# Research: Office Builder and 3D Furniture

"Observed" means seen in this codebase or recorded earlier from Gather (`specs/001-gather-office-spaces/research-gather.md`, cited as RG §n). "Inferred" means a judgement. "Unknown" means not checked.

## Starting point (observed in the code)

- **The layout is hard-coded.** `shared/map.ts` holds the layout as module constants:
  - `MAP_ROWS`, 40×28 characters, one per tile, mixing floor, wall and furniture codes;
  - `AREAS`, as rectangles;
  - `DESK_PODS`, which are derived from `POD_COLUMNS`;
  - `DESKS`, from `deriveDesks()`;
  - `SPAWN`, from the `S` tile.
- **Everything reads those constants directly:**
  - the server: `app.ts`, `office.ts` and `store.ts`;
  - proximity: `lineOfSight` and `positionContext`;
  - both renderers;
  - `office-ui.ts`.
- **Furniture is one tile code per tile.** A desk is a run of `d` tiles; `deriveDesks` finds a chair `h` that touches a run inside a pod. A desk's id is `<podId>:<seatX>,<seatY>`, so it changes whenever the chair moves.
- **First person is a software raycaster** (`src/render3d.ts`, 360 px tall):
  - Walls are drawn one column at a time, with one depth per column (`zbuf[x]`).
  - Furniture and people are camera-facing billboards, sorted far to near, and clipped only against that per-column wall depth. So furniture can't hide people correctly.
- **Character sheets are loaded from the `sprites/` folder at start, or on an admin reload.** There is no upload over the network. The validator is pure (`shared/sprites.ts`), and the server rejects bad sheets with error codes.
- **Identity:** a member is a per-browser UUID sent on `join`. A guest is anyone without one (`eph-…`). Admins hold `?admin=<token>`.
- **Message size:** WebSocket messages are capped at 64 KB (`maxPayload`).

## R1. Making the layout data, not code

- **Decision:**
  - Add a `Layout` document (see [data-model.md](data-model.md)) holding:
    - the grid size;
    - one floor code and one wall code per tile;
    - a list of placed objects with stable ids, positions and facing;
    - rooms and pods as named tile sets;
    - the spawn point.
  - A pure `compileWorld(layout, catalog)` in `shared/world.ts` turns it into the lookup grid that every existing function uses.
  - `shared/map.ts` keeps its API through ES-module **live bindings**: `export let MAP_W`, `export let AREAS`, `export let DESKS` and so on, which `setWorld()` reassigns.
- **Rationale:**
  - **Constitution II:** the layout is defined once, in `shared/`, and every view and the server read it.
  - **Live bindings** let the ~40 existing call sites (`tileAt`, `isBlocking`, `areaAt`, `deskAt`, `AREAS`…) keep working unchanged after a publish, because importers always see the current value. This keeps the change small and lets the existing 176 tests keep passing.
  - **One global world is enough:** clarification Q1 settled on one office, so a world per office isn't needed.
- **Alternatives:**
  - Passing a `world` argument everywhere: cleaner for several offices, but it touches every call site for no gain now. It can be done later if separate offices arrive.
  - Keeping the character grid as the stored format: it can't hold object ids or facing, and claims need stable desk ids (FR-015).

## R2. Desk identity that survives moves (FR-015)

- **Decision:**
  - The desk becomes one placed object, `desk`, a 3×1 workstation (2D art keeps its left, middle and right ends).
  - A desk's id is its **object id**, which stays the same when the desk is moved or turned. A desk is claimable when a `chair` object touches its long side and both are inside one pod.
  - Claims are keyed by desk object id.
  - **On publish**, a claim is released only if one of these is true:
    - its desk object is gone;
    - no chair touches it;
    - it lies outside every pod.
  - Its `podId` is whatever pod it is in now, so it follows that pod's mode.
- **Migration (FR-017, SC-007):**
  - The first start converts `MAP_ROWS` into a layout. Each `ddd` run becomes one `desk` object with a deterministic id, `desk-<x>-<y>` (from its left tile). Each `h` becomes a `chair`.
  - Pods keep the ids `pod-1`…`pod-3`, and rooms keep `meet-a`, `kitchen` and the rest, so `podModes` and `areaAllowed` carry over unchanged.
  - Saved claims `pod-N:sx,sy` are re-keyed to the desk whose chair is at `(sx, sy)` (office-state v3, [contracts/office-state-v3.md](contracts/office-state-v3.md)).
- **Alternatives:**
  - Desk id as the chair's id: moving the desk without its chair would keep a claim on an empty chair.
  - An explicit desk–chair pairing field: more data for builders to keep correct. Adjacency is what people see.

## R3. Draft, publish, merge and history (FR-003…FR-005, FR-004a)

- **Decision:**
  - **Drafts live on the server**, one per member: `data/drafts/<memberId>.json`. Each holds the layout and the `baseRev` it started from. Drafts are kept 30 days after their last save (the spec asks for at least 7).
  - **Undo and redo** are a client-side stack of up to 100 layout snapshots, and are not saved with the draft. A reload keeps the draft but starts a fresh undo history.
  - **Publish** sends the draft and its `baseRev`:
    - If `baseRev` is the current revision, the draft is checked (R6) and becomes the new revision.
    - Otherwise the server runs a three-way merge of base → current ("theirs") and base → draft ("mine").
  - **The merge** is a pure function, `shared/layout-merge.ts`. It works per tile (floor, wall), per object id, per room id, per pod id, and for the spawn and grid size:
    - A change on one side only is taken.
    - The same change on both sides is fine.
    - Different changes to the same unit are a **clash**.
    - The server returns the clashes and does not publish.
    - The client marks them on the map. The builder picks "mine" or "theirs" for each. The client applies those choices with the same merge function, saves the result as a draft on top of the current revision, and publishes again.
  - **History:** the last 10 revisions are kept, with publisher name, member id and time. Restoring loads an old revision into the builder's draft, to be checked and published like any other edit. So a restore is itself a revision and can be undone.
  - **Missing base:** a draft whose `baseRev` has dropped out of the 10 kept revisions has no base. Every unit that differs from the current layout is then treated as a clash.
- **Gather:**
  - Observed: Gather stores objects, nooks and desk pods per map, and edits them through admin actions such as `mapUpdateObjects` and `mapSetNooks` (RG §1).
  - Unknown: whether Gather has drafts. Inferred: Gather's map maker saves straight to the live map.
  - **Deviation, listed in the spec:** private drafts with publish and merge, because every member can build (clarification), and half-made changes in front of everyone would be confusing.
- **Alternatives:**
  - Live shared editing (CRDT): out of scope in the spec, and much more machinery.
  - Last write wins: rejected by clarification Q4.

## R4. Moving layouts over the network

- **Decision:**
  - Layouts and drafts go over **HTTP JSON**, not WebSocket:
    - `GET /api/layout`
    - `GET/PUT /api/draft`
    - `POST /api/publish`
    - `GET /api/layout/history`
    - `POST/DELETE /api/objects`
    - See [contracts/http-api.md](contracts/http-api.md).
  - **Who is calling:** each request sends a per-connection **session token**, a random 128-bit value given in `welcome`. The server maps it to the connected member, so the HTTP routes know who the caller is, whether they're an admin, and whether they're a guest, without trusting the client (Constitution III).
  - **Telling clients:** after a publish the server broadcasts a small `layout` message `{rev, by, at}`. Each client fetches `GET /api/layout?rev=N` and swaps its world. That takes well under 2 s on a local network (SC-002).
- **Rationale:** a 100×100 layout with a few thousand objects can reach a few hundred KB, which is over the 64 KB WebSocket cap. Raising the cap would make every socket easier to flood.
- **Alternatives:**
  - Splitting the layout into pieces over WebSocket: more code, no benefit.
  - Sending a diff over WebSocket: possible later, as an optimisation.

## R5. Catalog, prefabs and 2D drawing

- **Decision:**
  - `shared/catalog.ts` lists every placeable thing. For each item:
    - its footprint `w×d` in tiles;
    - whether it blocks walking;
    - the tile code it compiles to (`d`, `h`, `t`, `p`, `s`);
    - its 3D model (R7).
  - **Floors** are `.` `,` `;` `_`. **Walls** are `#` `G` `W` `B` `K`, and stay tile codes painted on tiles.
  - **Compiling objects into the grid:** `compileWorld` stamps each object's rotated footprint into the furniture grid. So the existing 2D painters (`drawFurniture2D`, which looks at neighbouring tiles), collision and line-of-sight work unchanged.
  - **Overlaps:** two blocking objects on one tile, or a blocking object on a wall, is a check problem (R6).
  - **Facing in 2D:** furniture with a facing (chair, sofa, desk) gets a rotated 2D painter, a small change in `src/art.ts`.
  - **Prefabs** are catalog entries listing floor and wall cells, objects and a room or pod at offsets. Placing one adds them all with fresh ids. Everything stays individually editable (FR-010).
  - **The built-in prefabs:**
    - `pod-4`: 7×6 tiles, 4 desks, 4 chairs, pod marking;
    - `meeting-6`: 8×7 tiles, walls with a doorway, carpet, table, 6 chairs, plant, private room marking.
- **Gather:** observed that the builder catalog has `MappableKind = Floor | GameObject | MeetingArea | CoworkingArea`, and that `meetingRoom` is an 8×8 prefab with a floor texture, wall texture and child objects at tile offsets (RG §1). This design follows that structure. The art is our own (Constitution I).

## R6. Checking a layout (FR-012)

- **Decision:** a pure `checkLayout(layout, catalog) → Problem[]` in `shared/layout-check.ts`. Each problem is `{code, tiles, message}`. The codes are:
  - `spawn-blocked`
  - `spawn-outside`
  - `unreachable` (a room's tiles or a desk's chair that a walk from the spawn can't reach)
  - `room-overlap`
  - `pod-overlap`
  - `pod-in-private-room` (the existing rule in `validateOffice`)
  - `object-outside`
  - `object-overlap` (two blocking objects, or a blocking object on a wall)
  - `bad-name`
  - `too-many-objects`
- **Where it runs:** the client runs it on every draft change and paints the problem tiles. The server runs it again before accepting a publish. Neither trusts the other.
- **Reachability:** a breadth-first walk over non-blocking tiles from the spawn. A 100×100 grid is 10 000 tiles, which takes about a millisecond.
- **Turning a piece (edge case):** the client checks the rotated footprint with the same overlap rule, and refuses the turn with a message.

## R7. Solid furniture in first person (FR-018, FR-020, SC-004, SC-005)

- **Decision:** keep the software renderer, the same crisp pixel look and the same 360-px framebuffer, and add:
  1. **A full depth buffer:** one `Float32Array` of `w×h`, replacing the per-column `zbuf`.
     - Wall pixels write their column's perpendicular distance.
     - Floor and ceiling pixels write "infinity", because nothing sits under the floor.
  2. **Box models:**
     - Every built-in catalog item has a model made of a few axis-aligned boxes in tile-local units: `x, y, z, w, d, h`, with a material per face. For example, the desk is a top slab, two side panels, a modesty panel and a monitor box, and the chair is a seat, a back and a stem.
     - The object's facing rotates the boxes in 90° steps, so first person faces the same way as 2D (FR-018).
     - The models live in `shared/catalog.ts` as data, keyed by catalog id. That is presentation data keyed off the shared model, which Constitution II allows.
  3. **A polygon rasteriser:**
     - Each visible box face is a quad. Faces pointing away from the camera are dropped.
     - Each quad is clipped at the near plane, projected, and filled scanline by scanline.
     - Textures are perspective-correct: `u/z`, `v/z` and `1/z` are interpolated across the face.
     - Each pixel is depth-tested and written, with fog and a per-face shade (top, side and front differ) for depth.
  4. **People:** they stay billboards (spec Assumption) but are now depth-tested per pixel. So a desk hides the legs of someone behind it, and someone in front of a desk hides the desk (FR-018, US3 AC2).
  5. **Custom objects:** a single box of footprint × height. Its top, front, side and back drawings are mapped onto the matching faces; the opposite side is mirrored, and a missing back copies the front (FR-019, clarification).
- **Materials:** small 32-px textures painted from `PALETTE` (wood, fabric, leaf, metal, screen). Both views share the palette.
- **Cost estimate:**
  - About 60 objects × about 5 boxes × at most 3 visible faces gives under 1 000 quads.
  - Fill is limited by the frame size: 640×360 is about 230 k pixels, with some overdraw.
  - Objects more than 20 tiles away, or behind the camera, are culled before any quad is built.
  - Models are turned into world-space boxes once per layout, not every frame.
  - This is well inside the budget of the existing loop, which runs at 60 fps today with billboards.
- **Fallback:** if Q5 measures under 50 fps, lower `RENDER_H` to 300 (the same fallback as feature 002), then cap visible objects at the 40 nearest.
- **Alternatives:**
  - **WebGL2 renderer:** the GPU does the depth work, and it suits the "full 3D" roadmap. But it means a second renderer, shaders and texture atlases, a different look, and it is harder to test headless. That's more than this feature needs, and it can come later as an extra view (Constitution II).
  - **three.js:** a new dependency of about 600 KB. Constitution V prefers platform APIs, and the software path meets the targets.
  - **Sprite stacking or voxels:** rejected in clarification Q3 for custom objects. For built-in pieces, boxes give cleaner shapes at this resolution.

## R8. Custom object sheets (FR-021…FR-024)

- **Decision:** a new, separately versioned **object sheet v1** format ([contracts/object-sheet.md](contracts/object-sheet.md)):
  - **Image:** one PNG with a sidecar JSON. The sidecar sets `footprint [w,d]` (1–4 tiles each), `height` (8–96 px, in steps of 8), `blocks`, `frames` (1–8) and `fps` (1–12).
  - **Layout:** rows are the views, in the order top, front, side and optionally back, and columns are animation frames.
  - **Sizes:** the top view is 32w × 32d px, the front and back are 32w × height, and the side is 32d × height.
  - **Template and checker:** the `objects:template` command writes a guide PNG and sidecar for any footprint, and `objects:check` validates outside the app (Constitution IV).
  - **Upload:** a builder sends the PNG and the sidecar fields to `POST /api/objects`, with a 512 KB limit. The server decodes the PNG with `pngjs`, validates it with the same pure function, and stores it in `data/objects/`. It is served at `/objects/<id>.png?v=<hash>`.
  - **Limits:** at most 100 custom objects per office, and 10 uploads a minute per member.
  - **Removing an object** (edge case): `DELETE /api/objects/:id` returns how many placed copies exist. Confirming publishes a revision without those copies, attributed to the remover, then removes the object.
- **Why separate:** character sheets (v1) stay exactly as they are (FR-015 of feature 002, and the spec Assumption). Objects have different needs: footprints, several views and a height.
- **Alternatives:**
  - Separate files per view: harder to manage in pixel-art tools, which export one sheet per animation.
  - Reusing the avatar 4×4 grid: it doesn't fit footprints.

## R9. Builder interface

- **Decision:** build mode lives in the 2D view.
  - **Opening it:** a toolbar button, or the `B` key, opens a builder panel with:
    - a catalog of tabs (Floors, Walls, Furniture, Rooms & pods, Custom);
    - tools: select, paint, erase, room, pod, spawn;
    - undo, redo, problems, history, discard and publish.
  - **What the map shows** in build mode:
    - the draft through the normal 2D renderer;
    - a grid overlay;
    - room and pod tints;
    - problem tiles in red;
    - merge clashes in amber.
  - **Editing:**
    - Dragging paints.
    - Objects are picked by clicking, moved by dragging, turned with `R`, and deleted with `Delete`.
    - Undo and redo are `Ctrl/Cmd+Z` and `Shift+Ctrl/Cmd+Z`.
  - **Avatar:** the builder's own avatar stays where it was in the published office. Movement keys are paused while build mode is open.
  - **Previewing in first person:** switching to first person while building shows the draft, for checking furniture, with no walking through it.
- **Seeing a publish:** everyone sees a small notice, "<name> updated the office", with a link to history for builders (FR-002).
- **The admin switch:**
  - `admin {op:'building', enabled}` turns building on and off. It is saved in office state (FR-002a).
  - `welcome` carries `canBuild`, and a `building` message updates it live.
  - Turning building off makes anyone currently in build mode drop out, with a notice. Their drafts are kept.

## R10. Publishing side effects (FR-013…FR-016)

- **Decision:** the server applies a publish in this order:
  1. `setWorld(compileWorld(layout))`.
  2. `office.reconcile()`, which:
     - releases claims, locks and invitations for desks that no longer exist;
     - drops allow-lists and admissions for rooms that no longer exist;
     - drops pod-mode overrides for pods that no longer exist;
     - for each released claim, sends `notify deskRemoved` to the holder if online, or adds them to the saved notice list.
  3. Move anyone standing on a blocking tile to the nearest free tile, using `teleport {reason:'layout'}`. The search widens `nearestFreeTileNear` to the whole map and keeps to the same private room where possible; if there is no free tile, they go to the spawn.
  4. Broadcast `layout {rev, by, at}` and the office snapshot.
- **Rooms:** the next links tick (200 ms) recomputes contexts from the new rooms. So anyone now outside a room's tiles leaves its conversation, chat and media exactly as if they had walked out (FR-016). An integration test proves this (Constitution III).

## R11. Storage

- **Decision:**
  - `data/layout.json` holds `{format:1, rev, current, history[≤10]}`. Each entry is `{rev, layout, by:{memberId,name}, at}`.
  - `data/drafts/<memberId>.json` holds one draft per member.
  - `data/objects/<id>.png` and `<id>.json` hold the custom objects.
  - `office-state.json` moves to version 3: claims are keyed by desk object id, and it gains `buildingEnabled` and a general `deskNotice` list that replaces `deskResetNotice`.
  - All writes go through the existing write-then-rename pattern.
- **No layout file yet:** the built-in layout is compiled from today's `MAP_ROWS`, which become `shared/default-layout.ts`, and saved as revision 1 (FR-017).

## Dependencies

No new packages. `pngjs` (already a dependency) decodes uploaded object sheets on the server. Everything else uses platform APIs: `fetch`, `crypto.randomUUID`, and Canvas 2D.
