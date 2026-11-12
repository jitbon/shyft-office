# Feature Specification: Pets and Plants

**Feature Branch**: `014-pets-and-plants`

**Created**: 2026-11-10

**Status**: Draft

**Input**: User description: "#10". GitHub issue #10 (Gather V3 board G3-10), "add pets and flowers": "add pets and flowers you can own and take care of. (they won't die or anything, just pet them or feed them or water them etc...)"

## Context: what already exists

- A **Plant** decoration in the build catalog. Anyone with build rights can place it, but it belongs to no one and does nothing.
- **Desks** that a member can claim. A claimed desk is the member's own place in the office (feature 005).
- **Members** keep the same identity across visits. **Guests** get a temporary identity that ends when they leave.

Nothing in the office today can be owned as a companion, or reacts when someone looks after it.

## Clarifications

### Session 2026-11-10

- Q: Where does a member's pet stay in the office? → A: It follows its owner around. When the owner is offline it naps at their desk, or at a shared pet corner if they have no desk.
- Q: Should a pet or plant nobody has looked after look any different? → A: A gentle hint: after about a day a pet looks sleepy or hungry and a plant droops slightly. One care action fixes it. It never dies, shrinks or disappears.
- Q: How close must someone be to care for a pet or plant, and how? → A: Within 1 tile. A "Press X" hint shows when standing next to it; X, or clicking it while that close, opens the care actions.
- Q: What does a pet do while its owner is in an arena match or Jam Mode? → A: It waits at its owner's desk (or the pet corner) until the match or jam ends, then rejoins them.
- Q: How does a pet's mood work? → A: Three levels set by time since the last care: Happy for 2 hours after any care, then Content, then Sleepy/hungry after 24 hours without care. Any single care action makes it Happy.
- Q: How many watering days does a plant take to grow, and through which stages? → A: Four stages, Seedling → Sprout → Bud → Bloom, reached after 1, 3 and 5 watering days in total.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Adopt a pet and look after it (Priority: P1)

A member opens a **Pets & plants** panel and adopts a pet. They choose its kind (at least a cat, a dog, a rabbit and a bird), pick one of a few colors and give it a name. The pet appears next to them in the office. Standing next to it (within 1 tile) shows a "Press X" hint. Pressing X, or clicking it from there, gives them **Pet**, **Feed** and **Play**. Each one plays a short reaction, for example hearts, a happy hop or munching, and the pet looks happier afterwards. Other people see the pet and the reactions too.

**Why this priority**: pets are the headline of the issue, and owning one plus caring for it is the whole loop.

**Independent Test**: as a member, adopt a cat named "Miso". It appears beside you in both views. Feed it: a munching reaction plays, and a second window sees the same reaction within 1 second.

**Acceptance Scenarios**:

1. **Given** a member with no pet, **When** they open the panel and adopt one with a kind, color and name, **Then** the pet appears in the office within 1 second, with its name shown under it like a person's name.
2. **Given** a pet, **When** anyone standing within 1 tile picks Pet, Feed or Play, **Then** a reaction plays that everyone nearby can see, and the pet becomes Happy.
3. **Given** a pet, **When** its owner opens the panel, **Then** they can rename it, change its color, or send it away (with a confirmation). Sending it away removes it for everyone.
4. **Given** a pet, **When** its owner leaves and comes back the next day, **Then** the pet is still theirs, with the same name and look.
5. **Given** a pet nobody has cared for in 24 hours, **When** someone looks at it, **Then** it looks a little sleepy or hungry. One care action perks it straight back up. It never dies, runs away or disappears.
6. **Given** a pet, **When** its owner walks around the office, **Then** the pet follows a short way behind them, in both views.

---

### User Story 2 - Grow a plant and water it (Priority: P2)

A member picks a **flower or plant** (at least sunflower, tulip, cactus and fern) and places it on or beside their own desk. Watering it plays a short water-splash reaction. It starts as a **Seedling** and, as it is watered on more days, grows into a **Sprout**, a **Bud** and finally a full **Bloom**. It stays at its last stage when nobody waters it, and it never dies.

**Why this priority**: the issue asks for flowers too, but a plant is the simpler, quieter half. Pets on their own already deliver the feature.

**Independent Test**: claim a desk, place a tulip on it and water it. A splash plays. With the clock moved forward and the tulip watered once on each of 5 different days, it goes Seedling → Sprout (day 1) → Bud (day 3) → Bloom (day 5).

**Acceptance Scenarios**:

1. **Given** a member with a claimed desk, **When** they place a plant there, **Then** it appears at that desk for everyone, in both views.
2. **Given** a plant, **When** anyone standing within 1 tile picks Water, **Then** a splash reaction plays for everyone nearby.
3. **Given** a new Seedling, **When** it has been watered on 1, 3 and 5 different days in total, **Then** it becomes a Sprout, a Bud and a Bloom in turn, for everyone. Watering more than once on the same day does not speed it up, and gaps between watering days don't matter.
4. **Given** a member without a claimed desk, **When** they try to place a plant, **Then** they are told to claim a desk first.
5. **Given** a member who gives up their desk, **When** the desk is released, **Then** their plants move to their panel as "not placed", and they keep them.

---

### User Story 3 - See how loved a pet or plant is (Priority: P3)

Hovering or clicking a pet or plant shows a small card: its name, its owner, its mood or growth stage, and who looked after it last ("Fed by Sam · 2 h ago"). When the owner is away, the panel also tells them who cared for their pet or plant while they were gone.

**Why this priority**: it turns care into something social, though the feature already works without it.

**Independent Test**: B feeds A's pet while A is offline. When A comes back, A's panel says "Sam fed Miso while you were away", and hovering the pet shows "Fed by Sam".

**Acceptance Scenarios**:

1. **Given** a pet or plant, **When** someone hovers or clicks it, **Then** the card shows its name, owner, mood or stage, and last carer with how long ago.
2. **Given** others cared for a member's pet or plant while that member was offline, **When** the member returns, **Then** they see a single summary of who did what (at most the last 5 entries).

---

### Edge Cases

- **Guests** can pet, feed, play with and water others' pets and plants. They cannot adopt pets or own plants, because their identity ends when they leave.
- **Owner offline**: the pet naps at its owner's desk, or at a shared pet corner (the spawn area) if they have no desk. Others can still care for it there. When the owner comes back, it joins them again.
- **Owner goes somewhere a pet can't follow** (a teleport, or a jump to someone): the pet appears beside the owner when they arrive, instead of walking there.
- **Spam**: care actions are limited per person and per pet, so that holding the key does not flood everyone with reactions.
- **Mood and growth never go below their lowest level, and nothing is removed for neglect.** Only the owner, or an admin removing the owner's data, can remove a pet or plant.
- **Private rooms**: someone inside a private meeting room sees and can care for a pet or plant in that room. People outside see it but cannot interact through the walls.
- **Desk removed by a builder**: plants on that desk move back to their owner's panel as "not placed".
- **Many pets in one place**: pets never block people from walking, and never stand on walls or furniture.
- **Arena matches and Jam Mode**: while its owner is in a match or a jam, the pet waits at their desk (or the pet corner) and can still be cared for there. When the match or jam ends, it rejoins its owner.
- **Rename to something offensive or overlong**: names are limited to 20 characters and cleaned like people's names.

## Requirements *(mandatory)*

### Functional Requirements

**Owning**
- **FR-001**: Members MUST be able to adopt one pet, choosing its kind (at least 4), color (at least 3 per kind) and name (1–20 characters).
- **FR-002**: Members MUST be able to own up to 3 plants, choosing from at least 4 kinds, and place each one on or next to their own claimed desk.
- **FR-003**: Owners MUST be able to rename a pet or plant, change a pet's color, move a plant between spots at their desk, and remove either one after a confirmation.
- **FR-004**: Pets and plants, with their names, looks, mood, growth stage and recent care, MUST survive a server restart and the owner leaving and returning.
- **FR-005**: Guests MUST NOT be able to adopt pets or own plants.

**Caring**
- **FR-006**: Anyone in the office, owner or not and guests included, MUST be able to care for a pet or plant while within 1 tile of it. A "Press X" hint MUST show at that distance, and pressing X or clicking the pet or plant MUST open the care actions. Clicking from farther away MUST NOT open them, and should say to walk closer: **Pet**, **Feed** and **Play** for pets, **Water** for plants.
- **FR-007**: Each care action MUST play a short reaction (about 1–2 seconds) that everyone who can see the pet or plant sees within 1 second.
- **FR-008**: A pet's mood MUST have 3 visible levels, set only by the time since anyone last cared for it: **Happy** for 2 hours after any care action, then **Content**, then **Sleepy/hungry** once 24 hours have passed without care. Any single care action (Pet, Feed or Play) MUST make it Happy at once.
- **FR-009**: A plant MUST start as a **Seedling** and grow to **Sprout**, **Bud** and **Bloom** once it has been watered on 1, 3 and 5 different days in total. A day is the office's calendar day. Repeat waterings on the same day MUST NOT count toward growth, but they still play the reaction. A Bloom stays a Bloom.
- **FR-010**: Nothing a pet or plant goes through MUST ever make it die, run away, disappear, or lose a growth stage it reached.
- **FR-011**: Care actions MUST be rate-limited: no more than 1 reaction per pet or plant every 2 seconds, and no more than 5 care actions per person every 10 seconds.
- **FR-012**: Being within 1 tile is not enough on its own: a pet or plant in a private area can be cared for only by someone inside that area, the same rule as talking to people.

**Seeing**
- **FR-013**: Pets and plants MUST appear in the top-down view and the first-person view, including their reactions and their mood or growth stage.
- **FR-018**: While its owner is online, a pet MUST follow them a short way behind, and MUST appear beside them after a teleport. While its owner is offline, or in an arena match or Jam Mode, it MUST stay at its owner's desk, or at the shared pet corner when they have no desk, and rejoin them when they are back and free.
- **FR-019**: After 24 hours without any care, a pet MUST be Sleepy/hungry (FR-008) and a plant MUST droop slightly. One care action MUST undo this at once (a pet becomes Happy; a plant stands up again). This is the only change neglect causes.
- **FR-014**: Pets MUST move with small idle animations (sitting, looking around, short wanders) and MUST NOT block people's movement or stand on walls or furniture.
- **FR-015**: Hovering or clicking a pet or plant MUST show its name, owner, mood or stage, and last carer with how long ago.
- **FR-016**: When an owner returns, they MUST see a summary of care given while they were away (at most 5 entries).
- **FR-017**: Pet and plant art MUST be original. It MUST NOT be copied from Gather or any other product.

### Key Entities

- **Pet**: owned by one member. Has a kind, color, name, mood (worked out from its last cared-for time), where it is (following its owner, or resting at a desk or the pet corner), last cared-for time and carer, and a short care history.
- **Plant**: owned by one member. Has a kind, name, growth stage, the days it was watered (for growth), the desk and spot it sits on (or "not placed"), and last watered time and carer.
- **Care action**: who, what (pet, feed, play, water), which pet or plant, and when. Kept briefly for the last-carer line and the "while you were away" summary.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member can adopt and name a pet in under 30 seconds from opening the panel.
- **SC-002**: A care reaction is seen by everyone nearby within 1 second of the action.
- **SC-003**: Pets and plants keep 100% of their names, looks, mood and growth across a server restart.
- **SC-004**: With 50 pets in one office, the office still runs as smoothly as before in both views (no visible drop in frame rate or movement).
- **SC-005**: No pet or plant can reach a "dead", "gone" or reduced-stage state, whatever happens or doesn't happen to it.

## Assumptions

- **Gather parity (Principle I)**: whether Gather has ownable pets or plants is **unknown**. The plan's research must check and record it as observed, inferred or unknown. Until then this is treated as a new feature, with no Gather behavior to match.
- Adopting a pet or plant is free and unlimited in kind. There is no shop, currency or unlocking.
- One pet per member and up to 3 plants per member, so offices don't fill up. These limits can be raised later.
- The existing decoration Plant stays as it is. Owned plants are a separate thing.
- Pets don't make sounds, or only quiet optional ones, so they never get in the way of meetings.
- Care actions don't need the owner's permission, since the issue frames this as friendly and there is nothing to break.
- Growth only ever moves up. Mood goes no lower than Sleepy/hungry (FR-008, FR-019).
