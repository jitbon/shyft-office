# Implementation Plan: Character Statuses

**Branch**: `013-character-statuses` | **Date**: 2026-11-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/013-character-statuses/spec.md`

## Summary

Extend the status from feature 001 (Available / Busy / Do Not Disturb, note, time limit, dot) with six ready-made statuses (In a meeting, Focusing, Lunch, Coffee break, Away, Out for the day), an emoji, recent statuses, a status icon and dimmed avatar on the map, one status badge used everywhere a person is named, an automatic In a meeting computed by the server, and effects (blocking conversations, devices off, an "is away" notice on rings and waves). No automatic Away.

Technical approach: keep `PlayerStatus.kind` for old clients and add `preset`, `emoji` and `auto` (research R2). One table of statuses and their effects in `shared/status.ts` drives the server rules and every view (R3). The server keeps the member's chosen status apart from the shown one and derives automatic In a meeting in its existing 200 ms link tick (R4).

## Technical Context

**Language/Version**: TypeScript (strict), Node 20+ server, browser client

**Primary Dependencies**: existing only (`ws`, Vite, Vitest). No new dependency; `Intl.Segmenter` for emoji (R7)

**Storage**: device storage for the auto-meeting setting and recent statuses (R5); no server storage change

**Testing**: Vitest unit (`tests/unit/status.test.ts` extended) and integration (`tests/integration/ws-status.test.ts` new)

**Target Platform**: desktop Chromium, Firefox, Safari

**Project Type**: web app (shared / server / src)

**Performance Goals**: status change visible to all ≤ 1 s (one 200 ms tick plus network); 60 fps unchanged (one extra icon per name tag)

**Constraints**: backward compatible protocol (all new fields optional); server-authoritative effects

**Scale/Scope**: the documented office scale (≈50 people); 9 statuses; ~10 files touched

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Result |
|---|---|---|
| I. Gather parity, original assets | Gather research cited (R1, observed/inferred/unknown). Added statuses listed as a deliberate deviation in spec Assumptions. Icons are the device's emoji font; no Gather assets. | Pass |
| II. One world, many views | Status table and effects in `shared/`. Icon and dimming via the shared `drawNameTag` path and both renderers; spec covers 2D and first person. | Pass |
| III. Server-authoritative presence and privacy | Server validates every status field, sets `kind` for presets, ignores client `auto`, computes automatic In a meeting, enforces devices off and conversation blocking. No new private context; statuses are public as today. Mic/camera are never turned *on* by the server, and the client turns them back on only when the member sets a new status themselves (or clicks **Turn back on**); a status that runs out leaves them off. | Pass |
| IV. Open sprite pipeline | No sprite formats touched. | N/A |
| V. Simple to run, tested at the core | No new infrastructure or dependency. Pure logic (`cleanStatus`, `shownStatus`, `inMeeting` inputs, effect helpers, recent list, morning time) unit-tested; quickstart scenario per story. | Pass |

**Post-design re-check**: Pass. The design adds one message (`statusPrefs`) and one notify kind (`awayInfo`), both validated on the server.

## Project Structure

### Documentation (this feature)

```text
specs/013-character-statuses/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── protocol.md
│   └── ui-behavior.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
shared/
├── protocol.ts          # PlayerStatus: preset, emoji, auto; statusPrefs; NotifyKind 'awayInfo'; share reason 'status'
├── status.ts            # STATUS_PRESETS table; cleanStatus (preset, emoji); shownStatus; blocksConversations,
│                        # devicesOff, isAway, statusLabel, statusIcon, timeLeftText, nextMorning
└── proximity.ts         # contextOf: blocksConversations(status) instead of kind === 'dnd'

server/
└── app.ts               # chosen vs shown status; statusPrefs; same-member tabs; inMeeting in beforeUpdate;
                         # devicesOff in media/status/placeOf; awayInfo on ring and wave

src/
├── status.ts            # new menu (recent, grid, customize, auto-meeting box); statusBadge(); prefs in storage;
│                        # awayInfo notice
├── types.ts             # status colors from the shared table
├── render2d.ts          # drawNameTag(status): icon; dimmed avatars
├── render3d.ts          # dimmed billboards
├── main.ts              # setMyStatus via devicesOff (remember and restore devices); first-person name tags;
│                        # people list badge; chat names; player hover card; send statusPrefs after welcome
├── callPanel.ts         # badge on conversation tiles
├── office-ui.ts         # badge on desk cards and desk view
└── style.css            # menu grid, badge, hover card

tests/
├── unit/status.test.ts          # extended: presets, emoji, shownStatus, effects, recent list, nextMorning, contrast
├── unit/proximity.test.ts       # a Focusing / Lunch player joins no conversation
└── integration/ws-status.test.ts # new: presets on the wire, auto meeting, devices forced off, awayInfo, two tabs
```

**Structure Decision**: the existing single repo with `shared/`, `server/` and `src/`; no new top-level modules.

## Complexity Tracking

None. No constitution violations.
