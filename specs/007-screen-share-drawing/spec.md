# Feature Specification: Drawing on a Screen Share

**Feature Branch**: `007-screen-share-drawing`

**Created**: 2026-10-31

**Status**: Draft

**Input**: User description: "Drawing on a screen share (GitHub issue #5, Gather V3 board; follows feature 006 screen sharing). Issue text: "we need to be able to draw on the screen-share like how slack-huddle allows us to do this smoothly. multiple folks need to be able to draw and it work fine etc." Everyone in the conversation watching a share (and the sharer) can draw on it at the same time, like Slack huddles: strokes appear for all viewers in real time, pinned to the shared picture (normalized coordinates on the share's shareId and size from 006), each person's ink in their own color, fading or clearable, and drawing must stay smooth with several people drawing at once. Drawing reaches only the conversation members who can see the share (same privacy rule as the share)."

## Context

Feature 006 lets a member share a screen, window or tab with the people in their conversation. Today viewers can only talk about what they see: "the button on the left… no, further down". Slack huddles let anyone in the call draw on the shared screen. The marks show up for everyone in a moment and fade away after a few seconds, so pointing at something is as quick as saying "here".

This feature adds that to every share. Anyone watching a share, and the sharer, can draw on it. Everyone else watching that share sees the line appear as it is drawn, in the drawer's own color, and pinned to the same spot on the shared picture whatever the size of their window. Ink fades on its own, and can also be cleared.

Who sees the drawing follows the share exactly: the members of the sharer's conversation (006, FR-006). Nothing else about sharing changes.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Draw on someone's share and everyone sees it (Priority: P1)

A member watching a share turns on drawing (a pen button on the share) and drags across the picture. A line follows their pointer. Within a moment the same line appears, in the same place on the shared picture and in the same color, for everyone else watching that share, including the sharer. A few seconds after the drawer lifts the pen, the line fades out.

**Why this priority**: this is the feature. Pointing at something on a shared screen is what the issue asks for.

**Independent Test**: A shares a window with B in a conversation. B turns the pen on and circles a word. A, in their own view of the share (Open on the sharing banner), sees the circle around the same word, in B's color, within half a second, and it fades a few seconds later. The same holds when B's window is a different size from A's.

**Acceptance Scenarios**:

1. **Given** B is watching A's share, **When** B turns on the pen and drags over the picture, **Then** B sees the line follow the pointer at once, and every other viewer and the sharer see the same line within half a second.
2. **Given** viewers whose windows are different sizes, or one in full window, **When** a line is drawn, **Then** it lands on the same spot of the shared picture for each of them.
3. **Given** a line has been drawn, **When** the drawer lifts the pen, **Then** the line stays fully visible for about 3 seconds and then fades out over about 1 second, for everyone.
4. **Given** the pen is off, **When** a viewer clicks or drags on the share, **Then** nothing is drawn, and the share behaves as in feature 006 (clicking a thumbnail still swaps it).
5. **Given** a viewer drawing, **When** they press Esc or turn the pen off, **Then** drawing stops and they go back to plain watching.
6. **Given** a member who is watching a share, **When** they draw, **Then** their camera, microphone and the share itself are unaffected.

---

### User Story 2 - Several people draw at once, smoothly (Priority: P1)

Several people in the conversation draw on the same share at the same time. Each person's ink has its own color and a small name tag at the pen tip while they draw, so everyone can tell who is pointing where. Lines are smooth curves, not jagged dots, and nobody's drawing slows down the share, the call or the office.

**Why this priority**: the issue explicitly says "multiple folks need to be able to draw and it work fine". With only one drawer at a time it would not feel like Slack.

**Independent Test**: A shares. B, C and D draw at the same time for 10 seconds. Everyone sees all three lines in three different colors, each with its drawer's name at the tip. The lines look smooth, and the share and voices keep running without stutter.

**Acceptance Scenarios**:

1. **Given** three viewers draw at the same time, **When** others watch, **Then** they see three separate lines in three distinct colors, all appearing as they are drawn.
2. **Given** a member is drawing, **When** others watch, **Then** a small tag with the drawer's name follows the pen tip and goes away shortly after they stop.
3. **Given** a member's ink color, **When** they draw on any share in the conversation, **Then** they keep the same color for the whole conversation. Two people in one conversation never share a color, up to 8 people.
4. **Given** quick strokes (a fast circle or a scribble), **When** others see them, **Then** they look like smooth continuous lines, without gaps or straight-line jumps.
5. **Given** up to 8 people drawing at once, **When** the share plays and people talk, **Then** the share keeps its frame rate, voices stay clear, and the office keeps its frame rate targets.

---

### User Story 3 - Drawing stays inside the conversation (Priority: P1)

Ink goes exactly where the share goes. Someone outside the conversation never receives a stroke, even if they stand right outside a meeting room's wall. Someone who joins the conversation sees ink drawn from then on. When the share ends, its ink goes with it.

**Why this priority**: people draw on email, code and documents. A stroke reaching someone it should not, or revealing where on a private screen people pointed, is the same breach as leaking the share (Constitution III). It belongs with P1 because US1 cannot ship without it.

**Independent Test**: A and B in Meeting Room A; A shares; B draws. C, just outside the wall, receives nothing about the drawing. C is let in, and the next stroke B draws reaches C. A stops sharing, and all ink disappears for everyone.

**Acceptance Scenarios**:

1. **Given** a share in a private room, **When** a member inside draws, **Then** no one outside the room receives the stroke or any sign that drawing happened.
2. **Given** a member who is not in the sharer's conversation, **When** they try to send ink for that share (for example from a stale page), **Then** it is dropped and reaches no one.
3. **Given** a member joins the conversation while others are drawing, **When** the next stroke is drawn, **Then** they see it. Ink that had already faded is not replayed.
4. **Given** a share ends (stopped, the sharer left, Do Not Disturb), **When** that happens, **Then** all its ink disappears for everyone, and no further ink for it is accepted.
5. **Given** a viewer leaves the conversation, **When** they are gone, **Then** they stop receiving ink, and the ink they were drawing fades out for the others.

---

### User Story 4 - The sharer controls the drawing (Priority: P2)

The sharer can clear all ink on their share at once, and can switch drawing off for others (and back on), for example while presenting something private or when it gets messy. Any drawer can clear their own ink. The sharer can always draw on their own share, using the in-app view of it.

**Why this priority**: Slack huddles give the sharer this control, and a share without it can be disrupted. Drawing works without it (US1–US3), so it is P2.

**Independent Test**: B and C draw on A's share. A presses Clear: all ink disappears for everyone. A switches drawing off: B's and C's pens are disabled with "Drawing is off", and nothing they try reaches anyone. A switches it back on, and B can draw again. B presses Clear mine: only B's ink goes.

**Acceptance Scenarios**:

1. **Given** ink from several people, **When** the sharer presses Clear all, **Then** every line on that share disappears for everyone within half a second.
2. **Given** a drawer, **When** they press Clear mine, **Then** only their own lines on that share disappear, for everyone.
3. **Given** the sharer turns drawing off, **When** a viewer tries to draw, **Then** their pen is disabled with "<sharer> turned drawing off", and nothing they try reaches anyone. All lines already on the share, the sharer's included, are cleared.
4. **Given** drawing is off, **When** the sharer turns it back on, **Then** viewers can draw again at once.
5. **Given** the sharer, **When** they want to draw, **Then** they can open a larger view of their own share in the app and draw on it. Their ink reaches viewers like anyone else's.
6. **Given** a new share starts, **When** viewers look, **Then** drawing is on by default.

---

### User Story 5 - Keep a drawing on screen for a while (Priority: P3)

A drawer can hold a line on screen instead of letting it fade, for example to keep a circle around something while discussing it. Held lines stay until their drawer or the sharer clears them, or the share ends.

**Why this priority**: helpful for longer explanations, but most pointing is quick. The fading default (US1) covers the main use.

**Independent Test**: B draws a circle with "keep" on. It doesn't fade after 4 seconds. B presses Clear mine and it goes.

**Acceptance Scenarios**:

1. **Given** keep is on, **When** a drawer finishes a stroke, **Then** it stays for everyone until cleared or the share ends.
2. **Given** keep is off (the default), **When** a stroke ends, **Then** it fades as in US1.
3. **Given** held lines, **When** the share's picture changes size (the sharer resizes the window), **Then** held lines stay at the same relative place on the picture.

---

### Edge Cases

- **The shared picture changes under the ink** (the sharer scrolls, switches tab or resizes the window): ink stays where it was drawn on the picture. It is not tied to the content underneath. That is why it fades by default, and held lines (US5) are cleared by their drawer.
- **A stroke that starts on the share and leaves its edge**: the part outside the picture is not drawn. The stroke continues if the pointer comes back while the button is still held.
- **A viewer switches which share they watch** (006 thumbnails): each share has its own ink. Switching shows that share's current ink, and nothing carries over between shares.
- **A viewer is in first person**: drawing works the same. The share is an overlay, so the pen releases pointer lock like any click on the panel (Constitution II).
- **Touch screens and pens** (a laptop touch screen, a graphics tablet): drawing with a finger or pen works like a mouse. A tablet's pressure is not used.
- **Big drawings**: a viewer who draws continuously for a long time doesn't overwhelm others. Very long strokes are split into pieces, and there is a limit on how much ink one person can send per second. Beyond it, their pen pauses with "Slow down".
- **Network hiccup**: ink that arrives late is shown when it arrives, and still fades on time. A stroke whose end never arrives is faded out after a few seconds anyway.
- **The share is paused or still connecting** (006 states): drawing is available. Ink sits over the last picture.
- **Do Not Disturb or leaving while drawing**: the drawer's ink stops and fades, as they leave the conversation (006 rules).
- **The sharer is alone** (desk or room view): the sharer can draw, but no one else sees it, as there is no one to see the share.
- **Colors and themes**: each color stays visible on light and dark screen content, with a thin contrasting outline.

## Requirements *(mandatory)*

### Functional Requirements

**Drawing**

- **FR-001**: Every member who can see a share (every viewer and the sharer) MUST be able to turn a pen on and draw on that share with a mouse, touch or pen.
- **FR-002**: The drawer MUST see their own line follow the pointer with no noticeable delay. Every other member watching that share MUST see the line appear as it is drawn, within half a second.
- **FR-003**: Ink MUST be pinned to positions on the shared picture, so it lands on the same spot for every member whatever their window size, full window or not, and across changes of the picture's size.
- **FR-004**: Lines MUST look smooth and continuous for drawers and watchers, including fast strokes.
- **FR-005**: By default, a finished line MUST stay fully visible for about 3 seconds, then fade out over about 1 second, for everyone.
- **FR-006**: With the pen off, the share MUST behave exactly as in feature 006. Turning the pen on or off, or pressing Esc, MUST be immediate.

**Several drawers**

- **FR-007**: Several members MUST be able to draw on the same share at the same time. Each member's ink MUST have its own color, stable for the conversation and distinct from the others' for up to 8 members.
- **FR-008**: While a member draws, a small tag with their name MUST follow their pen tip for the other members, and disappear shortly after they stop.
- **FR-009**: With up to 8 members drawing at once, the share, the voices and the office MUST keep their quality and frame rate targets (006 SC-003, SC-005, SC-007).
- **FR-010**: Each member's ink MUST be limited to a sensible rate. Beyond it, their pen MUST pause briefly with a "Slow down" note rather than flood others.

**Privacy and lifetime**

- **FR-011**: Ink for a share MUST reach exactly the members who can see that share (006 FR-006) and no one else. The server MUST decide this, and MUST drop ink from anyone who is not a member of that share's conversation (Constitution III).
- **FR-012**: Ink MUST NOT be stored, recorded or replayed. It exists only while it is on screen. A member who joins sees only ink drawn after they joined.
- **FR-013**: When a share ends, all its ink MUST disappear for everyone, and further ink for it MUST be refused.
- **FR-014**: A test MUST prove that a member outside a private room, outside a locked desk, or only overhearing from a desk pod receives no ink (Constitution III).

**Control**

- **FR-015**: Any drawer MUST be able to clear their own ink on a share. The sharer MUST be able to clear all ink on their share. Both MUST take effect for everyone within half a second.
- **FR-016**: The sharer MUST be able to turn drawing off and on for their share. While it is off, others MUST NOT be able to draw (their pen is disabled with a reason), existing ink MUST be cleared, and the server MUST drop any ink sent anyway. Drawing MUST be on by default for a new share.
- **FR-017**: The sharer MUST be able to draw on their own share through a larger in-app view of it.

**Keep (P3)**

- **FR-018**: A drawer MUST be able to choose to keep their lines instead of letting them fade. Kept lines stay until their drawer or the sharer clears them, drawing is turned off, or the share ends.

**Both views**

- **FR-019**: Drawing MUST work the same in top-down and first person, as the share is an overlay (Constitution II).

### Key Entities *(include if feature involves data)*

- **Stroke**: one continuous line by one member on one share. It has the drawer, the share, the color, whether it is kept, and its points as positions on the shared picture. It exists only on screen until it fades or is cleared.
- **Ink color**: the color assigned to a member for the current conversation, distinct among its members.
- **Drawing setting**: per share, whether others may draw. Set by the sharer, on by default, and lost when the share ends.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Other viewers see a stroke appear within half a second of it being drawn, in at least 95% of strokes, on a normal office network.
- **SC-002**: A stroke lands on the same spot of the shared picture, within 1% of the picture's width, for viewers with different window sizes and in full window.
- **SC-003**: With 4 people drawing at once for 30 seconds, every viewer sees all 4 lines in 4 distinct colors, with no lost strokes on a normal network.
- **SC-004**: With up to 8 people drawing at once, the share's frame rate and the office's frame rate stay at their 006 targets, and voices stay clear.
- **SC-005**: In 100% of tested cases, a member outside the sharer's conversation receives no ink.
- **SC-006**: Clear all, Clear mine and turning drawing off take effect for everyone within half a second.
- **SC-007**: In a usability check with five people who have used Slack huddles, at least 4 draw on a share and clear their ink without help.
- **SC-008**: Existing behavior is unchanged: screen sharing (006), conversations, rooms and desks, and every existing privacy check still pass.

## Assumptions

- **Slack huddles is the reference**, as the issue says:
  - anyone in the call draws;
  - each person has a color;
  - lines fade after a few seconds;
  - the sharer can turn drawing off.
  The planning research MUST record the observed behavior and its sources (Constitution I). If Gather has an equivalent, its behavior is recorded too.
- **The sharer sees ink inside the app, not on their real screen.** Slack's desktop app draws on top of the sharer's actual screen. A web page cannot draw over other windows or the desktop, so the sharer sees ink on the in-app view of their share (FR-017). This is a deliberate deviation, and the biggest one from Slack.
- **The timings and the cap** (3 seconds fully visible, a 1-second fade, colors distinct for up to 8 people) are our own choices. 8 matches the open-floor conversation size.
- **Ink is tied to the picture, not the content.** If the shared window scrolls, ink stays put on the picture. This is the same in Slack, and is why fading is the default.
- **No shapes, text, arrows, highlighter, eraser tool or undo** in this feature. It is a pen with fading or kept lines, plus clearing. They can come later.
- **No pressure or line-width choice.** One line width, sized to stay visible on 1080p content.
- **Nothing is saved.** No screenshots of drawings, no export, no history (recording is out of scope in the constitution).
- This feature builds on 006's share identity (the share's id and picture size) and on its audience rule. No change to who can see a share.
- The zero-infrastructure path keeps working: drawing between local browser windows works with `npm run dev` (Constitution V).
