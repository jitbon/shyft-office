# Data Model: Higher-Detail Office and Polished Interface

## Desk layout (shared/map.ts)

The open office rows change, and everything else in the map stays. These are the target rows 10–17. The rows outside the open office are unchanged.

```text
x:        0         1         2         3
          0123456789012345678901234567890123456789
row 10    #......................................#
row 11    #.............p...........p............#
row 12    #.....h...h.......h...h.......h...h....#
row 13    #....ddd.ddd.....ddd.ddd.....ddd.ddd...G
row 14    #....ddd.ddd.....ddd.ddd.....ddd.ddd...G
row 15    #.....h...h.......h...h.......h...h....#
row 16    #.............p...........p............#
row 17    #......................................#
```

The exact columns are fixed during implementation. They must satisfy these rules, which are checked by `tests/unit/desks-layout.test.ts`:

- The open office has exactly 3 pods and 12 desks, 4 per pod (FR-006).
- Every desk's surface is one horizontal run of exactly 3 `d` tiles, and its chair `h` sits at the centre tile, directly above or below it.
- Each desk row has a gap of at least 1 floor tile between its two desks (FR-007). Pods are separated by aisles at least 2 tiles wide.
- The doorways at rows 9 and 18 and the central opening stay reachable from every chair, which the existing reachability test checks.
- The window walls `G` at x = 0 and x = 39 stay where they are.

### DeskPod (unchanged shape)

| Field | Type | Notes |
|---|---|---|
| id | `pod-1` … `pod-3` | Was `pod-1` … `pod-8`. |
| name | `Desk pod 1` … `Desk pod 3` | |
| rects | `Rect[]` | The pod footprint plus a 1-tile margin. |
| mode | `'ambient' \| 'cubicle'` | Default `ambient`, which an admin can override. |

### Desk (unchanged shape, new derivation)

| Field | Type | Notes |
|---|---|---|
| id | `pod-N:x,y` | The seat position. It stays unique. |
| podId | string | |
| seat | `{x,y}` | The chair tile. |
| tiles | `{x,y}[]` | The seat, **all 3 desk tiles in the run**, and a ring of walkable floor. Desks never share a tile. |

**Derivation change**: a chair's desk is the maximal horizontal run of `d` tiles that contains a tile 4-adjacent to the chair. Runs never extend vertically, so back-to-back desks stay separate.

## Saved office state (server/store.ts)

See [contracts/office-state-v2.md](contracts/office-state-v2.md) for the file format.

| Field | v1 | v2 |
|---|---|---|
| version | `1` | `2` |
| deskClaims | `Record<deskId, DeskClaim>` | The same; on migration from v1 it is emptied. |
| podModes | `Record<podId, PodMode>` | The same; on migration from v1 it is emptied. |
| areaAllowed | `Record<areaId, memberId[]>` | The same, and it is kept on migration. |
| deskResetNotice | — | `memberId[]`: members to tell once that desks were reset. Unique, at most 500. |

**State transitions** for a member in `deskResetNotice`:

```text
v1 claim holder ──(server loads a v1 file)──▶ in deskResetNotice
in deskResetNotice ──(member joins)──▶ sent notify 'deskReset', removed from the list, state saved
```

A member who joins in several tabs at once gets the notice once: the take-and-clear runs on the first join.

## Render scale (src/scale.ts, client only)

| Name | Meaning | Rule |
|---|---|---|
| `TILE` | Art pixels per tile | 32 |
| `dpr` | Device pixel ratio | `window.devicePixelRatio`, at least 1 |
| `k` | Device pixels per art pixel (the zoom) | An integer in `[max(1, round(dpr)), 3 × round(dpr)]` |
| default `k` | | `max(1, round(1.5 × dpr))` |
| tile on screen | | `TILE × k / dpr` CSS px |

Zooming in or out moves `k` by 1, clamped to the range. When the window moves to a screen with a different `dpr`, `k` is re-clamped and keeps the closest on-screen tile size.

## Built-in avatar frame

| Property | Value |
|---|---|
| Frame | 32×32 art px, transparent background, feet on row 31, horizontally centred |
| Directions × frames | 4 × 4, as before (`down`, `left`, `right`, `up` × walk cycle) |
| Inputs | `Look { shirt, hair, skin }`; each colour gets a darker and a lighter shade |
| Uploaded 16-px sheet | Upscaled 2× with nearest-neighbour when loaded |
| Uploaded 32-px sheet | Used as is |
