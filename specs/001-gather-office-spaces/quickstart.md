# Quickstart: Validating Desks, Office Spaces and Proximity Meetings

## Prerequisites

- Node 20+ and `npm install` already run.
- Chrome or Edge, with a camera and mic, or Chrome's fake-device flags (below).
- For a second machine, use an HTTPS tunnel (for example `npx localtunnel --port 5173`). Camera and mic access needs
  a secure context: `localhost` or HTTPS.

```sh
ADMIN_TOKEN=letmein npm run dev
```

To get fake devices so that one machine can act as several users:

```sh
open -na "Google Chrome" --args --user-data-dir=/tmp/shyft-a --use-fake-ui-for-media-stream --use-fake-device-for-media-stream
open -na "Google Chrome" --args --user-data-dir=/tmp/shyft-b --use-fake-ui-for-media-stream --use-fake-device-for-media-stream
```

Each profile gets its own `memberId`, so it acts as a separate person.

## Automated checks

```sh
npm test            # Vitest: proximity, line of sight, hysteresis, areas, desks, sprite validation, WS privacy
npm run typecheck
npm run sprites:check sprites/*.png
```

## Scenario 1: A meeting opens between two people (US1 / SC-001, SC-002)

1. Join as **A** and **B**. Both spawn in the lobby, more than 3 tiles apart if possible. Move them apart first.
2. Walk A toward B. **Expect**: within about 2 s of being within 3 tiles, both see a conversation panel with the other
   person's video and hear their audio.
3. Walk A slowly away. **Expect**: the volume fades with distance, and the panel closes once A is more than 4 tiles
   away.
4. Stand A exactly on the edge for 60 s. **Expect**: no connect/disconnect flicker.
5. Put A and B on opposite sides of a wall, within 3 tiles. **Expect**: no conversation.
6. Add **C** and walk them toward B while B is talking to A. **Expect**: all three are in one panel.
7. With A's camera and microphone both on, unplug A's camera (or revoke it in the browser's site settings). **Expect**:
   A sees "Your camera was disconnected. Your microphone is still on.", the Cam button turns off, B sees A's avatar
   instead of a black tile, and the conversation and A's sound carry on.
8. In a browser where camera and microphone access is blocked for the site (the browser's site settings, or
   Chrome's `--deny-permission-prompts`), walk up to someone. **Expect**: you join the conversation, and once a
   notice explains that access is blocked and how to allow it, and that chat still works.

## Scenario 2: Private meeting areas (US2 / SC-003)

1. Walk A and B into Meeting Room A, at opposite corners. **Expect**: one conversation, a lit border, and the label
   "Meeting Room A · 2".
2. Put C outside, pressed against the wall or standing in the doorway tile. **Expect**: C hears and sees nothing and
   receives none of A's room chat.
3. Repeat step 2 twenty times, checking DevTools → Network → WS on C's tab. **Expect**: no `rtc`, `nearby`/`area`
   chat, or `links` frames that mention A or B.
4. Edit `shared/map.ts` so Meeting Room B has `capacity: 1`, then restart the dev server. With A inside, walk B
   in. **Expect**: B is stopped at the border with a "full" notice.
5. Remove the capacity and set `restricted: true`. As admin (`?admin=letmein`), open the admin panel and confirm A
   is not on the room's allow-list. Walk B in. **Expect**: B is offered a Knock button, and gets in only once A
   admits them.

## Scenario 3: Desks (US3 / SC-004)

1. As A, walk to an open-office desk and choose **Claim desk**. **Expect**: B sees A's name and status when hovering
   over that desk.
2. Walk A far away and press the **Walk to my desk** shortcut. **Expect**: A is back at their seat.
3. Seat A and B at adjacent desks in the same pod. **Expect**: each hears the other faintly (ambient). Walking up to
   each other opens a normal conversation.
4. As admin, switch that pod to **cubicle** from the admin panel. **Expect**: seated neighbors can no longer hear each other.
5. A locks their desk. B walks into A's desk area uninvited. **Expect**: B is snapped back with a "locked" notice.
   After A invites B, B's "Go there" takes them to A's desk and they join A's meeting. C, outside, hears nothing
   from it.
6. Restart the server. **Expect**: A's claim is still there.

## Scenario 4: Custom sprites (US4 / SC-005)

1. `npm run sprites:template -- --out /tmp/robot.png`, then paint the 16 frames in any external editor and save.
2. `npm run sprites:check /tmp/robot.png`. **Expect**: `OK`, or specific error codes from
   [contracts/sprite-sheet.md](./contracts/sprite-sheet.md).
3. Copy `robot.png` and `robot.json` into `sprites/`, and reload as admin or restart the server.
4. Open the join screen. **Expect**: "Robot" is listed. Pick it, walk in all four directions, and press Tab for
   first-person view. **Expect**: the correct row animates in both views, and B sees the same character.
5. Click **Character** in the top bar, pick another character (or the Built-in tab), and **Save character**.
   **Expect**: you change in both views, B sees the change within a second, and you stayed where you were.
6. Drop in a 60×60 PNG. **Expect**: it is rejected with `bad-size` in the server log and never appears in the picker.

## Scenario 5: Status, ring and wave (US5)

1. A sets **Do Not Disturb**. B walks right up to A. **Expect**: no conversation, A's red status dot is visible, and
   A's mic and camera are off.
2. B rings A, and A accepts. **Expect**: A appears next to B, and a conversation opens.
3. B waves at A. **Expect**: A gets a notification and can wave back.

## Load sanity (SC-006)

```sh
npm run bots -- --count 25 --groups 5x5   # headless players that walk to five spots (no audio or video)
```

**Expect**: `All 25 bots are linked to exactly their own group.` and a link recompute time under the 20 ms budget
(it reports `OK`). The command starts its own server; add `--url ws://localhost:5173/ws` to test a running one (the
timing is then only in that server's "link tick" log lines). The audio and video side of SC-006 (five conversations
of six people at 50 frames per second) needs real browsers and is checked by hand.
