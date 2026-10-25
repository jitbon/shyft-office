# Feature Specification: Gather-Style Desks, Office Spaces and Proximity Meetings

**Feature Branch**: `001-gather-office-spaces`

**Created**: 2026-10-24

**Status**: Draft

**Input**: User description: "I want this to replicate gather-town's "desk"/"office space"/meeting space format, with a meeting opening up between two people in a space. Use REA to inspect gather.town's infrastructure and base it on that. The sprites used don't have to be the same, I would just want the ability to create them tho (doens't have to be within the site)"

**Reference research**: [research-gather.md](./research-gather.md) records what an REA capture of gather.town's
shipped web client showed about desks, private areas, proximity conversations, status and avatar sprites. This spec
copies those behaviors, not Gather's art or branding.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A meeting opens when two people walk up to each other (Priority: P1)

Two coworkers are walking around the shared office. When one avatar comes within talking range of the other, a
conversation opens between them on its own: they see and hear each other, and each sees a small panel showing who is
in the conversation. Nobody has to click "call". When either one walks out of range, the conversation ends for that
person. A third person who walks into range of either participant joins the same conversation.

**Why this priority**: This is the defining behavior the user asked for ("a meeting opening up between two people in
a space"). On its own it turns the existing walk-around office into a working virtual office.

**Independent Test**: Open the office as two users. Move their avatars next to each other and check that a
conversation with live audio/video starts. Move one away and check that it ends. Adding a third user and walking them
in tests joining.

**Acceptance Scenarios**:

1. **Given** two users in an open area more than talking range apart, **When** one walks to within talking range of
   the other, **Then** within 2 seconds both see a conversation panel listing the other person and can hear/see them
   (subject to each person's mic/camera being on).
2. **Given** two users in a conversation, **When** one walks beyond talking range, **Then** that user leaves the
   conversation within 2 seconds, and both panels update.
3. **Given** two users in a conversation, **When** a third user walks within talking range of either participant,
   **Then** the third user joins the same conversation and all three see each other in their panels.
4. **Given** a user in a conversation, **When** they mute their microphone or turn off their camera, **Then** the
   others see a muted / camera-off indicator for that person, and the conversation stays open.
5. **Given** a user whose browser has denied mic/camera access, **When** they walk into range of someone, **Then** they
   still join the conversation as a listen-and-chat participant and see a clear message about how to enable devices.
6. **Given** two users within talking range but separated by a wall, **When** they stand on either side of it,
   **Then** no conversation opens between them.

---

### User Story 2 - Private meeting areas (Priority: P2)

The office has meeting rooms and other marked private areas. Everyone standing inside the same private area is in one
meeting together, however far apart they stand within it. Nobody outside can hear them, see their video or read their
chat. The area's border lights up for people inside it, and a label shows the area's name and how many people are in
it.

**Why this priority**: Gather separates "bump into someone" conversations from held meetings this way, and
stand-ups and 1:1s depend on it. The current office already has meeting-room zones that scope chat. This story extends
those zones to audio/video and visible borders.

**Independent Test**: Put three users in Meeting Room A and one user just outside its door. The three are in one
meeting. The outside user cannot hear them or read their chat even when standing right next to the wall or doorway.

**Acceptance Scenarios**:

1. **Given** a user walks into a private area where two others already are, **When** they cross the area's border,
   **Then** they join that area's meeting and see a "You have entered <area name>" notice.
2. **Given** a user standing outside a private area right next to someone inside it, **When** both are within normal
   talking range, **Then** no conversation forms between them.
3. **Given** a meeting in a private area, **When** someone inside sends a chat message, **Then** only people inside
   the area at that moment receive it. People who join later do not see earlier messages.
4. **Given** a private area with a capacity limit that is full, **When** another user tries to walk in, **Then** they
   are stopped at the border and told the area is full.
5. **Given** a private area marked restricted, **When** a user who is not on its allowed list walks up to it, **Then**
   they can "knock" and enter only after someone inside admits them.

---

### User Story 3 - Personal desks in an open-plan office (Priority: P3)

Each member can claim a free desk in the open office as their home base. A claimed desk shows its owner's name and
status to anyone who hovers over it. Members can jump back to their desk with one action, invite a teammate to their
desk, and lock it when they want privacy. By default desks are "ambient": you faintly hear the people at neighboring
desks, the way an open-plan office sounds. An admin can switch a group of desks (a desk pod) to "cubicle" mode, where
each desk acts as its own small private area.

**Why this priority**: Desks give people a reason to sit in the office between meetings, and they are central to the
"office space" format. They depend on Stories 1 and 2 (ambient hearing and private-area behavior) to be meaningful.

**Independent Test**: As one user, claim a desk, walk away, use "Walk to my desk", and check that you return. A
second user hovers over that desk and sees the owner. Toggle the pod between ambient and cubicle and check what a
neighbor can hear.

**Acceptance Scenarios**:

1. **Given** an unclaimed desk, **When** a member hovers or walks up to it and chooses "Claim desk", **Then** the desk
   becomes theirs, shows their name to everyone, and any desk they previously held is released.
2. **Given** a member with a claimed desk anywhere in the office, **When** they choose "Walk to my desk" (menu or
   keyboard shortcut), **Then** their avatar travels to their desk.
3. **Given** a member at their desk, **When** they lock it, **Then** their desk acts as a private area. Only invited
   people can talk with them there, and others see a locked indicator.
4. **Given** an ambient desk pod, **When** two members sit at adjacent desks, **Then** each hears the other at reduced
   volume without a full conversation opening, and walking up to each other opens a normal conversation.
5. **Given** a desk pod switched to cubicle mode by an admin, **When** two members sit at adjacent desks, **Then**
   they cannot hear each other unless one walks into the other's desk area.
6. **Given** every desk is claimed, **When** a new member asks to claim one, **Then** they are told no desks are free.

---

### User Story 4 - Create and use your own avatar sprites (Priority: P3)

A user or the team's artist can draw custom characters in any pixel-art tool they like, outside the app, and use
them in the office. The project publishes one documented sprite-sheet format (frame size, frame order for each
direction and animation, transparent background) together with a blank template image. A finished sheet that follows
the format can be added to the office, after which people can pick it as their avatar. The app checks a sheet before
accepting it and explains any problem.

**Why this priority**: The user said the sprites need not match Gather's but they want the ability to create their
own. This is independent of the meeting mechanics and can be delivered in parallel.

**Independent Test**: Download the template. Paint a character in an external editor following the documented
layout. Add it to the office. Pick it as your avatar, then walk in all four directions and check that the right
frames play. Add a sheet with the wrong dimensions and check that it is rejected with a clear reason.

**Acceptance Scenarios**:

1. **Given** the published sprite format document and blank template, **When** an artist follows them in an external
   tool, **Then** the sheet works in the office without extra conversion.
2. **Given** a valid custom sheet has been added, **When** a user opens avatar selection, **Then** the custom
   character appears as a choice alongside the built-in looks.
3. **Given** a user picks a custom character, **When** they walk, idle or face each of the four directions, **Then**
   the matching frames from their sheet play, and other users see the same character.
4. **Given** a sheet with wrong dimensions, missing frames or no transparency, **When** someone tries to add it,
   **Then** it is rejected with a message naming the problem and the expected format.
5. **Given** a layered character (separate body, hair, clothing and accessory sheets that share the same layout),
   **When** a user picks one item per layer, **Then** the layers stack in the documented order to form their avatar.

---

### User Story 5 - Status and getting someone's attention (Priority: P4)

Users set a status (Available, Busy, Do Not Disturb), shown as a colored dot on their avatar and in the people list.
In Do Not Disturb, conversations do not open around them. They can still be "rung" by teammates, which shows a
notification they can accept by teleporting to the caller or decline. A user can also wave at someone.

**Why this priority**: Status keeps automatic conversations from feeling intrusive. Without it, walking past a
colleague's desk would always pull them into a call. It is polish on top of Stories 1 to 3.

**Independent Test**: Set user A to Do Not Disturb. Walk user B up to A and check that no conversation opens. B rings
A. A accepts and arrives next to B in a conversation.

**Acceptance Scenarios**:

1. **Given** a user in Do Not Disturb, **When** someone walks into range, **Then** no conversation opens and the visitor
   sees that the user is not available.
2. **Given** a user rings another, **When** the recipient accepts, **Then** the recipient's avatar moves next to the
   caller and a conversation opens between them.
3. **Given** a user waves at someone, **When** the wave is sent, **Then** the recipient gets a notification and can
   wave back.

### Edge Cases

- **Chained proximity**: if A is in range of B and B is in range of C, but A is not in range of C, all three are in
  one conversation (anyone who enters "the circle" of a participant joins). Audio still fades with distance between
  each pair.
- **Large groups**: when an open-area conversation passes the per-conversation maximum, the newest arrivals see a
  "conversation is full" notice and do not join. Private areas follow their own capacity.
- **Border flapping**: a user standing on or jittering across a talking-range or private-area boundary must not be
  repeatedly connected and disconnected. Leaving takes a short grace distance or time.
- **Doorways**: standing in the doorway tile of a meeting room counts as outside the room.
- **Disconnects**: if a participant's connection drops, they disappear from the others' panels within 10 seconds, and
  the conversation stays open for everyone else.
- **Switching views**: switching between the top-down and first-person views neither interrupts nor duplicates an
  ongoing conversation.
- **First-person view**: there is no lit border in first-person view. Instead, a banner shows the private area's
  name and occupancy, the same as the 2D label. Desk owner names float above claimed desks. Desk actions (claim,
  lock, invite) open for the desk the player is facing within 1.5 tiles, instead of on hover. All notices, prompts
  and the conversation panel are on-screen overlays and look the same in both views.
- **Desk owner leaves**: a claimed desk stays claimed while its owner is offline and shows an "offline" status.
- **Sprite edge cases**: an oversized image, a sheet with partly transparent edges, or a duplicate character name is
  rejected or flagged before it reaches other users.
- **Device changes**: a user who unplugs their headset or camera mid-meeting stays in the conversation, and the
  remaining devices are used.

## Requirements *(mandatory)*

### Functional Requirements

**Proximity conversations**

- **FR-001**: The system MUST start a conversation between users whose avatars are within talking range (default
  3 tiles) of each other in an open area, with no explicit action from either user.
- **FR-002**: The system MUST end a user's participation when they move out of talking range of every participant,
  with a small hysteresis margin (default 1 tile) to prevent flapping.
- **FR-003**: A user who comes within talking range of any participant MUST join that participant's existing
  conversation.
- **FR-004**: Conversation participants MUST be able to hear and see one another, with a per-user mic and camera
  toggle and visible muted / camera-off indicators.
- **FR-005**: In open-area conversations, each listener MUST hear a speaker's audio get quieter as the distance
  between them grows, reaching silence at the edge of talking range.
- **FR-006**: Walls and other blocking map features MUST stop a conversation from forming across them.
- **FR-007**: The system MUST show each participant a conversation panel listing the other participants and their
  live video or avatar placeholder.
- **FR-008**: Text chat sent while in a conversation MUST be deliverable to "Nearby" (current conversation
  participants) as well as to the whole office.
- **FR-009**: The system MUST cap open-area conversations at a configurable maximum (default 8 participants).

**Private meeting areas**

- **FR-010**: The map MUST support private areas defined as any set of tiles, each with a name. Optional settings are
  a capacity, a restricted flag with an allowed-users list, and whether the border is highlighted.
- **FR-011**: Everyone inside the same private area MUST be in a single conversation regardless of their distance
  from each other, and nobody outside it may hear, see, or read its chat.
- **FR-011a**: When a private-area meeting has more than 8 people, everyone MUST still hear everyone, and video MUST
  be limited to the 6 people who spoke most recently. Everyone else is shown with their avatar.
- **FR-012**: Proximity conversations MUST NOT form between a user inside a private area and a user outside it.
- **FR-013**: People inside a private area MUST see its border highlighted, along with its name and current occupancy.
- **FR-014**: A full private area MUST block entry and tell the user why.
- **FR-015**: A restricted private area MUST let non-allowed users request entry ("knock"). Any occupant can admit or
  decline them.
- **FR-016**: Chat history in a private area MUST NOT be shown to people who enter after the messages were sent.

**Desks**

- **FR-017**: The map MUST support desks grouped into named desk pods. Each desk has a defined seating spot and desk
  area.
- **FR-018**: Members MUST be able to claim one free desk, release it, and switch desks. A member holds at most one
  desk.
- **FR-019**: A claimed desk MUST display its owner's name and current status to anyone who hovers over or approaches
  it.
- **FR-020**: Members MUST be able to return to their desk with a single action (menu item and keyboard shortcut).
- **FR-021**: Members MUST be able to invite a specific teammate to their desk. The invitee gets a notification with
  the option to go there.
- **FR-022**: Members MUST be able to lock their desk while they are at it. A locked desk area acts as a private
  area until the owner unlocks it, leaves the desk area, or disconnects. While it is locked, only people the owner
  invites can join.
- **FR-023**: Desk pods MUST have a mode: **ambient** (the default), where neighbors at the same pod hear each other
  at reduced volume, or **cubicle**, where each desk area acts as its own private area. Only admins can change the mode.
- **FR-024**: Desk claims MUST persist across sessions and server restarts.

**Avatar sprites**

- **FR-025**: The project MUST publish a sprite-sheet specification. It covers frame size, frame order for idle and
  walk animations in four directions, frame rate, layer order for layered characters, transparency, and file size
  limits. A blank template image MUST come with it.
- **FR-026**: The format MUST be easy to produce in common third-party pixel-art tools without custom plugins.
- **FR-027**: The system MUST let an admin add a character sheet, or a layered set of part sheets, to the office from
  a file created outside the app.
- **FR-028**: The system MUST check each added sheet against the specification and reject invalid sheets with a
  reason that a person can act on.
- **FR-029**: Users MUST be able to choose a custom character, or one part per layer, as their avatar, and every
  other user MUST see that choice in both the top-down and first-person views.
- **FR-030**: The built-in generated looks MUST stay available as defaults.

**Status and attention**

- **FR-031**: Users MUST be able to set Available, Busy or Do Not Disturb, with an optional expiry and short text
  status, shown on their avatar and in the people list.
- **FR-032**: Users in Do Not Disturb MUST NOT be auto-joined into proximity conversations, and their mic and camera
  MUST be off.
- **FR-033**: Users MUST be able to ring a teammate. If the teammate accepts, they move next to the caller and a
  conversation opens.
- **FR-034**: Users MUST be able to wave at a teammate, and the teammate can wave back.

### Key Entities

- **Office map**: the walkable layout, including floors, walls/collision, furniture and objects, spawn points and
  doors. It also contains the private areas and desk pods below.
- **Private area**: a named set of tiles with optional capacity, restricted flag, allowed users, and border highlight.
  It owns one meeting at a time.
- **Desk pod**: a named group of desks with a mode (ambient or cubicle).
- **Desk**: a seat and its surrounding desk area inside a pod. It has an optional owner and a locked flag.
- **Conversation**: the live set of users currently connected to each other. It is either proximity-based (open
  area) or area-based (private area or locked/cubicle desk). It has participants and a "Nearby" chat channel.
- **Participant state**: a user's position, status (available/busy/DND, expiry, text), mic/camera state, current
  conversation, current private area, and claimed desk.
- **Character / sprite sheet**: an uploaded image that follows the sprite specification. It has a name, a layer (or
  "full body"), frame metadata, and an author.
- **Avatar selection**: a user's chosen built-in look, custom character, or one part per layer.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a two-person test, a conversation becomes audible and visible to both people within 2 seconds of
  their avatars coming within talking range, in at least 95% of attempts.
- **SC-002**: A user who walks out of range is disconnected within 2 seconds. A user standing still on a boundary sees
  no repeated connect/disconnect cycles over 60 seconds.
- **SC-003**: Across 20 trials, a user outside a private area never hears, sees or receives chat from a meeting
  inside it, even when standing right next to the wall or doorway.
- **SC-004**: A first-time user can claim a desk and use "Walk to my desk" in under 1 minute, with no instructions
  beyond the on-screen prompts.
- **SC-005**: An artist using only the published spec and template can produce a working custom character in an
  external tool. It is accepted on the first upload attempt in at least 4 of 5 trials.
- **SC-006**: The office supports at least 25 people online at once, with up to 5 simultaneous conversations of up to
  6 people each. Throughout, each person's view stays at 50 frames per second or more, and nobody's audio drops out
  for more than 1 second at a time.
- **SC-007**: In a hallway test, at least 80% of participants say that starting a conversation "felt like walking up
  to someone" rather than "placing a call".

## Assumptions

- "Meeting" means live audio and video between participants, as in Gather. Text chat stays available, and is the
  fallback when a user has no devices or has denied access.
- The office keeps its existing look. Rooms, desks and private areas are added to the current office map (the meeting
  rooms become private areas, and the open-office desk rows become desk pods). A full in-app map editor is out of
  scope. Areas and desks are defined in the map data that the project already maintains.
- Talking range defaults to 3 tiles, the open-area conversation cap is 8, and private-area capacity is optional.
  Admins can tune these values.
- **Deviation from Gather**: Gather runs calls through a media server that handles large groups. This version
  connects browsers directly, with no extra servers, so open-area conversations cap at 8 and large meeting rooms
  limit video to 6 recent speakers (FR-011a). Swapping in a media server later lifts both limits.
- "Members" and "admins" are roles within this single office. Until accounts exist, an admin is whoever runs the
  server, and a member is any named person who joins. Full authentication is out of scope for this feature.
- Gather's art and branding are not copied. The sprite format may follow Gather's structural conventions (four
  directions, small fixed frame grid, layered parts), which the research describes, but the actual layout is defined
  by this project.
- Creating sprites happens outside the app, in third-party tools. The app only accepts, validates and displays
  finished sheets. Adding sheets is an admin action, such as placing files in a known folder or using an upload
  screen.
- Spotlight/broadcast, screen sharing, recording, calendar meetings, desk decoration, pets and the other extras listed
  in the research note are out of scope for this feature.
- Participants use current desktop browsers with mic/camera permission prompts. Mobile is out of scope.
