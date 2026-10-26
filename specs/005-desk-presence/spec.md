# Feature Specification: Desk Presence (a stronger desk highlight and the video view at your desk)

**Feature Branch**: `005-desk-presence`

**Created**: 2026-10-26

**Status**: Draft

**Input**: User description: "The desk space should be highlighted more if I get on it, also should start up that voice/video view like gather.town v1 has"

## Context

Today a claimed desk gets a faint yellow tint, and only when it is yours. When you walk onto your desk space nothing else changes: you can't tell you have "arrived", and the conversation panel (the strip of video tiles) stays hidden until someone else comes near.

Gather's first version treats a desk as a place you sit in. Step onto it and the desk lights up, and the voice and video view opens with your own picture and the mic and camera controls, even when you are alone, so you can check how you look and sound or just be present. Walk off and it closes.

This feature brings that behavior to the office. The desk space is a 3×3 block: the desk takes 3 tiles of it, the chair sits in the middle of the next row, and the third row is the floor behind the chair (changed from the earlier ring-shaped space on 2026-10-26). "Getting on it" means your avatar is standing in that space.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The desk lights up when you are on it (Priority: P1)

A member walks onto their own desk space. The desk space is clearly highlighted, much more than the faint tint it has when you are elsewhere: a stronger glow and a visible edge around the whole space, plus a short "Your desk" cue. The highlight shows in the top-down view, and the "Your desk" cue shows in first person too. When they walk off, it returns to the faint tint.

**Why this priority**: it is the cheapest and clearest cue that you are "at your desk", and it is what the rest of the feature (the video view) hangs off. It also helps people find where the edge of their desk space is, which decides who can hear them.

**Independent Test**: claim a desk, walk onto its seat and then off it. In top-down, the highlight is strongly visible while on and back to the faint tint while off; in first person the "Your desk" cue shows and goes. A second member watching sees no change on their screen except what already exists (owner name label).

**Acceptance Scenarios**:

1. **Given** a member with a claimed desk, **When** their avatar steps into any tile of their desk space, **Then** within half a second the whole space shows the strong highlight with an edge, and a "Your desk" cue appears.
2. **Given** the member is on their desk, **When** they walk out of the space, **Then** the strong highlight and cue go away within half a second.
3. **Given** the member is in first person, **When** they step onto their desk, **Then** the "Your desk" cue shows. The floor is not tinted or edged in first person; the stronger highlight is a top-down cue.
4. **Given** a member stands in a desk space that is not theirs (an unclaimed desk, or one whose owner let them in), **When** they are inside it, **Then** that space shows the strong highlight too, without the "Your desk" words, so everyone can see where a desk's space starts and ends.
5. **Given** a locked desk, **When** a member who is not allowed in walks up to it, **Then** they are still stopped at the edge as today and nothing highlights as if they were inside.

---

### User Story 2 - The video view opens at your desk (Priority: P1)

When a member steps onto their desk space, the voice and video view opens, as in Gather: a panel with their own tile (their camera if it is on, otherwise their character), their mic and camera controls and the desk's name, even when nobody else is there. Anyone who joins the desk (invited, or an ambient neighbour who is linked into a conversation) appears as a tile. When the member leaves the desk space, the view closes (unless they are in a conversation, when it stays as it is today).

**Why this priority**: it is half of what the member asked for, and it is what makes the desk feel like "your room": you can see yourself, turn your mic and camera on and off, and be seen by someone you invite.

**Independent Test**: claim a desk, walk onto it alone: the panel opens with one tile, you. Turn the camera on: your picture appears. Invite a second member and have them step in: their tile appears for both. Walk off: the panel closes for you.

**Acceptance Scenarios**:

1. **Given** a member alone, **When** they step onto their desk space, **Then** once they have stayed one second, the video view is open (within 1.2 seconds of arriving) with their own tile and the mic and camera controls, headed with the desk's name.
2. **Given** the view is open at the desk, **When** the member turns the camera on or off or the mic on or off, **Then** the tile and the controls update the way they do in a conversation today.
3. **Given** the member is at their desk, **When** an invited member steps into the desk space, **Then** both see each other's tiles and can talk, as in any conversation.
4. **Given** the member is at their desk, **When** they walk out of the desk space and are not in a conversation, **Then** the view closes within one second (assumed 0.6 seconds).
5. **Given** the member walks from their desk straight into a conversation, **When** the conversation starts, **Then** the panel shows the conversation as it does today (no duplicate tile, no flash of the desk view).
6. **Given** a member's mic and camera are off when they step onto their desk, **When** the view opens, **Then** they are still off. Nothing is turned on for them.

---

### User Story 3 - Choose whether the desk view opens by itself (Priority: P3)

A member who does not want the video view every time they sit down can switch the automatic opening off, and back on. The choice is remembered on their device. With it off, the desk highlight still works, and they can still open the view by hand (as the camera and mic controls already allow).

**Why this priority**: it is polish, and a courtesy to people who are in a shared place or on a small screen.

**Independent Test**: switch it off, walk onto the desk: the highlight shows, the view does not open. Switch it on, walk off and on again: it opens.

**Acceptance Scenarios**:

1. **Given** the setting is on (the default), **When** a member steps onto their desk, **Then** the view opens (US2).
2. **Given** the setting is off, **When** they step onto their desk, **Then** the highlight shows and the view stays closed.
3. **Given** the setting was changed, **When** the member reloads the page, **Then** it is still the way they left it.

---

### Edge Cases

- **Walking across a desk space** without stopping: the highlight appears and goes as they pass; the video view opens only after they have stayed one second, so crossing a desk to reach a door does not flash a panel (assumed 1 second).
- **Two desks next to each other** (each space is a 3×3 block, and spaces never share a tile): stepping from one space to the next closes one and opens the other without both showing.
- **Desk removed or moved while you are on it** (the owner or a builder changes the layout): the highlight and view follow the new layout and stop if the space is gone.
- **Desk unclaimed while you are on it**: the highlight stays (you are still in a desk space) but "Your desk" and the video view go, as it is no longer your desk.
- **Pod in cubicle mode and a locked desk**: the highlight and the view behave the same; only who can hear the desk differs, as today.
- **Ambient pods**: neighbours who are only faintly overheard do not get tiles in your desk view, and you do not appear in theirs.
- **A member already in a conversation when they step on their desk**: the panel keeps showing the conversation; the desk's name is in its heading.
- **First person and top-down**: the highlight is top-down only; first person shows the "Your desk" cue (and the video view looks the same in both, since it is an overlay, as today).
- **No camera or microphone available or denied**: the view still opens with the character picture, and the controls say what is missing, as in a conversation today.
- **Guests (no saved member id)** cannot claim a desk, so they see the highlight for a desk space they stand in (US1, scenario 4) but never get "Your desk" or the desk view.

## Requirements *(mandatory)*

### Functional Requirements

**The highlight**

- **FR-001**: When a member's avatar is inside a desk space, the whole space MUST be shown in a clearly stronger highlight than the existing faint tint: a brighter fill and a visible edge, noticeable at a glance.
- **FR-002**: When the desk space is the member's own, a "Your desk" cue MUST also show, and the highlight MUST be the warmest of the desk highlights.
- **FR-003**: The highlight MUST follow the member's position within half a second, in both directions (on and off).
- **FR-004**: The stronger highlight (fill and edge) MUST show in the top-down view. In first person only the cue shows (for your own desk; nothing shows for another desk's space), with no marking of the floor; the video view is the same in both views (Constitution II: the degradation in first person is stated here).
- **FR-005**: A desk space the member is not inside MUST look as it does today: your own desk with the faint tint in top-down, claimed desks labelled as they are now.
- **FR-006**: The highlight MUST NOT change what anyone can hear or see, who may enter a desk, or any desk rule. It is a picture of a place the rules already define (Constitution III).

**The video view**

- **FR-007**: When a member has stayed inside their own desk space for one second (the view is then open within 1.2 seconds of arriving), the voice and video view MUST open with their own tile, the mic and camera controls and the desk's name, even when nobody else is linked.
- **FR-008**: The view MUST close within a second after the member leaves the desk space, unless they are in a conversation, in which case the panel keeps showing that conversation as it does today.
- **FR-009**: Other members who are linked to the member (invited into the desk, or in the same conversation) MUST appear as tiles with the same video, mic and talking cues as in any conversation today.
- **FR-010**: Opening the view MUST NOT turn the member's microphone or camera on, and MUST NOT send anything to anyone. Mic and camera stay off until the member turns them on (Constitution III).
- **FR-011**: A member alone at their desk MUST NOT be linked to, heard by, or shown to anyone else because the view is open. Who hears and sees whom keeps following the rules the server already enforces.
- **FR-012** *(replaced, see the amendment)*: The desk view opens for any desk space the member stands in, whoever owns it, and for guests too.

**The setting**

- **FR-013**: A member MUST be able to switch the automatic opening of the desk view off and on. It defaults to on. The choice MUST be kept on the member's device across reloads.
- **FR-014**: With the setting off, the highlight (FR-001 to FR-004) MUST still work.

### Key Entities *(include if feature involves data)*

- **Desk space**: a 3×3 block of tiles: the desk (3 tiles), the chair in the middle of the next row, and the floor behind it. Spaces never share a tile. It is what decides "on the desk".
- **Desk presence**: the member being inside a desk space. It is worked out from where the member stands and the published layout, the same way for every browser. It is not stored.
- **Desk view**: the voice and video panel shown because of desk presence, as opposed to because of a conversation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a check with five members who have not seen the feature, at least 4 can say, within 5 seconds of stepping onto their desk, that something marked it as theirs.
- **SC-002**: The highlight appears and disappears within half a second of crossing the edge of the desk space, in 100% of tried crossings: the highlight in the top-down view and the "Your desk" cue in both views.
- **SC-003**: The desk view is open, with the member's own tile, within 1.2 seconds of arriving on the desk and staying, and closed within one second of leaving, in 100% of tried visits.
- **SC-004**: No member's microphone or camera is turned on, and nothing is sent to anyone, by the desk view opening, in 100% of tried visits.
- **SC-005**: Existing behavior is unchanged for everything else: conversations, private rooms, desk claiming, locking and invitations, and the privacy rules (every existing privacy check still passes).
- **SC-006**: Walking across a desk space without stopping never opens the desk view.

## Amendment (2026-10-26): the view in meeting rooms too

The owner asked for the video and mic preview at the top to show whenever they go into a space, get close to somebody, or are in a meeting, and not otherwise. Near somebody and meetings already open the panel (it is a conversation). So the view also opens when you stand in a **meeting room** (a private area) on your own, headed with the room's name, with no wait (you walk into a room on purpose) and with the same 0.6 second delay on the way out.

- **FR-015**: Standing in a meeting room with nobody else linked MUST open the one-tile video view headed with the room's name at once, and close it within a second of leaving. A conversation, when there is one, takes over as today; your own desk's view takes precedence over the room's.
- **FR-016**: The setting of FR-013 covers both the desk view and the meeting room view ("Show my video view when I'm at my desk or in a meeting room").
- The open floor and the lobby are not spaces in this sense: alone there, nothing shows.

## Amendment (2026-10-26): any desk, not only your own

The owner corrected the "own desk only" assumption: the video view opens at **any** desk space you stand in, a free one or someone else's, not only your own. Its heading says whose desk it is ("Your desk", "<Owner>'s desk" or "Free desk"). Everything else is as in US2: your own tile, mic and camera buttons, a one-second stay before it opens, 0.6 seconds before it closes, nothing turned on, nothing sent. Walking straight from one desk space into another closes the view and starts the one-second stay again. Guests can see it too. This replaces FR-012 and the "own desk" wording in FR-007, US2 and the assumptions. The "Your desk" cue (the pill) stays for your own desk only.

## Amendment (2026-10-26): a cleaner top bar

Asked for alongside this feature: the long bar of buttons at the top right hid the area name in the middle. It is now:
- **two separate pills** at the top right: actions (microphone and camera, Desk, Character, Status, Admin for admins) and the **2D | 3D** switch, short enough that the area name stays visible; below 1150 px wide they stack;
- **microphone and camera as icon buttons**, filled when on and muted red with a slash when off, matching the buttons on your own tile in the strip;
- **Build** as a floating button of its own at the bottom right, hidden while building;
- **Status opens on hover** and closes when the pointer moves away; a click pins it open (and works where there is no hover).

- **FR-017**: The area name at the top centre MUST stay fully visible at 1000 px and wider; the 2D/3D switch MUST be separate from the other actions; mic and camera MUST be icon buttons that show on and off; Build MUST be detached from the bar; Status MUST open on hover and on click.

## Assumptions

- "Getting on" a desk means standing in any tile of its desk space (seat, desk top or ring), not only on the seat. This matches where desk privacy already applies.
- ~~The desk view is for the member's own desk only.~~ Replaced by the amendment: it opens at any desk space.
- "That voice/video view like gather.town v1 has" is taken to mean Gather's desk behavior: your own tile with mic and camera controls, shown when you are at your desk, whether or not anyone else is there.
- Turning the mic and camera on stays a choice. The existing rule (mic and camera start off) is kept.
- A stay of 1 second before the view opens, a 0.6 second delay before it closes, and half a second for the highlight, are assumed.
- The look of the highlight (colors, border width) is a design detail to settle in planning, within "clearly stronger than today".
- Desk rules, pod modes, locking and invitations do not change, but the **shape** of a desk space does (the 3×3 amendment): it is one shared rule, so the server's idea of who is "at a desk" for privacy and locked-desk entry follows it, and a server test pins the new boundary. Otherwise the server's idea of who hears whom does not change; this feature only changes what is drawn and when the existing panel is shown.
- No new service or setting on the server is needed; the one setting (FR-013) lives on the member's device.
