# Phase 0 Research: Gather-Style Desks, Office Spaces and Proximity Meetings

This document covers the technical decisions. The behavior being copied from gather.town is in
[research-gather.md](./research-gather.md).

## R1. Live audio/video transport

- **Decision**: Use browser-to-browser WebRTC in a **mesh**, one peer connection per pair of media-linked users.
  Signaling goes over the existing WebSocket. Media code sits behind a small `MediaTransport` interface, so an SFU
  (LiveKit) can replace the mesh later without touching conversation logic.
- **Rationale**: The project currently ships one Node process and has no infrastructure. A mesh adds no servers and
  handles the target load (SC-006: conversations of up to 6). Gather uses an SFU (LiveKit/mediasoup strings in its
  bundle), which is the documented upgrade path once groups grow.
- **Alternatives considered**:
  - LiveKit or another SFU now. It scales to large rooms, but needs a separate server/Docker container, keys, and
    TURN. That is too heavy for a v1 that runs with `npm run dev`.
  - Audio-only first. It is simpler, but the spec assumes video.
- **Consequence (spec amendment)**: a mesh of 15 sends 14 video uplinks per person, which is not viable. The default
  open-area cap in FR-009 drops from 15 to **8**, and it stays configurable. Private areas over 8 people fall back to
  audio plus a small video set: only the 6 most recent speakers send video. Record this when running
  `/speckit-clarify` or `/speckit-analyze`.

## R2. Who decides who is connected

- **Decision**: The server is authoritative. On every movement update, and on a 200 ms tick, it recomputes a **link
  graph**: pairs of users with a link kind (`conversation` or `ambient`) and a context (`open`, `area:<id>`,
  `desk:<id>`, `pod:<id>`). Each client receives only its own links (`links` message) and opens or closes peer
  connections to match.
- **Rationale**: One authority avoids split-brain, where A thinks it is talking to B but B does not. It also enforces
  privacy (FR-011, FR-012) on the server, so a modified client cannot listen in. The pure grouping function sits in
  `shared/` so it can be unit-tested and reused by the client for previews.
- **Alternatives considered**: Each client computes its own neighbors. Privacy cannot be enforced that way, and
  clients disagree near boundaries.

## R3. Proximity rules: range, line of sight, hysteresis, chaining

- **Decision**:
  - Pair distance is Euclidean distance in tiles. A pair links when `d ≤ R` (R = 3) and unlinks when `d > R + 1`
    (hysteresis, FR-002).
  - Line of sight uses a tile DDA along the segment between the two players. Any wall tile blocks the link (FR-006).
    Furniture does not block.
  - Conversations are the connected components (union-find) of `conversation` links, which handles chained proximity.
  - The cap is applied in join order: members beyond the cap are dropped from the component and shown "full".
  - Players in different contexts never link. The contexts are: open floor, a specific private area, a locked or
    cubicle desk area. Players in DND never link.
- **Rationale**: This matches Gather's "anyone who enters the circle joins". Hysteresis plus the 200 ms tick satisfy
  SC-002 (no flapping) and SC-001 (connect within 2 s).
- **Alternatives considered**: Pure per-pair links without grouping. That is closer to Gather's audio, but it gives a
  confusing panel membership. We keep per-pair *volume* (R5) while grouping the *panel*.

## R4. Areas, desks and desk pods in map data

- **Decision**: Extend `shared/map.ts`.
  - `Zone` becomes `Area`. It is a union of tile rects (any tile set can be written as rects), with `private`,
    optional `capacity`, `restricted` + `allowed` (member ids), and `highlight`. The existing meeting rooms become
    private areas.
  - New `DESK_PODS: { id, name, rects, mode: 'ambient' | 'cubicle' }[]`.
  - Desks are **derived**: every chair tile `h` inside a pod that is next to a desk tile `d` is one desk. Its seat is
    the chair tile, and its desk area is the chair plus the adjacent desk tiles plus one walkable tile ring. The desk
    id is `<podId>:<x>,<y>`.
  - The map grid stays the single source of truth, so adding a desk means editing the ASCII map.
- **Rationale**: This fits the existing "one grid drives everything" design. The open-office rows `dddd/hhhh` already
  form natural pods.
- **Alternatives considered**: A Tiled (.tmx) import. Its value is real, but it is a separate feature, and the spec
  rules out a map editor.

## R5. Distance-based volume

- **Decision**: Route each remote audio track through Web Audio (`MediaStreamAudioSourceNode → GainNode →
  destination`). The client sets the gain every frame from local positions:
  - open area: `clamp(1 − d/R, 0, 1)`;
  - private area, locked or cubicle desk: 1;
  - ambient pod link: `0.2 × clamp(1 − d/podRange, 0, 1)`.

  The remote stream must also be attached to a muted `<audio>` element, which Chromium needs before it will pull
  WebRTC audio into Web Audio.
- **Rationale**: Volume is cosmetic and changes every frame, so it belongs on the client. Membership is a privacy
  rule and belongs on the server (R2).

## R6. Identity, admin role and persistence

- **Decision**:
  - The client creates a random `memberId` (UUID) once, stores it in localStorage, and sends it on `join`. Desk claims
    and allowed-lists key on `memberId`.
  - The admin is whoever opens the app with `?admin=<ADMIN_TOKEN>`. The server reads `ADMIN_TOKEN` from the
    environment. Admin-only actions: changing pod mode, editing area allowed-lists, reloading sprites.
  - Desk claims and pod-mode overrides are kept in `data/office-state.json`, written atomically (temp file + rename,
    debounced to 1 s). The file is gitignored.
- **Rationale**: This meets FR-018, FR-023 and FR-024 without building auth, which the spec rules out. Desk claims
  can be spoofed by copying a UUID, which is acceptable for a trusted team office. Auth is a follow-up feature.
- **Alternatives considered**: SQLite gives durability, but adds a native dependency for a few KB of state.

## R7. Custom sprite format and pipeline

- **Decision**:
  - **Sheet**: a PNG of 4 columns × 4 rows. The rows are directions in the order **down, left, right, up** (the
    RPG-Maker/LPC convention most pixel tools ship templates for). The columns are walk frames, and column 0 doubles
    as the idle/stand frame, which matches the current `walkFrame()` behavior.
  - **Frame size**: 16×16 by default, matching today's `TILE = 16` avatars. 32×32 is allowed and is downscaled 2:1
    with nearest-neighbour sampling. Frame size is inferred from width/4 and must equal height/4.
  - **Layered characters**: each layer is a sheet with the same layout. A layer is one of `body`, `bottom`, `top`,
    `hair`, `accessory`, and layers composite in that order. A `full` sheet is a whole character.
  - **Metadata**: a sidecar `<name>.json` with `{ name, layer, author }`.
  - **Workflow**: artists draw in any tool, using `npm run sprites:template` to generate a guide PNG and
    `npm run sprites:check <file>` to validate it. An admin drops the PNG and JSON files into `sprites/` and they
    load on server start, or on an admin "reload sprites" action.
  - **Validation**: one shared `validateSheet(rgba, w, h)` function used by the CLI, the server and the browser. It
    checks dimensions, a maximum of 256 KB / 128×128, that each frame has at least 1 opaque pixel, and that there is
    transparency (the corners of each frame are transparent). PNGs are decoded with `pngjs` on Node.
  - **Rendering**: both renderers already consume the `Avatar { frames, tex }` interface. A new
    `avatarFromSheet(img | layers[])` produces that interface, so neither renderer changes.
- **Rationale**: A 4×4 sheet is the most common layout in free tools (Aseprite, Piskel, LibreSprite) and needs no
  plugins (FR-026). It keeps the art pipeline outside the site, as the user asked. Gather's 32×64 strip of 16 frames
  (see research-gather.md §6) was considered and rejected: this office's avatars are one tile tall, and a
  direction-per-row grid is easier to paint.
- **Alternatives considered**: An in-browser sprite editor, which the user said is not needed. Gather's exact strip
  layout, which artists would find unfamiliar.

## R8. Media connectivity

- **Decision**: Use public STUN (`stun:stun.l.google.com:19302`) by default. Optional TURN comes from env
  `TURN_URL`, `TURN_USER`, `TURN_PASS`, which the server hands to clients in `welcome`. Camera and mic need a secure
  context: `localhost` works, and LAN or remote testers need HTTPS (Vite `--https` or a tunnel).
- **Rationale**: This covers dev and same-network teams. TURN covers restrictive NATs without changing code.

## R9. Testing

- **Decision**: Add **Vitest** for the pure logic in `shared/` and `server/`: proximity grouping, line of sight,
  hysteresis, area capacity, desk derivation and claims, and sprite validation. Add a scripted two-client WebSocket
  integration test against an in-process server for link and privacy rules. Camera/mic paths are checked by hand
  with the quickstart.
- **Rationale**: The repo has no tests yet. Vitest works with the existing Vite and TypeScript setup and needs no
  extra configuration.

## R10. Status, ring and wave

- **Decision**:
  - The status is `available | busy | dnd`, with an optional `until` timestamp and a text of up to 60 characters.
    The server expires statuses on its tick.
  - DND removes a user from link computation and forces their mic and camera off on the client.
  - Ring: the server relays `ring`. On `accept`, the server picks the nearest free walkable tile next to the caller
    and sends `teleport` to the recipient. Movement stays client-authoritative, so the recipient's client moves
    itself.
  - Wave: a relayed notification.
- **Rationale**: These are the smallest changes to the current model, where clients own their movement.

## R11. Blocking entry (capacity, restricted, locked)

- **Decision**:
  - The client checks the area it is about to enter against the area and occupancy snapshot it holds, and refuses
    the move locally with a notice.
  - The server double-checks on `state`. If the move is not allowed, it does not apply it and sends `correct
    { x, y, reason }`, which snaps the client back.
  - Knock: `knock { areaId }` goes to the occupants. `admit { memberId, areaId }` grants a session-scoped allowance
    that lasts until that person leaves the area.
- **Rationale**: The client check gives instant feedback, and the server check enforces the rule against modified
  clients.
