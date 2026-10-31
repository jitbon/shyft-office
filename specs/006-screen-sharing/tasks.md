---

description: "Tasks for screen sharing (share your screen with the people in your conversation)"
---

# Tasks: Screen Sharing

**Input**: design documents in `specs/006-screen-sharing/`: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/protocol.md](contracts/protocol.md), [contracts/ui-behavior.md](contracts/ui-behavior.md) and [quickstart.md](quickstart.md)

**Tests**: included. Constitution V asks for unit tests of deterministic logic. Constitution III asks for a test proving that a private context does not leak, and this feature adds a new thing to keep private. Write each story's tests before its code and see them fail first.

**Organization**: tasks are grouped by user story.
- US1 (share and watch) and US2 (only the conversation sees it) are both P1. US2's server side is foundational, because US1 cannot ship without it, so its rules and registry come first in Phase 2. US2's own phase holds the privacy tests and the client-side "conversation links only" attach.
- US3 (several shares) is P2. US4 (sound) is P3.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US4 from spec.md
- Paths are relative to the repository root

## Notes for every task

- **The server decides the audience.** Share info goes out only inside `ConversationInfo.shares` (in the existing per-member `links` message), and `shareState` only to the sharer. If a task seems to need a broadcast, stop: something is wrong (research R4).
- **No renegotiation for a share.** Screen slots are added once when a peer connection opens, in the order voice, camera, screen video, screen audio, on both sides. Starting and stopping is `replaceTrack` only (R3).
- **Screen tracks never go into `peer.stream`.** They go into `peer.screen`, because a Web Audio source plays only the first audio track of a stream (R3).
- **Nothing starts a share except the sharer's click** (FR-003). `getDisplayMedia` is called directly inside the click handler (a user gesture is required).
- **Mic and camera behavior is untouched.** Big-meeting video limits (`conversation.video`) never hide a share.
- **Pure modules take plain data.** `shared/screen-share.ts` and the `stagePlan` export of `src/shareStage.ts` use no DOM or timers at load.
- **Existing behavior stays.** The full suite (566 tests at the start) must pass after every phase.
- **Rebuild before checking in a browser** (`npm run build`). The test server serves `dist/`.

---

## Phase 1: Setup

- [X] T001 Confirm the baseline: `npm run typecheck` is clean and `npm test` passes (566 tests in 73 files). Record both numbers in specs/006-screen-sharing/checklists/validation.md (create it with a first heading) so the end of the feature can be compared.
- [X] T002 [P] Add the protocol types to shared/protocol.ts (contracts/protocol.md):
  - `ShareInfo { shareId: string; sharer: string; startedAt: number; audio: boolean; w: number; h: number }`;
  - an optional `shares?: ShareInfo[]` on `ConversationInfo`, documented "Members' running screen shares, oldest first. Omitted when there are none.";
  - the `ClientMsg` variants `{ t: 'share'; on: true; audio: boolean; w: number; h: number }` and `{ t: 'share'; on: false }`;
  - the `ServerMsg` variant `{ t: 'shareState'; on: boolean; shareId?: string; reason?: 'full' | 'dnd' | 'left' | 'stopped' }`.
  `npm run typecheck` must stay clean (add `default` or ignore branches where an exhaustive switch complains).
- [X] T003 [P] Add `screen` (a monitor outline) and `screenOff` (the same with a slash) icons to src/icons.ts in the style of the existing `mic` and `cam` icons, and extend the icon name type.

---

## Phase 2: Foundational (pure rules and the server registry)

**Purpose**: the rules every story needs, and the server state that keeps shares scoped (US2's core, needed before US1 can ship).

### Tests (write first, see them fail)

- [X] T004 [P] Write tests/unit/screen-share-rules.test.ts for `shareKeeps(origin, now)` (data-model "Place rule"):
  - `false` when `now.dnd`;
  - `false` when `now.context !== origin` (open → `area:a`, `area:a` → open, `desk:d1` → `desk:d2`);
  - `false` when `context === 'open' && !inConversation && !atDesk`;
  - `true` when open and in a conversation;
  - `true` when open, alone and `atDesk`;
  - `true` in the same `area:` while alone;
  - `true` in the same `desk:` while alone.
- [X] T005 [P] Write tests/unit/screen-bitrate.test.ts for `screenBitrate(receivers)`. It is `clamp(6_000_000 / max(1, receivers), 400_000, 2_500_000)`:
  - 0 and 1 give 2_500_000;
  - 2 gives 2_500_000;
  - 3 gives 2_000_000;
  - 7 gives 857_142 (floored to an integer);
  - 20 gives 400_000;
  - the result is always an integer.
- [X] T006 [P] Write tests/unit/share-validate.test.ts for `validateShareMsg(raw)` (data-model "Validation"):
  - `on` must be a boolean, or the result is null;
  - `{on:false}` passes with nothing else;
  - for `on: true`, `w` and `h` must be numbers, are rounded and clamped to 1–8192, and a missing or non-number `w`/`h` gives null;
  - `audio` defaults to false and any non-`true` value is false;
  - NaN and Infinity give null;
  - extra fields are dropped.
- [X] T007 [P] Write tests/unit/share-registry.test.ts for `ShareRegistry` in server/shares.ts (data-model "Share"):
  - `start(sharer, {audio,w,h}, origin, members, now)` creates a record with `shareId` `${sharer}:1`, then `:2` on the next start after a stop;
  - starting while active only updates `audio`/`w`/`h` and keeps `shareId` and `startedAt`;
  - a start is refused with `'full'` when 3 shares already run among `members` (`MAX_SHARES = 3`), and is not refused when those 3 belong to non-members;
  - `stop(sharer)` removes it;
  - `sweep(placeOf)` removes every share whose `shareKeeps(origin, placeOf(sharer))` is false and returns `[{ sharer, reason: 'left' | 'dnd' }]`;
  - `sharesOf(members)` returns `ShareInfo[]` oldest first, without `origin`.

### Implementation

- [X] T008 Create shared/screen-share.ts with these exports (no DOM, no timers). Make T004–T006 pass:
  - `MAX_SHARES = 3`;
  - `SCREEN_BUDGET_BPS = 6_000_000`;
  - `SCREEN_MIN_BPS = 400_000`;
  - `SCREEN_MAX_BPS = 2_500_000`;
  - `interface SharePlace { context: LinkContext; inConversation: boolean; atDesk: boolean; dnd: boolean }`;
  - `shareKeeps(origin, now)`;
  - `screenBitrate(receivers)`;
  - `validateShareMsg(raw): { on: false } | { on: true; audio: boolean; w: number; h: number } | null`.
- [X] T009 Create server/shares.ts with `ShareRegistry` (a per-sharer counter for `shareId`, a `Map<sharer, ShareRecord>` with `origin: LinkContext`). Make T007 pass. Use `MAX_SHARES` and `shareKeeps` from shared/screen-share.ts. `sweep` takes a `placeOf(sharer) => SharePlace | null` function, and `null` (player gone) removes the share silently.
- [X] T010 In server/links.ts, give `LinkEngine` an optional constructor argument `shares: (members: string[]) => ShareInfo[] = () => []`. When building each member's `ConversationInfo`, add `shares` only when non-empty. It is part of the existing `sig` JSON, so a start, stop or resize is sent on the next update. Extend tests/unit/links-video.test.ts (or a new tests/unit/links-shares.test.ts) to check:
  - a conversation member's info carries the shares;
  - a player in no conversation gets `conversation: null` and so no shares;
  - an unchanged share list does not resend.
- [X] T011 In server/app.ts, wire the registry:
  - create `const shares = new ShareRegistry()`, and pass `(members) => shares.sharesOf(members)` to the `LinkEngine`;
  - add a `placeOf(id)` helper that builds `SharePlace` from the player's `x`/`y` with `positionContext(x, y, id, officeInput)` (the same `OfficeInput` the link engine uses), `links.conversationMembers(id).length > 0`, `deskAt(x, y) !== null` and `status.kind === 'dnd'`;
  - in `links.beforeUpdate` (after the existing work), call `shares.sweep(placeOf)` and, for each ended share, `sendTo(sharer, { t: 'shareState', on: false, reason })`.
  - The sweep must run *after* the link recompute it depends on. If `beforeUpdate` runs too early for `conversationMembers`, add an `afterUpdate` hook to `LinkEngine` and sweep there, then call `links.update()` again only when something was removed.

**Checkpoint**: `npm test` is green, and the server can hold, scope, cap and end shares.

---

## Phase 3: User Story 1 - Share your screen with the people you're talking to (Priority: P1) 🎯 MVP

**Goal**: one member shares a screen, window or tab from the call panel. Everyone in the conversation sees it large, readable and smooth. Stop works from the panel and from the browser's own bar.

**Independent Test**: quickstart Q1. Two members side by side; A shares a text window; B sees it large within 3 s; A stops; B's view closes within 2 s; cancelling the picker shows nothing.

### Tests (write first, see them fail)

- [X] T012 [P] [US1] Write tests/integration/ws-share-lifecycle.test.ts (use `startTestServer` and `connectClient` from tests/integration/helpers.ts; place clients with `c.at(x, y)` as tests/integration/ws-video-cap.test.ts does):
  - A and B side by side on the open floor. A sends `{t:'share',on:true,audio:false,w:1920,h:1080}`. A gets `shareState {on:true, shareId}` and B's next `links` has `conversation.shares[0]` with `sharer === A.id`, `w:1920` and `h:1080`.
  - A sends a resize (`w:1280`). B gets the updated size.
  - A sends `{t:'share',on:false}`. A gets `shareState {on:false, reason:'stopped'}` and B's next `links` has no `shares`.
  - A shares, then moves far from B, alone, not on a desk. A gets `shareState {on:false, reason:'left'}`.
  - A shares and disconnects. B's next `links` has no `shares`.
  - A malformed `share` (`w:'big'`, or no `on`) changes nothing and is not echoed.

### Implementation

- [X] T013 [US1] In server/app.ts, handle `msg.t === 'share'`:
  - validate with `validateShareMsg`, dropping null;
  - rate-limit to 4 per second per connection, dropping extras;
  - for `on: false`, call `shares.stop(me.id)`, reply `shareState {on:false, reason:'stopped'}` and call `links.update()`;
  - for `on: true` with `me.status.kind === 'dnd'`, reply `shareState {on:false, reason:'dnd'}`;
  - otherwise call `shares.start(me.id, msg, positionContext(...), links.conversationMembers(me.id), Date.now())`. Reply `{on:false, reason:'full'}` on refusal, or `{on:true, shareId}` on success, then `links.update()`;
  - in `onClose`, call `shares.stop(c.p.id)`.
  Make T012 pass.
- [X] T014 [US1] In src/media.ts, extend the `MediaTransport` interface and `MeshTransport`:
  - add `screenVideoTx` and `screenAudioTx` to `Peer`, created in `open()` *after* the existing two, with `addTransceiver('video'|'audio', { direction: 'sendrecv' })`;
  - add `screen: MediaStream` on `Peer`. In `ontrack`, use the event's `transceiver`: tracks from the screen slots go to `peer.screen`, the rest to `peer.stream` as today;
  - add `setScreen(track: MediaStreamTrack | null, audio: MediaStreamTrack | null)`, which stores both and applies them;
  - in `applyTracks()` (and in `open()`), `replaceTrack` the screen slots with the stored tracks for peers whose current link kind is `'conversation'` and `null` otherwise. Keep the last `Link[]` from `setLinks` in a `kinds: Map<peer, LinkKind>`;
  - add `screens(): Map<string, MediaStream>`, the remote screen streams of non-lost peers that have a live, unmuted screen video track;
  - add `localScreen(): MediaStream | null`;
  - in `close()`, stop the stored screen tracks.
- [X] T015 [US1] In src/media.ts, add a `shareScreen(): Promise<{ ok: true; w: number; h: number; audio: boolean } | { ok: false; error: 'cancelled' | 'os' | 'unsupported' }>` helper (exported function, not on the interface). It calls `navigator.mediaDevices.getDisplayMedia` with the constraints in research R2: `{ video: { frameRate: { ideal: 30, max: 30 }, width: { max: 1920 }, height: { max: 1080 } }, audio: true, selfBrowserSurface: 'include', surfaceSwitching: 'include', systemAudio: 'include' }` (cast the options, since TypeScript's DOM types lack some members). It:
  - sets `contentHint = 'detail'` on the video track;
  - returns `unsupported` when `!isSecureContext || !navigator.mediaDevices?.getDisplayMedia`;
  - maps `NotAllowedError` that failed within 300 ms, or `NotReadableError`, to `os`, and any other `NotAllowedError` to `cancelled`;
  - returns the tracks to the caller through an out parameter or a returned `stream`.
- [X] T016 [US1] In src/callPanel.ts, add sharing controls to the panel's heading row (contracts/ui-behavior.md "Share screen control"):
  - a button with the states **Share screen**, **Sharing…** (disabled), **Stop sharing** (red) and **Unavailable** (disabled, with a `title` giving the reason);
  - `setShareControl(state: 'idle' | 'picking' | 'sharing' | { unavailable: string })` and an `onShare: () => void` constructor callback;
  - a "You are sharing" banner with a Stop sharing button and a 160 px wide muted `<video>` self-preview (`setSharingBanner(stream | null, alone: boolean)`). When `alone` is true, add "No one else is here yet";
  - a "sharing" mark (the `screen` icon) on a tile whose `TileInfo.sharing` is true (add the field).
  - The controls are part of the panel and hide with it when `render(null, …)` is called.
- [X] T017 [P] [US1] Create src/shareStage.ts with a `ShareStage` class for a single large share first (thumbnails come in US3). It is built in an element `#shareStage` inside the call overlay (add the element to index.html, before the tile strip):
  - `render(shares: { shareId, name, stream: MediaStream | null }[], large: string | null)` sets `srcObject` only when the track changes (no flicker, as `CallPanel.update` does);
  - the video is `object-fit: contain`;
  - a label shows "<name>'s screen";
  - the waiting state "Connecting to <name>'s screen…" shows until the video's first `loadeddata`;
  - the paused state "<name>'s screen is paused" shows when `requestVideoFrameCallback` (or a `timeupdate` fallback) sees no new frame for 3 s;
  - the stage is hidden when `large` is null.
  Add styles to src/style.css with the existing tokens: up to 70 vh tall, letterboxed on a dark surface.
- [X] T018 [US1] In src/main.ts, wire the flow:
  - **Clicking Share screen:** set `picking`, `await shareScreen()`. On `ok`, `media.setScreen(video, audio)` and `net.send({t:'share', on:true, audio, w, h})`. On `cancelled`, go back to idle silently. On `os`, show the notice "Your computer is blocking screen sharing. Allow screen recording for your browser in your system settings, then try again." On `unsupported`, set unavailable with the R2 reason.
  - **Video track `onended`** (the browser's Stop bar): send `{t:'share', on:false}`.
  - **Clicking Stop sharing:** the same as `onended`.
  - **`case 'shareState'`:**
    - `on: true`: set `sharing` and show the banner with `media.localScreen()`;
    - `on: false`: stop the local tracks, `media.setScreen(null, null)`, set idle, hide the banner, and show the notice for `left`, `dnd` or `full` with the exact texts in contracts/ui-behavior.md (none for `stopped`).
  - **Resize:** watch `track.getSettings()` once a second while sharing and send a resize `share {on:true,…}` when `width` or `height` changed.
  - **`refreshCallPanel()`:** feed `conversation?.shares` to the stage. The large share is the newest one whose sharer is not `me.id`. Streams come from `media.screens()`. Mark `sharing` on tiles. Never hide a share because of `conversation.video`.
- [X] T019 [US1] In src/media.ts, add the quality settings (research R5, R6) in a private `tuneScreen(peer)` called after a screen track is attached and whenever the number of conversation peers changes:
  - on the screen video sender, `setParameters` with `degradationPreference = 'maintain-resolution'`, `encodings[0].maxBitrate = screenBitrate(<conversation peers>)`, `maxFramerate = 30`, `priority = 'low'` and `networkPriority = 'low'`;
  - on the voice sender, `priority = 'high'` and `networkPriority = 'high'`;
  - in `open()`, call `screenVideoTx.setCodecPreferences` with VP9 first, then VP8 and H.264, from `RTCRtpReceiver.getCapabilities('video')`, only when that is available;
  - wrap each call in try/catch, so the share still works without them.

**Checkpoint**: quickstart Q1 passes in two Chrome windows. MVP is shippable once Phase 4 (US2) is green too.

---

## Phase 4: User Story 2 - A share only reaches the people in your conversation (Priority: P1)

**Goal**: the share goes exactly where the camera goes. Rooms, locked desks and ambient pods keep it out, and joining or leaving starts or stops it.

**Independent Test**: quickstart Q2 and the automated privacy test.

### Tests (write first, see them fail)

- [X] T020 [P] [US2] Write tests/integration/ws-share-privacy.test.ts (contracts/protocol.md "Privacy invariants"):
  - **Private room:** A and B in Meeting Room A (positions as in ws-video-cap.test.ts), C just outside its wall. A shares. Over the next 3 link ticks, none of C's `links` messages contains a `shares` entry naming A's `shareId`, and C receives no `shareState`.
  - **Locked desk:** A at their locked desk with invited B. C stands at the edge outside. C never sees A's share.
  - **Ambient pod:** A and B at neighbouring desks in an ambient pod, more than 3 tiles apart (only an `ambient` link between them). A shares. B's `links` has `conversation: null` (or no `shares`).
  - **Join:** C is admitted into the room (`knock` then `admit`). C's next `links` includes A's share.
  - **Leave:** B walks out of the room. B's next `links` has no shares, and A's share keeps running (A is still in the room).
  - **Sharer leaves the room:** A walks out. A gets `shareState {on:false, reason:'left'}`.
  - **DND:** A shares, then sends `status` DND. A gets `shareState {on:false, reason:'dnd'}`.
  - **rtc relay:** an `rtc` from C to A is still dropped (re-assert the existing guard).
- [X] T021 [P] [US2] Extend tests/unit/share-registry.test.ts with a test that `sweep` ends a share whose sharer's `placeOf` returns `dnd: true` with reason `'dnd'`, and one whose context changed with reason `'left'`.

### Implementation

- [X] T022 [US2] In server/app.ts, on a `status` change to DND, call `shares.stop` and send `shareState {on:false, reason:'dnd'}` at once, so the share doesn't wait for the next sweep. Make the DND part of T020 pass.
- [X] T023 [US2] Verify in src/media.ts that `setLinks` updates `kinds` *before* `applyTracks()`, so a peer whose link changes from `conversation` to `ambient` gets `null` on its screen slots in the same call. A peer that becomes `conversation` gets the screen tracks, and `tuneScreen` runs. Add a short comment there citing research R4.
- [X] T024 [US2] In src/main.ts, when `conversation` becomes null or loses a share, close full window if it was showing that share, and clear the stage within the same `links` handling (≤ 2 s target).

**Checkpoint**: T020 passes, and quickstart Q2 passes in three Chrome windows. **MVP (US1 + US2) is complete.**

---

## Phase 5: User Story 3 - Several sharers and choosing what to watch (Priority: P2)

**Goal**: up to 3 shares per conversation, the newest large, the others as thumbnails, the viewer's own pick, full window, and a self-preview only for your own share.

**Independent Test**: quickstart Q3.

### Tests (write first, see them fail)

- [X] T025 [P] [US3] Write tests/unit/stage-plan.test.ts for `stagePlan({ shares, selfId, picked }, prevIds)` (data-model "Viewer focus"):
  - with no shares, everything is null or empty;
  - with one share from someone else, it is `large`;
  - with your own share only, `large` is null and `selfPreview` is your shareId;
  - with A then B (B newer), `large` is B and `thumbs` is [A];
  - `picked: A` makes `large` A and `thumbs` [B];
  - `picked` naming an ended share is cleared and the newest takes over;
  - a new share C when `picked` is A keeps A large and `started` is [C];
  - your own share never appears in `large` or `thumbs`.
- [X] T026 [P] [US3] Add to tests/integration/ws-share-lifecycle.test.ts: three clients in one room each share and all succeed, a fourth gets `shareState {on:false, reason:'full'}`, and after one stops, the fourth's retry succeeds.

### Implementation

- [X] T027 [US3] In src/shareStage.ts, export the pure `stagePlan` and make T025 pass. Extend `ShareStage.render` to take the plan:
  - a 120 px tall thumbnail row (newest first), each a muted `<video>` labelled with the sharer's name;
  - clicking a thumbnail calls an `onPick(shareId)` callback;
  - a "<name> started sharing" cue for 3 s for each id in `started`;
  - a full-window button that calls `stageEl.requestFullscreen()`, with Esc handled by the browser. Leave full window when the large share ends.
- [X] T028 [US3] In src/main.ts, keep `picked` (in memory only), run `stagePlan` in `refreshCallPanel`, and pass names from `others`. Show the self-preview from `media.localScreen()` in the banner (already from T016). Make sure a click on the stage in first person releases pointer lock (`document.exitPointerLock()`), as the panel does.
- [X] T029 [US3] In src/callPanel.ts, disable the Share button with "Sharing is full here (3 people are sharing)" when `conversation.shares.length >= 3` and you are not one of the sharers. The server still decides (T013), and this only explains it in advance.

**Checkpoint**: quickstart Q3 passes.

---

## Phase 6: User Story 4 - Share sound with the screen (Priority: P3)

**Goal**: tab or screen sound reaches viewers, without distance fading, with each viewer's own mute and level.

**Independent Test**: quickstart Q5.

- [X] T030 [US4] In src/media.ts, when a track from `screenAudioTx` arrives:
  - attach `peer.screen` to its own muted `<audio>` element (the Chromium quirk, research R9);
  - create `peer.screenSource = ctx.createMediaStreamSource(peer.screen)` and `peer.screenGain`, and connect source → gain → `ctx.destination`, with **no** distance gain and no analyser;
  - add `setScreenGain(peer, gain)` to the interface;
  - disconnect both in `drop()`.
- [X] T031 [US4] In src/shareStage.ts, show a speaker button and a 0–1 slider on the large share's label only when its `ShareInfo.audio` is true. They call an `onScreenVolume(sharer, value)` callback, which src/main.ts forwards to `media.setScreenGain`. Keep levels in a `Map<shareId, number>` (default 1) in memory only, and drop the entry when the share ends.
- [X] T032 [P] [US4] Add a unit test to tests/unit/stage-plan.test.ts (or a small tests/unit/share-sound.test.ts for an exported `soundControlsFor(info)` helper) that a share with `audio: false` gets no sound controls and one with `audio: true` does.

**Checkpoint**: quickstart Q5 passes in Chrome. In Firefox and Safari, no sound controls appear.

---

## Phase 7: Polish & cross-cutting concerns

- [X] T033 [P] Add a "Screen sharing" bullet to README.md's "Using the office" section: share from the call panel, who sees it, up to 3 at once, full window, and sound in Chrome tabs. Remove "screen sharing" from the not-yet-built list near the end of README.md.
- [X] T034 [P] Check `npm run typecheck` and `npm test`. The full suite must pass, with the new unit and integration files on top of the 566 baseline. Record the numbers in specs/006-screen-sharing/checklists/validation.md.
- [X] T035 Run quickstart Q1–Q6 with `npm run build` and the Chrome driver (tools/e2e/cdp.mjs) using `--use-fake-ui-for-media-stream --auto-select-desktop-capture-source="Shyft share target"`. Read `framesPerSecond` and `frameWidth` from `getStats` for SC-002 and SC-003. Record pass or fail and the measured numbers per scenario in specs/006-screen-sharing/checklists/validation.md. Do a manual pass of Q5 (sound) and Q6.3 (insecure address), since they need a real picker or a LAN address.
- [X] T036 Check the 60 fps target (SC-007): with one share running, read the existing FPS overlay in 2D and first person on the sharer and a viewer, and record it in validation.md.
- [X] T037 Update specs/006-screen-sharing/research.md R1 with anything learned about Gather during implementation, and keep the "live REA capture" follow-up note if it was not done.

---

## Dependencies & execution order

- **Phase 1** (T001–T003): no dependencies. T002 and T003 run in parallel.
- **Phase 2** (T004–T011) depends on T002. Tests T004–T007 run in parallel. T008 comes before T009, and T009 before T010 and T011.
- **Phase 3, US1** (T012–T019) depends on Phase 2:
  - T013 makes T012 pass;
  - T014 comes before T015, and T015 before T018;
  - T016 and T017 can run in parallel with T014 and T015 (different files);
  - T019 comes after T014.
- **Phase 4, US2** (T020–T024) depends on T013 and T014. T020 and T021 run in parallel. US2 can be built alongside US1's UI tasks, but MVP needs both.
- **Phase 5, US3** (T025–T029) depends on US1 (T017, T018). The server cap is already in T009 and T013.
- **Phase 6, US4** (T030–T032) depends on T014 and T017. It is independent of US3.
- **Phase 7** depends on the stories that are included.

### Story completion order

```text
Setup → Foundational → US1 ─┬─▶ US2 ─▶ (MVP)
                            ├─▶ US3
                            └─▶ US4
```

## Parallel examples

- **Phase 2 tests together:** T004 (screen-share-rules), T005 (screen-bitrate), T006 (share-validate) and T007 (share-registry). They are four new files.
- **US1:**
  - T016 (callPanel.ts) and T017 (shareStage.ts, index.html, style.css) alongside T014 and T015 (media.ts);
  - T012 (integration test) alongside all of them.
- **US2:** T020 (ws-share-privacy) and T021 (registry unit additions).
- **US3 and US4** can be done by two people at once after US1. They touch shareStage.ts in different methods, so merge with care.

## Implementation strategy

1. **MVP = US1 + US2:** one person shares, the conversation sees it large and sharp, and nobody outside does. Ship after T024 with quickstart Q1, Q2 and Q4.
2. **Then US3:** several sharers, thumbnails and full window.
3. **Then US4:** shared sound, Chrome-first.
4. After each story, run the full suite and that story's quickstart scenario before moving on.

---

## Phase 8: Convergence

- [X] T038 Make the screen quality settings land on every viewer, including one who joins while a share is running, per FR-018 and plan: R5/R6 (partial). Today `tuneScreen()` and `prioritizeVoice()` run in `setLinks`/`open()` in src/media.ts, which is before the new peer connection is negotiated, and `setParameters(...).catch(() => {})` hides any rejection. Steps:
  - re-run both for a peer once its connection first reaches `connected` (in `oniceconnectionstatechange`);
  - if a `setParameters` call rejects, retry once with only `maxBitrate` and `maxFramerate`, so the bitrate budget still applies when a browser refuses `priority`, `networkPriority` or `degradationPreference`;
  - check in Chrome that a viewer who joins mid-share shows the expected `maxBitrate` in `sender.getParameters()`, and record it in specs/006-screen-sharing/checklists/validation.md.
- [X] T039 Measure how long a new call takes to connect now that the polite side waits up to `FIRST_OFFER_WAIT_MS = 1500` before offering, per Constitution "a proximity meeting connects or disconnects within 2 s" and US2/AC2 (partial). Time two members walking into range, in both join orders, in Chrome, from the `links` message to the first remote audio and camera frame. If either order is over 2 s, lower the wait or skip it once the other side's offer is known to be on its way, and record the numbers in specs/006-screen-sharing/checklists/validation.md.
- [ ] T040 Run quickstart Q1 and Q3 in Firefox and Safari as well as Chrome, per the constitution's Platforms and plan: R3/R3a (partial). It must cover two-way voice and camera as before, a screen share arriving on the screen slot and not in place of the camera, and stopping. `slotOf` in src/media.ts and the polite-side offer wait were only checked in Chrome. Fix any wrong slot mapping, and record the results per browser in specs/006-screen-sharing/checklists/validation.md.
- [ ] T041 Run the checks that headless Chrome could not do, per T035, US1/AC2, US1/AC3, US3/AC5, US4 and SC-005 (partial). Use a normal (headed) Chrome with the real picker. Record pass or fail for each in specs/006-screen-sharing/checklists/validation.md:
  - stopping from Chrome's own "Stop sharing" bar (Q1.5);
  - cancelling the picker (Q1.6);
  - Full window and Esc (Q3.3);
  - tab sound, with mute and the volume level, not faded by distance (Q5);
  - the throttled-upload voice-first check (Q4.2);
  - the insecure-address message (Q6.3);
  - sharing the office tab itself (Q6.4).
- [X] T042 In src/main.ts, keep a `shareState { on: false, reason: 'stopped' }` that answers an earlier Stop from ending a share started after it, per FR-002 and FR-003 (partial). Today `stopShareLocally()` runs for every `on: false`. If the member pressed Stop and then Share screen again before the reply came, it clears the new capture and sets `idle`, and the later `on: true` is then ignored as "late". The share would be running on the server with no banner. The fix: ignore `reason: 'stopped'` unless `shareStatus === 'sharing'` with no newer start pending, and add a unit test or a comment that names the sequence.
- [X] T043 In server/app.ts, refuse a `share { on: true }` whose place `shareKeeps` would end at once, per FR-009 and contracts/protocol.md (partial). For example, a sharer alone on the open floor and not at a desk. Reply `shareState { on: false, reason: 'left' }` and do not register the share, instead of accepting it and sweeping it one tick later. Add the case to tests/integration/ws-share-lifecycle.test.ts.
- [X] T044 Review the call-setup limit change (`MAX_RTC_BYTES` 16 KB → 48 KB in server/app.ts) against Constitution III "All client input MUST be validated and clamped", per plan: Constraints (unrequested). The change was needed (research R3a) but is not in the plan. Confirm that 48 KB per message, together with the socket's 64 KB limit, keeps relay abuse bounded. Consider a per-connection rate limit on `rtc` messages, as `share` has, and note the decision in specs/006-screen-sharing/research.md R3a.
- [X] T045 Document the two call-setup changes outside the plan's file list in specs/006-screen-sharing/plan.md's Constraints or a "Changed during implementation" note, per plan: Project Structure (unrequested). These are the polite-side first-offer wait and the 48 KB call-setup limit. Also document the z-index change to the top bar and the stage height formula (`clamp(160px, 70vh − 170px, 540px)`) in contracts/ui-behavior.md.
