---

description: "Tasks for Office Arena (an original round-based team game played in the live office)"
---

# Tasks: Office Arena

**Input**: design documents in `specs/010-office-arena-rounds/`: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/protocol.md](contracts/protocol.md), [contracts/ui-behavior.md](contracts/ui-behavior.md) and [quickstart.md](quickstart.md)

**Tests**: included.
- Constitution V asks for unit tests of deterministic logic: every rule in `shared/arena.ts`.
- Constitution III asks for a test proving players and non-players stay apart: voice, private state, meeting rooms and desks.
- SC-006 asks for tests that a modified browser can't cheat.

Write each story's tests before its code and see them fail first.

**Organization**:
- US1 (rounds and the kill count), US2 (buying gear) and US3 (start, stop, reset, leave) are P1. US4 (watching from the office) is P2.
- The pure rules and the three narrow hooks into the office (voice split, the room and desk rule, the speed check) are foundational, because every story and the privacy guarantee depend on them.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US4 from spec.md
- Paths are relative to the repository root

## Notes for every task

- **Original game.** Use the names, gear, team names and numbers in research R7 and data-model.md only. No name, weapon, number, map, sound or interface element from any existing game (FR-015, Constitution I). Sounds are synthesized, and no audio files are added.
- **The server decides.** Browsers send intents (`arena`, `fire`, `buy`). The server decides hits, health, money, gear, phases and movement limits, and the browser only renders what it's told (Constitution III, SC-006).
- **Non-players are untouchable.** Never a target, never linked by voice with a player, never sent `arenaYou` or `arenaBoard`, and never have their room or desk entered by a player (FR-023, FR-004).
- **Pure rules take plain data and a clock.** `shared/arena.ts` uses no timers, no randomness except a seeded generator passed in, and no I/O.
- **Existing behavior stays.** The full suite (733 tests in 100 files at the start) must pass after every phase. With no match running, the office must behave exactly as before.
- **Rebuild before checking in a browser** (`npm run build`).

---

## Phase 1: Setup

- [X] T001 Confirm the baseline: `npm run typecheck` is clean and `npm test` passes (733 tests in 100 files). Record both in specs/010-office-arena-rounds/checklists/validation.md (create it with a first heading).
- [X] T002 [P] Create shared/movement.ts with `WALK_SPEED = 3.6` (tiles per second) and `RUN_MULT = 1.8`. Import both in src/main.ts in place of the local `WALK_SPEED` and the `1.8` in `update()`, with no behavior change. The server's speed check needs the same numbers (research R4).
- [X] T003 [P] Add the protocol types to shared/protocol.ts (contracts/protocol.md):
  - `Team = 'blue' | 'orange'` and `Phase = 'lobby' | 'buy' | 'play' | 'roundEnd' | 'matchEnd'`;
  - the `ClientMsg` variants `{ t: 'arena'; op: 'start' | 'join' | 'leave' | 'begin' | 'stop' | 'reset' }`, `{ t: 'fire'; a: number; seq: number }` and `{ t: 'buy'; item: string }`;
  - the `AdminOp` variant `{ op: 'arena'; enabled: boolean }`;
  - the `ServerMsg` variants `arena`, `arenaShot`, `arenaYou` and `arenaBoard`, exactly as in contracts/protocol.md;
  - `'arena'` added to `correct.reason` and `teleport.reason`;
  - `arenaEnabled?: boolean` on `adminState`.
  In server/office.ts, add `'arena'` to `EntryDenied`. `npm run typecheck` must stay clean.

---

## Phase 2: Foundational (the rules and the hooks into the office)

**Purpose**: every game rule as a pure function, and the three narrow places where a match touches the office: voice, rooms and desks, and movement speed.

### Tests (write first, see them fail)

- [X] T004 [P] Write tests/unit/arena-rules.test.ts for shared/arena.ts (data-model "Match" and "Phase transitions"). Use a fake clock and plain `MatchState` objects:
  - **`assignTeams(players)`:** sizes differ by at most 1, and alternate in join order. **`teamForNewcomer(match)`** picks the smaller team, blue on a tie;
  - **`stepMatch`, phases:**
    - lobby → buy on `begin` with at least `MIN_PLAYERS` (2), and refused with 1;
    - buy → play at `phaseEndsAt` (`BUY_MS = 15000`);
    - play → roundEnd when one team has no one alive (the other gets +1 win);
    - play → roundEnd at `PLAY_MS = 120000`, where more alive wins and an equal count is a draw with no win;
    - roundEnd → buy after `ROUND_END_MS = 5000`, with round + 1, everyone alive and health 100, and the tagged-out back on `stapler` with no armour;
    - roundEnd → matchEnd when a team has `WIN_TARGET = 5`;
  - **`stepMatch`, controls:** `reset` gives round 1, wins 0, tags, tag-outs and money back to `ECONOMY.start`, and `stapler` for all. A leave that empties a team during play ends the round;
  - **`applyHit(target, damage)`:** with armour, half the damage goes to armour (down to 0) and the rest to health. Health floors at 0, and alive becomes false at 0. A teammate hit has no effect (`canHit(shooter, target)` is false for the same team, a dead target or a dead shooter);
  - **rewards:**
    - `+ECONOMY.tag` (250) per tag when it happens;
    - at round end winners get `+win` (2500) and losers `+loss` (1200), and a draw gives everyone `+loss`;
    - money is capped at `cap` (8000);
  - **`buy(player, item, phase)`:**
    - refused outside `buy`, for a dead player, for an unknown item, or with `money < price`;
    - a blaster replaces `gear`;
    - `cardboard-vest` sets armour to 50;
    - money is reduced by the price;
  - **`GEAR`:** has `stapler` (price 0), `foam-repeater` (1100), `band-scatter` (1600, 6 pellets), `paint-marker` (2400) and `mail-tube` (3800) with the stats in research R7, plus `cardboard-vest` (600). At least 5 blasters with distinct (damage, rpm, range, spread) (FR-013).
- [X] T005 [P] Write tests/unit/arena-shot.test.ts for `castShot(world, shooter, targets, angle, gear, rng)`, using `compileWorld` of a small test layout:
  - a target straight ahead within range is hit, and the nearest of two in a line is the one hit;
  - a target behind a wall tile or a solid furniture tile is missed, and so is one beyond `gear.range`;
  - a target exactly `HIT_RADIUS` (0.3) off the line is hit, and 0.31 off is missed;
  - with a seeded `rng`, spread changes the angle within ±`spread/2` degrees, and the same seed gives the same result;
  - `band-scatter` returns 6 rays, and each can hit;
  - the returned tracer end point is the hit point, the wall point, or the end of range.
- [X] T006 [P] Write tests/unit/arena-spawns.test.ts for `arenaSpawns(world)` on `compileWorld(defaultLayout())` and on a small custom layout:
  - two groups of 5 tiles;
  - every tile walkable and not in any area or desk space;
  - the group anchors at least half the layout's diagonal apart;
  - deterministic;
  - returns null when there are fewer than 10 open-floor tiles.
- [X] T007 [P] Write tests/unit/arena-move.test.ts for `moveAllowed(from, to, dtMs)`:
  - allowed when the distance is at most `WALK_SPEED × RUN_MULT × dt × 1.5 + 0.3`;
  - refused beyond it, for example 10 tiles in 100 ms;
  - `dtMs` capped at 1000, so a long pause doesn't allow a teleport.
- [X] T008 [P] Extend tests/unit/proximity.test.ts for `computeLinks` with `office.match: Set<string>`:
  - a player and a non-player standing together never link (no conversation, no ambient);
  - two players standing together link as on the open floor;
  - two non-players are unaffected;
  - with no `match` set, the results are identical to before (existing tests unchanged).
- [X] T009 [P] Write tests/unit/office-arena-entry.test.ts for `OfficeState.checkEntry` with a player in a match (an `inArena(id)` callback):
  - moving into a private area (meeting room) returns `'arena'`;
  - moving into a desk space that isn't the member's own returns `'arena'`;
  - their own desk space and the open floor are allowed;
  - a non-player is unaffected.

### Implementation

- [X] T010 Create shared/arena.ts (pure) and make T004–T007 pass. It exports:
  - the types `MatchState` and `ArenaPlayer` (data-model);
  - the constants `MAX_PLAYERS = 10`, `MIN_PLAYERS = 2`, `WIN_TARGET = 5`, `BUY_MS = 15000`, `PLAY_MS = 120000`, `ROUND_END_MS = 5000`, `HEALTH = 100`, `ARMOUR = 50`, `HIT_RADIUS = 0.3`, `ECONOMY = { start: 1000, tag: 250, win: 2500, loss: 1200, cap: 8000 }` and `GEAR` (research R7);
  - the functions `assignTeams`, `teamForNewcomer`, `stepMatch(match, now, input?: { op?: 'begin' | 'reset' })`, which returns `{ match, events }` with events such as `roundStart`, `roundEnd` and `matchEnd`, plus `canHit`, `applyHit`, `rewardTag`, `rewardRound`, `buy`, `castShot`, `arenaSpawns` and `moveAllowed`;
  - `castShot`, a tile DDA ray (stopping at `isWall` and `isBlocking` from shared/map.ts) plus a circle test per target.
- [X] T011 In shared/proximity.ts, add `match?: ReadonlySet<string>` to `OfficeInput`. In `computeLinks`, skip every pair where exactly one side is in `match`, for both conversation and ambient links. Make T008 pass.
- [X] T012 In server/office.ts, give `OfficeState` an `inArena: (playerId: string) => boolean` hook (default `() => false`). In `checkEntry`, return `'arena'` first when `inArena(p.id)` and the target is a private area different from the current one, or a desk space that isn't `deskOf(p.memberId)`. Make `linkInput()` include `match` from a `matchPlayers: () => ReadonlySet<string>` hook. Make T009 pass.

**Checkpoint**: `npm test` is green. All the rules exist, and the office hooks do nothing until a match exists.

---

## Phase 3: User Story 1 - Start a match, play rounds, and see the score (Priority: P1) 🎯 MVP

**Goal**: start and join; Begin; two teams teleported to spawns; buy then play phases; firing decided on the server; tag-outs and spectating; round and match end; a scoreboard with the kill count.

**Independent Test**: quickstart Q1.

### Tests (write first, see them fail)

- [X] T013 [P] [US1] Write tests/integration/ws-arena.test.ts (`startTestServer` and `connectClient` from tests/integration/helpers.ts). Place 4 clients on open floor, then check:
  - **start and join:** A `arena start` → every client gets `arena` with `match.phase === 'lobby'` and `host === A.id`. B, C and D `join`. A second `start` gets `notify` "A match is already running". An 11th player gets "The match is full";
  - **begin:** A `begin` → `arena` phase `buy` with two teams of 2, and each player gets a `teleport { reason: 'arena' }` to a tile from `arenaSpawns`;
  - **after a teleport:** following the round-start teleport, a small `state` move (0.2 tiles) from each player is accepted (no `correct`). After `leave`, a small move from the returned spot is accepted too;
  - **mid-round join:** E joins during `play`. E is placed on the smaller team, `arena.alive` doesn't include E, a `fire` from E has no effect, and E gets no teleport until the next round start, when E is teleported and alive;
  - **frozen buy phase:** a `state` move during `buy` gets `correct { reason: 'arena' }`;
  - **firing:** after `play` (use a test server option `arenaTimings` to shorten phases to 50 ms, 500 ms and 50 ms), A turns to face C and sends `fire`. Every client gets `arenaShot` with `hit: C.id`, and C gets `arenaYou { health < 100, event: { kind: 'hit', by: A.id } }`;
  - **tag-outs and round end:** repeated fires tag C out (`arenaYou event tagged`, `arena.alive` without C). Tagging D ends the round: `arena` phase `roundEnd` with `wins.blue === 1` (or the right team), and players get `arenaBoard` with A's `tags === 2`;
  - **match end:** play to `WIN_TARGET` with the short timings, and the phase becomes `matchEnd`.
- [X] T014 [P] [US1] Add to tests/integration/ws-arena.test.ts the **cheating attempts** (SC-006):
  - 50 `fire` in 1 s from A count at most the gear's rate (`stapler`: 240 per minute, so at most 5 in 1 s with slack);
  - `fire` from a tagged-out player has no effect;
  - `fire` with `a: NaN` is dropped;
  - a `state` 10 tiles away for a match player gets `correct`;
  - a shot through a wall (C behind a wall from A) misses;
  - `walkToDesk` from a match player → `notify` "Not during a match" and no `teleport`. A ring accepted by a match player → the same;
  - `share { on: true }` from a match player → `shareState { on: false, reason: 'arena' }`. `avatar` from a match player → no change for others.

### Implementation: server

- [X] T015 [US1] Create server/arena.ts with a `MatchEngine` class:
  - it holds `MatchState | null`, the per-player `returnTo` poses and a seeded rng;
  - it's constructed with `players()`, `send(id, msg)`, `broadcast(msg)`, `teleport(id, x, y, a)`, `world()` and optional `timings` (for tests);
  - it exposes `start(p)`, `join(p)`, `leave(id)`, `begin(id)`, `stop(by)`, `reset(id)`, `fire(p, a, seq)`, `buy(p, item)`, `isPlayer(id)`, `players()` (as a set), `summary()` and `tick(now)`;
  - `tick` runs `stepMatch` every 100 ms while a match exists, and applies its events: teleport to spawns at round start, rewards, `arenaBoard` at round end, the public `arena` summary on every change;
  - `fire` checks the phase, alive, `canHit` and the fire rate (`60000 / rpm × 0.9` ms since `lastShotAt`), then calls `castShot` with the alive opponents only (never non-players). It broadcasts `arenaShot`, sends `arenaYou` to the shooter (`event tag` on a tag-out) and the target (`hit` or `tagged`), and calls `rewardTag`;
  - `returnTo` is recorded on `join` and `start`.
  - **Every arena teleport** (round start, leave, stop, reset, the Arena switched off) sets the player's server position (`p.x`, `p.y`, `p.a`) itself, and resets the speed-check baseline (`lastX`, `lastY`, `lastMoveAt = now`) before sending `teleport { reason: 'arena' }`. The next `state` from the browser is then measured from the new spot.
  - A player who joins during `buy`, `play` or `roundEnd` is assigned with `teamForNewcomer`, is not alive until the next `roundStart`, and is teleported with everyone then.
- [X] T016 [US1] In server/app.ts:
  - create the `MatchEngine` with the hooks above (`timings` from a new `ServerOptions.arenaTimings` for tests), and start its interval;
  - wire `office.inArena = (id) => arena.isPlayer(id)` and `matchPlayers = () => arena.players()`;
  - handle `msg.t === 'arena'` (`start`, `join` and `begin` here; the rest in US3), `fire` (validate `a` is finite and `seq` an integer) and `buy` (wired in US2);
  - in the `state` handler, for match players, refuse moves during `buy` or while dead, and moves failing `moveAllowed` against the player's `lastX`, `lastY` and `lastMoveAt`, replying with `correct { reason: 'arena' }`. Also refuse moves, and drop `fire`, from match players whose current `mode` is `'2d'`;
  - call `links.update()` after a join, leave or round start, so voice re-groups;
  - for match players, refuse `walkToDesk` and the accept side of `ringReply` with `notify` "Not during a match", and send no teleport;
  - for match players, refuse `share { on: true }` (reply `shareState { on: false, reason: 'arena' }`; add `'arena'` to the `shareState` reasons in shared/protocol.ts), `avatar` (ignored, and the current look re-broadcast to the sender) and the builder and studio API (`HttpError(409, { error: 'in-match' })` in server/api.ts via an `inArena(memberId)` context hook), each with "Not during a match".
  Make T013 and T014 pass.

### Implementation: browser

- [X] T017 [P] [US1] Create src/arena/client.ts, holding the browser's arena state from `arena`, `arenaYou` and `arenaBoard` messages:
  - `inMatch(myId)`, `myTeam`, `phase`, `endsIn` (a local countdown), `teams`, `alive`, `you` (health, armour, money, gear) and `board`;
  - `fire(a)`: if in the play phase and alive, send `{ t: 'fire', a, seq: ++seq }`, and show a local muzzle flash and tracer at once;
  - **spectating:** when not alive, `spectateTarget()` returns a living teammate's id, and `nextSpectate()` cycles.
- [X] T018 [P] [US1] Create src/arena/hud.ts, a DOM overlay (index.html `#arenaHud`, styles in src/style.css with existing tokens) showing (contracts/ui-behavior.md "For players"):
  - a crosshair;
  - health and armour bars;
  - money;
  - gear name;
  - phase and time ("Buy 0:12", "0:47");
  - team scores ("Blue 2 – 1 Orange");
  - a hit marker (on an `arenaYou` hit confirmation for my `seq`);
  - a red flash when hit;
  - "Tagged by <name> · spectating <teammate>";
  - the round and match end banners.
  It's hidden when not in a match.
- [X] T019 [P] [US1] Create src/arena/board.ts, the scoreboard (index.html `#arenaBoard`): rows by team with name, tags, tag-outs and money, plus the team wins. It shows while **K** is held, and for 5 s at round end and until dismissed at match end.
- [X] T020 [US1] In src/main.ts:
  - add an **Arena** button to the top-right actions (index.html) opening an Arena panel (index.html `#arenaPanel`) with **Start match** / **Join** / **Leave** and, for the host, **Begin**;
  - handle `arena`, `arenaShot`, `arenaYou` and `arenaBoard` by passing them to the arena client and refreshing the HUD;
  - in first person while the pointer is locked and in a match, a left click calls `arena.fire(me.a)` (instead of nothing);
  - while tagged out, the camera follows `spectateTarget()` (render first person from that player's position and angle), and a click cycles;
  - handle `teleport { reason: 'arena' }` by jumping and switching to first person;
  - while in a match, **K** shows the scoreboard, and movement is blocked locally during the buy phase, while dead, and in top-down while in a match (no moving, and no fire, which needs pointer lock anyway). The server enforces all three too;
  - show `correct { reason: 'arena' }` as "Not during a match" (src/office-ui.ts).
- [X] T021 [US1] Draw the match in both views (Constitution II):
  - **src/render2d.ts:** a team-colored ring under each match player, tracer lines for 150 ms from `arenaShot`, and a short puff when a player is tagged out;
  - **src/render3d.ts:** a small team-colored marker above match players' heads (alongside their name labels), tracer quads drawn after walls with depth test, and a puff sprite;
  - colors: blue `#3fa7d6` and orange `#f29e4c` (the existing palette).

**Checkpoint**: quickstart Q1 passes with 4 tabs. Players can start, play rounds to a match win, and see tags on the scoreboard.

---

## Phase 4: User Story 3 - Start, stop, reset, and leave back to the office (Priority: P1)

**Goal**: host Stop and Reset, Leave for anyone, host handover, return to the exact office pose, the admin switch, and the lock-outs while playing.

**Independent Test**: quickstart Q3 and Q5.

### Tests (write first, see them fail)

- [X] T022 [P] [US3] Add to tests/integration/ws-arena.test.ts:
  - **leave:** B `leave` → B gets `teleport { reason: 'arena' }` to B's pose before joining, and the match continues;
  - **reset:** A (host) `reset` → round 1, wins 0, `arenaBoard` all zeros;
  - **host only:** a non-host `stop` or `reset` gets `notify` "Only the host can do that";
  - **handover:** the host disconnects → `arena.host` becomes the earliest-joined remaining player;
  - **stop:** the host `stop` → every player is teleported to their saved pose, and `arena.match === null`;
  - **admin switch:** an admin `{ t: 'admin', op: 'arena', enabled: false }` during a match → stopped as above, `adminState.arenaEnabled === false`, and `start` refused with "The Arena is switched off". After a server restart with the same data folder, it's still off.

### Implementation

- [X] T023 [US3] In server/arena.ts and server/app.ts:
  - `leave`, `stop` and `reset` (host only; `stop` also for admins);
  - on `onClose` call `arena.leave(id)`;
  - host handover to the earliest `joinedAt`;
  - a match with no players left is removed;
  - every return sends `teleport { reason: 'arena', x, y }` from `returnTo`, and the browser restores the facing and view (T025).
  Make T022's leave, reset, stop and handover cases pass.
- [X] T024 [US3] Add the admin switch:
  - in server/store.ts, `arenaEnabled?: boolean` on `StoredState`, read in `parseState` as `r.arenaEnabled !== false` with **no** `STATE_VERSION` change (it's an additive field), and saved with the rest;
  - in server/office.ts, `arenaEnabled` and `setArenaEnabled`;
  - in server/app.ts, the admin op `arena`, which stops a running match when switched off and broadcasts `adminState` with `arenaEnabled`, and `start` refuses while it's off;
  - in src/office-ui.ts, an **Arena enabled** checkbox in the admin panel next to "Building enabled".
  Make T022's admin case pass.
- [X] T025 [US3] In src/main.ts:
  - store `{ x, y, a, mode }` locally on joining;
  - on a `teleport { reason: 'arena' }` that returns to the office (`arena.match` null, or I'm no longer in it), restore `a` and `mode` from the stored pose;
  - the Arena panel gets **Leave** for all, and **Stop** and **Reset** for the host, with a confirm for Stop;
  - while in a match, disable **Build** (`toggleBuild`), the studio, **Character** and **Share screen**, each with the title "Not during a match";
  - joining while sharing a screen first stops the share (`endShare()`) with a notice.
- [X] T026 [US3] Run quickstart Q3 and Q5 with 4 tabs and an admin tab. Record in specs/010-office-arena-rounds/checklists/validation.md: time to return (SC-004, at most 2 s), the pose, facing and view restored, desk, status and call unchanged, and the admin switch surviving a restart.

**Checkpoint**: quickstart Q3 and Q5 pass. **MVP (US1 + US3) is complete:** play, control and return.

---

## Phase 5: User Story 2 - Earn money and buy gear between rounds (Priority: P1)

**Goal**: the shop during the buy phase, server-checked purchases, money rewards, and gear kept by survivors.

**Independent Test**: quickstart Q2.

- [X] T027 [P] [US2] Add to tests/integration/ws-arena.test.ts (contracts/protocol.md, `buy`):
  - in round 1's buy phase, `buy paint-marker` with 1000 → `arenaYou event refused` and money unchanged;
  - `buy cardboard-vest` → money 400 and armour 50;
  - `buy` during `play` → refused;
  - after a round A won with 2 tags: A's money is `1000 + 2×250 + 2500` minus purchases, and the losers have `+1200`;
  - a survivor keeps `paint-marker` into the next round, and a tagged-out player has `stapler`;
  - money never goes over 8000;
  - `buy` with an unknown item is refused.
- [X] T028 [US2] In server/arena.ts and server/app.ts, wire `buy` to shared `buy()`. Reply with `arenaYou` (`event bought` or `refused`, with the new money, gear and armour). Apply `rewardRound` at round end. Make T027 pass.
- [X] T029 [US2] Create src/arena/shop.ts (index.html `#arenaShop`):
  - opened with **B** during the buy phase while in a match (in src/main.ts, B opens the shop instead of Build while in a match), and closed on Esc or when the play phase starts;
  - each `GEAR` item shows its name, price, stats (damage, rate, range, spread, or protection) and a Buy button;
  - unaffordable items are dimmed with "Not enough money";
  - Buy sends `{ t: 'buy', item }`, and the HUD updates from `arenaYou`.

**Checkpoint**: quickstart Q2 passes.

---

## Phase 6: User Story 4 - Watching from the office (Priority: P2)

**Goal**: non-players see markers, streaks and a banner, but are never hit, hear nothing, and their rooms and desks stay closed to players.

**Independent Test**: quickstart Q4, plus the automated privacy test.

- [X] T030 [P] [US4] Write tests/integration/ws-arena-privacy.test.ts (contracts/protocol.md "Privacy invariants"):
  - **non-player W in the line of fire:** A fires through W at C. W gets no `arenaYou` and isn't hit (the shot hits C, or misses), and W's state is unchanged;
  - **private messages:** over a whole round, W receives no `arenaYou` and no `arenaBoard`;
  - **voice:** A (a player) and W stand side by side. No `links` message to either pairs them while the match runs. After A leaves, they link again as normal;
  - **rooms:** A walks to Meeting Room A's door → `correct { reason: 'arena' }`. A walks into W's claimed desk space → `correct { reason: 'arena' }`;
  - **meetings:** M1 and M2 in Meeting Room A keep their conversation throughout.
- [X] T031 [US4] Make T030 pass. It should already hold from T011, T012 and T015: fix whatever doesn't, without weakening the test.
- [X] T032 [US4] In src/main.ts and src/arena/client.ts, show non-players a banner (index.html `#arenaBanner`): "Office Arena: Blue 2 – 1 Orange · Join" (Join hidden when full or the Arena is off). Non-players see team rings and markers, tracers and puffs (T021) and hear no arena sounds (T033 plays sounds only `if inMatch`).

**Checkpoint**: quickstart Q4 passes.

---

## Phase 7: Polish & cross-cutting concerns

- [X] T033 [P] Create src/arena/sound.ts: short synthesized blips with Web Audio (an oscillator and an envelope, no files) for a shot, a hit, a tag-out and the round start. They play **only for match players**.
- [X] T034 [P] In README.md, add an "Office Arena" section:
  - how to start, join, Begin, Stop, Reset and Leave;
  - the keys (click fire, B shop, hold K scoreboard);
  - teams, rounds and money in a sentence;
  - that non-players are never affected;
  - that admins can switch it off.
  Add the Arena button to the controls table.
- [X] T035 Run quickstart Q6 (cheating) and Q7 (10 tabs, 5 versus 5): frame rate in first person for a player and a non-player (SC-005, about 60), and the server link tick in the log (at most 20 ms). Also time Q1 step 1 (SC-001, under 30 s). Also measure SC-002: over 50 shots with 4 tabs, log the time from the shooter's `fire` to each tab's `arenaShot` (synchronize with `performance.timeOrigin` and `Date.now()` per tab), and record the 95th percentile (target at most 0.5 s). Record everything in validation.md.
- [X] T036 [P] Check `npm run typecheck` and `npm test`. The full suite must pass, with the new files on top of the 733 baseline. Record the numbers in validation.md.

---

## Dependencies & execution order

- **Phase 1:** T001, then T002 and T003 in parallel.
- **Phase 2** depends on T003:
  - the tests T004–T009 run in parallel;
  - T010 depends on T002 (`moveAllowed` uses `WALK_SPEED`/`RUN_MULT`) and makes T004–T007 pass;
  - T011 makes T008 pass, and T012 makes T009 pass.
- **Phase 3, US1** depends on Phase 2:
  - T013 and T014 run in parallel;
  - T015 comes before T016, which makes T013 and T014 pass;
  - T017, T018 and T019 run in parallel (separate files), then T020, then T021.
- **Phase 4, US3** depends on T016 and T020: T022 first, then T023, T024 and T025 (T024 can run alongside T023), then T026.
- **Phase 5, US2** depends on T016 and T020. T027 and T029 run in parallel, and T028 makes T027 pass.
- **Phase 6, US4** depends on T016 and T021. T030 comes before T031, and T032 comes after T020.
- **Phase 7** depends on the stories that are included.

### Story completion order

```text
Setup → Foundational (rules + office hooks) → US1 (play) → US3 (control + return) ─┬─▶ US2 (shop)
                                                                                    └─▶ US4 (watchers)
```

## Parallel examples

- **Phase 2 tests:** T004 (arena-rules), T005 (arena-shot), T006 (arena-spawns), T007 (arena-move), T008 (proximity match) and T009 (office entry). They are six files.
- **US1:** tests T013 and T014; then T017 (client), T018 (HUD) and T019 (board) in parallel.
- **After US3:** US2 (T027–T029) and US4 (T030–T032) can be built in parallel.

## Implementation strategy

1. **MVP = US1 + US3:** start, join, rounds, server-decided hits, the scoreboard, and Stop, Reset and Leave back to the exact office pose, with non-players untouched by the foundational hooks. Ship after T026.
2. **Then US2:** the shop and economy.
3. **Then US4:** the watchers' banner and its privacy test.
4. **Polish:** sounds, README, and the 5-versus-5 performance check.
5. After each phase, run the full suite. After Phase 2, check the office is unchanged with no match running (Q0).

---

## Phase 8: Convergence

- [X] T037 Check that shots, tag-outs and team markers can actually be seen in the **first-person** view, per FR-002, FR-021 and FR-022 (partial). validation.md says "A tracer in the first-person view was not seen in a screenshot (it lasts 150 ms)". With two Chrome tabs in a match:
  - capture the first-person canvas of a player and of a non-player watching, every 30 ms, during a burst of shots;
  - check that at least one frame shows the tracer quad, one the tag-out puff, and every frame the team marker above each player's head, in blue `#3fa7d6` and orange `#f29e4c`;
  - save one example frame to specs/010-office-arena-rounds/checklists/;
  - fix the drawing in src/render3d.ts if any of them is missing, for example a depth test hiding the quad.
