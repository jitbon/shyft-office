# Quickstart: Office Arena

**Prerequisites:**
- `npm run build`, then a test server on its own port and data folder (as in earlier features).
- Chrome for the driver (`tools/e2e/cdp.mjs`).
- Players P1–P4 in four tabs; W, a watcher, at their desk; M1 and M2 in a meeting in Meeting Room A; an admin tab (`?admin=…`).

Contracts: [protocol](contracts/protocol.md), [UI](contracts/ui-behavior.md). Data: [data-model](data-model.md).

## Q0. Nothing else changed (SC-008)

1. Run `npm test` and `npm run typecheck`. **Expect:** all pass.
2. With no match running, the office behaves exactly as before.

## Q1. A round to the end (US1, SC-001, SC-002)

1. P1 presses Arena → Start match, and P2–P4 join. Time from Start to round 1 (**expect** under 30 s).
2. The host presses Begin. **Expect:**
   - two teams of 2;
   - everyone teleported to their team's spawn on the open floor;
   - "Buy 0:15", with no moving.
3. The play phase starts, and P1 shoots P3 until P3 is tagged out. **Expect:**
   - hit markers for P1;
   - P3's health dropping, then "Tagged by P1" and spectating;
   - for every tab, the tag shows within 0.5 s (log times).
4. Tag out P4 as well. **Expect:** "Blue Team wins the round", the scoreboard with the right tags and tag-outs, then buy phase 2.
5. Shoot at a target behind a wall. **Expect:** it misses.

## Q2. Shop and money (US2)

1. **Round 1 buy phase:** everyone has 1,000. The Paint Marker is dimmed, and buying it says "Not enough money".
2. **Next buy phase:**
   - **Expect:** winners have 1,000 + 250 per tag + 2,500, and losers 1,000 + 1,200;
   - a winner buys the Paint Marker, and their money drops by 2,400 and the gear shows;
   - try to buy in the play phase: refused.
3. A survivor keeps their gear into the next round, and someone tagged out has the Stapler Popper.

## Q3. Start, stop, reset, leave (US3, SC-004)

1. P2 presses Leave. **Expect:** back at their saved spot and view within 2 s, and the match continues.
2. The host presses Reset. **Expect:** round 1, all scores, tags and money reset.
3. The host leaves. **Expect:** host passes to the earliest-joined player.
4. The new host presses Stop. **Expect:** everyone returned to their saved spot, facing and view. Desks, status and calls are as before.

## Q4. Watching from the office (US4, SC-003)

1. During play, W stands in a line of fire. **Expect:** W is never hit, and the streaks pass through.
2. **Expect:** W sees team markers, streaks and the banner, and hears no match sounds or player voices.
3. A player walks to Meeting Room A's door and to W's desk space. **Expect:** stopped with "Not during a match", and M1 and M2's meeting is unaffected.
4. **Automated:** `tests/integration/ws-arena-privacy.test.ts`.

## Q5. Admin switch (FR-025)

1. The admin unticks **Arena enabled** during a match. **Expect:** the match stops, players are returned, and Start is hidden for everyone.
2. Restart the server. **Expect:** still off.

## Q6. Cheating attempts (SC-006)

From P1's console, check each of these:
- send `fire` 50 times in a second. **Expect:** at most the gear's rate counts;
- send `buy` for the Mailing-Tube with 1,000. **Expect:** refused;
- send a `state` 10 tiles away. **Expect:** corrected back;
- send a `fire` while tagged out. **Expect:** no effect.

**Automated:** `tests/integration/ws-arena.test.ts`.

## Q7. Performance (SC-005)

1. 10 tabs (5 versus 5) in a round. **Expect:** about 60 fps in first person for a player and for a non-player watching.
