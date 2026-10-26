# Contract: WebSocket Protocol Additions

Additions to `shared/protocol.ts`. Existing messages keep their shape.

## Server → client

| Message | Change |
|---|---|
| `welcome` | Gains `items?: ItemInfo[]` (the light index of studio items) and `helper?: 'off' \| 'unavailable' \| 'on'` (for builders; absent for guests), and `helperCooling?: true` (with `helper: 'unavailable'`: a service is set up but just failed, so it is worth trying again soon). |
| `items` | **New:** `{t:'items', items: ItemInfo[]}`. A studio item was added, changed or removed. Browsers fetch the full definitions of new or changed ones with `GET /api/items`. |
| `helper` | **New:** `{t:'helper', status: 'off' \| 'unavailable' \| 'on', cooling?: true}`. `cooling` is set with `unavailable` for the minute after the service failed, so the studio can say "not answering right now" instead of "not set up". Sent to everyone who can build when an admin switches the helper or the service stops or starts answering. |

`ItemInfo = { id: string; name: string; group: string; season?: string; kind: string; by: string; version: number }`.

## Client → server

| Message | Change |
|---|---|
| `admin` | `AdminOp` gains `{op:'helper', enabled: boolean}`. Admins only. Saved in the office state. After it, every admin receives `adminState` with `helperEnabled: boolean`, so each admin's switch shows the same setting. |

## Privacy

- Items are visible to everyone in the office; drafts are visible only to their owner.
- A helper request never travels on the WebSocket: it uses the HTTP route, from the browser to this server, and from this server to the service the admin chose.
