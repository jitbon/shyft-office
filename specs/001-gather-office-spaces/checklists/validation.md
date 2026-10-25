# Validation Record: Gather-Style Desks, Office Spaces and Proximity Meetings

**Date**: 2026-10-24
**Covers**: quickstart.md Scenarios 1–5 and the load sanity check, run against the finished build (tasks T001–T063).

This is an honest record of *how* each step was checked. The two-person browser checks used headless Chrome with fake
camera and microphone devices, driven by a script. That tool cannot hold a key down, click at a coordinate, hover, or
listen, so a few steps need a person (see "Left for a human" at the end).

| Mark | Meaning |
|---|---|
| ✅ | Seen working in a real browser |
| 🧪 | Covered by an automated test (never seen by eye) |
| 🚫 | Not verified |

## Automated results

| Check | Result |
|---|---|
| `npm run typecheck` | passes |
| `npm test` | 14 files, 136 tests pass |
| `npm run build` | passes |
| `npm run dev` (server + Vite) | starts; Vite proxies `/sprites/*` and the WebSocket correctly (25 bots linked through it) |
| Privacy tests, deliberately broken | `ws-privacy` and `ws-desk-privacy` fail when chat scoping is broken, and pass again once it is restored |
| `npm run sprites:check` on broken sheets | each gives the documented code: `bad-size`, `no-alpha`, `empty-frame:2,1`, `bad-id`, `not-png`, `bad-layer`; exit code 1 (0 for good sheets) |

## Scenario 1: A meeting opens between two people (US1)

| Step | Result | How |
|---|---|---|
| 1. Join two players, apart | ✅🧪 | Two Chromes joined; both spawn together and link at once. Moving apart unlinks: `ws-links` tests |
| 2. Walk in range → panel with video and sound | ✅ video, 🚫 sound | Each browser shows the other's live fake-camera feed in a "Nearby · 2" panel (final build, after all phases). The fake microphone is silent, so audio was never heard. Links appear within a few server ticks in tests |
| 3. Walk away → volume fades, panel closes beyond 4 tiles | 🧪 | `gainFor` unit tests and hysteresis tests. Not listened to |
| 4. Stand on the edge for 60 s, no flicker | 🧪 | A 12-step jitter between range and range+1 sends no link updates. The full 60 s was not run |
| 5. Wall between two players within 3 tiles | 🧪 | `ws-links` and unit tests |
| 6. A third player joins | 🧪 | `ws-links` (three in one conversation) |

Nobody walked with the keyboard in a browser (the tool cannot hold a key), so movement itself is 🚫; positions were
set by the test clients.

## Scenario 2: Private meeting areas (US2)

| Step | Result | How |
|---|---|---|
| 1. A and B in Meeting Room A, lit border and label | ✅ | Seen in a browser using a temporary restricted room around the spawn point (since removed): dashed outline, dimmed map, "VIP Room · 1 here", first-person banner "VIP Room · 2 here". The real Meeting Room A was not walked into |
| 2. C on the doorway or against the wall hears and sees nothing | 🧪 | `ws-privacy`: 20 iterations on the doorway tile and against the outside wall; no call setup, no chat, no links |
| 3. No `rtc`, chat or `links` frames reach C | 🧪 | The test client records every frame C receives. Browser dev tools were not used |
| 4. Full room turns B away | 🧪 | `ws-privacy` and `office-areas` tests. The "room is full" notice was not seen |
| 5. Restricted room: knock, let in | ✅🧪 | In a browser a bot was refused, knocked, the occupant clicked "Let in", the bot walked in; also tested |
| (extra) Meeting of more than 8 limits video to 6 | 🧪 | `ws-video-cap`, `links-video`. Not seen with nine real browsers |

## Scenario 3: Desks (US3)

| Step | Result | How |
|---|---|---|
| 1. Claim a desk; others see the owner | ✅ claim, 🚫 hover | Claimed through the Desk button; the claim was written to disk; the owner name card and first-person label showed. Mouse hover and click on a desk could not be driven |
| 2. Walk to my desk | ✅ | The Desk button moved the player to their seat. The `G` key was not pressed |
| 3. Neighbours in an ambient pod hear faintly | 🧪 | Link and volume rules in unit tests. Not listened to |
| 4. Cubicle pod: no hearing between neighbours | 🧪 | `ws-desk-privacy` (cubicle) and unit tests. The admin selector was not clicked |
| 5. Lock; uninvited snapped back; invite; "Go there" | ✅ lock, 🧪 rest | Lock clicked in a browser ("Locked" shown). Snap-back, invitation, walking to a desk and leak-proofing are `ws-desk-privacy` tests. The invite notification buttons were not seen |
| 6. Restart keeps claims | 🧪 | `ws-desk-privacy` restarts the server and finds the claim |

## Scenario 4: Custom sprites (US4)

| Step | Result | How |
|---|---|---|
| 1. Template, paint in an external editor | ✅ template, 🚫 editor | `npm run sprites:template` writes 16 px and 32 px guides. No external pixel editor was used: the example robot was drawn by a script |
| 2. `sprites:check` | ✅ | OK for the robot and for good sheets; every error code reproduced (table above) |
| 3. Install and reload | ✅🧪 | The server loaded `sprites/` at start; reload, forged ids and removed sheets are `ws-sprites` tests. The Reload button was not clicked |
| 4. Pick it, walk four ways, first-person, others see it | ✅ partly | Picked on the join screen (Custom tab, preview spins), worn in the top-down view, seen by a second player on the map, in the conversation panel and in first-person (head, antenna and visor, body behind a sofa). Walking in all four directions, 32 px sheets and layered characters are 🧪 only |
| 5. A 60×60 PNG is rejected | ✅🧪 | CLI says `bad-size`; the server loader skips it and never serves it |

## Scenario 5: Status, ring and wave (US5)

| Step | Result | How |
|---|---|---|
| 1. Do Not Disturb: no conversation, red dot, devices off | ✅🧪 | Status panel in a browser; red dots on the name tag and people list; Mic and Cam locked; a bot next to the player started no conversation |
| 2. Ring, accept, arrive, conversation | ✅🧪 | A bot rang; "Accept" clicked; the player landed beside the bot; after Ctrl+U a "Nearby · 2" panel opened |
| 3. Wave and wave back | 🧪 | Server messages and rate limits tested. The wave notification and "Wave back" button were not seen. Decline and the time-limit dropdown were not clicked either |

## Load sanity (SC-006)

| Check | Result |
|---|---|
| 25 bots in 5 groups of 5 | ✅ every bot linked to exactly its own group, also through the Vite proxy |
| Server link recompute time | ✅ slowest 5.7 ms with all 25 spawning in one spot and 375 updates a second; budget 20 ms |
| Five conversations of six at 50 fps with intelligible audio | 🚫 needs real browsers and ears |

## Left for a human

A ten-minute pass with two real browser windows, a keyboard and headphones would close the gaps:

1. Walk with WASD toward and away from each other, listening for volume fading and for the call opening and closing.
2. Walk into Meeting Room A and out again, and check nothing is heard from the doorway.
3. Hover and click a desk; use the `G` key; press `F` at a desk in first person.
4. Click the Admin button: a pod's mode, the reload button, and a restricted room's list.
5. Draw a character in a real pixel editor from `sprites/template.png`, check it, and wear it.
6. Try the Decline button, a wave, and a Do Not Disturb with a time limit.
7. Speak into a real microphone in a room of nine or more, and see the video cap follow the speaker.

## Convergence addendum (tasks T072–T078)

A check of the finished build against the spec found seven gaps; they are now closed. How each was checked:

| Task | Gap | Result |
|---|---|---|
| T072 | Desk invitations accepted any string | 🧪 an oversized id, a malformed id and a 51st guest are refused; an upper-case id counts as the same person |
| T073 | A dropped person lingered 15 to 30 s | 🧪 a client that stops answering pings is gone within about 1 s on a fast test server (a normal client is not dropped); the real server now pings every 5 s, so about 10 s at worst. The browser-side "connection down 5 s" hiding is 🚫 not exercised |
| T074 | Nothing handled an unplugged camera or headset | 🚫 not verifiable here (a device cannot be unplugged from the browser tool, and the code needs a real browser). Typechecked only. Quickstart Scenario 1 step 7 asks a person to try it |
| T075 | Desk hover label lacked the owner's status | 🚫 not seen. Typechecked, and pages load without errors, but no screenshot shows the label with a status dot and note: the mouse hover cannot be driven, and a second player standing within two tiles of a claimed desk was not set up. A person should check it |
| T076 | Duplicate character names not flagged | 🧪 same name (any case) in the same slot is flagged on reload and shown to the admin; both sheets keep working |
| T077 | Character could only be chosen at joining | ✅ Character button, Custom tab, Robot, Save: the player and another connected client both switched to the Robot; Cancel left it unchanged |
| T078 | "Camera blocked" shown only after pressing Mic | ✅ in a Chrome that denies permissions: nothing on the first visit, and the explanation appears by itself when a conversation opens on the next |

Two real bugs turned up while checking T077, both in how pictures are drawn: a person's tile in the conversation panel
never redrew when their character changed, and it also was not refreshed when a custom sheet finished loading after
the tile first appeared. Both are fixed.

Typecheck passes, 142 tests pass, and the build passes.

## Regression review (after all phases)

A full read of the code, plus hostile-input testing, found eight bugs that the existing tests missed. All are fixed,
and each has a regression test that was confirmed to fail with its fix removed (`tests/integration/ws-robustness.test.ts`,
except where noted).

| Bug | Fix | How checked |
|---|---|---|
| One client sending JSON `null` (or any non-object) crashed the server for everyone | Messages must be objects; a handler that throws is logged, never fatal | Reproduced on a live server, then 🧪 including a fuzz test of every message type with wrong-typed fields that fails if any handler throws |
| One frame over 64 KB crashed the server (unhandled socket `error` event) | Error listener per socket; only that socket is closed | Reproduced, then 🧪 |
| A malformed URL such as `/%E0%A4%A` crashed the server | Answered with 400; any other request error with 500 | Reproduced, then 🧪 |
| Files in a sibling folder named like `dist-old/` could be read over HTTP | Exact containment check against the build folder | Reproduced, then 🧪 |
| Typing in the status note (or any field) fired shortcuts: "c" turned the camera **on**, "m" the mic, WASD moved | Shortcuts ignore keys typed into inputs, selects and text areas | ✅ typing "camg" in the status note sent no mic or camera change and moved nothing |
| After a reconnect others saw your old character | The re-sent join message describes the current character | ✅ server restarted mid-session; a watcher joining afterwards saw the new character |
| Closing one of two tabs unlocked the other tab's desk and dropped its room admissions | A member is only forgotten when their last tab closes | 🧪 |
| A port already in use crashed with an unhandled error; Ctrl+C could lose the last second of saved desk claims | Startup failure is reported cleanly; SIGINT and SIGTERM save before exiting | 🧪 (port) and by hand (`EADDRINUSE` message) |

Typecheck passes, 149 tests pass across 15 files, and the build passes.
