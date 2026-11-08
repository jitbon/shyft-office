# Implementation Plan: Jam Mode

**Branch**: `011-jam-mode` | **Date**: 2026-11-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/011-jam-mode/spec.md`

## Summary

Shared listening rooms, run by the server and played by each listener's browser:

1. **A room flag.** `Room` gains an optional `jam` boolean (additive, so layouts without it load unchanged). Builders (anyone allowed to edit the layout) set it in the room's properties, and the default Kitchen ships with it on (R1, R10).
2. **A server-owned jam per room.** `JamEngine` (`server/jam.ts`) holds each occupied Jam Room's current track, queue and listeners. Pure rules live in `shared/jam.ts`: link parsing, queue limits, playback position and advance (R2, R5).
3. **Who hears it.** Listeners are whoever the server's own position tracking puts inside the room. Only they receive `jam` messages, so outsiders have nothing to play (R8).
4. **Songs.** A pasted link is parsed on the server to a strict video id (YouTube only in v1), its title read from the public oEmbed endpoint, and played in each listener's own embedded player. No audio is fetched, stored or re-streamed (R3).
5. **The default station.** An original, generated "Office Lofi" station: `shared/lofi.ts` produces notes deterministically from the shared clock, and the browser plays them with Web Audio. No audio files (R6).
6. **Staying in step.** The server sends its own clock and a track start time. Each browser seeks when it drifts by more than 1.5 s. Tracks end and advance on the server, using a length a listener reports (R4, R5).
7. **The browser.** A "Now playing" card (queue, add, skip, volume), a ducking mixer that dips music under voices and shared-screen sound, a music mark on Jam Rooms in both views, and a builder toggle (R7, R9).

## Technical Context

**Language/Version**: TypeScript 5 (strict), Node 20+ server (built-in `fetch`), Vite client.

**Primary Dependencies**: none new in `package.json`. The YouTube IFrame Player API script is loaded at runtime from `https://www.youtube.com/iframe_api` on first entry to a Jam Room (R3). Web Audio for the station.

**Storage**: none. Queues and playback live in memory and are dropped when the room empties or the server restarts. `office-state.json` is unchanged. The `jam` flag lives in the layout (`Room.jam`), so it is saved and published with it.

**Testing**:
- Vitest unit tests for `shared/jam.ts` (link parsing, queue caps, position and advance, skip/remove rules, failure counting), `shared/lofi.ts` (deterministic, in range, same output on every client), and layout validation of `jam`.
- ws integration tests for joining, queueing, skipping and ending, plus a privacy test (outsiders get no jam traffic), using an injected title lookup so tests never touch the network.
- Browser quickstart with 2–3 tabs.

**Target Platform**: current desktop Chromium, Firefox and Safari.

**Project Type**: web application (Node server, browser client and a `shared/` model).

**Performance Goals**:
- music starts within 2 s of entering (SC-001);
- listeners within about 1 s of each other (SC-002);
- no gap over 2 s between tracks (SC-005);
- the jam tick (500 ms) is trivial against the 20 ms presence tick budget.

**Constraints**:
- Only people inside a Jam Room receive its state (Constitution III).
- The office stores and re-streams no audio, and ships no commercial music (FR-014, FR-016).
- The embedded player must stay visible at the size the provider requires (R3).
- Queue state clamps: 20 songs, 3 per member, titles 100 characters, tracks up to 20 minutes.

**Scale/Scope**: about 7 new files and 9 changed ones.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | How |
|---|---|---|
| I. Gather parity, original assets | PASS | Gather has no matching feature that was observed for this plan, so none is copied (R1: unknown, no REA evidence gathered). The station is generated in code. Songs come from links members choose, played from the provider, never shipped. |
| II. One world, many views | PASS | Room membership uses the shared map and `areaAt` as everywhere else. The card and audio are view-independent, so switching views changes nothing. The room mark is drawn in the top-down and first-person views (R9). |
| III. Server-authoritative presence and privacy | PASS | The server decides who is inside, the queue and its order, and when tracks end. Every message is validated, length-limited and rate-limited. Jam state goes only to listeners, with a privacy test. Mic and camera are untouched. |
| IV. Open sprite pipeline | N/A | No sprite formats change. |
| V. Simple to run, tested at the core | PASS | No package or service to run. The only external pieces are optional at runtime: with no network the station still plays and the room says songs can't load (FR-018). Rules are pure with unit tests, and each story has a quickstart scenario. |

**Justified addition (Principle V, "new dependencies"):** loading the provider's player script. Justified in R3: it is the only way to play linked songs without the office hosting or re-streaming audio. It loads lazily, only for Jam Room listeners, and failure degrades to the station.

**Re-check after Phase 1:** still PASS.

## Project Structure

### Documentation (this feature)

```text
specs/011-jam-mode/
├── plan.md              # This file
├── research.md          # Phase 0: decisions R1–R11
├── data-model.md        # Phase 1: JamRoom, Track, constants, transitions, validation
├── quickstart.md        # Phase 1: scenarios Q0–Q6
├── contracts/
│   ├── protocol.md      # jam / jamTrack / jamFail / jamNote messages, invariants
│   └── ui-behavior.md   # card, queue, volume, ducking, room mark, builder toggle
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
shared/
├── jam.ts             # NEW: constants, parseTrackLink, queue rules (add/remove/skip), positionAt, nextAfter, failure count
├── lofi.ts            # NEW: deterministic station notes for a bar: chords, bass, drums, in a seeded pattern
├── layout.ts          # CHANGED: Room.jam?: boolean, validated and carried through
├── default-layout.ts  # CHANGED: Kitchen has jam: true
├── layout-merge.ts    # CHANGED: keep the jam flag when merging a publish
└── protocol.ts        # CHANGED: jam client messages, jam / jamNote server messages

server/
├── jam.ts             # NEW: JamEngine (rooms, listeners, queue, tick, titles lookup with cache and limits)
└── app.ts             # CHANGED: wire the engine; update listeners on move, leave, disconnect, layout change, and match join; rate limits; `jamTimings` and `jamLookup` test options

src/
├── jam/
│   ├── client.ts      # NEW: JamClient: state, clock offset, drift correction
│   ├── player.ts      # NEW: provider player wrapper (lazy script load, play/seek/volume, length, errors)
│   ├── station.ts     # NEW: Web Audio scheduler for shared/lofi.ts
│   ├── mixer.ts       # NEW: music gain, mute, ducking under voices and share sound
│   └── card.ts        # NEW: "Now playing" card (track, queue, add, skip, volume)
├── main.ts            # CHANGED: construct jam client and card, route `jam` messages, feed speaking state to the mixer
├── render2d.ts        # CHANGED: music mark and tint on Jam Rooms
├── render3d.ts        # CHANGED: music mark on Jam Room labels
└── builder/panel.ts   # CHANGED: "Jam Room" toggle in room properties

tests/
├── unit/jam-link.test.ts, jam-queue.test.ts, jam-position.test.ts, lofi.test.ts, layout-jam.test.ts, jam-duck.test.ts
└── integration/ws-jam.test.ts, ws-jam-privacy.test.ts, jam-publish.test.ts
```

**Structure Decision**: the existing single repository with `shared/` (pure rules), `server/` (authority) and `src/` (browser). It mirrors how Office Arena was split (`shared/arena.ts`, `server/arena.ts`, `src/arena/`).

## Complexity Tracking

No constitution violations to justify. The runtime-loaded provider script is recorded above and in R3.
