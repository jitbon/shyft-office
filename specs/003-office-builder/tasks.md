---

description: "Tasks for the office builder and 3D furniture"
---

# Tasks: Office Builder and 3D Furniture

**Input**: design documents in `specs/003-office-builder/`: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/) and [quickstart.md](quickstart.md)

**Tests**: included. Constitution V requires unit tests for deterministic logic. Constitution III requires a test proving privacy for any feature that changes private contexts, and room editing does. Write each story's tests before its implementation, and see them fail first.

**Organization**: tasks are grouped by user story, so each story can be built and checked on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US4 from spec.md
- Paths are relative to the repository root

## Notes for every task

- **The world is global to each process.** `setWorld` replaces the module-level world in `shared/map.ts`.
  - Any test that changes the world MUST restore the default with `setWorld(compileWorld(defaultLayout()))` in `afterEach`.
  - Integration tests start their server with a fresh `dataDir` (`tests/integration/helpers.ts`), so each server starts from the default layout.
- **Read the live bindings at use time.** Never copy `AREAS`, `DESKS`, `DESK_PODS`, `MAP_W`, `MAP_H` or `SPAWN` into a local constant at import time, or the copy goes stale after a publish.
- **`setWorld`, `getWorld` and `onWorldChange` live in `shared/map.ts`**, not `world.ts`: a module can only reassign its own live bindings.
- **Keep the existing message shapes.** Existing protocol messages keep their shape. Only the additions in [contracts/protocol-delta.md](contracts/protocol-delta.md) are allowed.

---

## Phase 1: Setup

**Purpose**: scripts and test fixtures shared by every phase.

- [X] T001 Add the scripts `"objects:template": "tsx tools/object-template.ts"` and `"objects:check": "tsx tools/object-check.ts"` to package.json. `data/` is already in .gitignore, so nothing else is needed there.
- [X] T002 [P] Create tests/unit/fixtures/layouts.ts with these helpers:
  - `emptyLayout(w, h)`: wood floor, walls round the edge, spawn in the middle.
  - `withObject(layout, obj)`, `withRoom(layout, room)` and `withPod(layout, pod)`.
  - `smallOffice()`: 16×12 tiles, one private room, one pod with 2 desks and their chairs.

  Later unit tests build on these.

---

## Phase 2: Foundational (layout as data, with no visible change)

**Purpose**: the office is read from a `Layout` instead of the hard-coded rows, and everything behaves exactly as before.

**⚠️ CRITICAL**: no story can start until this phase is done and the full existing test suite passes.

- [X] T003 Create shared/layout.ts with the types `Layout`, `PlacedObject`, `Room`, `Pod` and `Rect` from data-model.md. Add these functions:
  - `rotFootprint([w,d], rot)`: returns `[w,d]` for `rot` 0 or 2, and `[d,w]` for 1 or 3.
  - `objectTiles(obj, catalog)`.
  - `parseLayout(raw, catalogIds) → {ok, layout} | {ok:false, errors}`, which enforces exactly:
    - `w`, `h`: "integer 10–100 each";
    - `floor` and `walls`: "string, length `w×h`";
    - floor codes: `.` `,` `;` `_`;
    - wall codes: space, `#` `G` `W` `B` `K`;
    - objects: "at most 2 000";
    - object `id`: "`[a-z0-9-]{1,40}`, unique";
    - `kind`: a known catalog id or `custom:<id>`;
    - `rot`: `0|1|2|3`;
    - "whole footprint inside the grid";
    - rooms: "at most 50", "name 1–25 characters", "capacity 1–50";
    - pods: "at most 30", `mode` `ambient|cubicle`;
    - spawn: inside the grid.

    Strings are trimmed and clamped, and unknown fields are dropped.
- [X] T004 [P] Create shared/catalog.ts with `CatalogItem` (`id`, `name`, `footprint`, `blocks`, `tile`, `facing`, `model: Box[]`) and the built-in items, each with `model: []` for now (models come in US3):

  | Item | Footprint | Tile | Blocks | Facing |
  |---|---|---|---|---|
  | `desk` | [3,1] | `d` | yes | yes |
  | `chair` | [1,1] | `h` | no | yes |
  | `table` | [1,1] | `t` | yes | no |
  | `plant` | [1,1] | `p` | yes | no |
  | `sofa` | [1,1] | `s` | yes | yes |

  Export `builtInCatalog()` and `catalogItem(kind, custom?)`.
- [X] T005 Create shared/default-layout.ts, which moves today's `MAP_ROWS`, `AREAS` and pod columns out of shared/map.ts and converts them into `defaultLayout(): Layout`:
  - Each wall character becomes a `walls` code, with the floor under it from `baseFloor`.
  - Each run of 3 `d` tiles becomes one `desk` object with id `desk-<x>-<y>` (its left tile). It gets `rot 2` when its chair is above it and `rot 0` when the chair is below.
  - Each `h` becomes a `chair` object `chair-<x>-<y>`, facing its desk or table.
  - Each `t`, `p` and `s` becomes `table-`, `plant-` or `sofa-<x>-<y>`.
  - The spawn comes from the `S` tile.
  - Rooms keep the ids `meet-a`, `meet-b`, `kitchen`, `library`, `lobby` and `open`, with their rects.
  - Pods keep `pod-1`…`pod-3` with today's rects and mode.

  Also export `LEGACY_ROWS` (today's rows), used only by tests.
- [X] T006 Create shared/world.ts with `World` and the pure function `compileWorld(layout, catalog) → World`:
  - **The grid** is one char per tile: the wall code if there is a wall; else the tile code of a blocking object on the tile; else the tile code of a non-blocking object; else the floor code. The spawn tile compiles to `S`.
  - **Areas** come from rooms, and pods are copied.
  - **Desks:** every `desk` object inside a pod with a `chair` touching its long side.
    - The id is the desk object id, and `seat` is the touching chair (the lowest chair id if there are several).
    - `podId` is the pod containing the desk's centre tile.
    - `tiles` are the seat, the desk footprint and the walkable ring, with contested ring tiles going to the nearest seat and then the lower id, the same rule as today's `deriveDesks`.
  - **The spawn** is the tile centre.
  - Also include `objects` (with resolved catalog items), for the renderers.

  Export `setWorld(w)` and `getWorld()`, and `onWorldChange(cb)` for client caches.
- [X] T007 Rewrite shared/map.ts:
  - Replace the constants with live bindings that `setWorld` reassigns: `export let MAP_W`, `MAP_H`, `AREAS`, `DESK_PODS`, `DESKS` and `SPAWN`.
  - `tileAt`, `isBlocking`, `baseFloor`, `areaAt`, `areaById`, `deskAt`, `deskById`, `podAt`, `podById`, `validateOffice`, `nearestFreeTileNear` and `moveWithCollision` read the current world's grid and lookup maps.
  - Remove `MAP_ROWS` and `deriveDesks`.
  - Initialise with `setWorld(compileWorld(defaultLayout(), builtInCatalog()))` when the module loads.

  The exported signatures stay the same, apart from `MAP_ROWS` and `deriveDesks`.
- [X] T008 Update the direct users of `MAP_ROWS`:
  - **src/render3d.ts:** the furniture list comes from `getWorld().objects`, and the floor and ceiling cells from `MAP_W`/`MAP_H` at construction time. Add a `rebuild()` method.
  - **src/render2d.ts:** `buildMapCanvas(world = getWorld())` takes the world explicitly.

  Both still draw billboards and the same tiles as before.
- [X] T009 [P] Write tests/unit/default-layout.test.ts:
  - Compiling `defaultLayout()` gives a grid whose every row equals `LEGACY_ROWS`, character for character.
  - It gives 12 desks in 3 pods of 4.
  - Each desk id is `desk-<x>-<y>`, and its seat is the same chair as before.
  - Areas and the spawn match the old values.
- [X] T010 [P] Write tests/unit/world-compile.test.ts using the fixtures:
  - A rotated 3×1 desk covers 1×3 tiles.
  - A non-blocking chair shows as `h`.
  - A blocking object wins over a chair on the same tile.
  - Desks are found only inside pods, and only with a chair on the long side.
  - Moving a desk with its chair keeps the same desk id.
  - A desk with no chair isn't a desk.
  - `setWorld` updates `MAP_W`, `DESKS` and `areaAt` for importers.
- [X] T011 Update the existing tests for the new desk ids, without changing what they check:
  - tests/unit/desks.test.ts
  - tests/unit/desks-layout.test.ts
  - tests/unit/office-desks.test.ts
  - tests/unit/proximity.test.ts
  - tests/integration/ws-desk-privacy.test.ts
  - tests/integration/ws-desk-reset.test.ts
  - tests/integration/ws-robustness.test.ts

  Every `pod-N:sx,sy` becomes the matching `desk-<x>-<y>` from T005: for example, the seat (6,12) belongs to `desk-5-13`. Then run `npm test`; all 176 existing tests must pass.
- [X] T012 Upgrade server/store.ts to office-state v3, following contracts/office-state-v3.md:
  - **The shape:** `version: 3`; `deskClaims` keyed by desk object id; `deskNotice: {memberId, kind:'reset'|'removed'}[]` "at most 500"; `buildingEnabled` (default `true`).
  - **From v1:** release every claim and add `reset` notices, as today.
  - **From v2:** re-key each `pod-N:sx,sy` claim to the desk whose seat is `(sx,sy)` in the current world. A claim with no match gets a `removed` notice. `deskResetNotice` entries become `reset` notices.
  - **On load:** v3 claims for desks that no longer exist are released and their holders get a notice.
  - `loadState` saves the upgraded file at once for both v1 and v2.

  Update server/office.ts for `deskNotice`, so `takeDeskNotice(memberId)` returns the notice kind or null, and update the join path in server/app.ts to send `deskReset` or `deskRemoved` to match.
- [X] T013 [P] Extend tests/unit/store.test.ts:
  - A v2 file with claims on all 12 old desk ids re-keys to 12 v3 claims with the same holders (SC-007).
  - A v2 claim on an unknown id becomes a `removed` notice.
  - `buildingEnabled` defaults to true.
  - A v1 file still resets.
  - A file with an unknown version starts empty.
- [X] T014 Create server/layout-store.ts:
  - `loadLayout(dir)`: reads data/layout.json `{format:1, rev, current, history}`, keeping "at most 9" history entries. If the file is missing, it writes `defaultLayout()` as rev 1 by `{memberId:'system', name:'Shyft'}`. If the file is broken, it renames it to `layout.json.broken-<time>`, logs a warning and uses the default.
  - Every stored layout goes through `parseLayout`.
  - `publish(layout, by) → rev`.
  - `revision(rev)` and `history()`.
  - `getDraft(memberId)`, `saveDraft(memberId, baseRev, layout)` and `deleteDraft(memberId)`, stored in data/drafts/<memberId>.json.
  - `pruneDrafts(now)`, which removes drafts whose `savedAt` is more than 30 days old. Run it at start and every 24 h.
  - Every write uses write-then-rename, like `StateStore.flush`.
- [X] T015 [P] Write tests/unit/layout-store.test.ts:
  - A fresh dir becomes rev 1.
  - Publishing 12 times keeps the current revision plus 9 history entries.
  - A broken file is renamed and the default is used.
  - Draft save, load and delete work.
  - Pruning removes only drafts more than 30 days old.
- [X] T016 In server/app.ts, at start, call `loadLayout(dataDir)`, then `setWorld(compileWorld(current.layout, catalog))`, before `loadState` and `validateOffice`. So state migration (T012) sees the right desks. Run `npm test` and `npm run build`. The office must look and behave as before.

**Checkpoint**: the layout is data, saved claims carry over, and nothing is visibly different. Run quickstart Q0.

---

## Phase 3: User Story 1 - Rearrange the office in a builder (Priority: P1) 🎯 MVP

**Goal**: a member edits a private draft (floors, walls and furniture), undoes changes, and publishes. Everyone sees the result live, and it survives a restart. Guests can't build, and admins can switch building off.

**Independent Test**: quickstart Q1, Q3 and Q4.

### Tests for User Story 1 (write first, and see them fail)

- [X] T017 [P] [US1] Write tests/unit/layout-check.test.ts, with one case per research R6 code:
  - `spawn-blocked`, `spawn-outside`, `unreachable` (a walled-off room, and a desk whose chair is unreachable), `room-overlap`, `pod-overlap`, `pod-in-private-room`, `object-outside`, `object-overlap` (two blocking objects, and blocking on a wall), `bad-name` and `too-many-objects`.
  - The default layout gives zero problems.
  - A 100×100 layout is checked in under 5 ms.
- [X] T018 [P] [US1] Write tests/unit/layout-merge.test.ts:
  - Disjoint floor edits merge.
  - The same edit on both sides isn't a clash.
  - The same object moved two ways is one clash, `obj:<id>`.
  - `resolve` set to `mine` or `theirs` applies the chosen side.
  - An object deleted on one side and moved on the other is a clash.
  - Rooms, pods, the spawn and the size are merged as units.
  - A null base turns every differing unit into a clash.
- [X] T019 [P] [US1] Write tests/integration/api-auth.test.ts:
  - No `X-Shyft-Session` gives 401.
  - A guest's `PUT /api/draft` and `POST /api/publish` give 403 `not-builder`.
  - A member is allowed.
  - After an admin sends `{t:'admin', op:'building', enabled:false}`: the member gets 403 `building-off`, the admin is still allowed, and everyone gets `{t:'building', enabled:false}`.
  - `GET /api/draft` returns only the caller's draft.
  - A body over 1 MB gives 413.
  - Two publishes within 2 s give 429.
- [X] T020 [P] [US1] Write tests/integration/publish-effects.test.ts:
  - Client A publishes a layout with a new wall line. Client B gets `{t:'layout', rev:2, by:{name:'A'}}`, and `GET /api/layout?rev=2` returns it.
  - B's server-side collision blocks the wall.
  - B standing on a tile that becomes blocking gets `teleport {reason:'layout'}` to a non-blocking tile.
  - A layout with a blocked spawn gives 422 `problems`.
  - Restarting the server with the same `dataDir` serves rev 2.
- [X] T021 [P] [US1] Write tests/integration/publish-merge.test.ts:
  - A and B both draft from rev 1. A publishes a floor change. B's publish of an unrelated object move gives 200, and the result has both changes.
  - A and B move the same object differently. B gets 409 `clash` with that `obj:<id>` key and `currentRev`.

### Implementation for User Story 1

- [X] T022 [US1] Create shared/layout-check.ts with `checkLayout(layout, catalog) → Problem[]`, where `Problem = {code, message, tiles:[x,y][]}`, for the codes in T017:
  - Reachability is a breadth-first walk over non-blocking tiles of the compiled grid, from the spawn.
  - The messages are plain sentences, such as "The spawn point can't be reached".
- [X] T023 [US1] Create shared/layout-merge.ts with `mergeLayouts(base, theirs, mine, resolve?) → {merged, clashes}`, over the units in data-model.md § Merge:
  - `floor:x,y`, `wall:x,y`, `obj:<id>`, `room:<id>`, `pod:<id>`, `spawn` and `size`.
  - Each clash lists the tiles to highlight.
- [X] T024 [US1] Extend shared/protocol.ts, following contracts/protocol-delta.md:
  - `welcome` gets `session`, `layoutRev` and `canBuild`.
  - New messages: `{t:'layout', rev, by:{name}, at}` and `{t:'building', enabled, canBuild}`.
  - `AdminOp` gets `{op:'building', enabled}`.
  - `teleport.reason` gets `'layout'`.
  - `NotifyKind` gets `'deskRemoved'`.
- [X] T025 [US1] In server/app.ts:
  - Give each connection a session token (`crypto.randomBytes(16).toString('hex')`), keep a `sessions` map from token to `Conn`, and drop it on close.
  - Send `session`, `layoutRev` and `canBuild` in `welcome`. `canBuild` is: not a guest, and (`buildingEnabled` or admin).
  - Handle `admin op 'building'`: admins only, save it through office state, then broadcast `building` to every connection with that connection's own `canBuild`.
- [X] T026 [US1] Create server/api.ts, a function `handleApi(req, res, ctx)` that server/app.ts mounts for `/api/*`. It implements contracts/http-api.md:
  - The routes: `GET /api/layout[?rev]`, `GET /api/layout/history`, `GET/PUT/DELETE /api/draft` and `POST /api/publish`.
  - Session lookup, and the guest, `not-builder` and `building-off` checks.
  - Body limit of 1 MB (413), `parseLayout` (400 `bad-layout`), and the rate limits: draft saves once per 500 ms, publishes once per 2 s (429).
  - **Publish:** if `baseRev` is current, run `checkLayout` (422 on problems). Otherwise merge with the base from `revision(baseRev)`, or null; return 409 on clashes, and otherwise check the merged layout. Then hand off to the publish pipeline (T027).
- [X] T027 [US1] Implement the publish pipeline in server/app.ts, `applyPublish(layout, by)`, following research R10:
  1. `layoutStore.publish`, then `setWorld(compileWorld(...))`.
  2. `office.reconcile()` (a stub here that returns no changes; filled in US2).
  3. For each connection on a blocking tile, call `nearestFreeTile` and send `teleport {reason:'layout'}`.
  4. Broadcast `{t:'layout', rev, by:{name}, at}` and the office snapshot.
  5. Delete the publisher's draft.

  Add `nearestFreeTile(x, y)` to shared/map.ts: it tries `nearestFreeTileNear` first, then a whole-map breadth-first search that keeps to the same private area, then the spawn.
- [X] T028 [P] [US1] Create src/world-client.ts:
  - `loadLayout(rev)` fetches `/api/layout?rev=` with the `X-Shyft-Session` header, then calls `setWorld(compileWorld(...))`.
  - `onWorldChange` listeners rebuild the 2D map canvas (`buildMapCanvas`) and call `Raycaster.rebuild()`.
  - Export `api(path, init)`, a fetch wrapper that adds the session header and parses JSON errors.
- [X] T029 [P] [US1] Create src/builder/history.ts, an undo stack of up to 100 `Layout` snapshots (`push`, `undo`, `redo`, `canUndo`, `canRedo`, `clear`). A new push clears the redo list. Test it in tests/unit/builder-history.test.ts with 120 pushes (keeps 100), undo, then redo.
- [X] T030 [US1] Create src/builder/tools.ts as pure edit functions on `Layout`, each returning a new layout or `{error}`:
  - `paintFloor(l, tiles, code)` and `paintWall(l, tiles, code)`.
  - `erase(l, tiles)`, which removes the wall, then any object on the tile.
  - `placeObject(l, kind, x, y, rot)`, with a fresh id `<kind>-<random6>`.
  - `moveObject(l, id, x, y)`, `rotateObject(l, id)` and `deleteObject(l, id)`.
  - `setSpawn(l, x, y)` and `resize(l, w, h)`, clamped to "10–100 each".

  `rotateObject` refuses a turn whose new footprint would leave the grid, or overlap a wall or another blocking object, with the message "Not enough room to turn this here." `resize` reports objects, rooms or pods it would cut through, so the panel can warn.

  Test it in tests/unit/builder-tools.test.ts.
- [X] T031 [US1] Create src/builder/panel.ts and add its styles to src/style.css, using the existing tokens:
  - The panel docks on the right.
  - **Tabs:** Floors, Walls and Furniture. Each tab shows swatches drawn with the existing 2D painters.
  - **Tool bar:** select, paint, erase and spawn.
  - **Controls:** undo and redo, a grid-size field, the problem list (click a problem to centre the map on its tiles), a History list (`GET /api/layout/history`, with a "Restore into draft" button), Discard, and Publish. Publish is disabled while there are problems.
- [X] T032 [US1] Create src/builder/builder.ts, the build mode controller:
  - **Entering:** `B` or the toolbar button, only when `canBuild`. It loads `GET /api/draft`, or starts a draft from the current world's layout.
  - **While building:** movement keys are paused. Mouse input maps to tools: drag to paint or erase, click to select, drag to move, `R` to turn, `Delete` to remove. `Ctrl/Cmd+Z` and `Shift+Ctrl/Cmd+Z` undo and redo.
  - **Each edit** runs `checkLayout` and saves the draft with `PUT /api/draft`, debounced to 1 s.
  - **Publish:**
    - On 409, fetch the base and current revisions, mark the clash tiles amber, and offer "Keep mine" or "Keep theirs" per clash. Then call `mergeLayouts(base, current, draft, resolve)`, save the result as the draft with `baseRev = currentRev`, and publish again.
    - On 422, show the problems.
  - **Restore** replaces the draft with the chosen revision's layout.
  - **Leaving:** `Esc` or the button. Receiving `building {canBuild:false}` also exits, with the notice "An admin turned building off. Your draft is saved."
- [X] T033 [US1] Extend src/render2d.ts for build mode:
  - Draw the **draft** world (compile the draft to its own `World` and pass it to `buildMapCanvas`; never `setWorld` the draft).
  - On top, draw:
    - a faint tile grid;
    - the selected object outlined;
    - a ghost of the item about to be placed (red if it can't go there);
    - problem tiles outlined red, and clash tiles filled amber.
  - Players are still drawn at their published positions.
- [X] T034 [US1] Wire it into src/main.ts and src/office-ui.ts:
  - Pass the session token to world-client.
  - On `welcome`, call `loadLayout(layoutRev)` before the first draw.
  - On `layout`, call `loadLayout(rev)` and show the notice "<name> updated the office".
  - On `building`, update `canBuild` and the toolbar button.
  - Treat `teleport` with reason `layout` like the existing teleport.
  - Add a **Building** on/off switch to the admin panel that sends `{t:'admin', op:'building', enabled}`.
  - While in build mode, `V` says to publish first (a first-person preview of the draft comes with the renderer rework in US3).
- [X] T035 [US1] Run quickstart Q1, Q3 and Q4 in real browsers, and record the results in specs/003-office-builder/checklists/validation.md.

**Checkpoint**: US1 works on its own. The MVP is ready to demo.

---

## Phase 4: User Story 2 - Set up meeting rooms and desk pods (Priority: P1)

**Goal**: rooms and pods can be painted and named, and ready-made rooms dropped in. Desk claims follow moved desks and are released (with a notice) when a desk is removed. Shrinking a room removes outsiders from its meeting.

**Independent Test**: quickstart Q2.

### Tests for User Story 2 (write first, and see them fail)

- [X] T036 [P] [US2] Write tests/unit/office-reconcile.test.ts against `OfficeState.reconcile()`:
  - A claimed desk moved with its chair keeps its claim.
  - A desk moved into another pod keeps its claim and reports the new `podId`.
  - A desk that is deleted, loses its chair, or ends up outside every pod has its claim, lock and guests released, and the holder is returned in `released`.
  - Allow-lists and admissions for a deleted room are dropped.
  - Pod-mode overrides for a deleted pod are dropped.
- [X] T037 [P] [US2] Write tests/integration/publish-privacy.test.ts (Constitution III):
  - A and B are in a conversation inside `meet-a`.
  - A third member publishes a layout where `meet-a`'s rects no longer cover B's tile.
  - Within 1 s, B's `links` no longer include A with context `area:meet-a`.
  - A's room chat no longer reaches B, and B's `rtc` to A is no longer relayed as a room link.
  - C, outside the room the whole time, never gets anything from the room.
- [X] T038 [P] [US2] Write tests/integration/publish-desks.test.ts:
  - B claims `desk-5-13`, then A publishes a layout that moves that desk and its chair 3 tiles. B still owns `desk-5-13`, and `walkToDesk` teleports B next to the new spot.
  - A publishes a layout without it. Online B gets `notify {kind:'deskRemoved'}`.
  - Offline C's claim, released the same way, is notified once on C's next join and not on the join after.

### Implementation for User Story 2

- [X] T039 [P] [US2] Add prefabs to shared/catalog.ts, following research R5:
  - `pod-4`: 7×6 tiles. Two rows of 2 desks (3×1) facing each other, 4 chairs on the outer sides, and a pod marking covering the whole 7×6.
  - `meeting-6`: 8×7 tiles. A wall ring with a 1-tile doorway in the bottom wall, carpet inside, a 2×2 table, 6 chairs round it, a plant, and a private room marking over the inside.

  Each prefab entry is `{id, name, size:[w,h], floor?, walls?, objects:[{kind,dx,dy,rot}], room?, pod?}`. Test in tests/unit/catalog-prefab.test.ts that placing each prefab into `emptyLayout(30,20)` gives zero `checkLayout` problems.
- [X] T040 [US2] Add room and pod tools to src/builder/tools.ts:
  - `paintRoom(l, roomId|null, tiles)` and `erasePaint(l, 'room'|'pod', tiles)`. They keep rects stored as row runs, merging runs that touch, and refuse tiles already in another room, or another pod, with a message.
  - `newRoom(l, name)` and `newPod(l, name)` create fresh ids.
  - `updateRoom(l, id, {name, private, capacity, restricted})`, with "name 1–25 characters" and "capacity 1–50".
  - `updatePod(l, id, {name, mode})`.
  - `placePrefab(l, prefabId, x, y)` adds everything with fresh ids and a fresh room or pod id.

  Extend tests/unit/builder-tools.test.ts to cover these.
- [X] T041 [US2] Add a **Rooms & pods** tab to src/builder/panel.ts:
  - The prefab buttons Meeting room (6) and Desk pod (4).
  - "New meeting room", "New area" (not private) and "New pod".
  - A properties editor for the selected room (name, private, capacity, restricted) or pod (name, ambient/cubicle).
  - Paint and erase tools for the selected room or pod.

  In src/render2d.ts, tint rooms and pods in build mode, with their names written on them.
- [X] T042 [US2] Implement `OfficeState.reconcile()` in server/office.ts, returning `{released: {memberId, deskId}[]}`:
  - Release claims, locks and guests for desks no longer in `DESKS`.
  - Drop `allowedOverride` and `admitted` entries for rooms no longer in `AREAS`.
  - Drop `podModeOverride` for missing pods.
  - Call `onChange`.

  In server/app.ts `applyPublish`:
  - For each released claim, send `notify {kind:'deskRemoved', deskId, text:'Your desk was removed in the latest office update.'}` to the holder's live connections.
  - If the holder has none, add a `{memberId, kind:'removed'}` entry to `deskNotice`.
- [X] T043 [US2] Update src/office-ui.ts:
  - Read `AREAS`, `DESK_PODS` and `deskById` at use time. Rebuild the desk card, pod labels and room list when the world changes.
  - Show the `deskRemoved` notice.
  - Make sure "Walk to my desk" (`G`) and the desk card use the desk's current tiles after a publish.
- [X] T044 [US2] Run quickstart Q2 in real browsers, and record the results in specs/003-office-builder/checklists/validation.md.

**Checkpoint**: US1 and US2 both work. The office can be fully rearranged.

---

## Phase 5: User Story 3 - Furniture has real depth in first person (Priority: P2)

**Goal**: built-in furniture is drawn as solid, depth-tested boxes that face the same way as in 2D. People are hidden correctly behind furniture. The frame rate stays at 50 fps or more.

**Independent Test**: quickstart Q5.

### Tests for User Story 3 (write first, and see them fail)

- [X] T045 [P] [US3] Write tests/unit/mesh3d.test.ts:
  - Rotating a 3×1 desk model by `rot 1` swaps its x and y extents, and keeps it within its footprint.
  - `worldQuads(world)` produces 6 faces per box.
  - `visibleFaces(quads, eye)` drops the faces pointing away from the eye.
  - `clipNear(polygon, near)` cuts a quad crossing the near plane into a polygon with every z ≥ near.
  - `project` matches the raycaster's projection, so a point 2 tiles ahead on the view axis lands on the centre column.

### Implementation for User Story 3

- [X] T046 [P] [US3] Fill in `model: Box[]` in shared/catalog.ts. A Box is `{x,y,z,w,d,h,mat}`, in tile units, unturned, facing south. The models:

  | Item | Boxes |
  |---|---|
  | `desk` (3×1) | top slab z 0.70–0.76; left and right side panels; a back modesty panel; a monitor (stand plus screen box, screen face `screen`) in the middle tile, toward the north edge; a keyboard slab |
  | `chair` | a seat z 0.40–0.48, a back on the north edge up to 0.95, a stem, and a base |
  | `table` | top slab z 0.70–0.76, and 4 legs |
  | `plant` | a pot 0.40 tall, and 3 stacked, offset leaf boxes up to 1.0 |
  | `sofa` | base z 0–0.40, a back on the north edge to 0.75, and 2 arms |

  The materials are `wood`, `woodDark`, `fabric`, `metal`, `screen`, `leaf`, `leafDark` and `pot`.
- [X] T047 [P] [US3] Add `makeMaterials()` to src/art.ts, which paints one 32×32 texture per material from `PALETTE` (wood grain, fabric weave, brushed metal, a lit screen with a highlight, leaf clusters, a terracotta pot). Remove `makeFurnitureSprites` and the `d`/`d:l`/`d:r` billboards once T049 has landed. This also closes 002's T043.
- [X] T048 [US3] Create src/mesh3d.ts with these functions:
  - `worldQuads(world, materials)`: once per world, turns every object's rotated boxes into world-space quads `{pts:[4×{x,y,z}], uv, tex, shade}`. The shade is top 1.0, south and north 0.85, east and west 0.72.
  - `visibleFaces`.
  - `clipNear`.
  - `project(pt, cam)`, which uses the same plane maths as `Raycaster.render`.
- [X] T049 [US3] Rework src/render3d.ts:
  - Replace `zbuf: Float32Array(w)` with a `depth: Float32Array(w*h)`, reset each frame.
  - Floor and ceiling pixels write `Infinity`. Wall pixels write their column's distance.
  - After the walls, cull `worldQuads` to within 20 tiles and in front of the camera. For each visible face, clip it, project it, then fill it scanline by scanline, with perspective-correct u/z, v/z and 1/z, a per-pixel depth test and write, fog, and the face shade.
  - Then draw people as billboards with a per-pixel depth test at their `tY`.
  - Marker labels test depth at their anchor pixel.
  - Rebuild the quads in `rebuild()`.
- [X] T050 [US3] Make the 2D furniture painters in src/art.ts and src/render2d.ts respect `rot` for `desk` (monitor side), `chair` and `sofa`, so both views agree (FR-018). This needs the per-tile object facing from `getWorld().objects`.
- [X] T051 [US3] Run quickstart Q5:
  - Circle each piece, and check occlusion and facing after a turn.
  - Measure the fps with the default office plus 60 placed pieces, at DPR 1 and 2.
  - If it's under 50 fps, apply the research R7 fallback (`RENDER_H` 300, then the 40 nearest objects) and measure again.

  Record the results and screenshots in specs/003-office-builder/checklists/validation.md and screenshots/.

**Checkpoint**: the first-person furniture is solid, and US1 and US2 are unaffected.

---

## Phase 6: User Story 4 - Add custom furniture and object art (Priority: P3)

**Goal**: builders upload validated object sheets. They appear in the catalog, can be placed, animate in 2D, and are folded boxes in first person.

**Independent Test**: quickstart Q6.

### Tests for User Story 4 (write first, and see them fail)

- [X] T052 [P] [US4] Write tests/unit/objects-sheet.test.ts against `validateObjectSheet(rgba, w, h, bytes, meta)`:
  - A valid 1×1, height 64, 2-frame sheet (64×160) gives OK, with 4 decoded views.
  - With `back:true` it's 64×224.
  - Each code is produced: `too-large` (over 512 KB), `bad-meta`, `bad-format`, `bad-name`, `bad-footprint`, `bad-height` (60, and 104), `bad-frames`, `bad-size:64x160`, and `empty-view:1,0`.
  - A fully transparent top view is allowed.
- [X] T053 [P] [US4] Write tests/integration/objects-upload.test.ts:
  - A member's `POST /api/objects` with a valid sheet gives 201, everyone gets `{t:'objects'}`, and `GET /objects/<id>.png?v=…` serves the bytes.
  - A bad sheet gives 400 with its codes, and no `objects` message is sent.
  - A guest gets 403.
  - The 101st object gives 409 `too-many`.
  - The 11th upload in a minute gives 429.
  - `DELETE` without `confirm` reports `{placed:n}`. With `confirm=1`, it publishes a revision without the copies and removes the object.

### Implementation for User Story 4

- [X] T054 [P] [US4] Create shared/objects.ts with `OBJECT_FORMAT = 1`, `MAX_OBJECT_BYTES = 512*1024`, `MAX_OBJECTS = 100`, `validateObjectMeta(json)` and `validateObjectSheet(...)`. They follow contracts/object-sheet.md exactly:
  - name "1–32 characters";
  - footprint "1–4 each";
  - height "8–96, a multiple of 8";
  - frames "1–8";
  - fps "1–12";
  - the expected size `frames × 32·max(w,d)` by `32·d + height × (back ? 3 : 2)`;
  - a check for empty view cells.

  `validateObjectSheet` returns the cut-out views per frame as offsets.
- [X] T055 [P] [US4] Create the command-line tools:
  - tools/object-template.ts: `--w`, `--d`, `--height`, `--frames`, `--back` and `--out`. It writes a guide PNG (a tinted band per view, frame borders, and a floor line on the front and side) plus a matching `.json`.
  - tools/object-check.ts: prints `OK` or the codes for each file, and exits non-zero on any failure.
- [X] T056 [US4] Create server/objects.ts:
  - **On start:** load data/objects/*.png with its `.json`, validate it, and skip bad files with a logged code.
  - `add(png, meta, author)`: creates a unique id (a slug of the name plus a suffix), stores both files with write-then-rename, and enforces `MAX_OBJECTS`.
  - `remove(id)`.
  - Serve `/objects/<id>.png?v=<sha1 8>` with a long cache.

  Add `POST /api/objects` (512 KB limit, 10 per minute per member) and `DELETE /api/objects/:id[?confirm=1]` to server/api.ts. Send `objects` in `welcome` and broadcast `{t:'objects'}` on change. Add `objects` to shared/protocol.ts.
- [X] T057 [US4] Support `custom:<id>` kinds:
  - **shared/catalog.ts** builds catalog items from the custom objects: `tile 'x'`, footprint, `blocks`, and a single box of footprint × height/32 using the view textures.
  - **compileWorld** treats `x` as blocking only when the item blocks. `isBlocking` checks this per tile, so add a blocking set to the compiled world.
  - **parseLayout** on the server accepts only custom ids that exist.
- [X] T058 [US4] Add a **Custom** tab to src/builder/panel.ts:
  - The list of custom objects, showing each one's top view.
  - An Upload form: a file, plus name, footprint, height, blocks, frames, fps and back. It previews the result of client-side `validateObjectSheet` before sending.
  - Delete, which first shows "Remove N placed copies?" using the `DELETE` count.
- [X] T059 [US4] Draw custom objects in src/render2d.ts. They aren't drawn into the static map canvas. Each frame they are drawn from their top view, at frame `floor(now·fps/1000) % frames`, and rotated by `rot`.
- [X] T060 [US4] Draw custom objects as folded boxes in src/mesh3d.ts and src/render3d.ts:
  - top face: the top view;
  - south face: the front view;
  - east face: the side view;
  - west face: the side view mirrored;
  - north face: the back view, or the front view if there is no back.

  The textures come from the sheet's current animation frame, and the whole box is rotated by `rot`.
- [X] T061 [US4] Run quickstart Q6, and record the results in specs/003-office-builder/checklists/validation.md.

**Checkpoint**: all four stories work.

---

## Phase 7: Polish & Cross-Cutting

- [X] T062 [P] Write objects/FORMAT.md (the user-facing copy of contracts/object-sheet.md) and a template example made with `npm run objects:template`. Add a "Building the office" section to README.md covering: build mode, publish, history, the admin switch, and custom objects.
- [X] T063 [P] Check the security limits by hand against contracts/http-api.md:
  - an oversized draft;
  - a malformed layout with 3 000 objects;
  - a room name of 200 characters;
  - a non-PNG upload.

  Each must be refused with its documented code, and the server must keep running. Add any case that isn't already covered to tests/integration/api-auth.test.ts.
- [X] T064 Final gate. All of these must pass:
  - `npm run typecheck`
  - `npm test`
  - `npm run build`
  - `npm run objects:check` on the template example
  - quickstart Q0–Q6, with each outcome recorded in specs/003-office-builder/checklists/validation.md

---

## Dependencies & Execution Order

### Phases

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: needs Setup. **It blocks every story.** T016 ends with the full suite passing.
- **US1 (Phase 3)**: needs Foundational. It is the MVP.
- **US2 (Phase 4)**: needs US1's publish pipeline (T026, T027) and builder (T030–T033).
- **US3 (Phase 5)**: needs only Foundational. It can run in parallel with US1 and US2, since it touches `render3d`, `mesh3d`, `art` and the catalog models. T050 needs facing data, which comes from the catalog (T004).
- **US4 (Phase 6)**: needs US1 (the API, session and builder panel). Its 3D part (T060) needs US3 (T048, T049).
- **Polish (Phase 7)**: needs every story.

### Within each story

The tests come first and must fail. Then the shared pure modules, then the server, then the client, then the quickstart run.

### Parallel opportunities

- **Phase 2:** T004 can run alongside T003. T009, T010, T013 and T015 can run as soon as their target modules exist.
- **US1:** the tests T017–T021 in parallel, and then T028 and T029 alongside the server work (T025–T027).
- **US2:** the tests T036–T038 in parallel, and T039 alongside them.
- **US3:** T045, T046 and T047 in parallel. The whole of US3 can run alongside US1 and US2.
- **US4:** T052, T053, T054 and T055 in parallel.

## Parallel Example: User Story 1

```text
Together:  T017 layout-check tests | T018 merge tests | T019 api-auth | T020 publish-effects | T021 publish-merge
Then:      T022 checkLayout | T023 mergeLayouts | T024 protocol
Then:      T025 sessions → T026 api → T027 publish pipeline   ‖   T028 world-client | T029 history
Then:      T030 tools → T031 panel → T032 builder → T033 overlays → T034 wiring → T035 quickstart
```

## Implementation Strategy

1. **MVP:** Phases 1–3. Members rearrange floors, walls and furniture, publish live, and can restore history, and admins can switch building off. Stop and check with Q0, Q1, Q3 and Q4.
2. **Then US2:** rooms, pods, prefabs, claims that follow their desks, and the privacy test.
3. **Then US3:** solid furniture. It can be built alongside 1 and 2 by a second person.
4. **Then US4:** custom objects.
5. **Polish:** the docs and the final gate.

Each checkpoint leaves `npm test` green and the office usable, so the work can be committed phase by phase.
