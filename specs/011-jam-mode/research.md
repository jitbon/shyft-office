# Research: Jam Mode

Decisions for `plan.md`. Each is marked **observed**, **inferred** or **unknown** where it concerns outside behavior (Constitution I).

## R1. Gather parity

- **Decision**: treat Jam Mode as an original feature. **Unknown:** whether Gather has a comparable shared-music room. No REA evidence was gathered for this plan, so nothing is copied or assumed from it.
- **Rationale**: the ticket compares itself to a Discord call with a music queue, not to Gather. The office's own rooms, walking-in presence and call rules are the base.
- **Alternatives**: capture Gather's behavior with REA first. Deferred; it can be added to this file later if the owner wants parity.

## R2. Where the logic lives

- **Decision**: a pure `shared/jam.ts` for rules, and a `JamEngine` in `server/jam.ts` that owns state, as Office Arena does with `MatchEngine`. Browsers send intents (`add`, `remove`, `skip`, track length, failure) and play what they are told.
- **Rationale**: Constitution III and V. Order, caps and who hears are decided in one place and unit-tested.
- **Alternatives**: let clients agree among themselves (peer-to-peer). Rejected: it can't enforce privacy, caps or a shared clock.

## R3. Where songs come from

- **Decision**: pasted links to **YouTube** videos only in v1 (hosts `youtube.com`, `www.`, `m.`, `music.youtube.com`, and `youtu.be`). The server extracts the 11-character video id with a strict pattern and keeps only the id. Every listener's browser plays it in the provider's embedded player (IFrame Player API, loaded lazily from `https://www.youtube.com/iframe_api` the first time someone enters a Jam Room). The server reads the title from the public oEmbed endpoint (`https://www.youtube.com/oembed?format=json&url=…`) with a 4 s timeout, a 64 KB cap, no redirects, and a one-hour cache by id.
- **Rationale**: it's the one source where "paste a link to any song" works for almost everything, without the office hosting, copying or re-streaming audio (FR-014), and with no account or key. The embedded player is the provider's supported way to play it.
- **Constraints we accept**:
  - The provider requires the embedded player to stay visible and at least 200×200, so the "Now playing" card shows the player (the video is a bonus). It can't be hidden.
  - Tracks the owner blocks from embedding fail (FR-013).
  - The provider script is a runtime third-party load. If it can't load, the station keeps playing and the card says songs can't load (FR-018).
- **Alternatives**:
  - Direct audio-file links in an `<audio>` tag: simple, but every listener's browser would fetch from an arbitrary host (leaks IPs, mixed content, no titles). Rejected for v1.
  - Spotify or Apple embeds: previews only unless every listener is signed in. Rejected.
  - SoundCloud: possible later behind the same `provider` field in `Track`. The data model carries `provider` so it can be added without a format change.
  - Uploads: ruled out by the owner's answer in the spec.

## R4. Staying in step

- **Decision**: every `jam` message carries the server's clock in ms (`now`). The client keeps `offset = now − Date.now()` (the latest value wins; the small delay of one message is well inside our 1 s target). Expected position is `Date.now() + offset − track.startedAt`. The player seeks when its position differs by more than 1.5 s (checked every 2 s, and only while playing, so a seek never causes a loop). A newcomer starts at the expected position.
- **Rationale**: a 1-second target (SC-002) needs only a shared time base, not tight clock sync. No new messages are needed.
- **Alternatives**: a ping/pong clock-sync protocol. More accurate than needed.

## R5. Track length and advancing

- **Decision**: the server can't read audio, so the first valid `jamTrack` report (length in seconds, 5–1200) from a listener sets the track's end time (`startedAt + len`). The engine's 500 ms tick advances when the end is reached, or on skip. If no length arrives within 15 s of the start, or the reported length is 0, infinite (live) or over 20 minutes, the track is treated as unplayable and skipped with a note (FR-013). A `jamFail` report counts when **more than half** of the current listeners report it (at least one), so one listener's blocked region doesn't skip a song for everyone else.
- **Rationale**: keeps the server in charge of order and timing (Constitution III) while using the only party that can know the length. A dishonest length only affects that track and is clamped.
- **Alternatives**: advance when any listener reports "ended". Rejected: one early or false report would skip for everyone.

## R6. The default station

- **Decision**: "Office Lofi", generated. `shared/lofi.ts` returns the notes for bar *n* from a seed (slow tempo, seventh chords from a few progressions, a soft bass, a sparse drum pattern and a few melody notes), and `src/jam/station.ts` plays them with Web Audio (triangle and sine voices, a low-pass filter, a little noise for vinyl crackle). The bar number comes from the shared clock, so everyone is on the same bar.
- **Rationale**: Constitution I (no commercial assets), V (works offline, no files), and the same approach as the Arena's synthesized sounds.
- **Alternatives**: bundle licensed music files (needs a licence and bytes), or a radio-stream URL (needs a network host and a licence). Rejected.

## R7. Ducking and volume

- **Decision**: the mixer applies `music gain = personal volume × duck`. `duck` drops to 0.35 within 150 ms while the existing voice detector reports anyone in the room's call speaking (including you), or a shared screen with sound is playing for you, and recovers over about 600 ms after 1 s of quiet. Volume and mute are personal and kept in the device's local storage in a try/catch.
- **Rationale**: it reuses the talking states the call panel already has. No server involvement, and nothing leaves the device.
- **Alternatives**: server-driven ducking. Rejected: it would add traffic for something only the listener hears.

## R8. Who hears it

- **Decision**: a listener is a connected member whose server position lies in a room with `jam: true`. The engine is told on every move that changes room, on leave or disconnect, and when a layout is published. It sends `jam` state only to listeners, and a final `jam: null` when someone leaves. **Office Arena players are never listeners (FR-020).** The Arena keeps match players out of meeting rooms and desk spaces only, not open rooms like the Kitchen, so the engine asks `office.inArena(id)` before making anyone a listener and drops a listener when they join a match (including when the Arena teleports them). Nothing else but the room test counts.
- **Rationale**: Constitution III. If outsiders never receive the state, they have nothing to play; the playing itself happens only on listeners' devices.
- **Note:** a Jam Room is an ordinary open room, so who talks to whom stays exactly as it is for other open rooms. The spec's edge case about leaving open-floor conversations is corrected to say that room rules decide.
- **Alternatives**: a distance-based fade at the walls. Rejected: the spec says in-room only.

## R9. Showing it in both views

- **Decision**: the "Now playing" card is an HTML overlay used by both views, so switching never interrupts playback. The top-down view tints the room's floor and puts a note mark by its name. The first-person view adds the note mark to the room's label.
- **Rationale**: Constitution II, with one model and small view-specific presentation.

## R10. The admin switch

- **Decision**: `Room.jam` is set in the builder's room properties and published like any layout change. The spec says "admin"; builders are the people who can already change rooms, and the building permission is itself an admin setting. Publishing that removes the flag (or the room) makes the engine stop the jam and tell the listeners.
- **Rationale**: no new admin channel, and layouts already validate, merge and publish.
- **Alternatives**: a separate admin toggle like the Arena's. Rejected: it would make a second place that decides what a room is.

## R11. Limits and abuse

- **Decision**: queue 20, 3 per member, titles cleaned and cut at 100 characters, tracks up to 20 minutes, `jam` messages rate-limited per member (6 per minute for adds, 20 per minute for other actions), title lookups limited to 4 at once and cached by video id.
- **Rationale**: FR-012 and Constitution III (validate and clamp everything).
