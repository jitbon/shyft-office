# Contract: Shyft Office Avatar Sprite Sheet v1

This is the format artists follow in any external pixel-art tool (Aseprite, Piskel, LibreSprite, Photoshop, …). It
ships to users as `sprites/FORMAT.md`, next to the generated `template.png`.

## Image

- **File**: PNG with an alpha channel (RGBA). Maximum 256 KB.
- **Grid**: 4 columns × 4 rows of equal, square frames.
- **Frame size**: **16×16 px** (native) or **32×32 px** (downscaled 2:1 with no smoothing). The whole image is therefore
  64×64 or 128×128 px.
- **Background**: fully transparent. The 4 corner pixels of every frame must be transparent.
- **Every frame** must contain at least one opaque pixel.

## Layout

```text
            col 0        col 1     col 2        col 3
          (stand/step) (step A)  (stand/step) (step B)
row 0  ↓  facing down (toward the viewer)
row 1  ←  facing left
row 2  →  facing right
row 3  ↑  facing up (away from the viewer)
```

- Column 0 is also the **idle** frame.
- While walking, the frames play `0 → 1 → 2 → 3`, looping at 8 frames per second. Columns 0 and 2 are usually
  near-identical "passing" poses, and columns 1 and 3 are the opposite feet.
- Feet sit on the **bottom row of pixels** in each frame, and the character is horizontally centred. The renderer
  anchors frames bottom-centre on the player's position.
- The first-person view uses the same frames as billboards, so the down, left, right and up rows double as the
  front, side and back views.

## Layered characters (optional)

Instead of one `full` sheet, a character can be built from part sheets. Each part uses exactly the same grid and frame
size, and stays transparent wherever the part is absent. The parts composite bottom to top in this order:

`body` → `bottom` → `top` → `hair` → `accessory`

Only `body` is required in a layered avatar. Users pick at most one sheet per layer.

## Metadata sidecar

Put `<id>.json` next to `<id>.png`. The `id` is the file stem, made of lowercase letters, digits and `-`.

```json
{ "format": 1, "name": "Robo Intern", "layer": "full", "author": "sam" }
```

`format` is the version of this document the sheet was drawn for. It is optional (leaving it out means the current
version, 1). A version the server does not know is rejected, so a future format change can never be mistaken for a
broken v1 sheet.

`layer` is one of `full`, `body`, `bottom`, `top`, `hair`, `accessory`. If the sidecar is missing, the sheet is treated
as `full` and named after its id.

## Validation errors (exact codes reported by the CLI and server)

| Code | Meaning |
|---|---|
| `not-png` | the file is not a decodable PNG |
| `too-large` | the file is over 256 KB |
| `bad-size` | the dimensions are not 64×64 or 128×128 |
| `no-alpha` | the PNG has no alpha channel, or a frame corner is opaque |
| `empty-frame:<row>,<col>` | that frame has no opaque pixels |
| `bad-layer` | the sidecar `layer` is not one of the allowed values |
| `bad-id` | the file stem breaks the id rules, or duplicates an existing id |
| `bad-sidecar` | the `.json` next to the sheet is not valid JSON, or is not an object |
| `bad-format` | the sidecar names a `format` version this server does not support |

## Tooling

- `npm run sprites:template -- [--size 16|32] [--out file.png]` writes a guide sheet (the `--` is needed so npm passes
  the options on). It has faint frame borders, a tinted band for each facing direction, a feet line and a centre
  line. Paint over it on a separate layer, then delete the guide layer: the guide pixels would otherwise fail the
  transparent-corner rule.
- `npm run sprites:check <file.png> [more.png…]` validates sheets and prints `OK` or the error codes above. The exit
  code is non-zero when any sheet fails.
- To install a sheet, copy the `.png` and `.json` files into `sprites/`, then restart the server or ask an admin to
  reload sprites.
