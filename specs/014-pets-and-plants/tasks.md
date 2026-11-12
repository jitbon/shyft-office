---
description: "Tasks for Pets and Plants (014)"
---

# Tasks: Pets and Plants

**Input**: Design documents from `specs/014-pets-and-plants/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/protocol.md, contracts/ui-behavior.md, quickstart.md

**Tests**: included. Constitution V requires unit tests for deterministic logic: rules, validation, pose, spots. Constitution III requires tests of server refusals. The quickstart gives a runnable scenario for each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US3 from spec.md

## Notes for every task

- **Constants** (data-model.md): `MAX_PLANTS = 3`, `NAME_MAX = 20`, `HAPPY_MS = 2 h`, `NEGLECT_MS = 24 h`, `STAGE_DAYS = [1, 3, 5]`, `CARE_RANGE = 1`, `CARE_RANGE_SERVER = 1.5`, `FOLLOW_GAP = 1.2`, `IDLE_AFTER_MS = 2000`, `JUMP_TILES = 3`, `AWAY_MAX = 5`, `MAX_COMPANION_RECORDS = 2000`. Define them once in `shared/pets.ts` and never repeat the numbers elsewhere.
- **Kinds**: pets `'cat' | 'dog' | 'rabbit' | 'bird'`, colors `0 | 1 | 2`. Plants `'sunflower' | 'tulip' | 'cactus' | 'fern'`. Actions `'pet' | 'feed' | 'play'` for pets and `'water'` for plants.
- **Nothing ever goes down** (FR-010, SC-005):
  - `wateredDays` only increases;
  - mood is never lower than `'sleepy'`;
  - nothing is removed except by the owner (confirmed), or as part of an admin's member-data removal.
- **Ownership** comes from the connection's member id, never from a message. Guests are ids starting `eph-`.
- **No pet position messages.** Positions come from `petPose` on both server and client (research R3).
- Run `npm test` and `npm run build` at the end of each phase.

---

## Phase 1: Setup

- [X] T001 [P] Create `tests/unit/pets.test.ts` with one placeholder `describe('pets')` that imports from `shared/pets.ts` (it fails until T004).
- [X] T002 [P] Create `tests/integration/ws-pets.test.ts` with the helpers from `tests/integration/helpers.ts`: start a server with a temp `dataDir`, connect member A and member B (UUID ids) and guest G (no member id), and add a `waitFor(client, pred)` helper. Add one smoke test: all three receive `welcome`.
- [X] T003 [P] Create `tests/unit/store-companions.test.ts` with a placeholder that imports `parseState` from `server/store.ts`.

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: the shared types and rules, saving, the server book, the care pipeline and the client store. All three stories build on these.

### Tests first

- [X] T004 [P] In `tests/unit/pets.test.ts`, test:
  - `cleanPetName`: trims, removes control characters, collapses whitespace, cuts to 20 characters, and returns the fallback for empty input;
  - `isPetKind`, `isPlantKind`, `isPetColor` and `isCareAction`: accept only the listed values;
  - `actionFits(action, target)`: `water` only for plants, and `pet`/`feed`/`play` only for pets.
- [X] T005 [P] In `tests/unit/pets.test.ts`, test `canCare(carer, target, world, range)`:
  - true at distance 1.0 and false at 1.6, with the server range 1.5;
  - false when the target's tile is in a private area and the carer is outside it, or in a different area;
  - true when both are in the same private area.

  Use a small test world built with the existing world helpers.
- [X] T006 [P] In `tests/unit/store-companions.test.ts`, test `parseState` with a `companions` field:
  - keeps UUID members only (drops `eph-` and junk ids);
  - drops an invalid kind or color;
  - re-cleans names;
  - caps plants at 3 and drops duplicate plant ids;
  - clamps negative and non-finite numbers to 0;
  - keeps the 2000 records with the newest `lastSeen` (0 counts as newest, meaning online);
  - leaves `version` at 4.

  A file without `companions` parses to no `companions` field.

### Implementation

- [X] T007 Create `shared/pets.ts` with:
  - the kinds and color tables: `PET_KINDS` (name and 3 color names per kind) and `PLANT_KINDS` (name per kind);
  - the constants listed in Notes;
  - the types `PetKind`, `PetColor`, `PlantKind`, `CareAction`, `Mood`, `PlantStage`, `CareEntry`, `PetView` and `PlantView`, exactly as in data-model.md;
  - the guards `isPetKind`, `isPetColor`, `isPlantKind` and `isCareAction`, plus `actionFits`;
  - `cleanPetName(raw, fallback)`;
  - `canCare(carer: {x, y}, target: {x, y}, world, range)`, using `areaAt` from `shared/map.ts` for the private-area rule;
  - `COMPANION_MESSAGES`, with the codes and texts from contracts/protocol.md.

  Make T004 and T005 pass.
- [X] T008 In `shared/protocol.ts`, add:
  - the client messages `{ t: 'pet', op: 'adopt' | 'edit' | 'remove', … }`, `{ t: 'plant', op: 'add' | 'place' | 'move' | 'unplace' | 'rename' | 'remove', … }` and `{ t: 'care', target: { pet: string } | { plant: string }, action }`;
  - the server messages `petUpsert`, `petGone`, `plantUpsert`, `plantGone`, `care` (with `react: boolean` and optional `wateredDays`), `careSummary` and `companionError`;
  - an optional `welcome.companions?: { pets: PetView[]; plants: PlantView[] }`.

  Follow contracts/protocol.md exactly.
- [X] T009 In `server/store.ts`, add `StoredPet`, `StoredPlant` and `CompanionRecord` (data-model.md) and an optional `StoredState.companions?: Record<string, CompanionRecord>`. Write `readCompanions(raw)` with the rules in T006 and call it from `parseState` for version 4. Add `MAX_COMPANION_RECORDS` usage. Do not bump `STATE_VERSION`. Make T006 pass.
- [X] T010 Create `server/companions.ts` with `class CompanionBook`:
  - constructed with `{ records, now, tzOffsetMin, world: () => World, deskOf(memberId), onChange() }`;
  - `record(memberId)` (create on demand) and `persist()` (returns the records for `StoredState`);
  - `views(forMember?)`: every pet, every placed plant, plus that member's unplaced plants;
  - `petView(memberId, follow?, rest)` and `plantView(plant, owner)`. These never include `byMember`.

  No pet or plant ops yet; those come in US1 and US2.
- [X] T011 Add the care pipeline to `CompanionBook.care(carer: { memberId, name, x, y, inMatch }, target, action, targetPos)`:
  - return `{ ok: false, code }` for `bad` (unknown target or the action doesn't fit), `in-match`, `too-far` and `walls` (via `canCare` with `CARE_RANGE_SERVER`), and `rate`;
  - rate limits: per carer 5 per 10 s, and per target 1 reaction per 2 s. Inside the per-target window, return `{ ok: true, react: false }` and still apply the care;
  - on success, set `lastCare = { by: name, byMember, action, at }`;
  - if the carer is not the owner and the owner is offline (`lastSeen > 0`), push the entry to the front of `away`, keeping at most `AWAY_MAX`;
  - call `onChange()`.

  Leave hooks for the pet and plant effects, which US1 and US2 fill in.
- [X] T012 In `server/office.ts`, include `companions` in `persistState()` from a `companionsPersist` callback that `app.ts` sets, and load `state.companions` into the book at start. Add an `onClaimEnded(memberId, deskId)` hook, called from `unclaim`, from the switch inside `claim`, and for each release in `reconcile()`.
- [X] T013 In `server/app.ts`:
  - create the `CompanionBook` with `officeNow` and the office time zone offset (the same value `welcome.tzOffsetMin` uses);
  - add `PER_SECOND.companion = { count: 4 }`;
  - add `companions: book.views(c.p.memberId)` to `welcome`;
  - route `care` messages: work out the target position (pet: T019's `petPos`, a stub returning the rest spot for now; plant: its spot centre), call `book.care`, then broadcast `{ t: 'care', … }` or send `companionError` with its message from `COMPANION_MESSAGES` to the sender;
  - refuse `pet` and `plant` ops from guests with `not-member`.
- [X] T014 Create `src/pets.ts` with a client store:
  - pets keyed by owner and plants keyed by id, filled from `welcome.companions` and kept current by `petUpsert`, `petGone`, `plantUpsert`, `plantGone` and `care` (which updates `lastCare`, `lastCareAt` or `lastWateredAt`, and `wateredDays`);
  - a reactions queue `{ target, action, at }` for `care` messages with `react: true`;
  - `nearestTarget(me, world)`: the nearest pet or placed plant within `CARE_RANGE` that `canCare` allows.

  Wire the messages in `src/main.ts`.
- [X] T015 [P] Create `src/pets-art.ts`:
  - original, code-drawn pictures for 4 pet kinds × 3 colors, each with walk (4 directions × 2 frames), sit, sleep and happy frames;
  - 4 plant kinds × 4 stages, plus a drooping variant of each;
  - reaction effects: hearts, bowl and crumbs, hop sparkle, water splash, stage sparkle.

  Draw each picture once into a cached canvas, in the pixel style and palette approach of `src/art.ts`, with nothing copied from any product (FR-017). Export `petFrame(kind, color, pose, dir, frame)`, `plantFrame(kind, stage, droopy)` and `reactionFrame(action, t)`.
- [X] T016 Add the "Press X" chip and the care action menu in `src/pets.ts`, with the elements in `index.html` and styles in `src/style.css`:
  - X (ignored in text fields, during a match, or with no target) or a click within 1 tile opens a menu at the target, with Pet / Feed / Play or Water. Keys 1–3 pick an action, and Esc closes the menu. Picking sends `care`. The menu also closes on walking more than 1.5 tiles away;
  - a click from farther away shows "Walk closer" for 1.5 s;
  - `companionError` shows as a notice.

  Click routing in `src/main.ts` checks pets and plants before the person card.

**Checkpoint**: tests pass. The server saves and loads companion records, and a care message to a non-existent target is refused with `bad`.

---

## Phase 3: User Story 1 - Adopt a pet and look after it (Priority: P1) 🎯 MVP

**Goal**: a member adopts a pet that follows them, rests when they are away, and anyone nearby can pet, feed or play with it.

**Independent Test**: quickstart US1, steps 1–9.

### Tests first

- [X] T017 [P] [US1] In `tests/unit/pets.test.ts`, test:
  - `moodOf`: `lastCareAt` at now−1 h → happy, now−3 h → content, now−25 h → sleepy;
  - `Trail`: points are added only after a move of ≥ 0.1 tile, at most 32 are kept, and a move of > 3 tiles clears the trail;
  - `petPose` following: 1.2 tiles behind the owner along the trail, after a straight walk;
  - `petPose` idle: after `IDLE_AFTER_MS` without moving, the pose is sit, look or wander. It is deterministic for the same `petId` and time, and wander points are never on blocking tiles;
  - `petPose` resting: within 1 tile of `rest`;
  - `petCornerSpot(world, i)`: distinct, walkable tiles for i = 0..4.
- [X] T018 [P] [US1] In `tests/integration/ws-pets.test.ts`, test:
  - A adopts `{ kind: 'cat', color: 1, name: '  Miso  ' }` → B gets `petUpsert` with `name: 'Miso'` and `follow` set to A's player id;
  - A adopting again → `has-pet`;
  - G adopting → `not-member`;
  - B at distance 1 sends `feed` → everyone gets `care` with `react: true`, and A's pet `lastCare.by` is B's name, with no `byMember` anywhere on the wire;
  - B at distance 4 → `too-far`;
  - pet inside a private area and B outside → `walls`;
  - two feeds within 2 s → the second has `react: false`;
  - the 6th care within 10 s → `rate`;
  - A disconnects → `petUpsert` without `follow`, with `rest` at A's desk spot (or the pet corner);
  - A rejoins → `follow` again;
  - A edits name and color → `petUpsert`;
  - A removes → `petGone`;
  - restart the server on the same `dataDir` → the pet is in `welcome.companions`.

### Implementation

- [X] T019 [US1] In `shared/pets.ts`, add:
  - `moodOf(lastCareAt, now)`;
  - `class Trail`, the ring buffer from data-model.md;
  - `petCornerSpot(world, index)` (via `nearestFreeTileNear(SPAWN)` order);
  - `petRestSpot(world, deskId | undefined, index, takenByPlants)`;
  - `petPose({ trail, now, petId, mode, rest, world })`, returning `{ x, y, a, pose }` per research R3, using a small integer hash of `petId` and `floor(now / 4000)` for idle choices.

  Make T017 pass.
- [X] T020 [US1] In `server/companions.ts`, add:
  - `adopt(memberId, name, kind, color)` → `has-pet`, `bad` or ok, setting `adoptedAt = lastCareAt = now`;
  - `editPet(memberId, { name?, color? })` → `no-pet`, `bad` or ok;
  - `removePet(memberId)`;
  - the pet effect of care: `lastCareAt = now`;
  - `followOf(memberId)`: the oldest connection's player id when it is not in a match and not a jam listener, otherwise undefined;
  - `restOf(memberId)`: the owner's desk spot via `petRestSpot`, or the pet corner, indexed by the order of resting pets with no desk, sorted by owner id.
- [X] T021 [US1] In `server/app.ts`:
  - keep a `Trail` per connection, fed from accepted `move` and `teleport` positions;
  - implement `petPos(ownerId)` with `petPose` (the followed connection's trail, or the rest spot) for care range checks;
  - route `pet` ops with the `companion` rate limit and broadcast `petUpsert` / `petGone`;
  - broadcast `petUpsert` for the owner whenever `followOf` or `restOf` changes:
    - their first connection opens, or their last one closes (also set `lastSeen = now` then, and `0` on join);
    - inside the arena `changed` callback and `syncJam`, for the affected players;
    - on desk claim, unclaim, switch and `reconcile()`;
    - when the followed tab closes but another tab stays open.

  Make T018 pass.
- [X] T022 [US1] In `src/pets.ts`:
  - keep a `Trail` per player (including me), fed from state updates and local movement;
  - each frame, compute every pet's pose with `petPose`, using `Date.now() + clockOffset` and its mode (`follow` present → that player's trail, else `rest`);
  - expose `petPoses()` for the renderers;
  - work out the mood with `moodOf` for the art.
- [X] T023 [P] [US1] In `src/render2d.ts`:
  - draw pets in the same y-sorted pass as players: shadow, then the `petFrame` for kind, color, pose, direction and walk frame, about half an avatar tall;
  - below each pet, a small name tag (`drawNameTag` at a smaller size);
  - mood on the picture: Happy shows an occasional heart, and Sleepy/hungry uses the sleep frame with a "z";
  - a running reaction from the queue draws `reactionFrame` above the target;
  - the "Press X" chip above the current `nearestTarget`.
- [X] T024 [P] [US1] In `src/render3d.ts`, add pets as sprites in the distance-sorted list, at half avatar height, facing the camera with direction frames as for players. Add the name label, mood marks and reactions as for player labels and effects. Show the "Press X" chip under the crosshair when the nearest target is within 1 tile and roughly centred.
- [X] T025 [US1] Create `src/pets-panel.ts`, with a 🐾 top-bar button in `index.html` and styles in `src/style.css`:
  - **no pet**: a kind grid with 3 color swatches each, a name field (`maxlength=20`, prefilled with the kind's name) and **Adopt**;
  - **with a pet**: its picture, "Miso is happy/content/sleepy", a name field and color dots (send `edit` on change), the last care line ("Fed by Sam · 2 h ago"), and **Send away…**, confirmed with "Send Miso away? This can't be undone.";
  - **guests**: the guest line from contracts/ui-behavior.md instead of the controls;
  - errors show inline.

**Checkpoint**: US1 works on its own: quickstart US1 passes in two windows.

---

## Phase 4: User Story 2 - Grow a plant and water it (Priority: P2)

**Goal**: up to 3 plants per member at their desk, watered by anyone, growing over watering days, drooping after 24 h without water.

**Independent Test**: quickstart US2, steps 1–5.

### Tests first

- [X] T026 [P] [US2] In `tests/unit/pets.test.ts`, test:
  - `stageOf`: 0 → 0, 1 → 1, 2 → 1, 3 → 2, 4 → 2, 5 → 3, 9 → 3;
  - `dayKey`: around midnight with a tz offset of +60 and −300 minutes;
  - `water`: two waterings on the same day add 1, waterings on 5 different days → `wateredDays` 5 and stage Bloom, gaps between days don't matter, and `wateredDays` never decreases;
  - `droopy`: at +23 h false, at +24 h true, and false again just after watering;
  - `plantSpots`: walkable desk-space tiles without the seat, in reading order;
  - `nextSpot`: wraps around, skips taken spots, and returns undefined when all are taken.
- [X] T027 [P] [US2] In `tests/integration/ws-pets.test.ts`, test:
  - A without a desk adds a tulip → `plantUpsert` only to A, without a spot, and `place` → `no-desk`;
  - A claims a desk and places it → everyone gets `plantUpsert` with a spot inside A's desk space;
  - `move` → the next spot;
  - a 4th plant → `too-many`;
  - B adding to A's plant → `not-yours`;
  - B waters at distance 1 → `care` with `wateredDays: 1`;
  - with the injected clock moved across 5 days and a watering each day → `wateredDays: 5`;
  - A unclaims → everyone gets `plantGone`, and A gets `plantUpsert` without a spot;
  - A renames → `plantUpsert`;
  - A removes → `plantGone`;
  - a restart keeps it.

### Implementation

- [X] T028 [US2] In `shared/pets.ts`, add `stageOf`, `dayKey`, `water(plant, now, tzOffsetMin)` (data-model.md rule), `droopy`, `plantSpots(world, deskId)` (desk-space tiles from the world's desk spaces, walkable by `isBlocking`, minus the seat) and `nextSpot`. Make T026 pass.
- [X] T029 [US2] In `server/companions.ts`, add:
  - `addPlant(memberId, name, kind)`: refuse with `too-many` at 3 or `bad` for a bad kind; the id is `'pl-' + 8 random base36` (unique); `addedAt = lastWateredAt = now`; `wateredDays = 0`; auto-place it when the member holds a desk with a free spot;
  - `placePlant`, `movePlant`, `unplacePlant`, `renamePlant` and `removePlant`, with `not-yours`, `no-desk` and `no-spot` as in contracts/protocol.md;
  - the plant effect of care: `water(…)`;
  - `deskLost(memberId)`: unplace every plant.
- [X] T030 [US2] In `server/app.ts`:
  - route `plant` ops with the `companion` limit;
  - send `plantUpsert` to everyone when the plant is placed, and to the owner's tabs only when it isn't;
  - send `plantGone` to everyone when it is removed or stops being placed;
  - call `book.deskLost` from `office.onClaimEnded` and send the resulting messages;
  - the care target position for plants is the spot centre.

  Make T027 pass.
- [X] T031 [P] [US2] In `src/render2d.ts` and `src/render3d.ts`, draw placed plants with `plantFrame(kind, stageOf(wateredDays), droopy(lastWateredAt, now))`: in 2D within the y-sorted pass, and in first person as short sprites. Show the water splash and, when `wateredDays` crosses a `STAGE_DAYS` value, the stage sparkle.
- [X] T032 [US2] In `src/pets-panel.ts`, add the plants section:
  - up to 3 rows, each with picture, name (editable), stage name and progress ("Bud · 1 more watering day to bloom"), **Place** / **Move** / **Unplace**, and **Remove…** (confirmed);
  - **Add a plant** (kind grid plus name) while there are fewer than 3;
  - Place is disabled with "Claim a desk first." when the member holds no desk.

**Checkpoint**: US2 works on its own: quickstart US2 passes. US1 is still green.

---

## Phase 5: User Story 3 - See how loved a pet or plant is (Priority: P3)

**Goal**: hover or click cards with name, owner, mood or stage and last care, plus the "while you were away" summary.

**Independent Test**: quickstart US3, steps 1–2.

### Tests first

- [X] T033 [P] [US3] In `tests/integration/ws-pets.test.ts`, test:
  - A offline, B feeds A's pet and waters A's plant 6 times over time (respecting the rate limits) → when A rejoins, A alone gets one `careSummary` with 5 entries, newest first, each `{ by, action, name, at }`;
  - a second rejoin gets no `careSummary`;
  - care by A themselves is never added;
  - care while A is online is not added.

### Implementation

- [X] T034 [US3] In `server/app.ts` and `server/companions.ts`, on a member's first connection:
  - when `away` is not empty, send `{ t: 'careSummary', entries }`. Each entry names the pet or plant (`name`), and `byMember` is left out;
  - clear `away`, set `lastSeen = 0`, and call `onChange`.

  Make T033 pass.
- [X] T035 [P] [US3] In `src/pets.ts`, add the hover and click card, reusing the `#playerCard` styling. It shows the name, "Sam's cat" or "Sam's tulip", the mood ("Happy") or stage ("Bud"), and the last care ("Fed by Sam · 2 h ago", with relative time from `lastCare.at`).
  - **2D**: on hover.
  - **First person**: on click of the target under the crosshair, shown for 4 s and hidden when the view turns more than 5°, as with the person card from feature 013.
- [X] T036 [US3] In `src/pets-panel.ts`, on `careSummary`:
  - list up to 5 entries at the top of the panel ("Sam fed Miso · yesterday"), kept until the panel is closed;
  - show one notice, "Sam and 2 others looked after your pet and plants while you were away.", through the existing `notice` helper in `src/office-ui.ts`.

**Checkpoint**: all three stories work on their own and together.

---

## Phase 6: Polish & cross-cutting

- [X] T037 [P] In `tools/bots.ts`, add `--pets`: each bot adopts a pet (cycling kinds and colors) after joining and keeps walking. Document it in the file's header comment.
- [X] T038 [P] In `README.md`, add a short "Pets and plants" section: adopting, plants at your desk, X to care, mood and growth, and that nothing dies.
- [ ] T039 Check performance with `npm run bots -- --count 50 --pets` and one browser window in each view. Make sure:
  - the frame rate stays at 60;
  - the bots' tick report stays ≤ 20 ms;
  - the profiler shows `petPose` and the pet drawing using no more than 1 ms per frame.

  If not, cache poses per frame and skip pets outside the viewport (SC-004).
- [X] T040 Make sure nothing breaks in an arena match or Jam Room:
  - no "Press X" chip or menu for players in a match;
  - a pet whose owner is in a match rests at the desk and is still visible;
  - the arena's projectile and collision code ignores pets and plants.
- [X] T041 Run `npm run typecheck`, `npm test` and `npm run build`. Fix anything that fails.
- [ ] T042 Run every scenario in `specs/014-pets-and-plants/quickstart.md` by hand in two windows, including the edge checks.

---

## Dependencies & execution order

- **Phase 1** → **Phase 2** → stories.
- **US1** and **US2** depend only on Phase 2 and can be built in parallel. They touch the same files (`server/companions.ts`, `server/app.ts`, `src/render2d.ts`, `src/render3d.ts`, `src/pets-panel.ts`), so coordinate edits or do them one after the other.
- **US3** depends on the care pipeline (Phase 2). Its tests use a pet (US1) and a plant (US2). Do it after both, or test only the half that exists.
- **Polish** comes after the stories it checks.

Within each story: tests → shared rules → server → client.

## Parallel examples

- **Phase 1**: T001, T002 and T003 together.
- **Phase 2**: T004, T005 and T006 together, then T007. T015 (art) runs alongside T008–T014.
- **US1**: T017 and T018 together. After T022, T023 (2D) and T024 (first person) together.
- **US2**: T026 and T027 together. T031 alongside T029 and T030.
- **US3**: T033, then T034. T035 alongside T034.
- **Polish**: T037 and T038 together.

## Implementation strategy

1. **MVP = Phases 1–3 (US1)**: adopt, follow, rest, care with reactions, saved across restarts. Demo it, and it already answers the "pets" half of issue #10.
2. **+ US2**: plants at the desk with growth. This completes the issue.
3. **+ US3**: cards and the "while you were away" summary.
4. **Polish**: scale check, arena and jam safety, docs, and the hand-run quickstart.

## Phase 7: Convergence

- [X] T043 Cap pet-and-plant records while the server runs, not only on load: in `server/companions.ts`, when `record()` would push the count past `MAX_COMPANION_RECORDS`, drop the record with the oldest non-zero `lastSeen` (never one whose member is online), as `server/characters.ts` does for characters; add a unit test in `tests/unit/store-companions.test.ts` (or a new `tests/unit/companions.test.ts`) that adopting for 2001 distinct members keeps 2000 and keeps the online ones, per plan R2 / data-model MAX_COMPANION_RECORDS (partial)
- [X] T044 Keep the server's pet check cheap with many offline pets: in `shared/pets.ts` cache the pet-corner tile list per world (rebuilt when `getWorld()` changes, grown on demand) instead of a fresh search per `petCornerSpot` call, and in `server/companions.ts` compute `cornerOrder()` once per `views()` call (it already is) and avoid `follower()` lookups for members with no connection by passing the set of online member ids; add a test that `book.views()` with 2000 offline, deskless pets runs in under 20 ms, per SC-004 / research R13 (partial)
