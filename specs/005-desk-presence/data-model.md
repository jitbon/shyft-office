# Data Model: Desk Presence

Nothing here is stored on the server and nothing is sent. All of it is derived each frame in the browser.

## Presence

```ts
type DeskPresence =
  | null                                           // not in any desk space
  | { deskId: string; mine: boolean; tiles: {x:number;y:number}[] };
```

- `deskId`/`tiles` come from the compiled world: the desk whose `tiles` contain the avatar's tile.
- `mine` is true when the office snapshot says the desk's owner has this browser's `memberId`. A guest (`eph-…` member id) is never an owner, so never `mine`.
- Spaces never share a tile, so a tile belongs to at most one desk.

## Dwell state (`DeskDwell`)

| Field | Meaning |
|---|---|
| `deskId` | the desk space the member is in now, or null |
| `since` | when they entered it (ms) |
| `leftAt` | when they last left an own desk space, or null |

`update(presence, now) → { highlight: DeskPresence; view: string | null }`:
- `highlight` is the presence as is, at once.
- `view` is the desk id when `presence.mine` has held for 1000 ms, and stays that desk id until 600 ms after the member left; otherwise null.
- Entering a different desk space resets `since`.

## Highlight

```ts
interface DeskHighlight { tiles: {x:number;y:number}[]; mine: boolean; edges: Edge[] }
type Edge = { x1: number; y1: number; x2: number; y2: number };   // in tile units
```

`outlineEdges(tiles)` returns the segments of the boundary of the tile set: for each tile, one edge per side whose neighbour is not in the set. Top-down only; first person uses just the presence (`mine`, desk name) for the cue.

## Panel model

The conversation panel's existing `TileInfo[]` and heading, plus:

| Field | Meaning |
|---|---|
| `heading` | `"Your desk"` / `"<Owner>'s desk"` for the desk view; the conversation label otherwise (with the desk's name added while on your own desk) |
| `controls` | on the member's own tile: `{ mic: boolean; cam: boolean }` buttons |
| `kind` | `'desk' \| 'conversation'`, so the desk view never shows "conversation is full" |

## Setting

`localStorage["shyft.deskView"]`: `"off"` means do not open the view by itself; absent or any other value means on.
