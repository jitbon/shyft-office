# Feature Specification: Look Up and Down in First Person

**Feature Branch**: `008-first-person-look-up-down`

**Created**: 2026-11-01

**Status**: Draft

**Input**: User description: "Look up and down in the first-person view (GitHub issue #2, Gather V3 board: "Ability to look up/down in fps view"). Owner's note: "I thought it was possible before but somewhere it got locked i think." Today the first-person camera only turns left and right; the member wants to tilt the view up and down (mouse and keys), as in a normal first-person game, and suspects this used to work and regressed."

## Context

In first person, members can turn left and right with the mouse, the arrow keys or Q and E. They can't look up at the ceiling and wall decor, or down at a desk, the floor art, or someone's face across a table. The horizon is always level in the middle of the screen.

The owner remembered this working before. The project's history doesn't bear that out: first person has turned only left and right since it was first built, and moving the mouse up and down has never done anything. The memory may come from feature 005, which raised the ceiling and added jumping and changed how much of the room shows above and below. This is a new ability, not a fix, and it is written as one here.

## Clarifications

### Session 2026-11-01

- Q: How far should you be able to look up and down in first person? → A: About 60° up and down (option B). This is beyond the plain tilt's natural range, so walls and upright edges lean visibly near the limits. That is accepted. First person is not rebuilt in true 3D for this feature.
- Q: Which keys should tilt the view up and down in first person? → A: None: looking up and down is mouse only (option D). There is no keyboard tilt and no "level the view" key. The view levels again on entering first person.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Look up and down with the mouse (Priority: P1)

In first person, with the mouse captured, a member moves the mouse up and the view tilts up towards the ceiling. Moving it down tilts the view towards the floor, as in any first-person game. The tilt stops at a comfortable limit in each direction, so the view never flips over. Walking still goes along the floor, wherever they look.

**Why this priority**: this is the feature. The mouse is how most members look around in first person.

**Independent Test**: enter first person, click to capture the mouse, and move it up. The ceiling and wall decor come into view. Move it down: the floor near your feet and the tops of desks come into view. Keep moving: the view stops at the limit. Press W while looking down: you walk forward along the floor at normal speed.

**Acceptance Scenarios**:

1. **Given** first person with the mouse captured, **When** the member moves the mouse up or down, **Then** the view tilts up or down at once and smoothly, at the same sensitivity as turning left and right.
2. **Given** the member keeps moving the mouse in one direction, **When** the tilt reaches its limit, **Then** it stops there. It never flips or rolls the view.
3. **Given** a tilted view, **When** the member walks, strafes, runs or jumps, **Then** they move exactly as with a level view (along the floor, at the same speed), and jumping still lifts the view.
4. **Given** a tilted view, **When** the member looks at walls, furniture, wall decor, floor art, the ceiling and other people, **Then** they stay in the right places relative to each other: nothing floats, slides or tears as the view tilts.
5. **Given** a tilted view, **When** the member sees other people, **Then** their name labels and status marks stay attached above them.
6. **Given** the mouse is not captured, **When** the member moves it over the view, **Then** nothing tilts, as today for turning.

---

### User Story 2 - Invert the vertical look (Priority: P3)

A member used to flight-style controls switches on "Invert mouse up/down". Moving the mouse up then tilts the view down. The choice is remembered on their device.

**Why this priority**: a common preference in first-person games, but a small group needs it.

**Independent Test**: switch it on. Moving the mouse up tilts the view down. Reload the page: it is still on. Switch it off: back to normal.

**Acceptance Scenarios**:

1. **Given** the setting is off (the default), **When** the member moves the mouse up, **Then** the view tilts up.
2. **Given** the setting is on, **When** the member moves the mouse up, **Then** the view tilts down.
3. **Given** the setting was changed, **When** the member reloads, **Then** it is as they left it.

---

### Edge Cases

- **Switching views**: going from first person to top-down and back starts with a level view. Switching never leaves the member stuck looking at the floor.
- **Opening a panel or the desk card** (F) while tilted: the desk card opens as today. The faced desk is still the one in front of the member, judged left/right only. Tilting doesn't change which desk "F" opens.
- **Build mode** (B) switches to top-down as today, and the tilt is reset.
- **Jumping while looking up or down**: the view rises and falls as today, and the tilt is kept.
- **Very close to a wall or an object while looking down**: the floor and the object's base show correctly. Nothing draws through the floor.
- **Other people's view**: a member's tilt isn't shown to others, since avatars have no head to tilt. Others see them as today.
- **Screen sharing and drawing** (006, 007): the call panel, stage and pen are overlays and are unaffected by the tilt.
- **Small or very wide windows**: the limits and look stay sensible at every window size the app supports.
- **Performance**: tilting doesn't lower the first-person frame rate.

## Requirements *(mandatory)*

### Functional Requirements

**Looking**

- **FR-001**: In first person with the mouse captured, moving the mouse up and down MUST tilt the view up and down, at the same sensitivity as turning left and right.
- **FR-002**: The tilt MUST be limited to about 60° up and 60° down from level, and MUST never flip or roll the view. Near the limits, upright edges (walls, furniture, people) may lean visibly. That is accepted, but they MUST stay joined to the floor and ceiling, with no gaps or tearing (FR-007).
- **FR-003**: Looking up and down MUST be by mouse only. No key MUST tilt or level the view, and existing key bindings MUST NOT change.
- **FR-004** *(removed: no look keys, see Clarifications)*.
- **FR-005**: A member MUST be able to invert the mouse's up/down direction. The choice MUST be kept on their device across reloads, and MUST default to off.

**Everything else stays put**

- **FR-006**: Walking, strafing, running and jumping MUST behave exactly as with a level view, whatever the tilt.
- **FR-007**: With a tilted view, walls, floor, ceiling, furniture, wall decor, floor art, other people, and their labels and marks MUST stay in their correct places relative to each other, with no tearing, sliding or gaps.
- **FR-008**: The tilt MUST reset to level when the member enters first person (from top-down or build mode).
- **FR-009**: The tilt MUST be the member's own view only. It MUST NOT be sent to others or change how they appear to others.
- **FR-010**: Which desk the desk-card key (F) opens MUST NOT depend on the tilt.
- **FR-011**: First person MUST keep its frame rate target (60 fps) while looking up and down.
- **FR-012**: The on-screen help for first person MUST say the mouse looks around in every direction, not just left and right.

### Key Entities *(include if feature involves data)*

- **View tilt**: how far the member is looking up or down, within the limits. It is personal to the member's screen, reset on entering first person, and never shared.
- **Invert setting**: a per-device preference, off by default.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In first person, a member can bring the ceiling and the floor at their feet into view in under 2 seconds with the mouse.
- **SC-002**: Looking up and down for 30 seconds while walking around furniture and people shows no visible tearing, sliding or gaps between walls, floor, objects and people, even at the 60° limits. Leaning upright edges near the limits are expected and don't count against this.
- **SC-003**: First person stays at about 60 frames per second while looking up and down continuously, the same as with a level view.
- **SC-004**: Walking speed and direction are the same, within 2 %, whether the view is level, fully up or fully down.
- **SC-005**: In a check with five members who play first-person games, at least 4 say looking up and down "feels normal" without being told how it works.
- **SC-006**: Existing behavior is unchanged: turning, movement, jumping, the desk card, top-down, build mode, screen sharing and drawing, and every existing test still pass.

## Assumptions

- **Not a regression.** Vertical look has never existed in first person (checked against the project history). The owner's memory is noted in Context.
- **Limits:** about 60° up and 60° down from level (Clarifications, 2026-11-01). Walls and upright edges leaning near the limits is an accepted trade-off. Looking further, toward straight up or down, would need first person rebuilt in true 3D, which is the roadmap's later step and out of scope here. Gather's first-person mode isn't a reference here: the project's first person is its own (Constitution I has no Gather equivalent to follow).
- **Mouse only:** there are no keys for looking up and down (Clarifications, 2026-11-01). The letter keys near WASD are all taken, and the owner chose not to add one. Members without a mouse can still turn with ←/→ and Q/E, but can't tilt. That is accepted.
- **No auto-levelling:** the view stays where the member leaves it, as in most first-person games. It is levelled on entering first person (FR-008), and the member levels it by moving the mouse back.
- **Personal view only:** avatars are flat or simple figures with no head to tilt, so others don't see a member's tilt.
- **Touch:** dragging up and down on a touch screen isn't part of this feature, as first-person touch controls don't exist today.
- **No change to the server**, the world model or the top-down view.
