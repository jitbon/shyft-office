# Feature Specification: Character Statuses

**Feature Branch**: `013-character-statuses`

**Created**: 2026-11-08

**Status**: Implemented

**Input**: User description: "the #9 character statuses ticket, I think it's already done?" GitHub issue #9 (Gather V3 board G3-9): "need to add status like away, lunch, in a meeting... etc... make it integrate with the UI and what not perfectly etc."

## Context: what already exists

The first feature (001, User Story 5) shipped a basic status:
- three kinds: **Available**, **Busy** and **Do Not Disturb**, picked from the Status button at the top of the screen;
- an optional note of up to 60 characters ("What are you up to?") and an optional time limit (15, 30 or 45 minutes);
- a colored dot on the name tag in the top-down and first-person views, in the people list, and on the desk hover card;
- the note in the people list and on the desk card;
- Do Not Disturb turns the mic, camera and screen share off, keeps conversations from opening, and Ctrl/⌘+U toggles it.

So issue #9 is **partly done**. What is missing:
1. **Away, Lunch, In a meeting and similar statuses.** Today they can only be typed as a note under Available or Busy, so the dot doesn't say "away" and nobody can tell it at a glance.
2. **In a meeting doesn't set itself.** Nobody shows as in a meeting when they are in one. (Away stays something the member sets; see Clarifications.)
3. **Seeing a status without hovering or opening the people list.** On the map only a small colored dot shows. The note and the kind are invisible unless you hover a desk or open the list.
4. **"Integrates with the UI perfectly."** Status is not in conversation panels, chat, ring or wave notices, or the desk view, and setting one takes several clicks.

This feature fills those gaps. It keeps the three existing kinds and what they do.

## Clarifications

### Session 2026-11-08

- Q: Should someone go Away automatically when idle or when the office tab is hidden? → A: No. Away is only ever set by the member (or ends with its time limit), because someone can be in the space without the tab in front.
- Q: Should In a meeting turn on by itself in a private room, a group of 3 or more, or a screen share? → A: Yes. On by default, each member can turn it off, it never replaces a status they chose, and it ends when they leave.
- Q: Should Away, Lunch, Coffee break and Out for the day block conversations and turn the mic and camera off? → A: Yes, both. Devices come back on when the member sets another status themselves (not when a status runs out on its own; see FR-019), and rings still get through with the status shown to the sender.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pick a ready-made status in one click (Priority: P1)

A member opens the Status menu and sees ready-made statuses, each with an icon and a color: **Available**, **In a meeting**, **Focusing**, **Lunch**, **Coffee break**, **Away**, **Out for the day**, **Busy** and **Do Not Disturb**. One click sets it. Each has a sensible default time limit (Lunch: 1 hour, Coffee break: 15 minutes, In a meeting: 1 hour, Out for the day: until tomorrow morning) that can be changed. They can still add their own note, and pick an emoji for a custom status.

**Why this priority**: it is what the issue literally asks for, and everything else builds on these statuses.

**Independent Test**: open the Status menu, click Lunch. Your dot turns to the Lunch color with a 🍽 icon, the people list says "Lunch · back in 60 min", and after an hour (or with the clock moved) you are Available again.

**Acceptance Scenarios**:

1. **Given** the Status menu, **When** a member opens it, **Then** they see at least 8 ready-made statuses, each with a name, icon and color, and the current one marked.
2. **Given** a ready-made status, **When** the member clicks it, **Then** it applies at once, with its default time limit, and the menu closes.
3. **Given** a ready-made status, **When** the member changes its time limit or adds a note before setting it, **Then** those are kept.
4. **Given** a custom status, **When** the member types a note and picks an emoji, **Then** the emoji shows where the status icon would.
5. **Given** a status with a time limit, **When** the time runs out, **Then** it returns to Available for everyone, without a reload.
6. **Given** the last 3 statuses the member set, **When** they open the menu, **Then** those are offered again at the top as recent ones.

---

### User Story 2 - See everyone's status at a glance (Priority: P1)

Walking around the office, a member sees each person's status without hovering: a small icon over their head next to the name in both views (🍽 for Lunch, 🎧 for Focusing, 📅 for In a meeting, 💤 for Away), and a dimmed avatar when someone is Away or Out. Hovering or clicking a person shows the full status: name, status, note and "back in 20 min". The same status appears everywhere a person is named.

**Why this priority**: a status nobody sees is useless. Today only a small dot shows, which needs a legend to read.

**Independent Test**: member A sets Lunch with the note "back at 1". Member B sees a 🍽 over A's head in top-down and in first person, a dimmed avatar, and "Lunch · back at 1 · 42 min left" when hovering A, in the people list, on A's desk card and in A's conversation tile.

**Acceptance Scenarios**:

1. **Given** someone with a status other than Available, **When** others see them on the map in either view, **Then** the status icon shows next to their name, readable at the default zoom.
2. **Given** someone who is Away, on Lunch, on a Coffee break or Out for the day, **When** others see them, **Then** their avatar is visibly dimmed, and it isn't dimmed for other statuses.
3. **Given** a person, **When** someone hovers or clicks them on the map, **Then** a card shows their name, status, note and time left.
4. **Given** a person's status, **When** they appear in the people list, a conversation panel, a chat message's name, a ring or wave notice, or a desk card, **Then** the same icon and color are used.
5. **Given** a status change, **When** it is made, **Then** everyone sees it within 1 second.

---

### User Story 3 - In a meeting while you are in one (Priority: P2)

When a member is in a private meeting room, a conversation with 3 or more people, or a screen share, they can show as **In a meeting** automatically. When they leave it, their status goes back to what it was.

**Why this priority**: "in a meeting" is in the issue, and the office already knows when someone is in one.

**Independent Test**: A has automatic meeting status on and walks into Meeting Room A with B. Others see 📅 In a meeting over both. A walks out: A is Available again.

**Acceptance Scenarios**:

1. **Given** automatic meeting status on (default on), **When** the member enters a private room with someone else, joins a conversation of 3 or more people, or shares their screen, **Then** they show as In a meeting.
2. **Given** an automatic In a meeting, **When** the member leaves the room, conversation or share, **Then** their previous status returns.
3. **Given** a status the member set themselves other than Available, **When** they join a meeting, **Then** it isn't changed.
4. **Given** someone In a meeting, **When** others walk up to them, **Then** they see they are in a meeting, and the conversation rules don't change (a meeting room is already closed to people outside it).

---

### User Story 4 - Statuses that change what happens (Priority: P3)

Some statuses change how others reach you, as Do Not Disturb does today:
- **Focusing**: conversations don't open automatically around you, but a ring reaches you.
- **Away, Lunch, Coffee break, Out for the day**: like Focusing, and your mic and camera are off while you are away.
- When someone rings or waves at a person whose status keeps conversations from opening (Do Not Disturb, Focusing or an away status), they are told "<name> is at lunch, back in 20 min" instead of waiting.

**Why this priority**: it makes statuses useful, not just decorative, but the office works without it.

**Independent Test**: A sets Focusing. B walks up: no conversation opens and B sees "A is focusing". B rings A: A gets the ring. A sets Lunch: B's ring is answered with "A is at lunch, back in 42 min".

**Acceptance Scenarios**:

1. **Given** someone Focusing, Away, on Lunch, on a Coffee break or Out, **When** others walk into range, **Then** no conversation opens, and the visitor sees why.
2. **Given** someone Away, on Lunch, on a Coffee break or Out, **When** their status is set, **Then** their mic and camera turn off. When the member sets another status themselves, the ones they had on come back on. When the status runs out on its own, they stay off and the member is offered a button to turn them back on.
3. **Given** someone away, **When** another person rings or waves at them, **Then** the sender is told the status and time left at once, and the ring is still delivered.
4. **Given** Available, Busy, In a meeting, **When** others walk into range, **Then** conversations work as today.

---

### Edge Cases

- A member has two tabs open: a status set in either shows in both.
- A member switches to another app or hides the office tab: their status doesn't change.
- A member's computer sleeps or loses its connection: after the server's usual timeout they show as offline, as today, not Away.
- A time-limited status ends while the member is idle: it returns to Available.
- A member in Do Not Disturb enters a meeting room: they stay in Do Not Disturb.
- A guest (no member ID): can set statuses like anyone; the automatic In a meeting setting and recent statuses are kept on that device, as for members.
- An emoji that is very wide or several emoji: only one emoji is kept.
- A note with a link or a very long word: it is shown as plain text, cut to fit.
- Very dark or bright office themes (feature 012): status icons and dimmed avatars must stay readable.
- Someone with an old client: they see the closest existing kind (Busy or Do Not Disturb) and their dot color, and can still use the three old kinds.

## Requirements *(mandatory)*

### Functional Requirements

**Statuses**

- **FR-001**: The product MUST offer these statuses, each with a name, icon and color: Available, In a meeting, Focusing, Lunch, Coffee break, Away, Out for the day, Busy, Do Not Disturb.
- **FR-002**: Available, Busy and Do Not Disturb MUST keep their current behavior, colors and the Ctrl/⌘+U shortcut.
- **FR-003**: Each ready-made status MUST have a default time limit (none, or a set duration, or "until tomorrow morning" in the member's local time), changeable before it is set.
- **FR-004**: A member MUST be able to add a note (up to 60 characters, as today) to any status, and pick one emoji for it.
- **FR-005**: The Status menu MUST set a ready-made status in one click and offer the member's 3 most recent statuses.
- **FR-006**: When a status's time runs out, the member MUST return to Available for everyone without a reload.

**Showing statuses**

- **FR-007**: A person's status icon MUST show next to their name on the map in both views when it isn't Available.
- **FR-008**: Away, Lunch, Coffee break and Out for the day MUST dim the person's avatar in both views, to between 40% and 60% opacity, so it stays visible in every office theme.
- **FR-009**: Hovering or clicking a person on the map MUST show their name, status, note and time left.
- **FR-010**: The same status icon and color MUST appear wherever a person is named: people list, conversation panels, chat, ring and wave notices, desk cards and the desk view.
- **FR-011**: A status change MUST reach everyone within 1 second.
- **FR-012**: Status icons, colors and text MUST stay readable (contrast at least 4.5:1 for text) in every office theme.

**Automatic and manual statuses**

- **FR-013**: The product MUST NOT set Away, Lunch, Coffee break or Out for the day automatically. Idle time, a hidden tab or another app in front MUST NOT change a member's status.
- **FR-014**: Those statuses MUST end only when the member changes them or their time limit runs out.
- **FR-015**: A member who is Available MUST show as In a meeting while they are in a private room with someone else, in a conversation of 3 or more people, or sharing their screen, unless they turned this off. Leaving MUST return their previous status.
- **FR-016**: Automatic In a meeting MUST NOT replace a status the member set themselves, other than Available.
- **FR-017**: A member's automatic In a meeting setting MUST be kept between visits.

**Effects**

- **FR-018**: Focusing, Away, Lunch, Coffee break and Out for the day MUST keep conversations from opening automatically around the person, and show visitors why.
- **FR-019**: Away, Lunch, Coffee break and Out for the day MUST turn the person's mic and camera off. The ones they had on MUST come back on only when the member sets another status themselves. When the status runs out on its own, mic and camera MUST stay off, and the member MUST be offered a one-click way to turn them back on.
- **FR-020**: A ring or wave sent to someone whose status keeps conversations from opening (Do Not Disturb, Focusing, Away, Lunch, Coffee break, Out for the day) MUST be delivered, and the sender MUST be told their status, note and time left at once.

**General**

- **FR-021**: The server MUST check every status: a known kind, a note of at most 60 characters, one emoji, and a time limit in the future and at most 24 hours ahead (or until the next morning for Out for the day).
- **FR-022**: Statuses MUST follow the member across tabs and reconnects as today, and a status set in one tab MUST show in the others.

### Key Entities

- **Status**: what a person shows: its kind (one of FR-001), an optional note, an optional emoji, an optional end time, and whether it was set automatically.
- **Status kind**: a fixed entry with a name, icon, color, default time limit, and its effects (keeps conversations from opening, turns devices off).
- **Status preferences**: whether automatic In a meeting is on, and the member's 3 most recent statuses.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member can set any ready-made status in 2 clicks or fewer from anywhere in the office.
- **SC-002**: In a test, 5 out of 5 people can tell from the map alone, without hovering, who is away, at lunch, in a meeting or focusing.
- **SC-003**: In a full day with the office tab hidden or idle, a member never shows as Away, Lunch, Coffee break or Out for the day unless they set it.
- **SC-004**: Every status change reaches all connected people within 1 second.
- **SC-005**: 100% of status icons and text meet 4.5:1 contrast in every office theme.
- **SC-006**: Nobody who set a status themselves has it changed by an automatic status in a full day of use.

## Assumptions

- **Builds on 001.** The existing status (kinds, note, time limits, colored dots, people list, desk card, Do Not Disturb) is kept and extended, not replaced.
- **Gather parity.** Gather's status options are observed as Available, Busy, Do Not Disturb and Focus, with expiring statuses (15/30/45 min), a text status and an emoji status (research-gather.md §5). Lunch, Coffee break, Away, Out for the day, In a meeting and automatic In a meeting are **unknown** in Gather, and are added because the issue asks for them. That is a deliberate deviation.
- **Away statuses block conversations (clarified).** Away, Lunch, Coffee break and Out for the day keep conversations from opening and turn devices off, because the person isn't at the computer. Rings still go through.
- **Default: Busy and In a meeting are informational.** They don't change how conversations open, as Busy works today.
- **No automatic Away.** People often work with the office tab in the background while still in the space, so idle time and hidden tabs are never read as "away".
- **Automatic In a meeting is on by default (clarified).** Members can turn it off.
- **Statuses are public.** Like today's status and note, anyone in the office can see them. No calendar or outside service is read.
- **Emoji** come from the device's own emoji font. No image files are added.

### Out of scope

- Reading calendars or other apps to set statuses.
- Statuses or notes visible outside the office (email, chat apps).
- Status history or reports of how long people were away.
- Custom status kinds with their own effects defined by admins.
- Animated status icons.
