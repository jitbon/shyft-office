# Data Model: Furniture Studio and Ready-Made Catalog

All types live in `shared/` so the server, both views, the studio and the checker share one definition (Constitution II). Formats are in [contracts/](contracts/).

## Item definition (shared/items.ts)

What a ready-made item, a studio item and a helper draft all are. See [contracts/item-format.md](contracts/item-format.md).

| Field | Type | Rules |
|---|---|---|
| `format` | `1` | Optional when written, always present when stored. |
| `name` | string | 1–32 characters. |
| `group` | `desks \| chairs \| computers \| shelves \| decorations \| walldecor \| floorart \| odds \| seasonal` | Shown as: Desks, Chairs, Computers & desk items, Shelves & storage, Decorations, Wall decor, Floor art, Odds & ends, Seasonal. |
| `season` | `winter \| spring \| summer \| autumn` or absent | Required when `group` is `seasonal`; allowed on any item. |
| `kind` | `floor \| deskitem \| wall \| floorart` | Where it goes (FR-007). |
| `footprint` | `[w, d]` | `floor`, `floorart`: whole tiles, 1–4 each. `deskitem`: each of 0.25, 0.5, 0.75 or 1. `wall`: width 0.25–1 in steps of 0.25, depth 0.25 at most. |
| `blocks` | boolean | Only for `floor`; the others never block. Default `true` for `floor`. |
| `hang` | number | `wall` only: height of the item's bottom above the floor, 0–0.8, in steps of 0.05. Default 0.35. |
| `parts` | `Part[]` | 1–24 for ready-made and studio items. |

### Part

| Field | Type | Rules |
|---|---|---|
| `x`, `y` | number | Position of the part's corner in the item's frame, in tiles, in steps of 0.05; `0 ≤ x`, `x + w ≤ footprint width`, same for `y` and depth. The item's front faces south (`y` grows toward the front). |
| `z` | number | Height of the part's bottom above the item's base, in steps of 0.05, at least 0. |
| `w`, `d`, `h` | number | Size in steps of 0.05, at least 0.05. |
| `pattern` | `plain \| wood \| fabric \| metal \| leaf \| glass \| screen \| paper \| stone` | |
| `color` | `#rrggbb` | |

Limits on the whole item: `z + h ≤ 1` for every part (a wall is 1 tall); `deskitem` items `z + h ≤ 0.6`; `floorart` parts `h ≤ 0.05` (flat).

## Catalog entry (shared/catalog.ts, derived)

An item definition plus what the renderers and tools need, built by `catalogFromDefinition(def, source)`.

| Field | Source |
|---|---|
| `id` | `item:<id>` for ready-made and studio items; `desk`, `chair`, … for the six built-ins; `custom:<id>` for sheet objects |
| `name`, `group`, `season`, `kind`, `footprint`, `blocks`, `hang` | the definition (the built-ins and sheet objects are given fixed values: sheet objects are `kind floor`, group `odds`) |
| `by` | creator's name, `Shyft` for ready-made |
| `version` | whole number, 1 for ready-made |
| `model` | `Box[]` made from the parts (`partsToBoxes`) |
| `surface` | where desk items stand, for every item that can host them: the two built-in desks (0.31) and every item in group `desks` (the highest `z + h` of its parts, i.e. its top). Absent for everything else. |
| `picture(rot)` | the derived top-down picture (`renderItemTop`), cached per version and turn; the six built-ins and sheet objects keep their own painters |

## Placed object (shared/layout.ts, extended)

`{id, kind, x, y, rot}` as before, plus optional fields. Existing layouts need no change. See [contracts/layout-delta.md](contracts/layout-delta.md).

| Field | Type | Used by | Rules |
|---|---|---|---|
| `v` | integer | all | Pins the copy to version `v` of its item (see Versions). Absent means the newest. |
| `on` | string | `deskitem` | Id of the host desk object. |
| `at` | `[x, y]` | `deskitem` | Where on the host, in the host's own frame (unturned), in steps of 0.05. Inside the host footprint. |
| `wall` | `n \| e \| s \| w` | `wall` | Which face of the wall tile `(x, y)` it hangs on. That face must border non-wall floor. |

`rot` for a desk item is relative to its host. Limits: 6 desk items per host tile, 2 wall decor items per wall face.

## Layout rules added to `normalizeLayout`

| Rule | Effect |
|---|---|
| A desk item's host is missing, or has no `surface` (it is not a desk) | The item is removed. |
| A desk item lies outside its host's footprint | It is moved to the nearest spot inside. |
| Wall decor's tile is not a wall, or its face no longer borders floor | The item is removed. |
| More than 6 items on a host tile, or more than 2 on a wall face | The newest are removed. |
| An object whose kind does not exist | Removed (as for deleted custom objects today). |

`checkLayout` reports the same cases as problems when the builder asks, with the tiles to outline (`item-orphan`, `item-limit`).

## Compiled world (shared/world.ts, extended)

| Part | Derived from |
|---|---|
| `grid`, `block`, areas, pods, desks | `floor` objects only, exactly as before |
| `deskItems` | every desk item with its world position (host origin plus turned `at`), height (`surface`) and facing |
| `wallDecor` | every wall decor item with its wall tile and face |
| `floorArt` | every floor art item in list order, with its footprint |
| `objects3d` | boxes for all of the above, for first person |
| Baked floor | per floor cell, the floor code and the art slice over it (for both views) |

## Studio draft (server/items.ts)

| Field | Type | Notes |
|---|---|---|
| `memberId` | string | One draft per member. |
| `itemId` | string or absent | The item being edited, if any. |
| `fromHelper` | boolean | Marks a draft that came from the helper. |
| `design` | ItemDefinition | May be incomplete: a draft is not validated for saving, only for size. |
| `savedAt` | epoch ms | Drafts are pruned 30 days after this. |

## Stored item (server/items.ts)

| Field | Type | Notes |
|---|---|---|
| `id` | string | `[a-z0-9-]{1,32}`, made unique by the server. |
| `def` | ItemDefinition | Validated. |
| `by` | `{memberId, name}` | The creator. Only they, or an admin, can change or delete it. |
| `version` | integer | Starts at 1, goes up by one with every change. |
| `at` | epoch ms | Last saved. |

The last 5 versions are kept on disk (`<id>@<n>.json`) while any placed copy is pinned to them; older ones are removed.

At most 500 studio items.

## Helper state (server/helper.ts)

| Field | Where | Notes |
|---|---|---|
| `helperEnabled` | `office-state.json`, optional, default `false` | The admin switch. The state file stays at version 3. |
| Service config | environment | `ITEM_AI_KEY`, `ITEM_AI_MODEL`, `ITEM_AI_URL`, `ITEM_AI_TIMEOUT_MS`. Never stored in a file or sent to a browser. |
| Status | computed | `off` (switched off), `unavailable` (no key, or the service last failed to answer), `on`. |

Requests and replies are not stored.
