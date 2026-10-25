---

description: "Task list for Gather-Style Desks, Office Spaces and Proximity Meetings"
---

# Tasks: Gather-Style Desks, Office Spaces and Proximity Meetings

**Input**: Design documents from `specs/001-gather-office-spaces/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/protocol.md](./contracts/protocol.md),
[contracts/sprite-sheet.md](./contracts/sprite-sheet.md), [quickstart.md](./quickstart.md)

**Tests**: Included. Constitution Principle V requires unit tests for pure logic (proximity, line of sight,
area/desk rules, protocol and sprite validation). Principle III requires a test proving that every private
context does not leak.

**Organization**: Tasks are grouped by user story so each can be implemented and tested independently.

**Note**: T065–T071 were added after `/speckit-analyze`. Each sits inside the phase where it runs, so IDs are not strictly in order. Within a phase, run tasks in the order listed.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: The user story the task belongs to (US1–US5)
- Paths are repo-relative. Layout follows plan.md: `shared/`, `server/`, `src/`, `tools/`, `tests/`, `sprites/`, `data/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dependencies, test runner and folders

- [X] T001 Add dependencies to `package.json`: runtime `pngjs`, dev `@types/pngjs` and `vitest`. Add scripts `"test": "vitest run"`, `"sprites:template": "tsx tools/sprite-template.ts"`, `"sprites:check": "tsx tools/sprite-check.ts"`, `"bots": "tsx tools/bots.ts"`, then run `npm install`
- [X] T002 [P] Create `vitest.config.ts` with `test.include: ['tests/**/*.test.ts']` and `environment: 'node'`, and add `tests` and `tools` to `include` in `tsconfig.json`
- [X] T003 [P] Add `data/` to `.gitignore`, and create `sprites/.gitkeep` and `tests/unit/.gitkeep`, `tests/integration/.gitkeep`
- [X] T004 [P] Add a `/sprites` proxy to `http://localhost:3001` in `vite.config.ts`, next to the existing `/ws` proxy

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Protocol v2, identity, an area model, a link engine, a testable server and admin. Everything below is needed by every story.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T005 Rewrite `shared/protocol.ts` to protocol v2 as specified in `contracts/protocol.md`. Add every client→server and server→client message listed there. Add the types `AvatarChoice` (`{ kind: 'built-in', look } | { kind: 'sheet', id } | { kind: 'layers', ids: Partial<Record<Layer,string>> }`), `StatusKind = 'available' | 'busy' | 'dnd'`, `PlayerStatus { kind, text?, until? }`, `LinkKind = 'conversation' | 'ambient'`, `LinkContext` (template literal `'open' | \`area:${string}\` | \`desk:${string}\` | \`pod:${string}\``), `OfficeSnapshot`, and `SpriteIndex`. Extend `PlayerState` with `memberId, avatar, status, mic, cam`. Keep the existing v1 message shapes valid
- [X] T006 Change `Zone` to `Area` in `shared/map.ts`: add fields `capacity?: number` (≥ 1, absent = unlimited), `restricted: boolean` (default false), `allowed: string[]` (memberIds), and `highlight: boolean` (default true for private areas). Rename `ZONES`→`AREAS` and `zoneAt`→`areaAt`, keeping `zoneAt` as a deprecated alias. Update callers in `server/index.ts` and `src/main.ts`
- [X] T007 Implement `lineOfSight(x0,y0,x1,y1): boolean` in new file `shared/proximity.ts`, using a tile DDA over `tileAt`. Any tile in `WALLS` blocks; furniture does not (research R3)
- [X] T008 Implement `computeLinks(players, prev, opts)` in `shared/proximity.ts`. It returns `{ links: Link[], conversations: Conversation[], overflow: Map<playerId, true> }`. Rules from research R3 and data-model "Context resolution":
  - players with `status.kind === 'dnd'` get no links;
  - players inside a private area get context `area:<id>`, and all players in that area form one conversation;
  - otherwise the context is `open`;
  - open pairs link when `d ≤ R` (R = 3), and an existing link (`prev`) persists until `d > R + 1`;
  - line of sight is required;
  - conversations are the union-find components of the links;
  - members are capped at `MAX_OPEN` (default 8) in join order, and the rest go to `overflow`;
  - links never cross contexts.

  Export constants `TALK_RANGE = 3`, `HYSTERESIS = 1`, `MAX_OPEN = 8`. Also export `gainFor(link, dist)` per research R5: open `clamp(1 − d/R, 0, 1)`, area/desk `1`, ambient `0.2 × clamp(1 − d/podRange, 0, 1)`
- [X] T009 [P] Write `tests/unit/proximity.test.ts`. It covers:
  - line of sight blocked by a wall and not blocked by a desk;
  - link at d = 3 and no link at d = 3.2 from cold;
  - an existing link kept at d = 3.9 and dropped at d = 4.1;
  - a chain A–B–C forms one conversation;
  - DND gets no links;
  - two players inside Meeting Room A at opposite corners are one conversation;
  - an inside player and an outside player within 1 tile do not link;
  - a 9th member goes to overflow;
  - `gainFor` values
- [X] T010 Move the server body out of `server/index.ts` into a new `server/app.ts` exporting `startServer({ port, dataDir?, spritesDir?, adminToken?, tickMs? }) → { close(), port }`. Make `server/index.ts` a thin entry point that calls it with env values (`PORT`, `ADMIN_TOKEN`, `TURN_URL`, `TURN_USER`, `TURN_PASS`)
- [X] T011 Accept `memberId` on `join` in `server/app.ts`: it must match the UUID regex, and if it is missing or invalid, assign an ephemeral `eph-<n>` that cannot claim desks. Initialise `status: { kind: 'available' }`, `mic: false`, `cam: false`, and `avatar: { kind: 'built-in', look }`. Include `ice` (public STUN `stun:stun.l.google.com:19302` plus optional TURN from env) and `isAdmin` in `welcome`
- [X] T012 [P] In `src/join.ts`, create and keep a UUID `memberId` under localStorage key `shyft-office:member`, wrapping storage access in try/catch, and return it with the profile. In `src/main.ts`, send it on `join`
- [X] T013 Admin role in `server/app.ts`: `isAdmin` is true when `join.admin === adminToken` and `adminToken` is non-empty. Ignore `admin` messages from everyone else. In `src/main.ts`, read `?admin=` from `location.search` and pass it on `join`
- [X] T014 Create `server/links.ts` with `LinkEngine`. It keeps `prev` links, calls `computeLinks` on every `state` and on a `setInterval(tickMs = 200)`, diffs each player's link set, and sends a `links` message (`{ links, conversation, full? }` per contracts/protocol.md) only to players whose set changed. Log the tick duration every 30 s. Wire it into `server/app.ts`
- [X] T015 Relay `rtc` in `server/app.ts` only when `LinkEngine` holds a current link between sender and `to`, and drop frames over 16 KB; drop either silently. Relay `media` as a `presence` delta
- [X] T016 [P] Create `tests/integration/helpers.ts`. It starts `startServer({ port: 0, dataDir: tmp, tickMs: 50 })` and provides `connectClient(name, memberId?)`, which returns `{ send, next(t, pred?, timeoutMs), all(t), close }` over `ws`
- [X] T017 [P] Write `tests/integration/ws-links.test.ts`. It checks that:
  - two clients moved within 3 tiles in the lobby each receive `links` naming the other within 2 ticks;
  - moving one to d > 4 clears the links;
  - `rtc` from a client that has no link is not delivered

**Checkpoint**: Foundation ready. The server computes and pushes links, and the tests pass.

---

## Phase 3: User Story 1 - A meeting opens when two people walk up to each other (Priority: P1) 🎯 MVP

**Goal**: Walking within 3 tiles of someone automatically opens a live audio/video conversation, with distance-based volume. Walking away closes it, and chained neighbors join.

**Independent Test**: quickstart.md Scenario 1, with two Chrome profiles using fake devices.

### Tests for User Story 1

- [X] T018 [P] [US1] Extend `tests/integration/ws-links.test.ts`. It checks that:
  - a third client entering range of B joins the A–B conversation (`conversation.members` has 3 ids);
  - a wall between two clients 2 tiles apart produces no link;
  - a client standing still at d = 3.5 after linking gets no `links` churn over 20 ticks

### Implementation for User Story 1

- [X] T019 [US1] Create `src/media.ts` with the interface `MediaTransport { setLinks(links), onSignal(from, data), setLocal({ mic, cam }), setGain(peer, g), streams(): Map<peerId, MediaStream>, onChange }`. Implement `MeshTransport` with one `RTCPeerConnection` per linked peer and the perfect-negotiation pattern (polite = lexically smaller player id). Use the ICE servers from `welcome`. Send signaling through a callback that emits `rtc`. Close peers removed from links. Camera and mic start **off** (Constitution III), and `getUserMedia` is requested lazily on the first toggle
- [X] T020 [US1] Add the audio graph to `src/media.ts`. Each remote stream goes `MediaStreamAudioSourceNode → GainNode → destination` and is also attached to a muted hidden `<audio>` element (a Chromium requirement, research R5). Resume the shared `AudioContext` on the first user gesture. `setGain` ramps over 100 ms
- [X] T021 [P] [US1] Create `src/callPanel.ts`. It renders the conversation panel from `{ conversation, streams, players }`:
  - one tile per member: a `<video>` element when the camera is on, otherwise the avatar's front frame;
  - the member's name;
  - mic-off and cam-off icons;
  - a header label ("Nearby · n");
  - a "Conversation is full" notice when `full`.

  Add the `#callPanel` container to `index.html` and styles to `src/style.css`
- [X] T022 [US1] Wire US1 into `src/main.ts`:
  - handle `links` (pass to `media.setLinks`, rerender the call panel), `rtc` (`media.onSignal`) and `presence` (update mic, cam and status on players);
  - add mic and camera toggle buttons to the HUD, with keys `M` and `C` when chat is not focused. They call `media.setLocal` and send `media`;
  - every frame, call `media.setGain(peer, gainFor(link, dist))` using local positions;
  - leave media untouched by `setMode` (view switching must not interrupt calls);
  - when `getUserMedia` is denied, keep the user in the conversation and show a system line explaining how to enable devices
- [X] T023 [US1] Add a "Nearby" chat scope:
  - in `server/app.ts`, `chat` with `to: 'nearby'` is delivered only to the sender's current conversation members, with `scope: 'nearby'`;
  - in `src/main.ts`, add an Office/Nearby toggle next to `#chatInput` (defaulting to Nearby while in a conversation) and render the scope label in the chat log

**Checkpoint**: US1 works end to end. This is the MVP.

---

## Phase 4: User Story 2 - Private meeting areas (Priority: P2)

**Goal**: Each meeting room holds one room-wide meeting with a lit border. Nobody outside can hear, see or read it. Capacity and restricted entry (knock/admit) are enforced.

**Independent Test**: quickstart.md Scenario 2.

### Tests for User Story 2

- [X] T024 [P] [US2] Write `tests/unit/office-areas.test.ts` for `server/office.ts`. It checks that:
  - a full area (`capacity` reached) rejects entry with reason `full`;
  - a restricted area rejects a non-allowed memberId with `restricted` and accepts it once admitted;
  - a pending knock expires after 60 s (fake timers);
  - admission ends when the person leaves the area
- [X] T025 [P] [US2] Write `tests/integration/ws-privacy.test.ts`. A and B are inside Meeting Room A, and C stands on the doorway tile (6, 9) and then against the outside wall. Over 20 iterations, C must receive **no** `rtc`, no `chat` with scope `area`, and no `links` entry naming A or B. A client that moves into a full area receives `correct { reason: 'full' }`

### Implementation for User Story 2

- [X] T026 [US2] Create `server/office.ts` with `OfficeState`. It provides:
  - area occupancy by `areaAt`;
  - `checkEntry(player, fromX, fromY, toX, toY) → null | 'full' | 'restricted'`, using `capacity`, and `restricted` + `allowed` + persistent `areaAllowed` + session `admitted`;
  - knocks: `knock(areaId, player)` creates a pending knock that expires after 60 s, and `admit(areaId, memberId, allow)` is accepted only from a sender inside `areaId`;
  - `snapshot(): OfficeSnapshot` (areas part)
- [X] T027 [US2] Route the US2 messages in `server/app.ts`:
  - on `state`, call `checkEntry`. If it rejects, keep the old position and send `correct { x, y, reason }`;
  - `knock` sends `notify { kind: 'knock' }` to the occupants;
  - `admit` sends `notify { kind: 'knockResult', ok }` to the knocker;
  - broadcast `office` whenever occupancy changes;
  - admin op `areaAllowed` updates the allow-list
- [X] T028 [US2] Replace the old zone-based chat routing in `server/app.ts` with context-based delivery, using the sender's current context from `LinkEngine`. For `area:<id>`, deliver only to players currently in that area with `scope: 'area'`. For `desk:<id>` (added in US3), deliver only to players in that desk area with `scope: 'desk'`. Never replay earlier messages to people who join later (FR-016)
- [X] T029 [P] [US2] In `src/render2d.ts`, draw a highlighted border (an animated dashed outline in light colors) around the tiles of the private area the local player is in, plus a label "<area name> · <occupants>" from the latest `OfficeSnapshot`
- [X] T030 [US2] Create `src/office-ui.ts` with:
  - a "You have entered <area name>" notice when `areaAt` changes into a private area;
  - a knock prompt when blocked by `restricted`, which sends `knock`;
  - an admit/decline dialog when `notify { kind: 'knock' }` arrives;
  - a "This room is full" notice on `correct` with reason `full`.

  Import it from `src/main.ts`
- [X] T065 [US2] Make the area label work in every view (Constitution II). Add a DOM banner `#areaBanner` in `index.html` and `src/office-ui.ts` showing "<area name> · <occupants>" while the player is inside a private area. It replaces the canvas label from T029 in first-person mode, and the lit border stays 2D-only, as the spec's Edge Cases allow
- [X] T068 [US2] Add the large-meeting video cap (FR-011a). In `src/media.ts`, detect speaking with an `AnalyserNode` on the local mic (RMS above a threshold for 300 ms) and send `media { speaking }` on change, at most once per second. In `server/links.ts`, keep a recent-speaker order per area conversation. When an area meeting has more than 8 members, include `conversation.video` (≤ 6 ids, most recent speaker first). In `src/media.ts`, send the video track only when the local player is in `video` (or `video` is absent), and leave other members audio-only. `src/callPanel.ts` shows avatars for members without video
- [X] T069 [US2] Add an admin panel in `src/office-ui.ts`, shown only when `welcome.isAdmin`. It edits a restricted area's allow-list (a member picker that sends `admin { op: 'areaAllowed' }`). Later stories add controls to it (T070, T071)
- [X] T031 [US2] Add client-side entry prediction to `update()` in `src/main.ts`. Before applying a move that changes `areaAt`, check the latest `OfficeSnapshot` (capacity/restricted) and refuse the move locally with the same notice. Handle `correct` by snapping `me.x/y` and showing its reason

**Checkpoint**: US1 and US2 both work independently.

---

## Phase 5: User Story 3 - Personal desks in an open-plan office (Priority: P3)

**Goal**: People can claim, lock, invite to and walk back to their desk. Desks are grouped into ambient or cubicle pods, and claims persist across restarts.

**Independent Test**: quickstart.md Scenario 3.

### Tests for User Story 3

- [X] T032 [P] [US3] Write `tests/unit/desks.test.ts`. It checks that:
  - `deriveDesks` finds one desk per chair tile `h` next to a desk tile `d` inside each pod, with ids `<podId>:<x>,<y>`;
  - every pod has at least 1 desk;
  - desk tile sets do not overlap;
  - `validateOffice` throws when pods overlap a private area
- [X] T033 [P] [US3] Write `tests/unit/office-desks.test.ts`. It checks that:
  - a claim takes a free desk and releases the member's previous one;
  - ephemeral `eph-*` members cannot claim;
  - lock is allowed only while standing in one's own desk area;
  - leaving or disconnecting auto-unlocks;
  - an uninvited player entering a locked desk area gets `locked`;
  - claims with no free desk return an error notice
- [X] T034 [P] [US3] Write `tests/unit/store.test.ts`. It checks that a save→load round trip of `{ version: 1, deskClaims, podModes, areaAllowed }` works, unknown deskIds are dropped on load, and a write lands atomically via temp file + rename
- [X] T035 [P] [US3] Extend `tests/unit/proximity.test.ts`:
  - two players seated in the same ambient pod without a conversation link get one `ambient` link with context `pod:<id>`;
  - in a cubicle pod they get none;
  - two players inside one locked desk area form a `desk:<id>` conversation

### Implementation for User Story 3

- [X] T036 [US3] Add the following to `shared/map.ts`:
  - `DeskPod { id, name (≤ 25 chars), rects, mode: 'ambient' | 'cubicle' }`, and `DESK_PODS` covering the four `dddd/hhhh` clusters in the open office (rows 11–16);
  - `deriveDesks(): Desk[]`, where each desk has `{ id: '<podId>:<seatX>,<seatY>', podId, seat, tiles }`, and `tiles` = the seat, the adjacent `d` tiles and a 1-tile walkable ring, clipped to the pod;
  - `DESKS`, `deskAt(x, y)` and `podAt(x, y)`;
  - `validateOffice()`, which throws on overlaps. Call it at server start
- [X] T037 [US3] Create `server/store.ts`. `load(dataDir)` and `save(state)` handle `data/office-state.json` with the shape `{ version: 1, deskClaims: { [deskId]: { memberId, name, claimedAt } }, podModes, areaAllowed }`. Saves are debounced to 1 s and written to a temp file then renamed. Load enforces the invariants: one desk per memberId, and only existing deskIds
- [X] T038 [US3] Extend `OfficeState` in `server/office.ts` with:
  - `claim(member, deskId)` and `unclaim(member)`, persisted via store;
  - `lock` and `unlock`, valid only in one's own desk area. Locks are cleared when the owner leaves the area or disconnects;
  - `invite(owner, memberId)`, which adds to `deskGuests`;
  - pod modes (admin `podMode` op, persisted);
  - `checkEntry` returns `'locked'` for locked desk areas unless the player is the owner or a guest;
  - the snapshot includes `pods` and `desks` (owner name, online, status, locked)
- [X] T039 [US3] Extend `computeLinks` in `shared/proximity.ts` with desk contexts:
  - a player inside a desk area that is locked or in a cubicle-mode pod gets context `desk:<id>`, and everyone in that area forms one conversation;
  - seated players in the same ambient pod with no conversation link get `ambient` links with context `pod:<id>`. A player counts as **seated** when their tile is inside some desk's `tiles` (data-model Desk);
  - accept `office` input (`locks`, `podModes`) as a parameter so the function stays pure
- [X] T040 [US3] Route the US3 messages in `server/app.ts`:
  - `desk` ops (claim/unclaim/lock/unlock);
  - `deskInvite` sends `notify { kind: 'deskInvite' }` to the invitee;
  - `walkToDesk {}` sends `teleport { x, y, reason: 'desk' }` to the player's own seat. `walkToDesk { deskId }` teleports them to `nearestFreeTileNear` that desk's seat, but only when the desk's owner invited them (in `deskGuests`); otherwise it sends `notify { kind: 'error' }`. `nearestFreeTileNear` is added in T056; if US5 hasn't been built yet, add it here instead;
  - admin `podMode`;
  - broadcast `office` after any change, and load the store at start
- [X] T041 [P] [US3] In `src/render2d.ts`, draw owner name tags over claimed desks when hovering or within 2 tiles, a lock icon on locked desks, and a subtle highlight on the local player's own desk
- [X] T042 [US3] Extend `src/office-ui.ts` with:
  - a desk hover card (owner, status, "Claim desk" / "Unclaim desk" / "Lock" / "Unlock" / "Invite to desk" with a people picker);
  - a "No desks are free" notice;
  - the invite notification with a "Go there" action that sends `walkToDesk { deskId }`;
  - a "Walk to my desk" menu item and the shortcut `G`
- [X] T066 [US3] Add the first-person equivalents of the desk UI (Constitution II), following the spec's Edge Cases:
  - in `src/render3d.ts`, return floating owner-name labels above claimed desks, drawn with the existing label pipeline that name tags use;
  - in `src/office-ui.ts`, open the same desk card from T042 for the desk the player faces within 1.5 tiles, opened with the `E` key and shown with an on-screen hint, instead of on hover
- [X] T067 [US3] Write `tests/integration/ws-desk-privacy.test.ts` (Constitution III). A owns a desk and locks it, and invites B, who then enters. C stands right outside the desk area. Over 20 iterations, C must receive no `rtc`, no `chat` with scope `desk`, and no `links` naming A or B. Repeat with the pod switched to cubicle mode through admin `podMode`
- [X] T070 [US3] Add a pod-mode control (ambient/cubicle per pod) to the admin panel from T069 in `src/office-ui.ts`. It sends `admin { op: 'podMode' }`. If US2 was skipped, create the panel here
- [X] T043 [US3] Handle `teleport` in `src/main.ts` by setting `me.x/y` and calling `sendState(true)`. Feed `ambient` links through `gainFor` (already in T008). The call panel lists only `conversation` peers, while ambient peers play audio without tiles

**Checkpoint**: US1–US3 each work independently.

---

## Phase 6: User Story 4 - Create and use your own avatar sprites (Priority: P3)

**Goal**: Artists paint 4×4 sheets in any external tool, validate them with the CLI, and drop them in `sprites/`. Users then pick them, and everyone sees them in both views.

**Independent Test**: quickstart.md Scenario 4. This story can be built in parallel with US3 after Phase 2.

### Tests for User Story 4

- [X] T044 [P] [US4] Write `tests/unit/sprites.test.ts` against synthesized RGBA buffers. It covers:
  - valid 64×64 and 128×128 sheets → OK;
  - 60×60 → `bad-size`;
  - an opaque corner → `no-alpha`;
  - a blank frame at row 2, col 1 → `empty-frame:2,1`;
  - a sidecar `layer: 'hat'` → `bad-layer`;
  - an id `Robot_1` → `bad-id`;
  - a file > 256 KB → `too-large`

### Implementation for User Story 4

- [X] T045 [US4] Create `shared/sprites.ts` with:
  - `FORMAT_VERSION = 1`, `COLS = 4`, `ROWS = 4`;
  - `ROW_DIRS = ['down','left','right','up']`;
  - `FRAME_SIZES = [16, 32]`, `MAX_BYTES = 256 * 1024`;
  - `LAYERS = ['full','body','bottom','top','hair','accessory']` and `LAYER_ORDER = ['body','bottom','top','hair','accessory']`;
  - `ID_RE = /^[a-z0-9-]+$/`;
  - `validateSheet(rgba, w, h, bytes?)`, which returns `{ ok: true, frameSize } | { ok: false, errors: string[] }` using exactly the error codes in `contracts/sprite-sheet.md`;
  - `validateSidecar(json, id)`, where `name` is ≤ 32 chars and defaults to the id, `layer` defaults to `'full'`, and `author` is optional
- [X] T046 [P] [US4] Create `tools/sprite-template.ts` (`npm run sprites:template [--size 16|32] [--out file.png]`). Using `pngjs`, it writes a transparent 4×4 sheet with faint 1-px grid lines and a tinted row band per direction. Default output is `sprites/template.png`
- [X] T047 [P] [US4] Create `tools/sprite-check.ts` (`npm run sprites:check <file.png>…`). It decodes each file with `pngjs` (decode failure → `not-png`), runs `validateSheet` and, when `<id>.json` exists next to it, `validateSidecar`. It prints `OK <file>` or `<file>: <codes>`, and exits 1 if any sheet fails
- [X] T048 [P] [US4] Copy `specs/001-gather-office-spaces/contracts/sprite-sheet.md` to `sprites/FORMAT.md`. Add the example character `sprites/robot.png` + `sprites/robot.json` (`{ "name": "Robot", "layer": "full", "author": "shyft" }`), produced by a small generator `tools/sprite-example.ts` that paints a simple 16×16 robot in all 16 frames. Generate `sprites/template.png` with T046
- [X] T049 [US4] Create `server/sprites.ts`. `loadSprites(dir)` scans `*.png`, rejects ids failing `ID_RE` or duplicating another, then validates (logging and skipping invalid sheets with their codes). It builds `SpriteIndex` entries `{ id, name, layer, author?, frameSize, url: '/sprites/<id>.png' }`
- [X] T050 [US4] Wire sprites into `server/app.ts`:
  - serve `GET /sprites/index.json`, `GET /sprites/<id>.png` (valid ids only, `image/png`), `/sprites/template.png` and `/sprites/FORMAT.md`;
  - include `sprites` in `welcome`;
  - admin `reloadSprites` reloads and broadcasts `sprites`;
  - validate `AvatarChoice` on `join` and `avatar` (unknown sheet ids, or a layer that does not match its slot, fall back to built-in), and broadcast a `presence { avatar }` delta
- [X] T051 [US4] Add the following to `src/art.ts`:
  - `avatarFromSheet(img: HTMLImageElement): Avatar`, which slices the 4×4 grid by `ROW_DIRS` and downscales 32→16 with nearest-neighbour when `frameSize === 32`, producing `frames` and `tex` exactly like `makeAvatar`;
  - `avatarFromLayers(imgs: Partial<Record<Layer, HTMLImageElement>>)`, which composites per `LAYER_ORDER` and then calls the same slicer;
  - `loadAvatar(choice, index): Promise<Avatar>`, which caches images by URL and falls back to `makeAvatar(look)` on error
- [X] T052 [US4] Extend the join screen in `src/join.ts` and `index.html` with a character picker:
  - a "Built-in" tab (the existing swatches) and a "Custom" tab listing `full` sheets plus per-layer selectors for `body/bottom/top/hair/accessory` from the `/sprites/index.json` fetch;
  - the spinning preview uses `loadAvatar`;
  - the chosen `AvatarChoice` is saved in the profile
- [X] T071 [US4] Add a "Reload sprites" button to the admin panel in `src/office-ui.ts`. It sends `admin { op: 'reloadSprites' }` and shows the number of sheets loaded, plus any rejected files with their error codes; the server includes these in the `sprites` reply. If no admin panel exists yet, create it here
- [X] T053 [US4] In `src/main.ts`, make `toPlayer` and the `presence { avatar }` handler resolve avatars through `loadAvatar` (show the built-in look until the image loads). Confirm `src/render2d.ts` and `src/render3d.ts` need no changes, since both consume the `Avatar` interface

**Checkpoint**: Custom characters work in 2D and first-person for every viewer.

---

## Phase 7: User Story 5 - Status and getting someone's attention (Priority: P4)

**Goal**: Users can set Available, Busy or DND, with an expiry and a text status. DND blocks automatic meetings. Users can ring someone, who teleports to them on accept, and wave at someone.

**Independent Test**: quickstart.md Scenario 5.

### Tests for User Story 5

- [X] T054 [P] [US5] Write `tests/unit/status.test.ts`. It checks that:
  - the status text is clamped to ≤ 60 chars;
  - an `until` in the past is rejected;
  - an expired status reverts to `available` on tick;
  - `nearestFreeTileNear(x, y, occupied)` returns a walkable, non-occupied tile adjacent to the caller
- [X] T055 [P] [US5] Extend `tests/integration/ws-links.test.ts`. It checks that:
  - a DND client next to another receives empty `links`;
  - `ring` → `ringReply { accept: true }` makes the recipient receive `teleport { reason: 'ring' }` next to the caller, and after it sends that position both receive conversation `links`

### Implementation for User Story 5

- [X] T056 [US5] Add `nearestFreeTileNear(x, y, occupied: Set<string>)` to `shared/map.ts`. It does a BFS over non-blocking tiles, stays in the caller's context (does not cross into private areas), and has a maximum radius of 3
- [X] T057 [US5] Handle the US5 messages in `server/app.ts`:
  - `status` (clamp text, validate `until`, broadcast a `presence` delta);
  - expire statuses on the LinkEngine tick;
  - `ring` sends `notify { kind: 'ring' }` to the target;
  - on an accepted `ringReply`, compute the tile and send `teleport` to the recipient plus `notify { kind: 'ringResult', ok }` to the caller;
  - `wave` sends `notify { kind: 'wave' }`
- [X] T058 [P] [US5] Create `src/status.ts` with:
  - a status picker in the HUD (Available, Busy, Do Not Disturb, durations 15/30/45 min, and a text field up to 60 chars) that sends `status`;
  - the DND shortcut `Ctrl+U` (`⌘+U` on macOS), matching Gather. `Shift+D` is not used because Shift is "run" and D is "move right";
  - entering DND calls `media.setLocal({ mic: false, cam: false })` and disables the toggles;
  - ring and wave buttons in the people list (`renderPeople` in `src/main.ts`);
  - incoming ring and wave toasts with Accept/Decline and Wave back
- [X] T059 [P] [US5] Draw status dots on avatars: green for available, yellow for busy, red for DND. Do this in `src/render2d.ts` (next to the name tag), `src/render3d.ts` (above billboards) and the people list in `src/main.ts`

**Checkpoint**: All five stories work independently.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T060 [P] Create `tools/bots.ts` (`npm run bots -- --count 25 --groups 5x5`). Each headless `ws` client joins with a random memberId, walks to its assigned cluster, and asserts that its `links` match its group. It prints any mismatch, and the server-logged tick time is checked to stay ≤ 20 ms (SC-006)
- [X] T061 [P] Update `README.md` with the new controls (`M`/`C` mic/cam, `G` walk to desk, `E` desk actions in first person, `Ctrl/⌘+U` DND), meetings/areas/desks, `ADMIN_TOKEN` and `?admin=`, TURN env vars, the HTTPS note for LAN, and the sprite workflow (link `sprites/FORMAT.md`)
- [X] T062 Re-check the implementation against the "Constitution Check" table in `specs/001-gather-office-spaces/plan.md` (constitution v1.0.0, Principles I–V). Confirm that T025 and T067 pass (III), that T065 and T066 work in first-person (II), and that T045–T050 are in place (IV). Record any deviation in Complexity Tracking
- [X] T063 Run `npm run typecheck` and `npm test`, and fix any failures
- [X] T064 Walk through `specs/001-gather-office-spaces/quickstart.md` Scenarios 1–5 and the load sanity check by hand, and record the results in a new `specs/001-gather-office-spaces/checklists/validation.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: depends on Setup and blocks every story. Internal order:
  1. T005;
  2. T006, then T007 and T008 (same file, sequential), then T009;
  3. T010, then T011, T013, T014, then T015;
  4. T012, T016 and T017 in parallel once their prerequisites exist
- **US1 (Phase 3)**: after Phase 2
- **US2 (Phase 4)**: after Phase 2. Only the call panel from US1 is reused, for room meetings to be visible and audible
- **US3 (Phase 5)**: after Phase 2. It extends `server/office.ts` from US2 (T026), so do US2 first or create `office.ts` here if US2 is skipped
- **US4 (Phase 6)**: after Phase 2 and independent of US1–US3, so it can run in parallel
- **US5 (Phase 7)**: after Phase 2. Its DND link exclusion is already in T008, and its ring flow benefits from US1 for the visible result
- **Polish (Phase 8)**: after the desired stories

### Story Completion Order

```text
Setup → Foundational ─┬─> US1 (MVP) ─> US2 ─> US3 ─> US5
                      └─> US4 (parallel track)
```

### Within Each Story

Write the tests first and confirm they fail. Then build shared logic, server modules, server routing, client UI, and finally client wiring in `src/main.ts`.

---

## Parallel Examples

### Phase 2

```text
T009 tests/unit/proximity.test.ts   |  T012 src/join.ts memberId   |  T016 tests/integration/helpers.ts
```

### User Story 1

```text
T018 tests/integration/ws-links.test.ts   |   T021 src/callPanel.ts
(then T019 → T020 src/media.ts, then T022 → T023 src/main.ts + server/app.ts)
```

### User Story 3

```text
T032 tests/unit/desks.test.ts | T033 tests/unit/office-desks.test.ts | T034 tests/unit/store.test.ts | T035 proximity tests
```

### User Story 4 (alongside US2/US3)

```text
T044 tests/unit/sprites.test.ts | T046 tools/sprite-template.ts | T047 tools/sprite-check.ts | T048 sprites/ assets
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1, then Phase 2: the link engine and tests are green.
2. Phase 3 (US1). **Stop and validate** with quickstart Scenario 1 using two Chrome profiles.
3. Demo: walking up to someone opens a call.

### Incremental Delivery

1. US1, then US2 (meeting rooms), then US3 (desks), then US5 (status). Validate each against its quickstart scenario before moving on.
2. US4 (custom sprites) can ship at any point after Phase 2.

### Notes

- [P] tasks touch different files and do not depend on incomplete tasks.
- `src/main.ts` and `server/app.ts` are hot spots that many tasks edit, so tasks touching them are deliberately left without [P].
- Commit after each task or logical group, and run `npm test` before each commit (Constitution: Development Workflow).

## Phase 9: Convergence

- [X] T072 CRITICAL: Validate and bound desk invitations in `server/app.ts` (`deskInvite` handler) and `server/office.ts` (`OfficeState.invite`): require `memberId` to match the member-id format already used for `join` (a UUID, or `eph-<number>`), at most 40 characters, and cap a desk's invited guests at 50 (return the error "Too many invitations." beyond that). Add cases to `tests/unit/office-desks.test.ts` for an oversized id, a malformed id, and the 51st guest per Constitution III (partial)
- [X] T073 Make a dropped participant disappear within 10 seconds: add a `pingMs` option to `ServerOptions` in `server/app.ts` (default 5000, used for the ping interval so a silent connection is terminated within about 10 s); in `src/media.ts` start a 5 s timer when a peer's `iceConnectionState` becomes `disconnected`, clear it on `connected` or `completed`, and when it fires hide that peer's stream from `streams()` and call `onChange` so the tile shows the avatar instead of a frozen picture. Add an integration test in `tests/integration/ws-links.test.ts` that starts a server with `pingMs: 100`, connects a client that never answers pings (create its `WebSocket` with `autoPong: false`), and checks the other client receives `leave` and updated `links` within 1 s per Spec Edge Cases "Disconnects" (partial)
- [X] T074 Keep a conversation going when a device is lost: in `src/media.ts`, when the local audio or video track fires `ended`, stop and clear it, call `replaceTrack(null)` on every peer's sender, and `onChange`; in `src/main.ts` react by clearing `wantMic` or `wantCam`, updating the Mic and Cam buttons, re-sending `{ t: 'media', mic, cam }`, and showing a notice such as "Your camera was disconnected. Your microphone is still on." The other device and the call must keep working. Add a "unplug a device" step to Scenario 1 of `specs/001-gather-office-spaces/quickstart.md` per Spec Edge Cases "Device changes" (missing)
- [X] T075 Show the owner's status on a desk's hover label: add `status` (the owner's `PlayerStatus`) to `DeskTag` in `src/office-ui.ts` and pass the status colour to `drawNameTag` as the `dot` argument in `src/render2d.ts`, and add the status note (when set) to the first-person marker text from `deskMarkers()`. Record in `specs/001-gather-office-spaces/plan.md` Complexity Tracking that the desk card opens on click while the label appears on hover (T042 said "hover card") per FR-019 (partial)
- [X] T076 Flag duplicate character display names: in `server/sprites.ts` `loadSprites`, when two valid sheets in the same layer share a name (ignoring case), keep both but add an entry to a new `warnings: { file: string; warning: string }[]` result field (for example `duplicate-name:Robot (also robot2.png)`) and log it with `console.warn`; add `warnings?` to the `sprites` message in `shared/protocol.ts`, send it to the admin with `rejected`, and list it in the admin panel's "Custom characters" section in `src/office-ui.ts`. Add a case to `tests/unit/sprite-loader.test.ts` per Spec Edge Cases "Sprite edge cases" (missing)
- [X] T077 Let people change their character after joining: move the picker logic out of `showJoinScreen` in `src/join.ts` into a reusable function, add a "Character" button to the HUD in `index.html` that opens it as an overlay without leaving the office, send `{ t: 'avatar', avatar }` on confirm and update the saved profile, and make sure the presence echo updates the player's own avatar through `applyAvatar` in `src/main.ts`. Add a "change character" step to Scenario 4 in `quickstart.md` per FR-029 and US4/AC2 (partial)
- [X] T078 Explain blocked camera and microphone access when a conversation opens: in `src/main.ts`, on the first `links` message that opens a conversation, query `navigator.permissions.query` for `microphone` and `camera` (inside try/catch, since not every browser supports those names), and if either is `denied` show one notice per session saying access is blocked, how to allow it in the browser's site settings, and that chat still works. Add a step to Scenario 1 of `quickstart.md` per US1/AC5 (partial)
