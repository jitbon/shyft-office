# Shyft Office object sheet, version 1

This is the format for your own furniture and objects, drawn in any pixel-art tool (Aseprite, Piskel, LibreSprite,
Photoshop, …) with no plugins. Characters have their own format in `sprites/FORMAT.md`.

You draw each object from a few sides on one sheet. In the top-down view the office shows the **top**. In first person
it becomes a solid box of the size you choose: the **front**, **side** and optional **back** pictures are wrapped
onto it. An object can have several animation frames.

## Settings (`<name>.json`, next to the PNG)

```json
{ "format": 1, "name": "Vending machine", "footprint": [1, 1], "height": 64, "blocks": true, "frames": 2, "fps": 4, "back": false }
```

| Field | Rules |
|---|---|
| `format` | Optional. If given it must be `1`. |
| `name` | 1–32 characters. |
| `footprint` | `[width, depth]`: the tiles it covers on the floor, 1–4 each. A tile is 32 pixels. |
| `height` | How tall it stands, in pixels: 8–96, in steps of 8 (32 is one tile). |
| `blocks` | Whether people can walk through it. Default `true`. |
| `frames` | Animation frames, 1–8. Default 1. |
| `fps` | Animation speed, 1–12. Default 4. |
| `back` | Whether the sheet has its own back view. Default `false`: the back copies the front. |

## The picture

A PNG with transparency, at most 512 KB. It is a grid:

- **Columns** are animation frames, left to right. Each column is `32 × max(width, depth)` pixels wide.
- **Rows** are views, top to bottom:

| Row | View | Size of its cell |
|---|---|---|
| 1 | **Top**: seen from above, north at the top. The top-down office shows this. | `32·width × 32·depth` |
| 2 | **Front**: seen from the south | `32·width × height` |
| 3 | **Side**: seen from the east. The west side is this one mirrored. | `32·depth × height` |
| 4 | **Back**: seen from the north (only when `back` is `true`) | `32·width × height` |

A cell that is narrower than its column is drawn at the left of it, and the rest stays transparent. So the whole
picture is `frames × 32·max(width, depth)` pixels wide and `32·depth + height × 2` tall, or `× 3` with a back view.

Every view must have something drawn in it, in every frame. The top view may be left empty, for something with
nothing to see from above. Put the floor line at the bottom row of the front, side and back views.

An object turned in the builder turns as a whole, so the front always faces the way the object faces.

## Errors (the same codes in the builder, the server and the checker)

| Code | Meaning |
|---|---|
| `not-png` | the file is not a PNG |
| `too-large` | the file is over 512 KB |
| `bad-meta` | the settings are missing, or not an object |
| `bad-format` | `format` is not 1 |
| `bad-name` | the name is empty or over 32 characters |
| `bad-footprint` | the footprint is not two whole numbers from 1 to 4 |
| `bad-height` | the height is not a multiple of 8 from 8 to 96 |
| `bad-frames` | `frames` or `fps` is out of range |
| `bad-size:<w>x<h>` | the picture is not the size these settings need; the code says the size it wanted |
| `empty-view:<row>,<frame>` | that view has nothing drawn in it (rows count from 0) |
| `bad-id` | the file name uses something other than lowercase letters, digits and `-` |
| `too-many` | the office already has 100 custom objects |

## Tools

```sh
npm run objects:template -- --w 2 --d 1 --height 64 --frames 2 --back --out arcade.png
npm run objects:check arcade.png        # reads arcade.json next to it; prints OK or the codes above
```

The template writes a guide sheet (a tinted band for each view, frame borders, a floor line) and its settings file.
Paint on a new layer, delete the guide layer, and export. To add the object, open build mode (**B**) in the office, go to
the **Custom** tab, choose the PNG (and optionally its settings file), and press **Add to the office**.
