# Validation: Jam Mode

## Baseline (T001), before any change

- `npm run typecheck`: clean.
- `npm test`: 107 files, 807 tests passed.

## After implementation (T043)

- `npm run typecheck`: clean.
- `npm test`: 116 files, 918 tests passed (9 new files, 111 new tests).
- `npm run build`: succeeds.

## Security headers (T042)

The server sets no Content-Security-Policy or frame headers (`server/app.ts` and `index.html` have none), so the provider's player script
(`https://www.youtube.com/iframe_api`) and frame load without any change. There is nothing to widen. If a policy is added later it needs
`script-src https://www.youtube.com`, `frame-src https://www.youtube.com` and `connect-src` for the server's own title lookups (those run on the
server, not in the browser).

## Browser check (T044): partial

Done by hand in one headless Chrome window against a built copy (`npm run build`), with network access to YouTube:

- Q1 (walk in, hear the station): walking from the Lobby through the door into the Kitchen showed the "Now playing" card with the room name,
  the listener name, "Office Lofi" and "nobody has queued anything". The Kitchen carries a tint and a note mark in the top-down view even
  when standing outside it.
- Q2 (queue a song), single listener: pasting `https://youtu.be/dQw4w9WgXcQ` queued it, the server read the real title from the oEmbed
  endpoint, and the embedded YouTube player appeared at 200×200 on the card with the track line, "added by Ana", Skip and the volume.

Not done: the three-window scenarios (sync between listeners within 1 s, skip from another window, the builder toggle, Q3 ducking under a
real call, Q6), the first-person note mark, the blocked-network case, and listening to the generated station by ear. The server-side parts
of those are covered by the integration tests; the audio and the seek-on-drift behaviour are not covered by any automated test.
