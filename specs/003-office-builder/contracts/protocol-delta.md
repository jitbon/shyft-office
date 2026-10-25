# Contract: WebSocket Protocol Changes

These are additions to `shared/protocol.ts`. Every existing message keeps its shape.

## Server → client

| Message | Change |
|---|---|
| `welcome` | Gains three fields:<br>• `session: string`, a 128-bit random hex token for `X-Shyft-Session`<br>• `layoutRev: number`<br>• `canBuild: boolean`<br>The client fetches `GET /api/layout` before drawing the office when its cached revision differs. |
| `layout` | **New:** `{t:'layout', rev, by:{name}, at}`. A revision was published. The client fetches `GET /api/layout?rev=rev`, swaps its world, rebuilds its 2D map and 3D caches, and shows "<name> updated the office". |
| `building` | **New:** `{t:'building', enabled, canBuild}`. Sent to everyone when an admin switches building on or off. Anyone with `canBuild:false` who is in build mode leaves it and is told why. |
| `objects` | **New:** `{t:'objects', objects: CustomObject[]}`. The custom object catalog changed. |
| `teleport` | `reason` gains `'layout'`: the person was moved because a publish put a wall or furniture where they stood (FR-014). |
| `notify` | `kind` gains `'deskRemoved'`. Its `text` says what happened: "Your desk was removed in the latest office update." |

## Client → server

| Message | Change |
|---|---|
| `admin` | `AdminOp` gains `{op:'building', enabled: boolean}`. It's accepted only from admins, and saved (FR-002a). |

## Privacy

- The `layout` message carries no draft content, and drafts are only ever returned to their owner.
- After a publish, room membership is recomputed from the new rooms on the next links tick (200 ms or less). `links` and conversation messages then follow the existing rules (FR-016).
