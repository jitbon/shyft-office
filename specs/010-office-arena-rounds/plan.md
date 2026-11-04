# Implementation Plan: Office Arena

**Branch**: `010-office-arena-rounds` | **Date**: 2026-11-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/010-office-arena-rounds/spec.md`

## Summary

An original round-based team game played in the live office, run entirely on the server:

1. **A server-owned match.** A `MatchEngine` applies a pure rules module (`shared/arena.ts`) covering phases (buy, play, round end, match end), teams, damage and armour, money, purchases and spawns. Browsers only send intents (`arena`, `fire`, `buy`) (research R2, R6).
2. **Hits decided on the server.** A ray from the shooter's server position along the aim angle is stopped by walls and solid furniture and tested against alive opponents, with spread, pellets and a fire-rate check. Non-players are never targets (R3).
3. **Fair movement.** A speed check for match players; frozen in the buy phase and while tagged out; and `checkEntry` keeps players out of meeting rooms and others' desk spaces (R4).
4. **Separate voice.** `computeLinks` never links a match player with a non-player, using the existing server rule for who hears whom (R8).
5. **What each person sees.** A public summary (`arena`) and visual tracers (`arenaShot`) for everyone. Private state (`arenaYou`) and the scoreboard (`arenaBoard`) for players only (R9).
6. **The browser.**
   - HUD, crosshair, the shop (B) and the scoreboard (hold K);
   - firing with a left click in first person;
   - tracers, team markers and puffs in both views;
   - synthesized blips;
   - spectating when tagged out;
   - an Arena panel (Start, Join, Leave; Begin, Stop, Reset for the host) (R10).
7. **The admin switch.** `arenaEnabled` in the state file, an additive field (R11).

## Technical Context

**Language/Version**: TypeScript 5 (strict), Node 20+ server, Vite client.

**Primary Dependencies**: none new. Web Audio for sounds (R13).

**Storage**: `office-state.json` gains the optional `arenaEnabled` (`STATE_VERSION` stays 4). Matches are never stored.

**Testing**:
- Vitest unit tests for `shared/arena.ts` (teams, `stepMatch`, damage, rewards, buying, `castShot`, spawns, the speed check) and the proximity match rule.
- ws integration tests for the game, cheating attempts and privacy.
- Browser quickstart with 4–10 tabs.

**Target Platform**: current desktop Chromium, Firefox and Safari, with a mouse and pointer lock.

**Project Type**: web application (Node server, browser client and a `shared/` model).

**Performance Goals**:
- a hit shown within 0.5 s (SC-002);
- 60 fps at 5 versus 5 for players and watchers (SC-005);
- the match tick (100 ms) and ray casts stay well under the 20 ms server tick budget.

**Constraints**:
- An original game: no copied names, weapons, numbers, maps or interface (FR-015, Constitution I).
- Only the server decides outcomes (Constitution III).
- Non-players unaffected (FR-023).
- One match, at most 10 players.

**Scale/Scope**: about 8 new files and 10 changed ones.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | How |
|---|---|---|
| I. Gather parity, original assets | PASS | Gather has no equivalent (R1). It's an original game in a genre. Names, gear, numbers, team names and sounds are all ours, sounds are synthesized, and nothing is copied from any existing game. The deviation from the issue's "guns from cs:go" is stated in the spec. |
| II. One world, many views | PASS | The match uses the live shared world, with spawns computed from it. Tracers, markers and puffs draw in both views from one summary. Top-down during a match is a stated overview without moving or firing (FR-021). |
| III. Server-authoritative presence and privacy | PASS | The server decides hits, health, money, purchases, rounds and movement limits. Voice between players and non-players is cut in `computeLinks`. Private state goes only to players. Meeting rooms and desks are protected by `checkEntry`. Every message is validated and rate-limited. Privacy tests cover each invariant. |
| IV. Open sprite pipeline | N/A | No sprite formats change. Characters are unchanged. |
| V. Simple to run, tested at the core | PASS | No new package or service. All rules are pure in `shared/arena.ts` with unit tests, and each story has a quickstart scenario. |

**Re-check after Phase 1:** still PASS.

## Project Structure

### Documentation (this feature)

```text
specs/010-office-arena-rounds/
├── plan.md              # This file
├── research.md          # Phase 0: decisions R1–R13
├── data-model.md        # Phase 1: MatchState, ArenaPlayer, constants, transitions, validation
├── quickstart.md        # Phase 1: scenarios Q0–Q7
├── contracts/
│   ├── protocol.md      # arena / fire / buy messages, arena / arenaShot / arenaYou / arenaBoard, invariants
│   └── ui-behavior.md   # panel, HUD, shop, scoreboard, watchers, returning
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
shared/
├── arena.ts           # NEW: constants, GEAR, ECONOMY, assignTeams, stepMatch, applyHit, rewards, canBuy/buy,
│                      #      castShot (DDA + circles, seeded spread), arenaSpawns, moveAllowed (speed check)
├── proximity.ts       # computeLinks: OfficeInput.match splits players from non-players
└── protocol.ts        # arena/fire/buy/arenaShot/arenaYou/arenaBoard; 'arena' reasons; AdminOp arena; adminState arenaEnabled

server/
├── arena.ts           # NEW: MatchEngine (holds MatchState, 100 ms tick, applies stepMatch events, sends messages)
├── office.ts          # checkEntry 'arena' rule; linkInput() includes the match set; arenaEnabled
├── store.ts           # arenaEnabled (additive, optional)
└── app.ts             # handle arena / fire / buy; speed check on state; admin op; close → leave; DND/share interplay

src/
├── arena/
│   ├── client.ts      # NEW: arena state in the browser, intents, fire on click, spectating
│   ├── hud.ts         # NEW: crosshair, health/armour, money, gear, timer, scores, feedback
│   ├── shop.ts        # NEW: buy menu (B)
│   ├── board.ts       # NEW: scoreboard (hold K, round/match end)
│   └── sound.ts       # NEW: synthesized blips (players only)
├── render2d.ts        # team rings, tracers, puffs
├── render3d.ts        # head markers, tracer quads, puff sprite
├── main.ts            # Arena button/panel, banner, key handling (B/K while in a match), disabled buttons, teleport 'arena'
├── office-ui.ts       # "Not during a match" for correct reason 'arena'; Arena enabled in admin panel
├── index.html         # Arena button, panel, HUD, shop, board elements
└── style.css          # arena styles (existing tokens)

tests/unit/            # NEW: arena-rules, arena-shot, arena-spawns, arena-move, proximity-match
tests/integration/     # NEW: ws-arena, ws-arena-privacy
```

**Structure decision:** the existing repository stays as it is.
- Every rule is a pure function in `shared/arena.ts`. The server's `MatchEngine` applies them and sends messages, and the browser only renders and sends intents.
- The match's touches on the rest of the office are three narrow hooks: `computeLinks` (voice), `checkEntry` (rooms and desks), and the `state` speed check.

## Phases

- **Phase 0, research:** [research.md](research.md), decisions R1–R13. No open questions remain.
- **Phase 1, design:** [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md).
- **Suggested build order for tasks:**
  1. **Pure rules:** `shared/arena.ts` and its tests; protocol types.
  2. **Server:** `MatchEngine`, message handling, the speed check, the `checkEntry` rule, the `computeLinks` match split, the admin switch; ws tests, including privacy and cheating.
  3. **US1 and US3 in the browser:** panel, firing, HUD, tracers and markers in both views, spectating, scoreboard, returning.
  4. **US2:** the shop and money display.
  5. **US4:** the banner and the watchers' view; silent for non-players.
  6. **Polish:** sounds, README, and the 10-tab quickstart run.

## Complexity Tracking

No constitution violations to justify.
