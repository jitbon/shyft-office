# Validation log: Office Arena

## T001 Baseline (2026-11-04)

- `npm run typecheck`: clean.
- `npm test`: 733 tests in 100 files, all passing.

## T036 Final (2026-11-04)

- `npm run typecheck`: clean. `npm run build`: ok.
- `npm test`: 807 tests in 107 files, all passing (733 in 100 files at the start, so 74 new tests in 7 new files).

## What was checked

- **Rules:** `tests/unit/arena-*.test.ts` and the match cases in `tests/unit/proximity.test.ts` and `tests/unit/office-arena-entry.test.ts`.
- **Server, over WebSocket:** `tests/integration/ws-arena.test.ts` (start, join, begin, firing, tag-outs, rounds, match end, the shop and
  money, leave, stop, reset, host handover, the admin switch and its restart, and the cheating attempts) and
  `tests/integration/ws-arena-privacy.test.ts` (no private messages, shots, voice, rooms or desks for non-players).
- **Browser, two or three headless Chrome tabs** (tools/e2e/cdp.mjs): Start, banner Join, Begin, the HUD, the shop (B) with its prices and
  "Not enough money", Build and Character disabled during a match, the countdown into play, Leave back to the top-down view, team rings
  in the overview, and no console errors.

## T026 and T035 (2026-11-04, headless Chrome, everything on localhost)

T026 used 3 player tabs and an admin tab; T035 used 1 real tab and 9 scripted WebSocket players, not 10 real tabs.

| Check | Result |
|---|---|
| First match: click Start, others join, Begin, HUD up (SC-001, under 30 s) | 0.8 s |
| Leave: click to HUD gone (SC-004, at most 2 s) | 42 ms |
| After Leave: view and controls | back to top-down; Build and Character enabled again |
| Host leaves (Ann): host passes to the next player | yes |
| Admin switches the Arena off during a match: player back in the office (SC-004) | 404 ms (from the click, including the admin panel's own steps), view back to top-down |
| 5 versus 5, 10 players in the play phase: first-person frame rate of a real tab (SC-005) | 60 fps |
| Shot latency over 54 shots, `fire` to `arenaShot` on another client (SC-002, at most 0.5 s) | 95th percentile 2.9 ms, max 3.0 ms (localhost, so it shows server time only) |
| Server link tick at 10 players (at most 20 ms) | last 0.12 ms, peak 6.3 ms |
| Console errors in the tabs | none |

Not measured: a non-player's frame rate, real network latency, a 10-tab run on separate machines, and the desk, status and call being unchanged after a return (the integration tests cover the pose and the privacy rules, not the call).

## T037 First-person view of shots, tag-outs and team markers (2026-11-04)

Two separate headless Chrome windows (a background tab does not draw, so one each): a player (Ann, blue) and a non-player watcher in first
person, while a scripted orange player fired 7 shots at Ann. The page counted pixels of the exact team colours and of the puff colour on every
frame (about 190 frames over 3.2 s, so every frame is checked, not just every 30 ms).

| | Player view | Watcher view |
|---|---|---|
| Team marker above heads, every frame | orange marker on 192 of 192 frames (68 px) | blue (68 px) and orange (68 px) markers on 192 of 192 frames |
| Tracer (orange) | colour pixels peak at 581, up from the 68 of the marker | peak 492, up from 68 |
| Tag-out puff | frames with puff-coloured pixels (up to 49,928 in the player's own tagged-out view) | frames with puff dots (up to 2,092) |

- Example frame: `first-person-watcher.png` in this folder: blue marker over Ann, orange over Foe, an orange tracer and the puff dots after the tag-out.
- **Bug found and fixed:** the puff's colour was packed as 0xAABBGGRR with red and blue swapped (a faint bluish dot); it is now 0xfff7f5f5.
- A name tag or a player behind solid furniture (the sofa) has no marker, as intended.
