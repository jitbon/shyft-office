# Contract: Shyft Office Item Definition v1

A furniture or decoration item, assembled from simple parts. It is what the studio saves, what the AI helper drafts, what ships as the ready-made list, and what `npm run items:check` validates outside the app. Object sheets (`objects/FORMAT.md`) are a separate format and do not change.

## Document

```json
{
  "format": 1,
  "name": "Desk lamp",
  "group": "computers",
  "kind": "deskitem",
  "footprint": [0.5, 0.5],
  "parts": [
    { "x": 0.1,  "y": 0.1,  "z": 0,    "w": 0.3, "d": 0.3, "h": 0.05, "pattern": "metal",  "color": "#4b4f5a" },
    { "x": 0.2,  "y": 0.2,  "z": 0.05, "w": 0.1, "d": 0.1, "h": 0.2,  "pattern": "metal",  "color": "#4b4f5a" },
    { "x": 0.05, "y": 0.05, "z": 0.25, "w": 0.4, "d": 0.4, "h": 0.15, "pattern": "fabric", "color": "#f2cf62" }
  ]
}
```

| Field | Rules |
|---|---|
| `format` | Optional. If given it must be `1`. |
| `name` | 1–32 characters. |
| `group` | `desks`, `chairs`, `computers`, `shelves`, `decorations`, `walldecor`, `floorart`, `odds`, `seasonal`. |
| `season` | Optional: `winter`, `spring`, `summer`, `autumn`. Required when `group` is `seasonal`. |
| `kind` | `floor` (stands on the floor), `deskitem` (stands on a desk), `wall` (hangs on a wall), `floorart` (flat on the floor). |
| `footprint` | `[width, depth]` in tiles. `floor` and `floorart`: whole numbers 1–4. `deskitem`: each 0.25, 0.5, 0.75 or 1. `wall`: width 0.25, 0.5, 0.75 or 1, depth at most 0.25. |
| `blocks` | `floor` only. Default `true`. For any other kind it must be absent or `false`. |
| `hang` | `wall` only: how high its bottom hangs, 0 to 0.8 in steps of 0.05. Default 0.35. |
| `parts` | 1 to 24 parts. |

### Parts

Sizes are in tiles (a tile is the width of a floor square; a wall is 1 tall). All numbers are multiples of 0.05.

| Field | Rules |
|---|---|
| `x`, `y` | Corner of the part, from the item's back-left corner: `x` runs left to right, `y` from the back (north) to the front (south). The part must lie inside the footprint. |
| `z` | Height of the part's bottom above the item's base, 0 or more. |
| `w`, `d`, `h` | Size along `x`, `y` and up, at least 0.05. |
| `pattern` | `plain`, `wood`, `fabric`, `metal`, `leaf`, `glass`, `screen`, `paper`, `stone`. |
| `color` | `#` and six hexadecimal digits. |

Whole-item limits: every part has `z + h` of at most 1; for `deskitem` items at most 0.6; for `floorart`, `h` is at most 0.05 on every part.

The front of an item faces south when it is not turned. Turned in the office, it turns as a whole.

## Error codes

The same codes in the studio, the server and the checker. `<i>` is the part's position in the list, from 0.

| Code | Meaning |
|---|---|
| `bad-item` | not a JSON object |
| `bad-format` | `format` is not 1 |
| `bad-name` | empty or over 32 characters |
| `bad-group` | not one of the groups |
| `bad-season` | not a season, or missing for a seasonal item |
| `bad-kind` | not one of the kinds |
| `bad-footprint` | outside the rules for its kind |
| `bad-blocks` | `blocks` on an item that is not `floor` |
| `bad-hang` | `hang` on an item that is not `wall`, or out of range |
| `no-parts` | no parts |
| `too-many-parts` | over 24 parts |
| `bad-part:<i>` | a number is missing, not a multiple of 0.05, or too small |
| `part-outside:<i>` | the part sticks out of the footprint |
| `too-tall:<i>` | the part goes higher than its kind allows |
| `bad-color:<i>` | not `#rrggbb` |
| `bad-pattern:<i>` | not one of the patterns |

## Tools

```sh
npm run items:template -- --kind floor --footprint 2x1 --out shelf.json   # a starting design to edit
npm run items:check shelf.json [more.json…]                                 # OK, or the codes above
```

The template writes a valid one-part item of that kind. The checker prints `OK` or the codes per file and exits non-zero on any failure.
