# Implementation Plan: Pets and Plants

**Branch**: `014-pets-and-plants` | **Date**: 2026-11-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/014-pets-and-plants/spec.md`

## Summary

Members adopt one pet (cat, dog, rabbit or bird; 3 colors; a name) and own up to 3 plants (sunflower, tulip, cactus, fern) placed at their desk. Anyone, guests included, can stand within 1 tile and press X, or click, to Pet / Feed / Play or Water.

- Pets follow their owner, and rest at the owner's desk or the pet corner while the owner is offline, in a match or in a jam.
- Mood is Happy, Content or Sleepy/hungry, depending on time since the last care.
- Plants grow Seedling → Sprout → Bud → Bloom over 1, 3 and 5 watering days, and droop slightly after 24 h without water. Nothing ever dies.
- Owners see who looked after their things while they were away.

**Technical approach**:
- **Persistence**: one record per member, kept as an additive field of the existing saved state (R2).
- **Movement**: a pet's position is a pure function in `shared/pets.ts` of its owner's recent trail and the time. Server and clients run the same function, so no pet positions are sent (R3).
- **Levels**: mood, droop and growth are worked out from stored times and a day count in the office time zone (R5).
- **Care checks**: the server checks every care action for range, private area and rate (R7).
- **Art**: original and code-generated, drawn by both renderers from one source (R8).

## Technical Context

**Language/Version**: TypeScript (strict), Node 20+ server, browser client

**Primary Dependencies**: existing only (`ws`, Vite, Vitest). No new dependency.

**Storage**: `office-state.json` via `StateStore`: a new optional `companions` field, with `STATE_VERSION` unchanged at 4 (R2)

**Testing**:
- Vitest unit, new: `tests/unit/pets.test.ts` (mood, droop, stages, day key, spots, pose, names, care rules) and `tests/unit/store-companions.test.ts` (parse and clean, limits).
- Integration, new: `tests/integration/ws-pets.test.ts` (adopt, care, range, private area, guest, rate, away summary, desk loss, restart, `byMember` never sent).

**Target Platform**: desktop Chromium, Firefox, Safari

**Project Type**: web app (`shared/`, `server/`, `src/`)

**Performance Goals**:
- reactions visible ≤ 1 s (one broadcast);
- 60 fps with 50 pets and 150 plants (pure pose per pet per frame, cached pictures);
- server tick unchanged, since pose runs only on care.

**Constraints**:
- backward compatible: the `welcome` field is optional, and the new messages are ignored by old clients;
- server-authoritative ownership and care;
- no pet position traffic.

**Scale/Scope**: the documented office scale (≈50 people); ≤ 1 pet and ≤ 3 plants per member; ~14 files touched, 5 new

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Result |
|---|---|---|
| I. Gather parity, original assets | Research R1 records Gather pets and plants as **unknown** and the X-to-interact convention as **inferred**. The spec's Assumptions list this as a new feature. All art is original and code-drawn (R8, FR-017). | Pass |
| II. One world, many views | Pet pose, plant spots, rest spots, stages and care rules live in `shared/pets.ts`, used unchanged by the server and both renderers. Both views draw from one picture source; the spec requires both views (FR-013). | Pass |
| III. Server-authoritative presence and privacy | Ownership comes from the connection's member id. Every field is validated (kinds, colors, names, ids). Range, private area, match and rate are checked on the server. No new private context. Carers' member ids stay on the server. Integration tests cover refusals and the guest rule. Camera and mic are untouched. | Pass |
| IV. Open sprite pipeline | Pets and plants are **built-in, code-generated** sprites only. No user-supplied sheets are accepted, so no new external format is added. | Pass with note, see Complexity Tracking |
| V. Simple to run, tested at the core | No new infrastructure or dependency; saved in the existing state file. All rules are pure and unit-tested. There is a quickstart scenario for each story, and the bots tool gets a `--pets` flag for the scale check. | Pass |

**Post-design re-check**: Pass. The design adds 3 client messages and 7 server messages, all validated, and one optional saved field. Principle IV's note stands.

## Project Structure

### Documentation (this feature)

```text
specs/014-pets-and-plants/
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
├── pets.ts              # NEW: kinds, colors, constants; cleanPetName; moodOf, droopy, stageOf, dayKey, water;
│                        # plantSpots, nextSpot, petCornerSpot; Trail; petPose; canCare; COMPANION_MESSAGES
└── protocol.ts          # pet / plant / care client msgs; petUpsert, petGone, plantUpsert, plantGone, care,
                         # careSummary, companionError; welcome.companions

server/
├── store.ts             # StoredState.companions (additive); readCompanions; cap 2000
├── companions.ts        # NEW: CompanionBook: records, adopt/edit/remove, add/place/move/unplace/rename/remove,
│                        # care (with rate windows), follow/rest resolution, away list, views, desk-lost handling
├── office.ts            # persistState includes companions; tell the book when a claim ends (unclaim, switch, reconcile)
└── app.ts               # trails per connection; route pet/plant/care msgs; welcome.companions + careSummary;
                         # petUpsert on join/leave, arena.changed, syncJam, desk changes; PER_SECOND.companion

src/
├── pets-art.ts          # NEW: code-drawn pets (4 kinds × 3 colors, walk/sit/sleep/happy), plants (4 × 4 stages + droop),
│                        # reaction effects; cached canvases
├── pets.ts              # NEW: client store of PetView/PlantView, trails of players, poses per frame, reactions queue,
│                        # nearest target within 1 tile, X key and click handling, action menu, hover card
├── pets-panel.ts        # NEW: the 🐾 panel (adopt, edit, send away, plants, add, place/move/unplace, away list)
├── render2d.ts          # draw pets and plants in the y-sorted pass; "Press X" chip; reactions
├── render3d.ts          # pets and plants as sprites in the distance-sorted list; reactions
├── main.ts              # wire messages; top-bar 🐾 button; X key; click routing (before the person card)
└── style.css            # panel, menu, chip, card

index.html               # 🐾 button, panel and action-menu elements

tools/
└── bots.ts              # --pets: each bot adopts a pet

tests/
├── unit/pets.test.ts
├── unit/store-companions.test.ts
└── integration/ws-pets.test.ts
```

**Structure Decision**: the existing single repo with `shared/`, `server/` and `src/`. The server gets one new module (`companions.ts`), to keep `app.ts` from growing further. The client gets three new modules, matching how status, desk look and jam are split.

## Complexity Tracking

| Item | Why needed | Simpler alternative rejected because |
|---|---|---|
| Principle IV: new built-in sprite kinds (pets, plants) without a documented external file format, template or validator | The issue asks for pets and plants, not for user-made pet art. Built-in, code-generated art is what Principle IV requires as the working default, and no external sheets are accepted, so nothing unvalidated reaches users. | Designing a pet sheet format, template and validator now would add a format no one has asked for. It belongs with a future "custom pets" feature, which would then have to meet Principle IV in full. |
