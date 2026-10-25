# Implementation Plan: Gather-Style Desks, Office Spaces and Proximity Meetings

**Branch**: `001-gather-office-spaces` | **Date**: 2026-10-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-gather-office-spaces/spec.md`

## Summary

Turn Shyft Office's walk-around map into a Gather-style office.
- **Meetings**: walking within 3 tiles of someone opens a live audio/video conversation. Chained neighbors join, and
  volume fades with distance.
- **Private areas**: meeting rooms and other private areas hold a single room-wide meeting that nobody outside can
  hear or see.
- **Desks**: the open-office desks become claimable, lockable home bases grouped into ambient or cubicle pods.
- **Avatars**: users can wear custom avatars painted in any external pixel-art tool, using a documented 4×4 sprite
  sheet.

The server stays authoritative over *who is connected* and computes a per-player link graph from positions, areas,
desks and status. Clients set up browser-to-browser WebRTC (a mesh, with signaling over the existing WebSocket) to
match their links, and set per-peer volume locally. Behavior is based on an REA capture of gather.town's client (see
[research-gather.md](./research-gather.md)). Technical decisions are in [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.9 (strict), Node 20+ (server is run with `tsx`), ES2022 in the browser

**Primary Dependencies**:
- existing: `ws`, `vite`, `tsx`, `concurrently`
- new runtime: `pngjs`, for server and CLI sprite validation
- new dev: `vitest`
- browser APIs: WebRTC, getUserMedia, Web Audio

**Storage**: a JSON file `data/office-state.json` (desk claims, pod modes, area allow-lists), written atomically.
Sprite files live in `sprites/`.

**Testing**: Vitest for unit tests (shared logic, server modules) and a WebSocket integration test against an
in-process server. Camera, mic and visuals are checked by hand with [quickstart.md](./quickstart.md).

**Target Platform**: desktop Chromium, Firefox and Safari (current versions). The Node server runs on macOS or Linux.

**Project Type**: a real-time web application. One repo holds a Node WebSocket/static server and a Vite client that
share a `shared/` module.

**Performance Goals**:
- conversation connects or disconnects within 2 s (SC-001/002);
- server link tick ≤ 20 ms at 25 players (SC-006);
- client stays at 60 fps with up to 7 remote video tiles.

**Constraints**:
- membership and privacy are enforced on the server (FR-011/012);
- camera and mic need a secure context;
- the mesh limits groups to about 8 video peers (research R1);
- there is no auth: identity is a client UUID, and the admin role comes from an env token.

**Scale/Scope**: one office, about 25 people online at once, and up to 5 conversations of about 6 people.
The current map is 40×28 tiles with 2 meeting rooms and about 16 desks.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Checked against constitution **v1.0.0**.

| Principle | Status | How the design complies |
|---|---|---|
| I. Gather Parity, Original Assets | ✅ | Behavior is modeled on REA observations in [research-gather.md](./research-gather.md), each marked observed, inferred or unknown. No Gather assets are used. Deviations (open-area cap of 8, 4×4 sprite layout) are listed in the spec's Assumptions. |
| II. One World, Many Views | ✅ | Areas, desks and pods are defined once in `shared/map.ts`. Avatars go through the shared `Avatar` interface (`avatarFromSheet`). First-person equivalents for area labels and desk tags are tasks T065–T066, and the remaining degradation is stated in the spec's Edge Cases. Calls survive view switches (T022). |
| III. Server-Authoritative Presence and Privacy | ✅ | The server computes links (research R2) and relays call setup only along links (T015). Size-capped payloads and clamped inputs are covered in T011, T015 and T057. Mic and camera start off (T019). Leak tests cover both private contexts: areas (T025) and desks (T067). |
| IV. Open Sprite Pipeline | ✅ | Versioned format in `contracts/sprite-sheet.md`, with a template (T046), CLI validator (T047), server validation with error codes (T049) and built-in looks kept as the default (T052). |
| V. Simple to Run, Tested at the Core | ✅ | Direct browser-to-browser calls need no extra infrastructure; TURN is optional through env. Pure logic in `shared/` has unit tests. Every story has a quickstart scenario. The new dependencies `pngjs` and `vitest` are justified in research R7 and R9. |

*Post-design re-check*: passes, with no violations.

### Post-implementation re-check (all tasks T001–T063 built)

Checked against constitution v1.0.0 after implementation, with evidence rather than intent:

| Principle | Result | Evidence |
|---|---|---|
| I. Gather Parity, Original Assets | ✅ Pass | Behaviour is traced to observations in [research-gather.md](./research-gather.md). The repository holds no Gather art, audio or branding: the only images are the generated `sprites/robot.png` and `sprites/template.png`, and the only mention of Gather in shipped code is a comment. Deviations from Gather are in the spec's Assumptions (8-person cap, 4×4 sprite layout) and below. |
| II. One World, Many Views | ✅ Pass | Areas, desks, pods and collision live in `shared/map.ts`; both renderers and the server read them. Both renderers draw avatars through the one `Avatar` interface, so custom sprites needed no renderer change. First-person equivalents exist for the area banner (T065) and desk names and card (T066), and were seen working in a browser. Calls and chat are unaffected by switching views. |
| III. Server-Authoritative Presence and Privacy | ✅ Pass | The server computes every link and routes chat by position. `ws-privacy.test.ts` (T025) and `ws-desk-privacy.test.ts` (T067) pass, and each fails when the leak is deliberately reintroduced. Names, colours, positions, statuses, chat, call-setup frames (16 KB cap) and avatar choices are validated or clamped on the server, uploaded sheets are validated before anyone is shown them, and Do Not Disturb forces mic and camera off server-side. Mic and camera start off. |
| IV. Open Sprite Pipeline | ✅ Pass | One documented, versioned format ([contracts/sprite-sheet.md](./contracts/sprite-sheet.md), `sprites/FORMAT.md`, `FORMAT_VERSION = 1`); a template generator; a command-line checker that runs outside the app; server-side rejection with the contract's error codes; built-in art stays the default. Found during this check: the sheet metadata had no way to say which format version it targets, so it now accepts an optional `format` field and rejects unknown versions (`bad-format`). |
| V. Simple to Run, Tested at the Core | ✅ Pass | `npm install && npm run dev` starts the whole office, including the Vite proxy for `/ws` and `/sprites` (checked with 25 bots through it). Pure logic (proximity, areas, desks, store, status, sprites) has unit tests; every story has a quickstart scenario. The two added dependencies, `pngjs` and `vitest`, are justified in research R7 and R9. |

Typecheck and 136 tests pass.

## Project Structure

### Documentation (this feature)

```text
specs/001-gather-office-spaces/
├── spec.md
├── research-gather.md   # REA findings on gather.town (behavior reference)
├── research.md          # Phase 0: technical decisions
├── plan.md              # this file
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1: validation guide
├── contracts/
│   ├── protocol.md      # WebSocket v2 + HTTP sprite endpoints
│   └── sprite-sheet.md  # avatar sheet format v1 (also shipped as sprites/FORMAT.md)
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks), not created here
```

### Source Code (repository root)

```text
shared/
├── map.ts          # MODIFY: Zone→Area (capacity/restricted/allowed/highlight), DESK_PODS, derived DESKS, areaAt/deskAt
├── protocol.ts     # MODIFY: v2 messages per contracts/protocol.md
├── proximity.ts    # NEW: lineOfSight (tile DDA), computeLinks(players, office) → links + conversations (pure)
└── sprites.ts      # NEW: format constants, LAYER_ORDER, validateSheet(rgba,w,h) (pure; used by CLI, server, browser)

server/
├── index.ts        # MODIFY: thin entry point; reads env and calls startServer()
├── app.ts          # NEW: startServer(opts): routes messages, 200 ms tick, rtc relay gated on links, /sprites HTTP
├── links.ts        # NEW: per-player link diffing → `links` messages; DND/context rules
├── office.ts       # NEW: desk claims/locks/invites, pod modes, area occupancy, knock/admit, entry checks → `correct`
├── store.ts        # NEW: load/save data/office-state.json (debounced, atomic)
└── sprites.ts      # NEW: scan sprites/, pngjs decode + validate, build SpriteIndex

src/
├── main.ts         # MODIFY: wire media/panels/desk/status; handle correct/teleport/notify; chat scopes
├── net.ts          # unchanged (generic)
├── media.ts        # NEW: MediaTransport (mesh): getUserMedia, RTCPeerConnection per link, Web Audio gain per peer
├── callPanel.ts    # NEW: conversation panel (video tiles, mute/cam indicators, "Nearby" label, full notice)
├── office-ui.ts    # NEW: desk hover card, claim/lock/invite, walk-to-desk, area labels, knock/admit prompts
├── status.ts       # NEW: status picker, ring/wave notifications
├── render2d.ts     # MODIFY: private-area border highlight, desk owner tags, status dots
├── render3d.ts     # MODIFY: status dot on billboards (avatars already go through the Avatar interface)
├── art.ts          # MODIFY: avatarFromSheet(img) / avatarFromLayers(imgs) → existing Avatar interface
└── join.ts         # MODIFY: character picker lists built-in looks + custom sheets/layers; persists memberId

tools/
├── sprite-template.ts  # NEW: npm run sprites:template
├── sprite-check.ts     # NEW: npm run sprites:check
├── sprite-example.ts   # NEW: paints the example sprites/robot.png
└── bots.ts             # NEW: npm run bots (signaling-only load test)

sprites/            # NEW: FORMAT.md, template.png, example sheets (e.g. robot.png/json)
data/               # NEW, gitignored: office-state.json

tests/
├── unit/           # proximity, line of sight, hysteresis, desks derivation, office rules, sprite validation, store
└── integration/    # ws-privacy.test.ts: two/three scripted clients against an in-process server
```

**Structure Decision**: Keep the existing single-repo layout (`shared/`, `server/`, `src/`). New pure logic goes in
`shared/` so it can be unit-tested and used by both server and client. Server modules are split by concern
(links, office, store, sprites). Artist tooling lives in `tools/`, outside the site, as the user asked.

## Delivery Order (maps to spec priorities)

1. **Foundation**: protocol v2 types, `memberId`, Area/DeskPod map data, `proximity.ts` with tests.
2. **US1 (P1)**: link tick, `rtc` relay, `media.ts` mesh, `callPanel.ts`, distance gain. This is the MVP.
3. **US2 (P2)**: area contexts, border highlight and labels, scoped chat, capacity and restricted entry, knock/admit.
4. **US3 (P3)**: desk derivation, claims and persistence, walk-to-desk, lock and invite, ambient/cubicle pods.
5. **US4 (P3)**: sprite format, tools, server loading, `avatarFromSheet`, picker. This can run in parallel with 3.
6. **US5 (P4)**: status, DND exclusion, ring with teleport, wave.

## Open Items Carried Forward

- **FR-009 default**: lowered from 15 to 8 to fit direct browser-to-browser calls, and recorded in the spec. If
  larger groups are needed, swap in a media server (LiveKit) behind `MediaTransport`.
- Admin access is through a token in the URL. Real auth is a follow-up feature.

## Complexity Tracking

No constitution violations. These are the places the build departs from the plan or the task text, and why:

| Departure | Why |
|---|---|
| Browser-side refusal of walking into a restricted room or a locked desk only starts after the server has turned the player away once (full rooms are predicted at once). | A browser does not hold the allow-lists or invitations, and sending them to everyone would leak who may enter where. The server still decides; a 3 second memory in the browser stops notice spam. |
| The first-person desk key is `F`, not `E` (T066). | `E` already turns the camera right in first person. |
| The desk card (claim, lock, invite) opens on click, while the owner's name, status dot and note appear on hover (T042 said "hover card"). | A hover that changes as the mouse moves cannot hold buttons you need to click; a label on hover and a card on click gives both. Spec FR-019 needs the name and status on hover, which the label now shows. |
| Each tile of floor around a desk goes to the nearest desk, instead of every desk getting a full one-tile ring (T036). | Chairs sit side by side, so full rings would overlap, which the data model forbids. |
| Sheet URLs end in `?v=<hash>` (T049). | A replaced sheet must be fetched again after an admin reload; the contract's plain path would be cached by browsers. |
| An accepted ring is declined, with a reason, when it would put someone where they would be turned away (T057). | Accepting a ring must not be a way past a restricted room or a locked desk. |
| The load check measures the server's link recompute time only when it starts its own server (T060). | A remote server's timings are only in its own log. |
| `bad-sidecar` and `bad-format` were added to the sprite error codes. | The checker needs a code for unreadable metadata, and format versioning needs one for an unknown version. |
