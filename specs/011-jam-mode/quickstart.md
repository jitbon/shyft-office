# Quickstart: Jam Mode

Validation scenarios for each user story. Message and field details are in [contracts/protocol.md](contracts/protocol.md), and limits in [data-model.md](data-model.md).

## Prerequisites

```sh
npm install
npm run typecheck && npm test      # unit and integration tests, including ws-jam and ws-jam-privacy
npm run dev                        # server on :3001 + Vite client
```

Open 3 browser windows on the Vite URL (or use `npm run bots` for extra walkers) and join as Ana, Ben and Cy. A new office starts with the Kitchen as the Jam Room. An office with a saved layout (`data/layout.json`) does not: a builder ticks **Jam Room** on the Kitchen in the Rooms tab and publishes first. Songs need network access to the provider. Everything else works offline.

## Q0. The room is marked (Story 4)

1. In the top-down view, find the Kitchen. **Expect:** a soft tint and a note mark by its name.
2. Press Tab for first person. **Expect:** the label shows the note mark.
3. As a builder, open another room's properties and tick **Jam Room**, then publish. **Expect:** it gets the mark for everyone. Untick and publish: the mark goes.

## Q1. Walk in, hear the music (Story 1)

1. Ana and Ben stay outside. Cy walks into the Kitchen. **Expect:** within 2 s the card appears and Office Lofi plays, with the browser asking for a click only if it blocks sound.
2. Ana walks in. **Expect:** she hears the same bar as Cy, within about a second (clap along; the beat lines up).
3. Ben, outside, **Expect:** no card, no sound, even standing at the wall.
4. Cy walks out. **Expect:** the card goes and the sound stops within 2 s. Ana still hears it.
5. Ana walks out. Walk back in. **Expect:** it starts again, from the station's current point.
6. Move the volume slider and mute. **Expect:** only this window changes, and the setting is there after a reload.

## Q2. Queue songs (Story 2)

1. Cy and Ana are inside. Ana pastes a YouTube link and presses Add. **Expect:** the song shows in the queue for both within 1 s, labelled "Ana", and plays after the station's current bar.
2. Cy adds a second song. **Expect:** it queues behind the first.
3. Let the first finish. **Expect:** the second follows with a gap under 2 s, and both windows show the same point in it.
4. Cy presses Skip on the second. **Expect:** it ends for both, both see "Cy skipped …", and the station resumes.
5. Ana adds 3 songs, then a 4th. **Expect:** "You already have 3 songs waiting". Add 20 in total across the room: **Expect:** "The queue is full".
6. Paste `not a link`, then a link from another site. **Expect:** plain-words refusals and nothing queued.
7. Add a private or non-embeddable video. **Expect:** a note that it can't be played, and the queue carries on.

## Q3. Hang out and work (Story 3)

1. Walk in. **Expect:** no mic or camera prompt, and your status is unchanged. Set Do Not Disturb first, then walk in: **Expect:** music plays, status stays.
2. Cy turns the mic on and talks. **Expect:** Ana's music dips while he speaks and recovers about a second after.
3. Ana starts a screen share with tab sound. **Expect:** Cy's music dips for as long as it plays.

## Q4. Views (cross-cutting)

1. While a song plays, press Tab to switch between top-down and first person several times. **Expect:** no gap or restart, and the card stays.

## Q5. Privacy (Constitution III)

1. With Ben outside, open his developer tools network panel, filter WebSocket messages. Have Ana and Cy queue and skip songs. **Expect:** Ben receives no `jam` or `jamNote` messages.
2. From Ben's console, send `{t:'jam',op:'add',url:'…'}` and `{t:'jam',op:'skip'}`. **Expect:** a "not in a Jam Room" refusal for add, and nothing for skip, and no queue change for Ana and Cy.
3. In the integration test, confirm `ref` in every message matches the 11-character pattern, `by` is absent, and `mine` is true only for the recipient's own tracks.

## Q6. Edge cases

1. Last person leaves. **Expect:** on re-entering, the queue is empty and the station starts.
2. Unmark the Kitchen in the builder while a song plays and publish. **Expect:** the music stops for those inside within a second, with a note.
3. Block the provider (offline mode in the browser's tools) and enter. **Expect:** the station plays and the card says songs can't load.
4. Restart the server. **Expect:** queues are gone; the room works again on next entry.
