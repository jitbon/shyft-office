# Research: Office Customizability

Decisions for `plan.md`. Each is marked **observed**, **inferred** or **unknown** where it concerns outside behavior (Constitution I). RG = `specs/001-gather-office-spaces/research-gather.md`.

## R1. Gather parity

- **Observed** (RG §1): Gather's builder catalog has a `Floor` kind, and its `meetingRoom` prefab bundles a ground texture (`RugBlue`), a wall texture (`Brick`) and child objects at tile offsets. Room kits (R7) follow that structure.
- **Observed** (RG §3): "Customize desk" lets the desk's owner swap desk, chair, computer and rug. Desk looks (R8) follow it.
- **Unknown**: whether Gather has office-wide themes, wall colors, seasonal map changes or time-of-day light. No REA evidence was gathered for this plan. These parts are original and listed as deviations in the spec's Assumptions.
- **Alternatives**: capture Gather's map maker with REA first. **Deferred** (decided 2026-11-07 in `/speckit-analyze`, finding C1): this file can take the evidence later without changing the design, since themes sit on top of finishes.
- No Gather textures, theme names or art are used. Everything is painted by code (FR-025).

## R2. What a "finish" is

- **Decision**: a finish is a **painter plus parameters**, not a picture. `shared/finishes.ts` lists each finish: `id`, name, group, surface (`floor` or `wall`), painter (`planks`, `herringbone`, `chevron`, `parquet`, `tiles`, `hex`, `terrazzo`, `concrete`, `stone`, `carpet`, `grass`, `paint`, `wallpaper`, `brick`, `panel`, `felt`, `metal`, `glassblock`…) and its numbers (plank width, tile size, grout, motif). `src/finish.ts` turns `(finish, color, variant)` into ABGR pixels with no canvas, exactly as `src/pattern.ts` does for item parts. Both views draw from these pixels.
- **Rationale**:
  - About 15 painters with parameters give the 25 floor and 20 wall finishes (FR-007) with little code.
  - A color is an input, so each finish comes in every swatch (FR-008) for free.
  - Pure and deterministic, so unit tests can check them and every client paints identical pixels (Constitution II, V).
  - No image files to ship or license (FR-025, Constitution IV "built-in art as a working default").
- **Alternatives**:
  - Hand-drawn texture sheets in the repo: more charm per finish, but each one is drawn once per color or recolored at runtime anyway, and it's slow to add more. It can arrive later as a painter that recolors a sheet.
  - Uploaded textures: ruled out by the spec's clarification.

## R3. Making finishes look good at 32 px and in first person

- **Decision**:
  - Each finish has a **period** of 32 or 64 px. Larger motifs (herringbone, parquet, wallpaper repeats) use 64 px so they don't look like a stamp on every tile. Both views sample by world position modulo the period, so patterns continue across tiles.
  - Colors come from one base swatch, shaded in 4 steps (light 0.22, base, dim 0.2, dark 0.38), like `pattern.ts`. Each step is nudged in hue toward warm (lights) or cool (darks) by a fixed amount. This "hue-shifted ramp" is the usual pixel-art method, and keeps colors from looking flat.
  - Noise comes from `hash(worldX, worldY)` with a per-finish seed, at no more than 12% of pixels, so surfaces aren't busy behind characters.
  - Floors stay at medium value (lightness 35–75%). Very dark and very bright finishes get a reduced-contrast ramp so people and furniture stay readable.
- **Rationale**: the office art is 32 px per tile (feature 002). Seams at every tile, and noise that changes per tile, are what make generated textures look cheap.
- **Check**: `npm run finishes:sheet` writes a PNG contact sheet of every finish in 4 colors at 1× and 3× for review. It isn't part of the test run.
- **Alternatives**: procedural shaders or WebGL. Rejected for this feature; the view is a software rasterizer (feature 003 R-renderer), and a GPU renderer is a separate roadmap step.

## R4. How finishes are stored in a layout

- **Decision**: additive fields on `Layout`:
  - `paints?: string[]`: a table of up to 94 paint keys, each `<finishId>` (theme color) or `<finishId>:<rrggbb>`.
  - `floorPaint?: string`, `wallPaint?: string`: one character per tile. A space means "not painted" (draw the legacy code as the theme says). Any other character is `!`..`~` (ASCII 33–126), the index into `paints` plus 33.
- **Rationale**:
  - Old layouts have none of the fields and load unchanged (FR-004, SC-008). The `floor` and `walls` strings keep deciding what is a wall, so collision, rooms and desks don't change (FR-005).
  - One character per tile keeps a 100×100 office at 10 KB per layer, the same as today.
  - 94 distinct paints per office is far beyond what one office uses. The builder warns when it is full.
- **Merge**: `layout-merge.ts` compares tiles by their **paint key**, not their index, then rebuilds a compact table. Two builders painting different tiles with different finishes merge cleanly, and the same tile painted differently on both sides is a `paint:x,y` clash (spec edge case).
- **Alternatives**:
  - A finish id per tile as a JSON array: 3–5× bigger and slower to parse.
  - New one-character floor codes per finish: runs out of characters, and colors can't be encoded.

## R5. Themes

- **Decision**: `shared/themes.ts` defines each theme as data:
  - for each legacy floor code (`.`, `,`, `;`, `_`), the finish and color it draws as;
  - the finish and color of plain walls (`#`), wall caps and trim;
  - colors for the special walls (window frame, whiteboard frame, bookshelf wood, counter);
  - the ceiling's finish and color;
  - accent colors for the six built-in furniture kinds (desk top, chair seat, sofa, table, plant pot);
  - light (R6) and seasonal accents (R9).
  `Layout.theme?: string`; absent means `warm-studio`.
- **Warm Studio must match today exactly** (FR-002, SC-008): its legacy floors use special painters that reproduce today's `drawFloor` and `paintWallFace` code, and its colors are today's `PALETTE`. A test paints every tile kind with today's code and with Warm Studio and compares pixels.
- **8 themes** at launch: Warm Studio, Scandinavian, Industrial Loft, Cozy Cabin, Night Mode, Garden Atrium, Retro Arcade, Space Station. Each has a distinct value range and hue family, so screenshots differ (SC-002).
- `src/palette.ts` keeps `PALETTE` as Warm Studio, and gains `paletteFor(themeId)`, which returns the same shape. `art.ts` takes a palette argument instead of reading the constant.
- **Alternatives**: themes as just a color shift over today's art. Rejected: "Industrial Loft" needs concrete and brick, not tinted wood.

## R6. Light in first person

- **Decision**: each theme (and room style) has a `light`: `{ r, g, b }` multipliers (0.6–1.2), and a fog color the far distance fades toward. The 3D view computes `shade(c, f)` with three factors (`f·r`, `f·g`, `f·b`) instead of one, and mixes toward the fog color at the end. That is the same number of passes over the screen. Brightness and fog are clamped, so no theme can make the view unreadable.
- **Time of day** (FR-024): off by default. When on, the light is multiplied by a curve of the server's local hour: warm and slightly dim at 7–9 and 17–20, neutral at midday, and dim blue at night (never below 0.7 brightness). The curve is smooth, and the value is recalculated once a minute, so it changes gradually.
- **Rationale**: tinted light is the single cheapest way to make the same office feel different, and costs nothing per pixel compared with today.
- **2D**: the top-down view doesn't get dynamic light. It uses the theme's colors, so it stays readable at every hour (spec Story 5 AC3).
- **Alternatives**: real lights with shadows. Rejected: far beyond a software rasterizer at 60 fps.

## R7. Room styles and room kits

- **Decision**:
  - `Room.style?: { theme: string; light?: string }`. A styled room draws its unpainted floors, plain walls, ceiling and light with that theme instead of the office's (FR-012, FR-015). Explicitly painted tiles keep their paint everywhere.
  - **Which side of a wall** belongs to a room: the face of a wall tile takes the style of the floor tile it faces. A wall between a styled meeting room and the open office shows the room's wallpaper inside and the office's paint outside. In 2D, the visible face is the south one, so it follows the tile below it.
  - In first person, the light changes gradually over 1 tile as the player crosses a room edge, so it doesn't snap.
  - **Room kits**: `shared/room-kits.ts` lists at least 8 (lounge, library corner, boardroom, café, game room, quiet booth, studio, garden nook). Each has a size, its walls with a doorway, a room with a style, paints and objects at offsets. Placing one is a builder tool that stamps it into the draft as ordinary parts (FR-013) and is one undo step. It fails visibly if it doesn't fit or would cover a claimed desk.
- **Rationale**: reusing the theme as the room style keeps one concept, and builders who want more can still paint any tile.
- **Alternatives**: a style with its own separate floor, wall and light fields. Rejected: more fields than people use. Paint covers the rest.

## R8. Desk looks (Customize desk)

- **Decision**:
  - The **desk space** is `Desk.tiles` from `compileWorld`, which is already the chair, the desk surface and a one-tile ring of walkable floor, limited to the pod. That matches the clarified definition (FR-017).
  - A **desk look** belongs to the member (`StoredState.deskLooks[memberId]`), not to the desk. It is applied to whichever desk the member holds, so unclaiming hides it and the next claim brings it back (FR-021).
  - Contents: replacements for the desk, the chair and the computer; up to 6 other desk items and 1 rug; and 1 floor paint for the space. Positions are relative to the desk, in its own unturned frame, so the look moves and turns with the desk (FR-022).
  - **Applying**: `compileWorld(layout, catalog, looks)` overlays the looks of claimed desks. A replacement must have the same kind and footprint as what it replaces. Anything that wouldn't fit at this desk is skipped at apply time and stays saved.
  - **The builder's own desk items** on a customized desk are hidden while the look applies, so the owner's set is the whole set. If the look has no `computer` field, the builder's computer stays. Customize desk opens with the builder's items as the starting point.
  - The **server checks** the owner, the limits, that each kind exists, and that every piece lands inside the space (FR-019). It answers with a reason, which the panel shows.
  - Looks are public, as desks and their labels already are. All clients get `deskLooks` keyed by desk id.
- **Builder versus owner**: a builder painting inside a claimed desk space changes the base layout. The owner's floor paint wins while the desk is claimed (spec edge case).
- **Permissions**: the owner can always customize, even when building is off (FR-016). Guests can't claim desks, so can't customize. Rate limit: 1 change per second per member.
- **Alternatives**:
  - Store the look on the desk in the layout: every customization would become a layout publish, with merge clashes. Rejected.
  - Let owners edit the layout inside their space: needs per-tile permissions in the builder. Rejected.

## R9. Seasonal touches

- **Decision**: `Layout.seasonal?: boolean` (off by default). The server sends the season (its `seasonOf(date)` from `shared/wardrobe.ts`, northern hemisphere, or southern when `OFFICE_HEMISPHERE=south`) in the welcome, and again when it changes. When on, the theme's seasonal accents apply:
  - window walls get frost or snow in winter, blossoms in spring, sun glare in summer and leaves in autumn;
  - plain walls get a thin accent along the top (garland, bunting, vines, leaves);
  - the light shifts a little (cooler in winter, warmer in autumn).
  They are painted variants of existing textures, so nothing is placed and nothing collides.
- **Alternatives**: auto-placing seasonal catalog items. Rejected: it would change the layout without a builder and could block paths.

## R10. Readability (FR-006, SC-007)

- **Decision**: name tags, voice rings and status markers already sit on their own backgrounds (pills), so they don't depend on the floor. Room labels are drawn on the floor, so they get a 2 px dark outline. A unit test computes WCAG contrast for every theme: each label color against its pill, and room-label text (with its outline color) against the average of every finish and color the theme uses. It must be at least 4.5:1.
- **Night Mode and Space Station** use light label text with a dark outline. The color comes from the theme (`labelInk`, `labelHalo`).

## R11. Performance

- **2D**: the floor and walls are already drawn once into a cached layer per layout. A theme or paint change rebuilds that layer once. A 100×100 office takes about 10,000 tile paints at a few µs each, under 100 ms, which happens only on publish.
- **3D**: per-cell floor, ceiling and wall-face textures are looked up from arrays prepared when the world is compiled. Per pixel, the work is the same as today plus two multiplies (R6).
- **Finish textures** are cached by `(finish, color, variant)`. An office with 94 paints uses at most about 6 MB.
- **Check**: the frame-time quickstart (Q6) runs with the busiest theme and 25 people.

## R12. Publishing and protocol

- **Decision**: theme, paints, room styles and the `seasonal` and `daylight` switches are layout fields. They go through drafts, undo, publish, merge and the admin "building off" switch unchanged (FR-003). Desk looks get their own messages (contracts/protocol.md). The welcome gains `season`, `tzOffsetMin` and `now` for R6 and R9.
- **Validation**: `parseLayout` checks theme ids, paint keys (known finish, color `^[0-9a-f]{6}$` from the offered swatches), table size, string lengths, and that paint characters index into the table. Unknown values are refused on publish (FR-026). A layout saved by a newer version with an unknown finish loads with the nearest finish of the same painter, or the theme's default (spec edge case).
