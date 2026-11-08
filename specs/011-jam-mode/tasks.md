---

description: "Tasks for Jam Mode (shared listening rooms with a song queue)"
---

# Tasks: Jam Mode

**Input**: design documents in `specs/011-jam-mode/`: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/protocol.md](contracts/protocol.md), [contracts/ui-behavior.md](contracts/ui-behavior.md) and [quickstart.md](quickstart.md)

**Tests**: included.
- Constitution V asks for unit tests of deterministic logic: link parsing, queue rules, playback position, the station's notes and layout validation.
- Constitution III asks for a test proving that people outside a Jam Room receive nothing from it.

Write each story's tests before its code and see them fail first.

**Organization**:
- US1 (hear the music) and US2 (queue songs) are P1. US3 (hang out and work) is P2. US4 (make a room a Jam Room) is P3.
- The room flag, the shared rules and the server's listener tracking are foundational, because every story and the privacy guarantee depend on them. The default Kitchen is marked in Phase 2, so US1–US3 are testable before US4's builder toggle exists.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US4 from spec.md
- Paths are relative to the repository root

## Notes for every task

- **Nothing is hosted.** The office stores, copies and re-streams no audio. Linked songs play only in each listener's own embedded player. The station is generated in code. No audio files and no new npm packages (FR-014, FR-016, Constitution I).
- **The server decides.** Browsers send intents (`jam` add, remove, skip; `jamTrack`; `jamFail`). The server decides who is a listener, the queue and its order, and when tracks end (Constitution III).
- **Outsiders get nothing.** A member who isn't inside a Jam Room never receives `jam` or `jamNote`, apart from the single `room: null` after leaving (contracts/protocol.md invariant 1).
- **Validate and clamp every input.** Use the exact limits in data-model.md: `QUEUE_MAX` 20, `PER_MEMBER_MAX` 3, `TITLE_MAX` 100, `TRACK_MIN_S` 5 and `TRACK_MAX_S` 1200, `url` at most 300 characters, ids at most 16.
- **Pure rules take plain data and a clock.** `shared/jam.ts` and `shared/lofi.ts` use no timers, no I/O and no `Math.random`. The station uses a seeded generator.
- **Existing behavior stays.** The full suite must pass after every phase. With no Jam Room in use, the office must behave exactly as before.
- **Browser storage** (volume, mute) goes in try/catch and must not break the page when it throws.
- **Rebuild before checking in a browser** (`npm run build`).

---

## Phase 1: Setup

- [X] T001 Confirm the baseline: `npm run typecheck` is clean and `npm test` passes. Record the test counts in specs/011-jam-mode/checklists/validation.md (create it with a first heading).

---

## Phase 2: Foundational (blocks every story)

**Purpose**: the room flag, the shared rules, the protocol types, and the server tracking who is inside a Jam Room.

**⚠️ CRITICAL**: no user story work can begin until this phase is complete.

### Tests first

- [X] T002 [P] Write tests/unit/jam-link.test.ts for `parseTrackLink`: accepts watch, `youtu.be`, `m.`, `music.`, `/shorts/`, `/embed/` and `/live/` forms and returns only the 11-character id matching `^[A-Za-z0-9_-]{11}$`; discards playlists, times and every other parameter; rejects `bad-link` (not a URL, over 300 characters, wrong scheme, bad id) and `unsupported-site` (any other host, lookalike hosts such as `youtube.com.evil.test` and `evilyoutube.com`, userinfo tricks like `https://youtube.com@evil.test/…`).
- [X] T003 [P] Write tests/unit/jam-queue.test.ts for the queue rules: add appends in order; refuses `queue-full` at 20 and `member-cap` at 3 per member; remove works only for the adder's own track; skip works only while a track (not the station) plays; ids are unique within a room.
- [X] T004 [P] Write tests/unit/jam-position.test.ts for `positionAt` (clamped to `[0, len]`, and unclamped upward while `len` is unset), `nextAfter` (next queued track after `GAP_MS`, or back to the station when the queue is empty), the length rule (first valid report in 5–1200 wins, later ones ignored, 0 / non-integer / out-of-range counted as unplayable), the no-length timeout (`LENGTH_WAIT_MS` 15000), and the failure rule (skip when `fails.size > listeners.size / 2`, each sender counted once).
- [X] T005 [P] Write tests/unit/layout-jam.test.ts: `Room.jam` is kept when `true`, absent for `false`, missing or any other value, and a layout without it validates unchanged. A merge keeps the flag, and the default layout's Kitchen has `jam: true`.

### Implementation

- [X] T006 [P] Create shared/jam.ts with the constants in data-model.md (`QUEUE_MAX` 20, `PER_MEMBER_MAX` 3, `TITLE_MAX` 100, `TRACK_MIN_S` 5, `TRACK_MAX_S` 1200, `LENGTH_WAIT_MS` 15000, `DRIFT_MS` 1500, `GAP_MS` 800, `TICK_MS` 500), the `Track` and `JamRoom` types, `parseTrackLink` (R3: allowed hosts `youtube.com`, `www.youtube.com`, `m.youtube.com`, `music.youtube.com`, `youtu.be`; only the id kept), the queue functions (add, remove, skip), `positionAt`, `nextAfter`, the length and failure rules, and `cleanTitle` (strips control characters, trims, cuts at `TITLE_MAX`). Make T002–T004 pass.
- [X] T007 [P] Add the optional `jam?: boolean` to `Room` in shared/layout.ts and read it in the room validation: kept only when exactly `true`. Make T005's validation cases pass.
- [X] T008 Carry `jam` through publishing in shared/layout-merge.ts, and set `jam: true` on the Kitchen in shared/default-layout.ts. Update any default-layout expectations in tests/unit/default-layout.test.ts. Make T005 pass.
- [X] T009 [P] Add the protocol types to shared/protocol.ts as in contracts/protocol.md: client messages `jam` (`op: 'add' | 'remove' | 'skip'`, `url`, `id`), `jamTrack` (`id`, `len`) and `jamFail` (`id`); server messages `jam` (state, and `room: null`) and `jamNote` (`text`).
- [X] T010 Create server/jam.ts with `JamEngine`: per-room state as in data-model.md, `enter(playerId)`, `leave(playerId)`, `roomsChanged(layout)` (closes jams for rooms that lost `jam` or were removed and sends the listeners `room: null` plus a `jamNote`), `listenersOf(roomId)`, and a `send` dependency so tests can capture output. A member is a listener of at most one room. **Office Arena players are never listeners (FR-020):** `enter` refuses anyone for whom the `inArena(id)` dependency is true, and `leave` is called when a player joins a match. Emit nothing yet beyond `room: null`.
- [X] T011 Wire the engine into server/app.ts: tell it on every position change that crosses a room boundary (next to where `areaAt` is already compared before and after a move), on leave and disconnect, when a layout is published, and when a member joins a match (including when the Arena teleports them; see the `teleport` handling that already calls `broadcastOffice`). Add the test options `jamTimings` (tick and gap, short in tests, as `arenaTimings` is for the Arena), `jamLookup` (the title lookup) and `jamNow` (the clock) to the `createApp` options. Add `within('jam', id)` rate limits: 6 per minute for adds and 20 per minute for other actions. Ignore `jam`, `jamTrack` and `jamFail` from anyone who is not a listener, and send a "not in a Jam Room" `notify` error for `add`.

**Checkpoint**: `npm run typecheck` and `npm test` pass. The engine knows who is inside the Kitchen, and nothing else about the office has changed.

---

## Phase 3: User Story 1 - Walk into a Jam Room and hear the music (Priority: P1) 🎯 MVP

**Goal**: entering the Kitchen starts the generated station for you, in step with everyone else inside. Leaving stops it. Outsiders hear nothing and receive nothing.

**Independent Test**: quickstart Q1.

### Tests first

- [X] T012 [P] [US1] Write tests/unit/lofi.test.ts: `barNotes(seed, bar)` is deterministic (same output for the same inputs), every note is in a sensible range (frequencies 40–2000 Hz, starts inside the bar, durations positive), every bar has chords, a bass line and drums, and consecutive bars follow one of the progressions. Different seeds give different music.
- [X] T013 [P] [US1] Write tests/integration/ws-jam.test.ts, first part, using a hook in the engine's dependencies so no test touches the network: a member who walks into the Kitchen receives `jam` with `mode: 'station'`, a `station.seed` and `epoch`, an empty queue and themselves in `listeners`. A second member who enters receives the same `seed` and `epoch`, and the first sees the listener list update. A member who leaves receives exactly one `jam` with `room: null` and nothing afterwards. When the last listener leaves, the next entry starts a fresh station with an empty queue. Repeat walk-in and walk-out 50 times, with and without a queued song (SC-006): after each cycle the member who left has received exactly one `room: null` and nothing more, and the member inside is still a listener.
- [X] T014 [P] [US1] Write tests/integration/ws-jam-privacy.test.ts (Constitution III): with two members inside and one outside the Kitchen, the outside member receives no `jam` or `jamNote` message across entering, leaving and every message the others send. The outsider's own `jam`, `jamTrack` and `jamFail` messages change nothing for the others, and an outsider's `add` gets a "not in a Jam Room" error only to itself. Two Jam Rooms never share a queue. A member who is in an Arena match is never made a listener when they walk into the Kitchen, receives no `jam` messages, and a listener who joins a match gets `room: null` at once (FR-020).

### Implementation

- [X] T015 [P] [US1] Create shared/lofi.ts with `barMs(tempo)` and `barNotes(seed, bar)`: a slow tempo (about 70–80 bpm), seventh chords from a few fixed progressions chosen from the seed, a soft bass, a sparse drum pattern and a few melody notes, all from a seeded generator (no `Math.random`). Make T012 pass.
- [X] T016 [US1] In server/jam.ts, make a room with listeners play the station: set `seed` and `stationEpoch` when the first listener enters, send the full `jam` state (as in contracts/protocol.md, with `now`, `queue: []`, `listeners` as names, and `mine` false for all) to a new listener at once, and to all listeners when the listener list changes. Send `room: null` once when someone stops being a listener, and clear the room when the last one leaves. Make T013 and T014 pass.
- [X] T017 [P] [US1] Create src/jam/mixer.ts: the music gain node, with `volume` and `muted` kept in local storage (all reads and writes in try/catch, the page working when storage throws), a `setDuck(factor)` hook for US3, and a single shared `AudioContext` that is resumed on a user gesture.
- [X] T018 [P] [US1] Create src/jam/station.ts: a Web Audio scheduler that plays `barNotes(seed, bar)` from shared/lofi.ts for the bar the shared clock says it is (triangle and sine voices, a low-pass filter, a little noise for crackle, drums from filtered noise), scheduling a few bars ahead and stopping cleanly on demand. Add no audio files.
- [X] T019 [US1] Create src/jam/client.ts: `JamClient` holding the latest `jam` state, the clock `offset` (`now − Date.now()` on each message, R4), `expectedPositionMs()`, and `inRoom()`. It starts the station when `mode` is `'station'`, stops everything on `room: null`, and reports "needs a click" when the browser blocks sound.
- [X] T020 [US1] Create src/jam/card.ts: the "Now playing" card per contracts/ui-behavior.md for the station case: header with the room name and a note mark, the listener names ("Ana, Ben and 2 others"), the "Office Lofi · nobody has queued anything" line, the volume slider and mute, a fold-to-one-line button that never pauses the music, and "Click to start the music" when sound is blocked. Add its container and styles to index.html and src/style.css.
- [X] T021 [US1] Wire it into src/main.ts: construct the client, mixer and card, route incoming `jam` and `jamNote` messages (show `jamNote` as a short toast), and unlock the audio context on the first pointer or key event. The card appears within 2 s of entering and goes within 2 s of leaving, in both views.

**Checkpoint**: quickstart Q1 and Q4 pass. This is a usable MVP: a room that plays lofi for whoever is inside.

---

## Phase 4: User Story 2 - Queue songs together (Priority: P1)

**Goal**: anyone inside pastes a link, the song joins a shared queue, plays in order for everyone, and can be skipped. The station takes over when the queue is empty.

**Independent Test**: quickstart Q2.

### Tests first

- [X] T022 [P] [US2] Extend tests/integration/ws-jam.test.ts with the queue flow, using an injected title lookup that returns fixed titles (and fails for chosen ids): `add` puts the track in everyone's queue within one message with `byName`, `mine: true` only for the adder, and no member id anywhere. The first add while the station plays starts the track after `GAP_MS`. A `jamTrack` length sets the end, and the next track starts when it is reached (use a short injected tick and clock). Skip moves on for everyone and sends a `jamNote` naming who skipped. Remove works only on your own track. The 21st song gets `queue-full`, the 4th from one member gets `member-cap`, a bad link gets `bad-link`, another site gets `unsupported-site`, a lookup failure gets `not-found` or `lookup-failed`, and none of them change the queue.
- [X] T023 [P] [US2] Extend tests/integration/ws-jam.test.ts with failure handling: a `jamFail` from more than half the listeners skips the track with a `jamNote`, one listener out of three does not. A length of 0, 3 or 5000 counts as unplayable. A track with no length for 15 s is skipped. A `jamTrack` for a track that isn't current, or a second length report, changes nothing. When the queue empties the station resumes.
- [X] T024 [P] [US2] Extend tests/integration/ws-jam-privacy.test.ts: every `ref` in every message matches `^[A-Za-z0-9_-]{11}$`, no message contains a URL or a `by` field, and an outsider can't remove, skip or add.

### Implementation

- [X] T025 [US2] In server/jam.ts, add the title lookup as an injectable dependency, defaulting to a fetch of YouTube's oEmbed endpoint (`https://www.youtube.com/oembed?format=json&url=…` built from the validated id only) with a 4 s timeout, a 64 KB response cap, no redirects, at most 4 lookups at once, and a one-hour cache by id. Pass the title through `cleanTitle`.
- [X] T026 [US2] In server/jam.ts, handle `add`, `remove` and `skip` using the shared rules, run the 500 ms tick (advance on end, on the no-length timeout, and on `GAP_MS`), accept `jamTrack` and `jamFail` per the rules in data-model.md, and send `jamNote` text for skips ("Ben skipped *Title*") and unplayable songs ("*Title* can't be played here, skipping"). Send refusals to the sender only, as `notify` errors with the plain-words texts in contracts/protocol.md. Make T022–T024 pass.
- [X] T027 [P] [US2] Create src/jam/player.ts: lazily load the provider's player script the first time a track is current, create the embedded player (200×200 or larger, never hidden), and expose `load(ref, positionMs)`, `seek`, `setVolume`, `positionMs()`, `onLength(len)`, `onEnded()` and `onError()`. Report the length once per track as `jamTrack` and a play error as `jamFail`. If the script fails to load, report that to the client so the card can say songs can't load.
- [X] T028 [US2] Extend src/jam/client.ts: when `mode` is `'track'`, stop the station and play the track at the expected position, check every 2 s and seek only when the difference exceeds `DRIFT_MS` (1500 ms), apply the mixer's volume to the embedded player, and switch back to the station on a state without a track.
- [X] T029 [US2] Extend src/jam/card.ts: the embedded player area, the track line ("added by Name"), Skip (hidden while the station plays), the queue list with a remove (×) on your own songs and an "n / 20" counter, and the add field with Enter-to-submit. Show refusals from `notify` errors under the field. Show "Songs can't load right now. The station is still playing." when the provider fails.
- [X] T030 [US2] Wire the card's add, skip and remove actions to `net.send` in src/main.ts as `jam` messages, and the client's length and failure reports as `jamTrack` and `jamFail`.

**Checkpoint**: quickstart Q2 passes. Stories 1 and 2 work together.

---

## Phase 5: User Story 3 - Just hang out and work (Priority: P2)

**Goal**: the room works with no mic, camera or call prompt. The music dips under voices and shared-screen sound. Do Not Disturb and status are untouched.

**Independent Test**: quickstart Q3.

### Tests first

- [X] T031 [P] [US3] Write tests/unit/jam-duck.test.ts for the ducking curve in src/jam/mixer.ts: it falls to 0.35 within 150 ms of speech starting, holds while speech continues, and recovers over about 600 ms after 1 s of quiet, with no flicker on short pauses.
- [X] T032 [P] [US3] Extend tests/integration/ws-jam.test.ts: entering a Jam Room doesn't change the member's status or Do Not Disturb, and still delivers `jam` while Do Not Disturb is on. It doesn't open a call or set mic or camera.

### Implementation

- [X] T033 [US3] Implement ducking in src/jam/mixer.ts: `setDuck` from the speaking states the call panel already has for you and for everyone you can hear in the room (peers in your conversation, or the room's call in a private Jam Room) (see src/voice.ts and src/callPanel.ts), and from a shared screen with sound that is playing for you (src/shareStage.ts). Apply the factor to the station and to the embedded player's volume. Make T031 pass.
- [X] T034 [US3] In src/main.ts, feed those speaking and share-sound states into the mixer, and confirm walking into an open Jam Room (the Kitchen) doesn't open the desk or meeting-room video view or a mic or camera prompt. A Jam Room that is also private keeps the video view every private room already opens (FR-019); check that the card and music still work beside it. Make T032 pass.
- [X] T035 [US3] In src/jam/card.ts, show who else is in the room and a small marker on the member who added the current song.

**Checkpoint**: quickstart Q3 passes.

---

## Phase 6: User Story 4 - Make a room a Jam Room (Priority: P3)

**Goal**: builders mark and unmark rooms. Marked rooms are visibly different in both views. Unmarking stops the music for those inside.

**Independent Test**: quickstart Q0 and Q6 step 2.

### Tests first

- [X] T036 [P] [US4] Write tests/integration/jam-publish.test.ts: publishing a layout that sets `jam` on another room makes it a Jam Room for everyone at once (members inside it become listeners), publishing one that removes `jam` or the room ends the jam within one tick (listeners get `room: null` and a `jamNote`, queue cleared), and a private room marked as a Jam Room keeps its privacy (someone outside it receives no jam traffic).

### Implementation

- [X] T037 [US4] Add the **Jam Room** checkbox ("Plays shared music for everyone inside") to the room properties in src/builder/panel.ts, and carry the value through the builder's room edit, history and publish paths so it doesn't change the room's private or restricted settings.
- [X] T038 [P] [US4] In src/render2d.ts, draw a soft tint and a note mark beside the name of every room with `jam: true`, whether or not you are inside it.
- [X] T039 [P] [US4] In src/render3d.ts, add the note mark to the label of every Jam Room.
- [X] T040 [US4] In server/app.ts, add the test coverage for the publish path wired in T011: members standing in a newly marked room become listeners when the layout is published. Make T036 pass.

**Checkpoint**: quickstart Q0 passes.

---

## Phase 7: Polish & cross-cutting

- [X] T041 [P] Add a **Jam rooms** section to README.md: walking in plays music, how to queue a song with a pasted link and which links are supported, skip and volume, and the builder toggle. Mention that linked songs play through the provider's embedded player and that the generated station works offline.
- [X] T042 [P] Check that the page's security headers (if any, in server/app.ts or index.html) allow the provider's player script and frame, and nothing wider than that. If there is no content security policy, record that in specs/011-jam-mode/checklists/validation.md.
- [X] T043 Run `npm run typecheck` and `npm test` and fix anything that fails. Record the counts in specs/011-jam-mode/checklists/validation.md.
- [ ] T044 Run quickstart Q0–Q6 by hand in 3 browser windows after `npm run build`, and record each result in specs/011-jam-mode/checklists/validation.md. Note any step that needs network access to the provider, and what you saw when it was blocked.
- [X] T045 Run `/speckit-analyze` for a cross-artifact consistency check, and fix anything it finds in spec.md, plan.md or this file.

---

## Dependencies & Execution Order

- **Phase 1** first. **Phase 2** blocks everything else.
- **US1** (Phase 3) depends only on Phase 2. It is the MVP.
- **US2** (Phase 4) depends on Phase 2 and extends US1's server, client and card, so do it after US1.
- **US3** (Phase 5) depends on US1 (the mixer and card). It doesn't need US2 to be tested, but the duck must also apply to linked songs once US2 exists (T033).
- **US4** (Phase 6) depends on Phase 2 only. The builder and renderer tasks (T037–T039) can run any time after Phase 2, in parallel with the stories.
- **Polish** last.

Within a story: tests first and failing, then shared rules, then the server, then the client.

## Parallel opportunities

- **Phase 2:** T002–T005 together; then T006, T007 and T009 together.
- **US1:** T012–T014 together; then T015, T017 and T018 together.
- **US2:** T022–T024 together; T027 alongside T025–T026.
- **US3:** T031 and T032 together.
- **US4:** T038 and T039 together, and T037 alongside US2 or US3 work.
- **Polish:** T041 and T042 together.

## Implementation strategy

1. **MVP:** Phases 1–3. A Jam Room that plays a generated lofi station for whoever is inside, with the card, volume and privacy guarantee. Stop and check quickstart Q1, Q4 and Q5.
2. **Add the queue** (Phase 4), the heart of the ticket. Check Q2 and the rest of Q5.
3. **Add hanging-out polish** (Phase 5), then **the builder toggle and marks** (Phase 6).
4. **Polish** (Phase 7), then update the Gather V3 board card for issue #8 when it is merged.

---

## Phase 8: Convergence

- [x] T046 In src/jam/client.ts, keep the generated station playing for a listener whose own player failed or whose provider script could not load while `mode` is `'track'`, so "The station is still playing" is true, and clear `songsFailed` when the track it applied to is gone unless the provider itself is unavailable, per FR-018, plan R3 (contradicts)
- [x] T047 In src/jam/client.ts, push the mixer's saved level to the player when the client is set up, so a member who muted or lowered the volume hears that level on walking in while a song is already playing, per FR-007, US1/AC6 (partial)
- [x] T048 In server/app.ts, call `syncJam` after a member joins so anyone who spawns inside a Jam Room becomes a listener straight away, and add a case to tests/integration/ws-jam.test.ts with the layout's spawn inside the room, per FR-004, FR-005 (partial)
- [x] T049 In src/jam/player.ts, treat the player as usable only after `onReady`: make `ensure()` wait for readiness, make `seek`, `play`, `stop`, `setVolume`, `positionMs` and `isPlaying` safe before it, and load the latest wanted track once ready, so a skip during loading neither throws inside `onMessage` nor loses the next song, per US2/AC5, FR-010 (partial)
- [x] T050 In server/app.ts, give adds and other jam actions separate rate-limit keys (`jam-add:<id>` and `jam:<id>`, both forgotten on close) so the 6-per-minute add limit and 20-per-minute limit for other actions don't count each other's events, and add a test to tests/integration/ws-jam.test.ts that repeated skips don't block an add, per FR-012, plan R11 (contradicts)
- [x] T051 In src/jam/station.ts, schedule no bars while the audio context isn't running, and start from the current bar when it begins running, so clicking to start sound doesn't play every bar queued during the wait at once, per US1/AC1, FR-018 (partial)
- [x] T052 In src/render3d.ts, tint the floor of Jam Rooms in first person using the same colour as src/render2d.ts, so the room is marked on its floor in both views as the README says, per FR-003 (partial)
- [x] T053 In src/jam/client.ts and src/jam/mixer.ts, derive `needsClick` from the audio context's real state (listen for `statechange`) so the prompt clears once sound is running, and in src/jam/card.ts show "Click to start the music" on a folded card too, per FR-018 (partial)
- [x] T054 In src/jam/player.ts, report the track's length as soon as `getDuration()` is above 0 in any player state, not only when playing, so a listener blocked from autoplay doesn't get a working song skipped by the 15 s no-length rule, per US2/AC6 (partial)
- [x] T055 Create tests/unit/jam-client.test.ts driving `JamClient` with fake mixer, station and player dependencies: drift seeks only above `DRIFT_MS` and only while playing, the saved level reaches the player on entry, a failed listener gets the station, and `room: null` stops everything, per Constitution V (partial)
- [x] T056 State in README.md and specs/011-jam-mode/quickstart.md that only a new office starts with the Kitchen as a Jam Room, and that an office with a saved layout (`data/layout.json`) needs a builder to tick **Jam Room** and publish, per US4/AC1, plan summary item 1 (partial)
- [x] T057 Correct the Collapse line in specs/011-jam-mode/contracts/ui-behavior.md: folding gives one line while the station plays, but the embedded player stays visible while a song plays, as plan R3 requires, per contracts/ui-behavior.md, plan R3 (contradicts)
