# Contract: Layout Changes (placed objects)

The layout document (`specs/003-office-builder/data-model.md`) stays at `format: 1`. Placed objects gain optional fields. Layouts saved before this feature parse and behave exactly as before.

## PlacedObject

```ts
{ id: string; kind: string; x: number; y: number; rot: 0|1|2|3;
  v?: number;                         // pins this copy to version v of its item
  on?: string; at?: [number, number]; // desk items: host desk object id, and where on it
  wall?: 'n'|'e'|'s'|'w' }            // wall decor: which face of the wall tile (x, y)
```

| Kind of item | `x`, `y` | `rot` | Extra |
|---|---|---|---|
| floor | top-left tile of the footprint after turning | quarter turns, as before | none |
| floorart | the same | the same | none |
| deskitem | not used (`normalizeLayout` sets both to 0) | quarter turns **relative to the host** | `on` and `at` required |
| wall | the wall tile | not used | `wall` required |

`kind` is a catalog id: a built-in (`desk`), a sheet object (`custom:<id>`), or an item (`item:<id>`).

`parseLayout` accepts the new fields when they have the right shape for the item's kind and ignores them otherwise.
`at` has two numbers in steps of 0.05, inside the host's footprint (checked by `normalizeLayout`, which moves it in).
`wall` is one of four letters. `v` is a whole number from 1.

## normalizeLayout(layout, catalog) → layout

Pure. The builder runs it after every edit, the server before it checks a publish, and the merge on its result. In this order:

1. Remove objects of a kind that is not in the catalog.
2. Desk items: remove one whose `on` is not an object in the layout whose catalog entry has a `surface` (the original desks and every item in group `desks`), and move `at` inside the host's footprint. Set `x` and `y` to 0.
3. Wall decor: remove one whose tile has no wall, or whose face does not border a non-wall tile, or whose `wall` is missing.
4. Limits: for each host desk tile keep the first 6 items, and for each wall face the first 2; remove the rest.
5. Pins: drop a `v` that is not a version the item has (the copy shows the newest).

It reports what it removed, so the builder can say "2 desk items were removed with their desk".

## Problems added to `checkLayout`

| Code | Meaning | Tiles |
|---|---|---|
| `item-orphan` | a desk item or wall decor is attached to something that is gone | its tile |
| `item-limit` | too many items on one desk tile or wall face | that tile |

(After `normalizeLayout` neither remains, so publishing never fails on them; the codes exist for drafts loaded from older files.)

## Merge

`shared/layout-merge.ts` keeps the unit `obj:<id>` and now includes `v`, `on`, `at` and `wall` in its value, so two people changing the same item's place, host or pin clash, and different items merge. After merging, `normalizeLayout` runs, so a desk item whose host was deleted by the other person goes with it.

## Compile

- `floor` objects: stamped into the grid as now.
- `deskitem`, `wall`, `floorart`: **never** stamped and never block. The world exposes them as `deskItems`, `wallDecor` and `floorArt` (see the data model) for the renderers.
- Desk derivation, claims, locks and privacy read only floor objects, so they are unchanged.
