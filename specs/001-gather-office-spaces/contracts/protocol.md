# Contract: WebSocket Protocol v2 (`/ws`)

This document covers JSON text frames, one message per frame, each with a `t` discriminator. It extends the
current `shared/protocol.ts`. Messages marked *(existing)* keep their current shape, and fields marked `+` are new.
The server ignores malformed or unknown messages and clamps and sanitizes every field, as it does today.

## Client → Server

| t | Payload | Notes |
|---|---|---|
| `join` *(existing)* | `{ name, look, +memberId, +avatar?: AvatarChoice, +admin?: string }` | `memberId` is a UUID; `admin` is the token from `?admin=` |
| `state` *(existing)* | `{ x, y, a, mode, moving }` | the server may answer with `correct` |
| `chat` *(existing)* | `{ text, +to?: 'nearby' \| 'office' }` | the default is the current context: area/desk if private, else `office`. `nearby` goes only to current conversation members (FR-008) |
| `media` | `{ mic: boolean, cam: boolean, speaking?: boolean }` | for indicators. `speaking` is sent at most once per second, on change, and drives the recent-speaker video list (FR-011a) |
| `rtc` | `{ to: playerId, data: { sdp } \| { candidate } }` | relayed only when a link between the sender and `to` currently exists. Frames over 16 KB are dropped |
| `status` | `{ kind, text?, until? }` | `text` ≤ 60 chars; `until` is a future epoch ms |
| `avatar` | `{ avatar: AvatarChoice }` | validated against the loaded sheets |
| `desk` | `{ op: 'claim' \| 'unclaim' \| 'lock' \| 'unlock', deskId? }` | `claim` requires a free desk; `lock` requires standing in your own desk area |
| `deskInvite` | `{ memberId }` | the invitee gets `notify` with kind `deskInvite` and is added to `deskGuests` |
| `walkToDesk` | `{ deskId? }` | without `deskId`, the server answers with `teleport` to your own seat (FR-020). With `deskId`, it teleports you to the free tile nearest that desk's seat, and only if the desk's owner invited you (FR-021) |
| `knock` | `{ areaId }` | |
| `admit` | `{ areaId, memberId, allow: boolean }` | sender must be inside `areaId` |
| `ring` | `{ to: playerId }` | |
| `ringReply` | `{ from: playerId, accept: boolean }` | |
| `wave` | `{ to: playerId }` | |
| `admin` | `{ op: 'podMode', podId, mode } \| { op: 'reloadSprites' } \| { op: 'areaAllowed', areaId, memberIds }` | ignored unless `isAdmin` |

## Server → Client

| t | Payload | Notes |
|---|---|---|
| `welcome` *(existing)* | `{ id, players, +office: OfficeSnapshot, +sprites: SpriteIndex, +ice: RTCIceServer[], +isAdmin }` | |
| `join` / `leave` / `state` *(existing)* | `player` gains `+avatar, +status, +mic, +cam` | |
| `chat` *(existing)* | `{ id, name, text, zone, +scope: 'office' \| 'nearby' \| 'area' \| 'desk' }` | |
| `links` | `{ links: { peer: playerId, kind: 'conversation' \| 'ambient', context }[], conversation: { id, members: playerId[], context, label, video?: playerId[] } \| null, full?: boolean }` | `video` is present only when an area meeting has more than 8 members. It lists the ≤ 6 members allowed to send video, ordered by most recent speaking; other members send audio only | sent to each player only when *their* link set changes. The client opens or closes peer connections to match, and the `conversation` field drives the panel |
| `rtc` | `{ from: playerId, data }` | relayed signaling |
| `presence` | `{ id, status?, mic?, cam?, avatar? }` | a delta for one player |
| `office` | `OfficeSnapshot` | sent whenever desk claims, locks, pod modes or area occupancy change |
| `correct` | `{ x, y, reason: 'full' \| 'restricted' \| 'locked' }` | snap back plus a notice (R11) |
| `teleport` | `{ x, y, reason: 'ring' \| 'desk' }` | the client moves itself there |
| `notify` | `{ kind: 'knock' \| 'knockResult' \| 'ring' \| 'ringResult' \| 'wave' \| 'deskInvite' \| 'error', from?: playerId, areaId?, ok?, text? }` | |
| `sprites` | `SpriteIndex` | after an admin reload |

## Shared types

```text
OfficeSnapshot = {
  areas:   { id, occupants: number, capacity?, restricted }[],
  pods:    { id, mode }[],
  desks:   { id, owner?: { memberId, name, online: boolean, status? }, locked: boolean }[]
}
SpriteIndex = { id, name, layer, author?, frameSize, url }[]
AvatarChoice — see data-model.md
```

## Guarantees (these are the things to test)

1. A client never receives `rtc`, `chat` with scope `nearby`, `area` or `desk`, or a `links` entry for a peer outside
   its current context (FR-011, FR-012, SC-003).
2. After a `state` that changes link membership, the `links` message arrives within one server tick (≤ 200 ms).
   Together with the client's connection setup, this keeps connect and disconnect within 2 s (SC-001, SC-002).
3. A player in `dnd` has an empty `links` list.
4. `correct` is the only way the server overrides a client position. `teleport` is a request that the client
   carries out.
5. Protocol v1 clients that send `join` without `memberId` are still accepted. The server gives them an ephemeral
   memberId, and they cannot claim desks.

## HTTP endpoints (existing static server, extended)

| Path | Returns |
|---|---|
| `GET /sprites/index.json` | `SpriteIndex` (valid sheets only) |
| `GET /sprites/<id>.png` | the sheet image (`image/png`), for valid ids only |
| `GET /sprites/template.png` | the guide template, the same image as `npm run sprites:template` produces |
| `GET /sprites/FORMAT.md` | the human-readable format doc ([sprite-sheet.md](./sprite-sheet.md)) |

During development, Vite proxies `/sprites` to the Node server, as it already does for `/ws`.
