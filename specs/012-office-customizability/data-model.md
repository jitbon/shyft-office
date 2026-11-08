# Data Model: Office Customizability

All new layout fields are **optional and additive**: a layout without them loads and looks as it does today (FR-004). The state file stays at version 4 (`deskLooks` is an additive field, like `arenaEnabled`).

## Constants (`shared/finishes.ts`, `shared/themes.ts`)

| Name | Value | Source |
|---|---|---|
| `MAX_PAINTS` | 94 (paint characters `!`..`~`) | R4 |
| `UNPAINTED` | `' '` | R4 |
| `SWATCHES` | 24 offered colors, `#rrggbb` | FR-008 (at least 16) |
| `FLOOR_FINISHES` | at least 25 | FR-007 |
| `WALL_FINISHES` | at least 20 | FR-007 |
| `THEMES` | at least 8; `DEFAULT_THEME = 'warm-studio'` | FR-002 |
| `ROOM_KITS` | at least 8 | FR-013 |
| `DESK_ITEMS_MAX` | 6 | FR-018 |
| `DESK_RUGS_MAX` | 1 | FR-018 |
| `LIGHT_MIN`, `LIGHT_MAX` | 0.6, 1.2 per channel | R6 |
| `NIGHT_FLOOR` | 0.7 brightness | R6 |

## Finish

```ts
interface Finish {
  id: string;            // [a-z0-9-]{1,32}, e.g. 'herringbone-oak', 'subway-tile', 'brick'
  name: string;          // shown in the builder, ≤ 32 chars
  surface: 'floor' | 'wall';
  group: string;         // floors: wood, tile, stone, soft, outdoor, special; walls: paint, wallpaper, masonry, panel, special
  painter: PainterId;    // R2
  params: Record<string, number>;   // painter numbers, e.g. { plank: 8, grout: 1 }
  period: 32 | 64;       // pixels before the pattern repeats (R3)
  defaultColor: string;  // used when a theme or kit doesn't name one
}
```

- The legacy codes have Warm Studio finishes that reproduce today's art exactly (R5): `wood-plank-classic` (`.`), `carpet-blue` (`,`), `library-diamond` (`;`), `kitchen-check` (`_`), `plaster-wall` (`#`).

## Paint key

- Either `<finishId>` (use the theme's color for this finish's surface) or `<finishId>:<rrggbb>` (fixed color, one of `SWATCHES`).
- Regex: `^[a-z0-9-]{1,32}(:[0-9a-f]{6})?$`.
- A theme-color paint follows theme changes. A fixed-color paint doesn't (FR-008).

## Layout (changed)

```ts
interface Layout {
  // ... existing fields unchanged ...
  theme?: string;        // a THEMES id; absent = 'warm-studio'
  paints?: string[];     // ≤ MAX_PAINTS distinct paint keys
  floorPaint?: string;   // w*h chars: ' ' or String.fromCharCode(33 + index into paints)
  wallPaint?: string;    // same; only read on plain '#' wall tiles (special walls keep their own art, FR-010)
  seasonal?: boolean;    // absent = off (FR-023)
  daylight?: boolean;    // time-of-day light, absent = off (FR-024)
}
```

**Validation** (`parseLayout`, on publish):
- `theme` must be a known id.
- Each `paints` entry must be a well-formed key with a known finish of the right surface, and a color from `SWATCHES`. No duplicates. At most `MAX_PAINTS`.
- `floorPaint` and `wallPaint` must be exactly `w*h` long. Every non-space character must index into `paints`, and its finish must have the right surface (`floor` for `floorPaint`, `wall` for `wallPaint`).
- `wallPaint` on a tile that isn't a plain `#` wall is ignored when drawing, and cleared by `normalizeLayout`.
- **Saved-file leniency** (spec edge case): when the server loads its own saved layout, an unknown finish id is replaced by the theme default for that surface, not refused. An unknown theme becomes `warm-studio`.
- Resizing the grid resizes the paint strings with the same rule as `floor`/`walls`. `normalizeLayout` drops unused `paints` entries and re-indexes.

## Room (changed)

```ts
interface Room {
  // ... existing fields unchanged (name, private, rects, capacity, restricted, allowed, highlight, jam) ...
  style?: { theme: string };   // a THEMES id; absent = follow the office theme
}
```

- Changing `style` changes nothing else in the room (FR-014).
- **Where a style applies**: floor and ceiling tiles inside the room's rects; wall faces whose facing floor tile is inside (R7); first-person light while the camera is inside, blended over 1 tile at the edge.

## Theme

```ts
interface Theme {
  id: string;                    // 'warm-studio', 'scandinavian', 'industrial-loft', 'cozy-cabin', 'night-mode', 'garden-atrium', 'retro-arcade', 'space-station'
  name: string;
  floors: Record<'.' | ',' | ';' | '_', PaintKey>;   // what each legacy floor code draws as
  wall: PaintKey;                // plain walls
  colors: Record<string, string>;   // per surface: the color a theme-color paint takes, keyed by finish group
  cap: { base: string; light: string; dark: string; shadow: string };   // wall tops in 2D
  trim: string;
  special: { glassFrame: string; boardFrame: string; shelfWood: string; counterTop: string; cabinet: string };
  ceiling: PaintKey;
  furniture: { deskTop: string; chairSeat: string; sofa: string; tableTop: string; plantPot: string };
  light: { r: number; g: number; b: number; fog: string };   // each in LIGHT_MIN..LIGHT_MAX
  labelInk: string; labelHalo: string;   // R10
  seasons: Record<'winter' | 'spring' | 'summer' | 'autumn', SeasonAccent>;
}
interface SeasonAccent { window: 'frost' | 'blossom' | 'sun' | 'leaves'; trim: 'garland' | 'bunting' | 'vines' | 'leaves' | 'none'; light: { r: number; g: number; b: number } }
```

Themes are code, not stored data. A layout stores only the theme id.

## Room kit

```ts
interface RoomKit {
  id: string; name: string;
  w: number; h: number;              // outer size, including walls, at most 12×12
  walls: string;                     // w*h wall codes, with at least one doorway on the edge
  floorPaint?: string; wallPaint?: string; paints: string[];
  style?: { theme: string };
  objects: { kind: string; x: number; y: number; rot: Rot; on?: number; at?: [number, number]; wall?: Face }[];   // offsets; `on` is the index of the host object
  room: { name: string; private: boolean };
}
```

- Stamping a kit at `(x, y)` writes its walls, paints and objects into the draft with fresh ids, and adds a room covering its inside. It is refused (with a message) if it leaves the grid, or covers a claimed desk or the spawn point.

## Desk look

"Desk Customization" in the spec; "Customize desk" is the button that edits it.

```ts
interface DeskLook {
  desk?: string;      // catalog id with kind 'floor', same footprint as the layout's desk
  chair?: string;     // catalog id, same footprint as the layout's chair (1×1)
  computer?: { kind: string; at: [number, number]; rot: Rot } | null;   // a deskitem from the 'computers' group; absent = keep the builder's, null = none
  items: { kind: string; at: [number, number]; rot: Rot }[];   // other desk items on the desk surface, ≤ DESK_ITEMS_MAX, in the desk's own frame; the computer isn't counted
  rug?: { kind: string; dx: number; dy: number; rot: Rot };   // floor art, offset from the desk's top-left in its own frame
  floor?: string;     // a floor paint key, drawn on the desk space's floor tiles
}
interface StoredDeskLook { look: DeskLook; at: number }
// StoredState gains: deskLooks?: Record<memberId, StoredDeskLook>
```

**Validation** (server, on `deskLook`):
- The sender is a member (not a guest) holding a claimed desk.
- `desk` and `chair` exist and have the same footprint as what they replace. `computer` is a `deskitem` in the `computers` group, `items` are `deskitem` kinds, and `rug` is `floorart`.
- Counts are within limits. `floor` is a valid floor paint key.
- Placed at the member's current desk, every piece is inside that desk's `tiles`, and desk items fit on the surface by the same rules as the builder (`layout.ts` desk-item checks).

**Lifecycle**:

```text
no look ──save──▶ saved look (member) ──claim desk──▶ shown at that desk
                         ▲                                 │
                         └──── unclaim / desk deleted ─────┘   (look kept with the member, desk shows the builder's version)
```

- When a layout publish moves or turns a claimed desk, the look moves with it, because it is relative to the desk.
- If a publish deletes the desk, the claim is released with the existing desk-removed notice. That notice says the desk's decorations are saved for the next desk (FR-022).
- When the look is applied to a different desk, pieces that don't fit there are skipped silently. They stay in the saved look.

## World (changed, `shared/world.ts`)

`compileWorld(layout, catalog, looks?)` additionally produces:
- `paintAt(x, y, 'floor' | 'wall')`: the resolved paint key, after desk-look floors, explicit paint, room style and office theme, in that order;
- `styleAt(x, y)`: the theme id that applies to the tile (room style or office theme);
- `objects` with desk-look replacements and items overlaid, and hidden builder desk items removed.

Collision doesn't change with looks, because replacements have the same footprint, and rugs and desk items don't block.

## Welcome (changed)

`welcome` gains `season: 'winter' | 'spring' | 'summer' | 'autumn'`, `tzOffsetMin: number` and `now: number` (server ms), plus `deskLooks: Record<deskId, DeskLook>`.
