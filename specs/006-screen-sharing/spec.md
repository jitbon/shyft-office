# Feature Specification: Screen Sharing

**Feature Branch**: `006-screen-sharing`

**Created**: 2026-10-30

**Status**: Draft

**Input**: User description: "Screen sharing (GitHub issue #1, Gather V3 board). Users should be able to share their screen with the people they're in a conversation with, like Slack huddles: start/stop sharing from the call panel, everyone in the same conversation (proximity bubble, private meeting room, or desk) sees the shared screen in a large view, and sharing must feel smooth (good resolution/frame rate for text and motion). Drawing on a shared screen is a separate follow-up (issue #5) and out of scope, but the design should leave room for it."

## Context

Today a conversation carries voice and a small camera tile per person. There is no way to show someone what is on your screen: you have to describe it, or paste screenshots into chat. Slack huddles and Gather both let anyone in a call share a screen, a window or a browser tab, and everyone else in the call watches it in a large view while still hearing each other.

This feature adds that to every kind of conversation the office already has: a proximity conversation on the open floor, a meeting in a private room, and a desk (your own, or one you were let into). Who can see a share follows exactly the same rules as who can see your camera today. Nothing about who is in a conversation changes.

Issue #1 also mentions drawing on the shared screen. That is issue #5, a separate feature. This spec only makes sure a share has a stable identity (who is sharing, in which conversation, the picture's size) that drawing can attach to later.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Share your screen with the people you're talking to (Priority: P1)

A member in a conversation presses **Share screen** in the call panel. Their browser asks what to share: the whole screen, one window or one tab. They pick one, and within a few seconds everyone else in the conversation sees it in a large view above or beside the video tiles, sharp enough to read code and documents. The sharer sees a clear "You are sharing" banner with a **Stop sharing** button. Pressing it, or stopping from the browser's own control, ends the share for everyone.

**Why this priority**: this is the feature. Everything else builds on one person showing their screen to the people in their conversation.

**Independent Test**: two members stand next to each other (a conversation opens). One presses Share screen and picks a window with text in it. The other sees that window, large and readable, within 3 seconds. The sharer stops: the large view goes away for both.

**Acceptance Scenarios**:

1. **Given** a member in a conversation, **When** they press Share screen and pick a screen, window or tab, **Then** every other member of that conversation sees it in a large view within 3 seconds, and the sharer sees a "You are sharing" banner with Stop sharing.
2. **Given** a share is running, **When** the sharer presses Stop sharing, or stops it from the browser's own control, **Then** the large view closes for everyone within 2 seconds.
3. **Given** a member presses Share screen, **When** they cancel the browser's picker, **Then** nothing is shared, nothing is shown to anyone and no error is shown (cancelling is a normal choice).
4. **Given** a share is running, **When** viewers look at the share, **Then** voice and camera tiles keep working as before. Each person can still be heard and seen, and the sharer's own tile stays in the strip.
5. **Given** a share of a document with normal-sized text, **When** a viewer on a typical laptop screen looks at the large view, **Then** they can read the text without asking the sharer to zoom in.
6. **Given** a share is running, **When** the sharer scrolls or plays a short video, **Then** viewers see the motion smoothly, without long freezes.

---

### User Story 2 - A share only reaches the people in your conversation (Priority: P1)

A share goes exactly where the sharer's voice and camera go: the members of their conversation. Someone outside a private meeting room never receives it. Someone who walks away from a proximity conversation stops seeing it. Someone who walks up and joins starts seeing it.

**Why this priority**: people share email, code and documents. A screen reaching someone it should not is worse than having no screen sharing (Constitution III). It belongs with P1 because US1 cannot ship without it.

**Independent Test**: three members. A and B are in a private meeting room and A shares. C stands right outside the room's wall: C sees no share and receives no share data. C knocks and is let in: C now sees the share. B walks out of the room: B's view of the share closes.

**Acceptance Scenarios**:

1. **Given** A shares in a private meeting room, **When** C is outside the room, however close, **Then** C does not see the share, does not receive any of its picture or sound, and is not told what is shown.
2. **Given** A is sharing in a proximity conversation, **When** a new member walks up and joins the conversation, **Then** they start seeing the share within 3 seconds, without A doing anything.
3. **Given** A is sharing, **When** a viewer leaves the conversation (walks away, leaves the room or desk), **Then** their large view closes within 2 seconds and they stop receiving the share.
4. **Given** A is sharing, **When** A leaves the conversation, **Then** the share stops for everyone and A's banner tells A the share ended because they left.
5. **Given** a desk pod in ambient mode, **When** someone at a neighbouring desk shares, **Then** neighbours who only faintly overhear do not see the share. Overhearing is voice only.
6. **Given** a member on Do Not Disturb, **When** they are not in any conversation, **Then** they cannot be sent a share.

---

### User Story 3 - Several sharers and choosing what to watch (Priority: P2)

More than one person can share at once, as in Gather and Slack huddles. When two or more people share, viewers see the most recent share in the large view and a small labelled thumbnail for each of the others, and can click a thumbnail to swap it into the large view. A viewer can also make the large view fill the browser window, and step back out.

**Why this priority**: two people comparing their screens is common in pairing and design reviews, and a full-window view matters for small screens. A single sharer at a time (US1) is already useful on its own.

**Independent Test**: A and B both share in one conversation. C sees B's (more recent) share large and A's as a labelled thumbnail. C clicks A's thumbnail: A's share is now large. C presses full window: the share fills the browser window; Esc brings it back.

**Acceptance Scenarios**:

1. **Given** A is sharing, **When** B also starts sharing, **Then** viewers see B's share large and a thumbnail of A's labelled with A's name, and A's share keeps running.
2. **Given** two shares, **When** a viewer clicks the thumbnail of the one not shown large, **Then** it moves into the large view for that viewer only. Other viewers keep their own choice.
3. **Given** a viewer has picked a share, **When** another member starts a new share, **Then** the viewer's choice is kept, and the new share appears as a thumbnail with a brief "<name> started sharing" cue.
4. **Given** the share shown large stops, **When** others are still sharing, **Then** the most recent remaining share moves into the large view.
5. **Given** a large view, **When** the viewer presses the full-window control, **Then** the share fills the browser window, with the sharer's name and a way back. Esc or the control returns to the normal view.
6. **Given** a sharer, **When** they look at the call panel, **Then** they see a small preview of their own share, so they know what others see. Their share is never shown back to them large, to avoid a picture inside a picture.

---

### User Story 4 - Share sound with the screen (Priority: P3)

When the sharer picks a browser tab (or, where the browser allows, the whole screen), they can choose to include its sound, for example to play a short video to the group. Viewers hear it alongside the conversation. Viewers can turn the shared sound down or mute it for themselves without muting the sharer's voice.

**Why this priority**: useful for watching a clip together, but most sharing is silent documents and code. Browsers only offer it for some kinds of share.

**Independent Test**: A shares a tab playing a video with "share audio" ticked. B hears the video's sound and A's voice. B mutes the shared sound: B still hears A talking.

**Acceptance Scenarios**:

1. **Given** the sharer picks a tab and ticks the browser's share-audio option, **When** the share starts, **Then** viewers hear the tab's sound.
2. **Given** shared sound is playing, **When** a viewer mutes or turns down the shared sound, **Then** only the shared sound changes for them. The sharer's voice and the rest of the conversation are unaffected.
3. **Given** a share without sound (a window, or a share where sound was not ticked), **When** viewers watch it, **Then** they see no sound controls for it.
4. **Given** shared sound in a proximity conversation, **When** viewers stand at different distances, **Then** the shared sound is not faded by distance. It plays at the viewer's chosen level, since everyone is watching the same screen.

---

### Edge Cases

- **The sharer's browser can't share** (an older browser, or the page is not on a secure address): Share screen is shown as unavailable, with a short reason, instead of failing after a click.
- **The sharer denies or later revokes permission** (OS screen-recording permission on macOS, for example): nothing is shared, and the sharer sees a short message saying how to allow it.
- **The shared window is closed or minimized**: closing it ends the share as if the sharer stopped. Minimizing may freeze or blank the picture, and viewers then see the last picture or a "paused" state, not an error.
- **A sharer shares the office tab itself**: allowed. The result looks like a mirror; this is not blocked.
- **Switching views (2D ↔ first person)**: the share keeps running and the large view stays open, for the sharer and viewers. It is an overlay, so it looks the same in both views (Constitution II).
- **Conversation is full or a big room limits who sends camera video**: a share is still shown to every member. Camera limits do not hide shares (assumed). Each conversation allows at most 3 shares at once; a fourth sharer is told sharing is full.
- **Moving a little within a proximity conversation**: viewers who stay in the conversation keep the share; only leaving the conversation closes it.
- **The sharer goes Do Not Disturb**: they leave conversations (as today), so their share stops.
- **A viewer's connection is poor**: the share drops resolution or frame rate first, and never freezes the conversation's voice. Text can get blurry for a moment before it gets sharp again.
- **A share from a very large or very wide screen** (ultrawide, 4K): it is scaled to fit the large view, without stretching or cropping, and full-window shows it bigger.
- **The member is alone at a desk or in a meeting room** (the one-tile view): Share screen is available but has no audience. It shows "No one else is here yet" and the share reaches anyone who joins.
- **Network drop and reconnect**: the share stops if the sharer's connection is gone for more than a few seconds, as other media does today. It does not restart by itself; the sharer starts it again.

## Requirements *(mandatory)*

### Functional Requirements

**Starting and stopping**

- **FR-001**: A member in any conversation (proximity, private room, desk) MUST be able to start a screen share from the call panel. They pick a screen, window or browser tab through the browser's own picker.
- **FR-002**: A member MUST be able to stop their share from the call panel, and stopping it with the browser's own stop control MUST have the same effect.
- **FR-003**: Starting a share MUST only ever happen because the sharer chose to. Nothing (joining a room, a setting, another member) MAY start or restart a share for them (Constitution III).
- **FR-004**: While sharing, the sharer MUST see a constant "You are sharing" indicator with a stop control, in both views.
- **FR-005**: Where sharing is not possible (unsupported browser, insecure address, permission denied), the Share screen control MUST say why, instead of failing silently.

**Who sees it**

- **FR-006**: A share MUST reach exactly the members of the sharer's conversation (the people who receive the sharer's camera under today's rules) and no one else. Ambient overhearing (desk pods) MUST NOT carry a share.
- **FR-007**: The server MUST decide who may receive a share, using the same rules it already enforces for conversations. A share MUST NOT reach anyone outside a private context, and a test MUST prove this for a private room and a locked desk (Constitution III).
- **FR-008**: When a member joins a conversation with a running share, they MUST start receiving it within 3 seconds. When they leave, they MUST stop receiving it within 2 seconds.
- **FR-009**: When the sharer leaves their conversation, goes Do Not Disturb or disconnects, their share MUST stop.
- **FR-010**: Other members of the conversation MUST see who is sharing: a share label with the sharer's name, and a sharing mark on the sharer's tile. People outside the conversation MUST NOT be told what is being shared.

**Viewing**

- **FR-011**: Viewers MUST see a running share in a large view, kept at its true proportions, while the conversation's voice and camera tiles keep working.
- **FR-012**: A viewer MUST be able to make the large view fill the browser window and return from it.
- **FR-013**: With several shares in one conversation, viewers MUST see the most recent one large and the others as labelled thumbnails, and MUST be able to choose which is large. The choice is the viewer's own.
- **FR-014**: A conversation MUST allow up to 3 shares at once. A member who tries to start a fourth MUST be told sharing is full.
- **FR-015**: A sharer MUST see a small preview of their own share and MUST NOT see it fed back to them large.
- **FR-016**: The share and its large view MUST keep running when the viewer or sharer switches between top-down and first person.

**Quality**

- **FR-017**: Shares MUST favour readable detail. Text that is readable on the sharer's screen at normal size MUST be readable in a viewer's large view on a 1440×900 or larger window.
- **FR-018**: Shares MUST stay smooth during scrolling and motion, and MUST put the conversation's voice first when the connection is short of capacity.
- **FR-019**: Starting a share MUST NOT noticeably slow the office for the sharer or viewers (the client keeps its frame rate targets from the constitution).

**Sound (P3)**

- **FR-020**: Where the browser offers it, the sharer MUST be able to include the shared tab's or screen's sound. Viewers MUST hear it without distance fading, and MUST be able to mute or lower it for themselves separately from the sharer's voice.

**Room for drawing (issue #5)**

- **FR-021**: Each share MUST have an identity known to everyone in the conversation: who is sharing, in which conversation, and the picture's size and proportions, so that a later feature can attach drawings to a share and to positions on it. No drawing is built in this feature.

### Key Entities *(include if feature involves data)*

- **Screen share**: one member showing one screen, window or tab to their conversation. It has a sharer, the conversation it belongs to, a start time, whether it carries sound, and the picture's current width and height. It exists only while it runs. Nothing is recorded or kept.
- **Share audience**: the members who may receive a share. It is always the sharer's current conversation members, worked out by the server, never chosen by the sharer.
- **Viewer focus**: which share a viewer has in the large view, and whether it is full-window. It is local to that viewer and is not shared or stored.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A viewer sees a share within 3 seconds of the sharer picking what to share, in at least 95% of tries between two browsers on a normal office network.
- **SC-002**: Normal-sized text (an editor or document at 100% zoom) in a share is readable in the viewer's large view on a 1440×900 or larger window, in every tested share of a 1080p screen.
- **SC-003**: Scrolling a document or playing a short video in a share looks smooth to viewers: at least 15 updates per second for motion on a normal connection, with no freeze longer than 1 second.
- **SC-004**: In 100% of tested cases, members outside the sharer's conversation (outside a private room, or ambient desk neighbours) receive nothing of the share.
- **SC-005**: Voice in the conversation stays clear while a share runs. In a test where the connection is limited, the share loses quality before the voice does.
- **SC-006**: In a usability check with five people who have used Slack huddles or Gather, at least 4 start a share, find the stop control and stop it without help.
- **SC-007**: The office keeps its frame rate targets (60 fps in top-down and first person) on the sharer's and viewers' machines while one share runs.
- **SC-008**: Existing behavior is unchanged: conversations, rooms, desks, camera and mic behavior and every existing privacy check still pass.

## Assumptions

- Gather and Slack huddles both allow several people to share at once and show one large with the rest selectable. This spec follows that. The planning research MUST record observed Gather screen-share behavior (Constitution I). The cap of 3 shares per conversation is our own limit, to keep each member's connection light, and is a deliberate deviation if Gather allows more.
- A share follows the camera's audience exactly. No separate "share with the whole office" or "share outside the conversation" option is included.
- Camera video limits in big meetings do not apply to shares. A share is the thing everyone came to see.
- Ambient desk overhearing is voice only and does not carry shares. It is taken to be a courtesy feature, not a meeting.
- Sharing is a desktop feature. Desktop Chromium, Firefox and Safari are the targets (constitution platforms). Each browser offers what it offers (for example, tab sound is mainly a Chromium feature), and the spec allows for that.
- "Smooth" is taken to mean: sharp text first, then motion. Readability beats frame rate when the two compete, except during visible motion. The exact balance is a planning decision.
- No recording, no saved screenshots and no share history. Recording is out of scope in the constitution.
- The zero-infrastructure path keeps working: sharing between local browser windows works with `npm run dev`. A media server may be considered in planning for larger groups, but only as an optional addition (Constitution V).
- Drawing on shares (issue #5) and remote control of someone else's screen are out of scope.
