# Data Model: Gather-Style Desks, Office Spaces and Proximity Meetings

Coordinates are in tiles, with floats for players and integers for tiles. "Static" entities live in `shared/map.ts`
and ship with the code. "Persistent" entities live in `data/office-state.json`. "Live" entities exist only in server
memory while people are connected.

## Static (map data)

### Area *(replaces `Zone`)*
| Field | Type | Rules |
|---|---|---|
| id | string | unique, kebab-case |
| name | string | ≤ 32 chars |
| private | boolean | true makes it a meeting area (FR-010, FR-011) |
| rects | `[x0,y0,x1,y1][]` | inclusive; may not overlap another private area or desk pod |
| capacity | number? | ≥ 1; absent means unlimited |
| restricted | boolean | default false |
| allowed | string[] | memberIds; only meaningful when restricted; may be overridden in persistent state |
| highlight | boolean | default true for private areas |

### DeskPod
| Field | Type | Rules |
|---|---|---|
| id | string | unique |
| name | string | ≤ 25 chars (matches Gather's limit) |
| rects | `[x0,y0,x1,y1][]` | may not overlap other pods or private areas |
| mode | `'ambient' \| 'cubicle'` | default `ambient`; persistent state may override |

### Desk *(derived at load, not authored)*
| Field | Type | Rules |
|---|---|---|
| id | string | `<podId>:<seatX>,<seatY>` |
| podId | string | containing pod |
| seat | `{x,y}` | a chair tile `h` adjacent to ≥ 1 desk tile `d` |
| tiles | `{x,y}[]` | seat + adjacent `d` tiles + 1-tile walkable ring, clipped to the pod |

Validation at startup: every pod must contain at least 1 desk, desk tile sets may not overlap, and the server
refuses to start if the map is invalid.

### Sprite sheet *(files in `sprites/`)*
| Field | Type | Rules |
|---|---|---|
| id | string | the file stem, `[a-z0-9-]+`, unique |
| name | string | from the sidecar, ≤ 32 chars |
| layer | `'full' \| 'body' \| 'bottom' \| 'top' \| 'hair' \| 'accessory'` | from the sidecar |
| author | string? | from the sidecar |
| frameSize | 16 \| 32 | inferred; width = height = 4 × frameSize |
| url | string | `/sprites/<id>.png` |

The full format is in [contracts/sprite-sheet.md](./contracts/sprite-sheet.md). Invalid sheets are logged and
skipped, never served.

## Persistent (`data/office-state.json`)

```text
{
  version: 1,
  deskClaims: { [deskId]: { memberId, name, claimedAt } },   // one desk per member (FR-018)
  podModes:   { [podId]: 'ambient' | 'cubicle' },           // admin overrides (FR-023)
  areaAllowed:{ [areaId]: memberId[] }                       // admin overrides for restricted areas
}
```
Invariants: no two claims share a memberId, every deskId exists in the current map, and unknown ids are dropped on
load. Writes are debounced and atomic (research R6).

## Live (server memory)

### Member / Player *(extends `PlayerState`)*
| Field | Type | Notes |
|---|---|---|
| id | string | per-connection id (existing) |
| memberId | string | stable UUID from the client (R6) |
| name, look, x, y, a, mode, moving | — | existing |
| avatar | `AvatarChoice` | see below |
| status | `{ kind: 'available'\|'busy'\|'dnd', text?: string, until?: number }` | FR-031 |
| mic, cam | boolean | as reported by the client, for indicators (FR-004) |
| areaId | string \| null | derived from position |
| deskId | string \| null | the desk area the player stands in |
| lockedDesk | boolean | true while they lock *their own* desk (FR-022) |
| deskGuests | Set\<memberId\> | invited to their locked desk |
| admitted | Set\<areaId\> | session-scoped knock admissions (R11) |
| isAdmin | boolean | `?admin=` token matched |

### AvatarChoice
`{ kind: 'built-in', look: Look } | { kind: 'sheet', id: string } | { kind: 'layers', ids: Partial<Record<Layer, string>> }`.
The server rejects ids that are not loaded sheets, or whose layer does not match its slot.

### Link
| Field | Type | Notes |
|---|---|---|
| a, b | player id | unordered pair |
| kind | `'conversation' \| 'ambient'` | ambient = desk pod neighbors only |
| context | `'open' \| 'area:<id>' \| 'desk:<id>' \| 'pod:<id>'` | |

### Conversation *(derived each tick)*
| Field | Type | Notes |
|---|---|---|
| id | string | id of the earliest-joined member (stable while that member stays) |
| context | as above | |
| members | player id[] | in join order; open-area conversations are capped at `MAX_OPEN` (default 8, R1) |
| overflow | player id[] | in range but beyond the cap; they receive a `full` notice |

## Context resolution (per player, per tick)

1. If status is `dnd`: no context, no links.
2. If the player is inside a private area: the context is `area:<id>`, and all players in that area form one
   conversation.
3. Else, if the player is inside a desk area whose owner has locked it, or whose pod is in cubicle mode: the context
   is `desk:<id>`, and everyone in that desk area forms one conversation.
4. Else: the context is `open`. Conversation links come from proximity (R3). In addition, if the player is seated in
   an ambient pod, they get `ambient` links to the other players seated in the same pod who have no conversation link
   with them.

Links never cross contexts (FR-012).

## State transitions

**Desk**: `free → claimed(member)` by claim. `claimed → free` by unclaim, or when the same member claims a different
desk. A claimed desk is `unlocked` or `locked`. Lock is allowed only while the owner stands in the desk area, and the
desk unlocks automatically when the owner leaves the area or disconnects.

**Player in a conversation**: `alone → linked` when the first link appears. `linked → alone` when the last link
drops. Leaving takes `d > R+1` for every member (hysteresis), or a context change, which leaves immediately.

**Status**: any → any by the user. `until` reached → `available`.

**Knock**: `none → pending` (knock sent) → `admitted` (any occupant admits) or `declined`. Pending expires after
60 s. `admitted` ends when the person leaves the area.
