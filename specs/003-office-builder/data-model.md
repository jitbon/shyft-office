# Data Model: Office Builder and 3D Furniture

All types live in `shared/` so the server, both renderers and the builder use the same definitions (Constitution II). The file formats are in [contracts/](contracts/).

## Layout (shared/layout.ts)

The published office, and also the content of a draft.

| Field | Type | Rules |
|---|---|---|
| `w`, `h` | integer | 10–100 each (FR-011) |
| `floor` | string, length `w×h` | One code per tile, row by row: `.` wood, `,` carpet, `;` library carpet, `_` kitchen tile |
| `walls` | string, length `w×h` | One code per tile: space for no wall, or `#` plain, `G` window, `W` whiteboard, `B` shelf, `K` counter |
| `objects` | `PlacedObject[]` | At most 2 000 |
| `rooms` | `Room[]` | At most 50 |
| `pods` | `Pod[]` | At most 30 |
| `spawn` | `{x, y}` | A tile inside the grid that is not blocking, and from which every room and desk can be reached |

### PlacedObject

| Field | Type | Rules |
|---|---|---|
| `id` | string | `[a-z0-9-]{1,40}`, unique in the layout. It never changes when the object is moved or turned. |
| `kind` | string | A built-in catalog id (`desk`, `chair`, `table`, `plant`, `sofa`), or `custom:<objectId>` |
| `x`, `y` | integer | The top-left tile of the footprint after turning. The whole footprint is inside the grid. |
| `rot` | `0 \| 1 \| 2 \| 3` | Quarter turns clockwise. 0 faces down (south), as in today's art. |

The rotated footprint of a `w×d` item is `w×d` for `rot` 0 or 2, and `d×w` for 1 or 3.

### Room

| Field | Type | Rules |
|---|---|---|
| `id` | string | `[a-z0-9-]{1,40}`. Today's ids (`meet-a`, `meet-b`, `kitchen`, `library`, `lobby`, `open`) are kept. |
| `name` | string | 1–25 characters |
| `private` | boolean | A meeting room (FR-008) |
| `rects` | `[x0,y0,x1,y1][]` | Inclusive tile rectangles. The builder paints tiles, which are stored as row runs. Room tiles don't overlap other rooms. |
| `capacity` | integer? | 1–50 |
| `restricted` | boolean | |
| `allowed` | string[] | Default allow-list (member ids). Admin overrides stay in office state. |

This is the same shape as today's `Area`, so `areaAt`, privacy and knocking are unchanged.

### Pod

| Field | Type | Rules |
|---|---|---|
| `id` | string | `[a-z0-9-]{1,40}`. Today's `pod-1`…`pod-3` are kept. |
| `name` | string | 1–25 characters |
| `rects` | `Rect[]` | As for rooms. Pods don't overlap each other or a private room. |
| `mode` | `ambient \| cubicle` | The builder's default. An admin override in office state wins. |

## Catalog (shared/catalog.ts)

| Field | Type | Notes |
|---|---|---|
| `id` | string | `desk`, `chair`, `table`, `plant`, `sofa`, or `custom:<id>` |
| `name` | string | Shown in the catalog |
| `footprint` | `[w, d]` | `desk` is `[3,1]`; the others are `[1,1]`; custom objects are 1–4 each way |
| `blocks` | boolean | `chair` doesn't block; the others do |
| `tile` | char | The furniture code stamped into the compiled grid (`d` `h` `t` `p` `s`; custom objects are `x`, which blocks when `blocks` is set) |
| `model` | `Box[]` | First-person shape (R7) |
| `facing` | boolean | Whether turning changes how it looks |

**Box**: `{x, y, z, w, d, h, mat}` in tile units, in the item's unturned frame. `mat` is a material id, or per-face materials `{top, side, front}`.

**Prefab**: `{id, name, size:[w,h], floor?, walls?, objects:[{kind,dx,dy,rot}], room?: Partial<Room>, pod?: Partial<Pod>}`. Placing one copies everything at its offset, with fresh ids.

## Compiled world (shared/world.ts)

`compileWorld(layout, catalog) → World` is a pure function. The result is held as the current world by `setWorld()`, and `shared/map.ts` exposes it through live bindings (research R1).

| Part | Derived from |
|---|---|
| `grid` (char per tile) | The wall code if there is a wall; else the tile code of a blocking object on the tile; else the tile code of a non-blocking object; else the floor code. This is the same alphabet as today's `MAP_ROWS`, so `tileAt` and the painters work as before. |
| `AREAS` | `layout.rooms` |
| `DESK_PODS` | `layout.pods` |
| `DESKS` | Every `desk` object inside a pod with a `chair` touching its long side. `id` is the desk object id, `seat` is that chair (the lowest id if there are several), `podId` is the containing pod, and `tiles` are the seat, the desk footprint and the walkable ring, assigned as today. |
| `SPAWN` | The centre of `layout.spawn` |
| `objects3d` | World-space boxes for the first-person renderer, built once per world |

## Draft (server/layout-store.ts)

| Field | Type | Notes |
|---|---|---|
| `memberId` | string | The owner. One draft per member. |
| `baseRev` | integer | The published revision the draft started from |
| `layout` | Layout | |
| `savedAt` | epoch ms | Pruned 30 days after this |

The undo and redo stack exists only in the client, as up to 100 snapshots.

## Revision (server/layout-store.ts)

| Field | Type | Notes |
|---|---|---|
| `rev` | integer | Increases by 1 on every publish, starting at 1 for the migrated office |
| `layout` | Layout | |
| `by` | `{memberId, name}` | `{system, "Shyft"}` for revision 1 |
| `at` | epoch ms | |

The current revision and the 9 before it are kept.

## Merge (shared/layout-merge.ts)

`mergeLayouts(base, theirs, mine, resolve?) → { merged, clashes: Clash[] }`, a pure function.

| Unit | Key |
|---|---|
| Floor cell | `floor:x,y` |
| Wall cell | `wall:x,y` |
| Object | `obj:<id>`, covering kind, position and facing as a whole |
| Room | `room:<id>` |
| Pod | `pod:<id>` |
| Spawn | `spawn` |
| Grid size | `size` |

- A unit changed on one side only takes that change.
- A unit changed identically on both sides is fine.
- A unit changed differently on both sides is a clash `{key, tiles}`.
- If base is null (it has dropped out of history), every unit where `mine` differs from `theirs` is a clash.
- `resolve?: Record<key, 'mine' | 'theirs'>` picks a side for each clash. The client calls it with the builder's choices after a `409`, then saves the result as a new draft on top of the current revision and publishes it. The server calls it with no `resolve`, and publishes only when there are no clashes.

## Office state v3 (server/store.ts)

See [contracts/office-state-v3.md](contracts/office-state-v3.md).

| Field | v2 | v3 |
|---|---|---|
| `version` | 2 | 3 |
| `deskClaims` | keyed `pod-N:sx,sy` | Keyed by **desk object id**. On migration, each claim maps to the desk whose chair is at `(sx, sy)` in the migrated layout. |
| `podModes`, `areaAllowed` | | Unchanged. Entries for pods or rooms that no longer exist are dropped when a layout is published. |
| `deskResetNotice` | `memberId[]` | Renamed `deskNotice: {memberId, kind: 'reset' \| 'removed'}[]`, at most 500 |
| `buildingEnabled` | — | boolean, default `true` (FR-002a) |

### Desk claim lifecycle

```text
claimed ──(publish: desk moved, turned, or moved into another pod)──▶ claimed (same id, new pod)
claimed ──(publish: desk or chair deleted, or desk outside every pod)──▶ released
released ──holder online──▶ notify 'deskRemoved' now
released ──holder offline──▶ deskNotice entry ──(next join)──▶ notify 'deskRemoved', entry removed
```

## Custom object (server/objects.ts)

| Field | Type | Rules |
|---|---|---|
| `id` | string | `[a-z0-9-]{1,32}`, made unique by the server |
| `name` | string | 1–32 characters |
| `footprint` | `[w, d]` | 1–4 each |
| `height` | integer px | 8–96, a multiple of 8 (32 px is one tile tall) |
| `blocks` | boolean | |
| `frames`, `fps` | integer | 1–8 and 1–12 |
| `back` | boolean | Whether the sheet has a back row |
| `author` | `{memberId, name}` | |
| `url` | string | `/objects/<id>.png?v=<hash>` |

At most 100 per office. The sheet layout is in [contracts/object-sheet.md](contracts/object-sheet.md).
