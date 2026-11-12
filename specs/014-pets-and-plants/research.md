# Research: Pets and Plants (014)

## R1. Gather parity (Principle I)

| Question | Finding | Status |
|---|---|---|
| Does Gather have pets that members own and care for? | No such feature found in what is known of Gather. Not checked with REA in this session. | **unknown** |
| Does Gather have plants that grow when watered? | Same as above. | **unknown** |
| How does Gather interact with objects? | Walk up to an object; a "Press X to interact" prompt appears; X opens it. Widely described in Gather's own help pages; not captured with REA here. | **inferred** |

- **Decision**: treat pets and plants as a new feature with no Gather behavior to match. Reuse Gather's "stand next to it, press X" convention, which the spec's clarification also chose.
- **Rationale**: the issue asks for the feature whatever Gather does. The X convention is the most familiar way for Gather users to interact with things.
- **Follow-up**: if an REA capture of Gather later shows pets or plants, add it here with evidence ids and revisit the spec's Assumptions.

## R2. Where pets and plants are kept

- **Decision**: one record per member, `companions[memberId] = { pet?, plants[], lastSeen, away[] }`, held by `OfficeState` and saved as a new optional field of `StoredState` in `office-state.json`. It is additive, like `deskLooks`, so `STATE_VERSION` stays 4. At most 2000 members are kept; the ones seen least recently are dropped first, as with characters and desk looks.
- **Rationale**: it survives restarts (FR-004, SC-003) with the existing debounced, atomic save. One record per member makes the limits of 1 pet and 3 plants easy to enforce, and gives the "while you were away" list an obvious home.
- **Alternatives**: a separate `companions.json` file (a second store and save path for no benefit); putting pets in the layout (layouts belong to builders, and pets belong to members).

## R3. How a pet moves: worked out, not sent

- **Decision**: a pet's position is a pure function in `shared/pets.ts` of its owner's recent path (a **trail**), the time, and the pet's id:
  - **Following**: the pet sits on the owner's trail about 1.2 tiles behind them, measured along the path. The owner has just walked those points, so they are free of walls and furniture.
  - **Idle**: when the owner has not moved for 2 s, the pet idles: it sits, looks around, or takes a short wander to a point within 1 tile of where it is. Points are chosen from `hash(petId, floor(t / 4 s))` and checked with `isBlocking`, so every client picks the same ones.
  - **Resting**: the pet stays at its rest spot (R6) and idles around it the same way.
  - **Jumps**: when the owner moves more than 3 tiles in one step (a teleport, a ring, a desk jump or a layout change), the trail is reset and the pet appears beside them.
- The server keeps a short trail per connection from its move messages and runs the same function when it checks care range (R7). Clients run it every frame from the positions they already receive. **No pet position messages are sent.**
- **Rationale**: no extra traffic for 50 pets (SC-004), smooth movement at 60 fps, and the same code in both views (Principle II). Small differences between clients are cosmetic, and the server's range check allows for them.
- **Alternatives**: server-simulated pets broadcast at 5 Hz (doubles movement traffic and looks jerky between updates); purely client-side random wandering (positions would differ too much for a range check, and Principle III would be lost).

## R4. Where plants go

- **Decision**: a plant stands on a **spot**: a walkable floor tile in its owner's desk space, not the chair's tile, and not taken by another plant. Plants **do not block** walking, like rugs. "Place" puts it on the first free spot. "Move" puts it on the next free spot, in reading order. With no free spot, it stays "not placed" and the owner is told so.
- **Rationale**: it meets "on or next to their own desk" (FR-002) with no new editor. Desk items, the computer and the desk look (feature 012) are untouched, and the order is deterministic and easy to test.
- **Alternatives**: plants as desk-look items placed in the Customize desk editor (ties ownership and care to the desk-look format and its 6-item limit, and much more UI); any tile in the office (rejected by the spec).

## R5. Mood, droop and growth are worked out from times

- **Decision**: store times, not levels.
  - Pet: `lastCareAt`. Adopting counts as care. Mood: under 2 h → **Happy**, under 24 h → **Content**, otherwise **Sleepy/hungry** (FR-008).
  - Plant: `lastWateredAt`. Placing a new plant counts as watering. 24 h or more without water → drooping (FR-019).
  - Plant growth: `wateredDays` (a count) and `lastWaterDay` (the office calendar day of the last counted watering). Stage: 0 → Seedling, ≥1 → Sprout, ≥3 → Bud, ≥5 → Bloom (FR-009). Neither ever goes down (FR-010).
- Clients work out mood and droop with the existing server clock offset (`session.clockOffset`), the same way status time-left is shown.
- **Rationale**: no timers and no messages when a level changes on its own, and nothing ever goes below Sleepy/hungry (SC-005).
- **Alternatives**: a server timer that steps mood down and broadcasts it (more moving parts, and a restart would have to catch up).

## R6. Rest spot: owner offline, in a match or in a jam

- **Decision**: a pet is **following** when its owner has a connection that is not in an arena match (`arena.isPlayer`) and not listening in a Jam Room (`jam.roomOf`). Otherwise it is **resting**:
  - at the owner's desk: the first free spot by the R4 rule, except that a pet may share a tile with a plant;
  - with no desk, at the **pet corner**: the free tiles nearest `SPAWN`, one per resting pet, in a fixed order by pet id (`nearestFreeTileNear`).
- When a member has several tabs open, the pet follows the oldest connection.
- **Rationale**: matches the clarifications. The rest spot can be worked out from shared data, and the server sends it with the pet.

## R7. Caring: range, private rooms, rate limits

- **Decision**: the server accepts `care` only when:
  1. the target exists and the action fits it (Pet, Feed and Play for a pet; Water for a plant);
  2. the carer's distance to the pet's server-side position (R3) or the plant's spot centre is at most **1.5 tiles**: the 1 tile of the spec, plus 0.5 tile for drift between clients;
  3. if the target is in a private area, the carer is in the same area (`areaAt` of both, FR-012);
  4. the carer is not in an arena match;
  5. the rate limits pass: per carer, 5 per 10 s; per target, 1 reaction per 2 s (FR-011). A care action inside the per-target window is accepted quietly (it still counts toward growth and mood) but plays no second reaction.
- A refusal goes only to the sender as `companionError`. An accepted action is broadcast to everyone as `care`, with the target's new times.
- The client shows the "Press X" hint within 1 tile, and refuses a click from farther away locally with "Walk closer".
- **Rationale**: the server decides (Principle III). Reactions are visible to all, like avatars, and add no private context.

## R8. Art

- **Decision**: code-generated pixel art in a new `src/pets-art.ts`, in the style of `src/art.ts`:
  - pets: 4 kinds × 3 colors, with frames for walk (4 directions × 2), sit, sleepy and happy;
  - plants: 4 kinds × 4 stages, plus a drooping variant;
  - reactions: hearts, munch crumbs, a bounce and a water splash;
  - all drawn once into canvases and cached.
- The 2D renderer adds pets and plants to its depth-sorted list of players. The first-person raycaster adds them as sprites in its existing distance-sorted list. Plants are drawn at plant height, and pets about half an avatar's height.
- **Rationale**: original art (FR-017); no assets needed (Principle V); one picture source for both views (Principle II).
- **Principle IV**: see the plan's Complexity Tracking. These are built-in sprites only. No user-supplied pet or plant sheets are accepted, so no new sprite file format is added yet.

## R9. The X key and clicking

- **Decision**: X is free (no existing binding). Pressing X when a pet or plant you can reach is within 1 tile (the nearest one) opens a small action menu by it: Pet / Feed / Play, or Water. Clicking the pet or plant does the same. In first person, the target is the nearest pet or plant within 1 tile under the crosshair, and a click (outside a match) opens the menu, as with the person card from feature 013. X is ignored while typing in a text field.
- **Rationale**: matches the clarification and R1.

## R10. "While you were away"

- **Decision**: each record keeps `lastSeen`, set when the member's last connection closes. Care by someone else whose time is after `lastSeen` is added to `away` (newest first, at most 5). On the member's next `welcome`, the server sends `careSummary` with those entries and clears them. Hovering shows `lastCare` (who, what, when), which is kept separately.
- **Rationale**: FR-016 and US3 with bounded storage.

## R11. Losing a desk

- **Decision**: when a desk claim ends, the owner's placed plants become "not placed", and a resting pet moves to the pet corner. A claim ends on unclaim, a switch of desks, `office.reconcile()` after a layout publish, or an admin removal. The owner's panel shows "not placed" with a Place button.
- **Rationale**: spec edge cases. Nothing is lost (FR-010).

## R12. Names

- **Decision**: `cleanPetName`: trim, remove control characters, collapse whitespace, 1–20 characters, falling back to the kind's name ("Cat"). The same applies to plants. There is no word filter, the same as people's names today.
- **Rationale**: "cleaned like people's names" (spec edge case); the server checks it (Principle III).

## R13. Performance

- **Decision**: per frame, each client runs the pure pose function once per pet (≤ 50), plus one cached picture draw per pet and per placed plant (≤ 150). The server runs the pose function only for the target of a care action. Changes to pets and plants are sent as single-entity upserts, never as a full list after the welcome.
- **Rationale**: SC-004 and the constitution's 60 fps / ≤ 20 ms tick targets.
