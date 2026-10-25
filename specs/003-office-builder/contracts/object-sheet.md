# Contract: Shyft Office Object Sheet v1

This is the format for custom furniture and objects, drawn in any pixel-art tool (Aseprite, Piskel, LibreSprite, Photoshop, …) without plugins. It ships to users as `objects/FORMAT.md`, next to a template generator and a checker. Character sheets have their own format (`sprites/FORMAT.md`), which is unchanged.

## Metadata (sidecar `<id>.json`, or the `meta` of an upload)

```json
{ "format": 1, "name": "Vending machine", "footprint": [1, 1], "height": 64, "blocks": true, "frames": 2, "fps": 4, "back": false }
```

| Field | Rules |
|---|---|
| `format` | Optional. If given, it must be `1`. |
| `name` | 1–32 characters |
| `footprint` | `[w, d]`, the tiles it covers on the floor, 1–4 each |
| `height` | How tall it stands, in pixels: 8–96, a multiple of 8 (32 is one tile) |
| `blocks` | Whether people can walk through it. Default `true`. |
| `frames` | Animation frames, 1–8. Default 1. |
| `fps` | Animation speed, 1–12. Default 4. |
| `back` | Whether the sheet has a separate back view. Default `false`, in which case the back copies the front. |

## Image

PNG with an alpha channel, at most 512 KB. The image is a grid:
- **Columns** are animation frames, from left to right.
- **Rows** are views, from top to bottom, in this order:

| Row | View | Cell size (px) |
|---|---|---|
| 0 | **Top**: seen from above. The top-down office view shows this. | `32·w × 32·d` |
| 1 | **Front**: seen from the south, facing you when not turned | `32·w × height` |
| 2 | **Side**: seen from the east. The west side is this one mirrored. | `32·d × height` |
| 3 | **Back** (only when `back` is true): seen from the north | `32·w × height` |

- Every cell in the grid is `32·max(w,d)` wide.
- Each row is as tall as its view: `32·d` for the top row, `height` for the others. Cells narrower than the column are left-aligned, and the rest is transparent.
- So the whole image is `frames × 32·max(w,d)` wide, and `32·d + height × (back ? 3 : 2)` tall.
- Every view cell must contain at least one opaque pixel, except that the top view may be fully transparent for things with nothing to see from above.

In first person the object is a solid box of `w × d` tiles and `height` px tall:
- the top view is on its top face;
- the front view is on its south face;
- the side view is on its east face, and mirrored on its west face;
- the back view, or the front if there is none, is on its north face.

Turning the object in the builder turns the whole box. The animation plays in both views.

## Validation errors (exact codes reported by the CLI and server)

| Code | Meaning |
|---|---|
| `not-png` | The file is not a decodable PNG |
| `too-large` | The file is over 512 KB |
| `bad-meta` | The metadata is missing, or is not an object |
| `bad-format` | `format` is not 1 |
| `bad-name` | The name is empty or longer than 32 characters |
| `bad-footprint` | The footprint is not two whole numbers from 1 to 4 |
| `bad-height` | The height is not a multiple of 8 from 8 to 96 |
| `bad-frames` | `frames` or `fps` is out of range |
| `bad-size:<expected w>x<expected h>` | The image dimensions don't match the metadata |
| `empty-view:<row>,<col>` | That view cell has no opaque pixels |
| `bad-id` | The file stem breaks the id rules (for files placed in `data/objects/`) |
| `too-many` | The office already has 100 custom objects |

## Tooling

- `npm run objects:template -- --w 2 --d 1 --height 64 [--frames 2] [--back] [--out file.png]` writes a guide sheet and a matching `.json`. The guide shows a tinted band for each view, frame borders, and a floor line on the front and side views. Paint on a new layer and delete the guide layer before exporting.
- `npm run objects:check <file.png> [more.png…]` reads each sheet with its `.json` and prints `OK` or the error codes above. The exit code is non-zero when any sheet fails.
