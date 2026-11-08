# Feature Specification: Jam Mode (Shared Listening Rooms)

**Feature Branch**: `011-jam-mode`

**Created**: 2026-11-04

**Status**: Draft

**Input**: User description: "the jam mode ticket"

GitHub issue #8 (Gather V3 board), "jam-mode": "we need to add meeting-rooms where everyone can kinda just come in and chill out. no-one has to say anything we can all just chill to lofi beats or play songs everyone else can hear etc. just like as if you were in a discord call and you could queue your favorite songs to play. or you could just hang out and work together"

## Context

Today the office has two ways to be together: open-floor conversations that start when people walk close, and private meeting rooms built around a call. Both assume people are there to talk. The owner wants a third kind of room, a **Jam Room**, where being there is the point. Walk in and you're in the room with whoever else is there. Music plays for everyone in it, and anyone can add songs to a shared queue. Nobody has to speak, turn on a camera, or do anything. People can also just work side by side with the music on.

Music is the new thing. Everything else, such as walking in, seeing who's there, talking if you want to, and mic and camera starting off, follows what the office already does.

## Clarifications

### Session 2026-11-04

- Q: Where do the songs come from? → A: Built-in original stations plus pasted links (option A). The room's default is a built-in original "lofi" station. Members queue songs by pasting a link to a track on a public music or video site. Each listener's own browser plays the track, and the server keeps everyone in step. The office never stores or re-streams the audio. Uploaded files are out of scope.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Walk into a Jam Room and hear the music (Priority: P1)

A member walks into a Jam Room. Music is already playing, or a default "lofi" station starts if the room was quiet. They hear it at once, with a "Now playing" card showing the track and who's in the room. When they walk out, the music stops for them. People outside never hear it.

**Why this priority**: shared background music is the whole idea. Even with no queue, a room that plays lofi for whoever is inside delivers the "come in and chill" experience.

**Independent Test**: two members stand outside a Jam Room. The first walks in and hears music within 2 seconds. The second, still outside, hears nothing. The second walks in and hears the same music at the same point in the track, within about 1 second of the first. The first walks out and the music stops for them while it carries on for the second.

**Acceptance Scenarios**:

1. **Given** an empty Jam Room, **When** the first member walks in, **Then** the room's default station starts and they see a "Now playing" card with the track name.
2. **Given** music is playing with people inside, **When** another member walks in, **Then** they hear the same music at the same point as everyone else, within about 1 second.
3. **Given** a member in the room, **When** they walk out (or disconnect), **Then** the music stops for them within 2 seconds and the room carries on for the others.
4. **Given** the last person leaves, **When** the room is empty, **Then** the music stops and the queue is cleared.
5. **Given** a member outside the room, **When** music plays inside, **Then** they hear none of it, whether they're near the wall, in a conversation, or at a desk.
6. **Given** a member in the room, **When** they turn the music volume down or mute it, **Then** only they are affected, and the setting is remembered for next time on that device.

---

### User Story 2 - Queue songs together (Priority: P1)

Anyone in the room can add songs to a shared queue, like a Discord music bot or a shared playlist. The queue shows what's playing, what's next, and who added each song. When a song ends, the next one starts for everyone. If the queue is empty, the room goes back to its default station.

**Why this priority**: "queue your favorite songs" is the part of the ticket that makes the room social rather than just a radio.

**Independent Test**: three members are in a Jam Room. One adds a song and it's queued behind the current track. Another adds a song and it's queued behind that. When the current track ends, the first song plays for all three, then the second. Each song shows who added it.

**Acceptance Scenarios**:

1. **Given** a member in the room, **When** they add a song, **Then** it appears at the end of the queue for everyone, labelled with their name.
2. **Given** a song is playing, **When** it ends, **Then** the next queued song starts for everyone in the room within about 1 second of each other.
3. **Given** the queue is empty, **When** the current song ends, **Then** the room's default station resumes.
4. **Given** a song someone added, **When** they remove it from the queue, **Then** it disappears for everyone. Members can only remove their own songs.
5. **Given** a song is playing, **When** anyone in the room presses Skip, **Then** it moves on to the next one for everyone, and the room is told who skipped.
6. **Given** a song can't be played (unavailable or not working), **When** its turn comes, **Then** it's skipped, the room is told why in plain words, and the queue carries on.
7. **Given** the queue is at its limit, **When** someone adds another song, **Then** they're told "The queue is full" and nothing is added.

---

### User Story 3 - Just hang out and work (Priority: P2)

People in a Jam Room don't have to talk. Their microphone and camera start off. They can see who else is in the room (names, and a small marker for who's listening and who added the current track). If they do want to chat, proximity and room rules work as in the rest of the office, and the music lowers briefly while someone is speaking so conversation stays easy.

**Why this priority**: it covers "or you could just hang out and work together". The room works without it, but it's what makes a Jam Room feel like a place rather than a player.

**Independent Test**: a member walks into a Jam Room. They aren't prompted for a mic or camera. They stay for ten minutes with the music on and nothing else needed. A second member turns their mic on and speaks, and the first hears them with the music dipped under the voice, then back to full when they stop.

**Acceptance Scenarios**:

1. **Given** a member walks into a Jam Room, **When** they arrive, **Then** their mic and camera stay off, and no call prompt blocks the music.
2. **Given** someone in the room is speaking, **When** others hear them, **Then** the music lowers while they speak and returns to its level shortly after.
3. **Given** a member in the room, **When** they look at the room, **Then** they see who else is in it, and which member added the current song.
4. **Given** the member is in Do Not Disturb, **When** they enter the room, **Then** they hear the music (it isn't a call) and their status stays as it was.

---

### User Story 4 - Make a room a Jam Room (Priority: P3)

A builder (anyone allowed to edit the office layout) can mark a room as a Jam Room, and unmark it. The default office has one ready to use. A marked room shows a music mark on its label and on its floor so people can tell it apart from ordinary rooms.

**Why this priority**: the first three stories need at least one Jam Room, and the default office provides one. Letting builders choose which rooms are Jam Rooms is a convenience for later.

**Independent Test**: a builder marks the Kitchen as a Jam Room. Members see the music mark on the Kitchen and hear music when they walk in. The builder unmarks it, and the music stops for everyone inside.

**Acceptance Scenarios**:

1. **Given** a fresh office, **When** a member looks at the map, **Then** one room is a Jam Room, labelled with a music mark.
2. **Given** a builder, **When** they mark a room as a Jam Room, **Then** it behaves as one for everyone straight away.
3. **Given** a builder, **When** they unmark a Jam Room, **Then** music and queue stop for everyone inside, and the room becomes ordinary again.
4. **Given** a room that is already private, **When** it is marked a Jam Room, **Then** its privacy is unchanged: only those inside hear anything.

---

### Edge Cases

- **Walking in and out quickly:** hearing starts and stops as presence changes. Walking back in joins the current track at the current point, not from the start.
- **Several Jam Rooms:** each has its own music and queue. A member is in at most one at a time.
- **Switching views:** music keeps playing without a break when switching between the top-down and first-person views (Constitution II). Both views show the "Now playing" card.
- **Joining a call elsewhere:** a Jam Room is an ordinary open room, so who talks to whom follows the same room rules as any other. A member who walks in hears the room's music whatever call they are in.
- **Meeting inside a Jam Room:** anyone inside can talk to others in the room. Video and screen sharing work as in other rooms, and the music lowers while anyone speaks or shares sound.
- **Screen share with sound:** a share that includes sound lowers the music for the viewers of that share, so they don't hear two things at once.
- **Slow or offline listeners:** someone whose connection stalls re-syncs to the current point when it recovers. They never hold up everyone else.
- **Browser blocks autoplay:** if the browser won't play sound until the member interacts, the card shows "Click to start the music" rather than staying silent without explanation.
- **A builder unmarks the room, or the layout changes, mid-song:** the music stops cleanly for everyone, with no stuck players.
- **Abuse:** a member who floods the queue is limited by the per-member queue cap and by add-rate limits. Song titles and names are length-limited and cleaned (Constitution III).
- **Server restart:** queues are lost, and rooms return to their default station when someone next walks in.
- **No music source available:** if songs can't be loaded at all, the room shows a clear message, and the room is otherwise a quiet place to sit.

## Requirements *(mandatory)*

### Functional Requirements

**Rooms**

- **FR-001**: The office MUST support **Jam Rooms**: rooms that play shared music for everyone inside. The default office MUST include at least one.
- **FR-002**: A builder MUST be able to mark and unmark any room as a Jam Room. The change MUST take effect for everyone at once, and unmarking MUST stop the music and clear the queue for those inside.
- **FR-003**: Jam Rooms MUST be visibly different from other rooms, with a music mark on the room's label and on the floor, in both the top-down and first-person views.

**Listening**

- **FR-004**: Everyone inside a Jam Room MUST hear the same music at the same point in the track, within about 1 second of each other. Anyone outside it MUST NOT hear it (Constitution III: the server decides who hears what).
- **FR-005**: Music MUST start within 2 seconds of a member entering, and stop within 2 seconds of them leaving or disconnecting.
- **FR-006**: An empty Jam Room MUST play nothing. When the first member enters, its default station MUST start. When the last member leaves, music and queue MUST be cleared.
- **FR-007**: Each member MUST be able to adjust or mute the music volume for themselves only. The setting MUST be remembered on that device.
- **FR-008**: The music MUST lower while anyone the listener can hear in the room is speaking (including themselves), and return afterwards. Mic and camera MUST stay off by default (Constitution III).

**Queue**

- **FR-009**: Any member inside the room MUST be able to add songs to a shared queue. Everyone inside MUST see the current track, the upcoming songs, and who added each.
- **FR-010**: Songs MUST play in order. When one ends or is skipped, the next MUST start for everyone within about 1 second of each other. When the queue is empty, the default station MUST resume.
- **FR-011**: Any member inside MUST be able to skip the current song. The room MUST be told who skipped. A member MUST be able to remove only their own queued songs.
- **FR-012**: The queue MUST have a maximum length, and a smaller cap per member, with a clear message when reached. Adding MUST be rate-limited.
- **FR-013**: A song that can't be played MUST be skipped with a plain-words message to the room, without stopping the queue.
- **FR-014**: Members MUST be able to queue a song by pasting a link to a track on a public music or video site. The office MUST show the track's title (and length where available) and MUST check that the link is a supported kind of address before accepting it. The office MUST NOT store, copy or re-stream the audio: each listener plays it on their own device. Anything that isn't a valid supported link MUST be refused with a plain-words reason.

**Safety and fit**

- **FR-015**: Queue and playback state MUST reach only the members inside the room. The server MUST validate every queue action against presence in the room, and MUST length-limit and clean titles and names (Constitution III).
- **FR-016**: The default station and any built-in music MUST be original or properly licensed, with nothing copied from a commercial source (Constitution I).
- **FR-017**: Jam Mode MUST work in both the top-down and first-person views, with music uninterrupted when switching between them (Constitution II).
- **FR-018**: The room MUST say plainly when the browser needs a click to start sound, and when songs can't load.
- **FR-019**: Entering a Jam Room MUST NOT change a member's status or add any call prompt of its own. It MUST leave Do Not Disturb as set. A Jam Room that is also private keeps the video view that every private room already opens.
- **FR-020**: A player in an Office Arena match MUST NOT be a listener. Joining a match while inside a Jam Room ends their listening at once, and the match's own rules (sounds, voice) are unchanged.

### Key Entities

- **Jam Room**: a room marked for shared listening. Has a default station, a current track, a queue, and the members inside it.
- **Station**: the room's default music, played when nothing is queued.
- **Track**: one playable song, with a title, a length, and who added it.
- **Queue**: the ordered list of tracks waiting to play in a room, with limits per room and per member.
- **Listener**: a member inside a Jam Room, with their own volume and mute setting.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member who walks into a Jam Room hears music within 2 seconds, with no prompts to set anything up (apart from the one-click sound start some browsers need).
- **SC-002**: Any two listeners in the same room hear the same point in a track within about 1 second of each other, at least 95% of the time over a 30-minute session.
- **SC-003**: In tests with two or more members outside the room, none hears any music or sees any queue content from it.
- **SC-004**: A member can add a song to the queue in under 15 seconds from opening the add control, and it shows up for everyone inside within 1 second.
- **SC-005**: When a song ends, the next one starts for everyone in the room with no gap longer than 2 seconds.
- **SC-006**: Walking in and out of a Jam Room never leaves music playing for someone outside it, nor leaves it silent for someone inside, across 50 repeated walk-in, walk-out cycles.
- **SC-007**: At least 90% of members asked can start listening, add a song and leave the room without help the first time they try.

## Assumptions

- **Open to everyone:** a Jam Room is an ordinary open room. Anyone can walk in and listen. Making it restricted or private uses the existing room rules, which are unchanged.
- **Trust-based controls:** any member inside can skip, and members can remove only their own songs. There's no host or voting, as the group is a workplace team that already shares the space. A host or vote-to-skip can come later if it's needed.
- **Arena players:** they are never listeners (FR-020). The Arena only keeps match players out of meeting rooms and desk spaces, so without this rule they could walk into the Kitchen and hear music during a match.
- **Mixed with conversation:** talking in a Jam Room works as in other rooms. The music dips under voices rather than stopping.
- **Defaults:** a queue of up to 20 songs, 3 per member at a time. The default office marks one room as a Jam Room, and its default station is a built-in "lofi" station.
- **Desktop browsers only:** as for the rest of the app. Mobile isn't a target.
- **Playback is per listener:** each listener's device plays the music and keeps itself in step with the room. The server decides the order and timing and who may hear it.
- **Link support:** the exact list of supported sites is decided in planning. Links that can't be played in a listener's browser (private, region-locked or removed tracks) are handled as in FR-013.
- **No recording or downloads:** the office never records or stores the music. Queues aren't saved after the room empties or the server restarts.
- **Out of scope for now:** voting, per-member playlists, saved favorites, lyrics, DJ-style mixing, and music in open-floor conversations or at desks.
